import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildProjectTrayHandoff, validateProjectTrayHandoff } from '../analysis/designSynthesisProjectTrays.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { fingerprintProjectRecord } from '../utils/projectRecordFingerprint.mjs';
import { planProjectTrayReconciliation } from '../analysis/designSynthesisProjectTrayReconcile.mjs';

function fixture() {
  const trays = [
    { tray_id: 'SHORT', tray_type: 'Ladder (50 % fill)', allowed_cable_group: 'power', start_x: 0, start_y: 0, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 6, tray_depth: 6 },
    { tray_id: 'BYPASS-A', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 0, end_y: 50, end_z: 0, inside_width: 24, tray_depth: 6 },
    { tray_id: 'BYPASS-B', tray_type: 'Ladder', start_x: 0, start_y: 50, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 24, tray_depth: 6 },
  ];
  const cables = [{ id: 'owner-cable', tag: 'OWNER-CABLE', cable_type: 'Power', conductor_size: '#8 AWG', conductors: 3, cable_rating: 600, diameter: 0.833, quantity: 5, raceway_ids: ['SHORT'] }, { id: 'candidate-only', tag: 'OTHER', allowed_raceways: ['SHORT'] }];
  return { trays, cables, routeResults: { batchResults: [{ cable: 'OWNER-CABLE', route_segments: [{ type: 'tray', tray_id: 'SHORT' }] }] }, selectedTrayIds: trays.map(row => row.tray_id), projectId: 'Existing plant', scenario: 'base', inventoryReference: 'Synthetic reviewed inventory and cable dimensions', acknowledgements: { units: true, inventory: true, permission: true } };
}

test('reviewed project trays carry exact geometry and actual cable occupancy into 25/50-load route screening', async () => {
  const source = fixture(); const snapshot = structuredClone(source);
  const reviewed = await buildProjectTrayHandoff(source);
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
  assert.equal(reviewed.corridors.nodes.length, 3);
  assert.ok(reviewed.corridors.edges.every(edge => edge.permitted === false));
  const short = reviewed.corridors.edges.find(edge => edge.id === 'SHORT');
  assert.equal(short.existingTray.cables.length, 1, 'Allowed-route preference is not an assigned cable');
  assert.equal(short.existingTray.cables[0].quantity, 5);
  const opened = structuredClone(reviewed.corridors); opened.edges.forEach(edge => { edge.permitted = true; });
  assert.equal((await validateProjectTrayHandoff({ ...source, adoption: reviewed.adoption, corridors: opened })).ok, true);
  const original = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  for (const count of [25, 50]) {
    const input = structuredClone(original);
    input.equipment = Array.from({ length: count }, (_, index) => ({ ...original.equipment[0], id: `L-${String(index + 1).padStart(2, '0')}`, tag: `L-${String(index + 1).padStart(2, '0')}` }));
    input.corridors = opened;
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.cables.filter(row => row.loadId && row.routingDecision.selectedPath.includes('SHORT')).length, 7);
    assert.equal(proposal.cables.filter(row => row.loadId && row.routingDecision.selectedPath.includes('BYPASS-A')).length, count - 7);
    assert.ok(proposal.issues.some(row => row.code === 'EXISTING_TRAY_RECONCILIATION_UNRESOLVED'));
  }
  assert.deepEqual(source, snapshot);
});

test('source, copied geometry, project, scenario, and binding edits require fresh review', async () => {
  const source = fixture(); const reviewed = await buildProjectTrayHandoff(source);
  assert.equal(reviewed.ok, true);
  for (const change of [s => { s.trays[0].end_x = 21; }, s => { s.cables[0].diameter = 1; }, s => { s.cables.push({ id: 'new' }); }, s => { s.routeResults.batchResults = []; }, s => { s.projectId = 'Different'; }, s => { s.scenario = 'alternative'; }]) {
    const changed = structuredClone(source); change(changed);
    assert.equal((await validateProjectTrayHandoff({ ...changed, adoption: reviewed.adoption, corridors: reviewed.corridors })).ok, false);
  }
  const edited = structuredClone(reviewed.corridors); edited.edges[2].existingTray.cables[0].quantity = 6;
  assert.equal((await validateProjectTrayHandoff({ ...source, adoption: reviewed.adoption, corridors: edited })).ok, false);
  const thermal = structuredClone(reviewed.corridors); thermal.edges[0].thermal = { ambientTempC: 40 };
  assert.equal((await validateProjectTrayHandoff({ ...source, adoption: reviewed.adoption, corridors: thermal })).ok, true);
  const forged = structuredClone(reviewed.adoption); forged.inventoryReference = 'changed';
  assert.equal((await validateProjectTrayHandoff({ ...source, adoption: forged, corridors: reviewed.corridors })).ok, false);
});

