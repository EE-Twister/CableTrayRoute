/**
 * Simple parser for Revit/IFC exports that extracts tray and conduit
 * geometry. The goal is not to support the full schemas but to pull out
 * basic start/end coordinates used by the app. The function accepts
 * either a JSON object/string or raw IFC STEP text.
 *
 * Returned geometry objects use the field names already consumed by the
 * data store (start_x, start_y, ...).
 *
 * @param {string|object} input - IFC STEP text or Revit JSON.
 * @returns {{trays:Array, conduits:Array}}
 */
function parseRevit(input) {
  if (typeof input === "string") {
    // Try JSON first – many exporters can emit JSON directly.
    try {
      const obj = JSON.parse(input);
      return parseRevitJSON(obj);
    } catch (err) {
      console.debug('[revit] Input is not JSON, attempting IFC STEP parse:', err.message);
      return parseIFC(input);
    }
  }
  // Already an object – assume JSON structure
  return parseRevitJSON(input);
}

/**
 * Parse a Revit style JSON export. The exporter format is not
 * standardized so we try a few common field names.
 * @param {any} obj
 */
function parseRevitJSON(obj) {
  if (!obj || typeof obj !== "object") return { trays: [], conduits: [] };
  const trays = [];
  const conduits = [];

  const traySrc =
    obj.trays || obj.Trays || obj.cableTrays || obj.CableTrays || [];
  for (const t of traySrc) {
    trays.push(normalizeTray(t));
  }

  const conduitSrc =
    obj.conduits ||
    obj.Conduits ||
    obj.cableConduits ||
    obj.ConduitSegments ||
    [];
  for (const c of conduitSrc) {
    conduits.push(normalizeConduit(c));
  }

  return { trays, conduits };
}

function num(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeTray(t = {}) {
  return {
    id: t.id || t.tag || t.tray_id || t.TrayID || t.name || t.Tag || "",
    start_x: num(t.start_x ?? t.sx ?? t.x1 ?? t.StartX ?? t.start?.x),
    start_y: num(t.start_y ?? t.sy ?? t.y1 ?? t.StartY ?? t.start?.y),
    start_z: num(t.start_z ?? t.sz ?? t.z1 ?? t.StartZ ?? t.start?.z),
    end_x: num(t.end_x ?? t.ex ?? t.x2 ?? t.EndX ?? t.end?.x),
    end_y: num(t.end_y ?? t.ey ?? t.y2 ?? t.EndY ?? t.end?.y),
    end_z: num(t.end_z ?? t.ez ?? t.z2 ?? t.EndZ ?? t.end?.z),
    width: num(t.width ?? t.w ?? t.Width ?? t.size_x),
    height: num(t.height ?? t.h ?? t.Height ?? t.size_y),
  };
}

function normalizeConduit(c = {}) {
  return {
    conduit_id: c.conduit_id || c.id || c.tag || c.ConduitID || "",
    type: c.type || c.conduit_type || c.Type || "",
    trade_size: c.trade_size || c.tradeSize || c.size || c.TradeSize || "",
    start_x: num(c.start_x ?? c.sx ?? c.x1 ?? c.start?.x),
    start_y: num(c.start_y ?? c.sy ?? c.y1 ?? c.start?.y),
    start_z: num(c.start_z ?? c.sz ?? c.z1 ?? c.start?.z),
    end_x: num(c.end_x ?? c.ex ?? c.x2 ?? c.end?.x),
    end_y: num(c.end_y ?? c.ey ?? c.y2 ?? c.end?.y),
    end_z: num(c.end_z ?? c.ez ?? c.z2 ?? c.end?.z),
    capacity: num(c.capacity ?? c.fill),
  };
}

/**
 * Extremely small IFC STEP parser. It looks for entities that contain an
 * `IFCPOLYLINE` with two points – the start and end of a segment. If the
 * entity name includes `CABLECARRIER` it is treated as a tray; otherwise
 * it is treated as a conduit segment.
 *
 * Supports two formats:
 *   1. Inline simplified: #N=IFCCABLECARRIERSEGMENTIFCPOLYLINE((x,y,z),(x,y,z))
 *   2. Referenced-entity (IFC4 proper): separate IFCCARTESIANPOINT / IFCPOLYLINE /
 *      IFCCABLECARRIERSEGMENT entities linked by entity references (#N).
 *
 * This is a best‑effort helper and is not meant to cover the entire IFC
 * specification, but it is sufficient for small test files and demos.
 *
 * @param {string} text
 */
function parseIFC(text) {
  const trays = [];
  const conduits = [];

  // --- Pass 1: inline simplified format (existing behaviour) ---
  const segRegex =
    /#\d+=IFC([^;]*?)SEGMENT[^;]*?IFCPOLYLINE\(\(([^)]+)\),\(([^)]+)\)\)/gi;
  let match;
  let i = 0;
  while ((match = segRegex.exec(text))) {
    const kind = match[1] || "";
    const start = match[2].split(",").map((v) => parseFloat(v));
    const end = match[3].split(",").map((v) => parseFloat(v));
    const seg = {
      id: `SEG-${i++}`,
      start_x: start[0],
      start_y: start[1],
      start_z: start[2],
      end_x: end[0],
      end_y: end[1],
      end_z: end[2],
    };
    if (/CABLECARRIER/i.test(kind)) trays.push(seg);
    else conduits.push(seg);
  }

  // If inline format found something, return it
  if (trays.length > 0 || conduits.length > 0) return { trays, conduits };

  // --- Pass 2: referenced-entity IFC4 format ---
  // Build a map from entity id → parsed content for CartesianPoint and Polyline
  const cartesianPoints = new Map(); // entityId → [x, y, z]
  const polylines = new Map();       // entityId → [pt1Id, pt2Id]

  // Parse IFCCARTESIANPOINT(( x, y, z ));
  const ptRegex = /#(\d+)=IFCCARTESIANPOINT\(\(([^)]+)\)\)/gi;
  let ptMatch;
  while ((ptMatch = ptRegex.exec(text))) {
    const coords = ptMatch[2].split(",").map(v => parseFloat(v.trim()));
    cartesianPoints.set(ptMatch[1], coords);
  }

  // Parse IFCPOLYLINE(( #id1, #id2 ));
  const plRegex = /#(\d+)=IFCPOLYLINE\(\(([^)]+)\)\)/gi;
  let plMatch;
  while ((plMatch = plRegex.exec(text))) {
    const refs = plMatch[2].match(/#(\d+)/g)?.map(r => r.slice(1)) || [];
    if (refs.length >= 2) polylines.set(plMatch[1], refs);
  }

  // Parse IFCCABLECARRIERSEGMENT entries and trace geometry via shape references
  // Format: #N=IFCCABLECARRIERSEGMENT('guid',#owner,'name',...,#placement,#repMap,...,.TYPE.);
  const segEntityRegex = /#\d+=IFCCABLECARRIERSEGMENT\(([^;]+)\);/gi;
  let segEMatch;
  let j = 0;
  while ((segEMatch = segEntityRegex.exec(text))) {
    const body = segEMatch[1];
    // Extract the name (3rd positional argument, single-quoted)
    const nameMatch = body.match(/'([^']*)'/g);
    const segName = nameMatch && nameMatch[1] ? nameMatch[1].replace(/'/g, '') : `SEG-${j}`;
    // Determine type: .CABLETRAY. or .CONDUIT.
    const isTray = /\.CABLETRAY\./i.test(body);

    // Find the first IFCPOLYLINE entity referenced anywhere in this segment's geometry chain.
    // Rather than fully tracing the shape graph, we find the polyline closest before this segment.
    // Strategy: find the polyline that was defined most recently before this segment entry.
    const segOffset = segEMatch.index;
    let bestPolyId = null;
    for (const pid of polylines.keys()) {
      const pidMatch = text.indexOf(`#${pid}=IFCPOLYLINE`);
      if (pidMatch < segOffset) bestPolyId = pid;
    }

    if (bestPolyId) {
      const ptIds = polylines.get(bestPolyId);
      const pt1 = cartesianPoints.get(ptIds[0]) || [0, 0, 0];
      const pt2 = cartesianPoints.get(ptIds[1]) || [0, 0, 0];
      const seg = {
        id: segName || `SEG-${j}`,
        start_x: pt1[0],
        start_y: pt1[1],
        start_z: pt1[2],
        end_x: pt2[0],
        end_y: pt2[1],
        end_z: pt2[2],
      };
      if (isTray) trays.push(seg);
      else conduits.push(seg);
    }
    j++;
  }

  return { trays, conduits };
}

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
    cableTypicals: [],
    settings: { session: {}, collapsedGroups: {}, units: 'imperial', theme: 'system' }
  };
}

const VALID_THEMES = new Set(['system', 'light', 'dark', 'high-contrast']);

function normalizeThemePreference(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (VALID_THEMES.has(normalized)) return normalized;
  if (normalized === 'contrast' || normalized === 'high_contrast') return 'high-contrast';
  return '';
}



const PHASE1_COMPONENT_DEFAULTS = {
  baseline: {
    tag: (component) => component.ref || component.label || component.id || '',
    description: (component) => component.label || '',
    manufacturer: 'Unspecified',
    model: 'Unspecified',
    phases: 3,
    commissioning_state: 'existing',
    service_status: 'in_service',
    notes: ''
  },
  mcc: {
    rated_voltage_kv: 0.48,
    bus_rating_a: 1600,
    main_device_type: 'mccb',
    sccr_ka: 65,
    bucket_count: 6,
    spare_bucket_count: 1,
    form_type: 'form_2b'
  },
  busway: {
    tag: (component) => component.ref || component.label || component.id || '',
    description: (component) => component.label || 'Busway segment',
    manufacturer: 'Unspecified',
    model: 'Unspecified',
    length_ft: 10,
    material: 'copper',
    insulation_type: 'epoxy',
    enclosure_rating: 'NEMA 1',
    busway_type: 'feeder',
    ampacity_a: 1200,
    r_ohm_per_kft: 0.03,
    x_ohm_per_kft: 0.01,
    short_circuit_rating_ka: 65
  },
  ct: {
    tag: (component) => component.ref || component.label || component.id || '',
    ratio_primary: 600,
    ratio_secondary: 5,
    accuracy_class: '0.3',
    burden_va: 15,
    knee_point_v: 400,
    polarity: 'H1-X1',
    location_context: 'protection',
    protected_device_id: '',
    meter_id: '',
    relay_id: ''
  },
  pt_vt: {
    tag: (component) => component.ref || component.label || component.id || '',
    primary_voltage: 12470,
    secondary_voltage: 120,
    accuracy_class: '0.3',
    burden_va: 50,
    connection_type: 'wye-grounded',
    fuse_protection: 'yes',
    location_context: 'protection',
    protected_device_id: '',
    meter_id: '',
    relay_id: '',
    consumer_ids: ''
  },
  ups: {
    tag: (component) => component.ref || component.label || component.id || '',
    manufacturer: 'Unspecified',
    model: 'Unspecified',
    topology: 'double_conversion',
    rated_kva: 500,
    input_voltage_kv: 0.48,
    output_voltage_kv: 0.48,
    efficiency_pct: 96,
    battery_runtime_min: 15,
    battery_dc_v: 480,
    static_bypass_supported: true,
    operating_mode: 'normal',
    mode_normal_enabled: true,
    mode_battery_enabled: true,
    mode_bypass_enabled: true,
    runtime_normal_min: 0,
    runtime_battery_min: 15,
    runtime_bypass_min: 0
  }
};

function isMissingFieldValue(value) {
  return value === undefined
    || value === null
    || (typeof value === 'string' && value.trim() === '');
}

function ensureComponentField(component, key, defaultValue) {
  if (!component || typeof component !== 'object') return;
  if (!component.props || typeof component.props !== 'object') {
    component.props = { ...(component.props || {}) };
  }
  const hasRootValue = !isMissingFieldValue(component[key]);
  const hasPropValue = !isMissingFieldValue(component.props[key]);
  if (hasRootValue && !hasPropValue) {
    component.props[key] = component[key];
    return;
  }
  if (hasPropValue && !hasRootValue) {
    component[key] = component.props[key];
    return;
  }
  if (hasRootValue || hasPropValue) return;
  const nextValue = typeof defaultValue === 'function' ? defaultValue(component) : defaultValue;
  component[key] = nextValue;
  component.props[key] = nextValue;
}

function applySubtypeDefaults(component, subtype) {
  Object.entries(PHASE1_COMPONENT_DEFAULTS.baseline).forEach(([key, value]) => {
    ensureComponentField(component, key, value);
  });
  const subtypeDefaults = PHASE1_COMPONENT_DEFAULTS[subtype];
  if (!subtypeDefaults) return;
  Object.entries(subtypeDefaults).forEach(([key, value]) => {
    ensureComponentField(component, key, value);
  });
}

function migrateOneLineDiagram(data) {
  if (!data || typeof data !== 'object') return data;
  if (!Array.isArray(data.sheets)) return data;
  const normalized = {
    ...data,
    sheets: data.sheets.map((sheet) => {
      const components = Array.isArray(sheet?.components) ? sheet.components : [];
      return {
        ...sheet,
        components: components.map((component) => {
          if (!component || typeof component !== 'object') return component;
          const normalizedSubtype = `${component.subtype || component.type || ''}`.trim().toLowerCase();
          if (!['mcc', 'busway', 'ct', 'pt_vt', 'ups'].includes(normalizedSubtype)) {
            return component;
          }
          const hasRuntimeBatteryBefore = !isMissingFieldValue(component?.runtime_battery_min)
            || !isMissingFieldValue(component?.props?.runtime_battery_min);
          const hasBatteryRuntimeBefore = !isMissingFieldValue(component?.battery_runtime_min)
            || !isMissingFieldValue(component?.props?.battery_runtime_min);
          const next = {
            ...component,
            props: component.props && typeof component.props === 'object'
              ? { ...component.props }
              : {}
          };
          applySubtypeDefaults(next, normalizedSubtype);
          if (normalizedSubtype === 'mcc') {
            const bucketCount = Number(next.bucket_count ?? next.props.bucket_count);
            const spareBucketCount = Number(next.spare_bucket_count ?? next.props.spare_bucket_count);
            if (Number.isFinite(bucketCount) && Number.isFinite(spareBucketCount) && spareBucketCount > bucketCount) {
              next.spare_bucket_count = bucketCount;
              next.props.spare_bucket_count = bucketCount;
            }
          }
          if (normalizedSubtype === 'ups') {
            const runtimeBatteryMin = Number(next.runtime_battery_min ?? next.props.runtime_battery_min);
            const batteryRuntimeMin = Number(next.battery_runtime_min ?? next.props.battery_runtime_min);
            if (hasRuntimeBatteryBefore && !hasBatteryRuntimeBefore && Number.isFinite(runtimeBatteryMin)) {
              next.battery_runtime_min = runtimeBatteryMin;
              next.props.battery_runtime_min = runtimeBatteryMin;
            } else if (hasBatteryRuntimeBefore && !hasRuntimeBatteryBefore && Number.isFinite(batteryRuntimeMin)) {
              next.runtime_battery_min = batteryRuntimeMin;
              next.props.runtime_battery_min = batteryRuntimeMin;
            } else if (Number.isFinite(runtimeBatteryMin) && !Number.isFinite(batteryRuntimeMin)) {
              next.battery_runtime_min = runtimeBatteryMin;
              next.props.battery_runtime_min = runtimeBatteryMin;
            } else if (!Number.isFinite(runtimeBatteryMin) && Number.isFinite(batteryRuntimeMin)) {
              next.runtime_battery_min = batteryRuntimeMin;
              next.props.runtime_battery_min = batteryRuntimeMin;
            }
          }
          return next;
        })
      };
    })
  };
  return normalized;
}

function migrateSettingsPayload(settings = {}) {
  const next = { ...settings };
  const oneLine = next.oneLineDiagram;
  if (oneLine && typeof oneLine === 'object') {
    next.oneLineDiagram = migrateOneLineDiagram(oneLine);
  }
  return next;
}
function migrateProject(old = {}) {
  const settings = old.settings || {
    session: old.session || old.ctrSession || {},
    collapsedGroups: old.collapsedGroups || {}
  };
  if (!settings.units) settings.units = 'imperial';
  const sessionDarkMode = settings.session && typeof settings.session === 'object'
    ? settings.session.darkMode
    : undefined;
  settings.theme = normalizeThemePreference(settings.theme)
    || normalizeThemePreference(old.themePreference)
    || (typeof sessionDarkMode === 'boolean' ? (sessionDarkMode ? 'dark' : 'light') : 'system');
  const migratedSettings = migrateSettingsPayload(settings);
  return {
    name: old.name || '',
    ductbanks: old.ductbanks || old.ductbankSchedule || [],
    conduits: old.conduits || old.conduitSchedule || [],
    trays: old.trays || old.traySchedule || [],
    cables: old.cables || old.cableSchedule || [],
    cableTypicals: old.cableTypicals || [],
    settings: migratedSettings
  };
}

let project = defaultProject();
let compare;
let applyPatch;
let jsonPatchPromise;
const undoStack = [];
const redoStack = [];
let trackedSettingsKeys = new Set();
const listeners$1 = new Set();
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
const DERIVED_SYNC_KEYS = {
  cables: 'cableSchedule',
  trays: 'traySchedule',
  conduits: 'conduitSchedule',
  ductbanks: 'ductbankSchedule',
  cableTypicals: 'cableTypicals'
};
const UNDO_COALESCE_WINDOW_MS = 200;
const derivedStorageCache = new Map();
const mutationCounters = new Map();
let undoCoalesceState = null;

function getNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function isDevMutationLoggingEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__CTR_DEBUG_PROJECT_STORAGE__ === true) return true;
  const query = String(window.location?.search || '');
  if (query.includes('debugProjectStorage=1')) return true;
  const hostname = String(window.location?.hostname || '');
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
}

function logMutationMetric(type, startedAt, details = {}) {
  if (!isDevMutationLoggingEnabled()) return;
  const count = (mutationCounters.get(type) || 0) + 1;
  mutationCounters.set(type, count);
  const durationMs = Math.round((getNowMs() - startedAt) * 100) / 100;
  console.debug('[projectStorage]', {
    type,
    count,
    durationMs,
    undoDepth: undoStack.length,
    redoDepth: redoStack.length,
    ...details
  });
}

function createChangeSet(changes = []) {
  return new Set(changes.filter(Boolean));
}

function hasChange(changeSet, change) {
  return !changeSet || changeSet.has(change);
}

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

function getScenarioListState() {
  return [...scenarioListCache];
}

function setScenarioListState(list) {
  scenarioListCache = ensureScenarioList(list);
  if (!scenarioListCache.includes(currentScenarioName)) scenarioListCache.push(currentScenarioName);
  persistScenarioState();
}

function registerScenario(name) {
  const normalized = sanitizeScenarioName(name);
  if (!normalized) return;
  if (!scenarioListCache.includes(normalized)) {
    scenarioListCache.push(normalized);
    persistScenarioState();
  }
}

function getCurrentScenarioNameState() {
  return currentScenarioName;
}

function setCurrentScenarioNameState(name) {
  const normalized = sanitizeScenarioName(name) || 'base';
  currentScenarioName = normalized;
  if (!scenarioListCache.includes(normalized)) scenarioListCache.push(normalized);
  persistScenarioState();
}

function readScenarioValue(key, fallback, scenario = currentScenarioName) {
  const target = sanitizeScenarioName(scenario) || currentScenarioName;
  const raw = readScenarioRaw(target, key);
  if (raw === null || raw === undefined) return fallback;
  return safeParse(raw, fallback);
}

