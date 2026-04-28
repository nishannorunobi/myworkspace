import asyncio
import json
import re
import subprocess
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


@router.post("/{agent_id}/start")
async def start_agent(agent_id: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec:
        return JSONResponse({"error": "not found"}, status_code=404)
    loop = asyncio.get_event_loop()
    try:
        if spec.type == "docker":
            r = await loop.run_in_executor(None, lambda: subprocess.run(
                ["docker", "start", spec.container],
                capture_output=True, text=True, timeout=20,
            ))
            return {"ok": r.returncode == 0, "detail": r.stderr.strip() or "started"}
        return {"ok": False, "detail": "Host agents start via terminal or ./start.sh"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/{agent_id}/stop")
async def stop_agent(agent_id: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec:
        return JSONResponse({"error": "not found"}, status_code=404)
    loop = asyncio.get_event_loop()
    try:
        if spec.type == "docker":
            await loop.run_in_executor(None, lambda: subprocess.run(
                ["docker", "stop", spec.container], capture_output=True, timeout=30,
            ))
        else:
            await loop.run_in_executor(None, lambda: subprocess.run(
                ["pkill", "-f", spec.host_script], capture_output=True, timeout=5,
            ))
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/{agent_id}/logs/stream")
async def stream_logs(agent_id: str):
    spec = registry.SPEC_BY_ID.get(agent_id)

    async def docker_gen(container):
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "logs", "-f", "--tail", "100", container,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            )
            async for raw in proc.stdout:
                yield f"data: {json.dumps({'line': _strip(raw.decode(errors='replace'))})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'line': f'[error] {e}\n'})}\n\n"

    async def file_gen(log_path: Path):
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
        yield f"data: {json.dumps({'line': 'No log source configured.\n'})}\n\n"
        while True:
            await asyncio.sleep(30)
            yield ": keepalive\n\n"

    if not spec:
        gen = empty_gen()
    elif spec.type == "docker":
        gen = docker_gen(spec.container)
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
    return {"files": [f.name for f in sorted(mem.iterdir()) if f.is_file()]}


@router.get("/{agent_id}/memory/{filename}")
async def read_memory(agent_id: str, filename: str):
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec or not spec.memory_dir:
        return {"error": "no memory dir"}
    path = Path(spec.memory_dir) / filename
    if not path.exists():
        return {"error": "not found"}
    return {"filename": filename, "content": path.read_text()}
