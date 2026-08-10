const MM_PER_YEAR_TO_MPY = 39.3701;
const MODEL_VERSION = 2;
const POTENTIAL_COMPATIBILITY_LIMIT_V = 0.25;
const GALVANIC_POTENTIAL_BASIS = {
  label: 'NASA-STD-6012A Table 1 compatible-couple EMF groups',
  environment: 'Seawater compatibility screening',
  detail: 'Representative group values are for compatibility ranking, not reference-electrode measurements or universal corrosion potentials.'
};

export const METAL_SERIES = {
  magnesium: { label: 'Magnesium alloy', potentialV: -1.6, family: 'active' },
  zinc: { label: 'Zinc / galvanized steel (hot-dip)', potentialV: -1.05, family: 'active' },
  zincElectroplate: { label: 'Zinc electroplate (clear/yellow chromate)', potentialV: -1.1, family: 'active' },
  aluminum: { label: 'Aluminum alloy', potentialV: -0.75, family: 'active' },
  aluminumMetallized: { label: 'Aluminum metallized coating', potentialV: -0.75, family: 'active' },
  carbonSteel: { label: 'Carbon steel', potentialV: -0.7, family: 'active' },
  castIron: { label: 'Cast iron', potentialV: -0.7, family: 'active' },
  cadmium: { label: 'Cadmium-plated steel', potentialV: -0.8, family: 'active' },
  lead: { label: 'Lead', potentialV: -0.55, family: 'intermediate' },
  tin: { label: 'Tin / tin-plated copper', potentialV: -0.5, family: 'intermediate' },
  stainless410Active: { label: 'Stainless steel 410/430 (active)', potentialV: -0.45, family: 'active' },
  stainlessActive: { label: 'Stainless steel (active)', potentialV: -0.35, family: 'intermediate' },
  copper: { label: 'Copper', potentialV: -0.2, family: 'noble' },
  brass: { label: 'Brass', potentialV: -0.25, family: 'noble' },
  bronze: { label: 'Bronze / silicon bronze', potentialV: -0.25, family: 'noble' },
  copperNickel: { label: 'Copper-nickel alloy', potentialV: -0.2, family: 'noble' },
  nickelPlatedCopper: { label: 'Nickel-plated copper lug/barrel', potentialV: -0.15, family: 'noble' },
  stainless304Passive: { label: 'Stainless steel 304 (passive)', potentialV: -0.2, family: 'noble' },
  stainless316Passive: { label: 'Stainless steel 316 (passive)', potentialV: -0.2, family: 'noble' },
  stainlessDuplexPassive: { label: 'Stainless steel duplex (passive)', potentialV: -0.2, family: 'noble' },
  nickel200: { label: 'Nickel alloy (Ni 200)', potentialV: -0.15, family: 'noble' },
  titanium: { label: 'Titanium', potentialV: -0.15, family: 'noble' }
};

export const ENVIRONMENT_FACTORS = {
  indoorDry: { label: 'Indoor conditioned / dry', conductivityFactor: 0.06, chlorideFactor: 0.8, moistureFactor: 0.7 },
  indoorHumid: { label: 'Indoor humid / washdown', conductivityFactor: 0.2, chlorideFactor: 1.0, moistureFactor: 1.0 },
  industrialOutdoor: { label: 'Industrial outdoor (rain + pollutants)', conductivityFactor: 0.45, chlorideFactor: 1.15, moistureFactor: 1.15 },
  coastalAtmosphere: { label: 'Coastal atmosphere / salt fog', conductivityFactor: 0.75, chlorideFactor: 1.4, moistureFactor: 1.25 },
  marineSplash: { label: 'Marine splash / tidal', conductivityFactor: 1.2, chlorideFactor: 1.6, moistureFactor: 1.35 },
  submergedSeawater: { label: 'Submerged seawater', conductivityFactor: 1.45, chlorideFactor: 1.75, moistureFactor: 1.4 },
  freshwaterSubmerged: { label: 'Freshwater submerged', conductivityFactor: 0.5, chlorideFactor: 0.9, moistureFactor: 1.2 }
};

export const DEFAULT_EXPOSURE_DUTY = 'intermittentlyWet';

