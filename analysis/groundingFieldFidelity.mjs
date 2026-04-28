export const GROUNDING_FIELD_FIDELITY_VERSION = 'grounding-field-fidelity-v1';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value, fallback = null) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value, fallback = null) {
  const parsed = finiteNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeStatus(status = 'pass') {
  if (['fail', 'invalid', 'error'].includes(status)) return 'fail';
  if (['warn', 'warning', 'review'].includes(status)) return 'warn';
  if (['missing', 'missingData', 'notRun'].includes(status)) return 'missingData';
  return 'pass';
}

function worstStatus(statuses = []) {
  const rows = statuses.map(normalizeStatus);
  if (rows.includes('fail')) return 'fail';
  if (rows.includes('warn')) return 'warn';
  if (rows.includes('missingData')) return 'missingData';
  return 'pass';
}

function normalizeSoilRows(rows = []) {
  return asArray(rows)
    .map((row, index) => {
      const spacingM = positive(row.spacingM ?? row.spacing ?? row.aM ?? row.a);
      const apparentResistivityOhmM = positive(row.apparentResistivityOhmM ?? row.rhoA ?? row.rho ?? row.resistivity);
      if (!spacingM) throw new Error(`Field soil measurement ${index + 1} has invalid spacing`);
      if (!apparentResistivityOhmM) throw new Error(`Field soil measurement ${index + 1} has invalid apparent resistivity`);
      return {
        id: row.id || `soil-field-${index + 1}`,
        method: String(row.method || row.testMethod || 'wenner').toLowerCase() === 'schlumberger' ? 'schlumberger' : 'wenner',
        spacingM: round(spacingM, 4),
        apparentResistivityOhmM: round(apparentResistivityOhmM, 3),
        source: row.source || row.testId || '',
        season: row.season || '',
        notes: row.notes || '',
      };
    })
    .sort((a, b) => a.spacingM - b.spacingM || a.id.localeCompare(b.id));
}

export function normalizeFallOfPotentialRows(rows = []) {
  return asArray(rows).map((row, index) => {
    const probeSpacingM = positive(row.probeSpacingM ?? row.spacingM ?? row.probeSpacing);
    const measuredResistanceOhm = positive(row.measuredResistanceOhm ?? row.resistanceOhm ?? row.r);
    const curveDeviationPct = finiteNumber(row.curveDeviationPct ?? row.deviationPct ?? row.stabilityPct, null);
    const warnings = [];
    if (!probeSpacingM) warnings.push('Probe spacing is required.');
    if (!measuredResistanceOhm) warnings.push('Measured resistance is required.');
    if (!Number.isFinite(curveDeviationPct)) warnings.push('Curve deviation percent is required.');
    return {
      id: row.id || `fop-${index + 1}`,
      testId: row.testId || row.id || `FOP-${index + 1}`,
      probeSpacingM: round(probeSpacingM, 3),
      currentProbeM: round(positive(row.currentProbeM ?? row.currentProbeDistanceM, probeSpacingM), 3),
      potentialProbeM: round(positive(row.potentialProbeM ?? row.potentialProbeDistanceM, probeSpacingM ? probeSpacingM * 0.62 : null), 3),
      measuredResistanceOhm: round(measuredResistanceOhm, 4),
      curveDeviationPct: round(curveDeviationPct, 2),
      location: row.location || '',
      notes: row.notes || '',
      warnings,
      valid: warnings.length === 0,
    };
  });
}

export function evaluateFallOfPotentialTests(rows = [], options = {}) {
  const stablePct = positive(options.stableDeviationPct, 5);
  const reviewPct = positive(options.reviewDeviationPct, 10);
  return normalizeFallOfPotentialRows(rows).map(row => {
    let status = 'pass';
    const warnings = [...row.warnings];
    if (!row.valid) {
      status = 'fail';
    } else if (row.curveDeviationPct > reviewPct) {
      status = 'fail';
      warnings.push(`Fall-of-potential curve deviation ${row.curveDeviationPct}% exceeds ${reviewPct}%.`);
    } else if (row.curveDeviationPct > stablePct) {
      status = 'warn';
      warnings.push(`Fall-of-potential curve deviation ${row.curveDeviationPct}% exceeds the ${stablePct}% stable threshold.`);
    }
    return {
      ...row,
      status,
      recommendation: status === 'fail'
        ? 'Repeat field test with longer probe spacing or review interference before using resistance for final design.'
        : status === 'warn'
          ? 'Review curve stability and field notes before accepting the resistance value.'
          : 'Fall-of-potential curve stability is acceptable for screening documentation.',
      warnings,
    };
  });
}

export function evaluateSoilMeasurementCoverage({ measurements = [], geometry = null } = {}) {
  const rows = normalizeSoilRows(measurements);
  const width = positive(geometry?.bounds?.width, positive(geometry?.widthM ?? geometry?.lengthM, 0)) || 0;
  const height = positive(geometry?.bounds?.height, positive(geometry?.heightM ?? geometry?.widthM, 0)) || 0;
  const extentM = Math.max(width, height, Math.sqrt(positive(geometry?.areaM2, 0) || 0));
  const requiredMaxSpacingM = extentM > 0 ? extentM / 2 : null;
  const minSpacingM = rows.length ? Math.min(...rows.map(row => row.spacingM)) : null;
  const maxSpacingM = rows.length ? Math.max(...rows.map(row => row.spacingM)) : null;
  const spacingCoveragePct = requiredMaxSpacingM && maxSpacingM ? Math.min(150, (maxSpacingM / requiredMaxSpacingM) * 100) : null;
  const warnings = [];
  let status = 'pass';
  if (!rows.length) {
    status = 'missingData';
    warnings.push('No soil resistivity field measurements are available for coverage QA.');
  } else {
    if (rows.length < 4) warnings.push('Fewer than four soil measurement spacings are available.');
    if (requiredMaxSpacingM && maxSpacingM < requiredMaxSpacingM) warnings.push('Maximum soil measurement spacing does not reach half of the grounding footprint extent.');
    if (minSpacingM && extentM && minSpacingM > extentM / 20) warnings.push('Small-spacing soil data may be too sparse for surface-layer interpretation.');
    status = warnings.length ? 'warn' : 'pass';
  }
  return {
    measurementCount: rows.length,
    minSpacingM: round(minSpacingM, 3),
    maxSpacingM: round(maxSpacingM, 3),
    requiredMaxSpacingM: round(requiredMaxSpacingM, 3),
    footprintExtentM: round(extentM || null, 3),
    spacingCoveragePct: round(spacingCoveragePct, 1),
    status,
    warnings,
    recommendation: status === 'pass'
      ? 'Soil measurement spacing coverage is acceptable for screening documentation.'
      : 'Collect additional Wenner/Schlumberger measurements across small and large spacings before final grounding issue.',
  };
}

export function buildSeasonalSoilScenarios({ soilModel = {}, measurements = [], seasonalInputs = {}, riskPoints = [] } = {}) {
  const enabled = seasonalInputs.enabled === true || asArray(seasonalInputs.scenarios).length > 0;
  if (!enabled) {
    return [];
  }
  const baseRho = positive(soilModel.rho1, null)
    || positive(asArray(measurements)[0]?.apparentResistivityOhmM, null)
    || positive(seasonalInputs.nominalRhoOhmM, null);
  const scenarioRows = asArray(seasonalInputs.scenarios).length
    ? seasonalInputs.scenarios
    : [
      { id: 'wet', label: 'Wet season', multiplier: seasonalInputs.wetMultiplier ?? 0.75 },
      { id: 'nominal', label: 'Nominal season', multiplier: seasonalInputs.nominalMultiplier ?? 1 },
      { id: 'dry', label: 'Dry season', multiplier: seasonalInputs.dryMultiplier ?? 1.35 },
    ];
  return scenarioRows.map((scenario, index) => {
    const multiplier = positive(scenario.multiplier, index === 0 ? 1 : null);
    const rhoOhmM = positive(scenario.rhoOhmM ?? scenario.rho, baseRho && multiplier ? baseRho * multiplier : null);
    const adjustedPoints = asArray(riskPoints).map(point => {
      const ratio = Number.isFinite(point.ratio)
        ? point.ratio * (rhoOhmM && baseRho ? rhoOhmM / baseRho : 1)
        : null;
      const status = !Number.isFinite(ratio) ? 'missingData' : ratio > 1 ? 'fail' : ratio >= 0.85 ? 'warn' : 'pass';
      return {
        id: point.id,
        label: point.label,
        check: point.check,
        ratio: round(ratio, 4),
        status,
      };
    });
    const status = worstStatus(adjustedPoints.map(point => point.status));
    return {
      id: scenario.id || `season-${index + 1}`,
      label: scenario.label || scenario.name || `Season ${index + 1}`,
      multiplier: round(rhoOhmM && baseRho ? rhoOhmM / baseRho : multiplier, 3),
      rhoOhmM: round(rhoOhmM, 3),
      status,
      failCount: adjustedPoints.filter(point => point.status === 'fail').length,
      warnCount: adjustedPoints.filter(point => point.status === 'warn').length,
      pointStatuses: adjustedPoints,
      recommendation: status === 'fail'
        ? 'Seasonal soil scenario produces failed grounding risk points; verify dry/wet assumptions or revise the grounding design.'
        : status === 'warn'
          ? 'Seasonal soil scenario is near screening limits; add margin or field verification.'
          : 'Seasonal soil scenario remains within screening limits.',
    };
  });
}

export function normalizeGroundingFidelityControls(input = {}) {
  const boundaryExtensionM = finiteNumber(input.boundaryExtensionM ?? input.boundaryExtension, 0);
  const contourDensity = positive(input.contourDensity ?? input.contourCount, 25);
  const inspectionPointSpacingM = positive(input.inspectionPointSpacingM ?? input.pointSpacingM, null);
  const meshResolutionLabel = String(input.meshResolutionLabel || input.meshResolution || 'screening');
  return {
    boundaryExtensionM: round(Math.max(0, boundaryExtensionM), 3),
    contourDensity: Math.max(5, Math.round(contourDensity)),
    inspectionPointSpacingM: round(inspectionPointSpacingM, 3),
    meshResolutionLabel,
    finiteElementModeled: false,
    conductorCurrentDistributionMode: input.conductorCurrentDistributionMode || 'uniform-screening',
    transferredPotentialPaths: asArray(input.transferredPotentialPaths).map((path, index) => ({
      id: path.id || `transfer-${index + 1}`,
      label: path.label || path.name || `Transferred path ${index + 1}`,
      target: path.target || path.system || '',
      distanceM: round(positive(path.distanceM ?? path.distance, 0), 3),
      notes: path.notes || '',
      status: 'review',
    })),
    warnings: ['Finite-element grounding simulation is not modeled in v1; fidelity controls are documented screening assumptions.'],
  };
}

export function normalizeGroundingFieldData(input = {}) {
  const soilMeasurements = normalizeSoilRows(input.soilMeasurements || input.measurements || []);
  const fallOfPotentialRows = normalizeFallOfPotentialRows(input.fallOfPotentialRows || input.fallOfPotential || []);
  const seasonalInputs = input.seasonalInputs || {};
  const personnelProtection = {
    bodyWeightKg: positive(input.personnelProtection?.bodyWeightKg ?? input.bodyWeightKg, 70),
    bodyImpedanceOhm: positive(input.personnelProtection?.bodyImpedanceOhm ?? input.bodyImpedanceOhm, null),
    gloveClass: input.personnelProtection?.gloveClass || input.gloveClass || '',
    footwear: input.personnelProtection?.footwear || input.footwear || '',
    contactResistanceOhm: positive(input.personnelProtection?.contactResistanceOhm ?? input.contactResistanceOhm, null),
    en50522Review: Boolean(input.personnelProtection?.en50522Review ?? input.en50522Review),
    notes: input.personnelProtection?.notes || input.personnelNotes || '',
  };
  return {
    soilMeasurements,
    fallOfPotentialRows,
    seasonalInputs,
    personnelProtection,
    fidelityControls: normalizeGroundingFidelityControls(input.fidelityControls || input),
  };
}

export function buildGroundingFieldFidelityPackage(context = {}) {
  const generatedAt = context.generatedAt || new Date().toISOString();
  const fieldData = normalizeGroundingFieldData(context.fieldData || context);
  const geometry = context.geometry || context.advancedGrounding?.geometry || null;
  const soilModel = context.soilModel || context.advancedGrounding?.soilModel || {};
  const riskPoints = asArray(context.riskPoints || context.advancedGrounding?.riskPoints);
  const measurementCoverage = evaluateSoilMeasurementCoverage({
    measurements: fieldData.soilMeasurements,
    geometry,
  });
  const fallOfPotentialRows = evaluateFallOfPotentialTests(fieldData.fallOfPotentialRows);
  const seasonalScenarios = buildSeasonalSoilScenarios({
    soilModel,
    measurements: fieldData.soilMeasurements,
    seasonalInputs: fieldData.seasonalInputs,
    riskPoints,
  });
  const fidelityControls = fieldData.fidelityControls;
  const warningRows = [
    ...measurementCoverage.warnings.map((message, index) => ({
      id: `coverage-${index + 1}`,
      category: 'soilCoverage',
      severity: measurementCoverage.status === 'missingData' ? 'warning' : 'review',
      message,
      recommendation: measurementCoverage.recommendation,
    })),
    ...fallOfPotentialRows.flatMap(row => asArray(row.warnings).map((message, index) => ({
      id: `${row.id}-warning-${index + 1}`,
      category: 'fallOfPotential',
      severity: row.status === 'fail' ? 'warning' : 'review',
      message: `${row.testId}: ${message}`,
      recommendation: row.recommendation,
    }))),
    ...seasonalScenarios
      .filter(row => row.status === 'fail' || row.status === 'warn')
      .map(row => ({
        id: `seasonal-${row.id}`,
        category: 'seasonalSoil',
        severity: row.status === 'fail' ? 'warning' : 'review',
        message: `${row.label} seasonal soil scenario is ${row.status}.`,
        recommendation: row.recommendation,
      })),
    ...fidelityControls.transferredPotentialPaths.map(path => ({
      id: `transfer-${path.id}`,
      category: 'transferredPotential',
      severity: 'review',
      message: `${path.label} transferred-potential path requires review.`,
      recommendation: 'Review external metallic paths, isolation, bonds, and transferred-voltage exposure before final issue.',
    })),
    ...(fieldData.personnelProtection.en50522Review ? [{
      id: 'personnel-protection-en50522',
      category: 'personnelProtection',
      severity: 'review',
      message: 'Personnel protection assumptions are flagged for EN 50522 or project-standard review.',
      recommendation: 'Confirm body-weight basis, glove/footwear assumptions, contact resistance, and site safety standard before final issue.',
    }] : []),
    ...fidelityControls.warnings.map((message, index) => ({
      id: `fidelity-${index + 1}`,
      category: 'modelFidelity',
      severity: 'review',
      message,
      recommendation: 'Document screening limitations and use specialist grounding software when project risk requires detailed numerical modeling.',
    })),
  ];
  const statuses = [
    measurementCoverage.status,
    ...fallOfPotentialRows.map(row => row.status),
    ...seasonalScenarios.map(row => row.status),
  ];
  return {
    version: GROUNDING_FIELD_FIDELITY_VERSION,
    generatedAt,
    projectName: context.projectName || 'Ground Grid Analysis',
    summary: {
      status: worstStatus(statuses),
      measurementCount: measurementCoverage.measurementCount,
      fallOfPotentialCount: fallOfPotentialRows.length,
      seasonalScenarioCount: seasonalScenarios.length,
      transferredPathCount: fidelityControls.transferredPotentialPaths.length,
      warningCount: warningRows.length,
    },
    measurementCoverage,
    fallOfPotentialRows,
    seasonalScenarios,
    personnelProtection: fieldData.personnelProtection,
    fidelityControls,
    warningRows,
    assumptions: [
      'Grounding field-fidelity output is a deterministic QA layer for local engineering review.',
      'Seasonal soil and personnel protection modifiers are screening assumptions and do not replace project-specific safety-standard review.',
      'Finite-element, conductor current distribution, and full transferred-potential numerical modeling are not performed in v1.',
    ],
  };
}

export function renderGroundingFieldFidelityHTML(pkg = {}) {
  const summary = pkg.summary || {};
  const coverage = pkg.measurementCoverage || {};
  const fallRows = asArray(pkg.fallOfPotentialRows);
  const seasonalRows = asArray(pkg.seasonalScenarios);
  const warningRows = asArray(pkg.warningRows);
  return `<section class="report-section" id="rpt-grounding-field-fidelity">
  <h2>Grounding Field Data and Fidelity</h2>
  <p class="report-note">Field-test QA and fidelity controls are screening records only; this is not a finite-element grounding simulation.</p>
  <dl class="report-dl">
    <dt>Status</dt><dd>${escapeHtml(summary.status || 'missingData')}</dd>
    <dt>Soil Measurements</dt><dd>${escapeHtml(summary.measurementCount || 0)}</dd>
    <dt>Fall-of-Potential Tests</dt><dd>${escapeHtml(summary.fallOfPotentialCount || 0)}</dd>
    <dt>Seasonal Scenarios</dt><dd>${escapeHtml(summary.seasonalScenarioCount || 0)}</dd>
    <dt>Coverage</dt><dd>${escapeHtml(coverage.spacingCoveragePct ?? '—')}%</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Test</th><th>Probe Spacing</th><th>Resistance</th><th>Deviation %</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${fallRows.length ? fallRows.map(row => `<tr>
        <td>${escapeHtml(row.testId)}</td>
        <td>${escapeHtml(row.probeSpacingM ?? '—')}</td>
        <td>${escapeHtml(row.measuredResistanceOhm ?? '—')}</td>
        <td>${escapeHtml(row.curveDeviationPct ?? '—')}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="6">No fall-of-potential test rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Season</th><th>rho</th><th>Multiplier</th><th>Status</th><th>Fail</th><th>Warn</th><th>Recommendation</th></tr></thead>
      <tbody>${seasonalRows.length ? seasonalRows.map(row => `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${escapeHtml(row.rhoOhmM ?? '—')}</td>
        <td>${escapeHtml(row.multiplier ?? '—')}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.failCount || 0)}</td>
        <td>${escapeHtml(row.warnCount || 0)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="7">No seasonal scenarios enabled.</td></tr>'}</tbody>
    </table>
  </div>
  ${warningRows.length ? `<div class="report-scroll"><table class="report-table">
    <thead><tr><th>Category</th><th>Severity</th><th>Warning</th><th>Recommendation</th></tr></thead>
    <tbody>${warningRows.map(row => `<tr>
      <td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.severity)}</td><td>${escapeHtml(row.message)}</td><td>${escapeHtml(row.recommendation)}</td>
    </tr>`).join('')}</tbody>
  </table></div>` : '<p class="report-empty">No grounding field-fidelity warnings.</p>'}
</section>`;
}
