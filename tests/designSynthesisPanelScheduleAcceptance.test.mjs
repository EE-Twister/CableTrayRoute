import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { normalizeProjectEntities } from '../analysis/projectIntegration.mjs';
import { distributionPartitionFixture, nonmotorDistributionPartitionFixture } from './helpers/distributionPartitionFixture.mjs';
import { getPanelCircuitCount } from '../src/panel-schedule/phaseModel.js';
import { ensurePanelBreakerCapacity, ensurePanelBreakerLayout, getLoadBreakerSpan, initializeLayoutFromLoads, syncBranchDeviceType } from '../src/panel-schedule/breakerLayoutModel.js';
import { calculatePanelTotalsFromData } from '../src/panel-schedule/totalsModel.js';

const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);

function checkSchedule(input, proposal) {
  const canonical = normalizeProjectEntities(proposal);
  const allAssigned = [];
  for (const panel of canonical.panels) {
    const memberIds = proposal.panels.find(row => row.id.toLowerCase() === panel.id).loadIds;
    const assigned = canonical.loads.filter(load => load.panelId === panel.id);
    assert.deepEqual(assigned.map(load => load.id).sort(), memberIds.map(id => id.toLowerCase()).sort());
    allAssigned.push(...assigned.map(load => load.id));
    const count = getPanelCircuitCount(panel);
    assert.ok(count >= assigned.length * 3 && count <= 512);
    assert.equal(panel.breakers.length, count);
    assert.equal(panel.breakerLayout.length, count);
    const feeder = proposal.cables.find(cable => String(cable.to).toLowerCase() === panel.id);
    assert.equal(panel.fedFrom, feeder.from);
    if (feeder.protectiveDevice) near(Number(panel.mainRating), Number(feeder.protectiveDevice.continuousCurrentA));
    const occupied = new Set();
    for (const load of assigned) {
      const start = Number(load.breaker);
      assert.ok(Number.isInteger(start) && start >= 1);
      assert.equal(load.breakerPoles, 3);
      const expected = [start, start + 2, start + 4];
      assert.deepEqual(getLoadBreakerSpan(load, panel, count), expected);
      for (const [position, slot] of expected.entries()) {
        assert.ok(slot <= count && !occupied.has(slot), `${panel.id}: overlapping or unavailable circuit ${slot}`);
        occupied.add(slot);
        assert.equal(panel.breakers[slot - 1], load.tag || load.ref || load.id);
        assert.deepEqual(panel.breakerLayout[slot - 1], { start, size: 3, position });
      }
      const branch = proposal.cables.find(cable => String(cable.loadId).toLowerCase() === load.id);
      if (branch.protectiveDevice) near(Number(panel.breakerDetails[String(start)].rating), Number(branch.protectiveDevice.continuousCurrentA));
    }
    const sourceLoads = input.equipment.filter(load => memberIds.includes(load.id));
    const totals = calculatePanelTotalsFromData(panel, assigned);
    near(totals.connectedKw, sourceLoads.reduce((sum, load) => sum + load.kw, 0));
    near(totals.connectedKva, sourceLoads.reduce((sum, load) => sum + load.kw / load.powerFactor, 0));
    const before = structuredClone(panel);
    ensurePanelBreakerCapacity(panel, count);
    assert.equal(ensurePanelBreakerLayout(panel, count).changed, false);
    assert.equal(initializeLayoutFromLoads(panel, panel.id, canonical.loads, count), false);
    assert.equal(syncBranchDeviceType(panel).updated, false);
    assert.deepEqual(panel, before, 'Opening the schedule must not seed or rewrite generated layout fields.');
    assert.ok(!panel.shortCircuitRating, 'A proposed circuit layout cannot invent an assembly SCCR.');
  }
  assert.deepEqual(allAssigned.sort(), canonical.loads.map(load => load.id).sort());
}

test('50 nonmotor loads retain exact canonical assignments and independently checked 3-pole spans and totals', () => {
  const input = nonmotorDistributionPartitionFixture(50);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  checkSchedule(input, proposal);
});

test('the original 30-load example is already normalized for downstream Panel Schedule rendering', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url)));
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  checkSchedule(input, proposal);
});

test('motor panel positions remain preliminary and do not bypass unresolved protection', () => {
  const input = distributionPartitionFixture(25);
  const proposal = generateDesignProposal(input);
  checkSchedule(input, proposal);
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.distributionBaseline, null);
  assert.ok(proposal.issues.some(issue => issue.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});
