"""
Workspace-projects proxy — forwards all /api/workspace/* requests to the workspace agent
running on port 8895. Returns 503 if the workspace agent is offline.
"""
import json
import urllib.error
import urllib.request
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

router = APIRouter(prefix="/workspace", tags=["workspace"])

_WS = "http://localhost:8895"


def _offline(msg: str = "workspace agent offline"):
    return JSONResponse({"error": msg}, status_code=503)


def _get(path: str):
    try:
        with urllib.request.urlopen(f"{_WS}{path}", timeout=10) as r:
            return json.loads(r.read())
    except Exception:
        return None


def _post(path: str, body: bytes = b""):
    req = urllib.request.Request(
        f"{_WS}{path}", data=body, method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return json.loads(raw)
        except Exception:
            return {"error": str(e)}
    except Exception:
        return None


def _stream(path: str):
    def generate():
        try:
            with urllib.request.urlopen(f"{_WS}{path}", timeout=600) as r:
                for raw in r:
                    yield raw.decode("utf-8", errors="replace")
        except Exception as e:
            yield f"data: [workspace agent offline: {e}]\n\n"
            yield "data: __done__\n\n"
    return StreamingResponse(
        generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/projects")
def list_projects():
    d = _get("/api/workspace/projects")
    return d if d is not None else _offline()


@router.post("/projects/{name}/start")
def start_project(name: str):
    d = _post(f"/api/workspace/projects/{name}/start")
    return d if d is not None else _offline()


@router.post("/projects/{name}/stop")
def stop_project(name: str):
    d = _post(f"/api/workspace/projects/{name}/stop")
    return d if d is not None else _offline()


@router.post("/projects/{name}/health")
def health_project(name: str):
    d = _post(f"/api/workspace/projects/{name}/health")
    return d if d is not None else _offline()


@router.get("/projects/{name}/log")
def stream_log(name: str):
    return _stream(f"/api/workspace/projects/{name}/log")


@router.get("/projects/{name}/docker-logs")
def stream_docker_logs(name: str):
    return _stream(f"/api/workspace/projects/{name}/docker-logs")
