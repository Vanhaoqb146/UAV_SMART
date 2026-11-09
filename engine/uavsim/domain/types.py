"""Pure domain models and value objects for UAV simulation, input, and telemetry."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class FlightModeType(str, Enum):
    CINE = "cine"
    POSITION_HOLD = "position_hold"
    ALTITUDE_HOLD = "altitude_hold"
    ANGLE = "angle"
    FAILSAFE = "failsafe"


def mode_from_switch(mode_switch: int) -> FlightModeType:
    if mode_switch == 0:
        return FlightModeType.POSITION_HOLD
    if mode_switch == 1:
        return FlightModeType.ALTITUDE_HOLD
    if mode_switch == 2:
        return FlightModeType.ANGLE
    if mode_switch == 3:
        return FlightModeType.CINE
    return FlightModeType.POSITION_HOLD


@dataclass(frozen=True)
class StickInput:
    """Normalized 4-axis student controller input + arm & flight mode switch."""

    throttle: float = 0.0  # [0.0, 1.0]; 0.5 is hover neutral in position/altitude hold
    yaw: float = 0.0       # [-1.0, 1.0]; positive = counter-clockwise / left or right yaw
    pitch: float = 0.0     # [-1.0, 1.0]; positive = pitch forward (+X in body frame)
    roll: float = 0.0      # [-1.0, 1.0]; positive = roll right (+Y/-Y in body frame)
    arm: bool = True
    mode_switch: int = 0   # 0: position_hold, 1: altitude_hold, 2: angle, 3: cine

    def clamped(self) -> StickInput:
        return StickInput(
            throttle=max(0.0, min(1.0, float(self.throttle))),
            yaw=max(-1.0, min(1.0, float(self.yaw))),
            pitch=max(-1.0, min(1.0, float(self.pitch))),
            roll=max(-1.0, min(1.0, float(self.roll))),
            arm=bool(self.arm),
            mode_switch=int(max(0, min(3, self.mode_switch))),
        )

    def as_list(self) -> list[float]:
        return [
            round(self.throttle, 6),
            round(self.yaw, 6),
            round(self.pitch, 6),
            round(self.roll, 6),
        ]


@dataclass(frozen=True)
class ObstacleCylinder:
    x: float
    y: float
    radius: float = 0.22
    height: float = 2.6
    kind: str = "pillar"       # "pillar" | "tree" | "building"
    sx: float = 0.0            # Box X width for "building"
    sy: float = 0.0            # Box Y depth for "building"
    crown_radius: float = 0.0  # Canopy radius for "tree"

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {
            "x": round(float(self.x), 3),
            "y": round(float(self.y), 3),
            "r": round(float(self.radius), 3),
            "h": round(float(self.height), 3),
            "kind": self.kind,
        }
        if self.sx > 0.0:
            d["sx"] = round(float(self.sx), 3)
        if self.sy > 0.0:
            d["sy"] = round(float(self.sy), 3)
        if self.crown_radius > 0.0:
            d["crown_r"] = round(float(self.crown_radius), 3)
        return d


@dataclass(frozen=True)
class ArenaBounds:
    x_min: float = -6.0
    x_max: float = 6.0
    y_min: float = -6.0
    y_max: float = 6.0
    z_max: float = 4.5

    def contains(self, pos: tuple[float, float, float]) -> bool:
        x, y, z = pos
        return (
            self.x_min <= x <= self.x_max
            and self.y_min <= y <= self.y_max
            and -0.05 <= z <= self.z_max
        )

    def to_dict(self) -> dict[str, list[float] | float]:
        return {
            "x": [self.x_min, self.x_max],
            "y": [self.y_min, self.y_max],
            "z_max": self.z_max,
        }


@dataclass(frozen=True)
class FlightEvent:
    t: float
    kind: Literal["info", "warning", "danger", "success"]
    code: str
    text: str

    def to_dict(self) -> dict[str, object]:
        return {
            "t": round(self.t, 3),
            "kind": self.kind,
            "code": self.code,
            "text": self.text,
        }


@dataclass(frozen=True)
class ExerciseProgressSnapshot:
    exercise_id: str
    title: str
    stage_index: int
    total_stages: int
    progress: float
    hint: str
    target_pos: tuple[float, float, float]
    corridor_deviation: float = 0.0
    completed: bool = False
    failed: bool = False
    fail_reason: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.exercise_id,
            "title": self.title,
            "stage_index": self.stage_index,
            "total_stages": self.total_stages,
            "progress": round(self.progress, 3),
            "hint": self.hint,
            "target_pos": [round(c, 3) for c in self.target_pos],
            "corridor_deviation": round(self.corridor_deviation, 3),
            "completed": self.completed,
            "failed": self.failed,
            "fail_reason": self.fail_reason,
        }


@dataclass(frozen=True)
class LeadUavState:
    """Ideal guide position and attitude for Lead UAV (UAV Dẫn đường)."""
    pos: tuple[float, float, float]
    rpy: tuple[float, float, float]

    def to_dict(self) -> dict[str, list[float]]:
        return {
            "pos": [round(c, 4) for c in self.pos],
            "rpy": [round(c, 4) for c in self.rpy],
        }


@dataclass(frozen=True)
class VehicleState:
    t: float
    pos: tuple[float, float, float]
    vel: tuple[float, float, float]
    rpy: tuple[float, float, float]
    ang_vel: tuple[float, float, float]
    quat: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 1.0)
    rpm: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    armed: bool = True
    mode: FlightModeType = FlightModeType.POSITION_HOLD
    on_ground: bool = True
    collided: bool = False
    out_of_bounds: bool = False
    wind_vel: tuple[float, float, float] = (0.0, 0.0, 0.0)
    min_obstacle_dist: float = 99.0


@dataclass
class SessionConfig:
    exercise_id: str = "BT01"
    student_id: str = "HV001"
    student_name: str = "Học viên Thực hành"
    vehicle_profile: str = "cf2x"
    default_mode: FlightModeType = FlightModeType.POSITION_HOLD
    seed: int = 9000
    wind_scale: float = 1.0
    mass_scale: float = 1.0
    instructor_demo: bool = False
    device_id: str = "Keyboard / USB Controller"
    ctrl_hz: int = 60
    pyb_hz: int = 240
    failsafe_timeout_sec: float = 0.5
    extra_tags: dict[str, str] = field(default_factory=dict)
