"""Quantitative 100-point Rubric Grader & Stick Control Behavior Analyzer.

Computes verifiable metrics strictly from recorded flight frames (`uav-session/1`),
detecting pilot-induced oscillation (over-control), stick jerk, corridor deviation,
altitude RMSE, safety margins, and 6 concrete Vietnamese stick-control faults
(`tay_run`, `gat_can`, `over_control`, `lao_dao`, `cao_do`, `tiep_dat`).
"""

from __future__ import annotations

from dataclasses import dataclass
import math
import numpy as np

from uavsim.exercises.models import ExerciseDefinition

RUBRIC_VERSION = "rubric-v2.0"


@dataclass(frozen=True)
class ControlBehaviorMetrics:
    duration_sec: float
    path_length_m: float
    altitude_rmse_m: float
    corridor_rmse_m: float
    in_corridor_ratio: float
    landing_vertical_speed_mps: float
    min_obstacle_clearance_m: float
    stick_jerk_rms: float
    overcontrol_index: float
    stick_saturation_ratio: float

    def to_dict(self) -> dict[str, float]:
        return {
            "duration_sec": round(self.duration_sec, 2),
            "path_length_m": round(self.path_length_m, 3),
            "altitude_rmse_m": round(self.altitude_rmse_m, 3),
            "corridor_rmse_m": round(self.corridor_rmse_m, 3),
            "in_corridor_ratio": round(self.in_corridor_ratio, 4),
            "landing_vertical_speed_mps": round(self.landing_vertical_speed_mps, 3),
            "min_obstacle_clearance_m": round(self.min_obstacle_clearance_m, 3),
            "stick_jerk_rms": round(self.stick_jerk_rms, 3),
            "overcontrol_index": round(self.overcontrol_index, 3),
            "stick_saturation_ratio": round(self.stick_saturation_ratio, 4),
        }


@dataclass(frozen=True)
class RubricCategoryScore:
    key: str
    label: str
    score: float
    max_score: float
    rationale: str

    def to_dict(self) -> dict[str, object]:
        return {
            "key": self.key,
            "label": self.label,
            "score": round(self.score, 1),
            "max_score": round(self.max_score, 1),
            "rationale": self.rationale,
        }


@dataclass(frozen=True)
class PilotFaultDiagnostic:
    code: str
    label: str
    severity: str  # "low" | "med" | "high"
    evidence: str
    tip: str

    def to_dict(self) -> dict[str, str]:
        return {
            "code": self.code,
            "label": self.label,
            "severity": self.severity,
            "evidence": self.evidence,
            "tip": self.tip,
        }


@dataclass(frozen=True)
class AssessmentReport:
    rubric_version: str
    total_score: float
    passed: bool
    grade: str
    categories: list[RubricCategoryScore]
    metrics: ControlBehaviorMetrics
    faults: list[PilotFaultDiagnostic]
    strengths: list[str]
    diagnostics: list[str]
    recommendations: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "rubric_version": self.rubric_version,
            "total_score": round(self.total_score, 1),
            "passed": self.passed,
            "grade": self.grade,
            "categories": [c.to_dict() for c in self.categories],
            "metrics": self.metrics.to_dict(),
            "faults": [f.to_dict() for f in self.faults],
            "strengths": self.strengths,
            "diagnostics": self.diagnostics,
            "recommendations": self.recommendations,
        }


