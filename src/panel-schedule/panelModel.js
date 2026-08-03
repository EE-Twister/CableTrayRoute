export const DEFAULT_PANEL_CIRCUIT_COUNT = 42;
export const MAX_PANEL_CIRCUITS = 512;

export function getPanelIdentifierCandidates(panel) {
  if (!panel) return [];
  return [panel.id, panel.ref, panel.panel_id, panel.tag]
    .map(value => (value == null ? null : String(value)))
    .filter(Boolean);
}

export function panelMatchesIdentifier(panel, identifier) {
  if (!panel || identifier == null) return false;
  const normalized = String(identifier).toLowerCase();
  if (!normalized) return false;
  return getPanelIdentifierCandidates(panel)
    .some(value => value.toLowerCase() === normalized);
}

export function findPanelByIdentifier(panels, identifier) {
  if (!Array.isArray(panels) || !identifier) return null;
  return panels.find(panel => panelMatchesIdentifier(panel, identifier)) || null;
}

export function generatePanelId(panels) {
  const used = new Set();
  if (Array.isArray(panels)) {
    panels.forEach(panel => {
      getPanelIdentifierCandidates(panel).forEach(value => used.add(value));
    });
  }
  let max = 0;
  used.forEach(value => {
    const match = /^P(\d+)$/i.exec(value || '');
    if (!match) return;
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) max = Math.max(max, parsed);
  });
  let candidateNumber = Math.max(1, max + 1);
  while (used.has(`P${candidateNumber}`)) candidateNumber++;
  return `P${candidateNumber}`;
}

export function getPanelDisplayName(panel, index = 0) {
  if (!panel) return `Panel ${index + 1}`;
  const candidates = [panel.ref, panel.panel_id, panel.tag, panel.id];
  for (const candidate of candidates) {
    if (candidate != null && String(candidate).trim()) return String(candidate);
  }
  return `Panel ${index + 1}`;
}

export function formatPanelSelectorLabel(panel, index = 0) {
  const base = getPanelDisplayName(panel, index);
  const meta = [];
  const voltage = panel?.voltage;
  if (voltage && String(voltage).trim()) {
    const trimmed = String(voltage).trim();
    meta.push(/v$/i.test(trimmed) ? trimmed : `${trimmed} V`);
  }
  const fed = panel?.fedFrom || panel?.fed_from;
  if (fed) meta.push(`Fed from ${fed}`);
  return meta.length ? `${base} (${meta.join(' • ')})` : base;
}

export function clonePanelState(panel) {
  if (!panel) return null;
  try {
    return structuredClone(panel);
  } catch {
    return { ...panel };
  }
}

export function duplicatePanelDefinition(panel, panels, circuitCount = DEFAULT_PANEL_CIRCUIT_COUNT) {
  if (!panel) return null;
  const clone = clonePanelState(panel) || {};
  clone.id = generatePanelId(panels);
  const copyLabel = `${getPanelDisplayName(panel) || clone.id} Copy`;
  clone.ref = copyLabel;
  clone.panel_id = copyLabel;
  clone.tag = copyLabel;
  clone.breakers = Array.from({ length: circuitCount }, () => null);
  clone.breakerLayout = Array.isArray(panel.breakerLayout)
    ? panel.breakerLayout.map(entry => (entry ? { ...entry } : null))
    : [];
  clone.breakerDetails = panel.breakerDetails && typeof panel.breakerDetails === 'object'
    ? Object.fromEntries(Object.entries(panel.breakerDetails).map(([key, detail]) => [
      key,
      detail && typeof detail === 'object' ? { ...detail } : detail
    ]))
    : {};
  return clone;
}
