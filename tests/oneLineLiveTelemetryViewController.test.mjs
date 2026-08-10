import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createLiveTelemetryViewController,
  formatLiveTrendNumber
} from '../src/one-line/liveTelemetryViewController.mjs';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.classList = { add: (...names) => { this.classes = [...(this.classes || []), ...names]; } };
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function createController(overrides = {}) {
  const button = new FakeElement('button');
  const documentRef = {
    createElement: tagName => new FakeElement(tagName),
    createElementNS: (_namespace, tagName) => new FakeElement(tagName),
    getElementById: id => id === 'live-telemetry-btn' ? button : null,
    body: new FakeElement('body')
  };
  const options = {
    documentRef,
    svgNS: 'svg',
    openModal: () => Promise.resolve(),
    getRunning: () => true,
    getConfig: () => ({ mappings: [] }),
    getValues: () => ({}),
    getAlarms: () => [],
    getComponents: () => [],
    getComponentLabel: component => component.id,
    getTrendSeries: () => [],
    getTrendMetrics: () => [],
    summarizeTrend: () => null,
    exportTrendCsv: () => '',
    BlobCtor: class {},
    URLRef: { createObjectURL: () => '', revokeObjectURL: () => {} },
    setTimeoutFn: callback => callback(),
    ...overrides
  };
  return { button, controller: createLiveTelemetryViewController(options) };
}

describe('One-Line live telemetry view controller', () => {
  it('formats trend values and updates the toolbar alarm state', () => {
    assert.equal(formatLiveTrendNumber(Number.NaN), '—');
    assert.equal(formatLiveTrendNumber(1234.5678), (1234.5678).toLocaleString(undefined, { maximumFractionDigits: 3 }));
    const { button, controller } = createController({
      getAlarms: () => [{}, {}]
    });
    controller.updateControl();
    assert.equal(button.dataset.alarmCount, '2');
    assert.equal(button.title, '2 active live alarms');
  });

  it('renders empty and populated 24-hour trend panels from injected series data', () => {
    const empty = createController();
    assert.equal(empty.controller.createTrendChart('BUS-1', 'kv').children[0].textContent.includes('No numeric readings'), true);

    const series = [
      { timestamp: Date.now() - 1000, value: 12 },
      { timestamp: Date.now(), value: 14 }
    ];
    const populated = createController({
      getTrendSeries: () => series,
      summarizeTrend: () => ({ count: 2, latest: 14, minimum: 12, average: 13, maximum: 14 })
    });
    const panel = populated.controller.createTrendChart('BUS-1', 'kv');
    assert.deepEqual(panel.children.map(child => child.tagName), ['p', 'svg', 'dl']);
    assert.equal(panel.children[0].textContent, 'kv · 2 readings in the last 24 hours');
    assert.equal(panel.children[1].attributes.get('role'), 'img');
  });
});
