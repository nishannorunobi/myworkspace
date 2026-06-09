"""
Console proxy — forwards all /api/console/* requests to the workspace agent
running on port 8890. Returns 503 if the workspace agent is offline.
"""
import json
import urllib.error
import urllib.request
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/console", tags=["console"])

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


class CmdBody(BaseModel):
    command: str
    cwd: str = ""


@router.post("/exec")
def exec_command(body: CmdBody):
    d = _post("/api/console/exec", json.dumps(body.model_dump()).encode())
    return d if d is not None else _offline()


@router.get("/cwd-list")
def list_cwd():
    d = _get("/api/console/cwd-list")
    return d if d is not None else _offline()
