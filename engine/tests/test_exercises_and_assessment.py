"""Tests for BT01-BT08 exercise catalog, Instructor Demo Pilot, and Rubric Assessment."""

from __future__ import annotations

import math

from uavsim.domain.types import FlightModeType, SessionConfig, StickInput
from uavsim.exercises.models import load_exercise_catalog
from uavsim.session.loop import FlightSession


def test_catalog_contains_all_thirteen_exercises() -> None:
    catalog = load_exercise_catalog()
    expected = {
        "BT01", "BT02", "BT03", "BT04", "BT05", "BT06",
        "BT07", "BT08", "BT09", "BT10", "BT11", "BT12", "BT13",
    }
    assert set(catalog.keys()) == expected
    for code, ex in catalog.items():
        assert len(ex.stages) >= 2, f"{code} must have at least 2 stages"
        assert ex.time_limit_sec >= 60
    assert len(catalog["BT09"].get_obstacles()) >= 40
    assert any(o.kind == "building" for o in catalog["BT10"].get_obstacles())
    assert catalog["BT12"].environment.map_preset == "landmark81"
    assert catalog["BT13"].environment.map_preset == "landmark81"


def test_instructor_demo_completes_bt01_with_high_rubric_score() -> None:
    cfg = SessionConfig(
        exercise_id="BT01",
        default_mode=FlightModeType.POSITION_HOLD,
        instructor_demo=True,
        seed=9000,
    )
    session = FlightSession(cfg)
    try:
        for _ in range(1200):
            session.step_tick(advance_input_watchdog=False)
            if session.ended:
                break
        result = session.finalize()
    finally:
        session.close()

    assert result["outcome"]["completed"] is True
    assert result["outcome"]["crashed"] is False
    assess = result["assessment"]
    assert assess["total_score"] >= 80.0
    assert assess["passed"] is True


def test_rubric_detects_overcontrol_oscillation() -> None:
    cfg = SessionConfig(
        exercise_id="BT01",
        default_mode=FlightModeType.POSITION_HOLD,
        instructor_demo=False,
        seed=9000,
    )
    session = FlightSession(cfg)
    try:
        # Simulate a student oscillating pitch/roll sticks rapidly at 5Hz
        for i in range(180):
            osc = 0.75 * math.sin(i * 0.65)
            stick = StickInput(throttle=0.60, pitch=osc, roll=-osc, arm=True, mode_switch=0)
            session.receive_input(stick, seq=i + 1)
            session.step_tick()
        result = session.finalize()
    finally:
        session.close()

    assess = result["assessment"]
    metrics = assess["metrics"]
    assert metrics["overcontrol_index"] > 2.0
    assert any("Over-control" in d for d in assess["diagnostics"])
