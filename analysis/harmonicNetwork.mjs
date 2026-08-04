import { getOneLine } from '../dataStore.mjs';
import { buildLoadFlowModel, isBusComponent } from './loadFlowModel.js';

const MIN_MAGNITUDE = 1e-12;

function complex(re = 0, im = 0) {
  return { re, im };
}

function add(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}

function multiply(a, b) {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re
  };
}

function magnitude(value) {
  return Math.hypot(value.re, value.im);
}

function phasor(magnitudeValue, angleDeg = 0) {
  const angle = angleDeg * Math.PI / 180;
  return complex(magnitudeValue * Math.cos(angle), magnitudeValue * Math.sin(angle));
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readField(component, keys) {
  for (const key of keys) {
    const direct = component?.[key];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    const nested = component?.props?.[key];
    if (nested !== undefined && nested !== null && nested !== '') return nested;
  }
  return undefined;
}

function truthy(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}

export function parseHarmonicSpectrum(spec) {
  const parsed = {};
  if (!spec) return parsed;
  if (Array.isArray(spec)) {
    spec.forEach((value, index) => {
      const percent = Number(value);
      const order = index + 1;
      if (order > 1 && Number.isFinite(percent) && percent !== 0) parsed[order] = percent;
    });
    return parsed;
  }
  if (typeof spec === 'object') {
    Object.entries(spec).forEach(([orderValue, percentValue]) => {
      const order = Number(orderValue);
      const percent = Number(percentValue);
      if (order > 1 && Number.isFinite(percent) && percent !== 0) parsed[order] = percent;
    });
    return parsed;
  }
  String(spec).split(/[,\s]+/).forEach(token => {
    if (!token) return;
    const [orderValue, percentValue] = token.split(':');
    const order = Number(orderValue);
    const percent = Number(percentValue ?? orderValue);
    if (order > 1 && Number.isFinite(percent) && percent !== 0) parsed[order] = percent;
  });
  return parsed;
}

function parseAngleMap(value) {
  return parseHarmonicSpectrum(value);
}

function readVoltage(component, fallbackBus) {
  const volts = Number(readField(component, ['voltage', 'volts']));
  if (Number.isFinite(volts) && volts > 0) return volts;
  const kv = Number(readField(component, ['baseKV', 'kV', 'kv', 'rated_voltage_kv', 'ac_voltage_kv']));
  if (Number.isFinite(kv) && kv > 0) return kv * 1000;
  const fallbackKV = Number(fallbackBus?.baseKV);
  return Number.isFinite(fallbackKV) && fallbackKV > 0 ? fallbackKV * 1000 : 0;
}

function readLoadKw(component) {
  const load = readField(component, ['load']);
  const kw = Number(load?.kw ?? load?.P ?? readField(component, ['kw', 'kW', 'load_kw', 'rated_kw', 'output_kw']));
  if (Number.isFinite(kw) && kw > 0) return kw;
  const hp = Number(readField(component, ['hp', 'horsepower']));
  return Number.isFinite(hp) && hp > 0 ? hp * 0.746 : 0;
}

function readFundamentalCurrent(component, voltageV) {
  const direct = Number(readField(component, ['amps', 'current_a', 'currentA', 'full_load_amps', 'fla']));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const kw = readLoadKw(component);
  const pfValue = Number(readField(component, ['power_factor', 'powerFactor', 'pf']));
  const powerFactor = Number.isFinite(pfValue) && pfValue > 0 && pfValue <= 1 ? pfValue : 0.9;
  return voltageV > 0 ? kw * 1000 / (Math.sqrt(3) * voltageV * powerFactor) : 0;
}

function normalizeOneLineComponents(oneLine) {
  const sheets = Array.isArray(oneLine?.sheets) ? oneLine.sheets : [];
  return sheets.flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : [])
    .filter(component => component && component.type !== 'annotation' && component.type !== 'dimension');
}

