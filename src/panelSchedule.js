import "./workflowStatus.js";
import "../site.js";
import * as dataStore from "../dataStore.mjs";
import { exportPanelSchedule } from "../exportPanelSchedule.js";
import { ensureFieldAssistiveText, showAlertModal, openModal } from "./components/modal.js";
import { confirmProjectEntityDeletion } from "./components/projectDeletionReview.js";
import {
  DEFAULT_PANEL_CIRCUIT_COUNT,
  MAX_PANEL_CIRCUITS,
  duplicatePanelDefinition as duplicatePanelModel,
  findPanelByIdentifier,
  formatPanelSelectorLabel,
  generatePanelId,
  getPanelDisplayName,
  getPanelIdentifierCandidates
} from "./panel-schedule/panelModel.js";
import {
  DC_PHASE_LABELS,
  SINGLE_PHASE_LABELS,
  THREE_PHASE_LABELS,
  clampBreakerPolesForSystem,
  computeBreakerSpan,
  getAllowedBranchPoleCounts,
  getDcPolarityForCircuit,
  getMaxBranchPoleCount,
  getPanelBranchDeviceType,
  getPanelCircuitCount as resolvePanelCircuitCount,
  getPanelPhaseSequence,
  getPanelPoleLimit,
  getPanelSystem,
  parsePositiveInt,
  resolveDcSequence
} from "./panel-schedule/phaseModel.js";
import {
  applyPanelBreakerAssignments,
  clearBreakerBlock,
  clearPanelBreakerAssignments,
  deleteBreakerDetail,
  ensureBreakerDetail,
  ensureBreakerDetails,
  ensurePanelBreakerCapacity,
  ensurePanelBreakerLayout,
  formatDeviceLabel,
  getBlockCircuits,
  getBreakerBlock,
  getBreakerDetail,
  getDeviceType,
  getLoadBreakerSpan,
  getLoadPoleCount,
  initializeLayoutFromLoads,
  sanitizeDcLoadBreakerPoles,
  syncBranchDeviceType
} from "./panel-schedule/breakerLayoutModel.js";
import {
  calculatePhaseSummary,
  getCustomPhaseLoadsForSpan,
  getDetailPhaseLoad,
  getPhaseLabel,
  getPhaseLoadKey,
  getPhaseLoadsForSpan,
  getPhasePowerValue
} from "./panel-schedule/phaseLoadModel.js";

const projectId = typeof window !== "undefined" ? window.currentProjectId : undefined;

function duplicatePanelDefinition(panel, panels) {
  return duplicatePanelModel(panel, panels, getPanelCircuitCount(panel));
}

function clearLoadsForPanel(panel) {
  if (!panel) return false;
  const identifiers = new Set(
    getPanelIdentifierCandidates(panel).map(id => id.toLowerCase())
  );
  if (!identifiers.size) return false;
  const loads = dataStore.getLoads();
  let changed = false;
  loads.forEach(load => {
    if (!load || load.panelId == null) return;
    const normalized = String(load.panelId).toLowerCase();
    if (identifiers.has(normalized)) {
      delete load.panelId;
      delete load.breaker;
      delete load.breakerPoles;
      changed = true;
    }
  });
  if (changed) {
    dataStore.setLoads(loads);
  }
  return changed;
}

function getOrCreatePanel(panelId = "P1") {
  const panels = dataStore.getPanels();
  let panel = findPanelByIdentifier(panels, panelId);
  if (!panel) {
    const newId = panelId || generatePanelId(panels);
    panel = {
      id: newId,
      breakers: [],
      breakerLayout: [],
      breakerDetails: {},
      branchDeviceType: "breaker",
      voltage: "",
      mainRating: "",
      circuitCount: 42,
      powerType: "ac",
      phases: "3",
      poles: "3",
      shortCircuitRating: "",
      fedFrom: ""
    };
    panels.push(panel);
    dataStore.setPanels(panels);
  }
  let identifiersUpdated = false;
  let branchTypeUpdated = false;
  if (!Array.isArray(panel.breakers)) {
    panel.breakers = [];
  }
  if (!Array.isArray(panel.breakerLayout)) {
    panel.breakerLayout = [];
  }
  if (!panel.breakerDetails || typeof panel.breakerDetails !== "object") {
    panel.breakerDetails = {};
  }
  if (!panel.branchDeviceType) {
    const details = panel.breakerDetails;
    const hasFuse = details && typeof details === "object" && Object.values(details).some(detail => getDeviceType(detail) === "fuse");
    panel.branchDeviceType = hasFuse ? "fuse" : "breaker";
    branchTypeUpdated = true;
  } else {
    const normalizedBranch = getPanelBranchDeviceType(panel);
    if (normalizedBranch !== panel.branchDeviceType) {
      panel.branchDeviceType = normalizedBranch;
      branchTypeUpdated = true;
    }
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
  if (!panel.id) {
    const fallback = panel.ref || panel.panel_id || panel.tag;
    if (fallback) {
      panel.id = fallback;
    } else {
      panel.id = generatePanelId(panels);
    }
    identifiersUpdated = true;
  }
  if (identifiersUpdated || branchTypeUpdated) {
    dataStore.setPanels(panels);
  }
  return { panel, panels };
}

function getPanelCircuitCount(panel) {
  return resolvePanelCircuitCount(panel, DEFAULT_PANEL_CIRCUIT_COUNT, MAX_PANEL_CIRCUITS);
}

const BREAKER_RATING_VALUES = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250];

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

function normalizeCableIdentifier(id) {
  return id != null ? String(id).trim().toLowerCase() : "";
}

function findCableByIdentifier(cables, identifier) {
  const normalized = normalizeCableIdentifier(identifier);
  if (!normalized || !Array.isArray(cables)) return null;
  return cables.find(cable => normalizeCableIdentifier(getCableDisplayId(cable)) === normalized) || null;
}

