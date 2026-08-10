const d3 = globalThis.d3;
import {
  getItem,
  setItem,
  getCables,
  getOneLine,
  setOneLine,
  getStudies,
  setStudies,
  on,
  STORAGE_KEYS,
  getTrayHardwareCatalogCustomProducts
} from '../dataStore.mjs';
import { runShortCircuit } from './shortCircuit.mjs';
import { scaleCurve, checkDuty, sanitizeCurve } from './tccUtils.js';
import { checkCoordination, greedyCoordinate, greedyCoordinateGFP, generateFaultCurrents, interpolateTime } from './tccAutoCoord.mjs';
import {
  createDirectedConnectionMap,
  addDirectedConnection,
  collectAdjacentDeviceUids,
  collectAdjacentDeviceRelationships
} from './tccContext.mjs';
import { buildCTIRows, CTI_HEADERS } from '../reports/coordinationReport.mjs';
import { downloadCSV, toCSV } from '../reports/reporting.mjs';
import { buildExportFiles, MANIFEST_HEADERS } from '../reports/relaySettingsExport.mjs';
import {
  EXPORT_INLINE_STYLES,
  EXPORT_SCALE,
  SVG_DOWNLOAD_FILENAME,
  PNG_DOWNLOAD_FILENAME,
  buildSvgDownloadMarkup,
  computeCanvasDimensions,
} from './chartExportUtils.mjs';
import { openModal, showAlertModal } from '../src/components/modal.js';
import { buildOneLineProbeUrl, openOneLineProbe } from '../src/crossProbe.js';
import { incidentEnergyLimitCurve } from './arcFlash.mjs';
import componentLibrary from '../componentLibrary.json' with { type: 'json' };
import {
  assessProtectiveDeviceLibraryEntry,
  normalizeCatalogProtectiveDevice,
  summarizeProtectiveDeviceLibrary
} from './protectiveDeviceLibrary.mjs';
import {
  mergeProtectiveDeviceReview,
  openProtectiveDeviceReview
} from './protectiveDeviceReview.mjs';
import {
  CUSTOM_CURVE_SETTING_CONFIG,
  CUSTOM_CURVE_SETTING_OPTIONS,
  TCC_CALLOUT_SCOPES,
  TCC_RANGE_PRESETS,
  TCC_VIEW_OPTIONS,
  computeLegendLayout as computeLegendLayoutModel,
  formatViewValue as formatViewValueModel,
  getActiveViewConfigs as getActiveViewConfigsModel,
  getTccRangePreset,
  normalizeCalloutScope,
  normalizeRangePreset,
  normalizeViewOptionList,
  summarizeActiveViewLabels as summarizeActiveViewLabelsModel
} from './tcc/viewModel.mjs';
import {
  CUSTOM_CURVE_CATEGORY,
  CUSTOM_CURVE_VENDOR_FALLBACK,
  buildCustomCurveBaseDevice,
  createCustomCurveId,
  normalizeCustomCurveRole,
  normalizeCustomCurveSequences,
  sanitizeAxisSpec,
  sanitizeBoundsSpec,
  sanitizeCustomCurve,
  sanitizeCustomCurveEvidence,
  sanitizeCustomCurveProfiles,
  sanitizeCustomCurveSettings,
  sanitizeCustomCurveText,
  sanitizeCustomInterruptingRatings,
  sanitizeToleranceSpec,
  sortCustomCurveList
} from './tcc/customCurveModel.mjs';
import { resolvePlotDomainsModel } from './tcc/plotDomainModel.mjs';
import { resolveCatalogSelection } from './tcc/catalogSelectionModel.mjs';
import {
  evaluateEquipmentConstraints,
  PROTECTIVE_DEVICE_TYPES,
  isProtectiveDeviceType as isProtectiveType
} from './tcc/equipmentConstraintModel.mjs';
import {
  buildTypeGroups,
  describeEntryAttributes,
  getManufacturerLabel,
  normalizeTypeKey
} from './tcc/catalogPresentationModel.mjs';
import {
  PREVIEW_SHAPE_DASH_PATTERNS,
  buildAnnotationPreviewLines,
  createAnnotationId,
  exportAnnotation,
  normalizeAnnotationPreview,
  sanitizeAnnotation
} from './tcc/annotationModel.mjs';
import {
  buildPrintMarkup,
  buildReviewExportMarkup,
  escapeHtml
} from './tcc/reportMarkupModel.mjs';
import { renderDeviceDetailsView } from './tcc/deviceDetailView.mjs';
import {
  buildTccSettingsSnapshot,
  reconcileComponentOverrides
} from './tcc/persistenceModel.mjs';
import { renderTccSettings } from './tcc/settingsView.mjs';
import {
  buildEquipmentOverlayAriaLabel,
  entryInteractiveKey,
  findNearestCurvePoint,
  formatHoverSettings,
  getHoverClientPoint
} from './tcc/chartInteractionModel.mjs';
import { openTccViewOptionsModal } from './tcc/viewOptionsModal.mjs';
import { openCustomCurveBuilderView } from './tcc/customCurveBuilderView.mjs';
import { renderTccChart } from './tcc/chartRenderer.mjs';
import { openDeviceSelectionModalView } from './tcc/deviceSelectionModal.mjs';
import { openComponentBrowserModalView } from './tcc/componentBrowserModal.mjs';
import { renderCoordinationOrderView } from './tcc/coordinationOrderView.mjs';
import { renderOneLinePreviewView } from './tcc/oneLinePreviewView.mjs';
import {
  describeSettingRange,
  formatCoordinationCurrent,
  formatCoordinationSeconds,
  formatDetailValue,
  formatOptionLabel,
  formatSettingLabel,
  formatSettingValue,
  getSettingOptions,
  normalizeSettingOptions,
  resolveSettingType,
  snapOverridesToOptions,
  snapSettingValue,
  valuesEqual
} from './tcc/settingModel.mjs';
import {
  DEFAULT_INRUSH_DURATION,
  buildCableCurve,
  buildMotorStartingCurve,
  buildTransformerDamageCurve,
  collectMotorOperatingData,
  componentLabel,
  computeTransformerInrush,
  getComponentValue,
  getComponentVendor,
  getNumericValue,
  inferVoltage,
  mergeOverrides,
  parseNumeric,
  parsePhases,
  resolveCableInfo,
  resolveMotorThermalLimit
} from './tcc/equipmentOverlayModel.mjs';
import { startPerformanceMeasurement } from '../src/performance/performanceMetrics.js';
import { createProtectiveDeviceCatalogLoader } from '../src/protectiveDevices/catalogLoader.mjs';
import { createTccCatalogHydrator } from '../src/protectiveDevices/tccCatalogHydrator.mjs';
import { loadReferencedProtectiveDevices } from '../src/protectiveDevices/calculationCatalog.mjs';

const MOTOR_TYPES = new Set(['motor_load', 'motor', 'motor_starter', 'motor_controller']);

function normalizeProtectionType(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isMotorComponent(component) {
  if (!component) return false;
  return MOTOR_TYPES.has(normalizeProtectionType(component.type))
    || MOTOR_TYPES.has(normalizeProtectionType(component.subtype));
}

const MOTOR_START_PLOT_FLOOR = 0.01;
const MOTOR_START_PLOT_CEILING = 10000;
const DEFAULT_MOTOR_COLD_START_DURATION = 10;
const DEFAULT_MOTOR_HOT_START_DURATION = 6;
const EQUIPMENT_OVERLAY_KINDS = new Set(['cable', 'inrush', 'transformerDamage', 'motorStart', 'motorThermal']);
const TCC_DEFAULT_CHART_WIDTH = 800;
const TCC_DEFAULT_CHART_HEIGHT = 600;
const TCC_MIN_PLOT_HEIGHT = 480;
const CUSTOM_CURVE_DEFAULT_AXES = { currentMin: 10, currentMax: 10000, timeMin: 0.01, timeMax: 100 };
const CUSTOM_CURVE_DEFAULT_BOUNDS = { left: 0, right: 0, top: 0, bottom: 0 };

const baseHref = document.querySelector('base')?.href || new URL('.', window.location.href).href;
const asset = path => {
  if (!path) return null;
  try {
    return new URL(path, baseHref).href;
  } catch {
    return null;
  }
};

const placeholderIcon = asset('icons/placeholder.svg');

function compKey(type, subtype) {
  const normalizedType = typeof type === 'string' ? type.trim() : '';
  const normalizedSubtype = typeof subtype === 'string' ? subtype.trim() : '';
  if (normalizedSubtype && normalizedType) return `${normalizedType}_${normalizedSubtype}`;
  return normalizedSubtype || normalizedType;
}

function resolveIconSource(iconPath, fallbackSymbol) {
  if (typeof iconPath === 'string' && iconPath.trim()) {
    const trimmed = iconPath.trim();
    if (trimmed.startsWith('data:') || /^https?:/i.test(trimmed)) {
      return trimmed;
    }
    return asset(trimmed) || placeholderIcon;
  }
  if (fallbackSymbol) {
    return asset(`icons/components/${fallbackSymbol}.svg`) || placeholderIcon;
  }
  return placeholderIcon;
}

const clampValue = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};
function buildComponentPreviewDefinitionMap() {
  const map = new Map();
  const register = (definition, { allowOverride = true } = {}) => {
    if (!definition || typeof definition !== 'object') return;
    const rawSubtype = typeof definition.subtype === 'string' ? definition.subtype.trim() : '';
    const rawType = typeof definition.type === 'string' ? definition.type.trim() : '';
    const rawCategory = typeof definition.category === 'string' ? definition.category.trim() : '';
    const resolvedType = rawType || rawCategory || rawSubtype;
    if (!rawSubtype && !resolvedType) return;
    const meta = {
      icon: resolveIconSource(definition.icon, definition.symbol),
      width: Number.isFinite(Number(definition.width)) ? Number(definition.width) : null,
      height: Number.isFinite(Number(definition.height)) ? Number(definition.height) : null,
      type: resolvedType,
      subtype: rawSubtype,
      category: rawCategory,
      defaultRotation: Number.isFinite(Number(definition.defaultRotation))
        ? Number(definition.defaultRotation)
        : null
    };
    const keys = new Set();
    if (resolvedType && rawSubtype) keys.add(compKey(resolvedType, rawSubtype));
    if (rawSubtype) keys.add(rawSubtype);
    if (resolvedType) keys.add(resolvedType);
    if (rawCategory) keys.add(rawCategory);
    keys.forEach(key => {
      if (!key) return;
      if (!map.has(key) || allowOverride) {
        map.set(key, meta);
      }
    });
  };

  const definitions = Array.isArray(componentLibrary?.components) ? componentLibrary.components : [];
  definitions.forEach(def => register(def));

  const fallbackDefinitions = [
    {
      type: 'bus',
      subtype: 'Bus',
      icon: 'icons/components/Bus.svg',
      width: 200,
      height: 20,
      category: 'bus'
    },
    {
      type: 'equipment',
      subtype: 'Equipment',
      icon: 'icons/components/Equipment.svg',
      width: 120,
      height: 60,
      category: 'equipment'
    },
    {
      type: 'motor_load',
      subtype: 'motor_load',
      icon: 'icons/components/Motor.svg',
      width: 100,
      height: 100,
      category: 'load'
    },
    {
      type: 'static_load',
      subtype: 'static_load',
      icon: 'icons/components/Load.svg',
      width: 100,
      height: 100,
      category: 'load'
    },
    {
      type: 'transformer',
      subtype: 'two_winding',
      icon: 'icons/components/Transformer.svg',
      width: 140,
      height: 90,
      category: 'equipment'
    }
  ];

  fallbackDefinitions.forEach(def => register(def, { allowOverride: false }));

  return map;
}

const componentPreviewDefinitionMap = buildComponentPreviewDefinitionMap();

function getPreviewDefinition(comp) {
  if (!comp) return null;
  const type = typeof comp.type === 'string' ? comp.type.trim() : '';
  const subtype = typeof comp.subtype === 'string' ? comp.subtype.trim() : '';
  const category = typeof comp.category === 'string' ? comp.category.trim() : '';
  const keys = [
    compKey(type || category || subtype, subtype),
    subtype,
    type,
    category
  ];
  for (const key of keys) {
    if (!key) continue;
    const meta = componentPreviewDefinitionMap.get(key);
    if (meta) return meta;
  }
  return null;
}

let pdfJsLibPromise = null;

function ensurePdfJs() {
  if (pdfJsLibPromise) return pdfJsLibPromise;
  pdfJsLibPromise = Promise.resolve(globalThis.pdfjsLib).then(module => {
    if (!module) {
      throw new Error('PDF.js library is not loaded.');
    }
    if (module.GlobalWorkerOptions) {
      module.GlobalWorkerOptions.workerSrc = 'dist/vendor/pdf.worker.min.mjs';
    }
    return module;
  }).catch(err => {
    pdfJsLibPromise = null;
    throw err;
  });
  return pdfJsLibPromise;
}

const deviceSelect = document.getElementById('device-select');
const deviceModalBtn = document.getElementById('device-modal-btn');
const selectedSummary = document.getElementById('selected-device-summary');
const settingsDiv = document.getElementById('device-settings');
const plotBtn = document.getElementById('plot-btn');
const customCurveBtn = document.getElementById('custom-curve-btn');
const linkBtn = document.getElementById('link-btn');
const openBtn = document.getElementById('open-btn');
const componentModalBtn = document.getElementById('component-modal-btn');
const violationDiv = document.getElementById('violation');
const printPlotBtn = document.getElementById('print-plot-btn');
const exportSvgBtn = document.getElementById('export-svg-btn');
const exportPngBtn = document.getElementById('export-png-btn');
const exportReviewBtn = document.getElementById('export-review-btn');
const annotationBtn = document.getElementById('add-annotation-btn');
const autoCoordBtn = document.getElementById('auto-coord-btn');
const exportCtiBtn = document.getElementById('export-cti-btn');
const exportRelaySettingsBtn = document.getElementById('export-relay-settings-btn');
const coordPanel = document.getElementById('coordination-panel');
const coordResultsDiv = document.getElementById('coord-results');
const coordOrderList = document.getElementById('coord-order-list');
const coordMarginInput = document.getElementById('coord-margin');
const rangePresetSelect = document.getElementById('tcc-range-preset');
const calloutScopeLabel = document.getElementById('tcc-callout-scope-label');
const calloutScopeSelect = document.getElementById('tcc-callout-scope');
const viewMenuBtn = document.getElementById('tcc-view-menu-btn');
const arcFlashOverlayControls = document.getElementById('arc-flash-overlay-controls');
const afThresholdSelect = document.getElementById('af-threshold-select');
const contextBanner = document.getElementById('tcc-context-banner');
const contextTitle = document.getElementById('tcc-context-title');
const contextSubtitle = document.getElementById('tcc-context-subtitle');
const contextRelationships = document.getElementById('tcc-context-relationships');
const contextBackBtn = document.getElementById('tcc-back-oneline-btn');
const coordStatusSummary = document.getElementById('coord-status-summary');
const equipmentMetricsPanel = document.getElementById('tcc-equipment-metrics');
const hoverTooltip = document.getElementById('tcc-hover-tooltip');
const pinnedDetailPanel = document.getElementById('tcc-pinned-detail');
const tccChartContainer = document.querySelector('.tcc-chart-container');
const chart = d3.select('#tcc-chart');
const onelinePreviewSvgEl = document.getElementById('oneline-preview');
const onelinePreviewSvg = onelinePreviewSvgEl ? d3.select(onelinePreviewSvgEl) : null;
const onelinePreviewContainer = document.querySelector('.tcc-oneline-preview');
const onelinePreviewEmpty = document.getElementById('oneline-preview-empty');
const onelinePreviewNote = document.getElementById('oneline-preview-note');
const contextMenu = createContextMenu();
const viewCalloutOffsets = new Map();

let onelinePreviewTransform = null;
const previewPositionOverrides = new Map();

// Auto-coordination state — populated at the end of each plot() call
let activePlotted = null;
let activeCurvesUpdater = null;
let activeCoordMarkerDrawer = null;
let activeEquipmentOverlays = [];
let activeEquipmentConstraintChecks = [];
let coordOrderIds = [];

// Last completed auto-coordination result; enables CTI report export
let lastCoordState = null;

let updatingActiveComponentFromSelect = false;


function setActiveRangePreset(value, { persist = true } = {}) {
  activeRangePreset = normalizeRangePreset(value);
  if (rangePresetSelect) {
    rangePresetSelect.value = activeRangePreset;
  }
  if (persist) {
    saved.rangePreset = activeRangePreset;
    saved.viewOptions = [...activeViewOptions];
    saved.calloutScope = activeCalloutScope;
    setItem('tccSettings', saved);
  }
}

function updateCalloutScopeControl() {
  if (!calloutScopeLabel || !calloutScopeSelect) return;
  const visible = areCalloutsEnabled();
  calloutScopeLabel.classList.toggle('hidden', !visible);
  calloutScopeSelect.disabled = !visible;
  calloutScopeSelect.value = activeCalloutScope;
}

function setActiveCalloutScope(value, { persist = true } = {}) {
  activeCalloutScope = normalizeCalloutScope(value);
  if (calloutScopeSelect) {
    calloutScopeSelect.value = activeCalloutScope;
  }
  if (persist) {
    saved.calloutScope = activeCalloutScope;
    saved.viewOptions = [...activeViewOptions];
    saved.rangePreset = activeRangePreset;
    setItem('tccSettings', saved);
  }
}

function getActiveViewConfigs() {
  return getActiveViewConfigsModel(activeViewOptions);
}

function areCalloutsEnabled() {
  return activeViewOptions.includes('callouts');
}

function shouldRenderCalloutForEntry(entry) {
  if (!entry?.selection) return false;
  const role = entry.relationship?.role || '';
  if (activeCalloutScope === 'all') return true;
  if (activeCalloutScope === 'selected') return role === 'selected';
  return role === 'upstream' || role === 'selected' || role === 'downstream';
}

function formatViewSummaries(entry) {
  if (!entry || !entry.scaled || !entry.scaled.settings) return [];
  return getActiveViewConfigs()
    .map(option => {
      const raw = entry.scaled.settings[option.field];
      const formatted = formatViewValueModel(option, raw, formatSettingValue);
      if (!formatted) return null;
      const prefix = option.shortLabel || option.label;
      return `${prefix}: ${formatted}`;
    })
    .filter(Boolean);
}

