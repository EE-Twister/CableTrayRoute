import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Papa from 'papaparse';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildPreliminaryCableSchedule } from '../src/design-synthesis/preliminaryCableSchedule.mjs';

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

for (const count of [25, 50]) test(`${count} loads export every proposed cable, route, and motor candidate without implying approval`, () => {
  const proposal = fixture(count);
  assert.equal(proposal.status, 'blocked');
  const before = JSON.stringify(proposal);
  const schedule = buildPreliminaryCableSchedule(proposal);
  assert.equal(schedule.ok, true);
  const records = parse(schedule.csv);
  assert.equal(records.length, proposal.cables.length);
  const routes = proposal.routeResults.batchResults;
  for (const cable of proposal.cables) {
    const record = records.find(row => row['Cable ID'] === cable.id);
    assert.ok(record, cable.id);
    assert.equal(record['Review basis'], 'PRELIMINARY SCREENING - NOT APPROVED');
    assert.equal(record['Proposal status'], 'blocked');
    assert.equal(record['Input signature'], proposal.inputSignature);
    assert.equal(record['From ID'], cable.from);
    assert.equal(record['To ID'], cable.to);
    assert.equal(record['Conductor size'], cable.conductor_size);
    assert.equal(Number(record['Cable length (ft)']), cable.lengthFt);
    const route = routes.find(row => row.cable === cable.id);
    assert.equal(record['Route status'], route.status);
    for (const segment of route.route_segments) assert.ok(record['Ordered route segments'].includes(segment.raceway_id));
  }
  const motorCable = proposal.cables.find(cable => cable.motor);
  const motorRecord = records.find(row => row['Cable ID'] === motorCable.id);
  const candidate = proposal.motorStarterCandidates.cases.find(row => row.motorId === motorCable.loadId).candidate;
  assert.equal(motorRecord['Motor contactor candidate'], candidate.contactor.catalogNumber);
  assert.equal(motorRecord['Motor overload candidate'], candidate.overloadRelay.catalogNumber);
  assert.equal(motorRecord['Motor short-circuit device candidate'], candidate.shortCircuitController.catalogNumber);
  assert.match(motorRecord['Protection review status'], /unresolved/);
  assert.equal(JSON.stringify(proposal), before);
});

test('ambiguous and mismatched routes are not assigned, missing cables cannot export, and CSV text is safe for spreadsheets', () => {
  const proposal = fixture(25);
  const cable = proposal.cables[0];
  const route = proposal.routeResults.batchResults.find(row => row.cable === cable.id);
  proposal.routeResults.batchResults.push(structuredClone(route));
  cable.from_tag = '=HYPERLINK("https://example.invalid","click")';
  cable.to_tag = '  +1';
  let record = parse(buildPreliminaryCableSchedule(proposal).csv).find(row => row['Cable ID'] === cable.id);
  assert.equal(record['Route status'], 'ambiguous');
  assert.equal(record['Ordered route segments'], '');
  assert.equal(record['From tag'], `'${cable.from_tag}`);
  assert.equal(record['To tag'], `'${cable.to_tag}`);
  proposal.routeResults.batchResults.pop();
  route.to = 'OTHER';
  record = parse(buildPreliminaryCableSchedule(proposal).csv).find(row => row['Cable ID'] === cable.id);
  assert.equal(record['Route status'], 'endpoint mismatch');
  assert.equal(record['Ordered route segments'], '');
  assert.equal(buildPreliminaryCableSchedule({ cables: [] }).ok, false);
  assert.equal(buildPreliminaryCableSchedule({ cables: [{ id: 'C' }, { id: 'C' }] }).ok, false);
});
