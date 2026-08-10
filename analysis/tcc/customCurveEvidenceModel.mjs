import { assessProtectiveDeviceLibraryEntry } from '../protectiveDeviceLibrary.mjs';
import {
  CUSTOM_CURVE_CATEGORY,
  buildCustomCurveBaseDevice,
  sanitizeCustomCurveEvidence,
  sanitizeCustomCurveProfiles,
  sanitizeCustomCurveSettings,
  sanitizeCustomCurveText,
  sanitizeCustomInterruptingRatings
} from './customCurveModel.mjs';

export function buildCustomCurveSubmission({
  existing,
  name,
  manufacturer,
  deviceType,
  description,
  profiles,
  axes,
  bounds,
  settings,
  catalogNumber,
  ratingVoltage,
  ratingCurrent,
  evidence,
  calculationReady
}) {
  const curveProfiles = sanitizeCustomCurveProfiles(profiles);
  if (!curveProfiles.length) return { payload: null, assessment: null };
  const payload = {
    id: existing?.id || null,
    name,
    manufacturer: manufacturer?.trim() || '',
    deviceType: deviceType?.trim() || CUSTOM_CURVE_CATEGORY,
    description: description?.trim() || '',
    curve: curveProfiles[0].curve.map(point => ({ current: point.current, time: point.time })),
    curveProfiles,
    axes,
    bounds,
    settings: sanitizeCustomCurveSettings(settings),
    catalogNumber: sanitizeCustomCurveText(catalogNumber, 160),
    interruptingRatings: sanitizeCustomInterruptingRatings([{
      voltageVac: ratingVoltage,
      currentKA: ratingCurrent,
      currentType: 'AC',
      ratingType: 'AIR'
    }]),
    curveEvidence: sanitizeCustomCurveEvidence(evidence),
    libraryStatus: calculationReady ? 'calculation_ready' : undefined,
    tolerance: existing?.tolerance
  };
  return {
    payload,
    assessment: assessProtectiveDeviceLibraryEntry(buildCustomCurveBaseDevice(payload))
  };
}

export function getCustomCurvePromotionError(calculationReady, assessment) {
  if (!calculationReady || assessment?.status === 'calculation_ready') return '';
  return `Calculation-ready promotion needs ${(assessment?.missing || []).join(', ')}. Save as screening only or complete the evidence.`;
}
