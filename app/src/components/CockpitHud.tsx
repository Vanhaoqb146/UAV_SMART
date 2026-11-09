import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Compass,
  Gamepad2,
  Navigation,
  ShieldAlert,
  Wind,
} from "lucide-react";
import {
  ControllerProfile,
  ExerciseProgressState,
  ExerciseStageSpec,
  FlightEventItem,
  FlightMode,
  ObstacleSpec,
} from "../types/domain";
import { TacticalMiniMap } from "./TacticalMiniMap";

interface CockpitHudProps {
  t: number;
  pos: [number, number, number];
  vel: [number, number, number];
  rpy: [number, number, number];
  wind: [number, number, number];
  sticks: [number, number, number, number]; // [throttle, yaw, pitch, roll]
  mode: FlightMode;
  armed: boolean;
  failsafe: boolean;
  instructorDemo: boolean;
  leadGuideEnabled?: boolean;
  leadUavDist?: number | null;
  minObstacleDist: number;
  exerciseProgress: ExerciseProgressState | null;
  recentEvents: FlightEventItem[];
  fps: number;
  latencyMs: number;
  activeDeviceName: string;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onToggleLead: () => void;
  controllerProfile?: ControllerProfile;
  connectedGamepadId?: string | null;
  onSwapGimbals?: () => void;
  onSelectRadioMaster?: () => void;
  onSelectXbox?: () => void;
  onSelectFlightMode?: (modeSwitch: 0 | 1 | 2 | 3) => void;
  startPos?: [number, number, number];
  stages?: ExerciseStageSpec[];
  obstacles?: ObstacleSpec[];
  trailPoints?: [number, number, number][];
}

const MODE_TELEMETRY: Record<
  FlightMode,
  { code: string; name: string; badgeClass: string }
> = {
  cine: {
    code: "C-MODE",
    name: "Tự cân bằng Siêu êm (8°)",
    badgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/50",
  },
  position_hold: {
    code: "N-MODE",
    name: "Tự cân bằng & Giữ vị trí GPS",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
  },
  altitude_hold: {
    code: "S-MODE",
    name: "Cân bằng góc & Giữ độ cao",
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-500/50",
  },
  angle: {
    code: "M-MODE",
    name: "Thủ công Cân bằng góc",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/50",
  },
  failsafe: {
    code: "FAILSAFE",
    name: "Tự hạ cánh khẩn cấp",
    badgeClass: "bg-red-600/35 text-red-200 border-red-500 animate-pulse",
  },
};

