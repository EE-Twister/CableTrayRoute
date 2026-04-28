export const LOAD_DEMAND_GOVERNANCE_VERSION = 'load-demand-governance-v1';

const LOAD_CLASSES = new Set([
  'lighting',
  'receptacle',
  'motor',
  'hvac',
  'process',
  'ev',
  'kitchen',
  'heatTrace',
  'spare',
  'future',
  'generic',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toNumber(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'on', 'continuous'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'off', 'noncontinuous'].includes(normalized)) return false;
  return fallback;
}

function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function normalizeLoadClass(value = '', row = {}) {
  const raw = normalizeText(value || row.loadClass || row.loadType || row.type).replace(/\s+/g, '');
  const normalized = raw ? raw[0].toLowerCase() + raw.slice(1) : '';
  if (LOAD_CLASSES.has(normalized)) return normalized;
  const lower = raw.toLowerCase();
  if (/motor|pump|fan|compressor/.test(lower)) return 'motor';
  if (/light|lighting/.test(lower)) return 'lighting';
  if (/receptacle|plug/.test(lower)) return 'receptacle';
  if (/hvac|ahu|rtu|chiller/.test(lower)) return 'hvac';
  if (/heat.?trace/.test(lower)) return 'heatTrace';
  if (/spare/.test(lower)) return 'spare';
  if (/future/.test(lower)) return 'future';
  return 'generic';
}

function calculateElectrical(row = {}) {
  const quantity = toNumber(row.quantity, 1) || 1;
  const kwEach = toNumber(row.kw ?? row.power, 0) || 0;
  const powerFactor = toNumber(row.powerFactor ?? row.pf, 1) || 1;
  const loadFactorPct = toNumber(row.loadFactor, 100);
  const efficiencyPct = toNumber(row.efficiency, 100);
  const demandFactorPct = toNumber(row.demandFactor ?? row.demandFactorPct, 100);
  const voltage = toNumber(row.voltage, null);
  const phases = toNumber(row.phases, 3) || 3;
  const connectedKw = kwEach * quantity;
  const loadFactorKw = connectedKw * ((loadFactorPct == null ? 100 : loadFactorPct) / 100);
  const inputKw = efficiencyPct && efficiencyPct > 0 ? loadFactorKw / (efficiencyPct / 100) : loadFactorKw;
  const connectedKva = powerFactor ? inputKw / powerFactor : inputKw;
  const demandKw = inputKw * ((demandFactorPct == null ? 100 : demandFactorPct) / 100);
  const demandKva = powerFactor ? demandKw / powerFactor : demandKw;
  const phaseFactor = Number(phases) === 1 ? 1 : Math.sqrt(3);
  const currentA = voltage ? (connectedKva * 1000) / (phaseFactor * voltage) : 0;
  return {
    quantity,
    connectedKw: round(connectedKw),
    connectedKva: round(connectedKva),
    demandKw: round(demandKw),
    demandKva: round(demandKva),
    currentA: round(currentA),
    demandFactorPct: round(demandFactorPct == null ? 100 : demandFactorPct, 2),
    powerFactor: round(powerFactor, 4),
  };
}

function warning(code, message, severity = 'warning', source = {}) {
  return { code, message, severity, source };
}

export function normalizeDemandBasis(input = {}) {
  const basis = asObject(input);
  const largestMotorAdderPct = toNumber(basis.largestMotorAdderPct, 25);
  const spareFutureAllowancePct = toNumber(basis.spareFutureAllowancePct, 0);
  const phaseBalanceLimitPct = toNumber(basis.phaseBalanceLimitPct, 10);
  const measuredDemandKw = toNumber(basis.measuredDemandKw, null);
  return {
    basisId: normalizeText(basis.basisId || basis.id || 'default'),
    codeBasis: normalizeText(basis.codeBasis || basis.demandBasisCode || 'engineering-screening'),
    enableNoncoincidentGroups: basis.enableNoncoincidentGroups !== false,
    applyLargestMotorAdder: basis.applyLargestMotorAdder !== false,
    largestMotorAdderPct: Number.isFinite(largestMotorAdderPct) ? largestMotorAdderPct : 25,
    spareFutureAllowancePct: Number.isFinite(spareFutureAllowancePct) ? spareFutureAllowancePct : 0,
    useMeasuredDemand: bool(basis.useMeasuredDemand, false),
    measuredDemandKw,
    measuredDemandSource: normalizeText(basis.measuredDemandSource || ''),
    phaseBalanceLimitPct: Number.isFinite(phaseBalanceLimitPct) ? phaseBalanceLimitPct : 10,
    notes: normalizeText(basis.notes || basis.demandNotes || ''),
  };
}

