"""Unit & integration tests for the 3 flight modes: Position Hold, Altitude Hold, Angle."""

from __future__ import annotations

import math
import numpy as np

from uavsim.domain.types import FlightModeType, StickInput
from uavsim.vehicle.pybullet_vehicle import PyBulletVehicle


def test_position_hold_takeoff_and_hover_stability() -> None:
    vehicle = PyBulletVehicle(
        initial_pos=(0.0, 0.0, 0.05),
        default_mode=FlightModeType.POSITION_HOLD,
        seed=42,
    )
    try:
        # Climb for 2.0 seconds (120 ticks at 60Hz)
        for _ in range(120):
            state = vehicle.step(StickInput(throttle=0.80, arm=True, mode_switch=0))
        assert state.pos[2] > 0.65

        # Release sticks to neutral for 3.0 seconds (180 ticks)
        anchor = None
        for i in range(180):
            state = vehicle.step(StickInput(throttle=0.50, arm=True, mode_switch=0))
            if i == 30:
                anchor = np.array(state.pos)
        assert anchor is not None
        final_pos = np.array(state.pos)
        drift = float(np.linalg.norm(final_pos - anchor))
        assert drift < 0.08, f"Position hold drift too large: {drift:.4f}m"
    finally:
        vehicle.close()


def test_altitude_hold_forward_pitch_keeps_altitude() -> None:
    vehicle = PyBulletVehicle(
        initial_pos=(0.0, 0.0, 1.2),
        default_mode=FlightModeType.ALTITUDE_HOLD,
        seed=42,
    )
    try:
        # Stabilize at 1.2m first
        for _ in range(30):
            state = vehicle.step(StickInput(throttle=0.50, pitch=0.0, roll=0.0, arm=True, mode_switch=1))
        z_start = state.pos[2]

        # Command forward pitch for 1.5 seconds (90 ticks) while keeping throttle centered
        for _ in range(90):
            state = vehicle.step(StickInput(throttle=0.50, pitch=0.35, roll=0.0, arm=True, mode_switch=1))

        assert state.pos[0] > 0.35, f"Expected forward motion in +X, got x={state.pos[0]:.3f}"
        assert abs(state.pos[2] - z_start) < 0.12, f"Altitude hold deviated too much: {state.pos[2]:.3f} vs {z_start:.3f}"
    finally:
        vehicle.close()


def test_angle_mode_roll_response() -> None:
    vehicle = PyBulletVehicle(
        initial_pos=(0.0, 0.0, 1.5),
        default_mode=FlightModeType.ANGLE,
        seed=42,
    )
    try:
        # Command 50% right roll in Angle Mode for 0.5 seconds (30 ticks)
        for _ in range(30):
            state = vehicle.step(StickInput(throttle=0.52, roll=0.5, pitch=0.0, arm=True, mode_switch=2))
        expected_roll = 0.5 * math.radians(30.0)
        assert abs(state.rpy[0] - expected_roll) < math.radians(5.0)
    finally:
        vehicle.close()


def test_cine_mode_ultra_smooth_self_balancing() -> None:
    vehicle = PyBulletVehicle(
        initial_pos=(0.0, 0.0, 1.2),
        default_mode=FlightModeType.CINE,
        seed=42,
    )
    try:
        max_tilt_seen = 0.0
        # Full forward stick in C-Mode (mode_switch=3) for 1.5s
        for _ in range(90):
            state = vehicle.step(StickInput(throttle=0.50, pitch=1.0, roll=0.0, arm=True, mode_switch=3))
            tilt = max(abs(state.rpy[0]), abs(state.rpy[1]))
            max_tilt_seen = max(max_tilt_seen, tilt)

        assert state.mode == FlightModeType.CINE
        assert state.pos[0] > 0.4, f"Expected smooth forward progress in CINE mode, got x={state.pos[0]:.3f}"
        assert max_tilt_seen <= math.radians(10.5), f"CINE mode exceeded gentle tilt limit: {math.degrees(max_tilt_seen):.2f} deg"

        # Release stick and verify smooth self-leveling (< 1.0 deg)
        for _ in range(90):
            state = vehicle.step(StickInput(throttle=0.50, pitch=0.0, roll=0.0, arm=True, mode_switch=3))
        assert abs(state.rpy[0]) < math.radians(1.0)
        assert abs(state.rpy[1]) < math.radians(1.0)
    finally:
        vehicle.close()
