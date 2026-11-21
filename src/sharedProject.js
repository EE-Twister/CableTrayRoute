import { exportProject, importProject, saveProject as saveLocalProject } from '../dataStore.mjs';
import { getProjectState, setProjectState } from '../projectStorage.js';
import { initCollaboration, stopCollaboration } from './collabManager.js';
import { openModal, showAlertModal } from './components/modal.js';
import {
  clearSharedSession,
  fetchSharedProject,
  getSnapshotToken,
  readSharedSession,
  sharedLocalProjectName,
  uploadSharedProject,
  writeSharedSession,
} from './sharedProjectApi.mjs';

const UPLOAD_DELAY_MS = 1500;
const BANNER_ID = 'shared-project-banner';

function getSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function stripTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('snapshotToken');
    window.history.replaceState(null, '', url);
  } catch {
    // Non-critical: the token only stays visible in the address bar.
  }
}

async function confirmOpen(project, mode, currentName) {
  return openModal({
    title: 'Open Shared Project',
    primaryText: 'Open shared project',
    secondaryText: 'Cancel',
    render(body) {
      const intro = document.createElement('p');
      intro.textContent = mode === 'edit'
        ? `"${project}" was shared with you for editing. You can save changes back to it.`
        : `"${project}" was shared with you as read-only. You can look around and change your own copy, but changes are not saved back.`;
      body.appendChild(intro);
      const note = document.createElement('p');
      note.textContent = currentName
        ? `The project open in this browser ("${currentName}") is saved under its own name first, and the shared project opens as "${sharedLocalProjectName(project)}".`
        : 'The project open in this browser has no name and will be replaced. Cancel and save it first if you need it.';
      body.appendChild(note);
    },
    onSubmit() {
      return true;
    },
  });
}

async function openSharedProject(token) {
  const fetched = await fetchSharedProject(token);
  if (!fetched.ok) {
    await showAlertModal(
      'Shared project unavailable',
      fetched.reason === 'not_found'
        ? 'This share link is invalid, has expired, or was revoked.'
        : 'The shared project could not be loaded. Check your connection and try again.'
    );
    stripTokenFromUrl();
    return null;
  }

  const localName = sharedLocalProjectName(fetched.project);
  const activeName = (typeof window.currentProjectId === 'string' ? window.currentProjectId : '').trim();
  const ownName = activeName && activeName !== 'default' && activeName !== localName ? activeName : '';
  const confirmed = await confirmOpen(fetched.project, fetched.mode, ownName);
  if (!confirmed) {
    stripTokenFromUrl();
    return null;
  }

  if (ownName) saveLocalProject(ownName);
  // importProject needs a named project to write into, so establish the shared
  // copy's name first (the same order the cloud-project loader uses) and put
  // the previous name back if the import fails.
  const previousId = window.currentProjectId;
  let previousState = null;
  try {
    previousState = getProjectState();
    setProjectState({ ...previousState, name: localName });
  } catch {
    previousState = null;
  }
  window.currentProjectId = localName;
  const imported = importProject(fetched.data);
  if (!imported) {
    window.currentProjectId = previousId;
    try {
      if (previousState) setProjectState(previousState);
    } catch {
      // Non-critical: the name re-syncs on the next save.
    }
    await showAlertModal('Shared project unavailable', 'The shared project could not be opened.');
    stripTokenFromUrl();
    return null;
  }
  saveLocalProject(localName);
  return { token, project: fetched.project, mode: fetched.mode, version: fetched.version };
}

