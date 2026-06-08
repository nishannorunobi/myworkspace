Object.assign(Dashboard.prototype, {

  // ── Memory ────────────────────────────────────────────────────────────────

  async _loadMemory(agentId) {
    const res  = await fetch(`/api/agents/${agentId}/memory`).catch(() => null);
    if (!res) return;
    const data = await res.json();
    const list = $('mem-list');
    list.innerHTML = '';
    for (const f of (data.files || [])) {
      const name = typeof f === 'string' ? f : f.name;
      const size = typeof f === 'object' ? f.size : null;
      const div = document.createElement('div');
      div.className = 'mem-item';
      div.innerHTML = `<span class="mem-item-name">${esc(name)}</span>${size ? `<span class="mem-item-size">${esc(size)}</span>` : ''}`;
      div.onclick = () => this._openMemFile(agentId, name, div);
      list.appendChild(div);
    }
  },

  async _openMemFile(agentId, filename, el) {
    document.querySelectorAll('.mem-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    const res  = await fetch(`/api/agents/${agentId}/memory/${encodeURIComponent(filename)}`).catch(() => null);
    if (!res) return;
    const data = await res.json();
    $('mem-body').textContent = data.content || data.error || '(empty)';
  },

});
