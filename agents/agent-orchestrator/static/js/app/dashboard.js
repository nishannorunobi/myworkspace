// ── Dashboard — thin coordinator; wires all objects together ──────────────────
class Dashboard {
  constructor() {
    this.sound   = new SoundSystem();
    this.alerts  = new AlertSystem(this.sound);
    this.stream  = new EventStream();
    this.store   = new AgentStore();
    this.spinner = new SpinnerButton(this.sound);
    this.notify  = new DashNotifications(this.sound);

    // ── Panels ────────────────────────────────────────────────────────────────
    this.panels = {
      chat:        new ChatPanel(),
      logs:        new LogPanel(),
      dockerspace: new DockerscriptPanel(),
      initspace:   new InitspacePanel(),
      projectsh:   new ProjectShPanel(),
      containers:  new ContainersPanel(this.spinner),
      controls:    new ControlsPanel(this.spinner),
      settings:    new SettingsPanel(this.alerts),
    };

    // Nav needs panels; subagents need a later reference — inject after nav
    this.nav = new NavController(this.panels);
    this.panels.subagents = new SubAgentsPanel(this.nav);
    this.nav.panels       = this.panels;

    this.services = new ServicesView();
    this.grid     = new AgentGrid(this.store, agentId => this.nav.openDetail(agentId));

    this.nav.store = this.store;
    this.nav.grid  = this.grid;
    this.panels.settings._sound = this.sound;

    this.actions = new AgentActions(this.store, this.spinner, {
      onStarted: agentId => {
        if (agentId === 'workspace') {
          this.nav.switchTab('logs');
          this.panels.logs.connect(agentId);
        }
      },
      refresh: () => {
        const id = this.nav.selectedId();
        this.grid.render(id); this.grid.updateSidebar(id); this.grid.updateStats();
        if (id) {
          this.nav.updateDetailHeader(this.store.get(id));
          this.panels.chat.connect(id);
          if (this.nav._currentTab === 'logs') this.panels.logs.connect(id);
        }
      },
    });

    this.streamCtrl = new StreamController(this.stream, this.store, this.sound, {
      onAgentChange: () => {
        const id = this.nav.selectedId();
        this.grid.render(id); this.grid.updateSidebar(id); this.grid.updateStats();
        if (id) this.nav.updateDetailHeader(this.store.get(id));
      },
      onWorkspaceChange: data => this.notify.addChange(data),
      onAlert:           data => this.alerts.handle(data),
      onIntervention:    data => this.notify.showIntervention(data),
      onToast:           data => this.notify.showToast(data.message, data.cls, data.origin),
      onMonitorChange:   on   => this.notify.setMonitorBadge(on),
    });
  }

  async init() {
    window._dash = this;
    this._loadTheme();
    await this.alerts.loadSettings();
    this.streamCtrl.connect();
    await this.store.load();
    this.grid.render(null); this.grid.updateStats();
    this._bindUI();
  }

  // ── Theme ─────────────────────────────────────────────────────────────────

  _loadTheme() { this._applyTheme(localStorage.getItem('dash-theme') || 'dark'); }

  setTheme(theme) { localStorage.setItem('dash-theme', theme); this._applyTheme(theme); }

  _applyTheme(theme) {
    document.body.dataset.theme = theme;
    $('theme-dark')?.classList.toggle('active',  theme === 'dark');
    $('theme-light')?.classList.toggle('active', theme === 'light');
  }

  // ── UI bindings ────────────────────────────────────────────────────────────

  _bindUI() {
    $('chat-in')?.addEventListener('keydown', e => { if (e.key === 'Enter') this.panels.chat.sendMsg(); });
    $('s-volume')?.addEventListener('input', () => {
      const v = $('s-volume'); if (v) $('s-vol-val').textContent = v.value + '%';
    });
    const CLICK_SEL = 'button,a,.tab,.vbtn,.sidebar-item,.change-bar-hdr,.svc-row,.agent-card,.sub-agent-card,select,input[type=checkbox],input[type=range]';
    document.addEventListener('click', e => { if (e.target.closest(CLICK_SEL)) this.sound.click(); }, true);
  }

  // ── Public API — all methods called by inline HTML handlers ───────────────

  showGrid()        { this.nav.showGrid(); }
  showServices()    { this.services.show(() => { this.panels.chat.disconnect(); this.panels.logs.disconnect(); }); }
  refreshServices() { this.services.refresh(); }
  switchTab(name)   { this.nav.switchTab(name); }

  startAgent()      { this.actions.start(this.nav.selectedId(), $('btn-start')); }
  stopAgent()       { this.actions.stop(this.nav.selectedId(),  $('btn-stop')); }
  cleanBuildAgent() { this.actions.cleanBuild(this.nav.selectedId(), $('btn-clean-build')); }
  uploadAgent()     { this.actions.upload(this.nav.selectedId(), $('btn-upload')); }
  stopAllAgents()   { this.actions.stopAll($('btn-stop-all')); }

  openSettings()    { this.panels.settings.open(); }
  closeSettings()   { this.panels.settings.close(); }
  saveSettings()    { this.panels.settings.save(); }
  testAlert(type)   { this.panels.settings.testAlert(type); }

  _loadDockerscripts()  { this.panels.dockerspace.load(); }
  _dsRun(path, label)   { this.panels.dockerspace.run(path, label); }
  _dsKill()             { this.panels.dockerspace.kill(); }
  _dsCloseLog()         { this.panels.dockerspace.closeLog(); }

  _loadInitscripts()    { this.panels.initspace.load(); }
  _isRun(path, label)   { this.panels.initspace.run(path, label); }
  _isKill()             { this.panels.initspace.kill(); }
  _isCloseLog()         { this.panels.initspace.closeLog(); }

  _loadProjectsh()      { this.panels.projectsh.load(); }
  _pshRun(path, label)  { this.panels.projectsh.run(path, label); }
  _pshKill()            { this.panels.projectsh.kill(); }
  _pshCloseLog()        { this.panels.projectsh.closeLog(); }

  refreshContainers()   { this.panels.containers.refresh(); }
  _containerAction(agentId, name, act, btn) { this.panels.containers.action(agentId, name, act, btn); }

  _loadControls(id)     { this.panels.controls.load(id); }
  _controlAction(agentId, path, btn) { this.panels.controls.doAction(agentId, path, btn); }

  toggleChanges()       { this.notify.toggleChanges(); }

  _copySvcUrl(btn, url) { this.services.copyUrl(btn, url); }

  _openSubAgent(parentId, subId) { this.nav.openSubAgent(parentId, subId); }

  sendMsg() { this.panels.chat.sendMsg(); }
}

window.Dashboard = Dashboard;
