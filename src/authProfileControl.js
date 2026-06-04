import { clearAuthContextState, getAuthContextState } from '../projectStorage.js';
import { authProviderLabel, avatarColorForUser, initialsForUser } from './authProfile.js';
import { isSupabaseAuthContext, supabaseSignOut } from './supabaseBackend.js';

export async function signOutCurrentUser() {
  const auth = getAuthContextState();
  if (!auth) {
    location.href = 'login.html';
    return;
  }
  try {
    if (isSupabaseAuthContext(auth)) {
      await supabaseSignOut(auth);
    } else {
      await fetch('/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': auth.csrfToken }
      });
    }
  } catch (err) {
    console.warn('[authProfile] Logout request failed:', err?.message || err);
  }
  clearAuthContextState();
  updateAuthSessionControls();
}

export function updateAuthSessionControls() {
  const auth = getAuthContextState();
  const sessionBtn = document.getElementById('auth-session-btn');
  if (sessionBtn) {
    sessionBtn.textContent = auth ? 'Logout' : 'Login';
  }

  const avatar = document.getElementById('auth-profile-control');
  if (!avatar) return;
  avatar.hidden = !auth;
  avatar.classList.toggle('is-authenticated', Boolean(auth));
  avatar.querySelectorAll('.auth-profile-avatar').forEach(node => {
    node.style.setProperty('--avatar-bg', avatarColorForUser(auth?.user));
  });
  avatar.querySelectorAll('.auth-profile-initials').forEach(node => {
    node.textContent = initialsForUser(auth?.user);
  });
  const name = avatar.querySelector('.auth-profile-name');
  if (name) name.textContent = auth?.user || 'Signed in user';
  const meta = avatar.querySelector('.auth-profile-meta');
  if (meta) {
    const role = auth?.role ? ` · ${auth.role}` : '';
    meta.textContent = `${authProviderLabel(auth)}${role}`;
  }
  const trigger = avatar.querySelector('.auth-profile-trigger');
  if (trigger) {
    const label = auth?.user ? `Account profile for ${auth.user}` : 'Account profile';
    trigger.setAttribute('aria-label', label);
    trigger.setAttribute('title', label);
  }
}

export function mountProfileControl() {
  const topNav = document.querySelector('.top-nav');
  if (!topNav || document.getElementById('auth-profile-control')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'auth-profile-control';
  wrapper.className = 'auth-profile-control';
  wrapper.hidden = true;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'auth-profile-trigger';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');

  const avatar = document.createElement('span');
  avatar.className = 'auth-profile-avatar';
  avatar.setAttribute('aria-hidden', 'true');

  const initials = document.createElement('span');
  initials.className = 'auth-profile-initials';
  avatar.appendChild(initials);
  trigger.appendChild(avatar);

  const panel = document.createElement('div');
  panel.className = 'auth-profile-panel';
  panel.setAttribute('role', 'menu');

  const summary = document.createElement('div');
  summary.className = 'auth-profile-summary';

  const panelAvatar = document.createElement('span');
  panelAvatar.className = 'auth-profile-avatar auth-profile-avatar--large';
  panelAvatar.setAttribute('aria-hidden', 'true');

  const panelInitials = document.createElement('span');
  panelInitials.className = 'auth-profile-initials';
  panelAvatar.appendChild(panelInitials);

  const copy = document.createElement('div');
  const name = document.createElement('strong');
  name.className = 'auth-profile-name';
  const meta = document.createElement('span');
  meta.className = 'auth-profile-meta';
  copy.append(name, meta);
  summary.append(panelAvatar, copy);

  const accountLink = document.createElement('a');
  accountLink.href = 'account.html';
  accountLink.className = 'auth-profile-action';
  accountLink.setAttribute('role', 'menuitem');
  accountLink.textContent = 'View account';

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'auth-profile-action';
  logoutBtn.setAttribute('role', 'menuitem');
  logoutBtn.textContent = 'Logout';
  logoutBtn.addEventListener('click', signOutCurrentUser);

  panel.append(summary, accountLink, logoutBtn);
  wrapper.append(trigger, panel);

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = wrapper.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) {
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  const projectDisplay = document.getElementById('project-display');
  const projectActions = document.getElementById('project-actions-control');
  const settingsBtn = document.getElementById('settings-btn');
  const navActions = topNav.querySelector('.nav-actions');
  if (projectActions?.parentElement) {
    projectActions.parentElement.insertBefore(wrapper, projectActions);
  } else if (projectDisplay?.parentElement) {
    projectDisplay.parentElement.insertBefore(wrapper, projectDisplay);
  } else if (settingsBtn?.parentElement) {
    settingsBtn.parentElement.insertBefore(wrapper, settingsBtn);
  } else if (navActions) {
    navActions.prepend(wrapper);
  } else {
    topNav.appendChild(wrapper);
  }
  updateAuthSessionControls();
}
