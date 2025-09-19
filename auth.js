import { setAuthContextState, clearAuthContextState } from './projectStorage.js';

async function signup(e) {
  e.preventDefault();
  const username = document.getElementById('signup-user').value.trim();
  const password = document.getElementById('signup-pass').value;
  const res = await fetch('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (res.ok) {
    alert('Signup successful. You may now log in.');
  } else {
    alert('Signup failed');
  }
}

async function login(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
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
  } catch (err) {
    console.error('Login request failed', err);
  }
  clearAuthContextState();
  alert('Login failed');
}

document.getElementById('signup-form').addEventListener('submit', signup);
document.getElementById('login-form').addEventListener('submit', login);

