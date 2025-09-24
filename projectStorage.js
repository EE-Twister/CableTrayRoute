const PROJECT_KEY = 'CTR_PROJECT_V1';
const SCENARIOS_KEY = 'ctr_scenarios_v1';
const CURRENT_SCENARIO_KEY = 'ctr_current_scenario_v1';
const SAVED_PROJECTS_KEY = 'CTR_SAVED_PROJECTS_V1';
const CONDUIT_CACHE_KEY = 'CTR_CONDUITS';
const AUTH_TOKEN_KEY = 'authToken';
const AUTH_CSRF_KEY = 'authCsrfToken';
const AUTH_EXPIRES_KEY = 'authExpiresAt';
const AUTH_USER_KEY = 'authUser';
const FAST_JSON_PATCH_URL = (() => {
  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL('dist/vendor/fast-json-patch.mjs', document.baseURI).href;
  }
  if (typeof location !== 'undefined' && location.href) {
    return new URL('dist/vendor/fast-json-patch.mjs', location.href).href;
  }
  return './dist/vendor/fast-json-patch.mjs';
})();

function defaultProject() {
  return {
    name: '',
    ductbanks: [],
    conduits: [],
    trays: [],
    cables: [],
    settings: { session: {}, collapsedGroups: {}, units: 'imperial' }
  };
}

function migrateProject(old = {}) {
  const settings = old.settings || {
    session: old.session || old.ctrSession || {},
    collapsedGroups: old.collapsedGroups || {}
  };
  if (!settings.units) settings.units = 'imperial';
  return {
    name: old.name || '',
    ductbanks: old.ductbanks || old.ductbankSchedule || [],
    conduits: old.conduits || old.conduitSchedule || [],
    trays: old.trays || old.traySchedule || [],
    cables: old.cables || old.cableSchedule || [],
    settings
  };
}

let project = defaultProject();
let compare;
let applyPatch;
let jsonPatchPromise;
const undoStack = [];
const redoStack = [];
let trackedSettingsKeys = new Set();
const listeners = new Set();
const memoryStorage = new Map();
let storageWriteBlocked = false;
let quotaWarningShown = false;
const MAX_SCENARIO_ENTRY_SIZE = 2.5 * 1024 * 1024;
const scenarioSizeWarnings = new Set();
let scenarioListCache = ['base'];
let currentScenarioName = 'base';
let conduitCacheState = null;
let savedProjectsCache = {};
let savedProjectsLoaded = false;
let savedProjectsError = null;
const migratedSavedProjects = new Set();

function readRawStorage(key) {
  const storage = getStorage();
  if (storage) {
    const value = safeGet(storage, key);
    if (value !== null && value !== undefined) return value;
  }
  return memoryStorage.has(key) ? memoryStorage.get(key) : null;
}

function writeRawStorage(key, value, options = {}) {
  const skipLocalStorage = Boolean(options && options.skipLocalStorage);
  if (value === null || value === undefined) {
    memoryStorage.delete(key);
  } else {
    memoryStorage.set(key, value);
  }
  const storage = getStorage();
  if (!storage || storageWriteBlocked) return;
  if (skipLocalStorage && value !== null && value !== undefined) return;
  try {
    if (value === null || value === undefined) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch (e) {
    handleStorageWriteError('project storage write failed', key, e);
  }
}

function listPrefixedKeys(prefix) {
  const keys = new Set();
  const storage = getStorage();
  if (storage) {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        keys.add(key.slice(prefix.length));
      }
    } catch (e) {
      console.warn('project storage enumerate failed', e);
    }
  }
  for (const key of memoryStorage.keys()) {
    if (key.startsWith(prefix)) keys.add(key.slice(prefix.length));
  }
  return [...keys];
}

function sanitizeScenarioName(name) {
  if (typeof name !== 'string') return '';
  return name.trim();
}

function ensureScenarioList(list) {
  const normalized = Array.isArray(list) ? list.map(sanitizeScenarioName).filter(Boolean) : [];
  if (!normalized.length) normalized.push('base');
  return [...new Set(normalized)];
}

