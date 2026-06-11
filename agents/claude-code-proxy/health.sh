#!/bin/bash

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────
PORT="${PORT:-8892}"
curl -sf "http://localhost:$PORT/health" | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK' if d['status']=='ok' else 'FAIL', '|', d.get('claude_bin','?'))" 2>/dev/null || echo "FAIL — not running"
