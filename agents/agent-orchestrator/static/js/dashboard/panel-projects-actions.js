Object.assign(Dashboard.prototype, {

  async _projectStop(name) {
    const card    = document.getElementById(`proj-card-${name}`);
    const stopBtn = card?.querySelector('.ctrl-btn.stop');
    this._btnBusy(stopBtn);
    const logWrap  = $('project-log-wrap');
    const logDiv   = $('project-log');
    const logTitle = $('project-log-title');
    if (logWrap)  logWrap.style.display  = '';
    if (logTitle) logTitle.textContent   = `${name} — stopping…`;
    if (logDiv)   logDiv.innerHTML       = '';
    this._projectCloseLog();
    try {
      const res  = await fetch(`/api/workspace/projects/${name}/stop`, { method: 'POST' });
      const data = await res.json();
      const el   = document.createElement('div');
      el.className = data.ok ? 'proj-log-line' : 'proj-log-line err';
      el.textContent = data.output || data.error || (data.ok ? 'Stopped' : 'Failed');
      if (logDiv) logDiv.appendChild(el);
      if (logTitle) logTitle.textContent = `${name} — stopped`;
    } catch (e) {
      if (logDiv) logDiv.innerHTML = `<div class="proj-log-line err">${esc(String(e))}</div>`;
    }
    setTimeout(() => this._loadProjects(), 1500);
  },

  async _projectHealth(name) {
    const card      = document.getElementById(`proj-card-${name}`);
    const healthBtn = card?.querySelector('.ctrl-btn.health');
    this._btnBusy(healthBtn);
    const logWrap  = $('project-log-wrap');
    const logDiv   = $('project-log');
    const logTitle = $('project-log-title');
    if (logWrap)  logWrap.style.display = '';
    if (logTitle) logTitle.textContent  = `${name} — health check…`;
    if (logDiv)   logDiv.innerHTML      = '';
    this._abortLogStream();
    try {
      const res  = await fetch(`/api/workspace/projects/${name}/health`, { method: 'POST' });
      const data = await res.json();
      const lines = (data.output || data.error || '(no output)').split('\n');
      lines.forEach(line => {
        const el = document.createElement('div');
        el.className = `proj-log-line${data.ok === false ? ' err' : ''}`;
        el.textContent = line;
        logDiv.appendChild(el);
      });
      if (logTitle) logTitle.textContent = `${name} — health ${data.ok ? '✓ ok' : '✗ failed'}`;
    } catch (e) {
      if (logDiv) logDiv.innerHTML = `<div class="proj-log-line err">${esc(String(e))}</div>`;
    }
    this._btnDone(healthBtn);
    if (healthBtn) healthBtn.disabled = false;
  },

  async _projectLogs(name) {
    if (this._projectLogCtrl) { this._projectLogCtrl.abort(); this._projectLogCtrl = null; }
    const logWrap  = $('project-log-wrap');
    const logDiv   = $('project-log');
    const logTitle = $('project-log-title');
    if (logDiv)   logDiv.innerHTML     = '';
    if (logTitle) logTitle.textContent = `${name} — logs`;
    if (logWrap)  logWrap.style.display = '';
    await this._streamProjectLog(name, `/api/workspace/projects/${name}/docker-logs`);
  },

  _abortLogStream() {
    if (this._projectLogCtrl) { this._projectLogCtrl.abort(); this._projectLogCtrl = null; }
  },

  _projectCloseLog() {
    this._abortLogStream();
    const logWrap = $('project-log-wrap');
    if (logWrap) logWrap.style.display = 'none';
    const logDiv = $('project-log');
    if (logDiv) logDiv.innerHTML = '';
  },

});
