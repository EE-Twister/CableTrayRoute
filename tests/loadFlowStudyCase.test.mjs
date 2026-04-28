import assert from 'node:assert/strict';

const {
  applyLoadFlowStudyCaseToModel,
  buildLoadFlowStudyPackage,
  buildLoadFlowStudyRows,
  normalizeLoadFlowStudyCase,
  renderLoadFlowStudyHTML,
  runLoadFlowStudyCase,
} = await import('../analysis/loadFlowStudyCase.mjs');
const { buildLoadFlowModel } = await import('../analysis/loadFlowModel.js');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.log('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

function sampleOneLine() {
  return {
    activeSheet: 0,
    sheets: [{
      name: 'LF',
      components: [
        { id: 'source', type: 'bus', subtype: 'bus_Bus', label: 'Source <Bus>', busType: 'slack', voltage: 13.8 },
        {
          id: 'load',
          type: 'bus',
          subtype: 'bus_Bus',
          label: 'Load Bus',
          busType: 'PQ',
          voltage: 13.8,
          load: {
            A: { kw: 80, kvar: 35 },
            B: { kw: 120, kvar: 45 },
            C: { kw: 160, kvar: 55 },
          },
        },
        {
          id: 'feeder',
          type: 'cable',
          label: 'Feeder-1',
          phases: ['A', 'B', 'C'],
          impedance: { r: 0.35, x: 0.8 },
          connections: [{ target: 'source' }, { target: 'load' }],
        },
      ],
    }],
  };
}

describe('load-flow study case', () => {
  it('normalizes defaults and rejects invalid values', () => {
    const studyCase = normalizeLoadFlowStudyCase({});
    assert.equal(studyCase.baseMVA, 100);
    assert.equal(studyCase.mode, 'balanced');
    assert.equal(studyCase.loadModel, 'constantPQ');
    assert.throws(() => normalizeLoadFlowStudyCase({ mode: 'bad' }), /Unsupported/);
    assert.throws(() => normalizeLoadFlowStudyCase({ loadModel: 'bad' }), /Unsupported/);
    assert.throws(() => normalizeLoadFlowStudyCase({ reportPreset: 'bad' }), /Unsupported/);
  });

  it('builds bus and branch rows from one-line data', () => {
    const rows = buildLoadFlowStudyRows({ oneLine: sampleOneLine() });
    assert(rows.some(row => row.rowType === 'bus' && row.elementId === 'load'));
    assert(rows.some(row => row.rowType === 'branch' && row.elementId === 'feeder'));
    const load = rows.find(row => row.elementId === 'load');
    assert.equal(load.perPhase.A.loadKw, 80);
    assert.equal(load.perPhase.C.loadKvar, 55);
  });

  it('keeps legacy results reportable in the package shape', () => {
    const pkg = buildLoadFlowStudyPackage({
      projectName: 'Legacy',
      studyCase: { mode: 'balanced' },
      results: {
        converged: true,
        buses: [{ id: 'bus1', displayLabel: 'Bus <1>', Vm: 0.98, Va: 0, baseKV: 0.48, voltageKV: 0.4704, voltageV: 470.4, type: 'PQ', Pd: 10, Qd: 3, Pg: 0, Qg: 0 }],
        lines: [],
        summary: { totalLoadKW: 10, totalLossKW: 0 },
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    assert.equal(pkg.version, 'load-flow-study-case-v1');
    assert.equal(pkg.phaseRows.length, 1);
    assert.equal(pkg.phaseRows[0].busTag, 'Bus <1>');
  });

  it('runs per-phase rows and computes voltage unbalance', () => {
    const rows = buildLoadFlowStudyRows({ oneLine: sampleOneLine() });
    const execution = runLoadFlowStudyCase({
      oneLine: sampleOneLine(),
      studyCase: { mode: 'perPhase', baseMVA: 1, voltageLimits: { minPu: 0.9, maxPu: 1.1 } },
      rows,
    });
    const pkg = buildLoadFlowStudyPackage({
      projectName: 'LF',
      ...execution,
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    assert(pkg.phaseRows.some(row => row.busId === 'load' && row.phase === 'A'));
    assert(pkg.phaseRows.some(row => row.busId === 'load' && row.phase === 'C'));
    const unbalance = pkg.unbalanceRows.find(row => row.busId === 'load');
    assert(unbalance);
    assert(Number.isFinite(unbalance.voltageUnbalancePct));
  });

  it('applies open-phase branch filtering and emits warnings', () => {
    const rows = buildLoadFlowStudyRows({ oneLine: sampleOneLine() });
    const applied = applyLoadFlowStudyCaseToModel(buildLoadFlowModel(sampleOneLine()), {
      mode: 'perPhase',
      openPhase: { enabled: true, phases: ['B'] },
    }, rows);
    const feeder = applied.model.branches.find(branch => branch.id === 'feeder');
    assert(!feeder.phases.includes('B'));
    assert(applied.warnings.some(warning => warning.code === 'open-phase-screening'));
  });

  it('applies capacitor and tap controls as deterministic pre-run modifiers', () => {
    const rows = buildLoadFlowStudyRows({ oneLine: sampleOneLine() }).map(row => {
      if (row.elementId === 'load') return { ...row, capacitorKvar: 120 };
      if (row.elementId === 'feeder') return { ...row, tapRatio: 1.02 };
      return row;
    });
    const applied = applyLoadFlowStudyCaseToModel(buildLoadFlowModel(sampleOneLine()), { mode: 'balanced' }, rows);
    const loadBus = applied.model.buses.find(bus => bus.id === 'load');
    const feeder = applied.model.branches.find(branch => branch.id === 'feeder');
    assert.equal(loadBus.generation.kvar, 120);
    assert.equal(feeder.tap.ratio, 1.02);
    assert(applied.controlRows.some(row => row.controlType === 'capacitorStep'));
    assert(applied.controlRows.some(row => row.controlType === 'tapRatio'));
  });

  it('classifies voltage violations and escapes rendered HTML', () => {
    const pkg = buildLoadFlowStudyPackage({
      projectName: 'LF <Project>',
      studyCase: { mode: 'balanced', voltageLimits: { minPu: 0.99, maxPu: 1.01, warningMarginPu: 0.005 } },
      results: {
        converged: true,
        buses: [{ id: 'load', displayLabel: 'Load <Bus>', Vm: 0.94, Va: 0, baseKV: 13.8, voltageKV: 12.972, voltageV: 12972, type: 'PQ', Pd: 10, Qd: 3, Pg: 0, Qg: 0 }],
        lines: [],
        summary: { totalLoadKW: 10, totalLossKW: 0 },
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    assert.equal(pkg.voltageViolationRows[0].status, 'fail');
    const html = renderLoadFlowStudyHTML(pkg);
    assert(html.includes('Load &lt;Bus&gt;'));
    assert(!html.includes('Load <Bus>'));
  });
});
