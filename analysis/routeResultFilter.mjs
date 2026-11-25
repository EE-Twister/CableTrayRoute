// @ts-check
// Which saved route results still describe the current project: the cable tag
// is still scheduled, every raceway the route uses still exists, and the saved
// input fingerprint (when recorded) matches. Kept separate from
// deliverableWorkflow.mjs so the workflow status shown on every page does not
// pull in pull-card, spool-sheet, and report-package code.

import { normalizeRouteResults, routeResultTag } from './routeResults.mjs';

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object') return Object.keys(value).some(key => hasValue(value[key]));
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function meaningfulRecords(records) {
  return Array.isArray(records)
    ? records.filter(row => row && typeof row === 'object' && Object.values(row).some(hasValue))
    : [];
}

function normalizedKey(value) {
  return String(value || '').trim().toLowerCase();
}

function fieldValue(record, names) {
  for (const name of names) {
    if (hasValue(record?.[name])) return record[name];
  }
  return '';
}

function cableTag(cable) {
  return fieldValue(cable, ['tag', 'name', 'id', 'cable_id', 'cableId', 'cable_tag', 'ref']);
}

export function knownCableTags(cables = []) {
  return new Set(meaningfulRecords(cables).map(cableTag).map(normalizedKey).filter(Boolean));
}

export function collectRacewayIds(rows = [], fields = []) {
  const ids = new Set();
  meaningfulRecords(rows).forEach(row => {
    for (const field of fields) {
      const value = row?.[field];
      const key = normalizedKey(value);
      if (key) ids.add(key);
    }
  });
  return ids;
}

export function routeResultRacewayIds(result) {
  const ids = [];
  const entries = [
    ...(Array.isArray(result?.breakdown) ? result.breakdown : []),
    ...(Array.isArray(result?.route_segments) ? result.route_segments : []),
  ];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    ids.push(
      entry.tray_id,
      entry.trayId,
      entry.raceway_id,
      entry.racewayId,
      entry.conduit_id,
      entry.conduitId,
      entry.ductbankTag,
      entry.ductbank_tag,
      entry.ductbank_id,
      entry.ductbankId,
      entry.id,
    );
  }
  return ids.map(normalizedKey).filter(Boolean).filter(id => id !== 'field route');
}

/**
 * @param {any} [routeResults] saved route results: an array, or an object with results and inputFingerprint
 * @param {{ cables?: object[], trays?: object[], conduits?: object[], ductbanks?: object[], currentInputFingerprint?: string }} [project]
 * @returns {object[]}
 */
export function filterRouteResultsForProject(routeResults = [], {
  cables = [],
  trays = [],
  conduits = [],
  ductbanks = [],
  currentInputFingerprint = '',
} = {}) {
  const savedFingerprint = routeResults && typeof routeResults === 'object' && !Array.isArray(routeResults)
    ? String(routeResults.inputFingerprint || '').trim()
    : '';
  if (savedFingerprint && currentInputFingerprint && savedFingerprint !== currentInputFingerprint) return [];
  const cableTags = knownCableTags(cables);
  const nestedConduits = meaningfulRecords(ductbanks).flatMap(ductbank => meaningfulRecords(ductbank.conduits));
  const racewayIds = new Set([
    ...collectRacewayIds(trays, ['tray_id', 'trayId', 'id', 'tag']),
    ...collectRacewayIds(conduits, ['conduit_id', 'conduitId', 'id', 'tag']),
    ...collectRacewayIds(nestedConduits, ['conduit_id', 'conduitId', 'id', 'tag']),
    ...collectRacewayIds(ductbanks, ['tag', 'id', 'ductbankTag', 'ductbank_id']),
  ]);

  return normalizeRouteResults(routeResults).filter(result => {
    const tag = normalizedKey(routeResultTag(result));
    if (!tag || !cableTags.has(tag)) return false;
    const referencedRaceways = routeResultRacewayIds(result);
    return referencedRaceways.every(id => racewayIds.has(id));
  });
}
