// ── DockerscriptPanel — run dockerspace shell scripts with streaming output ────
class DockerscriptPanel extends Panel {
  constructor() {
    super('dockerspace');
    this._logCtrl = null;
  }

  onActivate() { this.load(); }

  // ── Script list ───────────────────────────────────────────────────────────

  async load() {
    const panel = $('ds-scripts');
    if (!panel) return;
    panel.innerHTML = '<div class="ds-loading">Loading…</div>';
    try {
      const res      = await fetch('/api/dockerspace/scripts');
      const data     = await res.json();
      const projects = data.projects || [];
      if (!projects.length) {
        panel.innerHTML = '<div class="ds-loading">No shell scripts found in dockerspace/.</div>';
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
                  onclick="window._dash.panels.dockerspace.run('${esc(s.abs_path)}','${esc(s.label)}')">▶ Run</button>
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

  // ── Run script ────────────────────────────────────────────────────────────

  async run(absPath, label) {
    const pass = await this._askSudoPass(label);
    if (pass === null) return;  // cancelled

    if (this._logCtrl) { this._logCtrl.abort(); this._logCtrl = null; }
    const logOutput = $('ds-log-output');
    const logTitle  = $('ds-log-title');
    const killBtn   = $('ds-kill-btn');
    if (logOutput) logOutput.innerHTML = '';
    if (logTitle)  logTitle.textContent  = `Running: ${label}`;
    if (killBtn)   killBtn.style.display = '';

    this._logCtrl = new AbortController();
    const append  = text => {
      const el = document.createElement('div');
      el.className   = 'ds-log-line';
      el.textContent = text;
      logOutput.appendChild(el);
      logOutput.scrollTop = logOutput.scrollHeight;
    };

    try {
      const res = await fetch('/api/dockerspace/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ script: absPath, sudo_pass: pass }),
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
            if (logTitle) logTitle.textContent  = `Done: ${label}`;
            if (killBtn)  killBtn.style.display = 'none';
            return;
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
    await fetch('/api/dockerspace/kill', { method: 'POST' });
    if (this._logCtrl) { this._logCtrl.abort(); this._logCtrl = null; }
    const killBtn  = $('ds-kill-btn');
    const logTitle = $('ds-log-title');
    if (killBtn)  killBtn.style.display = 'none';
    if (logTitle) logTitle.textContent += ' [killed]';
  }

  closeLog() {
    if (this._logCtrl) { this._logCtrl.abort(); this._logCtrl = null; }
    const logOutput = $('ds-log-output');
    const logTitle  = $('ds-log-title');
    const killBtn   = $('ds-kill-btn');
    if (logOutput) logOutput.innerHTML  = '<div class="ds-log-placeholder">Click ▶ Run on any script to execute it here.</div>';
    if (logTitle)  logTitle.textContent = 'Select a script to run';
    if (killBtn)   killBtn.style.display = 'none';
  }
}

window.DockerscriptPanel = DockerscriptPanel;
