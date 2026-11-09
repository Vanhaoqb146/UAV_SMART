"""Tests for deterministic session replay and CSV/Parquet/drone-traj export."""

from __future__ import annotations

from pathlib import Path

from uavsim.domain.types import FlightModeType, SessionConfig, StickInput
from uavsim.flight_data.exporter import (
    export_session_csv,
    export_session_parquet,
    to_legacy_drone_traj,
)
from uavsim.flight_data.replay import verify_deterministic_replay
from uavsim.session.loop import FlightSession


def test_replay_determinism_and_exporters(tmp_path: Path) -> None:
    cfg = SessionConfig(
        exercise_id="BT03",  # Includes Ornstein-Uhlenbeck wind
        default_mode=FlightModeType.ALTITUDE_HOLD,
        seed=777,
        wind_scale=1.0,
    )
    session = FlightSession(cfg)
    try:
        for i in range(90):
            stick = StickInput(
                throttle=0.65 if i < 40 else 0.50,
                pitch=0.15 if 20 <= i < 60 else 0.0,
                roll=-0.10 if 30 <= i < 70 else 0.0,
                arm=True,
                mode_switch=1,
            )
            session.receive_input(stick, seq=i + 1)
            session.step_tick()
        session_data = session.finalize(save_dir=tmp_path)
    finally:
        session.close()

    # Verify deterministic replay from recorded inputs + seed
    replay_res = verify_deterministic_replay(session_data, tolerance_m=1e-6)
    assert replay_res["deterministic"] is True
    assert replay_res["max_position_error_m"] < 1e-6
    assert replay_res["frames_verified"] == 90

    # Verify CSV, Parquet, and legacy drone-traj/1 exports
    csv_file = export_session_csv(session_data, tmp_path / "out.csv")
    pq_file = export_session_parquet(session_data, tmp_path / "out.parquet")
    legacy = to_legacy_drone_traj(session_data)

    assert csv_file.is_file() and csv_file.stat().st_size > 100
    assert pq_file.is_file() and pq_file.stat().st_size > 100
    assert legacy["schema"] == "drone-traj/1"
    assert len(legacy["frames"]) == 90