const EXPOSURE_DUTY_FACTORS = {
  normallyDry: {
    label: 'Normally dry / brief wetting',
    wetnessFactor: 0.55,
    detail: 'Electrolyte is present only during brief condensation, cleaning, or incidental wetting.'
  },
  intermittentlyWet: {
    label: 'Intermittently wet',
    wetnessFactor: 1.0,
    detail: 'Rain, washdown, or condensation is followed by drying periods.'
  },
  frequentlyWet: {
    label: 'Frequently wet / washdown',
    wetnessFactor: 1.35,
    detail: 'The interface is wetted often enough that galvanic activity is sustained for much of service.'
  },
  continuouslyWet: {
    label: 'Continuously wet or immersed',
    wetnessFactor: 1.65,
    detail: 'The interface is assumed to have an active electrolyte path for most of service.'
  }
};

export const ASSEMBLY_PRESETS = [
  {
    id: 'aluminum-tray-stainless-hardware',
    label: 'Aluminum tray + stainless hardware',
    description: 'Outdoor tray fastening detail.',
    values: {
      primaryMetal: 'aluminum',
      secondaryMetal: 'stainless304Passive',
      environment: 'industrialOutdoor',
      exposureDuty: 'intermittentlyWet',
      isolationQuality: 'basic',
      anodeArea: 120,
      cathodeArea: 300,
      corrosionAllowanceMm: 1.5,
      temperatureC: 30
    }
  },
  {
    id: 'galvanized-tray-copper-grounding-lug',
    label: 'Galvanized tray + copper grounding lug',
    description: 'Copper bonding connection on galvanized tray.',
    values: {
      primaryMetal: 'zinc',
      secondaryMetal: 'copper',
      environment: 'industrialOutdoor',
      exposureDuty: 'intermittentlyWet',
      isolationQuality: 'basic',
      anodeArea: 250,
      cathodeArea: 25,
      corrosionAllowanceMm: 0.1,
      temperatureC: 30
    }
  },
  {
    id: 'carbon-steel-support-stainless-fasteners',
    label: 'Carbon steel support + stainless fasteners',
    description: 'Support steel with stainless fasteners.',
    values: {
      primaryMetal: 'carbonSteel',
      secondaryMetal: 'stainless304Passive',
      environment: 'industrialOutdoor',
      exposureDuty: 'frequentlyWet',
      isolationQuality: 'basic',
      anodeArea: 400,
      cathodeArea: 30,
      corrosionAllowanceMm: 1.5,
      temperatureC: 30
    }
  },
  {
    id: 'aluminum-enclosure-brass-gland',
    label: 'Aluminum enclosure + brass cable gland',
    description: 'Aluminum enclosure with brass gland.',
    values: {
      primaryMetal: 'aluminum',
      secondaryMetal: 'brass',
      environment: 'coastalAtmosphere',
      exposureDuty: 'frequentlyWet',
      isolationQuality: 'engineered',
      anodeArea: 180,
      cathodeArea: 20,
      corrosionAllowanceMm: 1.5,
      temperatureC: 35
    }
  }
];

const ISOLATION_OPTIONS = [
  { key: 'none', label: 'No isolation', detail: 'Direct metal-to-metal contact' },
  { key: 'basic', label: 'Basic washers/sleeves', detail: 'Basic electrical separation at hardware' },
  { key: 'engineered', label: 'Engineered isolation + coating', detail: 'Isolation kit plus maintained barrier coating' }
];

const INSPECTION_MILESTONES = [
  {
    percent: 50,
    key: 'monitor',
    label: 'Inspection recommended',
    action: 'Inspect coating, fasteners, and contact surfaces before half the corrosion allowance is consumed.'
  },
  {
    percent: 85,
    key: 'critical',
    label: 'Plan mitigation or replacement',
    action: 'Prepare isolation, coating repair, hardware replacement, or material redesign before the allowance is nearly consumed.'
  },
  {
    percent: 100,
    key: 'exceeded',
    label: 'Allowance consumed',
    action: 'Treat this point as the screening limit for the available corrosion allowance and escalate for engineering review.'
  }
];

