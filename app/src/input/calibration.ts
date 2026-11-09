import { AxisCalib, ControllerProfile, StickInput } from "../types/domain";

const STORAGE_KEY = "uav_smart_training_controller_profile_v1";

export function defaultControllerProfile(stickMode: 1 | 2 = 2): ControllerProfile {
  return {
    deviceId: "Standard USB Gamepad / RC HID",
    stickMode,
    throttle: {
      axisIndex: stickMode === 2 ? 1 : 3,
      min: -1.0,
      center: 0.0,
      max: 1.0,
      deadzone: 0.05,
      expo: 0.2,
      invert: true, // Standard browser gamepad up is -1.0
    },
    yaw: {
      axisIndex: 0,
      min: -1.0,
      center: 0.0,
      max: 1.0,
      deadzone: 0.06,
      expo: 0.25,
      invert: false,
    },
    pitch: {
      axisIndex: stickMode === 2 ? 3 : 1,
      min: -1.0,
      center: 0.0,
      max: 1.0,
      deadzone: 0.06,
      expo: 0.3,
      invert: true, // Push stick up (-1.0) -> positive forward pitch (+1.0)
    },
    roll: {
      axisIndex: 2,
      min: -1.0,
      center: 0.0,
      max: 1.0,
      deadzone: 0.06,
      expo: 0.3,
      invert: false,
    },
  };
}

/**
 * Optimized profile for RadioMaster Pocket, Boxer, TX16S, and EdgeTX/OpenTX transmitters
 * using the standard AETR channel sequence (Ch1: Roll, Ch2: Pitch, Ch3: Throttle, Ch4: Yaw).
 * Mode 2: Left Stick = Throttle (Axis 2) & Yaw (Axis 3); Right Stick = Pitch (Axis 1) & Roll (Axis 0).
 */
export function radiomasterControllerProfile(stickMode: 1 | 2 = 2): ControllerProfile {
  if (stickMode === 1) {
    // Mode 1: Right Stick = Throttle (Axis 2) & Roll (Axis 0); Left Stick = Pitch (Axis 1) & Yaw (Axis 3)
    return {
      deviceId: "RadioMaster Pocket / EdgeTX (Mode 1)",
      stickMode: 1,
      throttle: {
        axisIndex: 1,
        min: -1.0,
        center: 0.0,
        max: 1.0,
        deadzone: 0.04,
        expo: 0.15,
        invert: true,
      },
      yaw: {
        axisIndex: 3,
        min: -1.0,
        center: 0.0,
        max: 1.0,
        deadzone: 0.05,
        expo: 0.2,
        invert: false,
      },
      pitch: {
        axisIndex: 2,
        min: -1.0,
        center: 0.0,
        max: 1.0,
        deadzone: 0.05,
        expo: 0.25,
        invert: true,
      },
      roll: {
        axisIndex: 0,
        min: -1.0,
        center: 0.0,
        max: 1.0,
        deadzone: 0.05,
        expo: 0.25,
        invert: false,
      },
    };
  }

  // Standard Mode 2 (Ga Trái - Chuẩn quốc tế & Việt Nam)
  return {
    deviceId: "RadioMaster Pocket / EdgeTX (Mode 2)",
    stickMode: 2,
    throttle: {
      axisIndex: 2, // Left stick vertical (Ch3 Throttle in AETR)
      min: -1.0,
      center: 0.0,
      max: 1.0,
      deadzone: 0.04,
      expo: 0.15,
      invert: true,
    },
    yaw: {
      axisIndex: 3, // Left stick horizontal (Ch4 Yaw/Rudder in AETR)
      min: -1.0,
      center: 0.0,
      max: 1.0,
      deadzone: 0.05,
      expo: 0.2,
      invert: false,
    },
    pitch: {
      axisIndex: 1, // Right stick vertical (Ch2 Pitch/Elevator in AETR)
      min: -1.0,
      center: 0.0,
      max: 1.0,
      deadzone: 0.05,
      expo: 0.25,
      invert: true,
    },
    roll: {
      axisIndex: 0, // Right stick horizontal (Ch1 Roll/Aileron in AETR)
      min: -1.0,
      center: 0.0,
      max: 1.0,
      deadzone: 0.05,
      expo: 0.25,
      invert: false,
    },
  };
}

/**
 * Swaps Left Stick (Throttle & Yaw) with Right Stick (Pitch & Roll).
 */
export function swapControllerGimbalSides(profile: ControllerProfile): ControllerProfile {
  return {
    ...profile,
    throttle: {
      ...profile.throttle,
      axisIndex: profile.pitch.axisIndex,
    },
    pitch: {
      ...profile.pitch,
      axisIndex: profile.throttle.axisIndex,
    },
    yaw: {
      ...profile.yaw,
      axisIndex: profile.roll.axisIndex,
    },
    roll: {
      ...profile.roll,
      axisIndex: profile.yaw.axisIndex,
    },
  };
}

export function normalizeAxis(raw: number, min: number, center: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, raw));
  if (clamped >= center) {
    const span = Math.max(1e-4, max - center);
    return Math.min(1.0, (clamped - center) / span);
  } else {
    const span = Math.max(1e-4, center - min);
    return Math.max(-1.0, (clamped - center) / span);
  }
}

