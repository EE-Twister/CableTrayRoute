import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDesignSynthesisProjectEquipmentAdoption,
  validateDesignSynthesisProjectEquipmentAdoption,
} from '../analysis/designSynthesisProjectEquipment.mjs';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { distributionPartitionFixture, nonmotorDistributionPartitionFixture } from './helpers/distributionPartitionFixture.mjs';

function fixture() {
  return {
    equipment: [{ id: 'equipment-A', tag: 'EQ-A', voltage: '480', phases: '3', x: '0', y: '12', z: '3', custom: { owner: 'Operations' } }],
    loads: [{ id: 'load-A', equipmentId: 'equipment-A', tag: 'EQ-A', voltage: 480, phases: 3, kw: '7.5', powerFactor: '0.85', duty: 'continuous', custom: { process: 'Cooling' } }],
    selectedEquipmentIds: ['equipment-A'], projectId: 'Existing project', scenario: 'base', projectFingerprint: 'engineering-context-A',
    acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true },
  };
}

function validation(input, built, overrides = {}) {
  return validateDesignSynthesisProjectEquipmentAdoption({ ...input, adoption: built.adoption, rows: built.selectedRows, ...overrides });
}

function sign(adoption) {
  const copy = structuredClone(adoption);
  delete copy.bindingFingerprint;
  return { ...copy, bindingFingerprint: fingerprintStudyValue(copy) };
}

test('project equipment mapping retains distinct canonical identities, explicit zero coordinates and numeric-equivalent source fields', () => {
  const input = fixture();
  const before = structuredClone(input);
  const built = buildDesignSynthesisProjectEquipmentAdoption(input);
  assert.equal(built.ok, true, JSON.stringify(built.issues));
  assert.equal(built.selectedRows.length, 1);
  const row = built.selectedRows[0];
  assert.equal(row.id, 'equipment-A');
  assert.equal(row.projectEquipmentId, 'equipment-A');
  assert.equal(row.projectLoadId, 'load-A');
  assert.deepEqual([row.kw, row.voltage, row.phases, row.powerFactor, row.x, row.y, row.z], [7.5, 480, 3, 0.85, 0, 12, 3]);
  assert.equal(row.ratingsBasis, 'electrical-input-kW');
  assert.equal(validation(input, built).ok, true);
  assert.deepEqual(input, before, 'Mapping and validation must not mutate source records');
});

test('blank normalized load defaults use real equipment values without inventing missing numeric values', () => {
  const input = fixture();
  input.loads[0].voltage = '';
  input.loads[0].phases = '';
  assert.equal(buildDesignSynthesisProjectEquipmentAdoption(input).ok, true);
  for (const invalid of ['', ' ', true, false, '0x10', 'Infinity', Number.NaN]) {
    const bad = fixture(); bad.equipment[0].x = invalid;
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(bad).ok, false, `Unsupported coordinate ${String(invalid)}`);
  }
});

test('every supplied classification and voltage basis is checked rather than hidden by another field', () => {
  for (const changes of [
    { equipment: { type: 'load', category: 'Panel' } },
    { equipment: { type: 'load', subCategory: 'transformer' } },
    { equipment: { category: 'Motor' } },
    { equipment: { voltageBasis: 'line-to-neutral' }, load: { voltageBasis: 'line-to-line' } },
    { equipment: { coordinatesUnit: 'm' } },
    { load: { ratingsBasis: 'shaft-output-kW' } },
  ]) {
    const input = fixture();
    Object.assign(input.equipment[0], changes.equipment);
    Object.assign(input.loads[0], changes.load);
    const result = buildDesignSynthesisProjectEquipmentAdoption(input);
    assert.equal(result.ok, false, JSON.stringify(changes));
    assert.ok(result.issues.length);
  }
});

