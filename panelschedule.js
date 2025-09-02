import * as dataStore from './dataStore.mjs';
import { exportPanelSchedule } from './exportPanelSchedule.js';

/**
 * Assign a load to a breaker within a panel.
 * Updates the stored load with panel and breaker information.
 * @param {string} panelId
 * @param {number} loadIndex
 * @param {number} breaker
 */
export function assignLoadToBreaker(panelId, loadIndex, breaker) {
  const loads = dataStore.getLoads();
  if (!Array.isArray(loads) || loadIndex == null || loadIndex < 0 || loadIndex >= loads.length) {
    return;
  }
  // clear any existing assignment on this breaker for the panel
  loads.forEach(l => {
    if (l.panelId === panelId && l.breaker === breaker) {
      delete l.panelId;
      delete l.breaker;
    }
  });
  const load = loads[loadIndex];
  load.panelId = panelId;
  load.breaker = breaker;
  dataStore.setLoads(loads);
}

/**
 * Calculate connected and demand load totals for a panel.
 * @param {string} panelId
 * @returns {{connected:number,demand:number}}
 */
export function calculatePanelTotals(panelId) {
  const loads = dataStore.getLoads().filter(l => l.panelId === panelId);
  return loads.reduce((acc, l) => {
    const connected = parseFloat(l.power) || 0;
    const demand = parseFloat(l.demand) || connected;
    acc.connected += connected;
    acc.demand += demand;
    return acc;
  }, {connected: 0, demand: 0});
}

function render(panelId = 'P1') {
  const container = document.getElementById('panel-container');
  container.innerHTML = '';
  const table = document.createElement('table');
  table.id = 'panel-table';
  const tbody = document.createElement('tbody');
  const loads = dataStore.getLoads();
  for (let i = 1; i <= 42; i += 2) {
    const tr = document.createElement('tr');
    tr.appendChild(createBreakerCell(panelId, loads, i));
    tr.appendChild(createBreakerCell(panelId, loads, i + 1));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
  updateTotals(panelId);
}

function createBreakerCell(panelId, loads, breaker) {
  const td = document.createElement('td');
  const label = document.createElement('span');
  label.textContent = breaker;
  label.className = 'breaker-label';
  const select = document.createElement('select');
  select.dataset.breaker = breaker;
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '';
  select.appendChild(blank);
  loads.forEach((load, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = load.description || `Load ${idx + 1}`;
    if (load.panelId === panelId && Number(load.breaker) === breaker) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  td.appendChild(label);
  td.appendChild(select);
  return td;
}

function updateTotals(panelId) {
  const totals = calculatePanelTotals(panelId);
  const div = document.getElementById('panel-totals');
  div.textContent = `Connected: ${totals.connected.toFixed(2)} kVA, Demand: ${totals.demand.toFixed(2)} kVA`;
}

window.addEventListener('DOMContentLoaded', () => {
  const panelId = 'P1';
  render(panelId);
  document.getElementById('export-panel-btn').addEventListener('click', () => exportPanelSchedule(panelId));
  document.getElementById('panel-container').addEventListener('change', e => {
    if (e.target.matches('select[data-breaker]')) {
      const breaker = parseInt(e.target.dataset.breaker, 10);
      const loadIdx = e.target.value ? Number(e.target.value) : null;
      if (loadIdx !== null) {
        assignLoadToBreaker(panelId, loadIdx, breaker);
      } else {
        // remove assignment if blank selected
        const loads = dataStore.getLoads();
        loads.forEach(l => {
          if (l.panelId === panelId && Number(l.breaker) === breaker) {
            delete l.panelId;
            delete l.breaker;
          }
        });
        dataStore.setLoads(loads);
      }
      render(panelId);
    }
  });
});

// expose for debugging
if (typeof window !== 'undefined') {
  window.assignLoadToBreaker = assignLoadToBreaker;
  window.calculatePanelTotals = calculatePanelTotals;
}
