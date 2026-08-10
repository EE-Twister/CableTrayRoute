import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPersistedSheets,
  createSheetPersistenceController
} from '../src/one-line/sheetPersistenceController.mjs';

class FakeElement {
  constructor() {
    this.children = [];
    this.listeners = new Map();
  }

  set innerHTML(value) {
    if (!value) this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
  }

  setAttribute() {}

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

describe('One-Line sheet persistence controller', () => {
  it('serializes active sheet components, derived connections, layers, and zones', () => {
    const sheets = buildPersistedSheets({
      sheets: [
        { name: 'A', components: [], connections: [], layers: [] },
        { name: 'B', components: [{ id: 'old' }], layers: [{ id: 'b' }], protectionZones: [{ id: 'zb' }] }
      ],
      activeSheet: 0,
      components: [{ id: 'source', rotation: 0, connections: [{ target: 'load', cable: { tag: 'C-1' } }] }],
      layers: [{ id: 'active', visible: true }],
      protectionZones: [{ id: 'za', componentIds: ['source'] }]
    });
    assert.equal(sheets[0].connections[0].from, 'source');
    assert.equal(sheets[0].connections[0].to, 'load');
    assert.deepEqual(sheets[0].layers, [{ id: 'active', visible: true }]);
    assert.deepEqual(sheets[0].protectionZones, [{ id: 'za', componentIds: ['source'] }]);
    assert.notEqual(sheets[0].layers, sheets[1].layers);
  });

  it('coordinates save and sheet activation through injected persistence adapters', () => {
    const tabs = new FakeElement();
    const documentRef = {
      getElementById: id => id === 'sheet-tabs' ? tabs : null,
      createElement: () => new FakeElement()
    };
    let state = {
      sheets: [
        { name: 'A', components: [{ id: 'a' }], connections: [], layers: [] },
        { name: 'B', components: [{ id: 'b' }], connections: [], layers: [] }
      ],
      activeSheet: 0,
      components: [{ id: 'a' }],
      connections: [],
      layers: []
    };
    const persisted = [];
    const activated = [];
    const controller = createSheetPersistenceController({
      documentRef,
      getState: () => state,
      onActivateSheet: (index, sheet) => {
        activated.push(index);
        state = { ...state, activeSheet: index, components: sheet.components, connections: sheet.connections, layers: sheet.layers };
      },
      onPersistedSheets: next => { state = { ...state, ...next }; },
      onAfterSheetLoad: () => {},
      onAfterSheetDelete: () => {},
      persistOneLine: value => persisted.push(value),
      persistDiagramScale: () => {},
      getDiagramScale: () => ({ unitPerPx: 1 }),
      normalizeDiagramScale: value => value,
      synchronizeProjectData: () => ({ creates: 0, updates: 0 }),
      validateDiagram: () => [],
      getProtectionZones: () => [],
      promptDialog: async () => '',
      confirmDialog: async () => false,
      showToast: () => {}
    });
    assert.equal(controller.load(1), true);
    assert.deepEqual(activated, [1]);
    assert.equal(state.activeSheet, 1);
    assert.equal(persisted.at(-1).activeSheet, 1);
    controller.renderTabs();
    assert.equal(tabs.children.length, 2);
    assert.equal(tabs.children[1].className, 'sheet-tab active');
  });
});
