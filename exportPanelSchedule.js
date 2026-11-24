import * as dataStore from './dataStore.mjs';
import { showAlertModal } from './src/components/modal.js';
import { preliminaryMotorNotice } from './src/design-synthesis/preliminaryProjectNotice.mjs';

import { getPanelCircuitCount, getPanelSystem, parsePositiveInt } from './src/panel-schedule/phaseModel.js';
import { getBreakerBlock, getLoadBreakerSpan, getLoadPoleCount } from './src/panel-schedule/breakerLayoutModel.js';
import { getPhaseLabel, getPhaseLoadKey, getDetailPhaseLoad, getPhasePowerValue } from './src/panel-schedule/phaseLoadModel.js';
import { findPanelByIdentifier } from './src/panel-schedule/panelModel.js';
import { calculatePanelTotalsFromData } from './src/panel-schedule/totalsModel.js';

function getLoadLabel(load) {
  const tag = load?.ref || load?.id || load?.tag;
  const desc = load?.description;
  if (tag && desc) return `${tag} — ${desc}`;
  return tag || desc || '';
}

const SHEET_NAME_MAX_LENGTH = 31;
const INVALID_SHEET_NAME_CHARS = /[:\\/?*[\]]/g;

function roundTo(value, digits) {
  return Number(value.toFixed(digits));
}

function firstNonZeroNumber(values) {
  let zeroFound = false;
  for (const value of values) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) continue;
    if (parsed === 0) {
      zeroFound = true;
      continue;
    }
    return parsed;
  }
  return zeroFound ? 0 : null;
}

/**
 * Demand kVA for the "Demand (kVA)" column. Mirrors the panel totals, which
 * use demand kVA and then connected kVA; kW is never relabelled as kVA.
 * @param {object} load
 * @returns {number|null}
 */
export function getDemandKva(load) {
  if (!load) return null;
  return firstNonZeroNumber([load.demandKva, load.kva]);
}

function getRecordedKw(load) {
  if (!load) return null;
  return firstNonZeroNumber([load.demandKw, load.kw]);
}

/**
 * Turn any panel identifier into a valid, unique Excel sheet name: no
 * : \ / ? * [ ], no leading or trailing apostrophe, not "History", and at
 * most 31 characters. Duplicates (case-insensitive, as Excel compares them)
 * receive a numeric suffix.
 * @param {string} name
 * @param {string[]} [existingNames]
 * @returns {string}
 */
