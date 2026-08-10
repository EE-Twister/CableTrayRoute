import { bootstrapPage } from './src/lifecycle/pageBootstrap.js';
import { scheduleNoncriticalWork } from './src/one-line/deferredStartup.js';
import { createBoxSpatialIndex, createOneLineRenderPerformance, prepareAtomicRenderLayer, snapComponentsToGrid } from './src/one-line/renderPerformance.js';
import { createProtectiveDeviceCatalogLoader } from './src/protectiveDevices/catalogLoader.mjs';
import { loadReferencedProtectiveDevices } from './src/protectiveDevices/calculationCatalog.mjs';
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
import { getOneLine, setOneLine, getEquipment, setEquipment, getPanels, setPanels, getLoads, setLoads, getCables, getOneLineScheduleCollections, setCables, setProjectEntityCollections, addRaceway, getItem, setItem, migrateLegacyItem, getStudies, setStudies, on, getCurrentScenario, switchScenario, STORAGE_KEYS, loadProject, saveProject } from './dataStore.mjs';
import { previewScheduleReconcile, applyScheduleReconcilePreview, synchronizeCanonicalSchedules } from './analysis/scheduleReconcile.mjs';
import { runLoadFlow } from './analysis/loadFlow.js';
import { renderLoadFlowResultsHtml } from './analysis/loadFlowResultsRenderer.js';
import { applyTapRatioToOneLine, evaluateTransformerTapOptimization } from './analysis/transformerTapOptimization.mjs';
import { runShortCircuit } from './analysis/shortCircuit.mjs';
import { runArcFlash } from './analysis/arcFlash.mjs';
import { runHarmonics } from './analysis/harmonics.js';
import { runNetworkHarmonics } from './analysis/harmonicNetwork.mjs';
import { runMotorStart } from './analysis/motorStart.js';
import { runReliability } from './analysis/reliability.js';
// Worker-routed entry points for user-initiated study buttons (load flow,
// short circuit, reliability). The sync imports above remain in scope for
// programmatic callers and tests that drive the same analyses without an
// async boundary; the OffMain wrappers post the active diagram to
// onelineWorker.js so the calculation never blocks paint on large models.
import {
  runLoadFlow as runLoadFlowOffMain,
  runShortCircuit as runShortCircuitOffMain,
  runReliability as runReliabilityOffMain,
} from './src/workers/onelineClient.js';
import { generateArcFlashReport, openLabelPrintWindow } from './reports/arcFlashReport.mjs';
import { exportAllReports } from './reports/exportAll.mjs';
import { sizeConductor } from './sizing.js';
import { runValidation } from './validation/rules.js';
import { runDiagramValidationPasses } from './src/one-line/validation.js';
import { exportPDF } from './exporters/pdf.js';
import { exportDXF, exportDWG } from './exporters/dxf.js';
import { ensureFieldAssistiveText, openModal, showAlertModal } from './src/components/modal.js';
import { applyLiveReadings, createLivePollingController, evaluateLiveAlarms, exportLiveTrendCsv, formatLiveReading, formatLiveAlarmRule, getLiveTrendMetrics, getLiveTrendSeries, isLiveReadingStale, normalizeLiveTagConfig, summarizeLiveTrend } from './analysis/liveTagAdapter.mjs';
import { resolveOneLineProbe } from './src/crossProbe.js';
import {
  READINESS_VOCABULARY,
  getContractReadinessCopy
} from './src/workflowStatus.js';
import { normalizeVoltageToVolts, toBaseKV } from './utils/voltage.js';
import { calculateTransformerImpedance } from './utils/transformerImpedance.js';
import { computeImpedanceFromPerKm } from './utils/cableImpedance.js';
import { normalizeCablePhases, formatCablePhases } from './utils/cablePhases.js';
import { compatibleProtectiveDevices, componentProtectionKind } from './src/one-line/protectiveDeviceCompatibility.mjs';
import { normalizeComponentElectricalProperties } from './src/one-line/componentElectricalSchema.mjs';
import {
  computeProtectionZoneBounds,
  createProtectionZone as createProtectionZoneModel,
  deleteProtectionZone as deleteProtectionZoneModel,
  getProtectionZones as getProtectionZonesModel,
  renameProtectionZone as renameProtectionZoneModel,
  setProtectionZoneColor,
  setProtectionZoneVisibility,
  toggleProtectionZoneComponent,
} from './src/one-line/protectionZones.mjs';
import { renderProtectionZonePanel } from './src/one-line/protectionZonePanel.mjs';
import {
  createComponentGroup,
  getComponentBounds,
  getConnectedComponentIds,
  getEnergizedComponentIds,
  getGroupMembers
} from './src/one-line/diagramModel.mjs';
import {
  findPairedConnector,
  getSheetLinkBadgeText,
  normalizeSheetLinkValue,
  resolveLinkedSheetIndex,
  validateSheetLinks
} from './src/one-line/sheetLinks.mjs';
import {
  BUILT_IN_HARMONIC_PROFILES,
  MANUAL_HARMONIC_PROFILE_ID,
  createCustomHarmonicProfile,
  defaultHarmonicProfileId,
  estimateVoltageHarmonicPoints,
  findHarmonicProfileById as findHarmonicProfileByIdInLibrary,
  findHarmonicProfileBySpectrum as findHarmonicProfileBySpectrumInLibrary,
  formatHarmonicMetric,
  harmonicThdPercent,
  mergeHarmonicProfiles,
  normalizeHarmonicProfile,
  parseHarmonicSpectrumPoints
} from './src/one-line/harmonicProfiles.mjs';
import {
  getEngineeringLabelLines as buildEngineeringLabelLines,
  resolveComponentAttribute as resolveOneLineComponentAttribute
} from './src/one-line/componentAttributes.mjs';
import {
  chooseDatablockPlacement,
  chooseEngineeringDatablockPlacement as chooseEngineeringDatablockPlacementForModel,
  createDatablockLayout as createDatablockLayoutForModel,
  truncateDatablockLine
} from './src/one-line/datablockLayout.mjs';
import {
  getNestedComponentValue,
  inferSchemaFromProps
} from './src/one-line/componentPropertyModel.mjs';
import {
  applyIndustrySymbolGeometry as applyIndustrySymbolGeometryForModel,
  categoryForType,
  coerceNumber,
  defaultRotationForType,
  getDefaultPorts,
  getIndustrySymbolProfile as getIndustrySymbolProfileForModel,
  industrySymbolGeometry,
  normalizePortsForCategory as normalizePortsForCategoryForModel,
  normalizeRotation,
  remapPortsForVerticalOneLineFlow as remapPortsForVerticalOneLineFlowForModel,
  shouldUseVerticalOneLinePorts,
  visualSizeForRotation
} from './src/one-line/componentGeometry.mjs';
import { CABLE_PROPERTY_METADATA, createBuiltInComponents } from './src/one-line/builtInComponentCatalog.mjs';
import {
  createStudyInputFieldSpecs,
  resolveStudyInputFieldSpecs as resolveStudyInputFieldSpecsForModel
} from './src/one-line/studyInputModel.mjs';
import {
  connectionLabelPosition,
  routeConnection as buildConnectionRoute
} from './src/one-line/connectionRouting.mjs';
import { createDiagramHistoryController } from './src/one-line/historyController.mjs';
import { createPaletteController } from './src/one-line/paletteController.mjs';
import {
  applyPropertyFieldFromForm,
  formatPropertyFieldLabel,
  formatPropertyNumber,
  normalizePropertySchema,
  parsePropertyNumber,
  readPropertyValue
} from './src/one-line/propertyEditorModel.mjs';
import {
  createPropertyEditorController,
  getPropertyEditorDeviceLabel
} from './src/one-line/propertyEditorController.mjs';
import { renderConnections } from './src/one-line/connectionRenderController.mjs';
import { createLiveTelemetryViewController } from './src/one-line/liveTelemetryViewController.mjs';
import { createStudyPanelController } from './src/one-line/studyPanelController.mjs';
import { createSheetPersistenceController } from './src/one-line/sheetPersistenceController.mjs';
import { createDiagramFileController } from './src/one-line/diagramFileController.mjs';
import { renderComponentNodes } from './src/one-line/componentNodeRenderController.mjs';
import { createPropertyDetailRenderer } from './src/one-line/propertyDetailView.mjs';
import { createStudyExecutionController } from './src/one-line/studyExecutionController.mjs';
import { createEventStateAdapter, initializeOneLineEvents } from './src/one-line/eventBindingController.mjs';
import {
  resolveTransformerKva,
  resolveTransformerPercentZ,
  resolveTransformerXrRatio,
  deriveTransformerBaseKV,
  computeTransformerBaseKV,
  syncTransformerDefaults
} from './utils/transformerProperties.js';
import './site.js';
import { getAuthRole, getProjectState, readAppSetting, writeAppSetting } from './projectStorage.js';

const ONE_LINE_READINESS_COPY = getContractReadinessCopy('oneline.html');

let componentMeta = {};

document.querySelectorAll('.oneline-canvas-scroll > .prop-modal').forEach(modal => {
  document.body.appendChild(modal);
});

function ensurePropModal() {
  let modal = document.getElementById('prop-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'prop-modal';
    modal.className = 'prop-modal';
    document.body.appendChild(modal);
  }
  return modal;
}

const baseHref = document.querySelector('base')?.href || new URL('.', window.location.href).href;
const asset = path => new URL(path, baseHref).href;

let projectId = 'default';
if (typeof window !== 'undefined') {
  if (typeof location !== 'undefined') {
    const hash = location.hash;
    if (hash && hash.startsWith('#') && !hash.startsWith('#project=')) {
      try {
        const decoded = decodeURIComponent(hash.slice(1)).trim();
        if (decoded) projectId = decoded;
      } catch (e) { console.warn('[oneline] failed to decode URL hash as project id:', e); }
    } else if (window.currentProjectId && window.currentProjectId.trim()) {
      projectId = window.currentProjectId;
    }
  } else if (window.currentProjectId && window.currentProjectId.trim()) {
    projectId = window.currentProjectId;
  }
  window.currentProjectId = projectId || 'default';
}
if (projectId) {
  loadProject(projectId);
  [STORAGE_KEYS.oneLine, STORAGE_KEYS.equipment, STORAGE_KEYS.panels, STORAGE_KEYS.loads, STORAGE_KEYS.cables, STORAGE_KEYS.trays, STORAGE_KEYS.conduits, STORAGE_KEYS.ductbanks].forEach(k => {
    on(k, () => {
      const targetId = (typeof window !== 'undefined' && window.currentProjectId) ? window.currentProjectId : projectId;
      if (targetId) saveProject(targetId);
    });
  });
}

const oneLineSymbolAssetVersion = 'professional-symbols-v6';

const typeIcons = {
  panel: asset(`icons/components/MLO.svg?v=${oneLineSymbolAssetVersion}`),
  equipment: asset('icons/equipment.svg'),
  load: asset('icons/load.svg'),
  bus: asset(`icons/Bus.svg?v=${oneLineSymbolAssetVersion}`),
  cable: asset('icons/oneline.svg'),
  busway: asset('icons/components/Busway.svg'),
  utility_source: asset(`icons/components/Utility.svg?v=${oneLineSymbolAssetVersion}`),
  ups: asset(`icons/components/UPS.svg?v=${oneLineSymbolAssetVersion}`),
  motor: asset(`icons/components/Motor.svg?v=${oneLineSymbolAssetVersion}`),
  motor_load: asset(`icons/components/Motor.svg?v=${oneLineSymbolAssetVersion}`),
  static_load: asset(`icons/components/Load.svg?v=${oneLineSymbolAssetVersion}`),
  shunt_capacitor_bank: asset(`icons/components/CapacitorBank.svg?v=${oneLineSymbolAssetVersion}`),
  reactor: asset(`icons/components/Reactor.svg?v=${oneLineSymbolAssetVersion}`),
  sources: asset('icons/sources.svg'),
  links: asset('icons/links.svg'),
  annotations: asset('icons/annotation.svg')
};

const placeholderIcon = asset('icons/placeholder.svg');

const physicalFieldNameSet = new Set([
  'enclosure',
  'enclosure_type',
  'enclosure_rating',
  'electrode_config',
  'electrode_configuration',
  'gap',
  'air_gap',
  'arc_gap',
  'working_distance',
  'enclosure_height',
  'enclosure_width',
  'enclosure_depth',
  'box_height',
  'box_width',
  'box_depth',
  'clearance',
  'physical_spacing'
]);

const physicalFieldKeywordList = [
  'electrode',
  'enclosure',
  'working distance',
  'working_distance',
  'gap',
  'clearance',
  'spacing',
  'cabinet',
  'housing'
];

const studyInputFieldNameSet = new Set([
  'mtbf',
  'mttr',
  'clearing_time',
  'enclosure',
  'gap',
  'working_distance',
  'enclosure_height',
  'enclosure_width',
  'enclosure_depth',
  'box_height',
  'box_width',
  'box_depth',
  'electrode_config',
  'electrode_configuration',
  'inrush_multiple',
  'inrush_duration',
  'harmonicSource',
  'harmonic_source',
  'harmonicProfileId',
  'harmonic_profile_id',
  'harmonics',
  'harmonic_spectrum',
  'harmonicsA',
  'harmonicsB',
  'harmonicsC',
  'scMVA',
  'short_circuit_mva'
]);

const impedanceFieldNameSet = new Set([
  'impedance_r',
  'impedance_x',
  'cable_impedance_r',
  'cable_impedance_x'
]);

function isPhysicalPropertyField(field) {
  if (!field || typeof field !== 'object') return false;
  const rawName = typeof field.name === 'string' ? field.name.toLowerCase() : '';
  const rawLabel = typeof field.label === 'string' ? field.label.toLowerCase() : '';
  if (rawName && physicalFieldNameSet.has(rawName)) return true;
  return physicalFieldKeywordList.some(keyword => {
    const key = keyword.toLowerCase();
    return (rawName && rawName.includes(key)) || (rawLabel && rawLabel.includes(key));
  });
}

function hasImpedance(holder) {
  return !!(holder && holder.impedance && typeof holder.impedance === 'object');
}

function hasImpedanceValues(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(obj, 'r') || Object.prototype.hasOwnProperty.call(obj, 'x');
}

function getImpedancePart(holder, key) {
  if (!holder || !holder.impedance || typeof holder.impedance !== 'object') return '';
  const val = holder.impedance[key];
  return val === undefined || val === null ? '' : val;
}

function setImpedancePart(holder, key, value, { keepEmpty = false } = {}) {
  if (!holder || typeof holder !== 'object') return;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '' || raw === null || raw === undefined) {
    if (holder.impedance && typeof holder.impedance === 'object') {
      delete holder.impedance[key];
      if (!keepEmpty && !hasImpedanceValues(holder.impedance)) {
        delete holder.impedance;
      }
    }
    return;
  }
  const num = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(num)) {
    if (holder.impedance && typeof holder.impedance === 'object') {
      delete holder.impedance[key];
      if (!keepEmpty && !hasImpedanceValues(holder.impedance)) {
        delete holder.impedance;
      }
    }
    return;
  }
  if (!holder.impedance || typeof holder.impedance !== 'object') holder.impedance = {};
  holder.impedance[key] = num;
}

function normalizeCategoryValue(value) {
  switch (value) {
    case 'bus':
    case 'equipment':
    case 'protection':
    case 'load':
    case 'sources':
    case 'links':
    case 'annotations':
    case 'cable':
      return value;
    default:
      return value ? categoryForType(value) : '';
  }
}

function clampPaletteWidth(value, fallback = defaultPaletteWidth) {
  if (value === null || value === undefined || value === '') {
    return clampPaletteWidth(fallback, defaultPaletteWidth);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return clampPaletteWidth(fallback, defaultPaletteWidth);
  }
  if (numeric < minPaletteWidth) return minPaletteWidth;
  if (numeric > maxPaletteWidth) return maxPaletteWidth;
  return numeric;
}

const minStudiesWidth = 280;
const maxStudiesWidth = 900;
const defaultStudiesWidth = (() => {
  if (typeof window === 'undefined') return 420;
  const approx = Math.round(window.innerWidth * 0.28);
  if (!Number.isFinite(approx)) return 420;
  if (approx < minStudiesWidth) return minStudiesWidth;
  if (approx > maxStudiesWidth) return maxStudiesWidth;
  return approx;
})();

function clampStudiesWidth(value, fallback = defaultStudiesWidth) {
  if (value === null || value === undefined || value === '') {
    return clampStudiesWidth(fallback, defaultStudiesWidth);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return clampStudiesWidth(fallback, defaultStudiesWidth);
  }
  if (numeric < minStudiesWidth) return minStudiesWidth;
  if (numeric > maxStudiesWidth) return maxStudiesWidth;
  return numeric;
}

const compWidth = 80;
const compHeight = 40;
const equipmentHorizontalAutoSpace = 190;
const equipmentAutoSpaceRowTolerance = 70;
const attributeLineHeight = 12;
const viewAttributeStorageKey = 'diagramViewAttributes';
const drawingModeStorageKey = 'oneLineDrawingMode';
const datablockFormatStorageKey = 'oneLineDatablockFormat';
const datablockDensityStorageKey = 'oneLineDatablockDensity';
const datablockDefaultVersionStorageKey = 'oneLineDatablockDefaultVersion';
const dataStateOverlayStorageKey = 'oneLineDataStateOverlay';
const dataStateOverlayDefaultVersionStorageKey = 'oneLineDataStateOverlayDefaultVersion';
const operatingStateStorageKey = 'oneLineOperatingState';
const paletteFilterStorageKey = 'oneLinePaletteFilter';
const paletteFilterDefaultVersionStorageKey = 'oneLinePaletteFilterDefaultVersion';
const paletteRecentStorageKey = 'oneLinePaletteRecent';
const paletteFavoritesStorageKey = 'oneLinePaletteFavorites';
const PALETTE_RECENT_LIMIT = 8;
const PALETTE_FAVORITES_LIMIT = 12;
const maxViewAttributeCount = 250;
const maxViewAttributeLength = 128;
const defaultPaletteWidth = 250;
const minPaletteWidth = 100;
const maxPaletteWidth = 600;
const paletteWidthStorageKey = 'onelinePaletteWidth';
const studiesWidthStorageKey = 'onelineStudiesWidth';
const customComponentStorageKey = 'customComponents';
const customComponentScenarioKey = '__ctr_custom_components__';
const customComponentPrefillStorageKey = 'ctrCustomComponentPrefill';
const paletteContextMenu = document.getElementById('palette-context-menu');

const oneLineViewSettingPrefix = 'ctr:oneline:view:';

function getOneLineViewSetting(key, fallback = null) {
  const raw = readAppSetting(`${oneLineViewSettingPrefix}${key}`);
  if (raw === null || raw === undefined) return getItem(key, fallback);
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function setOneLineViewSetting(key, value) {
  writeAppSetting(`${oneLineViewSettingPrefix}${key}`, JSON.stringify(value));
}

function normalizeShortcut(value) {
  if (typeof value !== 'string') return '';
  const parts = value.split('+').map(part => part.trim()).filter(Boolean);
  const key = parts.pop();
  if (!key || key.length !== 1 || !/^[a-z0-9]$/i.test(key)) return '';
  const modifiers = new Set(parts.map(part => part.toLowerCase()));
  if ([...modifiers].some(part => part !== 'alt' && part !== 'shift')) return '';
  return `${modifiers.has('alt') ? 'Alt+' : ''}${modifiers.has('shift') ? 'Shift+' : ''}${key.toUpperCase()}`;
}

function getShortcutBindings() {
  const stored = getOneLineViewSetting(ONE_LINE_SHORTCUTS_SETTING_KEY, {});
  const values = stored && typeof stored === 'object' ? stored : {};
  const seen = new Set();
  return ONE_LINE_SHORTCUT_DEFINITIONS.reduce((bindings, definition) => {
    const candidate = normalizeShortcut(values[definition.id]) || definition.defaultShortcut;
    const shortcut = seen.has(candidate) ? definition.defaultShortcut : candidate;
    seen.add(shortcut);
    bindings[definition.id] = shortcut;
    return bindings;
  }, {});
}

function setShortcutBindings(bindings) {
  setOneLineViewSetting(ONE_LINE_SHORTCUTS_SETTING_KEY, bindings);
  updateShortcutControlLabels();
}

function updateShortcutControlLabels() {
  const bindings = getShortcutBindings();
  const repeatButton = document.getElementById('repeat-last-symbol-btn');
  if (repeatButton) repeatButton.title = `Repeat last command (${bindings['repeat-last']})`;
}

function shortcutFromEvent(event) {
  if (event.ctrlKey || event.metaKey || event.isComposing) return '';
  const key = typeof event.key === 'string' ? event.key : '';
  if (key.length !== 1 || !/^[a-z0-9]$/i.test(key)) return '';
  return `${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${key.toUpperCase()}`;
}

function commandForShortcut(event) {
  const shortcut = shortcutFromEvent(event);
  if (!shortcut) return null;
  return ONE_LINE_SHORTCUT_DEFINITIONS.find(definition => getShortcutBindings()[definition.id] === shortcut) || null;
}

function rememberRepeatableCommand(command) {
  if (!command?.id) return;
  lastRepeatableCommand = { ...command };
}

function getPaletteSubtypeList(key, limit) {
  const value = getOneLineViewSetting(key, []);
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(subtype => typeof subtype === 'string' && subtype.trim()))].slice(0, limit);
}

function getPaletteFavorites() {
  return getPaletteSubtypeList(paletteFavoritesStorageKey, PALETTE_FAVORITES_LIMIT);
}

function getPaletteRecent() {
  return getPaletteSubtypeList(paletteRecentStorageKey, PALETTE_RECENT_LIMIT);
}

function recordPaletteUsage(subtype) {
  if (!subtype || !componentMeta[subtype]) return;
  const next = [subtype, ...getPaletteRecent().filter(item => item !== subtype)].slice(0, PALETTE_RECENT_LIMIT);
  setOneLineViewSetting(paletteRecentStorageKey, next);
  rememberRepeatableCommand({ id: 'palette-symbol', subtype });
}

function togglePaletteFavorite(subtype) {
  if (!subtype || !componentMeta[subtype]) return false;
  const current = getPaletteFavorites();
  const existingIndex = current.indexOf(subtype);
  if (existingIndex !== -1) {
    current.splice(existingIndex, 1);
    setOneLineViewSetting(paletteFavoritesStorageKey, current);
    return false;
  }
  const next = [subtype, ...current].slice(0, PALETTE_FAVORITES_LIMIT);
  setOneLineViewSetting(paletteFavoritesStorageKey, next);
  return true;
}

function clearPaletteRecent() {
  setOneLineViewSetting(paletteRecentStorageKey, []);
}

let paletteContextTarget = null;

const attributeDisplayOverrides = {
  rating: { label: 'Rating', unit: '' },
  rating_a: { label: 'Rating', unit: 'A' },
  interrupt_rating_ka: { label: 'Interrupt Rating', unit: 'kA' },
  frame_a: { label: 'Frame', unit: 'A' },
  ref: { label: 'Node Tag', unit: '' },
  voltage: { label: 'Voltage', unit: 'V' },
  volts: { label: 'Voltage', unit: 'V' },
  volts_primary: { label: 'Primary Voltage', unit: 'V' },
  volts_secondary: { label: 'Secondary Voltage', unit: 'V' },
  volts_hv: { label: 'HV Voltage', unit: 'V' },
  volts_lv: { label: 'LV Voltage', unit: 'V' },
  volts_tv: { label: 'Tertiary Voltage', unit: 'V' },
  kva: { label: 'kVA', unit: '' },
  kva_hv: { label: 'HV kVA', unit: '' },
  kva_lv: { label: 'LV kVA', unit: '' },
  kva_tv: { label: 'TV kVA', unit: '' },
  percent_z: { label: 'Impedance', unit: '%' },
  z_hv_lv_percent: { label: 'Z HV-LV', unit: '%' },
  z_hv_tv_percent: { label: 'Z HV-TV', unit: '%' },
  z_lv_tv_percent: { label: 'Z LV-TV', unit: '%' },
  thevenin_mva: { label: 'Thevenin MVA', unit: 'MVA' },
  xr_ratio: { label: 'X/R Ratio', unit: '' },
  source_voltage_base: { label: 'Source Voltage', unit: 'kV' },
  short_circuit_capacity: { label: 'Short Circuit Capacity', unit: 'MVA' },
  source_impedance: { label: 'Source Impedance (R + jX)', unit: '' },
  sequence_impedances: { label: 'Sequence Impedances (Z1,Z2,Z0)', unit: '' },
  frequency_hz: { label: 'Frequency', unit: 'Hz' },
  grounding: { label: 'Grounding Type', unit: '' },
  voltage_regulation_percent: { label: 'Voltage Regulation', unit: '%' },
  phase_angle: { label: 'Phase Angle', unit: '°' },
  max_mw_delivery: { label: 'Max MW Delivery', unit: 'MW' },
  losses_r_percent: { label: 'Losses (R%)', unit: '%' },
  stability_response: { label: 'Stability Response', unit: '' },
  transformer_impedance: { label: 'Transformer Impedance', unit: '' },
  operating_mode: { label: 'Operating Mode', unit: '' },
  short_circuit_duration_cycles: { label: 'Short Circuit Duration', unit: 'cycles' },
  hp: { label: 'Horsepower', unit: 'HP' },
  pf: { label: 'Power Factor', unit: '' },
  service_factor: { label: 'Service Factor', unit: '' },
  efficiency: { label: 'Efficiency', unit: '%' },
  lr_current_pu: { label: 'Locked Rotor Current (p.u.)', unit: '' },
  starting: { label: 'Starting', unit: '' },
  vfd: { label: 'VFD', unit: '' },
  length_m: { label: 'Length', unit: 'm' },
  length_ft: { label: 'Length', unit: 'ft' },
  length: { label: 'Length', unit: '' },
  voltage_class: { label: 'Voltage Class', unit: '' },
  thermal_rating: { label: 'Thermal Rating', unit: '' },
  manufacturer: { label: 'Manufacturer', unit: '' },
  model: { label: 'Model', unit: '' },
  enclosure: { label: 'Enclosure', unit: '' },
  gap: { label: 'Gap', unit: 'mm' },
  working_distance: { label: 'Working Distance', unit: 'mm' },
  clearing_time: { label: 'Clearing Time', unit: 's' },
  tccId: { label: 'TCC Device', unit: '' },
  nominal_voltage_vdc: { label: 'Nominal DC Voltage', unit: 'Vdc' },
  grounding_scheme: { label: 'Grounding Scheme', unit: '' },
  max_continuous_current_a: { label: 'Max Continuous Current', unit: 'A' },
  short_circuit_rating_ka: { label: 'Short-Circuit Rating', unit: 'kA' },
  voltage_mag: { label: 'Voltage (p.u.)', unit: '' },
  voltage_mag_a: { label: 'Voltage A (p.u.)', unit: '' },
  voltage_mag_b: { label: 'Voltage B (p.u.)', unit: '' },
  voltage_mag_c: { label: 'Voltage C (p.u.)', unit: '' },
  'arcFlash.incidentEnergy': { label: 'Arc Flash Incident Energy', unit: 'cal/cm²' },
  'arcFlash.boundary': { label: 'Arc Flash Boundary', unit: 'mm' },
  'arcFlash.minimumArcRatingCalCm2': { label: 'Minimum Arc Rating', unit: 'cal/cm²' },
  'arcFlash.clearingTime': { label: 'Arc Flash Clearing Time', unit: 's' },
  'shortCircuit.method': { label: 'Short-Circuit Method', unit: '' },
  'shortCircuit.prefaultKV': { label: 'Prefault Voltage', unit: 'kV' },
  'shortCircuit.threePhaseKA': { label: 'Three-Phase Fault', unit: 'kA' },
  'shortCircuit.asymKA': { label: 'Asymmetrical Fault', unit: 'kA' },
  'shortCircuit.lineToGroundKA': { label: 'Line-to-Ground Fault', unit: 'kA' },
  'shortCircuit.lineToLineKA': { label: 'Line-to-Line Fault', unit: 'kA' },
  'shortCircuit.doubleLineGroundKA': { label: 'Double-Line-Ground Fault', unit: 'kA' },
  'reliability.availability': { label: 'Reliability Availability', unit: '' },
  'reliability.downtime': { label: 'Reliability Downtime', unit: 'h/year' }
};

const attributeIgnoreKeys = new Set([
  'id',
  'type',
  'subtype',
  'x',
  'y',
  'rotation',
  'rotationManual',
  'flipped',
  'connections',
  'label',
  'labelOffset',
  'width',
  'height',
  'ports',
  'impedance',
  'props',
  'arcFlash',
  'shortCircuit',
  'reliability'
]);

let cachedStudyResults = getStudies();

const studyAttributeResolvers = {
  arcFlash: comp => {
    if (!comp) return null;
    return cachedStudyResults?.arcFlash?.[comp.id] || null;
  },
  shortCircuit: comp => {
    if (!comp) return null;
    return cachedStudyResults?.shortCircuit?.[comp.id] || null;
  },
  reliability: comp => {
    if (!comp) return null;
    return cachedStudyResults?.reliability?.componentStats?.[comp.id] || null;
  }
};

function sanitizeViewAttributeKey(key) {
  if (typeof key !== 'string') return '';
  const normalized = key.trim();
  if (!normalized || normalized.length > maxViewAttributeLength) return '';
  return normalized;
}

function sanitizeViewAttributeList(keys) {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  const normalized = [];
  for (const key of keys) {
    const safeKey = sanitizeViewAttributeKey(key);
    if (!safeKey || seen.has(safeKey)) continue;
    seen.add(safeKey);
    normalized.push(safeKey);
    if (normalized.length >= maxViewAttributeCount) break;
  }
  normalized.sort();
  return normalized;
}

const storedViewAttributes = getOneLineViewSetting(viewAttributeStorageKey, []);
const initialViewAttributes = sanitizeViewAttributeList(storedViewAttributes);
if (Array.isArray(storedViewAttributes)) {
  const needsPersistedCleanup =
    storedViewAttributes.length !== initialViewAttributes.length ||
    storedViewAttributes.some((key, idx) => key !== initialViewAttributes[idx]);
  if (needsPersistedCleanup) {
    setOneLineViewSetting(viewAttributeStorageKey, initialViewAttributes);
  }
}
let viewAttributes = new Set(initialViewAttributes);
let attributeOptions = [];
const attributeOptionsMap = new Map();
let componentAttributeOptions = new Map();
let componentAttributeDisplayOverrides = new Map();
let componentAttributeList = [];
let componentAttributeLabelMap = new Map();
const viewComponentStorageKey = 'diagramViewComponentSelection';
let selectedViewComponent = getOneLineViewSetting(viewComponentStorageKey, null);

const datablockFormatPresets = Object.freeze({
  off: [],
  engineering: [
    'voltage',
    'volts',
    'rated_voltage_kv',
    'baseKV',
    'kV',
    'bus_rating_a',
    'rating_a',
    'frame_a',
    'rated_kva',
    'kva',
    'rated_hp',
    'hp',
    'kw',
    'kvar',
    'load.kw',
    'load.kvar',
    'percent_z',
    'impedance_z_percent',
    'tap_percent',
    'shortCircuit.threePhaseKA',
    'voltage_mag'
  ],
  nameplate: ['voltage', 'volts', 'rating_a', 'kva', 'hp', 'percent_z', 'manufacturer', 'model'],
  study: ['voltage_mag', 'shortCircuit.threePhaseKA', 'shortCircuit.asymKA', 'arcFlash.incidentEnergy', 'arcFlash.ppeCategory', 'reliability.availability'],
  protection: ['rating_a', 'frame_a', 'interrupt_rating_ka', 'short_circuit_rating_ka', 'clearing_time', 'shortCircuit.threePhaseKA', 'arcFlash.incidentEnergy'],
  report: ['amp_trip', 'voltage_ratio', 'winding'],
  cable: ['voltage', 'length', 'cable_type', 'conductor_size', 'conductor_material', 'short_circuit_rating_ka']
});
const datablockFormatLabels = Object.freeze({
  off: 'Off',
  engineering: 'Engineering Labels',
  nameplate: 'Nameplate',
  study: 'Studies',
  protection: 'Protection',
  report: 'Report Annotations',
  cable: 'Cable',
  custom: 'Custom'
});
const datablockDensityLabels = Object.freeze({
  compact: 'Compact',
  expanded: 'Expanded'
});
const drawingModeLabels = Object.freeze({
  edit: 'Edit',
  engineeringPrint: 'Engineering Print'
});
let oneLineDrawingMode = getOneLineViewSetting(drawingModeStorageKey, 'edit');
if (!Object.prototype.hasOwnProperty.call(drawingModeLabels, oneLineDrawingMode)) {
  oneLineDrawingMode = 'edit';
}
let datablockFormatMode = getOneLineViewSetting(datablockFormatStorageKey, viewAttributes.size ? 'custom' : 'off');
if (!Object.prototype.hasOwnProperty.call(datablockFormatLabels, datablockFormatMode)) {
  datablockFormatMode = viewAttributes.size ? 'custom' : 'off';
}
if (getOneLineViewSetting(datablockDefaultVersionStorageKey, '') !== 'clean-canvas-v1' && datablockFormatMode !== 'custom') {
  datablockFormatMode = 'off';
  viewAttributes = new Set();
  setOneLineViewSetting(datablockFormatStorageKey, datablockFormatMode);
  setOneLineViewSetting(viewAttributeStorageKey, []);
  setOneLineViewSetting(datablockDefaultVersionStorageKey, 'clean-canvas-v1');
}
let datablockDensityMode = getOneLineViewSetting(datablockDensityStorageKey, 'compact');
if (!Object.prototype.hasOwnProperty.call(datablockDensityLabels, datablockDensityMode)) {
  datablockDensityMode = 'compact';
}

const dataStateOverlayLabels = Object.freeze({
  none: 'None',
  review: 'Data Quality',
  validation: 'Validation',
  loadFlow: 'Load Flow',
  faultDuty: 'Fault Duty',
  arcFlash: 'Arc Flash',
  operating: 'Operating State'
});
let dataStateOverlayMode = getOneLineViewSetting(dataStateOverlayStorageKey, 'none');
if (dataStateOverlayMode === 'studies') dataStateOverlayMode = 'loadFlow';
if (!Object.prototype.hasOwnProperty.call(dataStateOverlayLabels, dataStateOverlayMode)) {
  dataStateOverlayMode = 'none';
}
if (getOneLineViewSetting(dataStateOverlayDefaultVersionStorageKey, '') !== 'clean-canvas-v1') {
  dataStateOverlayMode = 'none';
  setOneLineViewSetting(dataStateOverlayStorageKey, dataStateOverlayMode);
  setOneLineViewSetting(dataStateOverlayDefaultVersionStorageKey, 'clean-canvas-v1');
}

const operatingStateLabels = Object.freeze({
  normal: 'Normal',
  emergency: 'Emergency',
  maintenance: 'Maintenance',
  switching: 'Switching',
  alternate: 'Alternate'
});
let activeOperatingState = getOneLineViewSetting(operatingStateStorageKey, 'normal');
if (!Object.prototype.hasOwnProperty.call(operatingStateLabels, activeOperatingState)) {
  activeOperatingState = 'normal';
}

const paletteCategoryFilters = Object.freeze({
  common: 'Common',
  all: 'All',
  sources: 'Sources',
  equipment: 'Equipment',
  protection: 'Protection',
  load: 'Loads',
  cable: 'Cables',
  annotations: 'Annotations'
});
let activePaletteCategoryFilter = getOneLineViewSetting(paletteFilterStorageKey, 'all');
if (!Object.prototype.hasOwnProperty.call(paletteCategoryFilters, activePaletteCategoryFilter)) {
  activePaletteCategoryFilter = 'all';
}
if (getOneLineViewSetting(paletteFilterDefaultVersionStorageKey, '') !== 'favorites-recent-palette-v1') {
  activePaletteCategoryFilter = 'all';
  setOneLineViewSetting(paletteFilterStorageKey, activePaletteCategoryFilter);
  setOneLineViewSetting(paletteFilterDefaultVersionStorageKey, 'favorites-recent-palette-v1');
}

function compKey(type, subtype) {
  return subtype ? `${type}_${subtype}` : type;
}

function resolveComponentMetaKey(comp) {
  if (!comp) return '';
  const subtype = typeof comp === 'string' ? comp : (comp.subtype || '');
  const type = typeof comp === 'string' ? '' : (comp.type || '');
  const legacyAliases = [
    ['panel_Panel', 'panel_panel'],
    ['ups', 'ups_ups'],
    ['utility', 'utility_source_utility'],
    ['static_load', 'static_load_static_load']
  ];
  const alias = legacyAliases.find(([legacy]) => legacy === subtype)?.[1];
  if (alias && componentMeta[alias]) return alias;
  if (subtype && componentMeta[subtype]) return subtype;
  const candidates = [
    type && subtype ? compKey(type, subtype) : '',
    type ? compKey(type, type) : '',
    subtype ? compKey(subtype, subtype) : ''
  ].filter(Boolean);
  const directCandidate = candidates.find(candidate => componentMeta[candidate]);
  if (directCandidate) return directCandidate;
  if (type && subtype) {
    const match = Object.entries(componentMeta).find(([, meta]) => (
      meta
      && String(meta.type || '').toLowerCase() === String(type).toLowerCase()
      && String(meta.subtype || '').toLowerCase() === String(subtype).toLowerCase()
    ));
    if (match) return match[0];
  }
  return subtype;
}

function resolveComponentMeta(comp) {
  return componentMeta[resolveComponentMetaKey(comp)] || componentMeta[comp?.subtype] || {};
}

function defaultRotationForMeta(meta, type = null) {
  return normalizeRotation(meta?.defaultRotation ?? defaultRotationForType(type || meta?.type, meta?.category));
}

function defaultRotationForComponent(comp) {
  const meta = componentMeta[comp?.subtype] || {};
  return normalizeRotation(meta.defaultRotation ?? defaultRotationForType(comp?.type || meta.type, meta.category || resolveComponentCategory(comp)));
}

const PALETTE_CATEGORIES = new Set([
  'equipment',
  'sources',
  'protection',
  'load',
  'bus',
  'cable',
  'links',
  'annotations'
]);

function isProtectionComponent(comp) {
  if (!comp || typeof comp !== 'object') return false;
  const subtypeMeta = resolveComponentMeta(comp);
  if (subtypeMeta?.category === 'protection') return true;
  if (subtypeMeta?.type && categoryForType(subtypeMeta.type) === 'protection') return true;
  if (comp.category === 'protection') return true;
  if (categoryForType(comp.type) === 'protection') return true;
  return false;
}

function isBusComponent(c) {
  return resolveComponentMeta(c)?.type === 'bus' || c.type === 'bus' || c.subtype === 'Bus';
}

function isSourceComponent(comp) {
  if (!comp) return false;
  const type = typeof comp.type === 'string' ? comp.type.toLowerCase() : '';
  if (type === 'transformer') return false;
  const category = resolveComponentCategory(comp);
  if (category === 'sources') return true;
  return type === 'utility_source'
    || type === 'generator'
    || type === 'pv_inverter'
    || type === 'pv_array'
    || type === 'bess_inverter'
    || type === 'battery';
}

function defaultPorts(type, subtype) {
  return getDefaultPorts(type, subtype, compWidth, compHeight);
}

function getIndustrySymbolProfile(comp, meta = resolveComponentMeta(comp)) {
  return getIndustrySymbolProfileForModel(comp, meta);
}

function applyIndustrySymbolGeometry(comp, meta = resolveComponentMeta(comp), { preserveCenter = true, force = false } = {}) {
  return applyIndustrySymbolGeometryForModel(comp, meta, {
    preserveCenter,
    force,
    defaultWidth: compWidth,
    defaultHeight: compHeight
  });
}

function remapPortsForVerticalOneLineFlow(ports, category, type, width = compWidth, height = compHeight) {
  return remapPortsForVerticalOneLineFlowForModel(ports, category, type, width, height);
}

function normalizePortsForCategory(category, ports, type, subtype, width = compWidth, height = compHeight) {
  return normalizePortsForCategoryForModel(category, ports, type, subtype, width, height);
}

const defaultBusProps = {
  volts: 13800,
  thevenin_mva: 500,
  xr_ratio: 10,
  grounding: 'solid',
  baseKV: 13.8,
  kV: 13.8,
  Vm: 1.0,
  Va: 0,
  prefault_voltage: 13.8,
  load: {
    kw: 0,
    kvar: 0
  },
  generation: {
    kw: 0,
    kvar: 0
  },
  enclosure: 'box',
  gap: 102,
  working_distance: 914,
  electrode_config: 'VCB'
};

const defaultShapeProps = {
  shapeType: 'rectangle',
  strokeColor: '#333333',
  fillColor: '#ffffff',
  fillOpacity: 1,
  strokeWidth: 2,
  strokeStyle: 'solid',
  cornerRadius: 12
};

const shapePropKeys = [
  'shapeType',
  'strokeColor',
  'fillColor',
  'fillOpacity',
  'strokeWidth',
  'strokeStyle',
  'cornerRadius'
];

const shapeDashPatterns = {
  solid: '',
  dashed: '8 4',
  dotted: '2 2'
};

function normalizeLowerChoice(value, fallback, allowed, aliases = {}) {
  const raw = typeof value === 'string' ? value : fallback;
  const normalized = typeof raw === 'string' ? raw.toLowerCase() : '';
  const mapped = aliases[normalized] || normalized;
  return allowed.includes(mapped) ? mapped : fallback;
}

function ensureShapeDefaults(comp) {
  if (!comp || comp.subtype !== 'annotation_custom_shape') return;
  if (!comp.props || typeof comp.props !== 'object') comp.props = {};
  const meta = resolveComponentMeta(comp);
  const defaults = { ...defaultShapeProps, ...(meta.props || {}) };
  shapePropKeys.forEach(key => {
    const current = comp[key];
    if (
      current === undefined ||
      current === null ||
      (typeof current === 'string' && current.trim() === '')
    ) {
      const fallback = defaults[key];
      if (fallback !== undefined) comp[key] = fallback;
    }
  });
  comp.shapeType = normalizeLowerChoice(
    comp.shapeType,
    normalizeLowerChoice(defaults.shapeType, 'rectangle', ['rectangle', 'rounded', 'circle'], { rounded_rectangle: 'rounded' }),
    ['rectangle', 'rounded', 'circle'],
    { rounded_rectangle: 'rounded' }
  );
  comp.strokeStyle = normalizeLowerChoice(
    comp.strokeStyle,
    normalizeLowerChoice(defaults.strokeStyle, 'solid', ['solid', 'dashed', 'dotted']),
    ['solid', 'dashed', 'dotted']
  );
  let strokeWidth = Number(comp.strokeWidth);
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
    strokeWidth = Number(defaults.strokeWidth) || 1;
  }
  comp.strokeWidth = strokeWidth;
  let radius = Number(comp.cornerRadius);
  if (!Number.isFinite(radius) || radius < 0) {
    radius = Number(defaults.cornerRadius) || 0;
  }
  const metaWidth = Number(meta.width);
  const metaHeight = Number(meta.height);
  let width = Number(comp.width);
  let height = Number(comp.height);
  if (!Number.isFinite(width) || width <= 0) width = Number.isFinite(metaWidth) ? metaWidth : 160;
  if (!Number.isFinite(height) || height <= 0) height = Number.isFinite(metaHeight) ? metaHeight : 100;
  if (comp.shapeType === 'circle') {
    const diameter = Number.isFinite(width) ? width : height;
    comp.width = Number.isFinite(diameter) && diameter > 0 ? diameter : (Number.isFinite(metaWidth) ? metaWidth : 160);
    comp.height = comp.width;
  } else {
    comp.width = width;
    comp.height = height;
  }
  const maxCorner = Math.min(comp.width, comp.height) / 2;
  if (Number.isFinite(maxCorner) && maxCorner >= 0) {
    comp.cornerRadius = Math.min(radius, maxCorner);
  } else {
    comp.cornerRadius = radius;
  }
  const strokeColor = typeof comp.strokeColor === 'string' ? comp.strokeColor.trim() : '';
  comp.strokeColor = strokeColor || defaults.strokeColor || '#333333';
  const fillColor = typeof comp.fillColor === 'string' ? comp.fillColor.trim() : '';
  comp.fillColor = fillColor || defaults.fillColor || '#ffffff';
  let fillOpacity = Number(comp.fillOpacity);
  if (!Number.isFinite(fillOpacity)) {
    const defaultOpacity = Number(defaults.fillOpacity);
    fillOpacity = Number.isFinite(defaultOpacity) ? defaultOpacity : 1;
  }
  fillOpacity = Math.max(0, Math.min(1, fillOpacity));
  comp.fillOpacity = fillOpacity;
  shapePropKeys.forEach(key => {
    comp.props[key] = comp[key];
  });
}

const builtinComponents = createBuiltInComponents({
  asset,
  typeIcons,
  placeholderIcon,
  symbolAssetVersion: oneLineSymbolAssetVersion,
  defaultBusProps,
  defaultShapeProps
});

const cablePropertyMetadata = CABLE_PROPERTY_METADATA;

let propSchemas = {};
let subtypeCategory = {};
let componentTypes = {};
let manufacturerDefaults = {};
let protectiveDevices = [];
const protectiveDeviceCatalog = createProtectiveDeviceCatalogLoader({
  indexUrl: asset('data/protectiveDeviceIndex.json'), shardBaseUrl: asset('data/protectiveDeviceCatalog'),
  legacyUrl: asset('data/protectiveDevices.json'),
});
let paletteWidth = clampPaletteWidth(getOneLineViewSetting(paletteWidthStorageKey, defaultPaletteWidth));
const storedStudiesWidth = getOneLineViewSetting(studiesWidthStorageKey, null);
let studiesWidth = defaultStudiesWidth;
let hasStoredStudiesWidth = false;
if (storedStudiesWidth !== null && storedStudiesWidth !== undefined && storedStudiesWidth !== '') {
  studiesWidth = clampStudiesWidth(storedStudiesWidth, defaultStudiesWidth);
  hasStoredStudiesWidth = true;
}
let resizingPalette = false;
let resizingStudiesPanel = false;
let studiesResizeStartX = 0;
let studiesResizeStartWidth = studiesWidth;

const voltageClasses = ['480 V', '5000 V', '15000 V', '25000 V'];
const thermalRatings = ['75C', '90C', '105C'];
const transformerConnectionOptions = [
  'Delta',
  'Wye (Grounded)',
  'Wye (Ungrounded)',
  'Zig-Zag',
  'Open Delta',
  'Open Wye'
];
const manufacturerModels = Object.freeze({
  ABB: ['MNS', 'SafeGear'],
  Siemens: ['SB1', 'S6'],
  GE: ['EntelliGuard', 'Spectra'],
  Schneider: ['QED-2', 'Blokset'],
  Caterpillar: ['XQ125', 'C175'],
  Cummins: ['C900', 'QSK60'],
  Generac: ['G2000', 'Industrial']
});
const manufacturerOptions = Object.keys(manufacturerModels);

function getManufacturerModels(manu) {
  if (!Object.hasOwn(manufacturerModels, manu)) return [];
  const models = manufacturerModels[manu];
  return Array.isArray(models) ? models : [];
}

function createTuningField(name, label, type, help) {
  return {
    name,
    label,
    type,
    help,
    getValue: comp => {
      if (!comp) return '';
      if (comp.props && Object.prototype.hasOwnProperty.call(comp.props, name)) {
        return comp.props[name];
      }
      return comp[name] ?? '';
    },
    setValue: (comp, raw) => {
      if (!comp) return;
      let value;
      if (type === 'number') {
        if (raw === '' || raw === null || raw === undefined) {
          value = '';
        } else if (typeof raw === 'number' && Number.isFinite(raw)) {
          value = raw;
        } else {
          const parsed = parseFloat(raw);
          value = Number.isFinite(parsed) ? parsed : '';
        }
      } else if (type === 'checkbox') {
        value = raw === true || raw === 'true' || raw === 'on' || raw === 1;
      } else {
        value = raw ?? '';
      }
      if (!comp.props || typeof comp.props !== 'object') {
        comp.props = { ...(comp.props || {}) };
      }
      comp.props[name] = value;
      comp[name] = value;
    }
  };
}

const capacitorBankPropertyFields = [
  createTuningField('rated_kvar', 'Rated Reactive Power (kVAR)', 'number',
    'Defines compensation capacity for capacitor/reactor studies.'),
  createTuningField('rated_kv', 'Rated Voltage (kV)', 'number',
    'Defines operating voltage for harmonic and compensation studies.'),
  createTuningField('steps', 'Steps (#)', 'number',
    'Defines switching granularity. Used for staged bank control.'),
  createTuningField('detuned', 'Detuned Reactor Installed', 'checkbox',
    'Flags whether detuned operation is enabled for resonance mitigation.'),
  createTuningField('tuning_hz', 'Tuning Frequency (Hz)', 'number',
    'Defines detuned tuning point used in harmonic resonance checks.'),
  createTuningField('reactor_pct', 'Reactor Percent (%)', 'number',
    'Defines series reactor percentage used for detuning calculations.'),
  createTuningField('switching_transient_class', 'Switching Transient Class', 'text',
    'Defines switching duty/transient class for capacitor bank operation.'),
  createTuningField('rated_voltage_kv', 'Legacy Rated Voltage (kV)', 'number',
    'Defines operating voltage. Used in power factor correction.'),
  createTuningField('reactive_power_kvar', 'Legacy Reactive Power (kVAR)', 'number',
    'Defines compensation capacity. Used in VAR support.'),
  createTuningField('connection_type', 'Connection Type (Y or Δ)', 'text',
    'Defines grounding scheme. Used in circuit calc.'),
  createTuningField('losses', 'Losses (W or %)', 'text',
    'Defines dielectric loss. Used for heat calc.'),
  createTuningField('discharge_resistor_mohm', 'Discharge Resistor (MΩ)', 'number',
    'Defines safety discharge. Used in transient modeling.'),
  createTuningField('harmonic_impedance', 'Harmonic Impedance', 'text',
    'Defines frequency response. Used in harmonic study.'),
  createTuningField('control_mode', 'Control Mode (manual/auto)', 'text',
    'Defines operation behavior. Used in network control.')
];

const generatorStudyFieldSpecs = [
  { name: 'rated_mva', label: 'Rated Power (MVA)', type: 'number', required: true, defaultValue: comp => {
    const ratedKw = Number(comp?.rated_kw ?? comp?.props?.rated_kw);
    return Number.isFinite(ratedKw) && ratedKw > 0 ? Number((ratedKw / 1000).toFixed(3)) : 1;
  } },
  { name: 'rated_kv', label: 'Rated Voltage (kV)', type: 'number', required: true, defaultValue: comp => {
    const baseKv = Number(comp?.kV ?? comp?.baseKV ?? comp?.props?.kV ?? comp?.props?.baseKV);
    return Number.isFinite(baseKv) && baseKv > 0 ? baseKv : 0.48;
  } },
  { name: 'xdpp_pu', label: "X''d (pu)", type: 'number', required: true, defaultValue: 0.2 },
  { name: 'xdp_pu', label: "X'd (pu)", type: 'number', required: true, defaultValue: 0.3 },
  { name: 'xd_pu', label: 'Xd (pu)', type: 'number', required: true, defaultValue: 1.8 },
  { name: 'h_constant_s', label: 'Inertia Constant H (s)', type: 'number', required: true, defaultValue: 3.5 },
  { name: 'governor_mode', label: 'Governor Mode', type: 'text', required: true, defaultValue: 'droop' },
  { name: 'avr_mode', label: 'AVR Mode', type: 'text', required: true, defaultValue: 'automatic' },
  { name: 'min_kw', label: 'Minimum Output (kW)', type: 'number', required: true, defaultValue: 0 },
  { name: 'max_kw', label: 'Maximum Output (kW)', type: 'number', required: true, defaultValue: comp => {
    const ratedKw = Number(comp?.rated_kw ?? comp?.props?.rated_kw);
    return Number.isFinite(ratedKw) && ratedKw > 0 ? ratedKw : 1000;
  } },
  { name: 'ramp_kw_per_min', label: 'Ramp Rate (kW/min)', type: 'number', required: true, defaultValue: 100 }
];


const mccFieldSpecs = [
  { name: 'tag', label: 'Tag', type: 'text', required: true, defaultValue: comp => comp.ref || comp.label || comp.id || '' },
  { name: 'description', label: 'Description', type: 'text', required: true, defaultValue: comp => comp.label || '' },
  { name: 'manufacturer', label: 'Manufacturer', type: 'text', required: true, defaultValue: '' },
  { name: 'model', label: 'Model', type: 'text', required: true, defaultValue: '' },
  { name: 'rated_voltage_kv', label: 'Rated Voltage (kV)', type: 'number', required: true, defaultValue: comp => {
    const ratedKv = Number(comp?.rated_voltage_kv ?? comp?.props?.rated_voltage_kv ?? comp?.kV ?? comp?.baseKV);
    return Number.isFinite(ratedKv) && ratedKv > 0 ? ratedKv : 0.48;
  } },
  { name: 'bus_rating_a', label: 'Bus Rating (A)', type: 'number', required: true, defaultValue: 1600 },
  { name: 'main_device_type', label: 'Main Device Type', type: 'text', required: true, defaultValue: 'mccb' },
  { name: 'sccr_ka', label: 'SCCR (kA)', type: 'number', required: true, defaultValue: 65 },
  { name: 'bucket_count', label: 'Bucket Count', type: 'number', required: true, defaultValue: 6 },
  { name: 'spare_bucket_count', label: 'Spare Bucket Count', type: 'number', required: true, defaultValue: 1 },
  { name: 'form_type', label: 'Form Type', type: 'text', required: true, defaultValue: 'form_2b' }
];

const ptVtFieldSpecs = [
  { name: 'tag', label: 'Tag', type: 'text', required: true, defaultValue: comp => comp.ref || comp.label || comp.id || '' },
  { name: 'primary_voltage', label: 'Primary Voltage (V)', type: 'number', required: true, defaultValue: 12470 },
  { name: 'secondary_voltage', label: 'Secondary Voltage (V)', type: 'number', required: true, defaultValue: 120 },
  { name: 'accuracy_class', label: 'Accuracy Class', type: 'text', required: true, defaultValue: '0.3' },
  { name: 'burden_va', label: 'Burden (VA)', type: 'number', required: true, defaultValue: 50 },
  { name: 'connection_type', label: 'Connection Type', type: 'text', required: true, defaultValue: 'wye-grounded' },
  { name: 'fuse_protection', label: 'Fuse Protection', type: 'text', required: true, defaultValue: 'yes' },
  { name: 'location_context', label: 'Context', type: 'text', required: false, defaultValue: 'protection' },
  { name: 'protected_device_id', label: 'Protected Device ID', type: 'text', required: false, defaultValue: '' },
  { name: 'meter_id', label: 'Linked Meter ID', type: 'text', required: false, defaultValue: '' },
  { name: 'relay_id', label: 'Linked Relay ID', type: 'text', required: false, defaultValue: '' },
  { name: 'consumer_ids', label: 'Consumer IDs (comma-separated)', type: 'text', required: false, defaultValue: '' }
];

const baselineComponentFieldSpecs = [
  { name: 'tag', label: 'Tag', type: 'text', required: true, defaultValue: comp => comp.ref || comp.label || comp.id || '' },
  { name: 'description', label: 'Description', type: 'text', required: true, defaultValue: comp => comp.label || '' },
  { name: 'manufacturer', label: 'Manufacturer', type: 'text', required: true, defaultValue: 'Unspecified' },
  { name: 'model', label: 'Model', type: 'text', required: true, defaultValue: 'Unspecified' },
  { name: 'catalog_number', label: 'Catalog Number', type: 'text', required: false, defaultValue: '' },
  { name: 'approved_part', label: 'Approved Part', type: 'checkbox', required: false, defaultValue: false },
  { name: 'catalog_source', label: 'Catalog Source', type: 'text', required: false, defaultValue: '' },
  { name: 'catalog_last_verified', label: 'Catalog Last Verified', type: 'text', required: false, placeholder: 'YYYY-MM-DD', defaultValue: '' },
  { name: 'datasheet_url', label: 'Datasheet URL', type: 'text', required: false, defaultValue: '' },
  { name: 'bim_ref', label: 'BIM Reference', type: 'text', required: false, defaultValue: '' },
  { name: 'phases', label: 'Phases', type: 'number', required: true, defaultValue: 3 },
  {
    name: 'phase_assignment',
    label: 'Phase Assignment',
    type: 'select',
    required: false,
    defaultValue: '',
    options: [
      { value: '', label: 'Balanced / not assigned' },
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' },
      { value: 'C', label: 'C' },
      { value: 'A,B', label: 'A + B' },
      { value: 'A,C', label: 'A + C' },
      { value: 'B,C', label: 'B + C' }
    ],
    help: 'For an unbalanced load-flow study, total load is distributed across the selected phases. Leave unassigned to distribute evenly across A/B/C.'
  },
  { name: 'commissioning_state', label: 'Commissioning State', type: 'text', required: true, defaultValue: 'existing' },
  { name: 'service_status', label: 'Service Status', type: 'text', required: true, defaultValue: 'in_service' },
  { name: 'notes', label: 'Notes', type: 'textarea', required: false, rows: 3, defaultValue: '' }
];

function isDiagramAssetComponentMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const category = `${meta.category || ''}`.trim().toLowerCase();
  const type = `${meta.type || ''}`.trim().toLowerCase();
  if (!category && !type) return false;
  if (category === 'annotations' || type === 'annotation' || type === 'dimension') return false;
  if (category === 'links' || type === 'sheet_link') return false;
  return true;
}

function prefersDcVoltageBaseline(comp, meta) {
  const type = `${comp?.type || meta?.type || ''}`.trim().toLowerCase();
  const subtype = `${comp?.subtype || meta?.subtype || ''}`.trim().toLowerCase();
  const hasNominal = comp && (
    Object.prototype.hasOwnProperty.call(comp, 'nominal_voltage_vdc')
    || (comp.props && Object.prototype.hasOwnProperty.call(comp.props, 'nominal_voltage_vdc'))
  );
  const metaHasNominal = meta && meta.props && Object.prototype.hasOwnProperty.call(meta.props, 'nominal_voltage_vdc');
  if (hasNominal || metaHasNominal) return true;
  if (type.includes('dc') || subtype.includes('dc')) return true;
  return subtype.includes('battery') || subtype.includes('rectifier');
}

function resolveBaselineVoltageField(comp, meta) {
  return prefersDcVoltageBaseline(comp, meta) ? 'nominal_voltage_vdc' : 'rated_voltage_kv';
}

function ensureBaselineFieldSchema(schema, fieldSpec) {
  if (!Array.isArray(schema) || !fieldSpec?.name) return;
  const existing = schema.find(field => field && field.name === fieldSpec.name);
  if (existing) {
    existing.required = Boolean(fieldSpec.required);
    if (!existing.label) existing.label = fieldSpec.label;
    if (!existing.type) existing.type = fieldSpec.type || 'text';
    if (fieldSpec.rows && !existing.rows) existing.rows = fieldSpec.rows;
    ['options', 'help', 'placeholder', 'min', 'max', 'step'].forEach(key => {
      if (fieldSpec[key] !== undefined && existing[key] === undefined) existing[key] = fieldSpec[key];
    });
    return;
  }
  schema.push({
    name: fieldSpec.name,
    label: fieldSpec.label,
    type: fieldSpec.type || 'text',
    required: Boolean(fieldSpec.required),
    ...(fieldSpec.rows ? { rows: fieldSpec.rows } : {}),
    ...(fieldSpec.options ? { options: fieldSpec.options } : {}),
    ...(fieldSpec.help ? { help: fieldSpec.help } : {}),
    ...(fieldSpec.placeholder ? { placeholder: fieldSpec.placeholder } : {}),
    ...(fieldSpec.min !== undefined ? { min: fieldSpec.min } : {}),
    ...(fieldSpec.max !== undefined ? { max: fieldSpec.max } : {}),
    ...(fieldSpec.step !== undefined ? { step: fieldSpec.step } : {})
  });
}

function ensureBaselineFieldsOnComponent(comp, meta) {
  if (!comp || typeof comp !== 'object') return comp;
  if (!isDiagramAssetComponentMeta(meta || comp)) return comp;
  if (!comp.props || typeof comp.props !== 'object') {
    comp.props = { ...(comp.props || {}) };
  }
  const ensureValue = (fieldName, defaultValue) => {
    const hasCompValue = Object.prototype.hasOwnProperty.call(comp, fieldName) && comp[fieldName] !== '';
    const hasPropsValue = Object.prototype.hasOwnProperty.call(comp.props, fieldName) && comp.props[fieldName] !== '';
    if (hasCompValue || hasPropsValue) {
      if (!hasCompValue && hasPropsValue) comp[fieldName] = comp.props[fieldName];
      if (hasCompValue && !hasPropsValue) comp.props[fieldName] = comp[fieldName];
      return;
    }
    const resolvedDefault = typeof defaultValue === 'function' ? defaultValue(comp, meta) : defaultValue;
    comp[fieldName] = resolvedDefault;
    comp.props[fieldName] = resolvedDefault;
  };

  baselineComponentFieldSpecs.forEach(spec => ensureValue(spec.name, spec.defaultValue));
  const voltageFieldName = resolveBaselineVoltageField(comp, meta);
  const voltageDefault = voltageFieldName === 'nominal_voltage_vdc'
    ? (comp.voltage || comp.volts || '')
    : ((Number.isFinite(Number(comp.voltage)) && Number(comp.voltage) > 100)
      ? Number(comp.voltage) / 1000
      : (comp.voltage || comp.kv || ''));
  ensureValue(voltageFieldName, voltageDefault);
  return comp;
}

function ensureBaselineComponentMetadata() {
  Object.entries(componentMeta).forEach(([key, meta]) => {
    if (!isDiagramAssetComponentMeta(meta)) return;
    if (!meta.props || typeof meta.props !== 'object') {
      meta.props = { ...(meta.props || {}) };
    }
    const voltageFieldName = resolveBaselineVoltageField(null, meta);
    const schemaKeys = new Set([key, meta.subtype].filter(Boolean));
    baselineComponentFieldSpecs.forEach(spec => {
      if (!Object.prototype.hasOwnProperty.call(meta.props, spec.name)) {
        const nextValue = typeof spec.defaultValue === 'function' ? spec.defaultValue({}) : spec.defaultValue;
        meta.props[spec.name] = nextValue;
      }
    });
    if (!Object.prototype.hasOwnProperty.call(meta.props, voltageFieldName)) {
      meta.props[voltageFieldName] = '';
    }
    schemaKeys.forEach(schemaKey => {
      if (!Array.isArray(propSchemas[schemaKey])) {
        propSchemas[schemaKey] = inferSchemaFromProps(meta.props || {});
      }
      baselineComponentFieldSpecs.forEach(spec => ensureBaselineFieldSchema(propSchemas[schemaKey], spec));
      ensureBaselineFieldSchema(propSchemas[schemaKey], {
        name: voltageFieldName,
        label: voltageFieldName === 'nominal_voltage_vdc' ? 'Nominal DC Voltage (Vdc)' : 'Rated Voltage (kV)',
        type: 'number',
        required: true
      });
    });
  });
}

function isGeneratorStudyComponentMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = `${meta.type || ''}`.trim().toLowerCase();
  const subtype = `${meta.subtype || ''}`.trim().toLowerCase();
  return type === 'generator' || subtype === 'generator' || subtype === 'synchronous' || subtype === 'asynchronous';
}

function ensureGeneratorStudyFieldsOnComponent(comp, meta) {
  if (!comp || typeof comp !== 'object') return comp;
  if (!isGeneratorStudyComponentMeta(meta || comp)) return comp;
  if (!comp.props || typeof comp.props !== 'object') {
    comp.props = { ...(comp.props || {}) };
  }
  generatorStudyFieldSpecs.forEach(spec => {
    const hasCompValue = Object.prototype.hasOwnProperty.call(comp, spec.name) && comp[spec.name] !== '';
    const hasPropsValue = Object.prototype.hasOwnProperty.call(comp.props, spec.name) && comp.props[spec.name] !== '';
    if (hasCompValue || hasPropsValue) {
      if (!hasCompValue && hasPropsValue) comp[spec.name] = comp.props[spec.name];
      if (hasCompValue && !hasPropsValue) comp.props[spec.name] = comp[spec.name];
      return;
    }
    const nextValue = typeof spec.defaultValue === 'function' ? spec.defaultValue(comp, meta) : spec.defaultValue;
    comp[spec.name] = nextValue;
    comp.props[spec.name] = nextValue;
  });
  const minKw = Number(comp.min_kw ?? comp.props.min_kw);
  const maxKw = Number(comp.max_kw ?? comp.props.max_kw);
  if (Number.isFinite(minKw) && Number.isFinite(maxKw) && minKw > maxKw) {
    comp.min_kw = maxKw;
    comp.props.min_kw = maxKw;
  }
  return comp;
}

function ensureGeneratorStudyMetadata() {
  Object.entries(componentMeta).forEach(([key, meta]) => {
    if (!isGeneratorStudyComponentMeta(meta)) return;
    if (!meta.props || typeof meta.props !== 'object') {
      meta.props = { ...(meta.props || {}) };
    }
    generatorStudyFieldSpecs.forEach(spec => {
      if (!Object.prototype.hasOwnProperty.call(meta.props, spec.name)) {
        const nextValue = typeof spec.defaultValue === 'function' ? spec.defaultValue(meta.props) : spec.defaultValue;
        meta.props[spec.name] = nextValue;
      }
    });
    const schemaKeys = new Set([key, meta.subtype].filter(Boolean));
    schemaKeys.forEach(schemaKey => {
      if (!Array.isArray(propSchemas[schemaKey])) {
        propSchemas[schemaKey] = inferSchemaFromProps(meta.props || {});
      }
      generatorStudyFieldSpecs.forEach(spec => ensureBaselineFieldSchema(propSchemas[schemaKey], spec));
    });
  });
}



function isMccComponentMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = `${meta.type || ''}`.trim().toLowerCase();
  const subtype = `${meta.subtype || ''}`.trim().toLowerCase();
  return subtype === 'mcc' || type === 'mcc';
}

function ensureMccFieldsOnComponent(comp, meta) {
  if (!comp || typeof comp !== 'object') return comp;
  if (!isMccComponentMeta(meta || comp)) return comp;
  if (!comp.props || typeof comp.props !== 'object') {
    comp.props = { ...(comp.props || {}) };
  }
  mccFieldSpecs.forEach(spec => {
    const hasCompValue = Object.prototype.hasOwnProperty.call(comp, spec.name) && comp[spec.name] !== '';
    const hasPropsValue = Object.prototype.hasOwnProperty.call(comp.props, spec.name) && comp.props[spec.name] !== '';
    if (hasCompValue || hasPropsValue) {
      if (!hasCompValue && hasPropsValue) comp[spec.name] = comp.props[spec.name];
      if (hasCompValue && !hasPropsValue) comp.props[spec.name] = comp[spec.name];
      return;
    }
    const nextValue = typeof spec.defaultValue === 'function' ? spec.defaultValue(comp, meta) : spec.defaultValue;
    comp[spec.name] = nextValue;
    comp.props[spec.name] = nextValue;
  });
  const bucketCount = Number(comp.bucket_count ?? comp.props.bucket_count);
  const spareBucketCount = Number(comp.spare_bucket_count ?? comp.props.spare_bucket_count);
  if (Number.isFinite(bucketCount) && Number.isFinite(spareBucketCount) && spareBucketCount > bucketCount) {
    comp.spare_bucket_count = bucketCount;
    comp.props.spare_bucket_count = bucketCount;
  }
  return comp;
}

function ensureMccMetadata() {
  Object.entries(componentMeta).forEach(([key, meta]) => {
    if (!isMccComponentMeta(meta)) return;
    if (!meta.props || typeof meta.props !== 'object') {
      meta.props = { ...(meta.props || {}) };
    }
    mccFieldSpecs.forEach(spec => {
      if (!Object.prototype.hasOwnProperty.call(meta.props, spec.name)) {
        const nextValue = typeof spec.defaultValue === 'function' ? spec.defaultValue(meta.props) : spec.defaultValue;
        meta.props[spec.name] = nextValue;
      }
    });
    const schemaKeys = new Set([key, meta.subtype].filter(Boolean));
    schemaKeys.forEach(schemaKey => {
      if (!Array.isArray(propSchemas[schemaKey])) {
        propSchemas[schemaKey] = inferSchemaFromProps(meta.props || {});
      }
      mccFieldSpecs.forEach(spec => ensureBaselineFieldSchema(propSchemas[schemaKey], spec));
    });
  });
}

function isPtVtComponentMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = `${meta.type || ''}`.trim().toLowerCase();
  const subtype = `${meta.subtype || ''}`.trim().toLowerCase();
  return subtype === 'pt_vt' || subtype === 'vt' || type === 'pt_vt' || type === 'vt';
}

function ensurePtVtFieldsOnComponent(comp, meta) {
  if (!comp || typeof comp !== 'object') return comp;
  if (!isPtVtComponentMeta(meta || comp)) return comp;
  if (!comp.props || typeof comp.props !== 'object') {
    comp.props = { ...(comp.props || {}) };
  }
  ptVtFieldSpecs.forEach(spec => {
    const hasCompValue = Object.prototype.hasOwnProperty.call(comp, spec.name) && comp[spec.name] !== '';
    const hasPropsValue = Object.prototype.hasOwnProperty.call(comp.props, spec.name) && comp.props[spec.name] !== '';
    if (hasCompValue || hasPropsValue) {
      if (!hasCompValue && hasPropsValue) comp[spec.name] = comp.props[spec.name];
      if (hasCompValue && !hasPropsValue) comp.props[spec.name] = comp[spec.name];
      return;
    }
    const nextValue = typeof spec.defaultValue === 'function' ? spec.defaultValue(comp, meta) : spec.defaultValue;
    comp[spec.name] = nextValue;
    comp.props[spec.name] = nextValue;
  });
  return comp;
}

function ensurePtVtMetadata() {
  Object.entries(componentMeta).forEach(([key, meta]) => {
    if (!isPtVtComponentMeta(meta)) return;
    if (!meta.props || typeof meta.props !== 'object') {
      meta.props = { ...(meta.props || {}) };
    }
    ptVtFieldSpecs.forEach(spec => {
      if (!Object.prototype.hasOwnProperty.call(meta.props, spec.name)) {
        const nextValue = typeof spec.defaultValue === 'function' ? spec.defaultValue(meta.props) : spec.defaultValue;
        meta.props[spec.name] = nextValue;
      }
    });
    const schemaKeys = new Set([key, meta.subtype].filter(Boolean));
    schemaKeys.forEach(schemaKey => {
      if (!Array.isArray(propSchemas[schemaKey])) {
        propSchemas[schemaKey] = inferSchemaFromProps(meta.props || {});
      }
      ptVtFieldSpecs.forEach(spec => ensureBaselineFieldSchema(propSchemas[schemaKey], spec));
    });
  });
}

const harmonicProfileStorageKey = 'harmonicProfileLibrary';
const manualHarmonicProfileId = MANUAL_HARMONIC_PROFILE_ID;

function getCustomHarmonicProfiles() {
  const stored = getItem(harmonicProfileStorageKey, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .map(profile => normalizeHarmonicProfile({ ...profile, custom: true }))
    .filter(Boolean);
}

function getHarmonicProfileLibrary() {
  return mergeHarmonicProfiles(getCustomHarmonicProfiles(), BUILT_IN_HARMONIC_PROFILES);
}

function getHarmonicProfileOptions() {
  return getHarmonicProfileLibrary().map(profile => ({
    value: profile.id,
    label: profile.custom ? `${profile.label} (custom)` : profile.label
  }));
}

function findHarmonicProfileById(id) {
  return findHarmonicProfileByIdInLibrary(getHarmonicProfileLibrary(), id);
}

function findHarmonicProfileBySpectrum(spectrum) {
  return findHarmonicProfileBySpectrumInLibrary(getHarmonicProfileLibrary(), spectrum);
}

function saveCustomHarmonicProfile(label, spectrum) {
  const profile = createCustomHarmonicProfile(label, spectrum);
  if (!profile) return null;
  const existing = getCustomHarmonicProfiles().filter(item => item.id !== profile.id);
  existing.push(profile);
  setItem(harmonicProfileStorageKey, existing);
  return profile;
}

function defaultHarmonicSpectrum(meta) {
  const profile = findHarmonicProfileById(defaultHarmonicProfileId(meta));
  return profile?.spectrum || '';
}

const studyInputFieldSpecs = createStudyInputFieldSpecs({
  getHarmonicProfileOptions,
  getDefaultHarmonicProfileId: defaultHarmonicProfileId,
  getDefaultHarmonicSpectrum: defaultHarmonicSpectrum
});

function resolveStudyInputFieldSpecs(meta) {
  return resolveStudyInputFieldSpecsForModel(meta, studyInputFieldSpecs, { isDiagramAssetComponentMeta });
}

function ensureStudyInputFieldsOnComponent(comp, meta) {
  if (!comp || typeof comp !== 'object') return comp;
  const specs = resolveStudyInputFieldSpecs(meta || comp);
  if (!specs.length) return comp;
  if (!comp.props || typeof comp.props !== 'object') {
    comp.props = { ...(comp.props || {}) };
  }
  specs.forEach(spec => {
    const hasCompValue = Object.prototype.hasOwnProperty.call(comp, spec.name);
    const hasPropsValue = Object.prototype.hasOwnProperty.call(comp.props, spec.name);
    if (hasCompValue || hasPropsValue) {
      if (!hasCompValue && hasPropsValue) comp[spec.name] = comp.props[spec.name];
      if (hasCompValue && !hasPropsValue) comp.props[spec.name] = comp[spec.name];
      return;
    }
    const nextValue = typeof spec.defaultValue === 'function' ? spec.defaultValue(comp, meta) : spec.defaultValue;
    comp[spec.name] = nextValue;
    comp.props[spec.name] = nextValue;
  });
  return comp;
}

function ensureStudyInputMetadata() {
  Object.entries(componentMeta).forEach(([key, meta]) => {
    const specs = resolveStudyInputFieldSpecs(meta);
    if (!specs.length) return;
    if (!meta.props || typeof meta.props !== 'object') {
      meta.props = { ...(meta.props || {}) };
    }
    specs.forEach(spec => {
      if (!Object.prototype.hasOwnProperty.call(meta.props, spec.name)) {
        const nextValue = typeof spec.defaultValue === 'function' ? spec.defaultValue(meta.props, meta) : spec.defaultValue;
        meta.props[spec.name] = nextValue;
      }
    });
    const schemaKeys = new Set([key, meta.subtype].filter(Boolean));
    schemaKeys.forEach(schemaKey => {
      if (!Array.isArray(propSchemas[schemaKey])) {
        propSchemas[schemaKey] = inferSchemaFromProps(meta.props || {});
      }
      specs.forEach(spec => ensureBaselineFieldSchema(propSchemas[schemaKey], spec));
    });
  });
}

function loadStoredCustomComponents() {
  const stored = getItem(customComponentStorageKey, [], customComponentScenarioKey);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      ...item,
      source: item.source || 'custom',
      defaultRotation: normalizeRotation(item?.defaultRotation ?? 0)
    }));
}

function resolveIconSource(iconPath, fallbackSymbol) {
  if (typeof iconPath === 'string' && iconPath.trim()) {
    const trimmed = iconPath.trim();
    if (trimmed.startsWith('data:') || /^https?:/i.test(trimmed)) {
      return trimmed;
    }
    const resolved = asset(trimmed);
    return /icons\/components\/[^?#]+\.svg$/i.test(trimmed)
      ? `${resolved}?v=${oneLineSymbolAssetVersion}`
      : resolved;
  }
  if (fallbackSymbol) {
    return asset(`icons/components/${fallbackSymbol}.svg`);
  }
  return placeholderIcon;
}

function resolveAlternateIconSource(iconPath) {
  if (typeof iconPath !== 'string' || !iconPath.trim()) return null;
  return resolveIconSource(iconPath.trim(), null);
}


function ensureCapacitorReactorPropertyMetadata() {
  const targets = new Set(['CapacitorBank', 'shunt_capacitor_bank', 'reactor']);
  const ensureMetaDefaults = meta => {
    if (!meta || typeof meta !== 'object') return;
    if (!meta.props || typeof meta.props !== 'object') {
      meta.props = { ...(meta.props || {}) };
    }
    capacitorBankPropertyFields.forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(meta.props, field.name)) {
        meta.props[field.name] = '';
      }
    });
  };
  Object.entries(componentMeta).forEach(([key, meta]) => {
    if (!meta || typeof meta !== 'object') return;
    const subtype = (meta.subtype || '').trim();
    const type = (meta.type || '').trim();
    const category = (meta.category || '').trim();
    if (subtype === 'CapacitorBank' || subtype === 'shunt_capacitor_bank' || subtype === 'reactor') {
      targets.add(subtype);
      targets.add(key);
      if (type) targets.add(compKey(type, subtype));
      if (category) targets.add(compKey(category, subtype));
      ensureMetaDefaults(meta);
    }
    if (type === 'shunt_capacitor_bank' || type === 'reactor') {
      targets.add(type);
      if (subtype) targets.add(compKey(type, subtype));
      targets.add(key);
      ensureMetaDefaults(meta);
    }
  });
  ['equipment', 'load', 'shunt_capacitor_bank', 'reactor'].forEach(type => {
    targets.add(compKey(type, 'CapacitorBank'));
    targets.add(compKey(type, 'reactor'));
  });
  targets.forEach(key => {
    if (!key) return;
    const existing = Array.isArray(propSchemas[key]) ? [...propSchemas[key]] : [];
    const nameMap = new Map(existing.map(field => [field.name, field]));
    capacitorBankPropertyFields.forEach(field => {
      const targetField = nameMap.get(field.name);
      if (targetField) {
        targetField.label = field.label;
        targetField.type = field.type;
        targetField.help = field.help;
        if (!targetField.getValue) targetField.getValue = field.getValue;
        if (!targetField.setValue) targetField.setValue = field.setValue;
      } else {
        const nextField = { ...field };
        existing.push(nextField);
        nameMap.set(field.name, nextField);
      }
    });
    propSchemas[key] = existing;
  });
}


// === REPLACE THE ENTIRE FUNCTION ===
async function loadComponentLibrary({ renderPalette = true } = {}) {
  componentMeta = {};
  propSchemas = {};
  subtypeCategory = {};
  componentTypes = {};

  const registerDefinition = (definition, { allowOverride = true } = {}) => {
    if (!definition || typeof definition !== 'object') return;
    const subtype = (definition.subtype || '').trim();
    if (!subtype) return;
    const baseType = (definition.type || definition.category || subtype).trim();
    const key = compKey(baseType, subtype);
    if (!allowOverride && componentMeta[key]) return;
    if (componentMeta[key]) {
      const prevCat = subtypeCategory[key];
      if (prevCat && componentTypes[prevCat]) {
        componentTypes[prevCat] = componentTypes[prevCat].filter(entry => entry !== key);
      }
    }
    const resolvedType = definition.type || baseType;
    const requestedCategory = typeof definition.category === 'string' ? definition.category.trim().toLowerCase() : '';
    const category = PALETTE_CATEGORIES.has(requestedCategory)
      ? requestedCategory
      : categoryForType(resolvedType);
    const icon = resolveIconSource(definition.icon, definition.symbol);
    const iconIEC = resolveAlternateIconSource(definition.iconIEC);
    const defaultRotation = normalizeRotation(
      definition.defaultRotation ?? defaultRotationForType(resolvedType, category)
    );
    const widthVal = Number(definition.width);
    const heightVal = Number(definition.height);
    const profileGeometry = industrySymbolGeometry(getIndustrySymbolProfile({
      type: resolvedType,
      subtype,
      label: definition.label || ''
    }, {
      type: resolvedType,
      subtype,
      label: definition.label || ''
    }));
    const resolvedWidth = Number.isFinite(widthVal) ? widthVal : profileGeometry?.width;
    const resolvedHeight = Number.isFinite(heightVal) ? heightVal : profileGeometry?.height;
    const rawPorts = Array.isArray(definition.ports) && definition.ports.length
      ? definition.ports
      : profileGeometry?.ports;
    const ports = normalizePortsForCategory(
      category,
      rawPorts,
      resolvedType,
      subtype,
      resolvedWidth || compWidth,
      resolvedHeight || compHeight
    );
    const rawSource = typeof definition.source === 'string' ? definition.source.trim() : '';
    const derivedSource = rawSource || (definition.isCustom ? 'custom' : '');
    const isCustom = derivedSource.toLowerCase() === 'custom';
    const rawProps = definition.props || {};
    const props = {};
    Object.entries(rawProps).forEach(([propKey, propValue]) => {
      if (propKey === 'kv' || propKey.startsWith('kv_') || propKey.endsWith('_kv')) {
        const newKey = propKey
          .replace(/^kv_/, 'volts_')
          .replace(/_kv$/, '_volts')
          .replace('kv', 'volts');
        props[newKey] = typeof propValue === 'number' ? propValue * 1000 : propValue;
      } else {
        props[propKey] = typeof propValue === 'object' && propValue !== null
          ? JSON.parse(JSON.stringify(propValue))
          : propValue;
      }
    });
    const meta = {
      icon,
      ...(iconIEC ? { iconIEC } : {}),
      label: definition.label || key,
      category,
      ports,
      type: resolvedType,
      subtype,
      props,
      defaultRotation,
      source: derivedSource || null,
      isCustom
    };
    if (definition.hidden) meta.hidden = true;
    if (Number.isFinite(resolvedWidth)) meta.width = resolvedWidth;
    if (Number.isFinite(resolvedHeight)) meta.height = resolvedHeight;
    componentMeta[key] = meta;
    subtypeCategory[key] = category;
    if (!componentTypes[category]) componentTypes[category] = [];
    if (!componentTypes[category].includes(key)) componentTypes[category].push(key);
    const schema = inferSchemaFromProps(props);
    propSchemas[key] = schema;
    if (!propSchemas[subtype] || allowOverride) {
      propSchemas[subtype] = schema.map(field => ({ ...field }));
    }
  };

  try {
    const res = await fetch(asset('componentLibrary.json'), { cache: 'no-store' });
    const data = await res.json();
    const comps = Array.isArray(data.components) ? data.components : [];
    comps.forEach(c => registerDefinition(c));
  } catch (e) {
    console.error('Component library load failed', e);
  }

  const customDefinitions = loadStoredCustomComponents();
  customDefinitions.forEach(def => registerDefinition(def));

  builtinComponents.forEach(def => registerDefinition(def, { allowOverride: false }));

  ensureCapacitorReactorPropertyMetadata();
  ensureGeneratorStudyMetadata();
  ensureMccMetadata();
  ensurePtVtMetadata();
  ensureBaselineComponentMetadata();
  ensureStudyInputMetadata();

  if (renderPalette) buildPalette();
  refreshAttributeOptions();
}
// === END REPLACEMENT ===

function isValidComponent(c) {
  return c && typeof c === 'object' && Array.isArray(c.ports) && c.category;
}

async function loadManufacturerLibrary() {
  try {
    const res = await fetch(asset('manufacturerLibrary.json'));
    manufacturerDefaults = await res.json();
  } catch (err) {
    console.error('Failed to load manufacturer defaults', err);
    manufacturerDefaults = {};
  }
  const stored = getItem('manufacturerDefaults', {});
  manufacturerDefaults = { ...manufacturerDefaults, ...stored };
}

function rebuildComponentMaps() {
  subtypeCategory = {};
  componentTypes = {};
  Object.entries(componentMeta).forEach(([sub, meta]) => {
    subtypeCategory[sub] = meta.category;
    if (!componentTypes[meta.category]) componentTypes[meta.category] = [];
    componentTypes[meta.category].push(sub);
  });
}

function applyDefaults(comp) {
  const defs = manufacturerDefaults[comp.subtype];
  if (!defs) return;
  Object.entries(defs).forEach(([k, v]) => {
    if (comp[k] === undefined || comp[k] === '') {
      comp[k] = v;
    }
  });
}

function inferPortCountsForMeta(ports = [], width = compWidth, height = compHeight) {
  const counts = { top: 0, right: 0, bottom: 0, left: 0 };
  const w = Number.isFinite(width) ? width : compWidth;
  const h = Number.isFinite(height) ? height : compHeight;
  const epsilon = 0.5;
  ports.forEach(port => {
    if (!port || typeof port.x !== 'number' || typeof port.y !== 'number') return;
    if (Math.abs(port.y) <= epsilon) counts.top += 1;
    else if (Math.abs(port.x - w) <= epsilon) counts.right += 1;
    else if (Math.abs(port.y - h) <= epsilon) counts.bottom += 1;
    else if (Math.abs(port.x) <= epsilon) counts.left += 1;
  });
  return counts;
}

function createComponentPrefill(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const ports = Array.isArray(meta.ports)
    ? meta.ports
        .filter(port => port && typeof port === 'object')
        .map(port => ({
          x: Number.isFinite(Number(port.x)) ? Number(port.x) : 0,
          y: Number.isFinite(Number(port.y)) ? Number(port.y) : 0
        }))
    : [];
  const baseProps = meta.props && typeof meta.props === 'object' ? meta.props : {};
  const props = {};
  const properties = [];
  Object.entries(baseProps).forEach(([name, value]) => {
    if (value !== null && typeof value === 'object') return;
    props[name] = value;
    properties.push({
      name,
      type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'checkbox' : 'text',
      value
    });
  });
  const widthVal = Number(meta.width);
  const heightVal = Number(meta.height);
  const defaultRotation = Number(meta.defaultRotation);
  return {
    label: meta.label || meta.subtype || '',
    subtype: meta.subtype || '',
    type: meta.type || meta.category || '',
    category: meta.category || meta.type || 'equipment',
    width: Number.isFinite(widthVal) ? widthVal : undefined,
    height: Number.isFinite(heightVal) ? heightVal : undefined,
    ports,
    portCounts: inferPortCountsForMeta(ports, widthVal, heightVal),
    props,
    properties,
    icon: meta.icon || null,
    defaultRotation: Number.isFinite(defaultRotation) ? defaultRotation : undefined
  };
}

function navigateToCustomComponentEditor(meta) {
  if (!meta) return;
  const url = new URL('./custom-components.html', window.location.href);
  if (meta.isCustom && meta.subtype) {
    url.searchParams.set('edit', meta.subtype);
    window.location.href = url.toString();
    return;
  }
  const prefill = createComponentPrefill(meta);
  if (!prefill) {
    window.location.href = url.toString();
    return;
  }
  try {
    sessionStorage.setItem(customComponentPrefillStorageKey, JSON.stringify(prefill));
  } catch (err) {
    console.error('Failed to store component prefill', err);
  }
  url.searchParams.set('prefill', '1');
  window.location.href = url.toString();
}

let paletteController = null;

function getPaletteController() {
  if (!paletteController) {
    paletteController = createPaletteController({
      documentRef: document,
      categoryFilters: paletteCategoryFilters,
      getActiveFilter: () => activePaletteCategoryFilter,
      setActiveFilter: filter => {
        activePaletteCategoryFilter = filter;
        setOneLineViewSetting(paletteFilterStorageKey, filter);
      },
      getComponentTypes: () => componentTypes,
      getComponentMeta: () => componentMeta,
      getSymbolStandard: () => symbolStandard,
      getDefaultRotation: defaultRotationForMeta,
      getViewSetting: getOneLineViewSetting,
      setViewSetting: setOneLineViewSetting,
      getFavorites: getPaletteFavorites,
      getRecent: getPaletteRecent,
      clearRecent: clearPaletteRecent,
      onActivate: ({ meta, subtype, rerender }) => {
        const comp = addComponent({ type: meta.type, subtype, placeAtViewportCenter: true });
        if (comp) {
          recordPaletteUsage(subtype);
          rerender();
          selection = [comp];
          selected = comp;
          selectedConnection = null;
          setRightRailTab('properties');
          showToast(`${comp.label || meta.label || 'Component'} added`);
        }
        render();
        if (comp) zoomToComponents([comp], { maxZoom: 1.35, pad: 90 });
        save();
      },
      onDragStart: setDragPreview,
      onContextMenu: openPaletteContextMenu,
      onCloseContextMenu: closePaletteContextMenu
    });
  }
  return paletteController;
}

function buildPalette() {
  getPaletteController().render();
}
function closePaletteContextMenu() {
  if (!paletteContextMenu) return;
  paletteContextMenu.style.display = 'none';
  paletteContextTarget = null;
}

function openPaletteContextMenu(meta, triggerEl, clientX, clientY, subtype = null) {
  if (!paletteContextMenu || !meta) return;
  closePaletteContextMenu();
  paletteContextTarget = { meta, subtype: subtype || meta.subtype || triggerEl?.dataset?.subtype || '', trigger: triggerEl };
  const favoriteItem = paletteContextMenu.querySelector('[data-action="toggle-favorite"]');
  if (favoriteItem) {
    favoriteItem.textContent = getPaletteFavorites().includes(paletteContextTarget.subtype)
      ? 'Remove from Favorites'
      : 'Add to Favorites';
  }
  paletteContextMenu.style.display = 'block';
  paletteContextMenu.style.left = '0px';
  paletteContextMenu.style.top = '0px';
  const rect = paletteContextMenu.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height;
  const left = Math.min(Math.max(0, clientX), viewportWidth - rect.width);
  const top = Math.min(Math.max(0, clientY), viewportHeight - rect.height);
  paletteContextMenu.style.left = `${Math.round(left)}px`;
  paletteContextMenu.style.top = `${Math.round(top)}px`;
}

function setDragPreview(e, meta, rotation) {
  if (!e?.dataTransfer || !meta?.icon) return;
  try {
    const preview = document.createElement('div');
    preview.className = 'drag-preview';
    preview.dataset.rotation = String(rotation);
    const baseWidth = compWidth;
    const baseHeight = compHeight;
    const normalized = normalizeRotation(rotation);
    const width = normalized === 90 || normalized === 270 ? baseHeight : baseWidth;
    const height = normalized === 90 || normalized === 270 ? baseWidth : baseHeight;
    preview.style.width = `${width}px`;
    preview.style.height = `${height}px`;
    const img = document.createElement('img');
    img.src = meta.icon;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.draggable = false;
    preview.appendChild(img);
    document.body.appendChild(preview);
    const rect = preview.getBoundingClientRect();
    const offsetX = rect.width / 2;
    const offsetY = rect.height / 2;
    e.dataTransfer.setDragImage(preview, offsetX, offsetY);
    requestAnimationFrame(() => {
      preview.remove();
    });
  } catch (err) {
    // ignore drag preview failures
  }
}

const svgNS = 'http://www.w3.org/2000/svg';
let sheets = [];
let activeSheet = 0;
let components = [];
let connections = [];
let diagramEntityIdCounter = 0;
let selection = [];
let selected = null;
let dragOffset = null;
let dragging = false;
let draggingConnection = null;
let dragConnections = null;
let draggingLabel = null;
let activeInlineLabelEditor = null;
let clipboard = [];
let propertyClipboard = null;
let lastRepeatableCommand = null;

const ONE_LINE_SHORTCUT_DEFINITIONS = [
  { id: 'repeat-last', label: 'Repeat last command', defaultShortcut: 'Alt+R' },
  { id: 'rotate', label: 'Rotate selection', defaultShortcut: 'R' },
  { id: 'flip', label: 'Flip selection', defaultShortcut: 'Shift+R' },
  { id: 'fit', label: 'Fit diagram', defaultShortcut: 'F' },
  { id: 'fit-selection', label: 'Fit selection', defaultShortcut: 'Shift+F' },
  { id: 'auto-arrange', label: 'Auto arrange', defaultShortcut: 'Alt+A' },
  { id: 'auto-space', label: 'Auto-space equipment', defaultShortcut: 'Alt+S' }
];

const ONE_LINE_SHORTCUTS_SETTING_KEY = 'keyboardShortcuts';

function createDiagramEntityId(prefix = 'n') {
  const safePrefix = String(prefix || 'n').replace(/[^a-zA-Z0-9_-]/g, '') || 'n';
  const hasId = id => {
    if (!id) return false;
    if ((components || []).some(comp => comp?.id === id)) return true;
    return (sheets || []).some(sheet => (sheet?.components || []).some(comp => comp?.id === id));
  };
  let id = '';
  do {
    diagramEntityIdCounter += 1;
    id = `${safePrefix}${Date.now().toString(36)}${diagramEntityIdCounter.toString(36)}`;
  } while (hasId(id));
  return id;
}

const PROPERTY_CLIPBOARD_EXCLUDE_KEYS = new Set([
  'id',
  'label',
  'name',
  'tag',
  'ref',
  'x',
  'y',
  'z',
  'connections',
  'ports',
  'portCounts',
  'icon',
  'width',
  'height',
  'rotation',
  'rotationManual',
  'flipped',
  'labelOffset',
  'category',
  'type',
  'subtype',
  'defaultRotation',
  'isVirtualNode',
  'templateId',
  'isTemplate',
  'diagramId',
  'diagramSheet',
  'diagram',
  'diagramScale',
  'diagramViewport',
  'diagramZoom',
  'diagramOffset',
  'locked',
  'componentVersion'
]);

const PROPERTY_CLIPBOARD_UNIQUE_KEYS = new Set(['id', 'label', 'name', 'tag', 'ref']);

function isDomNode(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof Element !== 'undefined' && value instanceof Element) return true;
  if (typeof Node !== 'undefined' && value instanceof Node) return true;
  return false;
}

function clonePropertyClipboardValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => clonePropertyClipboardValue(item));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (isDomNode(value)) return undefined;
  const result = {};
  Object.keys(value).forEach(key => {
    if (PROPERTY_CLIPBOARD_UNIQUE_KEYS.has(key)) return;
    const cloned = clonePropertyClipboardValue(value[key]);
    if (cloned !== undefined) {
      result[key] = cloned;
    }
  });
  return result;
}

function buildPropertyClipboardData(comp) {
  if (!comp || typeof comp !== 'object') return {};
  const data = {};
  Object.keys(comp).forEach(key => {
    if (PROPERTY_CLIPBOARD_EXCLUDE_KEYS.has(key)) return;
    const value = comp[key];
    if (typeof value === 'function') return;
    if (value === undefined) return;
    if (isDomNode(value)) return;
    const cloned = clonePropertyClipboardValue(value);
    if (cloned !== undefined) {
      data[key] = cloned;
    }
  });
  return data;
}

function createPropertyClipboardFromComponent(comp) {
  if (!comp || comp.isVirtualNode) return null;
  const data = buildPropertyClipboardData(comp);
  if (!Object.keys(data).length) return null;
  return {
    subtype: comp.subtype || '',
    type: comp.type || '',
    data
  };
}

function canPastePropertyClipboard(clipboardData, target) {
  if (!clipboardData || !clipboardData.data) return false;
  if (!target || target.isVirtualNode) return false;
  const sourceKey = clipboardData.subtype || clipboardData.type || '';
  const targetKey = target.subtype || target.type || '';
  if (!sourceKey || !targetKey) return true;
  return sourceKey === targetKey;
}

function deepEqualValues(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualValues(a[i], b[i])) return false;
    }
    return true;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqualValues(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function applyPropertyClipboardToComponent(target, clipboardData) {
  if (!target || !clipboardData || !clipboardData.data) return false;
  const data = clipboardData.data;
  let changed = false;
  Object.keys(target).forEach(key => {
    if (PROPERTY_CLIPBOARD_EXCLUDE_KEYS.has(key)) return;
    if (Object.prototype.hasOwnProperty.call(data, key)) return;
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      delete target[key];
      changed = true;
    }
  });
  Object.entries(data).forEach(([key, value]) => {
    const cloned = clonePropertyClipboardValue(value);
    if (cloned === undefined && value !== undefined) return;
    if (!deepEqualValues(target[key], cloned)) {
      target[key] = cloned;
      changed = true;
    }
  });
  return changed;
}
let contextTarget = null;
let contextCanvasPoint = null;
let connectMode = false;
let connectSource = null;
let tempConnection = null;
let hoverPort = null;
let selectedConnection = null;
let rightRailActiveTab = 'properties';
let diagramFilterMode = getOneLineViewSetting('oneLineDiagramFilterMode', 'all');
const DEFAULT_DIAGRAM_SCALE = Object.freeze({ unitPerPx: 1, unit: 'in' });
const MIN_DIAGRAM_UNIT_PER_PX = 1e-6;
const MAX_DIAGRAM_UNIT_PER_PX = 1e6;

function normalizeDiagramScale(rawScale) {
  const fallback = { ...DEFAULT_DIAGRAM_SCALE };
  if (!rawScale || typeof rawScale !== 'object' || Array.isArray(rawScale)) return fallback;
  const unitPerPx = Number(rawScale.unitPerPx);
  if (!Number.isFinite(unitPerPx) || unitPerPx <= 0) return fallback;
  const clampedUnitPerPx = Math.min(Math.max(unitPerPx, MIN_DIAGRAM_UNIT_PER_PX), MAX_DIAGRAM_UNIT_PER_PX);
  const unit = typeof rawScale.unit === 'string' && rawScale.unit.trim() ? rawScale.unit.trim() : fallback.unit;
  return { unitPerPx: clampedUnitPerPx, unit };
}

let diagramScale = normalizeDiagramScale(getItem('diagramScale', DEFAULT_DIAGRAM_SCALE));
const DEFAULT_DIAGRAM_ZOOM = 1;
const MIN_DIAGRAM_ZOOM = 0.25;
const MAX_DIAGRAM_ZOOM = 4;
const DEFAULT_VIEWPORT_WIDTH = 960;
const DEFAULT_VIEWPORT_HEIGHT = 540;
const STATIC_VIEWPORT_SCALE = 4;
const MAX_DYNAMIC_VIEWPORT_SPAN = 50000;
const STATIC_VIEWPORT_BOUNDS = {
  minX: -DEFAULT_VIEWPORT_WIDTH * STATIC_VIEWPORT_SCALE / 2,
  minY: -DEFAULT_VIEWPORT_HEIGHT * STATIC_VIEWPORT_SCALE / 2,
  width: DEFAULT_VIEWPORT_WIDTH * STATIC_VIEWPORT_SCALE,
  height: DEFAULT_VIEWPORT_HEIGHT * STATIC_VIEWPORT_SCALE
};
const MAX_ROUTE_ADJUST_STEPS = 250;
const STUDY_SETTINGS_KEY = 'studySettings';
const defaultStudySettings = {
  loadFlow: { baseMVA: 100, balanced: true, maxIterations: 20 },
  shortCircuit: { method: 'IEC' }
};
let diagramViewport = { ...STATIC_VIEWPORT_BOUNDS };
let diagramZoom = clampZoom(getOneLineViewSetting('diagramZoom', DEFAULT_DIAGRAM_ZOOM));
let resizingBus = null;
let resizingAnnotation = null;
let marquee = null;

function normalizeStudySettings(raw = {}) {
  const lf = raw && typeof raw === 'object' ? raw.loadFlow || {} : {};
  const sc = raw && typeof raw === 'object' ? raw.shortCircuit || {} : {};
  const base = Number(lf.baseMVA);
  const iter = Number(lf.maxIterations);
  return {
    loadFlow: {
      baseMVA: Number.isFinite(base) && base > 0 ? base : defaultStudySettings.loadFlow.baseMVA,
      balanced: lf.balanced !== false,
      maxIterations: Number.isFinite(iter) && iter > 0
        ? Math.min(Math.floor(iter), 999)
        : defaultStudySettings.loadFlow.maxIterations
    },
    shortCircuit: {
      method: typeof sc.method === 'string' && sc.method.trim().toUpperCase() === 'ANSI' ? 'ANSI' : 'IEC'
    }
  };
}

let studySettings = normalizeStudySettings(getItem(STUDY_SETTINGS_KEY, defaultStudySettings));
let marqueeSelectionMade = false;
let legendDrag = null;
let legendUserMoved = false;
let gridSize = Number(getOneLineViewSetting('gridSize', 20));
let gridEnabled = getOneLineViewSetting('gridEnabled', true);
let alignmentGuidesEnabled = getOneLineViewSetting('alignmentGuidesEnabled', true);
let dragSnapGuides = null;
let snapIndicatorTimeout = null;
let checkpointCounter = 0;
let historyEvents = [];
let checkpoints = [];
const MAX_HISTORY_EVENTS = 200;
let validationIssues = [];
const marqueeThreshold = 4;
let templates = [];
const DIAGRAM_VERSION = 4; // bumped for Gap #48 sheet link prop normalization (linked_sheet)
let cursorPos = { x: 20, y: 20 };
let cursorPosValid = false;
let needsInitialViewportCenter = true;
let pendingInitialCenter = null;
let showOverlays = false;
let showEnergizedState = false;    // Gap #36
let showProtectionZones = false;   // Gap #50
let activeZoneId = null;           // Gap #50 – zone currently in component-assignment mode
let showHazAreaOverlay = false;    // Gap #94 – hazardous area classification overlay
let operatingOverlayEnergizedSet = new Set();
let orthogonalRouting = false;     // Gap #47
let symbolStandard = 'ANSI';       // Gap #37 – 'ANSI' or 'IEC'
let showTitleBlock = false;        // Gap #38
let titleBlockFields = {};         // Gap #38
let minimapVisible = false;        // Gap #39
// Gap #46 – per-subtype datablock config: { [subtype]: string[] }
let diagramDatablockConfig = {};
// Gap #49 – Arc Flash Label Overlays on one-line diagram
let arcFlashLabelMode = false;
const LIVE_TELEMETRY_CONFIG_KEY = 'liveTelemetryConfig';
let liveTelemetryConfig = normalizeLiveTagConfig(getItem(LIVE_TELEMETRY_CONFIG_KEY, {}));
let liveTelemetryValues = {};
let liveTelemetryError = '';
let liveTelemetryViewController = null;
let liveTelemetryFreshnessTimer = null;

function clearLiveTelemetryFreshnessTimer() {
  if (liveTelemetryFreshnessTimer) clearTimeout(liveTelemetryFreshnessTimer);
  liveTelemetryFreshnessTimer = null;
}

function scheduleLiveTelemetryFreshnessRender() {
  clearLiveTelemetryFreshnessTimer();
  if (!liveTelemetryController.running) return;
  const thresholdMs = liveTelemetryConfig.staleAfterSeconds * 1000;
  const now = Date.now();
  const nextStaleAt = Object.values(liveTelemetryValues)
    .map(reading => Date.parse(reading?.timestamp))
    .filter(Number.isFinite)
    .map(timestamp => timestamp + thresholdMs)
    .filter(timestamp => timestamp > now)
    .sort((left, right) => left - right)[0];
  if (!Number.isFinite(nextStaleAt)) return;
  const delay = Math.max(250, Math.min(60000, nextStaleAt - now + 25));
  liveTelemetryFreshnessTimer = setTimeout(() => {
    liveTelemetryFreshnessTimer = null;
    render();
    scheduleLiveTelemetryFreshnessRender();
  }, delay);
}

const liveTelemetryController = createLivePollingController({
  onReadings(payload, config) {
    liveTelemetryValues = applyLiveReadings(liveTelemetryValues, payload, config);
    liveTelemetryError = '';
    liveTelemetryViewController?.refreshTrend();
    render();
    scheduleLiveTelemetryFreshnessRender();
  },
  onError(error) {
    liveTelemetryError = error?.message || 'Telemetry poll failed.';
    render();
  },
  onStatus(status) {
    if (status?.state === 'stopped') clearLiveTelemetryFreshnessTimer();
    else scheduleLiveTelemetryFreshnessRender();
    render();
  }
});

function liveReadingLines(comp) {
  if (!liveTelemetryController.running || !comp?.id) return [];
  const reading = liveTelemetryValues[comp.id];
  const formatted = formatLiveReading(reading?.values);
  const stale = isLiveReadingStale(reading, { staleAfterSeconds: liveTelemetryConfig.staleAfterSeconds });
  const alarms = evaluateLiveAlarms(liveTelemetryValues, liveTelemetryConfig).filter(alarm => alarm.componentId === comp.id);
  const alarmLines = alarms.map(alarm => `Live alarm: ${alarm.metric} ${alarm.direction} (${alarm.value} ${alarm.direction === 'high' ? '>' : '<'} ${alarm.threshold})`);
  if (!formatted && !alarmLines.length) return [];
  return [...(formatted ? [`${stale ? 'Live stale' : 'Live'}: ${formatted}`] : ['Live alarm']), ...alarmLines];
}

function getLiveAlarms() {
  return evaluateLiveAlarms(liveTelemetryValues, liveTelemetryConfig);
}

function getLiveTelemetryViewController() {
  if (!liveTelemetryViewController) {
    liveTelemetryViewController = createLiveTelemetryViewController({
      documentRef: document,
      svgNS,
      openModal,
      getRunning: () => liveTelemetryController.running,
      getConfig: () => liveTelemetryConfig,
      getValues: () => liveTelemetryValues,
      getAlarms: () => getLiveAlarms(),
      getComponents: () => components,
      getComponentLabel: getComponentLabelText,
      getTrendSeries: getLiveTrendSeries,
      getTrendMetrics: getLiveTrendMetrics,
      summarizeTrend: summarizeLiveTrend,
      exportTrendCsv: exportLiveTrendCsv,
      BlobCtor: Blob,
      URLRef: URL,
      setTimeoutFn: setTimeout
    });
  }
  return liveTelemetryViewController;
}

function updateLiveTelemetryControl() {
  getLiveTelemetryViewController().updateControl();
}

function openLiveTrendModal(initialComponentId = '') {
  getLiveTelemetryViewController().openTrendModal(initialComponentId);
}

function openLiveAlarmModal() {
  getLiveTelemetryViewController().openAlarmModal();
}
function applyLiveOperatorLock() {
  const lock = liveTelemetryController.running && liveTelemetryConfig.operatorMode;
  const ids = ['connect-btn', 'add-shape-btn', 'undo-btn', 'redo-btn', 'align-left-btn', 'align-right-btn', 'align-top-btn', 'align-bottom-btn', 'distribute-h-btn', 'distribute-v-btn', 'auto-space-equipment-btn', 'add-sheet-btn', 'rename-sheet-btn', 'delete-sheet-btn', 'auto-build-oneline-btn', 'auto-arrange-btn', 'reconcile-schedules-btn'];
  ids.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.disabled = lock;
  });
  document.body.dataset.liveOperatorMode = lock ? '1' : '0';
}

function openLiveTelemetryModal() {
  openModal({
    title: 'Live Telemetry',
    description: 'Read-only HTTP polling or WebSocket streaming. Messages must provide { readings: [{ tag, values: { kw, kvar, kv, amps, status } }] }. Browser CORS and WebSocket origin rules apply; stale values and configured threshold alarms are marked in the one-line, and WebSocket recovery uses bounded backoff when enabled.',
    primaryText: liveTelemetryController.running ? 'Stop live mode' : 'Start live mode',
    secondaryText: 'Cancel',
    render(body) {
      const form = document.createElement('form');
      form.className = 'modal-form';
      form.innerHTML = `<label>Transport<select name="transport"><option value="http" ${liveTelemetryConfig.transport === 'websocket' ? '' : 'selected'}>HTTP polling</option><option value="websocket" ${liveTelemetryConfig.transport === 'websocket' ? 'selected' : ''}>WebSocket stream</option></select></label><label>Endpoint URL<input name="endpoint" type="url" value="${escapeHtml(liveTelemetryConfig.endpoint)}" placeholder="https://gateway.example/api/tags or wss://gateway.example/tags"></label><label>Poll interval (seconds)<input name="interval" type="number" min="5" max="3600" value="${liveTelemetryConfig.intervalSeconds}"></label><label>Stale after (seconds)<input name="staleAfter" type="number" min="5" max="86400" value="${liveTelemetryConfig.staleAfterSeconds}"></label><label>Mappings (component ID = tag, one per line)<textarea name="mappings" rows="5">${escapeHtml(liveTelemetryConfig.mappings.map(item => `${item.componentId}=${item.tag}`).join('\n'))}</textarea></label><label>Alarm limits (component.metric = low..high, one per line)<textarea name="alarms" rows="3" placeholder="BUS-1.kv=12.5..14.5&#10;MTR-1.amps=..800">${escapeHtml(liveTelemetryConfig.alarms.map(formatLiveAlarmRule).join('\n'))}</textarea></label><label><input name="reconnect" type="checkbox" ${liveTelemetryConfig.reconnect ? 'checked' : ''}> Reconnect WebSocket after disconnect (bounded backoff)</label><label><input name="operator" type="checkbox" ${liveTelemetryConfig.operatorMode ? 'checked' : ''}> Operator mode: lock editing commands while live</label>`;
      const trendButton = document.createElement('button');
      trendButton.type = 'button';
      trendButton.className = 'btn';
      trendButton.textContent = 'View 24-hour trend';
      trendButton.addEventListener('click', () => openLiveTrendModal());
      const alarmButton = document.createElement('button');
      alarmButton.type = 'button';
      alarmButton.className = 'btn';
      const alarmCount = getLiveAlarms().length;
      alarmButton.textContent = `View active alarms (${alarmCount})`;
      alarmButton.addEventListener('click', () => openLiveAlarmModal());
      form.append(trendButton, alarmButton);
      body.appendChild(form);
      return form.querySelector('[name="endpoint"]');
    },
    onSubmit(controller) {
      if (liveTelemetryController.running) {
        liveTelemetryController.stop();
        applyLiveOperatorLock();
        render();
        controller.close();
        return false;
      }
      const form = controller.body.querySelector('form');
      const mappingLines = form.elements.mappings.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const alarmLines = form.elements.alarms.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      liveTelemetryConfig = normalizeLiveTagConfig({
        endpoint: form.elements.endpoint.value,
        transport: form.elements.transport.value,
        intervalSeconds: form.elements.interval.value,
        staleAfterSeconds: form.elements.staleAfter.value,
        alarms: alarmLines,
        reconnect: form.elements.reconnect.checked,
        operatorMode: form.elements.operator.checked || getAuthRole() === 'read-only',
        mappings: mappingLines.map(line => { const [componentId, ...tag] = line.split('='); return { componentId, tag: tag.join('=') || componentId }; })
      });
      if (!liveTelemetryConfig.endpoint) {
        showAlertModal('Live Telemetry', 'Enter a read-only telemetry endpoint before starting live mode.');
        return false;
      }
      setItem(LIVE_TELEMETRY_CONFIG_KEY, liveTelemetryConfig);
      liveTelemetryController.start(liveTelemetryConfig);
      applyLiveOperatorLock();
      render();
      scheduleLiveTelemetryFreshnessRender();
      return true;
    }
  });
}

// Gap #51 – Named Layer Management
let layers = [];             // layer definitions for the active sheet: [{id,name,visible,locked}]
let activeLayerId = null;    // layer id assigned to newly placed components (null = unassigned)
const historyController = createDiagramHistoryController({
  captureSnapshot: () => ({
    components,
    layers,
    protectionZones: getProtectionZones()
  }),
  applySnapshot: snapshot => {
    components = snapshot.components;
    layers = snapshot.layers;
    sheets[activeSheet].protectionZones = snapshot.protectionZones;
    selected = null;
    selection = [];
    selectedConnection = null;
  },
  onPush: ({ reason }) => {
    pruneCheckpoints();
    recordHistoryEvent('change', reason);
  },
  onRestore: ({ action, reason, metadata }) => {
    renderLayerPanel();
    renderProtectionZonesPanel();
    render();
    save();
    recordHistoryEvent(action, reason, metadata);
  }
});
const SCHEDULE_RECONCILE_PENDING_KEY = 'oneLineScheduleReconcilePending';
let lintPanel = null;
let lintList = null;
let clickSelectTimer = null;
const SINGLE_CLICK_DELAY_MS = 175;
const DOUBLE_CLICK_THRESHOLD_MS = 400;
const DRAG_MOVE_THRESHOLD = 3;
let lastComponentClick = { id: null, time: 0 };
let lastPointerUp = { id: null, time: 0 };
let findHighlightId = null;
let findHighlightTimer = null;
let pointerDownComponentId = null;
let middlePanState = null;

// Re-run validation whenever diagram or study results change
on('oneLineDiagram', validateDiagram);
on('studyResults', validateDiagram);
on('studyResults', () => {
  cachedStudyResults = getStudies();
  refreshAttributeOptions();
  render();
});
on(STUDY_SETTINGS_KEY, value => {
  studySettings = normalizeStudySettings(value || defaultStudySettings);
  applyStudySettingsToForm();
});

// Studies panel setup
const studiesPanel = document.getElementById('studies-panel');
const studiesToggle = document.getElementById('studies-panel-btn');
const studiesCloseBtn = document.getElementById('studies-close-btn');
const studiesResizeHandle = document.getElementById('studies-resize-handle');
if (studiesPanel && hasStoredStudiesWidth) {
  studiesPanel.style.setProperty('--studies-width', `${studiesWidth}px`);
}
const runLFBtn = document.getElementById('run-loadflow-btn');
const runTapOptimizationBtn = document.getElementById('run-tap-optimization-btn');
const runSCBtn = document.getElementById('run-shortcircuit-btn');
const runAFBtn = document.getElementById('run-arcflash-btn');
const printAFLabelsBtn = document.getElementById('print-arcflash-labels-btn');
const afLabelModeToggle = document.getElementById('toggle-arcflash-label-mode');
const runHBtn = document.getElementById('run-harmonics-btn');
const runMSBtn = document.getElementById('run-motorstart-btn');
const runRelBtn = document.getElementById('run-reliability-btn');
const studyResultsEl = document.getElementById('study-results');
const loadFlowResultsEl = document.getElementById('loadflow-results');
const transformerTapReviewEl = document.getElementById('transformer-tap-review');
const overlayToggle = document.getElementById('toggle-overlays');
document.getElementById('live-telemetry-btn')?.addEventListener('click', openLiveTelemetryModal);
const studySettingsBtn = document.getElementById('study-settings-btn');
const studySettingsForm = document.getElementById('study-settings-menu');
const studyResultsCopyBtn = document.getElementById('study-results-copy-btn');
const studyLoadFlowBase = document.getElementById('study-loadflow-basemva');
const studyLoadFlowIterations = document.getElementById('study-loadflow-iterations');
const studyLoadFlowBalanced = document.getElementById('study-loadflow-balanced');
const studyShortCircuitMethod = document.getElementById('study-shortcircuit-method');
let transformerTapReview = getStudies()?.transformerTapOptimization || null;

const studyPanelController = createStudyPanelController({
  documentRef: document,
  navigatorRef: typeof navigator === 'undefined' ? null : navigator,
  elements: {
    settingsButton: studySettingsBtn,
    settingsForm: studySettingsForm,
    copyButton: studyResultsCopyBtn,
    loadFlowBase: studyLoadFlowBase,
    loadFlowIterations: studyLoadFlowIterations,
    loadFlowBalanced: studyLoadFlowBalanced,
    shortCircuitMethod: studyShortCircuitMethod,
    results: studyResultsEl,
    loadFlowResults: loadFlowResultsEl,
    overlayToggle
  },
  getSettings: () => studySettings,
  updateSettings: update => {
    studySettings = normalizeStudySettings(update(studySettings));
    setItem(STUDY_SETTINGS_KEY, studySettings);
  },
  defaultSettings: defaultStudySettings,
  getStudyResults: getStudies,
  onOverlayChange: (checked, { initial }) => {
    showOverlays = checked;
    if (!initial) render();
  },
  showToast
});

function applyStudySettingsToForm() {
  studyPanelController.applySettingsToForm();
}

function hasRenderedStudyResults() {
  return studyPanelController.hasResults();
}

function hasRenderedLoadFlowResults() {
  return studyPanelController.hasLoadFlowResults();
}

function updateStudyResultsCopyState() {
  studyPanelController.updateCopyState();
}

function renderStudyResults() {
  studyPanelController.renderResults();
}

function gatherStudyResultsText() {
  return studyPanelController.gatherResultsText();
}

async function copyStudyResultsToClipboard() {
  await studyPanelController.copyResults();
}

studyPanelController.bind();
function highlightSPF(ids = []) {
  const svg = document.getElementById('diagram');
  if (!svg) return;
  svg.querySelectorAll('g.component').forEach(g => g.classList.remove('reliability-spf'));
  ids.forEach(id => {
    const g = svg.querySelector(`g.component[data-id="${id}"]`);
    if (g) g.classList.add('reliability-spf');
  });
}

function cancelPendingClickSelection() {
  if (clickSelectTimer) {
    clearTimeout(clickSelectTimer);
    clickSelectTimer = null;
  }
}

function isScrollableElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  try {
    const style = window.getComputedStyle(element);
    const overflowX = style.overflowX || '';
    const overflowY = style.overflowY || '';
    const canScrollX = /auto|scroll|overlay/i.test(overflowX) && element.scrollWidth > element.clientWidth;
    const canScrollY = /auto|scroll|overlay/i.test(overflowY) && element.scrollHeight > element.clientHeight;
    return canScrollX || canScrollY;
  } catch {
    return false;
  }
}

function getScrollableContainer(element) {
  let current = element;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isScrollableElement(current)) return current;
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement || document.body;
}

function findScrollableAncestorWithin(element, boundary) {
  const root = boundary instanceof Element ? boundary : null;
  let current = element instanceof Element ? element : null;
  while (current) {
    if (root && !root.contains(current)) break;
    if (isScrollableElement(current)) return current;
    if (current === root) break;
    current = current.parentElement;
  }
  if (root && isScrollableElement(root)) return root;
  return null;
}

function attachLocalWheelScroll(container) {
  if (!(container instanceof HTMLElement)) return;
  container.addEventListener('wheel', event => {
    if (event.ctrlKey) return;
    const target = event.target instanceof Element ? event.target : container;
    const scrollHost = findScrollableAncestorWithin(target, container);
    if (!(scrollHost instanceof HTMLElement)) return;
    let consumed = false;
    if (event.deltaY !== 0 && scrollHost.scrollHeight > scrollHost.clientHeight) {
      const prevTop = scrollHost.scrollTop;
      scrollHost.scrollTop += event.deltaY;
      if (scrollHost.scrollTop !== prevTop) consumed = true;
    }
    if (event.deltaX !== 0 && scrollHost.scrollWidth > scrollHost.clientWidth) {
      const prevLeft = scrollHost.scrollLeft;
      scrollHost.scrollLeft += event.deltaX;
      if (scrollHost.scrollLeft !== prevLeft) consumed = true;
    }
    if (!consumed) return;
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
}

function startMiddlePan(e, container) {
  if (!container) return;
  const scrollHost = getScrollableContainer(container);
  middlePanState = {
    container: scrollHost,
    host: container,
    startX: e.clientX,
    startY: e.clientY,
    scrollLeft: scrollHost ? scrollHost.scrollLeft : 0,
    scrollTop: scrollHost ? scrollHost.scrollTop : 0
  };
  container.classList.add('panning');
}

function updateMiddlePan(e) {
  if (!middlePanState) return;
  const { container, startX, startY, scrollLeft, scrollTop } = middlePanState;
  if (!container) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  container.scrollLeft = scrollLeft - dx;
  container.scrollTop = scrollTop - dy;
}

function stopMiddlePan() {
  if (!middlePanState) return;
  if (middlePanState.host && middlePanState.host.classList) {
    middlePanState.host.classList.remove('panning');
  }
  middlePanState = null;
}

function clampZoom(value, fallback = DEFAULT_DIAGRAM_ZOOM) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    const safe = Number(fallback);
    if (Number.isFinite(safe)) {
      return Math.min(MAX_DIAGRAM_ZOOM, Math.max(MIN_DIAGRAM_ZOOM, safe));
    }
    return DEFAULT_DIAGRAM_ZOOM;
  }
  return Math.min(MAX_DIAGRAM_ZOOM, Math.max(MIN_DIAGRAM_ZOOM, num));
}

function getViewportCenter(previousZoom = diagramZoom) {
  const svg = document.getElementById('diagram');
  const editor = svg?.parentElement;
  if (!svg || !(editor instanceof HTMLElement)) return null;
  const zoom = previousZoom || diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  return {
    x: diagramViewport.minX + (editor.scrollLeft + editor.clientWidth / 2) / zoom,
    y: diagramViewport.minY + (editor.scrollTop + editor.clientHeight / 2) / zoom
  };
}

function applyDiagramZoom({ adjustScroll = false, previousZoom, focusPoint } = {}) {
  const svg = document.getElementById('diagram');
  if (!svg) return;
  const zoom = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  const { minX, minY, width, height } = diagramViewport;
  if (width && height) {
    svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    svg.style.width = `${width * zoom}px`;
    svg.style.height = `${height * zoom}px`;
  }
  const gridBg = document.getElementById('grid-bg');
  if (gridBg) {
    gridBg.setAttribute('x', String(minX));
    gridBg.setAttribute('y', String(minY));
    gridBg.setAttribute('width', String(width));
    gridBg.setAttribute('height', String(height));
  }
  // Gap #52: keep background underlay sized to the full viewport
  const bgUnderlay = document.getElementById('bg-underlay');
  if (bgUnderlay) {
    bgUnderlay.setAttribute('x', String(minX));
    bgUnderlay.setAttribute('y', String(minY));
    bgUnderlay.setAttribute('width', String(width));
    bgUnderlay.setAttribute('height', String(height));
  }
  const editor = svg.parentElement;
  if (needsInitialViewportCenter && editor instanceof HTMLElement) {
    const initialFocus = pendingInitialCenter || getStaticViewportCenter();
    const nextLeft = (initialFocus.x - minX) * zoom - editor.clientWidth / 2;
    const nextTop = (initialFocus.y - minY) * zoom - editor.clientHeight / 2;
    editor.scrollLeft = Math.max(0, nextLeft);
    editor.scrollTop = Math.max(0, nextTop);
    needsInitialViewportCenter = false;
    pendingInitialCenter = null;
  }
  if (!adjustScroll) return;
  if (!(editor instanceof HTMLElement)) return;
  const prevZoom = previousZoom || zoom;
  const focus = focusPoint || getViewportCenter(prevZoom);
  if (!focus) return;
  const nextLeft = (focus.x - minX) * zoom - editor.clientWidth / 2;
  const nextTop = (focus.y - minY) * zoom - editor.clientHeight / 2;
  editor.scrollLeft = Math.max(0, nextLeft);
  editor.scrollTop = Math.max(0, nextTop);
}

function updateDiagramViewport(bounds) {
  let nextViewport = { ...STATIC_VIEWPORT_BOUNDS };
  if (bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY) &&
      Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY)) {
    const rawWidth = bounds.maxX - bounds.minX;
    const rawHeight = bounds.maxY - bounds.minY;
    if (Number.isFinite(rawWidth) && Number.isFinite(rawHeight) && rawWidth >= 0 && rawHeight >= 0) {
      const pad = 200;
      const minWidth = STATIC_VIEWPORT_BOUNDS.width;
      const minHeight = STATIC_VIEWPORT_BOUNDS.height;
      const paddedWidth = rawWidth + pad * 2;
      const paddedHeight = rawHeight + pad * 2;
      const width = Math.min(MAX_DYNAMIC_VIEWPORT_SPAN, Math.max(minWidth, paddedWidth));
      const height = Math.min(MAX_DYNAMIC_VIEWPORT_SPAN, Math.max(minHeight, paddedHeight));
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const minX = centerX - width / 2;
      const minY = centerY - height / 2;
      if (Number.isFinite(centerX) && Number.isFinite(centerY) && Number.isFinite(minX) && Number.isFinite(minY)) {
        nextViewport = {
          minX,
          minY,
          width,
          height
        };
      }
    }
  }
  if (needsInitialViewportCenter) {
    if (bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY) &&
        Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY)) {
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
        pendingInitialCenter = { x: centerX, y: centerY };
      }
    }
    if (!pendingInitialCenter) {
      pendingInitialCenter = getStaticViewportCenter();
    }
  }
  diagramViewport = nextViewport;
}

function updateZoomDisplay() {
  const display = document.getElementById('zoom-display');
  if (!display) return;
  const percent = Math.round((diagramZoom || DEFAULT_DIAGRAM_ZOOM) * 100);
  display.textContent = `${percent}%`;
}

function setDiagramZoom(nextZoom, { focusPoint } = {}) {
  const prev = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  const clamped = clampZoom(nextZoom, prev);
  if (clamped === diagramZoom) return;
  diagramZoom = clamped;
  setOneLineViewSetting('diagramZoom', Number(diagramZoom.toFixed(2)));
  applyDiagramZoom({ adjustScroll: true, previousZoom: prev, focusPoint });
  updateZoomDisplay();
}

function adjustZoom(factor, opts = {}) {
  if (!Number.isFinite(factor) || factor === 0) return;
  setDiagramZoom((diagramZoom || DEFAULT_DIAGRAM_ZOOM) * factor, opts);
}

function getComponentCollectionBounds(items = []) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  items.forEach(comp => {
    if (!comp || comp.type === 'dimension') return;
    const b = componentVisualBounds(comp);
    minX = Math.min(minX, b.left);
    minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.right);
    maxY = Math.max(maxY, b.bottom);
  });
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function zoomToBounds(bounds, { pad = 80, maxZoom = 1.25 } = {}) {
  if (!bounds) return false;
  const svg = document.getElementById('diagram');
  const editor = svg?.parentElement;
  if (!(editor instanceof HTMLElement)) return false;
  const contentW = bounds.maxX - bounds.minX + pad * 2;
  const contentH = bounds.maxY - bounds.minY + pad * 2;
  const containerW = editor.clientWidth;
  const containerH = editor.clientHeight;
  if (!containerW || !containerH || contentW <= 0 || contentH <= 0) return false;
  const cappedMax = Number.isFinite(maxZoom) ? Math.max(MIN_DIAGRAM_ZOOM, Math.min(MAX_DIAGRAM_ZOOM, maxZoom)) : MAX_DIAGRAM_ZOOM;
  const fitZoom = clampZoom(Math.min(containerW / contentW, containerH / contentH, cappedMax));
  const prevZoom = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  diagramZoom = fitZoom;
  setOneLineViewSetting('diagramZoom', Number(diagramZoom.toFixed(2)));
  applyDiagramZoom({ adjustScroll: false, previousZoom: prevZoom });
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const nextLeft = (centerX - diagramViewport.minX) * diagramZoom - editor.clientWidth / 2;
  const nextTop = (centerY - diagramViewport.minY) * diagramZoom - editor.clientHeight / 2;
  editor.scrollLeft = Math.max(0, nextLeft);
  editor.scrollTop = Math.max(0, nextTop);
  updateZoomDisplay();
  renderMinimap();
  return true;
}

function zoomToComponents(targets = components, options = {}) {
  const uniqueTargets = [];
  const seen = new Set();
  targets.forEach(comp => {
    if (!comp || seen.has(comp.id)) return;
    seen.add(comp.id);
    uniqueTargets.push(comp);
  });
  return zoomToBounds(getComponentCollectionBounds(uniqueTargets), options);
}

function getConnectedComponentNeighborhood(targets, depth = 1) {
  const startItems = Array.isArray(targets) ? targets : [targets];
  const byId = new Map(components.map(comp => [comp.id, comp]));
  const visited = new Set();
  const queue = [];
  startItems.forEach(item => {
    const comp = typeof item === 'string' ? byId.get(item) : item;
    if (!comp?.id || visited.has(comp.id)) return;
    visited.add(comp.id);
    queue.push({ id: comp.id, distance: 0 });
  });
  for (let idx = 0; idx < queue.length; idx += 1) {
    const entry = queue[idx];
    if (entry.distance >= depth) continue;
    const comp = byId.get(entry.id);
    const neighborIds = new Set();
    (comp?.connections || []).forEach(conn => {
      if (conn?.target) neighborIds.add(conn.target);
    });
    components.forEach(other => {
      (other.connections || []).forEach(conn => {
        if (conn?.target === entry.id) neighborIds.add(other.id);
      });
    });
    neighborIds.forEach(id => {
      if (!byId.has(id) || visited.has(id)) return;
      visited.add(id);
      queue.push({ id, distance: entry.distance + 1 });
    });
  }
  return Array.from(visited).map(id => byId.get(id)).filter(Boolean);
}

function zoomToComponentNeighborhood(targets, options = {}) {
  const neighborhood = getConnectedComponentNeighborhood(targets, options.depth ?? 1);
  return zoomToComponents(neighborhood, { pad: 100, maxZoom: 1.25, ...options });
}

function zoomToFit(options = {}) {
  if (components.length && zoomToComponents(components, { pad: 90, maxZoom: 1.2, ...options })) return true;
  if (!components.length) return;
  const svg = document.getElementById('diagram');
  const editor = svg?.parentElement;
  if (!(editor instanceof HTMLElement)) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  components.forEach(comp => {
    const b = componentVisualBounds(comp);
    minX = Math.min(minX, b.left);
    minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.right);
    maxY = Math.max(maxY, b.bottom);
  });
  if (!Number.isFinite(minX)) return;
  const pad = 60;
  const contentW = maxX - minX + pad * 2;
  const contentH = maxY - minY + pad * 2;
  const containerW = editor.clientWidth;
  const containerH = editor.clientHeight;
  if (!containerW || !containerH) return;
  const fitZoom = clampZoom(Math.min(containerW / contentW, containerH / contentH));
  const prevZoom = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  diagramZoom = fitZoom;
  setOneLineViewSetting('diagramZoom', Number(diagramZoom.toFixed(2)));
  applyDiagramZoom({ adjustScroll: false, previousZoom: prevZoom });
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const nextLeft = (centerX - diagramViewport.minX) * diagramZoom - editor.clientWidth / 2;
  const nextTop = (centerY - diagramViewport.minY) * diagramZoom - editor.clientHeight / 2;
  editor.scrollLeft = Math.max(0, nextLeft);
  editor.scrollTop = Math.max(0, nextTop);
  updateZoomDisplay();
}

// Gap #42 – Zoom to selection (Shift+F)
function zoomToSelection(options = {}) {
  const targets = selection.length ? selection : (selected ? [selected] : []);
  if (targets.length && zoomToComponents(targets, { pad: 90, maxZoom: 1.45, ...options })) return true;
  if (!targets.length) return zoomToFit(options);
  if (!targets.length) { zoomToFit(); return; }
  const svg = document.getElementById('diagram');
  const editor = svg?.parentElement;
  if (!(editor instanceof HTMLElement)) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  targets.forEach(comp => {
    const b = componentVisualBounds(comp);
    minX = Math.min(minX, b.left);
    minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.right);
    maxY = Math.max(maxY, b.bottom);
  });
  if (!Number.isFinite(minX)) { zoomToFit(); return; }
  const pad = 60;
  const contentW = maxX - minX + pad * 2;
  const contentH = maxY - minY + pad * 2;
  const containerW = editor.clientWidth;
  const containerH = editor.clientHeight;
  if (!containerW || !containerH) return;
  const fitZoom = clampZoom(Math.min(containerW / contentW, containerH / contentH));
  const prevZoom = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  diagramZoom = fitZoom;
  setOneLineViewSetting('diagramZoom', Number(diagramZoom.toFixed(2)));
  applyDiagramZoom({ adjustScroll: false, previousZoom: prevZoom });
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const nextLeft = (centerX - diagramViewport.minX) * diagramZoom - containerW / 2;
  const nextTop = (centerY - diagramViewport.minY) * diagramZoom - containerH / 2;
  editor.scrollLeft = Math.max(0, nextLeft);
  editor.scrollTop = Math.max(0, nextTop);
  updateZoomDisplay();
}

function updateStatusBar() {
  const coordsEl = document.getElementById('status-coords');
  const selEl = document.getElementById('status-selection');
  const modeEl = document.getElementById('status-mode');
  if (coordsEl) {
    coordsEl.textContent = cursorPosValid
      ? `x: ${Math.round(cursorPos.x)}, y: ${Math.round(cursorPos.y)}`
      : '';
  }
  if (selEl) {
    if (selection.length > 1) {
      selEl.textContent = `${selection.length} items selected`;
    } else if (selected) {
      selEl.textContent = selected.label || selected.subtype || selected.id || '1 item selected';
    } else if (selectedConnection) {
      selEl.textContent = 'Connection selected';
    } else {
      selEl.textContent = '';
    }
  }
  if (modeEl) {
    if (!connectMode) {
      modeEl.textContent = '';
    } else if (connectSource?.component) {
      modeEl.textContent = `Connect mode: ${connectSource.component.label || connectSource.component.id} selected; click the next device (Esc to cancel)`;
    } else {
      modeEl.textContent = 'Connect mode: click a device or port, then click the next device (Esc to cancel)';
    }
  }
}

function panDiagram(direction, container) {
  if (!(container instanceof HTMLElement)) return;
  const scrollHost = getScrollableContainer(container) || container;
  if (!(scrollHost instanceof HTMLElement)) return;
  const stepX = Math.max(80, Math.round(scrollHost.clientWidth * 0.3));
  const stepY = Math.max(80, Math.round(scrollHost.clientHeight * 0.3));
  if (direction === 'left') {
    scrollHost.scrollLeft -= stepX;
  } else if (direction === 'right') {
    scrollHost.scrollLeft += stepX;
  } else if (direction === 'up') {
    scrollHost.scrollTop -= stepY;
  } else if (direction === 'down') {
    scrollHost.scrollTop += stepY;
  } else {
    return;
  }
  needsInitialViewportCenter = false;
}

function toDiagramCoords(e) {
  const svg = document.getElementById('diagram');
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  const zoom = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  const x = (e.clientX - rect.left) / zoom + diagramViewport.minX;
  const y = (e.clientY - rect.top) / zoom + diagramViewport.minY;
  return { x, y };
}

function normalizeSearchValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function componentSearchValues(comp) {
  const values = new Set();
  if (!comp || typeof comp !== 'object') return values;
  const add = val => {
    const normalized = normalizeSearchValue(val);
    if (normalized) values.add(normalized);
  };
  add(comp.label);
  add(comp.ref);
  add(comp.name);
  add(comp.id);
  add(comp.tag);
  if (comp.cable && typeof comp.cable === 'object') add(comp.cable.tag);
  if (Array.isArray(comp.tags)) comp.tags.forEach(add);
  if (comp.props && typeof comp.props === 'object') {
    ['tag', 'label', 'name', 'id'].forEach(key => add(comp.props[key]));
  }
  return values;
}

function normalizeTagValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getComponentTag(comp) {
  if (!comp || typeof comp !== 'object') return '';
  const directSources = [
    comp.tag,
    comp.props?.tag,
    comp.label,
    comp.props?.label,
    comp.name,
    comp.props?.name
  ];
  for (const source of directSources) {
    const normalized = normalizeTagValue(source);
    if (normalized) return normalized;
  }
  const fallbackSources = [
    comp.ref,
    comp.props?.ref,
    comp.id,
    comp.props?.id
  ];
  for (const source of fallbackSources) {
    const normalized = normalizeTagValue(source);
    if (normalized) return normalized;
  }
  return '';
}

function findComponentByTag(query) {
  const target = normalizeSearchValue(query);
  if (!target) return null;
  let exact = null;
  let partial = null;
  components.forEach(comp => {
    if (!comp || partial && exact) return;
    const values = componentSearchValues(comp);
    if (values.has(target)) {
      if (!exact) exact = comp;
      return;
    }
    if (!partial) {
      const hasPartial = Array.from(values).some(val => val.includes(target));
      if (hasPartial) partial = comp;
    }
  });
  return exact || partial;
}

function normalizeScheduleIdentity(value) {
  return normalizeSearchValue(value);
}

function scheduleRecordIdentity(record) {
  if (!record || typeof record !== 'object') return '';
  return normalizeTagValue(record.id || record.tag || record.ref || record.name || record.description);
}

function findScheduleRecordForComponent(comp, records = []) {
  if (!comp || !Array.isArray(records)) return null;
  const keys = [
    comp.scheduleLinks?.equipment,
    comp.scheduleLinks?.panel,
    comp.scheduleLinks?.load,
    comp.scheduleLinks?.cable,
    comp.equipmentRef,
    comp.panelRef,
    comp.loadRef,
    comp.cableRef,
    comp.ref,
    comp.tag,
    comp.id,
    getComponentTag(comp)
  ].map(normalizeScheduleIdentity).filter(Boolean);
  return records.find(record => {
    const values = [
      record.id,
      record.tag,
      record.ref,
      record.name,
      record.description
    ].map(normalizeScheduleIdentity).filter(Boolean);
    return values.some(value => keys.includes(value));
  }) || null;
}

function setComponentScheduleLink(comp, key, value) {
  if (!comp || !key) return;
  const directKey = {
    equipment: 'equipmentRef',
    panel: 'panelRef',
    load: 'loadRef',
    cable: 'cableRef'
  }[key];
  const nextValue = normalizeTagValue(value);
  if (!comp.scheduleLinks || typeof comp.scheduleLinks !== 'object') comp.scheduleLinks = {};
  if (nextValue) {
    comp.scheduleLinks[key] = nextValue;
    if (directKey) comp[directKey] = nextValue;
  } else {
    delete comp.scheduleLinks[key];
    if (directKey) comp[directKey] = '';
  }
  if (!Object.keys(comp.scheduleLinks).length) delete comp.scheduleLinks;
}

function scheduleKeyForComponent(comp) {
  const category = getCategory(comp);
  if (category === 'load') return 'load';
  if (category === 'panel') return 'panel';
  if (category === 'cable') return 'cable';
  return 'equipment';
}

const renderPerformance = createOneLineRenderPerformance({ getEquipment, getPanels, getLoads, getCables, getCollections: getOneLineScheduleCollections });

function scheduleCollectionForKey(key) { return renderPerformance.getCollection(key); }

function hasResolvedScheduleLink(comp) {
  if (!comp) return false;
  const keys = [...new Set([scheduleKeyForComponent(comp), 'equipment', 'panel', 'load', 'cable'].filter(Boolean))];
  return keys.some(key => {
    if (!comp.scheduleLinks?.[key] && !comp[`${key}Ref`] && key !== scheduleKeyForComponent(comp)) return false;
    return !!findScheduleRecordForComponent(comp, scheduleCollectionForKey(key));
  });
}

function persistScheduleCollectionForKey(key, records) {
  if (key === 'load') {
    setLoads(records);
  } else if (key === 'panel') {
    setPanels(records);
  } else if (key === 'cable') {
    setCables(records);
  } else {
    setEquipment(records);
  }
}

function buildScheduleRecordFromComponent(comp, key = scheduleKeyForComponent(comp)) {
  const tag = getComponentTag(comp) || comp?.id || '';
  const voltage = resolveComponentVoltageVolts(comp);
  const base = {
    id: comp.ref || tag || comp.id,
    ref: comp.id || '',
    tag,
    description: comp.description || comp.label || '',
    voltage: Number.isFinite(voltage) ? formatVoltageString(voltage) : (comp.voltage || comp.volts || ''),
    category: getCategory(comp),
    subCategory: comp.subtype || '',
    manufacturer: comp.manufacturer || comp.props?.manufacturer || '',
    model: comp.model || comp.props?.model || '',
    phases: comp.phases || comp.props?.phases || '',
    notes: comp.notes || ''
  };
  if (key === 'load') {
    return {
      ...base,
      source: comp.source || comp.panelRef || comp.scheduleLinks?.panel || '',
      kw: comp.load?.kw ?? comp.props?.load?.kw ?? comp.kw ?? comp.load_kw ?? ''
    };
  }
  if (key === 'cable') {
    return {
      ...base,
      from_tag: comp.from_tag || '',
      to_tag: comp.to_tag || '',
      cable_type: comp.cable?.cable_type || comp.cable_type || '',
      conductors: comp.cable?.conductors || comp.conductors || '',
      phases: formatCablePhases(comp.cable || comp)
    };
  }
  return base;
}

function autoLinkComponentToSchedule(comp, { createIfMissing = true } = {}) {
  if (!comp) return false;
  const key = scheduleKeyForComponent(comp);
  const records = scheduleCollectionForKey(key);
  const existing = findScheduleRecordForComponent(comp, records);
  if (existing) {
    setComponentScheduleLink(comp, key, scheduleRecordIdentity(existing) || existing.id || existing.tag);
    return true;
  }
  if (!createIfMissing) return false;
  const next = buildScheduleRecordFromComponent(comp, key);
  records.push(next);
  persistScheduleCollectionForKey(key, records);
  setComponentScheduleLink(comp, key, next.id || next.tag);
  return true;
}

function selectedConnectionContext() {
  if (!selectedConnection?.component) return null;
  const source = selectedConnection.component;
  const index = selectedConnection.index;
  const conn = Array.isArray(source.connections) ? source.connections[index] : null;
  if (!conn) return null;
  const target = components.find(comp => comp.id === conn.target) || null;
  return { source, index, conn, target };
}

function connectionTag(source, target, conn = null) {
  const existing = conn?.cable?.tag || conn?.cable_tag || conn?.tag;
  if (normalizeTagValue(existing)) return normalizeTagValue(existing);
  const from = normalizeTagValue(getComponentTag(source) || source?.id || 'FROM').replace(/\s+/g, '-');
  const to = normalizeTagValue(getComponentTag(target) || target?.id || 'TO').replace(/\s+/g, '-');
  return `CBL-${from}-${to}`;
}

function upsertCableScheduleRecordForConnection(source, target, conn, fields = {}) {
  if (!source || !target || !conn) return null;
  const tag = normalizeTagValue(fields.tag || connectionTag(source, target, conn));
  if (!tag) return null;
  const voltage = resolveConnectionVoltageVolts(source, conn, 'source')
    || resolveConnectionVoltageVolts(target, conn, 'target');
  const baseRecord = {
    id: tag,
    tag,
    from_tag: getComponentTag(source) || source.id || '',
    to_tag: getComponentTag(target) || target.id || '',
    voltage: Number.isFinite(voltage) ? formatVoltageString(voltage) : '',
    cable_type: fields.cable_type || conn.cable?.cable_type || '',
    phases: fields.phases || formatCablePhases(conn.phases || conn.cable || source),
    conductors: fields.conductors || conn.conductors || conn.cable?.conductors || '',
    conductor_size: fields.conductor_size || conn.cable?.conductor_size || '',
    notes: fields.notes || conn.cable?.notes || '',
    generated: true,
    review_status: 'assumed',
    source: 'One-Line'
  };
  const cables = getCables();
  const existingIndex = cables.findIndex(cable => {
    const key = normalizeScheduleIdentity(cable.id || cable.tag || cable.ref);
    return key && key === normalizeScheduleIdentity(tag);
  });
  if (existingIndex >= 0) {
    cables[existingIndex] = { ...baseRecord, ...cables[existingIndex], ...fields, id: cables[existingIndex].id || tag, tag };
  } else {
    cables.push({ ...baseRecord, ...fields });
  }
  setCables(cables);
  conn.cable = {
    ...(conn.cable || {}),
    ...fields,
    tag,
    provisional: false,
    scheduleLinked: true
  };
  conn.cableRef = tag;
  conn.cable_tag = tag;
  conn.generated = conn.generated || true;
  conn.reviewStatus = conn.reviewStatus || 'assumed';
  return existingIndex >= 0 ? cables[existingIndex] : cables[cables.length - 1];
}

function markComponentAssumption(comp, note = 'Marked for user review') {
  if (!comp) return false;
  const entry = {
    note,
    source: 'One-Line review',
    createdAt: new Date().toISOString()
  };
  if (!Array.isArray(comp.assumptions)) comp.assumptions = [];
  comp.assumptions.push(entry);
  comp.reviewStatus = 'assumed';
  return true;
}

function getComponentReviewBadges(comp) {
  const badges = [];
  if (!comp || typeof comp !== 'object') return badges;
  if (comp.generated) badges.push({ text: 'G', label: 'Generated from project data', className: 'generated' });
  if (comp.reviewStatus === 'assumed' || (Array.isArray(comp.assumptions) && comp.assumptions.length)) {
    badges.push({ text: 'A', label: 'Assumption needs review', className: 'assumption' });
  }
  if (!hasResolvedScheduleLink(comp)) {
    badges.push({ text: 'L', label: 'Schedule link missing', className: 'link' });
  }
  return badges;
}

function componentMatchesDiagramFilter(comp) {
  if (!comp || diagramFilterMode === 'all') return true;
  if (diagramFilterMode === 'generated') return !!comp.generated;
  if (diagramFilterMode === 'assumptions') {
    return comp.reviewStatus === 'assumed' || (Array.isArray(comp.assumptions) && comp.assumptions.length);
  }
  if (diagramFilterMode === 'incomplete') {
    const linked = hasResolvedScheduleLink(comp);
    const connected = (comp.connections || []).length || components.some(other => (other.connections || []).some(conn => conn.target === comp.id));
    return !linked || !connected || comp.reviewStatus === 'assumed';
  }
  const category = getCategory(comp);
  if (diagramFilterMode === 'protection') return isProtectionComponent(comp);
  if (diagramFilterMode === 'loads') return category === 'load';
  if (diagramFilterMode === 'equipment') return category === 'equipment' || category === 'panel' || isBusComponent(comp);
  return true;
}

function classifyConnectionRole(source, target) {
  if (isBusComponent(source) || isBusComponent(target)) return 'connection-main';
  if (isSourceComponent(source) || isSourceComponent(target)) return 'connection-main';
  if (isProtectionComponent(source) || isProtectionComponent(target)) return 'connection-device';
  return 'connection-branch';
}

function syncDatablockFormatControl() {
  const select = document.getElementById('datablock-format-select');
  if (select) select.value = datablockFormatMode;
}

function isEngineeringPrintMode() {
  return oneLineDrawingMode === 'engineeringPrint';
}

function syncDrawingModeControl() {
  const select = document.getElementById('drawing-mode-select');
  if (select) select.value = oneLineDrawingMode;
}

function applyDrawingModeClass() {
  const active = isEngineeringPrintMode();
  document.body.classList.toggle('engineering-print-mode', active);
  document.querySelector('.workspace')?.classList.toggle('engineering-print-mode', active);
}

function scheduleEngineeringPrintFit() {
  if (!isEngineeringPrintMode() || typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (isEngineeringPrintMode()) zoomToFit({ maxZoom: 1.15, pad: 80 });
    });
  });
}

function setDrawingMode(mode) {
  const nextMode = Object.prototype.hasOwnProperty.call(drawingModeLabels, mode) ? mode : 'edit';
  oneLineDrawingMode = nextMode;
  setOneLineViewSetting(drawingModeStorageKey, oneLineDrawingMode);
  syncDrawingModeControl();
  applyDrawingModeClass();
  if (isEngineeringPrintMode()) {
    if (dataStateOverlayMode !== 'none') {
      dataStateOverlayMode = 'none';
      setOneLineViewSetting(dataStateOverlayStorageKey, dataStateOverlayMode);
      syncDataStateOverlayControl();
    }
    if (datablockFormatMode === 'off') {
      setDatablockFormatMode('engineering');
      scheduleEngineeringPrintFit();
      return;
    }
  }
  render();
  scheduleEngineeringPrintFit();
}

function setDatablockFormatMode(mode) {
  const nextMode = Object.prototype.hasOwnProperty.call(datablockFormatLabels, mode) ? mode : 'off';
  datablockFormatMode = nextMode;
  setOneLineViewSetting(datablockFormatStorageKey, datablockFormatMode);
  if (nextMode !== 'custom') {
    const preset = datablockFormatPresets[nextMode] || [];
    const persisted = sanitizeViewAttributeList(preset);
    viewAttributes = new Set(persisted);
    setOneLineViewSetting(viewAttributeStorageKey, persisted);
  }
  updateViewButtonLabel();
  syncDatablockFormatControl();
  render();
}

function markDatablockFormatCustom() {
  if (datablockFormatMode === 'custom') return;
  datablockFormatMode = 'custom';
  setOneLineViewSetting(datablockFormatStorageKey, datablockFormatMode);
  syncDatablockFormatControl();
}

function syncDatablockDensityControl() {
  const select = document.getElementById('datablock-density-select');
  if (select) select.value = datablockDensityMode;
}

function setDatablockDensityMode(mode) {
  datablockDensityMode = Object.prototype.hasOwnProperty.call(datablockDensityLabels, mode) ? mode : 'compact';
  setOneLineViewSetting(datablockDensityStorageKey, datablockDensityMode);
  syncDatablockDensityControl();
  render();
}

function syncDataStateOverlayControl() {
  const select = document.getElementById('data-state-overlay-select');
  if (select) select.value = dataStateOverlayMode;
}

function setDataStateOverlayMode(mode) {
  dataStateOverlayMode = Object.prototype.hasOwnProperty.call(dataStateOverlayLabels, mode) ? mode : 'none';
  setOneLineViewSetting(dataStateOverlayStorageKey, dataStateOverlayMode);
  syncDataStateOverlayControl();
  render();
}

function syncOperatingStateControl() {
  const select = document.getElementById('operating-state-select');
  if (select) select.value = activeOperatingState;
}

function setActiveOperatingState(state) {
  activeOperatingState = Object.prototype.hasOwnProperty.call(operatingStateLabels, state) ? state : 'normal';
  setOneLineViewSetting(operatingStateStorageKey, activeOperatingState);
  showEnergizedState = true;
  const toggle = document.getElementById('toggle-energized');
  if (toggle) toggle.checked = true;
  syncOperatingStateControl();
  render();
}

function getOperatingStateOverride(comp, state = activeOperatingState) {
  if (!comp || !state || !comp.operatingStates || typeof comp.operatingStates !== 'object') return null;
  const override = comp.operatingStates[state];
  return override && typeof override === 'object' ? override : null;
}

function getComponentOperatingStatus(comp, state = activeOperatingState) {
  const override = getOperatingStateOverride(comp, state);
  const value = override?.state || comp?.props?.state || comp?.state || comp?.service_status || comp?.props?.service_status || 'closed';
  const normalized = String(value || '').trim().toLowerCase();
  if (['open', 'off', 'de-energized', 'deenergized', 'out_of_service', 'out-of-service'].includes(normalized)) return 'open';
  if (['closed', 'on', 'energized', 'in_service', 'in-service', 'normal'].includes(normalized)) return 'closed';
  return normalized || 'closed';
}

function isComponentOpenForOperatingState(comp, state = activeOperatingState) {
  return getComponentOperatingStatus(comp, state) === 'open';
}

function setComponentOperatingStatus(comp, status) {
  if (!comp) return false;
  const compId = comp.id;
  const normalized = String(status || '').trim().toLowerCase();
  if (!comp.operatingStates || typeof comp.operatingStates !== 'object') comp.operatingStates = {};
  if (!normalized || normalized === 'normal') {
    delete comp.operatingStates[activeOperatingState];
  } else {
    comp.operatingStates[activeOperatingState] = {
      state: normalized === 'open' ? 'open' : 'closed',
      updatedAt: new Date().toISOString()
    };
  }
  if (!Object.keys(comp.operatingStates).length) delete comp.operatingStates;
  selected = comp;
  selection = [comp];
  selectedConnection = null;
  pushHistory();
  render();
  save(false);
  const savedComp = components.find(item => item.id === compId);
  if (savedComp) {
    selected = savedComp;
    selection = [savedComp];
    selectedConnection = null;
    renderRightRail();
  }
  showToast(`${comp.label || comp.tag || comp.id} marked ${normalized || 'normal'} for ${operatingStateLabels[activeOperatingState]}`);
  return true;
}

function validationIssuesForComponent(comp) {
  if (!comp) return [];
  return validationIssues.filter(issue => {
    if (!issue) return false;
    if (issue.component === comp || issue.component?.id === comp.id) return true;
    if (issue.target === comp || issue.target?.id === comp.id) return true;
    if (issue.source === comp || issue.source?.id === comp.id) return true;
    if (issue.targetId === comp.id || issue.sourceId === comp.id || issue.componentId === comp.id) return true;
    return false;
  });
}

function componentHasAnyConnection(comp) {
  if (!comp) return false;
  return Boolean((comp.connections || []).length || components.some(other => (other.connections || []).some(conn => conn.target === comp.id)));
}

function getComponentReviewState(comp) {
  if (!comp) return { key: 'incomplete', label: 'Incomplete', color: '#ef4444' };
  if (validationIssuesForComponent(comp).length) return { key: 'incomplete', label: 'Validation issue', color: '#ef4444' };
  if (comp.reviewStatus === 'assumed' || (Array.isArray(comp.assumptions) && comp.assumptions.length)) {
    return { key: 'estimated', label: 'Estimated / assumption', color: '#f59e0b' };
  }
  if (!hasResolvedScheduleLink(comp)) return { key: 'incomplete', label: 'Schedule link missing', color: '#ef4444' };
  if (!componentHasAnyConnection(comp) && !isSourceComponent(comp)) return { key: 'incomplete', label: 'Unconnected', color: '#ef4444' };
  if (comp.reviewStatus === 'approved' || comp.reviewStatus === 'verified') {
    return { key: 'verified', label: 'Verified', color: '#2563eb' };
  }
  return { key: 'complete', label: 'Complete', color: '#16a34a' };
}

const oneLineStudyMetaKey = '_oneLineMeta';

function studyApprovalStatus(studyKey) {
  const project = getProjectState() || {};
  const approval = project.studyApprovals?.[studyKey]
    || project.approvals?.[studyKey]
    || project.settings?.studyApprovals?.[studyKey]
    || null;
  return String(approval?.status || 'pending').trim().toLowerCase();
}

function getStudyProvenance(studyKey) {
  const result = cachedStudyResults?.[studyKey];
  if (!result) return { status: 'none', scenario: getCurrentScenario() || 'default', approval: 'pending', runAt: null };
  const meta = cachedStudyResults?.[oneLineStudyMetaKey]?.[studyKey] || null;
  const currentScenario = getCurrentScenario() || 'default';
  const approval = studyApprovalStatus(studyKey);
  if (!meta) return { status: 'unknown', scenario: currentScenario, approval, runAt: null };
  const scenarioMatches = !meta.scenario || meta.scenario === currentScenario;
  const revisionMatches = !meta.oneLineRevision || meta.oneLineRevision === getOneLineSheetsRevision(getOneLine());
  return {
    status: scenarioMatches && revisionMatches ? 'current' : 'stale',
    scenario: meta.scenario || currentScenario,
    approval,
    runAt: meta.runAt || null
  };
}

function withStudyProvenance(state, studyKey) {
  const provenance = getStudyProvenance(studyKey);
  if (provenance.status === 'stale') {
    return { key: 'stale', label: `${state.label} · stale result`, color: '#7c3aed', provenance };
  }
  if (profile === 'transferSwitch') {
    return {
      width: 72,
      height: 72,
      ports: [
        { x: 18, y: 0 },
        { x: 54, y: 0 },
        { x: 36, y: 72 }
      ]
    };
  }
  if (provenance.status === 'unknown') {
    return { key: 'unknown', label: `${state.label} · freshness unknown`, color: '#64748b', provenance };
  }
  return { ...state, provenance };
}

function getComponentLoadFlowState(comp) {
  const voltageMagnitudes = getFiniteVoltageMagnitudes(comp?.voltage_mag);
  if (!voltageMagnitudes.length) return { key: 'none', label: 'No load-flow result', color: '#94a3b8' };
  const maxDev = voltageMagnitudes.reduce((max, mag) => Math.max(max, Math.abs(mag - 1) * 100), 0);
  if (maxDev > 10) return withStudyProvenance({ key: 'fail', label: `Voltage deviation ${maxDev.toFixed(1)}%`, color: '#dc2626' }, 'loadFlow');
  if (maxDev > 5) return withStudyProvenance({ key: 'warn', label: `Voltage deviation ${maxDev.toFixed(1)}%`, color: '#f59e0b' }, 'loadFlow');
  return withStudyProvenance({ key: 'pass', label: `Voltage deviation ${maxDev.toFixed(1)}%`, color: '#16a34a' }, 'loadFlow');
}

function componentInterruptingRatingKA(comp) {
  const candidates = [
    comp?.interrupting_rating_ka,
    comp?.props?.interrupting_rating_ka,
    comp?.interrupt_rating_ka,
    comp?.props?.interrupt_rating_ka,
    comp?.main_interrupting_ka,
    comp?.props?.main_interrupting_ka,
    comp?.sccr_ka,
    comp?.props?.sccr_ka
  ];
  const value = candidates.map(Number).find(Number.isFinite);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getComponentFaultDutyState(comp) {
  const sc = cachedStudyResults?.shortCircuit?.[comp?.id] || comp?.shortCircuit;
  const faultKA = Number(sc?.threePhaseKA);
  if (!Number.isFinite(faultKA)) return { key: 'none', label: 'No fault-duty result', color: '#94a3b8' };
  if (Array.isArray(sc?.warnings) && sc.warnings.length) {
    return withStudyProvenance({ key: 'warn', label: `${sc.warnings.length} short-circuit warning${sc.warnings.length === 1 ? '' : 's'}`, color: '#f59e0b' }, 'shortCircuit');
  }
  const ratingKA = componentInterruptingRatingKA(comp);
  if (ratingKA !== null && faultKA > ratingKA) {
    return withStudyProvenance({ key: 'fail', label: `${faultKA.toFixed(2)} kA exceeds ${ratingKA.toFixed(2)} kA rating`, color: '#dc2626' }, 'shortCircuit');
  }
  const label = ratingKA === null
    ? `${faultKA.toFixed(2)} kA available; equipment rating not entered`
    : `${faultKA.toFixed(2)} kA within ${ratingKA.toFixed(2)} kA rating`;
  return withStudyProvenance({ key: ratingKA === null ? 'warn' : 'pass', label, color: ratingKA === null ? '#f59e0b' : '#16a34a' }, 'shortCircuit');
}

function getComponentArcFlashState(comp) {
  const af = comp ? (cachedStudyResults?.arcFlash?.[comp.id] || comp.arcFlash) : null;
  if (!af || !Number.isFinite(Number(af.incidentEnergy))) {
    return { key: 'none', label: 'No arc flash result', color: '#94a3b8' };
  }
  const incidentEnergy = Number(af.incidentEnergy);
  if (incidentEnergy >= 40) return withStudyProvenance({ key: 'very-high', label: `Very high incident energy (${incidentEnergy.toFixed(2)} cal/cm²)`, color: '#dc2626' }, 'arcFlash');
  if (incidentEnergy >= 8) return withStudyProvenance({ key: 'high', label: `High incident energy (${incidentEnergy.toFixed(2)} cal/cm²)`, color: '#f97316' }, 'arcFlash');
  if (incidentEnergy >= 1.2) return withStudyProvenance({ key: 'warning', label: `Arc flash warning (${incidentEnergy.toFixed(2)} cal/cm²)`, color: '#f59e0b' }, 'arcFlash');
  return withStudyProvenance({ key: 'low', label: `Below 1.2 cal/cm² (${incidentEnergy.toFixed(2)} cal/cm²)`, color: '#16a34a' }, 'arcFlash');
}

function getComponentOperatingOverlayState(comp) {
  const status = getComponentOperatingStatus(comp);
  if (status === 'open') return { key: 'open', label: `Open in ${operatingStateLabels[activeOperatingState]}`, color: '#f59e0b' };
  if (operatingOverlayEnergizedSet.has(comp?.id)) return { key: 'energized', label: `Energized in ${operatingStateLabels[activeOperatingState]}`, color: '#16a34a' };
  return { key: 'deenergized', label: `De-energized in ${operatingStateLabels[activeOperatingState]}`, color: '#64748b' };
}

function getComponentValidationState(comp) {
  const issues = validationIssuesForComponent(comp);
  if (issues.length) return { key: 'fail', label: `${issues.length} validation issue${issues.length === 1 ? '' : 's'}`, color: '#dc2626' };
  return { key: 'pass', label: 'Diagram validation clear', color: '#16a34a' };
}

function getComponentColorInfo(comp) {
  if (dataStateOverlayMode === 'review') return getComponentReviewState(comp);
  if (dataStateOverlayMode === 'validation') return getComponentValidationState(comp);
  if (dataStateOverlayMode === 'loadFlow') return getComponentLoadFlowState(comp);
  if (dataStateOverlayMode === 'faultDuty') return getComponentFaultDutyState(comp);
  if (dataStateOverlayMode === 'arcFlash') return getComponentArcFlashState(comp);
  if (dataStateOverlayMode === 'operating') return getComponentOperatingOverlayState(comp);
  return null;
}

function createCommandMenu(label, options = {}) {
  const details = document.createElement('details');
  details.className = ['command-menu', options.align === 'right' ? 'command-menu-right' : ''].filter(Boolean).join(' ');
  const summary = document.createElement('summary');
  summary.className = 'btn command-menu-trigger';
  summary.textContent = label;
  const panel = document.createElement('div');
  panel.className = ['command-menu-panel', options.wide ? 'command-menu-panel-wide' : '', options.icons ? 'command-menu-panel-icons' : ''].filter(Boolean).join(' ');
  details.append(summary, panel);
  return { details, summary, panel };
}

function normalizeCommandButton(button, label) {
  if (!(button instanceof HTMLElement)) return null;
  button.className = 'command-menu-item';
  button.type = 'button';
  if (label) {
    button.textContent = label;
  } else if (!button.textContent.trim()) {
    button.textContent = button.getAttribute('aria-label') || button.getAttribute('title') || 'Command';
  }
  return button;
}

function normalizePrimaryButton(button, label) {
  if (!(button instanceof HTMLElement)) return null;
  button.className = 'btn primary-command-btn';
  button.type = 'button';
  if (label) button.textContent = label;
  return button;
}

function normalizeMenuLabel(label) {
  if (!(label instanceof HTMLElement)) return null;
  label.classList.remove('icon-button');
  label.classList.add('command-menu-check');
  label.querySelector('img')?.remove();
  label.querySelector('input')?.classList.remove('hidden-input');
  return label;
}

function appendIfPresent(parent, node) {
  if (parent && node) parent.appendChild(node);
}

function refineOneLineCommandSurface() {
  const sheetControls = document.querySelector('.sheet-controls');
  const toolbar = document.querySelector('.toolbar');
  if (!sheetControls || !toolbar || sheetControls.dataset.commandUi === 'refined') return;
  sheetControls.dataset.commandUi = 'refined';
  sheetControls.classList.add('oneline-command-header');
  toolbar.classList.add('refined-toolbar');

  const scenarioControls = document.querySelector('.scenario-controls');
  if (scenarioControls) scenarioControls.classList.add('command-context');

  const sheetTabs = document.getElementById('sheet-tabs');
  const sheetActions = document.querySelector('.sheet-action-group');
  if (sheetTabs) {
    const sheetSwitcher = document.createElement('div');
    sheetSwitcher.className = 'sheet-switcher';
    const label = document.createElement('span');
    label.className = 'command-label';
    label.textContent = 'Sheet';
    const sheetMenu = createCommandMenu('Sheet');
    appendIfPresent(sheetMenu.panel, normalizeCommandButton(document.getElementById('add-sheet-btn'), 'Add Sheet'));
    appendIfPresent(sheetMenu.panel, normalizeCommandButton(document.getElementById('rename-sheet-btn'), 'Rename Sheet'));
    appendIfPresent(sheetMenu.panel, normalizeCommandButton(document.getElementById('delete-sheet-btn'), 'Delete Sheet'));
    sheetSwitcher.append(label, sheetTabs, sheetMenu.details);
    sheetControls.insertBefore(sheetSwitcher, sheetActions || scenarioControls?.nextSibling || null);
  }

  const primaryActions = document.createElement('div');
  primaryActions.className = 'primary-action-group';
  const autoBuildButton = document.getElementById('auto-build-oneline-btn');
  const autoBuildPlan = buildAutoBuildPlan();
  const autoBuildHasChanges = autoBuildPlan.createsSource
    || autoBuildPlan.missingEquipment.length > 0
    || autoBuildPlan.missingLoads.length > 0;
  if (autoBuildButton) autoBuildButton.hidden = !autoBuildHasChanges;
  if (autoBuildHasChanges) appendIfPresent(primaryActions, normalizePrimaryButton(autoBuildButton, 'Auto-Build'));
  appendIfPresent(primaryActions, normalizePrimaryButton(document.getElementById('validate-btn'), 'Validate'));
  appendIfPresent(primaryActions, normalizePrimaryButton(document.getElementById('reconcile-schedules-primary-btn'), 'Review Schedule Changes'));
  appendIfPresent(primaryActions, normalizePrimaryButton(document.getElementById('history-sidebar-toggle'), 'Inspector'));
  const reviewMenu = createCommandMenu('Review', { align: 'right' });
  appendIfPresent(reviewMenu.panel, normalizeCommandButton(document.getElementById('scenario-duplicate-btn'), 'Duplicate Scenario'));
  appendIfPresent(reviewMenu.panel, normalizeCommandButton(document.getElementById('scenario-diff-btn'), 'Scenario Diff'));
  appendIfPresent(reviewMenu.panel, normalizeCommandButton(document.getElementById('scenario-compare-btn'), 'Compare Scenarios'));
  appendIfPresent(reviewMenu.panel, normalizeCommandButton(document.getElementById('revision-btn'), 'Revisions'));
  appendIfPresent(reviewMenu.panel, normalizeCommandButton(document.getElementById('studies-panel-btn'), 'Studies'));
  appendIfPresent(reviewMenu.panel, normalizeCommandButton(document.getElementById('tour-btn'), 'Tour'));
  primaryActions.appendChild(reviewMenu.details);
  sheetControls.appendChild(primaryActions);

  const editGroup = toolbar.querySelector('.toolbar-group[aria-label="Edit"]');
  if (editGroup) {
    editGroup.classList.add('compact-tool-group');
    const label = editGroup.querySelector('.toolbar-group-label');
    if (label) label.textContent = 'Tools';
  }

  const buildMenu = createCommandMenu('Build');
  appendIfPresent(buildMenu.panel, normalizeCommandButton(document.getElementById('sample-diagram-btn'), 'Load Sample'));
  appendIfPresent(buildMenu.panel, normalizeCommandButton(document.getElementById('auto-arrange-btn'), 'Auto Arrange'));
  appendIfPresent(buildMenu.panel, normalizeCommandButton(document.getElementById('reconcile-schedules-btn'), 'Review Shared Data'));

  const insertMenu = createCommandMenu('Insert');
  appendIfPresent(insertMenu.panel, normalizeCommandButton(document.getElementById('add-shape-btn'), 'Add Shape'));
  appendIfPresent(insertMenu.panel, normalizeCommandButton(document.getElementById('layers-panel-toggle'), 'Layers Panel'));
  appendIfPresent(insertMenu.panel, normalizeCommandButton(document.getElementById('protection-zones-panel-toggle'), 'Protection Zones'));

  const arrangeMenu = createCommandMenu('Arrange', { icons: true });
  ['align-left-btn', 'align-right-btn', 'align-top-btn', 'align-bottom-btn', 'distribute-h-btn', 'distribute-v-btn'].forEach(id => {
    appendIfPresent(arrangeMenu.panel, document.getElementById(id));
  });
  appendIfPresent(arrangeMenu.panel, normalizeCommandButton(document.getElementById('auto-space-equipment-btn'), 'Auto Space Equipment'));

  const viewMenu = createCommandMenu('View', { wide: true });
  viewMenu.details.classList.add('drawing-mode-menu');
  appendIfPresent(viewMenu.panel, normalizeCommandButton(document.getElementById('view-menu-btn'), 'Component Fields'));
  appendIfPresent(viewMenu.panel, document.getElementById('drawing-mode-select')?.closest('label'));
  appendIfPresent(viewMenu.panel, document.getElementById('datablock-format-select')?.closest('label'));
  appendIfPresent(viewMenu.panel, document.getElementById('datablock-density-select')?.closest('label'));
  appendIfPresent(viewMenu.panel, document.getElementById('data-state-overlay-select')?.closest('label'));
  appendIfPresent(viewMenu.panel, document.getElementById('diagram-filter-select')?.closest('label'));
  appendIfPresent(viewMenu.panel, normalizeMenuLabel(document.getElementById('minimap-toggle')?.closest('label')));
  appendIfPresent(viewMenu.panel, normalizeMenuLabel(document.getElementById('toggle-energized')?.closest('label')));
  appendIfPresent(viewMenu.panel, normalizeMenuLabel(document.getElementById('toggle-protection-zones')?.closest('label')));
  appendIfPresent(viewMenu.panel, normalizeMenuLabel(document.getElementById('toggle-haz-area')?.closest('label')));
  appendIfPresent(viewMenu.panel, document.getElementById('bg-image-input'));
  appendIfPresent(viewMenu.panel, normalizeCommandButton(document.getElementById('bg-image-btn'), 'Background Image'));

  const gridMenu = createCommandMenu('Grid');
  appendIfPresent(gridMenu.panel, normalizeMenuLabel(document.getElementById('grid-toggle')?.closest('label')));
  const gridSizeLabel = document.getElementById('grid-size')?.closest('label');
  if (gridSizeLabel) {
    gridSizeLabel.classList.remove('icon-button');
    gridSizeLabel.classList.add('command-menu-field');
    gridSizeLabel.querySelector('img')?.remove();
    const text = document.createElement('span');
    text.textContent = 'Grid Size';
    gridSizeLabel.prepend(text);
    gridMenu.panel.appendChild(gridSizeLabel);
  }
  appendIfPresent(gridMenu.panel, normalizeMenuLabel(document.getElementById('orthogonal-routing-toggle')?.closest('label')));
  appendIfPresent(gridMenu.panel, normalizeMenuLabel(document.getElementById('alignment-guides-toggle')?.closest('label')));

  const zoomMenu = createCommandMenu('Zoom', { wide: true });
  zoomMenu.details.classList.add('drawing-mode-zoom-menu');
  const zoomDisplay = document.getElementById('zoom-display');
  if (zoomDisplay) {
    zoomMenu.summary.textContent = 'Zoom ';
    zoomMenu.summary.appendChild(zoomDisplay);
  }
  appendIfPresent(zoomMenu.panel, document.querySelector('.zoom-controls'));
  appendIfPresent(zoomMenu.panel, document.querySelector('.pan-controls'));

  const fileMenu = createCommandMenu('File');
  appendIfPresent(fileMenu.panel, document.querySelector('.export-group'));
  appendIfPresent(fileMenu.panel, document.getElementById('import-input'));
  appendIfPresent(fileMenu.panel, normalizeCommandButton(document.getElementById('import-btn'), 'Import Drawing'));
  appendIfPresent(fileMenu.panel, normalizeCommandButton(document.getElementById('diagram-export-btn'), 'Export JSON'));
  appendIfPresent(fileMenu.panel, document.getElementById('diagram-import-input'));
  appendIfPresent(fileMenu.panel, normalizeCommandButton(document.getElementById('diagram-import-btn'), 'Import JSON'));
  appendIfPresent(fileMenu.panel, normalizeCommandButton(document.getElementById('diagram-share-btn'), 'Share'));
  appendIfPresent(fileMenu.panel, normalizeCommandButton(document.getElementById('export-oneline-data-btn'), 'Export One-Line Data'));
  appendIfPresent(fileMenu.panel, normalizeCommandButton(document.getElementById('title-block-btn'), 'Title Block'));

  const findGroup = toolbar.querySelector('.toolbar-group[aria-label="Find devices"]');
  if (findGroup) {
    findGroup.classList.add('find-toolbar-group');
    findGroup.querySelector('.toolbar-group-label')?.remove();
  }

  if (editGroup) {
    editGroup.after(buildMenu.details, insertMenu.details, arrangeMenu.details, viewMenu.details, gridMenu.details, zoomMenu.details, fileMenu.details);
  } else {
    toolbar.prepend(buildMenu.details, insertMenu.details, arrangeMenu.details, viewMenu.details, gridMenu.details, zoomMenu.details, fileMenu.details);
  }
  if (findGroup) toolbar.appendChild(findGroup);

  [sheetActions, document.querySelector('.scenario-action-group')].forEach(group => {
    if (group && !group.querySelector('button, input, select, form, details')) group.remove();
  });
  toolbar.querySelectorAll('.toolbar-group').forEach(group => {
    if (!group.querySelector('button, input, select, form, details')) group.remove();
  });
}

function setupToolbarMenus() {
  const menus = Array.from(document.querySelectorAll('.command-menu'));
  menus.forEach(menu => { menu.open = false; });
  menus.forEach(menu => {
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      closeCommandMenus(menu);
    });
    menu.querySelectorAll('.command-menu-panel button').forEach(button => {
      button.addEventListener('click', () => {
        if (button.id !== 'export-btn') menu.open = false;
      });
    });
  });
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('.command-menu')) return;
    closeCommandMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    closeCommandMenus();
  });
  window.setTimeout(() => closeCommandMenus(), 0);
  window.setTimeout(() => closeCommandMenus(), 150);
}

function closeCommandMenus(except = null) {
  document.querySelectorAll('.command-menu[open]').forEach(menu => {
    if (menu !== except) menu.open = false;
  });
}

function getDataStateLegendItems() {
  if (dataStateOverlayMode === 'review') {
    return [
      { key: 'complete', label: 'Complete', color: '#16a34a' },
      { key: 'verified', label: 'Verified', color: '#2563eb' },
      { key: 'estimated', label: 'Estimated / assumption', color: '#f59e0b' },
      { key: 'incomplete', label: 'Incomplete', color: '#ef4444' }
    ];
  }
  if (dataStateOverlayMode === 'validation') {
    return [
      { key: 'pass', label: 'Diagram validation clear', color: '#16a34a' },
      { key: 'fail', label: 'Validation issue', color: '#dc2626' }
    ];
  }
  if (dataStateOverlayMode === 'loadFlow') {
    return [
      { key: 'pass', label: 'Voltage deviation ≤ 5%', color: '#16a34a' },
      { key: 'warn', label: 'Voltage deviation 5–10%', color: '#f59e0b' },
      { key: 'fail', label: 'Voltage deviation > 10%', color: '#dc2626' },
      { key: 'none', label: 'No load-flow result', color: '#94a3b8' },
      { key: 'stale', label: 'Stale result', color: '#7c3aed' },
      { key: 'unknown', label: 'Freshness unknown', color: '#64748b' }
    ];
  }
  if (dataStateOverlayMode === 'faultDuty') {
    return [
      { key: 'pass', label: 'Available fault within rating', color: '#16a34a' },
      { key: 'warn', label: 'Rating missing or study warning', color: '#f59e0b' },
      { key: 'fail', label: 'Available fault exceeds rating', color: '#dc2626' },
      { key: 'none', label: 'No fault-duty result', color: '#94a3b8' },
      { key: 'stale', label: 'Stale result', color: '#7c3aed' },
      { key: 'unknown', label: 'Freshness unknown', color: '#64748b' }
    ];
  }
  if (dataStateOverlayMode === 'arcFlash') {
    return [
      { key: 'low', label: 'Low incident energy', color: '#16a34a' },
      { key: 'warning', label: 'Warning', color: '#f59e0b' },
      { key: 'high', label: 'High', color: '#f97316' },
      { key: 'very-high', label: 'Very high (≥ 40 cal/cm²)', color: '#dc2626' },
      { key: 'none', label: 'No result', color: '#94a3b8' },
      { key: 'stale', label: 'Stale result', color: '#7c3aed' },
      { key: 'unknown', label: 'Freshness unknown', color: '#64748b' }
    ];
  }
  if (dataStateOverlayMode === 'operating') {
    return [
      { key: 'energized', label: 'Energized', color: '#16a34a' },
      { key: 'deenergized', label: 'De-energized', color: '#64748b' },
      { key: 'open', label: 'Open switching device', color: '#f59e0b' }
    ];
  }
  return [];
}

function overlayStudyKey() {
  if (dataStateOverlayMode === 'loadFlow') return 'loadFlow';
  if (dataStateOverlayMode === 'faultDuty') return 'shortCircuit';
  if (dataStateOverlayMode === 'arcFlash') return 'arcFlash';
  return null;
}

function overlayProvenanceLabel() {
  const studyKey = overlayStudyKey();
  if (!studyKey) return '';
  const provenance = getStudyProvenance(studyKey);
  const status = provenance.status === 'none' ? 'no result' : provenance.status;
  const date = provenance.runAt ? new Date(provenance.runAt) : null;
  const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'run date unknown';
  return `Scenario ${provenance.scenario} · ${status} · ${provenance.approval} · ${dateText}`;
}

function highlightFoundComponent(componentId) {
  if (!componentId) return;
  findHighlightId = componentId;
  if (findHighlightTimer) {
    clearTimeout(findHighlightTimer);
    findHighlightTimer = null;
  }
  render();
  findHighlightTimer = window.setTimeout(() => {
    findHighlightId = null;
    findHighlightTimer = null;
    render();
  }, 3000);
}

function focusComponentElement(comp) {
  if (!comp) return;
  if (zoomToComponentNeighborhood(comp, { maxZoom: 1.25, pad: 110 })) return;
  const svg = document.getElementById('diagram');
  if (!svg) return;
  const target = svg.querySelector(`g.component[data-id="${comp.id}"]`);
  if (!target || typeof target.scrollIntoView !== 'function') return;
  try {
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  } catch {
    target.scrollIntoView();
  }
}

if (studiesToggle) {
  studiesToggle.addEventListener('click', () => {
    studiesPanel.classList.toggle('hidden');
    renderStudyResults();
  });
}
if (studiesCloseBtn) studiesCloseBtn.addEventListener('click', () => studiesPanel.classList.add('hidden'));
if (studiesResizeHandle && studiesPanel) {
  studiesResizeHandle.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    resizingStudiesPanel = true;
    studiesPanel.classList.add('is-resizing');
    studiesResizeStartX = e.clientX;
    const rect = studiesPanel.getBoundingClientRect();
    studiesResizeStartWidth = rect.width;
    studiesWidth = clampStudiesWidth(rect.width, defaultStudiesWidth);
    studiesPanel.style.setProperty('--studies-width', `${studiesWidth}px`);
    hasStoredStudiesWidth = true;
    e.preventDefault();
  });
}
function getOneLineSheetsRevision(oneLineData) {
  return JSON.stringify(Array.isArray(oneLineData?.sheets) ? oneLineData.sheets : []);
}

function assertOneLineSheetsUnchanged(expectedRevision, studyName) {
  const currentOneLineData = getOneLine();
  if (getOneLineSheetsRevision(currentOneLineData) !== expectedRevision) {
    throw new Error(`${studyName} results were discarded because the one-line diagram changed while the study was running. Please rerun the study on the current diagram.`);
  }
  return currentOneLineData;
}

function recordOneLineStudyProvenance(studies, studyKey) {
  if (!studies || typeof studies !== 'object' || !studyKey) return;
  const meta = studies[oneLineStudyMetaKey] && typeof studies[oneLineStudyMetaKey] === 'object'
    ? studies[oneLineStudyMetaKey]
    : {};
  meta[studyKey] = {
    scenario: getCurrentScenario() || 'default',
    runAt: new Date().toISOString(),
    oneLineRevision: getOneLineSheetsRevision(getOneLine())
  };
  studies[oneLineStudyMetaKey] = meta;
}

const studyExecutionController = createStudyExecutionController({
  buttons: {
    loadFlow: runLFBtn,
    shortCircuit: runSCBtn,
    arcFlash: runAFBtn,
    printArcFlashLabels: printAFLabelsBtn,
    harmonics: runHBtn,
    motorStart: runMSBtn,
    reliability: runRelBtn
  },
  getOneLine,
  setOneLine,
  getStudies,
  setStudies,
  getStudySettings: () => studySettings,
  getActiveSheet: () => activeSheet,
  getProtectiveDeviceCatalog: () => protectiveDeviceCatalog,
  loadReferencedProtectiveDevices,
  runLoadFlow: runLoadFlowOffMain,
  runShortCircuitOffMain,
  runShortCircuit,
  runArcFlash,
  runHarmonics,
  runNetworkHarmonics,
  runMotorStart,
  runReliability: runReliabilityOffMain,
  assertSheetsUnchanged: assertOneLineSheetsUnchanged,
  getSheetsRevision: getOneLineSheetsRevision,
  recordProvenance: recordOneLineStudyProvenance,
  updateCableOperatingVoltages,
  markScheduleReconcilePending,
  renderStudyResults,
  renderLoadFlowResults,
  render,
  generateArcFlashReport,
  openLabelPrintWindow,
  highlightSPF,
  showAlertModal,
  windowRef: window
});

studyExecutionController.bind();

async function runLoadFlowFromButton() {
  return studyExecutionController.runLoadFlowStudy();
}
function renderLoadFlowResults(res) {
  if (!loadFlowResultsEl) return;
  loadFlowResultsEl.innerHTML = renderLoadFlowResultsHtml(res);
  updateStudyResultsCopyState();
}

export { renderLoadFlowResults };

function formatTapReviewNumber(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatTapReviewPu(value) {
  return Number.isFinite(Number(value)) ? `${formatTapReviewNumber(value, 4)} pu` : '—';
}

function formatTapReviewPercent(value) {
  return Number.isFinite(Number(value)) ? `${formatTapReviewNumber(value, 3)}%` : '—';
}

function appendTapReviewCell(row, text, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

function renderTransformerTapReview(review = transformerTapReview) {
  if (!transformerTapReviewEl) return;
  transformerTapReviewEl.innerHTML = '';
  if (!review) {
    transformerTapReviewEl.classList.add('hidden');
    return;
  }
  transformerTapReviewEl.classList.remove('hidden');

  const heading = document.createElement('h3');
  heading.textContent = 'Transformer tap review';
  const intro = document.createElement('p');
  intro.textContent = 'What-if load-flow cases are evaluated only at the configured LTC steps and range. No transformer setting changes until you approve a recommendation.';
  transformerTapReviewEl.append(heading, intro);

  const generated = document.createElement('p');
  generated.className = 'tap-review-meta';
  const voltageLimitLabel = review.voltageLimits?.source === 'workflow_override'
    ? 'workflow voltage limits'
    : 'default limits when transformer limits are unset';
  generated.textContent = `Evaluated ${review.transformers?.length || 0} transformer${review.transformers?.length === 1 ? '' : 's'} · ${review.balanced ? 'balanced' : 'A/B/C'} load flow · ${voltageLimitLabel} ${formatTapReviewPu(review.voltageLimits?.minPu)} to ${formatTapReviewPu(review.voltageLimits?.maxPu)}`;
  transformerTapReviewEl.appendChild(generated);

  if (!Array.isArray(review.transformers) || !review.transformers.length) {
    const empty = document.createElement('p');
    empty.className = 'tap-review-empty';
    empty.textContent = 'No transformer components were found in the active One-Line.';
    transformerTapReviewEl.appendChild(empty);
    return;
  }

  review.transformers.forEach(record => {
    const card = document.createElement('article');
    card.className = `tap-review-card${record.eligible ? '' : ' tap-review-card-warning'}`;
    card.dataset.transformerId = record.transformerId || '';
    const title = document.createElement('h4');
    title.textContent = record.label || record.transformerId || 'Transformer';
    card.appendChild(title);

    if (!record.eligible) {
      const reason = document.createElement('p');
      reason.className = 'tap-review-warning';
      reason.textContent = `${record.reasonText || 'Tap constraints are incomplete.'} Add or verify LTC enabled state, range, and step in transformer properties.`;
      card.appendChild(reason);
      transformerTapReviewEl.appendChild(card);
      return;
    }

    const details = document.createElement('p');
    const rangeText = Number.isFinite(record.minTapVolts) && Number.isFinite(record.maxTapVolts)
      ? `${formatTapReviewNumber(record.minTapVolts, 1)}–${formatTapReviewNumber(record.maxTapVolts, 1)} V`
      : `${formatTapReviewPercent((record.minRatio - 1) * 100)} to ${formatTapReviewPercent((record.maxRatio - 1) * 100)}`;
    details.className = 'tap-review-meta';
    details.textContent = `Permitted range ${rangeText} · step ${formatTapReviewPercent(record.stepPercent)} · setpoint ${formatTapReviewPu(record.setpointPu)} · voltage limits ${formatTapReviewPu(record.minVoltagePu)} to ${formatTapReviewPu(record.maxVoltagePu)} · controlled bus ${record.controlledBusId || 'secondary bus'}`;
    card.appendChild(details);

    const recommendation = document.createElement('p');
    recommendation.className = record.recommendedTapRatio !== null ? 'tap-review-recommendation' : 'tap-review-warning';
    recommendation.textContent = record.recommendedTapRatio !== null
      ? record.recommendedTapRatio === record.currentTapRatio
        ? `Recommendation: keep the current ${formatTapReviewPercent((record.currentTapRatio - 1) * 100)} tap. ${record.recommendationReason || ''}`
        : `Recommendation: ${formatTapReviewPercent((record.recommendedTapRatio - 1) * 100)} tap (${formatTapReviewPu(record.recommendedTapRatio)} ratio). ${record.recommendationReason || ''}`
      : record.recommendationReason || 'No feasible permitted tap step was found.';
    card.appendChild(recommendation);

    const table = document.createElement('table');
    table.className = 'tap-review-table';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Tap', 'Controlled bus', 'Δ vs current', 'System range', 'Result', 'Action'].forEach(label => appendTapReviewCell(headRow, label, 'tap-review-heading'));
    head.appendChild(headRow);
    table.appendChild(head);
    const body = document.createElement('tbody');
    (record.cases || []).forEach(candidate => {
      const row = document.createElement('tr');
      if (candidate.isCurrent) row.classList.add('is-current');
      if (candidate.tapRatio === record.recommendedTapRatio) row.classList.add('is-recommended');
      appendTapReviewCell(row, `${formatTapReviewPercent(candidate.tapPercent)} (${formatTapReviewPu(candidate.tapRatio)})`);
      appendTapReviewCell(row, `${formatTapReviewPu(candidate.targetVoltagePu)}${candidate.targetVoltagePu !== null ? ` · ${formatTapReviewPercent(candidate.deltaVoltagePct)}` : ''}`);
      appendTapReviewCell(row, candidate.isCurrent ? 'Current' : formatTapReviewPu(candidate.deltaVoltagePu));
      appendTapReviewCell(row, `${formatTapReviewPu(candidate.systemMinPu)}–${formatTapReviewPu(candidate.systemMaxPu)}`);
      const resultCell = appendTapReviewCell(row, candidate.isCurrent
        ? 'Current case'
        : candidate.feasible
          ? 'Permitted · feasible'
          : candidate.converged
            ? `Rejected · ${candidate.violations} limit violation${candidate.violations === 1 ? '' : 's'}`
            : 'Rejected · no convergence');
      if (candidate.feasible) resultCell.classList.add('tap-review-pass');
      else if (!candidate.isCurrent) resultCell.classList.add('tap-review-fail');
      const actionCell = document.createElement('td');
      if (candidate.tapRatio === record.recommendedTapRatio && candidate.feasible && !candidate.isCurrent) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm primary-btn';
        button.textContent = record.appliedTapRatio === candidate.tapRatio ? 'Applied' : 'Approve & Apply';
        button.disabled = record.appliedTapRatio === candidate.tapRatio;
        button.dataset.testid = 'tap-approve-apply';
        button.dataset.tapApply = '1';
        button.dataset.transformerId = record.transformerId;
        button.dataset.tapRatio = String(candidate.tapRatio);
        actionCell.appendChild(button);
      } else if (candidate.isCurrent) {
        actionCell.textContent = 'No change';
      } else {
        actionCell.textContent = 'Review only';
      }
      row.appendChild(actionCell);
      body.appendChild(row);
    });
    table.appendChild(body);
    card.appendChild(table);
    transformerTapReviewEl.appendChild(card);
  });
}

function refreshLocalOneLineAfterStudyApply() {
  const currentOneLineData = getOneLine();
  sheets = (Array.isArray(currentOneLineData.sheets) ? currentOneLineData.sheets : []).map((sheet, index) => ({
    ...sheet,
    name: sheet.name || `Sheet ${index + 1}`,
    components: (Array.isArray(sheet.components) ? sheet.components : []).map(normalizeComponent),
    connections: Array.isArray(sheet.connections) ? sheet.connections : []
  }));
  if (!sheets.length) sheets = [{ name: 'Sheet 1', components: [], connections: [] }];
  activeSheet = Math.min(Math.max(Number(currentOneLineData.activeSheet) || 0, 0), sheets.length - 1);
  components = sheets[activeSheet].components;
  connections = sheets[activeSheet].connections;
  renderSheetTabs();
  render();
}

async function applyTransformerTapRecommendation(transformerId, tapRatio) {
  const review = transformerTapReview;
  const record = review?.transformers?.find(item => item.transformerId === transformerId);
  const candidate = record?.cases?.find(item => Math.abs(Number(item.tapRatio) - Number(tapRatio)) <= 1e-8);
  if (!record || !candidate || !candidate.feasible || record.recommendedTapRatio === null || Math.abs(record.recommendedTapRatio - candidate.tapRatio) > 1e-8) {
    showToast('Tap recommendation is no longer available. Run the review again.');
    return;
  }
  const oneLineData = getOneLine();
  if (review.sourceOneLineRevision !== getOneLineSheetsRevision(oneLineData)) {
    showAlertModal('Tap Review Stale', 'The One-Line changed after this review. Rerun Transformer Tap Review before approving a setting.');
    return;
  }
  const approved = await confirmDialog(
    'Approve transformer tap change',
    `Apply ${formatTapReviewPercent(candidate.tapPercent)} (${formatTapReviewPu(candidate.tapRatio)}) to ${record.label}? This changes the One-Line transformer setting and creates a revision-history entry.`,
    { primaryText: 'Approve & Apply' }
  );
  if (!approved) return;
  const currentOneLineData = assertOneLineSheetsUnchanged(review.sourceOneLineRevision, 'Transformer tap review');
  const updatedOneLine = applyTapRatioToOneLine(currentOneLineData, transformerId, candidate.tapRatio);
  if (!updatedOneLine) {
    showAlertModal('Tap Apply Error', 'The transformer could not be found in the current One-Line.');
    return;
  }
  setOneLine(updatedOneLine);
  const savedStudies = getStudies();
  const savedReview = savedStudies.transformerTapOptimization || review;
  const savedRecord = savedReview.transformers?.find(item => item.transformerId === transformerId);
  if (savedRecord) {
    savedRecord.appliedTapRatio = candidate.tapRatio;
    savedRecord.appliedAt = new Date().toISOString();
    savedRecord.appliedOneLineRevision = getOneLineSheetsRevision(getOneLine());
  }
  savedReview.status = 'applied';
  savedStudies.transformerTapOptimization = savedReview;
  recordOneLineStudyProvenance(savedStudies, 'transformerTapOptimization');
  setStudies(savedStudies);
  transformerTapReview = savedReview;
  refreshLocalOneLineAfterStudyApply();
  renderTransformerTapReview(savedReview);
  showToast(`Transformer tap applied for ${record.label}; One-Line revision recorded.`);
}

async function runTransformerTapOptimizationFromButton() {
  if (!runTapOptimizationBtn) return;
  const oneLineData = getOneLine();
  const oneLineRevision = getOneLineSheetsRevision(oneLineData);
  runTapOptimizationBtn.disabled = true;
  runTapOptimizationBtn.textContent = 'Reviewing…';
  try {
    const result = await evaluateTransformerTapOptimization(oneLineData, {
      baseMVA: studySettings.loadFlow.baseMVA,
      balanced: studySettings.loadFlow.balanced,
      maxIterations: studySettings.loadFlow.maxIterations,
      runStudy: (snapshot, options) => runLoadFlowOffMain(snapshot, options)
    });
    assertOneLineSheetsUnchanged(oneLineRevision, 'Transformer tap review');
    const studies = getStudies();
    result.sourceOneLineRevision = oneLineRevision;
    result.scenario = getCurrentScenario() || 'default';
    result.status = 'review';
    studies.transformerTapOptimization = result;
    recordOneLineStudyProvenance(studies, 'transformerTapOptimization');
    setStudies(studies);
    transformerTapReview = result;
    renderStudyResults();
    renderTransformerTapReview(result);
  } finally {
    runTapOptimizationBtn.disabled = false;
    runTapOptimizationBtn.textContent = 'Review Transformer Taps';
  }
}

if (runTapOptimizationBtn) {
  runTapOptimizationBtn.addEventListener('click', () => {
    runTransformerTapOptimizationFromButton().catch(error => {
      console.error('[oneline] transformer tap review failed', error);
      showAlertModal('Transformer Tap Review Error', error?.message || String(error));
    });
  });
}
if (transformerTapReviewEl) {
  transformerTapReviewEl.addEventListener('click', event => {
    const button = event.target.closest('[data-tap-apply="1"]');
    if (!button) return;
    applyTransformerTapRecommendation(button.dataset.transformerId, Number(button.dataset.tapRatio)).catch(error => {
      console.error('[oneline] transformer tap apply failed', error);
      showAlertModal('Tap Apply Error', error?.message || String(error));
    });
  });
  if (transformerTapReview) renderTransformerTapReview(transformerTapReview);
}
async function runShortCircuitFromButton() {
  return studyExecutionController.runShortCircuitStudy();
}

if (afLabelModeToggle) afLabelModeToggle.addEventListener('change', () => {
  arcFlashLabelMode = afLabelModeToggle.checked;
  render();
});

async function runReliabilityFromButton() {
  return studyExecutionController.runReliabilityStudy();
}
// Guided tour steps
const tourSteps = [
  { element: '#component-buttons', text: 'Add components from the palette.' },
  { element: '#connect-btn', text: 'Connect components using this button then selecting two components.' },
  { element: '#diagram', text: 'Select a component to edit its properties.' },
  { element: '#export-btn', text: 'Use Export to download your diagram.' }
];
let tourIndex = 0;
let tourOverlay = null;
let tourModal = null;
let tourResizeHandler = null;
let tourKeyHandler = null;

function positionTourModal(target) {
  if (!tourModal) return;
  if (target) {
    const rect = target.getBoundingClientRect();
    const modalWidth = tourModal.offsetWidth;
    const modalHeight = tourModal.offsetHeight;
    let top = rect.bottom + 12;
    if (top + modalHeight > window.innerHeight - 16) {
      top = Math.max(16, rect.top - modalHeight - 12);
    }
    const maxLeft = Math.max(16, window.innerWidth - modalWidth - 16);
    const left = Math.min(Math.max(16, rect.left), maxLeft);
    tourModal.style.top = `${top}px`;
    tourModal.style.left = `${left}px`;
    tourModal.style.transform = 'none';
    tourModal.classList.add('anchored');
  } else {
    tourModal.style.top = '50%';
    tourModal.style.left = '50%';
    tourModal.style.transform = 'translate(-50%, -50%)';
    tourModal.classList.remove('anchored');
  }
}

function showTourStep() {
  if (!tourModal) return;
  const step = tourSteps[tourIndex];
  const textEl = tourModal.querySelector('#tour-text');
  if (textEl) textEl.textContent = step.text;
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  const target = step.element ? document.querySelector(step.element) : null;
  if (target) target.classList.add('tour-highlight');
  const next = tourModal.querySelector('#tour-next');
  if (next) next.textContent = tourIndex === tourSteps.length - 1 ? 'Finish' : 'Next';
  positionTourModal(target);
}

function endTour() {
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  if (tourResizeHandler) {
    window.removeEventListener('resize', tourResizeHandler);
    tourResizeHandler = null;
  }
  if (tourKeyHandler) {
    document.removeEventListener('keydown', tourKeyHandler, true);
    tourKeyHandler = null;
  }
  tourOverlay?.remove();
  tourModal?.remove();
  tourOverlay = null;
  tourModal = null;
}

function startTour() {
  tourIndex = 0;
  tourOverlay = document.createElement('div');
  tourOverlay.className = 'tour-overlay';
  tourModal = document.createElement('div');
  tourModal.className = 'tour-modal';
  tourModal.setAttribute('tabindex', '-1');
  tourModal.innerHTML = `
    <div class="tour-content">
      <p id="tour-text"></p>
      <div class="tour-actions">
        <button type="button" id="tour-skip">Skip</button>
        <button type="button" id="tour-next">Next</button>
      </div>
    </div>`;
  document.body.appendChild(tourOverlay);
  document.body.appendChild(tourModal);
  const advance = () => {
    tourIndex++;
    if (tourIndex >= tourSteps.length) {
      endTour();
    } else {
      showTourStep();
    }
  };
  tourModal.querySelector('#tour-next').addEventListener('click', advance);
  tourModal.querySelector('#tour-skip').addEventListener('click', () => endTour());
  tourOverlay.addEventListener('click', advance);
  tourKeyHandler = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      endTour();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!tourModal) return;
      if (tourModal.contains(document.activeElement)) {
        e.preventDefault();
        advance();
      }
    }
  };
  document.addEventListener('keydown', tourKeyHandler, true);
  tourResizeHandler = () => showTourStep();
  window.addEventListener('resize', tourResizeHandler);
  showTourStep();
  try {
    tourModal.focus();
  } catch { /* element may have been detached between render and focus; tour still works without focus ring */ }
}

// Prefix settings and counters for component labels
let labelPrefixes = getItem('labelPrefixes', {});
let labelCounters = getItem('labelCounters', {});

function getPrefix(subtype) {
  return labelPrefixes[subtype] || (subtype.slice(0, 3).toUpperCase() + '-');
}

function nextLabel(subtype) {
  const count = (labelCounters[subtype] || 0) + 1;
  labelCounters[subtype] = count;
  setItem('labelCounters', labelCounters);
  return getPrefix(subtype) + count;
}

function applyNextLabel(comp) {
  if (!comp || !comp.subtype) return;
  comp.label = nextLabel(comp.subtype);
}

function editPrefixes() {
  const subtypeSet = new Set([...Object.keys(componentMeta), ...Object.keys(labelPrefixes)]);
  const subtypes = [...subtypeSet].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  if (!subtypes.length) {
    showToast('No component prefixes available to edit');
    return;
  }

  let modal = document.getElementById('prefix-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'prefix-modal';
    modal.className = 'prop-modal';
    document.body.appendChild(modal);
  }
  if (modal._outsideHandler) modal.removeEventListener('click', modal._outsideHandler);
  if (modal._keyHandler) document.removeEventListener('keydown', modal._keyHandler);
  modal.innerHTML = '';

  const form = document.createElement('form');
  form.id = 'prefix-form';

  const closeModal = () => {
    modal.classList.remove('show');
    modal.removeEventListener('click', outsideHandler);
    document.removeEventListener('keydown', keyHandler);
    delete modal._outsideHandler;
    delete modal._keyHandler;
  };

  const outsideHandler = e => { if (e.target === modal) closeModal(); };
  const keyHandler = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };

  function renderCategoryButtons() {
    categoryListEl.innerHTML = '';
    categoryButtonMap.clear();
    categoryOrder.forEach(categoryKey => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prop-category-option';
      button.textContent = getCategoryLabel(categoryKey);
      button.dataset.category = categoryKey;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (activeCategory === categoryKey) return;
        activeCategory = categoryKey;
        const nextDevice = categoryEntries.get(activeCategory)?.[0] || null;
        renderDeviceButtons();
        updateCategoryStates();
        if (nextDevice) {
          setActiveComponent(nextDevice);
        } else {
          selected = null;
          selection = [];
          selectedConnection = null;
          renderPropertiesFor(null);
          updateButtonStates();
        }
      });
      categoryButtonMap.set(categoryKey, button);
      categoryListEl.appendChild(button);
    });
  }

  function renderDeviceButtons() {
    componentListEl.innerHTML = '';
    buttonMap.clear();
    const devices = categoryEntries.get(activeCategory) || [];
    const headingLabel = activeCategory ? `Device Tags – ${getCategoryLabel(activeCategory)}` : 'Device Tags';
    componentHeading.textContent = headingLabel;
    devices.forEach(device => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prop-component-option';
      button.dataset.componentId = device.id;
      button.textContent = getComponentListLabel(device);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => setActiveComponent(device));
      button.addEventListener('keydown', event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const list = categoryEntries.get(activeCategory) || [];
        const currentIndex = list.findIndex(item => item.id === device.id);
        if (currentIndex === -1) return;
        const offset = event.key === 'ArrowUp' ? -1 : 1;
        let nextIndex = currentIndex + offset;
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= list.length) nextIndex = list.length - 1;
        const nextDevice = list[nextIndex];
        if (!nextDevice) return;
        setActiveComponent(nextDevice);
        const nextButton = buttonMap.get(nextDevice.id);
        nextButton?.focus();
      });
      buttonMap.set(device.id, button);
      componentListEl.appendChild(button);
    });
  }

  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('h3');
  title.textContent = 'Label Prefixes';
  header.appendChild(title);
  form.appendChild(header);

  const helpText = document.createElement('p');
  helpText.textContent = 'Update the prefix used for auto-generated labels by subtype.';
  form.appendChild(helpText);

  const table = document.createElement('table');
  table.className = 'prefix-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const subtypeHeader = document.createElement('th');
  subtypeHeader.scope = 'col';
  subtypeHeader.textContent = 'Subtype';
  headRow.appendChild(subtypeHeader);
  const prefixHeader = document.createElement('th');
  prefixHeader.scope = 'col';
  prefixHeader.textContent = 'Prefix';
  headRow.appendChild(prefixHeader);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  subtypes.forEach(sub => {
    const row = document.createElement('tr');
    const labelCell = document.createElement('th');
    labelCell.scope = 'row';
    labelCell.textContent = sub;
    row.appendChild(labelCell);
    const inputCell = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = labelPrefixes[sub] ?? getPrefix(sub);
    input.dataset.subtype = sub;
    input.setAttribute('aria-label', `Label prefix for ${sub}`);
    inputCell.appendChild(input);
    row.appendChild(inputCell);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  form.appendChild(table);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn secondary-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => closeModal());
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn primary-btn';
  saveBtn.textContent = 'Save';
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const updated = {};
    form.querySelectorAll('input[data-subtype]').forEach(input => {
      const subtype = input.dataset.subtype;
      if (!subtype) return;
      const value = input.value;
      if (value !== null && value !== undefined && value !== '') {
        updated[subtype] = value;
      }
    });
    labelPrefixes = updated;
    setItem('labelPrefixes', labelPrefixes);
    closeModal();
  });

  modal.appendChild(form);
  modal.classList.add('show');
  modal._outsideHandler = outsideHandler;
  modal._keyHandler = keyHandler;
  modal.addEventListener('click', outsideHandler);
  document.addEventListener('keydown', keyHandler);
  const firstInput = form.querySelector('input');
  if (firstInput) firstInput.focus();
}

function editManufacturerDefaults() {
  const modal = document.getElementById('defaults-modal');
  modal.innerHTML = '';
  const form = document.createElement('form');

  const subtypeLabel = document.createElement('label');
  subtypeLabel.textContent = 'Subtype ';
  const subtypeSelect = document.createElement('select');
  Object.keys(componentMeta).forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub;
    opt.textContent = sub;
    subtypeSelect.appendChild(opt);
  });
  subtypeLabel.appendChild(subtypeSelect);
  form.appendChild(subtypeLabel);

  const fields = ['manufacturer', 'model', 'voltage', 'ratings'];
  const inputs = {};
  fields.forEach(f => {
    const lbl = document.createElement('label');
    lbl.textContent = f.charAt(0).toUpperCase() + f.slice(1) + ' ';
    const input = document.createElement('input');
    input.type = f === 'voltage' ? 'number' : 'text';
    lbl.appendChild(input);
    form.appendChild(lbl);
    inputs[f] = input;
  });

  function loadValues() {
    const defs = manufacturerDefaults[subtypeSelect.value] || {};
    fields.forEach(f => {
      inputs[f].value = defs[f] || '';
    });
  }
  subtypeSelect.addEventListener('change', loadValues);
  loadValues();

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save';
  form.appendChild(saveBtn);
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => modal.classList.remove('show'));
  form.appendChild(cancelBtn);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const sub = subtypeSelect.value;
    manufacturerDefaults[sub] = {};
    fields.forEach(f => {
      manufacturerDefaults[sub][f] = inputs[f].value;
    });
    setItem('manufacturerDefaults', manufacturerDefaults);
    modal.classList.remove('show');
    showToast('Defaults updated');
  });

  modal.appendChild(form);
  return modal;
}

// --- Tooltip module ---
const tooltip = document.createElement('div');
tooltip.id = 'component-tooltip';
tooltip.style.display = 'none';
document.body.appendChild(tooltip);

function positionTooltip(e) {
  tooltip.style.left = e.pageX + 10 + 'px';
  tooltip.style.top = e.pageY + 10 + 'px';
}

function showTooltip(e) {
  const text = e.currentTarget.dataset.tooltip;
  if (!text) return;
  tooltip.textContent = text;
  positionTooltip(e);
  tooltip.style.display = 'block';
}

function moveTooltip(e) {
  if (tooltip.style.display === 'block') positionTooltip(e);
}

function hideTooltip() {
  tooltip.style.display = 'none';
}


function formatHistoryTimestamp(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function recordHistoryEvent(type, description, extra = {}) {
  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    description,
    timestamp: Date.now(),
    historyIndex: historyController.index,
    ...extra
  };
  historyEvents.push(event);
  if (historyEvents.length > MAX_HISTORY_EVENTS) {
    historyEvents = historyEvents.slice(historyEvents.length - MAX_HISTORY_EVENTS);
  }
  renderHistorySidebar();
}

function pruneCheckpoints() {
  checkpoints = checkpoints.filter(point => (
    point
    && Number.isInteger(point.historyIndex)
    && point.historyIndex >= 0
    && point.historyIndex < historyController.length
  ));
}

function renderHistorySidebar() {
  const eventsList = document.getElementById('history-events');
  const checkpointList = document.getElementById('checkpoint-list');
  if (!eventsList || !checkpointList) return;

  eventsList.innerHTML = '';
  const eventItems = [...historyEvents].sort((a, b) => b.timestamp - a.timestamp);
  if (!eventItems.length) {
    const empty = document.createElement('li');
    empty.className = 'history-item';
    empty.textContent = 'No events yet.';
    eventsList.appendChild(empty);
  } else {
    eventItems.forEach(event => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const title = document.createElement('p');
      title.className = 'history-item-title';
      title.textContent = event.description;
      const time = document.createElement('p');
      time.className = 'history-item-time';
      time.textContent = `${formatHistoryTimestamp(event.timestamp)} • step ${event.historyIndex + 1}`;
      li.append(title, time);
      eventsList.appendChild(li);
    });
  }

  checkpointList.innerHTML = '';
  pruneCheckpoints();
  if (!checkpoints.length) {
    const empty = document.createElement('li');
    empty.className = 'history-item';
    empty.textContent = 'No checkpoints yet.';
    checkpointList.appendChild(empty);
  } else {
    const sorted = [...checkpoints].sort((a, b) => b.createdAt - a.createdAt);
    sorted.forEach(point => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const title = document.createElement('p');
      title.className = 'history-item-title';
      title.textContent = point.name;
      const time = document.createElement('p');
      time.className = 'history-item-time';
      time.textContent = `${formatHistoryTimestamp(point.createdAt)} • step ${point.historyIndex + 1}`;
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'btn';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', () => jumpToCheckpoint(point.id));
      li.append(title, time, restoreBtn);
      checkpointList.appendChild(li);
    });
  }
}

function setRightRailTab(tab) {
  const allowed = new Set(['properties', 'validation', 'history']);
  rightRailActiveTab = allowed.has(tab) ? tab : 'properties';
  document.querySelectorAll('[data-right-rail-tab]').forEach(button => {
    const active = button.dataset.rightRailTab === rightRailActiveTab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-right-rail-panel]').forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.rightRailPanel !== rightRailActiveTab);
  });
}

function getConnectionCount() {
  return components.reduce((sum, comp) => sum + (Array.isArray(comp.connections) ? comp.connections.length : 0), 0);
}

function computeOneLineReadiness() {
  const drawable = components.filter(comp => comp.type !== 'dimension' && comp.type !== 'annotation');
  const connectionCount = getConnectionCount();
  const unconnected = drawable.filter(comp => {
    if (comp.type === 'sheet_link') return false;
    return !(comp.connections || []).length && !components.some(other => (other.connections || []).some(conn => conn.target === comp.id));
  });
  const missingLinks = drawable.filter(comp => {
    const key = scheduleKeyForComponent(comp);
    return key && !hasResolvedScheduleLink(comp);
  });
  const provisionalConnections = [];
  components.forEach(source => {
    (source.connections || []).forEach(conn => {
      if (conn.cable?.provisional || !conn.cable?.tag) provisionalConnections.push({ source, conn });
    });
  });
  const checks = [
    { label: 'Source present', ok: components.some(isSourceComponent) },
    { label: 'Devices placed', ok: drawable.length > 0 },
    { label: 'Connections drawn', ok: connectionCount > 0 },
    { label: 'All devices connected', ok: unconnected.length === 0, count: unconnected.length },
    { label: 'Schedule links complete', ok: missingLinks.length === 0, count: missingLinks.length },
    { label: 'Cable details reviewed', ok: provisionalConnections.length === 0, count: provisionalConnections.length },
    { label: 'Diagram validation clear', ok: validationIssues.length === 0, count: validationIssues.length }
  ];
  const passed = checks.filter(check => check.ok).length;
  return {
    checks,
    score: Math.round((passed / checks.length) * 100),
    unconnected,
    missingLinks,
    provisionalConnections
  };
}

function appendReadinessPanel(root) {
  const readiness = computeOneLineReadiness();
  const panel = document.createElement('section');
  panel.className = 'right-rail-card readiness-card';
  const header = document.createElement('div');
  header.className = 'readiness-header';
  const title = document.createElement('h4');
  title.textContent = readiness.score === 100
    ? READINESS_VOCABULARY.ready
    : READINESS_VOCABULARY.missingInputs;
  const score = document.createElement('strong');
  score.textContent = `${readiness.score}%`;
  header.append(title, score);
  const summary = document.createElement('p');
  summary.className = 'field-hint';
  summary.textContent = readiness.score === 100
    ? (ONE_LINE_READINESS_COPY?.messages.ready || `${READINESS_VOCABULARY.ready}: one-line handoff is complete.`)
    : (ONE_LINE_READINESS_COPY?.messages.missingInputs || `${READINESS_VOCABULARY.missingInputs}: complete diagram links and validation before handoff.`);
  const list = document.createElement('ul');
  list.className = 'readiness-list';
  readiness.checks.forEach(check => {
    const item = document.createElement('li');
    item.className = check.ok ? 'is-ok' : 'needs-review';
    const text = document.createElement('span');
    text.textContent = check.count ? `${check.label} (${check.count})` : check.label;
    item.appendChild(text);
    list.appendChild(item);
  });
  const actions = document.createElement('div');
  actions.className = 'right-rail-actions';
  const validateBtn = document.createElement('button');
  validateBtn.type = 'button';
  validateBtn.className = 'btn';
  validateBtn.textContent = 'Validate';
  validateBtn.addEventListener('click', () => {
    setRightRailTab('validation');
    validateDiagram({ revealPanel: false });
  });
  const buildBtn = document.createElement('button');
  buildBtn.type = 'button';
  buildBtn.className = 'btn';
  buildBtn.textContent = 'Auto-Build';
  buildBtn.addEventListener('click', openAutoBuildModal);
  actions.append(validateBtn, buildBtn);
  panel.append(header, summary, list, actions);
  root.appendChild(panel);
}

function createHandoffLink(label, href) {
  const link = document.createElement('a');
  link.className = 'right-rail-link';
  link.href = href;
  link.textContent = label;
  return link;
}

function appendHandoffLinks(root, comp) {
  if (!comp) return;
  const tag = encodeURIComponent(getComponentTag(comp) || comp.ref || comp.id || '');
  const section = document.createElement('section');
  section.className = 'right-rail-card';
  const heading = document.createElement('h4');
  heading.textContent = 'Handoff';
  const links = document.createElement('div');
  links.className = 'right-rail-link-grid';
  links.append(
    createHandoffLink('Equipment', `equipmentlist.html?tag=${tag}`),
    createHandoffLink('Loads', `loadlist.html?tag=${tag}`),
    createHandoffLink('Cables', `cableschedule.html?tag=${tag}`),
    createHandoffLink('Raceways', `racewayschedule.html?tag=${tag}`),
    createHandoffLink('Routing', `optimalRoute.html?tag=${tag}`)
  );
  if (isProtectionComponent(comp)) {
    links.appendChild(createHandoffLink('TCC Curve', `tcc.html?component=${encodeURIComponent(comp.id)}`));
  }
  section.append(heading, links);
  root.appendChild(section);
}

function appendConnectionInspector(root, context) {
  const { source, target, conn } = context;
  const section = document.createElement('section');
  section.className = 'right-rail-card connection-inspector';
  const heading = document.createElement('h4');
  heading.textContent = 'Connection';
  const summary = document.createElement('p');
  summary.className = 'right-rail-muted';
  summary.textContent = `${getComponentTag(source) || source.id} -> ${getComponentTag(target) || target?.id || conn.target}`;
  const form = document.createElement('form');
  form.className = 'connection-inspector-form';
  const fields = [
    ['tag', 'Cable tag', connectionTag(source, target, conn)],
    ['cable_type', 'Type', conn.cable?.cable_type || ''],
    ['phases', 'Phases', formatCablePhases(conn.phases || conn.cable || source)],
    ['conductors', 'Conductors', conn.conductors || conn.cable?.conductors || '']
  ];
  fields.forEach(([name, labelText, value]) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.name = name;
    input.value = value || '';
    label.appendChild(input);
    form.appendChild(label);
  });
  const actions = document.createElement('div');
  actions.className = 'right-rail-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save Cable';
  const chooseBtn = document.createElement('button');
  chooseBtn.type = 'button';
  chooseBtn.className = 'btn';
  chooseBtn.textContent = 'Open Cable Modal';
  chooseBtn.addEventListener('click', async () => {
    if (!target) return;
    const result = await chooseCable(source, target, conn);
    if (result && applyCableResultToConnection(conn, result)) {
      pushHistory();
      render();
      save();
      markScheduleReconcilePending();
    }
  });
  actions.append(saveBtn, chooseBtn);
  form.appendChild(actions);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const fields = {
      tag: data.get('tag') || '',
      cable_type: data.get('cable_type') || '',
      phases: data.get('phases') || '',
      conductors: data.get('conductors') || ''
    };
    conn.phases = normalizeCablePhases(fields.phases);
    conn.conductors = fields.conductors;
    upsertCableScheduleRecordForConnection(source, target, conn, fields);
    pushHistory();
    render();
    save();
    markScheduleReconcilePending();
    showToast('Connection cable details saved');
  });
  const handoff = document.createElement('div');
  handoff.className = 'right-rail-link-grid';
  const tag = encodeURIComponent(connectionTag(source, target, conn));
  handoff.append(
    createHandoffLink('Cable Schedule', `cableschedule.html?tag=${tag}`),
    createHandoffLink('Raceway Schedule', `racewayschedule.html?tag=${tag}`),
    createHandoffLink('Routing', `optimalRoute.html?tag=${tag}`)
  );
  section.append(heading, summary, form, handoff);
  root.appendChild(section);
}

function appendOperatingStatePanel(root, comp) {
  if (!root || !comp) return;
  const section = document.createElement('section');
  section.className = 'right-rail-card operating-state-card';
  const heading = document.createElement('h4');
  heading.textContent = 'Operating State';
  const status = getComponentOperatingStatus(comp);
  const override = getOperatingStateOverride(comp);
  const summary = document.createElement('p');
  summary.className = 'right-rail-muted operating-state-summary';
  summary.textContent = `${operatingStateLabels[activeOperatingState]}: ${status === 'open' ? 'Open' : 'Closed'}${override ? ' override' : ' from base state'}`;
  const actions = document.createElement('div');
  actions.className = 'operating-state-buttons';
  [
    { value: 'closed', label: 'Closed' },
    { value: 'open', label: 'Open' },
    { value: 'normal', label: 'Use Base' }
  ].forEach(option => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'operating-state-btn';
    btn.textContent = option.label;
    const active = option.value === 'normal' ? !override : override?.state === option.value;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', () => setComponentOperatingStatus(comp, option.value));
    actions.appendChild(btn);
  });
  const note = document.createElement('p');
  note.className = 'right-rail-muted operating-state-note';
  note.textContent = 'Open devices stop energized-state tracing for the selected operating profile.';
  section.append(heading, summary, actions, note);
  root.appendChild(section);
}

function renderRightRailProperties() {
  const root = document.getElementById('right-rail-properties');
  if (!root) return;
  root.innerHTML = '';
  appendReadinessPanel(root);
  const connectionContext = selectedConnectionContext();
  if (connectionContext) {
    appendConnectionInspector(root, connectionContext);
    return;
  }
  const selectedComp = selected && components.includes(selected)
    ? selected
    : selection.length === 1 && components.includes(selection[0])
      ? selection[0]
      : null;
  if (!selectedComp) {
    const empty = document.createElement('div');
    empty.className = 'right-rail-empty';
    const heading = document.createElement('h4');
    const hasDiagram = components.length > 0;
    heading.textContent = hasDiagram ? 'Diagram Overview' : 'Start Drawing';
    const copy = document.createElement('p');
    copy.textContent = hasDiagram
      ? `${components.length} component(s) and ${getConnectionCount()} connection(s) are shown. Select a component or feeder to inspect its linked project data.`
      : 'Select a component to inspect it, or load the sample to see a complete source-to-load one-line.';
    const actions = document.createElement('div');
    actions.className = 'right-rail-actions';
    const autoBuildBtn = document.createElement('button');
    autoBuildBtn.type = 'button';
    autoBuildBtn.className = 'btn';
    autoBuildBtn.textContent = 'Auto-Build';
    autoBuildBtn.addEventListener('click', openAutoBuildModal);
    const connectBtn = document.createElement('button');
    connectBtn.type = 'button';
    connectBtn.className = 'btn';
    connectBtn.textContent = 'Connect';
    connectBtn.addEventListener('click', () => {
      connectMode = true;
      connectSource = null;
      document.getElementById('connect-btn')?.classList.add('active');
      updateStatusBar();
      showToast('Connect mode: click a device, then click the next device.');
    });
    if (hasDiagram) {
      const fitBtn = document.createElement('button');
      fitBtn.type = 'button';
      fitBtn.className = 'btn';
      fitBtn.textContent = 'Fit Diagram';
      fitBtn.addEventListener('click', () => zoomToFit({ pad: 100, maxZoom: 1.2 }));
      const validateBtn = document.createElement('button');
      validateBtn.type = 'button';
      validateBtn.className = 'btn';
      validateBtn.textContent = 'Validate';
      validateBtn.addEventListener('click', () => validateDiagram());
      actions.append(fitBtn, validateBtn);
    } else {
      const sampleBtn = document.createElement('button');
      sampleBtn.type = 'button';
      sampleBtn.className = 'btn';
      sampleBtn.textContent = 'Load Sample';
      sampleBtn.addEventListener('click', loadSampleDiagram);
      actions.append(autoBuildBtn, sampleBtn, connectBtn);
    }
    empty.append(heading, copy, actions);
    root.appendChild(empty);
    return;
  }

  const title = document.createElement('h4');
  title.textContent = selectedComp.label || selectedComp.ref || selectedComp.subtype || selectedComp.id;
  const grid = document.createElement('dl');
  grid.className = 'right-rail-property-grid';
  [
    ['Type', selectedComp.type || ''],
    ['Subtype', selectedComp.subtype || ''],
    ['Voltage', selectedComp.voltage || selectedComp.volts || selectedComp.props?.voltage || selectedComp.props?.volts || ''],
    ['Rating', selectedComp.rating || selectedComp.amp_rating || selectedComp.props?.rating || ''],
    ['Connections', `${(selectedComp.connections || []).length} out / ${components.filter(c => (c.connections || []).some(conn => conn.target === selectedComp.id)).length} in`]
  ].forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value === '' ? 'Not set' : String(value);
    grid.append(dt, dd);
  });
  const actions = document.createElement('div');
  actions.className = 'right-rail-actions';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn';
  editBtn.textContent = 'Edit Properties';
  editBtn.addEventListener('click', () => selectComponent(selectedComp.id));
  const connectedBtn = document.createElement('button');
  connectedBtn.type = 'button';
  connectedBtn.className = 'btn';
  connectedBtn.textContent = 'Select Connected';
  connectedBtn.addEventListener('click', () => selectConnected(selectedComp.id));
  const approveBtn = document.createElement('button');
  approveBtn.type = 'button';
  approveBtn.className = 'btn';
  approveBtn.textContent = 'Approve Assumption';
  approveBtn.disabled = isComponentPropertiesLocked(selectedComp);
  approveBtn.title = approveBtn.disabled ? 'Unlock component properties to approve assumptions' : '';
  approveBtn.addEventListener('click', () => {
    if (isComponentPropertiesLocked(selectedComp)) {
      showToast('Unlock component properties before approving assumptions');
      return;
    }
    selectedComp.reviewStatus = 'reviewed';
    selectedComp.assumptionsReviewedAt = new Date().toISOString();
    render();
    save();
    showToast('Assumption marked reviewed');
  });
  actions.append(editBtn, connectedBtn, approveBtn);
  root.append(title, grid, actions);
  appendOperatingStatePanel(root, selectedComp);
  appendHandoffLinks(root, selectedComp);
}

function validationQuickFixLabel(issue) {
  if (!issue || !issue.code) return '';
  if (issue.code === 'voltage-mismatch') return 'Assign upstream voltage';
  if (issue.code === 'provisional-cable') return 'Create cable row';
  if (issue.code === 'missing-schedule-link') return 'Link schedule row';
  if (issue.code === 'unconnected') return 'Mark assumption';
  return '';
}

function assignVoltageFromNeighbor(componentId) {
  const comp = components.find(item => item.id === componentId);
  if (!comp) return false;
  const inbound = components.find(item => (item.connections || []).some(conn => conn.target === comp.id));
  const inboundConn = inbound?.connections?.find(conn => conn.target === comp.id);
  const outboundConn = (comp.connections || []).find(conn => components.some(item => item.id === conn.target));
  const outboundTarget = outboundConn ? components.find(item => item.id === outboundConn.target) : null;
  const sourceVoltage = inbound
    ? resolveConnectionVoltageVolts(inbound, inboundConn, 'source')
    : outboundTarget
      ? resolveConnectionVoltageVolts(outboundTarget, outboundConn, 'target')
      : null;
  if (!Number.isFinite(sourceVoltage) || sourceVoltage <= 0) return false;
  assignInheritedVoltage(comp, sourceVoltage, inboundConn || outboundConn, sourceVoltage);
  return true;
}

function applyValidationQuickFix(issue) {
  if (!issue) return false;
  if (issue.code === 'voltage-mismatch') {
    const fixed = assignVoltageFromNeighbor(issue.component);
    if (!fixed) {
      showToast('No upstream voltage found for this device');
      return false;
    }
  } else if (issue.code === 'provisional-cable') {
    const source = components.find(comp => comp.id === issue.component);
    const conn = source?.connections?.[issue.connectionIndex];
    const target = conn ? components.find(comp => comp.id === conn.target) : null;
    if (!source || !target || !conn) {
      showToast('Connection not found');
      return false;
    }
    upsertCableScheduleRecordForConnection(source, target, conn);
  } else if (issue.code === 'missing-schedule-link') {
    const comp = components.find(item => item.id === issue.component);
    if (!comp || !autoLinkComponentToSchedule(comp, { createIfMissing: true })) {
      showToast('Could not link schedule row');
      return false;
    }
  } else if (issue.code === 'unconnected') {
    const comp = components.find(item => item.id === issue.component);
    if (!markComponentAssumption(comp, 'Component intentionally left unconnected for user review.')) return false;
  } else {
    return false;
  }
  pushHistory();
  render();
  save();
  validateDiagram({ notify: false, revealPanel: false });
  markScheduleReconcilePending();
  showToast('Validation quick fix applied');
  return true;
}

function renderRightRailValidation() {
  const root = document.getElementById('right-rail-validation');
  if (!root) return;
  root.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'right-rail-validation-header';
  const count = document.createElement('strong');
  count.textContent = validationIssues.length
    ? `${validationIssues.length} issue${validationIssues.length === 1 ? '' : 's'}`
    : 'No validation issues';
  const validateBtn = document.createElement('button');
  validateBtn.type = 'button';
  validateBtn.className = 'btn';
  validateBtn.textContent = 'Validate';
  validateBtn.addEventListener('click', () => validateDiagram({ revealPanel: false }));
  header.append(count, validateBtn);
  root.appendChild(header);
  if (!validationIssues.length) {
    const empty = document.createElement('p');
    empty.className = 'right-rail-empty';
    empty.textContent = 'Run Validate after drawing or editing to refresh code and connectivity checks.';
    root.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'right-rail-list';
  validationIssues.slice(0, 12).forEach(issue => {
    const li = document.createElement('li');
    li.className = 'right-rail-validation-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = issue.message;
    button.addEventListener('click', () => focusComponent(issue.component));
    li.appendChild(button);
    const quickFix = validationQuickFixLabel(issue);
    if (quickFix) {
      const fixBtn = document.createElement('button');
      fixBtn.type = 'button';
      fixBtn.className = 'right-rail-fix-btn';
      fixBtn.textContent = quickFix;
      fixBtn.addEventListener('click', event => {
        event.stopPropagation();
        applyValidationQuickFix(issue);
      });
      li.appendChild(fixBtn);
    }
    list.appendChild(li);
  });
  root.appendChild(list);
  if (validationIssues.length > 12) {
    const more = document.createElement('p');
    more.className = 'right-rail-muted';
    more.textContent = `${validationIssues.length - 12} more issue(s). Use Validate for the full Fix-it list.`;
    root.appendChild(more);
  }
}

function renderRightRail() {
  renderRightRailProperties();
  renderRightRailValidation();
  setRightRailTab(rightRailActiveTab);
}

async function promptCheckpointName(defaultValue = '') {
  const result = await openModal({
    title: 'Create checkpoint',
    description: 'Save a named milestone for the current undo/redo state.',
    primaryText: 'Save checkpoint',
    secondaryText: 'Cancel',
    onSubmit: controller => {
      const input = controller.body.querySelector('input[name="checkpointName"]');
      const assistive = input ? ensureFieldAssistiveText(input, { helperText: 'Example: Before panel redesign' }) : null;
      const value = input ? input.value.trim() : '';
      if (!value) {
        if (assistive) assistive.setError('Checkpoint name is required.');
        return false;
      }
      if (assistive) assistive.setError('');
      return value;
    },
    render: body => {
      const label = document.createElement('label');
      label.className = 'modal-form-field';
      label.textContent = 'Checkpoint name';
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'checkpointName';
      input.value = defaultValue;
      label.appendChild(input);
      body.appendChild(label);
      ensureFieldAssistiveText(input, { helperText: 'Example: Before panel redesign' });
      return { initialFocus: input };
    }
  });
  return typeof result === 'string' ? result.trim() : '';
}

async function promptDialog(title, label, defaultValue = '', { helperText = '' } = {}) {
  const result = await openModal({
    title,
    primaryText: 'OK',
    secondaryText: 'Cancel',
    onSubmit: controller => {
      const input = controller.body.querySelector('input[name="promptDialogValue"]');
      const assistive = input ? ensureFieldAssistiveText(input) : null;
      const value = input ? input.value.trim() : '';
      if (!value) {
        if (assistive) assistive.setError('This field is required.');
        return false;
      }
      if (assistive) assistive.setError('');
      return value;
    },
    render: body => {
      const lbl = document.createElement('label');
      lbl.className = 'modal-form-field';
      lbl.textContent = label;
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'promptDialogValue';
      input.value = defaultValue;
      if (helperText) ensureFieldAssistiveText(input, { helperText });
      lbl.appendChild(input);
      body.appendChild(lbl);
      return { initialFocus: input };
    }
  });
  return typeof result === 'string' ? result : null;
}

async function confirmDialog(title, description = '', { primaryText = 'Confirm' } = {}) {
  const result = await openModal({ title, description, primaryText, secondaryText: 'Cancel' });
  return !!result;
}

async function addCheckpoint() {
  if (historyController.index < 0 || historyController.index >= historyController.length) {
    showToast('No history state available for checkpoint');
    return;
  }
  checkpointCounter += 1;
  const defaultName = `Checkpoint ${checkpointCounter}`;
  const name = await promptCheckpointName(defaultName);
  if (!name) {
    checkpointCounter -= 1;
    return;
  }
  const checkpoint = {
    id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    historyIndex: historyController.index,
    createdAt: Date.now()
  };
  checkpoints.push(checkpoint);
  recordHistoryEvent('checkpoint', `Checkpoint "${name}" created`, { checkpointId: checkpoint.id });
  showToast(`Checkpoint "${name}" saved`);
}

async function jumpToCheckpoint(checkpointId) {
  const checkpoint = checkpoints.find(point => point.id === checkpointId);
  if (!checkpoint) return;
  const confirmed = await openModal({
    title: 'Restore checkpoint',
    description: `Restore to "${checkpoint.name}"? Unsaved edits after this point will be discarded.`,
    primaryText: 'Restore',
    secondaryText: 'Cancel'
  });
  if (!confirmed) return;
  if (checkpoint.historyIndex < 0 || checkpoint.historyIndex >= historyController.length) {
    showToast('Checkpoint no longer available');
    checkpoints = checkpoints.filter(point => point.id !== checkpointId);
    renderHistorySidebar();
    return;
  }
  historyController.restore(checkpoint.historyIndex, {
    action: 'restore',
    reason: `Restored checkpoint "${checkpoint.name}"`,
    metadata: { checkpointId: checkpoint.id }
  });
}

function bindHistorySidebarControls() {
  const toggleBtn = document.getElementById('history-sidebar-toggle');
  const sidebar = document.getElementById('history-sidebar');
  const workspace = document.querySelector('.workspace');
  const addCheckpointBtn = document.getElementById('add-checkpoint-btn');
  document.querySelectorAll('[data-right-rail-tab]').forEach(button => {
    button.addEventListener('click', () => setRightRailTab(button.dataset.rightRailTab));
  });
  if (toggleBtn && sidebar && workspace) {
    if (window.matchMedia?.('(max-width: 600px)').matches) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      sidebar.classList.add('hidden');
      workspace.classList.add('history-collapsed');
    }
    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      toggleBtn.setAttribute('aria-expanded', String(nextExpanded));
      sidebar.classList.toggle('hidden', !nextExpanded);
      workspace.classList.toggle('history-collapsed', !nextExpanded);
    });
  }
  if (addCheckpointBtn) {
    addCheckpointBtn.addEventListener('click', () => {
      addCheckpoint();
    });
  }
}

function pushHistory(reason = 'Diagram updated') {
  historyController.push(reason);
}

function undo() {
  historyController.undo('Undo applied');
}

function redo() {
  historyController.redo('Redo applied');
}

function loadTemplates() {
  try {
    const storedTemplates = migrateLegacyItem('onelineTemplates', 'onelineTemplates', []);
    templates = Array.isArray(storedTemplates) ? storedTemplates : [];
  } catch {
    templates = [];
  }
}

function saveTemplates() {
  setItem('onelineTemplates', templates);
}

function renderTemplates() {
  const container = document.getElementById('template-buttons');
  if (!container) return;
  container.innerHTML = '';
  if (!templates.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'no-components';
    placeholder.textContent = 'No components available';
    container.appendChild(placeholder);
    return;
  }
  templates.forEach(t => {
    const btn = document.createElement('button');
    btn.textContent = t.name;
    btn.dataset.subtype = t.component.subtype;
    btn.dataset.label = t.name;
    btn.addEventListener('click', () => addTemplateComponent(t.component));
    container.appendChild(btn);
  });
}

function addTemplateComponent(data) {
  const id = createDiagramEntityId('n');
  const insertionPoint = getDefaultInsertionPoint();
  let x = insertionPoint.x;
  let y = insertionPoint.y;
  if (gridEnabled) {
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;
    x = snappedX;
    y = snappedY;
  }
  components.push({
    id,
    ...JSON.parse(JSON.stringify(data)),
    x,
    y,
    connections: []
  });
  pushHistory();
  render();
  save();
  if (gridEnabled) flashSnapIndicator(x, y);
}

function exportTemplates() {
  const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'onelineTemplates.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast('Templates exported');
}

async function importTemplates(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      templates = templates.concat(data);
      saveTemplates();
      renderTemplates();
      showToast('Templates imported');
    }
  } catch (err) {
    console.error('Failed to import templates', err);
  }
  e.target.value = '';
}

function setupLibraryTools() {
  const reloadBtn = document.getElementById('reload-library-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      await loadComponentLibrary();
      showToast('Component library reloaded');
    });
  }
}

const cableColors = {
  Power: '#f00',
  Control: '#00f',
  Signal: '#0a0'
};

function isConductorSegmentComponent(comp) {
  const type = String(comp?.type || '').toLowerCase();
  const subtype = String(comp?.subtype || '').toLowerCase();
  return type === 'cable' || type === 'busway' || subtype === 'cable' || subtype === 'busway';
}

function getCableForConnection(source, target, conn) {
  if (isConductorSegmentComponent(source)) return source.cable || source.props?.cable || source.props || null;
  if (isConductorSegmentComponent(target)) return target.cable || target.props?.cable || target.props || null;
  return conn?.cable || null;
}

function parseCablePhases(source) {
  return normalizeCablePhases(source);
}

function hasStoredPhases(value) {
  if (Array.isArray(value)) return true;
  return value !== undefined && value !== null && value !== '';
}

// Phase sequence colors used for connection rendering
const phaseColors = {
  A: '#f00',
  B: '#00f',
  C: '#0a0',
  AB: '#800080',
  BC: '#008080',
  AC: '#ffa500',
  ABC: '#555'
};

// Voltage range configuration used for coloring components and connections
const voltageColors = [
  { max: 600, color: '#4caf50', label: '\u2264600V' },
  { max: 5000, color: '#ff9800', label: '600V-5000V' },
  { max: Infinity, color: '#f44336', label: '>5000V' }
];

function getVoltageRange(voltage) {
  const v = parseFloat(voltage);
  if (isNaN(v)) return null;
  return voltageColors.find(r => v <= r.max) || null;
}

function updateLegend(ranges) {
  const legend = document.getElementById('voltage-legend');
  if (!legend) return;
  legend.innerHTML = '';
  const appendLegendItem = ({ color, label }) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-color';
    swatch.style.background = color;
    item.appendChild(swatch);
    const lbl = document.createElement('span');
    lbl.textContent = label;
    item.appendChild(lbl);
    legend.appendChild(item);
  };
  voltageColors.forEach(r => {
    if (ranges.has(r)) appendLegendItem(r);
  });
  if (showOverlays) {
    const items = [
      { color: '#4caf50', label: 'Voltage \u2264 5% dev' },
      { color: '#ffeb3b', label: '5-10% dev' },
      { color: '#f44336', label: '>10% dev' }
    ];
    items.forEach(appendLegendItem);
  }
  if (showHazAreaOverlay) {
    [
      { color: '#dc3232', label: 'Hazardous area: Zone 0/20 or failed compatibility' },
      { color: '#e68c28', label: 'Hazardous area: Zone 1/21' },
      { color: '#dcc832', label: 'Hazardous area: Zone 2/22' }
    ].forEach(appendLegendItem);
  }
  const dataStateItems = getDataStateLegendItems();
  if (dataStateItems.length) {
    appendLegendItem({
      color: 'transparent',
      label: dataStateOverlayLabels[dataStateOverlayMode] || 'Color overlay'
    });
    dataStateItems.forEach(appendLegendItem);
    const provenanceLabel = overlayProvenanceLabel();
    if (provenanceLabel) appendLegendItem({ color: '#475569', label: provenanceLabel });
  }
  legend.style.display = ranges.size || showOverlays || showHazAreaOverlay || dataStateItems.length ? 'block' : 'none';
  if (!legendUserMoved && legend.style.display === 'block') {
    const host = legend.offsetParent instanceof HTMLElement ? legend.offsetParent : legend.parentElement;
    const parentWidth = host instanceof HTMLElement ? host.clientWidth : (legend.parentElement?.clientWidth || window.innerWidth);
    const parentHeight = host instanceof HTMLElement ? host.clientHeight : (legend.parentElement?.clientHeight || window.innerHeight);
    const legendWidth = legend.offsetWidth || 0;
    const legendHeight = legend.offsetHeight || 0;
    const maxLeft = parentWidth - legendWidth;
    const preferredLeft = maxLeft - 10;
    const clampedLeft = Math.max(0, preferredLeft >= 0 ? preferredLeft : maxLeft >= 0 ? maxLeft : 0);
    const clampedTop = Math.max(0, Math.min(10, parentHeight - legendHeight));
    legend.style.left = `${clampedLeft}px`;
    legend.style.top = `${clampedTop}px`;
  }
}

function resolveComponentCategory(comp) {
  if (!comp) return '';
  const metaKey = resolveComponentMetaKey(comp);
  const meta = componentMeta[metaKey];
  const metaCategory = normalizeCategoryValue(meta?.category);
  if (metaCategory) return metaCategory;
  if (meta?.type) {
    const typeCategory = categoryForType(meta.type);
    if (typeCategory) return typeCategory;
  }
  const storedCategory = normalizeCategoryValue(subtypeCategory[metaKey] || subtypeCategory[comp.subtype]);
  if (storedCategory) return storedCategory;
  const compCategory = normalizeCategoryValue(comp.category);
  if (compCategory) return compCategory;
  if (comp.type) return categoryForType(comp.type);
  return '';
}

function defaultLabelAnchor(comp) {
  const category = resolveComponentCategory(comp);
  const bounds = componentBounds(comp);
  if (category === 'bus' || category === 'sources') {
    return {
      x: (bounds.left + bounds.right) / 2,
      y: bounds.top - 10
    };
  }
  if (comp?.type === 'transformer') {
    return {
      x: (bounds.left + bounds.right) / 2,
      y: bounds.bottom + 32
    };
  }
  return {
    x: (bounds.left + bounds.right) / 2,
    y: bounds.bottom + 12
  };
}

function getLabelPosition(comp) {
  const offset = comp.labelOffset || { x: 0, y: 0 };
  const base = defaultLabelAnchor(comp);
  return {
    x: base.x + (Number(offset.x) || 0),
    y: base.y + (Number(offset.y) || 0)
  };
}

function getLabelAlignment(comp) {
  return 'middle';
}

function getLabelBaseline(comp) {
  const category = resolveComponentCategory(comp);
  return category === 'bus' || category === 'sources' ? 'baseline' : 'hanging';
}

function getComponentLabelText(comp, meta = componentMeta[comp?.subtype] || {}) {
  return comp?.label || meta.label || comp?.subtype || comp?.type || '';
}

function estimateTextWidth(text, fontSize = 12) {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;
  return Math.max(24, normalized.length * fontSize * 0.58);
}

function componentLabelBounds(comp) {
  if (!comp || comp.type === 'annotation') return null;
  const text = getComponentLabelText(comp);
  if (!text) return null;
  const pos = getLabelPosition(comp);
  const width = estimateTextWidth(text, 13);
  const height = 17;
  const baseline = getLabelBaseline(comp);
  const top = baseline === 'hanging' ? pos.y - 2 : pos.y - height + 2;
  return {
    left: pos.x - width / 2,
    top,
    right: pos.x + width / 2,
    bottom: top + height
  };
}

function componentVisualBounds(comp) {
  const bounds = componentBounds(comp);
  const labelBounds = componentLabelBounds(comp);
  if (!labelBounds) return bounds;
  return {
    left: Math.min(bounds.left, labelBounds.left),
    top: Math.min(bounds.top, labelBounds.top),
    right: Math.max(bounds.right, labelBounds.right),
    bottom: Math.max(bounds.bottom, labelBounds.bottom)
  };
}

function attachLabelInteractions(el, comp) {
  if (!el) return;
  el.addEventListener('mousedown', e => {
    e.stopPropagation();
    selected = comp;
    selection = [comp];
    selectedConnection = null;
    const pos = getLabelPosition(comp);
    const coords = toDiagramCoords(e);
    draggingLabel = {
      component: comp,
      dx: coords.x - pos.x,
      dy: coords.y - pos.y,
      moved: false
    };
  });
  el.addEventListener('click', e => {
    e.stopPropagation();
    if (!selection.includes(comp)) {
      selection = [comp];
      selected = comp;
      selectedConnection = null;
      render();
    }
  });
  el.addEventListener('dblclick', e => {
    e.stopPropagation();
    cancelPendingClickSelection();
    startInlineLabelEdit(comp);
  });
}

const ALIGNMENT_SNAP_THRESHOLD = 10;

function alignmentAnchors(bounds, axis) {
  if (axis === 'x') {
    return [
      { value: bounds.left, label: 'left' },
      { value: (bounds.left + bounds.right) / 2, label: 'center' },
      { value: bounds.right, label: 'right' }
    ];
  }
  return [
    { value: bounds.top, label: 'top' },
    { value: (bounds.top + bounds.bottom) / 2, label: 'middle' },
    { value: bounds.bottom, label: 'bottom' }
  ];
}

function isComponentOnHiddenLayer(comp) {
  if (!comp?.layer) return false;
  return layers.some(layer => layer.id === comp.layer && layer.visible === false);
}

function findAlignmentSnap(movingBounds, candidateBounds, axis) {
  let best = null;
  alignmentAnchors(movingBounds, axis).forEach(movingAnchor => {
    alignmentAnchors(candidateBounds, axis).forEach(candidateAnchor => {
      const delta = candidateAnchor.value - movingAnchor.value;
      if (Math.abs(delta) > ALIGNMENT_SNAP_THRESHOLD) return;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = {
          delta,
          value: candidateAnchor.value,
          movingAnchor: movingAnchor.label,
          candidateAnchor: candidateAnchor.label
        };
      }
    });
  });
  return best;
}

function buildDragSnapGuides(projectedComponent, movingIds, startPosition) {
  if (!alignmentGuidesEnabled || !projectedComponent) return null;
  const movingBounds = componentBounds(projectedComponent);
  const candidates = components.filter(comp => !movingIds.has(comp.id) && !isComponentOnHiddenLayer(comp));
  let vertical = null;
  let horizontal = null;
  candidates.forEach(candidate => {
    const candidateBounds = componentBounds(candidate);
    const xMatch = findAlignmentSnap(movingBounds, candidateBounds, 'x');
    const yMatch = findAlignmentSnap(movingBounds, candidateBounds, 'y');
    if (xMatch && (!vertical || Math.abs(xMatch.delta) < Math.abs(vertical.delta))) {
      vertical = {
        ...xMatch,
        min: Math.min(movingBounds.top, candidateBounds.top) - 18,
        max: Math.max(movingBounds.bottom, candidateBounds.bottom) + 18
      };
    }
    if (yMatch && (!horizontal || Math.abs(yMatch.delta) < Math.abs(horizontal.delta))) {
      horizontal = {
        ...yMatch,
        min: Math.min(movingBounds.left, candidateBounds.left) - 18,
        max: Math.max(movingBounds.right, candidateBounds.right) + 18
      };
    }
  });
  const dx = projectedComponent.x - startPosition.x + (vertical?.delta || 0);
  const dy = projectedComponent.y - startPosition.y + (horizontal?.delta || 0);
  return {
    vertical,
    horizontal,
    readout: { x: projectedComponent.x + (vertical?.delta || 0), y: projectedComponent.y + (horizontal?.delta || 0), dx, dy }
  };
}

function renderDragSnapGuides(svg) {
  if (!dragSnapGuides || isEngineeringPrintMode()) return;
  const guides = document.createElementNS(svgNS, 'g');
  guides.classList.add('alignment-snap-guides');
  guides.style.pointerEvents = 'none';
  if (dragSnapGuides.vertical) {
    const line = document.createElementNS(svgNS, 'line');
    line.classList.add('alignment-snap-guide', 'alignment-snap-guide-vertical');
    line.setAttribute('x1', dragSnapGuides.vertical.value);
    line.setAttribute('x2', dragSnapGuides.vertical.value);
    line.setAttribute('y1', dragSnapGuides.vertical.min);
    line.setAttribute('y2', dragSnapGuides.vertical.max);
    guides.appendChild(line);
  }
  if (dragSnapGuides.horizontal) {
    const line = document.createElementNS(svgNS, 'line');
    line.classList.add('alignment-snap-guide', 'alignment-snap-guide-horizontal');
    line.setAttribute('x1', dragSnapGuides.horizontal.min);
    line.setAttribute('x2', dragSnapGuides.horizontal.max);
    line.setAttribute('y1', dragSnapGuides.horizontal.value);
    line.setAttribute('y2', dragSnapGuides.horizontal.value);
    guides.appendChild(line);
  }
  const readout = dragSnapGuides.readout;
  if (readout) {
    const label = document.createElementNS(svgNS, 'text');
    label.classList.add('alignment-snap-readout');
    label.setAttribute('x', readout.x + 12);
    label.setAttribute('y', readout.y - 12);
    label.textContent = `ΔX ${Math.round(readout.dx)}  ΔY ${Math.round(readout.dy)}`;
    guides.appendChild(label);
  }
  svg.appendChild(guides);
}

function isInlineLabelEditLocked(comp) {
  return !comp || isComponentPositionLocked(comp) || isComponentPropertiesLocked(comp);
}

function canEditConnectionWaypoint(component, connection) {
  if (!component || !connection || isBusComponent(component)) return false;
  const target = components.find(candidate => candidate.id === connection.target);
  return !!target
    && !isBusComponent(target)
    && !(liveTelemetryController.running && liveTelemetryConfig.operatorMode);
}

function placeConnectionWaypoint(component, index, point = null) {
  const source = components.find(candidate => candidate.id === component?.id) || component;
  const connection = source?.connections?.[index];
  if (!canEditConnectionWaypoint(source, connection)) {
    showToast('Waypoints are unavailable for bus taps or Live operator mode');
    return false;
  }
  const target = components.find(candidate => candidate.id === connection.target);
  const start = portPosition(source, connection.sourcePort);
  const end = portPosition(target, connection.targetPort);
  if (!start || !end) return false;
  const horizontalFirst = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  connection.dir = horizontalFirst ? 'h' : 'v';
  let mid = horizontalFirst
    ? (Number.isFinite(point?.x) ? point.x : (start.x + end.x) / 2)
    : (Number.isFinite(point?.y) ? point.y : (start.y + end.y) / 2);
  if (gridEnabled) mid = Math.round(mid / gridSize) * gridSize;
  connection.mid = Number(mid.toFixed(2));
  pushHistory();
  render();
  save();
  showToast('Connection waypoint placed');
  return true;
}

function resetConnectionWaypoint(component, index) {
  const source = components.find(candidate => candidate.id === component?.id) || component;
  const connection = source?.connections?.[index];
  if (!canEditConnectionWaypoint(source, connection)) {
    showToast('Waypoints are unavailable for bus taps or Live operator mode');
    return false;
  }
  delete connection.dir;
  delete connection.mid;
  pushHistory();
  render();
  save();
  showToast('Connection route reset');
  return true;
}

function closeInlineLabelEditor({ commit = false } = {}) {
  const editor = activeInlineLabelEditor;
  if (!editor) return;
  activeInlineLabelEditor = null;
  editor.element.remove();
  if (!commit) return;

  const nextValue = editor.input.value.trim();
  if (!nextValue) {
    showToast(`${editor.fieldLabel} cannot be blank`);
    return;
  }
  if (nextValue === editor.originalValue) return;
  const component = components.find(candidate => candidate.id === editor.comp.id) || editor.comp;
  component[editor.key] = nextValue;
  if (editor.key === 'label' && component.type === 'annotation' && !component.text) {
    component.text = nextValue;
  }
  pushHistory();
  save(false);
  render();
}

function startInlineLabelEdit(comp, { key = 'label', fallbackKey = '', fieldLabel = 'Label' } = {}) {
  if (!comp || isInlineLabelEditLocked(comp)) {
    if (comp) showToast('Unlock the component position, properties, or layer before editing its label');
    return;
  }
  closeInlineLabelEditor({ commit: true });
  const svg = document.getElementById('diagram');
  if (!svg) return;
  const originalValue = String(comp[key] ?? comp[fallbackKey] ?? '').trim();
  const bounds = componentBounds(comp);
  const position = key === 'label' ? getLabelPosition(comp) : {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2
  };
  const width = Math.max(132, Math.min(340, estimateTextWidth(originalValue || fieldLabel, 13) + 52));
  const height = 28;
  const editor = document.createElementNS(svgNS, 'foreignObject');
  editor.classList.add('inline-label-editor');
  editor.setAttribute('x', position.x - width / 2);
  editor.setAttribute('y', position.y - height / 2);
  editor.setAttribute('width', width);
  editor.setAttribute('height', height);
  editor.dataset.componentId = comp.id;
  const input = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
  input.className = 'inline-label-editor-input';
  input.type = 'text';
  input.value = originalValue;
  input.setAttribute('aria-label', `${fieldLabel} for ${getComponentLabelText(comp) || comp.id}`);
  input.addEventListener('mousedown', event => event.stopPropagation());
  input.addEventListener('dblclick', event => event.stopPropagation());
  input.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      closeInlineLabelEditor({ commit: true });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeInlineLabelEditor();
    }
  });
  input.addEventListener('blur', () => closeInlineLabelEditor({ commit: true }));
  editor.appendChild(input);
  svg.appendChild(editor);
  activeInlineLabelEditor = { element: editor, input, comp, key, originalValue, fieldLabel };
  window.requestAnimationFrame(() => {
    if (activeInlineLabelEditor?.element === editor) {
      input.focus();
      input.select();
    }
  });
}

function formatAttributeLabel(key) {
  if (!key) return '';
  return key
    .replace(/\./g, '_')
    .split('_')
    .filter(Boolean)
    .map(part => {
      const normalized = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
      if (normalized.length <= 3 && normalized === normalized.toUpperCase()) return normalized;
      if (normalized.length <= 3) return normalized.toUpperCase();
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatOptionSourceLabel(source) {
  if (!source) return '';
  if (source.startsWith('study:')) {
    const label = formatAttributeLabel(source.slice(6));
    return label ? `${label} Study` : 'Study';
  }
  if (source === 'component') return 'Component';
  if (source === 'componentProps') return 'Component Settings';
  if (source === 'template') return 'Template Defaults';
  return formatAttributeLabel(source);
}

function deriveOptionContextLabel(optionKey, baseLabel) {
  if (!optionKey) return '';
  if (optionKey.includes('.')) {
    const [namespace, ...rest] = optionKey.split('.');
    const nsLabel = formatAttributeLabel(namespace);
    const propLabel = rest.length ? formatAttributeLabel(rest.join('.')) : '';
    if (propLabel && propLabel !== baseLabel) return `${nsLabel ? `${nsLabel}: ` : ''}${propLabel}`.trim();
    return nsLabel && nsLabel !== baseLabel ? nsLabel : '';
  }
  const parts = optionKey.split('_');
  if (parts.length > 1) {
    const tail = formatAttributeLabel(parts.slice(-1)[0]);
    if (tail && tail !== baseLabel) return tail;
  }
  const formatted = formatAttributeLabel(optionKey);
  return formatted !== baseLabel ? formatted : '';
}

function formatOverlayMetric(value, unit, decimals = 2) {
  if (value === null || value === undefined) return '';
  const formatNumber = val => {
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(decimals);
  };
  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .map(([key, val]) => {
        const formatted = formatNumber(val);
        if (formatted === null) return null;
        return `${key}:${formatted}`;
      })
      .filter(Boolean);
    if (!parts.length) return '';
    return `${parts.join(', ')} ${unit}`;
  }
  const formatted = formatNumber(value);
  return formatted === null ? '' : `${formatted} ${unit}`;
}

function inferAttributeUnit(key) {
  const lower = key.toLowerCase();
  if (lower.endsWith('kva') || lower.endsWith('_kva')) return 'kVA';
  if (lower.endsWith('_ka') || lower.includes('ka')) return 'kA';
  if (lower.endsWith('_kv') || lower.includes('kv')) return 'kV';
  if (lower.includes('voltage') || lower.endsWith('volts') || lower.endsWith('_v')) return 'V';
  if (lower.endsWith('_kw') || lower.endsWith('kw')) return 'kW';
  if (lower.endsWith('_a') || lower.endsWith('amps') || lower.endsWith('current_a')) return 'A';
  if (lower.includes('percent') || lower.endsWith('_pct') || lower.includes('impedance') || lower.endsWith('%')) return '%';
  if (lower.includes('efficiency')) return '%';
  if (lower.endsWith('_hz') || lower.endsWith('hz')) return 'Hz';
  if (lower.endsWith('_ft')) return 'ft';
  if (lower.endsWith('_m')) return 'm';
  return '';
}

function getAttributeOption(key) {
  if (!key) return null;
  if (attributeOptionsMap.has(key)) return attributeOptionsMap.get(key);
  const override = attributeDisplayOverrides[key];
  const label = override?.label || formatAttributeLabel(key);
  const unit = override && Object.prototype.hasOwnProperty.call(override, 'unit')
    ? override.unit
    : inferAttributeUnit(key);
  const option = { key, label, unit };
  attributeOptionsMap.set(key, option);
  return option;
}

function formatAttributeValue(key, value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const abs = Math.abs(value);
    const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    let formatted = value.toFixed(decimals);
    if (decimals > 0) formatted = formatted.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    return formatted;
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function resolveComponentAttribute(comp, key) {
  return resolveOneLineComponentAttribute(comp, key, { studyAttributeResolvers });
}

function getEngineeringLabelLines(comp) {
  return buildEngineeringLabelLines(comp, {
    studyAttributeResolvers,
    getCategory,
    isBusComponent,
    isProtectionComponent,
    maxLines: datablockDensityMode === 'expanded' ? 6 : 4
  });
}

function getComponentAttributeLines(comp) {
  if (datablockFormatMode === 'engineering') return [...liveReadingLines(comp), ...getEngineeringLabelLines(comp)].slice(0, datablockDensityMode === 'expanded' ? 6 : 4);
  if (!viewAttributes.size) return [];
  const keys = Array.from(viewAttributes);
  keys.sort((a, b) => {
    const optA = getAttributeOption(a);
    const optB = getAttributeOption(b);
    return (optA?.label || a).localeCompare(optB?.label || b);
  });
  const lines = [];
  keys.forEach(key => {
    const option = getAttributeOption(key);
    if (!option) return;
    const compKey = comp?.subtype || comp?.type;
    const displayMap = compKey ? componentAttributeDisplayOverrides.get(compKey) : null;
    const displayLabel = displayMap?.get(option.key) || option.displayLabel || option.label;
    const value = resolveComponentAttribute(comp, option.key);
    const formatted = formatAttributeValue(option.key, value);
    if (formatted === null) return;
    const unit = option.unit || '';
    const valueText = unit ? `${formatted} ${unit}`.trim() : formatted;
    const baseLabel = displayLabel || option.label || formatAttributeLabel(option.key);
    const labelText = baseLabel || formatAttributeLabel(option.key);
    lines.push(`${labelText}: ${valueText}`.trim());
  });
  return [...lines, ...liveReadingLines(comp)];
}

function createDatablockLayout(items = components) {
  return createDatablockLayoutForModel(items, {
    getComponentBounds: componentBounds,
    fallbackBounds: STATIC_VIEWPORT_BOUNDS
  });
}

function chooseEngineeringDatablockPlacement(comp, bounds, width, height, layout) {
  return chooseEngineeringDatablockPlacementForModel(comp, bounds, width, height, layout, {
    isBusComponent,
    resolveComponentCategory
  });
}

function renderComponentDatablock(svg, comp, lines, includePoint, layout = createDatablockLayout()) {
  if (!svg || !comp || !Array.isArray(lines) || !lines.length) return;
  const engineeringLabel = datablockFormatMode === 'engineering';
  const bounds = engineeringLabel ? componentVisualBounds(comp) : componentBounds(comp);
  const compact = datablockDensityMode === 'compact';
  const lineLimit = compact ? 30 : 38;
  const visibleLineLimit = compact ? 3 : 6;
  const visibleLines = lines.slice(0, visibleLineLimit).map(line => truncateDatablockLine(line, lineLimit));
  if (lines.length > visibleLines.length) {
    visibleLines.push(`+${lines.length - visibleLines.length} more`);
  }
  const longest = visibleLines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = compact
    ? Math.max(104, Math.min(184, longest * 5.8 + 18))
    : Math.max(112, Math.min(248, longest * 6.2 + 18));
  const lineHeight = compact ? 12 : 13;
  const height = visibleLines.length * lineHeight + 10;
  const placement = engineeringLabel
    ? chooseEngineeringDatablockPlacement(comp, bounds, width, height, layout)
    : chooseDatablockPlacement(bounds, width, height, layout);
  const x = placement.x;
  const y = placement.y;
  includePoint(x, y);
  includePoint(x + width, y + height);
  const g = document.createElementNS(svgNS, 'g');
  g.classList.add('component-datablock');
  if (engineeringLabel) g.classList.add('component-datablock-engineering');
  if (compact) g.classList.add('component-datablock-compact');
  g.dataset.side = placement.side;
  g.dataset.id = comp.id;
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');
  g.setAttribute('aria-label', `Data block for ${comp.label || comp.tag || comp.id}`);

  const title = document.createElementNS(svgNS, 'title');
  title.textContent = lines.join('\n');
  const leaderStart = {
    x: placement.side === 'left' ? bounds.left : placement.side === 'right' ? bounds.right : (bounds.left + bounds.right) / 2,
    y: placement.side === 'top' ? bounds.top : placement.side === 'bottom' ? bounds.bottom : (bounds.top + bounds.bottom) / 2
  };
  const leaderEnd = {
    x: placement.side === 'left' ? x + width : placement.side === 'right' ? x : Math.min(Math.max(leaderStart.x, x), x + width),
    y: placement.side === 'top' ? y + height : placement.side === 'bottom' ? y : Math.min(Math.max(leaderStart.y, y), y + height)
  };
  const leaderPoints = placement.side === 'left' || placement.side === 'right'
    ? [leaderStart, { x: leaderEnd.x, y: leaderStart.y }, leaderEnd]
    : [leaderStart, { x: leaderStart.x, y: leaderEnd.y }, leaderEnd];
  leaderPoints.forEach(point => includePoint(point.x, point.y));
  const leader = document.createElementNS(svgNS, 'polyline');
  leader.setAttribute('points', leaderPoints.map(point => `${point.x},${point.y}`).join(' '));
  leader.setAttribute('fill', 'none');
  leader.classList.add('component-datablock-leader');
  const rect = document.createElementNS(svgNS, 'rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', width);
  rect.setAttribute('height', height);
  rect.setAttribute('rx', engineeringLabel ? 1 : 4);
  rect.setAttribute('ry', engineeringLabel ? 1 : 4);
  g.append(title, leader, rect);
  visibleLines.forEach((line, idx) => {
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', x + 8);
    text.setAttribute('y', y + 15 + idx * lineHeight);
    text.textContent = line;
    g.appendChild(text);
  });
  g.addEventListener('click', event => {
    event.stopPropagation();
    selection = [comp];
    selected = comp;
    selectedConnection = null;
    setRightRailTab('properties');
    render();
  });
  g.addEventListener('dblclick', event => {
    event.stopPropagation();
    cancelPendingClickSelection();
    selectComponent(comp);
  });
  g.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selection = [comp];
    selected = comp;
    selectedConnection = null;
    setRightRailTab('properties');
    render();
  });
  includePoint(x, y);
  includePoint(x + width, y + height);
  layout.reserve({ x, y, width, height });
  svg.appendChild(g);
}

function renderOperatingStateBadge(svg, comp, status, includePoint) {
  if (!svg || !comp || status !== 'open') return;
  const bounds = componentBounds(comp);
  const width = 42;
  const height = 16;
  const x = (bounds.left + bounds.right) / 2 - width / 2;
  const y = bounds.top - height - 4;
  const badge = document.createElementNS(svgNS, 'g');
  badge.classList.add('operating-state-badge');
  badge.dataset.id = comp.id;
  const title = document.createElementNS(svgNS, 'title');
  title.textContent = `${comp.label || comp.tag || comp.id} is open in ${operatingStateLabels[activeOperatingState]}`;
  const rect = document.createElementNS(svgNS, 'rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', width);
  rect.setAttribute('height', height);
  rect.setAttribute('rx', 4);
  rect.setAttribute('ry', 4);
  const text = document.createElementNS(svgNS, 'text');
  text.setAttribute('x', x + width / 2);
  text.setAttribute('y', y + 11);
  text.setAttribute('text-anchor', 'middle');
  text.textContent = 'OPEN';
  badge.append(title, rect, text);
  includePoint(x, y);
  includePoint(x + width, y + height);
  svg.appendChild(badge);
}

function renderDataStateBadge(svg, comp, dataStateInfo, mode, includePoint) {
  if (!svg || !comp || !dataStateInfo) return;
  const bounds = componentBounds(comp);
  const x = bounds.left + 7;
  const y = bounds.top + 7;
  const badge = document.createElementNS(svgNS, 'g');
  badge.classList.add('data-state-badge', `data-state-${dataStateInfo.key}`);
  badge.dataset.id = comp.id;
  badge.dataset.mode = mode || '';
  const title = document.createElementNS(svgNS, 'title');
  const modeLabel = dataStateOverlayLabels[mode] || 'Status';
  title.textContent = `${modeLabel}: ${dataStateInfo.label}`;
  const circle = document.createElementNS(svgNS, 'circle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', 5);
  circle.setAttribute('fill', dataStateInfo.color);
  badge.append(title, circle);
  includePoint(x - 5, y - 5);
  includePoint(x + 5, y + 5);
  svg.appendChild(badge);
}

function getComponentDisplayLabel(key) {
  if (!key) return 'Component';
  if (key === '__other__') return 'Other Attributes';
  if (componentAttributeLabelMap.has(key)) return componentAttributeLabelMap.get(key);
  const meta = componentMeta[key];
  if (meta?.label) return meta.label;
  if (meta?.subtype) return formatAttributeLabel(meta.subtype);
  if (typeof key === 'string') {
    const parts = key.split('_');
    if (parts.length > 1) {
      return formatAttributeLabel(parts.slice(1).join('_'));
    }
    return formatAttributeLabel(key);
  }
  return 'Component';
}

function openViewModal() {
  const btn = document.getElementById('view-menu-btn');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  const hasComponents = componentAttributeList.length > 0;
  const closePromise = openModal({
    title: 'Component Views',
    primaryText: 'Done',
    secondaryText: null,
    closeOnBackdrop: true,
    variant: 'wide',
    render(body, controller) {
      body.classList.add('view-modal-body');
      if (!hasComponents) {
        const empty = document.createElement('p');
        empty.className = 'view-modal-empty';
        empty.textContent = 'No attributes are available to display.';
        controller.setPrimaryDisabled(true);
        body.appendChild(empty);
        return empty;
      }

      const layout = document.createElement('div');
      layout.className = 'view-modal-layout';

      const componentColumn = document.createElement('div');
      componentColumn.className = 'view-modal-column view-modal-components';
      const componentHeading = document.createElement('h3');
      componentHeading.className = 'view-modal-heading';
      componentHeading.textContent = 'Components';
      const componentListEl = document.createElement('div');
      componentListEl.className = 'view-component-list';
      componentColumn.append(componentHeading, componentListEl);

      const propertyColumn = document.createElement('div');
      propertyColumn.className = 'view-modal-column view-modal-properties';
      const propertyHeading = document.createElement('h3');
      propertyHeading.className = 'view-modal-heading';
      const propertyList = document.createElement('div');
      propertyList.className = 'view-property-list';
      propertyColumn.append(propertyHeading, propertyList);

      layout.append(componentColumn, propertyColumn);
      body.appendChild(layout);

      const buttonMap = new Map();
      let activeKey = selectedViewComponent;
      if (!activeKey || !componentAttributeOptions.has(activeKey)) {
        activeKey = componentAttributeList[0]?.key || null;
      }
      if (activeKey !== selectedViewComponent) {
        selectedViewComponent = activeKey;
        if (selectedViewComponent) setOneLineViewSetting(viewComponentStorageKey, selectedViewComponent);
      }

      function updateButtonStates() {
        buttonMap.forEach((button, key) => {
          const selected = key === activeKey;
          const options = componentAttributeOptions.get(key) || [];
          const hasSelection = options.some(opt => viewAttributes.has(opt.key));
          button.classList.toggle('is-active', selected);
           button.classList.toggle('has-selection', hasSelection);
          button.setAttribute('aria-pressed', String(selected));
          button.tabIndex = selected ? 0 : -1;
          const indicator = button.querySelector('.view-component-indicator');
          if (indicator) indicator.hidden = !hasSelection;
        });
      }

      function toggleAttribute(option, checked) {
        if (!option) return;
        markDatablockFormatCustom();
        if (checked) {
          viewAttributes.add(option.key);
        } else {
          viewAttributes.delete(option.key);
        }
        const persisted = sanitizeViewAttributeList(Array.from(viewAttributes));
        viewAttributes = new Set(persisted);
        setOneLineViewSetting(viewAttributeStorageKey, persisted);
        updateViewButtonLabel();
        render();
        updateButtonStates();
      }

      function renderProperties() {
        propertyList.innerHTML = '';
        if (!activeKey || !componentAttributeOptions.has(activeKey)) {
          propertyHeading.textContent = 'Properties';
          const empty = document.createElement('p');
          empty.className = 'view-modal-empty';
          empty.textContent = 'Select a component to see its properties.';
          propertyList.appendChild(empty);
          return;
        }
        const options = componentAttributeOptions.get(activeKey) || [];
        const componentLabel = getComponentDisplayLabel(activeKey);
        propertyHeading.textContent = `${componentLabel} Properties`;
        if (!options.length) {
          const empty = document.createElement('p');
          empty.className = 'view-modal-empty';
          empty.textContent = 'No properties available for this component.';
          propertyList.appendChild(empty);
          return;
        }
        options.forEach(opt => {
          const label = document.createElement('label');
          label.className = 'view-property-option';
          label.dataset.key = opt.key;
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = viewAttributes.has(opt.key);
          input.addEventListener('change', () => {
            label.classList.toggle('is-selected', input.checked);
            toggleAttribute(opt, input.checked);
          });
          const text = document.createElement('span');
          text.className = 'view-property-label';
          const baseLabel = opt.displayLabel || opt.label;
          text.textContent = opt.unit ? `${baseLabel} (${opt.unit})` : baseLabel;
          label.classList.toggle('is-selected', input.checked);
          label.append(input, text);
          propertyList.appendChild(label);
        });
      }

      function setActiveComponent(key) {
        if (!key || !componentAttributeOptions.has(key)) return;
        activeKey = key;
        selectedViewComponent = key;
        setOneLineViewSetting(viewComponentStorageKey, key);
        updateButtonStates();
        renderProperties();
      }

      componentAttributeList.forEach(entry => {
        if (!componentAttributeOptions.has(entry.key)) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'view-component-option';
        button.dataset.key = entry.key;
        button.setAttribute('aria-pressed', 'false');

        const labelText = entry.label || getComponentDisplayLabel(entry.key);
        const labelSpan = document.createElement('span');
        labelSpan.className = 'view-component-label';
        labelSpan.textContent = labelText;

        const indicator = document.createElement('span');
        indicator.className = 'view-component-indicator';
        indicator.textContent = 'Filtered';
        indicator.hidden = true;

        button.append(labelSpan, indicator);
        button.addEventListener('click', () => setActiveComponent(entry.key));
        button.addEventListener('keydown', event => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const currentIndex = componentAttributeList.findIndex(item => item.key === activeKey);
          if (currentIndex === -1) return;
          const offset = event.key === 'ArrowUp' ? -1 : 1;
          let nextIndex = currentIndex + offset;
          if (nextIndex < 0) nextIndex = 0;
          if (nextIndex >= componentAttributeList.length) nextIndex = componentAttributeList.length - 1;
          const nextKey = componentAttributeList[nextIndex]?.key;
          if (!nextKey) return;
          setActiveComponent(nextKey);
          const nextButton = buttonMap.get(nextKey);
          nextButton?.focus();
        });
        buttonMap.set(entry.key, button);
        componentListEl.appendChild(button);
      });

      updateButtonStates();
      renderProperties();

      const initialButton = buttonMap.get(activeKey);
      if (initialButton) {
        controller.setInitialFocus(initialButton);
      }

      return initialButton;
    }
  });
  if (closePromise && typeof closePromise.finally === 'function') {
    closePromise.finally(() => {
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  } else if (btn) {
    btn.setAttribute('aria-expanded', 'false');
  }
}

function openShapeModal() {
  const meta = componentMeta['annotation_custom_shape'] || {};
  const defaults = {
    width: Number.isFinite(Number(meta.width)) ? Number(meta.width) : 160,
    height: Number.isFinite(Number(meta.height)) ? Number(meta.height) : 100,
    ...defaultShapeProps,
    ...(meta.props || {})
  };
  let form;
  let shapeSelect;
  let widthInput;
  let heightInput;
  let strokeStyleSelect;
  let strokeWidthInput;
  let strokeColorInput;
  let fillColorInput;
  let fillOpacityInput;
  let cornerRadiusInput;

  const createLabeledField = (labelText, input, helpText) => {
    const label = document.createElement('label');
    label.className = 'shape-field';
    const span = document.createElement('span');
    span.className = 'shape-field-label';
    span.textContent = labelText;
    label.appendChild(span);
    label.appendChild(input);
    if (helpText) {
      const help = document.createElement('span');
      help.className = 'shape-field-help';
      help.textContent = helpText;
      label.appendChild(help);
    }
    return label;
  };

  openModal({
    title: 'Add Shape',
    primaryText: 'Add Shape',
    secondaryText: 'Cancel',
    closeOnBackdrop: true,
    render(body, controller) {
      form = document.createElement('form');
      form.className = 'shape-modal-form';
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'shape-modal-fieldset';
      const legend = document.createElement('legend');
      legend.textContent = 'Shape settings';
      fieldset.appendChild(legend);

      shapeSelect = document.createElement('select');
      shapeSelect.name = 'shapeType';
      [
        { value: 'rectangle', label: 'Rectangle' },
        { value: 'rounded', label: 'Rounded Rectangle' },
        { value: 'circle', label: 'Circle' }
      ].forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if ((defaults.shapeType || 'rectangle').toLowerCase() === opt.value) option.selected = true;
        shapeSelect.appendChild(option);
      });

      widthInput = document.createElement('input');
      widthInput.type = 'number';
      widthInput.name = 'width';
      widthInput.min = '1';
      widthInput.step = '1';
      widthInput.value = Number(defaults.width) || 160;

      heightInput = document.createElement('input');
      heightInput.type = 'number';
      heightInput.name = 'height';
      heightInput.min = '1';
      heightInput.step = '1';
      heightInput.value = Number(defaults.height) || 100;

      strokeStyleSelect = document.createElement('select');
      strokeStyleSelect.name = 'strokeStyle';
      [
        { value: 'solid', label: 'Solid' },
        { value: 'dashed', label: 'Dashed' },
        { value: 'dotted', label: 'Dotted' }
      ].forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if ((defaults.strokeStyle || 'solid').toLowerCase() === opt.value) option.selected = true;
        strokeStyleSelect.appendChild(option);
      });

      strokeWidthInput = document.createElement('input');
      strokeWidthInput.type = 'number';
      strokeWidthInput.name = 'strokeWidth';
      strokeWidthInput.min = '0.1';
      strokeWidthInput.step = '0.5';
      strokeWidthInput.value = Number(defaults.strokeWidth) || 2;

      strokeColorInput = document.createElement('input');
      strokeColorInput.type = 'color';
      strokeColorInput.name = 'strokeColor';
      strokeColorInput.value = defaults.strokeColor || '#333333';

      fillColorInput = document.createElement('input');
      fillColorInput.type = 'color';
      fillColorInput.name = 'fillColor';
      fillColorInput.value = defaults.fillColor && defaults.fillColor !== 'none'
        ? defaults.fillColor
        : '#ffffff';

      fillOpacityInput = document.createElement('input');
      fillOpacityInput.type = 'number';
      fillOpacityInput.name = 'fillOpacity';
      fillOpacityInput.min = '0';
      fillOpacityInput.max = '1';
      fillOpacityInput.step = '0.05';
      const defaultOpacity = Number(defaults.fillOpacity);
      fillOpacityInput.value = Number.isFinite(defaultOpacity) ? defaultOpacity : 1;

      cornerRadiusInput = document.createElement('input');
      cornerRadiusInput.type = 'number';
      cornerRadiusInput.name = 'cornerRadius';
      cornerRadiusInput.min = '0';
      cornerRadiusInput.step = '1';
      cornerRadiusInput.value = Number(defaults.cornerRadius) || 12;

      fieldset.appendChild(createLabeledField('Shape Type', shapeSelect));
      fieldset.appendChild(createLabeledField('Width (px)', widthInput, 'For circles width is the diameter.'));
      fieldset.appendChild(createLabeledField('Height (px)', heightInput, 'Circles keep height equal to width.'));
      fieldset.appendChild(createLabeledField('Line Style', strokeStyleSelect));
      fieldset.appendChild(createLabeledField('Line Weight', strokeWidthInput));
      fieldset.appendChild(createLabeledField('Line Color', strokeColorInput));
      fieldset.appendChild(createLabeledField('Fill Color', fillColorInput));
      fieldset.appendChild(createLabeledField('Fill Opacity', fillOpacityInput, '0 is transparent, 1 is opaque.'));
      fieldset.appendChild(createLabeledField('Corner Radius', cornerRadiusInput, 'Applies to rounded rectangles.'));

      form.appendChild(fieldset);
      controller.registerForm(form);
      controller.setInitialFocus(shapeSelect);
      body.appendChild(form);

      const syncControlState = () => {
        const shape = shapeSelect.value;
        const isCircle = shape === 'circle';
        heightInput.disabled = isCircle;
        if (isCircle) {
          heightInput.value = widthInput.value;
        }
        cornerRadiusInput.disabled = shape !== 'rounded';
      };

      shapeSelect.addEventListener('change', () => {
        syncControlState();
      });
      widthInput.addEventListener('input', () => {
        if (shapeSelect.value === 'circle') {
          heightInput.value = widthInput.value;
        }
      });
      syncControlState();

      return shapeSelect;
    },
    onSubmit() {
      if (!form) return false;
      const data = new FormData(form);
      const shapeType = String(data.get('shapeType') || defaults.shapeType || 'rectangle').toLowerCase();
      let width = Number.parseFloat(data.get('width'));
      let height = Number.parseFloat(data.get('height'));
      let strokeWidth = Number.parseFloat(data.get('strokeWidth'));
      const strokeStyle = String(data.get('strokeStyle') || defaults.strokeStyle || 'solid').toLowerCase();
      const strokeColor = data.get('strokeColor') || defaults.strokeColor || '#333333';
      const fillColor = data.get('fillColor') || defaults.fillColor || '#ffffff';
      let fillOpacity = Number.parseFloat(data.get('fillOpacity'));
      let cornerRadius = Number.parseFloat(data.get('cornerRadius'));

      if (!Number.isFinite(width) || width <= 0) width = Number(defaults.width) || 160;
      if (!Number.isFinite(height) || height <= 0) height = Number(defaults.height) || 100;
      if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) strokeWidth = Number(defaults.strokeWidth) || 1;
      if (!Number.isFinite(fillOpacity)) {
        const fallback = Number(defaults.fillOpacity);
        fillOpacity = Number.isFinite(fallback) ? fallback : 1;
      }
      fillOpacity = Math.max(0, Math.min(1, fillOpacity));
      if (!Number.isFinite(cornerRadius) || cornerRadius < 0) cornerRadius = Number(defaults.cornerRadius) || 0;
      if (shapeType === 'circle') {
        height = width;
      }

      const comp = addComponent({
        type: 'annotation',
        subtype: 'annotation_custom_shape',
        skipHistory: true,
        placeAtViewportCenter: true
      });
      if (!comp) return false;

      comp.width = width;
      comp.height = height;
      comp.shapeType = shapeType;
      comp.strokeStyle = strokeStyle;
      comp.strokeWidth = strokeWidth;
      comp.strokeColor = typeof strokeColor === 'string' ? strokeColor : defaults.strokeColor;
      comp.fillColor = typeof fillColor === 'string' ? fillColor : defaults.fillColor;
      comp.fillOpacity = fillOpacity;
      comp.cornerRadius = cornerRadius;
      ensureShapeDefaults(comp);

      pushHistory();
      render();
      save();
      selectComponent(comp);
      return true;
    }
  });
}

function updateViewButtonLabel() {
  const btn = document.getElementById('view-menu-btn');
  if (!btn) return;
  const count = viewAttributes.size;
  btn.textContent = count ? `Views (${count})` : 'Views';
  const hasOptions = attributeOptions.length > 0 && componentAttributeList.length > 0;
  btn.disabled = !hasOptions;
  if (!hasOptions) {
    btn.title = 'No component properties are available to view';
  } else {
    btn.title = 'Select component properties to display';
  }
}

function refreshAttributeOptions() {
  cachedStudyResults = getStudies();
  const optionMap = new Map();
  const componentOptionMap = new Map();
  const componentOptionSourceMap = new Map();
  const componentLabelMap = new Map();
  const componentById = new Map();

  const registerOption = key => {
    if (!key) return null;
    if (attributeIgnoreKeys.has(key)) return null;
    const normalized = sanitizeViewAttributeKey(key);
    if (!normalized) return null;
    if (optionMap.has(normalized)) return optionMap.get(normalized);
    const override = attributeDisplayOverrides[normalized];
    const label = override?.label || formatAttributeLabel(normalized);
    const unit = override && Object.prototype.hasOwnProperty.call(override, 'unit')
      ? override.unit
      : inferAttributeUnit(normalized);
    const option = { key: normalized, label, unit };
    optionMap.set(normalized, option);
    return option;
  };

  const registerComponentLabel = (compKey, fallbackLabel) => {
    if (!compKey) return;
    if (componentLabelMap.has(compKey)) return;
    const meta = componentMeta[compKey];
    if (meta?.label) {
      componentLabelMap.set(compKey, meta.label);
      return;
    }
    if (typeof fallbackLabel === 'string' && fallbackLabel.trim()) {
      componentLabelMap.set(compKey, fallbackLabel.trim());
      return;
    }
    if (meta?.subtype) {
      componentLabelMap.set(compKey, formatAttributeLabel(meta.subtype));
      return;
    }
    if (typeof compKey === 'string') {
      const parts = compKey.split('_');
      const formatted = formatAttributeLabel(parts.length > 1 ? parts.slice(1).join('_') : compKey);
      componentLabelMap.set(compKey, formatted);
      return;
    }
    componentLabelMap.set(compKey, 'Component');
  };

  const addComponentKey = (compKey, key, sourceHint = null) => {
    if (!compKey) return;
    const option = registerOption(key);
    if (!option) return;
    if (!componentOptionMap.has(compKey)) {
      componentOptionMap.set(compKey, new Map());
    }
    componentOptionMap.get(compKey).set(option.key, option);
    if (!componentOptionSourceMap.has(compKey)) {
      componentOptionSourceMap.set(compKey, new Map());
    }
    const sourceMap = componentOptionSourceMap.get(compKey);
    if (!sourceMap.has(option.key)) {
      sourceMap.set(option.key, new Set());
    }
    if (sourceHint) {
      sourceMap.get(option.key).add(sourceHint);
    }
  };

  Object.entries(componentMeta).forEach(([compKey, meta]) => {
    registerComponentLabel(compKey, meta?.label);
    Object.entries(meta.props || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'object') return;
      addComponentKey(compKey, key, 'template');
    });
  });

  const allSheets = Array.isArray(sheets) ? sheets : [];
  allSheets.forEach(sheet => {
    (sheet.components || []).forEach(comp => {
      if (!comp) return;
      const compKey = comp.subtype || comp.type;
      if (!compKey) return;
      if (comp.id) componentById.set(comp.id, comp);
      const fallbackLabel = componentMeta[compKey]?.label || comp.type || comp.label;
      registerComponentLabel(compKey, fallbackLabel);
      Object.entries(comp).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (typeof value === 'object') return;
        addComponentKey(compKey, key, 'component');
      });
      if (comp.props && typeof comp.props === 'object') {
        Object.entries(comp.props).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (typeof value === 'object') return;
          addComponentKey(compKey, key, 'componentProps');
        });
      }
    });
  });

  const registerStudyAttributes = (namespace, data) => {
    if (!data || typeof data !== 'object') return;
    Object.entries(data).forEach(([id, record]) => {
      const comp = componentById.get(id);
      if (!comp) return;
      const compKey = comp.subtype || comp.type;
      if (!compKey) return;
      if (!record || typeof record !== 'object') return;
      Object.entries(record).forEach(([prop, value]) => {
        if (value === undefined || value === null) return;
        if (typeof value === 'object') return;
        const combinedKey = `${namespace}.${prop}`;
        const option = registerOption(combinedKey);
        if (!option) return;
        addComponentKey(compKey, option.key, `study:${namespace}`);
      });
    });
  };

  registerStudyAttributes('arcFlash', cachedStudyResults?.arcFlash);
  registerStudyAttributes('shortCircuit', cachedStudyResults?.shortCircuit);
  const reliabilityStats = cachedStudyResults?.reliability?.componentStats;
  if (reliabilityStats && typeof reliabilityStats === 'object') {
    const mapped = {};
    Object.entries(reliabilityStats).forEach(([id, stats]) => {
      if (!stats || typeof stats !== 'object') return;
      mapped[id] = {
        availability: stats.availability,
        downtime: stats.downtime
      };
    });
    registerStudyAttributes('reliability', mapped);
  }

  viewAttributes = new Set(sanitizeViewAttributeList(Array.from(viewAttributes)));
  viewAttributes.forEach(key => registerOption(key));

  attributeOptions = Array.from(optionMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  attributeOptionsMap.clear();
  attributeOptions.forEach(opt => attributeOptionsMap.set(opt.key, opt));

  componentAttributeOptions = new Map();
  componentAttributeList = [];
  componentAttributeLabelMap = new Map();
  componentAttributeDisplayOverrides = new Map();

  componentOptionMap.forEach((options, compKey) => {
    const clones = Array.from(options.values()).map(opt => ({ ...opt }));
    const sourceMap = componentOptionSourceMap.get(compKey) || new Map();
    const grouped = new Map();
    const displayMap = new Map();

    clones.forEach(opt => {
      const keyId = `${opt.label}__${opt.unit || ''}`;
      if (!grouped.has(keyId)) grouped.set(keyId, []);
      grouped.get(keyId).push(opt);
    });

    grouped.forEach(list => {
      if (list.length === 1) {
        const [single] = list;
        single.displayLabel = single.label;
        displayMap.set(single.key, single.displayLabel);
        return;
      }
      list.forEach(opt => {
        const sourceSet = sourceMap.get(opt.key);
        const sources = sourceSet ? Array.from(sourceSet) : [];
        const contextParts = sources.map(formatOptionSourceLabel).filter(Boolean);
        if (!contextParts.length) {
          const derived = deriveOptionContextLabel(opt.key, opt.label);
          if (derived) contextParts.push(derived);
        }
        const context = contextParts.join(' • ');
        opt.displayLabel = context ? `${opt.label} – ${context}` : opt.label;
        displayMap.set(opt.key, opt.displayLabel);
      });
    });

    clones.forEach(opt => {
      if (!displayMap.has(opt.key)) {
        opt.displayLabel = opt.label;
        displayMap.set(opt.key, opt.displayLabel);
      }
    });

    clones.sort((a, b) => {
      const labelA = a.displayLabel || a.label;
      const labelB = b.displayLabel || b.label;
      return labelA.localeCompare(labelB);
    });

    componentAttributeOptions.set(compKey, clones);
    const label = componentLabelMap.get(compKey) || getComponentDisplayLabel(compKey);
    componentAttributeLabelMap.set(compKey, label);
    componentAttributeList.push({ key: compKey, label });
    componentAttributeDisplayOverrides.set(compKey, displayMap);
  });

  const orphanKeys = new Set(viewAttributes);
  componentAttributeOptions.forEach(options => {
    options.forEach(opt => orphanKeys.delete(opt.key));
  });
  if (orphanKeys.size) {
    const orphanOptions = Array.from(orphanKeys)
      .map(key => attributeOptionsMap.get(key))
      .filter(Boolean)
      .map(opt => ({ ...opt, displayLabel: opt.label }))
      .sort((a, b) => (a.displayLabel || a.label).localeCompare(b.displayLabel || b.label));
    if (orphanOptions.length) {
      const orphanLabel = 'Other Attributes';
      componentAttributeOptions.set('__other__', orphanOptions);
      componentAttributeLabelMap.set('__other__', orphanLabel);
      componentAttributeList.push({ key: '__other__', label: orphanLabel });
      componentAttributeDisplayOverrides.set('__other__', new Map(orphanOptions.map(opt => [opt.key, opt.displayLabel || opt.label])));
    }
  }

  componentAttributeList.sort((a, b) => {
    if (a.key === '__other__') return 1;
    if (b.key === '__other__') return -1;
    return a.label.localeCompare(b.label);
  });

  if (selectedViewComponent && !componentAttributeOptions.has(selectedViewComponent)) {
    selectedViewComponent = componentAttributeList[0]?.key || null;
    if (selectedViewComponent) {
      setOneLineViewSetting(viewComponentStorageKey, selectedViewComponent);
    }
  }

  updateViewButtonLabel();
}

function portPosition(c, portIndex) {
  const meta = resolveComponentMeta(c);
  const w = c.width || compWidth;
  const h = c.height || compHeight;
  const ports = c.ports || meta.ports;
  const port = ports?.[portIndex];
  if (!port) {
    return { x: c.x + w / 2, y: c.y + h / 2 };
  }
  let { x, y } = port;
  if (c.flipped) x = w - x;
  let px = c.x + x;
  let py = c.y + y;
  const angle = (c.rotation || 0) * Math.PI / 180;
  if (angle) {
    const cx = c.x + w / 2;
    const cy = c.y + h / 2;
    const dx = px - cx;
    const dy = py - cy;
    px = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
    py = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  return { x: px, y: py };
}

function portDirection(c, portIndex) {
  const pos = portPosition(c, portIndex);
  if (!pos) return null;
  const w = c.width || compWidth;
  const h = c.height || compHeight;
  const cx = c.x + w / 2;
  const cy = c.y + h / 2;
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? 'left' : 'right';
  }
  return dy < 0 ? 'top' : 'bottom';
}

function normalizePortIndex(port) {
  const idx = Number(port);
  return Number.isFinite(idx) ? idx : 0;
}

function portInUse(component, portIndex, skipConn = null) {
  const idx = normalizePortIndex(portIndex);
  if ((component.connections || []).some(conn => conn !== skipConn && normalizePortIndex(conn.sourcePort) === idx)) {
    return true;
  }
  return components.some(comp => (comp.connections || []).some(conn => {
    if (conn === skipConn) return false;
    return conn.target === component.id && normalizePortIndex(conn.targetPort) === idx;
  }));
}

function appendConnectedTerminalBridges(group, component, meta) {
  if (!group || !component || component.type === 'annotation' || isBusComponent(component) || isConductorSegmentComponent(component)) return;
  const width = Number(component.width) || compWidth;
  const height = Number(component.height) || compHeight;
  const ports = component.ports || meta?.ports || [];
  const edgeTolerance = 0.75;
  const outsideOverlap = 3;
  const profile = getIndustrySymbolProfile(component, meta);
  const insideOverlap = ['transformer', 'transformer3', 'panel'].includes(profile) ? 20 : 14;
  ports.forEach((port, portIndex) => {
    if (!port || !portInUse(component, portIndex)) return;
    const px = Number(port.x);
    const py = Number(port.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    let inwardX = 0;
    let inwardY = 0;
    if (Math.abs(py) <= edgeTolerance) inwardY = 1;
    else if (Math.abs(py - height) <= edgeTolerance) inwardY = -1;
    else if (Math.abs(px) <= edgeTolerance) inwardX = 1;
    else if (Math.abs(px - width) <= edgeTolerance) inwardX = -1;
    else {
      const dx = (width / 2) - px;
      const dy = (height / 2) - py;
      const distance = Math.hypot(dx, dy);
      if (!distance) return;
      inwardX = dx / distance;
      inwardY = dy / distance;
    }
    const bridge = document.createElementNS(svgNS, 'line');
    bridge.setAttribute('x1', component.x + px - (inwardX * outsideOverlap));
    bridge.setAttribute('y1', component.y + py - (inwardY * outsideOverlap));
    bridge.setAttribute('x2', component.x + px + (inwardX * insideOverlap));
    bridge.setAttribute('y2', component.y + py + (inwardY * insideOverlap));
    bridge.setAttribute('stroke', '#111827');
    bridge.setAttribute('stroke-width', '3');
    bridge.setAttribute('stroke-linecap', 'square');
    bridge.setAttribute('pointer-events', 'none');
    bridge.classList.add('component-terminal-bridge');
    bridge.dataset.portIndex = String(portIndex);
    bridge.dataset.portX = String(component.x + px);
    bridge.dataset.portY = String(component.y + py);
    group.appendChild(bridge);
  });
}

const transformerVoltageKeyMap = {
  two_winding: ['volts_primary', 'volts_secondary'],
  auto_transformer: ['volts_primary', 'volts_secondary'],
  grounding_transformer: ['volts_primary', 'volts_secondary'],
  three_winding: ['volts_hv', 'volts_lv', 'volts_tv']
};

function getTransformerConnectionSetting(transformer, role) {
  if (!transformer || !role) return null;
  const key = `${role}_connection`;
  const direct = transformer[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (transformer.props && typeof transformer.props[key] === 'string') {
    const value = transformer.props[key].trim();
    if (value) return value;
  }
  const metaProps = componentMeta[transformer.subtype]?.props || {};
  const metaValue = metaProps[key];
  if (typeof metaValue === 'string' && metaValue.trim()) return metaValue.trim();
  return null;
}

function getTransformerPortRole(transformer, portIndex) {
  if (!transformer || transformer.type !== 'transformer') return null;
  const idx = Number(portIndex);
  if (!Number.isFinite(idx)) return null;
  if (transformer.subtype === 'three_winding') {
    if (idx === 0) return 'primary';
    if (idx === 1) return 'secondary';
    if (idx === 2) return 'tertiary';
  }
  if (idx === 0) return 'primary';
  if (idx === 1) return 'secondary';
  if (idx === 2) return 'tertiary';
  return null;
}

function buildTransformerPortLabel(transformer, portIndex) {
  const role = getTransformerPortRole(transformer, portIndex);
  if (!role) return null;
  let roleLabel;
  switch (role) {
    case 'primary':
      roleLabel = 'Primary';
      break;
    case 'secondary':
      roleLabel = 'Secondary';
      break;
    case 'tertiary':
      roleLabel = 'Tertiary';
      break;
    default:
      roleLabel = role;
      break;
  }
  const config = getTransformerConnectionSetting(transformer, role);
  return config ? `${roleLabel} (${config})` : roleLabel;
}

function parseVoltageNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const str = String(value);
  const match = str.replace(/[,\s]+/g, ' ').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const num = Number.parseFloat(match[0]);
  return Number.isFinite(num) ? num : null;
}

function resolveTransformerVoltageValue(transformer, portIndex) {
  if (!transformer) return null;
  const metaProps = componentMeta[transformer.subtype]?.props || {};
  const subtypeKeys = transformerVoltageKeyMap[transformer.subtype] || [];
  const fallbacks = portIndex === 0
    ? ['volts_primary', 'voltage_primary', 'primary_voltage', 'volts_hv', 'voltage']
    : portIndex === 1
      ? ['volts_secondary', 'voltage_secondary', 'secondary_voltage', 'volts_lv', 'voltage']
      : ['volts_tv', 'volts_tertiary', 'tertiary_voltage', 'volts_lv', 'voltage'];
  const keys = [subtypeKeys[portIndex], ...fallbacks];
  const seen = new Set();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const value = transformer[key] ?? transformer.props?.[key] ?? metaProps[key];
    if (parseVoltageNumber(value) !== null) return value;
  }
  return null;
}

function formatVoltageString(num) {
  if (!Number.isFinite(num)) return null;
  const rounded = Number(num.toFixed(4));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function formatVoltage(volts) {
  if (!Number.isFinite(volts)) return '';
  const abs = Math.abs(volts);
  if (abs >= 1000) {
    const kv = Number((volts / 1000).toFixed(3));
    return `${kv} kV`;
  }
  const value = Number(volts.toFixed(1));
  return `${value} V`;
}

function resolveNominalVoltage(component) {
  if (!component || typeof component !== 'object') return null;
  const resolved = resolveComponentVoltageVolts(component, { includeOperatingVoltage: false });
  if (Number.isFinite(resolved) && resolved > 0) return resolved;
  return null;
}

function resolveVoltageMagnitude(component) {
  if (!component || typeof component !== 'object') return null;
  const raw = component.voltage_mag;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const values = Object.values(raw)
      .map(val => Number(val))
      .filter(val => Number.isFinite(val) && val > 0);
    if (values.length) {
      const total = values.reduce((sum, val) => sum + val, 0);
      return total / values.length;
    }
  }
  return null;
}


function getFiniteVoltageMagnitudes(voltageMag) {
  if (typeof voltageMag === 'number') {
    return Number.isFinite(voltageMag) ? [voltageMag] : [];
  }
  if (!voltageMag || typeof voltageMag !== 'object') return [];
  const mags = [];
  for (const value of Object.values(voltageMag)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) mags.push(numeric);
  }
  return mags;
}

function getVoltageMagnitudeEntries(voltageMag) {
  if (!voltageMag || typeof voltageMag !== 'object') return [];
  const entries = [];
  for (const [phase, value] of Object.entries(voltageMag)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) entries.push([phase, numeric]);
  }
  return entries;
}

function sanitizeOverlayStudyFields(component) {
  if (!component || typeof component !== 'object') return component;
  const cleanedMags = getFiniteVoltageMagnitudes(component.voltage_mag);
  if (component.voltage_mag !== undefined && cleanedMags.length === 0) {
    delete component.voltage_mag;
  }
  return component;
}
function computeComponentOperatingVoltage(component) {
  if (!component) return null;
  const nominal = resolveNominalVoltage(component);
  if (nominal === null) return null;
  const magnitude = resolveVoltageMagnitude(component);
  if (magnitude !== null) {
    return nominal * magnitude;
  }
  return nominal;
}

function syncSourceVoltageFields(component, preferredDriver = null) {
  if (!isSourceComponent(component)) return false;
  const driverNames = [
    'source_voltage_base',
    'volts',
    'voltage',
    'voltage_primary',
    'voltage_secondary',
    'nominalVoltage',
    'nominal_voltage',
    'baseKV',
    'kV',
    'kv',
    'prefault_voltage'
  ];
  const orderedDrivers = preferredDriver && driverNames.includes(preferredDriver)
    ? [preferredDriver, ...driverNames.filter(name => name !== preferredDriver)]
    : driverNames;
  const readValue = name => {
    if (component && Object.prototype.hasOwnProperty.call(component, name)) return component[name];
    if (component?.props && Object.prototype.hasOwnProperty.call(component.props, name)) return component.props[name];
    return null;
  };
  let baseKv = null;
  for (const name of orderedDrivers) {
    const raw = readValue(name);
    if (raw === null || raw === undefined || raw === '') continue;
    const kv = toBaseKV(raw);
    if (Number.isFinite(kv) && kv > 0) {
      baseKv = kv;
      break;
    }
  }
  if (!Number.isFinite(baseKv) || baseKv <= 0) return false;
  const kv = Number(baseKv.toFixed(6));
  const volts = Number((kv * 1000).toFixed(3));
  const formattedVolts = formatVoltageString(volts);
  let changed = false;
  const assign = (holder, key, value) => {
    if (!holder || typeof holder !== 'object') return;
    if (holder[key] === value) return;
    holder[key] = value;
    changed = true;
  };
  if (!component.props || typeof component.props !== 'object') component.props = {};
  assign(component, 'voltage', formattedVolts);
  assign(component, 'volts', volts);
  assign(component, 'baseKV', kv);
  assign(component, 'kV', kv);
  assign(component, 'kv', kv);
  assign(component, 'prefault_voltage', kv);
  assign(component.props, 'voltage', formattedVolts);
  assign(component.props, 'volts', volts);
  assign(component.props, 'baseKV', kv);
  assign(component.props, 'kV', kv);
  assign(component.props, 'kv', kv);
  assign(component.props, 'prefault_voltage', kv);
  if (Object.prototype.hasOwnProperty.call(component, 'source_voltage_base')) {
    assign(component, 'source_voltage_base', kv);
  }
  if (Object.prototype.hasOwnProperty.call(component.props, 'source_voltage_base')) {
    assign(component.props, 'source_voltage_base', kv);
  }
  return changed;
}

function formatOperatingVoltage(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num)) return Number(num.toFixed(2));
  return value;
}

let pendingImplicitHistoryUpdate = false;
let implicitHistoryUpdateScheduled = false;

function scheduleImplicitHistoryUpdate() {
  if (implicitHistoryUpdateScheduled) {
    pendingImplicitHistoryUpdate = true;
    return;
  }
  if (historyController.index < 0 || historyController.index >= historyController.length) return;
  pendingImplicitHistoryUpdate = true;
  implicitHistoryUpdateScheduled = true;
  Promise.resolve().then(() => {
    implicitHistoryUpdateScheduled = false;
    if (!pendingImplicitHistoryUpdate) return;
    pendingImplicitHistoryUpdate = false;
    if (historyController.index < 0 || historyController.index >= historyController.length) return;
    historyController.replaceCurrent();
  });
}

function applyInheritedBaseVoltage(target, resolvedVolts) {
  if (!target || !Number.isFinite(resolvedVolts) || resolvedVolts <= 0) return false;
  const kv = Number((resolvedVolts / 1000).toFixed(6));
  let changed = false;
  const assignValue = (holder, key, value) => {
    if (!holder || typeof holder !== 'object') return false;
    if (holder[key] === value) return false;
    holder[key] = value;
    return true;
  };
  changed = assignValue(target, 'baseKV', kv) || changed;
  changed = assignValue(target, 'kV', kv) || changed;
  changed = assignValue(target, 'kv', kv) || changed;
  changed = assignValue(target, 'prefault_voltage', kv) || changed;
  if (!target.props || typeof target.props !== 'object') target.props = {};
  changed = assignValue(target.props, 'baseKV', kv) || changed;
  changed = assignValue(target.props, 'kV', kv) || changed;
  changed = assignValue(target.props, 'kv', kv) || changed;
  changed = assignValue(target.props, 'prefault_voltage', kv) || changed;
  return changed;
}

function assignInheritedVoltage(target, voltageValue, connection = null, resolvedVolts = null) {
  if (!target) return false;
  const num = parseVoltageNumber(voltageValue);
  if (num === null) return false;
  const formatted = formatVoltageString(num);
  if (!formatted) return false;
  const normalizedVolts = Number.isFinite(resolvedVolts)
    ? resolvedVolts
    : normalizeVoltageToVolts(voltageValue ?? num);
  if (!target.props || typeof target.props !== 'object') target.props = {};
  const baseChanged = applyInheritedBaseVoltage(target, normalizedVolts);
  const current = target.voltage ?? '';
  const changed = String(current) !== formatted;
  const connectionChanged = connection ? String(connection.voltage ?? '') !== formatted : false;
  target.voltage = formatted;
  target.props.voltage = formatted;
  target.props.volts = formatted;
  if (connection) {
    if (!connection.props || typeof connection.props !== 'object') connection.props = {};
    connection.voltage = formatted;
    connection.props.voltage = formatted;
    connection.props.volts = formatted;
  }
  if (changed || connectionChanged || baseChanged) scheduleImplicitHistoryUpdate();
  return changed || connectionChanged || baseChanged;
}

function propagateTransformerVoltages(comps) {
  if (!Array.isArray(comps) || !comps.length) return;
  const byId = new Map();
  comps.forEach(comp => { if (comp?.id) byId.set(comp.id, comp); });
  const inbound = new Map();
  comps.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      if (!byId.has(conn.target)) return;
      if (!inbound.has(conn.target)) inbound.set(conn.target, []);
      inbound.get(conn.target).push({ from: comp, connection: conn });
    });
  });

  comps.forEach(transformer => {
    if (!transformer || transformer.type !== 'transformer') return;
    const ports = transformer.ports || componentMeta[transformer.subtype]?.ports || [];
    const portCount = ports.length || 2;
    const secondaryPorts = [];
    for (let idx = 0; idx < portCount; idx += 1) {
      if (idx === 0 && portCount > 1) continue;
      secondaryPorts.push(idx);
    }
    secondaryPorts.forEach(portIdx => {
      const voltageValue = resolveTransformerVoltageValue(transformer, portIdx);
      if (voltageValue === null) return;
      const voltageInVolts = normalizeVoltageToVolts(voltageValue);
      const resolvedVolts = Number.isFinite(voltageInVolts) && voltageInVolts > 0
        ? voltageInVolts
        : null;
      const queue = [];
      const visited = new Set([transformer.id]);
      (transformer.connections || []).forEach(conn => {
        if (normalizePortIndex(conn.sourcePort) !== portIdx) return;
        const target = byId.get(conn.target);
        if (!target || target.type === 'transformer') return;
        queue.push({ component: target, connection: conn });
      });
      (inbound.get(transformer.id) || []).forEach(entry => {
        if (normalizePortIndex(entry.connection?.targetPort) !== portIdx) return;
        const sourceComp = entry.from;
        if (!sourceComp || sourceComp.type === 'transformer') return;
        queue.push({ component: sourceComp, connection: entry.connection });
      });
      while (queue.length) {
        const { component: current, connection } = queue.shift();
        if (!current || visited.has(current.id)) continue;
        visited.add(current.id);
        assignInheritedVoltage(current, voltageValue, connection, resolvedVolts);
        (current.connections || []).forEach(conn => {
          const neighbor = byId.get(conn.target);
          if (!neighbor || neighbor.type === 'transformer' || visited.has(neighbor.id)) return;
          queue.push({ component: neighbor, connection: conn });
        });
        (inbound.get(current.id) || []).forEach(entry => {
          const neighbor = entry.from;
          if (!neighbor || neighbor.type === 'transformer' || visited.has(neighbor.id)) return;
          queue.push({ component: neighbor, connection: entry.connection });
        });
      }
    });
  });
}

function gatherNeighborEntries(component, byId, inbound) {
  const neighbors = [];
  if (!component || !byId) return neighbors;
  (component.connections || []).forEach(conn => {
    if (!conn || !byId.has(conn.target)) return;
    neighbors.push({ component: byId.get(conn.target), connection: conn });
  });
  const inboundEntries = component?.id ? inbound.get(component.id) : null;
  (inboundEntries || []).forEach(entry => {
    if (!entry || !entry.from) return;
    neighbors.push({ component: entry.from, connection: entry.connection });
  });
  return neighbors;
}

function propagateSourceVoltagesToBuses(comps) {
  if (!Array.isArray(comps) || !comps.length) return;
  const byId = new Map();
  comps.forEach(comp => { if (comp?.id) byId.set(comp.id, comp); });
  if (!byId.size) return;

  const inbound = new Map();
  comps.forEach(comp => {
    (comp?.connections || []).forEach(conn => {
      if (!conn || !conn.target || !byId.has(conn.target)) return;
      if (!inbound.has(conn.target)) inbound.set(conn.target, []);
      inbound.get(conn.target).push({ from: comp, connection: conn });
    });
  });

  comps.forEach(source => {
    if (!isSourceComponent(source)) return;
    let voltageValue = computeComponentOperatingVoltage(source);
    if (!Number.isFinite(voltageValue)) voltageValue = resolveNominalVoltage(source);
    if (!Number.isFinite(voltageValue)) voltageValue = parseVoltageNumber(source?.voltage);
    if (!Number.isFinite(voltageValue)) voltageValue = parseVoltageNumber(source?.props?.voltage || source?.props?.volts);
    if (!Number.isFinite(voltageValue)) return;
    const voltageInVolts = normalizeVoltageToVolts(voltageValue);
    const resolvedVolts = Number.isFinite(voltageInVolts) && voltageInVolts > 0
      ? voltageInVolts
      : null;

    const visited = new Set([source.id]);
    const queue = gatherNeighborEntries(source, byId, inbound);
    while (queue.length) {
      const { component: neighbor, connection } = queue.shift();
      if (!neighbor || visited.has(neighbor.id)) continue;
      visited.add(neighbor.id);
      if (neighbor.type === 'transformer') continue;
      if (isSourceComponent(neighbor)) continue;
      if (isBusComponent(neighbor)) {
        assignInheritedVoltage(neighbor, voltageValue, connection, resolvedVolts);
      }
      gatherNeighborEntries(neighbor, byId, inbound).forEach(entry => {
        if (!entry.component || visited.has(entry.component.id)) return;
        queue.push(entry);
      });
    }
  });
}

function applyTransformerVoltages(scope = sheets) {
  if (!scope) return;
  if (Array.isArray(scope) && scope.length && Array.isArray(scope[0]?.components)) {
    scope.forEach(sheet => propagateTransformerVoltages(sheet.components || []));
  } else if (Array.isArray(scope)) {
    propagateTransformerVoltages(scope);
  } else if (scope?.components) {
    propagateTransformerVoltages(scope.components);
  }
}

function captureBusAnchors(bus) {
  const anchors = [];
  (bus.connections || []).forEach(conn => {
    const index = normalizePortIndex(conn.sourcePort);
    anchors.push({ type: 'source', conn, point: portPosition(bus, index) });
  });
  components.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      if (conn.target !== bus.id) return;
      const index = normalizePortIndex(conn.targetPort);
      anchors.push({ type: 'target', conn, point: portPosition(bus, index) });
    });
  });
  return anchors;
}

function reassignBusAnchors(bus, anchors = []) {
  if (!anchors.length) return;
  const ports = bus.ports || [];
  if (!ports.length) return;
  const worldPorts = ports.map((_, idx) => ({ idx, point: portPosition(bus, idx) }));
  anchors.forEach(anchor => {
    let best = null;
    let bestDist = Infinity;
    worldPorts.forEach(port => {
      const dx = port.point.x - anchor.point.x;
      const dy = port.point.y - anchor.point.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = port;
      }
    });
    if (!best) return;
    if (anchor.type === 'source') {
      if (normalizePortIndex(anchor.conn.sourcePort) !== best.idx) {
        anchor.conn.sourcePort = best.idx;
        delete anchor.conn.mid;
        delete anchor.conn.dir;
      }
    } else if (anchor.type === 'target') {
      if (normalizePortIndex(anchor.conn.targetPort) !== best.idx) {
        anchor.conn.targetPort = best.idx;
        delete anchor.conn.mid;
        delete anchor.conn.dir;
      }
    }
  });
}

function nearestPorts(src, tgt) {
  const srcPorts = src.ports || componentMeta[src.subtype]?.ports || [{ x: (src.width || compWidth) / 2, y: (src.height || compHeight) / 2 }];
  const tgtPorts = tgt.ports || componentMeta[tgt.subtype]?.ports || [{ x: (tgt.width || compWidth) / 2, y: (tgt.height || compHeight) / 2 }];
  let min = Infinity;
  let best = [0, 0];
  srcPorts.forEach((_, i) => {
    tgtPorts.forEach((_, j) => {
      const sp = portPosition(src, i);
      const tp = portPosition(tgt, j);
      const dx = sp.x - tp.x;
      const dy = sp.y - tp.y;
      const d = dx * dx + dy * dy;
      if (d < min) {
        min = d;
        best = [i, j];
      }
    });
  });
  return best;
}

function nearestPortToPoint(x, y, exclude) {
  let min = Infinity;
  let best = null;
  components.forEach(c => {
    if (exclude && c === exclude.component) return;
    const ports = c.ports || resolveComponentMeta(c)?.ports || [];
    ports.forEach((p, idx) => {
      const pos = portPosition(c, idx);
      const dx = pos.x - x;
      const dy = pos.y - y;
      const d = Math.hypot(dx, dy);
      if (d < min) {
        min = d;
        best = { component: c, port: idx, pos };
      }
    });
  });
  return best;
}

function nearestConnectPortForComponent(comp, point = null, skipConn = null) {
  if (!comp) return null;
  const meta = resolveComponentMeta(comp);
  const ports = comp.ports || meta.ports || [];
  const portCount = ports.length ? ports.length : 1;
  let best = null;
  for (let idx = 0; idx < portCount; idx += 1) {
    const pos = portPosition(comp, idx);
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    const dist = point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? Math.hypot(pos.x - point.x, pos.y - point.y)
      : 0;
    const occupiedPenalty = portInUse(comp, idx, skipConn) ? 100000 : 0;
    const score = dist + occupiedPenalty;
    if (!best || score < best.score) {
      best = { component: comp, port: idx, pos, score };
    }
  }
  return best ? { component: best.component, port: best.port, pos: best.pos } : null;
}

function getConnectionCandidateFromEvent(event, x, y) {
  const target = event?.target instanceof Element ? event.target : null;
  if (!target) return null;
  if (target.classList.contains('port')) {
    const comp = components.find(c => c.id === target.dataset.id);
    if (!comp) return null;
    const port = normalizePortIndex(target.dataset.port);
    return { component: comp, port, pos: portPosition(comp, port) };
  }
  const componentEl = target.closest('.component');
  const compId = componentEl?.dataset.id || target.dataset.id || null;
  const comp = compId ? components.find(c => c.id === compId) : null;
  return nearestConnectPortForComponent(comp, { x, y });
}

function createConnectionPreviewLine(source) {
  if (!source?.component) return null;
  const start = portPosition(source.component, source.port);
  const svg = document.getElementById('diagram');
  if (!svg) return null;
  const line = document.createElementNS(svgNS, 'line');
  line.setAttribute('x1', start.x);
  line.setAttribute('y1', start.y);
  line.setAttribute('x2', start.x);
  line.setAttribute('y2', start.y);
  line.classList.add('connection');
  line.classList.add('temp');
  svg.appendChild(line);
  return line;
}

function resetConnectInteraction({ keepMode = false } = {}) {
  if (tempConnection) {
    tempConnection.remove();
    tempConnection = null;
  }
  connectSource = null;
  hoverPort = null;
  if (!keepMode) {
    connectMode = false;
    document.getElementById('connect-btn')?.classList.remove('active');
  }
}

function createProvisionalCableResult(source, target) {
  const sourceTag = getComponentTag(source) || source?.id || 'FROM';
  const targetTag = getComponentTag(target) || target?.id || 'TO';
  const baseTag = `CBL-${sourceTag}-${targetTag}`
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `CBL-${Date.now()}`;
  const usedTags = new Set();
  components.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      if (conn?.cable?.tag) usedTags.add(String(conn.cable.tag));
    });
    if (comp?.cable?.tag) usedTags.add(String(comp.cable.tag));
  });
  getCables().forEach(cable => {
    if (cable?.tag) usedTags.add(String(cable.tag));
  });
  let tag = baseTag;
  let suffix = 2;
  while (usedTags.has(tag)) {
    tag = `${baseTag}-${suffix}`;
    suffix += 1;
  }
  const sourcePhases = parseCablePhases(source?.phases || source?.props?.phases || source);
  const targetPhases = parseCablePhases(target?.phases || target?.props?.phases || target);
  const phases = sourcePhases.length ? sourcePhases : targetPhases.length ? targetPhases : ['A', 'B', 'C'];
  const conductors = phases.length || 3;
  return {
    cable: {
      tag,
      cable_type: 'TBD',
      conductor_size: 'TBD',
      conductor_material: 'TBD',
      length: '',
      phases: phases.slice(),
      provisional: true,
      from_tag: sourceTag,
      to_tag: targetTag
    },
    phases: phases.slice(),
    conductors,
    impedance: { r: 0, x: 0 }
  };
}

function applyCableResultToConnection(conn, result) {
  if (!conn || !result?.cable) return false;
  const updatedCable = { ...result.cable };
  if (hasImpedance(result.cable)) updatedCable.impedance = { ...result.cable.impedance };
  const resolvedPhases = parseCablePhases(result.phases ?? updatedCable);
  updatedCable.phases = resolvedPhases.slice();
  conn.cable = updatedCable;
  conn.phases = resolvedPhases.slice();
  conn.conductors = result.conductors;
  if (result.impedance && typeof result.impedance === 'object') {
    conn.impedance = { ...result.impedance };
  } else if (hasImpedance(updatedCable)) {
    conn.impedance = { ...updatedCable.impedance };
  } else {
    delete conn.impedance;
  }
  return true;
}

function finishConnectionToCandidate(candidate, { provisional = true } = {}) {
  if (!connectSource?.component || !candidate?.component || candidate.component === connectSource.component) {
    return false;
  }
  const fromComp = connectSource.component;
  const toComp = candidate.component;
  const fromPort = connectSource.port;
  const toPort = candidate.port;
  const created = ensureDirectConnection(fromComp, toComp, fromPort, toPort);
  const createdConn = (fromComp.connections || []).find(conn =>
    conn.target === toComp.id
    && normalizePortIndex(conn.sourcePort) === normalizePortIndex(fromPort)
    && normalizePortIndex(conn.targetPort) === normalizePortIndex(toPort)
  );
  if (!createdConn) return false;
  if (created && provisional) {
    applyCableResultToConnection(createdConn, createProvisionalCableResult(fromComp, toComp));
    showToast('Provisional connection created. Edit the connection or Cable Schedule when details are ready.');
  } else if (!created) {
    showToast('Those devices are already connected.');
    return false;
  }
  pushHistory();
  render();
  save();
  markScheduleReconcilePending();
  return true;
}

function componentsAreLinked(a, b) {
  if (!a || !b) return false;
  const forward = Array.isArray(a.connections) && a.connections.some(conn => conn?.target === b.id);
  if (forward) return true;
  return Array.isArray(b.connections) && b.connections.some(conn => conn?.target === a.id);
}

function hasForwardConnection(from, to) {
  if (!from || !to) return false;
  return Array.isArray(from.connections) && from.connections.some(conn => conn?.target === to.id);
}

function findSharedBusBetween(a, b) {
  if (!a || !b) return null;
  return components.find(comp => {
    if (!isBusComponent(comp) || comp === a || comp === b) return false;
    const linkedToA = componentsAreLinked(comp, a);
    const linkedToB = componentsAreLinked(comp, b);
    return linkedToA && linkedToB;
  }) || null;
}

function isImpedanceDevice(comp) {
  if (!comp) return false;
  if (isBusComponent(comp)) return false;
  const category = resolveComponentCategory(comp);
  if (!category || category === 'annotations' || category === 'links') return false;
  if (category === 'cable') {
    return hasImpedance(comp) || hasImpedanceValues(comp?.cable) || hasImpedanceValues(comp?.seriesImpedance);
  }
  return hasImpedance(comp);
}

function getDefaultBusSubtype() {
  const entry = Object.keys(componentMeta).find(key => componentMeta[key]?.type === 'bus');
  return entry || 'Bus';
}

function nearestPortIndexForPoint(comp, point) {
  if (!comp) return 0;
  const meta = resolveComponentMeta(comp);
  const ports = comp.ports || meta.ports || [];
  if (!ports.length) return 0;
  const target = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
  let bestIdx = 0;
  let bestScore = Infinity;
  ports.forEach((_, idx) => {
    const pos = portPosition(comp, idx);
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    const baseDist = Math.hypot(pos.x - (target ? target.x : pos.x), pos.y - (target ? target.y : pos.y));
    const occupied = portInUse(comp, idx);
    const score = occupied ? baseDist + 1000 : baseDist;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

function inferComponentPortBaseKV(comp, portIndex, role = 'source') {
  if (!comp) return null;
  const idx = normalizePortIndex(portIndex);
  let volts = null;
  if (comp.type === 'transformer' && Number.isFinite(idx)) {
    const portVoltage = resolveTransformerVoltageValue(comp, idx);
    const normalized = normalizeVoltageToVolts(portVoltage);
    if (Number.isFinite(normalized) && normalized > 0) {
      volts = normalized;
    }
  }
  if (volts === null) {
    const mockConnection = role === 'target'
      ? { targetPort: idx }
      : { sourcePort: idx };
    const resolved = resolveConnectionVoltageVolts(comp, mockConnection, role);
    if (Number.isFinite(resolved) && resolved > 0) {
      volts = resolved;
    }
  }
  if (volts === null) {
    const componentVoltage = resolveComponentVoltageVolts(comp);
    if (Number.isFinite(componentVoltage) && componentVoltage > 0) {
      volts = componentVoltage;
    }
  }
  if (volts === null) {
    const base = toBaseKV(comp?.baseKV ?? comp?.kV ?? comp?.kv ?? comp?.prefault_voltage);
    return Number.isFinite(base) && base > 0 ? base : null;
  }
  const baseKV = toBaseKV(volts);
  return Number.isFinite(baseKV) && baseKV > 0 ? baseKV : null;
}

function inferBusBaseKV(fromComp, fromPort, toComp, toPort) {
  const candidates = [];
  const fromBase = inferComponentPortBaseKV(fromComp, fromPort, 'source');
  if (Number.isFinite(fromBase) && fromBase > 0) candidates.push(fromBase);
  const toBase = inferComponentPortBaseKV(toComp, toPort, 'target');
  if (Number.isFinite(toBase) && toBase > 0) candidates.push(toBase);
  if (!candidates.length) return null;
  return candidates.find(kv => kv >= 0.001) ?? candidates[0];
}

function applyBusBaseKV(bus, baseKV) {
  if (!bus || !Number.isFinite(baseKV) || baseKV <= 0) return;
  const kv = Number(baseKV.toFixed(6));
  const volts = Number((kv * 1000).toFixed(3));
  bus.baseKV = kv;
  bus.kV = kv;
  bus.kv = kv;
  bus.prefault_voltage = kv;
  bus.voltage = kv;
  bus.volts = volts;
  if (!bus.props || typeof bus.props !== 'object') bus.props = {};
  bus.props.baseKV = kv;
  bus.props.kV = kv;
  bus.props.volts = volts;
  bus.props.prefault_voltage = kv;
}

function ensureDirectConnection(fromComp, toComp, fromPort, toPort) {
  if (!fromComp || !toComp) return false;
  fromComp.connections = fromComp.connections || [];
  const fromIdx = normalizePortIndex(fromPort);
  const toIdx = normalizePortIndex(toPort);
  const existingConn = fromComp.connections.find(conn => conn.target === toComp.id) || null;
  if (existingConn && normalizePortIndex(existingConn.sourcePort) === fromIdx && normalizePortIndex(existingConn.targetPort) === toIdx) {
    return false;
  }
  if (portInUse(fromComp, fromIdx, existingConn)) return false;
  if (portInUse(toComp, toIdx, existingConn)) return false;
  if (existingConn) {
    existingConn.sourcePort = fromIdx;
    existingConn.targetPort = toIdx;
    delete existingConn.mid;
    delete existingConn.dir;
    return true;
  }
  const newConn = {
    target: toComp.id,
    sourcePort: fromIdx,
    targetPort: toIdx,
    cable: null,
    phases: [],
    conductors: 0,
    impedance: { r: 0, x: 0 },
    rating: null
  };
  fromComp.connections.push(newConn);
  try {
    const fromTag = getComponentTag(fromComp) || fromComp?.id || '';
    const toTag = getComponentTag(toComp) || toComp?.id || '';
    addRaceway({ conduit_id: `${fromTag}-${toTag}`, from_tag: fromTag, to_tag: toTag });
  } catch (err) {
    console.error('Failed to record connection', err);
  }
  return true;
}

function chooseBuildSubtype({ category = '', record = null, preferred = [] } = {}) {
  const recordText = [
    record?.category,
    record?.subCategory,
    record?.type,
    record?.loadType,
    record?.description,
    record?.tag,
    record?.id,
    ...preferred
  ].filter(Boolean).join(' ').toLowerCase();
  const entries = Object.entries(componentMeta);
  const match = entries.find(([, meta]) => {
    const metaCategory = meta?.category || categoryForType(meta?.type);
    if (category && metaCategory !== category) return false;
    const label = `${meta?.label || ''} ${meta?.type || ''}`.toLowerCase();
    return preferred.some(term => label.includes(String(term).toLowerCase()))
      || (recordText && label.split(/\s+/).some(part => part && recordText.includes(part)));
  });
  if (match) return match[0];
  if (category === 'sources') return entries.find(([, meta]) => meta?.category === 'sources')?.[0] || 'bus_Utility';
  if (category === 'load') {
    if (recordText.includes('motor')) return componentMeta.motor ? 'motor' : 'motor_load';
    return componentMeta.static_load ? 'static_load' : 'Equipment';
  }
  if (category === 'protection') return entries.find(([, meta]) => meta?.category === 'protection')?.[0] || 'Equipment';
  if (category === 'bus') return entries.find(([, meta]) => meta?.type === 'bus' || meta?.category === 'bus')?.[0] || 'Bus';
  return componentMeta.Panel ? 'Panel' : componentMeta.Equipment ? 'Equipment' : entries[0]?.[0];
}

function applyScheduleRecordToComponent(comp, record = {}, linkKey = scheduleKeyForComponent(comp)) {
  if (!comp || !record) return;
  const tag = normalizeTagValue(record.tag || record.id || record.ref || comp.id);
  const description = normalizeTagValue(record.description || record.name || '');
  comp.ref = comp.ref || record.id || record.ref || '';
  comp.tag = tag || comp.tag || '';
  comp.label = tag || description || comp.label || record.id || comp.subtype;
  comp.description = description || comp.description || '';
  comp.voltage = comp.voltage || record.voltage || '';
  comp.phases = comp.phases || record.phases || '';
  comp.manufacturer = comp.manufacturer || record.manufacturer || '';
  comp.model = comp.model || record.model || '';
  comp.generated = true;
  comp.reviewStatus = comp.reviewStatus || 'assumed';
  comp.autoBuildSource = linkKey;
  if (!Array.isArray(comp.assumptions)) comp.assumptions = [];
  if (!comp.assumptions.some(item => item && item.source === 'Auto-Build Workflow')) {
    comp.assumptions.push({
      source: 'Auto-Build Workflow',
      note: 'Generated from schedule data; verify placement, upstream source, and settings.',
      createdAt: new Date().toISOString()
    });
  }
  if (!comp.props || typeof comp.props !== 'object') comp.props = {};
  ['tag', 'description', 'voltage', 'phases', 'manufacturer', 'model'].forEach(key => {
    if (comp[key] !== undefined && comp[key] !== '') comp.props[key] = comp[key];
  });
  setComponentScheduleLink(comp, linkKey, record.id || record.tag || record.ref || tag);
  if (linkKey === 'load') {
    comp.kw = comp.kw || record.kw || record.load_kw || '';
    comp.source = comp.source || record.source || record.panelId || '';
  }
}

function findComponentForScheduleRecord(record, key) {
  const identity = normalizeScheduleIdentity(record?.id || record?.tag || record?.ref || record?.description);
  if (!identity) return null;
  return components.find(comp => {
    const compKey = scheduleKeyForComponent(comp);
    if (compKey !== key && !(key === 'equipment' && compKey === 'panel')) return false;
    const values = [
      comp.scheduleLinks?.[key],
      comp[`${key}Ref`],
      comp.ref,
      comp.tag,
      comp.label,
      comp.id
    ].map(normalizeScheduleIdentity).filter(Boolean);
    return values.includes(identity);
  }) || null;
}

function buildAutoBuildPlan() {
  const hasContent = record => record && Object.values(record).some(value => String(value ?? '').trim());
  const equipment = getEquipment().filter(hasContent);
  const loads = getLoads().filter(hasContent);
  const missingEquipment = equipment.filter(record => !findComponentForScheduleRecord(record, 'equipment'));
  const missingLoads = loads.filter(record => !findComponentForScheduleRecord(record, 'load'));
  const hasSource = components.some(isSourceComponent);
  return {
    equipment,
    loads,
    missingEquipment,
    missingLoads,
    createsSource: !hasSource,
    estimatedConnections: Math.max(0, missingEquipment.length + missingLoads.length + (hasSource ? 0 : 1) - 1)
  };
}

function addAutoBuiltComponent({ subtype, type, x, y, record, linkKey }) {
  const comp = addComponent({ subtype, type, x, y, skipHistory: true });
  if (!comp) return null;
  applyScheduleRecordToComponent(comp, record, linkKey);
  return comp;
}

function runAutoBuildWorkflow() {
  const plan = buildAutoBuildPlan();
  if (!plan.createsSource && !plan.missingEquipment.length && !plan.missingLoads.length) {
    showToast('One-line already includes current equipment and loads');
    return false;
  }

  const existingSource = components.find(isSourceComponent) || null;
  const x = 220;
  let y = 120;
  const created = [];
  let source = existingSource;
  if (!source) {
    const subtype = chooseBuildSubtype({ category: 'sources', preferred: ['utility', 'source'] });
    source = addAutoBuiltComponent({
      subtype,
      type: componentMeta[subtype]?.type || 'utility_source',
      x,
      y,
      record: { id: 'UTILITY', tag: 'UTILITY', description: 'Utility Source', voltage: '480' },
      linkKey: 'equipment'
    });
    if (source) created.push(source);
    if (source) autoLinkComponentToSchedule(source, { createIfMissing: true });
    y += 140;
  }

  const equipmentByIdentity = new Map();
  components.forEach(comp => {
    const key = normalizeScheduleIdentity(comp.scheduleLinks?.equipment || comp.equipmentRef || comp.ref || comp.tag || getComponentTag(comp));
    if (key) equipmentByIdentity.set(key, comp);
  });

  let previous = source;
  plan.missingEquipment.forEach(record => {
    const recordText = `${record.category || ''} ${record.subCategory || ''} ${record.description || ''}`.toLowerCase();
    const subtype = recordText.includes('transformer')
      ? chooseBuildSubtype({ category: 'equipment', record, preferred: ['xfmr', 'transformer'] })
      : chooseBuildSubtype({ category: 'equipment', record, preferred: ['switchboard', 'panel', 'mcc', 'equipment'] });
    const comp = addAutoBuiltComponent({
      subtype,
      type: componentMeta[subtype]?.type || 'equipment',
      x,
      y,
      record,
      linkKey: 'equipment'
    });
    if (!comp) return;
    created.push(comp);
    const key = normalizeScheduleIdentity(record.id || record.tag || record.ref);
    if (key) equipmentByIdentity.set(key, comp);
    if (previous) {
      ensureDirectConnection(previous, comp, 1, 0);
      const conn = previous.connections?.find(item => item.target === comp.id);
      if (conn) {
        applyCableResultToConnection(conn, createProvisionalCableResult(previous, comp));
        conn.reviewStatus = 'assumed';
      }
    }
    previous = comp;
    y += 140;
  });

  if (!previous) previous = source || components.find(comp => getCategory(comp) === 'equipment' || getCategory(comp) === 'panel') || null;

  let loadIndex = 0;
  plan.missingLoads.forEach(record => {
    const sourceKey = normalizeScheduleIdentity(record.source || record.panelId || record.equipmentRef || '');
    const upstream = (sourceKey ? equipmentByIdentity.get(sourceKey) : null) || previous || source;
    const loadX = x + (loadIndex % 3) * 180;
    const loadY = y + Math.floor(loadIndex / 3) * 130;
    const subtype = chooseBuildSubtype({ category: 'load', record, preferred: [record.loadType || '', 'motor', 'load'] });
    const comp = addAutoBuiltComponent({
      subtype,
      type: componentMeta[subtype]?.type || 'static_load',
      x: loadX,
      y: loadY,
      record,
      linkKey: 'load'
    });
    if (!comp) return;
    created.push(comp);
    if (upstream) {
      ensureDirectConnection(upstream, comp, 1, 0);
      const conn = upstream.connections?.find(item => item.target === comp.id);
      if (conn) {
        applyCableResultToConnection(conn, createProvisionalCableResult(upstream, comp));
        conn.reviewStatus = 'assumed';
      }
    }
    loadIndex += 1;
  });

  if (!created.length) return false;
  selection = created;
  selected = created[0];
  selectedConnection = null;
  pushHistory();
  arrangeSourceToLoad({ silent: true, componentsToArrange: components });
  render();
  zoomToFit({ pad: 140, maxZoom: 1.15 });
  save();
  markScheduleReconcilePending();
  showToast(`Auto-built ${created.length} one-line item${created.length === 1 ? '' : 's'}`);
  return true;
}

function openAutoBuildModal() {
  const plan = buildAutoBuildPlan();
  return openModal({
    title: 'Auto-Build One-Line',
    description: 'Create missing source, equipment, load, and provisional cable links from current project schedules.',
    primaryText: 'Build One-Line',
    secondaryText: 'Cancel',
    onSubmit: () => {
      runAutoBuildWorkflow();
      return true;
    },
    render: body => {
      const summary = document.createElement('div');
      summary.className = 'auto-build-summary';
      [
        ['Schedule equipment found', plan.equipment.length],
        ['Missing equipment components', plan.missingEquipment.length],
        ['Schedule loads found', plan.loads.length],
        ['Missing load components', plan.missingLoads.length],
        ['Utility/source component needed', plan.createsSource ? 'Yes' : 'No'],
        ['Estimated provisional cable links', plan.estimatedConnections]
      ].forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'auto-build-summary-row';
        const name = document.createElement('span');
        name.textContent = label;
        const count = document.createElement('strong');
        count.textContent = String(value);
        row.append(name, count);
        summary.appendChild(row);
      });
      const note = document.createElement('p');
      note.className = 'modal-note';
      note.textContent = 'Generated items are marked as assumptions and can be approved, edited, or re-linked after placement.';
      body.append(summary, note);
    }
  });
}

function buildTopologyLevels(items = components) {
  const scope = new Set(items.map(comp => comp.id));
  const byId = new Map(items.map(comp => [comp.id, comp]));
  const level = new Map();
  const seeds = items.filter(comp => isSourceComponent(comp) || !items.some(other => (other.connections || []).some(conn => conn.target === comp.id)));
  const queue = seeds.map(comp => {
    level.set(comp.id, 0);
    return comp.id;
  });
  while (queue.length) {
    const id = queue.shift();
    const current = byId.get(id);
    const currentLevel = level.get(id) || 0;
    (current?.connections || []).forEach(conn => {
      if (!scope.has(conn.target)) return;
      const nextLevel = currentLevel + 1;
      if (!level.has(conn.target) || nextLevel > level.get(conn.target)) {
        level.set(conn.target, nextLevel);
        queue.push(conn.target);
      }
    });
  }
  items.forEach((comp, idx) => {
    if (!level.has(comp.id)) level.set(comp.id, Math.floor(idx / 4));
  });
  return level;
}

function applyBusCentricAutoLayout(targets) {
  const buses = targets.filter(comp => isBusComponent(comp));
  if (!buses.length) return false;
  const byId = new Map(targets.map(comp => [comp.id, comp]));
  const degree = bus => {
    const outbound = (bus.connections || []).filter(conn => byId.has(conn.target)).length;
    const inbound = targets.filter(comp => (comp.connections || []).some(conn => conn.target === bus.id)).length;
    return outbound + inbound;
  };
  const mainBus = [...buses].sort((a, b) => degree(b) - degree(a))[0];
  if (!mainBus) return false;
  const branchSpacing = 150;
  const levelSpacing = 118;
  const topY = 72;
  const busY = topY + levelSpacing;
  const busChildren = (mainBus.connections || [])
    .map(conn => byId.get(conn.target))
    .filter(comp => comp && !isBusComponent(comp));
  const upstream = targets
    .filter(comp => comp !== mainBus && (comp.connections || []).some(conn => conn.target === mainBus.id))
    .sort((a, b) => {
      const sourceDelta = Number(isSourceComponent(b)) - Number(isSourceComponent(a));
      return sourceDelta || (getComponentTag(a) || a.id).localeCompare(getComponentTag(b) || b.id);
    });
  const branchCount = Math.max(busChildren.length, upstream.length, 2);
  const busWidth = Math.max(360, branchCount * branchSpacing + 80);
  const busX = 140;
  mainBus.rotation = defaultRotationForComponent(mainBus);
  mainBus.rotationManual = false;
  mainBus.width = busWidth;
  mainBus.height = Number(mainBus.height) > 0 ? mainBus.height : 20;
  alignComponentBoundsToTopLeft(mainBus, busX, busY);
  updateBusPorts(mainBus);
  const positioned = new Set([mainBus.id]);
  const placeAtCenter = (comp, centerX, y) => {
    if (!comp) return;
    comp.rotation = defaultRotationForComponent(comp);
    comp.rotationManual = false;
    alignComponentBoundsToTopLeft(comp, centerX - ((Number(comp.width) || compWidth) / 2), y);
    comp.labelOffset = comp.labelOffset || { x: 0, y: 0 };
    positioned.add(comp.id);
  };
  upstream.forEach((comp, idx) => {
    const centerX = busX + busWidth * ((idx + 1) / (upstream.length + 1));
    placeAtCenter(comp, centerX, topY - (Number(comp.height) || compHeight));
  });
  busChildren.forEach((comp, idx) => {
    const centerX = busX + busWidth * ((idx + 1) / (busChildren.length + 1));
    placeAtCenter(comp, centerX, busY + levelSpacing);
  });
  const outgoingBySource = new Map();
  targets.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      const target = byId.get(conn.target);
      if (!target || target === mainBus || isBusComponent(target)) return;
      if (!outgoingBySource.has(comp.id)) outgoingBySource.set(comp.id, []);
      outgoingBySource.get(comp.id).push(target);
    });
  });
  for (let depth = 0; depth < targets.length; depth++) {
    let moved = false;
    targets.forEach(parent => {
      if (!positioned.has(parent.id)) return;
      const children = (outgoingBySource.get(parent.id) || []).filter(child => !positioned.has(child.id));
      if (!children.length) return;
      const parentCenterX = Number(parent.x) + (Number(parent.width) || compWidth) / 2;
      const spread = Math.max(1, children.length - 1) * 100;
      children.forEach((child, idx) => {
        const offset = children.length === 1 ? 0 : idx * 100 - spread / 2;
        placeAtCenter(child, parentCenterX + offset, Number(parent.y) + (Number(parent.height) || compHeight) + levelSpacing);
        moved = true;
      });
    });
    if (!moved) break;
  }
  targets
    .filter(comp => !positioned.has(comp.id))
    .sort((a, b) => (getComponentTag(a) || a.id).localeCompare(getComponentTag(b) || b.id))
    .forEach((comp, idx) => {
      const centerX = busX + busWidth + 170 + (idx % 3) * branchSpacing;
      const y = busY + Math.floor(idx / 3) * levelSpacing;
      placeAtCenter(comp, centerX, y);
    });
  return true;
}

function ductbankSampleIdentity(comp) {
  return [
    comp?.equipmentRef,
    comp?.scheduleLinks?.equipment,
    comp?.ref,
    comp?.id,
    comp?.label
  ].map(value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')).join('|');
}

function arrangeDuctbankSampleLayout(items = components) {
  const targets = items.filter(comp => comp && comp.type !== 'dimension' && comp.type !== 'annotation');
  if (!targets.length) return false;
  const placements = [
    { tokens: ['substationsw1', 'sw1'], x: 250, y: 80 },
    { tokens: ['padxfmrt2', 'xfmrt2', 't2'], x: 80, y: 360 },
    { tokens: ['padxfmrt3', 'xfmrt3', 't3'], x: 400, y: 360 },
    { tokens: ['substationsw2', 'sw2'], x: 880, y: 80 },
    { tokens: ['bldgxfmrt1', 'xfmrt1', 'bldgmdp', 'mdp'], x: 880, y: 360 }
  ];
  const placed = new Set();
  const useVerticalEdgePorts = comp => {
    const width = Number(comp.width) || compWidth;
    const height = Number(comp.height) || compHeight;
    if (comp.type === 'utility_source') {
      comp.ports = [{ x: width / 2, y: height }];
    } else if (comp.type === 'transformer') {
      comp.ports = [
        { x: width / 2, y: 0 },
        { x: width / 2, y: height }
      ];
    }
  };
  placements.forEach(placement => {
    const comp = targets.find(candidate => {
      if (placed.has(candidate)) return false;
      const identity = ductbankSampleIdentity(candidate);
      return placement.tokens.some(token => identity.includes(token));
    });
    if (!comp) return;
    applyIndustrySymbolGeometry(comp, resolveComponentMeta(comp));
    useVerticalEdgePorts(comp);
    comp.rotation = defaultRotationForComponent(comp);
    comp.rotationManual = false;
    alignComponentBoundsToTopLeft(comp, placement.x, placement.y);
    comp.labelOffset = { x: 0, y: 0 };
    placed.add(comp);
  });
  targets.filter(comp => !placed.has(comp)).forEach((comp, index) => {
    applyIndustrySymbolGeometry(comp, resolveComponentMeta(comp));
    useVerticalEdgePorts(comp);
    comp.rotation = defaultRotationForComponent(comp);
    comp.rotationManual = false;
    alignComponentBoundsToTopLeft(comp, 80 + index * 280, 640);
    comp.labelOffset = { x: 0, y: 0 };
  });
  targets.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      const target = targets.find(candidate => candidate.id === conn.target);
      if (!target) return;
      const [sourcePort, targetPort] = nearestPorts(comp, target);
      conn.sourcePort = sourcePort;
      conn.targetPort = targetPort;
      delete conn.dir;
      delete conn.mid;
    });
  });
  return true;
}

function arrangeSourceToLoad({ silent = false, componentsToArrange = null } = {}) {
  const targets = (componentsToArrange || (selection.length > 1 ? selection : components))
    .filter(comp => comp && comp.type !== 'dimension' && comp.type !== 'annotation');
  if (!targets.length) {
    if (!silent) showToast('No devices to arrange');
    return false;
  }
  targets.forEach(comp => applyIndustrySymbolGeometry(comp, resolveComponentMeta(comp)));
  const level = buildTopologyLevels(targets);
  const groups = new Map();
  targets.forEach(comp => {
    const rank = level.get(comp.id) || 0;
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank).push(comp);
  });
  [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([rank, group]) => {
    group.sort((a, b) => (getComponentTag(a) || a.id).localeCompare(getComponentTag(b) || b.id));
    group.forEach((comp, idx) => {
      const x = 180 + idx * 190;
      const y = 120 + rank * 140;
      comp.rotation = defaultRotationForComponent(comp);
      comp.rotationManual = false;
      alignComponentBoundsToTopLeft(comp, x, y);
      comp.labelOffset = comp.labelOffset || { x: 0, y: 0 };
    });
  });
  applyBusCentricAutoLayout(targets);
  targets.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      const target = targets.find(item => item.id === conn.target) || components.find(item => item.id === conn.target);
      if (!target) return;
      const [sourcePort, targetPort] = nearestPorts(comp, target);
      conn.sourcePort = sourcePort;
      conn.targetPort = targetPort;
      delete conn.dir;
      delete conn.mid;
    });
  });
  pushHistory();
  render();
  save();
  if (!silent) showToast(`Arranged ${targets.length} item${targets.length === 1 ? '' : 's'} from source to load`);
  return true;
}

function ensureConnection(fromComp, toComp, fromPort, toPort) {
  if (!fromComp || !toComp) return false;
  fromComp.connections = fromComp.connections || [];
  const fromIdx = normalizePortIndex(fromPort);
  const toIdx = normalizePortIndex(toPort);
  const sharedBus = findSharedBusBetween(fromComp, toComp);
  if (sharedBus) {
    let changed = false;
    const startPos = portPosition(fromComp, fromIdx);
    const endPos = portPosition(toComp, toIdx);
    if (!hasForwardConnection(fromComp, sharedBus)) {
      const busPort = nearestPortIndexForPoint(sharedBus, startPos);
      changed = ensureConnection(fromComp, sharedBus, fromIdx, busPort) || changed;
    }
    if (!hasForwardConnection(sharedBus, toComp)) {
      const busPort = nearestPortIndexForPoint(sharedBus, endPos);
      changed = ensureConnection(sharedBus, toComp, busPort, toIdx) || changed;
    }
    return changed;
  }
  const linkedBus = components.find(comp => {
    if (!isBusComponent(comp) || comp === fromComp || comp === toComp) return false;
    return componentsAreLinked(comp, fromComp) || componentsAreLinked(comp, toComp);
  });
  if (linkedBus && (isBusComponent(fromComp) || isBusComponent(toComp))) {
    const busComp = isBusComponent(fromComp) ? fromComp : toComp;
    const otherComp = busComp === fromComp ? toComp : fromComp;
    const linkedToBus = componentsAreLinked(linkedBus, busComp);
    const linkedToOther = componentsAreLinked(linkedBus, otherComp);
    if (linkedToBus && linkedToOther) {
      // Only reroute through an intermediate bus when it already links both components.
      let changed = false;
      const startPos = portPosition(fromComp, fromIdx);
      const endPos = portPosition(toComp, toIdx);
      if (!hasForwardConnection(fromComp, linkedBus)) {
        const busPort = nearestPortIndexForPoint(linkedBus, startPos);
        changed = ensureConnection(fromComp, linkedBus, fromIdx, busPort) || changed;
      }
      if (!hasForwardConnection(linkedBus, toComp)) {
        const busPort = nearestPortIndexForPoint(linkedBus, endPos);
        changed = ensureConnection(linkedBus, toComp, busPort, toIdx) || changed;
      }
      if (changed) return true;
    }
  }
  if (isImpedanceDevice(fromComp) && isImpedanceDevice(toComp) && !componentsAreLinked(fromComp, toComp)) {
    const startPos = portPosition(fromComp, fromIdx);
    const endPos = portPosition(toComp, toIdx);
    const busKey = getDefaultBusSubtype();
    const busMeta = componentMeta[busKey] || {};
    const defaultWidth = Number.isFinite(busMeta.width) ? busMeta.width : 200;
    const defaultHeight = Number.isFinite(busMeta.height) ? busMeta.height : 20;
    let busX = ((startPos?.x ?? 0) + (endPos?.x ?? 0)) / 2 - defaultWidth / 2;
    let busY = ((startPos?.y ?? 0) + (endPos?.y ?? 0)) / 2 - defaultHeight / 2;
    if (gridEnabled) {
      busX = Math.round(busX / gridSize) * gridSize;
      busY = Math.round(busY / gridSize) * gridSize;
    }
    const bus = addComponent({ subtype: busKey, type: 'bus', x: busX, y: busY, skipHistory: true });
    if (!bus) return false;
    bus.x = busX;
    bus.y = busY;
    const inferredKV = inferBusBaseKV(fromComp, fromIdx, toComp, toIdx);
    if (Number.isFinite(inferredKV) && inferredKV > 0) {
      applyBusBaseKV(bus, inferredKV);
    }
    const busFromPort = nearestPortIndexForPoint(bus, startPos);
    const busToPort = nearestPortIndexForPoint(bus, endPos);
    const createdA = ensureConnection(fromComp, bus, fromIdx, busFromPort);
    const createdB = ensureConnection(bus, toComp, busToPort, toIdx);
    return createdA || createdB;
  }
  const existingConn = fromComp.connections.find(conn => conn.target === toComp.id) || null;
  if (existingConn && normalizePortIndex(existingConn.sourcePort) === fromIdx && normalizePortIndex(existingConn.targetPort) === toIdx) {
    return false;
  }
  if (portInUse(fromComp, fromIdx, existingConn)) return false;
  if (portInUse(toComp, toIdx, existingConn)) return false;
  if (existingConn) {
    existingConn.sourcePort = fromIdx;
    existingConn.targetPort = toIdx;
    delete existingConn.mid;
    delete existingConn.dir;
    return true;
  }
  const newConn = {
    target: toComp.id,
    sourcePort: fromIdx,
    targetPort: toIdx,
    cable: null,
    phases: [],
    conductors: 0,
    impedance: { r: 0, x: 0 },
    rating: null
  };
  fromComp.connections.push(newConn);
  try {
    const fromTag = getComponentTag(fromComp) || fromComp?.id || '';
    const toTag = getComponentTag(toComp) || toComp?.id || '';
    addRaceway({ conduit_id: `${fromTag}-${toTag}`, from_tag: fromTag, to_tag: toTag });
  } catch (err) {
    console.error('Failed to record connection', err);
  }
  return true;
}

function autoAttachComponent(comp, exclude = new Set()) {
  if (!comp) return false;
  const meta = resolveComponentMeta(comp);
  const ports = comp.ports || meta.ports;
  if (!ports || !ports.length) return false;
  let best = null;
  components.forEach(other => {
    if (other === comp || exclude.has(other)) return;
    const otherMeta = resolveComponentMeta(other);
    const otherPorts = other.ports || otherMeta.ports;
    if (!otherPorts || !otherPorts.length) return;
    ports.forEach((_, portIdx) => {
      const compPos = portPosition(comp, portIdx);
      otherPorts.forEach((__, otherIdx) => {
        const otherPos = portPosition(other, otherIdx);
        const dist = Math.hypot(otherPos.x - compPos.x, otherPos.y - compPos.y);
        if (!best || dist < best.distance) {
          best = {
            distance: dist,
            portIdx,
            other,
            otherIdx,
            compPos,
            otherPos
          };
        }
      });
    });
  });
  if (!best) return false;
  const threshold = Math.max(12, gridSize / 2);
  if (best.distance > threshold) return false;
  const updatedCompPos = portPosition(comp, best.portIdx);
  const dx = best.otherPos.x - updatedCompPos.x;
  const dy = best.otherPos.y - updatedCompPos.y;
  let changed = false;
  if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
    comp.x = Number((comp.x + dx).toFixed(2));
    comp.y = Number((comp.y + dy).toFixed(2));
    changed = true;
  }
  const connected = ensureConnection(comp, best.other, best.portIdx, best.otherIdx);
  return changed || connected;
}

/**
 * Gap #35 – Snap-to-Bus Auto-Connection.
 * When a non-bus component is dropped near a bus (within snapRadius px),
 * automatically connect the nearest port of the component to the nearest
 * available port of that bus.  Returns true if a connection was made.
 */
function snapToNearestBus(comp, snapRadius = 30) {
  if (!comp || isBusComponent(comp)) return false;
  const meta = resolveComponentMeta(comp);
  const ports = comp.ports || meta.ports || [];
  if (!ports.length) return false;
  let best = null;
  components.forEach(bus => {
    if (!isBusComponent(bus) || bus === comp) return;
    const busMeta = resolveComponentMeta(bus);
    const busPorts = bus.ports || busMeta.ports || [];
    ports.forEach((_, portIdx) => {
      const compPos = portPosition(comp, portIdx);
      if (!Number.isFinite(compPos.x) || !Number.isFinite(compPos.y)) return;
      const busPortIdx = nearestPortIndexForPoint(bus, compPos);
      const busPos = portPosition(bus, busPortIdx);
      if (!Number.isFinite(busPos.x) || !Number.isFinite(busPos.y)) return;
      const dist = Math.hypot(busPos.x - compPos.x, busPos.y - compPos.y);
      if (!best || dist < best.distance) {
        best = { distance: dist, portIdx, bus, busPortIdx };
      }
    });
  });
  if (!best || best.distance > snapRadius) return false;
  return ensureConnection(comp, best.bus, best.portIdx, best.busPortIdx);
}

function findSourceComponent(targetId, comps = components) {
  return comps.find(c => (c.connections || []).some(conn => conn.target === targetId)) || null;
}

function updateCableOperatingVoltages(comps = components) {
  if (!Array.isArray(comps)) return;
  const byId = new Map();
  comps.forEach(comp => {
    if (comp && comp.id) byId.set(comp.id, comp);
  });
  comps.forEach(comp => {
    if (!comp || comp.type !== 'cable') return;
    if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
    const upstream = findSourceComponent(comp.id, comps);
    const outbound = (comp.connections || []).find(conn => conn && conn.target);
    const downstream = outbound ? byId.get(outbound.target) || null : null;
    const candidates = [
      computeComponentOperatingVoltage(comp),
      computeComponentOperatingVoltage(upstream),
      computeComponentOperatingVoltage(downstream)
    ].filter(value => value !== null);
    if (!candidates.length) return;
    const resolved = Number(candidates[0]);
    if (!Number.isFinite(resolved)) return;
    const rounded = Number(resolved.toFixed(2));
    comp.cable.operating_voltage = rounded;
    if (outbound) {
      if (!outbound.cable || typeof outbound.cable !== 'object') outbound.cable = {};
      outbound.cable.operating_voltage = rounded;
    }
  });
}

function normalizeComponent(c) {
  const metaKey = resolveComponentMetaKey(c);
  const meta = componentMeta[metaKey] || {};
  const nc = {
    ...c,
    subtype: metaKey || c?.subtype,
    rotation: normalizeRotation(c.rotation ?? c.rot ?? meta.defaultRotation ?? defaultRotationForType(c?.type, meta.category)),
    flipped: c.flipped || false,
    connections: (c.connections || []).map(conn =>
      typeof conn === 'string' ? { target: conn } : conn
    )
  };
  sanitizeOverlayStudyFields(nc);
  if (typeof nc.labelOffset !== 'object' || nc.labelOffset === null) {
    nc.labelOffset = { x: 0, y: 0 };
  } else {
    nc.labelOffset = {
      x: Number(nc.labelOffset.x) || 0,
      y: Number(nc.labelOffset.y) || 0
    };
  }
  if (nc.type === 'annotation') {
    const fallbackWidth = Number.isFinite(Number(meta.width)) ? Number(meta.width) : compWidth;
    const fallbackHeight = Number.isFinite(Number(meta.height)) ? Number(meta.height) : compHeight;
    nc.width = Number(nc.width) || fallbackWidth;
    nc.height = Number(nc.height) || fallbackHeight;
    ensureShapeDefaults(nc);
  }
  const normalizedCategory = resolveComponentCategory(nc);
  if (normalizedCategory === 'bus' || isBusComponent(nc)) {
    nc.width = Number(nc.width) || Number(meta.width) || 200;
    nc.height = Number(nc.height) || Number(meta.height) || 20;
    updateBusPorts(nc);
  }
  applyIndustrySymbolGeometry(nc, meta);
  if (!nc.rotationManual && nc.rotation && shouldUseVerticalOneLinePorts(normalizedCategory, nc.type)) {
    nc.rotation = 0;
  }
  if (normalizedCategory === 'load') {
    const profileGeometry = industrySymbolGeometry(getIndustrySymbolProfile(nc, meta));
    const basePorts = nc.ports?.length
      ? nc.ports
      : profileGeometry?.ports?.length
        ? profileGeometry.ports
        : componentMeta[nc.subtype]?.ports?.length
        ? componentMeta[nc.subtype].ports
        : nc.ports;
    nc.ports = normalizePortsForCategory('load', basePorts, nc.type, nc.subtype, nc.width || compWidth, nc.height || compHeight).map(port => ({
      x: coerceNumber(port?.x, (nc.width || compWidth) / 2),
      y: coerceNumber(port?.y, 0)
    }));
  } else if (Array.isArray(nc.ports) && shouldUseVerticalOneLinePorts(normalizedCategory, nc.type)) {
    nc.ports = normalizePortsForCategory(normalizedCategory, nc.ports, nc.type, nc.subtype, nc.width || compWidth, nc.height || compHeight);
  }
  applyDefaults(nc);
  ensureBaselineFieldsOnComponent(nc, componentMeta[nc.subtype]);
  ensureGeneratorStudyFieldsOnComponent(nc, componentMeta[nc.subtype]);
  ensureMccFieldsOnComponent(nc, componentMeta[nc.subtype]);
  ensurePtVtFieldsOnComponent(nc, componentMeta[nc.subtype]);
  return nc;
}

function componentBounds(comp) {
  return getComponentBounds(comp, { defaultWidth: compWidth, defaultHeight: compHeight });
}

function alignComponentBoundsToTopLeft(comp, x, y) {
  if (!comp || !Number.isFinite(x) || !Number.isFinite(y)) return;
  comp.x = x;
  comp.y = y;
  const bounds = componentBounds(comp);
  const dx = bounds.left - x;
  const dy = bounds.top - y;
  if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
    comp.x -= dx;
    comp.y -= dy;
  }
}

function computeDragConnections(selectedComponents) {
  if (!Array.isArray(selectedComponents) || !selectedComponents.length) {
    return [];
  }
  const incomingMap = new Map();
  components.forEach(source => {
    (source.connections || []).forEach(conn => {
      if (!incomingMap.has(conn.target)) incomingMap.set(conn.target, []);
      incomingMap.get(conn.target).push({ source, conn });
    });
  });
  const seen = new Set();
  const records = [];
  const addRecord = (sourceComp, conn) => {
    if (!conn || seen.has(conn)) return;
    if (conn.dir !== 'h' && conn.dir !== 'v') return;
    const targetComp = components.find(c => c.id === conn.target);
    if (!targetComp) return;
    const startPos = portPosition(sourceComp, conn.sourcePort);
    const endPos = portPosition(targetComp, conn.targetPort);
    if (!startPos || !endPos) return;
    const baseMid = Number.isFinite(conn.mid)
      ? conn.mid
      : conn.dir === 'h'
        ? (startPos.x + endPos.x) / 2
        : (startPos.y + endPos.y) / 2;
    const baseAvg = conn.dir === 'h'
      ? (startPos.x + endPos.x) / 2
      : (startPos.y + endPos.y) / 2;
    const offset = Number.isFinite(baseMid) && Number.isFinite(baseAvg)
      ? baseMid - baseAvg
      : 0;
    seen.add(conn);
    records.push({
      conn,
      dir: conn.dir,
      source: sourceComp,
      target: targetComp,
      offset
    });
  };
  selectedComponents.forEach(comp => {
    (comp.connections || []).forEach(conn => addRecord(comp, conn));
    (incomingMap.get(comp.id) || []).forEach(entry => addRecord(entry.source, entry.conn));
  });
  return records;
}

function finalizeMarqueeSelection() {
  if (!marquee || !marquee.active) return false;
  const dx = Math.abs(marquee.x2 - marquee.x1);
  const dy = Math.abs(marquee.y2 - marquee.y1);
  const area = marquee;
  marquee = null;
  if (dx < marqueeThreshold && dy < marqueeThreshold) {
    return false;
  }
  const left = Math.min(area.x1, area.x2);
  const right = Math.max(area.x1, area.x2);
  const top = Math.min(area.y1, area.y2);
  const bottom = Math.max(area.y1, area.y2);
  const strict = area.x2 >= area.x1;
  const picked = components.filter(c => {
    if (c.type === 'dimension') return false;
    const bounds = componentBounds(c);
    if (strict) {
      return bounds.left >= left && bounds.right <= right && bounds.top >= top && bounds.bottom <= bottom;
    }
    return !(bounds.right < left || bounds.left > right || bounds.bottom < top || bounds.top > bottom);
  });
  selection = picked;
  selected = picked[0] || null;
  selectedConnection = null;
  return true;
}

// Gap #43 – Select Connected (topology flood-fill from selected component)
function selectConnected(startId) {
  if (!startId) return;
  const connectedIds = getConnectedComponentIds(startId, components, connections);
  const reached = components.filter(component => connectedIds.has(component.id));
  if (!reached.length) return;
  selection = reached;
  selected = reached[0];
  selectedConnection = null;
  render();
  updateStatusBar();
}

// Gap #44 – Select by Type (select all components of the same subtype)
function selectByType(subtype) {
  if (!subtype) return;
  const matched = components.filter(c => c.subtype === subtype);
  if (!matched.length) { showToast(`No components of type "${subtype}" found`); return; }
  selection = matched;
  selected = matched[0];
  selectedConnection = null;
  render();
  updateStatusBar();
  showToast(`Selected ${matched.length} component${matched.length !== 1 ? 's' : ''} of type "${subtype}"`);
}

function isComponentPositionLocked(comp) {
  if (!comp) return false;
  const layer = comp.layer ? layers.find(entry => entry.id === comp.layer) : null;
  return !!(comp.locked || comp.positionLocked || layer?.locked);
}

function isComponentPropertiesLocked(comp) {
  if (!comp) return false;
  const layer = comp.layer ? layers.find(entry => entry.id === comp.layer) : null;
  return !!(comp.propertiesLocked || layer?.locked || (liveTelemetryController.running && liveTelemetryConfig.operatorMode));
}

// Gap #41 – Lock / unlock a component position. The legacy `locked` flag remains
// authoritative so previously saved diagrams retain their existing behavior.
function toggleLock(comp) {
  if (!comp) return;
  const next = !isComponentPositionLocked(comp);
  comp.locked = next;
  comp.positionLocked = next;
  pushHistory();
  render();
  save();
  showToast(next ? `"${comp.label || comp.id}" position locked` : `"${comp.label || comp.id}" position unlocked`);
}

function togglePropertiesLock(comp) {
  if (!comp) return;
  comp.propertiesLocked = !comp.propertiesLocked;
  pushHistory();
  render();
  save();
  showToast(comp.propertiesLocked ? `"${comp.label || comp.id}" properties locked` : `"${comp.label || comp.id}" properties unlocked`);
}

// Gap #36 – Compute energized component set via topology traversal
// Starts from source nodes; traverses through non-open breakers/switches.
// Returns a Set<string> of energized component IDs.
function computeEnergizedSet(comps, conns) {
  return getEnergizedComponentIds(comps, conns, {
    isComponentOpen: isComponentOpenForOperatingState,
    isSourceComponent,
    resolveComponentPorts: comp => resolveComponentMeta(comp)?.ports
  });
}

// Gap #40 – Group selected components into a group object
function groupSelection() {
  const targets = selection.filter(c => c.type !== 'group');
  if (targets.length < 2) { showToast('Select at least 2 components to group'); return; }
  const group = createComponentGroup(targets, {
    id: 'grp' + Date.now(),
    defaultWidth: compWidth,
    defaultHeight: compHeight
  });
  const memberIds = group.memberIds;
  components.push(group);
  selection = [group];
  selected = group;
  pushHistory();
  render();
  save();
  showToast(`Grouped ${memberIds.length} components`);
}

// Gap #40 – Ungroup: dissolve a group back to individual components
function ungroupComponent(groupId) {
  const idx = components.findIndex(c => c.id === groupId && c.type === 'group');
  if (idx === -1) return;
  const members = getGroupMembers(components, groupId);
  components.splice(idx, 1);
  selection = members;
  selected = members[0] || null;
  pushHistory();
  render();
  save();
  showToast('Group dissolved');
}

// ─── Gap #51: Named Layer Management ───────────────────────────────────────

/**
 * Create a new named layer on the active sheet.
 * @param {string} name
 * @returns {{ id: string, name: string, visible: boolean, locked: boolean }}
 */
function createLayer(name) {
  const layer = { id: 'layer_' + Date.now(), name: name.trim() || 'Layer', visible: true, locked: false };
  layers.push(layer);
  pushHistory('Created layer: ' + layer.name);
  save();
  renderLayerPanel();
  return layer;
}

/**
 * Rename an existing layer. Does not affect component assignments.
 * @param {string} id
 * @param {string} newName
 */
function renameLayer(id, newName) {
  const layer = layers.find(l => l.id === id);
  if (!layer || !newName.trim()) return;
  layer.name = newName.trim();
  pushHistory('Renamed layer: ' + layer.name);
  save();
  renderLayerPanel();
}

/**
 * Delete a layer. Components previously on it become unassigned (always visible/interactive).
 * @param {string} id
 */
function deleteLayer(id) {
  const idx = layers.findIndex(l => l.id === id);
  if (idx === -1) return;
  layers.splice(idx, 1);
  // Clear layer assignment on all components that were on this layer
  components.forEach(c => { if (c.layer === id) delete c.layer; });
  if (activeLayerId === id) activeLayerId = null;
  pushHistory('Deleted layer');
  save();
  render();
  renderLayerPanel();
}

/**
 * Set a layer's visibility. Not recorded in undo history (view preference).
 * @param {string} id
 * @param {boolean} visible
 */
function setLayerVisibility(id, visible) {
  const layer = layers.find(l => l.id === id);
  if (!layer) return;
  layer.visible = visible;
  save();
  render();
  renderLayerPanel();
}

/**
 * Set a layer's locked state. Not recorded in undo history (view preference).
 * Locked layers have pointer-events disabled on all member components.
 * @param {string} id
 * @param {boolean} locked
 */
function setLayerLocked(id, locked) {
  const layer = layers.find(l => l.id === id);
  if (!layer) return;
  layer.locked = locked;
  // Deselect any selected components on this now-locked layer
  if (locked) {
    selection = selection.filter(c => c.layer !== id);
    if (selected && selected.layer === id) {
      selected = selection[0] || null;
    }
  }
  save();
  render();
  renderLayerPanel();
}

/**
 * Assign selected components to a layer (or remove assignment when layerId is null).
 * @param {string|null} layerId
 */
function assignSelectedToLayer(layerId) {
  if (!selection.length && !selected) return;
  const targets = selection.length ? selection : [selected];
  targets.forEach(c => {
    if (layerId) {
      c.layer = layerId;
    } else {
      delete c.layer;
    }
  });
  pushHistory('Assigned to layer');
  save();
  render();
  renderLayerPanel();
}

/**
 * Render (or refresh) the layers panel sidebar.
 * Idempotent — safe to call whenever layer state changes.
 */
function renderLayerPanel() {
  const list = document.getElementById('layer-list');
  if (!list) return;
  list.innerHTML = '';

  // Count unassigned components for the default row
  const assignedIds = new Set(layers.map(l => l.id));
  const unassignedCount = components.filter(c => !c.layer || !assignedIds.has(c.layer)).length;

  // Synthetic "(Default)" row — always shown, represents unassigned components
  const defaultLi = document.createElement('li');
  defaultLi.className = 'layer-row' + (activeLayerId === null ? ' active-layer' : '');
  defaultLi.title = 'Default (unassigned) — always visible';
  defaultLi.innerHTML = `
    <span class="layer-row-icon" aria-hidden="true">&#9673;</span>
    <span class="layer-row-name">(Default)</span>
    <span class="layer-row-count">${unassignedCount}</span>`;
  defaultLi.addEventListener('click', () => {
    activeLayerId = null;
    renderLayerPanel();
  });
  list.appendChild(defaultLi);

  layers.forEach(layer => {
    const count = components.filter(c => c.layer === layer.id).length;
    const li = document.createElement('li');
    li.className = 'layer-row' +
      (activeLayerId === layer.id ? ' active-layer' : '') +
      (layer.locked ? ' layer-locked' : '');
    li.dataset.layerId = layer.id;

    const visBtn = document.createElement('button');
    visBtn.className = 'layer-vis-btn';
    visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visBtn.setAttribute('aria-label', layer.visible ? 'Hide layer' : 'Show layer');
    visBtn.textContent = layer.visible ? '👁' : '🚫';
    visBtn.addEventListener('click', e => {
      e.stopPropagation();
      setLayerVisibility(layer.id, !layer.visible);
    });

    const lockBtn = document.createElement('button');
    lockBtn.className = 'layer-lock-btn';
    lockBtn.title = layer.locked ? 'Unlock layer' : 'Lock layer';
    lockBtn.setAttribute('aria-label', layer.locked ? 'Unlock layer' : 'Lock layer');
    lockBtn.textContent = layer.locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', e => {
      e.stopPropagation();
      setLayerLocked(layer.id, !layer.locked);
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-row-name';
    nameSpan.textContent = layer.name;
    nameSpan.title = 'Double-click to rename';
    nameSpan.addEventListener('dblclick', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = layer.name;
      input.className = 'layer-rename-input';
      nameSpan.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const newName = input.value.trim();
        if (newName && newName !== layer.name) renameLayer(layer.id, newName);
        else renderLayerPanel();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e2 => {
        if (e2.key === 'Enter') { commit(); }
        if (e2.key === 'Escape') { renderLayerPanel(); }
      });
    });

    const countSpan = document.createElement('span');
    countSpan.className = 'layer-row-count';
    countSpan.textContent = count;

    const delBtn = document.createElement('button');
    delBtn.className = 'layer-del-btn';
    delBtn.title = 'Delete layer';
    delBtn.setAttribute('aria-label', 'Delete layer');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteLayer(layer.id);
    });

    li.appendChild(visBtn);
    li.appendChild(lockBtn);
    li.appendChild(nameSpan);
    li.appendChild(countSpan);
    li.appendChild(delBtn);

    // Click row to make it the active layer for new components
    li.addEventListener('click', () => {
      activeLayerId = activeLayerId === layer.id ? null : layer.id;
      renderLayerPanel();
    });

    list.appendChild(li);
  });

  // Update the "Assign to layer" dropdown in properties if selection exists
  refreshLayerAssignDropdown();
}

/**
 * Refresh the layer-assign dropdown in the properties panel (if present).
 */
function refreshLayerAssignDropdown() {
  const sel = document.getElementById('prop-layer-assign');
  if (!sel) return;
  const currentLayer = selected?.layer || '';
  sel.innerHTML = '<option value="">— Default (unassigned) —</option>' +
    layers.map(l => `<option value="${l.id}"${currentLayer === l.id ? ' selected' : ''}>${l.name}</option>`).join('');
}

// ============================================================
// Gap #52 – Background Image / Site Plan Underlay
// ============================================================

/**
 * Load a File object as a base64 data URI and store it as the current
 * sheet's background image, then re-render and refresh the panel.
 * @param {File} file
 */
function uploadBackground(file) {
  const reader = new FileReader();
  reader.onload = e => {
    sheets[activeSheet].backgroundImage = {
      url: e.target.result,
      opacity: 0.4,
      visible: true
    };
    save();
    render();
    renderBgPanel();
  };
  reader.readAsDataURL(file);
}

/**
 * Remove the background image from the current sheet.
 */
function clearBackground() {
  delete sheets[activeSheet].backgroundImage;
  save();
  render();
  renderBgPanel();
}

/**
 * Sync the background image panel UI with the current sheet's backgroundImage
 * state. Shows the panel when an image is set, hides it otherwise.
 */
function renderBgPanel() {
  const panel = document.getElementById('bg-image-panel');
  const toggleBtn = document.getElementById('bg-toggle-btn');
  const slider = document.getElementById('bg-opacity-slider');
  if (!panel) return;

  const bg = sheets[activeSheet]?.backgroundImage;
  if (!bg || !bg.url) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  if (slider) slider.value = String(Math.round((bg.opacity ?? 0.4) * 100));
  if (toggleBtn) toggleBtn.textContent = bg.visible !== false ? 'Hide' : 'Show';
}

// ─── End Gap #51 ────────────────────────────────────────────────────────────

function render() {
  renderPerformance.begin({
    componentCount: components.length,
    connectionCount: connections.length,
  });
  updateLiveTelemetryControl();
  applyTransformerVoltages();
  propagateSourceVoltagesToBuses(components);
  applyDrawingModeClass();
  const engineeringPrint = isEngineeringPrintMode();
  operatingOverlayEnergizedSet = dataStateOverlayMode === 'operating' || showEnergizedState
    ? computeEnergizedSet(components, connections)
    : new Set();
  const svg = document.getElementById('diagram');
  const { surface: renderSurface, commit: commitRenderSurface, componentById, routeCandidates } = prepareAtomicRenderLayer(svg, svgNS, components, componentBounds);
  // Gap #52: re-insert background image underlay (positioned later by applyDiagramZoom)
  const existingBgUnderlay = svg.querySelector('#bg-underlay');
  if (existingBgUnderlay) existingBgUnderlay.remove();
  const bgImg = sheets[activeSheet]?.backgroundImage;
  if (bgImg && bgImg.visible !== false && bgImg.url) {
    const imgEl = document.createElementNS(svgNS, 'image');
    imgEl.setAttribute('id', 'bg-underlay');
    imgEl.setAttribute('href', bgImg.url);
    imgEl.setAttribute('opacity', String(bgImg.opacity ?? 0.4));
    imgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const gridBgEl = svg.querySelector('#grid-bg');
    if (gridBgEl) gridBgEl.after(imgEl);
    else svg.insertBefore(imgEl, svg.firstChild);
  }
  const usedVoltageRanges = new Set();
  const boundsState = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const includePoint = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    boundsState.minX = Math.min(boundsState.minX, x);
    boundsState.minY = Math.min(boundsState.minY, y);
    boundsState.maxX = Math.max(boundsState.maxX, x);
    boundsState.maxY = Math.max(boundsState.maxY, y);
  };
  const includeComponentBounds = comp => {
    if (!comp) return;
    const bounds = componentVisualBounds(comp);
    includePoint(bounds.left, bounds.top);
    includePoint(bounds.right, bounds.bottom);
  };
  let lengthsChanged = false;
  if (gridEnabled) {
    components.forEach(c => {
      c.x = Math.round(c.x / gridSize) * gridSize;
      c.y = Math.round(c.y / gridSize) * gridSize;
    });
  }
  const datablockLayout = createDatablockLayout(components);

  const routeConnection = (source, target, connection) => buildConnectionRoute(source, target, connection, {
    portPosition,
    portDirection,
    isBusComponent,
    isConductorSegmentComponent,
    routeCandidates,
    diagramViewport,
    orthogonalRouting,
    defaultWidth: compWidth,
    defaultHeight: compHeight,
    maxAdjustSteps: MAX_ROUTE_ADJUST_STEPS
  });
  // dimension tool removed

  // Gap #51: build a Set of hidden-layer component ids for O(1) lookup
  const hiddenLayerIds = new Set(
    layers.filter(l => !l.visible).map(l => l.id)
  );
  const isHiddenByLayer = comp => comp.layer && hiddenLayerIds.has(comp.layer);
  const isLockedByLayer = comp => {
    const l = comp.layer ? layers.find(ly => ly.id === comp.layer) : null;
    return l ? l.locked : false;
  };
  const labelCollisionBoxes = components
    .filter(comp => !isHiddenByLayer(comp))
    .map(componentVisualBounds)
    .filter(Boolean);
  const labelCollisionIndex = createBoxSpatialIndex(labelCollisionBoxes);
  const boxesOverlap = (a, b, padding = 14) => !(
    a.right + padding < b.left
    || a.left - padding > b.right
    || a.bottom + padding < b.top
    || a.top - padding > b.bottom
  );
  const connectionLabelBox = (position, text) => {
    const width = estimateTextWidth(text, 12);
    const left = position.textAnchor === 'start'
      ? position.x
      : position.textAnchor === 'end'
        ? position.x - width
        : position.x - width / 2;
    return { left, top: position.y - 9, right: left + width, bottom: position.y + 9 };
  };
  const resolveConnectionLabelPosition = (position, text) => {
    const offsets = [0, -18, 18, -36, 36, -54, 54, -72, 72, -90, 90, -108, 108, -126, 126];
    for (const offset of offsets) {
      const candidate = { ...position, y: position.y + offset };
      const box = connectionLabelBox(candidate, text);
      if (!labelCollisionIndex.hasOverlap(box, existing => boxesOverlap(box, existing), 14)) {
        labelCollisionBoxes.push(box); labelCollisionIndex.add(box);
        return candidate;
      }
    }
    const fallback = { ...position, y: position.y - 144 };
    const fallbackBox = connectionLabelBox(fallback, text);
    labelCollisionBoxes.push(fallbackBox); labelCollisionIndex.add(fallbackBox);
    return fallback;
  };
  const connectionRenderResult = renderConnections({
    documentRef: document,
    svgNS,
    components,
    componentById,
    renderSurface,
    routeConnection,
    isHiddenByLayer,
    includePoint,
    getCableForConnection,
    getVoltageRange,
    usedVoltageRanges,
    parseCablePhases,
    phaseColors,
    cableColors,
    engineeringPrint,
    showOverlays,
    classifyConnectionRole,
    selectedConnection,
    componentMatchesDiagramFilter,
    isConductorSegmentComponent,
    canEditConnectionWaypoint,
    toDiagramCoords,
    onSelectConnection: (component, index) => {
      selected = null;
      selection = [];
      selectedConnection = { component, index };
      setRightRailTab('properties');
      render();
    },
    onEditCableComponent: async cableComponent => {
      cancelPendingClickSelection();
      await editCableComponent(cableComponent);
    },
    onStartWaypointDrag: dragState => {
      draggingConnection = dragState;
    },
    isBusComponent,
    connectionLabelPosition,
    getTransformerPortRole,
    dataStateOverlayMode,
    formatOverlayMetric,
    getStudyProvenance,
    resolveConnectionLabelPosition
  });
  const junctionPoints = connectionRenderResult.junctions;
  if (connectionRenderResult.lengthsChanged) lengthsChanged = true;
  // draw nodes
  renderComponentNodes({
    documentRef: document,
    activeOperatingState,
    appendConnectedTerminalBridges,
    asset,
    attachLabelInteractions,
    buildTransformerPortLabel,
    cancelPendingClickSelection,
    compHeight,
    compWidth,
    componentLabelBounds,
    componentMatchesDiagramFilter,
    components,
    connectMode,
    connectSource,
    datablockLayout,
    dataStateOverlayLabels,
    dataStateOverlayMode,
    engineeringPrint,
    ensureShapeDefaults,
    findHighlightId,
    getComponentAttributeLines,
    getComponentColorInfo,
    getComponentLabelText,
    getComponentOperatingStatus,
    getComponentReviewBadges,
    getFiniteVoltageMagnitudes,
    getLabelAlignment,
    getLabelBaseline,
    getLabelPosition,
    getSheetLinkBadgeText,
    getVoltageMagnitudeEntries,
    getVoltageRange,
    hideTooltip,
    includeComponentBounds,
    includePoint,
    isBusComponent,
    isComponentPositionLocked,
    isConductorSegmentComponent,
    isHiddenByLayer,
    isLockedByLayer,
    moveTooltip,
    navigateToLinkedSheet,
    normalizeLowerChoice,
    normalizePortIndex,
    normalizeRotation,
    normalizeSheetLinkValue,
    operatingStateLabels,
    placeholderIcon,
    portDirection,
    portInUse,
    portPosition,
    renderComponentDatablock,
    renderDataStateBadge,
    renderOperatingStateBadge,
    renderSurface,
    resolveComponentMeta,
    selectComponent,
    selection,
    shapeDashPatterns,
    sheets,
    showOverlays,
    showTooltip,
    startInlineLabelEdit,
    svgNS,
    symbolStandard,
    usedVoltageRanges
  });
  junctionPoints.forEach(point => {
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', point.x);
    dot.setAttribute('cy', point.y);
    dot.setAttribute('r', 3.2);
    dot.setAttribute('fill', point.color || '#111827');
    dot.setAttribute('stroke', 'var(--ol-canvas-bg, #ffffff)');
    dot.setAttribute('stroke-width', 1.2);
    dot.classList.add('connection-junction');
    dot.style.pointerEvents = 'none';
    renderSurface.appendChild(dot);
  });

  commitRenderSurface();
  if (!engineeringPrint) applyValidationIssueMarkers(svg);

  if (!engineeringPrint && marquee && marquee.active) {
    const rect = document.createElementNS(svgNS, 'rect');
    const x = Math.min(marquee.x1, marquee.x2);
    const y = Math.min(marquee.y1, marquee.y2);
    const width = Math.abs(marquee.x2 - marquee.x1);
    const height = Math.abs(marquee.y2 - marquee.y1);
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('fill', marquee.x2 < marquee.x1 ? 'rgba(76, 175, 80, 0.15)' : 'rgba(33, 150, 243, 0.15)');
    rect.setAttribute('stroke', marquee.x2 < marquee.x1 ? '#4caf50' : '#2196f3');
    rect.setAttribute('stroke-width', '1');
    if (marquee.x2 < marquee.x1) rect.setAttribute('stroke-dasharray', '6 4');
    rect.classList.add('selection-marquee');
    rect.style.pointerEvents = 'none';
    renderSurface.appendChild(rect);
  }

  updateDiagramViewport(boundsState);
  applyDiagramZoom();
  updateLegend(usedVoltageRanges);
  updateStatusBar();

  // Gap #50 – Protection zone overlay (rendered first, beneath all other overlays)
  if (!engineeringPrint && showProtectionZones) renderProtectionZones(svg);

  // Gap #94 – Hazardous area classification overlay
  if (!engineeringPrint && showHazAreaOverlay) renderHazAreaOverlay(svg);

  // Gap #36 – Energized / de-energized operating-state overlay
  renderEnergizedState(svg);

  // Gap #45 – Animated power-flow indicators (when overlays are active)
  if (!engineeringPrint && showOverlays) renderFlowAnimations(svg);

  // Gap #39 – Minimap
  if (engineeringPrint) {
    document.querySelector('.minimap-container')?.classList.add('hidden');
  } else {
    renderMinimap();
  }

  // Gap #49 – Arc Flash label badge overlays
  if (!engineeringPrint && arcFlashLabelMode) renderArcFlashLabelOverlays(svg);

  renderDragSnapGuides(svg);

  if (lengthsChanged) {
    renderPerformance.finish({ repeatedForCalculatedLengths: true });
    render();
    return;
  }
  renderRightRail();
  renderPerformance.finish();
}

export function toggleGrid() {
  const toggle = document.getElementById('grid-toggle');
  gridEnabled = toggle?.checked;
  setOneLineViewSetting('gridEnabled', gridEnabled);
  document.getElementById('grid-bg').style.display = gridEnabled ? 'block' : 'none';
  if (gridEnabled && snapComponentsToGrid(components, gridSize)) render();
}

// ----------------------------------------------------------------
// Gap #36 – Energized / de-energized state rendering
// ----------------------------------------------------------------
function renderEnergizedState(svg) {
  // Remove previous de-energized overlays
  svg.querySelectorAll('.de-energized-overlay').forEach(el => el.remove());
  if (!showEnergizedState) return;
  const energized = operatingOverlayEnergizedSet.size
    ? operatingOverlayEnergizedSet
    : computeEnergizedSet(components, connections);
  components.forEach(c => {
    const g = svg.querySelector(`g.component[data-id="${escapeHtml(c.id)}"]`);
    if (!g) return;
    if (!energized.has(c.id)) {
      g.classList.add('de-energized');
      if (isEngineeringPrintMode()) return;
      const w = c.width || compWidth;
      const h = c.height || compHeight;
      const overlay = document.createElementNS(svgNS, 'rect');
      overlay.setAttribute('x', c.x);
      overlay.setAttribute('y', c.y);
      overlay.setAttribute('width', w);
      overlay.setAttribute('height', h);
      overlay.classList.add('de-energized-overlay');
      g.appendChild(overlay);
    } else {
      g.classList.remove('de-energized');
    }
  });
}

// ----------------------------------------------------------------
// Gap #50 – Protection zone translucent region overlays
// ----------------------------------------------------------------
function renderProtectionZones(svg) {
  svg.querySelectorAll('.protection-zone-overlay, .protection-zone-label').forEach(el => el.remove());
  const zones = (sheets[activeSheet] || {}).protectionZones || [];
  zones.forEach(zone => {
    if (!zone.visible || !zone.componentIds?.length) return;
    const bounds = computeProtectionZoneBounds(zone, components, { boundsFor: componentBounds });
    if (!bounds) return;
    const { x: rx, y: ry, width: rw, height: rh } = bounds;

    // Translucent zone rectangle — inserted before first connection so it renders beneath cables
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', rx);
    rect.setAttribute('y', ry);
    rect.setAttribute('width', rw);
    rect.setAttribute('height', rh);
    rect.setAttribute('fill', zone.color);
    rect.setAttribute('stroke', zone.color);
    rect.setAttribute('stroke-width', '1.5');
    rect.classList.add('protection-zone-overlay');
    const firstConn = svg.querySelector('polyline');
    if (firstConn) firstConn.parentNode.insertBefore(rect, firstConn);
    else svg.appendChild(rect);

    // Zone name label above the rectangle
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', rx + rw / 2);
    label.setAttribute('y', ry - 4);
    label.setAttribute('fill', zone.color);
    label.classList.add('protection-zone-label');
    label.textContent = zone.name;
    svg.appendChild(label);

    // In assignment mode: draw a small colored dot badge on each assigned component
    if (activeZoneId === zone.id) {
      zone.componentIds.forEach(id => {
        const comp = components.find(c => c.id === id);
        if (!comp) return;
        const b = componentBounds(comp);
        const dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('cx', b.right - 4);
        dot.setAttribute('cy', b.top + 4);
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', zone.color);
        dot.setAttribute('stroke', '#fff');
        dot.setAttribute('stroke-width', '1');
        dot.classList.add('protection-zone-overlay', 'zone-assign-dot');
        svg.appendChild(dot);
      });
    }
  });
}

// Gap #94 – Hazardous area classification overlay
// Color-codes components by their assigned hazAreaClassification zone.
// Components carry an optional `hazAreaId` metadata field; areas and their
// Ex-compatibility results are read from the project-level hazAreaClassification study.
function renderHazAreaOverlay(svg) {
  svg.querySelectorAll('.haz-area-overlay, .haz-area-label, .haz-area-badge').forEach(el => el.remove());

  const hazStudy = cachedStudyResults?.hazAreaClassification || null;
  if (!hazStudy || !hazStudy.areas) return;

  // Zone color map — matches IEC severity (Zone 0 = red, Zone 1 = orange, Zone 2 = yellow)
  const ZONE_COLORS = {
    '0': 'rgba(220,50,50,0.18)', '1': 'rgba(230,140,40,0.18)', '2': 'rgba(220,200,50,0.18)',
    '20': 'rgba(220,50,50,0.18)', '21': 'rgba(230,140,40,0.18)', '22': 'rgba(220,200,50,0.18)',
    // NEC equivalents
    'I-1': 'rgba(220,50,50,0.18)', 'I-2': 'rgba(220,200,50,0.18)',
    'II-1': 'rgba(220,50,50,0.18)', 'II-2': 'rgba(220,200,50,0.18)',
  };
  const ZONE_STROKE = {
    '0': '#dc3232', '1': '#e68c28', '2': '#dcc832',
    '20': '#dc3232', '21': '#e68c28', '22': '#dcc832',
    'I-1': '#dc3232', 'I-2': '#dcc832',
    'II-1': '#dc3232', 'II-2': '#dcc832',
  };

  const areaFailIds = new Set((hazStudy.equipment || [])
    .filter(r => r.pass === false)
    .map(r => r.areaId));

  hazStudy.areas.forEach(area => {
    const areaKey = area.iecZone || area.dustZone ||
                    (area.necClass && area.necDivision ? `${area.necClass}-${area.necDivision}` : null);
    const fill   = (areaFailIds.has(area.id) ? 'rgba(220,50,50,0.28)' : ZONE_COLORS[areaKey]) || 'rgba(100,100,220,0.13)';
    const stroke = (areaFailIds.has(area.id) ? '#dc3232' : ZONE_STROKE[areaKey]) || '#6464dc';

    // Find all components in this area
    const areaComponents = components.filter(c => c.hazAreaId === area.id);
    if (areaComponents.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    areaComponents.forEach(comp => {
      const b = componentBounds(comp);
      minX = Math.min(minX, b.left);
      minY = Math.min(minY, b.top);
      maxX = Math.max(maxX, b.right);
      maxY = Math.max(maxY, b.bottom);
    });
    if (!Number.isFinite(minX)) return;

    const pad = 14;
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', minX - pad);
    rect.setAttribute('y', minY - pad);
    rect.setAttribute('width', maxX - minX + pad * 2);
    rect.setAttribute('height', maxY - minY + pad * 2);
    rect.setAttribute('fill', fill);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('stroke-dasharray', '5,3');
    rect.classList.add('haz-area-overlay');
    const firstConn = svg.querySelector('polyline');
    if (firstConn) firstConn.parentNode.insertBefore(rect, firstConn);
    else svg.appendChild(rect);

    // Designation label
    const labelText = `${area.label || area.id} (${area.designation || ''})`;
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', minX - pad + 4);
    label.setAttribute('y', minY - pad - 4);
    label.setAttribute('fill', stroke);
    label.setAttribute('font-size', '10');
    label.classList.add('haz-area-label');
    label.textContent = labelText;
    svg.appendChild(label);

    // Fail badge on failing components
    if (areaFailIds.has(area.id)) {
      areaComponents.forEach(comp => {
        const b = componentBounds(comp);
        const badge = document.createElementNS(svgNS, 'circle');
        badge.setAttribute('cx', b.right - 4);
        badge.setAttribute('cy', b.top + 4);
        badge.setAttribute('r', '5');
        badge.setAttribute('fill', '#dc3232');
        badge.setAttribute('stroke', '#fff');
        badge.setAttribute('stroke-width', '1');
        badge.classList.add('haz-area-badge');
        svg.appendChild(badge);
      });
    }
  });
}

/**
 * Return the protectionZones array for the active sheet, initialising it if absent.
 */
function getProtectionZones() {
  return getProtectionZonesModel(sheets[activeSheet]);
}

function createProtectionZone(name) {
  const zone = createProtectionZoneModel(sheets[activeSheet], name);
  pushHistory(`Created protection zone: ${zone.name}`);
  save(false);
  renderProtectionZonesPanel();
  render();
  return zone;
}

function deleteProtectionZone(zoneId) {
  if (!deleteProtectionZoneModel(sheets[activeSheet], zoneId)) return;
  if (activeZoneId === zoneId) activeZoneId = null;
  pushHistory('Deleted protection zone');
  save(false);
  renderProtectionZonesPanel();
  render();
}

function renameProtectionZone(zoneId, newName) {
  if (!renameProtectionZoneModel(sheets[activeSheet], zoneId, newName)) return;
  pushHistory('Renamed protection zone');
  save(false);
  renderProtectionZonesPanel();
  render();
}

function setZoneVisibility(zoneId, visible) {
  if (!setProtectionZoneVisibility(sheets[activeSheet], zoneId, visible)) return;
  pushHistory(`${visible ? 'Showed' : 'Hid'} protection zone`);
  save(false);
  renderProtectionZonesPanel();
  render();
}

function setZoneColor(zoneId, color) {
  if (!setProtectionZoneColor(sheets[activeSheet], zoneId, color)) return;
  pushHistory('Changed protection zone color');
  save(false);
  renderProtectionZonesPanel();
  render();
}

function toggleComponentInZone(zoneId, compId) {
  if (!toggleProtectionZoneComponent(sheets[activeSheet], zoneId, compId)) return;
  pushHistory('Changed protection zone assignment');
  save(false);
  renderProtectionZonesPanel();
  render();
}

function enterZoneAssignMode(zoneId) {
  activeZoneId = zoneId;
  const banner = document.getElementById('zone-assign-mode-banner');
  if (banner) banner.classList.remove('hidden');
  renderProtectionZonesPanel();
  render();
}

function exitZoneAssignMode() {
  activeZoneId = null;
  const banner = document.getElementById('zone-assign-mode-banner');
  if (banner) banner.classList.add('hidden');
  renderProtectionZonesPanel();
  render();
}

/**
 * Build the protection zones panel list.
 */
function renderProtectionZonesPanel() {
  renderProtectionZonePanel({
    list: document.getElementById('protection-zone-list'),
    zones: getProtectionZones(),
    activeZoneId,
    onColorChange: setZoneColor,
    onVisibilityChange: setZoneVisibility,
    onRename: renameProtectionZone,
    onAssign: (zoneId, shouldEnter) => {
      if (shouldEnter) enterZoneAssignMode(zoneId);
      else exitZoneAssignMode();
    },
    onDelete: deleteProtectionZone,
    onRefresh: renderProtectionZonesPanel
  });
}

// ----------------------------------------------------------------
// Gap #45 – Animated power-flow indicators on connections
// ----------------------------------------------------------------
function renderFlowAnimations(svg) {
  svg.querySelectorAll('.flow-arrow').forEach(el => el.remove());
  if (dataStateOverlayMode !== 'loadFlow' || getStudyProvenance('loadFlow').status !== 'current') return;
  components.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      const kw = conn.loading_kW;
      if (kw === undefined || kw === null) return;
      const target = components.find(c => c.id === conn.target);
      if (!target) return;
      const fromPos = portPosition(comp, conn.sourcePort ?? 0);
      const toPos = portPosition(target, conn.targetPort ?? 0);
      if (!fromPos || !toPos) return;
      const dx = toPos.x - fromPos.x;
      const dy = toPos.y - fromPos.y;
      const len = Math.hypot(dx, dy);
      if (len < 10) return;
      // Determine direction; negative kW means reverse flow
      const forward = Number(kw) >= 0;
      const sx = forward ? fromPos.x : toPos.x;
      const sy = forward ? fromPos.y : toPos.y;
      const ex = forward ? toPos.x : fromPos.x;
      const ey = forward ? toPos.y : fromPos.y;
      const pathD = `M${sx},${sy} L${ex},${ey}`;
      // Arrow head
      const arrow = document.createElementNS(svgNS, 'path');
      arrow.setAttribute('d', 'M-4,-3 L4,0 L-4,3 Z');
      arrow.classList.add('flow-arrow');
      const animPath = document.createElementNS(svgNS, 'path');
      animPath.setAttribute('d', pathD);
      animPath.setAttribute('fill', 'none');
      animPath.setAttribute('stroke', 'none');
      const motion = document.createElementNS(svgNS, 'animateMotion');
      const absMag = Math.min(Math.max(Math.abs(Number(kw)) || 50, 1), 5000);
      const dur = Number(Math.max(0.5, Math.min(3, 200 / absMag)).toFixed(2));
      motion.setAttribute('dur', `${dur}s`);
      motion.setAttribute('repeatCount', 'indefinite');
      motion.setAttribute('rotate', 'auto');
      const mpathEl = document.createElementNS(svgNS, 'mpath');
      // Inline path instead of href for compatibility
      motion.setAttribute('path', pathD);
      arrow.appendChild(motion);
      svg.appendChild(arrow);
    });
  });
}

// ----------------------------------------------------------------
// Gap #39 – Minimap / overview navigator
// ----------------------------------------------------------------
function renderMinimap() {
  const container = document.getElementById('minimap-container');
  const minimapSvg = document.getElementById('minimap-svg');
  if (!container || !minimapSvg) return;
  if (!minimapVisible) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  minimapSvg.innerHTML = '';
  if (!components.length) return;
  // Compute diagram bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  components.forEach(c => {
    const b = componentBounds(c);
    minX = Math.min(minX, b.left); minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.right); maxY = Math.max(maxY, b.bottom);
  });
  if (!Number.isFinite(minX)) return;
  const pad = 20;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const dw = maxX - minX || 1;
  const dh = maxY - minY || 1;
  const mw = 180, mh = 120;
  const scale = Math.min(mw / dw, mh / dh);
  const ox = (mw - dw * scale) / 2;
  const oy = (mh - dh * scale) / 2;
  const toMx = x => (x - minX) * scale + ox;
  const toMy = y => (y - minY) * scale + oy;
  // Draw simplified component rects
  components.forEach(c => {
    if (c.type === 'group') return;
    const w = c.width || compWidth;
    const h = c.height || compHeight;
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', toMx(c.x));
    rect.setAttribute('y', toMy(c.y));
    rect.setAttribute('width', Math.max(2, w * scale));
    rect.setAttribute('height', Math.max(2, h * scale));
    rect.setAttribute('fill', '#888');
    rect.setAttribute('rx', '1');
    minimapSvg.appendChild(rect);
  });
  // Draw viewport rectangle
  const editor = document.querySelector('.oneline-canvas-scroll');
  if (editor) {
    const zoom = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
    const vpLeft = editor.scrollLeft / zoom + diagramViewport.minX;
    const vpTop = editor.scrollTop / zoom + diagramViewport.minY;
    const vpW = editor.clientWidth / zoom;
    const vpH = editor.clientHeight / zoom;
    const vpRect = document.createElementNS(svgNS, 'rect');
    vpRect.setAttribute('x', Math.max(0, toMx(vpLeft)));
    vpRect.setAttribute('y', Math.max(0, toMy(vpTop)));
    vpRect.setAttribute('width', Math.min(mw, vpW * scale));
    vpRect.setAttribute('height', Math.min(mh, vpH * scale));
    vpRect.classList.add('minimap-viewport');
    minimapSvg.appendChild(vpRect);
  }
}

// ----------------------------------------------------------------
// Gap #49 – Arc Flash label badge overlays on one-line diagram
// ----------------------------------------------------------------
function renderArcFlashLabelOverlays(svg) {
  svg.querySelectorAll('.af-label-badge').forEach(el => el.remove());
  const afResults = cachedStudyResults?.arcFlash;
  if (!afResults || typeof afResults !== 'object') return;

  const BADGE_W = 124;
  const BANNER_H = 18;
  const BODY_H = 52;
  const BADGE_H = BANNER_H + BODY_H;
  const FONT = 'Helvetica, Arial, sans-serif';

  components.forEach(comp => {
    const af = afResults[comp.id];
    if (!af || !Number.isFinite(af.incidentEnergy)) return;

    const bounds = componentBounds(comp);
    const cx = (bounds.left + bounds.right) / 2;
    const cy = bounds.top;

    const ie = af.incidentEnergy;
    const bannerColor = ie >= 40 ? '#b91c1c' : '#f57c00';
    const signalWord = ie >= 40 ? 'DANGER' : 'WARNING';
    const minArcRating = Number(af.minimumArcRatingCalCm2);
    const ppeText = minArcRating > 0 ? `Arc rating ≥ ${minArcRating.toFixed(2)}` : 'IE method';
    const ieText = `IE: ${ie.toFixed(2)} cal/cm²`;
    const boundary = Number(af.boundary);
    const clearingTime = Number(af.clearingTime);
    const workingDistance = Number(af.workingDistance);
    const boundaryText = Number.isFinite(boundary) && boundary > 0 ? `AFB: ${Math.round(boundary)} mm` : 'AFB: not available';
    const timingText = Number.isFinite(clearingTime) && clearingTime > 0
      ? `Clear: ${clearingTime.toFixed(3)} s${Number.isFinite(workingDistance) ? ` @ ${Math.round(workingDistance)} mm` : ''}`
      : 'Clearing time: not available';
    const provenance = getStudyProvenance('arcFlash');

    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'af-label-badge');
    g.setAttribute('transform', `translate(${cx - BADGE_W / 2},${cy - BADGE_H - 4})`);
    g.setAttribute('pointer-events', 'none');

    // Outer border
    const border = document.createElementNS(svgNS, 'rect');
    border.setAttribute('x', 0); border.setAttribute('y', 0);
    border.setAttribute('width', BADGE_W); border.setAttribute('height', BADGE_H);
    border.setAttribute('fill', '#fff'); border.setAttribute('stroke', '#000');
    border.setAttribute('stroke-width', '1');
    g.appendChild(border);

    // Colored signal banner
    const banner = document.createElementNS(svgNS, 'rect');
    banner.setAttribute('x', 0); banner.setAttribute('y', 0);
    banner.setAttribute('width', BADGE_W); banner.setAttribute('height', BANNER_H);
    banner.setAttribute('fill', bannerColor);
    g.appendChild(banner);

    // Signal word text
    const sigText = document.createElementNS(svgNS, 'text');
    sigText.setAttribute('x', BADGE_W / 2); sigText.setAttribute('y', BANNER_H - 4);
    sigText.setAttribute('text-anchor', 'middle');
    sigText.setAttribute('font-size', '11'); sigText.setAttribute('font-weight', 'bold');
    sigText.setAttribute('fill', '#fff'); sigText.setAttribute('font-family', FONT);
    sigText.textContent = signalWord;
    g.appendChild(sigText);

    // Incident-energy PPE-selection line
    const ppeLine = document.createElementNS(svgNS, 'text');
    ppeLine.setAttribute('x', 4); ppeLine.setAttribute('y', BANNER_H + 11);
    ppeLine.setAttribute('font-size', '9'); ppeLine.setAttribute('fill', '#000');
    ppeLine.setAttribute('font-family', FONT);
    ppeLine.textContent = ppeText;
    g.appendChild(ppeLine);

    // Incident energy line
    const ieLine = document.createElementNS(svgNS, 'text');
    ieLine.setAttribute('x', 4); ieLine.setAttribute('y', BANNER_H + 23);
    ieLine.setAttribute('font-size', '9'); ieLine.setAttribute('fill', '#000');
    ieLine.setAttribute('font-family', FONT);
    ieLine.textContent = ieText;
    g.appendChild(ieLine);

    const boundaryLine = document.createElementNS(svgNS, 'text');
    boundaryLine.setAttribute('x', 4); boundaryLine.setAttribute('y', BANNER_H + 34);
    boundaryLine.setAttribute('font-size', '9'); boundaryLine.setAttribute('fill', '#000');
    boundaryLine.setAttribute('font-family', FONT);
    boundaryLine.textContent = boundaryText;
    g.appendChild(boundaryLine);

    const timingLine = document.createElementNS(svgNS, 'text');
    timingLine.setAttribute('x', 4); timingLine.setAttribute('y', BANNER_H + 45);
    timingLine.setAttribute('font-size', '8'); timingLine.setAttribute('fill', '#000');
    timingLine.setAttribute('font-family', FONT);
    timingLine.textContent = timingText;
    g.appendChild(timingLine);

    const statusTitle = document.createElementNS(svgNS, 'title');
    statusTitle.textContent = `Arc-flash result: ${provenance.status}; ${provenance.approval}; scenario ${provenance.scenario}`;
    g.appendChild(statusTitle);

    svg.appendChild(g);
  });
}

// ----------------------------------------------------------------
// Gap #38 – Title block rendering
// ----------------------------------------------------------------
function renderTitleBlock() {
  let overlay = document.getElementById('title-block-overlay');
  if (!showTitleBlock) {
    if (overlay) overlay.style.display = 'none';
    return;
  }
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'title-block-overlay';
    const canvasScroll = document.querySelector('.oneline-canvas-scroll');
    if (canvasScroll) canvasScroll.appendChild(overlay);
  }
  overlay.style.display = 'block';
  const f = titleBlockFields;
  const rows = [
    ['Project', f.projectName || ''],
    ['Drawing No.', f.drawingNumber || ''],
    ['Revision', f.revision || ''],
    ['Date', f.revDate || ''],
    ['Drawn By', f.drawnBy || ''],
    ['Checked By', f.checkedBy || ''],
    ['Company', f.company || ''],
    ['PE Stamp', f.peStamp || ''],
  ];
  overlay.innerHTML = `<table class="title-block-table" aria-label="Drawing title block">
    ${rows.map(([k, v]) => `<tr><td class="tb-key">${escapeHtml(k)}</td><td class="tb-val">${escapeHtml(v)}</td></tr>`).join('')}
  </table>`;
}

// ----------------------------------------------------------------
// Gap #46 – Open datablock configuration modal
// ----------------------------------------------------------------
function openDatablocksModal() {
  const subtypes = [...new Set(components.map(c => c.subtype || c.type).filter(Boolean))];
  if (!subtypes.length) { showToast('No components in diagram to configure'); return; }
  const studyFields = ['voltage_mag', 'shortCircuit.threePhaseKA', 'loading_kW', 'loading_amps', 'arcFlash.incidentEnergy', 'reliability.mtbf'];
  let activeSubtype = subtypes[0];
  const modal = openModal({
    title: 'Configure Data Display (Datablocks)',
    content: '',
    buttons: [
      { text: 'Save', primary: true, id: 'datablock-save-btn' },
      { text: 'Cancel', id: 'datablock-cancel-btn' }
    ]
  });
  if (!modal) return;
  const body = modal.querySelector('.modal-body') || modal.querySelector('.prop-form');
  if (!body) return;
  const grid = document.createElement('div');
  grid.className = 'datablock-config-grid';
  const typeList = document.createElement('div');
  typeList.className = 'datablock-type-list';
  const fieldList = document.createElement('div');
  fieldList.className = 'datablock-field-list';
  grid.appendChild(typeList);
  grid.appendChild(fieldList);
  body.appendChild(grid);
  const renderFieldList = (subtype) => {
    fieldList.innerHTML = '';
    const comp = components.find(c => (c.subtype || c.type) === subtype);
    const meta = componentMeta[subtype] || {};
    const schemaFields = (meta.schema || []).map(f => f.name).filter(Boolean);
    const allFields = [...new Set([...schemaFields, ...studyFields])];
    const current = diagramDatablockConfig[subtype] || [];
    allFields.forEach(fieldName => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = fieldName;
      cb.checked = current.includes(fieldName);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + fieldName));
      fieldList.appendChild(label);
    });
  };
  const renderTypeList = () => {
    typeList.innerHTML = '';
    subtypes.forEach(st => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = st;
      btn.className = st === activeSubtype ? 'active' : '';
      btn.addEventListener('click', () => {
        activeSubtype = st;
        typeList.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.textContent === st));
        renderFieldList(st);
      });
      typeList.appendChild(btn);
    });
  };
  renderTypeList();
  renderFieldList(activeSubtype);
  const saveBtn = modal.querySelector('#datablock-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      // Collect checked fields for current subtype
      const checked = [...fieldList.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
      diagramDatablockConfig[activeSubtype] = checked;
      setItem('diagramDatablockConfig', diagramDatablockConfig);
      render();
      modal.classList.remove('show');
    });
  }
}

function flashSnapIndicator(x, y) {
  const svg = document.getElementById('diagram');
  let indicator = document.getElementById('snap-indicator');
  if (!indicator) {
    indicator = document.createElementNS(svgNS, 'circle');
    indicator.id = 'snap-indicator';
    svg.appendChild(indicator);
  }
  indicator.setAttribute('r', Math.max(2, gridSize / 4));
  indicator.setAttribute('cx', x);
  indicator.setAttribute('cy', y);
  indicator.style.opacity = '1';
  clearTimeout(snapIndicatorTimeout);
  snapIndicatorTimeout = setTimeout(() => {
    indicator.style.opacity = '0';
  }, 200);
}

let sheetPersistenceController = null;

function getSheetPersistenceController() {
  if (!sheetPersistenceController) {
    sheetPersistenceController = createSheetPersistenceController({
      documentRef: document,
      getState: () => ({ sheets, activeSheet, components, connections, layers }),
      onActivateSheet: (index, sheet, { resetHistory = true } = {}) => {
        activeSheet = index;
        components = sheet.components;
        components.forEach(normalizeComponentElectricalProperties);
        connections = sheet.connections;
        layers = Array.isArray(sheet.layers) ? sheet.layers : [];
        activeLayerId = null;
        if (resetHistory) {
          historyController.reset();
          checkpoints = [];
          historyEvents = [];
          recordHistoryEvent('sheet', `Switched to sheet ${index + 1}`);
          selection = [];
          selected = null;
          selectedConnection = null;
        }
      },
      onPersistedSheets: state => {
        sheets = state.sheets;
        activeSheet = state.activeSheet;
        components = state.components;
        connections = state.connections;
      },
      onAfterSheetLoad: () => {
        refreshAttributeOptions();
        renderLayerPanel();
        renderBgPanel();
        activeZoneId = null;
        renderProtectionZonesPanel();
        needsInitialViewportCenter = true;
        pendingInitialCenter = null;
        render();
      },
      onAfterSheetDelete: () => {
        refreshAttributeOptions();
        renderLayerPanel();
        render();
      },
      persistOneLine: setOneLine,
      persistDiagramScale: scale => setItem('diagramScale', scale),
      getDiagramScale: () => diagramScale,
      normalizeDiagramScale,
      synchronizeProjectData: synchronizeProjectDataFromDiagram,
      validateDiagram,
      getProtectionZones,
      promptDialog,
      confirmDialog,
      showToast
    });
  }
  return sheetPersistenceController;
}

function renderSheetTabs() {
  getSheetPersistenceController().renderTabs();
}

function loadSheet(index, options) {
  getSheetPersistenceController().load(index, options);
}

async function addSheet(name) {
  await getSheetPersistenceController().add(name);
}
// ============================================================
// Gap #48 – Cross-Sheet Off-Page Connector helpers (pure, testable)
// ============================================================

/**
 * Navigate to the sheet paired with a sheet_link component and highlight the
 * partner connector. Called on double-click of any sheet_link component.
 */
function navigateToLinkedSheet(comp) {
  const linkId = normalizeSheetLinkValue(comp.props?.link_id ?? comp.link_id);
  let targetIdx = resolveLinkedSheetIndex(comp, sheets);
  let pairedComp = null;
  if (linkId) {
    const result = findPairedConnector(linkId, comp.subtype, sheets);
    if (result) {
      if (targetIdx === -1) targetIdx = result.sheetIndex;
      pairedComp = result.component;
    }
  }
  if (targetIdx === -1) {
    const name = normalizeSheetLinkValue(comp.props?.linked_sheet ?? comp.linked_sheet);
    showToast(`Sheet link target "${name || '(unset)'}" not found`);
    return;
  }
  if (targetIdx === activeSheet) {
    showToast('Sheet link points to current sheet');
    return;
  }
  loadSheet(targetIdx);
  if (pairedComp) {
    selection = [pairedComp];
    selected = pairedComp;
    selectedConnection = null;
    findHighlightId = pairedComp.id;
    if (findHighlightTimer) clearTimeout(findHighlightTimer);
    findHighlightTimer = window.setTimeout(() => {
      findHighlightId = null;
      findHighlightTimer = null;
      render();
    }, 3000);
    render();
  }
}

async function renameSheet(id, newName) {
  await getSheetPersistenceController().rename(id, newName);
}

async function deleteSheet(id) {
  await getSheetPersistenceController().remove(id);
}

function save(notify = true) {
  return getSheetPersistenceController().save(notify);
}
function updateBusPorts(bus) {
  const spacing = 20;
  const ports = [];
  for (let px = 0; px <= bus.width; px += spacing) {
    ports.push({ x: px, y: 0 });
    ports.push({ x: px, y: bus.height });
  }
  bus.ports = ports;
}

function getStaticViewportCenter() {
  return {
    x: STATIC_VIEWPORT_BOUNDS.minX + STATIC_VIEWPORT_BOUNDS.width / 2,
    y: STATIC_VIEWPORT_BOUNDS.minY + STATIC_VIEWPORT_BOUNDS.height / 2
  };
}

function getDefaultInsertionPoint() {
  if (cursorPosValid && Number.isFinite(cursorPos.x) && Number.isFinite(cursorPos.y)) {
    return { x: cursorPos.x, y: cursorPos.y };
  }
  const center = getViewportCenter();
  if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
    return center;
  }
  return getStaticViewportCenter();
}

function overlapsExistingComponent(x, y, width, height) {
  const test = {
    left: x - gridSize,
    top: y - gridSize,
    right: x + width + gridSize,
    bottom: y + height + gridSize
  };
  return components.some(comp => {
    const bounds = componentBounds(comp);
    return test.left < bounds.right
      && test.right > bounds.left
      && test.top < bounds.bottom
      && test.bottom > bounds.top;
  });
}

function getGuidedInsertionPoint(meta) {
  const center = getViewportCenter() || getStaticViewportCenter();
  const baseWidth = Number.isFinite(meta?.width) ? meta.width : compWidth;
  const baseHeight = Number.isFinite(meta?.height) ? meta.height : compHeight;
  const visualSize = visualSizeForRotation(baseWidth, baseHeight, defaultRotationForMeta(meta, meta?.type));
  const { width, height } = visualSize;
  if (!components.length) {
    return {
      x: center.x - width / 2,
      y: Math.max(gridSize * 3, center.y - height / 2)
    };
  }
  const anchor = selected && components.includes(selected) ? selected : components[components.length - 1];
  const anchorBounds = componentBounds(anchor);
  const category = meta?.category || categoryForType(meta?.type);
  let x = anchorBounds.left + (anchorBounds.right - anchorBounds.left - width) / 2;
  let y = anchorBounds.bottom + Math.max(70, gridSize * 4);
  if (category === 'sources' && !hasForwardConnection(anchor, selected)) {
    y = anchorBounds.top - height - Math.max(70, gridSize * 4);
  }
  let attempts = 0;
  while (attempts < 20 && overlapsExistingComponent(x, y, width, height)) {
    y += Math.max(70, gridSize * 4);
    attempts += 1;
  }
  return { x, y };
}

function addComponent(cfg) {
  let subtype;
  let type;
  let explicitX;
  let explicitY;
  let skipHistory = false;
  let placeAtCenter = false;
  if (typeof cfg === 'string') {
    subtype = cfg;
    type = componentMeta[subtype]?.category;
  } else if (cfg && typeof cfg === 'object') {
    subtype = cfg.subtype;
    type = cfg.type || componentMeta[cfg.subtype]?.type || componentMeta[cfg.subtype]?.category;
    if (cfg.x !== undefined) explicitX = cfg.x;
    if (cfg.y !== undefined) explicitY = cfg.y;
    skipHistory = !!cfg.skipHistory;
    placeAtCenter = cfg.placeAtViewportCenter === true;
  } else {
    return;
  }
  const meta = componentMeta[subtype];
  if (!meta) return;
  const insertionPoint = placeAtCenter ? getGuidedInsertionPoint(meta) : getDefaultInsertionPoint();
  let x = explicitX !== undefined ? explicitX : insertionPoint.x;
  let y = explicitY !== undefined ? explicitY : insertionPoint.y;
  if (Number.isFinite(x) === false || Number.isFinite(y) === false) {
    const fallback = getStaticViewportCenter();
    if (Number.isFinite(x) === false) x = fallback.x;
    if (Number.isFinite(y) === false) y = fallback.y;
  }
  if (gridEnabled) {
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;
  }
  const resolvedType = type || meta.type || meta.category;
  const defaultRotation = defaultRotationForMeta(meta, resolvedType);
  const comp = {
    id: createDiagramEntityId('n'),
    type: resolvedType,
    subtype,
    x,
    y,
    label: nextLabel(subtype),
    ref: '',
    labelOffset: { x: 0, y: 0 },
    rotation: defaultRotation,
    rotationManual: false,
    flipped: false,
    impedance: { r: 0, x: 0 },
    rating: null,
    connections: [],
    props: JSON.parse(JSON.stringify(meta.props || {}))
  };
  if (Number.isFinite(meta.width)) comp.width = meta.width;
  if (Number.isFinite(meta.height)) comp.height = meta.height;
  if (defaultRotation) alignComponentBoundsToTopLeft(comp, x, y);
  Object.entries(meta.props || {}).forEach(([k, v]) => {
    comp[k] = typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  });
  if (meta.type === 'bus') {
    comp.width = Number.isFinite(meta.width) ? meta.width : 200;
    comp.height = Number.isFinite(meta.height) ? meta.height : 20;
    updateBusPorts(comp);
  } else if (comp.type === 'annotation') {
    comp.width = comp.width || 120;
    comp.height = comp.height || 60;
  } else {
    applyIndustrySymbolGeometry(comp, meta, { preserveCenter: false, force: true });
  }
  applyDefaults(comp);
  ensureBaselineFieldsOnComponent(comp, meta);
  ensureGeneratorStudyFieldsOnComponent(comp, meta);
  ensureMccFieldsOnComponent(comp, meta);
  ensurePtVtFieldsOnComponent(comp, meta);
  ensureStudyInputFieldsOnComponent(comp, meta);
  normalizeComponentElectricalProperties(comp);
  ensureShapeDefaults(comp);
  if (comp.type === 'transformer') {
    syncTransformerDefaults(comp, { forceBase: true });
  }
  // Gap #51: assign to active layer when a layer is selected
  if (activeLayerId && layers.some(l => l.id === activeLayerId)) {
    comp.layer = activeLayerId;
  }
  components.push(comp);
  if (!skipHistory) pushHistory();
  if (gridEnabled) flashSnapIndicator(x, y);
  return comp;
}

function addPaletteSymbol(subtype, { point = null } = {}) {
  const metaKey = componentMeta[subtype]
    ? subtype
    : Object.entries(componentMeta).find(([, entry]) => entry?.subtype === subtype)?.[0];
  const meta = metaKey ? componentMeta[metaKey] : null;
  if (!meta) {
    showToast('That library symbol is no longer available');
    return null;
  }
  const hasPoint = Number.isFinite(point?.x) && Number.isFinite(point?.y);
  const comp = addComponent({
    type: meta.type,
    subtype: metaKey,
    ...(hasPoint ? { x: point.x, y: point.y } : { placeAtViewportCenter: true })
  });
  if (!comp) return null;
  recordPaletteUsage(metaKey);
  buildPalette();
  selection = [comp];
  selected = comp;
  selectedConnection = null;
  setRightRailTab('properties');
  render();
  save();
  return comp;
}

function repeatLastPaletteSymbol({ point = null } = {}) {
  const subtype = getPaletteRecent()[0];
  if (!subtype) {
    showToast('Add a palette symbol first, then repeat it');
    return null;
  }
  const comp = addPaletteSymbol(subtype, { point });
  if (comp) showToast(`${comp.label || resolveComponentMeta(subtype)?.label || 'Symbol'} repeated`);
  return comp;
}

function rotateSelectedComponents({ flip = false, remember = true } = {}) {
  const selectedIds = (selection.length ? selection : selected ? [selected] : [])
    .map(comp => comp?.id)
    .filter(Boolean);
  const targets = selectedIds
    .map(id => components.find(comp => comp.id === id))
    .filter(comp => comp && !isComponentPositionLocked(comp));
  if (!targets.length) {
    showToast('Select an unlocked component first');
    return false;
  }
  selection = targets;
  selected = targets[0];
  targets.forEach(comp => {
    if (flip) {
      comp.flipped = !comp.flipped;
    } else {
      comp.rotation = ((comp.rotation || 0) + 90) % 360;
      comp.rotationManual = true;
    }
  });
  pushHistory();
  render();
  save();
  if (remember) rememberRepeatableCommand({ id: flip ? 'flip' : 'rotate' });
  return true;
}

function runRepeatableCommand(command, { repeat = false } = {}) {
  if (!command?.id) return false;
  let result = false;
  if (command.id === 'palette-symbol') {
    const subtype = command.subtype || getPaletteRecent()[0];
    if (subtype) result = Boolean(addPaletteSymbol(subtype, { point: command.point || null }));
  } else if (command.id === 'rotate') {
    result = rotateSelectedComponents({ remember: false });
  } else if (command.id === 'flip') {
    result = rotateSelectedComponents({ flip: true, remember: false });
  } else if (command.id === 'auto-arrange') {
    result = arrangeSourceToLoad();
  } else if (command.id === 'auto-space') {
    result = autoSpaceEquipment();
  }
  if (result && !repeat) rememberRepeatableCommand(command);
  return result;
}

function repeatLastCommand({ point = null } = {}) {
  const command = lastRepeatableCommand || { id: 'palette-symbol', subtype: getPaletteRecent()[0], point };
  if (!command?.id || (command.id === 'palette-symbol' && !command.subtype)) {
    showToast('Run a repeatable command or add a palette symbol first');
    return false;
  }
  return runRepeatableCommand({ ...command, ...(point ? { point } : {}) }, { repeat: true });
}

function executeShortcutCommand(commandId) {
  if (commandId === 'repeat-last') return repeatLastCommand();
  if (commandId === 'rotate') return rotateSelectedComponents();
  if (commandId === 'flip') return rotateSelectedComponents({ flip: true });
  if (commandId === 'fit') {
    zoomToFit();
    return true;
  }
  if (commandId === 'fit-selection') {
    zoomToSelection();
    return true;
  }
  if (commandId === 'auto-arrange') {
    return runRepeatableCommand({ id: 'auto-arrange' });
  }
  if (commandId === 'auto-space') {
    return runRepeatableCommand({ id: 'auto-space' });
  }
  return false;
}

function openKeyboardShortcutsModal() {
  let draftBindings = { ...getShortcutBindings() };
  const modalPromise = openModal({
    title: 'One-Line Keyboard Shortcuts',
    description: 'Choose a letter with optional Alt or Shift. Ctrl and Command combinations remain reserved for browser and editing commands.',
    primaryText: 'Save Shortcuts',
    secondaryText: 'Cancel',
    variant: 'wide',
    onSubmit() {
      setShortcutBindings(draftBindings);
      showToast('One-Line shortcuts saved');
      return true;
    },
    render(body) {
      body.classList.add('shortcut-settings-body');
      const list = document.createElement('div');
      list.className = 'shortcut-settings-list';
      const help = document.createElement('p');
      help.className = 'shortcut-settings-help';
      help.textContent = 'Select Change, then press the new shortcut.';
      const resetAll = document.createElement('button');
      resetAll.type = 'button';
      resetAll.className = 'btn secondary-btn';
      resetAll.textContent = 'Restore Defaults';
      const renderRows = () => {
        list.innerHTML = '';
        ONE_LINE_SHORTCUT_DEFINITIONS.forEach(definition => {
          const row = document.createElement('div');
          row.className = 'shortcut-settings-row';
          const label = document.createElement('span');
          label.textContent = definition.label;
          const binding = document.createElement('kbd');
          binding.textContent = draftBindings[definition.id];
          const change = document.createElement('button');
          change.type = 'button';
          change.className = 'btn secondary-btn';
          change.textContent = 'Change';
          change.addEventListener('click', () => {
            change.textContent = 'Press shortcut…';
            change.focus();
          });
          change.addEventListener('keydown', event => {
            const shortcut = shortcutFromEvent(event);
            if (!shortcut) return;
            event.preventDefault();
            event.stopPropagation();
            const conflict = ONE_LINE_SHORTCUT_DEFINITIONS.find(item => item.id !== definition.id && draftBindings[item.id] === shortcut);
            if (conflict) {
              showToast(`${shortcut} is already assigned to ${conflict.label}`);
              return;
            }
            draftBindings = { ...draftBindings, [definition.id]: shortcut };
            renderRows();
          });
          row.append(label, binding, change);
          list.appendChild(row);
        });
      };
      resetAll.addEventListener('click', () => {
        draftBindings = Object.fromEntries(ONE_LINE_SHORTCUT_DEFINITIONS.map(definition => [definition.id, definition.defaultShortcut]));
        renderRows();
      });
      renderRows();
      body.append(help, list, resetAll);
      return list;
    }
  });
  return modalPromise;
}

function buildVirtualNodeEntries(allComponents, sheetConnections) {
  const compById = new Map();
  allComponents.forEach(comp => {
    if (!comp || !comp.id) return;
    if (!compById.has(comp.id)) compById.set(comp.id, comp);
  });
  const nodeMap = new Map();
  const ensureNode = id => {
    if (!id || compById.has(id)) return null;
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        label: id,
        type: 'nodes',
        category: 'nodes',
        isVirtualNode: true,
        inbound: [],
        outbound: []
      });
    }
    return nodeMap.get(id);
  };

  allComponents.forEach(source => {
    if (!source) return;
    const list = Array.isArray(source.connections) ? source.connections : [];
    list.forEach(conn => {
      if (!conn || !conn.target) return;
      const node = ensureNode(conn.target);
      if (!node) return;
      node.inbound.push({
        sourceId: source.id || conn.source || '',
        sourceComponent: source,
        connection: conn
      });
    });
  });

  const sheetList = Array.isArray(sheetConnections) ? sheetConnections : [];
  sheetList.forEach(conn => {
    if (!conn) return;
    const fromId = conn.from;
    const toId = conn.to;
    if (fromId && !compById.has(fromId)) {
      const node = ensureNode(fromId);
      if (node) {
        node.outbound.push({
          targetId: toId || '',
          targetComponent: toId ? compById.get(toId) || null : null,
          connection: conn
        });
      }
    }
    if (toId && !compById.has(toId)) {
      const node = ensureNode(toId);
      if (node) {
        node.inbound.push({
          sourceId: fromId || '',
          sourceComponent: fromId ? compById.get(fromId) || null : null,
          connection: conn
        });
      }
    }
  });

  return Array.from(nodeMap.values());
}

function alignSelection(direction) {
  if (selection.length < 2) return;
  if (direction === 'left') {
    const minX = Math.min(...selection.map(c => c.x));
    selection.forEach(c => { c.x = minX; });
  } else if (direction === 'right') {
    const maxX = Math.max(...selection.map(c => c.x + (c.width || compWidth)));
    selection.forEach(c => { c.x = maxX - (c.width || compWidth); });
  } else if (direction === 'top') {
    const minY = Math.min(...selection.map(c => c.y));
    selection.forEach(c => { c.y = minY; });
  } else if (direction === 'bottom') {
    const maxY = Math.max(...selection.map(c => c.y + (c.height || compHeight)));
    selection.forEach(c => { c.y = maxY - (c.height || compHeight); });
  }
  pushHistory();
  render();
  save();
}

function distributeSelection(axis) {
  if (selection.length < 3) return;
  const sorted = [...selection].sort(axis === 'h' ? (a, b) => a.x - b.x : (a, b) => a.y - b.y);
  if (axis === 'h') {
    const min = sorted[0].x;
    const max = sorted[sorted.length - 1].x;
    const step = (max - min) / (sorted.length - 1);
    sorted.forEach((c, i) => { c.x = min + step * i; });
  } else {
    const min = sorted[0].y;
    const max = sorted[sorted.length - 1].y;
    const step = (max - min) / (sorted.length - 1);
    sorted.forEach((c, i) => { c.y = min + step * i; });
  }
  pushHistory();
  render();
  save();
}

function isAutoSpaceEquipmentTarget(comp) {
  if (!comp || comp.isVirtualNode || comp.type === 'dimension' || comp.type === 'annotation') return false;
  const category = resolveComponentCategory(comp);
  return category === 'sources' || category === 'equipment' || category === 'protection' || category === 'load';
}

function getAutoSpaceEquipmentTargets() {
  const selectedTargets = selection.filter(isAutoSpaceEquipmentTarget);
  if (selectedTargets.length >= 2) return selectedTargets;
  return components.filter(isAutoSpaceEquipmentTarget);
}

function groupAutoSpaceRows(targets) {
  const rows = [];
  targets
    .map(comp => {
      const bounds = componentBounds(comp);
      return {
        comp,
        bounds,
        centerX: (bounds.left + bounds.right) / 2,
        centerY: (bounds.top + bounds.bottom) / 2
      };
    })
    .sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX)
    .forEach(entry => {
      let row = rows.find(candidate => Math.abs(candidate.centerY - entry.centerY) <= equipmentAutoSpaceRowTolerance);
      if (!row) {
        row = { centerY: entry.centerY, items: [] };
        rows.push(row);
      }
      row.items.push(entry);
      row.centerY = row.items.reduce((sum, item) => sum + item.centerY, 0) / row.items.length;
    });
  return rows;
}

function autoSpaceEquipment({ silent = false } = {}) {
  const targets = getAutoSpaceEquipmentTargets();
  if (targets.length < 2) {
    if (!silent) showToast('Add or select at least two equipment items to auto-space');
    return false;
  }
  const rows = groupAutoSpaceRows(targets).filter(row => row.items.length > 1);
  if (!rows.length) {
    if (!silent) showToast('No equipment rows need horizontal spacing');
    return false;
  }
  let moved = 0;
  rows.forEach(row => {
    const sorted = row.items.sort((a, b) => a.centerX - b.centerX);
    const minCenter = Math.min(...sorted.map(item => item.centerX));
    const maxCenter = Math.max(...sorted.map(item => item.centerX));
    const rowCenter = (minCenter + maxCenter) / 2;
    const firstCenter = rowCenter - ((sorted.length - 1) * equipmentHorizontalAutoSpace) / 2;
    sorted.forEach((item, index) => {
      const width = Math.max(1, item.bounds.right - item.bounds.left);
      const desiredCenter = firstCenter + index * equipmentHorizontalAutoSpace;
      let desiredLeft = desiredCenter - width / 2;
      const desiredTop = item.bounds.top;
      if (gridEnabled) desiredLeft = Math.round(desiredLeft / gridSize) * gridSize;
      alignComponentBoundsToTopLeft(item.comp, desiredLeft, desiredTop);
      const nextBounds = componentBounds(item.comp);
      if (Math.abs(nextBounds.left - item.bounds.left) > 0.01 || Math.abs(nextBounds.top - item.bounds.top) > 0.01) {
        moved += 1;
      }
    });
  });
  if (!moved) {
    if (!silent) showToast('Equipment horizontal spacing already matches the standard');
    return false;
  }
  pushHistory();
  render();
  save();
  closeCommandMenus();
  if (!silent) showToast(`Auto-spaced ${moved} equipment item${moved === 1 ? '' : 's'}`);
  return true;
}

async function selectComponent(compOrId) {
  closeCommandMenus();
  const nodeComponents = buildVirtualNodeEntries(components, connections);
  const baseComponents = [...components];
  const deviceComponents = [...baseComponents, ...nodeComponents];
  if (!deviceComponents.length) return;

  const findDeviceById = id => deviceComponents.find(item => item.id === id) || null;
  let activeComponent = null;
  if (typeof compOrId === 'string' && compOrId) {
    activeComponent = findDeviceById(compOrId);
  } else if (compOrId && typeof compOrId === 'object') {
    if (compOrId.isVirtualNode) {
      activeComponent = findDeviceById(compOrId.id);
    } else {
      activeComponent = compOrId;
    }
  }
  if (!activeComponent) activeComponent = deviceComponents[0];
  protectiveDevices = await protectiveDeviceCatalog.loadIndex();

  if (activeComponent?.isVirtualNode) {
    selected = null;
    selection = [];
  } else {
    selected = activeComponent;
    selection = [activeComponent];
  }
  selectedConnection = null;

  const getComponentListLabel = getPropertyEditorDeviceLabel;
  const modal = ensurePropModal();
  const propertyEditor = createPropertyEditorController({
    documentRef: document,
    modal,
    devices: deviceComponents,
    initialComponent: activeComponent,
    getCategory,
    getCategoryLabel: key => key ? formatAttributeLabel(String(key)) : 'Other',
    onSelectionChange: target => {
      activeComponent = target;
      if (target?.isVirtualNode || !target) {
        selected = null;
        selection = [];
      } else {
        selected = target;
        selection = [target];
      }
      selectedConnection = null;
    }
  });
  const { propertyContainer, propertyHeading } = propertyEditor;
  const closeModal = options => propertyEditor.close(options);
  const setActiveComponent = target => propertyEditor.setActiveComponent(target);
  const renderPropertiesFor = createPropertyDetailRenderer({
    documentRef: document,
    Element,
    FormData,
    URLSearchParams,
    window,
    activeSheet,
    applyPropertyFieldFromForm,
    cablePropertyMetadata,
    calculateTransformerImpedance,
    closeModal,
    compatibleProtectiveDevices,
    componentProtectionKind,
    components,
    computeTransformerBaseKV,
    connections,
    defaultHarmonicProfileId,
    defaultShapeProps,
    deriveTransformerBaseKV,
    editCableComponent,
    ensureShapeDefaults,
    escapeHtml,
    estimateVoltageHarmonicPoints,
    findHarmonicProfileById,
    findHarmonicProfileBySpectrum,
    formatAttributeLabel,
    formatHarmonicMetric,
    formatOperatingVoltage,
    formatPropertyFieldLabel,
    formatPropertyNumber,
    getCableForConnection,
    getCables,
    getCategory,
    getComponentListLabel,
    getEquipment,
    getHarmonicProfileOptions,
    getImpedancePart,
    getLoads,
    getManufacturerModels,
    getNestedComponentValue,
    getPanels,
    harmonicThdPercent,
    hasImpedance,
    impedanceFieldNameSet,
    inferSchemaFromProps,
    isComponentPropertiesLocked,
    isConductorSegmentComponent,
    isPhysicalPropertyField,
    isSourceComponent,
    manualHarmonicProfileId,
    manufacturerDefaults,
    manufacturerOptions,
    markScheduleReconcilePending,
    modal,
    normalizeComponentElectricalProperties,
    normalizePropertySchema,
    normalizeVoltageToVolts,
    parseHarmonicSpectrumPoints,
    parsePropertyNumber,
    promptDialog,
    propertyContainer,
    propertyHeading,
    propSchemas,
    protectiveDevices,
    pushHistory,
    readPropertyValue,
    render,
    renderTemplates,
    resolveComponentMeta,
    resolveTransformerKva,
    resolveTransformerPercentZ,
    resolveTransformerXrRatio,
    save,
    saveCustomHarmonicProfile,
    saveTemplates,
    selectComponent,
    setActiveComponent,
    setImpedancePart,
    sheets,
    showToast,
    studyInputFieldNameSet,
    syncSourceVoltageFields,
    templates,
    thermalRatings,
    toBaseKV,
    transformerConnectionOptions,
    voltageClasses,
    zoomToComponentNeighborhood,
    setComponents: nextComponents => { components = nextComponents; },
    setConnections: nextConnections => { connections = nextConnections; },
    setSelectedConnection: connection => { selectedConnection = connection; }
  });
  propertyEditor.setPropertyRenderer(renderPropertiesFor);
  propertyEditor.start();
}

async function chooseCable(source, target, existingConn = null) {
  const templateData = [];
  try {
    const res = await fetch('cableTemplates.json');
    const arr = await res.json();
    arr.forEach(t => templateData.push(t));
  } catch (e) {
    console.warn('chooseCable: could not load cableTemplates.json', e);
  }

  const existingTemplates = [];
  const seen = new Set();
  getCables().forEach(c => {
    if (!seen.has(c.tag)) {
      const template = { ...c };
      if (hasImpedance(c)) template.impedance = { ...c.impedance };
      existingTemplates.push(template);
      seen.add(c.tag);
    }
  });
  components.forEach(c => {
    if (isConductorSegmentComponent(c) && c.cable && !seen.has(c.cable.tag)) {
      const template = {
        ...c.cable,
        phases: formatCablePhases(c.cable),
        conductors: c.cable.conductors
      };
      if (hasImpedance(c.cable)) template.impedance = { ...c.cable.impedance };
      existingTemplates.push(template);
      if (c.cable.tag) seen.add(c.cable.tag);
    }
    (c.connections || []).forEach(conn => {
      if (conn.cable && !seen.has(conn.cable.tag)) {
        const template = {
          ...conn.cable,
          phases: formatCablePhases(conn.phases),
          conductors: conn.conductors || conn.cable?.conductors
        };
        if (hasImpedance(conn.cable)) template.impedance = { ...conn.cable.impedance };
        existingTemplates.push(template);
        seen.add(conn.cable.tag);
      }
    });
  });

  return new Promise(resolve => {
    const modal = document.getElementById('cable-modal');
    modal.innerHTML = '';
    const form = document.createElement('form');

    const applyCableMeta = (label, key, fallback) => {
      const meta = cablePropertyMetadata[key];
      const text = meta?.label || fallback || key;
      label.textContent = `${text} `;
      if (meta?.help) label.title = meta.help;
      return meta || {};
    };

    const parseNumericValue = input => {
      if (!input) return '';
      const raw = typeof input.value === 'string' ? input.value.trim() : '';
      if (!raw) return '';
      const num = Number(raw);
      return Number.isFinite(num) ? num : raw;
    };

    const tplLabel = document.createElement('label');
    tplLabel.textContent = 'Template ';
    const tplSelect = document.createElement('select');
    const optTpl = document.createElement('option');
    optTpl.value = '';
    optTpl.textContent = '--Template--';
    tplSelect.appendChild(optTpl);
    templateData.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      tplSelect.appendChild(opt);
    });
    tplLabel.appendChild(tplSelect);
    form.appendChild(tplLabel);

    const selLabel = document.createElement('label');
    selLabel.textContent = 'Existing ';
    const select = document.createElement('select');
    const optNew = document.createElement('option');
    optNew.value = '';
    optNew.textContent = '--New Cable--';
    select.appendChild(optNew);
    existingTemplates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.tag;
      opt.textContent = t.tag;
      select.appendChild(opt);
    });
    selLabel.appendChild(select);
    form.appendChild(selLabel);

    const tagLabel = document.createElement('label');
    tagLabel.textContent = 'Tag ';
    const tagInput = document.createElement('input');
    tagInput.name = 'tag';
    tagLabel.appendChild(tagInput);
    form.appendChild(tagLabel);

    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Type ';
    const typeInput = document.createElement('input');
    typeInput.name = 'cable_type';
    typeLabel.appendChild(typeInput);
    form.appendChild(typeLabel);

    const ratingLabel = document.createElement('label');
    ratingLabel.textContent = 'Cable Rating (V) ';
    const ratingInput = document.createElement('input');
    ratingInput.type = 'number';
    ratingInput.name = 'cable_rating';
    ratingInput.min = '0';
    ratingInput.step = 'any';
    ratingLabel.appendChild(ratingInput);
    form.appendChild(ratingLabel);

    const conductorsLabel = document.createElement('label');
    conductorsLabel.textContent = 'Conductors ';
    const conductorsInput = document.createElement('input');
    conductorsInput.type = 'number';
    conductorsInput.name = 'conductors';
    conductorsLabel.appendChild(conductorsInput);
    form.appendChild(conductorsLabel);

    const phasesLabel = document.createElement('label');
    phasesLabel.textContent = 'Phases ';
    const phasesInput = document.createElement('input');
    phasesInput.name = 'phases';
    phasesInput.placeholder = 'A,B,C';
    phasesLabel.appendChild(phasesInput);
    form.appendChild(phasesLabel);

    const sizeLabel = document.createElement('label');
    applyCableMeta(sizeLabel, 'conductor_size', 'Conductor Size');
    const sizeInput = document.createElement('input');
    sizeInput.name = 'conductor_size';
    sizeLabel.appendChild(sizeInput);
    form.appendChild(sizeLabel);

    const materialLabel = document.createElement('label');
    applyCableMeta(materialLabel, 'conductor_material', 'Conductor Material');
    const materialInput = document.createElement('input');
    materialInput.name = 'conductor_material';
    materialLabel.appendChild(materialInput);
    form.appendChild(materialLabel);

    const resistancePerKmLabel = document.createElement('label');
    applyCableMeta(resistancePerKmLabel, 'resistance_per_km', 'Resistance (Ω/km)');
    const resistancePerKmInput = document.createElement('input');
    resistancePerKmInput.type = 'number';
    resistancePerKmInput.step = 'any';
    resistancePerKmInput.name = 'resistance_per_km';
    resistancePerKmLabel.appendChild(resistancePerKmInput);
    form.appendChild(resistancePerKmLabel);

    const reactancePerKmLabel = document.createElement('label');
    applyCableMeta(reactancePerKmLabel, 'reactance_per_km', 'Reactance (Ω/km)');
    const reactancePerKmInput = document.createElement('input');
    reactancePerKmInput.type = 'number';
    reactancePerKmInput.step = 'any';
    reactancePerKmInput.name = 'reactance_per_km';
    reactancePerKmLabel.appendChild(reactancePerKmInput);
    form.appendChild(reactancePerKmLabel);

    const zeroSeqLabel = document.createElement('label');
    applyCableMeta(zeroSeqLabel, 'zero_sequence_impedance', 'Zero Sequence Impedance');
    const zeroSequenceInput = document.createElement('input');
    zeroSequenceInput.name = 'zero_sequence_impedance';
    zeroSeqLabel.appendChild(zeroSequenceInput);
    form.appendChild(zeroSeqLabel);

    const mutualCouplingLabel = document.createElement('label');
    applyCableMeta(mutualCouplingLabel, 'mutual_coupling', 'Mutual Coupling');
    const mutualCouplingInput = document.createElement('input');
    mutualCouplingInput.name = 'mutual_coupling';
    mutualCouplingLabel.appendChild(mutualCouplingInput);
    form.appendChild(mutualCouplingLabel);

    const lengthLabel = document.createElement('label');
    applyCableMeta(lengthLabel, 'length', 'Length');
    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.step = 'any';
    lengthInput.name = 'length';
    lengthLabel.appendChild(lengthInput);
    form.appendChild(lengthLabel);

    const operatingTempLabel = document.createElement('label');
    applyCableMeta(operatingTempLabel, 'operating_temp', 'Operating Temperature (°C)');
    const operatingTempInput = document.createElement('input');
    operatingTempInput.type = 'number';
    operatingTempInput.step = 'any';
    operatingTempInput.name = 'operating_temp';
    operatingTempLabel.appendChild(operatingTempInput);
    form.appendChild(operatingTempLabel);

    const ambientLabel = document.createElement('label');
    applyCableMeta(ambientLabel, 'ambient_temp', 'Ambient Temperature (°C)');
    const ambientInput = document.createElement('input');
    ambientInput.type = 'number';
    ambientInput.step = 'any';
    ambientInput.name = 'ambient_temp';
    ambientLabel.appendChild(ambientInput);
    form.appendChild(ambientLabel);

    const thermalRatingLabel = document.createElement('label');
    applyCableMeta(thermalRatingLabel, 'thermal_rating_ampacity', 'Thermal Rating/Ampacity (A)');
    const thermalRatingInput = document.createElement('input');
    thermalRatingInput.type = 'number';
    thermalRatingInput.step = 'any';
    thermalRatingInput.name = 'thermal_rating_ampacity';
    thermalRatingLabel.appendChild(thermalRatingInput);
    form.appendChild(thermalRatingLabel);

    const shieldArmorLabel = document.createElement('label');
    applyCableMeta(shieldArmorLabel, 'shield_armor', 'Shield/Armor Data');
    const shieldArmorInput = document.createElement('input');
    shieldArmorInput.name = 'shield_armor';
    shieldArmorLabel.appendChild(shieldArmorInput);
    form.appendChild(shieldArmorLabel);

    const impedancePerLengthLabel = document.createElement('label');
    applyCableMeta(impedancePerLengthLabel, 'impedance_per_length', 'Impedance per Length');
    const impedancePerLengthInput = document.createElement('input');
    impedancePerLengthInput.name = 'impedance_per_length';
    impedancePerLengthLabel.appendChild(impedancePerLengthInput);
    form.appendChild(impedancePerLengthLabel);

    const capacitanceLabel = document.createElement('label');
    applyCableMeta(capacitanceLabel, 'capacitance_per_km', 'Capacitance (µF/km)');
    const capacitanceInput = document.createElement('input');
    capacitanceInput.type = 'number';
    capacitanceInput.step = 'any';
    capacitanceInput.name = 'capacitance_per_km';
    capacitanceLabel.appendChild(capacitanceInput);
    form.appendChild(capacitanceLabel);

    const insulationLabel = document.createElement('label');
    applyCableMeta(insulationLabel, 'insulation_type', 'Insulation Type');
    const insulationInput = document.createElement('input');
    insulationInput.name = 'insulation_type';
    insulationLabel.appendChild(insulationInput);
    form.appendChild(insulationLabel);

    const installLabel = document.createElement('label');
    applyCableMeta(installLabel, 'install_method', 'Installation Type');
    const installInput = document.createElement('input');
    installInput.name = 'install_method';
    installLabel.appendChild(installInput);
    form.appendChild(installLabel);

    const shortCircuitLabel = document.createElement('label');
    applyCableMeta(shortCircuitLabel, 'short_circuit_rating', 'Short Circuit Rating (kA)');
    const shortCircuitInput = document.createElement('input');
    shortCircuitInput.type = 'number';
    shortCircuitInput.step = 'any';
    shortCircuitInput.name = 'short_circuit_rating';
    shortCircuitLabel.appendChild(shortCircuitInput);
    form.appendChild(shortCircuitLabel);

    const groupingLabel = document.createElement('label');
    applyCableMeta(groupingLabel, 'grouping_factor', 'Grouping Factor');
    const groupingInput = document.createElement('input');
    groupingInput.type = 'number';
    groupingInput.step = 'any';
    groupingInput.name = 'grouping_factor';
    groupingLabel.appendChild(groupingInput);
    form.appendChild(groupingLabel);

    const resistanceCoeffLabel = document.createElement('label');
    applyCableMeta(resistanceCoeffLabel, 'resistance_temp_correction_coeff', 'Resistance Temp Correction Coeff');
    const resistanceCoeffInput = document.createElement('input');
    resistanceCoeffInput.type = 'number';
    resistanceCoeffInput.step = 'any';
    resistanceCoeffInput.name = 'resistance_temp_correction_coeff';
    resistanceCoeffLabel.appendChild(resistanceCoeffInput);
    form.appendChild(resistanceCoeffLabel);

    const coreConfigLabel = document.createElement('label');
    applyCableMeta(coreConfigLabel, 'core_configuration', 'Core Configuration (1C,3C)');
    const coreConfigurationInput = document.createElement('input');
    coreConfigurationInput.name = 'core_configuration';
    coreConfigLabel.appendChild(coreConfigurationInput);
    form.appendChild(coreConfigLabel);

    const groundReturnLabel = document.createElement('label');
    applyCableMeta(groundReturnLabel, 'ground_return_path_resistance', 'Ground Return Path Resistance');
    const groundReturnInput = document.createElement('input');
    groundReturnInput.type = 'number';
    groundReturnInput.step = 'any';
    groundReturnInput.name = 'ground_return_path_resistance';
    groundReturnLabel.appendChild(groundReturnInput);
    form.appendChild(groundReturnLabel);

    const impedanceRLabel = document.createElement('label');
    impedanceRLabel.textContent = 'Impedance R (Ω) ';
    const impedanceRInput = document.createElement('input');
    impedanceRInput.type = 'number';
    impedanceRInput.step = 'any';
    impedanceRInput.name = 'impedance_r';
    impedanceRLabel.appendChild(impedanceRInput);
    form.appendChild(impedanceRLabel);

    const impedanceXLabel = document.createElement('label');
    impedanceXLabel.textContent = 'Impedance X (Ω) ';
    const impedanceXInput = document.createElement('input');
    impedanceXInput.type = 'number';
    impedanceXInput.step = 'any';
    impedanceXInput.name = 'impedance_x';
    impedanceXLabel.appendChild(impedanceXInput);
    form.appendChild(impedanceXLabel);

    const existingImpedance = existingConn?.cable?.impedance || existingConn?.impedance;
    if (existingImpedance && typeof existingImpedance === 'object') {
      impedanceRInput.value = existingImpedance.r ?? existingImpedance.R ?? '';
      impedanceXInput.value = existingImpedance.x ?? existingImpedance.X ?? '';
    }

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color ';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.name = 'color';
    colorLabel.appendChild(colorInput);
    form.appendChild(colorLabel);

    const sizeBtn = document.createElement('button');
    sizeBtn.type = 'button';
    sizeBtn.textContent = 'Size Conductor';
    sizeBtn.addEventListener('click', () => {
      const load = {
        current: parseFloat(target?.current) || 0,
        voltage: parseFloat(target?.voltage) || parseFloat(source?.voltage) || 0,
        phases: parseInt(target?.phases || source?.phases || 3, 10)
      };
      const params = {
        length: parseFloat(lengthInput.value) || 0,
        material: materialInput.value || 'cu',
        insulation_rating: parseFloat(target?.insulation_rating) || 90,
        ambient: parseFloat(ambientInput.value) || parseFloat(source?.ambient) || 30,
        maxVoltageDrop: parseFloat(target?.maxVoltageDrop) || 3,
        conductors: parseInt(conductorsInput.value) || 1,
        code: target?.code || 'NEC'
      };
      const res = sizeConductor(load, params);
      if (res.size) {
        sizeInput.value = res.size;
        sizeInput.dataset.calcAmpacity = res.ampacity.toFixed(2);
        sizeInput.dataset.voltageDrop = res.voltageDrop.toFixed(2);
        sizeInput.dataset.sizingWarning = '';
        sizeInput.dataset.codeRef = res.codeRef;
        sizeInput.dataset.sizingReport = JSON.stringify(res.report || {});
        sizeInput.classList.remove('sizing-violation');
        showAlertModal('Cable Sized', `Sized to ${res.size}`);
      } else {
        sizeInput.dataset.calcAmpacity = '';
        sizeInput.dataset.voltageDrop = '';
        sizeInput.dataset.sizingWarning = res.violation;
        sizeInput.dataset.codeRef = res.codeRef || '';
        sizeInput.dataset.sizingReport = JSON.stringify(res.report || {});
        sizeInput.classList.add('sizing-violation');
        showAlertModal('Sizing Violation', res.violation);
      }
    });
    form.appendChild(sizeBtn);

    tplSelect.addEventListener('change', () => {
      const t = templateData.find(tp => tp.name === tplSelect.value);
      if (t) {
        sizeInput.value = t.conductor_size || '';
        materialInput.value = t.conductor_material || '';
        resistancePerKmInput.value = t.resistance_per_km ?? '';
        reactancePerKmInput.value = t.reactance_per_km ?? '';
        zeroSequenceInput.value = t.zero_sequence_impedance || '';
        mutualCouplingInput.value = t.mutual_coupling || '';
        lengthInput.value = t.length ?? '';
        operatingTempInput.value = t.operating_temp ?? '';
        thermalRatingInput.value = t.thermal_rating_ampacity ?? '';
        shieldArmorInput.value = t.shield_armor || '';
        impedancePerLengthInput.value = t.impedance_per_length || '';
        capacitanceInput.value = t.capacitance_per_km ?? '';
        insulationInput.value = t.insulation_type || '';
        ambientInput.value = t.ambient_temp || '';
        installInput.value = t.install_method || '';
        shortCircuitInput.value = t.short_circuit_rating ?? '';
        groupingInput.value = t.grouping_factor ?? '';
        resistanceCoeffInput.value = t.resistance_temp_correction_coeff ?? '';
        coreConfigurationInput.value = t.core_configuration || '';
        groundReturnInput.value = t.ground_return_path_resistance ?? '';
        ratingInput.value = t.cable_rating || '';
        impedanceRInput.value = getImpedancePart(t, 'r') || '';
        impedanceXInput.value = getImpedancePart(t, 'x') || '';
      } else {
        resistancePerKmInput.value = '';
        reactancePerKmInput.value = '';
        zeroSequenceInput.value = '';
        mutualCouplingInput.value = '';
        operatingTempInput.value = '';
        thermalRatingInput.value = '';
        shieldArmorInput.value = '';
        impedancePerLengthInput.value = '';
        capacitanceInput.value = '';
        shortCircuitInput.value = '';
        groupingInput.value = '';
        resistanceCoeffInput.value = '';
        coreConfigurationInput.value = '';
        groundReturnInput.value = '';
      }
    });

    select.addEventListener('change', () => {
      const c = existingTemplates.find(t => t.tag === select.value);
      if (c) {
        tagInput.value = c.tag || '';
        typeInput.value = c.cable_type || '';
        ratingInput.value = c.cable_rating || '';
        conductorsInput.value = c.conductors || '';
        phasesInput.value = c.phases || '';
        sizeInput.value = c.conductor_size || '';
        materialInput.value = c.conductor_material || '';
        resistancePerKmInput.value = c.resistance_per_km ?? '';
        reactancePerKmInput.value = c.reactance_per_km ?? '';
        zeroSequenceInput.value = c.zero_sequence_impedance || '';
        mutualCouplingInput.value = c.mutual_coupling || '';
        insulationInput.value = c.insulation_type || '';
        lengthInput.value = c.length ?? '';
        operatingTempInput.value = c.operating_temp ?? '';
        colorInput.value = c.color || '#000000';
        ambientInput.value = c.ambient_temp || '';
        installInput.value = c.install_method || '';
        thermalRatingInput.value = c.thermal_rating_ampacity ?? '';
        shieldArmorInput.value = c.shield_armor || '';
        impedancePerLengthInput.value = c.impedance_per_length || '';
        capacitanceInput.value = c.capacitance_per_km ?? '';
        shortCircuitInput.value = c.short_circuit_rating ?? '';
        groupingInput.value = c.grouping_factor ?? '';
        resistanceCoeffInput.value = c.resistance_temp_correction_coeff ?? '';
        coreConfigurationInput.value = c.core_configuration || '';
        groundReturnInput.value = c.ground_return_path_resistance ?? '';
        impedanceRInput.value = getImpedancePart(c, 'r') || '';
        impedanceXInput.value = getImpedancePart(c, 'x') || '';
      } else {
        tagInput.value = '';
        typeInput.value = '';
        ratingInput.value = '';
        conductorsInput.value = '';
        phasesInput.value = '';
        sizeInput.value = '';
        materialInput.value = '';
        insulationInput.value = '';
        resistancePerKmInput.value = '';
        reactancePerKmInput.value = '';
        zeroSequenceInput.value = '';
        mutualCouplingInput.value = '';
        lengthInput.value = '';
        operatingTempInput.value = '';
        colorInput.value = '#000000';
        ambientInput.value = '';
        installInput.value = '';
        thermalRatingInput.value = '';
        shieldArmorInput.value = '';
        impedancePerLengthInput.value = '';
        capacitanceInput.value = '';
        shortCircuitInput.value = '';
        groupingInput.value = '';
        resistanceCoeffInput.value = '';
        coreConfigurationInput.value = '';
        groundReturnInput.value = '';
        impedanceRInput.value = '';
        impedanceXInput.value = '';
        sizeInput.dataset.calcAmpacity = '';
        sizeInput.dataset.voltageDrop = '';
        sizeInput.dataset.sizingWarning = '';
        sizeInput.dataset.codeRef = '';
        sizeInput.dataset.sizingReport = '';
        sizeInput.classList.remove('sizing-violation');
      }
    });

    if (existingConn) {
      const existing = existingConn.cable || existingConn;
      tagInput.value = existing.tag || '';
      typeInput.value = existing.cable_type || '';
      ratingInput.value = existing.cable_rating || '';
      conductorsInput.value = existingConn.conductors || existing.conductors || '';
      const presetPhases = hasStoredPhases(existingConn.phases)
        ? formatCablePhases(existingConn.phases)
        : formatCablePhases(existing);
      phasesInput.value = presetPhases || '';
      sizeInput.value = existing.conductor_size || '';
      materialInput.value = existing.conductor_material || '';
      resistancePerKmInput.value = existing.resistance_per_km ?? '';
      reactancePerKmInput.value = existing.reactance_per_km ?? '';
      zeroSequenceInput.value = existing.zero_sequence_impedance || '';
      mutualCouplingInput.value = existing.mutual_coupling || '';
      insulationInput.value = existing.insulation_type || '';
      const autoLen = (existingConn.length || 0) * (diagramScale.unitPerPx || 1);
      if (existing.length) {
        lengthInput.value = existing.length;
      } else if (autoLen) {
        lengthInput.value = autoLen.toFixed(2);
      }
      operatingTempInput.value = existing.operating_temp ?? '';
      colorInput.value = existing.color || '#000000';
      ambientInput.value = existing.ambient_temp || '';
      installInput.value = existing.install_method || '';
      thermalRatingInput.value = existing.thermal_rating_ampacity ?? '';
      shieldArmorInput.value = existing.shield_armor || '';
      impedancePerLengthInput.value = existing.impedance_per_length || '';
      capacitanceInput.value = existing.capacitance_per_km ?? '';
      shortCircuitInput.value = existing.short_circuit_rating ?? '';
      groupingInput.value = existing.grouping_factor ?? '';
      resistanceCoeffInput.value = existing.resistance_temp_correction_coeff ?? '';
      coreConfigurationInput.value = existing.core_configuration || '';
      groundReturnInput.value = existing.ground_return_path_resistance ?? '';
      sizeInput.dataset.calcAmpacity = existing.calc_ampacity || '';
      sizeInput.dataset.voltageDrop = existing.voltage_drop_pct || existing.voltage_drop || '';
      sizeInput.dataset.sizingWarning = existing.sizing_warning || '';
      sizeInput.dataset.codeRef = existing.code_reference || '';
      sizeInput.dataset.sizingReport = existing.sizing_report || '';
      if (existing.sizing_warning) sizeInput.classList.add('sizing-violation');
      impedanceRInput.value = getImpedancePart(existing, 'r') || '';
      impedanceXInput.value = getImpedancePart(existing, 'x') || '';
      if (existingTemplates.some(t => t.tag === existing.tag)) {
        select.value = existing.tag;
      }
    } else {
      colorInput.value = '#000000';
      impedanceRInput.value = '';
      impedanceXInput.value = '';
    }

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      modal.classList.remove('show');
      resolve(null);
    });
    form.appendChild(saveBtn);
    form.appendChild(cancelBtn);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const phases = phasesInput.value
        .split(',')
        .map(p => p.trim().toUpperCase())
        .filter(Boolean);
      const normalizedPhases = phases.slice();
      const conductors = conductorsInput.value;
      const manualLen = lengthInput.value.trim() !== '';
      const cable = {
        tag: tagInput.value,
        cable_type: typeInput.value,
        cable_rating: (() => {
          const raw = ratingInput.value != null ? ratingInput.value.trim() : '';
          if (!raw) return '';
          const num = Number(raw);
          return Number.isFinite(num) ? num : raw;
        })(),
        conductors,
        conductor_size: sizeInput.value,
        conductor_material: materialInput.value,
        resistance_per_km: parseNumericValue(resistancePerKmInput),
        reactance_per_km: parseNumericValue(reactancePerKmInput),
        zero_sequence_impedance: zeroSequenceInput.value,
        mutual_coupling: mutualCouplingInput.value,
        insulation_type: insulationInput.value,
        operating_temp: parseNumericValue(operatingTempInput),
        ambient_temp: parseNumericValue(ambientInput),
        install_method: installInput.value,
        thermal_rating_ampacity: parseNumericValue(thermalRatingInput),
        shield_armor: shieldArmorInput.value,
        impedance_per_length: impedancePerLengthInput.value,
        capacitance_per_km: parseNumericValue(capacitanceInput),
        short_circuit_rating: parseNumericValue(shortCircuitInput),
        grouping_factor: parseNumericValue(groupingInput),
        resistance_temp_correction_coeff: parseNumericValue(resistanceCoeffInput),
        core_configuration: coreConfigurationInput.value,
        ground_return_path_resistance: parseNumericValue(groundReturnInput),
        color: colorInput.value,
        phases: normalizedPhases,
        calc_ampacity: sizeInput.dataset.calcAmpacity || '',
        voltage_drop_pct: sizeInput.dataset.voltageDrop || '',
        sizing_warning: sizeInput.dataset.sizingWarning || '',
        code_reference: sizeInput.dataset.codeRef || '',
        sizing_report: sizeInput.dataset.sizingReport || ''
      };
      setImpedancePart(cable, 'r', impedanceRInput.value, { keepEmpty: false });
      setImpedancePart(cable, 'x', impedanceXInput.value, { keepEmpty: false });
      const manualImpedanceProvided =
        (typeof impedanceRInput.value === 'string' && impedanceRInput.value.trim() !== '') ||
        (typeof impedanceXInput.value === 'string' && impedanceXInput.value.trim() !== '');
      if (existingConn?.cable?.operating_voltage !== undefined) {
        cable.operating_voltage = existingConn.cable.operating_voltage;
      }
      let resolvedLength = null;
      if (manualLen) {
        const manualValue = parseNumericValue(lengthInput);
        cable.length = manualValue;
        cable.manual_length = true;
        if (typeof manualValue === 'number' && Number.isFinite(manualValue) && manualValue > 0) {
          resolvedLength = manualValue;
        }
      } else {
        const connLength = Number(existingConn?.length);
        const unitPerPx = Number(diagramScale?.unitPerPx);
        if (Number.isFinite(connLength) && connLength > 0) {
          const scaleFactor = Number.isFinite(unitPerPx) && unitPerPx > 0 ? unitPerPx : 1;
          resolvedLength = connLength * scaleFactor;
        }
      }
      if (!manualImpedanceProvided && !hasImpedance(cable) && resolvedLength !== null) {
        const derivedImpedance = computeImpedanceFromPerKm({
          resistancePerKm: cable.resistance_per_km,
          reactancePerKm: cable.reactance_per_km,
          length: resolvedLength,
          unit: diagramScale?.unit
        });
        if (derivedImpedance) {
          cable.impedance = derivedImpedance;
        }
      }
      modal.classList.remove('show');
      const resolvedCable = {
        ...cable,
        from_tag: getComponentTag(source),
        to_tag: getComponentTag(target)
      };
      if (hasImpedance(cable)) resolvedCable.impedance = { ...cable.impedance };
      resolve({
        cable: resolvedCable,
        phases: normalizedPhases.slice(),
        conductors,
        impedance: hasImpedance(cable) ? { ...cable.impedance } : undefined
      });
    });

    modal.appendChild(form);
    modal.classList.add('show');
  });
}

async function editCableComponent(comp) {
  if (!comp) return;
  if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
  const outbound = (comp.connections || []).find(conn => conn.target);
  const target = outbound ? components.find(t => t.id === outbound.target) || {} : {};
  const workingConn = outbound || {
    target: target.id || '',
    cable: comp.cable,
    phases: parseCablePhases(comp.cable),
    conductors: comp.cable?.conductors || comp.cable?.conductors_count || ''
  };
  const hadOutboundCable = outbound ? Object.prototype.hasOwnProperty.call(outbound, 'cable') : false;
  const originalCable = outbound ? outbound.cable : undefined;
  if (outbound) outbound.cable = comp.cable;
  let res = null;
  try {
    res = await chooseCable(comp, target, workingConn);
  } finally {
    if (!res && outbound) {
      if (hadOutboundCable) outbound.cable = originalCable;
      else delete outbound.cable;
    }
  }
  if (!res) return;
  const updatedCable = { ...res.cable };
  if (hasImpedance(res.cable)) updatedCable.impedance = { ...res.cable.impedance };
  const resolvedPhases = parseCablePhases(res.phases ?? updatedCable);
  updatedCable.phases = resolvedPhases.slice();
  comp.cable = updatedCable;
  if (outbound) {
    outbound.cable = { ...updatedCable };
    if (hasImpedance(updatedCable)) outbound.cable.impedance = { ...updatedCable.impedance };
    outbound.phases = resolvedPhases.slice();
    outbound.conductors = res.conductors;
    if (res.impedance && typeof res.impedance === 'object') {
      outbound.impedance = { ...res.impedance };
    } else if (hasImpedance(updatedCable)) {
      outbound.impedance = { ...updatedCable.impedance };
    } else {
      delete outbound.impedance;
    }
  }
  pushHistory();
  render();
  save();
  markScheduleReconcilePending();
}

const oneLineEventState = createEventStateAdapter({
  activeLayerId: { get: () => activeLayerId, set: value => { activeLayerId = value; } },
  activeSheet: { get: () => activeSheet, set: value => { activeSheet = value; } },
  activeZoneId: { get: () => activeZoneId, set: value => { activeZoneId = value; } },
  alignmentGuidesEnabled: { get: () => alignmentGuidesEnabled, set: value => { alignmentGuidesEnabled = value; } },
  checkpoints: { get: () => checkpoints, set: value => { checkpoints = value; } },
  clickSelectTimer: { get: () => clickSelectTimer, set: value => { clickSelectTimer = value; } },
  clipboard: { get: () => clipboard, set: value => { clipboard = value; } },
  componentMeta: { get: () => componentMeta, set: value => { componentMeta = value; } },
  components: { get: () => components, set: value => { components = value; } },
  connectMode: { get: () => connectMode, set: value => { connectMode = value; } },
  connectSource: { get: () => connectSource, set: value => { connectSource = value; } },
  connections: { get: () => connections, set: value => { connections = value; } },
  contextCanvasPoint: { get: () => contextCanvasPoint, set: value => { contextCanvasPoint = value; } },
  contextTarget: { get: () => contextTarget, set: value => { contextTarget = value; } },
  cursorPos: { get: () => cursorPos, set: value => { cursorPos = value; } },
  cursorPosValid: { get: () => cursorPosValid, set: value => { cursorPosValid = value; } },
  diagramDatablockConfig: { get: () => diagramDatablockConfig, set: value => { diagramDatablockConfig = value; } },
  diagramFilterMode: { get: () => diagramFilterMode, set: value => { diagramFilterMode = value; } },
  diagramViewport: { get: () => diagramViewport, set: value => { diagramViewport = value; } },
  diagramZoom: { get: () => diagramZoom, set: value => { diagramZoom = value; } },
  dragConnections: { get: () => dragConnections, set: value => { dragConnections = value; } },
  dragOffset: { get: () => dragOffset, set: value => { dragOffset = value; } },
  dragSnapGuides: { get: () => dragSnapGuides, set: value => { dragSnapGuides = value; } },
  dragging: { get: () => dragging, set: value => { dragging = value; } },
  draggingConnection: { get: () => draggingConnection, set: value => { draggingConnection = value; } },
  draggingLabel: { get: () => draggingLabel, set: value => { draggingLabel = value; } },
  gridEnabled: { get: () => gridEnabled, set: value => { gridEnabled = value; } },
  gridSize: { get: () => gridSize, set: value => { gridSize = value; } },
  historyEvents: { get: () => historyEvents, set: value => { historyEvents = value; } },
  hoverPort: { get: () => hoverPort, set: value => { hoverPort = value; } },
  labelCounters: { get: () => labelCounters, set: value => { labelCounters = value; } },
  lastComponentClick: { get: () => lastComponentClick, set: value => { lastComponentClick = value; } },
  lastPointerUp: { get: () => lastPointerUp, set: value => { lastPointerUp = value; } },
  layers: { get: () => layers, set: value => { layers = value; } },
  legendDrag: { get: () => legendDrag, set: value => { legendDrag = value; } },
  legendUserMoved: { get: () => legendUserMoved, set: value => { legendUserMoved = value; } },
  lintList: { get: () => lintList, set: value => { lintList = value; } },
  lintPanel: { get: () => lintPanel, set: value => { lintPanel = value; } },
  marquee: { get: () => marquee, set: value => { marquee = value; } },
  marqueeSelectionMade: { get: () => marqueeSelectionMade, set: value => { marqueeSelectionMade = value; } },
  middlePanState: { get: () => middlePanState, set: value => { middlePanState = value; } },
  minimapVisible: { get: () => minimapVisible, set: value => { minimapVisible = value; } },
  orthogonalRouting: { get: () => orthogonalRouting, set: value => { orthogonalRouting = value; } },
  paletteContextTarget: { get: () => paletteContextTarget, set: value => { paletteContextTarget = value; } },
  paletteWidth: { get: () => paletteWidth, set: value => { paletteWidth = value; } },
  pointerDownComponentId: { get: () => pointerDownComponentId, set: value => { pointerDownComponentId = value; } },
  propSchemas: { get: () => propSchemas, set: value => { propSchemas = value; } },
  propertyClipboard: { get: () => propertyClipboard, set: value => { propertyClipboard = value; } },
  resizingAnnotation: { get: () => resizingAnnotation, set: value => { resizingAnnotation = value; } },
  resizingBus: { get: () => resizingBus, set: value => { resizingBus = value; } },
  resizingPalette: { get: () => resizingPalette, set: value => { resizingPalette = value; } },
  resizingStudiesPanel: { get: () => resizingStudiesPanel, set: value => { resizingStudiesPanel = value; } },
  selected: { get: () => selected, set: value => { selected = value; } },
  selectedConnection: { get: () => selectedConnection, set: value => { selectedConnection = value; } },
  selection: { get: () => selection, set: value => { selection = value; } },
  sheets: { get: () => sheets, set: value => { sheets = value; } },
  showEnergizedState: { get: () => showEnergizedState, set: value => { showEnergizedState = value; } },
  showHazAreaOverlay: { get: () => showHazAreaOverlay, set: value => { showHazAreaOverlay = value; } },
  showProtectionZones: { get: () => showProtectionZones, set: value => { showProtectionZones = value; } },
  showTitleBlock: { get: () => showTitleBlock, set: value => { showTitleBlock = value; } },
  studiesResizeStartWidth: { get: () => studiesResizeStartWidth, set: value => { studiesResizeStartWidth = value; } },
  studiesResizeStartX: { get: () => studiesResizeStartX, set: value => { studiesResizeStartX = value; } },
  studiesWidth: { get: () => studiesWidth, set: value => { studiesWidth = value; } },
  symbolStandard: { get: () => symbolStandard, set: value => { symbolStandard = value; } },
  tempConnection: { get: () => tempConnection, set: value => { tempConnection = value; } },
  titleBlockFields: { get: () => titleBlockFields, set: value => { titleBlockFields = value; } },
  typeIcons: { get: () => typeIcons }
});

async function init() {
  await initializeOneLineEvents({
    documentRef: document,
    DEFAULT_DIAGRAM_ZOOM,
    DOUBLE_CLICK_THRESHOLD_MS,
    DRAG_MOVE_THRESHOLD,
    Element,
    HTMLElement,
    SINGLE_CLICK_DELAY_MS,
    URLSearchParams,
    addComponent,
    addPaletteSymbol,
    addSheet,
    adjustZoom,
    alignSelection,
    applyCableResultToConnection,
    applyDiagramZoom,
    applyDrawingModeClass,
    applyNextLabel,
    applyPropertyClipboardToComponent,
    arrangeDuctbankSampleLayout,
    asset,
    attachLocalWheelScroll,
    autoAttachComponent,
    bindHistorySidebarControls,
    buildDragSnapGuides,
    buildPalette,
    canPastePropertyClipboard,
    cancelPendingClickSelection,
    captureBusAnchors,
    categoryForType,
    chooseCable,
    clampPaletteWidth,
    clampStudiesWidth,
    clearBackground,
    closePaletteContextMenu,
    commandForShortcut,
    compHeight,
    compWidth,
    componentBounds,
    computeDragConnections,
    createConnectionPreviewLine,
    createLayer,
    createPropertyClipboardFromComponent,
    createProtectionZone,
    customComponentStorageKey,
    defaultLabelAnchor,
    deleteSheet,
    distributeSelection,
    editCableComponent,
    editManufacturerDefaults,
    editPrefixes,
    ensureBaselineComponentMetadata,
    ensureBaselineFieldsOnComponent,
    ensureGeneratorStudyFieldsOnComponent,
    ensureGeneratorStudyMetadata,
    ensureMccFieldsOnComponent,
    ensureMccMetadata,
    ensurePropModal,
    ensurePtVtFieldsOnComponent,
    ensurePtVtMetadata,
    ensureStudyInputFieldsOnComponent,
    ensureStudyInputMetadata,
    executeShortcutCommand,
    exitZoneAssignMode,
    exportAllReports,
    exportDWG,
    exportDXF,
    exportDiagram,
    exportOneLineDiagnostics,
    exportPDF,
    finalizeMarqueeSelection,
    findComponentByTag,
    finishConnectionToCandidate,
    flashSnapIndicator,
    focusComponentElement,
    focusCrossProbeTarget,
    getConnectionCandidateFromEvent,
    getItem,
    getOneLine,
    getOneLineViewSetting,
    getViewportCenter,
    groupSelection,
    handleImport,
    highlightFoundComponent,
    historyController,
    inferSchemaFromProps,
    initCompactMode,
    initDarkMode,
    initNavToggle,
    initSettings,
    isComponentPositionLocked,
    isComponentPropertiesLocked,
    isConductorSegmentComponent,
    loadComponentLibrary,
    loadSampleDiagram,
    loadSheet,
    loadTemplates,
    markScheduleReconcilePending,
    navigateToCustomComponentEditor,
    nearestPortToPoint,
    nearestPorts,
    normalizeComponent,
    normalizeComponentElectricalProperties,
    normalizePortsForCategory,
    openAutoBuildModal,
    openKeyboardShortcutsModal,
    openModal,
    openScheduleReconcileModal,
    openShapeModal,
    openViewModal,
    paletteContextMenu,
    paletteWidthStorageKey,
    panDiagram,
    performance,
    placeConnectionWaypoint,
    portPosition,
    promptDialog,
    pushHistory,
    reassignBusAnchors,
    rebuildComponentMaps,
    recordHistoryEvent,
    recordPaletteUsage,
    redo,
    refineOneLineCommandSurface,
    refreshAttributeOptions,
    renameSheet,
    render,
    renderBgPanel,
    renderHistorySidebar,
    renderLayerPanel,
    renderMinimap,
    renderProtectionZonesPanel,
    renderSheetTabs,
    renderTemplates,
    renderTitleBlock,
    repeatLastCommand,
    requestAnimationFrame,
    resetConnectInteraction,
    resetConnectionWaypoint,
    resolveComponentMeta,
    resolveComponentMetaKey,
    resolveInitialCrossProbe,
    runRepeatableCommand,
    save,
    scheduleNoncriticalWork,
    selectByType,
    selectComponent,
    selectConnected,
    serializeDiagram,
    setActiveOperatingState,
    setDataStateOverlayMode,
    setDatablockDensityMode,
    setDatablockFormatMode,
    setDiagramZoom,
    setDrawingMode,
    setItem,
    setOneLineViewSetting,
    setTimeout,
    setupLibraryTools,
    setupToolbarMenus,
    shareDiagram,
    showToast,
    snapToNearestBus,
    startMiddlePan,
    startTour,
    stopMiddlePan,
    studiesPanel,
    studiesWidthStorageKey,
    syncDataStateOverlayControl,
    syncDatablockDensityControl,
    syncDatablockFormatControl,
    syncDrawingModeControl,
    syncOperatingStateControl,
    toDiagramCoords,
    toggleComponentInZone,
    toggleGrid,
    toggleLock,
    togglePaletteFavorite,
    togglePropertiesLock,
    undo,
    ungroupComponent,
    updateBusPorts,
    updateMiddlePan,
    updateShortcutControlLabels,
    updateStatusBar,
    updateViewButtonLabel,
    updateZoomDisplay,
    uploadBackground,
    validateDiagram,
    window,
    writeAppSetting,
    zoomToFit,
    zoomToSelection
  }, oneLineEventState);
}

function getCategory(c) {
  if (c?.type === 'panel') return 'panel';
  const metaKey = resolveComponentMetaKey(c);
  return subtypeCategory[metaKey] || subtypeCategory[c.subtype] || c.type;
}

function formatLoadFlowCurrentValue(value) {
  if (value === null || value === undefined) return '';
  const normalize = val => {
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(1);
  };
  if (typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((val, idx) => [idx, val])
      : Object.entries(value);
    const parts = entries
      .map(([phase, val]) => {
        const formatted = normalize(val);
        if (formatted === null) return null;
        const label = String(phase).trim();
        return { phase: label, formatted };
      })
      .filter(Boolean)
      .sort((a, b) => a.phase.localeCompare(b.phase, undefined, { sensitivity: 'base', numeric: true }))
      .map(entry => `${entry.phase}:${entry.formatted}`);
    return parts.join(', ');
  }
  const formatted = normalize(value);
  return formatted === null ? '' : formatted;
}

function buildCableSpecFromComponent(comp, allComps) {
  if (!comp || comp.type !== 'cable') return null;
  const cable = comp.cable || {};
  const upstream = findSourceComponent(comp.id, allComps);
  const outbound = (comp.connections || []).find(conn => conn.target);
  const target = outbound ? allComps.find(c => c.id === outbound.target) : null;
  const spec = { ...cable };
  if (hasImpedance(cable)) spec.impedance = { ...cable.impedance };
  if (!spec.tag) spec.tag = comp.label || comp.id;
  spec.from_tag = getComponentTag(upstream);
  spec.to_tag = getComponentTag(target) || outbound?.target || '';
  const outboundPhases = parseCablePhases(outbound?.phases);
  const cablePhases = parseCablePhases(cable);
  const phases = outboundPhases.length ? outboundPhases : cablePhases;
  spec.phases = phases.length ? phases.join(',') : formatCablePhases(cable);
  spec.conductors = outbound?.conductors || cable.conductors || '';
  const unitPerPx = diagramScale.unitPerPx || 1;
  const slackPctRaw = parseFloat(cable.slack_pct);
  const slackPct = Number.isFinite(slackPctRaw) ? Math.max(0, slackPctRaw) : 0;
  const slackMultiplier = 1 + (slackPct / 100);
  const autoLen = (outbound?.length || 0) * unitPerPx * slackMultiplier;
  let finalLen = autoLen;
  if (cable.manual_length) {
    const manual = parseFloat(cable.length);
    if (!Number.isNaN(manual)) finalLen = manual;
  }
  if (finalLen) {
    spec.length = finalLen.toFixed(2);
  }
  if (cable.manual_length) spec.manual_length = true;
  const load = {
    current: parseFloat(target?.current) || 0,
    voltage: parseFloat(target?.voltage) || parseFloat(upstream?.voltage) || 0,
    phases: phases.length || parseInt(target?.phases || upstream?.phases || 3, 10)
  };
  const params = {
    length: finalLen,
    material: spec.conductor_material || 'cu',
    insulation_rating: parseFloat(target?.insulation_rating) || 90,
    ambient: parseFloat(spec.ambient_temp) || parseFloat(upstream?.ambient) || 30,
    conductors: parseInt(spec.conductors) || 1,
    maxVoltageDrop: parseFloat(target?.maxVoltageDrop) || 3,
    code: target?.code || 'NEC'
  };
  const result = sizeConductor(load, params);
  spec.calc_ampacity = result.ampacity ? result.ampacity.toFixed(2) : spec.calc_ampacity || '';
  spec.voltage_drop_pct = result.voltageDrop ? result.voltageDrop.toFixed(2) : spec.voltage_drop_pct || '';
  spec.sizing_warning = result.violation || spec.sizing_warning || '';
  spec.code_reference = result.codeRef || spec.code_reference || '';
  spec.sizing_report = JSON.stringify(result.report || {});
  spec.load_flow_current = formatLoadFlowCurrentValue(outbound?.loading_amps);
  comp.cable = {
    ...comp.cable,
    calc_ampacity: spec.calc_ampacity,
    voltage_drop_pct: spec.voltage_drop_pct,
    sizing_warning: spec.sizing_warning,
    code_reference: spec.code_reference,
    sizing_report: spec.sizing_report,
    length: spec.length,
    manual_length: spec.manual_length,
    load_flow_current: spec.load_flow_current
  };
  return spec;
}

function showToast(msg, linkText, linkHref) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  if (linkText && linkHref) {
    const a = document.createElement('a');
    a.href = linkHref;
    a.textContent = linkText;
    a.target = '_blank';
    t.append(' ', a);
  }
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function resolveComponentVoltageVolts(comp, options = {}) {
  if (!comp || typeof comp !== 'object') return null;
  const { includeOperatingVoltage = true } = options;
  const containers = [comp];
  if (comp.props && typeof comp.props === 'object') containers.push(comp.props);
  if (comp.parameters && typeof comp.parameters === 'object') containers.push(comp.parameters);
  if (comp.cable && typeof comp.cable === 'object') containers.push(comp.cable);
  const primaryKeys = [
    'voltage',
    'volts',
    'voltage_v',
    'voltage_kv',
    'operating_voltage',
    'rated_voltage',
    'rated_volts',
    'voltage_rating'
  ];
  const directKeys = includeOperatingVoltage ? primaryKeys : primaryKeys.filter(key => key !== 'operating_voltage');
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    for (const key of directKeys) {
      if (!(key in container)) continue;
      const resolved = normalizeVoltageToVolts({ [key]: container[key] });
      if (resolved !== null && Number.isFinite(resolved) && resolved > 0) {
        return resolved;
      }
    }
  }
  const baseKeys = ['baseKV', 'kV', 'kv', 'nominalVoltage', 'nominal_voltage', 'prefault_voltage'];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    for (const key of baseKeys) {
      if (!(key in container)) continue;
      const base = toBaseKV({ kV: container[key] });
      if (Number.isFinite(base) && base > 0) {
        return base * 1000;
      }
    }
  }
  return null;
}

function resolveConnectionVoltageVolts(component, connection, role) {
  if (!component) return null;
  if (component.type === 'transformer' && connection) {
    const portIndex = role === 'target'
      ? normalizePortIndex(connection?.targetPort)
      : normalizePortIndex(connection?.sourcePort);
    if (Number.isFinite(portIndex)) {
      const portVoltage = resolveTransformerVoltageValue(component, portIndex);
      const normalized = normalizeVoltageToVolts(portVoltage);
      if (normalized !== null && Number.isFinite(normalized) && normalized > 0) {
        return normalized;
      }
    }
  }
  return resolveComponentVoltageVolts(component);
}

function resetValidationIssueMarkers(svg) {
  if (!svg) return;
  svg.querySelectorAll('g.component').forEach(g => {
    g.classList.remove('invalid');
    g.querySelectorAll('.issue-badge').forEach(b => b.remove());
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    const tip = [];
    if (comp.label) tip.push(`Label: ${comp.label}`);
    const tooltipVoltage = resolveComponentVoltageVolts(comp);
    if (Number.isFinite(tooltipVoltage) && tooltipVoltage > 0) {
      tip.push(`Voltage: ${formatVoltage(tooltipVoltage)}`);
    } else if (comp.voltage) {
      tip.push(`Voltage: ${comp.voltage}`);
    }
    if (comp.rating) tip.push(`Rating: ${comp.rating}`);
    g.setAttribute('data-tooltip', tip.join('\n'));
  });
}

function applyValidationIssueMarkers(svg) {
  if (!svg) return;
  resetValidationIssueMarkers(svg);
  if (!validationIssues.length) return;

  const byComp = {};
  validationIssues.forEach(issue => {
    if (!byComp[issue.component]) byComp[issue.component] = [];
    byComp[issue.component].push(issue.message);
  });

  Object.entries(byComp).forEach(([id, msgs]) => {
    const g = svg.querySelector(`g.component[data-id="${id}"]`);
    if (!g) return;
    g.classList.add('invalid');
    const existing = g.getAttribute('data-tooltip');
    const tip = existing ? existing + '\n' + msgs.join('\n') : msgs.join('\n');
    g.setAttribute('data-tooltip', tip);
    const badge = document.createElementNS(svgNS, 'g');
    badge.setAttribute('class', 'issue-badge');
    badge.dataset.issueCount = String(msgs.length);
    const comp = components.find(c => c.id === id) || {};
    const bounds = componentBounds(comp);
    const bx = bounds.right - 7;
    const by = bounds.top + 7;
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = msgs.join('\n');
    const circ = document.createElementNS(svgNS, 'circle');
    circ.setAttribute('cx', bx);
    circ.setAttribute('cy', by);
    circ.setAttribute('r', 6);
    const txt = document.createElementNS(svgNS, 'text');
    txt.setAttribute('x', bx);
    txt.setAttribute('y', by + 2.5);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.textContent = msgs.length > 1 ? String(Math.min(msgs.length, 9)) : '!';
    badge.appendChild(title);
    badge.appendChild(circ);
    badge.appendChild(txt);
    g.appendChild(badge);
  });
}

function validateDiagram(options = {}) {
  const revealPanel = options.revealPanel === true || options.reveal === true;
  const notify = options.notify !== false;
  validationIssues = [];
  const svg = document.getElementById('diagram');
  if (!svg) return validationIssues;

  validationIssues.push(...runDiagramValidationPasses(components, {
    resolveConnectionVoltageVolts,
    formatVoltage,
    getCableForConnection,
    getComponentTag,
    scheduleKeyForComponent,
    hasResolvedScheduleLink
  }));

  // Gap #48 – Cross-sheet connector pairing validation (active sheet only)
  validateSheetLinks(sheets).forEach(issue => {
    if (issue.sheetIndex === activeSheet) {
      validationIssues.push({ component: issue.component, message: issue.message });
    }
  });

  // Run additional validation rules
  validationIssues.push(...runValidation(components, getStudies()));

  if (isEngineeringPrintMode()) {
    resetValidationIssueMarkers(svg);
  } else {
    applyValidationIssueMarkers(svg);
  }

  if (lintList && lintPanel) {
    lintList.innerHTML = '';
    if (validationIssues.length) {
      validationIssues.forEach(issue => {
        const li = document.createElement('li');
        const message = document.createElement('span');
        message.textContent = issue.message;
        const showBtn = document.createElement('button');
        showBtn.type = 'button';
        showBtn.className = 'cross-probe-link';
        showBtn.textContent = 'Show';
        showBtn.setAttribute('aria-label', `Show ${issue.component || 'issue'} on the one-line`);
        showBtn.addEventListener('click', () => focusComponent(issue.component));
        li.append(message, showBtn);
        lintList.appendChild(li);
      });
      if (revealPanel) {
        lintPanel.classList.remove('hidden');
      }
    } else {
      lintPanel.classList.add('hidden');
    }
  }

  renderRightRail();
  if (notify) {
    showToast(validationIssues.length ? `Validation found ${validationIssues.length} issue${validationIssues.length === 1 ? '' : 's'}` : 'Diagram valid');
  }
  return validationIssues;
}

function focusComponent(id) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  selection = [comp];
  selected = comp;
  selectedConnection = null;
  render();
  if (!zoomToComponentNeighborhood(comp, { maxZoom: 1.25, pad: 110 })) {
    const svg = document.getElementById('diagram');
    const g = svg.querySelector(`g.component[data-id="${id}"]`);
    if (g && g.scrollIntoView) g.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }
}

function focusConnection(sourceId, index) {
  const source = components.find(c => c.id === sourceId);
  const normalizedIndex = Number(index);
  if (!source || !Number.isInteger(normalizedIndex) || normalizedIndex < 0) return false;
  if (!Array.isArray(source.connections) || !source.connections[normalizedIndex]) return false;
  selection = [];
  selected = null;
  selectedConnection = { component: source, index: normalizedIndex };
  setRightRailTab('properties');
  render();
  const target = components.find(c => c.id === source.connections[normalizedIndex]?.target);
  zoomToComponents([source, target].filter(Boolean), { pad: 120, maxZoom: 1.25 });
  const svg = document.getElementById('diagram');
  const escapedSourceId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(sourceId)
    : String(sourceId).replace(/"/g, '\\"');
  const link = svg?.querySelector(`.connection[data-comp="${escapedSourceId}"][data-index="${normalizedIndex}"]`);
  if (link && link.scrollIntoView) {
    link.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  } else {
    focusComponent(sourceId);
    selected = null;
    selection = [];
    selectedConnection = { component: source, index: normalizedIndex };
    renderRightRail();
  }
  return true;
}

function focusCrossProbeTarget(target, { componentModal = false, label = '' } = {}) {
  if (!target?.componentId) return false;
  if (Number.isInteger(target.sheetIndex) && target.sheetIndex !== activeSheet) {
    loadSheet(target.sheetIndex);
  }
  if (Number.isInteger(target.connectionIndex)) {
    const focused = focusConnection(target.componentId, target.connectionIndex);
    if (focused) {
      const suffix = label ? ` for ${label}` : '';
      showToast(`Showing linked cable${suffix} on the one-line.`);
      return true;
    }
  }
  focusComponent(target.componentId);
  if (componentModal) setRightRailTab('properties');
  const suffix = label ? ` for ${label}` : '';
  showToast(`Showing one-line component${suffix}.`);
  return true;
}

function resolveInitialCrossProbe(params) {
  const componentId = params.get('component') || '';
  const connectionSource = params.get('connectionSource') || '';
  const connectionIndex = params.has('connectionIndex') ? Number(params.get('connectionIndex')) : null;
  const sheetIndex = params.has('sheet') ? Number(params.get('sheet')) : null;
  if (connectionSource && Number.isInteger(connectionIndex)) {
    const target = resolveOneLineProbe({ componentId: connectionSource }, { activeSheet, sheets });
    if (target) {
      return {
        ...target,
        componentId: connectionSource,
        connectionIndex,
        sheetIndex: Number.isInteger(sheetIndex) ? sheetIndex : target.sheetIndex,
        matchKind: 'connection'
      };
    }
  }
  const probe = params.get('probe') || componentId;
  if (!probe) return null;
  return resolveOneLineProbe({
    componentId,
    probe,
    probeType: params.get('probeType') || ''
  }, { activeSheet, sheets });
}

function updateComponent(id, fields = {}) {
  const comp = components.find(c => c.id === id || c.ref === id);
  if (!comp) return;
  const mapping = { description: 'label', id: 'ref', subCategory: 'subtype' };
  Object.entries(fields).forEach(([k, v]) => {
    if (k === 'ref') return;
    const prop = mapping[k] || k;
    if (prop === 'id') return;
    comp[prop] = v;
  });
  render();
  save(false);
}

function buildScheduleDataFromDiagram() {
  const all = sheets.flatMap(s => s.components);
  const findPanelId = id => {
    const visited = new Set();
    let currentId = id;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const upstream = all.find(item => (item.connections || []).some(conn => conn.target === currentId));
      if (!upstream) return null;
      if (getCategory(upstream) === 'panel') return upstream.ref || upstream.id;
      currentId = upstream.id;
    }
    return null;
  };
  const mapFields = c => {
    const componentTag = getComponentTag(c);
    const description = c.description || c.notes || '';
    const src = all.find(s => (s.connections || []).some(conn => conn.target === c.id));
    const conn = src ? (src.connections || []).find(cc => cc.target === c.id) : null;
    const inboundCable = src && isConductorSegmentComponent(src)
      ? src
      : all.find(item => isConductorSegmentComponent(item) && (item.connections || []).some(cc => cc.target === c.id));
    const cableInfo = inboundCable?.cable || null;
    const connPhases = hasStoredPhases(conn?.phases)
      ? formatCablePhases(conn.phases)
      : hasStoredPhases(cableInfo?.phases)
      ? formatCablePhases(cableInfo)
      : formatCablePhases(c);
    const connConductors = conn?.conductors || cableInfo?.conductors || conn?.cable?.conductors || '';
    const fields = {
      entityId: c.entityId || '',
      id: c.ref || c.id,
      ref: c.id,
      tag: componentTag,
      description: description || (c.label && c.label !== componentTag ? c.label : ''),
      voltage: c.voltage ?? '',
      manufacturer: c.manufacturer ?? '',
      model: c.model ?? '',
      voltage_class: c.voltage_class ?? '',
      enclosure: c.enclosure ?? '',
      thermal_rating: c.thermal_rating ?? '',
      phases: connPhases,
      conductors: connConductors,
      notes: c.notes ?? '',
      rating: c.rating ?? '',
      impedance_r: c.impedance?.r ?? '',
      impedance_x: c.impedance?.x ?? '',
      voltage_mag: typeof c.voltage_mag === 'number' ? c.voltage_mag : '',
      voltage_angle: typeof c.voltage_angle === 'number' ? c.voltage_angle : '',
      voltage_mag_a: c.voltage_mag?.A ?? c.voltage_mag?.a ?? '',
      voltage_mag_b: c.voltage_mag?.B ?? c.voltage_mag?.b ?? '',
      voltage_mag_c: c.voltage_mag?.C ?? c.voltage_mag?.c ?? '',
      voltage_angle_a: c.voltage_angle?.A ?? c.voltage_angle?.a ?? '',
      voltage_angle_b: c.voltage_angle?.B ?? c.voltage_angle?.b ?? '',
      voltage_angle_c: c.voltage_angle?.C ?? c.voltage_angle?.c ?? '',
      category: getCategory(c),
      subCategory: c.subtype ?? '',
      x: c.x ?? '',
      y: c.y ?? '',
      z: c.z ?? ''
    };
    (propSchemas[c.subtype] || []).forEach(f => {
      const value = typeof f.getValue === 'function'
        ? f.getValue(c)
        : c[f.name];
      fields[f.name] = value ?? fields[f.name] ?? '';
    });
    return fields;
  };
  const equipment = all
    .filter(c => getCategory(c) === 'equipment')
    .map(mapFields);
  const panels = all
    .filter(c => getCategory(c) === 'panel')
    .map(mapFields);
  const loads = all
    .filter(c => getCategory(c) === 'load')
    .map(c => {
      const fields = mapFields(c);
      const panelId = findPanelId(c.id);
      if (panelId) fields.panelId = panelId;
      return fields;
    });
  const buses = all
    .filter(c => isBusComponent(c))
    .map(mapFields);
  const cableSpecs = [];
  const seenTags = new Set();
  all
    .filter(c => isConductorSegmentComponent(c))
    .forEach(cableComp => {
      const spec = buildCableSpecFromComponent(cableComp, all);
      if (!spec) return;
      spec.circuitId = cableComp.circuitId || spec.circuitId || '';
      if (spec.tag) seenTags.add(spec.tag);
      cableSpecs.push(spec);
    });
  all.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (!conn.cable) return;
      if (conn.cable.tag && seenTags.has(conn.cable.tag)) return;
      const target = all.find(t => t.id === conn.target);
      const spec = {
        ...conn.cable,
        circuitId: conn.circuitId || conn.cable?.circuitId || '',
        phases: hasStoredPhases(conn.phases) ? formatCablePhases(conn.phases) : formatCablePhases(conn.cable),
        conductors: conn.conductors || conn.cable.conductors,
        from_tag: getComponentTag(c),
        to_tag: getComponentTag(target) || conn.target
      };
      const impedanceSource = conn.impedance || conn.cable?.impedance;
      if (impedanceSource && typeof impedanceSource === 'object') {
        spec.impedance = { ...impedanceSource };
      }
      spec.load_flow_current = formatLoadFlowCurrentValue(conn.loading_amps);
      cableSpecs.push(spec);
    });
  });
  return {
    equipment: [...equipment, ...buses],
    panels: [...panels, ...buses],
    loads,
    cables: cableSpecs
  };
}

function synchronizeProjectDataFromDiagram() {
  const synchronized = synchronizeCanonicalSchedules({
    equipment: getEquipment(), panels: getPanels(), loads: getLoads(), cables: getCables()
  }, buildScheduleDataFromDiagram());
  if (synchronized.totals.creates || synchronized.totals.updates) setProjectEntityCollections(synchronized.collections);
  markScheduleReconcilePending(false);
  return synchronized.totals;
}

function markScheduleReconcilePending(pending = false) {
  setItem(SCHEDULE_RECONCILE_PENDING_KEY, !!pending);
}

function collectionLabel(name) {
  return ({
    equipment: 'Equipment',
    panels: 'Panels',
    loads: 'Loads',
    cables: 'Cables'
  })[name] || name;
}

function appendReconcileTable(container, preview) {
  const cards = document.createElement('div');
  cards.className = 'reconcile-summary-grid';
  [
    ['Safe updates', preview.totals.updates],
    ['New records', preview.totals.creates],
    ['Needs decision', preview.totals.conflictRecords],
    ['Unchanged', preview.totals.unchanged]
  ].forEach(([label, value]) => {
    const card = document.createElement('article');
    const cardLabel = document.createElement('span');
    const cardValue = document.createElement('strong');
    cardLabel.textContent = label;
    cardValue.textContent = String(value || 0);
    card.append(cardLabel, cardValue);
    cards.appendChild(card);
  });
  container.appendChild(cards);

  const table = document.createElement('table');
  table.className = 'data-table';
  table.setAttribute('aria-label', 'Schedule reconcile preview');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Schedule', 'New', 'Safe updates', 'Decision fields', 'Unchanged'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  ['equipment', 'panels', 'loads', 'cables'].forEach(collection => {
    const row = document.createElement('tr');
    const counts = preview[collection]?.counts || {};
    [
      collectionLabel(collection),
      counts.creates || 0,
      counts.updates || 0,
      counts.conflicts || 0,
      counts.unchanged || 0
    ].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  container.appendChild(table);

  const affectedRows = [];
  ['equipment', 'panels', 'loads', 'cables'].forEach(collection => {
    const collectionPreview = preview[collection] || {};
    (collectionPreview.creates || []).forEach(item => {
      affectedRows.push({
        collection,
        action: 'Create',
        identity: item.identity,
        fields: Object.keys(item.record || {}).filter(key => item.record[key] !== null && item.record[key] !== undefined && String(item.record[key]).trim() !== '')
      });
    });
    (collectionPreview.updates || []).forEach(item => {
      affectedRows.push({ collection, action: 'Update', identity: item.identity, fields: item.fields || [] });
    });
    (collectionPreview.conflicts || []).forEach(item => {
      affectedRows.push({
        collection,
        action: 'Conflict',
        identity: item.identity,
        fields: (item.fields || []).map(field => `${field.field}: schedule "${field.currentValue}" preserved over one-line "${field.incomingValue}"`)
      });
    });
  });
  if (!affectedRows.length) return;

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `${affectedRows.length} affected record(s)`;
  details.appendChild(summary);

  const affectedTable = document.createElement('table');
  affectedTable.className = 'data-table reconcile-affected-table';
  affectedTable.setAttribute('aria-label', 'Affected schedule records');
  const affectedHead = document.createElement('thead');
  const affectedHeader = document.createElement('tr');
  ['Schedule', 'Action', 'Record', 'Fields'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    affectedHeader.appendChild(th);
  });
  affectedHead.appendChild(affectedHeader);
  affectedTable.appendChild(affectedHead);

  const affectedBody = document.createElement('tbody');
  affectedRows.forEach(item => {
    const row = document.createElement('tr');
    [
      collectionLabel(item.collection),
      item.action,
      item.identity || '(new record)',
      item.fields.length ? item.fields.join(', ') : 'No field changes'
    ].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    });
    affectedBody.appendChild(row);
  });
  affectedTable.appendChild(affectedBody);
  details.appendChild(affectedTable);
  container.appendChild(details);
}

function appendConflictSummary(container, preview) {
  const conflicts = ['equipment', 'panels', 'loads', 'cables'].flatMap(collection => {
    return (preview[collection]?.conflicts || []).flatMap(item => {
      return item.fields.map(field => ({
        collection,
        identity: item.identity,
        ...field
      }));
    });
  });
  if (!conflicts.length) return;

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `${preview.totals.conflictRecords} record(s) need a decision (${preview.totals.conflicts} field(s))`;
  details.appendChild(summary);

  const list = document.createElement('ul');
  conflicts.slice(0, 8).forEach(conflict => {
    const item = document.createElement('li');
    item.textContent = `${collectionLabel(conflict.collection)} ${conflict.identity || '(new record)'}: ${conflict.field} is "${conflict.currentValue}" in the schedule and "${conflict.incomingValue}" in the one-line.`;
    list.appendChild(item);
  });
  if (conflicts.length > 8) {
    const item = document.createElement('li');
    item.textContent = `${conflicts.length - 8} additional conflict(s) are hidden from this preview.`;
    list.appendChild(item);
  }
  details.appendChild(list);
  container.appendChild(details);
}

function openScheduleReconcileModal() {
  save(false);
  const incoming = buildScheduleDataFromDiagram();
  const preview = previewScheduleReconcile({
    equipment: getEquipment(),
    panels: getPanels(),
    loads: getLoads(),
    cables: getCables()
  }, incoming);
  const hasChanges = preview.totals.creates > 0 || preview.totals.updates > 0;

  return openModal({
    title: 'Review Shared Project Data',
    description: 'One-Line saves update shared project records automatically. Use this review to inspect unresolved identity or legacy-data differences.',
    primaryText: hasChanges ? 'Apply Safe Changes' : 'Close',
    secondaryText: hasChanges ? 'Cancel' : null,
    defaultWidth: 'wide',
    onSubmit() {
      if (!hasChanges) return true;
      const next = applyScheduleReconcilePreview(preview);
      setEquipment(next.equipment);
      setPanels(next.panels);
      setLoads(next.loads);
      setCables(next.cables);
      markScheduleReconcilePending(false);
      if (projectId) saveProject(projectId);
      showToast(`Schedules updated: ${preview.totals.creates} new record(s), ${preview.totals.updates} safe update(s), ${preview.totals.conflictRecords} record(s) still need a decision`);
      return true;
    },
    render(container) {
      const summary = document.createElement('p');
      summary.textContent = hasChanges
        ? 'Legacy or unlinked records can still receive safe additions. Open the affected-record details for field-level context.'
        : `Shared project data is current. ${preview.totals.conflictRecords} identity or legacy-data difference(s) still need review.`;
      container.appendChild(summary);
      appendReconcileTable(container, preview);
      appendConflictSummary(container, preview);
      return null;
    }
  });
}

function serializeState() {
  save(false);
  function extractSchedules(comps) {
    const mapFields = c => {
      const src = comps.find(s => (s.connections || []).some(conn => conn.target === c.id));
      const conn = src ? (src.connections || []).find(cc => cc.target === c.id) : null;
      const inboundCable = src && isConductorSegmentComponent(src)
        ? src
        : comps.find(item => isConductorSegmentComponent(item) && (item.connections || []).some(cc => cc.target === c.id));
      const cableInfo = inboundCable?.cable || null;
      const connPhases = hasStoredPhases(conn?.phases)
        ? formatCablePhases(conn.phases)
        : hasStoredPhases(cableInfo?.phases)
        ? formatCablePhases(cableInfo)
        : formatCablePhases(c);
      const connConductors = conn?.conductors || cableInfo?.conductors || conn?.cable?.conductors || '';
      const fields = {
        id: c.ref || c.id,
        ref: c.id,
        description: c.label,
        manufacturer: c.manufacturer ?? '',
        model: c.model ?? '',
        phases: connPhases,
        conductors: connConductors,
        notes: c.notes ?? '',
        voltage: c.voltage ?? '',
        voltage_mag: typeof c.voltage_mag === 'number' ? c.voltage_mag : '',
        voltage_angle: typeof c.voltage_angle === 'number' ? c.voltage_angle : '',
        voltage_mag_a: c.voltage_mag?.A ?? c.voltage_mag?.a ?? '',
        voltage_mag_b: c.voltage_mag?.B ?? c.voltage_mag?.b ?? '',
        voltage_mag_c: c.voltage_mag?.C ?? c.voltage_mag?.c ?? '',
        voltage_angle_a: c.voltage_angle?.A ?? c.voltage_angle?.a ?? '',
        voltage_angle_b: c.voltage_angle?.B ?? c.voltage_angle?.b ?? '',
        voltage_angle_c: c.voltage_angle?.C ?? c.voltage_angle?.c ?? '',
        category: getCategory(c),
        subCategory: c.subtype ?? '',
        x: c.x ?? '',
        y: c.y ?? '',
        z: c.z ?? ''
      };
      (propSchemas[c.subtype] || []).forEach(f => {
        const value = typeof f.getValue === 'function'
          ? f.getValue(c)
          : c[f.name];
        fields[f.name] = value ?? fields[f.name] ?? '';
      });
      return fields;
    };
    const equipment = comps
      .filter(c => getCategory(c) === 'equipment')
      .map(mapFields);
    const panels = comps
      .filter(c => getCategory(c) === 'panel')
      .map(mapFields);
    const loads = comps
      .filter(c => getCategory(c) === 'load')
      .map(mapFields);
    const buses = comps
      .filter(c => isBusComponent(c))
      .map(mapFields);
    const cables = [];
    const seenTags = new Set();
    comps
      .filter(c => isConductorSegmentComponent(c))
      .forEach(cableComp => {
        const spec = buildCableSpecFromComponent(cableComp, comps);
        if (!spec) return;
        if (spec.tag) seenTags.add(spec.tag);
        cables.push(spec);
      });
    comps.forEach(c => {
      (c.connections || []).forEach(conn => {
        if (!conn.cable) return;
        if (conn.cable.tag && seenTags.has(conn.cable.tag)) return;
        const target = comps.find(t => t.id === conn.target);
        const spec = {
          ...conn.cable,
          phases: hasStoredPhases(conn.phases) ? formatCablePhases(conn.phases) : formatCablePhases(conn.cable),
          conductors: conn.conductors || conn.cable.conductors,
          from_tag: getComponentTag(c),
          to_tag: getComponentTag(target) || conn.target
        };
        const impedanceSource = conn.impedance || conn.cable?.impedance;
        if (impedanceSource && typeof impedanceSource === 'object') {
          spec.impedance = { ...impedanceSource };
        }
        spec.load_flow_current = formatLoadFlowCurrentValue(conn.loading_amps);
        cables.push(spec);
      });
    });
    return { equipment: [...equipment, ...buses], panels: [...panels, ...buses], loads, cables };
  }
  return {
    meta: { scenario: getCurrentScenario() },
    version: DIAGRAM_VERSION,
    templates: templates.map(t => ({ ...t })),
    scale: diagramScale,
    sheets: sheets.map(s => {
      const comps = s.components.map(c => ({
        ...c,
        rotation: c.rotation || 0,
        flipped: !!c.flipped
      }));
      // Gap #51: include layers in serialized state
      return { name: s.name, components: comps, schedules: extractSchedules(comps), layers: Array.isArray(s.layers) ? s.layers.map(l => ({ ...l })) : [] };
    })
  };
}

let diagramFileController = null;

function getDiagramFileController() {
  if (!diagramFileController) {
    diagramFileController = createDiagramFileController({
      documentRef: document,
      windowRef: typeof window === 'undefined' ? null : window,
      URLRef: URL,
      BlobCtor: Blob,
      setTimeoutFn: setTimeout,
      getSheets: () => sheets,
      getScenario: getCurrentScenario,
      getOneLine,
      getStudies,
      diagramVersion: DIAGRAM_VERSION,
      switchScenario,
      normalizeDiagramScale,
      applyDiagramScale: scale => {
        diagramScale = scale;
        setItem('diagramScale', diagramScale);
      },
      applyTemplates: importedTemplates => {
        templates = importedTemplates;
        saveTemplates();
        renderTemplates();
      },
      normalizeComponent,
      applySheets: importedSheets => {
        sheets = importedSheets;
      },
      loadSheet,
      renderSheetTabs,
      save,
      showToast
    });
  }
  return diagramFileController;
}

function exportDiagram() {
  getDiagramFileController().exportDiagram();
}

function exportOneLineDiagnostics() {
  getDiagramFileController().exportDiagnostics();
}
async function shareDiagram() {
  const token = await promptDialog(
    'Share Diagram',
    'GitHub personal access token (gist scope)',
    getItem('gistToken', ''),
    { helperText: 'Create a classic token at github.com/settings/tokens with the gist scope. Stored locally.' }
  );
  if (!token) return;
  setItem('gistToken', token);
  const body = {
    public: true,
    files: {
      'oneline.json': {
        content: JSON.stringify(serializeState(), null, 2)
      }
    }
  };
  try {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${token}`
      },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const data = await res.json();
      await navigator.clipboard.writeText(data.html_url);
      showToast('Share link copied to clipboard');
    } else {
      showToast('Failed to share diagram');
    }
  } catch (err) {
    console.error('Share failed', err);
    showToast('Share failed');
  }
}

function serializeDiagram() {
  const svg = document.getElementById('diagram');
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);
  if (!source.match(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return source;
}


async function handleImport(event) {
  await getDiagramFileController().handleImport(event);
}

async function importDiagram(data) {
  await getDiagramFileController().importDiagram(data);
}
async function loadSampleDiagram() {
  try {
    const res = await fetch(`${asset('examples/sample_oneline.json')}?v=${Date.now()}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    await importDiagram(data);
    arrangeSourceToLoad({ silent: true, componentsToArrange: components });
    setDatablockDensityMode('compact');
    setDatablockFormatMode('engineering');
    zoomToFit({ maxZoom: 1.15, pad: 120 });
  } catch (err) {
    console.error('Failed to load sample diagram', err);
    showToast('Failed to load sample diagram');
  }
}

if (typeof window !== 'undefined') {
  window.updateComponent = updateComponent;
  window.loadComponentLibrary = loadComponentLibrary;
  window.loadManufacturerLibrary = loadManufacturerLibrary;
}

async function __oneline_init() {
  // Load libraries
  await Promise.all([
    loadComponentLibrary({ renderPalette: false }).catch(e => console.error('loadComponentLibrary failed:', e)),
    loadManufacturerLibrary().catch(e => console.error('loadManufacturerLibrary failed:', e)),
  ]);

  await init();

  // Reload the diagram canvas whenever a remote collaborator's patch is applied
  document.addEventListener('ctr:remote-applied', () => {
    const { sheets: remoteSheets, activeSheet: remoteActiveSheet = 0 } = getOneLine();
    sheets = (Array.isArray(remoteSheets) ? remoteSheets : []).map((s, i) => ({
      name: s.name || `Sheet ${i + 1}`,
      components: (Array.isArray(s.components) ? s.components : []).map(normalizeComponent),
      connections: Array.isArray(s.connections) ? s.connections : [],
    }));
    if (!sheets.length) sheets = [{ name: 'Sheet 1', components: [], connections: [] }];
    const normalizedRemoteActive = Number.isInteger(remoteActiveSheet) ? remoteActiveSheet : 0;
    activeSheet = Math.min(Math.max(normalizedRemoteActive, 0), sheets.length - 1);
    components = sheets[activeSheet].components;
    connections = sheets[activeSheet].connections;
    renderSheetTabs();
    render();
  });
}

bootstrapPage({
  bodyReadyDataset: 'onelineReady',
  openDetailsInE2E: true,
  beacon: {
    id: 'oneline-ready-beacon',
    attr: 'data-oneline-ready',
    waitFor: '#diagram',
  },
  onReady: __oneline_init,
});
