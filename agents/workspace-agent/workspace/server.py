"""
Workspace Agent HTTP Server — exposes workspace operations as REST API on port 8895.
Projects, dockerspace scripts, and project-sh routes all live here.
The agent-orchestrator proxies these endpoints; it does NOT implement them directly.
"""
import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Workspace Agent API")

# Expose CPython GC + heap metrics at /metrics (scraped by Prometheus).
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from py_mem_metrics import mount_mem_metrics
mount_mem_metrics(app)

WORKSPACE_ROOT     = Path(__file__).resolve().parent.parent.parent.parent
PROJECTSPACE       = WORKSPACE_ROOT / "projectspace"
DOCKERSPACE        = WORKSPACE_ROOT / "dockerspace"
INITSPACE          = WORKSPACE_ROOT / "init"

# ── Shared process state ───────────────────────────────────────────────────────
_ds_proc:   object | None = None
_ds_output: list[str]     = []
_ds_lock    = threading.Lock()

_init_proc:   object | None = None
_init_output: list[str]     = []
_init_lock    = threading.Lock()

_psh_proc:   object | None = None
_psh_output: list[str]     = []
_psh_lock    = threading.Lock()


# ── Mirror log path (same convention as init/create_logging_path.sh) ───────────
def _mirror_log_path(script_abs: str) -> str:
    """Host log path that the given script mirrors to under mountspace/logs.

    e.g. projectspace/mypostgresql_db/dockerspace/start.sh →
         <ws>/mountspace/logs/myworkspace/projectspace/mypostgresql_db/dockerspace/start_sh.log
    """
    p = Path(script_abs).resolve()
    try:
        rel = p.relative_to(WORKSPACE_ROOT)
    except ValueError:
        rel = Path(p.name)
    ext      = p.suffix.lstrip(".")
    log_name = f"{p.stem}_{ext}.log" if ext else f"{p.stem}.log"
    base     = WORKSPACE_ROOT / "mountspace" / "logs" / WORKSPACE_ROOT.name
    log_dir  = base if str(rel.parent) == "." else base / rel.parent
    return str(log_dir / log_name)


# ─────────────────────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "running", "agent": "workspace"}


# ─────────────────────────────────────────────────────────────────────────────
# Dockerspace
# ─────────────────────────────────────────────────────────────────────────────

def _ds_reader(proc):
    for line in proc.stdout:
        _ds_output.append(line.rstrip("\n"))
    proc.wait()


@app.get("/api/dockerspace/scripts")
def list_scripts():
    if not DOCKERSPACE.exists():
        return {"projects": []}
    scripts = [
        {"label": sh.name, "abs_path": str(sh)}
        for sh in sorted(DOCKERSPACE.glob("*.sh"))
    ]
    if not scripts:
        return {"projects": []}
    return {"projects": [{"name": "dockerspace", "scripts": scripts}]}


class RunBody(BaseModel):
    script:    str
    sudo_pass: str  = ""
    confirmed: bool = False


@app.post("/api/dockerspace/run")
def run_script(body: RunBody):
    global _ds_proc, _ds_output

    script = Path(body.script).resolve()
    if not str(script).startswith(str(DOCKERSPACE)):
        return JSONResponse({"error": "Script must be inside dockerspace"}, status_code=403)
    if not script.exists():
        return JSONResponse({"error": f"Script not found: {script}"}, status_code=404)

    env = os.environ.copy()
    if body.sudo_pass:
        env["SUDO_PASS"] = body.sudo_pass
        env["SUDO_ASKPASS"] = ""

    # Pre-fill stdin with "yes" answers when user confirmed in the UI,
    # so scripts using `read -p "..."` don't abort waiting for terminal input.
    if body.confirmed:
        import os as _os
        r_fd, w_fd = _os.pipe()
        _os.write(w_fd, b"yes\n" * 20)
        _os.close(w_fd)
        stdin_arg = r_fd
    else:
        stdin_arg = subprocess.DEVNULL

    with _ds_lock:
        if _ds_proc and _ds_proc.poll() is None:
            _ds_proc.terminate()
        _ds_output.clear()
        _ds_output.append(f"$ bash {script.relative_to(WORKSPACE_ROOT)}")
        proc = subprocess.Popen(
            ["bash", str(script)],
            cwd=str(script.parent),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            stdin=stdin_arg,
            text=True, bufsize=1, env=env,
        )
        if body.confirmed:
            _os.close(r_fd)
        _ds_proc = proc

    threading.Thread(target=_ds_reader, args=(proc,), daemon=True).start()

    _ds_log_path = _mirror_log_path(str(script))

    def generate():
        sent = 0
        yield ": ping\n\n"
        yield f"data: __LOGPATH__{_ds_log_path}\n\n"
        while True:
            current_len = len(_ds_output)
            for i in range(sent, current_len):
                yield f"data: {_ds_output[i]}\n\n"
            sent = current_len
            if proc.poll() is not None and sent >= len(_ds_output):
                rc = proc.returncode
                yield "data: \n\n"
                yield f"data: [exit code {rc}]\n\n"
                yield "data: __done__\n\n"
                return
            time.sleep(0.15)

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/dockerspace/kill")
def kill_script():
    global _ds_proc
    if _ds_proc and _ds_proc.poll() is None:
        _ds_proc.terminate()
        return {"ok": True, "msg": "Process terminated"}
    return {"ok": False, "msg": "No running process"}


