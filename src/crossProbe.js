import { getOneLine } from '../dataStore.mjs';

const RECORD_CANDIDATE_KEYS = [
  'componentId',
  'componentRef',
  'nodeId',
  'sourceId',
  'targetId',
  'id',
  'ref',
  'tag',
  'label',
  'name',
  'description',
  'equipmentRef',
  'equipmentId',
  'loadRef',
  'loadId',
  'panelRef',
  'panelId',
  'cableRef',
  'cableId',
  'cable_tag',
  'from_tag',
  'to_tag',
  'source',
  'location',
  'bus',
  'device'
];

export function normalizeProbeValue(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pushCandidate(candidates, value) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach(item => pushCandidate(candidates, item));
    return;
  }
  const raw = String(value).trim();
  if (!raw) return;
  candidates.push(raw);
  const tokens = raw.match(/[A-Za-z0-9][A-Za-z0-9_.:/#-]*/g) || [];
  tokens.forEach(token => {
    if (token && token !== raw) candidates.push(token);
  });
}

function collectRecordCandidates(record = {}) {
  const candidates = [];
  RECORD_CANDIDATE_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      pushCandidate(candidates, record[key]);
    }
  });
  if (record.scheduleLinks && typeof record.scheduleLinks === 'object') {
    Object.values(record.scheduleLinks).forEach(value => pushCandidate(candidates, value));
  }
  return candidates;
}

function collectComponentValues(component = {}) {
  const props = component.props && typeof component.props === 'object' ? component.props : {};
  const scheduleLinks = component.scheduleLinks && typeof component.scheduleLinks === 'object'
    ? component.scheduleLinks
    : {};
  return [
    component.id,
    component.ref,
    component.tag,
    component.label,
    component.name,
    component.description,
    component.equipmentRef,
    component.loadRef,
    component.panelRef,
    component.cableRef,
    component.tccId,
    props.id,
    props.ref,
    props.tag,
    props.label,
    props.name,
    props.description,
    props.equipmentRef,
    props.loadRef,
    props.panelRef,
    props.cableRef,
    scheduleLinks.equipment,
    scheduleLinks.load,
    scheduleLinks.panel,
    scheduleLinks.cable
  ];
}

function collectConnectionValues(connection = {}) {
  const cable = connection.cable && typeof connection.cable === 'object' ? connection.cable : {};
  return [
    connection.id,
    connection.ref,
    connection.tag,
    connection.cableRef,
    connection.cable_tag,
    cable.id,
    cable.ref,
    cable.tag,
    cable.cable_tag,
    cable.from_tag,
    cable.to_tag
  ];
}

function collectProbeCandidates(query) {
  const candidates = [];
  if (typeof query === 'string') {
    pushCandidate(candidates, query);
  } else if (query && typeof query === 'object') {
    pushCandidate(candidates, query.componentId);
    pushCandidate(candidates, query.probe);
    pushCandidate(candidates, query.value);
    pushCandidate(candidates, query.label);
    if (query.record && typeof query.record === 'object') {
      collectRecordCandidates(query.record).forEach(value => pushCandidate(candidates, value));
    } else {
      collectRecordCandidates(query).forEach(value => pushCandidate(candidates, value));
    }
  }
  const seen = new Set();
  return candidates.filter(value => {
    const normalized = normalizeProbeValue(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function flattenOneLine(oneLine = getOneLine()) {
  const sheets = Array.isArray(oneLine?.sheets) ? oneLine.sheets : [];
  return sheets.flatMap((sheet, sheetIndex) => {
    const components = Array.isArray(sheet?.components) ? sheet.components : [];
    return components.map(component => ({ sheet, sheetIndex, component }));
  });
}

function matchValue(values, candidates) {
  const normalizedCandidates = new Set(candidates.map(normalizeProbeValue).filter(Boolean));
  return values.find(value => normalizedCandidates.has(normalizeProbeValue(value))) || '';
}

export function resolveOneLineProbe(query, oneLine = getOneLine()) {
  const candidates = collectProbeCandidates(query);
  if (!candidates.length) return null;

  const entries = flattenOneLine(oneLine);
  for (const entry of entries) {
    const matched = matchValue(collectComponentValues(entry.component), candidates);
    if (matched) {
      return {
        componentId: entry.component.id,
        sheetIndex: entry.sheetIndex,
        component: entry.component,
        matchKind: 'component',
        matchValue: matched
      };
    }
  }

  for (const entry of entries) {
    const connections = Array.isArray(entry.component.connections) ? entry.component.connections : [];
    for (let index = 0; index < connections.length; index += 1) {
      const connection = connections[index];
      const matched = matchValue(collectConnectionValues(connection), candidates);
      if (matched) {
        return {
          componentId: entry.component.id,
          sheetIndex: entry.sheetIndex,
          component: entry.component,
          connectionIndex: index,
          targetId: connection.target || '',
          matchKind: 'connection',
          matchValue: matched
        };
      }
    }
  }

  return null;
}

export function probeLabelFromRecord(record = {}) {
  const candidates = collectRecordCandidates(record);
  return candidates[0] || '';
}

export function buildOneLineProbeUrl(query, options = {}) {
  const baseUrl = options.baseUrl || (typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
  const page = options.page || 'oneline.html';
  const url = new URL(page, baseUrl);
  const target = options.target || resolveOneLineProbe(query, options.oneLine || getOneLine());
  const probeType = options.probeType || query?.probeType || '';
  const probe = options.probe || query?.probe || probeLabelFromRecord(query?.record || query || {});

  if (target?.componentId) {
    url.searchParams.set('component', target.componentId);
    if (Number.isInteger(target.sheetIndex)) url.searchParams.set('sheet', String(target.sheetIndex));
    if (Number.isInteger(target.connectionIndex)) {
      url.searchParams.set('connectionSource', target.componentId);
      url.searchParams.set('connectionIndex', String(target.connectionIndex));
    }
  } else if (probe) {
    url.searchParams.set('probe', probe);
  }
  if (probeType) url.searchParams.set('probeType', probeType);
  if (options.componentModal) url.searchParams.set('componentModal', '1');
  if (options.e2e) url.searchParams.set('e2e', '1');
  return url.toString();
}

export function openOneLineProbe(query, options = {}) {
  const url = buildOneLineProbeUrl(query, options);
  if (options.newTab) {
    window.open(url, '_blank', 'noopener');
    return url;
  }
  window.location.href = url;
  return url;
}

export function createCrossProbeLink(query, options = {}) {
  const link = document.createElement('a');
  link.className = options.className || 'cross-probe-link';
  link.href = buildOneLineProbeUrl(query, options);
  link.textContent = options.label || 'Show on One-Line';
  link.title = options.title || 'Show this item on the one-line';
  link.setAttribute('aria-label', options.ariaLabel || link.title);
  if (options.newTab) {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  if (typeof options.getQuery === 'function') {
    link.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openOneLineProbe(options.getQuery(), options);
    });
  }
  return link;
}
