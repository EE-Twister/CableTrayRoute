import assert from 'assert';
import {
  compareEntityCollections,
  compareProjectScenarios,
  compareStudyCollections,
  buildScenarioStudyImpact,
} from '../analysis/scenarioComparison.mjs';

const base = {
  scenario: 'base',
  equipment: [{ id: 'MCC-1', rating: 800 }],
  loads: [{ id: 'L-1', kw: 100 }],
  panels: [],
  cables: [{ cable_tag: 'C-1', conductor_size: '#4 AWG' }],
  trays: [{ tray_id: 'T-1', width: 24 }],
  conduits: [],
  ductbanks: [],
  oneLine: {
    sheets: [{
      id: 'S-1',
      components: [
        { id: 'BUS-1', type: 'bus', connections: [{ target: 'MCC-1' }] },
        { id: 'MCC-1', type: 'mcc', connections: [] },
      ],
    }],
  },
  studies: {
    loadFlow: {
      converged: true,
      generatedAt: '2026-01-01T00:00:00.000Z',
      summary: { totalLoadKW: 100 },
    },
  },
  studyApprovals: { loadFlow: { status: 'approved' } },
};

const future = {
  ...base,
  scenario: 'future',
  equipment: [{ id: 'MCC-1', rating: 1200 }, { id: 'MCC-2', rating: 800 }],
  loads: [{ id: 'L-1', kw: 125 }],
  cables: [{ cable_tag: 'C-1', conductor_size: '#2 AWG' }],
  studies: {
    loadFlow: {
      converged: true,
      generatedAt: '2026-02-01T00:00:00.000Z',
      summary: { totalLoadKW: 125 },
    },
    voltageDropStudy: {
      summary: { maxDropPct: 2.1 },
      runMetadata: { valid: true },
    },
  },
  studyApprovals: {},
};

{
  const result = compareEntityCollections(
    [{ id: 'A', value: 1 }],
    [{ id: 'A', value: 2 }, { id: 'B', value: 3 }],
  );
  assert.deepStrictEqual(result.counts, {
    before: 1,
    after: 2,
    added: 1,
    removed: 0,
    changed: 1,
    totalChanges: 2,
  });
  assert.deepStrictEqual(result.changes.find(change => change.identity === 'a').fields, ['value']);
}

{
  const result = compareProjectScenarios(base, future);
  const equipment = result.domains.find(domain => domain.key === 'equipment');
  const cables = result.domains.find(domain => domain.key === 'cables');
  const oneLine = result.domains.find(domain => domain.key === 'oneLine');
  assert.strictEqual(equipment.counts.added, 1);
  assert.strictEqual(equipment.counts.changed, 1);
  assert.strictEqual(cables.counts.changed, 1);
  assert.strictEqual(oneLine.connectionCountBefore, 1);
  assert.strictEqual(oneLine.connectionCountAfter, 1);
  assert.strictEqual(result.totals.changedStudies, 2);
  assert.strictEqual(result.studies.find(study => study.key === 'voltageDropStudy').status, 'added');
  assert.strictEqual(result.studies.find(study => study.key === 'loadFlow').beforeApproval.status, 'approved');
  assert.strictEqual(result.impact.find(impact => impact.key === 'loadFlow').action, 'rerun');
  assert.strictEqual(result.impact.find(impact => impact.key === 'iec60287').action, 'consider');
  assert.strictEqual(result.impact.find(impact => impact.key === 'loadFlow').priority, 'high');
}

{
  const impact = buildScenarioStudyImpact({
    domains: [{
      key: 'trays',
      label: 'Cable Trays',
      counts: { totalChanges: 1 },
    }, {
      key: 'oneLineConnections',
      label: 'One-Line Connections',
      counts: { totalChanges: 2 },
    }],
    studies: [{
      key: 'loadFlow',
      after: { present: true },
    }],
  });
  assert.strictEqual(impact.find(item => item.key === 'loadFlow').action, 'rerun');
  assert.strictEqual(impact.find(item => item.key === 'loadFlow').changedRecords, 2);
  assert.strictEqual(impact.find(item => item.key === 'iec60287').priority, 'medium');
  assert.deepStrictEqual(impact.find(item => item.key === 'loadFlow').domains, ['One-Line Connections']);
}

{
  const studies = compareStudyCollections(
    { loadFlow: { summary: { totalLoadKW: 100 }, runAt: '2026-01-01' } },
    { loadFlow: { summary: { totalLoadKW: 100 }, runAt: '2026-06-01' } },
  );
  assert.strictEqual(studies[0].status, 'unchanged', 'run date alone should not create a study delta');
}

{
  const result = compareProjectScenarios(
    {
      scenario: 'Approval A',
      studies: { reliability: { runMetadata: { valid: true }, eensKwh: 10 } },
      studyApprovals: { reliability: { status: 'draft' } },
    },
    {
      scenario: 'Approval B',
      studies: { reliability: { runMetadata: { valid: true }, eensKwh: 10 } },
      studyApprovals: { reliability: { status: 'approved' } },
    },
  );
  assert.strictEqual(result.studies[0].status, 'changed');
  assert.strictEqual(result.studies[0].approvalChanged, true);
}

{
  const result = compareProjectScenarios(
    { oneLine: { sheets: [{ id: 'S1', name: 'Main', components: [] }] } },
    {
      oneLine: {
        sheets: [
          { id: 'S1', name: 'Main', components: [] },
          { id: 'S2', name: 'Emergency', components: [] },
        ],
      },
    },
  );
  assert.strictEqual(
    result.domains.find(domain => domain.key === 'oneLineSheets').counts.added,
    1,
  );
}

console.log('scenario portfolio comparison tests passed');
