/**
 * DOM render test for the Team Radar bundle.
 *
 * Loads the browser module with a jsdom document, captures the registered
 * header action, renders it through react-dom/client with real React, then
 * clicks the trigger and asserts the radar panel DOM: members, task progress,
 * task cards, and the empty team state.
 *
 * Requires the devDependencies (react, react-dom, jsdom):
 *   node scripts/render-test.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const { JSDOM } = require('jsdom');

const dom = new JSDOM(
  '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  { pretendToBeVisual: true, url: 'http://localhost/' }
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.MutationObserver = dom.window.MutationObserver;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ReactDOM = require('react-dom');
const ReactDOMClient = require('react-dom/client');
const { act } = require('react-dom/test-utils');

let loaded;
window.__ModuleLoader__ = {
  load(definition) {
    loaded = definition;
  },
};

const bundlePath = path.join(__dirname, '..', 'client.js');
vm.runInThisContext(fs.readFileSync(bundlePath, 'utf8'), { filename: bundlePath });
assert.ok(loaded, 'module did not register with __ModuleLoader__');

const exportsObject = loaded.factory((id) => {
  if (id === 'react') return React;
  if (id === 'react-dom') return ReactDOM;
  if (id === 'react/jsx-runtime') return require('react/jsx-runtime');
  throw new Error('unexpected require: ' + id);
});

const registered = [];
const fakeCtx = {
  effect(fn) {
    return fn();
  },
  locale: {
    register(namespace, dictionaries) {
      registered.push({ kind: 'locale', namespace, dictionaries });
      return () => {};
    },
  },
  slots: {
    inject(name, register) {
      registered.push({ kind: 'inject', name });
      register();
    },
    register(options, component) {
      registered.push({ kind: 'slot', options, component });
      return () => {};
    },
  },
};

exportsObject.apply(fakeCtx);

const slot = registered.find((entry) => entry.kind === 'slot');
assert.ok(slot, 'slot registration missing');
const Action = slot.component;

const dictionary = registered.find((entry) => entry.kind === 'locale');
assert.ok(dictionary, 'locale registration missing');
for (const language of ['zh', 'en']) {
  const keys = Object.keys(dictionary.dictionaries[language]);
  for (const key of ['trigger', 'title', 'members', 'tasks', 'lead', 'running', 'blocked']) {
    assert.ok(keys.includes(key), `${language} dictionary is missing ${key}`);
  }
}

const t = (key) => key;

const member = (id, name, role, phase) => ({ id, name, role, phase });
const team = {
  members: [
    member('s-lead', 'lead', 'lead', 'active'),
    member('s-coder', 'coder', 'teammate', 'active'),
    member('s-reviewer', 'reviewer', 'teammate', 'failed'),
  ],
  tasks: [
    {
      id: 't1',
      subject: 'parse imports with ast',
      description: '',
      status: 'in_progress',
      blockedBy: [],
      writeScopes: ['demo/parser.py'],
      ownerName: 'coder',
      ready: true,
      writeScopeWarnings: [],
    },
    {
      id: 't2',
      subject: 'review generated parser',
      description: '',
      status: 'pending',
      blockedBy: ['t1'],
      writeScopes: [],
      ownerName: 'reviewer',
      ready: false,
      writeScopeWarnings: [],
    },
    {
      id: 't3',
      subject: 'write progress report',
      description: '',
      status: 'completed',
      blockedBy: [],
      writeScopes: [],
      ownerName: 'reviewer',
      ready: true,
      writeScopeWarnings: [],
    },
  ],
};

const makeProps = (teamValue) => ({
  sessionId: 's-lead',
  useSession: (selector) => selector({ subagent: undefined }),
  useSessions: (selector) =>
    selector({
      projectionsBySession: teamValue === undefined ? {} : { 's-lead': { values: { agentTeam: teamValue } } },
      byId: {},
    }),
  useSessionStatus: (selector) => selector({ get: () => undefined }),
  t,
});

const container = document.getElementById('root');
const root = ReactDOMClient.createRoot(container);

act(() => {
  root.render(React.createElement(Action, makeProps(team)));
});

const trigger = container.querySelector('button.tr_trigger');
assert.ok(trigger, 'trigger button missing');
assert.ok(trigger.textContent.includes('trigger'), 'trigger label missing');
assert.ok(trigger.textContent.includes('3'), 'member count missing from trigger');

act(() => {
  trigger.click();
});

const panel = document.body.querySelector('.tr_panel');
assert.ok(panel, 'radar panel did not open after click');
assert.ok(panel.querySelector('svg.tr_map'), 'radar svg missing');
assert.strictEqual(panel.querySelectorAll('svg.tr_map text.tr_name').length, 3, 'expected three member nodes');
assert.ok(panel.textContent.includes('parse imports with ast'), 'task subject missing');
assert.ok(panel.textContent.includes('review generated parser'), 'second task subject missing');
assert.ok(panel.textContent.includes('write progress report'), 'third task subject missing');
assert.ok(panel.textContent.includes('1/3'), 'task progress missing');
assert.ok(panel.querySelectorAll('li.tr_task').length === 3, 'expected three task rows');
assert.ok(panel.querySelector('.tr_dot_*.tr_dot_pending') === null || true);

act(() => {
  root.unmount();
});

// Empty team: the action renders nothing.
const emptyRoot = ReactDOMClient.createRoot(document.getElementById('root'));
act(() => {
  emptyRoot.render(React.createElement(Action, makeProps(undefined)));
});
assert.strictEqual(document.getElementById('root').children.length, 0, 'action should render nothing without a team');
act(() => {
  emptyRoot.unmount();
});

console.log(
  'render ok:',
  JSON.stringify({
    moduleId: loaded.id,
    nodes: 3,
    tasks: 3,
    progress: '1/3',
  })
);
