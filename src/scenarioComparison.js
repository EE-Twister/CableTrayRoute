/**
 * scenarioComparison.js — Dedicated scenario comparison page logic (Gap #17).
 *
 * Renders a side-by-side comparison of two user-selected scenarios covering:
 *   1. Cable schedule diff (Added / Removed / Changed)
 *   2. Tray fill status with fill gauges
 *   3. Electrical study results presence
 */

import { buildCableComparison } from './scenarios.js';
import { createFillGauge } from './components/fillGauge.js';
import {
  listScenarios,
  compareStudies,
  getTraysForScenario,
} from '../dataStore.mjs';
import { mountPersistentNavigation } from './components/navigation.js';
import { trayFillPercent } from '../analysis/designRuleChecker.mjs';
import '../site.js';

// Studies tracked for comparison (mirrors workflowDashboard.js STUDY_DEFINITIONS)
const STUDY_DEFINITIONS = [
  { key: 'arcFlash',     label: 'Arc Flash',        href: 'arcFlash.html' },
  { key: 'shortCircuit', label: 'Short Circuit',     href: 'shortCircuit.html' },
  { key: 'loadFlow',     label: 'Load Flow',         href: 'loadFlow.html' },
  { key: 'harmonics',      label: 'Harmonics',         href: 'harmonics.html' },
  { key: 'voltageFlicker', label: 'Voltage Flicker',  href: 'voltageflicker.html' },
  { key: 'bessHazard',    label: 'BESS Hazard (HMA)', href: 'bessHazard.html' },
  { key: 'motorStart',     label: 'Motor Starting',   href: 'motorStart.html' },
  { key: 'reliability',  label: 'Reliability / N-1', href: 'reliability.html' },
  { key: 'contingency',  label: 'N-1 Contingency',   href: 'contingency.html' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasStudyResults(studyValue) {
  if (!studyValue) return false;
  if (Array.isArray(studyValue)) return studyValue.length > 0;
  if (typeof studyValue === 'object') return Object.keys(studyValue).length > 0;
  return Boolean(studyValue);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Populate both scenario <select> dropdowns
// ---------------------------------------------------------------------------

function populateSelects() {
  const selectA = document.getElementById('sc-select-a');
  const selectB = document.getElementById('sc-select-b');
  if (!selectA || !selectB) return;

  const scenarios = listScenarios();
  [selectA, selectB].forEach(sel => {
    sel.innerHTML = '';
    scenarios.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  });

  // Default: A = first, B = second (if available)
  if (scenarios.length >= 2) {
    selectA.value = scenarios[0];
    selectB.value = scenarios[1];
  }
}

// ---------------------------------------------------------------------------
// Summary badge row
// ---------------------------------------------------------------------------

function renderSummaryBadges(added, removed, changed) {
  const container = document.getElementById('sc-summary-badges');
  if (!container) return;
  container.innerHTML = '';

  const badges = [
    { count: added,   label: 'added',     cls: 'sc-badge--added' },
    { count: removed, label: 'removed',   cls: 'sc-badge--removed' },
    { count: changed, label: 'changed',   cls: 'sc-badge--changed' },
  ];

  if (added === 0 && removed === 0 && changed === 0) {
    const span = document.createElement('span');
    span.className = 'sc-badge sc-badge--unchanged';
    span.textContent = 'No cable differences';
    container.appendChild(span);
    return;
  }

  badges.forEach(({ count, label, cls }) => {
    const span = document.createElement('span');
    span.className = `sc-badge ${cls}`;
    span.textContent = `${count} ${label}`;
    container.appendChild(span);
  });
}

// ---------------------------------------------------------------------------
// Cable schedule diff table
// ---------------------------------------------------------------------------

function renderCableDiff(a, b) {
  const container = document.getElementById('sc-cable-diff-content');
  if (!container) return;

  const { added, removed, changed, rows } = buildCableComparison(a, b);
  renderSummaryBadges(added, removed, changed);

  if (rows.length === 0) {
    container.innerHTML = `<p class="sc-empty-note">No cable schedule differences between <strong>${esc(a)}</strong> and <strong>${esc(b)}</strong>.</p>`;
    return;
  }

  container.innerHTML =
    `<div class="sc-diff-scroll">` +
      `<table class="sc-diff-table" aria-label="Cable schedule comparison: ${esc(a)} vs ${esc(b)}">` +
        `<thead><tr>` +
          `<th scope="col">Status</th>` +
          `<th scope="col">Tag</th>` +
          `<th scope="col">From → To</th>` +
          `<th scope="col">Cable Type</th>` +
          `<th scope="col">Conductor Size</th>` +
        `</tr></thead>` +
        `<tbody>${rows.join('')}</tbody>` +
      `</table>` +
    `</div>`;
}

// ---------------------------------------------------------------------------
// Tray fill comparison (side-by-side fill gauges)
// ---------------------------------------------------------------------------

let _gaugeSerial = 0;

function renderTrayColumn(scenarioName, columnEl) {
  columnEl.innerHTML = `<p class="sc-col-heading">${esc(scenarioName)}</p>`;

  const trays = getTraysForScenario(scenarioName);
  if (!trays || trays.length === 0) {
    const note = document.createElement('p');
    note.className = 'sc-empty-note';
    note.textContent = 'No trays defined.';
    columnEl.appendChild(note);
    return;
  }

  const list = document.createElement('div');
  list.className = 'sc-gauge-list';
  columnEl.appendChild(list);

  trays.forEach(tray => {
    const pct = trayFillPercent(tray);
    const trayId = tray.tray_id ?? tray.id ?? 'Tray';
    const gaugeId = `sc-gauge-${++_gaugeSerial}`;

    const card = document.createElement('div');
    card.className = 'sc-gauge-card' + (pct !== null && pct > 80 ? ' sc-gauge-card--warn' : '');

    const gaugeWrap = document.createElement('div');
    gaugeWrap.id = gaugeId;
    card.appendChild(gaugeWrap);

    const trayLabel = document.createElement('p');
    trayLabel.className = 'sc-gauge-tray-label';
    trayLabel.textContent = String(trayId);
    card.appendChild(trayLabel);

    list.appendChild(card);

    // createFillGauge requires the element to be in the DOM
    const gauge = createFillGauge(gaugeId, { width: 140, strokeWidth: 14, label: 'Fill %' });
    if (pct !== null) gauge.update(pct);
  });
}

function renderTrayComparison(a, b) {
  const colA = document.getElementById('sc-tray-col-a');
  const colB = document.getElementById('sc-tray-col-b');
  if (!colA || !colB) return;

  renderTrayColumn(a, colA);
  renderTrayColumn(b, colB);
}

// ---------------------------------------------------------------------------
// Study results comparison (side-by-side status rows)
// ---------------------------------------------------------------------------

function studyIcon(complete) {
  const span = document.createElement('span');
  span.className = complete ? 'dash-icon dash-icon--complete' : 'dash-icon dash-icon--incomplete';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = complete ? '✓' : '✗';
  return span;
}

function renderStudyColumn(scenarioName, studies, columnEl) {
  columnEl.innerHTML = `<p class="sc-col-heading">${esc(scenarioName)}</p>`;

  const list = document.createElement('ul');
  list.className = 'sc-study-list';
  list.setAttribute('role', 'list');

  STUDY_DEFINITIONS.forEach(({ key, label, href }) => {
    const hasResults = hasStudyResults(studies[key]);

    const li = document.createElement('li');
    li.className = 'sc-study-row' + (hasResults ? ' sc-study-row--run' : '');

    const icon = studyIcon(hasResults);

    const link = document.createElement('a');
    link.href = href;
    link.className = 'sc-study-name';
    link.textContent = label;

    const status = document.createElement('span');
    status.className = 'sc-study-status';
    status.textContent = hasResults ? 'Results saved' : 'Not run';

    li.appendChild(icon);
    li.appendChild(link);
    li.appendChild(status);
    list.appendChild(li);
  });

  columnEl.appendChild(list);
}

function renderStudyComparison(a, b) {
  const colA = document.getElementById('sc-study-col-a');
  const colB = document.getElementById('sc-study-col-b');
  if (!colA || !colB) return;

  const studyData = compareStudies(a, b);
  renderStudyColumn(a, studyData[a] ?? {}, colA);
  renderStudyColumn(b, studyData[b] ?? {}, colB);
}

// ---------------------------------------------------------------------------
// Main comparison runner
// ---------------------------------------------------------------------------

function runComparison() {
  const a = document.getElementById('sc-select-a')?.value;
  const b = document.getElementById('sc-select-b')?.value;
  if (!a || !b) return;

  // Reset gauge serial so IDs don't collide on repeated comparisons
  _gaugeSerial = 0;

  renderCableDiff(a, b);
  renderTrayComparison(a, b);
  renderStudyComparison(a, b);

  const resultsEl = document.getElementById('sc-results');
  if (resultsEl) resultsEl.hidden = false;
}

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

window.addEventListener('DOMContentLoaded', () => {
  mountPersistentNavigation();
  populateSelects();

  const compareBtn = document.getElementById('sc-compare-btn');
  compareBtn?.addEventListener('click', runComparison);

  // If there are at least two scenarios already, run the default comparison
  if (listScenarios().length >= 2) runComparison();
});
