// ── ControlsPanel — sub-agent health dashboard + service control buttons ───────
class ControlsPanel extends Panel {
  constructor(spinner) {
    super('controls');
    this.spinner  = spinner;
    this._agentId = null;
  }

  onActivate() {
    if (this._agentId) this.load(this._agentId);
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async load(agentId) {
    this._agentId  = agentId;
    const wrap     = $('controls-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="controls-loading">Fetching health…</div>';
    try {
      const fetches  = [fetch(`/api/agents/${agentId}/health`)];
      if (agentId === 'db-agent') fetches.push(fetch(`/api/agents/${agentId}/services`));
      const results  = await Promise.all(fetches);
      const h        = await results[0].json();
      const svcData  = results[1] ? await results[1].json() : {};
      const services = svcData.services || {};

      if (h.error) {
        wrap.innerHTML = `<div class="controls-loading" style="color:var(--danger)">${esc(h.error)}</div>`;
        return;
      }

      const issues    = h.issues || [];
      const issueHtml = issues.length
        ? `<div class="ctrl-issues">${issues.map(i => `<div class="ctrl-issue-row">⚠ ${esc(i)}</div>`).join('')}</div>`
        : `<div class="ctrl-ok-row">✓ No active issues</div>`;

      const skip      = new Set(['status', 'issues', 'time', 'agent']);
      const fields    = Object.entries(h).filter(([k]) => !skip.has(k));
      const fieldsHtml = fields.map(([k, v]) => {
        const valStr = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
        const valCls = typeof v === 'boolean' ? (v ? 'green' : 'red') : '';
        return `<div class="ctrl-field"><span class="ctrl-field-lbl">${esc(k.replace(/_/g,' '))}</span><span class="ctrl-field-val ${valCls}">${esc(valStr)}</span></div>`;
      }).join('');

      const buttons = this._buttons(agentId, h, services);

      wrap.innerHTML = `
        <div class="controls-header">
          <span class="ctrl-agent-lbl">${esc(h.agent || agentId)}</span>
          <span class="ctrl-status ${issues.length ? 'degraded' : 'ok'}">${issues.length ? 'Degraded' : 'Healthy'}</span>
          <button class="ctrl-refresh-btn" onclick="window._dash.panels.controls.load('${agentId}')">↺ Refresh</button>
        </div>
        <div class="ctrl-fields">${fieldsHtml}</div>
        <div class="ctrl-section-lbl">Issues</div>
        ${issueHtml}
        ${buttons ? `<div class="ctrl-section-lbl">Service Controls</div><div class="ctrl-btns">${buttons}</div>` : ''}`;
    } catch (e) {
      wrap.innerHTML = `<div class="controls-loading" style="color:var(--danger)">Failed: ${esc(String(e))}</div>`;
    }
  }

  // ── Agent-specific button sets ────────────────────────────────────────────

  _buttons(agentId, health, services = {}) {
    if (agentId === 'db-agent') {
      const pgUp  = health.postgres_running;
      let html = `
        <button class="ctrl-btn start" ${pgUp  ? 'disabled' : ''} onclick="window._dash.panels.controls.doAction('db-agent','api/db/start',this)">▶ PostgreSQL</button>
        <button class="ctrl-btn stop"  ${!pgUp ? 'disabled' : ''} onclick="window._dash.panels.controls.doAction('db-agent','api/db/stop',this)">■ PostgreSQL</button>
        <button class="ctrl-btn init"  ${!pgUp ? 'disabled' : ''} onclick="window._dash.panels.controls.doAction('db-agent','api/initdb/umsdb',this)"    title="Create umsdb user + database">⚙ Init umsdb</button>
        <button class="ctrl-btn init"  ${!pgUp ? 'disabled' : ''} onclick="window._dash.panels.controls.doAction('db-agent','api/initdb/mydocsdb',this)" title="Create mydocsdb user + database">⚙ Init mydocsdb</button>`;
      const webUp = health.pgweb_running;
      html += `
        <button class="ctrl-btn start" ${webUp  ? 'disabled' : ''} onclick="window._dash.panels.controls.doAction('db-agent','api/dbui/start',this)" title="Start pgweb DB browser on :8085">▶ DB UI</button>
        <button class="ctrl-btn stop"  ${!webUp ? 'disabled' : ''} onclick="window._dash.panels.controls.doAction('db-agent','api/dbui/stop',this)"  title="Stop pgweb">■ DB UI</button>`;
      for (const [key, svc] of Object.entries(services)) {
        const [proj, name] = key.split('/');
        const label        = (svc.name || name).replace(/_/g, ' ');
        html += `
        <button class="ctrl-btn start" onclick="window._dash.panels.controls.doAction('db-agent','api/services/${proj}/${name}/start',this)">▶ ${esc(label)}</button>
        <button class="ctrl-btn stop"  onclick="window._dash.panels.controls.doAction('db-agent','api/services/${proj}/${name}/stop',this)">■ ${esc(label)}</button>`;
      }
      return html;
    }
    if (agentId === 'ums-agent') {
      return `
        <button class="ctrl-btn start" onclick="window._dash.panels.controls.doAction('ums-agent','api/ums/start',this)">▶ Start UMS</button>
        <button class="ctrl-btn stop"  onclick="window._dash.panels.controls.doAction('ums-agent','api/ums/stop',this)">■ Stop UMS</button>`;
    }
    return '';
  }

  // ── Control action ────────────────────────────────────────────────────────

  async doAction(agentId, path, btn = null) {
    const wrap = $('controls-wrap');
    const btns = wrap?.querySelectorAll('.ctrl-btn');
    btns?.forEach(b => b.disabled = true);
    if (btn) this.spinner.busy(btn);

    // Remove any previous result
    wrap?.querySelectorAll('.ctrl-action-result').forEach(n => n.remove());

    try {
      const res  = await fetch(`/api/agents/${agentId}/action/${path}`, { method: 'POST' });
      const data = await res.json();
      const ok   = data.success !== false && !data.error;
      const msg  = data.output || data.error || (ok ? 'Done' : 'Failed');

      const note = document.createElement('div');
      note.className = `ctrl-action-result ${ok ? 'ok' : 'err'}`;

      const pre = document.createElement('pre');
      pre.className  = 'ctrl-action-output';
      pre.textContent = msg;
      note.appendChild(pre);

      if (!ok) {
        const dismiss = document.createElement('button');
        dismiss.className   = 'ctrl-action-dismiss';
        dismiss.textContent = '✕ Dismiss';
        dismiss.onclick     = () => note.remove();
        note.appendChild(dismiss);
      }

      wrap?.appendChild(note);
      if (ok) setTimeout(() => note.remove(), 6000);
    } catch (e) {
      const note = document.createElement('div');
      note.className = 'ctrl-action-result err';
      const pre = document.createElement('pre');
      pre.className  = 'ctrl-action-output';
      pre.textContent = String(e);
      note.appendChild(pre);
      const dismiss = document.createElement('button');
      dismiss.className   = 'ctrl-action-dismiss';
      dismiss.textContent = '✕ Dismiss';
      dismiss.onclick     = () => note.remove();
      note.appendChild(dismiss);
      wrap?.appendChild(note);
    }
    setTimeout(() => this.load(agentId), 2000);
  }
}

window.ControlsPanel = ControlsPanel;
