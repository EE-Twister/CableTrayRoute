const ID_PATTERN = /^DP-(\d+)$/i;
const MAX_PANEL_NUMBER = Number.MAX_SAFE_INTEGER;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function issue(path, message) {
  return { code: 'INVALID_PANEL_IDENTITY_BASELINE', path, message, severity: 'blocking' };
}

function normalizedId(value) {
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizedPanelId(value) {
  const text = normalizedId(value);
  const match = text?.match(ID_PATTERN);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_PANEL_NUMBER) return null;
  return `DP-${String(number).padStart(2, '0')}`;
}

function loadKey(value) {
  const text = normalizedId(value);
  return text ? text.toLowerCase() : null;
}

function loadIds(group, path) {
  const values = Array.isArray(group?.loadIds)
    ? group.loadIds
    : Array.isArray(group?.loads)
      ? group.loads.map(load => object(load) ? load.id : load)
      : null;
  if (!values) return { ids: null, issue: issue(path, 'Panel group must provide loadIds or loads.') };
  const ids = values.map(normalizedId);
  if (ids.some(id => !id)) return { ids: null, issue: issue(path, 'Panel group load IDs must be non-empty.') };
  if (new Set(ids.map(loadKey)).size !== ids.length) return { ids: null, issue: issue(path, 'Panel group load IDs must be unique, ignoring case.') };
  return { ids: [...ids].sort((a, b) => a.localeCompare(b)), issue: null };
}

