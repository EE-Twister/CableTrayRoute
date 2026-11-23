import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

test('equipment-first sample generates a complete connected proposal with evaluated voltage drop', () => {
  const proposal = generateDesignProposal(sample());
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.equal(proposal.loads.length, 30);
  assert.ok(proposal.inputSignature);
  assert.ok(proposal.panels.length > 1);
  assert.equal(proposal.cables.length, proposal.loads.length + proposal.panels.length);
  const equipmentTags = new Set(proposal.equipment.map(row => row.tag));
  for (const cable of proposal.cables) {
    assert.ok(equipmentTags.has(cable.from_tag), `Missing physical source ${cable.from_tag}`);
    assert.ok(equipmentTags.has(cable.to_tag), `Missing physical destination ${cable.to_tag}`);
    assert.ok(Number.isFinite(cable.voltageDropPct), `Unevaluated voltage drop for ${cable.tag}`);
    assert.ok(cable.conductor_size, `No selected conductor for ${cable.tag}`);
  }
  const components = proposal.oneLine.sheets.flatMap(sheet => sheet.components);
  const connections = proposal.oneLine.sheets.flatMap(sheet => sheet.connections);
  const componentIds = new Set(components.map(component => component.id));
  assert.equal(connections.length, proposal.cables.length);
  for (const connection of connections) {
    assert.ok(componentIds.has(connection.from), `Dangling one-line source ${connection.from}`);
    assert.ok(componentIds.has(connection.to || connection.target), 'Dangling one-line destination');
  }
  assert.equal(proposal.routeResults.batchResults.length, proposal.cables.length);
  for (const result of proposal.routeResults.batchResults) {
    const cable = proposal.cables.find(row => row.tag === result.cable);
    assert.equal(cable.length, result.total_length, 'Schedule and route lengths must agree, including zero');
    assert.ok(Array.isArray(result.route_segments));
    let length = 0;
    let previousEnd = null;
    for (const segment of result.route_segments) {
      assert.equal(typeof segment, 'object', 'Route segments must contain geometry, not just edge identifiers');
      assert.ok(Number.isFinite(segment.length));
      assert.ok(Array.isArray(segment.start) && segment.start.length === 3);
      assert.ok(Array.isArray(segment.end) && segment.end.length === 3);
      const measured = Math.hypot(...segment.end.map((value, index) => value - segment.start[index]));
      assert.ok(Math.abs(measured - segment.length) < 1e-7, 'Segment length must match its physical geometry');
      if (previousEnd) assert.deepEqual(segment.start, previousEnd, 'Route must be continuous and correctly oriented');
      previousEnd = segment.end;
      length += segment.length;
    }
    assert.ok(Math.abs(length - result.total_length) < 1e-7, 'Include endpoint attachments in reported route geometry');
  }
});

test('manufacturer resistance and reactance produce independently calculated branch voltage drop', () => {
  const input = sample();
  const proposal = generateDesignProposal(input);
  // Southwire SPEC45301 rev1.000.008 archived PDF p3, R at 75 C and X at
  // 60 Hz. Separate transcription intentionally avoids importing the catalog.
  const impedance = {
    '#8 AWG': [0.810, 0.052], '#6 AWG': [0.510, 0.051],
    '#4 AWG': [0.320, 0.048], '#3 AWG': [0.254, 0.047],
    '#2 AWG': [0.201, 0.045], '#1 AWG': [0.159, 0.046],
    '1/0 AWG': [0.127, 0.044], '2/0 AWG': [0.102, 0.043],
    '3/0 AWG': [0.079, 0.042], '4/0 AWG': [0.063, 0.041],
    '250 kcmil': [0.053, 0.041], '350 kcmil': [0.039, 0.040],
    '500 kcmil': [0.027, 0.039], '600 kcmil': [0.024, 0.039], '750 kcmil': [0.019, 0.038],
  };
  let verified = 0;
  for (const load of input.equipment) {
    const cable = proposal.cables.find(row => row.to_tag === load.tag);
    assert.ok(cable, `Missing branch for ${load.tag}`);
    const expectedCurrent = load.kw * 1000 / (Math.sqrt(3) * load.voltage * load.powerFactor);
    assert.ok(Math.abs(cable.est_load - expectedCurrent) < 1e-7);
    const z = impedance[cable.conductor_size];
    assert.ok(z, `Sample did not select a supported sourced construction: ${cable.conductor_size}`);
    const expectedDrop = 100 * Math.sqrt(3) * expectedCurrent * cable.length / 1000
      * (z[0] * load.powerFactor + z[1] * Math.sqrt(1 - load.powerFactor ** 2)) / load.voltage;
    assert.ok(Number.isFinite(cable.voltageDropPct));
    assert.ok(Math.abs(cable.voltageDropPct - expectedDrop) < 1e-7,
      `${cable.tag}: expected ${expectedDrop}% from manufacturer R/X, got ${cable.voltageDropPct}%`);
    verified += 1;
  }
  assert.equal(verified, 30);
});

