function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function rowPath(path, index, id, cable) {
  const normalizedId = id === null || id === undefined ? null : String(id);
  const normalizedCable = cable === null || cable === undefined ? null : String(cable);
  return path === `equipment[${index}]` || path.startsWith(`equipment[${index}].`) || (normalizedId && (path === `equipment.${normalizedId}` || path.startsWith(`equipment.${normalizedId}.`) || path === `load.${normalizedId}` || path.startsWith(`load.${normalizedId}.`) || path === `loads.${normalizedId}` || path.startsWith(`loads.${normalizedId}.`) || path === `C-${normalizedId}` || path.startsWith(`C-${normalizedId}.`))) || (normalizedCable && (normalizedCable === normalizedId || normalizedCable === `C-${normalizedId}`));
}

function compactIssue(item) {
  return { code: item?.code || 'INPUT_ISSUE', path: item?.path || null, cable: item?.cable || null, message: item?.message || item?.detail || String(item?.code || 'Input issue'), severity: item?.severity || 'blocking' };
}

/**
 * Account for every original equipment entry without mutating the source.
 * acceptedIds/acceptedIndices identify rows that the generator actually built.
 */
export function buildDesignSynthesisLoadDispositions(input = {}, { issues = [], acceptedIds = [], acceptedIndices = [] } = {}) {
  const equipment = Array.isArray(input?.equipment) ? input.equipment : [];
  const acceptedIdSet = new Set(acceptedIds.map(value => String(value)));
  const acceptedIndexSet = new Set(acceptedIndices.map(value => Number(value)));
  const idCounts = new Map();
  equipment.forEach(entry => { if (isObject(entry) && entry.id !== undefined && entry.id !== null) { const id = String(entry.id); idCounts.set(id, (idCounts.get(id) || 0) + 1); } });
  const allIssues = (Array.isArray(issues) ? issues : []).map(compactIssue);
  const globalBlockingIssues = allIssues.filter(item => item.severity === 'blocking' && !equipment.some((entry, index) => rowPath(item.path || '', index, isObject(entry) && entry.id !== undefined && entry.id !== null ? String(entry.id) : null, item.cable)));
  const loadDispositions = equipment.map((entry, inputIndex) => {
    const id = isObject(entry) && entry.id !== undefined && entry.id !== null ? String(entry.id) : null;
    const tag = isObject(entry) && entry.tag !== undefined && entry.tag !== null ? String(entry.tag) : null;
    const rowIssues = allIssues.filter(item => rowPath(item.path || '', inputIndex, id, item.cable));
    const invalidRow = !isObject(entry) || rowIssues.some(item => item.severity === 'blocking');
    const accepted = !invalidRow && !globalBlockingIssues.length && (acceptedIndexSet.has(inputIndex) || (id !== null && idCounts.get(id) === 1 && acceptedIdSet.has(id)));
    const status = invalidRow ? 'rejected' : (accepted ? 'accepted' : 'deferred');
    return { inputIndex, id, tag, status, issues: rowIssues, original: cloneJson(entry) };
  });
  return { loadDispositions, globalBlockingIssues };
}

export default { buildDesignSynthesisLoadDispositions };
