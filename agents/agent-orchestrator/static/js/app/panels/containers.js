// ── ContainersPanel — list and control Docker containers for an agent ──────────
class ContainersPanel extends Panel {
  constructor(spinner) {
    super('containers');
    this.spinner  = spinner;
    this._agentId = null;
  }

  onActivate() {
    if (this._agentId) this.load(this._agentId);
  }

  refresh(agentId) {
    if (agentId) this._agentId = agentId;
    if (this._agentId) this.load(this._agentId);
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async load(agentId) {
    this._agentId  = agentId;
    const grid     = $('containers-grid');
    const summary  = $('containers-summary');
    grid.innerHTML = '<div class="containers-empty">Loading…</div>';
    try {
      const res  = await fetch(`/api/agents/${agentId}/containers`);
      const data = await res.json();
      if (data.error) {
        grid.innerHTML = `<div class="containers-empty">${esc(data.error)}</div>`;
        return;
      }
      const containers = data.containers || [];
      summary.textContent = `${data.running ?? 0} running · ${data.stopped ?? 0} stopped · ${data.count ?? 0} total`;
      if (!containers.length) {
        grid.innerHTML = '<div class="containers-empty">No containers found.</div>';
        return;
      }
      grid.innerHTML = containers.map(c => this._card(agentId, c)).join('');
    } catch (e) {
      grid.innerHTML = `<div class="containers-empty">Failed to load: ${esc(String(e))}</div>`;
    }
  }

  // ── Card render ───────────────────────────────────────────────────────────

  _card(agentId, c) {
    const isUp    = c.status?.startsWith('Up');
    const cls     = isUp ? 'running' : 'stopped';
    const cpu     = c.cpu    || '—';
    const mem     = c.memory || '—';
    const memPct  = c.mem_pct || '';
    const memVal  = memPct || (mem.split('/')[0]?.trim()) || '—';
    const name    = esc(c.name);
    const n       = c.name;

    const parsePct = s => { const m = String(s).match(/(\d+\.?\d*)/); return m ? Math.min(100, parseFloat(m[1])) : 0; };
    const barClr   = v  => v > 80 ? '#f85149' : v > 50 ? '#d29922' : '#3fb950';
    const cpuPct   = parsePct(cpu);
    const memPctN  = parsePct(memVal);

    return `<div class="c-card ${cls}" id="cc-${name}">
      <div class="c-hdr">
        <div class="c-name">${name}</div>
        <div class="dot ${cls}"></div>
      </div>
      <div class="c-image">${esc(c.image || '')}</div>
      <div class="c-meta">
        <div class="c-row">
          <span class="c-lbl">Status</span>
          <span class="c-val ${isUp ? 'up' : 'down'}">${esc(c.status || '—')}</span>
        </div>
        ${c.running_for ? `<div class="c-row"><span class="c-lbl">Uptime</span><span class="c-val">${esc(c.running_for)}</span></div>` : ''}
      </div>
      ${isUp ? `<div class="c-stats">
        <div class="c-chip">
          <div class="c-chip-val">${esc(cpu)}</div>
          <div class="c-bar-wrap"><div class="c-bar-fill" style="width:${cpuPct.toFixed(1)}%;background:${barClr(cpuPct)}"></div></div>
          <div class="c-chip-lbl">CPU</div>
        </div>
        <div class="c-chip">
          <div class="c-chip-val">${esc(memVal)}</div>
          <div class="c-bar-wrap"><div class="c-bar-fill" style="width:${memPctN.toFixed(1)}%;background:${barClr(memPctN)}"></div></div>
          <div class="c-chip-lbl">Mem%</div>
        </div>
        <div class="c-chip"><div class="c-chip-val" style="font-size:10px">${esc(mem.split('/')[0]?.trim()||'—')}</div><div class="c-chip-lbl">Mem Used</div></div>
      </div>` : ''}
      <div class="c-actions">
        <button class="c-btn start"         ${isUp  ? 'disabled' : ''} onclick="window._dash.panels.containers.action('${agentId}','${esc(n)}','start',this)">Start</button>
        <button class="c-btn stop"          ${!isUp ? 'disabled' : ''} onclick="window._dash.panels.containers.action('${agentId}','${esc(n)}','stop',this)">Stop</button>
        <button class="c-btn restart"                                   onclick="window._dash.panels.containers.action('${agentId}','${esc(n)}','restart',this)">Restart</button>
        <button class="c-btn clean-restart" title="Recreate from compose — applies volume mounts, image rebuilds, and config changes"
                onclick="window._dash.panels.containers.action('${agentId}','${esc(n)}','clean-restart',this)">↺ Rebuild</button>
      </div>
    </div>`;
  }

  // ── Container action ──────────────────────────────────────────────────────

  async action(agentId, containerName, act, btn = null) {
    const card = document.getElementById(`cc-${containerName}`);
    card?.querySelectorAll('.c-btn').forEach(b => b.disabled = true);
    if (btn) this.spinner.busy(btn);
    try {
      const res  = await fetch(
        `/api/agents/${agentId}/containers/${encodeURIComponent(containerName)}/${act}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = data.detail || data.error || 'Action failed';
        const err = document.createElement('div');
        err.className = 'containers-empty';
        err.style.cssText = 'color:var(--red);font-size:12px;grid-column:1/-1;padding:4px 0';
        err.textContent   = `${containerName}: ${msg}`;
        card?.insertAdjacentElement('afterend', err);
        setTimeout(() => err.remove(), 5000);
      }
    } catch (e) {
      console.error('Container action error:', e);
    }
    setTimeout(() => this.load(agentId), 2000);
  }
}

window.ContainersPanel = ContainersPanel;