test('industrial load descriptions containing partial classification words remain eligible', () => {
  const input = fixture();
  Object.assign(input.equipment[0], {type:'load',category:'Industrial process',subCategory:'Combustion blower'});
  assert.equal(buildDesignSynthesisProjectEquipmentAdoption(input).ok, true);
  for (const subCategory of ['Main source','Panelboard','Busbar','Distribution panel']) {
    const invalid = fixture();
    Object.assign(invalid.equipment[0], {type:'load',subCategory});
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(invalid).ok, false, subCategory);
  }
});

test('explicit motor fields and drive classifications cannot be dropped into a nonmotor input', () => {
  for (const invalid of [null, false, true, 'motor', []]) {
    const input = fixture(); input.loads[0].motor = invalid;
    const result = buildDesignSynthesisProjectEquipmentAdoption(input);
    assert.equal(result.ok, false, `Malformed motor record ${JSON.stringify(invalid)}`);
  }
  for (const changes of [
    {equipment:{type:'vfd'}},
    {equipment:{subtype:'soft_starter'}},
    {equipment:{type:'motor_controller'}},
    {load:{loadType:'VFD'}},
    {load:{starterType:'vfd'}},
    {load:{mccUnitType:'soft_starter'}},
  ]) {
    const input = fixture();
    Object.assign(input.equipment[0], changes.equipment);
    Object.assign(input.loads[0], changes.load);
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(input).ok, false, JSON.stringify(changes));
  }
});

test('missing, duplicate and reused canonical load links cannot silently select a record', () => {
  for (const mutate of [
    input => { input.loads[0].equipmentId = 'someone-else'; },
    input => { input.loads.push({ ...input.loads[0], id: 'another-load' }); },
    input => { input.equipment.push({ ...input.equipment[0] }); },
  ]) {
    const input = fixture(); mutate(input);
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(input).ok, false);
  }
});

test('project, scenario, source changes and altered draft rows invalidate reviewed adoption', () => {
  const input = fixture();
  const built = buildDesignSynthesisProjectEquipmentAdoption(input);
  assert.equal(built.ok, true, JSON.stringify(built.issues));
  for (const overrides of [
    { projectId: 'Other project' },
    { scenario: 'future' },
    { projectFingerprint: 'changed-engineering-context' },
    { equipment: [{ ...input.equipment[0], x: 1 }] },
    { loads: [{ ...input.loads[0], kw: 9 }] },
    { rows: [{ ...built.selectedRows[0], kw: 9 }] },
    { rows: [built.selectedRows[0], structuredClone(built.selectedRows[0])] },
  ]) assert.equal(validation(input, built, overrides).ok, false, JSON.stringify(overrides));
});

test('rehashing malformed review acknowledgements does not make them affirmative', () => {
  const input = fixture();
  Object.assign(input.equipment[0], { coordinatesUnit: 'ft', voltageBasis: 'line-to-line' });
  Object.assign(input.loads[0], { ratingsBasis: 'electrical-input-kW', voltageBasis: 'line-to-line' });
  const built = buildDesignSynthesisProjectEquipmentAdoption(input);
  assert.equal(built.ok, true, JSON.stringify(built.issues));
  for (const invalid of ['true', 'false', 1, {}, []]) {
    const adoption = structuredClone(built.adoption);
    adoption.acknowledgements.coordinatesFeet = invalid;
    assert.equal(validation(input, built, { adoption: sign(adoption) }).ok, false, `Invalid acknowledgement ${JSON.stringify(invalid)}`);
  }
});

test('review binding requires a nonblank named project, scenario and engineering context', () => {
  for (const key of ['projectId', 'scenario', 'projectFingerprint']) for (const invalid of [null, '', ' ']) {
    const input = fixture(); input[key] = invalid;
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(input).ok, false, `${key}: ${JSON.stringify(invalid)}`);
  }
});

