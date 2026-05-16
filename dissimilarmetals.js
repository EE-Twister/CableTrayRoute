import { getStudies, setStudies } from './dataStore.mjs';
import { escapeHtml } from './src/htmlUtils.mjs';

const MM_PER_YEAR_TO_MPY = 39.3701;

const METAL_SERIES = {
  magnesium: { label: 'Magnesium alloy', potentialV: -1.6, family: 'active' },
  zinc: { label: 'Zinc / galvanized steel (hot-dip)', potentialV: -1.03, family: 'active' },
  zincElectroplate: { label: 'Zinc electroplate (clear/yellow chromate)', potentialV: -0.98, family: 'active' },
  aluminum: { label: 'Aluminum alloy', potentialV: -0.8, family: 'active' },
  aluminumMetallized: { label: 'Aluminum metallized coating', potentialV: -0.78, family: 'active' },
  carbonSteel: { label: 'Carbon steel', potentialV: -0.6, family: 'active' },
  castIron: { label: 'Cast iron', potentialV: -0.61, family: 'active' },
  cadmium: { label: 'Cadmium-plated steel', potentialV: -0.75, family: 'active' },
  lead: { label: 'Lead', potentialV: -0.5, family: 'intermediate' },
  tin: { label: 'Tin / tin-plated copper', potentialV: -0.49, family: 'intermediate' },
  stainless410Active: { label: 'Stainless steel 410/430 (active)', potentialV: -0.56, family: 'active' },
  stainlessActive: { label: 'Stainless steel (active)', potentialV: -0.5, family: 'intermediate' },
  copper: { label: 'Copper', potentialV: -0.34, family: 'noble' },
  brass: { label: 'Brass', potentialV: -0.36, family: 'noble' },
  bronze: { label: 'Bronze / silicon bronze', potentialV: -0.33, family: 'noble' },
  copperNickel: { label: 'Copper-nickel alloy', potentialV: -0.3, family: 'noble' },
  nickelPlatedCopper: { label: 'Nickel-plated copper lug/barrel', potentialV: -0.22, family: 'noble' },
  stainless304Passive: { label: 'Stainless steel 304 (passive)', potentialV: -0.1, family: 'noble' },
  stainless316Passive: { label: 'Stainless steel 316 (passive)', potentialV: -0.05, family: 'noble' },
  stainlessDuplexPassive: { label: 'Stainless steel duplex (passive)', potentialV: -0.04, family: 'noble' },
  nickel200: { label: 'Nickel alloy (Ni 200)', potentialV: -0.18, family: 'noble' },
  titanium: { label: 'Titanium', potentialV: -0.03, family: 'noble' }
};

const ENVIRONMENT_FACTORS = {
  indoorDry: { label: 'Indoor conditioned / dry', conductivityFactor: 0.06, chlorideFactor: 0.8, moistureFactor: 0.7 },
  indoorHumid: { label: 'Indoor humid / washdown', conductivityFactor: 0.2, chlorideFactor: 1.0, moistureFactor: 1.0 },
  industrialOutdoor: { label: 'Industrial outdoor (rain + pollutants)', conductivityFactor: 0.45, chlorideFactor: 1.15, moistureFactor: 1.15 },
  coastalAtmosphere: { label: 'Coastal atmosphere / salt fog', conductivityFactor: 0.75, chlorideFactor: 1.4, moistureFactor: 1.25 },
  marineSplash: { label: 'Marine splash / tidal', conductivityFactor: 1.2, chlorideFactor: 1.6, moistureFactor: 1.35 },
  submergedSeawater: { label: 'Submerged seawater', conductivityFactor: 1.45, chlorideFactor: 1.75, moistureFactor: 1.4 },
  freshwaterSubmerged: { label: 'Freshwater submerged', conductivityFactor: 0.5, chlorideFactor: 0.9, moistureFactor: 1.2 }
};

const DEFAULT_EXPOSURE_DUTY = 'intermittentlyWet';

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

const ASSEMBLY_PRESETS = [
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
  const corrosionRateMpy = round(corrosionRateMmYear * MM_PER_YEAR_TO_MPY, 2);
  const severity = severityFromRate(corrosionRateMmYear);
  const estimatedLifeYears = corrosionRateMmYear > 0
    ? round(normalizedInput.corrosionAllowanceMm / corrosionRateMmYear, 1)
    : Infinity;

  const result = {
    input: normalizedInput,
    timestamp: new Date().toISOString(),
    primaryRole: anodicMetal === primary ? 'Anodic' : 'Cathodic',
    secondaryRole: anodicMetal === secondary ? 'Anodic' : 'Cathodic',
    anodicMetal: anodicMetal.label,
    cathodicMetal: cathodicMetal.label,
    drivingPotentialV: round(drivingPotentialV, 3),
    areaRatio: round(areaRatio, 2),
    environmentLabel: environment.label,
    exposureDutyLabel: exposureDuty.label,
    exposureDutyFactor: exposureDuty.wetnessFactor,
    exposureDutyDetail: exposureDuty.detail,
    corrosionRateMmYear,
    corrosionRateMpy,
    severity,
    estimatedLifeYears,
    recommendation: buildRecommendation({
      anodicMetal,
      cathodicMetal,
      severity,
      environment: environment.label,
      exposureDuty,
      areaRatio
    })
  };

  result.compatibilityWarning = buildCompatibilityWarning(result);
  return result;
}

