#!/bin/bash
# restart-agents.sh — restart the 3 in-house host agents so they pick up code
# changes (e.g. the new /metrics GC endpoint). Each agent's start script runs
# its server in the FOREGROUND, so we stop it then relaunch DETACHED (setsid)
# — each script still tees to its own mirror log, so logs are preserved.
#
# Usage:  bash agents/restart-agents.sh
set -u
AGENTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

restart() {
  local name="$1" dir="$2" startscript="$3"
  echo "── $name ($dir/$startscript) ──"
  if [ -f "$AGENTS_DIR/$dir/stop.sh" ]; then
    ( cd "$AGENTS_DIR/$dir" && bash stop.sh ) >/dev/null 2>&1 || true
  fi
  sleep 1
  ( cd "$AGENTS_DIR/$dir" && setsid bash "$startscript" >/dev/null 2>&1 < /dev/null & )
  echo "  relaunched (detached)"
}

restart "orchestrator"   "agent-orchestrator"   "start_web.sh"
restart "docker-manager" "docker-manager-agent" "start.sh"
restart "workspace"      "workspace-agent"      "start_daemon.sh"

echo
echo "Waiting a few seconds, then checking /metrics …"
sleep 4
for pair in "orchestrator:8888" "docker-manager:8889" "workspace:8895"; do
  name="${pair%%:*}"; port="${pair##*:}"
  if curl -fsS "http://localhost:$port/metrics" >/dev/null 2>&1; then
    echo "  ✓ $name  (:$port/metrics UP)"
  else
    echo "  … $name (:$port/metrics not up yet — check its log under mountspace/logs/...)"
  fi
done
echo
echo "Prometheus job 'agents-pymem' should turn UP within ~15s (localhost:9091/targets)."
