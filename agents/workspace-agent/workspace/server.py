"""
Workspace Agent HTTP Server — exposes workspace operations as REST API on port 8895.
Projects, dockerspace scripts, git, and console routes all live here.
The agent-orchestrator proxies these endpoints; it does NOT implement them directly.
"""
import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Workspace Agent API")

WORKSPACE_ROOT     = Path(__file__).resolve().parent.parent.parent.parent
PROJECTSPACE       = WORKSPACE_ROOT / "projectspace"
DOCKERSPACE        = WORKSPACE_ROOT / "dockerspace"
PORT_FORWARDS_FILE = (
    WORKSPACE_ROOT / "agents/docker-manager-agent/docker_agent/memory/port_forwards.json"
)

_EXCLUDE = {"temp", "__pycache__", ".git"}

# ── Shared process state ───────────────────────────────────────────────────────
_procs:  dict[str, object]    = {}
_output: dict[str, list[str]] = {}

_ds_proc:   object | None = None
_ds_output: list[str]     = []
_ds_lock    = threading.Lock()


# ─────────────────────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "running", "agent": "workspace"}


# ─────────────────────────────────────────────────────────────────────────────
# Projects
# ─────────────────────────────────────────────────────────────────────────────

def _find_script(project: Path, names: list[str]) -> str | None:
    for d in [project / "dockerspace" / "host_scripts", project]:
        for name in names:
            p = d / name
            if p.exists():
                return str(p)
    return None