function normalizeCalloutLine(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function firstCalloutLine(value) {
  if (typeof value !== 'string') return '';
  const firstLine = value
    .split(/\r?\n/)
    .map(line => normalizeCalloutLine(line))
    .find(Boolean);
  return firstLine || normalizeCalloutLine(value);
}

function getComponentCalloutTag(component) {
  if (!component) return '';
  const tagKeys = ['tag', 'ref', 'deviceTag', 'device_tag', 'equipmentTag', 'equipment_tag'];
  for (const key of tagKeys) {
    const value = normalizeCalloutLine(getComponentValue(component, key));
    if (value) return value;
  }
  return firstCalloutLine(getComponentValue(component, 'label'))
    || normalizeCalloutLine(getComponentValue(component, 'name'))
    || normalizeCalloutLine(component.id);
}

function formatCalloutDeviceLabel(entry) {
  if (!entry || !entry.selection) return 'Device';
  const component = entry.selection.component;
  const componentText = component ? getComponentCalloutTag(component) : '';
  return normalizeCalloutLine(componentText)
    || normalizeCalloutLine(entry.selection.name)
    || normalizeCalloutLine(entry.name)
    || normalizeCalloutLine(entry.selection.baseDevice?.name)
    || 'Device';
}

function summarizeActiveViewLabels() {
  return summarizeActiveViewLabelsModel(activeViewOptions);
}

function computeLegendLayout(entries, availableWidth) {
  return computeLegendLayoutModel(entries, availableWidth, formatViewSummaries);
}

function updateViewButtonLabel() {
  if (!viewMenuBtn) return;
  const summary = summarizeActiveViewLabels();
  if (!summary) {
    viewMenuBtn.textContent = 'Views';
    viewMenuBtn.title = 'Select device characteristics to display on the chart';
  } else {
    viewMenuBtn.textContent = `Views (${summary})`;
    viewMenuBtn.title = `Showing ${summary}`;
  }
  viewMenuBtn.disabled = false;
}

function setActiveViewOptions(optionIds, { persist = true } = {}) {
  const normalized = normalizeViewOptionList(optionIds);
  const changed = normalized.length !== activeViewOptions.length
    || normalized.some((value, index) => value !== activeViewOptions[index]);
  activeViewOptions = normalized;
  if (changed) updateViewButtonLabel();
  updateCalloutScopeControl();
  if (persist) {
    saved.viewOptions = [...activeViewOptions];
    saved.rangePreset = activeRangePreset;
    saved.calloutScope = activeCalloutScope;
    setItem('tccSettings', saved);
  }
}

const params = new URLSearchParams(window.location.search);
const compId = params.get('component');
const deviceParam = params.get('device');
const tccContextParam = params.get('tccContext') || params.get('context');
const resetToAdjacentContext = !!compId && tccContextParam === 'adjacent';
const annotationBtnDefaultLabel = annotationBtn ? annotationBtn.textContent : 'Add Annotation';
const ANNOTATION_ACTIVE_LABEL = 'Click chart to place annotation';
const DEFAULT_PRINT_HEADER = 'Time-Current Curves';
const DEFAULT_PRINT_FOOTER = 'Generated by CableTrayRoute';
const ANNOTATION_DRAG_STATE = Symbol('tccAnnotationDragState');

let baseLibraryDevices = [];
let libraryDevices = [];
const protectiveDeviceCatalog = createProtectiveDeviceCatalogLoader();
let deviceEntries = [];
let deviceMap = new Map();
let deviceGroups = [];
let componentRecords = [];
let componentLookup = new Map();
let neighborMap = new Map();
let connectionIndex = new Map();
let componentFlowMap = new Map();
let componentDeviceMap = new Map();
let pendingPlotRefresh = null;
let activeComponentId = compId || null;
let annotationMode = false;
let annotations = [];
let annotationContext = null;
let arcFlashOverlayThreshold = 8; // cal/cm² — default incident-energy overlay threshold
let arcFlashOverlayComponentId = null;
let activeRangePreset = 'full';
let activeCalloutScope = 'context';
let activeLegendFocusKey = null;
let plotRefreshPending = false;

// Fixed purple palette for GFP curves — visually distinct from d3.schemeCategory10
const GFP_COLOR_PALETTE = ['#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#a78bfa'];

const CONTEXT_ROLE_META = {
  upstream: {
    role: 'upstream',
    label: 'Upstream',
    order: 0,
    className: 'is-upstream',
    color: '#c2410c'
  },
  selected: {
    role: 'selected',
    label: 'Selected Device',
    order: 1,
    className: 'is-selected-device',
    color: '#0d6efd'
  },
  downstream: {
    role: 'downstream',
    label: 'Downstream',
    order: 2,
    className: 'is-downstream',
    color: '#15803d'
  },
  additional: {
    role: 'additional',
    label: 'Additional Device',
    order: 5,
    className: 'is-additional',
    color: '#64748b'
  }
};

function getActiveComponentId() {
  if (!activeComponentId) return null;
  if (!componentLookup.has(activeComponentId)) return null;
  return activeComponentId;
}

function getContextDeviceRelationshipMap(contextId = getActiveComponentId()) {
  const relationships = new Map();
  if (!contextId) return relationships;
  const selectedEntry = componentDeviceMap.get(contextId);
  collectAdjacentDeviceRelationships(
    contextId,
    componentFlowMap,
    getComponentDeviceUidMap(),
    MAX_NEIGHBOR_DEPTH
  ).forEach((role, uid) => {
    if (role === 'upstream' || role === 'downstream') {
      relationships.set(uid, role);
    }
  });
  if (selectedEntry?.uid) {
    relationships.set(selectedEntry.uid, 'selected');
  }
  return relationships;
}

function getDeviceRelationship(uid, relationshipMap = getContextDeviceRelationshipMap()) {
  const role = relationshipMap.get(uid) || 'additional';
  return CONTEXT_ROLE_META[role] || CONTEXT_ROLE_META.additional;
}

function getContextComponentRelationshipMap(contextId = getActiveComponentId()) {
  const deviceRelationshipMap = getContextDeviceRelationshipMap(contextId);
  const componentRelationshipMap = new Map();
  componentDeviceMap.forEach((entry, componentId) => {
    if (!entry?.uid) return;
    const relationship = getDeviceRelationship(entry.uid, deviceRelationshipMap);
    if (relationship.role !== 'additional') {
      componentRelationshipMap.set(componentId, relationship);
    }
  });
  return componentRelationshipMap;
}

function getCurveColorForComponentId(componentId) {
  if (!componentId || !Array.isArray(activePlotted)) return null;
  const entry = activePlotted.find(plotEntry => plotEntry.selection?.componentId === componentId);
  return entry?.color || null;
}

function sortDeviceIdsForContext(ids) {
  const relationshipMap = getContextDeviceRelationshipMap();
  return [...ids].sort((a, b) => {
    const aMeta = getDeviceRelationship(a, relationshipMap);
    const bMeta = getDeviceRelationship(b, relationshipMap);
    if (aMeta.order !== bMeta.order) return aMeta.order - bMeta.order;
    const aName = deviceMap.get(a)?.name || a;
    const bName = deviceMap.get(b)?.name || b;
    return aName.localeCompare(bName);
  });
}

function renderTccContextBanner() {
  if (!contextBanner) return;
  const contextId = getActiveComponentId();
  const record = contextId ? componentLookup.get(contextId) : null;
  if (!contextId || !record) {
    contextBanner.classList.add('hidden');
    return;
  }

  const component = record.component;
  const assignedEntry = componentDeviceMap.get(contextId);
  const componentName = componentLabel(component);
  contextBanner.classList.remove('hidden');
  if (contextTitle) {
    contextTitle.textContent = `${componentName} TCC`;
  }
  if (contextSubtitle) {
    const parts = [record.sheetName || 'One-line'];
    if (assignedEntry?.baseDevice?.name) {
      parts.push(`Assigned device: ${assignedEntry.baseDevice.name}`);
    }
    contextSubtitle.textContent = parts.join(' | ');
  }
  if (!contextRelationships) return;

  const relationshipMap = getContextDeviceRelationshipMap(contextId);
  const entriesByRole = new Map([
    ['upstream', []],
    ['selected', []],
    ['downstream', []]
  ]);
  relationshipMap.forEach((role, uid) => {
    if (!entriesByRole.has(role)) return;
    const entry = deviceMap.get(uid);
    if (entry) entriesByRole.get(role).push(entry);
  });

  contextRelationships.innerHTML = '';
  ['upstream', 'selected', 'downstream'].forEach(role => {
    const meta = CONTEXT_ROLE_META[role];
    const entries = entriesByRole.get(role) || [];
    const chip = document.createElement('span');
    chip.className = `tcc-context-chip ${meta.className}`;
    chip.setAttribute('role', 'listitem');

    const label = document.createElement('span');
    label.className = 'tcc-context-chip-label';
    label.textContent = meta.label;
    const value = document.createElement('span');
    value.className = 'tcc-context-chip-value';
    value.textContent = entries.length ? entries.map(entry => entry.name).join(', ') : 'Not found';
    chip.append(label, value);
    contextRelationships.appendChild(chip);
  });
}

function updateComponentContextUI() {
  const hasContext = Boolean(
    activeComponentId
    && (componentLookup.size === 0 || componentLookup.has(activeComponentId))
  );
  if (openBtn) {
    openBtn.style.display = hasContext ? 'inline-block' : 'none';
  }
  renderTccContextBanner();
}

if (compId) {
  linkBtn.style.display = 'inline-block';
}
updateComponentContextUI();

const MAX_NEIGHBOR_DEPTH = 4;

function isEquipmentOverlayKind(kind) {
  return EQUIPMENT_OVERLAY_KINDS.has(kind);
}

function loadSavedSettings() {
  const stored = getItem('tccSettings') || {};
  if (!Array.isArray(stored.devices)) stored.devices = [];
  if (!stored.settings || typeof stored.settings !== 'object') stored.settings = {};
  if (!stored.componentOverrides || typeof stored.componentOverrides !== 'object') stored.componentOverrides = {};
  if (!stored.overlaySelections || typeof stored.overlaySelections !== 'object') stored.overlaySelections = {};
  if (!Array.isArray(stored.annotations)) stored.annotations = [];
  if (typeof stored.printHeader !== 'string') stored.printHeader = '';
  if (typeof stored.printFooter !== 'string') stored.printFooter = '';
  if (!Array.isArray(stored.viewOptions)) {
    if (Array.isArray(stored.viewOption)) {
      stored.viewOptions = normalizeViewOptionList(stored.viewOption);
    } else if (typeof stored.viewOption === 'string') {
      stored.viewOptions = normalizeViewOptionList(stored.viewOption);
    } else {
      stored.viewOptions = [];
    }
  } else {
    stored.viewOptions = normalizeViewOptionList(stored.viewOptions);
  }
  delete stored.viewOption;
  stored.rangePreset = normalizeRangePreset(stored.rangePreset);
  stored.calloutScope = normalizeCalloutScope(stored.calloutScope);
  if (!stored.assumptionConfirmations || typeof stored.assumptionConfirmations !== 'object' || Array.isArray(stored.assumptionConfirmations)) {
    stored.assumptionConfirmations = {};
  }
  if (typeof stored.printIncludePreview !== 'boolean') stored.printIncludePreview = false;
  if (!Array.isArray(stored.customCurves)) stored.customCurves = [];
  stored.customCurves = stored.customCurves.map(sanitizeCustomCurve).filter(Boolean);
  if (!stored.protectiveDeviceReviews || typeof stored.protectiveDeviceReviews !== 'object' || Array.isArray(stored.protectiveDeviceReviews)) {
    stored.protectiveDeviceReviews = {};
  }
  if (!Number.isFinite(stored.customCurveCounter)) {
    stored.customCurveCounter = stored.customCurves.reduce((max, curve) => {
      const seq = Number(curve.sequence);
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  }
  if (!stored.previewLayouts || typeof stored.previewLayouts !== 'object') {
    stored.previewLayouts = {};
  } else {
    Object.keys(stored.previewLayouts).forEach(key => {
      const layout = stored.previewLayouts[key];
      if (!layout || typeof layout !== 'object') {
        delete stored.previewLayouts[key];
        return;
      }
      const cleaned = {};
      Object.keys(layout).forEach(componentId => {
        const point = layout[componentId];
        const x = Number(point?.x);
        const y = Number(point?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          cleaned[componentId] = { x, y };
        }
      });
      stored.previewLayouts[key] = cleaned;
    });
  }
  let maxSequence = Number.isFinite(stored.customCurveCounter) ? stored.customCurveCounter : 0;
  stored.customCurves.forEach(curve => {
    if (!Number.isFinite(curve.sequence)) {
      maxSequence += 1;
      curve.sequence = maxSequence;
    } else {
      maxSequence = Math.max(maxSequence, curve.sequence);
    }
  });
  stored.customCurveCounter = maxSequence;
  return stored;
}

function createContextMenu() {
  const menu = document.createElement('ul');
  menu.id = 'tcc-context-menu';
  menu.className = 'context-menu';
  menu.tabIndex = -1;
  document.body.appendChild(menu);
  let visible = false;

  const hide = () => {
    if (!visible) return;
    visible = false;
    menu.style.display = 'none';
    menu.style.visibility = '';
    menu.innerHTML = '';
  };

  const show = (event, items) => {
    if (!items || !items.length) {
      hide();
      return;
    }
    event.preventDefault();
    hide();
    menu.innerHTML = '';
    items.forEach(item => {
      if (!item || typeof item.label !== 'string') return;
      const li = document.createElement('li');
      li.textContent = item.label;
      if (item.disabled) {
        li.classList.add('is-disabled');
      } else if (typeof item.onSelect === 'function') {
        li.addEventListener('click', () => {
          hide();
          item.onSelect();
        }, { once: true });
      }
      menu.appendChild(li);
    });
    if (!menu.childElementCount) {
      hide();
      return;
    }
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const rect = menu.getBoundingClientRect();
    const left = Math.min(event.clientX, viewportWidth - rect.width - 4);
    const top = Math.min(event.clientY, viewportHeight - rect.height - 4);
    menu.style.left = `${Math.max(0, left)}px`;
    menu.style.top = `${Math.max(0, top)}px`;
    menu.style.visibility = 'visible';
    visible = true;
    setTimeout(() => {
      try {
        menu.focus({ preventScroll: true });
      } catch (err) {
        // Ignore focus errors in browsers that disallow focusing lists
      }
    }, 0);
  };

  const handleOutside = event => {
    if (!visible) return;
    if (menu.contains(event.target)) return;
    hide();
  };

  document.addEventListener('click', handleOutside);
  document.addEventListener('contextmenu', handleOutside);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      hide();
    }
  });

  return { show, hide, element: menu };
}

let saved = loadSavedSettings();

let activeViewOptions = normalizeViewOptionList(saved.viewOptions);
saved.viewOptions = [...activeViewOptions];
activeRangePreset = normalizeRangePreset(saved.rangePreset);
saved.rangePreset = activeRangePreset;
if (rangePresetSelect) {
  rangePresetSelect.value = activeRangePreset;
}
activeCalloutScope = normalizeCalloutScope(saved.calloutScope);
saved.calloutScope = activeCalloutScope;
if (calloutScopeSelect) {
  calloutScopeSelect.value = activeCalloutScope;
}
if (!saved.assumptionConfirmations || typeof saved.assumptionConfirmations !== 'object') {
  saved.assumptionConfirmations = {};
}
saved.customCurves = normalizeCustomCurveSequences(saved.customCurves);
saved.customCurveCounter = saved.customCurves.reduce((max, curve) => {
  const seq = Number(curve.sequence);
  return Number.isFinite(seq) ? Math.max(max, seq) : max;
}, Number.isFinite(saved.customCurveCounter) ? saved.customCurveCounter : 0);

annotations = (saved.annotations || []).map(sanitizeAnnotation).filter(Boolean);
saved.annotations = annotations.map(exportAnnotation);

const hydrateProtectiveDevices = createTccCatalogHydrator({
  catalog: protectiveDeviceCatalog,
  getBaseDevices: () => baseLibraryDevices,
  getLibraryDevices: () => libraryDevices,
  setBaseDevices: devices => { baseLibraryDevices = devices; },
  setLibraryDevices: devices => { libraryDevices = devices; },
  getDeviceEntries: () => deviceEntries,
  getReviews: () => saved.protectiveDeviceReviews,
  mergeReview: mergeProtectiveDeviceReview,
  assess: assessProtectiveDeviceLibraryEntry,
});

const BUTTON_READY_TITLES = new WeakMap();

setPlotAvailability(false);
updateCoordinationStatus('Choose devices and update the plot.');
renderEquipmentMetrics([], []);

updateViewButtonLabel();
updateCalloutScopeControl();

init();

const MIN_PICKUP = 0.01;
const MAX_PICKUP = 1e6;
const MIN_DELAY = 0.001;
const MAX_DELAY = 1e5;

function selectedDeviceIds() {
  return sortDeviceIdsForContext([...deviceSelect.selectedOptions].map(o => o.value));
}

function applySelectionSet(selection, { persist = false } = {}) {
  const chosen = Array.isArray(selection) ? selection : [...selection];
  const selectedSet = new Set(chosen);
  [...deviceSelect.options].forEach(opt => {
    opt.selected = selectedSet.has(opt.value);
  });
  renderSelectedSummary();
  renderSettings();
  renderOneLinePreview(getActiveComponentId());
  if (persist) {
    persistSettings();
  }
}

function renderSelectedSummary() {
  if (!selectedSummary) return;
  selectedSummary.innerHTML = '';
  const ids = selectedDeviceIds();
  if (deviceModalBtn) {
    deviceModalBtn.textContent = ids.length ? `${ids.length} Devices Selected` : 'Choose Devices';
  }
  if (!ids.length) {
    const empty = document.createElement('p');
    empty.className = 'selected-device-empty';
    empty.textContent = 'No devices selected.';
    selectedSummary.appendChild(empty);
    renderTccContextBanner();
    return;
  }
  const list = document.createElement('div');
  list.className = 'selected-device-list';
  list.setAttribute('role', 'list');
  const relationshipMap = getContextDeviceRelationshipMap();
  const summaryItems = ids.map(uid => ({
    uid,
    entry: deviceMap.get(uid),
    relationship: getDeviceRelationship(uid, relationshipMap)
  }));
  const contextItems = summaryItems.filter(item => item.relationship.role !== 'additional');
  const additionalItems = summaryItems.filter(item => item.relationship.role === 'additional');
  const visibleItems = contextItems.length ? contextItems : summaryItems.slice(0, 4);
  visibleItems.forEach(({ uid, entry, relationship }) => {
    const chip = document.createElement('span');
    chip.className = `selected-device-chip ${relationship.className}`;
    chip.dataset.contextRole = relationship.role;
    chip.setAttribute('role', 'listitem');
    const role = document.createElement('span');
    role.className = 'selected-device-role';
    role.textContent = relationship.label;
    const name = document.createElement('span');
    name.className = 'selected-device-name';
    name.textContent = entry ? entry.name : uid;
    chip.append(role, name);
    list.appendChild(chip);
  });
  const hiddenItems = contextItems.length ? additionalItems : summaryItems.slice(visibleItems.length);
  if (hiddenItems.length) {
    const chip = document.createElement('span');
    chip.className = 'selected-device-chip is-additional is-summary-chip';
    chip.dataset.contextRole = 'additional';
    chip.setAttribute('role', 'listitem');
    chip.title = hiddenItems
      .map(item => item.entry ? item.entry.name : item.uid)
      .join('\n');
    chip.setAttribute(
      'aria-label',
      `${hiddenItems.length} additional selected ${hiddenItems.length === 1 ? 'reference' : 'references'}: ${chip.title}`
    );
    const role = document.createElement('span');
    role.className = 'selected-device-role';
    role.textContent = 'Additional';
    const name = document.createElement('span');
    name.className = 'selected-device-name';
    name.textContent = hiddenItems.length === 1
      ? '1 equipment reference selected'
      : `${hiddenItems.length} equipment references selected`;
    chip.append(role, name);
    list.appendChild(chip);
  }
  selectedSummary.appendChild(list);
  renderTccContextBanner();
}

function positionHoverTooltip(event) {
  if (!hoverTooltip || !tccChartContainer) return;
  const containerRect = tccChartContainer.getBoundingClientRect();
  const tooltipRect = hoverTooltip.getBoundingClientRect();
  const clientPoint = getHoverClientPoint(event) || {
    clientX: containerRect.left + 16,
    clientY: containerRect.top + 16
  };
  const left = clampValue(clientPoint.clientX - containerRect.left + 14, 8, Math.max(8, containerRect.width - tooltipRect.width - 8));
  const top = clampValue(clientPoint.clientY - containerRect.top + 14, 8, Math.max(8, containerRect.height - tooltipRect.height - 8));
  hoverTooltip.style.left = `${left}px`;
  hoverTooltip.style.top = `${top}px`;
}

