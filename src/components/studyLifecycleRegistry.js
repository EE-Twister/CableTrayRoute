import { STUDY_ROUTE_METADATA } from './studyLifecycleMetadata.js';

/**
 * Page-level lifecycle policy. The calculation controllers own their domain
 * inputs and result rendering; this registry only declares which saved result
 * keys a page exposes and how its DOM should be treated by the shared
 * freshness layer.
 */
const EPHEMERAL_ROUTES = new Set([
  'demandschedule.html',
  'intlCableSize.html',
  'equipmentevaluation.html',
  'groundgrid.html',
  'autosize.html',
  'emf.html',
]);

const DOM_ADAPTERS = Object.freeze({
  'demandschedule.html': { inputScope: 'page', runControlIds: ['run-btn'], exportControlIds: ['export-btn'] },
  'intlCableSize.html': { inputScope: 'page', runControlIds: ['calcBtn'], exportControlIds: [], requiredControlIds: ['loadAmps'] },
  'iec60287.html': {
    inputScope: 'form', formIds: ['iec60287-form', 'cable-thermal-detailed-form'], runControlIds: [], exportControlIds: [],
    inputScopes: [
      { selectors: ['#iec60287-form'], resultKeys: ['iec60287'] },
      { selectors: ['#cable-thermal-detailed-form'], resultKeys: ['cableThermalDetailed'] },
    ],
    exportScopes: [{ resultKeys: ['cableThermalDetailed'], controlIds: ['thermal-export-csv-btn'] }],
    hiddenControlPolicy: 'exclude-hidden-disabled',
  },
  'cablethermalenv.html': { inputScope: 'form', formIds: ['ctenv-form'], runControlIds: ['ctenv-run-btn'], exportControlIds: ['ctenv-export-csv-btn'] },
  'tcc.html': { inputScope: 'page', runControlIds: [], exportControlIds: ['export-svg-btn', 'export-png-btn', 'export-review-btn', 'export-cti-btn', 'export-relay-settings-btn'], exportPolicy: 'controller-managed' },
  'harmonics.html': {
    inputScope: 'page',
    runControlIds: ['harmonic-network-rerun', 'run-unbalanced-btn', 'fs-run-btn'],
    exportControlIds: [],
    inputScopes: [
      { selectors: ['#freq-scan-section'], resultKeys: ['frequencyScan'] },
      { selectors: ['#unbalanced-section'], resultKeys: ['harmonics'] },
      { selectors: ['#harmonic-network-section'], resultKeys: ['harmonicNetwork'] },
    ],
  },
  'capacitorbank.html': { inputScope: 'form', formIds: ['cap-bank-form'], runControlIds: [], exportControlIds: [] },
  'frequencyscan.html': { inputScope: 'form', formIds: ['freq-scan-form'], runControlIds: [], exportControlIds: [] },
  'voltageflicker.html': { inputScope: 'form', formIds: ['flicker-form'], runControlIds: [], exportControlIds: [] },
  'busdust.html': { inputScope: 'page', runControlIds: ['calculate-btn'], exportControlIds: ['export-btn'] },
  'sustainability.html': { inputScope: 'page', runControlIds: ['calculate-btn'], exportControlIds: ['export-btn'] },
  'battery.html': { inputScope: 'form', formIds: ['battery-form'], runControlIds: [], exportControlIds: [] },
  'generatorsizing.html': { inputScope: 'form', formIds: ['gen-sizing-form'], runControlIds: [], exportControlIds: [] },
  'ibr.html': { inputScope: 'page', runControlIds: ['pv-run-btn', 'bess-run-btn', 'fault-run-btn', 'vv-run-btn'], exportControlIds: ['export-csv-btn', 'export-pdf-btn'] },
  'derinterconnect.html': { inputScope: 'form', formIds: ['der-study-form'], runControlIds: ['run-study-btn'], exportControlIds: ['export-csv-btn'] },
  'motorStart.html': { inputScope: 'page', runControlIds: ['run-motors-btn'], exportControlIds: ['export-motors-btn'] },
  'loadFlow.html': { inputScope: 'form', formIds: ['loadflow-form'], runControlIds: ['run-loadflow-btn'], exportControlIds: ['export-loadflow-btn'] },
  'quasidynamic.html': { inputScope: 'form', formIds: ['qd-form'], runControlIds: ['run-btn'], exportControlIds: ['export-csv-btn'] },
  'optimalpowerflow.html': { inputScope: 'form', formIds: ['opf-form'], runControlIds: ['run-btn'], exportControlIds: ['export-csv-btn'] },
  'probabilisticloadflow.html': { inputScope: 'form', formIds: ['mc-form'], runControlIds: ['run-btn'], exportControlIds: ['export-csv-btn'] },
  'sagtension.html': { inputScope: 'form', formIds: ['st-form'], runControlIds: ['run-btn'], exportControlIds: ['export-csv-btn'] },
  'substationlayout.html': { inputScope: 'form', formIds: ['sl-form'], runControlIds: ['run-btn'], exportControlIds: ['export-csv-btn'] },
  'voltagestability.html': { inputScope: 'form', formIds: ['vs-form'], runControlIds: ['run-btn'], exportControlIds: ['export-csv-btn'] },
  'shortCircuit.html': { inputScope: 'form', formIds: ['shortcircuit-form'], runControlIds: [], exportControlIds: ['shortcircuit-export-btn'] },
  'iec60909.html': { inputScope: 'form', formIds: ['iec60909-form'], runControlIds: ['run-btn'], exportControlIds: ['download-pdf-btn', 'download-csv-btn'], exportPolicy: 'controller-managed' },
  'arcFlash.html': { inputScope: 'form', formIds: ['arcflash-form'], runControlIds: [], exportControlIds: ['arcflash-export-btn'] },
  'dcshortcircuit.html': { inputScope: 'form', formIds: ['dc-sc-form'], runControlIds: [], exportControlIds: [], optionalControlIds: ['arc-duration', 'gap-mm', 'working-distance'], optionalWhen: 'run-arc-flash' },
  'differentialprotection.html': { inputScope: 'form', formIds: ['diff-form'], runControlIds: ['run-btn'], exportControlIds: ['export-btn'] },
  'equipmentevaluation.html': { inputScope: 'page', runControlIds: ['equip-run-btn'], exportControlIds: ['equip-export-csv-btn'] },
  'bessHazard.html': { inputScope: 'page', runControlIds: ['calculate-btn'], exportControlIds: ['export-btn'] },
  'hazareaclassification.html': { inputScope: 'page', runControlIds: ['run-study-btn'], exportControlIds: ['export-csv-btn'] },
  'insulationcoordination.html': { inputScope: 'form', formIds: ['inscoord-form'], runControlIds: [], exportControlIds: [] },
  'lighting.html': { inputScope: 'page', runControlIds: ['calculate-btn'], exportControlIds: ['export-btn'] },
  'groundgrid.html': { inputScope: 'form', formIds: ['ground-grid-form'], runControlIds: ['irregular-analyze-btn'], exportControlIds: ['export-risk-csv-btn'], requiredControlIds: ['irr-spacing-x', 'irr-spacing-y', 'irr-depth', 'irr-diameter', 'irr-rho', 'irr-current', 'irr-tf', 'irr-bw'] },
  'lightningprotection.html': { inputScope: 'form', formIds: ['lp-form'], runControlIds: ['run-btn'], exportControlIds: ['export-csv-btn', 'export-bom-btn', 'export-pdf-btn'] },
  'cathodicprotection.html': { inputScope: 'form', formIds: ['cp-form'], runControlIds: [], exportControlIds: [] },
  'dissimilarmetals.html': { inputScope: 'form', formIds: ['dissimilar-metals-form'], runControlIds: [], exportControlIds: [] },
  'autosize.html': { inputScope: 'page', formIds: ['feeder-form', 'motor-form', 'xfmr-form'], runControlIds: [], exportControlIds: [] },
  'heattracesizing.html': {
    inputScope: 'form',
    formIds: ['heat-trace-form'],
    runControlIds: [],
    exportControlIds: ['heattrace-export-package', 'heattrace-export-report-json', 'heattrace-print-report', 'heattrace-export-linelist-csv', 'heattrace-export-bom-csv', 'heattrace-export-controller-csv'],
    exportScopes: [
      { resultKeys: ['heatTraceSizing'], controlIds: ['heattrace-export-package', 'heattrace-export-report-json', 'heattrace-print-report'] },
      { resultKeys: ['heatTraceSizingCircuits'], controlIds: ['heattrace-export-linelist-csv', 'heattrace-export-bom-csv', 'heattrace-export-controller-csv'] },
    ],
    optionalControlIds: ['wind-speed-mph', 'soil-conductivity', 'burial-depth-ft', 'trace-run-count', 'max-circuit-length-ft'],
    hiddenControlPolicy: 'exclude-hidden-disabled',
    inputScopes: [
      { selectors: ['#circuit-case-list', '#circuit-case-name'], resultKeys: ['heatTraceSizingCircuits'] },
      { selectors: ['#heat-trace-form'], resultKeys: ['heatTraceSizing'] },
    ],
  },
  'reliability.html': { inputScope: 'page', runControlIds: ['run-btn'], exportControlIds: ['reliability-export-btn'] },
  'emf.html': { inputScope: 'page', runControlIds: ['calc-btn', 'profile-btn'], exportControlIds: [], requiredControlIds: ['frequency', 'load-current', 'n-cables', 'tray-width', 'cable-od', 'meas-distance'] },
  'transientstability.html': { inputScope: 'page', runControlIds: ['calc-btn', 'cct-btn'], exportControlIds: [] },
  'contingency.html': { inputScope: 'form', formIds: ['contingency-form'], runControlIds: [], exportControlIds: ['export-contingency-btn'], optionalControlIds: ['generatorInertiaH', 'faultClearingTime_s'], optionalWhen: 'checkTransientStability' },
  'voltagedropstudy.html': { inputScope: 'page', runControlIds: ['run-btn'], exportControlIds: ['export-btn'] },
  'cybercompliance.html': { inputScope: 'page', runControlIds: ['run-cyber-study-btn'], exportControlIds: ['export-cyber-csv-btn'] },
});