export function normalizeLoadDemandRow(row = {}, options = {}) {
  const source = asObject(row);
  const electrical = calculateElectrical(source);
  const loadClass = normalizeLoadClass(source.loadClass, source);
  const continuous = bool(source.continuous, /continuous/i.test(String(source.duty || '')));
  const largestMotorCandidate = bool(source.largestMotorCandidate, loadClass === 'motor');
  const spareFuturePct = toNumber(source.spareFuturePct, 0) || 0;
  const managementLimitKw = toNumber(source.loadManagementLimitKw, null);
  const managedDemandKw = managementLimitKw != null && managementLimitKw >= 0
    ? Math.min(electrical.demandKw, managementLimitKw)
    : electrical.demandKw;
  const managedRatio = electrical.demandKw > 0 ? managedDemandKw / electrical.demandKw : 1;
  const governedDemandKw = managedDemandKw * (1 + spareFuturePct / 100);
  const governedDemandKva = electrical.demandKva * managedRatio * (1 + spareFuturePct / 100);
  const id = normalizeText(source.id || source.ref || source.tag || options.id || '');
  const warnings = [];
  if (!normalizeText(source.loadClass || source.loadType)) {
    warnings.push(warning('missingLoadClass', `${source.tag || id || 'Load'} uses generic load class.`, 'warning', { id }));
  }
  if (electrical.connectedKw > 0 && !normalizeText(source.demandBasisCode || source.demandBasisNote)) {
    warnings.push(warning('missingDemandBasis', `${source.tag || id || 'Load'} is missing demand-basis notes.`, 'warning', { id }));
  }
  if (managementLimitKw != null && managementLimitKw < electrical.demandKw && !normalizeText(source.measuredDemandSource || source.demandBasisNote)) {
    warnings.push(warning('missingMeasuredDemandSource', `${source.tag || id || 'Load'} uses a managed-load limit without a source note.`, 'warning', { id }));
  }
  return {
    id,
    ref: normalizeText(source.ref || ''),
    source: normalizeText(source.source || ''),
    tag: normalizeText(source.tag || id),
    description: normalizeText(source.description || ''),
    panelId: normalizeText(source.panelId || source.panel || source.source || ''),
    circuit: normalizeText(source.circuit || source.breaker || ''),
    loadClass,
    loadType: normalizeText(source.loadType || ''),
    duty: normalizeText(source.duty || ''),
    continuous,
    noncoincidentGroup: normalizeText(source.noncoincidentGroup || ''),
    largestMotorCandidate,
    demandBasisCode: normalizeText(source.demandBasisCode || ''),
    demandBasisNote: normalizeText(source.demandBasisNote || ''),
    measuredDemandSource: normalizeText(source.measuredDemandSource || ''),
    loadManagementLimitKw: managementLimitKw,
    spareFuturePct,
    demandNotes: normalizeText(source.demandNotes || ''),
    quantity: electrical.quantity,
    voltage: toNumber(source.voltage, null),
    phases: toNumber(source.phases, null),
    connectedKw: electrical.connectedKw,
    connectedKva: electrical.connectedKva,
    demandKw: electrical.demandKw,
    demandKva: electrical.demandKva,
    governedDemandKw: round(governedDemandKw),
    governedDemandKva: round(governedDemandKva),
    currentA: electrical.currentA,
    demandFactorPct: electrical.demandFactorPct,
    powerFactor: electrical.powerFactor,
    status: warnings.length ? 'warn' : 'pass',
    warnings,
  };
}

