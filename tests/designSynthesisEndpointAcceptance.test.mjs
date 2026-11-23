import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateEndpointInstallation } from '../analysis/designSynthesisEndpointInstallation.mjs';
import { buildProjectConduitFillContext } from '../src/conduitFillProjectAdapter.mjs';
import { evaluateConduitFill } from '../analysis/conduitFill.mjs';
import { buildRouteMetrics } from '../src/routing/routeSceneModel.mjs';

const criteria = { endpointInstallation: { method: 'dedicated-emt', minimumTradeSize: '1/2', maximumTradeSize: '4' } };
const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
const leg = { type: 'field', segmentId: 'field-destination', endpointRole: 'destination', start: [0, 0, 0], end: [12, 0, 0], length: 12 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('dedicated MC endpoint sizing uses whole-cable area and ascending EMT trade sizes', () => {
  // Southwire whole-cable OD; NEC table total area corroborated by Wheatland IDs.
  // The previous smaller trade size is independently shown to exceed 53%.
  const cases = [
    { od: 0.833, size: '1-1/4', area: 1.496, previousArea: 0.864 },
    { od: 1.012, size: '1-1/2', area: 2.036, previousArea: 1.496 },
    { od: 2.665, size: '3-1/2', area: 11.545, previousArea: 8.846 },
    { od: 2.942, size: '4', area: 14.753, previousArea: 11.545 },
  ];
  for (const row of cases) {
    const result = evaluateEndpointInstallation({ cable: { id: 'C1', cable_od: row.od, conductor_count: 3 }, route: { route_segments: [leg] }, criteria });
    assert.equal(result.status, 'evaluated', JSON.stringify(result));
    assert.equal(result.conduits.length, 1);
    assert.equal(result.conduits[0].conduit_id, 'EC-C1-destination');
    assert.equal(result.conduits[0].trade_size, row.size);
    const area = Math.PI * row.od ** 2 / 4;
    const evidence = result.segments[0];
    close(evidence.cableAreaIn2, area);
    close(evidence.internalAreaIn2, row.area);
    close(evidence.fillPercent, 100 * area / row.area);
    assert.equal(evidence.fillLimit, 0.53);
    assert.ok(area / row.previousArea > 0.53);
    assert.ok(area / row.area <= 0.53);
  }
});

test('missing method, unsupported method, invalid bounds, and multiple physical cables cannot pass', () => {
  const cable = { id: 'C1', cable_od: 0.998 };
  const route = { route_segments: [leg] };
  for (const endpointInstallation of [undefined, {}, { method: 'direct-burial' }, { method: 'dedicated-emt', maximumTradeSize: '1garbage' }, { method: 'dedicated-emt', minimumTradeSize: '4', maximumTradeSize: '1' }]) {
    const result = evaluateEndpointInstallation({ cable, route, criteria: { endpointInstallation } });
    assert.notEqual(result.status, 'evaluated');
    assert.ok(result.issues.some(issue => issue.severity === 'blocking'));
  }
  const multiple = evaluateEndpointInstallation({ cable: { ...cable, parallel_count: 2 }, route, criteria });
  assert.notEqual(multiple.status, 'evaluated');
  assert.ok(multiple.issues.some(issue => issue.severity === 'blocking'));
  const undersized = evaluateEndpointInstallation({ cable, route, criteria: { endpointInstallation: { method: 'dedicated-emt', maximumTradeSize: '1' } } });
  assert.equal(undersized.status, 'blocked');
  const staleArea = evaluateEndpointInstallation({ cable: { ...cable, cable_area: 0.0001 }, route, criteria });
  assert.equal(staleArea.conduits[0].trade_size, '1-1/4', 'Whole-cable OD governs this sourced construction, not a stale area override');
});

test('mixed and field-only circuits receive endpoint conduits while co-located circuits need none', () => {
  const input = sample();
  input.criteria.endpointInstallation = criteria.endpointInstallation;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.equal(proposal.loads.length, 30);
  assert.equal(proposal.checks.find(check => check.id === 'installationCoverage').status, 'pass');
  assert.equal(proposal.checks.find(check => check.id === 'racewayCapacity').status, 'pass');
  assert.ok(proposal.conduits.length > 20);
  const ids = new Set(proposal.conduits.map(conduit => conduit.conduit_id));
  assert.equal(ids.size, proposal.conduits.length);
  const unsizedInput = structuredClone(input);
  delete unsizedInput.criteria.endpointInstallation;
  const unsized = generateDesignProposal(unsizedInput);
  let requiredLegs = 0;
  for (const route of unsized.routeResults.batchResults) {
    const cable = proposal.cables.find(row => row.tag === route.cable);
    for (const segment of route.route_segments.filter(row => row.type === 'field' && row.length > 0)) {
      requiredLegs += 1;
      const assigned = proposal.conduits.filter(conduit => cable.raceway_ids.includes(conduit.conduit_id));
      assert.ok(assigned.some(conduit => {
        const start = [conduit.start_x, conduit.start_y, conduit.start_z];
        const end = [conduit.end_x, conduit.end_y, conduit.end_z];
        return start.every((value, index) => value === segment.start[index]) && end.every((value, index) => value === segment.end[index]);
      }), `No endpoint conduit preserves the geometry of ${route.cable}`);
    }
  }
  assert.equal(proposal.conduits.length, requiredLegs);
  for (const conduit of proposal.conduits) {
    const context = buildProjectConduitFillContext({ conduits: proposal.conduits, cables: proposal.cables, selectedConduitId: conduit.conduit_id });
    assert.equal(context.cables.length, 1, 'Downstream conduit page must resolve exactly one physical MC circuit');
    const fill = evaluateConduitFill(conduit, context.cables);
    assert.equal(fill.cableCount, 1);
    assert.equal(fill.fillLimit, 0.53);
    assert.ok(fill.fillPercent <= 53);
  }
  for (const tag of ['C-M-01', 'C-M-04']) {
    const cable = proposal.cables.find(row => row.tag === tag);
    assert.ok(cable.raceway_ids.some(id => ids.has(id)), `Endpoint installation missing for ${tag}`);
  }
  const pointCable = proposal.cables.find(cable => cable.tag === 'C-M-27');
  assert.equal(pointCable.length, 0);
  assert.ok(!pointCable.raceway_ids.some(id => ids.has(id)));
  for (const route of proposal.routeResults.batchResults) {
    const cable = proposal.cables.find(row => row.tag === route.cable);
    assert.deepEqual(route.installationCoverage, cable.installationCoverage);
    close(route.total_length, cable.length);
    const metrics = buildRouteMetrics(route);
    assert.equal(metrics.field, 0, 'Saved route geometry must identify sized endpoint conduits for the route viewer');
    close(metrics.total, route.total_length);
    for (const segment of route.route_segments.filter(row => row.type === 'conduit')) {
      assert.ok(ids.has(segment.conduit_id));
      assert.equal(segment.raceway_id, segment.conduit_id);
    }
  }
});

test('an all-conduit proposal can pass fill coverage without a tray evaluation', () => {
  const input = sample();
  input.equipment = input.equipment.slice(0, 1);
  Object.assign(input.equipment[0], { x: 10, y: 0, z: 0 });
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  assert.equal(proposal.trays.length, 0);
  assert.equal(proposal.racewayEvaluations.length, 0);
  assert.equal(proposal.conduits.length, 1);
  assert.equal(proposal.checks.find(row => row.id === 'installationCoverage').status, 'pass');
  assert.equal(proposal.checks.find(row => row.id === 'racewayCapacity').status, 'pass');
  assert.ok(proposal.cables.every(row => row.installationCoverage.coverage === 'complete'));
});

test('removing endpoint assumptions exposes both mixed and field-only missing coverage and prevents Apply readiness', () => {
  const input = sample();
  delete input.criteria.endpointInstallation;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.notEqual(proposal.checks.find(check => check.id === 'installationCoverage').status, 'pass');
  assert.notEqual(proposal.checks.find(check => check.id === 'racewayCapacity').status, 'pass');
  for (const id of ['C-M-01', 'C-M-04']) {
    assert.ok(proposal.issues.some(issue => issue.code === 'ENDPOINT_INSTALLATION_MISSING' && issue.cable === id));
  }
});