let harnessPromise;
function storageHarness() {
  if (!harnessPromise) harnessPromise = (async () => {
    const values = new Map();
    const maximumBytes = 5 * 1024 * 1024;
    let peakBytes = 0;
    let rejectNamedSave = false;
    globalThis.localStorage = {
      getItem: key => values.get(key) ?? null,
      setItem(key, value) {
        const next = new Map(values).set(key, String(value));
        const size = [...next].reduce((sum, [name, text]) => sum + 2 * (name.length + text.length), 0);
        peakBytes = Math.max(peakBytes, size);
        if (size > maximumBytes || (rejectNamedSave && key === 'CTR_SAVED_PROJECTS_V1')) {
          const error = new Error('Independent project-equipment save rejection');
          error.name = 'QuotaExceededError'; throw error;
        }
        values.set(key, String(value));
      },
      removeItem: key => values.delete(key),
      key: index => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    };
    const project = await import('../projectStorage.js');
    await project.initializeProjectStorage();
    const store = await import('../dataStore.mjs');
    const apply = await import('../src/design-synthesis/applyProposal.mjs');
    const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
    const { buildLoadFlowModel } = await import('../analysis/loadFlowModel.js');
    const { runLoadFlow } = await import('../analysis/loadFlow.js');
    const emptySession = project.captureProjectTransactionSnapshot();
    const canonical = () => structuredClone({ equipment: store.getEquipment(), loads: store.getLoads(), panels: store.getPanels(), cables: store.getCables(), trays: store.getTrays(), conduits: store.getConduits(), oneLine: store.getOneLine() });
    function setup(count, { distinctTags = false, withMotor = false, equipmentOnly = false } = {}) {
      values.clear(); peakBytes = 0; rejectNamedSave = false;
      globalThis.window = { currentProjectId: `Existing equipment ${count}`, dispatchEvent() {} };
      project.restoreProjectTransactionSnapshot(emptySession);
      project.setProjectState(project.defaultProject(), { captureUndo: false });
      store.setProjectMeta({ name: window.currentProjectId });
      const input = nonmotorDistributionPartitionFixture(count);
      delete input.faultStudy;
      delete input.faultEvolution;
      const motorReference = withMotor ? distributionPartitionFixture(count) : null;
      if (motorReference) {
        input.supply.motorStartingImpedance = motorReference.supply.motorStartingImpedance;
        input.criteria.motorStarting = motorReference.criteria.motorStarting;
        input.criteria.motorStarter = motorReference.criteria.motorStarter;
      }
      store.setEquipment(input.equipment.map((row, index) => ({ id: row.id, tag: row.tag, description: `Owner's ${row.tag}`, voltage: String(row.voltage), phases: String(row.phases), x: String(row.x), y: String(row.y), z: String(row.z), manufacturer: 'Owner supplied', ownerCustomData: { purchaseReference: `PO-${row.id}` }, ...(equipmentOnly ? { kw: String(row.kw), powerFactor: String(row.powerFactor), duty: row.duty, ratingsBasis: 'electrical-input-kW' } : {}), ...(equipmentOnly && motorReference && index === 0 ? { category: 'Motor', motorRatedVoltageV: String(motorReference.equipment[0].motor.ratedVoltageV), motorFullLoadCurrentA: String(motorReference.equipment[0].motor.fullLoadCurrentA), motorFullLoadCurrentReference: motorReference.equipment[0].motor.fullLoadCurrentBasis.reference, motorNameplateCurrentA: String(motorReference.equipment[0].motor.nameplateCurrentA), motorLockedRotorCurrentA: String(motorReference.equipment[0].motor.lockedRotorCurrentA), motorLockedRotorPowerFactor: String(motorReference.equipment[0].motor.lockedRotorPowerFactor), motorStarterType: motorReference.equipment[0].motor.starterType } : {}) })));
      const sourceEquipment = store.getEquipment();
      store.setLoads(equipmentOnly ? [] : input.equipment.map((row, index) => ({ id: `existing-load-${index + 1}`, equipmentId: sourceEquipment.find(record => record.tag === row.tag).id, tag: distinctTags ? `LOAD-${row.tag}` : row.tag, kw: row.kw, powerFactor: row.powerFactor, duty: row.duty, voltage: row.voltage, phases: row.phases, ratingsBasis: 'electrical-input-kW', ownerCustomData: { process: `Process-${index + 1}` }, ...(withMotor && index === 0 ? { loadType:'Motor', motor:structuredClone(motorReference.equipment[0].motor) } : {}) })));
      const before = canonical();
      const context = apply.previewDesignProposal(generateDesignProposal(input)).context;
      const built = buildDesignSynthesisProjectEquipmentAdoption({ ...context, equipment: before.equipment, loads: before.loads, selectedEquipmentIds: before.equipment.map(row => row.id), acknowledgements: fixture().acknowledgements });
      assert.equal(built.ok, true, JSON.stringify(built.issues));
      input.equipment = built.selectedRows;
      input.projectEquipmentAdoption = built.adoption;
      store.setItem('designSynthesisDraft', input);
      return { input, before };
    }
    return { project, store, apply, generateDesignProposal, buildLoadFlowModel, runLoadFlow, canonical, setup, maximumBytes, get peakBytes() { return peakBytes; }, rejectSave(value) { rejectNamedSave = value; } };
  })();
  return harnessPromise;
}