function persistScenarioState() {
  scenarioListCache = ensureScenarioList(scenarioListCache);
  if (!scenarioListCache.includes(currentScenarioName)) {
    scenarioListCache.push(currentScenarioName);
  }
  writeRawStorage(SCENARIOS_KEY, JSON.stringify(scenarioListCache));
  writeRawStorage(CURRENT_SCENARIO_KEY, currentScenarioName);
}

function loadScenarioState() {
  const storedList = safeParse(readRawStorage(SCENARIOS_KEY), ['base']);
  scenarioListCache = ensureScenarioList(storedList);
  const storedCurrent = readRawStorage(CURRENT_SCENARIO_KEY);
  const nextCurrent = sanitizeScenarioName(typeof storedCurrent === 'string' ? storedCurrent : '');
  currentScenarioName = nextCurrent || scenarioListCache[0] || 'base';
  if (!scenarioListCache.includes(currentScenarioName)) scenarioListCache.push(currentScenarioName);
  persistScenarioState();
}

function scenarioStorageKey(scenario, key) {
  return `${scenario}:${key}`;
}

function readScenarioRaw(scenario, key) {
  return readRawStorage(scenarioStorageKey(scenario, key));
}

function writeScenarioRaw(scenario, key, value, options) {
  writeRawStorage(scenarioStorageKey(scenario, key), value, options);
}

function getAllStorageKeys() {
  const keys = new Set();
  const storage = getStorage();
  if (storage) {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key) keys.add(key);
      }
    } catch (e) {
      console.warn('project storage enumerate failed', e);
    }
  }
  for (const key of memoryStorage.keys()) keys.add(key);
  return [...keys];
}

export function getScenarioListState() {
  return [...scenarioListCache];
}

export function setScenarioListState(list) {
  scenarioListCache = ensureScenarioList(list);
  if (!scenarioListCache.includes(currentScenarioName)) scenarioListCache.push(currentScenarioName);
  persistScenarioState();
}

export function registerScenario(name) {
  const normalized = sanitizeScenarioName(name);
  if (!normalized) return;
  if (!scenarioListCache.includes(normalized)) {
    scenarioListCache.push(normalized);
    persistScenarioState();
  }
}

export function getCurrentScenarioNameState() {
  return currentScenarioName;
}

export function setCurrentScenarioNameState(name) {
  const normalized = sanitizeScenarioName(name) || 'base';
  currentScenarioName = normalized;
  if (!scenarioListCache.includes(normalized)) scenarioListCache.push(normalized);
  persistScenarioState();
}

export function readScenarioValue(key, fallback, scenario = currentScenarioName) {
  const target = sanitizeScenarioName(scenario) || currentScenarioName;
  const raw = readScenarioRaw(target, key);
  if (raw === null || raw === undefined) return fallback;
  return safeParse(raw, fallback);
}

export function writeScenarioValue(key, value, scenario = currentScenarioName) {
  const target = sanitizeScenarioName(scenario) || currentScenarioName;
  try {
    const serialized = JSON.stringify(value);
    const storageKey = scenarioStorageKey(target, key);
    if (serialized.length > MAX_SCENARIO_ENTRY_SIZE) {
      writeScenarioRaw(target, key, serialized, { skipLocalStorage: true });
      if (target === currentScenarioName) {
        setProjectKey(key, serialized, { skipLocalStorage: true });
      }
      if (!scenarioSizeWarnings.has(storageKey)) {
        scenarioSizeWarnings.add(storageKey);
        const limitMb = (MAX_SCENARIO_ENTRY_SIZE / (1024 * 1024)).toFixed(1);
        console.warn(`Scenario entry "${storageKey}" exceeds ${limitMb}MB. Data will persist for this tab only; use Save Project to keep a copy.`);
      }
      return;
    }
    writeScenarioRaw(target, key, serialized);
    if (target === currentScenarioName) {
      setProjectKey(key, serialized);
    }
  } catch (e) {
    console.error('scenario write failed', key, e);
  }
}