function writeScenarioValue(key, value, scenario = currentScenarioName) {
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

function removeScenarioValue(key, scenario = currentScenarioName) {
  const target = sanitizeScenarioName(scenario) || currentScenarioName;
  writeScenarioRaw(target, key, null);
  if (target === currentScenarioName) {
    removeProjectKey(key);
  }
}

function listScenarioKeysState(scenario = currentScenarioName) {
  const target = sanitizeScenarioName(scenario) || currentScenarioName;
  return listPrefixedKeys(`${target}:`);
}

function cloneScenarioStorage(from, to) {
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

const SAVED_PROJECT_SUFFIXES = ['equipment', 'panels', 'loads', 'cables', 'cableTypicals', 'raceways', 'oneLine'];
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

function getSavedProjectsError() {
  ensureSavedProjectsCache();
  return savedProjectsError;
}

function listSavedProjects() {
  ensureSavedProjectsCache();
  if (savedProjectsError) return [];
  return Object.keys(savedProjectsCache).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function writeSavedProject(projectId, sections = {}) {
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

function readSavedProject(projectId) {
  const name = typeof projectId === 'string' ? projectId.trim() : '';
  if (!name) return null;
  ensureSavedProjectsCache();
  if (savedProjectsError) throw savedProjectsError;
  const record = savedProjectsCache[name];
  if (!isPlainObject(record)) return null;
  return cloneSavedProjectRecord(record);
}

function removeSavedProject(projectId) {
  const name = typeof projectId === 'string' ? projectId.trim() : '';
  if (!name) return;
  ensureSavedProjectsCache();
  if (savedProjectsError) throw savedProjectsError;
  if (!(name in savedProjectsCache)) return;
  delete savedProjectsCache[name];
  migratedSavedProjects.delete(name);
  persistSavedProjects();
}

function wasSavedProjectMigrated(projectId) {
  const name = typeof projectId === 'string' ? projectId.trim() : '';
  if (!name) return false;
  ensureSavedProjectsCache();
  if (savedProjectsError) return false;
  return migratedSavedProjects.has(name);
}


function getThemePreference() {
  const settings = project.settings;
  const raw = settings && typeof settings === 'object' ? settings.theme : undefined;
  return normalizeThemePreference(raw) || 'system';
}

function setThemePreference(theme) {
  const normalized = normalizeThemePreference(theme) || 'system';
  try {
    setProjectKey('theme', JSON.stringify(normalized));
  } catch (e) {
    console.warn('theme preference save failed', e);
  }
  return getThemePreference();
}

function getSessionPreferences() {
  const session = project.settings?.session;
  if (session && typeof session === 'object') {
    return JSON.parse(JSON.stringify(session));
  }
  return {};
}

function setSessionPreferences(next = {}) {
  const value = next && typeof next === 'object' ? next : {};
  try {
    setProjectKey('ctrSession', JSON.stringify(value));
  } catch (e) {
    console.warn('session save failed', e);
  }
  return getSessionPreferences();
}

function updateSessionPreferences(patch) {
  const current = getSessionPreferences();
  const next = typeof patch === 'function'
    ? patch(current)
    : { ...current, ...(patch && typeof patch === 'object' ? patch : {}) };
  return setSessionPreferences(next && typeof next === 'object' ? next : {});
}

function getConduitCache() {
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

function setConduitCache(data) {
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

function clearConduitCache() {
  conduitCacheState = null;
  writeRawStorage(CONDUIT_CACHE_KEY, null);
}

function getAuthContextState() {
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

const SESSION_WARNING_MS = 5 * 60 * 1000; // warn 5 minutes before expiry
let _expiryWarningTimer = null;
let _expiryTimer = null;

function clearSessionTimers() {
  if (_expiryWarningTimer !== null) {
    clearTimeout(_expiryWarningTimer);
    _expiryWarningTimer = null;
  }
  if (_expiryTimer !== null) {
    clearTimeout(_expiryTimer);
    _expiryTimer = null;
  }
}

function scheduleSessionTimers(expiresAt) {
  clearSessionTimers();
  if (typeof dispatchEvent === 'undefined') return;
  const now = Date.now();
  const msUntilExpiry = expiresAt - now;
  if (msUntilExpiry <= 0) return;

  const msUntilWarning = msUntilExpiry - SESSION_WARNING_MS;
  if (msUntilWarning > 0) {
    _expiryWarningTimer = setTimeout(() => {
      dispatchEvent(new CustomEvent('session-expiring', { detail: { expiresAt } }));
    }, msUntilWarning);
  } else {
    // Already within the warning window — fire immediately
    dispatchEvent(new CustomEvent('session-expiring', { detail: { expiresAt } }));
  }

  _expiryTimer = setTimeout(() => {
    clearAuthContextState();
    dispatchEvent(new CustomEvent('session-expired'));
  }, msUntilExpiry);
}

function setAuthContextState({ token, csrfToken, expiresAt, user }) {
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
  scheduleSessionTimers(expiresValue);
}

function clearAuthContextState() {
  clearSessionTimers();
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
    const key = typeof keyOrError === 'string' ? keyOrError : '';
    if (key.includes('oneLineRevisions')) {
      try {
        const storage = getStorage();
        if (storage) storage.removeItem(key);
      } catch {}
      memoryStorage.delete(key);
      storageWriteBlocked = false;
      quotaWarningShown = false;
      console.warn('One-line revision history cleared to free storage.');
      return;
    }
    storageWriteBlocked = true;
    if (!quotaWarningShown) {
      quotaWarningShown = true;
      console.warn('Local storage quota exceeded. Further saves will be kept in memory only for this session.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ctr:storageQuotaExceeded'));
        // Show a visible banner if no listener handles it within this tick.
        setTimeout(() => {
          if (document.querySelector('.ctr-quota-banner')) return;
          const banner = document.createElement('div');
          banner.className = 'ctr-quota-banner';
          banner.setAttribute('role', 'alert');
          banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#c0392b;color:#fff;padding:10px 16px;z-index:9999;font-size:14px;display:flex;justify-content:space-between;align-items:center;';
          banner.innerHTML = '<span>&#9888; Local storage is full. Changes are saved in memory only and will be lost on page reload. Clear browser data or export your project to free space.</span>';
          const close = document.createElement('button');
          close.textContent = '\u00d7';
          close.style.cssText = 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;margin-left:12px;';
          close.onclick = () => banner.remove();
          banner.appendChild(close);
          document.body?.appendChild(banner);
        }, 0);
      }
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
  listeners$1.forEach(fn => {
    try {
      fn(snapshot);
    } catch (e) {
      console.error(e);
    }
  });
}

function syncDerivedStorage(storage, changeSet = null) {
  if (!storage || storageWriteBlocked) return;

  let writes = 0;
  let skips = 0;
  const setDerived = (key, nextValue) => {
    const previous = derivedStorageCache.get(key);
    if (previous === nextValue) {
      skips++;
      return true;
    }
    if (!trySetStorage(storage, key, nextValue)) return false;
    derivedStorageCache.set(key, nextValue);
    writes++;
    return true;
  };
  const removeDerived = key => {
    if (derivedStorageCache.get(key) === null) {
      skips++;
      return;
    }
    if (!storageWriteBlocked) {
      try { storage.removeItem(key); } catch {}
    }
    derivedStorageCache.set(key, null);
    writes++;
  };

  if (hasChange(changeSet, 'cables')) {
    if (!setDerived(DERIVED_SYNC_KEYS.cables, JSON.stringify(project.cables || []))) return { writes, skips };
  }
  if (hasChange(changeSet, 'trays')) {
    if (!setDerived(DERIVED_SYNC_KEYS.trays, JSON.stringify(project.trays || []))) return { writes, skips };
  }
  if (hasChange(changeSet, 'conduits')) {
    if (!setDerived(DERIVED_SYNC_KEYS.conduits, JSON.stringify(project.conduits || []))) return { writes, skips };
  }
  if (hasChange(changeSet, 'ductbanks')) {
    if (!setDerived(DERIVED_SYNC_KEYS.ductbanks, JSON.stringify(project.ductbanks || []))) return { writes, skips };
  }
  if (hasChange(changeSet, 'cableTypicals')) {
    if (!setDerived(DERIVED_SYNC_KEYS.cableTypicals, JSON.stringify(project.cableTypicals || []))) return { writes, skips };
  }

  if (hasChange(changeSet, 'settings:session')) {
    const session = project.settings?.session;
    if (session === undefined) {
      removeDerived('ctrSession');
    } else {
      if (!setDerived('ctrSession', JSON.stringify(session))) return { writes, skips };
    }
  }

  if (hasChange(changeSet, 'settings:collapsedGroups')) {
    const collapsed = project.settings?.collapsedGroups;
    if (collapsed === undefined) {
      removeDerived('collapsedGroups');
    } else {
      if (!setDerived('collapsedGroups', JSON.stringify(collapsed))) return { writes, skips };
    }
  }

  if (hasChange(changeSet, 'settings:other')) {
    const settings = project.settings && typeof project.settings === 'object' ? project.settings : {};
    const filteredKeys = Object.keys(settings).filter(k => k !== 'session' && k !== 'collapsedGroups');

    for (const key of trackedSettingsKeys) {
      if (!filteredKeys.includes(key)) {
        removeDerived(key);
      }
    }
    for (const key of filteredKeys) {
      const value = settings[key];
      if (!setDerived(key, JSON.stringify(value))) return { writes, skips };
    }
    trackedSettingsKeys = new Set(filteredKeys);
  }

  return { writes, skips };
}

function persistProject({ notify = true, changeSet = null, mutationType = 'persist' } = {}) {
  const startedAt = getNowMs();
  const storage = getStorage();
  let syncStats = { writes: 0, skips: 0 };
  if (storage && !storageWriteBlocked) {
    syncStats = syncDerivedStorage(storage, changeSet) || syncStats;
    if (!storageWriteBlocked) {
      try { storage.setItem(PROJECT_KEY, JSON.stringify(project)); }
      catch (e) { handleStorageWriteError('project save failed', e); }
    }
  }
  if (notify) notifyChange();
  logMutationMetric(mutationType, startedAt, {
    derivedWrites: syncStats.writes,
    derivedSkips: syncStats.skips,
    changedScopes: changeSet ? [...changeSet] : ['*']
  });
}

function loadLegacyProject(storage) {
  return {
    cables: safeParse(safeGet(storage, 'cableSchedule'), []),
    trays: safeParse(safeGet(storage, 'traySchedule'), []),
    conduits: safeParse(safeGet(storage, 'conduitSchedule'), []),
    ductbanks: safeParse(safeGet(storage, 'ductbankSchedule'), []),
    cableTypicals: safeParse(safeGet(storage, 'cableTypicals'), []),
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

function pushUndo(oldProject, { coalesceKey = '', allowCoalesce = false } = {}) {
  if (!compare) return;
  try {
    const patch = compare(project, oldProject);
    if (Array.isArray(patch) && patch.length) {
      const now = getNowMs();
      const canCoalesce = allowCoalesce
        && undoCoalesceState
        && undoCoalesceState.key === coalesceKey
        && (now - undoCoalesceState.timestamp) <= UNDO_COALESCE_WINDOW_MS
        && undoStack.length > 0;
      if (canCoalesce) {
        const mergedPatch = compare(project, undoCoalesceState.baseProject);
        if (Array.isArray(mergedPatch) && mergedPatch.length) {
          undoStack[undoStack.length - 1] = mergedPatch;
          undoCoalesceState.timestamp = now;
        }
      } else {
        undoStack.push(patch);
        undoCoalesceState = {
          key: coalesceKey,
          timestamp: now,
          baseProject: oldProject
        };
      }
      redoStack.length = 0;
      return;
    }
    if (!allowCoalesce) undoCoalesceState = null;
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

async function initializeProjectStorage() {
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

function getProjectState() {
  return cloneProject();
}

function setProjectState(next) {
  const oldProject = cloneProject();
  project = migrateProject(next || {});
  const changeSet = createChangeSet([
    'cables',
    'trays',
    'conduits',
    'ductbanks',
    'cableTypicals',
    'settings:session',
    'settings:collapsedGroups',
    'settings:other'
  ]);
  pushUndo(oldProject, { coalesceKey: 'setProjectState', allowCoalesce: false });
  persistProject({ changeSet, mutationType: 'setProjectState' });
}

function setProjectKey(key, value, options = {}) {
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
  } else if (key === 'cableTypicals') {
    project.cableTypicals = safeParse(value, []);
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
  const changeSet = key === 'cableSchedule'
    ? createChangeSet(['cables'])
    : key === 'traySchedule'
      ? createChangeSet(['trays'])
      : key === 'conduitSchedule'
        ? createChangeSet(['conduits'])
        : key === 'ductbankSchedule'
          ? createChangeSet(['ductbanks'])
          : key === 'cableTypicals'
            ? createChangeSet(['cableTypicals'])
            : key === 'collapsedGroups'
              ? createChangeSet(['settings:collapsedGroups'])
              : key === 'ctrSession'
                ? createChangeSet(['settings:session'])
                : createChangeSet(['settings:other']);
  pushUndo(oldProject, { coalesceKey: `setProjectKey:${key}`, allowCoalesce: true });
  if (!options.skipLocalStorage) {
    const storage = getStorage();
    trySetStorage(storage, key, value);
  }
  persistProject({ changeSet, mutationType: `setProjectKey:${key}` });
}

function removeProjectKey(key, options = {}) {
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
  } else if (key === 'cableTypicals') {
    project.cableTypicals = [];
  } else if (key === 'collapsedGroups') {
    if (project.settings) delete project.settings.collapsedGroups;
  } else if (key === 'ctrSession') {
    if (project.settings) delete project.settings.session;
  } else {
    if (project.settings) delete project.settings[key];
  }
  const changeSet = key === 'cableSchedule'
    ? createChangeSet(['cables'])
    : key === 'traySchedule'
      ? createChangeSet(['trays'])
      : key === 'conduitSchedule'
        ? createChangeSet(['conduits'])
        : key === 'ductbankSchedule'
          ? createChangeSet(['ductbanks'])
          : key === 'cableTypicals'
            ? createChangeSet(['cableTypicals'])
            : key === 'collapsedGroups'
              ? createChangeSet(['settings:collapsedGroups'])
              : key === 'ctrSession'
                ? createChangeSet(['settings:session'])
                : createChangeSet(['settings:other']);
  pushUndo(oldProject, { coalesceKey: `removeProjectKey:${key}`, allowCoalesce: true });
  if (!options.skipLocalStorage) {
    const storage = getStorage();
    if (storage && !storageWriteBlocked) {
      try { storage.removeItem(key); } catch {}
    }
  }
  persistProject({ changeSet, mutationType: `removeProjectKey:${key}` });
}

function undoProjectChange() {
  if (!undoStack.length || !applyPatch) return;
  undoCoalesceState = null;
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
    persistProject({ mutationType: 'undoProjectChange' });
  } catch (e) {
    console.warn('undo failed', e);
  }
}

function redoProjectChange() {
  if (!redoStack.length || !applyPatch) return;
  undoCoalesceState = null;
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
    persistProject({ mutationType: 'redoProjectChange' });
  } catch (e) {
    console.warn('redo failed', e);
  }
}

function canUndo() {
  return undoStack.length > 0;
}

function canRedo() {
  return redoStack.length > 0;
}

function onProjectChange(handler) {
  if (typeof handler !== 'function') return () => {};
  listeners$1.add(handler);
  return () => {
    listeners$1.delete(handler);
  };
}

loadExistingProject();
loadScenarioState();

const api$1 = {
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
  getThemePreference,
  setThemePreference,
  getConduitCache,
  setConduitCache,
  clearConduitCache,
  getAuthContextState,
  setAuthContextState,
  clearAuthContextState
};

if (typeof globalThis !== 'undefined') {
  globalThis.projectStorage = api$1;
}

/**
 * Centralized data store wrapper around localStorage with typed getters and setters
 * for core schedule data. Emits simple change events.
 */


registerScenario(getCurrentScenarioNameState());

function listScenarios() {
  return [...getScenarioListState()];
}

function getCurrentScenario() {
  return getCurrentScenarioNameState();
}

function switchScenario(name) {
  if (!name) return;
  registerScenario(name);
  setCurrentScenarioNameState(name);
  emit('scenario', getCurrentScenarioNameState());
}

function cloneScenario(newName, from = getCurrentScenarioNameState()) {
  if (!newName) return;
  cloneScenarioStorage(from, newName);
  registerScenario(newName);
}

function compareStudies(a, b) {
  const first = read(KEYS.studies, {}, a);
  const second = read(KEYS.studies, {}, b);
  return { [a]: first, [b]: second };
}

const KEYS = {
  // Preferred property names
  trays: 'traySchedule',
  cables: 'cableSchedule',
  cableTypicals: 'cableTypicals',
  ductbanks: 'ductbankSchedule',
  conduits: 'conduitSchedule',
  panels: 'panelSchedule',
  loads: 'loadList',
  equipment: 'equipment',
  oneLine: 'oneLineDiagram',
  studies: 'studyResults',
  // Legacy aliases for backward compatibility
  traySchedule: 'traySchedule',
  cableSchedule: 'cableSchedule',
  ductbankSchedule: 'ductbankSchedule',
  conduitSchedule: 'conduitSchedule',
  panelSchedule: 'panelSchedule',
  loadList: 'loadList',
  equipmentList: 'equipment',
  oneLineDiagram: 'oneLineDiagram'
};

const EXTRA_KEYS = {
  equipmentColumns: 'equipmentColumns',
  collapsedGroups: 'collapsedGroups',
  cableSchedulePreset: 'cableSchedulePreset',
  cableTemplates: 'cableTemplates',
  equipmentFilterPresets: 'equipmentFilterPresets',
  trayHardwareCatalogCustomProducts: 'trayHardwareCatalogCustomProducts',
  drcAcceptedFindings: 'drcAcceptedFindings',
  studyApprovals: 'studyApprovals',
  reportSnapshots: 'reportSnapshots',
  lifecyclePackages: 'lifecyclePackages',
  coachAuditTrail: 'coachAuditTrail',
  groundGridSoilMeasurements: 'groundGridSoilMeasurements',
  groundGridRiskPoints: 'groundGridRiskPoints',
};

const STORAGE_KEYS = { ...KEYS, ...EXTRA_KEYS };

const listeners = {};

function emit(event, detail) {
  (listeners[event] || []).forEach(fn => {
    try { fn(detail); } catch (e) { console.error(e); }
  });
}

/**
 * Subscribe to change events.
 * @param {string} event
 * @param {(data:any)=>void} handler
 */
function on(event, handler) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(handler);
}

/**
 * Remove an event listener.
 * @param {string} event
 * @param {(data:any)=>void} handler
 */
function off(event, handler) {
  const arr = listeners[event];
  if (!arr) return;
  const idx = arr.indexOf(handler);
  if (idx >= 0) arr.splice(idx, 1);
}

// Propagate localStorage changes across browser tabs/windows. When one page
// updates a schedule (e.g. cables from the One-Line view), other open pages
// need to receive the same event so their UIs stay in sync. The `storage`
// event only fires in other tabs, so we translate the changed key back into
// our internal event name and emit it.
const crossWindowKeys = new Set([
  ...Object.values(KEYS),
  ...Object.values(EXTRA_KEYS)
]);

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', e => {
    if (!e.key) return;
    const [scenario, key] = e.key.split(':');
    if (!key || scenario !== getCurrentScenarioNameState()) return;
    if (!crossWindowKeys.has(key)) return;
    try {
      const val = e.newValue ? JSON.parse(e.newValue) : undefined;
      emit(key, val);
    } catch (err) {
      console.warn('storage event: failed to parse value for key', e.key, err);
    }
  });
}

function read(key, fallback, scenario = getCurrentScenarioNameState()) {
  return readScenarioValue(key, fallback, scenario);
}

function write(key, value, scenario = getCurrentScenarioNameState()) {
  try {
    writeScenarioValue(key, value, scenario);
    emit(key, value);
  } catch (e) {
    console.error('Failed to store', key, e);
  }
}

/**
 * @returns {Tray[]}
 */
const getTrays = () => read(KEYS.trays, []);
/**
 * @param {Tray[]} trays
 */
const setTrays = trays => write(KEYS.trays, trays);

/**
 * @returns {Cable[]}
 */
const getCables = () => read(KEYS.cables, []);
/**
 * @param {Cable[]} cables
 */
const setCables = cables => write(KEYS.cables, cables);

const getCableTypicals = () => read(KEYS.cableTypicals, []);
const setCableTypicals = typicals => write(KEYS.cableTypicals, typicals);

const getCableTemplates = () => read(EXTRA_KEYS.cableTemplates, []);
const setCableTemplates = templates => write(EXTRA_KEYS.cableTemplates, templates);

// ---------------------------------------------------------------------------
// Report package snapshots
// ---------------------------------------------------------------------------

/** Return all saved report package snapshots keyed by snapshot id. */
const getReportSnapshots = () => read(EXTRA_KEYS.reportSnapshots, {});

/**
 * Persist a report package snapshot.
 * @param {string} id - snapshot identifier (e.g. 'pkg-1234567890')
 * @param {object} pkg - serializable ReportPackage object
 */
const setReportSnapshot = (id, pkg) => {
  const all = getReportSnapshots();
  all[id] = pkg;
  write(EXTRA_KEYS.reportSnapshots, all);
};

/**
 * Delete a saved report package snapshot.
 * @param {string} id
 */
const deleteReportSnapshot = id => {
  const all = getReportSnapshots();
  delete all[id];
  write(EXTRA_KEYS.reportSnapshots, all);
};

/**
 * Append a cable record to the existing cable schedule.
 * @param {Cable} cable
 */
const addCable = cable => {
  const list = getCables();
  list.push(cable);
  setCables(list);
};

/**
 * @returns {Ductbank[]}
 */
const getDuctbanks = () => read(KEYS.ductbanks, []);
/**
 * @param {Ductbank[]} banks
 */
const setDuctbanks = banks => write(KEYS.ductbanks, banks);

/**
 * @returns {Conduit[]}
 */
const getConduits = () => read(KEYS.conduits, []);
/**
 * @param {Conduit[]} conduits
 */
const setConduits = conduits => write(KEYS.conduits, conduits);

/**
 * Append a raceway record. If the object contains `tray_id` it is stored
 * with trays; otherwise it is assumed to be a conduit.
 * @param {Tray|Conduit} raceway
 */
const addRaceway = raceway => {
  if (!raceway) return;
  if (raceway.tray_id) {
    const trays = getTrays();
    trays.push(raceway);
    setTrays(trays);
  } else {
    const conduits = getConduits();
    conduits.push(raceway);
    setConduits(conduits);
  }
};

/**
 * @returns {GenericRecord[]}
 */
const getPanels = () => read(KEYS.panels, []);
/**
 * @param {GenericRecord} panel
 */
function ensurePanelFields(panel) {
  return {
    id: '',
    description: '',
    ref: '',
    voltage: '',
    manufacturer: '',
    model: '',
    phases: '',
    notes: '',
    mainRating: '',
    circuitCount: 42,
    ...panel
  };
}
/**
 * @param {GenericRecord[]} panels
 */
const setPanels = panels => write(KEYS.panels, panels.map(ensurePanelFields));

/**
 * @returns {GenericRecord[]}
 */
const getEquipment = () => read(KEYS.equipment, []);
/**
 * @param {GenericRecord[]} equipment
 */
function ensureEquipmentFields(eq) {
  return {
    id: '',
    ref: '',
    tag: '',
    description: '',
    voltage: '',
    category: '',
    subCategory: '',
    x: '',
    y: '',
    z: '',
    manufacturer: '',
    model: '',
    phases: '',
    notes: '',
    ...eq
  };
}

const setEquipment = list => write(KEYS.equipment, list.map(ensureEquipmentFields));

const addEquipment$1 = item => {
  const list = getEquipment();
  list.push(ensureEquipmentFields(item));
  setEquipment(list);
};

const updateEquipment = (index, item) => {
  const list = getEquipment();
  if (index >= 0 && index < list.length) {
    list[index] = ensureEquipmentFields({ ...list[index], ...item });
    setEquipment(list);
  }
};

const removeEquipment = index => {
  const list = getEquipment();
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
    setEquipment(list);
  }
};

/**
 * @typedef {Object} OneLineComponent
 * @property {string} id Unique identifier
 * @property {string} type Component type (equipment, panel, load)
 * @property {number} x X coordinate
 * @property {number} y Y coordinate
 * @property {string} [label] Display label
 * @property {string} [ref] Linked schedule id
 * @property {{target:string, cable?:Cable}[]} [connections] Connections to other components with optional cable spec
 * @property {string} [layer] Named layer id this component belongs to (Gap #51)
 */

/**
 * @typedef {Object} OneLineLayer
 * @property {string} id Unique layer identifier
 * @property {string} name Display name
 * @property {boolean} visible Whether components on this layer are rendered
 * @property {boolean} locked Whether components on this layer are selectable/editable
 */

/**
 * @typedef {Object} OneLineSheet
 * @property {string} name
 * @property {OneLineComponent[]} components
 * @property {OneLineLayer[]} [layers] Named layers for this sheet (Gap #51)
 */

/**
 * Retrieve saved one-line sheets. Supports legacy single-sheet format.
 * @returns {OneLineSheet[]}
 */
const getOneLine = (scenario = getCurrentScenarioNameState()) => {
  const data = read(KEYS.oneLine, {}, scenario);
  if (Array.isArray(data)) {
    // legacy array of components
    return { activeSheet: 0, sheets: [{ name: 'Sheet 1', components: data, connections: [], layers: [] }] };
  }
  if (data && Array.isArray(data.sheets)) {
    return {
      activeSheet: data.activeSheet || 0,
      sheets: data.sheets.map(s => ({
        name: s.name,
        components: Array.isArray(s.components) ? s.components : [],
        connections: Array.isArray(s.connections) ? s.connections : [],
        layers: Array.isArray(s.layers) ? s.layers : [],
        // Gap #52: preserve background image underlay per sheet
        ...(s.backgroundImage ? { backgroundImage: s.backgroundImage } : {}),
        // Gap #50: preserve protection zone definitions per sheet
        ...(Array.isArray(s.protectionZones) ? { protectionZones: s.protectionZones } : {})
      }))
    };
  }
  return { activeSheet: 0, sheets: [] };
};
/**
 * Persist one-line sheets
 * @param {OneLineSheet[]} sheets
 */
const REVISION_KEY = 'oneLineRevisions';
const MAX_REVISION_COUNT = 6;
const MAX_REVISION_BYTES = 512 * 1024;

function pruneRevisions(revisions) {
  if (!Array.isArray(revisions)) return [];
  if (revisions.length > MAX_REVISION_COUNT) {
    revisions.splice(0, revisions.length - MAX_REVISION_COUNT);
  }
  {
    let serialized = JSON.stringify(revisions);
    if (serialized.length > MAX_REVISION_BYTES) {
      while (revisions.length > 1 && serialized.length > MAX_REVISION_BYTES) {
        revisions.shift();
        serialized = JSON.stringify(revisions);
      }
      if (serialized.length > MAX_REVISION_BYTES) {
        revisions.length = 0;
      }
    }
  }
  return revisions;
}

const getRevisions = (scenario = getCurrentScenarioNameState()) => read(REVISION_KEY, [], scenario);

function addRevision(sheets, scenario = getCurrentScenarioNameState()) {
  const revs = getRevisions(scenario);
  revs.push({ time: Date.now(), sheets: JSON.parse(JSON.stringify(sheets)) });
  pruneRevisions(revs);
  write(REVISION_KEY, revs, scenario);
}

const restoreRevision = (index, scenario = getCurrentScenarioNameState()) => {
  const revs = getRevisions(scenario);
  const rev = revs[index];
  if (rev) {
    write(KEYS.oneLine, { activeSheet: 0, sheets: rev.sheets }, scenario);
  }
  return rev ? rev.sheets : null;
};

const setOneLine = (data, scenario = getCurrentScenarioNameState()) => {
  const prev = getOneLine(scenario);
  if (Array.isArray(prev.sheets) && prev.sheets.length) addRevision(prev.sheets, scenario);
  const payload = {
    activeSheet: data.activeSheet || 0,
    sheets: Array.isArray(data.sheets) ? data.sheets : []
  };
  write(KEYS.oneLine, payload, scenario);
};

/**
 * Retrieve persisted study results.
 * @returns {Object}
 */
const getStudies = () => read(KEYS.studies, {});
/**
 * Store study results.
 * @param {Object} results
 */
const setStudies = results => write(KEYS.studies, results);

/**
 * @returns {GenericRecord[]}
 */
const getLoads = () => {
  const raw = read(KEYS.loads, []);
  const loads = raw.map(ensureLoadFields);
  if (raw.some(l => l && typeof l === 'object' && !('source' in l))) {
    write(KEYS.loads, loads);
  }
  return loads;
};
/**
 * @param {GenericRecord[]} loads
 */
function ensureLoadFields(load) {
  const l = { ...load };
  if ('power' in l && !('kw' in l)) {
    l.kw = l.power;
    delete l.power;
  }
  return {
    id: '',
    ref: '',
    source: '',
    tag: '',
    description: '',
    quantity: '',
    voltage: '',
    loadType: '',
    duty: '',
    kw: '',
    powerFactor: '',
    loadFactor: '',
    efficiency: '',
    demandFactor: '',
    phases: '',
    circuit: '',
    manufacturer: '',
    model: '',
    notes: '',
    ...l
  };
}

function isEmptyLoad(load) {
  const l = ensureLoadFields(load);
  return Object.values(l).every(v => v === '');
}

const setLoads = loads => {
  const list = (loads.length ? loads : [{}]).map(ensureLoadFields);
  write(KEYS.loads, list);
};

const addLoad = load => {
  const loads = getLoads();
  const normalized = ensureLoadFields(load);
  if (loads.length === 1 && isEmptyLoad(loads[0]) && !isEmptyLoad(normalized)) {
    loads[0] = normalized;
  } else {
    loads.push(normalized);
  }
  setLoads(loads);
};

const insertLoad = (index, load) => {
  const loads = getLoads();
  const normalized = ensureLoadFields(load);
  const idx = Math.max(0, Math.min(index, loads.length));
  loads.splice(idx, 0, normalized);
  setLoads(loads);
};

const updateLoad = (index, load) => {
  const loads = getLoads();
  if (index >= 0 && index < loads.length) {
    loads[index] = ensureLoadFields({ ...loads[index], ...load });
    setLoads(loads);
  }
};

const deleteLoad = index => {
  const loads = getLoads();
  if (index >= 0 && index < loads.length) {
    loads.splice(index, 1);
    setLoads(loads);
  }
};

// Backward compatibility
const removeLoad = deleteLoad;

// generic access for other values so pages never touch localStorage directly
const getItem = (key, fallback = null, scenario) => read(key, fallback, scenario);
const setItem = (key, value, scenario) => write(key, value, scenario);
const removeItem = (key, scenario = getCurrentScenarioNameState()) => {
  try {
    removeScenarioValue(key, scenario);
    emit(key, null);
  } catch (e) {
    console.error('Failed to remove', key, e);
  }
};


const keys = (scenario = getCurrentScenarioNameState()) => {
  try {
    return listScenarioKeysState(scenario);
  } catch {
    return [];
  }
};

function saveProject(projectId, scenario = getCurrentScenarioNameState()) {
  if (!projectId) return;
  try {
    const payload = {
      equipment: getEquipment(),
      panels: getPanels(),
      loads: getLoads(),
      cables: getCables(),
      cableTypicals: getCableTypicals(),
      cableTemplates: getCableTemplates(),
      raceways: {
        trays: getTrays(),
        conduits: getConduits(),
        ductbanks: getDuctbanks()
      },
      oneLine: getOneLine(scenario)
    };
    writeSavedProject(projectId, payload);
    // Notify collaboration layer so remote clients receive the update
    if (typeof document !== 'undefined') {
      try {
        document.dispatchEvent(new CustomEvent('ctr:project-saved', { detail: payload }));
      } catch { /* non-critical */ }
    }
  } catch (e) {
    console.error('Failed to save project', e);
  }
}

function loadProject(projectId, scenario = getCurrentScenarioNameState()) {
  if (!projectId) return false;
  try {
    const rawPayload = readSavedProject(projectId);
    if (!rawPayload) return false;
    const payload = rawPayload || {};
    const migrated = wasSavedProjectMigrated(projectId);
    const equipment = payload.equipment;
    const panels = payload.panels;
    const loads = payload.loads;
    const cables = payload.cables;
    const cableTypicals = payload.cableTypicals;
    const cableTemplates = payload.cableTemplates;
    const raceways = payload.raceways || {};
    const oneLine = payload.oneLine || {};
    if (Array.isArray(equipment)) setEquipment(equipment); else setEquipment([]);
    if (Array.isArray(panels)) setPanels(panels); else setPanels([]);
    if (Array.isArray(loads)) setLoads(loads);
    if (Array.isArray(cables)) setCables(cables); else setCables([]);
    if (Array.isArray(cableTypicals)) setCableTypicals(cableTypicals); else setCableTypicals([]);
    if (Array.isArray(cableTemplates)) setCableTemplates(cableTemplates); else setCableTemplates([]);
    setTrays(Array.isArray(raceways.trays) ? raceways.trays : []);
    setConduits(Array.isArray(raceways.conduits) ? raceways.conduits : []);
    setDuctbanks(Array.isArray(raceways.ductbanks) ? raceways.ductbanks : []);
    if (Array.isArray(oneLine)) {
      setOneLine({ activeSheet: 0, sheets: oneLine }, scenario);
    } else {
      setOneLine(oneLine || { activeSheet: 0, sheets: [] }, scenario);
    }
    if (migrated) saveProject(projectId, scenario);
    return true;
  } catch (e) {
    console.error('Failed to load project', e);
    return false;
  }
}

/**
 * Apply a remote project snapshot received from the collaboration server.
 *
 * Unlike saveProject() + loadProject(), this function applies data directly
 * to in-memory state and persists it WITHOUT dispatching 'ctr:project-saved'
 * (which would echo the patch back to the server and cause an infinite loop).
 *
 * After applying, it dispatches 'ctr:remote-applied' so page-level code can
 * refresh its rendered tables.
 *
 * @param {object} snapshot - Full project payload as sent by saveProject()
 * @param {string} [projectId] - Target project ID (defaults to window.currentProjectId)
 */
function applyRemoteSnapshot(snapshot, projectId) {
  if (!snapshot || typeof snapshot !== 'object') return;
  try {
    const { equipment, panels, loads, cables, cableTypicals, cableTemplates, raceways = {}, oneLine } = snapshot;
    if (Array.isArray(equipment)) setEquipment(equipment);
    if (Array.isArray(panels)) setPanels(panels);
    if (Array.isArray(loads)) setLoads(loads);
    if (Array.isArray(cables)) setCables(cables);
    if (Array.isArray(cableTypicals)) setCableTypicals(cableTypicals);
    if (Array.isArray(cableTemplates)) setCableTemplates(cableTemplates);
    setTrays(Array.isArray(raceways.trays) ? raceways.trays : []);
    setConduits(Array.isArray(raceways.conduits) ? raceways.conduits : []);
    setDuctbanks(Array.isArray(raceways.ductbanks) ? raceways.ductbanks : []);
    const scenario = getCurrentScenarioNameState();
    if (oneLine !== undefined) {
      if (Array.isArray(oneLine)) {
        setOneLine({ activeSheet: 0, sheets: oneLine }, scenario);
      } else {
        setOneLine(oneLine || { activeSheet: 0, sheets: [] }, scenario);
      }
    }
    // Persist to storage so subsequent loadProject() calls see the updated data
    const pid = projectId || (typeof window !== 'undefined' && window.currentProjectId) || null;
    if (pid) writeSavedProject(pid, snapshot);
    // Notify page-level code that remote data has been applied
    if (typeof document !== 'undefined') {
      try {
        document.dispatchEvent(new CustomEvent('ctr:remote-applied', { detail: { projectId: pid } }));
      } catch { /* non-critical */ }
    }
  } catch (e) {
    console.warn('[collab] Failed to apply remote snapshot', e);
  }
}

// Simple schema validator replacing Ajv. Checks for required fields,
// disallows extras, and verifies basic types.
function validateProjectSchema(obj) {
  const required = ['ductbanks', 'conduits', 'trays', 'cables', 'cableTypicals', 'panels', 'equipment', 'loads', 'settings'];
  const optional = ['oneLine'];
  const missing = [];
  const extra = [];

  if (!obj || typeof obj !== 'object') {
    missing.push(...required);
    return { valid: false, missing, extra };
  }

  for (const key of required) {
    if (!(key in obj)) missing.push(key);
  }
  for (const key of Object.keys(obj)) {
    if (!required.includes(key) && !optional.includes(key)) extra.push(key);
  }

  const typesValid = Array.isArray(obj.ductbanks) &&
    Array.isArray(obj.conduits) &&
    Array.isArray(obj.trays) &&
    Array.isArray(obj.cables) &&
    Array.isArray(obj.cableTypicals) &&
    Array.isArray(obj.panels) &&
    Array.isArray(obj.equipment) &&
    Array.isArray(obj.loads) &&
    obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings) &&
    (obj.oneLine === undefined || Array.isArray(obj.oneLine) || Array.isArray(obj.oneLine?.sheets));

  const valid = missing.length === 0 && extra.length === 0 && typesValid;
  return { valid, missing, extra };
}

/**
 * Export current project data.
 */
function exportProject() {
  const project = {
    ductbanks: getDuctbanks(),
    conduits: getConduits(),
    trays: getTrays(),
    cables: getCables(),
    cableTypicals: getCableTypicals(),
    panels: getPanels(),
    equipment: getEquipment(),
    loads: getLoads(),
    oneLine: getOneLine(),
    settings: {}
  };
  const reserved = new Set([...Object.values(KEYS), 'CTR_PROJECT_V1']);
  for (const key of keys()) {
    if (!reserved.has(key)) {
      project.settings[key] = getItem(key);
    }
  }
  const meta = { version: 1, scenario: getCurrentScenarioNameState(), scenarios: listScenarios() };
  return { meta, ...project };
}

/**
 * Import tray and conduit geometry from a CAD export file (Revit JSON or IFC).
 * Updates the current data store schedules.
 *
 * @param {File|string} file Input file or raw text
 * @returns {Promise<{trays:any[], conduits:any[]}>}
 */
async function importFromCad(file) {
  let text;
  if (typeof file === 'string') {
    text = file;
  } else if (file && typeof file.text === 'function') {
    text = await file.text();
  } else {
    throw new Error('Unsupported CAD file');
  }

  const { trays = [], conduits = [] } = parseRevit(text);
  if (Array.isArray(trays) && trays.length) setTrays(trays);
  if (Array.isArray(conduits) && conduits.length) setConduits(conduits);
  return { trays, conduits };
}

/**
 * Export tray and conduit geometry to a CAD-friendly format. Currently
 * only JSON is supported. When executed in a browser environment the
 * file is automatically downloaded.
 *
 * @param {string} [fileType='json']
 * @returns {string} serialized content
 */
function exportToCad(fileType = 'json') {
  const data = { trays: getTrays(), conduits: getConduits() };
  let mime = 'application/json';
  let ext = 'json';
  let content = JSON.stringify(data, null, 2);

  if (fileType === 'csv') {
    const trayHeader = 'id,start_x,start_y,start_z,end_x,end_y,end_z,width,height';
    const trayRows = data.trays.map(t => [t.id, t.start_x, t.start_y, t.start_z, t.end_x, t.end_y, t.end_z, t.width, t.height].join(','));
    const conduitHeader = 'conduit_id,type,trade_size,start_x,start_y,start_z,end_x,end_y,end_z,capacity';
    const conduitRows = data.conduits.map(c => [c.conduit_id, c.type, c.trade_size, c.start_x, c.start_y, c.start_z, c.end_x, c.end_y, c.end_z, c.capacity].join(','));
    content = `# trays\n${[trayHeader, ...trayRows].join('\n')}\n# conduits\n${[conduitHeader, ...conduitRows].join('\n')}`;
    mime = 'text/csv';
    ext = 'csv';
  }

  if (typeof document !== 'undefined') {
    try {
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `raceways.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('Failed to export CAD data', e);
    }
  }
  return content;
}

/**
 * Import project data with schema validation.
 * @param {any} obj
 * @returns {boolean} success
 */
function importProject(obj) {
  const { meta, ...rest } = obj || {};
  if (meta && Array.isArray(meta.scenarios)) {
    setScenarioListState(meta.scenarios);
  }
  if (meta && meta.scenario) switchScenario(meta.scenario);
  let data = rest;
  const { valid, missing, extra } = validateProjectSchema(data);
  if (!valid) {
    const parts = [];
    if (missing.length) parts.push(`Missing fields: ${missing.join(', ')}`);
    if (extra.length) parts.push(`Extra fields: ${extra.join(', ')}`);
    const msg = parts.join('\n') || 'Invalid project data.';
    const proceed = (typeof window !== 'undefined' && typeof window.confirm === 'function')
      ? window.confirm(`${msg}\nRepair & continue?`)
      : false;
    if (!proceed) return false;
    data = {
      ductbanks: Array.isArray(obj.ductbanks) ? obj.ductbanks : [],
      conduits: Array.isArray(obj.conduits) ? obj.conduits : [],
      trays: Array.isArray(obj.trays) ? obj.trays : [],
      cables: Array.isArray(obj.cables) ? obj.cables : [],
      cableTypicals: Array.isArray(obj.cableTypicals) ? obj.cableTypicals : [],
      panels: Array.isArray(obj.panels) ? obj.panels : [],
      equipment: Array.isArray(obj.equipment) ? obj.equipment : [],
      loads: Array.isArray(obj.loads) ? obj.loads : [],
      oneLine: Array.isArray(obj.oneLine) ? obj.oneLine : [],
      settings: (obj.settings && typeof obj.settings === 'object') ? obj.settings : {}
    };
  }

  setDuctbanks(data.ductbanks);
  setConduits(data.conduits);
  setTrays(data.trays);
  setCables(data.cables);
  setCableTypicals(Array.isArray(data.cableTypicals) ? data.cableTypicals : []);
  setPanels(Array.isArray(data.panels) ? data.panels : []);
  setEquipment(Array.isArray(data.equipment) ? data.equipment : []);
  setLoads(Array.isArray(data.loads) ? data.loads : []);
  if (Array.isArray(data.oneLine)) {
    setOneLine({ activeSheet: 0, sheets: data.oneLine });
  } else if (data.oneLine && Array.isArray(data.oneLine.sheets)) {
    setOneLine({ activeSheet: data.oneLine.activeSheet || 0, sheets: data.oneLine.sheets });
  } else {
    setOneLine({ activeSheet: 0, sheets: [] });
  }

  const reserved = new Set([...Object.values(KEYS), 'CTR_PROJECT_V1']);
  for (const key of keys()) {
    if (!reserved.has(key) && !(data.settings && key in data.settings)) {
      removeItem(key);
    }
  }
  if (data.settings) {
    for (const [k, v] of Object.entries(data.settings)) {
      setItem(k, v);
    }
  }
  return true;
}

// expose on window for non-module scripts
if (typeof window !== 'undefined') {
  window.dataStore = {
    STORAGE_KEYS,
    getTrays,
    setTrays,
    getCables,
    setCables,
    getCableTypicals,
    setCableTypicals,
    addCable,
    getDuctbanks,
    setDuctbanks,
    getConduits,
    setConduits,
    addRaceway,
    getPanels,
    setPanels,
    getEquipment,
    setEquipment,
    addEquipment: addEquipment$1,
    updateEquipment,
    removeEquipment,
    getLoads,
    setLoads,
    addLoad,
    insertLoad,
    updateLoad,
    removeLoad,
    getOneLine,
    setOneLine,
    getRevisions,
    restoreRevision,
    getStudies,
    setStudies,
    getItem,
    setItem,
    removeItem,
    listScenarios,
    getCurrentScenario,
    switchScenario,
    cloneScenario,
    compareStudies,
    on,
    off,
    keys,
    exportProject,
    importProject,
    saveProject,
    loadProject,
    applyRemoteSnapshot,
    importFromCad,
    exportToCad,
    getReportSnapshots,
    setReportSnapshot,
    deleteReportSnapshot
  };
}

const workflowOrder = [
  { key: 'cableSchedule', label: '1. Cable Schedule', href: 'cableschedule.html' },
  { key: 'racewaySchedule', label: '2. Raceway Schedule', href: 'racewayschedule.html' },
  { key: 'ductbankSchedule', label: '3. Ductbank', href: 'ductbankroute.html' },
  { key: 'traySchedule', label: '4. Tray Fill', href: 'cabletrayfill.html' },
  { key: 'conduitSchedule', label: '5. Conduit Fill', href: 'conduitfill.html' },
  { key: 'optimalRoute', label: '6. Optimal Cable Route', href: 'optimalRoute.html' },
  { key: 'oneLineDiagram', label: '7. One-Line Diagram', href: 'oneline.html' }
];

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getStepStatus(key) {
  if (key === 'cableSchedule') {
    const count = getCables().length;
    if (count > 0) return { complete: true, label: pluralize(count, 'cable', 'cables') };
    return { complete: false, label: 'Add cables to begin', hint: 'Define the cables to be routed.' };
  }
  if (key === 'racewaySchedule') {
    const trays = getTrays().length;
    const conduits = getConduits().length;
    const ductbanks = getDuctbanks().length;
    const total = trays + conduits + ductbanks;
    if (total > 0) {
      const parts = [];
      if (trays > 0) parts.push(pluralize(trays, 'tray', 'trays'));
      if (conduits > 0) parts.push(pluralize(conduits, 'conduit', 'conduits'));
      if (ductbanks > 0) parts.push(pluralize(ductbanks, 'ductbank', 'ductbanks'));
      return { complete: true, label: parts.join(', ') };
    }
    return { complete: false, label: 'Add trays or conduits', hint: 'Catalog the raceway infrastructure.' };
  }
  if (key === 'ductbankSchedule') {
    const count = getDuctbanks().length;
    if (count > 0) return { complete: true, label: pluralize(count, 'ductbank', 'ductbanks') };
    return { complete: false, label: 'Optional — no ductbanks yet', hint: 'Analyze underground ductbanks for thermal constraints.' };
  }
  if (key === 'traySchedule') {
    const count = getTrays().length;
    if (count > 0) return { complete: true, label: pluralize(count, 'tray', 'trays') };
    return { complete: false, label: 'Add trays in Raceway Schedule', hint: 'Tray fill requires trays defined in Raceway Schedule.' };
  }
  if (key === 'conduitSchedule') {
    const count = getConduits().length;
    if (count > 0) return { complete: true, label: pluralize(count, 'conduit', 'conduits') };
    return { complete: false, label: 'Add conduits in Raceway Schedule', hint: 'Conduit fill requires conduits defined in Raceway Schedule.' };
  }
  if (key === 'optimalRoute') {
    const cables = getCables().length;
    const trays = getTrays().length;
    if (cables > 0 && trays > 0) return { complete: true, label: `${pluralize(cables, 'cable', 'cables')} ready to route` };
    if (cables === 0) return { complete: false, label: 'Needs cables first', hint: 'Define cables in Cable Schedule before routing.' };
    return { complete: false, label: 'Needs raceway data', hint: 'Add trays or conduits in Raceway Schedule before routing.' };
  }
  if (key === 'oneLineDiagram') {
    const { sheets } = getOneLine();
    const componentCount = sheets.reduce((sum, s) => sum + (s.components || []).length, 0);
    if (componentCount > 0) return { complete: true, label: pluralize(componentCount, 'component', 'components') };
    return { complete: false, label: 'Not started', hint: 'Draw a single-line diagram and export to PDF or DXF.' };
  }
  return { complete: false, label: 'Not started', hint: null };
}

window.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.workflow-grid .workflow-card');
  let completeCount = 0;

  cards.forEach(card => {
    const key = card.dataset.storageKey;
    const statusEl = card.querySelector('.status');
    if (!statusEl || !key) return;

    const { complete, label, hint } = getStepStatus(key);

    statusEl.textContent = label;

    if (complete) {
      card.classList.add('complete');
      statusEl.classList.add('status-complete');
      statusEl.setAttribute('aria-label', `Complete — ${label}`);
      completeCount += 1;
    } else {
      statusEl.classList.add('status-incomplete');
      if (hint) {
        card.setAttribute('title', hint);
        card.setAttribute('aria-description', hint);
      }
    }
  });

  const progressSection = document.getElementById('workflow-summary-section');
  if (progressSection && completeCount > 0) {
    progressSection.removeAttribute('hidden');
  }

  const progressText = document.getElementById('workflow-progress-text');
  if (progressText) {
    progressText.textContent = `${completeCount} of ${workflowOrder.length} workflow steps complete.`;
  }

  const progressTrack = document.getElementById('workflow-progress-bar-track');
  const progressFill = document.getElementById('workflow-progress-fill');
  if (progressTrack && progressFill) {
    const pct = Math.round((completeCount / workflowOrder.length) * 100);
    progressFill.style.width = `${pct}%`;
    progressTrack.setAttribute('aria-valuenow', completeCount);
  }

  const nextStep = workflowOrder.find(step => !getStepStatus(step.key).complete);
  const nextStepEl = document.getElementById('workflow-next-step');
  if (nextStepEl) {
    if (nextStep) {
      nextStepEl.textContent = 'Next recommended step: ';
      const link = document.createElement('a');
      link.href = nextStep.href;
      link.textContent = nextStep.label;
      nextStepEl.appendChild(link);
    } else {
      nextStepEl.textContent = 'All workflow steps are complete. You are ready to generate reports.';
    }
  }
});

/**
 * Client-side error tracking.
 *
 * Captures uncaught exceptions and unhandled promise rejections then
 * forwards them to POST /api/errors so they are visible in server logs.
 *
 * Design goals:
 *  - Zero dependencies, tiny footprint.
 *  - Client-side rate limiting: at most MAX_ERRORS_PER_SESSION unique
 *    errors are reported per page session to avoid flooding.
 *  - Network errors while reporting are swallowed silently.
 *  - Never throws; cannot break the host page.
 */

const MAX_ERRORS_PER_SESSION = 20;
const ENDPOINT = '/api/errors';

let reported = 0;
const seen = new Set();

/**
 * Serialize an Error or arbitrary thrown value to a plain object.
 * @param {unknown} err
 * @returns {{ message: string, stack: string|null, name: string }}
 */
function serializeError(err) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack ?? null };
  }
  try {
    return { name: 'UnknownError', message: String(err), stack: null };
  } catch {
    return { name: 'UnknownError', message: '(unserializable)', stack: null };
  }
}

/**
 * Deduplicate by a simple key so the same crash loop doesn't generate
 * thousands of identical reports.
 * @param {string} message
 * @param {string|null|undefined} source
 * @param {number|null|undefined} lineno
 * @returns {boolean} true if this error has already been seen
 */
function isDuplicate(message, source, lineno) {
  const key = `${message}|${source ?? ''}|${lineno ?? ''}`;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

/**
 * POST the error payload to the server. Failures are intentionally ignored.
 * @param {object} payload
 */
function send(payload) {
  if (reported >= MAX_ERRORS_PER_SESSION) return;
  reported += 1;

  const body = JSON.stringify({
    ...payload,
    page: globalThis.location?.pathname ?? '',
    userAgent: globalThis.navigator?.userAgent ?? '',
    timestamp: new Date().toISOString(),
  });

  // Prefer sendBeacon (fire-and-forget, survives navigation) when available.
  if (typeof globalThis.navigator?.sendBeacon === 'function') {
    globalThis.navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    return;
  }

  // Fall back to fetch (best-effort, no await — intentional).
  globalThis.fetch?.(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    // keepalive allows the request to outlive the page.
    keepalive: true,
  }).catch(() => { /* swallow network errors */ });
}

/**
 * Handle a window.onerror event.
 * @type {OnErrorEventHandler}
 */
function onError(message, source, lineno, colno, error) {
  const msg = typeof message === 'string' ? message : String(message);
  if (isDuplicate(msg, source, lineno)) return;
  const serialized = error ? serializeError(error) : { name: 'Error', message: msg, stack: null };
  send({ type: 'uncaught', source: source ?? null, lineno: lineno ?? null, colno: colno ?? null, error: serialized });
}

/**
 * Handle an unhandledrejection event.
 * @param {PromiseRejectionEvent} event
 */
function onUnhandledRejection(event) {
  const serialized = serializeError(event.reason);
  if (isDuplicate(serialized.message, null, null)) return;
  send({ type: 'unhandledrejection', error: serialized });
}

/**
 * Attach global error listeners. Safe to call multiple times (idempotent via
 * the `installed` guard).
 */
let installed = false;
function installErrorTracking() {
  if (installed || typeof globalThis.addEventListener !== 'function') return;
  installed = true;

  const prevOnError = globalThis.onerror;
  globalThis.onerror = function (message, source, lineno, colno, error) {
    onError(message, source, lineno, colno, error);
    // Preserve any previously installed handler.
    if (typeof prevOnError === 'function') {
      return prevOnError.call(this, message, source, lineno, colno, error);
    }
    return false; // don't suppress the default console output
  };

  globalThis.addEventListener('unhandledrejection', onUnhandledRejection);
}

/**
 * Simple command-pattern undo/redo manager.
 *
 * Usage:
 *   const mgr = new UndoRedoManager();
 *   mgr.push(
 *     () => restore(before),   // undo fn
 *     () => restore(after)     // redo fn
 *   );
 *   mgr.undo();
 *   mgr.redo();
 */
class UndoRedoManager {
  constructor({ maxSize = 50, onUndo, onRedo } = {}) {
    this._undo = [];
    this._redo = [];
    this._maxSize = maxSize;
    this._onUndo = onUndo || null;
    this._onRedo = onRedo || null;
  }

  /**
   * Record a reversible action.
   * @param {() => void} undoFn  - function to call when undoing
   * @param {() => void} redoFn  - function to call when redoing
   * @param {string} [label]     - optional description (e.g. "Edit row")
   */
  push(undoFn, redoFn, label = '') {
    this._undo.push({ fn: undoFn, redoFn, label });
    if (this._undo.length > this._maxSize) this._undo.shift();
    this._redo = [];
  }

  undo() {
    const entry = this._undo.pop();
    if (!entry) return false;
    this._redo.push(entry);
    try { entry.fn(); } catch (e) { console.error('[undo] error', e); }
    if (this._onUndo) this._onUndo(entry.label);
    return true;
  }

  redo() {
    const entry = this._redo.pop();
    if (!entry) return false;
    this._undo.push(entry);
    try { entry.redoFn(); } catch (e) { console.error('[redo] error', e); }
    if (this._onRedo) this._onRedo(entry.label);
    return true;
  }

  canUndo() { return this._undo.length > 0; }
  canRedo() { return this._redo.length > 0; }

  clear() {
    this._undo = [];
    this._redo = [];
  }
}

const FOCUSABLE_SELECTORS = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

const MODAL_WIDTH_TOKENS = {
  small: 'var(--size-modal-sm)',
  medium: 'var(--size-modal-md)',
  wide: 'var(--size-modal-lg)'
};

function getFocusableElements(container) {
  if (!container) return [];
  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)).filter(el => {
    return el.offsetWidth > 0 || el.offsetHeight > 0 || el === doc.activeElement;
  });
}

function trapFocus$1(event, container) {
  if (event.key !== 'Tab') return;
  const focusable = getFocusableElements(container);
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const active = doc?.activeElement;
  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

function defaultDoc() {
  if (typeof document === 'undefined') return null;
  return document;
}

let modalCount = 0;

function openModal(options = {}) {
  const doc = defaultDoc();
  if (!doc) {
    return Promise.resolve(null);
  }

  const {
    title = 'Dialog',
    description = '',
    primaryText = 'OK',
    secondaryText = 'Cancel',
    closeOnEscape = true,
    closeOnBackdrop = true,
    onSubmit,
    onCancel,
    render,
    initialFocusSelector,
    variant,
    closeLabel = 'Close dialog',
    resizable = false,
    defaultWidth
  } = options;

  return new Promise(resolve => {
    const previouslyFocused = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const overlay = doc.createElement('div');
    overlay.className = 'modal component-modal';
    overlay.style.display = 'flex';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    modalCount += 1;
    const titleId = options.labelledById || `ctr-modal-title-${modalCount}`;
    overlay.setAttribute('aria-labelledby', titleId);
    let descriptionId = null;
    if (description) {
      descriptionId = options.describedById || `ctr-modal-description-${modalCount}`;
      overlay.setAttribute('aria-describedby', descriptionId);
    }

    const content = doc.createElement('div');
    content.className = 'modal-content';
    if (variant) {
      content.dataset.variant = variant;
    }
    if (resizable) {
      content.classList.add('modal-resizable');
    }
    if (defaultWidth !== null && defaultWidth !== undefined) {
      let widthValue = defaultWidth;
      if (typeof defaultWidth === 'string' && MODAL_WIDTH_TOKENS[defaultWidth]) {
        widthValue = MODAL_WIDTH_TOKENS[defaultWidth];
      } else if (typeof defaultWidth === 'number') {
        widthValue = `${defaultWidth}px`;
      }
      content.style.width = String(widthValue);
    }

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'close-btn';
    closeBtn.setAttribute('aria-label', closeLabel);
    closeBtn.textContent = '×';

    const heading = doc.createElement('h2');
    heading.id = titleId;
    heading.className = 'modal-title';
    heading.textContent = title;

    const body = doc.createElement('div');
    body.className = 'modal-body';

    if (description) {
      const desc = doc.createElement('p');
      desc.id = descriptionId;
      desc.className = 'modal-description';
      desc.textContent = description;
      body.appendChild(desc);
    }

    const actions = doc.createElement('div');
    actions.className = 'modal-actions';

    const primaryBtn = doc.createElement('button');
    primaryBtn.type = 'button';
    primaryBtn.className = 'btn primary-btn';
    primaryBtn.textContent = primaryText;

    let secondaryBtn = null;
    if (secondaryText !== null && secondaryText !== undefined) {
      secondaryBtn = doc.createElement('button');
      secondaryBtn.type = 'button';
      secondaryBtn.className = 'btn secondary-btn';
      secondaryBtn.textContent = secondaryText;
      actions.appendChild(secondaryBtn);
    }
    actions.appendChild(primaryBtn);

    content.append(closeBtn, heading, body, actions);
    overlay.appendChild(content);

    const forms = new Set();
    let initialFocus = null;
    let closed = false;
    let backdropPointerDown = false;

    function cleanup(result, { cancelled = false } = {}) {
      if (closed) return;
      closed = true;
      overlay.removeEventListener('keydown', onKeyDown, true);
      overlay.removeEventListener('click', onOverlayClick);
      overlay.removeEventListener('pointerdown', onOverlayPointerDown);
      closeBtn.removeEventListener('click', handleCancel);
      if (secondaryBtn) secondaryBtn.removeEventListener('click', handleCancel);
      primaryBtn.removeEventListener('click', handleSubmit);
      forms.forEach(form => form.removeEventListener('submit', handleFormSubmit));
      doc.body.classList.remove('modal-open');
      overlay.remove();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
      if (cancelled && typeof onCancel === 'function') {
        onCancel();
      }
      resolve(result);
    }

    function handleFormSubmit(event) {
      event.preventDefault();
      handleSubmit();
    }

    function handleSubmit() {
      if (typeof onSubmit === 'function') {
        const result = onSubmit(controller);
        if (result === false) {
          return;
        }
        cleanup(result);
      } else {
        cleanup(true);
      }
    }

    function handleCancel() {
      cleanup(null, { cancelled: true });
    }

    function onOverlayPointerDown(event) {
      backdropPointerDown = event.target === overlay;
    }

    function onOverlayClick(event) {
      if (!closeOnBackdrop) return;
      if (event.target === overlay && backdropPointerDown) {
        cleanup(null, { cancelled: true });
      }
      backdropPointerDown = false;
    }

    function onKeyDown(event) {
      if (closeOnEscape && event.key === 'Escape') {
        event.preventDefault();
        cleanup(null, { cancelled: true });
        return;
      }
      trapFocus$1(event, content);
    }

    const controller = {
      close(value) {
        cleanup(value);
      },
      cancel() {
        cleanup(null, { cancelled: true });
      },
      setPrimaryDisabled(disabled) {
        primaryBtn.disabled = !!disabled;
      },
      setPrimaryText(text) {
        if (typeof text === 'string') primaryBtn.textContent = text;
      },
      focusPrimary() {
        primaryBtn.focus();
      },
      registerForm(form) {
        if (!form || forms.has(form)) return;
        forms.add(form);
        form.addEventListener('submit', handleFormSubmit);
      },
      setInitialFocus(element) {
        if (element instanceof HTMLElement) {
          initialFocus = element;
        }
      },
      descriptionId,
      titleId,
      overlay,
      content,
      body,
      primaryBtn,
    };

    if (typeof render === 'function') {
      const renderResult = render(body, controller);
      if (!initialFocus) {
        if (renderResult instanceof HTMLElement) {
          initialFocus = renderResult;
        } else if (renderResult && renderResult.initialFocus instanceof HTMLElement) {
          initialFocus = renderResult.initialFocus;
        }
      }
    } else if (options.message) {
      const paragraph = doc.createElement('p');
      paragraph.className = 'modal-message';
      paragraph.textContent = options.message;
      body.appendChild(paragraph);
    }

    function focusInitialElement() {
      let target = initialFocus;
      if (!target && initialFocusSelector) {
        target = content.querySelector(initialFocusSelector);
      }
      if (!target) {
        const focusable = getFocusableElements(content);
        target = focusable.find(el => el !== closeBtn) || focusable[0];
      }
      if (target && typeof target.focus === 'function') {
        target.focus();
      } else {
        primaryBtn.focus();
      }
    }

    closeBtn.addEventListener('click', handleCancel);
    if (secondaryBtn) secondaryBtn.addEventListener('click', handleCancel);
    primaryBtn.addEventListener('click', handleSubmit);
    overlay.addEventListener('keydown', onKeyDown, true);
    overlay.addEventListener('pointerdown', onOverlayPointerDown);
    overlay.addEventListener('click', onOverlayClick);

    doc.body.appendChild(overlay);
    doc.body.classList.add('modal-open');
    setTimeout(focusInitialElement, 0);
  });
}

function showAlertModal(title, message, options = {}) {
  return openModal({
    title,
    message,
    primaryText: options.confirmText || 'Close',
    secondaryText: null,
    variant: options.variant,
    closeLabel: options.closeLabel || 'Close dialog'
  });
}

// src/copilot.js

let panel = null;
let isOpen = false;

function getCopilotEndpoint() {
  const metaEndpoint = document.querySelector('meta[name="copilot-endpoint"]')?.content?.trim();
  if (metaEndpoint) return metaEndpoint;
  if (typeof window !== 'undefined' && typeof window.__COPILOT_API_URL__ === 'string' && window.__COPILOT_API_URL__.trim()) {
    return window.__COPILOT_API_URL__.trim();
  }
  if (window.location.hostname.endsWith('github.io')) {
    return null;
  }
  return '/api/copilot';
}

function getProjectData() {
  try {
    const cables = getCables();
    const trays = getTrays();
    return { cables: cables.slice(0, 200), trays: trays.slice(0, 100) };
  } catch {
    return {};
  }
}

function createPanel() {
  const el = document.createElement('div');
  el.id = 'copilot-panel';
  el.className = 'copilot-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'AI Copilot');
  el.innerHTML = `
    <div class="copilot-header">
      <span class="copilot-title">AI Copilot</span>
      <button class="copilot-close" aria-label="Close AI Copilot">&times;</button>
    </div>
    <div class="copilot-messages" id="copilot-messages" aria-live="polite"></div>
    <div class="copilot-input-row">
      <input type="text" class="copilot-input" id="copilot-input"
             placeholder="Ask about your project..." maxlength="500"
             aria-label="Ask AI Copilot a question" />
      <button class="copilot-send" id="copilot-send">Ask</button>
    </div>
  `;
  return el;
}

function appendMessage(text, role) {
  const messages = document.getElementById('copilot-messages');
  if (!messages) return;
  const div = document.createElement('div');
  div.className = `copilot-msg copilot-msg--${role}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

async function submitQuery(query) {
  if (!query.trim()) return;
  appendMessage(query, 'user');
  document.getElementById('copilot-input').value = '';
  document.getElementById('copilot-send').disabled = true;

  try {
    const endpoint = getCopilotEndpoint();
    if (!endpoint) {
      appendMessage('Copilot API is not configured for this site. Set a <meta name="copilot-endpoint" content="https://your-server/api/copilot"> tag or window.__COPILOT_API_URL__.', 'error');
      return;
    }
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrf = csrfMeta ? csrfMeta.content : '';
    const isSameOrigin = endpoint.startsWith('/') || endpoint.startsWith(window.location.origin);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(isSameOrigin ? { 'x-csrf-token': csrf } : {})
      },
      credentials: isSameOrigin ? 'include' : 'omit',
      body: JSON.stringify({ query: query.trim(), projectData: getProjectData() })
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const { answer } = await res.json();
    appendMessage(answer, 'assistant');
  } catch (err) {
    appendMessage('Error: ' + (err.message || 'Request failed'), 'error');
  } finally {
    document.getElementById('copilot-send').disabled = false;
    document.getElementById('copilot-input').focus();
  }
}

function mountCopilot() {
  // Floating trigger button
  const btn = document.createElement('button');
  btn.id = 'copilot-trigger';
  btn.className = 'copilot-trigger';
  btn.setAttribute('aria-label', 'Open AI Copilot');
  btn.setAttribute('title', 'AI Copilot');
  btn.textContent = '✦';
  document.body.appendChild(btn);

  panel = createPanel();
  panel.style.display = 'none';
  document.body.appendChild(panel);

  btn.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) document.getElementById('copilot-input')?.focus();
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  panel.querySelector('.copilot-close').addEventListener('click', () => {
    isOpen = false;
    panel.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  });

  document.getElementById('copilot-send').addEventListener('click', () => {
    submitQuery(document.getElementById('copilot-input').value);
  });

  document.getElementById('copilot-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitQuery(e.target.value);
  });
}

const NAV_ROUTES = [
  { href: 'index.html', label: 'Home', section: 'Home', icon: 'icons/route.svg' },
  { href: 'workflowdashboard.html', label: 'Project Dashboard', section: 'Workflow', group: 'Planning', icon: 'icons/toolbar/grid.svg' },
  { href: 'scenarios.html', label: 'Scenario Comparison', section: 'Workflow', group: 'Planning', icon: 'icons/toolbar/copy.svg' },
  { href: 'equipmentlist.html', label: 'Equipment List', section: 'Workflow', group: 'Planning', icon: 'icons/equipment.svg' },
  { href: 'equipmentarrangements.html', label: 'Equipment Arrangements', section: 'Workflow', group: 'Planning', icon: 'icons/equipment.svg' },
  { href: 'loadlist.html', label: 'Load List', section: 'Workflow', group: 'Planning', icon: 'icons/load.svg' },
  { href: 'demandschedule.html', label: 'Demand Schedule', section: 'Studies', group: 'Equipment Sizing', icon: 'icons/load.svg' },
  { href: 'cableschedule.html', label: 'Cable Schedule', section: 'Workflow', group: 'Cable', icon: 'icons/cable.svg' },
  { href: 'panelschedule.html', label: 'Panel Schedule', section: 'Workflow', group: 'Cable', icon: 'icons/panel.svg' },
  { href: 'racewayschedule.html', label: 'Raceway Schedule', section: 'Workflow', group: 'Raceway', icon: 'icons/raceway.svg' },
  { href: 'ductbankroute.html', label: 'Ductbank', section: 'Workflow', group: 'Raceway', icon: 'icons/ductbank.svg' },
  { href: 'cabletrayfill.html', label: 'Tray Fill', section: 'Workflow', group: 'Raceway', icon: 'icons/tray.svg' },
  { href: 'conduitfill.html', label: 'Conduit Fill', section: 'Workflow', group: 'Raceway', icon: 'icons/conduit.svg' },
  { href: 'conduitbend.html', label: 'Conduit Bend Schedule', section: 'Workflow', group: 'Raceway', icon: 'icons/conduit.svg' },
  { href: 'supportspan.html', label: 'Support Span', section: 'Workflow', group: 'Raceway', icon: 'icons/toolbar/dimension.svg' },
  { href: 'seismicBracing.html', label: 'Seismic Bracing', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'cableFaultBracing.html', label: 'Fault Cable Bracing', section: 'Workflow', group: 'Cable', icon: 'icons/toolbar/validate.svg' },
  { href: 'trayhardwarebom.html', label: 'Tray Hardware BOM', section: 'Workflow', group: 'Raceway', icon: 'icons/raceway.svg' },
  { href: 'clashdetect.html', label: 'Clash Detection', section: 'Workflow', group: 'Validation', icon: 'icons/toolbar/validate.svg' },
  { href: 'designrulechecker.html', label: 'Design Rule Checker', section: 'Workflow', group: 'Validation', icon: 'icons/toolbar/validate.svg' },
  { href: 'designcoach.html', label: 'Design Coach', section: 'Workflow', group: 'Validation', icon: 'icons/toolbar/validate.svg' },
  { href: 'spoolsheets.html', label: 'Spool Sheets', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'windload.html', label: 'Wind Load', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'structuralcombinations.html', label: 'Combined Loads', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'seismicwindcombined.html', label: 'Seismic + Wind', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'loadcombinations.html', label: 'Load Combinations', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'optimalRoute.html', label: 'Optimal Route', section: 'Workflow', group: 'Optimization', icon: 'icons/route.svg' },
  { href: 'pullcards.html', label: 'Pull Cards', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'procurementschedule.html', label: 'Procurement Schedule', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'costestimate.html', label: 'Cost Estimate', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'submittal.html', label: 'Submittal Package', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'projectreport.html', label: 'Project Report', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'productconfig.html', label: 'Product Configurator', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'intlCableSize.html', label: 'Intl Cable Sizing', section: 'Studies', group: 'Cable', icon: 'icons/cable.svg' },
  { href: 'iec60287.html', label: 'IEC 60287 Ampacity', section: 'Studies', group: 'Cable', icon: 'icons/cable.svg' },
  { href: 'oneline.html', label: 'One-Line', section: 'Workflow', group: 'Planning', icon: 'icons/oneline.svg' },
  { href: 'tcc.html', label: 'TCC', section: 'Studies', group: 'Protection', icon: 'icons/toolbar/validate.svg' },
  { href: 'harmonics.html', label: 'Harmonics', section: 'Studies', group: 'Power Quality', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'capacitorbank.html', label: 'Capacitor Bank', section: 'Studies', group: 'Power Quality', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'frequencyscan.html', label: 'Frequency Scan', section: 'Studies', group: 'Power Quality', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'voltageflicker.html', label: 'Voltage Flicker', section: 'Studies', group: 'Power Quality', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'busdust.html', label: 'Bus Duct Sizing', section: 'Studies', group: 'Equipment Sizing', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'sustainability.html', label: 'Sustainability Footprint', section: 'Studies', group: 'Equipment Sizing', icon: 'icons/toolbar/validate.svg' },
  { href: 'battery.html', label: 'Battery / UPS Sizing', section: 'Studies', group: 'Equipment Sizing', icon: 'icons/components/UPS.svg' },
  { href: 'generatorsizing.html', label: 'Generator Sizing', section: 'Studies', group: 'Equipment Sizing', icon: 'icons/toolbar/validate.svg' },
  { href: 'ibr.html', label: 'IBR Modeling (PV/BESS)', section: 'Studies', group: 'Renewable', icon: 'icons/toolbar/validate.svg' },
  { href: 'derinterconnect.html', label: 'DER Interconnection', section: 'Studies', group: 'Renewable', icon: 'icons/toolbar/validate.svg' },
  { href: 'motorStart.html', label: 'Motor Start', section: 'Studies', group: 'Motor', icon: 'icons/Motor.svg' },
  { href: 'loadFlow.html', label: 'Load Flow', section: 'Studies', group: 'Power System', icon: 'icons/load.svg' },
  { href: 'quasidynamic.html', label: 'Quasi-Dynamic Load Flow', section: 'Studies', group: 'Power System', icon: 'icons/load.svg' },
  { href: 'voltagestability.html', label: 'Voltage Stability', section: 'Studies', group: 'Power System', icon: 'icons/toolbar/validate.svg' },
  { href: 'shortCircuit.html', label: 'Short Circuit', section: 'Studies', group: 'Protection', icon: 'icons/components/Breaker.svg' },
  { href: 'iec60909.html', label: 'IEC 60909 Short-Circuit', section: 'Studies', group: 'Protection', icon: 'icons/components/Breaker.svg' },
  { href: 'arcFlash.html', label: 'Arc Flash', section: 'Studies', group: 'Protection', icon: 'icons/toolbar/connect.svg' },
  { href: 'dcshortcircuit.html', label: 'DC Short-Circuit & Arc Flash', section: 'Studies', group: 'Protection', icon: 'icons/components/Breaker.svg' },
  { href: 'differentialprotection.html', label: 'Differential Protection (87)', section: 'Studies', group: 'Protection', icon: 'icons/components/Breaker.svg' },
  { href: 'equipmentevaluation.html', label: 'Equipment Evaluation', section: 'Studies', group: 'Protection', icon: 'icons/toolbar/validate.svg' },
  { href: 'bessHazard.html', label: 'BESS Hazard / Thermal Runaway', section: 'Studies', group: 'Protection', icon: 'icons/components/Breaker.svg' },
  { href: 'hazareaclassification.html', label: 'Hazardous Area Classification', section: 'Studies', group: 'Protection', icon: 'icons/toolbar/validate.svg' },
  { href: 'insulationcoordination.html', label: 'Insulation Coordination (BIL/SIL)', section: 'Studies', group: 'Protection', icon: 'icons/toolbar/validate.svg' },
  { href: 'lighting.html', label: 'Egress Lighting', section: 'Studies', group: 'Safety & Compliance', icon: 'icons/toolbar/validate.svg' },
  { href: 'groundgrid.html', label: 'Ground Grid', section: 'Studies', group: 'Grounding', icon: 'icons/toolbar/validate.svg' },
  { href: 'cathodicprotection.html', label: 'Cathodic Protection', section: 'Studies', group: 'Corrosion Control', icon: 'icons/toolbar/validate.svg' },
  { href: 'dissimilarmetals.html', label: 'Dissimilar Metals', section: 'Studies', group: 'Corrosion Control', icon: 'icons/toolbar/validate.svg' },
  { href: 'autosize.html', label: 'Auto-Size', section: 'Studies', group: 'Cable', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'heattracesizing.html', label: 'Heat Trace Sizing', section: 'Studies', group: 'Equipment Sizing', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'reliability.html', label: 'Reliability', section: 'Studies', group: 'Power System', icon: 'icons/toolbar/validate.svg' },
  { href: 'emf.html', label: 'EMF Analysis', section: 'Studies', group: 'Power System', icon: 'icons/toolbar/connect.svg' },
  { href: 'transientstability.html', label: 'Transient Stability', section: 'Studies', group: 'Power System', icon: 'icons/toolbar/validate.svg' },
  { href: 'contingency.html', label: 'N-1 Contingency', section: 'Studies', group: 'Power System', icon: 'icons/toolbar/validate.svg' },
  { href: 'voltagedropstudy.html', label: 'Voltage Drop', section: 'Studies', group: 'Cable', icon: 'icons/cable.svg' },
  { href: 'custom-components.html', label: 'Custom Components', section: 'Library', icon: 'icons/components/TextBox.svg' },
  { href: 'library.html', label: 'Library Manager', section: 'Library', icon: 'icons/toolbar/grid.svg' },
  { href: 'trustcenter.html', label: 'Trust Center', section: 'Support', icon: 'icons/toolbar/validate.svg' },
  { href: 'fieldview.html', label: 'Field View', section: 'Support', icon: 'icons/toolbar/copy.svg' },
  { href: 'samplegallery.html', label: 'Sample Gallery', section: 'Support', icon: 'icons/toolbar/copy.svg' },
  { href: 'validation.html', label: 'Validation & Standards', section: 'Support', icon: 'icons/toolbar/validate.svg' },
  { href: 'help.html', label: 'Help', section: 'Support', icon: 'icons/toolbar/validate.svg' },
  { href: 'account.html', label: 'Account', section: 'Support', icon: 'icons/toolbar/grid.svg' },
  { href: 'admin.html', label: 'Admin', section: 'Support', icon: 'icons/toolbar/validate.svg', adminOnly: true }
];

function currentPageName() {
  const raw = window.location.pathname.split('/').pop() || 'index.html';
  return raw || 'index.html';
}

function routeForPage(pageName) {
  return NAV_ROUTES.find(route => route.href === pageName);
}

function buildLink(route, currentRoute) {
  const link = document.createElement('a');
  link.href = route.href;

  const icon = document.createElement('img');
  icon.src = route.icon;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  icon.className = 'nav-link-icon';
  icon.loading = 'lazy';
  icon.decoding = 'async';

  const label = document.createElement('span');
  label.className = 'nav-link-label';
  label.textContent = route.label;

  link.appendChild(icon);
  link.appendChild(label);

  if (currentRoute && currentRoute.href === route.href) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function buildDropdown(section, routes, currentRoute) {
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-dropdown';

  const trigger = document.createElement('button');
  trigger.className = 'nav-dropdown-trigger';
  trigger.type = 'button';
  trigger.textContent = section;
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');

  if (currentRoute && currentRoute.section === section) {
    trigger.classList.add('active');
  }

  const menu = document.createElement('ul');
  menu.className = 'nav-dropdown-menu';
  menu.setAttribute('role', 'menu');
  const groupedRoutes = routes.reduce((acc, route) => {
    const key = route.group || 'General';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(route);
    return acc;
  }, {});
  const groupNames = Object.keys(groupedRoutes);
  const sectionGroupOrder = {
    Workflow: ['Planning', 'Raceway', 'Cable', 'Structural', 'Validation', 'Optimization', 'Deliverables'],
    Studies: ['Grounding', 'Corrosion Control', 'Cable', 'Protection', 'Power System', 'Power Quality', 'Equipment Sizing', 'Motor', 'Renewable']
  };
  const orderedGroupNames = [
    ...(sectionGroupOrder[section] || []).filter(groupName => groupNames.includes(groupName)),
    ...groupNames.filter(groupName => !(sectionGroupOrder[section] || []).includes(groupName))
  ];
  const hasGroups = groupNames.length > 1;
  if (!hasGroups && routes.length >= 12) {
    menu.dataset.cols = '2';
  }

  orderedGroupNames.forEach((groupName) => {
    if (hasGroups) {
      const heading = document.createElement('li');
      heading.className = 'nav-dropdown-group-heading';
      heading.textContent = groupName;
      heading.setAttribute('role', 'presentation');
      menu.appendChild(heading);
    }
    groupedRoutes[groupName].forEach(route => {
      const item = document.createElement('li');
      item.setAttribute('role', 'none');
      const link = buildLink(route, currentRoute);
      link.setAttribute('role', 'menuitem');
      item.appendChild(link);
      menu.appendChild(item);
    });
  });

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrapper.classList.contains('open');
    document.querySelectorAll('.nav-dropdown.open').forEach(d => {
      if (d !== wrapper) {
        d.classList.remove('open');
        d.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
    wrapper.classList.toggle('open', !isOpen);
    trigger.setAttribute('aria-expanded', String(!isOpen));
  });

  return wrapper;
}

function mountPageTransitions() {
  // Progress bar on every page load
  const bar = document.createElement('div');
  bar.className = 'nav-progress-bar';
  document.body.insertBefore(bar, document.body.firstChild);

  // Intercept nav link clicks: fade out, then navigate
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('http')) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (link.target && link.target !== '_self') return;

    e.preventDefault();
    document.body.classList.add('page-exit');
    setTimeout(() => { window.location.href = href; }, 150);
  });
}

function buildBrand() {
  const brand = document.createElement('a');
  brand.href = 'index.html';
  brand.className = 'nav-brand';
  brand.setAttribute('aria-label', 'CableTrayRoute home');

  const logo = document.createElement('img');
  logo.src = 'icons/route.svg';
  logo.alt = '';
  logo.setAttribute('aria-hidden', 'true');
  logo.className = 'nav-brand-logo';

  const name = document.createElement('span');
  name.className = 'nav-brand-name';
  name.textContent = 'CableTrayRoute';

  brand.appendChild(logo);
  brand.appendChild(name);
  return brand;
}

function mountPersistentNavigation() {
  if (document.body?.dataset.navMounted === 'true') return;
  const topNav = document.querySelector('.top-nav');
  if (!topNav) return;

  // Ensure the primary nav landmark is labelled for WCAG 2.4.1 SC
  if (!topNav.getAttribute('aria-label')) {
    topNav.setAttribute('aria-label', 'Primary');
  }

  const pageName = currentPageName();
  const currentRoute = routeForPage(pageName);

  // Insert brand if not already present
  if (!topNav.querySelector('.nav-brand')) {
    topNav.insertBefore(buildBrand(), topNav.firstChild);
  }

  const existingSettingsBtn = document.getElementById('settings-btn');
  const navLinks = document.createElement('div');
  navLinks.id = 'nav-links';
  navLinks.className = 'nav-links';
  const isAdmin = typeof localStorage !== 'undefined' && localStorage.getItem('ctr-user-role') === 'admin';
  const visibleRoutes = NAV_ROUTES.filter(r => !r.adminOnly || isAdmin);
  const navSections = [...new Set(visibleRoutes.map(r => r.section))];
  navSections.forEach(section => {
    const sectionRoutes = visibleRoutes.filter(r => r.section === section);
    if (section === 'Home') {
      navLinks.appendChild(buildLink(sectionRoutes[0], currentRoute));
    } else {
      navLinks.appendChild(buildDropdown(section, sectionRoutes, currentRoute));
    }
  });

  if (existingSettingsBtn) {
    navLinks.appendChild(existingSettingsBtn);
  }

  topNav.querySelectorAll('.nav-links').forEach(node => node.remove());
  topNav.appendChild(navLinks);

  // Add a search button visible only on mobile (Ctrl+K is unavailable on touch devices)
  if (!topNav.querySelector('.nav-search-btn')) {
    const searchBtn = document.createElement('button');
    searchBtn.className = 'nav-search-btn';
    searchBtn.setAttribute('aria-label', 'Search commands');
    searchBtn.setAttribute('title', 'Search commands');
    searchBtn.innerHTML = '<img src="icons/toolbar/grid-size.svg" alt="" aria-hidden="true" class="control-icon">';
    searchBtn.addEventListener('click', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    topNav.appendChild(searchBtn);
  }

  const oldBreadcrumb = document.querySelector('.breadcrumb-trail');
  if (oldBreadcrumb) {
    oldBreadcrumb.remove();
  }

  const oldSidebar = document.querySelector('.app-sidebar-nav');
  if (oldSidebar) {
    oldSidebar.remove();
  }
  const sidebar = document.createElement('aside');
  sidebar.className = 'app-sidebar-nav';
  sidebar.id = 'app-sidebar-nav';
  sidebar.setAttribute('aria-label', 'Sidebar navigation');
  const heading = document.createElement('h2');
  heading.className = 'sidebar-title';
  heading.textContent = 'Navigate';
  sidebar.appendChild(heading);

  const sections = [...new Set(NAV_ROUTES.map(r => r.section))];
  sections.forEach(section => {
    const sectionRoutes = NAV_ROUTES.filter(r => r.section === section);
    const sectionLabel = document.createElement('p');
    sectionLabel.className = 'sidebar-section-label';
    sectionLabel.textContent = section;
    sidebar.appendChild(sectionLabel);
    const sectionList = document.createElement('ul');
    sectionList.className = 'sidebar-nav-list';
    sectionRoutes.forEach(route => {
      const item = document.createElement('li');
      item.appendChild(buildLink(route, currentRoute));
      sectionList.appendChild(item);
    });
    sidebar.appendChild(sectionList);
  });

  document.body.appendChild(sidebar);

  // Mobile sidebar toggle button
  if (!topNav.querySelector('.sidebar-toggle-btn')) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Toggle sidebar navigation');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-controls', 'app-sidebar-nav');
    toggleBtn.innerHTML = '<img src="icons/toolbar/grid.svg" alt="" aria-hidden="true" class="control-icon">';
    topNav.insertBefore(toggleBtn, topNav.firstChild);
  }

  // Mobile backdrop
  if (!document.querySelector('.sidebar-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
  }

  function closeSidebar() {
    sidebar.classList.remove('sidebar-open');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (backdrop) backdrop.classList.remove('sidebar-open');
    const toggleBtn = topNav.querySelector('.sidebar-toggle-btn');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  }

  const toggleBtn = topNav.querySelector('.sidebar-toggle-btn');
  if (toggleBtn && !toggleBtn.dataset.wired) {
    toggleBtn.dataset.wired = '1';
    toggleBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.contains('sidebar-open');
      sidebar.classList.toggle('sidebar-open', !isOpen);
      const backdrop = document.querySelector('.sidebar-backdrop');
      if (backdrop) backdrop.classList.toggle('sidebar-open', !isOpen);
      toggleBtn.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  const backdrop = document.querySelector('.sidebar-backdrop');
  if (backdrop && !backdrop.dataset.wired) {
    backdrop.dataset.wired = '1';
    backdrop.addEventListener('click', closeSidebar);
  }

  sidebar.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeSidebar);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('sidebar-open')) {
      closeSidebar();
    }
  });

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-dropdown.open').forEach(d => {
      d.classList.remove('open');
      d.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
    });
  });

  // Close dropdowns on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.nav-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      });
    }
  });

  document.body.dataset.navMounted = 'true';
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    mountPersistentNavigation();
    mountPageTransitions();
  });
}

