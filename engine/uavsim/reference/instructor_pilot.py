"""Instructor Demonstration Pilot generating realistic StickInput commands.

Adapted with attribution from `drone-rl-lab/agents/controllers.py` (`PIDBaseline`
and `APFBaseline`) to fly any BT01-BT08 exercise smoothly as a live reference demo.
"""

from __future__ import annotations

import math
import numpy as np

from uavsim.domain.types import (
    ExerciseProgressSnapshot,
    FlightModeType,
    ObstacleCylinder,
    StickInput,
    VehicleState,
)


class InstructorDemoPilot:
    """Computes smooth StickInput commands to complete any exercise stage."""

    def __init__(self, mode: FlightModeType = FlightModeType.POSITION_HOLD) -> None:
        self.mode = mode
        self._prev_stick = StickInput(throttle=0.5, arm=True, mode_switch=self._switch_for_mode(mode))

    @staticmethod
    def _switch_for_mode(mode: FlightModeType) -> int:
        if mode == FlightModeType.CINE:
            return 3
        if mode == FlightModeType.POSITION_HOLD:
            return 0
        if mode == FlightModeType.ALTITUDE_HOLD:
            return 1
        return 2

    def compute_stick(
        self,
        state: VehicleState,
        snapshot: ExerciseProgressSnapshot,
        obstacles: list[ObstacleCylinder] | None = None,
    ) -> StickInput:
        mode_sw = self._switch_for_mode(self.mode)
        if snapshot.completed or snapshot.failed:
            return StickInput(throttle=0.5, yaw=0.0, pitch=0.0, roll=0.0, arm=True, mode_switch=mode_sw)

        tx, ty, tz = snapshot.target_pos
        px, py, pz = state.pos
        vx, vy, vz = state.vel
        yaw = state.rpy[2]

        ex = tx - px
        ey = ty - py
        ez = tz - pz

        # Artificial Potential Field (APF) obstacle repulsion in XY plane (Pillars, Trees, Buildings)
        rep_x = 0.0
        rep_y = 0.0
        for obs in obstacles or []:
            if pz > obs.height + 0.18:
                continue
            if obs.kind == "building":
                hx = (obs.sx if obs.sx > 0.0 else obs.radius * 2.0) * 0.5
                hy = (obs.sy if obs.sy > 0.0 else obs.radius * 2.0) * 0.5
                cx = max(obs.x - hx, min(obs.x + hx, px))
                cy = max(obs.y - hy, min(obs.y + hy, py))
                dx = px - cx
                dy = py - cy
                clearance = math.hypot(dx, dy)
                if 1e-4 < clearance < 0.95:
                    strength = 0.55 * (1.0 / clearance - 1.0 / 0.95) / (clearance * clearance)
                    rep_x += strength * dx
                    rep_y += strength * dy
            else:
                eff_r = (
                    max(obs.radius, obs.crown_radius)
                    if obs.kind == "tree" and pz >= obs.height * 0.30
                    else obs.radius
                )
                dx = px - obs.x
                dy = py - obs.y
                center_d = math.hypot(dx, dy)
                clearance = center_d - eff_r
                if 1e-4 < clearance < 0.92:
                    strength = 0.52 * (1.0 / clearance - 1.0 / 0.92) / (clearance * center_d)
                    rep_x += strength * dx
                    rep_y += strength * dy

        # Transform world XY error & velocity into heading-aligned forward/right frame
        cos_y = math.cos(yaw)
        sin_y = math.sin(yaw)
        err_fwd = (ex + rep_x) * cos_y + (ey + rep_y) * sin_y
        err_right = (ex + rep_x) * sin_y - (ey + rep_y) * cos_y
        v_fwd = vx * cos_y + vy * sin_y
        v_right = vx * sin_y - vy * cos_y

        # Vertical throttle command (ground pad or rooftop helipad)
        is_rooftop_target = any(
            obs.kind == "building"
            and abs(tx - obs.x) <= (obs.sx if obs.sx > 0.0 else obs.radius * 2.0) * 0.5
            and abs(ty - obs.y) <= (obs.sy if obs.sy > 0.0 else obs.radius * 2.0) * 0.5
            and abs(tz - obs.height) <= 0.12
            for obs in (obstacles or [])
        )
        is_landing_target = tz <= 0.08 or is_rooftop_target
        dist_xy = math.hypot(ex, ey)
        if is_landing_target and dist_xy > 0.42:
            # Align horizontally above landing pad before final touchdown descent
            ez = max(tz + 0.30, pz) - pz

        # When climbing significantly (e.g. over canopy or onto building roof), prioritize altitude gain first
        xy_climb_scale = 0.30 if ez > 0.55 else (0.55 if is_landing_target and dist_xy < 1.0 else 1.0)

        vz_des = float(np.clip(1.85 * ez - 0.15 * vz, -0.32 if is_landing_target else -0.85, 0.98))
        raw_throttle = float(np.clip(0.5 + vz_des / 2.0, 0.15, 0.90))

        kd_xy = 0.38 if (is_landing_target or dist_xy < 1.2) else 0.22
        if self.mode == FlightModeType.POSITION_HOLD:
            raw_pitch = float(np.clip((1.15 * err_fwd - kd_xy * v_fwd) * xy_climb_scale, -0.75, 0.75))
            raw_roll = float(np.clip((1.15 * err_right - kd_xy * v_right) * xy_climb_scale, -0.75, 0.75))
        else:
            # Altitude Hold / Angle: command tilt proportional to position & velocity error
            raw_pitch = float(np.clip(0.55 * err_fwd - 0.45 * v_fwd, -0.55, 0.55))
            raw_roll = float(np.clip(0.55 * err_right - 0.45 * v_right, -0.55, 0.55))

        # Exponential smoothing to mimic skilled human pilot stick smoothness
        alpha = 0.35
        smooth_stick = StickInput(
            throttle=(1.0 - alpha) * self._prev_stick.throttle + alpha * raw_throttle,
            yaw=0.0,
            pitch=(1.0 - alpha) * self._prev_stick.pitch + alpha * raw_pitch,
            roll=(1.0 - alpha) * self._prev_stick.roll + alpha * raw_roll,
            arm=True,
            mode_switch=mode_sw,
        ).clamped()
        self._prev_stick = smooth_stick
        return smooth_stick
