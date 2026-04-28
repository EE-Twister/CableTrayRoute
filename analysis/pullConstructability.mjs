import { calcSidewallPressure } from '../src/pullCalc.js';

export const PULL_CONSTRUCTABILITY_VERSION = 'pull-constructability-v1';

const DEFAULTS = {
  frictionCoefficient: 0.35,
  lubricantFactor: 1,
  ambientTempC: 30,
  jacketMaterial: 'XLPE',
  compareReverse: true,
  feedDirection: 'forward',
  conduitFillLimitPct: 40,
  jamRatioWarningLow: 2.8,
  jamRatioWarningHigh: 3.2,
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusFromMargin(margin, hasLimit) {
  if (!hasLimit) return 'missingData';
  if (margin < 0) return 'fail';
  if (margin <= 0.1) return 'warn';
  return 'pass';
}

function worstStatus(statuses = []) {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.includes('missingData')) return 'missingData';
  return 'pass';
}

function pointZ(point) {
  if (Array.isArray(point)) return num(point[2], 0);
  if (point && typeof point === 'object') return num(point.z, 0);
  return 0;
}

function vectorFromStep(step = {}) {
  const start = step.start || step.raw?.start;
  const end = step.end || step.raw?.end;
  if (!Array.isArray(start) || !Array.isArray(end)) return null;
  return [
    num(end[0], 0) - num(start[0], 0),
    num(end[1], 0) - num(start[1], 0),
    num(end[2], 0) - num(start[2], 0),
  ];
}

function angleBetween(a, b) {
  if (!a || !b) return 0;
  const amag = Math.hypot(a[0], a[1], a[2]);
  const bmag = Math.hypot(b[0], b[1], b[2]);
  if (!amag || !bmag) return 0;
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ratio = Math.max(-1, Math.min(1, dot / (amag * bmag)));
  return Math.acos(ratio);
}

function cableAreaSqIn(diameterIn = 0, count = 1) {
  const diameter = positive(diameterIn, 0) || 0;
  return Math.PI * (diameter / 2) ** 2 * Math.max(1, Math.round(num(count, 1)));
}

function pullCableArea(pullCard = {}) {
  if (Number.isFinite(Number(pullCard.total_cross_section_area_sqin))) return num(pullCard.total_cross_section_area_sqin, 0);
  return asArray(pullCard.cables).reduce((sum, cable) => {
    const count = Math.max(1, Math.round(num(cable.parallel_count, 1)));
    return sum + cableAreaSqIn(cable.diameter || cable.od || cable.outerDiameterIn, count);
  }, 0);
}

function pullMaxOd(pullCard = {}) {
  if (Number.isFinite(Number(pullCard.max_diameter_in))) return num(pullCard.max_diameter_in, 0);
  return Math.max(0, ...asArray(pullCard.cables).map(cable => num(cable.diameter || cable.od || cable.outerDiameterIn, 0)));
}

function pullWeight(pullCard = {}) {
  if (Number.isFinite(Number(pullCard.total_weight_lb_ft))) return num(pullCard.total_weight_lb_ft, 0);
  return asArray(pullCard.cables).reduce((sum, cable) => {
    const count = Math.max(1, Math.round(num(cable.parallel_count, 1)));
    return sum + num(cable.weight || cable.weight_lb_ft, 0) * count;
  }, 0);
}

