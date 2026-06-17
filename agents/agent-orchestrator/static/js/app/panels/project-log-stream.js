// ── ProjectLogStream — SSE log streaming for project start/stop/logs ─────────

class ProjectLogStream {
  constructor() {
    this._ctrl = null;
  }

  abort() {
    if (this._ctrl) { this._ctrl.abort(); this._ctrl = null; }
  }

  async stream(name, url) {
    this.abort();
    const logDiv = $('project-log');
    if (!logDiv) return;
    this._ctrl    = new AbortController();
    const append  = text => {
      if (!text) return;
      const el = document.createElement('div');
      el.className   = 'proj-log-line';
      el.textContent = text;
      logDiv.appendChild(el);
      logDiv.scrollTop = logDiv.scrollHeight;
    };
    try {
      const res     = await fetch(url, { signal: this._ctrl.signal });
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let partial   = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const chunks = partial.split('\n\n');
        partial      = chunks.pop();
        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue;
          const line = chunk.slice(6);
          if (line === '__done__') { reader.cancel(); return; }
          if (line.startsWith('__LOGPATH__')) {
            const t = $('project-log-title');
            if (t) t.textContent = line.slice('__LOGPATH__'.length);
            continue;
          }
          append(line);
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError' && logDiv) {
        const el = document.createElement('div');
        el.className = 'proj-log-line err'; el.textContent = String(e);
        logDiv.appendChild(el);
      }
    }
  }
}

window.ProjectLogStream = ProjectLogStream;
