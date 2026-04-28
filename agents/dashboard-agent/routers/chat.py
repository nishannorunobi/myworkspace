import os
import json
import asyncio
import re
from datetime import datetime

import anthropic
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import agent_registry as registry
from workspace.tools   import TOOL_DEFINITIONS, execute_tool, MEMORY_DIR, WORKSPACE_ROOT

router = APIRouter(tags=["chat"])

_ANSI_RE = re.compile(r'\x1b\[[0-9;]*[mGKHFJA-Za-z]')
_strip = lambda s: _ANSI_RE.sub('', s)

SYSTEM_PROMPT = f"""You are a Workspace Management Agent for a Docker-based development workspace.

Workspace root: {WORKSPACE_ROOT}
Your memory:    {MEMORY_DIR}
Today:          {datetime.now().strftime('%Y-%m-%d')}

YOUR PURPOSE:
Guardian of this workspace — understand its structure, track evolution,
detect problems early, and keep it clean and easy to clone and resume.

WORKSPACE STRUCTURE:
- dockerspace/       — workspace-level Docker setup
- projectspace/      — all active projects
  - ums/             — Spring Boot 3 / Java 21 User Management System
  - mypostgresql_db/ — PostgreSQL 16 dev container
  - ai-agents/       — Claude API testing agents
  - myapigw/         — API gateway
- agents/            — dashboard-agent and workspace-agent live here

CONVENTIONS:
- Every project: build.sh, start.sh, stop.sh, health.sh
- Shared Docker network: ums-network
- Config: shared.conf for API keys, server.conf for server settings
- No hardcoded IPs — use container names on shared networks

RESPONSIBILITIES:
1. OBSERVE — Scan structure and git history
2. REMEMBER — Save findings to memory/ before ending
3. DETECT — Mass deletions, wrong locations, hardcoded values, broken conventions
4. ADVISE — Specific fixes with file/line references
5. INFORM — Keep meta.json current for other agents

MEMORY: workspace_structure.md, projects.md, change_log.md, concerns.md, sessions.md, meta.json
RULE: Always read memory first. Always save before ending.
"""


async def _workspace_turn(ws, history, client):
    loop = asyncio.get_event_loop()
    while True:
        resp = await loop.run_in_executor(None, lambda: client.messages.create(
            model="claude-sonnet-4-6", max_tokens=8096,
            system=SYSTEM_PROMPT, tools=TOOL_DEFINITIONS, messages=history,
        ))
        tool_calls  = [b for b in resp.content if b.type == "tool_use"]
        text_blocks = [b for b in resp.content if b.type == "text"]

        for b in text_blocks:
            if b.text.strip():
                await ws.send_json({"type": "text", "content": b.text})

        if resp.stop_reason == "end_turn" or not tool_calls:
            final = " ".join(b.text for b in text_blocks).strip()
            if final:
                history.append({"role": "assistant", "content": final})
            break

        history.append({"role": "assistant", "content": resp.content})
        results = []
        for b in tool_calls:
            await ws.send_json({"type": "tool_call", "id": b.id, "name": b.name, "input": b.input})
            result = await loop.run_in_executor(None, lambda blk=b: execute_tool(blk.name, blk.input))
            await ws.send_json({"type": "tool_result", "id": b.id, "name": b.name, "result": result})
            results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(result)})
        history.append({"role": "user", "content": results})

    await ws.send_json({"type": "done"})
    return history


async def _container_turn(ws, spec, message):
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", "-e", f"ANTHROPIC_API_KEY={api_key}",
            "-i", spec.container, "bash", spec.container_script, message,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        async for raw in proc.stdout:
            line = _strip(raw.decode(errors="replace"))
            if line.strip():
                await ws.send_json({"type": "text", "content": line})
        await proc.wait()
    except Exception as e:
        await ws.send_json({"type": "error", "content": str(e)})
    await ws.send_json({"type": "done"})


@router.websocket("/ws/agents/{agent_id}/chat")
async def agent_chat(ws: WebSocket, agent_id: str):
    await ws.accept()
    spec = registry.SPEC_BY_ID.get(agent_id)
    if not spec:
        await ws.send_json({"type": "error", "content": f"Unknown agent: {agent_id}"})
        await ws.close()
        return
    if not os.environ.get("ANTHROPIC_API_KEY"):
        await ws.send_json({"type": "error", "content": "ANTHROPIC_API_KEY not set"})
        await ws.close()
        return

    client  = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    history = []
    try:
        while True:
            data = await ws.receive_text()
            text = json.loads(data).get("content", "").strip()
            if not text:
                continue
            if spec.type == "host" and spec.id == "workspace":
                history.append({"role": "user", "content": text})
                history = await _workspace_turn(ws, history, client)
            elif spec.type == "docker":
                await _container_turn(ws, spec, text)
            else:
                await ws.send_json({"type": "error", "content": "Chat not supported for this agent"})
                await ws.send_json({"type": "done"})
    except WebSocketDisconnect:
        pass
