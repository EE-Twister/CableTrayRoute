import './src/components/navigation.js';
import { getAuthContextState, setAuthContextState } from './projectStorage.js';

const MIN_PASSWORD_LENGTH = 8;

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

function init() {
  let auth = getAuthContextState();
  if (!auth) {
    window.location.href = 'login.html';
    return;
  }

  const usernameEl = document.getElementById('display-username');
  if (usernameEl && auth.user) usernameEl.textContent = auth.user;

  const form = document.getElementById('change-pass-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('current-pass').value;
    const newPassword = document.getElementById('new-pass').value;
    const confirm = document.getElementById('new-pass-confirm').value;
    const btn = form.querySelector('button[type="submit"]');

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      showStatus(form, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, true);
      return;
    }
    if (newPassword !== confirm) {
      showStatus(form, 'New passwords do not match.', true);
      return;
    }

    btn.disabled = true;
    showStatus(form, 'Updating password…', false);

    try {
      const res = await fetch('/account/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
          'X-CSRF-Token': auth.csrfToken
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        if (body.token && body.csrfToken && body.expiresAt) {
          auth = {
            ...auth,
            token: body.token,
            csrfToken: body.csrfToken,
            expiresAt: body.expiresAt,
          };
          setAuthContextState(auth);
        }
        showStatus(form, body.message || 'Password changed successfully.', false);
        form.reset();
      } else {
        showStatus(form, body.error || 'Failed to change password. Please try again.', true);
      }
    } catch (err) {
      console.error('[account] change password request failed:', err);
      showStatus(form, 'Request failed. Check your connection and try again.', true);
    } finally {
      btn.disabled = false;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
