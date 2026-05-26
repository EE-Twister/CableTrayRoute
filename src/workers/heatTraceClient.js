/**
 * Promise-based client for heatTraceWorker.js.
 *
 * Offloads heat-trace sizing, BOM construction, and report assembly from
 * the UI thread. Falls back to running the same pure analysis modules
 * on the calling thread when Worker construction is not available.
 */
import {
  runHeatTraceSizingAnalysis as runHeatTraceSizingAnalysisSync,
  selectHeatTraceProduct as selectHeatTraceProductSync,
  buildLineList as buildLineListSync,
  buildHeatTraceBOM as buildHeatTraceBOMSync,
  buildControllerSchedule as buildControllerScheduleSync,
} from '../../analysis/heatTraceSizing.mjs';
import {
  buildHeatTraceBranchSchedule as buildHeatTraceBranchScheduleSync,
  buildHeatTraceReport as buildHeatTraceReportSync,
} from '../../analysis/heatTraceReport.mjs';
import { createWorkerClient } from './createWorkerClient.js';

const OPS = [
  'runHeatTraceSizingAnalysis',
  'selectHeatTraceProduct',
  'buildLineList',
  'buildHeatTraceBOM',
  'buildControllerSchedule',
  'buildHeatTraceBranchSchedule',
  'buildHeatTraceReport',
];

const client = createWorkerClient({
  workerUrl: 'heatTraceWorker.js',
  workerType: 'module',
  operations: OPS,
  fallback: {
    runHeatTraceSizingAnalysis: runHeatTraceSizingAnalysisSync,
    selectHeatTraceProduct: selectHeatTraceProductSync,
    buildLineList: buildLineListSync,
    buildHeatTraceBOM: buildHeatTraceBOMSync,
    buildControllerSchedule: buildControllerScheduleSync,
    buildHeatTraceBranchSchedule: buildHeatTraceBranchScheduleSync,
    buildHeatTraceReport: buildHeatTraceReportSync,
  },
});

export function runHeatTraceSizingAnalysis(inputs) {
  return client.call('runHeatTraceSizingAnalysis', [inputs]);
}

export function selectHeatTraceProduct(circuit, catalog) {
  return client.call('selectHeatTraceProduct', [circuit, catalog]);
}

export function buildLineList(circuits, catalog) {
  return client.call('buildLineList', [circuits, catalog]);
}

export function buildHeatTraceBOM(lineListRows) {
  return client.call('buildHeatTraceBOM', [lineListRows]);
}

export function buildControllerSchedule(lineListRows) {
  return client.call('buildControllerSchedule', [lineListRows]);
}

export function buildHeatTraceBranchSchedule(cases) {
  return client.call('buildHeatTraceBranchSchedule', [cases]);
}

export function buildHeatTraceReport(payload) {
  return client.call('buildHeatTraceReport', [payload]);
}

export function terminate() {
  client.terminate();
}

export function isUsingFallback() {
  return client.isUsingFallback();
}
