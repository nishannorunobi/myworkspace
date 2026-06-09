// ── LogPanel — SSE log stream ─────────────────────────────────────────────────
class LogPanel extends Panel {
  constructor() {
    super('logs');
    this._es       = null;
    this._agentId  = null;
  }

  connect(agentId) {
    this.disconnect();
    this._agentId = agentId;
    const stream  = $('log-stream');
    if (stream) {
      stream.innerHTML = '';
      const hint = document.createElement('div');
      hint.id = 'log-connecting-hint';
      hint.className = 'log-line dim';
      hint.textContent = '— connecting to log stream… —';
      stream.appendChild(hint);
    }

    this._es = new EventSource(`/api/agents/${agentId}/logs/stream`);

    this._es.onmessage = e => {
      const d = JSON.parse(e.data);
      if (!d.line) return;
      $('log-connecting-hint')?.remove();
      const div = document.createElement('div');
      const isErr = /error|traceback|exception|failed|critical/i.test(d.line);
      div.className   = isErr ? 'log-line err' : 'log-line';
      div.textContent = d.line;
      if (stream) { stream.appendChild(div); scrollBot(stream); }
    };

    this._es.onerror = () => {
      if (stream && this._es?.readyState === EventSource.CLOSED) {
        const div = document.createElement('div');
        div.className   = 'log-line dim';
        div.textContent = '— log stream disconnected —';
        stream.appendChild(div);
      }
    };
  }

  disconnect() {
    if (this._es) { this._es.close(); this._es = null; }
  }
}

window.LogPanel = LogPanel;
