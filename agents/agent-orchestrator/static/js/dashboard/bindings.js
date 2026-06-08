Object.assign(Dashboard.prototype, {

  // ── UI bindings ───────────────────────────────────────────────────────────

  _bindUI() {
    $('chat-in').addEventListener('keydown', e => { if (e.key === 'Enter') this.sendMsg(); });
    $('s-volume').addEventListener('input', () => {
      $('s-vol-val').textContent = $('s-volume').value + '%';
    });

    // Global click sound — fires on every interactive element click
    const CLICK_SEL = 'button,a,.tab,.vbtn,.sidebar-item,.mem-item,.git-file-row,.change-bar-hdr,.svc-row,.agent-card,.sub-agent-card,.cc-entry,.today-item,select,input[type=checkbox],input[type=range]';
    document.addEventListener('click', e => {
      if (e.target.closest(CLICK_SEL)) this.sound.click();
    }, true);
  },

});
