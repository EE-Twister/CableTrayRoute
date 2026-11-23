import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Papa from 'papaparse';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildPreliminaryPanelSchedule } from '../src/design-synthesis/preliminaryPanelSchedule.mjs';

function fixture(count) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const base = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...base[i % base.length], id: `L-${i}`, tag: `L-${i}`, kw: 2 }));
  Object.assign(input.equipment[0], { kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
    ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic design current' }, nameplateCurrentA: 12.8,
    nameplateHorsepower: 10, nameplateFrequencyHz: 60, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol',
  } });
  input.supply.voltageSystem = { connection: 'wye', grounding: 'solid', lineToGroundVoltageV: 277, reference: 'Synthetic supply' };
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source impedance' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', enclosureMm: { height: 610, width: 305, depth: 205 } };
  return generateDesignProposal(input);
}

function parse(csv) {
  const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
  assert.deepEqual(result.errors, []);
  return result.data;
}

for (const count of [25, 50]) test(`${count} loads export every panel space with the generated assignments`, () => {
  const proposal = fixture(count);
  assert.equal(proposal.status, 'blocked');
  const before = JSON.stringify(proposal);
  const schedule = buildPreliminaryPanelSchedule(proposal);
  assert.equal(schedule.ok, true, schedule.message);
  const records = parse(schedule.csv);
  assert.equal(records.length, proposal.panels.reduce((sum, panel) => sum + panel.circuitCount, 0));
  for (const load of proposal.loads) {
    const rows = records.filter(row => row['Load ID'] === load.id);
    assert.equal(rows.length, load.breakerPoles);
    assert.ok(rows.every(row => row['Panel ID'] === load.panelRef && Number(row['Branch start circuit']) === load.breaker));
    assert.ok(rows.every(row => row['Review basis'] === 'PRELIMINARY SCREENING - NOT APPROVED' && row['Proposal status'] === 'blocked'));
    assert.ok(rows.every(row => row['Cable ID'] === proposal.cables.find(cable => cable.loadId === load.id).id));
  }
  assert.ok(records.some(row => row['Circuit status'] === 'unassigned'));
  assert.match(records.find(row => row['Load type'] === 'motor')['Protection review status'], /unresolved/);
  assert.equal(JSON.stringify(proposal), before);
});

test('inconsistent circuit layouts and identities cannot produce a misleading export', () => {
  const proposal = fixture(25);
  const load = proposal.loads[0];
  const panel = proposal.panels.find(item => item.id === load.panelRef);
  const initial = structuredClone(proposal);
  panel.breakerLayout[load.breaker - 1].start += 1;
  assert.equal(buildPreliminaryPanelSchedule(proposal).ok, false);
  const missing = structuredClone(initial);
  missing.panels[0].loadIds.pop();
  assert.equal(buildPreliminaryPanelSchedule(missing).ok, false);
  const duplicates = structuredClone(initial);
  duplicates.cables.push(structuredClone(duplicates.cables.find(item => item.loadId)));
  assert.equal(buildPreliminaryPanelSchedule(duplicates).ok, false);
  const wrongEndpoint = structuredClone(initial);
  wrongEndpoint.cables.find(item => item.loadId).from = 'wrong';
  assert.equal(buildPreliminaryPanelSchedule(wrongEndpoint).ok, false);
  assert.equal(buildPreliminaryPanelSchedule({ panels: [], loads: [] }).ok, false);
});

test('spreadsheet formula-like labels are escaped and absent ratings remain blank', () => {
  const proposal = fixture(25);
  const panel = proposal.panels[0];
  panel.tag = '=SUM(1,1)';
  panel.mainRating = '';
  const records = parse(buildPreliminaryPanelSchedule(proposal).csv);
  const record = records.find(row => row['Panel ID'] === panel.id);
  assert.equal(record['Panel tag'], "'=SUM(1,1)");
  assert.equal(record['Panel main candidate (A)'], '');
});