const studyRoutes = STUDY_ROUTE_METADATA;

export const STUDY_PAGE_LIFECYCLE_REGISTRY = Object.freeze(studyRoutes.map(route => {
  const adapter = DOM_ADAPTERS[route.href] || {};
  const ephemeral = EPHEMERAL_ROUTES.has(route.href);
  return Object.freeze({
    href: route.href,
    label: route.label,
    mode: ephemeral ? 'ephemeral' : 'saved',
    resultKeys: route.resultKeys,
    inputScope: adapter.inputScope || 'page',
    formIds: Object.freeze([...(adapter.formIds || [])]),
    runControlIds: Object.freeze([...(adapter.runControlIds || [])]),
    exportControlIds: Object.freeze([...(adapter.exportControlIds || [])]),
    optionalControlIds: Object.freeze([...(adapter.optionalControlIds || [])]),
    requiredControlIds: Object.freeze([...(adapter.requiredControlIds || [])]),
    optionalWhen: adapter.optionalWhen || null,
    hiddenControlPolicy: adapter.hiddenControlPolicy || 'exclude-hidden-disabled',
    exportScopes: Object.freeze((adapter.exportScopes || []).map(scope => Object.freeze({
      resultKeys: Object.freeze([...(scope.resultKeys || [])]),
      controlIds: Object.freeze([...(scope.controlIds || [])]),
    }))),
    inputScopes: Object.freeze((adapter.inputScopes || []).map(scope => Object.freeze({
      selectors: Object.freeze([...(scope.selectors || [])]),
      resultKeys: Object.freeze([...(scope.resultKeys || [])]),
    }))),
    exportPolicy: ephemeral ? 'live-inputs-only' : (adapter.exportPolicy || 'assessment-required'),
  });
}));

export function getStudyLifecycleRoute(href) {
  const raw = String(href || '').split('/').pop() || '';
  return STUDY_PAGE_LIFECYCLE_REGISTRY.find(route => route.href.toLowerCase() === raw.toLowerCase()) || null;
}

export function getStudyLifecycleCoverage() {
  return {
    totalRoutes: studyRoutes.length,
    registryRoutes: STUDY_PAGE_LIFECYCLE_REGISTRY.length,
    missing: studyRoutes
      .filter(route => !STUDY_PAGE_LIFECYCLE_REGISTRY.some(item => item.href === route.href))
      .map(route => route.href),
    ephemeral: STUDY_PAGE_LIFECYCLE_REGISTRY.filter(route => route.mode === 'ephemeral').map(route => route.href),
    savedResultKeys: [...new Set(STUDY_PAGE_LIFECYCLE_REGISTRY.flatMap(route => route.resultKeys))],
  };
}
