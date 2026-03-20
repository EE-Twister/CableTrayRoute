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

async function signup(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const username = document.getElementById('signup-user').value.trim();
  const password = document.getElementById('signup-pass').value;
  const confirm = document.getElementById('signup-pass-confirm').value;

  if (password.length < MIN_PASSWORD_LENGTH) {
    showStatus(form, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, true);
    return;
  }

  if (password !== confirm) {
    showStatus(form, 'Passwords do not match.', true);
    return;
  }

  const submitBtn = form.querySelector('[type=submit]');
  if (submitBtn) submitBtn.disabled = true;
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
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function login(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const submitBtn = form.querySelector('[type=submit]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      const { token, csrfToken, expiresAt } = await res.json();
      setAuthContextState({ token, csrfToken, expiresAt, user: username });
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
    if (submitBtn) submitBtn.disabled = false;
  }
}

document.getElementById('signup-form').addEventListener('submit', signup);
document.getElementById('login-form').addEventListener('submit', login);
