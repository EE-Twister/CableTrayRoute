import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export const VALID_ACTIONS = Object.freeze([
  'CREATE',
  'UPDATE',
  'DELETE',
  'READ_SENSITIVE',
  'LOGIN',
  'LOGOUT',
  'ROLE_CHANGE',
]);

export function computeEntryHash({ id, actor, ts, action, entityId }) {
  const data = `${id}|${actor}|${ts}|${action}|${entityId ?? ''}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function buildEntry({ actor, action, entityType, entityId, projectId, diff }) {
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const entry = {
    id,
    ts,
    actor: String(actor ?? ''),
    action: String(action ?? ''),
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    projectId: projectId ?? null,
    diff: diff ?? null,
  };
  entry.reqHash = computeEntryHash({ id, actor: entry.actor, ts, action: entry.action, entityId: entry.entityId ?? '' });
  return entry;
}

export async function appendAuditEntry(logPath, fields) {
  const entry = buildEntry(fields);
  await fs.appendFile(logPath, JSON.stringify(entry) + '\n', 'utf-8');
  return entry;
}

export async function queryAuditLog(logPath, filters = {}) {
  let text;
  try {
    text = await fs.readFile(logPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const entries = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }

  const filtered = entries.filter(entry => {
    if (filters.actor && entry.actor !== filters.actor) return false;
    if (filters.action && entry.action !== filters.action) return false;
    if (filters.entityType && entry.entityType !== filters.entityType) return false;
    if (filters.entityId && entry.entityId !== filters.entityId) return false;
    if (filters.projectId && entry.projectId !== filters.projectId) return false;
    if (filters.after !== undefined && new Date(entry.ts).getTime() < filters.after) return false;
    if (filters.before !== undefined && new Date(entry.ts).getTime() > filters.before) return false;
    return true;
  });

  const limit = Number.isFinite(filters.limit) && filters.limit > 0 ? filters.limit : 200;
  return filtered.slice(-limit);
}

export function verifyEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.reqHash !== 'string') return false;
  const expected = computeEntryHash({
    id: entry.id,
    actor: entry.actor,
    ts: entry.ts,
    action: entry.action,
    entityId: entry.entityId ?? '',
  });
  return entry.reqHash === expected;
}
