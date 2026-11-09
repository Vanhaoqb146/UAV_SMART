"""Real-time exercise stage progression and corridor deviation evaluator."""

from __future__ import annotations

import math
import numpy as np

from uavsim.domain.types import (
    ExerciseProgressSnapshot,
    FlightEvent,
    VehicleState,
)
from uavsim.exercises.models import ExerciseDefinition


def _point_to_segment_dist(
    p: np.ndarray,
    a: np.ndarray,
    b: np.ndarray,
) -> float:
    ab = b - a
    denom = float(np.dot(ab, ab))
    if denom < 1e-8:
        return float(np.linalg.norm(p - a))
    t = float(np.clip(np.dot(p - a, ab) / denom, 0.0, 1.0))
    proj = a + t * ab
    return float(np.linalg.norm(p - proj))


class ExerciseRunner:
    """Tracks trainee progression through stages of an ExerciseDefinition."""

    def __init__(self, exercise: ExerciseDefinition) -> None:
        self.exercise = exercise
        self.stage_index: int = 0
        self.stage_hold_elapsed: float = 0.0
        self.completed: bool = False
        self.failed: bool = False
        self.fail_reason: str = ""
        self.prev_anchor: np.ndarray = np.array(exercise.start_pos, dtype=np.float64)

    def reset(self) -> None:
        self.stage_index = 0
        self.stage_hold_elapsed = 0.0
        self.completed = False
        self.failed = False
        self.fail_reason = ""
        self.prev_anchor = np.array(self.exercise.start_pos, dtype=np.float64)

    def update(
        self,
        state: VehicleState,
        dt: float,
    ) -> tuple[ExerciseProgressSnapshot, list[FlightEvent]]:
        events: list[FlightEvent] = []
        total = len(self.exercise.stages)

        if self.completed or self.failed:
            return self.snapshot(state), events

        if state.collided:
            self.failed = True
            self.fail_reason = "Va chạm chướng ngại vật hoặc chạm đất quá mạnh"
            events.append(
                FlightEvent(
                    t=state.t,
                    kind="danger",
                    code="COLLISION",
                    text=self.fail_reason,
                )
            )
            return self.snapshot(state), events

        if state.out_of_bounds:
            self.failed = True
            self.fail_reason = "Bay vượt ra ngoài giới hạn an toàn sân tập"
            events.append(
                FlightEvent(
                    t=state.t,
                    kind="danger",
                    code="OUT_OF_BOUNDS",
                    text=self.fail_reason,
                )
            )
            return self.snapshot(state), events

        if state.t > self.exercise.time_limit_sec:
            self.failed = True
            self.fail_reason = f"Hết thời gian giới hạn ({int(self.exercise.time_limit_sec)}s)"
            events.append(
                FlightEvent(
                    t=state.t,
                    kind="warning",
                    code="TIMEOUT",
                    text=self.fail_reason,
                )
            )
            return self.snapshot(state), events

        stage = self.exercise.stages[self.stage_index]
        pos_np = np.array(state.pos, dtype=np.float64)
        tgt_np = np.array(stage.target, dtype=np.float64)
        dist_3d = float(np.linalg.norm(pos_np - tgt_np))
        dist_xy = float(math.hypot(state.pos[0] - stage.target[0], state.pos[1] - stage.target[1]))

        stage_done = False
        if stage.kind in ("reach", "hold"):
            if dist_3d <= stage.radius:
                self.stage_hold_elapsed += dt
                if self.stage_hold_elapsed >= stage.hold_sec:
                    stage_done = True
            else:
                self.stage_hold_elapsed = max(0.0, self.stage_hold_elapsed - 0.5 * dt)
        elif stage.kind == "land":
            if state.on_ground and dist_xy <= stage.radius:
                if abs(state.vel[2]) <= stage.max_landing_vz:
                    stage_done = True
                else:
                    self.failed = True
                    self.fail_reason = f"Hạ cánh quá mạnh (|vz|={abs(state.vel[2]):.2f} m/s > {stage.max_landing_vz} m/s)"
                    events.append(
                        FlightEvent(
                            t=state.t,
                            kind="danger",
                            code="HARD_LANDING",
                            text=self.fail_reason,
                        )
                    )
                    return self.snapshot(state), events

        if stage_done:
            events.append(
                FlightEvent(
                    t=state.t,
                    kind="success",
                    code="STAGE_COMPLETED",
                    text=f"Hoàn thành mốc {self.stage_index + 1}/{total}: {stage.name}",
                )
            )
            self.prev_anchor = tgt_np
            self.stage_index += 1
            self.stage_hold_elapsed = 0.0
            if self.stage_index >= total:
                self.completed = True
                events.append(
                    FlightEvent(
                        t=state.t,
                        kind="success",
                        code="EXERCISE_COMPLETED",
                        text=f"Hoàn thành xuất sắc bài tập {self.exercise.code}!",
                    )
                )

        return self.snapshot(state), events

    def snapshot(self, state: VehicleState) -> ExerciseProgressSnapshot:
        total = len(self.exercise.stages)
        idx = min(self.stage_index, total - 1)
        stage = self.exercise.stages[idx]
        pos_np = np.array(state.pos, dtype=np.float64)
        tgt_np = np.array(stage.target, dtype=np.float64)
        seg_dist = _point_to_segment_dist(pos_np, self.prev_anchor, tgt_np)
        corridor_dev = max(0.0, seg_dist - self.exercise.corridor_radius)

        if self.completed:
            prog = 1.0
            hint = "Đã hoàn thành bài tập! Nhấn 'Kết thúc & Chấm điểm' để xem kết quả."
        elif self.failed:
            prog = float(self.stage_index) / float(total)
            hint = f"Không đạt: {self.fail_reason}"
        else:
            hold_frac = 0.0
            if stage.hold_sec > 0.0:
                hold_frac = min(0.99, self.stage_hold_elapsed / stage.hold_sec)
            prog = (float(self.stage_index) + hold_frac) / float(total)
            hint = stage.hint
            if stage.hold_sec > 0.0 and self.stage_hold_elapsed > 0.05:
                rem = max(0.0, stage.hold_sec - self.stage_hold_elapsed)
                hint = f"{stage.hint} (Giữ thêm {rem:.1f}s)"

        return ExerciseProgressSnapshot(
            exercise_id=self.exercise.id,
            title=self.exercise.title,
            stage_index=min(self.stage_index, total),
            total_stages=total,
            progress=prog,
            hint=hint,
            target_pos=stage.target,
            corridor_deviation=corridor_dev,
            completed=self.completed,
            failed=self.failed,
            fail_reason=self.fail_reason,
        )
