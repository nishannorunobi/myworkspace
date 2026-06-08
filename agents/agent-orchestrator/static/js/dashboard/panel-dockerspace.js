Object.assign(Dashboard.prototype, {

  // ── Dockerspace tab (workspace agent only) ───────────────────────────────

  async _loadDockerscripts() {
    const panel = $('ds-scripts');
    if (!panel) return;
    panel.innerHTML = '<div class="ds-loading">Loading…</div>';
    try {
      const res  = await fetch('/api/dockerspace/scripts');
      const data = await res.json();
      const projects = data.projects || [];
      if (!projects.length) {
        panel.innerHTML = '<div class="ds-loading">No shell scripts found in projectspace/.</div>';
        return;
      }
      panel.innerHTML = projects.map(p => `
        <div class="ds-project">
          <div class="ds-project-name" onclick="this.parentElement.classList.toggle('collapsed')">▾ ${esc(p.name)}</div>
          <div class="ds-script-list">
            ${p.scripts.map(s => `
              <div class="ds-script-row">
                <span class="ds-script-label" title="${esc(s.abs_path)}">${esc(s.label)}</span>
                <button class="ds-run-btn"
                  onclick="window._dash._dsRun('${esc(s.abs_path)}','${esc(p.name + '/' + s.label)}')">▶ Run</button>
              </div>`).join('')}
          </div>
        </div>`).join('');
    } catch (e) {
      panel.innerHTML = `<div class="ds-loading" style="color:var(--red)">Failed: ${esc(String(e))}</div>`;
    }
  },

  async _dsRun(absPath, label) {
    if (this._dsLogCtrl) { this._dsLogCtrl.abort(); this._dsLogCtrl = null; }
    const logOutput = $('ds-log-output');
    const logTitle  = $('ds-log-title');
    const killBtn   = $('ds-kill-btn');
    if (logOutput) logOutput.innerHTML = '';
    if (logTitle)  logTitle.textContent = `Running: ${label}`;
    if (killBtn)   killBtn.style.display = '';
    this._dsLogCtrl = new AbortController();
    try {
      const res = await fetch('/api/dockerspace/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: absPath }),
        signal: this._dsLogCtrl.signal,
      });
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let partial = '';
      const append = text => {
        const el = document.createElement('div');
        el.className = 'ds-log-line';
        el.textContent = text;
        logOutput.appendChild(el);
        logOutput.scrollTop = logOutput.scrollHeight;
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const chunks = partial.split('\n\n');
        partial = chunks.pop();
        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue;
          const line = chunk.slice(6);
          if (line === '__done__') { reader.cancel(); if (logTitle) logTitle.textContent = `Done: ${label}`; if (killBtn) killBtn.style.display = 'none'; return; }
          append(line);
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError' && logOutput) {
        const el = document.createElement('div');
        el.className = 'ds-log-line ds-log-err';
        el.textContent = String(e);
        logOutput.appendChild(el);
      }
    }
    if (killBtn) killBtn.style.display = 'none';
  },

  async _dsKill() {
    await fetch('/api/dockerspace/kill', { method: 'POST' });
    if (this._dsLogCtrl) { this._dsLogCtrl.abort(); this._dsLogCtrl = null; }
    const killBtn  = $('ds-kill-btn');
    const logTitle = $('ds-log-title');
    if (killBtn)  killBtn.style.display = 'none';
    if (logTitle) logTitle.textContent += ' [killed]';
  },

  _dsCloseLog() {
    if (this._dsLogCtrl) { this._dsLogCtrl.abort(); this._dsLogCtrl = null; }
    const logOutput = $('ds-log-output');
    const logTitle  = $('ds-log-title');
    const killBtn   = $('ds-kill-btn');
    if (logOutput) logOutput.innerHTML = '<div class="ds-log-placeholder">Click ▶ Run on any script to execute it here.</div>';
    if (logTitle)  logTitle.textContent = 'Select a script to run';
    if (killBtn)   killBtn.style.display = 'none';
  },

});
