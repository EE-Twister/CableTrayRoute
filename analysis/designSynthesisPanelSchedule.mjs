const DEFAULT_PANEL_CIRCUIT_COUNT = 42;
const MAX_PANEL_CIRCUITS = 512;

function positiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Same odd/even panel-space convention used by Panel Schedule's phase model. */
export function computeDesignSynthesisBreakerSpan(startCircuit, poleCount, circuitCount) {
  const start = positiveInteger(startCircuit);
  const poles = positiveInteger(poleCount);
  if (!start || !poles) return [];
  const limit = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : null;
  const step = poles > 1 ? 2 : 1;
  const span = [];
  for (let position = 0; position < poles; position += 1) {
    const circuit = start + position * step;
    if (limit && circuit > limit) return [];
    span.push(circuit);
  }
  return span;
}

function loadPoleCount(load) {
  const phases = positiveInteger(load?.phases);
  return phases ? Math.min(3, phases) : 1;
}

function selectedDevicePoles(device) {
  const raw = device?.poles;
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return values.map(positiveInteger).filter(Boolean);
}

/**
 * Populate a deterministic preliminary circuit-space assignment for generated
 * panels. This is schedule linkage only; it does not qualify panel equipment.
 */
export function applyDesignSynthesisPanelSchedule({ loads = [], panels = [], cables = [] } = {}) {
  const issues = [];
  const cablesByLoad = new Map((Array.isArray(cables) ? cables : [])
    .filter(cable => cable?.loadId != null)
    .map(cable => [String(cable.loadId), cable]));
  const loadsById = new Map((Array.isArray(loads) ? loads : [])
    .filter(load => load?.id != null)
    .map(load => [String(load.id), load]));

  for (const panel of Array.isArray(panels) ? panels : []) {
    const memberIds = Array.isArray(panel?.loadIds) ? panel.loadIds.map(String) : [];
    const members = memberIds.map(id => loadsById.get(id));
    if (members.some(load => !load) || new Set(memberIds).size !== memberIds.length) {
      issues.push({ code: 'PANEL_SCHEDULE_MEMBERSHIP_INVALID', panelId: panel?.id || null, loadIds: memberIds });
      continue;
    }

    const occupied = new Array(MAX_PANEL_CIRCUITS + 1).fill(null);
    const assignments = [];
    let highestCircuit = 0;
    for (const load of members) {
      const poles = loadPoleCount(load);
      const cable = cablesByLoad.get(String(load.id));
      const devicePoles = selectedDevicePoles(cable?.protectiveDevice);
      if (devicePoles.length && !devicePoles.includes(poles)) {
        issues.push({ code: 'PANEL_SCHEDULE_BRANCH_POLES_UNSUPPORTED', panelId: panel.id, loadId: load.id, requiredPoles: poles, selectedDevicePoles: devicePoles });
        continue;
      }

      let assignment = null;
      for (let start = 1; start <= MAX_PANEL_CIRCUITS; start += 1) {
        const span = computeDesignSynthesisBreakerSpan(start, poles, MAX_PANEL_CIRCUITS);
        if (span.length === poles && span.every(circuit => occupied[circuit] === null)) {
          assignment = { start, span, poles, cable };
          break;
        }
      }
      if (!assignment) {
        issues.push({ code: 'PANEL_SCHEDULE_CAPACITY_EXCEEDED', panelId: panel.id, loadId: load.id, maxPanelCircuits: MAX_PANEL_CIRCUITS });
        continue;
      }
      assignment.span.forEach((circuit, position) => {
        occupied[circuit] = { loadId: load.id, start: assignment.start, size: assignment.poles, position };
      });
      highestCircuit = Math.max(highestCircuit, ...assignment.span);
      assignments.push({ load, ...assignment });
    }

    const circuitCount = Math.max(DEFAULT_PANEL_CIRCUIT_COUNT, highestCircuit);
    const deviceTypes = [...new Set(assignments
      .map(({ cable }) => /fuse/i.test(String(cable?.protectiveDevice?.type || cable?.protectiveDevice?.subtype || '')) ? 'fuse' : 'breaker'))];
    if (deviceTypes.length > 1) {
      issues.push({ code: 'PANEL_SCHEDULE_MIXED_BRANCH_DEVICE_TYPES', panelId: panel.id, deviceTypes });
    }
    panel.circuitCount = circuitCount;
    panel.powerType = 'ac';
    panel.poles = Math.min(3, loadPoleCount({ phases: panel.phases }));
    panel.ref = panel.ref || panel.tag || panel.id;
    panel.fedFrom = panel.fedFrom ?? panel.fed_from ?? '';
    panel.branchDeviceType = deviceTypes[0] || 'breaker';
    panel.breakers = new Array(circuitCount).fill(null);
    panel.breakerLayout = new Array(circuitCount).fill(null);
    panel.breakerDetails = {};
    panel.scheduleBasis = 'design-synthesis-preliminary-circuit-space-screen-v1';
    panel.scheduleStatus = 'screening-only';

    for (const { load, start, span, poles, cable } of assignments) {
      const loadId = String(load.id);
      const loadTag = String(load.tag || load.id);
      // Panel Schedule normalizes assignment IDs to lowercase before matching.
      // Keep panelRef/source as the engine's original display/reference values.
      load.panelId = String(panel.id).toLowerCase();
      load.breaker = start;
      load.breakerPoles = poles;
      span.forEach((circuit, position) => {
        panel.breakers[circuit - 1] = loadTag;
        panel.breakerLayout[circuit - 1] = { start, size: poles, position };
      });
      const device = cable?.protectiveDevice;
      panel.breakerDetails[String(start)] = {
        deviceType: /fuse/i.test(String(device?.type || device?.subtype || '')) ? 'fuse' : 'breaker',
        poles,
        ...(Number.isFinite(Number(device?.tripRatingA)) && Number(device.tripRatingA) > 0
          ? { rating: Number(device.tripRatingA) }
          : Number.isFinite(Number(device?.continuousCurrentA)) && Number(device.continuousCurrentA) > 0
            ? { rating: Number(device.continuousCurrentA) }
            : {}),
        cableTag: cable?.tag || cable?.id || loadId,
        scheduleBasis: 'screening-candidate-only',
      };
    }
  }

  return { ok: issues.length === 0, issues, maxPanelCircuits: MAX_PANEL_CIRCUITS };
}