test('supported assignment aliases count occupancy while allowed-route preferences do not', async () => {
  const source = fixture();
  delete source.cables[0].raceway_ids;
  source.cables[0].raceway_id = 'SHORT';
  const reviewed = await buildProjectTrayHandoff(source);
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
  assert.equal(reviewed.corridors.edges.find(edge => edge.id === 'SHORT').existingTray.cables[0].quantity, 5);
});

test('a collision in the legacy 32-bit fingerprint cannot hide a changed project tray', async () => {
  const source = { ...fixture(), trays: [{ tray_id: 'SHORT', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 6, tray_depth: 6 }], cables: [], routeResults: null, selectedTrayIds: ['SHORT'] };
  source.trays[0].annotation = 'annotation-4k1ifh-141p';
  const changed = structuredClone(source);
  changed.trays[0].annotation = 'annotation-1vt7swg-1zxi';
  const sourceValue = ({ trays, cables, routeResults }) => ({ trays, cables, routeResults });
  assert.equal(fingerprintStudyValue(sourceValue(source)), fingerprintStudyValue(sourceValue(changed)));
  const reviewed = await buildProjectTrayHandoff(source);
  assert.equal(reviewed.ok, true);
  assert.match(reviewed.adoption.sourceFingerprint, /^sha256-[a-f0-9]{64}$/);
  assert.equal((await validateProjectTrayHandoff({ ...changed, adoption: reviewed.adoption, corridors: reviewed.corridors })).ok, false);
  const legacy = { ...reviewed.adoption, schemaVersion: 'project-trays-v1' };
  assert.equal((await validateProjectTrayHandoff({ ...source, adoption: legacy, corridors: reviewed.corridors })).ok, false);
});

test('only explicitly replaceable, unchanged generated records are excluded from owner occupancy', async () => {
  const source = fixture();
  const baseline = await buildProjectTrayHandoff(source);
  const cable = { id: 'GEN-1', tag: 'GEN-1', cable_type: 'Power', conductor_size: '#8 AWG', conductors: 3, cable_rating: 600, diameter: 0.833, quantity: 1, raceway_ids: ['SHORT'], annotation: 'proposal' };
  const route = { id: 'route-GEN-1', cable: 'GEN-1', route_segments: [{ type: 'tray', tray_id: 'SHORT' }] };
  source.cables.push({ ...cable, _designSynthesis: { identity: cable.id, collection: 'cables', source: 'design-synthesis' } });
  source.routeResults.batchResults.push({ ...route, _designSynthesis: { identity: route.id, collection: 'routeResults', source: 'design-synthesis' } });
  source.lastApplied = { records: { cables: { [cable.id]: { exactFingerprint: fingerprintProjectRecord(cable) } }, routeResults: { [route.id]: { exactFingerprint: fingerprintProjectRecord(route) } } } };
  const retained = await buildProjectTrayHandoff(source);
  assert.equal(retained.ok, true, JSON.stringify(retained.issues));
  assert.equal(retained.corridors.edges.find(edge => edge.id === 'SHORT').existingTray.cables.length, 2, 'Without explicit replacement confirmation the generated cable stays in occupancy');
  source.acknowledgements.replaceGenerated = true;
  const reviewed = await buildProjectTrayHandoff(source);
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
  assert.equal(reviewed.adoption.sourceFingerprint, baseline.adoption.sourceFingerprint);
  assert.equal(reviewed.corridors.edges.find(edge => edge.id === 'SHORT').existingTray.cables[0].quantity, 5);
  assert.equal(reviewed.corridors.edges.find(edge => edge.id === 'SHORT').existingTray.cables.length, 1);
  const collision = structuredClone(source);
  collision.cables.push({ id: 'owner-extra', tag: 'GEN-1' });
  assert.ok((await buildProjectTrayHandoff(collision)).issues.some(row => row.code === 'PROJECT_TRAY_GENERATED_ID_COLLISION'));
  for (const mutate of [
    x => { x.cables[2].annotation = 'changed'; },
    x => { x.routeResults.batchResults[1].route_segments[0].tray_id = 'BYPASS-A'; },
    x => { delete x.lastApplied.records.cables['GEN-1'].exactFingerprint; },
    x => { x.cables[2]._designSynthesis.collection = 'trays'; },
    x => { x.cables[2]._designSynthesis.identity = 'other'; },
  ]) {
    const invalid = structuredClone(source); mutate(invalid);
    assert.ok((await buildProjectTrayHandoff(invalid)).issues.some(row => row.code === 'PROJECT_TRAY_GENERATED_OWNERSHIP_UNPROVEN'));
  }
});

