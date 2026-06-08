Object.assign(Dashboard.prototype, {

  // ── Settings modal ────────────────────────────────────────────────────────

  openSettings() {
    const s = this.alerts.getSettings();
    $('s-enabled').checked     = s.enabled;
    $('s-volume').value        = Math.round((s.volume || 0.7) * 100);
    $('s-vol-val').textContent = $('s-volume').value + '%';

    for (const [ruleId, rule] of Object.entries(s.rules || {})) {
      const en  = $(`s-${ruleId}-en`);
      const snd = $(`s-${ruleId}-snd`);
      const dur = $(`s-${ruleId}-dur`);
      if (en)  en.checked  = rule.enabled;
      if (snd) snd.value   = rule.sound;
      if (dur) dur.value   = rule.duration;
    }
    $('settings-modal').classList.remove('hidden');
  },

  closeSettings() {
    $('settings-modal').classList.add('hidden');
  },

  async saveSettings() {
    const s = this.alerts.getSettings();
    s.enabled = $('s-enabled').checked;
    s.volume  = parseInt($('s-volume').value) / 100;
    for (const ruleId of Object.keys(s.rules || {})) {
      const en  = $(`s-${ruleId}-en`);
      const snd = $(`s-${ruleId}-snd`);
      const dur = $(`s-${ruleId}-dur`);
      if (en)  s.rules[ruleId].enabled  = en.checked;
      if (snd) s.rules[ruleId].sound    = snd.value;
      if (dur) s.rules[ruleId].duration = parseInt(dur.value);
    }
    await this.alerts.saveSettings(s);
    this.closeSettings();
  },

  async testAlert(type) {
    await fetch(`/api/alerts/test/${type}`, { method: 'POST' });
  },

});
