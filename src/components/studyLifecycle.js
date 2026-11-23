import {
  STORAGE_KEYS,
  getStudyAssessment,
  getStudyProvenance,
  on as onDataStoreChange,
} from '../../dataStore.mjs';
import {
  getStudyLifecycleRoute,
} from './studyLifecycleRegistry.js';

const SHELL_CONTROL_IDS = new Set([
  'theme-select',
  'compact-toggle',
  'unit-select',
  'import-project-input',
]);

const lifecycleState = {
  route: null,
  dirty: false,
  dirtyByStudyKey: {},
  ephemeralDirty: false,
  ephemeralRunFingerprint: null,
  lastInputChangeAt: 0,
  lastInputChangeAtByStudyKey: {},
  banner: null,
  lastProvenance: {},
};

function pageName() {
  if (typeof location === 'undefined') return '';
  return String(location.pathname || '').split('/').pop() || 'index.html';
}

function mainElement() {
  return document.querySelector('main') || document.getElementById('main-content');
}

function assessmentState(assessment) {
  if (!assessment?.present) return null;
  if (assessment.freshness === 'stale') return 'stale';
  if (assessment.validity?.state === 'unevaluated' || assessment.validity?.state === 'unknown') return 'incomplete';
  if (assessment.freshness === 'unknown') return 'unknown';
  if (assessment.validity?.state === 'partial') return 'incomplete';
  if (assessment.eligible === false) return 'incomplete';
  return 'current';
}

export function summarizeStudyAssessments(assessments, { dirty = false } = {}) {
  if (!assessments.length) return { state: null, assessments };
  const states = assessments.map(item => item.dirty ? 'stale' : assessmentState(item.assessment));
  let state = 'current';
  if (states.includes('stale')) state = 'stale';
  else if (states.includes('incomplete')) state = 'incomplete';
  else if (states.includes('unknown')) state = 'unknown';
  if (dirty) state = 'stale';
  return { state, assessments };
}

function aggregateAssessments(route, resultKeys = route.resultKeys) {
  const assessments = resultKeys.map(studyKey => ({
    studyKey,
    assessment: getStudyAssessment(studyKey),
    dirty: lifecycleState.dirtyByStudyKey[studyKey] === true,
  }));
  const present = assessments.filter(item => item.assessment?.present);
  const aggregate = summarizeStudyAssessments(present);
  // A route can declare several result keys while only one has been saved.
  // That is still an unknown aggregate: an export must not treat the saved
  // subset as a complete current study.
  if (assessments.some(item => !item.assessment?.present)
      && (aggregate.state === null || aggregate.state === 'current')) {
    return { ...aggregate, state: 'unknown', assessments };
  }
  return { ...aggregate, assessments };
}

function bannerText(state, assessments) {
  if (state === 'stale') return 'Inputs or project data changed since this study was run. Re-run the study before relying on or issuing this result.';
  if (state === 'incomplete') return 'This saved study is incomplete or contains invalid required inputs. Resolve the listed inputs and re-run before relying on or issuing this result.';
  if (state === 'unknown') return 'Saved result freshness is unknown. Re-run this study to link it to the current project inputs and options.';
  const capturedAt = assessments.find(item => item.assessment?.provenance?.capturedAt)?.assessment?.provenance?.capturedAt;
  const when = capturedAt ? new Date(capturedAt).toLocaleString() : '';
  return `Result is current with the linked project inputs${when ? ` (run ${when})` : ''}.`;
}

function ensureBanner() {
  if (lifecycleState.banner?.isConnected) return lifecycleState.banner;
  const banner = document.createElement('section');
  banner.className = 'study-global-freshness';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  const main = mainElement();
  const anchor = main?.querySelector(':scope > .page-header')
    || main?.querySelector('h1')?.closest('header')
    || main?.querySelector('h1');
  if (anchor) anchor.insertAdjacentElement('afterend', banner);
  else main?.prepend(banner);
  lifecycleState.banner = banner;
  return banner;
}

