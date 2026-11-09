"""Tests for 3D Field Missions (BT09 Forest, BT10 Urban Rooftop, BT11 Long Patrol)."""

from __future__ import annotations

from uavsim.domain.types import FlightModeType, ObstacleCylinder, SessionConfig
from uavsim.environment.obstacles import compute_min_obstacle_distance, is_rooftop_touchdown
from uavsim.exercises.models import load_exercise_catalog
from uavsim.session.loop import FlightSession


def test_tree_and_building_clearance_and_rooftop_detection() -> None:
    tree = ObstacleCylinder(
        x=0.0, y=0.0, radius=0.18, height=3.6, kind="tree", crown_radius=0.60
    )
    building = ObstacleCylinder(
        x=5.0, y=0.0, radius=1.0, height=3.0, kind="building", sx=2.0, sy=2.0
    )
    # Near tree canopy at z = 2.6m (crown center = 0.72 * 3.6 = 2.592m)
    d_canopy = compute_min_obstacle_distance((0.8, 0.0, 2.59), [tree])
    assert 0.10 <= d_canopy <= 0.20

    # Near building side wall at x = 3.8m (wall is at x = 4.0m)
    d_wall = compute_min_obstacle_distance((3.8, 0.0, 1.5), [building])
    assert 0.10 <= d_wall <= 0.20

    # On top of building roof (x=5.0, y=0.0, z=3.02m) -> rooftop touchdown True
    assert is_rooftop_touchdown((5.0, 0.0, 3.02), [building]) is True
    # Against side of building (x=3.95, y=0.0, z=1.5m) -> rooftop touchdown False
    assert is_rooftop_touchdown((3.95, 0.0, 1.5), [building]) is False


def test_deterministic_forest_generation_in_bt09() -> None:
    catalog = load_exercise_catalog()
    ex9 = catalog["BT09"]
    obs1 = ex9.get_obstacles()
    obs2 = ex9.get_obstacles()
    assert len(obs1) >= 45
    assert obs1 == obs2
    assert all(o.kind == "tree" for o in obs1)


def test_instructor_demo_completes_bt09_forest_and_bt10_rooftop() -> None:
    for ex_id in ("BT09", "BT10", "BT11", "BT12", "BT13"):
        cfg = SessionConfig(
            exercise_id=ex_id,
            default_mode=FlightModeType.POSITION_HOLD,
            instructor_demo=True,
            seed=9000,
        )
        session = FlightSession(cfg)
        try:
            for _ in range(3600):
                session.step_tick(advance_input_watchdog=False)
                if session.ended:
                    break
            result = session.finalize()
        finally:
            session.close()

        assert result["outcome"]["crashed"] is False, f"{ex_id} crashed: {result['outcome']}"
        assert result["outcome"]["completed"] is True, f"{ex_id} did not complete: {result['outcome']}"
