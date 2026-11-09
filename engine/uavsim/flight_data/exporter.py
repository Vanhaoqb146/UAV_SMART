"""Exporters for `uav-session/1` to CSV, Parquet (via Polars), and legacy `drone-traj/1`."""

from __future__ import annotations

from pathlib import Path
import polars as pl


def _session_frames_to_dataframe(session_data: dict[str, object]) -> pl.DataFrame:
    frames = list(session_data.get("frames", []))  # type: ignore[arg-type]
    rows: list[dict[str, object]] = []
    for f in frames:
        p = f["p"]
        v = f["v"]
        rpy = f["rpy"]
        u = f["in"]
        w = f.get("wind") or [0.0, 0.0, 0.0]
        tgt = f.get("tgt") or [0.0, 0.0, 0.0]
        rows.append(
            {
                "t": float(f["t"]),
                "x": float(p[0]),
                "y": float(p[1]),
                "z": float(p[2]),
                "vx": float(v[0]),
                "vy": float(v[1]),
                "vz": float(v[2]),
                "roll": float(rpy[0]),
                "pitch": float(rpy[1]),
                "yaw": float(rpy[2]),
                "throttle": float(u[0]),
                "stick_yaw": float(u[1]),
                "stick_pitch": float(u[2]),
                "stick_roll": float(u[3]),
                "mode": int(f.get("mode", 0)),
                "wind_x": float(w[0]),
                "wind_y": float(w[1]),
                "wind_z": float(w[2]),
                "target_x": float(tgt[0]),
                "target_y": float(tgt[1]),
                "target_z": float(tgt[2]),
                "corridor_dev": float(f.get("cdev", 0.0)),
                "obstacle_dist": float(f.get("odist", 99.0)),
                "stage": int(f.get("stage", 0)),
            }
        )
    return pl.DataFrame(rows)


def export_session_csv(session_data: dict[str, object], out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df = _session_frames_to_dataframe(session_data)
    df.write_csv(out_path)
    return out_path


def export_session_parquet(session_data: dict[str, object], out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df = _session_frames_to_dataframe(session_data)
    df.write_parquet(out_path)
    return out_path


def to_legacy_drone_traj(session_data: dict[str, object]) -> dict[str, object]:
    """Convert `uav-session/1` into backward-compatible `drone-traj/1` format."""
    ex = session_data.get("exercise", {})  # type: ignore[assignment]
    world = session_data.get("world", {})  # type: ignore[assignment]
    outcome = session_data.get("outcome", {})  # type: ignore[assignment]
    waypoints = world.get("waypoints", [[0.0, 0.0, 1.5]])
    goal = waypoints[-1] if waypoints else [0.0, 0.0, 1.5]

    legacy_frames = []
    for f in session_data.get("frames", []):  # type: ignore[union-attr]
        legacy_frames.append(
            {
                "t": f["t"],
                "p": f["p"],
                "rpy": f["rpy"],
                "v": f["v"],
                "w": f.get("wind"),
                "target": f.get("tgt"),
            }
        )

    return {
        "schema": "drone-traj/1",
        "meta": {
            "stage": ex.get("code", "BT01"),
            "Controller": "human_usb" if not session_data.get("student", {}).get("instructor_demo") else "instructor_demo",
            "seed": ex.get("seed", 9000),
            "dt": round(1.0 / float(session_data.get("engine", {}).get("ctrl_hz", 60)), 4),
            "success": bool(outcome.get("completed", False)),
            "crashed": bool(outcome.get("crashed", False)),
            "reason": str(outcome.get("reason", "")),
        },
        "world": {
            "arena": world.get("arena", {"x": [-6.0, 6.0], "y": [-6.0, 6.0], "z_max": 4.5}),
            "goal": goal,
            "waypoints": waypoints,
            "obstacles": world.get("obstacles", []),
        },
        "frames": legacy_frames,
        "events": session_data.get("events", []),
    }
