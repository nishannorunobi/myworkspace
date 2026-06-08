// ── DashNotifications — intervention splash, toasts, monitor badge, change feed ─

class DashNotifications {
  constructor(sound) {
    this.sound = sound;
    this._changeCount = 0;
    this._changeOpen  = true;
  }

  // ── Monitor badge ──────────────────────────────────────────────────────────

  setMonitorBadge(on) {
    const el = $('monitor-badge');
    if (!el) return;
    el.textContent = on ? '● MONITOR ON' : '● MONITOR OFF';
    el.className   = 'monitor-badge' + (on ? '' : ' off');
  }

  // ── Toast notifications ────────────────────────────────────────────────────

  showToast(message, cls, origin) {
    const container = $('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${cls}`;
    const ts = new Date().toLocaleTimeString();
    el.innerHTML = `
      <span class="toast-origin">${esc(origin)}</span>
      <span class="toast-msg">${esc(message)}</span>
      <span class="toast-time">${ts}</span>
      <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>`;
    container.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 6000);
  }

  // ── Intervention modal ─────────────────────────────────────────────────────

  async showIntervention({ message, source, details }) {
    let n = 5;
    try {
      const r = await fetch('http://localhost:8889/api/config');
      if (r.ok) n = (await r.json()).bell_rings || 5;
    } catch {}
    this._beepN(n);

    let splash = $('intervention-splash');
    if (!splash) { splash = document.createElement('div'); splash.id = 'intervention-splash'; document.body.appendChild(splash); }
    const ts         = new Date().toLocaleTimeString();
    const detailText = details?.details
      ? `<pre class="intervention-detail">${esc(JSON.stringify(details.details, null, 2))}</pre>` : '';
    splash.innerHTML = `
      <div class="intervention-box">
        <div class="intervention-icon">⚠</div>
        <div class="intervention-source">${esc(source)}</div>
        <div class="intervention-title">User Action Required</div>
        <div class="intervention-msg">${esc(message)}</div>
        ${detailText}
        <div class="intervention-time">${ts}</div>
        <button class="intervention-ack" onclick="$('intervention-splash').remove();window._dash.sound.stop()">
          Acknowledge
        </button>
      </div>`;
    splash.classList.add('active');
  }

  _beepN(n = 5) {
    this.sound.stop();
    const ctx = this.sound._ctx();
    for (let i = 0; i < n; i++) {
      const t    = ctx.currentTime + i * 0.4;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.25);
    }
  }

  // ── Workspace change feed ──────────────────────────────────────────────────

  addChange(ev) {
    this._changeCount++;
    const cnt = $('ch-count');
    if (cnt) cnt.textContent = this._changeCount;
    const feed = $('change-feed');
    if (!feed) return;
    const div = document.createElement('div');
    div.className = 'ch-ev';
    let html = `<div class="ch-ts">${esc(ev.ts)}</div>`;
    for (const l of (ev.added   || [])) html += `<div class="ch-line ch-add">+ ${esc(l)}</div>`;
    for (const l of (ev.removed || [])) html += `<div class="ch-line ch-rem">- ${esc(l)}</div>`;
    div.innerHTML = html;
    feed.insertBefore(div, feed.firstChild);
  }

  toggleChanges() {
    this._changeOpen = !this._changeOpen;
    $('change-feed')?.classList.toggle('hidden', !this._changeOpen);
    const btn = $('ch-toggle');
    if (btn) btn.textContent = this._changeOpen ? '▴' : '▾';
  }
}

window.DashNotifications = DashNotifications;