function formatCableDetails(cable) {
  if (!cable || typeof cable !== "object") return "";
  const size = cable.conductor_size || cable.size || cable.conductorSize;
  const type = cable.cable_type || cable.type || cable.cableType;
  const sizeLabel = size != null ? String(size).trim() : "";
  const typeLabel = type != null ? String(type).trim() : "";
  if (sizeLabel && typeLabel) return `${sizeLabel} • ${typeLabel}`;
  return sizeLabel || typeLabel || "";
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
function createPhaseSummary(panel, panelId, loads, circuitCount) {
  const model = calculatePhaseSummary(panel, panelId, loads, circuitCount);
  if (!model) return null;

  const summary = document.createElement("div");
  summary.className = "panel-phase-summary";
  const title = document.createElement("div");
  title.className = "panel-phase-summary-title";
  title.textContent = model.title;
  summary.appendChild(title);

  const values = document.createElement("div");
  values.className = "panel-phase-summary-values";
  const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  model.phases.forEach(phase => {
    const chip = document.createElement("span");
    chip.className = "panel-phase-summary-chip";
    chip.textContent = `${phase}: ${formatter.format(model.totals[phase] || 0)} ${model.unit}`;
    const deviation = model.deviations[phase] || 0;
    if (deviation >= 0.2) {
      chip.classList.add("panel-phase-summary-chip--critical");
      chip.title = "More than 20% above other phases";
    } else if (deviation >= 0.1) {
      chip.classList.add("panel-phase-summary-chip--warning");
      chip.title = "10-20% above other phases";
    }
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
  const panel = findPanelByIdentifier(panels, panelId);
  const load = loads[loadIndex];
  const loadTag = load.ref || load.id || load.tag;
  const circuitCount = panel ? getPanelCircuitCount(panel) : 0;
  if (panel) {
    ensurePanelBreakerLayout(panel, circuitCount);
  }
  const block = panel ? getBreakerBlock(panel, breaker) : null;
  const startCircuit = block && Number.isFinite(Number(block.start)) ? Number(block.start) : breaker;
  if (!block || block.position !== 0) {
    showAlertModal('Configuration Error', 'Configure a breaker at this circuit before assigning a load.');
    return;
  }
  const blockSize = Number(block.size) && Number(block.size) > 0 ? Number(block.size) : 1;
  const { breakerPoles: _ignoredBreakerPoles, ...loadWithoutBreakerPoles } = load || {};
  const intrinsicRequiredPoles = Math.max(1, getLoadPoleCount(loadWithoutBreakerPoles, panel));
  if (blockSize < intrinsicRequiredPoles) {
    showAlertModal('Configuration Error', `Cannot assign load: selected breaker is ${blockSize}-pole but load requires ${intrinsicRequiredPoles} poles.`);
    return;
  }
  const loadWithBreaker = { ...load, breaker: startCircuit, breakerPoles: blockSize };
  const span = getLoadBreakerSpan(loadWithBreaker, panel, circuitCount);
  if (!span.length) {
    showAlertModal('Configuration Error', 'Unable to assign load: invalid breaker selection.');
    return;
  }
  const requiredPoles = Math.max(blockSize, intrinsicRequiredPoles);
  if (circuitCount && span[span.length - 1] > circuitCount) {
    showAlertModal('Configuration Error', `Breaker selection requires ${requiredPoles} spaces on the same side of the panel but exceeds the available circuits.`);
    return;
  }
  if (span.length !== requiredPoles) {
    showAlertModal('Configuration Error', `Breaker selection requires ${requiredPoles} spaces on the same side of the panel but only ${span.length} are available before the panel ends.`);
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
    showAlertModal('Configuration Error', `Cannot assign load: circuits conflict with ${formatLoadLabel(conflict, loads.indexOf(conflict))}.`);
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
  const panels = dataStore.getPanels();
  const panel = findPanelByIdentifier(panels, panelId);
  const loads = dataStore.getLoads().filter(l => l.panelId === panelId);
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

const COLUMN_HEADERS = {
  cable: "Cable Tag",
  load: "Load Served",
  poles: "Poles",
  rating: "Rating (A)"
};

const ODD_COLUMN_ORDER = ["cable", "load", "poles", "rating"];
const EVEN_COLUMN_ORDER = ["rating", "poles", "load", "cable"];

function createColumnHeaders(label, order = ODD_COLUMN_ORDER) {
  const headers = [];
  order.forEach(key => {
    const text = COLUMN_HEADERS[key] || key;
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = text.toUpperCase();
    th.className = "panel-column-subheader";
    th.dataset.columnKey = key;
    th.dataset.columnGroup = label.toLowerCase();
    headers.push(th);
  });
  return headers;
}

function render(panelId = "P1") {
  const state = getOrCreatePanel(panelId);
  const { panel, panels } = state;
  const container = document.getElementById("panel-container");
  if (!container) return state;
  const activePanelId = panel?.id || panelId;
  container.innerHTML = "";

  const breakerDetails = ensureBreakerDetails(panel);

  const cableList = document.createElement("datalist");
  cableList.id = "panel-breaker-cable-options";
  const cables = dataStore.getCables();
  const seenCableIds = new Set();
  const cableLookup = new Map();
  cables.forEach(cable => {
    const id = getCableDisplayId(cable);
    const normalized = normalizeCableIdentifier(id);
    if (!normalized || seenCableIds.has(normalized)) return;
    seenCableIds.add(normalized);
    cableLookup.set(normalized, cable);
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
  const loadLabelList = document.createElement("datalist");
  loadLabelList.id = "panel-load-label-options";
  const loadLabelSet = new Set();
  loads.forEach((load, index) => {
    const label = formatLoadLabel(load, index);
    if (!label || loadLabelSet.has(label)) return;
    loadLabelSet.add(label);
    const option = document.createElement("option");
    option.value = label;
    loadLabelList.appendChild(option);
  });
  container.appendChild(loadLabelList);
  const sanitizedLoads = sanitizeDcLoadBreakerPoles(loads, panel, panelId);
  const seeded = initializeLayoutFromLoads(panel, panelId, loads, circuitCount);
  if (layoutAdjusted || seeded) {
    dataStore.setPanels(panels);
  }
  if (sanitizedLoads) {
    dataStore.setLoads(loads);
  }
  if (layoutAdjusted || seeded || sanitizedLoads) {
    dataStore.saveProject(projectId);
  }
  const system = getPanelSystem(panel);
  const sequence = getPanelPhaseSequence(panel);
  const phaseSequence = sequence;

  const mainDeviceSummary = createMainDeviceSummary(panel, system, phaseSequence);
  if (mainDeviceSummary) {
    container.appendChild(mainDeviceSummary);
  }

  const legend = document.createElement("div");
  legend.className = "panel-bus-legend";
  if (system === "dc") {
    legend.textContent = `DC Polarity: ${sequence.join(" / ")}`;
  } else {
    const descriptor = sequence.length === 3 ? "AC • 3-Phase" : "AC • Single-Phase";
    legend.textContent = `${descriptor} Bus: ${sequence.join(" / ")}`;
  }
  container.appendChild(legend);

  const phaseSummary = createPhaseSummary(panel, activePanelId, loads, circuitCount);
  if (phaseSummary) {
    container.appendChild(phaseSummary);
  }

  const table = document.createElement("table");
  table.id = "panel-table";
  table.className = "panel-schedule-table";
  table.style.setProperty("--panel-rail-count", String(Math.max(phaseSequence.length, 1)));
  const colgroup = document.createElement("colgroup");
  [...ODD_COLUMN_ORDER, "device", ...EVEN_COLUMN_ORDER].forEach(key => {
    const col = document.createElement("col");
    col.dataset.columnKey = key;
    col.className = `panel-column-col panel-column-col--${key}`;
    colgroup.appendChild(col);
  });
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const leftHeader = document.createElement("th");
  leftHeader.scope = "colgroup";
  leftHeader.colSpan = 4;
  leftHeader.textContent = "Odd Circuits";
  const deviceHeader = document.createElement("th");
  deviceHeader.scope = "col";
  deviceHeader.rowSpan = 2;
  deviceHeader.className = "panel-device-header";
  const deviceHeaderContent = document.createElement("div");
  deviceHeaderContent.className = "panel-device-header-content";
  const deviceTitle = document.createElement("div");
  deviceTitle.className = "panel-device-title";
  deviceTitle.textContent = "Device";
  deviceHeaderContent.appendChild(deviceTitle);
  const headerRails = createBusRails(phaseSequence, { variant: "header", showLabels: true });
  deviceHeaderContent.appendChild(headerRails);
  deviceHeader.appendChild(deviceHeaderContent);
  const rightHeader = document.createElement("th");
  rightHeader.scope = "colgroup";
  rightHeader.colSpan = 4;
  rightHeader.textContent = "Even Circuits";
  headRow.append(leftHeader, deviceHeader, rightHeader);
  thead.appendChild(headRow);

  const subHeader = document.createElement("tr");
  createColumnHeaders("odd", ODD_COLUMN_ORDER).forEach(header => subHeader.appendChild(header));
  createColumnHeaders("even", EVEN_COLUMN_ORDER).forEach(header => subHeader.appendChild(header));
  table.appendChild(colgroup);
  thead.appendChild(subHeader);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const rows = Math.ceil(circuitCount / 2);
  const layout = Array.isArray(panel.breakerLayout) ? panel.breakerLayout : [];
  const tieAnchors = new Map();

  const collectDeviceCircuits = (odd, even) => {
    return [odd, even]
      .filter(circuit => Number.isFinite(circuit) && circuit <= circuitCount)
      .sort((a, b) => a - b);
  };

  const createSummaryCells = (result, order = ODD_COLUMN_ORDER) => {
    const cells = [];
    const summary = result?.summary || {};
    const columnContent = result?.columnContent || {};

    const builders = {
      cable: () => {
        const cable = document.createElement("td");
        cable.className = "panel-column panel-column--cable";
        if (columnContent.cable) {
          cable.appendChild(columnContent.cable);
        } else {
          cable.textContent = summary.cableTag || "";
        }
        return cable;
      },
      load: () => {
        const loadCell = result?.cell || document.createElement("td");
        loadCell.classList.add("panel-column", "panel-column--load");
        return loadCell;
      },
      poles: () => {
        const poleCell = document.createElement("td");
        poleCell.className = "panel-column panel-column--poles";
        if (columnContent.poles) {
          poleCell.appendChild(columnContent.poles);
        } else {
          poleCell.textContent = summary.poles || "";
        }
        return poleCell;
      },
      rating: () => {
        const ratingCell = document.createElement("td");
        ratingCell.className = "panel-column panel-column--rating";
        if (columnContent.rating) {
          ratingCell.appendChild(columnContent.rating);
        } else {
          ratingCell.textContent = summary.rating || "";
        }
        return ratingCell;
      }
    };

    order.forEach(key => {
      const builder = builders[key];
      if (builder) {
        cells.push(builder());
      }
    });

    return cells;
  };

  for (let i = 0; i < rows; i++) {
    const row = document.createElement("tr");
    const oddCircuit = i * 2 + 1;
    const evenCircuit = oddCircuit + 1;

    const oddResult = createCircuitCell(panel, activePanelId, loads, oddCircuit, circuitCount, "left", system, breakerDetails, cableLookup);
    createSummaryCells(oddResult, ODD_COLUMN_ORDER).forEach(cell => row.appendChild(cell));

    const deviceCircuits = collectDeviceCircuits(oddCircuit, evenCircuit);
    const deviceCell = createDeviceCell(
      panel,
      oddCircuit,
      evenCircuit,
      circuitCount,
      breakerDetails,
      system,
      phaseSequence,
      { circuits: deviceCircuits, baseRow: i, disableRowSpan: true, tieAnchorsMap: tieAnchors }
    );
    if (deviceCell) {
      row.appendChild(deviceCell);
    }

    const evenResult = createCircuitCell(panel, activePanelId, loads, evenCircuit, circuitCount, "right", system, breakerDetails, cableLookup);
    createSummaryCells(evenResult, EVEN_COLUMN_ORDER).forEach(cell => row.appendChild(cell));

    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.appendChild(table);
  renderTieOverlay(container, table, panel, circuitCount, tieAnchors);
  updateTotals(activePanelId);
  updatePanelStickySummary(panel, activePanelId, loads, circuitCount);
  updateAssignmentStatus(activePanelId, loads, circuitCount);
  return state;
}

function createMainDeviceSummary(panel, system, phaseSequence) {
  if (!panel) return null;
  const wrapper = document.createElement("div");
  wrapper.className = "panel-main-device";

  const panelPoleCount = getPanelPoleLimit(panel) || 1;

  const icon = createBranchDeviceIcon(
    {
      deviceType: getPanelBranchDeviceType(panel),
      rating: panel.mainRating != null ? String(panel.mainRating).trim() : ""
    },
    panelPoleCount,
    1,
    system,
    phaseSequence[0] || "",
    { labelPoles: panelPoleCount }
  );
  if (icon) {
    icon.classList.add("panel-main-device-icon");
    wrapper.appendChild(icon);
  }

  const rating = panel.mainRating != null ? String(panel.mainRating).trim() : "";
  const ratingLabel = document.createElement("div");
  ratingLabel.className = "panel-main-device-rating";
  ratingLabel.textContent = rating
    ? `Main Device Rating: ${rating} A`
    : "Main Device Rating: —";
  wrapper.appendChild(ratingLabel);

  return wrapper;
}

function createCircuitCell(panel, panelId, loads, breaker, circuitCount, position, system, breakerDetails, cableLookup) {
  const td = document.createElement("td");
  td.className = "panel-cell";
  if (position) td.classList.add(`panel-cell--${position}`);
  const summary = { cableTag: "", loadServed: "", poles: "", rating: "" };
  const columnContent = { cable: null, poles: null, rating: null };

  if (breaker > circuitCount) {
    const slot = document.createElement("div");
    slot.className = "panel-slot panel-slot--inactive";
    const empty = document.createElement("div");
    empty.className = "panel-slot-empty";
    empty.textContent = "—";
    slot.appendChild(empty);
    td.appendChild(slot);
    return { cell: td, summary, columnContent };
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
  const ratingValue = breakerDetail && breakerDetail.rating != null ? String(breakerDetail.rating) : "";
  const cableValue = breakerDetail?.cableTag || breakerDetail?.cable || breakerDetail?.cableId || "";
  const customLoadLabel = typeof breakerDetail?.customLoad === "string" ? breakerDetail.customLoad.trim() : "";
  const cableTag = cableValue;
  const deviceType = getPanelBranchDeviceType(panel);
  const phaseLabel = getPhaseLabel(panel, breaker);
  const phaseKey = getPhaseLoadKey(phaseLabel, block);
  const loadPerPhaseValue = getDetailPhaseLoad(breakerDetail, phaseKey);
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
  slot.dataset.deviceType = deviceType;
  if (breakerDetail) {
    if (breakerDetail.rating != null && breakerDetail.rating !== "") {
      slot.dataset.deviceRating = String(breakerDetail.rating);
    } else {
      delete slot.dataset.deviceRating;
    }
  }
  if (phaseLabel) slot.dataset.phase = phaseLabel;

  const header = document.createElement("div");
  header.className = "panel-slot-header";
  const circuitEl = document.createElement("span");
  circuitEl.className = "panel-slot-circuit";
  circuitEl.textContent = breaker;
  const phaseEl = document.createElement("span");
  phaseEl.className = "panel-slot-phase";
  phaseEl.textContent = phaseLabel;
  if (system === "dc" && phaseLabel) {
    const polarity = phaseLabel === "+" ? "positive" : "negative";
    slot.classList.add(`panel-slot--dc-${polarity}`);
    phaseEl.classList.add(`panel-slot-phase--${polarity}`);
    slot.dataset.polarity = polarity;
  }
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
  if (cableValue) summary.cableTag = cableValue;
  if (ratingValue) summary.rating = ratingValue;
  const poleCount = blockPoleCount || assignedSpan.length || (assignedLoad ? Math.max(1, getLoadPoleCount(assignedLoad, panel)) : null);
  if (poleCount) summary.poles = String(poleCount);
  if (customLoadLabel && !summary.loadServed) {
    summary.loadServed = customLoadLabel;
  }

  const createRatingField = () => {
    if (!primaryStart) return null;
    const ratingLabel = document.createElement("label");
    ratingLabel.className = "panel-column-field";
    ratingLabel.textContent = "";
    ratingLabel.setAttribute("aria-label", "Rating (A)");
    const ratingSelect = document.createElement("select");
    ratingSelect.className = "panel-slot-input";
    ratingSelect.setAttribute("aria-label", "Rating (A)");
    ratingSelect.dataset.breakerRating = String(primaryStart);
    ratingSelect.setAttribute("aria-label", `Breaker starting at circuit ${primaryStart} rating`);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select rating";
    ratingSelect.appendChild(placeholder);
    const renderRatingOption = value => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      ratingSelect.appendChild(option);
    };
    BREAKER_RATING_VALUES.forEach(renderRatingOption);
    const normalizedRating = ratingValue != null && ratingValue !== "" ? String(ratingValue) : "";
    if (normalizedRating) {
      if (!Array.from(ratingSelect.options).some(opt => opt.value === normalizedRating)) {
        const customOption = document.createElement("option");
        customOption.value = normalizedRating;
        customOption.textContent = normalizedRating;
        ratingSelect.appendChild(customOption);
      }
      ratingSelect.value = normalizedRating;
    }
    ratingLabel.appendChild(ratingSelect);
    const ratingWrapper = document.createElement("div");
    ratingWrapper.className = "panel-column-content";
    ratingWrapper.appendChild(ratingLabel);
    return ratingWrapper;
  };

  const createCableField = () => {
    if (!primaryStart) return null;
    const cableLabel = document.createElement("label");
    cableLabel.className = "panel-column-field";
    cableLabel.textContent = "";
    const cableInput = document.createElement("input");
    cableInput.type = "text";
    cableInput.className = "panel-slot-input";
    cableInput.placeholder = "Cable Tag";
    cableInput.dataset.breakerCable = String(primaryStart);
    cableInput.setAttribute("list", "panel-breaker-cable-options");
    cableInput.setAttribute("aria-label", "Cable Tag");
    cableInput.value = cableValue;
    cableLabel.appendChild(cableInput);
    const cableWrapper = document.createElement("div");
    cableWrapper.className = "panel-column-content";
    cableWrapper.appendChild(cableLabel);
    const cableMeta = document.createElement("div");
    cableMeta.className = "panel-cable-meta";
    const renderCableMeta = value => {
      const normalized = normalizeCableIdentifier(value);
      const match = cableLookup ? cableLookup.get(normalized) : null;
      const details = formatCableDetails(match);
      if (details) {
        cableMeta.textContent = details;
        cableMeta.hidden = false;
        return;
      }
      if (value) {
        cableMeta.textContent = "New cable will be added to the schedule";
        cableMeta.hidden = false;
        return;
      }
      cableMeta.textContent = "";
      cableMeta.hidden = true;
    };
    renderCableMeta(cableValue);
    cableWrapper.appendChild(cableMeta);
    return cableWrapper;
  };

  if (!block) {
    slot.classList.add("panel-slot--blank");
    const quickAdd = document.createElement("div");
    quickAdd.className = "panel-slot-quick-add";
    const poleLimit = getPanelPoleLimit(panel);
    const allowedPoles = getAllowedBranchPoleCounts(system, poleLimit);
    const poleOptions = [1, 2, 3].filter(count => allowedPoles.includes(count));
    const optionsToRender = (poleOptions.length ? poleOptions : allowedPoles).slice();
    if (!optionsToRender.length) {
      optionsToRender.push(1);
    }
    const poleLabel = document.createElement("label");
    poleLabel.className = "panel-slot-field";
    poleLabel.textContent = "";
    poleLabel.setAttribute("aria-label", "Poles");
    const poleSelect = document.createElement("select");
    poleSelect.className = "panel-slot-input panel-slot-pole-select";
    poleSelect.setAttribute("aria-label", "Select poles");
    optionsToRender.forEach(poles => {
      const option = document.createElement("option");
      option.value = String(poles);
      option.textContent = String(poles);
      poleSelect.appendChild(option);
    });
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "panel-slot-add-btn";
    addButton.dataset.action = "add-breaker";
    addButton.dataset.circuit = String(breaker);
    addButton.dataset.poles = poleSelect.value || "1";
    addButton.textContent = "Add";
    poleSelect.addEventListener("change", () => {
      addButton.dataset.poles = poleSelect.value || "1";
    });
    poleLabel.appendChild(poleSelect);
    quickAdd.append(poleLabel, addButton);
    const poleWrapper = document.createElement("div");
    poleWrapper.className = "panel-column-content";
    poleWrapper.appendChild(quickAdd);
    columnContent.poles = poleWrapper;
    control.classList.add("panel-slot-control--blank");
  } else if (isBlockStart) {
    const customLoad = document.createElement("label");
    customLoad.className = "panel-column-field";
    customLoad.textContent = "";
    const customLoadInput = document.createElement("input");
    customLoadInput.type = "text";
    customLoadInput.className = "panel-slot-input";
    customLoadInput.placeholder = "Describe load";
    customLoadInput.dataset.breakerCustomLoad = String(primaryStart);
    customLoadInput.setAttribute("list", "panel-load-label-options");
    customLoadInput.setAttribute("aria-label", "Load served");
    customLoadInput.value = customLoadLabel;
    customLoad.appendChild(customLoadInput);
    const customLoadWrapper = document.createElement("div");
    customLoadWrapper.className = "panel-column-content";
    customLoadWrapper.appendChild(customLoad);

    const loadPerPhase = document.createElement("label");
    loadPerPhase.className = "panel-column-field";
    loadPerPhase.textContent = "";
    const loadPerPhaseInput = document.createElement("input");
    loadPerPhaseInput.type = "number";
    loadPerPhaseInput.className = "panel-slot-input";
    loadPerPhaseInput.placeholder = "Load (VA) per Phase";
    loadPerPhaseInput.inputMode = "numeric";
    loadPerPhaseInput.step = "any";
    loadPerPhaseInput.min = "0";
    loadPerPhaseInput.dataset.breakerPhaseLoad = String(primaryStart);
    if (phaseKey) loadPerPhaseInput.dataset.phase = phaseKey;
    if (loadPerPhaseValue != null) {
      loadPerPhaseInput.value = String(loadPerPhaseValue);
    }
    loadPerPhase.appendChild(loadPerPhaseInput);
    customLoadWrapper.appendChild(loadPerPhase);
    control.appendChild(customLoadWrapper);

    columnContent.rating = createRatingField();
    columnContent.cable = createCableField();

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "panel-slot-remove";
    removeBtn.dataset.action = "remove-breaker";
    removeBtn.dataset.circuit = String(primaryStart);
    const removeLabel = deviceType === "fuse" ? "Fuse" : "Breaker";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Remove ${removeLabel}`);
    if (assignedLoad) {
      removeBtn.disabled = true;
      removeBtn.title = `Remove the load before deleting this ${removeLabel.toLowerCase()}.`;
    } else {
      removeBtn.title = `Remove ${removeLabel.toLowerCase()}`;
    }
    slot.appendChild(removeBtn);
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

    const loadPerPhase = document.createElement("label");
    loadPerPhase.className = "panel-column-field";
    loadPerPhase.textContent = "";
    const loadPerPhaseInput = document.createElement("input");
    loadPerPhaseInput.type = "number";
    loadPerPhaseInput.className = "panel-slot-input";
    loadPerPhaseInput.placeholder = "Load (VA) per Phase";
    loadPerPhaseInput.inputMode = "numeric";
    loadPerPhaseInput.step = "any";
    loadPerPhaseInput.min = "0";
    loadPerPhaseInput.dataset.breakerPhaseLoad = String(primaryStart);
    if (phaseKey) loadPerPhaseInput.dataset.phase = phaseKey;
    if (loadPerPhaseValue != null) {
      loadPerPhaseInput.value = String(loadPerPhaseValue);
    }
    loadPerPhase.appendChild(loadPerPhaseInput);
    const phaseWrapper = document.createElement("div");
    phaseWrapper.className = "panel-column-content";
    phaseWrapper.appendChild(loadPerPhase);
    control.appendChild(phaseWrapper);
  }
  if (control.childElementCount) {
    slot.appendChild(control);
  }

  if (block && !columnContent.rating) {
    const ratingField = createRatingField();
    if (ratingField) {
      columnContent.rating = ratingField;
    }
  }

  if (block && isBlockStart && !columnContent.cable) {
    const cableField = createCableField();
    if (cableField) {
      columnContent.cable = cableField;
    }
  }

  const details = document.createElement("div");
  details.className = "panel-slot-details";
  if (assignedLoad) {
    const descriptor = document.createElement("div");
    descriptor.className = "panel-slot-desc";
    const parts = [];
    const tag = assignedLoad.tag || assignedLoad.ref || assignedLoad.id;
    if (tag) parts.push(tag);
    if (assignedLoad.description) parts.push(assignedLoad.description);
    const descriptorText = parts.join(" — ") || "Assigned Load";
    descriptor.textContent = descriptorText;
    summary.loadServed = descriptorText;
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
    const loadPerPhase = parseFloat(loadPerPhaseValue);
    if (Number.isFinite(loadPerPhase)) {
      const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
      meta.appendChild(createMetaChip(`${formatter.format(loadPerPhase)} VA/phase`));
    }
    if (meta.childElementCount > 0) {
      details.appendChild(meta);
    }

    const spanCircuits = assignedSpan.length ? assignedSpan : (blockCircuits.length ? blockCircuits : [breaker]);
    const totalPower = getPhasePowerValue(assignedLoad, system);
    const phaseLoads = getPhaseLoadsForSpan(panel, breakerDetail, spanCircuits, totalPower);
    if (phaseLoads.size) {
      const contribution = document.createElement("div");
      contribution.className = "panel-slot-phase-load";
      const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
      const unit = system === "dc" ? "W" : "VA";
      phaseLoads.forEach((amount, phase) => {
        const chip = document.createElement("span");
        chip.className = "panel-slot-phase-chip";
        chip.textContent = `${phase}: ${formatter.format(amount)} ${unit}`;
        contribution.appendChild(chip);
      });
      details.appendChild(contribution);
    }
  } else if (block) {
    details.classList.add("panel-slot-details-empty");
    if (!summary.loadServed && blockLabel) {
      summary.loadServed = blockLabel;
    }
  } else {
    details.classList.add("panel-slot-details-empty");
    details.textContent = "Space";
  }

  if (!summary.loadServed && blockLabel) {
    summary.loadServed = blockLabel;
  }
  if (details.childElementCount || details.textContent.trim()) {
    slot.appendChild(details);
  }
  td.appendChild(slot);
  return { cell: td, summary, columnContent };
}

function createBusRails(phases, options = {}) {
  const rails = document.createElement("div");
  rails.className = "panel-device-rails";
  if (options.variant) {
    rails.classList.add(`panel-device-rails--${options.variant}`);
  }
  const sequence = Array.isArray(phases) && phases.length ? phases : [];
  rails.style.setProperty("--panel-rail-count", String(Math.max(sequence.length, 1)));
  sequence.forEach(phase => {
    const line = document.createElement("div");
    line.className = "panel-device-rail-line";
    line.dataset.phase = phase;
    if (options.showLabels) {
      const label = document.createElement("span");
      label.className = "panel-device-rail-label";
      label.textContent = phase;
      line.appendChild(label);
    }
    rails.appendChild(line);
  });
  return rails;
}

function createDeviceCell(panel, oddCircuit, evenCircuit, circuitCount, breakerDetails, system, phaseSequence, options = {}) {
  const td = document.createElement("td");
  td.className = "panel-device-cell";
  const sequence = phaseSequence || getPanelPhaseSequence(panel) || [];
  const railCount = Math.max(sequence.length, 1);
  const railSpan = railCount * 1.15;
  td.style.setProperty("--panel-rail-count", String(railCount));
  td.style.setProperty("--panel-bus-span", `${railSpan}rem`);
  const spanRows = Number.isFinite(options.rowSpan) && options.rowSpan > 1 ? Number(options.rowSpan) : 1;
  const baseRowIndex = Number.isFinite(options.baseRow) && options.baseRow >= 0 ? Number(options.baseRow) : 0;
  const disableRowSpan = options.disableRowSpan === true;
  const spanCircuits = Array.isArray(options.circuits) && options.circuits.length
    ? options.circuits
    : [oddCircuit, evenCircuit].filter(value => Number.isFinite(value));

  const coveredRowIndexes = spanCircuits
    .map(circuit => Number.isFinite(circuit) ? Math.floor((circuit - 1) / 2) : null)
    .filter(index => index != null && Number.isFinite(index));
  const maxCoveredRow = coveredRowIndexes.length ? Math.max(...coveredRowIndexes) : baseRowIndex;
  const derivedRowCount = Math.max(1, maxCoveredRow - baseRowIndex + 1);
  const calculatedRowCount = Math.max(derivedRowCount, spanRows);
  const rowCount = calculatedRowCount;
  if (!disableRowSpan && rowCount > 1) {
    td.rowSpan = rowCount;
    td.style.setProperty("--panel-device-row-span", String(rowCount));
  }

  const rails = createBusRails(sequence, { variant: "body" });
  rails.classList.add("panel-device-rails--inline");
  rails.style.setProperty("--panel-bus-span", `${railSpan}rem`);

  const wrapper = document.createElement("div");
  wrapper.className = "panel-device-wrapper";
  wrapper.style.setProperty("--panel-device-row-count", String(rowCount));
  wrapper.style.setProperty("--panel-bus-span", `${railSpan}rem`);
  const slots = new Map();
  const rowMarkers = new Map();
  const tieAnchorsMap = options.tieAnchorsMap instanceof Map ? options.tieAnchorsMap : null;
  const applyRailOffset = (slot, phase) => {
    if (!slot || !sequence.length || !phase) return;
    const index = sequence.indexOf(phase);
    if (index >= 0) {
      const center = (sequence.length - 1) / 2;
      const offset = index - center;
      slot.style.setProperty("--panel-rail-offset", `${offset}`);
      return;
    }
    slot.style.removeProperty("--panel-rail-offset");
  };

  const getRowMarker = (relativeRow, phase) => {
    let markerEntry = rowMarkers.get(relativeRow);
    if (!markerEntry) {
      const marker = document.createElement("div");
      marker.className = "panel-device-slot-marker";
      marker.style.gridRow = String(relativeRow);
      markerEntry = { marker, phases: new Set() };
      rowMarkers.set(relativeRow, markerEntry);
      wrapper.appendChild(marker);
    }
    if (phase) {
      markerEntry.phases.add(phase);
    }
    const [primaryPhase] = markerEntry.phases;
    if (markerEntry.phases.size === 1 && primaryPhase) {
      markerEntry.marker.dataset.phase = primaryPhase;
      applyRailOffset(markerEntry.marker, primaryPhase);
    } else if (markerEntry.phases.size > 1) {
      markerEntry.marker.removeAttribute("data-phase");
      markerEntry.marker.style.removeProperty("--panel-rail-offset");
    }
    return markerEntry.marker;
  };

  const createSlot = circuit => {
    if (!Number.isFinite(circuit) || circuit < 1 || circuit > circuitCount) return null;
    const slot = document.createElement("div");
    const isEven = circuit % 2 === 0;
    slot.className = `panel-device-slot panel-device-slot--${isEven ? "even" : "odd"}`;
    const phase = getPhaseLabel(panel, circuit);
    if (phase) slot.dataset.phase = phase;
    const relativeRow = Math.max(1, Math.floor((circuit - 1) / 2) - baseRowIndex + 1);
    slot.style.gridRow = String(relativeRow);
    slot.dataset.circuit = String(circuit);
    applyRailOffset(slot, phase);
    getRowMarker(relativeRow, phase);
    const tieAnchor = document.createElement("div");
    tieAnchor.className = "panel-device-tie-anchor";
    slot.appendChild(tieAnchor);
    if (tieAnchorsMap) {
      const key = String(circuit);
      const anchors = tieAnchorsMap.get(key) || [];
      anchors.push(tieAnchor);
      tieAnchorsMap.set(key, anchors);
    }
    slots.set(circuit, slot);
    return slot;
  };

  if (spanCircuits.length) {
    spanCircuits.forEach(circuit => {
      const slot = createSlot(circuit);
      if (slot) wrapper.appendChild(slot);
    });
  } else {
    const oddSlot = createSlot(oddCircuit);
    const evenSlot = createSlot(evenCircuit);
    if (oddSlot) wrapper.appendChild(oddSlot);
    if (evenSlot) wrapper.appendChild(evenSlot);
  }

  wrapper.appendChild(rails);
  td.appendChild(wrapper);

  const layout = Array.isArray(panel.breakerLayout) ? panel.breakerLayout : [];
  if (!system) {
    system = getPanelSystem(panel);
  }

  const getBlockInfo = circuit => {
    if (!Number.isFinite(circuit) || circuit < 1 || circuit > circuitCount) return null;
    const block = layout[circuit - 1] || null;
    const start = block && Number.isFinite(Number(block.start)) ? Number(block.start) : null;
    if (!start) return null;
    const span = getBlockCircuits(panel, block, circuitCount);
    if (!span.includes(circuit)) return null;
    const size = Number.isFinite(Number(block.size)) && Number(block.size) > 0 ? Number(block.size) : span.length || 1;
    const detail = breakerDetails ? breakerDetails[String(start)] || getBreakerDetail(panel, start) : getBreakerDetail(panel, start);
    const phase = getPhaseLabel(panel, circuit);
    return {
      block,
      start,
      size,
      span,
      detail,
      phase,
      isStart: block?.position === 0
    };
  };

  const blockSlots = new Map();
  slots.forEach((_, circuit) => {
    const info = getBlockInfo(circuit);
    if (!info) return;
    const entry = blockSlots.get(info.start) || { info, circuits: [] };
    entry.circuits.push(circuit);
    blockSlots.set(info.start, entry);
  });

  const connectorObservers = new WeakMap();
  const connectorFallbacks = new WeakMap();

  function applyConnectorLength(icon, slot) {
    if (!icon || !slot) return;
    if (!icon.dataset.connectorRole) return;
    const graphic = icon.querySelector(".panel-device-graphic");
    if (!graphic) return;
    const connectorIndex = Number.parseInt(icon.dataset.connectorIndex, 10);
    const connectorCount = Number.parseInt(icon.dataset.connectorCount, 10);
    const hasConnectorIndex = Number.isFinite(connectorIndex) && Number.isFinite(connectorCount) && connectorCount > 0;
    const wrapper = slot.closest(".panel-device-wrapper") || slot.parentElement || slot;
    const extendTop = hasConnectorIndex ? connectorIndex > 0 : icon.dataset.connectorRole === "continue";
    const extendBottom = hasConnectorIndex ? connectorIndex < connectorCount - 1 : icon.dataset.connectorRole === "start";
    const measure = () => {
      const slotRect = slot.getBoundingClientRect();
      const wrapperRect = wrapper?.getBoundingClientRect?.() || slotRect;
      const graphicRect = graphic.getBoundingClientRect();
      const toBottom = extendBottom ? Math.max(0, wrapperRect.bottom - graphicRect.bottom) : 0;
      const toTop = extendTop ? Math.max(0, graphicRect.top - wrapperRect.top) : 0;
      graphic.style.setProperty("--panel-connector-bottom", `${toBottom}px`);
      graphic.style.setProperty("--panel-connector-top", `${toTop}px`);
    };
    const scheduleMeasure = () => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(measure));
      } else {
        measure();
      }
    };
    scheduleMeasure();
    if (typeof ResizeObserver === "function") {
      const existingObserver = connectorObservers.get(slot);
      if (existingObserver) {
        existingObserver.observe(graphic);
        if (wrapper && wrapper !== slot) existingObserver.observe(wrapper);
      } else {
        const observer = new ResizeObserver(scheduleMeasure);
        observer.observe(slot);
        observer.observe(graphic);
        if (wrapper && wrapper !== slot) observer.observe(wrapper);
        connectorObservers.set(slot, observer);
      }
    } else if (typeof window !== "undefined" && !connectorFallbacks.has(slot)) {
      const handler = () => scheduleMeasure();
      window.addEventListener("resize", handler, { passive: true });
      connectorFallbacks.set(slot, handler);
    }
  }
  const ensureIconForCircuit = (info, circuit, connectorRole = null, connectorIndex = null, connectorCount = null) => {
    const slot = slots.get(circuit);
    if (!slot) return;
    const phase = getPhaseLabel(panel, circuit);
    const icon = createBranchDeviceIcon(
      info?.detail,
      1,
      info?.start ?? circuit,
      system,
      phase,
      {
        placement: circuit % 2 === 0 ? "even" : "odd",
        labelPoles: info?.size,
        connectorRole: connectorRole && info?.size > 1 ? connectorRole : null,
        connectorIndex: connectorIndex,
        connectorCount: connectorCount
      }
    );
    if (icon) {
      slot.appendChild(icon);
      applyConnectorLength(icon, slot);
    }
  };

  if (blockSlots.size === 0) {
    const oddInfo = getBlockInfo(oddCircuit);
    if (oddInfo?.isStart || !evenCircuit) {
      ensureIconForCircuit(oddInfo, oddCircuit);
    }
    const evenInfo = getBlockInfo(evenCircuit);
    if (evenInfo?.isStart) {
      ensureIconForCircuit(evenInfo, evenCircuit);
    }
  } else {
    blockSlots.forEach(entry => {
      const { info, circuits: circuitList } = entry;
      const orderedCircuits = [...circuitList].sort((a, b) => a - b);
      orderedCircuits.forEach((circuit, index) => {
        const connectorRole = info.size > 1 ? (index === 0 ? "start" : "continue") : null;
        ensureIconForCircuit(info, circuit, connectorRole, index, orderedCircuits.length);
      });
    });
  }

  rowMarkers.forEach(entry => {
    if (entry?.marker?.parentElement === wrapper) {
      wrapper.appendChild(entry.marker);
    }
  });
  return td;
}

function renderTieOverlay(panelContainer, table, panel, circuitCount, tieAnchors) {
  if (!panelContainer || !table || !(tieAnchors instanceof Map)) return;
  let overlay = panelContainer.querySelector(".panel-tie-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "panel-tie-overlay";
    panelContainer.appendChild(overlay);
  }

  if (overlay._resizeHandler) {
    window.removeEventListener("resize", overlay._resizeHandler);
  }

  const drawTies = () => {
    overlay.innerHTML = "";
    const containerRect = panelContainer.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    overlay.style.left = `${tableRect.left - containerRect.left}px`;
    overlay.style.top = `${tableRect.top - containerRect.top}px`;
    overlay.style.width = `${tableRect.width}px`;
    overlay.style.height = `${tableRect.height}px`;
    const overlayRect = overlay.getBoundingClientRect();
    const layout = Array.isArray(panel?.breakerLayout) ? panel.breakerLayout : [];

    layout.forEach(block => {
      if (!block || block.position !== 0) return;
      const span = getBlockCircuits(panel, block, circuitCount);
      if (!span.length || span.length <= 1) return;
      const points = span.flatMap(circuit => {
        const anchors = tieAnchors.get(String(circuit)) || [];
        return anchors.map(anchor => {
          const rect = anchor.getBoundingClientRect();
          const graphicRect = anchor.closest(".panel-device-slot")
            ?.querySelector(".panel-device-symbol-graphic.panel-device-symbol--breaker")
            ?.getBoundingClientRect();
          return {
            x: graphicRect
              ? graphicRect.left + graphicRect.width / 2 - overlayRect.left
              : rect.left + rect.width / 2 - overlayRect.left,
            y: rect.top + rect.height / 2 - overlayRect.top
          };
        });
      }).filter(Boolean);

      if (points.length <= 1) return;
      points.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const minY = points[0].y;
      const maxY = points[points.length - 1].y;
      const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const connector = document.createElement("div");
      connector.className = "panel-tie-overlay-bar";
      connector.style.left = `${centerX}px`;
      connector.style.top = `${minY}px`;
      connector.style.height = `${Math.max(8, maxY - minY)}px`;
      overlay.appendChild(connector);
    });
  };

  const scheduleDraw = () => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(drawTies));
    } else {
      drawTies();
    }
  };

  overlay._resizeHandler = () => scheduleDraw();
  window.addEventListener("resize", overlay._resizeHandler);
  scheduleDraw();
}

function createBranchDeviceIcon(detail, poleCount, startCircuit, system, phaseLabel, options = {}) {
  const type = getDeviceType(detail);
  const poles = Number.isFinite(poleCount) && poleCount > 0 ? poleCount : 1;
  const labelPoles = Number.isFinite(options.labelPoles) && options.labelPoles > 0 ? options.labelPoles : poles;
  const icon = document.createElement("div");
  icon.className = `panel-device panel-device--${type}`;
  icon.setAttribute("role", "img");
  icon.dataset.breaker = String(startCircuit);
  icon.dataset.poles = String(poles);
  icon.dataset.deviceType = type;
  if (phaseLabel) {
    icon.dataset.phase = phaseLabel;
  }

  if (system === "dc" && phaseLabel) {
    const polarity = phaseLabel === "+" ? "positive" : "negative";
    icon.classList.add("panel-device--dc");
    icon.classList.add(`panel-device--dc-${polarity}`);
    icon.dataset.polarity = polarity;
  }

  const graphic = document.createElement("div");
  graphic.className = "panel-device-graphic";
  const symbol = document.createElement("div");
  symbol.className = "panel-device-symbol";
  symbol.dataset.poles = String(poles);
  if (options.placement) {
    symbol.dataset.placement = options.placement;
  }
  if (options.connectorRole) {
    icon.dataset.connectorRole = options.connectorRole;
  }
  if (Number.isFinite(options.connectorIndex)) {
    icon.dataset.connectorIndex = String(options.connectorIndex);
  }
  if (Number.isFinite(options.connectorCount)) {
    icon.dataset.connectorCount = String(options.connectorCount);
  }
  symbol.style.setProperty("--panel-device-pole-count", String(poles));
  const createBreakerSymbol = () => {
    const svgNS = "http://www.w3.org/2000/svg";
    const poleSpan = 14;
    const poleGap = 18;
    const baseY = 11;
    const rise = 8;
    const width = (poles - 1) * poleGap + poleSpan;
    const height = baseY + 3;
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "panel-device-symbol-graphic panel-device-symbol--breaker");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.dataset.poles = String(poles);
    svg.style.setProperty("--panel-device-pole-count", String(poles));

    const archGroup = document.createElementNS(svgNS, "g");
    archGroup.setAttribute("class", "panel-device-breaker-arches");
    const tieGroup = document.createElementNS(svgNS, "g");
    tieGroup.setAttribute("class", "panel-device-breaker-ties");

    for (let i = 0; i < poles; i++) {
      const cx = (poleSpan / 2) + i * poleGap;
      const leftX = cx - poleSpan / 2;
      const rightX = cx + poleSpan / 2;
      const arch = document.createElementNS(svgNS, "path");
      arch.setAttribute("class", "panel-device-breaker-arch");
      arch.setAttribute("d", `M ${leftX} ${baseY} Q ${cx} ${baseY - rise} ${rightX} ${baseY}`);
      archGroup.appendChild(arch);

      const nextCx = (poleSpan / 2) + (i + 1) * poleGap;
      if (i < poles - 1) {
        const tie = document.createElementNS(svgNS, "line");
        const tieOffset = 4;
        tie.setAttribute("class", "panel-device-tie");
        tie.setAttribute("x1", cx + poleSpan / 2 - 1);
        tie.setAttribute("x2", nextCx - poleSpan / 2 + 1);
        tie.setAttribute("y1", baseY + tieOffset);
        tie.setAttribute("y2", baseY + tieOffset);
        tieGroup.appendChild(tie);
      }
    }

    svg.appendChild(archGroup);
    svg.appendChild(tieGroup);
    return svg;
  };

  const createFuseSymbol = fusePoles => {
    const svgNS = "http://www.w3.org/2000/svg";
    const poleSpan = 24;
    const poleGap = 30;
    const width = (fusePoles - 1) * poleGap + poleSpan;
    const height = 30;
    const midY = height / 2;
    const bodyWidth = Math.min(width - 6, Math.max(20, width * 0.78));
    const bodyHeight = Math.max(12, height * 0.5);
    const bodyX = (width - bodyWidth) / 2;
    const bodyY = midY - bodyHeight / 2;
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "panel-device-symbol-graphic panel-device-symbol--fuse");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.dataset.poles = String(fusePoles);
    svg.style.setProperty("--panel-device-pole-count", String(fusePoles));

    const leftLead = document.createElementNS(svgNS, "line");
    leftLead.setAttribute("class", "panel-device-fuse-line");
    leftLead.setAttribute("x1", "0");
    leftLead.setAttribute("y1", String(midY));
    leftLead.setAttribute("x2", String(bodyX));
    leftLead.setAttribute("y2", String(midY));

    const rightLead = document.createElementNS(svgNS, "line");
    rightLead.setAttribute("class", "panel-device-fuse-line");
    rightLead.setAttribute("x1", String(bodyX + bodyWidth));
    rightLead.setAttribute("y1", String(midY));
    rightLead.setAttribute("x2", String(width));
    rightLead.setAttribute("y2", String(midY));

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("class", "panel-device-fuse-body");
    rect.setAttribute("x", String(bodyX));
    rect.setAttribute("y", String(bodyY));
    rect.setAttribute("width", String(bodyWidth));
    rect.setAttribute("height", String(bodyHeight));
    rect.setAttribute("rx", "2");
    rect.setAttribute("ry", "2");
    rect.setAttribute("transform", `rotate(-14 ${width / 2} ${midY})`);

    svg.appendChild(leftLead);
    svg.appendChild(rect);
    svg.appendChild(rightLead);
    return svg;
  };

  if (type === "breaker") {
    symbol.replaceChildren(createBreakerSymbol());
  } else {
    symbol.replaceChildren(createFuseSymbol(poles));
  }
  graphic.appendChild(symbol);
  icon.appendChild(graphic);

  const ratingValue = detail && detail.rating != null && detail.rating !== "" ? String(detail.rating) : "";
  const labelText = ratingValue ? `${ratingValue}A` : formatDeviceLabel(detail, labelPoles);
  if (labelText && ratingValue) {
    icon.dataset.rating = ratingValue;
  }

  const cableTag = detail?.cableTag || detail?.cable || detail?.cableId;
  if (cableTag) {
    icon.dataset.cable = cableTag;
  }

  const tooltipParts = [];
  tooltipParts.push(formatDeviceLabel(detail, labelPoles));
  if (ratingValue) tooltipParts.push(`${ratingValue}A`);
  if (cableTag) tooltipParts.push(`Cable ${cableTag}`);
  const tooltip = tooltipParts.filter(Boolean).join(" • ");
  if (tooltip) {
    icon.title = tooltip;
    icon.setAttribute("aria-label", tooltip);
  } else {
    const fallback = formatDeviceLabel(detail, poles) || (getDeviceType(detail) === "fuse" ? "Fuse" : "Device");
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

function updatePanelStickySummary(panel, panelId, loads, circuitCount) {
  const summary = document.getElementById("panel-sticky-summary");
  if (!summary) return;
  const displayName = getPanelDisplayName(panel);
  const assignedCount = Array.isArray(loads)
    ? loads.filter(load => load?.panelId === panelId).length
    : 0;
  const totals = calculatePanelTotals(panelId);
  const items = [
    { value: displayName, label: 'Panelboard' },
    { value: circuitCount, label: 'Circuits' },
    { value: assignedCount, label: 'Assigned Loads' },
    { value: totals.connectedKva.toFixed(2), label: 'kVA Connected' }
  ];
  summary.replaceChildren(...items.map(item => {
    const container = document.createElement('span');
    container.className = 'panel-summary-item';
    const value = document.createElement('strong');
    value.textContent = String(item.value);
    const label = document.createElement('span');
    label.textContent = item.label;
    container.append(value, label);
    return container;
  }));
}

function updateAssignmentStatus(panelId, loads, circuitCount) {
  const status = document.getElementById("panel-assignment-status");
  if (!status) return;
  const assigned = Array.isArray(loads)
    ? loads.filter(load => load?.panelId === panelId).length
    : 0;
  const remaining = Math.max(0, circuitCount - assigned);
  status.textContent = `Assigned loads: ${assigned}. Open circuits available: ${remaining}.`;
}

window.addEventListener("DOMContentLoaded", () => {
  dataStore.loadProject(projectId);
  let panels = dataStore.getPanels();
  const params = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const requestedPanelId = params.get("panel") || params.get("panelId") || params.get("panelboard");
  const determineInitialPanelId = () => {
    if (requestedPanelId) {
      const match = findPanelByIdentifier(panels, requestedPanelId);
      if (match) {
        return match.id || requestedPanelId;
      }
    }
    if (Array.isArray(panels) && panels.length) {
      const first = panels[0];
      return first?.id || first?.ref || first?.panel_id || first?.tag || "P1";
    }
    return "P1";
  };
  let activePanelId = determineInitialPanelId();
  let panel;
  const syncPanelState = () => {
    const state = getOrCreatePanel(activePanelId);
    panel = state.panel;
    panels = state.panels;
    if (panel && panel.id && panel.id !== activePanelId) {
      activePanelId = panel.id;
    }
    return state;
  };
  const rerender = () => {
    const state = render(activePanelId);
    if (state && state.panel && state.panels) {
      panel = state.panel;
      panels = state.panels;
      updatePanelFormInputs();
      return state;
    }
    const fallback = syncPanelState();
    updatePanelFormInputs();
    return fallback;
  };
  syncPanelState();
  const panelSelect = document.getElementById("panel-select");
  const newPanelBtn = document.getElementById("panel-add-btn");
  const duplicatePanelBtn = document.getElementById("panel-duplicate-btn");
  const deletePanelBtn = document.getElementById("panel-delete-btn");

  const tagInput = document.getElementById("panel-tag");
  const fedFromInput = document.getElementById("panel-fed-from");
  const voltageInput = document.getElementById("panel-voltage");
  const manufacturerInput = document.getElementById("panel-manufacturer");
  const modelInput = document.getElementById("panel-model");
  const systemInput = document.getElementById("panel-system-type");
  const phasesInput = document.getElementById("panel-phases");
  const polesInput = document.getElementById("panel-poles");
  const branchTypeInput = document.getElementById("panel-branch-device-type");
  const mainInput = document.getElementById("panel-main-rating");
  const circuitInput = document.getElementById("panel-circuit-count");
  const sccrInput = document.getElementById("panel-sccr");
  const jumpUnassignedBtn = document.getElementById("panel-jump-unassigned-btn");
  const clearAssignmentsBtn = document.getElementById("panel-clear-assignments-btn");
  const validationHints = document.getElementById("panel-validation-hints");
  const fieldAssistive = new Map();

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

  const updatePanelQueryParam = id => {
    if (typeof window === "undefined" || !window.history?.replaceState) return;
    try {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set("panel", id);
      } else {
        url.searchParams.delete("panel");
      }
      window.history.replaceState({}, "", url);
    } catch (e) { console.warn('Failed to update URL history state', e); }
  };

  const updatePanelSelectorButtons = () => {
    const totalPanels = Array.isArray(panels) ? panels.length : 0;
    if (duplicatePanelBtn) {
      duplicatePanelBtn.disabled = totalPanels === 0;
    }
    if (deletePanelBtn) {
      deletePanelBtn.disabled = totalPanels <= 1;
    }
  };

  const refreshPanelSelector = () => {
    if (!panelSelect) {
      updatePanelSelectorButtons();
      return;
    }
    const fragment = document.createDocumentFragment();
    const activeValue = panel?.id || activePanelId;
    if (Array.isArray(panels)) {
      panels.forEach((entry, index) => {
        if (!entry) return;
        const value = entry.id || entry.ref || entry.panel_id || entry.tag;
        if (!value) return;
        const option = document.createElement("option");
        option.value = value;
        const label = formatPanelSelectorLabel(entry, index);
        option.textContent = label;
        option.title = label;
        if (value === activeValue) {
          option.selected = true;
        }
        fragment.appendChild(option);
      });
    }
    panelSelect.innerHTML = "";
    panelSelect.appendChild(fragment);
    updatePanelSelectorButtons();
  };

  const validatePanelInputs = () => {
    const hints = [];
    const fieldErrors = {
      voltage: '',
      circuitCount: '',
      mainRating: '',
      shortCircuitRating: ''
    };
    const markInvalid = (input, invalid) => {
      if (!input) return;
      input.setAttribute("aria-invalid", invalid ? "true" : "false");
    };

    const voltageValue = voltageInput ? String(voltageInput.value || "").trim() : "";
    const parsedVoltage = voltageValue ? Number.parseFloat(voltageValue) : null;
    const voltageInvalid = Boolean(voltageValue) && (!Number.isFinite(parsedVoltage) || parsedVoltage <= 0);
    markInvalid(voltageInput, voltageInvalid);
    if (voltageInvalid) {
      fieldErrors.voltage = 'Enter a positive voltage value (example: 480).';
      hints.push('Voltage should be a positive number (for example: 480).');
    }

    const circuitValue = circuitInput ? Number.parseInt(circuitInput.value, 10) : null;
    const circuitInvalid = Number.isFinite(circuitValue) ? circuitValue < 1 : false;
    markInvalid(circuitInput, circuitInvalid);
    if (circuitInvalid) {
      fieldErrors.circuitCount = `Use between 1 and ${MAX_PANEL_CIRCUITS} for number of circuits.`;
      hints.push(`Number of circuits must be between 1 and ${MAX_PANEL_CIRCUITS}.`);
    }

    const mainRating = mainInput ? Number.parseFloat(mainInput.value) : null;
    const sccrRating = sccrInput ? Number.parseFloat(sccrInput.value) : null;
    const ratingConflict = Number.isFinite(mainRating) && Number.isFinite(sccrRating) && sccrRating < mainRating;
    markInvalid(mainInput, ratingConflict);
    markInvalid(sccrInput, ratingConflict);
    if (ratingConflict) {
      fieldErrors.mainRating = 'Lower than short-circuit rating allowed. Reduce main or increase SCCR.';
      fieldErrors.shortCircuitRating = 'SCCR must be greater than or equal to main device rating.';
      hints.push('Short-circuit rating should be greater than or equal to the main device rating.');
    }

    if (fieldAssistive.size) {
      fieldAssistive.get('voltage')?.setError(fieldErrors.voltage);
      fieldAssistive.get('circuitCount')?.setError(fieldErrors.circuitCount);
      fieldAssistive.get('mainRating')?.setError(fieldErrors.mainRating);
      fieldAssistive.get('shortCircuitRating')?.setError(fieldErrors.shortCircuitRating);
    }

    if (validationHints) {
      if (!hints.length) {
        validationHints.textContent = 'All key panel inputs look valid.';
      } else {
        validationHints.textContent = '';
        hints.forEach(message => {
          const div = document.createElement('div');
          div.className = 'panel-hint';
          div.textContent = `⚠ ${message} Fix the highlighted field to continue.`;
          validationHints.appendChild(div);
        });
      }
    }

    return hints.length === 0;
  };

  const updatePanelFormInputs = () => {
    if (!panel) return;
    if (tagInput) tagInput.value = panel.ref || panel.panel_id || panel.tag || panel.id || "";
    if (fedFromInput) fedFromInput.value = panel.fedFrom || panel.fed_from || "";
    if (voltageInput) voltageInput.value = panel.voltage || "";
    if (manufacturerInput) manufacturerInput.value = panel.manufacturer || "";
    if (modelInput) modelInput.value = panel.model || "";
    if (systemInput) systemInput.value = getPanelSystem(panel);
    if (phasesInput) {
      const parsedPhases = parsePositiveInt(panel.phases);
      const normalizedPhases = parsedPhases === 1 ? "1" : "3";
      phasesInput.value = normalizedPhases;
    }
    if (polesInput) {
      polesInput.value = String(getPanelPoleLimit(panel));
    }
    if (branchTypeInput) branchTypeInput.value = getPanelBranchDeviceType(panel);
    if (mainInput) mainInput.value = panel.mainRating || "";
    if (circuitInput) {
      const breakerCount = Array.isArray(panel.breakers) ? panel.breakers.length : 0;
      circuitInput.value = panel.circuitCount || breakerCount || 42;
    }
    if (sccrInput) {
      sccrInput.value = panel.shortCircuitRating || panel.shortCircuitCurrentRating || "";
    }
    validatePanelInputs();
  };

  const ensurePanelDefaults = () => {
    if (!panel) return;
    const normalizedSystem = getPanelSystem(panel);
    let defaultsChanged = false;
    if (panel.powerType !== normalizedSystem) {
      panel.powerType = normalizedSystem;
      defaultsChanged = true;
    }
    const parsedPhases = parsePositiveInt(panel.phases);
    if (!parsedPhases) {
      panel.phases = normalizedSystem === "ac" ? "3" : "1";
      defaultsChanged = true;
    } else if (parsedPhases !== 1 && parsedPhases !== 3) {
      panel.phases = parsedPhases < 3 ? "1" : "3";
      defaultsChanged = true;
    }
    const defaultPoleLimit = getMaxBranchPoleCount(normalizedSystem);
    const parsedPoles = parsePositiveInt(panel.poles);
    if (!parsedPoles) {
      panel.poles = String(defaultPoleLimit);
      defaultsChanged = true;
    } else {
      const cappedPoles = Math.min(defaultPoleLimit, parsedPoles);
      if (String(cappedPoles) !== String(panel.poles)) {
        panel.poles = String(cappedPoles);
        defaultsChanged = true;
      }
    }
    const details = ensureBreakerDetails(panel);
    const hasFuseDetail = Object.values(details).some(detail => getDeviceType(detail) === "fuse");
    const normalizedBranch = panel.branchDeviceType ? getPanelBranchDeviceType(panel) : (hasFuseDetail ? "fuse" : "breaker");
    if (!panel.branchDeviceType || panel.branchDeviceType !== normalizedBranch) {
      panel.branchDeviceType = normalizedBranch;
      defaultsChanged = true;
    }
    const { updated: branchUpdated } = syncBranchDeviceType(panel);
    if (branchUpdated) {
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
  };

  ensurePanelDefaults();
  updatePanelFormInputs();
  refreshPanelSelector();
  rerender();
  updatePanelQueryParam(panel?.id || activePanelId);

  const setActivePanelId = (identifier, options = {}) => {
    if (!identifier) return;
    activePanelId = identifier;
    syncPanelState();
    ensurePanelDefaults();
    updatePanelFormInputs();
    refreshPanelSelector();
    if (!options.skipRender) {
      rerender();
    }
    if (!options.skipHistory) {
      updatePanelQueryParam(panel?.id || identifier);
    }
  };

  const configureBreaker = (startCircuit, poles) => {
    const start = Number.parseInt(startCircuit, 10);
    if (!Number.isFinite(start) || start < 1) return;
    let size = Number.parseInt(poles, 10);
    if (!Number.isFinite(size) || size < 1) size = 1;
    const systemType = getPanelSystem(panel);
    const poleLimit = getPanelPoleLimit(panel);
    size = clampBreakerPolesForSystem(systemType, size, poleLimit);
    const count = getPanelCircuitCount(panel);
    ensurePanelBreakerCapacity(panel, count);
    const { layout } = ensurePanelBreakerLayout(panel, count);
    const loads = dataStore.getLoads();
    const targetSlots = computeBreakerSpan(start, size, count);
    if (targetSlots.length !== size) {
      showAlertModal('Configuration Error', `Breaker requires ${size} spaces on the same side of the panel but exceeds the available circuits.`);
      return;
    }
    const conflictSlot = targetSlots.find(slot => {
      const entry = layout[slot - 1];
      return entry && entry.start !== start;
    });
    if (conflictSlot) {
      showAlertModal('Configuration Error', 'Target circuits already belong to another breaker. Remove it first.');
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
      if (candidate.panelId !== activePanelId) return false;
      const span = getLoadBreakerSpan(candidate, panel, count);
      if (!span.length) return false;
      if (unchanged && span[0] === start && span.length === size) return false;
      return span.some(slot => targetSlots.includes(slot) || removedSlots.includes(slot));
    });
    if (conflictLoad) {
      const label = formatLoadLabel(conflictLoad, loads.indexOf(conflictLoad));
      showAlertModal('Configuration Error', label ? `Remove load ${label} before changing this breaker.` : 'Remove the load before changing this breaker.');
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
    rerender();
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
      if (candidate.panelId !== activePanelId) return false;
      const span = getLoadBreakerSpan(candidate, panel, count);
      if (!span.length) return false;
      return span.some(slot => blockSlots.includes(slot));
    });
    if (conflictLoad) {
      const label = formatLoadLabel(conflictLoad, loads.indexOf(conflictLoad));
      showAlertModal('Configuration Error', label ? `Remove load ${label} before deleting this breaker.` : 'Remove the load before deleting this breaker.');
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
    rerender();
  };

  const handleChange = (prop, input, options = {}) => {
    panel[prop] = input.value;
    ensurePanelDefaults();
    savePanels();
    updateOneline();
    if (options.refreshSelector) refreshPanelSelector();
    if (options.render) rerender();
  };

  if (panelSelect) {
    panelSelect.addEventListener("change", () => {
      const value = panelSelect.value;
      if (value && value !== activePanelId) {
        setActivePanelId(value);
      }
    });
  }

  if (newPanelBtn) {
    newPanelBtn.addEventListener("click", () => {
      const newId = generatePanelId(panels);
      setActivePanelId(newId);
    });
  }

  if (duplicatePanelBtn) {
    duplicatePanelBtn.addEventListener("click", () => {
      if (!panel) return;
      const clone = duplicatePanelDefinition(panel, panels);
      if (!clone) return;
      panels.push(clone);
      savePanels();
      setActivePanelId(clone.id);
    });
  }

  if (deletePanelBtn) {
    deletePanelBtn.addEventListener("click", async () => {
      if (!panel || !Array.isArray(panels) || panels.length <= 1) return;
      const confirmed = await confirmProjectEntityDeletion({
        collection: 'panels',
        records: [panel],
        getImpact: dataStore.getProjectEntityDeletionImpact,
        title: 'Review Panel Deletion'
      });
      if (!confirmed) return;
      const idx = panels.findIndex(entry => entry && panelMatchesIdentifier(entry, activePanelId));
      if (idx >= 0) panels.splice(idx, 1);
      else panels.splice(panels.length - 1, 1);
      savePanels();
      const nextPanel = panels[idx] || panels[idx - 1] || panels[0];
      const nextId = nextPanel ? (nextPanel.id || nextPanel.ref || nextPanel.panel_id || nextPanel.tag) : null;
      if (nextId) {
        setActivePanelId(nextId);
      } else {
        setActivePanelId(generatePanelId(panels));
      }
    });
  }

  if (jumpUnassignedBtn) {
    jumpUnassignedBtn.addEventListener("click", () => {
      const panelContainer = document.getElementById("panel-container");
      const firstUnassigned = panelContainer
        ? panelContainer.querySelector("select[data-breaker][value=''], select[data-breaker]:not([value])")
        : null;
      const fallbackUnassigned = panelContainer
        ? Array.from(panelContainer.querySelectorAll("select[data-breaker]")).find(select => !String(select.value || "").trim())
        : null;
      const target = firstUnassigned || fallbackUnassigned;
      if (!target) {
        if (validationHints) validationHints.textContent = "All visible breaker positions currently have assignments.";
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus();
    });
  }

  if (clearAssignmentsBtn) {
    clearAssignmentsBtn.addEventListener("click", async () => {
      if (!panel) return;
      const label = getPanelDisplayName(panel);
      const confirmed = await openModal({
        title: 'Clear Assignments',
        description: `Clear all load assignments for ${label}?`,
        primaryText: 'Clear',
        secondaryText: 'Cancel',
        variant: 'danger'
      });
      if (!confirmed) return;
      const changed = clearLoadsForPanel(panel);
      if (!changed) {
        if (validationHints) validationHints.textContent = "No assignments were found to clear for this panel.";
        return;
      }
      panel.breakers = Array.from({ length: getPanelCircuitCount(panel) }, () => null);
      panel.breakerLayout = [];
      panel.breakerDetails = {};
      savePanels();
      dataStore.saveProject(projectId);
      updateOneline();
      rerender();
    });
  }

  const panelInfo = document.getElementById("panel-info");
  fieldAssistive.set('voltage', ensureFieldAssistiveText(voltageInput, {
    helperText: 'Positive volts; required for calculations.'
  }));
  fieldAssistive.set('circuitCount', ensureFieldAssistiveText(circuitInput, {
    helperText: 'Total available branch-circuit positions.'
  }));
  fieldAssistive.set('mainRating', ensureFieldAssistiveText(mainInput, {
    helperText: 'Main ampere rating used for SCCR checks.'
  }));
  fieldAssistive.set('shortCircuitRating', ensureFieldAssistiveText(sccrInput, {
    helperText: 'Panel SCCR must meet or exceed the main rating.'
  }));
  if (panelInfo) {
    panelInfo.addEventListener("input", () => validatePanelInputs());
    panelInfo.addEventListener("change", () => validatePanelInputs());
  }

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
        refreshPanelSelector();
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
        refreshPanelSelector();
      });
    }

  if (voltageInput) voltageInput.addEventListener("input", () => handleChange("voltage", voltageInput, { refreshSelector: true }));
  if (manufacturerInput) manufacturerInput.addEventListener("input", () => handleChange("manufacturer", manufacturerInput));
  if (modelInput) modelInput.addEventListener("input", () => handleChange("model", modelInput));
  if (systemInput) systemInput.addEventListener("change", () => handleChange("powerType", systemInput, { render: true }));
  if (phasesInput) phasesInput.addEventListener("change", () => handleChange("phases", phasesInput, { render: true }));
  if (polesInput) polesInput.addEventListener("change", () => handleChange("poles", polesInput, { render: true }));
  if (branchTypeInput) {
    branchTypeInput.addEventListener("change", () => {
      panel.branchDeviceType = branchTypeInput.value === "fuse" ? "fuse" : "breaker";
      syncBranchDeviceType(panel);
      savePanels();
      updateOneline();
      rerender();
    });
  }

  if (mainInput) {
    mainInput.addEventListener("input", () => {
      panel.mainRating = mainInput.value;
      savePanels();
      updateOneline();
    });
  }

  if (circuitInput) {
    circuitInput.addEventListener("input", () => {
      const parsed = parseInt(circuitInput.value, 10) || 0;
      const count = Math.max(1, Math.min(MAX_PANEL_CIRCUITS, parsed));
      circuitInput.value = String(count);
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
      rerender();
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

  const exportBtn = document.getElementById("export-panel-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportPanelSchedule(activePanelId));
  }
  const addEquipmentBtn = document.getElementById("add-panel-to-equipment-btn");
  if (addEquipmentBtn) {
    addEquipmentBtn.addEventListener("click", () => {
      const equipmentId = panel.ref || panel.panel_id || panel.tag || panel.id || activePanelId;
      if (!equipmentId) {
        showAlertModal('Configuration Error', 'Set a panelboard tag before adding it to the equipment list.');
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

  if (panelContainer) {
    panelContainer.addEventListener("change", e => {
      if (e.target.matches("[data-breaker-rating]")) {
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
          rerender();
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
            detail.cable = value;
            detail.cableId = value;
            const cables = dataStore.getCables();
            const existingCable = findCableByIdentifier(cables, value);
            if (!existingCable) {
              const newCable = { tag: value, panel_id: activePanelId, circuit_number: start };
              cables.push(newCable);
              dataStore.setCables(cables);
              dataStore.saveProject(projectId);
            }
          } else {
            delete detail.cableTag;
            delete detail.cable;
            delete detail.cableId;
          }
          savePanels();
          updateOneline();
          rerender();
        }
        return;
      }
      if (e.target.matches("input[data-breaker-custom-load]")) {
        const start = Number.parseInt(e.target.dataset.breakerCustomLoad, 10);
        if (Number.isFinite(start)) {
          const detail = ensureBreakerDetail(panel, start);
          const value = e.target.value.trim();
          if (value) {
            detail.customLoad = value;
          } else {
            delete detail.customLoad;
          }
          savePanels();
          updateOneline();
          rerender();
        }
        return;
      }
      if (e.target.matches("input[data-breaker-phase-load]") || e.target.matches("input[data-breaker-phase-load][type=number]")) {
        const start = Number.parseInt(e.target.dataset.breakerPhaseLoad, 10);
        if (Number.isFinite(start)) {
          const detail = ensureBreakerDetail(panel, start);
          const phaseKey = e.target.dataset.phase;
          const value = e.target.value.trim();
          if (phaseKey) {
            const current = detail.loadVaPerPhase;
            const collection = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
            if (value || value === "0") {
              collection[phaseKey] = value;
            } else {
              delete collection[phaseKey];
            }
            const cleaned = Object.entries(collection).filter(([, v]) => v != null && v !== "");
            if (cleaned.length) {
              detail.loadVaPerPhase = Object.fromEntries(cleaned);
            } else {
              delete detail.loadVaPerPhase;
            }
          } else {
            if (value || value === "0") {
              detail.loadVaPerPhase = value;
            } else {
              delete detail.loadVaPerPhase;
            }
          }
          savePanels();
          updateOneline();
          rerender();
        }
        return;
      }
      if (e.target.matches("select[data-breaker]")) {
        const breaker = parseInt(e.target.dataset.breaker, 10);
        const loadIdx = e.target.value ? Number(e.target.value) : null;
        if (loadIdx !== null) {
          assignLoadToBreaker(activePanelId, loadIdx, breaker);
        } else {
          const loads = dataStore.getLoads();
          const panelList = dataStore.getPanels();
          const targetPanel = findPanelByIdentifier(panelList, activePanelId);
          const circuitCount = targetPanel ? getPanelCircuitCount(targetPanel) : 0;
          const removed = [];
          loads.forEach(load => {
            if (load.panelId !== activePanelId) return;
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
        rerender();
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
  }

  // Reload the panel view whenever a remote collaborator's patch is applied
  document.addEventListener('ctr:remote-applied', () => {
    panels = dataStore.getPanels();
    rerender();
  });
});

// expose for debugging
if (typeof window !== "undefined") {
  window.assignLoadToBreaker = assignLoadToBreaker;
  window.calculatePanelTotals = calculatePanelTotals;
}
