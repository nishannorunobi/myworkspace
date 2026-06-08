/**
 * Dashboard — main orchestrator.
 * Wires up EventStream, AlertSystem, agent grid, detail panel, chat, logs, memory.
 *
 * Views:
 *   grid   — monitoring cards for all agents (default)
 *   detail — selected agent: Chat | Logs | Memory
 */

/* ── Utility ── */
window.esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const $  = id => document.getElementById(id);
const scrollBot = el => { el.scrollTop = el.scrollHeight; };

class Dashboard {
  constructor() {
    this.sound  = new SoundSystem();
    this.alerts = new AlertSystem(this.sound);
    this.stream = new EventStream();

    this._agents       = [];       // latest snapshot from API
    this._selected     = null;     // selected agent id
    this._parentAgent  = null;     // parent agent id when viewing a sub-agent
    this._view         = 'grid';   // 'grid' | 'detail'
    this._currentTab   = 'chat';
    this._ws           = null;
    this._logEs        = null;
    this._changeCount  = 0;
    this._changeOpen   = true;
    this._currentMsgEl = null;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  async init() {
    window._dash = this;
    this._loadTheme();
    await this.alerts.loadSettings();
    this._bindStream();
    this.stream.connect();
    await this._fetchAgents();
    this._renderGrid();
    this._bindUI();
  }

  // ── Theme ─────────────────────────────────────────────────────────────────

  _loadTheme() {
    const saved = localStorage.getItem('dash-theme') || 'dark';
    this._applyTheme(saved);
  }

  setTheme(theme) {
    localStorage.setItem('dash-theme', theme);
    this._applyTheme(theme);
  }

  _applyTheme(theme) {
    document.body.dataset.theme = theme;
    document.getElementById('theme-dark')?.classList.toggle('active', theme === 'dark');
    document.getElementById('theme-light')?.classList.toggle('active', theme === 'light');
  }

  // ── Agent fetch ───────────────────────────────────────────────────────────

  async _fetchAgents() {
    try {
      const res = await fetch('/api/agents');
      const d   = await res.json();
      this._agents = d.agents || [];
    } catch {}
  }

  // ── Header stats ──────────────────────────────────────────────────────────

  _updateHeaderStats() {
    const visible = this._agents.filter(a => !a.hidden);
    const running = visible.filter(a => a.status === 'running').length;
    $('stat-running').textContent = `${running}/${visible.length} running`;
  }

  // ── Monitor badge ─────────────────────────────────────────────────────────

  _setMonitorBadge(on) {
    const el = $('monitor-badge');
    el.textContent = on ? '● MONITOR ON' : '● MONITOR OFF';
    el.className   = 'monitor-badge' + (on ? '' : ' off');
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  const dash = new Dashboard();
  dash.init();
});
