import * as dataStore from './dataStore.mjs';

/**
 * Export a panel schedule to an XLSX file.
 * Uses global SheetJS (XLSX) library loaded on the page.
 * @param {string} panelId
 */
export function exportPanelSchedule(panelId) {
  if (typeof XLSX === 'undefined') {
    console.error('XLSX library not loaded');
    return;
  }
  const panels = dataStore.getPanels();
  const panel = panels.find(p => p.id === panelId || p.panel_id === panelId) || {};
  const loads = dataStore.getLoads().filter(l => l.panelId === panelId);

  const data = [];
  data.push(['Panel', panelId]);
  data.push(['Voltage', panel.voltage || panel.voltage_rating || '']);
  const systemType = (panel.powerType || panel.systemType || panel.type || '').toString().toLowerCase() === 'dc' ? 'DC' : 'AC';
  data.push(['System Type', systemType]);
  data.push(['Phases', panel.phases || panel.phaseCount || '']);
  data.push(['Main Rating (A)', panel.mainRating || panel.main_rating || '']);
  const circuitCount = panel.circuitCount || panel.breakers?.length || 42;
  data.push(['Circuit Count', circuitCount]);
  data.push([]);
  data.push(['Circuit', 'Poles', 'Description', 'Demand (kVA)']);

  for (let circuit = 1; circuit <= circuitCount; circuit++) {
    const load = loads.find(l => Number(l.breaker) === circuit);
    const poles = load ? (load.poles || load.phases || '') : '';
    const desc = load ? (load.description || '') : '';
    const demandVal = load ? (parseFloat(load.demand) || parseFloat(load.demandKw) || parseFloat(load.kw) || 0) : 0;
    data.push([circuit, poles, desc, demandVal]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, panelId);
  XLSX.writeFile(wb, `${panelId}_panel_schedule.xlsx`);
}

if (typeof window !== 'undefined') {
  window.exportPanelSchedule = exportPanelSchedule;
}