export function estimateDissimilarMetalsRisk(input) {
  const normalizedInput = normalizeDissimilarMetalsInput(input);
  validateInputs(normalizedInput);

  const primary = METAL_SERIES[normalizedInput.primaryMetal];
  const secondary = METAL_SERIES[normalizedInput.secondaryMetal];
  const environment = ENVIRONMENT_FACTORS[normalizedInput.environment];
  const exposureDuty = getExposureDutyProfile(normalizedInput.exposureDuty);

  const samePotentialGroup = Math.abs(primary.potentialV - secondary.potentialV) < 0.0005;
  const anodicMetal = primary.potentialV <= secondary.potentialV ? primary : secondary;
  const cathodicMetal = anodicMetal === primary ? secondary : primary;

  const drivingPotentialV = Math.max(0, cathodicMetal.potentialV - anodicMetal.potentialV);
  const areaRatio = Math.max(0.1, normalizedInput.cathodeArea / normalizedInput.anodeArea);
  const areaRatioFactor = areaRatio <= 1 ? (0.75 + 0.25 * areaRatio) : (1 + 0.28 * Math.log(areaRatio));
  const temperatureFactor = getTemperatureFactor(normalizedInput.temperatureC);
  const coatingFactor = getIsolationFactor(normalizedInput.isolationQuality);

  const rawRate = Math.max(0, (drivingPotentialV - 0.05))
    * environment.conductivityFactor
    * environment.chlorideFactor
    * environment.moistureFactor
    * exposureDuty.wetnessFactor
    * areaRatioFactor
    * temperatureFactor
    * coatingFactor
    * 0.7;

  const corrosionRateMmYear = round(rawRate, 3);
  const corrosionRateMpyExact = rawRate * MM_PER_YEAR_TO_MPY;
  const corrosionRateMpy = round(corrosionRateMpyExact, 2);
  const severity = severityFromRate(rawRate);
  const estimatedLifeYears = rawRate > 0
    ? round(normalizedInput.corrosionAllowanceMm / rawRate, 1)
    : Infinity;
  const potentialCompatibility = buildPotentialCompatibility(drivingPotentialV);

  const result = {
    modelVersion: MODEL_VERSION,
    input: normalizedInput,
    timestamp: new Date().toISOString(),
    samePotentialGroup,
    primaryRole: samePotentialGroup ? 'Same potential group' : anodicMetal === primary ? 'Anodic' : 'Cathodic',
    secondaryRole: samePotentialGroup ? 'Same potential group' : anodicMetal === secondary ? 'Anodic' : 'Cathodic',
    anodicMetal: samePotentialGroup ? 'No distinct anodic member' : anodicMetal.label,
    cathodicMetal: samePotentialGroup ? 'No distinct cathodic member' : cathodicMetal.label,
    drivingPotentialV: round(drivingPotentialV, 3),
    areaRatio: round(areaRatio, 2),
    environmentLabel: environment.label,
    exposureDutyLabel: exposureDuty.label,
    exposureDutyFactor: exposureDuty.wetnessFactor,
    exposureDutyDetail: exposureDuty.detail,
    potentialBasis: GALVANIC_POTENTIAL_BASIS,
    potentialCompatibility,
    corrosionRateMmYearExact: rawRate,
    corrosionRateMmYear,
    corrosionRateMpyExact,
    corrosionRateMpy,
    severity,
    estimatedLifeYears,
    recommendation: buildRecommendation({
      anodicMetal,
      cathodicMetal,
      severity,
      environment: environment.label,
      exposureDuty,
      areaRatio,
      samePotentialGroup,
      potentialCompatibility
    })
  };

  result.compatibilityWarning = buildCompatibilityWarning(result);
  return result;
}

