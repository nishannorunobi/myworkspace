"""
Dockerspace proxy — forwards all /api/dockerspace/* requests to the workspace agent
running on port 8890. Returns 503 if the workspace agent is offline.
"""
import json
import urllib.error
import urllib.request
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/dockerspace", tags=["dockerspace"])

_WS = "http://localhost:8890"


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


def _stream(path: str, body: bytes = b""):
    def generate():
        try:
            req = urllib.request.Request(
                f"{_WS}{path}", data=body or None, method="POST" if body else "GET",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=600) as r:
                for raw in r:
                    yield raw.decode("utf-8", errors="replace")
        except Exception as e:
            yield f"data: [workspace agent offline: {e}]\n\n"
            yield "data: __done__\n\n"
    return StreamingResponse(
        generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/scripts")
def list_scripts():
    d = _get("/api/dockerspace/scripts")
    return d if d is not None else _offline()


class RunBody(BaseModel):
    script:    str
    sudo_pass: str  = ""
    confirmed: bool = False


@router.post("/run")
def run_script(body: RunBody):
    payload = json.dumps({"script": body.script, "sudo_pass": body.sudo_pass, "confirmed": body.confirmed}).encode()
    return _stream("/api/dockerspace/run", payload)


@router.post("/kill")
def kill_script():
    d = _post("/api/dockerspace/kill")
    return d if d is not None else _offline()
