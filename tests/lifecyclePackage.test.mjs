/**
 * Tests for analysis/lifecyclePackage.mjs
 */
import assert from 'assert';
import {
  STATUS_OPTIONS,
  summarizePackage,
  buildLifecyclePackage,
  diffLifecyclePackages,
} from '../analysis/lifecyclePackage.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (err) { console.error('  ✗', name, err.message || err); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
describe('STATUS_OPTIONS', () => {
  it('contains exactly 4 entries', () => {
    assert.strictEqual(STATUS_OPTIONS.length, 4);
  });

  it('includes Draft, Issued for Review, Approved, Superseded', () => {
    assert.ok(STATUS_OPTIONS.includes('Draft'));
    assert.ok(STATUS_OPTIONS.includes('Issued for Review'));
    assert.ok(STATUS_OPTIONS.includes('Approved'));
    assert.ok(STATUS_OPTIONS.includes('Superseded'));
  });
});

// ---------------------------------------------------------------------------
describe('summarizePackage', () => {
  it('returns zero counts for empty input', () => {
    const s = summarizePackage({});
    assert.strictEqual(s.cableCount, 0);
    assert.strictEqual(s.trayCount, 0);
    assert.strictEqual(s.studyCount, 0);
    assert.strictEqual(s.oneLineComponentCount, 0);
  });

  it('counts cables and trays correctly', () => {
    const s = summarizePackage({ cables: [{id:'C1'},{id:'C2'}], trays: [{id:'T1'}] });
    assert.strictEqual(s.cableCount, 2);
    assert.strictEqual(s.trayCount, 1);
  });

  it('counts only studies with non-null results', () => {
    const s = summarizePackage({
      studies: {
        arcFlash: { bus1: {} },
        loadFlow: null,
        harmonics: [],
        shortCircuit: { ok: true },
      },
    });
    assert.strictEqual(s.studyCount, 2); // arcFlash + shortCircuit
  });

  it('counts one-line components when present', () => {
    const s = summarizePackage({ oneLine: { components: [{id:'A'},{id:'B'},{id:'C'}] } });
    assert.strictEqual(s.oneLineComponentCount, 3);
  });
});

// ---------------------------------------------------------------------------
describe('buildLifecyclePackage', () => {
  it('returns correct shape', () => {
    const pkg = buildLifecyclePackage({ revisionLabel: 'Rev 1', author: 'J. Doe' }, {});
    assert.ok(typeof pkg.id === 'string' && pkg.id.startsWith('lp-'));
    assert.ok(typeof pkg.createdAt === 'string');
    assert.strictEqual(pkg.revisionLabel, 'Rev 1');
    assert.strictEqual(pkg.author, 'J. Doe');
    assert.strictEqual(pkg.status, 'Draft');
    assert.ok(pkg.projectSnapshot);
    assert.ok(pkg.summary);
  });

  it('defaults status to Draft for unknown status', () => {
    const pkg = buildLifecyclePackage({ status: 'Invalid' }, {});
    assert.strictEqual(pkg.status, 'Draft');
  });

  it('accepts valid status values', () => {
    for (const status of STATUS_OPTIONS) {
      const pkg = buildLifecyclePackage({ status }, {});
      assert.strictEqual(pkg.status, status);
    }
  });

  it('defaults revisionLabel to Rev 0', () => {
    const pkg = buildLifecyclePackage({}, {});
    assert.strictEqual(pkg.revisionLabel, 'Rev 0');
  });

  it('snapshot is a deep copy — mutating source does not affect snapshot', () => {
    const cables = [{ id: 'C1', tag: 'original' }];
    const pkg = buildLifecyclePackage({}, { cables });
    cables[0].tag = 'mutated';
    assert.strictEqual(pkg.projectSnapshot.cables[0].tag, 'original');
  });

  it('snapshot cables array is independent of source', () => {
    const cables = [{ id: 'C1' }];
    const pkg = buildLifecyclePackage({}, { cables });
    cables.push({ id: 'C2' });
    assert.strictEqual(pkg.projectSnapshot.cables.length, 1);
  });

  it('summary counts match snapshot contents', () => {
    const projectData = {
      cables: [{ id: 'C1' }, { id: 'C2' }],
      trays:  [{ id: 'T1' }],
      studies: { arcFlash: { b: {} }, loadFlow: null },
    };
    const pkg = buildLifecyclePackage({}, projectData);
    assert.strictEqual(pkg.summary.cableCount, 2);
    assert.strictEqual(pkg.summary.trayCount, 1);
    assert.strictEqual(pkg.summary.studyCount, 1); // only arcFlash is non-null
  });

  it('survives JSON round-trip', () => {
    const pkg  = buildLifecyclePackage({ revisionLabel: 'Rev 3', author: 'A. Smith', status: 'Approved' }, {
      cables: [{ id: 'C1' }],
      studies: { arcFlash: { b: 1 } },
    });
    const back = JSON.parse(JSON.stringify(pkg));
    assert.strictEqual(back.id, pkg.id);
    assert.strictEqual(back.revisionLabel, pkg.revisionLabel);
    assert.strictEqual(back.status, pkg.status);
    assert.strictEqual(back.projectSnapshot.cables[0].id, 'C1');
  });
});

