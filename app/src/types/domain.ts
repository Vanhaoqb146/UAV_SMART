export type FlightMode = "cine" | "position_hold" | "altitude_hold" | "angle" | "failsafe";

export interface StickInput {
  throttle: number; // [0..1]
  yaw: number;      // [-1..1]
  pitch: number;    // [-1..1]
  roll: number;     // [-1..1]
  arm: boolean;
  modeSwitch: 0 | 1 | 2 | 3;
}

export interface AxisCalib {
  axisIndex: number;
  min: number;
  center: number;
  max: number;
  deadzone: number;
  expo: number;
  invert: boolean;
}

export interface ControllerProfile {
  deviceId: string;
  stickMode: 1 | 2; // Mode 2 default (Throttle + Yaw on left stick)
  throttle: AxisCalib;
  yaw: AxisCalib;
  pitch: AxisCalib;
  roll: AxisCalib;
}

export interface ObstacleSpec {
  x: number;
  y: number;
  r: number;
  h: number;
  kind?: "pillar" | "tree" | "building";
  sx?: number;
  sy?: number;
  crown_r?: number;
}

export interface ExerciseStageSpec {
  name: string;
  kind: "reach" | "hold" | "land";
  target: [number, number, number];
  radius: number;
  hold_sec: number;
  max_landing_vz: number;
  hint: string;
}

export interface ExerciseSpec {
  id: string;
  code: string;
  version: number;
  title: string;
  difficulty: "Cơ bản" | "Trung bình" | "Nâng cao" | "Sát hạch";
  summary: string;
  objectives: string[];
  default_mode: FlightMode;
  time_limit_sec: number;
  corridor_radius: number;
  start_pos: [number, number, number];
  start_yaw: number;
  environment: {
    wind_max: number;
    gust_sigma: number;
    map_preset?:
      | "landmark81"
      | "google3d"
      | "airbase"
      | "urban"
      | "forest"
      | "tactical"
      | "photogrammetry"
      | "bellus"
      | null;
    arena_bounds?: [number, number, number] | null;
    speed_scale?: number;
    obstacles: ObstacleSpec[];
  };
  stages: ExerciseStageSpec[];
}

export interface ExerciseProgressState {
  id: string;
  title: string;
  stage_index: number;
  total_stages: number;
  progress: number;
  hint: string;
  target_pos: [number, number, number];
  corridor_deviation: number;
  completed: boolean;
  failed: boolean;
  fail_reason: string;
}

export interface FlightEventItem {
  t: number;
  kind: "info" | "warning" | "danger" | "success";
  code: string;
  text: string;
}

export interface LeadUavGuide {
  pos: [number, number, number];
  rpy: [number, number, number];
}

export interface WsStateMessage {
  type: "state";
  schema: string;
  session_id: string;
  seq_ack: number;
  t_client: number;
  t: number;
  pos: [number, number, number];
  vel: [number, number, number];
  rpy: [number, number, number];
  wind: [number, number, number];
  sticks: [number, number, number, number];
  mode: FlightMode;
  armed: boolean;
  on_ground: boolean;
  collided: boolean;
  failsafe: boolean;
  instructor_demo: boolean;
  lead_guide_enabled?: boolean;
  lead_uav?: LeadUavGuide | null;
  min_obstacle_dist: number;
  exercise: ExerciseProgressState;
  events: FlightEventItem[];
}

export interface RubricCategory {
  key: string;
  label: string;
  score: number;
  max_score: number;
  rationale: string;
}

export interface ControlBehaviorMetrics {
  duration_sec: number;
  path_length_m: number;
  altitude_rmse_m: number;
  corridor_rmse_m: number;
  in_corridor_ratio: number;
  landing_vertical_speed_mps: number;
  min_obstacle_clearance_m: number;
  stick_jerk_rms: number;
  overcontrol_index: number;
  stick_saturation_ratio: number;
}

export interface PilotFaultDiagnostic {
  code: string;
  label: string;
  severity: "low" | "med" | "high";
  evidence: string;
  tip: string;
}

export interface AssessmentReport {
  rubric_version: string;
  total_score: number;
  passed: boolean;
  grade: string;
  categories: RubricCategory[];
  metrics: ControlBehaviorMetrics;
  faults?: PilotFaultDiagnostic[];
  strengths: string[];
  diagnostics: string[];
  recommendations: string[];
}

export interface SessionFrame {
  t: number;
  p: [number, number, number];
  v: [number, number, number];
  rpy: [number, number, number];
  in: [number, number, number, number];
  mode: number;
  wind?: [number, number, number];
  tgt?: [number, number, number];
  cdev?: number;
  odist?: number;
  stage?: number;
}

export interface SessionRecord {
  schema: string;
  session_id: string;
  started_at: string;
  student: {
    id: string;
    name: string;
    instructor_demo: boolean;
  };
  exercise: {
    id: string;
    code: string;
    title: string;
    seed: number;
    corridor_radius: number;
  };
  world: {
    start: [number, number, number];
    waypoints: [number, number, number][];
    stages?: ExerciseStageSpec[];
    obstacles: ObstacleSpec[];
  };
  frames: SessionFrame[];
  events: FlightEventItem[];
  outcome: {
    completed: boolean;
    crashed: boolean;
    reason: string;
  };
  assessment: AssessmentReport;
}

export interface SessionSummary {
  session_id: string;
  started_at: string;
  student: { id: string; name: string; instructor_demo: boolean };
  exercise: { id: string; code: string; title: string };
  outcome: { completed: boolean; crashed: boolean; reason: string };
  total_score: number;
  grade: string;
  passed: boolean;
  duration_sec: number;
  frames_count: number;
  faults?: PilotFaultDiagnostic[];
}
