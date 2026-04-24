import {
  HEAT_TRACE_CABLE_TYPES,
  HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES,
  runHeatTraceSizingAnalysis,
} from './heatTraceSizing.mjs';

const REPORT_VERSION = 'heat-trace-report-v1';

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(asNumber(value) * factor) / factor;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeWarnings(warnings) {
  return Array.isArray(warnings) ? warnings.filter(Boolean).map(String) : [];
}

function formatCableType(type) {
  return HEAT_TRACE_CABLE_TYPES[type]?.label || HEAT_TRACE_CABLE_TYPES.selfRegulating.label;
}

function formatComponentType(type) {
  return HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES[type]?.label || HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES.custom.label;
}

function deriveResult(caseItem = {}) {
  if (caseItem.result && Number.isFinite(caseItem.result.totalCircuitWatts)) {
    return caseItem.result;
  }
  if (!caseItem.inputs || typeof caseItem.inputs !== 'object') {
    return null;
  }
  try {
    const result = runHeatTraceSizingAnalysis(caseItem.inputs);
    result.unitSystem = caseItem.unitSystem || caseItem.inputs.unitSystem || 'imperial';
    return result;
  } catch (err) {
    return null;
  }
}

function getMaxCircuitLengthFt(result = {}, inputs = {}) {
  const resultMax = asNumber(result.maxCircuitLengthFt, 0);
  if (resultMax > 0) return resultMax;
  const inputMax = asNumber(inputs.maxCircuitLengthFt, 0);
  return inputMax > 0 ? inputMax : 500;
}

function getBranchStatus({ result, warnings, lineLengthFt, maxCircuitLengthFt }) {
  if (!result) return 'invalid';
  if (lineLengthFt > maxCircuitLengthFt || result.circuitLimitStatus === 'overLimit') return 'overLimit';
  if (result.circuitLimitStatus === 'nearLimit' || warnings.length) return 'warning';
  return 'withinLimit';
}