export function removeScenarioValue(key, scenario = currentScenarioName) {
  const target = sanitizeScenarioName(scenario) || currentScenarioName;
  writeScenarioRaw(target, key, null);
  if (target === currentScenarioName) {
    removeProjectKey(key);
  }
}

export function listScenarioKeysState(scenario = currentScenarioName) {
  const target = sanitizeScenarioName(scenario) || currentScenarioName;
  return listPrefixedKeys(`${target}:`);
}

export function cloneScenarioStorage(from, to) {
  const source = sanitizeScenarioName(from) || currentScenarioName;
  const target = sanitizeScenarioName(to);
  if (!target) return;
  const keys = listScenarioKeysState(source);
  for (const key of keys) {
    const raw = readScenarioRaw(source, key);
    if (raw === null || raw === undefined) continue;
    writeScenarioRaw(target, key, raw);
    if (target === currentScenarioName) {
      setProjectKey(key, raw);
    }
  }
}

const SAVED_PROJECT_SUFFIXES = ['equipment', 'panels', 'loads', 'cables', 'raceways', 'oneLine'];
const SAVED_PROJECT_PRIMARY_SUFFIXES = new Set(SAVED_PROJECT_SUFFIXES.filter(suffix => suffix !== 'equipment'));

class SavedProjectMigrationError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SavedProjectMigrationError';
    if (cause) this.cause = cause;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneSavedProjectValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function cloneSavedProjectRecord(record) {
  return JSON.parse(JSON.stringify(record || {}));
}

function loadSavedProjectsBlob() {
  const raw = readRawStorage(SAVED_PROJECTS_KEY);
  if (raw === null || raw === undefined) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new SavedProjectMigrationError('Saved projects could not be read because the stored data is corrupted. Clear the saved projects entry in browser storage and try again.', e);
  }
  if (!isPlainObject(parsed)) {
    throw new SavedProjectMigrationError('Saved projects could not be read because the stored data is in an unexpected format.');
  }
  return parsed;
}

function migrateLegacySavedProjects() {
  const legacyRecords = new Map();
  const suffixes = new Set(SAVED_PROJECT_SUFFIXES);
  for (const key of getAllStorageKeys()) {
    const idx = key.indexOf(':');
    if (idx <= 0) continue;
    const suffix = key.slice(idx + 1);
    if (!suffixes.has(suffix)) continue;
    const name = key.slice(0, idx);
    let entry = legacyRecords.get(name);
    if (!entry) {
      entry = { data: {}, suffixes: new Set(), keys: [] };
      legacyRecords.set(name, entry);
    }
    entry.keys.push(key);
    entry.suffixes.add(suffix);
    const raw = readRawStorage(key);
    if (raw === null || raw === undefined) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new SavedProjectMigrationError(`Saved project "${name}" could not be migrated because the "${suffix}" section is corrupted. Clear the saved project from browser storage and save again.`, e);
    }
    entry.data[suffix] = parsed;
  }

  if (!legacyRecords.size) return null;

  const migrated = {};
  const keysToRemove = [];
  for (const [name, entry] of legacyRecords) {
    const hasPrimary = [...entry.suffixes].some(suffix => SAVED_PROJECT_PRIMARY_SUFFIXES.has(suffix));
    if (!hasPrimary) continue;
    if (!Object.keys(entry.data).length) continue;
    migrated[name] = cloneSavedProjectRecord(entry.data);
    keysToRemove.push(...entry.keys);
  }

  if (!Object.keys(migrated).length) return null;
  return { records: migrated, keysToRemove };
}

function persistSavedProjects() {
  if (savedProjectsError) throw savedProjectsError;
  const names = Object.keys(savedProjectsCache);
  if (!names.length) {
    writeRawStorage(SAVED_PROJECTS_KEY, null);
    return;
  }
  try {
    writeRawStorage(SAVED_PROJECTS_KEY, JSON.stringify(savedProjectsCache));
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const wrapped = error instanceof SavedProjectMigrationError
      ? error
      : new SavedProjectMigrationError('Saved projects could not be written to storage.', error);
    savedProjectsError = wrapped;
    throw wrapped;
  }
}

