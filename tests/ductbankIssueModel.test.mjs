import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDuctbankIssue,
  buildDuctbankIssueContext,
  conduitFillLimit,
  defaultDuctbankIssueDetails,
  duplicateValues,
  hasIssueCode,
  normalizeDuctbankId,
  rowMatchesDuctbankFilter
} from '../src/ductbank-route/issueModel.js';

const conduit = (id, extra = {}) => ({ conduit_id: id, conduit_type: 'PVC Sch 40', trade_size: '4', ...extra });
const cable = (tag, conduitId, extra = {}) => ({ tag, conduit_id: conduitId, diameter: '1.2', insulation_thickness: '0.08', ...extra });

describe('ductbank issue model helpers', () => {
  it('normalizes identifiers and finds duplicates after trimming', () => {
    assert.equal(normalizeDuctbankId('  C1 '), 'C1');
    assert.equal(normalizeDuctbankId(null), '');
    assert.deepEqual([...duplicateValues(['C1', ' C1', 'C2', '', null, 'C3', 'C3 '])].sort(), ['C1', 'C3']);
  });

  it('uses the NEC Chapter 9 fill limits by conductor count', () => {
    assert.equal(conduitFillLimit(1), 53);
    assert.equal(conduitFillLimit(2), 31);
    assert.equal(conduitFillLimit(3), 40);
    assert.equal(conduitFillLimit(12), 40);
  });

  it('fills issue defaults and indexes issues by table row', () => {
    assert.equal(defaultDuctbankIssueDetails({ code: 'missing', table: 'conduit' }).field, 'conduit_id');
    assert.equal(defaultDuctbankIssueDetails({ code: 'missing', table: 'cable' }).field, 'tag');
    assert.equal(defaultDuctbankIssueDetails({ code: 'other' }).severity, 'Review');
    const context = { issues: [], conduitIssuesByRow: new Map(), cableIssuesByRow: new Map() };
    addDuctbankIssue(context, { table: 'cable', row: 2, code: 'thermal', message: 'hot' });
    addDuctbankIssue(context, { table: 'cable', row: 2, code: 'fill', fix: 'custom fix' });
    assert.equal(context.issues.length, 2);
    assert.equal(context.cableIssuesByRow.get(2).length, 2);
    assert.equal(context.issues[0].severity, 'Thermal');
    assert.equal(context.issues[1].fix, 'custom fix');
    assert.equal(context.conduitIssuesByRow.size, 0);
    assert.equal(hasIssueCode(context.issues, ['fill']), true);
    assert.equal(hasIssueCode(context.issues, ['missing', 'duplicate']), false);
  });
});

