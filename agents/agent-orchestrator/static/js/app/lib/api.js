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

  git: {
    repos:   ()                 => API._get('/api/git/repos'),
    status:  repo               => API._get('/api/git/status' + (repo ? `?repo=${encodeURIComponent(repo)}` : '')),
    addAll:  repo               => API._post('/api/git/add-all', { repo }),
    commit:  (msg, files, repo) => API._post('/api/git/commit', { message: msg, files, repo }),
    push:    repo               => API._post('/api/git/push', { repo }),
    pull:    repo               => API._post('/api/git/pull', { repo }),
  },

  projects: {
    list:    ()                 => fetch('/api/workspace/projects').then(r => r.json()),
    start:   name               => fetch(`/api/workspace/projects/${name}/start`, { method: 'POST' }).then(r => r.json()),
    stop:    name               => fetch(`/api/workspace/projects/${name}/stop`,  { method: 'POST' }).then(r => r.json()),
    health:  name               => fetch(`/api/workspace/projects/${name}/health`,{ method: 'POST' }).then(r => r.json()),
    logUrl:  name               => `/api/workspace/projects/${name}/log`,
    dockerLogsUrl: name         => `/api/workspace/projects/${name}/docker-logs`,
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

  console: {
    cwdList: ()                 => fetch('/api/console/cwd-list').then(r => r.json()),
    exec:    (cmd, cwd)         => API._post('/api/console/exec', { command: cmd, cwd }),
  },

  claudecode: {
    stream:  ()                 => '/api/claude-code/stream',
    history: (limit, afterId)   => API._get(`/api/claude-code/history?limit=${limit}&after_id=${afterId}`),
  },

  memory: {
    list:    agentId            => API._get(`/api/agents/${agentId}/memory`),
    file:    (agentId, name)    => API._get(`/api/agents/${agentId}/memory/${encodeURIComponent(name)}`),
  },

  dockerspace: {
    scripts: ()                 => fetch('/api/dockerspace/scripts').then(r => r.json()),
    run:     absPath            => '/api/dockerspace/run',   // POST with { script: absPath }
    kill:    ()                 => fetch('/api/dockerspace/kill', { method: 'POST' }),
  },

  workspace: {
    pulse:   ()                 => fetch('/api/agents/workspace/memory/today.json').then(r => r.json()),
    todos:   {
      complete: id              => fetch(`/api/agents/workspace/todos/${id}/complete`, { method: 'POST' }).then(r => r.json()),
    },
  },

  alerts: {
    test:    type               => fetch(`/api/alerts/test/${type}`, { method: 'POST' }),
  },
};

window.API = API;
