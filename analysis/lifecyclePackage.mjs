/**
 * Lifecycle Package — immutable project-model snapshots for design governance.
 *
 * Pure computation module (no DOM, no dataStore imports) — safe to test in Node.
 * The page script reads live project data and passes it in.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid lifecycle package status labels. */
export const STATUS_OPTIONS = [
  'Draft',
  'Issued for Review',
  'Approved',
  'Superseded',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return 'lp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

/**
 * Deep-clone a value via JSON round-trip so mutations to the original
 * do not affect the snapshot.
 */
function deepClone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

/** Count studies that have non-null, non-empty results. */
function countStudies(studies) {
  if (!studies || typeof studies !== 'object') return 0;
  return Object.values(studies).filter(v => {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }).length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute summary counts from live project data without freezing a snapshot.
 *
 * @param {{ cables?: any[], trays?: any[], studies?: object, oneLine?: object }} projectData
 * @returns {{ cableCount: number, trayCount: number, studyCount: number, oneLineComponentCount: number }}
 */
export function summarizePackage(projectData = {}) {
  const cables  = Array.isArray(projectData.cables) ? projectData.cables : [];
  const trays   = Array.isArray(projectData.trays)  ? projectData.trays  : [];
  const studies = projectData.studies || {};
  const oneLine = projectData.oneLine || {};
  const components = Array.isArray(oneLine.components) ? oneLine.components : [];

  return {
    cableCount:           cables.length,
    trayCount:            trays.length,
    studyCount:           countStudies(studies),
    oneLineComponentCount: components.length,
  };
}

/**
 * @typedef {{
 *   id: string,
 *   createdAt: string,
 *   revisionLabel: string,
 *   author: string,
 *   status: string,
 *   notes: string,
 *   projectSnapshot: {
 *     cables: any[],
 *     trays: any[],
 *     studies: object,
 *     approvals: object,
 *     oneLineComponentCount: number,
 *   },
 *   summary: {
 *     cableCount: number,
 *     trayCount: number,
 *     studyCount: number,
 *     oneLineComponentCount: number,
 *   },
 * }} LifecyclePackage
 */

/**
 * Build an immutable lifecycle package snapshot from current project data.
 *
 * @param {{
 *   revisionLabel?: string,
 *   author?: string,
 *   status?: string,
 *   notes?: string,
 * }} config
 * @param {{
 *   cables?: any[],
 *   trays?: any[],
 *   studies?: object,
 *   approvals?: object,
 *   oneLine?: object,
 * }} projectData
 * @returns {LifecyclePackage}
 */
export function buildLifecyclePackage(config = {}, projectData = {}) {
  const status = STATUS_OPTIONS.includes(config.status) ? config.status : 'Draft';

  const cables    = deepClone(Array.isArray(projectData.cables) ? projectData.cables : []);
  const trays     = deepClone(Array.isArray(projectData.trays)  ? projectData.trays  : []);
  const studies   = deepClone(projectData.studies   || {});
  const approvals = deepClone(projectData.approvals || {});
  const oneLine   = projectData.oneLine || {};
  const components = Array.isArray(oneLine.components) ? oneLine.components : [];

  const summary = {
    cableCount:            cables.length,
    trayCount:             trays.length,
    studyCount:            countStudies(studies),
    oneLineComponentCount: components.length,
  };

  return {
    id:            uid(),
    createdAt:     nowIso(),
    revisionLabel: String(config.revisionLabel || 'Rev 0'),
    author:        String(config.author        || ''),
    status,
    notes:         String(config.notes         || ''),
    projectSnapshot: { cables, trays, studies, approvals, oneLineComponentCount: components.length },
    summary,
  };
}

/**
 * @typedef {{
 *   cableChanges:   { added: any[], removed: any[], changed: any[] },
 *   trayChanges:    { added: any[], removed: any[], changed: any[] },
 *   studyChanges:   { added: string[], removed: string[] },
 *   approvalChanges: { key: string, from: string, to: string }[],
 * }} PackageDiff
 */

/**
 * Compute the differences between two lifecycle packages.
 *
 * @param {LifecyclePackage} pkgA - older / baseline
 * @param {LifecyclePackage} pkgB - newer / comparison
 * @returns {PackageDiff}
 */
export function diffLifecyclePackages(pkgA, pkgB) {
  // ── Cable diff (keyed by id) ──────────────────────────────────────────────
  const cableChanges = _diffByKey(
    (pkgA.projectSnapshot || {}).cables || [],
    (pkgB.projectSnapshot || {}).cables || [],
  );

  // ── Tray diff (keyed by id) ───────────────────────────────────────────────
  const trayChanges = _diffByKey(
    (pkgA.projectSnapshot || {}).trays || [],
    (pkgB.projectSnapshot || {}).trays || [],
  );

  // ── Study diff ────────────────────────────────────────────────────────────
  const studiesA = (pkgA.projectSnapshot || {}).studies || {};
  const studiesB = (pkgB.projectSnapshot || {}).studies || {};
  const keysA = new Set(Object.keys(studiesA).filter(k => studiesA[k] != null));
  const keysB = new Set(Object.keys(studiesB).filter(k => studiesB[k] != null));

  const studyChanges = {
    added:   [...keysB].filter(k => !keysA.has(k)),
    removed: [...keysA].filter(k => !keysB.has(k)),
  };

  // ── Approval diff ─────────────────────────────────────────────────────────
  const approvalsA = (pkgA.projectSnapshot || {}).approvals || {};
  const approvalsB = (pkgB.projectSnapshot || {}).approvals || {};
  const allApprovalKeys = new Set([...Object.keys(approvalsA), ...Object.keys(approvalsB)]);
  const approvalChanges = [];
  for (const key of allApprovalKeys) {
    const statusA = (approvalsA[key] || {}).status || '';
    const statusB = (approvalsB[key] || {}).status || '';
    if (statusA !== statusB) {
      approvalChanges.push({ key, from: statusA, to: statusB });
    }
  }

  return { cableChanges, trayChanges, studyChanges, approvalChanges };
}

// ---------------------------------------------------------------------------
// Private diff helper
// ---------------------------------------------------------------------------

/**
 * Compare two arrays of objects by their `id` field.
 * Returns { added, removed, changed } where `changed` are items whose
 * serialised representation differs between A and B.
 */
function _diffByKey(arrayA, arrayB) {
  const mapA = new Map((arrayA || []).map(item => [item.id, item]));
  const mapB = new Map((arrayB || []).map(item => [item.id, item]));

  const added   = [];
  const removed = [];
  const changed = [];

  for (const [id, itemB] of mapB) {
    if (!mapA.has(id)) {
      added.push(itemB);
    } else {
      const itemA = mapA.get(id);
      if (JSON.stringify(itemA) !== JSON.stringify(itemB)) {
        changed.push({ id, from: itemA, to: itemB });
      }
    }
  }

  for (const [id, itemA] of mapA) {
    if (!mapB.has(id)) removed.push(itemA);
  }

  return { added, removed, changed };
}
