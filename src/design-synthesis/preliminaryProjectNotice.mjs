import * as dataStore from '../../dataStore.mjs';
import { countGeneratedMotorProjections } from '../../analysis/designSynthesisMotorReadiness.mjs';

export const PRELIMINARY_MOTOR_NOTICE = 'PRELIMINARY - MOTOR PROTECTION UNRESOLVED - NOT FOR ISSUE';

/** Read current project projections at export time, including unsaved diagram state when provided. */
export function preliminaryMotorNotice({ oneLine } = {}) {
  const draft = dataStore.getItem('designSynthesisReviewDraft', null);
  const count = countGeneratedMotorProjections({
    equipment: dataStore.getEquipment(),
    loads: dataStore.getLoads(),
    cables: dataStore.getCables(),
    oneLine: oneLine || dataStore.getOneLine(),
  });
  return count > 0 || (draft !== null && draft !== undefined) ? PRELIMINARY_MOTOR_NOTICE : '';
}

/** Preserve the normal first-row headers while carrying status on every exported cable. */
export function withCableReviewNotice(sheetData, notice) {
  if (!notice || !Array.isArray(sheetData) || !sheetData.length) return sheetData;
  return sheetData.map((row, index) => [...row, index === 0 ? 'Review status' : notice]);
}