function showCurveHoverTooltip(event, entry, x, y, margin) {
  if (!hoverTooltip || !tccChartContainer || !entry || chart.classed('annotation-mode')) {
    hideCurveHoverTooltip();
    return;
  }
  const chartNode = chart.node();
  if (!chartNode) return;
  const [svgX, svgY] = d3.pointer(event, chartNode);
  const localX = svgX - margin.left;
  const localY = svgY - margin.top;
  if (localX < 0 || localY < 0) {
    hideCurveHoverTooltip();
    return;
  }
  const current = x.invert(localX);
  const point = findNearestCurvePoint(entry.scaled?.curve, current);
  if (!point) {
    hideCurveHoverTooltip();
    return;
  }
  const relationship = entry.relationship?.role !== 'additional' ? entry.relationship?.label : '';
  const deviceName = entry.selection?.name || entry.selection?.baseDevice?.name || 'Device';
  hoverTooltip.innerHTML = [
    `<strong>${escapeHtml(deviceName)}</strong>`,
    relationship ? `<span>${escapeHtml(relationship)}</span>` : '',
    `<span>I: ${escapeHtml(formatSettingValue(point.current))} A | t: ${escapeHtml(formatSettingValue(point.time))} s</span>`,
    `<span>${escapeHtml(formatHoverSettings(entry))}</span>`
  ].filter(Boolean).join('');
  hoverTooltip.classList.add('visible');
  hoverTooltip.setAttribute('aria-hidden', 'false');
  positionHoverTooltip(event);

  const nearestX = x(point.current);
  const nearestY = y(point.time);
  if (Number.isFinite(nearestX) && Number.isFinite(nearestY)) {
    hoverTooltip.dataset.current = formatSettingValue(point.current);
    hoverTooltip.dataset.time = formatSettingValue(point.time);
  }
}

function findNearestOverlayPoint(event, curve, x, margin) {
  if (!Array.isArray(curve) || !curve.length) return null;
  if (event?.type === 'focus') {
    return curve[Math.floor(curve.length / 2)] || null;
  }
  const chartNode = chart.node();
  if (!chartNode || !event) return null;
  const [svgX, svgY] = d3.pointer(event, chartNode);
  const localX = svgX - margin.left;
  const localY = svgY - margin.top;
  if (!Number.isFinite(localX) || !Number.isFinite(localY) || localX < 0 || localY < 0) return null;
  const current = x.invert(localX);
  return findNearestCurvePoint(curve, current);
}

function equipmentOverlayAriaLabel(entry) {
  return buildEquipmentOverlayAriaLabel(entry, {
    title: equipmentMetricTitle,
    rows: equipmentMetricRows
  });
}

function showEquipmentOverlayTooltip(event, entry, x, margin, curve = entry?.curve) {
  if (!hoverTooltip || !tccChartContainer || !entry || chart.classed('annotation-mode')) {
    hideCurveHoverTooltip();
    return;
  }
  const subtitle = [entry.sourceLabel, entry.targetLabel].filter(Boolean).join(' -> ');
  const rows = equipmentMetricRows(entry)
    .filter(row => row.value !== undefined && row.value !== null && row.value !== '')
    .map(row => `<span>${escapeHtml(row.label)}: ${escapeHtml(row.value)}</span>`);
  const point = entry.kind === 'inrush'
    ? {
      current: entry.current,
      time: entry.normalizedDuration ?? entry.duration ?? DEFAULT_INRUSH_DURATION
    }
    : findNearestOverlayPoint(event, curve, x, margin);
  const pointLabel = point && entry.kind !== 'inrush'
    ? `<span>Point: ${escapeHtml(formatMetricValue(point.current, 'A'))} @ ${escapeHtml(formatMetricValue(point.time, 's'))}</span>`
    : '';
  const overlayLabel = subtitle || entry.name || '';

  hoverTooltip.innerHTML = [
    `<strong>${escapeHtml(equipmentMetricTitle(entry))}</strong>`,
    overlayLabel ? `<span>${escapeHtml(overlayLabel)}</span>` : '',
    pointLabel,
    ...rows
  ].filter(Boolean).join('');
  hoverTooltip.classList.add('visible');
  hoverTooltip.setAttribute('aria-hidden', 'false');
  positionHoverTooltip(event);

  if (point) {
    hoverTooltip.dataset.current = formatSettingValue(point.current);
    hoverTooltip.dataset.time = formatSettingValue(point.time);
  }
}

function bindEquipmentOverlayTooltip(selection, entry, x, margin, curve) {
  return selection
    .attr('tabindex', 0)
    .attr('role', 'img')
    .attr('aria-label', equipmentOverlayAriaLabel(entry))
    .style('cursor', 'help')
    .on('mousemove', event => showEquipmentOverlayTooltip(event, entry, x, margin, curve))
    .on('click', event => {
      event.stopPropagation();
      showPinnedEquipmentDetail(event, entry, x, margin, curve);
    })
    .on('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      showPinnedEquipmentDetail(event, entry, x, margin, curve);
    })
    .on('mouseleave', hideCurveHoverTooltip)
    .on('focus', event => showEquipmentOverlayTooltip(event, entry, x, margin, curve))
    .on('blur', hideCurveHoverTooltip);
}


function clearPinnedChartDetail() {
  if (!pinnedDetailPanel) return;
  pinnedDetailPanel.innerHTML = '';
  pinnedDetailPanel.classList.add('hidden');
}

