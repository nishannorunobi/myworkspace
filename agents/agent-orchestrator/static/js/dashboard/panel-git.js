Object.assign(Dashboard.prototype, {

  _gitJumpTo(repoPath) {
    // Switch to git tab and select this repo
    this.switchTab('git');
    const sel = $('git-repo-sel');
    if (sel) {
      // If repo is already in list, select it; else reload and then select
      const opt = [...sel.options].find(o => o.value === repoPath);
      if (opt) { sel.value = repoPath; this._gitRefresh(); }
      else { this._gitLoadRepos().then(() => { if (sel) { sel.value = repoPath; this._gitRefresh(); } }); }
    }
  },

  _gitActiveRepo() {
    return $('git-repo-sel')?.value || '';
  },

  async _gitLoadRepos() {
    const sel = $('git-repo-sel');
    if (!sel) return;
    try {
      const res   = await fetch('/api/git/repos').catch(() => null);
      if (!res || !res.ok) { sel.innerHTML = '<option value="">No repos found</option>'; return; }
      const d     = await res.json();
      const repos = d.repos || [];
      if (!repos.length) { sel.innerHTML = '<option value="">No git repos in projectspace</option>'; return; }
      sel.innerHTML = repos.map(r => {
        let hint = '';
        if (r.changed)       hint += `  · ${r.changed} changed`;
        if (r.ahead  > 0)    hint += `  ↑${r.ahead} to push`;
        if (r.behind > 0)    hint += `  ↓${r.behind} to pull`;
        if (!r.has_remote)   hint += '  (no remote)';
        return `<option value="${esc(r.path)}">${esc(r.name)}  [${esc(r.branch)}]${hint}</option>`;
      }).join('');
    } catch (_) {
      sel.innerHTML = '<option value="">Failed to load repos</option>';
    }
    this._gitRefresh();
  },

  async _gitRefresh() {
    const fileList = $('git-file-list');
    const logEl    = $('git-log');
    const out      = $('git-output');
    if (!fileList) return;
    fileList.innerHTML = '<div class="git-loading">Loading…</div>';
    const repo = this._gitActiveRepo();
    try {
      const url  = '/api/git/status' + (repo ? `?repo=${encodeURIComponent(repo)}` : '');
      const res  = await fetch(url).catch(() => null);
      if (!res || !res.ok) { fileList.innerHTML = '<div class="git-loading">Git unavailable</div>'; return; }
      const d    = await res.json();
      if (d.error) { fileList.innerHTML = `<div class="git-loading">${esc(d.error)}</div>`; return; }

      // Branch badge
      const badge = $('git-branch-badge');
      if (badge) badge.textContent = '⎇ ' + (d.branch || '?');

      // Ahead / behind remote
      const aheadBadge = $('git-ahead-badge');
      if (aheadBadge) {
        if (!d.has_remote) {
          aheadBadge.style.display = '';
          aheadBadge.textContent   = 'no remote';
          aheadBadge.className     = 'git-ahead-badge git-no-remote';
        } else if (d.ahead > 0 || d.behind > 0) {
          aheadBadge.style.display = '';
          let txt = '';
          if (d.ahead  > 0) txt += `↑${d.ahead} to push`;
          if (d.behind > 0) txt += (txt ? '  ' : '') + `↓${d.behind} to pull`;
          aheadBadge.textContent   = txt;
          aheadBadge.className     = 'git-ahead-badge' + (d.ahead > 0 ? ' git-ahead-has' : ' git-behind-has');
        } else {
          aheadBadge.style.display = '';
          aheadBadge.textContent   = '✓ up to date';
          aheadBadge.className     = 'git-ahead-badge git-synced';
        }
      }

      // File list
      this._gitFiles = d.files || [];
      fileList.innerHTML = this._gitFiles.length
        ? this._gitFiles.map((f, i) => {
            const big  = (f.size_bytes || 0) >= 1_048_576;
            const warn = (f.size_bytes || 0) >= 10_485_760; // 10 MB warning
            const sizeHtml = f.size
              ? `<span class="git-file-size${warn ? ' git-file-size-warn' : big ? ' git-file-size-big' : ''}">${esc(f.size)}</span>`
              : '';
            return `
            <div class="git-file-row${warn ? ' git-file-row-warn' : ''}" data-idx="${i}">
              <input type="checkbox" class="git-file-cb" id="gf${i}" ${f.state === 'staged' ? 'checked' : ''}>
              <span class="git-file-st git-st-${esc(f.state)}">${esc(f.status)}</span>
              <label class="git-file-path" for="gf${i}">${esc(f.path)}</label>
              ${sizeHtml}
            </div>`;
          }).join('')
        : `<div class="git-clean">Working tree clean ✓${
            !d.has_remote   ? ' — <span style="color:var(--text3)">no remote configured</span>' :
            d.ahead > 0     ? ` — <span style="color:var(--yellow)">↑${d.ahead} commit${d.ahead>1?'s':''} not pushed yet</span>` :
            d.behind > 0    ? ` — <span style="color:var(--blue)">↓${d.behind} commit${d.behind>1?'s':''} to pull</span>` : ''
          }</div>`;

      // Stat breakdown bar
      const statBar   = $('git-stat-bar');
      if (statBar) {
        const staged    = this._gitFiles.filter(f => f.state === 'staged').length;
        const modified  = this._gitFiles.filter(f => f.state === 'modified').length;
        const untracked = this._gitFiles.filter(f => f.state === 'untracked').length;
        const total     = staged + modified + untracked;
        if (total > 0) {
          const seg = (n, clr) => n ? `<div class="git-stat-seg" style="width:${(n/total*100).toFixed(1)}%;background:${clr}" title="${n}"></div>` : '';
          const lbl = (n, clr, t) => n ? `<span style="color:${clr}">■ ${n} ${t}</span>` : '';
          statBar.style.display = '';
          statBar.innerHTML = `
            <div class="git-stat-segs">
              ${seg(staged,'#3fb950')}${seg(modified,'#58a6ff')}${seg(untracked,'#d29922')}
            </div>
            <div class="git-stat-legend">
              ${lbl(staged,'#3fb950','staged')}${lbl(modified,'#58a6ff','modified')}${lbl(untracked,'#d29922','untracked')}
            </div>`;
        } else {
          statBar.style.display = 'none';
        }
      }

      // Log
      if (logEl) {
        logEl.innerHTML = d.log
          ? d.log.split('\n').map(l => `<div class="git-log-line">${esc(l)}</div>`).join('')
          : '<div class="git-loading">No commits yet</div>';
      }
      if (out) out.textContent = '';
    } catch (e) {
      if (fileList) fileList.innerHTML = `<div class="git-loading">Error: ${esc(String(e))}</div>`;
    }
  },

  _gitCheckedFiles() {
    const checked = [];
    document.querySelectorAll('.git-file-cb:checked').forEach((cb, _) => {
      const idx = parseInt(cb.closest('.git-file-row')?.dataset.idx ?? '-1');
      if (idx >= 0 && this._gitFiles?.[idx]) checked.push(this._gitFiles[idx].path);
    });
    return checked;
  },

  async _gitPost(endpoint, body = {}) {
    // Duplicate guard: ignore same git action within 2 seconds
    const key = endpoint + JSON.stringify(body);
    const now = Date.now();
    if (key === this._lastGitKey && now - (this._lastGitTs||0) < 2000) return;
    this._lastGitKey = key;
    this._lastGitTs  = now;

    const out = $('git-output');
    if (out) { out.className = 'git-output'; out.textContent = '…'; }
    try {
      const res  = await fetch(endpoint, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      const d    = await res.json();
      if (out) {
        out.className  = 'git-output ' + (d.ok ? 'ok' : 'err');
        out.textContent = d.output || (d.ok ? 'Done' : 'Failed');
      }
      if (d.ok) this._gitRefresh();
      return d;
    } catch (e) {
      if (out) { out.className = 'git-output err'; out.textContent = String(e); }
    }
  },

  async _gitAddAll()   { await this._gitPost('/api/git/add-all', { repo: this._gitActiveRepo() }); },
  async _gitPush()     { await this._gitPost('/api/git/push',    { repo: this._gitActiveRepo() }); },
  async _gitPull()     { await this._gitPost('/api/git/pull',    { repo: this._gitActiveRepo() }); },

  async _gitCommit() {
    const msg = $('git-commit-msg')?.value?.trim();
    if (!msg) { const o = $('git-output'); if (o) { o.className='git-output err'; o.textContent='Enter a commit message'; } return; }
    const files = this._gitCheckedFiles();
    const d = await this._gitPost('/api/git/commit', { message: msg, files, repo: this._gitActiveRepo() });
    if (d?.ok && $('git-commit-msg')) $('git-commit-msg').value = '';
  },

});
