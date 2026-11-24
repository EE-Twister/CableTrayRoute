import { evaluateTrayFill, summarizeTrayFillResult, NEC_2023_TRAY_FILL_BASIS } from '../../analysis/trayFill.mjs';

/**
 * Pure builder for the Tray Fill page's "Fill Analysis" workbook sheet.
 *
 * Each compartment is evaluated exactly as the page's Draw Tray handler does:
 * cables are grouped by their one-based compartment (`zone`), and
 * evaluateTrayFill receives the compartment's own width and depth. The
 * geometric packing density uses the page gauge's formula and is reported
 * separately because it is a layout screen, not an NEC limit.
 */

export const TRAY_FILL_ANALYSIS_SHEET = 'Fill Analysis';

const STATUS_LABELS = Object.freeze({
  pass: 'Selected-rule pass',
  fail: 'Selected-rule exceedance',
});

/** Same wording as the page's Article 392 result list. */
export function trayFillStatusLabel(status) {
  return STATUS_LABELS[status] || 'Evidence incomplete';
}

function cableZone(cable) {
  return parseInt(cable?.zone, 10) || 1;
}

function cableCrossSectionIn2(cable) {
  const od = parseFloat(cable?.od || cable?.OD);
  if (Number.isNaN(od)) return 0;
  return Math.PI * (od / 2) ** 2 * (cable.parallelCount || 1);
}

function round(value, digits) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : '';
}

/**
 * Evaluate every compartment of the tray on the Tray Fill page.
 * @param {{ trayName?: string, trayType?: string, trayWidth?: number, trayDepth?: number,
 *   compartments?: Array<{ id: number, width: number|string, depth: number|string, label?: string }>,
 *   cables?: object[] }} input  cables use the page's Draw Tray shape
 *   ({ tag, cableType, count, size, cable_size, OD, zone, parallelCount, ... })
 * @returns {{ compartments: object[], status: string, governingCompartment: string|null, unassignedCables: string[] }}
 */
export function evaluateTrayFillCompartments({
  trayName = '',
  trayType = '',
  trayWidth,
  trayDepth,
  compartments = [],
  cables = [],
} = {}) {
  const rows = Array.isArray(cables) ? cables : [];
  const entries = (Array.isArray(compartments) ? compartments : []).map(compartment => {
    const compartmentCables = rows.filter(cable => cableZone(cable) === compartment.id);
    const widthIn = parseFloat(compartment.width) || trayWidth;
    const depthIn = parseFloat(compartment.depth) || trayDepth;
    const cableAreaIn2 = compartmentCables.reduce((sum, cable) => sum + cableCrossSectionIn2(cable), 0);
    const spaceIn2 = (Number(widthIn) || 0) * (Number(depthIn) || 0);
    return {
      id: compartment.id,
      label: compartment.label || `Compartment ${compartment.id}`,
      widthIn,
      depthIn,
      cableRows: compartmentCables.length,
      cableAreaIn2,
      packingDensityPercent: spaceIn2 > 0 ? cableAreaIn2 / spaceIn2 * 100 : null,
      result: compartmentCables.length
        ? evaluateTrayFill({
          tray_id: `${trayName || 'Tray'}:${compartment.id}`,
          tray_type: trayType,
          inside_width: widthIn,
          tray_depth: depthIn,
        }, compartmentCables)
        : null,
    };
  });

  // Governing compartment: same rule as evaluateTrayFillWithCompartments.
  const evaluated = entries.filter(entry => entry.result);
  const failing = evaluated.filter(entry => entry.result.status === 'fail');
  const complete = evaluated.filter(entry => entry.result.evaluable === true);
  const incomplete = evaluated.filter(entry => entry.result.evaluable !== true);
  const byUtilization = (a, b) => (b.result.utilizationPercent ?? -1) - (a.result.utilizationPercent ?? -1);
  const governing = (failing.length ? failing : complete).slice().sort(byUtilization)[0] || evaluated[0] || null;
  const compartmentIds = new Set(entries.map(entry => entry.id));
  const unassignedCables = rows
    .filter(cable => !compartmentIds.has(cableZone(cable)))
    .map(cable => String(cable?.tag || '').trim() || 'Unnamed cable');
  const status = failing.length
    ? 'fail'
    : (!evaluated.length || incomplete.length || unassignedCables.length ? 'incomplete' : 'pass');

  return {
    compartments: entries,
    status,
    governingId: governing ? governing.id : null,
    governingCompartment: governing ? governing.label : null,
    unassignedCables,
  };
}