export function normalizePullConstructabilityInputs(input = {}) {
  const warnings = [];
  const frictionCoefficient = positive(input.frictionCoefficient ?? input.coeffFriction ?? input.mu, DEFAULTS.frictionCoefficient);
  const lubricantFactor = positive(input.lubricantFactor, DEFAULTS.lubricantFactor);
  const pullingEquipmentLimitLbs = positive(input.pullingEquipmentLimitLbs ?? input.equipmentLimitLbs, null);
  const allowableSidewallPressureLbsPerFt = positive(input.allowableSidewallPressureLbsPerFt ?? input.maxSidewallPressure, null);
  const allowableTensionLbs = positive(input.allowableTensionLbs, null);
  const conduitInsideDiameterIn = positive(input.conduitInsideDiameterIn, null);
  const feedDirection = input.feedDirection === 'reverse' ? 'reverse' : 'forward';

  if (!pullingEquipmentLimitLbs && !allowableTensionLbs) warnings.push('No pulling-equipment or cable allowable tension limit supplied.');
  if (!allowableSidewallPressureLbsPerFt) warnings.push('No allowable sidewall pressure supplied.');
  if (!conduitInsideDiameterIn) warnings.push('No default conduit inside diameter supplied; conduit fill and jam ratio may be missing.');

  return {
    frictionCoefficient,
    lubricantFactor,
    effectiveFrictionCoefficient: round(frictionCoefficient / lubricantFactor, 4),
    ambientTempC: num(input.ambientTempC, DEFAULTS.ambientTempC),
    jacketMaterial: String(input.jacketMaterial || DEFAULTS.jacketMaterial).toUpperCase(),
    feedDirection,
    compareReverse: input.compareReverse !== false,
    pullingEquipmentLimitLbs,
    allowableTensionLbs,
    allowableSidewallPressureLbsPerFt,
    conduitInsideDiameterIn,
    conduitFillLimitPct: positive(input.conduitFillLimitPct, DEFAULTS.conduitFillLimitPct),
    jamRatioWarningLow: positive(input.jamRatioWarningLow, DEFAULTS.jamRatioWarningLow),
    jamRatioWarningHigh: positive(input.jamRatioWarningHigh, DEFAULTS.jamRatioWarningHigh),
    sectionOverrides: input.sectionOverrides && typeof input.sectionOverrides === 'object' ? input.sectionOverrides : {},
    bendOverrides: input.bendOverrides && typeof input.bendOverrides === 'object' ? input.bendOverrides : {},
    notes: String(input.notes || ''),
    warnings,
  };
}

export function buildPullSectionsFromPullCard(pullCard = {}, options = {}) {
  const inputs = normalizePullConstructabilityInputs(options);
  const rows = asArray(pullCard.route_steps).map((step, index) => {
    const id = `pull-${pullCard.pull_number || 'x'}-section-${step.step || index + 1}`;
    const override = inputs.sectionOverrides[id] || {};
    const start = step.start || step.raw?.start || null;
    const end = step.end || step.raw?.end || null;
    const lengthFt = num(override.lengthFt ?? step.length, 0);
    const warnings = [];
    if (lengthFt < 0) warnings.push('Section length cannot be negative.');
    if (!start || !end) warnings.push('Section has no 3D endpoints; flat-route screening assumption applied.');
    const conduitInsideDiameterIn = positive(
      override.conduitInsideDiameterIn ?? step.raw?.conduitInsideDiameterIn ?? step.raw?.insideDiameterIn ?? inputs.conduitInsideDiameterIn,
      null,
    );
    const frictionCoefficient = positive(override.frictionCoefficient ?? step.raw?.frictionCoefficient ?? inputs.frictionCoefficient, inputs.frictionCoefficient);
    const lubricantFactor = positive(override.lubricantFactor ?? inputs.lubricantFactor, inputs.lubricantFactor);
    return {
      id,
      pullNumber: pullCard.pull_number || '',
      step: step.step || index + 1,
      type: step.type || 'Field',
      racewayId: step.id || step.raw?.tray_id || step.raw?.conduit_id || '',
      lengthFt: Math.max(0, round(lengthFt, 2) || 0),
      start,
      end,
      verticalRiseFt: round(pointZ(end) - pointZ(start), 2) || 0,
      frictionCoefficient,
      lubricantFactor,
      effectiveFrictionCoefficient: round(frictionCoefficient / lubricantFactor, 4),
      conduitInsideDiameterIn,
      notes: String(override.notes || step.raw?.notes || ''),
      warnings,
      valid: warnings.every(warning => !/cannot be negative/i.test(warning)),
    };
  });
  return rows;
}

export function normalizePullBendRows(rows = []) {
  return asArray(rows).map((row, index) => {
    const angleDeg = num(row.angleDeg ?? (Number.isFinite(Number(row.angleRad)) ? num(row.angleRad) * 180 / Math.PI : row.angle), 0);
    const radiusFt = positive(row.radiusFt ?? row.radius, null);
    const warnings = [];
    if (angleDeg < 0) warnings.push('Bend angle cannot be negative.');
    if (!radiusFt) warnings.push('Bend radius is missing; sidewall pressure cannot be verified.');
    return {
      id: row.id || `bend-${index + 1}`,
      pullNumber: row.pullNumber || '',
      step: num(row.step, index + 1),
      label: String(row.label || row.racewayId || `Bend ${index + 1}`),
      angleDeg: Math.max(0, round(angleDeg, 2) || 0),
      angleRad: Math.max(0, num(row.angleRad, angleDeg * Math.PI / 180)),
      radiusFt,
      source: row.source || 'user',
      notes: String(row.notes || ''),
      warnings,
      valid: warnings.every(warning => !/cannot be negative/i.test(warning)),
    };
  });
}