const RECENT_KEY = "commandPaletteRecent";
const RECENT_LIMIT = 6;
const MAX_RESULTS = 10;

function toggleCheckbox(id) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement) || el.type !== "checkbox") return false;
  el.checked = !el.checked;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

const ACTIONS = [
  { id: "project:new", label: "New Project", keywords: ["create", "fresh", "reset"], trigger: () => clickById("new-project-btn") },
  { id: "project:import", label: "Import Project", keywords: ["open", "upload"], trigger: () => clickById("import-project-btn") },
  { id: "project:export", label: "Export Project", keywords: ["download", "backup"], trigger: () => clickById("export-project-btn") },
  { id: "project:save", label: "Save Project", keywords: ["persist", "write"], trigger: () => clickById("save-project-btn") },
  { id: "help:open", label: "Open Help", keywords: ["docs", "support"], trigger: () => clickById("help-btn") },
  { id: "settings:dark-mode", label: "Toggle Dark Mode", keywords: ["theme", "light", "dark", "appearance"], trigger: () => toggleCheckbox("dark-toggle") },
  { id: "settings:compact-mode", label: "Toggle Compact Mode", keywords: ["density", "table", "compact"], trigger: () => toggleCheckbox("compact-toggle") },
  { id: "settings:units", label: "Switch Units (Imperial / Metric)", keywords: ["imperial", "metric", "measurement"], trigger: () => { const sel = document.getElementById("unit-select"); if (!sel) return false; sel.value = sel.value === "imperial" ? "metric" : "imperial"; sel.dispatchEvent(new Event("change", { bubbles: true })); return true; } },
  { id: "workflow:equipment", label: "Go to Equipment List", keywords: ["navigation", "equipment"], href: "equipmentlist.html" },
  { id: "workflow:equipment-arrangements", label: "Go to Equipment Arrangements", keywords: ["navigation", "equipment", "layout", "room", "nec", "clearance"], href: "equipmentarrangements.html" },
  { id: "workflow:load", label: "Go to Load List", keywords: ["navigation", "load"], href: "loadlist.html" },
  { id: "workflow:cable", label: "Go to Cable Schedule", keywords: ["navigation", "cables"], href: "cableschedule.html" },
  { id: "workflow:raceway", label: "Go to Raceway Schedule", keywords: ["navigation", "tray", "conduit"], href: "racewayschedule.html" },
  { id: "workflow:ductbank", label: "Go to Ductbank Analysis", keywords: ["navigation", "underground", "thermal"], href: "ductbankroute.html" },
  { id: "workflow:trayfill", label: "Go to Tray Fill", keywords: ["navigation", "fill", "capacity"], href: "cabletrayfill.html" },
  { id: "workflow:conduitfill", label: "Go to Conduit Fill", keywords: ["navigation", "fill", "nec"], href: "conduitfill.html" },
  { id: "workflow:route", label: "Go to Optimal Route", keywords: ["navigation", "routing", "dijkstra", "pathfinding"], href: "optimalRoute.html" },
  { id: "workflow:heattrace", label: "Go to Heat Trace Sizing", keywords: ["navigation", "heat", "trace", "pipe"], href: "heattracesizing.html" },
  { id: "workflow:drc", label: "Go to Design Rule Checker", keywords: ["navigation", "drc", "nec", "validation", "fill", "segregation", "ampacity"], href: "designrulechecker.html" },
  { id: "workflow:oneline", label: "Go to One-Line Diagram", keywords: ["navigation", "diagram", "schematic"], href: "oneline.html" },
  { id: "workflow:panel", label: "Go to Panel Schedule", keywords: ["navigation", "panel", "branch"], href: "panelschedule.html" },
  { id: "calc:loadflow", label: "Run Load Flow", keywords: ["calculation", "study", "analysis"], trigger: () => clickById("run-loadflow-btn") },
  { id: "calc:shortcircuit", label: "Run Short Circuit", keywords: ["calculation", "study", "analysis", "fault"], trigger: () => clickById("run-shortcircuit-btn") },
  { id: "calc:arcflash", label: "Run Arc Flash", keywords: ["calculation", "study", "analysis", "hazard"], trigger: () => clickById("run-arcflash-btn") },
  { id: "support:trustcenter", label: "Go to Trust Center", keywords: ["trust", "benchmark", "validation", "verify", "standards", "confidence"], href: "trustcenter.html" }
];