export function normalizeHeatTraceBranchCase(caseItem = {}, index = 0) {
  const inputs = caseItem.inputs && typeof caseItem.inputs === 'object' ? { ...caseItem.inputs } : {};
  const result = deriveResult(caseItem);
  const unitSystem = caseItem.unitSystem || result?.unitSystem || 'imperial';
  const voltageV = asNumber(inputs.voltageV ?? result?.voltageV, 0);
  const heatTraceCableType = inputs.heatTraceCableType || result?.heatTraceCableType || 'selfRegulating';
  const requiredWatts = asNumber(result?.totalCircuitWatts, 0);
  const installedTotalWatts = asNumber(result?.installedTotalWatts, requiredWatts);
  const loadAmps = Number.isFinite(caseItem.loadAmps)
    ? asNumber(caseItem.loadAmps)
    : asNumber(result?.installedLoadAmps, voltageV > 0 ? installedTotalWatts / voltageV : 0);
  const lineLengthFt = asNumber(result?.lineLengthFt ?? inputs.lineLengthFt, 0);
  const traceRunCount = asNumber(result?.traceRunCount ?? inputs.traceRunCount, 1);
  const componentAllowances = Array.isArray(result?.componentAllowances)
    ? result.componentAllowances
    : (Array.isArray(inputs.componentAllowances) ? inputs.componentAllowances : []);
  const componentAllowanceLengthFt = asNumber(result?.componentAllowanceLengthFt, componentAllowances.reduce((sum, item) => {
    return sum + (asNumber(item.quantity, 0) * asNumber(item.equivalentLengthFtEach ?? item.equivalentLengthFt, 0));
  }, 0));
  const effectiveTraceLengthFt = asNumber(result?.effectiveTraceLengthFt, lineLengthFt + componentAllowanceLengthFt);
  const maxCircuitLengthFt = getMaxCircuitLengthFt(result, inputs);
  const warnings = normalizeWarnings(result?.warnings);
  const status = getBranchStatus({ result, warnings, lineLengthFt: effectiveTraceLengthFt, maxCircuitLengthFt });

  return {
    id: String(caseItem.id || `heat-trace-branch-${index + 1}`),
    name: String(caseItem.name || `HT-${index + 1}`),
    unitSystem,
    inputs,
    result,
    heatTraceCableType,
    heatTraceCableTypeLabel: formatCableType(heatTraceCableType),
    voltageV: round(voltageV, 1),
    totalWatts: round(installedTotalWatts, 1),
    totalKw: round(installedTotalWatts / 1000, 3),
    requiredWatts: round(requiredWatts, 1),
    requiredKw: round(requiredWatts / 1000, 3),
    installedTotalWatts: round(installedTotalWatts, 1),
    installedLoadAmps: round(loadAmps, 2),
    loadAmps: round(loadAmps, 2),
    lineLengthFt: round(lineLengthFt, 1),
    traceRunCount: round(traceRunCount, 0),
    componentAllowances: componentAllowances.map((item, componentIndex) => ({
      id: String(item.id || `component-${componentIndex + 1}`),
      type: String(item.type || 'custom'),
      label: String(item.label || formatComponentType(item.type)),
      quantity: round(asNumber(item.quantity, 0), 3),
      equivalentLengthFtEach: round(asNumber(item.equivalentLengthFtEach ?? item.equivalentLengthFt, 0), 3),
      totalEquivalentLengthFt: round(asNumber(item.totalEquivalentLengthFt, asNumber(item.quantity, 0) * asNumber(item.equivalentLengthFtEach ?? item.equivalentLengthFt, 0)), 3),
    })),
    componentAllowanceLengthFt: round(componentAllowanceLengthFt, 1),
    effectiveTraceLengthFt: round(effectiveTraceLengthFt, 1),
    maxCircuitLengthFt: round(maxCircuitLengthFt, 1),
    requiredWPerFt: round(result?.requiredWPerFt, 2),
    selectedWPerFt: round(result?.recommendedCableRatingWPerFt, 2),
    installedWPerFt: round(result?.installedWPerFt ?? result?.recommendedCableRatingWPerFt, 2),
    coverageRatio: round(result?.coverageRatio ?? 0, 4),
    circuitUtilizationPct: maxCircuitLengthFt > 0 ? round((effectiveTraceLengthFt / maxCircuitLengthFt) * 100, 1) : 0,
    status,
    warnings,
    createdAt: caseItem.createdAt || null,
    updatedAt: caseItem.updatedAt || caseItem.createdAt || null,
  };
}

export function buildHeatTraceBranchSchedule(cases = []) {
  const rows = (Array.isArray(cases) ? cases : [])
    .map((caseItem, index) => normalizeHeatTraceBranchCase(caseItem, index));
  const voltageGroups = new Map();
  rows.forEach(row => {
    const key = String(row.voltageV || 'unknown');
    const existing = voltageGroups.get(key) || { voltageV: row.voltageV, count: 0, totalWatts: 0, totalAmps: 0 };
    existing.count += 1;
    existing.totalWatts += row.totalWatts;
    existing.totalAmps += row.loadAmps;
    voltageGroups.set(key, existing);
  });

  return {
    rows,
    summary: {
      branchCount: rows.length,
      totalConnectedWatts: round(rows.reduce((sum, row) => sum + row.totalWatts, 0), 1),
      totalConnectedKw: round(rows.reduce((sum, row) => sum + row.totalWatts, 0) / 1000, 3),
      totalRequiredWatts: round(rows.reduce((sum, row) => sum + row.requiredWatts, 0), 1),
      totalRequiredKw: round(rows.reduce((sum, row) => sum + row.requiredWatts, 0) / 1000, 3),
      totalLoadAmps: round(rows.reduce((sum, row) => sum + row.loadAmps, 0), 2),
      overLimitCount: rows.filter(row => row.status === 'overLimit').length,
      warningCount: rows.filter(row => row.status === 'warning' || row.warnings.length).length,
      invalidCount: rows.filter(row => row.status === 'invalid').length,
      byVoltage: Array.from(voltageGroups.values()).map(group => ({
        voltageV: group.voltageV,
        count: group.count,
        totalWatts: round(group.totalWatts, 1),
        totalAmps: round(group.totalAmps, 2),
      })),
    },
  };
}

