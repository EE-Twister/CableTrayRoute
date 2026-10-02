import * as dataStore from '../../dataStore.mjs';
import { cablesForRaceway, highlightQuery, parseHighlightParam, racewaysForCable } from './crossHighlight.mjs';

const HIGHLIGHT_CLASS = 'xhl-row';

function rowKey(row, keys) {
  for (const key of keys) {
    const input = row.querySelector(`[name="${key}"]`);
    if (input && input.value) return input.value.trim();
  }
  return '';
}

function applyHighlight(table, keys, ids) {
  const wanted = new Set(ids.map(id => id.toLowerCase()));
  let first = null;
  table.querySelectorAll('tbody tr').forEach(row => {
    const hit = wanted.has(rowKey(row, keys).toLowerCase());
    row.classList.toggle(HIGHLIGHT_CLASS, hit);
    if (hit && !first) first = row;
  });
  if (first && typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return Boolean(first);
}

/**
 * Cross-highlighting between the cable and raceway schedules.
 * Selecting a row shows what it connects to and links to the other page,
 * which highlights the related rows.
 * @param {{ kind: 'cables'|'raceways', tableIds: string[], keys: string[] }} options
 */
export function mountCrossHighlight({ kind, tableIds, keys }) {
  const host = document.getElementById('cross-link-bar');
  if (!host) return;
  const tables = tableIds.map(id => document.getElementById(id)).filter(Boolean);
  if (!tables.length) return;

  const routes = () => dataStore.getItem('latestRouteResults', []);

  const show = (label, ids, href, linkText) => {
    host.textContent = '';
    if (!ids.length) {
      host.hidden = false;
      host.textContent = `${label}: no saved route data yet. Run Optimal Route to link cables and raceways.`;
      return;
    }
    const link = document.createElement('a');
    link.href = href;
    link.textContent = linkText;
    host.hidden = false;
    host.append(`${label}: ${ids.join(', ')} → `, link);
  };

  tables.forEach(table => {
    table.addEventListener('click', event => {
      const row = event.target.closest('tbody tr');
      if (!row) return;
      const key = rowKey(row, keys);
      if (!key) return;
      if (kind === 'cables') {
        const ids = racewaysForCable(routes(), key);
        show(`${key} runs through`, ids, `racewayschedule.html?${highlightQuery(ids, key)}`, 'Show in Raceway Schedule');
      } else {
        const tags = cablesForRaceway(routes(), key);
        show(`${key} carries`, tags, `cableschedule.html?${highlightQuery(tags, key)}`, 'Show in Cable Schedule');
      }
    });
  });

  // Destination side: highlight rows named in ?highlight=
  const ids = parseHighlightParam(window.location.search);
  if (ids.length) {
    const apply = () => tables.some(table => applyHighlight(table, keys, ids));
    // Rows are built asynchronously; retry briefly.
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (apply() || attempts > 20) clearInterval(timer);
    }, 250);
    host.hidden = false;
    host.textContent = `Highlighting ${ids.length} linked record(s) from the other schedule.`;
  }
}
