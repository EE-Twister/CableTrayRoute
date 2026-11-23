import { downloadCSV } from './reporting.mjs';
import { summarizeCable } from '../sizing.js';
import * as dataStore from '../dataStore.mjs';

export function exportSizingSummary(code = 'NEC') {
  const cables = dataStore.getCables();
  const rows = cables.map(c => summarizeCable(c, { code }));
  const headers = [
    'tag', 'selectedSize', 'requiredSize', 'availableAmpacity', 'selectedAmpacity',
    'selectedVoltageDrop', 'recommendedVoltageDrop', 'code', 'violation',
    'resultValidity', 'resultUnits', 'resultInputSources', 'resultAssumptions',
    'resultModelLimits', 'resultWarnings', 'inputFingerprint',
    'ampacityResultValidity', 'ampacityResultUnits', 'ampacityResultWarnings', 'ampacityInputFingerprint',
    'selectedAmpacityResultValidity', 'selectedAmpacityInputFingerprint'
  ];
  downloadCSV(headers, rows.map(row => ({
    ...row,
    resultValidity: row.resultContract?.validity || 'unevaluated',
    resultUnits: row.resultContract?.units || '',
    resultInputSources: JSON.stringify(row.resultContract?.inputSources || {}),
    resultAssumptions: JSON.stringify(row.resultContract?.assumptions || {}),
    resultModelLimits: JSON.stringify(row.resultContract?.modelLimits || {}),
    resultWarnings: JSON.stringify(row.resultContract?.warnings || []),
    inputFingerprint: row.resultContract?.inputFingerprint || '',
    ampacityResultValidity: row.ampacityResultContract?.validity || 'unevaluated',
    ampacityResultUnits: row.ampacityResultContract?.units || 'A',
    ampacityResultWarnings: JSON.stringify(row.ampacityResultContract?.warnings || []),
    ampacityInputFingerprint: row.ampacityResultContract?.inputFingerprint || '',
    selectedAmpacityResultValidity: row.selectedAmpacityResultContract?.validity || 'unevaluated',
    selectedAmpacityInputFingerprint: row.selectedAmpacityResultContract?.inputFingerprint || '',
  })), 'sizing-summary.csv');
}

export default { exportSizingSummary };
