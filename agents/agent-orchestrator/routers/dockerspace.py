"""
Dockerspace router — browse and run shell scripts from the workspace dockerspace folder.

GET  /api/dockerspace/scripts   → all .sh scripts in dockerspace/
POST /api/dockerspace/run       → run a script (SSE streaming output)
POST /api/dockerspace/kill      → kill the running script
"""
import subprocess
import threading
import time
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/dockerspace", tags=["dockerspace"])

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOCKERSPACE    = WORKSPACE_ROOT / "dockerspace"

_EXCLUDE_DIRS = {"__pycache__", ".git", ".venv", "node_modules", ".mypy_cache"}

_proc:   object | None = None
_output: list[str]     = []
_lock   = threading.Lock()


def _reader(proc):
    for line in proc.stdout:
        _output.append(line.rstrip("\n"))
    proc.wait()


@router.get("/scripts")
def list_scripts():
    if not DOCKERSPACE.exists():
        return {"projects": []}

    scripts = []
    for sh in sorted(DOCKERSPACE.glob("*.sh")):
        scripts.append({
            "label":    sh.name,
            "abs_path": str(sh),
        })

    if not scripts:
        return {"projects": []}

    return {"projects": [{"name": "dockerspace", "scripts": scripts}]}


class RunBody(BaseModel):
    script:    str
    sudo_pass: str = ""


@router.post("/run")
def run_script(body: RunBody):
    global _proc, _output

    script = Path(body.script).resolve()
    if not str(script).startswith(str(DOCKERSPACE)):
        return JSONResponse({"error": "Script must be inside dockerspace"}, status_code=403)
    if not script.exists():
        return JSONResponse({"error": f"Script not found: {script}"}, status_code=404)

    import os
    env = os.environ.copy()
    if body.sudo_pass:
        env["SUDO_PASS"] = body.sudo_pass
        env["SUDO_ASKPASS"] = ""  # prevent GUI askpass from intercepting

    with _lock:
        if _proc and _proc.poll() is None:
            _proc.terminate()
        _output = [f"$ bash {script.relative_to(WORKSPACE_ROOT)}"]
        proc = subprocess.Popen(
            ["bash", str(script)],
            cwd=str(script.parent),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            env=env,
        )
        _proc = proc

    t = threading.Thread(target=_reader, args=(proc,), daemon=True)
    t.start()

    def generate():
        sent = 0
        yield ": ping\n\n"
        while True:
            current_len = len(_output)
            for i in range(sent, current_len):
                yield f"data: {_output[i]}\n\n"
            sent = current_len
            if proc.poll() is not None and sent >= len(_output):
                rc = proc.returncode
                yield "data: \n\n"
                yield f"data: [exit code {rc}]\n\n"
                yield "data: __done__\n\n"
                return
            time.sleep(0.15)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/kill")
def kill_script():
    global _proc
    if _proc and _proc.poll() is None:
        _proc.terminate()
        return {"ok": True, "msg": "Process terminated"}
    return {"ok": False, "msg": "No running process"}
