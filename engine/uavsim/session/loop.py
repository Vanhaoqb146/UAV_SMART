"""Real-time 60Hz session orchestrator with USB controller failsafe and demo pilot."""

from __future__ import annotations

import dataclasses
from datetime import datetime
from pathlib import Path

import math
import numpy as np

from uavsim.assessment.rubric import evaluate_session_rubric
from uavsim.domain.types import (
    ExerciseProgressSnapshot,
    FlightEvent,
    FlightModeType,
    LeadUavState,
    SessionConfig,
    StickInput,
    VehicleState,
)
from uavsim.exercises.models import load_exercise_catalog
from uavsim.exercises.runner import ExerciseRunner
from uavsim.flight_data.recorder import SessionRecorder
from uavsim.reference.instructor_pilot import InstructorDemoPilot
from uavsim.vehicle.pybullet_vehicle import PyBulletVehicle


def _default_switch_for_mode(mode: FlightModeType) -> int:
    if mode == FlightModeType.CINE:
        return 3
    if mode == FlightModeType.POSITION_HOLD:
        return 0
    if mode == FlightModeType.ALTITUDE_HOLD:
        return 1
    return 2


class FlightSession:
    """Manages one training flight session from takeoff to assessment."""

    def __init__(
        self,
        config: SessionConfig,
        session_id: str | None = None,
    ) -> None:
        self.config = config
        catalog = load_exercise_catalog()
        if config.exercise_id not in catalog:
            raise ValueError(f"Unknown exercise_id: {config.exercise_id}")
        self.exercise = catalog[config.exercise_id]

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        tag = "demo" if config.instructor_demo else config.student_id.lower()
        self.session_id = session_id or f"{ts}_{self.exercise.code.lower()}_{tag}"

        self.vehicle = PyBulletVehicle(
            initial_pos=self.exercise.start_pos,
            initial_yaw=self.exercise.start_yaw,
            ctrl_hz=config.ctrl_hz,
            pyb_hz=config.pyb_hz,
            mass_scale=config.mass_scale,
            base_wind_max=self.exercise.environment.wind_max * config.wind_scale,
            gust_sigma=self.exercise.environment.gust_sigma * config.wind_scale,
            obstacles=self.exercise.get_obstacles(),
            arena=self.exercise.get_arena_bounds(),
            seed=config.seed,
            default_mode=config.default_mode,
            speed_scale=self.exercise.environment.speed_scale,
        )
        self.runner = ExerciseRunner(self.exercise)
        self.recorder = SessionRecorder(self.session_id, config, self.exercise)
        self.demo_pilot = InstructorDemoPilot(mode=config.default_mode)

        init_sw = _default_switch_for_mode(config.default_mode)
        self.latest_stick = StickInput(throttle=0.5, arm=True, mode_switch=init_sw)
        self.latest_seq: int = 0
        self.latest_t_client: float = 0.0
        self.time_since_input_sec: float = 0.0
        self.in_failsafe: bool = False
        self.lead_guide_enabled: bool = True
        self.paused: bool = False
        self.ended: bool = False
        self._takeoff_logged: bool = False
        self._pilot_moved_stick: bool = bool(config.instructor_demo)

    def receive_input(
        self,
        stick: StickInput,
        seq: int = 0,
        t_client: float = 0.0,
    ) -> None:
        self.latest_stick = stick.clamped()
        self.latest_seq = int(seq)
        self.latest_t_client = float(t_client)
        self.time_since_input_sec = 0.0
        if (
            abs(self.latest_stick.throttle - 0.5) > 0.035
            or abs(self.latest_stick.yaw) > 0.035
            or abs(self.latest_stick.pitch) > 0.035
            or abs(self.latest_stick.roll) > 0.035
        ):
            self._pilot_moved_stick = True
        if self.in_failsafe:
            self.in_failsafe = False
            ev = FlightEvent(
                t=self.vehicle.sim_time,
                kind="info",
                code="FAILSAFE_RECOVERED",
                text="Đã khôi phục tín hiệu tay điều khiển",
            )
            self.recorder.record_events([ev])

    def reset(self) -> dict[str, object]:
        state = self.vehicle.reset(seed=self.config.seed)
        self.runner.reset()
        self.recorder = SessionRecorder(self.session_id, self.config, self.exercise)
        self.time_since_input_sec = 0.0
        self.in_failsafe = False
        self.paused = False
        self.ended = False
        self._takeoff_logged = False
        self._pilot_moved_stick = bool(self.config.instructor_demo)
        snap = self.runner.snapshot(state)
        return self._build_ws_state(state, snap, [])

    def step_tick(self, advance_input_watchdog: bool = True) -> dict[str, object]:
        state = self.vehicle.get_state()
        snap = self.runner.snapshot(state)
        if self.paused or self.ended:
            return self._build_ws_state(state, snap, [])

        if not self.config.instructor_demo and not self._pilot_moved_stick:
            standby_snap = dataclasses.replace(
                snap,
                hint="[Sẵn sàng trên bãi đáp] Đẩy cần Ga (W / Cần trái) để bắt đầu tính giờ bay",
            )
            return self._build_ws_state(state, standby_snap, [])

        dt = self.vehicle.dt_ctrl
        step_events: list[FlightEvent] = []

        if self.config.instructor_demo:
            stick_used = self.demo_pilot.compute_stick(
                state=state,
                snapshot=snap,
                obstacles=self.exercise.get_obstacles(),
            )
            self.latest_stick = stick_used
            override_mode = None
        else:
            if advance_input_watchdog:
                self.time_since_input_sec += dt
            if (
                self.time_since_input_sec > self.config.failsafe_timeout_sec
                and not self.in_failsafe
            ):
                self.in_failsafe = True
                step_events.append(
                    FlightEvent(
                        t=state.t,
                        kind="warning",
                        code="FAILSAFE_TRIGGERED",
                        text="Mất tín hiệu tay cầm > 0.5s — Tự động giữ vị trí & hạ cánh an toàn",
                    )
                )
            stick_used = self.latest_stick
            override_mode = FlightModeType.FAILSAFE if self.in_failsafe else None

        next_state = self.vehicle.step(stick_used, override_mode=override_mode)
        if not self._takeoff_logged and next_state.pos[2] >= 0.25:
            self._takeoff_logged = True
            step_events.append(
                FlightEvent(
                    t=next_state.t,
                    kind="info",
                    code="TAKEOFF",
                    text="UAV đã rời mặt đất",
                )
            )

        next_snap, ex_events = self.runner.update(next_state, dt)
        all_events = step_events + ex_events

        self.recorder.record_frame(next_state, stick_used, next_snap)
        if all_events:
            self.recorder.record_events(all_events)

        if next_snap.completed or next_snap.failed:
            self.ended = True

        return self._build_ws_state(next_state, next_snap, all_events)

    def finalize(self, save_dir: Path | None = None) -> dict[str, object]:
        self.ended = True
        state = self.vehicle.get_state()
        snap = self.runner.snapshot(state)
        if len(self.recorder.frames) == 0:
            self.recorder.record_frame(state, self.latest_stick, snap)
        report = evaluate_session_rubric(
            exercise=self.exercise,
            frames=self.recorder.frames,
            events=self.recorder.events,
            stage_index=snap.stage_index,
            completed=snap.completed,
            crashed=bool(state.collided or snap.failed and "Va chạm" in snap.fail_reason),
            ctrl_hz=self.config.ctrl_hz,
        )
        session_dict = self.recorder.finalize(
            completed=snap.completed,
            crashed=bool(state.collided),
            reason=snap.fail_reason,
            report=report,
        )
        if save_dir is not None and len(self.recorder.frames) > 0:
            self.recorder.save(save_dir)
        return session_dict

    def close(self) -> None:
        self.vehicle.close()

    def compute_lead_uav_state(
        self, state: VehicleState, snap: ExerciseProgressSnapshot
    ) -> LeadUavState:
        anchor = np.array(self.runner.prev_anchor, dtype=np.float64)
        target = np.array(snap.target_pos, dtype=np.float64)
        drone_pos = np.array(state.pos, dtype=np.float64)

        path_vec = target - anchor
        path_len = float(np.linalg.norm(path_vec))
        if path_len < 1e-4:
            return LeadUavState(
                pos=(float(target[0]), float(target[1]), float(target[2])),
                rpy=(0.0, 0.0, 0.0),
            )

        path_unit = path_vec / path_len
        proj_dist = float(np.dot(drone_pos - anchor, path_unit))
        lead_dist = max(0.15, min(path_len, proj_dist + 1.35))
        lead_pos = anchor + lead_dist * path_unit

        lead_yaw = float(math.atan2(path_unit[1], path_unit[0]))
        lead_pitch = 0.04
        lead_roll = 0.0
        return LeadUavState(
            pos=(float(lead_pos[0]), float(lead_pos[1]), float(lead_pos[2])),
            rpy=(lead_roll, lead_pitch, lead_yaw),
        )

    def _build_ws_state(
        self,
        state,
        snap,
        new_events: list[FlightEvent],
    ) -> dict[str, object]:
        lead_data = (
            self.compute_lead_uav_state(state, snap).to_dict()
            if self.lead_guide_enabled and not snap.completed and not snap.failed
            else None
        )
        return {
            "type": "state",
            "schema": "uav-ws/1",
            "session_id": self.session_id,
            "seq_ack": self.latest_seq,
            "t_client": self.latest_t_client,
            "t": round(state.t, 3),
            "pos": [round(c, 4) for c in state.pos],
            "vel": [round(c, 4) for c in state.vel],
            "rpy": [round(c, 4) for c in state.rpy],
            "wind": [round(c, 3) for c in state.wind_vel],
            "sticks": self.latest_stick.as_list(),
            "mode": state.mode.value,
            "armed": state.armed,
            "on_ground": state.on_ground,
            "collided": state.collided,
            "failsafe": self.in_failsafe,
            "instructor_demo": self.config.instructor_demo,
            "lead_guide_enabled": self.lead_guide_enabled,
            "lead_uav": lead_data,
            "min_obstacle_dist": round(state.min_obstacle_dist, 3),
            "exercise": snap.to_dict(),
            "events": [ev.to_dict() for ev in new_events],
        }
