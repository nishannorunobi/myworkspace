Object.assign(Dashboard.prototype, {

  // ── Logs ──────────────────────────────────────────────────────────────────

  _connectLogs(agentId) {
    this._disconnectLogs();
    $('log-stream').innerHTML = '';
    this._logEs = new EventSource(`/api/agents/${agentId}/logs/stream`);
    this._logEs.onmessage = e => {
      const d = JSON.parse(e.data);
      if (!d.line) return;
      const div = document.createElement('div');
      div.className = 'log-line';
      div.textContent = d.line;
      $('log-stream').appendChild(div);
      scrollBot($('log-stream'));
    };
  },

  _disconnectLogs() {
    if (this._logEs) { this._logEs.close(); this._logEs = null; }
  },

  _disconnectCc() {
    if (this._ccEs) { this._ccEs.close(); this._ccEs = null; }
  },

});
