import {
  getDcPolarityForCircuit,
  getPanelPhaseSequence,
  getPanelSystem
} from "./phaseModel.js";
import {
  ensureBreakerDetails,
  getBreakerBlock,
  getBreakerDetail,
  getLoadBreakerSpan
} from "./breakerLayoutModel.js";

export function getPhaseLabel(panel, breaker) {
  const sequence = getPanelPhaseSequence(panel);
  if (!sequence.length) return "";
  const index = Number(breaker);
  if (!Number.isFinite(index) || index < 1) return "";
  const system = getPanelSystem(panel);
  if (system === "dc") return getDcPolarityForCircuit(index, sequence);
  if (system === "ac" && (sequence.length === 3 || sequence.length === 2)) {
    const rowIndex = Math.floor((index - 1) / 2);
    return sequence[rowIndex % sequence.length];
  }
  return sequence[(index - 1) % sequence.length] || "";
}

export function getPhasePowerValue(load, system) {
  if (!load) return null;
  const candidates = system === "dc"
    ? [
        { value: load.demandKw, scale: 1000 },
        { value: load.kw, scale: 1000 },
        { value: load.demandKva, scale: 1000 },
        { value: load.kva, scale: 1000 },
        { value: load.watts, scale: 1 }
      ]
    : [
        { value: load.demandKva, scale: 1000 },
        { value: load.kva, scale: 1000 },
        { value: load.demandKw, scale: 1000 },
        { value: load.kw, scale: 1000 },
        { value: load.va, scale: 1 }
      ];
  let zeroFound = false;
  for (const candidate of candidates) {
    const parsed = parseFloat(candidate.value);
    if (!Number.isFinite(parsed)) continue;
    if (parsed === 0) {
      zeroFound = true;
      continue;
    }
    return parsed * candidate.scale;
  }
  return zeroFound ? 0 : null;
}

export function getPhaseLoadKey(phaseLabel, block) {
  const normalizedPhase = phaseLabel != null ? String(phaseLabel).trim() : "";
  if (normalizedPhase) return normalizedPhase;
  const position = block && Number.isFinite(Number(block.position)) ? Number(block.position) : null;
  return position != null ? `pole-${position + 1}` : null;
}

export function getDetailPhaseLoad(detail, phaseKey) {
  if (!detail || detail.loadVaPerPhase == null) return null;
  const source = detail.loadVaPerPhase;
  const collection = source && typeof source === "object" && !Array.isArray(source)
    ? source
    : { default: source };
  const keys = phaseKey ? [phaseKey, "default"] : ["default"];
  for (const key of keys) {
    if (!(key in collection)) continue;
    const value = collection[key];
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
    if (value === 0 || value === "0") return 0;
  }
  return null;
}

export function getCustomPhaseLoadsForSpan(panel, detail, spanCircuits) {
  const totals = new Map();
  if (!panel || !detail || detail.loadVaPerPhase == null || !Array.isArray(spanCircuits)) return totals;
  spanCircuits.forEach(circuit => {
    const block = getBreakerBlock(panel, circuit);
    const phaseLabel = getPhaseLabel(panel, circuit);
    const phaseKey = getPhaseLoadKey(phaseLabel, block);
    const load = getDetailPhaseLoad(detail, phaseKey);
    if (load == null) return;
    const label = phaseLabel || phaseKey || `Circuit ${circuit}`;
    totals.set(label, (totals.get(label) || 0) + load);
  });
  return totals;
}

export function getPhaseLoadsForSpan(panel, detail, spanCircuits, defaultTotalPower) {
  const totals = new Map();
  if (!panel || !Array.isArray(spanCircuits) || !spanCircuits.length) return totals;
  const share = Number.isFinite(defaultTotalPower) ? defaultTotalPower / spanCircuits.length : null;
  spanCircuits.forEach(circuit => {
    const block = getBreakerBlock(panel, circuit);
    const phaseLabel = getPhaseLabel(panel, circuit);
    if (!phaseLabel) return;
    const phaseKey = getPhaseLoadKey(phaseLabel, block);
    const custom = getDetailPhaseLoad(detail, phaseKey);
    const amount = custom != null ? custom : share;
    if (amount == null) return;
    totals.set(phaseLabel, (totals.get(phaseLabel) || 0) + amount);
  });
  return totals;
}

export function calculatePhaseSummary(panel, panelId, loads, circuitCount) {
  const sequence = getPanelPhaseSequence(panel);
  if (!sequence.length) return null;
  const phases = Array.from(new Set(sequence)).filter(Boolean);
  if (!phases.length) return null;
  const system = getPanelSystem(panel);
  ensureBreakerDetails(panel);
  const totals = Object.fromEntries(phases.map(phase => [phase, 0]));
  const seenLoads = new Set();
  const totalBreakers = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : panel.breakers?.length || 0;

  for (let circuit = 1; circuit <= totalBreakers; circuit++) {
    const block = getBreakerBlock(panel, circuit);
    const start = block && Number.isFinite(Number(block.start)) ? Number(block.start) : circuit;
    const detail = getBreakerDetail(panel, start);
    if (!detail || detail.loadVaPerPhase == null) continue;
    const phase = getPhaseLabel(panel, circuit);
    if (!phase) continue;
    const load = getDetailPhaseLoad(detail, getPhaseLoadKey(phase, block));
    if (load == null) continue;
    if (!(phase in totals)) totals[phase] = 0;
    totals[phase] += load;
  }

  loads.forEach(load => {
    if (load.panelId !== panelId) return;
    const id = load?.ref || load?.id || load?.tag || `idx-${loads.indexOf(load)}`;
    if (seenLoads.has(id)) return;
    seenLoads.add(id);
    const span = getLoadBreakerSpan(load, panel, totalBreakers);
    if (!span.length) return;
    const value = getPhasePowerValue(load, system);
    const detail = getBreakerDetail(panel, span[0]);
    if (value == null) return;
    const share = value / span.length;
    span.forEach(slot => {
      const phase = getPhaseLabel(panel, slot);
      if (!phase) return;
      const phaseKey = getPhaseLoadKey(phase, getBreakerBlock(panel, slot));
      if (detail && getDetailPhaseLoad(detail, phaseKey) != null) return;
      totals[phase] += share;
    });
  });

  const phaseTotals = phases.map(phase => totals[phase] || 0);
  const deviations = {};
  phases.forEach((phase, index) => {
    const total = phaseTotals[index] || 0;
    const comparisons = phaseTotals.map((other, otherIndex) => {
      if (otherIndex === index) return 0;
      if (other > 0) return (total - other) / other;
      return total > 0 ? Infinity : 0;
    });
    deviations[phase] = Math.max(0, ...comparisons);
  });
  return {
    system,
    phases,
    totals,
    deviations,
    unit: system === "dc" ? "W" : "VA",
    title: system === "dc" ? "Polarity Load (W)" : "Phase Load (VA)"
  };
}