export const CockpitHud: React.FC<CockpitHudProps> = ({
  t,
  pos,
  vel,
  rpy,
  wind,
  sticks,
  mode,
  failsafe,
  instructorDemo,
  minObstacleDist,
  exerciseProgress,
  controllerProfile,
  connectedGamepadId,
  onSwapGimbals,
  onSelectFlightMode,
  startPos = [0, 0, 0.05],
  stages = [],
  obstacles = [],
  trailPoints = [],
}) => {
  const [throttle, yawStick, pitchStick, rollStick] = sticks;
  const windMag = Math.hypot(wind[0], wind[1], wind[2]);
  const speedHorizontal = Math.hypot(vel[0], vel[1]);
  const altMeters = Math.max(0, pos[2]);
  const headingDeg = Math.round((((-rpy[2] * 180) / Math.PI) % 360 + 360) % 360);
  const modeInfo = MODE_TELEMETRY[mode] || MODE_TELEMETRY.position_hold;
  const obstacleAlert = minObstacleDist < 0.45;
  const activeStageIndex = exerciseProgress?.stage_index || 0;

  // Instant Real-Time Pilot Fault Warning Chips (Gắt cần, Nghiêng lớn, Hạ quá nhanh)
  const prevStickRef = useRef<{ t: number; sticks: [number, number, number, number] }>({
    t,
    sticks,
  });
  const [instantWarnings, setInstantWarnings] = useState<
    { id: string; text: string; expiresAt: number }[]
  >([]);

  useEffect(() => {
    const nowMs = performance.now();
    const dt = Math.max(0.012, t - prevStickRef.current.t);
    const prev = prevStickRef.current.sticks;
    prevStickRef.current = { t, sticks };

    const maxStickRate =
      t > 0.25 && dt < 0.25
        ? Math.max(
            Math.abs(sticks[0] - prev[0]) / dt,
            Math.abs(sticks[1] - prev[1]) / dt,
            Math.abs(sticks[2] - prev[2]) / dt,
            Math.abs(sticks[3] - prev[3]) / dt
          )
        : 0;
    const tiltDeg = (Math.hypot(rpy[0], rpy[1]) * 180) / Math.PI;
    const fastDescent = pos[2] < 1.35 && pos[2] > 0.08 && vel[2] < -1.05;

    setInstantWarnings((current) => {
      const active = current.filter((w) => w.expiresAt > nowMs);
      const upsert = (id: string, text: string) => {
        const idx = active.findIndex((w) => w.id === id);
        if (idx >= 0) {
          active[idx] = { id, text, expiresAt: nowMs + 1600 };
        } else {
          active.push({ id, text, expiresAt: nowMs + 1600 });
        }
      };
      if (maxStickRate > 4.2) {
        upsert("gat_can", `GẮT CẦN (${maxStickRate.toFixed(1)}/s) — Đẩy cần êm hơn!`);
      }
      if (tiltDeg > 22) {
        upsert("nghieng_lon", `NGHIÊNG LỚN (${tiltDeg.toFixed(0)}°) — Trả nhẹ cần về giữa!`);
      }
      if (fastDescent) {
        upsert("ha_nhanh", `HẠ QUÁ NHANH (${vel[2].toFixed(2)} m/s) — Đỡ thêm cần Ga!`);
      }
      return [...active];
    });
  }, [t, sticks, rpy, pos, vel]);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 select-none overflow-hidden">
      {/* TOP ROW: COMPACT LEFT TELEMETRY & COMPACT RIGHT MISSION HINT */}
      <div className="relative z-10 flex items-start justify-between gap-3">
        {/* Top-Left: Minimalist Flight Mode & Telemetry Bar */}
        <div className="pointer-events-auto bg-slate-950/80 border border-slate-700/70 rounded-xl px-3 py-2 backdrop-blur-md shadow-xl space-y-1.5 max-w-[345px]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold border ${modeInfo.badgeClass}`}
              >
                {modeInfo.code}
              </span>
              <span className="text-[11px] font-semibold text-slate-200 truncate">
                {modeInfo.name}
              </span>
            </div>
            {instructorDemo && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1 shrink-0">
                <Navigation className="w-2.5 h-2.5" />
                BAY MẪU
              </span>
            )}
          </div>

          {/* 4 Flight Modes Quick Selector */}
          {onSelectFlightMode && (
            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => onSelectFlightMode(3)}
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold border transition cursor-pointer ${
                  mode === "cine"
                    ? "bg-cyan-500/25 text-cyan-200 border-cyan-400"
                    : "bg-slate-900/75 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
                title="Phím 4: C-Mode (Siêu êm, giới hạn góc 8.5°)"
              >
                [4] C-ÊM
              </button>
              <button
                type="button"
                onClick={() => onSelectFlightMode(0)}
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold border transition cursor-pointer ${
                  mode === "position_hold"
                    ? "bg-emerald-500/25 text-emerald-200 border-emerald-400"
                    : "bg-slate-900/75 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
                title="Phím 1: N-Mode (Tự cân bằng & Giữ vị trí GPS)"
              >
                [1] N-GPS
              </button>
              <button
                type="button"
                onClick={() => onSelectFlightMode(1)}
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold border transition cursor-pointer ${
                  mode === "altitude_hold"
                    ? "bg-sky-500/25 text-sky-200 border-sky-400"
                    : "bg-slate-900/75 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
                title="Phím 2: S-Mode (Cân bằng góc & Giữ độ cao)"
              >
                [2] S-CAO
              </button>
              <button
                type="button"
                onClick={() => onSelectFlightMode(2)}
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold border transition cursor-pointer ${
                  mode === "angle"
                    ? "bg-amber-500/25 text-amber-200 border-amber-400"
                    : "bg-slate-900/75 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
                title="Phím 3: M-Mode (Cân bằng góc, tự điều tiết ga)"
              >
                [3] M-TAY
              </button>
            </div>
          )}

          {/* Essential 1-Line Flight Telemetry Strip (Altitude, Speed, Wind, Heading) */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[10.5px] font-mono text-slate-300">
            <span>
              CAO: <strong className="text-emerald-400">{altMeters.toFixed(2)}m</strong>
            </span>
            <span>
              TỐC: <strong className="text-amber-300">{speedHorizontal.toFixed(2)}m/s</strong>
            </span>
            <span className="flex items-center gap-0.5">
              <Wind className="w-3 h-3 text-sky-400" />
              <strong className="text-sky-300">{windMag.toFixed(1)}</strong>
            </span>
            <span className="flex items-center gap-0.5 text-slate-400">
              <Compass className="w-3 h-3 text-cyan-400" />
              {headingDeg}°
            </span>
          </div>
        </div>

        {/* Top-Right: Compact Active Step Prompt (No scrolling checklist clutter) */}
        {exerciseProgress && (
          <div className="bg-slate-950/80 border border-slate-700/70 rounded-xl px-3 py-2 backdrop-blur-md shadow-xl w-[300px]">
            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
              <span className="font-bold text-emerald-400 truncate">
                [{exerciseProgress.id}] {exerciseProgress.title}
              </span>
              <span className="text-cyan-300 font-bold shrink-0 ml-2">
                Mốc {Math.min(exerciseProgress.stage_index + 1, exerciseProgress.total_stages)}/
                {exerciseProgress.total_stages}
              </span>
            </div>

            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 mb-1.5">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                style={{ width: `${Math.min(100, exerciseProgress.progress * 100)}%` }}
              />
            </div>

            <div className="bg-slate-900/90 border-l-2 border-amber-400 px-2.5 py-1 rounded-r text-[11px] text-amber-200 font-medium leading-snug">
              {exerciseProgress.hint}
            </div>
          </div>
        )}
      </div>

      {/* CRITICAL WARNING BANNERS (Only visible when an alert occurs) */}
      <div className="relative z-20 flex flex-col items-center gap-1.5 my-auto pointer-events-none">
        {failsafe && (
          <div className="bg-red-950/95 border-2 border-red-500 text-red-100 px-4 py-1.5 rounded-lg shadow-2xl animate-bounce font-mono font-bold text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
            MẤT TÍN HIỆU ĐIỀU KHIỂN — ĐANG GIỮ VỊ TRÍ &amp; TỰ HẠ CÁNH
          </div>
        )}
        {obstacleAlert && !failsafe && (
          <div className="bg-amber-950/90 border border-amber-400 text-amber-200 px-3.5 py-1 rounded-lg shadow-lg font-mono font-semibold text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            CẢNH BÁO GẦN VẬT CẢN: {minObstacleDist.toFixed(2)}m
          </div>
        )}
        {!failsafe &&
          instantWarnings.map((w) => (
            <div
              key={w.id}
              className="bg-rose-950/90 border border-rose-500/80 text-rose-200 px-3 py-1 rounded-full shadow-lg font-mono font-bold text-[11px] flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              {w.text}
            </div>
          ))}
      </div>

      {/* BOTTOM ROW: COMPACT MINI-GIMBALS (LEFT) & MINI-RADAR (RIGHT) */}
      <div className="relative z-10 flex items-end justify-between gap-4">
        {/* Bottom-Left: Sleek Mini Dual Gimbals (64x64px each, no text clutter) */}
        <div className="pointer-events-auto bg-slate-950/80 border border-slate-700/70 rounded-xl px-2.5 py-2 backdrop-blur-md shadow-xl flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-slate-400">
            <span className="flex items-center gap-1 text-slate-300 font-semibold truncate max-w-[115px]">
              <Gamepad2 className="w-3 h-3 text-cyan-400 shrink-0" />
              {controllerProfile?.deviceId?.includes("RadioMaster")
                ? "RadioMaster"
                : connectedGamepadId
                ? "Tay cầm USB"
                : "Phím WASD"}
            </span>
            {onSwapGimbals && (
              <button
                type="button"
                onClick={onSwapGimbals}
                className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[8.5px] font-bold flex items-center gap-0.5 cursor-pointer transition"
                title="Đổi bên Cần Trái ⇋ Cần Phải"
              >
                <ArrowLeftRight className="w-2.5 h-2.5" />
                Đổi cần
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Left Gimbal: Throttle (Y) & Yaw (X) */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-lg bg-[#060b13] border border-slate-700/90 relative overflow-hidden">
                <div className="absolute inset-1.5 rounded-full border border-slate-800/80" />
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-slate-800" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-800" />
                <div
                  className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] border border-white absolute -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${50 + yawStick * 42}%`,
                    top: `${100 - throttle * 84 - 8}%`,
                  }}
                />
              </div>
              <div className="mt-1 font-mono text-[9px] text-slate-400 flex items-center gap-1.5">
                <span>
                  GA <strong className="text-emerald-400">{(throttle * 100).toFixed(0)}%</strong>
                </span>
                <span>
                  XOAY <strong className="text-slate-200">{(yawStick * 100).toFixed(0)}</strong>
                </span>
              </div>
            </div>

            {/* Right Gimbal: Pitch (Y) & Roll (X) */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-lg bg-[#060b13] border border-slate-700/90 relative overflow-hidden">
                <div className="absolute inset-1.5 rounded-full border border-slate-800/80" />
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-slate-800" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-800" />
                <div
                  className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8] border border-white absolute -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${50 + rollStick * 42}%`,
                    top: `${50 - pitchStick * 42}%`,
                  }}
                />
              </div>
              <div className="mt-1 font-mono text-[9px] text-slate-400 flex items-center gap-1.5">
                <span>
                  TIẾN <strong className="text-sky-400">{(pitchStick * 100).toFixed(0)}</strong>
                </span>
                <span>
                  NGANG <strong className="text-sky-400">{(rollStick * 100).toFixed(0)}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom-Right: Compact 2D SAT-NAV Radar Mini-Map Only */}
        <TacticalMiniMap
          pos={pos}
          rpy={rpy}
          startPos={startPos}
          stages={stages}
          activeStageIndex={activeStageIndex}
          obstacles={obstacles}
          trailPoints={trailPoints}
        />
      </div>
    </div>
  );
};
