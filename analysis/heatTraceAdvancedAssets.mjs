import { runHeatTraceSizingAnalysis } from './heatTraceSizing.mjs';

export const HEAT_TRACE_ADVANCED_VERSION = 'heat-trace-advanced-assets-v1';

const ASSET_TYPES = new Set(['pipe', 'tank', 'vessel', 'skid', 'custom']);
const CABLE_STARTUP_MULTIPLIERS = {
  selfRegulating: 3,
  constantWattage: 1.15,
  powerLimiting: 2.4,
  mineralInsulated: 1.05,
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value, fallback = 0) {
  const parsed = number(value, NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deriveResult(caseItem = {}) {
  if (caseItem.result && Number.isFinite(caseItem.result.installedTotalWatts ?? caseItem.result.totalCircuitWatts)) {
    return caseItem.result;
  }
  if (!caseItem.inputs || typeof caseItem.inputs !== 'object') return null;
  try {
    return runHeatTraceSizingAnalysis(caseItem.inputs);
  } catch {
    return null;
  }
}

function sourceValue(caseItem = {}, key, fallback = '') {
  const advanced = asObject(caseItem.advancedHeatTrace || caseItem.advanced);
  return caseItem[key] ?? advanced[key] ?? fallback;
}

function normalizeHazardousArea(value = {}) {
  const row = asObject(value);
  return {
    enabled: Boolean(row.enabled || row.classification || row.tRatingTargetC || row.tClass),
    classification: String(row.classification || row.areaClass || ''),
    group: String(row.group || ''),
    tRatingTargetC: positive(row.tRatingTargetC ?? row.maxSurfaceTempC, 0),
    tClass: String(row.tClass || ''),
    notes: String(row.notes || ''),
  };
}

function normalizeControlMetadata(value = {}) {
  const row = asObject(value);
  return {
    controllerType: String(row.controllerType || row.type || ''),
    controlMode: String(row.controlMode || row.mode || ''),
    sensorCount: number(row.sensorCount, row.sensorLocation || row.sensorLocations ? 1 : 0),
    sensorLocation: String(row.sensorLocation || row.sensorLocations || ''),
    highLimitSensor: Boolean(row.highLimitSensor || row.highLimit || row.highLimitLocation),
    highLimitLocation: String(row.highLimitLocation || ''),
    setpointC: number(row.setpointC, NaN),
    deadbandC: number(row.deadbandC, NaN),
    notes: String(row.notes || ''),
  };
}

function normalizeStartupBasis(value = {}) {
  const row = asObject(value);
  return {
    minimumAmbientC: number(row.minimumAmbientC, NaN),
    coldStartMultiplier: positive(row.coldStartMultiplier, 0),
    diversityFactor: positive(row.diversityFactor, 1),
    warmupHours: positive(row.warmupHours, 0),
    notes: String(row.notes || ''),
  };
}

function defaultSegmentFromCase(caseData = {}) {
  const result = caseData.result || {};
  const inputs = caseData.inputs || {};
  return {
    id: 'segment-1',
    label: caseData.assetTag || caseData.name || 'Segment 1',
    assetType: caseData.assetType,
    lengthFt: positive(result.effectiveTraceLengthFt ?? result.lineLengthFt ?? inputs.lineLengthFt, 0),
    areaSqFt: positive(caseData.surfaceAreaSqFt ?? inputs.surfaceAreaSqFt, 0),
    insulationType: inputs.insulationType || '',
    insulationThicknessIn: positive(inputs.insulationThicknessIn, 0),
    ambientTempC: number(inputs.ambientTempC, NaN),
    maintainTempC: number(inputs.maintainTempC, NaN),
    exposure: inputs.environment || '',
    cableType: result.heatTraceCableType || inputs.heatTraceCableType || 'selfRegulating',
    wattDensityWPerFt: positive(result.recommendedCableRatingWPerFt ?? result.selectedWPerFt, 0),
    runCount: positive(result.traceRunCount ?? inputs.traceRunCount, 1),
    requiredWatts: positive(result.totalCircuitWatts, 0),
    installedWatts: positive(result.installedTotalWatts, 0),
    notes: '',
  };
}

export function normalizeHeatTraceSegmentRows(rows = [], options = {}) {
  const fallback = defaultSegmentFromCase(options.caseData || {});
  const sourceRows = asArray(rows).length ? rows : [fallback];
  return sourceRows.map((row, index) => {
    const item = asObject(row);
    const assetType = String(item.assetType || options.assetType || fallback.assetType || 'pipe');
    if (!ASSET_TYPES.has(assetType)) {
      throw new Error(`Unsupported heat trace asset type "${assetType}"`);
    }
    const lengthFt = positive(item.lengthFt ?? item.length, fallback.lengthFt);
    const areaSqFt = positive(item.areaSqFt ?? item.surfaceAreaSqFt, fallback.areaSqFt);
    const cableType = String(item.cableType || item.heatTraceCableType || fallback.cableType || 'selfRegulating');
    const runCount = positive(item.runCount ?? item.traceRunCount, fallback.runCount || 1);
    const wattDensityWPerFt = positive(item.wattDensityWPerFt ?? item.selectedWPerFt, fallback.wattDensityWPerFt);
    const wattDensityWPerSqFt = positive(item.wattDensityWPerSqFt, 0);
    const requiredWatts = positive(item.requiredWatts, 0);
    const installedWatts = positive(item.installedWatts, 0);
    const warnings = [];
    if (asArray(rows).length && item.insulationThicknessIn == null) warnings.push('Missing insulation thickness for segment.');
    if (asArray(rows).length && !item.insulationType) warnings.push('Missing insulation type for segment.');
    if (asArray(rows).length && item.ambientTempC == null) warnings.push('Missing ambient temperature for segment.');
    if (!positive(item.insulationThicknessIn, fallback.insulationThicknessIn)) warnings.push('Missing insulation thickness for segment.');
    if (!String(item.insulationType || fallback.insulationType || '')) warnings.push('Missing insulation type for segment.');
    if (!Number.isFinite(number(item.ambientTempC, fallback.ambientTempC))) warnings.push('Missing ambient temperature for segment.');
    if (assetType !== 'pipe' && areaSqFt <= 0) warnings.push(`${assetType} segment uses screening fallback; provide surface area for final review.`);
    return {
      id: String(item.id || `segment-${index + 1}`),
      label: String(item.label || item.name || fallback.label || `Segment ${index + 1}`),
      assetType,
      lengthFt: round(lengthFt, 2),
      areaSqFt: round(areaSqFt, 2),
      insulationType: String(item.insulationType || fallback.insulationType || ''),
      insulationThicknessIn: round(positive(item.insulationThicknessIn, fallback.insulationThicknessIn), 3),
      ambientTempC: round(number(item.ambientTempC, fallback.ambientTempC), 2),
      maintainTempC: round(number(item.maintainTempC, fallback.maintainTempC), 2),
      exposure: String(item.exposure || item.environment || fallback.exposure || ''),
      cableType,
      wattDensityWPerFt: round(wattDensityWPerFt, 3),
      wattDensityWPerSqFt: round(wattDensityWPerSqFt, 3),
      runCount: round(runCount, 0),
      requiredWatts: round(requiredWatts || (assetType === 'pipe' ? wattDensityWPerFt * lengthFt : Math.max(4, wattDensityWPerSqFt || 6) * Math.max(areaSqFt, lengthFt)), 2),
      installedWatts: round(installedWatts || (wattDensityWPerSqFt > 0 ? wattDensityWPerSqFt * Math.max(areaSqFt, 1) * runCount : wattDensityWPerFt * Math.max(lengthFt, 1) * runCount), 2),
      notes: String(item.notes || ''),
      warnings,
    };
  });
}

export function normalizeHeatTraceAssetCase(input = {}) {
  const result = deriveResult(input);
  const assetType = String(sourceValue(input, 'assetType', 'pipe') || 'pipe');
  if (!ASSET_TYPES.has(assetType)) {
    throw new Error(`Unsupported heat trace asset type "${assetType}"`);
  }
  const caseData = {
    id: String(input.id || input.name || 'heat-trace-asset'),
    name: String(input.name || input.pipeTag || input.assetTag || 'Heat Trace Asset'),
    assetType,
    assetTag: String(sourceValue(input, 'assetTag', input.pipeTag || input.name || '')),
    pipeTag: String(input.pipeTag || ''),
    service: String(input.service || ''),
    area: String(input.area || ''),
    sourcePanel: String(input.sourcePanel || 'Unassigned'),
    controllerTag: String(input.controllerTag || 'Unassigned'),
    circuitNumber: String(input.circuitNumber || ''),
    panelPhase: String(sourceValue(input, 'panelPhase', 'unassigned') || 'unassigned'),
    diversityGroup: String(sourceValue(input, 'diversityGroup', '') || ''),
    advancedNotes: String(sourceValue(input, 'advancedNotes', '')),
    inputs: asObject(input.inputs),
    result,
    hazardousArea: normalizeHazardousArea(sourceValue(input, 'hazardousArea', {})),
    controlMetadata: normalizeControlMetadata(sourceValue(input, 'controlMetadata', {})),
    startupBasis: normalizeStartupBasis(sourceValue(input, 'startupBasis', {})),
  };
  caseData.advancedSegments = normalizeHeatTraceSegmentRows(
    sourceValue(input, 'advancedSegments', []),
    { caseData, assetType }
  );
  return caseData;
}

export function evaluateHeatTraceAssetCase(caseData = {}, options = {}) {
  const normalized = caseData.advancedSegments ? caseData : normalizeHeatTraceAssetCase(caseData);
  const warnings = [];
  const segmentRows = normalized.advancedSegments.map(segment => {
    const coverageRatio = segment.requiredWatts > 0 ? segment.installedWatts / segment.requiredWatts : 0;
    const status = coverageRatio < 1 ? 'fail' : segment.warnings.length ? 'warn' : 'pass';
    return {
      caseId: normalized.id,
      assetTag: normalized.assetTag || normalized.name,
      ...segment,
      coverageRatio: round(coverageRatio, 3),
      status,
      recommendation: status === 'fail'
        ? 'Increase watt density, run count, insulation performance, or split the circuit.'
        : status === 'warn'
          ? 'Complete segment inputs and verify manufacturer design basis.'
          : 'Segment screening load is covered by installed trace output.',
    };
  });
  segmentRows.forEach(segment => segment.warnings.forEach(message => warnings.push({ source: segment.label, message })));
  if (normalized.assetType !== 'pipe') warnings.push({ source: normalized.assetTag || normalized.name, message: `${normalized.assetType} heat trace is screening-only and requires manufacturer/software verification.` });
  if (normalized.hazardousArea.enabled) warnings.push({ source: normalized.assetTag || normalized.name, message: 'Hazardous-area T-rating, sheath temperature, and approval basis require manufacturer verification.' });

  const requiredWatts = segmentRows.reduce((sum, row) => sum + row.requiredWatts, 0);
  const installedWatts = segmentRows.reduce((sum, row) => sum + row.installedWatts, 0);
  const failCount = segmentRows.filter(row => row.status === 'fail').length;
  const warnCount = segmentRows.filter(row => row.status === 'warn').length;
  return {
    assetRow: {
      id: normalized.id,
      assetTag: normalized.assetTag || normalized.name,
      assetType: normalized.assetType,
      service: normalized.service,
      area: normalized.area,
      sourcePanel: normalized.sourcePanel,
      controllerTag: normalized.controllerTag,
      circuitNumber: normalized.circuitNumber,
      panelPhase: normalized.panelPhase,
      diversityGroup: normalized.diversityGroup,
      requiredWatts: round(requiredWatts, 2),
      installedWatts: round(installedWatts, 2),
      loadAmps: round(installedWatts / positive(normalized.result?.voltageV ?? normalized.inputs?.voltageV, 240), 2),
      segmentCount: segmentRows.length,
      status: failCount ? 'fail' : warnings.length || warnCount ? 'warn' : 'pass',
      recommendation: failCount ? 'Resolve under-covered heat-trace segments before release.' : 'Verify final cable, controls, sheath temperature, and T-rating with manufacturer data.',
      notes: normalized.advancedNotes,
    },
    segmentRows,
    warnings,
  };
}

export function buildHeatTraceStartupProfile(caseData = {}, options = {}) {
  const normalized = caseData.advancedSegments ? caseData : normalizeHeatTraceAssetCase(caseData);
  const evaluation = evaluateHeatTraceAssetCase(normalized, options);
  const voltage = positive(normalized.result?.voltageV ?? normalized.inputs?.voltageV, 240);
  const minAmbient = Number.isFinite(normalized.startupBasis.minimumAmbientC)
    ? normalized.startupBasis.minimumAmbientC
    : Math.min(...evaluation.segmentRows.map(row => row.ambientTempC).filter(Number.isFinite), normalized.inputs?.ambientTempC ?? 0);
  return evaluation.segmentRows.map(row => {
    const baseMultiplier = normalized.startupBasis.coldStartMultiplier || CABLE_STARTUP_MULTIPLIERS[row.cableType] || 2;
    const coldAdder = minAmbient <= -30 ? 0.7 : minAmbient <= -10 ? 0.35 : 0;
    const multiplier = round(baseMultiplier + coldAdder, 2);
    const runningAmps = row.installedWatts / voltage;
    const diversityFactor = normalized.startupBasis.diversityFactor || 1;
    const startupAmps = runningAmps * multiplier * diversityFactor;
    return {
      caseId: normalized.id,
      assetTag: normalized.assetTag || normalized.name,
      segmentId: row.id,
      segmentLabel: row.label,
      cableType: row.cableType,
      minimumAmbientC: round(minAmbient, 2),
      runningAmps: round(runningAmps, 2),
      coldStartMultiplier: multiplier,
      diversityFactor: round(diversityFactor, 3),
      startupAmps: round(startupAmps, 2),
      status: startupAmps >= 40 || multiplier >= 3.5 ? 'warn' : 'pass',
      recommendation: startupAmps >= 40 || multiplier >= 3.5
        ? 'Verify cold-start current, breaker sizing, and panel diversity against manufacturer tables.'
        : 'Startup current is a screening estimate; confirm with manufacturer data.',
    };
  });
}

export function buildHeatTraceControlRows(caseData = {}, options = {}) {
  const normalized = caseData.advancedSegments ? caseData : normalizeHeatTraceAssetCase(caseData);
  const cableTypes = new Set(normalized.advancedSegments.map(row => row.cableType));
  const missing = [];
  if (!normalized.controlMetadata.controllerType) missing.push('controllerType');
  if (!normalized.controlMetadata.controlMode) missing.push('controlMode');
  if (normalized.controlMetadata.sensorCount <= 0 || !normalized.controlMetadata.sensorLocation) missing.push('sensorLocation');
  const warnings = [];
  if (cableTypes.has('constantWattage') && !normalized.controlMetadata.highLimitSensor) warnings.push('Constant-wattage circuits should define high-limit sensing or over-temperature protection.');
  if (normalized.hazardousArea.enabled && !normalized.hazardousArea.tRatingTargetC && !normalized.hazardousArea.tClass) warnings.push('Hazardous area record is missing T-rating target.');
  if (!normalized.panelPhase || normalized.panelPhase === 'unassigned') warnings.push('Panel phase is not assigned for load diversity review.');
  return [{
    caseId: normalized.id,
    assetTag: normalized.assetTag || normalized.name,
    controllerTag: normalized.controllerTag,
    controllerType: normalized.controlMetadata.controllerType,
    controlMode: normalized.controlMetadata.controlMode,
    sensorCount: normalized.controlMetadata.sensorCount,
    sensorLocation: normalized.controlMetadata.sensorLocation,
    highLimitSensor: normalized.controlMetadata.highLimitSensor,
    highLimitLocation: normalized.controlMetadata.highLimitLocation,
    setpointC: Number.isFinite(normalized.controlMetadata.setpointC) ? round(normalized.controlMetadata.setpointC, 2) : null,
    deadbandC: Number.isFinite(normalized.controlMetadata.deadbandC) ? round(normalized.controlMetadata.deadbandC, 2) : null,
    hazardousClassification: normalized.hazardousArea.classification,
    tRatingTargetC: normalized.hazardousArea.tRatingTargetC || null,
    tClass: normalized.hazardousArea.tClass,
    status: missing.length ? 'missingData' : warnings.length ? 'warn' : 'pass',
    missingFields: missing,
    warnings,
    recommendation: missing.length || warnings.length
      ? 'Complete controller, sensor, high-limit, hazardous-area, and panel-phase metadata before release.'
      : 'Control metadata is ready for manufacturer verification.',
  }];
}

function buildPanelDiversityRows(assetRows = [], startupRows = []) {
  const groups = new Map();
  assetRows.forEach(row => {
    const key = `${row.sourcePanel || 'Unassigned'}::${row.panelPhase || 'unassigned'}::${row.diversityGroup || 'none'}`;
    const group = groups.get(key) || {
      sourcePanel: row.sourcePanel || 'Unassigned',
      panelPhase: row.panelPhase || 'unassigned',
      diversityGroup: row.diversityGroup || 'none',
      assetCount: 0,
      connectedKw: 0,
      runningAmps: 0,
      startupAmps: 0,
      status: 'pass',
    };
    group.assetCount += 1;
    group.connectedKw += row.installedWatts / 1000;
    group.runningAmps += row.loadAmps;
    startupRows.filter(start => start.caseId === row.id).forEach(start => { group.startupAmps += start.startupAmps; });
    if (group.panelPhase === 'unassigned') group.status = 'missingData';
    if (group.startupAmps >= 80) group.status = 'warn';
    groups.set(key, group);
  });
  return Array.from(groups.values()).map(row => ({
    ...row,
    connectedKw: round(row.connectedKw, 3),
    runningAmps: round(row.runningAmps, 2),
    startupAmps: round(row.startupAmps, 2),
    recommendation: row.status === 'missingData'
      ? 'Assign panel phase for diversity and balance review.'
      : row.status === 'warn'
        ? 'Review startup diversity and branch breaker/panel loading.'
        : 'Panel diversity screening row is complete.',
  }));
}

export function buildHeatTraceAdvancedPackage({
  projectName = 'Untitled Project',
  circuitCases = [],
  activeResult = null,
  activeInputs = null,
  approval = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const cases = asArray(circuitCases);
  const packageCases = cases.length ? cases : (activeResult ? [{ id: 'active', name: 'Active heat-trace case', inputs: activeInputs || activeResult, result: activeResult }] : []);
  const normalizedCases = packageCases.map(normalizeHeatTraceAssetCase);
  const evaluations = normalizedCases.map(evaluateHeatTraceAssetCase);
  const assetRows = evaluations.map(item => item.assetRow);
  const segmentRows = evaluations.flatMap(item => item.segmentRows);
  const startupProfileRows = normalizedCases.flatMap(buildHeatTraceStartupProfile);
  const controlRows = normalizedCases.flatMap(buildHeatTraceControlRows);
  const panelDiversityRows = buildPanelDiversityRows(assetRows, startupProfileRows);
  const warnings = [
    ...evaluations.flatMap(item => item.warnings),
    ...controlRows.flatMap(row => [
      ...row.missingFields.map(field => ({ source: row.assetTag, message: `Missing control field: ${field}.` })),
      ...row.warnings.map(message => ({ source: row.assetTag, message })),
    ]),
    ...startupProfileRows.filter(row => row.status === 'warn').map(row => ({ source: row.assetTag, message: row.recommendation })),
    ...panelDiversityRows.filter(row => row.status !== 'pass').map(row => ({ source: row.sourcePanel, message: row.recommendation })),
  ];
  return {
    version: HEAT_TRACE_ADVANCED_VERSION,
    generatedAt,
    projectName,
    summary: {
      assetCount: assetRows.length,
      segmentCount: segmentRows.length,
      startupRowCount: startupProfileRows.length,
      controlRowCount: controlRows.length,
      panelDiversityRowCount: panelDiversityRows.length,
      totalInstalledKw: round(assetRows.reduce((sum, row) => sum + row.installedWatts, 0) / 1000, 3),
      totalStartupAmps: round(startupProfileRows.reduce((sum, row) => sum + row.startupAmps, 0), 2),
      fail: assetRows.filter(row => row.status === 'fail').length + segmentRows.filter(row => row.status === 'fail').length,
      warn: assetRows.filter(row => row.status === 'warn').length + segmentRows.filter(row => row.status === 'warn').length + startupProfileRows.filter(row => row.status === 'warn').length,
      missingData: controlRows.filter(row => row.status === 'missingData').length + panelDiversityRows.filter(row => row.status === 'missingData').length,
      warningCount: warnings.length,
      approvalStatus: approval?.status || 'pending',
    },
    assetRows,
    segmentRows,
    startupProfileRows,
    controlRows,
    panelDiversityRows,
    warnings,
    assumptions: [
      'Advanced heat-trace tank, vessel, skid, and multi-segment results are deterministic screening estimates.',
      'Startup current, sheath temperature, hazardous-area T-rating, and maximum circuit length require manufacturer verification.',
      'Controller and sensor rows are planning metadata and do not replace final control panel or field commissioning documentation.',
    ],
    approval: approval || { status: 'pending' },
  };
}

function renderRows(headers, rows) {
  if (!rows.length) return '<p>No rows.</p>';
  return `<table><thead><tr>${headers.map(h => `<th>${esc(h.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map(h => `<td>${esc(row[h.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export function renderHeatTraceAdvancedHTML(pkg = {}) {
  return `<section class="heat-trace-advanced-package">
    <h2>Heat Trace Advanced Assets and Controls</h2>
    <p>Generated ${esc(pkg.generatedAt || '')} for ${esc(pkg.projectName || 'Untitled Project')}.</p>
    <dl>
      <dt>Assets</dt><dd>${esc(pkg.summary?.assetCount || 0)}</dd>
      <dt>Segments</dt><dd>${esc(pkg.summary?.segmentCount || 0)}</dd>
      <dt>Installed kW</dt><dd>${esc(pkg.summary?.totalInstalledKw || 0)}</dd>
      <dt>Startup A</dt><dd>${esc(pkg.summary?.totalStartupAmps || 0)}</dd>
      <dt>Warnings</dt><dd>${esc(pkg.summary?.warningCount || 0)}</dd>
    </dl>
    <h3>Asset Rows</h3>
    ${renderRows([
      { key: 'assetTag', label: 'Asset' },
      { key: 'assetType', label: 'Type' },
      { key: 'controllerTag', label: 'Controller' },
      { key: 'panelPhase', label: 'Phase' },
      { key: 'installedWatts', label: 'Installed W' },
      { key: 'status', label: 'Status' },
    ], asArray(pkg.assetRows))}
    <h3>Segment Rows</h3>
    ${renderRows([
      { key: 'assetTag', label: 'Asset' },
      { key: 'label', label: 'Segment' },
      { key: 'assetType', label: 'Type' },
      { key: 'installedWatts', label: 'Installed W' },
      { key: 'requiredWatts', label: 'Required W' },
      { key: 'status', label: 'Status' },
    ], asArray(pkg.segmentRows))}
    <h3>Startup Profile</h3>
    ${renderRows([
      { key: 'assetTag', label: 'Asset' },
      { key: 'segmentLabel', label: 'Segment' },
      { key: 'coldStartMultiplier', label: 'Multiplier' },
      { key: 'startupAmps', label: 'Startup A' },
      { key: 'status', label: 'Status' },
    ], asArray(pkg.startupProfileRows))}
    <h3>Control Rows</h3>
    ${renderRows([
      { key: 'assetTag', label: 'Asset' },
      { key: 'controllerTag', label: 'Controller' },
      { key: 'controlMode', label: 'Mode' },
      { key: 'sensorLocation', label: 'Sensor Location' },
      { key: 'status', label: 'Status' },
    ], asArray(pkg.controlRows))}
    <h3>Warnings</h3>
    ${asArray(pkg.warnings).length ? `<ul>${asArray(pkg.warnings).map(row => `<li>${esc(row.source || 'Heat Trace')}: ${esc(row.message || row)}</li>`).join('')}</ul>` : '<p>No advanced heat-trace warnings.</p>'}
    <h3>Assumptions</h3>
    <ul>${asArray(pkg.assumptions).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
  </section>`;
}