export function buildCorrosionTimelineState(result, years) {
  const elapsedYears = Math.max(0, finiteNumber(years, 0));
  const corrosionRateMmYear = Math.max(
    0,
    finiteNumber(result?.corrosionRateMmYearExact, finiteNumber(result?.corrosionRateMmYear, 0))
  );
  const fallbackAllowanceMm = Number.isFinite(result?.estimatedLifeYears) && corrosionRateMmYear > 0
    ? result.estimatedLifeYears * corrosionRateMmYear
    : 0;
  const corrosionAllowanceMm = Math.max(0, finiteNumber(result?.input?.corrosionAllowanceMm, fallbackAllowanceMm));
  const materialLossMmExact = corrosionRateMmYear * elapsedYears;
  const materialLossMm = round(materialLossMmExact, 3);
  const allowanceConsumedPct = corrosionAllowanceMm > 0
    ? round((materialLossMmExact / corrosionAllowanceMm) * 100, 1)
    : 0;
  const visualConsumedPct = Math.min(100, Math.max(0, allowanceConsumedPct));
  const remainingAllowanceMm = Math.max(0, round(corrosionAllowanceMm - materialLossMmExact, 3));
  const overAllowanceMm = Math.max(0, round(materialLossMmExact - corrosionAllowanceMm, 3));
  const initialThicknessMm = finiteNumber(result?.input?.initialThicknessMm, NaN);
  const minimumThicknessMm = finiteNumber(result?.input?.minimumThicknessMm, NaN);
  const hasThicknessProjection = Number.isFinite(initialThicknessMm) && initialThicknessMm > 0;
  const remainingThicknessMm = hasThicknessProjection
    ? Math.max(0, round(initialThicknessMm - materialLossMmExact, 3))
    : null;
  const thicknessConsumedPct = hasThicknessProjection
    ? round((materialLossMmExact / initialThicknessMm) * 100, 1)
    : null;
  const visualRemainingThicknessPct = hasThicknessProjection
    ? Math.min(100, Math.max(0, round((remainingThicknessMm / initialThicknessMm) * 100, 1)))
    : null;
  const thicknessMarginMm = hasThicknessProjection && Number.isFinite(minimumThicknessMm)
    ? round(remainingThicknessMm - minimumThicknessMm, 3)
    : null;
  const status = corrosionRateMmYear <= 0
    ? { key: 'stable', label: 'Stable', detail: 'No measurable galvanic material loss in the current model.' }
    : allowanceConsumedPct >= 100
      ? { key: 'exceeded', label: 'Allowance exceeded', detail: 'Modeled material loss has consumed the available corrosion allowance.' }
      : allowanceConsumedPct >= 85
        ? { key: 'critical', label: 'Critical', detail: 'Corrosion allowance is nearly consumed; mitigation or replacement planning is recommended.' }
        : allowanceConsumedPct >= 50
          ? { key: 'monitor', label: 'Monitor', detail: 'More than half of the available corrosion allowance has been consumed.' }
          : { key: 'within', label: 'Within allowance', detail: 'Modeled loss remains inside the available corrosion allowance.' };
  const thicknessStatus = getThicknessProjectionStatus({
    hasThicknessProjection,
    initialThicknessMm,
    minimumThicknessMm,
    remainingThicknessMm,
    thicknessConsumedPct,
    thicknessMarginMm,
    corrosionRateMmYear
  });

  return {
    elapsedYears: round(elapsedYears, 2),
    materialLossMm,
    remainingAllowanceMm,
    overAllowanceMm,
    allowanceConsumedPct,
    visualConsumedPct,
    corrosionAllowanceMm,
    statusKey: status.key,
    statusLabel: status.label,
    statusDetail: status.detail,
    hasThicknessProjection,
    initialThicknessMm: hasThicknessProjection ? initialThicknessMm : null,
    minimumThicknessMm: Number.isFinite(minimumThicknessMm) ? minimumThicknessMm : null,
    remainingThicknessMm,
    thicknessConsumedPct,
    visualRemainingThicknessPct,
    thicknessMarginMm,
    thicknessStatusKey: thicknessStatus.key,
    thicknessStatusLabel: thicknessStatus.label,
    thicknessStatusDetail: thicknessStatus.detail
  };
}

export function getAssemblyPreset(id) {
  return ASSEMBLY_PRESETS.find(preset => preset.id === id) || null;
}

function getThicknessProjectionStatus({
  hasThicknessProjection,
  initialThicknessMm,
  minimumThicknessMm,
  remainingThicknessMm,
  thicknessConsumedPct,
  thicknessMarginMm,
  corrosionRateMmYear
}) {
  if (!hasThicknessProjection) {
    return {
      key: 'not-modeled',
      label: 'Thickness not modeled',
      detail: 'Add optional thickness values to track remaining member thickness.'
    };
  }
  if (corrosionRateMmYear <= 0) {
    return {
      key: 'stable',
      label: 'Stable',
      detail: 'No measurable galvanic thinning is projected in the current model.'
    };
  }
  if (Number.isFinite(thicknessMarginMm) && thicknessMarginMm < 0) {
    return {
      key: 'exceeded',
      label: 'Below minimum thickness',
      detail: 'Projected remaining thickness is below the entered minimum acceptable thickness.'
    };
  }
  if (remainingThicknessMm <= 0) {
    return {
      key: 'exceeded',
      label: 'Fully consumed',
      detail: 'Projected material loss has consumed the entered initial thickness.'
    };
  }
  if (
    Number.isFinite(thicknessMarginMm)
    && thicknessMarginMm <= Math.max(0.1, initialThicknessMm * 0.05)
  ) {
    return {
      key: 'critical',
      label: 'Near minimum thickness',
      detail: 'Projected remaining thickness is close to the entered minimum acceptable value.'
    };
  }
  if (thicknessConsumedPct >= 50) {
    return {
      key: 'monitor',
      label: 'Monitor thickness',
      detail: 'Projected galvanic loss has consumed at least half of the entered starting thickness.'
    };
  }

  return {
    key: 'within',
    label: Number.isFinite(minimumThicknessMm) ? 'Above minimum thickness' : 'Thickness remaining',
    detail: Number.isFinite(minimumThicknessMm)
      ? 'Projected remaining thickness stays above the entered minimum acceptable value.'
      : 'Projected remaining thickness is based on the entered initial thickness.'
  };
}

