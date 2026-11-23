import { designSynthesisCurveSourceEvidence } from './designSynthesisCurveEvidence.mjs';

function finite(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) && Number.isFinite(Number(value));
}

function applicableInterruptingRating(record, voltage, applicability = {}) {
  const ratings = Array.isArray(record.interruptingRatings) ? record.interruptingRatings : [];
  const valid = item => String(item.currentType || '').toUpperCase() === 'AC' && (!item.frequencyHz || Number(item.frequencyHz) === 60) && (!item.poles || Number(item.poles) === Number(record.poles?.[0] ?? record.poles)) && finite(item.currentKA);
  const exact = ratings.filter(item => Number(item.voltageVac) === Number(voltage) && valid(item));
  if (exact.length) {
    const selected = exact.reduce((best, item) => Number(item.currentKA) < Number(best.currentKA) ? item : best);
    return { currentKA: Number(selected.currentKA), ratingVoltageVac: Number(selected.voltageVac), applicability: 'exact-voltage-rating', applicabilitySourceDocuments: [] };
  }
  const evidence = applicability[record.id];
  if (evidence?.ratingKind !== 'straight' || !Array.isArray(evidence.sourceDocuments) || !evidence.sourceDocuments.length) return null;
  const higher = ratings.filter(item => finite(item.voltageVac) && Number(item.voltageVac) > Number(voltage) && valid(item) && Number(item.voltageVac) <= Number(record.ratedVoltageVac ?? record.voltageVac));
  if (!higher.length) return null;
  const selected = higher.sort((a, b) => Number(a.voltageVac) - Number(b.voltageVac) || Number(a.currentKA) - Number(b.currentKA))[0];
  return { currentKA: Number(selected.currentKA), ratingVoltageVac: Number(selected.voltageVac), applicability: 'manufacturer-documented-straight-voltage-rating-used-at-lower-system-voltage', applicabilitySourceDocuments: evidence.sourceDocuments, applicabilityBasis: evidence.basis || null };
}

