const CONFIG_PATH = 'supabase-config.json';

let configPromise = null;

export class SupabaseRequestError extends Error {
  constructor(message, { status = 0, retryAfterSeconds = null, body = null } = {}) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.body = body;
  }
}

function normalizeSupabaseUrl(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

function normalizeConfig(input = {}) {
  const supabaseUrl = normalizeSupabaseUrl(input.supabaseUrl || input.url || input.SUPABASE_URL);
  const supabaseAnonKey = typeof input.supabaseAnonKey === 'string'
    ? input.supabaseAnonKey.trim()
    : typeof input.anonKey === 'string'
      ? input.anonKey.trim()
      : typeof input.SUPABASE_ANON_KEY === 'string'
        ? input.SUPABASE_ANON_KEY.trim()
        : '';
  return {
    supabaseUrl,
    supabaseAnonKey,
    enabled: Boolean(supabaseUrl && supabaseAnonKey)
  };
}

function configUrl() {
  const base = typeof document !== 'undefined' && document.baseURI
    ? document.baseURI
    : typeof location !== 'undefined' && location.href
      ? location.href
      : 'http://localhost/';
  return new URL(CONFIG_PATH, base).href;
}

function readGlobalConfig() {
  const candidate = globalThis.CTR_SUPABASE_CONFIG || globalThis.__CTR_SUPABASE_CONFIG__;
  if (candidate && typeof candidate === 'object') {
    return normalizeConfig(candidate);
  }
  return null;
}

function readStorageConfig() {
  try {
    // Bootstrap-only read of the Supabase URL/key before projectStorage.js is
    // available — this selects the persistence backend itself, so it cannot
    // route through projectStorage helpers.
    // eslint-disable-next-line no-restricted-globals
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    if (!storage) return null;
    const supabaseUrl = storage.getItem('CTR_SUPABASE_URL') || '';
    const supabaseAnonKey = storage.getItem('CTR_SUPABASE_ANON_KEY') || '';
    if (!supabaseUrl && !supabaseAnonKey) return null;
    return normalizeConfig({ supabaseUrl, supabaseAnonKey });
  } catch {
    return null;
  }
}

async function readFileConfig() {
  if (typeof fetch !== 'function') return normalizeConfig();
  try {
    const res = await fetch(configUrl(), { cache: 'no-store' });
    if (!res.ok) return normalizeConfig();
    const contentType = res.headers?.get?.('content-type') || '';
    if (contentType && !contentType.includes('json')) {
      return normalizeConfig();
    }
    const data = await res.json().catch(() => ({}));
    return normalizeConfig(data);
  } catch {
    return normalizeConfig();
  }
}

export async function getSupabaseConfig({ force = false } = {}) {
  if (force) configPromise = null;
  if (!configPromise) {
    configPromise = Promise.resolve()
      .then(() => readGlobalConfig() || readStorageConfig())
      .then(config => config && config.enabled ? config : readFileConfig());
  }
  return configPromise;
}

export async function isSupabaseConfigured() {
  const config = await getSupabaseConfig();
  return config.enabled;
}

function requireConfigured(config) {
  if (!config.enabled) {
    throw new Error('Supabase is not configured. Add supabaseUrl and supabaseAnonKey to supabase-config.json.');
  }
}

function authHeaders(config, accessToken = '') {
  const headers = {
    apikey: config.supabaseAnonKey,
    'Content-Type': 'application/json'
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

async function parseSupabaseResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body.error_description || body.msg || body.message || body.error || `Supabase request failed (${res.status})`;
    const retryAfter = Number.parseInt(res.headers?.get?.('retry-after') || '', 10);
    const retryAfterSeconds = Number.isFinite(retryAfter)
      ? retryAfter
      : parseRetryAfterSeconds(message);
    throw new SupabaseRequestError(message, {
      status: res.status,
      retryAfterSeconds,
      body
    });
  }
  return body;
}

function parseRetryAfterSeconds(message) {
  if (typeof message !== 'string') return null;
  const match = message.match(/after\s+(\d+)\s+seconds?/i);
  if (!match) return null;
  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) ? seconds : null;
}

function authUrl(config, path) {
  return `${config.supabaseUrl}/auth/v1${path}`;
}

function restUrl(config, path) {
  return new URL(`${config.supabaseUrl}/rest/v1${path}`);
}

export function isSupabaseAuthContext(auth) {
  return Boolean(auth && auth.provider === 'supabase' && auth.accessToken);
}

