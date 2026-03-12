import express from 'express';
import zlib from 'zlib';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

const DEFAULT_DATA_DIR = process.env.SERVER_DATA_DIR
  ? path.resolve(process.env.SERVER_DATA_DIR)
  : path.join(process.cwd(), 'server_data');
const DEFAULT_TOKEN_TTL_MS = Number.parseInt(process.env.AUTH_TOKEN_TTL_MS || '3600000', 10);
const DEFAULT_RATE_LIMIT_WINDOW_MS = Number.parseInt(
  process.env.PROJECT_RATE_LIMIT_WINDOW_MS || '900000',
  10
);
const DEFAULT_RATE_LIMIT_MAX = Number.parseInt(process.env.PROJECT_RATE_LIMIT_MAX || '100', 10);
const PASSWORD_ALGORITHM = 'scrypt';
const PASSWORD_KEYLEN = 64;
const FINGERPRINTED_ASSET_PATTERN = /\.[0-9a-f]{8,}\.[^.]+$/i;

function formatDurationMs(startNs, endNs = process.hrtime.bigint()) {
  return Number(endNs - startNs) / 1e6;
}

// Only allow alphanumeric, dashes, and underscores to prevent path traversal.
const VALID_NAME_RE = /^[a-zA-Z0-9_-]{1,100}$/;
function isValidName(name) {
  return typeof name === 'string' && VALID_NAME_RE.test(name);
}

function appendServerTiming(res, metricName, durationMs) {
  const normalizedDuration = Math.max(0, durationMs);
  const metric = `${metricName};dur=${normalizedDuration.toFixed(2)}`;
  const existing = res.getHeader('Server-Timing');
  if (typeof existing === 'string' && existing.length > 0) {
    res.setHeader('Server-Timing', `${existing}, ${metric}`);
    return;
  }
  res.setHeader('Server-Timing', metric);
}

function setStaticCacheHeaders(res, filePath) {
  const relative = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  const baseName = path.basename(filePath);
  if (FINGERPRINTED_ASSET_PATTERN.test(baseName)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }
  if (relative.endsWith('.html')) {
    res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
}

function applyMergePatch(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }

  const base = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete base[key];
      continue;
    }
    base[key] = applyMergePatch(base[key], value);
  }
  return base;
}

function normalizeSaveRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { mode: 'replace', data: body ?? {} };
  }

  if (Object.prototype.hasOwnProperty.call(body, 'patch')) {
    return {
      mode: 'patch',
      patch: body.patch ?? {},
      baseVersion: body.baseVersion
    };
  }

  if (Object.prototype.hasOwnProperty.call(body, 'data')) {
    return {
      mode: 'replace',
      data: body.data ?? {},
      baseVersion: body.baseVersion
    };
  }

  return { mode: 'replace', data: body };
}

const PROJECT_CACHE_MAX = 200;

class ProjectStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.cache = new Map();
  }

  #evictIfNeeded() {
    if (this.cache.size < PROJECT_CACHE_MAX) return;
    // Evict the least-recently-inserted entry (first key in insertion order).
    const firstKey = this.cache.keys().next().value;
    this.cache.delete(firstKey);
  }

  #cacheKey(username, project) {
    return `${username}:${project}`;
  }

  #projectDir(username, project) {
    return path.join(this.dataDir, username, project);
  }

  async loadLatest(username, project) {
    const startedAt = process.hrtime.bigint();
    const cacheKey = this.#cacheKey(username, project);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        version: cached.version,
        data: cached.data,
        metrics: { readMs: 0, parseMs: 0, cacheHit: true }
      };
    }

    const projDir = this.#projectDir(username, project);
    const files = await fs.readdir(projDir);
    const versions = files.filter(f => f.endsWith('.json')).sort();
    if (!versions.length) {
      throw new Error('not-found');
    }

    const latest = versions[versions.length - 1];
    const readDoneAt = process.hrtime.bigint();
    const text = await fs.readFile(path.join(projDir, latest), 'utf-8');
    const parsed = JSON.parse(text);
    const parseDoneAt = process.hrtime.bigint();
    const entry = {
      version: latest.replace('.json', ''),
      data: parsed,
      json: JSON.stringify(parsed)
    };
    this.#evictIfNeeded();
    this.cache.set(cacheKey, entry);

    return {
      version: entry.version,
      data: entry.data,
      metrics: {
        readMs: formatDurationMs(startedAt, readDoneAt),
        parseMs: formatDurationMs(readDoneAt, parseDoneAt),
        cacheHit: false
      }
    };
  }

  async save(username, project, requestBody) {
    const input = normalizeSaveRequest(requestBody);
    const metrics = { loadMs: 0, mergeMs: 0, serializeMs: 0, writeMs: 0, skippedWrite: false };
    let current = { version: null, data: {} };

    const loadStartedAt = process.hrtime.bigint();
    try {
      const loaded = await this.loadLatest(username, project);
      current = { version: loaded.version, data: loaded.data };
      metrics.loadMs = loaded.metrics.readMs + loaded.metrics.parseMs;
    } catch (err) {
      if (err.code !== 'ENOENT' && err.message !== 'not-found') {
        throw err;
      }
    }
    const loadDoneAt = process.hrtime.bigint();
    if (!metrics.loadMs) {
      metrics.loadMs = formatDurationMs(loadStartedAt, loadDoneAt);
    }

    if (input.baseVersion && current.version && input.baseVersion !== current.version) {
      const conflict = new Error('version-conflict');
      conflict.code = 'VERSION_CONFLICT';
      conflict.currentVersion = current.version;
      throw conflict;
    }

    const mergeStartedAt = process.hrtime.bigint();
    const nextData = input.mode === 'patch' ? applyMergePatch(current.data, input.patch ?? {}) : input.data ?? {};
    const mergeDoneAt = process.hrtime.bigint();
    metrics.mergeMs = formatDurationMs(mergeStartedAt, mergeDoneAt);

    const serializeStartedAt = process.hrtime.bigint();
    const compactJson = JSON.stringify(nextData ?? {});
    const prettyJson = `${JSON.stringify(nextData ?? {}, null, 2)}\n`;
    const serializeDoneAt = process.hrtime.bigint();
    metrics.serializeMs = formatDurationMs(serializeStartedAt, serializeDoneAt);

    const cacheKey = this.#cacheKey(username, project);
    const cached = this.cache.get(cacheKey);
    const currentJson = cached?.json ?? JSON.stringify(current.data ?? {});
    if (currentJson === compactJson) {
      metrics.skippedWrite = true;
      return { version: current.version ?? null, data: nextData, metrics };
    }

    const userDir = this.#projectDir(username, project);
    await fs.mkdir(userDir, { recursive: true });
    const writeStartedAt = process.hrtime.bigint();
    const version = Date.now().toString();
    await fs.writeFile(path.join(userDir, `${version}.json`), prettyJson);
    const writeDoneAt = process.hrtime.bigint();
    metrics.writeMs = formatDurationMs(writeStartedAt, writeDoneAt);

    this.#evictIfNeeded();
    this.cache.set(cacheKey, { version, data: nextData, json: compactJson });
    return { version, data: nextData, metrics };
  }
}