function ensureSavedProjectsCache() {
  if (savedProjectsLoaded) return;
  savedProjectsLoaded = true;
  savedProjectsError = null;
  migratedSavedProjects.clear();
  try {
    const existing = loadSavedProjectsBlob();
    const migration = migrateLegacySavedProjects();
    if (migration) {
      const existingNames = new Set(Object.keys(existing));
      for (const name of Object.keys(migration.records)) {
        if (!existingNames.has(name)) {
          migratedSavedProjects.add(name);
        }
      }
      savedProjectsCache = { ...migration.records, ...existing };
      persistSavedProjects();
      for (const key of migration.keysToRemove) {
        writeRawStorage(key, null);
      }
    } else {
      savedProjectsCache = existing;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    savedProjectsError = error;
    savedProjectsCache = {};
    console.error('Saved project initialization failed', error);
  }
}

export function getSavedProjectsError() {
  ensureSavedProjectsCache();
  return savedProjectsError;
}

export function listSavedProjects() {
  ensureSavedProjectsCache();
  if (savedProjectsError) return [];
  return Object.keys(savedProjectsCache).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function writeSavedProject(projectId, sections = {}) {
  const name = typeof projectId === 'string' ? projectId.trim() : '';
  if (!name) return;
  ensureSavedProjectsCache();
  if (savedProjectsError) throw savedProjectsError;
  const entries = sections && typeof sections === 'object' ? Object.entries(sections) : [];
  if (!entries.length) return;
  const current = isPlainObject(savedProjectsCache[name]) ? { ...savedProjectsCache[name] } : {};
  for (const [key, value] of entries) {
    const cloned = cloneSavedProjectValue(value);
    if (cloned === undefined) {
      delete current[key];
    } else {
      current[key] = cloned;
    }
  }
  if (Object.keys(current).length === 0) {
    delete savedProjectsCache[name];
  } else {
    savedProjectsCache[name] = current;
  }
  migratedSavedProjects.delete(name);
  persistSavedProjects();
}

export function readSavedProject(projectId) {
  const name = typeof projectId === 'string' ? projectId.trim() : '';
  if (!name) return null;
  ensureSavedProjectsCache();
  if (savedProjectsError) throw savedProjectsError;
  const record = savedProjectsCache[name];
  if (!isPlainObject(record)) return null;
  return cloneSavedProjectRecord(record);
}

export function removeSavedProject(projectId) {
  const name = typeof projectId === 'string' ? projectId.trim() : '';
  if (!name) return;
  ensureSavedProjectsCache();
  if (savedProjectsError) throw savedProjectsError;
  if (!(name in savedProjectsCache)) return;
  delete savedProjectsCache[name];
  migratedSavedProjects.delete(name);
  persistSavedProjects();
}

export function wasSavedProjectMigrated(projectId) {
  const name = typeof projectId === 'string' ? projectId.trim() : '';
  if (!name) return false;
  ensureSavedProjectsCache();
  if (savedProjectsError) return false;
  return migratedSavedProjects.has(name);
}

export function getSessionPreferences() {
  const session = project.settings?.session;
  if (session && typeof session === 'object') {
    return JSON.parse(JSON.stringify(session));
  }
  return {};
}

export function setSessionPreferences(next = {}) {
  const value = next && typeof next === 'object' ? next : {};
  try {
    setProjectKey('ctrSession', JSON.stringify(value));
  } catch (e) {
    console.warn('session save failed', e);
  }
  return getSessionPreferences();
}

export function updateSessionPreferences(patch) {
  const current = getSessionPreferences();
  const next = typeof patch === 'function'
    ? patch(current)
    : { ...current, ...(patch && typeof patch === 'object' ? patch : {}) };
  return setSessionPreferences(next && typeof next === 'object' ? next : {});
}

export function getConduitCache() {
  if (conduitCacheState) {
    return JSON.parse(JSON.stringify(conduitCacheState));
  }
  const raw = readRawStorage(CONDUIT_CACHE_KEY);
  const parsed = safeParse(raw, null);
  if (parsed && typeof parsed === 'object') {
    conduitCacheState = {
      ductbanks: Array.isArray(parsed.ductbanks) ? parsed.ductbanks : [],
      conduits: Array.isArray(parsed.conduits) ? parsed.conduits : []
    };
    return JSON.parse(JSON.stringify(conduitCacheState));
  }
  conduitCacheState = null;
  return null;
}

export function setConduitCache(data) {
  if (!data || typeof data !== 'object') {
    conduitCacheState = null;
    writeRawStorage(CONDUIT_CACHE_KEY, null);
    return null;
  }
  const normalized = {
    ductbanks: Array.isArray(data.ductbanks) ? data.ductbanks : [],
    conduits: Array.isArray(data.conduits) ? data.conduits : []
  };
  conduitCacheState = {
    ductbanks: JSON.parse(JSON.stringify(normalized.ductbanks)),
    conduits: JSON.parse(JSON.stringify(normalized.conduits))
  };
  writeRawStorage(CONDUIT_CACHE_KEY, JSON.stringify(conduitCacheState));
  try { setProjectKey('ductbankSchedule', JSON.stringify(normalized.ductbanks)); } catch {}
  try { setProjectKey('conduitSchedule', JSON.stringify(normalized.conduits)); } catch {}
  return JSON.parse(JSON.stringify(conduitCacheState));
}

export function clearConduitCache() {
  conduitCacheState = null;
  writeRawStorage(CONDUIT_CACHE_KEY, null);
}

export function getAuthContextState() {
  const token = readRawStorage(AUTH_TOKEN_KEY);
  const csrfToken = readRawStorage(AUTH_CSRF_KEY);
  const expiresRaw = readRawStorage(AUTH_EXPIRES_KEY);
  if (!token || !csrfToken || !expiresRaw) return null;
  const expiresAt = Number.parseInt(expiresRaw, 10);
  if (!Number.isFinite(expiresAt)) {
    clearAuthContextState();
    return null;
  }
  if (Date.now() >= expiresAt) {
    clearAuthContextState();
    return null;
  }
  const user = readRawStorage(AUTH_USER_KEY);
  return { token, csrfToken, expiresAt, user: user || null };
}

export function setAuthContextState({ token, csrfToken, expiresAt, user }) {
  if (!token || !csrfToken) return;
  const expiresValue = Number(expiresAt);
  if (!Number.isFinite(expiresValue)) return;
  writeRawStorage(AUTH_TOKEN_KEY, token);
  writeRawStorage(AUTH_CSRF_KEY, csrfToken);
  writeRawStorage(AUTH_EXPIRES_KEY, String(expiresValue));
  if (user === undefined || user === null) {
    writeRawStorage(AUTH_USER_KEY, null);
  } else {
    writeRawStorage(AUTH_USER_KEY, String(user));
  }
}

export function clearAuthContextState() {
  writeRawStorage(AUTH_TOKEN_KEY, null);
  writeRawStorage(AUTH_CSRF_KEY, null);
  writeRawStorage(AUTH_EXPIRES_KEY, null);
  writeRawStorage(AUTH_USER_KEY, null);
}

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function isQuotaExceeded(error) {
  if (!error || typeof error !== 'object') return false;
  const name = error.name;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (error.code === 22 || error.code === 1014) return true;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  }
  const message = typeof error.message === 'string' ? error.message : '';
  return message.toLowerCase().includes('quota') || message.toLowerCase().includes('exceeded');
}

function handleStorageWriteError(prefix, keyOrError, maybeError) {
  const error = maybeError ?? keyOrError;
  const args = maybeError === undefined ? [prefix, error] : [prefix, keyOrError, error];
  console.warn(...args);
  if (isQuotaExceeded(error)) {
    storageWriteBlocked = true;
    if (!quotaWarningShown) {
      quotaWarningShown = true;
      console.warn('Local storage quota exceeded. Further saves will be kept in memory only for this session.');
    }
  }
}

function trySetStorage(storage, key, value, label = 'project save failed') {
  if (!storage || storageWriteBlocked) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch (e) {
    handleStorageWriteError(label, key, e);
    return false;
  }
}

function cloneProject(obj = project) {
  return JSON.parse(JSON.stringify(obj));
}

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeParse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function setTrackedSettings(keys) {
  trackedSettingsKeys = new Set(keys);
  trackedSettingsKeys.delete('session');
  trackedSettingsKeys.delete('collapsedGroups');
}

function notifyChange() {
  const snapshot = cloneProject();
  listeners.forEach(fn => {
    try {
      fn(snapshot);
    } catch (e) {
      console.error(e);
    }
  });
}

function syncDerivedStorage(storage) {
  if (!storage || storageWriteBlocked) return;
  const derivedKeys = [
    ['cableSchedule', JSON.stringify(project.cables || [])],
    ['traySchedule', JSON.stringify(project.trays || [])],
    ['conduitSchedule', JSON.stringify(project.conduits || [])],
    ['ductbankSchedule', JSON.stringify(project.ductbanks || [])]
  ];
  for (const [key, value] of derivedKeys) {
    if (!trySetStorage(storage, key, value)) return;
  }

  const session = project.settings?.session;
  if (session === undefined) {
    if (!storageWriteBlocked) {
      try { storage.removeItem('ctrSession'); } catch {}
    }
  } else {
    if (!trySetStorage(storage, 'ctrSession', JSON.stringify(session))) return;
  }

  const collapsed = project.settings?.collapsedGroups;
  if (collapsed === undefined) {
    if (!storageWriteBlocked) {
      try { storage.removeItem('collapsedGroups'); } catch {}
    }
  } else {
    if (!trySetStorage(storage, 'collapsedGroups', JSON.stringify(collapsed))) return;
  }

  const settings = project.settings && typeof project.settings === 'object' ? project.settings : {};
  const filteredKeys = Object.keys(settings).filter(k => k !== 'session' && k !== 'collapsedGroups');

  for (const key of trackedSettingsKeys) {
    if (!filteredKeys.includes(key)) {
      if (!storageWriteBlocked) {
        try { storage.removeItem(key); } catch {}
      }
    }
  }
  for (const key of filteredKeys) {
    const value = settings[key];
    if (!trySetStorage(storage, key, JSON.stringify(value))) return;
  }
  trackedSettingsKeys = new Set(filteredKeys);
}

function persistProject({ notify = true } = {}) {
  const storage = getStorage();
  if (storage && !storageWriteBlocked) {
    syncDerivedStorage(storage);
    if (!storageWriteBlocked) {
      try { storage.setItem(PROJECT_KEY, JSON.stringify(project)); }
      catch (e) { handleStorageWriteError('project save failed', e); }
    }
  }
  if (notify) notifyChange();
}

function loadLegacyProject(storage) {
  return {
    cables: safeParse(safeGet(storage, 'cableSchedule'), []),
    trays: safeParse(safeGet(storage, 'traySchedule'), []),
    conduits: safeParse(safeGet(storage, 'conduitSchedule'), []),
    ductbanks: safeParse(safeGet(storage, 'ductbankSchedule'), []),
    settings: {
      session: safeParse(safeGet(storage, 'ctrSession'), {}),
      collapsedGroups: safeParse(safeGet(storage, 'collapsedGroups'), {}),
      conduitFillData: safeParse(safeGet(storage, 'conduitFillData'), null),
      trayFillData: safeParse(safeGet(storage, 'trayFillData'), null),
      ductbankSession: safeParse(safeGet(storage, 'ductbankSession'), {})
    }
  };
}

function loadExistingProject() {
  const storage = getStorage();
  if (!storage) {
    project = defaultProject();
    setTrackedSettings(Object.keys(project.settings || {}));
    return;
  }
  let raw;
  try { raw = storage.getItem(PROJECT_KEY); }
  catch { raw = null; }
  if (raw) {
    try {
      project = migrateProject(JSON.parse(raw));
      setTrackedSettings(Object.keys(project.settings || {}));
      return;
    } catch (e) {
      console.warn('Failed to parse stored project', e);
    }
  }
  const legacy = loadLegacyProject(storage);
  project = migrateProject(legacy);
  setTrackedSettings(Object.keys(project.settings || {}));
  persistProject({ notify: false });
}

function pushUndo(oldProject) {
  if (!compare) return;
  try {
    const patch = compare(project, oldProject);
    if (Array.isArray(patch) && patch.length) {
      undoStack.push(patch);
      redoStack.length = 0;
    }
  } catch (e) {
    console.warn('undo capture failed', e);
  }
}

function ensureJsonPatch() {
  if (!jsonPatchPromise) {
    jsonPatchPromise = import(FAST_JSON_PATCH_URL).then(mod => {
      applyPatch = mod.applyPatch;
      compare = mod.compare;
      return mod;
    });
  }
  return jsonPatchPromise;
}

export async function initializeProjectStorage() {
  await ensureJsonPatch();
  const storage = getStorage();
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeunload', () => {
      undoStack.length = 0;
      redoStack.length = 0;
    });
    window.addEventListener('storage', event => {
      if (!event.key) return;
      if (event.key === PROJECT_KEY) {
        if (!event.newValue) return;
        try {
          project = migrateProject(JSON.parse(event.newValue));
          setTrackedSettings(Object.keys(project.settings || {}));
          if (storage) syncDerivedStorage(storage);
          notifyChange();
        } catch (e) {
          console.warn('project sync failed', e);
        }
        return;
      }
      if (event.key === SCENARIOS_KEY) {
        const parsed = safeParse(event.newValue, ['base']);
        scenarioListCache = ensureScenarioList(parsed);
        if (!scenarioListCache.includes(currentScenarioName)) scenarioListCache.push(currentScenarioName);
        return;
      }
      if (event.key === CURRENT_SCENARIO_KEY) {
        const next = sanitizeScenarioName(event.newValue || '');
        currentScenarioName = next || scenarioListCache[0] || 'base';
        if (!scenarioListCache.includes(currentScenarioName)) scenarioListCache.push(currentScenarioName);
        return;
      }
      if (event.key === CONDUIT_CACHE_KEY) {
        conduitCacheState = null;
        if (event.newValue) {
          const parsed = safeParse(event.newValue, null);
          if (parsed && typeof parsed === 'object') {
            conduitCacheState = {
              ductbanks: Array.isArray(parsed.ductbanks) ? parsed.ductbanks : [],
              conduits: Array.isArray(parsed.conduits) ? parsed.conduits : []
            };
          }
        }
      }
    });
  }
  notifyChange();
}

