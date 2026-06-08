Object.assign(Dashboard.prototype, {

  async _completeTodo(id) {
    const row = document.getElementById(`todo-row-${id}`);
    if (row) row.style.opacity = '0.4';
    try {
      const res = await fetch(`/api/agents/workspace/todos/${id}/complete`, { method: 'POST' });
      const d   = await res.json();
      if (d.ok) {
        if (row) row.remove();
        // refresh today panel counts
        this._loadToday();
      } else {
        if (row) row.style.opacity = '1';
      }
    } catch (_) {
      if (row) row.style.opacity = '1';
    }
  },

  // ── Workspace pulse bar ───────────────────────────────────────────────────

  async _loadPulse() {
    const bar   = $('ws-pulse');
    const pills = $('ws-pulse-pills');
    if (!bar || !pills) return;
    try {
      const res  = await fetch('/api/agents/workspace/memory/today.json').catch(() => null);
      if (!res || !res.ok) return;
      const data    = await res.json();
      const content = JSON.parse(data.content || '{}');
      const sugs    = content.suggestions || [];

      if (sugs.length === 0) {
        bar.style.display = '';
        pills.innerHTML   = '<span class="ws-pill info">All clear ✓</span>';
        bar.className     = 'ws-pulse ws-pulse-clear';
        return;
      }

      const hasEmergency = sugs.some(s => s.level === 'emergency');
      const hasWarning   = sugs.some(s => s.level === 'warning');
      bar.className      = `ws-pulse ${hasEmergency ? 'ws-pulse-emergency' : hasWarning ? 'ws-pulse-warning' : 'ws-pulse-info'}`;
      bar.style.display  = '';

      pills.innerHTML = sugs.slice(0, 6).map(s =>
        `<span class="ws-pill ${esc(s.level)}" title="${esc(s.source)}">${esc(s.message)}</span>`
      ).join('');
    } catch (e) { /* silent */ }
  },

  _refreshPulse() { this._loadPulse(); this._loadToday(); },

  // ── Today panel (workspace agent) ────────────────────────────────────────

  async _loadToday() {
    const wrap = $('today-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="today-loading">Loading…</div>';
    try {
      const res  = await fetch('/api/agents/workspace/memory/today.json').catch(() => null);
      if (!res || !res.ok) { wrap.innerHTML = '<div class="today-loading">today.json not ready yet — scanner runs every 30s.</div>'; return; }
      const data = await res.json();
      const content = JSON.parse(data.content || '{}');
      wrap.innerHTML = this._renderToday(content);
      // Sync git repo selector if git tab is loaded and today has fresh repos
      if (content.git_repos?.length) this._gitSyncRepos(content.git_repos);
    } catch (e) {
      wrap.innerHTML = `<div class="today-loading">Error: ${esc(String(e))}</div>`;
    }
  },

  _gitSyncRepos(repos) {
    const sel = $('git-repo-sel');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = repos.map(r => {
      let hint = '';
      if (r.changed)     hint += `  · ${r.changed} changed`;
      if (r.ahead  > 0)  hint += `  ↑${r.ahead} to push`;
      if (r.behind > 0)  hint += `  ↓${r.behind} to pull`;
      if (!r.has_remote) hint += '  (no remote)';
      return `<option value="${esc(r.path)}" ${r.path === current ? 'selected' : ''}>${esc(r.name)}  [${esc(r.branch)}]${hint}</option>`;
    }).join('');
    // If current selection was lost (repo removed), refresh git panel
    if (current && sel.value !== current) this._gitRefresh();
  },

});
