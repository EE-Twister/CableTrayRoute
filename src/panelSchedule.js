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
      voltage: "",
      mainRating: "",
      circuitCount: 42,
      powerType: "ac",
      phases: "3"
    };
    panels.push(panel);
    dataStore.setPanels(panels);
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
  const span = getLoadBreakerSpan({ ...load, breaker }, panel, circuitCount);
  if (!span.length) {
    alert("Unable to assign load: invalid breaker selection.");
    return;
  }
  if (circuitCount && span[span.length - 1] > circuitCount) {
    alert(`Breaker selection requires ${span.length} adjacent circuits but exceeds the panel's circuit count.`);
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
    if (l.panelId === panelId && l.breaker === breaker) {
      delete l.panelId;
      delete l.breaker;
      delete l.breakerPoles;
    }
  });
  load.panelId = panelId;
  load.breaker = breaker;
  if (span.length > 1) {
    load.breakerPoles = span.length;
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
  const { panel } = getOrCreatePanel(panelId);
  const container = document.getElementById("panel-container");
  if (!container) return;
  container.innerHTML = "";

  const circuitCount = getPanelCircuitCount(panel);
  ensurePanelBreakerCapacity(panel, circuitCount);
  const loads = dataStore.getLoads();
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
  const rightHeader = document.createElement("th");
  rightHeader.scope = "col";
  rightHeader.textContent = "Even Circuits";
  headRow.append(leftHeader, rightHeader);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const rows = Math.ceil(circuitCount / 2);
  for (let i = 0; i < rows; i++) {
    const row = document.createElement("tr");
    const oddCircuit = i * 2 + 1;
    row.appendChild(createCircuitCell(panel, panelId, loads, oddCircuit, circuitCount, "left"));
    const evenCircuit = oddCircuit + 1;
    row.appendChild(createCircuitCell(panel, panelId, loads, evenCircuit, circuitCount, "right"));
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.appendChild(table);
  updateTotals(panelId);
}

function createCircuitCell(panel, panelId, loads, breaker, circuitCount, position) {
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
  const system = getPanelSystem(panel);
  slot.className = `panel-slot panel-slot--${system}`;
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

  if (!assignedLoad || isStart) {
    const select = document.createElement("select");
    select.dataset.breaker = breaker;
    select.id = `panel-breaker-${breaker}`;
    select.className = "panel-slot-select";
    select.setAttribute("aria-label", `Assign load to circuit ${breaker}`);
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
  } else {
    slot.classList.add("panel-slot--locked");
    const locked = document.createElement("div");
    locked.className = "panel-slot-locked";
    const label = formatLoadLabel(assignedLoad, assignedIndex >= 0 ? assignedIndex : loads.indexOf(assignedLoad));
    const startCircuit = assignedStart || assignedSpan[0] || breaker;
    locked.textContent = label ? `Tied to Circuit ${startCircuit} — ${label}` : `Tied to Circuit ${startCircuit}`;
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
    const poleCount = assignedSpan.length || Math.max(1, getLoadPoleCount(assignedLoad, panel));
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
    if (meta.childElementCount > 0) {
      details.appendChild(meta);
    }
  } else {
    details.classList.add("panel-slot-details-empty");
    details.textContent = "Spare";
  }

  slot.appendChild(details);
  td.appendChild(slot);
  return td;
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

  const voltageInput = document.getElementById("panel-voltage");
  const manufacturerInput = document.getElementById("panel-manufacturer");
  const modelInput = document.getElementById("panel-model");
  const systemInput = document.getElementById("panel-system-type");
  const phasesInput = document.getElementById("panel-phases");
  const mainInput = document.getElementById("panel-main-rating");
  const circuitInput = document.getElementById("panel-circuit-count");

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

  if (voltageInput) voltageInput.value = panel.voltage || "";
  if (manufacturerInput) manufacturerInput.value = panel.manufacturer || "";
  if (modelInput) modelInput.value = panel.model || "";
  if (systemInput) systemInput.value = getPanelSystem(panel);
  if (phasesInput) phasesInput.value = panel.phases || "";
  if (mainInput) mainInput.value = panel.mainRating || "";
  if (circuitInput) circuitInput.value = panel.circuitCount || panel.breakers.length || 42;

  const handleChange = (prop, input, options = {}) => {
    panel[prop] = input.value;
    savePanels();
    updateOneline();
    if (options.render) render(panelId);
  };

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
      savePanels();
      updateOneline();
      render(panelId);
    });
  }

  render(panelId);
  const exportBtn = document.getElementById("export-panel-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportPanelSchedule(panelId));
  }
  const panelContainer = document.getElementById("panel-container");
  if (panelContainer) {
    panelContainer.addEventListener("change", e => {
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
  }
});

// expose for debugging
if (typeof window !== "undefined") {
  window.assignLoadToBreaker = assignLoadToBreaker;
  window.calculatePanelTotals = calculatePanelTotals;
}
