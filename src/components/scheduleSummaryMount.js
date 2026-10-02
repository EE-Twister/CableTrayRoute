import * as dataStore from '../../dataStore.mjs';
import { cableSummaryHtml, racewaySummaryHtml } from './scheduleSummary.mjs';

/**
 * Renders a KPI summary strip into #schedule-summary and keeps it fresh as
 * the user edits the table on the page.
 * @param {'cables'|'raceways'} kind
 */
export function mountScheduleSummary(kind) {
  const host = document.getElementById('schedule-summary');
  if (!host) return;
  let timer = null;
  const render = () => {
    try {
      host.innerHTML = kind === 'cables'
        ? cableSummaryHtml(dataStore.getCables())
        : racewaySummaryHtml({
          trays: dataStore.getTrays(),
          conduits: dataStore.getConduits(),
          ductbanks: dataStore.getDuctbanks(),
        });
    } catch (error) {
      console.error('Schedule summary unavailable', error);
      host.innerHTML = '';
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(render, 400);
  };
  render();
  document.addEventListener('change', schedule);
  document.addEventListener('click', schedule);
  window.addEventListener('storage', schedule);
}
