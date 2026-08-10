import './workflowStatus.js';
import '../site.js';
import { repairMojibake } from './textEncoding.js';
import { getItem, getProjectInputFingerprint, getStudies, importProject, loadProject, saveProject, setItem, setStudies } from '../dataStore.mjs';
import { getProjectState, getProjectStorageDiagnostics, listSavedProjects, readAppSetting, setConduitCache, setProjectState, writeAppSetting } from '../projectStorage.js';
import {
  SAMPLE_REGISTRY,
  getSampleById,
  getSampleProjectCopies,
  getSampleProjectCopyName,
  getSamplesByTag,
  validateSampleProject,
  migrateSampleProject,
  sampleProjectToImportPayload
} from '../analysis/sampleGallery.mjs';

const PROGRESS_KEY_PREFIX = 'ctr_sample_progress_';

// ── State ────────────────────────────────────────────────────────────────────

let activeTag = null;
let activeSampleId = null;
let searchTerm = '';

// ── DOM refs ─────────────────────────────────────────────────────────────────

const grid = document.getElementById('gallery-grid');
const emptyMsg = document.getElementById('gallery-empty');
const tagBar = document.getElementById('tag-filter-bar');
const allTagBar = document.getElementById('all-tag-filter-bar');
const searchInput = document.getElementById('gallery-search');
const resultsCount = document.getElementById('gallery-results-count');
const clearFilterBtn = document.getElementById('gallery-clear-filter-btn');
const checklistPanel = document.getElementById('checklist-panel');
const checklistTitle = document.getElementById('checklist-title');
const checklistSteps = document.getElementById('checklist-steps');
const checklistCloseBtn = document.getElementById('checklist-close-btn');

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, kind = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = repairMojibake(msg);
  toast.classList.remove('toast-error', 'toast-success', 'show');
  toast.classList.add(kind === 'error' ? 'toast-error' : 'toast-success', 'show');
  toast.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  setTimeout(() => toast.classList.remove('show', 'toast-error', 'toast-success'), 4000);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function progressKey(id) {
  return PROGRESS_KEY_PREFIX + id;
}

function loadProgress(id) {
  try {
    return JSON.parse(readAppSetting(progressKey(id)) || '{}');
  } catch {
    return {};
  }
}

function saveProgress(id, progress) {
  try {
    writeAppSetting(progressKey(id), JSON.stringify(progress));
  } catch { /* quota */ }
}

function markStepDone(sampleId, stepIndex) {
  const p = loadProgress(sampleId);
  p[stepIndex] = true;
  saveProgress(sampleId, p);
}

// ── Tag chips ─────────────────────────────────────────────────────────────────

const allTags = [...new Set(SAMPLE_REGISTRY.flatMap(s => s.tags))].sort();
const tagUsage = new Map(allTags.map(tag => [tag, SAMPLE_REGISTRY.filter(sample => sample.tags.includes(tag)).length]));
const popularTags = [...allTags]
  .sort((a, b) => tagUsage.get(b) - tagUsage.get(a) || a.localeCompare(b))
  .slice(0, 6);

function buildTagChip(tag) {
  const chip = document.createElement('button');
  chip.className = 'tag-chip';
  chip.textContent = tag;
  chip.setAttribute('aria-pressed', activeTag === tag ? 'true' : 'false');
  chip.addEventListener('click', () => {
    activeTag = activeTag === tag ? null : tag;
    refresh();
  });
  return chip;
}

function renderTagChips() {
  tagBar.innerHTML = '';
  allTagBar.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.className = 'tag-chip';
  allChip.textContent = 'All';
  allChip.setAttribute('aria-pressed', activeTag === null ? 'true' : 'false');
  allChip.addEventListener('click', () => { activeTag = null; refresh(); });
  tagBar.appendChild(allChip);

  popularTags.forEach(tag => tagBar.appendChild(buildTagChip(tag)));
  allTags.filter(tag => !popularTags.includes(tag)).forEach(tag => allTagBar.appendChild(buildTagChip(tag)));
}

// ── Card rendering ────────────────────────────────────────────────────────────