function clickById(id) {
  const node = document.getElementById(id);
  if (!node || node instanceof HTMLButtonElement === false) return false;
  if (node.disabled) return false;
  node.click();
  return true;
}

function normalize(value = "") {
  return String(value).toLowerCase().trim();
}

function fuzzyScore(query, target) {
  if (!query) return 1;
  let score = 0;
  let q = 0;
  const normalizedTarget = normalize(target);
  for (let i = 0; i < normalizedTarget.length && q < query.length; i += 1) {
    if (normalizedTarget[i] === query[q]) {
      q += 1;
      score += 1;
    }
  }
  if (q !== query.length) return 0;
  const startIndex = normalizedTarget.indexOf(query[0]);
  return score + (startIndex >= 0 ? Math.max(0, 3 - startIndex * 0.1) : 0);
}

function getRecentIds() {
  const recent = getSessionPreferences()?.[RECENT_KEY];
  return Array.isArray(recent) ? recent.filter(item => typeof item === "string") : [];
}

function saveRecentId(actionId) {
  updateSessionPreferences(current => {
    const recent = Array.isArray(current?.[RECENT_KEY]) ? current[RECENT_KEY] : [];
    const next = [actionId, ...recent.filter(item => item !== actionId)].slice(0, RECENT_LIMIT);
    return { ...current, [RECENT_KEY]: next };
  });
}

function executeAction(action) {
  if (!action) return false;
  let completed = false;
  if (typeof action.trigger === "function") {
    completed = action.trigger() === true;
  } else if (action.href) {
    completed = true;
    window.location.href = action.href;
  }
  if (completed) {
    saveRecentId(action.id);
  }
  return completed;
}

