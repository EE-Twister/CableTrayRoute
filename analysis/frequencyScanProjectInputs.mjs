import { buildLoadFlowModel } from './loadFlowModel.js';
import { fingerprintStudySource } from './studyResultReadiness.mjs';

function finite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function componentsFrom(oneLine = {}) {
  return (Array.isArray(oneLine.sheets) ? oneLine.sheets : [])
    .flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []);
}

function propsOf(component = {}) {
  return { ...component, ...(component.parameters || {}), ...(component.props || {}) };
}

function labelOf(component, index) {
  const props = propsOf(component);
  return props.tag || props.ref || props.name || props.label || component.id || `Item ${index + 1}`;
}

function findFirstNumber(value, keys, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  for (const key of keys) {
    const number = finite(value[key]);
    if (number !== null && number > 0) return number;
  }
  for (const child of Object.values(value)) {
    const found = findFirstNumber(child, keys, seen);
    if (found !== null) return found;
  }
  return null;
}

export function buildFrequencyScanProjectInputs(oneLine = {}, studies = {}, cableSchedule = []) {
  const model = buildLoadFlowModel(oneLine);
  const components = componentsFrom(oneLine);
  const systemKv = finite(
    model.buses.find(bus => String(bus.busType || bus.type).toLowerCase() === 'slack')?.baseKV,
    model.buses[0]?.baseKV
  );
  const shortCircuit = studies.shortCircuit || studies.iec60909 || {};
  const faultKa = findFirstNumber(shortCircuit, [
    'availableFaultKa', 'availableFaultKA', 'faultCurrentKA', 'faultKa', 'ikssKA', 'ikKA', 'threePhaseKA',
  ]);
  const directScMva = findFirstNumber(shortCircuit, ['scMva', 'shortCircuitMva', 'faultMva', 'faultMVA']);
  const scMva = directScMva || (systemKv > 0 && faultKa > 0 ? Math.sqrt(3) * systemKv * faultKa : null);
  const xrRatio = findFirstNumber(shortCircuit, ['xrRatio', 'xOverR', 'x_r_ratio']) || 10;

  const capacitorBanks = [];
  const filters = [];
  components.forEach((component, index) => {
    const props = propsOf(component);
    const kind = `${component.type || ''} ${component.subtype || ''}`.toLowerCase();
    if (!kind.includes('capacitor')) return;
    const kvar = finite(props.rated_kvar, props.kvar, props.kVAr);
    if (!(kvar > 0)) return;
    const label = labelOf(component, index);
    const explicitReactorPct = finite(props.reactor_percent, props.reactor_pct, props.detuning_percent);
    const detunedHz = finite(props.detuned_hz, props.tuning_hz);
    const reactorPct = explicitReactorPct || (detunedHz > 0 ? 100 * Math.pow(60 / detunedHz, 2) : null);
    if (props.detuned === true || reactorPct > 0) filters.push({ reactorPct, kvar, label });
    else capacitorBanks.push({ kvar, label });
  });

  const scheduleRows = Array.isArray(cableSchedule) ? cableSchedule : [];
  const rawCables = components.filter(component => `${component.type || ''} ${component.subtype || ''}`.toLowerCase().includes('cable'));
  const cableRows = scheduleRows.length ? scheduleRows : rawCables;
  const cables = cableRows.map((component, index) => {
    const props = propsOf(component);
    const lengthFt = finite(props.length_ft, props.length, props.route_length);
    return {
      rOhmPerKft: finite(props.r_ohm_per_kft, props.rOhmPerKft, props.resistance_ohm_per_kft),
      xOhmPerKft: finite(props.x_ohm_per_kft, props.xOhmPerKft, props.reactance_ohm_per_kft, 0) || 0,
      lengthKft: lengthFt > 0 ? lengthFt / 1000 : null,
      label: labelOf(component, index),
    };
  }).filter(cable => Number.isFinite(cable.rOhmPerKft) && cable.rOhmPerKft >= 0 && cable.lengthKft > 0);

  const warnings = [];
  if (!(systemKv > 0)) warnings.push('No valid One-Line bus voltage was found.');
  if (!(scMva > 0)) warnings.push('Run Short Circuit or provide short-circuit MVA at the scanned bus.');
  if (!capacitorBanks.length && !filters.length) warnings.push('No capacitor banks or detuned filters were found.');
  if (!cables.length) warnings.push('No cable rows with R and length were found; the scan will use source impedance only.');

  return {
    inputs: {
      baseFreqHz: 60,
      systemKv,
      scMva,
      xrRatio,
      capacitorBanks,
      filters,
      cables,
      harmonicRange: { min: 1, max: 50 },
    },
    ready: systemKv > 0 && scMva > 0,
    warnings,
    sourceFingerprint: fingerprintStudySource({ oneLine, shortCircuit, cableSchedule: scheduleRows }),
  };
}
