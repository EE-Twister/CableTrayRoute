import './components/navigation.js';
import { saveProject as dsSaveProject, loadProject as dsLoadProject, exportProject, importProject } from '../dataStore.mjs';
import { PROJECT_TEMPLATES } from './projectTemplates.js';
import {
  getProjectState,
  setProjectState,
  listSavedProjects as listSavedProjectsStorage,
  getAuthContextState,
  setAuthContextState,
  clearAuthContextState,
  getSavedProjectsError,
  writeSavedProject,
  readSavedProject,
  removeSavedProject
} from '../projectStorage.js';
import { openModal, showAlertModal, ensureFieldAssistiveText } from './components/modal.js';
import { mountProfileControl, signOutCurrentUser, updateAuthSessionControls } from './authProfileControl.js';
import {
  createAuthContextFromSupabaseSession,
  isSupabaseAuthContext,
  supabaseDeleteProject,
  supabaseListProjects,
  supabaseListProjectSummaries,
  supabaseLoadProject,
  supabaseRefreshSession,
  supabaseSaveProject
} from './supabaseBackend.js';

function listProjects() {
  return listSavedProjectsStorage();
}

function sortProjectNames(names) {
  return [...new Set(names.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function listAvailableProjects() {
  const localProjects = listProjects();
  const auth = getAuthContext();
  if (!isSupabaseAuthContext(auth)) return localProjects;
  try {
    const cloudProjects = await supabaseListProjects(auth);
    return sortProjectNames([...localProjects, ...cloudProjects]);
  } catch (err) {
    console.warn('[projectManager] Supabase project list failed:', err?.message || err);
    return localProjects;
  }
}

function dispatchProjectSyncStatus({ label, state = 'local', detail = '' } = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('ctr:project-sync-status', {
    detail: {
      label: label || 'Local',
      state,
      detail
    }
  }));
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function countOneLineComponentsFromRecord(record = {}) {
  const oneLine = record.oneLine;
  if (Array.isArray(oneLine)) return oneLine.length;
  if (!oneLine || typeof oneLine !== 'object') return 0;
  const sheets = Array.isArray(oneLine.sheets) ? oneLine.sheets : [];
  return sheets.reduce((sum, sheet) => sum + countArray(sheet?.components), 0);
}

function summarizeSavedProjectRecord(name, record = {}) {
  const raceways = record.raceways && typeof record.raceways === 'object' ? record.raceways : {};
  const meta = record.__meta && typeof record.__meta === 'object' ? record.__meta : {};
  return {
    name,
    source: 'local',
    sources: ['local'],
    createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : null,
    updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : null,
    counts: {
      equipment: countArray(record.equipment),
      loads: countArray(record.loads),
      cables: countArray(record.cables),
      raceways: countArray(raceways.trays) + countArray(raceways.conduits) + countArray(raceways.ductbanks),
      oneLineComponents: countOneLineComponentsFromRecord(record)
    }
  };
}

function mergeProjectSummaries(localSummaries, cloudSummaries) {
  const byName = new Map();
  const merge = summary => {
    const name = normalizeProjectName(summary?.name);
    if (!name) return;
    const existing = byName.get(name) || {
      name,
      source: '',
      sources: [],
      createdAt: null,
      updatedAt: null,
      counts: {
        equipment: 0,
        loads: 0,
        cables: 0,
        raceways: 0,
        oneLineComponents: 0
      }
    };
    const sources = new Set([...(existing.sources || []), ...(summary.sources || [summary.source]).filter(Boolean)]);
    const nextUpdated = summary.updatedAt || existing.updatedAt;
    const existingTime = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
    const nextTime = nextUpdated ? Date.parse(nextUpdated) : 0;
    byName.set(name, {
      ...existing,
      ...summary,
      name,
      sources: [...sources],
      source: sources.has('local') && sources.has('cloud') ? 'local+cloud' : [...sources][0] || 'local',
      createdAt: existing.createdAt || summary.createdAt || null,
      updatedAt: nextTime >= existingTime ? nextUpdated : existing.updatedAt,
      counts: {
        ...existing.counts,
        ...(summary.counts || {})
      }
    });
  };
  localSummaries.forEach(merge);
  cloudSummaries.forEach(merge);
  return [...byName.values()].sort((a, b) => {
    const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

async function listProjectSummaries() {
  const localSummaries = listProjects().map(name => summarizeSavedProjectRecord(name, readSavedProject(name) || {}));
  const auth = getAuthContext();
  if (!isSupabaseAuthContext(auth)) return localSummaries;
  try {
    const cloudSummaries = await supabaseListProjectSummaries(auth);
    return mergeProjectSummaries(localSummaries, cloudSummaries);
  } catch (err) {
    console.warn('[projectManager] Supabase project summaries failed:', err?.message || err);
    return localSummaries;
  }
}

function normalizeProjectName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

function currentProjectName() {
  const hashName = normalizeProjectName(currentProject());
  if (hashName) return hashName;
  return '';
}



function applyProjectStateName(name) {
  const trimmed = normalizeProjectName(name);
  if (!trimmed) return '';
  try {
    const state = getProjectState();
    if ((state.name || '') !== trimmed) {
      state.name = trimmed;
      setProjectState(state);
    }
  } catch (e) {
    // Non-critical: name will re-sync on next load — no user action needed
    console.warn('Project state update failed', e);
  }
  return trimmed;
}

function createEmptyProjectSections() {
  return {
    equipment: [],
    panels: [],
    loads: [],
    cables: [],
    mccLineups: [],
    raceways: { trays: [], conduits: [], ductbanks: [] },
    oneLine: { activeSheet: 0, sheets: [] }
  };
}

function clearAuthContext() {
  clearAuthContextState();
  updateAuthSessionControls();
}

function formatProjectDate(value) {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatProjectSource(summary) {
  const sources = new Set(summary?.sources || [summary?.source].filter(Boolean));
  if (sources.has('local') && sources.has('cloud')) return 'Local + cloud';
  if (sources.has('cloud')) return 'Cloud';
  return 'Local';
}

function getAuthContext() {
  return getAuthContextState();
}

function validateProjectName(name, existingNames, { allowExisting = true, currentName = '' } = {}) {
  const trimmed = name.trim();
  if (!trimmed) return 'Project name is required.';
  if (trimmed.includes(':')) return 'Project name cannot include the ":" character.';
  const lower = trimmed.toLowerCase();
  const currentLower = currentName.trim().toLowerCase();
  if (!allowExisting && existingNames.some(n => n.toLowerCase() === lower && n.toLowerCase() !== currentLower)) {
    return 'A project with that name already exists. Choose a different name or use Load Project.';
  }
  return '';
}

function currentProject() {
  return decodeURIComponent(location.hash.slice(1)) || '';
}

function setProjectHash(name) {
  location.hash = encodeURIComponent(name);
  globalThis.applyProjectHash?.();
}

async function promptProjectName({
  title,
  confirmLabel,
  message,
  initialValue = '',
  allowExisting = true,
  currentName = ''
} = {}) {
  if (typeof document === 'undefined') return '';
  const existing = listProjects();
  const inputId = `project-name-${Math.random().toString(36).slice(2)}`;
  let input;
  let inputAssistive;
  const result = await openModal({
    title: title || 'Project Name',
    description: message || (allowExisting ? 'Enter a project name. Existing projects with the same name will be overwritten.' : 'Enter a unique name for the project.'),
    primaryText: confirmLabel || 'Save',
    onSubmit() {
      const value = input.value.trim();
      const validation = validateProjectName(value, existing, { allowExisting, currentName });
      if (validation) {
        inputAssistive.setError(validation);
        input.focus();
        return false;
      }
      inputAssistive.setError('');
      return value;
    },
    render(container, controls) {
      const doc = container.ownerDocument;
      const form = doc.createElement('form');
      form.className = 'modal-form';
      const label = doc.createElement('label');
      label.setAttribute('for', inputId);
      label.textContent = 'Project name';
      input = doc.createElement('input');
      input.type = 'text';
      input.id = inputId;
      input.name = 'projectName';
      input.required = true;
      input.value = initialValue;
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (controls.descriptionId) {
        input.setAttribute('aria-describedby', controls.descriptionId);
      }
      input.addEventListener('input', () => {
        const value = input.value.trim();
        const validation = validateProjectName(value, existing, { allowExisting, currentName });
        inputAssistive.setError(validation);
        controls.setPrimaryDisabled(!value);
      });
      input.addEventListener('change', () => {
        const value = input.value.trim();
        const validation = validateProjectName(value, existing, { allowExisting, currentName });
        inputAssistive.setError(validation);
      });
      label.appendChild(input);
      form.appendChild(label);
      inputAssistive = ensureFieldAssistiveText(input, {
        helperText: allowExisting
          ? 'Use a clear project name. Existing names will overwrite on save.'
          : 'Use a unique project name. Example: Building A - Phase 2.',
        errorClass: 'modal-error'
      });
      controls.registerForm(form);
      controls.setPrimaryDisabled(!initialValue.trim());
      controls.setInitialFocus(input);
      container.appendChild(form);
      return input;
    }
  });
  return typeof result === 'string' ? result.trim() : '';
}

async function promptLoadProject(projects) {
  if (typeof document === 'undefined') return projects[0] || '';
  if (!projects.length) {
    await showAlertModal('No Saved Projects', 'There are no saved projects to load yet. Save a project first.');
    return '';
  }
  let selected = projects[0] || '';
  const selectId = `project-select-${Math.random().toString(36).slice(2)}`;
  const result = await openModal({
    title: 'Load Project',
    description: 'Select a saved project to load.',
    primaryText: 'Load',
    onSubmit() {
      if (!selected) return false;
      return selected;
    },
    render(container, controls) {
      const doc = container.ownerDocument;
      const form = doc.createElement('form');
      form.className = 'modal-form';
      const label = doc.createElement('label');
      label.setAttribute('for', selectId);
      label.textContent = 'Saved projects';
      const select = doc.createElement('select');
      select.id = selectId;
      select.name = 'projectName';
      select.size = Math.min(6, Math.max(3, projects.length));
      select.className = 'modal-select';
      projects.forEach(name => {
        const option = doc.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
      if (controls.descriptionId) {
        select.setAttribute('aria-describedby', controls.descriptionId);
      }
      select.value = selected;
      select.addEventListener('change', () => {
        selected = select.value;
        controls.setPrimaryDisabled(!selected);
      });
      select.addEventListener('dblclick', () => {
        if (select.value && controls.primaryBtn) {
          controls.primaryBtn.click();
        }
      });
      label.appendChild(select);
      form.appendChild(label);
      controls.registerForm(form);
      controls.setPrimaryDisabled(!selected);
      controls.setInitialFocus(select);
      container.appendChild(form);
      return select;
    }
  });
  return typeof result === 'string' ? result : '';
}

async function selectProjectTemplate() {
  return openModal({
    title: 'Choose a Project Template',
    primaryText: 'Use Template',
    secondaryText: 'Skip',
    defaultWidth: 'wide',
    render(body, controller) {
      controller.setPrimaryDisabled(true);
      let chosen = null;

      const grid = document.createElement('div');
      grid.className = 'template-grid';

      const allOptions = [
        { id: 'blank', name: 'Blank', icon: '📄', description: 'Start with an empty project.' },
        ...PROJECT_TEMPLATES
      ];

      allOptions.forEach(tpl => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'template-card';
        card.dataset.templateId = tpl.id;
        card.innerHTML = `
          <span class="template-card__icon" aria-hidden="true">${tpl.icon}</span>
          <span class="template-card__name">${tpl.name}</span>
          <span class="template-card__desc">${tpl.description}</span>
        `;
        card.addEventListener('click', () => {
          grid.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          chosen = tpl.id === 'blank' ? null : PROJECT_TEMPLATES.find(t => t.id === tpl.id);
          controller.setPrimaryDisabled(false);
        });
        card.addEventListener('dblclick', () => {
          controller.close(chosen);
        });
        grid.appendChild(card);
      });

      body.appendChild(grid);

      controller.onSubmit = () => controller.close(chosen);
    }
  });
}

async function newProject() {
  const name = await promptProjectName({
    title: 'Create New Project',
    confirmLabel: 'Create',
    allowExisting: false,
    message: 'Choose a unique name for the new project.'
  });
  const trimmed = normalizeProjectName(name);
  if (!trimmed) return;

  const template = await selectProjectTemplate();

  setProjectHash(trimmed);
  applyProjectStateName(trimmed);
  try {
    const sections = createEmptyProjectSections();
    if (template) {
      sections.cables = Array.isArray(template.sections.cables) ? [...template.sections.cables] : [];
      sections.raceways.trays = Array.isArray(template.sections.raceways?.trays) ? [...template.sections.raceways.trays] : [];
      sections.raceways.conduits = Array.isArray(template.sections.raceways?.conduits) ? [...template.sections.raceways.conduits] : [];
      sections.raceways.ductbanks = Array.isArray(template.sections.raceways?.ductbanks) ? [...template.sections.raceways.ductbanks] : [];
    }
    writeSavedProject(trimmed, sections);
  } catch (e) {
    console.error('Failed to initialize new project storage', e);
    await showAlertModal('Project Error', 'Failed to create new project storage. Please try again or reload the page.');
    return;
  }
  location.reload();
}

function renameProject(name) {
  const trimmed = normalizeProjectName(name);
  if (!trimmed) throw new Error('Project name is required.');
  const current = currentProjectName();
  const existing = listProjects();
  const validation = validateProjectName(trimmed, existing, { allowExisting: false, currentName: current });
  if (validation) throw new Error(validation);
  if (current && trimmed !== current) {
    try {
      const record = readSavedProject(current);
      if (record) {
        writeSavedProject(trimmed, record);
        removeSavedProject(current);
      }
      const auth = getAuthContext();
      if (isSupabaseAuthContext(auth)) {
        supabaseDeleteProject(auth, current).catch(err => {
          console.warn('[projectManager] Supabase old project removal failed:', err?.message || err);
        });
      }
    } catch (e) {
      console.error('Project rename persistence failed', e);
      // Fire-and-forget: renameProject is synchronous so we don't await the modal
      showAlertModal('Rename Warning', 'The project was renamed but could not be saved to storage. Your changes may be lost on reload.');
    }
  }
  setProjectHash(trimmed);
  applyProjectStateName(trimmed);
  return trimmed;
}

async function serverSaveProject(name) {
  const auth = getAuthContext();
  if (!auth) {
    return { attempted: false, ok: false };
  }
  if (isSupabaseAuthContext(auth)) {
    await supabaseSaveProject(auth, name, exportProject());
    return { attempted: true, ok: true };
  }
  const res = await fetch(`/projects/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': auth.csrfToken
    },
    body: JSON.stringify(exportProject())
  });
  if (res.status === 401 || res.status === 403) clearAuthContext();
  return { attempted: true, ok: res.ok };
}

async function serverLoadProject(name) {
  const auth = getAuthContext();
  if (!auth) return false;
  if (isSupabaseAuthContext(auth)) {
    const data = await supabaseLoadProject(auth, name);
    if (!data) return false;
    importProject(data);
    return true;
  }
  const res = await fetch(`/projects/${encodeURIComponent(name)}`, {
    headers: {
      'X-CSRF-Token': auth.csrfToken
    }
  });
  if (res.status === 401 || res.status === 403) {
    clearAuthContext();
    return false;
  }
  if (!res.ok) return false;
  const { data } = await res.json();
  importProject(data);
  return true;
}

async function saveProject(options = {}) {
  const { skipManual = false } = options || {};
  if (!skipManual) {
    const manualSaver = globalThis.manualSaveProject;
    if (typeof manualSaver === 'function') {
      let manualResult;
      try {
        manualResult = await manualSaver();
      } catch (err) {
        console.error(err);
        manualResult = null;
      }
      if (manualResult === false) {
        return;
      }
    }
  }
  let name = currentProjectName();
  if (!name) {
    let suggested = '';
    try { suggested = getProjectState().name || ''; } catch (e) { console.warn('Failed to read project name for save dialog', e); }
    name = await promptProjectName({
      title: 'Save Project',
      confirmLabel: 'Save',
      allowExisting: true,
      initialValue: suggested,
      currentName: suggested
    });
  }
  if (!name) return;
  setProjectHash(name);
  // Save locally and attempt server sync if logged in
  dsSaveProject(name);
  const storageError = getSavedProjectsError();
  let serverResult = { attempted: false, ok: false };
  let serverError = null;
  try {
    serverResult = await serverSaveProject(name);
  } catch (e) {
    console.error(e);
    serverError = e;
  }
  const { attempted, ok } = serverResult;
  if (storageError) {
    const baseMessage = storageError.message || 'Saved projects could not be updated. Clear saved data in Settings and try again.';
    let detail;
    if (!attempted) {
      detail = 'The project was saved locally, but not uploaded to the server.';
    } else if (ok) {
      detail = 'The project was uploaded to the server, but the local copy could not be updated.';
    } else {
      detail = 'The project was not uploaded to the server.';
    }
    await showAlertModal('Save Failed', `${baseMessage} ${detail}`.trim());
    return;
  }
  let message;
  if (serverError || (attempted && !ok)) {
    message = `Project "${name}" saved locally. Server sync failed.`;
    dispatchProjectSyncStatus({ label: 'Sync failed', state: 'error', detail: message });
  } else if (!attempted) {
    message = `Project "${name}" saved locally.`;
    dispatchProjectSyncStatus({ label: 'Local', state: 'local', detail: message });
  } else {
    message = `Project "${name}" successfully saved.`;
    dispatchProjectSyncStatus({ label: 'Saved', state: 'saved', detail: message });
  }
  await showAlertModal('Project Saved', message);
}

async function loadProject() {
  const projects = await listAvailableProjects();
  const storageError = getSavedProjectsError();
  if (storageError) {
    const message = storageError.message || 'Saved projects could not be read. Clear saved data in Settings and try again.';
    await showAlertModal('Saved Projects Unavailable', message);
    return;
  }
  const name = await promptLoadProject(projects);
  if (!name) return;
  setProjectHash(name);
  let loaded = false;
  try { loaded = await serverLoadProject(name); } catch (e) { console.error(e); }
  if (!loaded) {
    const stored = dsLoadProject(name);
    const postLoadError = getSavedProjectsError();
    if (postLoadError) {
      const message = postLoadError.message || 'Saved projects could not be read. Clear saved data in Settings and try again.';
      await showAlertModal('Saved Project Migration Failed', message);
      return;
    }
    loaded = stored;
  }
  if (!loaded) {
    await showAlertModal('Project Not Found', `Project "${name}" could not be loaded from local storage.`);
    return;
  }
  location.reload();
}

async function openProjectByName(name) {
  const trimmed = normalizeProjectName(name);
  if (!trimmed) return false;
  setProjectHash(trimmed);
  let loaded = false;
  try { loaded = await serverLoadProject(trimmed); } catch (e) { console.error(e); }
  if (!loaded) loaded = dsLoadProject(trimmed);
  if (!loaded) {
    await showAlertModal('Project Not Found', `Project "${trimmed}" could not be loaded from your saved projects.`);
    return false;
  }
  location.reload();
  return true;
}

async function deleteProject(name) {
  const trimmed = normalizeProjectName(name);
  if (!trimmed) return false;
  const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function'
    ? true
    : window.confirm(`Delete "${trimmed}" from your saved projects? This cannot be undone.`);
  if (!confirmed) return false;
  let cloudFailed = false;
  try {
    removeSavedProject(trimmed);
  } catch (err) {
    await showAlertModal('Delete Failed', err?.message || 'The local project could not be deleted.');
    return false;
  }
  const auth = getAuthContext();
  if (isSupabaseAuthContext(auth)) {
    try {
      await supabaseDeleteProject(auth, trimmed);
    } catch (err) {
      cloudFailed = true;
      console.warn('[projectManager] Supabase project delete failed:', err?.message || err);
    }
  }
  await showAlertModal(
    cloudFailed ? 'Local Project Deleted' : 'Project Deleted',
    cloudFailed
      ? `Project "${trimmed}" was deleted locally, but cloud deletion failed. Try again after reconnecting.`
      : `Project "${trimmed}" was deleted.`
  );
  return true;
}

function currentProjectSummary() {
  const state = getProjectState();
  const settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
  return {
    name: currentProjectName() || normalizeProjectName(state.name) || 'Untitled Project',
    counts: {
      equipment: countArray(settings.equipment),
      loads: countArray(settings.loadList),
      cables: countArray(state.cables),
      raceways: countArray(state.trays) + countArray(state.conduits) + countArray(state.ductbanks),
      oneLineComponents: countOneLineComponentsFromRecord({ oneLine: settings.oneLineDiagram })
    }
  };
}

function renderProjectEmptyState(container) {
  const current = currentProjectSummary();
  container.innerHTML = `
    <div class="project-workspace-empty">
      <div>
        <span class="project-workspace-eyebrow">First project</span>
        <h3>Create or open a project</h3>
        <p>Start a named project, open saved work, or use a sample project to explore the workflow.</p>
      </div>
      <div class="project-workspace-actions">
        <button type="button" class="btn primary-btn" data-project-action="new">Create New Project</button>
        <button type="button" class="btn" data-project-action="load">Open Existing Project</button>
        <a class="btn" href="samplegallery.html">Try a Sample Project</a>
      </div>
      <dl class="project-workspace-current">
        <div><dt>Current workspace</dt><dd>${escapeHtml(current.name)}</dd></div>
        <div><dt>Records</dt><dd>${escapeHtml(current.counts.equipment + current.counts.loads + current.counts.cables)}</dd></div>
        <div><dt>Raceways</dt><dd>${escapeHtml(current.counts.raceways)}</dd></div>
      </dl>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderProjectRows(container, summaries) {
  const current = currentProjectName();
  container.innerHTML = `
    <div class="project-workspace-list" role="list">
      ${summaries.map(summary => {
        const counts = summary.counts || {};
        const isCurrent = current && summary.name === current;
        return `
          <article class="project-workspace-row${isCurrent ? ' is-current' : ''}" role="listitem">
            <div class="project-workspace-row__main">
              <strong>${escapeHtml(summary.name)}</strong>
              <span>${escapeHtml(formatProjectSource(summary))} - ${escapeHtml(formatProjectDate(summary.updatedAt))}</span>
            </div>
            <div class="project-workspace-row__metrics" aria-label="Project record counts">
              <span>${escapeHtml(counts.equipment || 0)} equipment</span>
              <span>${escapeHtml(counts.loads || 0)} loads</span>
              <span>${escapeHtml(counts.cables || 0)} cables</span>
              <span>${escapeHtml(counts.raceways || 0)} raceways</span>
            </div>
            <div class="project-workspace-row__actions">
              <button type="button" class="btn btn-sm" data-project-open="${escapeHtml(summary.name)}">${isCurrent ? 'Reload' : 'Open'}</button>
              <button type="button" class="btn btn-sm btn-danger" data-project-delete="${escapeHtml(summary.name)}">Delete</button>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

async function refreshProjectWorkspace(container) {
  container.setAttribute('aria-busy', 'true');
  try {
    const summaries = await listProjectSummaries();
    if (!summaries.length) {
      renderProjectEmptyState(container);
    } else {
      renderProjectRows(container, summaries);
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="text-muted">Saved projects could not be loaded. Try again after reconnecting.</p>';
  } finally {
    container.setAttribute('aria-busy', 'false');
  }
}

function mountProjectWorkspace() {
  const containers = document.querySelectorAll('[data-project-workspace]');
  if (!containers.length) return;
  if (!document.body.dataset.projectGlobalActionsMounted) {
    document.body.dataset.projectGlobalActionsMounted = 'true';
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const actionButton = target?.closest('[data-project-action]');
      if (!actionButton) return;
      if (actionButton.closest('[data-project-workspace]')) return;
      const action = actionButton.getAttribute('data-project-action');
      if (action === 'new') newProject().catch(console.error);
      if (action === 'load') loadProject().catch(console.error);
      if (action === 'save') {
        saveProject()
          .then(() => {
            document.querySelectorAll('[data-project-workspace]').forEach(container => {
              refreshProjectWorkspace(container).catch(console.error);
            });
          })
          .catch(console.error);
      }
    });
  }
  containers.forEach(container => {
    if (container.dataset.projectWorkspaceMounted === 'true') return;
    container.dataset.projectWorkspaceMounted = 'true';
    container.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const openButton = target?.closest('[data-project-open]');
      const deleteButton = target?.closest('[data-project-delete]');
      const actionButton = target?.closest('[data-project-action]');
      if (openButton) {
        openProjectByName(openButton.getAttribute('data-project-open')).catch(console.error);
        return;
      }
      if (deleteButton) {
        deleteProject(deleteButton.getAttribute('data-project-delete'))
          .then(changed => {
            if (changed) refreshProjectWorkspace(container).catch(console.error);
          })
          .catch(console.error);
        return;
      }
      const action = actionButton?.getAttribute('data-project-action');
      if (action === 'new') newProject().catch(console.error);
      if (action === 'load') loadProject().catch(console.error);
      if (action === 'save') saveProject().then(() => refreshProjectWorkspace(container)).catch(console.error);
    });
    refreshProjectWorkspace(container).catch(console.error);
  });
}



async function requestSnapshotList(projectName) {
  const auth = getAuthContext();
  if (!auth) throw new Error('Login required to manage snapshots.');
  const res = await fetch(`/projects/${encodeURIComponent(projectName)}/snapshots`, {
    headers: {
      'X-CSRF-Token': auth.csrfToken
    }
  });
  if (res.status === 401 || res.status === 403) clearAuthContext();
  if (!res.ok) throw new Error('Could not load snapshots.');
  const payload = await res.json();
  return Array.isArray(payload.snapshots) ? payload.snapshots : [];
}

async function createSnapshot(projectName, mode) {
  const auth = getAuthContext();
  if (!auth) throw new Error('Login required to create share links.');
  const res = await fetch(`/projects/${encodeURIComponent(projectName)}/snapshots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': auth.csrfToken
    },
    body: JSON.stringify({ mode })
  });
  if (res.status === 401 || res.status === 403) clearAuthContext();
  if (!res.ok) throw new Error('Could not create share link.');
  return res.json();
}

async function revokeSnapshot(projectName, snapshotId) {
  const auth = getAuthContext();
  if (!auth) throw new Error('Login required to revoke share links.');
  const res = await fetch(`/projects/${encodeURIComponent(projectName)}/snapshots/${encodeURIComponent(snapshotId)}`, {
    method: 'DELETE',
    headers: {
      'X-CSRF-Token': auth.csrfToken
    }
  });
  if (res.status === 401 || res.status === 403) clearAuthContext();
  if (!res.ok) throw new Error('Could not revoke share link.');
}

function renderSnapshotRows(container, snapshots, projectName, refresh) {
  container.innerHTML = '';
  if (!snapshots.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No active share links for this project.';
    container.appendChild(empty);
    return;
  }
  snapshots.forEach(snapshot => {
    const row = document.createElement('div');
    row.className = 'snapshot-row';
    const status = snapshot.revokedAt ? 'Revoked' : snapshot.expired ? 'Expired' : 'Active';
    const modeStrong = document.createElement('strong');
    modeStrong.textContent = snapshot.mode === 'edit' ? 'Editable' : 'Read-only';
    row.appendChild(modeStrong);
    row.appendChild(document.createTextNode(` · ${status}`));
    row.appendChild(document.createElement('br'));
    const dateSmall = document.createElement('small');
    dateSmall.textContent = `Created ${new Date(snapshot.createdAt).toLocaleString()} · Expires ${new Date(snapshot.expiresAt).toLocaleString()}`;
    row.appendChild(dateSmall);
    if (!snapshot.revokedAt) {
      const revokeButton = document.createElement('button');
      revokeButton.className = 'btn';
      revokeButton.type = 'button';
      revokeButton.textContent = 'Revoke';
      revokeButton.addEventListener('click', async () => {
        try {
          await revokeSnapshot(projectName, snapshot.id);
          await refresh();
        } catch (err) {
          await showAlertModal('Revocation Failed', err.message || 'Unable to revoke link.');
        }
      });
      row.appendChild(document.createElement('br'));
      row.appendChild(revokeButton);
    }
    container.appendChild(row);
  });
}

async function openShareModal() {
  const projectName = currentProjectName();
  if (!projectName) {
    await showAlertModal('Save Required', 'Save the project before creating a share link.');
    return;
  }
  if (!getAuthContext()) {
    await showAlertModal('Login Required', 'Login to create and manage share links.');
    return;
  }
  if (isSupabaseAuthContext(getAuthContext())) {
    await showAlertModal('Share Links Unavailable', 'Share links currently require the Express collaboration server. Supabase-hosted projects can still be saved and loaded from your account.');
    return;
  }

  let listContainer;
  let infoText;

  async function refresh() {
    const snapshots = await requestSnapshotList(projectName);
    renderSnapshotRows(listContainer, snapshots, projectName, refresh);
  }

  await openModal({
    title: 'Share Project Snapshot',
    description: 'Create read-only or editable links, then revoke links you no longer want active.',
    primaryText: 'Close',
    render(container) {
      const controls = document.createElement('div');
      controls.className = 'modal-form';

      const readOnlyBtn = document.createElement('button');
      readOnlyBtn.type = 'button';
      readOnlyBtn.className = 'btn';
      readOnlyBtn.textContent = 'Create Read-only Link';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn';
      editBtn.textContent = 'Create Editable Link';

      infoText = document.createElement('p');
      infoText.textContent = 'Links expire with your auth token lifetime.';

      listContainer = document.createElement('div');
      listContainer.className = 'snapshot-list';
      listContainer.textContent = 'Loading links...';

      const handleCreate = async mode => {
        try {
          const snapshot = await createSnapshot(projectName, mode);
          const link = snapshot.url || `${location.origin}/oneline.html?snapshotToken=${snapshot.token}`;
          await navigator.clipboard.writeText(link);
          infoText.textContent = `${mode === 'edit' ? 'Editable' : 'Read-only'} link copied. Expires ${new Date(snapshot.expiresAt).toLocaleString()}.`;
          await refresh();
        } catch (err) {
          await showAlertModal('Share Failed', err.message || 'Unable to create link.');
        }
      };

      readOnlyBtn.addEventListener('click', () => { handleCreate('read').catch(console.error); });
      editBtn.addEventListener('click', () => { handleCreate('edit').catch(console.error); });

      controls.append(readOnlyBtn, editBtn, infoText, listContainer);
      container.appendChild(controls);
      refresh().catch(async err => {
        listContainer.textContent = 'Could not load links.';
        await showAlertModal('Share Failed', err.message || 'Unable to load links.');
      });
    }
  });
}

function mountShareControls() {
  const header = document.querySelector('.page-header');
  if (!header || document.getElementById('project-share-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'project-share-btn';
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = 'Share Project';
  btn.addEventListener('click', () => {
    openShareModal().catch(console.error);
  });
  header.appendChild(btn);
}

function showSessionBanner(message, actions) {
  let banner = document.getElementById('session-expiry-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'session-expiry-banner';
    banner.className = 'session-expiry-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    document.body.prepend(banner);
  }
  banner.innerHTML = '';
  const text = document.createElement('span');
  text.className = 'session-expiry-banner__text';
  text.textContent = message;
  banner.appendChild(text);
  for (const { label, onClick } of actions) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'session-expiry-banner__btn';
    btn.addEventListener('click', onClick);
    banner.appendChild(btn);
  }
}

function dismissSessionBanner() {
  document.getElementById('session-expiry-banner')?.remove();
}

async function refreshSession() {
  const auth = getAuthContext();
  if (!auth) return false;
  if (isSupabaseAuthContext(auth)) {
    try {
      const session = await supabaseRefreshSession(auth);
      setAuthContextState(createAuthContextFromSupabaseSession(session));
      updateAuthSessionControls();
      return true;
    } catch (err) {
      console.warn('[projectManager] Supabase session refresh failed:', err.message || err);
      return false;
    }
  }
  try {
    const res = await fetch('/session/refresh', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': auth.csrfToken
      }
    });
    if (!res.ok) return false;
    const { csrfToken, expiresAt } = await res.json();
    setAuthContextState({ csrfToken, expiresAt, user: auth.user, role: auth.role });
    updateAuthSessionControls();
    return true;
  } catch (err) {
    console.warn('[projectManager] Auth token refresh failed:', err.message || err);
    return false;
  }
}

function initProjectManagerControls() {
  const wireButton = (id, handler) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.projectManagerWired === 'true') return;
    btn.dataset.projectManagerWired = 'true';
    btn.addEventListener('click', () => { handler().catch(console.error); });
  };

  wireButton('new-project-btn', newProject);
  wireButton('save-project-btn', saveProject);
  wireButton('load-project-btn', loadProject);
  mountShareControls();
  mountProfileControl();
  mountProjectWorkspace();
  dispatchProjectSyncStatus({
    label: isSupabaseAuthContext(getAuthContext()) ? 'Cloud ready' : 'Local',
    state: isSupabaseAuthContext(getAuthContext()) ? 'ready' : 'local',
    detail: isSupabaseAuthContext(getAuthContext())
      ? 'Project saves can sync to your account.'
      : 'Project saves are local until you log in.'
  });

  // Add login/logout button
  const menu = document.getElementById('settings-menu');
  if (menu && !document.getElementById('auth-session-btn')) {
    const btn = document.createElement('button');
    btn.id = 'auth-session-btn';
    updateAuthSessionControls();
    btn.addEventListener('click', signOutCurrentUser);
    menu.appendChild(btn);
  }
  updateAuthSessionControls();

  if (!window.__projectManagerSessionListenersWired) {
    window.__projectManagerSessionListenersWired = true;
    window.addEventListener('session-expiring', () => {
      showSessionBanner('Your session expires in 5 minutes. Unsaved server changes may be lost.', [
        {
          label: 'Stay Logged In',
          onClick: async () => {
            const ok = await refreshSession();
            if (ok) {
              dismissSessionBanner();
            } else {
              showSessionBanner('Could not refresh session. Please save your work and log in again.', [
                { label: 'Go to Login', onClick: () => { location.href = 'login.html'; } },
                { label: 'Dismiss', onClick: dismissSessionBanner }
              ]);
            }
          }
        },
        { label: 'Dismiss', onClick: dismissSessionBanner }
      ]);
    });

    window.addEventListener('session-expired', () => {
      showSessionBanner('Your session has expired. Server sync is paused until you log in again.', [
        { label: 'Log In', onClick: () => { location.href = 'login.html'; } },
        { label: 'Dismiss', onClick: dismissSessionBanner }
      ]);
    });
  }
}

if (typeof window !== 'undefined') {
  window.projectManager = {
    listProjects,
    listProjectSummaries,
    newProject,
    renameProject,
    saveProject,
    loadProject,
    openProjectByName,
    deleteProject,
    refreshProjectWorkspace: () => {
      document.querySelectorAll('[data-project-workspace]').forEach(container => {
        refreshProjectWorkspace(container).catch(console.error);
      });
    }
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initProjectManagerControls, { once: true });
  } else {
    initProjectManagerControls();
  }
}
