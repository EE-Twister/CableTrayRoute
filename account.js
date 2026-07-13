import './src/components/navigation.js';
import {
  clearAuthContextState,
  getAuthContextState,
  getProjectState,
  getSavedProjectsError,
  getSessionPreferences,
  getThemePreference,
  listSavedProjects,
  setAuthContextState
} from './projectStorage.js';
import { authProviderLabel, avatarColorForUser, initialsForUser } from './src/authProfile.js';
import { signOutCurrentUser, updateAuthSessionControls } from './src/authProfileControl.js';
import {
  isSupabaseAuthContext,
  supabaseListAccountDeletionRequests,
  supabaseResendEmailConfirmation,
  supabaseRequestAccountDeletion,
  supabaseSignOut,
  supabaseUpdatePassword,
  supabaseUpdateProfile
} from './src/supabaseBackend.js';

const MIN_PASSWORD_LENGTH = 8;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
const DELETE_CONFIRMATION_TEXT = 'DELETE';

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

function showStatus(formEl, message, isError = false, variant = null) {
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
  statusEl.dataset.variant = variant || (isError ? 'error' : 'success');
}

function setInlineStatus(id, message, variant = 'info') {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = message;
  node.dataset.variant = variant;
}

function setElementStatus(node, message, variant = 'info') {
  if (!node) return;
  node.textContent = message;
  node.dataset.variant = variant;
  node.hidden = !message;
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
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

function renderEmailConfirmationStatus(auth) {
  const node = document.getElementById('email-confirmation-status');
  if (!node) return;
  if (auth.pendingEmail && auth.pendingEmail !== auth.email) {
    setElementStatus(
      node,
      `Email change pending: confirm ${auth.pendingEmail} before it becomes your sign-in email. Current email: ${auth.email || 'Not available'}.`,
      'warning'
    );
    return;
  }
  setElementStatus(node, '', 'info');
}

function buildSessionItems(auth, sessions = null) {
  if (Array.isArray(sessions) && sessions.length) {
    return sessions.map(session => ({
      title: session.current ? 'Current browser' : 'Signed-in browser',
      meta: [
        session.issuedAt ? `Started ${formatSessionExpiry(session.issuedAt, Date.now()).replace(/^Expired /, '')}` : '',
        session.expiresAt ? `Expires ${formatSessionExpiry(session.expiresAt)}` : ''
      ].filter(Boolean).join(' · ') || 'Active session',
      current: Boolean(session.current)
    }));
  }
  return [{
    title: 'Current browser',
    meta: `${isSupabaseAuthContext(auth) ? 'Hosted email session' : 'Local account session'} · Expires ${formatSessionExpiry(auth.expiresAt)}`,
    current: true
  }];
}

function renderSessionList(auth, sessions = null) {
  const list = document.getElementById('account-session-list');
  if (!list) return;
  list.replaceChildren(...buildSessionItems(auth, sessions).map(session => {
    const item = document.createElement('article');
    item.className = 'account-session-item';
    if (session.current) item.classList.add('is-current');
    const title = document.createElement('strong');
    title.textContent = session.title;
    const meta = document.createElement('span');
    meta.textContent = session.meta;
    item.append(title, meta);
    return item;
  }));
}

async function initSessionList(auth) {
  renderSessionList(auth);
  if (isSupabaseAuthContext(auth)) return;
  try {
    const res = await fetch('/account/sessions', { headers: { 'X-CSRF-Token': auth.csrfToken } });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (Array.isArray(body.sessions)) {
      renderSessionList(auth, body.sessions);
    }
  } catch (err) {
    console.warn('[account] session list unavailable:', err?.message || err);
  }
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
  setText('account-user-id', displayValue(auth.userId));
  setText('account-type', providerLabel);
  setText('account-expires', formatSessionExpiry(auth.expiresAt));
  setText('account-auth-detail', isSupabaseAuthContext(auth) ? 'Email and password' : 'Username and password');
  setText('account-sync-mode', isSupabaseAuthContext(auth) ? 'Cloud projects enabled' : 'Server projects enabled');
  setText('account-current-project', workspace.currentProject);
  setText('account-local-projects', workspace.savedProjectCount);
  setText('account-display-prefs', workspace.displayPrefs);

  const usernameInput = document.getElementById('profile-username');
  if (usernameInput) usernameInput.value = user === 'Signed in user' ? '' : user;
  const emailInput = document.getElementById('profile-email');
  if (emailInput) emailInput.value = auth.pendingEmail || (email === 'Not available' ? '' : email);
  renderEmailConfirmationStatus(auth);

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

  const profileNote = document.getElementById('profile-edit-note');
  const profileForm = document.getElementById('profile-details-form');
  if (profileNote) {
    profileNote.textContent = isSupabaseAuthContext(auth)
      ? 'Changes may require email confirmation before the new sign-in email becomes active.'
      : 'This account is managed by your deployment administrator.';
  }
  if (profileForm) {
    const disabled = !isSupabaseAuthContext(auth);
    profileForm.querySelectorAll('input, button').forEach(control => {
      control.disabled = disabled;
    });
  }

  const resendBtn = document.getElementById('resend-confirmation-btn');
  if (resendBtn) {
    resendBtn.disabled = !isSupabaseAuthContext(auth) || !auth.email;
  }
}

function mergeSupabaseProfile(auth, result, requested) {
  const user = result?.user && typeof result.user === 'object' ? result.user : result || {};
  const metadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
  const confirmedEmail = user.email || auth.email;
  const pendingEmail = requested.email && requested.email !== confirmedEmail ? requested.email : null;
  return {
    ...auth,
    user: metadata.username || requested.username || auth.user,
    email: confirmedEmail || requested.email || auth.email,
    pendingEmail
  };
}

function initProfileForm(auth) {
  const form = document.getElementById('profile-details-form');
  if (!form) return;
  let currentAuth = auth;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isSupabaseAuthContext(currentAuth)) {
      showStatus(form, 'Contact your deployment administrator to change this account profile.', true);
      return;
    }

    const username = document.getElementById('profile-username')?.value.trim() || '';
    const email = document.getElementById('profile-email')?.value.trim() || '';
    const btn = form.querySelector('button[type="submit"]');

    if (!USERNAME_PATTERN.test(username)) {
      showStatus(form, 'Username may only contain letters, numbers, underscores, and hyphens (1-100 characters).', true);
      return;
    }
    if (!email) {
      showStatus(form, 'Email is required.', true);
      return;
    }
    if (username === currentAuth.user && email === currentAuth.email) {
      showStatus(form, 'No profile changes to save.', false);
      return;
    }

    setButtonLoading(btn, true, 'Saving...');
    showStatus(form, 'Saving profile...', false, 'loading');

    try {
      const result = await supabaseUpdateProfile(currentAuth, { username, email });
      const nextAuth = mergeSupabaseProfile(currentAuth, result, { username, email });
      setAuthContextState(nextAuth);
      currentAuth = nextAuth;
      renderAccount(nextAuth);
      updateAuthSessionControls();
      const message = nextAuth.pendingEmail
        ? `Profile updated. Confirm ${nextAuth.pendingEmail} before it becomes your sign-in email.`
        : 'Profile updated.';
      showStatus(form, message, false);
    } catch (err) {
      console.error('[account] profile update request failed:', err);
      showStatus(form, err?.message || 'Profile update failed. Check your connection and try again.', true);
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

async function loadDeletionRequest(auth) {
  try {
    if (isSupabaseAuthContext(auth)) {
      return await supabaseListAccountDeletionRequests(auth);
    }
    const res = await fetch('/account/deletion-request', { headers: { 'X-CSRF-Token': auth.csrfToken } });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return body.request || null;
  } catch (err) {
    console.warn('[account] deletion request status unavailable:', err?.message || err);
    return null;
  }
}

async function requestAccountDeletion(auth) {
  if (isSupabaseAuthContext(auth)) {
    return supabaseRequestAccountDeletion(auth);
  }
  const res = await fetch('/account/deletion-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': auth.csrfToken
    },
    body: JSON.stringify({ confirmation: DELETE_CONFIRMATION_TEXT })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Could not submit deletion request.');
  }
  return body.request;
}

function describeDeletionRequest(request) {
  if (!request) return '';
  const status = request.status || 'requested';
  const requestedAt = request.requested_at || request.requestedAt;
  const when = requestedAt ? ` on ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(requestedAt))}` : '';
  if (status === 'requested') return `Account deletion request submitted${when}.`;
  return `Account deletion request status: ${status}${when}.`;
}

async function initDeletionStatus(auth) {
  const request = await loadDeletionRequest(auth);
  if (request) {
    setInlineStatus('account-actions-status', describeDeletionRequest(request), request.status === 'completed' ? 'success' : 'warning');
  }
}

function passwordScore(password) {
  const checks = [
    password.length >= MIN_PASSWORD_LENGTH,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  return checks.filter(Boolean).length;
}

function updatePasswordHints() {
  const password = document.getElementById('new-pass')?.value || '';
  const confirm = document.getElementById('new-pass-confirm')?.value || '';
  const strength = document.getElementById('password-strength');
  const match = document.getElementById('password-match');
  const score = passwordScore(password);

  if (strength) {
    if (!password) {
      strength.textContent = 'Use at least 8 characters with letters and numbers.';
      strength.dataset.variant = 'info';
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      strength.textContent = `${MIN_PASSWORD_LENGTH - password.length} more character${MIN_PASSWORD_LENGTH - password.length === 1 ? '' : 's'} needed.`;
      strength.dataset.variant = 'error';
    } else if (score < 4) {
      strength.textContent = 'Good start. Add uppercase, numbers, or symbols to strengthen it.';
      strength.dataset.variant = 'warning';
    } else {
      strength.textContent = 'Strong password.';
      strength.dataset.variant = 'success';
    }
  }

  if (match) {
    if (!confirm) {
      match.textContent = '';
      match.dataset.variant = 'info';
    } else if (password === confirm) {
      match.textContent = 'Passwords match.';
      match.dataset.variant = 'success';
    } else {
      match.textContent = 'Passwords do not match.';
      match.dataset.variant = 'error';
    }
  }
}

function initPasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.textContent = showing ? 'Show' : 'Hide';
      button.setAttribute('aria-label', `${showing ? 'Show' : 'Hide'} ${input.labels?.[0]?.textContent || 'password'}`);
    });
  });
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
  document.getElementById('new-pass')?.addEventListener('input', updatePasswordHints);
  document.getElementById('new-pass-confirm')?.addEventListener('input', updatePasswordHints);
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

    setButtonLoading(btn, true, 'Updating...');
    showStatus(form, 'Updating password...', false, 'loading');

    try {
      const message = isSupabaseAuthContext(auth)
        ? await changeSupabasePassword(auth, newPassword).then(() => 'Password changed successfully.')
        : await changeServerPassword(auth, currentPassword, newPassword);
      showStatus(form, message, false);
      form.reset();
      updatePasswordHints();
    } catch (err) {
      console.error('[account] change password request failed:', err);
      showStatus(form, err?.message || 'Request failed. Check your connection and try again.', true);
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

function exportAccountData(auth) {
  const workspace = readWorkspaceSummary();
  let project = null;
  try {
    project = getProjectState();
  } catch (err) {
    console.warn('[account] project export unavailable:', err?.message || err);
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      username: auth.user || null,
      email: auth.email || null,
      role: auth.role || null,
      provider: authProviderLabel(auth),
      sessionExpiresAt: Number.isFinite(Number(auth.expiresAt)) ? new Date(Number(auth.expiresAt)).toISOString() : null
    },
    workspace,
    project
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cabletrayroute-account-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function initAccountActions(auth) {
  document.getElementById('export-account-data-btn')?.addEventListener('click', () => {
    exportAccountData(auth);
    setInlineStatus('account-actions-status', 'Account and current project data export started.', 'success');
  });

  document.getElementById('resend-confirmation-btn')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    if (!isSupabaseAuthContext(auth) || !auth.email) {
      setInlineStatus('account-actions-status', 'Confirmation emails are available for hosted email accounts.', 'warning');
      return;
    }
    setButtonLoading(btn, true, 'Sending...');
    setInlineStatus('account-actions-status', 'Sending confirmation email...', 'loading');
    try {
      await supabaseResendEmailConfirmation(auth.email);
      setInlineStatus('account-actions-status', `Confirmation email sent to ${auth.email}.`, 'success');
    } catch (err) {
      console.error('[account] confirmation resend failed:', err);
      setInlineStatus('account-actions-status', err?.message || 'Could not send confirmation email.', 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  document.getElementById('signout-all-btn')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    setButtonLoading(btn, true, 'Signing out...');
    setInlineStatus('account-actions-status', 'Signing out active sessions...', 'loading');
    try {
      if (isSupabaseAuthContext(auth)) {
        await supabaseSignOut(auth, { scope: 'global' });
      } else {
        await fetch('/account/signout-all', {
          method: 'POST',
          headers: { 'X-CSRF-Token': auth.csrfToken }
        });
      }
    } catch (err) {
      console.warn('[account] sign out all sessions failed:', err?.message || err);
    }
    clearAuthContextState();
    updateAuthSessionControls();
    location.href = 'login.html';
  });

  document.getElementById('delete-request-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('delete-confirmation');
    if (panel) {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) document.getElementById('delete-confirmation-input')?.focus();
    }
    setInlineStatus('account-actions-status', 'Deletion requests are reviewed before project ownership and audit history are removed.', 'warning');
  });

  document.getElementById('submit-delete-request-btn')?.addEventListener('click', async (event) => {
    const confirmation = document.getElementById('delete-confirmation-input')?.value.trim() || '';
    if (confirmation !== DELETE_CONFIRMATION_TEXT) {
      setInlineStatus('account-actions-status', 'Type DELETE to confirm this account deletion request.', 'error');
      return;
    }
    const btn = event.currentTarget;
    setButtonLoading(btn, true, 'Submitting...');
    setInlineStatus('account-actions-status', 'Submitting deletion request...', 'loading');
    try {
      const request = await requestAccountDeletion(auth);
      setInlineStatus('account-actions-status', describeDeletionRequest(request) || 'Account deletion request submitted.', 'success');
      document.getElementById('delete-confirmation-input').value = '';
      document.getElementById('delete-confirmation').hidden = true;
    } catch (err) {
      console.error('[account] deletion request failed:', err);
      setInlineStatus('account-actions-status', err?.message || 'Could not submit deletion request.', 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  initDeletionStatus(auth);
}

function init() {
  const auth = getAuthContextState();
  if (!auth) {
    const e2e = new URLSearchParams(window.location.search).has('e2e');
    window.location.href = e2e ? 'login.html?e2e=1' : 'login.html';
    return;
  }

  renderAccount(auth);
  initSessionList(auth);
  initProfileForm(auth);
  initPasswordToggles();
  initPasswordForm(auth);
  initAccountActions(auth);
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