function inferBendRows(pullCard = {}, options = {}) {
  const inputs = normalizePullConstructabilityInputs(options);
  const explicit = asArray(pullCard.route_segments)
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment?.type === 'bend')
    .map(({ segment, index }) => {
      const id = `pull-${pullCard.pull_number || 'x'}-bend-${index + 1}`;
      const override = inputs.bendOverrides[id] || {};
      return {
        id,
        pullNumber: pullCard.pull_number || '',
        step: index + 1,
        label: segment.id || `Bend ${index + 1}`,
        angleRad: override.angleRad ?? segment.angle ?? 0,
        radiusFt: override.radiusFt ?? segment.radius ?? null,
        source: 'route-segment',
        notes: override.notes || segment.notes || '',
      };
    });
  if (explicit.length) return normalizePullBendRows(explicit);

  const routeSteps = asArray(pullCard.route_steps);
  const inferred = [];
  for (let index = 1; index < routeSteps.length; index += 1) {
    const angleRad = angleBetween(vectorFromStep(routeSteps[index - 1]), vectorFromStep(routeSteps[index]));
    if (angleRad > 0.05) {
      const id = `pull-${pullCard.pull_number || 'x'}-bend-${index}`;
      const override = inputs.bendOverrides[id] || {};
      inferred.push({
        id,
        pullNumber: pullCard.pull_number || '',
        step: routeSteps[index - 1].step || index,
        label: `${routeSteps[index - 1].id || 'Section'} to ${routeSteps[index].id || 'Section'}`,
        angleRad: override.angleRad ?? angleRad,
        radiusFt: override.radiusFt ?? null,
        source: 'inferred-direction-change',
        notes: override.notes || '',
      });
    }
  }
  return normalizePullBendRows(inferred);
}

function sectionFillRows(pullCard, sections, inputs) {
  const cableArea = pullCableArea(pullCard);
  const maxOd = pullMaxOd(pullCard);
  return sections.map(section => {
    const conduitId = section.type === 'Conduit' || section.conduitInsideDiameterIn;
    if (!conduitId) {
      return {
        sectionId: section.id,
        pullNumber: section.pullNumber,
        fillPct: null,
        jamRatio: null,
        status: 'pass',
        warnings: [],
      };
    }
    const warnings = [];
    const conduitIdIn = section.conduitInsideDiameterIn;
    if (!conduitIdIn) warnings.push('Missing conduit inside diameter for fill and jam-ratio checks.');
    if (!maxOd) warnings.push('Missing cable outside diameter for jam-ratio check.');
    const conduitArea = conduitIdIn ? Math.PI * (conduitIdIn / 2) ** 2 : 0;
    const fillPct = conduitArea > 0 ? (cableArea / conduitArea) * 100 : null;
    const jamRatio = conduitIdIn && maxOd ? conduitIdIn / maxOd : null;
    const fillStatus = fillPct == null ? 'missingData' : fillPct > inputs.conduitFillLimitPct ? 'fail' : fillPct > inputs.conduitFillLimitPct * 0.9 ? 'warn' : 'pass';
    const jamStatus = jamRatio == null ? 'missingData' : jamRatio >= inputs.jamRatioWarningLow && jamRatio <= inputs.jamRatioWarningHigh ? 'warn' : 'pass';
    if (jamStatus === 'warn') warnings.push(`Jam ratio ${round(jamRatio, 2)} is in the screening caution range.`);
    if (fillStatus === 'fail') warnings.push(`Conduit fill ${round(fillPct, 1)}% exceeds ${inputs.conduitFillLimitPct}%.`);
    return {
      sectionId: section.id,
      pullNumber: section.pullNumber,
      fillPct: round(fillPct, 1),
      jamRatio: round(jamRatio, 2),
      status: worstStatus([fillStatus, jamStatus]),
      warnings,
    };
  });
}