function renderPinnedChartDetail({ title, subtitle = '', rows = [], color = '', actions = '' }) {
  if (!pinnedDetailPanel) return;
  const detailRows = rows
    .filter(row => row && row.label && row.value !== undefined && row.value !== null && row.value !== '')
    .map(row => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`)
    .join('');
  const swatch = color
    ? `<span class="tcc-pinned-swatch" style="background:${escapeHtml(color)}"></span>`
    : '';
  pinnedDetailPanel.innerHTML = `
    <div class="tcc-pinned-detail-header">
      <div>
        <h3>${swatch}${escapeHtml(title || 'Chart Detail')}</h3>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <button type="button" class="tcc-pinned-close" aria-label="Close chart detail">Close</button>
    </div>
    <dl>${detailRows}</dl>
    ${actions}
  `;
  pinnedDetailPanel.classList.remove('hidden');
  pinnedDetailPanel.querySelector('.tcc-pinned-close')?.addEventListener('click', clearPinnedChartDetail, { once: true });
}

function curvePinnedRows(entry, point) {
  const rows = [];
  const relationship = entry?.relationship?.role !== 'additional' ? entry.relationship?.label : '';
  if (relationship) rows.push({ label: 'Role', value: relationship });
  if (point) {
    rows.push({ label: 'Current', value: formatMetricValue(point.current, 'A') });
    rows.push({ label: 'Time', value: formatMetricValue(point.time, 's') });
  }
  formatViewSummaries(entry).forEach(summary => {
    const [label, ...rest] = String(summary).split(':');
    rows.push({ label: label || 'Setting', value: rest.join(':').trim() || summary });
  });
  if (!rows.some(row => row.label === 'Settings')) {
    rows.push({ label: 'Settings', value: formatHoverSettings(entry) });
  }
  return rows;
}

function showPinnedCurveDetail(event, entry, x, margin) {
  if (!entry || chart.classed('annotation-mode')) return;
  hideCurveHoverTooltip();
  const chartNode = chart.node();
  if (!chartNode) return;
  let point = null;
  if (event?.type === 'focus' || event?.type === 'keydown') {
    const curve = entry.scaled?.curve || [];
    point = curve[Math.floor(curve.length / 2)] || curve[0] || null;
  } else {
    const [svgX] = d3.pointer(event, chartNode);
    const current = x.invert(svgX - margin.left);
    point = findNearestCurvePoint(entry.scaled?.curve, current);
  }
  const title = entry.selection?.name || entry.selection?.baseDevice?.name || 'Protective Device';
  renderPinnedChartDetail({
    title,
    rows: curvePinnedRows(entry, point),
    color: entry.color
  });
}

function showPinnedEquipmentDetail(event, entry, x, margin, curve = entry?.curve) {
  if (!entry || chart.classed('annotation-mode')) return;
  hideCurveHoverTooltip();
  const subtitle = [entry.sourceLabel, entry.targetLabel].filter(Boolean).join(' -> ');
  const point = entry.kind === 'inrush'
    ? {
      current: entry.current,
      time: entry.normalizedDuration ?? entry.duration ?? DEFAULT_INRUSH_DURATION
    }
    : findNearestOverlayPoint(event, curve, x, margin);
  const rows = [...equipmentMetricRows(entry)];
  if (point && entry.kind !== 'inrush') {
    rows.unshift({ label: 'Nearest Point', value: `${formatMetricValue(point.current, 'A')} at ${formatMetricValue(point.time, 's')}` });
  }
  renderPinnedChartDetail({
    title: equipmentMetricTitle(entry),
    subtitle: subtitle || entry.name || '',
    rows,
    color: entry.color,
    actions: equipmentAssumptionActions(entry)
  });
}
function persistAnnotations({ skipSetItem = false } = {}) {
  saved.annotations = annotations.map(exportAnnotation);
  if (!skipSetItem) {
    saved.viewOptions = [...activeViewOptions];
    saved.rangePreset = activeRangePreset;
    setItem('tccSettings', saved);
  }
}

function setButtonAvailability(button, available, disabledTitle, readyTitle = '') {
  if (!button) return;
  if (!BUTTON_READY_TITLES.has(button)) {
    BUTTON_READY_TITLES.set(button, readyTitle || button.getAttribute('title') || '');
  }
  button.disabled = !available;
  if (available) {
    const readyTitle = BUTTON_READY_TITLES.get(button) || '';
    if (readyTitle) {
      button.setAttribute('title', readyTitle);
    } else {
      button.removeAttribute('title');
    }
  } else if (disabledTitle) {
    button.setAttribute('title', disabledTitle);
  }
}

function updateCoordinationStatus(message, variant = 'neutral') {
  if (!coordStatusSummary) return;
  coordStatusSummary.textContent = message || '';
  coordStatusSummary.dataset.status = variant;
}

function setPlotButtonPending(pending) {
  if (!plotBtn) return;
  plotBtn.classList.toggle('plot-refresh-pending', !!pending);
  plotBtn.textContent = pending ? 'Updating Plot' : 'Update Plot';
}

function markPlotDirty(message = 'Inputs changed. Update Plot to refresh the chart.') {
  plotRefreshPending = false;
  setPlotButtonPending(false);
  setPlotAvailability(false);
  updateCoordinationStatus(message, 'warning');
}

function markPlotRefreshPending(message = 'Inputs changed. Updating plot...') {
  plotRefreshPending = true;
  setPlotAvailability(false);
  setPlotButtonPending(true);
  updateCoordinationStatus(message, 'pending');
}

function clearPlotRefreshPending() {
  plotRefreshPending = false;
  setPlotButtonPending(false);
}

function markCoordinationStale() {
  if (!activePlotted || !activePlotted.length) return;
  lastCoordState = null;
  exportCtiBtn?.classList.add('hidden');
  if (activeCoordMarkerDrawer) activeCoordMarkerDrawer(null, []);
  updateCoordinationStatus('Coordination margin changed. Run Auto-Coordinate again to refresh margin results.', 'warning');
}

function hideCurveHoverTooltip() {
  if (!hoverTooltip) return;
  hoverTooltip.classList.remove('visible');
  hoverTooltip.setAttribute('aria-hidden', 'true');
}

function setPlotAvailability(available) {
  setButtonAvailability(printPlotBtn, available, 'Update the plot before printing.', 'Print the current TCC plot.');
  setButtonAvailability(exportSvgBtn, available, 'Update the plot before exporting SVG.');
  setButtonAvailability(exportPngBtn, available, 'Update the plot before exporting PNG.');
  setButtonAvailability(exportReviewBtn, available, 'Update the plot before exporting the review package.', 'Download the current chart, one-line preview, metrics, and coordination summary as HTML.');
  setButtonAvailability(annotationBtn, available, 'Update the plot before adding annotations.', 'Add an annotation to the current plot.');
  if (!available) {
    disableAnnotationMode();
    hideCurveHoverTooltip();
  }
  setButtonAvailability(exportRelaySettingsBtn, available, 'Update the plot before exporting relay settings.', 'Download vendor-native relay configuration files and manifest CSV.');
}

function enableAnnotationMode() {
  if (!annotationBtn || annotationBtn.disabled) return;
  if (!annotationContext) return;
  annotationMode = true;
  annotationBtn.textContent = ANNOTATION_ACTIVE_LABEL;
  annotationBtn.setAttribute('aria-pressed', 'true');
  chart.classed('annotation-mode', true);
}

function disableAnnotationMode() {
  annotationMode = false;
  if (annotationBtn) {
    annotationBtn.textContent = annotationBtnDefaultLabel;
    annotationBtn.setAttribute('aria-pressed', 'false');
  }
  chart.classed('annotation-mode', false);
}

function editAnnotation(datum) {
  if (!datum) return;
  const updated = window.prompt('Edit annotation text (leave blank to remove):', datum.text);
  if (updated === null) return;
  const trimmed = updated.trim();
  if (!trimmed) {
    deleteAnnotation(datum.id);
    return;
  }
  datum.text = trimmed;
  persistAnnotations();
  renderAnnotations();
}

function deleteAnnotation(annotationId) {
  if (!annotationId) return;
  const initialLength = annotations.length;
  annotations = annotations.filter(item => item.id !== annotationId);
  if (annotations.length !== initialLength) {
    persistAnnotations();
    renderAnnotations();
  }
}

function buildAnnotationContextItems(datum) {
  if (!datum) return [];
  return [
    {
      label: 'Edit Annotation',
      onSelect: () => editAnnotation(datum)
    },
    {
      label: 'Delete Annotation',
      onSelect: () => deleteAnnotation(datum.id)
    }
  ];
}

function findSettingsDeviceDiv(uid) {
  if (!settingsDiv || uid === undefined || uid === null) return null;
  const expected = String(uid);
  const nodes = settingsDiv.querySelectorAll('.device-settings[data-uid]');
  for (const node of nodes) {
    if (node.dataset.uid === expected) return node;
  }
  return null;
}

function focusDeviceSettings(uid) {
  if (!settingsDiv || !uid) return;
  const target = findSettingsDeviceDiv(uid);
  if (!target) return;
  target.classList.add('device-settings-highlight');
  const removeHighlight = () => target.classList.remove('device-settings-highlight');
  setTimeout(removeHighlight, 1800);
  const previousTabIndex = target.getAttribute('tabindex');
  target.setAttribute('tabindex', '-1');
  try {
    target.focus({ preventScroll: true });
  } catch (err) {
    // Ignore focus errors
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    if (previousTabIndex !== null) {
      target.setAttribute('tabindex', previousTabIndex);
    } else {
      target.removeAttribute('tabindex');
    }
  }, 200);
}

function removeDeviceFromSelection(uid) {
  if (!uid) return;
  const current = selectedDeviceIds();
  if (!current.includes(uid)) return;
  const updated = current.filter(id => id !== uid);
  applySelectionSet(updated, { persist: true });
  if (updated.length) {
    plot();
  } else {
    chart.selectAll('*').remove();
    violationDiv.textContent = '';
    setPlotAvailability(false);
  }
}

function buildCurveContextItems(entry) {
  if (!entry || !entry.selection) return [];
  const selection = entry.selection;
  const items = [];
  if (selection.uid && settingsDiv) {
    items.push({
      label: 'Focus Device Settings',
      onSelect: () => focusDeviceSettings(selection.uid)
    });
  }
  if (selection.kind === 'component' && selection.componentId) {
    items.push({
      label: 'Set as Active Component',
      onSelect: () => setActiveComponent(selection.componentId, { preserveSelection: true })
    });
    items.push({
      label: 'Open in One-Line',
      onSelect: () => {
        openOneLineProbe(
          { componentId: selection.componentId, probeType: 'tcc' },
          { probeType: 'tcc', newTab: true }
        );
      }
    });
  } else if (selection.kind === 'library') {
    const targetId = getActiveComponentId() || activeComponentId || compId;
    items.push({
      label: 'Assign to Active Component',
      disabled: !targetId,
      onSelect: () => linkComponent(selection)
    });
    if (selection.isCustom && selection.customCurveId) {
      items.push({
        label: 'Edit Custom Curve',
        onSelect: () => openCustomCurveBuilder(selection.customCurveId)
      });
      items.push({
        label: 'Delete Custom Curve',
        onSelect: () => confirmCustomCurveRemoval(selection)
      });
    }
  }
  if (selection.uid) {
    items.push({
      label: 'Remove from Plot',
      onSelect: () => removeDeviceFromSelection(selection.uid)
    });
  }
  return items;
}

function showCurveContextMenu(event, entry) {
  contextMenu.show(event, buildCurveContextItems(entry));
}

function defaultAnnotationOffsets(xPos, yPos, width, height) {
  const horizontal = xPos > width * 0.7 ? -60 : 60;
  const vertical = yPos < height * 0.3 ? 40 : -40;
  return { offsetX: horizontal, offsetY: vertical };
}

function ensureAnnotationOffsets(datum, anchorX, anchorY, width, height) {
  if (!Number.isFinite(datum.offsetX) || !Number.isFinite(datum.offsetY)) {
    const defaults = defaultAnnotationOffsets(anchorX, anchorY, width, height);
    datum.offsetX = defaults.offsetX;
    datum.offsetY = defaults.offsetY;
  }
  return { offsetX: datum.offsetX, offsetY: datum.offsetY };
}

function positionAnnotation(group, datum) {
  if (!annotationContext) return;
  const { x, y, width, height } = annotationContext;
  const anchorX = x(datum.current);
  const anchorY = y(datum.time);
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
    group.attr('display', 'none');
    return;
  }
  group.attr('display', null);
  const offsets = ensureAnnotationOffsets(datum, anchorX, anchorY, width, height);
  const labelX = anchorX + offsets.offsetX;
  const labelY = anchorY + offsets.offsetY;
  group.select('line.annotation-connector')
    .attr('x1', anchorX)
    .attr('y1', anchorY)
    .attr('x2', labelX)
    .attr('y2', labelY)
    .attr('stroke', '#444')
    .attr('stroke-width', 1.5);
  group.select('circle.annotation-anchor')
    .attr('cx', anchorX)
    .attr('cy', anchorY)
    .attr('r', 4)
    .attr('fill', '#fff')
    .attr('stroke', '#444')
    .attr('stroke-width', 1.5);
  const label = group.select('g.annotation-label')
    .attr('transform', `translate(${labelX},${labelY})`);
  const text = label.select('text.annotation-text')
    .text(datum.text)
    .attr('fill', '#111')
    .attr('font-size', 12);
  const textNode = text.node();
  if (textNode) {
    const bbox = textNode.getBBox();
    const paddingX = 6;
    const paddingY = 4;
    label.select('rect.annotation-label-bg')
      .attr('x', bbox.x - paddingX)
      .attr('y', bbox.y - paddingY)
      .attr('width', bbox.width + paddingX * 2)
      .attr('height', bbox.height + paddingY * 2)
      .attr('fill', '#fff')
      .attr('stroke', '#444')
      .attr('stroke-width', 1);
  }
}

function annotationDragFilter(event) {
  if (annotationMode) return false;
  const src = event?.sourceEvent || event;
  if (src && typeof src.button === 'number' && src.button !== 0) {
    return false;
  }
  return true;
}

function handleAnnotationDragStart(event, datum) {
  if (!annotationContext || !annotationContext.g) return;
  const { x, y, width, height, g } = annotationContext;
  const anchorX = x(datum.current);
  const anchorY = y(datum.time);
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) return;
  const pointerEvent = event && event.sourceEvent ? event.sourceEvent : event;
  const pointer = d3.pointer(pointerEvent, g.node());
  const offsets = ensureAnnotationOffsets(datum, anchorX, anchorY, width, height);
  datum[ANNOTATION_DRAG_STATE] = {
    mode: 'label',
    startPointerX: pointer[0],
    startPointerY: pointer[1],
    baseOffsetX: offsets.offsetX,
    baseOffsetY: offsets.offsetY
  };
  if (event.sourceEvent) {
    if (typeof event.sourceEvent.stopPropagation === 'function') {
      event.sourceEvent.stopPropagation();
    }
    if (typeof event.sourceEvent.preventDefault === 'function') {
      event.sourceEvent.preventDefault();
    }
  }
}

function handleAnnotationDrag(event, datum) {
  if (!annotationContext || !annotationContext.g) return;
  const state = datum[ANNOTATION_DRAG_STATE];
  if (!state || state.mode !== 'label') return;
  const pointerEvent = event && event.sourceEvent ? event.sourceEvent : event;
  const pointer = d3.pointer(pointerEvent, annotationContext.g.node());
  const dx = pointer[0] - state.startPointerX;
  const dy = pointer[1] - state.startPointerY;
  datum.offsetX = state.baseOffsetX + dx;
  datum.offsetY = state.baseOffsetY + dy;
  const group = d3.select(this.parentNode);
  if (group.empty()) return;
  positionAnnotation(group, datum);
}

function handleAnnotationDragEnd(event, datum) {
  const state = datum[ANNOTATION_DRAG_STATE];
  if (!state || state.mode !== 'label') return;
  delete datum[ANNOTATION_DRAG_STATE];
  persistAnnotations();
  renderAnnotations();
}

const annotationDragBehavior = d3.drag()
  .filter(annotationDragFilter)
  .on('start', handleAnnotationDragStart)
  .on('drag', handleAnnotationDrag)
  .on('end', handleAnnotationDragEnd);

function clampToDomain(value, domain) {
  if (!Number.isFinite(value)) return value;
  if (!Array.isArray(domain) || domain.length < 2) return value;
  const [a, b] = domain;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function handleAnnotationAnchorDragStart(event, datum) {
  if (!annotationContext || !annotationContext.g) return;
  datum[ANNOTATION_DRAG_STATE] = { mode: 'anchor' };
  if (event.sourceEvent) {
    if (typeof event.sourceEvent.stopPropagation === 'function') {
      event.sourceEvent.stopPropagation();
    }
    if (typeof event.sourceEvent.preventDefault === 'function') {
      event.sourceEvent.preventDefault();
    }
  }
}

function handleAnnotationAnchorDrag(event, datum) {
  if (!annotationContext || !annotationContext.g) return;
  const state = datum[ANNOTATION_DRAG_STATE];
  if (!state || state.mode !== 'anchor') return;
  const { g, x, y, width, height } = annotationContext;
  const pointerEvent = event && event.sourceEvent ? event.sourceEvent : event;
  const pointer = d3.pointer(pointerEvent, g.node());
  if (!pointer) return;
  let [mx, my] = pointer;
  mx = Math.max(0, Math.min(width, mx));
  my = Math.max(0, Math.min(height, my));
  const current = clampToDomain(x.invert(mx), x.domain());
  const time = clampToDomain(y.invert(my), y.domain());
  if (!Number.isFinite(current) || !Number.isFinite(time) || current <= 0 || time <= 0) {
    return;
  }
  datum.current = current;
  datum.time = time;
  const group = d3.select(this.parentNode);
  if (!group.empty()) {
    positionAnnotation(group, datum);
  }
}

function handleAnnotationAnchorDragEnd(event, datum) {
  const state = datum[ANNOTATION_DRAG_STATE];
  if (!state || state.mode !== 'anchor') return;
  delete datum[ANNOTATION_DRAG_STATE];
  persistAnnotations();
  renderAnnotations();
}

const annotationAnchorDragBehavior = d3.drag()
  .filter(annotationDragFilter)
  .on('start', handleAnnotationAnchorDragStart)
  .on('drag', handleAnnotationAnchorDrag)
  .on('end', handleAnnotationAnchorDragEnd);

function renderAnnotations() {
  if (!annotationContext || !annotationContext.layer) return;
  const { layer, x, y, width, height } = annotationContext;
  const selection = layer.selectAll('g.annotation').data(annotations, d => d.id);
  selection.exit().remove();
  const entered = selection.enter().append('g').attr('class', 'annotation');
  entered.append('line').attr('class', 'annotation-connector');
  entered.append('circle').attr('class', 'annotation-anchor').attr('r', 4);
  const labelGroup = entered.append('g').attr('class', 'annotation-label');
  labelGroup.append('rect').attr('class', 'annotation-label-bg').attr('rx', 4).attr('ry', 4);
  labelGroup.append('text')
    .attr('class', 'annotation-text')
    .attr('x', 0)
    .attr('y', 0)
    .attr('dominant-baseline', 'hanging');
  const merged = entered.merge(selection);
  merged.style('cursor', 'pointer');
  merged.select('g.annotation-label')
    .style('cursor', 'move')
    .call(annotationDragBehavior);
  merged.select('circle.annotation-anchor')
    .style('cursor', 'move')
    .call(annotationAnchorDragBehavior);
  merged.select('line.annotation-connector')
    .style('cursor', 'move')
    .call(annotationAnchorDragBehavior);
  merged.on('dblclick', (event, datum) => {
    event.stopPropagation();
    event.preventDefault();
    editAnnotation(datum);
  });
  merged.on('contextmenu', (event, datum) => {
    event.preventDefault();
    event.stopPropagation();
    contextMenu.show(event, buildAnnotationContextItems(datum));
  });
  merged.each(function renderAnnotation(datum) {
    const group = d3.select(this);
    positionAnnotation(group, datum);
  });
}

function handleAnnotationPlacement(event) {
  if (!annotationMode || !annotationContext) return;
  event.preventDefault();
  event.stopPropagation();
  const { g, x, y, width, height } = annotationContext;
  const pointer = d3.pointer(event, g.node());
  if (!pointer) {
    disableAnnotationMode();
    return;
  }
  const [mx, my] = pointer;
  if (mx < 0 || mx > width || my < 0 || my > height) {
    disableAnnotationMode();
    return;
  }
  const current = x.invert(mx);
  const time = y.invert(my);
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(time) || time <= 0) {
    disableAnnotationMode();
    return;
  }
  const response = window.prompt('Enter annotation text:', '');
  if (response === null) {
    disableAnnotationMode();
    return;
  }
  const trimmed = response.trim();
  if (!trimmed) {
    disableAnnotationMode();
    return;
  }
  const offsets = defaultAnnotationOffsets(mx, my, width, height);
  const annotation = {
    id: createAnnotationId(),
    current,
    time,
    text: trimmed,
    offsetX: offsets.offsetX,
    offsetY: offsets.offsetY
  };
  annotations = [...annotations, annotation];
  persistAnnotations();
  renderAnnotations();
  disableAnnotationMode();
}


async function handlePrintPlot() {
  if (!printPlotBtn || printPlotBtn.disabled) return;
  if (!chart || !chart.node()) return;

  const initialHeader = typeof saved.printHeader === 'string' ? saved.printHeader : '';
  const initialFooter = typeof saved.printFooter === 'string' ? saved.printFooter : '';
  const initialIncludePreview = saved.printIncludePreview === true;
  let headerInputEl = null;
  let footerInputEl = null;
  let includePreviewEl = null;

  const modalResult = await openModal({
    title: 'Print Plot',
    description: 'Enter header and footer text for the printout and choose whether to include the one-line preview.',
    primaryText: 'Print',
    secondaryText: 'Cancel',
    closeOnBackdrop: true,
    render(container, controller) {
      const doc = container.ownerDocument || document;
      const form = doc.createElement('form');
      form.className = 'print-settings-form';
      form.noValidate = true;

      const headerLabel = doc.createElement('label');
      headerLabel.className = 'print-settings-field';
      headerLabel.append('Header');
      headerInputEl = doc.createElement('input');
      headerInputEl.type = 'text';
      headerInputEl.id = 'tcc-print-header-input';
      headerInputEl.placeholder = DEFAULT_PRINT_HEADER;
      headerInputEl.value = initialHeader;
      headerLabel.appendChild(headerInputEl);

      const footerLabel = doc.createElement('label');
      footerLabel.className = 'print-settings-field';
      footerLabel.append('Footer');
      footerInputEl = doc.createElement('input');
      footerInputEl.type = 'text';
      footerInputEl.id = 'tcc-print-footer-input';
      footerInputEl.placeholder = DEFAULT_PRINT_FOOTER;
      footerInputEl.value = initialFooter;
      footerLabel.appendChild(footerInputEl);

      const previewToggle = doc.createElement('label');
      previewToggle.className = 'print-settings-toggle';
      includePreviewEl = doc.createElement('input');
      includePreviewEl.type = 'checkbox';
      includePreviewEl.checked = initialIncludePreview;
      previewToggle.append(includePreviewEl, ' Include one-line preview');

      form.append(headerLabel, footerLabel, previewToggle);
      container.appendChild(form);
      if (controller && typeof controller.registerForm === 'function') {
        controller.registerForm(form);
      }
      if (controller && typeof controller.setInitialFocus === 'function') {
        controller.setInitialFocus(headerInputEl);
      }
      return headerInputEl;
    },
    onSubmit() {
      if (!headerInputEl || !footerInputEl || !includePreviewEl) {
        return false;
      }
      const headerValue = headerInputEl.value.trim();
      const footerValue = footerInputEl.value.trim();
      const includePreview = includePreviewEl.checked;
      saved.printHeader = headerValue;
      saved.printFooter = footerValue;
      saved.printIncludePreview = includePreview;
      saved.viewOptions = [...activeViewOptions];
      saved.rangePreset = activeRangePreset;
      setItem('tccSettings', saved);
      return { header: headerValue, footer: footerValue, includePreview };
    }
  });

  if (!modalResult) return;

  const svgNode = chart.node().cloneNode(true);
  if (!svgNode) return;
  if (!svgNode.getAttribute('xmlns')) {
    svgNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  const serializer = new XMLSerializer();
  const markup = serializer.serializeToString(svgNode);
  const headerText = typeof modalResult.header === 'string' ? modalResult.header : '';
  const footerText = typeof modalResult.footer === 'string' ? modalResult.footer : '';
  let previewMarkup = '';
  if (modalResult.includePreview) {
    if (onelinePreviewSvgEl && !onelinePreviewSvgEl.classList.contains('hidden')) {
      const previewNode = onelinePreviewSvgEl.cloneNode(true);
      previewNode.classList.remove('hidden');
      previewNode.removeAttribute('id');
      if (!previewNode.getAttribute('xmlns')) {
        previewNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      previewMarkup = serializer.serializeToString(previewNode);
    } else {
      previewMarkup = '<p class="print-preview-empty">No one-line preview available for the current selection.</p>';
    }
  }
  const html = buildPrintMarkup(markup, headerText, footerText, { previewMarkup });
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function buildExportSvgNode() {
  if (!chart || !chart.node()) return null;
  const svgNode = chart.node().cloneNode(true);
  if (!svgNode.getAttribute('xmlns')) {
    svgNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  // Strip interactive-only crosshair elements — meaningless in a static export.
  svgNode.querySelectorAll('.tcc-crosshair').forEach(el => el.remove());
  // Inline annotation styles so the SVG is self-contained.
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = EXPORT_INLINE_STYLES;
  svgNode.insertBefore(styleEl, svgNode.firstChild);
  return svgNode;
}

function handleExportSVG() {
  if (!exportSvgBtn || exportSvgBtn.disabled) return;
  const svgNode = buildExportSvgNode();
  if (!svgNode) return;
  const serializer = new XMLSerializer();
  const markup = buildSvgDownloadMarkup(serializer.serializeToString(svgNode));
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = SVG_DOWNLOAD_FILENAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

function handleExportPNG() {
  if (!exportPngBtn || exportPngBtn.disabled) return;
  const svgNode = buildExportSvgNode();
  if (!svgNode) return;
  const svgWidth = parseInt(svgNode.getAttribute('width') || '800', 10);
  const svgHeight = parseInt(svgNode.getAttribute('height') || '600', 10);
  const { canvasWidth, canvasHeight } = computeCanvasDimensions(svgWidth, svgHeight);
  const serializer = new XMLSerializer();
  const svgMarkup = serializer.serializeToString(svgNode);
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((pngBlob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(pngBlob);
      a.download = PNG_DOWNLOAD_FILENAME;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 0);
    }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(svgUrl);
  img.src = svgUrl;
}

function serializeReviewNode(node, { removeIds = true } = {}) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  if (removeIds) {
    clone.querySelectorAll?.('[id]').forEach(el => el.removeAttribute('id'));
    if (clone.removeAttribute) clone.removeAttribute('id');
  }
  return clone.outerHTML || '';
}


function handleExportReview() {
  if (!exportReviewBtn || exportReviewBtn.disabled) return;
  const svgNode = buildExportSvgNode();
  if (!svgNode) return;
  const serializer = new XMLSerializer();
  const chartMarkup = serializer.serializeToString(svgNode);
  let previewMarkup = '';
  if (onelinePreviewSvgEl && !onelinePreviewSvgEl.classList.contains('hidden')) {
    const previewNode = onelinePreviewSvgEl.cloneNode(true);
    previewNode.removeAttribute('id');
    if (!previewNode.getAttribute('xmlns')) {
      previewNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    previewMarkup = serializer.serializeToString(previewNode);
  }
  const metricsMarkup = equipmentMetricsPanel && !equipmentMetricsPanel.classList.contains('hidden')
    ? serializeReviewNode(equipmentMetricsPanel)
    : '';
  const coordinationMarkup = coordPanel && !coordPanel.classList.contains('hidden')
    ? serializeReviewNode(coordPanel)
    : '';
  const rangeLabel = getTccRangePreset(activeRangePreset)?.label || 'Full Range';
  const html = buildReviewExportMarkup({
    chartMarkup,
    previewMarkup,
    metricsMarkup,
    coordinationMarkup,
    statusText: coordStatusSummary?.textContent || '',
    rangeLabel
  });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tcc-review-package.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
function readOverrideFromInput(input) {
  const field = input.dataset.field;
  if (!field) return null;
  const raw = input.value;
  const defaultRaw = input.dataset.defaultValue ?? '';
  const valueType = input.dataset.valueType || (input.tagName === 'SELECT' ? 'string' : 'number');
  if (valueType === 'number') {
    if (raw === '') return null;
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    if (defaultRaw !== '') {
      const defaultNum = Number(defaultRaw);
      if (Number.isFinite(defaultNum) && Math.abs(num - defaultNum) < 1e-9) {
        return null;
      }
    }
    return { field, value: num };
  }
  if (valueType === 'string') {
    if (!raw) return null;
    if (raw === defaultRaw) return null;
    return { field, value: raw };
  }
  return null;
}

function collectOverridesFromDiv(div) {
  const overrides = {};
  div.querySelectorAll('[data-field]').forEach(input => {
    const result = readOverrideFromInput(input);
    if (result) overrides[result.field] = result.value;
  });
  return overrides;
}

function updateEntryOverrideFromControl(entry, control) {
  if (!entry || !control || !control.dataset) return;
  const field = control.dataset.field;
  if (!field) return;
  const result = readOverrideFromInput(control);
  const overrides = { ...(entry.overrideSource || {}) };
  if (result && result.value !== undefined && result.value !== null) {
    overrides[result.field] = result.value;
  } else {
    delete overrides[field];
  }
  entry.overrideSource = overrides;
}

function refreshCatalog({
  preserveSelection = false,
  includeComponentContext = !preserveSelection,
  includeDeviceParam = !preserveSelection,
  resetSelection = false
} = {}) {
  const previousSelection = preserveSelection && !resetSelection ? new Set(selectedDeviceIds()) : new Set();
  buildComponentData();
  rebuildCatalog();
  const contextId = getActiveComponentId();
  const selection = resolveCatalogSelection({
    entries: deviceEntries,
    savedDeviceIds: saved.devices || [],
    previousSelection,
    preserveSelection,
    resetSelection,
    includeComponentContext,
    contextComponentUid: contextId ? componentDeviceMap.get(contextId)?.uid : '',
    neighborDeviceIds: contextId ? collectNeighborDeviceDefaults(contextId) : [],
    includeDeviceParam,
    deviceParam,
  });
  applySelectionSet(selection);
  saved.devices = selection;
  persistAnnotations({ skipSetItem: true });
  saved.viewOptions = [...activeViewOptions];
  saved.rangePreset = activeRangePreset;
  setItem('tccSettings', saved);
  return selection;
}

function setActiveComponent(componentId, { preserveSelection = false } = {}) {
  const normalized = componentId && componentLookup.has(componentId)
    ? componentId
    : null;
  activeComponentId = normalized;
  updateComponentContextUI();
  renderOneLinePreview(normalized);
  if (!preserveSelection) {
    saved.devices = [];
  }
  const selection = refreshCatalog({
    preserveSelection,
    includeComponentContext: true,
    includeDeviceParam: true
  });
  renderSettings();
  if (deviceSelect && deviceSelect.selectedOptions.length && selection.length) {
    plot();
  }
  return selection;
}
async function updateShortCircuitStudy() {
  const oneLine = getOneLine();
  const projectDevices = libraryDevices.filter(device => !device.catalogShard);
  const deviceCatalog = await loadReferencedProtectiveDevices(oneLine, { catalog: protectiveDeviceCatalog, additionalDevices: projectDevices }).catch(() => projectDevices);
  const sc = runShortCircuit({ deviceCatalog });
  const studies = getStudies();
  studies.shortCircuit = sc;
  setStudies(studies);
  return sc;
}
function refreshProjectCatalogDevices() {
  const projectDevices = (getTrayHardwareCatalogCustomProducts() || [])
    .map(normalizeCatalogProtectiveDevice)
    .filter(Boolean);
  const identities = new Set(baseLibraryDevices.map(device => device.id));
  const applySavedReview = device => {
    const review = saved.protectiveDeviceReviews?.[device.id];
    return review ? mergeProtectiveDeviceReview(device, review) : device;
  };
  libraryDevices = baseLibraryDevices.map(applySavedReview);
  projectDevices.forEach((device) => {
    if (!identities.has(device.id)) {
      identities.add(device.id);
      libraryDevices.push(applySavedReview(device));
    }
  });
  return projectDevices.length;
}

async function init() {
  try {
    const list = await protectiveDeviceCatalog.loadIndex();
    baseLibraryDevices = Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('Failed to load device data', e);
    showAlertModal('Library Error', 'Protective device data could not be loaded. Some device catalog features may be limited.');
    baseLibraryDevices = [];
  }
  refreshProjectCatalogDevices();

  const initialSelection = refreshCatalog({
    includeComponentContext: true,
    includeDeviceParam: true,
    resetSelection: resetToAdjacentContext
  });

  renderOneLinePreview(getActiveComponentId());

  updateShortCircuitStudy();

  if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && initialSelection.length) {
    plot();
  }

  on(STORAGE_KEYS.oneLine, () => {
    const selection = refreshCatalog({ preserveSelection: true });
    updateShortCircuitStudy();
    renderOneLinePreview(getActiveComponentId());
    if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && selection.length) {
      plot();
    }
  });

  on(STORAGE_KEYS.cables, () => {
    const selection = refreshCatalog({ preserveSelection: true, includeComponentContext: true });
    if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && selection.length) {
      plot();
    }
  });

  on('scenario', () => {
    saved = loadSavedSettings();
    activeViewOptions = normalizeViewOptionList(saved.viewOptions);
    saved.viewOptions = [...activeViewOptions];
    activeRangePreset = normalizeRangePreset(saved.rangePreset);
    saved.rangePreset = activeRangePreset;
    if (rangePresetSelect) rangePresetSelect.value = activeRangePreset;
    activeCalloutScope = normalizeCalloutScope(saved.calloutScope);
    saved.calloutScope = activeCalloutScope;
    if (calloutScopeSelect) calloutScopeSelect.value = activeCalloutScope;
    annotations = (saved.annotations || []).map(sanitizeAnnotation).filter(Boolean);
    saved.annotations = annotations.map(exportAnnotation);
    renderAnnotations();
    updateViewButtonLabel();
    updateCalloutScopeControl();
    refreshProjectCatalogDevices();
    const selection = refreshCatalog({ includeComponentContext: true, includeDeviceParam: true });
    updateShortCircuitStudy();
    renderOneLinePreview(getActiveComponentId());
    if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && selection.length) {
      plot();
    }
  });
}

function selectDefaults(ids) {
  const valid = [...ids].filter(id => deviceMap.has(id));
  applySelectionSet(valid);
  saved.devices = valid;
  persistAnnotations({ skipSetItem: true });
  saved.viewOptions = [...activeViewOptions];
  saved.rangePreset = activeRangePreset;
  setItem('tccSettings', saved);
}

function buildComponentData() {
  const { sheets } = getOneLine();
  const records = [];
  const lookup = new Map();
  const neighbors = new Map();
  const connections = new Map();
  const flow = createDirectedConnectionMap();
  (sheets || []).forEach((sheet, idx) => {
    const sheetName = sheet?.name || `Sheet ${idx + 1}`;
    (sheet?.components || []).forEach(comp => {
      records.push({ component: comp, sheetName, sheetIndex: idx, sheet });
      lookup.set(comp.id, { component: comp, sheetName, sheetIndex: idx, sheet });
      neighbors.set(comp.id, new Set());
      connections.set(comp.id, []);
      if (comp.id) flow.set(String(comp.id), { upstream: new Set(), downstream: new Set() });
    });
    (sheet?.connections || []).forEach(conn => {
      if (!conn) return;
      const from = conn.from ?? conn.source ?? conn.a ?? conn.start ?? null;
      const to = conn.to ?? conn.target ?? conn.b ?? conn.end ?? null;
      if (!from || !to) return;
      if (!lookup.has(from) || !lookup.has(to)) return;
      neighbors.get(from)?.add(to);
      neighbors.get(to)?.add(from);
      const sourceRecord = lookup.get(from);
      const targetRecord = lookup.get(to);
      if (!sourceRecord || !targetRecord) return;
      addDirectedConnection(flow, from, to);
      connections.get(from)?.push({ conn, source: sourceRecord.component, target: targetRecord.component });
      connections.get(to)?.push({ conn, source: targetRecord.component, target: sourceRecord.component });
    });
  });
  records.forEach(({ component }) => {
    (component.connections || []).forEach(conn => {
      if (!lookup.has(conn.target)) return;
      neighbors.get(component.id)?.add(conn.target);
      neighbors.get(conn.target)?.add(component.id);
      const targetRecord = lookup.get(conn.target);
      if (!targetRecord) return;
      addDirectedConnection(flow, component.id, conn.target);
      connections.get(component.id)?.push({ conn, source: component, target: targetRecord.component });
      connections.get(conn.target)?.push({ conn, source: targetRecord.component, target: component });
    });
  });
  componentRecords = records;
  componentLookup = lookup;
  neighborMap = neighbors;
  connectionIndex = connections;
  componentFlowMap = flow;
  if (activeComponentId && !componentLookup.has(activeComponentId)) {
    activeComponentId = null;
    updateComponentContextUI();
  }
  renderOneLinePreview(getActiveComponentId());
}

function rebuildCatalog() {
  deviceEntries = [];
  deviceMap = new Map();
  deviceGroups = [];

  const componentEntries = buildComponentEntries();
  const customEntries = buildCustomCurveEntries();
  const libraryEntries = buildLibraryEntries();
  const projectCatalogEntries = libraryEntries.filter(entry => entry.baseDevice?.projectCatalog === true);
  const bundledLibraryEntries = libraryEntries.filter(entry => entry.baseDevice?.projectCatalog !== true);
  const fuseEntries = bundledLibraryEntries.filter(entry => (entry.baseDevice?.type || entry.deviceType) === 'fuse');
  const otherLibraryEntries = bundledLibraryEntries.filter(entry => (entry.baseDevice?.type || entry.deviceType) !== 'fuse');
  const gfpEntries = buildGFPLibraryEntries();
  const overlayEntries = buildOverlayEntries();

  if (componentEntries.length) {
    deviceGroups.push({ id: 'oneline', label: 'One-Line Devices', items: componentEntries });
  }
  if (customEntries.length) {
    deviceGroups.push({ id: 'customCurves', label: 'Custom Curves', items: customEntries });
  }
  if (otherLibraryEntries.length) {
    deviceGroups.push({ id: 'library', label: 'Library Devices', items: otherLibraryEntries });
  }
  if (fuseEntries.length) {
    deviceGroups.push({ id: 'fuses', label: 'Fuse Library', items: fuseEntries });
  }
  if (projectCatalogEntries.length) {
    deviceGroups.push({ id: 'projectCatalog', label: 'Project Catalog Devices', items: projectCatalogEntries });
  }
  if (gfpEntries.length) {
    deviceGroups.push({ id: 'gfpRelays', label: 'Ground Fault Relays (GFP)', items: gfpEntries });
  }
  if (overlayEntries.length) {
    deviceGroups.push({ id: 'overlays', label: 'Connected Elements', items: overlayEntries });
  }

  deviceEntries = deviceGroups.flatMap(group => group.items);
  componentDeviceMap = new Map();
  deviceEntries.forEach(entry => {
    deviceMap.set(entry.uid, entry);
    if (entry.kind === 'component' && entry.componentId) {
      componentDeviceMap.set(entry.componentId, entry);
    }
  });

  renderDeviceList();
}

function deviceHasCurveData(device) {
  if (!device || typeof device !== 'object') return false;
  const curve = device.curve;
  if (Array.isArray(curve) && curve.some(point => point && (point.current !== undefined || point.time !== undefined))) {
    return curve.length > 0;
  }
  const profiles = device.curveProfiles;
  if (Array.isArray(profiles)) {
    return profiles.some(profile => Array.isArray(profile?.curve) && profile.curve.length);
  }
  if (profiles && typeof profiles === 'object') {
    return Object.values(profiles).some(profile => Array.isArray(profile?.curve) && profile.curve.length);
  }
  return false;
}

function describeComponentPlotAvailability(component, baseDevice) {
  if (!component) {
    return 'This component could not be found in the one-line diagram.';
  }
  const typeKey = component.type || component.subtype || baseDevice?.type || '';
  const normalizedType = typeof component.type === 'string' ? component.type.toLowerCase() : '';
  const normalizedSubtype = typeof component.subtype === 'string' ? component.subtype.toLowerCase() : '';
  const normalizedBase = typeof baseDevice?.type === 'string' ? baseDevice.type.toLowerCase() : '';
  const isMotor = MOTOR_TYPES.has(normalizedType)
    || MOTOR_TYPES.has(normalizedSubtype)
    || MOTOR_TYPES.has(normalizedBase);
  if (isMotor) {
    const refPhases = parsePhases(component.phases).length || 3;
    const refVoltage = inferMotorOverlayVoltage(component, inferVoltage(component));
    const partial = collectMotorOperatingData(component, refVoltage, refPhases, { allowPartial: true });
    if (!partial || !Number.isFinite(partial.voltage) || partial.voltage <= 0) {
      return 'Provide the motor rated voltage before plotting this component.';
    }
    if (!Number.isFinite(partial.fla) || partial.fla <= 0) {
      return 'Provide the motor full-load amps, horsepower, or kW before plotting this component.';
    }
    if (!Number.isFinite(partial.lockedRotor) || partial.lockedRotor <= 0) {
      return 'Provide the motor locked-rotor current or multiple before plotting this component.';
    }
    const base = collectMotorOperatingData(component, refVoltage, refPhases);
    if (!base) {
      return 'Motor data is incomplete; verify the full-load and locked-rotor values before plotting.';
    }
    const startProfiles = resolveMotorStartProfiles(component, base);
    const thermalMetrics = resolveMotorThermalLimit(component, refVoltage, refPhases, base, startProfiles[0]);
    if (!startProfiles.length && !thermalMetrics) {
      return 'Provide the motor starting, stall, or locked-rotor data before plotting this component.';
    }
    return null;
  }
  const basePhases = parsePhases(component.phases);
  const isCable = normalizedType.includes('cable')
    || normalizedSubtype.includes('cable')
    || normalizedBase.includes('cable');
  if (isCable) {
    const phaseCount = basePhases.length || 3;
    const attemptCurve = (descriptor, phases = basePhases) => {
      if (!descriptor) return null;
      const count = (Array.isArray(phases) && phases.length) ? phases.length : phaseCount;
      return buildCableCurve(descriptor, count);
    };
    let curve = attemptCurve(component.cable || component.props?.cable || component);
    if (!curve) {
      const contexts = connectionIndex.get(component.id) || [];
      for (const { conn, source, target } of contexts) {
        const descriptor = resolveCableInfo(source, target, conn);
        if (!descriptor) continue;
        const phases = parsePhases(
          conn?.phases || descriptor.phases || (target?.phases ?? source?.phases)
        );
        curve = attemptCurve(descriptor, phases);
        if (curve) break;
      }
    }
    if (!curve) {
      return 'Provide the cable conductor size, material, and insulation rating before plotting this component.';
    }
    return null;
  }
  const isProtective = isProtectiveType(component.type)
    || isProtectiveType(component.subtype)
    || isProtectiveType(baseDevice?.type);
  const isTransformer = normalizedType.includes('transformer')
    || normalizedSubtype.includes('transformer')
    || normalizedBase.includes('transformer');
  if (isTransformer) {
    const refPhases = basePhases.length || 3;
    const refVoltage = inferVoltage(component);
    const damage = buildTransformerDamageCurve(component, refVoltage, refPhases);
    const inrush = computeTransformerInrush(component, refVoltage, refPhases);
    if (!damage && !inrush) {
      return 'Provide transformer kVA and voltage data to calculate damage and inrush before plotting this component.';
    }
    if (!damage) {
      return 'Provide transformer kVA and voltage ratings to plot the damage curve before plotting this component.';
    }
    if (!inrush) {
      return 'Provide transformer inrush multiple or duration before plotting this component.';
    }
    return null;
  }
  if (!isProtective) {
    const label = formatOptionLabel(typeKey || 'Device');
    return `${label} components do not provide a protective TCC curve.`;
  }
  if (!component.tccId) {
    return 'Assign a TCC device before plotting this component.';
  }
  if (!baseDevice) {
    return `The assigned TCC device (${component.tccId}) is not available in the library.`;
  }
  if (!deviceHasCurveData(baseDevice)) {
    return 'The assigned TCC device does not include curve data to plot.';
  }
  return null;
}

function buildComponentEntries() {
  const entries = [];
  componentRecords.forEach(({ component, sheetName }) => {
    if (!(isProtectiveType(component.type) || isProtectiveType(component.subtype)) || !component.tccId) return;
    const base = libraryDevices.find(dev => dev.id === component.tccId);
    if (!base) return;
    const overrides = snapOverridesToOptions(
      base,
      mergeOverrides(component.tccOverrides, saved.componentOverrides?.[component.id])
    );
    const vendor = getComponentVendor(component);
    const entry = {
      uid: `component:${component.id}`,
      kind: 'component',
      name: `${component.label || component.name || base.name || component.type}${sheetName ? ` (${sheetName})` : ''}`,
      baseDeviceId: base.id,
      baseDevice: base,
      deviceCategory: component.type || base.type || '',
      deviceType: component.subtype || component.type || base.type || '',
      componentId: component.id,
      component,
      sheetName,
      overrideSource: overrides,
      componentVendor: vendor
    };
    entries.push(entry);
  });
  return entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildComponentDisplayEntries() {
  const existing = new Map();
  deviceEntries
    .filter(entry => entry.kind === 'component' && entry.componentId)
    .forEach(entry => existing.set(entry.componentId, entry));

  const entries = [...existing.values()];

  componentRecords.forEach(({ component, sheetName }) => {
    if (!component || existing.has(component.id)) return;
    const base = component.tccId ? libraryDevices.find(dev => dev.id === component.tccId) : null;
    const mergedOverrides = mergeOverrides(component.tccOverrides, saved.componentOverrides?.[component.id]);
    const overrides = base ? snapOverridesToOptions(base, mergedOverrides) : { ...mergedOverrides };
    const vendor = getComponentVendor(component);
    const plotDisabledReason = describeComponentPlotAvailability(component, base);
    const entry = {
      uid: `component:${component.id}`,
      kind: 'component',
      name: `${componentLabel(component)}${sheetName ? ` (${sheetName})` : ''}`,
      baseDeviceId: base?.id || component.tccId || '',
      baseDevice: base || null,
      deviceCategory: component.type || base?.type || '',
      deviceType: component.subtype || component.type || base?.type || '',
      componentId: component.id,
      component,
      sheetName,
      overrideSource: overrides,
      componentVendor: vendor,
      missingBase: !base,
      plotDisabledReason
    };
    entries.push(entry);
  });

  return entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildComponentAssignmentOptions(component) {
  if (!component || typeof component !== 'object') return [];
  const matches = [];
  const others = [];
  const normalizedComponentType = normalizeTypeKey(component.subtype || component.type || '');
  const pushOption = (target, device) => {
    const typeLabel = formatOptionLabel(device.type || 'Protective Device');
    const vendor = (device.vendor || device.manufacturer || '').trim();
    const name = device.name || device.id;
    const labelParts = [typeLabel, name];
    if (vendor) labelParts.push(vendor);
    target.push({
      id: device.id,
      label: labelParts.join(' – ')
    });
  };

  libraryDevices
    .filter(dev => isProtectiveType(dev.type))
    .forEach(dev => {
      const normalizedType = normalizeTypeKey(dev.type);
      const isMatch = normalizedComponentType && (
        normalizedType === normalizedComponentType
        || normalizedType.includes(normalizedComponentType)
        || normalizedComponentType.includes(normalizedType)
      );
      if (isMatch) pushOption(matches, dev);
      else pushOption(others, dev);
    });

  const sortOptions = list => list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  sortOptions(matches);
  sortOptions(others);

  const groups = [];
  if (matches.length) {
    groups.push({ label: 'Matching Type', options: matches });
  }
  if (others.length) {
    groups.push({ label: matches.length ? 'Other Protective Devices' : 'All Protective Devices', options: others });
  }
  return groups;
}

function buildCustomCurveEntries() {
  if (!Array.isArray(saved.customCurves) || !saved.customCurves.length) return [];
  const ordered = sortCustomCurveList(saved.customCurves);
  return ordered.map(curve => {
    const baseId = `custom:${curve.id}`;
    const baseDevice = buildCustomCurveBaseDevice(curve, baseId);
    return {
      uid: baseId,
      kind: 'library',
      name: curve.name,
      baseDeviceId: baseId,
      baseDevice,
      deviceType: curve.deviceType || CUSTOM_CURVE_CATEGORY,
      deviceCategory: curve.deviceType || CUSTOM_CURVE_CATEGORY,
      libraryAssessment: assessProtectiveDeviceLibraryEntry(baseDevice),
      overrideSource: { ...(curve.settings || {}) },
      isCustom: true,
      customCurveId: curve.id,
      customCurve: curve,
      description: curve.description || '',
      metadata: {
        axes: curve.axes || {},
        bounds: curve.bounds || {}
      }
    };
  });
}

function buildLibraryEntries() {
  return libraryDevices
    .filter(dev => isProtectiveType(dev.type) && !dev.groundFault)
    .map(dev => ({
      uid: dev.id,
      kind: 'library',
      name: dev.type ? `${formatOptionLabel(dev.type)} – ${dev.name || dev.id}` : dev.name || dev.id,
      baseDeviceId: dev.id,
      baseDevice: dev,
      deviceType: dev.type || '',
      deviceCategory: dev.type || '',
      libraryAssessment: assessProtectiveDeviceLibraryEntry(dev),
      overrideSource: snapOverridesToOptions(dev, saved.settings?.[dev.id] || {})
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildGFPLibraryEntries() {
  return libraryDevices
    .filter(dev => isProtectiveType(dev.type) && dev.groundFault === true)
    .map(dev => ({
      uid: dev.id,
      kind: 'library',
      name: dev.name || dev.id,
      baseDeviceId: dev.id,
      baseDevice: dev,
      deviceType: dev.type || '',
      deviceCategory: 'ground_fault_relay',
      libraryAssessment: assessProtectiveDeviceLibraryEntry(dev),
      overrideSource: snapOverridesToOptions(dev, saved.settings?.[dev.id] || {})
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildOverlayEntries() {
  const contextId = getActiveComponentId();
  if (!contextId || !componentLookup.has(contextId)) return [];
  const overlays = [];
  overlays.push(...buildTransformerInrushEntries(contextId));
  overlays.push(...buildTransformerDamageEntries(contextId));
  overlays.push(...buildCableEntries(contextId));
  overlays.push(...buildMotorOverlayEntries(contextId));
  return overlays;
}

function getCustomCurveById(curveId) {
  if (!curveId || !Array.isArray(saved.customCurves)) return null;
  return saved.customCurves.find(curve => curve.id === curveId) || null;
}

function persistCustomCurveState({ refresh = true } = {}) {
  saved.customCurves = normalizeCustomCurveSequences(saved.customCurves);
  saved.customCurveCounter = saved.customCurves.reduce((max, curve) => {
    const seq = Number(curve.sequence);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, saved.customCurveCounter || 0);
  saved.viewOptions = [...activeViewOptions];
  saved.rangePreset = activeRangePreset;
  setItem('tccSettings', saved);
  if (refresh) {
    refreshCatalog({ preserveSelection: true, includeComponentContext: true });
  }
}

function saveCustomCurve(curve, { select = false } = {}) {
  if (!curve) return null;
  curve.settings = sanitizeCustomCurveSettings(curve.settings || {});
  curve.catalogNumber = sanitizeCustomCurveText(curve.catalogNumber, 160);
  curve.interruptingRatings = sanitizeCustomInterruptingRatings(curve.interruptingRatings);
  curve.curveEvidence = sanitizeCustomCurveEvidence(curve.curveEvidence);
  curve.libraryStatus = curve.libraryStatus === 'calculation_ready' ? 'calculation_ready' : undefined;
  const normalizedCurve = sanitizeCurve(curve.curve || []);
  const normalizedProfiles = sanitizeCustomCurveProfiles(curve.curveProfiles || []);
  const resolvedCurve = normalizedCurve.length
    ? normalizedCurve
    : normalizedProfiles.length
      ? normalizedProfiles[0].curve.map(point => ({ ...point }))
      : [];
  if (!resolvedCurve.length) return null;
  const clonePoints = points => (Array.isArray(points)
    ? points.map(point => ({ current: point.current, time: point.time }))
    : []);
      const cloneProfiles = profiles => (Array.isArray(profiles)
        ? profiles.map(profile => {
            const cloned = {
              id: profile.id,
              name: profile.name,
              curve: clonePoints(profile.curve),
              settings: { ...(profile.settings || {}) }
            };
            if (profile.tolerance !== undefined) {
              cloned.tolerance = profile.tolerance && typeof profile.tolerance === 'object'
                ? { ...profile.tolerance }
                : profile.tolerance;
            }
            if (profile.role !== undefined) {
              const normalizedRole = normalizeCustomCurveRole(profile.role);
              if (normalizedRole) {
                cloned.role = normalizedRole;
              }
            }
            return cloned;
          })
        : []);
  curve.curve = clonePoints(resolvedCurve);
  curve.curveProfiles = cloneProfiles(normalizedProfiles);
  let existing = curve.id ? getCustomCurveById(curve.id) : null;
  if (!existing) {
    const nextSequence = (saved.customCurveCounter || saved.customCurves.length || 0) + 1;
    curve.id = curve.id || createCustomCurveId(nextSequence);
    curve.sequence = Number.isFinite(curve.sequence) ? curve.sequence : nextSequence;
    saved.customCurveCounter = Math.max(saved.customCurveCounter || 0, curve.sequence);
    const storedCurve = {
      ...curve,
      curve: clonePoints(curve.curve),
      curveProfiles: cloneProfiles(curve.curveProfiles),
      axes: { ...(curve.axes || {}) },
      bounds: { ...(curve.bounds || {}) },
      settings: { ...(curve.settings || {}) }
    };
    saved.customCurves.push(storedCurve);
    curve = storedCurve;
  } else {
    existing.name = curve.name;
    existing.manufacturer = curve.manufacturer;
    existing.deviceType = curve.deviceType;
    existing.description = curve.description;
    existing.curve = clonePoints(curve.curve);
    existing.curveProfiles = cloneProfiles(curve.curveProfiles);
    existing.axes = { ...(curve.axes || {}) };
    existing.bounds = { ...(curve.bounds || {}) };
    existing.settings = { ...(curve.settings || {}) };
    existing.tolerance = curve.tolerance;
    existing.catalogNumber = curve.catalogNumber;
    existing.interruptingRatings = curve.interruptingRatings.map(rating => ({ ...rating }));
    existing.curveEvidence = { ...curve.curveEvidence };
    existing.libraryStatus = curve.libraryStatus;
    if (Number.isFinite(curve.sequence)) {
      existing.sequence = curve.sequence;
    }
    curve = existing;
  }
  persistCustomCurveState({ refresh: true });
  if (select && curve.id) {
    const uid = `custom:${curve.id}`;
    const updated = new Set(selectedDeviceIds());
    updated.add(uid);
    applySelectionSet([...updated], { persist: true });
  }
  return curve;
}

function removeCustomCurve(curveId) {
  if (!curveId || !Array.isArray(saved.customCurves)) return false;
  const index = saved.customCurves.findIndex(curve => curve.id === curveId);
  if (index === -1) return false;
  saved.customCurves.splice(index, 1);
  persistCustomCurveState({ refresh: true });
  const uid = `custom:${curveId}`;
  if (selectedDeviceIds().includes(uid)) {
    removeDeviceFromSelection(uid);
  }
  return true;
}

async function confirmCustomCurveRemoval(entry) {
  const curveId = entry?.customCurveId;
  if (!curveId) return;
  const curve = getCustomCurveById(curveId);
  if (!curve) return;
  const response = await openModal({
    title: 'Remove Custom Curve',
    primaryText: 'Delete',
    secondaryText: 'Cancel',
    message: `Are you sure you want to delete "${curve.name}"? This action cannot be undone.`,
    variant: 'danger',
    onSubmit: () => true
  });
  if (response) {
    removeCustomCurve(curveId);
  }
}

function getComponentDeviceUidMap() {
  const uidMap = new Map();
  componentDeviceMap.forEach((entry, componentId) => {
    if (entry?.uid) uidMap.set(String(componentId), entry.uid);
  });
  return uidMap;
}

function collectUndirectedNeighborDeviceDefaults(targetId, depthLimit = MAX_NEIGHBOR_DEPTH) {
  const defaults = new Set();
  if (!targetId || !neighborMap.has(targetId)) return defaults;
  const visited = new Set([targetId]);
  const queue = [{ id: targetId, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift();
    const neighbors = neighborMap.get(id);
    if (!neighbors || !neighbors.size) continue;
    neighbors.forEach(neighborId => {
      if (visited.has(neighborId)) return;
      visited.add(neighborId);
      const entry = componentDeviceMap.get(neighborId);
      if (entry) defaults.add(entry.uid);
      if (depth + 1 < depthLimit) {
        queue.push({ id: neighborId, depth: depth + 1 });
      }
    });
  }
  return defaults;
}

function collectNeighborDeviceDefaults(targetId, depthLimit = MAX_NEIGHBOR_DEPTH) {
  const directedDefaults = collectAdjacentDeviceUids(
    targetId,
    componentFlowMap,
    getComponentDeviceUidMap(),
    depthLimit
  );
  if (directedDefaults.size) return directedDefaults;
  return collectUndirectedNeighborDeviceDefaults(targetId, depthLimit);
}

function collectContextComponents(targetId, depthLimit = MAX_NEIGHBOR_DEPTH) {
  const components = [];
  if (!targetId || !componentLookup.has(targetId)) return components;
  const visited = new Set([targetId]);
  const queue = [{ id: targetId, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift();
    const record = componentLookup.get(id);
    if (record?.component) components.push(record.component);
    if (depth >= depthLimit) continue;
    (neighborMap.get(id) || new Set()).forEach(neighborId => {
      if (visited.has(neighborId) || !componentLookup.has(neighborId)) return;
      visited.add(neighborId);
      queue.push({ id: neighborId, depth: depth + 1 });
    });
  }
  return components;
}

function normalizeIdentityToken(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function componentIdentityTokens(component) {
  const tokens = new Set();
  ['id', 'ref', 'tag', 'equipmentTag', 'equipment_tag', 'name', 'label'].forEach(key => {
    const raw = getComponentValue(component, key);
    const normalized = normalizeIdentityToken(raw);
    if (normalized) tokens.add(normalized);
    if (typeof raw === 'string') {
      raw.split(/\r?\n/).forEach(part => {
        const line = normalizeIdentityToken(part);
        if (line) tokens.add(line);
      });
    }
  });
  return tokens;
}

function cableEndpointValue(cable, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const raw = cable?.[key];
    const normalized = normalizeIdentityToken(raw);
    if (normalized) return normalized;
  }
  return '';
}

function cableMatchesComponentEndpoint(cableEndpoint, component) {
  if (!cableEndpoint || !component) return false;
  return componentIdentityTokens(component).has(cableEndpoint);
}

function findContextComponentByEndpoint(cableEndpoint, contextComponents) {
  if (!cableEndpoint) return null;
  return contextComponents.find(component => cableMatchesComponentEndpoint(cableEndpoint, component)) || null;
}

function buildTransformerInrushEntries(targetId) {
  const overlays = [];
  const reference = componentLookup.get(targetId)?.component;
  if (!reference) return overlays;
  const refVoltage = inferVoltage(reference);
  const refPhases = parsePhases(reference.phases).length || 3;
  const transformers = new Map();
  collectContextComponents(targetId).forEach(component => {
    if (normalizeProtectionType(component?.type) !== 'transformer') return;
    if (!transformers.has(component.id)) transformers.set(component.id, component);
  });
  transformers.forEach(transformer => {
    const inrush = computeTransformerInrush(transformer, refVoltage, refPhases);
    if (!inrush) return;
    overlays.push({
      uid: `inrush:${transformer.id}:${targetId}`,
      kind: 'inrush',
      name: `${componentLabel(transformer)} Inrush`,
      deviceCategory: 'transformer',
      deviceType: 'transformer inrush',
      current: inrush.current,
      duration: inrush.duration,
      inrushMultiple: inrush.multiple,
      fla: inrush.fla,
      multipleEstimated: inrush.multipleEstimated,
      durationEstimated: inrush.durationEstimated,
      estimated: inrush.multipleEstimated || inrush.durationEstimated,
      operatingSide: inrush.operating?.side,
      operatingVoltage: inrush.operating?.volts,
      sourceId: transformer.id,
      sourceLabel: componentLabel(transformer),
      autoSelect: true
    });
  });
  return overlays.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildTransformerDamageEntries(targetId) {
  const overlays = [];
  const reference = componentLookup.get(targetId)?.component;
  if (!reference) return overlays;
  const refVoltage = inferVoltage(reference);
  const refPhases = parsePhases(reference.phases).length || 3;
  const transformers = new Map();
  collectContextComponents(targetId).forEach(component => {
    if (normalizeProtectionType(component?.type) !== 'transformer') return;
    if (!transformers.has(component.id)) transformers.set(component.id, component);
  });
  transformers.forEach(transformer => {
    const damage = buildTransformerDamageCurve(transformer, refVoltage, refPhases);
    if (!damage) return;
    overlays.push({
      uid: `transformer-damage:${transformer.id}:${targetId}`,
      kind: 'transformerDamage',
      name: `${componentLabel(transformer)} Damage`,
      deviceCategory: 'transformer',
      deviceType: 'transformer damage',
      curve: damage.curve,
      fla: damage.fla,
      operatingSide: damage.operating?.side,
      operatingVoltage: damage.operating?.volts,
      dataSource: damage.operating?.source || '',
      sourceId: transformer.id,
      sourceLabel: componentLabel(transformer),
      autoSelect: true
    });
  });
  return overlays.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildCableEntries(targetId) {
  const overlays = [];
  const seen = new Set();
  const contextComponents = collectContextComponents(targetId);
  const contextIds = new Set(contextComponents.map(component => component.id).filter(Boolean));

  const addCableOverlay = ({ cableInfo, source, target, tag }) => {
    if (!cableInfo || !source || !target) return;
    const sourceId = String(source.id || '');
    const targetId = String(target.id || '');
    const reverseDirection = componentFlowMap.get(targetId)?.downstream?.has(sourceId)
      && !componentFlowMap.get(sourceId)?.downstream?.has(targetId);
    const upstreamComponent = reverseDirection ? target : source;
    const downstreamComponent = reverseDirection ? source : target;
    const cableTag = tag || cableInfo.tag || cableInfo.id || `edge:${[upstreamComponent.id, downstreamComponent.id].sort().join('~')}`;
    if (seen.has(cableTag)) return;
    const phases = parsePhases(cableInfo.phases || downstreamComponent?.phases || upstreamComponent?.phases);
    const curve = buildCableCurve(cableInfo, phases.length || 3);
    if (!curve) return;
    const descriptor = parseConductorsDescriptor(cableInfo.conductors);
    seen.add(cableTag);
    overlays.push({
      uid: `cable:${cableTag}`,
      kind: 'cable',
      name: `${cableInfo.tag || cableInfo.id || 'Cable'} Damage (${componentLabel(upstreamComponent)} -> ${componentLabel(downstreamComponent)})`,
      deviceCategory: 'cable',
      deviceType: 'cable damage',
      curve: curve.curve,
      ampacity: curve.ampacity,
      sourceId: upstreamComponent.id,
      targetId: downstreamComponent.id,
      sourceLabel: componentLabel(upstreamComponent),
      targetLabel: componentLabel(downstreamComponent),
      conductorSize: cableInfo.conductor_size || cableInfo.conductorSize || cableInfo.size || cableInfo.awg || descriptor.size || '',
      conductorMaterial: cableInfo.conductor_material || cableInfo.material || '',
      insulationType: cableInfo.insulation_type || cableInfo.insulationType || cableInfo.insulation || '',
      length: cableInfo.length || cableInfo.length_ft || cableInfo.lengthFt || null,
      materialEstimated: curve.materialEstimated,
      insulationEstimated: curve.insulationEstimated,
      conductorsPerPhase: curve.conductorsPerPhase,
      parallel: curve.parallel,
      estimated: curve.materialEstimated || curve.insulationEstimated,
      autoSelect: true
    });
  };

  contextComponents.forEach(component => {
    (connectionIndex.get(component.id) || []).forEach(({ conn, source, target }) => {
      if (!source?.id || !target?.id) return;
      if (!contextIds.has(source.id) || !contextIds.has(target.id)) return;
      const cableInfo = resolveCableInfo(source, target, conn);
      addCableOverlay({
        cableInfo,
        source,
        target,
        tag: cableInfo?.tag || cableInfo?.id || `edge:${[source.id, target.id].sort().join('~')}`
      });
    });
  });

  getCables().forEach((cable, index) => {
    if (!cable || typeof cable !== 'object') return;
    const fromEndpoint = cableEndpointValue(cable, ['from', 'from_id', 'fromId', 'source', 'source_id', 'sourceId', 'origin']);
    const toEndpoint = cableEndpointValue(cable, ['to', 'to_id', 'toId', 'target', 'target_id', 'targetId', 'destination']);
    const source = findContextComponentByEndpoint(fromEndpoint, contextComponents);
    const target = findContextComponentByEndpoint(toEndpoint, contextComponents);
    if (!source || !target) return;
    addCableOverlay({
      cableInfo: cable,
      source,
      target,
      tag: cable.tag || cable.id || `schedule:${index}`
    });
  });

  return overlays.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function inferMotorOverlayVoltage(motor, fallbackVoltage) {
  const direct = inferVoltage(motor);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (!motor?.id || !neighborMap.has(motor.id)) {
    return Number.isFinite(fallbackVoltage) && fallbackVoltage > 0 ? fallbackVoltage : null;
  }
  const visited = new Set([motor.id]);
  const queue = [{ id: motor.id, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift();
    const component = componentLookup.get(id)?.component;
    if (component && normalizeProtectionType(component.type) === 'transformer') {
      const candidates = getTransformerVoltageCandidates(component);
      const secondary = candidates.length ? Math.min(...candidates) : null;
      if (Number.isFinite(secondary) && secondary > 0) return secondary;
    }
    if (depth >= MAX_NEIGHBOR_DEPTH) continue;
    (neighborMap.get(id) || new Set()).forEach(neighborId => {
      if (visited.has(neighborId)) return;
      visited.add(neighborId);
      queue.push({ id: neighborId, depth: depth + 1 });
    });
  }
  return Number.isFinite(fallbackVoltage) && fallbackVoltage > 0 ? fallbackVoltage : null;
}

function resolveMotorStartProfiles(motor, baseData) {
  if (!baseData) return [];
  const { fla, lockedRotor, startTime } = baseData;
  if (!Number.isFinite(fla) || fla <= 0) return [];
  if (!Number.isFinite(lockedRotor) || lockedRotor <= 0) return [];
  const coldStartTime = getNumericValue(motor, [
    'cold_start_time_s',
    'coldStartTime',
    'cold_start_time',
    'cold_start_seconds',
    'cold_acceleration_time',
    'cold_accel_time',
    'cold_start_duration'
  ]);
  const hotStartTime = getNumericValue(motor, [
    'hot_start_time_s',
    'hotStartTime',
    'hot_start_time',
    'hot_start_seconds',
    'hot_acceleration_time',
    'hot_accel_time',
    'hot_start_duration'
  ]);
  const profiles = [];
  if (Number.isFinite(coldStartTime) && coldStartTime > 0) {
    profiles.push({ key: 'cold', label: 'Cold Start', startTime: coldStartTime, estimated: false });
  }
  if (Number.isFinite(hotStartTime) && hotStartTime > 0) {
    profiles.push({ key: 'hot', label: 'Hot Start', startTime: hotStartTime, estimated: false });
  }
  if (!profiles.length && Number.isFinite(startTime) && startTime > 0) {
    profiles.push({ key: 'start', label: 'Motor Start', startTime, estimated: false });
  }
  if (!profiles.length) {
    profiles.push(
      { key: 'cold', label: 'Cold Start', startTime: DEFAULT_MOTOR_COLD_START_DURATION, estimated: true },
      { key: 'hot', label: 'Hot Start', startTime: DEFAULT_MOTOR_HOT_START_DURATION, estimated: true }
    );
  }
  return profiles
    .map(profile => ({
      ...profile,
      fla,
      lockedRotor,
      curve: buildMotorStartingCurve({ fla, lockedRotor, startTime: profile.startTime })
    }))
    .filter(profile => profile.curve.length);
}

function buildMotorOverlayEntries(targetId) {
  const overlays = [];
  const reference = componentLookup.get(targetId)?.component;
  if (!reference) return overlays;
  const refVoltage = inferVoltage(reference);
  const refPhases = parsePhases(reference.phases).length || 3;
  const seen = new Set();

  const addMotor = motor => {
    if (!isMotorComponent(motor)) return;
    if (seen.has(motor.id)) return;
    const motorVoltage = inferMotorOverlayVoltage(motor, refVoltage);
    const base = collectMotorOperatingData(motor, motorVoltage, refPhases);
    if (!base) return;
    const startProfiles = resolveMotorStartProfiles(motor, base);
    const thermalReference = startProfiles.find(profile => profile.key === 'cold') || startProfiles[0] || null;
    const thermalMetrics = resolveMotorThermalLimit(motor, motorVoltage, refPhases, base, thermalReference);
    if (!startProfiles.length && !thermalMetrics) return;
    seen.add(motor.id);
    startProfiles.forEach(profile => {
      overlays.push({
        uid: `motor-start:${profile.key}:${motor.id}:${targetId}`,
        kind: 'motorStart',
        name: `${componentLabel(motor)} ${profile.label}${profile.estimated ? ' (est.)' : ''}`,
        deviceCategory: 'motor',
        deviceType: 'motor starting',
        curve: profile.curve,
        fla: profile.fla,
        lockedRotor: profile.lockedRotor,
        startTime: profile.startTime,
        startProfile: profile.label,
        estimated: profile.estimated,
        voltage: base.voltage,
        sourceId: motor.id,
        sourceLabel: componentLabel(motor),
        autoSelect: true
      });
    });
    if (thermalMetrics) {
      overlays.push({
        uid: `motor-thermal:${motor.id}:${targetId}`,
        kind: 'motorThermal',
        name: `${componentLabel(motor)} Motor Thermal Limit${thermalReference?.estimated ? ' (est.)' : ''}`,
        deviceCategory: 'motor',
        deviceType: 'motor thermal limit',
        curve: thermalMetrics.curve,
        fla: thermalMetrics.fla,
        lockedRotor: thermalMetrics.lockedRotor,
        serviceFactor: thermalMetrics.serviceFactor,
        stallTime: thermalMetrics.stallTime,
        continuousCurrent: thermalMetrics.continuousCurrent,
        estimated: Boolean(thermalReference?.estimated),
        voltage: base.voltage,
        sourceId: motor.id,
        sourceLabel: componentLabel(motor),
        autoSelect: true
      });
    }
  };

  collectContextComponents(targetId).forEach(addMotor);

  return overlays.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function renderDeviceList() {
  if (!deviceSelect) return;
  deviceSelect.innerHTML = '';
  deviceGroups.forEach(group => {
    if (!group.items.length) return;
    group.items.forEach(item => {
      const opt = new Option(item.name, item.uid);
      opt.dataset.kind = item.kind;
      deviceSelect.add(opt);
    });
  });
}

if (deviceModalBtn) {
  deviceModalBtn.addEventListener('click', () => {
    openDeviceSelectionModal();
  });
}

if (viewMenuBtn) {
  viewMenuBtn.addEventListener('click', () => {
    openViewOptionModal();
  });
}
function renderDeviceDetails(entry, container, doc, options = {}) {
  return renderDeviceDetailsView(entry, container, doc, {
    ...options,
    getAssignmentOptions: buildComponentAssignmentOptions,
    onOverrideControlChange: updateEntryOverrideFromControl
  });
}

async function openDeviceSelectionModal() {
  return openDeviceSelectionModalView({
    applySelectionSet,
    assessProtectiveDeviceLibraryEntry,
    buildTypeGroups,
    deviceEntries,
    deviceMap,
    getContextDeviceRelationshipMap,
    getDeviceRelationship,
    hydrateProtectiveDevices,
    libraryDevices,
    mergeProtectiveDeviceReview,
    openModal,
    openProtectiveDeviceReview,
    renderDeviceDetails,
    requestPlotRefresh,
    saved,
    selectedDeviceIds,
    setItem,
    sortDeviceIdsForContext,
    summarizeProtectiveDeviceLibrary
  });
}

async function openViewOptionModal() {
  return openTccViewOptionsModal({
    triggerButton: viewMenuBtn,
    activeOptions: activeViewOptions,
    viewOptions: TCC_VIEW_OPTIONS,
    openModal,
    applyOptions: setActiveViewOptions,
    restoreOptions: options => setActiveViewOptions(options, { persist: false }),
    updateButtonLabel: updateViewButtonLabel,
    hasSelectedDevices: () => Boolean(deviceSelect?.selectedOptions.length),
    requestPlotRefresh
  });
}

deviceSelect.addEventListener('change', () => {
  renderSelectedSummary();
  renderSettings();
  persistSettings();
  markPlotDirty('Device selection changed. Update Plot to refresh the chart.');
  if (!updatingActiveComponentFromSelect) {
    const selectedEntries = selectedDeviceIds()
      .map(id => deviceMap.get(id))
      .filter(entry => entry && entry.kind === 'component' && entry.componentId);
    const firstComponent = selectedEntries[0] || null;
    if (firstComponent && getActiveComponentId() !== firstComponent.componentId) {
      updatingActiveComponentFromSelect = true;
      setActiveComponent(firstComponent.componentId, { preserveSelection: true });
      updatingActiveComponentFromSelect = false;
    }
  }
});
if (customCurveBtn) {
  customCurveBtn.addEventListener('click', () => {
    openCustomCurveBuilder();
  });
}
plotBtn.addEventListener('click', applyPlotAndPersistence);
if (autoCoordBtn) {
  autoCoordBtn.addEventListener('click', autoCoordinate);
}
if (exportCtiBtn) {
  exportCtiBtn.addEventListener('click', () => {
    if (!lastCoordState) return;
    const { deviceEntries, result, gfpResult, maxFaultA, margin } = lastCoordState;
    const phaseEntries = deviceEntries.filter(entry => !entry.device?.groundFault);
    const gfpEntries = deviceEntries.filter(entry => entry.device?.groundFault === true);
    const rows = [
      ...buildCTIRows(phaseEntries, result, maxFaultA, margin),
      ...buildCTIRows(gfpEntries, gfpResult, maxFaultA, margin)
    ];
    downloadCSV(CTI_HEADERS, rows, 'coordination-cti-report.csv');
  });
}
if (exportRelaySettingsBtn) {
  exportRelaySettingsBtn.addEventListener('click', () => {
    const allEntries = [...deviceMap.values()];
    const { files, manifestRows, warnings } = buildExportFiles(allEntries);
    if (!manifestRows.length) {
      showAlertModal('No relay settings to export. Add devices with configurable settings and plot first.', { title: 'No Data' });
      return;
    }
    // Manifest CSV first
    downloadCSV(MANIFEST_HEADERS, manifestRows, 'relay-settings-manifest.csv');
    // Per-device files with a small stagger to avoid browser download blocking
    files.forEach((f, i) => {
      setTimeout(() => {
        const blob = new Blob([f.content], { type: f.contentType });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = f.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 0);
      }, (i + 1) * 300);
    });
    if (warnings.length) {
      setTimeout(() => {
        showAlertModal(
          `Export complete with ${warnings.length} warning(s):\n\n${warnings.join('\n')}`,
          { title: 'Export Warnings' }
        );
      }, (files.length + 1) * 300 + 200);
    }
  });
}
if (printPlotBtn) {
  printPlotBtn.addEventListener('click', handlePrintPlot);
}
if (exportSvgBtn) {
  exportSvgBtn.addEventListener('click', handleExportSVG);
}
if (exportPngBtn) {
  exportPngBtn.addEventListener('click', handleExportPNG);
}
if (exportReviewBtn) {
  exportReviewBtn.addEventListener('click', handleExportReview);
}
if (rangePresetSelect) {
  rangePresetSelect.value = activeRangePreset;
  rangePresetSelect.addEventListener('change', () => {
    setActiveRangePreset(rangePresetSelect.value);
    if (deviceSelect && deviceSelect.selectedOptions.length) {
      requestPlotRefresh('Range preset changed. Updating plot...');
    }
  });
}
if (calloutScopeSelect) {
  calloutScopeSelect.value = activeCalloutScope;
  calloutScopeSelect.addEventListener('change', () => {
    setActiveCalloutScope(calloutScopeSelect.value);
    if (deviceSelect && deviceSelect.selectedOptions.length) {
      requestPlotRefresh('Callout scope changed. Updating plot...');
    }
  });
}
if (coordMarginInput) {
  coordMarginInput.addEventListener('input', markCoordinationStale);
  coordMarginInput.addEventListener('change', markCoordinationStale);
}
if (afThresholdSelect) {
  afThresholdSelect.addEventListener('change', () => {
    const val = Number(afThresholdSelect.value);
    if (val > 0) {
      arcFlashOverlayThreshold = val;
      plot();
    }
  });
}
if (annotationBtn) {
  annotationBtn.setAttribute('aria-pressed', 'false');
  annotationBtn.addEventListener('click', () => {
    if (annotationBtn.disabled) return;
    if (annotationMode) {
      disableAnnotationMode();
    } else {
      enableAnnotationMode();
    }
  });
}
chart.on('click.annotation', handleAnnotationPlacement);
chart.on('click.pinnedDetail', event => {
  if (event.target === chart.node()) {
    clearPinnedChartDetail();
  }
});
chart.on('contextmenu.hideMenu', () => {
  contextMenu.hide();
});
if (equipmentMetricsPanel) {
  equipmentMetricsPanel.addEventListener('click', handleEquipmentAssumptionAction);
}
if (pinnedDetailPanel) {
  pinnedDetailPanel.addEventListener('click', handleEquipmentAssumptionAction);
}
if (settingsDiv) {
  const handleSettingMutation = event => {
    const target = event.target;
    if (!target) return;
    const fieldSource = target.dataset?.field
      ? target
      : (typeof target.closest === 'function' ? target.closest('[data-field]') : null);
    if (!fieldSource || !fieldSource.dataset?.field) return;
    requestPlotRefresh();
  };
  settingsDiv.addEventListener('input', handleSettingMutation);
  settingsDiv.addEventListener('change', handleSettingMutation);
}
linkBtn.addEventListener('click', linkComponent);
openBtn.addEventListener('click', () => {
  const targetId = getActiveComponentId() || activeComponentId || compId;
  if (targetId) {
    openOneLineProbe({ componentId: targetId, probeType: 'tcc' }, { probeType: 'tcc', newTab: true });
  }
});
if (contextBackBtn) {
  contextBackBtn.addEventListener('click', () => {
    const targetId = getActiveComponentId() || activeComponentId || compId;
    openOneLineProbe(
      { componentId: targetId, probeType: 'tcc' },
      { probeType: 'tcc', componentModal: true }
    );
  });
}

async function applyPlotAndPersistence() {
  await plot();
  persistSettings();
}

function requestPlotRefresh(message = 'Inputs changed. Updating plot...') {
  markPlotRefreshPending(message);
  if (typeof requestAnimationFrame !== 'function') {
    applyPlotAndPersistence();
    return;
  }
  if (pendingPlotRefresh !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(pendingPlotRefresh);
  }
  pendingPlotRefresh = requestAnimationFrame(() => {
    pendingPlotRefresh = null;
    applyPlotAndPersistence();
  });
}

if (componentModalBtn) {
  componentModalBtn.addEventListener('click', () => {
    openComponentBrowserModal();
  });
}

async function openComponentBrowserModal() {
  return openComponentBrowserModalView({
    activeComponentId,
    applySelectionSet,
    buildComponentDisplayEntries,
    buildOneLineProbeUrl,
    buildTypeGroups,
    compId,
    componentModalBtn,
    console,
    deviceMap,
    deviceSelect,
    getActiveComponentId,
    getManufacturerLabel,
    getTypeInfo,
    openModal,
    plot,
    refreshCatalog,
    renderDeviceDetails,
    selectedDeviceIds,
    setActiveComponent,
    showAlertModal,
    updateComponentAssignment
  });
}

async function openCustomCurveBuilder(curveId = null) {
  return openCustomCurveBuilderView(curveId, {
    document,
    URL,
    Image,
    console,
    PROTECTIVE_TYPES: new Set(PROTECTIVE_DEVICE_TYPES),
    ensurePdfJs,
    getCustomCurveById,
    openModal,
    saveCustomCurve
  });
}

function renderSettings() {
  renderTccSettings({
    container: settingsDiv,
    documentRef: document,
    selectedIds: selectedDeviceIds(),
    deviceMap
  });
}

function collectPersistedEntryOverrides(selected) {
  const records = [];
  if (settingsDiv) {
    settingsDiv.querySelectorAll('.device-settings').forEach(div => {
      const entry = deviceMap.get(div.dataset.uid);
      if (!entry) return;
      records.push({
        entry,
        overrides: snapOverridesToOptions(entry.baseDevice, collectOverridesFromDiv(div))
      });
    });
  } else {
    selected.forEach(uid => {
      const entry = deviceMap.get(uid);
      if (!entry || (entry.kind !== 'component' && entry.kind !== 'library')) return;
      records.push({
        entry,
        overrides: snapOverridesToOptions(entry.baseDevice, entry.overrideSource || {})
      });
    });
  }
  records.forEach(({ entry, overrides }) => {
    entry.overrideSource = overrides;
  });
  return records;
}

function persistSettings() {
  const selected = selectedDeviceIds();
  const entryOverrides = collectPersistedEntryOverrides(selected);
  const persisted = buildTccSettingsSnapshot({
    saved,
    selectedIds: selected,
    entryOverrides,
    annotations: annotations.map(exportAnnotation),
    viewOptions: activeViewOptions,
    rangePreset: activeRangePreset
  });
  saved = persisted.snapshot;
  setItem('tccSettings', saved);
  syncComponentOverrides(persisted.componentSettings);
}

function syncComponentOverrides(componentSettings) {
  const result = reconcileComponentOverrides(
    getOneLine(),
    componentSettings,
    libraryDevices,
    { isProtectiveType, snapOverrides: snapOverridesToOptions }
  );
  if (!result.changed) return;
  setOneLine(result.oneLine);
  buildComponentData();
  rebuildCatalog();
  const defaults = new Set(saved.devices || []);
  deviceEntries
    .filter(entry => entry.autoSelect)
    .forEach(entry => defaults.add(entry.uid));
  selectDefaults(defaults);
  renderSettings();
  plot();
}

function updateComponentAssignment(componentId, deviceId, overrides = {}, { autoSelect = false, replaceSelection = false } = {}) {
  if (!componentId) {
    return { updatedEntry: null, selection: selectedDeviceIds() };
  }
  const baseDevice = deviceId ? libraryDevices.find(dev => dev.id === deviceId) : null;
  const sanitizedOverrides = snapOverridesToOptions(baseDevice, overrides || {});
  const previousSelection = replaceSelection ? new Set() : new Set(selectedDeviceIds());
  const data = getOneLine();
  let updated = false;
  (data.sheets || []).forEach(sheet => {
    (sheet.components || []).forEach(comp => {
      if (comp.id !== componentId) return;
      if (deviceId) {
        comp.tccId = deviceId;
      } else if (comp.tccId) {
        delete comp.tccId;
      }
      if (sanitizedOverrides && Object.keys(sanitizedOverrides).length) {
        comp.tccOverrides = sanitizedOverrides;
      } else if (comp.tccOverrides) {
        delete comp.tccOverrides;
      }
      updated = true;
    });
  });
  if (!updated) {
    return { updatedEntry: null, selection: [...previousSelection] };
  }

  if (!saved.componentOverrides || typeof saved.componentOverrides !== 'object') {
    saved.componentOverrides = {};
  }
  if (sanitizedOverrides && Object.keys(sanitizedOverrides).length) {
    saved.componentOverrides[componentId] = sanitizedOverrides;
  } else if (saved.componentOverrides[componentId]) {
    delete saved.componentOverrides[componentId];
  }

  setOneLine(data);
  buildComponentData();
  rebuildCatalog();

  const available = new Set(deviceEntries.map(entry => entry.uid));
  if (autoSelect && deviceId) {
    previousSelection.add(`component:${componentId}`);
  }
  const filteredSelection = [...previousSelection].filter(id => available.has(id));
  if (!filteredSelection.length && autoSelect && deviceId) {
    filteredSelection.push(`component:${componentId}`);
  }
  applySelectionSet(filteredSelection, { persist: true });
  renderSettings();
  plot();
  renderOneLinePreview(componentId);
  return {
    updatedEntry: deviceMap.get(`component:${componentId}`) || null,
    selection: filteredSelection
  };
}

function linkComponent(entryOverride = null) {
  const targetComponentId = getActiveComponentId() || compId;
  if (!targetComponentId) return;
  let entry = entryOverride;
  if (entry && entry.uid && deviceMap.has(entry.uid)) {
    entry = deviceMap.get(entry.uid);
  }
  if (!entry) {
    const first = selectedDeviceIds().find(id => {
      const candidate = deviceMap.get(id);
      return candidate && (candidate.kind === 'library' || candidate.kind === 'component');
    });
    if (!first) return;
    entry = deviceMap.get(first);
  }
  if (!entry || (entry.kind !== 'library' && entry.kind !== 'component')) return;
  const deviceId = entry.baseDeviceId;
  const overrides = snapOverridesToOptions(entry.baseDevice, entry.overrideSource || {});
  updateComponentAssignment(targetComponentId, deviceId, overrides, {
    autoSelect: true,
    replaceSelection: true
  });
}

function gatherOverridesFromInputs(uid) {
  const entry = deviceMap.get(uid);
  if (!entry) return {};
  if (!settingsDiv) {
    return snapOverridesToOptions(entry.baseDevice, entry.overrideSource || {});
  }
  const div = findSettingsDeviceDiv(uid);
  if (!div) {
    return snapOverridesToOptions(entry.baseDevice, entry.overrideSource || {});
  }
  return snapOverridesToOptions(entry.baseDevice, collectOverridesFromDiv(div));
}

function formatMetricValue(value, unit = '') {
  const numeric = typeof value === 'number' ? value : parseNumeric(value);
  let formatted = '';
  if (Number.isFinite(numeric)) {
    if (unit === 'A' || unit === 'V') {
      formatted = formatCoordinationCurrent(numeric);
    } else if (unit === 's') {
      formatted = formatCoordinationSeconds(numeric);
    } else {
      formatted = formatSettingValue(numeric);
    }
  } else {
    formatted = formatSettingValue(value);
  }
  if (!formatted) return '';
  return unit ? `${formatted} ${unit}` : formatted;
}

function assumptionKeyForEntry(entry) {
  return String(entry?.uid || entry?.name || '');
}

function isAssumptionConfirmed(entry) {
  const key = assumptionKeyForEntry(entry);
  return Boolean(key && saved.assumptionConfirmations?.[key]);
}

function equipmentDataQualityLabel(entry) {
  if (!entry) return '';
  if (entry.estimated) {
    return isAssumptionConfirmed(entry) ? 'Confirmed assumption' : 'Estimated / assumed';
  }
  return entry.dataSource || 'Project data';
}

function entryNeedsAssumptionAction(entry) {
  return Boolean(entry?.estimated);
}

function confirmEquipmentAssumption(entry) {
  const key = assumptionKeyForEntry(entry);
  if (!key) return;
  if (!saved.assumptionConfirmations || typeof saved.assumptionConfirmations !== 'object') {
    saved.assumptionConfirmations = {};
  }
  saved.assumptionConfirmations[key] = {
    confirmedAt: new Date().toISOString(),
    label: entry.name || equipmentMetricTitle(entry)
  };
  saved.viewOptions = [...activeViewOptions];
  saved.rangePreset = activeRangePreset;
  saved.calloutScope = activeCalloutScope;
  setItem('tccSettings', saved);
  renderEquipmentMetrics(activeEquipmentOverlays, activeEquipmentConstraintChecks);
  showPinnedEquipmentDetail(null, entry, null, null);
  updateCoordinationStatus(`${equipmentMetricTitle(entry)} assumption confirmed. Re-run Auto-Coordinate if this changes the review basis.`, 'ok');
}

function sourceComponentIdForEquipmentEntry(entry) {
  if (!entry) return null;
  const candidates = [entry.sourceId, entry.targetId].filter(Boolean);
  return candidates.find(componentId => componentLookup.has(componentId)) || null;
}

function openEquipmentSource(entry) {
  const componentId = sourceComponentIdForEquipmentEntry(entry);
  if (!componentId) return;
  renderOneLinePreview(componentId);
  updateCoordinationStatus(`${equipmentMetricTitle(entry)} source shown in the one-line preview. Use Back to One-Line to edit source data.`, 'neutral');
}

function equipmentAssumptionActions(entry) {
  if (!entryNeedsAssumptionAction(entry)) return '';
  const key = escapeHtml(assumptionKeyForEntry(entry));
  const confirmed = isAssumptionConfirmed(entry);
  const confirmLabel = confirmed ? 'Confirmed' : 'Confirm Assumption';
  return `
    <div class="tcc-assumption-actions" data-entry-key="${key}">
      <button type="button" class="tcc-assumption-confirm" data-action="confirm-assumption" data-entry-key="${key}"${confirmed ? ' disabled' : ''}>${confirmLabel}</button>
      <button type="button" class="tcc-assumption-source" data-action="open-assumption-source" data-entry-key="${key}">Select Source</button>
    </div>
  `;
}

function findEquipmentEntryByKey(key) {
  if (!key) return null;
  return activeEquipmentOverlays.find(entry => assumptionKeyForEntry(entry) === key) || null;
}

function handleEquipmentAssumptionAction(event) {
  const button = event.target?.closest?.('[data-action][data-entry-key]');
  if (!button) return;
  const entry = findEquipmentEntryByKey(button.dataset.entryKey);
  if (!entry) return;
  event.preventDefault();
  if (button.dataset.action === 'confirm-assumption') {
    confirmEquipmentAssumption(entry);
  } else if (button.dataset.action === 'open-assumption-source') {
    openEquipmentSource(entry);
  }
}

function equipmentMetricRows(entry) {
  if (!entry || !isEquipmentOverlayKind(entry.kind)) return [];
  const quality = equipmentDataQualityLabel(entry);
  if (entry.kind === 'inrush') {
    const duration = Number.isFinite(entry.normalizedDuration) && entry.normalizedDuration > 0
      ? entry.normalizedDuration
      : entry.duration;
    return [
      { label: 'Data Quality', value: quality },
      { label: 'FLA', value: formatMetricValue(entry.fla, 'A') },
      { label: 'Multiple', value: entry.inrushMultiple ? `${formatSettingValue(entry.inrushMultiple)}x${entry.multipleEstimated ? ' assumed' : ''}` : '' },
      { label: 'Current', value: formatMetricValue(entry.current, 'A') },
      { label: 'Duration', value: `${formatMetricValue(duration, 's')}${entry.durationEstimated ? ' assumed' : ''}` },
      { label: 'Voltage', value: formatMetricValue(entry.operatingVoltage, 'V') },
      { label: 'Side', value: entry.operatingSide || '' }
    ];
  }
  if (entry.kind === 'transformerDamage') {
    return [
      { label: 'Data Quality', value: quality },
      { label: 'FLA', value: formatMetricValue(entry.fla, 'A') },
      { label: 'Voltage', value: formatMetricValue(entry.operatingVoltage, 'V') },
      { label: 'Side', value: entry.operatingSide || '' },
      { label: 'Points', value: Array.isArray(entry.curve) ? String(entry.curve.length) : '' }
    ];
  }
  if (entry.kind === 'cable') {
    return [
      { label: 'Data Quality', value: quality },
      { label: 'Size', value: entry.conductorSize || '' },
      { label: 'Material', value: entry.conductorMaterial ? formatOptionLabel(entry.conductorMaterial) : 'Copper assumed' },
      { label: 'Insulation', value: entry.insulationType || (entry.insulationEstimated ? '90 C assumed' : '') },
      { label: 'Conductors/Phase', value: formatMetricValue(entry.conductorsPerPhase) },
      { label: 'Parallel Sets', value: formatMetricValue(entry.parallel) },
      { label: 'Ampacity', value: formatMetricValue(entry.ampacity, 'A') },
      { label: 'Length', value: formatMetricValue(parseNumeric(entry.length), 'ft') },
      { label: 'Points', value: Array.isArray(entry.curve) ? String(entry.curve.length) : '' }
    ];
  }
  if (entry.kind === 'motorStart') {
    return [
      { label: 'Data Quality', value: quality },
      { label: 'Profile', value: entry.startProfile || 'Start' },
      { label: 'FLA', value: formatMetricValue(entry.fla, 'A') },
      { label: 'LRA', value: formatMetricValue(entry.lockedRotor, 'A') },
      { label: 'Duration', value: formatMetricValue(entry.startTime, 's') },
      { label: 'Voltage', value: formatMetricValue(entry.voltage, 'V') }
    ];
  }
  if (entry.kind === 'motorThermal') {
    return [
      { label: 'Data Quality', value: quality },
      { label: 'FLA', value: formatMetricValue(entry.fla, 'A') },
      { label: 'LRA', value: formatMetricValue(entry.lockedRotor, 'A') },
      { label: 'Stall', value: formatMetricValue(entry.stallTime, 's') },
      { label: 'Continuous', value: formatMetricValue(entry.continuousCurrent, 'A') },
      { label: 'SF', value: formatMetricValue(entry.serviceFactor) },
      { label: 'Voltage', value: formatMetricValue(entry.voltage, 'V') },
    ];
  }
  return [];
}

function equipmentMetricTitle(entry) {
  if (!entry) return 'Equipment';
  if (entry.kind === 'inrush') return 'Transformer Inrush';
  if (entry.kind === 'transformerDamage') return 'Transformer Damage';
  if (entry.kind === 'cable') return 'Cable Damage';
  if (entry.kind === 'motorStart') return entry.startProfile || 'Motor Start';
  if (entry.kind === 'motorThermal') return 'Motor Thermal Limit';
  return entry.name || 'Equipment';
}

function renderEquipmentMetrics(overlays = [], checks = []) {
  if (!equipmentMetricsPanel) return;
  const entries = overlays.filter(entry => isEquipmentOverlayKind(entry.kind));
  if (!entries.length) {
    equipmentMetricsPanel.innerHTML = '';
    equipmentMetricsPanel.classList.add('hidden');
    return;
  }
  const cards = entries.map(entry => {
    const rows = equipmentMetricRows(entry)
      .filter(row => row.value !== undefined && row.value !== null && row.value !== '')
      .map(row => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`)
      .join('');
    const subtitle = [entry.sourceLabel, entry.targetLabel].filter(Boolean).join(' -> ');
    return `
      <article class="tcc-equipment-card" data-kind="${escapeHtml(entry.kind)}">
        <h3>${escapeHtml(equipmentMetricTitle(entry))}</h3>
        <p>${escapeHtml(subtitle || entry.name || '')}</p>
        <dl>${rows}</dl>
        ${equipmentAssumptionActions(entry)}
      </article>
    `;
  }).join('');
  const checkItems = checks.map(check => `
    <li class="tcc-equipment-check" data-status="${escapeHtml(check.status)}">
      <strong>${escapeHtml(check.label)}</strong>
      <span>${escapeHtml(check.detail)}</span>
    </li>
  `).join('');
  const checkBlock = checkItems
    ? `<ul class="tcc-equipment-checks" aria-label="Equipment protection checks">${checkItems}</ul>`
    : '';
  equipmentMetricsPanel.innerHTML = `
    <div class="tcc-equipment-metrics-heading">
      <h2>Equipment Reference Metrics</h2>
      <span>${entries.length} ${entries.length === 1 ? 'reference' : 'references'}</span>
    </div>
    <div class="tcc-equipment-grid">${cards}</div>
    ${checkBlock}
  `;
  equipmentMetricsPanel.classList.remove('hidden');
}
function protectiveCheckName(entry) {
  return entry?.selection?.name || entry?.selection?.baseDevice?.name || entry?.selection?.uid || 'Protective device';
}

