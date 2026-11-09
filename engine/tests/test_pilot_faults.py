"""Tests for the 6 Vietnamese stick-fault detectors and first-stick-move auto-start."""

from __future__ import annotations

import math

from uavsim.domain.types import FlightModeType, SessionConfig, StickInput
from uavsim.session.loop import FlightSession


def _run(sticks: list[StickInput], exercise_id: str = "BT01") -> dict:
    cfg = SessionConfig(
        exercise_id=exercise_id,
        default_mode=FlightModeType.POSITION_HOLD,
        seed=9000,
    )
    session = FlightSession(cfg)
    try:
        for i, s in enumerate(sticks):
            session.receive_input(s, seq=i + 1)
            session.step_tick()
        return session.finalize()
    finally:
        session.close()


def test_smooth_climb_has_no_tremor_or_abrupt_faults() -> None:
    sticks = [
        StickInput(throttle=0.5 + 0.25 * min(1.0, i / 60.0), arm=True, mode_switch=0)
        for i in range(180)
    ]
    faults = {f["code"] for f in _run(sticks)["assessment"]["faults"]}
    assert "tay_run" not in faults
    assert "gat_can" not in faults


def test_abrupt_oscillating_sticks_detect_gat_can_and_over_control() -> None:
    sticks = []
    for i in range(240):
        osc = 0.8 * math.sin(i * 0.65)
        sticks.append(StickInput(throttle=0.62, pitch=osc, roll=-osc, arm=True, mode_switch=0))
    faults = {f["code"] for f in _run(sticks)["assessment"]["faults"]}
    assert "gat_can" in faults
    assert "over_control" in faults


def test_fault_payload_has_evidence_and_tip() -> None:
    sticks = [
        StickInput(throttle=0.62, pitch=0.7 * math.sin(i * 0.9), arm=True, mode_switch=0)
        for i in range(200)
    ]
    for f in _run(sticks)["assessment"]["faults"]:
        assert f["evidence"] and f["tip"]
        assert f["severity"] in ("low", "med", "high")


def test_timer_waits_for_first_stick_move() -> None:
    cfg = SessionConfig(exercise_id="BT01", default_mode=FlightModeType.POSITION_HOLD, seed=1)
    session = FlightSession(cfg)
    try:
        for i in range(30):
            session.receive_input(StickInput(throttle=0.5, arm=True, mode_switch=0), seq=i + 1)
            msg = session.step_tick()
        assert msg["t"] == 0.0
        assert "Sẵn sàng" in msg["exercise"]["hint"]

        session.receive_input(StickInput(throttle=0.7, arm=True, mode_switch=0), seq=31)
        msg = session.step_tick()
        assert msg["t"] > 0.0
    finally:
        session.close()
