"""Real-time physics and control loop benchmark on target CPU hardware."""

from __future__ import annotations

import time
import numpy as np

from uavsim.domain.types import FlightModeType, SessionConfig, StickInput
from uavsim.session.loop import FlightSession


def run_benchmark(steps: int = 600) -> dict[str, float]:
    cfg = SessionConfig(
        exercise_id="BT07",  # Full turbulent wind + 4 cylinder obstacles
        default_mode=FlightModeType.ALTITUDE_HOLD,
        seed=9000,
    )
    session = FlightSession(cfg)
    step_times_ms: list[float] = []
    try:
        for i in range(steps):
            t0 = time.perf_counter()
            session.receive_input(
                StickInput(throttle=0.6, pitch=0.2, roll=-0.1, arm=True, mode_switch=1),
                seq=i + 1,
            )
            session.step_tick()
            dt_ms = (time.perf_counter() - t0) * 1000.0
            step_times_ms.append(dt_ms)
    finally:
        session.close()

    arr = np.array(step_times_ms, dtype=np.float64)
    total_s = float(np.sum(arr) / 1000.0)
    steps_per_sec = float(steps / max(1e-6, total_s))
    return {
        "steps": steps,
        "steps_per_sec": round(steps_per_sec, 1),
        "realtime_speedup_vs_60hz": round(steps_per_sec / 60.0, 2),
        "median_step_ms": round(float(np.percentile(arr, 50)), 3),
        "p95_step_ms": round(float(np.percentile(arr, 95)), 3),
    }


if __name__ == "__main__":
    res = run_benchmark(600)
    print("=== UAV Smart Training Engine Benchmark (BT07 Wind + Obstacles) ===")
    for k, v in res.items():
        print(f"  {k}: {v}")
