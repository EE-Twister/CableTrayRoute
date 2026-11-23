import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { SOUTHWIRE_MC_SOURCE, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT, SOURCED_MC_R_X, sourcedCableImpedance } from '../analysis/designSynthesisCableCatalog.mjs';
import { evaluateCorridorTrayCapacity } from '../analysis/designSynthesisRaceways.mjs';
import { applyDesignProposal, previewDesignProposal, validateDesignSynthesisCableCatalogSource } from '../src/design-synthesis/applyProposal.mjs';
import * as dataStore from '../dataStore.mjs';

const expected = {
  '#8 AWG': [606939, 0.810, 0.052, 0.833], '#6 AWG': [606947, 0.510, 0.051, 0.910],
  '#4 AWG': [606954, 0.320, 0.048, 1.012], '#3 AWG': [671892, 0.254, 0.047, 1.070],
  '#2 AWG': [560466, 0.201, 0.045, 1.137], '#1 AWG': [550801, 0.159, 0.046, 1.282],
  '1/0 AWG': [560474, 0.127, 0.044, 1.364], '2/0 AWG': [560482, 0.102, 0.043, 1.459],
  '3/0 AWG': [890339, 0.079, 0.042, 1.567], '4/0 AWG': [383679, 0.063, 0.041, 1.783],
  '250 kcmil': [601377, 0.053, 0.041, 1.917], '350 kcmil': [383646, 0.039, 0.040, 2.131],
  '500 kcmil': [380618, 0.027, 0.039, 2.432], '600 kcmil': [890391, 0.024, 0.039, 2.665],
  '750 kcmil': [890405, 0.019, 0.038, 2.942],
};

test('the complete MC catalog matches the archived manufacturer PDF values and exact stock identities', () => {
  assert.equal(SOUTHWIRE_MC_SOURCE.sha256, 'd01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341');
  assert.equal(SOUTHWIRE_MC_SOURCE.accessedOn, '2026-10-24');
  assert.deepEqual(Object.keys(SOURCED_MC_R_X).sort(), Object.keys(expected).sort());
  assert.ok(Object.isFrozen(SOURCED_MC_R_X));
  for (const [size, [stockId, r, x, od]] of Object.entries(expected)) {
    assert.ok(Object.isFrozen(SOURCED_MC_R_X[size]));
    assert.deepEqual(SOURCED_MC_R_X[size], { r, x, od, stockId: String(stockId), source: 'Southwire SPEC45301 rev1.000.008' });
    const impedance = sourcedCableImpedance(size, 1000);
    assert.equal(impedance.r_ohm_per_kft, r);
    assert.equal(impedance.x_ohm_per_kft, x);
    assert.equal(impedance.cableStockId, String(stockId));
    assert.equal(impedance.cableCatalogFingerprint, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT);
  }
  assert.equal(SOURCED_MC_R_X['500 kcmil'].stockId, '380618', 'Use the selected 2 AWG-ground stock row, not the alternate 4/0-ground row.');
});

test('the corrected #8 OD changes a shared tray boundary that passed with the earlier cached value', () => {
  const edge = { id: 'SHORT', widthIn: 6, depthIn: 6 };
  const thirteen = Array.from({ length: 13 }, (_, index) => ({ id: `C-${index}`, conductor_size: '#8 AWG', conductor_count: 3, cable_rating: 600 }));
  const earlierCachedArea = 13 * Math.PI * 0.821 ** 2 / 4;
  const archivedPdfArea = 13 * Math.PI * 0.833 ** 2 / 4;
  assert.ok(earlierCachedArea < 7, 'The earlier cached OD would place thirteen cables below the 7 in² limit.');
  assert.ok(archivedPdfArea > 7, 'The archived PDF OD places thirteen cables above the limit.');
  assert.equal(evaluateCorridorTrayCapacity({ edge, cables: thirteen, candidateSize: '#8 AWG' }).status, 'blocked');
});

test('generated proposal carries selected stock provenance and uses corrected R in branch voltage drop', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  input.equipment[0].kw = 1;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.equal(proposal.cableCatalogSource.sha256, SOUTHWIRE_MC_SOURCE.sha256);
  const load = input.equipment[0];
  const cable = proposal.cables.find(item => item.loadId === load.id);
  assert.ok(cable);
  assert.equal(cable.conductor_size, '#8 AWG');
  assert.equal(cable.cableStockId, '606939');
  assert.equal(cable.cableCatalogFingerprint, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT);
  assert.equal(cable.r_ohm_per_kft, 0.810);
  const currentA = load.kw * 1000 / (Math.sqrt(3) * load.voltage * load.powerFactor);
  const expectedDrop = 100 * Math.sqrt(3) * currentA * cable.lengthFt / 1000
    * (0.810 * load.powerFactor + 0.052 * Math.sqrt(1 - load.powerFactor ** 2)) / load.voltage;
  assert.ok(Math.abs(cable.voltageDropPct - expectedDrop) < 1e-9);
  assert.equal(validateDesignSynthesisCableCatalogSource(proposal), true);

  for (const mutate of [
    item => { item.outerDiameterIn += 0.001; },
    item => { item.cable_od += 0.001; },
    item => { item.conductor_count = 4; },
    item => { item.cable_rating = 1000; },
    item => { item.constructionSource = 'different manufacturer construction'; },
    item => { item.cableStockId = 'wrong-stock'; },
    item => { item.r_ohm_per_kft += 0.001; },
    item => { item.conductorSize = '#6 AWG'; },
    item => { item.size = '#6 AWG'; },
    item => { item.conductor_material = 'al'; },
    item => { item.source = 'different source'; },
    item => { item.source = 'Southwire SPEC45301 rev1.000.008'; item.impedanceBasis = 'different source'; },
  ]) {
    const changedCable = structuredClone(proposal);
    const selected = changedCable.cables.find(item => item.id === cable.id);
    mutate(selected);
    assert.equal(validateDesignSynthesisCableCatalogSource(changedCable), false);
  }

  const changedDiagram = structuredClone(proposal);
  const diagramCable = changedDiagram.oneLine.sheets.flatMap(sheet => sheet.connections).find(connection => connection.cable.id === cable.id).cable;
  diagramCable.cableStockId = 'wrong-stock';
  assert.equal(validateDesignSynthesisCableCatalogSource(changedDiagram), false);
});

test('malformed cable and One-Line collections return preview diagnostics without throwing or mutating records', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const validProposal = generateDesignProposal(input);
  const capture = () => structuredClone({
    equipment: dataStore.getEquipment(), loads: dataStore.getLoads(), panels: dataStore.getPanels(), cables: dataStore.getCables(),
    trays: dataStore.getTrays(), conduits: dataStore.getConduits(), oneLine: dataStore.getOneLine(),
  });

  for (const malformed of [
    { ...validProposal, cables: { invalid: true } },
    { ...validProposal, oneLine: { sheets: [{ components: {}, connections: {} }] } },
    { ...validProposal, oneLine: { sheets: [{ components: [{ connections: {} }], connections: [] }] } },
  ]) {
    const before = capture();
    let preview;
    assert.doesNotThrow(() => { preview = previewDesignProposal(malformed); });
    assert.equal(preview.ok, false);
    assert.ok(preview.errors.length > 0);
    let applied;
    assert.doesNotThrow(() => { applied = applyDesignProposal(malformed, { previewContext: preview.context }); });
    assert.equal(applied.applied, false);
    assert.deepEqual(capture(), before);
  }
});