class SnapshotStore {
  constructor(filePath, ttlMs) {
    this.filePath = filePath;
    this.ttlMs = ttlMs;
    this.snapshots = new Map();
    this.ready = false;
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const data = JSON.parse(await fs.readFile(this.filePath, 'utf-8'));
      if (Array.isArray(data)) {
        data.forEach(item => {
          if (!item || typeof item !== 'object' || !item.id) return;
          this.snapshots.set(item.id, item);
        });
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    this.ready = true;
    await this.#persist();
  }

  async #persist() {
    if (!this.ready) return;
    const payload = Array.from(this.snapshots.values()).sort((a, b) => {
      if (a.createdAt < b.createdAt) return 1;
      if (a.createdAt > b.createdAt) return -1;
      return 0;
    });
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2));
  }

  #isExpired(entry, now = Date.now()) {
    return !entry || entry.expiresAt <= now;
  }

  async create({ username, project, mode, version }) {
    const createdAt = Date.now();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const id = crypto.randomUUID();
    const entry = {
      id,
      owner: username,
      project,
      mode: mode === 'edit' ? 'edit' : 'read',
      version: version ?? null,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      revokedAt: null,
      lastAccessAt: null,
      tokenHash
    };
    this.snapshots.set(id, entry);
    await this.#persist();
    return { entry, token };
  }

  async listByOwner(username, project) {
    const now = Date.now();
    const rows = [];
    for (const entry of this.snapshots.values()) {
      if (entry.owner !== username || entry.project !== project) continue;
      rows.push({
        id: entry.id,
        project: entry.project,
        mode: entry.mode,
        version: entry.version,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        revokedAt: entry.revokedAt,
        lastAccessAt: entry.lastAccessAt,
        expired: this.#isExpired(entry, now)
      });
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  }

  async revoke(username, project, snapshotId) {
    const entry = this.snapshots.get(snapshotId);
    if (!entry || entry.owner !== username || entry.project !== project) {
      return false;
    }
    if (!entry.revokedAt) {
      entry.revokedAt = Date.now();
      this.snapshots.set(entry.id, entry);
      await this.#persist();
    }
    return true;
  }

  async findByToken(token) {
    if (!token || typeof token !== 'string') return null;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    for (const entry of this.snapshots.values()) {
      if (entry.tokenHash === tokenHash) {
        return entry;
      }
    }
    return null;
  }

  async touch(snapshotId) {
    const entry = this.snapshots.get(snapshotId);
    if (!entry) return;
    entry.lastAccessAt = Date.now();
    this.snapshots.set(snapshotId, entry);
    await this.#persist();
  }
}

function createRateLimiter({ windowMs, max }) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.connection?.remoteAddress || 'unknown';
    const limit = Math.max(1, max);
    const window = Math.max(1, windowMs);
    let entry = hits.get(key);
    if (!entry || entry.resetTime <= now) {
      entry = { count: 0, resetTime: now + window };
    }
    entry.count += 1;
    hits.set(key, entry);

    const remaining = Math.max(0, limit - entry.count);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));

    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    next();
  };
}

