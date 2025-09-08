const assert = require('assert');

class Element {
  constructor(tag = '') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.classList = { add() {}, remove() {} };
  }
  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  addEventListener() {}
  removeEventListener() {}
  setAttribute(name, value) { this[name] = value; }
  closest() { return null; }
}

function makeDOM() {
  const elements = {};
  const document = {
    createElement: tag => new Element(tag),
    getElementById: id => elements[id],
    addEventListener() {},
    body: new Element('body')
  };
  const window = {
    addEventListener(type, fn) {
      this._listeners = this._listeners || {};
      (this._listeners[type] || (this._listeners[type] = [])).push(fn);
    },
    dispatchEvent(evt) {
      const list = (this._listeners && this._listeners[evt.type]) || [];
      list.forEach(fn => fn(evt));
    },
    Event: class { constructor(type) { this.type = type; } }
  };
  document.defaultView = window;

  elements['load-table'] = new Element('table');
  elements['load-table-tbody'] = new Element('tbody');
  elements['load-table-tbody'].dataset = { rowClass: 'load-row' };
  elements['load-table-tfoot'] = new Element('tfoot');
  elements['load-table'].querySelector = sel => {
    if (sel === 'tbody') return elements['load-table-tbody'];
    if (sel === 'tfoot') return elements['load-table-tfoot'];
    return new Element();
  };
  elements['load-table'].querySelectorAll = () => [];
  elements['delete-selected-btn'] = new Element('button');
  elements['select-all'] = new Element('input');
  elements['source-summary'] = new Element('div');
  elements['export-btn'] = new Element('button');
  elements['export-csv-btn'] = new Element('button');
  elements['copy-btn'] = new Element('button');
  elements['import-input'] = new Element('input');
  elements['import-btn'] = new Element('button');
  elements['import-csv-btn'] = new Element('button');
  elements['import-csv-input'] = new Element('input');

  return { window, document };
}

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

global.initSettings = global.initDarkMode = global.initCompactMode = global.initNavToggle = () => {};
global.alert = () => {};
global.confirm = () => true;
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };

(async () => {
  let dom = makeDOM();
  global.window = dom.window;
  global.document = dom.document;

  const dataStore = await import('../dataStore.mjs');
  dataStore.addLoad({ source: 'S1', description: 'L1', kw: '10', voltage: '120', manufacturer: 'ACME', model: 'X1', notes: 'n1' });
  dataStore.addLoad({ source: 'S2', description: 'L2', kw: '20', voltage: '240', manufacturer: 'Other', model: 'Y2', notes: 'n2' });
  const before = dataStore.getLoads();

  await import('../loadlist.mjs');
  window.dispatchEvent(new window.Event('DOMContentLoaded'));

  dom = makeDOM();
  global.window = dom.window;
  global.document = dom.document;

  await import('../loadlist.mjs?cache=' + Date.now());
  window.dispatchEvent(new window.Event('DOMContentLoaded'));

  const reloaded = await import('../dataStore.mjs?cache=' + Date.now());
  const after = reloaded.getLoads();

  assert.deepStrictEqual(after, before);
  console.log('\u2713 loadlist persistence');
})().catch(err => { console.error(err); process.exitCode = 1; });
