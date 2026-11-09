"""PyBullet 240Hz physics adapter for human-in-the-loop UAV training.

Subclasses `BaseAviary` with direct 4-motor RPM input, deterministic seeding,
Ornstein-Uhlenbeck wind drag forces, obstacle collision detection, and
multi-mode flight control (`PositionHold`, `AltitudeHold`, `Angle`, `Failsafe`).
"""

from __future__ import annotations

import math
import gymnasium as gym
import numpy as np
import pybullet as p

from gym_pybullet_drones.envs.BaseAviary import BaseAviary
from gym_pybullet_drones.utils.enums import DroneModel, Physics

from uavsim.domain.types import (
    ArenaBounds,
    FlightModeType,
    ObstacleCylinder,
    StickInput,
    VehicleState,
    mode_from_switch,
)
from uavsim.environment.obstacles import (
    compute_min_obstacle_distance,
    is_rooftop_touchdown,
    spawn_obstacles,
)
from uavsim.environment.wind import WindModel
from uavsim.flight_modes.controllers import MultiModeFlightController


class _DirectRPMAviary(BaseAviary):
    """Minimal BaseAviary subclass accepting direct 4-motor RPM commands."""

    def _actionSpace(self) -> gym.Space:
        return gym.spaces.Box(low=0.0, high=self.MAX_RPM, shape=(1, 4), dtype=np.float32)

    def _observationSpace(self) -> gym.Space:
        return gym.spaces.Box(low=-np.inf, high=np.inf, shape=(1, 20), dtype=np.float32)

    def _computeObs(self) -> np.ndarray:
        return np.array([self._getDroneStateVector(0)], dtype=np.float32)

    def _preprocessAction(self, action: np.ndarray) -> np.ndarray:
        arr = np.asarray(action, dtype=np.float64).reshape(1, 4)
        return np.clip(arr, 0.0, self.MAX_RPM)

    def _computeReward(self) -> float:
        return 0.0

    def _computeTerminated(self) -> bool:
        return False

    def _computeTruncated(self) -> bool:
        return False

    def _computeInfo(self) -> dict[str, object]:
        return {}


