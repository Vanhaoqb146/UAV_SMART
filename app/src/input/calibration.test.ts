import { describe, expect, it } from "vitest";
import {
  applyBipolarAxis,
  applyThrottleAxis,
  computeKeyboardStickInput,
  defaultControllerProfile,
  mapGamepadToStickInput,
  radiomasterControllerProfile,
  swapControllerGimbalSides,
} from "./calibration";

describe("Controller calibration and input mapping", () => {
  it("applies deadzone and inversion accurately", () => {
    const profile = defaultControllerProfile(2);
    // Inside deadzone (0.04 < 0.06) -> 0
    expect(applyBipolarAxis(0.04, profile.pitch)).toBe(0);
    // Full forward stick on standard gamepad is -1.0 -> inverted to +1.0
    expect(applyBipolarAxis(-1.0, profile.pitch)).toBe(1.0);
  });

  it("maps throttle from [-1, 1] to [0, 1] with neutral at 0.5", () => {
    const profile = defaultControllerProfile(2);
    expect(applyThrottleAxis(0.0, profile.throttle)).toBe(0.5);
    expect(applyThrottleAxis(-1.0, profile.throttle)).toBe(1.0);
    expect(applyThrottleAxis(1.0, profile.throttle)).toBe(0.0);
  });

  it("maps Mode 2 vs Mode 1 axes properly", () => {
    const mode2 = defaultControllerProfile(2);
    const mode1 = defaultControllerProfile(1);
    const sampleAxes = [0.0, -1.0, 0.5, 0.0]; // axis 1 = -1.0, axis 2 = 0.5
    const u2 = mapGamepadToStickInput(sampleAxes, mode2, true, 0);
    expect(u2.throttle).toBe(1.0);
    expect(u2.roll).toBeGreaterThan(0.3);

    const u1 = mapGamepadToStickInput(sampleAxes, mode1, true, 1);
    expect(u1.pitch).toBe(1.0);
  });

  it("correctly maps RadioMaster Pocket Mode 2 (AETR layout: Left=Th/Yaw, Right=Pitch/Roll)", () => {
    const rmProfile = radiomasterControllerProfile(2);
    expect(rmProfile.throttle.axisIndex).toBe(2); // Left stick Y
    expect(rmProfile.yaw.axisIndex).toBe(3);      // Left stick X
    expect(rmProfile.pitch.axisIndex).toBe(1);    // Right stick Y
    expect(rmProfile.roll.axisIndex).toBe(0);     // Right stick X

    // Simulated RadioMaster sticks:
    // Left stick pushed UP (axis 2 = -1.0) and full right yaw (axis 3 = 1.0)
    // Right stick centered (axis 0 = 0, axis 1 = 0)
    const axes = [0.0, 0.0, -1.0, 1.0];
    const stick = mapGamepadToStickInput(axes, rmProfile, true, 0);
    expect(stick.throttle).toBe(1.0); // Full Ga
    expect(stick.yaw).toBe(1.0);      // Full Yaw Right
    expect(stick.pitch).toBe(0.0);    // Pitch centered
    expect(stick.roll).toBe(0.0);     // Roll centered
  });

  it("swaps gimbal sides properly with swapControllerGimbalSides", () => {
    const base = defaultControllerProfile(2);
    const swapped = swapControllerGimbalSides(base);

    expect(swapped.throttle.axisIndex).toBe(base.pitch.axisIndex);
    expect(swapped.pitch.axisIndex).toBe(base.throttle.axisIndex);
    expect(swapped.yaw.axisIndex).toBe(base.roll.axisIndex);
    expect(swapped.roll.axisIndex).toBe(base.yaw.axisIndex);
  });

  it("computes keyboard stick fallback accurately", () => {
    const keys = new Set(["KeyW", "ArrowUp", "ArrowRight"]);
    const stick = computeKeyboardStickInput(keys, true, 1);
    expect(stick.throttle).toBeGreaterThan(0.7);
    expect(stick.pitch).toBeGreaterThan(0.5);
    expect(stick.roll).toBeGreaterThan(0.5);
  });

  it("slews keyboard input smoothly instead of jumping", () => {
    const keys = new Set(["ArrowUp"]);
    const neutral = computeKeyboardStickInput(new Set(), true, 0);
    const step1 = computeKeyboardStickInput(keys, true, 0, neutral, 0.016);
    expect(step1.pitch).toBeGreaterThan(0);
    expect(step1.pitch).toBeLessThan(0.1);
    let s = step1;
    for (let i = 0; i < 30; i++) s = computeKeyboardStickInput(keys, true, 0, s, 0.016);
    expect(s.pitch).toBe(0.55);
  });
});
