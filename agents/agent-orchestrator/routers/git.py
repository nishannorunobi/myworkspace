"""
Git proxy — forwards all /api/git/* requests to the workspace agent
running on port 8890. Returns 503 if the workspace agent is offline.
"""
import json
import urllib.error
import urllib.request
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/git", tags=["git"])

_WS = "http://localhost:8890"


def _offline(msg: str = "workspace agent offline"):
    return JSONResponse({"error": msg}, status_code=503)


def _get(path: str):
    try:
        with urllib.request.urlopen(f"{_WS}{path}", timeout=15) as r:
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


@router.get("/repos")
def list_repos():
    d = _get("/api/git/repos")
    return d if d is not None else _offline()


@router.get("/status")
def git_status(repo: str = Query(default="")):
    path = f"/api/git/status" + (f"?repo={repo}" if repo else "")
    d = _get(path)
    return d if d is not None else _offline()


@router.get("/diff")
def git_diff(staged: bool = False, repo: str = Query(default="")):
    params = []
    if staged:
        params.append("staged=true")
    if repo:
        params.append(f"repo={repo}")
    path = "/api/git/diff" + ("?" + "&".join(params) if params else "")
    d = _get(path)
    return d if d is not None else _offline()


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


@router.post("/add")
def git_add(body: AddBody):
    d = _post("/api/git/add", json.dumps(body.model_dump()).encode())
    return d if d is not None else _offline()


@router.post("/add-all")
def git_add_all(body: RepoBody = RepoBody()):
    d = _post("/api/git/add-all", json.dumps(body.model_dump()).encode())
    return d if d is not None else _offline()


@router.post("/unstage")
def git_unstage(body: AddBody):
    d = _post("/api/git/unstage", json.dumps(body.model_dump()).encode())
    return d if d is not None else _offline()


@router.post("/commit")
def git_commit(body: CommitBody):
    d = _post("/api/git/commit", json.dumps(body.model_dump()).encode())
    return d if d is not None else _offline()


@router.post("/push")
def git_push(body: PushBody):
    d = _post("/api/git/push", json.dumps(body.model_dump()).encode())
    return d if d is not None else _offline()


@router.post("/pull")
def git_pull(body: RepoBody = RepoBody()):
    d = _post("/api/git/pull", json.dumps(body.model_dump()).encode())
    return d if d is not None else _offline()


@router.post("/discard")
def git_discard(body: AddBody):
    d = _post("/api/git/discard", json.dumps(body.model_dump()).encode())
    return d if d is not None else _offline()
