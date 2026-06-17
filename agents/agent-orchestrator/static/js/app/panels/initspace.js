// ── InitspacePanel — run init/ environment-setup scripts with streaming output ─
// Mirrors DockerscriptPanel but targets the workspace init/ directory via
// /api/initspace/*. Reuses the ds-* CSS classes; uses is-* element ids.
class InitspacePanel extends Panel {
  constructor() {
    super('initspace');
    this._logCtrl = null;
  }

  onActivate() { this.load(); }

  // ── Script list ───────────────────────────────────────────────────────────

  async load() {
    const panel = $('is-scripts');
    if (!panel) return;
    panel.innerHTML = '<div class="ds-loading">Loading…</div>';
    try {
      const res      = await fetch('/api/initspace/scripts');
      const data     = await res.json();
      const projects = data.projects || [];
      if (!projects.length) {
        panel.innerHTML = '<div class="ds-loading">No shell scripts found in init/.</div>';
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
                  onclick="window._dash.panels.initspace.run('${esc(s.abs_path)}','${esc(s.label)}')">▶ Run</button>
              </div>`).join('')}
          </div>
        </div>`).join('');
    } catch (e) {
      panel.innerHTML = `<div class="ds-loading" style="color:var(--red)">Failed: ${esc(String(e))}</div>`;
    }
  }

  // ── Sudo password prompt ──────────────────────────────────────────────────

  _askSudoPass(label) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'sudo-overlay';
      overlay.innerHTML = `
        <div class="sudo-modal">
          <div class="sudo-title">▶ ${esc(label)}</div>
          <div class="sudo-hint">Sudo password — leave empty if not needed</div>
          <input class="sudo-input" id="sudo-pass-input" type="password" placeholder="password" autocomplete="current-password">
          <div class="sudo-actions">
            <button class="btn sudo-cancel">Cancel</button>
            <button class="btn btn-start sudo-run">Run</button>
          </div>
        </div>`;

      const input  = overlay.querySelector('#sudo-pass-input');
      const finish = pass => { overlay.remove(); resolve(pass); };

      overlay.querySelector('.sudo-cancel').onclick = () => finish(null);
      overlay.querySelector('.sudo-run').onclick    = () => finish(input.value);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  finish(input.value);
        if (e.key === 'Escape') finish(null);
      });

      document.body.appendChild(overlay);
      input.focus();
    });
  }

  // ── Confirmation prompt (for destructive scripts) ─────────────────────────

  _DANGER_PATTERN = /clean|remove|purge|wipe|destroy|backup|restart_the_world|stop_the_world/i;

  _askConfirm(label) {
    if (!this._DANGER_PATTERN.test(label)) return Promise.resolve(true);
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'sudo-overlay';
      overlay.innerHTML = `
        <div class="sudo-modal">
          <div class="sudo-title">⚠ ${esc(label)}</div>
          <div class="sudo-hint">This script may be destructive. Continue?</div>
          <div class="sudo-actions">
            <button class="btn sudo-cancel">Cancel</button>
            <button class="btn btn-stop sudo-run">Yes, run it</button>
          </div>
        </div>`;

      const finish = ok => { overlay.remove(); resolve(ok); };
      overlay.querySelector('.sudo-cancel').onclick = () => finish(false);
      overlay.querySelector('.sudo-run').onclick    = () => finish(true);
      overlay.addEventListener('keydown', e => {
        if (e.key === 'Escape') finish(false);
        if (e.key === 'Enter')  finish(true);
      });

      document.body.appendChild(overlay);
      overlay.querySelector('.sudo-run').focus();
    });
  }

  // ── Run script ────────────────────────────────────────────────────────────

  async run(absPath, label) {
    const confirmed = await this._askConfirm(label);
    if (!confirmed) return;

    const pass = await this._askSudoPass(label);
    if (pass === null) return;  // cancelled

    if (this._logCtrl) { this._logCtrl.abort(); this._logCtrl = null; }
    const logOutput = $('is-log-output');
    const logTitle  = $('is-log-title');
    const killBtn   = $('is-kill-btn');
    if (logOutput) logOutput.innerHTML = '';
    if (logTitle)  logTitle.textContent  = `Running: ${label}`;
    if (killBtn)   killBtn.style.display = '';

    this._logCtrl = new AbortController();
    let logPath   = '';
    const append  = text => {
      const el = document.createElement('div');
      el.className   = 'ds-log-line';
      el.textContent = text;
      logOutput.appendChild(el);
      logOutput.scrollTop = logOutput.scrollHeight;
    };

    try {
      const res = await fetch('/api/initspace/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ script: absPath, sudo_pass: pass, confirmed }),
        signal:  this._logCtrl.signal,
      });
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
          if (line === '__done__') {
            reader.cancel();
            if (logTitle) logTitle.textContent  = logPath ? `✓ ${logPath}` : `Done: ${label}`;
            if (killBtn)  killBtn.style.display = 'none';
            return;
          }
          if (line.startsWith('__LOGPATH__')) {
            logPath = line.slice('__LOGPATH__'.length);
            if (logTitle) logTitle.textContent = logPath;
            continue;
          }
          append(line);
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError' && logOutput) {
        const el = document.createElement('div');
        el.className   = 'ds-log-line ds-log-err';
        el.textContent = String(e);
        logOutput.appendChild(el);
      }
    }
    if (killBtn) killBtn.style.display = 'none';
  }

  // ── Kill / close ──────────────────────────────────────────────────────────

  async kill() {
    await fetch('/api/initspace/kill', { method: 'POST' });
    if (this._logCtrl) { this._logCtrl.abort(); this._logCtrl = null; }
    const killBtn  = $('is-kill-btn');
    const logTitle = $('is-log-title');
    if (killBtn)  killBtn.style.display = 'none';
    if (logTitle) logTitle.textContent += ' [killed]';
  }

  closeLog() {
    if (this._logCtrl) { this._logCtrl.abort(); this._logCtrl = null; }
    const logOutput = $('is-log-output');
    const logTitle  = $('is-log-title');
    const killBtn   = $('is-kill-btn');
    if (logOutput) logOutput.innerHTML  = '<div class="ds-log-placeholder">Click ▶ Run on any script to execute it here.</div>';
    if (logTitle)  logTitle.textContent = 'Select a script to run';
    if (killBtn)   killBtn.style.display = 'none';
  }
}

window.InitspacePanel = InitspacePanel;