function equipmentAssociationReviewDetail(evaluation) {
  const reason = evaluation.associationReason;
  if (reason === 'ambiguous_nearest_upstream_devices' || reason === 'ambiguous_plotted_device') {
    return 'Protection association is unknown because more than one nearest-upstream device is possible. Review the one-line topology and device assignments.';
  }
  if (reason === 'associated_device_not_plotted') {
    return 'Protection association is unknown because the uniquely assigned nearest-upstream device is not plotted. Plot that component-bound device and review the screening check.';
  }
  if (reason === 'constraint_data_incomplete') {
    return 'Protection screening is unknown because the equipment reference does not contain complete current/time data.';
  }
  return 'Protection association is unknown because no uniquely assigned nearest-upstream device was found. Review the one-line topology and device assignments.';
}

function formatRideThroughCheck(evaluation) {
  const { current, margin, overlay, status } = evaluation;
  if (status === 'review') {
    return {
      status: 'warning',
      screeningStatus: 'unknown',
      label: overlay.sourceLabel || overlay.name || 'Equipment',
      detail: equipmentAssociationReviewDetail(evaluation)
    };
  }
  const eventName = overlay.kind === 'inrush'
    ? 'inrush'
    : `${overlay.startProfile || 'motor start'}${overlay.estimated ? ' estimate' : ''}`.toLowerCase();
  return {
    status,
    label: overlay.sourceLabel || overlay.name || 'Equipment',
    detail: status === 'ok'
      ? `${protectiveCheckName(evaluation.entry)} rides through ${eventName} by ${formatCoordinationSeconds(margin)} s.`
      : `${protectiveCheckName(evaluation.entry)} may trip during ${eventName}; margin ${formatCoordinationSeconds(margin)} s at ${formatCoordinationCurrent(current)} A.`
  };
}