class FileSessionStore {
  constructor(filePath, ttlMs) {
    this.filePath = filePath;
    this.ttlMs = ttlMs;
    this.sessions = new Map();
    this.ready = false;
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const data = JSON.parse(await fs.readFile(this.filePath, 'utf-8'));
      if (data && typeof data === 'object') {
        const now = Date.now();
        Object.entries(data).forEach(([token, session]) => {
          if (session && session.expiresAt && session.expiresAt > now) {
            this.sessions.set(token, session);
          }
        });
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    this.ready = true;
    await this.#persist();
  }

  async #persist() {
    if (!this.ready) return;
    const payload = Object.fromEntries(this.sessions.entries());
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2));
  }

  async #pruneExpired() {
    const now = Date.now();
    let changed = false;
    for (const [token, session] of this.sessions.entries()) {
      if (!session || session.expiresAt <= now) {
        this.sessions.delete(token);
        changed = true;
      }
    }
    if (changed) await this.#persist();
  }

  async createSession(username) {
    await this.#pruneExpired();
    for (const [token, session] of this.sessions.entries()) {
      if (session.username === username) {
        this.sessions.delete(token);
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.ttlMs;
    this.sessions.set(token, { username, csrfToken, expiresAt });
    await this.#persist();
    return { token, csrfToken, expiresAt };
  }

  async get(token) {
    await this.#pruneExpired();
    const session = this.sessions.get(token);
    if (!session) return null;
    return { ...session };
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, PASSWORD_KEYLEN);
  return `${PASSWORD_ALGORITHM}:${salt}:${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') {
    return { valid: false, needsUpgrade: false };
  }

  const parts = stored.split(':');
  if (parts.length === 3 && parts[0] === PASSWORD_ALGORITHM) {
    const [, salt, key] = parts;
    if (!salt || !key) {
      return { valid: false, needsUpgrade: false };
    }
    const derivedKey = await scrypt(password, salt, PASSWORD_KEYLEN);
    const storedKey = Buffer.from(key, 'hex');
    if (storedKey.length !== derivedKey.length) {
      return { valid: false, needsUpgrade: false };
    }
    const valid = crypto.timingSafeEqual(storedKey, Buffer.from(derivedKey));
    return { valid, needsUpgrade: false };
  }

  if (stored === password) {
    return { valid: true, needsUpgrade: true };
  }

  return { valid: false, needsUpgrade: false };
}

const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function resolveOptions(options = {}) {
  const {
    dataDir = DEFAULT_DATA_DIR,
    staticRoot = process.cwd(),
    tokenTtlMs = DEFAULT_TOKEN_TTL_MS,
    rateLimit = {},
    enforceHttps = process.env.NODE_ENV === 'production'
  } = options;

  const { windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS, max = DEFAULT_RATE_LIMIT_MAX } = rateLimit;

  return {
    dataDir: path.resolve(dataDir),
    staticRoot: path.resolve(staticRoot),
    tokenTtlMs: Number(tokenTtlMs) || DEFAULT_TOKEN_TTL_MS,
    rateLimitWindowMs: Number(windowMs) || DEFAULT_RATE_LIMIT_WINDOW_MS,
    rateLimitMax: Number(max) || DEFAULT_RATE_LIMIT_MAX,
    enforceHttps: Boolean(enforceHttps)
  };
}

export async function createApp(options = {}) {
  const {
    dataDir,
    staticRoot,
    tokenTtlMs,
    rateLimitWindowMs,
    rateLimitMax,
    enforceHttps
  } = resolveOptions(options);

  await fs.mkdir(dataDir, { recursive: true });
  const usersFile = path.join(dataDir, 'users.json');
  const sessionsFile = path.join(dataDir, 'sessions.json');
  const snapshotsFile = path.join(dataDir, 'snapshots.json');

  let users = {};
  try {
    users = JSON.parse(await fs.readFile(usersFile, 'utf-8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    users = {};
  }

  const sessionStore = new FileSessionStore(sessionsFile, tokenTtlMs);
  await sessionStore.init();
  const projectStore = new ProjectStore(dataDir);
  const snapshotStore = new SnapshotStore(snapshotsFile, tokenTtlMs);
  await snapshotStore.init();

  async function saveUsers() {
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
  }

  const app = express();

  if (enforceHttps) {
    app.enable('trust proxy');
    app.use((req, res, next) => {
      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        next();
        return;
      }
      if (!req.headers.host) {
        res.status(400).json({ error: 'HTTPS required' });
        return;
      }
      res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    });
  }

  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const allowCompression =
      !req.headers['x-no-compression'] &&
      typeof acceptEncoding === 'string' &&
      /\bgzip\b/i.test(acceptEncoding);

    if (!allowCompression) {
      next();
      return;
    }

    const originalSend = res.send.bind(res);
    res.send = body => {
      const contentType = String(res.getHeader('Content-Type') || '').toLowerCase();
      const compressibleType =
        contentType.includes('text/') ||
        contentType.includes('json') ||
        contentType.includes('javascript') ||
        contentType.includes('xml') ||
        contentType.includes('svg');

      if (!compressibleType || res.getHeader('Content-Encoding')) {
        return originalSend(body);
      }

      const source = Buffer.isBuffer(body)
        ? body
        : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? ''));
      if (source.length < 1024) {
        return originalSend(body);
      }

      const compressed = zlib.gzipSync(source, { level: 6 });
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(compressed.length));
      return originalSend(compressed);
    };

    next();
  });
  app.use(
    express.static(staticRoot, {
      setHeaders: setStaticCacheHeaders
    })
  );

  const rateLimiter = createRateLimiter({ windowMs: rateLimitWindowMs, max: rateLimitMax });
  app.use('/projects', rateLimiter);
  app.use('/shared', rateLimiter);

  // Stricter rate limit for auth endpoints to prevent brute-force attacks.
  const authRateLimiter = createRateLimiter({ windowMs: rateLimitWindowMs, max: 20 });
  app.use('/login', authRateLimiter);
  app.use('/signup', authRateLimiter);

  app.post(
    '/signup',
    asyncHandler(async (req, res) => {
      const { username, password } = req.body || {};
      if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Missing credentials' });
        return;
      }
      const trimmedUser = username.trim();
      if (!trimmedUser || !password) {
        res.status(400).json({ error: 'Missing credentials' });
        return;
      }
      if (!isValidName(trimmedUser)) {
        res.status(400).json({ error: 'Invalid username' });
        return;
      }
      if (password.length > 1000) {
        res.status(400).json({ error: 'Password too long' });
        return;
      }
      if (users[trimmedUser]) {
        res.status(409).json({ error: 'User exists' });
        return;
      }
      const hashed = await hashPassword(password);
      users[trimmedUser] = { password: hashed, createdAt: new Date().toISOString() };
      await saveUsers();
      res.status(201).json({ message: 'User created' });
    })
  );

  app.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { username, password } = req.body || {};
      if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Missing credentials' });
        return;
      }
      const trimmedUser = username.trim();
      if (!isValidName(trimmedUser) || password.length > 1000) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      const record = users[trimmedUser];
      if (!record) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      const verification = await verifyPassword(password, record.password);
      if (!verification.valid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      if (verification.needsUpgrade) {
        users[trimmedUser].password = await hashPassword(password);
        await saveUsers();
      }

      const session = await sessionStore.createSession(trimmedUser);
      res.json(session);
    })
  );

  const auth = asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const session = await sessionStore.get(token);
    if (!session) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.username = session.username;
    req.session = session;
    req.authToken = token;
    next();
  });

  const csrfProtection = (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    if (!req.session) {
      res.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }
    const header = req.headers['x-csrf-token'];
    if (typeof header !== 'string') {
      res.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }
    if (!/^[0-9a-fA-F]+$/.test(header)) {
      res.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }
    let provided;
    try {
      provided = Buffer.from(header, 'hex');
    } catch {
      res.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }
    const expected = Buffer.from(req.session.csrfToken, 'hex');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      res.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }
    next();
  };


  app.get(
    '/shared/:token',
    asyncHandler(async (req, res) => {
      const snapshot = await snapshotStore.findByToken(req.params.token);
      if (!snapshot || snapshot.revokedAt || snapshot.expiresAt <= Date.now()) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const latest = await projectStore.loadLatest(snapshot.owner, snapshot.project);
      await snapshotStore.touch(snapshot.id);
      res.json({
        snapshot: {
          id: snapshot.id,
          project: snapshot.project,
          mode: snapshot.mode,
          version: snapshot.version,
          createdAt: snapshot.createdAt,
          expiresAt: snapshot.expiresAt,
          revokedAt: snapshot.revokedAt
        },
        data: latest.data
      });
    })
  );

  app.post(
    '/shared/:token',
    asyncHandler(async (req, res) => {
      const snapshot = await snapshotStore.findByToken(req.params.token);
      if (!snapshot || snapshot.revokedAt || snapshot.expiresAt <= Date.now()) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (snapshot.mode !== 'edit') {
        res.status(403).json({ error: 'Read-only snapshot' });
        return;
      }
      const saved = await projectStore.save(snapshot.owner, snapshot.project, req.body);
      await snapshotStore.touch(snapshot.id);
      res.json({ version: saved.version, unchanged: saved.metrics.skippedWrite });
    })
  );

  app.use('/projects', auth, csrfProtection);

  app.post(
    '/projects/:project',
    asyncHandler(async (req, res) => {
      const project = req.params.project;
      const username = req.username;
      if (!isValidName(project) || !isValidName(username)) {
        res.status(400).json({ error: 'Invalid project name' });
        return;
      }
      const persistStartedAt = process.hrtime.bigint();
      try {
        const saved = await projectStore.save(username, project, req.body);
        const persistMs = formatDurationMs(persistStartedAt);
        appendServerTiming(res, 'project.persist', persistMs);
        appendServerTiming(res, 'project.load', saved.metrics.loadMs);
        appendServerTiming(res, 'project.merge', saved.metrics.mergeMs);
        appendServerTiming(res, 'project.serialize', saved.metrics.serializeMs);
        appendServerTiming(res, 'project.write', saved.metrics.writeMs);
        appendServerTiming(res, 'project.total', persistMs);

        res.json({
          version: saved.version,
          unchanged: saved.metrics.skippedWrite
        });
      } catch (err) {
        if (err.code === 'VERSION_CONFLICT') {
          res.status(409).json({ error: 'Version conflict', currentVersion: err.currentVersion });
          return;
        }
        throw err;
      }
    })
  );

  app.get(
    '/projects/:project',
    asyncHandler(async (req, res) => {
      const project = req.params.project;
      const username = req.username;
      if (!isValidName(project) || !isValidName(username)) {
        res.status(400).json({ error: 'Invalid project name' });
        return;
      }
      const loadStartedAt = process.hrtime.bigint();
      try {
        const latest = await projectStore.loadLatest(username, project);
        const totalMs = formatDurationMs(loadStartedAt);
        appendServerTiming(res, 'project.read', latest.metrics.readMs);
        appendServerTiming(res, 'project.parse', latest.metrics.parseMs);
        appendServerTiming(res, 'project.total', totalMs);
        res.json({ version: latest.version, data: latest.data });
      } catch {
        res.status(404).json({ error: 'Not found' });
      }
    })
  );

  app.get(
    '/projects/:project/snapshots',
    asyncHandler(async (req, res) => {
      if (!isValidName(req.params.project) || !isValidName(req.username)) {
        res.status(400).json({ error: 'Invalid project name' });
        return;
      }
      const rows = await snapshotStore.listByOwner(req.username, req.params.project);
      res.json({ snapshots: rows });
    })
  );

  app.post(
    '/projects/:project/snapshots',
    asyncHandler(async (req, res) => {
      const project = req.params.project;
      if (!isValidName(project) || !isValidName(req.username)) {
        res.status(400).json({ error: 'Invalid project name' });
        return;
      }
      const mode = req.body?.mode === 'edit' ? 'edit' : 'read';
      let latestVersion = null;
      try {
        const latest = await projectStore.loadLatest(req.username, project);
        latestVersion = latest.version;
      } catch {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const created = await snapshotStore.create({
        username: req.username,
        project,
        mode,
        version: latestVersion
      });
      const host = req.get('host');
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const url = host ? `${protocol}://${host}/oneline.html?snapshotToken=${created.token}` : null;
      res.status(201).json({
        id: created.entry.id,
        project: created.entry.project,
        mode: created.entry.mode,
        version: created.entry.version,
        createdAt: created.entry.createdAt,
        expiresAt: created.entry.expiresAt,
        revokedAt: created.entry.revokedAt,
        token: created.token,
        url
      });
    })
  );

  app.delete(
    '/projects/:project/snapshots/:snapshotId',
    asyncHandler(async (req, res) => {
      if (!isValidName(req.params.project) || !isValidName(req.username)) {
        res.status(400).json({ error: 'Invalid project name' });
        return;
      }
      const ok = await snapshotStore.revoke(req.username, req.params.project, req.params.snapshotId);
      if (!ok) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(204).end();
    })
  );


  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createApp();
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Server listening on port ${actualPort}`);
  });
}
