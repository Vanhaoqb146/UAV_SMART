import React, { useState } from "react";
import { Compass, Maximize2, Minimize2, Navigation } from "lucide-react";
import { ExerciseStageSpec, ObstacleSpec } from "../types/domain";

interface TacticalMiniMapProps {
  pos: [number, number, number];
  rpy: [number, number, number];
  startPos: [number, number, number];
  stages: ExerciseStageSpec[];
  activeStageIndex: number;
  obstacles: ObstacleSpec[];
  trailPoints: [number, number, number][];
}

export const TacticalMiniMap: React.FC<TacticalMiniMapProps> = ({
  pos,
  rpy,
  startPos,
  stages,
  activeStageIndex,
  obstacles,
  trailPoints,
}) => {
  const [zoomOut, setZoomOut] = useState<boolean>(false);
  const maxStageCoord = Math.max(
    4.0,
    Math.abs(startPos[0]),
    Math.abs(startPos[1]),
    ...stages.map((s) => Math.max(Math.abs(s.target[0]), Math.abs(s.target[1])))
  );
  const baseSpan = Math.max(6.0, Math.ceil(maxStageCoord * 1.22));
  const worldSpan = zoomOut ? Math.round(baseSpan * 1.55) : baseSpan;
  const size = 148;
  const half = size / 2;

  // Map PyBullet (x = forward/North, y = left/West) -> SVG (cx = East, cy = South)
  // Let +X be Up (North, -svgY) and -Y be Right (East, +svgX)
  const toSvg = (px: number, py: number): [number, number] => {
    const sx = half + (-py / worldSpan) * (half - 14);
    const sy = half - (px / worldSpan) * (half - 14);
    return [sx, sy];
  };

  const [uavSx, uavSy] = toSvg(pos[0], pos[1]);
  const [padSx, padSy] = toSvg(startPos[0], startPos[1]);

  // Heading in degrees: 0 = North (+X), 90 = East (-Y)
  const yawRad = rpy[2];
  const headingDeg = (((-yawRad * 180) / Math.PI) % 360 + 360) % 360;

  // Active target distance & bearing
  const activeStage = stages[activeStageIndex];
  let targetDist = 0;
  let targetBrg = 0;
  if (activeStage) {
    const dx = activeStage.target[0] - pos[0];
    const dy = activeStage.target[1] - pos[1];
    targetDist = Math.hypot(dx, dy, activeStage.target[2] - pos[2]);
    targetBrg = (((Math.atan2(-dy, dx) * 180) / Math.PI) % 360 + 360) % 360;
  }

  // Corridor path SVG points
  const corridorWaypoints = [startPos, ...stages.map((s) => s.target)];
  const corridorPoly = corridorWaypoints
    .map((p) => {
      const [sx, sy] = toSvg(p[0], p[1]);
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(" ");

  const recentTrail = trailPoints
    .slice(-120)
    .map((p) => {
      const [sx, sy] = toSvg(p[0], p[1]);
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="bg-slate-950/85 border border-cyan-500/30 rounded-xl overflow-hidden shadow-xl backdrop-blur-md w-[164px] pointer-events-auto select-none">
      {/* Top Tactical Header */}
      <div className="px-2 py-1 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[9.5px] font-mono">
        <div className="flex items-center gap-1 text-cyan-400 font-bold tracking-wider">
          <Compass className="w-3 h-3 text-cyan-400" />
          <span>RADAR</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">R:{worldSpan}m</span>
          <button
            onClick={() => setZoomOut(!zoomOut)}
            className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
            title="Chuyển đổi tỷ lệ thu phóng bản đồ"
          >
            {zoomOut ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
          </button>
        </div>
      </div>

      {/* Radar / Satellite Tactical Canvas */}
      <div className="relative flex items-center justify-center bg-[#06101a] p-1">
        <svg width={size} height={size} className="block">
          <defs>
            <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0891b2" stopOpacity="0.14" />
              <stop offset="70%" stopColor="#0f172a" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0.85" />
            </radialGradient>
          </defs>

          {/* Radar Background & Range Rings */}
          <rect width={size} height={size} fill="url(#radarGlow)" />
          <circle
            cx={half}
            cy={half}
            r={half - 12}
            fill="none"
            stroke="#1e293b"
            strokeWidth="1"
          />
          <circle
            cx={half}
            cy={half}
            r={(half - 12) * 0.66}
            fill="none"
            stroke="#0f293a"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <circle
            cx={half}
            cy={half}
            r={(half - 12) * 0.33}
            fill="none"
            stroke="#0f293a"
            strokeWidth="1"
          />

          {/* Crosshair Axes (N/S/E/W) */}
          <line x1={half} y1={6} x2={half} y2={size - 6} stroke="#0f293a" strokeWidth="1" />
          <line x1={6} y1={half} x2={size - 6} y2={half} stroke="#0f293a" strokeWidth="1" />
          <text x={half} y={13} textAnchor="middle" fill="#38bdf8" fontSize="8" fontFamily="monospace" fontWeight="bold">
            N
          </text>
          <text x={size - 8} y={half + 3} textAnchor="middle" fill="#64748b" fontSize="7" fontFamily="monospace">
            E
          </text>
          <text x={half} y={size - 5} textAnchor="middle" fill="#64748b" fontSize="7" fontFamily="monospace">
            S
          </text>
          <text x={8} y={half + 3} textAnchor="middle" fill="#64748b" fontSize="7" fontFamily="monospace">
            W
          </text>

          {/* Planned Mission Corridor Line */}
          {corridorWaypoints.length > 1 && (
            <polyline
              points={corridorPoly}
              fill="none"
              stroke="#0891b2"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.7"
            />
          )}

          {/* Historical Flight Trail */}
          {trailPoints.length > 1 && (
            <polyline
              points={recentTrail}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.75"
              opacity="0.9"
            />
          )}

          {/* Start Helipad H Marker */}
          <rect
            x={padSx - 6}
            y={padSy - 6}
            width={12}
            height={12}
            rx={2}
            fill="#064e3b"
            stroke="#10b981"
            strokeWidth="1"
          />
          <text
            x={padSx}
            y={padSy + 3}
            textAnchor="middle"
            fill="#34d399"
            fontSize="8"
            fontFamily="monospace"
            fontWeight="bold"
          >
            H
          </text>

          {/* Obstacle Hazard Zones (Trees, Buildings, Pillars) */}
          {obstacles.map((ob, idx) => {
            const [ox, oy] = toSvg(ob.x, ob.y);
            if (ob.kind === "building") {
              const wPx = Math.max(6, ((ob.sy || ob.r * 2) / worldSpan) * (half - 14));
              const hPx = Math.max(6, ((ob.sx || ob.r * 2) / worldSpan) * (half - 14));
              return (
                <rect
                  key={`obs-${idx}`}
                  x={ox - wPx / 2}
                  y={oy - hPx / 2}
                  width={wPx}
                  height={hPx}
                  rx={1.5}
                  fill="rgba(56, 189, 248, 0.22)"
                  stroke="#38bdf8"
                  strokeWidth="1"
                />
              );
            }
            if (ob.kind === "tree") {
              const rPx = Math.max(2.5, ((ob.crown_r || ob.r * 2.5) / worldSpan) * (half - 14));
              return (
                <circle
                  key={`obs-${idx}`}
                  cx={ox}
                  cy={oy}
                  r={rPx}
                  fill="rgba(16, 185, 129, 0.28)"
                  stroke="#10b981"
                  strokeWidth="0.7"
                />
              );
            }
            const rPx = Math.max(4, (ob.r / worldSpan) * (half - 14));
            return (
              <g key={`obs-${idx}`}>
                <circle
                  cx={ox}
                  cy={oy}
                  r={rPx + 4}
                  fill="rgba(239, 68, 68, 0.16)"
                  stroke="#ef4444"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                />
                <circle cx={ox} cy={oy} r={rPx} fill="#ef4444" />
              </g>
            );
          })}

          {/* Exercise Stage Waypoints */}
          {stages.map((st, idx) => {
            const [wx, wy] = toSvg(st.target[0], st.target[1]);
            const passed = idx < activeStageIndex;
            const active = idx === activeStageIndex;
            const color = passed ? "#10b981" : active ? "#f59e0b" : "#06b6d4";
            return (
              <g key={`wp-${idx}`}>
                {active && (
                  <circle
                    cx={wx}
                    cy={wy}
                    r={9}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.2"
                    opacity="0.75"
                  />
                )}
                <circle
                  cx={wx}
                  cy={wy}
                  r={5}
                  fill="#090d16"
                  stroke={color}
                  strokeWidth="1.5"
                />
                <text
                  x={wx}
                  y={wy + 2.5}
                  textAnchor="middle"
                  fill={color}
                  fontSize="7"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {idx + 1}
                </text>
              </g>
            );
          })}

          {/* UAV Camera FOV Cone & Aircraft Chevron */}
          <g transform={`translate(${uavSx}, ${uavSy}) rotate(${headingDeg})`}>
            {/* Camera FOV Sector */}
            <polygon
              points="0,0 -16,-32 16,-32"
              fill="rgba(56, 189, 248, 0.18)"
              stroke="rgba(56, 189, 248, 0.35)"
              strokeWidth="0.6"
            />
            {/* UAV Tactical Delta Icon */}
            <polygon
              points="0,-7 6,6 0,3 -6,6"
              fill="#38bdf8"
              stroke="#f8fafc"
              strokeWidth="1"
            />
          </g>
        </svg>
      </div>

      {/* Bottom Waypoint Telemetry Footer */}
      <div className="px-2 py-1 bg-slate-900/90 border-t border-slate-800 font-mono text-[9.5px] flex items-center justify-between text-cyan-400">
        <span className="flex items-center gap-1">
          <Navigation className="w-2.5 h-2.5" />
          MỐC #{Math.min(activeStageIndex + 1, stages.length)} ({targetBrg.toFixed(0)}°)
        </span>
        <span className="text-amber-300 font-bold">{targetDist.toFixed(1)}m</span>
      </div>
    </div>
  );
};