function resolveResults(query) {
  const normalizedQuery = normalize(query);
  const recentIds = getRecentIds();
  const recentActions = recentIds
    .map(id => ACTIONS.find(action => action.id === id))
    .filter(Boolean);

  const matching = ACTIONS
    .map(action => {
      const haystack = [action.label, ...(action.keywords || [])].join(" ");
      return { action, score: fuzzyScore(normalizedQuery, haystack) };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.action);

  const merged = normalizedQuery
    ? matching
    : [...recentActions, ...matching.filter(action => !recentIds.includes(action.id))];
  return merged.slice(0, MAX_RESULTS);
}

function createPalette() {
  const overlay = document.createElement("div");
  overlay.className = "command-palette-overlay";
  overlay.hidden = true;

  const panel = document.createElement("div");
  panel.className = "command-palette-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "command-palette-title");

  const header = document.createElement("div");
  header.className = "command-palette-header";

  const title = document.createElement("h2");
  title.id = "command-palette-title";
  title.className = "command-palette-title";
  title.textContent = "Command Palette";

  const closeBtn = document.createElement("button");
  closeBtn.className = "command-palette-close";
  closeBtn.setAttribute("aria-label", "Close command palette");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => closePalette());

  header.append(title, closeBtn);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "command-palette-input";
  input.placeholder = "Search actions and navigation";
  input.setAttribute("aria-label", "Search commands");

  const hint = document.createElement("p");
  hint.className = "command-palette-hint";
  hint.textContent = "Type to search · ↑/↓ to move · Enter to run · Esc to close";

  const list = document.createElement("ul");
  list.className = "command-palette-list";

  panel.append(header, input, hint, list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let results = [];
  let activeIndex = 0;

  function closePalette() {
    overlay.hidden = true;
  }

  function runSelection(index) {
    if (!results[index]) return;
    const wasExecuted = executeAction(results[index]);
    if (wasExecuted) {
      closePalette();
    }
  }

  function render() {
    results = resolveResults(input.value);
    if (activeIndex >= results.length) activeIndex = 0;
    list.replaceChildren();

    if (!results.length) {
      const empty = document.createElement("li");
      empty.className = "command-palette-empty";
      empty.textContent = "No matching command";
      list.appendChild(empty);
      return;
    }

    results.forEach((action, index) => {
      const item = document.createElement("li");
      item.className = "command-palette-item";
      if (index === activeIndex) {
        item.classList.add("is-active");
      }
      const labelSpan = document.createElement('span');
      labelSpan.textContent = action.label;
      const kbd = document.createElement('kbd');
      kbd.textContent = 'Enter';
      item.appendChild(labelSpan);
      item.appendChild(kbd);
      item.addEventListener("mouseenter", () => {
        activeIndex = index;
        render();
      });
      item.addEventListener("click", () => runSelection(index));
      list.appendChild(item);
    });
  }

  function openPalette() {
    overlay.hidden = false;
    input.value = "";
    activeIndex = 0;
    render();
    input.focus();
  }

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      closePalette();
    }
  });

  input.addEventListener("input", () => {
    activeIndex = 0;
    render();
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closePalette();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!results.length) return;
      activeIndex = (activeIndex + 1) % results.length;
      render();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      activeIndex = (activeIndex - 1 + results.length) % results.length;
      render();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runSelection(activeIndex);
    }
  });

  document.addEventListener("keydown", event => {
    const triggerPressed = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (!triggerPressed) return;
    event.preventDefault();
    if (overlay.hidden) {
      openPalette();
    } else {
      closePalette();
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", createPalette);
}

const FT_TO_M = 0.3048;
const IN_TO_MM = 25.4;
let cached = 'imperial';

function getUnitSystem(){
  const storage = globalThis.projectStorage;
  if (storage && typeof storage.getProjectState === 'function') {
    try { return storage.getProjectState().settings?.units || 'imperial'; }
    catch { return 'imperial'; }
  }
  return cached;
}

function setUnitSystem(sys){
  const val = sys === 'metric' ? 'metric' : 'imperial';
  const storage = globalThis.projectStorage;
  if (storage && typeof storage.getProjectState === 'function' && typeof storage.setProjectState === 'function'){
    try {
      const proj = storage.getProjectState();
      proj.settings = proj.settings || {};
      proj.settings.units = val;
      storage.setProjectState(proj);
    } catch (e) {
      console.warn('Failed to persist unit preference to project storage', e);
    }
  }
  cached = val;
}

function distanceToDisplay(ft){
  return getUnitSystem()==='imperial'?ft:ft*FT_TO_M;
}
function distanceFromInput(val){
  return getUnitSystem()==='imperial'?val:val/FT_TO_M;
}
function conduitToDisplay(inches){
  return getUnitSystem()==='imperial'?inches:inches*IN_TO_MM;
}
function conduitFromInput(val){
  return getUnitSystem()==='imperial'?val:val/IN_TO_MM;
}
function distanceLabel(){
  return getUnitSystem()==='imperial'?"ft":"m";
}
function conduitLabel(){
  return getUnitSystem()==='imperial'?"in":"mm";
}
function formatDistance(ft,prec=2){
  return `${distanceToDisplay(ft).toFixed(prec)} ${distanceLabel()}`;
}
function formatConduitSize(inches,prec=2){
  return `${conduitToDisplay(inches).toFixed(prec)} ${conduitLabel()}`;
}

const api={
  getUnitSystem,
  setUnitSystem,
  distanceToDisplay,
  distanceFromInput,
  conduitToDisplay,
  conduitFromInput,
  distanceLabel,
  conduitLabel,
  formatDistance,
  formatConduitSize
};

globalThis.units=api;

function resolveComponentLabel(component, fallbackId) {
  if (!component) return fallbackId;
  return component.label
    || component.name
    || component.ref
    || component.tag
    || component.props?.tag
    || component.props?.name
    || component.cable?.tag
    || component.id
    || fallbackId;
}

function coerceNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function readField(component, key) {
  if (!component || typeof component !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(component, key)) return component[key];
  if (component.props && typeof component.props === 'object' && Object.prototype.hasOwnProperty.call(component.props, key)) {
    return component.props[key];
  }
  return undefined;
}

function toVolts(value, keyHint = '') {
  const num = coerceNumber(value);
  if (!Number.isFinite(num)) return null;
  const key = `${keyHint || ''}`.toLowerCase();
  if (key.includes('_kv') || key.includes('basekv') || key === 'kv') return num * 1000;
  if (key.includes('nominal_voltage_vdc')) return num;
  return num <= 100 ? num * 1000 : num;
}

function resolveComponentVoltageVolts(component) {
  const keys = ['voltage_v', 'rated_voltage_kv', 'baseKV', 'kV', 'prefault_voltage', 'voltage', 'volts', 'nominal_voltage_vdc'];
  for (const key of keys) {
    const volts = toVolts(readField(component, key), key);
    if (Number.isFinite(volts) && volts > 0) return volts;
  }
  return null;
}

function normalizeIdList(value) {
  if (Array.isArray(value)) return value.map(v => `${v || ''}`.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

function runValidation(components = [], studies = {}) {
  const issues = [];
  const componentLookup = new Map(components.map(c => [c.id, c]));
  const describe = id => {
    const comp = componentLookup.get(id);
    return resolveComponentLabel(comp, id);
  };

  // Map inbound connections for bus connectivity check
  const inbound = new Map();
  components.forEach(c => {
    if (c.type === 'bus') inbound.set(c.id, 0);
  });
  components.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (inbound.has(conn.target)) {
        inbound.set(conn.target, (inbound.get(conn.target) || 0) + 1);
      }
    });
  });
  inbound.forEach((cnt, id) => {
    const comp = componentLookup.get(id);
    const outbound = Array.isArray(comp?.connections)
      ? comp.connections.filter(conn => conn && conn.target).length
      : 0;
    if (cnt === 0 && outbound === 0) {
      issues.push({ component: id, message: 'Unconnected bus' });
    }
  });

  // Transformer loading check
  components.forEach(c => {
    if (c.type !== 'transformer') return;
    const load = Number(c.load_kva || c.load || 0);
    const rating = Number(c.kva || c.rating || 0);
    if (rating && load > rating) {
      issues.push({ component: c.id, message: `Transformer overloaded (${load}kVA > ${rating}kVA)` });
    }
  });

  // Breaker interrupting rating check
  components.forEach(c => {
    if (c.type !== 'breaker') return;
    const interrupt = Number(c.interrupt_rating || 0);
    const fault = Number(c.fault_current || 0);
    if (interrupt && fault > interrupt) {
      issues.push({ component: c.id, message: `Breaker interrupt rating exceeded (${fault}A > ${interrupt}A)` });
    }
  });


  // Current transformer (CT) required field completeness and physical validity
  components.forEach(c => {
    const isCt = c?.subtype === 'ct' || c?.type === 'ct';
    if (!isCt) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];

    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    const ratioPrimary = Number(props.ratio_primary);
    const ratioSecondary = Number(props.ratio_secondary);
    if (!Number.isFinite(ratioPrimary) || ratioPrimary <= 0) missing.push('ratio_primary');
    if (!Number.isFinite(ratioSecondary) || ratioSecondary <= 0) missing.push('ratio_secondary');
    if (Number.isFinite(ratioPrimary) && Number.isFinite(ratioSecondary) && ratioPrimary < ratioSecondary) {
      missing.push('ratio_primary>=ratio_secondary');
    }

    if (!`${props.accuracy_class ?? ''}`.trim()) missing.push('accuracy_class');
    const burdenVa = Number(props.burden_va);
    if (!Number.isFinite(burdenVa) || burdenVa <= 0) missing.push('burden_va');
    const kneePointV = Number(props.knee_point_v);
    if (!Number.isFinite(kneePointV) || kneePointV <= 0) missing.push('knee_point_v');
    if (!`${props.polarity ?? ''}`.trim()) missing.push('polarity');

    const locationContext = `${props.location_context ?? ''}`.trim().toLowerCase();
    if (!['metering', 'protection'].includes(locationContext)) missing.push('location_context');

    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Current transformer missing/invalid attributes: ${missing.join(', ')}.`
      });
    }
  });

  // PT/VT required field completeness, ratio limits, and downstream voltage-base compatibility
  components.forEach(c => {
    const subtype = `${c?.subtype ?? ''}`.trim().toLowerCase();
    const type = `${c?.type ?? ''}`.trim().toLowerCase();
    const isPtVt = subtype === 'pt_vt' || subtype === 'vt' || type === 'pt_vt' || type === 'vt';
    if (!isPtVt) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    const primaryVoltage = Number(props.primary_voltage);
    const secondaryVoltage = Number(props.secondary_voltage);
    if (!Number.isFinite(primaryVoltage) || primaryVoltage <= 0) missing.push('primary_voltage');
    if (!Number.isFinite(secondaryVoltage) || secondaryVoltage <= 0) missing.push('secondary_voltage');
    if (Number.isFinite(primaryVoltage) && Number.isFinite(secondaryVoltage)) {
      if (primaryVoltage < secondaryVoltage) missing.push('primary_voltage>=secondary_voltage');
      const ratio = primaryVoltage / Math.max(secondaryVoltage, 1e-9);
      if (!Number.isFinite(ratio) || ratio < 1 || ratio > 2000) missing.push('ratio_range(1..2000)');
    }
    if (!`${props.accuracy_class ?? ''}`.trim()) missing.push('accuracy_class');
    const burdenVa = Number(props.burden_va);
    if (!Number.isFinite(burdenVa) || burdenVa <= 0) missing.push('burden_va');
    if (!`${props.connection_type ?? ''}`.trim()) missing.push('connection_type');
    if (!`${props.fuse_protection ?? ''}`.trim()) missing.push('fuse_protection');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `PT/VT missing/invalid attributes: ${missing.join(', ')}.`
      });
    }

    const linkedIds = new Set(
      [
        `${props.protected_device_id ?? ''}`.trim(),
        `${props.meter_id ?? ''}`.trim(),
        `${props.relay_id ?? ''}`.trim(),
        ...normalizeIdList(props.consumer_ids),
        ...(Array.isArray(c.connections) ? c.connections.map(conn => `${conn?.target ?? ''}`.trim()) : [])
      ].filter(Boolean)
    );
    if (!linkedIds.size || !Number.isFinite(primaryVoltage) || primaryVoltage <= 0) return;
    linkedIds.forEach(targetId => {
      const target = componentLookup.get(targetId);
      if (!target) return;
      const consumerVoltage = resolveComponentVoltageVolts(target);
      if (!Number.isFinite(consumerVoltage) || consumerVoltage <= 0) return;
      const mismatchRatio = Math.abs(primaryVoltage - consumerVoltage) / Math.max(primaryVoltage, consumerVoltage);
      if (mismatchRatio > 0.35) {
        issues.push({
          component: c.id,
          message: `PT/VT primary_voltage (${primaryVoltage} V) is incompatible with linked component ${describe(targetId)} voltage base (${consumerVoltage.toFixed(1)} V).`
        });
      }
    });
  });

  // Meter ratio completeness for study-enabled metering features
  components.forEach(c => {
    if (c.type !== 'meter') return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const meteringEnabled = Boolean(
      props.supports_thd
      || props.supports_flicker
      || props.supports_waveform_capture
    );
    if (!meteringEnabled) return;
    const ctRatio = `${props.ct_ratio ?? ''}`.trim();
    const ptRatio = `${props.pt_ratio ?? ''}`.trim();
    if (!ctRatio || !ptRatio) {
      issues.push({
        component: c.id,
        message: 'Meter requires both CT ratio and PT ratio when metering studies are enabled.'
      });
    }
  });

  // Battery required field completeness for DC short-circuit and battery studies
  components.forEach(c => {
    const isBattery = c?.type === 'battery' || c?.subtype === 'battery';
    if (!isBattery) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const nominalVoltageVdc = Number(props.nominal_voltage_vdc);
    if (!Number.isFinite(nominalVoltageVdc) || nominalVoltageVdc <= 0) missing.push('nominal_voltage_vdc');
    if (!`${props.cell_chemistry ?? ''}`.trim()) missing.push('cell_chemistry');
    const cellCount = Number(props.cell_count);
    if (!Number.isFinite(cellCount) || cellCount <= 0) missing.push('cell_count');
    const capacityAh = Number(props.capacity_ah);
    if (!Number.isFinite(capacityAh) || capacityAh <= 0) missing.push('capacity_ah');
    const internalResistanceOhm = Number(props.internal_resistance_ohm);
    if (!Number.isFinite(internalResistanceOhm) || internalResistanceOhm < 0) missing.push('internal_resistance_ohm');
    const initialSocPct = Number(props.initial_soc_pct);
    if (!Number.isFinite(initialSocPct) || initialSocPct < 0 || initialSocPct > 100) missing.push('initial_soc_pct');
    const minSocPct = Number(props.min_soc_pct);
    if (!Number.isFinite(minSocPct) || minSocPct < 0 || minSocPct > 100) missing.push('min_soc_pct');
    const maxChargeCurrentA = Number(props.max_charge_current_a);
    if (!Number.isFinite(maxChargeCurrentA) || maxChargeCurrentA <= 0) missing.push('max_charge_current_a');
    const maxDischargeCurrentA = Number(props.max_discharge_current_a);
    if (!Number.isFinite(maxDischargeCurrentA) || maxDischargeCurrentA <= 0) missing.push('max_discharge_current_a');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Battery missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // UPS required field completeness and rating/runtime consistency
  components.forEach(c => {
    const subtype = `${c?.subtype ?? ''}`.trim().toLowerCase();
    const type = `${c?.type ?? ''}`.trim().toLowerCase();
    const isUps = subtype === 'ups' || type === 'ups';
    if (!isUps) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    if (!`${props.topology ?? ''}`.trim()) missing.push('topology');
    const ratedKva = Number(props.rated_kva);
    if (!Number.isFinite(ratedKva) || ratedKva <= 0) missing.push('rated_kva');
    const inputVoltageKv = Number(props.input_voltage_kv);
    if (!Number.isFinite(inputVoltageKv) || inputVoltageKv <= 0) missing.push('input_voltage_kv');
    const outputVoltageKv = Number(props.output_voltage_kv);
    if (!Number.isFinite(outputVoltageKv) || outputVoltageKv <= 0) missing.push('output_voltage_kv');
    const efficiencyPct = Number(props.efficiency_pct);
    if (!Number.isFinite(efficiencyPct) || efficiencyPct <= 0 || efficiencyPct > 100) missing.push('efficiency_pct');
    const batteryRuntimeMin = Number(props.battery_runtime_min);
    if (!Number.isFinite(batteryRuntimeMin) || batteryRuntimeMin < 0) missing.push('battery_runtime_min');
    const batteryDcV = Number(props.battery_dc_v);
    if (!Number.isFinite(batteryDcV) || batteryDcV <= 0) missing.push('battery_dc_v');
    if (typeof props.static_bypass_supported !== 'boolean') missing.push('static_bypass_supported');

    const operatingMode = `${props.operating_mode ?? ''}`.trim().toLowerCase();
    const allowedModes = new Set(['normal', 'battery', 'bypass']);
    if (!allowedModes.has(operatingMode)) missing.push('operating_mode');
    const runtimeNormalMin = Number(props.runtime_normal_min);
    const runtimeBatteryMin = Number(props.runtime_battery_min ?? props.battery_runtime_min);
    const runtimeBypassMin = Number(props.runtime_bypass_min);
    if (!Number.isFinite(runtimeNormalMin) || runtimeNormalMin < 0) missing.push('runtime_normal_min');
    if (!Number.isFinite(runtimeBatteryMin) || runtimeBatteryMin < 0) missing.push('runtime_battery_min');
    if (!Number.isFinite(runtimeBypassMin) || runtimeBypassMin < 0) missing.push('runtime_bypass_min');
    if (typeof props.mode_normal_enabled !== 'boolean') missing.push('mode_normal_enabled');
    if (typeof props.mode_battery_enabled !== 'boolean') missing.push('mode_battery_enabled');
    if (typeof props.mode_bypass_enabled !== 'boolean') missing.push('mode_bypass_enabled');

    const consistency = [];
    if (Number.isFinite(runtimeBatteryMin) && Number.isFinite(batteryRuntimeMin)
      && Math.abs(runtimeBatteryMin - batteryRuntimeMin) > 1e-6) {
      consistency.push('runtime_battery_min must match battery_runtime_min');
    }
    if (props.mode_battery_enabled === true && Number.isFinite(runtimeBatteryMin) && runtimeBatteryMin <= 0) {
      consistency.push('mode_battery_enabled requires runtime_battery_min > 0');
    }
    if (operatingMode === 'bypass' && props.static_bypass_supported !== true) {
      consistency.push('operating_mode=bypass requires static_bypass_supported=true');
    }
    if (operatingMode === 'normal' && props.mode_normal_enabled === false) {
      consistency.push('operating_mode=normal requires mode_normal_enabled=true');
    }
    if (operatingMode === 'battery' && props.mode_battery_enabled === false) {
      consistency.push('operating_mode=battery requires mode_battery_enabled=true');
    }
    if (operatingMode === 'bypass' && props.mode_bypass_enabled === false) {
      consistency.push('operating_mode=bypass requires mode_bypass_enabled=true');
    }

    if (missing.length) {
      issues.push({
        component: c.id,
        message: `UPS missing/invalid attributes: ${missing.join(', ')}.`
      });
    }
    if (consistency.length) {
      issues.push({
        component: c.id,
        message: `UPS rating/runtime consistency checks failed: ${consistency.join('; ')}.`
      });
    }
  });

  // DC bus required field completeness for DC-focused studies
  components.forEach(c => {
    const isDcBus = c?.subtype === 'dc_bus';
    if (!isDcBus) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    const nominalVoltage = Number(props.nominal_voltage_vdc);
    if (!Number.isFinite(nominalVoltage) || nominalVoltage <= 0) missing.push('nominal_voltage_vdc');
    if (!`${props.grounding_scheme ?? ''}`.trim()) missing.push('grounding_scheme');
    const maxContinuousCurrent = Number(props.max_continuous_current_a);
    if (!Number.isFinite(maxContinuousCurrent) || maxContinuousCurrent <= 0) missing.push('max_continuous_current_a');
    const shortCircuitRating = Number(props.short_circuit_rating_ka);
    if (!Number.isFinite(shortCircuitRating) || shortCircuitRating <= 0) missing.push('short_circuit_rating_ka');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `DC bus missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Panel required field completeness for panel studies and reports
  components.forEach(c => {
    const subtype = `${c?.subtype ?? ''}`.trim().toLowerCase();
    const isPanel = (c?.type === 'panel' || subtype === 'panel') && subtype !== 'mcc';
    if (!isPanel) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const ratedVoltageKv = Number(props.rated_voltage_kv);
    if (!Number.isFinite(ratedVoltageKv) || ratedVoltageKv <= 0) missing.push('rated_voltage_kv');
    const phases = Number(props.phases);
    if (!Number.isFinite(phases) || phases <= 0) missing.push('phases');
    const busRatingA = Number(props.bus_rating_a);
    if (!Number.isFinite(busRatingA) || busRatingA <= 0) missing.push('bus_rating_a');
    if (!`${props.main_device_type ?? ''}`.trim()) missing.push('main_device_type');
    const mainInterruptingKa = Number(props.main_interrupting_ka);
    if (!Number.isFinite(mainInterruptingKa) || mainInterruptingKa <= 0) missing.push('main_interrupting_ka');
    if (!`${props.grounding_type ?? ''}`.trim()) missing.push('grounding_type');
    if (!`${props.service_type ?? ''}`.trim()) missing.push('service_type');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Panel missing required attributes: ${missing.join(', ')}.`
      });
    }
  });


  // MCC required field completeness for lineup and study metadata
  components.forEach(c => {
    const isMcc = c?.subtype === 'mcc' || c?.type === 'mcc';
    if (!isMcc) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const ratedVoltageKv = Number(props.rated_voltage_kv);
    if (!Number.isFinite(ratedVoltageKv) || ratedVoltageKv <= 0) missing.push('rated_voltage_kv');
    const busRatingA = Number(props.bus_rating_a);
    if (!Number.isFinite(busRatingA) || busRatingA <= 0) missing.push('bus_rating_a');
    if (!`${props.main_device_type ?? ''}`.trim()) missing.push('main_device_type');
    const sccrKa = Number(props.sccr_ka);
    if (!Number.isFinite(sccrKa) || sccrKa <= 0) missing.push('sccr_ka');
    const bucketCount = Number(props.bucket_count);
    if (!Number.isFinite(bucketCount) || bucketCount <= 0) missing.push('bucket_count');
    const spareBucketCount = Number(props.spare_bucket_count);
    if (!Number.isFinite(spareBucketCount) || spareBucketCount < 0 || (Number.isFinite(bucketCount) && spareBucketCount > bucketCount)) {
      missing.push('spare_bucket_count');
    }
    if (!`${props.form_type ?? ''}`.trim()) missing.push('form_type');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `MCC missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Switchboard required field completeness for fault/protection studies
  components.forEach(c => {
    const isSwitchboard = c?.type === 'switchboard' || c?.subtype === 'switchboard';
    if (!isSwitchboard) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const ratedVoltageKv = Number(props.rated_voltage_kv);
    if (!Number.isFinite(ratedVoltageKv) || ratedVoltageKv <= 0) missing.push('rated_voltage_kv');
    const phases = Number(props.phases);
    if (!Number.isFinite(phases) || phases <= 0) missing.push('phases');
    const busRatingA = Number(props.bus_rating_a);
    if (!Number.isFinite(busRatingA) || busRatingA <= 0) missing.push('bus_rating_a');
    const withstand1sKa = Number(props.withstand_1s_ka);
    if (!Number.isFinite(withstand1sKa) || withstand1sKa <= 0) missing.push('withstand_1s_ka');
    const interruptingKa = Number(props.interrupting_ka);
    if (!Number.isFinite(interruptingKa) || interruptingKa <= 0) missing.push('interrupting_ka');
    if (!`${props.arc_resistant_type ?? ''}`.trim()) missing.push('arc_resistant_type');
    if (typeof props.maintenance_mode_supported !== 'boolean') missing.push('maintenance_mode_supported');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Switchboard missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Cable required field completeness for feeder/path impedance studies
  components.forEach(c => {
    const isCable = c?.type === 'cable' || c?.subtype === 'cable';
    if (!isCable) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const lengthFt = Number(props.length_ft);
    if (!Number.isFinite(lengthFt) || lengthFt <= 0) missing.push('length_ft');
    if (!`${props.material ?? ''}`.trim()) missing.push('material');
    if (!`${props.insulation_type ?? ''}`.trim()) missing.push('insulation_type');
    const tempRatingC = Number(props.temp_rating_c);
    if (!Number.isFinite(tempRatingC) || tempRatingC <= 0) missing.push('temp_rating_c');
    if (!`${props.size_awg_kcmil ?? ''}`.trim()) missing.push('size_awg_kcmil');
    const parallelSets = Number(props.parallel_sets);
    if (!Number.isFinite(parallelSets) || parallelSets <= 0) missing.push('parallel_sets');
    const rOhmPerKft = Number(props.r_ohm_per_kft);
    if (!Number.isFinite(rOhmPerKft) || rOhmPerKft < 0) missing.push('r_ohm_per_kft');
    const xOhmPerKft = Number(props.x_ohm_per_kft);
    if (!Number.isFinite(xOhmPerKft) || xOhmPerKft < 0) missing.push('x_ohm_per_kft');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Cable missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Busway required field completeness for feeder/path impedance studies
  components.forEach(c => {
    const isBusway = c?.type === 'busway' || c?.subtype === 'busway';
    if (!isBusway) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    const lengthFt = Number(props.length_ft);
    if (!Number.isFinite(lengthFt) || lengthFt <= 0) missing.push('length_ft');
    if (!`${props.material ?? ''}`.trim()) missing.push('material');
    if (!`${props.insulation_type ?? ''}`.trim()) missing.push('insulation_type');
    if (!`${props.enclosure_rating ?? ''}`.trim()) missing.push('enclosure_rating');
    const buswayType = `${props.busway_type ?? ''}`.trim().toLowerCase();
    if (!['feeder', 'plug-in'].includes(buswayType)) missing.push('busway_type');
    const ampacityA = Number(props.ampacity_a);
    if (!Number.isFinite(ampacityA) || ampacityA <= 0) missing.push('ampacity_a');
    const rOhmPerKft = Number(props.r_ohm_per_kft);
    if (!Number.isFinite(rOhmPerKft) || rOhmPerKft <= 0) missing.push('r_ohm_per_kft');
    const xOhmPerKft = Number(props.x_ohm_per_kft);
    if (!Number.isFinite(xOhmPerKft) || xOhmPerKft <= 0) missing.push('x_ohm_per_kft');
    const shortCircuitRatingKa = Number(props.short_circuit_rating_ka);
    if (!Number.isFinite(shortCircuitRatingKa) || shortCircuitRatingKa <= 0) missing.push('short_circuit_rating_ka');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Busway missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Generator required field completeness for short-circuit/transient/dispatch studies
  components.forEach(c => {
    const subtype = `${c?.subtype ?? ''}`.trim().toLowerCase();
    const type = `${c?.type ?? ''}`.trim().toLowerCase();
    const isGenerator = type === 'generator' || subtype === 'generator' || subtype === 'synchronous' || subtype === 'asynchronous';
    if (!isGenerator) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const ratedMva = Number(props.rated_mva);
    if (!Number.isFinite(ratedMva) || ratedMva <= 0) missing.push('rated_mva');
    const ratedKv = Number(props.rated_kv);
    if (!Number.isFinite(ratedKv) || ratedKv <= 0) missing.push('rated_kv');
    const xdppPu = Number(props.xdpp_pu);
    if (!Number.isFinite(xdppPu) || xdppPu <= 0) missing.push('xdpp_pu');
    const xdpPu = Number(props.xdp_pu);
    if (!Number.isFinite(xdpPu) || xdpPu <= 0) missing.push('xdp_pu');
    const xdPu = Number(props.xd_pu);
    if (!Number.isFinite(xdPu) || xdPu <= 0) missing.push('xd_pu');
    const hConstant = Number(props.h_constant_s);
    if (!Number.isFinite(hConstant) || hConstant <= 0) missing.push('h_constant_s');
    if (!`${props.governor_mode ?? ''}`.trim()) missing.push('governor_mode');
    if (!`${props.avr_mode ?? ''}`.trim()) missing.push('avr_mode');
    const minKw = Number(props.min_kw);
    if (!Number.isFinite(minKw) || minKw < 0) missing.push('min_kw');
    const maxKw = Number(props.max_kw);
    if (!Number.isFinite(maxKw) || maxKw <= 0 || (Number.isFinite(minKw) && minKw > maxKw)) missing.push('max_kw');
    const rampKwPerMin = Number(props.ramp_kw_per_min);
    if (!Number.isFinite(rampKwPerMin) || rampKwPerMin <= 0) missing.push('ramp_kw_per_min');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Generator missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Capacitor/reactor required tuning metadata completeness
  components.forEach(c => {
    const subtype = `${c?.subtype ?? ''}`.trim().toLowerCase();
    const type = `${c?.type ?? ''}`.trim().toLowerCase();
    const isCapacitorOrReactor = subtype === 'shunt_capacitor_bank'
      || subtype === 'reactor'
      || subtype === 'capacitorbank'
      || type === 'shunt_capacitor_bank'
      || type === 'reactor';
    if (!isCapacitorOrReactor) return;

    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');

    const ratedKvar = Number(props.rated_kvar);
    if (!Number.isFinite(ratedKvar) || ratedKvar <= 0) missing.push('rated_kvar');
    const ratedKv = Number(props.rated_kv);
    if (!Number.isFinite(ratedKv) || ratedKv <= 0) missing.push('rated_kv');
    const steps = Number(props.steps);
    if (!Number.isFinite(steps) || steps <= 0) missing.push('steps');

    const hasDetuned = typeof props.detuned === 'boolean';
    if (!hasDetuned) {
      missing.push('detuned');
    }

    if (!`${props.switching_transient_class ?? ''}`.trim()) missing.push('switching_transient_class');

    const validatePositiveOptionalNumber = (value, key) => {
      if (value === '' || value === null || value === undefined) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) missing.push(key);
    };

    if (props.detuned === true) {
      const tuningHz = Number(props.tuning_hz);
      if (!Number.isFinite(tuningHz) || tuningHz <= 0) missing.push('tuning_hz');
      const reactorPct = Number(props.reactor_pct);
      if (!Number.isFinite(reactorPct) || reactorPct <= 0) missing.push('reactor_pct');
    } else {
      validatePositiveOptionalNumber(props.tuning_hz, 'tuning_hz');
      validatePositiveOptionalNumber(props.reactor_pct, 'reactor_pct');
    }

    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Capacitor/reactor missing required attributes: ${missing.join(', ')}.`
      });
    }
  });


  // Differential relay (87) required field completeness
  components.forEach(c => {
    const isRelay87 = c?.subtype === 'relay_87';
    if (!isRelay87) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const zone = `${props.protected_zone_type ?? ''}`.trim();
    if (!['bus', 'transformer', 'generator'].includes(zone)) missing.push('protected_zone_type');
    const pickupPu = Number(props.pickup_pu);
    if (!Number.isFinite(pickupPu) || pickupPu <= 0) missing.push('pickup_pu');
    const slope1 = Number(props.slope1_pct);
    if (!Number.isFinite(slope1) || slope1 <= 0) missing.push('slope1_pct');
    const slope2 = Number(props.slope2_pct);
    if (!Number.isFinite(slope2) || slope2 <= 0) missing.push('slope2_pct');
    const breakpointPu = Number(props.breakpoint_pu);
    if (!Number.isFinite(breakpointPu) || breakpointPu <= 0) missing.push('breakpoint_pu');
    if (typeof props.inrush_blocking_enabled !== 'boolean') missing.push('inrush_blocking_enabled');
    const secondHarmonic = Number(props.second_harmonic_pct);
    if (!Number.isFinite(secondHarmonic) || secondHarmonic < 0) missing.push('second_harmonic_pct');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Differential relay missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // TCC duty/coordination violations from studies
  Object.entries(studies.duty || {}).forEach(([id, msgs = []]) => {
    msgs.forEach(msg => issues.push({ component: id, message: msg }));
  });

  return issues;
}

const DEFAULT_PROFILE_LOG_INTERVAL=100;

function createElementCache(root=document){
  const idCache=new Map();
  const selectorCache=new Map();
  return {
    getById(id){
      if(!idCache.has(id)) idCache.set(id,root.getElementById(id));
      return idCache.get(id);
    },
    query(selector){
      if(!selectorCache.has(selector)) selectorCache.set(selector,root.querySelector(selector));
      return selectorCache.get(selector);
    },
    clear(){
      idCache.clear();
      selectorCache.clear();
    }
  };
}

function createDomWriteBatcher(){
  let frame=0;
  const queued=new Set();

  function flush(){
    frame=0;
    const tasks=Array.from(queued);
    queued.clear();
    tasks.forEach(task=>task());
  }

  return {
    write(task){
      if(typeof task!=='function') return;
      queued.add(task);
      if(frame) return;
      frame=requestAnimationFrame(flush);
    },
    flushNow(){
      if(frame){
        cancelAnimationFrame(frame);
        frame=0;
      }
      flush();
    }
  };
}

function createHandlerProfiler(label,{logEvery=DEFAULT_PROFILE_LOG_INTERVAL}={}){
  let count=0;
  let totalDuration=0;

  return function profile(handlerName,handler){
    return function profiledHandler(...args){
      const started=globalThis.performance?.now?.()??Date.now();
      const result=handler.apply(this,args);
      const ended=globalThis.performance?.now?.()??Date.now();
      count+=1;
      totalDuration+=ended-started;
      if(count%logEvery===0){
        const avg=(totalDuration/count).toFixed(3);
        console.debug(`[${label}] ${handlerName}: count=${count}, avgMs=${avg}`);
      }
      return result;
    };
  };
}

/**
 * Real-time collaboration client.
 *
 * Connects to the CableTrayRoute WebSocket collaboration server and:
 *   1. Broadcasts local project patches to other connected clients
 *   2. Receives remote patches and applies them locally
 *   3. Tracks presence (which users are viewing/editing the same project)
 *
 * Usage:
 *   import { CollabClient } from './collaboration.js';
 *
 *   const collab = new CollabClient({ projectId, username });
 *   collab.onPresence(users => updatePresenceUI(users));
 *   collab.onRemotePatch(({ username, patch }) => applyPatch(patch));
 *   collab.connect();
 *   collab.sendPatch(mergePatch);  // call after each local save
 *   collab.disconnect();
 */

const WS_URL = (() => {
  if (typeof window === 'undefined') return null;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/collab`;
})();

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];
const PING_INTERVAL_MS = 25000;

class CollabClient extends EventTarget {
  /** @type {WebSocket|null} */
  #ws = null;
  #projectId;
  #username;
  #reconnectAttempt = 0;
  #intentionalClose = false;
  #pingTimer = null;
  /** Sequence number of the last patch received from the server. */
  #lastSeq = 0;

  constructor({ projectId, username }) {
    super();
    this.#projectId = projectId;
    this.#username = username;
  }

  get connected() {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  /** Connect (or reconnect) to the collaboration server. */
  connect() {
    if (this.#ws && this.#ws.readyState <= WebSocket.OPEN) return; // already connecting/open
    if (!WS_URL) return;

    this.#intentionalClose = false;
    this.#lastSeq = 0;
    this.#ws = new WebSocket(WS_URL);

    this.#ws.addEventListener('open', () => {
      this.#reconnectAttempt = 0;
      this.#send({ type: 'join', projectId: this.#projectId, username: this.#username });
      this.#startPing();
      this.dispatchEvent(new CustomEvent('connected'));
    });

    this.#ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.#handleMessage(msg);
    });

    this.#ws.addEventListener('close', () => {
      this.#stopPing();
      this.dispatchEvent(new CustomEvent('disconnected'));
      if (!this.#intentionalClose) this.#scheduleReconnect();
    });

    this.#ws.addEventListener('error', () => {
      // Error event is always followed by close; no additional action needed.
    });
  }

  /** Cleanly disconnect from the server. */
  disconnect() {
    this.#intentionalClose = true;
    this.#stopPing();
    if (this.#ws) {
      if (this.#ws.readyState === WebSocket.OPEN) {
        this.#send({ type: 'leave', projectId: this.#projectId, username: this.#username });
      }
      this.#ws.close();
      this.#ws = null;
    }
  }

  /**
   * Broadcast a local patch to all other connected clients.
   * @param {object} patch - JSON Merge Patch describing the change
   */
  sendPatch(patch) {
    if (!this.connected) return;
    this.#send({
      type: 'patch',
      projectId: this.#projectId,
      username: this.#username,
      patch,
      baseSeq: this.#lastSeq,
    });
  }

  /**
   * Register a callback for conflict notifications.
   * Fired when a remote patch is received out of sequence, indicating
   * that a concurrent edit overwrote a local change.
   * @param {function({username:string, gap:number}):void} handler
   */
  onConflict(handler) {
    this.addEventListener('conflict', ev => handler(ev.detail));
  }

  /**
   * Register a callback for presence updates.
   * @param {function(string[]):void} handler - receives array of usernames
   */
  onPresence(handler) {
    this.addEventListener('presence', ev => handler(ev.detail));
  }

  /**
   * Register a callback for remote patches.
   * @param {function({username:string, patch:object}):void} handler
   */
  onRemotePatch(handler) {
    this.addEventListener('remotePatch', ev => handler(ev.detail));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  #send(msg) {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(msg));
    }
  }

  #handleMessage(msg) {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'presence':
        this.dispatchEvent(new CustomEvent('presence', { detail: msg.users || [] }));
        break;
      case 'patch': {
        const incomingSeq = typeof msg.seq === 'number' ? msg.seq : null;
        if (incomingSeq !== null) {
          const expected = this.#lastSeq + 1;
          if (incomingSeq > expected) {
            // One or more patches were missed — signal a conflict so the UI
            // can warn the user that remote changes may have overwritten theirs.
            this.dispatchEvent(new CustomEvent('conflict', {
              detail: { username: msg.username, gap: incomingSeq - expected }
            }));
          }
          this.#lastSeq = incomingSeq;
        }
        this.dispatchEvent(new CustomEvent('remotePatch', {
          detail: { username: msg.username, patch: msg.patch, seq: incomingSeq }
        }));
        break;
      }
      case 'sync':
        // Server sends the current sequence on join so the client starts in sync
        if (typeof msg.seq === 'number') this.#lastSeq = msg.seq;
        break;
      case 'ack':
        // Server acknowledges our patch and confirms the assigned sequence
        if (typeof msg.seq === 'number') this.#lastSeq = msg.seq;
        break;
      case 'pong':
        // keepalive acknowledged
        break;
      case 'error':
        console.warn('[collab] Server error:', msg.message);
        break;
    }
  }

  #scheduleReconnect() {
    const delay = RECONNECT_DELAYS_MS[Math.min(this.#reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.#reconnectAttempt += 1;
    setTimeout(() => {
      if (!this.#intentionalClose) this.connect();
    }, delay);
  }

  #startPing() {
    this.#stopPing();
    this.#pingTimer = setInterval(() => {
      this.#send({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  #stopPing() {
    if (this.#pingTimer !== null) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }
  }
}

/**
 * Render a compact presence bar showing which users are co-editing.
 *
 * @param {HTMLElement} container - element to render into
 * @param {string[]} users        - list of usernames currently connected
 * @param {string} currentUser   - the local user (shown with "you" tag)
 */
function renderPresenceBar(container, users, currentUser) {
  if (!container) return;
  container.innerHTML = '';
  if (!users || users.length === 0) {
    container.setAttribute('aria-label', 'No other users connected');
    return;
  }
  container.setAttribute('aria-label', `${users.length} user(s) connected`);
  for (const user of users) {
    const chip = document.createElement('span');
    chip.className = 'presence-chip';
    chip.textContent = user === currentUser ? `${user} (you)` : user;
    chip.setAttribute('title', `${user} is viewing this project`);
    container.appendChild(chip);
  }
}

/**
 * Collaboration conflict notifications.
 *
 * When the server detects that a remote patch arrived out of sequence —
 * meaning one or more intermediate patches were applied by other users
 * before the client had a chance to see them — it signals a conflict via
 * CollabClient's 'conflict' event.  This module listens for that event
 * and surfaces a brief, dismissible toast so the user knows their view
 * may differ from what other collaborators just saved.
 *
 * Usage:
 *   import { initConflictNotifications } from './collaborationConflict.js';
 *   initConflictNotifications(collabClient);
 */

const TOAST_DURATION_MS = 6000;
let toastEl = null;
let toastTimer = null;

/**
 * Attach conflict-notification handling to a CollabClient.
 *
 * @param {import('./collaboration.js').CollabClient} client
 */
function initConflictNotifications(client) {
  if (!client) return;
  client.onConflict(({ username, gap }) => {
    const who = username || 'Another user';
    const plural = gap > 1 ? `${gap} changes` : 'a change';
    showConflictToast(`${who} saved ${plural} that may overlap with yours. Please review before saving.`);
  });
}

/**
 * Show a dismissible conflict toast at the top of the page.
 * @param {string} message
 */
function showConflictToast(message) {
  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  if (!toastEl) {
    toastEl = createToastElement();
    document.body.appendChild(toastEl);
  }

  const msgEl = toastEl.querySelector('.collab-conflict-msg');
  if (msgEl) msgEl.textContent = message;
  toastEl.removeAttribute('hidden');
  toastEl.setAttribute('aria-live', 'assertive');

  toastTimer = setTimeout(() => dismissToast(), TOAST_DURATION_MS);
}

function dismissToast() {
  if (toastEl) toastEl.setAttribute('hidden', '');
  toastTimer = null;
}

function createToastElement() {
  const el = document.createElement('div');
  el.className = 'collab-conflict-toast';
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'assertive');
  el.setAttribute('aria-atomic', 'true');
  el.setAttribute('hidden', '');

  const msg = document.createElement('span');
  msg.className = 'collab-conflict-msg';
  el.appendChild(msg);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'collab-conflict-dismiss';
  btn.setAttribute('aria-label', 'Dismiss conflict notification');
  btn.textContent = '\u00d7';
  btn.addEventListener('click', dismissToast);
  el.appendChild(btn);

  // Inline critical styles so the toast works without a stylesheet dependency
  Object.assign(el.style, {
    position: 'fixed',
    top: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9999',
    background: '#7c3200',
    color: '#fff',
    padding: '0.75rem 1.25rem',
    borderRadius: '0.375rem',
    boxShadow: '0 2px 8px rgba(0,0,0,.35)',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    maxWidth: '90vw',
    fontSize: '0.9rem',
  });

  return el;
}

/**
 * Collaboration Manager — integrates CollabClient with the CableTrayRoute app.
 *
 * Responsibilities:
 *   - Manages a single CollabClient per page session
 *   - Broadcasts project patches whenever dataStore fires 'ctr:project-saved'
 *   - Applies incoming remote patches to the local dataStore
 *   - Renders a presence bar in #collab-presence (injected into top-nav)
 *   - Dispatches 'ctr:collab-connected' and 'ctr:collab-disconnected' events
 *
 * Usage (in any page script that wants live collaboration):
 *   import { initCollaboration } from './collabManager.js';
 *   initCollaboration({ projectId: 'my-project', username: 'alice' });
 *
 * The manager uses the 'ctr:project-saved' custom event that is dispatched
 * by dataStore.saveProject whenever a project is persisted.  To enable this,
 * dataStore.saveProject fires:
 *   document.dispatchEvent(new CustomEvent('ctr:project-saved', { detail: snapshot }))
 *
 * Remote patches are applied by calling applyMergePatch from dataStore.
 */


let activeClient = null;
let presenceBarEl = null;

/**
 * Initialise collaboration for the current page.
 *
 * @param {object} opts
 * @param {string} opts.projectId  - project identifier
 * @param {string} [opts.username] - override username (defaults to stored auth user)
 */
function initCollaboration({ projectId, username } = {}) {
  // Tear down any previous session
  stopCollaboration();

  const authState = getAuthContextState ? getAuthContextState() : null;
  const resolvedUsername = username || (authState && authState.user) || 'Guest';

  activeClient = new CollabClient({ projectId, username: resolvedUsername });

  // Conflict notifications (out-of-order patches warning)
  initConflictNotifications(activeClient);

  // Presence updates
  activeClient.onPresence(users => {
    if (!presenceBarEl) presenceBarEl = ensurePresenceBar();
    renderPresenceBar(presenceBarEl, users, resolvedUsername);
    document.dispatchEvent(new CustomEvent('ctr:collab-presence', { detail: { users } }));
  });

  // Incoming patches from other clients
  activeClient.onRemotePatch(({ username: sender, patch }) => {
    if (!patch || typeof patch !== 'object') return;
    try {
      // Dispatch event so any page handler can apply it appropriately
      document.dispatchEvent(new CustomEvent('ctr:remote-patch', {
        detail: { sender, patch },
        bubbles: false,
      }));
    } catch (err) {
      console.warn('[collab] Failed to dispatch remote patch event', err);
    }
  });

  activeClient.addEventListener('connected', () => {
    document.dispatchEvent(new CustomEvent('ctr:collab-connected', { detail: { projectId } }));
  });

  activeClient.addEventListener('disconnected', () => {
    document.dispatchEvent(new CustomEvent('ctr:collab-disconnected', { detail: { projectId } }));
  });

  // Listen for local saves and broadcast the snapshot as a patch
  document.addEventListener('ctr:project-saved', onProjectSaved);

  activeClient.connect();
}

/**
 * Cleanly disconnect and remove all listeners.
 */
function stopCollaboration() {
  document.removeEventListener('ctr:project-saved', onProjectSaved);
  if (activeClient) {
    activeClient.disconnect();
    activeClient = null;
  }
  if (presenceBarEl) {
    presenceBarEl.innerHTML = '';
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function onProjectSaved(ev) {
  if (!activeClient) return;
  // ev.detail should be the full project snapshot or a merge patch
  const snapshot = ev.detail;
  if (snapshot && typeof snapshot === 'object') {
    activeClient.sendPatch(snapshot);
  }
}

function ensurePresenceBar() {
  const topNav = document.querySelector('.top-nav');
  if (!topNav) return null;

  let bar = document.getElementById('collab-presence');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'collab-presence';
    bar.className = 'presence-bar';
    bar.setAttribute('aria-label', 'Connected collaborators');
    bar.setAttribute('aria-live', 'polite');
    topNav.appendChild(bar);
  }
  return bar;
}

installErrorTracking();

const FOCUSABLE="a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";
const AUTO_SAVE_INTERVAL_MS=5*60*1000;
const ONBOARDING_STATE_KEY='onboarding';
const ONBOARDING_VERSION='2026.03';
let cachedProjectFileHandle=null;
let autoSaveSchedulerInstance=null;
let dirtyTrackerInstance=null;
let operationToastTimer=null;
let lastSavedAt=null;
let lastSavedIndicatorTimer=null;

const ONBOARDING_SAMPLE_PROJECT={
  name:'Sample Project - Getting Started',
  cables:[
    {id:'CABLE-001',from:'MCC-1',to:'PANEL-A',conductor_size:'500 kcmil',insulation_type:'XLPE',voltage_rating:'5kV',length:180,route_preference:'TRAY-01'},
    {id:'CABLE-002',from:'PANEL-A',to:'MOTOR-101',conductor_size:'2/0 AWG',insulation_type:'THHN',voltage_rating:'600V',length:95,route_preference:'TRAY-02'},
    {id:'CABLE-003',from:'PANEL-A',to:'UPS-1',conductor_size:'1/0 AWG',insulation_type:'THHN',voltage_rating:'600V',length:110,route_preference:'C-101'}
  ],
  trays:[
    {tray_id:'TRAY-01',start_x:0,start_y:0,start_z:12,end_x:140,end_y:0,end_z:12,inside_width:24,tray_depth:4,tray_type:'Ladder (50 % fill)',allowed_cable_group:'power'},
    {tray_id:'TRAY-02',start_x:140,start_y:0,start_z:12,end_x:140,end_y:80,end_z:12,inside_width:18,tray_depth:4,tray_type:'Ladder (50 % fill)',allowed_cable_group:'power'}
  ],
  conduits:[
    {conduit_id:'C-101',type:'RMC',trade_size:'3',start_x:140,start_y:80,start_z:0,end_x:200,end_y:80,end_z:0,allowed_cable_group:'control'}
  ],
  ductbanks:[
    {tag:'DB-01',from:'SUB-1',to:'MCC-1',concrete_encasement:true,start_x:-80,start_y:0,start_z:-4,end_x:0,end_y:0,end_z:-4}
  ]
};

function ensureOperationToast(){
  if(typeof document==='undefined') return null;
  let toast=document.getElementById('toast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='toast';
    toast.className='toast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    document.body.appendChild(toast);
  }
  return toast;
}

function applyPageVisualIdentity(){
  if(typeof document==='undefined') return;
  const body=document.body;
  if(!body) return;
  const file=(window.location.pathname.split('/').pop()||'index.html').toLowerCase();
  const visualMap=[
    {match:/schedule|list/,value:'schedule'},
    {match:/route|ductbank|pullcards|supportspan/,value:'routing'},
    {match:/fill/,value:'capacity'},
    {match:/arcflash|harmonics|voltageflicker|motorstart|shortcircuit|loadflow|tcc|conduitbend|busdust|besshazard|insulationcoordination/,value:'analysis'},
    {match:/oneline|custom-components/,value:'diagram'},
    {match:/account|login|forgot-password|reset-password/,value:'account'},
    {match:/index/,value:'home'}
  ];
  const visual=visualMap.find(entry=>entry.match.test(file))?.value||'default';
  body.dataset.pageVisual=visual;

  document.querySelectorAll('.page-header').forEach((header,index)=>{
    if(!(header instanceof HTMLElement)) return;
    header.classList.add('page-header-graphic');
    const title=header.querySelector('h1,h2');
    if(title&&title.id){
      header.setAttribute('aria-labelledby',title.id);
    }else if(title&&index===0){
      const generatedId='page-header-title';
      title.id=generatedId;
      header.setAttribute('aria-labelledby',generatedId);
    }
  });
}

function showOperationToast(message,kind='success'){
  const toast=ensureOperationToast();
  if(!toast) return;
  toast.textContent=message;
  toast.classList.remove('toast-error','toast-success');
  toast.classList.add(kind==='error'?'toast-error':'toast-success','show');
  // Errors need immediate screen-reader announcement
  toast.setAttribute('aria-live', kind==='error' ? 'assertive' : 'polite');
  toast.setAttribute('role', kind==='error' ? 'alert' : 'status');
  if(operationToastTimer) clearTimeout(operationToastTimer);
  operationToastTimer=setTimeout(()=>{
    toast.classList.remove('show','toast-error','toast-success');
    operationToastTimer=null;
  },3200);
}

function getOnboardingSettings(){
  try{
    const state=getProjectState();
    const onboarding=state?.settings?.[ONBOARDING_STATE_KEY];
    return onboarding&&typeof onboarding==='object'?onboarding:{};
  }catch{
    return {};
  }
}

function saveOnboardingSettings(patch={}){
  const next={
    ...getOnboardingSettings(),
    ...patch,
    version:ONBOARDING_VERSION,
    updatedAt:new Date().toISOString()
  };
  setProjectKey(ONBOARDING_STATE_KEY,JSON.stringify(next));
  return next;
}

async function initializeSampleProject(){
  setProjectKey('cableSchedule',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.cables));
  setProjectKey('traySchedule',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.trays));
  setProjectKey('conduitSchedule',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.conduits));
  setProjectKey('ductbankSchedule',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.ductbanks));
  const state=getProjectState();
  state.name=ONBOARDING_SAMPLE_PROJECT.name;
  setProjectState(state);
  saveProject(ONBOARDING_SAMPLE_PROJECT.name);
  saveOnboardingSettings({sampleLoadedAt:new Date().toISOString()});
  await updateProjectDisplay();
}

