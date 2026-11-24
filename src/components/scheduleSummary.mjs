import { evaluateTrayFillWithCompartments, cablesAssignedToTray, summarizeTrayFillResult } from '../../analysis/trayFill.mjs';
import { buildTrayCableMapFromRouteResults } from '../../analysis/routeResults.mjs';
import { barChartHtml, escapeText, kpiStripHtml, statusLegendHtml } from './resultViz.mjs';

const toNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Summarise cable rows into KPI items and a voltage-class mix. */
export function summarizeCables(cables) {
  const rows = Array.isArray(cables) ? cables : [];
  let totalLength = 0;
  let missing = 0;
  const voltageMix = new Map();
  rows.forEach(cable => {
    const length = toNumber(cable?.length);
    const voltage = toNumber(cable?.operating_voltage);
    if (length === null || length <= 0 || voltage === null) missing += 1;
    if (length !== null && length > 0) totalLength += length;
    const label = voltage === null ? 'Unspecified' : voltage > 1000 ? 'Medium voltage' : voltage > 50 ? 'Low voltage' : 'Control / signal';
    voltageMix.set(label, (voltageMix.get(label) || 0) + 1);
  });
  return { count: rows.length, totalLength, missing, voltageMix: Object.fromEntries(voltageMix) };
}

export function cableSummaryHtml(cables) {
  const s = summarizeCables(cables);
  if (!s.count) return '';
  const mix = Object.entries(s.voltageMix).map(([label, n]) => `${label} ${n}`).join(' · ');
  return kpiStripHtml([
    { label: 'Cables', value: String(s.count), status: 'info', hint: mix },
    { label: 'Total length', value: `${Math.round(s.totalLength).toLocaleString()} ft`, status: 'info' },
    { label: 'Missing length or voltage', value: String(s.missing), status: s.missing ? 'warn' : 'pass', hint: s.missing ? 'Complete these before routing' : 'Ready for routing' },
  ]);
}

/**
 * Tray utilization rows from NEC 392.22(A) results. Cables come from explicit
 * assignments plus the saved route results.
 */
export function trayUtilizationRows(trays = [], cables = [], routeSource = null) {
  const routed = buildTrayCableMapFromRouteResults(routeSource, cables);
  const rows = [];
  const incomplete = [];
  let unassigned = 0;
  (Array.isArray(trays) ? trays : []).forEach(tray => {
    const id = String(tray?.tray_id ?? tray?.id ?? '').trim();
    if (!id) return;
    const byTag = new Map();
    [...cablesAssignedToTray(tray, cables), ...(routed[id] || [])].forEach(cable => {
      const key = String(cable?.tag ?? cable?.name ?? byTag.size);
      if (!byTag.has(key)) byTag.set(key, cable);
    });
    if (!byTag.size) {
      unassigned += 1;
      return;
    }
    // Same compartment-aware evaluation as the project report and submittal:
    // a barrier-separated tray is governed by its fullest compartment.
    const result = evaluateTrayFillWithCompartments(tray, [...byTag.values()]);
    const pct = Number(result?.utilizationPercent);
    if (result?.evaluable !== true || !Number.isFinite(pct)) {
      incomplete.push({ id, reason: summarizeTrayFillResult(result) });
      return;
    }
    const governing = result.compartmented && result.governingCompartment ? ` · governed by ${result.governingCompartment}` : '';
    rows.push({
      label: id,
      value: pct,
      limit: 100,
      status: result.status === 'fail' ? 'fail' : pct > 80 ? 'warn' : 'pass',
      valueLabel: `${pct.toFixed(0)}% of allowance`,
      note: `${byTag.size} cable(s)${governing}`,
    });
  });
  return { rows, unassigned, incomplete };
}

export function trayUtilizationHtml(trays, cables, routeSource) {
  const { rows, unassigned, incomplete } = trayUtilizationRows(trays, cables, routeSource);
  if (!rows.length && !incomplete.length) return '';
  const incompleteNote = incomplete.length
    ? `<p class="field-hint"><strong>${incomplete.length} tray(s) could not be evaluated:</strong> ${incomplete.map(entry => `${escapeText(entry.id)} — ${escapeText(entry.reason)}`).join('; ')}</p>`
    : '';
  return `<h3 class="study-chart__title">Tray utilization (NEC 392.22 allowance)</h3>
    ${rows.length ? barChartHtml(rows, { unit: '%', max: 100, ariaLabel: 'Tray utilization against the NEC 392.22 allowance' }) : ''}
    ${rows.length ? statusLegendHtml() : ''}
    ${incompleteNote}
    <p class="field-hint">The tick marks 100% of the allowance. Compartmented trays show their governing compartment. ${unassigned ? `${unassigned} tray(s) have no cables assigned and are not shown.` : ''}</p>`;
}

export function racewaySummaryHtml({ trays = [], conduits = [], ductbanks = [], cables = [], routeSource = null } = {}) {
  const total = trays.length + conduits.length + ductbanks.length;
  if (!total) return '';
  const ductbankConduits = ductbanks.reduce((sum, bank) => sum + (Array.isArray(bank?.conduits) ? bank.conduits.length : 0), 0);
  return kpiStripHtml([
    { label: 'Cable trays', value: String(trays.length), status: 'info' },
    {
      label: 'Conduits',
      value: String(conduits.length + ductbankConduits),
      status: 'info',
      hint: ductbankConduits ? `${conduits.length} standalone · ${ductbankConduits} in ductbanks` : '',
    },
    { label: 'Ductbanks', value: String(ductbanks.length), status: 'info' },
  ]) + trayUtilizationHtml(trays, cables, routeSource);
}