for (const count of [25, 50]) test(`${count} equipment-only ratings create loads and survive undo, reload and regeneration`, async context => {
  const h = await storageHarness();
  const { input, before } = h.setup(count, { equipmentOnly: true });
  try {
    assert.equal(before.loads.filter(row => row.equipmentId || row.kw).length, 0);
    const proposal = h.generateDesignProposal(input);
    const preview = h.apply.previewDesignProposal(proposal);
    assert.equal(preview.ok, true, JSON.stringify({errors:preview.errors, conflicts:preview.conflicts}));
    const result = h.apply.applyDesignProposal(proposal, {previewContext:preview.context});
    assert.equal(result.applied, true, JSON.stringify({errors:result.errors, conflicts:result.conflicts}));
    const after = h.canonical();
    assert.equal(after.loads.filter(row => row.equipmentId).length, count);
    for (const original of before.equipment) {
      const equipment = after.equipment.find(row => row.id === original.id);
      const load = after.loads.find(row => String(row.id).toLowerCase() === `ds-load-${original.id}`.toLowerCase());
      assert.ok(load, `${original.id}: ${after.loads.map(row => row.id).join(', ')}`);
      assert.equal(load.equipmentId, original.id);
      assert.equal(Number(load.kw), Number(original.kw));
      assert.equal(load._designSynthesis.source, 'design-synthesis');
      assert.deepEqual(equipment.ownerCustomData, original.ownerCustomData);
      assert.equal(equipment._designSynthesis, undefined);
    }
    assert.deepEqual(after.panels.flatMap(panel => panel.loadIds).map(id => id.toLowerCase()).sort(), after.loads.filter(row => row.equipmentId).map(row => row.id.toLowerCase()).sort());
    h.project.undoProjectChange();
    assert.deepEqual(h.canonical(), before);
    h.project.redoProjectChange();
    assert.deepEqual(h.canonical(), after);
    assert.equal(h.store.loadProject(window.currentProjectId), true);
    assert.deepEqual(h.canonical(), after);
    const lastApplied = h.store.getItem('designSynthesisLastApplied', null);
    const currentContext = h.apply.previewDesignProposal(h.generateDesignProposal(input)).context;
    const reviewedAgain = buildDesignSynthesisProjectEquipmentAdoption({ ...currentContext, equipment: after.equipment, loads: after.loads, selectedEquipmentIds: before.equipment.map(row => row.id), acknowledgements: fixture().acknowledgements, lastApplied });
    assert.equal(reviewedAgain.ok, true, JSON.stringify(reviewedAgain.issues));
    const repeated = h.generateDesignProposal(input);
    const repeatedPreview = h.apply.previewDesignProposal(repeated);
    assert.equal(repeatedPreview.ok, true, JSON.stringify({errors:repeatedPreview.errors, conflicts:repeatedPreview.conflicts}));
    assert.equal(h.apply.applyDesignProposal(repeated, {previewContext:repeatedPreview.context}).applied, true);
    assert.deepEqual(h.canonical(), after);
    const edited = h.store.getLoads();
    edited.find(row => row.equipmentId === before.equipment[0].id).kw += 1;
    h.store.setLoads(edited);
    const editedContext = h.apply.previewDesignProposal(repeated).context;
    const rejected = buildDesignSynthesisProjectEquipmentAdoption({ ...editedContext, equipment: h.store.getEquipment(), loads: h.store.getLoads(), selectedEquipmentIds: [before.equipment[0].id], acknowledgements: fixture().acknowledgements, lastApplied: h.store.getItem('designSynthesisLastApplied', null) });
    assert.equal(rejected.ok, false, 'A modified generated load cannot be silently treated as equipment-only');
    assert.ok(h.peakBytes <= h.maximumBytes);
    context.diagnostic(`Equipment-only ${count}: peak ${h.peakBytes}/${h.maximumBytes} bytes`);
  } finally { delete globalThis.window; }
});

