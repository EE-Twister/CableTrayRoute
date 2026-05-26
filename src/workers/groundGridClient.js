/**
 * Promise-based client for groundGridWorker.js.
 *
 * Offloads IEEE 80-2013 ground grid analysis from the UI thread. The same
 * synchronous functions exported by analysis/groundGrid.mjs are mirrored
 * here as async wrappers that resolve with the worker's reply. If the
 * Worker constructor fails (older runtime, headless test) the calls
 * transparently fall back to the pure analysis module on the calling
 * thread, so callers don't have to branch.
 */
import {
  analyzeGroundGrid as analyzeGroundGridSync,
  analyzeGroundGridWithSoil as analyzeGroundGridWithSoilSync,
  analyzeIrregularGrid as analyzeIrregularGridSync,
} from '../../analysis/groundGrid.mjs';
import { createWorkerClient } from './createWorkerClient.js';

const client = createWorkerClient({
  workerUrl: 'groundGridWorker.js',
  workerType: 'module',
  operations: ['analyzeGroundGrid', 'analyzeGroundGridWithSoil', 'analyzeIrregularGrid'],
  fallback: {
    analyzeGroundGrid: analyzeGroundGridSync,
    analyzeGroundGridWithSoil: analyzeGroundGridWithSoilSync,
    analyzeIrregularGrid: analyzeIrregularGridSync,
  },
});

export function analyzeGroundGrid(params) {
  return client.call('analyzeGroundGrid', [params]);
}

export function analyzeGroundGridWithSoil(params, soilModel) {
  return client.call('analyzeGroundGridWithSoil', [params, soilModel]);
}

export function analyzeIrregularGrid(params, soilModel) {
  return client.call('analyzeIrregularGrid', [params, soilModel]);
}

export function terminate() {
  client.terminate();
}

export function isUsingFallback() {
  return client.isUsingFallback();
}
