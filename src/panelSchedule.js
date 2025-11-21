import "./workflowStatus.js";
import "../site.js";
import * as dataStore from "../dataStore.mjs";
import { exportPanelSchedule } from "../exportPanelSchedule.js";

const projectId = typeof window !== "undefined" ? (window.currentProjectId || "default") : undefined;

function getPanelIdentifierCandidates(panel) {
  if (!panel) return [];
  return [panel.id, panel.ref, panel.panel_id, panel.tag]
    .map(value => (value == null ? null : String(value)))
    .filter(Boolean);
}

function panelMatchesIdentifier(panel, identifier) {
  if (!panel || identifier == null) return false;
  const normalized = String(identifier).toLowerCase();
  if (!normalized) return false;
  return getPanelIdentifierCandidates(panel)
    .some(value => value.toLowerCase() === normalized);
}

function findPanelByIdentifier(panels, identifier) {
  if (!Array.isArray(panels) || !identifier) return null;
  return panels.find(panel => panelMatchesIdentifier(panel, identifier)) || null;
}

function generatePanelId(panels) {
  const used = new Set();
  if (Array.isArray(panels)) {
    panels.forEach(panel => {
      getPanelIdentifierCandidates(panel).forEach(value => used.add(value));
    });
  }
  let max = 0;
  used.forEach(value => {
    const match = /^P(\d+)$/i.exec(value || "");
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        max = Math.max(max, parsed);
      }
    }
  });
  let candidateNumber = Math.max(1, max + 1);
  while (used.has(`P${candidateNumber}`)) {
    candidateNumber++;
  }
  return `P${candidateNumber}`;
}

function getPanelDisplayName(panel, index = 0) {
  if (!panel) return `Panel ${index + 1}`;
  const candidates = [panel.ref, panel.panel_id, panel.tag, panel.id];
  for (const candidate of candidates) {
    if (candidate != null && String(candidate).trim()) {
      return String(candidate);
    }
  }
  return `Panel ${index + 1}`;
}

function formatPanelSelectorLabel(panel, index = 0) {
  const base = getPanelDisplayName(panel, index);
  const meta = [];
  const voltage = panel?.voltage;
  if (voltage) {
    const trimmed = String(voltage).trim();
    if (trimmed) {
      meta.push(/v$/i.test(trimmed) ? trimmed : `${trimmed} V`);
    }
  }
  const fed = panel?.fedFrom || panel?.fed_from;
  if (fed) {
    meta.push(`Fed from ${fed}`);
  }
  return meta.length ? `${base} (${meta.join(" • ")})` : base;
}

function clonePanelState(panel) {
  if (!panel) return null;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(panel);
    } catch {}
  }
  try {
    return JSON.parse(JSON.stringify(panel));
  } catch {
    return { ...panel };
  }
}

