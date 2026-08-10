import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPropertyEditorCategories,
  createPropertyEditorController,
  getPropertyEditorDeviceLabel
} from '../src/one-line/propertyEditorController.mjs';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...values) {
    values.forEach(value => this.values.add(value));
  }

  remove(...values) {
    values.forEach(value => this.values.delete(value));
  }

  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.attributes = new Map();
    this._innerHTML = '';
  }

  set className(value) {
    this._className = value;
    value.split(/\s+/).filter(Boolean).forEach(name => this.classList.add(name));
  }

  get className() {
    return this._className || '';
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (!value) this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  emit(type, event = {}) {
    this.listeners.get(type)?.({ target: this, preventDefault() {}, ...event });
  }

  focus() {
    this.focused = true;
  }
}

function createFakeDocument() {
  const listeners = new Map();
  return {
    createElement: tagName => new FakeElement(tagName),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
}

describe('One-Line property editor controller', () => {
  it('sorts device labels and groups devices by injected category semantics', () => {
    const devices = [
      { id: '2', label: 'Zulu', type: 'load' },
      { id: '1', label: 'Alpha', type: 'load' },
      { id: '3', subtype: 'transformer', type: 'equipment' }
    ];
    const categories = buildPropertyEditorCategories(devices, device => device.type);
    assert.deepEqual(categories.get('load').map(device => device.id), ['1', '2']);
    assert.equal(getPropertyEditorDeviceLabel(devices[2]), 'transformer');
  });

  it('owns modal navigation and delegates property rendering and selection state', () => {
    const documentRef = createFakeDocument();
    const modal = new FakeElement('div');
    const motor = { id: 'motor-1', label: 'M-1', category: 'load' };
    const transformer = { id: 'xfmr-1', label: 'TX-1', category: 'equipment' };
    const selections = [];
    const rendered = [];
    let applied = 0;
    const controller = createPropertyEditorController({
      documentRef,
      modal,
      devices: [motor, transformer],
      initialComponent: motor,
      getCategory: device => device.category,
      getCategoryLabel: category => category,
      onSelectionChange: device => selections.push(device?.id || null)
    });
    controller.setPropertyRenderer(device => {
      rendered.push(device?.id || null);
      modal._applyChanges = () => { applied += 1; };
    });
    controller.start();

    assert.equal(modal.classList.contains('show'), true);
    assert.deepEqual(rendered, ['motor-1']);
    const layout = modal.children[0].children[0];
    const categoryList = layout.children[0].children[1];
    categoryList.children[0].emit('click');
    assert.equal(rendered.at(-1), 'xfmr-1');
    assert.equal(selections.at(-1), 'xfmr-1');

    controller.close({ applyChanges: true });
    assert.equal(applied, 2);
    assert.equal(modal.classList.contains('show'), false);
    assert.equal(selections.at(-1), null);
  });
});