export function evaluatePullDirection({ pullCard = {}, sections = [], bends = [], options = {}, direction = 'forward' } = {}) {
  const inputs = normalizePullConstructabilityInputs(options);
  const sourceSections = sections.length ? sections : buildPullSectionsFromPullCard(pullCard, inputs);
  const sourceBends = bends.length ? normalizePullBendRows(bends) : inferBendRows(pullCard, inputs);
  const orderedSections = direction === 'reverse'
    ? [...sourceSections].reverse().map(section => ({ ...section, verticalRiseFt: -num(section.verticalRiseFt, 0) }))
    : [...sourceSections];
  const orderedBends = direction === 'reverse' ? [...sourceBends].reverse() : [...sourceBends];
  const weight = pullWeight(pullCard);
  const warnings = [...inputs.warnings];
  let tension = 0;
  let maxTension = 0;
  let maxSidewall = 0;
  let verticalLiftLbs = 0;
  const sectionRows = [];
  const bendRows = [];

  orderedSections.forEach((section, index) => {
    const mu = positive(section.effectiveFrictionCoefficient, inputs.effectiveFrictionCoefficient);
    const lift = Math.max(0, num(section.verticalRiseFt, 0)) * weight;
    const entryTension = tension;
    tension += weight * mu * num(section.lengthFt, 0) + lift;
    verticalLiftLbs += lift;
    maxTension = Math.max(maxTension, tension);
    sectionRows.push({
      ...section,
      direction,
      sequence: index + 1,
      entryTensionLbs: round(entryTension, 1),
      exitTensionLbs: round(tension, 1),
      verticalLiftLbs: round(lift, 1),
    });

    const bend = orderedBends.find(row => Math.round(num(row.step, 0)) === Math.round(num(section.step, 0))) || orderedBends[index];
    if (bend && !bendRows.some(row => row.id === bend.id)) {
      const radius = positive(bend.radiusFt, null);
      const angleRad = num(bend.angleRad, num(bend.angleDeg, 0) * Math.PI / 180);
      const arcLength = radius ? radius * angleRad : 0;
      const bendEntry = tension;
      tension += weight * mu * arcLength;
      tension *= Math.exp(mu * angleRad);
      maxTension = Math.max(maxTension, tension);
      const sidewall = radius ? calcSidewallPressure(radius, tension) : null;
      maxSidewall = Math.max(maxSidewall, sidewall || 0);
      bendRows.push({
        ...bend,
        direction,
        entryTensionLbs: round(bendEntry, 1),
        exitTensionLbs: round(tension, 1),
        sidewallPressureLbsPerFt: round(sidewall, 1),
        status: sidewall == null ? 'missingData' : statusFromMargin((inputs.allowableSidewallPressureLbsPerFt - sidewall) / inputs.allowableSidewallPressureLbsPerFt, Boolean(inputs.allowableSidewallPressureLbsPerFt)),
      });
    }
  });

  if (!sourceBends.length) warnings.push('No bend rows were available or inferred; sidewall pressure is screening-only.');
  sourceSections.forEach(section => asArray(section.warnings).forEach(warning => warnings.push(`${section.id}: ${warning}`)));
  sourceBends.forEach(bend => asArray(bend.warnings).forEach(warning => warnings.push(`${bend.id}: ${warning}`)));

  const tensionLimit = Math.min(...[inputs.allowableTensionLbs, inputs.pullingEquipmentLimitLbs].filter(Boolean));
  const hasTensionLimit = Number.isFinite(tensionLimit);
  const tensionMarginPct = hasTensionLimit && tensionLimit > 0 ? (tensionLimit - maxTension) / tensionLimit : null;
  const sidewallMarginPct = inputs.allowableSidewallPressureLbsPerFt && maxSidewall > 0
    ? (inputs.allowableSidewallPressureLbsPerFt - maxSidewall) / inputs.allowableSidewallPressureLbsPerFt
    : null;
  if (hasTensionLimit && tensionMarginPct < 0) warnings.push(`Maximum pull tension ${round(maxTension, 1)} lbs exceeds limit ${round(tensionLimit, 1)} lbs.`);
  if (hasTensionLimit && tensionMarginPct >= 0 && tensionMarginPct <= 0.1) warnings.push(`Maximum pull tension ${round(maxTension, 1)} lbs is within 10% of the limit.`);
  if (inputs.allowableSidewallPressureLbsPerFt && maxSidewall > inputs.allowableSidewallPressureLbsPerFt) {
    warnings.push(`Maximum sidewall pressure ${round(maxSidewall, 1)} lbs/ft exceeds limit ${round(inputs.allowableSidewallPressureLbsPerFt, 1)} lbs/ft.`);
  }
  if (inputs.allowableSidewallPressureLbsPerFt && sidewallMarginPct >= 0 && sidewallMarginPct <= 0.1) {
    warnings.push(`Maximum sidewall pressure ${round(maxSidewall, 1)} lbs/ft is within 10% of the limit.`);
  }
  const fillRows = sectionFillRows(pullCard, sourceSections, inputs);
  fillRows.forEach(row => asArray(row.warnings).forEach(warning => warnings.push(`${row.sectionId}: ${warning}`)));
  const status = worstStatus([
    statusFromMargin(tensionMarginPct, hasTensionLimit),
    maxSidewall > 0 || sourceBends.length ? statusFromMargin(sidewallMarginPct, Boolean(inputs.allowableSidewallPressureLbsPerFt)) : 'missingData',
    ...fillRows.map(row => row.status),
    ...bendRows.map(row => row.status),
  ]);

  return {
    pullNumber: pullCard.pull_number || '',
    direction,
    cableTags: asArray(pullCard.cable_tags),
    finalTensionLbs: round(tension, 1),
    maxTensionLbs: round(maxTension, 1),
    tensionLimitLbs: hasTensionLimit ? round(tensionLimit, 1) : null,
    tensionMarginPct: round(tensionMarginPct != null ? tensionMarginPct * 100 : null, 1),
    maxSidewallPressureLbsPerFt: round(maxSidewall, 1),
    allowableSidewallPressureLbsPerFt: inputs.allowableSidewallPressureLbsPerFt,
    sidewallMarginPct: round(sidewallMarginPct != null ? sidewallMarginPct * 100 : null, 1),
    verticalLiftLbs: round(verticalLiftLbs, 1),
    status,
    sectionRows,
    bendRows,
    fillRows,
    warnings: [...new Set(warnings)],
  };
}

