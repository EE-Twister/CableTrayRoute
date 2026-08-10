import {
  DEFAULT_PANEL_CIRCUIT_COUNT,
  MAX_PANEL_CIRCUITS
} from "./panelModel.js";
import {
  computeBreakerSpan,
  getMaxBranchPoleCount,
  getPanelBranchDeviceType,
  getPanelCircuitCount,
  getPanelPoleLimit,
  getPanelSystem,
  parsePositiveInt
} from "./phaseModel.js";

function resolveCircuitCount(panel) {
  return getPanelCircuitCount(panel, DEFAULT_PANEL_CIRCUIT_COUNT, MAX_PANEL_CIRCUITS);
}

export function ensureBreakerDetails(panel) {
  if (!panel) return {};
  if (!panel.breakerDetails || typeof panel.breakerDetails !== "object") {
    panel.breakerDetails = {};
  }
  return panel.breakerDetails;
}

export function syncBranchDeviceType(panel) {
  if (!panel) return { branchType: "breaker", updated: false };
  const branchType = getPanelBranchDeviceType(panel);
  const details = ensureBreakerDetails(panel);
  let updated = false;
  Object.values(details).forEach(detail => {
    if (detail && typeof detail === "object" && detail.deviceType !== branchType) {
      detail.deviceType = branchType;
      updated = true;
    }
  });
  return { branchType, updated };
}

export function ensureBreakerDetail(panel, startCircuit) {
  if (!panel || !Number.isFinite(startCircuit)) return null;
  const details = ensureBreakerDetails(panel);
  const key = String(startCircuit);
  const existing = details[key];
  if (existing && typeof existing === "object") {
    if (!existing.deviceType || existing.deviceType !== getPanelBranchDeviceType(panel)) {
      existing.deviceType = getPanelBranchDeviceType(panel);
    }
    return existing;
  }
  const created = { deviceType: getPanelBranchDeviceType(panel) };
  details[key] = created;
  return created;
}

export function getBreakerDetail(panel, startCircuit) {
  if (!panel || !Number.isFinite(startCircuit)) return null;
  const details = ensureBreakerDetails(panel);
  const detail = details[String(startCircuit)];
  if (detail && !detail.deviceType) {
    detail.deviceType = getPanelBranchDeviceType(panel);
  }
  return detail || null;
}

export function deleteBreakerDetail(panel, startCircuit) {
  if (!panel || !panel.breakerDetails || !Number.isFinite(startCircuit)) return;
  delete panel.breakerDetails[String(startCircuit)];
}

export function getDeviceType(detail) {
  return detail && detail.deviceType === "fuse" ? "fuse" : "breaker";
}

export function formatDeviceLabel(detail, poleCount) {
  const type = getDeviceType(detail);
  const base = type === "fuse" ? "Fuse" : "";
  if (Number.isFinite(poleCount) && poleCount > 1) {
    return type === "fuse" ? `${poleCount}-Pole Fuse` : `${poleCount}-Pole`;
  }
  return base;
}

export function clearBreakerBlock(layout, startCircuit) {
  if (!Array.isArray(layout)) return;
  for (let i = 0; i < layout.length; i++) {
    const entry = layout[i];
    if (entry && entry.start === startCircuit) {
      layout[i] = null;
    }
  }
}

export function ensurePanelBreakerLayout(panel, circuitCount) {
  if (!panel) {
    return { layout: [], changed: false };
  }
  const branchType = getPanelBranchDeviceType(panel);
  if (!Array.isArray(panel.breakerLayout)) {
    panel.breakerLayout = [];
  }
  const prevLayout = panel.breakerLayout;
  const count = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : 0;
  const normalized = new Array(count).fill(null);
  let changed = false;
  const details = ensureBreakerDetails(panel);
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
      normalized[slot - 1] = { start, size, position };
    });
    const detail = details[String(start)];
    if (detail) {
      detail.poles = Number.isFinite(size) && size > 0 ? Number(size) : detail.poles;
      detail.deviceType = branchType;
    } else {
      const created = ensureBreakerDetail(panel, start);
      created.poles = Number.isFinite(size) && size > 0 ? Number(size) : created.poles;
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
  const validStarts = new Set();
  normalized.forEach(entry => {
    if (!entry) return;
    const start = Number(entry.start);
    if (!Number.isFinite(start) || entry.position !== 0) return;
    const key = String(start);
    validStarts.add(key);
    const detail = details[key];
    if (detail) {
      detail.poles = Number(entry.size) && Number(entry.size) > 0 ? Number(entry.size) : detail.poles;
      detail.deviceType = branchType;
    } else {
      const created = ensureBreakerDetail(panel, start);
      created.poles = Number(entry.size) && Number(entry.size) > 0 ? Number(entry.size) : created.poles;
    }
  });
  Object.keys(details).forEach(key => {
    if (!validStarts.has(key)) {
      delete details[key];
    }
  });
  return { layout: panel.breakerLayout, changed };
}