function buildActiveCase(activeResult, activeInputs = null) {
  if (!activeResult) return null;
  return normalizeHeatTraceBranchCase({
    id: 'active-heat-trace-case',
    name: 'Current active case',
    unitSystem: activeResult.unitSystem || activeInputs?.unitSystem || 'imperial',
    inputs: activeInputs || {},
    result: activeResult,
  }, 0);
}

function collectReportWarnings(activeCase, branchSchedule) {
  const warnings = [];
  if (activeCase) {
    activeCase.warnings.forEach(warning => warnings.push({ source: activeCase.name, message: warning }));
    if (activeCase.status === 'overLimit') {
      warnings.push({ source: activeCase.name, message: 'Active branch circuit length exceeds the configured maximum.' });
    }
  }
  branchSchedule.rows.forEach(row => {
    row.warnings.forEach(warning => warnings.push({ source: row.name, message: warning }));
    if (row.status === 'overLimit') {
      warnings.push({ source: row.name, message: 'Branch circuit length exceeds the configured maximum.' });
    }
    if (row.status === 'invalid') {
      warnings.push({ source: row.name, message: 'Branch case could not be recalculated from saved inputs.' });
    }
  });
  return warnings;
}

export function buildHeatTraceReport({
  activeResult = null,
  activeInputs = null,
  circuitCases = [],
  approval = null,
  projectName = 'Untitled Project',
} = {}) {
  const branchSchedule = buildHeatTraceBranchSchedule(circuitCases);
  const activeCase = buildActiveCase(activeResult, activeInputs);

  return {
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    projectName,
    activeCase,
    branchSchedule,
    summary: {
      activeStatus: activeCase?.status || 'notRun',
      branchCount: branchSchedule.summary.branchCount,
      totalConnectedKw: branchSchedule.summary.totalConnectedKw,
      overLimitCount: branchSchedule.summary.overLimitCount,
      warningCount: branchSchedule.summary.warningCount,
      approvalStatus: approval?.status || 'pending',
    },
    calculationBasis: {
      method: 'Simplified steady-state electric heat-trace screening calculation.',
      formulas: [
        'Q per length = deltaT / (R_insulation + R_external)',
        'Required output = Q per length x material factor x design margin',
        'Selected cable output = nearest standard W/ft rating greater than or equal to required W/ft',
        'Installed W/ft = selected cable output x parallel trace run count',
        'Installed connected load = installed W/ft x (pipe length + component equivalent length)',
      ],
      assumptions: [
        'Heat trace branch circuit starts at the controller or heat-trace panel output and ends at the traced run.',
        'Upstream feeder, transformer, panel bus, breaker coordination, and manufacturer-specific cable-family curves are excluded.',
        'Cable type is used for screening notes and warnings only; final output curves remain manufacturer-specific.',
        'Component allowances are equivalent-length screening assumptions and must be replaced by project/manufacturer details for final design.',
        'Multiple trace runs on one pipe are treated as one branch case for schedule rollup; final design may split them into separate circuits.',
        'Final design requires manufacturer verification for maximum circuit length, startup current, and sheath temperature.',
      ],
    },
    warnings: collectReportWarnings(activeCase, branchSchedule),
    approval: approval || { status: 'pending' },
  };
}

function renderStatus(status) {
  const labels = {
    withinLimit: 'Within limit',
    warning: 'Review',
    overLimit: 'Over limit',
    invalid: 'Invalid',
    notRun: 'Not run',
  };
  return labels[status] || status;
}

