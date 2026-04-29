import os
import json
import subprocess
from pathlib import Path
from datetime import datetime

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent.parent  # workspace/→agents/→workspace-agent/→myworkspace/
AGENT_DIR      = Path(__file__).resolve().parent
MEMORY_DIR     = AGENT_DIR / "memory"

IGNORE = {".git", ".venv", "__pycache__", "node_modules", "target",
          ".vscode", "vscode-server-extensions", ".mvn", ".claude"}

TOOL_DEFINITIONS = [
    {
        "name": "scan_workspace",
        "description": (
            "Scan the workspace directory tree up to a given depth. "
            "Returns the folder/file structure. Use to observe the workspace layout."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "max_depth": {"type": "integer", "description": "Max depth to scan (default 4)"},
                "path":      {"type": "string",  "description": "Subpath to scan (default: workspace root)"}
            }
        }
    },
    {
        "name": "read_file",
        "description": "Read any file inside the workspace. Path is relative to workspace root.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to workspace root"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "git_log",
        "description": "Get recent git commit history for the workspace or a specific project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "n":    {"type": "integer", "description": "Number of commits (default 20)"},
                "path": {"type": "string",  "description": "Subpath (defaults to workspace root)"}
            }
        }
    },
    {
        "name": "git_status",
        "description": "Get current git working tree status (uncommitted changes).",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Subpath (defaults to workspace root)"}
            }
        }
    },
    {
        "name": "git_diff",
        "description": "Get diff of recent changes or a specific commit.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path":   {"type": "string", "description": "Subpath (defaults to workspace root)"},
                "commit": {"type": "string", "description": "Specific commit hash (optional)"},
                "stat":   {"type": "boolean","description": "Show only stats, not full diff (default true)"}
            }
        }
    },
    {
        "name": "write_memory",
        "description": "Save an observation, note, or structured data to the agent memory store.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {"type": "string", "description": "Memory file name (e.g. projects.md, concerns.md)"},
                "content":  {"type": "string", "description": "Content to write"},
                "append":   {"type": "boolean","description": "Append to existing file instead of overwriting (default false)"}
            },
            "required": ["filename", "content"]
        }
    },
    {
        "name": "read_memory",
        "description": "Read a memory file by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {"type": "string", "description": "Memory file name to read"}
            },
            "required": ["filename"]
        }
    },
    {
        "name": "list_memory",
        "description": "List all files currently stored in agent memory.",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "update_meta",
        "description": (
            "Update the structured meta.json file that other agents can consume. "
            "Contains workspace structure, project list, active concerns, and key facts."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "meta": {
                    "type": "object",
                    "description": "Structured metadata dict to merge into meta.json"
                }
            },
            "required": ["meta"]
        }
    },
    {
        "name": "run_command",
        "description": (
            "Run a Linux shell command in the workspace and return stdout, stderr, and exit code. "
            "Use to run health checks, build scripts, or diagnose failures. "
            "Re-run after a fix to confirm it worked."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string",  "description": "Shell command to run (e.g. './health.sh', 'docker ps', 'python -m py_compile app.py')"},
                "cwd":     {"type": "string",  "description": "Working directory relative to workspace root (default: workspace root)"},
                "timeout": {"type": "integer", "description": "Timeout in seconds (default 30, max 120)"}
            },
            "required": ["command"]
        }
    },
    {
        "name": "edit_file",
        "description": (
            "Make a targeted search-and-replace edit in a file. "
            "Preferred over write_file for changes to existing files — safer and less error-prone. "
            "old_string must be an exact, unique substring copied from read_file output. "
            "Include enough surrounding context to be unambiguous. Never guess whitespace."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path":       {"type": "string", "description": "File path relative to workspace root"},
                "old_string": {"type": "string", "description": "Exact text to find — must match the file exactly, including indentation"},
                "new_string": {"type": "string", "description": "Replacement text"}
            },
            "required": ["path", "old_string", "new_string"]
        }
    },
    {
        "name": "write_file",
        "description": (
            "Write or overwrite a file inside the workspace. "
            "Use for new files or complete rewrites. For changes to existing files, prefer edit_file. "
            "Always read the file first, make minimal changes, then re-run to verify."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path":    {"type": "string", "description": "File path relative to workspace root"},
                "content": {"type": "string", "description": "Full content to write to the file"}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "search_code",
        "description": (
            "Search for a pattern across files in the workspace using grep. "
            "Use to find where a function is defined, where a variable is used, "
            "which files import a module, or any keyword across the codebase."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern":        {"type": "string",  "description": "Search pattern (string or basic regex)"},
                "path":           {"type": "string",  "description": "Subdirectory to search (default: workspace root)"},
                "file_pattern":   {"type": "string",  "description": "Restrict to file types e.g. '*.py', '*.sh'"},
                "case_sensitive": {"type": "boolean", "description": "Case-sensitive search (default false)"}
            },
            "required": ["pattern"]
        }
    },
    {
        "name": "git_commit",
        "description": (
            "Stage specific files and create a git commit. "
            "Always stage only files you changed. Write commit messages that describe WHY, not just what. "
            "Call after any code fix to preserve the change in history."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Commit message — describe why the change was made"},
                "paths":   {
                    "type": "array", "items": {"type": "string"},
                    "description": "File paths to stage relative to workspace root. Be specific — avoid '.' unless you have reviewed all changes."
                }
            },
            "required": ["message", "paths"]
        }
    },
    {
        "name": "send_email",
        "description": (
            "Send an email notification to the workspace owner. "
            "Call this after any autonomous fix or when you detect an issue you cannot resolve. "
            "Always include: what was broken, what you changed (if anything), and whether the fix verified successfully."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {"type": "string", "description": "Short subject line (no prefix needed)"},
                "body":    {"type": "string", "description": "Plain-text email body — be specific: file changed, old value, new value, verification result"}
            },
            "required": ["subject", "body"]
        }
    }
]


