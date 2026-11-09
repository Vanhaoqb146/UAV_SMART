"""Tests for USB controller disconnect Failsafe watchdog and recovery."""

from __future__ import annotations

from uavsim.domain.types import FlightModeType, SessionConfig, StickInput
from uavsim.session.loop import FlightSession


def test_failsafe_triggers_after_timeout_and_recovers() -> None:
    cfg = SessionConfig(
        exercise_id="BT01",
        default_mode=FlightModeType.POSITION_HOLD,
        failsafe_timeout_sec=0.5,
        seed=100,
    )
    session = FlightSession(cfg)
    try:
        # Send active climb input for 60 ticks (1.0s)
        for seq in range(1, 61):
            session.receive_input(StickInput(throttle=0.75, arm=True, mode_switch=0), seq=seq)
            msg = session.step_tick(advance_input_watchdog=True)
        assert not msg["failsafe"]

        # Now stop sending input for 35 ticks (> 0.5s at 60Hz)
        triggered_event = False
        for _ in range(35):
            msg = session.step_tick(advance_input_watchdog=True)
            for ev in msg["events"]:
                if ev["code"] == "FAILSAFE_TRIGGERED":
                    triggered_event = True

        assert triggered_event, "Expected FAILSAFE_TRIGGERED event after 0.5s input silence"
        assert msg["failsafe"] is True
        assert msg["mode"] == FlightModeType.FAILSAFE.value

        # Resume controller input and verify immediate recovery
        session.receive_input(StickInput(throttle=0.5, arm=True, mode_switch=0), seq=61)
        msg_after = session.step_tick(advance_input_watchdog=True)
        assert msg_after["failsafe"] is False
        assert msg_after["mode"] == FlightModeType.POSITION_HOLD.value
    finally:
        session.close()