# ─────────────────────────────────────────────────────────────────────────────
# Initialize Environment (init/ scripts)
# ─────────────────────────────────────────────────────────────────────────────

def _init_reader(proc):
    for line in proc.stdout:
        _init_output.append(line.rstrip("\n"))
    proc.wait()


@app.get("/api/initspace/scripts")
def list_init_scripts():
    if not INITSPACE.exists():
        return {"projects": []}
    scripts = [
        {"label": sh.name, "abs_path": str(sh)}
        for sh in sorted(INITSPACE.glob("*.sh"))
    ]
    if not scripts:
        return {"projects": []}
    return {"projects": [{"name": "init", "scripts": scripts}]}


@app.post("/api/initspace/run")
def run_init_script(body: RunBody):
    global _init_proc, _init_output

    script = Path(body.script).resolve()
    if not str(script).startswith(str(INITSPACE)):
        return JSONResponse({"error": "Script must be inside init/"}, status_code=403)
    if not script.exists():
        return JSONResponse({"error": f"Script not found: {script}"}, status_code=404)

    env = os.environ.copy()
    if body.sudo_pass:
        env["SUDO_PASS"] = body.sudo_pass
        env["SUDO_ASKPASS"] = ""

    # Pre-fill stdin with "yes" answers when user confirmed in the UI,
    # so scripts using `read -p "..."` don't abort waiting for terminal input.
    if body.confirmed:
        import os as _os
        r_fd, w_fd = _os.pipe()
        _os.write(w_fd, b"yes\n" * 20)
        _os.close(w_fd)
        stdin_arg = r_fd
    else:
        stdin_arg = subprocess.DEVNULL

    with _init_lock:
        if _init_proc and _init_proc.poll() is None:
            _init_proc.terminate()
        _init_output.clear()
        _init_output.append(f"$ bash {script.relative_to(WORKSPACE_ROOT)}")
        proc = subprocess.Popen(
            ["bash", str(script)],
            cwd=str(script.parent),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            stdin=stdin_arg,
            text=True, bufsize=1, env=env,
        )
        if body.confirmed:
            _os.close(r_fd)
        _init_proc = proc

    threading.Thread(target=_init_reader, args=(proc,), daemon=True).start()

    _init_log_path = _mirror_log_path(str(script))

    def generate():
        sent = 0
        yield ": ping\n\n"
        yield f"data: __LOGPATH__{_init_log_path}\n\n"
        while True:
            current_len = len(_init_output)
            for i in range(sent, current_len):
                yield f"data: {_init_output[i]}\n\n"
            sent = current_len
            if proc.poll() is not None and sent >= len(_init_output):
                rc = proc.returncode
                yield "data: \n\n"
                yield f"data: [exit code {rc}]\n\n"
                yield "data: __done__\n\n"
                return
            time.sleep(0.15)

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/initspace/kill")
def kill_init_script():
    global _init_proc
    if _init_proc and _init_proc.poll() is None:
        _init_proc.terminate()
        return {"ok": True, "msg": "Process terminated"}
    return {"ok": False, "msg": "No running process"}


# ─────────────────────────────────────────────────────────────────────────────
# Project Scripts (project-sh) — every *.sh under each project in projectspace,
# with its in-project directory hierarchy, each individually runnable. This exposes
# EVERY script and the exact file being run — file-level control, no black box.
# ─────────────────────────────────────────────────────────────────────────────

# Skipped directory NAMES. `download` hides extracted vendor trees (e.g.
# mylog_analytics' Grafana release) — note this matches a DIR named "download",
# not the user's own download_binary.sh / download_src.sh files.
_PSH_SKIP_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__",
                  ".mypy_cache", ".pytest_cache", "dist", "build", "download"}

