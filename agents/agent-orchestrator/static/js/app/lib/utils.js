// ── Global utilities ─────────────────────────────────────────────────────────
window.esc      = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
window.$        = id => document.getElementById(id);
window.scrollBot = el => { if (el) el.scrollTop = el.scrollHeight; };
