/**
 * Promise-based client for dissimilarMetalsWorker.js.
 *
 * Offloads galvanic corrosion risk estimation and timeline construction
 * from the UI thread. Falls back to running the same pure functions on
 * the calling thread when Worker construction is not available.
 */
import { DISSIMILAR_METALS_WORKER_OPERATIONS } from '../../analysis/dissimilarMetalsModel.mjs';
import { createWorkerClient } from './createWorkerClient.js';

const OPS = Object.keys(DISSIMILAR_METALS_WORKER_OPERATIONS);

const client = createWorkerClient({
  workerUrl: 'dissimilarMetalsWorker.js',
  workerType: 'module',
  operations: OPS,
  fallback: DISSIMILAR_METALS_WORKER_OPERATIONS,
});

export function estimateDissimilarMetalsRisk(input) {
  return client.call('estimateDissimilarMetalsRisk', [input]);
}

export function buildCorrosionTimelineState(result, years) {
  return client.call('buildCorrosionTimelineState', [result, years]);
}

export function buildMitigationComparisonRows(result) {
  return client.call('buildMitigationComparisonRows', [result]);
}

export function buildInspectionMilestones(result) {
  return client.call('buildInspectionMilestones', [result]);
}

export function buildAssumptionRows(result) {
  return client.call('buildAssumptionRows', [result]);
}

export function buildResultSummary(result) {
  return client.call('buildResultSummary', [result]);
}

export function buildResultExportPayload(result) {
  return client.call('buildResultExportPayload', [result]);
}

export function terminate() {
  client.terminate();
}

export function isUsingFallback() {
  return client.isUsingFallback();
}
