Object.assign(Dashboard.prototype, {

  // ── Chat ──────────────────────────────────────────────────────────────────

  _connectChat(agentId) {
    this._disconnectChat();
    this._currentMsgEl = null;
    this._ws = new WebSocket(`ws://${location.host}/ws/agents/${agentId}/chat`);
    this._ws.onmessage = e => this._handleChatMsg(JSON.parse(e.data));
    this._ws.onclose   = () => this._enableInput();
    this._enableInput();
  },

  _disconnectChat() {
    if (this._ws) { this._ws.close(); this._ws = null; }
  },

  _resetChat() {
    $('chat-msgs').innerHTML = '';
    this._currentMsgEl = null;
    this._enableInput();
  },

  _handleChatMsg(msg) {
    const feed = $('chat-msgs');
    if (msg.type === 'history_msg') {
      const div = document.createElement('div');
      div.className = 'msg history';
      const roleLabel = msg.role === 'user' ? 'You' : 'Agent';
      const roleClass = msg.role === 'user' ? 'user' : 'agent';
      div.innerHTML = `<div class="msg-role ${roleClass}">${roleLabel}</div>`
        + `<div class="msg-body">${esc(msg.content)}</div>`
        + (msg.ts ? `<div class="msg-ts">${esc(msg.ts)}</div>` : '');
      feed.appendChild(div);
      scrollBot(feed);
      return;
    }
    if (msg.type === 'text') {
      feed.querySelector('.thinking-wrap')?.remove();
      if (!this._currentMsgEl) {
        const wrap = document.createElement('div');
        wrap.className = 'msg';
        wrap.innerHTML = '<div class="msg-role agent">Agent</div><div class="msg-body"></div>';
        feed.appendChild(wrap);
        this._currentMsgEl = wrap.querySelector('.msg-body');
      }
      this._currentMsgEl.textContent += msg.content;
      scrollBot(feed);
    }
    if (msg.type === 'tool_call') {
      feed.querySelector('.thinking-wrap')?.remove();
      const div = document.createElement('div');
      div.id = `tc-${msg.id}`;
      div.className = 'tool-block';
      div.innerHTML = `<span class="tool-n">[${esc(msg.name)}]</span><span class="tool-i">${esc(JSON.stringify(msg.input||{}).slice(0,120))}</span>`;
      feed.appendChild(div);
      scrollBot(feed);
    }
    if (msg.type === 'tool_result') {
      const el = $(`tc-${msg.id}`);
      if (el) {
        const r = document.createElement('div');
        r.className = 'tool-r';
        r.textContent = '→ ' + JSON.stringify(msg.result).slice(0, 300);
        el.appendChild(r);
        scrollBot(feed);
      }
    }
    if (msg.type === 'error') {
      feed.querySelector('.thinking-wrap')?.remove();
      const div = document.createElement('div');
      div.className = 'msg';
      div.innerHTML = `<div class="msg-role err">Error</div><div class="msg-body red">${esc(msg.content)}</div>`;
      feed.appendChild(div);
      scrollBot(feed);
    }
    if (msg.type === 'done') {
      this._currentMsgEl = null;
      this._enableInput();
      if (this._selected) this._loadMemory(this._selected);
    }
  },

  sendMsg() {
    const input = $('chat-in');
    const text  = input.value.trim();
    if (!text || !this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    const feed = $('chat-msgs');

    const uDiv = document.createElement('div');
    uDiv.className = 'msg';
    uDiv.innerHTML = `<div class="msg-role user">You</div><div class="msg-body">${esc(text)}</div>`;
    feed.appendChild(uDiv);

    const tDiv = document.createElement('div');
    tDiv.className = 'msg thinking-wrap';
    tDiv.innerHTML = '<div class="msg-role agent">Agent</div><div class="thinking">thinking…</div>';
    feed.appendChild(tDiv);
    scrollBot(feed);

    this._ws.send(JSON.stringify({ content: text }));
    input.value = '';
    this._disableInput();
    this._currentMsgEl = null;
  },

  _enableInput()  { $('chat-in').disabled = false; $('btn-send').disabled = false; $('chat-in').focus(); },
  _disableInput() { $('chat-in').disabled = true;  $('btn-send').disabled = true; },

});
