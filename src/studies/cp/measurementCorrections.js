function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeText(value, fallback = 'unknown') {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : fallback;
}

function formatPotential(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `${value} mV`;
}

export function applyMeasurementCorrections(input) {
  const rawInstantOffPotentialMv = asFiniteNumber(input.measuredInstantOffPotentialMv);
  const rawPolarizationShiftMv = asFiniteNumber(input.simulatedPolarizationShiftMv);
  const measuredIrDropMv = asFiniteNumber(input.measuredIrDropMv);
  const couponDepolarizationMv = asFiniteNumber(input.couponDepolarizationMv);
  const testMethod = normalizeText(input.testMethod, 'instant-off');
  const measurementContext = normalizeText(input.measurementContext);
  const referenceElectrodeLocation = normalizeText(input.referenceElectrodeLocation);
  const irDropCompensationMethod = normalizeText(input.irDropCompensationMethod);

  const warnings = [];

  let correctedInstantOffPotentialMv = rawInstantOffPotentialMv;
  let correctionSummary = 'No correction applied (instant-off measurement basis).';

  if (testMethod === 'on-potential') {
    if (Number.isFinite(rawInstantOffPotentialMv) && Number.isFinite(measuredIrDropMv)) {
      correctedInstantOffPotentialMv = rawInstantOffPotentialMv + Math.abs(measuredIrDropMv);
      correctionSummary = `IR-drop normalization applied from ON potential using +${Math.abs(measuredIrDropMv)} mV.`;
    } else {
      warnings.push('ON-potential method selected without measured IR-drop compensation value; potential is treated as uncorrected.');
    }
  }

  if (testMethod === 'coupon') {
    if (Number.isFinite(rawInstantOffPotentialMv) && Number.isFinite(couponDepolarizationMv)) {
      correctedInstantOffPotentialMv = rawInstantOffPotentialMv + Math.abs(couponDepolarizationMv);
      correctionSummary = `Coupon depolarization normalization applied using +${Math.abs(couponDepolarizationMv)} mV.`;
    } else {
      warnings.push('Coupon method selected without coupon depolarization data; potential is treated as uncorrected.');
    }
  }

  let correctedPolarizationShiftMv = rawPolarizationShiftMv;
  if (testMethod === 'coupon' && Number.isFinite(couponDepolarizationMv) && !Number.isFinite(rawPolarizationShiftMv)) {
    correctedPolarizationShiftMv = Math.abs(couponDepolarizationMv);
  }

  if (measurementContext === 'unknown') {
    warnings.push('Measurement context was not specified; acceptance confidence is reduced.');
  }

  if (referenceElectrodeLocation === 'unknown') {
    warnings.push('Reference electrode location was not provided; gradient-related uncertainty cannot be assessed.');
  }

  if ((testMethod === 'on-potential' || testMethod === 'coupon') && irDropCompensationMethod === 'none') {
    warnings.push('Selected test method usually requires IR-drop compensation, but compensation method is set to none.');
  }

  return {
    metadata: {
      testMethod,
      measurementContext,
      referenceElectrodeLocation,
      irDropCompensationMethod
    },
    rawValues: {
      instantOffPotentialMv: rawInstantOffPotentialMv,
      polarizationShiftMv: rawPolarizationShiftMv,
      measuredIrDropMv,
      couponDepolarizationMv
    },
    correctedValues: {
      instantOffPotentialMv: correctedInstantOffPotentialMv,
      polarizationShiftMv: correctedPolarizationShiftMv
    },
    correctionSummary,
    warnings,
    formatted: {
      rawInstantOffPotential: formatPotential(rawInstantOffPotentialMv),
      correctedInstantOffPotential: formatPotential(correctedInstantOffPotentialMv),
      rawPolarizationShift: formatPotential(rawPolarizationShiftMv),
      correctedPolarizationShift: formatPotential(correctedPolarizationShiftMv)
    }
  };
}
