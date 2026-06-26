// ── ProjectShPanel — run any *.sh under a project, with full path visibility ──
// Unlike the Projects tab's start button (which guesses one start.sh and hides
// which file runs), this lists EVERY script per project + its directory hierarchy,
// each with its own ▶ Run. You always see the exact file being executed.
class ProjectShPanel extends Panel {
  constructor() {
    super('projectsh');
    this._logCtrl = null;
  }

  onActivate() { this.load(); }

  // ── Script list (grouped by project → directory hierarchy) ─────────────────

  async load() {
    const panel = $('psh-scripts');
    if (!panel) return;
    panel.innerHTML = '<div class="ds-loading">Loading…</div>';
    try {
      const res      = await fetch('/api/projectsh/scripts');
      const data     = await res.json();
      const projects = data.projects || [];
      if (!projects.length) {
        panel.innerHTML = '<div class="ds-loading">No scripts found for the configured projects.</div>';
        return;
      }
      panel.innerHTML = projects.map(p => `
        <div class="ds-project">
          <div class="ds-project-name" onclick="this.parentElement.classList.toggle('collapsed')">▾ ${esc(p.name)} <span class="psh-count">${p.scripts.length}</span></div>
          <div class="ds-script-list psh-tree">${this._renderTree(this._buildTree(p.scripts), p.name)}</div>
        </div>`).join('');
    } catch (e) {
      panel.innerHTML = `<div class="ds-loading" style="color:var(--red)">Failed: ${esc(String(e))}</div>`;
    }
  }

  // ── Tree building + rendering (directory hierarchy → nested nodes) ──────────

  _buildTree(scripts) {
    const root = { dirs: {}, files: [] };
    for (const s of scripts) {
      const parts = s.rel_path.split('/');
      const fname = parts.pop();  // eslint-disable-line no-unused-vars
      let node = root;
      for (const part of parts) {
        node.dirs[part] ??= { dirs: {}, files: [] };
        node = node.dirs[part];
      }
      node.files.push(s);
    }
    return root;
  }

  // depth drives the indent directly (inline padding-left) so alignment never
  // depends on fragile nested-margin CSS. Each level adds 16px.
  _renderTree(node, projName, depth = 0) {
    const indent = 12 + depth * 16;          // px from the left edge
    let html = '';
    // Folders first (sorted), each collapsible…
    for (const d of Object.keys(node.dirs).sort()) {
      html += `
        <div class="psh-node">
          <div class="psh-folder" style="padding-left:${indent}px" onclick="this.parentElement.classList.toggle('collapsed')">▾ 📁 ${esc(d)}</div>
          <div class="psh-children">${this._renderTree(node.dirs[d], projName, depth + 1)}</div>
        </div>`;
    }
    // …then scripts in this directory, each with its own ▶ Run beside it.
    for (const s of node.files.sort((a, b) => a.label.localeCompare(b.label))) {
      html += `
        <div class="ds-script-row psh-file" style="padding-left:${indent}px">
          <span class="ds-script-label" title="${esc(s.abs_path)}">📄 ${esc(s.label)}</span>
          <button class="ds-run-btn"
            onclick="window._dash.panels.projectsh.run('${esc(s.abs_path)}','${esc(projName + '/' + s.rel_path)}')">▶ Run</button>
        </div>`;
    }
    return html;
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
          <input class="sudo-input" id="psh-sudo-input" type="password" placeholder="password" autocomplete="current-password">
          <div class="sudo-actions">
            <button class="btn sudo-cancel">Cancel</button>
            <button class="btn btn-start sudo-run">Run</button>
          </div>
        </div>`;
      const input  = overlay.querySelector('#psh-sudo-input');
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
    const logOutput = $('psh-log-output');
    const logTitle  = $('psh-log-title');
    const killBtn   = $('psh-kill-btn');
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
      const res = await fetch('/api/projectsh/run', {
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
    await fetch('/api/projectsh/kill', { method: 'POST' });
    if (this._logCtrl) { this._logCtrl.abort(); this._logCtrl = null; }
    const killBtn  = $('psh-kill-btn');
    const logTitle = $('psh-log-title');
    if (killBtn)  killBtn.style.display = 'none';
    if (logTitle) logTitle.textContent += ' [killed]';
  }

  closeLog() {
    if (this._logCtrl) { this._logCtrl.abort(); this._logCtrl = null; }
    const logOutput = $('psh-log-output');
    const logTitle  = $('psh-log-title');
    const killBtn   = $('psh-kill-btn');
    if (logOutput) logOutput.innerHTML  = '<div class="ds-log-placeholder">Click ▶ Run on any script to execute it here.</div>';
    if (logTitle)  logTitle.textContent = 'Select a script to run';
    if (killBtn)   killBtn.style.display = 'none';
  }
}

window.ProjectShPanel = ProjectShPanel;
