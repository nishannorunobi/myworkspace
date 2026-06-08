"""
Services router — returns all declared web URLs with live reachability status.

GET /api/services   → list of {name, url, agent_id, agent_name, reachable}
"""
import socket
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter
import agent_registry as registry

router = APIRouter(prefix="/services", tags=["services"])


def _tcp_reachable(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def _reachable(url: str, health_url: str | None = None) -> bool:
    check = health_url or url
    parsed = urllib.parse.urlparse(check)

    if parsed.scheme in ("http", "https"):
        try:
            urllib.request.urlopen(check, timeout=2)
            return True
        except urllib.error.HTTPError:
            # Server responded with an HTTP error (4xx/5xx) — it's still up
            return True
        except Exception:
            return False

    # For non-HTTP schemes (redis://, amqp://, etc.) do a raw TCP check
    host = parsed.hostname or "localhost"
    port = parsed.port
    if port is None:
        _DEFAULT_PORTS = {"redis": 6379, "rediss": 6380, "amqp": 5672, "amqps": 5671}
        port = _DEFAULT_PORTS.get(parsed.scheme)
    if port is None:
        return False
    return _tcp_reachable(host, port)


@router.get("")
def list_services():
    result = []
    for spec in registry.AGENT_SPECS:
        for svc in spec.services:
            result.append({
                "name":       svc["name"],
                "url":        svc["url"],
                "agent_id":   spec.id,
                "agent_name": spec.name,
                "reachable":  _reachable(svc["url"], svc.get("health_url")),
            })
    return {"services": result}
