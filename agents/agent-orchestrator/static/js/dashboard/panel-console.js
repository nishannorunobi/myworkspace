Object.assign(Dashboard.prototype, {

  // ── Console panel ──────────────────────────────────────────────────────────

  async _consoleInit() {
    const sel = $('console-cwd');
    if (!sel || sel.dataset.loaded) return;
    sel.dataset.loaded = '1';
    try {
      const res = await fetch('/api/console/cwd-list').catch(() => null);
      if (!res) return;
      const d   = await res.json();
      sel.innerHTML = ['', ...(d.dirs || [])].map(dir =>
        `<option value="${esc(dir)}">${dir || '/ workspace root'}</option>`
      ).join('');
    } catch (_) {}
    // Enter key
    const inp = $('console-input');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') this._consoleRun(); });
  },

  async _consoleRun() {
    const inp = $('console-input');
    const sel = $('console-cwd');
    const out = $('console-output');
    if (!inp || !out) return;
    const cmd = inp.value.trim();
    if (!cmd) return;

    const cwd = sel?.value || '';

    // Duplicate guard: ignore identical command+cwd within 3 seconds
    const dedupeKey = `${cwd}:${cmd}`;
    const now = Date.now();
    if (dedupeKey === this._lastConsoleKey && now - (this._lastConsoleTs||0) < 3000) return;
    this._lastConsoleKey = dedupeKey;
    this._lastConsoleTs  = now;

    // Echo the command
    const header = document.createElement('div');
    header.className = 'con-cmd';
    header.textContent = `${cwd ? cwd + '/' : ''}$ ${cmd}`;
    out.appendChild(header);

    inp.value    = '';
    inp.disabled = true;

    try {
      const res  = await fetch('/api/console/exec', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ command: cmd, cwd })
      });
      const d    = await res.json();
      const body = document.createElement('pre');
      body.className = 'con-out ' + (d.ok ? 'ok' : 'err');
      body.textContent = d.output || (d.ok ? '(no output)' : 'Command failed');
      if (!d.ok) body.textContent += `\n[exit ${d.exit_code}]`;
      out.appendChild(body);
    } catch (e) {
      const err = document.createElement('pre');
      err.className   = 'con-out err';
      err.textContent = String(e);
      out.appendChild(err);
    }

    inp.disabled = false;
    inp.focus();
    out.scrollTop = out.scrollHeight;
  },

  _consoleClear() {
    const out = $('console-output');
    if (out) out.innerHTML = '';
  },

});
