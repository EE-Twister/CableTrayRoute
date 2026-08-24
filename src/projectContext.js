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
