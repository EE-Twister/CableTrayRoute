import "./workflowStatus.js";
import "../site.js";
import * as dataStore from "../dataStore.mjs";
import { exportPanelSchedule } from "../exportPanelSchedule.js";

const projectId = typeof window !== "undefined" ? (window.currentProjectId || "default") : undefined;

function getOrCreatePanel(panelId) {
  const panels = dataStore.getPanels();
  let panel = panels.find(p => p.id === panelId || p.ref === panelId || p.panel_id === panelId);
  if (!panel) {
    panel = {
      id: panelId,
      breakers: [],
      breakerLayout: [],
      breakerDetails: {},
      voltage: "",
      mainRating: "",
      circuitCount: 42,
      powerType: "ac",
      phases: "3",
      shortCircuitRating: "",
      fedFrom: ""
    };
    panels.push(panel);
    dataStore.setPanels(panels);
  }
  if (!Array.isArray(panel.breakerLayout)) {
    panel.breakerLayout = [];
  }
  if (!panel.breakerDetails || typeof panel.breakerDetails !== "object") {
    panel.breakerDetails = {};
  }
  if (panel.fedFrom == null && panel.fed_from != null) {
    panel.fedFrom = panel.fed_from;
  }
  if (panel.fedFrom == null) {
    panel.fedFrom = "";
  }
  if (panel.tag && !panel.ref) {
    panel.ref = panel.tag;
  }
  if (panel.panel_id && !panel.ref) {
    panel.ref = panel.panel_id;
  }
  if (panel.shortCircuitRating == null && panel.shortCircuitCurrentRating != null) {
    panel.shortCircuitRating = panel.shortCircuitCurrentRating;
  }
  return { panel, panels };
}

const DC_PHASE_LABELS = ["+", "−"];
const SINGLE_PHASE_LABELS = ["A", "B"];
const THREE_PHASE_LABELS = ["A", "B", "C"];