def compute_control_metrics(
    frames: list[dict[str, object]],
    ctrl_hz: int = 60,
) -> ControlBehaviorMetrics:
    if not frames:
        return ControlBehaviorMetrics(
            duration_sec=0.0,
            path_length_m=0.0,
            altitude_rmse_m=0.0,
            corridor_rmse_m=0.0,
            in_corridor_ratio=1.0,
            landing_vertical_speed_mps=0.0,
            min_obstacle_clearance_m=99.0,
            stick_jerk_rms=0.0,
            overcontrol_index=0.0,
            stick_saturation_ratio=0.0,
        )

    dt = 1.0 / max(1, ctrl_hz)
    positions = np.array([f["p"] for f in frames], dtype=np.float64)
    velocities = np.array([f["v"] for f in frames], dtype=np.float64)
    sticks = np.array([f["in"] for f in frames], dtype=np.float64)
    targets = np.array([f.get("tgt", f["p"]) for f in frames], dtype=np.float64)
    corridor_devs = np.array([float(f.get("cdev", 0.0)) for f in frames], dtype=np.float64)
    obs_dists = np.array([float(f.get("odist", 99.0)) for f in frames], dtype=np.float64)

    duration_sec = max(dt, float(frames[-1]["t"]) - float(frames[0]["t"]))
    if len(positions) >= 2:
        diffs = np.diff(positions, axis=0)
        path_length_m = float(np.sum(np.linalg.norm(diffs, axis=1)))
    else:
        path_length_m = 0.0

    alt_errs = positions[:, 2] - targets[:, 2]
    altitude_rmse_m = float(np.sqrt(np.mean(alt_errs**2)))
    corridor_rmse_m = float(np.sqrt(np.mean(corridor_devs**2)))
    in_corridor_ratio = float(np.mean(corridor_devs <= 1e-4))
    landing_vz = float(abs(velocities[-1, 2]))
    min_obs_clearance = float(np.min(obs_dists))

    # Stick jerk & over-control oscillation index on [throttle, yaw, pitch, roll]
    if len(sticks) >= 4:
        d1 = np.diff(sticks, axis=0) / dt
        d2 = np.diff(d1, axis=0) / dt
        stick_jerk_rms = float(np.sqrt(np.mean(d2**2)))

        # Count rapid sign reversals on pitch (idx 2) and roll (idx 3) rate
        reversals = 0
        for axis in (2, 3):
            rate = d1[:, axis]
            active = np.abs(rate) > 0.35
            signs = np.sign(rate)
            for k in range(1, len(signs)):
                if active[k] and active[k - 1] and signs[k] != signs[k - 1]:
                    reversals += 1
        overcontrol_index = float(reversals) / max(1.0, duration_sec)
    else:
        stick_jerk_rms = 0.0
        overcontrol_index = 0.0

    # Saturation ratio: throttle near 0 or 1, or yaw/pitch/roll near ±1
    th_sat = (sticks[:, 0] > 0.94) | (sticks[:, 0] < 0.03)
    rp_sat = np.any(np.abs(sticks[:, 1:4]) > 0.92, axis=1)
    stick_saturation_ratio = float(np.mean(th_sat | rp_sat))

    return ControlBehaviorMetrics(
        duration_sec=duration_sec,
        path_length_m=path_length_m,
        altitude_rmse_m=altitude_rmse_m,
        corridor_rmse_m=corridor_rmse_m,
        in_corridor_ratio=in_corridor_ratio,
        landing_vertical_speed_mps=landing_vz,
        min_obstacle_clearance_m=min_obs_clearance,
        stick_jerk_rms=stick_jerk_rms,
        overcontrol_index=overcontrol_index,
        stick_saturation_ratio=stick_saturation_ratio,
    )


