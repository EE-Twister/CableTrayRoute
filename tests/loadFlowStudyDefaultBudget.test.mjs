import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { getStudies, getStudyAssessments, getStudyProvenance, setOneLine } from '../dataStore.mjs';
import { runLoadFlowStudy } from '../studies/loadFlow.js';

const sample = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

test('ordinary load-flow study defaults to an adequate bounded budget for generated radial cases', () => {
  for (const baseMVA of [1, 100]) for (const count of [25, 30, 50]) {
    const input = structuredClone(sample);
    input.equipment = Array.from({ length: count }, (_, index) => ({
      ...sample.equipment[index % sample.equipment.length],
      id: `DEFAULT-BUDGET-${count}-${index}`,
      tag: `DEFAULT-BUDGET-${count}-${index}`,
    }));
    input.supply.capacityKva = 10000;
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal');
    setOneLine(proposal.oneLine);
    const result = runLoadFlowStudy({ baseMVA, balanced: true });
    assert.equal(result.converged, true, `${count}-load default study should converge at ${baseMVA} MVA`);
    assert.ok(result.iterations <= 60);
    assert.ok(result.maxMismatch < 1e-6);
    assert.equal(getStudyProvenance().loadFlow.optionsSnapshot.maxIterations, 60);
  }
});

test('explicit iteration limits remain authoritative and do not get promoted', () => {
  const input = structuredClone(sample);
  input.equipment = input.equipment.slice(0, 30);
  input.supply.capacityKva = 10000;
  setOneLine(generateDesignProposal(input).oneLine);
  const result = runLoadFlowStudy({ baseMVA: 100, balanced: true, maxIterations: 1.9 });
  assert.equal(result.converged, false);
  assert.equal(result.persisted, false);
});

test('persisted generated result remains current after JSON storage normalization', () => {
  const input = structuredClone(sample);
  input.equipment = input.equipment.slice(0, 30);
  input.supply.capacityKva = 10000;
  setOneLine(generateDesignProposal(input).oneLine);
  const result = runLoadFlowStudy({ baseMVA: 100, balanced: true });
  assert.equal(result.converged, true);
  assert.equal(result.persisted, true);
  assert.equal(getStudies().loadFlow.converged, true);
  assert.equal(getStudyAssessments().loadFlow.freshness, 'current');
  assert.equal(getStudyAssessments().loadFlow.reasons.includes('result_changed'), false);
});