function renderBanner(route, aggregate) {
  const existing = document.querySelector('.study-global-freshness[data-study-lifecycle="true"]');
  if (!aggregate.state || route.mode === 'ephemeral') {
    existing?.remove();
    lifecycleState.banner = null;
    return;
  }
  const banner = existing || ensureBanner();
  const { state, assessments } = aggregate;
  banner.className = `study-global-freshness study-global-freshness--${state}`;
  banner.dataset.studyLifecycle = 'true';
  banner.dataset.studyLifecycleState = state;
  banner.dataset.studyKeys = route.resultKeys.join(',');
  const color = state === 'current' ? '#16803c' : state === 'stale' ? '#d97706' : '#64748b';
  const background = state === 'current' ? 'rgba(22,128,60,.08)' : state === 'stale' ? 'rgba(245,158,11,.1)' : 'rgba(100,116,139,.1)';
  banner.style.cssText = `border:1px solid ${color};border-left-width:4px;border-radius:7px;padding:.65rem .8rem;margin:.75rem 0;background:${background}`;
  banner.textContent = bannerText(state, assessments);
}

function candidateExportControls(route, controlIds = route.exportControlIds, discover = true) {
  const main = mainElement();
  if (!main) return [];
  const controls = controlIds
    .map(id => document.getElementById(id))
    .filter(element => element && main.contains(element));
  if (discover) {
    main.querySelectorAll('button[id*="export"],button[id*="download"],a[data-study-export],a[id*="export"],a[id*="download"]')
      .forEach(element => controls.push(element));
  }
  return [...new Set(controls)];
}

function candidateRunControls(route) {
  const main = mainElement();
  if (!main) return [];
  const controls = route.runControlIds
    .map(id => document.getElementById(id))
    .filter(element => element && main.contains(element));
  route.formIds.forEach(id => {
    const form = document.getElementById(id);
    if (!form || !main.contains(form)) return;
    form.querySelectorAll('button[type="submit"],input[type="submit"]').forEach(element => controls.push(element));
  });
  return [...new Set(controls)];
}

function gateControls(controls, gate, message) {
  controls.forEach(control => {
    if (gate) {
      if (control.dataset.studyLifecycleDisabled !== 'true') {
        control.dataset.studyLifecycleDisabled = 'true';
        control.dataset.studyLifecyclePreviousDisabled = control.disabled ? 'true' : 'false';
      }
      control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
      control.title = message;
    } else if (control.dataset.studyLifecycleDisabled === 'true') {
      // A controller commonly enables its export button after saveStudyResult
      // returns. Preserve that explicit enable instead of restoring the state
      // captured while the result was temporarily unknown.
      if (control.disabled) control.disabled = control.dataset.studyLifecyclePreviousDisabled === 'true';
      control.removeAttribute('aria-disabled');
      delete control.dataset.studyLifecycleDisabled;
      delete control.dataset.studyLifecyclePreviousDisabled;
    }
  });
}

function setExportEligibility(route, state, ephemeralInvalid = false) {
  if (route.exportPolicy === 'controller-managed') return;
  const message = state === 'stale'
    ? 'Re-run this study after changing inputs before exporting.'
    : 'Resolve required inputs and run the study before exporting.';
  if (route.exportScopes?.length) {
    route.exportScopes.forEach(scope => {
      const scopeAssessment = aggregateAssessments(route, scope.resultKeys);
      gateControls(
        candidateExportControls(route, scope.controlIds, false),
        scopeAssessment.state !== 'current',
        scopeAssessment.state === 'stale'
          ? 'Re-run this study after changing inputs before exporting.'
          : 'Run this study scope before exporting.',
      );
    });
  } else {
    gateControls(candidateExportControls(route), route.mode === 'ephemeral' ? ephemeralInvalid : state !== 'current', message);
  }
}

function exportControlForTarget(route, target) {
  if (!target || !mainElement()?.contains(target)) return null;
  if (target.closest('[data-study-lifecycle-ignore]')) return null;
  return candidateExportControls(route).find(control => control === target || control.contains(target)) || null;
}

function exportScopeForControl(route, control) {
  return route.exportScopes?.find(scope => scope.controlIds.some(id => document.getElementById(id) === control)) || null;
}

