import React, { useState } from "react";
import {
  Award,
  CheckCircle2,
  Clock,
  Compass,
  Map,
  Navigation,
  Play,
  ShieldAlert,
  Sparkles,
  Target,
  User,
  Wind,
} from "lucide-react";
import {
  CURRICULUM_TIERS,
  getAllowedMapsForExercise,
  getTierForExercise,
} from "../scene/mapCurriculumConfig";
import { MapPreset } from "../scene/proceduralEnvironment";
import { ExerciseSpec, FlightMode, SessionSummary } from "../types/domain";

function computeNextLessonRecommendation(
  exercises: ExerciseSpec[],
  recentSessions: SessionSummary[]
): { exerciseId: string; reason: string } {
  const passedIds = new Set(
    recentSessions.filter((s) => s.passed).map((s) => s.exercise.id)
  );
  const last5 = recentSessions.slice(0, 5);
  const faultCounts: Record<string, number> = {};
  last5.forEach((s) => {
    (s.faults || []).forEach((f) => {
      faultCounts[f.code] = (faultCounts[f.code] || 0) + 1;
    });
  });

  if ((faultCounts.lao_dao || 0) + (faultCounts.over_control || 0) >= 2) {
    return {
      exerciseId: "BT03",
      reason:
        "Phát hiện lỗi Lảo đảo / Over-control lặp lại gần đây — Nên ôn lại BT03 (Treo tại chỗ) để giữ cần ổn định.",
    };
  }
  if ((faultCounts.gat_can || 0) + (faultCounts.tay_run || 0) >= 2) {
    return {
      exerciseId: "BT01",
      reason:
        "Phát hiện lỗi Gắt cần / Tay run — Nên ôn lại BT01 để rèn thao tác đẩy 4 trục êm hơn.",
    };
  }
  for (const ex of exercises) {
    if (!passedIds.has(ex.id)) {
      return {
        exerciseId: ex.id,
        reason:
          passedIds.size === 0
            ? "Bắt đầu lộ trình huấn luyện chuẩn hóa từ bài cơ bản đầu tiên."
            : `Bạn đã vượt qua ${passedIds.size}/${exercises.length} bài — Tiếp tục chinh phục ${ex.code}: ${ex.title}.`,
      };
    }
  }
  return {
    exerciseId: "BT08",
    reason:
      "Chúc mừng bạn đã hoàn thành đủ 8 bài! Hãy thử BT08 ở chế độ Tự cân bằng (Angle Mode) hoặc tăng gió 150%.",
  };
}

interface ExerciseLibraryScreenProps {
  exercises: ExerciseSpec[];
  recentSessions: SessionSummary[];
  studentName: string;
  onStudentNameChange: (name: string) => void;
  mapPreset: MapPreset;
  onMapPresetChange: (preset: MapPreset) => void;
  onStartFlight: (
    exercise: ExerciseSpec,
    mode: FlightMode,
    windScale: number,
    instructorDemo: boolean
  ) => void;
  onOpenSessionReport: (sessionId: string) => void;
}

