// ── ClaudeCodePanel — live memory feed of Claude Code exchanges ───────────────
class ClaudeCodePanel extends Panel {
  constructor() {
    super('claudecode');
    this._es    = null;
    this._seen  = new Set();
    this._total = 0;
  }

  onActivate() {
    this._connect();
    setTimeout(() => this._scrollBottom(), 300);
  }

  disconnect() {
    if (this._es) { this._es.close(); this._es = null; }
  }

  // ── SSE connection ────────────────────────────────────────────────────────

  _connect() {
    if (this._es) return;
    const feed  = $('cc-feed');
    const label = $('cc-live-label');
    const dot   = $('cc-live-dot');
    if (!feed) return;

    this._seen  = new Set();
    this._total = 0;
    this._es    = new EventSource('/api/claude-code/stream');

    this._es.onopen = () => {
      if (dot)   dot.className = 'cc-live-dot live';
      if (label) label.textContent = 'Live — reading memory…';
    };

    this._es.onmessage = e => {
      if (!e.data || e.data.startsWith(':')) return;
      try {
        const ex = JSON.parse(e.data);
        if (!ex.id || this._seen.has(+ex.id)) return;
        this._seen.add(+ex.id);
        this._total++;
        this._append(ex);
        if ($('cc-count')) $('cc-count').textContent = `${this._total} exchanges in memory`;
        if (dot)   dot.className = 'cc-live-dot live';
        if (label) label.textContent = `Live · last update ${new Date().toLocaleTimeString()}`;
      } catch (_) {}
    };

    this._es.onerror = () => {
      if (dot)   dot.className = 'cc-live-dot';
      if (label) label.textContent = 'Reconnecting…';
    };
  }

  // ── Append exchange ───────────────────────────────────────────────────────

  _append(ex) {
    const feed = $('cc-feed');
    if (!feed) return;
    const prompt = (ex.prompt || '').trim();
    if (!prompt || prompt.startsWith('<')) return;

    const div  = document.createElement('div');
    div.className  = 'cc-exchange';
    div.dataset.id = ex.id;
    const ts   = (ex.timestamp || '').slice(0, 16).replace('T', ' ');
    const resp = (ex.response  || '').trim();

    div.innerHTML = `
      <div class="cc-ts">${esc(ts)}</div>
      <div class="cc-user-wrap">
        <div class="cc-bubble">
          <div class="cc-bubble-label">You</div>
          <div class="cc-bubble-text">${esc(prompt.slice(0, 600))}${prompt.length > 600 ? '\n…' : ''}</div>
        </div>
      </div>
      ${resp ? `
      <div class="cc-assistant-wrap">
        <div class="cc-bubble">
          <div class="cc-bubble-label">Claude</div>
          <div class="cc-bubble-text">${esc(resp.slice(0, 1200))}${resp.length > 1200 ? '\n…' : ''}</div>
        </div>
      </div>
      <div class="cc-memory-tag">✓ in memory</div>` :
      `<div class="cc-no-response">response pending next scan…</div>`}`;

    feed.appendChild(div);
  }

  // ── Scroll to latest + fetch missing ─────────────────────────────────────

  async _scrollBottom() {
    const feed = $('cc-feed');
    if (!feed) return;
    const lastId = this._seen.size ? Math.max(...this._seen) : 0;
    try {
      const res = await fetch(`/api/claude-code/history?limit=50&after_id=${lastId}`).catch(() => null);
      if (res && res.ok) {
        const d = await res.json();
        for (const ex of (d.exchanges || [])) {
          if (!this._seen.has(+ex.id)) {
            this._seen.add(+ex.id);
            this._total++;
            this._append(ex);
          }
        }
        if ($('cc-count')) $('cc-count').textContent = `${this._total} exchanges in memory`;
      }
    } catch (_) {}
    feed.scrollTop = feed.scrollHeight;
  }

  scrollBottom() { return this._scrollBottom(); }

  // ── Clear view (keeps DB) ─────────────────────────────────────────────────

  clearView() {
    const feed = $('cc-feed');
    if (feed) {
      feed.innerHTML = '<div style="color:var(--text3);font-size:11px;padding:20px;text-align:center">View cleared — DB memory preserved. New entries will appear as they arrive.</div>';
      this._seen  = new Set();
      this._total = 0;
    }
    this.disconnect();
    setTimeout(() => this._connect(), 500);
  }
}

window.ClaudeCodePanel = ClaudeCodePanel;