function handleExportClick(event) {
  const route = lifecycleState.route;
  if (!route || route.exportPolicy === 'controller-managed') return;
  const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
  const control = exportControlForTarget(route, target);
  if (!control) return;

  const scope = exportScopeForControl(route, control);
  const aggregate = route.mode === 'ephemeral'
    ? ephemeralAssessment(route)
    : aggregateAssessments(route, scope?.resultKeys || route.resultKeys);
  const blocked = route.mode === 'ephemeral'
    ? aggregate.ephemeralInvalid === true
    : aggregate.state !== 'current';
  if (!blocked) return;

  const message = aggregate.state === 'stale'
    ? 'Re-run this study after changing inputs before exporting.'
    : aggregate.state === 'unknown'
      ? 'Run this study to establish current inputs before exporting.'
      : 'Resolve required inputs and run the study before exporting.';
  // Controllers may re-enable a button after their own render pass. The
  // capture-phase guard remains authoritative for anchors and such buttons,
  // and stops their exporter from seeing a stale or unknown result.
  gateControls([control], true, message);
  event.preventDefault();
  event.stopImmediatePropagation();
}

function ephemeralAssessment(route) {
  const main = mainElement();
  if (!main) return { state: null, assessments: [], ephemeralInvalid: false };
  const explicitRequired = route.requiredControlIds
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const required = [...new Set([
    ...main.querySelectorAll('input:required,select:required,textarea:required'),
    ...explicitRequired,
  ])]
    .filter(element => !element.disabled && element.type !== 'hidden' && !element.closest('[hidden]'));
  const invalid = required.some(element => !element.checkValidity());
  const state = invalid ? 'incomplete' : lifecycleState.ephemeralDirty ? 'stale' : null;
  return { state, assessments: [], ephemeralInvalid: invalid || lifecycleState.ephemeralDirty };
}

function ephemeralInputFingerprint(route) {
  const main = mainElement();
  if (!main) return '';
  const forms = route.formIds.length
    ? route.formIds.map(id => document.getElementById(id)).filter(Boolean)
    : [main];
  return JSON.stringify(forms.flatMap(form => [...form.querySelectorAll('input,select,textarea,[contenteditable="true"]')]
    .filter(element => !element.disabled && element.type !== 'hidden' && !element.closest('[hidden]'))
    .map(element => ({
      id: element.id,
      name: element.name,
      type: element.type,
      value: element.type === 'checkbox' || element.type === 'radio' ? element.checked : element.value,
    }))));
}

function refreshStudyLifecycle() {
  if (!lifecycleState.route) return null;
  const aggregate = lifecycleState.route.mode === 'ephemeral'
    ? ephemeralAssessment(lifecycleState.route)
    : aggregateAssessments(lifecycleState.route);
  renderBanner(lifecycleState.route, aggregate);
  setExportEligibility(lifecycleState.route, aggregate.state, aggregate.ephemeralInvalid === true);
  return aggregate;
}

function isPageInput(target) {
  if (!target || target.nodeType !== 1) return false;
  const main = mainElement();
  if (!main || !main.contains(target)) return false;
  if (SHELL_CONTROL_IDS.has(target.id) || target.closest('[data-study-lifecycle-ignore]')) return false;
  if (target.matches('input[type="search"],input[id*="filter" i],select[id*="filter" i]')) return false;
  if (lifecycleState.route.inputScope === 'form'
      && lifecycleState.route.formIds.length
      && !lifecycleState.route.formIds.some(id => target.closest(`#${id}`))) return false;
  if (target.disabled || target.readOnly) return false;
  return target.matches('input,select,textarea,[contenteditable="true"]');
}

function resultKeysForInput(target, route) {
  const scope = route.inputScopes?.find(item => item.selectors.some(selector => target.closest(selector)));
  return scope?.resultKeys?.length ? scope.resultKeys : route.resultKeys;
}

