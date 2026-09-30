/**
 * Direct Burial Circuit Sizing — page orchestration.
 *
 * Reads the form, runs analysis/directBurial.mjs, and renders the KPI strip,
 * recommendation notes, and the size × spacing results table.
 */
import '../site.js';

import {
  runDirectBurial,
  CONDUCTOR_SIZES,
  DEFAULT_SPACINGS_MM,
} from '../analysis/directBurial.mjs';

const MM_PER_IN = 25.4;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof globalThis.initSettings === 'function') globalThis.initSettings();
  if (typeof globalThis.initDarkMode === 'function') globalThis.initDarkMode();
  if (typeof globalThis.initCompactMode === 'function') globalThis.initCompactMode();
  if (typeof globalThis.initNavToggle === 'function') globalThis.initNavToggle();

  renderCandidateControls();

  const form = document.getElementById('db-form');
  let lastResult = null;

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      lastResult = runDirectBurial(readForm());
      renderAll(lastResult);
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('db-export-btn').addEventListener('click', () => {
    if (lastResult) downloadCsv(lastResult);
  });

  document.getElementById('db-reset-btn').addEventListener('click', () => {
    form.reset();
    renderCandidateControls();
  });
});

function renderCandidateControls() {
  const sizes = document.getElementById('db-sizes');
  const spacings = document.getElementById('db-spacings');
  sizes.querySelectorAll('label').forEach(el => el.remove());
  spacings.querySelectorAll('label').forEach(el => el.remove());

  sizes.insertAdjacentHTML('beforeend', CONDUCTOR_SIZES.map(size => (
    `<label><input type="checkbox" name="db-size" value="${escapeHtml(size.label)}" checked> ${escapeHtml(size.label)}</label>`
  )).join(''));
  spacings.insertAdjacentHTML('beforeend', DEFAULT_SPACINGS_MM.map(mm => {
    const inches = round1(mm / MM_PER_IN);
    return `<label><input type="checkbox" name="db-spacing" value="${mm}" checked> ${inches}</label>`;
  }).join(''));
}

function readForm() {
  const value = id => document.getElementById(id).value;
  const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);

  return {
    requiredCurrentA: value('db-current'),
    continuousFactor: value('db-continuous'),
    requiredCircuits: value('db-circuits'),
    cover: { coverMm: Number(value('db-cover')) * MM_PER_IN },
    cable: {
      material: value('db-material'),
      insulation: value('db-insulation'),
      arrangement: value('db-arrangement'),
    },
    soil: {
      resistivityKmW: value('db-rho'),
      tempC: value('db-soil-temp'),
    },
    frequencyHz: value('db-frequency'),
    sizes: checked('db-size'),
    spacingsMm: checked('db-spacing').map(Number),
    costs: {
      trenchCostPerCubicYard: value('db-trench-cost'),
      aluminumPriceFactor: value('db-al-factor'),
    },
  };
}

function showError(message) {
  const body = document.getElementById('db-results-body');
  body.innerHTML = `<tr><td colspan="10" class="db-empty" role="alert">${escapeHtml(message)}</td></tr>`;
  document.getElementById('db-notes').innerHTML = '';
}

function renderAll(result) {
  renderKpis(result);
  renderTable(result);
}

function renderKpis({ inputs, targetAmpacityA, best, notes }) {
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set('kpi-target', `${targetAmpacityA} A`);
  if (best) {
    set('kpi-size', best.size);
    set('kpi-spacing', `${inchesFromMm(best.clearanceMm)} in / ${best.cost.trenchWidthIn} in`);
    set('kpi-max', String(best.maxCircuits));
    const cost = inputs.requiredCircuits == null ? best.cost.costPerCircuitFt : best.cost.totalCostPerFt;
    set('kpi-cost', `$${cost.toFixed(2)}${inputs.requiredCircuits == null ? ' /circuit' : ''}`);
  } else {
    ['kpi-size', 'kpi-spacing', 'kpi-max', 'kpi-cost'].forEach(id => set(id, '—'));
  }
  document.getElementById('db-notes').innerHTML = notes.map(n => `<li>${escapeHtml(n)}</li>`).join('');
}

function renderTable({ inputs, rows, best }) {
  const summary = inputs.requiredCircuits == null
    ? 'Costs are shown at the maximum circuit count each option can carry.'
    : `Costs are shown for ${inputs.requiredCircuits} circuits; options that cannot carry them are marked "no".`;
  document.getElementById('db-summary').textContent = summary;

  const body = document.getElementById('db-results-body');
  body.innerHTML = rows.map(row => {
    const cost = row.cost;
    const maxCell = row.maxCircuits >= 1 ? String(row.maxCircuits) : '0';
    const cls = row.feasible ? 'db-ok' : 'db-fail';
    return `<tr class="${row === best ? 'db-best' : ''}">
      <td>${escapeHtml(row.size)}</td>
      <td>${inchesFromMm(row.clearanceMm)}</td>
      <td>${row.singleCircuitAmpacityA}</td>
      <td class="${cls}">${maxCell}${row.maxCircuits >= inputs.maxCircuits ? '+' : ''}</td>
      <td>${row.feasible ? row.ampacityAtEvaluatedA : 'no'}</td>
      <td>${cost ? cost.trenchWidthIn : '—'}</td>
      <td>${cost ? cost.cableCostPerFt.toFixed(2) : '—'}</td>
      <td>${cost ? cost.trenchCostPerFt.toFixed(2) : '—'}</td>
      <td>${cost ? cost.totalCostPerFt.toFixed(2) : '—'}</td>
      <td>${cost ? cost.costPerCircuitFt.toFixed(2) : '—'}</td>
    </tr>`;
  }).join('');
}

function downloadCsv({ inputs, rows }) {
  const headers = ['Size', 'Spacing in', '1-circuit A', 'Max circuits', 'Evaluated circuits', 'A at evaluated count', 'Trench width in', 'Cable $/ft', 'Trench $/ft', 'Total $/ft', '$/circuit-ft'];
  const data = rows.map(r => [
    r.size,
    inchesFromMm(r.clearanceMm),
    r.singleCircuitAmpacityA,
    r.maxCircuits,
    r.evaluatedCircuits ?? '',
    r.ampacityAtEvaluatedA ?? '',
    r.cost?.trenchWidthIn ?? '',
    r.cost?.cableCostPerFt ?? '',
    r.cost?.trenchCostPerFt ?? '',
    r.cost?.totalCostPerFt ?? '',
    r.cost?.costPerCircuitFt ?? '',
  ]);
  const lines = [
    [`Required current A`, inputs.requiredCurrentA, `Cover mm`, inputs.cover.coverMm, `Soil rho K.m/W`, inputs.soil.resistivityKmW],
    headers,
    ...data,
  ].map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([lines], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'direct-burial-circuits.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function inchesFromMm(mm) {
  return round1(mm / MM_PER_IN);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
