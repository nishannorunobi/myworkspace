Object.assign(Dashboard.prototype, {

  // ── Event stream bindings ─────────────────────────────────────────────────

  _bindStream() {
    const s = this.stream;

    s.on('_connected',    () => this._setMonitorBadge(true));
    s.on('_disconnected', () => this._setMonitorBadge(false));

    s.on('init', data => {
      this._agents = data.agents || [];
      this._renderGrid();
      this._updateSidebar();
      this._updateHeaderStats();
    });

    s.on('status_change', data => {
      this._agents = this._agents.map(a =>
        a.id === data.agent_id ? { ...a, status: data.status } : a
      );
      this._renderGrid();
      this._updateSidebar();
      this._updateHeaderStats();
      if (this._selected === data.agent_id) this._updateDetailHeader();
    });

    s.on('alert', data => {
      this.alerts.handle(data);
    });

    s.on('workspace_change', data => {
      this._addChange(data);
    });

    s.on('agent_event', data => {
      this._handleAgentEvent(data);
    });
  },

  // ── Agent telemetry events ────────────────────────────────────────────────

  _handleAgentEvent(data) {
    const event     = data.event || '';
    const source    = data.source || 'agent';
    const container = data.container || '';
    const payload   = data.data || {};

    if (event === 'user_intervention_required') {
      this._showInterventionSplash(payload.message || 'User action required', source, payload);
      return;
    }

    // Map event → toast style
    const styleMap = {
      service_started:      { cls: 'info',    icon: '⚡', label: 'Service started' },
      service_stopped:      { cls: 'warning', icon: '⏹', label: 'Service stopped' },
      install_error:        { cls: 'error',   icon: '✗',  label: 'Install error' },
      auto_resolve_complete:{ cls: 'info',    icon: '✓',  label: 'Auto-fixed' },
      auto_resolve_failed:  { cls: 'warning', icon: '⚠',  label: 'Auto-fix failed' },
      task_complete:        { cls: 'info',    icon: '✓',  label: 'Task complete' },
      status_update:        { cls: 'info',    icon: 'ℹ',  label: 'Status' },
    };
    const style = styleMap[event] || { cls: 'info', icon: 'ℹ', label: event };
    const detail = payload.summary || payload.label || payload.service || payload.error || '';
    const msg = detail ? `${style.label}: ${detail}` : style.label;
    this._showToast(msg, style.cls, source || container);
  },

  _showToast(message, cls, origin) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${cls}`;
    const ts = new Date().toLocaleTimeString();
    el.innerHTML = `
      <span class="toast-origin">${esc(origin)}</span>
      <span class="toast-msg">${esc(message)}</span>
      <span class="toast-time">${ts}</span>
      <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>`;
    container.appendChild(el);
    // auto-dismiss after 6s
    setTimeout(() => { if (el.parentNode) el.remove(); }, 6000);
  },

  async _showInterventionSplash(message, source, details) {
    // read bell_rings from docker-manager config (live, no restart needed)
    let n = 5;
    try {
      const r = await fetch('http://localhost:8889/api/config');
      if (r.ok) n = (await r.json()).bell_rings || 5;
    } catch {}
    this._beepN(n);
    // splash screen
    let splash = document.getElementById('intervention-splash');
    if (!splash) {
      splash = document.createElement('div');
      splash.id = 'intervention-splash';
      document.body.appendChild(splash);
    }
    const ts = new Date().toLocaleTimeString();
    const detailText = details.details
      ? `<pre class="intervention-detail">${esc(JSON.stringify(details.details, null, 2))}</pre>`
      : '';
    splash.innerHTML = `
      <div class="intervention-box">
        <div class="intervention-icon">⚠</div>
        <div class="intervention-source">${esc(source)}</div>
        <div class="intervention-title">User Action Required</div>
        <div class="intervention-msg">${esc(message)}</div>
        ${detailText}
        <div class="intervention-time">${ts}</div>
        <button class="intervention-ack" onclick="document.getElementById('intervention-splash').remove();window._dash.sound.stop()">
          Acknowledge
        </button>
      </div>`;
    splash.classList.add('active');
  },

  _beepN(n = 5) {
    this.sound.stop();
    const ctx = this.sound._ctx();
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 0.4;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  },

});
