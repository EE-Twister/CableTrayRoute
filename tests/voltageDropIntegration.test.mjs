import assert from 'assert';
import {
  addCombinedPathResults,
  recommendConductorForDrop,
  resolveCableStudyInputs,
  runVoltageDropStudy,
} from '../analysis/voltageDropStudy.mjs';

{
  const [resolved] = resolveCableStudyInputs(
    [{
      cable_tag: 'C-LIST',
      to_tag: 'LOAD-1',
      length: 100,
      conductor_size: '#4 AWG',
    }],
    [{ id: 'LOAD-1', kw: 30, voltage: 480, phases: 3, powerFactor: 0.9 }],
  );
  assert.ok(Number(resolved.est_load) > 0);
  assert.strictEqual(resolved.operating_voltage, 480);
  assert.strictEqual(resolved._voltageDropInputSource.current, 'Load List');
  assert.strictEqual(resolved._voltageDropInputSource.voltage, 'Load List');
}

{
  const [resolved] = resolveCableStudyInputs(
    [{
      cable_tag: 'C-FLOW',
      to_tag: 'BUS-2',
      length: 100,
      conductor_size: '#4 AWG',
    }],
    [{ id: 'BUS-2', kw: 10, voltage: 480 }],
    {
      converged: true,
      buses: [{
        id: 'BUS-2',
        Pd: 75,
        Qd: 20,
        voltageV: 468,
      }],
    },
  );
  assert.strictEqual(resolved.operating_voltage, 468);
  assert.strictEqual(resolved._voltageDropInputSource.current, 'Load Flow');
  assert.strictEqual(resolved._voltageDropInputSource.voltage, 'Load Flow');
}

{
  const results = addCombinedPathResults([
    {
      id: 'F-1', tag: 'F-1', fromKey: 'source', toKey: 'panel',
      circuitType: 'feeder', limit: 3, evaluated: true, dropPct: 2.2,
    },
    {
      id: 'B-1', tag: 'B-1', fromKey: 'panel', toKey: 'load',
      circuitType: 'branch', limit: 3, evaluated: true, dropPct: 3.0,
    },
  ]);
  assert.deepStrictEqual(results[1].pathTags, ['F-1', 'B-1']);
  assert.strictEqual(results[1].combinedDropPct, 5.2);
  assert.strictEqual(results[1].combinedLimitPct, 5);
  assert.strictEqual(results[1].combinedStatus, 'fail');
}

{
  const cable = {
    cable_tag: 'REC-1',
    from_tag: 'PANEL',
    to_tag: 'LOAD',
    est_load: 50,
    operating_voltage: 120,
    phases: 1,
    length: 250,
    conductor_size: '#14 AWG',
    conductor_material: 'CU',
  };
  const recommendation = recommendConductorForDrop(cable, 3);
  assert.ok(recommendation);
  assert.notStrictEqual(recommendation.conductorSize, '#14 AWG');
  assert.ok(recommendation.expectedDropPct <= 3);
}

{
  const study = runVoltageDropStudy([
    {
      cable_tag: 'REC-2',
      from_tag: 'PANEL',
      to_tag: 'LOAD-2',
      length: 250,
      conductor_size: '#14 AWG',
      conductor_material: 'CU',
      phases: 1,
    },
  ], {
    loads: [{ id: 'LOAD-2', kw: 6, voltage: 120, phases: 1, powerFactor: 0.9 }],
  });
  assert.strictEqual(study.summary.evaluated, 1);
  assert.strictEqual(study.sourceCounts['Load List'], 1);
  assert.ok(study.results[0].inputSource.current === 'Load List');
  assert.ok(study.summary.recommendations >= 1);
}

console.log('voltage drop integration tests passed');