export function buildDemandGroups(loads = [], options = {}) {
  const basis = normalizeDemandBasis(options.basis || options);
  const rows = asArray(loads).map((row, index) => row && row.governedDemandKw != null ? row : normalizeLoadDemandRow(row, { id: `load-${index + 1}` }));
  const groups = new Map();
  rows.forEach(row => {
    if (!row.noncoincidentGroup) return;
    if (!groups.has(row.noncoincidentGroup)) groups.set(row.noncoincidentGroup, []);
    groups.get(row.noncoincidentGroup).push(row);
  });
  return [...groups.entries()].map(([groupId, groupRows]) => {
    const rawDemandKw = groupRows.reduce((sum, row) => sum + row.governedDemandKw, 0);
    const rawDemandKva = groupRows.reduce((sum, row) => sum + row.governedDemandKva, 0);
    const governing = groupRows.reduce((best, row) => !best || row.governedDemandKw > best.governedDemandKw ? row : best, null);
    const governedDemandKw = basis.enableNoncoincidentGroups ? (governing?.governedDemandKw || 0) : rawDemandKw;
    const governedDemandKva = basis.enableNoncoincidentGroups ? (governing?.governedDemandKva || 0) : rawDemandKva;
    return {
      groupId,
      loadCount: groupRows.length,
      rawDemandKw: round(rawDemandKw),
      rawDemandKva: round(rawDemandKva),
      governedDemandKw: round(governedDemandKw),
      governedDemandKva: round(governedDemandKva),
      reductionKw: round(Math.max(0, rawDemandKw - governedDemandKw)),
      governingLoadId: governing?.id || '',
      governingLoadTag: governing?.tag || '',
      status: basis.enableNoncoincidentGroups && groupRows.length > 1 ? 'noncoincident' : 'summed',
    };
  });
}

export function calculateDemandForLoads(loads = [], basisInput = {}) {
  const basis = normalizeDemandBasis(basisInput);
  const loadRows = asArray(loads).map((row, index) => normalizeLoadDemandRow(row, { id: `load-${index + 1}` }));
  const groupRows = buildDemandGroups(loadRows, { basis });
  const grossGovernedKw = loadRows.reduce((sum, row) => sum + row.governedDemandKw, 0);
  const grossGovernedKva = loadRows.reduce((sum, row) => sum + row.governedDemandKva, 0);
  const noncoincidentReductionKw = groupRows.reduce((sum, row) => sum + row.reductionKw, 0);
  const noncoincidentReductionKva = groupRows.reduce((sum, row) => sum + Math.max(0, row.rawDemandKva - row.governedDemandKva), 0);
  const largestMotor = loadRows
    .filter(row => row.largestMotorCandidate)
    .reduce((best, row) => !best || row.governedDemandKw > best.governedDemandKw ? row : best, null);
  const largestMotorAdderKw = basis.applyLargestMotorAdder && largestMotor
    ? largestMotor.governedDemandKw * (basis.largestMotorAdderPct / 100)
    : 0;
  const largestMotorAdderKva = basis.applyLargestMotorAdder && largestMotor
    ? largestMotor.governedDemandKva * (basis.largestMotorAdderPct / 100)
    : 0;
  const preSpareKw = Math.max(0, grossGovernedKw - noncoincidentReductionKw) + largestMotorAdderKw;
  const preSpareKva = Math.max(0, grossGovernedKva - noncoincidentReductionKva) + largestMotorAdderKva;
  const basisSpareKw = preSpareKw * (basis.spareFutureAllowancePct / 100);
  const basisSpareKva = preSpareKva * (basis.spareFutureAllowancePct / 100);
  let governedDemandKw = preSpareKw + basisSpareKw;
  let governedDemandKva = preSpareKva + basisSpareKva;
  if (basis.useMeasuredDemand && basis.measuredDemandKw != null) {
    const kvaRatio = governedDemandKw > 0 ? governedDemandKva / governedDemandKw : 1;
    governedDemandKw = basis.measuredDemandKw;
    governedDemandKva = basis.measuredDemandKw * kvaRatio;
  }
  const warnings = loadRows.flatMap(row => row.warnings);
  if (basis.useMeasuredDemand && basis.measuredDemandKw != null && !basis.measuredDemandSource) {
    warnings.push(warning('missingMeasuredDemandSource', 'Measured demand is selected without a source record.', 'warning'));
  }
  if (loadRows.some(row => row.loadClass === 'motor') && !largestMotor && basis.applyLargestMotorAdder) {
    warnings.push(warning('missingLargestMotorBasis', 'Motor loads exist but no largest-motor candidate was selected.', 'warning'));
  }
  return {
    basis,
    loadRows,
    groupRows,
    summary: {
      loadCount: loadRows.length,
      connectedKw: round(loadRows.reduce((sum, row) => sum + row.connectedKw, 0)),
      connectedKva: round(loadRows.reduce((sum, row) => sum + row.connectedKva, 0)),
      demandKw: round(loadRows.reduce((sum, row) => sum + row.demandKw, 0)),
      demandKva: round(loadRows.reduce((sum, row) => sum + row.demandKva, 0)),
      governedDemandKw: round(governedDemandKw),
      governedDemandKva: round(governedDemandKva),
      noncoincidentReductionKw: round(noncoincidentReductionKw),
      largestMotorAdderKw: round(largestMotorAdderKw),
      spareFutureAllowanceKw: round(basisSpareKw),
      measuredDemandApplied: Boolean(basis.useMeasuredDemand && basis.measuredDemandKw != null),
      continuousCount: loadRows.filter(row => row.continuous).length,
      largestMotorLoadId: largestMotor?.id || '',
      missingBasisCount: loadRows.filter(row => !row.demandBasisCode && !row.demandBasisNote && row.connectedKw > 0).length,
      warningCount: warnings.length,
    },
    warnings,
  };
}

