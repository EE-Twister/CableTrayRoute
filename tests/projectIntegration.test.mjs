import assert from 'node:assert/strict';
import {
  buildBatteryProjectInputs,
  buildOneLineProjectView,
  buildBusDuctProjectInputs,
  buildBessHazardProjectInputs,
  buildCableThermalProjectInputs,
  buildProjectScopeOptions,
  buildVoltageFlickerProjectInputs,
  buildInsulationCoordinationProjectInputs,
  buildGeneratorProjectInputs,
  createStudyInputSnapshot,
  getStudyStaleness,
  hashProjectInputs,
  normalizeProjectMeta,
  normalizeProjectEntities,
  normalizeOneLineReferences,
  resolveProjectScope,
  projectLoadRows,
  withStudyProvenance,
} from '../analysis/projectIntegration.mjs';

const loads = [
  { id: 'L-1', description: 'Critical lighting', kw: 20, demandFactor: 1 },
  { id: 'L-2', description: 'HVAC', kw: 75, demandFactor: 0.8 },
  { id: 'L-3', description: 'Pump', hp: 100, efficiency: 0.9, demandFactor: 0.5 },
];

const normalizedLoads = projectLoadRows(loads);
assert.equal(normalizedLoads.length, 3);
assert.equal(normalizedLoads[2].kw, 82.889);
assert.equal(normalizedLoads[2].sourcePath, 'loads.L-3');

const meta = normalizeProjectMeta({
  projectNumber: 'P-2401',
  owner: 'Example Owner',
  location: 'Plant 1',
  altitudeFt: '1250',
  ambientTempC: '46',
}, 'Fallback Project');
assert.equal(meta.name, 'Fallback Project');
assert.equal(meta.number, 'P-2401');
assert.equal(meta.client, 'Example Owner');
assert.equal(meta.altitudeFt, 1250);
assert.equal(meta.ambientTempC, 46);

const battery = buildBatteryProjectInputs({
  loads,
  studies: { motorStart: { peakLoadKw: 180 } },
  designBasis: { sizingDefaults: { defaultPowerFactor: 0.92 } },
  projectMeta: { name: 'Project Alpha', batteryRuntimeHours: 1.5, ambientTempC: 30 },
});
assert.equal(battery.inputs.systemLabel, 'Project Alpha');
assert.equal(battery.inputs.averageLoadKw, 121.445);
assert.equal(battery.inputs.peakLoadKw, 180);
assert.equal(battery.inputs.runtimeHours, 1.5);
assert.equal(battery.inputs.upsPowerFactor, 0.92);
assert.equal(battery.missing.length, 0);

const generator = buildGeneratorProjectInputs({
  loads,
  equipment: [{ id: 'M-200', description: 'Fire pump', horsepower: 200, powerFactor: 0.86, efficiency: 0.94 }],
  projectMeta: { name: 'Project Alpha', site: 'North Utility Yard', altitudeFt: 1250, ambientTempC: 46 },
});
assert.equal(generator.inputs.projectLabel, 'North Utility Yard');
assert.equal(generator.inputs.loads.length, 3);
assert.equal(generator.inputs.motorHp, 200);
assert.equal(generator.inputs.motorPf, 0.86);
assert.equal(generator.inputs.motorEff, 0.94);

const inferredMotor = buildGeneratorProjectInputs({
  loads: [{ tag: 'PMP-101', description: 'Cooling water pump motor', loadType: 'Motor', kw: 18.6, powerFactor: 85, efficiency: 92 }],
});
assert.equal(inferredMotor.inputs.motorHp, 22.9);
assert.equal(inferredMotor.inputs.motorPf, 0.85);
assert.equal(inferredMotor.inputs.motorEff, 0.92);

assert.equal(hashProjectInputs({ b: 2, a: 1 }), hashProjectInputs({ a: 1, b: 2 }));
const originalSnapshot = createStudyInputSnapshot('batterySizing', battery.inputs, battery.bindings, []);
const savedResult = withStudyProvenance({ selectedKwh: 250 }, originalSnapshot);
assert.equal(getStudyStaleness(savedResult, originalSnapshot).status, 'current');

const changedSnapshot = createStudyInputSnapshot(
  'batterySizing',
  { ...battery.inputs, averageLoadKw: battery.inputs.averageLoadKw + 10 },
  battery.bindings,
  []
);
const stale = getStudyStaleness(savedResult, changedSnapshot);
assert.equal(stale.status, 'stale');
assert.deepEqual(stale.changedFields, ['averageLoadKw']);

const emptyBattery = buildBatteryProjectInputs({ loads: [] });
assert.equal(emptyBattery.missing.length, 1);

const entities = normalizeProjectEntities({
  equipment: [{ tag: 'PMP-101', description: 'Pump' }, { tag: 'MCC-101' }],
  loads: [{ tag: 'PMP-101', source: 'MCC-101', kw: 18.6 }],
  cables: [{ tag: 'CBL-1', from: 'MCC-101', to: 'PMP-101' }],
});
assert.equal(entities.equipment[0].id, 'pmp-101');
assert.equal(entities.loads[0].equipmentId, 'pmp-101');
assert.equal(entities.cables[0].circuitId, 'cbl-1');
assert.equal(entities.cables[0].sourceEquipmentId, 'mcc-101');
assert.equal(entities.cables[0].targetEquipmentId, 'pmp-101');

