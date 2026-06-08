Object.assign(Dashboard.prototype, {

  // ── Workspace changes ─────────────────────────────────────────────────────

  _addChange(ev) {
    this._changeCount++;
    $('ch-count').textContent = this._changeCount;
    const feed = $('change-feed');
    const div  = document.createElement('div');
    div.className = 'ch-ev';
    let html = `<div class="ch-ts">${esc(ev.ts)}</div>`;
    for (const l of (ev.added   || [])) html += `<div class="ch-line ch-add">+ ${esc(l)}</div>`;
    for (const l of (ev.removed || [])) html += `<div class="ch-line ch-rem">- ${esc(l)}</div>`;
    div.innerHTML = html;
    feed.insertBefore(div, feed.firstChild);
  },

  toggleChanges() {
    this._changeOpen = !this._changeOpen;
    $('change-feed').classList.toggle('hidden', !this._changeOpen);
    $('ch-toggle').textContent = this._changeOpen ? '▴' : '▾';
  },

});
