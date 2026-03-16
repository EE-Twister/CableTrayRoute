import { calcMaxSpan, NEMA_LOAD_CLASSES, CABLE_WEIGHT_LB_FT, sumCableWeights } from './analysis/supportSpan.mjs';
import { getTrays, getCables } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const loadClassSel = document.getElementById('loadClass');
  const cableWeightInput = document.getElementById('cableWeightPerFt');
  const manualModeRadio = document.getElementById('modeManual');
  const scheduleModeRadio = document.getElementById('modeSchedule');
  const manualSection = document.getElementById('manualSection');
  const scheduleSection = document.getElementById('scheduleSection');
  const calcBtn = document.getElementById('calcBtn');
  const loadScheduleBtn = document.getElementById('loadScheduleBtn');
  const cableEntryBody = document.querySelector('#cableEntryTable tbody');
  const addCableRowBtn = document.getElementById('addCableRowBtn');
  const resultsDiv = document.getElementById('results');
  const scheduleResultsDiv = document.getElementById('scheduleResults');

  // Populate load-class selector
  Object.keys(NEMA_LOAD_CLASSES).forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = `Class ${cls} — ${NEMA_LOAD_CLASSES[cls].ratedLoad} lbs/ft`;
    loadClassSel.appendChild(opt);
  });
  loadClassSel.value = '16A'; // sensible default

  // Build cable size datalist from weight table
  const sizeSet = new Set();
  Object.keys(CABLE_WEIGHT_LB_FT).forEach(k => {
    const parts = k.split('-');
    if (parts.length >= 2) sizeSet.add(parts.slice(1).join('-'));
  });
  const sizeDatalist = document.getElementById('cableSizeList');
  sizeSet.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    sizeDatalist.appendChild(opt);
  });

  // Mode toggle
  function updateMode() {
    const isManual = manualModeRadio.checked;
    manualSection.hidden = !isManual;
    scheduleSection.hidden = isManual;
    resultsDiv.innerHTML = '';
    scheduleResultsDiv.innerHTML = '';
  }
  manualModeRadio.addEventListener('change', updateMode);
  scheduleModeRadio.addEventListener('change', updateMode);
  updateMode();

  // ---- Manual mode ----

  function makeWeightRow(conductors, size, qty) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" class="row-conductors" min="1" max="61" value="${conductors ?? 3}" aria-label="Conductors"></td>
      <td><input type="text" class="row-size" list="cableSizeList" value="${size ?? '#4 AWG'}" aria-label="Conductor size"></td>
      <td><input type="number" class="row-qty" min="1" value="${qty ?? 1}" aria-label="Quantity"></td>
      <td class="row-weight-cell">—</td>
      <td><button type="button" class="remove-row-btn" aria-label="Remove row">✕</button></td>`;
    tr.querySelector('.remove-row-btn').addEventListener('click', () => {
      tr.remove();
      updateRowWeights();
    });
    ['.row-conductors', '.row-size', '.row-qty'].forEach(sel => {
      tr.querySelector(sel).addEventListener('input', updateRowWeights);
    });
    cableEntryBody.appendChild(tr);
    updateRowWeights();
    return tr;
  }

  function updateRowWeights() {
    let totalWeight = 0;
    cableEntryBody.querySelectorAll('tr').forEach(tr => {
      const conductors = tr.querySelector('.row-conductors').value.trim();
      const size = tr.querySelector('.row-size').value.trim();
      const qty = parseFloat(tr.querySelector('.row-qty').value) || 1;
      const key = `${conductors}C-${size}`;
      const unitWeight = CABLE_WEIGHT_LB_FT[key] || 0;
      const rowWeight = unitWeight * qty;
      const cell = tr.querySelector('.row-weight-cell');
      cell.textContent = unitWeight > 0
        ? (rowWeight).toFixed(3) + ' lbs/ft'
        : '— (unknown)';
      totalWeight += rowWeight;
    });
    cableWeightInput.value = totalWeight > 0 ? totalWeight.toFixed(4) : '';
  }

  addCableRowBtn.addEventListener('click', () => makeWeightRow(3, '#4 AWG', 1));

  // Seed one row on load
  makeWeightRow(3, '#4 AWG', 1);

  calcBtn.addEventListener('click', () => {
    const loadClass = loadClassSel.value;
    const rawWeight = parseFloat(cableWeightInput.value);

    if (!loadClass) {
      showAlertModal('Please select a NEMA load class.');
      return;
    }
    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      showAlertModal('Enter a positive cable weight per foot, or add cable rows to compute it.');
      return;
    }

    let result;
    try {
      result = calcMaxSpan(rawWeight, loadClass);
    } catch (err) {
      showAlertModal(`Calculation error: ${err.message}`);
      return;
    }

    renderManualResult(result, rawWeight, loadClass);
  });

  function renderManualResult(result, actualLoad, loadClass) {
    const statusClass = result.status === 'OK' ? 'result-ok' : 'result-fail';
    const utilPct = (result.utilizationRatio * 100).toFixed(1);

    resultsDiv.innerHTML = `
      <div class="result-card ${statusClass}" role="status" aria-live="polite">
        <h2>Result — Class ${loadClass}</h2>
        <table class="result-table" aria-label="Span calculation results">
          <tbody>
            <tr><th scope="row">Status</th>
                <td class="status-badge ${statusClass}">${result.status}</td></tr>
            <tr><th scope="row">Max Support Span</th>
                <td><strong>${result.maxSpan} ft</strong> (${(result.maxSpan * 0.3048).toFixed(2)} m)</td></tr>
            <tr><th scope="row">Actual Cable Load</th>
                <td>${actualLoad.toFixed(3)} lbs/ft</td></tr>
            <tr><th scope="row">Rated Load (Class ${loadClass})</th>
                <td>${result.ratedLoad} lbs/ft at ${result.ratedSpan} ft span</td></tr>
            <tr><th scope="row">Load Utilization</th>
                <td>${utilPct}%</td></tr>
          </tbody>
        </table>
        <div class="result-recommendation">${result.recommendation}</div>
        <details class="method-note">
          <summary>How this was calculated</summary>
          <p>Per NEMA VE 1, the deflection limit is L/100. For a uniformly
          distributed load on a simple span, midpoint deflection is
          δ = 5wL⁴/(384EI). Setting δ = L/100 and normalising against the
          rated conditions gives:</p>
          <pre>max_span = L_rated × (w_rated / w_actual)^(1/3)
         = ${result.ratedSpan} × (${result.ratedLoad} / ${actualLoad.toFixed(4)})^(1/3)
         = ${result.maxSpan} ft</pre>
        </details>
      </div>`;
  }

  // ---- Schedule mode ----

  loadScheduleBtn.addEventListener('click', () => {
    const trays = getTrays();
    const cables = getCables();

    if (!trays.length) {
      showAlertModal('No trays found in the Raceway Schedule. Please add trays first.');
      return;
    }

    const loadClass = loadClassSel.value;

    // Build a weight map: tray_id → total lbs/ft
    // Cables are matched to trays via their route_preference field
    const trayWeightMap = {};
    trays.forEach(t => { trayWeightMap[t.tray_id] = 0; });

    cables.forEach(cable => {
      const trayId = cable.route_preference;
      if (trayId && trayWeightMap[trayId] !== undefined) {
        // Use stored weight_lb_ft if present, else derive from conductor info
        let w = 0;
        if (cable.weight_lb_ft != null) {
          w = parseFloat(cable.weight_lb_ft) || 0;
        } else {
          const conductors = cable.conductors != null ? String(cable.conductors) : '3';
          const size = cable.conductor_size || cable.size || '';
          const key = `${conductors}C-${size}`;
          w = CABLE_WEIGHT_LB_FT[key] || 0;
        }
        trayWeightMap[trayId] += w;
      }
    });

    const rows = trays.map(tray => {
      const actualLoad = trayWeightMap[tray.tray_id] || 0;
      let result;
      if (actualLoad > 0) {
        try {
          result = calcMaxSpan(actualLoad, loadClass);
        } catch {
          result = null;
        }
      }
      return { tray, actualLoad, result };
    });

    renderScheduleResults(rows, loadClass);
  });

  function renderScheduleResults(rows, loadClass) {
    if (!rows.length) {
      scheduleResultsDiv.innerHTML = '<p>No trays to display.</p>';
      return;
    }

    const tableRows = rows.map(({ tray, actualLoad, result }) => {
      if (!result) {
        return `<tr>
          <td>${esc(tray.tray_id)}</td>
          <td>${esc(tray.tray_type || '—')}</td>
          <td>${esc(String(tray.inside_width ?? '—'))}</td>
          <td>0.000</td>
          <td>—</td>
          <td>—</td>
          <td class="status-badge result-ok">NO CABLES</td>
        </tr>`;
      }
      const statusClass = result.status === 'OK' ? 'result-ok' : 'result-fail';
      const utilPct = (result.utilizationRatio * 100).toFixed(1);
      return `<tr class="${statusClass}">
        <td>${esc(tray.tray_id)}</td>
        <td>${esc(tray.tray_type || '—')}</td>
        <td>${esc(String(tray.inside_width ?? '—'))}</td>
        <td>${actualLoad.toFixed(3)}</td>
        <td><strong>${result.maxSpan}</strong></td>
        <td>${utilPct}%</td>
        <td class="status-badge ${statusClass}">${result.status}</td>
      </tr>`;
    }).join('');

    scheduleResultsDiv.innerHTML = `
      <h2>Tray Schedule Results — Class ${loadClass}</h2>
      <table class="result-table schedule-result-table" aria-label="Tray schedule span results">
        <thead>
          <tr>
            <th scope="col">Tray ID</th>
            <th scope="col">Type</th>
            <th scope="col">Width (in)</th>
            <th scope="col">Cable Load (lbs/ft)</th>
            <th scope="col">Max Span (ft)</th>
            <th scope="col">Utilization</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p class="method-note">Spans calculated per NEMA VE 1 deflection limit (L/100).
      Cable weights derived from conductor size and type where available.</p>`;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