const linkedOneLine = normalizeOneLineReferences({
  sheets: [{
    components: [{ id: 'visual-pump', ref: 'PMP-101' }],
    connections: [{ source: 'visual-mcc', target: 'visual-pump', cable: { tag: 'CBL-1', length: 95 } }],
  }],
}, entities);
assert.equal(linkedOneLine.sheets[0].components[0].entityId, 'pmp-101');
assert.equal(linkedOneLine.sheets[0].connections[0].circuitId, 'cbl-1');

const projectedOneLine = buildOneLineProjectView(linkedOneLine, {
  ...entities,
  cables: [{ ...entities.cables[0], length: 120, conductor_size: '#2 AWG' }],
});
assert.equal(projectedOneLine.sheets[0].components[0].projectEntity.description, 'Pump');
assert.equal(projectedOneLine.sheets[0].connections[0].cable.length, 120);
assert.equal(projectedOneLine.sheets[0].connections[0].cable.conductor_size, '#2 AWG');

const scopedProject = {
  equipment: [{ tag: 'MCC-101', voltage: 480 }, { tag: 'PMP-101', description: 'Cooling pump', voltage: 480, subCategory: 'Pump' }],
  loads: [{ tag: 'PMP-101', description: 'Cooling pump motor', loadType: 'Motor', kw: 18.6, powerFactor: 85, efficiency: 92, phases: 3, startsPerHour: 6 }],
  cables: [{ tag: 'CBL-1', from: 'MCC-101', to: 'PMP-101', conductor_size: '#4 AWG', conductor_material: 'Copper', conductors: 3, length_ft: 95, voltage: 480, raceway_ids: ['TR-1'] }],
  trays: [{ id: 'TR-1' }],
  conduits: [],
  studies: { shortCircuit: { availableFaultKa: 22.4, xrRatio: 12 } },
  projectMeta: { maxAmbientTempC: 45 },
  designBasis: { sizingDefaults: { insulationType: 'THWN-2', installationType: 'conduit' } },
};
const scopeOptions = buildProjectScopeOptions(scopedProject, ['load', 'circuit']);
assert.equal(scopeOptions.length, 2);
const pumpScope = resolveProjectScope(scopeOptions.find(option => option.kind === 'load').value, scopedProject);
assert.equal(pumpScope.voltageV, 480);
assert.equal(pumpScope.lengthFt, 95);
assert.equal(pumpScope.faultCurrentKA, 22.4);
assert.ok(pumpScope.currentA > 25 && pumpScope.currentA < 30);

const busInputs = buildBusDuctProjectInputs(pumpScope, scopedProject.projectMeta);
assert.equal(busInputs.inputs.systemVoltageV, 480);
assert.equal(busInputs.inputs.lengthFt, 95);
assert.equal(busInputs.inputs.ambientC, 45);
assert.equal(busInputs.inputs.faultCurrentKA, 22.4);

const flickerInputs = buildVoltageFlickerProjectInputs(scopedProject);
assert.equal(flickerInputs.inputs.loadSteps.length, 1);
assert.equal(flickerInputs.inputs.loadSteps[0].repetitionsPerHour, 6);
assert.equal(flickerInputs.inputs.nominalVoltageKv, 0.48);
assert.ok(flickerInputs.inputs.systemKva > 18000);

const cableScope = resolveProjectScope(scopeOptions.find(option => option.kind === 'circuit').value, scopedProject);
const thermalInputs = buildCableThermalProjectInputs(cableScope, scopedProject);
assert.equal(thermalInputs.inputs.sizeMm2, 25);
assert.equal(thermalInputs.inputs.material, 'Cu');
assert.equal(thermalInputs.inputs.insulation, 'PVC');
assert.equal(thermalInputs.inputs.installMethod, 'tray');
assert.equal(thermalInputs.inputs.ambientTempC, 45);

const bessInputs = buildBessHazardProjectInputs({
  equipment: [],
  projectMeta: { maxAmbientTempC: 42 },
  studies: { batterySizing: { selectedBankKwh: 250, chemistry: 'lead-acid-agm', rackLayoutInputs: { cellsPerModule: 12, modulesPerRack: 40 } } },
});
assert.equal(bessInputs.inputs.ratedKwh, 250);
assert.equal(bessInputs.inputs.chemistry, 'lead-acid');
assert.equal(bessInputs.inputs.cellsPerModule, 12);
assert.equal(bessInputs.inputs.modulesPerRack, 40);
assert.equal(bessInputs.inputs.ambientC, 42);

const insulationInputs = buildInsulationCoordinationProjectInputs(pumpScope, { altitudeFt: 1250 });
assert.equal(insulationInputs.inputs.nominalVoltageKv, 0.48);
assert.equal(insulationInputs.inputs.umKv, 3.6);
assert.equal(insulationInputs.inputs.altitudeM, 381);

console.log('✓ project integration derives shared inputs and detects stale study results');