function baselinePanels(value, issues) {
  if (value === undefined) return { panels: [], nextPanelNumber: 1 };
  if (value === null) {
    issues.push(issue('generationBaseline', 'generationBaseline must be omitted or an object; null is invalid.'));
    return { panels: [], nextPanelNumber: 1 };
  }
  if (!object(value)) {
    issues.push(issue('generationBaseline', 'generationBaseline must be an object.'));
    return { panels: [], nextPanelNumber: 1 };
  }
  const allowed = new Set(['panels', 'nextPanelNumber']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(issue(`generationBaseline.${key}`, `Unknown generationBaseline field ${key}.`));
  if (!Array.isArray(value.panels)) issues.push(issue('generationBaseline.panels', 'generationBaseline.panels must be an array.'));
  const panels = [];
  const seenIds = new Set();
  const seenLoads = new Set();
  for (const [index, panel] of (Array.isArray(value.panels) ? value.panels : []).entries()) {
    const path = `generationBaseline.panels[${index}]`;
    if (!object(panel)) { issues.push(issue(path, 'Baseline panel must be an object.')); continue; }
    for (const key of Object.keys(panel)) if (!['id', 'loadIds'].includes(key)) issues.push(issue(`${path}.${key}`, `Unknown baseline panel field ${key}.`));
    const rawId = normalizedId(panel.id);
    const id = normalizedPanelId(panel.id);
    const match = rawId?.match(ID_PATTERN);
    if (!id || !match) issues.push(issue(`${path}.id`, 'Baseline panel id must match DP-NN.'));
    if (id && seenIds.has(id.toLowerCase())) issues.push(issue(`${path}.id`, `Duplicate baseline panel id ${id}.`));
    if (id) seenIds.add(id.toLowerCase());
    const parsed = loadIds(panel, path);
    if (parsed.issue) issues.push(parsed.issue);
    if (parsed.ids && !parsed.ids.length) issues.push(issue(`${path}.loadIds`, 'Baseline panel loadIds must not be empty.'));
    if (parsed.ids) for (const loadId of parsed.ids) {
      const key = loadKey(loadId);
      if (seenLoads.has(key)) issues.push(issue(`${path}.loadIds`, `Load ${loadId} appears in multiple baseline panels.`));
      seenLoads.add(key);
    }
    if (id && match && parsed.ids) panels.push({ id, loadIds: parsed.ids });
  }
  const next = value.nextPanelNumber;
  if (!Number.isSafeInteger(next) || next < 1 || next > MAX_PANEL_NUMBER) issues.push(issue('generationBaseline.nextPanelNumber', 'nextPanelNumber must be a positive safe integer.'));
  const highwater = panels.reduce((max, panel) => Math.max(max, Number(panel.id.match(ID_PATTERN)[1]) + 1), 1);
  if (Number.isSafeInteger(next) && next < highwater) issues.push(issue('generationBaseline.nextPanelNumber', `nextPanelNumber must be at least ${highwater} for the existing panel IDs.`));
  return { panels, nextPanelNumber: Number.isSafeInteger(next) && next >= highwater ? next : highwater };
}

function setKey(ids) {
  return JSON.stringify(ids.map(loadKey).sort());
}

/**
 * Assign deterministic panel identities while retaining prior identities when
 * membership is unchanged or still overlaps. Removed identities are never
 * reused. The input groups and baseline are never mutated.
 */
export function buildDesignSynthesisPanelIdentityPlan(groups = [], generationBaseline = undefined) {
  const issues = [];
  if (!Array.isArray(groups)) issues.push(issue('groups', 'groups must be an array.'));
  const normalizedGroups = [];
  const seenLoads = new Set();
  for (const [index, group] of (Array.isArray(groups) ? groups : []).entries()) {
    const parsed = loadIds(group, `groups[${index}]`);
    if (parsed.issue) { issues.push(parsed.issue); continue; }
    if (!parsed.ids.length) { issues.push(issue(`groups[${index}].loadIds`, 'Panel group loadIds must not be empty.')); continue; }
    for (const loadId of parsed.ids) {
      const key = loadKey(loadId);
      if (seenLoads.has(key)) issues.push(issue(`groups[${index}].loadIds`, `Load ${loadId} appears in multiple groups.`));
      seenLoads.add(key);
    }
    normalizedGroups.push({ index, loadIds: parsed.ids });
  }
  const baseline = baselinePanels(generationBaseline, issues);
  if (issues.length) return { ok: false, issues, groups: [], assignments: [], updatedBaseline: null };

  const byExact = new Map(baseline.panels.map(panel => [setKey(panel.loadIds), panel]));
  const used = new Set();
  const assignments = new Array(normalizedGroups.length);
  normalizedGroups.forEach((group, index) => {
    const exact = byExact.get(setKey(group.loadIds));
    if (exact && !used.has(exact.id)) { assignments[index] = exact.id; used.add(exact.id); }
  });
  normalizedGroups.forEach((group, index) => {
    if (assignments[index]) return;
    const candidates = baseline.panels
      .filter(panel => !used.has(panel.id))
      .map(panel => ({ panel, overlap: group.loadIds.filter(id => panel.loadIds.some(candidate => loadKey(candidate) === loadKey(id))).length }))
      .filter(item => item.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || a.panel.loadIds.length - b.panel.loadIds.length || a.panel.id.localeCompare(b.panel.id));
    if (candidates.length) { assignments[index] = candidates[0].panel.id; used.add(candidates[0].panel.id); }
  });
  let next = baseline.nextPanelNumber;
  normalizedGroups.forEach((group, index) => {
    if (assignments[index]) return;
    if (next >= MAX_PANEL_NUMBER) {
      issues.push(issue('generationBaseline.nextPanelNumber', 'Panel identity allocation exceeded the safe integer limit.'));
      return;
    }
    assignments[index] = `DP-${String(next++).padStart(2, '0')}`;
  });
  if (issues.length) return { ok: false, issues, groups: [], assignments: [], updatedBaseline: null, distributionBaseline: null };
  const plannedGroups = normalizedGroups.map((group, index) => {
    const source = object(groups[group.index]) ? structuredClone(groups[group.index]) : {};
    return { ...source, id: assignments[index], panelId: assignments[index], loadIds: [...group.loadIds] };
  });
  const updatedBaseline = { panels: plannedGroups.map(group => ({ id: group.id, loadIds: [...group.loadIds] })), nextPanelNumber: next };
  return { ok: true, issues: [], groups: plannedGroups, assignments, updatedBaseline, distributionBaseline: updatedBaseline };
}

export default { buildDesignSynthesisPanelIdentityPlan };