function panelMatchesLoad(panel = {}, load = {}) {
  const panelIds = [
    panel.id,
    panel.ref,
    panel.tag,
    panel.name,
    panel.description,
  ].map(normalizeText).filter(Boolean);
  const loadRefs = [
    load.panelId,
    load.panel,
    load.source,
  ].map(normalizeText).filter(Boolean);
  return panelIds.some(id => loadRefs.includes(id));
}

function phaseLabels(panel = {}) {
  const phases = toNumber(panel.phases, 3) || 3;
  return phases <= 1 ? ['A'] : phases === 2 ? ['A', 'B'] : ['A', 'B', 'C'];
}

function buildPhaseBalanceRow(panel = {}, loadRows = [], basis = {}) {
  const labels = phaseLabels(panel);
  const totals = Object.fromEntries(labels.map(label => [label, 0]));
  loadRows.forEach(row => {
    const circuit = Number.parseInt(row.circuit, 10);
    const label = Number.isFinite(circuit) && circuit > 0
      ? labels[(circuit - 1) % labels.length]
      : labels[0];
    totals[label] = (totals[label] || 0) + row.governedDemandKva;
  });
  const values = Object.values(totals);
  const max = Math.max(0, ...values);
  const min = Math.min(...values.filter(value => value > 0));
  const unbalancePct = max > 0 && Number.isFinite(min) ? ((max - min) / max) * 100 : 0;
  const limit = toNumber(panel.phaseBalanceLimitPct, basis.phaseBalanceLimitPct ?? 10) ?? 10;
  const status = unbalancePct >= limit * 2 ? 'fail' : unbalancePct >= limit ? 'warn' : 'pass';
  return {
    panelId: normalizeText(panel.id || panel.ref || panel.tag || ''),
    panelTag: normalizeText(panel.tag || panel.id || panel.description || ''),
    phases: labels.join('/'),
    totals,
    maxKva: round(max),
    minKva: round(Number.isFinite(min) ? min : 0),
    unbalancePct: round(unbalancePct, 2),
    limitPct: round(limit, 2),
    status,
    recommendation: status === 'pass'
      ? 'Phase balance is within the configured screening limit.'
      : 'Reassign branch circuits or review panel phase loading before release.',
  };
}

