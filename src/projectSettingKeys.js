// Project settings share legacy storage with application state. Keep that
// namespace boundary independent of the importer so load and history paths
// enforce the same rule before mirroring a setting into raw storage.
const PROJECT_STORAGE_ALIASES = new Set([
  'cableSchedule', 'traySchedule', 'conduitSchedule', 'ductbankSchedule',
  'cableTypicals', 'ctrSession'
]);
const APPLICATION_KEYS = new Set([
  'authToken', 'authCsrfToken', 'authExpiresAt', 'authUser', 'gistToken',
  'onelineTourDone', '__proto__', 'constructor', 'prototype'
]);

export function isProjectSettingKey(key) {
  return typeof key === 'string'
    && key.length > 0
    && !key.includes(':')
    && !key.startsWith('CTR_')
    && !key.startsWith('ctr')
    && !key.startsWith('tour_done_')
    && !APPLICATION_KEYS.has(key)
    && !PROJECT_STORAGE_ALIASES.has(key);
}

// These aliases remain supported by the explicit project/scenario APIs, but
// cannot appear inside settings and override authoritative collection mirrors.
export function isProjectStorageKey(key) {
  return PROJECT_STORAGE_ALIASES.has(key) || isProjectSettingKey(key);
}

export function sanitizeProjectSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
  return Object.fromEntries(Object.entries(settings).filter(([key]) => isProjectSettingKey(key)));
}
