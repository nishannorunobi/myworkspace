Object.assign(Dashboard.prototype, {

  // ── Grid view ─────────────────────────────────────────────────────────────

  _renderGrid() {
    const grid = $('grid-view');
    if (!grid) return;
    grid.innerHTML = '';
    for (const a of this._agents.filter(a => !a.hidden)) {
      const card = document.createElement('div');
      card.className = 'agent-card ' + a.status + (this._selected === a.id ? ' selected' : '');
      card.dataset.id = a.id;
      const statusLabel = { running: 'Running', stopped: 'Stopped', unavailable: 'Unavailable', unknown: 'Unknown' };
      const uptimeRow = a.status === 'running'
        ? `<div class="stat-box"><div class="stat-label">Uptime</div><div class="stat-value green">${esc(a.uptime)}</div></div>`
        : `<div class="stat-box"><div class="stat-label">Down since</div><div class="stat-value text2">${esc(a.downtime)}</div></div>`;
      card.innerHTML = `
        <div class="card-hdr">
          <div class="card-name">${esc(a.name)}</div>
          <span class="status-badge ${a.status}">${statusLabel[a.status] || a.status}</span>
          <span class="card-type">${a.connector}</span>
        </div>
        <div class="card-desc">${esc(a.description)}</div>
        <div class="card-stats">
          ${uptimeRow}
          <div class="stat-box">
            <div class="stat-label">Last check</div>
            <div class="stat-value text3">${esc(a.last_check)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Memory</div>
            <div class="stat-value text3">${a.mem_files.length} file${a.mem_files.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="card-footer">
          <div class="dot ${a.status}"></div>
          <button class="card-open-btn">Open →</button>
        </div>`;
      card.querySelector('.card-open-btn').onclick = (e) => { e.stopPropagation(); this.openDetail(a.id); };
      card.onclick = () => this.openDetail(a.id);
      grid.appendChild(card);
    }
  },

  // ── Sidebar agent list ────────────────────────────────────────────────────

  _updateSidebar() {
    const list = $('sidebar-agents');
    if (!list) return;
    list.innerHTML = this._agents.filter(a => !a.hidden).map(a => `
      <div class="agent-item${this._selected === a.id ? ' active' : ''}" onclick="window._dash.openDetail('${a.id}')">
        <div class="agent-item-name">${esc(a.name)}</div>
        <div class="agent-item-meta">
          <div class="dot ${a.status}"></div>
          <span class="status-txt ${a.status}">${a.status}</span>
          <span class="type-tag">${a.connector}</span>
        </div>
      </div>`).join('');
  },

});