def detect_pilot_faults(
    frames: list[dict[str, object]],
    metrics: ControlBehaviorMetrics,
    exercise: ExerciseDefinition,
    ctrl_hz: int = 60,
) -> list[PilotFaultDiagnostic]:
    """Detects 6 concrete Vietnamese pilot faults from flight telemetry."""
    if len(frames) < 6:
        return []

    dt = 1.0 / max(1, ctrl_hz)
    dur_min = max(metrics.duration_sec / 60.0, 0.08)
    positions = np.array([f["p"] for f in frames], dtype=np.float64)
    velocities = np.array([f["v"] for f in frames], dtype=np.float64)
    rpys = np.array([f.get("rpy", [0.0, 0.0, 0.0]) for f in frames], dtype=np.float64)
    sticks = np.array([f["in"] for f in frames], dtype=np.float64)
    targets = np.array([f.get("tgt", f["p"]) for f in frames], dtype=np.float64)

    faults: list[PilotFaultDiagnostic] = []

    # 1. Tay run (High-frequency hand tremor via median 2nd-order stick difference)
    dd_rp = sticks[2:, 2:4] - 2.0 * sticks[1:-1, 2:4] + sticks[:-2, 2:4]
    jitter_med = float(np.median(np.abs(dd_rp))) if len(dd_rp) > 0 else 0.0
    if jitter_med > 0.015:
        faults.append(
            PilotFaultDiagnostic(
                code="tay_run",
                label="Tay run tần số cao",
                severity="high" if jitter_med > 0.035 else "med",
                evidence=f"Sai phân bậc 2 cần = {jitter_med:.3f}",
                tip="Thả lỏng ngón cái, tì nhẹ cạnh tay cầm để ổn định và tăng Expo 25–35%.",
            )
        )

    # 2. Gắt cần (Abrupt stick movement via 95th percentile stick rate)
    d1 = np.abs(np.diff(sticks, axis=0)) / dt
    p95_rate = float(np.percentile(d1, 95)) if len(d1) > 0 else 0.0
    if p95_rate > 3.8:
        faults.append(
            PilotFaultDiagnostic(
                code="gat_can",
                label="Gắt cần (Giật cần đột ngột)",
                severity="high" if p95_rate > 6.8 else "med",
                evidence=f"Tốc độ đẩy cần p95 = {p95_rate:.1f} full-travel/s",
                tip="Đẩy cần mượt như vặn núm âm lượng; tránh đẩy kịch biên rồi giật ngược.",
            )
        )

    # 3. Over-control & 4. Lảo đảo (Stick reversals + velocity zero-crossings + tilt std)
    vel_osc = 0
    for axis in (0, 1):
        v_seq = velocities[:, axis]
        for k in range(1, len(v_seq)):
            if abs(v_seq[k]) > 0.08 and abs(v_seq[k - 1]) > 0.08:
                if (v_seq[k] > 0) != (v_seq[k - 1] > 0):
                    vel_osc += 1
    vel_osc_per_min = float(vel_osc) / dur_min
    rev_per_min = metrics.overcontrol_index * 60.0

    if rev_per_min > 65.0 or (rev_per_min > 40.0 and vel_osc_per_min > 18.0):
        faults.append(
            PilotFaultDiagnostic(
                code="over_control",
                label="Over-control (Sửa sai quá tay)",
                severity="high" if rev_per_min > 105.0 else "med",
                evidence=f"{rev_per_min:.0f} lần đảo cần/phút · {vel_osc_per_min:.0f} dao động vận tốc/phút",
                tip="Sau mỗi nhịp sửa cần, trả về vị trí giữa và chờ 0.5s để UAV ổn định quán tính.",
            )
        )

    tilt_deg = np.degrees(np.hypot(rpys[:, 0], rpys[:, 1]))
    tilt_std = float(np.std(tilt_deg))
    if tilt_std > 6.5 or vel_osc_per_min > 24.0:
        faults.append(
            PilotFaultDiagnostic(
                code="lao_dao",
                label="Lảo đảo thân UAV",
                severity="high" if tilt_std > 10.5 else "med",
                evidence=f"Độ lệch chuẩn góc nghiêng σ = {tilt_std:.1f}°",
                tip="Giữ biên độ nghiêng Pitch/Roll nhỏ (< 12°), mắt nhìn xa theo mốc dẫn đường.",
            )
        )

    # 5. Giữ độ cao kém (Altitude RMSE)
    if metrics.altitude_rmse_m > 0.38:
        faults.append(
            PilotFaultDiagnostic(
                code="cao_do",
                label="Giữ độ cao chưa ổn định",
                severity="high" if metrics.altitude_rmse_m > 0.65 else "med",
                evidence=f"Sai số độ cao RMSE = {metrics.altitude_rmse_m:.2f}m",
                tip="Nhích cần Ga (Throttle) từng nhịp rất nhỏ quanh điểm treo cân bằng 50%.",
            )
        )

    # 6. Tiếp đất mạnh / Lệch bãi đáp (Hard or off-center landing)
    has_land_stage = any(st.kind == "land" for st in exercise.stages)
    if has_land_stage and len(positions) > 0:
        land_xy_err = float(np.linalg.norm(positions[-1, :2] - targets[-1, :2]))
        if metrics.landing_vertical_speed_mps > 0.45 or land_xy_err > 0.48:
            faults.append(
                PilotFaultDiagnostic(
                    code="tiep_dat",
                    label="Tiếp đất mạnh / Lệch tâm",
                    severity="high" if metrics.landing_vertical_speed_mps > 0.85 else "med",
                    evidence=f"|Vz| chạm đất = {metrics.landing_vertical_speed_mps:.2f} m/s · Lệch tâm = {land_xy_err:.2f}m",
                    tip="Khi cách mặt đất < 0.5m, giữ nhẹ cần Ga để hãm tốc độ rơi |Vz| < 0.35 m/s.",
                )
            )

    return faults


