import { downloadCSV } from './reporting.mjs';
import { summarizeCable } from '../sizing.js';
import * as dataStore from '../dataStore.mjs';

export function exportSizingSummary(code = 'NEC') {
  const cables = dataStore.getCables();
  const rows = cables.map(c => summarizeCable(c, { code }));
  const headers = ['tag','selectedSize','requiredSize','availableAmpacity','voltageDrop','code','violation'];
  downloadCSV(headers, rows, 'sizing-summary.csv');
}

export default { exportSizingSummary };
