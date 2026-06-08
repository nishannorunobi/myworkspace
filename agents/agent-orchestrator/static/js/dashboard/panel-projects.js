Object.assign(Dashboard.prototype, {

  // ── Projects tab (workspace agent only) ──────────────────────────────────

  async _loadProjects() {
    const list = $('projects-list');
    if (!list) return;
    list.innerHTML = '<div class="projects-loading">Loading…</div>';
    try {
      const res  = await fetch('/api/workspace/projects');
      const data = await res.json();
      const projects = data.projects || [];
      if (!projects.length) {
        list.innerHTML = '<div class="projects-loading">No projects found in projectspace/.</div>';
        return;
      }
      list.innerHTML = projects.map(p => {
        const runCls     = p.running ? 'running' : 'stopped';
        const startDis   = p.running || !p.start_script   ? 'disabled' : '';
        const stopDis    = !p.running || !p.stop_script   ? 'disabled' : '';
        const healthDis  = !p.health_script               ? 'disabled' : '';
        const logsDis    = !p.logs_script && !p.has_compose ? 'disabled' : '';
        return `
        <div class="proj-card" id="proj-card-${esc(p.name)}">
          <div class="proj-card-header">
            <div class="proj-card-info">
              <span class="proj-status-dot ${runCls}"></span>
              <span class="proj-name">${esc(p.name)}</span>
            </div>
            <span class="proj-script-path">${p.running ? 'running' : 'stopped'}</span>
          </div>
          <div class="proj-card-actions">
            <button class="ctrl-btn start" ${startDis}
              onclick="window._dash._projectStart('${esc(p.name)}')">▶ Start</button>
            <button class="ctrl-btn stop" ${stopDis}
              onclick="window._dash._projectStop('${esc(p.name)}')">■ Stop</button>
            <button class="ctrl-btn health" ${healthDis}
              onclick="window._dash._projectHealth('${esc(p.name)}')">⚡ Health</button>
            <button class="ctrl-btn logs" ${logsDis}
              onclick="window._dash._projectLogs('${esc(p.name)}')">📋 Logs</button>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      list.innerHTML = `<div class="projects-loading" style="color:var(--danger)">Failed: ${esc(String(e))}</div>`;
    }
  },

  async _projectStart(name) {
    // Abort any existing log stream (without hiding the panel)
    if (this._projectLogCtrl) { this._projectLogCtrl.abort(); this._projectLogCtrl = null; }

    const card = document.getElementById(`proj-card-${name}`);
    const startBtn = card?.querySelector('.ctrl-btn.start');
    this._btnBusy(startBtn);

    // Show log panel
    const logWrap  = $('project-log-wrap');
    const logDiv   = $('project-log');
    const logTitle = $('project-log-title');
    if (logDiv)   logDiv.innerHTML     = '';
    if (logTitle) logTitle.textContent = `${name} — starting…`;
    if (logWrap)  logWrap.style.display = '';

    try {
      const res  = await fetch(`/api/workspace/projects/${name}/start`, { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        if (logDiv) logDiv.innerHTML = `<div class="proj-log-line err">${esc(data.error || 'Failed to start')}</div>`;
        this._btnDone(startBtn);
        if (startBtn) startBtn.disabled = false;
        return;
      }
      if (logTitle) logTitle.textContent = `${name} — log`;
    } catch (e) {
      if (logDiv) logDiv.innerHTML = `<div class="proj-log-line err">${esc(String(e))}</div>`;
      if (startBtn) startBtn.disabled = false;
      return;
    }

    // Stream log output — refresh list when script exits (gets real container state)
    await this._streamProjectLog(name);
    this._loadProjects();
  },

  async _streamProjectLog(name, url) {
    const logDiv = $('project-log');
    if (!logDiv) return;
    this._projectLogCtrl = new AbortController();
    const endpoint = url || `/api/workspace/projects/${name}/log`;
    try {
      const res = await fetch(endpoint, { signal: this._projectLogCtrl.signal });
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let partial = '';
      const append = text => {
        if (!text) return;
        const el = document.createElement('div');
        el.className = 'proj-log-line';
        el.textContent = text;
        logDiv.appendChild(el);
        logDiv.scrollTop = logDiv.scrollHeight;
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
          if (line === '__done__') { reader.cancel(); return; }
          append(line);
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError' && logDiv) {
        const el = document.createElement('div');
        el.className = 'proj-log-line err';
        el.textContent = String(e);
        logDiv.appendChild(el);
      }
    }
  },

});
