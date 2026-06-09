// ── SpinnerButton — reusable busy/done button state ──────────────────────────
class SpinnerButton {
  constructor(sound) { this.sound = sound; }

  busy(btn) {
    if (!btn) return;
    btn._savedHTML = btn.innerHTML;
    btn.disabled   = true;
    btn.innerHTML  = '<span class="btn-spinner"></span>';
    const style = localStorage.getItem('proc-sound') || 'heartbeat';
    this.sound.processing(style, 0.4, 30);
  }

  done(btn) {
    if (!btn || btn._savedHTML == null) return;
    btn.innerHTML  = btn._savedHTML;
    btn._savedHTML = null;
    this.sound.stopProcessing();
  }
}

window.SpinnerButton = SpinnerButton;
