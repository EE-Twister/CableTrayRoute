import assert from 'node:assert/strict';
import {
  applyMccProjectInputSuggestions,
  buildMccProjectInputSuggestions,
  markMccProjectFieldOverride,
  mccProjectFieldSource
} from '../src/mcc-lineup/projectIntegration.mjs';

const project = {
  lineup: { tag: 'MCC-101', equipmentTag: 'MCC-101', voltage: '' },
  projectMeta: {
    name: 'Process Expansion',
    client: 'Example Owner',
    site: 'North Plant',
    location: 'Texas',
    altitudeFt: 750,
    minAmbientTempC: -10,
    maxAmbientTempC: 45
  },
  designBasis: {
    codeBasis: { primaryCode: 'NEC', edition: '2023', jurisdiction: 'Texas', ahj: 'City Electrical' }
  },
  equipment: [{
    id: 'eq-mcc-101',
    tag: 'MCC-101',
    voltage: '480',
    phases: '3',
    frequencyHz: 60,
    groundingConfiguration: 'Solidly grounded wye',
    arrangement: 'Electrical Room 1',
    x: 10,
    y: 20,
    z: 0,
    sccrKa: 65
  }],
  oneLine: {
    sheets: [{
      components: [{
        id: 'comp-mcc-101',
        label: 'MCC-101',
        equipmentRef: 'MCC-101',
        props: { wires: 3, neutralRequirement: 'No neutral' }
      }]
    }]
  },
  studies: {
    shortCircuit: {
      _meta: { method: 'ANSI' },
      'comp-mcc-101': { equipmentTag: 'MCC-101', method: 'ANSI', threePhaseKA: 22.4 }
    }
  },
  cables: [
    {
      tag: 'CBL-SWBD-MCC-101',
      from_tag: 'SWBD-101',
      to_tag: 'MCC-101',
      conductors: 3,
      conductor_size: '500 kcmil',
      conductor_material: 'Copper',
      insulation_type: 'XHHW-2',
      ground_size: '#3 AWG',
      ground_material: 'Copper',
      parallel_count: 2
    },
    {
      tag: 'CBL-MCC-P-101',
      from_tag: 'MCC-101',
      to_tag: 'P-101',
      conductors: 3,
      conductor_size: '#4 AWG',
      conductor_material: 'Copper'
    }
  ]
};

const suggestions = buildMccProjectInputSuggestions(project);
assert.equal(suggestions.values.voltage, '480V');
assert.equal(suggestions.values['systemRequirements.phases'], '3');
assert.equal(suggestions.values['systemRequirements.wires'], 3);
assert.equal(suggestions.values['systemRequirements.availableFaultCurrentKa'], 22.4);
assert.equal(suggestions.values['systemRequirements.faultCurrentMethod'], 'ANSI');
assert.equal(suggestions.values['specRequirements.shortCircuitRatingKa'], 65);
assert.equal(suggestions.bindings['specRequirements.shortCircuitRatingKa'].sourceLabel, 'Equipment List');
assert.match(suggestions.bindings['specRequirements.shortCircuitRatingKa'].sourcePath, /\.sccrKa$/);
assert.equal(suggestions.values['installationRequirements.installationLocation'], 'Electrical Room 1');
assert.equal(suggestions.values['installationRequirements.altitudeFt'], 750);
assert.match(suggestions.values['installationRequirements.incomingCableSummary'], /2 parallel runs/);
assert.match(suggestions.values['installationRequirements.incomingCableSummary'], /500 kcmil/);
assert.match(suggestions.values['installationRequirements.outgoingCableSummary'], /CBL-MCC-P-101/);
assert.equal(suggestions.bindings['systemRequirements.availableFaultCurrentKa'].sourceLabel, 'Short Circuit');
assert.equal(suggestions.missing.length, 0);

