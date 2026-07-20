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
const tccScript = await readFile(new URL('../analysis/tcc.js', import.meta.url), 'utf8');
const trayScript = await readFile(new URL('../cabletrayfill.js', import.meta.url), 'utf8');
const ductbankScript = await readFile(new URL('../ductbankroute.js', import.meta.url), 'utf8');

assert.equal(settings.projectMeta.projectNumber, 'CTR-DEMO-001');
assert.equal(engineeringPackage.issueStatus, 'Sample - Not for Construction');
assert.equal(engineeringPackage.labelCreatedDate, settings.projectMeta.date);
assert.ok(engineeringPackage.applicableStandards.length >= 4);
assert.ok(engineeringPackage.designNotes.length >= 4);

assert.equal(project.equipment.length, 13);
assert.equal(project.loads.length, 10);
assert.equal(project.cables.length, 14);
assert.equal(project.trays.length, 3);
assert.equal(project.ductbanks.length, 2);
assert.equal(project.oneLine.sheets[0].components.length, 20);
assert.equal(settings.latestRouteResults.batchResults.length, 14);
assert.equal(engineeringPackage.ductbankCrossSections.length, 2);
assert.equal(engineeringPackage.trayCrossSections.length, 3);
assert.equal(engineeringPackage.protectiveDevices.length, 6);

for (const cable of project.cables) {
  assert.ok(cable.voltage, `${cable.tag} must identify operating voltage`);
  assert.ok(cable.cable_rating, `${cable.tag} must identify cable rated voltage`);
}

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
    for (const cableTag of circuit.split(' + ')) {
      assert.ok(cableTags.has(cableTag), `${cableTag} must exist in the Cable Schedule`);
    }
  }
}

const conduitAssignments = project.cables.reduce((assignments, cable) => {
  const conduitId = cable.conduit_id || cable.route_preference;
  if (String(conduitId).startsWith('CND-')) {
    if (!assignments.has(conduitId)) assignments.set(conduitId, []);
    assignments.get(conduitId).push(cable.tag);
  }
  return assignments;
}, new Map());
assert.deepEqual(conduitAssignments.get('CND-CTRL-102'), ['CTL-MCC2-FAN-101', 'CTL-MCC2-AHU-101']);

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
const mcc102 = oneLineComponents.find(component => component.label === 'MCC-102');
const mcc102Targets = mcc102.connections.map(connection => componentById.get(connection.target));
assert.ok(mcc102Targets.every(target => target.x >= mcc102.x && target.x <= mcc102.x + mcc102.width), 'MCC-102 must extend over every directly connected feeder');
const xfmr102 = oneLineComponents.find(component => component.label === 'XFMR-102');
assert.ok(mcc102.x + mcc102.width <= xfmr102.x - 20, 'MCC-102 must stop before the adjacent XFMR-102 branch');
for (const load of oneLineComponents.filter(component => component.type === 'load')) {
  const incoming = oneLineComponents.some(component => (component.connections || []).some(connection => connection.target === load.id));
  assert.ok(incoming, `${load.label} must have an incoming one-line connection`);
  assert.equal(load.rotation, 0, `${load.label} must use the upright circle-M motor symbol`);
  assert.equal(load.rotationManual, true, `${load.label} orientation must be explicit`);
}
const vfd = oneLineComponents.find(component => component.subtype === 'vfd');
assert.equal(vfd.type, 'motor_controller');
assert.equal(vfd.rotation, 0);
assert.equal(vfd.rotationManual, true);

for (const device of engineeringPackage.protectiveDevices) {
  const component = componentById.get(device.oneLineComponentId);
  assert.equal(component.props.amp_trip, `${device.ratingA} A`, `${device.id} must display its amp-trip setting`);
}
for (const transformer of oneLineComponents.filter(component => component.type === 'transformer')) {
  assert.equal(transformer.voltage_ratio, '480 - 208Y/120');
  assert.equal(transformer.winding, 'Delta - Grounded Wye');
  const primaryConnected = oneLineComponents.some(component => (component.connections || []).some(connection => (
    connection.target === transformer.id && Number(connection.targetPort || 0) === 0
  )));
  const secondaryConnected = (transformer.connections || []).some(connection => Number(connection.sourcePort || 0) === 1);
  assert.ok(primaryConnected, `${transformer.label} must be connected at its primary winding terminal`);
  assert.ok(secondaryConnected, `${transformer.label} must be connected at its secondary winding terminal`);
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
assert.match(reportScript, /draw_fuse_band/);
assert.match(reportScript, /diagonal hatching identifies the fuse operating band/);
assert.match(reportScript, /motor\['tag'\].*start/);
assert.match(reportScript, /transformer\['tag'\].*inrush/);
assert.match(tccScript, /tcc-fuse-tolerance-band/);
assert.match(tccScript, /tcc-equipment-tag-callout/);
assert.match(reportScript, /PdfSectionAnchor/);
assert.match(reportScript, /internal_link_cell/);
assert.match(reportScript, /Operating V/);
assert.match(reportScript, /Cable rated V/);
assert.match(reportScript, /"Connected kW", "PF"/);
assert.match(reportScript, /voltage_drop > 5/);
assert.match(reportScript, /voltage_drop > 3/);
assert.match(reportScript, /Label created:/);
assert.match(reportScript, /double-line-to-ground/);
assert.match(reportScript, /ANSI Z535\.4 safety-alert symbol/);
assert.match(trayScript, /DOTTED LINE - STACKING BOUNDARY/);
assert.match(ductbankScript, /CABLE IDENTIFICATION \(marker - cable tag - outside diameter - conduit\)/);
assert.match(ductbankScript, /cableMarkerByTag/);
assert.match(captureScript, /datablock\.value = 'report'/);
assert.match(captureScript, /perfectlyAlignedTransformerTerminalCount/);
assert.match(captureScript, /transformerTerminalBridgeDepthPx: 20/);
assert.match(captureScript, /perfectlyAlignedPanelTerminalCount/);
assert.match(captureScript, /singleConnectionPanelCount/);
assert.match(captureScript, /panelTerminalBridgeDepthPx: 20/);
assert.match(captureScript, /Feeder connections must fall directly beneath their visible buses/);
assert.doesNotMatch(reportScript, /story\.append\(OneLineDiagram\(\)\)/);
assert.doesNotMatch(reportScript, /story\.append\(TrayCrossSection\(/);
assert.doesNotMatch(reportScript, /story\.append\(DuctbankCrossSection\(/);

console.log('✓ engineering sample package data contract');
