/**
 * Shared result visualisation helpers for study pages.
 *
 * Everything here returns plain data or HTML strings so the helpers can be
 * unit tested in Node and reused by any page without DOM dependencies.
 */

const STATUS_META = {
  pass: { icon: '✓', label: 'Pass' },
  warn: { icon: '!', label: 'Review' },
  fail: { icon: '✕', label: 'Fail' },
  info: { icon: 'i', label: 'Info' },
  na: { icon: '–', label: 'Not evaluated' },
};

/** Standard North American equipment short-circuit ratings (kA). */
export const STANDARD_AIC_RATINGS_KA = [5, 10, 14, 18, 22, 25, 35, 42, 50, 65, 85, 100, 150, 200];

export function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Status badge: icon + colour + text so meaning never depends on colour alone. */
export function statusBadgeHtml(status, label) {
  const key = STATUS_META[status] ? status : 'na';
  const meta = STATUS_META[key];
  return `<span class="viz-badge viz-badge--${key}"><span class="viz-badge__icon" aria-hidden="true">${meta.icon}</span>${escapeText(label || meta.label)}</span>`;
}

/** Smallest standard equipment rating that is at or above the fault current. */
export function nextStandardAicKa(faultKa) {
  const value = finite(faultKa);
  if (value === null || value < 0) return null;
  return STANDARD_AIC_RATINGS_KA.find(rating => rating >= value) ?? null;
}

/** NFPA 70E-style PPE category for an incident energy in cal/cm². */
export function ppeCategoryForEnergy(calCm2) {
  const energy = finite(calCm2);
  if (energy === null) return { id: 'unknown', label: 'No result', status: 'na', rank: -1 };
  if (energy < 1.2) return { id: 'cat0', label: 'Below 1.2 cal/cm²', status: 'pass', rank: 0 };
  if (energy <= 4) return { id: 'cat1', label: 'PPE Cat 1', status: 'pass', rank: 1 };
  if (energy <= 8) return { id: 'cat2', label: 'PPE Cat 2', status: 'warn', rank: 2 };
  if (energy <= 25) return { id: 'cat3', label: 'PPE Cat 3', status: 'warn', rank: 3 };
  if (energy <= 40) return { id: 'cat4', label: 'PPE Cat 4', status: 'fail', rank: 4 };
  return { id: 'danger', label: 'Dangerous > 40 cal/cm²', status: 'fail', rank: 5 };
}

/**
 * Horizontal bar chart rendered with HTML/CSS (responsive and themeable).
 * rows: [{ label, value, status?, valueLabel?, note?, limit?, marker? }]
 * Each row may carry its own `limit` (drawn as a tick); `max` fixes the scale.
 */
