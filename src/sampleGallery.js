import {
  buildGuidedDemoChecklist,
  buildSampleProjectSummary,
  normalizeSampleProjectManifest,
  prepareSampleProjectForImport,
  validateSampleProjectPayload,
} from '../analysis/sampleGallery.mjs';
import { exportProject, importProject, saveProject } from '../dataStore.mjs';
import { getProjectState, setProjectState } from '../projectStorage.js';
import '../site.js';

const MANIFEST_URL = 'samples/project-gallery.json';

function hasProjectData(project = {}) {
  const scheduleKeys = ['cables', 'trays', 'conduits', 'ductbanks', 'panels', 'equipment', 'loads'];
  const hasSchedules = scheduleKeys.some(key => Array.isArray(project[key]) && project[key].length > 0);
  const hasStudies = project.settings?.studyResults && Object.keys(project.settings.studyResults).length > 0;
  const hasOneLine = Array.isArray(project.oneLine?.sheets) && project.oneLine.sheets.length > 0;
  return Boolean(hasSchedules || hasStudies || hasOneLine);
}

function setStatus(message, variant = 'info') {
  const status = document.getElementById('sample-gallery-status');
  if (!status) return;
  status.textContent = message;
  status.className = `report-status report-status--${variant}`;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Unable to load ${path}: ${response.status}`);
  return response.json();
}

function makeTagList(tags = []) {
  const wrap = document.createElement('div');
  wrap.className = 'sample-gallery-tags';
  tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'dash-badge dash-badge--neutral';
    span.textContent = tag;
    wrap.appendChild(span);
  });
  return wrap;
}

function makeSummaryList(summary) {
  const list = document.createElement('ul');
  list.className = 'sample-gallery-summary';
  [
    ['Cables', summary.cables],
    ['Raceways', summary.trays + summary.conduits + summary.ductbanks],
    ['Equipment', summary.equipment],
    ['Studies', summary.studyCount],
  ].forEach(([label, value]) => {
    const item = document.createElement('li');
    const valueEl = document.createElement('strong');
    valueEl.textContent = value;
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    item.appendChild(valueEl);
    item.appendChild(labelEl);
    list.appendChild(item);
  });
  return list;
}

function makeChecklist(sample, payload) {
  const details = document.createElement('details');
  details.className = 'sample-gallery-checklist';
  const summary = document.createElement('summary');
  summary.textContent = 'Guided workflow';
  details.appendChild(summary);

  const list = document.createElement('ol');
  buildGuidedDemoChecklist(sample, payload).forEach(step => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = step.href;
    link.textContent = step.title;
    const description = document.createElement('span');
    description.textContent = step.description;
    item.appendChild(link);
    if (step.description) item.appendChild(description);
    list.appendChild(item);
  });
  details.appendChild(list);
  return details;
}

async function openSample(sample, payload) {
  const current = exportProject();
  if (hasProjectData(current)) {
    const proceed = window.confirm('Opening a sample project replaces the current local project in this browser. Continue?');
    if (!proceed) return;
  }

  const prepared = prepareSampleProjectForImport(sample, payload);
  prepared.settings.sampleProjectInfo.openedAt = new Date().toISOString();
  const imported = importProject(prepared);
  if (!imported) {
    setStatus('Sample import was cancelled or failed validation.', 'error');
    return;
  }

  const state = getProjectState();
  const projectName = sample.title || prepared.meta?.projectName || 'Sample Project';
  setProjectState({ ...state, name: projectName });
  window.currentProjectId = projectName;
  saveProject(projectName);
  setStatus(`${projectName} loaded. Opening guided start page...`, 'success');
  window.setTimeout(() => {
    window.location.href = sample.startPage || 'workflowdashboard.html';
  }, 250);
}

function renderSampleCard(container, sample, payload) {
  const validation = validateSampleProjectPayload(payload);
  const summary = buildSampleProjectSummary(payload);

  const article = document.createElement('article');
  article.className = 'sample-gallery-card';

  const preview = document.createElement('img');
  preview.src = sample.preview;
  preview.alt = '';
  preview.className = 'sample-gallery-preview';
  preview.loading = 'lazy';
  preview.decoding = 'async';

  const body = document.createElement('div');
  body.className = 'sample-gallery-card-body';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'sample-gallery-domain';
  eyebrow.textContent = sample.domain;

  const title = document.createElement('h2');
  title.textContent = sample.title;

  const description = document.createElement('p');
  description.textContent = sample.description;

  const actions = document.createElement('div');
  actions.className = 'controls-row';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'btn primary-btn';
  openButton.textContent = 'Open Sample';
  openButton.disabled = !validation.valid;
  openButton.addEventListener('click', () => {
    openSample(sample, payload).catch(err => {
      console.error('[sampleGallery] Open sample failed:', err);
      setStatus(err.message || 'Sample import failed.', 'error');
    });
  });

  const startLink = document.createElement('a');
  startLink.className = 'btn secondary-btn';
  startLink.href = sample.startPage || 'workflowdashboard.html';
  startLink.textContent = 'Start Page';

  actions.appendChild(openButton);
  actions.appendChild(startLink);

  body.appendChild(eyebrow);
  body.appendChild(title);
  body.appendChild(description);
  body.appendChild(makeTagList(sample.tags));
  body.appendChild(makeSummaryList(summary));
  body.appendChild(makeChecklist(sample, payload));
  if (!validation.valid) {
    const error = document.createElement('p');
    error.className = 'report-empty';
    error.textContent = `Sample validation failed: ${validation.errors.join('; ')}`;
    body.appendChild(error);
  }
  body.appendChild(actions);

  article.appendChild(preview);
  article.appendChild(body);
  container.appendChild(article);
}

async function renderGallery() {
  const container = document.getElementById('sample-gallery-grid');
  if (!container) return;
  container.innerHTML = '<p class="text-muted">Loading sample projects...</p>';

  try {
    const manifest = normalizeSampleProjectManifest(await fetchJson(MANIFEST_URL));
    const payloads = await Promise.all(manifest.samples.map(sample => fetchJson(sample.projectPath)));
    container.innerHTML = '';
    manifest.samples.forEach((sample, index) => {
      renderSampleCard(container, sample, payloads[index]);
    });
    setStatus(`${manifest.samples.length} sample projects ready.`, 'success');
  } catch (err) {
    console.error('[sampleGallery] Failed to render gallery:', err);
    container.innerHTML = '';
    const error = document.createElement('p');
    error.className = 'report-empty';
    error.textContent = err.message || 'Unable to load sample gallery.';
    container.appendChild(error);
    setStatus(error.textContent, 'error');
  }
}

window.addEventListener('DOMContentLoaded', renderGallery);

