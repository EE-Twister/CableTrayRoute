import { getPanelCircuitCount } from "./phaseModel.js";
import { ensureBreakerDetails, getBreakerBlock, getLoadBreakerSpan, getBlockCircuits } from "./breakerLayoutModel.js";
import { getPhaseLabel, getPhaseLoadKey } from "./phaseLoadModel.js";

export function calculatePanelTotalsFromData(panel, loads) {
  if (!panel) {
    return loads.reduce((acc, l) => {
      const cKva = parseFloat(l.kva) || 0;
      const cKw = parseFloat(l.kw) || 0;
      const dKva = parseFloat(l.demandKva) || cKva;
      const dKw = parseFloat(l.demandKw) || cKw;
      acc.connectedKva += cKva;
      acc.connectedKw += cKw;
      acc.demandKva += dKva;
      acc.demandKw += dKw;
      return acc;
    }, { connectedKva: 0, connectedKw: 0, demandKva: 0, demandKw: 0 });
  }

  const circuitCount = getPanelCircuitCount(panel);
  const breakerStarts = new Set();
  for (let circuit = 1; circuit <= circuitCount; circuit++) {
    const block = getBreakerBlock(panel, circuit);
    const start = block && Number.isFinite(Number(block.start)) ? Number(block.start) : circuit;
    if (start >= 1 && start <= circuitCount) {
      breakerStarts.add(start);
    }
  }

  const breakerDetails = ensureBreakerDetails(panel);

  const totals = loads.reduce((acc, l) => {
    const span = getLoadBreakerSpan(l, panel, circuitCount);
    const startCircuit = span.length ? span[0] : null;
    const cKva = parseFloat(l.kva) || 0;
    const cKw = parseFloat(l.kw) || 0;
    const dKva = parseFloat(l.demandKva) || cKva;
    const dKw = parseFloat(l.demandKw) || cKw;
    acc.connectedKva += cKva;
    acc.connectedKw += cKw;
    acc.demandKva += dKva;
    acc.demandKw += dKw;

    if (startCircuit == null || !breakerStarts.has(startCircuit)) {
      return acc;
    }

    const detail = breakerDetails[String(startCircuit)];
    if (!detail || detail.loadVaPerPhase == null) {
      return acc;
    }

    if (detail.loadVaPerPhase && typeof detail.loadVaPerPhase === "object" && !Array.isArray(detail.loadVaPerPhase)) {
      const connectedShare = span.length > 0 ? (cKva * 1000) / span.length : 0;
      const demandShare = span.length > 0 ? (dKva * 1000) / span.length : 0;
      span.forEach(slot => {
        const phase = getPhaseLabel(panel, slot);
        const block = getBreakerBlock(panel, slot);
        const phaseKey = getPhaseLoadKey(phase, block);
        const rawValue = phaseKey ? detail.loadVaPerPhase[phaseKey] : null;
        const parsed = parseFloat(rawValue);
        if (!Number.isFinite(parsed) || parsed < 0) return;
        acc.connectedKva += (parsed - connectedShare) / 1000;
        acc.demandKva += (parsed - demandShare) / 1000;
      });
      return acc;
    }

    const parsed = parseFloat(detail.loadVaPerPhase);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return acc;
    }
    acc.connectedKva += (parsed - (cKva * 1000)) / 1000;
    acc.demandKva += (parsed - (dKva * 1000)) / 1000;
    return acc;
  }, { connectedKva: 0, connectedKw: 0, demandKva: 0, demandKw: 0 });

  breakerStarts.forEach(startCircuit => {
    const matchedLoad = loads.find(l => {
      const span = getLoadBreakerSpan(l, panel, circuitCount);
      return span.length && span[0] === startCircuit;
    });
    if (matchedLoad) return;

    const detail = breakerDetails[String(startCircuit)];
    if (!detail || detail.loadVaPerPhase == null) return;

    if (detail.loadVaPerPhase && typeof detail.loadVaPerPhase === "object" && !Array.isArray(detail.loadVaPerPhase)) {
      const block = getBreakerBlock(panel, startCircuit);
      const span = block ? getBlockCircuits(panel, block, circuitCount) : [startCircuit];
      span.forEach(slot => {
        const phase = getPhaseLabel(panel, slot);
        const slotBlock = getBreakerBlock(panel, slot);
        const phaseKey = getPhaseLoadKey(phase, slotBlock);
        const rawValue = phaseKey ? detail.loadVaPerPhase[phaseKey] : null;
        const parsed = parseFloat(rawValue);
        if (!Number.isFinite(parsed) || parsed < 0) return;
        totals.connectedKva += parsed / 1000;
        totals.demandKva += parsed / 1000;
      });
      return;
    }

    const parsed = parseFloat(detail.loadVaPerPhase);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    totals.connectedKva += parsed / 1000;
    totals.demandKva += parsed / 1000;
  });

  return totals;
}

