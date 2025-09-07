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
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (res.ok) {
    const { token } = await res.json();
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', username);
    window.location.href = 'index.html';
  } else {
    alert('Login failed');
  }
}

document.getElementById('signup-form').addEventListener('submit', signup);
document.getElementById('login-form').addEventListener('submit', login);