export function buildPanelDemandSummary({ panels = [], loads = [], basis = {} } = {}) {
  const baseBasis = normalizeDemandBasis(basis);
  return asArray(panels).map((panel, index) => {
    const panelBasis = normalizeDemandBasis({
      ...baseBasis,
      spareFutureAllowancePct: panel.spareFutureAllowancePct || baseBasis.spareFutureAllowancePct,
      measuredDemandKw: panel.measuredDemandKw || baseBasis.measuredDemandKw,
      measuredDemandSource: panel.measuredDemandSource || baseBasis.measuredDemandSource,
      phaseBalanceLimitPct: panel.phaseBalanceLimitPct || baseBasis.phaseBalanceLimitPct,
      useMeasuredDemand: panel.measuredDemandKw ? true : baseBasis.useMeasuredDemand,
      notes: panel.demandNotes || baseBasis.notes,
    });
    const matchedLoads = asArray(loads).filter(load => panelMatchesLoad(panel, load));
    const demand = calculateDemandForLoads(matchedLoads, panelBasis);
    const phaseBalance = buildPhaseBalanceRow(panel, demand.loadRows, panelBasis);
    const voltage = toNumber(panel.voltage, null);
    const phases = toNumber(panel.phases, 3) || 3;
    const mainRatingA = toNumber(panel.mainRating, null);
    const phaseFactor = phases === 1 ? 1 : Math.sqrt(3);
    const governedCurrentA = voltage && demand.summary.governedDemandKva
      ? (demand.summary.governedDemandKva * 1000) / (phaseFactor * voltage)
      : 0;
    const status = mainRatingA && governedCurrentA > mainRatingA
      ? 'fail'
      : phaseBalance.status === 'fail'
        ? 'fail'
        : phaseBalance.status === 'warn' || demand.warnings.length
          ? 'warn'
          : 'pass';
    return {
      panelId: normalizeText(panel.id || panel.ref || panel.tag || `panel-${index + 1}`),
      panelTag: normalizeText(panel.tag || panel.id || panel.description || `Panel ${index + 1}`),
      serviceGroup: normalizeText(panel.serviceGroup || 'default'),
      loadCount: matchedLoads.length,
      connectedKw: demand.summary.connectedKw,
      connectedKva: demand.summary.connectedKva,
      governedDemandKw: demand.summary.governedDemandKw,
      governedDemandKva: demand.summary.governedDemandKva,
      governedCurrentA: round(governedCurrentA),
      mainRatingA,
      spareFutureAllowancePct: panelBasis.spareFutureAllowancePct,
      measuredDemandKw: panelBasis.measuredDemandKw,
      measuredDemandSource: panelBasis.measuredDemandSource,
      phaseBalance,
      status,
      warnings: demand.warnings,
    };
  });
}

export function buildServiceDemandSummary({ panels = [], loads = [], basis = {} } = {}) {
  const panelRows = buildPanelDemandSummary({ panels, loads, basis });
  const groups = new Map();
  panelRows.forEach(row => {
    const key = row.serviceGroup || 'default';
    if (!groups.has(key)) {
      groups.set(key, {
        serviceGroup: key,
        panelCount: 0,
        loadCount: 0,
        connectedKw: 0,
        connectedKva: 0,
        governedDemandKw: 0,
        governedDemandKva: 0,
        warningCount: 0,
        status: 'pass',
      });
    }
    const target = groups.get(key);
    target.panelCount += 1;
    target.loadCount += row.loadCount;
    target.connectedKw += row.connectedKw;
    target.connectedKva += row.connectedKva;
    target.governedDemandKw += row.governedDemandKw;
    target.governedDemandKva += row.governedDemandKva;
    target.warningCount += asArray(row.warnings).length;
    if (row.status === 'fail') target.status = 'fail';
    else if (row.status === 'warn' && target.status !== 'fail') target.status = 'warn';
  });
  return [...groups.values()].map(row => ({
    ...row,
    connectedKw: round(row.connectedKw),
    connectedKva: round(row.connectedKva),
    governedDemandKw: round(row.governedDemandKw),
    governedDemandKva: round(row.governedDemandKva),
  }));
}

