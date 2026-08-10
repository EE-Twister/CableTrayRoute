import {
  computeDistributionBySegment,
  parseZoneResistivityValues
} from './distributionModel.js';
import { evaluateCriteriaChecks } from './criteriaChecks.js';
import {
  evaluateInterferenceAssessment,
  parseMitigationActions
} from './interferenceAssessment.js';
import {
  parseConditionFactorValues,
  resolveCoatingModel
} from './coatingModel.js';
import { runCathodicProtectionAnalysis } from './analysisEngine.js';

export const CP_WORKER_OPERATIONS = Object.freeze({
  computeDistributionBySegment,
  parseZoneResistivityValues,
  evaluateCriteriaChecks,
  evaluateInterferenceAssessment,
  parseMitigationActions,
  parseConditionFactorValues,
  resolveCoatingModel,
  runCathodicProtectionAnalysis
});