export function buildMitigationComparisonRows(result) {
  if (!result?.input) {
    return [];
  }

  const baseline = estimateDissimilarMetalsRisk({
    ...result.input,
    isolationQuality: 'none'
  });
  const baselineRate = Math.max(0, baseline.corrosionRateMmYearExact);
  const baselineLife = baseline.estimatedLifeYears;

  return ISOLATION_OPTIONS.map(option => {
    const comparison = estimateDissimilarMetalsRisk({
      ...result.input,
      isolationQuality: option.key
    });
    const comparisonRate = comparison.corrosionRateMmYearExact;
    const rateReductionPct = baselineRate > 0
      ? round(((baselineRate - comparisonRate) / baselineRate) * 100, 0)
      : 0;
    const lifeGainYears = Number.isFinite(comparison.estimatedLifeYears) && Number.isFinite(baselineLife)
      ? round(comparison.estimatedLifeYears - baselineLife, 1)
      : null;

    return {
      key: option.key,
      label: option.label,
      detail: option.detail,
      isCurrent: option.key === result.input.isolationQuality,
      corrosionRateMmYearExact: comparisonRate,
      corrosionRateMmYear: comparison.corrosionRateMmYear,
      estimatedLifeYears: comparison.estimatedLifeYears,
      severity: comparison.severity,
      rateReductionPct,
      lifeGainYears
    };
  });
}

export function buildInspectionMilestones(result) {
  if (!Number.isFinite(result?.estimatedLifeYears) || result.estimatedLifeYears <= 0) {
    return INSPECTION_MILESTONES.map(milestone => ({
      ...milestone,
      years: null,
      yearLabel: 'Not reached in current model'
    }));
  }

  return INSPECTION_MILESTONES.map(milestone => {
    const years = round(result.estimatedLifeYears * (milestone.percent / 100), 1);
    return {
      ...milestone,
      years,
      yearLabel: formatYears(years)
    };
  });
}

export function buildAssumptionRows(result) {
  if (!result?.input) {
    return [];
  }

  const input = normalizeDissimilarMetalsInput(result.input);
  const environment = ENVIRONMENT_FACTORS[input.environment];
  const exposureDuty = getExposureDutyProfile(input.exposureDuty);
  const isolation = getIsolationOption(input.isolationQuality);
  const temperatureC = finiteNumber(input.temperatureC, 20);
  const rows = [
    {
      label: 'Potential basis',
      value: `${result.potentialBasis?.label || GALVANIC_POTENTIAL_BASIS.label}; ${result.potentialBasis?.environment || GALVANIC_POTENTIAL_BASIS.environment}`
    },
    {
      label: 'Compatibility criterion',
      value: `${result.potentialCompatibility?.label || buildPotentialCompatibility(result.drivingPotentialV).label}; current density is not calculated`
    },
    {
      label: 'Environment model',
      value: environment
        ? `${environment.label}; conductivity ${environment.conductivityFactor.toFixed(2)}x, chloride ${environment.chlorideFactor.toFixed(2)}x, moisture ${environment.moistureFactor.toFixed(2)}x`
        : 'Not specified'
    },
    {
      label: 'Electrolyte duty',
      value: `${exposureDuty.label}; wetness factor ${exposureDuty.wetnessFactor.toFixed(2)}x`
    },
    {
      label: 'Area basis',
      value: `Anode ${formatNumber(input.anodeArea)} cm2, cathode ${formatNumber(input.cathodeArea)} cm2, cathode/anode ratio ${formatNumber(result.areaRatio)}:1`
    },
    {
      label: 'Temperature factor',
      value: `${formatNumber(temperatureC)} C operating temperature; ${getTemperatureFactor(temperatureC).toFixed(2)}x factor`
    },
    {
      label: 'Isolation basis',
      value: `${isolation?.label || 'Not specified'}; ${getIsolationFactor(input.isolationQuality).toFixed(2)}x contact factor`
    },
    {
      label: 'Allowance basis',
      value: `${formatMm(input.corrosionAllowanceMm)} corrosion allowance applied to the anodic member`
    }
  ];

  if (Number.isFinite(input.initialThicknessMm) && input.initialThicknessMm > 0) {
    const minimumText = Number.isFinite(input.minimumThicknessMm)
      ? formatMm(input.minimumThicknessMm)
      : 'no minimum entered';
    rows.push({
      label: 'Thickness projection',
      value: `${formatMm(input.initialThicknessMm)} initial thickness; ${minimumText} minimum acceptable thickness`
    });
  }

  return rows;
}

