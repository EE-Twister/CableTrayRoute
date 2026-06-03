import { setAuthContextState, clearAuthContextState } from './projectStorage.js';
import {
  createAuthContextFromSupabaseSession,
  getSupabaseConfig,
  SupabaseRequestError,
  supabaseSignIn,
  supabaseSignUp
} from './src/supabaseBackend.js';

const MIN_PASSWORD_LENGTH = 8;
const signupCooldowns = new Map();
let supabaseAuthEnabled = false;
let authModeReady = Promise.resolve();

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

function authFailureMessage(err, fallback) {
  if (err instanceof SupabaseRequestError && err.status === 429) {
    const retry = err.retryAfterSeconds;
    if (Number.isFinite(retry) && retry > 0) {
      return `Supabase is rate limiting signup requests. Wait ${retry} seconds, then try again.`;
    }
    return 'Supabase is rate limiting signup requests. Wait about a minute, then try again.';
  }
  if (err instanceof SupabaseRequestError && err.status >= 400 && err.status < 500 && err.message) {
    return err.message;
  }
  return fallback;
}

function getSignupCooldown(email) {
  const retryAt = signupCooldowns.get(email.toLowerCase());
  if (!retryAt) return 0;
  const remaining = Math.ceil((retryAt - Date.now()) / 1000);
  if (remaining <= 0) {
    signupCooldowns.delete(email.toLowerCase());
    return 0;
  }
  return remaining;
}

function rememberSignupCooldown(email, err) {
  if (!(err instanceof SupabaseRequestError) || err.status !== 429) return;
  const retry = Number.isFinite(err.retryAfterSeconds) && err.retryAfterSeconds > 0
    ? err.retryAfterSeconds
    : 60;
  signupCooldowns.set(email.toLowerCase(), Date.now() + retry * 1000);
}

function configureSupabaseAuthFields() {
  supabaseAuthEnabled = true;
  const signupUser = document.getElementById('signup-user');
  const loginUser = document.getElementById('login-user');
  const signupLabel = document.querySelector('label[for="signup-user"]');
  const loginLabel = document.querySelector('label[for="login-user"]');
  const signupHint = document.getElementById('signup-user-hint');
  const loginHint = document.getElementById('login-user-hint');

  signupUser.type = 'email';
  signupUser.autocomplete = 'email';
  signupUser.placeholder = 'you@example.com';
  signupUser.removeAttribute('pattern');
  signupUser.title = 'Enter a valid email address.';

  loginUser.type = 'email';
  loginUser.autocomplete = 'email';
  loginUser.placeholder = 'you@example.com';
  loginUser.removeAttribute('pattern');
  loginUser.title = 'Enter a valid email address.';

  if (signupLabel) signupLabel.textContent = 'Email';
  if (loginLabel) loginLabel.textContent = 'Email';
  if (signupHint) signupHint.textContent = 'Use the email address for your Supabase account.';
  if (loginHint) loginHint.textContent = 'Enter your email address.';
  document.getElementById('sso-section')?.classList.add('hidden');
}

async function signup(e) {
  e.preventDefault();
  await authModeReady;
  const form = e.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  const username = document.getElementById('signup-user').value.trim();
  const password = document.getElementById('signup-pass').value;
  const passwordsMatch = validateSignupPasswords(form, true);

  if (!form.reportValidity()) {
    return;
  }

  if (!supabaseAuthEnabled && !/^[a-zA-Z0-9_-]{1,100}$/.test(username)) {
    showStatus(form, 'Username may only contain letters, numbers, underscores, and hyphens (1-100 characters).', true);
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    showStatus(form, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, true);
    return;
  }

  if (!passwordsMatch) {
    return;
  }

  if (supabaseAuthEnabled) {
    const cooldown = getSignupCooldown(username);
    if (cooldown > 0) {
      showStatus(form, `Supabase is rate limiting signup requests. Wait ${cooldown} seconds, then try again.`, true);
      return;
    }
  }

  submitBtn.disabled = true;
  try {
    if (supabaseAuthEnabled) {
      const result = await supabaseSignUp({ email: username, password });
      if (result.session?.access_token) {
        setAuthContextState(createAuthContextFromSupabaseSession(result.session));
        window.location.href = 'index.html';
        return;
      }
      showStatus(form, 'Account created. Check your email to confirm the account, then sign in.', false);
      return;
    }

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
    rememberSignupCooldown(username, err);
    showStatus(form, authFailureMessage(err, 'Signup failed. Check your connection and try again.'), true);
  } finally {
    submitBtn.disabled = false;
  }
}

async function login(e) {
  e.preventDefault();
  await authModeReady;
  const form = e.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  submitBtn.disabled = true;
  try {
    if (supabaseAuthEnabled) {
      const session = await supabaseSignIn({ email: username, password });
      setAuthContextState(createAuthContextFromSupabaseSession(session));
      window.location.href = 'index.html';
      return;
    }

    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      const { csrfToken, expiresAt, role } = await res.json();
      // The session token rides in the HttpOnly ctr_auth cookie set by the
      // server; we only persist the CSRF secret and metadata for the UI.
      setAuthContextState({ csrfToken, expiresAt, user: username, role: role || null });
      window.location.href = 'index.html';
      return;
    }
    clearAuthContextState();
    const body = await res.json().catch(() => ({}));
    showStatus(form, body.error || 'Login failed. Check your credentials.', true);
  } catch (err) {
    clearAuthContextState();
    showStatus(form, authFailureMessage(err, 'Login failed. Check your connection and try again.'), true);
  } finally {
    submitBtn.disabled = false;
  }
}

const signupForm = document.getElementById('signup-form');
const signupPasswordInput = document.getElementById('signup-pass');
const signupConfirmInput = document.getElementById('signup-pass-confirm');

authModeReady = getSupabaseConfig()
  .then(config => {
    if (config.enabled) configureSupabaseAuthFields();
  })
  .catch(err => {
    console.warn('Supabase auth configuration failed', err);
  });

signupPasswordInput.addEventListener('input', () => {
  validateSignupPasswords(signupForm);
});

signupConfirmInput.addEventListener('input', () => {
  validateSignupPasswords(signupForm, true);
});

signupForm.addEventListener('submit', signup);
document.getElementById('login-form').addEventListener('submit', login);

// Show the SSO button only when OIDC is configured on the Express server.
authModeReady.then(() => {
  if (supabaseAuthEnabled) return;
  fetch('/auth/oidc/status')
    .then(res => {
      if (!res.ok) return null;
      return res.json().catch(() => null);
    })
    .then(status => {
      if (status?.configured) {
        document.getElementById('sso-section')?.classList.remove('hidden');
      }
    })
    .catch(() => {/* network error - leave SSO hidden */});
}).catch(() => {/* auth mode probe failed - leave SSO hidden */});

// Show login error from OIDC callback redirect if present.
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