describe('buildDuctbankIssueContext', () => {
  it('reports a clean context for complete, assigned rows', () => {
    const context = buildDuctbankIssueContext({
      conduits: [conduit('C1'), conduit('C2')],
      cables: [cable('K1', 'C1')],
      fillMap: { C1: { cables: [{}], fillPct: 10 } }
    });
    assert.deepEqual(context.issues, []);
    assert.deepEqual([...context.conduitIds], ['C1', 'C2']);
    assert.equal(context.cableCountByConduit.get('C1'), 1);
    assert.equal(context.cableCountByConduit.get('C2'), 0);
  });

  it('flags missing, duplicate, invalid and unassigned rows', () => {
    const context = buildDuctbankIssueContext({
      conduits: [conduit('C1'), conduit(' C1'), conduit('', { trade_size: '99' })],
      cables: [
        cable('K1', 'C1'),
        cable('K1', ''),
        cable('', 'C9', { diameter: '', insulation_thickness: '0' })
      ]
    });
    const codes = issues => issues.map(issue => `${issue.code}:${issue.field}`).sort();
    assert.deepEqual(codes(context.conduitIssuesByRow.get(0)), ['duplicate:conduit_id']);
    assert.deepEqual(codes(context.conduitIssuesByRow.get(1)), ['duplicate:conduit_id']);
    assert.deepEqual(codes(context.conduitIssuesByRow.get(2)), ['missing:conduit_id', 'missing:trade_size']);
    assert.deepEqual(codes(context.cableIssuesByRow.get(1)), ['assignment:conduit_id', 'duplicate:tag']);
    assert.deepEqual(codes(context.cableIssuesByRow.get(2)), ['assignment:conduit_id', 'missing:diameter', 'missing:insulation_thickness', 'missing:tag']);
    assert.match(context.cableIssuesByRow.get(2).find(issue => issue.code === 'assignment').message, /missing conduit C9/);
  });

  it('warns at 80% of the fill limit and propagates to the cables in that conduit', () => {
    const context = buildDuctbankIssueContext({
      conduits: [conduit('C1'), conduit('C2')],
      cables: [cable('K1', 'C1'), cable('K2', 'C2')],
      fillMap: {
        C1: { cables: [{}], fillPct: 43 },
        C2: { cables: [{}], fillPct: 42 },
        C3: { cables: [], fillPct: 99 }
      }
    });
    assert.deepEqual([...context.fillWarningConduits], ['C1']);
    assert.match(context.conduitIssuesByRow.get(0)[0].message, /fill is 43\.0% of a 53% limit/);
    assert.equal(context.cableIssuesByRow.get(0)[0].code, 'fill');
    assert.equal(context.cableIssuesByRow.get(1), undefined);
  });

  it('folds thermal and ampacity solver alerts into conduit and cable issues', () => {
    const context = buildDuctbankIssueContext({
      conduits: [conduit('C1'), conduit('C2')],
      cables: [cable('K1', 'C1'), cable('K2', 'C2')],
      conduitOverLimit: { C1: { over: true }, C2: { over: false } },
      cableOverLimit: { ' K2 ': true, K1: false }
    });
    assert.deepEqual([...context.thermalConduits], ['C1']);
    assert.deepEqual([...context.ampacityCables], ['K2']);
    assert.deepEqual([...context.ampacityConduits], ['C2']);
    assert.deepEqual(context.cableIssuesByRow.get(0).map(issue => issue.code), ['thermal']);
    assert.deepEqual(context.cableIssuesByRow.get(1).map(issue => issue.code), ['ampacity']);
  });
});

describe('rowMatchesDuctbankFilter', () => {
  const context = buildDuctbankIssueContext({
    conduits: [conduit('C1'), conduit('C2')],
    cables: [cable('K1', 'C1'), cable('K2', '')],
    conduitOverLimit: { C1: { over: true } }
  });

  it('matches every row for the "all" filter', () => {
    assert.equal(rowMatchesDuctbankFilter('conduit', context.conduits[1], 1, context), true);
    assert.equal(rowMatchesDuctbankFilter('cable', context.cables[1], 1, context, 'all'), true);
  });

  it('filters conduits and cables by assignment', () => {
    assert.equal(rowMatchesDuctbankFilter('conduit', context.conduits[0], 0, context, 'assigned'), true);
    assert.equal(rowMatchesDuctbankFilter('conduit', context.conduits[1], 1, context, 'unassigned'), true);
    assert.equal(rowMatchesDuctbankFilter('cable', context.cables[0], 0, context, 'assigned'), true);
    assert.equal(rowMatchesDuctbankFilter('cable', context.cables[1], 1, context, 'unassigned'), true);
  });

  it('filters by issue category', () => {
    assert.equal(rowMatchesDuctbankFilter('cable', context.cables[1], 1, context, 'missing'), true);
    assert.equal(rowMatchesDuctbankFilter('cable', context.cables[0], 0, context, 'missing'), false);
    assert.equal(rowMatchesDuctbankFilter('conduit', context.conduits[0], 0, context, 'thermal'), true);
    assert.equal(rowMatchesDuctbankFilter('cable', context.cables[0], 0, context, 'thermal'), true);
    assert.equal(rowMatchesDuctbankFilter('conduit', context.conduits[1], 1, context, 'thermal'), false);
    assert.equal(rowMatchesDuctbankFilter('cable', context.cables[0], 0, context, 'ampacity'), false);
  });
});