function buildNearestBusMap(components, busIds) {
  const adjacency = new Map();
  const connect = (from, to) => {
    if (!from || !to) return;
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    if (!adjacency.has(to)) adjacency.set(to, new Set());
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  };
  components.forEach(component => {
    (component.connections || []).forEach(connection => {
      connect(component.id, typeof connection === 'string' ? connection : connection?.target);
    });
  });
  const nearest = new Map();
  const queue = [];
  busIds.forEach(busId => {
    nearest.set(busId, busId);
    queue.push(busId);
  });
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const busId = nearest.get(current);
    (adjacency.get(current) || []).forEach(neighbor => {
      if (nearest.has(neighbor)) return;
      nearest.set(neighbor, busId);
      queue.push(neighbor);
    });
  }
  return nearest;
}

function resolvePccBusId(buses, requestedId) {
  if (requestedId && buses.some(bus => bus.id === requestedId)) return requestedId;
  const slack = buses.find(bus => {
    const type = String(bus.busType || bus.type || '').toLowerCase();
    return type === 'slack' || type === 'swing' || type === 'utility';
  });
  return slack?.id || buses[0]?.id || null;
}

function buildRadialTopology(buses, pccBusId) {
  const indexById = new Map(buses.map((bus, index) => [bus.id, index]));
  const pccIndex = indexById.get(pccBusId);
  if (pccIndex === undefined) return { error: 'Select a valid PCC bus.' };
  const baseKV = Number(buses[pccIndex].baseKV);
  if (!Number.isFinite(baseKV) || baseKV <= 0) return { error: 'Provide a positive base voltage at the PCC bus.' };
  if (buses.some(bus => Math.abs(Number(bus.baseKV) - baseKV) > Math.max(1e-9, baseKV * 1e-9))) {
    return { error: 'Network harmonic screening currently requires a common voltage base.' };
  }

  const edges = new Map();
  for (let from = 0; from < buses.length; from++) {
    for (const connection of buses[from].connections || []) {
      const to = indexById.get(connection?.target);
      if (to === undefined || from === to) continue;
      const tapMagnitude = Number(connection.tap?.ratio ?? connection.tap ?? 1);
      const tapAngle = Number(connection.tap?.angle ?? 0);
      if (!Number.isFinite(tapMagnitude) || Math.abs(tapMagnitude - 1) > 1e-12 || Math.abs(tapAngle) > 1e-12) {
        return { error: 'Network harmonic screening currently requires branches without transformer taps.' };
      }
      const r = Number(connection.impedance?.r) || 0;
      const x = Number(connection.impedance?.x) || 0;
      if (r * r + x * x < MIN_MAGNITUDE) {
        return { error: `Provide non-zero branch impedance between ${buses[from].id} and ${buses[to].id}.` };
      }
      const low = Math.min(from, to);
      const high = Math.max(from, to);
      const pairKey = `${low}:${high}`;
      const componentId = connection.componentId || connection.id || null;
      const existing = edges.get(pairKey);
      if (existing) {
        const sameId = existing.componentId || componentId ? existing.componentId === componentId : true;
        if (!sameId || Math.abs(existing.r - r) > 1e-12 || Math.abs(existing.x - x) > 1e-12) {
          return { error: 'Parallel branches require the general network harmonic solver.' };
        }
        continue;
      }
      edges.set(pairKey, { from, to, r, x, componentId });
    }
  }
  if (edges.size !== buses.length - 1) {
    return { error: 'Network harmonic screening currently requires a connected radial bus topology.' };
  }

  const adjacency = Array.from({ length: buses.length }, () => []);
  edges.forEach(edge => {
    adjacency[edge.from].push({ index: edge.to, edge });
    adjacency[edge.to].push({ index: edge.from, edge });
  });
  const parent = new Array(buses.length).fill(-1);
  const parentEdge = new Array(buses.length).fill(null);
  const order = [pccIndex];
  parent[pccIndex] = pccIndex;
  for (let cursor = 0; cursor < order.length; cursor++) {
    const current = order[cursor];
    for (const neighbor of adjacency[current]) {
      if (parent[neighbor.index] !== -1) continue;
      parent[neighbor.index] = current;
      parentEdge[neighbor.index] = neighbor.edge;
      order.push(neighbor.index);
    }
  }
  if (order.length !== buses.length) return { error: 'All study buses must be connected to the selected PCC.' };
  return { pccIndex, parent, parentEdge, order, baseKV };
}

