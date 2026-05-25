import { setAuthContextState, clearAuthContextState } from './projectStorage.js';

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

function validateSignupPasswords(form, showMessage = false) {
  const passwordInput = document.getElementById('signup-pass');
  const confirmInput = document.getElementById('signup-pass-confirm');
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  if (confirm.length > 0 && password !== confirm) {
    confirmInput.setCustomValidity('Passwords must match.');
    if (showMessage) {
      showStatus(form, 'Passwords do not match.', true);
    }
    return false;
  }

  confirmInput.setCustomValidity('');
  return true;
}

async function signup(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  const username = document.getElementById('signup-user').value.trim();
  const password = document.getElementById('signup-pass').value;
  const passwordsMatch = validateSignupPasswords(form, true);

  if (!form.reportValidity()) {
    return;
  }

  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(username)) {
    showStatus(form, 'Username may only contain letters, numbers, underscores, and hyphens (1–100 characters).', true);
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    showStatus(form, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, true);
    return;
  }

  if (!passwordsMatch) {
    return;
  }

  submitBtn.disabled = true;
  try {
    const res = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      showStatus(form, 'Account created. You may now sign in.', false);
    } else {
      const body = await res.json().catch(() => ({}));
      showStatus(form, body.error || 'Signup failed. Please try again.', true);
    }
  } catch (err) {
    console.error('Signup request failed', err);
    showStatus(form, 'Signup failed. Check your connection and try again.', true);
  } finally {
    submitBtn.disabled = false;
  }
}

async function login(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  submitBtn.disabled = true;
  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      const { token, csrfToken, expiresAt, role } = await res.json();
      setAuthContextState({ token, csrfToken, expiresAt, user: username, role: role || null });
      window.location.href = 'index.html';
      return;
    }
    clearAuthContextState();
    const body = await res.json().catch(() => ({}));
    showStatus(form, body.error || 'Login failed. Check your credentials.', true);
  } catch (err) {
    console.error('Login request failed', err);
    clearAuthContextState();
    showStatus(form, 'Login failed. Check your connection and try again.', true);
  } finally {
    submitBtn.disabled = false;
  }
}

const signupForm = document.getElementById('signup-form');
const signupPasswordInput = document.getElementById('signup-pass');
const signupConfirmInput = document.getElementById('signup-pass-confirm');

signupPasswordInput.addEventListener('input', () => {
  validateSignupPasswords(signupForm);
});

signupConfirmInput.addEventListener('input', () => {
  validateSignupPasswords(signupForm, true);
});

signupForm.addEventListener('submit', signup);
document.getElementById('login-form').addEventListener('submit', login);

// Show the SSO button only when OIDC is configured on the server.
// A 503 from /auth/oidc/login means OIDC is not set up.
fetch('/auth/oidc/login', { method: 'GET', redirect: 'manual' })
  .then(res => {
    if (res.status !== 503) {
      document.getElementById('sso-section')?.classList.remove('hidden');
    }
  })
  .catch(() => {/* network error — leave SSO hidden */});

// Show login error from OIDC callback redirect if present
const urlError = new URLSearchParams(window.location.search).get('error');
if (urlError) {
  const messages = {
    oidc_denied: 'SSO sign-in was cancelled or denied.',
    oidc_state_invalid: 'SSO session expired. Please try again.',
    oidc_token_failed: 'SSO token exchange failed. Contact your administrator.',
    oidc_userinfo_failed: 'Could not retrieve SSO identity. Contact your administrator.',
    oidc_discovery_failed: 'SSO configuration error. Contact your administrator.',
  };
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    showStatus(loginForm, messages[urlError] ?? `SSO error: ${urlError}`, true);
  }
}
