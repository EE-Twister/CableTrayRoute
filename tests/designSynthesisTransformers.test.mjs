import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateTransformerSecondaryFault, listTransformerProfiles, selectTransformer } from '../analysis/designSynthesisTransformers.mjs';

test('selects the smallest supported transformer satisfying aggregate kVA and loading policy', () => {
  const result = selectTransformer({ requiredKVA: 30 });
  assert.equal(result.status, 'screening');
  assert.equal(result.selected.catalogNumber, 'EXN30T3HCU');
  assert.equal(result.selected.loadingPercent, 100);
  assert.equal(result.selected.primaryMaxOcpA, 30_000 / (Math.sqrt(3) * 480) * 2.5);
  assert.equal(result.selected.secondaryMaxOcpA, 30_000 / (Math.sqrt(3) * 208) * 1.25);
  assert.equal(selectTransformer({ requiredKVA: 30.01 }).selected.catalogNumber, 'EXN75T3HCU');
  assert.equal(selectTransformer({ requiredKVA: 30.01, maxLoadingPercent: 15 }).selected, null);
});

test('preserves dated raw copper profile fields and derives series R/X from Z and X/R', () => {
  const [thirty, seventyFive, oneFifty] = listTransformerProfiles();
  assert.equal(thirty.rawPublished.impedancePercent, 4.08);
  assert.equal(thirty.rawPublished.reactancePercent, 2.24);
  assert.equal(thirty.rawPublished.xOverR, 0.65);
  assert.equal(thirty.seriesModel.rPercent, 4.08 / Math.sqrt(1 + 0.65 ** 2));
  assert.equal(thirty.seriesModel.derivedRatedI2RLossW, 30_000 * (thirty.seriesModel.rPercent / 100));
  assert.equal(thirty.losses.catalogCoilLossW, 1049);
  assert.equal(seventyFive.seriesModel.zPercent, 5.56);
  assert.equal(seventyFive.seriesModel.xr, 1.76);
  assert.equal(seventyFive.losses.catalogCoilLossW, 2169);
  assert.match(seventyFive.sourceDocuments[0].edition, /2020/);
  assert.equal(oneFifty.catalogNumber, 'EXN150T3HCU');
  assert.equal(oneFifty.ratedKVA, 150);
  assert.deepEqual(oneFifty.sourceDocuments[0].pages, [20]);
  assert.equal(oneFifty.losses.coreW, 235);
  assert.equal(oneFifty.losses.catalogCoilLossW, 3045);
  assert.equal(oneFifty.seriesModel.zPercent, 3.79);
  assert.equal(oneFifty.seriesModel.xPercent, oneFifty.seriesModel.rPercent * 1.70);
  assert.equal(oneFifty.seriesModel.publishedIxCheck.publishedXPercent, 3.26);
  const roundedX = 3.26;
  const roundedXr = 1.70 - 0.005;
  const impedanceFromRoundedIntervals = roundedX * Math.sqrt(1 + 1 / roundedXr ** 2);
  assert.ok(impedanceFromRoundedIntervals >= 3.79 - 0.005 && impedanceFromRoundedIntervals <= 3.79 + 0.005,
    'Published rounded %Z, %IX, and X/R intervals must have at least one consistent value');
  assert.equal(oneFifty.sourceDocuments.length, 1, 'Do not invent an unverified product data sheet URL');
  assert.equal(selectTransformer({ requiredKVA: 75.01 }).selected.catalogNumber, 'EXN150T3HCU');
});

test('rejects malformed transformer criteria, an explicit empty policy, and unknown profiles', () => {
  assert.equal(selectTransformer({ requiredKVA: true }).selected, null);
  assert.equal(selectTransformer({ requiredKVA: '25kVA' }).selected, null);
  assert.equal(selectTransformer({ requiredKVA: 25, maxLoadingPercent: null }).selected, null);
  assert.equal(selectTransformer({ requiredKVA: 25, allowedProfileIds: [] }).selected, null);
  assert.equal(selectTransformer({ requiredKVA: 25, allowedProfileIds: ['future-profile'] }).selected, null);
  assert.equal(selectTransformer({ requiredKVA: 25, primaryVoltageVac: [480] }).selected, null);
  assert.equal(selectTransformer({ requiredKVA: 25, secondaryVoltageVac: [208] }).selected, null);
  assert.equal(selectTransformer({ requiredKVA: 25, phases: [3] }).selected, null);
  assert.equal(selectTransformer({ requiredKVA: 25, frequencyHz: [60] }).selected, null);
});

test('fault estimate uses nominal current transfer and marks uncalculated fault types', () => {
  const transformer = selectTransformer({ requiredKVA: 30 }).selected;
  const result = estimateTransformerSecondaryFault({ transformer, primaryAvailableFaultCurrentKA: 10 });
  assert.ok(Math.abs(result.availableFaultCurrentKA - 10 * 480 / 208) < 1e-12);
  assert.deepEqual(result.faultTypes, ['three-phase symmetrical']);
  assert.equal(result.groundFaultStatus, 'not-evaluated');
  assert.equal(result.asymmetricalDutyStatus, 'not-evaluated');
  assert.equal(estimateTransformerSecondaryFault({ transformer, primaryAvailableFaultCurrentKA: 0 }).status, 'blocked');
  assert.equal(estimateTransformerSecondaryFault({ transformer: { ...transformer, primaryVoltageVac: 600 }, primaryAvailableFaultCurrentKA: 10 }).status, 'blocked');
});