export function applyBipolarAxis(raw: number, calib: AxisCalib): number {
  const norm = normalizeAxis(raw, calib.min, calib.center, calib.max) * (calib.invert ? -1 : 1);
  const absVal = Math.abs(norm);
  const dz = Math.max(0.0, Math.min(0.45, calib.deadzone));
  const afterDz = absVal <= dz ? 0.0 : (Math.sign(norm) * (absVal - dz)) / (1.0 - dz);
  const expo = Math.max(0.0, Math.min(0.85, calib.expo));
  const curved = (1.0 - expo) * afterDz + expo * Math.pow(afterDz, 3);
  return Math.max(-1.0, Math.min(1.0, Number(curved.toFixed(4))));
}

export function applyThrottleAxis(raw: number, calib: AxisCalib): number {
  const bipolar = applyBipolarAxis(raw, calib);
  return Math.max(0.0, Math.min(1.0, Number(((bipolar + 1.0) * 0.5).toFixed(4))));
}

export function mapGamepadToStickInput(
  axes: readonly number[],
  profile: ControllerProfile,
  arm: boolean,
  modeSwitch: 0 | 1 | 2 | 3,
  prevStick?: StickInput
): StickInput {
  const rawTh = axes[profile.throttle.axisIndex] ?? 0.0;
  const rawYaw = axes[profile.yaw.axisIndex] ?? 0.0;
  const rawPitch = axes[profile.pitch.axisIndex] ?? 0.0;
  const rawRoll = axes[profile.roll.axisIndex] ?? 0.0;

  const targetTh = applyThrottleAxis(rawTh, profile.throttle);
  const targetYaw = applyBipolarAxis(rawYaw, profile.yaw);
  const targetPitch = applyBipolarAxis(rawPitch, profile.pitch);
  const targetRoll = applyBipolarAxis(rawRoll, profile.roll);

  if (!prevStick) {
    return {
      throttle: targetTh,
      yaw: targetYaw,
      pitch: targetPitch,
      roll: targetRoll,
      arm,
      modeSwitch,
    };
  }

  // Smooth physical USB controller ADC jitter while keeping crisp stick response
  const alpha = 0.55;
  const blend = (prev: number, next: number, neutral: number) => {
    const val = prev + alpha * (next - prev);
    if (Math.abs(next - neutral) < 1e-4 && Math.abs(val - neutral) < 0.008) {
      return neutral;
    }
    return Number(val.toFixed(4));
  };

  return {
    throttle: blend(prevStick.throttle, targetTh, 0.5),
    yaw: blend(prevStick.yaw, targetYaw, 0.0),
    pitch: blend(prevStick.pitch, targetPitch, 0.0),
    roll: blend(prevStick.roll, targetRoll, 0.0),
    arm,
    modeSwitch,
  };
}

function slewToward(current: number, target: number, maxStep: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxStep) return target;
  return Number((current + Math.sign(diff) * maxStep).toFixed(4));
}

export function computeKeyboardStickInput(
  pressedKeys: ReadonlySet<string>,
  arm: boolean,
  modeSwitch: 0 | 1 | 2 | 3,
  prevStick?: StickInput,
  dtSec: number = 0.016
): StickInput {
  let targetThrottle = 0.5;
  if (pressedKeys.has("KeyW")) targetThrottle = 0.78;
  else if (pressedKeys.has("KeyS")) targetThrottle = 0.22;

  let targetYaw = 0.0;
  if (pressedKeys.has("KeyA")) targetYaw = -0.55;
  else if (pressedKeys.has("KeyD")) targetYaw = 0.55;

  let targetPitch = 0.0;
  if (pressedKeys.has("ArrowUp")) targetPitch = 0.55;
  else if (pressedKeys.has("ArrowDown")) targetPitch = -0.55;

  let targetRoll = 0.0;
  if (pressedKeys.has("ArrowRight")) targetRoll = 0.55;
  else if (pressedKeys.has("ArrowLeft")) targetRoll = -0.55;

  if (!prevStick) {
    return {
      throttle: targetThrottle,
      yaw: targetYaw,
      pitch: targetPitch,
      roll: targetRoll,
      arm,
      modeSwitch,
    };
  }

  const maxStep = Math.max(0.01, 3.2 * dtSec);
  return {
    throttle: slewToward(prevStick.throttle, targetThrottle, maxStep),
    yaw: slewToward(prevStick.yaw, targetYaw, maxStep),
    pitch: slewToward(prevStick.pitch, targetPitch, maxStep),
    roll: slewToward(prevStick.roll, targetRoll, maxStep),
    arm,
    modeSwitch,
  };
}

export function loadSavedControllerProfile(): ControllerProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ControllerProfile;
      // Auto-migrate legacy Xbox profile where throttle was on right stick (axis 1)
      if (
        (parsed.deviceId === "Standard USB Gamepad / RC HID" ||
          parsed.deviceId.includes("Standard")) &&
        parsed.throttle.axisIndex === 1 &&
        parsed.pitch.axisIndex === 3
      ) {
        const upgraded = radiomasterControllerProfile(2);
        saveControllerProfile(upgraded);
        return upgraded;
      }
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return radiomasterControllerProfile(2);
}

export function saveControllerProfile(profile: ControllerProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage errors
  }
}
