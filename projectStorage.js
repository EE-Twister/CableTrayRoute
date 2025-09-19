const PROJECT_KEY = 'CTR_PROJECT_V1';
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

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
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
  if (!storage) return;
  try { storage.setItem('cableSchedule', JSON.stringify(project.cables || [])); }
  catch (e) { console.warn('project save failed', e); }
  try { storage.setItem('traySchedule', JSON.stringify(project.trays || [])); }
  catch (e) { console.warn('project save failed', e); }
  try { storage.setItem('conduitSchedule', JSON.stringify(project.conduits || [])); }
  catch (e) { console.warn('project save failed', e); }
  try { storage.setItem('ductbankSchedule', JSON.stringify(project.ductbanks || [])); }
  catch (e) { console.warn('project save failed', e); }

  const session = project.settings?.session;
  if (session === undefined) {
    try { storage.removeItem('ctrSession'); } catch {}
  } else {
    try { storage.setItem('ctrSession', JSON.stringify(session)); }
    catch (e) { console.warn('project save failed', e); }
  }

  const collapsed = project.settings?.collapsedGroups;
  if (collapsed === undefined) {
    try { storage.removeItem('collapsedGroups'); } catch {}
  } else {
    try { storage.setItem('collapsedGroups', JSON.stringify(collapsed)); }
    catch (e) { console.warn('project save failed', e); }
  }

  const settings = project.settings && typeof project.settings === 'object' ? project.settings : {};
  const filteredKeys = Object.keys(settings).filter(k => k !== 'session' && k !== 'collapsedGroups');

  for (const key of trackedSettingsKeys) {
    if (!filteredKeys.includes(key)) {
      try { storage.removeItem(key); } catch {}
    }
  }
  for (const key of filteredKeys) {
    const value = settings[key];
    try { storage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn('project save failed', key, e); }
  }
  trackedSettingsKeys = new Set(filteredKeys);
}

function persistProject({ notify = true } = {}) {
  const storage = getStorage();
  if (storage) {
    syncDerivedStorage(storage);
    try { storage.setItem(PROJECT_KEY, JSON.stringify(project)); }
    catch (e) { console.warn('project save failed', e); }
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
      if (!event.key || event.key !== PROJECT_KEY) return;
      if (!event.newValue) return;
      try {
        project = migrateProject(JSON.parse(event.newValue));
        setTrackedSettings(Object.keys(project.settings || {}));
        if (storage) syncDerivedStorage(storage);
        notifyChange();
      } catch (e) {
        console.warn('project sync failed', e);
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
      if (storage) {
        try { storage.setItem(key, value); }
        catch (e) { console.warn('project save failed', e); }
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
    if (storage) {
      try { storage.setItem(key, value); }
      catch (e) { console.warn('project save failed', e); }
    }
  }
  persistProject();
}

export function removeProjectKey(key, options = {}) {
  if (!key) return;
  if (key === PROJECT_KEY) {
    if (!options.skipLocalStorage) {
      const storage = getStorage();
      if (storage) {
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
    if (storage) {
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
  onProjectChange
};

if (typeof globalThis !== 'undefined') {
  globalThis.projectStorage = api;
}

export { PROJECT_KEY, defaultProject, migrateProject };