/**
 * Rows (array of arrays) for the "Fill Analysis" sheet.
 * @param {Parameters<typeof evaluateTrayFillCompartments>[0]} input
 * @returns {Array<Array<string|number>>}
 */
export function buildTrayFillAnalysisRows(input = {}) {
  const analysis = evaluateTrayFillCompartments(input);
  const basis = NEC_2023_TRAY_FILL_BASIS;
  const rows = [
    ['Tray Fill Analysis'],
    ['Tray', input.trayName || '(unnamed)'],
    ['Tray type', input.trayType === 'ladder' ? 'Ladder / ventilated family' : input.trayType === 'solid' ? 'Solid Bottom' : String(input.trayType || 'not set')],
    ['Code basis', `${basis.standard} ${basis.edition} ${basis.article}, ${basis.table} (selected Article 392 rules)`],
    ['Evaluated', 'At export, from the Cables and Compartments sheets in this workbook. Click Draw Tray to refresh the on-screen result.'],
    ['Overall Article 392 status', trayFillStatusLabel(analysis.status)],
    ['Governing compartment', analysis.governingCompartment || ''],
    [],
    [
      'Compartment', 'Width (in)', 'Depth (in)', 'Cables', 'Arrangement', 'NEC 2023 clause',
      'Table 392.22(A)(1) column', 'Used cable area (in²)', 'Allowable cable area (in²)',
      'Used large-cable diameter sum (in)', 'Allowable large-cable diameter sum (in)',
      'Utilization of selected allowance (%)', 'Status', 'Governing', 'Result note',
      'Geometric packing density (%) — not an NEC limit',
    ],
  ];

  analysis.compartments.forEach(entry => {
    const result = entry.result;
    const used = result?.used || {};
    const allowable = result?.allowable || {};
    rows.push([
      entry.label,
      round(Number(entry.widthIn), 2),
      round(Number(entry.depthIn), 2),
      result ? result.cableCount : 0,
      result ? result.arrangement : '',
      result ? result.clause : '',
      result?.tableColumn ?? '',
      round(used.smallCableAreaIn2 ?? used.cableAreaIn2, 3),
      round(allowable.smallCableAreaIn2 ?? allowable.cableAreaIn2, 3),
      round(used.largeCableDiameterIn, 3),
      round(allowable.largeCableDiameterIn, 3),
      result?.evaluable === true ? round(result.utilizationPercent, 1) : '',
      result ? trayFillStatusLabel(result.status) : 'No cables assigned',
      result && entry.id === analysis.governingId ? 'Yes' : '',
      result ? summarizeTrayFillResult(result) : '',
      entry.packingDensityPercent == null ? '' : round(entry.packingDensityPercent, 1),
    ]);
  });

  rows.push([]);
  rows.push(['Notes']);
  rows.push(['Utilization is the share of the selected NEC 2023 Article 392.22(A) allowance in use; above 100 % exceeds it. "Evidence incomplete" means the selected rules could not be applied, so no utilization is reported.']);
  rows.push(['Geometric packing density = total cable cross-sectional area ÷ (compartment width × depth). It is a layout screen, not an NEC limit; the page\'s 40 %/50 % density review thresholds are not code limits.']);
  if (analysis.unassignedCables.length) {
    rows.push([`Not evaluated: ${analysis.unassignedCables.join(', ')} ${analysis.unassignedCables.length === 1 ? 'is' : 'are'} assigned to a compartment that does not exist, so the overall status is incomplete.`]);
  }
  return rows;
}