def _run(cmd: list, cwd=None) -> str:
    try:
        result = subprocess.run(
            cmd, cwd=str(cwd or WORKSPACE_ROOT),
            capture_output=True, text=True, timeout=15
        )
        return (result.stdout + result.stderr).strip()
    except subprocess.TimeoutExpired:
        return "Command timed out"
    except Exception as e:
        return f"Error: {e}"


def _tree(root: Path, depth: int, max_depth: int, prefix="") -> list[str]:
    if depth > max_depth:
        return []
    lines = []
    try:
        entries = sorted(root.iterdir(), key=lambda p: (p.is_file(), p.name))
    except PermissionError:
        return []
    for i, entry in enumerate(entries):
        if entry.name in IGNORE or entry.name.startswith("."):
            continue
        connector = "└── " if i == len(entries) - 1 else "├── "
        lines.append(f"{prefix}{connector}{entry.name}{'/' if entry.is_dir() else ''}")
        if entry.is_dir():
            extension = "    " if i == len(entries) - 1 else "│   "
            lines.extend(_tree(entry, depth + 1, max_depth, prefix + extension))
    return lines


def execute_tool(name: str, inp: dict) -> dict:

    if name == "scan_workspace":
        max_depth = inp.get("max_depth", 4)
        subpath   = inp.get("path", "")
        root      = WORKSPACE_ROOT / subpath if subpath else WORKSPACE_ROOT
        if not root.exists():
            return {"error": f"Path not found: {subpath}"}
        lines = [str(root)] + _tree(root, 1, max_depth)
        return {"tree": "\n".join(lines), "root": str(root)}

    if name == "read_file":
        path = WORKSPACE_ROOT / inp["path"]
        if not path.exists():
            return {"error": f"File not found: {inp['path']}"}
        if not str(path).startswith(str(WORKSPACE_ROOT)):
            return {"error": "Access denied — outside workspace"}
        try:
            content = path.read_text(errors="replace")
            return {"content": content[:8000], "truncated": len(content) > 8000}
        except Exception as e:
            return {"error": str(e)}

    if name == "git_log":
        n    = inp.get("n", 20)
        cwd  = WORKSPACE_ROOT / inp["path"] if inp.get("path") else WORKSPACE_ROOT
        out  = _run(["git", "log", f"-{n}",
                     "--pretty=format:%h  %ad  %an  %s",
                     "--date=short", "--stat"], cwd=cwd)
        return {"log": out}

    if name == "git_status":
        cwd = WORKSPACE_ROOT / inp["path"] if inp.get("path") else WORKSPACE_ROOT
        out = _run(["git", "status", "--short"], cwd=cwd)
        return {"status": out or "clean"}

    if name == "git_diff":
        cwd    = WORKSPACE_ROOT / inp["path"] if inp.get("path") else WORKSPACE_ROOT
        stat   = inp.get("stat", True)
        commit = inp.get("commit")
        cmd    = ["git", "diff"]
        if commit:
            cmd += [f"{commit}^", commit]
        if stat:
            cmd.append("--stat")
        out = _run(cmd, cwd=cwd)
        return {"diff": out or "no changes"}

    if name == "write_memory":
        if "content" not in inp:
            return {"error": "write_memory called without 'content' field"}
        MEMORY_DIR.mkdir(exist_ok=True)
        filepath = MEMORY_DIR / inp["filename"]
        mode     = "a" if inp.get("append") else "w"
        if inp.get("append") and filepath.exists():
            content = f"\n\n---\n*{datetime.now().strftime('%Y-%m-%d %H:%M')}*\n\n{inp['content']}"
        else:
            content = inp["content"]
        filepath.write_text(content if mode == "w" else
                            (filepath.read_text() if filepath.exists() else "") + content)
        return {"saved": str(filepath)}

    if name == "read_memory":
        filepath = MEMORY_DIR / inp["filename"]
        if not filepath.exists():
            return {"error": f"Memory file not found: {inp['filename']}"}
        return {"content": filepath.read_text()}

    if name == "list_memory":
        MEMORY_DIR.mkdir(exist_ok=True)
        files = [f.name for f in sorted(MEMORY_DIR.iterdir()) if f.is_file()]
        return {"files": files}

    if name == "run_command":
        command = inp["command"]
        BLOCKED = ["rm -rf /", "mkfs", ":(){:|:&};:", "> /dev/sd"]
        if any(b in command for b in BLOCKED):
            return {"error": f"Command blocked for safety: {command}"}
        cwd = WORKSPACE_ROOT / inp["cwd"] if inp.get("cwd") else WORKSPACE_ROOT
        if not str(cwd.resolve()).startswith(str(WORKSPACE_ROOT)):
            return {"error": "cwd must be inside workspace"}
        timeout = min(inp.get("timeout", 30), 120)
        try:
            result = subprocess.run(
                command, shell=True, cwd=str(cwd),
                capture_output=True, text=True, timeout=timeout
            )
            return {
                "stdout":    result.stdout[:4000],
                "stderr":    result.stderr[:2000],
                "exit_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"error": f"Command timed out after {timeout}s"}
        except Exception as e:
            return {"error": str(e)}

    if name == "edit_file":
        path = (WORKSPACE_ROOT / inp["path"]).resolve()
        if not str(path).startswith(str(WORKSPACE_ROOT)):
            return {"error": "Access denied — path outside workspace"}
        if not path.exists():
            return {"error": f"File not found: {inp['path']}"}
        try:
            content   = path.read_text(errors="replace")
            old, new  = inp["old_string"], inp["new_string"]
            if old not in content:
                return {"error": "old_string not found in file — re-read the file and copy the exact text including whitespace"}
            count = content.count(old)
            if count > 1:
                return {"error": f"old_string matches {count} locations — add more surrounding context to make it unique"}
            path.write_text(content.replace(old, new, 1))
            return {"edited": inp["path"]}
        except Exception as e:
            return {"error": str(e)}

    if name == "write_file":
        path = (WORKSPACE_ROOT / inp["path"]).resolve()
        if not str(path).startswith(str(WORKSPACE_ROOT)):
            return {"error": "Access denied — path outside workspace"}
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(inp["content"])
            return {"saved": inp["path"]}
        except Exception as e:
            return {"error": str(e)}

    if name == "search_code":
        search_path = WORKSPACE_ROOT / inp["path"] if inp.get("path") else WORKSPACE_ROOT
        file_pat    = inp.get("file_pattern", "")
        no_case     = [] if inp.get("case_sensitive") else ["-i"]
        include     = [f"--include={file_pat}"] if file_pat else []
        excludes    = [
            "--exclude-dir=.venv", "--exclude-dir=__pycache__",
            "--exclude-dir=.git",  "--exclude-dir=target",
            "--exclude-dir=node_modules",
        ]
        cmd = ["grep", "-r", "-n"] + no_case + include + excludes + [inp["pattern"], str(search_path)]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            output = result.stdout.strip().replace(str(WORKSPACE_ROOT) + "/", "")
            lines  = [l for l in output.splitlines() if l][:60]
            return {"matches": "\n".join(lines), "total": len(lines)}
        except subprocess.TimeoutExpired:
            return {"error": "Search timed out"}
        except Exception as e:
            return {"error": str(e)}

    if name == "git_commit":
        paths   = inp.get("paths", [])
        message = inp["message"]
        if not paths:
            return {"error": "paths list is required — specify which files to stage"}
        try:
            add = subprocess.run(
                ["git", "add"] + paths, cwd=str(WORKSPACE_ROOT),
                capture_output=True, text=True, timeout=30
            )
            if add.returncode != 0:
                return {"error": f"git add failed: {add.stderr.strip()}"}
            commit = subprocess.run(
                ["git", "commit", "-m", message], cwd=str(WORKSPACE_ROOT),
                capture_output=True, text=True, timeout=30
            )
            return {
                "committed": commit.returncode == 0,
                "output":    (commit.stdout + commit.stderr).strip(),
            }
        except Exception as e:
            return {"error": str(e)}

    if name == "send_email":
        import smtplib
        from email.mime.text import MIMEText
        smtp_host    = os.environ.get("SMTP_HOST", "smtp.gmail.com")
        smtp_port    = int(os.environ.get("SMTP_PORT", "587"))
        smtp_user    = os.environ.get("SMTP_USER", "")
        smtp_pass    = os.environ.get("SMTP_PASS", "")
        notify_email = os.environ.get("NOTIFY_EMAIL", smtp_user)
        if not smtp_user or not smtp_pass:
            return {"error": "SMTP credentials not set — add SMTP_USER and SMTP_PASS to shared.conf"}
        msg = MIMEText(inp["body"])
        msg["Subject"] = f"[workspace-agent] {inp['subject']}"
        msg["From"]    = smtp_user
        msg["To"]      = notify_email
        try:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            return {"sent": True, "to": notify_email}
        except Exception as e:
            return {"error": f"Email failed: {e}"}

    if name == "update_meta":
        MEMORY_DIR.mkdir(exist_ok=True)
        meta_path = MEMORY_DIR / "meta.json"
        existing  = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        existing.update(inp["meta"])
        existing["last_updated"] = datetime.now().isoformat()
        meta_path.write_text(json.dumps(existing, indent=2))
        return {"saved": str(meta_path)}

    return {"error": f"Unknown tool: {name}"}