export function getProjectState() {
  return cloneProject();
}

export function setProjectState(next) {
  const oldProject = cloneProject();
  project = migrateProject(next || {});
  pushUndo(oldProject);
  persistProject();
}

export function setProjectKey(key, value, options = {}) {
  if (!key) return;
  if (key === PROJECT_KEY) {
    if (!options.skipLocalStorage) {
      const storage = getStorage();
      if (storage && !storageWriteBlocked) {
        try { storage.setItem(key, value); }
        catch (e) { handleStorageWriteError('project save failed', e); }
      }
    }
    return;
  }
  const oldProject = cloneProject();
  if (key === 'cableSchedule') {
    project.cables = safeParse(value, []);
  } else if (key === 'traySchedule') {
    project.trays = safeParse(value, []);
  } else if (key === 'conduitSchedule') {
    project.conduits = safeParse(value, []);
  } else if (key === 'ductbankSchedule') {
    project.ductbanks = safeParse(value, []);
  } else if (key === 'collapsedGroups') {
    if (!project.settings) project.settings = {};
    project.settings.collapsedGroups = safeParse(value, {});
  } else if (key === 'ctrSession') {
    if (!project.settings) project.settings = {};
    project.settings.session = safeParse(value, {});
  } else {
    if (!project.settings) project.settings = {};
    try {
      project.settings[key] = JSON.parse(value);
    } catch {
      project.settings[key] = value;
    }
  }
  pushUndo(oldProject);
  if (!options.skipLocalStorage) {
    const storage = getStorage();
    trySetStorage(storage, key, value);
  }
  persistProject();
}