class PyBulletVehicle:
    """High-level SimulationAdapter for a 6-DOF Quadcopter in PyBullet."""

    def __init__(
        self,
        initial_pos: tuple[float, float, float] = (0.0, 0.0, 0.05),
        initial_yaw: float = 0.0,
        ctrl_hz: int = 60,
        pyb_hz: int = 240,
        mass_scale: float = 1.0,
        base_wind_max: float = 0.0,
        gust_sigma: float = 0.0,
        obstacles: list[ObstacleCylinder] | None = None,
        arena: ArenaBounds | None = None,
        seed: int = 9000,
        default_mode: FlightModeType = FlightModeType.POSITION_HOLD,
        speed_scale: float = 1.0,
    ) -> None:
        self.initial_pos = tuple(float(c) for c in initial_pos)
        self.initial_yaw = float(initial_yaw)
        self.ctrl_hz = int(ctrl_hz)
        self.pyb_hz = int(pyb_hz)
        self.dt_ctrl = 1.0 / float(self.ctrl_hz)
        self.mass_scale = float(mass_scale)
        self.speed_scale = float(speed_scale)
        self.obstacles = list(obstacles or [])
        self.arena = arena or ArenaBounds()
        self.seed = int(seed)
        self.default_mode = default_mode

        self.wind = WindModel(
            base_wind_max=base_wind_max,
            gust_sigma=gust_sigma,
            seed=self.seed,
        )
        self.controller = MultiModeFlightController(
            mass_scale=self.mass_scale,
            speed_scale=self.speed_scale,
            z_max=self.arena.z_max,
        )
        self._aviary: _DirectRPMAviary | None = None
        self._obstacle_body_ids: list[int] = []
        self.sim_time: float = 0.0
        self.current_mode: FlightModeType = default_mode
        self.armed: bool = True
        self.has_taken_off: bool = False
        self.prev_vz: float = 0.0
        self.reset(seed=self.seed)

    def reset(
        self,
        seed: int | None = None,
        initial_pos: tuple[float, float, float] | None = None,
        initial_yaw: float | None = None,
    ) -> VehicleState:
        if seed is not None:
            self.seed = int(seed)
        if initial_pos is not None:
            self.initial_pos = tuple(float(c) for c in initial_pos)
        if initial_yaw is not None:
            self.initial_yaw = float(initial_yaw)

        if self._aviary is not None:
            try:
                self._aviary.close()
            except Exception:
                pass

        init_xyz = np.array([[self.initial_pos[0], self.initial_pos[1], self.initial_pos[2]]], dtype=np.float64)
        init_rpy = np.array([[0.0, 0.0, self.initial_yaw]], dtype=np.float64)
        self._aviary = _DirectRPMAviary(
            drone_model=DroneModel.CF2X,
            num_drones=1,
            initial_xyzs=init_xyz,
            initial_rpys=init_rpy,
            physics=Physics.PYB,
            pyb_freq=self.pyb_hz,
            ctrl_freq=self.ctrl_hz,
            gui=False,
            record=False,
            obstacles=False,
            user_debug_gui=False,
        )

        # Apply mass scaling if configured
        if abs(self.mass_scale - 1.0) > 1e-4:
            scaled_mass = float(self._aviary.M) * self.mass_scale
            p.changeDynamics(
                self._aviary.DRONE_IDS[0],
                -1,
                mass=scaled_mass,
                physicsClientId=self._aviary.CLIENT,
            )

        self._obstacle_body_ids = spawn_obstacles(self.obstacles, self._aviary.CLIENT)
        self.wind.reset(seed=self.seed)
        self.controller.reset(self.initial_pos, self.initial_yaw)
        self.sim_time = 0.0
        self.current_mode = self.default_mode
        self.armed = True
        self.has_taken_off = self.initial_pos[2] > 0.12
        self.prev_vz = 0.0
        return self.get_state()

    def step(
        self,
        stick: StickInput,
        override_mode: FlightModeType | None = None,
    ) -> VehicleState:
        assert self._aviary is not None
        u = stick.clamped()
        self.armed = u.arm

        target_mode = override_mode if override_mode is not None else mode_from_switch(u.mode_switch)
        if target_mode != self.current_mode:
            raw = self._aviary._getDroneStateVector(0)
            self.controller.sync_setpoint(raw[0:3], float(raw[9]))
            self.current_mode = target_mode

        raw_before = self._aviary._getDroneStateVector(0)
        cur_pos = raw_before[0:3]
        cur_quat = raw_before[3:7]
        cur_vel = raw_before[10:13]
        cur_ang_vel = raw_before[13:16]
        self.prev_vz = float(cur_vel[2])

        rpm = self.controller.compute_rpm(
            mode=self.current_mode,
            stick=u,
            dt=self.dt_ctrl,
            cur_pos=cur_pos,
            cur_quat=cur_quat,
            cur_vel=cur_vel,
            cur_ang_vel=cur_ang_vel,
        )

        # Advance Ornstein-Uhlenbeck wind and apply aerodynamic force across substeps
        self.wind.step(self.dt_ctrl)
        wind_force = self.wind.compute_drag_force(cur_vel)

        clipped_rpm = self._aviary._preprocessAction(rpm)
        for _ in range(self._aviary.PYB_STEPS_PER_CTRL):
            self._aviary._physics(clipped_rpm[0, :], 0)
            if np.any(wind_force != 0.0):
                drone_pos, _ = p.getBasePositionAndOrientation(
                    self._aviary.DRONE_IDS[0],
                    physicsClientId=self._aviary.CLIENT,
                )
                p.applyExternalForce(
                    self._aviary.DRONE_IDS[0],
                    -1,
                    wind_force.tolist(),
                    list(drone_pos),
                    p.WORLD_FRAME,
                    physicsClientId=self._aviary.CLIENT,
                )
            p.stepSimulation(physicsClientId=self._aviary.CLIENT)

        self._aviary._updateAndStoreKinematicInformation()
        self.sim_time += self.dt_ctrl
        state = self.get_state()
        if state.pos[2] > 0.15:
            self.has_taken_off = True
        return state

    def get_state(self) -> VehicleState:
        assert self._aviary is not None
        raw = self._aviary._getDroneStateVector(0)
        pos = (float(raw[0]), float(raw[1]), float(raw[2]))
        quat = (float(raw[3]), float(raw[4]), float(raw[5]), float(raw[6]))
        rpy = (float(raw[7]), float(raw[8]), float(raw[9]))
        vel = (float(raw[10]), float(raw[11]), float(raw[12]))
        ang_vel = (float(raw[13]), float(raw[14]), float(raw[15]))
        rpm = (float(raw[16]), float(raw[17]), float(raw[18]), float(raw[19]))

        drone_id = self._aviary.DRONE_IDS[0]
        client = self._aviary.CLIENT
        contacts = p.getContactPoints(bodyA=drone_id, physicsClientId=client)

        on_ground = pos[2] <= 0.055 or is_rooftop_touchdown(pos, self.obstacles)
        collided = False
        for pt in contacts:
            body_b = pt[2]
            if body_b == self._aviary.PLANE_ID:
                on_ground = True
                # Hard crash on ground if vertical speed or tilt was excessive after takeoff
                if self.has_taken_off and (abs(self.prev_vz) > 1.35 or abs(rpy[0]) > 1.0 or abs(rpy[1]) > 1.0):
                    collided = True
            elif body_b in self._obstacle_body_ids:
                if is_rooftop_touchdown(pos, self.obstacles) and abs(self.prev_vz) <= 1.35 and abs(rpy[0]) <= 0.85 and abs(rpy[1]) <= 0.85:
                    on_ground = True
                else:
                    collided = True

        # Flip detection
        if abs(rpy[0]) > math.radians(75.0) or abs(rpy[1]) > math.radians(75.0):
            collided = True

        out_of_bounds = not self.arena.contains(pos)
        wind_v = self.wind.current_velocity()
        min_obs_dist = compute_min_obstacle_distance(pos, self.obstacles)

        return VehicleState(
            t=round(self.sim_time, 4),
            pos=pos,
            vel=vel,
            rpy=rpy,
            ang_vel=ang_vel,
            quat=quat,
            rpm=rpm,
            armed=self.armed,
            mode=self.current_mode,
            on_ground=on_ground,
            collided=collided,
            out_of_bounds=out_of_bounds,
            wind_vel=(float(wind_v[0]), float(wind_v[1]), float(wind_v[2])),
            min_obstacle_dist=min_obs_dist,
        )

    def close(self) -> None:
        if self._aviary is not None:
            try:
                self._aviary.close()
            except Exception:
                pass
            self._aviary = None
