import './src/components/navigation.js';
import {
  getAuthContextState,
  getProjectState,
  getSavedProjectsError,
  getSessionPreferences,
  getThemePreference,
  listSavedProjects,
  setAuthContextState
} from './projectStorage.js';
import { authProviderLabel, avatarColorForUser, initialsForUser } from './src/authProfile.js';
import { signOutCurrentUser } from './src/authProfileControl.js';
import { isSupabaseAuthContext, supabaseUpdatePassword } from './src/supabaseBackend.js';

const MIN_PASSWORD_LENGTH = 8;

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function displayValue(value, fallback = 'Not available') {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
  return text || fallback;
}

export function formatSessionExpiry(expiresAt, now = Date.now()) {
  const time = Number(expiresAt);
  if (!Number.isFinite(time)) return 'Not available';
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  const minutes = Math.max(0, Math.round((time - now) / 60000));
  if (minutes <= 0) return `Expired ${formatter.format(new Date(time))}`;
  if (minutes < 60) return `${formatter.format(new Date(time))} (${minutes} min left)`;
  const hours = Math.round(minutes / 60);
  return `${formatter.format(new Date(time))} (${hours} hr left)`;
}

export function formatLocalProjectCount(names = [], storageError = null) {
  if (storageError) return 'Unavailable';
  const count = Array.isArray(names) ? names.length : 0;
  return `${count} saved ${count === 1 ? 'project' : 'projects'}`;
}

function showStatus(formEl, message, isError) {
  let statusEl = formEl.querySelector('.auth-status');
  if (!statusEl) {
    statusEl = document.createElement('p');
    statusEl.className = 'auth-status';
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    formEl.appendChild(statusEl);
  }
  statusEl.textContent = message;
  statusEl.dataset.error = isError ? 'true' : 'false';
}

function readWorkspaceSummary() {
  let project = null;
  try {
    project = getProjectState();
  } catch (err) {
    console.warn('[account] project state unavailable:', err?.message || err);
  }

  const storageError = getSavedProjectsError();
  let savedProjects = [];
  if (!storageError) {
    try {
      savedProjects = listSavedProjects();
    } catch (err) {
      console.warn('[account] saved project list unavailable:', err?.message || err);
    }
  }

  const session = getSessionPreferences();
  const theme = getThemePreference();
  const units = project?.settings?.units || 'imperial';
  return {
    currentProject: project?.name || 'Untitled',
    savedProjectCount: formatLocalProjectCount(savedProjects, storageError),
    displayPrefs: `${theme || 'system'} theme, ${units} units${session.compactMode ? ', compact tables' : ''}`,
    storageError
  };
}

function renderAccount(auth) {
  const providerLabel = authProviderLabel(auth);
  const user = displayValue(auth.user, 'Signed in user');
  const email = displayValue(auth.email, auth.user?.includes('@') ? auth.user : 'Not available');
  const role = displayValue(auth.role, 'Engineer');
  const workspace = readWorkspaceSummary();

  setText('display-username', user);
  setText('account-provider', 'CableTrayRoute');
  setText('account-role', role);
  setText('account-session-state', 'Active');
  setText('account-username', user);
  setText('account-email', email);
  setText('account-user-id', displayValue(auth.userId));
  setText('account-type', providerLabel);
  setText('account-expires', formatSessionExpiry(auth.expiresAt));
  setText('account-auth-detail', isSupabaseAuthContext(auth) ? 'Email and password' : 'Username and password');
  setText('account-sync-mode', isSupabaseAuthContext(auth) ? 'Cloud projects enabled' : 'Server projects enabled');
  setText('account-current-project', workspace.currentProject);
  setText('account-local-projects', workspace.savedProjectCount);
  setText('account-display-prefs', workspace.displayPrefs);

  const avatar = document.getElementById('account-avatar');
  if (avatar) {
    avatar.textContent = initialsForUser(auth.user);
    avatar.style.setProperty('--avatar-bg', avatarColorForUser(auth.user));
  }

  const note = document.getElementById('password-provider-note');
  const currentField = document.getElementById('current-pass-field');
  const currentInput = document.getElementById('current-pass');
  if (isSupabaseAuthContext(auth)) {
    if (note) note.textContent = 'Update the password for the account you are currently signed into.';
    if (currentField) currentField.hidden = true;
    if (currentInput) {
      currentInput.required = false;
      currentInput.value = '';
    }
  } else {
    if (note) note.textContent = 'Enter your current password before setting a new one.';
    if (currentField) currentField.hidden = false;
    if (currentInput) currentInput.required = true;
  }
}

async function changeSupabasePassword(auth, newPassword) {
  await supabaseUpdatePassword(auth, newPassword);
}

async function changeServerPassword(auth, currentPassword, newPassword) {
  const res = await fetch('/account/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': auth.csrfToken
    },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Failed to change password. Please try again.');
  }
  if (body.csrfToken && body.expiresAt) {
    setAuthContextState({
      ...auth,
      csrfToken: body.csrfToken,
      expiresAt: body.expiresAt
    });
  }
  return body.message || 'Password changed successfully.';
}

function initPasswordForm(auth) {
  const form = document.getElementById('change-pass-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('current-pass')?.value || '';
    const newPassword = document.getElementById('new-pass')?.value || '';
    const confirm = document.getElementById('new-pass-confirm')?.value || '';
    const btn = form.querySelector('button[type="submit"]');

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      showStatus(form, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, true);
      return;
    }
    if (newPassword !== confirm) {
      showStatus(form, 'New passwords do not match.', true);
      return;
    }
    if (!isSupabaseAuthContext(auth) && !currentPassword) {
      showStatus(form, 'Current password is required.', true);
      return;
    }

    if (btn) btn.disabled = true;
    showStatus(form, 'Updating password...', false);

    try {
      const message = isSupabaseAuthContext(auth)
        ? await changeSupabasePassword(auth, newPassword).then(() => 'Password changed successfully.')
        : await changeServerPassword(auth, currentPassword, newPassword);
      showStatus(form, message, false);
      form.reset();
    } catch (err) {
      console.error('[account] change password request failed:', err);
      showStatus(form, err?.message || 'Request failed. Check your connection and try again.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function init() {
  const auth = getAuthContextState();
  if (!auth) {
    window.location.href = 'login.html';
    return;
  }

  renderAccount(auth);
  initPasswordForm(auth);
  document.getElementById('account-logout-btn')?.addEventListener('click', () => {
    signOutCurrentUser().catch(err => console.error('[account] logout failed:', err));
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