export function buildCorrosionTimelineState(result, years) {
  const elapsedYears = Math.max(0, finiteNumber(years, 0));
  const corrosionRateMmYear = Math.max(0, finiteNumber(result?.corrosionRateMmYear, 0));
  const fallbackAllowanceMm = Number.isFinite(result?.estimatedLifeYears) && corrosionRateMmYear > 0
    ? result.estimatedLifeYears * corrosionRateMmYear
    : 0;
  const corrosionAllowanceMm = Math.max(0, finiteNumber(result?.input?.corrosionAllowanceMm, fallbackAllowanceMm));
  const materialLossMm = round(corrosionRateMmYear * elapsedYears, 3);
  const allowanceConsumedPct = corrosionAllowanceMm > 0
    ? round((materialLossMm / corrosionAllowanceMm) * 100, 1)
    : 0;
  const visualConsumedPct = Math.min(100, Math.max(0, allowanceConsumedPct));
  const remainingAllowanceMm = Math.max(0, round(corrosionAllowanceMm - materialLossMm, 3));
  const overAllowanceMm = Math.max(0, round(materialLossMm - corrosionAllowanceMm, 3));
  const initialThicknessMm = finiteNumber(result?.input?.initialThicknessMm, NaN);
  const minimumThicknessMm = finiteNumber(result?.input?.minimumThicknessMm, NaN);
  const hasThicknessProjection = Number.isFinite(initialThicknessMm) && initialThicknessMm > 0;
  const remainingThicknessMm = hasThicknessProjection
    ? Math.max(0, round(initialThicknessMm - materialLossMm, 3))
    : null;
  const thicknessConsumedPct = hasThicknessProjection
    ? round((materialLossMm / initialThicknessMm) * 100, 1)
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
  const baselineRate = Math.max(0, baseline.corrosionRateMmYear);
  const baselineLife = baseline.estimatedLifeYears;

  return ISOLATION_OPTIONS.map(option => {
    const comparison = estimateDissimilarMetalsRisk({
      ...result.input,
      isolationQuality: option.key
    });
    const rateReductionPct = baselineRate > 0
      ? round(((baselineRate - comparison.corrosionRateMmYear) / baselineRate) * 100, 0)
      : 0;
    const lifeGainYears = Number.isFinite(comparison.estimatedLifeYears) && Number.isFinite(baselineLife)
      ? round(comparison.estimatedLifeYears - baselineLife, 1)
      : null;

    return {
      key: option.key,
      label: option.label,
      detail: option.detail,
      isCurrent: option.key === result.input.isolationQuality,
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
    `Estimated corrosion rate: ${result.corrosionRateMmYear.toFixed(3)} mm/year (${result.corrosionRateMpy.toFixed(2)} mpy)`,
    `Severity: ${result.severity}`,
    `Estimated life from allowance: ${formatLifeYears(result.estimatedLifeYears)}`
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
    exportVersion: 1,
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
  if (result.areaRatio > 2) {
    drivers.push(`${result.areaRatio.toFixed(2)}:1 cathode-to-anode area ratio`);
  }
  if (exposureDuty.wetnessFactor > 1) {
    drivers.push(`${exposureDuty.label.toLowerCase()} electrolyte duty`);
  }
  if (result.input?.isolationQuality !== 'engineered') {
    drivers.push(`${isolation?.label.toLowerCase() || 'limited'} isolation`);
  }

  const level = result.severity === 'Severe' || result.severity === 'High'
    ? 'high'
    : result.severity === 'Moderate'
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

  return {
    level,
    title,
    message: `${result.anodicMetal} is anodic against ${result.cathodicMetal}, so ${result.anodicMetal} is expected to lose material first in this pair. The modeled condition is ${result.severity.toLowerCase()} risk in ${environmentLabel} with ${exposureDuty.label.toLowerCase()} duty.${driverText}`,
    drivers
  };
}

function buildRecommendation({ anodicMetal, cathodicMetal, severity, environment, exposureDuty, areaRatio }) {
  const recommendations = [];
  recommendations.push(`Protect ${anodicMetal.label} at the interface with ${cathodicMetal.label}; it is the anodic member in this pair.`);
  if (severity === 'Severe' || severity === 'High') {
    recommendations.push('Use dielectric isolation kits or non-conductive bushings at every hardware interface.');
    recommendations.push('Apply a robust barrier coating system and maintain coating continuity after installation.');
  }
  if (areaRatio > 2) {
    recommendations.push('Reduce cathode-to-anode area ratio (use larger anodic contact area or smaller noble fasteners) to slow galvanic attack.');
  }
  if (environment.includes('Marine') || environment.includes('coastal') || environment.includes('seawater')) {
    recommendations.push('In chloride-rich service, schedule frequent inspections and plan hardware replacement intervals.');
  }
  if (exposureDuty?.wetnessFactor > 1.2) {
    recommendations.push('Reduce sustained wetting at the interface where practical by improving drainage, sealing, covers, or drip shielding.');
  }
  recommendations.push('Treat this output as planning guidance; verify final material compatibility with project corrosion engineering standards.');
  return recommendations;
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

function finiteNumber(value, fallback = 0) {
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

function getExposureDutyProfile(key) {
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

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    initDarkMode();
    initCompactMode();
    initHelpModal('help-btn', 'help-modal', 'close-help-btn');
    initNavToggle();

    const form = document.getElementById('dissimilar-metals-form');
    const assemblyPresetSelect = document.getElementById('assembly-preset');
    const primarySelect = document.getElementById('primary-metal');
    const secondarySelect = document.getElementById('secondary-metal');
    const resetButton = document.getElementById('reset-corrosion-form');
    const resultsEl = document.getElementById('results');
    const errorsEl = document.getElementById('calc-errors');
    const saved = getStudies().dissimilarMetals;

    populateMetalSelects(primarySelect, secondarySelect);
    populateAssemblyPresetSelect(assemblyPresetSelect);
    updateAssemblyPresetHint('');
    updateAreaRoleGuidance();
    primarySelect.addEventListener('change', updateAreaRoleGuidance);
    secondarySelect.addEventListener('change', updateAreaRoleGuidance);
    assemblyPresetSelect?.addEventListener('change', () => {
      applyAssemblyPreset(assemblyPresetSelect.value);
      updateAssemblyPresetHint(assemblyPresetSelect.value);
    });
    markPresetCustomOnManualEdit(form, assemblyPresetSelect);
    resetButton?.addEventListener('click', () => {
      form.reset();
      if (assemblyPresetSelect) {
        assemblyPresetSelect.value = '';
      }
      updateAssemblyPresetHint('');
      updateAreaRoleGuidance();
      errorsEl.hidden = true;
      errorsEl.textContent = '';
    });

    if (saved) {
      renderResults(saved, resultsEl);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const result = estimateDissimilarMetalsRisk(readFormInput());
        const studies = getStudies();
        studies.dissimilarMetals = result;
        setStudies(studies);
        errorsEl.hidden = true;
        errorsEl.textContent = '';
        renderResults(result, resultsEl);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to evaluate galvanic corrosion risk.';
        errorsEl.hidden = false;
        errorsEl.textContent = message;
        showModal('Input Error', `<p>${escapeHtml(message)}</p>`, 'error');
      }
    });
  });
}

function populateMetalSelects(primarySelect, secondarySelect) {
  if (!primarySelect || !secondarySelect) {
    return;
  }

  const defaultPrimary = primarySelect.dataset.defaultValue || 'aluminum';
  const defaultSecondary = secondarySelect.dataset.defaultValue || 'stainless304Passive';
  const metalEntries = Object.entries(METAL_SERIES)
    .sort(([, a], [, b]) => a.potentialV - b.potentialV);

  const buildOptions = (selectedValue) => metalEntries.map(([key, metal]) => {
    const selected = key === selectedValue ? ' selected' : '';
    return `<option value="${key}"${selected}>${metal.label}</option>`;
  }).join('');

  const selectedPrimary = METAL_SERIES[primarySelect.value] ? primarySelect.value : defaultPrimary;
  const selectedSecondary = METAL_SERIES[secondarySelect.value] ? secondarySelect.value : defaultSecondary;

  primarySelect.innerHTML = buildOptions(selectedPrimary);
  secondarySelect.innerHTML = buildOptions(selectedSecondary);
}

function populateAssemblyPresetSelect(select) {
  if (!select) {
    return;
  }

  const options = [
    '<option value="">Custom material pair</option>',
    ...ASSEMBLY_PRESETS.map(preset => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</option>`)
  ];

  select.innerHTML = options.join('');
}

function applyAssemblyPreset(presetId) {
  const preset = getAssemblyPreset(presetId);
  if (!preset) {
    return;
  }

  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = String(value);
    }
  };

  setValue('primary-metal', preset.values.primaryMetal);
  setValue('secondary-metal', preset.values.secondaryMetal);
  setValue('environment-type', preset.values.environment);
  setValue('exposure-duty', preset.values.exposureDuty);
  setValue('isolation-quality', preset.values.isolationQuality);
  setValue('anode-area', preset.values.anodeArea);
  setValue('cathode-area', preset.values.cathodeArea);
  setValue('corrosion-allowance', preset.values.corrosionAllowanceMm);
  setValue('initial-thickness', preset.values.initialThicknessMm ?? '');
  setValue('minimum-thickness', preset.values.minimumThicknessMm ?? '');
  setValue('temperature-c', preset.values.temperatureC);
  updateAreaRoleGuidance();
}

function updateAssemblyPresetHint(presetId) {
  const hint = document.getElementById('assembly-preset-hint');
  if (!hint) {
    return;
  }

  const preset = getAssemblyPreset(presetId);
  hint.textContent = preset
    ? preset.description
    : 'Seeds typical materials and assumptions.';
}

function markPresetCustomOnManualEdit(form, assemblyPresetSelect) {
  if (!form || !assemblyPresetSelect) {
    return;
  }

  form.querySelectorAll('input, select').forEach(control => {
    if (control.id === 'assembly-preset') {
      return;
    }
    control.addEventListener('input', () => {
      assemblyPresetSelect.value = '';
      updateAssemblyPresetHint('');
    });
    control.addEventListener('change', () => {
      assemblyPresetSelect.value = '';
      updateAssemblyPresetHint('');
    });
  });
}

function readFormInput() {
  const getValue = id => document.getElementById(id).value;
  const getNumber = id => Number.parseFloat(getValue(id));
  const getOptionalNumber = (id) => {
    const value = getValue(id).trim();
    return value === '' ? null : Number.parseFloat(value);
  };

  return {
    primaryMetal: getValue('primary-metal'),
    secondaryMetal: getValue('secondary-metal'),
    environment: getValue('environment-type'),
    exposureDuty: getValue('exposure-duty'),
    isolationQuality: getValue('isolation-quality'),
    anodeArea: getNumber('anode-area'),
    cathodeArea: getNumber('cathode-area'),
    corrosionAllowanceMm: getNumber('corrosion-allowance'),
    initialThicknessMm: getOptionalNumber('initial-thickness'),
    minimumThicknessMm: getOptionalNumber('minimum-thickness'),
    temperatureC: getNumber('temperature-c')
  };
}

function updateAreaRoleGuidance() {
  const primaryKey = document.getElementById('primary-metal')?.value;
  const secondaryKey = document.getElementById('secondary-metal')?.value;
  const primary = METAL_SERIES[primaryKey];
  const secondary = METAL_SERIES[secondaryKey];

  if (!primary || !secondary) {
    return;
  }

  const anodicMetal = primary.potentialV <= secondary.potentialV ? primary : secondary;
  const cathodicMetal = anodicMetal === primary ? secondary : primary;
  const anodeLabel = document.getElementById('anode-area-label');
  const cathodeLabel = document.getElementById('cathode-area-label');
  const areaHint = document.getElementById('area-role-hint');

  if (anodeLabel) {
    anodeLabel.textContent = 'Anodic area (cm²)';
  }
  if (cathodeLabel) {
    cathodeLabel.textContent = 'Cathodic area (cm²)';
  }
  if (areaHint) {
    areaHint.textContent = `${anodicMetal.label} corrodes first. ${cathodicMetal.label} is cathodic.`;
  }
}

function renderResults(result, container) {
  const estimatedLife = Number.isFinite(result.estimatedLifeYears)
    ? `${result.estimatedLifeYears.toFixed(1)} years`
    : 'No measurable galvanic consumption (model lower bound).';
  const environmentLabel = result.environmentLabel
    || ENVIRONMENT_FACTORS[result.input?.environment]?.label
    || 'Not specified';
  const exposureDuty = getExposureDutyProfile(result.input?.exposureDuty);
  const exposureDutyLabel = result.exposureDutyLabel || exposureDuty.label;
  const exposureDutyFactor = finiteNumber(result.exposureDutyFactor, exposureDuty.wetnessFactor);
  const resultActionsHtml = renderResultActions(result);
  const compatibilityWarningHtml = renderCompatibilityWarning(result);
  const overviewHtml = renderResultOverview(result, {
    estimatedLife,
    environmentLabel,
    exposureDutyLabel,
    exposureDutyFactor
  });
  const assessmentDetailsHtml = renderAssessmentDetails(result, {
    estimatedLife,
    environmentLabel,
    exposureDutyLabel,
    exposureDutyFactor
  });
  const mitigationsHtml = renderRecommendedMitigations(result);
  const mitigationComparisonHtml = renderMitigationComparison(result);
  const assumptionsHtml = renderAssumptionReview(result);
  const timelineHtml = renderCorrosionTimeline(result);

  container.innerHTML = `
    <section class="results-card corrosion-results-card" aria-label="Dissimilar metal corrosion assessment">
      <div class="corrosion-section-heading corrosion-results-heading">
        <div>
          <p class="corrosion-timeline-kicker">Assessment output</p>
          <h2>Assessment Results</h2>
        </div>
        <span class="corrosion-severity-badge corrosion-severity-badge--${getSeverityClass(result.severity)}">${escapeHtml(result.severity)}</span>
      </div>
      ${overviewHtml}
      ${compatibilityWarningHtml}
      <div class="corrosion-result-body-grid">
        ${mitigationsHtml}
        ${resultActionsHtml}
      </div>
      ${timelineHtml}
      ${mitigationComparisonHtml}
      <section class="corrosion-details-card" aria-labelledby="corrosion-details-heading">
        <div class="corrosion-card-heading">
          <div>
            <p class="corrosion-timeline-kicker">Documentation</p>
            <h3 id="corrosion-details-heading">Basis</h3>
          </div>
        </div>
        ${assessmentDetailsHtml}
        <details class="corrosion-assumptions">
          <summary>Engineering note</summary>
          <p class="field-hint">Rates are planning-level galvanic estimates synthesized from galvanic potential separation, relative wetted area ratio, and electrolyte severity. Validate with your project corrosion engineer and owner standards.</p>
        </details>
        ${assumptionsHtml}
      </section>
    </section>
  `;

  initResultActions(container, result);
  initCorrosionTimeline(container, result);
}

function renderResultOverview(result, {
  estimatedLife,
  environmentLabel,
  exposureDutyLabel,
  exposureDutyFactor
}) {
  return `
    <div class="corrosion-result-summary-grid" aria-label="Assessment summary">
      <article class="corrosion-kpi-card corrosion-kpi-card--${getSeverityClass(result.severity)}">
        <span>Severity</span>
        <strong>${escapeHtml(result.severity)}</strong>
        <small>${escapeHtml(getSeverityDescription(result.severity))}</small>
      </article>
      <article class="corrosion-kpi-card">
        <span>Estimated rate</span>
        <strong>${result.corrosionRateMmYear.toFixed(3)} mm/year</strong>
        <small>${result.corrosionRateMpy.toFixed(2)} mpy</small>
      </article>
      <article class="corrosion-kpi-card">
        <span>Life from allowance</span>
        <strong>${escapeHtml(estimatedLife)}</strong>
        <small>${escapeHtml(formatMm(result.input?.corrosionAllowanceMm))} allowance</small>
      </article>
      <article class="corrosion-kpi-card">
        <span>Exposure basis</span>
        <strong>${escapeHtml(environmentLabel)}</strong>
        <small>${escapeHtml(exposureDutyLabel)} (${exposureDutyFactor.toFixed(2)}x)</small>
      </article>
    </div>
  `;
}

function renderAssessmentDetails(result, {
  estimatedLife,
  environmentLabel,
  exposureDutyLabel,
  exposureDutyFactor
}) {
  return `
    <div class="corrosion-table-wrap">
      <table class="data-table corrosion-details-table">
        <tbody>
          <tr><th>Anodic (corroding) member</th><td>${escapeHtml(result.anodicMetal)}</td></tr>
          <tr><th>Cathodic member</th><td>${escapeHtml(result.cathodicMetal)}</td></tr>
          <tr><th>Primary component role</th><td>${escapeHtml(result.primaryRole)}</td></tr>
          <tr><th>Connected hardware role</th><td>${escapeHtml(result.secondaryRole)}</td></tr>
          <tr><th>Driving potential</th><td>${result.drivingPotentialV.toFixed(3)} V</td></tr>
          <tr><th>Cathode/Anode area ratio</th><td>${result.areaRatio.toFixed(2)} : 1</td></tr>
          <tr><th>Exposure environment</th><td>${escapeHtml(environmentLabel)}</td></tr>
          <tr><th>Electrolyte duty cycle</th><td>${escapeHtml(exposureDutyLabel)} (${exposureDutyFactor.toFixed(2)}x)</td></tr>
          <tr><th>Estimated corrosion rate</th><td>${result.corrosionRateMmYear.toFixed(3)} mm/year (${result.corrosionRateMpy.toFixed(2)} mpy)</td></tr>
          <tr><th>Severity</th><td><strong>${escapeHtml(result.severity)}</strong></td></tr>
          <tr><th>Estimated life from allowance</th><td>${escapeHtml(estimatedLife)}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderRecommendedMitigations(result) {
  const actionHtml = result.recommendation.map(item => `
    <li>
      <details class="corrosion-action-disclosure">
        <summary>${escapeHtml(summarizeMitigationAction(item))}</summary>
        <p>${escapeHtml(item)}</p>
      </details>
    </li>
  `).join('');

  return `
    <section class="corrosion-action-card" aria-labelledby="corrosion-actions-heading">
      <div class="corrosion-card-heading corrosion-card-heading--stacked">
        <p class="corrosion-timeline-kicker">Recommended actions</p>
        <h3 id="corrosion-actions-heading">Mitigation Plan</h3>
      </div>
      <ul class="corrosion-action-list">${actionHtml}</ul>
    </section>
  `;
}

function renderResultActions() {
  return `
    <div class="corrosion-result-actions" aria-label="Result sharing actions">
      <div>
        <p class="corrosion-timeline-kicker">Study handoff</p>
        <p class="field-hint">Copy or export this study.</p>
      </div>
      <div class="corrosion-result-action-buttons">
        <button type="button" class="secondary-btn" data-copy-corrosion-summary>Copy Summary</button>
        <button type="button" class="secondary-btn" data-download-corrosion-json>Download JSON</button>
      </div>
      <output class="corrosion-action-status" data-corrosion-action-status aria-live="polite"></output>
    </div>
  `;
}

function getSeverityClass(severity) {
  return String(severity || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function getSeverityDescription(severity) {
  const descriptions = {
    Negligible: 'Minimal galvanic impact expected',
    Low: 'Manage with routine detailing',
    Moderate: 'Plan isolation and inspection',
    High: 'Mitigation is typically required',
    Severe: 'Redesign or isolate before release'
  };

  return descriptions[severity] || 'Review project corrosion basis';
}

function summarizeMitigationAction(text) {
  const action = String(text || '').toLowerCase();
  if (action.includes('dielectric') || action.includes('bushing')) {
    return 'Add dielectric isolation';
  }
  if (action.includes('barrier coating') || action.includes('coating continuity')) {
    return 'Protect coating continuity';
  }
  if (action.includes('area ratio')) {
    return 'Reduce area ratio';
  }
  if (action.includes('chloride') || action.includes('inspections')) {
    return 'Increase inspection frequency';
  }
  if (action.includes('drainage') || action.includes('wetting')) {
    return 'Reduce wetting';
  }
  if (action.includes('planning guidance') || action.includes('corrosion engineering')) {
    return 'Verify with project standards';
  }
  if (action.includes('anodic member') || action.includes('interface')) {
    return 'Protect anodic interface';
  }
  return text;
}

function renderAssumptionReview(result) {
  const rows = buildAssumptionRows(result);
  if (!rows.length) {
    return '';
  }

  const rowHtml = rows.map(row => `
    <tr>
      <th scope="row">${escapeHtml(row.label)}</th>
      <td>${escapeHtml(row.value)}</td>
    </tr>
  `).join('');

  return `
    <details class="corrosion-assumptions">
      <summary>Inputs and model assumptions</summary>
      <div class="corrosion-table-wrap">
        <table class="data-table">
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
    </details>
  `;
}

function initResultActions(container, result) {
  const copyButton = container.querySelector('[data-copy-corrosion-summary]');
  const downloadButton = container.querySelector('[data-download-corrosion-json]');
  const status = container.querySelector('[data-corrosion-action-status]');

  copyButton?.addEventListener('click', async () => {
    try {
      await copyTextToClipboard(buildResultSummary(result));
      setActionStatus(status, 'Summary copied.');
    } catch {
      setActionStatus(status, 'Copy failed. Download the JSON instead.');
    }
  });

  downloadButton?.addEventListener('click', () => {
    downloadResultJson(result);
    setActionStatus(status, 'JSON downloaded.');
  });
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) {
    throw new Error('Clipboard copy failed.');
  }
}

function downloadResultJson(result) {
  const payload = buildResultExportPayload(result);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dissimilar-metals-study-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setActionStatus(status, message) {
  if (!status) {
    return;
  }
  status.textContent = message;
}

function renderCompatibilityWarning(result) {
  const warning = result.compatibilityWarning || buildCompatibilityWarning(result);
  if (!warning) {
    return '';
  }

  const driversHtml = warning.drivers.length
    ? `<ul class="corrosion-warning-drivers">${warning.drivers.map(driver => `<li>${escapeHtml(driver)}</li>`).join('')}</ul>`
    : '';

  return `
    <aside class="corrosion-compatibility-warning corrosion-compatibility-warning--${escapeHtml(warning.level)}" aria-label="Material compatibility warning">
      <div>
        <p class="corrosion-timeline-kicker">Material compatibility</p>
        <h3>${escapeHtml(warning.title)}</h3>
      </div>
      <p class="corrosion-compatibility-summary">${escapeHtml(result.anodicMetal)} corrodes first.</p>
      ${driversHtml}
      <details class="corrosion-warning-detail">
        <summary>Details</summary>
        <p>${escapeHtml(warning.message)}</p>
      </details>
    </aside>
  `;
}

function renderMitigationComparison(result) {
  const rows = buildMitigationComparisonRows(result);
  if (!rows.length) {
    return '';
  }

  const rowHtml = rows.map(row => {
    const currentBadge = row.isCurrent ? '<span class="corrosion-current-badge">Current</span>' : '';
    const lifeText = formatLifeYears(row.estimatedLifeYears);
    const gainText = row.lifeGainYears === null
      ? 'No measurable baseline'
      : row.lifeGainYears <= 0
        ? 'Baseline'
        : `+${row.lifeGainYears.toFixed(1)} years`;

    return `
      <tr class="${row.isCurrent ? 'is-current' : ''}">
        <th scope="row">
          <span>${escapeHtml(row.label)}</span>
          ${currentBadge}
          <small>${escapeHtml(row.detail)}</small>
        </th>
        <td>${row.corrosionRateMmYear.toFixed(3)} mm/year</td>
        <td>${escapeHtml(lifeText)}</td>
        <td>${row.rateReductionPct}% lower rate<br><small>${escapeHtml(gainText)} vs no isolation</small></td>
        <td><strong>${escapeHtml(row.severity)}</strong></td>
      </tr>
    `;
  }).join('');

  return `
    <section class="corrosion-comparison-card" aria-labelledby="corrosion-comparison-heading">
      <div class="corrosion-card-heading">
        <div>
          <p class="corrosion-timeline-kicker">Mitigation comparison</p>
          <h3 id="corrosion-comparison-heading">Isolation Strategy Impact</h3>
        </div>
        <p class="field-hint">Same study, different isolation.</p>
      </div>
      <div class="corrosion-table-wrap">
        <table class="data-table corrosion-comparison-table">
          <thead>
            <tr>
              <th scope="col">Strategy</th>
              <th scope="col">Rate</th>
              <th scope="col">Life from allowance</th>
              <th scope="col">Change vs no isolation</th>
              <th scope="col">Severity</th>
            </tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderCorrosionTimeline(result) {
  const config = getCorrosionTimelineConfig(result);
  const initialState = buildCorrosionTimelineState(result, 0);
  const maxYearsText = formatYears(config.maxYears);
  const allowanceText = formatMm(initialState.corrosionAllowanceMm);
  const thicknessProjectionHtml = renderThicknessProjection(initialState);
  const milestonesHtml = renderInspectionMilestones(result);

  return `
    <section class="corrosion-timeline-card" aria-labelledby="corrosion-timeline-heading">
      <div class="corrosion-timeline-header">
        <div>
          <p class="corrosion-timeline-kicker">Allowance timeline</p>
          <h3 id="corrosion-timeline-heading">Corrosion Over Time</h3>
          <p class="field-hint">Slide to project material loss over time.</p>
        </div>
        <output class="corrosion-status-pill corrosion-status-pill--${initialState.statusKey}" for="corrosion-years-slider" data-corrosion-status>${escapeHtml(initialState.statusLabel)}</output>
      </div>

      <div class="corrosion-timeline-grid">
        <div class="corrosion-visual-panel">
          <div class="corrosion-visual" data-corrosion-visual style="--corrosion-progress: 0%; --corrosion-pit-opacity: 0;">
            <div class="corrosion-visual-label">Impacted anodic component</div>
            <div class="corrosion-visual-member" aria-hidden="true">
              <svg class="corrosion-visual-svg" data-corrosion-svg viewBox="0 0 600 140" width="100%" height="150" role="img" aria-label="Corrosion allowance visual for ${escapeHtml(result.anodicMetal)}">
                <defs>
                  <linearGradient id="corrosion-metal-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#cbd5e1"></stop>
                    <stop offset="48%" stop-color="#f8fafc"></stop>
                    <stop offset="100%" stop-color="#94a3b8"></stop>
                  </linearGradient>
                  <linearGradient id="corrosion-attack-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#7f1d1d"></stop>
                    <stop offset="58%" stop-color="#c2410c"></stop>
                    <stop offset="100%" stop-color="#fb923c"></stop>
                  </linearGradient>
                </defs>
                <rect x="4" y="16" width="592" height="96" rx="8" fill="url(#corrosion-metal-gradient)" stroke="#64748b" stroke-width="1.5"></rect>
                <path data-corrosion-attack-shape d="${buildCorrosionAttackPath(0)}" fill="url(#corrosion-attack-gradient)" opacity="0"></path>
                <g data-corrosion-pits opacity="0">
                  <circle cx="92" cy="40" r="2.4" fill="#451a03"></circle>
                  <circle cx="170" cy="84" r="3.2" fill="#7c2d12"></circle>
                  <circle cx="276" cy="56" r="2.5" fill="#451a03"></circle>
                  <circle cx="390" cy="88" r="2.7" fill="#7c2d12"></circle>
                  <circle cx="496" cy="50" r="2.5" fill="#451a03"></circle>
                </g>
                <rect x="4" y="16" width="592" height="96" rx="8" fill="none" stroke="#334155" stroke-width="1"></rect>
                <rect x="432" y="76" width="148" height="26" rx="4" fill="rgba(255,255,255,.82)"></rect>
                <text x="570" y="94" text-anchor="end" fill="#0f172a" font-size="16" font-weight="700">${escapeHtml(result.anodicMetal)}</text>
              </svg>
            </div>
            <div class="corrosion-visual-legend" aria-hidden="true">
              <span><i class="corrosion-legend-swatch corrosion-legend-swatch--attack"></i>Modeled corrosion</span>
              <span><i class="corrosion-legend-swatch corrosion-legend-swatch--metal"></i>Remaining allowance</span>
            </div>
          </div>
        </div>

        <div class="corrosion-controls-panel">
          <label class="corrosion-slider-label" for="corrosion-years-slider">
            <span>Time in service</span>
            <strong data-corrosion-years>0.0 years</strong>
          </label>
          <input id="corrosion-years-slider" data-corrosion-slider type="range" min="0" max="${config.maxYears}" step="${config.step}" value="0">
          <div class="corrosion-slider-scale" aria-hidden="true">
            <span>0 years</span>
            <span>${escapeHtml(maxYearsText)}</span>
          </div>
          <p class="field-hint">Based on current rate and ${escapeHtml(allowanceText)} allowance.</p>

          <div class="corrosion-metrics-grid" aria-live="polite">
            <div class="corrosion-metric">
              <span>Material loss</span>
              <strong data-corrosion-loss>0.000 mm</strong>
            </div>
            <div class="corrosion-metric">
              <span>Allowance remaining</span>
              <strong data-corrosion-remaining>${escapeHtml(allowanceText)}</strong>
            </div>
            <div class="corrosion-metric">
              <span>Allowance consumed</span>
              <strong data-corrosion-consumed>0.0%</strong>
            </div>
            <div class="corrosion-metric">
              <span>Planning status</span>
              <strong data-corrosion-status-detail>${escapeHtml(initialState.statusDetail)}</strong>
            </div>
          </div>
          ${thicknessProjectionHtml}
        </div>
      </div>
      ${milestonesHtml}
    </section>
  `;
}

function renderThicknessProjection(state) {
  if (!state.hasThicknessProjection) {
    return '';
  }

  const minimumText = Number.isFinite(state.minimumThicknessMm)
    ? formatMm(state.minimumThicknessMm)
    : 'Not specified';
  const marginText = Number.isFinite(state.thicknessMarginMm)
    ? formatMm(state.thicknessMarginMm)
    : 'Not calculated';

  return `
    <div class="corrosion-thickness-panel corrosion-thickness-panel--${state.thicknessStatusKey}" data-corrosion-thickness-panel aria-label="Component thickness projection">
      <div class="corrosion-thickness-heading">
        <span>Component thickness</span>
        <strong data-corrosion-thickness-status>${escapeHtml(state.thicknessStatusLabel)}</strong>
      </div>
      <div class="corrosion-thickness-bar" aria-hidden="true">
        <i data-corrosion-thickness-bar style="width: ${state.visualRemainingThicknessPct}%;"></i>
      </div>
      <div class="corrosion-thickness-grid">
        <div>
          <span>Initial</span>
          <strong>${escapeHtml(formatMm(state.initialThicknessMm))}</strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong data-corrosion-thickness-remaining>${escapeHtml(formatMm(state.remainingThicknessMm))}</strong>
        </div>
        <div>
          <span>Minimum</span>
          <strong>${escapeHtml(minimumText)}</strong>
        </div>
        <div>
          <span>Margin</span>
          <strong data-corrosion-thickness-margin>${escapeHtml(marginText)}</strong>
        </div>
      </div>
      <p data-corrosion-thickness-detail>${escapeHtml(state.thicknessStatusDetail)}</p>
    </div>
  `;
}

function renderInspectionMilestones(result) {
  const milestones = buildInspectionMilestones(result);
  const milestoneHtml = milestones.map(milestone => `
    <article class="corrosion-milestone corrosion-milestone--${escapeHtml(milestone.key)}">
      <span>${milestone.percent}% allowance</span>
      <strong>${escapeHtml(milestone.yearLabel)}</strong>
      <h4>${escapeHtml(milestone.label)}</h4>
      <p>${escapeHtml(milestone.action)}</p>
    </article>
  `).join('');

  return `
    <section class="corrosion-milestones" aria-labelledby="corrosion-milestones-heading">
      <div class="corrosion-card-heading">
        <div>
          <p class="corrosion-timeline-kicker">Action milestones</p>
          <h3 id="corrosion-milestones-heading">Inspection Plan</h3>
        </div>
        <p class="field-hint">Based on current rate and allowance.</p>
      </div>
      <div class="corrosion-milestone-grid">${milestoneHtml}</div>
    </section>
  `;
}

function getCorrosionTimelineConfig(result) {
  const estimatedLifeYears = finiteNumber(result?.estimatedLifeYears, NaN);
  const maxYears = Number.isFinite(estimatedLifeYears) && estimatedLifeYears > 0
    ? round(Math.max(0.1, estimatedLifeYears), 2)
    : 30;
  const step = maxYears <= 1
    ? 0.01
    : maxYears <= 10
      ? 0.1
      : maxYears <= 50
        ? 0.5
        : 1;

  return { maxYears, step };
}

function initCorrosionTimeline(container, result) {
  const slider = container.querySelector('[data-corrosion-slider]');
  if (!slider) {
    return;
  }

  const updateTimeline = () => {
    updateCorrosionTimeline(container, result, Number.parseFloat(slider.value));
  };

  slider.addEventListener('input', updateTimeline);
  updateTimeline();
}

function updateCorrosionTimeline(container, result, years) {
  const state = buildCorrosionTimelineState(result, years);
  const visual = container.querySelector('[data-corrosion-visual]');
  const attackShape = container.querySelector('[data-corrosion-attack-shape]');
  const pits = container.querySelector('[data-corrosion-pits]');
  const status = container.querySelector('[data-corrosion-status]');
  const yearsEl = container.querySelector('[data-corrosion-years]');
  const lossEl = container.querySelector('[data-corrosion-loss]');
  const remainingEl = container.querySelector('[data-corrosion-remaining]');
  const consumedEl = container.querySelector('[data-corrosion-consumed]');
  const detailEl = container.querySelector('[data-corrosion-status-detail]');
  const thicknessPanel = container.querySelector('[data-corrosion-thickness-panel]');
  const thicknessStatusEl = container.querySelector('[data-corrosion-thickness-status]');
  const thicknessBar = container.querySelector('[data-corrosion-thickness-bar]');
  const thicknessRemainingEl = container.querySelector('[data-corrosion-thickness-remaining]');
  const thicknessMarginEl = container.querySelector('[data-corrosion-thickness-margin]');
  const thicknessDetailEl = container.querySelector('[data-corrosion-thickness-detail]');

  if (visual) {
    const pitOpacity = state.visualConsumedPct <= 0
      ? 0
      : Math.max(0.12, Math.min(0.72, state.visualConsumedPct / 100));
    visual.style.setProperty('--corrosion-progress', `${state.visualConsumedPct}%`);
    visual.style.setProperty('--corrosion-pit-opacity', pitOpacity.toFixed(2));
    visual.dataset.status = state.statusKey;
    if (attackShape) {
      attackShape.setAttribute('d', buildCorrosionAttackPath(state.visualConsumedPct));
      attackShape.setAttribute('opacity', state.visualConsumedPct > 0 ? '1' : '0');
    }
    if (pits) {
      pits.setAttribute('opacity', pitOpacity.toFixed(2));
    }
  }
  if (status) {
    status.textContent = state.statusLabel;
    status.className = `corrosion-status-pill corrosion-status-pill--${state.statusKey}`;
  }
  if (yearsEl) {
    yearsEl.textContent = formatYears(state.elapsedYears);
  }
  if (lossEl) {
    const overage = state.overAllowanceMm > 0 ? ` (+${formatMm(state.overAllowanceMm)} over)` : '';
    lossEl.textContent = `${formatMm(state.materialLossMm)}${overage}`;
  }
  if (remainingEl) {
    remainingEl.textContent = formatMm(state.remainingAllowanceMm);
  }
  if (consumedEl) {
    consumedEl.textContent = `${state.allowanceConsumedPct.toFixed(1)}%`;
  }
  if (detailEl) {
    detailEl.textContent = state.statusDetail;
  }
  if (thicknessPanel && state.hasThicknessProjection) {
    thicknessPanel.className = `corrosion-thickness-panel corrosion-thickness-panel--${state.thicknessStatusKey}`;
  }
  if (thicknessStatusEl && state.hasThicknessProjection) {
    thicknessStatusEl.textContent = state.thicknessStatusLabel;
  }
  if (thicknessBar && state.hasThicknessProjection) {
    thicknessBar.style.width = `${state.visualRemainingThicknessPct}%`;
  }
  if (thicknessRemainingEl && state.hasThicknessProjection) {
    thicknessRemainingEl.textContent = formatMm(state.remainingThicknessMm);
  }
  if (thicknessMarginEl && state.hasThicknessProjection) {
    thicknessMarginEl.textContent = Number.isFinite(state.thicknessMarginMm)
      ? formatMm(state.thicknessMarginMm)
      : 'Not calculated';
  }
  if (thicknessDetailEl && state.hasThicknessProjection) {
    thicknessDetailEl.textContent = state.thicknessStatusDetail;
  }
}

function buildCorrosionAttackPath(progressPct) {
  const progress = Math.min(100, Math.max(0, finiteNumber(progressPct, 0))) / 100;
  const left = 4;
  const top = 16;
  const bottom = 112;
  const fullWidth = 592;
  const front = left + (fullWidth * progress);

  if (progress <= 0) {
    return `M ${left} ${top} L ${left} ${bottom} L ${left} ${bottom} L ${left} ${top} Z`;
  }

  const notch = Math.min(28, Math.max(10, fullWidth * 0.05));
  const inset = Math.max(left, front - notch);

  return [
    `M ${left} ${top}`,
    `L ${front.toFixed(2)} ${top}`,
    `L ${inset.toFixed(2)} 28`,
    `L ${front.toFixed(2)} 41`,
    `L ${inset.toFixed(2)} 54`,
    `L ${front.toFixed(2)} 68`,
    `L ${inset.toFixed(2)} 82`,
    `L ${front.toFixed(2)} 96`,
    `L ${inset.toFixed(2)} ${bottom}`,
    `L ${left} ${bottom}`,
    'Z'
  ].join(' ');
}

function formatYears(value) {
  const years = finiteNumber(value, 0);
  const precision = years < 10 ? 1 : 0;
  return `${years.toFixed(precision)} years`;
}

function formatLifeYears(value) {
  if (!Number.isFinite(value)) {
    return 'No measurable galvanic consumption';
  }
  return formatYears(value);
}

function formatMm(value) {
  const mm = finiteNumber(value, 0);
  const precision = mm < 1 ? 3 : 2;
  return `${mm.toFixed(precision)} mm`;
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) {
    return 'not specified';
  }
  const rounded = round(value, decimals);
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(decimals);
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toISOString();
}
