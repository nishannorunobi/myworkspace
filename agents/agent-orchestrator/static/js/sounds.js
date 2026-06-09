/**
 * SoundSystem — generates alert tones via Web Audio API.
 * No audio files needed; all tones are synthesised programmatically.
 */
class SoundSystem {
  constructor() {
    this._nodes     = [];
    this._procNodes = [];
    this.__ctx      = null;
  }

  _ctx() {
    if (!this.__ctx) this.__ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.__ctx;
  }

  /** Resume AudioContext then run callback — guarantees currentTime is valid. */
  _ready(fn) {
    const ctx = this._ctx();
    if (ctx.state === 'running') { fn(ctx); return; }
    ctx.resume().then(() => fn(ctx));
  }

  /** Stop any currently playing alert sound. */
  stop() {
    this._nodes.forEach(n => { try { n.stop(0); } catch {} });
    this._nodes = [];
  }

  stopProcessing() {
    this._procNodes.forEach(n => { try { n.stop(0); } catch {} });
    this._procNodes = [];
  }

  /**
   * Play an alert sound.
   * @param {'alarm'|'warning'|'info'|'none'} type
   */
  play(type, volume = 0.7, duration = 10) {
    this.stop();
    this._ready(ctx => {
      switch (type) {
        case 'alarm':   this._alarm(ctx, volume, duration);   break;
        case 'warning': this._warning(ctx, volume, duration); break;
        case 'info':    this._info(ctx, volume);              break;
      }
    });
  }

  _alarm(ctx, vol, dur) {
    const count = Math.ceil(dur / 0.5);
    for (let i = 0; i < count; i++)
      this._beep(ctx, i % 2 === 0 ? 880 : 440, ctx.currentTime + i * 0.5, 0.45, vol);
  }

  _warning(ctx, vol, dur) {
    const count = Math.max(1, Math.floor(dur / 0.9));
    for (let i = 0; i < count; i++)
      this._beep(ctx, 660, ctx.currentTime + i * 0.9, 0.35, vol);
  }

  _info(ctx, vol) {
    this._beep(ctx, 523, ctx.currentTime,        0.3, vol * 0.6);
    this._beep(ctx, 659, ctx.currentTime + 0.15, 0.3, vol * 0.5);
  }

  _beep(ctx, freq, start, len, vol) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol * 0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + len + 0.01);
    this._nodes.push(osc);
  }

  // ── Progress sounds ────────────────────────────────────────────────────────

  /**
   * Start a looping progress sound. Waits for AudioContext to be ready first.
   * @param {'heartbeat'|'tick'|'ping'|'sonar'|'bubble'|'none'} style
   */
  processing(style = 'tick', vol = 0.6, dur = 30) {
    this.stopProcessing();
    if (style === 'none') return;
    this._ready(ctx => {
      switch (style) {
        case 'heartbeat': this._procHeartbeat(ctx, vol, dur); break;
        case 'tick':      this._procTick(ctx, vol, dur);      break;
        case 'ping':      this._procPing(ctx, vol, dur);      break;
        case 'sonar':     this._procSonar(ctx, vol, dur);     break;
        case 'bubble':    this._procBubble(ctx, vol, dur);    break;
      }
    });
  }

  /* Heartbeat — double thump 720/540 Hz every 1.0 s */
  _procHeartbeat(ctx, vol, dur) {
    const step = 1.0, n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * step;
      this._sinePulse(ctx, 720, t,        0.10, vol,        this._procNodes);
      this._sinePulse(ctx, 540, t + 0.14, 0.08, vol * 0.8, this._procNodes);
    }
  }

  /* Tick — crisp click at 3500 Hz every 1 s */
  _procTick(ctx, vol, dur) {
    const step = 1.0, n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++) {
      const t   = ctx.currentTime + i * step;
      const len = Math.ceil(ctx.sampleRate * 0.025);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.exp(-j / (len * 0.25));

      const src = ctx.createBufferSource(); src.buffer = buf;
      const f   = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 3500; f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * 1.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);

      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t); src.stop(t + 0.028);
      this._procNodes.push(src);
    }
  }

  /* Ping — bell tone at 880 Hz every 2 s */
  _procPing(ctx, vol, dur) {
    const step = 2.0, n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++)
      this._sinePulse(ctx, 880, ctx.currentTime + i * step, 0.7, vol, this._procNodes);
  }

  /* Sonar — rising sweep 350→750 Hz every 2.5 s */
  _procSonar(ctx, vol, dur) {
    const step = 2.5, n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * step;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, t);
      osc.frequency.linearRampToValueAtTime(750, t + 0.3);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * 0.6, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.65);
      this._procNodes.push(osc);
    }
  }

  /* Bubble — descending pop at 500→200 Hz every 1.3 s */
  _procBubble(ctx, vol, dur) {
    const step = 1.3, n = Math.ceil(dur / step);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * step;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.14);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * 0.7, t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.16);
      this._procNodes.push(osc);
    }
  }

  _sinePulse(ctx, freq, start, len, vol, nodeList = this._nodes) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol * 0.5, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + len + 0.01);
    nodeList.push(osc);
  }

  /** Short UI click — does NOT interrupt alert or progress sounds. */
  click(vol = 0.35) {
    this._ready(ctx => {
      const t   = ctx.currentTime;
      const len = Math.ceil(ctx.sampleRate * 0.035);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      const src    = ctx.createBufferSource(); src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 1400; filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      src.start(t); src.stop(t + 0.04);
    });
  }
}

window.SoundSystem = SoundSystem;