async function runOnboardingFlow({force=false,source='auto'}={}){
  if(typeof document==='undefined') return;
  const state=getOnboardingSettings();
  if(!force&&state.completed===true&&state.version===ONBOARDING_VERSION) return;
  if(!force&&state.dismissedVersion===ONBOARDING_VERSION) return;
  const totalSteps=6;
  const stepIndicator=i=>`Step ${i+1} of ${totalSteps}`;
  const steps=[
    {
      title:'Welcome to CableTrayRoute',
      description:'This quick onboarding walks you through the core workflow in under a minute.',
      details:`${stepIndicator(0)}\n\nCableTrayRoute is a browser-based electrical raceway design tool. Everything is saved locally in your browser — no account needed to get started.\n\nYou will set up cables, trays, conduits, and ductbanks, then run routing, fill, clash detection, and generate reports.`
    },
    {
      title:'Load a sample project in one click',
      description:'Need a working baseline? Seed the workflow with sample cables, raceways, and a ductbank.',
      details:`${stepIndicator(1)}\n\nClick "Load Sample Project" to populate a sample dataset: 3 cables, 2 trays, 1 conduit, and 1 ductbank. This lets you explore every feature without manual data entry.`,
      showSampleLoader:true
    },
    {
      title:'Step 1 — Build your Cable Schedule',
      description:'Start by defining the cables in your project.',
      details:`${stepIndicator(2)}\n\nGo to Cable Schedule to enter each cable's ID, endpoints, conductor size, insulation type, voltage rating, and length.\n\nTip: assign a "Route Preference" (tray or conduit ID) to each cable so the routing engine knows where to place it.`,
      link:{href:'cableschedule.html',label:'Open Cable Schedule'}
    },
    {
      title:'Step 2 — Define Raceways',
      description:'Add cable trays, conduits, and ductbanks.',
      details:`${stepIndicator(3)}\n\nGo to Raceway Schedule to enter tray dimensions (width, depth), start/end coordinates, and tray type.\n\nThe fill analysis uses NEC §392.22 limits. Tray fill is automatically computed when you navigate to Cable Tray Fill.`,
      link:{href:'racewayschedule.html',label:'Open Raceway Schedule'}
    },
    {
      title:'Step 3 — Run Routing and Analysis',
      description:'Compute the optimal route and run clash detection.',
      details:`${stepIndicator(4)}\n\n• Optimal Route — finds shortest paths for each cable through the tray network.\n• Clash Detection — flags 3D interference and clearance violations (NEMA VE 2 §8.4).\n• Spool Sheets — generates prefab assembly groups for field installation.\n• Project Report — aggregates all analysis results into one printable document.`,
      links:[
        {href:'optimalRoute.html',label:'Optimal Route'},
        {href:'clashdetect.html',label:'Clash Detection'},
        {href:'projectreport.html',label:'Project Report'},
      ]
    },
    {
      title:'Settings, help, and collaboration',
      description:'Find everything you need from the ⚙ Settings menu.',
      details:`${stepIndicator(5)}\n\n• Use ⚙ Settings > Site Help for reference documentation.\n• Save and load projects using the project buttons in Settings.\n• When logged in, real-time collaboration is active automatically — co-editors appear in the presence bar at the top of the page.\n• Reopen this tour at any time from Settings > Reopen Onboarding.`
    }
  ];

  let index=0;
  while(index<steps.length){
    const isFirst=index===0;
    const isLast=index===steps.length-1;
    const step=steps[index];
    let move='next';
    const result=await openModal({
      title:step.title,
      description:step.description,
      primaryText:isLast?'Finish':'Next',
      secondaryText:isFirst?'Skip':'Back',
      defaultWidth:'medium',
      onSubmit(){
        move='next';
        return true;
      },
      onCancel(){
        move=isFirst?'skip':'back';
      },
      render(container){
        const note=document.createElement('pre');
        note.className='modal-message onboarding-details';
        note.style.cssText='white-space:pre-wrap;font-family:inherit;margin:0 0 0.75rem;font-size:0.88rem;';
        note.textContent=step.details;
        container.appendChild(note);

        // Quick-link buttons for workflow steps
        const allLinks=[...(step.links||[]),...(step.link?[step.link]:[])];
        if(allLinks.length){
          const linkRow=document.createElement('div');
          linkRow.style.cssText='display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;';
          allLinks.forEach(({href,label})=>{
            const a=document.createElement('a');
            a.href=href;
            a.textContent=label;
            a.className='btn secondary-btn';
            a.style.fontSize='0.8rem';
            linkRow.appendChild(a);
          });
          container.appendChild(linkRow);
        }

        if(!step.showSampleLoader) return null;
        const loadSampleBtn=document.createElement('button');
        loadSampleBtn.type='button';
        loadSampleBtn.className='btn secondary-btn';
        loadSampleBtn.textContent='Load Sample Project';
        loadSampleBtn.addEventListener('click',async()=>{
          try{
            loadSampleBtn.disabled=true;
            await initializeSampleProject();
            loadSampleBtn.textContent='Sample Project Loaded ✓';
            showOperationToast('Sample project initialized.','success');
          }catch(err){
            console.error('Sample project initialization failed',err);
            loadSampleBtn.disabled=false;
            loadSampleBtn.textContent='Load Sample Project';
            showOperationToast('Sample project initialization failed.','error');
          }
        });
        container.appendChild(loadSampleBtn);
        return loadSampleBtn;
      }
    });
    if(result===null){
      if(move==='back'){
        index=Math.max(0,index-1);
        continue;
      }
      saveOnboardingSettings({
        completed:false,
        dismissedVersion:ONBOARDING_VERSION,
        dismissedAt:new Date().toISOString(),
        source
      });
      return;
    }
    index+=1;
  }

  saveOnboardingSettings({
    completed:true,
    completedAt:new Date().toISOString(),
    dismissedVersion:'',
    source
  });
}

function initOperationStatusHost(container){
  if(!container||typeof document==='undefined') return null;
  let host=document.getElementById('settings-operation-status');
  if(host) return host;
  host=document.createElement('div');
  host.id='settings-operation-status';
  host.className='settings-operation-status';
  host.setAttribute('aria-live','polite');
  host.setAttribute('aria-atomic','true');
  host.setAttribute('role','status');
  host.innerHTML='\n    <div class="operation-placeholder" aria-hidden="true">\n      <span class="operation-spinner"></span>\n      <span class="operation-progress-text">Idle</span>\n    </div>\n    <p class="operation-status-screenreader visually-hidden">Ready</p>\n  ';
  container.appendChild(host);
  // Inject last-saved indicator if not already present
  if(!document.getElementById('last-saved-indicator')){
    const indicator=document.createElement('span');
    indicator.id='last-saved-indicator';
    indicator.className='last-saved-indicator';
    indicator.setAttribute('aria-live','polite');
    container.appendChild(indicator);
  }
  updateLastSavedIndicator();
  return host;
}

function setOperationStatus(statusHost,phase,statusText){
  if(!statusHost) return;
  const placeholder=statusHost.querySelector('.operation-placeholder');
  const progressText=statusHost.querySelector('.operation-progress-text');
  const sr=statusHost.querySelector('.operation-status-screenreader');
  if(!placeholder||!progressText||!sr) return;
  progressText.textContent=statusText;
  sr.textContent=statusText;
  statusHost.dataset.phase=phase;
  const isBusy=phase==='busy';
  placeholder.classList.toggle('is-active',isBusy);
  placeholder.classList.toggle('is-complete',phase==='success');
  placeholder.classList.toggle('is-error',phase==='error');
}

async function runOperationWithStatus(statusHost,{pendingText,successText,errorText,operation}){
  setOperationStatus(statusHost,'busy',pendingText);
  try{
    const result=await operation();
    setOperationStatus(statusHost,'success',successText);
    showOperationToast(successText,'success');
    return result;
  }catch(err){
    console.error(errorText,err);
    const detail=err instanceof Error&&err.message?` ${err.message}`:'';
    const message=`${errorText}.${detail}`.trim();
    setOperationStatus(statusHost,'error',message);
    showOperationToast(errorText,'error');
    throw err;
  }
}

function currentProjectFromHash(){
  if(typeof location==='undefined') return '';
  const hash=location.hash;
  if(!hash||hash==='#'||hash.startsWith('#project=')) return '';
  try{
    return decodeURIComponent(hash.slice(1)).trim();
  }catch{
    return '';
  }
}

if(typeof window!=='undefined'){
  const initialProject=currentProjectFromHash()||(window.currentProjectId||'');
  window.currentProjectId=initialProject||'default';
}

function getDirtyTracker(){
  if(dirtyTrackerInstance) return dirtyTrackerInstance;
  const win=typeof window!=='undefined'?window:globalThis;
  if(!win) return null;
  if(win.dirtyTracker){
    dirtyTrackerInstance=win.dirtyTracker;
    return dirtyTrackerInstance;
  }
  if(typeof win.createDirtyTracker==='function'){
    try{
      dirtyTrackerInstance=win.createDirtyTracker(win);
      win.dirtyTracker=dirtyTrackerInstance;
      return dirtyTrackerInstance;
    }catch(err){console.error('Failed to initialize dirty tracker',err);}
  }
  return null;
}

function setAutoSaveFlag(active){
  if(typeof window!=='undefined'){
    window.autoSaveEnabled=Boolean(active);
  }
}
if(typeof window!=='undefined'&&!('autoSaveEnabled'in window)){
  window.autoSaveEnabled=false;
}

function formatLastSaved(date){
  if(!date) return '';
  const diff=Math.round((Date.now()-date.getTime())/1000);
  if(diff<5) return 'Saved just now';
  if(diff<60) return `Saved ${diff}s ago`;
  const mins=Math.floor(diff/60);
  if(mins<60) return `Saved ${mins}m ago`;
  const hrs=Math.floor(mins/60);
  return `Saved ${hrs}h ago`;
}

function updateLastSavedIndicator(){
  if(typeof document==='undefined') return;
  const el=document.getElementById('last-saved-indicator');
  if(!el) return;
  const savedText=formatLastSaved(lastSavedAt);
  if(savedText){
    el.textContent=`${savedText} • Edits auto-save in this browser.`;
  }else {
    el.textContent='Edits auto-save in this browser. Use Save Project for a downloadable backup.';
  }
}

function recordSave(){
  lastSavedAt=new Date();
  updateLastSavedIndicator();
  // Refresh "X ago" text every 30 seconds while the page is open
  if(lastSavedIndicatorTimer) clearInterval(lastSavedIndicatorTimer);
  lastSavedIndicatorTimer=setInterval(updateLastSavedIndicator,30000);
  if(lastSavedIndicatorTimer&&typeof lastSavedIndicatorTimer.unref==='function'){
    lastSavedIndicatorTimer.unref();
  }
}

initializeProjectStorage().catch(e=>console.error('fast-json-patch load failed',e));

function canonicalize(obj){
  if(Array.isArray(obj)) return obj.map(canonicalize);
  if(obj&&typeof obj==='object'){
    const out={};
    Object.keys(obj).sort().forEach(k=>{out[k]=canonicalize(obj[k]);});
    return out;
  }
  return obj;
}

function canonicalJSONString(obj){
  return JSON.stringify(canonicalize(obj));
}

async function sha256Hex(str){
  const buf=new TextEncoder().encode(str);
  const subtle=crypto.subtle||crypto.webcrypto?.subtle;
  const hash=await subtle.digest('SHA-256',buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function bytesToBase64(bytes){
  let binary='';
  for(const b of bytes) binary+=String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64){
  const bin=atob(b64);
  const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return arr;
}

async function compressString(str){
  try{
    const cs=new CompressionStream('gzip');
    const writer=cs.writable.getWriter();
    await writer.write(new TextEncoder().encode(str));
    await writer.close();
    const buffer=await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buffer);
  }catch{
    return new TextEncoder().encode(str);
  }
}

async function decompressBytes(bytes){
  try{
    const ds=new DecompressionStream('gzip');
    const writer=ds.writable.getWriter();
    await writer.write(bytes);
    await writer.close();
    const buffer=await new Response(ds.readable).arrayBuffer();
    return new TextDecoder().decode(buffer);
  }catch{
    return new TextDecoder().decode(bytes);
  }
}

async function encodeProjectForUrl(project){
  const json=canonicalJSONString(project);
  const bytes=await compressString(json);
  return encodeURIComponent(bytesToBase64(bytes));
}

async function decodeProjectFromUrl(encoded){
  const bytes=base64ToBytes(decodeURIComponent(encoded));
  const json=await decompressBytes(bytes);
  return JSON.parse(json);
}

async function updateProjectDisplay(snapshot){
  const proj=snapshot||getProjectState();
  const name=proj.name||'Untitled';
  try{
    const hash=await sha256Hex(canonicalJSONString(proj));
    let span=document.getElementById('project-display');
    if(!span){
      const nav=document.querySelector('.top-nav .nav-links');
      if(nav){
        span=document.createElement('span');
        span.id='project-display';
        span.style.marginLeft='auto';
        span.style.marginRight='var(--space-4)';
        const currentSettingsBtn=document.getElementById('settings-btn');
        if(currentSettingsBtn&&currentSettingsBtn.parentElement===nav&&nav.contains(currentSettingsBtn)){
          try{
            nav.insertBefore(span,currentSettingsBtn);
            currentSettingsBtn.style.marginLeft='0';
          }catch(err){
            console.warn('project display insert fallback',err);
            nav.appendChild(span);
          }
        }else {
          nav.appendChild(span);
        }
      }
    }
    if(span) span.textContent=`Project: ${name} (hash: ${hash.slice(0,8)})`;
  }catch(e){console.error('hash failed',e);}
}

const projectDisplayMetrics={
  scheduledCalls:0,
  flushCalls:0,
  runCount:0,
  coalesced:0,
  lastRunDuration:0,
  lastQueueDelay:0,
  maxQueueDelay:0,
  lastReason:'',
  lastScheduledAt:0
};

const now=()=>globalThis.performance?.now?.()??Date.now();

function createProjectDisplayScheduler(){
  let pendingSnapshot=null;
  let pendingReason='change';
  let scheduledHandle=null;
  let scheduledType=null;
  let runningPromise=null;

  function cancelScheduled(){
    if(scheduledHandle===null)return;
    if(scheduledType==='idle'&&typeof cancelIdleCallback==='function'){
      cancelIdleCallback(scheduledHandle);
    }else {
      clearTimeout(scheduledHandle);
    }
    scheduledHandle=null;
    scheduledType=null;
  }

  function run(snapshot,reason){
    const started=now();
    return updateProjectDisplay(snapshot).catch(err=>{
      console.error('project display update failed',err);
    }).finally(()=>{
      const duration=now()-started;
      projectDisplayMetrics.lastRunDuration=duration;
      projectDisplayMetrics.runCount+=1;
      projectDisplayMetrics.lastReason=reason;
    });
  }

  function processNext(){
    scheduledHandle=null;
    scheduledType=null;
    if(!pendingSnapshot){
      return;
    }
    if(runningPromise){
      runningPromise.finally(()=>{
        if(pendingSnapshot) ensureProcessing();
      });
      return;
    }
    const snapshot=pendingSnapshot;
    const reason=pendingReason;
    pendingSnapshot=null;
    pendingReason='change';
    runningPromise=run(snapshot,reason).finally(()=>{
      runningPromise=null;
      if(pendingSnapshot) ensureProcessing();
    });
  }

  function ensureProcessing(){
    if(scheduledHandle!==null||runningPromise){
      return;
    }
    if(!pendingSnapshot){
      return;
    }
    projectDisplayMetrics.lastScheduledAt=now();
    const runner=()=>{
      const delay=now()-projectDisplayMetrics.lastScheduledAt;
      projectDisplayMetrics.lastQueueDelay=delay;
      if(delay>projectDisplayMetrics.maxQueueDelay) projectDisplayMetrics.maxQueueDelay=delay;
      processNext();
    };
    if(typeof requestIdleCallback==='function'){
      scheduledType='idle';
      scheduledHandle=requestIdleCallback(runner,{timeout:200});
    }else {
      scheduledType='timeout';
      scheduledHandle=setTimeout(runner,32);
    }
  }

  function schedule(snapshot,{reason='change'}={}){
    const alreadyPending=!!pendingSnapshot||scheduledHandle!==null||!!runningPromise;
    pendingSnapshot=snapshot??getProjectState();
    pendingReason=reason;
    projectDisplayMetrics.scheduledCalls+=1;
    if(alreadyPending) projectDisplayMetrics.coalesced+=1;
    ensureProcessing();
  }

  async function flush(snapshot,{reason='flush'}={}){
    projectDisplayMetrics.flushCalls+=1;
    pendingSnapshot=snapshot??pendingSnapshot??getProjectState();
    pendingReason=reason;
    cancelScheduled();
    if(runningPromise){
      try{await runningPromise;}catch{}
    }
    const next=pendingSnapshot;
    pendingSnapshot=null;
    pendingReason='change';
    if(!next) return;
    await run(next,reason);
  }

  function resetMetrics(){
    projectDisplayMetrics.scheduledCalls=0;
    projectDisplayMetrics.flushCalls=0;
    projectDisplayMetrics.runCount=0;
    projectDisplayMetrics.coalesced=0;
    projectDisplayMetrics.lastRunDuration=0;
    projectDisplayMetrics.lastQueueDelay=0;
    projectDisplayMetrics.maxQueueDelay=0;
    projectDisplayMetrics.lastReason='';
    projectDisplayMetrics.lastScheduledAt=0;
  }

  function getMetrics(){
    return {
      ...projectDisplayMetrics,
      hasPending:!!pendingSnapshot||scheduledHandle!==null||!!runningPromise
    };
  }

  return {schedule,flush,resetMetrics,getMetrics};
}

const projectDisplayScheduler=createProjectDisplayScheduler();

function save(snapshot,options={}){
  if(options.flush){
    return projectDisplayScheduler.flush(snapshot,options);
  }
  projectDisplayScheduler.schedule(snapshot,options);
  return Promise.resolve();
}

globalThis.updateProjectDisplay=updateProjectDisplay;
if(typeof globalThis!=='undefined'){
  globalThis.__CTR_projectDisplayScheduler=projectDisplayScheduler;
}
onProjectChange(save);
save(null,{flush:true,reason:'initial-render'});

async function showShareLinkModal(url,{copied=true}={}){
  if(typeof document==='undefined') return;
  const inputId=`share-link-${Math.random().toString(36).slice(2)}`;
  const description=copied?
    'Share link copied to clipboard. You can also copy it manually below.':
    'Clipboard access is unavailable. Copy the link below to share the project.';
  await openModal({
    title:'Share Project',
    description,
    primaryText:'Close',
    secondaryText:null,
    onSubmit(){return true;},
    render(container,controls){
      const doc=container.ownerDocument;
      const wrapper=doc.createElement('div');
      wrapper.className='modal-form';
      const label=doc.createElement('label');
      label.setAttribute('for',inputId);
      label.textContent='Share URL';
      const input=doc.createElement('input');
      input.type='text';
      input.id=inputId;
      input.value=url;
      input.readOnly=true;
      input.addEventListener('focus',()=>input.select());
      label.appendChild(input);
      wrapper.appendChild(label);
      const note=doc.createElement('p');
      note.className='modal-message';
      note.id=`${inputId}-note`;
      note.textContent=copied?'Use this link to collaborate with your team.':'Select the link and use Ctrl+C (or ⌘C) to copy it.';
      const described=[controls.descriptionId,note.id].filter(Boolean).join(' ').trim();
      if(described) input.setAttribute('aria-describedby',described);
      wrapper.appendChild(note);
      container.appendChild(wrapper);
      controls.setInitialFocus(input);
      return input;
    }
  });
}

async function copyShareLink(){
  let shareUrl='';
  try{
    const proj=getProjectState()||defaultProject();
    const canonical=canonicalJSONString(proj);
    const encoded=await encodeProjectForUrl(proj);
    shareUrl=`${location.origin}${location.pathname}#project=${encoded}`;
    if(shareUrl.length<2000){
      let copied=false;
      if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
        try{
          await navigator.clipboard.writeText(shareUrl);
          copied=true;
        }catch(err){
          console.warn('Clipboard copy failed',err);
        }
      }
      await showShareLinkModal(shareUrl,{copied});
    }else {
      const blob=new Blob([canonical],{type:'application/json'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='project.ctr.json';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),0);
      await showAlertModal('Download Ready','The project is too large to share as a link. A download has started instead.');
    }
  }catch(e){
    console.error('share link failed',e);
    if(shareUrl){
      await showShareLinkModal(shareUrl,{copied:false});
    }else {
      await showAlertModal('Share Failed','We could not generate a share link. Please try again.');
    }
  }
}

async function loadProjectFromHash(){
  if(location.hash.startsWith('#project=')){
    try{
      const data=location.hash.slice(9);
      const proj=await decodeProjectFromUrl(data);
      setProjectState(proj);
      location.hash='';
      location.reload();
    }catch(e){console.error('load share failed',e);}
  } else if(location.hash){
    try{
      const name=decodeURIComponent(location.hash.slice(1));
      if(name) loadProject(name);
    }catch(e){console.error('hash load failed',e);}
  }
}

function applyProjectHash(){
  let activeName='';
  if(typeof window!=='undefined'){
    const fromHash=currentProjectFromHash();
    if(fromHash){
      activeName=fromHash;
    }else {
      try{
        const stateName=(getProjectState().name||'').trim();
        if(stateName) activeName=stateName;
      }catch(e){ console.warn('Could not read project name from state:', e); }
      if(!activeName){
        const globalName=typeof window.currentProjectId==='string'?window.currentProjectId.trim():'';
        if(globalName&&globalName!=='default') activeName=globalName;
      }
    }
    window.currentProjectId=activeName||'default';
    if(activeName){
      try{
        const proj=getProjectState();
        if((proj.name||'')!==activeName){
          proj.name=activeName;
          setProjectState(proj);
        }
      }catch(err){console.warn('Project name sync failed',err);}
    }
  }
  if(typeof document==='undefined'||typeof location==='undefined') return;
  const navHash=location.hash||(activeName?`#${encodeURIComponent(activeName)}`:'');
  if(!navHash) return;
  document.querySelectorAll('a[href$=".html"]').forEach(a=>{
    const href=a.getAttribute('href');
    if(!href||href.includes('#')) return;
    a.setAttribute('href',href+navHash);
  });
}

function trapFocus(e,container){
  if(e.key!=='Tab')return;
  const focusables=container.querySelectorAll(FOCUSABLE);
  if(!focusables.length)return;
  const first=focusables[0];
  const last=focusables[focusables.length-1];
  if(e.shiftKey&&document.activeElement===first){
    e.preventDefault();
    last.focus();
  }else if(!e.shiftKey&&document.activeElement===last){
    e.preventDefault();
    first.focus();
  }
}

function loadScript(url){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=url;
    s.onload=()=>resolve();
    s.onerror=reject;
    document.head.appendChild(s);
  });
}

async function generateTechnicalReport(format='pdf'){
  const getLabel=id=>document.querySelector(`label[for="${id}"]`)?.textContent.trim()||id;
  const inputs=[...document.querySelectorAll('input, select, textarea')]
    .map(el=>`${getLabel(el.id||el.name||'')}: ${el.value}`);
  const outputEl=document.getElementById('results')||document.getElementById('output');
  const outputs=outputEl?outputEl.innerText.trim():'';
  const refs=[...document.querySelectorAll('.method-panel a')].map(a=>a.href);

  if(format==='pdf'){
    if(!window.jspdf){
    await loadScript('dist/vendor/jspdf.umd.min.js');
    }
    const { jsPDF } = window.jspdf;
    const doc=new jsPDF();
    let y=10;
    doc.text('Technical Report',10,y); y+=10;
    doc.text('Inputs:',10,y); y+=10;
    inputs.forEach(line=>{doc.text(line,10,y); y+=10; if(y>280){doc.addPage(); y=10;}});
    if(outputs){doc.addPage(); y=10; doc.text('Outputs:',10,y); y+=10; doc.text(outputs,10,y);}
    if(refs.length){doc.addPage(); y=10; doc.text('References:',10,y); y+=10; refs.forEach(r=>{doc.text(r,10,y); y+=10; if(y>280){doc.addPage(); y=10;}});}
    doc.save('technical_report.pdf');
  }else {
    if(!window.docx){
    await loadScript('dist/vendor/docx.umd.js');
    }
    const { Document, Packer, Paragraph } = window.docx;
    const paragraphs=[new Paragraph('Technical Report'),new Paragraph('Inputs:')];
    inputs.forEach(line=>paragraphs.push(new Paragraph(line)));
    if(outputs){paragraphs.push(new Paragraph('Outputs:')); paragraphs.push(new Paragraph(outputs));}
    if(refs.length){paragraphs.push(new Paragraph('References:')); refs.forEach(r=>paragraphs.push(new Paragraph(r)));}
    const doc=new Document({sections:[{properties:{},children:paragraphs}]});
    const blob=await Packer.toBlob(doc);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='technical_report.docx';
    a.click();
  }
}

