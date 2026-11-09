"""Session telemetry recorder producing `uav-session/1` JSON files."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from uavsim.assessment.rubric import AssessmentReport
from uavsim.domain.types import (
    ExerciseProgressSnapshot,
    FlightEvent,
    FlightModeType,
    SessionConfig,
    StickInput,
    VehicleState,
)
from uavsim.exercises.models import ExerciseDefinition


def _mode_to_int(mode: FlightModeType) -> int:
    if mode == FlightModeType.POSITION_HOLD:
        return 0
    if mode == FlightModeType.ALTITUDE_HOLD:
        return 1
    if mode == FlightModeType.ANGLE:
        return 2
    return 3  # failsafe


class SessionRecorder:
    """Captures 60Hz flight frames, events, and rubric assessment into `uav-session/1`."""

    def __init__(
        self,
        session_id: str,
        config: SessionConfig,
        exercise: ExerciseDefinition,
    ) -> None:
        self.session_id = session_id
        self.config = config
        self.exercise = exercise
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.frames: list[dict[str, object]] = []
        self.events: list[dict[str, object]] = []
        self.outcome: dict[str, object] = {
            "completed": False,
            "crashed": False,
            "reason": "",
        }
        self.assessment: dict[str, object] | None = None

    def record_frame(
        self,
        state: VehicleState,
        stick: StickInput,
        progress: ExerciseProgressSnapshot,
    ) -> None:
        frame: dict[str, object] = {
            "t": round(state.t, 4),
            "p": [round(c, 7) for c in state.pos],
            "v": [round(c, 6) for c in state.vel],
            "rpy": [round(c, 6) for c in state.rpy],
            "in": stick.as_list(),
            "arm": bool(stick.arm),
            "mode_sw": int(stick.mode_switch),
            "mode": _mode_to_int(state.mode),
            "wind": [round(c, 4) for c in state.wind_vel],
            "tgt": [round(c, 4) for c in progress.target_pos],
            "cdev": round(progress.corridor_deviation, 4),
            "odist": round(state.min_obstacle_dist, 4),
            "stage": int(progress.stage_index),
        }
        self.frames.append(frame)

    def record_events(self, events: list[FlightEvent]) -> None:
        for ev in events:
            self.events.append(ev.to_dict())

    def finalize(
        self,
        completed: bool,
        crashed: bool,
        reason: str,
        report: AssessmentReport,
    ) -> dict[str, object]:
        self.outcome = {
            "completed": bool(completed),
            "crashed": bool(crashed),
            "reason": str(reason),
        }
        self.assessment = report.to_dict()
        return self.to_dict()

    def trajectory_hash(self) -> str:
        """Compute deterministic SHA-256 fingerprint over rounded frame positions."""
        h = hashlib.sha256()
        for f in self.frames:
            p = f["p"]
            h.update(f"{p[0]:.4f},{p[1]:.4f},{p[2]:.4f};".encode("ascii"))
        return h.hexdigest()

    def to_dict(self) -> dict[str, object]:
        return {
            "schema": "uav-session/1",
            "session_id": self.session_id,
            "started_at": self.started_at,
            "student": {
                "id": self.config.student_id,
                "name": self.config.student_name,
                "instructor_demo": self.config.instructor_demo,
            },
            "engine": {
                "version": "1.0.0",
                "physics": "pybullet-3.25",
                "gpd_commit": "348b5c18a4bb770a48928b9d044decf77ca33302",
                "ctrl_hz": self.config.ctrl_hz,
                "pyb_hz": self.config.pyb_hz,
            },
            "vehicle": {
                "profile": self.config.vehicle_profile,
                "mass_scale": self.config.mass_scale,
            },
            "exercise": {
                "id": self.exercise.id,
                "code": self.exercise.code,
                "title": self.exercise.title,
                "version": self.exercise.version,
                "seed": self.config.seed,
                "wind_scale": self.config.wind_scale,
                "default_mode": self.config.default_mode.value,
                "corridor_radius": self.exercise.corridor_radius,
            },
            "input_device": {
                "id": self.config.device_id,
            },
            "world": {
                "start": list(self.exercise.start_pos),
                "waypoints": [list(st.target) for st in self.exercise.stages],
                "stages": [
                    {
                        "name": st.name,
                        "kind": st.kind,
                        "target": list(st.target),
                        "radius": st.radius,
                        "hold_sec": st.hold_sec,
                    }
                    for st in self.exercise.stages
                ],
                "obstacles": [obs.to_dict() for obs in self.exercise.get_obstacles()],
                "arena": {"x": [-6.0, 6.0], "y": [-6.0, 6.0], "z_max": 4.5},
            },
            "trajectory_sha256": self.trajectory_hash(),
            "frames": self.frames,
            "events": self.events,
            "outcome": self.outcome,
            "assessment": self.assessment,
        }

    def save(self, directory: Path) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        out_path = directory / f"{self.session_id}.json"
        out_path.write_text(
            json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return out_path