function handleInputChange(event) {
  if (!lifecycleState.route || !isPageInput(event.target)) return;
  if (lifecycleState.route.mode === 'ephemeral') {
    lifecycleState.ephemeralDirty = true;
    refreshStudyLifecycle();
    return;
  }
  lifecycleState.lastInputChangeAt = Date.now();
  const changedAt = lifecycleState.lastInputChangeAt;
  resultKeysForInput(event.target, lifecycleState.route).forEach(studyKey => {
    if (!getStudyAssessment(studyKey).present) return;
    lifecycleState.dirtyByStudyKey[studyKey] = true;
    lifecycleState.lastInputChangeAtByStudyKey[studyKey] = changedAt;
  });
  lifecycleState.dirty = Object.values(lifecycleState.dirtyByStudyKey).some(Boolean);
  refreshStudyLifecycle();
}

function handleEphemeralClick(event) {
  if (lifecycleState.route?.mode !== 'ephemeral' || !mainElement()?.contains(event.target)) return;
  const runControl = candidateRunControls(lifecycleState.route).find(control => control === event.target || control.contains(event.target));
  if (!runControl) {
    refreshStudyLifecycle();
    return;
  }
  lifecycleState.ephemeralRunFingerprint = ephemeralInputFingerprint(lifecycleState.route);
  refreshStudyLifecycle();
}

function handleEphemeralCompletion(event) {
  const route = lifecycleState.route;
  if (route?.mode !== 'ephemeral') return;
  const href = event.detail?.href;
  if (href && href !== route.href) return;
  if (lifecycleState.ephemeralRunFingerprint !== ephemeralInputFingerprint(route)) return;
  lifecycleState.ephemeralDirty = false;
  lifecycleState.ephemeralRunFingerprint = null;
  refreshStudyLifecycle();
}

function handleDataStoreChange(key, detail) {
  if (!lifecycleState.route) return;
  const projectKeys = new Set([
    STORAGE_KEYS.equipment,
    STORAGE_KEYS.loads,
    STORAGE_KEYS.panels,
    STORAGE_KEYS.cables,
    STORAGE_KEYS.trays,
    STORAGE_KEYS.conduits,
    STORAGE_KEYS.ductbanks,
    STORAGE_KEYS.oneLine,
    STORAGE_KEYS.projectMeta,
    STORAGE_KEYS.designBasis,
    STORAGE_KEYS.studies,
    'studySettings',
    'tccSettings',
    STORAGE_KEYS.trayHardwareCatalogCustomProducts,
  ]);
  if (key === STORAGE_KEYS.studyProvenance) {
    const nextProvenance = detail && typeof detail === 'object' ? detail : getStudyProvenance();
    const changedStudyKeys = [];
    lifecycleState.route.resultKeys.forEach(studyKey => {
      const previous = lifecycleState.lastProvenance?.[studyKey];
      const next = nextProvenance?.[studyKey];
      const fields = ['resultHash', 'projectSnapshotHash', 'inputFingerprint', 'optionsFingerprint', 'manualInputFingerprint', 'settingsFingerprint', 'dependencyFingerprint', 'scenario', 'capturedAt'];
      if (next && fields.some(field => next[field] !== previous?.[field])) {
        changedStudyKeys.push(studyKey);
      }
    });
    lifecycleState.lastProvenance = nextProvenance || {};
    changedStudyKeys.forEach(studyKey => {
      if (!lifecycleState.dirtyByStudyKey[studyKey]) return;
      const capturedAt = Date.parse(nextProvenance?.[studyKey]?.capturedAt || '');
      const lastInputChangeAt = lifecycleState.lastInputChangeAtByStudyKey[studyKey] || 0;
      if (!lastInputChangeAt || !Number.isFinite(capturedAt) || capturedAt >= lastInputChangeAt) {
        lifecycleState.dirtyByStudyKey[studyKey] = false;
      }
    });
    lifecycleState.dirty = Object.values(lifecycleState.dirtyByStudyKey).some(Boolean);
    refreshStudyLifecycle();
  }
  if (projectKeys.has(key)) {
    refreshStudyLifecycle();
  }
}

