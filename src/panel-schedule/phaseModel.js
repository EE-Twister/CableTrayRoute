export const DC_PHASE_LABELS = ['+', '−'];
export const SINGLE_PHASE_LABELS = ['A', 'B'];
export const THREE_PHASE_LABELS = ['A', 'B', 'C'];
const FALLBACK_DC_SEQUENCE = ['+', '−'];

export function resolveDcSequence(sequence) {
  return Array.isArray(sequence) && sequence.length >= 2 ? sequence : FALLBACK_DC_SEQUENCE;
}

export function getDcPolarityForCircuit(circuit, sequence = DC_PHASE_LABELS) {
  const slot = Number.parseInt(circuit, 10);
  if (!Number.isFinite(slot) || slot < 1) return '';
  const normalized = resolveDcSequence(sequence);
  const positive = normalized[0] ?? FALLBACK_DC_SEQUENCE[0];
  const negative = normalized[1] ?? FALLBACK_DC_SEQUENCE[1];
  const label = Math.floor((slot - 1) / 2) % 2 === 0 ? positive : negative;
  return label == null ? '' : String(label);
}

export function getMaxBranchPoleCount(system) {
  return system === 'dc' ? 2 : 3;
}

export function getAllowedBranchPoleCounts(system, maxPoles = null) {
  const systemMax = getMaxBranchPoleCount(system);
  const limit = Number.isFinite(maxPoles) && maxPoles > 0 ? Math.min(systemMax, maxPoles) : systemMax;
  return Array.from({ length: Math.max(1, limit) }, (_, index) => index + 1);
}

export function clampBreakerPolesForSystem(system, poles, maxPoles = null) {
  if (!Number.isFinite(poles) || poles < 1) return 1;
  const systemMax = getMaxBranchPoleCount(system);
  const limit = Number.isFinite(maxPoles) && maxPoles > 0 ? Math.min(systemMax, maxPoles) : systemMax;
  return Math.min(poles, Math.max(1, limit));
}

export function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getPanelCircuitCount(panel, defaultCount = 42, maximumCount = 512) {
  const parsed = parsePositiveInt(panel?.circuitCount);
  const fallback = parsePositiveInt(defaultCount) || 42;
  const maximum = parsePositiveInt(maximumCount) || 512;
  if (parsed) return Math.min(maximum, parsed);
  if (Array.isArray(panel?.breakers) && panel.breakers.length > 0) return Math.min(maximum, panel.breakers.length);
  return fallback;
}

export function getPanelSystem(panel) {
  const raw = String(panel?.powerType || panel?.systemType || panel?.type || '').toLowerCase();
  return raw === 'dc' ? 'dc' : 'ac';
}

export function getPanelBranchDeviceType(panel) {
  return panel?.branchDeviceType === 'fuse' ? 'fuse' : 'breaker';
}

export function getPanelPoleLimit(panel) {
  const system = getPanelSystem(panel);
  const systemMax = getMaxBranchPoleCount(system);
  const configured = parsePositiveInt(panel?.poles);
  return configured ? Math.min(systemMax, configured) : systemMax;
}

export function getPanelPhaseSequence(panel) {
  const system = getPanelSystem(panel);
  const poleLimit = getPanelPoleLimit(panel) || 1;
  if (system === 'dc') {
    return resolveDcSequence(DC_PHASE_LABELS).slice(0, Math.max(1, Math.min(2, poleLimit)));
  }
  const phases = Number.parseInt(panel?.phases, 10);
  const sequence = Number.isFinite(phases) && phases <= 2 ? SINGLE_PHASE_LABELS : THREE_PHASE_LABELS;
  return sequence.slice(0, Math.max(1, Math.min(sequence.length, poleLimit)));
}

export function computeBreakerSpan(startCircuit, poleCount, circuitCount) {
  const start = parsePositiveInt(startCircuit);
  const poles = parsePositiveInt(poleCount);
  if (!start || !poles) return [];
  const limit = Number.isFinite(circuitCount) && circuitCount > 0 ? circuitCount : null;
  const step = poles > 1 ? 2 : 1;
  const span = [];
  for (let position = 0; position < poles; position++) {
    const circuit = start + position * step;
    if (limit && circuit > limit) return [];
    span.push(circuit);
  }
  return span;
}
