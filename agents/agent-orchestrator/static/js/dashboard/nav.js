Object.assign(Dashboard.prototype, {

  showGrid() {
    if (this._parentAgent) {
      // navigating back from a sub-agent → go to parent's detail
      const parentId = this._parentAgent;
      this._parentAgent = null;
      this.openDetail(parentId);
      return;
    }
    this._view = 'grid';
    $('grid-view').classList.remove('hidden');
    $('detail-view').classList.add('hidden');
    $('services-view')?.classList.add('hidden');
    document.querySelectorAll('.vbtn').forEach(b => b.classList.toggle('active', b.dataset.view === 'grid'));
    this._selected = null;
    const pulse = $('ws-pulse'); if (pulse) pulse.style.display = 'none';
    if (this._pulseTimer) { clearInterval(this._pulseTimer); this._pulseTimer = null; }
    this._renderGrid();
    this._updateSidebar();
    this._disconnectChat();
    this._disconnectLogs();
    this._disconnectCc();
  },

  openDetail(agentId) {
    // Disconnect live streams from previous agent before switching
    this._disconnectLogs();
    this._disconnectCc();
    this._selected = agentId;
    this._view = 'detail';
    $('grid-view').classList.add('hidden');
    $('detail-view').classList.remove('hidden');
    document.querySelectorAll('.vbtn').forEach(b => b.classList.toggle('active', b.dataset.view === 'detail'));
    this._renderGrid();       // update card selection highlight
    this._updateSidebar();

    const agent = this._agents.find(a => a.id === agentId);
    if (!agent) return;
    this._updateDetailHeader(agent);

    // Show/hide tabs based on agent capabilities
    const isHttp = agent.connector === 'http';
    const hasSubs = agent.sub_agents && agent.sub_agents.length > 0;

    const isSubAgent = agent.hidden && isHttp;
    const tabControls = $('tab-controls');
    if (tabControls) tabControls.style.display = isSubAgent ? '' : 'none';

    const tabContainers = $('tab-containers');
    if (tabContainers) tabContainers.style.display = hasSubs ? '' : 'none';

    const tabAgents = $('tab-agents');
    if (tabAgents) tabAgents.style.display = hasSubs ? '' : 'none';

    const tabDocs = $('tab-apidocs');
    if (tabDocs) tabDocs.style.display = isHttp && !isSubAgent ? '' : 'none';

    const isWorkspace = agentId === 'workspace';
    const tabToday = $('tab-today');
    if (tabToday)   tabToday.style.display   = isWorkspace ? '' : 'none';
    const tabGit  = $('tab-git');
    if (tabGit)     tabGit.style.display     = isWorkspace ? '' : 'none';
    const tabCon  = $('tab-console');
    if (tabCon)     tabCon.style.display     = isWorkspace ? '' : 'none';
    const tabCC   = $('tab-claudecode');
    if (tabCC)      tabCC.style.display      = isWorkspace ? '' : 'none';
    const tabProj = $('tab-projects');
    if (tabProj)    tabProj.style.display    = isWorkspace ? '' : 'none';
    const tabDs = $('tab-dockerspace');
    if (tabDs)      tabDs.style.display      = isWorkspace ? '' : 'none';

    // Clear iframe when switching agents
    const frame = document.getElementById('apidocs-frame');
    if (frame) frame.src = '';
    this._currentDocsUrl = isHttp && agent.api_url
      ? agent.api_url.replace(/\/$/, '') + '/docs'
      : null;

    // Update back button — show breadcrumb when navigating from a parent agent
    const backBtn = document.querySelector('.btn-back');
    if (backBtn) {
      if (this._parentAgent) {
        const parent = this._agents.find(a => a.id === this._parentAgent);
        backBtn.textContent = `← ${parent ? parent.name : 'Back'}`;
      } else {
        backBtn.textContent = '← Grid';
      }
    }

    if (agentId === 'workspace') {
      this.switchTab('today');
      this._loadToday();
      this._loadPulse();
      if (this._pulseTimer) clearInterval(this._pulseTimer);
      this._pulseTimer = setInterval(() => this._loadPulse(), 30000);
    } else if (isSubAgent) {
      this.switchTab('controls');
      if (this._pulseTimer) { clearInterval(this._pulseTimer); this._pulseTimer = null; }
    } else {
      this.switchTab('chat');
      if (this._pulseTimer) { clearInterval(this._pulseTimer); this._pulseTimer = null; }
    }
    this._resetChat();
    this._connectChat(agentId);
    this._connectLogs(agentId);
    this._loadMemory(agentId);
  },

  _updateDetailHeader(agent) {
    if (!agent) agent = this._agents.find(a => a.id === this._selected);
    if (!agent) return;
    $('detail-dot').className   = `dot lg ${agent.status}`;
    $('detail-name').textContent = agent.name;
    $('detail-sub').textContent  = `${agent.status} · uptime: ${agent.uptime}`;
    $('btn-start').disabled = agent.status === 'running';
    $('btn-stop').disabled  = agent.status !== 'running';
  },

  switchTab(name) {
    this._currentTab = name;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === `pane-${name}`));
    if (name === 'controls'   && this._selected) this._loadControls(this._selected);
    if (name === 'containers' && this._selected) this._loadContainers(this._selected);
    if (name === 'agents'    && this._selected) this._loadSubAgents(this._selected);
    if (name === 'today'     && this._selected) this._loadToday();
    if (name === 'git')        this._gitLoadRepos();
    if (name === 'console')    this._consoleInit();
    if (name === 'claudecode') { this._ccInit(); setTimeout(() => this._ccScrollBottom(), 300); }
    if (name === 'projects')   this._loadProjects();
    if (name === 'dockerspace') this._loadDockerscripts();
    if (name === 'apidocs') {
      const frame = document.getElementById('apidocs-frame');
      if (frame && this._currentDocsUrl && !frame.src.endsWith('/docs')) {
        frame.src = this._currentDocsUrl;
      }
    }
  },

});
