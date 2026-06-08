// ── AgentActions — start / stop / stopAll with spinner feedback ───────────────
class AgentActions {
  constructor(store, spinner, callbacks = {}) {
    this.store   = store;
    this.spinner = spinner;
    this.on      = callbacks;
  }

  async start(agentId, btn) {
    this.spinner.busy(btn);
    let ok = false;
    try {
      const d = await API.agents.start(agentId);
      if (d.ok === false) {
        this._showError([d.detail, d.output].filter(Boolean).join('\n\n') || d.error || 'Start failed');
        this.spinner.done(btn);
        if (btn) btn.disabled = false;
        return false;
      }
      ok = true;
    } catch {
      this.spinner.done(btn);
      if (btn) btn.disabled = false;
      return false;
    }
    if (ok) this.on.onStarted?.(agentId);
    await new Promise(r => setTimeout(r, 4000));
    this.spinner.done(btn);
    await this.store.load();
    this.on.refresh?.();
    return true;
  }

  async stop(agentId, btn) {
    this.spinner.busy(btn);
    await API.agents.stop(agentId).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));
    this.spinner.done(btn);
    await this.store.load();
    this.on.refresh?.();
    return true;
  }

  async stopAll(btn) {
    if (!confirm('Stop all running agents?')) return;
    this.spinner.busy(btn);
    await API.agents.stopAll().catch(() => {});
    await new Promise(r => setTimeout(r, 3000));
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