function duplicatePanelDefinition(panel, panels) {
  if (!panel) return null;
  const clone = clonePanelState(panel) || {};
  const circuitCount = getPanelCircuitCount(panel);
  clone.id = generatePanelId(panels);
  const sourceLabel = getPanelDisplayName(panel);
  const copyLabel = sourceLabel ? `${sourceLabel} Copy` : clone.id;
  clone.ref = copyLabel;
  clone.panel_id = copyLabel;
  clone.tag = copyLabel;
  clone.breakers = Array.from({ length: circuitCount }, () => null);
  clone.breakerLayout = Array.isArray(panel.breakerLayout)
    ? panel.breakerLayout.map(entry => (entry ? { ...entry } : null))
    : [];
  if (panel.breakerDetails && typeof panel.breakerDetails === "object") {
    clone.breakerDetails = Object.fromEntries(
      Object.entries(panel.breakerDetails).map(([key, detail]) => {
        if (detail && typeof detail === "object") {
          return [key, { ...detail }];
        }
        return [key, detail];
      })
    );
  } else {
    clone.breakerDetails = {};
  }
  return clone;
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
  if (!Array.isArray(panel.breakers)) {
    panel.breakers = [];
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
  if (!panel.id) {
    const fallback = panel.ref || panel.panel_id || panel.tag;
    if (fallback) {
      panel.id = fallback;
    } else {
      panel.id = generatePanelId(panels);
    }
    identifiersUpdated = true;
  }
  if (identifiersUpdated) {
    dataStore.setPanels(panels);
  }
  return { panel, panels };
}

const DC_PHASE_LABELS = ["+", "−"];
const SINGLE_PHASE_LABELS = ["A", "B"];
const THREE_PHASE_LABELS = ["A", "B", "C"];
const FALLBACK_DC_SEQUENCE = ["+", "−"];

function resolveDcSequence(sequence) {
  if (Array.isArray(sequence) && sequence.length >= 2) {
    return sequence;
  }
  return FALLBACK_DC_SEQUENCE;
}

function getDcPolarityForCircuit(circuit, sequence = DC_PHASE_LABELS) {
  const slot = Number.parseInt(circuit, 10);
  if (!Number.isFinite(slot) || slot < 1) return "";
  const normalized = resolveDcSequence(sequence);
  const positive = normalized[0] ?? FALLBACK_DC_SEQUENCE[0];
  const negative = normalized[1] ?? FALLBACK_DC_SEQUENCE[1];
  const rowIndex = Math.floor((slot - 1) / 2);
  const label = rowIndex % 2 === 0 ? positive : negative;
  return label == null ? "" : String(label);
}

function getMaxBranchPoleCount(system) {
  return system === "dc" ? 2 : 3;
}

function getAllowedBranchPoleCounts(system, maxPoles = null) {
  const systemMax = getMaxBranchPoleCount(system);
  const limit = Number.isFinite(maxPoles) && maxPoles > 0
    ? Math.min(systemMax, maxPoles)
    : systemMax;
  return Array.from({ length: Math.max(1, limit) }, (_, idx) => idx + 1);
}

function clampBreakerPolesForSystem(system, poles, maxPoles = null) {
  if (!Number.isFinite(poles) || poles < 1) return 1;
  const systemMax = getMaxBranchPoleCount(system);
  const limit = Number.isFinite(maxPoles) && maxPoles > 0
    ? Math.min(systemMax, maxPoles)
    : systemMax;
  return Math.min(poles, Math.max(1, limit));
}

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

function getPanelPoleLimit(panel) {
  const system = getPanelSystem(panel);
  const systemMax = getMaxBranchPoleCount(system);
  const explicit = parsePositiveInt(panel?.poles);
  if (explicit) return Math.min(systemMax, explicit);
  return systemMax;
}

function getPanelPhaseSequence(panel) {
  const system = getPanelSystem(panel);
  const poleLimit = getPanelPoleLimit(panel) || 1;
  if (system === "dc") {
    const sequence = resolveDcSequence(DC_PHASE_LABELS);
    return sequence.slice(0, Math.max(1, Math.min(sequence.length, poleLimit)));
  }
  const phases = parseInt(panel?.phases, 10);
  let sequence;
  if (Number.isFinite(phases)) {
    if (phases <= 1) sequence = SINGLE_PHASE_LABELS;
    else if (phases === 2) sequence = SINGLE_PHASE_LABELS;
    else if (phases >= 3) sequence = THREE_PHASE_LABELS;
  }
  const normalized = Array.isArray(sequence) && sequence.length ? sequence : THREE_PHASE_LABELS;
  return normalized.slice(0, Math.max(1, Math.min(normalized.length, poleLimit)));
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
  const base = type === "fuse" ? "Fuse" : "";
  if (Number.isFinite(poleCount) && poleCount > 1) {
    return type === "fuse" ? `${poleCount}-Pole Fuse` : `${poleCount}-Pole`;
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
  const system = getPanelSystem(panel);
  const isDcPanel = system === "dc";
  const maxPoles = getMaxBranchPoleCount(system);
  const trimmedSlots = new Set();

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
    let normalizedSize = size;
    if (isDcPanel && Number.isFinite(maxPoles) && normalizedSize > maxPoles) {
      if (position === 0) {
        const spanToTrim = computeBreakerSpan(start, normalizedSize, count);
        if (spanToTrim.length > maxPoles) {
          for (let idx = maxPoles; idx < spanToTrim.length; idx++) {
            trimmedSlots.add(spanToTrim[idx]);
          }
        }
      }
      normalizedSize = maxPoles;
      changed = true;
    }
    if (!existing || existing.size < normalizedSize) {
      blocks.set(start, { start, size: normalizedSize });
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
  if (trimmedSlots.size && Array.isArray(panel.breakers)) {
    trimmedSlots.forEach(slot => {
      const index = slot - 1;
      if (index >= 0 && index < panel.breakers.length) {
        panel.breakers[index] = null;
      }
    });
  }
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
  if (system === "dc") {
    return getDcPolarityForCircuit(index, sequence);
  }
  if (system === "ac") {
    if (sequence.length === 3) {
      const rowIndex = Math.floor((index - 1) / 2);
      return sequence[rowIndex % sequence.length];
    }
    if (sequence.length === 2) {
      const rowIndex = Math.floor((index - 1) / 2);
      return sequence[rowIndex % sequence.length];
    }
  }
  return sequence[(index - 1) % sequence.length] || "";
}

function getLoadPoleCount(load, panel) {
  const system = getPanelSystem(panel);
  const candidates = [
    load?.breakerPoles,
    load?.poles,
    load?.poleCount,
    load?.phaseCount,
    load?.phases
  ];
  let poleCount = 1;
  for (const candidate of candidates) {
    const parsed = parsePositiveInt(candidate);
    if (!parsed) continue;
    if (system === "dc") {
      poleCount = Math.min(parsed, 2);
      break;
    }
    if (system === "ac") {
      poleCount = parsed >= 3 ? 3 : parsed === 2 ? 2 : 1;
      break;
    }
    poleCount = parsed;
    break;
  }
  const poleLimit = getPanelPoleLimit(panel);
  return Math.min(poleCount, poleLimit);
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

function sanitizeDcLoadBreakerPoles(loads, panel, panelId) {
  if (!Array.isArray(loads)) return false;
  if (!panel || getPanelSystem(panel) !== "dc") return false;
  let mutated = false;
  loads.forEach(load => {
    if (!load || load.panelId !== panelId) return;
    const parsed = parsePositiveInt(load.breakerPoles);
    if (parsed && parsed > 2) {
      load.breakerPoles = 2;
      mutated = true;
    }
  });
  return mutated;
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

function createColumnHeaders(label) {
  const headers = [];
  ["Cable Tag", "Load Served", "Poles", "Rating (A)"].forEach(text => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = text.toUpperCase();
    th.className = "panel-column-subheader";
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
  table.style.setProperty("--panel-rail-count", String(Math.max(phaseSequence.length, 1)));
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
  createColumnHeaders("odd").forEach(header => subHeader.appendChild(header));
  createColumnHeaders("even").forEach(header => subHeader.appendChild(header));
  thead.appendChild(subHeader);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const rows = Math.ceil(circuitCount / 2);
  const layout = Array.isArray(panel.breakerLayout) ? panel.breakerLayout : [];

  const collectDeviceCircuits = (odd, even) => {
    const circuits = new Set();
    [odd, even].forEach(circuit => {
      const block = layout[circuit - 1] || null;
      if (block?.position === 0) {
        getBlockCircuits(panel, block, circuitCount).forEach(value => circuits.add(value));
      } else if (block) {
        circuits.add(Number(block.start));
      } else if (Number.isFinite(circuit) && circuit <= circuitCount) {
        circuits.add(circuit);
      }
    });
    return Array.from(circuits).filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  };

  const createSummaryCells = result => {
    const cells = [];
    const summary = result?.summary || {};
    const columnContent = result?.columnContent || {};

    const cable = document.createElement("td");
    cable.className = "panel-column panel-column--cable";
    if (columnContent.cable) {
      cable.appendChild(columnContent.cable);
    } else {
      cable.textContent = summary.cableTag || "";
    }
    cells.push(cable);

    const loadCell = result?.cell || document.createElement("td");
    loadCell.classList.add("panel-column", "panel-column--load");
    cells.push(loadCell);

    const poleCell = document.createElement("td");
    poleCell.className = "panel-column panel-column--poles";
    if (columnContent.poles) {
      poleCell.appendChild(columnContent.poles);
    } else {
      poleCell.textContent = summary.poles || "";
    }
    cells.push(poleCell);

    const ratingCell = document.createElement("td");
    ratingCell.className = "panel-column panel-column--rating";
    if (columnContent.rating) {
      ratingCell.appendChild(columnContent.rating);
    } else {
      ratingCell.textContent = summary.rating || "";
    }
    cells.push(ratingCell);

    return cells;
  };

  for (let i = 0; i < rows; i++) {
    const row = document.createElement("tr");
    const oddCircuit = i * 2 + 1;
    const evenCircuit = oddCircuit + 1;

    const oddResult = createCircuitCell(panel, panelId, loads, oddCircuit, circuitCount, "left", system, breakerDetails);
    createSummaryCells(oddResult).forEach(cell => row.appendChild(cell));

    const deviceCircuits = collectDeviceCircuits(oddCircuit, evenCircuit);
    const deviceCell = createDeviceCell(
      panel,
      oddCircuit,
      evenCircuit,
      circuitCount,
      breakerDetails,
      system,
      phaseSequence,
      { circuits: deviceCircuits, baseRow: i }
    );
    row.appendChild(deviceCell);

    const evenResult = createCircuitCell(panel, panelId, loads, evenCircuit, circuitCount, "right", system, breakerDetails);
    createSummaryCells(evenResult).forEach(cell => row.appendChild(cell));

    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.appendChild(table);
  updateTotals(panelId);
  return state;
}

function createCircuitCell(panel, panelId, loads, breaker, circuitCount, position, system, breakerDetails) {
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
  const deviceType = getDeviceType(breakerDetail);
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

  if (!block) {
    slot.classList.add("panel-slot--blank");
    const quickAdd = document.createElement("div");
    quickAdd.className = "panel-slot-quick-add";
    const poleLimit = getPanelPoleLimit(panel);
    getAllowedBranchPoleCounts(system, poleLimit).forEach(poles => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-slot-add-btn";
      button.dataset.action = "add-breaker";
      button.dataset.poles = String(poles);
      button.dataset.circuit = String(breaker);
      button.textContent = `${poles}-Pole`;
      quickAdd.appendChild(button);
    });
    const poleWrapper = document.createElement("div");
    poleWrapper.className = "panel-column-content";
    poleWrapper.appendChild(quickAdd);
    columnContent.poles = poleWrapper;
    control.classList.add("panel-slot-control--blank");
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

    const selectRow = document.createElement("div");
    selectRow.className = "panel-slot-select-row";
    selectRow.appendChild(select);

    if (!assignedLoad) {
      const availability = document.createElement("span");
      availability.className = "panel-slot-availability";
      const availabilitySegments = [];
      if (blockLabel) availabilitySegments.push(blockLabel);
      if (ratingValue) availabilitySegments.push(`${ratingValue}A`);
      availability.textContent = availabilitySegments.length
        ? `${availabilitySegments.join(" — ")} available`
        : "Breaker available";
      selectRow.appendChild(availability);
    }

    control.appendChild(selectRow);

    const config = document.createElement("div");
    config.className = "panel-slot-device-config";

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

    control.appendChild(config);

    const ratingLabel = document.createElement("label");
    ratingLabel.className = "panel-column-field";
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
    const ratingWrapper = document.createElement("div");
    ratingWrapper.className = "panel-column-content";
    ratingWrapper.appendChild(ratingLabel);
    columnContent.rating = ratingWrapper;

    const cableLabel = document.createElement("label");
    cableLabel.className = "panel-column-field";
    cableLabel.textContent = "Cable";
    const cableInput = document.createElement("input");
    cableInput.type = "text";
    cableInput.className = "panel-slot-input";
    cableInput.placeholder = "Cable Tag";
    cableInput.dataset.breakerCable = String(primaryStart);
    cableInput.setAttribute("list", "panel-breaker-cable-options");
    cableInput.value = cableValue;
    cableLabel.appendChild(cableInput);
    const cableWrapper = document.createElement("div");
    cableWrapper.className = "panel-column-content";
    cableWrapper.appendChild(cableLabel);
    columnContent.cable = cableWrapper;

    const breakerInfo = document.createElement("div");
    breakerInfo.className = "panel-slot-breaker-info";
    const infoSegments = [];
    if (blockLabel) infoSegments.push(blockLabel);
    if (ratingValue) infoSegments.push(`${ratingValue}A`);
    breakerInfo.textContent = infoSegments.length ? infoSegments.join(" — ") : deviceType === "fuse" ? "Fuse" : "—";
    control.appendChild(breakerInfo);

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
  }
  if (control.childElementCount) {
    slot.appendChild(control);
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
      details.classList.add("panel-slot-details--compact");
      details.textContent = "";
      const cableTag = breakerDetail?.cableTag || breakerDetail?.cable || breakerDetail?.cableId;
      if (cableTag) {
        const meta = document.createElement("div");
        meta.className = "panel-slot-meta panel-slot-meta--compact";
        meta.appendChild(createMetaChip(`Cable ${cableTag}`));
        details.appendChild(meta);
      }
    } else {
      details.textContent = blockLabel
        ? `Part of ${blockLabel} starting at Circuit ${primaryStart}`
        : `Part of breaker starting at Circuit ${primaryStart}`;
    }
    if (!summary.loadServed && blockLabel) {
      summary.loadServed = blockLabel;
    }
  } else {
    details.classList.add("panel-slot-details-empty");
    details.textContent = "No breaker configured";
  }

  if (!summary.loadServed && blockLabel) {
    summary.loadServed = blockLabel;
  }
  slot.appendChild(details);
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
  const spanCircuits = Array.isArray(options.circuits) && options.circuits.length
    ? options.circuits
    : [oddCircuit, evenCircuit].filter(value => Number.isFinite(value));
  const rowCount = Math.max(1, spanRows);
  if (spanRows > 1) {
    td.rowSpan = spanRows;
    td.style.setProperty("--panel-device-row-span", String(spanRows));
  }

  const rails = createBusRails(sequence, { variant: "body" });
  rails.classList.add("panel-device-rails--inline");
  rails.style.setProperty("--panel-bus-span", `${railSpan}rem`);

  const wrapper = document.createElement("div");
  wrapper.className = "panel-device-wrapper";
  wrapper.style.setProperty("--panel-device-row-count", String(rowCount));
  wrapper.style.setProperty("--panel-bus-span", `${railSpan}rem`);
  const slots = new Map();
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

  const createSlot = circuit => {
    if (!Number.isFinite(circuit) || circuit < 1 || circuit > circuitCount) return null;
    const slot = document.createElement("div");
    const isEven = circuit % 2 === 0;
    slot.className = `panel-device-slot panel-device-slot--${isEven ? "even" : "odd"}`;
    const phase = getPhaseLabel(panel, circuit);
    if (phase) slot.dataset.phase = phase;
    const relativeRow = Math.max(1, Math.min(rowCount, Math.floor((circuit - 1) / 2) - baseRowIndex + 1));
    slot.style.gridRow = String(relativeRow);
    applyRailOffset(slot, phase);
    const marker = document.createElement("div");
    marker.className = "panel-device-slot-marker";
    marker.style.gridRow = String(relativeRow);
    if (phase) marker.dataset.phase = phase;
    applyRailOffset(marker, phase);
    wrapper.appendChild(marker);
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

  const ensureIconForCircuit = (info, circuit) => {
    const slot = slots.get(circuit);
    if (!slot) return;
    const phase = getPhaseLabel(panel, circuit);
    const icon = createBranchDeviceIcon(
      info?.detail,
      1,
      info?.start ?? circuit,
      system,
      phase,
      { placement: circuit % 2 === 0 ? "even" : "odd", labelPoles: info?.size }
    );
    if (icon) {
      slot.appendChild(icon);
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
      circuitList.forEach(circuit => ensureIconForCircuit(info, circuit));
      if (info.size > 1 && circuitList.length > 1) {
        const rows = circuitList.map(circuit => Math.floor((circuit - 1) / 2));
        const minRow = Math.min(...rows);
        const maxRow = Math.max(...rows);
        const column = circuitList[0] % 2 === 0 ? 3 : 1;
        const tie = document.createElement("div");
        tie.className = "panel-device-tie-vertical";
        const startRow = Math.max(1, minRow - baseRowIndex + 1);
        const endRow = Math.max(startRow + 1, Math.min(rowCount + 1, maxRow - baseRowIndex + 2));
        tie.style.gridColumn = String(column);
        tie.style.gridRow = `${startRow} / ${endRow}`;
        tie.setAttribute("aria-hidden", "true");
        wrapper.appendChild(tie);
      }
    });
  }
  return td;
}

function createBranchDeviceIcon(detail, poleCount, startCircuit, system, phaseLabel, options = {}) {
  const type = getDeviceType(detail);
  const poles = Number.isFinite(poleCount) && poleCount > 0 ? poleCount : 1;
  const labelPoles = Number.isFinite(options.labelPoles) && options.labelPoles > 0 ? options.labelPoles : poles;
  const icon = document.createElement("div");
  icon.className = `panel-device panel-device--${type}`;
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
  for (let i = 0; i < poles; i++) {
    const pole = document.createElement("span");
    pole.className = "panel-device-pole";
    symbol.appendChild(pole);
  }
  if (poles > 1) {
    const tie = document.createElement("span");
    tie.className = "panel-device-tie";
    symbol.appendChild(tie);
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
    } catch {}
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
    if (mainInput) mainInput.value = panel.mainRating || "";
    if (circuitInput) {
      const breakerCount = Array.isArray(panel.breakers) ? panel.breakers.length : 0;
      circuitInput.value = panel.circuitCount || breakerCount || 42;
    }
    if (sccrInput) {
      sccrInput.value = panel.shortCircuitRating || panel.shortCircuitCurrentRating || "";
    }
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
      if (candidate.panelId !== activePanelId) return false;
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
    deletePanelBtn.addEventListener("click", () => {
      if (!panel || !Array.isArray(panels) || panels.length <= 1) return;
      const label = getPanelDisplayName(panel);
      const confirmed = window.confirm(`Delete ${label}? Loads assigned to this panel will be cleared.`);
      if (!confirmed) return;
      const idx = panels.findIndex(entry => entry && panelMatchesIdentifier(entry, activePanelId));
      const [removed] = idx >= 0 ? panels.splice(idx, 1) : panels.splice(panels.length - 1, 1);
      savePanels();
      const loadsChanged = clearLoadsForPanel(removed || panel);
      if (loadsChanged) {
        dataStore.saveProject(projectId);
      }
      const nextPanel = panels[idx] || panels[idx - 1] || panels[0];
      const nextId = nextPanel ? (nextPanel.id || nextPanel.ref || nextPanel.panel_id || nextPanel.tag) : null;
      if (nextId) {
        setActivePanelId(nextId);
      } else {
        setActivePanelId(generatePanelId(panels));
      }
    });
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

  if (panelContainer) {
    panelContainer.addEventListener("change", e => {
      if (e.target.matches("select[data-breaker-device]")) {
        const start = Number.parseInt(e.target.dataset.breakerDevice, 10);
        if (Number.isFinite(start)) {
          const detail = ensureBreakerDetail(panel, start);
          detail.deviceType = e.target.value === "fuse" ? "fuse" : "breaker";
        savePanels();
        updateOneline();
          rerender();
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
});

// expose for debugging
if (typeof window !== "undefined") {
  window.assignLoadToBreaker = assignLoadToBreaker;
  window.calculatePanelTotals = calculatePanelTotals;
}
