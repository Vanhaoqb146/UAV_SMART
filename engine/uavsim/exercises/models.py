"""Pydantic schema and YAML loader for BT01-BT11 training & field exercises."""

from __future__ import annotations

from functools import lru_cache
import math
from pathlib import Path
from typing import Literal
import numpy as np
import yaml
from pydantic import BaseModel, ConfigDict, Field

from uavsim.domain.types import ArenaBounds, FlightModeType, ObstacleCylinder


def _dist_point_to_segment_2d(
    px: float,
    py: float,
    ax: float,
    ay: float,
    bx: float,
    by: float,
) -> float:
    dx = bx - ax
    dy = by - ay
    denom = dx * dx + dy * dy
    if denom < 1e-8:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / denom))
    proj_x = ax + t * dx
    proj_y = ay + t * dy
    return math.hypot(px - proj_x, py - proj_y)


class ExerciseStage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    kind: Literal["reach", "hold", "land"] = "reach"
    target: tuple[float, float, float]
    radius: float = 0.40
    hold_sec: float = 0.0
    max_landing_vz: float = 0.60
    hint: str


class ExerciseEnvironmentSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    wind_max: float = 0.0
    gust_sigma: float = 0.0
    map_preset: (
        Literal["landmark81", "google3d", "airbase", "urban", "forest", "tactical"]
        | None
    ) = None
    arena_bounds: tuple[float, float, float] | None = None
    speed_scale: float = 1.0
    forest_generator: dict[str, float] | None = None
    obstacles: list[dict[str, object]] = Field(default_factory=list)


class ExerciseRubricWeights(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accuracy: float = 40.0
    completion: float = 25.0
    control_smoothness: float = 20.0
    safety: float = 15.0


class ExerciseDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    version: int = 1
    code: str
    title: str
    difficulty: Literal["Cơ bản", "Trung bình", "Nâng cao", "Sát hạch"]
    summary: str
    objectives: list[str]
    default_mode: FlightModeType = FlightModeType.POSITION_HOLD
    time_limit_sec: float = 90.0
    corridor_radius: float = 0.55
    start_pos: tuple[float, float, float] = (0.0, 0.0, 0.05)
    start_yaw: float = 0.0
    environment: ExerciseEnvironmentSpec = Field(default_factory=ExerciseEnvironmentSpec)
    stages: list[ExerciseStage]
    rubric_weights: ExerciseRubricWeights = Field(default_factory=ExerciseRubricWeights)

    def get_arena_bounds(self) -> ArenaBounds:
        if self.environment.arena_bounds is not None:
            ax, ay, az = self.environment.arena_bounds
            return ArenaBounds(
                x_min=-float(ax),
                x_max=float(ax),
                y_min=-float(ay),
                y_max=float(ay),
                z_max=float(az),
            )
        return ArenaBounds()

    def get_obstacles(self) -> list[ObstacleCylinder]:
        items: list[ObstacleCylinder] = []
        for o in self.environment.obstacles:
            kind = str(o.get("kind", "pillar"))
            r = float(o.get("r", 0.22))
            h = float(o.get("h", 2.6))
            sx = float(o.get("sx", 0.0))
            sy = float(o.get("sy", 0.0))
            crown_r = float(o.get("crown_r", r * 3.0 if kind == "tree" else 0.0))
            items.append(
                ObstacleCylinder(
                    x=float(o["x"]),
                    y=float(o["y"]),
                    radius=r,
                    height=h,
                    kind=kind,
                    sx=sx,
                    sy=sy,
                    crown_radius=crown_r,
                )
            )

        gen = self.environment.forest_generator
        if gen:
            rng = np.random.default_rng(int(gen.get("seed", 101)))
            x_min = float(gen.get("x_min", -12.0))
            x_max = float(gen.get("x_max", 12.0))
            y_min = float(gen.get("y_min", -10.0))
            y_max = float(gen.get("y_max", 10.0))
            count = int(gen.get("count", 36))
            clearance = float(gen.get("clearance", 1.35))
            wps = self.reference_waypoints()

            attempts = 0
            added = 0
            while added < count and attempts < count * 18:
                attempts += 1
                tx = float(rng.uniform(x_min, x_max))
                ty = float(rng.uniform(y_min, y_max))
                trunk_r = round(float(rng.uniform(0.14, 0.22)), 3)
                tree_h = round(float(rng.uniform(2.6, 4.4)), 2)
                crown_r = round(float(rng.uniform(0.52, 0.78)), 3)

                # Keep flight corridor & waypoints navigable
                too_close = False
                for i in range(len(wps) - 1):
                    d_seg = _dist_point_to_segment_2d(
                        tx, ty, wps[i][0], wps[i][1], wps[i + 1][0], wps[i + 1][1]
                    )
                    if d_seg < clearance + crown_r:
                        too_close = True
                        break
                if too_close:
                    continue

                for existing in items:
                    ex_r = max(existing.radius, existing.crown_radius, existing.sx * 0.5, existing.sy * 0.5)
                    if math.hypot(tx - existing.x, ty - existing.y) < ex_r + crown_r + 0.35:
                        too_close = True
                        break
                if too_close:
                    continue

                items.append(
                    ObstacleCylinder(
                        x=round(tx, 3),
                        y=round(ty, 3),
                        radius=trunk_r,
                        height=tree_h,
                        kind="tree",
                        crown_radius=crown_r,
                    )
                )
                added += 1

        return items

    def reference_waypoints(self) -> list[tuple[float, float, float]]:
        pts = [self.start_pos]
        for st in self.stages:
            pts.append(st.target)
        return pts


@lru_cache(maxsize=1)
def load_exercise_catalog() -> dict[str, ExerciseDefinition]:
    catalog_path = Path(__file__).with_name("catalog.yaml")
    raw = yaml.safe_load(catalog_path.read_text(encoding="utf-8"))
    items = raw.get("exercises", [])
    catalog: dict[str, ExerciseDefinition] = {}
    for item in items:
        ex = ExerciseDefinition.model_validate(item)
        catalog[ex.id] = ex
    return catalog
