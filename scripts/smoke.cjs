/**
 * Offline smoke test for the Team Radar browser bundle.
 *
 * The real page provides React, react-dom, and window.__ModuleLoader__ from the
 * platform module table. This script stubs those, captures the registered
 * factory, then runs `apply` against a fake Client Context and calls the two
 * top-level components with fake hooks to catch wiring mistakes without a
 * browser.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const calls = [];

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children };
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useRef(value) {
    return { current: value };
  },
  useEffect() {},
  useLayoutEffect() {},
};

const ReactDOM = {
  createPortal(node) {
    return node;
  },
};

const element = (tag) => ({
  dataset: {},
  appendChild() {},
  remove() {},
});

const documentStub = {
  head: { appendChild() {} },
  body: {},
  querySelector() {
    return null;
  },
  createElement() {
    return element();
  },
  addEventListener() {},
  removeEventListener() {},
};

global.window = {
  __ModuleLoader__: {
    load(definition) {
      calls.push({ kind: 'load', definition });
    },
  },
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
  setTimeout,
};
global.document = documentStub;

const requireStub = (id) => {
  if (id === 'react') return React;
  if (id === 'react-dom') return ReactDOM;
  throw new Error('unexpected require: ' + id);
};

const bundlePath = path.join(__dirname, '..', 'client.js');
vm.runInThisContext(fs.readFileSync(bundlePath, 'utf8'), { filename: bundlePath });

const loaded = calls.find((call) => call.kind === 'load');
if (loaded === undefined) throw new Error('module did not register with __ModuleLoader__');
if (loaded.definition.id !== 'dsh-plugin-team-radar') {
  throw new Error('unexpected module id: ' + loaded.definition.id);
}

const exportsObject = loaded.definition.factory(requireStub);
for (const service of ['slots', 'locale']) {
  if (!exportsObject.inject.includes(service)) throw new Error('missing injected service: ' + service);
}

const registered = [];
const fakeCtx = {
  effect(fn) {
    return fn();
  },
  locale: {
    register(namespace, dictionaries) {
      registered.push({ kind: 'locale', namespace, languages: Object.keys(dictionaries) });
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
if (slot === undefined) throw new Error('slot registration missing');
if (slot.options.id !== 'team-radar') throw new Error('unexpected slot id: ' + slot.options.id);
if (slot.options.name !== 'conversation.session.header.actions') {
  throw new Error('unexpected slot name: ' + slot.options.name);
}
if (typeof slot.component !== 'function') throw new Error('slot component is not a function');

// Empty session: no team projection -> the action renders nothing.
const emptyResult = slot.component({
  sessionId: 'session-1',
  useSession: (selector) => selector({}),
  useSessions: (selector) => selector({ projectionsBySession: {}, byId: {} }),
  useSessionStatus: () => undefined,
  t: (key) => key,
});
if (emptyResult !== null) throw new Error('action should render nothing without a team');

// Team session: the action must render a trigger element tree.
const member = (id, name, role, phase) => ({ id, name, role, phase });
const team = {
  members: [member('session-1', 'lead', 'lead', 'active'), member('session-2', 'coder', 'teammate', 'active')],
  tasks: [
    { id: 't1', subject: 'parse dx_import.py', description: '', status: 'in_progress', blockedBy: [], writeScopes: [], ownerName: 'coder', ready: true, writeScopeWarnings: [] },
  ],
};
const teamState = {
  projectionsBySession: { 'session-1': { values: { agentTeam: team } } },
  byId: {},
};
const tree = slot.component({
  sessionId: 'session-1',
  useSession: (selector) => selector({ subagent: undefined }),
  useSessions: (selector) => selector(teamState),
  useSessionStatus: () => undefined,
  t: (key) => key,
});
if (tree === null || tree === undefined) throw new Error('action should render with a team projection');

// Locale dictionaries must cover both languages.
const locale = registered.find((entry) => entry.kind === 'locale');
if (locale === undefined || locale.languages.join(',') !== 'zh,en') {
  throw new Error('locale dictionaries missing: ' + JSON.stringify(registered.filter((e) => e.kind === 'locale')));
}

console.log('smoke ok:', JSON.stringify({
  moduleId: loaded.definition.id,
  services: exportsObject.inject,
  registrations: registered.map((entry) => entry.kind + (entry.options ? ':' + entry.options.id : '')),
  triggerType: typeof tree.type,
}));
