import {
  cableAreaIn2,
  parsePositiveNumber,
  physicalCableCount,
} from './conduitFill.mjs';

/**
 * Edition-pinned NFPA 70 (NEC) 2023 cable-tray fill screening.
 *
 * Scope is intentionally limited to multiconductor cables rated 2000 V or
 * less in ladder, ventilated-trough/wire-mesh, and solid-bottom trays under
 * 392.22(A)(1) through (A)(4). Single-conductor arrangements, channel trays,
 * MV cable rules, ampacity spacing, and installation-specific exceptions are
 * reported as outside this evaluator rather than converted to a numeric pass.
 */

export const NEC_2023_TRAY_FILL_BASIS = Object.freeze({
  standard: 'NFPA 70 (NEC)',
  edition: '2023',
  article: '392.22(A)',
  table: 'Table 392.22(A)(1)',
  intendedUse: 'Selected Article 392 multiconductor cable-fill screening; qualified review and the adopted code remain required.',
  sourceUrl: 'https://docinfofiles.nfpa.org/files/AboutTheCodes/70/70_A2022_NEC_P08_FD_PIReport_rev_1008.pdf',
});

const TABLE_392_22_A1 = Object.freeze({
  2: Object.freeze({ ladder: 2.5, solid: 2.0 }),
  4: Object.freeze({ ladder: 4.5, solid: 3.5 }),
  6: Object.freeze({ ladder: 7.0, solid: 5.5 }),
  8: Object.freeze({ ladder: 9.5, solid: 7.0 }),
  9: Object.freeze({ ladder: 10.5, solid: 8.0 }),
  12: Object.freeze({ ladder: 14.0, solid: 11.0 }),
  16: Object.freeze({ ladder: 18.5, solid: 14.5 }),
  18: Object.freeze({ ladder: 21.0, solid: 16.5 }),
  20: Object.freeze({ ladder: 23.5, solid: 18.5 }),
  24: Object.freeze({ ladder: 28.0, solid: 22.0 }),
  30: Object.freeze({ ladder: 35.0, solid: 27.5 }),
  36: Object.freeze({ ladder: 42.0, solid: 33.0 }),
});

const CONDUCTOR_COUNT_FIELDS = [
  'conductors',
  'conductor_count',
  'conductorCount',
  'conductors_per_cable',
  'conductorsPerCable',
  'count',
  'cores',
  'core_count',
];

const CONDUCTOR_SIZE_FIELDS = [
  'conductor_size',
  'conductorSize',
  'cable_size',
  'wire_size',
  'size',
];

function text(value) {
  return String(value ?? '').trim();
}

