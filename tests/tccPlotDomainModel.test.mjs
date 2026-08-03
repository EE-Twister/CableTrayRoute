import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectPlotRangeValues, resolvePlotDomainsModel } from '../analysis/tcc/plotDomainModel.mjs';

const devicePlots = [{ scaled: { curve: [{ current: 100, time: 10 }, { current: 1000, time: 0.1 }] } }];

describe('TCC plot domain model', () => {
  it('collects coordination curves and fault current without DOM or d3 dependencies', () => {
    const result = collectPlotRangeValues({
      preset: 'coordination',
      devicePlots,
      overlays: [],
      faultCurrentA: 5000,
      allCurrents: [],
      allTimes: [],
      defaultInrushDuration: 0.1,
    });
    assert.deepEqual(result.currents, [100, 1000, 5000]);
    assert.deepEqual(result.times, [10, 0.1]);
  });

  it('enforces the motor-start time window', () => {
    const domains = resolvePlotDomainsModel({
      preset: 'motorStart',
      devicePlots,
      overlays: [],
      faultCurrentA: 0,
      allCurrents: [100, 1000],
      allTimes: [0.1, 10],
      defaultInrushDuration: 0.1,
    });
    assert.ok(domains.timeDomain[0] <= 0.01);
    assert.ok(domains.timeDomain[1] >= 30);
  });
});
