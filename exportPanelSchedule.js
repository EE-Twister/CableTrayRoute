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
  const start = parsePositiveInt(load?.breaker);
  if (!start) return [];
  const poles = Math.max(1, getLoadPoleCount(load, panel));
  const limit = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : null;
  const span = [];
  for (let offset = 0; offset < poles; offset++) {
    const slot = start + offset;
    if (limit && slot > limit) break;
    span.push(slot);
  }
  return span;
}

function getLoadLabel(load) {
  const tag = load?.ref || load?.id || load?.tag;
  const desc = load?.description;
  if (tag && desc) return `${tag} — ${desc}`;
  return tag || desc || '';
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

  const data = [];
  data.push(['Panel', panelId]);
  data.push(['Voltage', panel.voltage || panel.voltage_rating || '']);
  const systemType = (panel.powerType || panel.systemType || panel.type || '').toString().toLowerCase() === 'dc' ? 'DC' : 'AC';
  data.push(['System Type', systemType]);
  data.push(['Phases', panel.phases || panel.phaseCount || '']);
  data.push(['Main Rating (A)', panel.mainRating || panel.main_rating || '']);
  data.push(['Short-Circuit Rating (A)', panel.shortCircuitRating || panel.shortCircuitCurrentRating || '']);
  const circuitCount = getPanelCircuitCount(panel);
  data.push(['Circuit Count', circuitCount]);
  data.push([]);
  data.push(['Circuit', 'Poles', 'Description', 'Demand (kVA)']);
  const assignments = new Map();
  loads.forEach(load => {
    const span = getLoadBreakerSpan(load, panel, circuitCount);
    if (!span.length) return;
    span.forEach((slot, position) => {
      assignments.set(slot, { load, position, spanLength: span.length });
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
          assignments.set(slot, { load, position, spanLength: span.length });
        });
      } else {
        assignments.set(circuit, { load, position: 0, spanLength: 1 });
      }
    });
  }

  for (let circuit = 1; circuit <= circuitCount; circuit++) {
    const info = assignments.get(circuit);
    let poles = '';
    let desc = '';
    let demandVal = '';
    if (info) {
      const { load, position, spanLength } = info;
      const isStart = position === 0;
      if (isStart) {
        const poleValue = parsePositiveInt(load.breakerPoles || load.poles || load.phases) || spanLength;
        poles = poleValue ? String(poleValue) : '';
        desc = getLoadLabel(load);
        const demandCandidate = parseFloat(load.demand) || parseFloat(load.demandKw) || parseFloat(load.kw);
        demandVal = Number.isFinite(demandCandidate) ? demandCandidate : '';
      } else {
        const startCircuit = parsePositiveInt(load.breaker) || (circuit - position);
        const label = getLoadLabel(load);
        desc = `Tied to Circuit ${startCircuit}${label ? ` — ${label}` : ''}`;
      }
    }
    data.push([circuit, poles, desc, demandVal]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, panelId);
  XLSX.writeFile(wb, `${panelId}_panel_schedule.xlsx`);
}

if (typeof window !== 'undefined') {
  window.exportPanelSchedule = exportPanelSchedule;
}