function firstValue(record, fields) {
  for (const field of fields) {
    const value = record?.[field];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return '';
}

function trayId(tray = {}) {
  return text(tray.tray_id || tray.trayId || tray.id || tray.tag || tray.name);
}

function cableId(cable = {}) {
  return text(cable.tag || cable.name || cable.cable_id || cable.cableId || cable.id) || 'Unnamed cable';
}

export function normalizeTrayConstruction(value) {
  const normalized = text(value).toLowerCase().replace(/[_-]+/g, ' ');
  if (!normalized) return '';
  if (normalized.includes('solid')) return 'solid';
  if (
    normalized.includes('ladder')
    || normalized.includes('ventilat')
    || normalized.includes('wire mesh')
    || normalized.includes('basket')
  ) return 'ladder';
  return '';
}

export function trayInsideWidthIn(tray = {}) {
  return parsePositiveNumber(tray.inside_width ?? tray.insideWidth ?? tray.width);
}

export function trayUsableDepthIn(tray = {}) {
  return parsePositiveNumber(
    tray.usable_inside_depth
      ?? tray.usableInsideDepth
      ?? tray.tray_depth
      ?? tray.load_depth
      ?? tray.height
      ?? tray.depth
  );
}

export function table39222AllowableArea(widthIn, construction) {
  const width = parsePositiveNumber(widthIn);
  const normalizedConstruction = normalizeTrayConstruction(construction);
  if (!width || !normalizedConstruction) return null;
  const exactWidth = Object.keys(TABLE_392_22_A1)
    .map(Number)
    .find(candidate => Math.abs(candidate - width) <= 0.01);
  if (exactWidth === undefined) return null;
  return TABLE_392_22_A1[exactWidth][normalizedConstruction];
}

export function cableConductorCount(cable = {}) {
  const raw = firstValue(cable, CONDUCTOR_COUNT_FIELDS);
  const count = Number.parseInt(String(raw).match(/\d+/)?.[0] || '', 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}

export function cableConductorSize(cable = {}) {
  return text(firstValue(cable, CONDUCTOR_SIZE_FIELDS));
}

export function isFourOOrLarger(sizeValue) {
  const size = text(sizeValue).toUpperCase().replace(/MCM/g, 'KCMIL');
  if (!size) return null;
  const aught = size.match(/(^|[^0-9])(\d+)\s*\/\s*0(?:\s*AWG)?/);
  if (aught) return Number.parseInt(aught[2], 10) >= 4;
  const kcmil = size.match(/(\d+(?:\.\d+)?)\s*KCMIL/);
  if (kcmil) return Number.parseFloat(kcmil[1]) >= 250;
  if (/#\s*\d+/.test(size) || /\d+\s*AWG/.test(size)) return false;
  return null;
}

function normalizedCableType(cable = {}) {
  return text(cable.cable_type ?? cable.cableType ?? cable.type).toLowerCase();
}

function isControlOrSignal(cable = {}) {
  const type = normalizedCableType(cable);
  return /control|signal|instrument|communication|data|fiber/.test(type);
}

function makeIssue(code, severity, message, cable = '') {
  return { code, severity, message, cable };
}

function utilization(used, allowable) {
  return allowable > 0 ? used / allowable * 100 : null;
}

function finishResult(base, {
  arrangement,
  clause,
  tableColumn,
  used,
  allowable,
  ratios,
  issues = [],
}) {
  const utilizationPercent = ratios.length ? Math.max(...ratios) * 100 : 0;
  const failed = ratios.some(ratio => ratio > 1 + 1e-9);
  const status = failed ? 'fail' : 'pass';
  return {
    ...base,
    status,
    evaluable: true,
    arrangement,
    clause,
    tableColumn,
    used,
    allowable,
    utilizationPercent,
    marginPercent: 100 - utilizationPercent,
    issues,
  };
}

/**
 * Evaluate one tray cross-section using selected NEC 2023 Article 392 rules.
 * Areas and diameters are in square inches and inches respectively.
 */
export function evaluateTrayFill(tray = {}, cables = []) {
  const construction = normalizeTrayConstruction(
    tray.tray_type ?? tray.trayType ?? tray.construction ?? tray.type
  );
  const widthIn = trayInsideWidthIn(tray);
  const depthIn = trayUsableDepthIn(tray);
  const rows = Array.isArray(cables) ? cables.filter(cable => cable && typeof cable === 'object') : [];
  const issues = [];
  const missingInputs = [];
  const normalizedCables = [];

  if (!construction) missingInputs.push('tray construction (ladder/ventilated/wire-mesh or solid-bottom)');
  if (!widthIn) missingInputs.push('tray inside width');
  if (!rows.length) missingInputs.push('assigned cables');

  for (const cable of rows) {
    const id = cableId(cable);
    const conductorCount = cableConductorCount(cable);
    const areaPerCableIn2 = cableAreaIn2(cable);
    const quantity = physicalCableCount(cable);
    const size = cableConductorSize(cable);
    const fourOOrLarger = isFourOOrLarger(size);

    if (!conductorCount) missingInputs.push(`${id}: conductor count`);
    if (!areaPerCableIn2) missingInputs.push(`${id}: cable outside diameter or cross-sectional area`);
    if (conductorCount && conductorCount > 1 && fourOOrLarger === null && !isControlOrSignal(cable)) {
      missingInputs.push(`${id}: recognizable conductor size`);
    }

    normalizedCables.push({
      source: cable,
      id,
      conductorCount,
      areaPerCableIn2,
      totalAreaIn2: areaPerCableIn2 ? areaPerCableIn2 * quantity : null,
      diameterIn: areaPerCableIn2 ? 2 * Math.sqrt(areaPerCableIn2 / Math.PI) : null,
      quantity,
      size,
      fourOOrLarger,
      controlOrSignal: isControlOrSignal(cable),
    });
  }

  const base = {
    trayId: trayId(tray),
    basis: NEC_2023_TRAY_FILL_BASIS,
    construction,
    widthIn,
    depthIn,
    cableCount: normalizedCables.reduce((sum, cable) => sum + cable.quantity, 0),
    missingInputs: [...new Set(missingInputs)],
  };

  if (base.missingInputs.length) {
    return {
      ...base,
      status: 'incomplete',
      evaluable: false,
      arrangement: 'unresolved',
      clause: NEC_2023_TRAY_FILL_BASIS.article,
      tableColumn: null,
      used: {},
      allowable: {},
      utilizationPercent: null,
      marginPercent: null,
      issues: [makeIssue(
        'TRAY-FILL-MISSING-INPUT',
        'warning',
        `Article 392 fill cannot be evaluated: ${base.missingInputs.join('; ')}.`
      )],
    };
  }

  const singleConductors = normalizedCables.filter(cable => cable.conductorCount === 1);
  if (singleConductors.length) {
    return {
      ...base,
      status: 'screening',
      evaluable: false,
      arrangement: 'contains-single-conductor-cables',
      clause: '392.22(B)',
      tableColumn: null,
      used: {
        cableAreaIn2: normalizedCables.reduce((sum, cable) => sum + cable.totalAreaIn2, 0),
      },
      allowable: {},
      utilizationPercent: null,
      marginPercent: null,
      issues: [makeIssue(
        'TRAY-FILL-SINGLE-CONDUCTOR-OUT-OF-SCOPE',
        'warning',
        `Single-conductor cable arrangement requires the applicable 392.22(B) size, grouping, and tray-construction rule; no selected Article 392 pass is reported. Affected: ${singleConductors.map(cable => cable.id).join(', ')}.`
      )],
    };
  }

  const allControlSignal = normalizedCables.every(cable => cable.controlOrSignal);
  if (allControlSignal) {
    if (!depthIn) {
      return {
        ...base,
        status: 'incomplete',
        evaluable: false,
        arrangement: 'control-signal-only',
        clause: construction === 'solid' ? '392.22(A)(4)' : '392.22(A)(2)',
        tableColumn: null,
        used: {},
        allowable: {},
        utilizationPercent: null,
        marginPercent: null,
        missingInputs: [...base.missingInputs, 'tray usable inside depth'],
        issues: [makeIssue('TRAY-FILL-MISSING-DEPTH', 'warning', 'Control/signal-only fill requires tray usable inside depth.')],
      };
    }
    const depthBasisIn = Math.min(depthIn, 6);
    const limitFraction = construction === 'solid' ? 0.40 : 0.50;
    const cableAreaIn2 = normalizedCables.reduce((sum, cable) => sum + cable.totalAreaIn2, 0);
    const allowableAreaIn2 = widthIn * depthBasisIn * limitFraction;
    return finishResult(base, {
      arrangement: 'control-signal-only',
      clause: construction === 'solid' ? '392.22(A)(4)' : '392.22(A)(2)',
      tableColumn: null,
      used: { cableAreaIn2, depthBasisIn },
      allowable: { cableAreaIn2: allowableAreaIn2, limitPercent: limitFraction * 100 },
      ratios: [cableAreaIn2 / allowableAreaIn2],
      issues,
    });
  }

  const tableAreaIn2 = table39222AllowableArea(widthIn, construction);
  if (!tableAreaIn2) {
    return {
      ...base,
      status: 'incomplete',
      evaluable: false,
      arrangement: 'multiconductor-power-or-mixed',
      clause: construction === 'solid' ? '392.22(A)(3)' : '392.22(A)(1)',
      tableColumn: null,
      used: {},
      allowable: {},
      utilizationPercent: null,
      marginPercent: null,
      missingInputs: [...base.missingInputs, `listed Table 392.22(A)(1) tray width (received ${widthIn} in)`],
      issues: [makeIssue(
        'TRAY-FILL-UNLISTED-WIDTH',
        'warning',
        `${widthIn} in is not represented in the edition-pinned lookup. Verify the exact listed tray width or governing manufacturer/AHJ basis; interpolation is not performed.`
      )],
    };
  }

  const large = normalizedCables.filter(cable => cable.fourOOrLarger);
  const small = normalizedCables.filter(cable => !cable.fourOOrLarger);
  const largeDiameterIn = large.reduce((sum, cable) => sum + cable.diameterIn * cable.quantity, 0);
  const smallCableAreaIn2 = small.reduce((sum, cable) => sum + cable.totalAreaIn2, 0);
  const largeDiameterLimitIn = widthIn * (construction === 'solid' ? 0.90 : 1.00);
  const clauseRoot = construction === 'solid' ? '392.22(A)(3)' : '392.22(A)(1)';

  if (large.length && !small.length) {
    return finishResult(base, {
      arrangement: 'all-4/0-or-larger',
      clause: `${clauseRoot}(a)`,
      tableColumn: null,
      used: { largeCableDiameterIn: largeDiameterIn },
      allowable: { largeCableDiameterIn: largeDiameterLimitIn },
      ratios: [largeDiameterIn / largeDiameterLimitIn],
      issues,
    });
  }

  if (!large.length) {
    return finishResult(base, {
      arrangement: 'all-smaller-than-4/0',
      clause: `${clauseRoot}(b)`,
      tableColumn: construction === 'solid' ? 3 : 1,
      used: { smallCableAreaIn2 },
      allowable: { smallCableAreaIn2: tableAreaIn2 },
      ratios: [smallCableAreaIn2 / tableAreaIn2],
      issues,
    });
  }

  const diameterPenalty = construction === 'solid' ? largeDiameterIn : 1.2 * largeDiameterIn;
  const allowableSmallAreaIn2 = Math.max(0, tableAreaIn2 - diameterPenalty);
  return finishResult(base, {
    arrangement: 'mixed-4/0-boundary',
    clause: `${clauseRoot}(c)`,
    tableColumn: construction === 'solid' ? 4 : 2,
    used: { largeCableDiameterIn: largeDiameterIn, smallCableAreaIn2 },
    allowable: {
      largeCableDiameterIn: largeDiameterLimitIn,
      smallCableAreaIn2: allowableSmallAreaIn2,
      baseTableAreaIn2: tableAreaIn2,
      diameterPenaltyIn2: diameterPenalty,
    },
    ratios: [
      largeDiameterIn / largeDiameterLimitIn,
      allowableSmallAreaIn2 > 0 ? smallCableAreaIn2 / allowableSmallAreaIn2 : Infinity,
    ],
    issues,
  });
}

export function summarizeTrayFillResult(result = {}) {
  if (result.status === 'pass') {
    return `${result.utilizationPercent.toFixed(1)}% of the selected ${result.clause} allowance; ${result.marginPercent.toFixed(1)}% margin.`;
  }
  if (result.status === 'fail') {
    return `${result.utilizationPercent.toFixed(1)}% of the selected ${result.clause} allowance; exceeds by ${Math.abs(result.marginPercent).toFixed(1)}%.`;
  }
  return result.issues?.[0]?.message || 'Tray fill evidence is incomplete.';
}
