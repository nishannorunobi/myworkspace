// ── AgentStore — single source of truth for agent list ───────────────────────
class AgentStore {
  #agents    = [];
  #listeners = {};

  on(event, fn) {
    (this.#listeners[event] ??= []).push(fn);
    return this;
  }

  emit(event, data) {
    (this.#listeners[event] || []).forEach(fn => fn(data));
  }

  async load() {
    const d = await API.agents.list().catch(() => ({ agents: [] }));
    this.#agents = d.agents || [];
    this.emit('change', this.#agents);
    return this.#agents;
  }

  getAll()  { return this.#agents; }
  get(id)   { return this.#agents.find(a => a.id === id); }
  visible() { return this.#agents.filter(a => !a.hidden); }
  running() { return this.#agents.filter(a => a.status === 'running'); }

  /** Patch a single agent's status in-place without a full reload. */
  patch(agentId, changes) {
    this.#agents = this.#agents.map(a =>
      a.id === agentId ? { ...a, ...changes } : a
    );
    this.emit('change', this.#agents);
  }
}

window.AgentStore = AgentStore;
