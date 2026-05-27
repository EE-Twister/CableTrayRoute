/**
 * Promise-based client for onelineWorker.js.
 *
 * Offloads the heavy one-line study analyses (load flow, short circuit,
 * reliability) from the UI thread. Falls back to running the same pure
 * analysis modules on the calling thread when Worker construction is not
 * available. The main-thread fallback mirrors the worker handlers so the
 * caller sees identical inputs/outputs in both modes.
 */
import { runLoadFlow as runLoadFlowSync } from '../../analysis/loadFlow.js';
import { buildLoadFlowModel } from '../../analysis/loadFlowModel.js';
import { runShortCircuit as runShortCircuitSync } from '../../analysis/shortCircuit.mjs';
import { runReliability as runReliabilitySync } from '../../analysis/reliability.js';
import { createWorkerClient } from './createWorkerClient.js';

const OPS = ['runLoadFlow', 'runShortCircuit', 'runReliability'];

function extractDiagramComponents(oneLineData) {
  const sheets = Array.isArray(oneLineData?.sheets) ? oneLineData.sheets : [];
  const hasNestedComponents = Array.isArray(sheets[0]?.components);
  const components = hasNestedComponents
    ? sheets.flatMap(sheet => (Array.isArray(sheet?.components) ? sheet.components : []))
    : sheets;
  return components.filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
}

const client = createWorkerClient({
  workerUrl: 'onelineWorker.js',
  workerType: 'module',
  operations: OPS,
  fallback: {
    runLoadFlow(oneLineData, opts) {
      const model = buildLoadFlowModel(oneLineData || {});
      return runLoadFlowSync(model, opts || {});
    },
    runShortCircuit(oneLineData, opts) {
      const comps = extractDiagramComponents(oneLineData);
      return runShortCircuitSync(comps, opts || {});
    },
    runReliability: runReliabilitySync,
  },
});

export function runLoadFlow(oneLineData, opts) {
  return client.call('runLoadFlow', [oneLineData, opts]);
}

export function runShortCircuit(oneLineData, opts) {
  return client.call('runShortCircuit', [oneLineData, opts]);
}

export function runReliability(components) {
  return client.call('runReliability', [components]);
}

export function terminate() {
  client.terminate();
}

export function isUsingFallback() {
  return client.isUsingFallback();
}
