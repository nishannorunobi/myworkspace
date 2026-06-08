// ── LogPanel — SSE log stream ─────────────────────────────────────────────────
class LogPanel extends Panel {
  constructor() {
    super('logs');
    this._es = null;
  }

  connect(agentId) {
    this.disconnect();
    $('log-stream').innerHTML = '';
    this._es = new EventSource(`/api/agents/${agentId}/logs/stream`);
    this._es.onmessage = e => {
      const d = JSON.parse(e.data);
      if (!d.line) return;
      const div = document.createElement('div');
      div.className  = 'log-line';
      div.textContent = d.line;
      $('log-stream').appendChild(div);
      scrollBot($('log-stream'));
    };
  }

  disconnect() {
    if (this._es) { this._es.close(); this._es = null; }
  }
}

window.LogPanel = LogPanel;
