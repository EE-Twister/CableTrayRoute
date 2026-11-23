import { fingerprintStudyValue } from '../../analysis/studyLifecycle.mjs';
import { isDeviceEvidenceEnvelope } from '../../utils/designSynthesisDeviceEvidenceCodec.mjs';

export const DEVICE_INLINE_FIELDS = new Set([
  'id', 'catalogNumber', 'name', 'vendor', 'manufacturer', 'series',
  'libraryStatus', 'selectionStatus',
  'continuousCurrentA', 'ratedVoltageVac', 'frameSizeA', 'voltageRatingV',
  'poles', 'tripUnit'
]);

export const DEVICE_SUMMARY_FIELDS = [
  'evaluatedVoltageVac', 'interruptingRatingVoltageVac', 'interruptingRatingKA',
  'voltageApplicability', 'faultBasis', 'faultTypes', 'coordinationStatus',
];

export function exactStoredValueEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => exactStoredValueEqual(value, right[index]));
  }
  if (left instanceof Date || right instanceof Date) return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && exactStoredValueEqual(left[key], right[key]));
}

const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

/** Resolve the persisted summary only when it still matches its cited record. */
export function resolveReferencedDeviceEvidence(ref, inline, map) {
  if (ref === undefined || ref === null) return clone(inline || null);
  if (!map || typeof map !== 'object' || isDeviceEvidenceEnvelope(map)) return null;
  if (typeof ref !== 'string' || !ref || !Object.prototype.hasOwnProperty.call(map, ref)) return null;
  const record = map[ref];
  if (!record || typeof record !== 'object' || Array.isArray(record) || fingerprintStudyValue(record) !== ref) return null;
  if (!inline || typeof inline !== 'object' || Array.isArray(inline)) return null;
  for (const key of ['id', 'catalogNumber']) {
    if (Object.prototype.hasOwnProperty.call(record, key) && !Object.prototype.hasOwnProperty.call(inline, key)) return null;
  }
  for (const key of [...DEVICE_INLINE_FIELDS, ...DEVICE_SUMMARY_FIELDS]) {
    if (Object.prototype.hasOwnProperty.call(inline, key) && !exactStoredValueEqual(inline[key], record[key])) return null;
  }
  return clone(record);
}