export function removeProjectKey(key, options = {}) {
  if (!key) return;
  if (key === PROJECT_KEY) {
    if (!options.skipLocalStorage) {
      const storage = getStorage();
      if (storage && !storageWriteBlocked) {
        try { storage.removeItem(key); } catch {}
      }
    }
    return;
  }
  const oldProject = cloneProject();
  if (key === 'cableSchedule') {
    project.cables = [];
  } else if (key === 'traySchedule') {
    project.trays = [];
  } else if (key === 'conduitSchedule') {
    project.conduits = [];
  } else if (key === 'ductbankSchedule') {
    project.ductbanks = [];
  } else if (key === 'collapsedGroups') {
    if (project.settings) delete project.settings.collapsedGroups;
  } else if (key === 'ctrSession') {
    if (project.settings) delete project.settings.session;
  } else {
    if (project.settings) delete project.settings[key];
  }
  pushUndo(oldProject);
  if (!options.skipLocalStorage) {
    const storage = getStorage();
    if (storage && !storageWriteBlocked) {
      try { storage.removeItem(key); } catch {}
    }
  }
  persistProject();
}

export function undoProjectChange() {
  if (!undoStack.length || !applyPatch) return;
  const patch = undoStack.pop();
  const current = cloneProject();
  try {
    const result = applyPatch(current, patch, true).newDocument;
    if (compare) {
      try { redoStack.push(compare(result, project)); }
      catch { redoStack.push([]); }
    } else {
      redoStack.push([]);
    }
    project = migrateProject(result);
    persistProject();
  } catch (e) {
    console.warn('undo failed', e);
  }
}

