import { saveProject as dsSaveProject, loadProject as dsLoadProject, exportProject, importProject } from '../dataStore.mjs';
import {
  getProjectState,
  setProjectState,
  listSavedProjects as listSavedProjectsStorage,
  getAuthContextState,
  clearAuthContextState,
  getSavedProjectsError,
  writeSavedProject,
  readSavedProject,
  removeSavedProject
} from '../projectStorage.js';
import { openModal, showAlertModal } from './components/modal.js';

function listProjects() {
  return listSavedProjectsStorage();
}

function normalizeProjectName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

function currentProjectName() {
  const hashName = normalizeProjectName(currentProject());
  if (hashName) return hashName;
  if (typeof window !== 'undefined') {
    const globalName = normalizeProjectName(window.currentProjectId || '');
    if (globalName) return globalName;
  }
  try {
    const stateName = normalizeProjectName(getProjectState().name || '');
    if (stateName) return stateName;
  } catch {}
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
    raceways: { trays: [], conduits: [], ductbanks: [] },
    oneLine: { activeSheet: 0, sheets: [] }
  };
}

function clearAuthContext() {
  clearAuthContextState();
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
  const errorId = `${inputId}-error`;
  let input;
  let errorMsg;
  const result = await openModal({
    title: title || 'Project Name',
    description: message || (allowExisting ? 'Enter a project name. Existing projects with the same name will be overwritten.' : 'Enter a unique name for the project.'),
    primaryText: confirmLabel || 'Save',
    onSubmit() {
      const value = input.value.trim();
      const validation = validateProjectName(value, existing, { allowExisting, currentName });
      if (validation) {
        errorMsg.textContent = validation;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return false;
      }
      input.removeAttribute('aria-invalid');
      errorMsg.textContent = '';
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
        input.setAttribute('aria-describedby', `${controls.descriptionId} ${errorId}`.trim());
      } else {
        input.setAttribute('aria-describedby', errorId);
      }
      input.addEventListener('input', () => {
        errorMsg.textContent = '';
        input.removeAttribute('aria-invalid');
        controls.setPrimaryDisabled(!input.value.trim());
      });
      label.appendChild(input);
      form.appendChild(label);
      errorMsg = doc.createElement('p');
      errorMsg.id = errorId;
      errorMsg.className = 'modal-error';
      errorMsg.setAttribute('role', 'alert');
      errorMsg.textContent = '';
      form.appendChild(errorMsg);
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

async function newProject() {
  const name = await promptProjectName({
    title: 'Create New Project',
    confirmLabel: 'Create',
    allowExisting: false,
    message: 'Choose a unique name for the new project.'
  });
  const trimmed = normalizeProjectName(name);
  if (!trimmed) return;
  setProjectHash(trimmed);
  applyProjectStateName(trimmed);
  try {
    writeSavedProject(trimmed, createEmptyProjectSections());
  } catch (e) {
    console.error('Failed to initialize new project storage', e);
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
    } catch (e) {
      console.error('Project rename persistence failed', e);
    }
  }
  setProjectHash(trimmed);
  applyProjectStateName(trimmed);
  return trimmed;
}

async function serverSaveProject(name) {
  const auth = getAuthContext();
  if (!auth) return false;
  const res = await fetch(`/projects/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth.token}`,
      'X-CSRF-Token': auth.csrfToken
    },
    body: JSON.stringify(exportProject())
  });
  if (res.status === 401 || res.status === 403) clearAuthContext();
  return res.ok;
}

async function serverLoadProject(name) {
  const auth = getAuthContext();
  if (!auth) return false;
  const res = await fetch(`/projects/${encodeURIComponent(name)}`, {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
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
    try { suggested = getProjectState().name || ''; } catch {}
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
  let serverSynced = false;
  let serverError = null;
  try {
    serverSynced = await serverSaveProject(name);
  } catch (e) {
    console.error(e);
    serverError = e;
  }
  if (storageError) {
    const baseMessage = storageError.message || 'Saved projects could not be updated. Clear saved data in Settings and try again.';
    const detail = serverSynced
      ? 'The project was uploaded to the server, but the local copy could not be updated.'
      : 'The project was not uploaded to the server.';
    await showAlertModal('Save Failed', `${baseMessage} ${detail}`.trim());
    return;
  }
  const message = (serverError || !serverSynced)
    ? `Project "${name}" saved locally. Server sync failed.`
    : `Project "${name}" successfully saved.`;
  alert(message);
}

async function loadProject() {
  const projects = listProjects();
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

if (typeof window !== 'undefined') {
  window.projectManager = { listProjects, newProject, renameProject, saveProject, loadProject };
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('new-project-btn')?.addEventListener('click', () => { newProject().catch(console.error); });
    document.getElementById('save-project-btn')?.addEventListener('click', () => { saveProject().catch(console.error); });
    document.getElementById('load-project-btn')?.addEventListener('click', () => { loadProject().catch(console.error); });

    // Add login/logout button
    const menu = document.getElementById('settings-menu');
    if (menu) {
      const btn = document.createElement('button');
      function updateLabel() {
        btn.textContent = getAuthContext() ? 'Logout' : 'Login';
      }
      updateLabel();
      btn.addEventListener('click', () => {
        if (getAuthContext()) {
          clearAuthContext();
          updateLabel();
        } else {
          location.href = 'login.html';
        }
      });
      menu.appendChild(btn);
    }
  });
}
