// ── API namespace — all fetch calls live here ─────────────────────────────────
const API = {
  _get:  url         => fetch(url).then(r => r.json()),
  _post: (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json()),

  agents: {
    list:     ()                => API._get('/api/agents'),
    start:    id                => API._post(`/api/agents/${id}/start`),
    stop:     id                => API._post(`/api/agents/${id}/stop`),
    cleanBuild: id              => API._post(`/api/agents/${id}/clean-build`),
    upload:     id              => API._post(`/api/agents/${id}/upload`),
    stopAll:  ()                => API._post('/api/agents/stop-all'),
    logsUrl:  id                => `/api/agents/${id}/logs`,
    subagents: id               => API._get(`/api/agents/${id}/sub-agents`),
    memory:   id                => API._get(`/api/agents/${id}/memory`),
    health:         id          => API._get(`/api/agents/${id}/health`),
    refreshStatus:  id          => API._post(`/api/agents/${id}/refresh-status`),
  },

  containers: {
    list:   agentId             => API._get(`/api/agents/${agentId}/containers`),
    action: (agentId, name, act) =>
      fetch(`/api/agents/${agentId}/containers/${encodeURIComponent(name)}/${act}`, { method: 'POST' }).then(r => r.json()),
  },

  controls: {
    health:  agentId            => API._get(`/api/agents/${agentId}/health`),
    services: agentId           => API._get(`/api/agents/${agentId}/services`),
    action:  (agentId, path)    => API._post(`/api/agents/${agentId}/action/${path}`),
  },

  services: {
    list:    ()                 => API._get('/api/services'),
  },

  dockerspace: {
    scripts: ()                 => fetch('/api/dockerspace/scripts').then(r => r.json()),
    run:     absPath            => '/api/dockerspace/run',   // POST with { script: absPath }
    kill:    ()                 => fetch('/api/dockerspace/kill', { method: 'POST' }),
  },

  alerts: {
    test:    type               => fetch(`/api/alerts/test/${type}`, { method: 'POST' }),
  },
};

window.API = API;
