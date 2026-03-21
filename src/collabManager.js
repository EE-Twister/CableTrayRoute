/**
 * Collaboration Manager — integrates CollabClient with the CableTrayRoute app.
 *
 * Responsibilities:
 *   - Manages a single CollabClient per page session
 *   - Broadcasts project patches whenever dataStore fires 'ctr:project-saved'
 *   - Applies incoming remote patches to the local dataStore
 *   - Renders a presence bar in #collab-presence (injected into top-nav)
 *   - Dispatches 'ctr:collab-connected' and 'ctr:collab-disconnected' events
 *
 * Usage (in any page script that wants live collaboration):
 *   import { initCollaboration } from './collabManager.js';
 *   initCollaboration({ projectId: 'my-project', username: 'alice' });
 *
 * The manager uses the 'ctr:project-saved' custom event that is dispatched
 * by dataStore.saveProject whenever a project is persisted.  To enable this,
 * dataStore.saveProject fires:
 *   document.dispatchEvent(new CustomEvent('ctr:project-saved', { detail: snapshot }))
 *
 * Remote patches are applied by calling applyMergePatch from dataStore.
 */

import { CollabClient, renderPresenceBar } from './collaboration.js';
import { getAuthContextState } from '../projectStorage.js';

let activeClient = null;
let presenceBarEl = null;

/**
 * Initialise collaboration for the current page.
 *
 * @param {object} opts
 * @param {string} opts.projectId  - project identifier
 * @param {string} [opts.username] - override username (defaults to stored auth user)
 */
export function initCollaboration({ projectId, username } = {}) {
  // Tear down any previous session
  stopCollaboration();

  const authState = getAuthContextState ? getAuthContextState() : null;
  const resolvedUsername = username || (authState && authState.user) || 'Guest';

  activeClient = new CollabClient({ projectId, username: resolvedUsername });

  // Presence updates
  activeClient.onPresence(users => {
    if (!presenceBarEl) presenceBarEl = ensurePresenceBar();
    renderPresenceBar(presenceBarEl, users, resolvedUsername);
    document.dispatchEvent(new CustomEvent('ctr:collab-presence', { detail: { users } }));
  });

  // Incoming patches from other clients
  activeClient.onRemotePatch(({ username: sender, patch }) => {
    if (!patch || typeof patch !== 'object') return;
    try {
      // Dispatch event so any page handler can apply it appropriately
      document.dispatchEvent(new CustomEvent('ctr:remote-patch', {
        detail: { sender, patch },
        bubbles: false,
      }));
    } catch (err) {
      console.warn('[collab] Failed to dispatch remote patch event', err);
    }
  });

  activeClient.addEventListener('connected', () => {
    document.dispatchEvent(new CustomEvent('ctr:collab-connected', { detail: { projectId } }));
  });

  activeClient.addEventListener('disconnected', () => {
    document.dispatchEvent(new CustomEvent('ctr:collab-disconnected', { detail: { projectId } }));
  });

  // Listen for local saves and broadcast the snapshot as a patch
  document.addEventListener('ctr:project-saved', onProjectSaved);

  activeClient.connect();
}

/**
 * Cleanly disconnect and remove all listeners.
 */
export function stopCollaboration() {
  document.removeEventListener('ctr:project-saved', onProjectSaved);
  if (activeClient) {
    activeClient.disconnect();
    activeClient = null;
  }
  if (presenceBarEl) {
    presenceBarEl.innerHTML = '';
  }
}

/**
 * Manually broadcast a patch (useful when auto-hooking is not available).
 * @param {object} patch
 */
export function broadcastPatch(patch) {
  if (activeClient) activeClient.sendPatch(patch);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function onProjectSaved(ev) {
  if (!activeClient) return;
  // ev.detail should be the full project snapshot or a merge patch
  const snapshot = ev.detail;
  if (snapshot && typeof snapshot === 'object') {
    activeClient.sendPatch(snapshot);
  }
}

function ensurePresenceBar() {
  const topNav = document.querySelector('.top-nav');
  if (!topNav) return null;

  let bar = document.getElementById('collab-presence');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'collab-presence';
    bar.className = 'presence-bar';
    bar.setAttribute('aria-label', 'Connected collaborators');
    bar.setAttribute('aria-live', 'polite');
    topNav.appendChild(bar);
  }
  return bar;
}
