"""Deterministic replay verifier: re-simulates recorded StickInput sequence from seed."""

from __future__ import annotations

import numpy as np

from uavsim.domain.types import FlightModeType, StickInput
from uavsim.exercises.models import load_exercise_catalog
from uavsim.vehicle.pybullet_vehicle import PyBulletVehicle


def _int_to_mode(mode_int: int) -> FlightModeType:
    if mode_int == 0:
        return FlightModeType.POSITION_HOLD
    if mode_int == 1:
        return FlightModeType.ALTITUDE_HOLD
    if mode_int == 2:
        return FlightModeType.ANGLE
    return FlightModeType.FAILSAFE


def verify_deterministic_replay(
    session_data: dict[str, object],
    tolerance_m: float = 1e-4,
) -> dict[str, object]:
    """Re-run PyBullet physics from the session's seed + inputs and check position error."""
    ex_info = session_data["exercise"]  # type: ignore[index]
    eng_info = session_data["engine"]   # type: ignore[index]
    veh_info = session_data["vehicle"]  # type: ignore[index]
    frames = list(session_data["frames"])  # type: ignore[arg-type]

    catalog = load_exercise_catalog()
    ex = catalog[str(ex_info["id"])]
    wind_scale = float(ex_info.get("wind_scale", 1.0))
    init_mode_str = str(ex_info.get("default_mode", ex.default_mode.value))
    init_mode = FlightModeType(init_mode_str)

    vehicle = PyBulletVehicle(
        initial_pos=ex.start_pos,
        initial_yaw=ex.start_yaw,
        ctrl_hz=int(eng_info["ctrl_hz"]),
        pyb_hz=int(eng_info["pyb_hz"]),
        mass_scale=float(veh_info["mass_scale"]),
        base_wind_max=ex.environment.wind_max * wind_scale,
        gust_sigma=ex.environment.gust_sigma * wind_scale,
        obstacles=ex.get_obstacles(),
        arena=ex.get_arena_bounds(),
        seed=int(ex_info["seed"]),
        default_mode=init_mode,
        speed_scale=ex.environment.speed_scale,
    )

    max_err = 0.0
    try:
        for f in frames:
            u_raw = f["in"]
            stick = StickInput(
                throttle=float(u_raw[0]),
                yaw=float(u_raw[1]),
                pitch=float(u_raw[2]),
                roll=float(u_raw[3]),
                arm=bool(f.get("arm", True)),
                mode_switch=int(f.get("mode_sw", 0)),
            )
            override = FlightModeType.FAILSAFE if int(f.get("mode", 0)) == 3 else None
            state = vehicle.step(stick, override_mode=override)
            rec_pos = np.array(f["p"], dtype=np.float64)
            sim_pos = np.array(state.pos, dtype=np.float64)
            err = float(np.linalg.norm(rec_pos - sim_pos))
            if err > max_err:
                max_err = err
    finally:
        vehicle.close()

    return {
        "deterministic": bool(max_err <= tolerance_m),
        "max_position_error_m": round(max_err, 7),
        "frames_verified": len(frames),
    }