def evaluate_session_rubric(
    exercise: ExerciseDefinition,
    frames: list[dict[str, object]],
    events: list[dict[str, object]],
    stage_index: int,
    completed: bool,
    crashed: bool,
    ctrl_hz: int = 60,
) -> AssessmentReport:
    metrics = compute_control_metrics(frames, ctrl_hz=ctrl_hz)
    faults = detect_pilot_faults(frames, metrics, exercise, ctrl_hz=ctrl_hz)
    w = exercise.rubric_weights
    total_stages = max(1, len(exercise.stages))
    stage_ratio = min(1.0, float(stage_index) / float(total_stages))

    # 1. Trajectory & Altitude Accuracy (max w.accuracy, default 40)
    corridor_factor = 0.65 * metrics.in_corridor_ratio + 0.35 * math.exp(-2.2 * metrics.corridor_rmse_m)
    alt_factor = math.exp(-1.1 * max(0.0, metrics.altitude_rmse_m - 0.15))
    attempt_scale = 1.0 if completed else (0.35 + 0.65 * stage_ratio)
    acc_score = float(np.clip(w.accuracy * (0.6 * corridor_factor + 0.4 * alt_factor) * attempt_scale, 0.0, w.accuracy))

    # 2. Task Completion & Landing Quality (max w.completion, default 25)
    comp_base = w.completion * (1.0 if completed else 0.75 * stage_ratio)
    if any(st.kind == "land" for st in exercise.stages) and completed:
        if metrics.landing_vertical_speed_mps > 0.45:
            comp_base -= min(5.0, (metrics.landing_vertical_speed_mps - 0.45) * 15.0)
    comp_score = float(np.clip(comp_base, 0.0, w.completion))

    # 3. Stick Control Smoothness (max w.control_smoothness, default 20)
    jerk_penalty = min(8.0, max(0.0, (metrics.stick_jerk_rms - 18.0) * 0.08))
    overctrl_penalty = min(9.0, max(0.0, (metrics.overcontrol_index - 1.5) * 2.2))
    sat_penalty = min(4.0, metrics.stick_saturation_ratio * 10.0)
    ctrl_score = float(np.clip(w.control_smoothness - jerk_penalty - overctrl_penalty - sat_penalty, 0.0, w.control_smoothness))

    # 4. Flight Safety (max w.safety, default 15)
    has_failsafe = any(e.get("code") == "FAILSAFE_TRIGGERED" for e in events)
    has_oob = any(e.get("code") == "OUT_OF_BOUNDS" for e in events)
    if crashed:
        safety_score = 0.0
    else:
        safety_pen = 0.0
        if has_failsafe:
            safety_pen += 5.0
        if has_oob:
            safety_pen += 8.0
        if metrics.min_obstacle_clearance_m < 0.20:
            safety_pen += (0.20 - metrics.min_obstacle_clearance_m) * 35.0
        safety_score = float(np.clip(w.safety - safety_pen, 0.0, w.safety))

    total_score = round(acc_score + comp_score + ctrl_score + safety_score, 1)
    passed = bool(completed and not crashed and total_score >= 70.0)

    if crashed:
        grade = "Chưa đạt (Va chạm)"
    elif passed and total_score >= 85.0:
        grade = "Xuất sắc"
    elif passed:
        grade = "Đạt"
    elif total_score >= 55.0:
        grade = "Cần luyện thêm"
    else:
        grade = "Chưa đạt"

    categories = [
        RubricCategoryScore(
            key="accuracy",
            label="Độ chính xác Quỹ đạo & Độ cao",
            score=acc_score,
            max_score=w.accuracy,
            rationale=f"Tỷ lệ trong hành lang: {metrics.in_corridor_ratio * 100:.1f}%, RMSE độ cao: {metrics.altitude_rmse_m:.2f}m",
        ),
        RubricCategoryScore(
            key="completion",
            label="Hoàn thành Mốc bài tập",
            score=comp_score,
            max_score=w.completion,
            rationale=f"Đạt {stage_index}/{total_stages} giai đoạn ({'Hoàn thành' if completed else 'Chưa trọn vẹn'})",
        ),
        RubricCategoryScore(
            key="control_smoothness",
            label="Kỹ năng Thao tác Cần điều khiển",
            score=ctrl_score,
            max_score=w.control_smoothness,
            rationale=f"Chỉ số chỉnh quá mức (Over-control): {metrics.overcontrol_index:.2f} lần/s, Độ giật cần: {metrics.stick_jerk_rms:.1f}",
        ),
        RubricCategoryScore(
            key="safety",
            label="An toàn Bay & Khoảng hở",
            score=safety_score,
            max_score=w.safety,
            rationale="An toàn tuyệt đối, không va chạm" if not crashed else "Xảy ra va chạm hoặc mất an toàn",
        ),
    ]

    strengths: list[str] = []
    diagnostics: list[str] = []
    recommendations: list[str] = []

    if metrics.in_corridor_ratio >= 0.88:
        strengths.append(f"Giữ hành lang bay rất tốt ({metrics.in_corridor_ratio * 100:.1f}% thời gian trong chuẩn).")
    else:
        diagnostics.append(f"UAV lệch khỏi hành lang chuẩn (RMSE lệch hành lang {metrics.corridor_rmse_m:.2f}m).")
        recommendations.append("Chủ động giảm tốc độ trước khi vào góc cua và bù nhẹ góc nghiêng ngược hướng gió.")

    if len(faults) == 0 and metrics.overcontrol_index <= 1.5 and metrics.stick_jerk_rms <= 22.0:
        strengths.append("Thao tác cần điều khiển mượt mà, không bị lắc cần (Over-control thấp).")
    else:
        for f in faults:
            diagnostics.append(f"{f.label}: {f.evidence}.")
            recommendations.append(f.tip)
        if not any(f.code == "over_control" for f in faults) and (
            metrics.overcontrol_index > 1.5 or metrics.stick_jerk_rms > 22.0
        ):
            diagnostics.append(
                f"Phát hiện hiện tượng chỉnh cần quá mức (Over-control = {metrics.overcontrol_index:.2f} lần đảo/s, Jerk = {metrics.stick_jerk_rms:.1f})."
            )
            recommendations.append(
                "Đẩy cần Pitch/Roll với biên độ nhỏ hơn (< 40%) và tăng Expo trên màn hình Hiệu chuẩn Tay cầm để làm mượt vùng trung tâm."
            )

    if completed:
        strengths.append(f"Hoàn thành đầy đủ {total_stages}/{total_stages} mốc nhiệm vụ của bài {exercise.code}.")
    else:
        diagnostics.append(f"Mới hoàn thành {stage_index}/{total_stages} mốc của bài tập {exercise.code}.")
        recommendations.append("Bạn có thể bật chế độ 'Xem Bay Mẫu Tự Động' để quan sát quỹ đạo và nhịp đẩy cần chuẩn.")

    if crashed:
        diagnostics.append("Phiên bay kết thúc sớm do va chạm vật lý.")
        recommendations.append("Giữ khoảng cách tối thiểu 0.35m với cột chướng ngại vật và kiểm soát tốc độ hạ độ cao |vz| < 0.5 m/s khi gần mặt đất.")

    return AssessmentReport(
        rubric_version=RUBRIC_VERSION,
        total_score=total_score,
        passed=passed,
        grade=grade,
        categories=categories,
        metrics=metrics,
        faults=faults,
        strengths=strengths,
        diagnostics=diagnostics,
        recommendations=recommendations,
    )
