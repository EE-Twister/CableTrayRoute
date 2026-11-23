import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateExistingTray } from '../analysis/designSynthesisExistingTray.mjs';
import { evaluateCorridorTrayCapacity } from '../analysis/designSynthesisRaceways.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const fixture = count => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...input.equipment[0], id: `L-${String(i + 1).padStart(2, '0')}`, tag: `L-${String(i + 1).padStart(2, '0')}` }));
  input.corridors.edges[0].existingTray = { trayId: 'EXISTING-01', construction: 'ladder', inventoryReference: 'Synthetic complete cable inventory', cables: [{ id: 'OWNER-CABLE', use: 'power', conductorSize: '#8 AWG', conductorCount: 3, voltageRatingV: 600, outsideDiameterIn: 0.833, quantity: 5, reference: 'Synthetic cable diameter and rating' }] };
  return input;
};

for (const count of [25, 50]) test(`${count} loads account for declared existing cables in both route selection and final fill`, () => {
  const input = fixture(count); const before = structuredClone(input);
  const proposal = generateDesignProposal(input);
  const short = proposal.cables.filter(row => row.loadId && row.routingDecision.selectedPath.includes('SHORT'));
  const bypass = proposal.cables.filter(row => row.loadId && row.routingDecision.selectedPath.includes('BYPASS-A'));
  // Independent 6-inch ladder allowance 7 in² and supplied 0.833-inch cable diameter.
  const area = Math.PI * 0.833 ** 2 / 4;
  assert.equal(short.length, Math.floor(7 / area) - 5);
  assert.equal(short.length, 7);
  assert.equal(bypass.length, count - 7);
  const evaluation = proposal.racewayEvaluations.find(row => row.racewayId === 'SHORT');
  assert.equal(evaluation.cableCount, 12);
  assert.ok(Math.abs(evaluation.utilizationPercent - 100 * 12 * area / 7) < 1e-10);
  const tray = proposal.trays.find(row => row.id === 'SHORT');
  assert.equal(tray.width, 6);
  assert.deepEqual(tray.existingTrayScreen, { trayId: 'EXISTING-01', inventoryReference: 'Synthetic complete cable inventory', existingCableCount: 5, reuseStatus: 'screening-only-not-applicable' });
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'EXISTING_TRAY_RECONCILIATION_UNRESOLVED'));
  assert.deepEqual(input, before);
});

test('a fixed existing listed width is not replaced by a smaller proposed width', () => {
  const edge = fixture(1).corridors.edges[0]; edge.widthIn = 9; edge.existingTray.cables = [];
  const result = evaluateCorridorTrayCapacity({ edge, candidateSize: '#8 AWG' });
  assert.equal(result.status, 'pass');
  assert.equal(result.widthIn, 9);
  assert.equal(result.evaluation.widthIn, 9);
  assert.equal(result.evaluation.allowable.smallCableAreaIn2, 10.5);
});

test('an existing cable sharing a generated circuit identity blocks the final fill evaluation', () => {
  const input = fixture(1);
  input.corridors.edges[0].existingTray.cables[0].id = 'c-l-01';
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'EXISTING_CABLE_ID_CONFLICT'));
  assert.equal(proposal.racewayEvaluations.some(row => row.racewayId === 'SHORT' && row.status === 'pass'), false);
});

test('missing, unsupported and malformed inventories never produce a capacity pass', () => {
  const changes = [
    edge => { delete edge.existingTray.inventoryReference; },
    edge => { delete edge.existingTray.cables; },
    edge => { edge.existingTray.construction = 'solid'; },
    edge => { edge.widthIn = 7; },
    edge => { edge.existingTray.cables[0].conductorCount = 1; },
    edge => { delete edge.existingTray.cables[0].use; },
    edge => { edge.existingTray.cables[0].use = 'signal'; },
    edge => { edge.existingTray.cables[0].voltageRatingV = 4160; },
    edge => { edge.existingTray.cables[0].outsideDiameterIn = ''; },
    edge => { edge.existingTray.cables[0].quantity = 1.5; },
    edge => { edge.existingTray.cables[0].reference = ''; },
    edge => { edge.existingTray.cables.push({ ...edge.existingTray.cables[0], id: 'owner-cable' }); },
    edge => { edge.existingTray.cables[0].conductorSize = 'unknown'; },
    edge => { edge.existingTray.cables[0].other = true; },
  ];
  for (const change of changes) {
    const input = fixture(1); const edge = input.corridors.edges[0]; change(edge);
    assert.equal(validateExistingTray(edge).ok, false);
    assert.equal(evaluateCorridorTrayCapacity({ edge, candidateSize: '#8 AWG' }).status, 'blocked');
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked');
    assert.ok(proposal.issues.some(item => item.code.startsWith('EXISTING_')));
  }
});
