import { buildLoadFlowModel } from './loadFlowModel.js';
import { fingerprintStudySource } from './studyResultReadiness.mjs';

function finite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function text(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function flattenOneLineComponents(oneLine = {}) {
  const sheets = Array.isArray(oneLine?.sheets) ? oneLine.sheets : [];
  return sheets.flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []);
}

function componentProps(component = {}) {
  return {
    ...component,
    ...(component.parameters || {}),
    ...(component.props || {}),
  };
}

function componentName(component, index) {
  const props = componentProps(component);
  return text(props.tag, props.ref, props.name, props.label, component?.id) || `Unit ${index + 1}`;
}

export function buildVoltageStabilityProjectInputs(oneLine = {}, options = {}) {
  const model = buildLoadFlowModel(oneLine);
  const buses = model.buses.map(bus => ({
    id: bus.id,
    type: String(bus.busType || bus.type || '').toLowerCase() === 'slack' ? 'slack'
      : (bus.generation?.p > 0 ? 'PV' : 'PQ'),
    baseKV: finite(bus.baseKV, 13.8) || 13.8,
    Pd: finite(bus.load?.kw, bus.load?.p, bus.Pd, 0) || 0,
    Qd: finite(bus.load?.kvar, bus.load?.q, bus.Qd, 0) || 0,
    Pg: finite(bus.generation?.kw, bus.generation?.p, bus.Pg, 0) || 0,
    Vm: 1,
    Va: 0,
    connections: [],
  }));
  const busMap = new Map(buses.map(bus => [bus.id, bus]));
  const warnings = [];

  model.branches.forEach(branch => {
    const source = busMap.get(branch.from);
    if (!source) return;
    const r = finite(branch.impedance?.r, branch.r, 0) || 0;
    const x = finite(branch.impedance?.x, branch.x, 0) || 0;
    if (branch.idealTie || (r === 0 && x === 0)) {
      warnings.push(`${branch.label || branch.id || 'Branch'} has no modeled impedance and was imported as an ideal tie.`);
    }
    source.connections.push({ target: branch.to, r, x });
  });

  const firstPq = buses.find(bus => bus.type === 'PQ');
  const inputs = {
    buses,
    baseMVA: finite(options.baseMVA, 100) || 100,
    lambdaMax: finite(options.lambdaMax, 3) || 3,
    lambdaStep: finite(options.lambdaStep, 0.05) || 0.05,
    targetBusId: firstPq?.id,
    qMinMvar: finite(options.qMinMvar, -50) ?? -50,
    qMaxMvar: finite(options.qMaxMvar, 50) ?? 50,
    qStepMvar: finite(options.qStepMvar, 2) || 2,
    systemLabel: text(options.systemLabel) || 'Imported from project One-Line',
  };

  return {
    inputs,
    ready: buses.length >= 2 && model.branches.length >= 1 && buses.some(bus => bus.type === 'slack'),
    warnings,
    counts: { buses: buses.length, branches: model.branches.length },
    sourceFingerprint: fingerprintStudySource({ oneLine }),
  };
}

function isGenerator(component = {}) {
  const type = `${component.type || ''} ${component.subtype || ''}`.toLowerCase();
  return type.includes('generator') || type.includes('genset');
}

export function buildOpfProjectInputs(oneLine = {}) {
  const components = flattenOneLineComponents(oneLine);
  const generators = components.filter(isGenerator);
  const missingCostCurves = [];
  const units = generators.map((component, index) => {
    const props = componentProps(component);
    const pmax = finite(props.max_mw, props.pmax_mw, props.max_kw != null ? Number(props.max_kw) / 1000 : null,
      props.kw != null ? Number(props.kw) / 1000 : null,
      props.rated_mw,
      props.rated_mva != null ? Number(props.rated_mva) * finite(props.pf, 1) : null);
    const pmin = finite(props.min_mw, props.pmin_mw, props.min_kw != null ? Number(props.min_kw) / 1000 : null, 0) || 0;
    const a = finite(props.cost_a, props.costA, props.fixed_cost_per_h);
    const b = finite(props.cost_b, props.costB, props.linear_cost_per_mwh);
    const c = finite(props.cost_c, props.costC, props.quadratic_cost_per_mwh2);
    if (!Number.isFinite(b) || !Number.isFinite(c)) {
      missingCostCurves.push(componentName(component, index));
    }
    return {
      id: component.id || componentName(component, index),
      name: componentName(component, index),
      pmin,
      pmax,
      a,
      b,
      c,
    };
  });

  const model = buildLoadFlowModel(oneLine);
  const demandMW = model.buses.reduce((sum, bus) => sum + (finite(bus.load?.kw, bus.load?.p, bus.Pd, 0) || 0), 0) / 1000;
  const missingCapacity = units.filter(unit => !Number.isFinite(unit.pmax) || unit.pmax <= 0).map(unit => unit.name);
  const warnings = [];
  if (missingCostCurves.length) {
    warnings.push(`Cost coefficients are missing for: ${missingCostCurves.join(', ')}. Enter b and c before running.`);
  }
  if (missingCapacity.length) {
    warnings.push(`Maximum output is missing for: ${missingCapacity.join(', ')}.`);
  }
  if (!(demandMW > 0)) warnings.push('No positive project load was found on the One-Line.');

  return {
    units,
    demandMW,
    ready: units.length > 0 && demandMW > 0 && missingCostCurves.length === 0 && missingCapacity.length === 0,
    warnings,
    missingCostCurves,
    missingCapacity,
    sourceFingerprint: fingerprintStudySource({ oneLine }),
  };
}