# Vendored upstream source trees to hide (not the user's runnable scripts).
# e.g. projectspace/myodoo/odoo-17/odoo/... and odoo-19/odoo/... are the Odoo
# source; the user's own scripts (dockerspace, odoo-agent, download_src.sh) stay.
_PSH_SKIP_RE = re.compile(r"(^|/)odoo-[0-9.]+/odoo/")

# Projects exposed in the project-sh tab. Empty list = show ALL projects under
# projectspace/ (auto-includes new ones). To restrict, list folder names, e.g.
# ["myodoo", "mypostgresql_db"].
_PSH_PROJECTS = []


def _psh_reader(proc):
    for line in proc.stdout:
        _psh_output.append(line.rstrip("\n"))
    proc.wait()


@app.get("/api/projectsh/scripts")
def list_project_scripts():
    """Scan projectspace/<project>/ recursively for *.sh, grouped per project,
    each script carrying its path relative to the project (the hierarchy)."""
    if not PROJECTSPACE.exists():
        return {"projects": []}
    projects = []
    for proj in sorted(PROJECTSPACE.iterdir()):
        if not proj.is_dir() or proj.name.startswith("."):
            continue
        if _PSH_PROJECTS and proj.name not in _PSH_PROJECTS:
            continue
        scripts = []
        for sh in proj.rglob("*.sh"):
            rel = sh.relative_to(proj)
            if any(part in _PSH_SKIP_DIRS for part in rel.parts):
                continue
            if _PSH_SKIP_RE.search(str(rel)):
                continue
            parent = str(rel.parent)
            scripts.append({
                "label":    sh.name,
                "rel_path": str(rel),
                "dir":      "" if parent == "." else parent,
                "abs_path": str(sh),
            })
        if not scripts:
            continue
        scripts.sort(key=lambda s: (s["dir"], s["label"]))
        projects.append({"name": proj.name, "root": str(proj), "scripts": scripts})
    return {"projects": projects}


@app.post("/api/projectsh/run")
def run_project_script(body: RunBody):
    global _psh_proc, _psh_output

    script = Path(body.script).resolve()
    if not str(script).startswith(str(PROJECTSPACE)):
        return JSONResponse({"error": "Script must be inside projectspace"}, status_code=403)
    if not script.exists():
        return JSONResponse({"error": f"Script not found: {script}"}, status_code=404)

    env = os.environ.copy()
    if body.sudo_pass:
        env["SUDO_PASS"] = body.sudo_pass
        env["SUDO_ASKPASS"] = ""

    if body.confirmed:
        import os as _os
        r_fd, w_fd = _os.pipe()
        _os.write(w_fd, b"yes\n" * 20)
        _os.close(w_fd)
        stdin_arg = r_fd
    else:
        stdin_arg = subprocess.DEVNULL

    with _psh_lock:
        if _psh_proc and _psh_proc.poll() is None:
            _psh_proc.terminate()
        _psh_output.clear()
        _psh_output.append(f"$ bash {script.relative_to(WORKSPACE_ROOT)}")
        proc = subprocess.Popen(
            ["bash", str(script)],
            cwd=str(script.parent),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            stdin=stdin_arg,
            text=True, bufsize=1, env=env,
        )
        if body.confirmed:
            _os.close(r_fd)
        _psh_proc = proc

    threading.Thread(target=_psh_reader, args=(proc,), daemon=True).start()

    _psh_log_path = _mirror_log_path(str(script))

    def generate():
        sent = 0
        yield ": ping\n\n"
        yield f"data: __LOGPATH__{_psh_log_path}\n\n"
        while True:
            current_len = len(_psh_output)
            for i in range(sent, current_len):
                yield f"data: {_psh_output[i]}\n\n"
            sent = current_len
            if proc.poll() is not None and sent >= len(_psh_output):
                rc = proc.returncode
                yield "data: \n\n"
                yield f"data: [exit code {rc}]\n\n"
                yield "data: __done__\n\n"
                return
            time.sleep(0.15)

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projectsh/kill")
def kill_project_script():
    global _psh_proc
    if _psh_proc and _psh_proc.poll() is None:
        _psh_proc.terminate()
        return {"ok": True, "msg": "Process terminated"}
    return {"ok": False, "msg": "No running process"}



# ─────────────────────────────────────────────────────────────────────────────
# Server entry point (called from agent.py daemon thread)
# ─────────────────────────────────────────────────────────────────────────────

def start(host: str = "0.0.0.0", port: int = 8895):
    import uvicorn
    uvicorn.run(app, host=host, port=port, log_level="warning")
