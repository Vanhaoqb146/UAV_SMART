"""3D obstacle spawning (Pillars, 3D Trees with Canopy, and 3D Buildings) in PyBullet.

Supports exact 3D surface clearance computation and rooftop helipad landing detection.
"""

from __future__ import annotations

import math
import pybullet as p

from uavsim.domain.types import ObstacleCylinder


def spawn_obstacles(
    obstacles: list[ObstacleCylinder],
    pyb_client: int,
) -> list[int]:
    """Create static 3D obstacles (pillars, trees, buildings) in PyBullet."""
    body_ids: list[int] = []
    for obs in obstacles:
        if obs.kind == "building":
            hx = (obs.sx if obs.sx > 0.0 else obs.radius * 2.0) * 0.5
            hy = (obs.sy if obs.sy > 0.0 else obs.radius * 2.0) * 0.5
            hz = obs.height * 0.5
            col_id = p.createCollisionShape(
                p.GEOM_BOX,
                halfExtents=[hx, hy, hz],
                physicsClientId=pyb_client,
            )
            vis_id = p.createVisualShape(
                p.GEOM_BOX,
                halfExtents=[hx, hy, hz],
                rgbaColor=[0.25, 0.35, 0.48, 1.0],
                physicsClientId=pyb_client,
            )
            body_id = p.createMultiBody(
                baseMass=0.0,
                baseCollisionShapeIndex=col_id,
                baseVisualShapeIndex=vis_id,
                basePosition=[obs.x, obs.y, hz],
                physicsClientId=pyb_client,
            )
            body_ids.append(body_id)
        elif obs.kind == "tree":
            # 1. Tree Trunk Cylinder
            trunk_h = obs.height * 0.65
            trunk_col = p.createCollisionShape(
                p.GEOM_CYLINDER,
                radius=obs.radius,
                height=trunk_h,
                physicsClientId=pyb_client,
            )
            trunk_id = p.createMultiBody(
                baseMass=0.0,
                baseCollisionShapeIndex=trunk_col,
                basePosition=[obs.x, obs.y, trunk_h * 0.5],
                physicsClientId=pyb_client,
            )
            body_ids.append(trunk_id)

            # 2. Tree Foliage Canopy Sphere
            crown_r = obs.crown_radius if obs.crown_radius > 0.0 else obs.radius * 3.2
            crown_z = obs.height * 0.72
            crown_col = p.createCollisionShape(
                p.GEOM_SPHERE,
                radius=crown_r,
                physicsClientId=pyb_client,
            )
            crown_id = p.createMultiBody(
                baseMass=0.0,
                baseCollisionShapeIndex=crown_col,
                basePosition=[obs.x, obs.y, crown_z],
                physicsClientId=pyb_client,
            )
            body_ids.append(crown_id)
        else:
            col_id = p.createCollisionShape(
                p.GEOM_CYLINDER,
                radius=obs.radius,
                height=obs.height,
                physicsClientId=pyb_client,
            )
            vis_id = p.createVisualShape(
                p.GEOM_CYLINDER,
                radius=obs.radius,
                length=obs.height,
                rgbaColor=[0.85, 0.32, 0.24, 1.0],
                physicsClientId=pyb_client,
            )
            body_id = p.createMultiBody(
                baseMass=0.0,
                baseCollisionShapeIndex=col_id,
                baseVisualShapeIndex=vis_id,
                basePosition=[obs.x, obs.y, obs.height * 0.5],
                physicsClientId=pyb_client,
            )
            body_ids.append(body_id)
    return body_ids


def is_rooftop_touchdown(
    pos: tuple[float, float, float],
    obstacles: list[ObstacleCylinder],
    margin_xy: float = 0.08,
) -> bool:
    """Return True if the drone is resting on top of a flat building roof."""
    px, py, pz = pos
    for obs in obstacles:
        if obs.kind == "building":
            hx = (obs.sx if obs.sx > 0.0 else obs.radius * 2.0) * 0.5
            hy = (obs.sy if obs.sy > 0.0 else obs.radius * 2.0) * 0.5
            if (
                abs(px - obs.x) <= hx - 0.05
                and abs(py - obs.y) <= hy - 0.05
                and obs.height - 0.02 <= pz <= obs.height + 0.09
            ):
                return True
    return False


def compute_min_obstacle_distance(
    pos: tuple[float, float, float],
    obstacles: list[ObstacleCylinder],
    drone_radius: float = 0.06,
) -> float:
    """Return minimum 3D surface clearance (in meters) to any obstacle."""
    if not obstacles:
        return 99.0
    px, py, pz = pos
    min_dist = 99.0
    for obs in obstacles:
        if obs.kind == "building":
            hx = (obs.sx if obs.sx > 0.0 else obs.radius * 2.0) * 0.5
            hy = (obs.sy if obs.sy > 0.0 else obs.radius * 2.0) * 0.5
            if abs(px - obs.x) <= hx and abs(py - obs.y) <= hy and pz >= obs.height - 0.02:
                # Directly above the flat roof (rooftop helipad zone) — not a side-wall hazard
                continue
            dx = max(0.0, abs(px - obs.x) - hx)
            dy = max(0.0, abs(py - obs.y) - hy)
            dz = max(0.0, pz - obs.height) if pz > obs.height else 0.0
            surface_dist = max(0.0, math.sqrt(dx * dx + dy * dy + dz * dz) - drone_radius)
            if surface_dist < min_dist:
                min_dist = surface_dist
        elif obs.kind == "tree":
            # Distance to trunk cylinder
            if pz <= obs.height * 0.68:
                d_trunk = max(0.0, math.hypot(px - obs.x, py - obs.y) - obs.radius - drone_radius)
                if d_trunk < min_dist:
                    min_dist = d_trunk
            # Distance to foliage canopy sphere
            crown_r = obs.crown_radius if obs.crown_radius > 0.0 else obs.radius * 3.2
            crown_z = obs.height * 0.72
            d_crown = max(
                0.0,
                math.sqrt((px - obs.x) ** 2 + (py - obs.y) ** 2 + (pz - crown_z) ** 2)
                - crown_r
                - drone_radius,
            )
            if d_crown < min_dist:
                min_dist = d_crown
        else:
            if pz <= obs.height + 0.15:
                center_dist = math.hypot(px - obs.x, py - obs.y)
                surface_dist = max(0.0, center_dist - obs.radius - drone_radius)
                if surface_dist < min_dist:
                    min_dist = surface_dist
    return float(min_dist)
