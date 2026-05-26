/**
 * Promise-based client for dissimilarMetalsWorker.js.
 *
 * Offloads galvanic corrosion risk estimation and timeline construction
 * from the UI thread. Falls back to running the same pure functions on
 * the calling thread when Worker construction is not available.
 */
import {
  estimateDissimilarMetalsRisk as estimateDissimilarMetalsRiskSync,
  buildCorrosionTimelineState as buildCorrosionTimelineStateSync,
  buildMitigationComparisonRows as buildMitigationComparisonRowsSync,
  buildInspectionMilestones as buildInspectionMilestonesSync,
  buildAssumptionRows as buildAssumptionRowsSync,
  buildResultSummary as buildResultSummarySync,
  buildResultExportPayload as buildResultExportPayloadSync,
} from '../../dissimilarmetals.js';
import { createWorkerClient } from './createWorkerClient.js';

const OPS = [
  'estimateDissimilarMetalsRisk',
  'buildCorrosionTimelineState',
  'buildMitigationComparisonRows',
  'buildInspectionMilestones',
  'buildAssumptionRows',
  'buildResultSummary',
  'buildResultExportPayload',
];

const client = createWorkerClient({
  workerUrl: 'dissimilarMetalsWorker.js',
  workerType: 'module',
  operations: OPS,
  fallback: {
    estimateDissimilarMetalsRisk: estimateDissimilarMetalsRiskSync,
    buildCorrosionTimelineState: buildCorrosionTimelineStateSync,
    buildMitigationComparisonRows: buildMitigationComparisonRowsSync,
    buildInspectionMilestones: buildInspectionMilestonesSync,
    buildAssumptionRows: buildAssumptionRowsSync,
    buildResultSummary: buildResultSummarySync,
    buildResultExportPayload: buildResultExportPayloadSync,
  },
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