function initSettings(){
  const settingsBtn=document.getElementById('settings-btn');
  const settingsMenu=document.getElementById('settings-menu');
  const operationStatusHost=initOperationStatusHost(settingsMenu);
  if(settingsBtn&&settingsMenu){
    settingsMenu.setAttribute('role','dialog');
    settingsMenu.setAttribute('aria-modal','true');
    settingsMenu.setAttribute('aria-hidden','true');
    let open=false;

    const handleKey=e=>{
      if(e.key==='Escape')close();
      else trapFocus(e,settingsMenu);
    };

    const openMenu=()=>{
      open=true;
      settingsMenu.style.display='flex';
      settingsMenu.setAttribute('aria-hidden','false');
      settingsBtn.setAttribute('aria-expanded','true');
      document.addEventListener('keydown',handleKey);
      const focusables=settingsMenu.querySelectorAll(FOCUSABLE);
      if(focusables.length)focusables[0].focus();
    };

    const close=()=>{
      if(!open)return;
      open=false;
      settingsMenu.style.display='none';
      settingsMenu.setAttribute('aria-hidden','true');
      settingsBtn.setAttribute('aria-expanded','false');
      document.removeEventListener('keydown',handleKey);
      settingsBtn.focus();
    };

    settingsBtn.addEventListener('click',()=>{
      open?close():openMenu();
    });

    document.addEventListener('click',e=>{
      if(open&&!settingsMenu.contains(e.target)&&e.target!==settingsBtn){
        close();
      }
    });

    const nameLabel=document.createElement('label');
    nameLabel.textContent='Project Name';
    const nameInput=document.createElement('input');
    nameInput.type='text';
    nameInput.id='project-name-input';
    let initialProjectName='';
    try{initialProjectName=getProjectState().name||'';}catch(e){ console.warn('Could not read initial project name:', e); }
    nameInput.value=initialProjectName;
    nameInput.dataset.originalName=(initialProjectName||'').trim();
    nameLabel.appendChild(nameInput);
    if(!document.getElementById('project-name-input')&&nameLabel.parentNode!==settingsMenu){
      const currentFirstChild=settingsMenu.firstChild;
      if(currentFirstChild&&currentFirstChild.parentNode===settingsMenu){
        settingsMenu.insertBefore(nameLabel,currentFirstChild);
      }else {
        settingsMenu.appendChild(nameLabel);
      }
    }
    nameInput.addEventListener('focus',()=>{
      try{nameInput.dataset.originalName=(getProjectState().name||'').trim();}
      catch{nameInput.dataset.originalName=nameInput.value.trim();}
    });
    const commitProjectNameChange=async()=>{
      const manager=globalThis.projectManager;
      const previous=(nameInput.dataset.originalName||'').trim();
      const next=nameInput.value.trim();
      if(!next){
        nameInput.value=previous;
        return;
      }
      if(next===previous) return;
      if(!manager?.renameProject){
        try{
          const proj=getProjectState();
          proj.name=next;
          setProjectState(proj);
          save(proj,{flush:true,reason:'name-rename-fallback'});
        }catch{}
        nameInput.dataset.originalName=next;
        return;
      }
      try{
        const updated=manager.renameProject(next);
        const resolved=(updated||next).trim();
        if(resolved!==nameInput.value) nameInput.value=resolved;
        nameInput.dataset.originalName=resolved;
      }catch(err){
        console.error('Project rename failed',err);
        try{
          const proj=getProjectState();
          proj.name=previous;
          setProjectState(proj);
          save(proj,{flush:true,reason:'name-revert'});
        }catch{}
        nameInput.value=previous;
        nameInput.dataset.originalName=previous;
        const message=err instanceof Error?err.message:'Project name could not be updated.';
        await showAlertModal('Rename Failed',message);
      }
    };
    nameInput.addEventListener('input',e=>{
      try{
        const proj=getProjectState();
        proj.name=e.target.value;
        setProjectState(proj);
        save(proj,{flush:true,reason:'name-input'});
      }catch(e){ console.warn('Could not save project name during input:', e); }
    });
    nameInput.addEventListener('change',()=>{commitProjectNameChange().catch(console.error);});
    nameInput.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        nameInput.blur();
      }
    });

    const exportBtn=document.getElementById('export-project-btn');
    const helpBtn=document.getElementById('help-btn');
    if(helpBtn&&!document.getElementById('reopen-onboarding-btn')){
      const onboardingBtn=document.createElement('button');
      onboardingBtn.id='reopen-onboarding-btn';
      onboardingBtn.innerHTML='<img src="icons/oneline.svg" alt="" aria-hidden="true" class="control-icon"><span>Reopen Onboarding</span>';
      helpBtn.insertAdjacentElement('afterend',onboardingBtn);
    }
    const onboardingReopenBtn=document.getElementById('reopen-onboarding-btn');
    if(onboardingReopenBtn&&!onboardingReopenBtn.dataset.wired){
      onboardingReopenBtn.dataset.wired='1';
      onboardingReopenBtn.addEventListener('click',()=>{
        runOnboardingFlow({force:true,source:'settings'}).catch(err=>{
          console.error('Onboarding reopen failed',err);
        });
      });
    }
    const shareBtn=document.createElement('button');
    shareBtn.id='copy-share-link-btn';
    shareBtn.innerHTML='<img src="icons/toolbar/copy.svg" alt="" aria-hidden="true" class="control-icon"><span>Copy Share Link</span>';
    if(exportBtn) exportBtn.insertAdjacentElement('beforebegin',shareBtn);
    else settingsMenu.appendChild(shareBtn);
    shareBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Preparing share link…',
        successText:'Share link ready.',
        errorText:'Share link generation failed',
        operation:copyShareLink
      });
    });

    const selfCheckBtn=document.createElement('button');
    selfCheckBtn.id='run-self-check-btn';
    selfCheckBtn.innerHTML='<img src="icons/toolbar/validate.svg" alt="" aria-hidden="true" class="control-icon"><span>Run Self-Check</span>';
    settingsMenu.appendChild(selfCheckBtn);
    selfCheckBtn.addEventListener('click',()=>{ location.href='optimalRoute.html?selfcheck=1'; });

    const refreshLibBtn=document.createElement('button');
    refreshLibBtn.id='refresh-library-btn';
    refreshLibBtn.innerHTML='<img src="icons/toolbar/redo.svg" alt="" aria-hidden="true" class="control-icon"><span>Refresh Library</span>';
    settingsMenu.appendChild(refreshLibBtn);
    refreshLibBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Refreshing component and manufacturer libraries…',
        successText:'Library refresh complete.',
        errorText:'Library refresh failed',
        operation:async()=>{
          if(typeof globalThis.loadComponentLibrary==='function') await globalThis.loadComponentLibrary();
          if(typeof globalThis.loadManufacturerLibrary==='function') await globalThis.loadManufacturerLibrary();
          await showAlertModal('Library Refreshed','Component and manufacturer libraries were reloaded.');
        }
      });
    });

    const reportBtn=document.createElement('button');
    reportBtn.id='generate-report-btn';
    reportBtn.innerHTML='<img src="icons/toolbar/dimension.svg" alt="" aria-hidden="true" class="control-icon"><span>Generate Technical Report</span>';
    settingsMenu.appendChild(reportBtn);
    reportBtn.addEventListener('click',async()=>{
      const useDocx=confirm('Generate DOCX? Cancel for PDF');
      await runOperationWithStatus(operationStatusHost,{
        pendingText:`Generating technical report (${useDocx?'DOCX':'PDF'})…`,
        successText:'Technical report generated.',
        errorText:'Technical report generation failed',
        operation:()=>generateTechnicalReport(useDocx?'docx':'pdf')
      });
    });

    const exportReportsBtn=document.createElement('button');
    exportReportsBtn.id='export-reports-btn';
    exportReportsBtn.innerHTML='<img src="icons/toolbar/export.svg" alt="" aria-hidden="true" class="control-icon"><span>Export Reports</span>';
    settingsMenu.appendChild(exportReportsBtn);
    exportReportsBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Exporting report files…',
        successText:'Report export complete.',
        errorText:'Report export failed',
        operation:async()=>{
          const { downloadCSV } = await Promise.resolve().then(function () { return reporting; });
          const headers=['sample'];
          const rows=[{sample:'demo'}];
          downloadCSV(headers,rows,'reports.csv');
          const issues=runValidation(getOneLine().sheets,getStudies());
          const vHeaders=['component','message'];
          const vRows=issues.length?issues:[{component:'-',message:'No issues'}];
          downloadCSV(vHeaders,vRows,'validation-report.csv');
        }
      });
    });

    const printLabelsBtn=document.createElement('button');
    printLabelsBtn.id='print-labels-btn';
    printLabelsBtn.innerHTML='<img src="icons/annotation.svg" alt="" aria-hidden="true" class="control-icon"><span>Print Labels</span>';
    settingsMenu.appendChild(printLabelsBtn);
    printLabelsBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Preparing printable labels…',
        successText:'Labels ready for printing.',
        errorText:'Label preparation failed',
        operation:async()=>{
          const { generateArcFlashLabel } = await Promise.resolve().then(function () { return labels; });
          const svg=generateArcFlashLabel({equipment:'Demo',incidentEnergy:'--',boundary:'--'});
          const win=window.open('');
          if(win){
            win.document.write(svg);
            win.document.close();
            win.print();
          }
        }
      });
    });
  }
  const unitSelect=document.getElementById('unit-select');
  if(unitSelect){
    try{ unitSelect.value=getProjectState().settings?.units||'imperial'; }catch(e){ console.warn('Could not read unit setting:', e); }
    unitSelect.addEventListener('change',e=>{
      try{
        const proj=getProjectState();
        proj.settings=proj.settings||{};
        proj.settings.units=e.target.value;
        setProjectState(proj);
      }catch(e){ console.warn('Could not save unit setting:', e); }
      applyUnitLabels();
    });
  }
  applyUnitLabels();
  save(null,{flush:true,reason:'settings-init'});
}

function initDarkMode(){
  const elementCache=createElementCache(document);
  const settingsMenu=elementCache.getById('settings-menu');
  const darkToggle=elementCache.getById('dark-toggle');
  const domBatcher=createDomWriteBatcher();
  const prefersDarkQuery=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
  const prefersContrastQuery=window.matchMedia?window.matchMedia('(prefers-contrast: more)'):null;
  const profileHandler=createHandlerProfiler('initDarkMode');

  let themeSelect=elementCache.getById('theme-select');
  if(!themeSelect&&settingsMenu){
    const wrapper=document.createElement('label');
    wrapper.setAttribute('for','theme-select');
    wrapper.textContent='Theme';
    themeSelect=document.createElement('select');
    themeSelect.id='theme-select';
    themeSelect.innerHTML=`
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="high-contrast">High Contrast</option>
    `;
    wrapper.appendChild(themeSelect);
    const currentThemeSelect=document.getElementById('theme-select');
    if(!currentThemeSelect&&wrapper.parentNode!==settingsMenu){
      const currentFirstChild=settingsMenu.firstChild;
      if(currentFirstChild&&currentFirstChild.parentNode===settingsMenu){
        settingsMenu.insertBefore(wrapper,currentFirstChild);
      }else {
        settingsMenu.appendChild(wrapper);
      }
    }
  }

  const resolveTheme=theme=>{
    if(theme==='dark'||theme==='light'||theme==='high-contrast') return theme;
    if(prefersContrastQuery&&prefersContrastQuery.matches) return 'high-contrast';
    return prefersDarkQuery&&prefersDarkQuery.matches?'dark':'light';
  };

  const applyTheme=(themePreference,{syncControls=true}={})=>{
    const theme=resolveTheme(themePreference);
    domBatcher.write(()=>{
      document.body.classList.toggle('dark-mode',theme==='dark');
      document.body.classList.toggle('theme-light',theme==='light');
      document.body.classList.toggle('theme-high-contrast',theme==='high-contrast');
      document.body.dataset.theme=theme;
      document.documentElement.style.colorScheme=theme==='dark'?'dark':(theme==='high-contrast'?'only light':'light');
      if(syncControls){
        if(themeSelect) themeSelect.value=themePreference;
        if(darkToggle) darkToggle.checked=theme==='dark';
      }
    });
  };

  const syncFromStorage=()=>{
    const storedTheme=getThemePreference();
    applyTheme(storedTheme);
  };

  syncFromStorage();

  if(themeSelect){
    themeSelect.addEventListener('change',profileHandler('themeSelect.change',()=>{
      const nextTheme=themeSelect.value||'system';
      setThemePreference(nextTheme);
      applyTheme(nextTheme,{syncControls:false});
      if(typeof window.saveSession==='function') window.saveSession();
      if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
    }));
  }

  if(darkToggle){
    darkToggle.closest('label')?.classList.add('legacy-dark-toggle');
    darkToggle.addEventListener('change',profileHandler('darkToggle.change',()=>{
      const nextTheme=darkToggle.checked?'dark':'light';
      setThemePreference(nextTheme);
      applyTheme(nextTheme,{syncControls:false});
      if(themeSelect) themeSelect.value=nextTheme;
    }));
  }

  if(prefersDarkQuery){
    prefersDarkQuery.addEventListener('change',profileHandler('prefersDark.change',()=>{
      if(getThemePreference()==='system') applyTheme('system');
    }));
  }
  if(prefersContrastQuery){
    prefersContrastQuery.addEventListener('change',profileHandler('prefersContrast.change',()=>{
      if(getThemePreference()==='system') applyTheme('system');
    }));
  }
  onProjectChange(()=>syncFromStorage());
}

function initCompactMode(){
  const elementCache=createElementCache(document);
  const compactToggle=elementCache.getById('compact-toggle');
  const domBatcher=createDomWriteBatcher();
  const profileHandler=createHandlerProfiler('initCompactMode');
  let session=getSessionPreferences();
  if(session.compactMode===undefined){
    session=updateSessionPreferences(prev=>({...(prev&&typeof prev==='object'?prev:{}),compactMode:false}));
  }
  const applyState=value=>{
    domBatcher.write(()=>{
      document.body.classList.toggle('compact-mode',!!value);
      if(compactToggle) compactToggle.checked=!!value;
    });
  };
  applyState(session.compactMode);
  if(compactToggle){
    compactToggle.addEventListener('change',profileHandler('compactToggle.change',()=>{
      const value=!!compactToggle.checked;
      applyState(value);
      session=updateSessionPreferences(prev=>({...(prev&&typeof prev==='object'?prev:{}),compactMode:value}));
      if(typeof window.saveSession==='function') window.saveSession();
      if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
    }));
  }
  window.addEventListener('storage',profileHandler('window.storage',e=>{
    if(e.key==='ctrSession'){
      try{
        const data=e.newValue?JSON.parse(e.newValue):{};
        applyState(data&&data.compactMode);
        session=data||{};
      }catch(e){ console.warn('Could not parse ctrSession storage event:', e); }
    }
  }));
}

function initHelpModal(btnId='help-btn',modalId='help-modal',closeId){
  const btn=document.getElementById(btnId);
  const modal=document.getElementById(modalId);
  const closeBtn=closeId?document.getElementById(closeId):(modal?modal.querySelector('.close-btn'):null);
  if(btn&&modal&&closeBtn){
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-hidden','true');
    const content=modal.querySelector('.modal-content') || closeBtn.parentElement || modal;
    const defaults=Array.from(content.children);
    if(btnId==='help-btn'&&!content.querySelector('#help-reopen-onboarding-btn')){
      const onboardingBtn=document.createElement('button');
      onboardingBtn.type='button';
      onboardingBtn.id='help-reopen-onboarding-btn';
      onboardingBtn.innerHTML='<img src="icons/oneline.svg" alt="" aria-hidden="true" class="control-icon"><span>Reopen Onboarding</span>';
      content.appendChild(onboardingBtn);
      onboardingBtn.addEventListener('click',()=>{
        close();
        runOnboardingFlow({force:true,source:'help'}).catch(err=>console.error('Help onboarding reopen failed',err));
      });
    }
    let iframe=null;

    const handleKey=e=>{
      if(e.key==='Escape')close();
      else trapFocus(e,modal);
    };

    const open=()=>{
      modal.style.display='flex';
      modal.setAttribute('aria-hidden','false');
      btn.setAttribute('aria-expanded','true');
      document.addEventListener('keydown',handleKey);
      const focusables=modal.querySelectorAll(FOCUSABLE);
      if(focusables.length)focusables[0].focus();
    };
    const close=()=>{
      modal.style.display='none';
      modal.setAttribute('aria-hidden','true');
      btn.setAttribute('aria-expanded','false');
      document.removeEventListener('keydown',handleKey);
      btn.focus();
      if(iframe){iframe.style.display='none';iframe.src='';}
      defaults.forEach(el=>{if(el!==closeBtn)el.style.display='';});
    };
    globalThis.showHelpDoc=url=>{
      if(!iframe){
        iframe=document.createElement('iframe');
        iframe.id='help-iframe';
        iframe.style.width='var(--size-full)';
        iframe.style.height='var(--size-help-modal-height)';
        content.appendChild(iframe);
      }
      defaults.forEach(el=>{if(el!==closeBtn)el.style.display='none';});
      iframe.style.display='block';
      iframe.src=url;
      open();
    };
    btn.addEventListener('click',open);
    closeBtn.addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
  }
}

function initNavToggle(){
  const elementCache=createElementCache(document);
  const toggle=elementCache.query('.nav-toggle');
  if(!toggle) return;
  const target=elementCache.getById(toggle.getAttribute('aria-controls'));
  if(!target) return;
  const profileHandler=createHandlerProfiler('initNavToggle');

  function closeMenu(){
    toggle.setAttribute('aria-expanded','false');
    target.classList.remove('open');
  }

  toggle.addEventListener('click',profileHandler('toggle.click',()=>{
    const expanded=toggle.getAttribute('aria-expanded')==='true';
    toggle.setAttribute('aria-expanded',String(!expanded));
    target.classList.toggle('open',!expanded);
  }));

  document.addEventListener('keydown',profileHandler('document.keydown',e=>{
    if(e.key==='Escape') closeMenu();
  }));
}

  function checkPrereqs(prereqs=[]){
    // Previously this function displayed a banner when required data was missing.
    // The banner has been removed to declutter the interface, so this function now
    // intentionally performs no UI actions even if data is absent.
  }

function initTableNav(){
  const profileHandler=createHandlerProfiler('initTableNav',{logEvery:250});
  document.addEventListener('keydown',profileHandler('document.keydown',e=>{
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
    const target=e.target;
    if(!['INPUT','SELECT','TEXTAREA'].includes(target.tagName))return;
    const cell=target.closest('td');
    if(!cell||!cell.closest('table'))return;
    const row=cell.parentElement;
    const idx=cell.cellIndex;
    const targetRow=e.key==='ArrowUp'?row.previousElementSibling:row.nextElementSibling;
    if(!targetRow)return;
    const targetCell=targetRow.cells[idx];
    if(!targetCell)return;
    const focusable=targetCell.querySelector('input, select, textarea');
    if(!focusable)return;
    e.preventDefault();
    focusable.focus();
    if(typeof focusable.select==='function') focusable.select();
  }));
}

// ─── Keyboard Shortcuts Overlay (? key) ────────────────────────────────────
const SHORTCUT_GROUPS=[
  {
    heading:'Navigation',
    rows:[
      {keys:['Ctrl','K'],desc:'Open command palette'},
      {keys:['?'],desc:'Show this keyboard shortcuts overlay'},
      {keys:['Escape'],desc:'Close modal / cancel action'},
    ]
  },
  {
    heading:'Project',
    rows:[
      {keys:['Ctrl','S'],desc:'Save project to server'},
      {keys:['Ctrl','Z'],desc:'Undo last action (where supported)'},
      {keys:['Ctrl','Shift','Z'],desc:'Redo (where supported)'},
    ]
  },
  {
    heading:'Tables',
    rows:[
      {keys:['↑'],desc:'Move focus up one row in the same column'},
      {keys:['↓'],desc:'Move focus down one row in the same column'},
      {keys:['Tab'],desc:'Move to next cell / field'},
    ]
  },
  {
    heading:'Tour',
    rows:[
      {keys:['→',' '],desc:'Next tour step'},
      {keys:['←'],desc:'Previous tour step'},
    ]
  },
];

function initShortcutsOverlay(){
  if(typeof document==='undefined') return;
  // Build overlay DOM
  const overlay=document.createElement('div');
  overlay.className='shortcuts-overlay';
  overlay.id='shortcuts-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-labelledby','shortcuts-overlay-title');
  overlay.setAttribute('aria-hidden','true');

  const panel=document.createElement('div');
  panel.className='shortcuts-overlay-panel';

  const closeBtn=document.createElement('button');
  closeBtn.className='close-btn';
  closeBtn.setAttribute('aria-label','Close keyboard shortcuts');
  closeBtn.textContent='\u00D7';

  const title=document.createElement('h2');
  title.id='shortcuts-overlay-title';
  title.className='shortcuts-overlay-title';
  title.textContent='Keyboard Shortcuts';

  const table=document.createElement('table');
  table.className='shortcuts-table';
  const thead=document.createElement('thead');
  const headRow=document.createElement('tr');
  ['Key','Action'].forEach(h=>{const th=document.createElement('th');th.textContent=h;headRow.appendChild(th);});
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody=document.createElement('tbody');

  SHORTCUT_GROUPS.forEach(group=>{
    const groupRow=document.createElement('tr');
    const groupCell=document.createElement('td');
    groupCell.setAttribute('colspan','2');
    groupCell.style.cssText='font-weight:600;padding-top:0.75rem;color:var(--color-primary)';
    groupCell.textContent=group.heading;
    groupRow.appendChild(groupCell);
    tbody.appendChild(groupRow);

    group.rows.forEach(({keys,desc})=>{
      const tr=document.createElement('tr');
      const keyTd=document.createElement('td');
      keyTd.style.whiteSpace='nowrap';
      keys.forEach((k,i)=>{
        if(i>0){const plus=document.createElement('span');plus.textContent=' + ';keyTd.appendChild(plus);}
        const kbd=document.createElement('kbd');kbd.textContent=k;keyTd.appendChild(kbd);
      });
      const descTd=document.createElement('td');
      descTd.textContent=desc;
      tr.appendChild(keyTd);
      tr.appendChild(descTd);
      tbody.appendChild(tr);
    });
  });

  table.appendChild(tbody);

  const hint=document.createElement('p');
  hint.className='shortcuts-overlay-hint';
  hint.textContent='Press ? or Escape to dismiss';

  panel.appendChild(closeBtn);
  panel.appendChild(title);
  panel.appendChild(table);
  panel.appendChild(hint);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function open(){
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden','false');
    closeBtn.focus();
  }
  function close(){
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden','true');
  }

  closeBtn.addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  document.addEventListener('keydown',e=>{
    const active=document.activeElement;
    const inInput=['INPUT','SELECT','TEXTAREA'].includes(active?.tagName);
    if(e.key==='?' && !inInput && !e.ctrlKey && !e.metaKey){
      e.preventDefault();
      overlay.classList.contains('is-open')?close():open();
    }
    if(e.key==='Escape'&&overlay.classList.contains('is-open')) close();
  });
}

globalThis.document?.addEventListener('DOMContentLoaded',initShortcutsOverlay);

// ─── Rich Empty States for Data Tables ─────────────────────────────────────
const TABLE_EMPTY_CONFIGS={
  'equipment-table':{icon:'🗂️',title:'No equipment yet',body:'Add a row to start building your equipment list, or import from XLSX or CSV.',actionId:'add-row-btn',actionLabel:'Add Row'},
  'cable-table':{icon:'🔌',title:'No cables yet',body:'Add your first cable entry, load sample data, or import from Excel to begin.',actionId:'load-sample-cables-btn',actionLabel:'Load Sample Data'},
  'load-table':{icon:'⚡',title:'No load items yet',body:'Add a row to define load items for this project.',actionId:'add-load-btn',actionLabel:'Add Row'},
  'raceway-table':{icon:'🛤️',title:'No raceways yet',body:'Add trays, conduits, or ductbanks to build the raceway schedule.',actionId:'add-tray-btn',actionLabel:'Add Tray'},
  'panel-table':{icon:'🔲',title:'No panels yet',body:'Add a panel to begin building the panel schedule.',actionId:'add-panel-btn',actionLabel:'Add Panel'},
};

function initTableEmptyStates(){
  if(typeof document==='undefined') return;

  function makeEmptyState(config,addRowBtn){
    const div=document.createElement('div');
    div.className='table-empty-state';
    div.setAttribute('aria-live','polite');

    const icon=document.createElement('span');
    icon.className='table-empty-state-icon';
    icon.setAttribute('aria-hidden','true');
    icon.textContent=config.icon||'📋';

    const ttl=document.createElement('p');
    ttl.className='table-empty-state-title';
    ttl.textContent=config.title||'No data yet';

    const body=document.createElement('p');
    body.className='table-empty-state-body';
    body.textContent=config.body||'Add a row to get started.';

    div.appendChild(icon);
    div.appendChild(ttl);
    div.appendChild(body);

    // Mirror the existing add-row button as a CTA if found
    if(addRowBtn){
      const cta=document.createElement('button');
      cta.className='btn primary-btn table-empty-state-action';
      cta.textContent=config.actionLabel||'Add Row';
      cta.addEventListener('click',()=>addRowBtn.click());
      div.appendChild(cta);
    }
    return div;
  }

  Object.entries(TABLE_EMPTY_CONFIGS).forEach(([tableId,config])=>{
    const table=document.getElementById(tableId);
    if(!table) return;
    const tbody=table.querySelector('tbody');
    if(!tbody) return;

    const actionBtn=config.actionId?document.getElementById(config.actionId):null;
    const emptyState=makeEmptyState(config,actionBtn);

    // Insert after the table's closest scrollable wrapper or the table itself
    const wrapper=table.closest('.overflow-x-auto')||table.closest('.table-scroll-x')||table;
    wrapper.insertAdjacentElement('afterend',emptyState);

    function syncVisibility(){
      const hasRows=tbody.rows.length>0;
      emptyState.classList.toggle('is-visible',!hasRows);
      table.style.display=hasRows?'':'none';
    }

    syncVisibility();
    const mo=new MutationObserver(syncVisibility);
    mo.observe(tbody,{childList:true});
  });
}

globalThis.document?.addEventListener('DOMContentLoaded',initTableEmptyStates);

// ─── Workflow Step Navigator ────────────────────────────────────────────────
const WORKFLOW_STEPS=[
  {href:'cableschedule.html',label:'Cable Schedule',short:'1. Cables'},
  {href:'racewayschedule.html',label:'Raceway Schedule',short:'2. Raceways'},
  {href:'ductbankroute.html',label:'Ductbank',short:'3. Ductbank'},
  {href:'cabletrayfill.html',label:'Tray Fill',short:'4. Tray Fill'},
  {href:'conduitfill.html',label:'Conduit Fill',short:'5. Conduit Fill'},
  {href:'optimalRoute.html',label:'Optimal Cable Route',short:'6. Routing'},
  {href:'oneline.html',label:'One-Line Diagram',short:'7. One-Line'},
];

function initWorkflowStepNav(){
  if(typeof document==='undefined') return;
  const page=window.location.pathname.split('/').pop()||'index.html';
  const idx=WORKFLOW_STEPS.findIndex(s=>s.href===page);
  if(idx<0) return; // Not a workflow page

  const step=WORKFLOW_STEPS[idx];
  const prev=WORKFLOW_STEPS[idx-1]||null;
  const next=WORKFLOW_STEPS[idx+1]||null;

  const nav=document.createElement('nav');
  nav.className='workflow-step-nav';
  nav.setAttribute('aria-label','Workflow step navigation');

  const label=document.createElement('span');
  label.className='workflow-step-nav-label';
  label.textContent=`Step ${idx+1} of ${WORKFLOW_STEPS.length}: ${step.label}`;

  const links=document.createElement('div');
  links.className='workflow-step-nav-links';

  function makeLink(target,text){
    const a=document.createElement('a');
    a.href=target.href;
    a.className='workflow-step-nav-link';
    a.textContent=text;
    return a;
  }

  if(prev) links.appendChild(makeLink(prev,`\u2190 ${prev.short}`));

  const home=document.createElement('a');
  home.href='index.html';
  home.className='workflow-step-nav-link';
  home.textContent='Home';
  links.appendChild(home);

  if(next) links.appendChild(makeLink(next,`${next.short} \u2192`));

  nav.appendChild(label);
  nav.appendChild(links);

  // Insert before the first <section> inside main, or at the top of main
  const main=document.getElementById('main-content');
  if(!main) return;
  const firstSection=main.querySelector(':scope > section, :scope > header');
  if(firstSection){
    main.insertBefore(nav,firstSection);
  }else {
    main.prepend(nav);
  }
}

globalThis.document?.addEventListener('DOMContentLoaded',initWorkflowStepNav);

function persistConduits(data){
  try{
    setConduitCache(data);
  }catch(e){console.error('Failed to persist conduits',e);}
}

function loadConduits(){
  try{
    const cached=getConduitCache();
    if(cached){
      return {
        ductbanks:Array.isArray(cached.ductbanks)?cached.ductbanks:[],
        conduits:Array.isArray(cached.conduits)?cached.conduits:[]
      };
    }
  }catch(e){ console.warn('loadConduits: cache read failed', e); }
  let ductbanks=[];let conduits=[];
  try{ductbanks=getDuctbanks();}catch(e){ console.warn('loadConduits: getDuctbanks failed', e); }
  try{conduits=getConduits();}catch(e){ console.warn('loadConduits: getConduits failed', e); }
  const flattened=[];
  ductbanks=ductbanks.map(db=>{
    (db.conduits||[]).forEach(c=>{
      flattened.push({
        ductbankTag:db.tag,
        conduit_id:c.conduit_id,
        tray_id:`${db.tag}-${c.conduit_id}`,
        type:c.type,
        trade_size:c.trade_size,
        start_x:c.start_x,start_y:c.start_y,start_z:c.start_z,
        end_x:c.end_x,end_y:c.end_y,end_z:c.end_z,
        allowed_cable_group:c.allowed_cable_group
      });
    });
    const {conduits:_,...rest}=db;
    return rest;
  });
 return {ductbanks,conduits:[...flattened,...conduits]};
}

 globalThis.document?.addEventListener('DOMContentLoaded',initTableNav);

function initTableScrollIndicators(){
  if(typeof document==='undefined') return;
  const update=(el)=>{
    el.classList.toggle('has-overflow', el.scrollWidth > el.clientWidth + 4);
  };
  const els=document.querySelectorAll('.table-scroll-x');
  if(!els.length) return;
  const ro=typeof ResizeObserver!=='undefined'
    ? new ResizeObserver(entries=>entries.forEach(e=>update(e.target)))
    : null;
  els.forEach(el=>{
    update(el);
    el.addEventListener('scroll',()=>update(el),{passive:true});
    ro?.observe(el);
  });
}
globalThis.document?.addEventListener('DOMContentLoaded',initTableScrollIndicators);
globalThis.document?.addEventListener('DOMContentLoaded',applyPageVisualIdentity);

function downloadProjectAsBlob(precomputedJson){
  try{
    const json=typeof precomputedJson==='string'?precomputedJson:JSON.stringify(exportProject(),null,2);
    const blob=new Blob([json],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='project.ctr.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),0);
  }catch(err){console.error('Export fallback failed',err);}
}

let fileWriteLock=Promise.resolve();
async function withFileWriteLock(fn){
  let release;
  const next=new Promise(resolve=>{release=resolve;});
  const previous=fileWriteLock;
  fileWriteLock=next;
  await previous.catch(()=>{});
  try{
    return await fn();
  }finally{
    release();
  }
}

async function writeProjectToHandle(handle){
  return withFileWriteLock(async()=>{
    if(!handle){
      downloadProjectAsBlob();
      return false;
    }
    let writable;
    let json;
    try{
      const data=exportProject();
      json=JSON.stringify(data,null,2);
      writable=await handle.createWritable();
      const shouldCompress=typeof handle.name==='string'&&handle.name.endsWith('.gz');
      const payload=shouldCompress?await compressString(json):json;
      await writable.write(payload);
      await writable.close();
      return true;
    }catch(err){
      console.error('File System Access export failed',err);
      if(writable){
        try{
          if(typeof writable.abort==='function') await writable.abort();
          else await writable.close();
        }catch(closeErr){console.error('Writable cleanup failed',closeErr);}
      }
      downloadProjectAsBlob(json);
      return false;
    }
  });
}

function updateSaveButtonState(){
  if(typeof document==='undefined') return;
  const btn=document.getElementById('save-project-btn');
  if(!btn) return;
  btn.disabled=false;
  if(cachedProjectFileHandle){
    btn.removeAttribute('title');
  }else if(typeof globalThis.showSaveFilePicker==='function'){
    btn.title='Choose a save location to enable autosave and quick saves.';
  }else {
    btn.title='Saving downloads a JSON backup because direct file access is unavailable.';
  }
}

function defaultManualSaveWarn(){
  console.warn('Select a save location with Save Project to enable autosave.');
}

async function defaultRequestProjectFileHandle(){
  if(typeof globalThis.showSaveFilePicker!=='function'){
    downloadProjectAsBlob();
    return {handle:null,cancelled:false};
  }
  try{
    const handle=await globalThis.showSaveFilePicker({
      suggestedName:'project.ctr.json',
      types:[{
        description:'CableTrayRoute Project',
        accept:{'application/json':['.ctr.json','.json']}
      }]
    });
    if(!handle) return {handle:null,cancelled:true};
    return {handle,cancelled:false};
  }catch(err){
    if(err?.name==='AbortError') return {handle:null,cancelled:true};
    console.error('showSaveFilePicker failed',err);
    downloadProjectAsBlob();
    return {handle:null,cancelled:false};
  }
}

async function ensureHandlePermission(handle){
  if(!handle||typeof handle.queryPermission!=='function') return true;
  try{
    let permission=await handle.queryPermission({mode:'readwrite'});
    if(permission==='granted') return true;
    if(typeof handle.requestPermission==='function'){
      permission=await handle.requestPermission({mode:'readwrite'});
      return permission==='granted';
    }
  }catch(err){console.warn('File permission request failed',err);}
  return false;
}

function createAutoSaveScheduler({
  getHandle,
  writer=writeProjectToHandle,
  markClean=()=>getDirtyTracker()?.markClean?.(),
  setFlag=setAutoSaveFlag,
  warn=()=>{},
  intervalMs=AUTO_SAVE_INTERVAL_MS,
  schedule=(fn,delay)=>setInterval(fn,delay),
  cancel=id=>clearInterval(id)
}={}){
  let timerId=null;
  async function run(){
    const handle=typeof getHandle==='function'?getHandle():undefined;
    if(!handle){
      setFlag?.(false);
      warn?.();
      return false;
    }
    setFlag?.(true);
    let saved=false;
    try{
      saved=await writer(handle);
      if(saved) markClean?.();
    }catch(err){
      console.error('Autosave execution failed',err);
    }finally{
      setFlag?.(false);
    }
    return saved;
  }
  function start(){
    if(timerId!==null) return;
    timerId=schedule(run,intervalMs);
  }
  function stop(){
    if(timerId===null) return;
    cancel(timerId);
    timerId=null;
  }
  return {start,stop,run};
}

function ensureAutoSaveScheduler(){
  if(autoSaveSchedulerInstance) return autoSaveSchedulerInstance;
  autoSaveSchedulerInstance=createAutoSaveScheduler({
    getHandle:()=>cachedProjectFileHandle,
    writer:handle=>writeProjectToHandle(handle),
    markClean:()=>{getDirtyTracker()?.markClean?.(); recordSave();},
    setFlag:setAutoSaveFlag,
    warn:()=>{updateSaveButtonState(); console.warn('Autosave skipped: choose Save Project to select a file for updates.');}
  });
  if(typeof window!=='undefined'){
    window.__CTR_autoSaveScheduler=autoSaveSchedulerInstance;
  }
  return autoSaveSchedulerInstance;
}

async function manualSaveProject({
  requestHandle=defaultRequestProjectFileHandle,
  writer=writeProjectToHandle,
  ensurePermission=ensureHandlePermission,
  markClean=()=>getDirtyTracker()?.markClean?.(),
  notifyNoHandle=defaultManualSaveWarn
}={}){
  updateSaveButtonState();
  let handle=cachedProjectFileHandle;
  if(!handle){
    let requestResult=null;
    try{requestResult=await requestHandle();}catch(err){console.error('Manual save handle request failed',err);}
    if(requestResult&&typeof requestResult==='object'&&('handle'in requestResult||'cancelled'in requestResult)){
      const cancelled=Boolean(requestResult.cancelled);
      handle=requestResult.handle??null;
      if(!handle){
        if(cancelled) return false;
        notifyNoHandle?.();
        return null;
      }
    }else {
      handle=requestResult??null;
      if(!handle){
        notifyNoHandle?.();
        return null;
      }
    }
    cachedProjectFileHandle=handle;
    updateSaveButtonState();
  }
  let permitted=false;
  try{permitted=await ensurePermission(handle);}catch(err){console.error('Manual save permission check failed',err);}
  if(!permitted){
    cachedProjectFileHandle=null;
    updateSaveButtonState();
    notifyNoHandle?.();
    return false;
  }
  let saved=false;
  try{saved=await writer(handle);}catch(err){console.error('Manual save write failed',err);}
  if(saved){
    markClean?.();
    recordSave();
    return true;
  }
  return null;
}

if(typeof window!=='undefined'){
  window.manualSaveProject=manualSaveProject;
}

function initProjectIO(){
  const operationStatusHost=initOperationStatusHost(document.getElementById('settings-menu'));
  runOperationWithStatus(operationStatusHost,{
    pendingText:'Loading project from URL…',
    successText:'Project URL sync complete.',
    errorText:'Project URL sync failed',
    operation:async()=>{
      await loadProjectFromHash();
      applyProjectHash();
    }
  }).catch(()=>{});
  updateSaveButtonState();
  const exportBtn=document.getElementById('export-project-btn');
  const importBtn=document.getElementById('import-project-btn');
  const fileInput=document.getElementById('import-project-input');
  console.assert(importBtn&&fileInput,'Project import controls missing');
  if(exportBtn){
    exportBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Exporting project file…',
        successText:'Project export complete.',
        errorText:'Project export failed',
        operation:async()=>{
          if(typeof globalThis.showSaveFilePicker==='function'){
            try{
              const handle=await globalThis.showSaveFilePicker({
                suggestedName:'project.ctr.json',
                types:[{
                  description:'CableTrayRoute Project',
                  accept:{'application/json':['.ctr.json','.json']}
                }]
              });
              if(!handle) return;
              cachedProjectFileHandle=handle;
              updateSaveButtonState();
              await writeProjectToHandle(handle);
            }catch(err){
              if(err?.name==='AbortError') return;
              console.error('showSaveFilePicker failed',err);
              downloadProjectAsBlob();
            }
          }else {
            downloadProjectAsBlob();
          }
        }
      }).catch(()=>{});
    });
  }
  if(importBtn&&fileInput){
    importBtn.addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',e=>{
      const file=e.target.files[0];
      if(!file) return;
      runOperationWithStatus(operationStatusHost,{
        pendingText:'Importing project file…',
        successText:'Project import complete. Reloading…',
        errorText:'Project import failed',
        operation:()=>new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=ev=>{
            try{
              const obj=JSON.parse(ev.target.result);
              if(importProject(obj)){
                resolve(true);
                location.reload();
                return;
              }
              reject(new Error('Import canceled or invalid project data.'));
            }catch(err){
              reject(err);
            }
          };
          reader.onerror=()=>reject(reader.error||new Error('Unable to read import file.'));
          reader.readAsText(file);
        })
      }).catch(err=>{
        if(err?.message==='Import canceled or invalid project data.') return;
        console.error('Import failed',err);
      }).finally(()=>{
        fileInput.value='';
      });
    });
  }
  ensureAutoSaveScheduler().start();
}

