"""Ornstein-Uhlenbeck turbulent wind and aerodynamic drag model.

Adapted with attribution from `drone-rl-lab/envs/base_task.py` (calibrated for CF2X
with `wind_cd = 0.02 N/(m/s)` and correlation time `tau = 2.0 s`).
"""

from __future__ import annotations

import math
import numpy as np


class WindModel:
    """Deterministic seedable base wind + low-pass smoothed Ornstein-Uhlenbeck gust generator."""

    def __init__(
        self,
        base_wind_max: float = 0.0,
        gust_sigma: float = 0.0,
        tau: float = 2.0,
        wind_cd: float = 0.02,
        seed: int = 9000,
    ) -> None:
        self.base_wind_max = max(0.0, float(base_wind_max))
        self.gust_sigma = max(0.0, float(gust_sigma))
        self.tau = max(0.1, float(tau))
        self.wind_cd = float(wind_cd)
        self._rng = np.random.default_rng(seed)
        self.base_wind = np.zeros(3, dtype=np.float64)
        self.gust = np.zeros(3, dtype=np.float64)
        self.reset(seed)

    def reset(self, seed: int | None = None) -> np.ndarray:
        if seed is not None:
            self._rng = np.random.default_rng(seed)
        if self.base_wind_max > 0.0:
            mag = float(self._rng.uniform(0.35 * self.base_wind_max, self.base_wind_max))
            angle = float(self._rng.uniform(0.0, 2.0 * math.pi))
            self.base_wind = np.array(
                [mag * math.cos(angle), mag * math.sin(angle), 0.0],
                dtype=np.float64,
            )
        else:
            self.base_wind = np.zeros(3, dtype=np.float64)
        self.gust = np.zeros(3, dtype=np.float64)
        return self.current_velocity()

    def step(self, dt: float) -> np.ndarray:
        """Advance the Ornstein-Uhlenbeck gust state by `dt` seconds."""
        if self.gust_sigma > 0.0 and dt > 0.0:
            decay = dt / self.tau
            diffusion = math.sqrt(2.0 * dt / self.tau) * self.gust_sigma
            noise = self._rng.normal(0.0, 1.0, size=3)
            noise[2] *= 0.25  # Vertical gusts are weaker near ground
            self.gust = self.gust - decay * self.gust + diffusion * noise
        return self.current_velocity()

    def current_velocity(self) -> np.ndarray:
        return self.base_wind + self.gust

    def compute_drag_force(self, drone_vel: np.ndarray) -> np.ndarray:
        """Compute external aerodynamic force vector F = c_d * (v_wind - v_drone)."""
        v_wind = self.current_velocity()
        if self.base_wind_max == 0.0 and self.gust_sigma == 0.0:
            return np.zeros(3, dtype=np.float64)
        rel_vel = v_wind - np.asarray(drone_vel, dtype=np.float64)
        return self.wind_cd * rel_vel
