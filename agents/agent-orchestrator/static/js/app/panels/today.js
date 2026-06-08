// ── TodayPanel — workspace intelligence: todos, changes, projects ─────────────
class TodayPanel extends Panel {
  constructor(gitPanel) {
    super('today');
    this.gitPanel    = gitPanel;
    this._pulseTimer = null;
  }

  onActivate() { this.load(); }

  startPulse() {
    this._loadPulse();
    if (this._pulseTimer) clearInterval(this._pulseTimer);
    this._pulseTimer = setInterval(() => this._loadPulse(), 30000);
    const pulse = $('ws-pulse');
    if (pulse) pulse.style.display = '';
  }

  stopPulse() {
    if (this._pulseTimer) { clearInterval(this._pulseTimer); this._pulseTimer = null; }
    const pulse = $('ws-pulse');
    if (pulse) pulse.style.display = 'none';
  }

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
      if (!sugs.length) {
        bar.style.display = ''; pills.innerHTML = '<span class="ws-pill info">All clear ✓</span>';
        bar.className = 'ws-pulse ws-pulse-clear'; return;
      }
      const hasEmergency = sugs.some(s => s.level === 'emergency');
      const hasWarning   = sugs.some(s => s.level === 'warning');
      bar.className = `ws-pulse ${hasEmergency ? 'ws-pulse-emergency' : hasWarning ? 'ws-pulse-warning' : 'ws-pulse-info'}`;
      bar.style.display = '';
      pills.innerHTML = sugs.slice(0, 6).map(s =>
        `<span class="ws-pill ${esc(s.level)}" title="${esc(s.source)}">${esc(s.message)}</span>`
      ).join('');
    } catch (_) {}
  }

  refresh() { this._loadPulse(); this.load(); }

  async load() {
    const wrap = $('today-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="today-loading">Loading…</div>';
    try {
      const res  = await fetch('/api/agents/workspace/memory/today.json').catch(() => null);
      if (!res || !res.ok) {
        wrap.innerHTML = '<div class="today-loading">today.json not ready yet — scanner runs every 30s.</div>';
        return;
      }
      const data    = await res.json();
      const content = JSON.parse(data.content || '{}');
      wrap.innerHTML = renderToday(content);
      if (content.git_repos?.length) this.gitPanel?.syncRepos(content.git_repos);
    } catch (e) {
      wrap.innerHTML = `<div class="today-loading">Error: ${esc(String(e))}</div>`;
    }
  }

  async completeTodo(id) {
    const row = document.getElementById(`todo-row-${id}`);
    if (row) row.style.opacity = '0.4';
    try {
      const d = await API.workspace.todos.complete(id);
      if (d.ok) { if (row) row.remove(); this.load(); }
      else       { if (row) row.style.opacity = '1'; }
    } catch (_) {
      if (row) row.style.opacity = '1';
    }
  }
}

window.TodayPanel = TodayPanel;
