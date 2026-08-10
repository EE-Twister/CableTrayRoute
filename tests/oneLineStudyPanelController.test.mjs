import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createStudyPanelController,
  gatherStudyResultSections,
  hasStudyResultContent
} from '../src/one-line/studyPanelController.mjs';

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = { toggle: () => false };
    this.style = {};
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type) {
    this.listeners.get(type)?.({ preventDefault() {} });
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }
}

describe('One-Line study panel controller', () => {
  it('detects and combines structured and load-flow result content', () => {
    const results = { textContent: '{"shortCircuit":{}}' };
    const loadFlow = { textContent: 'Bus 1: 1.0 pu', innerText: 'Bus 1: 1.0 pu' };
    assert.equal(hasStudyResultContent({ textContent: 'No results' }), false);
    assert.equal(hasStudyResultContent(results), true);
    assert.equal(gatherStudyResultSections(results, loadFlow), '{"shortCircuit":{}}\n\nBus 1: 1.0 pu');
  });

  it('binds normalized settings changes and clipboard copy behind injected adapters', async () => {
    const loadFlowBase = new FakeElement();
    const loadFlowIterations = new FakeElement();
    const loadFlowBalanced = new FakeElement();
    const shortCircuitMethod = new FakeElement();
    const results = new FakeElement();
    results.textContent = 'Study output';
    const loadFlowResults = new FakeElement();
    loadFlowResults.textContent = '';
    const copied = [];
    let settings = {
      loadFlow: { baseMVA: 100, maxIterations: 20, balanced: true },
      shortCircuit: { method: 'IEC' }
    };
    const controller = createStudyPanelController({
      documentRef: {},
      navigatorRef: { clipboard: { writeText: async text => copied.push(text) } },
      elements: { loadFlowBase, loadFlowIterations, loadFlowBalanced, shortCircuitMethod, results, loadFlowResults },
      getSettings: () => settings,
      updateSettings: update => { settings = update(settings); },
      defaultSettings: settings,
      getStudyResults: () => ({}),
      onOverlayChange: () => {},
      showToast: () => {}
    });
    controller.bind();
    loadFlowBase.value = '250';
    loadFlowBase.emit('change');
    loadFlowIterations.value = '1200';
    loadFlowIterations.emit('change');
    shortCircuitMethod.value = 'ansi';
    shortCircuitMethod.emit('change');
    assert.equal(settings.loadFlow.baseMVA, 250);
    assert.equal(settings.loadFlow.maxIterations, 999);
    assert.equal(settings.shortCircuit.method, 'ANSI');
    assert.equal(await controller.copyResults(), true);
    assert.deepEqual(copied, ['Study output']);
  });
});