globalThis.addEventListener?.('DOMContentLoaded',initProjectIO);
globalThis.addEventListener?.('DOMContentLoaded',()=>{
  runOnboardingFlow({source:'auto'}).catch(err=>console.error('Onboarding startup failed',err));
});

function applyUnitLabels(){
  const sys=globalThis.units?.getUnitSystem()?globalThis.units.getUnitSystem():'imperial';
  const d=sys==='imperial'?'ft':'m';
  const c=sys==='imperial'?'in':'mm';
  const domBatcher=createDomWriteBatcher();
  const distanceNodes=document.querySelectorAll('[data-unit="distance"]');
  const conduitNodes=document.querySelectorAll('[data-unit="conduit"]');
  domBatcher.write(()=>{
    distanceNodes.forEach(el=>el.textContent=d);
    conduitNodes.forEach(el=>el.textContent=c);
  });
}

function showSelfCheckModal(data){
  const modal=document.createElement('div');
  modal.className='modal';
  modal.id='self-check-modal';
  const content=document.createElement('div');
  content.className='modal-content';
  const close=document.createElement('button');
  close.className='close-btn';
  close.textContent='\u00D7';
  close.addEventListener('click',()=>modal.remove());
  const title=document.createElement('h2');
  title.textContent=data.pass?'Self-Check PASSED':'Self-Check FAILED';
  const pre=document.createElement('pre');
  const json=JSON.stringify(data,null,2);
  pre.textContent=json;
  const actions=document.createElement('div');
  actions.className='modal-actions';
  const copyBtn=document.createElement('button');
  copyBtn.textContent='Copy Diagnostics';
  copyBtn.addEventListener('click',()=>navigator.clipboard.writeText(json));
  actions.appendChild(copyBtn);
  content.appendChild(close);
  content.appendChild(title);
  content.appendChild(pre);
  content.appendChild(actions);
  modal.appendChild(content);
  document.body.appendChild(modal);
  modal.style.display='flex';
}

// ─── Global Undo/Redo ───────────────────────────────────────────────────────
const _undoManager = new UndoRedoManager({
  maxSize: 50,
  onUndo: (label) => {
    if (typeof showOperationToast === 'function') {
      showOperationToast(label ? `Undone: ${label}` : 'Undone', 'success');
    }
  },
  onRedo: (label) => {
    if (typeof showOperationToast === 'function') {
      showOperationToast(label ? `Redone: ${label}` : 'Redone', 'success');
    }
  }
});

globalThis.__undoManager = _undoManager;

globalThis.document?.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  const active = document.activeElement;
  // Don't intercept inside contenteditable or text inputs where browser undo should apply
  if (active && (active.isContentEditable || active.tagName === 'TEXTAREA')) return;
  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    _undoManager.undo();
  } else if (e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    _undoManager.redo();
  } else if (e.key === 'y') {
    e.preventDefault();
    _undoManager.redo();
  }
});

globalThis.initSettings=initSettings;
globalThis.initDarkMode=initDarkMode;
globalThis.initCompactMode=initCompactMode;
globalThis.initHelpModal=initHelpModal;
globalThis.initNavToggle=initNavToggle;
globalThis.checkPrereqs=checkPrereqs;
globalThis.persistConduits=persistConduits;
globalThis.loadConduits=loadConduits;
globalThis.applyUnitLabels=applyUnitLabels;
globalThis.applyProjectHash=applyProjectHash;
globalThis.showSelfCheckModal=showSelfCheckModal;

// ----- Real-time collaboration -----
(function initCollabOnLoad() {
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    function startCollab() {
      const auth = getAuthContextState ? getAuthContextState() : null;
      if (!auth) return; // only start when logged in
      const projectId = (window.currentProjectId || 'default').trim();
      initCollaboration({ projectId, username: auth.user });
    }
    startCollab();
    // Re-init when project changes (project manager fires storage events)
    window.addEventListener('storage', (e) => {
      if (e.key === 'currentProjectId' || e.key === 'authToken') {
        stopCollaboration();
        startCollab();
      }
    });
    // Apply incoming remote patches to local state
    document.addEventListener('ctr:remote-patch', (ev) => {
      const patch = ev.detail && ev.detail.patch;
      if (!patch || typeof patch !== 'object') return;
      const projectId = (window.currentProjectId || 'default').trim();
      applyRemoteSnapshot(patch, projectId);
    });
    // Clean up on page unload
    window.addEventListener('beforeunload', () => stopCollaboration());
  });
}());

// ----- Scroll-to-top button -----
(function initScrollTopBtn() {
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.createElement('button');
    btn.className = 'scroll-top-btn';
    btn.setAttribute('aria-label', 'Scroll to top');
    btn.setAttribute('title', 'Scroll to top');
    btn.innerHTML = '&#8679;'; // ↑ upward arrow
    document.body.appendChild(btn);

    const SHOW_AFTER_PX = 300;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        btn.classList.toggle('visible', window.scrollY > SHOW_AFTER_PX);
        ticking = false;
      });
    }, { passive: true });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}());

// ----- AI Copilot -----
(function initCopilot() {
  if (typeof document === 'undefined') return;
  // Inject copilot stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'src/styles/copilot.css';
  document.head.appendChild(link);
  document.addEventListener('DOMContentLoaded', () => {
    mountCopilot();
  });
}());

const WALL_TYPES = ['Concrete', 'CMU', 'Gypsum', 'Fire Rated', 'Removable Panel'];
const VOLTAGE_OPTIONS = ['120V', '208V', '480V', '600V', '4.16kV', '13.8kV', '15kV'];
const DEFAULT_SCALE = 20;

const state = {
  room: {
    width: 30,
    depth: 20,
    walls: { north: 'Concrete', south: 'Concrete', east: 'CMU', west: 'CMU' },
    interiorWalls: []
  },
  equipment: [],
  scale: DEFAULT_SCALE,
  selectedEquipmentId: null,
  drag: null,
  wallDraw: {
    enabled: false,
    snapStep: 0.5,
    start: null,
    current: null
  },
  violations: new Set()
};

let canvas;
let summaryEl;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseNumber(input, fallback) {
  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? value : fallback;
}

function snapToStep(value, step = 0.5) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

function clearanceDepthFt(voltageText) {
  const normalized = String(voltageText || '').toLowerCase();
  const kvMatch = normalized.match(/([\d.]+)\s*k\s*v/);
  let volts = Number.parseFloat(normalized);
  if (kvMatch) {
    volts = Number.parseFloat(kvMatch[1]) * 1000;
  }
  if (!Number.isFinite(volts) || volts <= 150) return 3;
  if (volts <= 600) return 3.5;
  return 4;
}

function equipmentRect(eq) {
  return { x: eq.x, y: eq.y, w: eq.width, h: eq.depth };
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function insideRoom(rect) {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= state.room.width && rect.y + rect.h <= state.room.depth;
}

function workspaceRect(eq) {
  const depth = clearanceDepthFt(eq.voltage);
  const pad = 0.15;
  switch (eq.facing) {
    case 'north':
      return { x: eq.x - pad, y: eq.y - depth, w: eq.width + pad * 2, h: depth };
    case 'south':
      return { x: eq.x - pad, y: eq.y + eq.depth, w: eq.width + pad * 2, h: depth };
    case 'east':
      return { x: eq.x + eq.width, y: eq.y - pad, w: depth, h: eq.depth + pad * 2 };
    case 'west':
      return { x: eq.x - depth, y: eq.y - pad, w: depth, h: eq.depth + pad * 2 };
    default:
      return { x: eq.x - pad, y: eq.y + eq.depth, w: eq.width + pad * 2, h: depth };
  }
}

function interiorWallRect(wall) {
  if (wall.orientation === 'vertical') {
    return { x: wall.x - 0.1, y: wall.y, w: 0.2, h: wall.length };
  }
  return { x: wall.x, y: wall.y - 0.1, w: wall.length, h: 0.2 };
}

function accessViolation(eq, workspace) {
  const left = workspace.x;
  const right = state.room.width - (workspace.x + workspace.w);
  const top = workspace.y;
  const bottom = state.room.depth - (workspace.y + workspace.h);
  const perimeterAccess = left >= 3 || right >= 3 || top >= 3 || bottom >= 3;
  if (!perimeterAccess) return true;

  const hasNearbyBlocker = state.equipment.some(other => {
    if (other.id === eq.id) return false;
    const otherRect = equipmentRect(other);
    const near = {
      x: workspace.x - 1,
      y: workspace.y - 1,
      w: workspace.w + 2,
      h: workspace.h + 2
    };
    return intersects(otherRect, near) && !intersects(otherRect, workspace);
  });

  if (hasNearbyBlocker) return true;
  return false;
}

function evaluateViolations() {
  const violations = new Set();

  state.equipment.forEach(eq => {
    const eqRect = equipmentRect(eq);
    const workspace = workspaceRect(eq);

    if (!insideRoom(eqRect) || !insideRoom(workspace)) {
      violations.add(eq.id);
      return;
    }

    const overlapsEquipment = state.equipment.some(other => {
      if (other.id === eq.id) return false;
      return intersects(eqRect, equipmentRect(other)) || intersects(workspace, equipmentRect(other));
    });

    const overlapsInterior = state.room.interiorWalls.some(wall => {
      const wallRect = interiorWallRect(wall);
      return intersects(eqRect, wallRect) || intersects(workspace, wallRect);
    });

    if (overlapsEquipment || overlapsInterior || accessViolation(eq, workspace)) {
      violations.add(eq.id);
    }
  });

  state.violations = violations;
}

function populateSelect(selectId, values) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '';
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function populateEquipmentPreset() {
  const select = document.getElementById('equipment-preset');
  if (!select) return;
  const equipment = getEquipment();
  const options = equipment.length
    ? equipment.map((item, idx) => ({
        value: String(idx),
        label: `${item.tag || `Equipment-${idx + 1}`} · ${item.description || 'No description'}`,
        item
      }))
    : [{ value: '-1', label: 'No equipment in Equipment List', item: null }];

  select.innerHTML = '';
  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });

  if (options[0]?.item) {
    const widthInput = document.getElementById('equipment-width');
    const depthInput = document.getElementById('equipment-depth');
    widthInput.value = parseNumber(options[0].item.width, 4);
    depthInput.value = parseNumber(options[0].item.depth, 2);
  }
}

function renderInteriorWallList() {
  const list = document.getElementById('interior-wall-list');
  if (!list) return;
  list.innerHTML = '';
  if (!state.room.interiorWalls.length) {
    list.textContent = 'No interior walls added.';
    return;
  }
  state.room.interiorWalls.forEach((wall, index) => {
    const row = document.createElement('div');
    row.className = 'equipment-mini-list-row';
    row.innerHTML = `<span>${wall.orientation} wall · ${wall.type} · (${wall.x.toFixed(1)}, ${wall.y.toFixed(1)}) · ${wall.length.toFixed(1)} ft</span>`;
    const remove = document.createElement('button');
    remove.className = 'btn';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      state.room.interiorWalls.splice(index, 1);
      render();
    });
    row.appendChild(remove);
    list.appendChild(row);
  });
}

function drawRect(rect, className, fillOpacity = 1) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  element.setAttribute('x', String(rect.x * state.scale));
  element.setAttribute('y', String(rect.y * state.scale));
  element.setAttribute('width', String(rect.w * state.scale));
  element.setAttribute('height', String(rect.h * state.scale));
  element.setAttribute('class', className);
  if (fillOpacity !== 1) {
    element.setAttribute('fill-opacity', String(fillOpacity));
  }
  canvas.appendChild(element);
  return element;
}

function drawText(text, xFt, yFt, className = 'equipment-room-text') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  element.setAttribute('x', String(xFt * state.scale));
  element.setAttribute('y', String(yFt * state.scale));
  element.setAttribute('class', className);
  element.textContent = text;
  canvas.appendChild(element);
}

function renderRoom() {
  const roomRect = drawRect({ x: 0, y: 0, w: state.room.width, h: state.room.depth }, 'equipment-room-outer');
  roomRect.setAttribute('rx', '4');
  roomRect.setAttribute('ry', '4');

  [['north', 0, 0], ['south', 0, state.room.depth], ['west', 0, 0], ['east', state.room.width, 0]].forEach(([direction, x, y]) => {
    drawText(`${direction.toUpperCase()} · ${state.room.walls[direction]}`, x + 0.3, y + (direction === 'south' ? -0.3 : 0.8), 'equipment-wall-label');
  });

  state.room.interiorWalls.forEach(wall => {
    const rect = interiorWallRect(wall);
    const element = drawRect(rect, 'equipment-interior-wall');
    element.setAttribute('data-wall-type', wall.type);
  });

  if (state.wallDraw.enabled && state.wallDraw.start && state.wallDraw.current) {
    const orientation = document.getElementById('interior-orientation')?.value || 'vertical';
    const previewRect = wallPreviewRect(state.wallDraw.start, state.wallDraw.current, orientation);
    if (previewRect) {
      drawRect(previewRect, 'equipment-interior-wall', 0.55);
    }
  }
}

function wallPreviewRect(start, end, orientation) {
  const snappedStartX = snapToStep(start.x, state.wallDraw.snapStep);
  const snappedStartY = snapToStep(start.y, state.wallDraw.snapStep);
  const snappedEndX = snapToStep(end.x, state.wallDraw.snapStep);
  const snappedEndY = snapToStep(end.y, state.wallDraw.snapStep);
  if (orientation === 'vertical') {
    const y = clamp(Math.min(snappedStartY, snappedEndY), 0, state.room.depth);
    const length = Math.max(1, Math.abs(snappedEndY - snappedStartY));
    const safeLength = Math.min(length, Math.max(1, state.room.depth - y));
    const x = clamp(snappedStartX, 0, state.room.width);
    return interiorWallRect({ orientation: 'vertical', x, y, length: safeLength });
  }
  const x = clamp(Math.min(snappedStartX, snappedEndX), 0, state.room.width);
  const length = Math.max(1, Math.abs(snappedEndX - snappedStartX));
  const safeLength = Math.min(length, Math.max(1, state.room.width - x));
  const y = clamp(snappedStartY, 0, state.room.depth);
  return interiorWallRect({ orientation: 'horizontal', x, y, length: safeLength });
}

function addInteriorWallFromDrag(start, end) {
  const orientation = document.getElementById('interior-orientation').value;
  const type = document.getElementById('interior-type').value;
  const snappedStartX = snapToStep(start.x, state.wallDraw.snapStep);
  const snappedStartY = snapToStep(start.y, state.wallDraw.snapStep);
  const snappedEndX = snapToStep(end.x, state.wallDraw.snapStep);
  const snappedEndY = snapToStep(end.y, state.wallDraw.snapStep);

  let x;
  let y;
  let length;
  if (orientation === 'vertical') {
    x = clamp(snappedStartX, 0, state.room.width);
    y = clamp(Math.min(snappedStartY, snappedEndY), 0, state.room.depth);
    length = Math.max(1, Math.abs(snappedEndY - snappedStartY));
    length = Math.min(length, Math.max(1, state.room.depth - y));
  } else {
    x = clamp(Math.min(snappedStartX, snappedEndX), 0, state.room.width);
    y = clamp(snappedStartY, 0, state.room.depth);
    length = Math.max(1, Math.abs(snappedEndX - snappedStartX));
    length = Math.min(length, Math.max(1, state.room.width - x));
  }

  state.room.interiorWalls.push({ orientation, type, x, y, length });
}

function renderEquipment() {
  state.equipment.forEach(eq => {
    const eqRect = equipmentRect(eq);
    const workspace = workspaceRect(eq);
    const hasViolation = state.violations.has(eq.id);
    drawRect(workspace, hasViolation ? 'equipment-clearance equipment-clearance-danger' : 'equipment-clearance', 0.35);

    const block = drawRect(eqRect, hasViolation ? 'equipment-block equipment-block-danger' : 'equipment-block');
    block.dataset.id = eq.id;
    if (state.selectedEquipmentId === eq.id) {
      block.classList.add('selected');
    }

    const textX = eq.x + 0.2;
    const textY = eq.y + 0.7;
    drawText(`${eq.name} (${eq.voltage})`, textX, textY, 'equipment-block-label');
    drawText(`${eq.width.toFixed(1)}×${eq.depth.toFixed(1)} ft · facing ${eq.facing}`, textX, textY + 0.6, 'equipment-block-meta');
  });
}

function updateSummary() {
  const total = state.equipment.length;
  const violations = state.violations.size;
  if (!summaryEl) return;
  summaryEl.textContent = violations
    ? `${violations} of ${total} equipment item${total === 1 ? '' : 's'} has NEC working-space/access violations.`
    : total
      ? `No NEC workspace violations detected for ${total} equipment item${total === 1 ? '' : 's'}.`
      : 'Add equipment to start layout checks.';
}

function render() {
  evaluateViolations();
  renderInteriorWallList();

  canvas.innerHTML = '';
  const widthPx = state.room.width * state.scale;
  const heightPx = state.room.depth * state.scale;
  canvas.setAttribute('viewBox', `0 0 ${Math.max(widthPx + 40, 400)} ${Math.max(heightPx + 40, 300)}`);

  const padGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  padGroup.setAttribute('transform', 'translate(20,20)');
  canvas.appendChild(padGroup);

  const previousCanvas = canvas;
  canvas = padGroup;
  renderRoom();
  renderEquipment();
  canvas = previousCanvas;

  const zoomLabel = document.getElementById('zoom-label');
  if (zoomLabel) zoomLabel.textContent = `Scale: ${state.scale} px/ft`;
  updateSummary();
}

function addEquipment() {
  const source = document.getElementById('equipment-source').value;
  const presetSelect = document.getElementById('equipment-preset');
  const customName = document.getElementById('custom-name').value.trim();
  const width = clamp(parseNumber(document.getElementById('equipment-width').value, 4), 1, 30);
  const depth = clamp(parseNumber(document.getElementById('equipment-depth').value, 2), 1, 30);
  const voltage = document.getElementById('equipment-voltage').value;
  const facing = document.getElementById('equipment-facing').value;

  let name = 'Equipment';
  if (source === 'equipment-list') {
    const index = Number.parseInt(presetSelect.value, 10);
    const item = getEquipment()[index];
    if (!item) return;
    name = item.tag || item.description || `Equipment-${state.equipment.length + 1}`;
  } else {
    name = customName || `Custom-${state.equipment.length + 1}`;
  }

  const id = `eq-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const startX = clamp(1 + state.equipment.length * 0.8, 0, Math.max(0, state.room.width - width));
  const startY = clamp(1 + state.equipment.length * 0.6, 0, Math.max(0, state.room.depth - depth));

  state.equipment.push({ id, name, width, depth, voltage, facing, x: startX, y: startY });
  state.selectedEquipmentId = id;
  render();
}

function applyRoomChanges() {
  state.room.width = clamp(parseNumber(document.getElementById('room-width').value, 30), 8, 200);
  state.room.depth = clamp(parseNumber(document.getElementById('room-depth').value, 20), 8, 200);
  ['north', 'south', 'east', 'west'].forEach(direction => {
    state.room.walls[direction] = document.getElementById(`wall-${direction}`).value;
  });

  state.equipment = state.equipment.map(eq => ({
    ...eq,
    x: clamp(eq.x, 0, Math.max(0, state.room.width - eq.width)),
    y: clamp(eq.y, 0, Math.max(0, state.room.depth - eq.depth))
  }));
  render();
}

function addInteriorWall() {
  const orientation = document.getElementById('interior-orientation').value;
  const type = document.getElementById('interior-type').value;
  const x = clamp(parseNumber(document.getElementById('interior-x').value, 0), 0, state.room.width);
  const y = clamp(parseNumber(document.getElementById('interior-y').value, 0), 0, state.room.depth);
  const length = clamp(parseNumber(document.getElementById('interior-length').value, 5), 1, 100);

  const adjustedLength = orientation === 'vertical'
    ? Math.min(length, state.room.depth - y)
    : Math.min(length, state.room.width - x);

  state.room.interiorWalls.push({ orientation, type, x, y, length: Math.max(1, adjustedLength) });
  render();
}

function pickEquipmentAtPoint(xFt, yFt) {
  for (let i = state.equipment.length - 1; i >= 0; i -= 1) {
    const eq = state.equipment[i];
    if (xFt >= eq.x && xFt <= eq.x + eq.width && yFt >= eq.y && yFt <= eq.y + eq.depth) {
      return eq;
    }
  }
  return null;
}

function toFeetCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  const svgX = event.clientX - rect.left;
  const svgY = event.clientY - rect.top;
  const xFt = (svgX - 20) / state.scale;
  const yFt = (svgY - 20) / state.scale;
  return { xFt, yFt };
}

function bindCanvasInteractions() {
  canvas.addEventListener('pointerdown', event => {
    const { xFt, yFt } = toFeetCoordinates(event);
    if (state.wallDraw.enabled) {
      state.selectedEquipmentId = null;
      state.wallDraw.start = { x: clamp(xFt, 0, state.room.width), y: clamp(yFt, 0, state.room.depth) };
      state.wallDraw.current = { ...state.wallDraw.start };
      canvas.setPointerCapture(event.pointerId);
      render();
      return;
    }
    const picked = pickEquipmentAtPoint(xFt, yFt);
    state.selectedEquipmentId = picked ? picked.id : null;
    if (picked) {
      state.drag = {
        id: picked.id,
        offsetX: xFt - picked.x,
        offsetY: yFt - picked.y
      };
      canvas.setPointerCapture(event.pointerId);
    }
    render();
  });

  canvas.addEventListener('pointermove', event => {
    if (state.wallDraw.enabled && state.wallDraw.start) {
      const { xFt, yFt } = toFeetCoordinates(event);
      state.wallDraw.current = { x: clamp(xFt, 0, state.room.width), y: clamp(yFt, 0, state.room.depth) };
      render();
      return;
    }
    if (!state.drag) return;
    const { xFt, yFt } = toFeetCoordinates(event);
    const eq = state.equipment.find(item => item.id === state.drag.id);
    if (!eq) return;
    eq.x = clamp(xFt - state.drag.offsetX, 0, Math.max(0, state.room.width - eq.width));
    eq.y = clamp(yFt - state.drag.offsetY, 0, Math.max(0, state.room.depth - eq.depth));
    render();
  });

  const release = () => {
    if (state.wallDraw.enabled && state.wallDraw.start && state.wallDraw.current) {
      addInteriorWallFromDrag(state.wallDraw.start, state.wallDraw.current);
      state.wallDraw.start = null;
      state.wallDraw.current = null;
      render();
      return;
    }
    state.drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}

function bindUI() {
  document.getElementById('apply-room').addEventListener('click', applyRoomChanges);
  document.getElementById('add-equipment').addEventListener('click', addEquipment);
  document.getElementById('add-interior-wall').addEventListener('click', addInteriorWall);
  document.getElementById('draw-wall-mode').addEventListener('click', event => {
    state.wallDraw.enabled = !state.wallDraw.enabled;
    state.wallDraw.start = null;
    state.wallDraw.current = null;
    event.currentTarget.setAttribute('aria-pressed', String(state.wallDraw.enabled));
    event.currentTarget.classList.toggle('primary-btn', state.wallDraw.enabled);
    render();
  });

  document.getElementById('zoom-in').addEventListener('click', () => {
    state.scale = clamp(state.scale + 2, 8, 45);
    render();
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    state.scale = clamp(state.scale - 2, 8, 45);
    render();
  });

  document.getElementById('delete-selected-equipment').addEventListener('click', () => {
    if (!state.selectedEquipmentId) return;
    state.equipment = state.equipment.filter(eq => eq.id !== state.selectedEquipmentId);
    state.selectedEquipmentId = null;
    render();
  });

  document.getElementById('equipment-source').addEventListener('change', event => {
    const isCustom = event.target.value === 'custom';
    document.getElementById('equipment-preset-wrapper').classList.toggle('hidden', isCustom);
    document.getElementById('custom-name-wrapper').classList.toggle('hidden', !isCustom);
  });

  document.getElementById('equipment-preset').addEventListener('change', event => {
    const index = Number.parseInt(event.target.value, 10);
    const item = getEquipment()[index];
    if (!item) return;
    document.getElementById('equipment-width').value = parseNumber(item.width, 4);
    document.getElementById('equipment-depth').value = parseNumber(item.depth, 2);
    if (item.voltage) {
      const voltage = String(item.voltage).toUpperCase();
      const select = document.getElementById('equipment-voltage');
      const matching = Array.from(select.options).find(opt => opt.value.toUpperCase() === voltage);
      if (matching) select.value = matching.value;
    }
  });
}

function initialize() {
  canvas = document.getElementById('equipment-arrangement-canvas');
  summaryEl = document.getElementById('arrangement-summary');
  if (!canvas) return;

  ['wall-north', 'wall-south', 'wall-east', 'wall-west', 'interior-type'].forEach(id => populateSelect(id, WALL_TYPES));
  populateSelect('equipment-voltage', VOLTAGE_OPTIONS);
  populateEquipmentPreset();
  bindUI();
  bindCanvasInteractions();
  render();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initialize);
}

/**
 * Convert array of objects to CSV string.
 * @param {string[]} headers - column headers / keys
 * @param {Array<Object>} rows
 * @returns {string}
 */
function toCSV(headers = [], rows = []) {
  const lines = [headers.join(',')];
  rows.forEach(r => {
    const line = headers.map(h => {
      const val = r[h] ?? '';
      let cell = String(val);
      if (cell.includes(',') || cell.includes('"')) {
        cell = '"' + cell.replace(/"/g, '""') + '"';
      }
      return cell;
    }).join(',');
    lines.push(line);
  });
  return lines.join('\n');
}

/**
 * Convenience helper to export data as CSV file in browser.
 */
function downloadCSV(headers, rows, filename = 'report.csv') {
  const csv = toCSV(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

var reporting = /*#__PURE__*/Object.freeze({
  __proto__: null,
  downloadCSV: downloadCSV,
  toCSV: toCSV
});

// Load the arc flash label template without using Node's fs module.

let template = `<svg xmlns="http://www.w3.org/2000/svg" width="6in" height="4in" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#ffffff" stroke="#000000" stroke-width="6"/>
  <rect x="0" y="0" width="600" height="110" fill="{{signalColor}}"/>
  <g transform="translate(36 20)">
    <path d="M60 0L120 82H0Z" fill="#ffffff" stroke="#000000" stroke-width="6"/>
    <path d="M60 14L104 68H16Z" fill="{{signalColor}}"/>
    <text x="60" y="60" font-size="66" font-weight="bold" text-anchor="middle" fill="#ffffff">!</text>
  </g>
  <text x="190" y="60" font-size="60" font-weight="bold" fill="#ffffff" font-family="Helvetica, Arial, sans-serif">{{signalWord}}</text>
  <text x="190" y="95" font-size="22" fill="#ffffff" font-family="Helvetica, Arial, sans-serif">ARC FLASH HAZARD</text>
  <line x1="0" y1="110" x2="600" y2="110" stroke="#000000" stroke-width="2"/>
  <g font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#000000">
    <text x="30" y="150">Equipment Tag: <tspan font-weight="bold">{{equipmentTag}}</tspan></text>
    <text x="30" y="180">Nominal Voltage: <tspan font-weight="bold">{{voltage}}</tspan></text>
    <text x="30" y="210">Incident Energy: <tspan font-weight="bold">{{incidentEnergy}}</tspan></text>
    <text x="30" y="240">Working Distance: <tspan font-weight="bold">{{workingDistance}}</tspan></text>
    <text x="30" y="270">Arc Flash Boundary: <tspan font-weight="bold">{{arcFlashBoundary}}</tspan></text>
    <text x="30" y="300">Limited Approach: <tspan font-weight="bold">{{limitedApproach}}</tspan></text>
    <text x="30" y="330">Restricted Approach: <tspan font-weight="bold">{{restrictedApproach}}</tspan></text>
    <text x="30" y="360">Upstream Protective Device: <tspan font-weight="bold">{{upstreamDevice}}</tspan></text>
  </g>
  <g font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#000000">
    <text x="30" y="390">PPE Category: <tspan font-weight="bold">{{ppeCategory}}</tspan></text>
    <text x="320" y="390">Study Date: <tspan font-weight="bold">{{studyDate}}</tspan></text>
  </g>
</svg>`;

try {
  const p = new URL('./templates/arcflashLabel.svg', import.meta.url);
  const res = await fetch(p);
  if (res.ok) {
    template = await res.text();
  }
} catch {}

function generateArcFlashLabel(data = {}) {
  let svg = template;
  Object.entries(data).forEach(([k, v]) => {
    const re = new RegExp(`{{${k}}}`, 'g');
    svg = svg.replace(re, v ?? '');
  });
  return svg;
}

var labels = /*#__PURE__*/Object.freeze({
  __proto__: null,
  generateArcFlashLabel: generateArcFlashLabel
});
