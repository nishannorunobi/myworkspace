// ── SubAgentsPanel — show and navigate to an agent's sub-agents ───────────────
class SubAgentsPanel extends Panel {
  constructor(nav) {
    super('agents');
    this.nav = nav;   // NavController — needed for openDetail
  }

  onActivate() {
    // load is triggered by NavController with the selected agentId
  }

  async load(agentId) {
    const grid = $('sub-agents-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:13px">Loading…</div>';
    try {
      const res  = await fetch(`/api/agents/${agentId}/sub-agents`);
      const data = await res.json();
      const subs = data.sub_agents || [];
      if (!subs.length) {
        grid.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:13px">No sub-agents configured.</div>';
        return;
      }
      const statusLabel = { running: 'Running', stopped: 'Stopped', unknown: 'Unknown' };
      grid.innerHTML = subs.map(a => `
        <div class="sub-agent-card ${a.status}" onclick="window._dash.nav.openSubAgent('${agentId}','${a.id}')">
          <div class="sub-agent-hdr">
            <div class="dot ${a.status}"></div>
            <div class="sub-agent-name">${esc(a.name)}</div>
            <span class="status-badge ${a.status}">${statusLabel[a.status] || a.status}</span>
          </div>
          <div class="sub-agent-desc">${esc(a.description)}</div>
          <div class="sub-agent-meta">
            ${a.status === 'running'
              ? `<span class="sub-agent-stat green">↑ ${esc(a.uptime)}</span>`
              : `<span class="sub-agent-stat text3">↓ ${esc(a.downtime)}</span>`}
            <span class="sub-agent-stat text3">${a.mem_files.length} memory file${a.mem_files.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="sub-agent-open">Open →</div>
        </div>`).join('');
    } catch (e) {
      grid.innerHTML = `<div style="padding:16px;color:var(--danger);font-size:13px">Failed: ${e}</div>`;
    }
  }
}

window.SubAgentsPanel = SubAgentsPanel;
