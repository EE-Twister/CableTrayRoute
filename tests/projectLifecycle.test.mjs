import assert from 'node:assert/strict';
import {
  captureLifecycleSnapshot,
  createProjectRevision,
  createStudyPackage,
  diffProjectRevisions,
  hashLifecycleSnapshot,
  pruneLifecycleRevisions,
  summarizeLifecycleLineage,
} from '../analysis/projectLifecycle.mjs';

function makeStorage() {
  const store = new Map();
  return {
    get length() { return store.size; },
    key(index) { return [...store.keys()][index] || null; },
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

global.localStorage = makeStorage();

const dataStore = await import('../dataStore.mjs');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

function baseSnapshot(overrides = {}) {
  return captureLifecycleSnapshot({
    projectName: 'North Unit',
    scenario: 'base',
    cables: [{ id: 'C-101', length: 100 }],
    trays: [{ tray_id: 'TR-1', inside_width: 12 }],
    conduits: [],
    ductbanks: [],
    equipment: [{ id: 'MCC-1', voltage: 480 }],
    oneLine: {
      activeSheet: 0,
      sheets: [
        {
          name: 'Main',
          components: [
            { id: 'SRC', type: 'source', connections: [{ target: 'MCC-1' }] },
            { id: 'MCC-1', type: 'mcc' },
          ],
          connections: [],
        },
      ],
    },
    studies: { loadFlow: { summary: { voltageDropPct: 2.1 } } },
    approvals: { loadFlow: { status: 'approved', reviewedBy: 'A. Reviewer' } },
    drcAcceptedFindings: [{ key: 'fill:TR-1', note: 'Accepted for study' }],
    designCoachDecisions: [{ fingerprint: 'coach:one', decision: 'accepted' }],
    fieldObservations: [{ id: 'field-c-101', elementId: 'C-101', status: 'open' }],
    bimElements: [{ id: 'bim-tr-1', guid: 'g-tr-1', elementType: 'cableTray' }],
    bimIssues: [{ id: 'bim-issue-1', title: 'Open BIM item', status: 'open' }],
    bimConnectorPackages: [{ id: 'connector-r1', connectorType: 'revit', createdAt: '2026-04-27T10:00:00.000Z' }],
    activeBimConnectorPackageId: 'connector-r1',
    componentLibrarySubscription: { workspaceId: 'plant-a', releaseId: 'release-r1', releaseTag: 'R1', pinnedVersion: 'org-R1' },
    ...overrides,
  });
}

describe('project lifecycle package helpers', () => {
  it('normalizes legacy lifecycle storage to empty arrays and active id', () => {
    assert.deepEqual(dataStore.getProjectRevisions(), []);
    assert.deepEqual(dataStore.getStudyPackages(), []);
    assert.equal(dataStore.getActiveStudyPackageId(), '');
    assert.deepEqual(dataStore.getDesignCoachDecisions(), []);
    assert.deepEqual(dataStore.getFieldObservations(), []);
    assert.equal(dataStore.getComponentLibrarySubscription().releaseId, '');
  });

  it('deep-clones snapshots and revisions', () => {
    const source = {
      projectName: 'Clone Test',
      cables: [{ id: 'C-1', length: 10 }],
      studies: { loadFlow: { kw: 10 } },
    };
    const snapshot = captureLifecycleSnapshot(source);
    const revision = createProjectRevision({ revision: 'A', snapshot, createdAt: '2026-04-27T10:00:00.000Z' });
    source.cables[0].length = 999;
    snapshot.schedules.cables[0].length = 888;
    assert.equal(revision.snapshot.schedules.cables[0].length, 10);
  });

  it('captures design coach decisions in lifecycle snapshots', () => {
    const snapshot = baseSnapshot();
    assert.equal(snapshot.designCoachDecisions.length, 1);
    assert.equal(snapshot.designCoachDecisions[0].decision, 'accepted');
  });

  it('captures field observations in lifecycle snapshots', () => {
    const snapshot = baseSnapshot();
    assert.equal(snapshot.fieldObservations.length, 1);
    assert.equal(snapshot.fieldObservations[0].elementId, 'C-101');
  });

  it('captures BIM coordination records in lifecycle snapshots', () => {
    const snapshot = baseSnapshot();
    assert.equal(snapshot.bimElements.length, 1);
    assert.equal(snapshot.bimElements[0].guid, 'g-tr-1');
    assert.equal(snapshot.bimIssues.length, 1);
    assert.equal(snapshot.bimIssues[0].status, 'open');
    assert.equal(snapshot.bimConnectorPackages.length, 1);
    assert.equal(snapshot.activeBimConnectorPackageId, 'connector-r1');
  });

  it('captures component library subscription metadata in lifecycle snapshots', () => {
    const snapshot = baseSnapshot();
    assert.equal(snapshot.componentLibrarySubscription.workspaceId, 'plant-a');
    assert.equal(snapshot.componentLibrarySubscription.releaseId, 'release-r1');
  });

  it('generates stable hashes for equivalent snapshots', () => {
    const first = { b: 2, a: { y: 1, x: [3, 4] } };
    const second = { a: { x: [3, 4], y: 1 }, b: 2 };
    assert.equal(hashLifecycleSnapshot(first), hashLifecycleSnapshot(second));
  });

  it('diffs schedules, one-line topology, studies, and approvals', () => {
    const previous = createProjectRevision({
      revision: 'A',
      snapshot: baseSnapshot(),
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    const next = createProjectRevision({
      revision: 'B',
      snapshot: baseSnapshot({
        cables: [{ id: 'C-101', length: 125 }, { id: 'C-102', length: 80 }],
        oneLine: {
          activeSheet: 0,
          sheets: [{ name: 'Main', components: [{ id: 'SRC', type: 'source' }, { id: 'SWG-1', type: 'switchgear' }] }],
        },
        studies: { loadFlow: { summary: { voltageDropPct: 3.4 } }, shortCircuit: { maxKa: 22 } },
        approvals: { loadFlow: { status: 'flagged', reviewedBy: 'A. Reviewer' } },
      }),
      createdAt: '2026-04-27T11:00:00.000Z',
    });

    const diff = diffProjectRevisions(previous, next);
    assert.equal(diff.schedules.cables.addedCount, 1);
    assert.equal(diff.schedules.cables.changedCount, 1);
    assert(diff.oneLine.components.added.includes('SWG-1'));
    assert.equal(diff.studies.addedCount, 1);
    assert.equal(diff.studies.numericDeltas[0].path, 'summary.voltageDropPct');
    assert.equal(diff.approvals.changedCount, 1);
  });

  it('creates study package lineage and summarizes active packages', () => {
    const revision = createProjectRevision({
      name: 'IFC Package',
      revision: 'R1',
      author: 'D. Engineer',
      status: 'released',
      scenario: 'base',
      snapshot: baseSnapshot(),
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    const pkg = createStudyPackage({
      projectRevision: revision,
      selectedStudies: ['loadFlow'],
      reportMetadata: { projectName: 'North Unit' },
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    const lineage = summarizeLifecycleLineage({
      projectRevisions: [revision],
      studyPackages: [pkg],
      activeStudyPackageId: pkg.id,
    });
    assert.equal(pkg.projectRevisionId, revision.id);
    assert.equal(pkg.studyCount, 1);
    assert.equal(lineage.activePackage.id, pkg.id);
    assert.equal(lineage.releasedCount, 1);
  });

  it('retains the latest lifecycle revisions and prefers pruning drafts', () => {
    const revisions = Array.from({ length: 14 }, (_, index) => createProjectRevision({
      revision: `R${index + 1}`,
      status: index < 4 ? 'draft' : 'released',
      snapshot: baseSnapshot({ cables: [{ id: `C-${index + 1}` }] }),
      createdAt: `2026-04-27T${String(index).padStart(2, '0')}:00:00.000Z`,
    }));
    const pruned = pruneLifecycleRevisions(revisions, { maxCount: 12 });
    assert.equal(pruned.length, 12);
    assert(!pruned.some(revision => revision.revision === 'R1'));
    assert(!pruned.some(revision => revision.revision === 'R2'));
  });

  it('persists lifecycle data through scenario storage helpers', () => {
    const revision = createProjectRevision({
      revision: 'S1',
      snapshot: baseSnapshot(),
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    const pkg = createStudyPackage({ projectRevision: revision, createdAt: '2026-04-27T10:00:00.000Z' });
    dataStore.addProjectRevision(revision);
    dataStore.addStudyPackage(pkg);
    dataStore.setActiveStudyPackageId(pkg.id);
    assert.equal(dataStore.getProjectRevisions().length, 1);
    assert.equal(dataStore.getStudyPackages()[0].projectRevisionId, revision.id);
    assert.equal(dataStore.getActiveStudyPackageId(), pkg.id);
  });

  it('persists design coach decisions through scenario storage helpers', () => {
    dataStore.addDesignCoachDecision({
      actionId: 'coach-one',
      fingerprint: 'coach:one',
      decision: 'dismissed',
      decidedAt: '2026-04-27T10:00:00.000Z',
      decidedBy: 'D. Engineer',
      note: 'Handled elsewhere',
    });
    assert.equal(dataStore.getDesignCoachDecisions().at(-1).decision, 'dismissed');
  });
});