function renderInputRows(inputs = {}) {
  const entries = [
    ['Pipe NPS', inputs.pipeNps],
    ['Insulation thickness', `${round(inputs.insulationThicknessIn, 2)} in`],
    ['Insulation type', inputs.insulationType],
    ['Pipe material', inputs.pipeMaterial],
    ['Environment', inputs.environment],
    ['Heat trace cable type', formatCableType(inputs.heatTraceCableType)],
    ['Parallel trace runs', inputs.traceRunCount || 1],
    ['Maintain temperature', `${round(inputs.maintainTempC, 1)} C`],
    ['Ambient temperature', `${round(inputs.ambientTempC, 1)} C`],
    ['Wind speed', `${round(inputs.windSpeedMph, 1)} mph`],
    ['Design margin', `${round(inputs.safetyMarginPct, 1)}%`],
    ['Voltage', `${round(inputs.voltageV, 1)} V`],
  ];
  return entries.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value ?? 'n/a')}</td></tr>`).join('');
}

function renderComponentAllowanceRows(components = []) {
  if (!components.length) {
    return '<tr><td colspan="5">No component equivalent-length allowances.</td></tr>';
  }
  return components.map(component => `
    <tr>
      <td>${esc(component.label || formatComponentType(component.type))}</td>
      <td>${esc(formatComponentType(component.type))}</td>
      <td>${esc(component.quantity)}</td>
      <td>${esc(component.equivalentLengthFtEach)}</td>
      <td>${esc(component.totalEquivalentLengthFt)}</td>
    </tr>`).join('');
}

function renderActiveCase(activeCase) {
  if (!activeCase) {
    return '<p class="report-empty">No active heat trace result has been run.</p>';
  }
  const result = activeCase.result || {};
  return `
    <dl class="report-dl">
      <dt>Status</dt><dd>${esc(renderStatus(activeCase.status))}</dd>
      <dt>Cable type</dt><dd>${esc(activeCase.heatTraceCableTypeLabel)}</dd>
      <dt>Selected output</dt><dd>${esc(activeCase.selectedWPerFt)} W/ft</dd>
      <dt>Trace runs</dt><dd>${esc(activeCase.traceRunCount)} parallel run(s)</dd>
      <dt>Required heat load</dt><dd>${esc(activeCase.requiredWatts)} W</dd>
      <dt>Installed connected load</dt><dd>${esc(activeCase.totalWatts)} W</dd>
      <dt>Estimated branch current</dt><dd>${esc(activeCase.loadAmps)} A at ${esc(activeCase.voltageV)} V</dd>
      <dt>Effective length</dt><dd>${esc(activeCase.effectiveTraceLengthFt)} ft (${esc(activeCase.componentAllowanceLengthFt)} ft allowance)</dd>
      <dt>Coverage</dt><dd>${esc(round(activeCase.coverageRatio * 100, 1))}% of required W/ft</dd>
      <dt>Length check</dt><dd>${esc(activeCase.effectiveTraceLengthFt)} ft / ${esc(activeCase.maxCircuitLengthFt)} ft</dd>
      <dt>Insulation resistance</dt><dd>${esc(result.thermalResistance?.insulationKmPerW ?? 'n/a')} K-m/W</dd>
      <dt>External resistance</dt><dd>${esc(result.thermalResistance?.externalKmPerW ?? 'n/a')} K-m/W</dd>
      <dt>Total resistance</dt><dd>${esc(result.thermalResistance?.totalKmPerW ?? 'n/a')} K-m/W</dd>
    </dl>
    <div class="report-scroll">
      <table class="report-table">
        <caption>Active Input Basis</caption>
        <tbody>${renderInputRows(activeCase.inputs)}</tbody>
      </table>
    </div>`;
}

function renderActiveComponents(activeCase) {
  if (!activeCase) return '';
  return `
    <div class="report-scroll">
      <table class="report-table">
        <caption>Component Equivalent-Length Allowances</caption>
        <thead>
          <tr><th>Label</th><th>Type</th><th>Qty</th><th>Eq. ft each</th><th>Total eq. ft</th></tr>
        </thead>
        <tbody>${renderComponentAllowanceRows(activeCase.componentAllowances)}</tbody>
      </table>
    </div>`;
}

function renderBranchRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="11">No saved heat-trace branches.</td></tr>';
  }
  return rows.map(row => `
    <tr>
      <td>${esc(row.name)}</td>
      <td>${esc(renderStatus(row.status))}</td>
      <td>${esc(row.heatTraceCableTypeLabel)}</td>
      <td>${esc(row.effectiveTraceLengthFt)}</td>
      <td>${esc(row.maxCircuitLengthFt)}</td>
      <td>${esc(row.selectedWPerFt)} x ${esc(row.traceRunCount)}</td>
      <td>${esc(row.totalWatts)}</td>
      <td>${esc(row.requiredWatts)}</td>
      <td>${esc(row.voltageV)}</td>
      <td>${esc(row.loadAmps)}</td>
      <td>${esc(row.warnings.join(' | ') || 'None')}</td>
    </tr>`).join('');
}

function renderScheduleComponentRows(rows) {
  const componentRows = rows.flatMap(row => row.componentAllowances.map(component => ({ row, component })));
  if (!componentRows.length) {
    return '<tr><td colspan="6">No saved branch component allowances.</td></tr>';
  }
  return componentRows.map(({ row, component }) => `
    <tr>
      <td>${esc(row.name)}</td>
      <td>${esc(component.label || formatComponentType(component.type))}</td>
      <td>${esc(formatComponentType(component.type))}</td>
      <td>${esc(component.quantity)}</td>
      <td>${esc(component.equivalentLengthFtEach)}</td>
      <td>${esc(component.totalEquivalentLengthFt)}</td>
    </tr>`).join('');
}

export function renderHeatTraceReportHTML(report = {}) {
  const schedule = report.branchSchedule || buildHeatTraceBranchSchedule([]);
  const approval = report.approval || {};
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];

  return `
    <article class="heattrace-report-document">
      <header class="report-header">
        <h1 class="report-title">${esc(report.projectName || 'Untitled Project')} - Heat Trace Calculation Sheet</h1>
        <p class="report-meta">Generated ${esc(report.generatedAt ? new Date(report.generatedAt).toLocaleString() : 'n/a')} - ${esc(report.version || REPORT_VERSION)}</p>
      </header>

      <section class="report-section">
        <h2>Summary</h2>
        <dl class="report-dl">
          <dt>Approval status</dt><dd>${esc(approval.status || 'pending')}</dd>
          <dt>Reviewed by</dt><dd>${esc(approval.reviewedBy || 'Not reviewed')}</dd>
      <dt>Saved branches</dt><dd>${esc(schedule.summary.branchCount)}</dd>
          <dt>Total installed connected load</dt><dd>${esc(schedule.summary.totalConnectedKw)} kW</dd>
          <dt>Total required heat load</dt><dd>${esc(schedule.summary.totalRequiredKw)} kW</dd>
          <dt>Branches over limit</dt><dd>${esc(schedule.summary.overLimitCount)}</dd>
          <dt>Branches with warnings</dt><dd>${esc(schedule.summary.warningCount)}</dd>
        </dl>
      </section>

      <section class="report-section">
        <h2>Active Case</h2>
        ${renderActiveCase(report.activeCase)}
        ${renderActiveComponents(report.activeCase)}
      </section>

      <section class="report-section">
        <h2>Branch Circuit Schedule</h2>
        <p class="report-note">Heat trace branches are load circuits from the heat-trace controller or panel output to the traced run. Upstream feeder, transformer, and panel bus sizing are excluded.</p>
        <div class="report-scroll">
          <table class="report-table">
            <thead>
              <tr><th>Branch</th><th>Status</th><th>Cable type</th><th>Effective ft</th><th>Max ft</th><th>Selected W/ft x runs</th><th>Installed W</th><th>Required W</th><th>Voltage</th><th>Amps</th><th>Warnings</th></tr>
            </thead>
            <tbody>${renderBranchRows(schedule.rows)}</tbody>
          </table>
        </div>
        <div class="report-scroll">
          <table class="report-table">
            <caption>Saved Branch Component Allowances</caption>
            <thead>
              <tr><th>Branch</th><th>Label</th><th>Type</th><th>Qty</th><th>Eq. ft each</th><th>Total eq. ft</th></tr>
            </thead>
            <tbody>${renderScheduleComponentRows(schedule.rows)}</tbody>
          </table>
        </div>
      </section>

      <section class="report-section">
        <h2>Calculation Basis</h2>
        <p>${esc(report.calculationBasis?.method || '')}</p>
        <ul>${(report.calculationBasis?.formulas || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
        <h3>Assumptions and exclusions</h3>
        <ul>${(report.calculationBasis?.assumptions || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
      </section>

      <section class="report-section">
        <h2>Warnings</h2>
        ${warnings.length
          ? `<ul>${warnings.map(warning => `<li><strong>${esc(warning.source)}:</strong> ${esc(warning.message)}</li>`).join('')}</ul>`
          : '<p class="report-empty">No heat trace warnings detected.</p>'}
      </section>
    </article>`;
}
