"""
py_mem_metrics — stdlib Prometheus metrics for the CPython runtime (GC + heap).

Drop-in for any FastAPI agent:  `from py_mem_metrics import mount_mem_metrics`
then `mount_mem_metrics(app)` after the app is created → exposes GET /metrics.

No external dependencies (uses gc / tracemalloc / /proc only). The OS-level
procmem-exporter sees these processes from outside; THIS exposes what only the
interpreter knows — GC behaviour, live object counts, and (optionally) the
tracemalloc-tracked heap. Prometheus adds the `agent` label per scrape target.

Env:
  PYMEM_TOP_TYPES         number of object types to report   (default 25)
  PYMEM_TRACEMALLOC=1     also report tracemalloc current/peak heap (has overhead)
  PYMEM_TRACEMALLOC_FRAMES frames to capture                 (default 1)
"""
import gc
import os
import tracemalloc
from collections import Counter

_TOP_TYPES = int(os.environ.get("PYMEM_TOP_TYPES", "25"))


def maybe_start_tracemalloc():
    if os.environ.get("PYMEM_TRACEMALLOC", "0") == "1" and not tracemalloc.is_tracing():
        tracemalloc.start(int(os.environ.get("PYMEM_TRACEMALLOC_FRAMES", "1")))


def _proc_status() -> dict:
    out = {}
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith(("VmRSS:", "VmData:", "VmStk:", "VmSize:", "Threads:")):
                    k, _, v = line.partition(":")
                    out[k] = v.strip()
    except OSError:
        pass
    return out


def _kb(d: dict, k: str) -> int:
    v = d.get(k, "0").split()
    return int(v[0]) * 1024 if v and v[0].isdigit() else 0


def render_metrics() -> str:
    out: list[str] = []

    def gauge(name, help_, val):
        out.append(f"# HELP {name} {help_}")
        out.append(f"# TYPE {name} gauge")
        out.append(f"{name} {val}")

    # ── GC stats per generation (counters) ──
    out.append("# HELP python_gc_collections_total GC collection runs per generation.")
    out.append("# TYPE python_gc_collections_total counter")
    out.append("# HELP python_gc_collected_total Objects reclaimed by GC per generation (unreferenced cleaned up).")
    out.append("# TYPE python_gc_collected_total counter")
    out.append("# HELP python_gc_uncollectable_total Objects GC could not free per generation (leaks).")
    out.append("# TYPE python_gc_uncollectable_total counter")
    for i, s in enumerate(gc.get_stats()):
        out.append(f'python_gc_collections_total{{generation="{i}"}} {s.get("collections", 0)}')
        out.append(f'python_gc_collected_total{{generation="{i}"}} {s.get("collected", 0)}')
        out.append(f'python_gc_uncollectable_total{{generation="{i}"}} {s.get("uncollectable", 0)}')

    # ── GC pending counts (sawtooth = pressure building, then drop after collection) ──
    out.append("# HELP python_gc_count Objects pending in each GC generation right now.")
    out.append("# TYPE python_gc_count gauge")
    for i, c in enumerate(gc.get_count()):
        out.append(f'python_gc_count{{generation="{i}"}} {c}')

    # ── live tracked objects + breakdown by type ──
    objs = gc.get_objects()
    gauge("python_gc_tracked_objects", "Total GC-tracked live objects.", len(objs))
    out.append("# HELP python_objects_by_type Live object count per type (top N).")
    out.append("# TYPE python_objects_by_type gauge")
    for name, c in Counter(type(o).__name__ for o in objs).most_common(_TOP_TYPES):
        safe = name.replace("\\", "\\\\").replace('"', '\\"')
        out.append(f'python_objects_by_type{{type="{safe}"}} {c}')
    del objs

    gauge("python_gc_enabled", "1 if the cyclic GC is enabled.", 1 if gc.isenabled() else 0)

    # ── optional tracemalloc heap ──
    if tracemalloc.is_tracing():
        cur, peak = tracemalloc.get_traced_memory()
        gauge("python_tracemalloc_current_bytes", "Current tracemalloc-tracked heap.", cur)
        gauge("python_tracemalloc_peak_bytes", "Peak tracemalloc-tracked heap.", peak)

    # ── process memory (so the GC dashboard is self-contained) ──
    st = _proc_status()
    gauge("process_resident_bytes", "Resident set size (RSS).", _kb(st, "VmRSS"))
    gauge("process_data_bytes", "Data/heap segment size (VmData).", _kb(st, "VmData"))
    gauge("process_threads", "OS thread count.", int(st.get("Threads", "1") or 1))
    return "\n".join(out) + "\n"


def mount_mem_metrics(app, path: str = "/metrics"):
    """Register GET <path> on a FastAPI/Starlette app. Safe no-op if unavailable."""
    maybe_start_tracemalloc()
    try:
        from starlette.responses import PlainTextResponse
    except ImportError:
        return

    @app.get(path, include_in_schema=False)
    def _python_mem_metrics():
        return PlainTextResponse(
            render_metrics(), media_type="text/plain; version=0.0.4; charset=utf-8")