export function getBreakerBlock(panel, circuit) {
  if (!panel || !Array.isArray(panel.breakerLayout)) return null;
  if (!Number.isFinite(circuit) || circuit < 1) return null;
  return panel.breakerLayout[circuit - 1] || null;
}

export function getLayoutPoleCount(panel, startCircuit) {
  const block = getBreakerBlock(panel, startCircuit);
  if (!block || block.position !== 0) return null;
  const size = Number(block.size);
  return Number.isFinite(size) && size > 0 ? size : null;
}

export function getBlockCircuits(panel, block, circuitCount) {
  if (!block) return [];
  const size = Number(block.size);
  const start = Number(block.start);
  if (!Number.isFinite(size) || !Number.isFinite(start) || size <= 0 || start < 1) return [];
  const total = Number.isFinite(circuitCount) && circuitCount > 0
    ? circuitCount
    : resolveCircuitCount(panel);
  return computeBreakerSpan(start, size, total);
}

export function getLoadPoleCount(load, panel) {
  const system = getPanelSystem(panel);
  const candidates = [load?.breakerPoles, load?.poles, load?.poleCount, load?.phaseCount, load?.phases];
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
  return Math.min(poleCount, getPanelPoleLimit(panel));
}

export function getLoadBreakerSpan(load, panel, circuitCount) {
  let start = parsePositiveInt(load?.breaker);
  if (!start) return [];
  const limit = Number.isFinite(circuitCount) && circuitCount > 0
    ? circuitCount
    : (panel ? resolveCircuitCount(panel) : null);

  if (panel) {
    const blockAtSlot = getBreakerBlock(panel, start);
    if (blockAtSlot && Number.isFinite(Number(blockAtSlot.start)) && Number(blockAtSlot.start) !== start) {
      start = Number(blockAtSlot.start);
    }
    const startBlock = getBreakerBlock(panel, start);
    if (startBlock && startBlock.position === 0) {
      const blockSpan = getBlockCircuits(panel, startBlock, limit ?? resolveCircuitCount(panel));
      if (blockSpan.length) return blockSpan;
    }
    const layoutPoles = getLayoutPoleCount(panel, start);
    if (Number.isFinite(layoutPoles) && layoutPoles > 0) {
      return computeBreakerSpan(start, layoutPoles, limit);
    }
  }

  return computeBreakerSpan(start, Math.max(1, getLoadPoleCount(load, panel)), limit);
}

export function initializeLayoutFromLoads(panel, panelId, loads, circuitCount) {
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

export function sanitizeDcLoadBreakerPoles(loads, panel, panelId) {
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

export function ensurePanelBreakerCapacity(panel, circuitCount) {
  if (!panel) return;
  if (!Array.isArray(panel.breakers)) panel.breakers = [];
  if (!Number.isFinite(circuitCount) || circuitCount <= 0) return;
  if (panel.breakers.length >= circuitCount) return;
  for (let i = panel.breakers.length; i < circuitCount; i++) {
    panel.breakers[i] = null;
  }
}

export function clearPanelBreakerAssignments(panel, loadTag) {
  if (!panel || !Array.isArray(panel.breakers) || !loadTag) return;
  for (let i = 0; i < panel.breakers.length; i++) {
    if (panel.breakers[i] === loadTag) panel.breakers[i] = null;
  }
}

export function applyPanelBreakerAssignments(panel, loadTag, span) {
  if (!panel || !Array.isArray(panel.breakers) || !loadTag) return;
  span.forEach(slot => {
    const index = slot - 1;
    if (index >= 0 && index < panel.breakers.length) panel.breakers[index] = loadTag;
  });
}