function readSourceImpedance(pccBus, options) {
  const explicit = options.sourceImpedance || readField(pccBus, ['z1', 'sourceImpedance', 'theveninImpedance']);
  const r = Number(explicit?.r);
  const x = Number(explicit?.x);
  if (Number.isFinite(r) && Number.isFinite(x) && r * r + x * x >= MIN_MAGNITUDE) return { r, x };

  const shortCircuitMva = Number(
    options.shortCircuitMva
    ?? readField(pccBus, ['scMVA', 'short_circuit_mva', 'short_circuit_capacity', 'thevenin_mva'])
  );
  if (!Number.isFinite(shortCircuitMva) || shortCircuitMva <= 0) return null;
  const xrValue = Number(options.xrRatio ?? readField(pccBus, ['xrRatio', 'x_r_ratio']));
  const xrRatio = Number.isFinite(xrValue) && xrValue > 0 ? xrValue : 10;
  const lineVoltageV = Number(pccBus.baseKV) * 1000;
  const zMagnitude = lineVoltageV * lineVoltageV / (shortCircuitMva * 1e6);
  const sourceR = zMagnitude / Math.sqrt(1 + xrRatio * xrRatio);
  return { r: sourceR, x: sourceR * xrRatio };
}

function voltageLimit(baseKV) {
  if (baseKV <= 1) return 8;
  if (baseKV <= 69) return 5;
  if (baseKV <= 161) return 2.5;
  return 1.5;
}

function unsupported(reason, topology = {}) {
  return {
    calculationStatus: 'unsupported',
    topology,
    sources: {},
    buses: {},
    branches: {},
    pcc: null,
    requiredInputs: [reason],
    assumptions: []
  };
}

