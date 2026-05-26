// Module worker for cathodic protection distribution / criteria / interference
// analysis. Clean boundary: src/studies/cp/* modules are pure ES modules
// (no DOM globals) and are imported directly by the worker.
import {
  computeDistributionBySegment,
  parseZoneResistivityValues,
} from './src/studies/cp/distributionModel.js';
import { evaluateCriteriaChecks } from './src/studies/cp/criteriaChecks.js';
import {
  evaluateInterferenceAssessment,
  parseMitigationActions,
} from './src/studies/cp/interferenceAssessment.js';
import {
  parseConditionFactorValues,
  resolveCoatingModel,
} from './src/studies/cp/coatingModel.js';
import { handleWorkerMessage } from './src/workers/createWorkerClient.js';

handleWorkerMessage(self, {
  computeDistributionBySegment,
  parseZoneResistivityValues,
  evaluateCriteriaChecks,
  evaluateInterferenceAssessment,
  parseMitigationActions,
  parseConditionFactorValues,
  resolveCoatingModel,
});
