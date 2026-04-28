#!/usr/bin/env python3
"""
Dashboard Agent — Server Entry Point
All routes live in routers/. Config is read from server.conf and ../shared.conf.
"""
import sys
import asyncio
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR.parent / "workspace-agent"))

# ── Config (shared API key + server settings) ──────────────────────────────────
load_dotenv(BASE_DIR.parent / "shared.conf")
load_dotenv(BASE_DIR / "server.conf")

import os
STATIC_DIR = BASE_DIR / os.getenv("STATIC_DIR", "static")
LOG_DIR    = BASE_DIR / os.getenv("LOG_DIR",    "logs")

# ── Shared services ───────────────────────────────────────────────────────────
import alert_engine as alert_eng
from workspace.monitor import WorkspaceMonitor
from workspace.tools   import WORKSPACE_ROOT, MEMORY_DIR

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Workspace Dashboard API", version="1.0")

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ── Routers ───────────────────────────────────────────────────────────────────
from routers import agents, alerts, events, chat

app.include_router(agents.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(chat.router)


# ── Frontend ──────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def index():
    return (STATIC_DIR / "index.html").read_text()


# ── Lifecycle ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    LOG_DIR.mkdir(exist_ok=True)
    MEMORY_DIR.mkdir(exist_ok=True)
    loop = asyncio.get_event_loop()
    alert_eng.init(loop)

    monitor = WorkspaceMonitor(WORKSPACE_ROOT, MEMORY_DIR, on_change=alert_eng.on_workspace_change)
    monitor.start()
    app.state.monitor = monitor

    poller = alert_eng.AlertPoller()
    poller.start()
    app.state.poller = poller


@app.on_event("shutdown")
async def shutdown():
    for attr in ("monitor", "poller"):
        obj = getattr(app.state, attr, None)
        if obj:
            obj.stop()
