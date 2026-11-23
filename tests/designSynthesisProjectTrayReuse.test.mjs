import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectTrayReuseBinding, validateProjectTrayReuseBasis, validateProjectTrayReuseBinding } from '../analysis/designSynthesisProjectTrayReuse.mjs';

function fixture() {
  return {
    supply: { id: 'S', voltage: 480 }, equipment: [{ id: 'L', kw: 10 }], criteria: { voltageDropLimitPct: 3 },
    projectTrayAdoption: { schemaVersion: 'project-trays-v2', selectedTrayIds: ['SHORT'], acknowledgements: { replaceGenerated: true }, reuseEvidence: { thermalReference: 'Synthetic thermal review', installationReference: 'Synthetic installation review', coverageConfirmed: true } },
    corridors: { edges: [{ id: 'SHORT', existingTray: { trayId: 'SHORT' }, thermal: { ambientTempC: 30, bundledConductors: 3, solidCoverContinuousLengthFt: 0 } }] },
  };
}

test('reuse requires explicit thermal and installation references and every edge assumption', () => {
  const invalid = [
    value => { delete value.projectTrayAdoption.reuseEvidence; },
    value => { value.projectTrayAdoption.reuseEvidence.thermalReference = ''; },
    value => { value.projectTrayAdoption.reuseEvidence.installationReference = {}; },
    value => { value.projectTrayAdoption.reuseEvidence.coverageConfirmed = false; },
    value => { value.projectTrayAdoption.reuseEvidence.extra = 'unrecognized'; },
    value => { value.projectTrayAdoption.acknowledgements.replaceGenerated = false; },
    value => { delete value.corridors.edges[0].thermal.ambientTempC; },
    value => { value.corridors.edges[0].thermal.ambientTempC = '30'; },
    value => { value.corridors.edges[0].thermal.bundledConductors = 0; },
    value => { delete value.corridors.edges[0].thermal.solidCoverContinuousLengthFt; },
    value => { value.corridors.edges[0].thermal.solidCoverContinuousLengthFt = -1; },
    value => { value.corridors.edges[0].id = 'unreviewed'; },
    value => { value.corridors.edges = []; },
  ];
  assert.equal(validateProjectTrayReuseBasis({ adoption: fixture().projectTrayAdoption, corridors: fixture().corridors }).ok, true);
  for (const mutate of invalid) {
    const input = fixture(); mutate(input);
    assert.equal(buildProjectTrayReuseBinding(input).ok, false);
  }
});

test('reuse reference binding becomes stale on any changed input, including the generation baseline', () => {
  const input = fixture();
  assert.equal(validateProjectTrayReuseBinding(input).ok, false);
  input.projectTrayReuseBinding = buildProjectTrayReuseBinding(input).binding;
  assert.equal(validateProjectTrayReuseBinding(input).ok, true);
  for (const mutate of [
    value => { value.equipment[0].kw = 11; },
    value => { value.corridors.edges[0].thermal.ambientTempC = 35; },
    value => { value.projectTrayAdoption.reuseEvidence.thermalReference = 'different reference'; },
    value => { value.generationBaseline = { panels: [], nextPanelNumber: 1 }; },
  ]) {
    const changed = structuredClone(input); mutate(changed);
    assert.equal(validateProjectTrayReuseBinding(changed).ok, false);
  }
});