function formatDamageLimitCheck(evaluation) {
  const { margin, overlay, point, status } = evaluation;
  if (status === 'review') {
    return {
      status: 'warning',
      screeningStatus: 'unknown',
      label: overlay.sourceLabel || overlay.name || 'Equipment',
      detail: equipmentAssociationReviewDetail(evaluation)
    };
  }
  const noun = overlay.kind === 'cable'
    ? 'cable damage'
    : overlay.kind === 'motorThermal'
      ? 'motor thermal limit'
      : 'transformer damage';
  return {
    status,
    label: overlay.sourceLabel || overlay.name || 'Equipment',
    detail: status === 'ok'
      ? `${protectiveCheckName(evaluation.entry)} clears before ${noun} with ${formatCoordinationSeconds(margin)} s margin.`
      : `No plotted device clears before ${noun}; worst margin ${formatCoordinationSeconds(margin)} s at ${formatCoordinationCurrent(point.current)} A.`
  };
}

function computeEquipmentConstraintChecks(plotted = [], overlays = []) {
  return evaluateEquipmentConstraints(plotted, overlays, {
    componentFlowMap,
    componentDeviceUidMap: getComponentDeviceUidMap(),
    depthLimit: MAX_NEIGHBOR_DEPTH
  })
    .map(evaluation => (
      evaluation.kind === 'rideThrough'
        ? formatRideThroughCheck(evaluation)
        : formatDamageLimitCheck(evaluation)
    ));
}
function resolvePlotDomains(devicePlots, overlays, faultCurrentA, allCurrents, allTimes) {
  const preset = normalizeRangePreset(activeRangePreset);
  return resolvePlotDomainsModel({
    preset,
    devicePlots,
    overlays,
    faultCurrentA,
    allCurrents,
    allTimes,
    defaultInrushDuration: DEFAULT_INRUSH_DURATION,
  });
}