const aliasSuggestions = buildMccProjectInputSuggestions({
  lineup: { tag: 'MCC-ALIAS' },
  equipment: [{
    tag: 'MCC-ALIAS',
    phase: 3,
    frequency_hz: 50,
    sccr_ka: 42,
    service_entrance: false,
    arc_resistant: true,
    location: 'Compressor Building'
  }]
});
assert.equal(aliasSuggestions.bindings['systemRequirements.phases'].sourceLabel, 'Equipment List');
assert.match(aliasSuggestions.bindings['systemRequirements.frequencyHz'].sourcePath, /\.frequency_hz$/);
assert.equal(aliasSuggestions.bindings['specRequirements.shortCircuitRatingKa'].sourceLabel, 'Equipment List');
assert.equal(aliasSuggestions.values['systemRequirements.serviceEntrance'], 'no');
assert.equal(aliasSuggestions.values['systemRequirements.arcResistantRequirement'], 'required');
assert.equal(aliasSuggestions.bindings['installationRequirements.installationLocation'].sourceLabel, 'Equipment List');

const firstApply = applyMccProjectInputSuggestions(project.lineup, suggestions);
assert.equal(firstApply.lineup.voltage, '480V');
assert.equal(firstApply.lineup.systemRequirements.availableFaultCurrentKa, 22.4);
assert.ok(firstApply.lineup.projectDataLinkedFields.includes('systemRequirements.availableFaultCurrentKa'));

const defaultApply = applyMccProjectInputSuggestions({
  tag: 'MCC-101',
  voltage: '480V',
  specRequirements: { shortCircuitRatingKa: 65 },
  reportTitleBlock: { revision: 'A' }
}, {
  values: {
    voltage: '600V',
    'specRequirements.shortCircuitRatingKa': 42,
    'reportTitleBlock.revision': 'C'
  },
  bindings: {
    voltage: { sourcePath: 'equipment.eq.voltage', sourceLabel: 'Equipment List' },
    'specRequirements.shortCircuitRatingKa': { sourcePath: 'equipment.eq.sccrKa', sourceLabel: 'Equipment List' },
    'reportTitleBlock.revision': { sourcePath: 'projectMeta.revision', sourceLabel: 'Project Metadata' }
  }
}, { replaceDefaults: true });
assert.equal(defaultApply.lineup.voltage, '600V', 'untouched generic voltage default should yield to project data');
assert.equal(defaultApply.lineup.specRequirements.shortCircuitRatingKa, 42, 'untouched generic SCCR default should yield to project data');
assert.equal(defaultApply.lineup.reportTitleBlock.revision, 'C', 'untouched report revision default should yield to project data');

const prelinkedManual = { tag: 'MCC-101', voltage: '575V' };
markMccProjectFieldOverride(prelinkedManual, 'voltage');
const preservedPrelinkedManual = applyMccProjectInputSuggestions(prelinkedManual, {
  values: { voltage: '600V' },
  bindings: { voltage: { sourcePath: 'equipment.eq.voltage', sourceLabel: 'Equipment List' } }
}, { replaceDefaults: true });
assert.equal(preservedPrelinkedManual.lineup.voltage, '575V', 'manual values entered before linking should be preserved');

markMccProjectFieldOverride(firstApply.lineup, 'systemRequirements.availableFaultCurrentKa');
firstApply.lineup.systemRequirements.availableFaultCurrentKa = 30;
const changedSuggestions = {
  ...suggestions,
  values: { ...suggestions.values, 'systemRequirements.availableFaultCurrentKa': 24.1 }
};
const preserved = applyMccProjectInputSuggestions(firstApply.lineup, changedSuggestions);
assert.equal(preserved.lineup.systemRequirements.availableFaultCurrentKa, 30, 'manual MCC override should survive normal project refresh');
assert.equal(mccProjectFieldSource(preserved.lineup, 'systemRequirements.availableFaultCurrentKa').state, 'override');

const forced = applyMccProjectInputSuggestions(preserved.lineup, changedSuggestions, { force: true });
assert.equal(forced.lineup.systemRequirements.availableFaultCurrentKa, 24.1, 'explicit refresh should restore project-linked value');
assert.equal(mccProjectFieldSource(forced.lineup, 'systemRequirements.availableFaultCurrentKa').state, 'linked');

const standalone = buildMccProjectInputSuggestions({ lineup: { tag: 'MCC-X' } });
assert.ok(standalone.missing.some(message => /Equipment List or One-Line/.test(message)));
assert.ok(standalone.missing.some(message => /incoming Cable Schedule/.test(message)));

console.log('MCC project integration tests passed');
