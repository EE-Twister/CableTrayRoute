(function () {
  'use strict';

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
    globalThis.projectStorage = api;
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
  let contextMenu = null;

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

  function drawWallLabel(text, xFt, yFt, anchor = 'start') {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    element.setAttribute('x', String(xFt * state.scale));
    element.setAttribute('y', String(yFt * state.scale));
    element.setAttribute('class', 'equipment-wall-label');
    element.setAttribute('text-anchor', anchor);
    element.textContent = text;
    canvas.appendChild(element);
  }

  function renderRoom() {
    const roomRect = drawRect({ x: 0, y: 0, w: state.room.width, h: state.room.depth }, 'equipment-room-outer');
    roomRect.setAttribute('rx', '4');
    roomRect.setAttribute('ry', '4');

    // Place each wall label in a distinct location so North and West don't overlap
    drawWallLabel(`NORTH · ${state.room.walls.north}`, state.room.width / 2, 0.75, 'middle');
    drawWallLabel(`SOUTH · ${state.room.walls.south}`, state.room.width / 2, state.room.depth - 0.25, 'middle');
    drawWallLabel(`WEST · ${state.room.walls.west}`, 0.3, state.room.depth / 2, 'start');
    drawWallLabel(`EAST · ${state.room.walls.east}`, state.room.width - 0.3, state.room.depth / 2, 'end');

    state.room.interiorWalls.forEach(wall => {
      const rect = interiorWallRect(wall);
      const element = drawRect(rect, 'equipment-interior-wall');
      element.setAttribute('data-wall-type', wall.type);
    });

    if (state.wallDraw.enabled && state.wallDraw.start && state.wallDraw.current) {
      // Auto-detect orientation from drag direction: wider drag = horizontal, taller = vertical
      const dx = Math.abs(state.wallDraw.current.x - state.wallDraw.start.x);
      const dy = Math.abs(state.wallDraw.current.y - state.wallDraw.start.y);
      const orientation = dx > dy ? 'horizontal' : 'vertical';
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
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const orientation = dx > dy ? 'horizontal' : 'vertical';
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

  function drawGapIndicator(x1ft, y1ft, x2ft, y2ft, gapFt, orientation) {
    const x1 = x1ft * state.scale;
    const y1 = y1ft * state.scale;
    const x2 = x2ft * state.scale;
    const y2 = y2ft * state.scale;
    const tickSize = 5;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'equipment-gap-line');
    canvas.appendChild(line);

    const ends = orientation === 'horizontal' ? [[x1, y1], [x2, y2]] : [[x1, y1], [x2, y2]];
    ends.forEach(([tx, ty]) => {
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      if (orientation === 'horizontal') {
        tick.setAttribute('x1', String(tx)); tick.setAttribute('y1', String(ty - tickSize));
        tick.setAttribute('x2', String(tx)); tick.setAttribute('y2', String(ty + tickSize));
      } else {
        tick.setAttribute('x1', String(tx - tickSize)); tick.setAttribute('y1', String(ty));
        tick.setAttribute('x2', String(tx + tickSize)); tick.setAttribute('y2', String(ty));
      }
      tick.setAttribute('class', 'equipment-gap-line');
      canvas.appendChild(tick);
    });

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const label = `${gapFt.toFixed(2)}'`;
    const bgW = Math.max(label.length * 6 + 8, 32);

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(midX - bgW / 2));
    bg.setAttribute('y', String(midY - 8));
    bg.setAttribute('width', String(bgW));
    bg.setAttribute('height', '14');
    bg.setAttribute('rx', '3');
    bg.setAttribute('class', 'equipment-gap-label-bg');
    canvas.appendChild(bg);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(midX));
    text.setAttribute('y', String(midY + 3));
    text.setAttribute('class', 'equipment-gap-label');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = label;
    canvas.appendChild(text);
  }

  function renderGapIndicators() {
    if (!state.drag) return;
    const dragging = state.equipment.find(e => e.id === state.drag.id);
    if (!dragging) return;

    state.equipment.forEach(other => {
      if (other.id === dragging.id) return;

      // Horizontal gap: equipment with overlapping y-ranges
      const overlapY0 = Math.max(dragging.y, other.y);
      const overlapY1 = Math.min(dragging.y + dragging.depth, other.y + other.depth);
      if (overlapY1 > overlapY0) {
        const midY = (overlapY0 + overlapY1) / 2;
        if (dragging.x + dragging.width <= other.x) {
          const gap = other.x - (dragging.x + dragging.width);
          if (gap < 20) drawGapIndicator(dragging.x + dragging.width, midY, other.x, midY, gap, 'horizontal');
        } else if (other.x + other.width <= dragging.x) {
          const gap = dragging.x - (other.x + other.width);
          if (gap < 20) drawGapIndicator(other.x + other.width, midY, dragging.x, midY, gap, 'horizontal');
        }
      }

      // Vertical gap: equipment with overlapping x-ranges
      const overlapX0 = Math.max(dragging.x, other.x);
      const overlapX1 = Math.min(dragging.x + dragging.width, other.x + other.width);
      if (overlapX1 > overlapX0) {
        const midX = (overlapX0 + overlapX1) / 2;
        if (dragging.y + dragging.depth <= other.y) {
          const gap = other.y - (dragging.y + dragging.depth);
          if (gap < 20) drawGapIndicator(midX, dragging.y + dragging.depth, midX, other.y, gap, 'vertical');
        } else if (other.y + other.depth <= dragging.y) {
          const gap = dragging.y - (other.y + other.depth);
          if (gap < 20) drawGapIndicator(midX, other.y + other.depth, midX, dragging.y, gap, 'vertical');
        }
      }
    });
  }

  function createContextMenu() {
    contextMenu = document.createElement('div');
    contextMenu.id = 'canvas-context-menu';
    contextMenu.style.cssText = 'position:fixed;z-index:9999;background:var(--card-bg,#fff);border:1px solid var(--border-color,#7d8790);border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.22);padding:4px 0;min-width:170px;display:none;';
    document.body.appendChild(contextMenu);
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenu(); });
  }

  function hideContextMenu() {
    if (contextMenu) contextMenu.style.display = 'none';
  }

  function addContextMenuItem(label, action, danger = false) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `display:block;width:100%;padding:6px 14px;background:none;border:none;text-align:left;cursor:pointer;font-size:.875rem;color:${danger ? '#c0392b' : 'var(--text-color,#1f2b3a)'};`;
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--hover-bg,rgba(0,0,0,.07))'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
    btn.addEventListener('click', () => { action(); hideContextMenu(); });
    contextMenu.appendChild(btn);
  }

  function addContextMenuSeparator() {
    const sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px solid var(--border-color,#ddd);margin:3px 0;';
    contextMenu.appendChild(sep);
  }

  function showContextMenu(clientX, clientY, eq) {
    if (!contextMenu || !eq) return;
    contextMenu.innerHTML = '';

    addContextMenuItem('Copy', () => {
      const id = `eq-${Date.now()}-${Math.round(Math.random() * 1000)}`;
      const copy = { ...eq, id, x: clamp(eq.x + 1, 0, Math.max(0, state.room.width - eq.width)), y: clamp(eq.y + 1, 0, Math.max(0, state.room.depth - eq.depth)) };
      delete copy.listTag;
      state.equipment.push(copy);
      state.selectedEquipmentId = id;
      render();
    });
    addContextMenuItem('Delete', () => {
      state.equipment = state.equipment.filter(e => e.id !== eq.id);
      if (state.selectedEquipmentId === eq.id) state.selectedEquipmentId = null;
      render();
    }, true);

    addContextMenuSeparator();
    addContextMenuItem('Align to North Wall', () => { eq.y = 0; if (eq.listTag) syncEquipmentPosition(eq); render(); });
    addContextMenuItem('Align to South Wall', () => { eq.y = Math.max(0, state.room.depth - eq.depth); if (eq.listTag) syncEquipmentPosition(eq); render(); });
    addContextMenuItem('Align to West Wall', () => { eq.x = 0; if (eq.listTag) syncEquipmentPosition(eq); render(); });
    addContextMenuItem('Align to East Wall', () => { eq.x = Math.max(0, state.room.width - eq.width); if (eq.listTag) syncEquipmentPosition(eq); render(); });
    addContextMenuItem('Center Horizontally', () => { eq.x = Math.max(0, (state.room.width - eq.width) / 2); if (eq.listTag) syncEquipmentPosition(eq); render(); });
    addContextMenuItem('Center Vertically', () => { eq.y = Math.max(0, (state.room.depth - eq.depth) / 2); if (eq.listTag) syncEquipmentPosition(eq); render(); });

    addContextMenuSeparator();
    addContextMenuItem('Snap to Grid (0.5 ft)', () => {
      eq.x = snapToStep(eq.x, 0.5);
      eq.y = snapToStep(eq.y, 0.5);
      if (eq.listTag) syncEquipmentPosition(eq);
      render();
    });

    contextMenu.style.display = 'block';
    const menuW = contextMenu.offsetWidth || 170;
    const menuH = contextMenu.scrollHeight;
    contextMenu.style.left = `${Math.min(clientX, window.innerWidth - menuW - 8)}px`;
    contextMenu.style.top = `${Math.min(clientY, window.innerHeight - menuH - 8)}px`;
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
    renderGapIndicators();
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
    let listTag = null;
    if (source === 'equipment-list') {
      const index = Number.parseInt(presetSelect.value, 10);
      const item = getEquipment()[index];
      if (!item) return;
      name = item.tag || item.description || `Equipment-${state.equipment.length + 1}`;
      listTag = item.tag || null;
      if (listTag && state.equipment.some(e => e.listTag === listTag)) {
        // eslint-disable-next-line no-alert
        alert(`"${name}" is already on the canvas. Each equipment item can only be placed once.`);
        return;
      }
    } else {
      name = customName || `Custom-${state.equipment.length + 1}`;
    }

    const id = `eq-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const startX = clamp(1 + state.equipment.length * 0.8, 0, Math.max(0, state.room.width - width));
    const startY = clamp(1 + state.equipment.length * 0.6, 0, Math.max(0, state.room.depth - depth));

    const newEq = { id, name, width, depth, voltage, facing, x: startX, y: startY };
    if (listTag) newEq.listTag = listTag;
    state.equipment.push(newEq);
    state.selectedEquipmentId = id;
    if (listTag) syncEquipmentPosition(newEq);
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

  function syncEquipmentPosition(eq) {
    const list = getEquipment();
    const idx = list.findIndex(item => item.tag === eq.listTag);
    if (idx === -1) return;
    updateEquipment(idx, {
      x: String(Math.round(eq.x * 100) / 100),
      y: String(Math.round(eq.y * 100) / 100)
    });
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
    const pt = canvas.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgPt = pt.matrixTransform(canvas.getScreenCTM().inverse());
    const xFt = (svgPt.x - 20) / state.scale;
    const yFt = (svgPt.y - 20) / state.scale;
    return { xFt, yFt };
  }

  function bindCanvasInteractions() {
    canvas.addEventListener('contextmenu', event => {
      event.preventDefault();
      const { xFt, yFt } = toFeetCoordinates(event);
      const picked = pickEquipmentAtPoint(xFt, yFt);
      if (picked) {
        state.selectedEquipmentId = picked.id;
        render();
      }
      showContextMenu(event.clientX, event.clientY, picked);
    });

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
      if (state.drag) {
        const eq = state.equipment.find(item => item.id === state.drag.id);
        if (eq && eq.listTag) syncEquipmentPosition(eq);
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
    createContextMenu();
    bindUI();
    bindCanvasInteractions();
    render();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', initialize);
  }

})();