test('25- and 50-load owner-tray merge plans preserve reviewed trays and reject stale or inconsistent evidence', async () => {
  const source = fixture();
  const reviewed = buildProjectTrayHandoff(source);
  const original = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  for (const count of [25, 50]) {
    const input = structuredClone(original);
    input.equipment = Array.from({ length: count }, (_, index) => ({ ...original.equipment[0], id: `L-${String(index + 1).padStart(2, '0')}`, tag: `L-${String(index + 1).padStart(2, '0')}` }));
    input.corridors = structuredClone(reviewed.corridors);
    input.corridors.edges.forEach(edge => { edge.permitted = true; });
    input.projectTrayAdoption = reviewed.adoption;
    const proposal = generateDesignProposal(input);
    const plan = planProjectTrayReconciliation({ ...source, proposal });
    assert.equal(plan.ok, true, JSON.stringify(plan.issues));
    assert.deepEqual(plan.ownerTrayIds.sort(), ['bypass-a', 'bypass-b', 'short']);
    assert.deepEqual(plan.newTrays, []);
    assert.ok(proposal.issues.some(row => row.code === 'EXISTING_TRAY_RECONCILIATION_UNRESOLVED'));
    for (const mutate of [
      p => { p.trays[0].inside_width += 2; },
      p => { p.cables.find(row => row.raceway_ids.length).raceway_ids = []; },
      p => { p.racewayEvaluations[0].widthIn += 1; },
      p => { p.routeResults.batchResults.push(structuredClone(p.routeResults.batchResults[0])); },
      p => { p.routeResults.batchResults.find(row => row.route_segments.some(segment => segment.type === 'tray')).route_segments[0].start[0] += 1; },
      p => { p.inputs.original.corridors.edges.find(row => row.id === 'SHORT').existingTray.cables[0].quantity += 1; },
    ]) {
      const changed = structuredClone(proposal); mutate(changed);
      assert.equal(planProjectTrayReconciliation({ ...source, proposal: changed }).ok, false);
    }
    const changedSource = structuredClone(source); changedSource.cables[0].diameter = 1;
    assert.equal(planProjectTrayReconciliation({ ...changedSource, proposal }).ok, false);
  }
});

test('a merge plan retains the owner tray while keeping independently proposed bypass trays', () => {
  const source = { ...fixture(), selectedTrayIds: ['SHORT'] };
  const reviewed = buildProjectTrayHandoff(source);
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.corridors = structuredClone(reviewed.corridors);
  input.corridors.edges[0].permitted = true;
  input.corridors.nodes.push({ id: 'NEW-BYPASS-NODE', x: 0, y: 50, z: 0 });
  input.corridors.edges.push(
    { id: 'NEW-BYPASS-A', from: input.corridors.edges[0].from, to: 'NEW-BYPASS-NODE', widthIn: 24, depthIn: 6, permitted: true },
    { id: 'NEW-BYPASS-B', from: 'NEW-BYPASS-NODE', to: input.corridors.edges[0].to, widthIn: 24, depthIn: 6, permitted: true },
  );
  input.projectTrayAdoption = reviewed.adoption;
  const plan = planProjectTrayReconciliation({ ...source, proposal: generateDesignProposal(input) });
  assert.equal(plan.ok, true, JSON.stringify(plan.issues));
  assert.deepEqual(plan.ownerTrayIds, ['short']);
  assert.deepEqual(plan.newTrays.map(row => row.id).sort(), ['NEW-BYPASS-A', 'NEW-BYPASS-B']);
});

test('incomplete, ambiguous or contradictory project records never become a reviewed inventory', async () => {
  const cases = [
    s => { s.acknowledgements.inventory = false; }, s => { s.inventoryReference = ''; },
    s => { s.trays[0].tray_type = 'Solid Bottom'; }, s => { s.trays[0].allowed_cable_group = 'fiber'; },
    s => { s.trays[0]._designSynthesis = { identity: 'SHORT', collection: 'trays', source: 'design-synthesis' }; },
    s => { s.trays[0].end_x = 0; }, s => { s.trays.push({ ...s.trays[0] }); },
    s => { s.trays[0].start = [1, 0, 0]; }, s => { s.trays[0].construction = 'solid'; },
    s => { delete s.cables[0].diameter; }, s => { s.cables[0].raceway_ids = ['BYPASS-A']; },
    s => { s.cables[0].cableType = 'signal'; }, s => { s.cables[0].outerDiameterIn = 2; },
    s => { s.cables[0].racewayIds = ['BYPASS-A']; }, s => { s.cables.push({ ...s.cables[0], id: 'another' }); },
    s => { s.routeResults.batchResults[0].cable = 'unknown'; }, s => { s.routeResults.batchResults = 'bad'; },
  ];
  for (const change of cases) { const source = fixture(); change(source); assert.equal((await buildProjectTrayHandoff(source)).ok, false); }
});