export function createAuthContextFromSupabaseSession(session) {
  const user = session?.user || {};
  const appMetadata = user.app_metadata && typeof user.app_metadata === 'object' ? user.app_metadata : {};
  const userMetadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
  const expiresAt = Number.isFinite(Number(session?.expires_at))
    ? Number(session.expires_at) * 1000
    : Date.now() + Math.max(1, Number(session?.expires_in) || 3600) * 1000;
  return {
    provider: 'supabase',
    accessToken: session?.access_token || '',
    refreshToken: session?.refresh_token || '',
    expiresAt,
    user: userMetadata.username || user.email || user.id || null,
    email: user.email || null,
    userId: user.id || null,
    role: appMetadata.role || userMetadata.role || 'engineer'
  };
}

export async function supabaseSignUp({ email, password, username }) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  const res = await fetch(authUrl(config, '/signup'), {
    method: 'POST',
    headers: authHeaders(config),
    body: JSON.stringify({
      email,
      password,
      data: { username }
    })
  });
  return parseSupabaseResponse(res);
}

export async function supabaseSignIn({ email, password }) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  const res = await fetch(authUrl(config, '/token?grant_type=password'), {
    method: 'POST',
    headers: authHeaders(config),
    body: JSON.stringify({ email, password })
  });
  return parseSupabaseResponse(res);
}

export async function supabaseRefreshSession(auth) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  if (!auth?.refreshToken) throw new Error('Missing Supabase refresh token.');
  const res = await fetch(authUrl(config, '/token?grant_type=refresh_token'), {
    method: 'POST',
    headers: authHeaders(config),
    body: JSON.stringify({ refresh_token: auth.refreshToken })
  });
  return parseSupabaseResponse(res);
}

export async function supabaseSignOut(auth, { scope = '' } = {}) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  if (!auth?.accessToken) return;
  const path = scope ? `/logout?scope=${encodeURIComponent(scope)}` : '/logout';
  const res = await fetch(authUrl(config, path), {
    method: 'POST',
    headers: authHeaders(config, auth.accessToken)
  });
  if (!res.ok && res.status !== 401) {
    await parseSupabaseResponse(res);
  }
}

export async function supabaseUpdatePassword(auth, password) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  if (!auth?.accessToken) throw new Error('Supabase login required.');
  const res = await fetch(authUrl(config, '/user'), {
    method: 'PUT',
    headers: authHeaders(config, auth.accessToken),
    body: JSON.stringify({ password })
  });
  return parseSupabaseResponse(res);
}

export async function supabaseResendEmailConfirmation(email) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  if (!normalizedEmail) throw new Error('Email is required.');
  const res = await fetch(authUrl(config, '/resend'), {
    method: 'POST',
    headers: authHeaders(config),
    body: JSON.stringify({
      type: 'signup',
      email: normalizedEmail
    })
  });
  return parseSupabaseResponse(res);
}

export async function supabaseUpdateProfile(auth, { username, email } = {}) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  if (!auth?.accessToken) throw new Error('Login required.');
  const body = {};
  if (typeof email === 'string' && email.trim()) body.email = email.trim();
  if (typeof username === 'string' && username.trim()) body.data = { username: username.trim() };
  const res = await fetch(authUrl(config, '/user'), {
    method: 'PUT',
    headers: authHeaders(config, auth.accessToken),
    body: JSON.stringify(body)
  });
  return parseSupabaseResponse(res);
}

export async function supabaseListAccountDeletionRequests(auth) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireProjectAuth(auth);
  const url = restUrl(config, '/account_deletion_requests');
  url.searchParams.set('select', 'id,status,reason,requested_at,updated_at');
  url.searchParams.set('order', 'requested_at.desc');
  url.searchParams.set('limit', '1');
  const res = await fetch(url.href, {
    headers: authHeaders(config, auth.accessToken)
  });
  const rows = await parseSupabaseResponse(res);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function supabaseRequestAccountDeletion(auth, { reason = '' } = {}) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireProjectAuth(auth);
  const url = restUrl(config, '/account_deletion_requests');
  const now = new Date().toISOString();
  const res = await fetch(url.href, {
    method: 'POST',
    headers: {
      ...authHeaders(config, auth.accessToken),
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      user_id: auth.userId,
      email: auth.email || null,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
      status: 'requested',
      requested_at: now
    })
  });
  const rows = await parseSupabaseResponse(res);
  return Array.isArray(rows) && rows.length ? rows[0] : rows;
}

export async function supabaseAdminListAccountDeletionRequests(auth, { status = '', limit = 100 } = {}) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireSupabaseAdminAuth(auth);
  const url = restUrl(config, '/account_deletion_requests');
  url.searchParams.set('select', 'id,user_id,email,reason,status,requested_at,updated_at');
  url.searchParams.set('order', 'requested_at.desc');
  url.searchParams.set('limit', String(Math.min(Math.max(Number(limit) || 100, 1), 500)));
  if (status) url.searchParams.set('status', `eq.${status}`);
  const res = await fetch(url.href, {
    headers: authHeaders(config, auth.accessToken)
  });
  const rows = await parseSupabaseResponse(res);
  return Array.isArray(rows) ? rows : [];
}

