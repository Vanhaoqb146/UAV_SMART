"""FastAPI REST API and 60Hz WebSocket transport (`uav-ws/1`) for UAV Smart Training."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from uavsim.domain.types import FlightModeType, SessionConfig, StickInput
from uavsim.exercises.models import load_exercise_catalog
from uavsim.flight_data.exporter import (
    export_session_csv,
    export_session_parquet,
    to_legacy_drone_traj,
)
from uavsim.flight_data.replay import verify_deterministic_replay
from uavsim.session.loop import FlightSession

DEFAULT_SESSIONS_DIR = Path(__file__).resolve().parents[2] / "data" / "sessions"


class DemoGenerateRequest(BaseModel):
    exercise_id: str = "BT01"
    seed: int = 9000
    wind_scale: float = 1.0
    max_steps: int = 2400


def _serialize_exercise(ex) -> dict[str, object]:
    return {
        "id": ex.id,
        "code": ex.code,
        "version": ex.version,
        "title": ex.title,
        "difficulty": ex.difficulty,
        "summary": ex.summary,
        "objectives": ex.objectives,
        "default_mode": ex.default_mode.value,
        "time_limit_sec": ex.time_limit_sec,
        "corridor_radius": ex.corridor_radius,
        "start_pos": list(ex.start_pos),
        "start_yaw": ex.start_yaw,
        "environment": {
            "wind_max": ex.environment.wind_max,
            "gust_sigma": ex.environment.gust_sigma,
            "map_preset": ex.environment.map_preset,
            "arena_bounds": list(ex.environment.arena_bounds) if ex.environment.arena_bounds else None,
            "speed_scale": ex.environment.speed_scale,
            "obstacles": [obs.to_dict() for obs in ex.get_obstacles()],
        },
        "stages": [
            {
                "name": st.name,
                "kind": st.kind,
                "target": list(st.target),
                "radius": st.radius,
                "hold_sec": st.hold_sec,
                "max_landing_vz": st.max_landing_vz,
                "hint": st.hint,
            }
            for st in ex.stages
        ],
        "rubric_weights": ex.rubric_weights.model_dump(),
    }


def create_app(sessions_dir: Path | None = None) -> FastAPI:
    store_dir = sessions_dir or DEFAULT_SESSIONS_DIR
    store_dir.mkdir(parents=True, exist_ok=True)

    api = FastAPI(
        title="UAV Smart Training Engine API",
        version="1.0.0",
    )
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/api/health")
    def get_health() -> dict[str, object]:
        catalog = load_exercise_catalog()
        return {
            "status": "ok",
            "engine": "uav-smart-training-1.0.0",
            "physics": "pybullet-240hz",
            "exercises_count": len(catalog),
            "sessions_dir": str(store_dir),
        }

    @api.get("/api/exercises")
    def list_exercises() -> list[dict[str, object]]:
        catalog = load_exercise_catalog()
        return [_serialize_exercise(ex) for ex in catalog.values()]

    @api.get("/api/exercises/{exercise_id}")
    def get_exercise(exercise_id: str) -> dict[str, object]:
        catalog = load_exercise_catalog()
        if exercise_id not in catalog:
            raise HTTPException(status_code=404, detail=f"Exercise '{exercise_id}' not found")
        return _serialize_exercise(catalog[exercise_id])

    @api.get("/api/sessions")
    def list_sessions() -> list[dict[str, object]]:
        files = sorted(store_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        summaries: list[dict[str, object]] = []
        for fpath in files:
            try:
                raw = json.loads(fpath.read_text(encoding="utf-8"))
                if raw.get("schema") != "uav-session/1":
                    continue
                assess = raw.get("assessment") or {}
                metrics = assess.get("metrics") or {}
                summaries.append(
                    {
                        "session_id": raw["session_id"],
                        "started_at": raw.get("started_at", ""),
                        "student": raw.get("student", {}),
                        "exercise": raw.get("exercise", {}),
                        "outcome": raw.get("outcome", {}),
                        "total_score": assess.get("total_score", 0.0),
                        "grade": assess.get("grade", "Chưa chấm"),
                        "passed": assess.get("passed", False),
                        "duration_sec": metrics.get("duration_sec", 0.0),
                        "frames_count": len(raw.get("frames", [])),
                        "faults": assess.get("faults", []),
                    }
                )
            except Exception:
                continue
        return summaries

    @api.get("/api/sessions/{session_id}")
    def get_session(session_id: str) -> dict[str, object]:
        fpath = store_dir / f"{session_id}.json"
        if not fpath.is_file():
            raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
        return json.loads(fpath.read_text(encoding="utf-8"))

    @api.post("/api/sessions/{session_id}/verify-replay")
    def verify_session_replay(session_id: str) -> dict[str, object]:
        fpath = store_dir / f"{session_id}.json"
        if not fpath.is_file():
            raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
        data = json.loads(fpath.read_text(encoding="utf-8"))
        return verify_deterministic_replay(data)

    @api.get("/api/sessions/{session_id}/export")
    def export_session(
        session_id: str,
        format: Literal["csv", "parquet", "drone-traj"] = Query(default="csv"),
    ):
        fpath = store_dir / f"{session_id}.json"
        if not fpath.is_file():
            raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
        data = json.loads(fpath.read_text(encoding="utf-8"))

        if format == "drone-traj":
            return JSONResponse(content=to_legacy_drone_traj(data))
        if format == "csv":
            csv_path = store_dir / f"{session_id}.csv"
            export_session_csv(data, csv_path)
            return FileResponse(
                csv_path,
                media_type="text/csv",
                filename=f"{session_id}.csv",
            )
        pq_path = store_dir / f"{session_id}.parquet"
        export_session_parquet(data, pq_path)
        return FileResponse(
            pq_path,
            media_type="application/octet-stream",
            filename=f"{session_id}.parquet",
        )

    @api.post("/api/demo/generate")
    def generate_demo_session(req: DemoGenerateRequest) -> dict[str, object]:
        catalog = load_exercise_catalog()
        if req.exercise_id not in catalog:
            raise HTTPException(status_code=404, detail=f"Exercise '{req.exercise_id}' not found")
        ex = catalog[req.exercise_id]
        cfg = SessionConfig(
            exercise_id=ex.id,
            student_id="INSTRUCTOR",
            student_name="Phi công Mẫu (AI/PID Demo)",
            default_mode=FlightModeType.POSITION_HOLD,
            seed=req.seed,
            wind_scale=req.wind_scale,
            instructor_demo=True,
            device_id="Instructor Autopilot",
        )
        session = FlightSession(cfg)
        try:
            for _ in range(req.max_steps):
                session.step_tick(advance_input_watchdog=False)
                if session.ended:
                    break
            return session.finalize(save_dir=store_dir)
        finally:
            session.close()

    @api.websocket("/ws/session")
    async def websocket_session(
        websocket: WebSocket,
        exercise_id: str = "BT01",
        mode: str = "position_hold",
        wind_scale: float = 1.0,
        instructor_demo: bool = False,
        student_name: str = "Học viên Thực hành",
        device_id: str = "USB Controller / Keyboard",
        seed: int = 9000,
    ) -> None:
        await websocket.accept()
        catalog = load_exercise_catalog()
        if exercise_id not in catalog:
            await websocket.send_json({"type": "error", "message": f"Unknown exercise {exercise_id}"})
            await websocket.close()
            return

        ex = catalog[exercise_id]
        try:
            flight_mode = FlightModeType(mode)
        except ValueError:
            flight_mode = ex.default_mode

        clean_id = "".join(c if c.isalnum() else "_" for c in student_name.strip().upper()).strip("_") or "HV001"
        cfg = SessionConfig(
            exercise_id=ex.id,
            student_id="INSTRUCTOR" if instructor_demo else clean_id[:24],
            student_name=student_name,
            default_mode=flight_mode,
            seed=seed,
            wind_scale=wind_scale,
            instructor_demo=instructor_demo,
            device_id=device_id,
        )
        session = FlightSession(cfg)
        finalized = False

        await websocket.send_json(
            {
                "type": "init",
                "schema": "uav-ws/1",
                "session_id": session.session_id,
                "exercise": _serialize_exercise(ex),
            }
        )

        async def _recv_loop() -> None:
            nonlocal finalized
            try:
                while True:
                    msg = await websocket.receive_json()
                    mtype = msg.get("type")
                    if mtype == "input":
                        s = msg.get("sticks", {})
                        stick = StickInput(
                            throttle=float(s.get("throttle", 0.5)),
                            yaw=float(s.get("yaw", 0.0)),
                            pitch=float(s.get("pitch", 0.0)),
                            roll=float(s.get("roll", 0.0)),
                            arm=bool(s.get("arm", True)),
                            mode_switch=int(s.get("modeSwitch", 0)),
                        )
                        session.receive_input(
                            stick=stick,
                            seq=int(msg.get("seq", 0)),
                            t_client=float(msg.get("t_client", 0.0)),
                        )
                    elif mtype == "command":
                        action = msg.get("action")
                        if action == "pause":
                            session.paused = True
                        elif action == "resume":
                            session.paused = False
                            session.time_since_input_sec = 0.0
                        elif action == "toggle_demo":
                            session.config.instructor_demo = not session.config.instructor_demo
                            session.time_since_input_sec = 0.0
                        elif action == "toggle_lead":
                            session.lead_guide_enabled = not session.lead_guide_enabled
                        elif action == "reset":
                            state_msg = session.reset()
                            await websocket.send_json(state_msg)
                        elif action == "end":
                            session_dict = session.finalize(save_dir=store_dir)
                            finalized = True
                            await websocket.send_json(
                                {
                                    "type": "completed",
                                    "session": session_dict,
                                }
                            )
                            break
            except WebSocketDisconnect:
                pass
            except Exception:
                pass

        recv_task = asyncio.create_task(_recv_loop())
        dt_target = 1.0 / float(cfg.ctrl_hz)
        try:
            while not recv_task.done():
                t0 = asyncio.get_running_loop().time()
                if not session.paused and not session.ended:
                    state_payload = session.step_tick(advance_input_watchdog=True)
                    await websocket.send_json(state_payload)
                    if session.ended and not finalized:
                        session_dict = session.finalize(save_dir=store_dir)
                        finalized = True
                        await websocket.send_json(
                            {
                                "type": "completed",
                                "session": session_dict,
                            }
                        )
                elapsed = asyncio.get_running_loop().time() - t0
                await asyncio.sleep(max(0.002, dt_target - elapsed))
        except WebSocketDisconnect:
            pass
        finally:
            recv_task.cancel()
            if not finalized and len(session.recorder.frames) >= 30:
                session.finalize(save_dir=store_dir)
            session.close()

    return api


app = create_app()