async function plot() {
  const state = {
    activeCoordMarkerDrawer,
    activeCurvesUpdater,
    activeEquipmentConstraintChecks,
    activeEquipmentOverlays,
    activeLegendFocusKey,
    activePlotted,
    annotationContext,
    lastCoordState
  };
  try {
    return await renderTccChart({
      state,
      activeRangePreset,
      activeViewOptions,
      applySelectionSet,
      arcFlashOverlayComponentId,
      arcFlashOverlayControls,
      arcFlashOverlayThreshold,
      areCalloutsEnabled,
      bindEquipmentOverlayTooltip,
      chart,
      checkDuty,
      clampValue,
      clearPinnedChartDetail,
      clearPlotRefreshPending,
      collectNeighborDeviceDefaults,
      componentDeviceMap,
      computeEquipmentConstraintChecks,
      computeLegendLayout,
      contextMenu,
      d3,
      DEFAULT_INRUSH_DURATION,
      defaultAnnotationOffsets,
      deviceEntries,
      deviceMap,
      document,
      entryInteractiveKey,
      escapeHtml,
      exportCtiBtn,
      findSettingsDeviceDiv,
      focusDeviceSettings,
      formatCalloutDeviceLabel,
      formatSettingValue,
      formatViewSummaries,
      gatherOverridesFromInputs,
      getActiveComponentId,
      getComputedStyle,
      getContextDeviceRelationshipMap,
      getDeviceRelationship,
      getStudies,
      GFP_COLOR_PALETTE,
      hideCurveHoverTooltip,
      hydrateProtectiveDevices,
      incidentEnergyLimitCurve,
      isEquipmentOverlayKind,
      MAX_DELAY,
      MAX_PICKUP,
      MIN_DELAY,
      MIN_PICKUP,
      MOTOR_START_PLOT_CEILING,
      MOTOR_START_PLOT_FLOOR,
      normalizeProtectionType,
      persistSettings,
      plot,
      renderAnnotations,
      renderCoordOrderList,
      renderEquipmentMetrics,
      renderOneLinePreview,
      resolvePlotDomains,
      saved,
      scaleCurve,
      selectedDeviceIds,
      setItem,
      setPlotAvailability,
      setStudies,
      settingsDiv,
      shouldRenderCalloutForEntry,
      showCurveContextMenu,
      showCurveHoverTooltip,
      showPinnedCurveDetail,
      snapOverridesToOptions,
      snapSettingValue,
      startPerformanceMeasurement,
      summarizeActiveViewLabels,
      TCC_DEFAULT_CHART_HEIGHT,
      TCC_DEFAULT_CHART_WIDTH,
      TCC_MIN_PLOT_HEIGHT,
      updateCoordinationStatus,
      viewCalloutOffsets,
      violationDiv
    });
  } finally {
    ({
      activeCoordMarkerDrawer,
      activeCurvesUpdater,
      activeEquipmentConstraintChecks,
      activeEquipmentOverlays,
      activeLegendFocusKey,
      activePlotted,
      annotationContext,
      lastCoordState
    } = state);
  }
}

