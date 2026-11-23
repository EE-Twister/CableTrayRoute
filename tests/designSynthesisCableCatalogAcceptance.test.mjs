import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { calculateSourcedVoltageDrop, generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { SOUTHWIRE_MC_SOURCE, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT, SOURCED_MC_R_X } from '../analysis/designSynthesisCableCatalog.mjs';
import { evaluateCorridorTrayCapacity } from '../analysis/designSynthesisRaceways.mjs';
import { evaluateTrayFill } from '../analysis/trayFill.mjs';

// Independent transcription of the downloaded manufacturer PDF, visually
// checked on pages 2 (diameter) and 3 (AC resistance at 75 C / reactance at 60 Hz).
// The web search cache has different values under the same printed revision.
const SHA256 = 'd01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341';
const EXPECTED = {
  '#8 AWG': ['606939', 0.810, 0.052, 0.833],
  '#6 AWG': ['606947', 0.510, 0.051, 0.910],
  '#4 AWG': ['606954', 0.320, 0.048, 1.012],
  '#3 AWG': ['671892', 0.254, 0.047, 1.070],
  '#2 AWG': ['560466', 0.201, 0.045, 1.137],
  '#1 AWG': ['550801', 0.159, 0.046, 1.282],
  '1/0 AWG': ['560474', 0.127, 0.044, 1.364],
  '2/0 AWG': ['560482', 0.102, 0.043, 1.459],
  '3/0 AWG': ['890339', 0.079, 0.042, 1.567],
  '4/0 AWG': ['383679', 0.063, 0.041, 1.783],
  '250 kcmil': ['601377', 0.053, 0.041, 1.917],
  '350 kcmil': ['383646', 0.039, 0.040, 2.131],
  '500 kcmil': ['380618', 0.027, 0.039, 2.432],
  '600 kcmil': ['890391', 0.024, 0.039, 2.665],
  '750 kcmil': ['890405', 0.019, 0.038, 2.942],
};
const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
};
const fixture = count => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `L-${index + 1}`, tag: `L-${index + 1}` }));
  return input;
};

test('all fifteen catalog rows match the actual archived PDF rather than the older search cache', () => {
  assert.equal(SOUTHWIRE_MC_SOURCE.sha256, SHA256);
  assert.equal(Object.keys(SOURCED_MC_R_X).length, 15);
  for (const [size, [stock, resistance, reactance, diameter]] of Object.entries(EXPECTED)) {
    const actual = SOURCED_MC_R_X[size];
    assert.ok(actual, size);
    assert.equal(actual.r, resistance, `${size} AC resistance`);
    assert.equal(actual.x, reactance, `${size} inductive reactance`);
    assert.equal(actual.od, diameter, `${size} outside diameter`);
    assert.equal(actual.stockId, stock, `${size} exact stock construction`);
  }
});

test('the revised resistance changes an independently calculated voltage-drop boundary', () => {
  const currentA = 10000 / (Math.sqrt(3) * 480 * 0.9);
  const drop = calculateSourcedVoltageDrop({ current: currentA, voltage: 480, phases: 3, powerFactor: 0.9, conductorSize: '#8 AWG', lengthFt: 150 });
  // Derive the expected result from the physical three-phase drop equation.
  const expectedDrop = 100 * Math.sqrt(3) * currentA * (0.810 * 0.9 + 0.052 * Math.sqrt(1 - 0.9 ** 2)) * 150 / 1000 / 480;
  const oldDrop = 100 * Math.sqrt(3) * currentA * (0.786 * 0.9 + 0.052 * Math.sqrt(1 - 0.9 ** 2)) * 150 / 1000 / 480;
  close(drop, expectedDrop);
  close(drop - oldDrop, 0.015625);
  assert.ok(oldDrop < 0.536 && drop > 0.536, 'The source correction must change a limit decision, not only its attribution.');
});

test('the exact revised cable diameter blocks a thirteenth cable on the six-inch tray', () => {
  const tray = { tray_type: 'ladder', construction: 'ladder', width: 6, inside_width: 6, depth: 6, usable_inside_depth: 6 };
  const rows = diameter => Array.from({ length: 13 }, (_, index) => ({ id: `C-${index}`, conductor_size: '#8 AWG', conductor_count: 3, cable_rating: 600, cable_od: diameter }));
  assert.ok(13 * Math.PI * 0.821 ** 2 / 4 < 7);
  assert.ok(13 * Math.PI * 0.833 ** 2 / 4 > 7);
  assert.equal(evaluateTrayFill(tray, rows(0.821)).status, 'pass');
  assert.notEqual(evaluateTrayFill(tray, rows(0.833)).status, 'pass');
  const reserved = Array.from({ length: 12 }, (_, index) => ({ id: `C-${index}`, conductor_size: '#8 AWG' }));
  const result = evaluateCorridorTrayCapacity({ edge: { id: 'SHORT', widthIn: 6, depthIn: 6 }, cables: reserved, candidateSize: '#8 AWG' });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'shared-tray-capacity');
});

test('25/50-load generation keeps routing, phase impedance and cable diameter on the same catalog', () => {
  for (const count of [25, 50]) {
    const input = fixture(count);
    const original = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.equal(proposal.loads.length, count);
    const branches = proposal.cables.filter(cable => cable.loadId);
    assert.equal(branches.length, count);
    assert.equal(branches.filter(cable => cable.routingDecision.selectedPath.includes('SHORT')).length, 12);
    assert.equal(branches.filter(cable => cable.routingDecision.selectedPath.includes('BYPASS-A')).length, count - 12);
    for (const cable of proposal.cables) {
      const [stock, resistance, reactance, diameter] = EXPECTED[cable.conductor_size];
      assert.equal(cable.r_ohm_per_kft, resistance);
      assert.equal(cable.x_ohm_per_kft, reactance);
      close(cable.cable_od, diameter);
      close(cable.outerDiameterIn, diameter);
      assert.equal(cable.conductor_count, 3);
      assert.equal(cable.cableStockId, stock);
      assert.equal(cable.cableCatalogFingerprint, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT);
      const connection = proposal.oneLine.sheets[0].connections.find(row => row.cableId === cable.id);
      assert.ok(connection, cable.id);
      assert.equal(connection.cable.cableStockId, stock);
      assert.equal(connection.cable.cableCatalogFingerprint, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT);
    }
    assert.ok(proposal.racewayEvaluations.every(row => row.status === 'pass'));
    assert.equal(proposal.oneLine.sheets[0].connections.length, proposal.cables.length);
    assert.deepEqual(input, original);
  }
});
