"""Tests for FastAPI REST endpoints and real-time `/ws/session` WebSocket protocol."""

from __future__ import annotations

from pathlib import Path
from fastapi.testclient import TestClient

from server.app import create_app


def test_rest_and_websocket_session_lifecycle(tmp_path: Path) -> None:
    app = create_app(sessions_dir=tmp_path)
    client = TestClient(app)

    # 1. Health & Exercise list
    r_health = client.get("/api/health")
    assert r_health.status_code == 200
    assert r_health.json()["exercises_count"] == 13

    r_ex = client.get("/api/exercises")
    assert r_ex.status_code == 200
    assert len(r_ex.json()) == 13

    # 2. WebSocket live session
    with client.websocket_connect("/ws/session?exercise_id=BT01&mode=position_hold") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "init"
        session_id = init_msg["session_id"]

        for seq in range(1, 10):
            ws.send_json(
                {
                    "type": "input",
                    "seq": seq,
                    "t_client": float(seq * 16.6),
                    "sticks": {
                        "throttle": 0.7,
                        "yaw": 0.0,
                        "pitch": 0.1,
                        "roll": 0.0,
                        "arm": True,
                        "modeSwitch": 0,
                    },
                }
            )
            msg = ws.receive_json()
            assert msg["type"] in ("state", "completed")

        ws.send_json({"type": "command", "action": "end"})
        while True:
            msg = ws.receive_json()
            if msg["type"] == "completed":
                assert msg["session"]["session_id"] == session_id
                assert "assessment" in msg["session"]
                break

    # 3. Verify saved session appears in REST API & can be exported to CSV
    r_list = client.get("/api/sessions")
    assert r_list.status_code == 200
    assert any(s["session_id"] == session_id for s in r_list.json())

    r_csv = client.get(f"/api/sessions/{session_id}/export?format=csv")
    assert r_csv.status_code == 200
    assert "throttle" in r_csv.text
