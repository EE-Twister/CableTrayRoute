import './workflowStatus.js';
import '../site.js';
import { SAMPLE_REGISTRY, getSamplesByTag, validateSampleProject, migrateSampleProject } from '../analysis/sampleGallery.mjs';

const PROGRESS_KEY_PREFIX = 'ctr_sample_progress_';
const PROJECT_KEY = 'ctr_project';

// ── State ────────────────────────────────────────────────────────────────────

let activeTag = null;
let activeSampleId = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────

const grid = document.getElementById('gallery-grid');
const emptyMsg = document.getElementById('gallery-empty');
const tagBar = document.getElementById('tag-filter-bar');
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
  toast.textContent = msg;
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
    return JSON.parse(localStorage.getItem(progressKey(id)) || '{}');
  } catch {
    return {};
  }
}

function saveProgress(id, progress) {
  try {
    localStorage.setItem(progressKey(id), JSON.stringify(progress));
  } catch { /* quota */ }
}

function markStepDone(sampleId, stepIndex) {
  const p = loadProgress(sampleId);
  p[stepIndex] = true;
  saveProgress(sampleId, p);
}

// ── Tag chips ─────────────────────────────────────────────────────────────────

const allTags = [...new Set(SAMPLE_REGISTRY.flatMap(s => s.tags))].sort();

function renderTagChips() {
  tagBar.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.className = 'tag-chip';
  allChip.textContent = 'All';
  allChip.setAttribute('aria-pressed', activeTag === null ? 'true' : 'false');
  allChip.addEventListener('click', () => { activeTag = null; refresh(); });
  tagBar.appendChild(allChip);

  allTags.forEach(tag => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    chip.setAttribute('aria-pressed', activeTag === tag ? 'true' : 'false');
    chip.addEventListener('click', () => {
      activeTag = (activeTag === tag) ? null : tag;
      refresh();
    });
    tagBar.appendChild(chip);
  });
}

// ── Card rendering ────────────────────────────────────────────────────────────

function buildCard(sample) {
  const article = document.createElement('article');
  article.className = 'sample-card card';
  article.setAttribute('role', 'listitem');
  if (activeSampleId === sample.id) article.classList.add('sample-card--selected');
  article.dataset.sampleId = sample.id;

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

  const openBtn = document.createElement('button');
  openBtn.className = 'primary-btn';
  openBtn.textContent = 'Open Sample';
  openBtn.setAttribute('aria-label', `Open ${sample.title} sample project`);
  openBtn.addEventListener('click', () => openSample(sample));

  const dlLink = document.createElement('a');
  dlLink.className = 'btn';
  dlLink.href = sample.projectFile;
  dlLink.download = sample.id + '.json';
  dlLink.textContent = 'Download JSON';
  dlLink.setAttribute('aria-label', `Download ${sample.title} project JSON`);

  const guideBtn = document.createElement('button');
  guideBtn.className = 'btn';
  guideBtn.textContent = 'View Checklist';
  guideBtn.setAttribute('aria-label', `Show guided checklist for ${sample.title}`);
  guideBtn.addEventListener('click', () => showChecklist(sample));

  actions.appendChild(openBtn);
  actions.appendChild(dlLink);
  actions.appendChild(guideBtn);

  article.appendChild(header);
  article.appendChild(desc);
  article.appendChild(tagList);
  article.appendChild(actions);
  return article;
}

function renderGrid() {
  const samples = activeTag ? getSamplesByTag(activeTag) : SAMPLE_REGISTRY;
  grid.innerHTML = '';
  if (samples.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;
  samples.forEach(s => grid.appendChild(buildCard(s)));
}

// ── Open sample ───────────────────────────────────────────────────────────────

async function openSample(sample) {
  let projectData;
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
    localStorage.setItem(PROJECT_KEY, JSON.stringify(migrated));
  } catch {
    showToast('Could not save sample to project storage (storage full?)', 'error');
    return;
  }

  activeSampleId = sample.id;
  showChecklist(sample);
  renderGrid();
  showToast(`Loaded "${sample.title}" — follow the checklist to explore.`, 'success');
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
    link.href = step.page;
    link.textContent = `Go to ${step.page.replace('.html', '')} →`;
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

clearFilterBtn.addEventListener('click', () => { activeTag = null; refresh(); });
checklistCloseBtn.addEventListener('click', () => { checklistPanel.hidden = true; });

function refresh() {
  renderTagChips();
  renderGrid();
}

// ── Init ──────────────────────────────────────────────────────────────────────

refresh();
