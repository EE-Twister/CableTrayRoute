import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { faultEvolutionFixture } from './helpers/faultEvolutionFixture.mjs';
import {
  buildDesignSynthesisFaultEvolutionContext,
  packDesignSynthesisFaultEvolutionValidation,
  resolveDesignSynthesisFaultEvolutionValidation,
} from '../src/design-synthesis/faultEvolutionPersistence.mjs';

function contextFor(proposal) {
  return buildDesignSynthesisFaultEvolutionContext({
    snapshot: {
      projectMeta: { name: 'Persistence test', updatedAt: 'volatile' },
      designBasis: {}, equipment: proposal.equipment, loads: proposal.loads,
      cables: proposal.cables, trays: proposal.trays, conduits: proposal.conduits,
      ductbanks: [], panels: proposal.panels, oneLine: { activeSheet: 0, sheets: proposal.oneLine.sheets },
    },
    projectId: 'Persistence test', scenario: 'base',
    faultStudyValidation: proposal.faultStudyValidation,
    deviceFaultValidation: proposal.deviceFaultValidation,
    deviceEvidence: {},
  });
}

test('evaluated history round-trips fully and rejects stale context and corrupt or trailing data', () => {
  const proposal = generateDesignProposal(faultEvolutionFixture(25, false));
  assert.equal(proposal.faultEvolutionValidation.status, 'evaluated', JSON.stringify(proposal.faultEvolutionValidation.issues));
  const context = contextFor(proposal);
  const packed = packDesignSynthesisFaultEvolutionValidation(proposal, context);
  assert.ok(packed);
  const restored = resolveDesignSynthesisFaultEvolutionValidation(packed, context);
  assert.deepEqual(restored, {
    faultStudy: proposal.faultStudy,
    faultEvolution: proposal.faultEvolution,
    faultEvolutionValidation: proposal.faultEvolutionValidation,
  });
  assert.equal(resolveDesignSynthesisFaultEvolutionValidation(packed, { ...context, projectId: 'Other project' }), null);
  assert.equal(resolveDesignSynthesisFaultEvolutionValidation({ ...packed, payloadBinaryString: `${packed.payloadBinaryString}x` }, context), null);
  assert.equal(resolveDesignSynthesisFaultEvolutionValidation({ ...packed, lzByteLength: packed.lzByteLength + 1 }, context), null);
  assert.equal(resolveDesignSynthesisFaultEvolutionValidation({ ...packed, uncompressedByteLength: 12_000_001 }, context), null);
});