test('the equipment-first workflow covers both 25 and 50 loads without omitted branches', () => {
  for (const count of [25, 50]) {
    const input = sample();
    const original = input.equipment;
    input.equipment = Array.from({ length: count }, (_, index) => ({
      ...original[index % original.length], id: `ACCEPT-${index}`, tag: `ACCEPT-${index}`,
    }));
    input.supply.capacityKva = 10000;
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', `${count} loads: ${JSON.stringify(proposal.issues)}`);
    assert.equal(proposal.loads.length, count);
    for (const load of input.equipment) {
      assert.equal(proposal.cables.filter(cable => cable.to_tag === load.tag).length, 1);
    }
  }
});

test('corridor endpoint references resolve case and surrounding whitespace consistently through routing and raceways', () => {
  const original = sample();
  const baseline = generateDesignProposal(original);
  assert.equal(baseline.status, 'proposal', JSON.stringify(baseline.issues));
  const input = structuredClone(original);
  input.corridors.edges.forEach(edge => {
    edge.from = `  ${String(edge.from).toLowerCase()} `;
    edge.to = ` ${String(edge.to).toLowerCase()}  `;
  });
  const before = structuredClone(input);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.deepEqual(input, before, 'Generation must not rewrite supplied references');
  assert.deepEqual(proposal.inputs.original.corridors, before.corridors);
  assert.deepEqual(proposal.routeResults, baseline.routeResults);
  assert.deepEqual(proposal.trays, baseline.trays);
  assert.deepEqual(proposal.cables.map(cable => [cable.id, cable.length, cable.conductor_size]),
    baseline.cables.map(cable => [cable.id, cable.length, cable.conductor_size]));
  const unknown = structuredClone(input);
  unknown.corridors.edges[0].from = 'missing-node';
  assert.ok(generateDesignProposal(unknown).issues.some(item => item.code === 'INVALID_CORRIDOR_ENDPOINT'));
  const ambiguous = structuredClone(input);
  ambiguous.corridors.nodes.push({ ...ambiguous.corridors.nodes[0], id: ` ${ambiguous.corridors.nodes[0].id.toLowerCase()} ` });
  assert.ok(generateDesignProposal(ambiguous).issues.some(item => item.code === 'DUPLICATE_ID'));
});

test('invalid equipment and corridor shapes return a blocked diagnostic instead of crashing', () => {
  for (const invalid of [
    { equipment: {} }, { equipment: [null] },
    { corridors: { nodes: {}, edges: [] } },
    { corridors: { nodes: [], edges: {} } },
  ]) {
    const proposal = generateDesignProposal({ ...sample(), ...invalid });
    assert.equal(proposal.status, 'blocked');
    assert.ok(proposal.issues.some(issue => issue.severity === 'blocking'));
    assert.ok(!proposal.checks.some(check => check.id === 'voltageDrop' && check.status === 'pass'));
  }
});

test('contradictory geometry, identities, and criteria never produce an applicable proposal', () => {
  const changes = {
    nullInput: () => null,
    nullEdge: input => { input.corridors.edges = [null]; return input; },
    negativeDepth: input => { input.corridors.edges[0].depthIn = -1; return input; },
    duplicateNode: input => { input.corridors.nodes.push({ ...input.corridors.nodes[0], x: 999 }); return input; },
    panelTooSmall: input => { input.criteria.maxPanelLoadKva = 1; return input; },
    invalidDuty: input => { input.equipment[0].duty = 'unknown'; return input; },
    sourceLoadCollision: input => { input.equipment[0].id = input.supply.id; return input; },
    invalidTemperature: input => { input.criteria.temperatureRatingC = 125; return input; },
    unsupportedFrequency: input => { input.supply.frequencyHz = 50; return input; },
  };
  for (const [name, change] of Object.entries(changes)) {
    const proposal = generateDesignProposal(change(sample()));
    assert.equal(proposal.status, 'blocked', `${name} must return an explicit blocked result`);
    assert.ok(proposal.issues.some(issue => issue.severity === 'blocking'), name);
  }
});

test('an infeasible tray capacity blocks the integrated proposal and appears in its checks', () => {
  const input = sample();
  input.corridors.edges.forEach(edge => { edge.widthIn = 2; });
  const proposal = generateDesignProposal(input);
  assert.ok(proposal.issues.some(issue => issue.code === 'RACEWAY-CAPACITY-BLOCKED'));
  assert.equal(proposal.status, 'blocked', 'A late raceway failure must invalidate the whole design');
  assert.ok(proposal.checks.some(check => /raceway|tray/i.test(check.id) && check.status === 'fail'));
});