export function runNetworkHarmonics(options = {}) {
  const oneLine = options.oneLine || getOneLine();
  const components = normalizeOneLineComponents(oneLine);
  const model = buildLoadFlowModel(oneLine);
  const buses = Array.isArray(model?.buses) ? model.buses.filter(isBusComponent) : [];
  if (!buses.length) return unsupported('Add at least one bus to run network harmonic screening.');

  const pccBusId = resolvePccBusId(buses, options.pccBusId);
  const topology = buildRadialTopology(buses, pccBusId);
  if (topology.error) {
    return unsupported(topology.error, { busCount: buses.length, pccBusId });
  }
  const pccBus = buses[topology.pccIndex];
  const sourceImpedance = readSourceImpedance(pccBus, options);
  if (!sourceImpedance) {
    return unsupported('Provide PCC source impedance or short-circuit MVA and X/R ratio.', {
      busCount: buses.length,
      branchCount: buses.length - 1,
      pccBusId
    });
  }

  const busIndexById = new Map(buses.map((bus, index) => [bus.id, index]));
  const nearestBus = buildNearestBusMap(components, new Set(busIndexById.keys()));
  const sources = {};
  const localSources = Array.from({ length: buses.length }, () => []);
  const harmonicOrders = new Set();
  components.forEach(component => {
    if (!truthy(readField(component, ['harmonicSource', 'harmonic_source']))) return;
    const busId = busIndexById.has(component.id) ? component.id : nearestBus.get(component.id);
    const busIndex = busIndexById.get(busId);
    if (busIndex === undefined) return;
    const spectrum = parseHarmonicSpectrum(readField(component, ['harmonics', 'harmonic_spectrum', 'spectrum']));
    const angles = parseAngleMap(readField(component, ['harmonicAngles', 'harmonic_angles']));
    const voltageV = readVoltage(component, buses[busIndex]);
    const fundamentalCurrentA = readFundamentalCurrent(component, voltageV);
    const sourceHarmonics = {};
    Object.entries(spectrum).forEach(([orderValue, percent]) => {
      const order = Number(orderValue);
      const angleDeg = Number(angles[order]) || 0;
      const currentA = fundamentalCurrentA * Number(percent) / 100;
      harmonicOrders.add(order);
      sourceHarmonics[order] = {
        percent: round(Number(percent)),
        currentA: round(currentA),
        angleDeg: round(angleDeg)
      };
    });
    const harmonicRmsA = Math.sqrt(Object.values(sourceHarmonics)
      .reduce((sum, harmonic) => sum + harmonic.currentA ** 2, 0));
    sources[component.id] = {
      id: component.id,
      label: component.label || component.name || component.ref || component.id,
      busId,
      fundamentalCurrentA: round(fundamentalCurrentA),
      harmonicRmsA: round(harmonicRmsA),
      currentThdPct: fundamentalCurrentA > 0 ? round(harmonicRmsA / fundamentalCurrentA * 100) : 0,
      harmonics: sourceHarmonics
    };
    localSources[busIndex].push(sources[component.id]);
  });

  const orders = [...harmonicOrders].sort((a, b) => a - b);
  const localFundamental = localSources.map(items => items.reduce((sum, source) => sum + source.fundamentalCurrentA, 0));
  const downstreamFundamental = [...localFundamental];
  for (let cursor = topology.order.length - 1; cursor > 0; cursor--) {
    const child = topology.order[cursor];
    downstreamFundamental[topology.parent[child]] += downstreamFundamental[child];
  }

  const busPhasors = Array.from({ length: buses.length }, () => ({}));
  const downstreamCurrents = Array.from({ length: buses.length }, () => ({}));
  orders.forEach(order => {
    const accumulated = localSources.map(items => items.reduce((sum, source) => {
      const harmonic = source.harmonics[order];
      return harmonic ? add(sum, phasor(harmonic.currentA, harmonic.angleDeg)) : sum;
    }, complex()));
    for (let cursor = topology.order.length - 1; cursor > 0; cursor--) {
      const child = topology.order[cursor];
      const parent = topology.parent[child];
      accumulated[parent] = add(accumulated[parent], accumulated[child]);
    }
    const sourceZ = complex(sourceImpedance.r, sourceImpedance.x * order);
    busPhasors[topology.pccIndex][order] = multiply(sourceZ, accumulated[topology.pccIndex]);
    downstreamCurrents[topology.pccIndex][order] = accumulated[topology.pccIndex];
    for (let cursor = 1; cursor < topology.order.length; cursor++) {
      const child = topology.order[cursor];
      const parent = topology.parent[child];
      const edge = topology.parentEdge[child];
      const branchZ = complex(edge.r, edge.x * order);
      busPhasors[child][order] = add(busPhasors[parent][order], multiply(branchZ, accumulated[child]));
      downstreamCurrents[child][order] = accumulated[child];
    }
  });

  const busResults = {};
  const branchResults = {};
  const limit = voltageLimit(topology.baseKV);
  const phaseVoltageV = topology.baseKV * 1000 / Math.sqrt(3);
  buses.forEach((bus, index) => {
    const harmonics = {};
    let voltageSquared = 0;
    let currentSquared = 0;
    let dominantOrder = null;
    let dominantVoltageV = -1;
    orders.forEach(order => {
      const voltage = busPhasors[index][order] || complex();
      const current = downstreamCurrents[index][order] || complex();
      const voltageV = magnitude(voltage);
      const currentA = magnitude(current);
      voltageSquared += voltageV * voltageV;
      currentSquared += currentA * currentA;
      if (voltageV > dominantVoltageV) {
        dominantVoltageV = voltageV;
        dominantOrder = order;
      }
      harmonics[order] = {
        voltageV: round(voltageV),
        voltagePct: phaseVoltageV > 0 ? round(voltageV / phaseVoltageV * 100) : null,
        voltageAngleDeg: round(Math.atan2(voltage.im, voltage.re) * 180 / Math.PI),
        currentA: round(currentA),
        currentAngleDeg: round(Math.atan2(current.im, current.re) * 180 / Math.PI)
      };
    });
    const voltageThdPct = phaseVoltageV > 0 ? Math.sqrt(voltageSquared) / phaseVoltageV * 100 : null;
    const currentRmsA = Math.sqrt(currentSquared);
    busResults[bus.id] = {
      id: bus.id,
      label: bus.label || bus.name || bus.ref || bus.id,
      baseKV: topology.baseKV,
      voltageThdPct: round(voltageThdPct),
      voltageLimitPct: limit,
      warning: Number.isFinite(voltageThdPct) ? voltageThdPct > limit : null,
      harmonicCurrentRmsA: round(currentRmsA),
      downstreamFundamentalCurrentA: round(downstreamFundamental[index]),
      currentThdPct: downstreamFundamental[index] > 0
        ? round(currentRmsA / downstreamFundamental[index] * 100)
        : 0,
      dominantOrder,
      localSourceIds: localSources[index].map(source => source.id),
      harmonics
    };
    if (index === topology.pccIndex) return;
    const edge = topology.parentEdge[index];
    const branchId = edge.componentId || `${buses[topology.parent[index]].id}->${bus.id}`;
    const branchHarmonics = {};
    let branchCurrentSquared = 0;
    orders.forEach(order => {
      const current = downstreamCurrents[index][order] || complex();
      const currentA = magnitude(current);
      branchCurrentSquared += currentA * currentA;
      branchHarmonics[order] = {
        currentA: round(currentA),
        angleDeg: round(Math.atan2(current.im, current.re) * 180 / Math.PI)
      };
    });
    branchResults[branchId] = {
      id: branchId,
      fromBusId: buses[topology.parent[index]].id,
      toBusId: bus.id,
      harmonicCurrentRmsA: round(Math.sqrt(branchCurrentSquared)),
      fundamentalCurrentA: round(downstreamFundamental[index]),
      currentThdPct: downstreamFundamental[index] > 0
        ? round(Math.sqrt(branchCurrentSquared) / downstreamFundamental[index] * 100)
        : 0,
      harmonics: branchHarmonics
    };
  });

  const pccBusResult = busResults[pccBusId];
  const maximumDemandCurrentA = Number(
    options.maximumDemandCurrentA
    ?? readField(pccBus, ['maximumDemandCurrentA', 'maximum_demand_current_a', 'demandCurrentA'])
  );
  const pccHarmonicRmsA = pccBusResult?.harmonicCurrentRmsA || 0;
  const tddEvaluated = Number.isFinite(maximumDemandCurrentA) && maximumDemandCurrentA > 0;
  const requiredInputs = [];
  if (!tddEvaluated) {
    requiredInputs.push('Provide maximum demand load current at the PCC to calculate current TDD.');
  }

  return {
    calculationStatus: 'network-screening',
    topology: {
      radial: true,
      busCount: buses.length,
      branchCount: Object.keys(branchResults).length,
      sourceCount: Object.keys(sources).length,
      pccBusId
    },
    sources,
    buses: busResults,
    branches: branchResults,
    pcc: {
      busId: pccBusId,
      voltageThdPct: pccBusResult?.voltageThdPct ?? null,
      voltageLimitPct: limit,
      harmonicCurrentRmsA: round(pccHarmonicRmsA),
      fundamentalCurrentA: pccBusResult?.downstreamFundamentalCurrentA || 0,
      currentThdPct: pccBusResult?.currentThdPct || 0,
      maximumDemandCurrentA: tddEvaluated ? round(maximumDemandCurrentA) : null,
      currentTddPct: tddEvaluated ? round(pccHarmonicRmsA / maximumDemandCurrentA * 100) : null,
      currentTddEvaluated: tddEvaluated,
      pccAggregated: true,
      harmonics: pccBusResult?.harmonics || {}
    },
    requiredInputs,
    assumptions: [
      'Balanced positive-sequence radial screening with one common voltage base.',
      'Branch resistance is held constant and branch reactance scales with harmonic order.',
      'Source harmonic phase angles default to 0 degrees when they are not provided.',
      'Capacitor, filter, transformer-ratio, and frequency-dependent skin-effect models require a detailed harmonic study.'
    ]
  };
}