export function selectProtectiveDevice({ cable, supply, devices = [], basis, deviceVoltageApplicabilityById = {} } = {}) {
  const issues = [];
  const hasBasisField = name => Boolean(basis) && Object.prototype.hasOwnProperty.call(basis, name);
  const basisValue = (name, fallback) => hasBasisField(name) ? basis[name] : fallback;
  const faultKA = basisValue('availableFaultCurrentKA', supply?.availableFaultCurrentKA);
  if (!finite(faultKA) || Number(faultKA) <= 0) return { selected: null, candidates: [], issues: [{ code: 'MISSING_FAULT_CURRENT', message: 'A positive availableFaultCurrentKA is required in the local protection basis or supply.', severity: 'blocking' }] };
  const requiredRaw = basisValue('requiredCurrentA', cable?.protectiveRequirement?.ampereRatingA ?? cable?.currentA);
  const installedRaw = basisValue('conductorAmpacityA', cable?.ampacityA);
  const voltageRaw = basisValue('operatingVoltageVac', cable?.operating_voltage ?? supply?.voltage);
  const phasesRaw = basisValue('phases', cable?.phases ?? supply?.phases);
  const frequencyRaw = basisValue('frequencyHz', supply?.frequencyHz ?? 60);
  const maximumRatingRaw = basisValue('maximumRatingA', undefined);
  const hasMaximumRating = hasBasisField('maximumRatingA');
  if (!finite(voltageRaw) || Number(voltageRaw) <= 0 || !finite(phasesRaw) || !Number.isInteger(Number(phasesRaw)) || Number(phasesRaw) < 1 || !finite(frequencyRaw) || Number(frequencyRaw) <= 0 || !finite(requiredRaw) || Number(requiredRaw) <= 0 || !finite(installedRaw) || Number(installedRaw) <= 0 || (hasMaximumRating && (!finite(maximumRatingRaw) || Number(maximumRatingRaw) <= 0))) {
    return { selected: null, candidates: [], issues: [{ code: 'INVALID_LOCAL_PROTECTION_BASIS', message: 'Protection basis requires positive finite numeric voltage, load current, conductor ampacity, integer phase/pole count, and frequency; maximumRatingA, when supplied, must also be positive and numeric.', severity: 'blocking' }] };
  }
  const required = Number(requiredRaw);
  const installed = Number(installedRaw);
  const voltage = Number(voltageRaw);
  const phases = Number(phasesRaw);
  const frequencyHz = Number(frequencyRaw);
  const maximumRating = hasMaximumRating ? Number(maximumRatingRaw) : null;
  const eligible = devices.filter(record => {
    const status = String(record.libraryStatus || '').toLowerCase();
    const poles = Number(record.poles ?? record.numberOfPoles);
    const frequencyValues = Array.isArray(record.frequencyHz ?? record.frequency) ? (record.frequencyHz ?? record.frequency).map(Number) : [Number(record.frequencyHz ?? record.frequency)];
    const ratedVoltage = Number(record.ratedVoltageVac ?? record.voltageVac);
    const rating = Number(record.continuousCurrentA ?? record.tripRatingA);
    const interrupting = applicableInterruptingRating(record, voltage, deviceVoltageApplicabilityById);
    const poleValues = Array.isArray(record.poles ?? record.numberOfPoles) ? (record.poles ?? record.numberOfPoles).map(Number) : [Number(record.poles ?? record.numberOfPoles)];
    return status === 'screening' && poleValues.includes(phases) && frequencyValues.includes(frequencyHz) && ratedVoltage >= voltage && rating >= required && finite(installed) && installed > 0 && rating <= installed && (maximumRating === null || rating <= maximumRating) && interrupting !== null && interrupting.currentKA >= Number(faultKA) && record.catalogNumber && Array.isArray(record.sourceDocuments) && record.sourceDocuments.length > 0 && !record.motorOnly;
  }).sort((a, b) => (Number(a.continuousCurrentA ?? a.tripRatingA ?? a.frameAmps) - Number(b.continuousCurrentA ?? b.tripRatingA ?? b.frameAmps)) || String(a.id).localeCompare(String(b.id)));
  if (!eligible.length) issues.push({ code: 'NO_APPLICABLE_PROTECTIVE_DEVICE', message: `No ${voltage} V-applicable, ${phases}-pole, ${frequencyHz} Hz screening device satisfies current, conductor ampacity, maximum rating${maximumRating === null ? '' : ` ≤ ${maximumRating} A`}, and interrupting rating. Higher-voltage interrupting ratings require explicit straight-voltage applicability evidence.`, severity: 'blocking' });
  const toResult = record => {
    const interrupting = applicableInterruptingRating(record, voltage, deviceVoltageApplicabilityById);
    return {
      id: record.id,
      catalogNumber: record.catalogNumber,
      continuousCurrentA: record.continuousCurrentA ?? record.tripRatingA ?? record.frameAmps,
      ratedVoltageVac: record.ratedVoltageVac ?? record.voltageVac,
      evaluatedVoltageVac: voltage,
      interruptingRatingVoltageVac: interrupting?.ratingVoltageVac ?? null,
      voltageApplicability: interrupting?.applicability ?? null,
      voltageApplicabilitySourceDocuments: interrupting?.applicabilitySourceDocuments ?? [],
      voltageApplicabilityBasis: interrupting?.applicabilityBasis ?? null,
      poles: record.poles ?? record.numberOfPoles,
      frequencyHz: record.frequencyHz ?? record.frequency,
      interruptingRatingKA: interrupting?.currentKA ?? null,
      sourceDocuments: record.sourceDocuments || [],
      fieldSources: record.fieldSources || [],
      libraryStatus: 'screening',
      faultBasis: basis?.faultBasis ?? 'supply.availableFaultCurrentKA',
      faultTypes: basis?.faultTypes ?? null,
      protectionBoundary: basis?.provenance ?? null
    };
  };
  const selected = eligible[0] ? { ...eligible[0], ...toResult(eligible[0]), curveSourceResearch: designSynthesisCurveSourceEvidence(eligible[0]), selectionStatus: 'candidate', libraryStatus: 'screening', coordinationStatus: 'not-performed' } : null;
  return { selected, candidates: eligible.map(toResult), issues };
}

export default { selectProtectiveDevice };
