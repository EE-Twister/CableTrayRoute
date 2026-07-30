import assert from 'assert';
import { runReliability } from '../analysis/reliability.js';

const reliability = { mtbf: 10000, mttr: 8 };

{
  const result = runReliability([
    { id: 'SOURCE', type: 'source', ...reliability, connections: [{ target: 'BRK' }] },
    { id: 'BRK', type: 'breaker', ...reliability, connections: [{ target: 'SOURCE' }, { target: 'LOAD-BUS' }] },
    { id: 'LOAD-BUS', type: 'bus', ...reliability, connections: [{ target: 'BRK' }] },
  ], {
    loads: [{ id: 'LOAD-1', source: 'LOAD-BUS', kw: 100, critical: true }],
    inputSource: 'Project reliability basis',
    inputDate: '2026-07-30',
  });

  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.servicePoints.length, 1);
  assert.strictEqual(result.n1Impacts[0].impactedKw, 100);
  assert.ok(result.eensKwh > 0);
  assert.ok(result.criticalLoadEensKwh > 0);
  assert.ok(result.serviceInterruptionHours > 0);
  assert.ok(result.expectedInterruptionsPerYear > 0);
  assert.strictEqual(result.governedCount, result.analyzedCount);
  assert.strictEqual(result.sourceCoveragePct, 100);
}

{
  const result = runReliability([
    { id: 'SOURCE', type: 'source', ...reliability, connections: [{ target: 'A' }, { target: 'B' }] },
    { id: 'A', type: 'breaker', ...reliability, connections: [{ target: 'SOURCE' }, { target: 'LOAD-BUS' }] },
    { id: 'B', type: 'breaker', ...reliability, connections: [{ target: 'SOURCE' }, { target: 'LOAD-BUS' }] },
    { id: 'LOAD-BUS', type: 'bus', ...reliability, connections: [{ target: 'A' }, { target: 'B' }] },
  ], {
    loads: [{ id: 'LOAD-2', source: 'LOAD-BUS', kw: 50 }],
  });

  assert.deepStrictEqual(result.n1Failures, []);
  assert.ok(result.n2Failures.includes('A + B'));
  assert.strictEqual(result.n2Impacts.length, 1);
  assert.deepStrictEqual(result.n2Impacts[0].impacted, ['LOAD-2']);
  assert.ok(result.n2Impacts[0].probability > 0);
}

{
  const result = runReliability([
    { id: 'SOURCE', type: 'source', ...reliability, connections: [{ target: 'BRK' }] },
    { id: 'BRK', type: 'breaker', ...reliability, connections: [{ target: 'SOURCE' }, { target: 'LOAD-BUS' }] },
    { id: 'LOAD-BUS', type: 'bus', ...reliability, connections: [{ target: 'BRK' }] },
  ]);
  assert.strictEqual(result.governedCount, 0);
  assert.ok(result.warnings.some(warning => warning.includes('source and source date')));
}

console.log('reliability service metric tests passed');