function buildCard(sample) {
  const article = document.createElement('article');
  article.className = 'sample-card card';
  article.setAttribute('role', 'listitem');
  if (activeSampleId === sample.id) article.classList.add('sample-card--selected');
  article.dataset.sampleId = sample.id;

  if (sample.image) {
    const media = document.createElement('div');
    media.className = 'sample-card__media';
    const img = document.createElement('img');
    img.src = sample.image;
    img.alt = sample.imageAlt || `${sample.title} sample project thumbnail`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 960;
    img.height = 540;
    media.appendChild(img);
    article.appendChild(media);
  }

  const body = document.createElement('div');
  body.className = 'sample-card__body';

  const header = document.createElement('div');
  header.className = 'sample-card__header';

  const title = document.createElement('h2');
  title.className = 'sample-card__title';
  title.textContent = sample.title;

  const badge = document.createElement('span');
  badge.className = 'sample-card__industry';
  badge.textContent = sample.industry;

  header.appendChild(title);
  header.appendChild(badge);

  const desc = document.createElement('p');
  desc.className = 'sample-card__desc';
  desc.textContent = sample.description;

  const tagList = document.createElement('ul');
  tagList.className = 'sample-card__tags';
  tagList.setAttribute('aria-label', 'Tags');
  sample.tags.forEach(t => {
    const li = document.createElement('li');
    li.className = 'sample-card__tag';
    li.textContent = t;
    tagList.appendChild(li);
  });

  const actions = document.createElement('div');
  actions.className = 'sample-card__actions';
  const existingCopies = getSampleProjectCopies(sample.title, listSavedProjects());

  const openBtn = document.createElement('button');
  openBtn.className = 'primary-btn';
  openBtn.textContent = existingCopies.length ? 'Open Saved Copy' : 'Start Guided Sample';
  openBtn.setAttribute('aria-label', existingCopies.length
    ? `Open saved ${sample.title} sample project`
    : `Start guided ${sample.title} sample project`);
  openBtn.addEventListener('click', () => openSample(sample));

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Create Fresh Copy';
  copyBtn.setAttribute('aria-label', `Create a fresh copy of the ${sample.title} sample project`);
  copyBtn.hidden = existingCopies.length === 0;
  copyBtn.addEventListener('click', () => openSample(sample, { forceNew: true }));

  const dlLink = document.createElement('a');
  dlLink.className = 'btn';
  dlLink.href = sample.projectFile;
  dlLink.download = sample.id + '.json';
  dlLink.textContent = 'Download JSON';
  dlLink.setAttribute('aria-label', `Download ${sample.title} project JSON`);

  actions.appendChild(openBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(dlLink);

  body.appendChild(header);
  body.appendChild(desc);
  body.appendChild(tagList);
  body.appendChild(actions);
  article.appendChild(body);
  return article;
}

function renderGrid() {
  const tagFilteredSamples = activeTag ? getSamplesByTag(activeTag) : SAMPLE_REGISTRY;
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const samples = normalizedSearch
    ? tagFilteredSamples.filter(sample => [sample.title, sample.industry, sample.description, ...sample.tags]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedSearch))
    : tagFilteredSamples;
  grid.innerHTML = '';
  if (resultsCount) {
    resultsCount.textContent = `Showing ${samples.length} of ${SAMPLE_REGISTRY.length}`;
  }
  if (samples.length === 0) {
    emptyMsg.hidden = false;
    emptyMsg.textContent = normalizedSearch
      ? 'No samples match that search and filter combination.'
      : 'No samples match the selected filter.';
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;
  samples.forEach(s => grid.appendChild(buildCard(s)));
}

// ── Open sample ───────────────────────────────────────────────────────────────

function activateSampleWorkflow(sample, projectId) {
  window.currentProjectId = projectId;
  setItem('activeSampleWorkflow', {
    id: sample.id,
    title: sample.title,
    checklist: sample.guidedChecklist.map(step => ({ ...step })),
    startedAt: new Date().toISOString(),
  });
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(projectId)}`);
  } catch (error) {
    console.warn('Could not update the sample project URL.', error);
  }
}

async function openSample(sample, { forceNew = false } = {}) {
  const existingCopies = getSampleProjectCopies(sample.title, listSavedProjects());
  if (!forceNew && existingCopies.length > 0) {
    const projectId = existingCopies[0];
    if (!loadProject(projectId)) {
      showToast(`Could not open saved project "${projectId}".`, 'error');
      return;
    }
    setProjectState({ ...getProjectState(), name: projectId });
    activateSampleWorkflow(sample, projectId);
    await globalThis.updateProjectDisplay?.({ name: projectId });
    activeSampleId = sample.id;
    showChecklist(sample);
    globalThis.applyProjectHash?.();
    renderGrid();
    showToast(`Reopened "${projectId}". Choose Create Fresh Copy when you want a separate project.`, 'success');
    return;
  }

  let projectData;
  let persistenceWarning = '';
  try {
    const resp = await fetch(sample.projectFile);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    projectData = await resp.json();
  } catch (err) {
    showToast(`Could not load sample file: ${err.message}`, 'error');
    return;
  }

  const migrated = migrateSampleProject(projectData);
  const { valid, errors } = validateSampleProject(migrated);
  if (!valid) {
    showToast(`Sample validation failed: ${errors.join('; ')}`, 'error');
    return;
  }

  try {
    const payload = sampleProjectToImportPayload(migrated);
    const imported = importProject(payload);
    if (!imported) {
      showToast('Sample import was cancelled or could not be applied.', 'error');
      return;
    }
    setConduitCache({ ductbanks: payload.ductbanks, conduits: payload.conduits });
    const projectId = getSampleProjectCopyName(sample.title, listSavedProjects());
    setProjectState({ ...getProjectState(), name: projectId });
    const routeState = getItem('latestRouteResults', null);
    if (Array.isArray(routeState?.batchResults) && routeState.batchResults.length > 0) {
      setItem('latestRouteResults', {
        ...routeState,
        inputFingerprint: getProjectInputFingerprint(),
      });
    }
    const studies = getStudies();
    if (studies.shortCircuit?._meta) {
      studies.shortCircuit = {
        ...studies.shortCircuit,
        _meta: {
          ...studies.shortCircuit._meta,
          inputFingerprint: getProjectInputFingerprint(),
        },
      };
      setStudies(studies);
    }
    activateSampleWorkflow(sample, projectId);
    if (!saveProject(projectId)) {
      throw new Error(`The project copy "${projectId}" could not be created.`);
    }
    const storageDiagnostics = getProjectStorageDiagnostics();
    if (!storageDiagnostics.persistentStorageAvailable) {
      persistenceWarning = ' Browser storage is full or unavailable, so this copy is available only in this tab. Export the project before closing or reloading.';
    }
    await globalThis.updateProjectDisplay?.({ name: projectId });
  } catch (error) {
    console.error(`Could not load the ${sample.title} sample project.`, error);
    const detail = error instanceof Error && error.message
      ? ` ${error.message}`
      : '';
    showToast(`Could not load "${sample.title}".${detail}`, 'error');
    return;
  }

  activeSampleId = sample.id;
  showChecklist(sample);
  globalThis.applyProjectHash?.();
  renderGrid();
  showToast(`Loaded "${sample.title}" — follow the checklist to explore.${persistenceWarning}`, persistenceWarning ? 'error' : 'success');
}

// ── Checklist ─────────────────────────────────────────────────────────────────

function showChecklist(sample) {
  activeSampleId = sample.id;
  checklistTitle.textContent = `Guided Workflow: ${sample.title}`;
  const progress = loadProgress(sample.id);
  checklistSteps.innerHTML = '';

  sample.guidedChecklist.forEach((step, idx) => {
    const done = !!progress[idx];
    const li = document.createElement('li');
    li.className = 'checklist-step' + (done ? ' checklist-step--done' : '');
    li.dataset.stepIdx = idx;

    const numSpan = document.createElement('span');
    numSpan.className = 'checklist-step__num';
    numSpan.setAttribute('aria-hidden', 'true');
    numSpan.textContent = done ? '✓' : step.step;

    numSpan.textContent = repairMojibake(numSpan.textContent);

    const body = document.createElement('div');
    body.className = 'checklist-step__body';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'checklist-step__label';
    labelDiv.textContent = step.label;

    const hintDiv = document.createElement('div');
    hintDiv.className = 'checklist-step__hint';
    hintDiv.textContent = step.hint;

    const link = document.createElement('a');
    link.className = 'checklist-step__link';
    link.href = globalThis.projectScopedHref?.(step.page) || step.page;
    const pageLabel = step.page.split(/[?#]/)[0].replace('.html', '');
    link.textContent = `Go to ${pageLabel} →`;
    link.textContent = repairMojibake(link.textContent);
    link.addEventListener('click', () => {
      markStepDone(sample.id, idx);
    });

    body.appendChild(labelDiv);
    body.appendChild(hintDiv);
    body.appendChild(link);
    li.appendChild(numSpan);
    li.appendChild(body);
    checklistSteps.appendChild(li);
  });

  checklistPanel.hidden = false;
  checklistPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Event wiring ──────────────────────────────────────────────────────────────

clearFilterBtn.addEventListener('click', () => {
  activeTag = null;
  searchTerm = '';
  if (searchInput) searchInput.value = '';
  refresh();
});
searchInput?.addEventListener('input', event => {
  searchTerm = event.target.value || '';
  refresh();
});
checklistCloseBtn.addEventListener('click', () => { checklistPanel.hidden = true; });

function refresh() {
  renderTagChips();
  renderGrid();
}

// ── Init ──────────────────────────────────────────────────────────────────────

refresh();
const requestedSample = getSampleById(new URLSearchParams(location.search).get('sample'));
if (requestedSample) showChecklist(requestedSample);
