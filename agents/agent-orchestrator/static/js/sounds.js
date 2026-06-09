/**
 * SoundSystem — generates alert tones via Web Audio API.
 * No audio files needed; all tones are synthesised programmatically.
 */
class SoundSystem {
  constructor() {
    this._nodes     = [];   // alert nodes
    this._procNodes = [];   // processing/waiting heartbeat nodes
    this.__ctx      = null;
  }

  _ctx() {
    if (!this.__ctx) this.__ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.__ctx.state === 'suspended') this.__ctx.resume();
    return this.__ctx;
  }

  /** Stop any currently playing alert sound. */
  stop() {
    this._nodes.forEach(n => { try { n.stop(0); } catch {} });
    this._nodes = [];
  }

  /**
   * Play a sound type.
   * @param {'alarm'|'warning'|'info'|'none'} type
   * @param {number} volume  0–1
   * @param {number} duration  seconds
   */
  play(type, volume = 0.7, duration = 10) {
    this.stop();
    const ctx = this._ctx();
    switch (type) {
      case 'alarm':   this._alarm(ctx, volume, duration);   break;
      case 'warning': this._warning(ctx, volume, duration); break;
      case 'info':    this._info(ctx, volume);              break;
      case 'none':    break;
    }
  }

  /* ── Alarm: rapid alternating hi/lo beeps ── */
  _alarm(ctx, vol, dur) {
    const count = Math.ceil(dur / 0.5);
    for (let i = 0; i < count; i++) {
      this._beep(ctx, i % 2 === 0 ? 880 : 440, ctx.currentTime + i * 0.5, 0.45, vol);
    }
  }

  /* ── Warning: medium repeating beeps ── */
  _warning(ctx, vol, dur) {
    const count = Math.max(1, Math.floor(dur / 0.9));
    for (let i = 0; i < count; i++) {
      this._beep(ctx, 660, ctx.currentTime + i * 0.9, 0.35, vol);
    }
  }

  /* ── Info: single short chime ── */
  _info(ctx, vol) {
    this._beep(ctx, 523, ctx.currentTime, 0.3, vol * 0.6);
    this._beep(ctx, 659, ctx.currentTime + 0.15, 0.3, vol * 0.5);
  }

  _beep(ctx, freq, start, len, vol) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol * 0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + len + 0.01);
    this._nodes.push(osc);
  }

  // ── Progress sounds ────────────────────────────────────────────────────────

  /**
   * Play a looping progress sound while an action is running.
   * @param {'heartbeat'|'tick'|'ping'|'sonar'|'bubble'|'none'} style
   * @param {number} vol   0–1
   * @param {number} dur   seconds to schedule ahead
   */
  processing(style = 'heartbeat', vol = 0.4, dur = 30) {
    this.stopProcessing();
    if (style === 'none') return;
    const ctx = this._ctx();
    switch (style) {
      case 'heartbeat': this._procHeartbeat(ctx, vol, dur); break;
      case 'tick':      this._procTick(ctx, vol, dur);      break;
      case 'ping':      this._procPing(ctx, vol, dur);      break;
      case 'sonar':     this._procSonar(ctx, vol, dur);     break;
      case 'bubble':    this._procBubble(ctx, vol, dur);    break;
    }
  }

  /* Heartbeat — soft double-thump every 1.2 s */
  _procHeartbeat(ctx, vol, dur) {
    const step = 1.2;
    const n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * step;
      this._sinePulse(ctx, 200, t,        0.09, vol,        this._procNodes);
      this._sinePulse(ctx, 170, t + 0.13, 0.07, vol * 0.7, this._procNodes);
    }
  }

  /* Tick — crisp metronome click every 1 s */
  _procTick(ctx, vol, dur) {
    const step = 1.0;
    const n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++) {
      const t   = ctx.currentTime + i * step;
      const len = Math.ceil(ctx.sampleRate * 0.018);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let j = 0; j < len; j++) d[j] = Math.random() * 2 - 1;

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 1.5;

      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);

      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t); src.stop(t + 0.022);
      this._procNodes.push(src);
    }
  }

  /* Ping — clear bell-like tone every 2 s */
  _procPing(ctx, vol, dur) {
    const step = 2.0;
    const n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * step;
      this._sinePulse(ctx, 880, t, 0.6, vol * 0.8, this._procNodes);
    }
  }

  /* Sonar — rising sweep ping every 2.5 s */
  _procSonar(ctx, vol, dur) {
    const step = 2.5;
    const n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++) {
      const t   = ctx.currentTime + i * step;
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type  = 'sine';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.linearRampToValueAtTime(700, t + 0.25);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * 0.45, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.55);
      this._procNodes.push(osc);
    }
  }

  /* Bubble — soft pop every 1.3 s */
  _procBubble(ctx, vol, dur) {
    const step = 1.3;
    const n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++) {
      const t   = ctx.currentTime + i * step;
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type  = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * 0.55, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.14);
      this._procNodes.push(osc);
    }
  }

  stopProcessing() {
    this._procNodes.forEach(n => { try { n.stop(0); } catch {} });
    this._procNodes = [];
  }

  _sinePulse(ctx, freq, start, len, vol, nodeList) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol * 0.45, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + len + 0.01);
    nodeList.push(osc);
  }

  /** Play a short UI click sound — does NOT interrupt alert sounds. */
  click(vol = 0.35) {
    const ctx = this._ctx();
    const t   = ctx.currentTime;

    const len    = Math.ceil(ctx.sampleRate * 0.035);
    const buf    = ctx.createBuffer(1, len, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src    = ctx.createBufferSource();
    src.buffer   = buf;

    const filter = ctx.createBiquadFilter();
    filter.type  = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.6;

    const gain   = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.04);
  }
}

window.SoundSystem = SoundSystem;
