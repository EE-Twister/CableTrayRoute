import './components/navigation.js';
import { saveProject as dsSaveProject, loadProject as dsLoadProject, exportProject, importProject } from '../dataStore.mjs';
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

function listProjects() {
  return listSavedProjectsStorage();
}

function normalizeProjectName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

function currentProjectName() {
  const hashName = normalizeProjectName(currentProject());
  if (hashName) return hashName;
  

async function requestSnapshotList(projectName) {
  const auth = getAuthContext();
  if (!auth) throw new Error('Login required to manage snapshots.');
  const res = await fetch(`/projects/${encodeURIComponent(projectName)}/snapshots`, {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
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
      'Authorization': `Bearer ${auth.token}`,
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
      'Authorization': `Bearer ${auth.token}`,
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
  if (!auth) {
    return { attempted: false, ok: false };
  }
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
  return { attempted: true, ok: res.ok };
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
  } else if (!attempted) {
    message = `Project "${name}" saved locally.`;
  } else {
    message = `Project "${name}" successfully saved.`;
  }
  await showAlertModal('Project Saved', message);
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



async function requestSnapshotList(projectName) {
  const auth = getAuthContext();
  if (!auth) throw new Error('Login required to manage snapshots.');
  const res = await fetch(`/projects/${encodeURIComponent(projectName)}/snapshots`, {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
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
      'Authorization': `Bearer ${auth.token}`,
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
      'Authorization': `Bearer ${auth.token}`,
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
  try {
    const res = await fetch('/session/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'X-CSRF-Token': auth.csrfToken
      }
    });
    if (!res.ok) return false;
    const { token, csrfToken, expiresAt } = await res.json();
    setAuthContextState({ token, csrfToken, expiresAt, user: auth.user });
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.projectManager = { listProjects, newProject, renameProject, saveProject, loadProject };
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('new-project-btn')?.addEventListener('click', () => { newProject().catch(console.error); });
    document.getElementById('save-project-btn')?.addEventListener('click', () => { saveProject().catch(console.error); });
    document.getElementById('load-project-btn')?.addEventListener('click', () => { loadProject().catch(console.error); });
    mountShareControls();

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

    // Session expiry warning banner
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
  });
}
