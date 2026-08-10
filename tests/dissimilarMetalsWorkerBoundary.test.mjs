import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import * as pageModule from '../dissimilarmetals.js';
import {
  DISSIMILAR_METALS_WORKER_OPERATIONS,
  buildAssumptionRows,
  buildCompatibilityWarning,
  buildCorrosionTimelineState,
  buildInspectionMilestones,
  buildMitigationComparisonRows,
  buildResultExportPayload,
  buildResultSummary,
  estimateDissimilarMetalsRisk,
  getAssemblyPreset,
} from '../analysis/dissimilarMetalsModel.mjs';
import * as workerClient from '../src/workers/dissimilarMetalsClient.js';

const SAMPLE_INPUT = {
  primaryMetal: 'aluminum',
  secondaryMetal: 'stainless304Passive',
  environment: 'coastalAtmosphere',
  exposureDuty: 'frequentlyWet',
  isolationQuality: 'engineered',
  anodeArea: 180,
  cathodeArea: 20,
  corrosionAllowanceMm: 1.5,
  initialThicknessMm: 4.5,
  minimumThicknessMm: 2.5,
  temperatureC: 35,
};

function withoutGeneratedTime(value, keys) {
  const clone = structuredClone(value);
  keys.forEach(key => {
    delete clone[key];
  });
  return clone;
}

describe('dissimilar-metals worker boundary', () => {
  it('keeps the analysis model free of browser and persistence dependencies', async () => {
    const [modelSource, workerSource, clientSource] = await Promise.all([
      readFile(new URL('../analysis/dissimilarMetalsModel.mjs', import.meta.url), 'utf8'),
      readFile(new URL('../dissimilarMetalsWorker.js', import.meta.url), 'utf8'),
      readFile(new URL('../src/workers/dissimilarMetalsClient.js', import.meta.url), 'utf8'),
    ]);

    assert.doesNotMatch(modelSource, /^\s*import\s/m);
    assert.doesNotMatch(modelSource, /\b(document|window|localStorage|sessionStorage)\b/);
    assert.doesNotMatch(workerSource, /from ['"]\.\/dissimilarmetals\.js['"]/);
    assert.doesNotMatch(clientSource, /from ['"]\.\.\/\.\.\/dissimilarmetals\.js['"]/);
    assert.match(workerSource, /from ['"]\.\/analysis\/dissimilarMetalsModel\.mjs['"]/);
    assert.match(clientSource, /from ['"]\.\.\/\.\.\/analysis\/dissimilarMetalsModel\.mjs['"]/);
  });

  it('preserves the page module calculation and report export API', () => {
    const expectedExports = {
      estimateDissimilarMetalsRisk,
      buildCorrosionTimelineState,
      buildMitigationComparisonRows,
      buildInspectionMilestones,
      buildAssumptionRows,
      buildResultSummary,
      buildResultExportPayload,
      buildCompatibilityWarning,
      getAssemblyPreset,
    };

    Object.entries(expectedExports).forEach(([name, implementation]) => {
      assert.strictEqual(pageModule[name], implementation, `${name} should be re-exported from the leaf model`);
    });
  });

  it('uses one operation map for worker dispatch and synchronous fallback', () => {
    assert.deepStrictEqual(Object.keys(DISSIMILAR_METALS_WORKER_OPERATIONS), [
      'estimateDissimilarMetalsRisk',
      'buildCorrosionTimelineState',
      'buildMitigationComparisonRows',
      'buildInspectionMilestones',
      'buildAssumptionRows',
      'buildResultSummary',
      'buildResultExportPayload',
    ]);
    assert.strictEqual(
      DISSIMILAR_METALS_WORKER_OPERATIONS.estimateDissimilarMetalsRisk,
      estimateDissimilarMetalsRisk
    );
    assert.ok(Object.isFrozen(DISSIMILAR_METALS_WORKER_OPERATIONS));
  });

  it('dispatches the leaf model through the actual worker entrypoint', async () => {
    const messages = [];
    const previousSelf = globalThis.self;
    globalThis.self = {
      postMessage(message) {
        messages.push(message);
      },
    };

    try {
      await import(`../dissimilarMetalsWorker.js?boundary-test=${Date.now()}`);
      assert.strictEqual(typeof globalThis.self.onmessage, 'function');
      globalThis.self.onmessage({
        data: {
          id: 41,
          op: 'estimateDissimilarMetalsRisk',
          args: [SAMPLE_INPUT],
        },
      });
      await new Promise(resolve => setImmediate(resolve));

      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0].id, 41);
      assert.strictEqual(messages[0].type, 'result');
      assert.deepStrictEqual(
        withoutGeneratedTime(messages[0].result, ['timestamp']),
        withoutGeneratedTime(estimateDissimilarMetalsRisk(SAMPLE_INPUT), ['timestamp'])
      );
    } finally {
      if (previousSelf === undefined) {
        delete globalThis.self;
      } else {
        globalThis.self = previousSelf;
      }
    }
  });

  it('returns model-equivalent results through the client fallback', async () => {
    const directResult = estimateDissimilarMetalsRisk(SAMPLE_INPUT);
    const clientResult = await workerClient.estimateDissimilarMetalsRisk(SAMPLE_INPUT);
    assert.strictEqual(workerClient.isUsingFallback(), true);
    assert.deepStrictEqual(
      withoutGeneratedTime(clientResult, ['timestamp']),
      withoutGeneratedTime(directResult, ['timestamp'])
    );

    const years = directResult.estimatedLifeYears / 2;
    assert.deepStrictEqual(
      await workerClient.buildCorrosionTimelineState(directResult, years),
      buildCorrosionTimelineState(directResult, years)
    );
    assert.deepStrictEqual(
      await workerClient.buildMitigationComparisonRows(directResult),
      buildMitigationComparisonRows(directResult)
    );
    assert.deepStrictEqual(
      await workerClient.buildInspectionMilestones(directResult),
      buildInspectionMilestones(directResult)
    );
    assert.deepStrictEqual(
      await workerClient.buildAssumptionRows(directResult),
      buildAssumptionRows(directResult)
    );
    assert.strictEqual(
      await workerClient.buildResultSummary(directResult),
      buildResultSummary(directResult)
    );

    const directPayload = buildResultExportPayload(directResult);
    const clientPayload = await workerClient.buildResultExportPayload(directResult);
    assert.deepStrictEqual(
      withoutGeneratedTime(clientPayload, ['exportedAt']),
      withoutGeneratedTime(directPayload, ['exportedAt'])
    );
  });
});
