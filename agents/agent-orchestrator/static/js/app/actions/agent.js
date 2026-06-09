// ── AgentActions — start / stop / stopAll with spinner feedback ───────────────
class AgentActions {
  constructor(store, spinner, callbacks = {}) {
    this.store   = store;
    this.spinner = spinner;
    this.on      = callbacks;
  }

  async start(agentId, btn) {
    this.spinner.busy(btn);
    try {
      const d = await API.agents.start(agentId);
      if (d.ok === false) {
        this._showError([d.detail, d.output].filter(Boolean).join('\n\n') || d.error || 'Start failed');
        this.spinner.done(btn);
        if (btn) btn.disabled = false;
        return false;
      }
    } catch {
      this.spinner.done(btn);
      if (btn) btn.disabled = false;
      return false;
    }

    this.on.onStarted?.(agentId);

    // Poll until running or 5-minute timeout
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const s = await API.agents.refreshStatus(agentId);
        if (s.status === 'running') break;
      } catch {}
    }

    this.spinner.done(btn);
    await this.store.load();
    this.on.refresh?.();
    return true;
  }

  async stop(agentId, btn) {
    this.spinner.busy(btn);
    await API.agents.stop(agentId).catch(() => {});

    // Poll until stopped or 5-minute timeout
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const s = await API.agents.refreshStatus(agentId);
        if (s.status !== 'running') break;
      } catch {}
    }

    this.spinner.done(btn);
    await this.store.load();
    this.on.refresh?.();
    return true;
  }

  async stopAll(btn) {
    if (!confirm('Stop all running agents?')) return;
    this.spinner.busy(btn);
    await API.agents.stopAll().catch(() => {});

    // Poll all agents until none are running or 5-minute timeout
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        await this.store.load();
        if (this.store.running().length === 0) break;
      } catch {}
    }

    this.spinner.done(btn);
    if (btn) btn.disabled = false;
    await this.store.load();
    this.on.refresh?.();
  }

  _showError(msg) {
    $('start-error-banner')?.remove();
    const div = Object.assign(document.createElement('div'), {
      id: 'start-error-banner',
      className: 'start-error-banner',
      textContent: msg,
    });
    $('detail-hdr')?.insertAdjacentElement('afterend', div);
    setTimeout(() => div.remove(), 10000);
  }
}

window.AgentActions = AgentActions;