function parsePositiveInt(value) {
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getPanelCircuitCount(panel) {
  const explicit = parsePositiveInt(panel?.circuitCount);
  if (explicit) return explicit;
  if (Array.isArray(panel?.breakers)) return panel.breakers.length;
  return 42;
}

function getPanelSystem(panel) {
  const raw = (panel?.powerType || panel?.systemType || panel?.type || "").toString().toLowerCase();
  return raw === "dc" ? "dc" : "ac";
}

function getPanelPhaseSequence(panel) {
  const system = getPanelSystem(panel);
  if (system === "dc") return DC_PHASE_LABELS;
  const phases = parseInt(panel?.phases, 10);
  if (Number.isFinite(phases)) {
    if (phases <= 1) return SINGLE_PHASE_LABELS;
    if (phases === 2) return SINGLE_PHASE_LABELS;
    if (phases >= 3) return THREE_PHASE_LABELS;
  }
  return THREE_PHASE_LABELS;
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

const BREAKER_RATING_VALUES = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250];

function ensureBreakerDetails(panel) {
  if (!panel) return {};
  if (!panel.breakerDetails || typeof panel.breakerDetails !== "object") {
    panel.breakerDetails = {};
  }
  return panel.breakerDetails;
}

function ensureBreakerDetail(panel, startCircuit) {
  if (!panel || !Number.isFinite(startCircuit)) return null;
  const details = ensureBreakerDetails(panel);
  const key = String(startCircuit);
  const existing = details[key];
  if (existing && typeof existing === "object") {
    if (!existing.deviceType) existing.deviceType = "breaker";
    return existing;
  }
  const created = { deviceType: "breaker" };
  details[key] = created;
  return created;
}

function getBreakerDetail(panel, startCircuit) {
  if (!panel || !Number.isFinite(startCircuit)) return null;
  const details = ensureBreakerDetails(panel);
  const detail = details[String(startCircuit)];
  if (detail && !detail.deviceType) {
    detail.deviceType = "breaker";
  }
  return detail || null;
}

function deleteBreakerDetail(panel, startCircuit) {
  if (!panel || !panel.breakerDetails || !Number.isFinite(startCircuit)) return;
  delete panel.breakerDetails[String(startCircuit)];
}

function getDeviceType(detail) {
  return detail && detail.deviceType === "fuse" ? "fuse" : "breaker";
}

function formatDeviceLabel(detail, poleCount) {
  const type = getDeviceType(detail);
  const base = type === "fuse" ? "Fuse" : "Breaker";
  if (Number.isFinite(poleCount) && poleCount > 1) {
    return `${poleCount}-Pole ${base}`;
  }
  return base;
}

function getCableDisplayId(cable) {
  return cable?.tag || cable?.id || cable?.ref || cable?.cable_id || null;
}

function getCableLabel(cable) {
  const id = getCableDisplayId(cable);
  const desc = cable?.service_description || cable?.description || cable?.notes || cable?.circuit_number;
  if (id && desc && desc !== id) {
    return `${id} — ${desc}`;
  }
  return id || desc || null;
}

function clearBreakerBlock(layout, startCircuit) {
  if (!Array.isArray(layout)) return;
  for (let i = 0; i < layout.length; i++) {
    const entry = layout[i];
    if (entry && entry.start === startCircuit) {
      layout[i] = null;
    }
  }
}

function ensurePanelBreakerLayout(panel, circuitCount) {
  if (!panel) {
    return { layout: [], changed: false };
  }
  if (!Array.isArray(panel.breakerLayout)) {
    panel.breakerLayout = [];
  }
  const prevLayout = panel.breakerLayout;
  const count = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : 0;
  const normalized = new Array(count).fill(null);
  let changed = false;
  const details = panel ? ensureBreakerDetails(panel) : {};

  const blocks = new Map();
  for (let i = 0; i < prevLayout.length; i++) {
    const entry = prevLayout[i];
    if (!entry) continue;
    const start = Number(entry.start);
    const size = Number(entry.size);
    const position = Number(entry.position);
    if (!Number.isFinite(start) || !Number.isFinite(size) || size <= 0) {
      changed = true;
      continue;
    }
    if (start < 1 || start > count) {
      changed = true;
      continue;
    }
    if (Number.isFinite(position) && (position < 0 || position >= size)) {
      changed = true;
      continue;
    }
    const existing = blocks.get(start);
    if (!existing || existing.size < size) {
      blocks.set(start, { start, size });
    }
  }

  blocks.forEach(({ start, size }) => {
    const span = computeBreakerSpan(start, size, count);
    if (span.length !== size) {
      changed = true;
      return;
    }
    let conflict = false;
    span.forEach(slot => {
      const idx = slot - 1;
      if (normalized[idx] && normalized[idx].start !== start) {
        conflict = true;
      }
    });
    if (conflict) {
      changed = true;
      return;
    }
    span.forEach((slot, position) => {
      const idx = slot - 1;
      normalized[idx] = { start, size, position };
    });
    if (details) {
      const detail = details[String(start)];
      if (detail) {
        detail.poles = Number.isFinite(size) && size > 0 ? Number(size) : detail.poles;
        if (!detail.deviceType) detail.deviceType = "breaker";
      }
    }
  });

  if (prevLayout.length !== normalized.length) {
    changed = true;
  } else {
    for (let i = 0; i < normalized.length; i++) {
      const existing = prevLayout[i] || null;
      const next = normalized[i] || null;
      if (!existing && !next) continue;
      if (!existing || !next || existing.start !== next.start || existing.size !== next.size || existing.position !== next.position) {
        changed = true;
        break;
      }
    }
  }

  panel.breakerLayout = normalized;
  if (panel) {
    const validStarts = new Set();
    normalized.forEach(entry => {
      if (!entry) return;
      const start = Number(entry.start);
      if (!Number.isFinite(start)) return;
      if (entry.position === 0) {
        const key = String(start);
        validStarts.add(key);
        const detail = details[key];
        if (detail) {
          detail.poles = Number(entry.size) && Number(entry.size) > 0 ? Number(entry.size) : detail.poles;
          if (!detail.deviceType) detail.deviceType = "breaker";
        }
      }
    });
    Object.keys(details).forEach(key => {
      if (!validStarts.has(key)) {
        delete details[key];
      }
    });
  }
  return { layout: panel.breakerLayout, changed };
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
  const total = Number.isFinite(circuitCount) && circuitCount > 0
    ? circuitCount
    : getPanelCircuitCount(panel);
  return computeBreakerSpan(start, size, total);
}

function initializeLayoutFromLoads(panel, panelId, loads, circuitCount) {
  if (!panel) return false;
  const { layout } = ensurePanelBreakerLayout(panel, circuitCount);
  if (layout.some(entry => entry)) return false;
  let changed = false;
  loads.forEach(load => {
    if (load.panelId !== panelId) return;
    const span = getLoadBreakerSpan(load, panel, circuitCount);
    if (!span.length) return;
    const start = span[0];
    const size = span.length;
    const normalized = computeBreakerSpan(start, size, circuitCount);
    if (normalized.length !== size) return;
    normalized.forEach((slot, position) => {
      if (slot >= 1 && slot <= circuitCount) {
        layout[slot - 1] = { start, size, position };
      }
    });
    changed = true;
  });
  return changed;
}

function getPhaseLabel(panel, breaker) {
  const sequence = getPanelPhaseSequence(panel);
  if (!sequence.length) return "";
  const index = Number(breaker);
  if (!Number.isFinite(index) || index < 1) return "";
  const system = getPanelSystem(panel);
  if (sequence.length === 3 && system === "ac") {
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
    if (system === "dc") return Math.min(parsed, 2);
    if (system === "ac") {
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
    : (panel ? getPanelCircuitCount(panel) : null);

  if (panel) {
    const blockAtSlot = getBreakerBlock(panel, start);
    if (blockAtSlot && Number.isFinite(Number(blockAtSlot.start)) && Number(blockAtSlot.start) !== start) {
      start = Number(blockAtSlot.start);
    }
    const startBlock = getBreakerBlock(panel, start);
    if (startBlock && startBlock.position === 0) {
      const blockSpan = getBlockCircuits(panel, startBlock, limit ?? getPanelCircuitCount(panel));
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

function ensurePanelBreakerCapacity(panel, circuitCount) {
  if (!panel) return;
  if (!Array.isArray(panel.breakers)) panel.breakers = [];
  if (!Number.isFinite(circuitCount) || circuitCount <= 0) return;
  if (panel.breakers.length >= circuitCount) return;
  for (let i = panel.breakers.length; i < circuitCount; i++) {
    panel.breakers[i] = null;
  }
}

function clearPanelBreakerAssignments(panel, loadTag) {
  if (!panel || !Array.isArray(panel.breakers) || !loadTag) return;
  for (let i = 0; i < panel.breakers.length; i++) {
    if (panel.breakers[i] === loadTag) {
      panel.breakers[i] = null;
    }
  }
}

function applyPanelBreakerAssignments(panel, loadTag, span) {
  if (!panel || !Array.isArray(panel.breakers) || !loadTag) return;
  span.forEach(slot => {
    const index = slot - 1;
    if (index >= 0 && index < panel.breakers.length) {
      panel.breakers[index] = loadTag;
    }
  });
}

function getLoadDisplayId(load) {
  return load?.ref || load?.id || load?.tag || null;
}

function formatLoadLabel(load, index) {
  const tag = load.ref || load.id || load.tag;
  const desc = load.description;
  if (tag && desc) return `${tag} — ${desc}`;
  return tag || desc || `Load ${index + 1}`;
}

function createMetaChip(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function getPhasePowerValue(load, system) {
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
  if (zeroFound) return 0;
  return null;
}

function createPhaseSummary(panel, panelId, loads, circuitCount) {
  const sequence = getPanelPhaseSequence(panel);
  if (!sequence.length) return null;
  const phases = Array.from(new Set(sequence)).filter(Boolean);
  if (!phases.length) return null;
  const system = getPanelSystem(panel);
  const totals = {};
  phases.forEach(phase => {
    totals[phase] = 0;
  });

  const seenLoads = new Set();
  const totalBreakers = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : panel.breakers?.length || 0;
  loads.forEach(load => {
    if (load.panelId !== panelId) return;
    const id = getLoadDisplayId(load) || `idx-${loads.indexOf(load)}`;
    if (seenLoads.has(id)) return;
    seenLoads.add(id);
    const span = getLoadBreakerSpan(load, panel, totalBreakers);
    if (!span.length) return;
    const value = getPhasePowerValue(load, system);
    if (value == null) return;
    const share = span.length > 0 ? value / span.length : value;
    span.forEach(slot => {
      const phase = getPhaseLabel(panel, slot);
      if (!phase) return;
      totals[phase] += share;
    });
  });

  const summary = document.createElement("div");
  summary.className = "panel-phase-summary";
  const title = document.createElement("div");
  title.className = "panel-phase-summary-title";
  title.textContent = system === "dc" ? "Polarity Load (W)" : "Phase Load (VA)";
  summary.appendChild(title);

  const values = document.createElement("div");
  values.className = "panel-phase-summary-values";
  const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  const unit = system === "dc" ? "W" : "VA";
  phases.forEach(phase => {
    const chip = document.createElement("span");
    chip.className = "panel-phase-summary-chip";
    const total = totals[phase] || 0;
    chip.textContent = `${phase}: ${formatter.format(total)} ${unit}`;
    values.appendChild(chip);
  });
  summary.appendChild(values);
  return summary;
}

/**
 * Assign a load to a breaker within a panel.
 * Updates the stored load with panel and breaker information.
 * @param {string} panelId
 * @param {number} loadIndex
 * @param {number} breaker
 */
export function assignLoadToBreaker(panelId, loadIndex, breaker) {
  const loads = dataStore.getLoads();
  const panels = dataStore.getPanels();
  if (!Array.isArray(loads) || loadIndex == null || loadIndex < 0 || loadIndex >= loads.length) {
    return;
  }
  const panel = panels.find(p => p.id === panelId || p.ref === panelId || p.panel_id === panelId);
  const load = loads[loadIndex];
  const loadTag = load.ref || load.id || load.tag;
  const circuitCount = panel ? getPanelCircuitCount(panel) : 0;
  if (panel) {
    ensurePanelBreakerLayout(panel, circuitCount);
  }
  const block = panel ? getBreakerBlock(panel, breaker) : null;
  const startCircuit = block && Number.isFinite(Number(block.start)) ? Number(block.start) : breaker;
  if (!block || block.position !== 0) {
    alert("Configure a breaker at this circuit before assigning a load.");
    return;
  }
  const blockSize = Number(block.size) && Number(block.size) > 0 ? Number(block.size) : 1;
  const loadWithBreaker = { ...load, breaker: startCircuit, breakerPoles: blockSize };
  const span = getLoadBreakerSpan(loadWithBreaker, panel, circuitCount);
  if (!span.length) {
    alert("Unable to assign load: invalid breaker selection.");
    return;
  }
  const requiredPoles = Math.max(blockSize, getLoadPoleCount(loadWithBreaker, panel));
  if (circuitCount && span[span.length - 1] > circuitCount) {
    alert(`Breaker selection requires ${requiredPoles} spaces on the same side of the panel but exceeds the available circuits.`);
    return;
  }
  if (span.length !== requiredPoles) {
    alert(`Breaker selection requires ${requiredPoles} spaces on the same side of the panel but only ${span.length} are available before the panel ends.`);
    return;
  }
  const conflict = loads.find((candidate, idx) => {
    if (idx === loadIndex) return false;
    if (candidate.panelId !== panelId) return false;
    const otherSpan = getLoadBreakerSpan(candidate, panel, circuitCount);
    if (!otherSpan.length) return false;
    return otherSpan.some(slot => span.includes(slot));
  });
  if (conflict) {
    alert(`Cannot assign load: circuits conflict with ${formatLoadLabel(conflict, loads.indexOf(conflict))}.`);
    return;
  }
  // remove existing assignment of this load
  if (load.panelId) {
    const prev = panels.find(p => p.id === load.panelId || p.ref === load.panelId || p.panel_id === load.panelId);
    if (prev && Array.isArray(prev.breakers)) {
      clearPanelBreakerAssignments(prev, loadTag);
    }
  }
  // clear any existing assignment on this breaker for the panel
  if (panel) {
    const count = getPanelCircuitCount(panel);
    ensurePanelBreakerCapacity(panel, count);
    clearPanelBreakerAssignments(panel, loadTag);
  }
  loads.forEach(l => {
    if (l.panelId === panelId && l.breaker === startCircuit) {
      delete l.panelId;
      delete l.breaker;
      delete l.breakerPoles;
    }
  });
  load.panelId = panelId;
  load.breaker = startCircuit;
  if (requiredPoles > 1) {
    load.breakerPoles = requiredPoles;
  } else {
    delete load.breakerPoles;
  }
  if (panel) {
    applyPanelBreakerAssignments(panel, loadTag, span);
    dataStore.setPanels(panels);
  }
  dataStore.setLoads(loads);
  dataStore.saveProject(projectId);
  const fn = window.opener?.updateComponent || window.updateComponent;
  if (fn) {
    if (loadTag) fn(loadTag, load);
  }
}

/**
 * Calculate connected and demand load totals for a panel.
 * @param {string} panelId
 * @returns {{connectedKva:number,connectedKw:number,demandKva:number,demandKw:number}}
 */
export function calculatePanelTotals(panelId) {
  const loads = dataStore.getLoads().filter(l => l.panelId === panelId);
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

function render(panelId = "P1") {
  const { panel, panels } = getOrCreatePanel(panelId);
  const container = document.getElementById("panel-container");
  if (!container) return;
  container.innerHTML = "";

  const breakerDetails = ensureBreakerDetails(panel);
  const ratingList = document.createElement("datalist");
  ratingList.id = "panel-breaker-rating-options";
  BREAKER_RATING_VALUES.forEach(value => {
    const option = document.createElement("option");
    option.value = String(value);
    ratingList.appendChild(option);
  });
  container.appendChild(ratingList);

  const cableList = document.createElement("datalist");
  cableList.id = "panel-breaker-cable-options";
  const cables = dataStore.getCables();
  const seenCableIds = new Set();
  cables.forEach(cable => {
    const id = getCableDisplayId(cable);
    if (!id || seenCableIds.has(id)) return;
    seenCableIds.add(id);
    const option = document.createElement("option");
    option.value = id;
    const label = getCableLabel(cable);
    if (label && label !== id) {
      option.label = label;
    }
    cableList.appendChild(option);
  });
  container.appendChild(cableList);

  const circuitCount = getPanelCircuitCount(panel);
  ensurePanelBreakerCapacity(panel, circuitCount);
  const { changed: layoutAdjusted } = ensurePanelBreakerLayout(panel, circuitCount);
  const loads = dataStore.getLoads();
  const seeded = initializeLayoutFromLoads(panel, panelId, loads, circuitCount);
  if (layoutAdjusted || seeded) {
    dataStore.setPanels(panels);
    dataStore.saveProject(projectId);
  }
  const system = getPanelSystem(panel);
  const sequence = getPanelPhaseSequence(panel);

  const legend = document.createElement("div");
  legend.className = "panel-bus-legend";
  if (system === "dc") {
    legend.textContent = `DC Polarity: ${sequence.join(" / ")}`;
  } else {
    const descriptor = sequence.length === 3 ? "AC • 3-Phase" : "AC • Single-Phase";
    legend.textContent = `${descriptor} Bus: ${sequence.join(" / ")}`;
  }
  container.appendChild(legend);

  const toolbox = document.createElement("div");
  toolbox.className = "panel-breaker-toolbox";
  const toolboxTitle = document.createElement("div");
  toolboxTitle.className = "panel-breaker-toolbox-title";
  toolboxTitle.textContent = "Breaker Palette";
  toolbox.appendChild(toolboxTitle);
  const toolboxHelp = document.createElement("div");
  toolboxHelp.className = "panel-breaker-toolbox-help";
  toolboxHelp.textContent = "Drag a breaker onto the panel or use the Add buttons in each circuit.";
  toolbox.appendChild(toolboxHelp);
  const toolboxItems = document.createElement("div");
  toolboxItems.className = "panel-breaker-toolbox-items";
  [1, 2, 3].forEach(poles => {
    const item = document.createElement("div");
    item.className = "panel-breaker-toolbox-item";
    item.draggable = true;
    item.dataset.breakerPoles = String(poles);
    item.textContent = `${poles}-Pole Breaker`;
    item.title = "Drag onto the panel to add this breaker";
    toolboxItems.appendChild(item);
  });
  toolbox.appendChild(toolboxItems);
  container.appendChild(toolbox);

  const phaseSummary = createPhaseSummary(panel, panelId, loads, circuitCount);
  if (phaseSummary) {
    container.appendChild(phaseSummary);
  }

  const table = document.createElement("table");
  table.id = "panel-table";
  table.className = "panel-schedule-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const leftHeader = document.createElement("th");
  leftHeader.scope = "col";
  leftHeader.textContent = "Odd Circuits";
  const deviceHeader = document.createElement("th");
  deviceHeader.scope = "col";
  deviceHeader.className = "panel-device-header";
  deviceHeader.textContent = "Device";
  const rightHeader = document.createElement("th");
  rightHeader.scope = "col";
  rightHeader.textContent = "Even Circuits";
  headRow.append(leftHeader, deviceHeader, rightHeader);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const rows = Math.ceil(circuitCount / 2);
  for (let i = 0; i < rows; i++) {
    const row = document.createElement("tr");
    const oddCircuit = i * 2 + 1;
    const evenCircuit = oddCircuit + 1;
    row.appendChild(createCircuitCell(panel, panelId, loads, oddCircuit, circuitCount, "left", system, breakerDetails));
    row.appendChild(createDeviceCell(panel, oddCircuit, evenCircuit, circuitCount, breakerDetails));
    row.appendChild(createCircuitCell(panel, panelId, loads, evenCircuit, circuitCount, "right", system, breakerDetails));
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.appendChild(table);
  updateTotals(panelId);
}

function createCircuitCell(panel, panelId, loads, breaker, circuitCount, position, system, breakerDetails) {
  const td = document.createElement("td");
  td.className = "panel-cell";
  if (position) td.classList.add(`panel-cell--${position}`);

  if (breaker > circuitCount) {
    const slot = document.createElement("div");
    slot.className = "panel-slot panel-slot--inactive";
    const empty = document.createElement("div");
    empty.className = "panel-slot-empty";
    empty.textContent = "—";
    slot.appendChild(empty);
    td.appendChild(slot);
    return td;
  }

  const slot = document.createElement("div");
  if (!system) {
    system = getPanelSystem(panel);
  }
  slot.className = `panel-slot panel-slot--${system}`;
  const layout = Array.isArray(panel.breakerLayout) ? panel.breakerLayout : [];
  const block = layout[breaker - 1] || null;
  const blockStart = block && Number.isFinite(Number(block.start)) ? Number(block.start) : null;
  const blockSize = block && Number.isFinite(Number(block.size)) ? Number(block.size) : null;
  const isBlockStart = Boolean(block && block.position === 0);
  const isBlockContinuation = Boolean(block && block.position > 0);
  const detailMap = breakerDetails || ensureBreakerDetails(panel);
  const breakerDetail = Number.isFinite(blockStart) ? (detailMap[String(blockStart)] || null) : null;
  slot.dataset.circuit = String(breaker);
  if (!block) {
    slot.dataset.breakerDrop = "available";
  } else {
    if (blockStart) {
      slot.dataset.breakerStart = String(blockStart);
    }
    if (isBlockStart) {
      slot.dataset.breakerDrop = "start";
      if (Number.isFinite(blockSize)) {
        slot.dataset.breakerSize = String(blockSize);
      }
    }
  }
  if (breakerDetail) {
    slot.dataset.deviceType = getDeviceType(breakerDetail);
    if (breakerDetail.rating != null && breakerDetail.rating !== "") {
      slot.dataset.deviceRating = String(breakerDetail.rating);
    } else {
      delete slot.dataset.deviceRating;
    }
  }
  const phaseLabel = getPhaseLabel(panel, breaker);
  if (phaseLabel) slot.dataset.phase = phaseLabel;

  const header = document.createElement("div");
  header.className = "panel-slot-header";
  const circuitEl = document.createElement("span");
  circuitEl.className = "panel-slot-circuit";
  circuitEl.textContent = breaker;
  const phaseEl = document.createElement("span");
  phaseEl.className = "panel-slot-phase";
  phaseEl.textContent = phaseLabel;
  if (system === "dc") {
    const label = phaseLabel === "+" ? "positive" : "negative";
    phaseEl.setAttribute("aria-label", `Polarity ${label}`);
  } else if (phaseLabel) {
    phaseEl.setAttribute("aria-label", `Phase ${phaseLabel}`);
  }
  header.append(circuitEl, phaseEl);
  slot.appendChild(header);

  const control = document.createElement("div");
  control.className = "panel-slot-control";
  const totalBreakers = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : panel.breakers?.length || 0;
  let assignedLoad = null;
  let assignedIndex = -1;
  let assignedSpan = [];
  let assignedStart = null;
  for (let i = 0; i < loads.length; i++) {
    const candidate = loads[i];
    if (candidate.panelId !== panelId) continue;
    const span = getLoadBreakerSpan(candidate, panel, totalBreakers);
    if (!span.length) continue;
    if (span.includes(breaker)) {
      assignedLoad = candidate;
      assignedIndex = i;
      assignedSpan = span;
      assignedStart = parsePositiveInt(candidate.breaker);
      break;
    }
  }
  if (!assignedLoad && Array.isArray(panel.breakers)) {
    const tag = panel.breakers[breaker - 1];
    if (tag) {
      const fallbackIndex = loads.findIndex(load => (load.ref || load.id || load.tag) === tag);
      if (fallbackIndex >= 0) {
        assignedLoad = loads[fallbackIndex];
        assignedIndex = fallbackIndex;
        assignedStart = parsePositiveInt(assignedLoad.breaker);
        if (!assignedStart) {
          const first = panel.breakers.findIndex(val => val === tag);
          assignedStart = first >= 0 ? first + 1 : breaker;
        }
        assignedSpan = getLoadBreakerSpan(assignedLoad, panel, totalBreakers);
        if (!assignedSpan.length && assignedStart) {
          const poles = Math.max(1, getLoadPoleCount(assignedLoad, panel));
          for (let offset = 0; offset < poles; offset++) {
            const slotNumber = assignedStart + offset;
            if (totalBreakers && slotNumber > totalBreakers) break;
            assignedSpan.push(slotNumber);
          }
        }
      }
    }
  }

  const isStart = assignedLoad && assignedStart === breaker;
  const blockCircuits = block ? getBlockCircuits(panel, block, circuitCount) : [];
  const primaryStart = blockStart || (blockCircuits.length ? blockCircuits[0] : breaker);
  const blockPoleCount = Number.isFinite(blockSize) && blockSize > 0 ? Number(blockSize) : null;
  const blockLabel = formatDeviceLabel(breakerDetail, blockPoleCount || (assignedSpan.length || 1));

  if (!block) {
    slot.classList.add("panel-slot--blank");
    control.classList.add("panel-slot-control--blank");
    const dropZone = document.createElement("div");
    dropZone.className = "panel-slot-dropzone";
    dropZone.textContent = "Drag a breaker here";
    control.appendChild(dropZone);

    const quickAdd = document.createElement("div");
    quickAdd.className = "panel-slot-quick-add";
    [1, 2, 3].forEach(poles => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-slot-add-btn";
      button.dataset.action = "add-breaker";
      button.dataset.poles = String(poles);
      button.dataset.circuit = String(breaker);
      button.textContent = `${poles}-Pole`;
      quickAdd.appendChild(button);
    });
    control.appendChild(quickAdd);
  } else if (isBlockStart) {
    const select = document.createElement("select");
    select.dataset.breaker = primaryStart;
    select.id = `panel-breaker-${primaryStart}`;
    select.className = "panel-slot-select";
    select.setAttribute("aria-label", `Assign load to breaker starting at circuit ${primaryStart}`);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— Assign Load —";
    select.appendChild(placeholder);

    loads.forEach((load, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = formatLoadLabel(load, idx);
      if (assignedLoad && idx === assignedIndex && isStart) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    control.appendChild(select);

    const config = document.createElement("div");
    config.className = "panel-slot-device-config";
    const deviceType = getDeviceType(breakerDetail);
    const ratingValue = breakerDetail && breakerDetail.rating != null ? String(breakerDetail.rating) : "";
    const cableValue = breakerDetail?.cableTag || breakerDetail?.cable || breakerDetail?.cableId || "";

    const typeLabel = document.createElement("label");
    typeLabel.className = "panel-slot-field";
    typeLabel.textContent = "Device Type";
    const typeSelect = document.createElement("select");
    typeSelect.className = "panel-slot-input";
    typeSelect.dataset.breakerDevice = String(primaryStart);
    const breakerOption = document.createElement("option");
    breakerOption.value = "breaker";
    breakerOption.textContent = "Breaker";
    const fuseOption = document.createElement("option");
    fuseOption.value = "fuse";
    fuseOption.textContent = "Fuse";
    typeSelect.append(breakerOption, fuseOption);
    typeSelect.value = deviceType === "fuse" ? "fuse" : "breaker";
    typeLabel.appendChild(typeSelect);
    config.appendChild(typeLabel);

    const ratingLabel = document.createElement("label");
    ratingLabel.className = "panel-slot-field";
    ratingLabel.textContent = "Rating (A)";
    const ratingInput = document.createElement("input");
    ratingInput.type = "number";
    ratingInput.min = "0";
    ratingInput.step = "1";
    ratingInput.placeholder = "e.g. 20";
    ratingInput.className = "panel-slot-input";
    ratingInput.dataset.breakerRating = String(primaryStart);
    ratingInput.setAttribute("list", "panel-breaker-rating-options");
    ratingInput.value = ratingValue;
    ratingLabel.appendChild(ratingInput);
    config.appendChild(ratingLabel);

    const cableLabel = document.createElement("label");
    cableLabel.className = "panel-slot-field";
    cableLabel.textContent = "Cable";
    const cableInput = document.createElement("input");
    cableInput.type = "text";
    cableInput.className = "panel-slot-input";
    cableInput.placeholder = "Cable Tag";
    cableInput.dataset.breakerCable = String(primaryStart);
    cableInput.setAttribute("list", "panel-breaker-cable-options");
    cableInput.value = cableValue;
    cableLabel.appendChild(cableInput);
    config.appendChild(cableLabel);

    control.appendChild(config);

    const breakerInfo = document.createElement("div");
    breakerInfo.className = "panel-slot-breaker-info";
    const infoSegments = [];
    if (blockLabel) infoSegments.push(blockLabel);
    if (ratingValue) infoSegments.push(`${ratingValue}A`);
    breakerInfo.textContent = infoSegments.length ? infoSegments.join(" — ") : "Breaker";
    control.appendChild(breakerInfo);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "panel-slot-remove";
    removeBtn.dataset.action = "remove-breaker";
    removeBtn.dataset.circuit = String(primaryStart);
    const removeLabel = deviceType === "fuse" ? "Fuse" : "Breaker";
    removeBtn.textContent = `Remove ${removeLabel}`;
    if (assignedLoad) {
      removeBtn.disabled = true;
      removeBtn.title = `Remove the load before deleting this ${removeLabel.toLowerCase()}.`;
    } else {
      removeBtn.title = `Remove ${removeLabel.toLowerCase()}`;
    }
    control.appendChild(removeBtn);
  } else {
    slot.classList.add("panel-slot--locked");
    const locked = document.createElement("div");
    locked.className = "panel-slot-locked";
    const label = assignedLoad ? formatLoadLabel(assignedLoad, assignedIndex >= 0 ? assignedIndex : loads.indexOf(assignedLoad)) : "";
    const startCircuit = primaryStart || assignedStart || assignedSpan[0] || breaker;
    if (assignedLoad) {
      locked.textContent = label ? `Tied to Circuit ${startCircuit} — ${label}` : `Tied to Circuit ${startCircuit}`;
    } else {
      locked.textContent = `Reserved for breaker starting at Circuit ${startCircuit}`;
    }
    control.appendChild(locked);
  }
  slot.appendChild(control);

  const details = document.createElement("div");
  details.className = "panel-slot-details";
  if (assignedLoad) {
    const descriptor = document.createElement("div");
    descriptor.className = "panel-slot-desc";
    const parts = [];
    const tag = assignedLoad.tag || assignedLoad.ref || assignedLoad.id;
    if (tag) parts.push(tag);
    if (assignedLoad.description) parts.push(assignedLoad.description);
    descriptor.textContent = parts.join(" — ") || "Assigned Load";
    details.appendChild(descriptor);

    const meta = document.createElement("div");
    meta.className = "panel-slot-meta";
    const kva = parseFloat(assignedLoad.kva);
    if (Number.isFinite(kva) && kva !== 0) meta.appendChild(createMetaChip(`${kva.toFixed(2)} kVA`));
    const kw = parseFloat(assignedLoad.kw);
    if (Number.isFinite(kw) && kw !== 0) meta.appendChild(createMetaChip(`${kw.toFixed(2)} kW`));
    const demandKva = parseFloat(assignedLoad.demandKva);
    if (Number.isFinite(demandKva) && demandKva !== 0) meta.appendChild(createMetaChip(`Demand ${demandKva.toFixed(2)} kVA`));
    const demandKw = parseFloat(assignedLoad.demandKw);
    if (Number.isFinite(demandKw) && demandKw !== 0) meta.appendChild(createMetaChip(`Demand ${demandKw.toFixed(2)} kW`));
    const poleCount = blockSize || assignedSpan.length || Math.max(1, getLoadPoleCount(assignedLoad, panel));
    if (poleCount > 1) meta.appendChild(createMetaChip(`${poleCount}-pole`));
    const phases = assignedLoad.phases || assignedLoad.poles;
    const parsedPhases = parsePositiveInt(phases);
    if (phases && (!parsedPhases || parsedPhases !== poleCount)) meta.appendChild(createMetaChip(`${phases}ϕ`));
    if (poleCount > 1) {
      const spanIndex = assignedSpan.indexOf(breaker);
      if (spanIndex >= 0) meta.appendChild(createMetaChip(`Pole ${spanIndex + 1} of ${poleCount}`));
    }
    const voltage = assignedLoad.voltage;
    if (voltage) meta.appendChild(createMetaChip(`${voltage} V`));
    if (blockLabel) {
      const ratingChip = breakerDetail && breakerDetail.rating != null && breakerDetail.rating !== ""
        ? `${breakerDetail.rating}A ${blockLabel}`
        : blockLabel;
      const normalized = ratingChip.trim();
      if (normalized) meta.appendChild(createMetaChip(normalized));
    }
    const cableTag = breakerDetail?.cableTag || breakerDetail?.cable || breakerDetail?.cableId;
    if (cableTag) {
      meta.appendChild(createMetaChip(`Cable ${cableTag}`));
    }
    if (meta.childElementCount > 0) {
      details.appendChild(meta);
    }

    const totalPower = getPhasePowerValue(assignedLoad, system);
    if (totalPower != null) {
      const spanCircuits = assignedSpan.length ? assignedSpan : (blockCircuits.length ? blockCircuits : [breaker]);
      if (spanCircuits.length) {
        const phaseTotals = new Map();
        const share = spanCircuits.length ? totalPower / spanCircuits.length : totalPower;
        spanCircuits.forEach(slotNumber => {
          const phase = getPhaseLabel(panel, slotNumber);
          if (!phase) return;
          phaseTotals.set(phase, (phaseTotals.get(phase) || 0) + share);
        });
        if (phaseTotals.size) {
          const contribution = document.createElement("div");
          contribution.className = "panel-slot-phase-load";
          const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
          const unit = system === "dc" ? "W" : "VA";
          phaseTotals.forEach((amount, phase) => {
            const chip = document.createElement("span");
            chip.className = "panel-slot-phase-chip";
            chip.textContent = `${phase}: ${formatter.format(amount)} ${unit}`;
            contribution.appendChild(chip);
          });
          details.appendChild(contribution);
        }
      }
    }
  } else if (block) {
    details.classList.add("panel-slot-details-empty");
    if (isBlockStart) {
      const infoSegments = [];
      if (blockLabel) infoSegments.push(blockLabel);
      const ratingValue = breakerDetail && breakerDetail.rating != null && breakerDetail.rating !== ""
        ? String(breakerDetail.rating)
        : "";
      if (ratingValue) infoSegments.push(`${ratingValue}A`);
      const summary = infoSegments.length ? infoSegments.join(" — ") : "Breaker";
      details.textContent = `${summary} available`;
      const cableTag = breakerDetail?.cableTag || breakerDetail?.cable || breakerDetail?.cableId;
      if (cableTag) {
        const meta = document.createElement("div");
        meta.className = "panel-slot-meta";
        meta.appendChild(createMetaChip(`Cable ${cableTag}`));
        details.appendChild(meta);
      }
    } else {
      details.textContent = blockLabel
        ? `Part of ${blockLabel} starting at Circuit ${primaryStart}`
        : `Part of breaker starting at Circuit ${primaryStart}`;
    }
  } else {
    details.classList.add("panel-slot-details-empty");
    details.textContent = "No breaker configured";
  }

  slot.appendChild(details);
  td.appendChild(slot);
  return td;
}

function createDeviceCell(panel, oddCircuit, evenCircuit, circuitCount, breakerDetails) {
  const td = document.createElement("td");
  td.className = "panel-device-cell";

  const wrapper = document.createElement("div");
  wrapper.className = "panel-device-wrapper";
  const oddSlot = document.createElement("div");
  oddSlot.className = "panel-device-slot panel-device-slot--odd";
  const evenSlot = document.createElement("div");
  evenSlot.className = "panel-device-slot panel-device-slot--even";
  wrapper.append(oddSlot, evenSlot);
  td.appendChild(wrapper);

  const layout = Array.isArray(panel.breakerLayout) ? panel.breakerLayout : [];

  const appendDevice = (circuit, slotEl) => {
    if (!Number.isFinite(circuit) || circuit < 1 || circuit > circuitCount) return;
    const block = layout[circuit - 1] || null;
    if (!block || block.position !== 0) return;
    const start = Number(block.start);
    if (!Number.isFinite(start)) return;
    const size = Number(block.size);
    const detail = breakerDetails ? breakerDetails[String(start)] || getBreakerDetail(panel, start) : getBreakerDetail(panel, start);
    const icon = createBranchDeviceIcon(detail, Number.isFinite(size) && size > 0 ? Number(size) : 1, start);
    if (icon) {
      slotEl.appendChild(icon);
    }
  };

  appendDevice(oddCircuit, oddSlot);
  appendDevice(evenCircuit, evenSlot);
  return td;
}

function createBranchDeviceIcon(detail, poleCount, startCircuit) {
  const type = getDeviceType(detail);
  const poles = Number.isFinite(poleCount) && poleCount > 0 ? poleCount : 1;
  const icon = document.createElement("div");
  icon.className = `panel-device panel-device--${type}`;
  icon.dataset.breaker = String(startCircuit);
  icon.dataset.poles = String(poles);
  icon.dataset.deviceType = type;

  const graphic = document.createElement("div");
  graphic.className = "panel-device-graphic";
  const handles = document.createElement("div");
  handles.className = "panel-device-handles";
  for (let i = 0; i < poles; i++) {
    const handle = document.createElement("span");
    handle.className = "panel-device-handle";
    handles.appendChild(handle);
  }
  graphic.appendChild(handles);
  if (poles > 1) {
    const tie = document.createElement("span");
    tie.className = "panel-device-tie";
    graphic.appendChild(tie);
  }
  icon.appendChild(graphic);

  const ratingValue = detail && detail.rating != null && detail.rating !== "" ? String(detail.rating) : "";
  const labelText = ratingValue ? `${ratingValue}A` : formatDeviceLabel(detail, poles);
  if (labelText) {
    const label = document.createElement("span");
    label.className = "panel-device-label";
    label.textContent = labelText;
    icon.appendChild(label);
    if (ratingValue) {
      icon.dataset.rating = ratingValue;
    }
  }

  const cableTag = detail?.cableTag || detail?.cable || detail?.cableId;
  if (cableTag) {
    const subtext = document.createElement("span");
    subtext.className = "panel-device-subtext";
    subtext.textContent = cableTag;
    icon.dataset.cable = cableTag;
    icon.appendChild(subtext);
  }

  const tooltipParts = [];
  tooltipParts.push(formatDeviceLabel(detail, poles));
  if (ratingValue) tooltipParts.push(`${ratingValue}A`);
  if (cableTag) tooltipParts.push(`Cable ${cableTag}`);
  const tooltip = tooltipParts.filter(Boolean).join(" • ");
  if (tooltip) {
    icon.title = tooltip;
    icon.setAttribute("aria-label", tooltip);
  } else {
    const fallback = formatDeviceLabel(detail, poles);
    icon.title = fallback;
    icon.setAttribute("aria-label", fallback);
  }

  return icon;
}

function updateTotals(panelId) {
  const totals = calculatePanelTotals(panelId);
  const div = document.getElementById("panel-totals");
  if (div) {
    div.textContent = `Connected: ${totals.connectedKva.toFixed(2)} kVA (${totals.connectedKw.toFixed(2)} kW), Demand: ${totals.demandKva.toFixed(2)} kVA (${totals.demandKw.toFixed(2)} kW)`;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  dataStore.loadProject(projectId);
  const panelId = "P1";
  const { panel, panels } = getOrCreatePanel(panelId);
  let currentDragPoles = null;

  const tagInput = document.getElementById("panel-tag");
  const fedFromInput = document.getElementById("panel-fed-from");
  const voltageInput = document.getElementById("panel-voltage");
  const manufacturerInput = document.getElementById("panel-manufacturer");
  const modelInput = document.getElementById("panel-model");
  const systemInput = document.getElementById("panel-system-type");
  const phasesInput = document.getElementById("panel-phases");
  const mainInput = document.getElementById("panel-main-rating");
  const circuitInput = document.getElementById("panel-circuit-count");
  const sccrInput = document.getElementById("panel-sccr");

  const savePanels = () => {
    dataStore.setPanels(panels);
    dataStore.saveProject(projectId);
  };

  const updateOneline = () => {
    const fn = window.opener?.updateComponent || window.updateComponent;
    if (fn) {
      const id = panel.ref || panel.id;
      if (id) fn(id, panel);
    }
  };

  const configureBreaker = (startCircuit, poles) => {
    const start = Number.parseInt(startCircuit, 10);
    if (!Number.isFinite(start) || start < 1) return;
    let size = Number.parseInt(poles, 10);
    if (!Number.isFinite(size) || size < 1) size = 1;
    if (size > 3) size = 3;
    const count = getPanelCircuitCount(panel);
    ensurePanelBreakerCapacity(panel, count);
    const { layout } = ensurePanelBreakerLayout(panel, count);
    const loads = dataStore.getLoads();
    const targetSlots = computeBreakerSpan(start, size, count);
    if (targetSlots.length !== size) {
      alert(`Breaker requires ${size} spaces on the same side of the panel but exceeds the available circuits.`);
      return;
    }
    const conflictSlot = targetSlots.find(slot => {
      const entry = layout[slot - 1];
      return entry && entry.start !== start;
    });
    if (conflictSlot) {
      alert("Target circuits already belong to another breaker. Remove it first.");
      return;
    }
    const existing = getBreakerBlock(panel, start);
    const existingSlots = existing && existing.position === 0
      ? getBlockCircuits(panel, existing, count)
      : [];
    const removedSlots = existingSlots.filter(slot => !targetSlots.includes(slot));
    const unchanged = existingSlots.length === targetSlots.length
      && existingSlots.every((slot, idx) => slot === targetSlots[idx]);
    const conflictLoad = loads.find(candidate => {
      if (candidate.panelId !== panelId) return false;
      const span = getLoadBreakerSpan(candidate, panel, count);
      if (!span.length) return false;
      if (unchanged && span[0] === start && span.length === size) return false;
      return span.some(slot => targetSlots.includes(slot) || removedSlots.includes(slot));
    });
    if (conflictLoad) {
      const label = formatLoadLabel(conflictLoad, loads.indexOf(conflictLoad));
      alert(label ? `Remove load ${label} before changing this breaker.` : "Remove the load before changing this breaker.");
      return;
    }
    const detail = ensureBreakerDetail(panel, start);
    detail.poles = size;
    clearBreakerBlock(layout, start);
    targetSlots.forEach((slot, position) => {
      if (slot >= 1 && slot <= layout.length) {
        layout[slot - 1] = { start, size, position };
      }
    });
    if (Array.isArray(panel.breakers)) {
      removedSlots.forEach(slot => {
        const idx = slot - 1;
        if (idx >= 0 && idx < panel.breakers.length) {
          panel.breakers[idx] = null;
        }
      });
    }
    savePanels();
    updateOneline();
    render(panelId);
  };

  const removeBreaker = startCircuit => {
    const start = Number.parseInt(startCircuit, 10);
    if (!Number.isFinite(start) || start < 1) return;
    const count = getPanelCircuitCount(panel);
    ensurePanelBreakerLayout(panel, count);
    const block = getBreakerBlock(panel, start);
    if (!block || block.position !== 0) return;
    const loads = dataStore.getLoads();
    const blockSlots = getBlockCircuits(panel, block, count);
    const conflictLoad = loads.find(candidate => {
      if (candidate.panelId !== panelId) return false;
      const span = getLoadBreakerSpan(candidate, panel, count);
      if (!span.length) return false;
      return span.some(slot => blockSlots.includes(slot));
    });
    if (conflictLoad) {
      const label = formatLoadLabel(conflictLoad, loads.indexOf(conflictLoad));
      alert(label ? `Remove load ${label} before deleting this breaker.` : "Remove the load before deleting this breaker.");
      return;
    }
    clearBreakerBlock(panel.breakerLayout, start);
    deleteBreakerDetail(panel, start);
    if (Array.isArray(panel.breakers)) {
      blockSlots.forEach(slot => {
        const idx = slot - 1;
        if (idx >= 0 && idx < panel.breakers.length) {
          panel.breakers[idx] = null;
        }
      });
    }
    savePanels();
    updateOneline();
    render(panelId);
  };

  const normalizedSystem = getPanelSystem(panel);
  let defaultsChanged = false;
  if (panel.powerType !== normalizedSystem) {
    panel.powerType = normalizedSystem;
    defaultsChanged = true;
  }
  if (!panel.phases) {
    panel.phases = normalizedSystem === "dc" ? "2" : "3";
    defaultsChanged = true;
  }
  if (!panel.circuitCount) {
    panel.circuitCount = panel.breakers?.length || 42;
    defaultsChanged = true;
  }
  if (defaultsChanged) {
    savePanels();
    updateOneline();
  }

  if (tagInput) tagInput.value = panel.ref || panel.panel_id || panel.tag || panel.id || "";
  if (fedFromInput) fedFromInput.value = panel.fedFrom || panel.fed_from || "";
  if (voltageInput) voltageInput.value = panel.voltage || "";
  if (manufacturerInput) manufacturerInput.value = panel.manufacturer || "";
  if (modelInput) modelInput.value = panel.model || "";
  if (systemInput) systemInput.value = getPanelSystem(panel);
  if (phasesInput) phasesInput.value = panel.phases || "";
  if (mainInput) mainInput.value = panel.mainRating || "";
  if (circuitInput) circuitInput.value = panel.circuitCount || panel.breakers.length || 42;
  if (sccrInput) sccrInput.value = panel.shortCircuitRating || panel.shortCircuitCurrentRating || "";

  const handleChange = (prop, input, options = {}) => {
    panel[prop] = input.value;
    savePanels();
    updateOneline();
    if (options.render) render(panelId);
  };

  if (tagInput) {
    tagInput.addEventListener("input", () => {
      panel.ref = tagInput.value;
      if (tagInput.value) {
        panel.panel_id = tagInput.value;
        panel.tag = tagInput.value;
      } else {
        delete panel.panel_id;
        delete panel.tag;
      }
      savePanels();
      updateOneline();
    });
  }
  if (fedFromInput) {
    fedFromInput.addEventListener("input", () => {
      panel.fedFrom = fedFromInput.value;
      if (fedFromInput.value) {
        panel.fed_from = fedFromInput.value;
      } else {
        delete panel.fed_from;
      }
      savePanels();
      updateOneline();
    });
  }

  if (voltageInput) voltageInput.addEventListener("input", () => handleChange("voltage", voltageInput));
  if (manufacturerInput) manufacturerInput.addEventListener("input", () => handleChange("manufacturer", manufacturerInput));
  if (modelInput) modelInput.addEventListener("input", () => handleChange("model", modelInput));
  if (systemInput) systemInput.addEventListener("change", () => handleChange("powerType", systemInput, { render: true }));
  if (phasesInput) phasesInput.addEventListener("input", () => handleChange("phases", phasesInput, { render: true }));

  if (mainInput) {
    mainInput.addEventListener("input", () => {
      panel.mainRating = mainInput.value;
      savePanels();
      updateOneline();
    });
  }

  if (circuitInput) {
    circuitInput.addEventListener("input", () => {
      const count = parseInt(circuitInput.value, 10) || 0;
      panel.circuitCount = count;
      if (!Array.isArray(panel.breakers)) panel.breakers = [];
      const loads = dataStore.getLoads();
      if (panel.breakers.length < count) {
        for (let i = panel.breakers.length; i < count; i++) panel.breakers[i] = null;
      }
      if (panel.breakers.length > count) {
        for (let i = count; i < panel.breakers.length; i++) {
          const tag = panel.breakers[i];
          if (tag) {
            const load = loads.find(l => (l.ref || l.id || l.tag) === tag);
            if (load) {
              delete load.panelId;
              delete load.breaker;
              delete load.breakerPoles;
            }
          }
        }
        panel.breakers = panel.breakers.slice(0, count);
        dataStore.setLoads(loads);
      }
      ensurePanelBreakerLayout(panel, count);
      if (Array.isArray(panel.breakerLayout)) {
        const layout = panel.breakerLayout;
        for (let i = 0; i < layout.length; i++) {
          const entry = layout[i];
          if (!entry) continue;
          const start = Number(entry.start);
          const size = Number(entry.size);
          if (!Number.isFinite(start) || !Number.isFinite(size)) {
            layout[i] = null;
            if (Number.isFinite(start)) {
              deleteBreakerDetail(panel, start);
            }
            continue;
          }
          if (start < 1 || start > count || start + size - 1 > count) {
            clearBreakerBlock(layout, start);
            deleteBreakerDetail(panel, start);
          }
        }
        if (layout.length > count) {
          for (let i = count; i < layout.length; i++) {
            const entry = layout[i];
            if (entry && Number.isFinite(Number(entry.start))) {
              deleteBreakerDetail(panel, Number(entry.start));
            }
          }
          layout.splice(count);
        }
      }
      ensurePanelBreakerLayout(panel, count);
      savePanels();
      updateOneline();
      render(panelId);
    });
  }

  if (sccrInput) {
    sccrInput.addEventListener("input", () => {
      panel.shortCircuitRating = sccrInput.value;
      if (sccrInput.value) {
        panel.shortCircuitCurrentRating = sccrInput.value;
      } else {
        delete panel.shortCircuitCurrentRating;
      }
      savePanels();
      updateOneline();
    });
  }

  render(panelId);
  const exportBtn = document.getElementById("export-panel-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportPanelSchedule(panelId));
  }
  const addEquipmentBtn = document.getElementById("add-panel-to-equipment-btn");
  if (addEquipmentBtn) {
    addEquipmentBtn.addEventListener("click", () => {
      const equipmentId = panel.ref || panel.panel_id || panel.tag || panel.id || panelId;
      if (!equipmentId) {
        alert("Set a panelboard tag before adding it to the equipment list.");
        return;
      }
      const system = getPanelSystem(panel);
      const phaseCount = parsePositiveInt(panel.phases);
      const phaseLabel = system === "dc"
        ? "DC Panelboard"
        : phaseCount && phaseCount >= 3
          ? "3-Phase Panelboard"
          : phaseCount === 2
            ? "2-Phase Panelboard"
            : "Single-Phase Panelboard";
      const payload = {
        id: equipmentId,
        ref: equipmentId,
        description: panel.description || `${equipmentId} Panelboard`,
        voltage: panel.voltage || panel.voltage_rating || "",
        manufacturer: panel.manufacturer || "",
        model: panel.model || "",
        phases: panel.phases || (phaseCount ? String(phaseCount) : ""),
        category: "Panelboard",
        subCategory: phaseLabel
      };
      const detailSegments = [];
      const baseNote = (panel.notes || "").toString().trim();
      if (baseNote) detailSegments.push(baseNote);
      if (panel.mainRating) detailSegments.push(`Main ${panel.mainRating}A`);
      const sccr = panel.shortCircuitRating || panel.shortCircuitCurrentRating;
      if (sccr) detailSegments.push(`SCCR ${sccr}A`);
      if (panel.circuitCount) detailSegments.push(`${panel.circuitCount} Circuits`);
      const uniqueSegments = Array.from(new Set(detailSegments.filter(Boolean)));

      const equipment = dataStore.getEquipment();
      const idx = equipment.findIndex(item => item.id === equipmentId || item.ref === equipmentId);
      if (idx >= 0) {
        const existing = { ...equipment[idx] };
        Object.entries(payload).forEach(([key, value]) => {
          if (key === "id") {
            existing.id = value;
            return;
          }
          if (key === "ref") {
            existing.ref = value;
            return;
          }
          if (key === "description") {
            if (panel.description) {
              existing.description = value;
            } else if (!existing.description) {
              existing.description = value;
            }
            return;
          }
          if (value != null && value !== "") {
            existing[key] = value;
          }
        });
        if (uniqueSegments.length) {
          const existingNotes = (existing.notes || "")
            .split(/\s*•\s*/)
            .map(segment => segment.trim())
            .filter(Boolean);
          const noteSet = new Set(existingNotes);
          uniqueSegments.forEach(segment => {
            if (!noteSet.has(segment)) {
              existingNotes.push(segment);
              noteSet.add(segment);
            }
          });
          existing.notes = existingNotes.join(" • ");
        }
        equipment[idx] = existing;
        dataStore.setEquipment(equipment);
      } else {
        const cleaned = {};
        Object.entries(payload).forEach(([key, value]) => {
          if (value != null && value !== "") {
            cleaned[key] = value;
          }
        });
        cleaned.id = equipmentId;
        cleaned.ref = equipmentId;
        if (uniqueSegments.length) {
          cleaned.notes = uniqueSegments.join(" • ");
        }
        dataStore.addEquipment(cleaned);
      }
      dataStore.saveProject(projectId);
      const fn = window.opener?.updateComponent || window.updateComponent;
      if (fn) {
        const latest = dataStore.getEquipment().find(item => item.id === equipmentId || item.ref === equipmentId);
        if (latest && equipmentId) {
          fn(equipmentId, latest);
        }
      }
      const original = addEquipmentBtn.textContent;
      addEquipmentBtn.disabled = true;
      addEquipmentBtn.textContent = "Added!";
      window.setTimeout(() => {
        addEquipmentBtn.disabled = false;
        addEquipmentBtn.textContent = original;
      }, 1500);
    });
  }
  const panelContainer = document.getElementById("panel-container");

  document.addEventListener("dragstart", e => {
    const source = e.target.closest("[data-breaker-poles]");
    if (!source) return;
    const poles = Number.parseInt(source.dataset.breakerPoles, 10);
    if (!Number.isFinite(poles) || poles < 1) return;
    currentDragPoles = poles;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copy";
      try {
        e.dataTransfer.setData("application/panel-breaker", String(poles));
      } catch {}
      try {
        e.dataTransfer.setData("text/plain", String(poles));
      } catch {}
    }
  });

  document.addEventListener("dragend", () => {
    currentDragPoles = null;
    if (panelContainer) {
      panelContainer.querySelectorAll(".panel-slot--drop-hover").forEach(el => {
        el.classList.remove("panel-slot--drop-hover");
      });
    }
  });

  if (panelContainer) {
    panelContainer.addEventListener("change", e => {
      if (e.target.matches("select[data-breaker-device]")) {
        const start = Number.parseInt(e.target.dataset.breakerDevice, 10);
        if (Number.isFinite(start)) {
          const detail = ensureBreakerDetail(panel, start);
          detail.deviceType = e.target.value === "fuse" ? "fuse" : "breaker";
          savePanels();
          updateOneline();
          render(panelId);
        }
        return;
      }
      if (e.target.matches("input[data-breaker-rating]")) {
        const start = Number.parseInt(e.target.dataset.breakerRating, 10);
        if (Number.isFinite(start)) {
          const detail = ensureBreakerDetail(panel, start);
          const value = e.target.value.trim();
          if (value) {
            detail.rating = value;
          } else {
            delete detail.rating;
          }
          savePanels();
          updateOneline();
          render(panelId);
        }
        return;
      }
      if (e.target.matches("input[data-breaker-cable]")) {
        const start = Number.parseInt(e.target.dataset.breakerCable, 10);
        if (Number.isFinite(start)) {
          const detail = ensureBreakerDetail(panel, start);
          const value = e.target.value.trim();
          if (value) {
            detail.cableTag = value;
          } else {
            delete detail.cableTag;
            delete detail.cable;
            delete detail.cableId;
          }
          savePanels();
          updateOneline();
          render(panelId);
        }
        return;
      }
      if (e.target.matches("select[data-breaker]")) {
        const breaker = parseInt(e.target.dataset.breaker, 10);
        const loadIdx = e.target.value ? Number(e.target.value) : null;
        if (loadIdx !== null) {
          assignLoadToBreaker(panelId, loadIdx, breaker);
        } else {
          const loads = dataStore.getLoads();
          const panelList = dataStore.getPanels();
          const targetPanel = panelList.find(p => p.id === panelId || p.ref === panelId || p.panel_id === panelId);
          const circuitCount = targetPanel ? getPanelCircuitCount(targetPanel) : 0;
          const removed = [];
          loads.forEach(load => {
            if (load.panelId !== panelId) return;
            const span = getLoadBreakerSpan(load, targetPanel, circuitCount);
            if (!span.length) return;
            if (span.includes(breaker)) {
              removed.push({ load, span });
            }
          });
          const changed = [];
          removed.forEach(({ load }) => {
            delete load.panelId;
            delete load.breaker;
            delete load.breakerPoles;
            changed.push(load);
          });
          dataStore.setLoads(loads);
          if (targetPanel) {
            ensurePanelBreakerCapacity(targetPanel, circuitCount);
            if (removed.length) {
              removed.forEach(({ load, span }) => {
                const tag = getLoadDisplayId(load);
                if (tag) {
                  clearPanelBreakerAssignments(targetPanel, tag);
                } else if (Array.isArray(targetPanel.breakers)) {
                  span.forEach(slot => {
                    const index = slot - 1;
                    if (index >= 0 && index < targetPanel.breakers.length) {
                      targetPanel.breakers[index] = null;
                    }
                  });
                }
              });
            } else if (Array.isArray(targetPanel.breakers)) {
              targetPanel.breakers[breaker - 1] = null;
            }
            dataStore.setPanels(panelList);
          }
          dataStore.saveProject(projectId);
          const fn = window.opener?.updateComponent || window.updateComponent;
          if (fn) {
            changed.forEach(load => {
              const id = load.ref || load.id || load.tag;
              if (id) fn(id, load);
            });
          }
        }
        render(panelId);
      }
    });

    panelContainer.addEventListener("click", e => {
      const addBtn = e.target.closest("button[data-action='add-breaker']");
      if (addBtn) {
        const circuit = Number.parseInt(addBtn.dataset.circuit, 10);
        const poles = Number.parseInt(addBtn.dataset.poles, 10);
        if (Number.isFinite(circuit) && Number.isFinite(poles)) {
          configureBreaker(circuit, poles);
        }
        return;
      }
      const removeBtn = e.target.closest("button[data-action='remove-breaker']");
      if (removeBtn) {
        const circuit = Number.parseInt(removeBtn.dataset.circuit, 10);
        if (Number.isFinite(circuit)) {
          removeBreaker(circuit);
        }
      }
    });

    panelContainer.addEventListener("dragover", e => {
      if (currentDragPoles == null && !(e.dataTransfer && e.dataTransfer.types?.includes("application/panel-breaker"))) {
        return;
      }
      const slot = e.target.closest(".panel-slot");
      if (!slot || !slot.dataset.circuit) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      slot.classList.add("panel-slot--drop-hover");
    });

    panelContainer.addEventListener("dragleave", e => {
      const slot = e.target.closest(".panel-slot");
      if (!slot) return;
      if (!slot.contains(e.relatedTarget)) {
        slot.classList.remove("panel-slot--drop-hover");
      }
    });

    panelContainer.addEventListener("drop", e => {
      const slot = e.target.closest(".panel-slot");
      if (!slot || !slot.dataset.circuit) return;
      const transfer = e.dataTransfer?.getData("application/panel-breaker") || e.dataTransfer?.getData("text/plain");
      const dataPoles = Number.parseInt(transfer, 10);
      const poles = Number.isFinite(dataPoles) ? dataPoles : currentDragPoles;
      if (!Number.isFinite(poles) || poles < 1) {
        slot.classList.remove("panel-slot--drop-hover");
        return;
      }
      e.preventDefault();
      slot.classList.remove("panel-slot--drop-hover");
      let circuit = Number.parseInt(slot.dataset.circuit, 10);
      if (!Number.isFinite(circuit)) return;
      if (slot.dataset.breakerStart) {
        const startCandidate = Number.parseInt(slot.dataset.breakerStart, 10);
        if (Number.isFinite(startCandidate)) {
          circuit = startCandidate;
        }
      }
      currentDragPoles = null;
      configureBreaker(circuit, poles);
    });
  }
});

// expose for debugging
if (typeof window !== "undefined") {
  window.assignLoadToBreaker = assignLoadToBreaker;
  window.calculatePanelTotals = calculatePanelTotals;
}
