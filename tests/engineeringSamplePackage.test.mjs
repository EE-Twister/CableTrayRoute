import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const project = JSON.parse(await readFile(
  new URL('../samples/project-workflow-core.json', import.meta.url),
  'utf8',
));

const settings = project.settings || {};
const engineeringPackage = settings.engineeringPackage || {};
const studies = settings.studies || {};
const equipmentTags = new Set((project.equipment || []).map(row => row.tag));
const cableTags = new Set((project.cables || []).map(row => row.tag));
const captureScript = await readFile(new URL('../scripts/captureEngineeringReportVisuals.mjs', import.meta.url), 'utf8');
const reportScript = await readFile(new URL('../scripts/generateEngineeringSamplePackage.py', import.meta.url), 'utf8');

assert.equal(settings.projectMeta.projectNumber, 'CTR-DEMO-001');
assert.equal(engineeringPackage.issueStatus, 'Sample - Not for Construction');
assert.ok(engineeringPackage.applicableStandards.length >= 4);
assert.ok(engineeringPackage.designNotes.length >= 4);

assert.equal(project.equipment.length, 13);
assert.equal(project.loads.length, 10);
assert.equal(project.cables.length, 12);
assert.equal(project.trays.length, 3);
assert.equal(project.ductbanks.length, 2);
assert.equal(project.oneLine.sheets[0].components.length, 20);
assert.equal(settings.latestRouteResults.batchResults.length, 12);
assert.equal(engineeringPackage.ductbankCrossSections.length, 2);
assert.equal(engineeringPackage.trayCrossSections.length, 3);
assert.equal(engineeringPackage.protectiveDevices.length, 6);

for (const device of engineeringPackage.protectiveDevices) {
  assert.ok(equipmentTags.has(device.equipment), `${device.id} must reference scheduled equipment`);
  assert.ok(settings.tccSettings.devices.includes(device.id), `${device.id} must be selected for TCC`);
  assert.ok(settings.tccSettings.settings[device.id], `${device.id} must have saved settings`);
}

for (const section of engineeringPackage.trayCrossSections) {
  const tray = (project.trays || []).find(row => row.tray_id === section.trayId);
  assert.ok(tray);
  assert.ok(tray.material, `${section.trayId} must identify tray material`);
  assert.deepEqual(section.dividerZones, Object.values(tray.slot_groups || {}));
  assert.equal(Number(tray.num_slots), section.dividerZones.length);
  if (Number(tray.num_slots) > 1) {
    assert.equal(tray.slotFills?.length, Number(tray.num_slots));
    assert.equal(tray.slotFills.reduce((sum, area) => sum + area, 0), tray.current_fill);
  }
  const assignedCableTags = project.cables
    .filter(cable => (cable.raceway_ids || []).includes(section.trayId) || cable.route_preference === section.trayId)
    .map(cable => cable.tag)
    .sort();
  assert.deepEqual([...section.cables].sort(), assignedCableTags, `${section.trayId} cross-section must match the application handoff`);
  for (const cableTag of section.cables) {
    assert.ok(cableTags.has(cableTag), `${cableTag} must exist in the Cable Schedule`);
  }
}

for (const section of engineeringPackage.ductbankCrossSections) {
  const ductbank = (project.ductbanks || []).find(row => row.ductbank_id === section.ductbankId);
  assert.ok(ductbank);
  assert.equal(ductbank.conduits.length, section.rows * section.columns);
  for (const field of ['topPad', 'bottomPad', 'leftPad', 'rightPad']) {
    assert.ok(Number(ductbank[field]) >= Number(section.concreteCoverIn), `${section.ductbankId} ${field} must provide concrete cover`);
  }
  for (const circuit of section.circuits.filter(value => value !== 'SPARE')) {
    assert.ok(cableTags.has(circuit), `${circuit} must exist in the Cable Schedule`);
  }
}

const arcFlashRows = Object.entries(studies.arcFlash || {})
  .filter(([key, value]) => !key.startsWith('_') && value && typeof value === 'object');
assert.equal(arcFlashRows.length, 9);
for (const [, row] of arcFlashRows) {
  assert.ok(equipmentTags.has(row.equipmentTag), `${row.equipmentTag} must exist in the Equipment List`);
  assert.ok(Number.isFinite(Number(row.incidentEnergy)));
  assert.ok(Number.isFinite(Number(row.clearingTime)));
}

assert.equal(studies.tcc.pairs.length, 5);
assert.ok(studies.tcc.pairs.every(row => row.status === 'Coordinated'));

const oneLineComponents = project.oneLine.sheets[0].components;
const componentById = new Map(oneLineComponents.map(component => [component.id, component]));
for (const mccTag of ['MCC-101', 'MCC-102']) {
  const mcc = oneLineComponents.find(component => component.label === mccTag);
  assert.equal(mcc.type, 'bus', `${mccTag} must render as a one-line bus`);
  assert.ok(Number(mcc.width) >= 400, `${mccTag} bus must provide distinct feeder tap positions`);
}
for (const load of oneLineComponents.filter(component => component.type === 'load')) {
  const incoming = oneLineComponents.some(component => (component.connections || []).some(connection => connection.target === load.id));
  assert.ok(incoming, `${load.label} must have an incoming one-line connection`);
}

const protectiveComponentIds = new Set(engineeringPackage.protectiveDevices.map(device => device.oneLineComponentId));
assert.ok(engineeringPackage.protectiveDevices.every(device => device.type === 'Fuse'));
assert.equal(engineeringPackage.tccStudies.length, 3);
function reachesNextSeriesFuse(fromId, targetId) {
  const pending = [fromId];
  const visited = new Set();
  while (pending.length) {
    const id = pending.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const connection of componentById.get(id)?.connections || []) {
      if (connection.target === targetId) return true;
      if (!protectiveComponentIds.has(connection.target)) pending.push(connection.target);
    }
  }
  return false;
}
for (const study of engineeringPackage.tccStudies) {
  assert.ok(study.seriesPath.length >= 2);
  assert.ok(study.protectedCable?.tag && cableTags.has(study.protectedCable.tag));
  for (let index = 0; index < study.seriesPath.length - 1; index += 1) {
    const upstream = engineeringPackage.protectiveDevices.find(device => device.id === study.seriesPath[index]);
    const downstream = engineeringPackage.protectiveDevices.find(device => device.id === study.seriesPath[index + 1]);
    assert.ok(upstream && downstream);
    assert.ok(reachesNextSeriesFuse(upstream.oneLineComponentId, downstream.oneLineComponentId), `${upstream.id} and ${downstream.id} must be series-connected on the one-line`);
  }
  assert.ok(study.motor || study.transformer, `${study.id} must include a motor or transformer envelope`);
}

assert.match(captureScript, /#diagram/);
assert.match(captureScript, /#svgContainer svg/);
assert.match(captureScript, /#grid/);
assert.match(captureScript, /engineeringPrint/);
assert.match(reportScript, /load_visual_assets/);
assert.match(reportScript, /application_visual/);
assert.match(reportScript, /SeriesFuseTccChart/);
assert.match(reportScript, /oneSecondDamageA/);
assert.match(reportScript, /lockedRotorMultiple/);
assert.match(reportScript, /inrushMultiple/);
assert.doesNotMatch(reportScript, /story\.append\(OneLineDiagram\(\)\)/);
assert.doesNotMatch(reportScript, /story\.append\(TrayCrossSection\(/);
assert.doesNotMatch(reportScript, /story\.append\(DuctbankCrossSection\(/);

console.log('✓ engineering sample package data contract');