test('omitting a reviewed equipment-only row removes its unchanged generated load and keeps owner equipment', async () => {
  const h = await storageHarness();
  const { input, before } = h.setup(25, { equipmentOnly: true });
  try {
    let proposal = h.generateDesignProposal(input);
    let preview = h.apply.previewDesignProposal(proposal);
    assert.equal(h.apply.applyDesignProposal(proposal, {previewContext:preview.context}).applied, true);
    const selected = before.equipment.slice(1).map(row => row.id);
    const reviewed = buildDesignSynthesisProjectEquipmentAdoption({ ...h.apply.previewDesignProposal(proposal).context, equipment: h.store.getEquipment(), loads: h.store.getLoads(), selectedEquipmentIds: selected, acknowledgements: fixture().acknowledgements, lastApplied: h.store.getItem('designSynthesisLastApplied', null) });
    assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
    input.equipment = reviewed.selectedRows;
    input.projectEquipmentAdoption = reviewed.adoption;
    proposal = h.generateDesignProposal(input);
    preview = h.apply.previewDesignProposal(proposal);
    assert.equal(preview.ok, true, JSON.stringify({errors:preview.errors, conflicts:preview.conflicts}));
    assert.equal(h.apply.applyDesignProposal(proposal, {previewContext:preview.context}).applied, true);
    const after = h.canonical();
    assert.ok(after.equipment.some(row => row.id === before.equipment[0].id));
    assert.equal(after.loads.some(row => row.equipmentId === before.equipment[0].id), false);
    assert.equal(after.loads.filter(row => row.equipmentId).length, 24);
  } finally { delete globalThis.window; }
});

