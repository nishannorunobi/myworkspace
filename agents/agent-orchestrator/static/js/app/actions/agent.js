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

    // Poll until running, 5-minute timeout, or 10 consecutive stopped polls (~20s)
    const deadline = Date.now() + 5 * 60 * 1000;
    let stoppedStreak = 0;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const s = await API.agents.refreshStatus(agentId);
        if (s.status === 'running') break;
        if (s.status === 'stopped') {
          stoppedStreak++;
          if (stoppedStreak >= 10) {
            this._showError('Agent failed to start — check the Logs tab for details.');
            this.spinner.done(btn);
            if (btn) btn.disabled = false;
            await this.store.load();
            this.on.refresh?.();
            return false;
          }
        } else {
          stoppedStreak = 0;
        }
      } catch {}
    }

    this.spinner.done(btn);
    await this.store.load();
    this.on.refresh?.();
    return true;
  }

  async cleanBuild(agentId, btn) {
    if (!agentId) return false;
    if (!confirm('Clean the environment (.venv, caches, logs) and rebuild this agent?\nThe agent will be stopped if running.')) return false;
    this.spinner.busy(btn);
    try {
      const d = await API.agents.cleanBuild(agentId);
      if (d.ok === false) {
        this._showError([d.detail, d.output].filter(Boolean).join('\n\n') || d.error || 'Clean & build failed');
      }
    } catch {
      this._showError('Clean & build request failed');
    }
    this.spinner.done(btn);
    if (btn) btn.disabled = false;
    await this.store.load();
    this.on.refresh?.();
    return true;
  }

  // Replicate local source into the running container (no rebuild). Works while the
  // agent is stopped — only needs the container up (upload.sh checks that).
  async upload(agentId, btn) {
    if (!agentId) return false;
    this.spinner.busy(btn);
    try {
      const d = await API.agents.upload(agentId);
      const ok = d.ok !== false && !d.error;
      this._showBanner(
        [d.detail, d.output].filter(Boolean).join('\n\n') || d.error || (ok ? 'Uploaded' : 'Upload failed'),
        ok,
      );
    } catch {
      this._showBanner('Upload request failed', false);
    }
    this.spinner.done(btn);
    if (btn) btn.disabled = false;
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

  _showError(msg) { this._showBanner(msg, false); }

  // Banner under the detail header. ok=true → success styling, auto-dismiss sooner.
  _showBanner(msg, ok = false) {
    $('start-error-banner')?.remove();
    const div = Object.assign(document.createElement('div'), {
      id: 'start-error-banner',
      className: `start-error-banner${ok ? ' ok' : ''}`,
      textContent: msg,
    });
    $('detail-hdr')?.insertAdjacentElement('afterend', div);
    setTimeout(() => div.remove(), ok ? 6000 : 10000);
  }
}

window.AgentActions = AgentActions;
