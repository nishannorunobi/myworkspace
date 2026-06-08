// ── NavController — view transitions and tab switching ────────────────────────
class NavController {
  constructor(panels) {
    this.panels          = panels;
    this.store           = null;  // set by Dashboard after construction
    this.grid            = null;  // set by Dashboard after construction
    this._selectedId     = null;
    this._parentId       = null;
    this._view           = 'grid';
    this._currentTab     = 'chat';
    this._currentDocsUrl = null;
  }

  selectedId() { return this._selectedId; }

  // ── Grid view ─────────────────────────────────────────────────────────────

  showGrid() {
    if (this._parentId) {
      const parentId = this._parentId;
      this._parentId = null;
      this.openDetail(parentId);
      return;
    }
    this._view       = 'grid';
    this._selectedId = null;
    $('grid-view').classList.remove('hidden');
    $('detail-view').classList.add('hidden');
    $('services-view')?.classList.add('hidden');
    document.querySelectorAll('.vbtn').forEach(b =>
      b.classList.toggle('active', b.dataset.view === 'grid')
    );
    const pulse = $('ws-pulse');
    if (pulse) pulse.style.display = 'none';
    this.panels.today?.stopPulse?.();
    this.grid.render(null);
    this.grid.updateSidebar(null);
    this.grid.updateStats();
    this.panels.chat.disconnect();
    this.panels.logs.disconnect();
    this.panels.claudecode?.disconnect?.();
  }

  // ── Detail view ───────────────────────────────────────────────────────────

  openDetail(agentId) {
    this.panels.logs.disconnect();
    this.panels.claudecode?.disconnect?.();

    this._selectedId = agentId;
    this._view       = 'detail';
    $('grid-view').classList.add('hidden');
    $('detail-view').classList.remove('hidden');
    $('services-view')?.classList.add('hidden');
    document.querySelectorAll('.vbtn').forEach(b =>
      b.classList.toggle('active', b.dataset.view === 'detail')
    );

    this.grid.render(agentId);
    this.grid.updateSidebar(agentId);

    const agent = this.store.get(agentId);
    if (!agent) return;
    this.updateDetailHeader(agent);
    this._configTabs(agent, agentId);

    const frame = document.getElementById('apidocs-frame');
    if (frame) frame.src = '';
    const isHttp         = agent.connector === 'http';
    this._currentDocsUrl = isHttp && agent.api_url
      ? agent.api_url.replace(/\/$/, '') + '/docs'
      : null;

    // Back button label
    const backBtn = document.querySelector('.btn-back');
    if (backBtn) {
      backBtn.textContent = this._parentId
        ? `← ${this.store.get(this._parentId)?.name || 'Back'}`
        : '← Grid';
    }

    // Connect streams
    this.panels.chat.reset();
    this.panels.chat.connect(agentId);
    this.panels.logs.connect(agentId);
    this.panels.memory.load(agentId);

    // Reload memory after agent responds
    this.panels.chat.onDone = () => this.panels.memory.load(agentId);

    // Pick default tab
    const isSubAgent = agent.hidden && isHttp;
    if (agentId === 'workspace') {
      this.switchTab('today');
      this.panels.today.load();
      this.panels.today.startPulse();
    } else if (isSubAgent) {
      this.panels.today?.stopPulse?.();
      this.panels.controls._agentId = agentId;
      this.switchTab('controls');
    } else {
      this.panels.today?.stopPulse?.();
      this.switchTab('chat');
    }
  }

  openSubAgent(parentId, subAgentId) {
    this._parentId = parentId;
    this.openDetail(subAgentId);
  }

  // ── Detail header ─────────────────────────────────────────────────────────

  updateDetailHeader(agent) {
    if (!agent) agent = this.store?.get(this._selectedId);
    if (!agent) return;
    $('detail-dot').className    = `dot lg ${agent.status}`;
    $('detail-name').textContent = agent.name;
    $('detail-sub').textContent  = `${agent.status} · uptime: ${agent.uptime}`;
    $('btn-start').disabled      = agent.status === 'running';
    $('btn-stop').disabled       = agent.status !== 'running';
  }

  // ── Tab visibility ────────────────────────────────────────────────────────

  _configTabs(agent, agentId) {
    const isHttp      = agent.connector === 'http';
    const hasSubs     = agent.sub_agents && agent.sub_agents.length > 0;
    const isSubAgent  = agent.hidden && isHttp;
    const isWorkspace = agentId === 'workspace';

    const show = (id, visible) => {
      const el = $(id); if (el) el.style.display = visible ? '' : 'none';
    };

    show('tab-controls',    isSubAgent);
    show('tab-containers',  hasSubs);
    show('tab-agents',      hasSubs);
    show('tab-apidocs',     isHttp && !isSubAgent);
    show('tab-today',       isWorkspace);
    show('tab-git',         isWorkspace);
    show('tab-console',     isWorkspace);
    show('tab-claudecode',  isWorkspace);
    show('tab-projects',    isWorkspace);
    show('tab-dockerspace', isWorkspace);
  }

  // ── Tab switching ─────────────────────────────────────────────────────────

  switchTab(name) {
    this._currentTab = name;
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === name)
    );
    document.querySelectorAll('.pane').forEach(p =>
      p.classList.toggle('active', p.id === `pane-${name}`)
    );

    const id = this._selectedId;
    if (name === 'controls'   && id) { this.panels.controls._agentId = id; this.panels.controls.load(id); }
    if (name === 'containers' && id) { this.panels.containers._agentId = id; this.panels.containers.load(id); }
    if (name === 'agents'     && id) this.panels.subagents.load(id);
    if (name === 'today'      && id) this.panels.today.load();
    if (name === 'git')              this.panels.git._loadRepos();
    if (name === 'console')          this.panels.console._init();
    if (name === 'claudecode')       {
      this.panels.claudecode._connect();
      setTimeout(() => this.panels.claudecode._scrollBottom(), 300);
    }
    if (name === 'projects')         this.panels.projects.load();
    if (name === 'dockerspace')      this.panels.dockerspace.load();
    if (name === 'apidocs') {
      const frame = document.getElementById('apidocs-frame');
      if (frame && this._currentDocsUrl && !frame.src.endsWith('/docs')) {
        frame.src = this._currentDocsUrl;
      }
    }
  }
}

window.NavController = NavController;
