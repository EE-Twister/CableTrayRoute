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

export async function supabaseSignOut(auth) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  if (!auth?.accessToken) return;
  const res = await fetch(authUrl(config, '/logout'), {
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

function requireProjectAuth(auth) {
  if (!isSupabaseAuthContext(auth) || !auth.userId) {
    throw new Error('Supabase login required.');
  }
}

function projectFilterUrl(config, name = '') {
  const url = restUrl(config, '/projects');
  if (name) url.searchParams.set('name', `eq.${name}`);
  return url;
}

export async function supabaseListProjects(auth) {
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireProjectAuth(auth);
  const url = restUrl(config, '/projects');
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

export async function supabaseLoadProject(auth, name) {
  const projectName = typeof name === 'string' ? name.trim() : '';
  if (!projectName) return null;
  const config = await getSupabaseConfig();
  requireConfigured(config);
  requireProjectAuth(auth);
  const url = projectFilterUrl(config, projectName);
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
  const res = await fetch(url.href, {
    method: 'DELETE',
    headers: authHeaders(config, auth.accessToken)
  });
  await parseSupabaseResponse(res);
  return true;
}