test('25 equipment-only rows with one flat motor produce motor evidence without bypassing Apply', async () => {
  const h = await storageHarness();
  const { input, before } = h.setup(25, { equipmentOnly: true, withMotor: true });
  try {
    const proposal = h.generateDesignProposal(input);
    assert.equal(proposal.loads.length, 25);
    assert.equal(proposal.loads.filter(row => row.motor).length, 1);
    const motor = proposal.loads.find(row => row.motor);
    assert.equal(motor.motor.fullLoadCurrentA, Number(before.equipment[0].motorFullLoadCurrentA));
    assert.equal(motor.motor.nameplateCurrentA, Number(before.equipment[0].motorNameplateCurrentA));
    assert.equal(proposal.motorStartingValidation.cases.length, 1);
    assert.ok(proposal.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
    const preview = h.apply.previewDesignProposal(proposal);
    assert.equal(preview.ok, false);
    assert.equal(h.apply.applyDesignProposal(proposal, { previewContext: preview.context }).applied, false);
    assert.deepEqual(h.canonical(), before);
  } finally { delete globalThis.window; }
});

for (const count of [25, 50]) test(`${count} existing equipment/load pairs apply with distinct IDs, preserve owner fields, undo, reload and regenerate`, async context => {
  const h = await storageHarness();
  const { input, before } = h.setup(count);
  try {
    assert.deepEqual(h.canonical(), before, 'Review/copy may not mutate canonical collections');
    const proposal = h.generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    const preview = h.apply.previewDesignProposal(proposal);
    assert.equal(preview.ok, true, JSON.stringify({errors:preview.errors, conflicts:preview.conflicts}));
    const result = h.apply.applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(result.applied, true, JSON.stringify({errors:result.errors, conflicts:result.conflicts}));
    const after = h.canonical();
    const expectedLoadIds = before.loads.map(row => row.id).sort();
    assert.deepEqual(after.loads.map(row => row.id).sort(), expectedLoadIds);
    for (const original of before.equipment) {
      const current = after.equipment.find(row => row.id === original.id);
      assert.ok(current);
      for (const key of Object.keys(original)) if (!['panelId', 'panelRef'].includes(key)) assert.deepEqual(current[key], original[key], `${original.id}.${key}`);
      assert.equal(current._designSynthesis, undefined, 'An adopted owner record is not wholly synthesis owned');
    }
    for (const original of before.loads) {
      const current = after.loads.find(row => row.id === original.id);
      assert.deepEqual(current.ownerCustomData, original.ownerCustomData);
      assert.equal(current.equipmentId, original.equipmentId);
      assert.equal(current.tag, original.tag);
      assert.equal(current.kw, original.kw);
      assert.equal(current._designSynthesis, undefined);
      assert.ok(current.panelId && current.breaker);
    }
    assert.deepEqual(after.panels.flatMap(panel => panel.loadIds).sort(), expectedLoadIds);
    const modeled = h.buildLoadFlowModel(after.oneLine);
    const flow = h.runLoadFlow(modeled, {baseMVA:1, balanced:true, maxIterations:60});
    assert.equal(flow.converged, true);
    const expectedKW = before.loads.reduce((sum, row) => sum + Number(row.kw), 0);
    assert.ok(Math.abs(flow.summary.totalLoadKW - expectedKW) < 1e-7, `${flow.summary.totalLoadKW} versus ${expectedKW} kW`);
    h.project.undoProjectChange();
    assert.deepEqual(h.canonical(), before, 'One undo must restore source collections and drawing');
    h.project.redoProjectChange();
    assert.deepEqual(h.canonical(), after);
    assert.equal(h.store.loadProject(window.currentProjectId), true);
    assert.deepEqual(h.canonical(), after);
    const repeated = h.generateDesignProposal(input);
    const repeatedPreview = h.apply.previewDesignProposal(repeated);
    assert.equal(repeatedPreview.ok, true, JSON.stringify({errors:repeatedPreview.errors, conflicts:repeatedPreview.conflicts}));
    assert.equal(h.apply.applyDesignProposal(repeated, {previewContext:repeatedPreview.context}).applied, true);
    assert.deepEqual(h.canonical(), after, 'Reload and regeneration must not duplicate or replace owner records');
    assert.ok(h.peakBytes <= h.maximumBytes);
    context.diagnostic(`Existing-equipment ${count}: peak ${h.peakBytes}/${h.maximumBytes} bytes`);
  } finally { delete globalThis.window; }
});

test('regeneration preserves later owner edits and restores only generated fields when an adopted load is omitted', async () => {
  const h = await storageHarness();
  const { input, before } = h.setup(25);
  const apply = proposal => h.apply.applyDesignProposal(proposal, {previewContext:h.apply.previewDesignProposal(proposal).context});
  try {
    assert.equal(apply(h.generateDesignProposal(input)).applied, true);
    const omittedEquipmentId = before.equipment[0].id;
    const omittedLoadId = before.loads.find(row => row.equipmentId === omittedEquipmentId).id;
    const ownerEquipment = h.store.getEquipment();
    ownerEquipment.find(row => row.id === omittedEquipmentId).ownerCustomData.comment = 'Later equipment owner edit';
    ownerEquipment.find(row => row.id === omittedEquipmentId).assetRegistry = { status:'Owner-maintained extension' };
    h.store.setEquipment(ownerEquipment);
    const ownerLoads = h.store.getLoads();
    ownerLoads.find(row => row.id === omittedLoadId).ownerCustomData.comment = 'Later load owner edit';
    ownerLoads.find(row => row.id === omittedLoadId).commercialPackage = { order:'Later purchasing detail' };
    h.store.setLoads(ownerLoads);
    const revisedInput = structuredClone(input);
    revisedInput.equipment = revisedInput.equipment.filter(row => row.id !== omittedEquipmentId);
    const revised = h.generateDesignProposal(revisedInput);
    const result = apply(revised);
    assert.equal(result.applied, true, JSON.stringify({errors:result.errors,conflicts:result.conflicts}));
    const after = h.canonical();
    const omittedEquipment = after.equipment.find(row => row.id === omittedEquipmentId);
    const omittedLoad = after.loads.find(row => row.id === omittedLoadId);
    assert.deepEqual(omittedEquipment, {...before.equipment[0], ownerCustomData:{...before.equipment[0].ownerCustomData, comment:'Later equipment owner edit'}, assetRegistry:{status:'Owner-maintained extension'}});
    const originalLoad = before.loads.find(row => row.id === omittedLoadId);
    assert.deepEqual(omittedLoad, {...originalLoad, ownerCustomData:{...originalLoad.ownerCustomData, comment:'Later load owner edit'}, commercialPackage:{order:'Later purchasing detail'}});
    assert.equal(after.loads.length, 25, 'Omitting a design input must not delete its adopted owner load');
    assert.equal(after.panels.flatMap(panel => panel.loadIds).length, 24);
    assert.ok(!after.panels.some(panel => panel.loadIds.includes(omittedLoadId)));
  } finally { delete globalThis.window; }
});

test('manual changes to synthesis-owned fields block regeneration without changing owner data', async () => {
  const h = await storageHarness();
  const { input } = h.setup(25);
  try {
    const initial = h.generateDesignProposal(input);
    assert.equal(h.apply.applyDesignProposal(initial, {previewContext:h.apply.previewDesignProposal(initial).context}).applied, true);
    const changed = h.store.getLoads(); changed[0].breaker += 1;
    h.store.setLoads(changed);
    const before = h.project.captureProjectTransactionSnapshot();
    const next = h.generateDesignProposal(input);
    const preview = h.apply.previewDesignProposal(next);
    assert.equal(preview.ok, false);
    assert.ok([...preview.errors, ...preview.conflicts].some(row => row.code === 'adopted_generated_field_modified'));
    assert.equal(h.apply.applyDesignProposal(next, {previewContext:preview.context}).applied, false);
    assert.deepEqual(h.project.captureProjectTransactionSnapshot(), before);
  } finally { delete globalThis.window; }
});

test('actual edits to the saved diagram remain protected from regeneration and removal', async () => {
  const h = await storageHarness();
  const { input } = h.setup(25);
  try {
    const initial = h.generateDesignProposal(input);
    assert.equal(h.apply.applyDesignProposal(initial, {previewContext:h.apply.previewDesignProposal(initial).context}).applied, true);
    const drawing = h.store.getOneLine();
    const component = drawing.sheets.flatMap(sheet => sheet.components).find(row => row.id === input.equipment[0].id);
    assert.ok(component);
    component.ownerCustomData = {...component.ownerCustomData, diagramNote:'Manual diagram-only metadata'};
    h.store.setOneLine(drawing, undefined, {captureRevision:false});
    const before = h.project.captureProjectTransactionSnapshot();
    for (const nextInput of [input, {...input, equipment:input.equipment.slice(1)}]) {
      const proposal = h.generateDesignProposal(nextInput);
      const preview = h.apply.previewDesignProposal(proposal);
      assert.equal(preview.ok, false, 'A saved diagram edit cannot be classified as a source-only hydration change');
      assert.ok(preview.errors.some(row => row.code === 'derived_record_conflict'));
      assert.equal(h.apply.applyDesignProposal(proposal, {previewContext:preview.context}).applied, false);
      assert.deepEqual(h.project.captureProjectTransactionSnapshot(), before);
    }
  } finally { delete globalThis.window; }
});

test('distinct equipment and load tags retain usable Panel Schedule assignments', async () => {
  const h = await storageHarness();
  const { input, before } = h.setup(25, {distinctTags:true});
  try {
    const proposal = h.generateDesignProposal(input);
    const preview = h.apply.previewDesignProposal(proposal);
    assert.equal(preview.ok, true, JSON.stringify({errors:preview.errors,conflicts:preview.conflicts}));
    const result = h.apply.applyDesignProposal(proposal, {previewContext:preview.context});
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    const after = h.canonical();
    for (const load of before.loads) {
      const saved = after.loads.find(row => row.id === load.id);
      assert.equal(saved.tag, load.tag);
      const panel = after.panels.find(row => row.id.toLowerCase() === saved.panelId.toLowerCase());
      assert.equal(panel.breakers[saved.breaker - 1], load.tag);
      assert.ok(panel.loadIds.includes(load.id));
    }
  } finally { delete globalThis.window; }
});

test('project motor handoff retains its model and cannot bypass unresolved protection when starting passes', async () => {
  const h = await storageHarness();
  const { input } = h.setup(25, {withMotor:true});
  try {
    assert.ok(input.equipment[0].motor);
    const proposal = h.generateDesignProposal(input);
    assert.equal(proposal.motorStartingValidation.status, 'pass');
    assert.equal(proposal.status, 'blocked');
    assert.ok(proposal.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
    const before = h.project.captureProjectTransactionSnapshot();
    const preview = h.apply.previewDesignProposal(proposal);
    assert.equal(preview.ok, false);
    assert.equal(h.apply.applyDesignProposal(proposal, {previewContext:preview.context}).applied, false);
    assert.deepEqual(h.project.captureProjectTransactionSnapshot(), before);
  } finally { delete globalThis.window; }
});

// Deliberately last: the application correctly enters degraded persistence mode
// after a quota error; later cases must not inherit that intentional condition.
test('changed source records and failed durable save reject adoption atomically', async () => {
  const h = await storageHarness();
  let setup = h.setup(25);
  try {
    let proposal = h.generateDesignProposal(setup.input);
    const preview = h.apply.previewDesignProposal(proposal);
    const changed = h.store.getEquipment(); changed[0].x = Number(changed[0].x) + 1;
    h.store.setEquipment(changed);
    const beforeRejected = h.project.captureProjectTransactionSnapshot();
    assert.equal(h.apply.applyDesignProposal(proposal, {previewContext:preview.context}).applied, false);
    assert.deepEqual(h.project.captureProjectTransactionSnapshot(), beforeRejected);
    setup = h.setup(25);
    proposal = h.generateDesignProposal(setup.input);
    const valid = h.apply.previewDesignProposal(proposal);
    assert.equal(valid.ok, true, JSON.stringify(valid.errors));
    const beforeFailedSave = h.project.captureProjectTransactionSnapshot();
    h.rejectSave(true);
    const failed = h.apply.applyDesignProposal(proposal, {previewContext:valid.context});
    h.rejectSave(false);
    assert.equal(failed.applied, false);
    assert.deepEqual(h.project.captureProjectTransactionSnapshot(), beforeFailedSave);
  } finally { h.rejectSave(false); delete globalThis.window; }
});
