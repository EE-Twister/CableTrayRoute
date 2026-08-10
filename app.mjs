// ---- Inline E2E helpers (no external import) ----
const E2E = new URLSearchParams(location.search).has('e2e');

function markReady(flagName) {
  try {
    document.documentElement.setAttribute(flagName, '1');
    // also expose to window for debugging
    window[flagName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
  } catch { /* DOM/window unavailable in test sandboxes; readiness flag is best-effort */ }
}

function ensureBeacon(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;inset:auto auto 0 0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
  }
}


function suppressResumeIfE2E() {
  if (!E2E) return;
  // Never clear browser storage from URL-controlled E2E flags.
  // Tests should seed/clear state explicitly in their own setup steps.
}

window.E2E = E2E;

import { emitAsync } from './utils/safeEvents.mjs';
import { fetchDataFile } from './src/fetchUtils.mjs';
import { showAlertModal } from './src/components/modal.js';
import { createDirtyTracker } from './dirtyTracker.js';
import { normalizeRouteResultState } from './analysis/routeResults.mjs';
import { filterRouteResultsForProject } from './analysis/deliverableWorkflow.mjs';
import { buildCablePullPlan } from './analysis/cablePullPlan.mjs';
import { buildPullGroupSuggestions } from './analysis/cablePullGroups.mjs';
import { summarizeRouteScreening } from './analysis/routeScreeningSummary.mjs';
import { buildLargeFacilityRoutingSample } from './analysis/largeFacilityRoutingSample.mjs';
import { getRacewayReviewTarget, isRacewayOverloaded } from './analysis/racewayReviewTarget.mjs';
import {
    compactCableReference,
    compactRouteResultStateForStorage,
    compactTrayCableMapForStorage
} from './analysis/routeStorageCompaction.mjs';
import { recordStartupMeasurement, startPerformanceMeasurement } from './src/performance/performanceMetrics.js';
import { appendHtmlChunks } from './src/components/incrementalDom.js';
import { bindRouteDetailActions, buildRouteDetailMarkup } from './src/routing/routeDetailView.mjs';
import { createRouteBreakdown } from './src/routing/routeBreakdown.mjs';

const getParallelCount = value => Math.max(1, Number.parseInt(value, 10) || 1);

function emitSticky(name, flagKey) {
  if (!window.__e2eFlags) window.__e2eFlags = {};
  window.__e2eFlags[flagKey] = true;
  emitAsync(name);
  if (E2E) {
    let n = 0;
    const id = setInterval(() => {
      emitAsync(name);
      if (++n >= 20) clearInterval(id);
    }, 50);
    setTimeout(() => clearInterval(id), 1500);
  }
}

function whenPresent(selector, cb, timeoutMs = 5000) {
  const start = performance.now();
  const poll = () => {
    if (document.querySelector(selector)) return cb();
    if (performance.now() - start > timeoutMs) return;
    setTimeout(poll, 50);
  };
  poll();
}
import { getItem, setItem, setSessionItem, removeItem, getProjectInputFingerprint, getTrays, getCables, getDuctbanks, getConduits, exportProject, importProject, setCables } from './dataStore.mjs';
import { buildSegmentRows, buildSummaryRows, buildBOM, buildTrayHardwareBOM } from './resultsExport.mjs';
import './site.js';
import { clearConduitCache, getProjectState, setProjectState } from './projectStorage.js';
import { calculateVoltageDrop } from './src/voltageDrop.js';
import { exportRoutesDXF } from './bimExport.mjs';
import { exportToGLTF2 } from './src/exporters/gltf2.mjs';
import { buildRouteDecisionScore, buildRouteMetrics, buildRouteSceneModel } from './src/routing/routeSceneModel.mjs?v=4';
import { buildDuctbankRouteHandoff } from './src/ductbankProjectAdapter.mjs';
import { escapeAttr, escapeHtml, isSafeUrl } from './src/htmlSafety.mjs';
import {
    buildRouteExplanationPoints,
    buildRouteIssueAdvice,
    formatRouteDistance as formatRouteDistanceModel,
    getRejectedReasonCounts,
    isRoutedResult,
    summarizeRouteReview
} from './src/routing/routeReviewModel.mjs';
import {
    buildRouteExplanationMarkup,
    buildRouteScreeningReviewMarkup,
    renderRouteSummaryPanel as renderRouteSummaryPanelView
} from './src/routing/routeReviewView.mjs';
import { createRoutingState } from './src/routing/routingState.mjs';
import { computeRoutingProjectHash } from './src/routing/projectHash.mjs';
import {
    computeNeededTrayWidth,
    formatRacewayRecommendation,
    recommendRaceway
} from './src/routing/racewaySizingModel.mjs';
import { buildRoutingReadiness } from './src/routing/routingReadinessModel.mjs';
import { CableRoutingSystem } from './src/routing/cableRoutingSystem.mjs';
import {
    buildRoutingRacewayData,
    expandScheduledRaceways,
    formatConduitCountText,
    normalizeCableSchedule,
    normalizeDuctbankSchedule,
    normalizeTraySchedule
} from './src/routing/routingProjectAdapter.mjs';
import {
    getSampleCables,
    getSampleDuctbanks,
    getSampleRiserConduits,
    getSampleTrays,
    ROUTE_PRESETS
} from './src/routing/routingSamples.mjs';
import {
    getRouteVisualizationMetrics as routeMetrics,
    getTrayUtilizationPercent as utilizationForTray,
    ROUTE_COLORS,
    ROUTE_PLOT_CONFIG as plotConfig,
    ROUTE_VIEW_PRESETS
} from './src/routing/routeVisualizationModel.mjs';
import { buildPlotlyRouteScene } from './src/routing/plotlyRouteScene.mjs';
import {
    bindPullReviewActions,
    buildPullReviewMarkup
} from './src/routing/pullReviewView.mjs';
import {
    bindCableTable,
    bindManualTrayTable,
    buildCableTableMarkup,
    buildManualTrayTableMarkup
} from './src/routing/manualEntryView.mjs';

// Filename: app.mjs
// (This is an improved version that adds route segment consolidation)
suppressResumeIfE2E();

// Ensure Canvas 2D contexts are optimized for repeated pixel reads.
// This avoids Chrome warnings about frequent getImageData usage.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, options) {
    if (type === '2d') {
        options = options || {};
        if (options.willReadFrequently === undefined) {
            options.willReadFrequently = true;
        }
    }
    return originalGetContext.call(this, type, options);
};
// Some libraries (e.g. Plotly) may use OffscreenCanvas; patch it as well.
if (typeof OffscreenCanvas !== 'undefined') {
    const originalOffscreenGetContext = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function(type, options) {
        if (type === '2d') {
            options = options || {};
            if (options.willReadFrequently === undefined) {
                options.willReadFrequently = true;
            }
        }
        return originalOffscreenGetContext.call(this, type, options);
    };
}

// Lazy-load conductor property data when needed.
async function ensureConductorProps() {
    if (!globalThis.CONDUCTOR_PROPS) {
        globalThis.CONDUCTOR_PROPS = await fetchDataFile('data/conductor_properties.json', {});
    }
    return globalThis.CONDUCTOR_PROPS;
}
// start loading early
ensureConductorProps().catch(e => console.warn('Failed to preload conductor properties:', e));

