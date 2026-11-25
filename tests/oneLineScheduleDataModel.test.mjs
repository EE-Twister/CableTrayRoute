import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCableSpecFromComponent,
  buildScheduleDataFromComponents,
  formatLoadFlowCurrentValue
} from '../src/one-line/scheduleDataModel.mjs';

const helpers = {
  getCategory: comp => comp.category || comp.type,
  getComponentTag: comp => (comp ? comp.tag || comp.label || comp.id : ''),
  isConductorSegmentComponent: comp => comp?.type === 'cable',
  isBusComponent: comp => comp?.type === 'bus',
  hasStoredPhases: value => Array.isArray(value) ? value.length > 0 : Boolean(value),
  buildCableSpecFromComponent: comp => ({ tag: comp.tag, from_tag: comp.from, to_tag: comp.to }),
  formatLoadFlowCurrentValue: value => (value == null ? '' : String(value)),
};

const diagram = [
  { id: 'swbd', type: 'equipment', category: 'equipment', tag: 'SWBD-1', voltage: 480, connections: [{ target: 'pnl' }] },
  { id: 'pnl', type: 'panel', category: 'panel', ref: 'PNL-A', tag: 'PNL-A', connections: [{ target: 'load' }] },
  { id: 'load', type: 'load', category: 'load', ref: 'LD-1', tag: 'LD-1', description: 'Pump', connections: [] },
  { id: 'bus', type: 'bus', category: 'bus', tag: 'BUS-1', connections: [] },
];

describe('One-Line schedule data model', () => {
  it('splits components into equipment, panel, and load rows', () => {
    const data = buildScheduleDataFromComponents(diagram, helpers);
    assert.deepEqual(data.equipment.map(row => row.tag), ['SWBD-1', 'BUS-1']);
    assert.deepEqual(data.panels.map(row => row.tag), ['PNL-A', 'BUS-1']);
    assert.deepEqual(data.loads.map(row => row.tag), ['LD-1']);
    assert.equal(data.loads[0].description, 'Pump');
    assert.equal(data.equipment[0].voltage, 480);
  });

  it('assigns each load to the nearest upstream panel', () => {
    const data = buildScheduleDataFromComponents(diagram, helpers);
    assert.equal(data.loads[0].panelId, 'PNL-A');
  });

  it('stops walking upstream when connections loop', () => {
    const looped = [
      { id: 'a', type: 'equipment', category: 'equipment', connections: [{ target: 'b' }] },
      { id: 'b', type: 'load', category: 'load', connections: [{ target: 'a' }] },
    ];
    const data = buildScheduleDataFromComponents(looped, helpers);
    assert.equal(data.loads[0].panelId, undefined);
  });

  it('adds schedule fields from per-subtype property schemas', () => {
    const comps = [{ id: 'm', type: 'load', category: 'load', subtype: 'motor', hp: 50, connections: [] }];
    const data = buildScheduleDataFromComponents(comps, {
      ...helpers,
      propSchemas: { motor: [{ name: 'hp' }, { name: 'service', getValue: comp => `${comp.hp} HP` }] },
    });
    assert.equal(data.loads[0].hp, 50);
    assert.equal(data.loads[0].service, '50 HP');
  });

  it('collects cable specs from conductor components and from connection cables once', () => {
    const comps = [
      { id: 'src', type: 'equipment', category: 'equipment', tag: 'SRC', connections: [{ target: 'dst', cable: { tag: 'C-1', size: '4/0' }, loading_amps: 12 }, { target: 'dst', cable: { tag: 'C-2' }, loading_amps: 7 }] },
      { id: 'dst', type: 'load', category: 'load', tag: 'DST', connections: [] },
      { id: 'seg', type: 'cable', category: 'cable', tag: 'C-1', from: 'SRC', to: 'DST', connections: [] },
    ];
    const data = buildScheduleDataFromComponents(comps, helpers);
    assert.deepEqual(data.cables.map(cable => cable.tag), ['C-1', 'C-2']);
    const c2 = data.cables.find(cable => cable.tag === 'C-2');
    assert.equal(c2.from_tag, 'SRC');
    assert.equal(c2.to_tag, 'DST');
    assert.equal(c2.load_flow_current, '7');
  });
});

describe('One-Line load-flow current formatting', () => {
  it('formats a single current to one decimal and skips non-numbers', () => {
    assert.equal(formatLoadFlowCurrentValue(12.345), '12.3');
    assert.equal(formatLoadFlowCurrentValue('7'), '7.0');
    assert.equal(formatLoadFlowCurrentValue('n/a'), '');
    assert.equal(formatLoadFlowCurrentValue(null), '');
  });

  it('lists per-phase currents sorted by phase', () => {
    assert.equal(formatLoadFlowCurrentValue({ C: 9, A: 10.04, B: 'x' }), 'A:10.0, C:9.0');
  });
});

describe('One-Line cable spec', () => {
  const helpers = {
    findSourceComponent: (id, comps) => comps.find(comp => (comp.connections || []).some(conn => conn.target === id)) || null,
    hasImpedance: holder => Boolean(holder?.impedance),
    getComponentTag: comp => (comp ? comp.tag || comp.id : ''),
    parseCablePhases: source => (typeof source === 'string' ? source.split(',').filter(Boolean) : []),
  };
  const diagram = () => [
    { id: 'swbd', type: 'equipment', tag: 'SWBD-1', voltage: 480, connections: [{ target: 'cbl' }] },
    { id: 'cbl', type: 'cable', label: 'C-101', cable: { conductors: 3, slack_pct: 10 }, connections: [{ target: 'mtr', length: 100, phases: 'A,B,C', loading_amps: 41.26 }] },
    { id: 'mtr', type: 'load', tag: 'M-1', current: 40, voltage: 480, connections: [] },
  ];

  it('returns null for components that are not cables', () => {
    const comps = diagram();
    assert.equal(buildCableSpecFromComponent(comps[0], comps, helpers), null);
  });

  it('derives endpoints, phases, and the scaled length with slack', () => {
    const comps = diagram();
    const spec = buildCableSpecFromComponent(comps[1], comps, { ...helpers, unitPerPx: 0.5 });
    assert.equal(spec.tag, 'C-101');
    assert.equal(spec.from_tag, 'SWBD-1');
    assert.equal(spec.to_tag, 'M-1');
    assert.equal(spec.phases, 'A,B,C');
    assert.equal(spec.length, '55.00', '100 px x 0.5 ft/px x 1.10 slack');
    assert.equal(spec.load_flow_current, '41.3');
    assert.equal(comps[1].cable.length, '55.00', 'sizing results are written back to the component');
  });

  it('keeps a manual length instead of the drawn length', () => {
    const comps = diagram();
    comps[1].cable = { ...comps[1].cable, manual_length: true, length: '250' };
    const spec = buildCableSpecFromComponent(comps[1], comps, helpers);
    assert.equal(spec.length, '250.00');
    assert.equal(spec.manual_length, true);
  });
});
