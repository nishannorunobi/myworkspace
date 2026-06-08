Object.assign(Dashboard.prototype, {

  // ── Services view ────────────────────────────────────────────────────────

  showServices() {
    this._view = 'services';
    $('grid-view').classList.add('hidden');
    $('detail-view').classList.add('hidden');
    $('services-view').classList.remove('hidden');
    document.querySelectorAll('.vbtn').forEach(b => b.classList.toggle('active', b.dataset.view === 'services'));
    this._disconnectChat();
    this._disconnectLogs();
    this._disconnectCc();
    this.refreshServices();
  },

  async refreshServices() {
    const list = $('svc-list');
    const note = $('svc-note');
    if (!list) return;
    try {
      const res  = await fetch('/api/services');
      const data = await res.json();
      const svcs = data.services || [];
      note.textContent = `Last checked ${new Date().toLocaleTimeString()} · ${svcs.filter(s => s.reachable).length}/${svcs.length} up`;
      if (!svcs.length) {
        list.innerHTML = '<div class="svc-empty">No services declared. Add a <code>services</code> field in agents.conf.</div>';
        return;
      }
      list.innerHTML = svcs.map(s => `
        <div class="svc-row ${s.reachable ? 'up' : 'down'}">
          <div class="svc-status-col">
            <span class="svc-dot ${s.reachable ? 'up' : 'down'}"></span>
            <span class="svc-status-txt">${s.reachable ? 'UP' : 'DOWN'}</span>
          </div>
          <div class="svc-info">
            <div class="svc-name">${esc(s.name)}</div>
            <div class="svc-agent">managed by ${esc(s.agent_name)}</div>
          </div>
          <a class="svc-url" href="${s.url}" target="_blank">${s.url}</a>
          <div class="svc-actions">
            <button class="svc-btn" onclick="_dash._copySvcUrl(this,'${s.url}')" title="Copy URL">⎘ Copy</button>
            <a class="svc-btn open" href="${s.url}" target="_blank" title="Open">↗ Open</a>
          </div>
        </div>`).join('');
    } catch (e) {
      list.innerHTML = `<div class="svc-empty" style="color:var(--danger)">Failed to load: ${e}</div>`;
    }
  },

  _copySvcUrl(btn, url) {
    navigator.clipboard.writeText(url).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      btn.style.color = 'var(--green)';
      setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
    });
  },

});
