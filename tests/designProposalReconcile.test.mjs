import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reconcileDesignProposal } from '../analysis/designProposalReconcile.mjs';

const generated = (identity, fields = {}) => ({ id: identity, tag: identity, ...fields, _designSynthesis: { identity, source: 'design-synthesis' } });

describe('design proposal reconciliation', () => {
  it('preserves unrelated records and updates generated records', () => {
    const current = { equipment: [{ id: 'manual', tag: 'M-1' }, generated('E-1', { description: 'old' })] };
    const result = reconcileDesignProposal({
      current,
      proposal: { equipment: [generated('E-1', { description: 'new' }), generated('E-2')] },
      lastApplied: { records: { equipment: { 'E-1': { id: 'E-1', tag: 'E-1', description: 'old' } } } },
    });
    assert.equal(result.ok, true);
    assert.equal(result.next.equipment.length, 3);
    assert.equal(result.next.equipment.find(item => item.id === 'manual').tag, 'M-1');
    assert.equal(result.next.equipment.find(item => item.id === 'E-1').description, 'new');
  });

  it('rejects same-tag collisions with user equipment', () => {
    const result = reconcileDesignProposal({
      current: { equipment: [{ id: 'user-1', tag: 'MCC-1' }] },
      proposal: { equipment: [{ id: 'generated-1', tag: 'MCC-1' }] },
    });
    assert.equal(result.ok, false);
    assert.equal(result.conflicts[0].code, 'user_record_collision');
  });

  it('reports manual changes and safely removes untouched obsolete generated records', () => {
    const result = reconcileDesignProposal({
      current: { loads: [generated('L-1', { kw: 20 }), generated('L-2', { kw: 10 })] },
      proposal: { loads: [generated('L-1', { kw: 25 })] },
      lastApplied: { records: { loads: {
        'L-1': { id: 'L-1', tag: 'L-1', kw: 20 },
        'L-2': { id: 'L-2', tag: 'L-2', kw: 10 },
      } } },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.removed.loads, ['L-2']);
    assert.equal(result.next.loads.length, 1);
  });

  it('reports a modified generated record as a conflict', () => {
    const result = reconcileDesignProposal({
      current: { loads: [generated('L-1', { kw: 22 })] },
      proposal: { loads: [generated('L-1', { kw: 25 })] },
      lastApplied: { records: { loads: { 'L-1': { id: 'L-1', tag: 'L-1', kw: 20 } } } },
    });
    assert.equal(result.ok, false);
    assert.equal(result.conflicts[0].code, 'generated_record_modified');
  });
});
