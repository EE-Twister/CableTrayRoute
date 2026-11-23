import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Papa from 'papaparse';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildPreliminaryRacewaySchedule } from '../src/design-synthesis/preliminaryRacewaySchedule.mjs';

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

for (const count of [25, 50]) test(`${count} loads retain every routed tray and conduit assignment in the preliminary schedule`, () => {
  const proposal = fixture(count);
  assert.equal(proposal.status, 'blocked');
  const before = JSON.stringify(proposal);
  const schedule = buildPreliminaryRacewaySchedule(proposal);
  assert.equal(schedule.ok, true, schedule.message);
  const result = parse(schedule.csv);
  assert.equal(result.length, proposal.trays.length + proposal.conduits.length);
  for (const item of [...proposal.trays, ...proposal.conduits]) {
    const row = result.find(entry => entry['Raceway ID'] === item.id);
    assert.ok(row, item.id);
    const matchingRoutes = proposal.routeResults.batchResults.filter(route => route.route_segments.some(segment => segment.raceway_id === item.id));
    assert.equal(row['Review basis'], 'PRELIMINARY SCREENING - NOT APPROVED');
    assert.equal(row['Proposal status'], 'blocked');
    assert.equal(row['Input signature'], proposal.inputSignature);
    assert.equal(Number(row['Assigned generated cable count']), matchingRoutes.length);
    assert.deepEqual(JSON.parse(row['Assigned generated cable IDs']).sort(), matchingRoutes.map(route => route.cable).sort());
    assert.equal(Number(row['Start X (ft)']), item.start_x);
    assert.equal(Number(row['End Y (ft)']), item.end_y);
    assert.equal(Number(row['Route length (ft)']), matchingRoutes[0].route_segments.find(segment => segment.raceway_id === item.id).length);
    if (row['Raceway type'] === 'tray') {
      const evaluation = proposal.racewayEvaluations.find(entry => entry.racewayId === item.id);
      assert.equal(Number(row['Tray limit utilization (%)']), evaluation.utilizationPercent);
      assert.equal(row['Conduit area fill (%)'], '');
    } else {
      const evidence = proposal.installationCoverage.flatMap(entry => entry.segments).find(segment => segment.conduitId === item.id);
      assert.equal(Number(row['Conduit area fill (%)']), evidence.fillPercent);
      assert.equal(row['Tray limit utilization (%)'], '');
    }
  }
  assert.equal(JSON.stringify(proposal), before);
});

test('inconsistent route identities, geometry and incomplete paths cannot export as a complete schedule', () => {
  const proposal = fixture(25);
  const changed = structuredClone(proposal);
  changed.routeResults.batchResults[0].route_segments[0].start[0] += 1;
  assert.equal(buildPreliminaryRacewaySchedule(changed).ok, false);
  const duplicate = structuredClone(proposal);
  duplicate.routeResults.batchResults.push(structuredClone(duplicate.routeResults.batchResults[0]));
  assert.equal(buildPreliminaryRacewaySchedule(duplicate).ok, false);
  const missing = structuredClone(proposal);
  missing.routeResults.batchResults.pop();
  assert.equal(buildPreliminaryRacewaySchedule(missing).ok, false);
  const length = structuredClone(proposal);
  length.routeResults.batchResults[0].total_length += 1;
  assert.equal(buildPreliminaryRacewaySchedule(length).ok, false);
  const endpoint = structuredClone(proposal);
  endpoint.routeResults.batchResults[0].to = 'OTHER';
  assert.equal(buildPreliminaryRacewaySchedule(endpoint).ok, false);
  const idCollision = structuredClone(proposal);
  idCollision.conduits[0].id = idCollision.trays[0].id;
  assert.equal(buildPreliminaryRacewaySchedule(idCollision).ok, false);
});

test('spreadsheet formula-like references are treated as text', () => {
  const proposal = fixture(25);
  proposal.trays[0].existingTrayScreen = { existingCableCount: 2, inventoryReference: '=HYPERLINK("https://example.invalid","click")' };
  const row = parse(buildPreliminaryRacewaySchedule(proposal).csv).find(entry => entry['Raceway ID'] === proposal.trays[0].id);
  assert.equal(row['Existing inventory reference'], `'${proposal.trays[0].existingTrayScreen.inventoryReference}`);
  assert.equal(row['Existing cable count'], '2');
});

test('cable identities with separators and quotes remain distinct', () => {
  const proposal = fixture(25);
  const route = proposal.routeResults.batchResults.find(entry => entry.route_segments.every(segment => segment.type === 'tray'));
  const cable = proposal.cables.find(entry => entry.id === route.cable);
  cable.id = '=Feeder; "A"';
  route.cable = cable.id;
  const schedule = buildPreliminaryRacewaySchedule(proposal);
  assert.equal(schedule.ok, true, schedule.message);
  const tray = parse(schedule.csv).find(entry => entry['Raceway ID'] === route.route_segments[0].raceway_id);
  assert.ok(JSON.parse(tray['Assigned generated cable IDs']).includes(cable.id));
});
