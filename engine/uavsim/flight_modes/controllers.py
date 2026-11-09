"""Cascaded flight mode controllers: Position Hold, Altitude Hold, Angle, and Failsafe.

Wraps UTIAS DSL's `DSLPIDControl` inner attitude loop and outer position loop so
human trainees can practice realistic flight modes with a USB controller or keyboard.
"""

from __future__ import annotations

import math
import numpy as np
import pybullet as p
from scipy.spatial.transform import Rotation

from gym_pybullet_drones.control.DSLPIDControl import DSLPIDControl
from gym_pybullet_drones.utils.enums import DroneModel

from uavsim.domain.types import FlightModeType, StickInput


def _body_to_intrinsic_xyz(roll: float, pitch: float, yaw: float) -> np.ndarray:
    """Convert heading-relative (yaw -> pitch -> roll) angles to SciPy 'XYZ' Euler."""
    rot = Rotation.from_euler("zyx", [yaw, pitch, roll], degrees=False)
    return rot.as_euler("XYZ", degrees=False)


def _wrap_angle(angle: float) -> float:
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


class MultiModeFlightController:
    """Manages Cine (C-Mode), Position Hold (N-Mode), Altitude Hold (S-Mode), Angle (M-Mode), and Failsafe."""

    MAX_XY_SPEED_CINE = 0.85        # m/s in Cine / Tripod Mode
    MAX_Z_SPEED_CINE = 0.60         # m/s gentle climb/descent in Cine Mode
    MAX_XY_SPEED = 1.6              # m/s in Position Hold (N-Mode)
    MAX_Z_SPEED = 1.0               # m/s climb/descent rate
    MAX_TILT_CINE = math.radians(8.5)
    MAX_TILT_POS_HOLD = math.radians(18.0)
    MAX_TILT_ALT_HOLD = math.radians(22.0)
    MAX_TILT_ANGLE = math.radians(30.0)
    MAX_YAW_RATE_CINE = math.radians(55.0)
    MAX_YAW_RATE = math.radians(100.0)

    def __init__(
        self,
        mass_scale: float = 1.0,
        speed_scale: float = 1.0,
        z_max: float = 4.5,
    ) -> None:
        self.dsl = DSLPIDControl(drone_model=DroneModel.CF2X)
        self.base_gravity = float(self.dsl.GRAVITY)
        self.mass_scale = float(mass_scale)
        self.speed_scale = float(speed_scale)
        self.z_max = float(z_max)
        self.dsl.GRAVITY = self.base_gravity * self.mass_scale
        self.hold_pos = np.array([0.0, 0.0, 0.05], dtype=np.float64)
        self.yaw_sp = 0.0
        self.z_int_err = 0.0
        self.failsafe_hover_timer = 0.0
        self._vx_smooth = 0.0
        self._vy_smooth = 0.0
        self._vz_smooth = 0.0
        self._smooth_roll = 0.0
        self._smooth_pitch = 0.0
        self._smooth_target_euler = np.zeros(3, dtype=np.float64)
        self._was_moving_xy = False

    def reset(self, initial_pos: tuple[float, float, float], initial_yaw: float = 0.0) -> None:
        self.dsl.reset()
        self.dsl.GRAVITY = self.base_gravity * self.mass_scale
        self.hold_pos = np.array(initial_pos, dtype=np.float64)
        self.yaw_sp = float(initial_yaw)
        self.z_int_err = 0.0
        self.failsafe_hover_timer = 0.0
        self._vx_smooth = 0.0
        self._vy_smooth = 0.0
        self._vz_smooth = 0.0
        self._smooth_roll = 0.0
        self._smooth_pitch = 0.0
        self._smooth_target_euler = np.array([0.0, 0.0, float(initial_yaw)], dtype=np.float64)
        self._was_moving_xy = False

    def sync_setpoint(self, cur_pos: np.ndarray, cur_yaw: float) -> None:
        """Synchronize position/altitude setpoint when switching modes."""
        self.hold_pos = np.array(cur_pos, dtype=np.float64)
        self.yaw_sp = float(cur_yaw)
        self.z_int_err = 0.0
        self._vx_smooth = 0.0
        self._vy_smooth = 0.0
        self._vz_smooth = 0.0
        self._smooth_roll = 0.0
        self._smooth_pitch = 0.0
        self._smooth_target_euler = np.array([0.0, 0.0, float(cur_yaw)], dtype=np.float64)
        self._was_moving_xy = False

    def compute_rpm(
        self,
        mode: FlightModeType,
        stick: StickInput,
        dt: float,
        cur_pos: np.ndarray,
        cur_quat: np.ndarray,
        cur_vel: np.ndarray,
        cur_ang_vel: np.ndarray,
    ) -> np.ndarray:
        u = stick.clamped()
        if not u.arm and mode != FlightModeType.FAILSAFE:
            return np.zeros(4, dtype=np.float64)

        # Advance yaw setpoint from yaw stick
        yaw_rate_limit = self.MAX_YAW_RATE_CINE if mode == FlightModeType.CINE else self.MAX_YAW_RATE
        if mode != FlightModeType.FAILSAFE and abs(u.yaw) > 0.02:
            self.yaw_sp = _wrap_angle(self.yaw_sp - u.yaw * yaw_rate_limit * dt)

        if mode == FlightModeType.CINE:
            return self._compute_cine_mode(u, dt, cur_pos, cur_quat, cur_vel, cur_ang_vel)
        if mode == FlightModeType.POSITION_HOLD:
            return self._compute_position_hold(u, dt, cur_pos, cur_quat, cur_vel, cur_ang_vel)
        if mode == FlightModeType.ALTITUDE_HOLD:
            return self._compute_altitude_hold(u, dt, cur_pos, cur_quat, cur_vel)
        if mode == FlightModeType.ANGLE:
            return self._compute_angle_mode(u, dt, cur_quat)
        return self._compute_failsafe(dt, cur_pos, cur_quat, cur_vel, cur_ang_vel)

    def _compute_cine_mode(
        self,
        u: StickInput,
        dt: float,
        cur_pos: np.ndarray,
        cur_quat: np.ndarray,
        cur_vel: np.ndarray,
        cur_ang_vel: np.ndarray,
    ) -> np.ndarray:
        """C-Mode (Cine / Tripod): Ultra-smooth S-curve self-balancing with 8.5 deg max tilt."""
        z_ceil = max(4.2, self.z_max - 0.3)
        th_delta = u.throttle - 0.5
        vz_raw = 0.0 if abs(th_delta) < 0.035 else th_delta * 2.0 * self.MAX_Z_SPEED_CINE
        self._vz_smooth += 0.25 * (vz_raw - self._vz_smooth)
        if abs(vz_raw) < 1e-4 and abs(self._vz_smooth) < 0.01:
            self._vz_smooth = 0.0

        z_next = self.hold_pos[2] + self._vz_smooth * dt
        if abs(self._vz_smooth) > 0.0:
            z_next = float(np.clip(z_next, cur_pos[2] - 0.28, cur_pos[2] + 0.28))
        self.hold_pos[2] = float(np.clip(z_next, 0.0, z_ceil))

        v_fwd = 0.0 if abs(u.pitch) < 0.03 else u.pitch * self.MAX_XY_SPEED_CINE
        v_right = 0.0 if abs(u.roll) < 0.03 else u.roll * self.MAX_XY_SPEED_CINE
        v_mag = math.hypot(v_fwd, v_right)
        if v_mag > self.MAX_XY_SPEED_CINE and v_mag > 1e-6:
            scale = self.MAX_XY_SPEED_CINE / v_mag
            v_fwd *= scale
            v_right *= scale

        cos_y = math.cos(self.yaw_sp)
        sin_y = math.sin(self.yaw_sp)
        vx_world = v_fwd * cos_y + v_right * sin_y
        vy_world = v_fwd * sin_y - v_right * cos_y

        self._vx_smooth += 0.20 * (vx_world - self._vx_smooth)
        self._vy_smooth += 0.20 * (vy_world - self._vy_smooth)
        if abs(vx_world) < 1e-4 and abs(vy_world) < 1e-4:
            if math.hypot(self._vx_smooth, self._vy_smooth) < 0.012:
                self._vx_smooth = 0.0
                self._vy_smooth = 0.0

        is_moving_xy = abs(vx_world) > 0.0 or abs(vy_world) > 0.0
        if is_moving_xy:
            self._was_moving_xy = True
            nx = float(self.hold_pos[0] + self._vx_smooth * dt)
            ny = float(self.hold_pos[1] + self._vy_smooth * dt)
            dx = nx - float(cur_pos[0])
            dy = ny - float(cur_pos[1])
            d_lead = math.hypot(dx, dy)
            if d_lead > 0.22 and d_lead > 1e-6:
                dx *= 0.22 / d_lead
                dy *= 0.22 / d_lead
            self.hold_pos[0] = float(cur_pos[0]) + dx
            self.hold_pos[1] = float(cur_pos[1]) + dy
            self.dsl.integral_pos_e[0] *= 0.90
            self.dsl.integral_pos_e[1] *= 0.90
        else:
            self._vx_smooth = 0.0
            self._vy_smooth = 0.0
            if self._was_moving_xy:
                # Exact critically-damped PD eigenfunction stopping time: tau = Kd / (2 * Kp) = 0.25s
                self._was_moving_xy = False
                self.hold_pos[0] = float(cur_pos[0] + cur_vel[0] * 0.25)
                self.hold_pos[1] = float(cur_pos[1] + cur_vel[1] * 0.25)
                self.dsl.integral_pos_e[0] = 0.0
                self.dsl.integral_pos_e[1] = 0.0

        self.dsl.integral_pos_e[0] = float(np.clip(self.dsl.integral_pos_e[0], -0.18, 0.18))
        self.dsl.integral_pos_e[1] = float(np.clip(self.dsl.integral_pos_e[1], -0.18, 0.18))

        target_vel = np.array([self._vx_smooth, self._vy_smooth, self._vz_smooth], dtype=np.float64)
        target_rpy = np.array([0.0, 0.0, self.yaw_sp], dtype=np.float64)

        thrust, computed_target_rpy, _ = self.dsl._dslPIDPositionControl(
            control_timestep=dt,
            cur_pos=cur_pos,
            cur_quat=cur_quat,
            cur_vel=cur_vel,
            target_pos=self.hold_pos,
            target_rpy=target_rpy,
            target_vel=target_vel,
        )
        clamped_roll = float(np.clip(computed_target_rpy[0], -self.MAX_TILT_CINE, self.MAX_TILT_CINE))
        clamped_pitch = float(np.clip(computed_target_rpy[1], -self.MAX_TILT_CINE, self.MAX_TILT_CINE))
        self._smooth_target_euler[0] += 0.32 * (clamped_roll - self._smooth_target_euler[0])
        self._smooth_target_euler[1] += 0.32 * (clamped_pitch - self._smooth_target_euler[1])
        self._smooth_target_euler[2] = float(computed_target_rpy[2])

        rpm = self.dsl._dslPIDAttitudeControl(
            control_timestep=dt,
            thrust=thrust,
            cur_quat=cur_quat,
            target_euler=self._smooth_target_euler,
            target_rpy_rates=np.zeros(3, dtype=np.float64),
        )
        return np.asarray(rpm, dtype=np.float64)

    def _compute_position_hold(
        self,
        u: StickInput,
        dt: float,
        cur_pos: np.ndarray,
        cur_quat: np.ndarray,
        cur_vel: np.ndarray,
        cur_ang_vel: np.ndarray,
    ) -> np.ndarray:
        # Vertical rate from throttle stick around 0.5 center (keep descent rate gentle for landing precision)
        max_climb_spd = self.MAX_Z_SPEED * min(1.5, self.speed_scale)
        max_xy_spd = self.MAX_XY_SPEED * self.speed_scale
        z_ceil = max(4.2, self.z_max - 0.3)

        th_delta = u.throttle - 0.5
        if abs(th_delta) < 0.03:
            vz_cmd = 0.0
        elif th_delta > 0.0:
            vz_cmd = th_delta * 2.0 * max_climb_spd
        else:
            vz_cmd = th_delta * 2.0 * self.MAX_Z_SPEED
        z_Next = self.hold_pos[2] + vz_cmd * dt
        if abs(vz_cmd) > 0.0:
            z_Next = float(np.clip(z_Next, cur_pos[2] - 0.35, cur_pos[2] + 0.35))
        self.hold_pos[2] = float(np.clip(z_Next, 0.0, z_ceil))

        # Horizontal velocity in heading frame (vector-norm capped to max_xy_spd)
        v_fwd = 0.0 if abs(u.pitch) < 0.025 else u.pitch * max_xy_spd
        v_right = 0.0 if abs(u.roll) < 0.025 else u.roll * max_xy_spd
        v_mag = math.hypot(v_fwd, v_right)
        if v_mag > max_xy_spd and v_mag > 1e-6:
            scale = max_xy_spd / v_mag
            v_fwd *= scale
            v_right *= scale

        cos_y = math.cos(self.yaw_sp)
        sin_y = math.sin(self.yaw_sp)
        vx_world = v_fwd * cos_y + v_right * sin_y
        vy_world = v_fwd * sin_y - v_right * cos_y

        lead_clamp = 0.28
        if abs(vx_world) > 0.0 or abs(vy_world) > 0.0:
            self._was_moving_xy = True
            nx = float(self.hold_pos[0] + vx_world * dt)
            ny = float(self.hold_pos[1] + vy_world * dt)
            dx = nx - float(cur_pos[0])
            dy = ny - float(cur_pos[1])
            d_lead = math.hypot(dx, dy)
            if d_lead > lead_clamp and d_lead > 1e-6:
                dx *= lead_clamp / d_lead
                dy *= lead_clamp / d_lead
            self.hold_pos[0] = float(cur_pos[0]) + dx
            self.hold_pos[1] = float(cur_pos[1]) + dy
        else:
            if self._was_moving_xy:
                # Critically-damped eigenfunction stopping anchor (tau = Kd / 2Kp = 0.25s)
                self._was_moving_xy = False
                self.hold_pos[0] = float(cur_pos[0] + np.clip(cur_vel[0] * 0.25, -0.32, 0.32))
                self.hold_pos[1] = float(cur_pos[1] + np.clip(cur_vel[1] * 0.25, -0.32, 0.32))
            else:
                brake_clamp = 0.32
                dx = float(self.hold_pos[0] - cur_pos[0])
                dy = float(self.hold_pos[1] - cur_pos[1])
                d_lead = math.hypot(dx, dy)
                if d_lead > brake_clamp and d_lead > 1e-6:
                    self.hold_pos[0] = float(cur_pos[0]) + dx * (brake_clamp / d_lead)
                    self.hold_pos[1] = float(cur_pos[1]) + dy * (brake_clamp / d_lead)

        # Prevent horizontal integral windup on long field missions
        self.dsl.integral_pos_e[0] = float(np.clip(self.dsl.integral_pos_e[0], -0.25, 0.25))
        self.dsl.integral_pos_e[1] = float(np.clip(self.dsl.integral_pos_e[1], -0.25, 0.25))

        max_dv_xy = 0.62
        dvx = vx_world - float(cur_vel[0])
        dvy = vy_world - float(cur_vel[1])
        dv_norm = math.hypot(dvx, dvy)
        if dv_norm > max_dv_xy and dv_norm > 1e-6:
            dvx *= max_dv_xy / dv_norm
            dvy *= max_dv_xy / dv_norm
        vx_eff = float(cur_vel[0]) + dvx
        vy_eff = float(cur_vel[1]) + dvy
        vz_eff = float(cur_vel[2] + np.clip(vz_cmd - cur_vel[2], -0.75, 0.75))

        target_vel = np.array([vx_eff, vy_eff, vz_eff], dtype=np.float64)
        target_rpy = np.array([0.0, 0.0, self.yaw_sp], dtype=np.float64)
        rpm, _, _ = self.dsl.computeControl(
            control_timestep=dt,
            cur_pos=cur_pos,
            cur_quat=cur_quat,
            cur_vel=cur_vel,
            cur_ang_vel=cur_ang_vel,
            target_pos=self.hold_pos,
            target_rpy=target_rpy,
            target_vel=target_vel,
        )
        return np.asarray(rpm, dtype=np.float64)

    def _compute_altitude_hold(
        self,
        u: StickInput,
        dt: float,
        cur_pos: np.ndarray,
        cur_quat: np.ndarray,
        cur_vel: np.ndarray,
    ) -> np.ndarray:
        th_delta = u.throttle - 0.5
        max_z_spd = self.MAX_Z_SPEED * min(1.8, self.speed_scale)
        z_ceil = max(4.2, self.z_max - 0.3)
        vz_cmd = 0.0 if abs(th_delta) < 0.04 else (th_delta * 2.0 * max_z_spd)
        self.hold_pos[2] = float(np.clip(self.hold_pos[2] + vz_cmd * dt, 0.0, z_ceil))

        z_err = float(self.hold_pos[2] - cur_pos[2])
        vz_err = float(vz_cmd - cur_vel[2])
        self.z_int_err = float(np.clip(self.z_int_err + z_err * dt, -0.25, 0.25))

        raw_roll_cmd = u.roll * self.MAX_TILT_ALT_HOLD
        raw_pitch_cmd = u.pitch * self.MAX_TILT_ALT_HOLD
        self._smooth_roll += 0.42 * (raw_roll_cmd - self._smooth_roll)
        self._smooth_pitch += 0.42 * (raw_pitch_cmd - self._smooth_pitch)
        roll_cmd = self._smooth_roll
        pitch_cmd = self._smooth_pitch
        tilt_comp = 1.0 / max(0.72, math.cos(roll_cmd) * math.cos(pitch_cmd))

        # Vertical force (N) with tilt compensation
        kp_z = 1.35 * self.mass_scale
        ki_z = 0.12 * self.mass_scale
        kd_z = 0.55 * self.mass_scale
        fz = max(0.0, (self.dsl.GRAVITY + kp_z * z_err + ki_z * self.z_int_err + kd_z * vz_err) * tilt_comp)
        thrust_pwm = (math.sqrt(fz / (4.0 * self.dsl.KF)) - self.dsl.PWM2RPM_CONST) / self.dsl.PWM2RPM_SCALE

        target_euler = _body_to_intrinsic_xyz(roll_cmd, pitch_cmd, self.yaw_sp)
        rpm = self.dsl._dslPIDAttitudeControl(
            control_timestep=dt,
            thrust=thrust_pwm,
            cur_quat=cur_quat,
            target_euler=target_euler,
            target_rpy_rates=np.zeros(3, dtype=np.float64),
        )
        # Keep XY anchor updated so switching back to Position Hold is bumpless
        self.hold_pos[0] = float(cur_pos[0])
        self.hold_pos[1] = float(cur_pos[1])
        return np.asarray(rpm, dtype=np.float64)

    def _compute_angle_mode(
        self,
        u: StickInput,
        dt: float,
        cur_quat: np.ndarray,
    ) -> np.ndarray:
        if u.throttle <= 0.02:
            return np.zeros(4, dtype=np.float64)

        raw_roll_cmd = u.roll * self.MAX_TILT_ANGLE
        raw_pitch_cmd = u.pitch * self.MAX_TILT_ANGLE
        self._smooth_roll += 0.48 * (raw_roll_cmd - self._smooth_roll)
        self._smooth_pitch += 0.48 * (raw_pitch_cmd - self._smooth_pitch)
        roll_cmd = self._smooth_roll
        pitch_cmd = self._smooth_pitch
        # Map throttle [0, 1] -> collective force around hover at 0.5
        scalar_thrust = self.dsl.GRAVITY * (0.20 + 1.60 * u.throttle)
        thrust_pwm = (math.sqrt(max(0.0, scalar_thrust) / (4.0 * self.dsl.KF)) - self.dsl.PWM2RPM_CONST) / self.dsl.PWM2RPM_SCALE

        target_euler = _body_to_intrinsic_xyz(roll_cmd, pitch_cmd, self.yaw_sp)
        rpm = self.dsl._dslPIDAttitudeControl(
            control_timestep=dt,
            thrust=thrust_pwm,
            cur_quat=cur_quat,
            target_euler=target_euler,
            target_rpy_rates=np.zeros(3, dtype=np.float64),
        )
        return np.asarray(rpm, dtype=np.float64)

    def _compute_failsafe(
        self,
        dt: float,
        cur_pos: np.ndarray,
        cur_quat: np.ndarray,
        cur_vel: np.ndarray,
        cur_ang_vel: np.ndarray,
    ) -> np.ndarray:
        """Auto-hover for 1.0s then descend safely at 0.4 m/s until touchdown."""
        self.failsafe_hover_timer += dt
        vz_descend = 0.0 if self.failsafe_hover_timer < 1.0 else -0.40
        self.hold_pos[2] = max(0.0, float(self.hold_pos[2] + vz_descend * dt))
        if cur_pos[2] <= 0.055 and self.hold_pos[2] <= 0.02:
            return np.zeros(4, dtype=np.float64)

        target_vel = np.array([0.0, 0.0, vz_descend], dtype=np.float64)
        target_rpy = np.array([0.0, 0.0, self.yaw_sp], dtype=np.float64)
        rpm, _, _ = self.dsl.computeControl(
            control_timestep=dt,
            cur_pos=cur_pos,
            cur_quat=cur_quat,
            cur_vel=cur_vel,
            cur_ang_vel=cur_ang_vel,
            target_pos=self.hold_pos,
            target_rpy=target_rpy,
            target_vel=target_vel,
        )
        return np.asarray(rpm, dtype=np.float64)