export function buildResultSummary(result) {
  if (!result) {
    return '';
  }

  const warning = result.compatibilityWarning || buildCompatibilityWarning(result);
  const assumptions = buildAssumptionRows(result);
  const lines = [
    'Dissimilar Metals Corrosion Reference',
    `Generated: ${formatTimestamp(result.timestamp)}`,
    '',
    `Anodic member: ${result.anodicMetal}`,
    `Cathodic member: ${result.cathodicMetal}`,
    `Driving potential: ${result.drivingPotentialV.toFixed(3)} V`,
    `Cathode/anode area ratio: ${result.areaRatio.toFixed(2)}:1`,
    `Heuristic screening rate: ${formatRateMmYear(result)} (${formatRateMpy(result)})`,
    `Severity: ${result.severity}`,
    `Screening interval from allowance: ${formatLifeYears(result.estimatedLifeYears)}`,
    `Potential compatibility: ${result.potentialCompatibility?.label || buildPotentialCompatibility(result.drivingPotentialV).label}`
  ];

  if (warning) {
    lines.push('', warning.title, warning.message);
  }

  if (Array.isArray(result.recommendation) && result.recommendation.length) {
    lines.push('', 'Recommended mitigations:');
    result.recommendation.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }

  if (assumptions.length) {
    lines.push('', 'Model assumptions:');
    assumptions.forEach(row => {
      lines.push(`- ${row.label}: ${row.value}`);
    });
  }

  return lines.join('\n');
}

export function buildResultExportPayload(result) {
  return {
    exportType: 'dissimilar-metals-corrosion-study',
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    summaryText: buildResultSummary(result),
    result
  };
}

export function buildCompatibilityWarning(result) {
  if (!result) {
    return null;
  }

  const environmentLabel = result.environmentLabel
    || ENVIRONMENT_FACTORS[result.input?.environment]?.label
    || 'the selected environment';
  const exposureDuty = getExposureDutyProfile(result.input?.exposureDuty);
  const isolation = ISOLATION_OPTIONS.find(option => option.key === result.input?.isolationQuality);
  const drivers = [];

  if (result.drivingPotentialV >= 0.5) {
    drivers.push(`${result.drivingPotentialV.toFixed(3)} V galvanic separation`);
  } else if (result.drivingPotentialV >= 0.25) {
    drivers.push('moderate galvanic potential separation');
  }
  if (result.potentialCompatibility?.exceedsLimit) {
    drivers.push(`exceeds ${POTENTIAL_COMPATIBILITY_LIMIT_V.toFixed(2)} V compatibility screen`);
  }
  if (!result.samePotentialGroup && result.areaRatio > 2) {
    drivers.push(`${result.areaRatio.toFixed(2)}:1 cathode-to-anode area ratio`);
  }
  if (exposureDuty.wetnessFactor > 1) {
    drivers.push(`${exposureDuty.label.toLowerCase()} electrolyte duty`);
  }
  if (result.input?.isolationQuality !== 'engineered') {
    drivers.push(isolation?.label.toLowerCase() || 'limited isolation');
  }

  const level = result.severity === 'Severe' || result.severity === 'High'
    ? 'high'
    : result.severity === 'Moderate' || result.potentialCompatibility?.exceedsLimit
      ? 'review'
      : 'info';
  const title = level === 'high'
    ? 'Compatibility risk needs mitigation'
    : level === 'review'
      ? 'Compatibility review recommended'
      : 'Compatibility risk currently limited';
  const driverText = drivers.length
    ? ` Main drivers: ${drivers.join('; ')}.`
    : '';
  const relationshipText = result.samePotentialGroup
    ? 'The selected materials occupy the same representative potential group, so this screen does not assign a distinct anodic member.'
    : `${result.anodicMetal} is anodic against ${result.cathodicMetal}, so ${result.anodicMetal} is expected to lose material first in this pair.`;

  return {
    level,
    title,
    message: `${relationshipText} The modeled condition is ${result.severity.toLowerCase()} risk in ${environmentLabel} with ${exposureDuty.label.toLowerCase()} duty.${driverText}`,
    drivers
  };
}

