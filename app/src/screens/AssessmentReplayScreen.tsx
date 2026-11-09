import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Map,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { PrimaryFlightDisplay } from "../components/PrimaryFlightDisplay";
import { CameraMode, FlightScene3D, MapPreset } from "../scene/FlightScene3D";
import { SessionRecord } from "../types/domain";

interface AssessmentReplayScreenProps {
  session: SessionRecord;
  onBackToLibrary: () => void;
  onRetryExercise: (exerciseId: string) => void;
}

export const AssessmentReplayScreen: React.FC<AssessmentReplayScreenProps> = ({
  session,
  onBackToLibrary,
  onRetryExercise,
}) => {
  const frames = session.frames || [];
  const [frameIndex, setFrameIndex] = useState<number>(Math.max(0, frames.length - 1));
  const [playing, setPlaying] = useState<boolean>(false);
  const [showHudOverlay, setShowHudOverlay] = useState<boolean>(false);
  const [mapPreset, setMapPreset] = useState<MapPreset>("airbase");
  const [replayCamera, setReplayCamera] = useState<CameraMode>("chase");
  const [verifyStatus, setVerifyStatus] = useState<{
    loading: boolean;
    deterministic?: boolean;
    maxError?: number;
  }>({ loading: false });

  useEffect(() => {
    setFrameIndex(Math.max(0, frames.length - 1));
    setPlaying(false);
    setVerifyStatus({ loading: false });
  }, [session.session_id, frames.length]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const timer = window.setInterval(() => {
      setFrameIndex((prev) => {
        if (prev >= frames.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 16);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  const curFrame = frames[frameIndex] || {
    t: 0,
    p: session.world.start || [0, 0, 0.05],
    v: [0, 0, 0],
    rpy: [0, 0, 0],
    in: [0.5, 0, 0, 0],
    wind: [0, 0, 0],
    stage: 0,
  };

  const assess = session.assessment;
  const metrics = assess?.metrics;
  const trailSoFar = frames.slice(0, frameIndex + 1).map((f) => f.p);

  const handleVerifyDeterminism = async () => {
    setVerifyStatus({ loading: true });
    try {
      const res = await fetch(`/api/sessions/${session.session_id}/verify-replay`, {
        method: "POST",
      });
      const data = await res.json();
      setVerifyStatus({
        loading: false,
        deterministic: data.deterministic,
        maxError: data.max_position_error_m,
      });
    } catch {
      setVerifyStatus({ loading: false, deterministic: false });
    }
  };

  // Build SVG Telemetry Waveform (Altitude Z & Stick Deflection over time)
  const chartW = 560;
  const chartH = 76;
  const maxAlt = 3.0;
  const stepStride = Math.max(1, Math.floor(frames.length / 140));
  const altPoints: string[] = [];
  const pitchRollPoints: string[] = [];

  for (let i = 0; i < frames.length; i += stepStride) {
    const f = frames[i];
    const x = (i / Math.max(1, frames.length - 1)) * chartW;
    const yAlt = chartH - Math.min(1, Math.max(0, f.p[2] / maxAlt)) * (chartH - 14) - 6;
    altPoints.push(`${x.toFixed(1)},${yAlt.toFixed(1)}`);

    const stickMag = Math.hypot(f.in[2], f.in[3]); // pitch + roll deflection
    const yStick = chartH - Math.min(1, stickMag) * (chartH - 16) - 6;
    pitchRollPoints.push(`${x.toFixed(1)},${yStick.toFixed(1)}`);
  }

  const playheadX = (frameIndex / Math.max(1, frames.length - 1)) * chartW;
  const activeStageTarget =
    session.world.stages?.[curFrame.stage || 0]?.target || null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-5 space-y-5 select-none">
      {/* Compact Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div
            className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center font-mono ${
              assess.total_score >= 80
                ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-400"
                : assess.total_score >= 65
                ? "bg-sky-500/15 border-sky-500/60 text-sky-400"
                : "bg-amber-500/15 border-amber-500/60 text-amber-400"
            }`}
          >
            <span className="text-xl font-extrabold leading-none">
              {assess.total_score.toFixed(0)}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">/ 100đ</span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                {session.exercise.code}
              </span>
              <span className="text-xs font-semibold text-slate-300">
                {assess.grade}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400">{session.student.name}</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">
              {session.exercise.title}
            </h1>
            <div className="text-xs text-slate-400 mt-0.5">
              Kết quả:{" "}
              <strong
                className={
                  session.outcome.completed
                    ? "text-emerald-400"
                    : session.outcome.crashed
                    ? "text-red-400"
                    : "text-amber-300"
                }
              >
                {session.outcome.completed
                  ? "Hoàn thành bài tập"
                  : session.outcome.reason || "Kết thúc sớm"}
              </strong>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onRetryExercise(session.exercise.id)}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Bay lại Bài này
          </button>
          <button
            onClick={onBackToLibrary}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Danh sách Bài tập
          </button>
        </div>
      </div>

      {/* Main Grid: 3D Replay + PFD + Waveform (7 Cols) & Rubric Breakdown (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 Cols: 3D Replay Viewport + Synchronized PFD + Telemetry Waveform */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xl">
          {/* Top Replay Viewport Toolbar */}
          <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-3 text-slate-300">
              <span>T = {curFrame.t.toFixed(2)}s</span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400">Z: {curFrame.p[2].toFixed(2)}m</span>
              <span className="text-sky-400">
                Ga: {(curFrame.in[0] * 100).toFixed(0)}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={replayCamera}
                onChange={(e) => setReplayCamera(e.target.value as CameraMode)}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-cyan-300 text-[11px] font-bold focus:outline-none cursor-pointer"
              >
                <option value="chase" className="bg-slate-950">Bám đuôi</option>
                <option value="vlos" className="bg-slate-950">VLOS mặt đất</option>
                <option value="fpv" className="bg-slate-950">FPV</option>
                <option value="orbit" className="bg-slate-950">Orbit 360</option>
              </select>
              <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                <Map className="w-3 h-3 text-cyan-400" />
                <select
                  value={mapPreset}
                  onChange={(e) => setMapPreset(e.target.value as MapPreset)}
                  className="bg-transparent text-cyan-300 text-[11px] font-bold focus:outline-none cursor-pointer"
                >
                  <option value="airbase" className="bg-slate-950">
                    Sân bay 3D
                  </option>
                  <option value="photogrammetry" className="bg-slate-950">
                    Flycam Thực tế (ODM)
                  </option>
                  <option value="forest" className="bg-slate-950">
                    Rừng cây 3D
                  </option>
                  <option value="urban" className="bg-slate-950">
                    Đô thị 3D
                  </option>
                  <option value="tactical" className="bg-slate-950">
                    Sa bàn Đêm
                  </option>
                </select>
              </div>

              <button
                onClick={() => setShowHudOverlay(!showHudOverlay)}
                className={`px-2.5 py-1 rounded border text-[11px] cursor-pointer flex items-center gap-1 ${
                  showHudOverlay
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                    : "bg-slate-900 text-slate-400 border-slate-800"
                }`}
              >
                <Eye className="w-3 h-3" />
                PFD HUD
              </button>
            </div>
          </div>

          {/* 3D Scene + Synchronized Glass Cockpit PFD */}
          <div className="h-[360px] relative">
            <FlightScene3D
              pos={curFrame.p}
              rpy={curFrame.rpy}
              wind={curFrame.wind || [0, 0, 0]}
              armed={true}
              onGround={curFrame.p[2] <= 0.06}
              collided={false}
              startPos={session.world.start}
              stages={session.world.stages || []}
              activeStageIndex={curFrame.stage || 0}
              obstacles={session.world.obstacles || []}
              trailPoints={trailSoFar}
              cameraMode={replayCamera}
              mapPreset={mapPreset}
            />

            {showHudOverlay && (
              <div className="absolute inset-0 pointer-events-none scale-90 origin-center">
                <PrimaryFlightDisplay
                  pos={curFrame.p}
                  vel={curFrame.v || [0, 0, 0]}
                  rpy={curFrame.rpy}
                  targetPos={activeStageTarget}
                />
              </div>
            )}
          </div>

          {/* Interactive Telemetry Waveform Graph (Altitude & Stick Input) */}
          <div className="px-4 pt-3 pb-2 bg-[#070d17] border-t border-slate-800">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Activity className="w-3 h-3 text-emerald-400" />
                BIỂU ĐỒ VIỄN TRẮC THEO THỜI GIAN
              </span>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400">─ Độ cao Z (m)</span>
                <span className="text-amber-400">─ Biên độ Cần lái</span>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full h-16 bg-slate-950/90 border border-slate-800/90 rounded-lg overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(
                  0,
                  Math.min(1, (e.clientX - rect.left) / rect.width)
                );
                setPlaying(false);
                setFrameIndex(Math.round(ratio * Math.max(0, frames.length - 1)));
              }}
            >
              <line
                x1={0}
                y1={chartH / 2}
                x2={chartW}
                y2={chartH / 2}
                stroke="#1e293b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {pitchRollPoints.length > 1 && (
                <polyline
                  points={pitchRollPoints.join(" ")}
                  fill="none"
                  stroke="rgba(245, 158, 11, 0.55)"
                  strokeWidth="1.25"
                />
              )}
              {altPoints.length > 1 && (
                <polyline
                  points={altPoints.join(" ")}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                />
              )}
              <line
                x1={playheadX}
                y1={0}
                x2={playheadX}
                y2={chartH}
                stroke="#38bdf8"
                strokeWidth="1.75"
              />
            </svg>
          </div>

          {/* Scrubber & Data Export Controls */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (frameIndex >= frames.length - 1) setFrameIndex(0);
                  setPlaying(!playing);
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                {playing ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-white" />
                    Tạm dừng
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white" />
                    Phát lại 3D
                  </>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, frames.length - 1)}
                value={frameIndex}
                onChange={(e) => {
                  setPlaying(false);
                  setFrameIndex(parseInt(e.target.value, 10));
                }}
                className="flex-1 accent-emerald-500 cursor-pointer"
              />
              <span className="text-xs font-mono text-slate-400 shrink-0">
                {frameIndex + 1}/{frames.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex items-center gap-2">
                <a
                  href={`/api/sessions/${session.session_id}/export?format=csv`}
                  download
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 flex items-center gap-1"
                >
                  <Download className="w-3 h-3 text-slate-400" />
                  CSV
                </a>
                <a
                  href={`/api/sessions/${session.session_id}/export?format=parquet`}
                  download
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 flex items-center gap-1"
                >
                  <Download className="w-3 h-3 text-slate-400" />
                  Parquet
                </a>
                <a
                  href={`/api/sessions/${session.session_id}/export?format=drone-traj`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                  JSON
                </a>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleVerifyDeterminism}
                  disabled={verifyStatus.loading}
                  className="px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-medium cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                  {verifyStatus.loading ? "Đang kiểm chứng..." : "Kiểm chứng Vật lý"}
                </button>
                {verifyStatus.deterministic !== undefined && (
                  <span
                    className={`font-mono text-[11px] flex items-center gap-1 ${
                      verifyStatus.deterministic ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {verifyStatus.deterministic ? (
                      <>
                        <Check className="w-3 h-3" />
                        Khớp 100% ({verifyStatus.maxError}m)
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        Lệch
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Clean Rubric Breakdown & Key Diagnostics */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Chi tiết Điểm Rubric (100 điểm)
            </h2>

            <div className="space-y-2.5">
              {assess.categories.map((cat) => (
                <div
                  key={cat.key}
                  className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3"
                >
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="text-slate-200">{cat.label}</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {cat.score.toFixed(1)} / {cat.max_score.toFixed(0)}đ
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1.5">
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: `${Math.min(100, (cat.score / cat.max_score) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400">{cat.rationale}</div>
                </div>
              ))}
            </div>

            {/* 4 Clean Telemetry Cards */}
            {metrics && (
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="text-slate-400 text-[11px]">Sai số Độ cao / Hành lang</div>
                  <div className="font-mono font-bold text-white mt-0.5">
                    {metrics.altitude_rmse_m.toFixed(2)}m · {metrics.corridor_rmse_m.toFixed(2)}m
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="text-slate-400 text-[11px]">Tỷ lệ Giữ hành lang</div>
                  <div className="font-mono font-bold text-emerald-400 mt-0.5">
                    {(metrics.in_corridor_ratio * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="text-slate-400 text-[11px]">Lắc cần (Over-control)</div>
                  <div className="font-mono font-bold text-sky-400 mt-0.5">
                    {metrics.overcontrol_index.toFixed(2)} lần/s
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="text-slate-400 text-[11px]">Độ giật cần (Stick Jerk)</div>
                  <div className="font-mono font-bold text-amber-400 mt-0.5">
                    {metrics.stick_jerk_rms.toFixed(1)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pilot Stick-Fault Diagnostics (6 detectors) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2.5 text-xs shadow-xl">
            <h3 className="text-sm font-bold text-white">Chẩn đoán Thao tác Cần</h3>
            {(assess.faults || []).length === 0 ? (
              <p className="text-emerald-300 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" />
                Không phát hiện lỗi tay cần đáng kể.
              </p>
            ) : (
              (assess.faults || []).map((f) => (
                <div
                  key={f.code}
                  className={`rounded-xl border p-2.5 ${
                    f.severity === "high"
                      ? "bg-rose-950/40 border-rose-500/40"
                      : "bg-amber-950/30 border-amber-500/35"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-semibold ${
                        f.severity === "high" ? "text-rose-300" : "text-amber-300"
                      }`}
                    >
                      {f.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 uppercase">
                      {f.severity === "high" ? "Nặng" : f.severity === "med" ? "Trung bình" : "Nhẹ"}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400 mt-0.5">{f.evidence}</div>
                  <div className="text-slate-300 mt-1">{f.tip}</div>
                </div>
              ))
            )}
          </div>

          {/* Concise Coaching Takeaways */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs shadow-xl">
            <h3 className="text-sm font-bold text-white">Nhận xét &amp; Khuyến nghị</h3>

            {assess.strengths.length > 0 && (
              <div className="space-y-1">
                {assess.strengths.slice(0, 2).map((s, idx) => (
                  <p key={idx} className="text-emerald-300 flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{s}</span>
                  </p>
                ))}
              </div>
            )}

            {assess.diagnostics.length > 0 && (
              <div className="space-y-1">
                {assess.diagnostics.slice(0, 2).map((d, idx) => (
                  <p key={idx} className="text-amber-300 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{d}</span>
                  </p>
                ))}
              </div>
            )}

            {assess.recommendations.length > 0 && (
              <div className="pt-2 border-t border-slate-800 text-slate-300 space-y-1">
                {assess.recommendations.slice(0, 2).map((r, idx) => (
                  <p key={idx}>• {r}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
