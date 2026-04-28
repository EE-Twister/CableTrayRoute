import {
  STANDARD_XFMR_KVA,
  minimizeCostConductors,
  sizeFeeder,
  sizeFeederFromKw,
  sizeTransformer,
} from './autoSize.mjs';

export const TRANSFORMER_FEEDER_SIZING_VERSION = 'transformer-feeder-sizing-v1';

const LOAD_SOURCES = new Set(['manual', 'loadDemandGovernance', 'panel', 'serviceGroup']);
const PHASES = new Set(['1ph', '3ph']);
const MATERIALS = new Set(['copper', 'aluminum']);
const INSTALLATION_TYPES = new Set(['conduit', 'tray_spaced', 'tray_touching']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'on', 'enabled'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function round(value, digits = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function warning(code, message, severity = 'warning', source = {}) {
  return { code, message, severity, source };
}

function validateEnum(value, set, fallback, label) {
  const normalized = normalizeText(value || fallback);
  if (!set.has(normalized)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return normalized;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function kvaFromKw(kw, pf = 0.9) {
  const safePf = pf > 0 && pf <= 1 ? pf : 0.9;
  return kw / safePf;
}

function currentFromKva(kva, voltage, phase) {
  if (!kva || !voltage) return 0;
  const phaseFactor = phase === '1ph' ? 1 : Math.sqrt(3);
  return (kva * 1000) / (phaseFactor * voltage);
}

export function normalizeTransformerFeederSizingCase(input = {}) {
  const source = asObject(input);
  const loadSource = validateEnum(source.loadSource || source.source, LOAD_SOURCES, 'manual', 'loadSource');
  const phase = validateEnum(source.phase, PHASES, '3ph', 'phase');
  const transformerPhase = validateEnum(source.transformerPhase || phase, PHASES, phase, 'transformerPhase');
  const material = validateEnum(source.material, MATERIALS, 'copper', 'material');
  const installationType = validateEnum(source.installationType, INSTALLATION_TYPES, 'conduit', 'installationType');
  const powerFactor = toNumber(source.powerFactor ?? source.pf, 0.9);
  if (powerFactor != null && (powerFactor <= 0 || powerFactor > 1)) {
    throw new Error('Power factor must be between 0 and 1');
  }
  const tempRating = toNumber(source.tempRating, 75);
  if (![60, 75, 90].includes(tempRating)) throw new Error('Invalid tempRating');
  const futureGrowthPct = toNumber(source.futureGrowthPct, 0);
  const emergencyOverloadPct = toNumber(source.emergencyOverloadPct, 0);
  const maxParallel = Math.max(1, Math.min(6, toNumber(source.maxParallel, 4) || 4));
  return {
    caseId: normalizeText(source.caseId || source.id || 'default'),
    caseName: normalizeText(source.caseName || source.name || 'Transformer / Feeder Sizing Case'),
    loadSource,
    panelId: normalizeText(source.panelId || source.panel || ''),
    serviceGroup: normalizeText(source.serviceGroup || ''),
    loadKw: toNumber(source.loadKw ?? source.kw, null),
    loadKva: toNumber(source.loadKva ?? source.kva, null),
    powerFactor: powerFactor || 0.9,
    voltage: toNumber(source.voltage, 480) || 480,
    phase,
    continuous: bool(source.continuous, true),
    futureGrowthPct: Number.isFinite(futureGrowthPct) ? futureGrowthPct : 0,
    emergencyOverloadEnabled: bool(source.emergencyOverloadEnabled, false),
    emergencyOverloadPct: Number.isFinite(emergencyOverloadPct) ? emergencyOverloadPct : 0,
    primaryVoltage: toNumber(source.primaryVoltage, 480) || 480,
    secondaryVoltage: toNumber(source.secondaryVoltage, source.voltage ?? 208) || 208,
    transformerPhase,
    impedancePct: toNumber(source.impedancePct, null),
    bilKv: toNumber(source.bilKv, null),
    temperatureRiseC: toNumber(source.temperatureRiseC, null),
    coolingClass: normalizeText(source.coolingClass || ''),
    tapRangePct: toNumber(source.tapRangePct, null),
    tapTargetVoltage: toNumber(source.tapTargetVoltage, null),
    standardSizeLibrary: normalizeText(source.standardSizeLibrary || 'NEMA preferred'),
    material,
    tempRating,
    ambientTempC: toNumber(source.ambientTempC, 30) || 30,
    bundledConductors: Math.max(1, toNumber(source.bundledConductors, 3) || 3),
    installationType,
    maxParallel,
    protectionBasisNote: normalizeText(source.protectionBasisNote || ''),
    transformerBasisNote: normalizeText(source.transformerBasisNote || ''),
    feederBasisNote: normalizeText(source.feederBasisNote || ''),
    notes: normalizeText(source.notes || ''),
  };
}

export function buildSizingLoadBasis({ loadDemandGovernance = null, loads = [], panels = [], manualLoad = {}, caseData = {} } = {}) {
  const studyCase = normalizeTransformerFeederSizingCase({ ...manualLoad, ...caseData });
  const demand = asObject(loadDemandGovernance);
  let sourceLabel = 'Manual load entry';
  let baseKw = studyCase.loadKw;
  let baseKva = studyCase.loadKva;
  let sourceStatus = 'manual';
  const sourceWarnings = [];

  if (studyCase.loadSource === 'loadDemandGovernance') {
    if (demand.summary?.governedDemandKva || demand.summary?.governedDemandKw) {
      baseKw = toNumber(demand.summary.governedDemandKw, baseKw);
      baseKva = toNumber(demand.summary.governedDemandKva, null) ?? kvaFromKw(baseKw || 0, studyCase.powerFactor);
      sourceLabel = 'Saved load demand-governance package';
      sourceStatus = 'governed';
    } else {
      sourceWarnings.push(warning('missingLoadDemandGovernance', 'Load demand-governance source was selected but no saved governed-demand package was available.', 'warning'));
    }
  }

  if (studyCase.loadSource === 'panel') {
    const row = asArray(demand.panelRows).find(panel => [panel.panelId, panel.panelTag].includes(studyCase.panelId));
    if (row) {
      baseKw = toNumber(row.governedDemandKw, baseKw);
      baseKva = toNumber(row.governedDemandKva, null) ?? kvaFromKw(baseKw || 0, studyCase.powerFactor);
      sourceLabel = `Panel demand row ${row.panelTag || row.panelId}`;
      sourceStatus = row.status || 'panel';
    } else {
      const panel = asArray(panels).find(item => [item.id, item.ref, item.tag, item.description].map(normalizeText).includes(studyCase.panelId));
      if (panel) sourceLabel = `Panel ${studyCase.panelId} manual fallback`;
      sourceWarnings.push(warning('missingPanelDemandRow', `Panel load source ${studyCase.panelId || '(blank)'} did not match a governed panel demand row.`, 'warning'));
    }
  }

  if (studyCase.loadSource === 'serviceGroup') {
    const groupId = studyCase.serviceGroup || 'default';
    const row = asArray(demand.serviceRows).find(service => (service.serviceGroup || 'default') === groupId);
    if (row) {
      baseKw = toNumber(row.governedDemandKw, baseKw);
      baseKva = toNumber(row.governedDemandKva, null) ?? kvaFromKw(baseKw || 0, studyCase.powerFactor);
      sourceLabel = `Service group ${groupId}`;
      sourceStatus = row.status || 'serviceGroup';
    } else {
      sourceWarnings.push(warning('missingServiceDemandRow', `Service group ${groupId} did not match a governed service demand row.`, 'warning'));
    }
  }

  if ((baseKva == null || baseKva <= 0) && baseKw != null && baseKw > 0) {
    baseKva = kvaFromKw(baseKw, studyCase.powerFactor);
  }
  if ((baseKw == null || baseKw <= 0) && baseKva != null && baseKva > 0) {
    baseKw = baseKva * studyCase.powerFactor;
  }
  if (!baseKva || baseKva <= 0) {
    sourceWarnings.push(warning('missingLoadBasis', 'No valid kW/kVA load basis was available for transformer/feeder sizing.', 'error'));
  }

  const growthFactor = 1 + Math.max(0, studyCase.futureGrowthPct) / 100;
  const designKva = round((baseKva || 0) * growthFactor, 3);
  const designKw = round((baseKw || 0) * growthFactor, 3);
  return {
    source: studyCase.loadSource,
    sourceLabel,
    sourceStatus,
    baseKw: round(baseKw || 0, 3),
    baseKva: round(baseKva || 0, 3),
    futureGrowthPct: studyCase.futureGrowthPct,
    designKw,
    designKva,
    powerFactor: studyCase.powerFactor,
    voltage: studyCase.voltage,
    phase: studyCase.phase,
    continuous: studyCase.continuous,
    warnings: sourceWarnings,
    loadCount: asArray(loads).length,
  };
}

export function buildTransformerSizingAlternatives(caseData = {}, options = {}) {
  const studyCase = normalizeTransformerFeederSizingCase(caseData);
  const loadBasis = options.loadBasis || buildSizingLoadBasis({ caseData: studyCase });
  const warnings = [];
  if (!loadBasis.designKva || loadBasis.designKva <= 0) {
    return { transformerRows: [], alternativeRows: [], protectionRows: [], tapRows: [], warnings: [...loadBasis.warnings] };
  }
  const selected = sizeTransformer({
    loadKva: loadBasis.designKva,
    primaryVoltage: studyCase.primaryVoltage,
    secondaryVoltage: studyCase.secondaryVoltage,
    phase: studyCase.transformerPhase,
  });
  const series = STANDARD_XFMR_KVA[studyCase.transformerPhase] || STANDARD_XFMR_KVA['3ph'];
  const alternativeRows = series
    .filter(kva => kva >= loadBasis.designKva * 0.75 && kva <= Math.max(loadBasis.designKva * 1.8, selected.xfmrKva))
    .map(kva => {
      const loadPct = loadBasis.designKva > 0 ? (loadBasis.designKva / kva) * 100 : 0;
      const emergencyLimitPct = studyCase.emergencyOverloadEnabled ? 100 + Math.max(0, studyCase.emergencyOverloadPct) : 100;
      const status = kva === selected.xfmrKva
        ? 'selected'
        : kva < loadBasis.designKva
          ? 'rejected'
          : loadPct <= 100 ? 'acceptable' : 'review';
      const reason = kva < loadBasis.designKva
        ? 'Below design kVA after load basis and growth.'
        : kva === selected.xfmrKva
          ? 'Smallest standard transformer at or above design kVA.'
          : 'Larger standard option retained for owner/manufacturer review.';
      return {
        recordType: 'transformerAlternative',
        kva,
        loadPct: round(loadPct, 2),
        emergencyLimitPct,
        status,
        reason,
      };
    });
  const loadPct = round((loadBasis.designKva / selected.xfmrKva) * 100, 2);
  const transformerStatus = loadPct > 100 ? 'fail' : loadPct > 95 ? 'warn' : 'pass';
  if (studyCase.impedancePct == null) warnings.push(warning('missingTransformerImpedance', 'Transformer impedance percent is not recorded for downstream short-circuit review.', 'warning'));
  if (studyCase.bilKv == null) warnings.push(warning('missingTransformerBIL', 'Transformer BIL is not recorded.', 'warning'));
  if (studyCase.temperatureRiseC == null) warnings.push(warning('missingTemperatureRise', 'Transformer temperature-rise basis is not recorded.', 'warning'));
  if (studyCase.emergencyOverloadEnabled) warnings.push(warning('emergencyOverloadReview', 'Emergency/overload transformer allowance is a planning annotation requiring manufacturer review.', 'warning'));

  const transformerRows = [{
    id: studyCase.caseId,
    caseName: studyCase.caseName,
    loadSource: loadBasis.source,
    designKva: loadBasis.designKva,
    selectedKva: selected.xfmrKva,
    loadPct,
    status: transformerStatus,
    primaryVoltage: studyCase.primaryVoltage,
    secondaryVoltage: studyCase.secondaryVoltage,
    phase: studyCase.transformerPhase,
    impedancePct: studyCase.impedancePct,
    bilKv: studyCase.bilKv,
    temperatureRiseC: studyCase.temperatureRiseC,
    coolingClass: studyCase.coolingClass,
    emergencyOverloadEnabled: studyCase.emergencyOverloadEnabled,
    emergencyOverloadPct: studyCase.emergencyOverloadPct,
    recommendation: transformerStatus === 'pass'
      ? 'Selected standard transformer meets the governed sizing basis.'
      : 'Review transformer size, load basis, or growth/emergency assumptions.',
  }];

  const protectionRows = [{
    deviceSide: 'primary',
    voltage: studyCase.primaryVoltage,
    ratedCurrentA: selected.primaryRatedAmps,
    requiredOcpdA: selected.primaryOcpdRequired,
    selectedOcpdA: selected.primaryOcpdRating,
    basis: selected.nec?.primaryRule || 'NEC 450 primary protection screening',
    notes: studyCase.protectionBasisNote,
    status: selected.primaryOcpdRating ? 'pass' : 'missingData',
  }, {
    deviceSide: 'secondary',
    voltage: studyCase.secondaryVoltage,
    ratedCurrentA: selected.secondaryRatedAmps,
    requiredOcpdA: selected.secondaryOcpdRequired,
    selectedOcpdA: selected.secondaryOcpdRating,
    basis: selected.nec?.secondaryRule || 'NEC 450 secondary protection screening',
    notes: studyCase.protectionBasisNote,
    status: selected.secondaryOcpdRating ? 'pass' : 'missingData',
  }];

  const tapRows = [{
    targetVoltage: studyCase.tapTargetVoltage,
    tapRangePct: studyCase.tapRangePct,
    nominalSecondaryVoltage: studyCase.secondaryVoltage,
    status: studyCase.tapTargetVoltage && studyCase.tapRangePct != null ? 'review' : 'missingData',
    recommendation: studyCase.tapTargetVoltage && studyCase.tapRangePct != null
      ? 'Verify tap selection with load-flow voltage profile before release.'
      : 'Record tap range and target secondary voltage when transformer taps drive sizing basis.',
  }];

  return { transformerRows, alternativeRows, protectionRows, tapRows, warnings: [...loadBasis.warnings, ...warnings] };
}

export function buildFeederSizingAlternatives(caseData = {}, options = {}) {
  const studyCase = normalizeTransformerFeederSizingCase(caseData);
  const loadBasis = options.loadBasis || buildSizingLoadBasis({ caseData: studyCase });
  const warnings = [...asArray(loadBasis.warnings)];
  if (!loadBasis.designKva || loadBasis.designKva <= 0) {
    return { feederRows: [], alternativeRows: [], warnings };
  }
  const designCurrentA = currentFromKva(loadBasis.designKva, studyCase.secondaryVoltage || studyCase.voltage, studyCase.phase);
  let result;
  try {
    if (loadBasis.designKw > 0) {
      result = sizeFeederFromKw({
        kw: loadBasis.designKw,
        pf: studyCase.powerFactor,
        voltage: studyCase.secondaryVoltage || studyCase.voltage,
        phase: studyCase.phase,
        continuous: studyCase.continuous,
        material: studyCase.material,
        tempRating: studyCase.tempRating,
        ambientTempC: studyCase.ambientTempC,
        bundledConductors: studyCase.bundledConductors,
        installationType: studyCase.installationType,
      });
    } else {
      result = sizeFeeder({
        loadAmps: designCurrentA,
        continuous: studyCase.continuous,
        material: studyCase.material,
        tempRating: studyCase.tempRating,
        ambientTempC: studyCase.ambientTempC,
        bundledConductors: studyCase.bundledConductors,
        installationType: studyCase.installationType,
      });
    }
  } catch (error) {
    warnings.push(warning('feederSizingError', error.message || String(error), 'error'));
    return { feederRows: [], alternativeRows: [], warnings };
  }
  const status = result.error ? 'missingData' : result.installedAmpacity < result.requiredAmps ? 'fail' : 'pass';
  if (result.error) warnings.push(warning('feederSizingIncomplete', result.error, 'error'));
  if (!studyCase.feederBasisNote) warnings.push(warning('missingFeederBasisNote', 'Feeder conductor/protection basis note is blank.', 'warning'));
  const costOptions = result.requiredAmps
    ? minimizeCostConductors(result.requiredAmps, studyCase.tempRating, {
      ambientTempC: studyCase.ambientTempC,
      bundledConductors: studyCase.bundledConductors,
      installationType: studyCase.installationType,
      allowAluminum: true,
      maxParallel: studyCase.maxParallel,
    })
    : [];
  const feederRows = [{
    id: studyCase.caseId,
    caseName: studyCase.caseName,
    loadSource: loadBasis.source,
    designKw: loadBasis.designKw,
    designKva: loadBasis.designKva,
    designCurrentA: round(result.loadAmps || designCurrentA, 2),
    requiredAmpacityA: result.requiredAmps || 0,
    conductorSize: result.conductorSize || '',
    conductorAmpacityA: result.conductorAmpacity || 0,
    installedAmpacityA: result.installedAmpacity || 0,
    ocpdRatingA: result.ocpdRating || '',
    material: studyCase.material,
    tempRating: studyCase.tempRating,
    installationType: studyCase.installationType,
    ambientTempC: studyCase.ambientTempC,
    bundledConductors: studyCase.bundledConductors,
    status,
    recommendation: status === 'pass'
      ? 'Feeder conductor and OCPD selection meet the screening basis.'
      : 'Review feeder conductor, parallel sets, derating, or load basis.',
  }];
  const alternativeRows = costOptions.map((row, index) => ({
    recordType: 'feederAlternative',
    rank: index + 1,
    configuration: `${row.nParallel}x ${row.size} ${row.material}`,
    material: row.material,
    nParallel: row.nParallel,
    conductorSize: row.size,
    installedAmpacityA: row.installedAmpacity,
    costPerFtPerPhase: row.costPerFtPerPhase,
    status: row.material === studyCase.material && row.size === result.conductorSize && row.nParallel === 1 ? 'selected' : 'acceptable',
    reason: index === 0 ? 'Lowest estimated cost option meeting ampacity screening.' : 'Alternative conductor arrangement meeting ampacity screening.',
  }));
  return { feederRows, alternativeRows, warnings };
}

export function evaluateTransformerFeederSizingCase(context = {}, options = {}) {
  const studyCase = normalizeTransformerFeederSizingCase(context.studyCase || context.caseBasis || context);
  const loadBasis = buildSizingLoadBasis({
    loadDemandGovernance: context.loadDemandGovernance,
    loads: context.loads,
    panels: context.panels,
    manualLoad: context.manualLoad || {},
    caseData: studyCase,
  });
  const transformer = buildTransformerSizingAlternatives(studyCase, { ...options, loadBasis });
  const feeder = buildFeederSizingAlternatives(studyCase, { ...options, loadBasis });
  const alternativeRows = [...asArray(transformer.alternativeRows), ...asArray(feeder.alternativeRows)];
  const warningRows = [...asArray(transformer.warnings), ...asArray(feeder.warnings)]
    .filter((row, index, rows) => rows.findIndex(other => other.code === row.code && other.message === row.message) === index);
  const transformerRows = asArray(transformer.transformerRows);
  const feederRows = asArray(feeder.feederRows);
  const fail = [...transformerRows, ...feederRows].filter(row => row.status === 'fail').length;
  const missingData = [...transformerRows, ...feederRows, ...asArray(transformer.tapRows), ...warningRows].filter(row => row.status === 'missingData' || row.severity === 'error' || /missing/i.test(row.code || '')).length;
  const warn = [...transformerRows, ...feederRows].filter(row => row.status === 'warn').length
    + warningRows.filter(row => row.severity === 'warning').length;
  return {
    caseBasis: studyCase,
    loadBasis,
    transformerRows,
    feederRows,
    alternativeRows,
    protectionRows: asArray(transformer.protectionRows),
    tapRows: asArray(transformer.tapRows),
    warningRows,
    summary: {
      transformerCount: transformerRows.length,
      feederCount: feederRows.length,
      alternativeCount: alternativeRows.length,
      selectedTransformerKva: transformerRows[0]?.selectedKva || 0,
      selectedFeederConductor: feederRows[0]?.conductorSize || '',
      designKva: loadBasis.designKva,
      designKw: loadBasis.designKw,
      fail,
      warn,
      missingData,
      warningCount: warningRows.length,
      status: fail > 0 ? 'fail' : missingData > 0 || warn > 0 ? 'review' : 'pass',
    },
  };
}

export function buildTransformerFeederSizingPackage(context = {}) {
  const evaluated = evaluateTransformerFeederSizingCase(context);
  return {
    version: TRANSFORMER_FEEDER_SIZING_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || 'Untitled Project',
    ...evaluated,
    assumptions: [
      'Transformer and feeder sizing is deterministic engineering-screening output based on local project data.',
      'Standard transformer sizes use the existing NEMA-aligned preferred kVA library; manufacturer catalog verification remains required.',
      'Emergency/overload ratings, tap targets, impedance, BIL, and temperature-rise values are reported as audit basis data, not procurement certification.',
      'Feeder conductor and OCPD selections reuse the existing NEC screening engine and do not replace project-specific code review.',
    ],
  };
}

function renderRows(rows = [], columns = []) {
  if (!rows.length) return `<tr><td colspan="${columns.length}">No rows.</td></tr>`;
  return rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(column.render ? column.render(row) : row[column.key])}</td>`).join('')}</tr>`).join('');
}

export function renderTransformerFeederSizingHTML(pkg = {}) {
  const transformerColumns = [
    { key: 'caseName' },
    { key: 'designKva' },
    { key: 'selectedKva' },
    { key: 'loadPct' },
    { key: 'impedancePct' },
    { key: 'bilKv' },
    { key: 'temperatureRiseC' },
    { key: 'status' },
  ];
  const feederColumns = [
    { key: 'caseName' },
    { key: 'designCurrentA' },
    { key: 'requiredAmpacityA' },
    { key: 'conductorSize' },
    { key: 'installedAmpacityA' },
    { key: 'ocpdRatingA' },
    { key: 'status' },
  ];
  const alternativeColumns = [
    { key: 'recordType' },
    { key: 'kva', render: row => row.kva || row.configuration || '' },
    { key: 'status' },
    { key: 'reason' },
  ];
  const warningColumns = [
    { key: 'severity' },
    { key: 'code' },
    { key: 'message' },
  ];
  return `<section class="report-section" id="rpt-transformer-feeder-sizing">
  <h2>Transformer and Feeder Sizing Basis</h2>
  <p class="report-note">Local deterministic transformer/feeder sizing screening package. Final code, coordination, and manufacturer verification remain required.</p>
  <dl class="report-dl">
    <dt>Project</dt><dd>${escapeHtml(pkg.projectName || 'Untitled Project')}</dd>
    <dt>Load Source</dt><dd>${escapeHtml(pkg.loadBasis?.sourceLabel || pkg.caseBasis?.loadSource || '')}</dd>
    <dt>Design kVA</dt><dd>${escapeHtml(pkg.summary?.designKva || 0)}</dd>
    <dt>Selected Transformer</dt><dd>${escapeHtml(pkg.summary?.selectedTransformerKva || 0)} kVA</dd>
    <dt>Feeder</dt><dd>${escapeHtml(pkg.summary?.selectedFeederConductor || '')}</dd>
    <dt>Status</dt><dd>${escapeHtml(pkg.summary?.status || 'review')}</dd>
  </dl>
  <h3>Transformer Rows</h3>
  <div class="report-scroll"><table class="report-table">
    <thead><tr>${transformerColumns.map(column => `<th>${escapeHtml(column.key)}</th>`).join('')}</tr></thead>
    <tbody>${renderRows(asArray(pkg.transformerRows), transformerColumns)}</tbody>
  </table></div>
  <h3>Feeder Rows</h3>
  <div class="report-scroll"><table class="report-table">
    <thead><tr>${feederColumns.map(column => `<th>${escapeHtml(column.key)}</th>`).join('')}</tr></thead>
    <tbody>${renderRows(asArray(pkg.feederRows), feederColumns)}</tbody>
  </table></div>
  <h3>Alternatives</h3>
  <div class="report-scroll"><table class="report-table">
    <thead><tr>${alternativeColumns.map(column => `<th>${escapeHtml(column.key)}</th>`).join('')}</tr></thead>
    <tbody>${renderRows(asArray(pkg.alternativeRows), alternativeColumns)}</tbody>
  </table></div>
  <h3>Warnings</h3>
  <div class="report-scroll"><table class="report-table">
    <thead><tr>${warningColumns.map(column => `<th>${escapeHtml(column.key)}</th>`).join('')}</tr></thead>
    <tbody>${renderRows(asArray(pkg.warningRows), warningColumns)}</tbody>
  </table></div>
</section>`;
}