export async function supabaseAdminUpdateAccountDeletionRequest(auth, id, status) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireSupabaseAdminAuth(auth);
  const requestId = typeof id === 'string' ? id.trim() : '';
  if (!requestId) throw new Error('Deletion request id is required.');
  const nextStatus = typeof status === 'string' ? status.trim() : '';
  if (!['requested', 'reviewing', 'completed', 'denied'].includes(nextStatus)) {
    throw new Error('Invalid deletion request status.');
  }
  const url = restUrl(config, '/account_deletion_requests');
  url.searchParams.set('id', `eq.${requestId}`);
  const res = await fetch(url.href, {
    method: 'PATCH',
    headers: {
      ...authHeaders(config, auth.accessToken),
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      status: nextStatus,
      updated_at: new Date().toISOString()
    })
  });
  const rows = await parseSupabaseResponse(res);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function requireProjectAuth(auth) {
  if (!isSupabaseAuthContext(auth) || !auth.userId) {
    throw new Error('Supabase login required.');
  }
}

function requireSupabaseAdminAuth(auth) {
  requireProjectAuth(auth);
  if (auth.role !== 'admin') {
    throw new Error('Admin role required.');
  }
}

function projectFilterUrl(config, name = '') {
  const url = restUrl(config, '/projects');
  if (name) url.searchParams.set('name', `eq.${name}`);
  return url;
}

function addProjectOwnerFilter(url, auth) {
  if (auth?.userId) {
    url.searchParams.set('user_id', `eq.${auth.userId}`);
  }
  return url;
}

export async function supabaseListProjects(auth) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireProjectAuth(auth);
  const url = restUrl(config, '/projects');
  addProjectOwnerFilter(url, auth);
  url.searchParams.set('select', 'name');
  url.searchParams.set('order', 'name.asc');
  const res = await fetch(url.href, {
    headers: authHeaders(config, auth.accessToken)
  });
  const rows = await parseSupabaseResponse(res);
  return Array.isArray(rows)
    ? rows.map(row => row?.name).filter(name => typeof name === 'string' && name.trim())
    : [];
}

export async function supabaseListProjectSummaries(auth) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireProjectAuth(auth);
  const url = restUrl(config, '/projects');
  addProjectOwnerFilter(url, auth);
  url.searchParams.set('select', 'name,created_at,updated_at');
  url.searchParams.set('order', 'updated_at.desc');
  const res = await fetch(url.href, {
    headers: authHeaders(config, auth.accessToken)
  });
  const rows = await parseSupabaseResponse(res);
  return Array.isArray(rows)
    ? rows
      .filter(row => typeof row?.name === 'string' && row.name.trim())
      .map(row => ({
        name: row.name.trim(),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        source: 'cloud'
      }))
    : [];
}

export async function supabaseLoadProject(auth, name) {
  const projectName = typeof name === 'string' ? name.trim() : '';
  if (!projectName) return null;
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireProjectAuth(auth);
  const url = projectFilterUrl(config, projectName);
  addProjectOwnerFilter(url, auth);
  url.searchParams.set('select', 'data');
  url.searchParams.set('limit', '1');
  const res = await fetch(url.href, {
    headers: authHeaders(config, auth.accessToken)
  });
  const rows = await parseSupabaseResponse(res);
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0]?.data || null;
}

export async function supabaseSaveProject(auth, name, data) {
  const projectName = typeof name === 'string' ? name.trim() : '';
  if (!projectName) throw new Error('Project name is required.');
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireProjectAuth(auth);
  const url = restUrl(config, '/projects');
  url.searchParams.set('on_conflict', 'user_id,name');
  const res = await fetch(url.href, {
    method: 'POST',
    headers: {
      ...authHeaders(config, auth.accessToken),
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({
      user_id: auth.userId,
      name: projectName,
      data,
      updated_at: new Date().toISOString()
    })
  });
  await parseSupabaseResponse(res);
  return true;
}

export async function supabaseDeleteProject(auth, name) {
  const projectName = typeof name === 'string' ? name.trim() : '';
  if (!projectName) return false;
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireProjectAuth(auth);
  const url = projectFilterUrl(config, projectName);
  addProjectOwnerFilter(url, auth);
  const res = await fetch(url.href, {
    method: 'DELETE',
    headers: authHeaders(config, auth.accessToken)
  });
  await parseSupabaseResponse(res);
  return true;
}
