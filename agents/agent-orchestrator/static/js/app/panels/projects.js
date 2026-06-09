// ── ProjectsPanel — workspace project launchers with streaming log ─────────────
class ProjectsPanel extends Panel {
  constructor(spinner) {
    super('projects');
    this.spinner   = spinner;
    this._logStream = new ProjectLogStream();
  }

  onActivate() { this.load(); }

  async load() {
    const list = $('projects-list');
    if (!list) return;
    list.innerHTML = '<div class="projects-loading">Loading…</div>';
    try {
      const res      = await fetch('/api/workspace/projects');
      const data     = await res.json();
      const projects = data.projects || [];
      if (!projects.length) {
        list.innerHTML = '<div class="projects-loading">No projects found in projectspace/.</div>'; return;
      }
      list.innerHTML = projects.map(p => {
        const startDis  = p.running || !p.start_script   ? 'disabled' : '';
        const stopDis   = !p.running || !p.stop_script   ? 'disabled' : '';
        const healthDis = !p.health_script               ? 'disabled' : '';
        const logsDis   = !p.logs_script && !p.has_compose ? 'disabled' : '';
        return `
        <div class="proj-card" id="proj-card-${esc(p.name)}">
          <div class="proj-card-header">
            <div class="proj-card-info">
              <span class="proj-status-dot ${p.running ? 'running' : 'stopped'}"></span>
              <span class="proj-name">${esc(p.name)}</span>
            </div>
            <span class="proj-script-path">${p.running ? 'running' : 'stopped'}</span>
          </div>
          <div class="proj-card-actions">
            <button class="ctrl-btn start" ${startDis} onclick="window._dash.panels.projects.start('${esc(p.name)}')">▶ Start</button>
            <button class="ctrl-btn stop"  ${stopDis}  onclick="window._dash.panels.projects.stop('${esc(p.name)}')">■ Stop</button>
            <button class="ctrl-btn health" ${healthDis} onclick="window._dash.panels.projects.health('${esc(p.name)}')">⚡ Health</button>
            <button class="ctrl-btn logs"  ${logsDis}  onclick="window._dash.panels.projects.showLogs('${esc(p.name)}')">📋 Logs</button>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      list.innerHTML = `<div class="projects-loading" style="color:var(--danger)">Failed: ${esc(String(e))}</div>`;
    }
  }

  _logUI(title, clearLog = true) {
    const logWrap  = $('project-log-wrap');
    const logDiv   = $('project-log');
    const logTitle = $('project-log-title');
    if (logWrap)  logWrap.style.display = '';
    if (logTitle) logTitle.textContent  = title;
    if (clearLog && logDiv) logDiv.innerHTML = '';
    return logDiv;
  }

  async start(name) {
    this._logStream.abort();
    const card     = $(`proj-card-${name}`);
    const startBtn = card?.querySelector('.ctrl-btn.start');
    this.spinner.busy(startBtn);
    this._logUI(`${name} — starting…`);
    try {
      const data = await fetch(`/api/workspace/projects/${name}/start`, { method:'POST' }).then(r => r.json());
      if (!data.ok) {
        const logDiv = $('project-log');
        if (logDiv) logDiv.innerHTML = `<div class="proj-log-line err">${esc(data.error || 'Failed to start')}</div>`;
        this.spinner.done(startBtn);
        if (startBtn) startBtn.disabled = false;
        return;
      }
      const logTitle = $('project-log-title');
      if (logTitle) logTitle.textContent = `${name} — log`;
    } catch (e) {
      const logDiv = $('project-log');
      if (logDiv) logDiv.innerHTML = `<div class="proj-log-line err">${esc(String(e))}</div>`;
      if (startBtn) startBtn.disabled = false; return;
    }
    await this._logStream.stream(name, `/api/workspace/projects/${name}/log`);
    this.spinner.done(startBtn);
    this.load();
  }

  async stop(name) {
    const card    = $(`proj-card-${name}`);
    const stopBtn = card?.querySelector('.ctrl-btn.stop');
    this.spinner.busy(stopBtn);
    this._logUI(`${name} — stopping…`);
    this._logStream.abort();
    try {
      const data = await fetch(`/api/workspace/projects/${name}/stop`, { method:'POST' }).then(r => r.json());
      const el   = document.createElement('div');
      el.className  = data.ok ? 'proj-log-line' : 'proj-log-line err';
      el.textContent = data.output || data.error || (data.ok ? 'Stopped' : 'Failed');
      const logDiv = $('project-log'); if (logDiv) logDiv.appendChild(el);
      const logTitle = $('project-log-title'); if (logTitle) logTitle.textContent = `${name} — stopped`;
    } catch (e) {
      const logDiv = $('project-log');
      if (logDiv) logDiv.innerHTML = `<div class="proj-log-line err">${esc(String(e))}</div>`;
    }

    // Poll until actually stopped or 2-minute timeout
    const deadline = Date.now() + 2 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await fetch('/api/workspace/projects').then(r => r.json());
        const proj = (res.projects || []).find(p => p.name === name);
        if (!proj || !proj.running) break;
      } catch {}
    }

    this.spinner.done(stopBtn);
    this.load();
  }

  async health(name) {
    const card      = $(`proj-card-${name}`);
    const healthBtn = card?.querySelector('.ctrl-btn.health');
    this.spinner.busy(healthBtn);
    const logDiv = this._logUI(`${name} — health check…`);
    this._logStream.abort();
    try {
      const data  = await fetch(`/api/workspace/projects/${name}/health`, { method:'POST' }).then(r => r.json());
      const lines = (data.output || data.error || '(no output)').split('\n');
      lines.forEach(line => {
        const el = document.createElement('div');
        el.className   = `proj-log-line${data.ok === false ? ' err' : ''}`;
        el.textContent = line;
        if (logDiv) logDiv.appendChild(el);
      });
      const logTitle = $('project-log-title'); if (logTitle) logTitle.textContent = `${name} — health ${data.ok ? '✓ ok' : '✗ failed'}`;
    } catch (e) {
      if (logDiv) logDiv.innerHTML = `<div class="proj-log-line err">${esc(String(e))}</div>`;
    }
    this.spinner.done(healthBtn);
    if (healthBtn) healthBtn.disabled = false;
  }

  async showLogs(name) {
    this._logStream.abort();
    this._logUI(`${name} — logs`);
    await this._logStream.stream(name, `/api/workspace/projects/${name}/docker-logs`);
  }

  closeLog() {
    this._logStream.abort();
    const logWrap = $('project-log-wrap');
    if (logWrap) logWrap.style.display = 'none';
    const logDiv  = $('project-log');
    if (logDiv)   logDiv.innerHTML = '';
  }
}

window.ProjectsPanel = ProjectsPanel;
