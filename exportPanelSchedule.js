import * as dataStore from './dataStore.mjs';

function parsePositiveInt(value) {
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getPanelCircuitCount(panel) {
  const explicit = parsePositiveInt(panel?.circuitCount || panel?.circuit_count);
  if (explicit) return explicit;
  if (Array.isArray(panel?.breakers)) return panel.breakers.length;
  return 42;
}

function getPanelSystem(panel) {
  const raw = (panel?.powerType || panel?.systemType || panel?.type || '').toString().toLowerCase();
  return raw === 'dc' ? 'dc' : 'ac';
}

const DC_PHASE_LABELS = ['+', '−'];
const SINGLE_PHASE_LABELS = ['A', 'B'];
const THREE_PHASE_LABELS = ['A', 'B', 'C'];
const FALLBACK_DC_SEQUENCE = ['+', '−'];

function resolveDcSequence(sequence) {
  if (Array.isArray(sequence) && sequence.length >= 2) {
    return sequence;
  }
  return FALLBACK_DC_SEQUENCE;
}

function getDcPolarityForCircuit(circuit, sequence = DC_PHASE_LABELS) {
  const slot = Number.parseInt(circuit, 10);
  if (!Number.isFinite(slot) || slot < 1) return '';
  const normalized = resolveDcSequence(sequence);
  const positive = normalized[0] ?? FALLBACK_DC_SEQUENCE[0];
  const negative = normalized[1] ?? FALLBACK_DC_SEQUENCE[1];
  const rowIndex = Math.floor((slot - 1) / 2);
  const label = rowIndex % 2 === 0 ? positive : negative;
  return label == null ? '' : String(label);
}

function computeBreakerSpan(startCircuit, poleCount, circuitCount) {
  const start = Number.parseInt(startCircuit, 10);
  const poles = Number.parseInt(poleCount, 10);
  if (!Number.isFinite(start) || start < 1) return [];
  if (!Number.isFinite(poles) || poles <= 0) return [];
  const limit = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : null;
  const step = poles > 1 ? 2 : 1;
  const span = [];
  for (let position = 0; position < poles; position++) {
    const circuit = start + position * step;
    if (limit && circuit > limit) {
      return [];
    }
    span.push(circuit);
  }
  return span;
}

function getBreakerBlock(panel, circuit) {
  if (!panel || !Array.isArray(panel.breakerLayout)) return null;
  if (!Number.isFinite(circuit) || circuit < 1) return null;
  return panel.breakerLayout[circuit - 1] || null;
}

function getLayoutPoleCount(panel, startCircuit) {
  const block = getBreakerBlock(panel, startCircuit);
  if (!block || block.position !== 0) return null;
  const size = Number(block.size);
  return Number.isFinite(size) && size > 0 ? size : null;
}

function getBlockCircuits(panel, block, circuitCount) {
  if (!block) return [];
  const size = Number(block.size);
  const start = Number(block.start);
  if (!Number.isFinite(size) || !Number.isFinite(start) || size <= 0 || start < 1) return [];
  const limit = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : getPanelCircuitCount(panel);
  return computeBreakerSpan(start, size, limit);
}

function getPanelPhaseSequence(panel) {
  const system = getPanelSystem(panel);
  if (system === 'dc') return resolveDcSequence(DC_PHASE_LABELS);
  const phases = parseInt(panel?.phases, 10);
  if (Number.isFinite(phases)) {
    if (phases <= 1) return SINGLE_PHASE_LABELS;
    if (phases === 2) return SINGLE_PHASE_LABELS;
    if (phases >= 3) return THREE_PHASE_LABELS;
  }
  return THREE_PHASE_LABELS;
}

function getPhaseLabel(panel, circuit) {
  const sequence = getPanelPhaseSequence(panel);
  if (!sequence.length) return '';
  const index = Number(circuit);
  if (!Number.isFinite(index) || index < 1) return '';
  const system = getPanelSystem(panel);
  if (system === 'dc') {
    return getDcPolarityForCircuit(index, sequence);
  }
  if (sequence.length === 3 && system === 'ac') {
    const rowIndex = Math.floor((index - 1) / 2);
    return sequence[rowIndex % sequence.length];
  }
  return sequence[(index - 1) % sequence.length];
}

function getLoadPoleCount(load, panel) {
  if (!load) return 1;
  const system = getPanelSystem(panel);
  const candidates = [
    load.breakerPoles,
    load.poles,
    load.poleCount,
    load.phaseCount,
    load.phases
  ];
  for (const candidate of candidates) {
    const parsed = parsePositiveInt(candidate);
    if (!parsed) continue;
    if (system === 'dc') return Math.min(parsed, 2);
    if (system === 'ac') {
      if (parsed >= 3) return 3;
      if (parsed === 2) return 2;
      return 1;
    }
    return parsed;
  }
  return 1;
}

function getLoadBreakerSpan(load, panel, circuitCount) {
  let start = parsePositiveInt(load?.breaker);
  if (!start) return [];
  const limit = Number.isFinite(circuitCount) && circuitCount > 0
    ? circuitCount
    : getPanelCircuitCount(panel);

  if (panel) {
    const blockAtSlot = getBreakerBlock(panel, start);
    if (blockAtSlot && Number.isFinite(Number(blockAtSlot.start)) && Number(blockAtSlot.start) !== start) {
      start = Number(blockAtSlot.start);
    }
    const startBlock = getBreakerBlock(panel, start);
    if (startBlock && startBlock.position === 0) {
      const blockSpan = getBlockCircuits(panel, startBlock, limit);
      if (blockSpan.length) {
        return blockSpan;
      }
    }
    const layoutPoles = getLayoutPoleCount(panel, start);
    if (Number.isFinite(layoutPoles) && layoutPoles > 0) {
      return computeBreakerSpan(start, layoutPoles, limit);
    }
  }

  const poles = Math.max(1, getLoadPoleCount(load, panel));
  return computeBreakerSpan(start, poles, limit);
}

function getLoadLabel(load) {
  const tag = load?.ref || load?.id || load?.tag;
  const desc = load?.description;
  if (tag && desc) return `${tag} — ${desc}`;
  return tag || desc || '';
}

function getDemandValue(load) {
  if (!load) return null;
  const candidates = [
    load.demandKva,
    load.kva,
    load.demandKw,
    load.kw,
    load.demand
  ];
  for (const candidate of candidates) {
    const parsed = Number.parseFloat(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Export a panel schedule to an XLSX file.
 * Uses global SheetJS (XLSX) library loaded on the page.
 * @param {string} panelId
 */
export function exportPanelSchedule(panelId) {
  if (typeof XLSX === 'undefined') {
    console.error('XLSX library not loaded');
    return;
  }
  const panels = dataStore.getPanels();
  const panel = panels.find(p => p.id === panelId || p.panel_id === panelId) || {};
  const loads = dataStore.getLoads().filter(l => l.panelId === panelId);

  const circuitCount = getPanelCircuitCount(panel);
  const panelLabel = panel.ref || panel.panel_id || panel.id || panelId;
  const systemType = getPanelSystem(panel);

  const data = [];
  data.push(['Panel', panelLabel || panelId]);
  data.push(['Fed From', panel.fedFrom || panel.fed_from || '']);
  data.push(['Voltage', panel.voltage || panel.voltage_rating || '']);
  data.push(['System Type', systemType === 'dc' ? 'DC' : 'AC']);
  data.push(['Phases', panel.phases || panel.phaseCount || '']);
  data.push(['Main Rating (A)', panel.mainRating || panel.main_rating || '']);
  data.push(['Short-Circuit Rating (A)', panel.shortCircuitRating || panel.shortCircuitCurrentRating || '']);
  data.push(['Circuit Count', circuitCount]);
  data.push([]);
  data.push(['Circuit', 'Phase', 'Description', 'Poles', 'Demand (kVA)', '', 'Circuit', 'Phase', 'Description', 'Poles', 'Demand (kVA)']);

  const assignments = new Map();
  loads.forEach(load => {
    const span = getLoadBreakerSpan(load, panel, circuitCount);
    if (!span.length) return;
    span.forEach((slot, position) => {
      assignments.set(slot, { load, position, spanLength: span.length, startCircuit: span[0] });
    });
  });
  if (Array.isArray(panel.breakers)) {
    panel.breakers.forEach((tag, index) => {
      const circuit = index + 1;
      if (!tag || assignments.has(circuit)) return;
      const load = loads.find(l => (l.ref || l.id || l.tag) === tag);
      if (!load) return;
      const span = getLoadBreakerSpan(load, panel, circuitCount);
      if (span.length) {
        span.forEach((slot, position) => {
          assignments.set(slot, { load, position, spanLength: span.length, startCircuit: span[0] });
        });
      } else {
        assignments.set(circuit, { load, position: 0, spanLength: 1, startCircuit: circuit });
      }
    });
  }

  const rows = [];
  for (let circuit = 1; circuit <= circuitCount; circuit++) {
    const info = assignments.get(circuit);
    const phase = getPhaseLabel(panel, circuit) || '';
    let description = '';
    let poles = '';
    let demandVal = '';
    if (info) {
      const { load, position, spanLength, startCircuit } = info;
      if (position === 0) {
        const derivedPoles = getLoadPoleCount(load, panel);
        const effectivePoles = Math.max(spanLength, derivedPoles);
        poles = effectivePoles ? String(effectivePoles) : '';
        description = getLoadLabel(load);
        const demandCandidate = getDemandValue(load);
        demandVal = demandCandidate != null ? demandCandidate.toFixed(2) : '';
      } else {
        const startRef = parsePositiveInt(load.breaker) || startCircuit || (circuit - position);
        const label = getLoadLabel(load);
        description = `Tied to Circuit ${startRef}${label ? ` — ${label}` : ''}`;
      }
    }
    rows.push({
      circuit,
      phase,
      description,
      poles,
      demand: demandVal
    });
  }

  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i] || { circuit: '', phase: '', description: '', poles: '', demand: '' };
    const right = rows[i + 1] || { circuit: '', phase: '', description: '', poles: '', demand: '' };
    data.push([
      left.circuit ?? '',
      left.phase ?? '',
      left.description ?? '',
      left.poles ?? '',
      left.demand ?? '',
      '',
      right.circuit ?? '',
      right.phase ?? '',
      right.description ?? '',
      right.poles ?? '',
      right.demand ?? ''
    ]);
  }

  const totals = loads.reduce((acc, load) => {
    const connectedKva = Number.parseFloat(load.kva) || 0;
    const connectedKw = Number.parseFloat(load.kw) || 0;
    const demandKva = Number.parseFloat(load.demandKva) || connectedKva;
    const demandKw = Number.parseFloat(load.demandKw) || connectedKw;
    acc.connectedKva += connectedKva;
    acc.connectedKw += connectedKw;
    acc.demandKva += demandKva;
    acc.demandKw += demandKw;
    return acc;
  }, { connectedKva: 0, connectedKw: 0, demandKva: 0, demandKw: 0 });

  data.push([]);
  data.push(['Connected Load (kVA)', totals.connectedKva.toFixed(2), '', '', '', '', 'Demand Load (kVA)', totals.demandKva.toFixed(2)]);
  data.push(['Connected Load (kW)', totals.connectedKw.toFixed(2), '', '', '', '', 'Demand Load (kW)', totals.demandKw.toFixed(2)]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, panelId);
  XLSX.writeFile(wb, `${panelId}_panel_schedule.xlsx`);
}

if (typeof window !== 'undefined') {
  window.exportPanelSchedule = exportPanelSchedule;
}