export function barChartHtml(rows, { unit = '', max = null, min = 0, ariaLabel = 'Bar chart', sort = 'desc' } = {}) {
  const usable = (rows || []).filter(row => finite(row.value) !== null);
  if (!usable.length) return '';
  const ordered = usable.slice();
  if (sort === 'desc') ordered.sort((a, b) => b.value - a.value);
  const scale = Math.max(
    finite(max) || 0,
    ...ordered.map(row => Math.max(row.value, finite(row.limit) || 0)),
    min + Number.EPSILON
  );
  const span = scale - min;
  const items = ordered.map(row => {
    const pct = Math.min(100, Math.max(0, ((row.value - min) / span) * 100));
    const limitPct = finite(row.limit) !== null ? Math.min(100, Math.max(0, ((row.limit - min) / span) * 100)) : null;
    const status = STATUS_META[row.status] ? row.status : 'info';
    const valueLabel = row.valueLabel ?? `${row.value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
    const marker = limitPct === null
      ? ''
      : `<span class="viz-bar__limit" style="left:${limitPct.toFixed(2)}%" title="Limit ${escapeText(row.limit)}${unit ? ` ${escapeText(unit)}` : ''}"></span>`;
    const note = row.note ? `<span class="viz-bar__note">${escapeText(row.note)}</span>` : '';
    return `<li class="viz-bar viz-bar--${status}">
      <span class="viz-bar__label">${escapeText(row.label)}</span>
      <span class="viz-bar__track"><span class="viz-bar__fill" style="width:${pct.toFixed(2)}%"></span>${marker}</span>
      <span class="viz-bar__value">${escapeText(valueLabel)}${row.status && !row.noBadge ? ` ${statusBadgeHtml(status)}` : ''}</span>
      ${note}
    </li>`;
  }).join('');
  return `<ul class="viz-bars" role="list" aria-label="${escapeText(ariaLabel)}">${items}</ul>`;
}

/** KPI strip: items are { label, value, status?, hint? }. */
export function kpiStripHtml(items) {
  const cards = (items || []).map(item => {
    const status = STATUS_META[item.status] ? item.status : 'info';
    return `<div class="viz-kpi viz-kpi--${status}">
      <span class="viz-kpi__value">${escapeText(item.value)}</span>
      <span class="viz-kpi__label">${escapeText(item.label)}</span>
      ${item.hint ? `<span class="viz-kpi__hint">${escapeText(item.hint)}</span>` : ''}
    </div>`;
  }).join('');
  return cards ? `<div class="viz-kpis" role="group" aria-label="Key results">${cards}</div>` : '';
}

/** Legend for the status vocabulary used by badges and bars. */
export function statusLegendHtml(keys = ['pass', 'warn', 'fail']) {
  return `<p class="viz-legend" aria-label="Status legend">${keys.map(key => statusBadgeHtml(key)).join(' ')}</p>`;
}

/** Short-circuit rows -> bar chart rows (value coloured by required AIC step). */
export function shortCircuitBarRows(entries) {
  return (entries || []).map(([id, result]) => {
    const ka = finite(result?.threePhaseKA);
    if (ka === null) return null;
    const aic = nextStandardAicKa(ka);
    return {
      label: result.equipmentTag || id,
      value: ka,
      status: ka >= 65 ? 'fail' : ka >= 22 ? 'warn' : 'pass',
      noBadge: true,
      note: aic ? `Equipment needs ≥ ${aic} kA interrupting rating` : 'Exceeds standard ratings',
    };
  }).filter(Boolean);
}

/** Arc-flash rows -> bar chart rows with PPE category badges. */
export function arcFlashBarRows(entries) {
  return (entries || []).map(([id, result]) => {
    const energy = finite(result?.incidentEnergy);
    if (energy === null) return null;
    const category = ppeCategoryForEnergy(energy);
    return {
      label: result.equipmentTag || id,
      value: energy,
      status: category.status,
      valueLabel: `${energy.toFixed(2)} cal/cm² · ${category.label}`,
      note: finite(result.boundary) !== null ? `Arc-flash boundary ${Math.round(result.boundary)} mm` : '',
    };
  }).filter(Boolean);
}

/** Voltage-drop results -> bar rows, each with its own limit tick. */
export function voltageDropBarRows(results) {
  return (results || []).filter(result => result?.evaluated).map(result => ({
    label: result.tag,
    value: finite(result.dropPct) ?? 0,
    limit: finite(result.limitPct),
    status: result.status === 'fail' ? 'fail' : result.status === 'warn' ? 'warn' : 'pass',
    valueLabel: `${(finite(result.dropPct) ?? 0).toFixed(2)} %`,
    note: finite(result.limitPct) !== null ? `Limit ${result.limitPct}%` : '',
  }));
}

/** Load-flow bus results -> per-unit voltage rows (ANSI C84.1 style 0.95-1.05 band). */
export function loadFlowVoltageRows(buses, labelFor = bus => bus.displayLabel || bus.id) {
  return (buses || []).map(bus => {
    const vm = finite(bus?.Vm);
    if (vm === null) return null;
    const off = Math.abs(vm - 1);
    return {
      label: labelFor(bus),
      value: vm,
      limit: vm < 1 ? 0.95 : 1.05,
      status: off > 0.05 ? 'fail' : off > 0.03 ? 'warn' : 'pass',
      valueLabel: `${vm.toFixed(3)} pu`,
    };
  }).filter(Boolean);
}