test('longer routes trigger resizing to meet the combined source-to-load voltage-drop limit', () => {
  const input = sample();
  const original = generateDesignProposal(input);
  // Actual device ratings can require larger conductors than load ampacity
  // alone. Three times the route length exercises voltage-drop resizing even
  // after that legitimate protective-device-driven increase.
  for (const point of [input.supply, ...input.equipment, ...input.corridors.nodes]) {
    for (const axis of ['x', 'y', 'z']) point[axis] *= 3;
  }
  input.criteria.maxEndpointAttachmentFt *= 3;
  const revised = generateDesignProposal(input);
  assert.equal(revised.status, 'proposal', JSON.stringify(revised.issues));
  for (const cable of revised.cables.filter(row => row.loadId)) {
    assert.ok(Number.isFinite(cable.combinedVoltageDropPct));
    assert.ok(cable.combinedVoltageDropPct <= input.criteria.voltageDropLimitPct + 1e-8);
  }
  assert.ok(revised.cables.some(cable => original.cables.find(row => row.id === cable.id)?.conductor_size !== cable.conductor_size),
    'Longer routes require at least one new conductor selection');
});

test('invalid installation criteria and generated tag collisions are explicit blockers', () => {
  const invalidCriteria = [
    { ambientTempC: 'warm' }, { bundledConductors: 0 }, { installationType: 'unknown' },
    { conductorMaterial: 'steel' }, { terminalRatingC: 90 }, { code: 'unknown' },
    { maxEndpointAttachmentFt: -1 },
  ];
  for (const criteria of invalidCriteria) {
    const input = sample();
    Object.assign(input.criteria, criteria);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked', JSON.stringify(criteria));
    assert.ok(proposal.issues.some(issue => issue.severity === 'blocking'));
  }
  const collision = sample();
  collision.equipment[0].tag = 'DP-01';
  const proposal = generateDesignProposal(collision);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(issue => issue.severity === 'blocking' && /COLLISION|RESERVED/.test(issue.code)));
});

test('non-continuous duty aliases have identical currents, requirements, and sizes', () => {
  const run = duty => {
    const input = sample();
    input.equipment.forEach(load => { load.duty = duty; });
    return generateDesignProposal(input);
  };
  const continuous = run('continuous');
  const intermittent = run('intermittent');
  for (const duty of ['non-continuous', 'INTERMITTENT']) {
    const result = run(duty);
    assert.equal(result.status, 'proposal');
    for (const cable of result.cables.filter(row => row.loadId)) {
      const expected = intermittent.cables.find(row => row.id === cable.id);
      assert.ok(cable.protectiveRequirement.ampereRatingA >= cable.currentA);
      assert.equal(cable.protectiveRequirement.ampereRatingA, expected.protectiveRequirement.ampereRatingA);
      assert.equal(cable.conductor_size, expected.conductor_size);
    }
  }
  for (const cable of continuous.cables.filter(row => row.loadId)) {
    const observations = continuous.studyValidation.history.flatMap(attempt => attempt.final?.circuits || []).filter(row => row.id === cable.id);
    const nominalRequirement = 1.25 * cable.currentA;
    const operatingBound = Math.max(nominalRequirement, ...observations.map(row => row.currentA * 1.25));
    assert.ok(cable.protectiveRequirement.ampereRatingA >= nominalRequirement - 1e-8);
    assert.ok(cable.protectiveRequirement.ampereRatingA <= operatingBound + 1e-8);
    assert.ok(observations.every(row => row.dutyFactor === 1.25));
  }
});

test('a source tag distinct from its identity remains resolvable in generated schedules', () => {
  const input = sample();
  input.supply.tag = 'Main Switchgear';
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  for (const cable of proposal.cables) {
    assert.ok(proposal.equipment.some(item => item.tag === cable.from_tag), cable.from_tag);
    assert.ok(proposal.equipment.some(item => item.tag === cable.to_tag), cable.to_tag);
  }
});

test('60 C terminals force the sample 400 A feeders from 600 to 750 kcmil', () => {
  const input = sample();
  const original = generateDesignProposal(input);
  input.criteria.terminalRatingC = 60;
  const restricted = generateDesignProposal(input);
  assert.equal(restricted.status, 'proposal');
  for (const feeder of restricted.cables.filter(cable => !cable.loadId)) {
    assert.equal(original.cables.find(cable => cable.id === feeder.id).conductor_size, '600 kcmil');
    assert.equal(feeder.conductor_size, '750 kcmil');
    assert.equal(feeder.ampacityA, 400);
    assert.equal(feeder.protectiveDevice.continuousCurrentA, 400);
  }
});
