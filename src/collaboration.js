/**
 * Real-time collaboration client.
 *
 * Connects to the CableTrayRoute WebSocket collaboration server and:
 *   1. Broadcasts local project patches to other connected clients
 *   2. Receives remote patches and applies them locally
 *   3. Tracks presence (which users are viewing/editing the same project)
 *
 * Usage:
 *   import { CollabClient } from './collaboration.js';
 *
 *   const collab = new CollabClient({ projectId, username });
 *   collab.onPresence(users => updatePresenceUI(users));
 *   collab.onRemotePatch(({ username, patch }) => applyPatch(patch));
 *   collab.connect();
 *   collab.sendPatch(mergePatch);  // call after each local save
 *   collab.disconnect();
 */

const WS_URL = (() => {
  if (typeof window === 'undefined') return null;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/collab`;
})();

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];
const PING_INTERVAL_MS = 25000;

export class CollabClient extends EventTarget {
  /** @type {WebSocket|null} */
  #ws = null;
  #projectId;
  #username;
  #reconnectAttempt = 0;
  #intentionalClose = false;
  #pingTimer = null;

  constructor({ projectId, username }) {
    super();
    this.#projectId = projectId;
    this.#username = username;
  }

  get connected() {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  /** Connect (or reconnect) to the collaboration server. */
  connect() {
    if (this.#ws && this.#ws.readyState <= WebSocket.OPEN) return; // already connecting/open
    if (!WS_URL) return;

    this.#intentionalClose = false;
    this.#ws = new WebSocket(WS_URL);

    this.#ws.addEventListener('open', () => {
      this.#reconnectAttempt = 0;
      this.#send({ type: 'join', projectId: this.#projectId, username: this.#username });
      this.#startPing();
      this.dispatchEvent(new CustomEvent('connected'));
    });

    this.#ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.#handleMessage(msg);
    });

    this.#ws.addEventListener('close', () => {
      this.#stopPing();
      this.dispatchEvent(new CustomEvent('disconnected'));
      if (!this.#intentionalClose) this.#scheduleReconnect();
    });

    this.#ws.addEventListener('error', () => {
      // Error event is always followed by close; no additional action needed.
    });
  }

  /** Cleanly disconnect from the server. */
  disconnect() {
    this.#intentionalClose = true;
    this.#stopPing();
    if (this.#ws) {
      if (this.#ws.readyState === WebSocket.OPEN) {
        this.#send({ type: 'leave', projectId: this.#projectId, username: this.#username });
      }
      this.#ws.close();
      this.#ws = null;
    }
  }

  /**
   * Broadcast a local patch to all other connected clients.
   * @param {object} patch - JSON Merge Patch describing the change
   */
  sendPatch(patch) {
    if (!this.connected) return;
    this.#send({ type: 'patch', projectId: this.#projectId, username: this.#username, patch });
  }

  /**
   * Register a callback for presence updates.
   * @param {function(string[]):void} handler - receives array of usernames
   */
  onPresence(handler) {
    this.addEventListener('presence', ev => handler(ev.detail));
  }

  /**
   * Register a callback for remote patches.
   * @param {function({username:string, patch:object}):void} handler
   */
  onRemotePatch(handler) {
    this.addEventListener('remotePatch', ev => handler(ev.detail));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  #send(msg) {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(msg));
    }
  }

  #handleMessage(msg) {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'presence':
        this.dispatchEvent(new CustomEvent('presence', { detail: msg.users || [] }));
        break;
      case 'patch':
        this.dispatchEvent(new CustomEvent('remotePatch', {
          detail: { username: msg.username, patch: msg.patch }
        }));
        break;
      case 'pong':
        // keepalive acknowledged
        break;
      case 'error':
        console.warn('[collab] Server error:', msg.message);
        break;
    }
  }

  #scheduleReconnect() {
    const delay = RECONNECT_DELAYS_MS[Math.min(this.#reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.#reconnectAttempt += 1;
    setTimeout(() => {
      if (!this.#intentionalClose) this.connect();
    }, delay);
  }

  #startPing() {
    this.#stopPing();
    this.#pingTimer = setInterval(() => {
      this.#send({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  #stopPing() {
    if (this.#pingTimer !== null) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }
  }
}

/**
 * Render a compact presence bar showing which users are co-editing.
 *
 * @param {HTMLElement} container - element to render into
 * @param {string[]} users        - list of usernames currently connected
 * @param {string} currentUser   - the local user (shown with "you" tag)
 */
export function renderPresenceBar(container, users, currentUser) {
  if (!container) return;
  container.innerHTML = '';
  if (!users || users.length === 0) {
    container.setAttribute('aria-label', 'No other users connected');
    return;
  }
  container.setAttribute('aria-label', `${users.length} user(s) connected`);
  for (const user of users) {
    const chip = document.createElement('span');
    chip.className = 'presence-chip';
    chip.textContent = user === currentUser ? `${user} (you)` : user;
    chip.setAttribute('title', `${user} is viewing this project`);
    container.appendChild(chip);
  }
}
