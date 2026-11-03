export function normalizeActiveProjectName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && name.toLowerCase() !== 'default' ? name : '';
}

export function resolveActiveProjectName(...candidates) {
  for (const candidate of candidates) {
    const name = normalizeActiveProjectName(candidate);
    if (name) return name;
  }
  return '';
}

export function recoverActiveProjectName({ hashName, currentProjectId, readStoredProjectName, onReadError } = {}) {
  let storedProjectName = '';
  try {
    storedProjectName = typeof readStoredProjectName === 'function' ? readStoredProjectName() : '';
  } catch (error) {
    if (typeof onReadError === 'function') onReadError(error);
  }
  return resolveActiveProjectName(hashName, currentProjectId, storedProjectName);
}

/**
 * Choose a project name for a file imported while no project is active:
 * the file name without its `.ctr.json` / `.json` extension, made unique
 * against existing saved projects with a " (2)", " (3)", ... suffix.
 * @param {string} fileName
 * @param {string[]} existingNames
 * @returns {string}
 */
export function importedProjectName(fileName, existingNames = []) {
  const stem = String(fileName || '')
    .replace(/^.*[\\/]/, '')
    .replace(/(\.ctr)?\.json$/i, '')
    .trim();
  const base = normalizeActiveProjectName(stem) || 'Imported Project';
  const used = new Set((existingNames || []).map(name => String(name).trim().toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  let copy = 2;
  while (used.has(`${base} (${copy})`.toLocaleLowerCase())) copy += 1;
  return `${base} (${copy})`;
}
