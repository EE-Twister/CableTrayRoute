/**
 * Promise-based client for cathodicProtectionWorker.js.
 *
 * Offloads distribution / criteria / interference computations from the UI
 * thread. Falls back to running the same pure modules on the calling thread
 * when Worker construction is not available.
 */
import {
  computeDistributionBySegment as computeDistributionBySegmentSync,
  parseZoneResistivityValues as parseZoneResistivityValuesSync,
} from '../studies/cp/distributionModel.js';
import { evaluateCriteriaChecks as evaluateCriteriaChecksSync } from '../studies/cp/criteriaChecks.js';
import {
  evaluateInterferenceAssessment as evaluateInterferenceAssessmentSync,
  parseMitigationActions as parseMitigationActionsSync,
} from '../studies/cp/interferenceAssessment.js';
import {
  parseConditionFactorValues as parseConditionFactorValuesSync,
  resolveCoatingModel as resolveCoatingModelSync,
} from '../studies/cp/coatingModel.js';
import { createWorkerClient } from './createWorkerClient.js';

const OPS = [
  'computeDistributionBySegment',
  'parseZoneResistivityValues',
  'evaluateCriteriaChecks',
  'evaluateInterferenceAssessment',
  'parseMitigationActions',
  'parseConditionFactorValues',
  'resolveCoatingModel',
];

const client = createWorkerClient({
  workerUrl: 'cathodicProtectionWorker.js',
  workerType: 'module',
  operations: OPS,
  fallback: {
    computeDistributionBySegment: computeDistributionBySegmentSync,
    parseZoneResistivityValues: parseZoneResistivityValuesSync,
    evaluateCriteriaChecks: evaluateCriteriaChecksSync,
    evaluateInterferenceAssessment: evaluateInterferenceAssessmentSync,
    parseMitigationActions: parseMitigationActionsSync,
    parseConditionFactorValues: parseConditionFactorValuesSync,
    resolveCoatingModel: resolveCoatingModelSync,
  },
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

export function terminate() {
  client.terminate();
}

export function isUsingFallback() {
  return client.isUsingFallback();
}