function renderBanner(session) {
  document.getElementById(BANNER_ID)?.remove();
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Shared project');
  banner.style.cssText = [
    'position:sticky', 'top:0', 'z-index:1000',
    'display:flex', 'flex-wrap:wrap', 'align-items:center', 'gap:0.75rem',
    'padding:0.5rem 1rem', 'background:#1e3a8a', 'color:#fff',
    'font:600 0.875rem/1.4 system-ui,sans-serif',
  ].join(';');

  const title = document.createElement('span');
  title.textContent = `Shared project "${session.project}" — ${session.mode === 'edit' ? 'editable' : 'read-only'}`;
  banner.appendChild(title);

  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'font-weight:400;flex:1 1 12rem';
  banner.appendChild(status);

  let saveBtn = null;
  if (session.mode === 'edit') {
    saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-sm';
    saveBtn.textContent = 'Save to shared project';
    banner.appendChild(saveBtn);
  }
  const leaveBtn = document.createElement('button');
  leaveBtn.type = 'button';
  leaveBtn.className = 'btn btn-sm';
  leaveBtn.textContent = 'Leave shared project';
  banner.appendChild(leaveBtn);

  document.body.prepend(banner);
  return {
    saveBtn,
    leaveBtn,
    setStatus(message, isError = false) {
      status.textContent = message;
      status.dataset.error = isError ? 'true' : 'false';
    },
    remove() {
      banner.remove();
    },
  };
}

function attachSharedSession(session, storage) {
  const banner = renderBanner(session);
  let uploadTimer = null;
  let uploading = false;
  let blocked = false;

  const messages = {
    conflict: 'The shared project was changed by someone else. Reload this page to get the latest version; your edits here were not saved to it.',
    read_only: 'This link is read-only, so changes are not saved to the shared project.',
    not_found: 'This link was revoked or has expired.',
    unavailable: 'Could not save to the shared project. It will retry on your next save.',
  };

  async function upload() {
    if (session.mode !== 'edit' || blocked || uploading) return;
    uploading = true;
    banner.setStatus('Saving to the shared project…');
    const result = await uploadSharedProject({
      token: session.token,
      baseVersion: session.version,
      data: exportProject(),
    });
    uploading = false;
    if (result.ok) {
      session.version = result.version ?? session.version;
      if (storage) writeSharedSession(storage, session);
      banner.setStatus('Saved to the shared project.');
      return;
    }
    if (result.reason !== 'unavailable') blocked = true;
    banner.setStatus(messages[result.reason] || messages.unavailable, true);
  }

  function onProjectSaved() {
    if (session.mode !== 'edit' || blocked) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(upload, UPLOAD_DELAY_MS);
  }

  function onCollabConnected() {
    banner.setStatus('Live collaboration connected.');
  }

  function onCollabDisconnected() {
    banner.setStatus('Live collaboration disconnected. Reconnecting…');
  }

  function leave() {
    clearTimeout(uploadTimer);
    document.removeEventListener('ctr:project-saved', onProjectSaved);
    document.removeEventListener('ctr:collab-connected', onCollabConnected);
    document.removeEventListener('ctr:collab-disconnected', onCollabDisconnected);
    stopCollaboration();
    if (storage) clearSharedSession(storage);
    banner.remove();
    stripTokenFromUrl();
  }

  document.addEventListener('ctr:project-saved', onProjectSaved);
  document.addEventListener('ctr:collab-connected', onCollabConnected);
  document.addEventListener('ctr:collab-disconnected', onCollabDisconnected);
  banner.saveBtn?.addEventListener('click', () => {
    clearTimeout(uploadTimer);
    upload();
  });
  banner.leaveBtn.addEventListener('click', leave);

  initCollaboration({ projectId: session.project, username: 'Guest', snapshotToken: session.token });
}

/**
 * Open a shared project from `?snapshotToken=` (asking first), or resume the
 * shared session remembered for this tab, then show the banner and start live
 * collaboration. Returns true when a shared session is active.
 */
export async function initSharedProject() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const storage = getSessionStorage();
  const urlToken = getSnapshotToken(window.location.search);
  const stored = storage ? readSharedSession(storage) : null;

  let session = null;
  if (urlToken) {
    if (stored && stored.token === urlToken) {
      session = stored;
    } else {
      session = await openSharedProject(urlToken);
      if (session && storage) writeSharedSession(storage, session);
    }
  } else if (stored) {
    session = stored;
  }
  if (!session) return false;
  attachSharedSession(session, storage);
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initSharedProject().catch(err => console.error('Shared project failed to start', err));
  });
}
