import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeNeededTrayWidth,
  conductorSizeRank,
  formatRacewayRecommendation,
  recommendRaceway,
  splitTrayCables
} from '../src/routing/racewaySizingModel.mjs';

const conduitSpecs = {
  EMT: { '1': 0.864, '1-1/4': 1.496, '2': 3.356 }
};
const options = {
  thresholds: { conduit: 2, channel: 4 },
  conduitType: 'EMT',
  conduitSpecs
};

describe('raceway sizing model', () => {
  it('retains conductor ordering and the large-cable classification', () => {
    assert.ok(conductorSizeRank('4/0 AWG') > conductorSizeRank('1/0 AWG'));
    assert.ok(conductorSizeRank('250 kcmil') > conductorSizeRank('4/0 AWG'));
    const split = splitTrayCables([
      { conductor_size: '2/0 AWG', conductors: 1, diameter: 0.6 },
      { conductor_size: '#12 AWG', conductors: 3, diameter: 0.2 }
    ]);
    assert.equal(split.large.length, 1);
    assert.equal(split.small.length, 1);
  });

  it('uses the existing tray area and standard-width rules', () => {
    const cables = Array.from({ length: 12 }, () => ({ conductor_size: '#12 AWG', conductors: 3, diameter: 0.5 }));
    assert.equal(computeNeededTrayWidth(cables, 'ladder'), 6);
    assert.equal(computeNeededTrayWidth([{ isGroup: true, diameter: 20 }]), 24);
    assert.equal(computeNeededTrayWidth([{ isGroup: true, diameter: 40 }]), null);
  });

  it('preserves NEC fill fractions and containment thresholds', () => {
    const oneCable = recommendRaceway([{ diameter: 0.7 }], options);
    assert.equal(oneCable.recommendation, 'conduit');
    assert.equal(oneCable.tradeSize, '1');
    assert.equal(formatRacewayRecommendation(oneCable), 'Recommended: 1" Conduit');

    const channel = recommendRaceway(Array.from({ length: 3 }, () => ({ diameter: 0.4 })), options);
    assert.equal(channel.recommendation, 'channel');
    assert.equal(channel.traySize, 6);

    const tray = recommendRaceway(Array.from({ length: 5 }, () => ({ diameter: 0.4 })), options);
    assert.equal(tray.recommendation, 'tray');
    assert.equal(formatRacewayRecommendation(tray), 'Recommended: 6" Tray');
  });
});
