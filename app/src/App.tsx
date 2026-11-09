import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  Crosshair,
  Eye,
  Globe,
  Map,
  Navigation,
  Radio,
  RotateCcw,
  Sliders,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { uavAudio } from "./audio/audioSynth";
import { CockpitHud } from "./components/CockpitHud";
import { GoogleMaps3DModal } from "./components/GoogleMaps3DModal";
import {
  computeKeyboardStickInput,
  defaultControllerProfile,
  loadSavedControllerProfile,
  mapGamepadToStickInput,
  radiomasterControllerProfile,
  saveControllerProfile,
  swapControllerGimbalSides,
} from "./input/calibration";
import { CameraMode, FlightScene3D, MapPreset } from "./scene/FlightScene3D";
import {
  Google3DLocationConfig,
  loadSavedGoogle3DConfig,
  saveGoogle3DConfig,
} from "./scene/google3DTilesLoader";
import {
  getAllowedMapsForExercise,
  getTierForExercise,
} from "./scene/mapCurriculumConfig";
import { AssessmentReplayScreen } from "./screens/AssessmentReplayScreen";
import { CalibrationScreen } from "./screens/CalibrationScreen";
import { ExerciseLibraryScreen } from "./screens/ExerciseLibraryScreen";
import {
  ControllerProfile,
  ExerciseProgressState,
  ExerciseSpec,
  FlightEventItem,
  FlightMode,
  SessionRecord,
  SessionSummary,
  StickInput,
  WsStateMessage,
} from "./types/domain";