function autoCoordinate() {
  if (!activePlotted || !activePlotted.length) {
    showCoordResults(null, false, 'Plot devices first before running Auto-Coordinate.');
    return;
  }
  updateCoordinationStatus('Checking coordination margins...', 'pending');

  const contextId = getActiveComponentId();
  const faultKA = contextId ? getStudies().shortCircuit?.[contextId]?.threePhaseKA : null;
  const maxCurveA = activePlotted.reduce((acc, entry) => {
    const last = entry.scaled?.curve?.[entry.scaled.curve.length - 1]?.current ?? 0;
    return Math.max(acc, last);
  }, 0);
  const maxFaultA = faultKA ? faultKA * 1000 : Math.max(maxCurveA, 10000);

  // Build load→source order from coordOrderIds or reverse of plotted order
  let orderedEntries;
  if (coordOrderIds.length >= 2) {
    orderedEntries = coordOrderIds
      .map(uid => activePlotted.find(e => e.selection.uid === uid))
      .filter(Boolean);
  } else {
    orderedEntries = [...activePlotted].reverse();
  }

  // Filter to protective devices only
  orderedEntries = orderedEntries.filter(e =>
    isProtectiveType(e.selection?.baseDevice?.type)
  );

  if (orderedEntries.length < 2) {
    showCoordResults(null, false, 'At least 2 protective devices required for coordination.');
    return;
  }

  const deviceEntries = orderedEntries.map(entry => ({
    id: entry.selection.name || entry.selection.baseDevice?.name || entry.selection.uid,
    device: entry.selection.baseDevice,
    overrides: { ...entry.overrides }
  }));

  const margin = parseFloat(coordMarginInput?.value) || 0.3;

  // Separate phase devices from GFP devices and coordinate each plane independently
  const phaseDeviceEntries = deviceEntries.filter(e => !e.device?.groundFault);
  const gfpDeviceEntries = deviceEntries.filter(e => e.device?.groundFault === true);
  const phaseOrderedEntries = orderedEntries.filter(e => !e.selection?.baseDevice?.groundFault);
  const gfpOrderedEntries = orderedEntries.filter(e => e.selection?.baseDevice?.groundFault === true);

  let result = { results: [], allCoordinated: true };
  let gfpResult = null;

  if (phaseDeviceEntries.length >= 2) {
    result = greedyCoordinate(phaseDeviceEntries, maxFaultA, { margin, sampleCount: 50 });
    // Apply suggested time dials back to phase devices
    result.results.forEach((r, i) => {
      if (i === 0) return;
      const entry = phaseOrderedEntries[i];
      if (!entry || !r.found) return;
      const baseDevice = entry.selection?.baseDevice;
      const baseSettings = baseDevice?.settings || {};
      const phaseDialKey = (baseSettings.longTimePickup !== undefined || baseSettings.longTimeDelay !== undefined)
        ? 'longTimeDelay'
        : (baseDevice?.iec60255 === true ? 'tms' : 'time');
      entry.overrides = { ...entry.overrides, [phaseDialKey]: r.timeDial };
      if (typeof updateDeviceInputs === 'function') updateDeviceInputs(entry);
    });
  } else if (phaseDeviceEntries.length === 1) {
    result = greedyCoordinate(phaseDeviceEntries, maxFaultA, { margin, sampleCount: 50 });
  }

  if (gfpDeviceEntries.length >= 2) {
    gfpResult = greedyCoordinateGFP(gfpDeviceEntries, maxFaultA, { margin, sampleCount: 50 });
    // Apply suggested time dials back to GFP devices
    gfpResult.results.forEach((r, i) => {
      if (i === 0) return;
      const entry = gfpOrderedEntries[i];
      if (!entry || !r.found) return;
      entry.overrides = { ...entry.overrides, tms: r.timeDial };
      if (typeof updateDeviceInputs === 'function') updateDeviceInputs(entry);
    });
    if (!gfpResult.allCoordinated) result.allCoordinated = false;
  }

  lastCoordState = { deviceEntries, result, gfpResult, maxFaultA, margin };
  exportCtiBtn?.classList.remove('hidden');

  if (activeCurvesUpdater) activeCurvesUpdater();
  if (activeCoordMarkerDrawer) activeCoordMarkerDrawer(result.results, orderedEntries);
  const combinedCoordinated = result.allCoordinated && (gfpResult ? gfpResult.allCoordinated : true);
  const combinedResults = [
    ...result.results,
    ...(gfpResult?.results || []).map(r => ({ ...r, id: `GFP: ${r.id}` }))
  ];
  showCoordResults(combinedResults, combinedCoordinated);
}

function coordinationNextAction(result, violation) {
  const device = result?.id || 'upstream device';
  const current = Number.isFinite(violation?.current) ? ` near ${formatCoordinationCurrent(violation.current)} A` : '';
  return `Next step: increase delay or pickup on ${device}${current}, then rerun Auto-Coordinate and verify equipment references.`;
}

function showCoordResults(results, allCoordinated, message) {
  if (!coordPanel || !coordResultsDiv) return;
  coordPanel.open = true;
  coordPanel.classList.remove('hidden');

  if (message || !results) {
    coordResultsDiv.innerHTML = `<p class="coord-status">${escapeHtml(message || 'No results.')}</p>`;
    updateCoordinationStatus(message || 'No coordination results are available.', 'warning');
    return;
  }

  const lines = [];
  if (allCoordinated) {
    lines.push('<p class="coord-status coord-ok">All adjacent device pairs are coordinated.</p>');
    updateCoordinationStatus('All adjacent device pairs are coordinated.', 'ok');
  } else {
    const violationEntries = results.flatMap((r, index) => (
      index === 0
        ? []
        : (r.violations || []).map(v => ({ ...v, device: r.id }))
    ));
    const failedDevices = results.filter((r, index) => index > 0 && !r.found).length;
    const worst = violationEntries
      .filter(v => Number.isFinite(v.gap))
      .sort((a, b) => a.gap - b.gap)[0] || null;
    const violationCount = violationEntries.length;
    const statusDetail = violationCount
      ? `${violationCount} ${violationCount === 1 ? 'violation' : 'violations'} across ${failedDevices} ${failedDevices === 1 ? 'device' : 'devices'}`
      : `${failedDevices} ${failedDevices === 1 ? 'device needs' : 'devices need'} review`;
    const worstResult = worst ? results.find(result => result.id === worst.device) : null;
    const worstDetail = worst
      ? ` Worst gap: ${formatCoordinationSeconds(worst.gap)} s at ${formatCoordinationCurrent(worst.current)} A. ${coordinationNextAction(worstResult, worst)}`
      : '';
    lines.push(`<p class="coord-status coord-fail">Coordination gaps remain: ${escapeHtml(statusDetail)}.${escapeHtml(worstDetail)}</p>`);
    updateCoordinationStatus(`Coordination gaps remain: ${statusDetail}.${worstDetail} Review the details below the chart.`, 'error');
  }

  results.forEach((r, i) => {
    if (i === 0) {
      lines.push(`<p><strong>${escapeHtml(r.id)}</strong> – reference (load-side, fixed)</p>`);
      return;
    }
    if (r.found) {
      lines.push(
        `<p class="coord-ok-item"><strong>${escapeHtml(r.id)}</strong> – time dial set to ${r.timeDial.toFixed(3)}</p>`
      );
    } else {
      lines.push(
        `<p class="coord-warn"><strong>${escapeHtml(r.id)}</strong> – cannot achieve coordination (${r.violations?.length ?? 0} violations at max dial)</p>`
      );
      (r.violations ?? []).slice(0, 3).forEach(v => {
        if (!Number.isFinite(v.gap)) return;
        lines.push(
          `<p class="coord-violation-detail">I=${formatCoordinationCurrent(v.current)} A: gap ${formatCoordinationSeconds(v.gap)} s (need ${formatCoordinationSeconds(parseFloat(coordMarginInput?.value) || 0.3)} s). ${escapeHtml(coordinationNextAction(r, v))}</p>`
        );
      });
    }
  });

  if (activeEquipmentConstraintChecks.length) {
    const warnings = activeEquipmentConstraintChecks.filter(check => check.status === 'warning');
    const statusClass = warnings.length ? 'coord-warn' : 'coord-ok-item';
    const summary = warnings.length
      ? `${warnings.length} equipment reference ${warnings.length === 1 ? 'check needs' : 'checks need'} review.`
      : 'Equipment reference checks are within the plotted protective curves.';
    lines.push(`<p class="${statusClass}"><strong>Equipment references</strong> - ${escapeHtml(summary)}</p>`);
    activeEquipmentConstraintChecks.slice(0, 6).forEach(check => {
      lines.push(
        `<p class="coord-violation-detail">${escapeHtml(check.label)}: ${escapeHtml(check.detail)}</p>`
      );
    });
    if (warnings.length && allCoordinated) {
      updateCoordinationStatus(`${summary} Review the equipment metrics below the chart status.`, 'warning');
    }
  }

  coordResultsDiv.innerHTML = lines.join('');
}

function moveCoordOrderUid(fromUid, toUid) {
  if (!fromUid || !toUid || fromUid === toUid) return false;
  const fromIdx = coordOrderIds.indexOf(fromUid);
  const toIdx = coordOrderIds.indexOf(toUid);
  if (fromIdx === -1 || toIdx === -1) return false;
  coordOrderIds.splice(fromIdx, 1);
  coordOrderIds.splice(toIdx, 0, fromUid);
  renderCoordOrderList();
  return true;
}

function moveCoordOrderIndex(index, delta) {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= coordOrderIds.length) return false;
  const [uid] = coordOrderIds.splice(index, 1);
  coordOrderIds.splice(nextIndex, 0, uid);
  renderCoordOrderList();
  const escapedUid = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(uid)
    : String(uid).replace(/"/g, '\\"');
  const moved = coordOrderList?.querySelector(`[data-uid="${escapedUid}"]`);
  moved?.focus?.();
  return true;
}

function renderCoordOrderList() {
  const state = { coordOrderIds };
  try {
    return renderCoordinationOrderView({
      state,
      activePlotted,
      coordOrderList,
      document,
      isProtectiveType,
      moveCoordOrderIndex,
      moveCoordOrderUid
    });
  } finally {
    coordOrderIds = state.coordOrderIds;
  }
}

function renderOneLinePreview(componentId) {
  const state = { onelinePreviewSvgEl, onelinePreviewTransform };
  try {
    return renderOneLinePreviewView(componentId, {
      state,
      buildAnnotationPreviewLines,
      clampValue,
      componentLabel,
      componentLookup,
      d3,
      deviceMap,
      getContextComponentRelationshipMap,
      getCurveColorForComponentId,
      getPreviewDefinition,
      normalizeAnnotationPreview,
      normalizeTypeKey,
      onelinePreviewContainer,
      onelinePreviewEmpty,
      onelinePreviewNote,
      onelinePreviewSvg,
      placeholderIcon,
      PREVIEW_SHAPE_DASH_PATTERNS,
      previewPositionOverrides,
      renderOneLinePreview,
      resolveIconSource,
      selectedDeviceIds,
      setActiveComponent
    });
  } finally {
    onelinePreviewTransform = state.onelinePreviewTransform;
  }
}