export function redoProjectChange() {
  if (!redoStack.length || !applyPatch) return;
  const patch = redoStack.pop();
  const current = cloneProject();
  try {
    const result = applyPatch(current, patch, true).newDocument;
    if (compare) {
      try { undoStack.push(compare(result, project)); }
      catch { undoStack.push([]); }
    } else {
      undoStack.push([]);
    }
    project = migrateProject(result);
    persistProject();
  } catch (e) {
    console.warn('redo failed', e);
  }
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

export function onProjectChange(handler) {
  if (typeof handler !== 'function') return () => {};
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

loadExistingProject();
loadScenarioState();

const api = {
  PROJECT_KEY,
  defaultProject,
  migrateProject,
  initializeProjectStorage,
  getProjectState,
  setProjectState,
  setProjectKey,
  removeProjectKey,
  undoProjectChange,
  redoProjectChange,
  canUndo,
  canRedo,
  onProjectChange,
  getScenarioListState,
  setScenarioListState,
  registerScenario,
  getCurrentScenarioNameState,
  setCurrentScenarioNameState,
  readScenarioValue,
  writeScenarioValue,
  removeScenarioValue,
  listScenarioKeysState,
  cloneScenarioStorage,
  getSavedProjectsError,
  listSavedProjects,
  writeSavedProject,
  readSavedProject,
  removeSavedProject,
  wasSavedProjectMigrated,
  getSessionPreferences,
  setSessionPreferences,
  updateSessionPreferences,
  getConduitCache,
  setConduitCache,
  clearConduitCache,
  getAuthContextState,
  setAuthContextState,
  clearAuthContextState
};

if (typeof globalThis !== 'undefined') {
  globalThis.projectStorage = api;
}

export { PROJECT_KEY, defaultProject, migrateProject };
