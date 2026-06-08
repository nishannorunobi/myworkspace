// ── GitPanel — git status, commit, push/pull for workspace repos ──────────────
class GitPanel extends Panel {
  constructor() {
    super('git');
    this._files   = [];
    this._lastKey = '';
    this._lastTs  = 0;
  }

  onActivate() { this._loadRepos(); }

  jumpTo(repoPath) {
    const sel = $('git-repo-sel');
    if (!sel) return;
    const opt = [...sel.options].find(o => o.value === repoPath);
    if (opt) { sel.value = repoPath; this.refresh(); }
    else { this._loadRepos().then(() => { if (sel) { sel.value = repoPath; this.refresh(); } }); }
  }

  activeRepo() { return $('git-repo-sel')?.value || ''; }

  async _loadRepos() {
    const sel = $('git-repo-sel');
    if (!sel) return;
    try {
      const d = await API.git.repos().catch(() => null);
      if (!d) { sel.innerHTML = '<option value="">No repos found</option>'; return; }
      const repos = d.repos || [];
      if (!repos.length) { sel.innerHTML = '<option value="">No git repos in projectspace</option>'; return; }
      sel.innerHTML = repos.map(r => {
        let hint = '';
        if (r.changed)     hint += `  · ${r.changed} changed`;
        if (r.ahead  > 0)  hint += `  ↑${r.ahead} to push`;
        if (r.behind > 0)  hint += `  ↓${r.behind} to pull`;
        if (!r.has_remote) hint += '  (no remote)';
        return `<option value="${esc(r.path)}">${esc(r.name)}  [${esc(r.branch)}]${hint}</option>`;
      }).join('');
    } catch (_) {
      sel.innerHTML = '<option value="">Failed to load repos</option>';
    }
    this.refresh();
  }

  syncRepos(repos) {
    const sel = $('git-repo-sel');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = repos.map(r => {
      let hint = '';
      if (r.changed)     hint += `  · ${r.changed} changed`;
      if (r.ahead  > 0)  hint += `  ↑${r.ahead} to push`;
      if (r.behind > 0)  hint += `  ↓${r.behind} to pull`;
      if (!r.has_remote) hint += '  (no remote)';
      return `<option value="${esc(r.path)}" ${r.path === current ? 'selected' : ''}>${esc(r.name)}  [${esc(r.branch)}]${hint}</option>`;
    }).join('');
    if (current && sel.value !== current) this.refresh();
  }

  async refresh() {
    const fileList = $('git-file-list');
    const logEl    = $('git-log');
    const out      = $('git-output');
    if (!fileList) return;
    fileList.innerHTML = '<div class="git-loading">Loading…</div>';
    try {
      const d = await API.git.status(this.activeRepo()).catch(() => null);
      if (!d)        { fileList.innerHTML = '<div class="git-loading">Git unavailable</div>'; return; }
      if (d.error)   { fileList.innerHTML = `<div class="git-loading">${esc(d.error)}</div>`; return; }

      gitRenderBranch(d);
      this._files = d.files || [];
      fileList.innerHTML = gitRenderFileList(this._files, d);
      gitRenderStatBar(this._files);

      if (logEl) {
        logEl.innerHTML = d.log
          ? d.log.split('\n').map(l => `<div class="git-log-line">${esc(l)}</div>`).join('')
          : '<div class="git-loading">No commits yet</div>';
      }
      if (out) out.textContent = '';
    } catch (e) {
      if (fileList) fileList.innerHTML = `<div class="git-loading">Error: ${esc(String(e))}</div>`;
    }
  }

  checkedFiles() {
    return [...document.querySelectorAll('.git-file-cb:checked')].map(cb => {
      const idx = parseInt(cb.closest('.git-file-row')?.dataset.idx ?? '-1');
      return idx >= 0 && this._files[idx] ? this._files[idx].path : null;
    }).filter(Boolean);
  }

  async _post(endpoint, body = {}) {
    const key = endpoint + JSON.stringify(body);
    const now = Date.now();
    if (key === this._lastKey && now - this._lastTs < 2000) return;
    this._lastKey = key; this._lastTs = now;

    const out = $('git-output');
    if (out) { out.className = 'git-output'; out.textContent = '…'; }
    try {
      const res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d   = await res.json();
      if (out) { out.className = 'git-output ' + (d.ok ? 'ok' : 'err'); out.textContent = d.output || (d.ok ? 'Done' : 'Failed'); }
      if (d.ok) this.refresh();
      return d;
    } catch (e) {
      if (out) { out.className = 'git-output err'; out.textContent = String(e); }
    }
  }

  addAll()  { return this._post('/api/git/add-all', { repo: this.activeRepo() }); }
  push()    { return this._post('/api/git/push',    { repo: this.activeRepo() }); }
  pull()    { return this._post('/api/git/pull',    { repo: this.activeRepo() }); }

  async commit() {
    const msg = $('git-commit-msg')?.value?.trim();
    if (!msg) { const o = $('git-output'); if (o) { o.className='git-output err'; o.textContent='Enter a commit message'; } return; }
    const d = await this._post('/api/git/commit', { message: msg, files: this.checkedFiles(), repo: this.activeRepo() });
    if (d?.ok && $('git-commit-msg')) $('git-commit-msg').value = '';
  }
}

window.GitPanel = GitPanel;
