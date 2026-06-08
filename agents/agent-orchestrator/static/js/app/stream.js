// ── StreamController — wraps EventStream and fires domain callbacks ────────────
class StreamController {
  constructor(stream, store, sound, callbacks = {}) {
    this.stream = stream;
    this.store  = store;
    this.sound  = sound;
    this.on     = callbacks;   // { onAgentChange, onWorkspaceChange, onIntervention, onToast, onMonitorChange }
  }

  connect() {
    const s = this.stream;

    s.on('_connected',    () => this.on.onMonitorChange?.(true));
    s.on('_disconnected', () => this.on.onMonitorChange?.(false));

    s.on('init', data => {
      // initial snapshot — store already populated via load(), just re-render
      this.on.onAgentChange?.();
    });

    s.on('status_change', data => {
      this.store.patch(data.agent_id, { status: data.status });
      this.on.onAgentChange?.();
    });

    s.on('alert', data => {
      this.on.onAlert?.(data);
    });

    s.on('workspace_change', data => {
      this.on.onWorkspaceChange?.(data);
    });

    s.on('agent_event', data => {
      this._handleAgentEvent(data);
    });

    s.connect();
  }

  // ── Agent event → toast / intervention ───────────────────────────────────

  _handleAgentEvent(data) {
    const event    = data.event   || '';
    const source   = data.source  || 'agent';
    const payload  = data.data    || {};

    if (event === 'user_intervention_required') {
      this.on.onIntervention?.({
        message: payload.message || 'User action required',
        source,
        details: payload,
      });
      return;
    }

    const styleMap = {
      service_started:       { cls: 'info',    label: 'Service started' },
      service_stopped:       { cls: 'warning', label: 'Service stopped' },
      install_error:         { cls: 'error',   label: 'Install error' },
      auto_resolve_complete: { cls: 'info',    label: 'Auto-fixed' },
      auto_resolve_failed:   { cls: 'warning', label: 'Auto-fix failed' },
      task_complete:         { cls: 'info',    label: 'Task complete' },
      status_update:         { cls: 'info',    label: 'Status' },
    };
    const style  = styleMap[event] || { cls: 'info', label: event };
    const detail = payload.summary || payload.label || payload.service || payload.error || '';
    const msg    = detail ? `${style.label}: ${detail}` : style.label;

    this.on.onToast?.({ message: msg, cls: style.cls, origin: source || data.container });
  }
}

window.StreamController = StreamController;
