// ── ServicesView — top-level services monitor (not a tab pane) ────────────────
// Note: this is a special view-level panel, not a tab pane.
// It uses id="services-view" and manages the view toggle.
class ServicesView {
  constructor() {
    this.el = document.getElementById('services-view');
  }

  show(onDisconnect) {
    $('grid-view').classList.add('hidden');
    $('detail-view').classList.add('hidden');
    this.el?.classList.remove('hidden');
    document.querySelectorAll('.vbtn').forEach(b =>
      b.classList.toggle('active', b.dataset.view === 'services')
    );
    onDisconnect?.();
    this.refresh();
  }

  async refresh() {
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
            <button class="svc-btn" onclick="window._dash.services.copyUrl(this,'${s.url}')" title="Copy URL">⎘ Copy</button>
            <a class="svc-btn open" href="${s.url}" target="_blank" title="Open">↗ Open</a>
          </div>
        </div>`).join('');
    } catch (e) {
      list.innerHTML = `<div class="svc-empty" style="color:var(--danger)">Failed to load: ${e}</div>`;
    }
  }

  copyUrl(btn, url) {
    navigator.clipboard.writeText(url).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      btn.style.color = 'var(--green)';
      setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
    });
  }
}

window.ServicesView = ServicesView;
