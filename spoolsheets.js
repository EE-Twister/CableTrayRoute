import { generateSpoolSheets, buildCableProcurementSchedule } from './analysis/spoolSheets.mjs';
import { getTrays, getCables } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const sectionLenInput = document.getElementById('sectionLength');
  const gridCellInput   = document.getElementById('gridCell');
  const elevBandInput   = document.getElementById('elevBand');
  const maxSegsInput    = document.getElementById('maxSegs');
  const generateBtn     = document.getElementById('generateBtn');
  const exportXlsxBtn  = document.getElementById('exportXlsxBtn');
  const printBtn        = document.getElementById('printBtn');
  const resultsDiv      = document.getElementById('results');

  let lastResult = null;
  let lastProcurementResult = null;

  // Tab switching
  const tabSpools       = document.getElementById('tab-spools');
  const tabProcurement  = document.getElementById('tab-procurement');
  const panelSpools     = document.getElementById('panel-spools');
  const panelProcurement = document.getElementById('panel-procurement');

  function activateTab(activeTab) {
    const isSpools = activeTab === tabSpools;
    tabSpools.classList.toggle('active', isSpools);
    tabSpools.setAttribute('aria-selected', String(isSpools));
    tabProcurement.classList.toggle('active', !isSpools);
    tabProcurement.setAttribute('aria-selected', String(!isSpools));
    panelSpools.hidden = !isSpools;
    panelProcurement.hidden = isSpools;
  }

  tabSpools.addEventListener('click', () => activateTab(tabSpools));
  tabProcurement.addEventListener('click', () => activateTab(tabProcurement));

  generateBtn.addEventListener('click', () => {
    const trays  = getTrays();
    const cables = getCables();

    if (!trays || trays.length === 0) {
      showAlertModal('No Data', 'No trays found in the Raceway Schedule. Add trays with 3D coordinates first.');
      return;
    }

    const sectionLengthFt  = parseFloat(sectionLenInput.value) || 12;
    const gridCellFt       = parseFloat(gridCellInput.value)   || 20;
    const elevBandFt       = parseFloat(elevBandInput.value)    || 2;
    const maxSpoolSegments = parseInt(maxSegsInput.value, 10)   || 10;

    if (sectionLengthFt <= 0) {
      showAlertModal('Invalid Input', 'Section length must be a positive number.');
      return;
    }

    let result;
    try {
      result = generateSpoolSheets(trays, cables, {
        sectionLengthFt,
        gridCellFt,
        elevBandFt,
        maxSpoolSegments,
      });
    } catch (err) {
      showAlertModal('Generation Error', err.message);
      return;
    }

    lastResult = result;
    renderResults(result);
    exportXlsxBtn.disabled = false;
    printBtn.disabled = false;
  });

  exportXlsxBtn.addEventListener('click', () => {
    if (!lastResult) return;
    if (typeof XLSX === 'undefined') {
      showAlertModal('Library Error', 'XLSX library not loaded. Check your network connection.');
      return;
    }
    exportToXlsx(lastResult);
  });

  printBtn.addEventListener('click', () => {
    window.print();
  });

  function renderResults({ spools, summary }) {
    if (spools.length === 0) {
      resultsDiv.innerHTML = '<p>No spool assemblies generated. Verify that trays have valid coordinates in the Raceway Schedule.</p>';
      return;
    }

    let html = `
      <section>
        <h2>Summary</h2>
        <table class="result-table" aria-label="Spool sheet summary">
          <tbody>
            <tr><th scope="row">Spool Assemblies</th><td>${summary.spoolCount}</td></tr>
            <tr><th scope="row">Total Tray Segments</th><td>${summary.totalTrays}</td></tr>
            <tr><th scope="row">Total Run Length</th><td>${summary.totalLengthFt.toFixed(1)} ft</td></tr>
            <tr><th scope="row">Total Straight Sections</th><td>${summary.totalSections}</td></tr>
            <tr><th scope="row">Total Support Brackets</th><td>${summary.totalBrackets}</td></tr>
            <tr><th scope="row">Total Est. Tray Weight</th><td>${summary.totalEstimatedWeight} lbs</td></tr>
            <tr><th scope="row">Cable Assignments</th><td>${summary.totalCableEntries}</td></tr>
          </tbody>
        </table>
      </section>`;

    for (const spool of spools) {
      const cableRows = spool.cables.length > 0
        ? spool.cables.map(c =>
            `<tr>
              <td>${esc(c.cable_tag)}</td>
              <td>${esc(c.from)}</td>
              <td>${esc(c.to)}</td>
              <td>${c.lengthFt} ft</td>
            </tr>`).join('')
        : `<tr><td colspan="4" class="field-hint">No cable assignments for this spool.</td></tr>`;

      html += `
        <section class="spool-card">
          <h2>Spool ${esc(spool.spoolId)}</h2>
          <table class="result-table" aria-label="Spool ${esc(spool.spoolId)} materials">
            <tbody>
              <tr><th scope="row">Tray Segments</th><td>${spool.trayCount} (${esc(spool.trayIds.join(', '))})</td></tr>
              <tr><th scope="row">Tray Width</th><td>${spool.width_in} in</td></tr>
              <tr><th scope="row">Total Run Length</th><td>${spool.totalLengthFt.toFixed(1)} ft</td></tr>
              <tr><th scope="row">Straight Sections</th><td>${spool.straightSections}</td></tr>
              <tr><th scope="row">Support Brackets</th><td>${spool.bracketCount}</td></tr>
              <tr><th scope="row">Est. Tray Weight</th><td>${spool.estimatedWeight} lbs</td></tr>
            </tbody>
          </table>

          <h3>Cable Assignments (${spool.cables.length})</h3>
          <table class="result-table" aria-label="Cables in spool ${esc(spool.spoolId)}">
            <thead>
              <tr>
                <th scope="col">Cable Tag</th>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Length</th>
              </tr>
            </thead>
            <tbody>${cableRows}</tbody>
          </table>
        </section>`;
    }

    resultsDiv.innerHTML = html;
  }

  function exportToXlsx({ spools, summary }) {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Spool ID', 'Tray Count', 'Tray IDs', 'Width (in)', 'Length (ft)', 'Straight Sections', 'Brackets', 'Est. Weight (lbs)', 'Cable Assignments'],
      ...spools.map(s => [
        s.spoolId,
        s.trayCount,
        s.trayIds.join(', '),
        s.width_in,
        s.totalLengthFt,
        s.straightSections,
        s.bracketCount,
        s.estimatedWeight,
        s.cables.length,
      ]),
      [],
      ['TOTALS', summary.totalTrays, '', '', summary.totalLengthFt, summary.totalSections, summary.totalBrackets, summary.totalEstimatedWeight, summary.totalCableEntries],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Spool Summary');

    // Per-spool cable sheets
    for (const spool of spools) {
      if (spool.cables.length === 0) continue;
      const sheetName = spool.spoolId.replace(/[\\/?*[\]]/g, '-').slice(0, 31);
      const cableData = [
        ['Spool', 'Cable Tag', 'From', 'To', 'Length (ft)'],
        ...spool.cables.map(c => [spool.spoolId, c.cable_tag, c.from, c.to, c.lengthFt]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cableData), sheetName);
    }

    const stamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `spool-sheets-${stamp}.xlsx`);
  }

  // Procurement schedule
  const generateProcurementBtn = document.getElementById('generateProcurementBtn');
  const exportProcurementBtn   = document.getElementById('exportProcurementBtn');
  const procurementResultsDiv  = document.getElementById('procurementResults');

  generateProcurementBtn.addEventListener('click', () => {
    const cables = getCables();
    const routeResults = cables
      .filter(c => c.total_length != null && parseFloat(c.total_length) > 0)
      .map(c => ({ cable: c.name || c.cable_tag || c.tag, total_length: parseFloat(c.total_length) }));

    if (routeResults.length === 0) {
      procurementResultsDiv.innerHTML = '<p class="field-hint">No routed cable lengths found. Run the <a href="optimalRoute.html">Optimal Route</a> tool first to populate cable lengths.</p>';
      return;
    }

    let reels;
    try {
      reels = buildCableProcurementSchedule(routeResults, cables);
    } catch (err) {
      showAlertModal('Procurement Error', err.message);
      return;
    }

    lastProcurementResult = reels;
    renderProcurementResults(reels);
    exportProcurementBtn.disabled = false;
  });

  exportProcurementBtn.addEventListener('click', () => {
    if (!lastProcurementResult) return;
    if (typeof XLSX === 'undefined') {
      showAlertModal('Library Error', 'XLSX library not loaded. Check your network connection.');
      return;
    }
    exportProcurementXlsx(lastProcurementResult);
  });

  function renderProcurementResults(reels) {
    if (reels.length === 0) {
      procurementResultsDiv.innerHTML = '<p>No procurement data generated. Ensure cables have conductor specifications in the Cable Schedule.</p>';
      return;
    }

    const totalReels   = reels.length;
    const totalEntries = reels.reduce((s, r) => s + r.cableAssignments.length, 0);
    const totalOffcut  = reels.reduce((s, r) => s + r.offcutFt, 0);
    const avgUtil      = reels.reduce((s, r) => s + r.reelUtilizationPct, 0) / totalReels;

    let html = `
      <section>
        <h3>Summary</h3>
        <table class="result-table" aria-label="Procurement summary">
          <tbody>
            <tr><th scope="row">Total Reels</th><td>${totalReels}</td></tr>
            <tr><th scope="row">Total Cable Entries</th><td>${totalEntries}</td></tr>
            <tr><th scope="row">Total Offcut</th><td>${totalOffcut.toFixed(1)} ft</td></tr>
            <tr><th scope="row">Average Reel Utilization</th><td>${avgUtil.toFixed(1)}%</td></tr>
          </tbody>
        </table>
      </section>`;

    // Group reels by conductorSpec for display
    const bySpec = new Map();
    for (const reel of reels) {
      if (!bySpec.has(reel.conductorSpec)) bySpec.set(reel.conductorSpec, []);
      bySpec.get(reel.conductorSpec).push(reel);
    }

    for (const [spec, specReels] of bySpec) {
      html += `<section class="spool-card"><h3>${esc(spec)}</h3>`;
      for (const reel of specReels) {
        const rows = reel.cableAssignments.map(a => `
          <tr>
            <td>${esc(a.cableTag)}</td>
            <td>${a.routedLengthFt} ft</td>
            <td>${a.addedAllowanceFt} ft</td>
            <td>${a.totalCutFt} ft</td>
          </tr>`).join('');

        html += `
          <h4>${esc(reel.reelSpec)}</h4>
          <table class="result-table" aria-label="${esc(reel.reelSpec)} assignments">
            <thead>
              <tr>
                <th scope="col">Cable Tag</th>
                <th scope="col">Routed Length</th>
                <th scope="col">Allowance (10%)</th>
                <th scope="col">Cut Length</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <th scope="row" colspan="3">Reel Size</th>
                <td>${reel.standardLengthFt} ft</td>
              </tr>
              <tr>
                <th scope="row" colspan="3">Offcut</th>
                <td>${reel.offcutFt} ft</td>
              </tr>
              <tr>
                <th scope="row" colspan="3">Utilization</th>
                <td>${reel.reelUtilizationPct}%</td>
              </tr>
            </tfoot>
          </table>`;
      }
      html += '</section>';
    }

    procurementResultsDiv.innerHTML = html;
  }

  function exportProcurementXlsx(reels) {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Reel', 'Conductor Spec', 'Reel Size (ft)', '# Cables', 'Total Used (ft)', 'Offcut (ft)', 'Utilization (%)'],
      ...reels.map(r => [
        r.reelSpec,
        r.conductorSpec,
        r.standardLengthFt,
        r.cableAssignments.length,
        +(r.standardLengthFt - r.offcutFt).toFixed(1),
        r.offcutFt,
        r.reelUtilizationPct,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Procurement Summary');

    // Per-spec detail sheets
    const bySpec = new Map();
    for (const reel of reels) {
      if (!bySpec.has(reel.conductorSpec)) bySpec.set(reel.conductorSpec, []);
      bySpec.get(reel.conductorSpec).push(reel);
    }

    for (const [spec, specReels] of bySpec) {
      const sheetName = spec.replace(/[\\/?*[\]]/g, '-').slice(0, 31);
      const rows = [
        ['Reel', 'Cable Tag', 'Routed Length (ft)', 'Allowance (ft)', 'Cut Length (ft)', 'Reel Size (ft)', 'Offcut (ft)', 'Utilization (%)'],
      ];
      for (const reel of specReels) {
        for (const a of reel.cableAssignments) {
          rows.push([reel.reelSpec, a.cableTag, a.routedLengthFt, a.addedAllowanceFt, a.totalCutFt, reel.standardLengthFt, reel.offcutFt, reel.reelUtilizationPct]);
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
    }

    const stamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `cable-procurement-${stamp}.xlsx`);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
