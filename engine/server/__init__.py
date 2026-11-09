"""FastAPI REST & 60Hz WebSocket server for UAV Smart Training."""

from .app import app, create_app

__all__ = ["app", "create_app"]
