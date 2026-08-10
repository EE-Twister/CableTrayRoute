import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateConnectionLength,
  countInboundConnections,
  rememberConnectionJunction,
  renderConnections
} from '../src/one-line/connectionRenderController.mjs';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.classes = new Set();
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.classList = { add: (...names) => names.forEach(name => this.classes.add(name)) };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type) {
    this.listeners.get(type)?.({ stopPropagation() {} });
  }
}

describe('One-Line connection render controller', () => {
  it('calculates route length, inbound counts, and stable junction identities', () => {
    assert.equal(calculateConnectionLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 4 }]), 8);
    const counts = countInboundConnections([
      { connections: [{ target: 'bus' }, { target: 'bus' }] },
      { connections: [{ target: 'load' }] }
    ]);
    assert.equal(counts.get('bus'), 2);
    const junctions = new Map();
    rememberConnectionJunction(junctions, { x: 10.01, y: 20.02 }, '#111');
    rememberConnectionJunction(junctions, { x: 10.04, y: 20.04 }, '#222');
    assert.equal(junctions.size, 1);
    assert.equal(junctions.values().next().value.color, '#111');
  });

  it('renders connection geometry and delegates selection through injected callbacks', () => {
    const connection = { target: 'target', dir: 'h' };
    const source = { id: 'source', type: 'panel', connections: [connection] };
    const target = { id: 'target', type: 'load' };
    const children = [];
    const selected = [];
    const result = renderConnections({
      documentRef: { createElementNS: (_namespace, tagName) => new FakeElement(tagName) },
      svgNS: 'svg',
      components: [source, target],
      componentById: new Map([[source.id, source], [target.id, target]]),
      renderSurface: { appendChild: child => children.push(child) },
      routeConnection: () => [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      isHiddenByLayer: () => false,
      includePoint: () => {},
      getCableForConnection: () => ({ tag: 'C-1', voltage: 480 }),
      getVoltageRange: () => ({ color: '#f00' }),
      usedVoltageRanges: new Set(),
      parseCablePhases: () => [],
      phaseColors: {},
      cableColors: {},
      engineeringPrint: false,
      showOverlays: true,
      classifyConnectionRole: () => 'feeder',
      selectedConnection: null,
      componentMatchesDiagramFilter: () => true,
      isConductorSegmentComponent: () => false,
      canEditConnectionWaypoint: () => false,
      toDiagramCoords: () => ({ x: 0, y: 0 }),
      onSelectConnection: (component, index) => selected.push([component.id, index]),
      onEditCableComponent: () => {},
      onStartWaypointDrag: () => {},
      isBusComponent: () => false,
      connectionLabelPosition: () => ({ x: 5, y: 0, textAnchor: 'middle' }),
      getTransformerPortRole: () => null,
      dataStateOverlayMode: 'none',
      formatOverlayMetric: () => '',
      getStudyProvenance: () => ({ status: 'current' }),
      resolveConnectionLabelPosition: position => position
    });

    assert.equal(result.lengthsChanged, true);
    assert.equal(connection.length, 10);
    assert.deepEqual(children.map(child => child.tagName), ['polyline', 'text']);
    assert.equal(children[0].attributes.get('points'), '0,0 10,0');
    assert.equal(children[1].textContent, 'C-1');
    children[0].emit('click');
    assert.deepEqual(selected, [['source', 0]]);
  });
});
