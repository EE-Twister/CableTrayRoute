import assert from 'node:assert/strict';
import {
  canonicalJSONString,
  decodeProjectFromUrl,
  encodeProjectForUrl
} from '../src/projectFileCodec.js';
import {
  duplicatePanelDefinition,
  findPanelByIdentifier,
  formatPanelSelectorLabel,
  generatePanelId
} from '../src/panel-schedule/panelModel.js';
import {
  computeBreakerSpan,
  getDcPolarityForCircuit,
  getPanelCircuitCount,
  getPanelPhaseSequence
} from '../src/panel-schedule/phaseModel.js';
import { collectPanelOptions, collectRacewayOptions } from '../src/cable-schedule/optionModel.js';
import {
  conduitEquivalentDiameterMeters,
  neherMcGrathTemperature,
  parseTradeSize,
  resolveCableTemperatureRating
} from '../src/ductbank-route/thermalPrimitives.js';

const project = { settings: { units: 'imperial' }, cables: [{ id: 'C-1' }], name: 'Codec test' };
assert.equal(canonicalJSONString({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
assert.deepEqual(await decodeProjectFromUrl(await encodeProjectForUrl(project)), project);

const panels = [{ id: 'P1', ref: 'LP-1', voltage: 480, circuitCount: 6, breakerDetails: { 1: { rating: 20 } } }];
assert.equal(findPanelByIdentifier(panels, 'lp-1'), panels[0]);
assert.equal(generatePanelId(panels), 'P2');
assert.equal(formatPanelSelectorLabel(panels[0]), 'LP-1 (480 V)');
const duplicate = duplicatePanelDefinition(panels[0], panels, 6);
assert.equal(duplicate.id, 'P2');
assert.equal(duplicate.breakers.length, 6);
assert.notEqual(duplicate.breakerDetails[1], panels[0].breakerDetails[1]);

assert.equal(getPanelCircuitCount({ breakers: Array(18) }), 18);
assert.deepEqual(computeBreakerSpan(1, 3, 12), [1, 3, 5]);
assert.equal(getDcPolarityForCircuit(1), '+');
assert.equal(getDcPolarityForCircuit(3), '−');
assert.deepEqual(getPanelPhaseSequence({ phases: 1 }), ['A', 'B']);

assert.deepEqual(collectPanelOptions([{ panel_id: 'P1' }, { id: 'P2' }, { panel_id: 'P1' }]), ['P1', 'P2']);
assert.deepEqual(collectRacewayOptions({
  trays: [{ tray_id: 'T1' }],
  conduits: [{ ductbank_id: 'DB1', conduit_id: 'C1' }],
  ductbanks: [{ id: 'DB2', conduits: [{ conduit_id: 'C2' }] }]
}), ['T1', 'DB1-C1', 'DB2-C2']);

assert.equal(parseTradeSize('1-1/2'), 1.5);
assert.equal(resolveCableTemperatureRating({ insulation_type: 'THHN' }), 90);
assert.ok(conduitEquivalentDiameterMeters({ conduit_type: 'EMT', trade_size: '2' }) > 0);
assert.ok(Math.abs(neherMcGrathTemperature(10, 0.5, 20, 1, 0.5) - 28.7) < 0.5);

console.log('✓ extracted entrypoint models preserve project, panel, schedule, and thermal behavior');
