import assert from 'node:assert/strict';
import {
  buildPullGroupSuggestions,
  canonicalRouteSignature
} from '../analysis/cablePullGroups.mjs';

const route = [
  { start: [0, 0, 0], end: [50, 0, 0], length: 50, type: 'tray', tray_id: 'T1' },
  { start: [50, 0, 0], end: [100, 0, 0], length: 50, type: 'tray', tray_id: 'T2' }
];

const cable = (name, group = 'LV', weight = 1) => ({
  name,
  allowed_cable_group: group,
  cable_type: 'Control',
  diameter: 0.5,
  weight,
  max_tension: 2000,
  max_sidewall_pressure: 1000,
  start_tag: 'A',
  end_tag: 'B'
});

const result = (name, segments = route) => ({
  cable: name,
  status: 'Routed',
  route_segments: segments,
  pull_check: {
    equipment: { counts: { reels: 1, tuggers: 1, sheaves: 0, rollers: 8 } }
  }
});

const options = {
  allowableTension: 2000,
  allowableSidewallPressure: 1000,
  pullerCapacityLbf: 5000,
  ropeCapacityLbf: 5000,
  gripCapacityLbf: 5000,
  anchorageCapacityLbf: 5000,
  sheaveCapacityLbf: 5000,
  maxPullLengthFt: 500,
  maxPullGroupSize: 4
};

{
  const reversed = [...route].reverse().map(segment => ({
    ...segment,
    start: segment.end,
    end: segment.start
  }));
  assert.equal(canonicalRouteSignature(route), canonicalRouteSignature(reversed));
}

{
  const cables = [cable('C-01'), cable('C-02')];
  const analysis = buildPullGroupSuggestions(cables.map(item => result(item.name)), cables, options);
  assert.equal(analysis.suggestions.length, 1);
  assert.deepEqual(analysis.suggestions[0].cableNames, ['C-01', 'C-02']);
  assert.equal(analysis.suggestions[0].className, 'LV');
  assert.equal(analysis.suggestions[0].combinedWeightLbsFt, 2);
  assert.ok(Math.abs(analysis.suggestions[0].equivalentDiameterIn - Math.sqrt(0.5)) < 0.001);
  assert.equal(analysis.suggestions[0].status, 'recommended');
  assert.equal(
    analysis.suggestions[0].fieldEquipment.cableReels,
    analysis.suggestions[0].plan.sections.length * 2
  );
  assert.equal(analysis.summary.suggestedCables, 2);
}

{
  const cables = [cable('C-LV', 'LV'), cable('C-INST', 'INSTRUMENT')];
  const analysis = buildPullGroupSuggestions(cables.map(item => result(item.name)), cables, options);
  assert.equal(analysis.suggestions.length, 0);
  assert.equal(analysis.blockedPairs.length, 1);
  assert.match(analysis.separate[0].reason, /circuit classes must match/i);
}

{
  const partialRoute = [
    route[0],
    { start: [50, 0, 0], end: [50, 50, 0], length: 50, type: 'tray', tray_id: 'T3' }
  ];
  const cables = [cable('C-01'), cable('C-02')];
  const analysis = buildPullGroupSuggestions([
    result('C-01'),
    result('C-02', partialRoute)
  ], cables, options);
  assert.equal(analysis.suggestions.length, 0);
  assert.equal(Math.round(analysis.separate[0].closestSharedRoutePct), 50);
  assert.match(analysis.separate[0].reason, /fully coextensive/i);
}

{
  const cables = Array.from({ length: 5 }, (_, index) => cable(`C-${index + 1}`));
  const analysis = buildPullGroupSuggestions(
    cables.map(item => result(item.name)),
    cables,
    { ...options, maxPullGroupSize: 3 }
  );
  assert.deepEqual(analysis.suggestions.map(group => group.cableCount), [3, 2]);
}

{
  const cables = [
    { ...cable('C-01'), weight: 0 },
    cable('C-02')
  ];
  const analysis = buildPullGroupSuggestions(cables.map(item => result(item.name)), cables, options);
  assert.equal(analysis.suggestions.length, 0);
  assert.equal(analysis.reviewGroups.length, 1);
  assert.match(analysis.reviewGroups[0].missingInputs.join(' '), /C-01: cable weight/);
}

console.log('cable pull group suggestions verified');
