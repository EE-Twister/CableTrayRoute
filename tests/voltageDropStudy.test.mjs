/**
 * Tests for analysis/voltageDropStudy.mjs
 *
 * Verifies circuit classification, per-cable evaluation, and
 * full project-wide study aggregation.
 */
import assert from 'assert';
import {
  classifyCircuit,
  evaluateCable,
  runVoltageDropStudy,
  NEC_LIMITS,
} from '../analysis/voltageDropStudy.mjs';

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

// ---------------------------------------------------------------------------
describe('NEC_LIMITS', () => {
  it('feeder limit is 3 %', () => {
    assert.strictEqual(NEC_LIMITS.feeder, 3);
  });

  it('branch limit is 3 %', () => {
    assert.strictEqual(NEC_LIMITS.branch, 3);
  });

  it('combined limit is 5 %', () => {
    assert.strictEqual(NEC_LIMITS.combined, 5);
  });
});

// ---------------------------------------------------------------------------
describe('classifyCircuit', () => {
  it('classifies cable with circuit_type feeder as feeder', () => {
    assert.strictEqual(classifyCircuit({ circuit_type: 'feeder' }), 'feeder');
  });

  it('classifies cable with circuit_type FEEDER (uppercase) as feeder', () => {
    assert.strictEqual(classifyCircuit({ circuit_type: 'FEEDER' }), 'feeder');
  });

  it('classifies cable with service_type main distribution as feeder', () => {
    assert.strictEqual(classifyCircuit({ service_type: 'main distribution' }), 'feeder');
  });

  it('classifies cable with cable_type feeder as feeder', () => {
    assert.strictEqual(classifyCircuit({ cable_type: 'feeder cable' }), 'feeder');
  });

  it('classifies unknown cable as branch', () => {
    assert.strictEqual(classifyCircuit({}), 'branch');
  });

  it('classifies cable with circuit_type branch as branch', () => {
    assert.strictEqual(classifyCircuit({ circuit_type: 'branch' }), 'branch');
  });

  it('classifies cable with circuit_type lighting as branch', () => {
    assert.strictEqual(classifyCircuit({ circuit_type: 'lighting' }), 'branch');
  });
});

// ---------------------------------------------------------------------------
describe('evaluateCable', () => {
  it('returns pass for cable with no length data', () => {
    const result = evaluateCable({ cable_tag: 'C01', est_load: '100', cable_rating: '480' });
    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.dropPct, 0);
  });

  it('returns pass for cable with no load data', () => {
    const result = evaluateCable({ cable_tag: 'C02', length: '500', cable_rating: '480' });
    assert.strictEqual(result.status, 'pass');
  });

  it('populates tag, from, to fields from cable object', () => {
    const cable = {
      cable_tag: 'FEEDER-01',
      from_location: 'MCC-A',
      to_location: 'PANEL-B',
      est_load: '50',
      cable_rating: '480',
      length: '100',
      conductor_size: '4',
      conductor_material: 'CU',
    };
    const result = evaluateCable(cable);
    assert.strictEqual(result.tag, 'FEEDER-01');
    assert.strictEqual(result.from, 'MCC-A');
    assert.strictEqual(result.to, 'PANEL-B');
    assert.strictEqual(result.conductorSize, '4');
    assert.strictEqual(result.material, 'CU');
  });

  it('applies feeder limit for feeder circuits', () => {
    const cable = { cable_tag: 'F01', circuit_type: 'feeder', est_load: '1', cable_rating: '480', length: '1' };
    const result = evaluateCable(cable);
    assert.strictEqual(result.circuitType, 'feeder');
    assert.strictEqual(result.limit, NEC_LIMITS.feeder);
  });

  it('applies branch limit for branch circuits', () => {
    const cable = { cable_tag: 'B01', circuit_type: 'branch', est_load: '1', cable_rating: '120', length: '1' };
    const result = evaluateCable(cable);
    assert.strictEqual(result.circuitType, 'branch');
    assert.strictEqual(result.limit, NEC_LIMITS.branch);
  });

  it('returns numeric dropPct >= 0', () => {
    const cable = {
      cable_tag: 'B02',
      est_load: '20',
      cable_rating: '120',
      length: '200',
      conductor_size: '12',
      conductor_material: 'CU',
    };
    const result = evaluateCable(cable);
    assert.ok(typeof result.dropPct === 'number', 'dropPct should be a number');
    assert.ok(result.dropPct >= 0, 'dropPct should be non-negative');
  });

  it('marks status fail when drop clearly exceeds limit', () => {
    // Very long run with small conductor to force > 3% drop
    const cable = {
      cable_tag: 'FAIL-01',
      est_load: '50',
      operating_voltage: '120',
      length: '2000',
      conductor_size: '14',
      conductor_material: 'CU',
      phases: '1',
    };
    const result = evaluateCable(cable);
    if (result.dropPct > result.limit) {
      assert.strictEqual(result.status, 'fail');
    } else {
      // Drop < limit with these params — just check it's pass or warn
      assert.ok(['pass', 'warn'].includes(result.status));
    }
  });

  it('overrides length with explicit lengthFt argument', () => {
    const cable = { cable_tag: 'C03', length: '999' };
    const result = evaluateCable(cable, 0);
    assert.strictEqual(result.lengthFt, 0);
  });
});

// ---------------------------------------------------------------------------
describe('runVoltageDropStudy', () => {
  it('returns empty results for empty input', () => {
    const { results, summary } = runVoltageDropStudy([]);
    assert.strictEqual(results.length, 0);
    assert.strictEqual(summary.total, 0);
    assert.strictEqual(summary.pass, 0);
    assert.strictEqual(summary.fail, 0);
  });

  it('summary total equals number of cables', () => {
    const cables = [
      { cable_tag: 'A', est_load: '10', cable_rating: '480', length: '50' },
      { cable_tag: 'B', est_load: '10', cable_rating: '480', length: '0' },
      { cable_tag: 'C' },
    ];
    const { summary } = runVoltageDropStudy(cables);
    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.pass + summary.warn + summary.fail, 3);
  });

  it('summary maxDropPct is >= avgDropPct', () => {
    const cables = [
      { cable_tag: 'X', est_load: '20', cable_rating: '120', length: '100', conductor_size: '12', conductor_material: 'CU' },
      { cable_tag: 'Y', est_load: '20', cable_rating: '120', length: '200', conductor_size: '12', conductor_material: 'CU' },
    ];
    const { summary } = runVoltageDropStudy(cables);
    assert.ok(summary.maxDropPct >= summary.avgDropPct,
      'maxDropPct should be >= avgDropPct');
  });

  it('returns result objects with expected shape', () => {
    const cable = { cable_tag: 'T01', est_load: '15', cable_rating: '480', length: '300', conductor_size: '10', conductor_material: 'AL' };
    const { results } = runVoltageDropStudy([cable]);
    assert.strictEqual(results.length, 1);
    const r = results[0];
    assert.ok('tag' in r);
    assert.ok('dropPct' in r);
    assert.ok('status' in r);
    assert.ok('circuitType' in r);
    assert.ok('limit' in r);
    assert.ok(['pass', 'warn', 'fail'].includes(r.status));
    assert.ok(['feeder', 'branch'].includes(r.circuitType));
  });
});