export function inspectStudyLifecycleDom(route, root = typeof document !== 'undefined' ? document : null) {
  const host = root?.querySelector ? root : null;
  if (!route || !host) return { href: route?.href || null, missingForms: [], missingControls: [], runBindings: 0, exportBindings: 0 };
  const findById = id => host.getElementById?.(id) || [...host.querySelectorAll('[id]')].find(element => element.id === id) || null;
  const forms = route.formIds.filter(id => !findById(id));
  const controls = [...route.runControlIds, ...route.exportControlIds]
    .filter(id => !findById(id));
  const submitters = route.formIds.reduce((count, id) => {
    const form = findById(id);
    return count + (form ? form.querySelectorAll('button[type="submit"],input[type="submit"]').length : 0);
  }, 0);
  const exports = candidateExportControlsForRoot(route, host).length;
  const runBindings = route.runControlIds.filter(id => findById(id)).length + submitters;
  return { href: route.href, missingForms: forms, missingControls: controls, runBindings, exportBindings: exports };
}

function candidateExportControlsForRoot(route, host) {
  const controls = route.exportControlIds.map(id => host.getElementById?.(id) || [...host.querySelectorAll('[id]')].find(element => element.id === id)).filter(Boolean);
  host.querySelectorAll('button[id*="export"],button[id*="download"],a[data-study-export],a[id*="export"],a[id*="download"]')
    .forEach(element => controls.push(element));
  return [...new Set(controls)];
}

export function initStudyLifecycle() {
  if (typeof document === 'undefined') return null;
  lifecycleState.route = getStudyLifecycleRoute(pageName());
  lifecycleState.dirty = false;
  lifecycleState.dirtyByStudyKey = {};
  lifecycleState.lastInputChangeAtByStudyKey = {};
  lifecycleState.lastProvenance = getStudyProvenance() || {};
  if (!lifecycleState.route) return null;
  document.addEventListener('input', handleInputChange, true);
  document.addEventListener('change', handleInputChange, true);
  document.addEventListener('click', handleEphemeralClick, true);
  document.addEventListener('click', handleExportClick, true);
  document.addEventListener('ctr:study-ephemeral-complete', handleEphemeralCompletion);
  ['ctr:project-saved', 'ctr:remote-applied'].forEach(eventName => {
    document.addEventListener(eventName, () => refreshStudyLifecycle());
  });
  const watchedKeys = new Set([
    STORAGE_KEYS.equipment, STORAGE_KEYS.loads, STORAGE_KEYS.panels, STORAGE_KEYS.cables,
    STORAGE_KEYS.trays, STORAGE_KEYS.conduits, STORAGE_KEYS.ductbanks, STORAGE_KEYS.oneLine,
    STORAGE_KEYS.projectMeta, STORAGE_KEYS.designBasis, STORAGE_KEYS.studies,
    STORAGE_KEYS.studyProvenance,
    'studySettings', 'tccSettings', STORAGE_KEYS.trayHardwareCatalogCustomProducts,
  ]);
  watchedKeys.forEach(key => onDataStoreChange(key, detail => handleDataStoreChange(key, detail)));
  onDataStoreChange('scenario', () => {
    lifecycleState.dirty = false;
    lifecycleState.dirtyByStudyKey = {};
    lifecycleState.lastInputChangeAtByStudyKey = {};
    refreshStudyLifecycle();
  });
  if (typeof window !== 'undefined') window.addEventListener('storage', () => refreshStudyLifecycle());
  refreshStudyLifecycle();
  // Page controllers can restore a saved result and re-enable their export
  // controls in a later DOMContentLoaded listener. Reconcile once the current
  // event dispatch has completed so the visual disabled state matches the
  // assessment as well as the capture-phase guard.
  if (typeof setTimeout === 'function') setTimeout(refreshStudyLifecycle, 0);
  return lifecycleState.route;
}

export function getStudyLifecycleState() {
  return {
    route: lifecycleState.route,
    dirty: lifecycleState.dirty,
    dirtyByStudyKey: { ...lifecycleState.dirtyByStudyKey },
    ephemeralDirty: lifecycleState.ephemeralDirty,
    banner: lifecycleState.banner,
  };
}
