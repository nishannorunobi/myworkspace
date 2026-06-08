// ── Panel base class — consistent lifecycle for all tab panes ─────────────────
class Panel {
  constructor(id) {
    this.id      = id;
    this.pane    = document.getElementById(`pane-${id}`);
    this._active = false;
  }

  /** Called by NavController when this tab becomes active. */
  activate() {
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === this.id)
    );
    this.pane?.classList.add('active');
    this._active = true;
    this.onActivate?.();
  }

  deactivate() {
    this.pane?.classList.remove('active');
    this._active = false;
  }

  get isActive() { return this._active; }
}

window.Panel = Panel;