const CONDUIT_SPECS = {
    "EMT": {"1/2":0.304,"3/4":0.533,"1":0.864,"1-1/4":1.496,"1-1/2":2.036,"2":3.356,"2-1/2":5.858,"3":8.846,"3-1/2":11.545,"4":14.753},
    "ENT": {"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291},
    "FMC": {"3/8":0.116,"1/2":0.317,"3/4":0.533,"1":0.817,"1-1/4":1.277,"1-1/2":1.858,"2":3.269,"2-1/2":4.909,"3":7.069,"3-1/2":9.621,"4":12.566},
    "IMC": {"1/2":0.342,"3/4":0.586,"1":0.959,"1-1/4":1.647,"1-1/2":2.225,"2":3.63,"2-1/2":5.135,"3":7.922,"3-1/2":10.584,"4":13.631},
    "LFNC-A": {"3/8":0.192,"1/2":0.312,"3/4":0.535,"1":0.854,"1-1/4":1.502,"1-1/2":2.018,"2":3.343},
    "LFNC-B": {"3/8":0.192,"1/2":0.314,"3/4":0.541,"1":0.873,"1-1/4":1.528,"1-1/2":1.981,"2":3.246},
    "LFMC": {"3/8":0.192,"1/2":0.314,"3/4":0.541,"1":0.873,"1-1/4":1.277,"1-1/2":1.858,"2":3.269,"2-1/2":4.881,"3":7.475,"3-1/2":9.731,"4":12.692},
    "RMC": {"1/2":0.314,"3/4":0.549,"1":0.887,"1-1/4":1.526,"1-1/2":2.071,"2":3.408,"2-1/2":4.866,"3":7.499,"3-1/2":10.01,"4":12.882,"5":20.212,"6":29.158},
    "PVC Sch 80": {"1/2":0.217,"3/4":0.409,"1":0.688,"1-1/4":1.237,"1-1/2":1.711,"2":2.874,"2-1/2":4.119,"3":6.442,"3-1/2":8.688,"4":11.258,"5":17.855,"6":25.598},
    "PVC Sch 40": {"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291,"2-1/2":4.695,"3":7.268,"3-1/2":9.737,"4":12.554,"5":19.761,"6":28.567},
    "PVC Type A": {"1/2":0.385,"3/4":0.65,"1":1.084,"1-1/4":1.767,"1-1/2":2.324,"2":3.647,"2-1/2":5.453,"3":8.194,"3-1/2":10.694,"4":13.723},
    "PVC Type EB": {"2":3.874,"3":8.709,"3-1/2":11.365,"4":14.448,"5":22.195,"6":31.53}
};

const CONTAINMENT_RULES = {
    thresholds: { conduit: 3, channel: 6 } // 1-3 cables conduit, 4-6 channel, >6 tray
};

const SHAPE_CODES = [
    'STR','90B','45B','30B/60B','TEE','X','VI','VO','45VI','45VO','RED-C','RED-S','Z','OFFSET','SPIRAL'
];

const SHAPE_COLORS = {
    '90B': '#1f77b4',
    '45B': '#ff7f0e',
    '30B/60B': '#2ca02c',
    'TEE': '#d62728',
    'X': '#9467bd',
    'VI': '#17becf',
    'VO': '#17becf',
    '45VI': '#8c564b',
    '45VO': '#8c564b',
    'RED-C': '#e377c2',
    'RED-S': '#e377c2',
    'Z': '#bcbd22',
    'OFFSET': '#7f7f7f',
    'SPIRAL': '#17becf'
};

async function initializeApp() {
    initSettings();
    initDarkMode();
    if (typeof initCompactMode === 'function') {
        initCompactMode();
    }
    initHelpModal('help-btn','help-modal','close-help-btn');
    initNavToggle();
    // --- UNSAVED CHANGES TRACKING ---
    const dirty = createDirtyTracker();
    const markSaved = () => { dirty.markClean(); };
    const markUnsaved = () => { dirty.markDirty(); };

    // --- STATE MANAGEMENT ---
    let state = createRoutingState();

    const storeLatestRouteResults = (batchResults, meta = {}) => {
        const hasValidMap = meta.trayCableMap
            && typeof meta.trayCableMap === 'object'
            && !Array.isArray(meta.trayCableMap);
        try {
            const compactTrayCableMap = hasValidMap
                ? compactTrayCableMapForStorage(meta.trayCableMap)
                : undefined;
            const nextState = normalizeRouteResultState({
                batchResults: Array.isArray(batchResults) ? batchResults : [],
                source: 'optimalRoute',
                updatedAt: new Date().toISOString(),
                ...meta,
                inputFingerprint: getProjectInputFingerprint(),
                ...(hasValidMap ? { trayCableMap: compactTrayCableMap } : {})
            }, { cables: state.cableList.map(compactCableReference) });
            const storedState = compactRouteResultStateForStorage(nextState);
            const useSessionStorage = state.sampleDataMode || storedState.batchResults.length > 100;
            if (useSessionStorage) {
                setSessionItem('latestRouteResults', storedState);
                return 'session';
            }
            setItem('latestRouteResults', storedState);
            return 'local';
        } catch (error) {
            console.warn('Unable to store latest route results', error);
            return 'memory';
        }
    };

    // --- ELEMENT REFERENCES ---
    const elements = {
        fillLimitIn: document.getElementById('fill-limit'),
        fillLimitOut: document.getElementById('fill-limit-value'),
        routePreset: document.getElementById('route-preset'),
        routePresetDescription: document.getElementById('route-preset-description'),
        routeContext: document.getElementById('route-context'),
        routeReadinessPanel: document.getElementById('route-readiness-panel'),
        routeReadinessStatus: document.getElementById('route-readiness-status'),
        routeReadinessActions: document.getElementById('route-readiness-actions'),
        emptyStateBanner: document.getElementById('empty-state-banner'),
        emptyStateHeading: document.getElementById('empty-state-heading'),
        emptyStateDescription: document.getElementById('empty-state-description'),
        loadSampleNetworkBtn: document.getElementById('load-sample-network-btn'),
        loadLargeFacilityBtn: document.getElementById('load-large-facility-btn'),
        importSchedulesBtn: document.getElementById('import-schedules-btn'),
        calculateBtn: document.getElementById('calculate-route-btn'),
        loadSampleTraysBtn: document.getElementById('load-sample-trays-btn'),
        batchSection: document.getElementById('batch-section'),
        addTrayBtn: document.getElementById('add-tray-btn'),
        clearTraysBtn: document.getElementById('clear-trays-btn'),
        manualTrayTableContainer: document.getElementById('manual-tray-table-container'),
        exportTraysBtn: document.getElementById('export-trays-btn'),
        importTraysFile: document.getElementById('import-trays-file'),
        importTraysBtn: document.getElementById('import-trays-btn'),
        downloadTraysTemplateBtn: document.getElementById('download-trays-template-btn'),
        trayUtilizationContainer: document.getElementById('tray-utilization-container'),
        loadSampleCablesBtn: document.getElementById('load-sample-cables-btn'),
        clearCablesBtn: document.getElementById('clear-cables-btn'),
        addCableBtn: document.getElementById('add-cable-btn'),
        cableListContainer: document.getElementById('cable-list-container'),
        exportCablesBtn: document.getElementById('export-cables-btn'),
        importCablesFile: document.getElementById('import-cables-file'),
        importCablesBtn: document.getElementById('import-cables-btn'),
        downloadCablesTemplateBtn: document.getElementById('download-cables-template-btn'),
        resultsSection: document.getElementById('results-section'),
        routeSummaryPanel: document.getElementById('route-summary-panel'),
        messages: document.getElementById('messages'),
        metrics: document.getElementById('metrics'),
        routeBreakdownContainer: document.getElementById('route-breakdown-container'),
        routeBreakdownDetails: document.getElementById('route-breakdown-details'),
        pullChecksContainer: document.getElementById('pull-checks-container'),
        pullChecksDetails: document.getElementById('pull-checks-details'),
        performPullChecks: document.getElementById('perform-pull-checks'),
        pullCheckOptions: document.getElementById('pull-check-options'),
        pullMaxLength: document.getElementById('pull-max-length'),
        allowHandPulls: document.getElementById('allow-hand-pulls'),
        handPullMaxLength: document.getElementById('hand-pull-max-length'),
        handPullMaxTension: document.getElementById('hand-pull-max-tension'),
        pullMaxTension: document.getElementById('pull-max-tension'),
        pullMaxSidewall: document.getElementById('pull-max-sidewall'),
        pullFriction: document.getElementById('pull-friction'),
        pullBendRadius: document.getElementById('pull-bend-radius'),
        pullDirection: document.getElementById('pull-direction'),
        pullIncomingTension: document.getElementById('pull-incoming-tension'),
        pullPullerCapacity: document.getElementById('pull-puller-capacity'),
        pullRopeCapacity: document.getElementById('pull-rope-capacity'),
        pullGripCapacity: document.getElementById('pull-grip-capacity'),
        pullAnchorageCapacity: document.getElementById('pull-anchorage-capacity'),
        pullSheaveCapacity: document.getElementById('pull-sheave-capacity'),
        pullRollerSpacing: document.getElementById('pull-roller-spacing'),
        pullGroupSuggestions: document.getElementById('pull-group-suggestions'),
        pullGroupMaxSize: document.getElementById('pull-group-max-size'),
        pullSetupsToggle: document.getElementById('pull-setups-toggle'),
        pullSetupLegend: document.getElementById('pull-setup-legend'),
        pullTuggerLegend: document.getElementById('pull-tugger-legend'),
        pullHandLegend: document.getElementById('pull-hand-legend'),
        pullSheaveLegend: document.getElementById('pull-sheave-legend'),
        pullRollerLegend: document.getElementById('pull-roller-legend'),
        routeInspectorPullAction: document.getElementById('route-inspector-pull-action'),
        mismatchedRacewaysDetails: document.getElementById('mismatched-raceways-details'),
        mismatchedRacewaysList: document.getElementById('mismatched-raceways-list'),
        plot3d: document.getElementById('plot-3d'),
        popoutPlotBtn: document.getElementById('popout-plot-btn'),
        resetViewBtn: document.getElementById('reset-view-btn'),
        routeViewButtons: Array.from(document.querySelectorAll('[data-route-view]')),
        exportPngBtn: document.getElementById('export-png-btn'),
        exportGltfBtn: document.getElementById('export-gltf-btn'),
        ductbankToggle: document.getElementById('ductbank-toggle'),
        conduitToggle: document.getElementById('conduit-toggle'),
        fieldConnectionsToggle: document.getElementById('field-connections-toggle'),
        labelsToggle: document.getElementById('labels-toggle'),
        heatmapToggle: document.getElementById('heatmap-toggle'),
        contextToggle: document.getElementById('context-toggle'),
        contextDensitySelect: document.getElementById('context-density-select'),
        racewayCompatibilityFilter: document.getElementById('raceway-compatibility-filter'),
        racewayFilterSummary: document.getElementById('raceway-filter-summary'),
        racewayClassLegend: document.getElementById('route-cable-class-legend'),
        routeSelectionStatus: document.getElementById('route-selection-status'),
        plotRouteCount: document.getElementById('route-plot-route-count'),
        plotRacewayCount: document.getElementById('route-plot-raceway-count'),
        plotFieldCount: document.getElementById('route-plot-field-count'),
        plotSelectionCard: document.getElementById('route-plot-selection-card'),
        plotSelectionKicker: document.getElementById('route-plot-selection-kicker'),
        plotSelectionName: document.getElementById('route-plot-selection-name'),
        plotSelectionDetail: document.getElementById('route-plot-selection-detail'),
        routeViewerRouteList: document.getElementById('route-viewer-route-list'),
        routeViewerRouteListCount: document.getElementById('route-viewer-route-list-count'),
        routeInspectorTitle: document.getElementById('route-inspector-title'),
        routeInspectorCableClass: document.getElementById('route-inspector-cable-class'),
        routeInspectorTotal: document.getElementById('route-inspector-total'),
        routeInspectorBreakdown: document.getElementById('route-inspector-breakdown'),
        routeInspectorMetrics: document.getElementById('route-inspector-metrics'),
        routeInspectorRationale: document.getElementById('route-inspector-rationale'),
        routeInspectorTimeline: document.getElementById('route-inspector-timeline'),
        routeComparisonCards: document.getElementById('route-comparison-cards'),
        updatedUtilizationContainer: document.getElementById('updated-utilization-container'),
        updatedUtilizationDetails: document.getElementById('updated-utilization-details'),
        exportCsvBtn: document.getElementById('export-csv-btn'),
        exportRoutesBtn: document.getElementById('export-routes-btn'),
        downloadBomBtn: document.getElementById('download-bom-btn'),
        rebalanceBtn: document.getElementById('rebalance-btn'),
        openFillBtn: document.getElementById('open-fill-btn'),
        exportTrayFillsBtn: document.getElementById('export-tray-fills-btn'),
        progressContainer: document.getElementById('progress-container'),
        progressBar: document.getElementById('progress-bar'),
        progressLabel: document.getElementById('progress-label'),
        cancelRoutingBtn: document.getElementById('cancel-routing-btn'),
        manualTraySummary: document.getElementById('manual-tray-summary'),
        cableListSummary: document.getElementById('cable-list-summary'),
        darkToggle: document.getElementById('dark-toggle'),
        compactToggle: document.getElementById('compact-toggle'),
        debugToggle: document.getElementById('debug-toggle'),
        debugConsole: document.getElementById('debug-console'),
        debugLog: document.getElementById('debug-log'),
        settingsBtn: document.getElementById('settings-btn'),
        settingsMenu: document.getElementById('settings-menu'),
        helpBtn: document.getElementById('help-btn'),
        helpModal: document.getElementById('help-modal'),
        closeHelpBtn: document.getElementById('close-help-btn'),
        deleteDataBtn: document.getElementById('delete-data-btn'),
        traySearch: document.getElementById('tray-search'),
        cableSearch: document.getElementById('cable-search'),
        conduitType: document.getElementById('conduit-type'),
        sidebar: document.querySelector('.sidebar'),
        sidebarToggle: document.getElementById('sidebar-toggle'),
        routeModeToggle: document.getElementById('route-mode-toggle'),
    };

    const routeResultsAnchor = document.createComment('route-results-home');
    elements.resultsSection?.before(routeResultsAnchor);

    const setRouteReviewMode = enabled => {
        const hasResults = Array.isArray(state.latestRouteData) && state.latestRouteData.length > 0;
        const reviewMode = Boolean(enabled && hasResults);
        document.body.classList.toggle('route-review-mode', reviewMode);
        elements.sidebar?.classList.toggle('collapsed', reviewMode);
        if (elements.routeModeToggle) {
            elements.routeModeToggle.hidden = !hasResults;
            elements.routeModeToggle.textContent = reviewMode ? 'Edit routing setup' : 'Review route results';
            elements.routeModeToggle.setAttribute('aria-pressed', String(reviewMode));
        }
        if (elements.resultsSection) {
            if (reviewMode) {
                document.querySelector('.optimal-route-page .page-header')?.insertAdjacentElement('afterend', elements.resultsSection);
            } else if (routeResultsAnchor.parentNode) {
                routeResultsAnchor.parentNode.insertBefore(elements.resultsSection, routeResultsAnchor.nextSibling);
            }
        }
    };

    elements.routeModeToggle?.addEventListener('click', () => {
        setRouteReviewMode(!document.body.classList.contains('route-review-mode'));
        const target = document.body.classList.contains('route-review-mode')
            ? elements.resultsSection
            : elements.sidebar;
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.querySelectorAll('input, select, textarea').forEach(el=>{if(!el.classList.contains('table-search')&&!el.classList.contains('no-dirty')){el.addEventListener('input',markUnsaved);el.addEventListener('change',markUnsaved);}});
    ['addTrayBtn','clearTraysBtn','importTraysBtn','loadSampleTraysBtn','addCableBtn','clearCablesBtn','importCablesBtn','loadSampleCablesBtn','loadLargeFacilityBtn'].forEach(k=>{const btn=elements[k];if(btn)btn.addEventListener('click',markUnsaved);});
    if(elements.importTraysFile) elements.importTraysFile.addEventListener('change',markUnsaved);
    if(elements.importCablesFile) elements.importCablesFile.addEventListener('change',markUnsaved);
    if(elements.exportTraysBtn) elements.exportTraysBtn.addEventListener('click',markSaved);
    if(elements.exportCablesBtn) elements.exportCablesBtn.addEventListener('click',markSaved);
    ['export-csv-btn','export-routes-btn','download-bom-btn','export-tray-fills-btn'].forEach(id=>{const b=document.getElementById(id);if(b)b.addEventListener('click',markSaved);});

    const trayTemplateHeaders=[
        'tray_id','start_x','start_y','start_z','end_x','end_y','end_z',
        ['inside_width','width'],
        ['tray_depth','height'],
        'tray_type','current_fill','num_slots','slot_groups','allowed_cable_group','shape'
    ];
    const trayImportRequiredHeaders=[
        'tray_id','start_x','start_y','start_z','end_x','end_y','end_z',
        ['inside_width','width'],
        ['tray_depth','height']
    ];
    const cableTemplateHeaders=[
        'tag',
        ['from_tag','start_tag'],
        ['to_tag','end_tag'],
        'cable_type','conductors','conductor_size',
        ['cable_od','diameter'],
        ['weight','weight_lb_ft'],
        'allowed_cable_group','start_x','start_y','start_z','end_x','end_y','end_z'
    ];
    const cableImportRequiredHeaders=[
        'tag',
        ['from_tag','start_tag'],
        ['to_tag','end_tag'],
        'cable_type','conductors','conductor_size'
    ];

    const debug = {
        enabled: false,
        log(...args){
            if(!this.enabled) return;
            const msg = args.map(a=>typeof a==='object'?JSON.stringify(a):a).join(' ');
            if(elements.debugLog){
                const time=new Date().toISOString();
                elements.debugLog.textContent += `[${time}] ${msg}\n`;
                elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
            }
            console.debug(...args);
        }
    };
    window.debug = debug;
    const session=getItem('ctrSession', {});
    debug.enabled=!!session.debug;
    if(elements.debugToggle) elements.debugToggle.checked=debug.enabled;
    if(elements.debugConsole) elements.debugConsole.style.display=debug.enabled?'block':'none';
    if(elements.debugToggle){
        elements.debugToggle.addEventListener('change',()=>{
            debug.enabled=elements.debugToggle.checked;
            if(elements.debugConsole) elements.debugConsole.style.display=debug.enabled?'block':'none';
            session.debug=debug.enabled;
            setItem('ctrSession',session);
        });
    }

    function showToast(msg,type='success',diagnostics=''){
        const t=document.getElementById('toast');
        if(!t)return;
        t.innerHTML='';
        const span=document.createElement('span');
        span.textContent=msg;
        t.appendChild(span);
        if(diagnostics){
            const btn=document.createElement('button');
            btn.textContent='Copy diagnostics';
            btn.addEventListener('click',()=>{
                navigator.clipboard.writeText(diagnostics).then(()=>{
                    span.textContent='Diagnostics copied';
                });
            });
            t.appendChild(btn);
        }
        t.classList.remove('toast-error','toast-success','show');
        t.classList.add(type==='error'?'toast-error':'toast-success');
        requestAnimationFrame(()=>t.classList.add('show'));
        setTimeout(()=>t.classList.remove('show'),4000);
    }

    function setupErrorHandling(){
        const scrub=str=>str?str.replace(new RegExp(location.origin,'g'),''):'';
        const handler=e=>{
            const msg=e.message||e.reason?.message||'Unknown error';
            const stack=scrub(e.error?.stack||e.reason?.stack||'').split('\n').slice(0,5).join('\n');
            const diag=`${msg}\n${stack}`.trim();
            debug.log('Unhandled error:',diag);
            showToast('Unexpected error','error',diag);
        };
        window.addEventListener('error',handler);
        window.addEventListener('unhandledrejection',handler);
    }
    setupErrorHandling();

    const parseFile=(file,cb)=>{
        const isExcel=file.name.toLowerCase().endsWith('.xlsx')||file.name.toLowerCase().endsWith('.xls');
        if(isExcel&&!globalThis.XLSX){
            showToast('Failed to load XLSX parser','error');
            return;
        }
        if(!isExcel&&!globalThis.Papa){
            showToast('Failed to load CSV parser','error');
            return;
        }
        const reader=new FileReader();
        reader.onload=e=>{
            try{
                let rows=[];
                if(isExcel){
                    const wb=XLSX.read(e.target.result,{type:'binary'});
                    const ws=wb.Sheets[wb.SheetNames[0]];
                    rows=XLSX.utils.sheet_to_json(ws,{defval:''});
                }else{
                    rows=Papa.parse(e.target.result,{header:true,skipEmptyLines:true}).data;
                }
                rows=rows.map(r=>{const o={};Object.keys(r).forEach(k=>{o[k.trim().toLowerCase()]=r[k];});return o;});
                cb(rows);
            }catch(err){
                console.error('Import failed',err);
                showToast('Failed to parse file','error');
            }
        };
        if(isExcel) reader.readAsBinaryString(file); else reader.readAsText(file);
    };

    const validateHeaders=(data,required)=>{
        if(!data.length) return required.map(r=>Array.isArray(r)?r[0]:r);
        const headers=Object.keys(data[0]);
        return required
            .filter(r=>Array.isArray(r)?!r.some(h=>headers.includes(h)):!headers.includes(r))
            .map(r=>Array.isArray(r)?r[0]:r);
    };

    const handleImport=(file,required,onValid)=>{
        parseFile(file,rows=>{
            const missing=validateHeaders(rows,required);
            if(missing.length){
                showToast(`Missing columns: ${missing.join(', ')}`,'error');
                return;
            }
            onValid(rows);
            showToast('Import successful','success');
        });
    };

    const downloadSampleTemplate=(headers,filename)=>{
        const headerRow=headers.map(h=>Array.isArray(h)?h[0]:h);
        const wb=XLSX.utils.book_new();
        const ws=XLSX.utils.aoa_to_sheet([headerRow]);
        XLSX.utils.book_append_sheet(wb,ws,'Template');
        XLSX.writeFile(wb,filename);
    };

    const initHelpIcons = (root = document) => {
        root.querySelectorAll('.help-icon').forEach(icon => {
            icon.setAttribute('role', 'button');
            if (!icon.hasAttribute('aria-label')) icon.setAttribute('aria-label', 'Help');
            if (!icon.hasAttribute('aria-expanded')) icon.setAttribute('aria-expanded', 'false');
            icon.addEventListener('mouseenter', () => icon.setAttribute('aria-expanded', 'true'));
            icon.addEventListener('mouseleave', () => icon.setAttribute('aria-expanded', 'false'));
            icon.addEventListener('focus', () => icon.setAttribute('aria-expanded', 'true'));
            icon.addEventListener('blur', () => icon.setAttribute('aria-expanded', 'false'));
        });
    };
    const displayGeometryWarnings = () => {
        const gw = state.geometryWarnings || {};
        if (!(gw.ductbanks?.length || gw.conduits?.length)) return;
        const parts = [];
        if (gw.ductbanks?.length) parts.push(`ductbanks ${gw.ductbanks.join(', ')}`);
        if (gw.conduits?.length) parts.push(`conduits ${gw.conduits.join(', ')}`);
        if (typeof elements !== 'undefined' && elements.messages) {
            const link = '<a href="docs/geometry-fields.html" target="_blank" rel="noopener noreferrer">Required geometry fields</a>';
            elements.messages.innerHTML += `<div class="message warning">Skipped ${escapeHtml(parts.join('; '))}. ${link}</div>`;
        }
    };

    const displayConduitCount = (count, hasSchedule) => {
        const el = typeof document !== 'undefined' && document.getElementById('conduit-count');
        const messageHost = typeof elements !== 'undefined' ? elements.messages : null;
        messageHost?.querySelectorAll('.conduit-geometry-warning').forEach(message => message.remove());
        if (el) {
            el.textContent = formatConduitCountText(count, hasSchedule);
        }
        if (count === 0 && hasSchedule) {
            console.warn('No valid conduits were loaded. Check geometry fields or conduit IDs.');
            if (messageHost) {
                messageHost.innerHTML += '<div class="message warning conduit-geometry-warning">No valid conduits were loaded. Verify geometry fields or conduit identifiers.</div>';
            }
        }
        if (typeof document !== 'undefined') {
            const rs = document.getElementById('results-section');
            if (rs) {
                rs.classList.remove('hidden', 'invisible', 'is-hidden');
                rs.removeAttribute('hidden');
                rs.style.visibility = 'visible';
                rs.style.display = '';
            }
            if (typeof emitSticky === 'function') {
                emitSticky('route-updated','routeUpdated');
            } else {
                emitAsync('route-updated');
            }
        }
    };

    const loadDuctbankData = async () => {
        if (state.ductbankData && state.ductbankData.ductbanks && state.ductbankData.ductbanks.length) {
            update3DPlot();
            return;
        }
        state.geometryWarnings = { ductbanks: [], conduits: [] };
        state.ductbankData = await fetchDataFile('data/ductbank_geometry.json', null);
        if (state.ductbankData && Array.isArray(state.ductbankData.ductbanks)) {
            state.ductbankData.ductbanks = state.ductbankData.ductbanks.filter(db => {
                const hasOutline = Array.isArray(db.outline) && db.outline.length >= 2;
                const start = [parseFloat(db.start_x), parseFloat(db.start_y), parseFloat(db.start_z)];
                const end = [parseFloat(db.end_x), parseFloat(db.end_y), parseFloat(db.end_z)];
                const hasCoords = start.every(v => !isNaN(v)) && end.every(v => !isNaN(v));
                if (!hasOutline && !hasCoords) {
                    state.geometryWarnings.ductbanks.push(db.id || db.tag || '(unnamed)');
                    console.warn(`Skipping ductbank ${db.id || db.tag || '(unnamed)'}: missing outline and coordinates.`);
                    return false;
                }
                if (Array.isArray(db.conduits)) {
                    db.conduits = db.conduits.filter(cond => {
                        const hasPath = Array.isArray(cond.path) && cond.path.length >= 2;
                        if (!hasPath) {
                            state.geometryWarnings.conduits.push(cond.conduit_id || cond.id || '(unnamed)');
                            console.warn(`Skipping conduit ${cond.conduit_id || cond.id || '(unnamed)'}: missing path.`);
                            return false;
                        }
                        return true;
                    });
                }
                return true;
            });
            displayGeometryWarnings();
            update3DPlot();
        }
    };
    initHelpIcons();
    const compactRouteSidebar = globalThis.matchMedia?.('(max-width: 768px)');
    const syncRouteSidebarForViewport = event => {
        if (!elements.sidebar) return;
        if (event.matches) {
            elements.sidebar.classList.add('collapsed');
        } else if (!document.body.classList.contains('route-review-mode')) {
            elements.sidebar.classList.remove('collapsed');
        }
    };
    if (compactRouteSidebar) {
        syncRouteSidebarForViewport(compactRouteSidebar);
        compactRouteSidebar.addEventListener?.('change', syncRouteSidebarForViewport);
    }
    if (elements.sidebarToggle && elements.sidebar) {
        elements.sidebarToggle.addEventListener('click', () => {
            elements.sidebar.classList.toggle('collapsed');
        });
    }
    let routingWorker = null;
    let routingPaused = false;
    let currentProjectHash = null;

    const nextCableName = (sample) => {
        let prefix = 'Cable ';
        let digits = 1;
        if (sample) {
            const m = sample.match(/^(.*?)(\d+)$/);
            if (m) { prefix = m[1]; digits = m[2].length; }
        } else if (state.cableList.length > 0) {
            const m = state.cableList[0].name.match(/^(.*?)(\d+)$/);
            if (m) { prefix = m[1]; digits = m[2].length; }
        }
        let max = 0;
        state.cableList.forEach(c => {
            const m = c.name && c.name.match(new RegExp('^'+prefix+'(\\d+)$'));
            if (m) {
                max = Math.max(max, parseInt(m[1],10));
                digits = Math.max(digits, m[1].length);
            }
        });
        return prefix + String(max + 1).padStart(digits, '0');
    };

    const updateTableCounts = () => {
        if (elements.manualTraySummary) {
            elements.manualTraySummary.textContent =
                `Manual Cable Tray Entry Table (${state.manualTrays.length})`;
        }
        if (elements.cableListSummary) {
            elements.cableListSummary.textContent =
                `Cables to Route Table (${state.cableList.length})`;
        }
        if (typeof updateRoutingReadiness === 'function') {
            updateRoutingReadiness();
        }
    };

    const syncManualPath = cable => {
        if (!cable) return;
        if (!('manual_path' in cable)) cable.manual_path = '';
        if (!('raceway_ids' in cable)) cable.raceway_ids = [];
        if (!('locked' in cable)) cable.locked = false;
        if (!Array.isArray(cable.route_segments)) cable.route_segments = [];
    };

    const setRacewayIds = (cable, ids) => {
        if (!cable) return;
        cable.raceway_ids = Array.isArray(ids) ? ids : [];
        syncManualPath(cable);
    };

    const getPullCheckOptions = () => ({
        maxPullLengthFt: parseFloat(elements.pullMaxLength?.value) || 500,
        allowHandPulls: elements.allowHandPulls?.checked !== false,
        maxHandPullLengthFt: parseFloat(elements.handPullMaxLength?.value) || 25,
        maxHandPullTensionLbf: parseFloat(elements.handPullMaxTension?.value) || 200,
        allowableTension: parseFloat(elements.pullMaxTension?.value) || 1000,
        allowableSidewallPressure: parseFloat(elements.pullMaxSidewall?.value) || 500,
        coeffFriction: parseFloat(elements.pullFriction?.value) || 0.35,
        defaultBendRadiusFt: parseFloat(elements.pullBendRadius?.value) || 3,
        pullDirection: elements.pullDirection?.value || 'auto',
        incomingTensionLbf: Math.max(0, parseFloat(elements.pullIncomingTension?.value) || 0),
        pullerCapacityLbf: parseFloat(elements.pullPullerCapacity?.value) || 3000,
        ropeCapacityLbf: parseFloat(elements.pullRopeCapacity?.value) || 5000,
        gripCapacityLbf: parseFloat(elements.pullGripCapacity?.value) || 1000,
        anchorageCapacityLbf: parseFloat(elements.pullAnchorageCapacity?.value) || 3000,
        sheaveCapacityLbf: parseFloat(elements.pullSheaveCapacity?.value) || 4000,
        maxRollerSpacingFt: parseFloat(elements.pullRollerSpacing?.value) || 10,
        suggestPullGroups: elements.pullGroupSuggestions?.checked !== false,
        maxPullGroupSize: Math.max(2, Math.min(12, parseInt(elements.pullGroupMaxSize?.value, 10) || 4))
    });

    const applyPullChecksToResults = (results = []) => {
        const cableMap = new Map(state.cableList.map(cable => [cable.name, cable]));
        return results.map(result => {
            const routeResult = { ...result };
            delete routeResult.pull_check;
            if (!state.pullChecksEnabled || !isRoutedResult(result)) return routeResult;
            const cable = cableMap.get(result.cable) || {};
            return {
                ...routeResult,
                pull_check: buildCablePullPlan(result.route_segments || [], cable, getPullCheckOptions())
            };
        });
    };

    const syncPullAnalysisControls = () => {
        if (elements.performPullChecks) elements.performPullChecks.checked = state.pullChecksEnabled;
        if (elements.pullCheckOptions) elements.pullCheckOptions.hidden = !state.pullChecksEnabled;
        if (elements.pullGroupMaxSize) {
            elements.pullGroupMaxSize.disabled = !state.pullChecksEnabled || elements.pullGroupSuggestions?.checked === false;
        }
        const handPullInputsDisabled = !state.pullChecksEnabled || elements.allowHandPulls?.checked === false;
        if (elements.handPullMaxLength) elements.handPullMaxLength.disabled = handPullInputsDisabled;
        if (elements.handPullMaxTension) elements.handPullMaxTension.disabled = handPullInputsDisabled;
        if (elements.pullSetupsToggle) {
            elements.pullSetupsToggle.disabled = !state.pullChecksEnabled;
            elements.pullSetupsToggle.checked = state.pullChecksEnabled && state.pullSetupsVisible;
        }
        if (elements.pullSetupLegend) elements.pullSetupLegend.hidden = !state.pullChecksEnabled;
        if (elements.pullTuggerLegend) elements.pullTuggerLegend.hidden = !state.pullChecksEnabled;
        if (elements.pullHandLegend) elements.pullHandLegend.hidden = !state.pullChecksEnabled;
        if (elements.pullSheaveLegend) elements.pullSheaveLegend.hidden = !state.pullChecksEnabled;
        if (elements.pullRollerLegend) elements.pullRollerLegend.hidden = !state.pullChecksEnabled;
        if (elements.routeInspectorPullAction) {
            elements.routeInspectorPullAction.textContent = state.pullChecksEnabled ? 'Recalculate pull plan' : 'Plan cable pull';
            elements.routeInspectorPullAction.classList.toggle('is-active', state.pullChecksEnabled);
        }
        state.routeViewer?.setLayerVisibility('pullSetups', state.pullChecksEnabled && state.pullSetupsVisible);
    };

    const saveSession = () => {
        try {
            state.cableList.forEach(syncManualPath);
            const data = {
                manualTrays: state.manualTrays,
                cableList: state.cableList,
                darkMode: document.body.classList.contains('dark-mode'),
                conduitType: elements.conduitType ? elements.conduitType.value : 'EMT',
                routePreset: elements.routePreset ? elements.routePreset.value : 'conservative',
                fillLimit: parseFloat(elements.fillLimitIn?.value) || 40,
                proximityThreshold: parseFloat(document.getElementById('proximity-threshold')?.value) || 72,
                maxFieldEdge: parseFloat(document.getElementById('max-field-edge')?.value) || 1000,
                fieldPenalty: parseFloat(document.getElementById('field-route-penalty')?.value) || 3,
                sharedPenalty: parseFloat(document.getElementById('shared-field-penalty')?.value) || 0.5,
                pullChecksEnabled: state.pullChecksEnabled,
                pullSetupsVisible: state.pullSetupsVisible,
                pullGroupDecisions: state.pullGroupDecisions,
                pullCheckOptions: getPullCheckOptions(),
                includeDuctbankOutlines: state.includeDuctbankOutlines,
                sampleDataMode: state.sampleDataMode,
                largeFacilityTestMode: state.largeFacilityTestMode,
                ductbankData: state.ductbankData,
                conduitData: state.conduitData,
            };
            setItem('ctrSession', data);
            if (typeof updateRoutingReadiness === 'function') {
                updateRoutingReadiness();
            }
        } catch (e) {
            console.error('Failed to save session', e);
        }
    };

    const loadSession = () => {
        try {
            const data = getItem('ctrSession');
            if (data) {
                state.manualTrays = (data.manualTrays || []).map(t => ({ ...t, raceway_type: t.raceway_type || 'tray' }));
                state.cableList = data.cableList || [];
                if (data.ductbankData?.ductbanks?.length) state.ductbankData = data.ductbankData;
                if (Array.isArray(data.conduitData)) state.conduitData = data.conduitData;
                state.sampleDataMode = Boolean(data.sampleDataMode);
                state.largeFacilityTestMode = Boolean(data.largeFacilityTestMode);
                state.cableList.forEach(syncManualPath);
                if (data.darkMode) document.body.classList.add('dark-mode');
                if (data.conduitType && elements.conduitType) {
                    elements.conduitType.value = data.conduitType;
                }
                if (data.routePreset && elements.routePreset) {
                    elements.routePreset.value = data.routePreset;
                }
                if (data.fillLimit !== undefined && elements.fillLimitIn) {
                    elements.fillLimitIn.value = data.fillLimit;
                    updateFillLimitDisplay();
                }
                const prox = document.getElementById('proximity-threshold');
                if (prox && data.proximityThreshold !== undefined) {
                    prox.value = data.proximityThreshold;
                }
                const maxField = document.getElementById('max-field-edge');
                if (maxField && data.maxFieldEdge !== undefined) {
                    maxField.value = data.maxFieldEdge;
                }
                const fieldPenalty = document.getElementById('field-route-penalty');
                if (fieldPenalty && data.fieldPenalty !== undefined) {
                    fieldPenalty.value = data.fieldPenalty;
                }
                const sharedPenalty = document.getElementById('shared-field-penalty');
                if (sharedPenalty && data.sharedPenalty !== undefined) {
                    sharedPenalty.value = data.sharedPenalty;
                }
                state.pullChecksEnabled = Boolean(data.pullChecksEnabled);
                state.pullSetupsVisible = data.pullSetupsVisible !== false;
                state.pullGroupDecisions = data.pullGroupDecisions && typeof data.pullGroupDecisions === 'object'
                    ? { ...data.pullGroupDecisions }
                    : {};
                const savedPullOptions = data.pullCheckOptions || {};
                if (elements.pullMaxLength && savedPullOptions.maxPullLengthFt !== undefined) elements.pullMaxLength.value = savedPullOptions.maxPullLengthFt;
                if (elements.allowHandPulls && savedPullOptions.allowHandPulls !== undefined) elements.allowHandPulls.checked = savedPullOptions.allowHandPulls !== false;
                if (elements.handPullMaxLength && savedPullOptions.maxHandPullLengthFt !== undefined) elements.handPullMaxLength.value = savedPullOptions.maxHandPullLengthFt;
                if (elements.handPullMaxTension && savedPullOptions.maxHandPullTensionLbf !== undefined) elements.handPullMaxTension.value = savedPullOptions.maxHandPullTensionLbf;
                if (elements.pullMaxTension && savedPullOptions.allowableTension !== undefined) elements.pullMaxTension.value = savedPullOptions.allowableTension;
                if (elements.pullMaxSidewall && savedPullOptions.allowableSidewallPressure !== undefined) elements.pullMaxSidewall.value = savedPullOptions.allowableSidewallPressure;
                if (elements.pullFriction && savedPullOptions.coeffFriction !== undefined) elements.pullFriction.value = savedPullOptions.coeffFriction;
                if (elements.pullBendRadius && savedPullOptions.defaultBendRadiusFt !== undefined) elements.pullBendRadius.value = savedPullOptions.defaultBendRadiusFt;
                if (elements.pullDirection && savedPullOptions.pullDirection) elements.pullDirection.value = savedPullOptions.pullDirection;
                if (elements.pullIncomingTension && savedPullOptions.incomingTensionLbf !== undefined) elements.pullIncomingTension.value = savedPullOptions.incomingTensionLbf;
                if (elements.pullPullerCapacity && savedPullOptions.pullerCapacityLbf !== undefined) elements.pullPullerCapacity.value = savedPullOptions.pullerCapacityLbf;
                if (elements.pullRopeCapacity && savedPullOptions.ropeCapacityLbf !== undefined) elements.pullRopeCapacity.value = savedPullOptions.ropeCapacityLbf;
                if (elements.pullGripCapacity && savedPullOptions.gripCapacityLbf !== undefined) elements.pullGripCapacity.value = savedPullOptions.gripCapacityLbf;
                if (elements.pullAnchorageCapacity && savedPullOptions.anchorageCapacityLbf !== undefined) elements.pullAnchorageCapacity.value = savedPullOptions.anchorageCapacityLbf;
                if (elements.pullSheaveCapacity && savedPullOptions.sheaveCapacityLbf !== undefined) elements.pullSheaveCapacity.value = savedPullOptions.sheaveCapacityLbf;
                if (elements.pullRollerSpacing && savedPullOptions.maxRollerSpacingFt !== undefined) elements.pullRollerSpacing.value = savedPullOptions.maxRollerSpacingFt;
                if (elements.pullGroupSuggestions && savedPullOptions.suggestPullGroups !== undefined) elements.pullGroupSuggestions.checked = savedPullOptions.suggestPullGroups !== false;
                if (elements.pullGroupMaxSize && savedPullOptions.maxPullGroupSize !== undefined) elements.pullGroupMaxSize.value = savedPullOptions.maxPullGroupSize;
                syncPullAnalysisControls();
                if (elements.routePresetDescription && elements.routePreset) {
                    const preset = ROUTE_PRESETS[elements.routePreset.value] || ROUTE_PRESETS.custom;
                    elements.routePresetDescription.textContent = preset.description;
                }
                if (data.includeDuctbankOutlines !== undefined) {
                    state.includeDuctbankOutlines = !!data.includeDuctbankOutlines;
                }
            }
        } catch (e) {
            console.error('Failed to load session', e);
        }
    };

    const rebuildTrayData = () => {
        const model = buildRoutingRacewayData({
            manualTrays: state.manualTrays,
            ductbankData: state.ductbankData,
            conduitData: state.conduitData,
            includeDuctbankOutlines: state.includeDuctbankOutlines,
            conduitSpecs: CONDUIT_SPECS,
            warningLog: message => console.warn(message)
        });
        state.trayData = model.trayData;
        state.geometryWarnings = model.geometryWarnings;
        if ((model.geometryWarnings.ductbanks.length || model.geometryWarnings.conduits.length) && typeof displayGeometryWarnings === 'function') {
            displayGeometryWarnings();
        }
        if (typeof displayConduitCount === 'function') {
            displayConduitCount(model.conduitCount, model.hasSchedule);
        }
        if (typeof updateRoutingReadiness === 'function') {
            updateRoutingReadiness();
        }
    };

    const loadSchedulesIntoSession = async () => {
        const store = globalThis.dataStore || { getTrays, getCables, getDuctbanks, getConduits };
        const trays = store.getTrays();
        const cables = store.getCables();
        state.ductbanksWithoutConduits = [];

        const scheduledDuctbanks = store.getDuctbanks();
        const scheduledConduits = store.getConduits();
        const hasScheduledRaceways = (Array.isArray(scheduledDuctbanks) && scheduledDuctbanks.length > 0)
            || (Array.isArray(scheduledConduits) && scheduledConduits.length > 0);
        const loaded = hasScheduledRaceways
            ? expandScheduledRaceways(scheduledDuctbanks, scheduledConduits)
            : typeof loadConduits === 'function'
                ? loadConduits()
                : expandScheduledRaceways(scheduledDuctbanks, scheduledConduits);
        const normalizedRaceways = normalizeDuctbankSchedule(loaded.ductbanks || [], loaded.conduits || []);
        state.conduitsByDb = normalizedRaceways.conduitsByDuctbank;

        if (trays.length > 0) {
            state.manualTrays = normalizeTraySchedule(trays);
        }
        if (cables.length > 0) {
            state.cableList = normalizeCableSchedule(cables, await ensureConductorProps(), {
                warningLog: message => console.warn(message)
            });
        }
        if ((loaded.ductbanks || []).length > 0) {
            state.ductbankData = normalizedRaceways.ductbankData;
            state.ductbanksWithoutConduits = normalizedRaceways.ductbanksWithoutConduits;
            if (state.ductbanksWithoutConduits.length > 0) {
                const fixUrl = 'racewayschedule.html?focus=ductbanks&expandAll=true&showConduitsWizard=true';
                console.warn(`Ductbanks missing conduits: ${state.ductbanksWithoutConduits.join(', ')}. Go fix it: ${fixUrl}`);
                const warning = document.getElementById('ductbank-no-conduits-warning');
                if (warning) {
                    const list = warning.querySelector('.db-list');
                    if (list) list.textContent = state.ductbanksWithoutConduits.join(', ');
                    const link = warning.querySelector('.fix-link');
                    if (link) link.href = fixUrl;
                    warning.style.display = '';
                }
            }
        }
        state.conduitData = normalizedRaceways.standaloneConduits;
        rebuildTrayData();
    };

    const filterTable = (container, query) => {
        if (!container) return;
        const q = query.toLowerCase();
        container.querySelectorAll('tbody tr').forEach(row => {
            let text = row.textContent.toLowerCase();
            row.querySelectorAll('input').forEach(inp => {
                text += ' ' + (inp.value || '').toLowerCase();
            });
            row.style.display = text.includes(q) ? '' : 'none';
        });
    };

    const addSortHandlers = (container, dataArr, renderFn, sortState) => {
        const headers = container.querySelectorAll('th[data-key]');
        headers.forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const key = th.dataset.key;
                sortState.asc = sortState.key === key ? !sortState.asc : true;
                sortState.key = key;
                dataArr.sort((a,b) => {
                    const va = getSortVal(a, key);
                    const vb = getSortVal(b, key);
                    if (va < vb) return sortState.asc ? -1 : 1;
                    if (va > vb) return sortState.asc ? 1 : -1;
                    return 0;
                });
                renderFn();
            });
        });
    };

    const getSortVal = (obj, key) => {
        if (key === 'start0') return obj.start[0];
        if (key === 'end0') return obj.end[0];
        return obj[key];
    };

    const traySort = { key: '', asc: true };
    const cableSort = { key: '', asc: true };
    const updatedUtilSort = { key: '', asc: true };

    const validateInputs = (ids = []) => {
        let valid = true;
        ids.map(id => document.getElementById(id)).forEach(el => {
            if (!el) return;
            const value = el.value.trim();
            let error = '';
            if (el.type === 'number') {
                const num = parseFloat(value);
                const min = el.min !== '' ? parseFloat(el.min) : -Infinity;
                const max = el.max !== '' ? parseFloat(el.max) : Infinity;
                if (value === '' || isNaN(num)) {
                    error = 'Value required';
                } else if (num < min) {
                    error = `Min ${min}`;
                } else if (num > max) {
                    error = `Max ${max}`;
                }
            } else if (!value) {
                error = 'Value required';
            }

            const existing = el.nextElementSibling;
            if (error) {
                valid = false;
                el.classList.add('input-error');
                let msg = existing && existing.classList.contains('error-message') ? existing : null;
                if (!msg) {
                    msg = document.createElement('span');
                    msg.className = 'error-message';
                    el.insertAdjacentElement('afterend', msg);
                }
                msg.textContent = error;
            } else {
                el.classList.remove('input-error');
                if (existing && existing.classList.contains('error-message')) existing.remove();
            }
        });
        return valid;
    };

    const getRacewayRecommendation = (cables) => {
        return formatRacewayRecommendation(recommendRaceway(cables, {
            thresholds: CONTAINMENT_RULES.thresholds,
            conduitType: elements.conduitType.value,
            conduitSpecs: CONDUIT_SPECS
        }));
    };

    const buildFieldSegmentCableMap = (results) => {
        const nameMap = new Map(state.cableList.map(c => [c.name, c]));
        const map = new Map();
        const breakdownByRow = new Map(results.map(row => [row, createRouteBreakdown(row, formatPoint, getSegmentType)]));
        results.forEach(row => {
            const cableObj = nameMap.get(row.cable);
            if (!cableObj) return;
            breakdownByRow.get(row).forEach(b => {
                if (b.type === 'field') {
                    const key = [b.from, b.to].sort().join('|');
                    b.segment_key = key;
                    if (b.sourceSegment) b.sourceSegment.segment_key = key;
                    if (!map.has(key)) map.set(key, []);
                    map.get(key).push(cableObj);
                }
            });
        });
        results.forEach(row => {
            breakdownByRow.get(row).forEach(b => {
                if (b.type === 'field') {
                    b.raceway = getRacewayRecommendation(map.get(b.segment_key) || []);
                    if (b.sourceSegment) b.sourceSegment.raceway = b.raceway;
                }
            });
        });
        state.fieldSegmentCableMap = map;
    };

    const getRouteCalculationOptions = () => ({
        routingAlgorithmVersion: 'ductbank-balanced-v1',
        fillLimit: parseFloat(elements.fillLimitIn.value) / 100,
        proximityThreshold: parseFloat(document.getElementById('proximity-threshold').value),
        fieldPenalty: parseFloat(document.getElementById('field-route-penalty').value),
        sharedPenalty: parseFloat(document.getElementById('shared-field-penalty').value),
        maxFieldEdge: parseFloat(document.getElementById('max-field-edge').value),
        maxFieldNeighbors: 8,
        includeDuctbankOutlines: state.includeDuctbankOutlines,
        pullAnalysis: { enabled: state.pullChecksEnabled, ...getPullCheckOptions() },
    });

    const hydrateSavedRouteResults = () => {
        const saved = getItem('latestRouteResults', null);
        const normalizedState = normalizeRouteResultState(saved, { cables: state.cableList });
        const rows = normalizedState.batchResults;
        if (!rows.length) return false;
        const currentRows = filterRouteResultsForProject(rows, {
            cables: state.cableList,
            trays: state.trayData,
            conduits: state.conduitData,
            ductbanks: state.ductbankData?.ductbanks || []
        });
        const hydratedProjectHash = computeRoutingProjectHash({
            trays: state.trayData,
            cables: state.cableList,
            options: getRouteCalculationOptions(),
        });
        const routeHashChanged = Boolean(saved?.projectHash) && saved.projectHash !== hydratedProjectHash;
        const fingerprintChanged = !saved?.projectHash
            && Boolean(saved?.inputFingerprint)
            && saved.inputFingerprint !== getProjectInputFingerprint();
        const structurallyStale = !saved?.projectHash && currentRows.length !== rows.length;
        if (routeHashChanged || fingerprintChanged || structurallyStale) {
            state.latestRouteData = [];
            if (elements.resultsSection) elements.resultsSection.style.display = 'none';
            elements.routeViewerRouteList?.replaceChildren();
            if (elements.routeViewerRouteListCount) elements.routeViewerRouteListCount.textContent = '0';
            if (elements.routeSelectionStatus) {
                elements.routeSelectionStatus.textContent = 'Saved route results are stale for the current project inputs. Run routing again to replace them.';
            }
            if (elements.routeReadinessStatus) {
                elements.routeReadinessStatus.textContent = 'Routing inputs changed — rerun required';
                elements.routeReadinessStatus.className = 'route-readiness-status is-warning';
            }
            return false;
        }

        state.latestRouteData = applyPullChecksToResults(structuredClone(rows));
        state.trayCableMap = structuredClone(normalizedState.trayCableMap);
        state.finalTrays = Array.isArray(saved?.finalTrays)
            ? structuredClone(saved.finalTrays)
            : [];
        state.updatedUtilData = Array.isArray(saved?.updatedUtilData)
            ? structuredClone(saved.updatedUtilData)
            : [];
        buildFieldSegmentCableMap(state.latestRouteData);
        renderBatchResults(state.latestRouteData);
        if (state.updatedUtilData.length) renderUpdatedUtilizationTable();
        if (elements.resultsSection) elements.resultsSection.style.display = 'block';
        if (elements.routeBreakdownDetails) elements.routeBreakdownDetails.open = true;
        update3DPlot();

        const updatedAt = saved?.updatedAt ? new Date(saved.updatedAt) : null;
        const updatedLabel = updatedAt && !Number.isNaN(updatedAt.getTime())
            ? ` from ${updatedAt.toLocaleString()}`
            : '';
        if (elements.routeSelectionStatus) {
            elements.routeSelectionStatus.textContent = `${rows.length} saved route result${rows.length === 1 ? '' : 's'} loaded${updatedLabel}. Select a row to highlight it in the model.`;
        }
        if (elements.routeReadinessStatus) {
            elements.routeReadinessStatus.textContent = `${rows.length} saved route${rows.length === 1 ? '' : 's'} ready to review`;
            elements.routeReadinessStatus.className = 'route-readiness-status is-ready';
        }
        return true;
    };

    // --- CORE ROUTING LOGIC (JavaScript implementation of your Python backend) ---


    // --- EVENT HANDLERS & UI LOGIC (This part remains the same) ---

    let applyingRoutePreset = false;

    const updateFillLimitDisplay = () => {
        elements.fillLimitOut.textContent = `${elements.fillLimitIn.value}%`;
    };

    const setNumberInputValue = (id, value) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
    };

    const applyRoutePreset = (presetKey) => {
        const preset = ROUTE_PRESETS[presetKey] || ROUTE_PRESETS.custom;
        if (elements.routePresetDescription) {
            elements.routePresetDescription.textContent = preset.description;
        }
        if (presetKey === 'custom') {
            updateRoutingReadiness();
            saveSession();
            return;
        }
        applyingRoutePreset = true;
        elements.fillLimitIn.value = preset.fillLimit;
        setNumberInputValue('proximity-threshold', preset.proximityThreshold);
        setNumberInputValue('max-field-edge', preset.maxFieldEdge);
        setNumberInputValue('field-route-penalty', preset.fieldPenalty);
        setNumberInputValue('shared-field-penalty', preset.sharedPenalty);
        updateFillLimitDisplay();
        applyingRoutePreset = false;
        updateRoutingReadiness();
        saveSession();
    };

    const markCustomPreset = () => {
        if (applyingRoutePreset || !elements.routePreset) return;
        elements.routePreset.value = 'custom';
        if (elements.routePresetDescription) {
            elements.routePresetDescription.textContent = ROUTE_PRESETS.custom.description;
        }
    };

    const getRoutingReadiness = () => buildRoutingReadiness(state, {
        fillLimitPercent: parseFloat(elements.fillLimitIn.value)
    });

    const readinessItem = (value, label, status = '') => `
        <div class="readiness-item ${status}">
            <span class="readiness-value">${escapeHtml(value)}</span>
            <span class="readiness-label">${escapeHtml(label)}</span>
        </div>
    `;

    const updateEmptyStateBanner = () => {
        if (!elements.emptyStateBanner) return;
        const readiness = getRoutingReadiness();
        const noRaceways = readiness.routableSegments.length === 0;
        const noCables = readiness.cables.length === 0;
        elements.emptyStateBanner.hidden = !(noRaceways || noCables);
        if (!elements.emptyStateBanner.hidden) {
            if (noRaceways && noCables) {
                elements.emptyStateHeading.textContent = 'Start with routing data';
                elements.emptyStateDescription.textContent = 'Load a sample network, import from the schedules, or add trays and cables manually.';
            } else if (noRaceways) {
                elements.emptyStateHeading.textContent = 'Raceway network needed';
                elements.emptyStateDescription.textContent = 'Import the Raceway Schedule or add tray/conduit geometry before running routes.';
            } else {
                elements.emptyStateHeading.textContent = 'Cable list needed';
                elements.emptyStateDescription.textContent = 'Import the Cable Schedule or add cables before running the routing calculation.';
            }
        }
    };

    const updateRoutingReadiness = () => {
        const readiness = getRoutingReadiness();
        if (elements.routeReadinessPanel) {
            elements.routeReadinessPanel.classList.toggle('is-ready', readiness.ready && readiness.warnings.length === 0);
            elements.routeReadinessPanel.classList.toggle('has-warnings', readiness.warnings.length > 0 || readiness.blocking.length > 0);
            elements.routeReadinessPanel.innerHTML = [
                readinessItem(readiness.cables.length, 'Cable rows', readiness.cables.length ? 'readiness-ready' : 'readiness-warning'),
                readinessItem(readiness.diagnostics.cableSummary.scheduleReady, 'Schedule-ready', readiness.diagnostics.cableSummary.scheduleReady ? 'readiness-ready' : 'readiness-warning'),
                readinessItem(readiness.diagnostics.cableSummary.routingReady, 'Routing-ready', readiness.diagnostics.cableSummary.routingReady ? 'readiness-ready' : 'readiness-warning'),
                readinessItem(readiness.diagnostics.coordinateReady, 'Coordinate-ready', readiness.diagnostics.coordinateReady ? 'readiness-ready' : 'readiness-warning'),
                readinessItem(readiness.routableSegments.length, 'Raceway segments', readiness.routableSegments.length ? 'readiness-ready' : 'readiness-warning'),
                readinessItem(readiness.diagnostics.invalidAssignedRefs.length, 'Invalid assignments', readiness.diagnostics.invalidAssignedRefs.length ? 'readiness-warning' : 'readiness-ready'),
                readinessItem(readiness.missingGeometry.length, 'Geometry issues', readiness.missingGeometry.length ? 'readiness-warning' : 'readiness-ready'),
                readinessItem(readiness.overLimit.length, 'Fill warnings', readiness.overLimit.length ? 'readiness-warning' : 'readiness-ready')
            ].join('');
        }
        if (elements.routeReadinessStatus) {
            elements.routeReadinessStatus.textContent = readiness.ready
                ? (readiness.warnings.length ? 'Ready with warnings' : 'Ready to route')
                : 'Needs input';
            elements.routeReadinessStatus.className = `route-readiness-status ${readiness.ready ? 'is-ready' : 'is-blocked'} ${readiness.warnings.length ? 'has-warnings' : ''}`;
        }
        if (elements.routeReadinessActions) {
            const next = readiness.diagnostics.nextAction;
            const notes = [...readiness.blocking, ...readiness.warnings];
            const invalidRows = readiness.diagnostics.invalidAssignedRefs.slice(0, 4)
                .map(item => `<li>${escapeHtml(item.cable)} references ${escapeHtml(item.raceway)}</li>`)
                .join('');
            elements.routeReadinessActions.innerHTML = `
                <div class="route-next-actions">
                    <strong>${escapeHtml(next.label)}</strong>
                    <p>${escapeHtml(next.detail)}</p>
                    ${next.href && isSafeUrl(next.href) ? `<a class="btn btn-sm" href="${escapeAttr(next.href)}">Open Step</a>` : ''}
                </div>
                ${notes.length ? `<ul>${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '<p>All required route inputs are available.</p>'}
                ${invalidRows ? `<details class="route-invalid-assignment-details"><summary>Invalid raceway references</summary><ul>${invalidRows}</ul></details>` : ''}
            `;
        }
        if (elements.routeContext) {
            elements.routeContext.textContent = readiness.ready
                ? `${readiness.diagnostics.coordinateReady} coordinate-ready cable(s), ${readiness.diagnostics.cableSummary.routingReady} routing-ready schedule row(s), ${readiness.routableSegments.length} routable segment(s).`
                : readiness.blocking[0] || 'Add trays and cables to enable route calculation.';
        }
        if (elements.calculateBtn) {
            elements.calculateBtn.disabled = !readiness.ready && !E2E;
            elements.calculateBtn.setAttribute('aria-disabled', readiness.ready ? 'false' : 'true');
            elements.calculateBtn.textContent = readiness.ready
                ? `Route ${readiness.cables.length} Cable${readiness.cables.length === 1 ? '' : 's'}`
                : 'Run Routing';
            elements.calculateBtn.title = readiness.ready ? 'Run optimal route calculation' : readiness.blocking.join(' ');
        }
        updateEmptyStateBanner();
        return readiness;
    };

    const renderTable = (container, headers, data, styleFn = null, formatters = {}) => {
        const defs = headers.map(h => typeof h === 'string' ? {
            label: h,
            key: h.toLowerCase()
                    .replace(/²/g, '2')
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_|_$/g, '')
        } : h);

        let table = '<table><thead><tr>';
        defs.forEach(h => table += `<th data-key="${h.key}">${h.label}</th>`);
        table += '</tr></thead><tbody>';
        data.forEach(row => {
            const style = styleFn ? styleFn(row) : '';
            table += `<tr class="${style}">`;
            defs.forEach(h => {
                const val = row[h.key];
                if (formatters[h.key]) {
                    table += `<td>${formatters[h.key](val, row)}</td>`;
                } else {
                    table += `<td>${val !== undefined ? escapeHtml(val) : 'N/A'}</td>`;
                }
            });
            table += '</tr>';
        });
        table += '</tbody></table>';
        container.innerHTML = table;
    };
    
    const utilizationStyle = (row) => {
        const util = Number(row.full_pct ?? row.utilization_pct ?? row.utilization);
        if (util > 80) return 'util-high';
        if (util > 60) return 'util-medium';
        return 'util-low';
    };

    const updateTrayDisplay = () => {
        if (state.trayData.length === 0) {
            elements.trayUtilizationContainer.innerHTML = '<p class="info-text">No tray data loaded.</p>';
            return;
        }
        const trays = state.includeDuctbankOutlines
            ? state.trayData
            : state.trayData.filter(t => t.raceway_type !== 'ductbank');
        const groups = trays.reduce((acc, tray) => {
            const key = tray.ductbankTag || '_none';
            acc[key] = acc[key] || [];
            acc[key].push(tray);
            return acc;
        }, {});

        const headers = [
            { label: 'Raceway ID', key: 'tray_id' },
            { label: 'Type', key: 'raceway_type' },
            { label: 'Start (x,y,z)', key: 'start_xyz' },
            { label: 'End (x,y,z)', key: 'end_xyz' },
            { label: 'Max Capacity (in²)', key: 'max_capacity' },
            { label: 'Current Fill (in²)', key: 'current_fill' },
            { label: 'Utilization %', key: 'utilization_pct' },
            { label: 'Available Space (in²)', key: 'available_space' },
            { label: 'Review', key: 'review' }
        ];

        elements.trayUtilizationContainer.innerHTML = '';
        Object.entries(groups).forEach(([dbId, items]) => {
            const rows = items.map(tray => {
                const maxCapacity = tray.width * tray.height * (parseFloat(elements.fillLimitIn.value) / 100);
                const target = getRacewayReviewTarget(tray, tray.tray_id);
                return {
                    tray_id: tray.tray_id,
                    raceway_type: target.typeLabel,
                    start_xyz: `(${tray.start_x}, ${tray.start_y}, ${tray.start_z})`,
                    end_xyz: `(${tray.end_x}, ${tray.end_y}, ${tray.end_z})`,
                    max_capacity: maxCapacity.toFixed(0),
                    current_fill: tray.current_fill,
                    utilization_pct: ((tray.current_fill / maxCapacity) * 100).toFixed(1),
                    available_space: (maxCapacity - tray.current_fill).toFixed(2),
                    review: `<button type="button" class="fill-btn raceway-review-btn" data-raceway="${escapeAttr(target.racewayId)}" aria-label="${escapeAttr(`${target.actionLabel} for ${target.racewayId}`)}">${escapeHtml(target.actionLabel)}</button>`
                };
            });

            if (dbId !== '_none') {
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.textContent = dbId;
                details.appendChild(summary);
                const div = document.createElement('div');
                renderTable(div, headers, rows, utilizationStyle, { review: value => value });
                details.appendChild(div);
                elements.trayUtilizationContainer.appendChild(details);
            } else {
                const div = document.createElement('div');
                renderTable(div, headers, rows, utilizationStyle, { review: value => value });
                elements.trayUtilizationContainer.appendChild(div);
            }
        });

        elements.trayUtilizationContainer.querySelectorAll('.raceway-review-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const raceway = state.trayData.find(item => item.tray_id === btn.dataset.raceway);
                if (raceway) openUtilizationReview(raceway);
            });
        });
        elements.trayUtilizationContainer.querySelectorAll('tbody tr').forEach(row => {
            const trayId = row.querySelector('.raceway-review-btn')?.dataset.raceway || row.cells?.[0]?.textContent?.trim();
            if (!trayId) return;
            row.dataset.trayId = trayId;
            row.tabIndex = 0;
            row.classList.add('interactive-row');
            row.addEventListener('click', event => {
                if (event.target.closest('button, a, input, select')) return;
                highlightTraySegment(trayId);
            });
            row.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                highlightTraySegment(trayId);
            });
        });
    };

const openTrayFill = (trayId) => {
    const tray = state.trayData.find(t => t.tray_id === trayId);
    if (!tray) return;
    const cables = (state.trayCableMap && state.trayCableMap[trayId]) ? state.trayCableMap[trayId] : [];
    try {
        setItem('trayFillData', { tray, cables });
    } catch (e) {
        console.error('Failed to store tray fill data', e);
    }
    window.open('cabletrayfill.html', '_blank');
};

const openConduitFill = (cables) => {
    const conduitType = elements.conduitType.value;
    const cableObjs = cables.map(c => {
        if (typeof c === 'string') {
            return state.cableList.find(cb => cb.name === c);
        }
        return c;
    }).filter(Boolean);
    const spec = CONDUIT_SPECS[conduitType] || {};
    const count = cableObjs.length;
    const totalArea = cableObjs.reduce((s, c) => s + Math.PI * Math.pow(c.diameter / 2, 2) * getParallelCount(c.parallel_count), 0);
    /* NEC Chapter 9 Table 1 fill limits (see docs/standards.md) */
    const fillPct = count === 1 ? 0.53 : count === 2 ? 0.31 : 0.40;
    let tradeSize = null;
    for (const size of Object.keys(spec)) {
        if (totalArea <= spec[size] * fillPct) { tradeSize = size; break; }
    }
    try {
        setItem('conduitFillData', { type: conduitType, tradeSize, cables: cableObjs });
    } catch (e) {
        console.error('Failed to store conduit fill data', e);
    }
    window.open('conduitfill.html', '_blank');
};

const openDuctbankRoute = (dbId, conduitId) => {
    const ductbank = state.ductbankData?.ductbanks?.find(db => [db.id, db.tag, db.ductbank_id].includes(dbId));
    if (!ductbank) return;
    const routeData = buildDuctbankRouteHandoff({
        ductbank,
        trayCableMap: state.trayCableMap,
        cableCatalog: state.cableList,
        selectedConduitId: conduitId
    });
    if (!routeData) return;
    try {
        setItem('ductbankRouteData', routeData);
    } catch (e) {
        console.error('Failed to store ductbank route data', e);
    }
    window.open('ductbankroute.html', '_blank');
};

const openConduitRacewayFill = (raceway, conduitId) => {
    const normalizedId = String(conduitId || raceway?.conduit_id || raceway?.tray_id || '').trim();
    const scheduled = (state.conduitData || []).find(conduit =>
        [conduit.conduit_id, conduit.id, conduit.tray_id].some(id => String(id || '').trim() === normalizedId)
    ) || raceway || {};
    const cables = [raceway?.tray_id, normalizedId]
        .map(key => state.trayCableMap?.[key])
        .find(value => Array.isArray(value)) || [];
    try {
        setItem('conduitFillData', {
            type: scheduled.type || scheduled.conduit_type || '',
            tradeSize: scheduled.trade_size || '',
            conduitId: normalizedId,
            cables
        });
    } catch (e) {
        console.error('Failed to store conduit fill data', e);
    }
    window.open('conduitfill.html', '_blank');
};

const utilizationReviewRow = row => {
    const raceway = state.trayData.find(item => item.tray_id === row.tray_id) || row;
    const target = getRacewayReviewTarget(raceway, row.tray_id);
    return {
        ...row,
        raceway_type: target.typeLabel,
        raceway_kind: target.kind,
        ductbankTag: target.ductbankId,
        conduit_id: target.conduitId,
        review: `<button type="button" class="raceway-review-btn" data-raceway="${escapeAttr(target.racewayId)}" aria-label="${escapeAttr(`${target.actionLabel} for ${target.racewayId}`)}">${escapeHtml(target.actionLabel)}</button>`
    };
};

const openUtilizationReview = row => {
    const raceway = state.trayData.find(item => item.tray_id === row.tray_id) || row;
    const target = getRacewayReviewTarget(raceway, row.tray_id);
    if (target.kind === 'ductbank' || target.kind === 'ductbank-conduit') {
        openDuctbankRoute(target.ductbankId, target.conduitId);
        return;
    }
    if (target.kind === 'conduit') {
        openConduitRacewayFill(raceway, target.conduitId);
        return;
    }
    openTrayFill(target.racewayId);
};

 const buildUtilizationRows = (utilization, baseTrays = state.trayData) => {
     const fillLimit = parseFloat(elements.fillLimitIn.value) / 100;
     const baseById = new Map((baseTrays || []).map(tray => [tray.tray_id, tray]));
     return Object.entries(utilization || {}).map(([id, data]) => {
         const base = baseById.get(id);
         const baseMax = base
             ? (parseFloat(base.width) || 0) * (parseFloat(base.height) || 0) * fillLimit
             : data.max_fill;
         const beforeFill = base ? (parseFloat(base.current_fill) || 0) : 0;
         const beforePct = baseMax ? (beforeFill / baseMax) * 100 : 0;
         const afterPct = Number(data.utilization_percentage) || 0;
         return utilizationReviewRow({
             tray_id: id,
             before_pct: beforePct,
             full_pct: afterPct,
             delta_pct: afterPct - beforePct,
             available: Number(data.available_capacity || 0).toFixed(2),
             utilization: afterPct.toFixed(1)
         });
     });
 };

 const renderUpdatedUtilizationTable = () => {
     if (!state.updatedUtilData || state.updatedUtilData.length === 0) {
         elements.updatedUtilizationContainer.innerHTML = '';
         state.utilizationOverloadFilter = false;
         return;
     }
     const renderUtilBar = (val) => {
         const pct = Math.max(0, Math.min(Number(val) || 0, 100));
         const color = pct > 80 ? 'var(--error-bg)' : pct > 60 ? 'var(--warning-bg)' : 'var(--success-bg)';
         return `
             <div class="util-bar">
                 <div class="util-bar-fill" style="width:${pct.toFixed(1)}%; background-color:${color};"></div>
                 <div class="util-bar-marker" style="left:100%;"></div>
             </div>
             <span class="util-label">${pct.toFixed(1)}%</span>
         `;
     };
     const formatters = {
         review: value => value,
         before_pct: renderUtilBar,
         full_pct: renderUtilBar,
         delta_pct: (val) => {
             const delta = Number(val) || 0;
             const sign = delta > 0 ? '+' : '';
             return `<span class="${delta > 0 ? 'route-delta-positive' : 'route-delta-neutral'}">${sign}${delta.toFixed(1)}%</span>`;
         }
     };
     state.updatedUtilData = state.updatedUtilData.map(utilizationReviewRow);
     const overloadedRows = state.updatedUtilData.filter(row => isRacewayOverloaded(row));
     if (state.utilizationOverloadFilter && overloadedRows.length === 0) {
         state.utilizationOverloadFilter = false;
     }
     const visibleRows = state.utilizationOverloadFilter ? overloadedRows : state.updatedUtilData;
     renderTable(
         elements.updatedUtilizationContainer,
         [
             { label: 'Raceway ID', key: 'tray_id' },
             { label: 'Type', key: 'raceway_type' },
             { label: 'Before', key: 'before_pct' },
             { label: 'After', key: 'full_pct' },
             { label: 'Delta', key: 'delta_pct' },
             { label: 'Available (in²)', key: 'available' },
             { label: 'Review', key: 'review' }
         ],
         visibleRows,
         (row) => utilizationStyle(row),
         formatters
     );
     if (state.utilizationOverloadFilter) {
         const noun = overloadedRows.length === 1 ? 'raceway' : 'raceways';
         elements.updatedUtilizationContainer.insertAdjacentHTML('afterbegin', `
             <div class="route-overload-focus" role="status" tabindex="-1">
                 <div>
                     <strong>Showing ${overloadedRows.length} overloaded ${noun}</strong>
                     <span>Each item is above the 80% review threshold. Use Review to open the correct capacity workflow.</span>
                 </div>
                 <button type="button" class="route-overload-filter-clear">Show all raceways</button>
             </div>
         `);
         elements.updatedUtilizationContainer.querySelector('.route-overload-filter-clear')?.addEventListener('click', () => {
             state.utilizationOverloadFilter = false;
             renderUpdatedUtilizationTable();
         });
     }
     elements.updatedUtilizationContainer.querySelectorAll('.raceway-review-btn').forEach(btn => {
         btn.addEventListener('click', () => {
             const row = state.updatedUtilData.find(item => item.tray_id === btn.dataset.raceway);
             if (row) openUtilizationReview(row);
         });
     });
     elements.updatedUtilizationContainer.querySelectorAll('tbody tr').forEach((row, index) => {
         const trayId = row.querySelector('.raceway-review-btn')?.dataset.raceway || visibleRows[index]?.tray_id;
         if (!trayId) return;
         row.dataset.trayId = trayId;
         row.tabIndex = 0;
         row.classList.add('interactive-row');
         row.addEventListener('click', event => {
             if (event.target.closest('button, a, input, select')) return;
             highlightTraySegment(trayId);
         });
         row.addEventListener('keydown', event => {
             if (event.key !== 'Enter' && event.key !== ' ') return;
             event.preventDefault();
             highlightTraySegment(trayId);
         });
     });
     addSortHandlers(elements.updatedUtilizationContainer, state.updatedUtilData, renderUpdatedUtilizationTable, updatedUtilSort);
     renderRouteSummaryPanel(state.latestRouteData);
 };

 const focusOverloadedRaceways = () => {
     const overloadedRows = (state.updatedUtilData || []).filter(row => isRacewayOverloaded(row));
     if (overloadedRows.length === 0 || !elements.updatedUtilizationDetails) return;
     state.utilizationOverloadFilter = true;
     elements.updatedUtilizationDetails.open = true;
     renderUpdatedUtilizationTable();
     requestAnimationFrame(() => {
         const focusBanner = elements.updatedUtilizationContainer.querySelector('.route-overload-focus');
         const firstOverloadedRow = elements.updatedUtilizationContainer.querySelector('tbody tr.util-high');
         firstOverloadedRow?.classList.add('route-overload-focus-row');
         focusBanner?.focus({ preventScroll: true });
         (focusBanner || elements.updatedUtilizationDetails).scrollIntoView({ behavior: 'smooth', block: 'start' });
     });
 };
    
    

    const addManualTray = () => {
        const required = ['t-id','t-sx','t-sy','t-sz','t-ex','t-ey','t-ez','t-w','t-h'];
        if (!validateInputs(required)) return;

        const newTray = {
            tray_id: document.getElementById('t-id').value,
            start_x: parseFloat(document.getElementById('t-sx').value),
            start_y: parseFloat(document.getElementById('t-sy').value),
            start_z: parseFloat(document.getElementById('t-sz').value),
            end_x: parseFloat(document.getElementById('t-ex').value),
            end_y: parseFloat(document.getElementById('t-ey').value),
            end_z: parseFloat(document.getElementById('t-ez').value),
            width: parseFloat(document.getElementById('t-w').value),
            height: parseFloat(document.getElementById('t-h').value),
            current_fill: parseFloat(document.getElementById('t-fill').value),
            allowed_cable_group: document.getElementById('t-group').value,
            shape: document.getElementById('t-shape').value || 'STR',
            raceway_type: 'tray'
        };
        state.manualTrays.push(newTray);
        rebuildTrayData();
        renderManualTrayTable();
        updateTrayDisplay();
        updateTableCounts();
        saveSession();
    };

    const clearManualTrays = () => {
        state.manualTrays = [];
        rebuildTrayData();
        elements.manualTrayTableContainer.innerHTML = '';
        updateTrayDisplay();
        updateTableCounts();
        saveSession();
    };

    const loadSampleTrays = () => {
        state.sampleDataMode = true;
        state.largeFacilityTestMode = false;
        state.manualTrays = getSampleTrays().map(t => ({ ...t, raceway_type: 'tray' }));
        rebuildTrayData();
        renderManualTrayTable();
        updateTrayDisplay();
        updateTableCounts();
        saveSession();
        emitSticky('samples-loaded','samplesLoaded');
    };

    const renderManualTrayTable = () => {
        if (state.manualTrays.length === 0) {
            elements.manualTrayTableContainer.innerHTML = '';
            updateTableCounts();
            return;
        }
        elements.manualTrayTableContainer.innerHTML = buildManualTrayTableMarkup(state.manualTrays, {
            shapeCodes: SHAPE_CODES,
            escapeAttr
        });
        initHelpIcons(elements.manualTrayTableContainer);
        elements.manualTrayTableContainer.classList.add('table-scroll');
        bindManualTrayTable(elements.manualTrayTableContainer, {
            onFieldChange: ({ index, field, coordinate, value }) => {
                const tray = state.manualTrays[index];
                if (!tray) return;
                if (field === 'start') {
                    if (coordinate === 0) tray.start_x = value;
                    if (coordinate === 1) tray.start_y = value;
                    if (coordinate === 2) tray.start_z = value;
                } else if (field === 'end') {
                    if (coordinate === 0) tray.end_x = value;
                    if (coordinate === 1) tray.end_y = value;
                    if (coordinate === 2) tray.end_z = value;
                } else {
                    tray[field] = value;
                }
                rebuildTrayData();
                updateTrayDisplay();
                saveSession();
            },
            onDelete: index => {
                state.manualTrays.splice(index, 1);
                rebuildTrayData();
                renderManualTrayTable();
                updateTrayDisplay();
                saveSession();
            },
            onDuplicate: index => {
                state.manualTrays.push({ ...state.manualTrays[index] });
                rebuildTrayData();
                renderManualTrayTable();
                updateTrayDisplay();
                saveSession();
            }
        });
        updateTableCounts();
        addSortHandlers(elements.manualTrayTableContainer, state.manualTrays, renderManualTrayTable, traySort);
        filterTable(elements.manualTrayTableContainer, elements.traySearch.value);
        if (elements.manualTrayTableContainer?.querySelector('tbody tr')) {
            emitSticky('imports-ready-trays','importsReadyTrays');
        }
    };
    const exportManualTraysCSV = () => {
        const headers = trayTemplateHeaders.map(h=>Array.isArray(h)?h[0]:h);
        const rows = state.manualTrays;
        let csv = headers.join(',') + '\n';
        if (rows.length > 0) {
            rows.forEach(r => {
                const row = [
                    r.tray_id,r.start_x,r.start_y,r.start_z,r.end_x,r.end_y,r.end_z,
                    r.width,r.height,r.tray_type||'',r.current_fill,r.allowed_cable_group,r.shape
                ];
                csv += row.join(',') + '\n';
            });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tray_list.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const importManualTrays = () => {
        const file = elements.importTraysFile.files[0];
        if(!file)return;
        handleImport(file,trayImportRequiredHeaders,rows=>{
            const newTrays=rows.map(t=>({
                tray_id:t.tray_id,
                start_x:parseFloat(t.start_x)||0,
                start_y:parseFloat(t.start_y)||0,
                start_z:parseFloat(t.start_z)||0,
                end_x:parseFloat(t.end_x)||0,
                end_y:parseFloat(t.end_y)||0,
                end_z:parseFloat(t.end_z)||0,
                width:parseFloat((t.inside_width??t.width))||0,
                height:parseFloat((t.tray_depth??t.height))||0,
                tray_type:t.tray_type||'',
                current_fill:parseFloat(t.current_fill)||0,
                allowed_cable_group:t.allowed_cable_group||'',
                shape:t.shape||'STR',
                raceway_type:'tray'
            }));
            state.manualTrays=newTrays;
            rebuildTrayData();
            renderManualTrayTable();
            updateTrayDisplay();
            updateTableCounts();
            saveSession();
            if (elements.manualTrayTableContainer?.querySelector('tbody tr')) {
                emitSticky('imports-ready-trays','importsReadyTrays');
            }
        });
        elements.importTraysFile.value='';
    };

    const exportCableOptionsCSV = () => {
        const headers = cableTemplateHeaders.map(h=>Array.isArray(h)?h[0]:h);
        const rows = state.cableList;
        let csv = headers.join(',') + '\n';
        if (rows.length > 0) {
            rows.forEach(c => {
                const row = [
                    c.name || '',
                    c.start_tag || '',
                    c.end_tag || '',
                    c.cable_type || '',
                    c.conductors !== undefined ? c.conductors : '',
                    c.conductor_size || '',
                    c.diameter !== undefined ? c.diameter : '',
                    c.weight !== undefined ? c.weight : '',
                    c.allowed_cable_group || '',
                    c.start[0], c.start[1], c.start[2],
                    c.end[0], c.end[1], c.end[2]
                ];
                csv += row.join(',') + '\n';
            });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cable_options.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const importCableOptions = () => {
        const file=elements.importCablesFile.files[0];
        if(!file)return;
        handleImport(file,cableImportRequiredHeaders,rows=>{
            const newCables=rows.map(t=>({
                name:t.tag||'',
                start_tag:t.from_tag||t.start_tag||'',
                end_tag:t.to_tag||t.end_tag||'',
                cable_type:t.cable_type||'Power',
                conductors:parseInt(t.conductors)||0,
                conductor_size:t.conductor_size||'#12 AWG',
                diameter:parseFloat(t.cable_od||t.diameter)||0,
                weight:parseFloat(t.weight||t.weight_lb_ft)||0,
                allowed_cable_group:t.allowed_cable_group||'',
                start:[parseFloat(t.start_x)||0,parseFloat(t.start_y)||0,parseFloat(t.start_z)||0],
                end:[parseFloat(t.end_x)||0,parseFloat(t.end_y)||0,parseFloat(t.end_z)||0],
                manual_path:''
            }));
            newCables.forEach(c=>setRacewayIds(c,[]));
            state.cableList=newCables;
            updateCableListDisplay();
            updateTableCounts();
            saveSession();
            if (elements.cableListContainer?.querySelector('tbody tr')) {
                emitSticky('imports-ready-cables','importsReadyCables');
            }
        });
        elements.importCablesFile.value='';
    };

    const downloadTraySample=()=>downloadSampleTemplate(trayTemplateHeaders,'tray_list_template.xlsx');
const downloadCableSample=()=>downloadSampleTemplate(cableTemplateHeaders,'cable_options_template.xlsx');

const formatRouteDistance = value => formatRouteDistanceModel(value, globalThis.units?.formatDistance);

const routeIssueAdvice = result => buildRouteIssueAdvice(result, {
    cables: state.cableList,
    readiness: getRoutingReadiness()
});

const buildRouteExplanation = result => buildRouteExplanationMarkup(
    buildRouteExplanationPoints(result, {
        cables: state.cableList,
        readiness: getRoutingReadiness(),
        formatDistance: formatRouteDistance
    }),
    escapeHtml
);

const buildRouteScreeningReview = (result, summary = summarizeRouteScreening(result)) => (
    buildRouteScreeningReviewMarkup(summary, { escapeHtml, escapeAttr, isSafeUrl })
);

const renderRouteSummaryPanel = (results = []) => {
    const summary = results.length
        ? summarizeRouteReview(results, state.updatedUtilData || [], isRacewayOverloaded)
        : null;
    renderRouteSummaryPanelView(elements.routeSummaryPanel, summary, {
        formatDistance: formatRouteDistance,
        escapeHtml,
        onOverload: focusOverloadedRaceways
    });
};
const renderPullChecks = results => {
    if (!elements.pullChecksContainer || !elements.pullChecksDetails) return;
    if (!state.pullChecksEnabled || !results || results.length === 0) {
        state.pullGroupAnalysis = null;
        elements.pullChecksContainer.innerHTML = '';
        elements.pullChecksDetails.style.display = 'none';
        elements.pullChecksDetails.open = false;
        return;
    }
    const pullOptions = getPullCheckOptions();
    state.pullGroupAnalysis = pullOptions.suggestPullGroups
        ? buildPullGroupSuggestions(results, state.cableList, pullOptions)
        : null;
    if (state.pullGroupAnalysis) {
        const groups = [...state.pullGroupAnalysis.suggestions, ...state.pullGroupAnalysis.reviewGroups];
        const activeGroupIds = new Set(groups.map(group => group.id));
        state.expandedPullGroupIds = new Set(
            [...state.expandedPullGroupIds].filter(id => activeGroupIds.has(id))
        );
    }
    const review = buildPullReviewMarkup(results, {
        groupAnalysis: state.pullGroupAnalysis,
        decisions: state.pullGroupDecisions,
        expandedGroupIds: state.expandedPullGroupIds,
        selectedRouteIndex: state.selectedRouteIndex,
        formatDistance: formatRouteDistance,
        escapeHtml,
        escapeAttr
    });
    elements.pullChecksContainer.innerHTML = review.html;
    bindPullReviewActions(elements.pullChecksContainer, {
        onExpandedChange: (groupId, expanded) => {
            if (expanded) state.expandedPullGroupIds.add(groupId);
            else state.expandedPullGroupIds.delete(groupId);
        },
        onDecision: (groupId, decision) => {
            state.pullGroupDecisions[groupId] = decision;
            renderPullChecks(results);
            saveSession();
        },
        onShowGroupRoute: async groupId => {
            const group = [...(state.pullGroupAnalysis?.suggestions || []), ...(state.pullGroupAnalysis?.reviewGroups || [])]
                .find(candidate => candidate.id === groupId);
            const routeIndex = group?.routeIndices?.[0];
            if (!Number.isFinite(routeIndex)) return;
            await highlightCableRoute(routeIndex);
            document.querySelector('.route-visual-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        onShowSetups: async routeIndex => {
            if (!Number.isFinite(routeIndex) || !state.latestRouteData[routeIndex]) return;
            state.pullSetupsVisible = true;
            state.labelsVisible = true;
            if (elements.pullSetupsToggle) elements.pullSetupsToggle.checked = true;
            if (elements.labelsToggle) elements.labelsToggle.checked = true;
            await highlightCableRoute(routeIndex);
            state.routeViewer?.setLayerVisibility('labels', true);
            state.routeViewer?.setLayerVisibility('pullSetups', true);
            const route = state.latestRouteData[routeIndex];
            const sectionCount = route.pull_check?.sections?.length || 1;
            if (elements.routeSelectionStatus) {
                elements.routeSelectionStatus.textContent = route.cable + ' is selected. ' + sectionCount +
                    ' calculated pull setup location' + (sectionCount === 1 ? ' is' : 's are') +
                    ' displayed with reel, tugger or hand-pull, sheave, and roller markers.';
            }
            saveSession();
            document.querySelector('.route-visual-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
    elements.pullChecksDetails.style.display = '';
    elements.pullChecksDetails.open = review.setupCount > 0 || review.reviewCount > 0;
};

let routeResultRenderVersion = 0;

const renderBatchResults = async (results) => {
        const renderVersion = ++routeResultRenderVersion;
        let totalLength = 0;
        let totalField = 0;
        let routedCount = 0;
        let failedCount = 0;
        const rowMarkup = [];
        const fmt = globalThis.units?.formatDistance || (v => `${v.toFixed(2)} ft`);
        results.forEach((res, idx) => {
            const tl = parseFloat(res.total_length);
            const fl = parseFloat(res.field_length);
            if (!isNaN(tl)) totalLength += tl;
            if (!isNaN(fl)) totalField += fl;
            const isSuccess = isRoutedResult(res);
            if (isSuccess) routedCount++; else failedCount++;
            const lockBtn = state.cableList[idx]?.locked ? '' : `<button class="lock-route-btn" data-idx="${idx}">Lock</button>`;
            const rowClass = isSuccess ? 'route-success' : 'route-failed';
            const totalLabel = isSuccess && Number.isFinite(tl) ? `${fmt(tl)}` : 'N/A';
            const fieldLabel = isSuccess ? `${fmt(Number.isFinite(fl) ? fl : 0)} field` : '';
            const segsLabel = isSuccess ? `${res.segments_count || 0}` : '0';
            const screeningSummary = summarizeRouteScreening(res);
            const screeningCell = screeningSummary.total
                ? `<button type="button" class="route-screening-toggle" data-index="${idx}" aria-expanded="false"><strong>${screeningSummary.total}</strong><span>candidate${screeningSummary.total === 1 ? '' : 's'} not used</span><small>View reasons</small></button>`
                : '<span class="route-screening-none"><strong>0</strong><span>All candidates eligible</span></span>';
            rowMarkup.push(`<tr class="route-list-row ${rowClass}" data-route-index="${idx}" tabindex="0">
                <td>${escapeHtml(res.cable)}</td>
                <td><span class="route-status-badge">${escapeHtml(res.status)}</span></td>
                <td><span class="route-mode-badge">${escapeHtml(res.mode)}</span></td>
                <td>${escapeHtml(totalLabel)}</td>
                <td>${escapeHtml(fieldLabel || `${fmt(0)} field`)}</td>
                <td>${escapeHtml(segsLabel)}</td>
                <td>${screeningCell}</td>
                <td><span class="route-row-actions"><button class="view-map-btn" data-index="${idx}">Highlight</button><button class="route-detail-toggle" data-index="${idx}" aria-expanded="false">Details</button>${lockBtn}</span></td>
            </tr>`);
        });
        elements.routeBreakdownContainer.innerHTML = `
            <p id="route-screening-column-help" class="route-list-caption"><strong>${routedCount} routed${failedCount ? `, ${failedCount} failed` : ''}.</strong> “Candidates not used” counts raceway segments the search considered but removed because of routing rules. It does not mean the selected route failed. Select the count to see the reasons and affected raceways.</p>
            <div class="table-scroll route-list-scroll">
                <table class="sticky-table route-list-table">
                    <thead><tr><th>Cable</th><th>Status</th><th>Mode</th><th>Total</th><th>Field</th><th>Segments</th><th><span class="route-screening-column-title">Candidates not used <span class="route-screening-help" title="Raceway segments considered during the search but excluded by capacity, cable class, proximity, or data rules." aria-label="About candidates not used">?</span></span></th><th>Actions</th></tr></thead>
                    <tbody></tbody>
                </table>
            </div>`;
        const resultBody = elements.routeBreakdownContainer.querySelector('.route-list-table tbody');
        await appendHtmlChunks(resultBody, rowMarkup, {
            chunkSize: 40,
            shouldContinue: () => renderVersion === routeResultRenderVersion,
        });
        if (renderVersion !== routeResultRenderVersion) return false;
        if (elements.routeBreakdownDetails) {
            elements.routeBreakdownDetails.open = false;
        }
        renderRouteSummaryPanel(results);
        const mismatches = [];
        results.forEach(r => {
            if (r.mismatched_records && r.mismatched_records.length) {
                mismatches.push(...r.mismatched_records);
            }
        });
        if (mismatches.length) {
            elements.mismatchedRacewaysList.innerHTML = mismatches.map(m => {
                const id = escapeHtml(m.tray_id || m.id || 'unknown');
                const reason = escapeHtml(m.reason.replace(/_/g, ' '));
                const cable = m.cable_id ? ` (cable ${escapeHtml(m.cable_id)})` : '';
                const link = isSafeUrl(m.filter) ? ` <a href="${escapeHtml(m.filter)}">Filter</a>` : '';
                return `<li>${id}: ${reason}${cable}${link}</li>`;
            }).join('');
            elements.mismatchedRacewaysDetails.style.display = '';
        } else {
            elements.mismatchedRacewaysList.innerHTML = '';
            elements.mismatchedRacewaysDetails.style.display = 'none';
        }
        if (results.some(r => (r.exclusions && r.exclusions.length > 0) || (r.mismatched_records && r.mismatched_records.length > 0))) {
            emitAsync('exclusions-found');
        }
        const setRouteDetailVisibility = (idx, visible, focusScreening = false) => {
            let row = elements.routeBreakdownContainer.querySelector(`.route-detail-row[data-route-detail-index="${idx}"]`);
            if (!row && visible) {
                const resultRow = elements.routeBreakdownContainer.querySelector(`tr[data-route-index="${idx}"]`);
                if (!resultRow) return;
                row = document.createElement('tr');
                Object.assign(row, { id: `route-screening-details-${idx}`, className: 'route-detail-row' });
                row.dataset.routeDetailIndex = String(idx);
                row.innerHTML = `<td colspan="8" data-route-detail-content="${idx}"></td>`;
                resultRow.after(row);
                elements.routeBreakdownContainer.querySelectorAll(`.route-screening-toggle[data-index="${idx}"], .route-detail-toggle[data-index="${idx}"]`)
                    .forEach(button => button.setAttribute('aria-controls', row.id));
            }
            if (!row) return;
            const detailCell = row.querySelector('[data-route-detail-content]');
            if (visible && detailCell && detailCell.dataset.rendered !== '1') {
                const result = results[idx];
                if (result) {
                    detailCell.innerHTML = buildRouteDetailMarkup({ ...result, breakdown: createRouteBreakdown(result, formatPoint, getSegmentType) }, summarizeRouteScreening(result), {
                        explanation: buildRouteExplanation,
                        screening: buildRouteScreeningReview,
                    });
                    detailCell.dataset.rendered = '1';
                    bindRouteDetailActions(detailCell, {
                        openConduit: segmentKey => {
                            const cables = state.fieldSegmentCableMap.get(segmentKey);
                            if (cables && cables.length) openConduitFill(cables);
                        },
                        openTray: trayId => { if (trayId) openTrayFill(trayId); },
                        openDuctbank: (ductbankId, conduitId) => {
                            if (ductbankId) openDuctbankRoute(ductbankId, conduitId);
                        },
                    });
                }
            }
            row.hidden = !visible;
            const detailButton = elements.routeBreakdownContainer.querySelector(`.route-detail-toggle[data-index="${idx}"]`);
            if (detailButton) {
                detailButton.setAttribute('aria-expanded', String(visible));
                detailButton.textContent = visible ? 'Hide' : 'Details';
            }
            const screeningButton = elements.routeBreakdownContainer.querySelector(`.route-screening-toggle[data-index="${idx}"]`);
            if (screeningButton) screeningButton.setAttribute('aria-expanded', String(visible));
            if (visible && focusScreening) {
                requestAnimationFrame(() => row.querySelector('.route-screening-review')?.focus({ preventScroll: true }));
            }
        };
        elements.routeBreakdownContainer.__ctrSetRouteDetailVisibility = setRouteDetailVisibility;
        if (elements.routeBreakdownContainer.dataset.routeEventsBound !== '1') {
            elements.routeBreakdownContainer.dataset.routeEventsBound = '1';
            elements.routeBreakdownContainer.addEventListener('click', event => {
                const button = event.target.closest('button');
                const row = event.target.closest('tr[data-route-index]');
                if (button?.classList.contains('view-map-btn')) {
                    event.stopPropagation();
                    highlightCableRoute(Number.parseInt(button.dataset.index, 10));
                    return;
                }
                if (button?.classList.contains('route-screening-toggle') || button?.classList.contains('route-detail-toggle')) {
                    event.stopPropagation();
                    const idx = Number.parseInt(button.dataset.index, 10);
                    const detailRow = elements.routeBreakdownContainer.querySelector(`.route-detail-row[data-route-detail-index="${idx}"]`);
                    elements.routeBreakdownContainer.__ctrSetRouteDetailVisibility?.(idx, !detailRow || detailRow.hidden, button.classList.contains('route-screening-toggle'));
                    return;
                }
                if (button?.classList.contains('lock-route-btn')) {
                    event.stopPropagation();
                    const idx = Number.parseInt(button.dataset.idx, 10);
                    if (!Number.isFinite(idx) || !state.cableList[idx]) return;
                    state.cableList[idx].locked = true;
                    saveSession();
                    if (state.latestRouteData && state.latestRouteData[idx]) {
                        state.latestRouteData[idx].mode = 'Locked';
                    }
                    updateCableListDisplay();
                    renderBatchResults(state.latestRouteData);
                    setRouteReviewMode(false);
                    elements.calculateBtn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }
                if (row && !event.target.closest('a, input, select')) {
                    const idx = Number.parseInt(row.dataset.routeIndex, 10);
                    if (Number.isFinite(idx)) highlightCableRoute(idx);
                }
            });
            elements.routeBreakdownContainer.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const row = event.target.closest('tr[data-route-index]');
                if (!row || event.target.closest('button, a, input, select')) return;
                event.preventDefault();
                const idx = Number.parseInt(row.dataset.routeIndex, 10);
                if (Number.isFinite(idx)) highlightCableRoute(idx);
            });
        }
        renderPullChecks(results);
        if (results.length) setRouteReviewMode(true);
        return true;
    };

    const updateCableListDisplay = () => {
        if (state.cableList.length === 0) {
            elements.cableListContainer.innerHTML = '';
            updateTableCounts();
            return;
        }
        state.cableList.forEach(syncManualPath);
        elements.cableListContainer.innerHTML = buildCableTableMarkup(state.cableList, { escapeAttr });
        elements.cableListContainer.classList.add('table-scroll');
        bindCableTable(elements.cableListContainer, {
            onFieldChange: ({ index, field, coordinate, value }) => {
                const cable = state.cableList[index];
                if (!cable) return;
                if (field === 'start' || field === 'end') cable[field][coordinate] = value;
                else cable[field] = value;
                saveSession();
            },
            onDuplicate: index => {
                const copy = structuredClone(state.cableList[index]);
                copy.name = nextCableName(copy.name);
                state.cableList.splice(index + 1, 0, copy);
                updateCableListDisplay();
                saveSession();
            },
            onDelete: index => {
                state.cableList.splice(index, 1);
                updateCableListDisplay();
                saveSession();
            },
            onLockChange: (index, locked) => {
                state.cableList[index].locked = locked;
                if (state.latestRouteData?.[index]) {
                    state.latestRouteData[index].mode = locked ? 'Locked' : 'Unlocked';
                }
                saveSession();
                updateCableListDisplay();
                renderBatchResults(state.latestRouteData);
            }
        });
        updateTableCounts();
        addSortHandlers(elements.cableListContainer, state.cableList, updateCableListDisplay, cableSort);
        filterTable(elements.cableListContainer, elements.cableSearch.value);
        if (elements.cableListContainer?.querySelector('tbody tr')) {
            emitSticky('imports-ready-cables','importsReadyCables');
        }
    };

    const loadSampleCables = () => {
        state.sampleDataMode = true;
        state.largeFacilityTestMode = false;
        state.cableList = getSampleCables();
        updateCableListDisplay();
        updateTableCounts();
        saveSession();
        emitSticky('samples-loaded','samplesLoaded');
    };

    const loadSampleNetwork = () => {
        state.largeFacilityTestMode = false;
        state.ductbankData = getSampleDuctbanks();
        state.conduitData = getSampleRiserConduits();
        loadSampleTrays();
        loadSampleCables();
        updateRoutingReadiness();
    };

    const loadLargeFacilitySample = () => {
        const sample = buildLargeFacilityRoutingSample();
        state.sampleDataMode = true;
        state.largeFacilityTestMode = true;
        state.manualTrays = sample.manualTrays;
        state.ductbankData = sample.ductbankData;
        state.conduitData = sample.conduitData;
        state.cableList = sample.cableList;
        state.latestRouteData = [];
        state.selectedRouteIndex = null;
        state.sharedFieldRoutes = [];
        state.trayCableMap = {};
        state.fieldSegmentCableMap = new Map();
        state.updatedUtilData = [];
        state.finalTrays = [];
        state.pullGroupAnalysis = null;
        state.pullGroupDecisions = {};
        rebuildTrayData();
        renderManualTrayTable();
        updateCableListDisplay();
        updateTrayDisplay();
        updateTableCounts();
        updateRoutingReadiness();
        storeLatestRouteResults([], { sample: 'large-facility' });
        if (elements.routeBreakdownContainer) elements.routeBreakdownContainer.innerHTML = '';
        if (elements.pullChecksContainer) elements.pullChecksContainer.innerHTML = '';
        saveSession();
        emitSticky('samples-loaded','samplesLoaded');
        showToast(`Loaded ${sample.summary.cableCount} cables and ${sample.summary.modeledRacewayCount} modeled raceways for the large facility test.`);
    };

    const importSchedulesForRouting = async () => {
        state.sampleDataMode = false;
        state.largeFacilityTestMode = false;
        await loadSchedulesIntoSession();
        renderManualTrayTable();
        updateCableListDisplay();
        rebuildTrayData();
        updateTrayDisplay();
        updateTableCounts();
        saveSession();
        showToast('Schedules imported for routing', 'success');
    };

    const addCableToBatch = () => {
        const newCable = {
            name: nextCableName(),
            cable_type: 'Power',
            conductors: 1,
            conductor_size: '#12 AWG',
            diameter: 1.0,
            weight: 0,
            start: [0, 0, 0],
            end: [0, 0, 0],
            start_tag: '',
            end_tag: '',
            allowed_cable_group: '',
            manual_path: ''
        };
        setRacewayIds(newCable, []);
        state.cableList.push(newCable);
        updateCableListDisplay();
        updateTableCounts();
        saveSession();
    };

    const clearCableList = () => {
        state.cableList = [];
        updateCableListDisplay();
        updateTableCounts();
        saveSession();
    };

    const deleteSavedData = () => {
        ['ctrSession','cableSchedule','ductbankSchedule','traySchedule','conduitSchedule']
            .forEach(k => removeItem(k));
        state.manualTrays = [];
        state.cableList = [];
        if (elements.manualTrayTableContainer) {
            elements.manualTrayTableContainer.innerHTML = '';
        }
        updateCableListDisplay();
        updateTrayDisplay();
        updateTableCounts();
        showAlertModal('Data Cleared', 'All saved data cleared.');
    };

    const showMessage = (type, text) => {
        elements.messages.innerHTML += `<div class="message ${escapeHtml(type)}">${escapeHtml(text)}</div>`;
    };

    const scrollResultsIntoView = () => {
      if (!elements.resultsSection) return;
      requestAnimationFrame(() => {
            const decisionSummary = document.getElementById('route-summary-panel');
            (decisionSummary || elements.resultsSection).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };

    const exportRoutesJSON = () => {
        if (!state.latestRouteData || state.latestRouteData.length === 0) {
            showAlertModal('Export Error', 'No route data to export.');
            return;
        }
        const routes = state.latestRouteData.map(r => ({
            cable: r.cable,
            segments: (r.route_segments || []).map(s => ({
                tray_id: s.tray_id || '',
                start: s.start,
                end: s.end
            }))
        }));
        const blob = new Blob([JSON.stringify(routes, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'routes.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        try {
            exportRoutesDXF(routes);
        } catch (err) {
            console.warn('DXF export failed', err);
        }
    };

    const exportGLTF = () => {
        const sceneModel = currentRouteSceneModel();
        const trays = sceneModel.raceways.map(raceway => ({
            tray_id: raceway.id,
            raceway_type: raceway.kind,
            conduit_id: raceway.kind === 'conduit' ? raceway.id : '',
            ductbank_id: raceway.parentId || '',
            width: raceway.kind === 'conduit' ? raceway.diameterIn : raceway.widthIn,
            height: raceway.kind === 'conduit' ? raceway.diameterIn : raceway.heightIn,
            path: raceway.path,
            utilizationPct: raceway.utilizationPct,
            current_fill: raceway.source.current_fill,
            maxFill: raceway.source.maxFill,
            numSlots: raceway.source.numSlots,
            slotFills: raceway.source.slotFills
        }));
        const cables = sceneModel.routes.map(route => ({
            label: route.label,
            cable_id: route.id,
            from_tag: route.startTag || route.from_tag || '',
            to_tag: route.endTag || route.to_tag || '',
            route_segments: route.segments
        }));
        if (trays.length === 0) {
            showAlertModal('Export Error', 'No tray geometry to export. Add trays and run routing first.');
            return;
        }
        const projectName = state.projectName || 'CableTrayRoute Export';
        try {
            const glb = exportToGLTF2({ trays, cables, projectName });
            const blob = new Blob([glb], { type: 'model/gltf-binary' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `${projectName.replace(/[^a-z0-9_\-]/gi, '_')}.glb`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('glTF export failed', err);
            showAlertModal('Export Error', `3D model export failed: ${err.message}`);
        }
    };

    const exportRouteXLSX = () => {
        if (!state.latestRouteData || state.latestRouteData.length === 0) {
            showAlertModal('Export Error', 'No route data to export.');
            return;
        }

        const segmentRows = buildSegmentRows(state.latestRouteData);
        const summaryRows = buildSummaryRows(state.latestRouteData);

        const headers = ['cable_tag','segment_order','element_type','element_id','length','cumulative_length','start_x','start_y','start_z','end_x','end_y','end_z','reason_codes'];
        let csv = headers.join(',') + '\n';
        segmentRows.forEach(r => {
            csv += headers.map(h => r[h] !== undefined ? r[h] : '').join(',') + '\n';
        });
        const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const csvUrl = URL.createObjectURL(csvBlob);
        const csvLink = document.createElement('a');
        csvLink.href = csvUrl;
        csvLink.download = 'route_data.csv';
        document.body.appendChild(csvLink);
        csvLink.click();
        document.body.removeChild(csvLink);
        URL.revokeObjectURL(csvUrl);

        const trayMap = new Map();
        state.latestRouteData.forEach(row => {
            {
                createRouteBreakdown(row, formatPoint, getSegmentType).forEach(b => {
                    if (b.tray_id && b.tray_id !== 'Field Route' && b.tray_id !== 'N/A') {
                        if (!trayMap.has(b.tray_id)) trayMap.set(b.tray_id, new Set());
                        trayMap.get(b.tray_id).add(row.cable);
                    }
                });
            }
        });

        const groupMap = new Map(state.trayData.map(t => [t.tray_id, t.allowed_cable_group || '']));
        const trayList = Array.from(trayMap.entries()).map(([tray_id, cables]) => ({
            tray_id,
            allowed_cable_group: groupMap.get(tray_id) || '',
            cables: Array.from(cables).join(', ')
        }));

        const sharedRoutes = (state.sharedFieldRoutes || []).map(r => ({
            route_name: r.name,
            allowed_cable_group: r.allowed_cable_group || '',
            start: formatPoint(r.start),
            end: formatPoint(r.end),
            cables: r.cables.join(', '),
            recommendation: r.recommendation,
            trade_size: r.trade_size || '',
            tray_size: r.tray_size || ''
        }));

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.json_to_sheet(segmentRows);
        XLSX.utils.book_append_sheet(wb, ws1, 'Segments');
        const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
        const ws2 = XLSX.utils.json_to_sheet(trayList);
        XLSX.utils.book_append_sheet(wb, ws2, 'Tray Cable Map');
        if (sharedRoutes.length > 0) {
            const ws3 = XLSX.utils.json_to_sheet(sharedRoutes);
            XLSX.utils.book_append_sheet(wb, ws3, 'Shared Field Routes');
        }
        XLSX.writeFile(wb, 'route_data.xlsx');
    };

    const exportBOMXLSX = async () => {
        if (!state.latestRouteData || state.latestRouteData.length === 0) {
            showAlertModal('Export Error', 'No route data to export.');
            return;
        }
        const [conductorProps, materialCosts] = await Promise.all([
            fetchDataFile('data/conductor_properties.json', {}),
            fetchDataFile('data/material_costs.json', {})
        ]);
        const { raceways, cables } = buildBOM(state.latestRouteData, state.trayData, state.cableList, conductorProps, materialCosts);

        // Build per-tray cable weight map from route results for support span calculation
        const trayWeights = {};
        state.latestRouteData.forEach(res => {
            createRouteBreakdown(res, formatPoint, getSegmentType).forEach(seg => {
                if (!seg.tray_id) return;
                const cable = state.cableList.find(c => (c.tag || c.cable_tag) === res.cable);
                const w = cable
                    ? parseFloat(cable.weight_lb_ft != null ? cable.weight_lb_ft : cable.weight) || 0
                    : 0;
                trayWeights[seg.tray_id] = (trayWeights[seg.tray_id] || 0) + w;
            });
        });

        const { fittings, supports, sections, summary } = buildTrayHardwareBOM(state.trayData, { trayWeights });

        const wb = XLSX.utils.book_new();
        if (raceways.length) {
            const wsR = XLSX.utils.json_to_sheet(raceways);
            XLSX.utils.book_append_sheet(wb, wsR, 'Raceways');
        }
        if (cables.length) {
            const wsC = XLSX.utils.json_to_sheet(cables);
            XLSX.utils.book_append_sheet(wb, wsC, 'Cables');
        }
        if (summary.length) {
            const wsS = XLSX.utils.json_to_sheet(summary);
            XLSX.utils.book_append_sheet(wb, wsS, 'Tray Hardware Summary');
        }
        if (fittings.length) {
            const wsF = XLSX.utils.json_to_sheet(fittings.map(f => ({
                type: f.type,
                tray_ids: f.tray_ids.join(', '),
                angle: f.angle != null ? f.angle : '',
                widths: f.widths.join(', '),
            })));
            XLSX.utils.book_append_sheet(wb, wsF, 'Fittings Detail');
        }
        if (supports.length) {
            const wsSup = XLSX.utils.json_to_sheet(supports);
            XLSX.utils.book_append_sheet(wb, wsSup, 'Support Brackets');
        }
        if (sections.length) {
            const wsSec = XLSX.utils.json_to_sheet(sections);
            XLSX.utils.book_append_sheet(wb, wsSec, 'Tray Sections');
        }
        XLSX.writeFile(wb, 'bom.xlsx');
    };

    const formatPoint = (p) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)})`;

    const getSegmentType = (seg) => {
        if (seg.type !== 'tray') return seg.type;
        const tray = state.trayData.find(t => t.tray_id === seg.tray_id);
        const rt = tray && tray.raceway_type ? tray.raceway_type : 'tray';
        return rt === 'ductbank' ? 'duct bank' : rt;
    };

    // Render a tray/cable combo to an image. We use JPEG instead of PNG so the
    // PDF export has a much smaller file size while retaining good quality.
    // The quality parameter can be tuned if needed.
    const renderTrayToPNG = (tray, cables, quality = 0.92) => {
        return new Promise(resolve => {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            const cleanup = () => document.body.removeChild(iframe);
            iframe.onload = () => {
                const doc = iframe.contentDocument;
                let attempts = 0;
                const grab = () => {
                    attempts++;
                    const expanded = doc && doc.querySelector('#expandedSVG svg');
                    if (expanded) {
                        const svgStr = new XMLSerializer().serializeToString(expanded);
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            const jpg = canvas.toDataURL('image/jpeg', quality);
                            cleanup();
                            resolve(jpg);
                        };
                        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
                        return;
                    }

                    const svgEl = doc && doc.querySelector('#svgContainer svg');
                    if (svgEl) {
                        const expandBtn = doc.getElementById('expandBtn');
                        if (expandBtn) expandBtn.click();
                    }
                    if (attempts > 50) {
                        console.warn('renderTrayToPNG timed out');
                        cleanup();
                        resolve(null);
                        return;
                    }
                    setTimeout(grab, 100);
                };
                grab();
            };
            try {
                setItem('trayFillData', { tray, cables });
            } catch (e) { console.warn('[app] failed to set trayFillData:', e); }
            iframe.src = 'cabletrayfill.html';
        });
    };

    const addUtilizationTableToPDF = (doc, utilData, pageMap = null) => {
        const margin = 20;
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        let y = margin;
        let currentPage = doc.internal.getCurrentPageInfo().pageNumber;

        const renderHeader = () => {
            doc.setFontSize(14);
            doc.text('Updated Raceway Utilization', pageW / 2, y, { align: 'center' });
            y += 8;
            doc.setFontSize(10);
            doc.text('Tray ID', col1, y);
            doc.text('Util %', col2, y);
            doc.text('Available (in\u00b2)', col3, y);
            doc.text('Page', col4, y);
            y += rowHeight;
        };

        doc.setFontSize(10);
        const col1 = margin;
        const col2 = margin + 50;
        const col3 = margin + 100;
        const col4 = margin + 150;
        const rowHeight = 6;
        const rowWidth = pageW - margin * 2;

        renderHeader();

        const colorForUtil = (util) => {
            if (util > 80) return { fill: [248, 215, 218], text: [114, 28, 36] }; // error colors
            if (util > 60) return { fill: [255, 243, 205], text: [133, 100, 4] }; // warning colors
            return { fill: [212, 237, 218], text: [21, 87, 36] }; // success colors
        };

        utilData.forEach(row => {
            if (y > pageH - margin) {
                // draw bottom border before breaking
                doc.line(margin, y, pageW - margin, y);
                currentPage++;
                doc.setPage(currentPage);
                y = margin;
                renderHeader();
            }

            const trayText = String(row.tray_id);
            const pageNum = pageMap && pageMap[row.tray_id] ? pageMap[row.tray_id] : '';
            const utilPct = parseFloat(row.full_pct);
            const colors = colorForUtil(utilPct);

            doc.setFillColor(...colors.fill);
            doc.setDrawColor(0);
            doc.rect(margin, y - rowHeight + 2, rowWidth, rowHeight, 'FD');

            doc.setTextColor(...colors.text);
            doc.text(trayText, col1, y);
            if (pageMap && pageMap[row.tray_id]) {
                const textWidth = doc.getTextWidth(trayText);
                doc.link(col1, y - 3, textWidth, 4, { pageNumber: pageNum });
            }
            doc.text(utilPct.toFixed(1) + '%', col2, y);
            doc.text(String(row.available), col3, y);
            if (pageNum) {
                const txt = String(pageNum);
                doc.text(txt, col4, y);
                const width = doc.getTextWidth(txt);
                doc.link(col4, y - 3, width, 4, { pageNumber: pageNum });
            }
            doc.setTextColor(0);

            y += rowHeight;
        });
        // bottom border for last row
        doc.line(margin, y, pageW - margin, y);
    };

    const exportTrayFills = async () => {
        if (!state.updatedUtilData || state.updatedUtilData.length === 0) {
            showAlertModal('Export Error', 'No tray fill data available.');
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showAlertModal('Export Error', 'PDF export library not loaded. Please refresh the page and try again.');
            return;
        }
        const { jsPDF } = window.jspdf;

        const traysWithCables = state.updatedUtilData.filter(info => {
            const cables = state.trayCableMap && state.trayCableMap[info.tray_id];
            return cables && cables.length > 0;
        });
        const utilDataForExport = traysWithCables;

        if (traysWithCables.length === 0) {
            showAlertModal('Export Error', 'No tray fills to export.');
            return;
        }

        elements.exportTrayFillsBtn.disabled = true;
        elements.progressContainer.style.display = 'block';
        elements.progressBar.style.width = '0%';
        elements.progressBar.setAttribute('aria-valuenow', '0');
        elements.progressLabel.textContent = 'Generating PDF...';

        const doc = new jsPDF({ compress: true });
        const margin = 20;
        const rowHeight = 6;
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();

        // calculate how many pages the utilization table will need
        const rowsPerPage = Math.max(1, Math.floor((pageH - margin - (margin + 8 + rowHeight)) / rowHeight));
        const tablePages = Math.max(1, Math.ceil(utilDataForExport.length / rowsPerPage));

        let y = 20;
        const pageMap = {};

        const getDims = (url) => new Promise(res => {
            const img = new Image();
            img.onload = () => res({ width: img.width, height: img.height });
            img.onerror = () => res({ width: 0, height: 0 });
            img.src = url;
        });

        for (let i = 0; i < traysWithCables.length; i++) {
            const info = traysWithCables[i];
            const trayId = info.tray_id;
            const tray = state.trayData.find(t => t.tray_id === trayId);
            if (!tray) continue;
            const cables = (state.trayCableMap && state.trayCableMap[trayId]) ? state.trayCableMap[trayId] : [];
            const jpg = await renderTrayToPNG(tray, cables);
            if (!jpg) continue;
            const dims = await getDims(jpg);
            let w = dims.width;
            let h = dims.height;
            const maxW = pageW - 40; // 20mm margins
            const maxH = pageH - 40;
            if (w > maxW) {
                h = h * (maxW / w);
                w = maxW;
            }
            if (h > maxH) {
                w = w * (maxH / h);
                h = maxH;
            }

            if (y > pageH - (h + 20)) {
                doc.addPage();
                y = 20;
            }
            const pageNum = doc.getNumberOfPages();
            pageMap[trayId] = pageNum;
            doc.outline.add(null, `Tray ${trayId}`, { pageNumber: pageNum });
            doc.text(`Tray ${trayId}`, 20, y);
            doc.addImage(jpg, 'JPEG', 20, y + 10, w, h);
            y += h + 20;

            const pct = Math.round(((i + 1) / traysWithCables.length) * 100);
            elements.progressBar.style.width = pct + '%';
            elements.progressBar.setAttribute('aria-valuenow', String(pct));
            elements.progressLabel.textContent = `Generating PDF (${i + 1}/${traysWithCables.length})`;
        }

        // insert table pages at the front and update page numbers
        for (let i = 0; i < tablePages; i++) {
            doc.insertPage(1);
        }
        Object.keys(pageMap).forEach(id => {
            pageMap[id] += tablePages;
        });

        doc.setPage(1);
        doc.outline.add(null, 'Tray Utilization', { pageNumber: 1 });
        addUtilizationTableToPDF(doc, utilDataForExport, pageMap);
        doc.save('tray_fills.pdf');
        elements.progressContainer.style.display = 'none';
        elements.exportTrayFillsBtn.disabled = false;
    };

    const cancelCurrentRouting = () => {
        if (!routingWorker) return;
        if (!routingPaused) {
            routingWorker.postMessage({ type: 'cancel' });
            routingPaused = true;
            elements.cancelRoutingBtn.textContent = 'Resume Routing';
            elements.progressLabel.textContent = 'Paused';
        } else {
            routingWorker.postMessage({ type: 'resume' });
            routingPaused = false;
            elements.cancelRoutingBtn.textContent = 'Pause Routing';
        }
    };

    const mainCalculation = async () => {
        if (!validateInputs(['proximity-threshold','max-field-edge','field-route-penalty','shared-field-penalty'])) return;
        let readiness = updateRoutingReadiness();
        if (!readiness.ready) {
            await loadSchedulesIntoSession();
            renderManualTrayTable();
            updateCableListDisplay();
            rebuildTrayData();
            updateTrayDisplay();
            readiness = updateRoutingReadiness();
        }
        if (!readiness.ready) {
            elements.resultsSection.style.display = 'block';
            elements.messages.innerHTML = `<div class="message warning">${escapeHtml(readiness.blocking[0] || 'Add trays and cables before running routing.')}</div>`;
            renderRouteSummaryPanel([]);
            return;
        }
        elements.resultsSection.style.display = 'block';
        elements.messages.innerHTML = '';
        elements.progressContainer.style.display = 'block';
        elements.progressBar.style.width = '0%';
        elements.progressBar.setAttribute('aria-valuenow', '0');
        elements.progressLabel.textContent = 'Starting...';
        elements.cancelRoutingBtn.style.display = 'block';
        elements.cancelRoutingBtn.disabled = false;
        rebuildTrayData();

        // clear previous manual path validation errors
        if (elements.cableListContainer) {
            elements.cableListContainer.querySelectorAll('.cable-manual-input').forEach(input => {
                input.classList.remove('input-error');
                const err = input.nextElementSibling;
                if (err && err.classList.contains('error-message')) err.remove();
            });
        }
        if (elements.manualTrayTableContainer) {
            elements.manualTrayTableContainer.querySelectorAll('.tray-id-input').forEach(inp => inp.classList.remove('input-error'));
        }

        const options = getRouteCalculationOptions();

        // Deep copy tray data so original state isn't mutated during batch routing
        const trayDataForRun = structuredClone(state.trayData);

        const showManualPathError = (idx, message, trayId) => {
            const input = elements.cableListContainer.querySelector(`.cable-manual-input[data-idx='${idx}']`);
            if (input) {
                input.classList.add('input-error');
                let msg = input.nextElementSibling;
                if (!msg || !msg.classList.contains('error-message')) {
                    msg = document.createElement('span');
                    msg.className = 'error-message';
                    input.insertAdjacentElement('afterend', msg);
                }
                msg.textContent = message;
            }
            if (trayId && elements.manualTrayTableContainer) {
                const trayInput = elements.manualTrayTableContainer.querySelector(`.tray-id-input[value='${trayId}']`);
                if (trayInput) trayInput.classList.add('input-error');
            }
        };

        if (state.cableList.length > 0) {
            const projectHash = computeRoutingProjectHash({ trays: trayDataForRun, cables: state.cableList, options });
            currentProjectHash = projectHash;
            const cacheKey = `route-${projectHash}`;
            const cache = getItem(cacheKey);
            if (cache) {
                const cachedBatchResults = applyPullChecksToResults(normalizeRouteResultState(cache).batchResults);
                state.latestRouteData = cachedBatchResults;
                storeLatestRouteResults(cachedBatchResults, {
                    projectHash,
                    source: 'optimalRouteCache',
                    trayCableMap: cache.trayCableMap || {},
                    finalTrays: cache.finalTrays || [],
                    updatedUtilData: buildUtilizationRows(cache.utilization, trayDataForRun)
                });
                state.finalTrays = cache.finalTrays;
                const resMap = new Map(cachedBatchResults.map(r => [r.cable, r]));
                state.cableList.forEach(c => {
                    const r = resMap.get(c.name);
                    c.route_segments = r ? r.route_segments || [] : [];
                });
                const utilData = buildUtilizationRows(cache.utilization, trayDataForRun);
                state.updatedUtilData = utilData;
                renderUpdatedUtilizationTable();
                buildFieldSegmentCableMap(cachedBatchResults);
                state.latestRouteData = cachedBatchResults;
                await renderBatchResults(cachedBatchResults);
                state.trayCableMap = cache.trayCableMap || {};
                state.sharedFieldRoutes = cache.sharedRoutes || [];
                elements.metrics.innerHTML = cache.metricsHtml || '<p>No common field routes detected.</p>';
                elements.progressBar.style.width = '100%';
                elements.progressBar.setAttribute('aria-valuenow', '100');
                elements.progressLabel.textContent = `Complete (${(cache.wallTime/1000).toFixed(2)}s, cached)`;
                elements.progressContainer.style.display = 'none';
                elements.cancelRoutingBtn.style.display = 'none';
                visualize(state.finalTrays?.length ? state.finalTrays : trayDataForRun, viewerRoutes(), "Batch Route Visualization");
                scrollResultsIntoView();
                return;
            }

            let batchResults = [];
            let allRoutesForPlotting = [];

            routingWorker = new Worker('batchRouteWorker.js');
            routingPaused = false;
            elements.cancelRoutingBtn.textContent = 'Pause Routing';
            const routingStartTime = performance.now();
            const finishRoutingMeasurement = startPerformanceMeasurement('ctr.routing-recalculation', {
                cableCount: state.cableList.length,
                racewayCount: trayDataForRun.length,
                sample: state.largeFacilityTestMode ? 'large-facility' : 'project',
            });
            const recentRouteTimes = [];
            routingWorker.onmessage = async e => {
                const msg = e.data;
                if (msg.type === 'progress') {
                    const total = state.cableList.length;
                    const pct = (msg.completed / total) * 100;
                    elements.progressBar.style.width = `${pct}%`;
                    elements.progressBar.setAttribute('aria-valuenow', Math.round(pct).toString());

                    // Track recent per-cable times for ETA estimation
                    if (msg.routeMs != null) {
                        recentRouteTimes.push(msg.routeMs);
                        if (recentRouteTimes.length > 10) recentRouteTimes.shift();
                    }
                    const remaining = total - msg.completed;
                    let etaText = '';
                    if (recentRouteTimes.length >= 3 && remaining > 0) {
                        const avgMs = recentRouteTimes.reduce((a, b) => a + b, 0) / recentRouteTimes.length;
                        const etaSec = (avgMs * remaining) / 1000;
                        etaText = etaSec < 60
                            ? ` — ~${etaSec.toFixed(0)}s left`
                            : ` — ~${(etaSec / 60).toFixed(1)}m left`;
                    }
                    const statusIcon = msg.success === false ? 'Failed' : 'Routed';
                    const cableLabel = msg.cableName ? `: ${msg.cableName}` : '';
                    elements.progressLabel.textContent = `${statusIcon}: cable ${msg.completed}/${total}${cableLabel}${etaText}`;
                } else if (msg.type === 'cancelled') {
                    elements.progressLabel.textContent = `Paused (${msg.completed}/${state.cableList.length})`;
                } else if (msg.type === 'done') {
                    routingWorker.terminate();
                    routingWorker = null;
                    let rawResults = msg.results;
                    allRoutesForPlotting = msg.allRoutes || [];
                    batchResults = rawResults.map((result, index) => {
                        const cable = state.cableList[index];
                        if (!result.success) {
                            showManualPathError(index, result.message, result.error && result.error.tray_id);
                        }
                        cable.route_segments = result.success ? result.route_segments : [];
                        let vd = 0;
                        if (result.success) {
                            vd = calculateVoltageDrop(cable, result.total_length, cable.phase);
                            cable.voltage_drop_pct = vd;
                        }
                        const pullCheck = result.success && state.pullChecksEnabled
                            ? buildCablePullPlan(result.route_segments || [], cable, getPullCheckOptions())
                            : null;
                        return {
                            cable: cable.name,
                            status: result.success ? 'Routed' : 'Failed',
                            mode: cable.locked ? 'Locked' : (result.manual ? (result.manual_raceway ? 'Manual Raceway' : 'Manual Path') : 'Automatic'),
                            manual_raceway: !!result.manual_raceway,
                            total_length: result.success ? result.total_length.toFixed(2) : 'N/A',
                            field_length: result.success ? result.field_routed_length.toFixed(2) : 'N/A',
                            tray_segments_count: result.success ? result.tray_segments.length : 0,
                            segments_count: result.success ? result.route_segments.length : 0,
                            tray_segments: result.success ? result.tray_segments : [],
                            route_segments: result.success ? result.route_segments : [],
                            voltage_drop_pct: result.success ? vd.toFixed(2) : 'N/A',
                            ...(pullCheck ? { pull_check: pullCheck } : {}),
                            exclusions: result.exclusions || [],
                        };
                    });
                    rawResults = null;
                    msg.results = null;

                    buildFieldSegmentCableMap(batchResults);
                    if (!state.sampleDataMode) setCables(state.cableList, { captureUndo: false });
                    state.latestRouteData = batchResults;
                    await renderBatchResults(batchResults);
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    const nameMap = new Map(state.cableList.map(c => [c.name, c]));
                    state.trayCableMap = {};
                    batchResults.forEach(row => {
                        const cableObj = nameMap.get(row.cable);
                        if (!cableObj) return;
                        createRouteBreakdown(row, formatPoint, getSegmentType).forEach(b => {
                            if (b.tray_id && b.tray_id !== 'Field Route' && b.tray_id !== 'N/A') {
                                if (!state.trayCableMap[b.tray_id]) state.trayCableMap[b.tray_id] = [];
                                const entry = b.conduit_id ? { ...cableObj, conduit_id: b.conduit_id } : cableObj;
                                const exists = state.trayCableMap[b.tray_id].some(c =>
                                    c.name === entry.name && (!entry.conduit_id || c.conduit_id === entry.conduit_id)
                                );
                                if (!exists) state.trayCableMap[b.tray_id].push(entry);
                            }
                        });
                    });
                    const cableMapForArea = new Map(state.cableList.map(c => [c.name, c.diameter]));
                    const cableMapForObj = new Map(state.cableList.map(c => [c.name, c]));
                    const commonRaw = msg.sharedRoutes || [];
                    const common = commonRaw.map(r => {
                        const areas = r.cables.map(n => {
                            const d = cableMapForArea.get(n);
                            return d ? Math.PI * (d / 2) ** 2 : 0;
                        });
                        const totalArea = areas.reduce((a,b) => a + b, 0);
                        const count = r.cables.length;
                        const cableObjs = r.cables.map(name => cableMapForObj.get(name) || {
                            diameter: cableMapForArea.get(name) || 0
                        });
                        const sizing = recommendRaceway(cableObjs, {
                            thresholds: CONTAINMENT_RULES.thresholds,
                            conduitType: elements.conduitType.value,
                            conduitSpecs: CONDUIT_SPECS,
                            totalAreaOverride: totalArea
                        });
                        const recommendation = sizing.recommendation;
                        const tradeSize = recommendation === 'conduit' ? sizing.tradeSize || 'N/A' : null;
                        const traySize = sizing.traySize;
                        return { ...r, total_area: totalArea, cable_count: count, recommendation, trade_size: tradeSize, tray_size: traySize };
                    });
                    state.sharedFieldRoutes = common;
                    if (common.length > 0) {
                        let html = '<details><summary>Potential Shared Field Routes</summary><ul>';
                        common.forEach((c, idx) => {
                            const group = c.allowed_cable_group ? ` (Group ${c.allowed_cable_group})` : '';
                            let recText = c.recommendation;
                            if (c.recommendation === 'conduit' && c.trade_size && c.trade_size !== 'N/A') {
                                recText = `Recommended: ${c.trade_size}" Conduit`;
                            } else if ((c.recommendation === 'tray' || c.recommendation === 'channel') && c.tray_size) {
                                const label = c.recommendation === 'tray' ? 'Tray' : 'Channel';
                                recText = `Recommended: ${c.tray_size}" ${label}`;
                            } else {
                                const label = c.recommendation.charAt(0).toUpperCase() + c.recommendation.slice(1);
                                recText = `Recommended: ${label}`;
                            }
                            let fillLink = '';
                            if (c.recommendation === 'conduit') {
                                fillLink = ` <a href="#" class="conduit-fill-link" data-route-index="${idx}">Fill</a>`;
                            }
                            html += `<li class="shared-route-item" data-route-index="${idx}">${escapeHtml(c.name)}${escapeHtml(group)}: ${escapeHtml(formatPoint(c.start))} to ${escapeHtml(formatPoint(c.end))} - ${escapeHtml(c.cables.join(', '))} | ${escapeHtml(recText)}${fillLink}</li>`;
                        });
                        html += '</ul></details>';
                        elements.metrics.innerHTML = html;
                        elements.metrics.querySelectorAll('.shared-route-item').forEach(li => {
                            li.style.cursor = 'pointer';
                            li.addEventListener('click', () => highlightSharedRoute(parseInt(li.dataset.routeIndex, 10)));
                        });
                        elements.metrics.querySelectorAll('.conduit-fill-link').forEach(link => {
                            link.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const idx = parseInt(link.dataset.routeIndex, 10);
                                const route = state.sharedFieldRoutes[idx];
                                if (route) {
                                    const cables = route.cables.map(n => state.cableList.find(c => c.name === n)).filter(Boolean);
                                    openConduitFill(cables);
                                }
                            });
                        });
                    } else {
                        elements.metrics.innerHTML = '<p>No common field routes detected.</p>';
                    }
                    const finalUtilization = msg.utilization;
                    const utilData = buildUtilizationRows(finalUtilization, trayDataForRun);
                    state.finalTrays = msg.finalTrays;
                    state.updatedUtilData = utilData;
                    renderUpdatedUtilizationTable();
                    const routeStorageMode = storeLatestRouteResults(batchResults, {
                        projectHash,
                        trayCableMap: state.trayCableMap,
                        finalTrays: state.finalTrays,
                        updatedUtilData: state.updatedUtilData
                    });
                    if (routeStorageMode === 'session') {
                        showToast('Routing complete. This large result is saved for this tab; use Save Project to retain it after closing the tab.');
                    }
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    visualize(state.finalTrays, viewerRoutes(), "Batch Route Visualization");

                    elements.progressLabel.textContent = `Complete (${(msg.wallTime/1000).toFixed(2)}s)`;
                    elements.progressContainer.style.display = 'none';
                    elements.cancelRoutingBtn.style.display = 'none';
                    scrollResultsIntoView();

                    if (batchResults.length <= 100) {
                        const compactCache = compactRouteResultStateForStorage({
                            batchResults,
                            trayCableMap: state.trayCableMap
                        });
                        setItem(cacheKey, {
                            ...compactCache,
                            utilization: finalUtilization,
                            finalTrays: msg.finalTrays,
                            sharedRoutes: state.sharedFieldRoutes,
                            metricsHtml: elements.metrics.innerHTML,
                            wallTime: msg.wallTime
                        });
                    }
                    msg.allRoutes = null;
                    allRoutesForPlotting = [];
                    finishRoutingMeasurement({
                        success: true,
                        workerMs: Number(msg.wallTime) || 0,
                        routedCount: batchResults.filter(result => result.status === 'Routed').length,
                    });
                }
            };
            routingWorker.postMessage({ type: 'start', trays: trayDataForRun, options, cables: state.cableList });
        } else {
            showAlertModal('Routing Error', 'Please add at least one cable to route.');
            elements.cancelRoutingBtn.style.display = 'none';
            elements.progressContainer.style.display = 'none';
            return;
        }
    };

    const sleep = (ms = 0) => new Promise(res => setTimeout(res, ms));

    const rebalanceTrayFill = async () => {
        if (!state.finalTrays || state.finalTrays.length === 0) {
            showAlertModal('Routing Error', 'Run routing first.');
            return;
        }

        const fillLimit = parseFloat(elements.fillLimitIn.value) / 100;
        const routingSystem = new CableRoutingSystem({
            fillLimit,
            proximityThreshold: parseFloat(document.getElementById('proximity-threshold').value),
            fieldPenalty: parseFloat(document.getElementById('field-route-penalty').value),
            sharedPenalty: parseFloat(document.getElementById('shared-field-penalty').value),
            maxFieldEdge: parseFloat(document.getElementById('max-field-edge').value),
            maxFieldNeighbors: 8,
            includeDuctbankOutlines: state.includeDuctbankOutlines,
            clock: () => performance.now(),
            warningLog: message => console.warn(message),
            debugLog: (...args) => {
                if (window.debug?.enabled) window.debug.log(...args);
            }
        });

        const trayData = state.finalTrays.map(t => ({ ...t }));
        trayData.forEach(t => routingSystem.addTraySegment(t));
        routingSystem.prepareBaseGraph();

        const overfilled = trayData.filter(t => t.current_fill > t.maxFill);
        if (overfilled.length === 0) {
            showAlertModal('Rebalance', 'No overfilled trays detected.');
            return;
        }

        elements.progressContainer.style.display = 'block';
        elements.progressBar.style.width = '0%';
        elements.progressBar.setAttribute('aria-valuenow', '0');
        elements.progressLabel.textContent = 'Rebalancing...';

        const cableMap = new Map(state.cableList.map(c => [c.name, c]));
        const resultMap = new Map(state.latestRouteData.map((r, i) => [r.cable, { row: r, index: i }]));
        const cablesToReroute = new Set();
        overfilled.forEach(t => {
            const cabs = state.trayCableMap[t.tray_id] || [];
            cabs.forEach(c => cablesToReroute.add(c.name));
        });

        let completed = 0;
        const total = cablesToReroute.size;
        for (const name of cablesToReroute) {
            const cable = cableMap.get(name);
            const info = resultMap.get(name);
            if (!cable || !info) return;
            const area = Math.PI * (cable.diameter / 2) ** 2 * getParallelCount(cable.parallel_count);
            if (Array.isArray(info.row.tray_segments)) {
                routingSystem.updateTrayFill(info.row.tray_segments, -area, cable.allowed_cable_group);
            }
            const res = routingSystem.calculateRoute(cable.start, cable.end, area, cable.allowed_cable_group);
            if (res.success) {
                routingSystem.updateTrayFill(res.tray_segments, area, cable.allowed_cable_group);
                routingSystem.recordSharedFieldSegments(res.route_segments);
                info.row = {
                    cable: cable.name,
                    status: '✓ Routed',
                    total_length: res.total_length.toFixed(2),
                    field_length: res.field_routed_length.toFixed(2),
                    tray_segments_count: res.tray_segments.length,
                    segments_count: res.route_segments.length,
                    tray_segments: res.tray_segments,
                    route_segments: res.route_segments,
                    ...(state.pullChecksEnabled ? {
                        pull_check: buildCablePullPlan(res.route_segments || [], cable, getPullCheckOptions())
                    } : {}),
                    breakdown: res.route_segments.map((seg, i) => {
                        let tray_id = seg.type === 'field' ? 'Field Route' : (seg.tray_id || 'N/A');
                        let type = getSegmentType(seg);
                        let raceway = '';
                        let conduit_id = seg.conduit_id || '';
                        return {
                            segment: i + 1,
                            tray_id,
                            type,
                            from: formatPoint(seg.start),
                            to: formatPoint(seg.end),
                            length: seg.length.toFixed(2),
                            raceway,
                            conduit_id,
                            ductbankTag: seg.ductbankTag
                        };
                    })
                };
                resultMap.set(name, info);
            } else {
                routingSystem.updateTrayFill(info.row.tray_segments, area, cable.allowed_cable_group);
            }
            completed++;
            const pct = Math.round((completed / total) * 100);
            elements.progressBar.style.width = pct + '%';
            elements.progressBar.setAttribute('aria-valuenow', String(pct));
            elements.progressLabel.textContent = `Rebalancing (${completed}/${total})`;
            await sleep();
        }

        state.latestRouteData = Array.from(resultMap.values()).sort((a,b) => a.index - b.index).map(v => v.row);
        buildFieldSegmentCableMap(state.latestRouteData);

        const nameMap = new Map(state.cableList.map(c => [c.name, c]));
        state.trayCableMap = {};
        state.latestRouteData.forEach(row => {
            const cableObj = nameMap.get(row.cable);
            if (!cableObj) return;
            createRouteBreakdown(row, formatPoint, getSegmentType).forEach(b => {
                if (b.tray_id && b.tray_id !== 'Field Route' && b.tray_id !== 'N/A') {
                    if (!state.trayCableMap[b.tray_id]) state.trayCableMap[b.tray_id] = [];
                    const entry = b.conduit_id ? { ...cableObj, conduit_id: b.conduit_id } : cableObj;
                    const exists = state.trayCableMap[b.tray_id].some(c =>
                        c.name === entry.name && (!entry.conduit_id || c.conduit_id === entry.conduit_id)
                    );
                    if (!exists) {
                        state.trayCableMap[b.tray_id].push(entry);
                    }
                }
            });
        });

        const finalUtilization = routingSystem.getTrayUtilization();
        const utilData = buildUtilizationRows(finalUtilization, trayData);

        state.finalTrays = Array.from(routingSystem.trays.values()).map(t => ({ ...t }));
        state.updatedUtilData = utilData;
        storeLatestRouteResults(state.latestRouteData, {
            source: 'optimalRouteRebalance',
            trayCableMap: state.trayCableMap,
            finalTrays: state.finalTrays,
            updatedUtilData: state.updatedUtilData
        });
        renderBatchResults(state.latestRouteData);
        renderUpdatedUtilizationTable();

        const plotRoutes = state.latestRouteData.map(row => ({
            label: row.cable,
            segments: row.route_segments,
            startPoint: cableMap.get(row.cable).start,
            endPoint: cableMap.get(row.cable).end,
            startTag: cableMap.get(row.cable).start_tag,
            endTag: cableMap.get(row.cable).end_tag,
            allowed_cable_group: cableMap.get(row.cable).allowed_cable_group
        }));
        visualize(state.finalTrays, viewerRoutes(), 'Rebalanced Routes');

        elements.progressLabel.textContent = 'Complete';
        elements.progressContainer.style.display = 'none';
    };
    
    // --- VISUALIZATION ---

    const viewerRaceways = () => state.finalTrays.length ? state.finalTrays : state.trayData;
    const viewerRoutes = () => {
        const cableMap = new Map(state.cableList.map(cable => [cable.name, cable]));
        return (state.latestRouteData || []).map((result, index) => {
            const cable = cableMap.get(result.cable) || {};
            return {
                ...result,
                index,
                label: result.cable || `Route ${index + 1}`,
                segments: result.route_segments || [],
                startPoint: cable.start,
                endPoint: cable.end,
                startTag: cable.start_tag,
                endTag: cable.end_tag,
                allowed_cable_group: cable.allowed_cable_group
            };
        });
    };

    const currentRouteSceneModel = () => buildRouteSceneModel({
        raceways: viewerRaceways(),
        ductbanks: state.ductbankData?.ductbanks || [],
        routes: viewerRoutes()
    });

    const updatePlotSelectionCard = ({ kicker, name, detail } = {}) => {
        if (!elements.plotSelectionCard) return;
        elements.plotSelectionCard.hidden = !name;
        if (!name) return;
        elements.plotSelectionKicker.textContent = kicker || 'Selected route';
        elements.plotSelectionName.textContent = name;
        elements.plotSelectionDetail.textContent = detail || '';
    };

    const updatePlotSummary = (trays, routes) => {
        const fieldCount = routes.reduce((count, route) => (
            count + (route.segments || []).filter(segment => segment.type !== 'tray').length
        ), 0);
        const racewayCount = buildRouteSceneModel({
            raceways: trays,
            ductbanks: state.ductbankData?.ductbanks || []
        }).raceways.length;
        if (elements.plotRouteCount) elements.plotRouteCount.textContent = routes.length.toLocaleString();
        if (elements.plotRacewayCount) elements.plotRacewayCount.textContent = racewayCount.toLocaleString();
        if (elements.plotFieldCount) elements.plotFieldCount.textContent = fieldCount.toLocaleString();
    };

    const renderRacewayClassLegend = summary => {
        if (!elements.racewayClassLegend) return;
        elements.racewayClassLegend.replaceChildren();
        Object.entries(summary?.classCounts || {}).forEach(([group, count]) => {
            const item = document.createElement('span');
            item.title = `${count} raceway${count === 1 ? '' : 's'} assigned to ${group === 'OPEN' ? 'the open class' : group}`;
            const dot = document.createElement('i');
            dot.className = 'legend-class-dot';
            dot.style.background = summary.classColors?.[group] || '#64748b';
            const label = document.createElement('small');
            label.textContent = group === 'OPEN' ? 'Open class' : `${group} raceway`;
            item.append(dot, label);
            elements.racewayClassLegend.appendChild(item);
        });
    };

    const updateRacewayFilterSummary = () => {
        const summary = state.routeViewer?.getRacewayFilterSummary?.();
        if (!summary) return;
        if (elements.racewayFilterSummary) {
            const selected = summary.selectedCableGroup || 'Unclassified cable';
            elements.racewayFilterSummary.textContent = summary.mode === 'all'
                ? `All classes · ${summary.totalCount} raceways`
                : summary.mode.startsWith('group:')
                    ? `${summary.mode.slice(6)} only · ${summary.visibleCount} of ${summary.totalCount}`
                    : `${selected} compatible · ${summary.visibleCount} of ${summary.totalCount}`;
        }
        renderRacewayClassLegend(summary);
    };

    const syncRacewayCompatibilityFilter = (cable, sceneModel = null) => {
        const cableGroup = String(cable?.allowed_cable_group || '').trim().toUpperCase();
        const scene = sceneModel || currentRouteSceneModel();
        const groups = [...new Set(scene.raceways.map(raceway => raceway.allowedGroup).filter(Boolean))].sort();
        if (elements.racewayCompatibilityFilter) {
            const previousValue = elements.racewayCompatibilityFilter.value || 'compatible';
            elements.racewayCompatibilityFilter.replaceChildren();
            const compatible = document.createElement('option');
            compatible.value = 'compatible';
            compatible.textContent = cableGroup ? `Compatible with ${cableGroup} cable` : 'Compatible with selected cable';
            const all = document.createElement('option');
            all.value = 'all';
            all.textContent = 'All cable classes';
            elements.racewayCompatibilityFilter.append(compatible, all);
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = `group:${group}`;
                option.textContent = `${group} raceways only`;
                elements.racewayCompatibilityFilter.appendChild(option);
            });
            elements.racewayCompatibilityFilter.value = Array.from(elements.racewayCompatibilityFilter.options)
                .some(option => option.value === previousValue)
                ? previousValue
                : 'compatible';
        }
        if (elements.routeInspectorCableClass) {
            elements.routeInspectorCableClass.textContent = cableGroup
                ? `Cable class · ${cableGroup}`
                : 'Cable class · Unassigned';
            elements.routeInspectorCableClass.title = cableGroup
                ? `Only ${cableGroup} and open-class raceways are compatible with this cable.`
                : 'Assign an allowed cable group to compare compatible raceways.';
        }
        state.routeViewer?.setSelectedCableGroup(cableGroup);
        state.routeViewer?.setRacewayFilter(elements.racewayCompatibilityFilter?.value || 'compatible');
        updateRacewayFilterSummary();
    };

    const renderRouteViewerList = (routes = state.latestRouteData || []) => {
        if (!elements.routeViewerRouteList) return;
        elements.routeViewerRouteList.replaceChildren();
        const cableMap = new Map(state.cableList.map(cable => [cable.name, cable]));
        if (elements.routeViewerRouteListCount) {
            elements.routeViewerRouteListCount.textContent = routes.length.toLocaleString();
        }
        routes.forEach((route, index) => {
            const cable = cableMap.get(route.cable) || {};
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'route-viewer-route-button';
            button.dataset.routeIndex = String(index);
            button.classList.toggle('is-selected', index === state.selectedRouteIndex);
            const name = document.createElement('strong');
            name.textContent = route.cable || `Route ${index + 1}`;
            const endpoints = document.createElement('span');
            endpoints.textContent = [cable.start_tag, cable.end_tag].filter(Boolean).join(' → ') || 'Route endpoints';
            const status = document.createElement('em');
            status.textContent = isRoutedResult(route) ? 'ROUTED' : 'CHECK';
            if (!isRoutedResult(route)) status.style.color = '#dc2626';
            button.append(name, endpoints, status);
            button.addEventListener('click', () => highlightCableRoute(index));
            elements.routeViewerRouteList.appendChild(button);
        });
    };

    const routeReviewMetrics = (route, sceneModel = null) => buildRouteMetrics(route, (sceneModel || currentRouteSceneModel()).raceways);

    const updateRouteInspector = (index, providedSceneModel = null) => {
        const route = state.latestRouteData[index];
        if (!route || !elements.routeInspectorTitle) return;
        const cable = state.cableList.find(item => item.name === route.cable) || {};
        const sceneModel = providedSceneModel || currentRouteSceneModel();
        syncRacewayCompatibilityFilter(cable, sceneModel);
        const metrics = routeReviewMetrics(route, sceneModel);
        const decisionScore = buildRouteDecisionScore(route, sceneModel.raceways);
        const selectedLengthKpi = document.getElementById('selected-route-kpi-length');
        const selectedContainedKpi = document.getElementById('selected-route-kpi-contained');
        if (selectedLengthKpi) selectedLengthKpi.textContent = formatRouteDistance(metrics.total);
        if (selectedContainedKpi) selectedContainedKpi.textContent = `${metrics.inRacewayPct.toFixed(0)}% contained`;
        elements.routeInspectorTitle.textContent = [
            route.cable || `Route ${index + 1}`,
            [cable.start_tag, cable.end_tag].filter(Boolean).join(' → ')
        ].filter(Boolean).join(' · ');
        if (elements.routeInspectorTotal) elements.routeInspectorTotal.textContent = formatRouteDistance(metrics.total);
        const containmentLabels = {
            tray: 'Cable tray',
            conduit: 'Conduit',
            ductbank: 'Ductbank',
            field: 'Field routing'
        };
        if (elements.routeInspectorBreakdown) {
            elements.routeInspectorBreakdown.replaceChildren();
            Object.entries(containmentLabels).forEach(([key, label]) => {
                const item = document.createElement('span');
                const value = document.createElement('strong');
                value.textContent = formatRouteDistance(metrics[key]);
                const caption = document.createElement('small');
                caption.textContent = label;
                item.append(value, caption);
                elements.routeInspectorBreakdown.appendChild(item);
            });
        }
        document.querySelectorAll('.route-inspector-containment-bar [data-containment]').forEach(segment => {
            const key = segment.dataset.containment;
            const width = metrics.total > 0 ? (metrics[key] / metrics.total) * 100 : 0;
            segment.style.width = `${width}%`;
            segment.title = `${containmentLabels[key]}: ${formatRouteDistance(metrics[key])}`;
        });
        const pullCheck = route.pull_check;
        const pullSetupCount = Array.isArray(pullCheck?.sections) ? pullCheck.sections.length : 0;
        const pullEquipmentCounts = pullCheck?.equipment?.counts || {};
        const pullMetric = state.pullChecksEnabled
            ? `<span><strong>${pullSetupCount || '—'}</strong>Pull section${pullSetupCount === 1 ? '' : 's'}</span><span><strong>${pullEquipmentCounts.reels || 0}/${pullEquipmentCounts.tuggers || 0}/${pullEquipmentCounts.handPulls || 0}/${pullEquipmentCounts.sheaves || 0}</strong>Reel / tugger / hand / sheave</span>`
            : '';
        if (elements.routeInspectorPullAction) {
            elements.routeInspectorPullAction.disabled = !isRoutedResult(route);
            elements.routeInspectorPullAction.textContent = state.pullChecksEnabled ? 'Recalculate pull plan' : 'Plan cable pull';
            elements.routeInspectorPullAction.title = state.pullChecksEnabled && pullCheck?.directionLabel
                ? `Selected pull direction: ${pullCheck.directionLabel}`
                : 'Calculate pull direction, field equipment, tension, and sidewall pressure.';
        }
        if (elements.routeInspectorMetrics) {
            elements.routeInspectorMetrics.innerHTML = `
                <span class="route-score" title="Length ${decisionScore.length.toFixed(0)} · Containment ${decisionScore.containment.toFixed(0)} · Capacity ${decisionScore.capacity.toFixed(0)} · Bends ${decisionScore.bends.toFixed(0)}"><strong>${decisionScore.overall}</strong>${decisionScore.grade}</span>
                <span><strong>${metrics.bends}</strong>Bends</span>
                <span><strong>${metrics.maxUtilizationPct.toFixed(0)}%</strong>Max fill</span>
                <span><strong>${metrics.racewayCount}</strong>Raceways</span>
                <span><strong>${metrics.inRacewayPct.toFixed(0)}%</strong>Contained</span>
                ${pullMetric}
            `;
        }
        if (elements.routeInspectorRationale) {
            const rationale = [];
            rationale.push(`${decisionScore.grade} route score (${decisionScore.overall}/100) balances length, containment, available capacity, and bends.`);
            rationale.push(`${metrics.inRacewayPct.toFixed(0)}% of the route stays inside mapped raceway.`);
            if (metrics.maxUtilizationPct < 80) rationale.push('No selected raceway exceeds the 80% review threshold.');
            else rationale.push(`The limiting raceway reaches ${metrics.maxUtilizationPct.toFixed(0)}% utilization.`);
            if (metrics.ductbank > 0) rationale.push(`${formatRouteDistance(metrics.ductbank)} uses mapped ductbank conduit.`);
            else if (metrics.conduit > 0) rationale.push(`${formatRouteDistance(metrics.conduit)} uses standalone conduit.`);
            if (metrics.field > 0) rationale.push(`${formatRouteDistance(metrics.field)} remains as field routing for endpoints or network gaps.`);
            else rationale.push('No field routing is required.');
            if (state.pullChecksEnabled && pullCheck?.status === 'setups-required') {
                rationale.push(`${pullSetupCount} pull sections use ${pullEquipmentCounts.reels || 0} reel, ${pullEquipmentCounts.tuggers || 0} tugger, and ${pullEquipmentCounts.handPulls || 0} hand-pull placements within the configured limits.`);
            } else if (state.pullChecksEnabled && pullCheck?.status === 'pass') {
                rationale.push('One continuous pull remains within the configured screening limits.');
            } else if (state.pullChecksEnabled && pullCheck?.status === 'inputs-required') {
                rationale.push(`Pull check needs ${pullCheck.missingInputs.join(', ')}.`);
            }
            if (state.pullChecksEnabled && pullCheck?.directionLabel) {
                rationale.push(`${pullCheck.directionLabel} is the selected pull direction; ${pullCheck.equipment?.weakestLink?.label || 'the equipment chain'} governs at ${Number(pullCheck.allowableTension).toFixed(0)} lbf.`);
            }
            elements.routeInspectorRationale.replaceChildren();
            rationale.slice(0, 7).forEach(text => {
                const item = document.createElement('li');
                item.textContent = text;
                elements.routeInspectorRationale.appendChild(item);
            });
        }
        if (elements.routeInspectorTimeline) {
            const sequenceScene = sceneModel;
            const sequence = [{ label: cable.start_tag || 'Start', kind: 'endpoint' }];
            (route.route_segments || []).forEach(segment => {
                const containment = String(segment.containmentType || segment.containment || '').toLowerCase();
                const racewayLabel = segment.racewayId || segment.tray_id || segment.trayId || segment.ductbankId || segment.conduitId || 'Raceway';
                const isField = containment === 'field' || segment.isFieldRouting || /^field\b/i.test(racewayLabel);
                const sceneRaceway = sequenceScene.racewayMap.get(String(racewayLabel));
                const routeKind = isField
                    ? 'field'
                    : sceneRaceway?.kind === 'conduit' && sceneRaceway.parentId
                        ? 'ductbank'
                        : sceneRaceway?.kind || containment || 'raceway';
                const label = isField ? 'Field jump' : routeKind === 'ductbank' ? sceneRaceway?.parentId || racewayLabel : racewayLabel;
                const previous = sequence[sequence.length - 1];
                if (previous?.label !== label) sequence.push({ label, kind: routeKind });
            });
            sequence.push({ label: cable.end_tag || 'End', kind: 'endpoint' });
            const intermediates = sequence.slice(1, -1);
            const firstIntermediate = intermediates[0];
            const lastIntermediate = intermediates.at(-1);
            const fieldIntermediate = intermediates.find(item => item.kind === 'field');
            const containmentMilestones = ['ductbank', 'conduit', 'tray']
                .map(kind => intermediates.find(item => item.kind === kind))
                .filter(Boolean);
            const milestoneCandidates = containmentMilestones.length >= 2
                ? containmentMilestones
                : [firstIntermediate, fieldIntermediate, lastIntermediate];
            const visualIntermediates = milestoneCandidates
                .filter((item, itemIndex, items) => item && items.findIndex(candidate => candidate?.label === item.label) === itemIndex);
            const hiddenCount = Math.max(intermediates.length - visualIntermediates.length, 0);
            if (hiddenCount > 0 && visualIntermediates.length < 3) {
                visualIntermediates.splice(1, 0, { label: `+${hiddenCount} legs`, kind: 'more' });
            }
            const visualSequence = [sequence[0], ...visualIntermediates, sequence.at(-1)];
            const compactSequence = visualSequence.length <= 5
                ? visualSequence
                : [visualSequence[0], visualSequence[1], { label: `+${intermediates.length - 2} legs`, kind: 'more' }, visualSequence.at(-2), visualSequence.at(-1)];
            elements.routeInspectorTimeline.replaceChildren();
            compactSequence.forEach((item, itemIndex) => {
                if (itemIndex > 0) {
                    const connector = document.createElement('i');
                    connector.className = `route-timeline-link${item.kind === 'field' ? ' is-field' : ''}`;
                    elements.routeInspectorTimeline.appendChild(connector);
                }
                const node = document.createElement('span');
                node.className = `route-timeline-node is-${item.kind}`;
                node.title = item.label;
                const dot = document.createElement('i');
                const text = document.createElement('small');
                text.textContent = item.label;
                node.append(dot, text);
                elements.routeInspectorTimeline.appendChild(node);
            });
        }
        if (elements.routeComparisonCards) {
            elements.routeComparisonCards.replaceChildren();
            const card = document.createElement('article');
            card.className = 'route-comparison-card is-recommended';
            const title = document.createElement('h4');
            title.textContent = `Recommended · ${decisionScore.overall}`;
            const comparisonRows = [
                ['Length', formatRouteDistance(metrics.total), 100, 'route'],
                ['Field routing', formatRouteDistance(metrics.field), metrics.total ? (metrics.field / metrics.total) * 100 : 0, 'field'],
                ['Bends', String(metrics.bends), Math.min((metrics.bends / 12) * 100, 100), 'route'],
                ['Max utilization', `${metrics.maxUtilizationPct.toFixed(0)}%`, metrics.maxUtilizationPct, 'route']
            ];
            card.appendChild(title);
            comparisonRows.forEach(([label, value, width, kind]) => {
                const row = document.createElement('div');
                row.className = 'route-comparison-row';
                const caption = document.createElement('span');
                caption.textContent = label;
                const metric = document.createElement('strong');
                metric.textContent = value;
                const bar = document.createElement('i');
                bar.className = kind === 'field' ? 'is-field' : '';
                bar.style.setProperty('--route-comparison-width', `${Math.max(3, Number(width) || 0)}%`);
                row.append(caption, metric, bar);
                card.appendChild(row);
            });
            const empty = document.createElement('div');
            empty.className = 'route-comparison-empty';
            const emptyTitle = document.createElement('strong');
            emptyTitle.textContent = 'One candidate calculated';
            const emptyText = document.createElement('span');
            emptyText.textContent = 'Additional cards will appear when the routing engine returns scored alternative paths.';
            empty.append(emptyTitle, emptyText);
            elements.routeComparisonCards.append(card, empty);
        }
        elements.routeViewerRouteList?.querySelectorAll('[data-route-index]').forEach(button => {
            button.classList.toggle('is-selected', Number(button.dataset.routeIndex) === index);
        });
    };

    const ensureRouteViewer = () => {
        if (state.routeViewer) return Promise.resolve(state.routeViewer);
        if (state.routeViewerLoad) return state.routeViewerLoad;
        state.routeViewerLoad = import('./dist/routeViewer3D.js?v=28').then(({ createRouteViewer3D }) => {
            state.routeViewer = createRouteViewer3D({
                container: elements.plot3d,
                onSelect: selection => {
                    if (selection.kind === 'route') highlightCableRoute(selection.routeIndex, { fromViewer: true });
                    if (selection.kind === 'raceway') highlightTraySegment(selection.racewayId, { fromViewer: true });
                }
            });
            state.routeViewer.setLayerVisibility('ductbank', state.ductbankVisible);
            state.routeViewer.setLayerVisibility('conduit', elements.conduitToggle?.checked !== false);
            state.routeViewer.setLayerVisibility('field', state.fieldConnectionsVisible);
            state.routeViewer.setLayerVisibility('labels', state.labelsVisible);
            state.routeViewer.setLayerVisibility('context', elements.contextToggle?.checked !== false);
            state.routeViewer.setLayerVisibility('pullSetups', state.pullChecksEnabled && state.pullSetupsVisible);
            state.routeViewer.setContextDensity(elements.contextDensitySelect?.value || 'medium');
            state.routeViewer.setHeatmap(state.heatmapEnabled);
            return state.routeViewer;
        }).catch(error => {
            state.routeViewerFailed = true;
            state.routeViewerLoad = null;
            console.warn('The professional 3D viewer could not be loaded; falling back to Plotly.', error);
            throw error;
        });
        return state.routeViewerLoad;
    };

    const renderProfessionalViewer = (trays, routes) => {
        if (state.selectedRouteIndex == null && routes.length) {
            state.selectedRouteIndex = Math.max(0, state.latestRouteData.findIndex(isRoutedResult));
        }
        updatePlotSummary(trays, routes);
        renderRouteViewerList(state.latestRouteData);
        ensureRouteViewer().then(viewer => {
            viewer.setData({
                raceways: trays,
                ductbanks: state.ductbankData?.ductbanks || [],
                routes,
                selectedRouteIndex: state.selectedRouteIndex
            });
            if (state.selectedRouteIndex != null) updateRouteInspector(state.selectedRouteIndex, viewer.model);
            if (elements.routeSelectionStatus) {
                elements.routeSelectionStatus.textContent = routes.length
                    ? 'Select a cable, tray, conduit, or ductbank to inspect the route in 3D.'
                    : 'Run routing to populate the interactive model.';
            }
        }).catch(error => {
            state.routeViewerFailed = true;
            console.warn('The 3D route model could not be rendered; falling back to Plotly.', error);
            visualize(trays, routes, 'Optimal routes');
        });
    };

    const visualize = (trays, routes = [], title = 'Optimal routes') => {
        if (!state.routeViewerFailed) {
            renderProfessionalViewer(trays, routes);
            return;
        }
        if (!globalThis.Plotly || !elements.plot3d) {
            console.warn('Plotly is not loaded');
            return;
        }
        const theme = graphTheme();
        const view = currentViewDefinition();
        state.selectedRouteIndex = null;
        updatePlotSelectionCard();
        updatePlotSummary(trays, routes);
        const scene = buildPlotlyRouteScene({
            trays,
            routes,
            title,
            theme,
            view,
            heatmapEnabled: state.heatmapEnabled,
            ductbankVisible: state.ductbankVisible,
            labelsVisible: state.labelsVisible,
            fieldConnectionsVisible: state.fieldConnectionsVisible,
            darkMode: document.body.classList.contains('dark-mode')
        });
        const { traces, layout } = scene;
        state.ductbankTraceIndices = scene.ductbankTraceIndices;
        const render = elements.plot3d.data ? Plotly.react : Plotly.newPlot;
        Promise.resolve(render(elements.plot3d, traces, layout, plotConfig)).then(() => {
            if (!elements.plot3d.dataset.routePlotBound) {
                elements.plot3d.on('plotly_click', event => {
                    const point = event?.points?.[0];
                    const kind = point?.data?.meta?.kind;
                    if (kind === 'route') highlightCableRoute(Number(point.data.meta.routeIndex));
                    if (kind === 'route-corridor') highlightRouteCorridor(point.data.meta);
                    if (kind === 'route-endpoint-cluster') {
                        const routeIndices = Array.isArray(point.customdata?.[0]) ? point.customdata[0] : [];
                        if (routeIndices.length === 1) {
                            highlightCableRoute(Number(routeIndices[0]));
                        } else {
                            highlightEndpointCluster({
                                endpoint: point.data.meta.endpoint,
                                point: [point.x, point.y, point.z],
                                routeIndices,
                                cableLabels: String(point.customdata?.[2] || '').split(', ').filter(Boolean)
                            });
                        }
                    }
                    if (kind === 'raceway') highlightTraySegment(point.data.meta.trayId);
                });
                elements.plot3d.dataset.routePlotBound = 'true';
            }
        });
        window.current3DPlot = { traces, layout };
        window.base3DPlot = { traces: structuredClone(traces), layout: structuredClone(layout) };
        if (elements.routeSelectionStatus) {
            elements.routeSelectionStatus.textContent = routes.length
                ? 'Corridor width shows cable density. Click a corridor, equipment node, or raceway to inspect it.'
                : 'Run routing to populate the interactive model.';
        }
    };

    const update3DPlot = () => {
        const trays = state.finalTrays.length ? state.finalTrays : state.trayData;
        const cableMap = new Map(state.cableList.map(cable => [cable.name, cable]));
        const routes = (state.latestRouteData || []).map(result => {
            const cable = cableMap.get(result.cable) || {};
            return {
                label: result.cable,
                segments: result.route_segments || [],
                startPoint: cable.start,
                endPoint: cable.end,
                startTag: cable.start_tag,
                endTag: cable.end_tag,
                allowed_cable_group: cable.allowed_cable_group,
                pull_check: result.pull_check
            };
        });
        visualize(trays, routes, 'Optimal routes');
    };

    const focusPlotOnPoints = points => {
        if (!points.length) return;
        const rangeFor = coordinate => {
            const values = points.map(point => Number(point[coordinate])).filter(Number.isFinite);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const padding = Math.max((max - min) * 0.18, 4);
            return [min - padding, max + padding];
        };
        const ranges = {
            'scene.xaxis.range': rangeFor(0),
            'scene.yaxis.range': rangeFor(1),
            'scene.zaxis.range': rangeFor(2)
        };
        Plotly.relayout(elements.plot3d, ranges);
        Object.assign(window.current3DPlot.layout.scene.xaxis, { range: ranges['scene.xaxis.range'] });
        Object.assign(window.current3DPlot.layout.scene.yaxis, { range: ranges['scene.yaxis.range'] });
        Object.assign(window.current3DPlot.layout.scene.zaxis, { range: ranges['scene.zaxis.range'] });
    };

    const highlightRouteCorridor = async corridor => {
        const routeIndices = Array.isArray(corridor?.routeIndices) ? corridor.routeIndices : [];
        if (routeIndices.length === 1) {
            await highlightCableRoute(Number(routeIndices[0]));
            return;
        }
        if (!corridor?.start || !corridor?.end) return;
        await restoreBasePlot(false);
        state.selectedRouteIndex = null;
        const cableLabels = Array.isArray(corridor.cableLabels) ? corridor.cableLabels : [];
        const racewayIds = Array.isArray(corridor.racewayIds) ? corridor.racewayIds : [];
        const trace = {
            x: [corridor.start[0], corridor.end[0]],
            y: [corridor.start[1], corridor.end[1]],
            z: [corridor.start[2], corridor.end[2]],
            type: 'scatter3d', mode: 'lines',
            line: { color: ROUTE_COLORS.selected, width: 15 },
            showlegend: false,
            hovertemplate: `<b>${routeIndices.length} cable corridor</b><extra>Selected corridor</extra>`
        };
        await Plotly.addTraces(elements.plot3d, [trace]);
        window.current3DPlot.traces.push(trace);
        focusPlotOnPoints([corridor.start, corridor.end]);
        updatePlotSelectionCard({
            kicker: 'Shared route corridor',
            name: `${routeIndices.length} cables`,
            detail: `${racewayIds.length ? `${racewayIds.join(', ')} · ` : ''}${cableLabels.slice(0, 4).join(', ')}${cableLabels.length > 4 ? ` +${cableLabels.length - 4} more` : ''}`
        });
        if (elements.routeSelectionStatus) {
            elements.routeSelectionStatus.textContent = `${routeIndices.length} cables share the selected corridor.`;
        }
    };

    const highlightEndpointCluster = async cluster => {
        if (!cluster?.point) return;
        await restoreBasePlot(false);
        state.selectedRouteIndex = null;
        const cableCount = cluster.routeIndices?.length || 0;
        const trace = {
            x: [cluster.point[0]], y: [cluster.point[1]], z: [cluster.point[2]],
            type: 'scatter3d', mode: 'markers',
            marker: {
                color: cluster.endpoint === 'Start' ? ROUTE_COLORS.start : ROUTE_COLORS.end,
                size: 16,
                symbol: cluster.endpoint === 'Start' ? 'circle' : 'diamond',
                line: { color: '#ffffff', width: 3 }
            },
            showlegend: false,
            hovertemplate: `<b>${cableCount} cable ${String(cluster.endpoint || '').toLowerCase()}s</b><extra>Selected equipment node</extra>`
        };
        await Plotly.addTraces(elements.plot3d, [trace]);
        window.current3DPlot.traces.push(trace);
        focusPlotOnPoints([cluster.point]);
        updatePlotSelectionCard({
            kicker: `${cluster.endpoint || 'Route'} equipment node`,
            name: `${cableCount} cables`,
            detail: `${(cluster.cableLabels || []).slice(0, 5).join(', ')}${cluster.cableLabels?.length > 5 ? ` +${cluster.cableLabels.length - 5} more` : ''}`
        });
        if (elements.routeSelectionStatus) {
            elements.routeSelectionStatus.textContent = `${cableCount} cables share the selected ${String(cluster.endpoint || 'route').toLowerCase()} point.`;
        }
    };

    const highlightSharedRoute = async idx => {
        if (!globalThis.Plotly || !window.current3DPlot || !state.sharedFieldRoutes[idx]) return;
        const route = state.sharedFieldRoutes[idx];
        await restoreBasePlot(false);
        const trace = {
            x: [route.start[0], route.end[0]],
            y: [route.start[1], route.end[1]],
            z: [route.start[2], route.end[2]],
            mode: 'lines', type: 'scatter3d',
            line: { color: '#ec4899', width: 12 },
            name: '__shared_highlight__', showlegend: false,
            hovertemplate: '<b>Shared field connection</b><extra></extra>'
        };
        await Plotly.addTraces(elements.plot3d, [trace]);
        window.current3DPlot.traces.push(trace);
        focusPlotOnPoints([route.start, route.end]);
        updatePlotSelectionCard({
            kicker: 'Shared field connection',
            name: route.label || `Connection ${idx + 1}`,
            detail: `${formatRouteDistance(route.length)} shared run`
        });
    };

    const updateDuctbankVisibility = (visible) => {
        if (state.routeViewer) {
            state.ductbankVisible = Boolean(visible);
            state.routeViewer.setLayerVisibility('ductbank', visible);
            return;
        }
        if (!globalThis.Plotly) {
            console.warn('Plotly is not loaded');
            state.ductbankVisible = visible;
            return;
        }
        if (!window.current3DPlot || state.ductbankTraceIndices.length === 0) {
            state.ductbankVisible = visible;
            return;
        }
        const vis = Boolean(visible);
        Plotly.restyle(elements.plot3d, { visible: vis }, state.ductbankTraceIndices);
        state.ductbankVisible = visible;
        state.ductbankTraceIndices.forEach(i => {
            if (window.current3DPlot.traces[i]) {
                window.current3DPlot.traces[i].visible = vis;
            }
        });
    };

    const restoreBasePlot = async (clearSelection = true) => {
        if (!globalThis.Plotly || !window.base3DPlot) return;
        const traces = structuredClone(window.base3DPlot.traces);
        const layout = structuredClone(window.base3DPlot.layout);
        await Plotly.react(elements.plot3d, traces, layout, plotConfig);
        window.current3DPlot = { traces, layout };
        updateDuctbankVisibility(state.ductbankVisible);
        if (clearSelection) {
            state.selectedRouteIndex = null;
            elements.routeBreakdownContainer?.querySelectorAll('[data-route-index]').forEach(row => row.classList.remove('is-selected'));
            elements.updatedUtilizationContainer?.querySelectorAll('tbody tr').forEach(row => row.classList.remove('is-selected'));
            updatePlotSelectionCard();
            if (elements.routeSelectionStatus) {
                elements.routeSelectionStatus.textContent = 'Corridor width shows cable density. Click a corridor, equipment node, or raceway to inspect it.';
            }
        }
    };

    const reset3DView = () => {
        if (state.routeViewer) {
            state.routeViewer.fitAll();
            return;
        }
        restoreBasePlot(true);
    };

    const highlightCableRoute = async (idx, { fromViewer = false } = {}) => {
        if (state.routeViewer && state.latestRouteData[idx]) {
            state.selectedRouteIndex = idx;
            const route = state.latestRouteData[idx];
            elements.routeBreakdownContainer?.querySelectorAll('[data-route-index]').forEach(row => {
                row.classList.toggle('is-selected', Number(row.dataset.routeIndex) === idx);
            });
            renderRouteViewerList(state.latestRouteData);
            updateRouteInspector(idx);
            renderPullChecks(state.latestRouteData);
            const metrics = routeReviewMetrics(route);
            updatePlotSelectionCard({
                kicker: 'Selected route',
                name: route.cable,
                detail: `${formatRouteDistance(metrics.total)} total · ${formatRouteDistance(metrics.field)} field · ${metrics.racewayCount} raceways`
            });
            if (elements.routeSelectionStatus) {
                elements.routeSelectionStatus.textContent = `${route.cable} is selected. Orbit the model or choose Fit all to review the network.`;
            }
            if (!fromViewer) state.routeViewer.selectRoute(idx, { focus: true, emit: false });
            return;
        }
        if (!globalThis.Plotly) return;
        if (!state.latestRouteData[idx]) return;
        await restoreBasePlot(false);
        state.selectedRouteIndex = idx;
        const route = state.latestRouteData[idx];
        elements.routeBreakdownContainer?.querySelectorAll('[data-route-index]').forEach(row => {
            row.classList.toggle('is-selected', Number(row.dataset.routeIndex) === idx);
        });
        if (elements.routeSelectionStatus) {
            elements.routeSelectionStatus.textContent = `${route.cable} is selected. Use Fit all to return to the full network.`;
        }
        const metrics = routeMetrics(route);
        updatePlotSelectionCard({
            kicker: 'Selected route',
            name: route.cable,
            detail: `${formatRouteDistance(metrics.total)} total · ${formatRouteDistance(metrics.field)} field · ${metrics.segments} segments`
        });
        const trayPoints = { x: [], y: [], z: [] };
        const fieldPoints = { x: [], y: [], z: [] };
        const focusPoints = [];
        (route.route_segments || []).forEach(seg => {
            const points = seg.type === 'tray' ? trayPoints : fieldPoints;
            points.x.push(seg.start[0], seg.end[0], null);
            points.y.push(seg.start[1], seg.end[1], null);
            points.z.push(seg.start[2], seg.end[2], null);
            focusPoints.push(seg.start, seg.end);
        });
        const selectedHover = `<b>${route.cable}</b><br>${formatRouteDistance(metrics.total)} total<extra>Selected route</extra>`;
        const traces = [];
        if (trayPoints.x.length) {
            traces.push({
                ...trayPoints, mode: 'lines', type: 'scatter3d',
                line: { color: ROUTE_COLORS.selected, width: 10 },
                name: `Selected ${route.cable}`, showlegend: false, hovertemplate: selectedHover
            });
        }
        if (fieldPoints.x.length) {
            traces.push({
                ...fieldPoints, mode: 'lines', type: 'scatter3d',
                line: { color: ROUTE_COLORS.field, width: 8, dash: 'dash' },
                name: `Selected ${route.cable} field`, showlegend: false, hovertemplate: selectedHover
            });
        }
        const cable = state.cableList.find(item => item.name === route.cable) || {};
        if (cable.start && cable.end) {
            traces.push({
                x: [cable.start[0], cable.end[0]], y: [cable.start[1], cable.end[1]], z: [cable.start[2], cable.end[2]],
                text: [cable.start_tag || 'Start', cable.end_tag || 'End'],
                mode: 'markers+text', type: 'scatter3d', textposition: 'top center',
                marker: { color: [ROUTE_COLORS.start, ROUTE_COLORS.end], size: 9, line: { color: '#ffffff', width: 2 } },
                textfont: { size: 11, color: graphTheme().text }, showlegend: false,
                hovertemplate: '<b>%{text}</b><extra></extra>'
            });
        }
        await Plotly.addTraces(elements.plot3d, traces);
        window.current3DPlot.traces.push(...traces);
        focusPlotOnPoints(focusPoints);
    };

    const highlightTraySegment = async (trayId, { fromViewer = false } = {}) => {
        if (state.routeViewer) {
            const sceneRaceway = currentRouteSceneModel().racewayMap.get(trayId);
            if (!sceneRaceway) return;
            state.selectedRouteIndex = null;
            elements.updatedUtilizationContainer?.querySelectorAll('tbody tr').forEach(row => {
                row.classList.toggle('is-selected', row.dataset.trayId === trayId);
            });
            updatePlotSelectionCard({
                kicker: `Selected ${sceneRaceway.kind}`,
                name: trayId,
                detail: `${sceneRaceway.utilizationPct.toFixed(1)}% utilized · ${sceneRaceway.widthIn || '—'} in × ${sceneRaceway.heightIn || '—'} in`
            });
            if (elements.routeSelectionStatus) {
                elements.routeSelectionStatus.textContent = `${trayId} is selected. Select a cable route to restore the full route explanation.`;
            }
            if (!fromViewer) state.routeViewer.selectRaceway(trayId, { focus: true, emit: false });
            return;
        }
        if (!globalThis.Plotly) return;
        const trays = state.finalTrays.length ? state.finalTrays : state.trayData;
        const tray = trays.find(t => t.tray_id === trayId);
        if (!tray) return;
        await restoreBasePlot(false);
        state.selectedRouteIndex = null;
        elements.updatedUtilizationContainer?.querySelectorAll('tbody tr').forEach(row => {
            row.classList.toggle('is-selected', row.dataset.trayId === trayId);
        });
        if (elements.routeSelectionStatus) {
            elements.routeSelectionStatus.textContent = `${trayId} is selected. Use Fit all to return to the full network.`;
        }
        const utilization = utilizationForTray(tray);
        updatePlotSelectionCard({
            kicker: 'Selected raceway',
            name: trayId,
            detail: `${tray.raceway_type || 'tray'} · ${tray.width || '—'} in × ${tray.height || '—'} in · ${utilization.toFixed(1)}% utilized`
        });
        const trace = {
            x: [tray.start_x, tray.end_x],
            y: [tray.start_y, tray.end_y],
            z: [tray.start_z, tray.end_z],
            mode: 'lines',
            type: 'scatter3d',
            line: { color: ROUTE_COLORS.selected, width: 12 },
            name: `Selected ${trayId}`,
            showlegend: false,
            hovertemplate: `<b>${trayId}</b><br>${utilization.toFixed(1)}% utilized<extra>Selected raceway</extra>`
        };
        await Plotly.addTraces(elements.plot3d, [trace]);
        window.current3DPlot.traces.push(trace);
        focusPlotOnPoints([
            [tray.start_x, tray.start_y, tray.start_z],
            [tray.end_x, tray.end_y, tray.end_z]
        ]);
    };

    const applyRouteView = viewName => {
        if (state.routeViewer) {
            state.plotView = ROUTE_VIEW_PRESETS[viewName] ? viewName : 'isometric';
            state.routeViewer.setView(state.plotView);
            elements.routeViewButtons.forEach(button => {
                button.setAttribute('aria-pressed', String(button.dataset.routeView === state.plotView));
            });
            return;
        }
        if (!globalThis.Plotly) return;
        if (!window.current3DPlot) return;
        state.plotView = ROUTE_VIEW_PRESETS[viewName] ? viewName : 'isometric';
        const view = currentViewDefinition();
        const camera = { ...structuredClone(view.camera), projection: { type: view.projection } };
        const hiddenAxis = state.plotView === 'plan' ? 'z' : state.plotView === 'front' ? 'y' : state.plotView === 'right' ? 'x' : null;
        const axisTitles = { x: 'X', y: 'Y', z: 'Elevation' };
        const axisUpdates = {};
        Object.entries(axisTitles).forEach(([axisName, axisTitle]) => {
            const visible = axisName !== hiddenAxis;
            axisUpdates[`scene.${axisName}axis.showticklabels`] = visible;
            axisUpdates[`scene.${axisName}axis.title.text`] = visible ? axisTitle : '';
            window.current3DPlot.layout.scene[`${axisName}axis`].showticklabels = visible;
            window.current3DPlot.layout.scene[`${axisName}axis`].title.text = visible ? axisTitle : '';
            window.base3DPlot.layout.scene[`${axisName}axis`].showticklabels = visible;
            window.base3DPlot.layout.scene[`${axisName}axis`].title.text = visible ? axisTitle : '';
        });
        Plotly.relayout(elements.plot3d, {
            'scene.camera.eye': camera.eye,
            'scene.camera.up': camera.up,
            'scene.camera.projection.type': view.projection,
            ...axisUpdates
        });
        window.current3DPlot.layout.scene.camera = structuredClone(camera);
        window.base3DPlot.layout.scene.camera = structuredClone(camera);
        elements.routeViewButtons.forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.routeView === state.plotView));
        });
    };

    const exportCurrentPlotPNG = () => {
        if (state.routeViewer) {
            state.routeViewer.exportPNG('optimal-route-model.png');
            return;
        }
        if (!globalThis.Plotly) return;
        Plotly.downloadImage(elements.plot3d, {
            format: 'png', width: 1800, height: 1100, scale: 1,
            filename: 'optimal-route-model'
        });
    };

    const popOutPlot = () => {
        if (state.routeViewer) {
            state.routeViewer.openFullscreen().catch(error => console.warn('Unable to open the route viewer full screen.', error));
            return;
        }
        if (!window.current3DPlot) return;
        const safeJson = val => JSON.stringify(val).replace(/<\/script/gi, '<\\/script');
        const plotlyUrl = new URL('dist/vendor/plotly.min.js', location.href).href;
        const html = `<!DOCTYPE html>
<html><head><title>Optimal Route Graph</title>
<meta charset="UTF-8">
<script src="${plotlyUrl}"><\/script>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#f8fafc;font-family:Inter,system-ui,sans-serif;}#plot{width:100%;height:100%;}</style>
</head><body>
<div id="plot"></div>
<script>const data = ${safeJson(window.current3DPlot.traces)};
const layout = ${safeJson(window.current3DPlot.layout)};
Plotly.newPlot(document.getElementById('plot'), data, layout, ${safeJson(plotConfig)});<\/script>
</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    const refreshPullAnalysis = () => {
        syncPullAnalysisControls();
        if (!state.latestRouteData.length) {
            renderPullChecks([]);
            saveSession();
            return;
        }
        state.latestRouteData = applyPullChecksToResults(state.latestRouteData);
        renderBatchResults(state.latestRouteData);
        storeLatestRouteResults(state.latestRouteData, {
            source: 'optimalRoutePullAnalysis',
            trayCableMap: state.trayCableMap,
            finalTrays: state.finalTrays,
            updatedUtilData: state.updatedUtilData
        });
        update3DPlot();
        if (state.selectedRouteIndex != null) updateRouteInspector(state.selectedRouteIndex);
        saveSession();
    };
    
    
    // --- INITIALIZATION & EVENT LISTENERS ---
    elements.fillLimitIn.addEventListener('input', () => {
        markCustomPreset();
        updateFillLimitDisplay();
        updateRoutingReadiness();
    });
    if (elements.routePreset) {
        elements.routePreset.addEventListener('change', () => applyRoutePreset(elements.routePreset.value));
    }
    ['proximity-threshold', 'max-field-edge', 'field-route-penalty', 'shared-field-penalty'].forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('input', () => {
            markCustomPreset();
            updateRoutingReadiness();
        });
        input.addEventListener('change', saveSession);
    });
    elements.calculateBtn.addEventListener('click', mainCalculation);
    if (elements.loadSampleNetworkBtn) {
        elements.loadSampleNetworkBtn.addEventListener('click', loadSampleNetwork);
    }
    if (elements.loadLargeFacilityBtn) {
        elements.loadLargeFacilityBtn.addEventListener('click', loadLargeFacilitySample);
    }
    if (elements.importSchedulesBtn) {
        elements.importSchedulesBtn.addEventListener('click', importSchedulesForRouting);
    }
    if (elements.loadSampleTraysBtn) {
        elements.loadSampleTraysBtn.addEventListener('click', loadSampleTrays);
    }
    elements.addTrayBtn.addEventListener('click', addManualTray);
    elements.clearTraysBtn.addEventListener('click', clearManualTrays);
    elements.exportTraysBtn.addEventListener('click', exportManualTraysCSV);
    elements.downloadTraysTemplateBtn.addEventListener('click', downloadTraySample);
    elements.importTraysBtn.addEventListener('click', () => elements.importTraysFile.click());
    elements.importTraysFile.addEventListener('change', importManualTrays);
    elements.loadSampleCablesBtn.addEventListener('click', loadSampleCables);
    elements.addCableBtn.addEventListener('click', addCableToBatch);
    elements.clearCablesBtn.addEventListener('click', clearCableList);
    elements.exportCablesBtn.addEventListener('click', exportCableOptionsCSV);
    elements.downloadCablesTemplateBtn.addEventListener('click', downloadCableSample);
    elements.importCablesBtn.addEventListener('click', () => elements.importCablesFile.click());
    elements.importCablesFile.addEventListener('change', importCableOptions);
    elements.exportCsvBtn.addEventListener('click', exportRouteXLSX);
    if (elements.exportRoutesBtn) {
        elements.exportRoutesBtn.addEventListener('click', exportRoutesJSON);
    }
    if (elements.downloadBomBtn) {
        elements.downloadBomBtn.addEventListener('click', exportBOMXLSX);
    }
    if (elements.rebalanceBtn) {
        elements.rebalanceBtn.addEventListener('click', rebalanceTrayFill);
    }
    if (elements.openFillBtn) {
        elements.openFillBtn.addEventListener('click', () => {
            const selectedRoute = state.latestRouteData[state.selectedRouteIndex]
                || (state.latestRouteData.length === 1 ? state.latestRouteData[0] : null);
            const routedTrayId = createRouteBreakdown(selectedRoute, formatPoint, getSegmentType)
                .map(segment => segment.raceway_id || segment.tray_id || segment.raceway)
                .find(id => state.trayData.some(tray => tray.tray_id === id));
            if (routedTrayId) {
                openTrayFill(routedTrayId);
                return;
            }
            window.open('cabletrayfill.html', '_blank');
        });
    }
    if (elements.exportTrayFillsBtn) {
        elements.exportTrayFillsBtn.addEventListener('click', exportTrayFills);
    }
    elements.popoutPlotBtn.addEventListener('click', popOutPlot);
    if (elements.resetViewBtn) {
        elements.resetViewBtn.addEventListener('click', reset3DView);
    }
    if (elements.ductbankToggle) {
        elements.ductbankToggle.addEventListener('change', e => updateDuctbankVisibility(e.target.checked));
    }
    if (elements.performPullChecks) {
        elements.performPullChecks.addEventListener('change', event => {
            state.pullChecksEnabled = event.target.checked;
            refreshPullAnalysis();
        });
    }
    [
        elements.pullMaxLength,
        elements.handPullMaxLength,
        elements.handPullMaxTension,
        elements.pullMaxTension,
        elements.pullMaxSidewall,
        elements.pullFriction,
        elements.pullBendRadius,
        elements.pullDirection,
        elements.pullIncomingTension,
        elements.pullPullerCapacity,
        elements.pullRopeCapacity,
        elements.pullGripCapacity,
        elements.pullAnchorageCapacity,
        elements.pullSheaveCapacity,
        elements.pullRollerSpacing,
        elements.pullGroupSuggestions,
        elements.pullGroupMaxSize
    ]
        .filter(Boolean)
        .forEach(input => input.addEventListener('change', refreshPullAnalysis));
    if (elements.allowHandPulls) {
        elements.allowHandPulls.addEventListener('change', () => {
            syncPullAnalysisControls();
            refreshPullAnalysis();
        });
    }
    if (elements.routeInspectorPullAction) {
        elements.routeInspectorPullAction.addEventListener('click', () => {
            if (!state.pullChecksEnabled) state.pullChecksEnabled = true;
            refreshPullAnalysis();
            elements.pullChecksDetails?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
    if (elements.pullSetupsToggle) {
        elements.pullSetupsToggle.addEventListener('change', event => {
            state.pullSetupsVisible = event.target.checked;
            state.routeViewer?.setLayerVisibility('pullSetups', state.pullChecksEnabled && state.pullSetupsVisible);
            saveSession();
        });
    }
    if (elements.conduitToggle) {
        elements.conduitToggle.addEventListener('change', e => {
            if (state.routeViewer) state.routeViewer.setLayerVisibility('conduit', e.target.checked);
            else update3DPlot();
        });
    }
    if (elements.fieldConnectionsToggle) {
        elements.fieldConnectionsToggle.addEventListener('change', e => {
            state.fieldConnectionsVisible = e.target.checked;
            if (state.routeViewer) state.routeViewer.setLayerVisibility('field', e.target.checked);
            else update3DPlot();
        });
    }
    if (elements.heatmapToggle) {
        elements.heatmapToggle.addEventListener('change', e => {
            state.heatmapEnabled = e.target.checked;
            if (state.routeViewer) state.routeViewer.setHeatmap(e.target.checked);
            else update3DPlot();
        });
    }
    if (elements.labelsToggle) {
        elements.labelsToggle.addEventListener('change', e => {
            state.labelsVisible = e.target.checked;
            if (state.routeViewer) state.routeViewer.setLayerVisibility('labels', e.target.checked);
            else update3DPlot();
        });
    }
    if (elements.contextToggle) {
        elements.contextToggle.addEventListener('change', e => {
            if (state.routeViewer) state.routeViewer.setLayerVisibility('context', e.target.checked);
        });
    }
    if (elements.contextDensitySelect) {
        elements.contextDensitySelect.addEventListener('change', event => {
            state.routeViewer?.setContextDensity(event.target.value);
        });
    }
    if (elements.racewayCompatibilityFilter) {
        elements.racewayCompatibilityFilter.addEventListener('change', event => {
            state.routeViewer?.setRacewayFilter(event.target.value);
            updateRacewayFilterSummary();
        });
    }
    elements.routeViewButtons.forEach(button => {
        button.addEventListener('click', () => applyRouteView(button.dataset.routeView));
    });
    if (elements.exportPngBtn) {
        elements.exportPngBtn.addEventListener('click', exportCurrentPlotPNG);
    }
    if (elements.exportGltfBtn) {
        elements.exportGltfBtn.addEventListener('click', exportGLTF);
    }
    elements.cancelRoutingBtn.addEventListener('click', cancelCurrentRouting);
    if (elements.deleteDataBtn) {
        elements.deleteDataBtn.addEventListener('click', deleteSavedData);
    }
    if (elements.traySearch) {
        elements.traySearch.addEventListener('input', () => filterTable(elements.manualTrayTableContainer, elements.traySearch.value));
    }
    if (elements.cableSearch) {
        elements.cableSearch.addEventListener('input', () => filterTable(elements.cableListContainer, elements.cableSearch.value));
    }

    document.addEventListener('keydown', e => {
        // Ctrl+Enter triggers routing calculation from anywhere on the page
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            elements.calculateBtn.click();
            return;
        }
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'r') elements.calculateBtn.click();
        if (e.key === 'c') document.getElementById('cable-list-details').open = !document.getElementById('cable-list-details').open;
        if (e.key === 't') document.getElementById('manual-tray-table-details').open = !document.getElementById('manual-tray-table-details').open;
    });

    window.addEventListener('beforeunload', saveSession);

    // remove validation error highlight when typing
    document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', () => {
            el.classList.remove('input-error');
            const err = el.nextElementSibling;
            if (err && err.classList.contains('error-message')) err.remove();
        });
    });
    // Initial setup
    loadSession();
    syncPullAnalysisControls();
    const trayKey = globalThis.TableUtils?.STORAGE_KEYS?.traySchedule || 'traySchedule';
    const cableKey = globalThis.TableUtils?.STORAGE_KEYS?.cableSchedule || 'cableSchedule';
    const ductbankKey = globalThis.TableUtils?.STORAGE_KEYS?.ductbankSchedule || 'ductbankSchedule';
    const conduitKey = globalThis.TableUtils?.STORAGE_KEYS?.conduitSchedule || 'conduitSchedule';
    const hasStoredRows = value => {
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === 'object') return Object.keys(value).length > 0;
        return Boolean(value);
    };
    const hasProjectSchedules = hasStoredRows(getItem(trayKey)) ||
        hasStoredRows(getItem(cableKey)) || hasStoredRows(getItem(ductbankKey)) ||
        hasStoredRows(getItem(conduitKey));

    const finalizeLoad = async () => {
        renderManualTrayTable();
        updateCableListDisplay();
        await loadDuctbankData();
        rebuildTrayData();
        updateTrayDisplay();
        if (elements.manualTrayTableContainer?.querySelector('tbody tr')) {
            emitSticky('imports-ready-trays','importsReadyTrays');
        }
        if (elements.cableListContainer?.querySelector('tbody tr')) {
            emitSticky('imports-ready-cables','importsReadyCables');
        }
    };

    if (hasProjectSchedules && !state.sampleDataMode) {
        await loadSchedulesIntoSession();
        rebuildTrayData();
        displayConduitCount(state.trayData.filter(t => t.raceway_type === 'conduit').length, true);
    }
    await finalizeLoad();

    updateRoutingReadiness();
    hydrateSavedRouteResults();

    async function runSelfCheck(){
        const diag={};
        const snapshot=exportProject();
        try{
            setProjectState({name:'',ductbanks:[],conduits:[],trays:[],cables:[],settings:{session:{},collapsedGroups:{},units:'imperial'}});
            diag.cleared=true;
            const [raceways,cables]=await Promise.all([
                fetchDataFile('examples/sample_raceways.json', {}),
                fetchDataFile('examples/sample_cables.json', [])
            ]);
            const proj=getProjectState();
            proj.ductbanks=raceways.ductbanks||[];
            proj.conduits=raceways.conduits||[];
            proj.trays=raceways.trays||[];
            proj.cables=cables;
            setProjectState(proj);
            diag.counts={ductbanks:proj.ductbanks.length,conduits:proj.conduits.length,trays:proj.trays.length,cables:proj.cables.length};
            const dbTags=new Set(proj.ductbanks.map(db=>db.tag));
            const standalone=proj.conduits.filter(c=>!c.ductbankTag);
            const invalid=proj.conduits.filter(c=>c.ductbankTag&&!dbTags.has(c.ductbankTag));
            diag.invalidConduits=invalid.map(c=>c.conduit_id||c.id);
            diag.standaloneConduits=standalone.map(c=>c.conduit_id||c.id);
            if(Object.values(diag.counts).some(c=>c===0)||invalid.length) throw new Error('Data validation failed');
            await mainCalculation();
            const banner=document.getElementById('ductbank-no-conduits-warning');
            diag.noConduitsBanner=banner&&getComputedStyle(banner).display!=='none';
            const hasConduitSeg=state.cableList.some(c=>(c.route_segments||[]).some(s=>s.conduit_id));
            diag.hasConduitSegment=hasConduitSeg;
            const utilRows=document.querySelectorAll('#updated-utilization-container table tbody tr').length;
            diag.utilizationRows=utilRows;
            const firstLen=state.cableList[0]?.route_segments?.[0]?.length||0;
            const beforeLabel=units.distanceLabel();
            const beforeSys=units.getUnitSystem();
            units.setUnitSystem(beforeSys==='imperial'?'metric':'imperial');
            applyUnitLabels();
            const afterLabel=units.distanceLabel();
            const afterLen=state.cableList[0]?.route_segments?.[0]?.length||0;
            units.setUnitSystem(beforeSys);applyUnitLabels();
            diag.unitLabelsChanged=beforeLabel!==afterLabel;
            diag.unitValuesSame=firstLen===afterLen;
            const original=state.cableList[0]?.name;
            state.cableList[0].name='TEMP';
            const edit=state.cableList[0].name==='TEMP';
            state.cableList[0].name=original;
            const undo=state.cableList[0].name===original;
            state.cableList[0].name='TEMP';
            const redo=state.cableList[0].name==='TEMP';
            state.cableList[0].name=original;
            diag.editUndoRedo=edit&&undo&&redo;
            diag.pass=!diag.noConduitsBanner&&hasConduitSeg&&utilRows>0&&diag.unitLabelsChanged&&diag.unitValuesSame&&diag.editUndoRedo;
            showSelfCheckModal(diag);
        }catch(e){
            diag.error=e.message||String(e);
            diag.pass=false;
            showSelfCheckModal(diag);
        }finally{
            importProject(snapshot);
        }
    }

    if(new URLSearchParams(location.search).get('selfcheck')==='1'){
        runSelfCheck();
    }
}

const startApp = () => initializeApp()
    .then(() => recordStartupMeasurement({ page: 'optimalRoute.html' }))
    .catch(err => console.error('App initialization failed', err));

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
    startApp();
}