export function buildLoadDemandGovernancePackage(context = {}) {
  const projectName = context.projectName || 'Untitled Project';
  const basis = normalizeDemandBasis(context.basis || context.demandBasis || {});
  const loads = asArray(context.loads);
  const panels = asArray(context.panels);
  const demand = calculateDemandForLoads(loads, basis);
  const panelRows = buildPanelDemandSummary({ panels, loads, basis });
  const serviceRows = buildServiceDemandSummary({ panels, loads, basis });
  const phaseBalanceRows = panelRows.map(row => row.phaseBalance).filter(Boolean);
  const panelWarnings = [];
  panelRows.forEach(row => {
    if (row.mainRatingA && row.governedCurrentA > row.mainRatingA) {
      panelWarnings.push(warning('panelDemandExceedsMain', `${row.panelTag} governed demand current exceeds the main device rating.`, 'error', { panelId: row.panelId }));
    }
    if (row.phaseBalance?.status !== 'pass') {
      panelWarnings.push(warning('phaseImbalance', `${row.panelTag} phase unbalance is ${row.phaseBalance.unbalancePct}%.`, row.phaseBalance.status === 'fail' ? 'error' : 'warning', { panelId: row.panelId }));
    }
  });
  const warnings = [...demand.warnings, ...panelWarnings];
  const summary = {
    ...demand.summary,
    panelCount: panelRows.length,
    serviceCount: serviceRows.length,
    phaseBalanceWarn: phaseBalanceRows.filter(row => row.status === 'warn').length,
    phaseBalanceFail: phaseBalanceRows.filter(row => row.status === 'fail').length,
    panelDemandFail: panelRows.filter(row => row.status === 'fail').length,
    warningCount: warnings.length,
    status: panelRows.some(row => row.status === 'fail') ? 'fail' : warnings.length ? 'warn' : 'pass',
  };
  return {
    version: LOAD_DEMAND_GOVERNANCE_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName,
    basis,
    loadRows: demand.loadRows,
    groupRows: demand.groupRows,
    panelRows,
    serviceRows,
    phaseBalanceRows,
    warnings,
    assumptions: [
      'Demand governance is deterministic engineering-screening output, not a complete NEC Article 220 compliance engine.',
      'Legacy demand-factor percentages are preserved unless explicit governance metadata is supplied.',
      'Measured-demand values are used only when the demand basis explicitly selects measured demand.',
      'Continuous-load flags are reported for downstream sizing context and are not automatically converted into feeder ampacity multipliers.',
    ],
    summary,
  };
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderRows(rows = [], columns = []) {
  if (!rows.length) return `<tr><td colspan="${columns.length}">No rows.</td></tr>`;
  return rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(column.render ? column.render(row) : row[column.key])}</td>`).join('')}</tr>`).join('');
}

export function renderLoadDemandGovernanceHTML(pkg = {}) {
  const loadColumns = [
    { key: 'tag' },
    { key: 'source' },
    { key: 'loadClass' },
    { key: 'continuous', render: row => row.continuous ? 'yes' : 'no' },
    { key: 'noncoincidentGroup' },
    { key: 'demandFactorPct' },
    { key: 'governedDemandKw' },
    { key: 'governedDemandKva' },
    { key: 'status' },
  ];
  const panelColumns = [
    { key: 'panelTag' },
    { key: 'serviceGroup' },
    { key: 'loadCount' },
    { key: 'governedDemandKw' },
    { key: 'governedDemandKva' },
    { key: 'governedCurrentA' },
    { key: 'mainRatingA' },
    { key: 'status' },
  ];
  const warningColumns = [
    { key: 'severity' },
    { key: 'code' },
    { key: 'message' },
  ];
  return `<section class="report-section" id="rpt-load-demand-governance">
  <h2>Panel and Load Demand Basis</h2>
  <p class="report-note">Local deterministic demand-governance screening package. Final code demand calculations require project-specific engineering review.</p>
  <dl class="report-dl">
    <dt>Loads</dt><dd>${escapeHtml(pkg.summary?.loadCount || 0)}</dd>
    <dt>Panels</dt><dd>${escapeHtml(pkg.summary?.panelCount || 0)}</dd>
    <dt>Connected kW</dt><dd>${escapeHtml(pkg.summary?.connectedKw || 0)}</dd>
    <dt>Governed Demand kW</dt><dd>${escapeHtml(pkg.summary?.governedDemandKw || 0)}</dd>
    <dt>Largest Motor Adder kW</dt><dd>${escapeHtml(pkg.summary?.largestMotorAdderKw || 0)}</dd>
    <dt>Status</dt><dd>${escapeHtml(pkg.summary?.status || 'pass')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr>${loadColumns.map(column => `<th>${escapeHtml(column.key)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(asArray(pkg.loadRows), loadColumns)}</tbody>
    </table>
  </div>
  <h3>Panel Demand Summary</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr>${panelColumns.map(column => `<th>${escapeHtml(column.key)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(asArray(pkg.panelRows), panelColumns)}</tbody>
    </table>
  </div>
  <h3>Warnings</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr>${warningColumns.map(column => `<th>${escapeHtml(column.key)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(asArray(pkg.warnings), warningColumns)}</tbody>
    </table>
  </div>
</section>`;
}
