import curveData from '../data/designSynthesisEatonCurveResearch.json' with { type: 'json' };
import snapshot from '../data/designSynthesisDevices.json' with { type: 'json' };
import { fingerprintStudyValue } from './studyLifecycle.mjs';
import { designSynthesisCurveSourceEvidence } from './designSynthesisCurveEvidence.mjs';
import { evaluateSourceBoundCurve } from './sourceBoundCurveEvaluator.mjs';

const DATA_FINGERPRINT = 'fnv1a-ed512259';
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
deepFreeze(curveData);
const sourceIntact = fingerprintStudyValue(curveData) === DATA_FINGERPRINT;
const records = new Map(curveData.records.map(row => [row.id, row]));
const catalog = new Map(snapshot.records.map(row => [row.id, row]));
const finite = value => typeof value === 'number' && Number.isFinite(value);
export const getEatonCurveResearchFingerprint = () => sourceIntact ? DATA_FINGERPRINT : null;

function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a).sort(); const right = Object.keys(b).sort();
  return left.length === right.length && left.every((key, index) => key === right[index] && sameValue(a[key], b[key]));
}

/** A chart reading under a hypothetical constant current, not actual protective clearing. */
export function evaluateEatonConstantCurrentPlot({ device, voltageVac, currentA } = {}) {
  const reference = catalog.get(device?.id);
  const source = reference && designSynthesisCurveSourceEvidence(reference);
  const geometry = records.get(device?.id);
  const base = { status: 'unavailable', currentA: finite(currentA) ? currentA : null,
    voltageVac: finite(voltageVac) ? voltageVac : null, plotUpperTimeSeconds: null,
    currentAssumption: 'hypothetical constant symmetrical RMS current; initial fault RMS is not a current history',
    intendedUse: 'graphical research only; not actual clearing, coordination, a device setting, or protection approval' };
  if (!sourceIntact) return { ...base, status: 'source-data-changed' };
  if (!reference || !source || !geometry || !device || !Object.keys(reference).every(key => sameValue(device[key], reference[key]))) {
    return { ...base, status: 'unsupported-or-changed-device' };
  }
  const selected = geometry.voltageCurves[String(voltageVac)];
  if (!Array.isArray(selected) || ![240, 480, 600].includes(voltageVac)) return { ...base, status: 'unsupported-voltage' };
  const byIndex = new Map(geometry.curves.map(curve => [curve.sourceCurveIndex, curve]));
  const runs = [];
  for (const index of selected) {
    const curve = byIndex.get(index);
    if (!curve || !Array.isArray(curve.runs)) return { ...base, status: 'source-data-invalid' };
    curve.runs.forEach((points, runIndex) => runs.push({ componentId: `curve-${index}-run-${runIndex}`,
      strokeWidthPt: curve.strokeWidthPt, points: points.map(([xPt, yPt]) => ({ xPt, yPt })) }));
  }
  try {
    const x = geometry.axes.x; const y = geometry.axes.y; const bounds = geometry.plotBoundsPt;
    const reading = evaluateSourceBoundCurve({ runs, xAxis: x, yAxis: y,
      chartBounds: { xMinPt: bounds.xMin, xMaxPt: bounds.xMax, yMinPt: bounds.yMin, yMaxPt: bounds.yMax },
      currentA, voltage: voltageVac, supportedVoltages: [240, 480, 600],
      uncertainty: { flattenPt: curveData.flatteningMaximumDeviationPt,
        gridXPt: x.maxLog10Residual / Math.abs(x.log10ValuePerPoint),
        gridYPt: y.maxLog10Residual / Math.abs(y.log10ValuePerPoint) } });
    return { ...base, status: reading.status, plotUpperTimeSeconds: reading.timeSeconds,
      source: { document: curveData.source.document, url: curveData.source.url, sha256: curveData.source.pdfSha256,
        pageOneBased: geometry.page, figure: geometry.figure, curveId: geometry.curveId, datasetFingerprint: DATA_FINGERPRINT },
      conditions: source.conditions, limitingComponentId: reading.limitingComponentId ?? null,
      limitingSegmentIndex: reading.limitingSegmentIndex ?? null,
      graphicalUncertainty: 'Includes plotted stroke width, grid-fit residual and polyline approximation; not a manufacturer electrical tolerance.',
      coverage: reading.evaluatedCoordinateBandPt || reading.requiredCoordinateBandPt || null };
  } catch {
    return { ...base, status: 'source-data-invalid' };
  }
}