export function toExcelSheetName(name, existingNames = []) {
  const clean = value => value.replace(/^[\s']+|[\s']+$/g, '');
  let base = clean(String(name ?? '').replace(/\p{Cc}/gu, '').replace(INVALID_SHEET_NAME_CHARS, '-'));
  base = clean(base.slice(0, SHEET_NAME_MAX_LENGTH)) || 'Sheet';
  const taken = new Set(['history', ...existingNames.map(existing => String(existing).toLowerCase())]);
  if (!taken.has(base.toLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const marker = `-${suffix}`;
    const candidate = `${clean(base.slice(0, SHEET_NAME_MAX_LENGTH - marker.length)) || 'Sheet'}${marker}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function toDownloadFileName(name) {
  return String(name ?? '').replace(/[\p{Cc}<>:"/\\|?*]+/gu, '_').trim() || 'panel';
}

/**
 * Export a panel schedule to an XLSX file.
 * Uses global SheetJS (XLSX) library loaded on the page.
 * @param {string} panelId
 */
export function exportPanelSchedule(panelId) {
  if (typeof XLSX === 'undefined') {
    console.error('XLSX library not loaded');
    showAlertModal('Library Error', 'The Excel export library did not load. Please refresh the page and try again.');
    return;
  }
  const panels = dataStore.getPanels();
  const panel = findPanelByIdentifier(panels, panelId) || {};
  const loads = dataStore.getLoads().filter(l => l.panelId === panelId);

  const circuitCount = getPanelCircuitCount(panel);
  const panelLabel = panel.ref || panel.panel_id || panel.id || panelId;
  const systemType = getPanelSystem(panel);

  const data = [];
  const notice = preliminaryMotorNotice();
  if (notice) data.push([notice]);
  data.push(['Panel', panelLabel || panelId]);
  data.push(['Fed From', panel.fedFrom || panel.fed_from || '']);
  data.push(['Voltage', panel.voltage || panel.voltage_rating || '']);
  data.push(['System Type', systemType === 'dc' ? 'DC' : 'AC']);
  data.push(['Phases', panel.phases || panel.phaseCount || '']);
  data.push(['Main Rating (A)', panel.mainRating || panel.main_rating || '']);
  data.push(['Short-Circuit Rating (A)', panel.shortCircuitRating || panel.shortCircuitCurrentRating || '']);
  data.push(['Circuit Count', circuitCount]);
  data.push([]);
  const headers = ['Circuit', 'Phase', 'Description', 'Poles', 'Demand (kVA)', 'Rating (A)', 'Device Type', 'Cable', systemType === 'dc' ? 'Phase Load (W)' : 'Phase Load (VA)'];
  data.push([...headers, '', ...headers]);

  const assignments = new Map();
  loads.forEach(load => {
    const span = getLoadBreakerSpan(load, panel, circuitCount);
    if (!span.length) return;
    span.forEach((slot, position) => {
      assignments.set(slot, { load, position, spanLength: span.length, startCircuit: span[0] });
    });
  });
  if (Array.isArray(panel.breakers)) {
    panel.breakers.forEach((tag, index) => {
      const circuit = index + 1;
      if (!tag || assignments.has(circuit)) return;
      const load = loads.find(l => (l.ref || l.id || l.tag) === tag);
      if (!load) return;
      const span = getLoadBreakerSpan(load, panel, circuitCount);
      if (span.length) {
        span.forEach((slot, position) => {
          assignments.set(slot, { load, position, spanLength: span.length, startCircuit: span[0] });
        });
      } else {
        assignments.set(circuit, { load, position: 0, spanLength: 1, startCircuit: circuit });
      }
    });
  }

  const rows = [];
  const kwOnlyNotes = [];
  for (let circuit = 1; circuit <= circuitCount; circuit++) {
    const info = assignments.get(circuit);
    const phase = getPhaseLabel(panel, circuit) || '';
    let description = '';
    let poles = '';
    let demandVal = '';
    if (info) {
      const { load, position, spanLength, startCircuit } = info;
      if (position === 0) {
        const derivedPoles = getLoadPoleCount(load, panel);
        const effectivePoles = Math.max(spanLength, derivedPoles);
        poles = effectivePoles ? String(effectivePoles) : '';
        description = getLoadLabel(load);
        const demandKva = getDemandKva(load);
        demandVal = demandKva != null ? roundTo(demandKva, 2) : '';
        const recordedKw = demandKva == null ? getRecordedKw(load) : null;
        if (recordedKw != null) {
          kwOnlyNotes.push(`Circuit ${circuit}${description ? ` (${description})` : ''}: the load records ${recordedKw.toFixed(2)} kW but no kVA, so Demand (kVA) is blank; no power factor conversion is assumed. Panel kVA totals likewise do not convert kW.`);
        }
      } else {
        const startRef = parsePositiveInt(load.breaker) || startCircuit || (circuit - position);
        const label = getLoadLabel(load);
        description = `Tied to Circuit ${startRef}${label ? ` — ${label}` : ''}`;
      }
    }
    const block = getBreakerBlock(panel, circuit);
    const start = Number(block?.start) || info?.startCircuit || circuit;
    const detail = panel.breakerDetails?.[String(start)] || {};
    const customLabel = typeof detail.customLoad === 'string' ? detail.customLoad.trim() : '';
    if (customLabel) {
      description = circuit === start ? customLabel : `Tied to Circuit ${start} — ${customLabel}`;
    }
    if (block && circuit === start) poles = String(block.size);
    const customPower = getDetailPhaseLoad(detail, getPhaseLoadKey(phase, block));
    const loadPower = info ? getPhasePowerValue(info.load, systemType) : null;
    const phasePower = customPower ?? (loadPower == null ? '' : loadPower / info.spanLength);
    rows.push({
      rating: circuit === start ? (detail.rating ?? '') : '',
      deviceType: circuit === start && (block || info) ? (detail.deviceType || panel.branchDeviceType || 'breaker') : '',
      cable: circuit === start ? (detail.cableTag || detail.cable || detail.cableId || '') : '',
      phasePower,
      circuit,
      phase,
      description,
      poles,
      demand: demandVal
    });
  }

  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i] || { circuit: '', phase: '', description: '', poles: '', demand: '' };
    const right = rows[i + 1] || { circuit: '', phase: '', description: '', poles: '', demand: '' };
    data.push([
      left.circuit ?? '',
      left.phase ?? '',
      left.description ?? '',
      left.poles ?? '',
      left.demand ?? '',
      left.rating ?? '',
      left.deviceType ?? '',
      left.cable ?? '',
      left.phasePower ?? '',
      '',
      right.circuit ?? '',
      right.phase ?? '',
      right.description ?? '',
      right.poles ?? '',
      right.demand ?? '',
      right.rating ?? '',
      right.deviceType ?? '',
      right.cable ?? '',
      right.phasePower ?? ''
    ]);
  }

  const totals = calculatePanelTotalsFromData(panel, loads);

  data.push([]);
  data.push(['Connected Load (kVA)', roundTo(totals.connectedKva, 2), '', '', '', '', 'Demand Load (kVA)', roundTo(totals.demandKva, 2)]);
  data.push(['Connected Load (kW)', roundTo(totals.connectedKw, 2), '', '', '', '', 'Demand Load (kW)', roundTo(totals.demandKw, 2)]);
  if (kwOnlyNotes.length) {
    data.push([]);
    data.push(['Notes']);
    kwOnlyNotes.forEach(note => data.push([note]));
  }

  try {
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, toExcelSheetName(panelId));
    XLSX.writeFile(wb, `${toDownloadFileName(panelId)}_panel_schedule.xlsx`);
  } catch (error) {
    console.error('Panel schedule export failed', error);
    showAlertModal('Export Error', `The panel schedule could not be exported: ${error?.message || error}`);
  }
}

if (typeof window !== 'undefined') {
  window.exportPanelSchedule = exportPanelSchedule;
}
