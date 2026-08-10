/**
 * Promise-based client for cathodicProtectionWorker.js.
 *
 * Offloads distribution / criteria / interference computations from the UI
 * thread. Falls back to running the same pure modules on the calling thread
 * when Worker construction is not available.
 */
import { CP_WORKER_OPERATIONS } from '../studies/cp/workerOperations.js';
import { createWorkerClient } from './createWorkerClient.js';

const client = createWorkerClient({
  workerUrl: 'cathodicProtectionWorker.js',
  workerType: 'module',
  operations: Object.keys(CP_WORKER_OPERATIONS),
  fallback: CP_WORKER_OPERATIONS,
});

export function computeDistributionBySegment(input) {
  return client.call('computeDistributionBySegment', [input]);
}

export function parseZoneResistivityValues(rawValue) {
  return client.call('parseZoneResistivityValues', [rawValue]);
}

export function evaluateCriteriaChecks(input, standardsProfile) {
  return client.call('evaluateCriteriaChecks', [input, standardsProfile]);
}

export function evaluateInterferenceAssessment(input) {
  return client.call('evaluateInterferenceAssessment', [input]);
}

export function parseMitigationActions(rawInput) {
  return client.call('parseMitigationActions', [rawInput]);
}

export function parseConditionFactorValues(rawValue) {
  return client.call('parseConditionFactorValues', [rawValue]);
}

export function resolveCoatingModel(input, context) {
  return client.call('resolveCoatingModel', [input, context]);
}

export function runCathodicProtectionAnalysis(input) {
  return client.call('runCathodicProtectionAnalysis', [input]);
}

export function terminate() {
  client.terminate();
}

export function isUsingFallback() {
  return client.isUsingFallback();
}