const DIFFICULTY_BADGE: Record<string, string> = {
  "Cơ bản": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Trung bình": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Nâng cao": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Sát hạch": "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const MODE_OPTIONS: { id: FlightMode; title: string; desc: string }[] = [
  {
    id: "cine",
    title: "C-Mode: Siêu Êm (8°)",
    desc: "Tự cân bằng êm, chống giật",
  },
  {
    id: "position_hold",
    title: "N-Mode: Giữ vị trí GPS",
    desc: "Tự cân bằng & khóa vị trí 3D",
  },
  {
    id: "altitude_hold",
    title: "S-Mode: Giữ độ cao",
    desc: "Cân bằng góc + Khóa cao độ",
  },
  {
    id: "angle",
    title: "M-Mode: Thủ công (Khó)",
    desc: "Cân bằng góc + Tự giữ ga",
  },
];

export const ExerciseLibraryScreen: React.FC<ExerciseLibraryScreenProps> = ({
  exercises,
  recentSessions,
  studentName,
  onStudentNameChange,
  mapPreset,
  onMapPresetChange,
  onStartFlight,
  onOpenSessionReport,
}) => {
  const [selectedId, setSelectedId] = useState<string>(exercises[0]?.id || "BT01");
  const selectedEx = exercises.find((e) => e.id === selectedId) || exercises[0];
  const [selectedMode, setSelectedMode] = useState<FlightMode>(
    selectedEx?.default_mode || "position_hold"
  );
  const [windScale, setWindScale] = useState<number>(1.0);

  const handleSelectExercise = (ex: ExerciseSpec) => {
    setSelectedId(ex.id);
    setSelectedMode(ex.default_mode);
    const tier = getTierForExercise(ex.id);
    const nextMap =
      ex.environment.map_preset && tier.allowedMaps.includes(ex.environment.map_preset)
        ? ex.environment.map_preset
        : tier.defaultMap;
    onMapPresetChange(nextMap);
  };

  if (!selectedEx) {
    return (
      <div className="p-12 text-center text-sm text-slate-400">
        Đang tải danh sách bài tập...
      </div>
    );
  }

  // 2D Route Preview SVG coordinates (auto-scaled to fit long-range field missions)
  const mapSize = 280;
  const mapHalf = mapSize / 2;
  const maxStageCoord = Math.max(
    3.5,
    Math.abs(selectedEx.start_pos[0]),
    Math.abs(selectedEx.start_pos[1]),
    ...selectedEx.stages.map((s) => Math.max(Math.abs(s.target[0]), Math.abs(s.target[1])))
  );
  const span = Math.ceil(maxStageCoord * 1.25);
  const toPreviewSvg = (px: number, py: number): [number, number] => {
    const sx = mapHalf + (-py / span) * (mapHalf - 26);
    const sy = mapHalf - (px / span) * (mapHalf - 26);
    return [sx, sy];
  };

  const [startSx, startSy] = toPreviewSvg(
    selectedEx.start_pos[0],
    selectedEx.start_pos[1]
  );
  const routePts = [selectedEx.start_pos, ...selectedEx.stages.map((s) => s.target)]
    .map((p) => {
      const [sx, sy] = toPreviewSvg(p[0], p[1]);
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(" ");

  const effectiveWind = (selectedEx.environment.wind_max * windScale).toFixed(1);
  const studentSessions = recentSessions.filter(
    (s) =>
      !s.student.instructor_demo &&
      s.student.name.trim().toLowerCase() === studentName.trim().toLowerCase()
  );
  const passedExerciseIds = new Set(
    studentSessions.filter((s) => s.passed).map((s) => s.exercise.id)
  );
  const rec = computeNextLessonRecommendation(exercises, studentSessions);
  const recEx = exercises.find((e) => e.id === rec.exerciseId);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 select-none">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (4 COLS): PROGRESSIVE TIERED EXERCISE LIST BY MAP COMPLEXITY */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-800">
            <span className="text-sm font-bold text-white">
              Lộ trình Bài tập theo Bản đồ
            </span>
            <span className="text-xs text-emerald-400 font-mono font-semibold">
              Đạt {passedExerciseIds.size}/{exercises.length}
            </span>
          </div>

          <div className="space-y-3.5 pt-1 max-h-[68vh] overflow-y-auto pr-1">
            {CURRICULUM_TIERS.map((tier) => {
              const tierExercises = tier.exerciseIds
                .map((id) => exercises.find((e) => e.id === id))
                .filter((e): e is ExerciseSpec => Boolean(e));

              if (tierExercises.length === 0) return null;

              return (
                <div key={tier.tierNumber} className="space-y-1.5">
                  <div
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold tracking-wide ${tier.badgeColor}`}
                  >
                    <div>{tier.title}</div>
                    <div className="text-[10px] font-normal text-slate-300/90 mt-0.5">
                      {tier.subtitle}
                    </div>
                  </div>

                  {tierExercises.map((ex) => {
                    const active = ex.id === selectedEx.id;
                    const isPassed = passedExerciseIds.has(ex.id);
                    const badgeStyle =
                      DIFFICULTY_BADGE[ex.difficulty] || DIFFICULTY_BADGE["Cơ bản"];
                    return (
                      <button
                        key={ex.id}
                        onClick={() => handleSelectExercise(ex)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          active
                            ? "bg-emerald-500/15 border-emerald-500/70 text-white shadow-md"
                            : "bg-slate-950/60 border-slate-800/70 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                              active
                                ? "bg-emerald-500 text-slate-950"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {ex.code}
                          </span>
                          <span className="font-semibold text-xs truncate">
                            {ex.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isPassed && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${badgeStyle}`}
                          >
                            {ex.difficulty}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Compact Student Name Input at Bottom of Sidebar */}
          <div className="pt-3 mt-3 border-t border-slate-800 flex items-center gap-2 px-1">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={studentName}
              onChange={(e) => onStudentNameChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              placeholder="Tên học viên..."
            />
          </div>
        </div>

        {/* RIGHT COLUMN (8 COLS): VISUAL MISSION CARD & QUICK LAUNCH */}
        <div className="lg:col-span-8 space-y-4">
          {/* Smart Personalized Next-Lesson Recommendation Banner */}
          {recEx && (
            <div className="bg-emerald-950/30 border border-emerald-500/35 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-slate-200 min-w-0">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">
                  <strong className="text-emerald-300">Gợi ý thông minh:</strong>{" "}
                  {rec.reason}
                </span>
              </div>
              {selectedEx.id !== recEx.id && (
                <button
                  onClick={() => handleSelectExercise(recEx)}
                  className="px-3 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-200 text-xs font-semibold cursor-pointer shrink-0 transition"
                >
                  Chọn {recEx.code}
                </button>
              )}
            </div>
          )}

          <div className="bg-slate-900/85 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            {/* 1. Clean Header + 3 Key Stat Pills */}
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800/80">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-emerald-400 uppercase">
                    BÀI TẬP {selectedEx.code}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-400">{selectedEx.difficulty}</span>
                </div>
                <h1 className="text-2xl font-bold text-white mt-1">
                  {selectedEx.title}
                </h1>
                <p className="text-sm text-slate-300 mt-1">{selectedEx.summary}</p>
              </div>

              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  {selectedEx.time_limit_sec}s
                </span>
                <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-cyan-400" />
                  {selectedEx.stages.length} mốc
                </span>
                {selectedEx.environment.obstacles.length > 0 && (
                  <span className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    {selectedEx.environment.obstacles.length} vật cản
                  </span>
                )}
              </div>
            </div>

            {/* 2. Center Split: Visual Route Map (Left) & Simple Setup Controls (Right) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Left: Clean Visual Flight Map */}
              <div className="md:col-span-6 bg-[#07111d] border border-slate-800 rounded-2xl p-4 flex flex-col items-center">
                <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="flex items-center gap-1.5 font-medium text-cyan-300">
                    <Compass className="w-4 h-4" />
                    Sơ đồ Đường bay
                  </span>
                  <span className="font-mono text-[11px]">
                    Hành lang ±{selectedEx.corridor_radius}m
                  </span>
                </div>

                <svg width={mapSize} height={mapSize} className="block">
                  <circle
                    cx={mapHalf}
                    cy={mapHalf}
                    r={mapHalf - 18}
                    fill="none"
                    stroke="#0f293a"
                    strokeWidth="1"
                  />
                  <circle
                    cx={mapHalf}
                    cy={mapHalf}
                    r={(mapHalf - 18) * 0.55}
                    fill="none"
                    stroke="#0f293a"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={mapHalf}
                    y1={10}
                    x2={mapHalf}
                    y2={mapSize - 10}
                    stroke="#0f293a"
                    strokeWidth="1"
                  />
                  <line
                    x1={10}
                    y1={mapHalf}
                    x2={mapSize - 10}
                    y2={mapHalf}
                    stroke="#0f293a"
                    strokeWidth="1"
                  />

                  {/* Corridor Width Tube */}
                  <polyline
                    points={routePts}
                    fill="none"
                    stroke="rgba(16, 185, 129, 0.14)"
                    strokeWidth={Math.max(12, selectedEx.corridor_radius * 28)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Flight Route Line */}
                  <polyline
                    points={routePts}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                    strokeDasharray="6 4"
                  />

                  {/* Obstacles (Trees, Buildings, Pillars) */}
                  {selectedEx.environment.obstacles.map((ob, idx) => {
                    const [ox, oy] = toPreviewSvg(ob.x, ob.y);
                    if (ob.kind === "building") {
                      const wPx = Math.max(8, ((ob.sy || ob.r * 2) / span) * (mapHalf - 26));
                      const hPx = Math.max(8, ((ob.sx || ob.r * 2) / span) * (mapHalf - 26));
                      return (
                        <rect
                          key={idx}
                          x={ox - wPx / 2}
                          y={oy - hPx / 2}
                          width={wPx}
                          height={hPx}
                          rx={2}
                          fill="rgba(56, 189, 248, 0.25)"
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                        />
                      );
                    }
                    if (ob.kind === "tree") {
                      const rPx = Math.max(3.5, ((ob.crown_r || ob.r * 2.5) / span) * (mapHalf - 26));
                      return (
                        <circle
                          key={idx}
                          cx={ox}
                          cy={oy}
                          r={rPx}
                          fill="rgba(16, 185, 129, 0.28)"
                          stroke="#10b981"
                          strokeWidth="0.9"
                        />
                      );
                    }
                    return (
                      <g key={idx}>
                        <circle
                          cx={ox}
                          cy={oy}
                          r={11}
                          fill="rgba(239, 68, 68, 0.2)"
                          stroke="#ef4444"
                          strokeWidth="1"
                        />
                        <circle cx={ox} cy={oy} r={4.5} fill="#ef4444" />
                      </g>
                    );
                  })}

                  {/* Start Helipad H */}
                  <rect
                    x={startSx - 9}
                    y={startSy - 9}
                    width={18}
                    height={18}
                    rx={4}
                    fill="#064e3b"
                    stroke="#10b981"
                    strokeWidth="1.5"
                  />
                  <text
                    x={startSx}
                    y={startSy + 4}
                    textAnchor="middle"
                    fill="#34d399"
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    H
                  </text>

                  {/* Waypoint Numbered Circles */}
                  {selectedEx.stages.map((st, idx) => {
                    const [wx, wy] = toPreviewSvg(st.target[0], st.target[1]);
                    return (
                      <g key={idx}>
                        <circle
                          cx={wx}
                          cy={wy}
                          r={8}
                          fill="#090d16"
                          stroke="#f59e0b"
                          strokeWidth="2"
                        />
                        <text
                          x={wx}
                          y={wy + 3.5}
                          textAnchor="middle"
                          fill="#fbbf24"
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {idx + 1}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div className="w-full flex items-center justify-center gap-5 text-xs text-slate-400 mt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                    Bãi cất cánh (H)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    Mốc bay (1–{selectedEx.stages.length})
                  </span>
                </div>
              </div>

              {/* Right: Clean Visual Controls (Map + Mode + Wind) */}
              <div className="md:col-span-6 space-y-5">
                {/* Step 1: Choose 3D Map (Filtered by Exercise Curriculum Tier) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Map className="w-4 h-4 text-cyan-400" />
                      Bản đồ Huấn luyện (Cấp {getTierForExercise(selectedEx.id).tierNumber}/4)
                    </label>
                    <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
                      {getAllowedMapsForExercise(selectedEx.id).length === 1
                        ? "Bản đồ Đơn giản Chuẩn"
                        : `Mở khóa ${getAllowedMapsForExercise(selectedEx.id).length} Bản đồ`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {getAllowedMapsForExercise(selectedEx.id).map((m) => {
                      const active = mapPreset === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => onMapPresetChange(m.id)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                            active
                              ? "bg-cyan-500/15 border-cyan-400 text-white"
                              : "bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold truncate">{m.title}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 shrink-0">
                              {m.complexityBadge}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {m.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {getAllowedMapsForExercise(selectedEx.id).length === 1 && (
                    <p className="text-[11px] text-slate-400 mt-2 bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-1.5 leading-relaxed">
                      💡 <strong>Lộ trình Cấp 1:</strong> Chỉ sử dụng <em>Sân tập Cơ bản đơn giản</em> để học viên tập trung làm quen cần điều khiển. Các bản đồ phức tạp (Rừng 3D, Đô thị Landmark 81, Google Maps 3D) sẽ mở khóa dần ở Cấp 2, 3, 4.
                    </p>
                  )}
                </div>

                {/* Step 2: Choose Flight Mode */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-2">
                    Chế độ Lái & Tự Cân Bằng (4 Chế độ Thực tế)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {MODE_OPTIONS.map((mo) => {
                      const active = selectedMode === mo.id;
                      return (
                        <button
                          key={mo.id}
                          onClick={() => setSelectedMode(mo.id)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                            active
                              ? "bg-emerald-500/15 border-emerald-400 text-white"
                              : "bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <div className="text-xs font-bold truncate">{mo.title}</div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {mo.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 3: Wind Slider */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Wind className="w-4 h-4 text-sky-400" />
                      Sức gió môi trường
                    </span>
                    <span className="font-mono font-bold text-sky-300">
                      {Math.round(windScale * 100)}% ({effectiveWind} m/s)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.25}
                    value={windScale}
                    onChange={(e) => setWindScale(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 3. Primary Launch Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onStartFlight(selectedEx, selectedMode, windScale, false)}
                className="flex-1 min-w-[220px] h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-6 rounded-xl shadow-lg shadow-emerald-950/50 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" />
                Bắt đầu Bay Thực hành
              </button>

              <button
                onClick={() => onStartFlight(selectedEx, "position_hold", windScale, true)}
                className="h-12 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 font-semibold text-sm px-5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Navigation className="w-4 h-4 text-sky-400" />
                Xem Bay Mẫu Tự Động
              </button>
            </div>
          </div>

          {/* COMPACT RECENT SESSIONS FOOTER STRIP (MAX 3 ITEMS) */}
          {recentSessions.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>Kết quả gần đây:</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {recentSessions.slice(0, 3).map((s) => (
                  <button
                    key={s.session_id}
                    onClick={() => onOpenSessionReport(s.session_id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs flex items-center gap-2 transition cursor-pointer"
                  >
                    <span className="font-mono font-bold text-slate-300">
                      {s.exercise.code}
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        s.total_score >= 80
                          ? "text-emerald-400"
                          : s.total_score >= 65
                          ? "text-sky-400"
                          : "text-amber-400"
                      }`}
                    >
                      {s.total_score.toFixed(0)}đ
                    </span>
                    <span className="text-[11px] text-cyan-400 underline">Xem lại</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
