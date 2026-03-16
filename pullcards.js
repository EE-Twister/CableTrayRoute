import { buildPullTable } from './analysis/pullCards.mjs';
import { getTrays, getCables } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const importXlsxBtn = document.getElementById('importXlsxBtn');
  const xlsxFileInput = document.getElementById('xlsxFileInput');
  const loadFromProjectBtn = document.getElementById('loadFromProjectBtn');
  const summarySection = document.getElementById('summarySection');
  const summaryCards = document.getElementById('summaryCards');
  const pullTableSection = document.getElementById('pullTableSection');
  const pullTableBody = document.querySelector('#pullTable tbody');
  const pullCardDetail = document.getElementById('pullCardDetail');
  const pullCardTitle = document.getElementById('pullCardTitle');
  const pullCardContent = document.getElementById('pullCardContent');
  const backToTableBtn = document.getElementById('backToTableBtn');
  const exportPullTableBtn = document.getElementById('exportPullTableBtn');
  const exportPullCardsBtn = document.getElementById('exportPullCardsBtn');

  let currentPulls = null;

  // ---- Import from XLSX ----

  importXlsxBtn.addEventListener('click', () => xlsxFileInput.click());

  xlsxFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!globalThis.XLSX) {
      showAlertModal('XLSX library not loaded. Please refresh and try again.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const routeResults = parseRouteXLSX(wb);
        if (!routeResults.length) {
          showAlertModal('No route data found in the file. Make sure you are importing route_data.xlsx from the Optimal Route page.');
          return;
        }
        const cableList = getCables();
        generatePullCards(routeResults, cableList);
      } catch (err) {
        showAlertModal(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
    xlsxFileInput.value = '';
  });

  // ---- Load from project (sessionStorage cache) ----

  loadFromProjectBtn.addEventListener('click', () => {
    // Try to get cached route results from sessionStorage
    const scenarios = Object.keys(sessionStorage).filter(k => k.includes(':'));
    let cached = null;
    for (const key of Object.keys(sessionStorage)) {
      if (key.endsWith('routeCache') || key.includes('routeCache')) {
        try {
          cached = JSON.parse(sessionStorage.getItem(key));
        } catch { /* skip */ }
        if (cached && cached.batchResults) break;
        cached = null;
      }
    }

    if (cached && Array.isArray(cached.batchResults) && cached.batchResults.length > 0) {
      const cableList = getCables();
      generatePullCards(cached.batchResults, cableList);
      return;
    }

    // Fallback: try localStorage
    for (const key of Object.keys(localStorage)) {
      if (key.endsWith('routeCache') || key.includes('routeCache')) {
        try {
          cached = JSON.parse(localStorage.getItem(key));
        } catch { /* skip */ }
        if (cached && cached.batchResults) break;
        cached = null;
      }
    }

    if (cached && Array.isArray(cached.batchResults) && cached.batchResults.length > 0) {
      const cableList = getCables();
      generatePullCards(cached.batchResults, cableList);
      return;
    }

    showAlertModal('No route results found in the current session. Please run cable routing on the Optimal Route page first, or import a route_data.xlsx file.');
  });

  // ---- Parse route XLSX into result-like objects ----

  function parseRouteXLSX(wb) {
    const segSheet = wb.Sheets['Segments'];
    if (!segSheet) return [];

    const rows = XLSX.utils.sheet_to_json(segSheet, { defval: '' });
    if (!rows.length) return [];

    // Group rows by cable_tag
    const byTag = new Map();
    for (const row of rows) {
      const tag = row.cable_tag || row.Cable || '';
      if (!tag) continue;
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(row);
    }

    // Also try the summary sheet for total_length
    const summarySheet = wb.Sheets['Summary'];
    const summaryRows = summarySheet ? XLSX.utils.sheet_to_json(summarySheet, { defval: '' }) : [];
    const summaryMap = new Map(summaryRows.map(r => [r.cable_tag, r]));

    const results = [];
    for (const [tag, segs] of byTag) {
      const breakdown = segs.map(s => ({
        tray_id: s.element_id || '',
        conduit_id: s.element_type === 'conduit' ? s.element_id : undefined,
        ductbankTag: s.element_type === 'ductbank' ? s.element_id : undefined,
        length: parseFloat(s.length) || 0,
        start: null,
        end: null,
      }));
      const summaryInfo = summaryMap.get(tag) || {};
      const totalLen = parseFloat(summaryInfo.total_length) || breakdown.reduce((s, b) => s + b.length, 0);

      results.push({
        cable: tag,
        status: '✓ Routed',
        breakdown,
        total_length: totalLen,
        route_segments: breakdown,
      });
    }
    return results;
  }

  // ---- Generate pull cards from results ----

  function generatePullCards(routeResults, cableList) {
    const { pulls, summary } = buildPullTable(routeResults, cableList);
    currentPulls = pulls;

    // Render summary
    summaryCards.innerHTML = `
      <div class="summary-stat">
        <span class="stat-value">${summary.total_cables}</span>
        <span class="stat-label">Total Cables</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${summary.total_pulls}</span>
        <span class="stat-label">Total Pulls</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${summary.multi_cable_pulls}</span>
        <span class="stat-label">Multi-Cable Pulls</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${summary.single_cable_pulls}</span>
        <span class="stat-label">Single-Cable Pulls</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${summary.cables_per_pull_avg}</span>
        <span class="stat-label">Avg Cables/Pull</span>
      </div>`;

    summarySection.hidden = false;

    // Render pull table
    pullTableBody.innerHTML = pulls.map(p => {
      const tagsDisplay = p.cable_tags.length <= 3
        ? esc(p.cable_tags.join(', '))
        : esc(p.cable_tags.slice(0, 3).join(', ')) + ` +${p.cable_tags.length - 3} more`;
      const multiClass = p.cable_count > 1 ? 'multi-cable-pull' : '';
      return `<tr class="${multiClass}" data-pull="${p.pull_number}">
        <td>${p.pull_number}</td>
        <td>${esc(p.cable_type)}</td>
        <td>${p.cable_count}</td>
        <td>${tagsDisplay}</td>
        <td>${esc(p.from)}</td>
        <td>${esc(p.to)}</td>
        <td>${p.total_length_ft}</td>
        <td>${p.total_weight_lb_ft}</td>
        <td>${p.estimated_tension_lbs}</td>
        <td>${p.segment_count}</td>
        <td><button class="btn view-pull-btn" data-pull="${p.pull_number}">View</button></td>
      </tr>`;
    }).join('');

    pullTableSection.hidden = false;
    pullCardDetail.hidden = true;

    // Wire up view buttons
    pullTableBody.querySelectorAll('.view-pull-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const num = parseInt(btn.dataset.pull, 10);
        showPullCard(num);
      });
    });
  }

  // ---- Show individual pull card ----

  function showPullCard(pullNumber) {
    if (!currentPulls) return;
    const pull = currentPulls.find(p => p.pull_number === pullNumber);
    if (!pull) return;

    pullCardTitle.textContent = `Pull Card #${pull.pull_number}`;

    const cableRows = pull.cables.map(c => `<tr>
      <td>${esc(c.tag)}</td>
      <td>${esc(c.cable_type)}</td>
      <td>${c.conductors}</td>
      <td>${esc(c.conductor_size)}</td>
      <td>${c.diameter}</td>
      <td>${c.weight || '—'}</td>
      <td>${esc(c.allowed_cable_group || '—')}</td>
    </tr>`).join('');

    const routeRows = pull.route_steps.map(s => `<tr>
      <td>${s.step}</td>
      <td>${esc(s.type)}</td>
      <td>${esc(s.id || '—')}</td>
      <td>${s.length}</td>
    </tr>`).join('');

    pullCardContent.innerHTML = `
      <div class="pull-card-grid">
        <div class="pull-card-info">
          <table class="result-table" aria-label="Pull card summary">
            <tbody>
              <tr><th scope="row">Pull Number</th><td>${pull.pull_number}</td></tr>
              <tr><th scope="row">Cable Type</th><td>${esc(pull.cable_type)}</td></tr>
              <tr><th scope="row">Cable Count</th><td>${pull.cable_count}</td></tr>
              <tr><th scope="row">From</th><td>${esc(pull.from)}</td></tr>
              <tr><th scope="row">To</th><td>${esc(pull.to)}</td></tr>
              <tr><th scope="row">Total Length</th><td>${pull.total_length_ft} ft</td></tr>
              <tr><th scope="row">Combined Weight</th><td>${pull.total_weight_lb_ft} lbs/ft</td></tr>
              <tr><th scope="row">Max Cable OD</th><td>${pull.max_diameter_in} in</td></tr>
              <tr><th scope="row">Total Cross-Section</th><td>${pull.total_cross_section_area_sqin} sq in</td></tr>
              <tr><th scope="row">Segment Count</th><td>${pull.segment_count}</td></tr>
              <tr><th scope="row">Estimated Tension</th><td>${pull.estimated_tension_lbs} lbs</td></tr>
              <tr><th scope="row">Max Tension</th><td>${pull.max_tension_lbs} lbs</td></tr>
              <tr><th scope="row">Max Sidewall Pressure</th><td>${pull.max_sidewall_pressure} lbs/ft</td></tr>
            </tbody>
          </table>
        </div>

        <div class="pull-card-cables">
          <h3>Cables in This Pull</h3>
          <table class="result-table" aria-label="Cables in pull">
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Type</th>
                <th scope="col">Conductors</th>
                <th scope="col">Size</th>
                <th scope="col">OD (in)</th>
                <th scope="col">Weight (lbs/ft)</th>
                <th scope="col">Group</th>
              </tr>
            </thead>
            <tbody>${cableRows}</tbody>
          </table>
        </div>

        <div class="pull-card-route">
          <h3>Route Detail</h3>
          <table class="result-table" aria-label="Pull route segments">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Type</th>
                <th scope="col">Raceway ID</th>
                <th scope="col">Length (ft)</th>
              </tr>
            </thead>
            <tbody>${routeRows}</tbody>
          </table>
        </div>
      </div>`;

    pullTableSection.hidden = true;
    pullCardDetail.hidden = false;
  }

  backToTableBtn.addEventListener('click', () => {
    pullCardDetail.hidden = true;
    pullTableSection.hidden = false;
  });

  // ---- XLSX Export ----

  exportPullTableBtn.addEventListener('click', () => {
    if (!currentPulls || !currentPulls.length) {
      showAlertModal('No pull data to export. Generate pull cards first.');
      return;
    }
    if (!globalThis.XLSX) {
      showAlertModal('XLSX library not loaded.');
      return;
    }

    const tableRows = currentPulls.map(p => ({
      'Pull #': p.pull_number,
      'Cable Type': p.cable_type,
      'Cable Count': p.cable_count,
      'Cable Tags': p.cable_tags.join(', '),
      'From': p.from,
      'To': p.to,
      'Total Length (ft)': p.total_length_ft,
      'Weight (lbs/ft)': p.total_weight_lb_ft,
      'Max OD (in)': p.max_diameter_in,
      'Cross Section (sq in)': p.total_cross_section_area_sqin,
      'Segments': p.segment_count,
      'Est. Tension (lbs)': p.estimated_tension_lbs,
      'Max Tension (lbs)': p.max_tension_lbs,
      'Max Sidewall (lbs/ft)': p.max_sidewall_pressure,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(tableRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Pull Table');
    XLSX.writeFile(wb, 'pull_table.xlsx');
  });

  exportPullCardsBtn.addEventListener('click', () => {
    if (!currentPulls || !currentPulls.length) {
      showAlertModal('No pull data to export. Generate pull cards first.');
      return;
    }
    if (!globalThis.XLSX) {
      showAlertModal('XLSX library not loaded.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryRows = currentPulls.map(p => ({
      'Pull #': p.pull_number,
      'Cable Type': p.cable_type,
      'Cable Count': p.cable_count,
      'Cable Tags': p.cable_tags.join(', '),
      'From': p.from,
      'To': p.to,
      'Total Length (ft)': p.total_length_ft,
      'Weight (lbs/ft)': p.total_weight_lb_ft,
      'Est. Tension (lbs)': p.estimated_tension_lbs,
    }));
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Pull Summary');

    // Cable detail sheet
    const cableRows = [];
    for (const p of currentPulls) {
      for (const c of p.cables) {
        cableRows.push({
          'Pull #': p.pull_number,
          'Cable Tag': c.tag,
          'Cable Type': c.cable_type,
          'Conductors': c.conductors,
          'Conductor Size': c.conductor_size,
          'OD (in)': c.diameter,
          'Weight (lbs/ft)': c.weight || '',
          'Cable Group': c.allowed_cable_group || '',
        });
      }
    }
    const wsCables = XLSX.utils.json_to_sheet(cableRows);
    XLSX.utils.book_append_sheet(wb, wsCables, 'Cable Detail');

    // Route detail sheet
    const routeRows = [];
    for (const p of currentPulls) {
      for (const s of p.route_steps) {
        routeRows.push({
          'Pull #': p.pull_number,
          'Step': s.step,
          'Type': s.type,
          'Raceway ID': s.id || '',
          'Length (ft)': s.length,
        });
      }
    }
    const wsRoute = XLSX.utils.json_to_sheet(routeRows);
    XLSX.utils.book_append_sheet(wb, wsRoute, 'Route Detail');

    XLSX.writeFile(wb, 'pull_cards.xlsx');
  });

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
