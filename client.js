/**
 * Team Radar — a browser module for the DeepSeek Harness Web client.
 *
 * It registers one header action on the conversation header. The action opens a
 * floating radar panel that reads the Lead Session's `agentTeam` Session
 * projection from the shared Session store: members are the radar nodes, shared
 * tasks are the progress board below the map. Nothing is stored or mutated by
 * this module; it is a read-only projection view.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-team-radar',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useEffect, useLayoutEffect, useRef, useState } = React;

    const NS = 'team-radar';

    const zh = {
      trigger: '团队雷达',
      title: '团队雷达',
      members: '成员',
      tasks: '任务',
      progress: '任务进度',
      lead: '主理人',
      running: '运行中',
      idle: '空闲',
      provisioning: '筹备中',
      failed: '失败',
      pending: '待办',
      inProgress: '进行中',
      completed: '已完成',
      blocked: '被依赖阻塞',
      ready: '可认领',
      owner: '负责人',
      noTeam: '当前会话还没有团队。让 Lead 创建队友后，这里会出现他们的雷达图。',
      noTasks: '还没有共享任务。',
      close: '关闭',
      open: '打开团队雷达',
    };

    const en = {
      trigger: 'Team radar',
      title: 'Team radar',
      members: 'members',
      tasks: 'tasks',
      progress: 'Task progress',
      lead: 'Lead',
      running: 'Running',
      idle: 'Idle',
      provisioning: 'Provisioning',
      failed: 'Failed',
      pending: 'Pending',
      inProgress: 'In progress',
      completed: 'Completed',
      blocked: 'Blocked by dependencies',
      ready: 'Ready',
      owner: 'Owner',
      noTeam: 'No team in this session yet. Ask the Lead to spawn teammates and their radar map appears here.',
      noTasks: 'No shared tasks yet.',
      close: 'Close',
      open: 'Open team radar',
    };

    const TASK_LABEL = {
      pending: 'pending',
      in_progress: 'inProgress',
      completed: 'completed',
      deleted: 'completed',
    };

    const CSS = `
.tr_root{display:inline-flex;align-items:center}
.tr_trigger{display:inline-flex;align-items:center;gap:5px;height:28px;padding:3px 7px;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary,#8b949e);font:inherit;font-size:12px;line-height:16px;cursor:pointer}
.tr_trigger:hover,.tr_trigger:focus-visible,.tr_triggerOpen{color:var(--dsw-alias-label-primary,#e6edf3)}
.tr_triggerLabel{white-space:nowrap}
.tr_count{font-variant-numeric:tabular-nums;font-size:11px;color:var(--dsw-alias-label-caption,#6e7681)}
.tr_panel{position:fixed;z-index:1000;display:flex;flex-direction:column;box-sizing:border-box;width:360px;max-width:calc(100vw - 24px);max-height:min(620px,82vh);padding:12px 14px 14px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:12px;background:var(--dsw-alias-bg-layer-2,#1b1f24);color:var(--dsw-alias-label-primary,#e6edf3);box-shadow:var(--dsw-elevation-prominent,0 16px 40px rgba(0,0,0,.45))}
.tr_panel::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#1b1f24));opacity:.96}
.tr_head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding-bottom:2px}
.tr_title{display:flex;flex-direction:column;gap:2px;min-width:0}
.tr_title strong{font-size:14px;font-weight:600;line-height:20px}
.tr_sub{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8b949e)}
.tr_close{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary,#8b949e);font-size:16px;line-height:1;cursor:pointer}
.tr_close:hover,.tr_close:focus-visible{color:var(--dsw-alias-label-primary,#e6edf3);background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.06))}
.tr_body{overflow-y:auto;min-height:0;margin-top:6px}
.tr_map{display:block;width:100%;height:auto;overflow:visible}
.tr_ring{fill:none;stroke:var(--dsw-alias-border-l2,rgba(255,255,255,.1));stroke-width:1;stroke-dasharray:3 5}
.tr_edge{stroke:var(--dsw-alias-border-l3,rgba(120,170,255,.45));stroke-width:1.2}
.tr_edgeLive{stroke:var(--dsw-alias-state-business-primary,#59a6ff);stroke-width:1.6;stroke-dasharray:4 4;animation:tr_flow 1.2s linear infinite}
.tr_nodeCore{fill:var(--dsw-alias-bg-layer-3,#262b31);stroke:var(--dsw-alias-border-l3,rgba(255,255,255,.2));stroke-width:1.5;transition:fill .2s,stroke .2s}
.tr_nodeRunning{fill:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4d8dff) 26%,var(--dsw-alias-bg-layer-3,#262b31));stroke:var(--dsw-alias-state-business-primary,#4d8dff)}
.tr_nodeFailed{fill:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ff5d5d) 24%,var(--dsw-alias-bg-layer-3,#262b31));stroke:var(--dsw-alias-state-error-primary,#ff5d5d)}
.tr_nodeProvisioning{fill:color-mix(in srgb,var(--dsw-alias-label-tertiary,#8b949e) 22%,var(--dsw-alias-bg-layer-3,#262b31));stroke:var(--dsw-alias-label-tertiary,#8b949e)}
.tr_nodeIdle{fill:var(--dsw-alias-bg-layer-3,#262b31);stroke:var(--dsw-alias-border-l3,rgba(255,255,255,.25))}
.tr_pulse{fill:none;stroke:var(--dsw-alias-state-business-primary,#4d8dff);stroke-width:1.5;opacity:0;transform-box:fill-box;transform-origin:center;animation:tr_pulse 2.2s ease-out infinite}
.tr_glyph{font-size:12px;font-weight:600;fill:var(--dsw-alias-label-primary,#e6edf3);pointer-events:none}
.tr_name{font-size:11px;font-weight:500;fill:var(--dsw-alias-label-primary,#e6edf3);pointer-events:none}
.tr_state{font-size:10px;fill:var(--dsw-alias-label-tertiary,#8b949e);pointer-events:none}
.tr_sweep{animation:tr_spin 7s linear infinite;transform-box:view-box}
.tr_sweepLine{stroke:var(--dsw-alias-state-business-primary,#4d8dff);stroke-width:2;stroke-linecap:round;opacity:.5}
.tr_progress{margin-top:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));border-radius:9px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.03))}
.tr_progressTop{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8b949e)}
.tr_progressValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#b9c1ca)}
.tr_bar{margin-top:7px;height:5px;border-radius:999px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.08));overflow:hidden}
.tr_barFill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--dsw-alias-state-business-primary,#4d8dff),#7b61ff);transition:width .3s ease}
.tr_section{margin-top:12px}
.tr_sectionTitle{margin:0 0 8px 2px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#b9c1ca)}
.tr_tasks{display:flex;flex-direction:column;gap:7px;margin:0;padding:0;list-style:none}
.tr_task{display:flex;gap:9px;padding:9px 11px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));border-radius:9px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.03))}
.tr_taskDot{flex:none;width:7px;height:7px;margin-top:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#8b949e)}
.tr_dot_pending{background:var(--dsw-alias-label-tertiary,#8b949e)}
.tr_dot_in_progress{background:var(--dsw-alias-state-business-primary,#4d8dff);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary,#4d8dff) 25%,transparent)}
.tr_dot_completed{background:var(--dsw-alias-state-success-primary,#3fca87)}
.tr_taskBody{min-width:0;flex:1}
.tr_taskSubject{font-size:12px;line-height:17px;color:var(--dsw-alias-label-primary,#e6edf3);word-break:break-word}
.tr_taskMeta{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:4px;font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary,#8b949e)}
.tr_taskMeta em{font-style:normal;color:var(--dsw-alias-state-warning-primary,#e3b341)}
.tr_empty{margin:14px 2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8b949e)}
.tr_failure{margin-top:10px;padding:9px 11px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#ff5d5d) 45%,transparent);border-radius:9px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary,#ff7b72)}
@keyframes tr_pulse{0%{opacity:.55;transform:scale(1)}70%{opacity:0;transform:scale(1.55)}100%{opacity:0;transform:scale(1.55)}}
@keyframes tr_spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes tr_flow{to{stroke-dashoffset:-16}}
@media (prefers-reduced-motion:reduce){.tr_pulse,.tr_sweep,.tr_edgeLive{animation:none}}
`;

    const STYLE_KEY = 'dsh-plugin-team-radar/radar.css';

    function injectStyles() {
      if (typeof document === 'undefined') return () => {};
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(STYLE_KEY) + ']')) return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-plugin-team-radar';
      tag.dataset.pluginCss = STYLE_KEY;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    function RadarGlyph({ size }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true, style: { display: 'block' } },
        h('circle', { cx: 8, cy: 8, r: 6.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1, opacity: 0.55 }),
        h('circle', { cx: 8, cy: 8, r: 3.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1, opacity: 0.55 }),
        h('path', { d: 'M8 8 L8 1.5 A6.5 6.5 0 0 1 14.5 8 Z', fill: 'currentColor', opacity: 0.25 }),
        h('circle', { cx: 11.6, cy: 5.2, r: 1.3, fill: 'currentColor' }),
        h('circle', { cx: 8, cy: 8, r: 1.2, fill: 'currentColor' })
      );
    }

    /** Resolve one member's live status from Session stores. */
    function useMemberStatus(member, useSessionStatus, useSessions) {
      const running = useSessionStatus((state) => state.get(member.id)?.running);
      const summaryRunning = useSessions((state) => state.byId[member.id]?.running);
      if (member.phase !== 'active') return member.phase;
      return (running ?? summaryRunning) === true ? 'running' : 'idle';
    }

    function RadarNode({ member, x, y, lead, useSessionStatus, useSessions, tasks, t }) {
      const status = useMemberStatus(member, useSessionStatus, useSessions);
      const name = member.role === 'lead' ? t('lead') : member.name || 'teammate';
      const initial = name.slice(0, 1).toUpperCase();
      const radius = lead ? 25 : 19;
      const owned = tasks.filter((task) => task.ownerName === member.name).length;
      const statusClass =
        status === 'running'
          ? 'tr_nodeRunning'
          : status === 'failed'
            ? 'tr_nodeFailed'
            : status === 'provisioning'
              ? 'tr_nodeProvisioning'
              : 'tr_nodeIdle';
      return h(
        'g',
        null,
        h('circle', { cx: x, cy: y, r: radius, className: 'tr_nodeCore ' + statusClass }),
        status === 'running' ? h('circle', { cx: x, cy: y, r: radius, className: 'tr_pulse' }) : null,
        h('text', { x: x, y: y + 4.5, textAnchor: 'middle', className: 'tr_glyph' }, initial),
        h('text', { x: x, y: y + radius + 15, textAnchor: 'middle', className: 'tr_name' }, name.length > 12 ? name.slice(0, 12) + '…' : name),
        h(
          'text',
          { x: x, y: y + radius + 28, textAnchor: 'middle', className: 'tr_state' },
          t(status) + (owned > 0 ? ' · ' + owned : '')
        )
      );
    }

    function RadarMap({ members, tasks, useSessionStatus, useSessions, t }) {
      const width = 332;
      const height = 236;
      const cx = width / 2;
      const cy = 102;
      const lead = members.find((member) => member.role === 'lead') ?? members[0];
      const others = members.filter((member) => member !== lead);
      const spread = Math.min(others.length, 8);
      const rx = Math.min(width / 2 - 54, 132);
      const ry = 82;
      const nodes = (spread === 0 ? [] : others.slice(0, spread)).map((member, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / spread;
        return { member, x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
      });
      return h(
        'svg',
        { className: 'tr_map', viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': t('title') },
        h('circle', { cx: cx, cy: cy, r: 66, className: 'tr_ring' }),
        h('circle', { cx: cx, cy: cy, r: 42, className: 'tr_ring' }),
        nodes.map((node) =>
          h('line', {
            key: 'edge-' + node.member.id,
            x1: cx,
            y1: cy,
            x2: node.x,
            y2: node.y,
            className: 'tr_edge',
          })
        ),
        h(
          'g',
          { className: 'tr_sweep', style: { transformOrigin: cx + 'px ' + cy + 'px' } },
          h('line', { x1: cx, y1: cy, x2: cx, y2: cy - 66, className: 'tr_sweepLine' })
        ),
        nodes.map((node) =>
          h(RadarNode, {
            key: node.member.id,
            member: node.member,
            x: node.x,
            y: node.y,
            lead: false,
            useSessionStatus,
            useSessions,
            tasks,
            t,
          })
        ),
        lead
          ? h(RadarNode, {
              key: 'lead',
              member: lead,
              x: cx,
              y: cy,
              lead: true,
              useSessionStatus,
              useSessions,
              tasks,
              t,
            })
          : null
      );
    }

    function TaskRow({ task, t }) {
      const meta = [t(TASK_LABEL[task.status] ?? 'pending')];
      if (task.ownerName !== undefined) meta.push(t('owner') + ': ' + task.ownerName);
      return h(
        'li',
        { className: 'tr_task' },
        h('span', { className: 'tr_taskDot tr_dot_' + (TASK_LABEL[task.status] ?? 'pending') }),
        h(
          'div',
          { className: 'tr_taskBody' },
          h('div', { className: 'tr_taskSubject' }, task.subject),
          h(
            'div',
            { className: 'tr_taskMeta' },
            meta.map((text, index) => h('span', { key: index }, text)),
            task.status === 'pending' && task.ready !== true ? h('em', null, t('blocked')) : null,
            task.status === 'pending' && task.ready === true ? h('span', null, t('ready')) : null
          )
        )
      );
    }

    function RadarPanel({ team, useSessions, useSessionStatus, t, onClose, anchorRef }) {
      const panelRef = useRef(null);
      const [position, setPosition] = useState(null);

      useLayoutEffect(() => {
        const panel = panelRef.current;
        const anchor = anchorRef.current;
        if (panel === null || anchor === null) return;
        const anchorRect = anchor.getBoundingClientRect();
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        const margin = 12;
        const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - width - margin));
        let top = anchorRect.bottom + 6;
        if (top + height > window.innerHeight - margin) top = Math.max(margin, anchorRect.top - height - 6);
        setPosition({ left: Math.round(left), top: Math.round(top) });
      }, []);

      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose();
        };
        const onPointerDown = (event) => {
          const panel = panelRef.current;
          const anchor = anchorRef.current;
          if (panel === null || anchor === null) return;
          if (panel.contains(event.target) || anchor.contains(event.target)) return;
          onClose();
        };
        const onResize = () => onClose();
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onPointerDown, true);
        window.addEventListener('resize', onResize);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('mousedown', onPointerDown, true);
          window.removeEventListener('resize', onResize);
        };
      }, [onClose, anchorRef]);

      const members = team.members ?? [];
      const tasks = (team.tasks ?? []).filter((task) => task.status !== 'deleted');
      const done = tasks.filter((task) => task.status === 'completed').length;
      const percent = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);

      return h(
        'div',
        {
          ref: panelRef,
          className: 'tr_panel',
          role: 'dialog',
          'aria-label': t('title'),
          style: {
            left: position === null ? 0 : position.left,
            top: position === null ? 0 : position.top,
            visibility: position === null ? 'hidden' : 'visible',
          },
        },
        h(
          'header',
          { className: 'tr_head' },
          h(
            'div',
            { className: 'tr_title' },
            h('strong', null, t('title')),
            h('span', { className: 'tr_sub' }, members.length + ' ' + t('members') + ' · ' + tasks.length + ' ' + t('tasks'))
          ),
          h('button', { type: 'button', className: 'tr_close', onClick: onClose, 'aria-label': t('close') }, '×')
        ),
        h(
          'div',
          { className: 'tr_body' },
          members.length === 0
            ? h('p', { className: 'tr_empty' }, t('noTeam'))
            : [
                h(RadarMap, { key: 'map', members, tasks, useSessionStatus, useSessions, t }),
                h(
                  'div',
                  { key: 'progress', className: 'tr_progress' },
                  h(
                    'div',
                    { className: 'tr_progressTop' },
                    h('span', null, t('progress')),
                    h('span', { className: 'tr_progressValue' }, done + '/' + tasks.length + ' · ' + percent + '%')
                  ),
                  h('div', { className: 'tr_bar' }, h('div', { className: 'tr_barFill', style: { width: percent + '%' } }))
                ),
                team.failure !== undefined ? h('p', { key: 'failure', className: 'tr_failure' }, team.failure) : null,
                tasks.length === 0
                  ? h('p', { key: 'empty', className: 'tr_empty' }, t('noTasks'))
                  : h(
                      'section',
                      { key: 'tasks', className: 'tr_section' },
                      h('h3', { className: 'tr_sectionTitle' }, t('tasks')),
                      h('ul', { className: 'tr_tasks' }, tasks.map((task) => h(TaskRow, { key: task.id, task, t })))
                    ),
              ]
        )
      );
    }

    function TeamRadarAction({ sessionId, useSession, useSessions, useSessionStatus, t }) {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef(null);
      const leadSessionId = useSession((snapshot) => snapshot?.subagent?.address?.parentSessionId) ?? sessionId;
      const team = useSessions((state) => state.projectionsBySession[leadSessionId]?.values?.agentTeam);

      useEffect(() => {
        if (!open) return undefined;
        return () => setOpen(false);
      }, [leadSessionId]);

      if (team === undefined || team === null) return null;

      return h(
        'div',
        { className: 'tr_root' },
        h(
          'button',
          {
            ref: triggerRef,
            type: 'button',
            className: open ? 'tr_trigger tr_triggerOpen' : 'tr_trigger',
            onClick: () => setOpen((value) => !value),
            title: t('open'),
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
          },
          h(RadarGlyph, { size: 14 }),
          h('span', { className: 'tr_triggerLabel' }, t('trigger')),
          h('span', { className: 'tr_count' }, team.members?.length ?? 0)
        ),
        open
          ? ReactDOM.createPortal(
              h(RadarPanel, {
                team,
                useSessions,
                useSessionStatus,
                t,
                onClose: () => setOpen(false),
                anchorRef: triggerRef,
              }),
              document.body
            )
          : null
      );
    }

    function apply(ctx) {
      ctx.effect(() => {
        const removeStyles = injectStyles();
        const disposeLocale = ctx.locale.register(NS, { zh, en });
        return () => {
          disposeLocale?.();
          removeStyles();
        };
      }, 'team-radar: styles and dictionaries');
      ctx.slots.inject('conversation.session.header.actions', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.actions',
            id: 'team-radar',
            order: 100,
            locale: NS,
          },
          TeamRadarAction
        )
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
