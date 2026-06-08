Object.assign(Dashboard.prototype, {

  // ── Agent actions ─────────────────────────────────────────────────────────

  async startAgent() {
    if (!this._selected) return;
    const btn = $('btn-start');
    this._btnBusy(btn);
    let started = false;
    try {
      const res = await fetch(`/api/agents/${this._selected}/start`, { method: 'POST' });
      const d   = await res.json();
      if (d.ok === false) {
        const msg = [d.detail, d.output].filter(Boolean).join('\n\n');
        this._showStartError(msg || d.error || 'Start failed');
        this._btnDone(btn);
        btn.disabled = false;
        return;
      }
      started = true;
    } catch (_) {
      this._btnDone(btn);
      btn.disabled = false;
      return;
    }
    if (started && this._selected === 'workspace') {
      this.switchTab('logs');
      this._connectLogs(this._selected);
    }
    setTimeout(() => {
      this._btnDone(btn);
      this._fetchAgents().then(() => { this._renderGrid(); this._updateSidebar(); this._updateDetailHeader(); });
      if (this._selected) this._connectChat(this._selected);
    }, 4000);
  },

  _showStartError(msg) {
    const existing = $('start-error-banner');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id        = 'start-error-banner';
    div.className = 'start-error-banner';
    div.textContent = msg;
    $('detail-hdr').insertAdjacentElement('afterend', div);
    setTimeout(() => div.remove(), 10000);
  },

  async stopAgent() {
    if (!this._selected) return;
    const btn = $('btn-stop');
    this._btnBusy(btn);
    await fetch(`/api/agents/${this._selected}/stop`, { method: 'POST' }).catch(() => {});
    setTimeout(() => {
      this._btnDone(btn);
      this._fetchAgents().then(() => { this._renderGrid(); this._updateSidebar(); this._updateDetailHeader(); });
    }, 3000);
  },

  async stopAllAgents() {
    if (!confirm('Stop all running agents?')) return;
    const btn = document.getElementById('btn-stop-all');
    this._btnBusy(btn);
    await fetch('/api/agents/stop-all', { method: 'POST' }).catch(() => {});
    setTimeout(() => {
      this._btnDone(btn);
      btn.disabled = false;
      this._fetchAgents().then(() => { this._renderGrid(); this._updateSidebar(); });
    }, 3000);
  },

  // ── Button busy/done helpers ───────────────────────────────────────────────

  _btnBusy(btn) {
    if (!btn) return;
    btn._savedHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    this.sound.processing(0.12, 30);
  },

  _btnDone(btn) {
    if (!btn || btn._savedHTML == null) return;
    btn.innerHTML = btn._savedHTML;
    btn._savedHTML = null;
    this.sound.stopProcessing();
  },

});
