import {
  calcWindForce,
  calcVelocityPressure,
  calcKz,
  checkNemaCapacity,
  NEMA_LOAD_CLASSES,
} from './analysis/windLoad.mjs';
import { getTrays, getCables } from './dataStore.mjs';
import { CABLE_WEIGHT_LB_FT } from './analysis/supportSpan.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const calcBtn         = document.getElementById('calc-btn');
  const scheduleBtn     = document.getElementById('schedule-btn');
  const scheduleSection = document.getElementById('schedule-section');
  const singleModeRadio = document.getElementById('mode-single');
  const scheduleModeRadio = document.getElementById('mode-schedule');
  const resultsDiv      = document.getElementById('results');
  const scheduleResultsDiv = document.getElementById('schedule-results');

  // Populate NEMA class options
  const nemaSel = document.getElementById('nema-class');
  Object.keys(NEMA_LOAD_CLASSES).forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = cls;
    if (cls === '12B') opt.selected = true;
    nemaSel.appendChild(opt);
  });

  // Mode toggle
  function updateMode() {
    const isSingle = singleModeRadio.checked;
    scheduleSection.hidden = isSingle;
    resultsDiv.innerHTML = '';
    if (scheduleResultsDiv) scheduleResultsDiv.innerHTML = '';
  }
  singleModeRadio.addEventListener('change', updateMode);
  scheduleModeRadio.addEventListener('change', updateMode);
  updateMode();

  // Live q_z preview
  function updateQzPreview() {
    const V   = parseFloat(document.getElementById('wind-speed').value);
    const z   = parseFloat(document.getElementById('tray-height').value);
    const exp = document.getElementById('exposure').value;
    if (!Number.isFinite(V) || !Number.isFinite(z)) return;
    try {
      const q = calcVelocityPressure({ V, z_ft: z, exposure: exp });
      const Kz = calcKz(z, exp);
      let preview = document.getElementById('qz-preview');
      if (!preview) {
        preview = document.createElement('p');
        preview.id = 'qz-preview';
        preview.className = 'field-hint';
        document.getElementById('exposure').closest('fieldset').appendChild(preview);
      }
      preview.textContent =
        `K_z = ${Kz.toFixed(4)}, velocity pressure q_z = ${q.toFixed(2)} lbs/ft² ` +
        `(V = ${V} mph, z = ${z} ft, Exposure ${exp})`;
    } catch { /* ignore preview errors */ }
  }

  ['wind-speed', 'tray-height', 'exposure'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateQzPreview);
  });
  updateQzPreview();

  // ---- Single tray mode ----
  calcBtn.addEventListener('click', () => {
    const V           = parseFloat(document.getElementById('wind-speed').value);
    const z_ft        = parseFloat(document.getElementById('tray-height').value);
    const exposure    = document.getElementById('exposure').value;
    const K_zt        = parseFloat(document.getElementById('k-zt').value) || 1.0;
    const trayWidth   = parseFloat(document.getElementById('tray-width').value);
    const spanLength  = parseFloat(document.getElementById('span-length').value);
    const fillLevel   = document.getElementById('fill-level').value;
    const cableWeight = parseFloat(document.getElementById('cable-weight').value) || 0;
    const nemaClass   = document.getElementById('nema-class').value;

    if (!Number.isFinite(V) || V <= 0) {
      showAlertModal('Input Error', 'Basic wind speed V must be a positive value (mph).');
      return;
    }
    if (!Number.isFinite(z_ft) || z_ft < 0) {
      showAlertModal('Input Error', 'Installation height must be ≥ 0 ft.');
      return;
    }
    if (!Number.isFinite(trayWidth) || trayWidth <= 0) {
      showAlertModal('Input Error', 'Tray width must be a positive value (inches).');
      return;
    }
    if (!Number.isFinite(spanLength) || spanLength <= 0) {
      showAlertModal('Input Error', 'Span length must be a positive value (ft).');
      return;
    }

    let result;
    try {
      result = calcWindForce({ V, z_ft, exposure, K_zt, trayWidth_in: trayWidth, spanLength_ft: spanLength, fillLevel });
    } catch (err) {
      showAlertModal('Calculation Error', err.message);
      return;
    }

    const capacity = checkNemaCapacity({
      cableWeight_lbs_ft: cableWeight,
      windForce_per_ft: result.windForce_per_ft,
      nemaClass,
      spanLength_ft: spanLength,
    });

    renderSingleResult(result, capacity, { V, z_ft, exposure, trayWidth, spanLength, fillLevel, cableWeight, nemaClass });
  });

  function renderSingleResult(r, cap, params) {
    const overload = cap.overCapacity;
    const cardClass = overload ? 'result-fail' : 'result-ok';

    resultsDiv.innerHTML = `
      <div class="result-card ${cardClass}" role="status" aria-live="polite">
        <h2>Wind Load Results</h2>
        <table class="result-table" aria-label="Wind load results">
          <tbody>
            <tr><th scope="row">Basic Wind Speed</th><td>${esc(params.V)} mph</td></tr>
            <tr><th scope="row">Exposure Category</th><td>${esc(params.exposure)}</td></tr>
            <tr><th scope="row">Installation Height</th><td>${esc(params.z_ft)} ft</td></tr>
            <tr><th scope="row">K<sub>z</sub> (velocity pressure exp. coeff.)</th><td>${r.Kz.toFixed(4)}</td></tr>
            <tr><th scope="row">Velocity Pressure q<sub>z</sub></th><td><strong>${r.q_z_psf.toFixed(2)} lbs/ft²</strong></td></tr>
            <tr><th scope="row">Gust Factor G</th><td>${r.G.toFixed(2)}</td></tr>
            <tr><th scope="row">Force Coefficient C<sub>f</sub></th><td>${r.Cf.toFixed(1)} (${esc(params.fillLevel)} fill)</td></tr>
            <tr><th scope="row">Effective Wind Pressure</th><td>${r.windPressure_psf.toFixed(2)} lbs/ft²</td></tr>
            <tr><th scope="row">Tray Projected Area</th><td>${r.projectedArea_ft2.toFixed(2)} ft²</td></tr>
            <tr><th scope="row">Total Wind Force (per span)</th><td><strong>${r.windForce_lbs.toFixed(1)} lbs</strong></td></tr>
            <tr><th scope="row">Wind Force per Linear Foot</th><td><strong>${r.windForce_per_ft.toFixed(1)} lbs/ft</strong></td></tr>
            ${cap.verticalCapacity_lbs_ft != null ? `
            <tr><th scope="row">NEMA ${esc(params.nemaClass)} Capacity (at ${esc(String(params.spanLength))} ft span)</th>
                <td>${cap.verticalCapacity_lbs_ft.toFixed(1)} lbs/ft</td></tr>
            <tr><th scope="row">Vertical Load (cable weight)</th>
                <td class="status-badge ${overload ? 'result-fail' : 'result-ok'}">${cap.verticalLoad_lbs_ft.toFixed(1)} lbs/ft
                (${((cap.verticalUtilization || 0) * 100).toFixed(1)}% utilized)</td></tr>` : ''}
          </tbody>
        </table>
        <div class="result-recommendation">${esc(cap.note)}</div>
        <details class="method-note">
          <summary>How this was calculated</summary>
          <p>Per ASCE 7-22 Eq. 26.10-1:</p>
          <pre>q_z = 0.00256 × K_z × K_zt × K_e × V²
    = 0.00256 × ${r.Kz.toFixed(4)} × 1.0 × 1.0 × ${params.V}²
    = ${r.q_z_psf.toFixed(2)} lbs/ft²</pre>
          <p>Design wind force (ASCE 7-22 §29.4):</p>
          <pre>F = q_z × G × C_f × A_f
  = ${r.q_z_psf.toFixed(2)} × ${r.G.toFixed(2)} × ${r.Cf.toFixed(1)} × ${r.projectedArea_ft2.toFixed(2)}
  = ${r.windForce_lbs.toFixed(1)} lbs</pre>
          <p>Force per linear foot = ${r.windForce_lbs.toFixed(1)} / ${params.spanLength} = ${r.windForce_per_ft.toFixed(1)} lbs/ft</p>
        </details>
      </div>`;
  }

  // ---- Schedule mode ----
  if (scheduleBtn) {
    scheduleBtn.addEventListener('click', () => {
      const trays  = getTrays();
      const cables = getCables();

      if (!trays.length) {
        showAlertModal('No Data', 'No trays found in the Raceway Schedule. Please add trays first.');
        return;
      }

      const V        = parseFloat(document.getElementById('wind-speed').value);
      const z_ft     = parseFloat(document.getElementById('tray-height').value);
      const exposure = document.getElementById('exposure').value;
      const K_zt     = parseFloat(document.getElementById('k-zt').value) || 1.0;
      const fillLevel = document.getElementById('fill-level').value;
      const nemaClass = document.getElementById('nema-class').value;
      const spanLength = parseFloat(document.getElementById('span-length').value) || 12;

      if (!Number.isFinite(V) || V <= 0 || !Number.isFinite(z_ft)) {
        showAlertModal('Input Error', 'Please complete the wind parameters before evaluating trays.');
        return;
      }

      // Accumulate cable weight per tray
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
            w = CABLE_WEIGHT_LB_FT[`${conductors}C-${size}`] || 0;
          }
          trayWeightMap[trayId] += w;
        }
      });

      const rows = trays.map(tray => {
        const trayWidth = parseFloat(tray.inside_width) || 12;
        let result = null;
        try {
          result = calcWindForce({ V, z_ft, exposure, K_zt, trayWidth_in: trayWidth, spanLength_ft: spanLength, fillLevel });
        } catch { /* skip trays with invalid data */ }
        const cableWeight = trayWeightMap[tray.tray_id] || 0;
        const capacity = result ? checkNemaCapacity({
          cableWeight_lbs_ft: cableWeight,
          windForce_per_ft: result.windForce_per_ft,
          nemaClass,
          spanLength_ft: spanLength,
        }) : null;
        return { tray, trayWidth, result, capacity, cableWeight };
      });

      renderScheduleResults(rows, { V, z_ft, exposure, spanLength, nemaClass });
    });
  }

  function renderScheduleResults(rows, params) {
    const tableRows = rows.map(({ tray, trayWidth, result, capacity, cableWeight }) => {
      if (!result) {
        return `<tr>
          <td>${esc(tray.tray_id)}</td>
          <td>${esc(String(trayWidth))}"</td>
          <td colspan="5">—</td>
        </tr>`;
      }
      const overload = capacity?.overCapacity;
      const rowClass = overload ? 'result-fail' : 'result-ok';
      return `<tr class="${rowClass}">
        <td>${esc(tray.tray_id)}</td>
        <td>${esc(String(trayWidth))}"</td>
        <td>${result.q_z_psf.toFixed(2)}</td>
        <td>${result.windForce_per_ft.toFixed(1)}</td>
        <td>${cableWeight.toFixed(1)}</td>
        <td>${capacity ? capacity.verticalCapacity_lbs_ft.toFixed(1) : '—'}</td>
        <td class="status-badge ${rowClass}">${capacity ? (overload ? 'Over' : 'OK') : '—'}</td>
      </tr>`;
    }).join('');

    scheduleResultsDiv.innerHTML = `
      <h2>Tray Wind Load Results — V=${esc(String(params.V))} mph, Exp. ${esc(params.exposure)}</h2>
      <table class="result-table schedule-result-table" aria-label="Tray wind load results">
        <thead>
          <tr>
            <th scope="col">Tray ID</th>
            <th scope="col">Width</th>
            <th scope="col">q<sub>z</sub> (lbs/ft²)</th>
            <th scope="col">Wind Force (lbs/ft)</th>
            <th scope="col">Cable Load (lbs/ft)</th>
            <th scope="col">NEMA ${esc(params.nemaClass)} Cap. (lbs/ft)</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p class="method-note">Wind force per ASCE 7-22 §29.4 at z = ${esc(String(params.z_ft))} ft, span = ${esc(String(params.spanLength))} ft.
      Vertical cable load from conductor size lookup; verify with cable data sheets.</p>`;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