function buildRecommendation({
  anodicMetal,
  cathodicMetal,
  severity,
  environment,
  exposureDuty,
  areaRatio,
  samePotentialGroup,
  potentialCompatibility
}) {
  const recommendations = [];
  if (samePotentialGroup) {
    recommendations.push('The materials share a representative potential group; verify the specific alloy, surface condition, and electrolyte before assigning anodic and cathodic roles.');
  } else {
    recommendations.push(`Protect ${anodicMetal.label} at the interface with ${cathodicMetal.label}; it is the anodic member in this pair.`);
  }
  if (severity === 'Severe' || severity === 'High' || potentialCompatibility?.exceedsLimit) {
    recommendations.push('Use dielectric isolation kits or non-conductive bushings at every hardware interface.');
    recommendations.push('Apply a robust barrier coating system and maintain coating continuity after installation.');
  }
  if (!samePotentialGroup && areaRatio > 2) {
    recommendations.push('Reduce cathode-to-anode area ratio (use larger anodic contact area or smaller noble fasteners) to slow galvanic attack.');
  }
  if (environment.includes('Marine') || environment.includes('coastal') || environment.includes('seawater')) {
    recommendations.push('In chloride-rich service, schedule frequent inspections and plan hardware replacement intervals.');
  }
  if (exposureDuty?.wetnessFactor > 1.2) {
    recommendations.push('Reduce sustained wetting at the interface where practical by improving drainage, sealing, covers, or drip shielding.');
  }
  recommendations.push('Treat this output as planning guidance; verify final material compatibility with project corrosion engineering standards.');
  recommendations.push('For a quantitative penetration rate, use measured or qualified galvanic current-density or weight-loss data for the actual assembly and electrolyte.');
  return recommendations;
}

export function buildPotentialCompatibility(drivingPotentialV) {
  const potential = Math.max(0, finiteNumber(drivingPotentialV, 0));
  const exceedsLimit = potential > POTENTIAL_COMPATIBILITY_LIMIT_V;
  return {
    limitV: POTENTIAL_COMPATIBILITY_LIMIT_V,
    exceedsLimit,
    key: exceedsLimit ? 'exceeds' : 'within',
    label: exceedsLimit
      ? `Exceeds ${POTENTIAL_COMPATIBILITY_LIMIT_V.toFixed(2)} V screening limit`
      : `Within ${POTENTIAL_COMPATIBILITY_LIMIT_V.toFixed(2)} V screening limit`,
    detail: exceedsLimit
      ? 'Treat the couple as incompatible unless qualified galvanic current density is 1 µA/cm² or less without pitting.'
      : 'Potential separation is within the NASA-STD-6012A screening limit; assembly-level verification may still be required.'
  };
}

function severityFromRate(rateMmYear) {
  if (rateMmYear < 0.01) return 'Negligible';
  if (rateMmYear < 0.05) return 'Low';
  if (rateMmYear < 0.2) return 'Moderate';
  if (rateMmYear < 0.5) return 'High';
  return 'Severe';
}

