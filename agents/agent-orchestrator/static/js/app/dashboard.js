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
      git:         new GitPanel(),
      claudecode:  new ClaudeCodePanel(),
      memory:      new MemoryPanel(),
      console:     new ConsolePanel(),
      projects:    new ProjectsPanel(this.spinner),
      dockerspace: new DockerscriptPanel(),
      containers:  new ContainersPanel(this.spinner),
      controls:    new ControlsPanel(this.spinner),
      settings:    new SettingsPanel(this.alerts),
    };

    // Nav needs panels; subagents/today need later references — inject after nav
    this.nav = new NavController(this.panels);
    this.panels.subagents = new SubAgentsPanel(this.nav);
    this.panels.today     = new TodayPanel(this.panels.git);
    this.nav.panels       = this.panels;

    this.services = new ServicesView();
    this.grid     = new AgentGrid(this.store, agentId => this.nav.openDetail(agentId));

    this.nav.store = this.store;
    this.nav.grid  = this.grid;

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
        if (id) { this.nav.updateDetailHeader(this.store.get(id)); this.panels.chat.connect(id); }
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
    const CLICK_SEL = 'button,a,.tab,.vbtn,.sidebar-item,.mem-item,.git-file-row,.change-bar-hdr,.svc-row,.agent-card,.sub-agent-card,.cc-entry,.today-item,select,input[type=checkbox],input[type=range]';
    document.addEventListener('click', e => { if (e.target.closest(CLICK_SEL)) this.sound.click(); }, true);
  }

  // ── Public API — all methods called by inline HTML handlers ───────────────

  showGrid()        { this.nav.showGrid(); }
  showServices()    { this.services.show(() => { this.panels.chat.disconnect(); this.panels.logs.disconnect(); }); }
  refreshServices() { this.services.refresh(); }
  switchTab(name)   { this.nav.switchTab(name); }

  startAgent()      { this.actions.start(this.nav.selectedId(), $('btn-start')); }
  stopAgent()       { this.actions.stop(this.nav.selectedId(),  $('btn-stop')); }
  stopAllAgents()   { this.actions.stopAll($('btn-stop-all')); }

  openSettings()    { this.panels.settings.open(); }
  closeSettings()   { this.panels.settings.close(); }
  saveSettings()    { this.panels.settings.save(); }
  testAlert(type)   { this.panels.settings.testAlert(type); }

  _refreshPulse()   { this.panels.today.refresh(); }
  _completeTodo(id) { this.panels.today.completeTodo(id); }

  _gitRefresh()     { this.panels.git.refresh(); }
  _gitAddAll()      { this.panels.git.addAll(); }
  _gitPush()        { this.panels.git.push(); }
  _gitPull()        { this.panels.git.pull(); }
  _gitCommit()      { this.panels.git.commit(); }
  _gitJumpTo(path)  { this.panels.git.jumpTo(path); this.nav.switchTab('git'); }

  _consoleRun()     { this.panels.console.run(); }
  _consoleClear()   { this.panels.console.clear(); }

  _ccScrollBottom() { this.panels.claudecode.scrollBottom(); }
  _ccClear()        { this.panels.claudecode.clearView(); }

  _loadProjects()       { this.panels.projects.load(); }
  _projectStart(name)   { this.panels.projects.start(name); }
  _projectStop(name)    { this.panels.projects.stop(name); }
  _projectHealth(name)  { this.panels.projects.health(name); }
  _projectLogs(name)    { this.panels.projects.showLogs(name); }
  _projectCloseLog()    { this.panels.projects.closeLog(); }

  _loadDockerscripts()  { this.panels.dockerspace.load(); }
  _dsRun(path, label)   { this.panels.dockerspace.run(path, label); }
  _dsKill()             { this.panels.dockerspace.kill(); }
  _dsCloseLog()         { this.panels.dockerspace.closeLog(); }

  refreshContainers()   { this.panels.containers.refresh(); }
  _containerAction(agentId, name, act, btn) { this.panels.containers.action(agentId, name, act, btn); }

  _loadControls(id)     { this.panels.controls.load(id); }
  _controlAction(agentId, path, btn) { this.panels.controls.doAction(agentId, path, btn); }

  _loadMemory(id)       { this.panels.memory.load(id); }

  toggleChanges()       { this.notify.toggleChanges(); }

  _copySvcUrl(btn, url) { this.services.copyUrl(btn, url); }

  _openSubAgent(parentId, subId) { this.nav.openSubAgent(parentId, subId); }

  sendMsg() { this.panels.chat.sendMsg(); }
}

window.Dashboard = Dashboard;
