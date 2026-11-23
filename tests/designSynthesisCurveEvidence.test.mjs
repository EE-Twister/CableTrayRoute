import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { designSynthesisCurveSourceEvidence } from '../analysis/designSynthesisCurveEvidence.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { selectProtectiveDevice } from '../analysis/designSynthesisProtection.mjs';

const snapshot = JSON.parse(fs.readFileSync(new URL('../data/designSynthesisDevices.json', import.meta.url), 'utf8'));

test('all eight exact snapshot parts retain their own source figure and unresolved clearing', () => {
  const expected = {
    FD3020: [32, 'TC012037EN', 'vector-segments'], HFD3080: [41, 'TC012046EN', 'vector-segments-point-join-unverified'],
    FD3125: [45, 'TC012031EN', 'raster-incomplete'], HFD3150: [46, 'TC012032EN', 'vector-current-domain-gap'],
    FD3175: [47, 'TC012033EN', 'vector-segments'], HFD3200: [48, 'TC012034EN', 'vector-current-domain-gap'],
    FD3225: [49, 'TC012035EN', 'vector-current-domain-gap'], KDB3400: [17, 'SC-4118-87B', 'configuration-unresolved'],
  };
  assert.equal(snapshot.records.length, 8);
  for (const record of snapshot.records) {
    const result = designSynthesisCurveSourceEvidence(record);
    assert.deepEqual([result.pageOneBased, result.curveId, result.sourceStatus], expected[record.catalogNumber]);
    assert.equal(result.clearingEvaluation, 'unevaluated');
    assert.equal(result.coordination, 'unevaluated');
    assert.equal(result.libraryStatus, 'screening');
    assert.match(result.source.sha256, /^[0-9a-f]{64}$/);
  }
});

test('changed or unknown records cannot inherit reviewed source annotations', () => {
  const record = structuredClone(snapshot.records[0]);
  record.continuousCurrentA += 1;
  assert.equal(designSynthesisCurveSourceEvidence(record), null);
  const changedSource = structuredClone(snapshot.records[0]);
  changedSource.sourceDocuments[0].url = 'https://invalid.example/modified';
  assert.equal(designSynthesisCurveSourceEvidence(changedSource), null);
  assert.equal(designSynthesisCurveSourceEvidence({ id: 'unknown', catalogNumber: 'FD3020', continuousCurrentA: 20 }), null);
  changedSource.curveSourceResearch = { clearingEvaluation: 'pass', sourceStatus: 'invented' };
  const selected = selectProtectiveDevice({
    cable: { currentA: 10, ampacityA: 100, operating_voltage: 480, phases: 3 },
    supply: { availableFaultCurrentKA: 1, voltage: 480, phases: 3, frequencyHz: 60 }, devices: [changedSource],
  }).selected;
  assert.ok(selected);
  assert.equal(selected.curveSourceResearch, null, 'Unreviewed input cannot inject its own matching-source annotation');
});

test('generated selections carry the matching source evidence without claiming clearing', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  const selections = proposal.cables.map(cable => cable.protectiveDevice).filter(Boolean);
  assert.equal(selections.length, proposal.cables.length);
  for (const selection of selections) {
    const source = selection.curveSourceResearch;
    assert.ok(source, selection.catalogNumber);
    assert.equal(source.clearingEvaluation, 'unevaluated');
    assert.equal(source.coordination, 'unevaluated');
    assert.equal(selection.libraryStatus, 'screening');
  }
});