def _container_running(project_name: str) -> bool:
    try:
        result = subprocess.run(
            ["docker", "ps", "--filter", f"name={project_name}", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=5,
        )
        return bool(result.stdout.strip())
    except Exception:
        return False


def _reader(name: str, proc):
    for line in proc.stdout:
        _output[name].append(line.rstrip("\n"))
    proc.wait()


def _socat_pid_for_port(port: int) -> int | None:
    try:
        result = subprocess.run(
            ["ss", "-tlnp", f"sport = :{port}"],
            capture_output=True, text=True, timeout=5,
        )
        m = re.search(r'pid=(\d+)', result.stdout)
        return int(m.group(1)) if m else None
    except Exception:
        return None


def _release_project_ports(project_name: str, log: list[str]) -> None:
    if not PORT_FORWARDS_FILE.exists():
        return
    try:
        pf: dict = json.loads(PORT_FORWARDS_FILE.read_text())
    except Exception:
        return
    ports_to_free = [
        port_str for port_str, info in pf.items()
        if project_name in info.get("container", "")
    ]
    if not ports_to_free:
        return
    changed = False
    for port_str in ports_to_free:
        port = int(port_str)
        pid  = _socat_pid_for_port(port)
        if pid:
            try:
                os.kill(pid, 9)
                log.append(f"[pre-start] killed PID {pid} holding port {port}")
            except ProcessLookupError:
                pass
        pf.pop(port_str, None)
        changed = True
    if changed:
        PORT_FORWARDS_FILE.write_text(json.dumps(pf, indent=2))
        log.append("[pre-start] port_forwards.json cleaned")


@app.get("/api/workspace/projects")
def list_projects():
    if not PROJECTSPACE.exists():
        return {"projects": []}
    projects = []
    for entry in sorted(PROJECTSPACE.iterdir()):
        if not entry.is_dir() or entry.name in _EXCLUDE:
            continue
        start   = _find_script(entry, ["start.sh", "start_docker.sh"])
        stop    = _find_script(entry, ["stop.sh",  "stop_docker.sh"])
        health  = _find_script(entry, ["health.sh"])
        logs    = _find_script(entry, ["logs.sh"])
        compose = (entry / "dockerspace" / "host_scripts" / "docker-compose.yml").exists() or \
                  (entry / "docker-compose.yml").exists()
        running = _container_running(entry.name)
        projects.append({
            "name":          entry.name,
            "start_script":  start,
            "stop_script":   stop,
            "health_script": health,
            "logs_script":   logs,
            "has_compose":   compose,
            "running":       running,
        })
    return {"projects": projects}


@app.post("/api/workspace/projects/{name}/start")
def start_project(name: str):
    project = PROJECTSPACE / name
    if not project.exists():
        return JSONResponse({"error": f"Project '{name}' not found"}, status_code=404)
    script = _find_script(project, ["start.sh", "start_docker.sh"])
    if not script:
        return JSONResponse({"error": "No start script found for this project"}, status_code=400)
    old = _procs.get(name)
    if old and old.poll() is None:
        old.terminate()
    pre_log: list[str] = []
    _release_project_ports(name, pre_log)
    _output[name] = list(pre_log)
    proc = subprocess.Popen(
        ["bash", script],
        cwd=str(Path(script).parent),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )
    _procs[name] = proc
    threading.Thread(target=_reader, args=(name, proc), daemon=True).start()
    return {"ok": True, "script": script}


@app.post("/api/workspace/projects/{name}/stop")
def stop_project(name: str):
    project = PROJECTSPACE / name
    if not project.exists():
        return JSONResponse({"error": f"Project '{name}' not found"}, status_code=404)
    script = _find_script(project, ["stop.sh", "stop_docker.sh"])
    if script:
        try:
            result = subprocess.run(
                ["bash", script],
                cwd=str(Path(script).parent),
                capture_output=True, text=True, timeout=60,
            )
            output = (result.stdout + result.stderr).strip()
            return {"ok": True, "output": output or "Stop script completed"}
        except subprocess.TimeoutExpired:
            return JSONResponse({"error": "Stop script timed out"}, status_code=500)
    proc = _procs.get(name)
    if proc and proc.poll() is None:
        proc.terminate()
        return {"ok": True, "output": "Process terminated"}
    return {"ok": False, "error": "No stop script and no running process found"}


@app.get("/api/workspace/projects/{name}/log")
def stream_log(name: str):
    if name not in _output:
        return JSONResponse({"error": "No log for this project"}, status_code=404)
    output = _output[name]
    proc   = _procs.get(name)

    def generate():
        sent = 0
        yield ": ping\n\n"
        while True:
            current_len = len(output)
            for i in range(sent, current_len):
                yield f"data: {output[i]}\n\n"
            sent = current_len
            if proc is not None and proc.poll() is not None and sent >= len(output):
                rc = proc.returncode
                yield "data: \n\n"
                yield f"data: [Process exited — code {rc}]\n\n"
                yield "data: __done__\n\n"
                return
            time.sleep(0.15)

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/workspace/projects/{name}/health")
def health_project(name: str):
    project = PROJECTSPACE / name
    if not project.exists():
        return JSONResponse({"error": f"Project '{name}' not found"}, status_code=404)
    script = _find_script(project, ["health.sh"])
    if not script:
        return {"ok": False, "output": "No health.sh found for this project"}
    try:
        result = subprocess.run(
            ["bash", script],
            cwd=str(Path(script).parent),
            capture_output=True, text=True, timeout=15,
        )
        output = (result.stdout + result.stderr).strip()
        return {"ok": result.returncode == 0, "output": output or "(no output)"}
    except subprocess.TimeoutExpired:
        return JSONResponse({"error": "Health check timed out"}, status_code=500)


@app.get("/api/workspace/projects/{name}/docker-logs")
def stream_docker_logs(name: str):
    project = PROJECTSPACE / name
    if not project.exists():
        return JSONResponse({"error": f"Project '{name}' not found"}, status_code=404)
    logs_script  = _find_script(project, ["logs.sh"])
    compose_file = None
    for candidate in [
        project / "dockerspace" / "host_scripts" / "docker-compose.yml",
        project / "docker-compose.yml",
    ]:
        if candidate.exists():
            compose_file = candidate
            break
    if logs_script:
        cmd = ["bash", logs_script]
        cwd = str(Path(logs_script).parent)
    elif compose_file:
        cmd = ["docker", "compose", "-f", str(compose_file), "logs", "--tail=80", "--no-log-prefix"]
        cwd = str(compose_file.parent)
    else:
        return JSONResponse({"error": "No logs.sh or docker-compose.yml found"}, status_code=400)
    _output[name] = []
    proc = subprocess.Popen(
        cmd, cwd=cwd,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )
    _procs[name] = proc
    threading.Thread(target=_reader, args=(name, proc), daemon=True).start()
    output = _output[name]

    def generate():
        sent = 0
        yield ": ping\n\n"
        while True:
            current_len = len(output)
            for i in range(sent, current_len):
                yield f"data: {output[i]}\n\n"
            sent = current_len
            if proc.poll() is not None and sent >= len(output):
                yield "data: \n\n"
                yield f"data: [Logs complete — exit {proc.returncode}]\n\n"
                yield "data: __done__\n\n"
                return
            time.sleep(0.15)

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


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

    def generate():
        sent = 0
        yield ": ping\n\n"
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
# Git
# ─────────────────────────────────────────────────────────────────────────────

PROJECT_SPACE = PROJECTSPACE
BLOCKED_GIT   = ["push --force", "reset --hard origin", "clean -fd"]


def _resolve_repo(repo: str) -> tuple[Path, str | None]:
    if not repo:
        return WORKSPACE_ROOT, None
    candidate = (WORKSPACE_ROOT / repo).resolve()
    if not str(candidate).startswith(str(WORKSPACE_ROOT)):
        return WORKSPACE_ROOT, "repo path must be inside workspace"
    if not (candidate / ".git").exists():
        return WORKSPACE_ROOT, f"not a git repo: {repo}"
    return candidate, None


def _git(*args, cwd: Path = WORKSPACE_ROOT, timeout: int = 30) -> tuple[int, str, str]:
    try:
        r = subprocess.run(
            ["git"] + list(args),
            cwd=str(cwd), capture_output=True, text=True, timeout=timeout,
        )
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except subprocess.TimeoutExpired:
        return 1, "", f"timed out after {timeout}s"
    except Exception as e:
        return 1, "", str(e)


def _repo_info(cwd: Path, path_str: str, name: str) -> dict:
    _, br, _ = _git("branch", "--show-current", cwd=cwd)
    _, st, _ = _git("status", "--short", cwd=cwd)
    _, rm, _ = _git("remote", "-v", cwd=cwd)
    ch        = len([l for l in st.splitlines() if l.strip()])
    has_remote = bool(rm.strip())
    branch_name = br.strip() or "?"
    _, a_raw, _ = _git("rev-list", "@{u}..HEAD", "--count", cwd=cwd)
    _, b_raw, _ = _git("rev-list", "HEAD..@{u}", "--count", cwd=cwd)
    ahead  = int(a_raw.strip()) if a_raw.strip().isdigit() else None
    behind = int(b_raw.strip()) if b_raw.strip().isdigit() else None
    if ahead is None and has_remote and branch_name not in ("?", ""):
        _, a2, _ = _git("rev-list", f"origin/{branch_name}..HEAD", "--count", cwd=cwd)
        _, b2, _ = _git("rev-list", f"HEAD..origin/{branch_name}", "--count", cwd=cwd)
        ahead  = int(a2.strip()) if a2.strip().isdigit() else 0
        behind = int(b2.strip()) if b2.strip().isdigit() else 0
    if ahead is None:
        ahead = behind = 0
    return {
        "path": path_str, "name": name, "branch": branch_name,
        "changed": ch, "ahead": ahead, "behind": behind, "has_remote": has_remote,
    }


@app.get("/api/git/repos")
def list_repos():
    repos = [_repo_info(WORKSPACE_ROOT, "", "myworkspace (root)")]
    if PROJECT_SPACE.exists():
        for p in sorted(PROJECT_SPACE.rglob(".git")):
            if p.is_dir():
                repo_path = p.parent
                rel = repo_path.relative_to(WORKSPACE_ROOT)
                if len(rel.parts) <= 3:
                    try:
                        repos.append(_repo_info(repo_path, str(rel), repo_path.name))
                    except Exception:
                        repos.append({"path": str(rel), "name": repo_path.name,
                                      "branch": "?", "changed": 0, "ahead": 0,
                                      "behind": 0, "has_remote": False})
    return {"repos": repos}


@app.get("/api/git/status")
def git_status(repo: str = Query(default="")):
    cwd, err = _resolve_repo(repo)
    if err:
        return JSONResponse({"error": err}, status_code=400)
    rc,  status, _   = _git("status", "--short", "--branch", cwd=cwd)
    rc2, log,    _   = _git("log", "--oneline", "-25", "--decorate", cwd=cwd)
    rc3, staged, _   = _git("diff", "--cached", "--stat", cwd=cwd)
    rc4, unstaged, _ = _git("diff", "--stat", cwd=cwd)
    rc5, branch, _   = _git("branch", "--show-current", cwd=cwd)
    rc6, remote, _   = _git("remote", "-v", cwd=cwd)
    has_remote = bool(remote.strip())
    branch_name = branch.strip()
    _, ahead_raw,  _ = _git("rev-list", "@{u}..HEAD",  "--count", cwd=cwd)
    _, behind_raw, _ = _git("rev-list", "HEAD..@{u}",  "--count", cwd=cwd)
    ahead  = int(ahead_raw.strip())  if ahead_raw.strip().isdigit()  else None
    behind = int(behind_raw.strip()) if behind_raw.strip().isdigit() else None
    if ahead is None and has_remote and branch_name:
        _, a2, _ = _git("rev-list", f"origin/{branch_name}..HEAD", "--count", cwd=cwd)
        _, b2, _ = _git("rev-list", f"HEAD..origin/{branch_name}", "--count", cwd=cwd)
        ahead  = int(a2.strip()) if a2.strip().isdigit() else 0
        behind = int(b2.strip()) if b2.strip().isdigit() else 0
    if ahead is None:
        ahead = behind = 0
    lines       = status.splitlines() if status else []
    branch_line = lines[0] if lines else ""
    file_lines  = lines[1:] if len(lines) > 1 else []
    files = []
    for line in file_lines:
        if len(line) >= 3:
            xy   = line[:2]
            path = line[3:].strip()
            st   = "staged"    if xy[0] not in (" ", "?") else \
                   "untracked" if xy == "??" else "modified"
            display_path = path.split(" -> ")[-1].strip() if " -> " in path else path
            abs_path = cwd / display_path
            try:
                sz = abs_path.stat().st_size
                size_str = f"{sz / 1_048_576:.1f} MB" if sz >= 1_048_576 else \
                           f"{sz / 1024:.1f} KB"      if sz >= 1024      else f"{sz} B"
            except OSError:
                sz = 0; size_str = "—"
            files.append({"status": xy.strip(), "path": path, "state": st,
                          "size": size_str, "size_bytes": sz})
    return {
        "branch": branch.strip(), "branch_line": branch_line, "files": files,
        "log": log, "staged_stat": staged, "unstaged_stat": unstaged,
        "has_remote": has_remote, "ahead": ahead, "behind": behind, "repo": repo or ".",
    }


@app.get("/api/git/diff")
def git_diff(staged: bool = False, repo: str = Query(default="")):
    cwd, err = _resolve_repo(repo)
    if err:
        return JSONResponse({"error": err}, status_code=400)
    args = ["diff", "--cached"] if staged else ["diff"]
    rc, out, err2 = _git(*args, cwd=cwd)
    return {"diff": (out or err2)[:12000]}


class AddBody(BaseModel):
    files: list[str] = []
    repo:  str       = ""


class CommitBody(BaseModel):
    message: str
    files:   list[str] = []
    repo:    str       = ""


class PushBody(BaseModel):
    remote: str = "origin"
    branch: str = ""
    repo:   str = ""


class RepoBody(BaseModel):
    repo: str = ""


@app.post("/api/git/add")
def git_add(body: AddBody):
    cwd, err = _resolve_repo(body.repo)
    if err:
        return {"ok": False, "output": err}
    if body.files:
        rc, out, err2 = _git("add", "--", *body.files, cwd=cwd)
    else:
        rc, out, err2 = _git("add", "-u", cwd=cwd)
    return {"ok": rc == 0, "output": out or err2 or "staged"}


@app.post("/api/git/add-all")
def git_add_all(body: RepoBody = RepoBody()):
    cwd, err = _resolve_repo(body.repo)
    if err:
        return {"ok": False, "output": err}
    rc, out, err2 = _git("add", "-A", cwd=cwd)
    return {"ok": rc == 0, "output": out or err2 or "all staged"}


@app.post("/api/git/unstage")
def git_unstage(body: AddBody):
    cwd, err = _resolve_repo(body.repo)
    if err:
        return {"ok": False, "output": err}
    if body.files:
        rc, out, err2 = _git("restore", "--staged", "--", *body.files, cwd=cwd)
    else:
        rc, out, err2 = _git("restore", "--staged", ".", cwd=cwd)
    return {"ok": rc == 0, "output": out or err2 or "unstaged"}


@app.post("/api/git/commit")
def git_commit(body: CommitBody):
    if not body.message.strip():
        return JSONResponse({"ok": False, "output": "Commit message is required"}, status_code=400)
    cwd, err = _resolve_repo(body.repo)
    if err:
        return {"ok": False, "output": err}
    if body.files:
        _git("add", "--", *body.files, cwd=cwd)
    rc, out, err2 = _git("commit", "-m", body.message.strip(), cwd=cwd)
    return {"ok": rc == 0, "output": out or err2}


@app.post("/api/git/push")
def git_push(body: PushBody):
    cwd, err = _resolve_repo(body.repo)
    if err:
        return {"ok": False, "output": err}
    args = ["push", body.remote]
    if body.branch:
        args.append(body.branch)
    rc, out, err2 = _git(*args, cwd=cwd, timeout=60)
    return {"ok": rc == 0, "output": out or err2}


@app.post("/api/git/pull")
def git_pull(body: RepoBody = RepoBody()):
    cwd, err = _resolve_repo(body.repo)
    if err:
        return {"ok": False, "output": err}
    rc, out, err2 = _git("pull", cwd=cwd, timeout=60)
    return {"ok": rc == 0, "output": out or err2}


@app.post("/api/git/discard")
def git_discard(body: AddBody):
    if not body.files:
        return JSONResponse({"ok": False, "output": "Specify files to discard"}, status_code=400)
    cwd, err = _resolve_repo(body.repo)
    if err:
        return {"ok": False, "output": err}
    rc, out, err2 = _git("restore", "--", *body.files, cwd=cwd)
    return {"ok": rc == 0, "output": out or err2 or "discarded"}


# ─────────────────────────────────────────────────────────────────────────────
# Console
# ─────────────────────────────────────────────────────────────────────────────

BLOCKED_CMDS = [
    "rm -rf /", "mkfs", ":(){:|:&};:", "> /dev/sd",
    "dd if=/dev/zero", "chmod -R 777 /", "chown -R",
]


class CmdBody(BaseModel):
    command: str
    cwd: str = ""


@app.post("/api/console/exec")
def exec_command(body: CmdBody):
    cmd = body.command.strip()
    if not cmd:
        return JSONResponse({"ok": False, "output": "No command"}, status_code=400)
    for b in BLOCKED_CMDS:
        if b in cmd:
            return {"ok": False, "output": f"Blocked for safety: {b}", "exit_code": 1}
    if body.cwd:
        cwd = (WORKSPACE_ROOT / body.cwd).resolve()
        if not str(cwd).startswith(str(WORKSPACE_ROOT)):
            return {"ok": False, "output": "cwd must be inside workspace", "exit_code": 1}
        if not cwd.exists():
            return {"ok": False, "output": f"Directory not found: {body.cwd}", "exit_code": 1}
    else:
        cwd = WORKSPACE_ROOT
    try:
        r = subprocess.run(
            cmd, shell=True, cwd=str(cwd),
            capture_output=True, text=True, timeout=60,
        )
        output = r.stdout + r.stderr
        return {
            "ok": r.returncode == 0, "output": output[:10000],
            "exit_code": r.returncode,
            "cwd": str(cwd.relative_to(WORKSPACE_ROOT)) or ".",
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "output": "Command timed out after 60s", "exit_code": 124}
    except Exception as e:
        return {"ok": False, "output": str(e), "exit_code": 1}


@app.get("/api/console/cwd-list")
def list_cwd():
    dirs = []
    for p in sorted(WORKSPACE_ROOT.iterdir()):
        if p.is_dir() and not p.name.startswith(".") and p.name != "__pycache__":
            dirs.append(p.name)
            for sub in sorted(p.iterdir()):
                if sub.is_dir() and not sub.name.startswith("."):
                    dirs.append(f"{p.name}/{sub.name}")
    return {"dirs": dirs[:80]}


# ─────────────────────────────────────────────────────────────────────────────
# Server entry point (called from agent.py daemon thread)
# ─────────────────────────────────────────────────────────────────────────────

def start(host: str = "0.0.0.0", port: int = 8895):
    import uvicorn
    uvicorn.run(app, host=host, port=port, log_level="warning")
