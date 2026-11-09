import React from "react";
import { ArrowLeftRight, Cpu, Gamepad2, Radio, RotateCcw, Sliders } from "lucide-react";
import {
  applyBipolarAxis,
  defaultControllerProfile,
  radiomasterControllerProfile,
  swapControllerGimbalSides,
} from "../input/calibration";
import { AxisCalib, ControllerProfile, StickInput } from "../types/domain";

interface CalibrationScreenProps {
  profile: ControllerProfile;
  rawAxes: number[];
  liveStick: StickInput;
  connectedGamepadId: string | null;
  onChangeProfile: (next: ControllerProfile) => void;
}

export const CalibrationScreen: React.FC<CalibrationScreenProps> = ({
  profile,
  rawAxes,
  liveStick,
  connectedGamepadId,
  onChangeProfile,
}) => {
  const updateAxis = (
    key: "throttle" | "yaw" | "pitch" | "roll",
    patch: Partial<AxisCalib>
  ) => {
    onChangeProfile({
      ...profile,
      [key]: {
        ...profile[key],
        ...patch,
      },
    });
  };

  const handleModeSwitch = (stickMode: 1 | 2) => {
    const isRadioMaster =
      (profile.deviceId && profile.deviceId.includes("RadioMaster")) ||
      (connectedGamepadId && connectedGamepadId.toLowerCase().includes("radiomaster"));
    const next = isRadioMaster
      ? radiomasterControllerProfile(stickMode)
      : defaultControllerProfile(stickMode);
    next.deviceId = connectedGamepadId || profile.deviceId;
    onChangeProfile(next);
  };

  const handleApplyRadioMaster = () => {
    const next = radiomasterControllerProfile(2);
    next.deviceId = connectedGamepadId || "RadioMaster Pocket (Mode 2)";
    onChangeProfile(next);
  };

  const handleApplyXbox = () => {
    const next = defaultControllerProfile(2);
    next.deviceId = connectedGamepadId || "Xbox / Standard Gamepad (Mode 2)";
    onChangeProfile(next);
  };

  const handleSwapSides = () => {
    const swapped = swapControllerGimbalSides(profile);
    swapped.deviceId = connectedGamepadId || profile.deviceId;
    onChangeProfile(swapped);
  };

  // Build Expo S-Curve SVG points for Pitch axis preview
  const curveSize = 150;
  const curvePts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const xVal = (i / 20) - 1; // [-1 .. +1]
    const yVal = applyBipolarAxis(xVal, { ...profile.pitch, invert: false });
    const sx = ((xVal + 1) / 2) * (curveSize - 16) + 8;
    const sy = curveSize - (((yVal + 1) / 2) * (curveSize - 16) + 8);
    curvePts.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
  }

  const axisRows: {
    key: "throttle" | "yaw" | "pitch" | "roll";
    title: string;
    currentVal: number;
  }[] = [
    { key: "throttle", title: "Ga (Throttle)", currentVal: liveStick.throttle },
    { key: "yaw", title: "Xoay mũi (Yaw)", currentVal: liveStick.yaw },
    { key: "pitch", title: "Tiến / Lùi (Pitch)", currentVal: liveStick.pitch },
    { key: "roll", title: "Nghiêng ngang (Roll)", currentVal: liveStick.roll },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5 select-none">
      {/* Top Status & Mode Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div
            className={`w-11 h-11 rounded-xl border flex items-center justify-center ${
              connectedGamepadId
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                : "bg-sky-500/15 border-sky-500/40 text-sky-400"
            }`}
          >
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">
              Hiệu chuẩn Tay điều khiển USB &amp; Bàn phím
            </h1>
            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  connectedGamepadId ? "bg-emerald-400" : "bg-sky-400"
                }`}
              />
              <span>
                {connectedGamepadId
                  ? `Đã kết nối USB HID: ${connectedGamepadId}`
                  : "Đang dùng Bàn phím (W/S/A/D + Phím Mũi tên) — Cắm tay cầm USB để tự nhận"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleModeSwitch(2)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer transition ${
              profile.stickMode === 2
                ? "bg-emerald-600 text-white border-emerald-500 shadow"
                : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
            }`}
          >
            Mode 2 (Ga Trái - Chuẩn)
          </button>
          <button
            onClick={() => handleModeSwitch(1)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer transition ${
              profile.stickMode === 1
                ? "bg-emerald-600 text-white border-emerald-500 shadow"
                : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
            }`}
          >
            Mode 1 (Ga Phải)
          </button>
          <button
            onClick={() => handleModeSwitch(profile.stickMode)}
            className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 cursor-pointer"
            title="Khôi phục mặc định"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Controller Presets: RadioMaster Pocket / EdgeTX vs Xbox vs Swap Sides */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/80 w-full justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              Cấu hình mẫu:
            </span>
            <button
              onClick={handleApplyRadioMaster}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition flex items-center gap-1.5 ${
                profile.deviceId.includes("RadioMaster")
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow"
                  : "bg-slate-950 text-slate-300 border-slate-700 hover:border-cyan-400/60"
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              RadioMaster Pocket / EdgeTX (Khuyên Dùng)
            </button>
            <button
              onClick={handleApplyXbox}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 text-slate-300 border border-slate-700 hover:border-slate-500 cursor-pointer transition flex items-center gap-1.5"
            >
              <Gamepad2 className="w-3.5 h-3.5 text-slate-400" />
              Tay Cầm Xbox / Gamepad PC
            </button>
          </div>

          <button
            onClick={handleSwapSides}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 cursor-pointer transition flex items-center gap-1.5 shadow"
            title="Hoán đổi ngay cần Ga/Yaw sang bên Trái và Pitch/Roll sang bên Phải (hoặc ngược lại)"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
            Đổi Cần Trái ⇋ Phải (Khắc phục Ga bị nằm bên phải)
          </button>
        </div>
      </div>

      {/* Main Split: Live Gimbals + Expo Curve (Left 5 Cols) & Axis Sliders (Right 7 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 5 Cols: Visual Gimbal Test & Expo Response Curve */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-5 shadow-xl">
          <div>
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono mb-3 flex items-center justify-between">
              <span>Kiểm tra Cần điều khiển Thời gian thực</span>
              <span className="text-emerald-400">60Hz LIVE</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Left Gimbal */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col items-center">
                <span className="text-[11px] font-semibold text-slate-400 mb-2">
                  Cần Trái (Ga / Yaw)
                </span>
                <div className="w-32 h-32 rounded-xl bg-[#060b13] border border-slate-800 relative overflow-hidden">
                  <div className="absolute inset-3 rounded-full border border-slate-800" />
                  <div className="absolute inset-8 rounded-full border border-dashed border-slate-800/80" />
                  <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-slate-800" />
                  <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-800" />
                  <div
                    className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#10b981] border border-white absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${50 + liveStick.yaw * 42}%`,
                      top: `${100 - liveStick.throttle * 84 - 8}%`,
                    }}
                  />
                </div>
                <div className="mt-2 font-mono text-xs text-slate-300 flex gap-3">
                  <span>
                    THR <strong className="text-emerald-400">{(liveStick.throttle * 100).toFixed(0)}%</strong>
                  </span>
                  <span>
                    YAW <strong className="text-white">{(liveStick.yaw * 100).toFixed(0)}</strong>
                  </span>
                </div>
              </div>

              {/* Right Gimbal */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col items-center">
                <span className="text-[11px] font-semibold text-slate-400 mb-2">
                  Cần Phải (Pitch / Roll)
                </span>
                <div className="w-32 h-32 rounded-xl bg-[#060b13] border border-slate-800 relative overflow-hidden">
                  <div className="absolute inset-3 rounded-full border border-slate-800" />
                  <div className="absolute inset-8 rounded-full border border-dashed border-slate-800/80" />
                  <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-slate-800" />
                  <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-800" />
                  <div
                    className="w-3.5 h-3.5 rounded-full bg-sky-400 shadow-[0_0_12px_#38bdf8] border border-white absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${50 + liveStick.roll * 42}%`,
                      top: `${50 - liveStick.pitch * 42}%`,
                    }}
                  />
                </div>
                <div className="mt-2 font-mono text-xs text-slate-300 flex gap-3">
                  <span>
                    PIT <strong className="text-sky-400">{(liveStick.pitch * 100).toFixed(0)}</strong>
                  </span>
                  <span>
                    ROL <strong className="text-sky-400">{(liveStick.roll * 100).toFixed(0)}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Expo Curve Visualizer */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center gap-4">
            <svg
              width={curveSize}
              height={curveSize}
              className="bg-[#060b13] border border-slate-800 rounded-lg shrink-0"
            >
              <line
                x1={0}
                y1={curveSize / 2}
                x2={curveSize}
                y2={curveSize / 2}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <line
                x1={curveSize / 2}
                y1={0}
                x2={curveSize / 2}
                y2={curveSize}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <line
                x1={8}
                y1={curveSize - 8}
                x2={curveSize - 8}
                y2={8}
                stroke="#334155"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <polyline
                points={curvePts.join(" ")}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.2"
              />
            </svg>

            <div className="space-y-1.5 text-xs">
              <div className="font-bold text-white flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                Đường cong Độ nhạy (Expo &amp; Deadzone)
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Tăng <strong>Expo</strong> giúp vùng tâm cần điều khiển êm hơn, giảm hiện tượng lắc cần (Over-control) khi bay treo.
              </p>
              <div className="font-mono text-[11px] text-slate-500 flex items-center gap-1 pt-1">
                <Cpu className="w-3 h-3" />
                Raw:{" "}
                {rawAxes.length > 0
                  ? rawAxes
                      .slice(0, 4)
                      .map((v, i) => `A${i}:${v.toFixed(2)}`)
                      .join(" ")
                  : "Keyboard HID"}
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Clean 4-Axis Configuration Cards */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3.5 shadow-xl">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono mb-1">
            Tinh chỉnh Thông số 4 Trục Điều khiển
          </div>

          {axisRows.map((row) => {
            const cfg = profile[row.key];
            const fillPct =
              row.key === "throttle"
                ? row.currentVal * 100
                : ((row.currentVal + 1) / 2) * 100;

            return (
              <div
                key={row.key}
                className="bg-slate-950/85 border border-slate-800 rounded-xl p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-bold text-sm text-white w-40 shrink-0">
                    {row.title}
                  </span>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-75"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-400 w-12 text-right">
                    {row.currentVal.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1 border-t border-slate-800/70">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Kênh USB Axis
                    </label>
                    <select
                      value={cfg.axisIndex}
                      onChange={(e) =>
                        updateAxis(row.key, { axisIndex: parseInt(e.target.value, 10) })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs"
                    >
                      {[0, 1, 2, 3, 4, 5].map((idx) => (
                        <option key={idx} value={idx}>
                          Axis {idx}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Deadzone ({Math.round(cfg.deadzone * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={0.25}
                      step={0.01}
                      value={cfg.deadzone}
                      onChange={(e) =>
                        updateAxis(row.key, { deadzone: parseFloat(e.target.value) })
                      }
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Độ mượt Expo ({Math.round(cfg.expo * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={0.75}
                      step={0.05}
                      value={cfg.expo}
                      onChange={(e) =>
                        updateAxis(row.key, { expo: parseFloat(e.target.value) })
                      }
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-end pt-3">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                      <input
                        type="checkbox"
                        checked={cfg.invert}
                        onChange={(e) => updateAxis(row.key, { invert: e.target.checked })}
                        className="accent-emerald-500 w-3.5 h-3.5"
                      />
                      Đảo chiều
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