export function comparePullDirections({ pullCard = {}, sections = [], bends = [], options = {} } = {}) {
  const forward = evaluatePullDirection({ pullCard, sections, bends, options, direction: 'forward' });
  const reverse = evaluatePullDirection({ pullCard, sections, bends, options, direction: 'reverse' });
  const preferred = reverse.status === 'fail' && forward.status !== 'fail'
    ? 'forward'
    : forward.status === 'fail' && reverse.status !== 'fail'
      ? 'reverse'
      : (reverse.maxTensionLbs || 0) < (forward.maxTensionLbs || 0) ? 'reverse' : 'forward';
  const tensionReductionPct = forward.maxTensionLbs > 0
    ? ((forward.maxTensionLbs - reverse.maxTensionLbs) / forward.maxTensionLbs) * 100
    : 0;
  return {
    pullNumber: pullCard.pull_number || '',
    forward,
    reverse,
    recommendedDirection: preferred,
    tensionReductionPct: round(tensionReductionPct, 1),
    recommendation: preferred === 'reverse'
      ? 'Reverse pull direction is lower tension in the screening model; verify reel location and field access.'
      : 'Forward pull direction is acceptable or lower risk in the screening model.',
  };
}

export function buildPullConstructabilityPackage({ pullTable = {}, routeResults = [], cableList = [], options = {} } = {}) {
  const inputs = normalizePullConstructabilityInputs(options);
  const pulls = asArray(pullTable.pulls || pullTable);
  const comparisons = pulls.map(pullCard => {
    const sections = buildPullSectionsFromPullCard(pullCard, inputs);
    const bends = inferBendRows(pullCard, inputs);
    return comparePullDirections({ pullCard, sections, bends, options: inputs });
  });
  const warningRows = comparisons.flatMap(comparison => {
    const active = comparison[comparison.recommendedDirection] || comparison.forward;
    return active.warnings.map((message, index) => ({
      id: `pull-${comparison.pullNumber}-warning-${index + 1}`,
      pullNumber: comparison.pullNumber,
      severity: /exceeds|cannot|missing|No /.test(message) ? 'warning' : 'info',
      message,
      recommendation: 'Verify pull assumptions, route geometry, and field equipment limits before construction release.',
    }));
  });
  const pullRows = comparisons.map(comparison => {
    const active = comparison[comparison.recommendedDirection] || comparison.forward;
    return {
      pullNumber: comparison.pullNumber,
      cableTags: active.cableTags.join(', '),
      recommendedDirection: comparison.recommendedDirection,
      status: active.status,
      maxTensionLbs: active.maxTensionLbs,
      tensionLimitLbs: active.tensionLimitLbs,
      tensionMarginPct: active.tensionMarginPct,
      maxSidewallPressureLbsPerFt: active.maxSidewallPressureLbsPerFt,
      sidewallMarginPct: active.sidewallMarginPct,
      verticalLiftLbs: active.verticalLiftLbs,
      warningCount: active.warnings.length,
    };
  });
  const allStatuses = pullRows.map(row => row.status);
  return {
    version: PULL_CONSTRUCTABILITY_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    summary: {
      pullCount: pulls.length,
      pass: allStatuses.filter(status => status === 'pass').length,
      warn: allStatuses.filter(status => status === 'warn').length,
      fail: allStatuses.filter(status => status === 'fail').length,
      missingData: allStatuses.filter(status => status === 'missingData').length,
      warningCount: warningRows.length,
      routeResultCount: asArray(routeResults).length,
      cableCount: asArray(cableList).length,
    },
    inputs,
    pullRows,
    sectionRows: comparisons.flatMap(comparison => comparison.forward.sectionRows),
    bendRows: comparisons.flatMap(comparison => comparison.forward.bendRows),
    directionComparisons: comparisons,
    warningRows,
    assumptions: [
      'Cable pulling constructability is deterministic screening based on pull-card route geometry and capstan-style tension calculations.',
      'Per-section friction, lubricant, bend radius, conduit ID, and equipment limits should be verified against project specifications and field conditions.',
      'Reverse-pull recommendations do not automatically change route, reel, or construction sequencing records.',
    ],
  };
}

