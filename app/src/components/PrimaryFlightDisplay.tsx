import React from "react";

interface PrimaryFlightDisplayProps {
  pos: [number, number, number];
  vel: [number, number, number];
  rpy: [number, number, number];
  targetPos?: [number, number, number] | null;
}

export const PrimaryFlightDisplay: React.FC<PrimaryFlightDisplayProps> = ({
  pos,
  vel,
  rpy,
  targetPos,
}) => {
  const [rollRad, pitchRad, yawRad] = rpy;
  const rollDeg = (rollRad * 180) / Math.PI;
  const pitchDeg = (pitchRad * 180) / Math.PI;
  const headingDeg = (((-yawRad * 180) / Math.PI) % 360 + 360) % 360;

  const altMeters = Math.max(0, pos[2]);
  const speedHorizontal = Math.hypot(vel[0], vel[1]);
  const climbRateVz = vel[2];

  // Relative bearing to active target for compass bug
  let relBearingDeg: number | null = null;
  if (targetPos) {
    const dx = targetPos[0] - pos[0];
    const dy = targetPos[1] - pos[1];
    const brg = (((Math.atan2(-dy, dx) * 180) / Math.PI) % 360 + 360) % 360;
    let diff = brg - headingDeg;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    relBearingDeg = diff;
  }

  // Pitch ladder pixel shift (3.2 px per degree)
  const pitchOffsetPx = Math.max(-85, Math.min(85, pitchDeg * 3.2));

  // Generate compass ticks around current heading (-60° to +60°)
  const compassTicks: { deg: number; offsetPx: number; label: string }[] = [];
  const baseTen = Math.floor((headingDeg - 60) / 10) * 10;
  for (let d = baseTen; d <= headingDeg + 60; d += 10) {
    const norm = ((d % 360) + 360) % 360;
    const diff = d - headingDeg;
    const offsetPx = diff * 2.6; // 2.6 px per degree
    let label = "";
    if (norm === 0) label = "N";
    else if (norm === 45) label = "NE";
    else if (norm === 90) label = "E";
    else if (norm === 135) label = "SE";
    else if (norm === 180) label = "S";
    else if (norm === 225) label = "SW";
    else if (norm === 270) label = "W";
    else if (norm === 315) label = "NW";
    else if (norm % 30 === 0) label = String(norm / 10).padStart(2, "0");

    compassTicks.push({ deg: norm, offsetPx, label });
  }

  // Generate Speed Tape ticks around speedHorizontal
  const speedTicks: { val: number; offsetPx: number }[] = [];
  const minSpd = Math.max(0, Math.floor((speedHorizontal - 2.5) * 2) / 2);
  for (let s = minSpd; s <= speedHorizontal + 2.5; s += 0.5) {
    const offsetPx = (speedHorizontal - s) * 36; // 36 px per m/s
    speedTicks.push({ val: s, offsetPx });
  }

  // Generate Altitude Tape ticks around altMeters
  const altTicks: { val: number; offsetPx: number }[] = [];
  const minAlt = Math.max(0, Math.floor((altMeters - 2.0) * 2) / 2);
  for (let a = minAlt; a <= altMeters + 2.0; a += 0.5) {
    const offsetPx = (altMeters - a) * 44; // 44 px per meter
    altTicks.push({ val: a, offsetPx });
  }

  // VSI needle clamp (-2.5 m/s to +2.5 m/s -> -90px to +90px)
  const vsiHeightPx = Math.max(-88, Math.min(88, climbRateVz * 42));

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center select-none overflow-hidden">
      {/* 1. TOP COMPASS RIBBON TAPE */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="w-[340px] h-9 bg-slate-950/75 border border-emerald-500/40 rounded-md relative overflow-hidden backdrop-blur-sm shadow-lg">
          {/* Center Lubber Line Triangle */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-amber-400 z-20" />

          {/* Scrolling Compass Ticks */}
          <div className="relative w-full h-full">
            {compassTicks.map((t, i) => (
              <div
                key={i}
                className="absolute bottom-0 flex flex-col items-center"
                style={{ left: `calc(50% + ${t.offsetPx}px)`, transform: "translateX(-50%)" }}
              >
                {t.label && (
                  <span
                    className={`font-mono text-[10px] font-bold leading-none mb-1 ${
                      t.label === "N" || t.label === "E" || t.label === "S" || t.label === "W"
                        ? "text-amber-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {t.label}
                  </span>
                )}
                <div
                  className={`w-[1px] ${
                    t.deg % 30 === 0 ? "h-2.5 bg-emerald-400" : "h-1.5 bg-emerald-500/50"
                  }`}
                />
              </div>
            ))}

            {/* Target Waypoint Bearing Bug */}
            {relBearingDeg !== null && (
              <div
                className="absolute top-1 z-10 text-cyan-400 font-mono text-[10px] font-bold"
                style={{
                  left: `calc(50% + ${Math.max(-155, Math.min(155, relBearingDeg * 2.6))}px)`,
                  transform: "translateX(-50%)",
                }}
              >
                ◆
              </div>
            )}
          </div>
        </div>

        {/* Digital Heading Readout Box */}
        <div className="mt-0.5 px-2.5 py-0.5 bg-slate-950/90 border border-emerald-500/50 rounded text-[11px] font-mono font-bold text-emerald-300 shadow">
          HDG {Math.round(headingDeg).toString().padStart(3, "0")}°
        </div>
      </div>

      {/* 2. CENTER ARTIFICIAL HORIZON (ADI) + LEFT/RIGHT TAPE GAUGES */}
      <div className="relative w-[540px] h-[270px] flex items-center justify-between">
        {/* LEFT: AIRSPEED TAPE (SPD m/s) */}
        <div className="w-[70px] h-[220px] bg-slate-950/65 border border-emerald-500/35 rounded-md relative overflow-hidden backdrop-blur-xs">
          <div className="absolute top-1 left-1.5 text-[9px] font-mono font-bold text-emerald-400/90 z-10">
            SPD m/s
          </div>

          {/* Scrolling Speed Ticks */}
          <div className="relative w-full h-full">
            {speedTicks.map((st, idx) => (
              <div
                key={idx}
                className="absolute right-0 flex items-center gap-1"
                style={{
                  top: `calc(50% - ${st.offsetPx}px)`,
                  transform: "translateY(-50%)",
                }}
              >
                <span className="font-mono text-[10px] text-emerald-300/90">
                  {st.val.toFixed(1)}
                </span>
                <div className="w-2.5 h-[1.5px] bg-emerald-400" />
              </div>
            ))}
          </div>

          {/* Fixed Center Speed Box */}
          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 bg-slate-950/95 border-y border-r border-amber-400/80 py-0.5 px-1.5 flex items-center justify-between z-20">
            <span className="font-mono text-xs font-extrabold text-amber-300">
              {speedHorizontal.toFixed(2)}
            </span>
            <span className="text-[8px] text-amber-400">◀</span>
          </div>
        </div>

        {/* CENTER: VECTOR ARTIFICIAL HORIZON & PITCH LADDER SVG */}
        <div className="w-[320px] h-[250px] relative flex items-center justify-center">
          <svg width={320} height={250} viewBox="-160 -125 320 250" className="overflow-visible">
            {/* Upper Bank Angle Arc */}
            <path
              d="M -78 -62 A 98 98 0 0 1 78 -62"
              fill="none"
              stroke="rgba(16, 185, 129, 0.45)"
              strokeWidth="1.5"
            />
            {[-45, -30, -15, 0, 15, 30, 45].map((ang) => {
              const rad = ((ang - 90) * Math.PI) / 180;
              const r1 = 98;
              const r2 = ang % 30 === 0 ? 106 : 103;
              return (
                <line
                  key={ang}
                  x1={Math.cos(rad) * r1}
                  y1={Math.sin(rad) * r1}
                  x2={Math.cos(rad) * r2}
                  y2={Math.sin(rad) * r2}
                  stroke="rgba(16, 185, 129, 0.7)"
                  strokeWidth="1.5"
                />
              );
            })}

            {/* Rotating & Pitching Horizon + Pitch Rungs */}
            <g transform={`rotate(${-rollDeg}) translate(0, ${pitchOffsetPx})`}>
              {/* Artificial Horizon Line */}
              <line
                x1="-95"
                y1="0"
                x2="-24"
                y2="0"
                stroke="#10b981"
                strokeWidth="1.75"
              />
              <line
                x1="24"
                y1="0"
                x2="95"
                y2="0"
                stroke="#10b981"
                strokeWidth="1.75"
              />

              {/* Pitch Ladder Rungs (-20° to +20°) */}
              {[-20, -15, -10, -5, 5, 10, 15, 20].map((deg) => {
                const y = -deg * 3.2;
                const halfW = deg % 10 === 0 ? 34 : 22;
                const isNeg = deg < 0;
                const tipY = isNeg ? y - 5 : y + 5;
                return (
                  <g key={deg} opacity="0.82">
                    {/* Left Rung */}
                    <line
                      x1={-halfW}
                      y1={y}
                      x2="-12"
                      y2={y}
                      stroke="#10b981"
                      strokeWidth="1.4"
                      strokeDasharray={isNeg ? "4 3" : undefined}
                    />
                    <line
                      x1={-halfW}
                      y1={y}
                      x2={-halfW}
                      y2={tipY}
                      stroke="#10b981"
                      strokeWidth="1.4"
                    />
                    {/* Right Rung */}
                    <line
                      x1="12"
                      y1={y}
                      x2={halfW}
                      y2={y}
                      stroke="#10b981"
                      strokeWidth="1.4"
                      strokeDasharray={isNeg ? "4 3" : undefined}
                    />
                    <line
                      x1={halfW}
                      y1={y}
                      x2={halfW}
                      y2={tipY}
                      stroke="#10b981"
                      strokeWidth="1.4"
                    />
                    {deg % 10 === 0 && (
                      <text
                        x={halfW + 6}
                        y={y + 3}
                        fill="#34d399"
                        fontSize="8"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {Math.abs(deg)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Fixed Aircraft Reference Waterline Symbol (NATO W-Symbol) */}
            <path
              d="M -28 0 L -10 0 L -5 6 L 0 0 L 5 6 L 10 0 L 28 0"
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="0" cy="0" r="2" fill="#fbbf24" />
          </svg>

          {/* Digital Attitude Sub-readout */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-3 px-2.5 py-0.5 rounded bg-slate-950/75 border border-slate-800/90 font-mono text-[10px] text-slate-300">
            <span>
              PITCH <strong className="text-emerald-300">{pitchDeg >= 0 ? "+" : ""}{pitchDeg.toFixed(1)}°</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              ROLL <strong className="text-sky-300">{rollDeg >= 0 ? "+" : ""}{rollDeg.toFixed(1)}°</strong>
            </span>
          </div>
        </div>

        {/* RIGHT: ALTITUDE TAPE (ALT m) + VSI VARIOMETER */}
        <div className="flex items-center gap-1">
          <div className="w-[72px] h-[220px] bg-slate-950/65 border border-emerald-500/35 rounded-md relative overflow-hidden backdrop-blur-xs">
            <div className="absolute top-1 right-1.5 text-[9px] font-mono font-bold text-emerald-400/90 z-10">
              ALT m
            </div>

            {/* Scrolling Altitude Ticks */}
            <div className="relative w-full h-full">
              {altTicks.map((at, idx) => (
                <div
                  key={idx}
                  className="absolute left-0 flex items-center gap-1"
                  style={{
                    top: `calc(50% + ${at.offsetPx}px)`,
                    transform: "translateY(-50%)",
                  }}
                >
                  <div className="w-2.5 h-[1.5px] bg-emerald-400" />
                  <span className="font-mono text-[10px] text-emerald-300/90">
                    {at.val.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>

            {/* Fixed Center Altitude Box */}
            <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 bg-slate-950/95 border-y border-l border-amber-400/80 py-0.5 px-1.5 flex items-center justify-between z-20">
              <span className="text-[8px] text-amber-400">▶</span>
              <span className="font-mono text-xs font-extrabold text-amber-300">
                {altMeters.toFixed(2)}
              </span>
            </div>
          </div>

          {/* VSI (Vertical Speed Bar) */}
          <div className="w-3.5 h-[190px] bg-slate-950/75 border border-slate-700/70 rounded relative flex flex-col items-center justify-center overflow-hidden">
            <div className="w-full h-[1px] bg-slate-500 z-10" />
            <div
              className={`absolute left-0.5 right-0.5 rounded-xs transition-all duration-75 ${
                climbRateVz >= 0 ? "bg-emerald-400" : "bg-amber-400"
              }`}
              style={{
                height: `${Math.abs(vsiHeightPx)}px`,
                bottom: climbRateVz >= 0 ? "50%" : undefined,
                top: climbRateVz < 0 ? "50%" : undefined,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