// ---------------------------------------------------------------------------
describe('diffLifecyclePackages', () => {
  function makePkg(cables = [], trays = [], studies = {}, approvals = {}) {
    return buildLifecyclePackage({}, { cables, trays, studies, approvals });
  }

  it('returns empty diff for identical packages', () => {
    const cables = [{ id: 'C1', tag: 'same' }];
    const trays  = [{ id: 'T1' }];
    const pkgA = makePkg(cables, trays);
    const pkgB = makePkg(cables, trays);
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.strictEqual(diff.cableChanges.added.length, 0);
    assert.strictEqual(diff.cableChanges.removed.length, 0);
    assert.strictEqual(diff.cableChanges.changed.length, 0);
    assert.strictEqual(diff.trayChanges.added.length, 0);
  });

  it('detects added cables', () => {
    const pkgA = makePkg([{ id: 'C1' }]);
    const pkgB = makePkg([{ id: 'C1' }, { id: 'C2' }]);
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.strictEqual(diff.cableChanges.added.length, 1);
    assert.strictEqual(diff.cableChanges.added[0].id, 'C2');
  });

  it('detects removed cables', () => {
    const pkgA = makePkg([{ id: 'C1' }, { id: 'C2' }]);
    const pkgB = makePkg([{ id: 'C1' }]);
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.strictEqual(diff.cableChanges.removed.length, 1);
    assert.strictEqual(diff.cableChanges.removed[0].id, 'C2');
  });

  it('detects changed cables', () => {
    const pkgA = makePkg([{ id: 'C1', size: '12 AWG' }]);
    const pkgB = makePkg([{ id: 'C1', size: '10 AWG' }]);
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.strictEqual(diff.cableChanges.changed.length, 1);
    assert.strictEqual(diff.cableChanges.changed[0].id, 'C1');
  });

  it('detects added trays', () => {
    const pkgA = makePkg([], [{ id: 'T1' }]);
    const pkgB = makePkg([], [{ id: 'T1' }, { id: 'T2' }]);
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.strictEqual(diff.trayChanges.added.length, 1);
    assert.strictEqual(diff.trayChanges.added[0].id, 'T2');
  });

  it('detects removed trays', () => {
    const pkgA = makePkg([], [{ id: 'T1' }, { id: 'T2' }]);
    const pkgB = makePkg([], [{ id: 'T1' }]);
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.strictEqual(diff.trayChanges.removed.length, 1);
    assert.strictEqual(diff.trayChanges.removed[0].id, 'T2');
  });

  it('detects added studies', () => {
    const pkgA = makePkg([], [], { arcFlash: { b: 1 } });
    const pkgB = makePkg([], [], { arcFlash: { b: 1 }, loadFlow: { v: 2 } });
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.ok(diff.studyChanges.added.includes('loadFlow'));
    assert.strictEqual(diff.studyChanges.removed.length, 0);
  });

  it('detects removed studies', () => {
    const pkgA = makePkg([], [], { arcFlash: { b: 1 }, loadFlow: { v: 2 } });
    const pkgB = makePkg([], [], { arcFlash: { b: 1 } });
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.ok(diff.studyChanges.removed.includes('loadFlow'));
  });

  it('ignores null study values when computing study diff', () => {
    const pkgA = makePkg([], [], { arcFlash: null });
    const pkgB = makePkg([], [], { arcFlash: null });
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.strictEqual(diff.studyChanges.added.length, 0);
    assert.strictEqual(diff.studyChanges.removed.length, 0);
  });

  it('detects approval status changes', () => {
    const pkgA = makePkg([], [], {}, { arcFlash: { status: 'Pending' } });
    const pkgB = makePkg([], [], {}, { arcFlash: { status: 'Approved' } });
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.strictEqual(diff.approvalChanges.length, 1);
    assert.strictEqual(diff.approvalChanges[0].key, 'arcFlash');
    assert.strictEqual(diff.approvalChanges[0].from, 'Pending');
    assert.strictEqual(diff.approvalChanges[0].to, 'Approved');
  });

  it('handles null/undefined snapshot gracefully', () => {
    const pkgA = buildLifecyclePackage({}, {});
    const pkgB = buildLifecyclePackage({}, {});
    // Corrupt one snapshot to check robustness
    pkgA.projectSnapshot = undefined;
    const diff = diffLifecyclePackages(pkgA, pkgB);
    assert.ok(Array.isArray(diff.cableChanges.added));
  });
});