type ScreenTab = "library" | "cockpit" | "calibration" | "report";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ScreenTab>("library");
  const [exercises, setExercises] = useState<ExerciseSpec[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [studentName, setStudentName] = useState<string>("Học viên UAV-01");
  const [mapPreset, setMapPreset] = useState<MapPreset>("airbase");
  const [google3dConfig, setGoogle3dConfig] = useState<Google3DLocationConfig>(() =>
    loadSavedGoogle3DConfig()
  );
  const [isGoogle3dModalOpen, setIsGoogle3dModalOpen] = useState<boolean>(false);

  // Controller & Keyboard State
  const [controllerProfile, setControllerProfile] = useState<ControllerProfile>(() =>
    loadSavedControllerProfile()
  );
  const [connectedGamepadId, setConnectedGamepadId] = useState<string | null>(null);
  const [rawAxes, setRawAxes] = useState<number[]>([]);
  const [liveStick, setLiveStick] = useState<StickInput>({
    throttle: 0.5,
    yaw: 0,
    pitch: 0,
    roll: 0,
    arm: true,
    modeSwitch: 0,
  });
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const modeSwitchRef = useRef<0 | 1 | 2 | 3>(0);
  const simulateDisconnectRef = useRef<boolean>(false);
  const [simulateDisconnect, setSimulateDisconnect] = useState<boolean>(false);

  // Audio & Immersion Lead Guide State
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => uavAudio.getEnabled());
  const [leadGuideEnabled, setLeadGuideEnabled] = useState<boolean>(true);

  // Live Flight Session State
  const [activeExercise, setActiveExercise] = useState<ExerciseSpec | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("chase");
  const [fps, setFps] = useState<number>(60);
  const [latencyMs, setLatencyMs] = useState<number>(4);
  const [simState, setSimState] = useState<{
    t: number;
    pos: [number, number, number];
    vel: [number, number, number];
    rpy: [number, number, number];
    wind: [number, number, number];
    sticks: [number, number, number, number];
    mode: FlightMode;
    armed: boolean;
    onGround: boolean;
    collided: boolean;
    failsafe: boolean;
    instructorDemo: boolean;
    leadUav: { pos: [number, number, number]; rpy: [number, number, number] } | null;
    minObstacleDist: number;
    exerciseProgress: ExerciseProgressState | null;
    events: FlightEventItem[];
  }>({
    t: 0,
    pos: [0, 0, 0.05],
    vel: [0, 0, 0],
    rpy: [0, 0, 0],
    wind: [0, 0, 0],
    sticks: [0.5, 0, 0, 0],
    mode: "position_hold",
    armed: true,
    onGround: true,
    collided: false,
    failsafe: false,
    instructorDemo: false,
    leadUav: null,
    minObstacleDist: 99,
    exerciseProgress: null,
    events: [],
  });
  const [trailPoints, setTrailPoints] = useState<[number, number, number][]>([]);
  const [completedReport, setCompletedReport] = useState<SessionRecord | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef<number>(0);
  const latestStickRef = useRef<StickInput>(liveStick);
  latestStickRef.current = liveStick;

  const fetchInitialData = useCallback(async () => {
    try {
      const [exRes, sesRes] = await Promise.all([
        fetch("/api/exercises"),
        fetch("/api/sessions"),
      ]);
      if (exRes.ok) {
        const exList = (await exRes.json()) as ExerciseSpec[];
        setExercises(exList);
        if (!activeExercise && exList.length > 0) {
          setActiveExercise(exList[0]);
        }
      }
      if (sesRes.ok) {
        setRecentSessions((await sesRes.json()) as SessionSummary[]);
      }
    } catch {
      // Engine might still be starting up
    }
  }, [activeExercise]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Keyboard listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      pressedKeysRef.current.add(e.code);
      if (e.code === "Digit1") modeSwitchRef.current = 0;
      if (e.code === "Digit2") modeSwitchRef.current = 1;
      if (e.code === "Digit3") modeSwitchRef.current = 2;
      if (e.code === "Digit4") modeSwitchRef.current = 3;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // 60Hz Gamepad & Keyboard polling loop + WebSocket input sender
  useEffect(() => {
    const timer = window.setInterval(() => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const activePad = Array.from(pads).find((p) => p && p.connected) || null;
      let computed: StickInput;

      if (activePad) {
        setConnectedGamepadId(activePad.id);
        setRawAxes(Array.from(activePad.axes));

        // Auto-detect RadioMaster / EdgeTX transmitter and migrate if using Xbox profile
        const lowerId = activePad.id.toLowerCase();
        const isRCIdentifier =
          lowerId.includes("radiomaster") ||
          lowerId.includes("pocket") ||
          lowerId.includes("edgetx") ||
          lowerId.includes("opentx") ||
          lowerId.includes("boxer") ||
          lowerId.includes("tx16") ||
          lowerId.includes("taranis") ||
          lowerId.includes("frsky") ||
          lowerId.includes("jumper") ||
          lowerId.includes("0483");

        let activeProfile = controllerProfile;
        if (
          isRCIdentifier &&
          controllerProfile.throttle.axisIndex === 1 &&
          controllerProfile.pitch.axisIndex === 3
        ) {
          activeProfile = radiomasterControllerProfile(2);
          activeProfile.deviceId = activePad.id;
          saveControllerProfile(activeProfile);
          setControllerProfile(activeProfile);
        }

        const gpStick = mapGamepadToStickInput(
          activePad.axes,
          activeProfile,
          true,
          modeSwitchRef.current,
          latestStickRef.current
        );
        if (pressedKeysRef.current.size > 0) {
          computed = computeKeyboardStickInput(
            pressedKeysRef.current,
            true,
            modeSwitchRef.current,
            latestStickRef.current,
            0.016
          );
        } else {
          computed = gpStick;
        }
      } else {
        setConnectedGamepadId(null);
        setRawAxes([]);
        computed = computeKeyboardStickInput(
          pressedKeysRef.current,
          true,
          modeSwitchRef.current,
          latestStickRef.current,
          0.016
        );
      }

      setLiveStick(computed);

      const ws = wsRef.current;
      if (
        ws &&
        ws.readyState === WebSocket.OPEN &&
        !simulateDisconnectRef.current
      ) {
        seqRef.current += 1;
        ws.send(
          JSON.stringify({
            type: "input",
            seq: seqRef.current,
            t_client: performance.now(),
            sticks: computed,
          })
        );
      }
    }, 16);

    return () => window.clearInterval(timer);
  }, [controllerProfile]);

  const closeActiveWs = () => {
    uavAudio.stop();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  };

  const startFlightSession = (
    exercise: ExerciseSpec,
    mode: FlightMode,
    windScale: number,
    instructorDemo: boolean
  ) => {
    closeActiveWs();
    uavAudio.init();
    setActiveExercise(exercise);
    const tier = getTierForExercise(exercise.id);
    if (!tier.allowedMaps.includes(mapPreset)) {
      const targetMap =
        exercise.environment.map_preset &&
        tier.allowedMaps.includes(exercise.environment.map_preset)
          ? exercise.environment.map_preset
          : tier.defaultMap;
      setMapPreset(targetMap);
    }
    setTrailPoints([exercise.start_pos]);
    simulateDisconnectRef.current = false;
    setSimulateDisconnect(false);

    if (mode === "cine") modeSwitchRef.current = 3;
    else if (mode === "position_hold") modeSwitchRef.current = 0;
    else if (mode === "altitude_hold") modeSwitchRef.current = 1;
    else modeSwitchRef.current = 2;

    setActiveTab("cockpit");

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const params = new URLSearchParams({
      exercise_id: exercise.id,
      mode,
      wind_scale: String(windScale),
      instructor_demo: String(instructorDemo),
      student_name: studentName || "Học viên Thực hành",
      device_id: connectedGamepadId || "Keyboard / USB Controller",
    });

    const ws = new WebSocket(`${proto}//${host}/ws/session?${params.toString()}`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "state") {
          const st = msg as WsStateMessage;
          if (st.t_client > 0) {
            const rtt = Math.max(1, performance.now() - st.t_client);
            setLatencyMs(rtt);
          }
          setSimState((prev) => ({
            t: st.t,
            pos: st.pos,
            vel: st.vel,
            rpy: st.rpy,
            wind: st.wind,
            sticks: st.sticks,
            mode: st.mode,
            armed: st.armed,
            onGround: st.on_ground,
            collided: st.collided,
            failsafe: st.failsafe,
            instructorDemo: st.instructor_demo,
            leadUav: st.lead_uav || null,
            minObstacleDist: st.min_obstacle_dist,
            exerciseProgress: st.exercise,
            events: st.events.length > 0 ? [...prev.events, ...st.events] : prev.events,
          }));

          uavAudio.updateMotorAudio(
            st.sticks[0],
            st.armed,
            st.on_ground,
            st.failsafe,
            st.min_obstacle_dist < 0.45
          );

          setTrailPoints((prev) => {
            const last = prev[prev.length - 1];
            if (
              !last ||
              Math.hypot(st.pos[0] - last[0], st.pos[1] - last[1], st.pos[2] - last[2]) >
                0.04
            ) {
              return [...prev.slice(-900), st.pos];
            }
            return prev;
          });
        } else if (msg.type === "completed") {
          const record = msg.session as SessionRecord;
          setCompletedReport(record);
          fetchInitialData();
          setActiveTab("report");
          closeActiveWs();
        }
      } catch {
        // ignore malformed frame
      }
    };
  };

  const sendSessionCommand = (
    action: "pause" | "resume" | "reset" | "toggle_demo" | "toggle_lead" | "end"
  ) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (action === "reset" && activeExercise) {
        setTrailPoints([activeExercise.start_pos]);
        setSimState((prev) => ({ ...prev, events: [] }));
      }
      ws.send(JSON.stringify({ type: "command", action }));
    }
  };

  const handleToggleAudio = () => {
    uavAudio.init();
    const next = uavAudio.toggleMute();
    setAudioEnabled(next);
  };

  const handleToggleLead = () => {
    const next = !leadGuideEnabled;
    setLeadGuideEnabled(next);
    sendSessionCommand("toggle_lead");
  };

  const handleOpenSavedSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const record = (await res.json()) as SessionRecord;
        setCompletedReport(record);
        setActiveTab("report");
      }
    } catch {
      // ignore
    }
  };

  const handleProfileChange = (next: ControllerProfile) => {
    setControllerProfile(next);
    saveControllerProfile(next);
  };

  const handleSwapGimbals = () => {
    const swapped = swapControllerGimbalSides(controllerProfile);
    if (connectedGamepadId) swapped.deviceId = connectedGamepadId;
    handleProfileChange(swapped);
  };

  const handleSelectRadioMaster = () => {
    const next = radiomasterControllerProfile(2);
    next.deviceId = connectedGamepadId || "RadioMaster Pocket (Mode 2: Ga Trái)";
    handleProfileChange(next);
  };

  const handleSelectXbox = () => {
    const next = defaultControllerProfile(2);
    next.deviceId = connectedGamepadId || "Xbox / Standard Gamepad (Mode 2)";
    handleProfileChange(next);
  };

  const leadUavDist =
    simState.leadUav && leadGuideEnabled
      ? Math.hypot(
          simState.leadUav.pos[0] - simState.pos[0],
          simState.leadUav.pos[1] - simState.pos[1],
          simState.leadUav.pos[2] - simState.pos[2]
        )
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#060a12] text-slate-100">
      {/* Top Aerospace Command Bar */}
      <header className="h-12 bg-slate-950/95 border-b border-slate-800/90 px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Crosshair className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm tracking-wide text-white">
            UAV SMART GCS
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
            v2.0
          </span>
        </div>

        <nav className="flex items-center gap-2">
          <button
            onClick={() => {
              closeActiveWs();
              setActiveTab("library");
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "library"
                ? "bg-emerald-600 text-white shadow"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Danh sách Bài tập
          </button>
          <button
            onClick={() => {
              closeActiveWs();
              setActiveTab("calibration");
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "calibration"
                ? "bg-emerald-600 text-white shadow"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Cấu hình Tay cầm &amp; Phím
          </button>
          {completedReport && (
            <button
              onClick={() => {
                closeActiveWs();
                setActiveTab("report");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === "report"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20"
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              Kết quả ({completedReport.assessment.total_score.toFixed(0)}đ)
            </button>
          )}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative">
        {activeTab === "library" && (
          <ExerciseLibraryScreen
            exercises={exercises}
            recentSessions={recentSessions}
            studentName={studentName}
            onStudentNameChange={setStudentName}
            mapPreset={mapPreset}
            onMapPresetChange={setMapPreset}
            onStartFlight={startFlightSession}
            onOpenSessionReport={handleOpenSavedSession}
          />
        )}

        {activeTab === "calibration" && (
          <CalibrationScreen
            profile={controllerProfile}
            rawAxes={rawAxes}
            liveStick={liveStick}
            connectedGamepadId={connectedGamepadId}
            onChangeProfile={handleProfileChange}
          />
        )}

        {activeTab === "report" && completedReport && (
          <AssessmentReplayScreen
            session={completedReport}
            onBackToLibrary={() => setActiveTab("library")}
            onRetryExercise={(exId) => {
              const ex = exercises.find((e) => e.id === exId) || activeExercise;
              if (ex) {
                startFlightSession(ex, ex.default_mode, 1.0, false);
              }
            }}
          />
        )}

        {activeTab === "cockpit" && activeExercise && (
          <div className="w-full h-[calc(100vh-3rem)] relative flex flex-col">
            {/* Compact Flight Control Strip */}
            <div className="h-10 bg-slate-950/95 border-b border-slate-800 px-3 flex items-center justify-between gap-2 z-20 font-mono text-[11px]">
              {/* Left: Back to Exercises + Camera View + 3D Map Preset Selector */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    closeActiveWs();
                    setActiveTab("library");
                  }}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer flex items-center gap-1 font-semibold transition"
                  title="Quay lại danh sách chọn Bài tập"
                >
                  ← Chọn Bài Tập
                </button>

                <span className="text-slate-700">|</span>

                <div className="flex items-center bg-slate-900 p-0.5 rounded border border-slate-800">
                  <button
                    onClick={() => setCameraMode("chase")}
                    className={`px-2 py-1 rounded-xs cursor-pointer flex items-center gap-1 font-semibold ${
                      cameraMode === "chase"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Camera bám đuôi phía sau UAV"
                  >
                    <Video className="w-3 h-3" />
                    BÁM ĐUÔI
                  </button>
                  <button
                    onClick={() => setCameraMode("fpv")}
                    className={`px-2 py-1 rounded-xs cursor-pointer flex items-center gap-1 font-semibold ${
                      cameraMode === "fpv"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Camera Gimbal chống rung gắn mũi UAV (Khóa chân trời)"
                  >
                    <Eye className="w-3 h-3" />
                    FPV GIMBAL
                  </button>
                  <button
                    onClick={() => setCameraMode("orbit")}
                    className={`px-2 py-1 rounded-xs cursor-pointer flex items-center gap-1 font-semibold ${
                      cameraMode === "orbit"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Xoay chuột 360° quanh UAV"
                  >
                    <Globe className="w-3 h-3" />
                    XOAY 360°
                  </button>
                  <button
                    onClick={() => setCameraMode("vlos")}
                    className={`px-2 py-1 rounded-xs cursor-pointer flex items-center gap-1 font-semibold ${
                      cameraMode === "vlos"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Góc nhìn Người lái đứng dưới mặt đất"
                  >
                    <Crosshair className="w-3 h-3" />
                    MẶT ĐẤT
                  </button>
                </div>

                <span className="text-slate-700">|</span>

                {/* 3D Terrain Map Selector (Filtered by Exercise Tier) */}
                <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  <Map className="w-3.5 h-3.5 text-cyan-400" />
                  <select
                    value={mapPreset}
                    onChange={(e) => setMapPreset(e.target.value as MapPreset)}
                    className="bg-transparent text-cyan-300 font-bold text-[11px] focus:outline-none cursor-pointer"
                  >
                    {getAllowedMapsForExercise(activeExercise.id).map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        className="bg-slate-950 text-slate-100"
                      >
                        {m.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>

                {getTierForExercise(activeExercise.id).allowedMaps.includes(
                  "google3d"
                ) && (
                  <button
                    onClick={() => setIsGoogle3dModalOpen(true)}
                    className="px-2 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 font-bold cursor-pointer flex items-center gap-1 transition"
                    title="Chọn tọa độ GPS thực tế hoặc dán link Google Maps bất kỳ"
                  >
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    GPS 3D
                  </button>
                )}
              </div>

              {/* Right: Clean Flight Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleToggleAudio}
                  className={`p-1.5 rounded border cursor-pointer flex items-center ${
                    audioEnabled
                      ? "bg-slate-900 text-emerald-300 border-emerald-500/40"
                      : "bg-slate-900 text-slate-500 border-slate-800"
                  }`}
                  title={audioEnabled ? "Tắt âm thanh động cơ" : "Bật âm thanh động cơ"}
                >
                  {audioEnabled ? (
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  onClick={handleToggleLead}
                  className={`px-2 py-1 rounded border cursor-pointer flex items-center gap-1 font-semibold ${
                    leadGuideEnabled
                      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
                      : "bg-slate-900 text-slate-500 border-slate-800"
                  }`}
                  title="Bật/Tắt UAV dẫn đường phía trước"
                >
                  <Radio className="w-3.5 h-3.5" />
                  DẪN ĐƯỜNG
                </button>

                <button
                  onClick={() => sendSessionCommand("toggle_demo")}
                  className={`px-2.5 py-1 rounded border cursor-pointer flex items-center gap-1 font-semibold ${
                    simState.instructorDemo
                      ? "bg-purple-600 text-white border-purple-400"
                      : "bg-slate-900 text-purple-300 border-purple-500/30 hover:bg-slate-800"
                  }`}
                  title="Bật chế độ Giáo viên AI tự động bay mẫu"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  {simState.instructorDemo ? "ĐANG BAY MẪU" : "BAY MẪU"}
                </button>

                <button
                  onClick={() => {
                    const next = !simulateDisconnect;
                    simulateDisconnectRef.current = next;
                    setSimulateDisconnect(next);
                  }}
                  className={`px-2 py-1 rounded border cursor-pointer flex items-center gap-1 font-semibold ${
                    simulateDisconnect
                      ? "bg-red-600 text-white border-red-400 animate-pulse"
                      : "bg-slate-900 text-amber-300 border-amber-500/30 hover:bg-slate-800"
                  }`}
                  title="Giả lập mất sóng điều khiển để kiểm tra Failsafe"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {simulateDisconnect ? "MẤT SÓNG" : "FAILSAFE"}
                </button>

                <button
                  onClick={() => sendSessionCommand("reset")}
                  className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer flex items-center gap-1"
                  title="Đặt lại UAV về vị trí xuất phát"
                >
                  <RotateCcw className="w-3 h-3" />
                  LÀM LẠI
                </button>

                <button
                  onClick={() => sendSessionCommand("end")}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer flex items-center gap-1 shadow"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  CHẤM ĐIỂM
                </button>
              </div>
            </div>

            {/* 3D World Viewport + Glass Cockpit PFD Overlay */}
            <div className="flex-1 relative">
              <FlightScene3D
                pos={simState.pos}
                rpy={simState.rpy}
                wind={simState.wind}
                armed={simState.armed}
                onGround={simState.onGround}
                collided={simState.collided}
                startPos={activeExercise.start_pos}
                stages={activeExercise.stages}
                activeStageIndex={simState.exerciseProgress?.stage_index || 0}
                obstacles={activeExercise.environment.obstacles}
                trailPoints={trailPoints}
                cameraMode={cameraMode}
                mapPreset={mapPreset}
                google3dConfig={google3dConfig}
                leadUav={leadGuideEnabled ? simState.leadUav : null}
                onFpsUpdate={setFps}
              />

              <CockpitHud
                t={simState.t}
                pos={simState.pos}
                vel={simState.vel}
                rpy={simState.rpy}
                wind={simState.wind}
                sticks={simState.sticks}
                mode={simState.mode}
                armed={simState.armed}
                failsafe={simState.failsafe}
                instructorDemo={simState.instructorDemo}
                leadGuideEnabled={leadGuideEnabled}
                leadUavDist={leadUavDist}
                minObstacleDist={simState.minObstacleDist}
                exerciseProgress={simState.exerciseProgress}
                recentEvents={simState.events}
                fps={fps}
                latencyMs={latencyMs}
                activeDeviceName={
                  connectedGamepadId
                    ? connectedGamepadId.slice(0, 28)
                    : "Bàn phím (WASD + Mũi tên)"
                }
                audioEnabled={audioEnabled}
                onToggleAudio={handleToggleAudio}
                onToggleLead={handleToggleLead}
                controllerProfile={controllerProfile}
                connectedGamepadId={connectedGamepadId}
                onSwapGimbals={handleSwapGimbals}
                onSelectRadioMaster={handleSelectRadioMaster}
                onSelectXbox={handleSelectXbox}
                onSelectFlightMode={(sw) => {
                  modeSwitchRef.current = sw;
                }}
                startPos={activeExercise.start_pos}
                stages={activeExercise.stages}
                obstacles={activeExercise.environment.obstacles}
                trailPoints={trailPoints}
              />
            </div>
          </div>
        )}

        <GoogleMaps3DModal
          isOpen={isGoogle3dModalOpen}
          currentConfig={google3dConfig}
          onClose={() => setIsGoogle3dModalOpen(false)}
          onApplyConfig={(cfg) => {
            saveGoogle3DConfig(cfg);
            setGoogle3dConfig(cfg);
            setMapPreset("google3d");
          }}
        />
      </main>
    </div>
  );
};
