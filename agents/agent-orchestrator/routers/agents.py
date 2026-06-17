import asyncio
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

import agent_registry as registry

router = APIRouter(prefix="/agents", tags=["agents"])

_ANSI_RE = re.compile(r'\x1b\[[0-9;]*[mGKHFJA-Za-z]')
_strip = lambda s: _ANSI_RE.sub('', s)


@router.get("")
async def list_agents():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, registry.get_all_info)
    return {"agents": data}


@router.post("/reload")
async def reload_registry():
    """Hot-reload agents.conf without restarting the server."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, registry.reload)
    return {"ok": True, "agents": len(registry.AGENT_SPECS)}


@router.post("/stop-all")
async def stop_all_agents():
    """Stop every agent that has a stop_script configured, except the orchestrator itself."""
    loop = asyncio.get_event_loop()
    results = []

    def _stop(spec):
        try:
            subprocess.run(
                ["bash", spec.stop_script],
                cwd=spec.home, capture_output=True, timeout=15,
            )
            return {"id": spec.id, "ok": True}
        except Exception as e:
            return {"id": spec.id, "ok": False, "error": str(e)}

    tasks = [
        loop.run_in_executor(None, _stop, spec)
        for spec in registry.AGENT_SPECS
        if spec.connector != "orchestrator" and spec.home and spec.stop_script
    ]
    results = await asyncio.gather(*tasks)
    return {"ok": True, "results": list(results)}


@router.post("/{agent_id}/start")
async def start_agent(agent_id: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec:
        return JSONResponse({"error": "not found"}, status_code=404)
    loop = asyncio.get_event_loop()
    try:
        if spec.home and spec.start_script:
            def _launch():
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".log", mode="w")
                proc = subprocess.Popen(
                    ["bash", spec.start_script],
                    cwd=spec.home,
                    stdin=subprocess.DEVNULL,
                    stdout=tmp,
                    stderr=tmp,
                    start_new_session=True,
                    env=os.environ.copy(),
                )
                tmp.close()
                time.sleep(0.5)
                rc = proc.poll()
                if rc is not None and rc != 0:
                    out = Path(tmp.name).read_text(errors="replace")
                    return None, rc, _strip(out)
                return proc.pid, rc, None
            pid, rc, out = await loop.run_in_executor(None, _launch)
            if rc is not None and rc != 0:
                return {"ok": False, "detail": f"Start script exited (code {rc})", "output": (out or "").strip()[:600]}
            return {"ok": True, "detail": f"Started (PID {pid})"}
        return {"ok": False, "detail": "start_script not configured for this agent"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/{agent_id}/clean-build")
async def clean_build_agent(agent_id: str):
    """Run the agent's clean.sh then build.sh to recreate a fresh environment.

    Used to recover an agent that won't start because of a broken environment
    (stale .venv, missing deps, leftover processes/caches).
    """
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec:
        return JSONResponse({"error": "not found"}, status_code=404)
    if not (spec.home and spec.clean_script and spec.build_script):
        return {"ok": False, "detail": "clean_script/build_script not configured for this agent"}
    loop = asyncio.get_event_loop()

    def _run(script):
        r = subprocess.run(
            ["bash", script],
            cwd=spec.home, capture_output=True, text=True, timeout=300,
        )
        return r.returncode, _strip((r.stdout or "") + (r.stderr or ""))

    try:
        # Clean is best-effort: if there's no environment to clean (or clean fails),
        # don't error out — just proceed to build, which recreates the environment.
        rc, out = await loop.run_in_executor(None, _run, spec.clean_script)
        if rc != 0:
            out += f"\n[clean.sh exited code {rc} — proceeding to build anyway]"
        rc, build_out = await loop.run_in_executor(None, _run, spec.build_script)
        out = (out + "\n" + build_out)
        if rc != 0:
            return {"ok": False, "detail": f"build.sh exited (code {rc})", "output": out.strip()[-1500:]}
        return {"ok": True, "detail": "Clean & build complete", "output": out.strip()[-1500:]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "detail": "clean/build timed out after 300s"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/{agent_id}/upload")
async def upload_agent(agent_id: str):
    """Replicate the local agent source into the running container (no rebuild).

    The container's source is baked into the image (not bind-mounted), so during
    development this pushes local fixes into the running container. Click Start
    afterwards to restart the agent on the uploaded code.
    """
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec:
        return JSONResponse({"error": "not found"}, status_code=404)
    if not (spec.home and spec.upload_script):
        return {"ok": False, "detail": "upload_script not configured for this agent"}
    loop = asyncio.get_event_loop()

    def _run():
        r = subprocess.run(
            ["bash", spec.upload_script],
            cwd=spec.home, capture_output=True, text=True, timeout=120,
        )
        return r.returncode, _strip((r.stdout or "") + (r.stderr or ""))

    try:
        rc, out = await loop.run_in_executor(None, _run)
        if rc != 0:
            return {"ok": False, "detail": f"upload.sh exited (code {rc})", "output": out.strip()[-1500:]}
        return {"ok": True, "detail": "Uploaded — click Start to restart on the new code", "output": out.strip()[-1500:]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "detail": "upload timed out after 120s"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/{agent_id}/refresh-status")
async def refresh_agent_status(agent_id: str):
    """Force an immediate _detect() for one agent and update its cached state."""
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec:
        return JSONResponse({"error": "not found"}, status_code=404)
    loop = asyncio.get_event_loop()
    new_status = await loop.run_in_executor(None, registry._detect, spec)
    with registry._lock:
        state = registry._states[agent_id]
        prev  = state.status
        state.status = new_status
        if new_status == "running" and state.uptime_start is None:
            from datetime import datetime
            state.uptime_start = datetime.now()
        elif new_status != "running":
            state.uptime_start = None
    return {"id": agent_id, "status": new_status, "prev": prev}


@router.post("/{agent_id}/stop")
async def stop_agent(agent_id: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec:
        return JSONResponse({"error": "not found"}, status_code=404)
    loop = asyncio.get_event_loop()
    try:
        if spec.home and spec.stop_script:
            await loop.run_in_executor(None, lambda: subprocess.run(
                ["bash", spec.stop_script],
                cwd=spec.home, capture_output=True, timeout=15,
            ))
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/{agent_id}/logs/stream")
async def stream_logs(agent_id: str):
    spec = registry.SPEC_BY_ID.get(agent_id)

    async def file_gen(log_path: Path):
        yield f"data: {json.dumps({'path': str(log_path), 'exists': log_path.exists()})}\n\n"
        if log_path.exists():
            for line in log_path.read_text().splitlines()[-100:]:
                yield f"data: {json.dumps({'line': line + chr(10)})}\n\n"
        cursor = log_path.stat().st_size if log_path.exists() else 0
        while True:
            await asyncio.sleep(2)
            if log_path.exists():
                content = log_path.read_text()
                if len(content) > cursor:
                    for line in content[cursor:].splitlines():
                        yield f"data: {json.dumps({'line': line + chr(10)})}\n\n"
                    cursor = len(content)
            yield ": keepalive\n\n"

    async def empty_gen():
        yield f"data: {json.dumps({'path': '', 'exists': False})}\n\n"
        yield f"data: {json.dumps({'line': 'No log source configured.\n'})}\n\n"
        while True:
            await asyncio.sleep(30)
            yield ": keepalive\n\n"

    if not spec:
        gen = empty_gen()
    elif spec.log_file:
        gen = file_gen(Path(spec.log_file))
    else:
        gen = empty_gen()

    return StreamingResponse(gen, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/{agent_id}/memory")
async def list_memory(agent_id: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or not spec.memory_dir:
        return {"files": []}
    mem = Path(spec.memory_dir)
    if not mem.exists():
        return {"files": []}
    TEXT_EXTS = {'.md', '.txt', '.json', '.log', '.yaml', '.yml', '.conf', '.ini', '.toml', '.csv'}
    files = []
    for f in sorted(mem.iterdir()):
        if f.is_file() and f.suffix in TEXT_EXTS:
            size = f.stat().st_size
            if size >= 1024 * 1024:
                size_str = f"{size / (1024 * 1024):.1f} MB"
            elif size >= 1024:
                size_str = f"{size / 1024:.1f} KB"
            else:
                size_str = f"{size} B"
            files.append({"name": f.name, "size": size_str})
    return {"files": files}


_WORKSPACE_DB = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "agents" / "workspace-agent" / "workspace" / "memory" / "workspace.db"
)

import sqlite3 as _sqlite3

@router.post("/workspace/todos/{todo_id}/complete")
def complete_todo(todo_id: int):
    """Mark a workspace todo as completed directly in the DB."""
    if not _WORKSPACE_DB.exists():
        return JSONResponse({"ok": False, "error": "workspace DB not found"}, status_code=404)
    try:
        from datetime import datetime
        conn = _sqlite3.connect(str(_WORKSPACE_DB))
        conn.execute(
            "UPDATE todos SET status='completed', done_at=? WHERE id=?",
            (datetime.now().isoformat(timespec="seconds"), todo_id),
        )
        conn.commit()
        conn.close()
        return {"ok": True, "id": todo_id}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@router.get("/{agent_id}/memory/{filename}")
async def read_memory(agent_id: str, filename: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or not spec.memory_dir:
        return {"error": "no memory dir"}
    path = Path(spec.memory_dir) / filename
    if not path.exists():
        return {"error": "not found"}
    try:
        return {"filename": filename, "content": path.read_text(encoding="utf-8")}
    except (UnicodeDecodeError, ValueError):
        return {"filename": filename, "content": f"[binary file — {path.stat().st_size} bytes, not displayable as text]"}


# ── Container proxy (for HTTP agents that manage containers) ──────────────────

def _proxy_get(url: str) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}


def _proxy_post(url: str) -> dict:
    req = urllib.request.Request(url, data=b"", method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            return json.loads(body)
        except Exception:
            return {"error": f"HTTP {e.code}: {body[:300]}"}
    except Exception as e:
        return {"error": str(e)}


@router.get("/{agent_id}/health")
async def agent_health_proxy(agent_id: str):
    """Proxy GET /health to any HTTP agent via its api_url."""
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or spec.connector != "http" or not spec.api_url:
        return JSONResponse({"error": "agent has no HTTP API"}, status_code=400)
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _proxy_get, f"{spec.api_url.rstrip('/')}/health")
    return data


@router.post("/{agent_id}/action/{path:path}")
async def agent_action_proxy(agent_id: str, path: str):
    """Proxy a POST action to any HTTP agent via its api_url."""
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or spec.connector != "http" or not spec.api_url:
        return JSONResponse({"error": "agent has no HTTP API"}, status_code=400)
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _proxy_post, f"{spec.api_url.rstrip('/')}/{path}")
    return data


@router.get("/{agent_id}/sub-agents")
async def list_sub_agents(agent_id: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec:
        return JSONResponse({"error": "not found"}, status_code=404)
    loop = asyncio.get_event_loop()
    all_info = await loop.run_in_executor(None, registry.get_all_info)
    sub_ids  = set(spec.sub_agents)
    return {"sub_agents": [a for a in all_info if a["id"] in sub_ids]}


@router.get("/{agent_id}/services")
async def list_agent_services(agent_id: str):
    """Proxy GET /api/services from any HTTP agent."""
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or spec.connector != "http" or not spec.api_url:
        return {"services": {}, "discovered": False}
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _proxy_get, f"{spec.api_url.rstrip('/')}/api/services")


@router.get("/{agent_id}/containers")
async def list_agent_containers(agent_id: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or spec.connector != "http" or not spec.api_url:
        return JSONResponse({"error": "agent has no HTTP API"}, status_code=400)
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _proxy_get, f"{spec.api_url.rstrip('/')}/api/containers")
    return data


@router.post("/{agent_id}/containers/{name}/start")
async def container_start(agent_id: str, name: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or spec.connector != "http" or not spec.api_url:
        return JSONResponse({"error": "agent has no HTTP API"}, status_code=400)
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None, _proxy_post, f"{spec.api_url.rstrip('/')}/api/containers/{name}/start"
    )
    return data


@router.post("/{agent_id}/containers/{name}/stop")
async def container_stop(agent_id: str, name: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or spec.connector != "http" or not spec.api_url:
        return JSONResponse({"error": "agent has no HTTP API"}, status_code=400)
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None, _proxy_post, f"{spec.api_url.rstrip('/')}/api/containers/{name}/stop"
    )
    return data


@router.post("/{agent_id}/containers/{name}/restart")
async def container_restart(agent_id: str, name: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or spec.connector != "http" or not spec.api_url:
        return JSONResponse({"error": "agent has no HTTP API"}, status_code=400)
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None, _proxy_post, f"{spec.api_url.rstrip('/')}/api/containers/{name}/restart"
    )
    return data
