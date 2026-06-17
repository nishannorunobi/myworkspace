// ── SpinnerButton — reusable busy/done button state ──────────────────────────
// Requirement: the tick progress sound is active exactly while a spinner is
// active — it starts when spinning starts and stops when spinning stops, for
// every button. Concurrent spinners are reference-counted so the sound spans
// all of them and stops only when the last one finishes.
class SpinnerButton {
  constructor(sound) {
    this.sound   = sound;
    this._active = 0;      // number of buttons currently spinning
    this._timer  = null;   // re-arm interval so the sound lasts the whole spin
  }

  busy(btn) {
    if (btn) {
      btn._savedHTML = btn.innerHTML;
      btn.disabled   = true;
      btn.innerHTML  = '<span class="btn-spinner"></span>';
    }
    this._active++;
    if (this._active === 1) this._soundOn();
  }

  done(btn) {
    if (btn && btn._savedHTML != null) {
      btn.innerHTML  = btn._savedHTML;
      btn._savedHTML = null;
    }
    this._active = Math.max(0, this._active - 1);
    if (this._active === 0) this._soundOff();
  }

  // The underlying sound only schedules a fixed chunk, so re-arm it on a timer
  // to keep it playing for the entire spin. A hard ceiling guarantees it can
  // never play forever even if a done() is somehow missed.
  _soundOn() {
    const CHUNK = 30, MAX = 300;   // seconds: per-chunk schedule, hard ceiling
    const t0 = Date.now();
    const arm = () => {
      if ((Date.now() - t0) / 1000 >= MAX) { this._soundOff(); return; }
      const style = localStorage.getItem('proc-sound') || 'tick';
      this.sound.processing(style, 1.0, CHUNK);
    };
    arm();
    clearInterval(this._timer);
    this._timer = setInterval(arm, (CHUNK - 1) * 1000);
  }

  _soundOff() {
    clearInterval(this._timer);
    this._timer = null;
    this.sound.stopProcessing();
  }
}

window.SpinnerButton = SpinnerButton;
