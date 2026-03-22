/**
 * Collaboration conflict notifications.
 *
 * When the server detects that a remote patch arrived out of sequence —
 * meaning one or more intermediate patches were applied by other users
 * before the client had a chance to see them — it signals a conflict via
 * CollabClient's 'conflict' event.  This module listens for that event
 * and surfaces a brief, dismissible toast so the user knows their view
 * may differ from what other collaborators just saved.
 *
 * Usage:
 *   import { initConflictNotifications } from './collaborationConflict.js';
 *   initConflictNotifications(collabClient);
 */

const TOAST_DURATION_MS = 6000;
let toastEl = null;
let toastTimer = null;

/**
 * Attach conflict-notification handling to a CollabClient.
 *
 * @param {import('./collaboration.js').CollabClient} client
 */
export function initConflictNotifications(client) {
  if (!client) return;
  client.onConflict(({ username, gap }) => {
    const who = username || 'Another user';
    const plural = gap > 1 ? `${gap} changes` : 'a change';
    showConflictToast(`${who} saved ${plural} that may overlap with yours. Please review before saving.`);
  });
}

/**
 * Show a dismissible conflict toast at the top of the page.
 * @param {string} message
 */
function showConflictToast(message) {
  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  if (!toastEl) {
    toastEl = createToastElement();
    document.body.appendChild(toastEl);
  }

  const msgEl = toastEl.querySelector('.collab-conflict-msg');
  if (msgEl) msgEl.textContent = message;
  toastEl.removeAttribute('hidden');
  toastEl.setAttribute('aria-live', 'assertive');

  toastTimer = setTimeout(() => dismissToast(), TOAST_DURATION_MS);
}

function dismissToast() {
  if (toastEl) toastEl.setAttribute('hidden', '');
  toastTimer = null;
}

function createToastElement() {
  const el = document.createElement('div');
  el.className = 'collab-conflict-toast';
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'assertive');
  el.setAttribute('aria-atomic', 'true');
  el.setAttribute('hidden', '');

  const msg = document.createElement('span');
  msg.className = 'collab-conflict-msg';
  el.appendChild(msg);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'collab-conflict-dismiss';
  btn.setAttribute('aria-label', 'Dismiss conflict notification');
  btn.textContent = '\u00d7';
  btn.addEventListener('click', dismissToast);
  el.appendChild(btn);

  // Inline critical styles so the toast works without a stylesheet dependency
  Object.assign(el.style, {
    position: 'fixed',
    top: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9999',
    background: '#7c3200',
    color: '#fff',
    padding: '0.75rem 1.25rem',
    borderRadius: '0.375rem',
    boxShadow: '0 2px 8px rgba(0,0,0,.35)',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    maxWidth: '90vw',
    fontSize: '0.9rem',
  });

  return el;
}
