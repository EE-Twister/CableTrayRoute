import {
  buildGroundingFieldFidelityPackage,
  renderGroundingFieldFidelityHTML,
} from './groundingFieldFidelity.mjs';

export const ADVANCED_GROUNDING_VERSION = 'advanced-grounding-v1';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value, fallback = null) {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
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

function statusFromRatio(ratio) {
  if (!Number.isFinite(ratio)) return 'missingData';
  if (ratio > 1) return 'fail';
  if (ratio >= 0.85) return 'warn';
  return 'pass';
}

function recommendationFor(kind, status) {
  if (status === 'fail') {
    if (kind === 'gpr') return 'Perform transferred-voltage review for fences, remote grounds, communications, and metallic paths.';
    return 'Revise grid area, conductor spacing, rods, surface layer, or fault-clearing basis before release.';
  }
  if (status === 'warn') return 'Add design margin and verify soil data, fault current, and clearing time before issue.';
  if (status === 'missingData') return 'Run the IEEE 80 screening calculation before classifying this point.';
  return 'Keep this point in the grounding calculation package as a screening record.';
}

export function normalizeSoilResistivityMeasurements(rows = []) {
  return asArray(rows)
    .map((row, index) => {
      const method = String(row.method || row.testMethod || 'wenner').trim().toLowerCase();
      const spacingM = finiteNumber(row.spacingM ?? row.spacing ?? row.aM ?? row.a);
      const apparentResistivityOhmM = finiteNumber(
        row.apparentResistivityOhmM ?? row.rhoA ?? row.rho ?? row.resistivity
      );
      if (!Number.isFinite(spacingM) || spacingM <= 0) {
        throw new Error(`Soil measurement ${index + 1} has invalid spacing`);
      }
      if (!Number.isFinite(apparentResistivityOhmM) || apparentResistivityOhmM <= 0) {
        throw new Error(`Soil measurement ${index + 1} has invalid apparent resistivity`);
      }
      return {
        id: row.id || `soil-${index + 1}`,
        method: method === 'schlumberger' ? 'schlumberger' : 'wenner',
        spacingM: round(spacingM, 4),
        apparentResistivityOhmM: round(apparentResistivityOhmM, 3),
        source: row.source || '',
        notes: row.notes || '',
      };
    })
    .sort((a, b) => a.spacingM - b.spacingM || a.id.localeCompare(b.id));
}

function predictTwoLayerRho(spacingM, rho1, rho2, h) {
  const transition = 1 - Math.exp(-spacingM / Math.max(0.001, 2 * h));
  return rho1 + ((rho2 - rho1) * transition);
}

export function fitTwoLayerSoilModel(measurements = [], options = {}) {
  const normalized = normalizeSoilResistivityMeasurements(measurements);
  if (normalized.length < 2) {
    return {
      status: 'missingData',
      rho1: normalized[0]?.apparentResistivityOhmM || null,
      rho2: normalized[0]?.apparentResistivityOhmM || null,
      h: null,
      fitErrorPct: null,
      measurements: normalized,
      warnings: ['At least two measured apparent-resistivity rows are required for a two-layer screening fit.'],
      assumptions: ['Two-layer fit uses a deterministic exponential screening curve, not a commercial grounding solver.'],
    };
  }

  const minRho = Math.min(...normalized.map(row => row.apparentResistivityOhmM));
  const maxRho = Math.max(...normalized.map(row => row.apparentResistivityOhmM));
  const minSpacing = Math.min(...normalized.map(row => row.spacingM));
  const maxSpacing = Math.max(...normalized.map(row => row.spacingM));
  const rhoCandidates = [
    ...new Set([
      minRho,
      maxRho,
      normalized[0].apparentResistivityOhmM,
      normalized[normalized.length - 1].apparentResistivityOhmM,
      minRho * 0.75,
      minRho * 1.25,
      maxRho * 0.75,
      maxRho * 1.25,
      (minRho + maxRho) / 2,
    ].map(value => Math.max(1, round(value, 3)))),
  ].sort((a, b) => a - b);
  const hCandidates = [
    minSpacing / 2,
    minSpacing,
    (minSpacing + maxSpacing) / 3,
    (minSpacing + maxSpacing) / 2,
    maxSpacing / 2,
    maxSpacing,
    maxSpacing * 1.5,
    finiteNumber(options.initialH),
  ].filter(value => Number.isFinite(value) && value > 0);

  let best = null;
  rhoCandidates.forEach(rho1 => {
    rhoCandidates.forEach(rho2 => {
      hCandidates.forEach(h => {
        const squaredError = normalized.reduce((sum, row) => {
          const predicted = predictTwoLayerRho(row.spacingM, rho1, rho2, h);
          const rel = (predicted - row.apparentResistivityOhmM) / row.apparentResistivityOhmM;
          return sum + (rel * rel);
        }, 0);
        if (!best || squaredError < best.squaredError) {
          best = { rho1, rho2, h, squaredError };
        }
      });
    });
  });

  const fitErrorPct = Math.sqrt(best.squaredError / normalized.length) * 100;
  const status = fitErrorPct > 25 ? 'poorFit' : fitErrorPct > 12 ? 'review' : 'fit';
  const warnings = [];
  if (status === 'poorFit') warnings.push('Soil model fit error exceeds 25%; collect additional measurements or use a specialist grounding model.');
  if (normalized.length < 4) warnings.push('Soil fit is based on fewer than four measurements; verify seasonal and spacing coverage.');

  return {
    status,
    rho1: round(best.rho1, 3),
    rho2: round(best.rho2, 3),
    h: round(best.h, 3),
    fitErrorPct: round(fitErrorPct, 2),
    measurements: normalized,
    warnings,
    assumptions: [
      'Two-layer soil values are deterministic screening estimates from measured apparent resistivity.',
      'Final grounding design requires engineering verification and may require CDEGS, XGSLab, or equivalent detailed modeling.',
    ],
  };
}

function pointFrom(value, index) {
  const x = finiteNumber(value.x ?? value.xM ?? value[0]);
  const y = finiteNumber(value.y ?? value.yM ?? value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Polygon point ${index + 1} has invalid coordinates`);
  return {
    id: value.id || `p${index + 1}`,
    label: value.label || value.name || `P${index + 1}`,
    x: round(x, 4),
    y: round(y, 4),
  };
}

function area(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + ((point.x * next.y) - (next.x * point.y));
  }, 0) / 2);
}

function perimeter(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}

function bounds(points) {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    minX: round(Math.min(...xs), 4),
    minY: round(Math.min(...ys), 4),
    maxX: round(Math.max(...xs), 4),
    maxY: round(Math.max(...ys), 4),
    width: round(Math.max(...xs) - Math.min(...xs), 4),
    height: round(Math.max(...ys) - Math.min(...ys), 4),
  };
}

function orientation(a, b, c) {
  const value = ((b.y - a.y) * (c.x - b.x)) - ((b.x - a.x) * (c.y - b.y));
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

function hasSelfIntersection(points) {
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j];
      const d = points[(j + 1) % points.length];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

export function normalizeGroundingGeometry({ rectangle = null, polygon = [], rods = [], rings = [], remoteElectrodes = [] } = {}) {
  let points = asArray(polygon).map(pointFrom);
  if (points.length && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y) {
    points = points.slice(0, -1);
  }
  let mode = 'polygon';
  if (!points.length) {
    const lengthM = finiteNumber(rectangle?.lengthM ?? rectangle?.gridLx ?? rectangle?.length);
    const widthM = finiteNumber(rectangle?.widthM ?? rectangle?.gridLy ?? rectangle?.width);
    if (!Number.isFinite(lengthM) || lengthM <= 0 || !Number.isFinite(widthM) || widthM <= 0) {
      throw new Error('Grounding geometry requires either a valid polygon or rectangle dimensions');
    }
    mode = 'rectangle';
    points = [
      { id: 'p1', label: 'P1', x: 0, y: 0 },
      { id: 'p2', label: 'P2', x: round(lengthM, 4), y: 0 },
      { id: 'p3', label: 'P3', x: round(lengthM, 4), y: round(widthM, 4) },
      { id: 'p4', label: 'P4', x: 0, y: round(widthM, 4) },
    ];
  }
  if (points.length < 3) throw new Error('Polygon grounding geometry requires at least three points');
  if (hasSelfIntersection(points)) throw new Error('Polygon grounding geometry cannot self-intersect');

  const geometryBounds = bounds(points);
  const areaM2 = area(points);
  if (areaM2 <= 0) throw new Error('Grounding geometry area must be positive');

  return {
    mode,
    points,
    bounds: geometryBounds,
    areaM2: round(areaM2, 3),
    perimeterM: round(perimeter(points), 3),
    rods: asArray(rods).map((rod, index) => ({
      id: rod.id || `rod-${index + 1}`,
      label: rod.label || rod.name || `Rod ${index + 1}`,
      x: round(finiteNumber(rod.x ?? rod.xM, 0), 4),
      y: round(finiteNumber(rod.y ?? rod.yM, 0), 4),
      lengthM: round(finiteNumber(rod.lengthM ?? rod.length, 0), 3),
      notes: rod.notes || '',
    })),
    rings: asArray(rings).map((ring, index) => ({
      id: ring.id || `ring-${index + 1}`,
      label: ring.label || ring.name || `Ring ${index + 1}`,
      description: ring.description || '',
      lengthM: round(finiteNumber(ring.lengthM ?? ring.length, 0), 3),
    })),
    remoteElectrodes: asArray(remoteElectrodes).map((electrode, index) => ({
      id: electrode.id || `remote-${index + 1}`,
      label: electrode.label || electrode.name || `Remote ${index + 1}`,
      distanceM: round(finiteNumber(electrode.distanceM ?? electrode.distance, 0), 3),
      bondingPath: electrode.bondingPath || '',
      notes: electrode.notes || '',
    })),
  };
}

function defaultRiskCoordinates(geometry) {
  const b = geometry.bounds;
  return [
    { label: 'Grid center touch', x: b.minX + (b.width / 2), y: b.minY + (b.height / 2), kind: 'touch', source: 'generated' },
    { label: 'Perimeter step north', x: b.minX + (b.width / 2), y: b.maxY, kind: 'step', source: 'generated' },
    { label: 'Perimeter step east', x: b.maxX, y: b.minY + (b.height / 2), kind: 'step', source: 'generated' },
    { label: 'Transferred-voltage screen', x: b.maxX, y: b.maxY, kind: 'gpr', source: 'generated' },
  ];
}

export function buildGroundingRiskPoints({ geometry, result, soilModel = null, userPoints = [] } = {}) {
  if (!geometry) throw new Error('Grounding risk points require normalized geometry');
  const generated = defaultRiskCoordinates(geometry);
  const allPoints = [
    ...generated,
    ...asArray(userPoints).map((point, index) => ({
      label: point.label || point.name || `User Point ${index + 1}`,
      x: finiteNumber(point.x ?? point.xM, geometry.bounds.minX),
      y: finiteNumber(point.y ?? point.yM, geometry.bounds.minY),
      kind: String(point.kind || point.check || 'touch').toLowerCase(),
      source: 'user',
      notes: point.notes || '',
    })),
  ];

  const soilModifier = soilModel?.status === 'poorFit' ? 1.08 : soilModel?.status === 'review' ? 1.04 : 1;
  return allPoints.map((point, index) => {
    const kind = ['touch', 'step', 'gpr'].includes(point.kind) ? point.kind : 'touch';
    const actual = kind === 'step'
      ? finiteNumber(result?.Es)
      : kind === 'gpr'
        ? finiteNumber(result?.GPR)
        : finiteNumber(result?.Em);
    const limit = kind === 'step' ? finiteNumber(result?.Estep) : finiteNumber(result?.Etouch);
    const positionFactor = point.source === 'user' ? 1 : (1 + (index * 0.015));
    const adjustedActual = Number.isFinite(actual) ? actual * soilModifier * positionFactor : null;
    const ratio = Number.isFinite(adjustedActual) && Number.isFinite(limit) && limit > 0 ? adjustedActual / limit : null;
    const status = statusFromRatio(ratio);
    return {
      id: point.id || `risk-${index + 1}`,
      label: point.label,
      x: round(point.x, 4),
      y: round(point.y, 4),
      check: kind,
      actualV: round(adjustedActual, 1),
      limitV: round(limit, 1),
      ratio: round(ratio, 4),
      marginPct: Number.isFinite(ratio) ? round((1 - ratio) * 100, 1) : null,
      status,
      source: point.source || 'generated',
      recommendation: recommendationFor(kind, status),
      notes: point.notes || '',
    };
  });
}

export function buildGroundingHazardMap({ geometry, riskPoints = [], result = null } = {}) {
  if (!geometry) throw new Error('Hazard map requires normalized geometry');
  const points = asArray(riskPoints);
  const summary = {
    pass: points.filter(point => point.status === 'pass').length,
    warn: points.filter(point => point.status === 'warn').length,
    fail: points.filter(point => point.status === 'fail').length,
    missingData: points.filter(point => point.status === 'missingData').length,
  };
  return {
    type: 'grounding-hazard-map',
    geometry: {
      mode: geometry.mode,
      bounds: geometry.bounds,
      areaM2: geometry.areaM2,
      perimeterM: geometry.perimeterM,
      points: geometry.points,
    },
    resultSummary: result ? {
      Rg: round(result.Rg, 4),
      GPR: round(result.GPR, 1),
      Em: round(result.Em, 1),
      Es: round(result.Es, 1),
      Etouch: round(result.Etouch, 1),
      Estep: round(result.Estep, 1),
    } : null,
    legend: [
      { status: 'pass', label: 'Within screening limit', color: '#047857' },
      { status: 'warn', label: 'Within 15% of limit', color: '#b45309' },
      { status: 'fail', label: 'Above screening limit', color: '#b91c1c' },
      { status: 'missingData', label: 'Missing calculation data', color: '#6b7280' },
    ],
    points,
    summary,
  };
}

export function buildAdvancedGroundingPackage(context = {}) {
  const generatedAt = context.generatedAt || new Date().toISOString();
  const result = context.result || context.groundGridResult || null;
  const soilModel = context.soilModel || fitTwoLayerSoilModel(context.soilMeasurements || []);
  const rectangle = context.rectangle || {
    lengthM: result?.gridLx || result?.geometry?.gridLx || context.gridLx,
    widthM: result?.gridLy || result?.geometry?.gridLy || context.gridLy,
  };
  const geometry = normalizeGroundingGeometry({
    rectangle,
    polygon: context.polygon || [],
    rods: context.rods || [],
    rings: context.rings || [],
    remoteElectrodes: context.remoteElectrodes || [],
  });
  const riskPoints = buildGroundingRiskPoints({
    geometry,
    result,
    soilModel,
    userPoints: context.userPoints || [],
  });
  const hazardMap = buildGroundingHazardMap({ geometry, riskPoints, result });
  const fieldFidelityInput = context.fieldFidelity || context.fieldData || null;
  const fieldFidelity = fieldFidelityInput ? buildGroundingFieldFidelityPackage({
    projectName: context.projectName || 'Untitled Project',
    generatedAt,
    soilModel,
    geometry,
    riskPoints,
    fieldData: fieldFidelityInput,
    advancedGrounding: {
      soilModel,
      geometry,
      riskPoints,
    },
  }) : null;
  const warnings = [
    ...asArray(soilModel.warnings),
    ...(hazardMap.summary.fail > 0 ? ['One or more grounding hazard points exceed screening limits.'] : []),
    ...(hazardMap.summary.warn > 0 ? ['One or more grounding hazard points are within 15% of screening limits.'] : []),
    ...(geometry.remoteElectrodes.length > 0 ? ['Remote electrodes and transferred voltage require project-specific engineering review.'] : []),
    ...asArray(fieldFidelity?.warningRows).map(row => row.message).filter(Boolean),
  ];
  return {
    version: ADVANCED_GROUNDING_VERSION,
    generatedAt,
    projectName: context.projectName || 'Untitled Project',
    summary: {
      geometryMode: geometry.mode,
      areaM2: geometry.areaM2,
      perimeterM: geometry.perimeterM,
      riskPointCount: riskPoints.length,
      fail: hazardMap.summary.fail,
      warn: hazardMap.summary.warn,
      missingData: hazardMap.summary.missingData,
      soilFitStatus: soilModel.status,
      soilFitErrorPct: soilModel.fitErrorPct,
      fieldFidelityStatus: fieldFidelity?.summary?.status || 'notRun',
      fieldMeasurementCount: fieldFidelity?.summary?.measurementCount || 0,
      fallOfPotentialCount: fieldFidelity?.summary?.fallOfPotentialCount || 0,
      seasonalScenarioCount: fieldFidelity?.summary?.seasonalScenarioCount || 0,
    },
    soilModel,
    geometry,
    riskPoints,
    hazardMap,
    ...(fieldFidelity ? { fieldFidelity } : {}),
    warnings,
    assumptions: [
      'Advanced grounding outputs are deterministic local screening overlays on the IEEE 80 rectangular calculation.',
      'Irregular geometry and risk-point maps are planning aids and are not finite-element grounding simulations.',
      'Final grounding design requires engineer review and manufacturer or specialist-software verification where applicable.',
      ...asArray(fieldFidelity?.assumptions),
    ],
  };
}

export function renderAdvancedGroundingHTML(pkg = {}) {
  const summary = pkg.summary || {};
  const soil = pkg.soilModel || {};
  const riskPoints = asArray(pkg.riskPoints);
  return `<section class="report-section" id="rpt-advanced-grounding">
  <h2>Advanced Grounding Hazard Map</h2>
  <p class="report-note">Screening-grade grounding package only; not a CDEGS/XGSLab-class numerical model.</p>
  <dl class="report-dl">
    <dt>Geometry</dt><dd>${escapeHtml(summary.geometryMode || 'rectangle')}</dd>
    <dt>Area</dt><dd>${escapeHtml(summary.areaM2 ?? '—')} m²</dd>
    <dt>Perimeter</dt><dd>${escapeHtml(summary.perimeterM ?? '—')} m</dd>
    <dt>Soil Fit</dt><dd>${escapeHtml(soil.status || 'missingData')} (${escapeHtml(soil.fitErrorPct ?? '—')}% RMS error)</dd>
    <dt>Risk Points</dt><dd>${escapeHtml(summary.riskPointCount || 0)}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Point</th><th>Check</th><th>Actual V</th><th>Limit V</th><th>Margin %</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${riskPoints.length ? riskPoints.map(point => `<tr>
        <td>${escapeHtml(point.label)}</td>
        <td>${escapeHtml(point.check)}</td>
        <td>${escapeHtml(point.actualV ?? '—')}</td>
        <td>${escapeHtml(point.limitV ?? '—')}</td>
        <td>${escapeHtml(point.marginPct ?? '—')}</td>
        <td>${escapeHtml(point.status)}</td>
        <td>${escapeHtml(point.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="7">No advanced grounding risk points available.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<p class="report-note">${asArray(pkg.warnings).map(escapeHtml).join(' | ')}</p>` : ''}
  ${pkg.fieldFidelity ? renderGroundingFieldFidelityHTML(pkg.fieldFidelity) : ''}
</section>`;
}
