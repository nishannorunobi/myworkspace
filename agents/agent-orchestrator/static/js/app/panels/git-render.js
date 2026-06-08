// ── Git panel rendering helpers — pure render functions ───────────────────────

function gitRenderBranch(d) {
  const badge = $('git-branch-badge');
  if (badge) badge.textContent = '⎇ ' + (d.branch || '?');

  const ab = $('git-ahead-badge');
  if (!ab) return;
  if (!d.has_remote) {
    ab.style.display = ''; ab.textContent = 'no remote';
    ab.className = 'git-ahead-badge git-no-remote';
  } else if (d.ahead > 0 || d.behind > 0) {
    let txt = '';
    if (d.ahead  > 0) txt += `↑${d.ahead} to push`;
    if (d.behind > 0) txt += (txt ? '  ' : '') + `↓${d.behind} to pull`;
    ab.style.display = ''; ab.textContent = txt;
    ab.className = 'git-ahead-badge' + (d.ahead > 0 ? ' git-ahead-has' : ' git-behind-has');
  } else {
    ab.style.display = ''; ab.textContent = '✓ up to date';
    ab.className = 'git-ahead-badge git-synced';
  }
}

function gitRenderStatBar(files) {
  const statBar = $('git-stat-bar');
  if (!statBar) return;
  const staged    = files.filter(f => f.state === 'staged').length;
  const modified  = files.filter(f => f.state === 'modified').length;
  const untracked = files.filter(f => f.state === 'untracked').length;
  const total     = staged + modified + untracked;
  if (total > 0) {
    const seg = (n, c) => n ? `<div class="git-stat-seg" style="width:${(n/total*100).toFixed(1)}%;background:${c}" title="${n}"></div>` : '';
    const lbl = (n, c, t) => n ? `<span style="color:${c}">■ ${n} ${t}</span>` : '';
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

function gitRenderFileList(files, d) {
  if (!files.length) {
    return `<div class="git-clean">Working tree clean ✓${
      !d.has_remote   ? ' — <span style="color:var(--text3)">no remote configured</span>' :
      d.ahead > 0     ? ` — <span style="color:var(--yellow)">↑${d.ahead} commit${d.ahead>1?'s':''} not pushed yet</span>` :
      d.behind > 0    ? ` — <span style="color:var(--blue)">↓${d.behind} commit${d.behind>1?'s':''} to pull</span>` : ''
    }</div>`;
  }
  return files.map((f, i) => {
    const big  = (f.size_bytes || 0) >= 1_048_576;
    const warn = (f.size_bytes || 0) >= 10_485_760;
    const sizeHtml = f.size
      ? `<span class="git-file-size${warn ? ' git-file-size-warn' : big ? ' git-file-size-big' : ''}">${esc(f.size)}</span>`
      : '';
    return `<div class="git-file-row${warn ? ' git-file-row-warn' : ''}" data-idx="${i}">
      <input type="checkbox" class="git-file-cb" id="gf${i}" ${f.state === 'staged' ? 'checked' : ''}>
      <span class="git-file-st git-st-${esc(f.state)}">${esc(f.status)}</span>
      <label class="git-file-path" for="gf${i}">${esc(f.path)}</label>
      ${sizeHtml}
    </div>`;
  }).join('');
}
