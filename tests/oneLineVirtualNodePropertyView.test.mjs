import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createVirtualNodePropertyRenderer } from '../src/one-line/virtualNodePropertyView.mjs';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.classList = { add() {} };
    this.listeners = new Map();
  }

  appendChild(child) {
    this.children.push(child);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

describe('One-Line virtual node property view', () => {
  it('summarizes inbound and outbound connections with cable identity', () => {
    const children = [];
    const propertyContainer = { appendChild: child => children.push(child), scrollTop: 10 };
    const propertyHeading = { textContent: '' };
    const render = createVirtualNodePropertyRenderer({
      documentRef: { createElement: tagName => new FakeElement(tagName) },
      propertyContainer,
      propertyHeading,
      getComponentListLabel: component => component.label,
      getComponents: () => [],
      getActiveSheet: () => ({ connections: [] }),
      setConnections: () => {},
      setActiveComponent: () => {},
      pushHistory: () => {},
      render: () => {},
      save: () => {},
      showToast: () => {},
      closeModal: () => {},
      selectComponent: () => {}
    });
    render({
      id: 'node-1',
      inbound: [{ sourceComponent: { label: 'Source' }, connection: { cable: { tag: 'C-1' } } }],
      outbound: [{ targetComponent: { label: 'Load' }, connection: {} }]
    });
    assert.equal(propertyHeading.textContent, 'node-1 Node');
    assert.equal(children[0].textContent, 'This node has 1 inbound connection and 1 outbound connection.');
    assert.equal(children[2].children[0].children[0].textContent, 'From Source (C-1)');
    assert.equal(children[4].children[0].children[0].textContent, 'To Load');
    assert.equal(propertyContainer.scrollTop, 0);
  });
});