function round(value, decimals) {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

export function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeDissimilarMetalsInput(input = {}) {
  const source = input || {};
  return {
    ...source,
    exposureDuty: source.exposureDuty || DEFAULT_EXPOSURE_DUTY,
    initialThicknessMm: normalizeOptionalNumber(source.initialThicknessMm),
    minimumThicknessMm: normalizeOptionalNumber(source.minimumThicknessMm)
  };
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function getExposureDutyProfile(key) {
  return EXPOSURE_DUTY_FACTORS[key] || EXPOSURE_DUTY_FACTORS[DEFAULT_EXPOSURE_DUTY];
}

function getIsolationOption(key) {
  return ISOLATION_OPTIONS.find(option => option.key === key) || null;
}

function getIsolationFactor(key) {
  if (key === 'none') {
    return 1.35;
  }
  if (key === 'engineered') {
    return 0.55;
  }
  return 1.0;
}

function getTemperatureFactor(temperatureC) {
  const temperature = finiteNumber(temperatureC, 20);
  return 1 + Math.max(-20, Math.min(60, temperature - 20)) * 0.015;
}

function validateInputs(input) {
  if (!METAL_SERIES[input.primaryMetal]) {
    throw new Error('primaryMetal must be selected from the galvanic series list.');
  }
  if (!METAL_SERIES[input.secondaryMetal]) {
    throw new Error('secondaryMetal must be selected from the galvanic series list.');
  }
  if (!ENVIRONMENT_FACTORS[input.environment]) {
    throw new Error('environment must be selected from the supported environment list.');
  }
  if (!EXPOSURE_DUTY_FACTORS[input.exposureDuty]) {
    throw new Error('exposureDuty must be selected from the supported exposure duty list.');
  }
  if (!ISOLATION_OPTIONS.some(option => option.key === input.isolationQuality)) {
    throw new Error('isolationQuality must be selected from the supported isolation list.');
  }
  ['anodeArea', 'cathodeArea', 'corrosionAllowanceMm'].forEach((field) => {
    if (!Number.isFinite(input[field]) || input[field] <= 0) {
      throw new Error(`${field} must be greater than zero.`);
    }
  });
  if (input.initialThicknessMm !== null && (!Number.isFinite(input.initialThicknessMm) || input.initialThicknessMm <= 0)) {
    throw new Error('initialThicknessMm must be greater than zero when provided.');
  }
  if (input.minimumThicknessMm !== null && (!Number.isFinite(input.minimumThicknessMm) || input.minimumThicknessMm < 0)) {
    throw new Error('minimumThicknessMm must be zero or greater when provided.');
  }
  if (
    input.initialThicknessMm !== null
    && input.minimumThicknessMm !== null
    && input.minimumThicknessMm >= input.initialThicknessMm
  ) {
    throw new Error('minimumThicknessMm must be less than initialThicknessMm.');
  }
  if (!Number.isFinite(input.temperatureC) || input.temperatureC < -40 || input.temperatureC > 120) {
    throw new Error('temperatureC must be between -40 and 120 °C.');
  }
}

export function formatYears(value) {
  const years = finiteNumber(value, 0);
  const precision = years < 10 ? 1 : 0;
  return `${years.toFixed(precision)} years`;
}

function getExactRateMmYear(result) {
  return Math.max(
    0,
    finiteNumber(result?.corrosionRateMmYearExact, finiteNumber(result?.corrosionRateMmYear, 0))
  );
}

export function formatRateMmYear(result) {
  const rate = getExactRateMmYear(result);
  if (rate > 0 && rate < 0.001) {
    return '< 0.001 mm/year';
  }
  return `${rate.toFixed(3)} mm/year`;
}

export function formatRateMpy(result) {
  const rateMpy = Math.max(
    0,
    finiteNumber(result?.corrosionRateMpyExact, getExactRateMmYear(result) * MM_PER_YEAR_TO_MPY)
  );
  if (rateMpy > 0 && rateMpy < 0.01) {
    return '< 0.01 mpy';
  }
  return `${rateMpy.toFixed(2)} mpy`;
}

export function formatLifeYears(value) {
  if (!Number.isFinite(value)) {
    return 'No modeled galvanic consumption';
  }
  return formatYears(value);
}

export function formatMm(value) {
  const mm = finiteNumber(value, 0);
  const precision = mm < 1 ? 3 : 2;
  return `${mm.toFixed(precision)} mm`;
}

export function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) {
    return 'not specified';
  }
  const rounded = round(value, decimals);
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(decimals);
}

export function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toISOString();
}

/**
 * Worker-safe operation contract shared by the module worker and its
 * synchronous fallback. Keeping this map in the leaf model prevents either
 * transport from drifting to a different implementation.
 */
export const DISSIMILAR_METALS_WORKER_OPERATIONS = Object.freeze({
  estimateDissimilarMetalsRisk,
  buildCorrosionTimelineState,
  buildMitigationComparisonRows,
  buildInspectionMilestones,
  buildAssumptionRows,
  buildResultSummary,
  buildResultExportPayload,
});
