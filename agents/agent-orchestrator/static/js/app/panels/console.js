// ── ConsolePanel — run shell commands in workspace ────────────────────────────
class ConsolePanel extends Panel {
  constructor() {
    super('console');
    this._lastKey = '';
    this._lastTs  = 0;
    this._ready   = false;
  }

  onActivate() { this._init(); }

  async _init() {
    const sel = $('console-cwd');
    if (!sel || this._ready) return;
    this._ready = true;
    try {
      const res = await fetch('/api/console/cwd-list').catch(() => null);
      if (!res) return;
      const d   = await res.json();
      sel.innerHTML = ['', ...(d.dirs || [])].map(dir =>
        `<option value="${esc(dir)}">${dir || '/ workspace root'}</option>`
      ).join('');
    } catch (_) {}
    const inp = $('console-input');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') this.run(); });
  }

  async run() {
    const inp = $('console-input');
    const sel = $('console-cwd');
    const out = $('console-output');
    if (!inp || !out) return;
    const cmd = inp.value.trim();
    if (!cmd) return;
    const cwd = sel?.value || '';

    const dedupeKey = `${cwd}:${cmd}`;
    const now = Date.now();
    if (dedupeKey === this._lastKey && now - this._lastTs < 3000) return;
    this._lastKey = dedupeKey;
    this._lastTs  = now;

    const header = document.createElement('div');
    header.className  = 'con-cmd';
    header.textContent = `${cwd ? cwd + '/' : ''}$ ${cmd}`;
    out.appendChild(header);

    inp.value    = '';
    inp.disabled = true;

    try {
      const res  = await fetch('/api/console/exec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, cwd }),
      });
      const d    = await res.json();
      const body = document.createElement('pre');
      body.className  = 'con-out ' + (d.ok ? 'ok' : 'err');
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
  }

  clear() {
    const out = $('console-output');
    if (out) out.innerHTML = '';
  }
}

window.ConsolePanel = ConsolePanel;
