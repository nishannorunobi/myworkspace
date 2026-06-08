Object.assign(Dashboard.prototype, {

  // ── Claude Code memory feed ───────────────────────────────────────────────

  _ccInit() {
    if (this._ccEs) return;              // already connected
    const feed  = $('cc-feed');
    const label = $('cc-live-label');
    const dot   = $('cc-live-dot');
    if (!feed) return;

    this._ccSeen  = new Set();           // track IDs to avoid duplicates
    this._ccTotal = 0;

    this._ccEs = new EventSource('/api/claude-code/stream');

    this._ccEs.onopen = () => {
      if (dot)   { dot.className = 'cc-live-dot live'; }
      if (label) label.textContent = 'Live — reading memory…';
    };

    this._ccEs.onmessage = (e) => {
      if (!e.data || e.data.startsWith(':')) return;
      try {
        const ex = JSON.parse(e.data);
        if (!ex.id || this._ccSeen.has(+ex.id)) return;
        this._ccSeen.add(+ex.id);
        this._ccTotal++;
        this._ccAppend(ex);
        if ($('cc-count')) $('cc-count').textContent = `${this._ccTotal} exchanges in memory`;
        if (dot)   dot.className = 'cc-live-dot live';
        if (label) label.textContent = `Live · last update ${new Date().toLocaleTimeString()}`;
      } catch (_) {}
    };

    this._ccEs.onerror = () => {
      if (dot)   dot.className = 'cc-live-dot';
      if (label) label.textContent = 'Reconnecting…';
    };
  },

  _ccAppend(ex) {
    const feed = $('cc-feed');
    if (!feed) return;

    const prompt = (ex.prompt || '').trim();
    if (!prompt || prompt.startsWith('<')) return;  // skip system noise

    const div  = document.createElement('div');
    div.className = 'cc-exchange';
    div.dataset.id = ex.id;

    const ts   = (ex.timestamp || '').slice(0, 16).replace('T', ' ');
    const resp = (ex.response || '').trim();

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
  },

  async _ccScrollBottom() {
    // Pull any new exchanges immediately, then scroll
    const feed = $('cc-feed');
    if (!feed) return;
    const lastId = this._ccSeen.size ? Math.max(...this._ccSeen) : 0;
    try {
      const res = await fetch(`/api/claude-code/history?limit=50&after_id=${lastId}`).catch(() => null);
      if (res && res.ok) {
        const d = await res.json();
        for (const ex of (d.exchanges || [])) {
          if (!this._ccSeen.has(+ex.id)) {
            this._ccSeen.add(+ex.id);
            this._ccTotal++;
            this._ccAppend(ex);
          }
        }
        if ($('cc-count')) $('cc-count').textContent = `${this._ccTotal} exchanges in memory`;
      }
    } catch (_) {}
    feed.scrollTop = feed.scrollHeight;
  },

  _ccClear() {
    // Only clears the visual view — DB memory is untouched
    const feed = $('cc-feed');
    if (feed) {
      feed.innerHTML = '<div style="color:var(--text3);font-size:11px;padding:20px;text-align:center">View cleared — DB memory preserved. New entries will appear as they arrive.</div>';
      this._ccSeen  = new Set();
      this._ccTotal = 0;
    }
    // Reconnect SSE to reload history
    if (this._ccEs) { this._ccEs.close(); this._ccEs = null; }
    setTimeout(() => this._ccInit(), 500);
  },

});
