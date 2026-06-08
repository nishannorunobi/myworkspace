Object.assign(Dashboard.prototype, {

  _renderToday(d) {
    const ts     = d.generated_at ? `<span class="today-ts">Updated ${esc(d.generated_at)}</span>` : '';
    const stats  = d.scan_stats   ? `${d.scan_stats.files} files · ${d.scan_stats.dirs} dirs · ${d.file_counts?.history_events||d.scan_stats.history_events||0} changes logged` : '';

    // Todos
    const todos  = (d.todos || []);
    const prioIcon = p => p === 'urgent' ? '🔴' : p === 'high' ? '🟠' : p === 'normal' ? '🟡' : '⚪';
    const todoRows = todos.length
      ? todos.map(t => `<div class="today-todo-item" id="todo-row-${t.id}">
          <span class="today-todo-prio">${prioIcon(t.priority)}</span>
          <span class="today-todo-text">${esc(t.text)}</span>
          <span class="today-todo-meta">#${t.id} · ${esc(t.source||'manual')} · ${esc((t.created_at||'').slice(0,10))}</span>
          <button class="today-todo-done" onclick="window._dash._completeTodo(${t.id})" title="Mark done">✓</button>
        </div>`).join('')
      : '<div class="today-empty">No open tasks — you\'re clear ✓</div>';

    // Todo priority breakdown bar
    const prioCounts = {urgent:0, high:0, normal:0, low:0};
    todos.forEach(t => { const k = t.priority||'low'; prioCounts[k] = (prioCounts[k]||0)+1; });
    const prioTotal = todos.length || 1;
    const prioSeg = (n, clr) => n ? `<div class="today-prio-seg" style="width:${(n/prioTotal*100).toFixed(1)}%;background:${clr}"></div>` : '';
    const prioLbl = (n, clr, t) => n ? `<span style="color:${clr}">● ${n} ${t}</span>` : '';
    const prioBar = todos.length ? `
      <div class="today-prio-bar">
        ${prioSeg(prioCounts.urgent,'#f85149')}${prioSeg(prioCounts.high,'#d29922')}${prioSeg(prioCounts.normal,'#58a6ff')}${prioSeg(prioCounts.low,'#3fb950')}
      </div>
      <div class="today-prio-legend">
        ${prioLbl(prioCounts.urgent,'#f85149','urgent')}${prioLbl(prioCounts.high,'#d29922','high')}${prioLbl(prioCounts.normal,'#58a6ff','normal')}${prioLbl(prioCounts.low,'#3fb950','low')}
      </div>` : '';

    // Activity sparkline — group all changes by hour
    const allChanges  = (d.recent_changes || []);
    const hrBuckets   = new Array(24).fill(0);
    allChanges.forEach(c => {
      const h = parseInt((c.timestamp||'').slice(11,13)||'0', 10);
      if (!isNaN(h) && h >= 0 && h < 24) hrBuckets[h]++;
    });
    const maxH    = Math.max(...hrBuckets, 1);
    const svgW    = 280, svgH = 24, bw = svgW / 24 - 1;
    const sparkBars = hrBuckets.map((v, i) => {
      const bh   = v > 0 ? Math.max((v / maxH) * (svgH - 2), 3) : 1;
      const x    = (i * svgW / 24).toFixed(1);
      const y    = (svgH - bh).toFixed(1);
      const fill = v > 0 ? '#58a6ff' : '#21262d';
      return `<rect x="${x}" y="${y}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${fill}" rx="1"/>`;
    }).join('');
    const nowH    = new Date().getHours();
    const sparkline = `
      <div class="today-spark-wrap">
        <div class="today-spark-lbl"><span>File activity by hour (0h–23h)</span><span>now: ${nowH}h · ${allChanges.length} events</span></div>
        <svg class="today-spark" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${sparkBars}</svg>
      </div>`;

    // Recent changes (list, last 10)
    const changes = allChanges.slice(0, 10);
    const changeRows = changes.length
      ? changes.map(c => `<div class="today-change-item">
          <span class="today-change-ev ${esc(c.event)}">${esc(c.event)}</span>
          <span class="today-change-path">${esc(c.path)}</span>
          <span class="today-change-ts">${esc((c.timestamp||'').slice(11,16))}</span>
        </div>`).join('')
      : '<div class="today-empty">No recent changes</div>';

    // Git repos (dynamically discovered from projectspace)
    const gitRepos  = (d.git_repos || []);

    // Templates / projects
    const templates = (d.templates || []);
    const projRows  = (gitRepos.length || templates.length)
      ? [
          ...gitRepos.map(r => {
            let badges = '';
            if (r.changed)     badges += `<span class="today-git-badge today-git-changed">${r.changed} changed</span>`;
            if (r.ahead  > 0)  badges += `<span class="today-git-badge today-git-ahead">↑${r.ahead} to push</span>`;
            if (r.behind > 0)  badges += `<span class="today-git-badge today-git-behind">↓${r.behind} to pull</span>`;
            if (!r.has_remote) badges += `<span class="today-git-badge today-git-noremote">no remote</span>`;
            return `<div class="today-proj-item">
              <span class="today-proj-type git-repo-badge">git</span>
              <span class="today-proj-path">${esc(r.name)}</span>
              <span class="today-proj-branch">[${esc(r.branch)}]</span>
              ${badges}
              <button class="today-proj-open git-btn" style="font-size:9px;padding:1px 5px" onclick="window._dash._gitJumpTo('${esc(r.path)}')">Open</button>
            </div>`;
          }),
          ...templates.map(t => `<div class="today-proj-item">
            <span class="today-proj-type">${esc(t.project_type)}</span>
            <span class="today-proj-path">${esc(t.root_path)}</span>
          </div>`),
        ].join('')
      : '<div class="today-empty">No projects detected</div>';

    // Knowledge
    const knowledge = (d.recent_knowledge || []).slice(0, 5);
    const knowRows  = knowledge.length
      ? knowledge.map(k => `<div class="today-know-item">
          <span class="today-know-cat">${esc(k.category)}</span>
          <span class="today-know-title">${esc(k.title)}</span>
        </div>`).join('')
      : '<div class="today-empty">No knowledge entries yet — ask the agent to save observations</div>';

    // Prompt history
    const prompts   = (d.prompt_history || []);
    const promptRows = prompts.length
      ? prompts.map(p => `<div class="today-prompt-item">
          <span class="today-prompt-ts">${esc((p.timestamp||'').slice(0,16).replace('T',' '))}</span>
          <span class="today-prompt-text">${esc((p.prompt||'').slice(0,120))}</span>
        </div>`).join('')
      : '<div class="today-empty">No prompt history yet</div>';

    return `
      <div class="today-header">${ts}<span class="today-stats">${stats}</span></div>
      <div class="today-grid">
        <div class="today-section">
          <div class="today-section-title">📋 Open Tasks (${todos.length})</div>
          ${prioBar}
          <div class="today-section-body">${todoRows}</div>
        </div>
        <div class="today-section">
          <div class="today-section-title">📁 Active Projects (${templates.length})</div>
          <div class="today-section-body today-projs">${projRows}</div>
        </div>
        <div class="today-section today-wide">
          <div class="today-section-title">🕐 Recent Changes</div>
          ${sparkline}
          <div class="today-section-body">${changeRows}</div>
        </div>
        <div class="today-section">
          <div class="today-section-title">🧠 Knowledge Base</div>
          <div class="today-section-body">${knowRows}</div>
        </div>
        <div class="today-section">
          <div class="today-section-title">💬 Prompt History</div>
          <div class="today-section-body">${promptRows}</div>
        </div>
      </div>`;
  },

});
