import { calcBraceForces, calcSeismicDesignCategory, maxBraceSpacing } from './analysis/seismicBracing.mjs';
import { getTrays, getCables } from './dataStore.mjs';
import { CABLE_WEIGHT_LB_FT } from './analysis/supportSpan.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const sdsInput           = document.getElementById('sds');
  const sd1Input           = document.getElementById('sd1');
  const riskCatSel         = document.getElementById('riskCategory');
  const ipSel              = document.getElementById('ip');
  const trayHeightInput    = document.getElementById('trayHeight');
  const buildingHeightInput= document.getElementById('buildingHeight');
  const wpPerFtInput       = document.getElementById('wpPerFt');
  const singleModeRadio    = document.getElementById('modeSingle');
  const scheduleModeRadio  = document.getElementById('modeSchedule');
  const calcBtn            = document.getElementById('calcBtn');
  const loadScheduleBtn    = document.getElementById('loadScheduleBtn');
  const resultsDiv         = document.getElementById('results');
  const scheduleSection    = document.getElementById('scheduleSection');
  const scheduleResultsDiv = document.getElementById('scheduleResults');

  // Mode toggle
  function updateMode() {
    const isSingle = singleModeRadio.checked;
    scheduleSection.hidden = isSingle;
    resultsDiv.innerHTML = '';
    scheduleResultsDiv.innerHTML = '';
  }
  singleModeRadio.addEventListener('change', updateMode);
  scheduleModeRadio.addEventListener('change', updateMode);
  updateMode();

  // Show live SDC preview as user edits site parameters
  function updateSdcPreview() {
    const sds = parseFloat(sdsInput.value);
    const sd1 = parseFloat(sd1Input.value);
    const rc  = riskCatSel.value;
    if (!Number.isFinite(sds) || !Number.isFinite(sd1)) return;
    const sdc = calcSeismicDesignCategory(sds, sd1, rc);
    const spacing = maxBraceSpacing(sdc);
    let preview = document.getElementById('sdc-preview');
    if (!preview) {
      preview = document.createElement('p');
      preview.id = 'sdc-preview';
      preview.className = 'field-hint sdc-preview';
      riskCatSel.closest('fieldset').appendChild(preview);
    }
    if (spacing.required) {
      preview.textContent =
        `SDC ${sdc}: Seismic bracing required — ` +
        `lateral ≤ ${spacing.lateral} ft, longitudinal ≤ ${spacing.longitudinal} ft.`;
      preview.dataset.sdc = sdc;
    } else {
      preview.textContent = `SDC ${sdc}: Seismic bracing not required by ASCE 7.`;
      preview.dataset.sdc = sdc;
    }
  }
  [sdsInput, sd1Input, riskCatSel].forEach(el => el.addEventListener('input', updateSdcPreview));
  updateSdcPreview();

  // ---- Single-tray mode ----

  calcBtn.addEventListener('click', () => {
    const sds = parseFloat(sdsInput.value);
    const sd1 = parseFloat(sd1Input.value);
    const rc  = riskCatSel.value;
    const ip  = parseFloat(ipSel.value);
    const z   = parseFloat(trayHeightInput.value);
    const h   = parseFloat(buildingHeightInput.value);
    const wp  = parseFloat(wpPerFtInput.value);

    if (!Number.isFinite(sds) || sds < 0) {
      showAlertModal('Enter a valid S\u1D05\u209B value (≥ 0 g).');
      return;
    }
    if (!Number.isFinite(sd1) || sd1 < 0) {
      showAlertModal('Enter a valid S\u1D05\u2081 value (≥ 0 g).');
      return;
    }
    if (!Number.isFinite(z) || z < 0) {
      showAlertModal('Tray attachment height must be ≥ 0 ft.');
      return;
    }
    if (!Number.isFinite(h) || h <= 0) {
      showAlertModal('Building height must be a positive number.');
      return;
    }
    if (z > h) {
      showAlertModal('Tray attachment height z cannot exceed building height h.');
      return;
    }
    if (!Number.isFinite(wp) || wp <= 0) {
      showAlertModal('Enter a positive tray + cable weight per foot (lbs/ft).');
      return;
    }

    let result;
    try {
      result = calcBraceForces({ sds, sd1, riskCategory: rc, wp, z, h, ip });
    } catch (err) {
      showAlertModal(`Calculation error: ${err.message}`);
      return;
    }

    renderSingleResult(result, { sds, sd1, rc, z, h, wp });
  });

  function renderSingleResult(r, params) {
    const sdcBadgeClass = r.bracingRequired ? 'result-fail' : 'result-ok';
    const bracingLabel  = r.bracingRequired ? 'Required' : 'Not Required';

    const lateralRow = r.bracingRequired
      ? `<tr><th scope="row">Lateral Brace Force</th>
             <td><strong>${r.lateralForce.toFixed(2)} lbs/ft</strong></td></tr>
         <tr><th scope="row">Longitudinal Brace Force</th>
             <td>${r.longitudinalForce.toFixed(2)} lbs/ft</td></tr>
         <tr><th scope="row">Max Lateral Brace Spacing</th>
             <td>${r.maxLateralSpacing} ft</td></tr>
         <tr><th scope="row">Max Longitudinal Brace Spacing</th>
             <td>${r.maxLongSpacing} ft</td></tr>`
      : '';

    resultsDiv.innerHTML = `
      <div class="result-card ${sdcBadgeClass}" role="status" aria-live="polite">
        <h2>Result — SDC ${esc(r.sdc)}</h2>
        <table class="result-table" aria-label="Seismic bracing results">
          <tbody>
            <tr><th scope="row">Seismic Design Category</th>
                <td class="status-badge ${sdcBadgeClass}">${esc(r.sdc)}</td></tr>
            <tr><th scope="row">Seismic Bracing</th>
                <td class="status-badge ${sdcBadgeClass}">${bracingLabel}</td></tr>
            <tr><th scope="row">Fp / Wp (design force factor)</th>
                <td>${r.bracingRequired ? (r.fpFactor * 100).toFixed(3) + '% g' : 'N/A'}</td></tr>
            ${lateralRow}
            <tr><th scope="row">Vertical Force</th>
                <td>±${r.verticalForce.toFixed(2)} lbs/ft</td></tr>
            <tr><th scope="row">Component Weight (W<sub>p</sub>)</th>
                <td>${params.wp.toFixed(2)} lbs/ft</td></tr>
          </tbody>
        </table>
        <div class="result-recommendation">${esc(r.recommendation)}</div>
        ${r.bracingRequired ? `
        <details class="method-note">
          <summary>How this was calculated</summary>
          <p>Per ASCE 7-22 §13.3.1, the design seismic force is:</p>
          <pre>Fp = (0.4 × ap × SDS × Wp) / (Rp / Ip) × (1 + 2z/h)
   = (0.4 × 1.0 × ${params.sds.toFixed(3)} × Wp) / (2.5 / ${params.ip ?? 1.0}) × (1 + 2×${params.z}/${params.h})
   = ${(r.fpFactor * 100).toFixed(3)}% × Wp lbs</pre>
          <p>Subject to: Fp_min = 0.3 × SDS × Ip × Wp, Fp_max = 1.6 × SDS × Ip × Wp</p>
          <p>Lateral force = Fp × Wp = ${r.lateralForce.toFixed(2)} lbs/ft</p>
          <p>Longitudinal force = 0.4 × Fp × Wp = ${r.longitudinalForce.toFixed(2)} lbs/ft (ASCE 7 §13.5.6.1)</p>
          <p>Vertical force = ±0.2 × SDS × Ip × Wp = ±${r.verticalForce.toFixed(2)} lbs/ft</p>
        </details>` : ''}
      </div>`;
  }

  // ---- Schedule mode ----

  loadScheduleBtn.addEventListener('click', () => {
    const trays  = getTrays();
    const cables = getCables();

    if (!trays.length) {
      showAlertModal('No trays found in the Raceway Schedule. Please add trays first.');
      return;
    }

    const sds = parseFloat(sdsInput.value);
    const sd1 = parseFloat(sd1Input.value);
    const rc  = riskCatSel.value;
    const ip  = parseFloat(ipSel.value);
    const z   = parseFloat(trayHeightInput.value);
    const h   = parseFloat(buildingHeightInput.value);

    if (!Number.isFinite(sds) || !Number.isFinite(sd1) || !Number.isFinite(z) || !Number.isFinite(h) || h <= 0) {
      showAlertModal('Please fill in all site parameters before evaluating the schedule.');
      return;
    }
    if (z > h) {
      showAlertModal('Tray attachment height z cannot exceed building height h.');
      return;
    }

    // Map cables to trays (same logic as supportspan.js)
    const trayWeightMap = {};
    trays.forEach(t => { trayWeightMap[t.tray_id] = 0; });
    cables.forEach(cable => {
      const trayId = cable.route_preference;
      if (trayId && trayWeightMap[trayId] !== undefined) {
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
      // Tray self-weight: estimate from tray type (2 lbs/ft default, adjust for wider trays)
      const selfWeight = 2 + (parseFloat(tray.inside_width) || 12) * 0.05;
      const wp = (trayWeightMap[tray.tray_id] || 0) + selfWeight;
      let result;
      try {
        result = calcBraceForces({ sds, sd1, riskCategory: rc, wp, z, h, ip });
      } catch {
        result = null;
      }
      return { tray, wp, result };
    });

    renderScheduleResults(rows);
  });

  function renderScheduleResults(rows) {
    if (!rows.length) {
      scheduleResultsDiv.innerHTML = '<p>No trays to display.</p>';
      return;
    }

    const { sdc } = rows[0].result || {};
    const tableRows = rows.map(({ tray, wp, result }) => {
      if (!result) {
        return `<tr>
          <td>${esc(tray.tray_id)}</td>
          <td>${esc(tray.tray_type || '—')}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td>
        </tr>`;
      }
      const rowClass = result.bracingRequired ? 'result-fail' : 'result-ok';
      return `<tr class="${rowClass}">
        <td>${esc(tray.tray_id)}</td>
        <td>${esc(tray.tray_type || '—')}</td>
        <td>${wp.toFixed(2)}</td>
        <td>${result.bracingRequired ? result.lateralForce.toFixed(2) : '—'}</td>
        <td>${result.bracingRequired ? result.longitudinalForce.toFixed(2) : '—'}</td>
        <td class="status-badge ${rowClass}">${result.bracingRequired ? 'Required' : 'Not Required'}</td>
      </tr>`;
    }).join('');

    scheduleResultsDiv.innerHTML = `
      <h2>Tray Schedule Results — SDC ${esc(sdc ?? '?')}</h2>
      <table class="result-table schedule-result-table" aria-label="Tray seismic bracing results">
        <thead>
          <tr>
            <th scope="col">Tray ID</th>
            <th scope="col">Type</th>
            <th scope="col">W<sub>p</sub> (lbs/ft)</th>
            <th scope="col">Lateral Force (lbs/ft)</th>
            <th scope="col">Long. Force (lbs/ft)</th>
            <th scope="col">Bracing</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p class="method-note">Forces per ASCE 7-22 §13.3.1. W<sub>p</sub> includes
      estimated tray self-weight. Cable weights derived from conductor size where available.</p>`;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