export function renderPullConstructabilityHTML(pkg = {}) {
  const pullRows = asArray(pkg.pullRows);
  const warningRows = asArray(pkg.warningRows);
  return `<section class="report-section" id="rpt-pull-constructability">
  <h2>Cable Pull Constructability</h2>
  <p class="report-note">Screening-grade pull physics package. Final pulling plan, equipment setup, lubricant, conduit dimensions, and bend radii require construction verification.</p>
  <dl class="report-dl">
    <dt>Pulls</dt><dd>${esc(pkg.summary?.pullCount || 0)}</dd>
    <dt>Pass</dt><dd>${esc(pkg.summary?.pass || 0)}</dd>
    <dt>Warnings</dt><dd>${esc(pkg.summary?.warn || 0)}</dd>
    <dt>Failures</dt><dd>${esc(pkg.summary?.fail || 0)}</dd>
    <dt>Missing Data</dt><dd>${esc(pkg.summary?.missingData || 0)}</dd>
  </dl>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Pull</th><th>Cables</th><th>Direction</th><th>Status</th><th>Max Tension</th><th>Tension Limit</th><th>Max Sidewall</th><th>Sidewall Margin</th><th>Warnings</th></tr></thead>
    <tbody>${pullRows.length ? pullRows.map(row => `<tr>
      <td>${esc(row.pullNumber)}</td>
      <td>${esc(row.cableTags)}</td>
      <td>${esc(row.recommendedDirection)}</td>
      <td>${esc(row.status)}</td>
      <td>${esc(row.maxTensionLbs ?? '')}</td>
      <td>${esc(row.tensionLimitLbs ?? 'missing')}</td>
      <td>${esc(row.maxSidewallPressureLbsPerFt ?? '')}</td>
      <td>${esc(row.sidewallMarginPct ?? 'missing')}</td>
      <td>${esc(row.warningCount)}</td>
    </tr>`).join('') : '<tr><td colspan="9">No pull constructability rows.</td></tr>'}</tbody>
  </table>
  </div>
  ${warningRows.length ? `<div class="report-scroll"><table class="report-table">
    <thead><tr><th>Pull</th><th>Severity</th><th>Warning</th><th>Recommendation</th></tr></thead>
    <tbody>${warningRows.map(row => `<tr>
      <td>${esc(row.pullNumber)}</td><td>${esc(row.severity)}</td><td>${esc(row.message)}</td><td>${esc(row.recommendation)}</td>
    </tr>`).join('')}</tbody>
  </table></div>` : '<p class="report-empty">No constructability warnings.</p>'}
</section>`;
}
