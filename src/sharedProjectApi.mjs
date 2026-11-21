// Pure helpers for opening a project from a share link. No DOM or storage
// access here, so everything can be unit-tested in Node.

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

export const SHARED_SESSION_KEY = 'ctr-shared-session';

export function getSnapshotToken(search = '') {
  const value = new URLSearchParams(search).get('snapshotToken');
  return typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;
}

// The shared copy is kept under its own local name so opening a link never
// overwrites one of the visitor's own saved projects.
export function sharedLocalProjectName(project) {
  return `shared-${project}`;
}

function isValidSession(value) {
  return Boolean(value)
    && typeof value === 'object'
    && TOKEN_PATTERN.test(value.token)
    && PROJECT_PATTERN.test(value.project)
    && (value.mode === 'edit' || value.mode === 'read')
    && (value.version === null || typeof value.version === 'string');
}

export function readSharedSession(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(SHARED_SESSION_KEY));
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSharedSession(storage, session) {
  if (!isValidSession(session)) return false;
  try {
    storage.setItem(SHARED_SESSION_KEY, JSON.stringify({
      token: session.token,
      project: session.project,
      mode: session.mode,
      version: session.version,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSharedSession(storage) {
  try {
    storage.removeItem(SHARED_SESSION_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** True when a share link is in the URL or a shared session is remembered for this tab. */
export function isSharedSessionActive(win = globalThis.window) {
  if (!win) return false;
  try {
    if (getSnapshotToken(win.location?.search || '')) return true;
    return Boolean(win.sessionStorage && readSharedSession(win.sessionStorage));
  } catch {
    return false;
  }
}

/** Fetch the shared project. */
export async function fetchSharedProject(token, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`/shared/${encodeURIComponent(token)}`);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (response.status === 404) return { ok: false, reason: 'not_found' };
  if (!response.ok) return { ok: false, reason: 'unavailable' };
  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  const snapshot = body?.snapshot;
  if (!snapshot || !PROJECT_PATTERN.test(String(snapshot.project))
    || (snapshot.mode !== 'edit' && snapshot.mode !== 'read')
    || !body.data || typeof body.data !== 'object') {
    return { ok: false, reason: 'unavailable' };
  }
  return {
    ok: true,
    project: snapshot.project,
    mode: snapshot.mode,
    version: typeof body.version === 'string' ? body.version : null,
    data: body.data,
  };
}

/** Save the project back through an edit link, replacing `baseVersion`. */
export async function uploadSharedProject({ token, baseVersion, data }, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`/shared/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, baseVersion: baseVersion || undefined }),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: true, version: typeof body.version === 'string' ? body.version : null };
  }
  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, reason: 'conflict', currentVersion: body.currentVersion ?? null };
  }
  if (response.status === 403) return { ok: false, reason: 'read_only' };
  if (response.status === 404) return { ok: false, reason: 'not_found' };
  return { ok: false, reason: 'unavailable' };
}
