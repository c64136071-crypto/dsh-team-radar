/**
 * Deterministic preview renderer for the Team Radar panel.
 *
 * The README screenshot is produced from the real component: this script mounts
 * `client.js` in jsdom with fake Session props, clicks the header trigger, then
 * serializes the rendered panel into `docs/preview.html`. A headless browser
 * screenshots that page into `docs/screenshot.png`.
 *
 *   node scripts/screenshot.cjs
 *   msedge --headless=new --screenshot=docs/screenshot.png --window-size=520,820 \
 *          --force-device-scale-factor=2 --user-data-dir=<temp> docs/preview.html
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { JSDOM } = require('jsdom');

const rootDir = path.join(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.MutationObserver = dom.window.MutationObserver;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ReactDOMClient = require('react-dom/client');
const { act } = require('react-dom/test-utils');

const bundle = fs.readFileSync(path.join(rootDir, 'client.js'), 'utf8');
let loaded;
window.__ModuleLoader__ = {
  load(definition) {
    loaded = definition;
  },
};
vm.runInThisContext(bundle, { filename: 'client.js' });

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
  close: '关闭',
  open: '打开团队雷达',
};

const members = [
  { id: 'lead-1', name: 'lead', role: 'lead', phase: 'active' },
  { id: 'm-reviewer', name: 'reviewer', role: 'teammate', phase: 'active' },
  { id: 'm-scribe', name: 'scribe', role: 'teammate', phase: 'active' },
  { id: 'm-atlas', name: 'atlas', role: 'teammate', phase: 'provisioning' },
];

const tasks = [
  {
    id: 'task-1',
    subject: 'Review team-radar/client.js against the client-slot contract',
    description: '',
    status: 'completed',
    blockedBy: [],
    writeScopes: [],
    ownerName: 'reviewer',
    ready: false,
    writeScopeWarnings: [],
  },
  {
    id: 'task-2',
    subject: 'Draft the English README intro',
    description: '',
    status: 'completed',
    blockedBy: [],
    writeScopes: [],
    ownerName: 'scribe',
    ready: false,
    writeScopeWarnings: [],
  },
  {
    id: 'task-3',
    subject: 'Add a headless DOM render test',
    description: '',
    status: 'in_progress',
    blockedBy: [],
    writeScopes: ['scripts/render-test.cjs'],
    ownerName: 'scribe',
    ready: false,
    writeScopeWarnings: [],
  },
  {
    id: 'task-4',
    subject: 'Package the plugin for GitHub',
    description: '',
    status: 'pending',
    blockedBy: ['task-3'],
    writeScopes: [],
    ownerName: undefined,
    ready: false,
    writeScopeWarnings: [],
  },
  {
    id: 'task-5',
    subject: 'Write the deterministic preview pipeline',
    description: '',
    status: 'pending',
    blockedBy: [],
    writeScopes: [],
    ownerName: undefined,
    ready: true,
    writeScopeWarnings: [],
  },
];

const team = { members, tasks };
const runningIds = new Set(['m-scribe']);

const state = {
  projectionsBySession: {
    'lead-1': { values: { agentTeam: team } },
  },
  byId: {},
};

const registrations = [];
const ctx = {
  effect(fn) {
    return fn();
  },
  locale: {
    register() {
      return () => {};
    },
  },
  slots: {
    inject(_name, register) {
      register();
    },
    register(_options, component) {
      registrations.push(component);
      return () => {};
    },
  },
};

loaded.factory((id) => {
  if (id === 'react') return React;
  if (id === 'react-dom') return require('react-dom');
  throw new Error('unexpected require: ' + id);
}).apply(ctx);

const Component = registrations[0];

const props = {
  sessionId: 'lead-1',
  useSession: (selector) => selector({ subagent: undefined }),
  useSessions: (selector) => selector(state),
  useSessionStatus: (selector) =>
    selector({ get: (id) => ({ running: runningIds.has(id) }) }),
  t: (key) => zh[key] ?? key,
};

async function main() {
  const container = document.getElementById('root');
  const root = ReactDOMClient.createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });

  const trigger = container.querySelector('.tr_trigger');
  if (trigger === null) throw new Error('trigger did not render');
  await act(async () => {
    trigger.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  const panel = document.querySelector('.tr_panel');
  if (panel === null) throw new Error('panel did not render after click');

  panel.style.position = 'absolute';
  panel.style.left = '130px';
  panel.style.top = '58px';
  panel.style.visibility = 'visible';

  const pluginCss = document.querySelector('style[data-plugin="dsh-plugin-team-radar"]').textContent;
  const triggerHtml = container.querySelector('.tr_root').outerHTML;
  const panelHtml = panel.outerHTML;

  const demoCss = `
:root, body {
  --dsw-alias-bg-layer-2: #1b1f24;
  --dsw-alias-bg-layer-3: #23282f;
  --dsw-alias-border-l1: #30363d;
  --dsw-alias-border-l2: #2d333b;
  --dsw-alias-border-l3: #4a5562;
  --dsw-alias-label-primary: #e6edf3;
  --dsw-alias-label-secondary: #b9c1ca;
  --dsw-alias-label-tertiary: #8b949e;
  --dsw-alias-label-caption: #6e7681;
  --dsw-alias-state-business-primary: #4d8dff;
  --dsw-alias-state-error-primary: #ff5d5d;
  --dsw-alias-state-success-primary: #3fca87;
  --dsw-alias-state-warning-primary: #e3b341;
  --dsw-elevation-prominent: 0 18px 44px rgba(0, 0, 0, 0.55);
  --dsw-specific-menu: #1f242b;
}
html, body { margin: 0; padding: 0; }
body {
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 70% -10%, rgba(77, 141, 255, 0.10), transparent 70%),
    #0b0e13;
  color: #e6edf3;
  font-family: "Segoe UI", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.demo-app { position: relative; min-height: 100vh; }
.demo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.demo-title { font-size: 13px; font-weight: 500; color: #b9c1ca; }
.demo-right { display: flex; align-items: center; gap: 12px; }
.demo-chip { font-size: 12px; color: #6e7681; }
.tr_panel { max-height: none !important; }
`;

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Team Radar preview</title>
<style>${pluginCss}</style>
<style>${demoCss}</style>
</head>
<body>
<div class="demo-app">
  <div class="demo-header">
    <span class="demo-title">Dsh bot 模式配置询问</span>
    <span class="demo-right">
      <span class="demo-chip">智能体团队</span>
      <span class="demo-chip">标准模式</span>
      ${triggerHtml}
    </span>
  </div>
  ${panelHtml}
</div>
</body>
</html>`;

  const out = path.join(rootDir, 'docs', 'preview.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  console.log('preview written:', out);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
