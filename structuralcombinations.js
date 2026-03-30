/**
 * UI handler for structuralcombinations.html
 *
 * Reads form inputs, calls calcStructuralCombinations(), and renders a table of
 * ASCE 7-22 load combinations with the governing row highlighted and optional
 * capacity utilization check.
 */

import { calcStructuralCombinations } from './analysis/structuralLoadCombinations.mjs';
import { calcSeismicDesignCategory, maxBraceSpacing } from './analysis/seismicBracing.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const calcBtn     = document.getElementById('calc-btn');
  const resultsDiv  = document.getElementById('results');

  // Method radios
  const lrfdRadio = document.getElementById('method-lrfd');
  const asdRadio  = document.getElementById('method-asd');

  // Dead load inputs
  const trayWeightInput  = document.getElementById('tray-weight');
  const cableWeightInput = document.getElementById('cable-weight');

  // Wind inputs
  const windSpeedInput   = document.getElementById('wind-speed');
  const exposureSel      = document.getElementById('wind-exposure');
  const kztInput         = document.getElementById('wind-kzt');
  const fillLevelSel     = document.getElementById('fill-level');

  // Seismic inputs
  const sdsInput         = document.getElementById('sds');
  const sd1Input         = document.getElementById('sd1');
  const riskCatSel       = document.getElementById('risk-category');
  const ipSel            = document.getElementById('ip');

  // Geometry inputs
  const heightInput      = document.getElementById('height');
  const buildingHtInput  = document.getElementById('building-height');
  const trayWidthInput   = document.getElementById('tray-width');
  const spanInput        = document.getElementById('span-length');

  // Capacity inputs (optional)
  const vertCapInput     = document.getElementById('vert-capacity');
  const latCapInput      = document.getElementById('lat-capacity');

  // ---- Live SDC preview (mirrors seismicBracing.js pattern) ----
  function updateSdcPreview() {
    const sds = parseFloat(sdsInput.value);
    const sd1 = parseFloat(sd1Input.value);
    const rc  = riskCatSel.value;
    if (!Number.isFinite(sds) || !Number.isFinite(sd1)) return;
    try {
      const sdc     = calcSeismicDesignCategory(sds, sd1, rc);
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
          `SDC ${sdc}: Seismic bracing required — lateral ≤ ${spacing.lateral} ft.`;
      } else {
        preview.textContent = `SDC ${sdc}: Seismic bracing not required by ASCE 7.`;
      }
    } catch { /* ignore preview errors */ }
  }
  [sdsInput, sd1Input, riskCatSel].forEach(el => {
    if (el) el.addEventListener('input', updateSdcPreview);
  });
  updateSdcPreview();

  // ---- Calculate ----
  calcBtn.addEventListener('click', () => {
    const trayWeight  = parseFloat(trayWeightInput.value);
    const cableWeight = parseFloat(cableWeightInput.value);
    const windSpeed   = parseFloat(windSpeedInput.value);
    const exposure    = exposureSel.value;
    const kzt         = parseFloat(kztInput.value) || 1.0;
    const fillLevel   = fillLevelSel.value;
    const sds         = parseFloat(sdsInput.value);
    const sd1         = parseFloat(sd1Input.value);
    const rc          = riskCatSel.value;
    const ip          = parseFloat(ipSel.value) || 1.0;
    const height      = parseFloat(heightInput.value);
    const buildingHt  = parseFloat(buildingHtInput.value);
    const trayWidth   = parseFloat(trayWidthInput.value);
    const span        = parseFloat(spanInput.value);
    const designMethod = lrfdRadio.checked ? 'LRFD' : 'ASD';
    const vertCap     = parseFloat(vertCapInput.value);
    const latCap      = parseFloat(latCapInput.value);

    // Basic front-end validation
    if (!Number.isFinite(trayWeight) || trayWeight < 0) {
      showAlertModal('Enter a valid tray self-weight ≥ 0 lbs/ft.');
      return;
    }
    if (!Number.isFinite(cableWeight) || cableWeight < 0) {
      showAlertModal('Enter a valid cable weight ≥ 0 lbs/ft.');
      return;
    }
    if (!Number.isFinite(windSpeed) || windSpeed <= 0) {
      showAlertModal('Enter a valid wind speed > 0 mph.');
      return;
    }
    if (!Number.isFinite(sds) || sds < 0) {
      showAlertModal('Enter a valid S\u1D05\u209B ≥ 0 g.');
      return;
    }
    if (!Number.isFinite(sd1) || sd1 < 0) {
      showAlertModal('Enter a valid S\u1D05\u2081 ≥ 0 g.');
      return;
    }
    if (!Number.isFinite(height) || height <= 0) {
      showAlertModal('Tray height above grade must be > 0 ft.');
      return;
    }
    if (!Number.isFinite(buildingHt) || buildingHt <= 0) {
      showAlertModal('Building height must be > 0 ft.');
      return;
    }
    if (!Number.isFinite(trayWidth) || trayWidth <= 0) {
      showAlertModal('Tray inside width must be > 0 inches.');
      return;
    }
    if (!Number.isFinite(span) || span <= 0) {
      showAlertModal('Support span must be > 0 ft.');
      return;
    }

    let result;
    try {
      result = calcStructuralCombinations({
        trayWeight_lbs_ft: trayWeight,
        cableWeight_lbs_ft: cableWeight,
        windSpeed_mph: windSpeed,
        windExposure: exposure,
        windK_zt: kzt,
        fillLevel,
        sds,
        sd1,
        riskCategory: rc,
        ip,
        height_ft: height,
        buildingHeight_ft: buildingHt,
        trayWidth_in: trayWidth,
        spanLength_ft: span,
        verticalCapacity_lbs_ft: Number.isFinite(vertCap) && vertCap > 0 ? vertCap : undefined,
        lateralCapacity_lbs_ft:  Number.isFinite(latCap)  && latCap  > 0 ? latCap  : undefined,
        designMethod,
      });
    } catch (err) {
      showAlertModal(`Calculation error: ${err.message}`);
      return;
    }

    renderResults(result, designMethod);
  });

  // ---- Render ----
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function utilBar(ratio) {
    if (ratio === null) return '—';
    const pct  = Math.min(ratio * 100, 200);
    const cls  = ratio <= 1.0 ? 'util-ok' : 'util-fail';
    const label = (ratio * 100).toFixed(1) + '%';
    return `<span class="util-bar-wrap" aria-label="Utilization ${label}">
      <span class="util-bar ${cls}" style="width:${Math.min(pct, 100)}%"></span>
      <span class="util-bar-label ${cls}">${label}</span>
    </span>`;
  }

  function renderResults(r, designMethod) {
    const govVertId = r.governingVertical.id;
    const govLatId  = r.governingLateral.id;

    const lcRows = r.loadCombinations.map(lc => {
      const isGovV = lc.id === govVertId;
      const isGovL = lc.id === govLatId;
      const rowCls = (isGovV || isGovL) ? ' class="lc-governing"' : '';
      return `<tr${rowCls}>
        <td>${esc(lc.id)}</td>
        <td>${esc(lc.label)}</td>
        <td>${esc(lc.standard)}</td>
        <td${isGovV ? ' class="lc-governing-cell"' : ''}>${lc.verticalDemand_lbs_ft.toFixed(2)}</td>
        <td${isGovL ? ' class="lc-governing-cell"' : ''}>${lc.lateralDemand_lbs_ft.toFixed(2)}</td>
      </tr>`;
    }).join('');

    const cc = r.capacityCheck;
    const capacitySection = (cc.verticalUtilization !== null || cc.lateralUtilization !== null)
      ? `<section class="card capacity-check-card" aria-label="Support capacity check">
          <h2>Support Capacity Check</h2>
          <table class="result-table" aria-label="Capacity utilization">
            <thead>
              <tr>
                <th scope="col">Direction</th>
                <th scope="col">Governing Demand (lbs/ft)</th>
                <th scope="col">Capacity (lbs/ft)</th>
                <th scope="col">Utilization</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              ${cc.verticalUtilization !== null ? `
              <tr class="${cc.verticalAdequate ? 'result-ok' : 'result-fail'}">
                <th scope="row">Vertical</th>
                <td>${r.governingVertical.demand_lbs_ft.toFixed(2)}</td>
                <td>${document.getElementById('vert-capacity').value}</td>
                <td>${utilBar(cc.verticalUtilization)}</td>
                <td class="status-badge ${cc.verticalAdequate ? 'result-ok' : 'result-fail'}">
                  ${cc.verticalAdequate ? 'OK' : 'OVER CAPACITY'}
                </td>
              </tr>` : ''}
              ${cc.lateralUtilization !== null ? `
              <tr class="${cc.lateralAdequate ? 'result-ok' : 'result-fail'}">
                <th scope="row">Lateral</th>
                <td>${r.governingLateral.demand_lbs_ft.toFixed(2)}</td>
                <td>${document.getElementById('lat-capacity').value}</td>
                <td>${utilBar(cc.lateralUtilization)}</td>
                <td class="status-badge ${cc.lateralAdequate ? 'result-ok' : 'result-fail'}">
                  ${cc.lateralAdequate ? 'OK' : 'OVER CAPACITY'}
                </td>
              </tr>` : ''}
            </tbody>
          </table>
        </section>`
      : '';

    resultsDiv.innerHTML = `
      <section class="card" aria-label="Load effects summary">
        <h2>Load Effects (per linear foot of tray)</h2>
        <table class="result-table" aria-label="Individual load effects">
          <tbody>
            <tr><th scope="row">Dead Load (D)</th>
                <td>${r.deadLoad_lbs_ft.toFixed(2)} lbs/ft (tray + cables)</td></tr>
            <tr><th scope="row">Wind Lateral (W)</th>
                <td>${r.windLateral_lbs_ft.toFixed(2)} lbs/ft
                  <span class="field-hint">q_z = ${r.windResult.q_z_psf.toFixed(2)} psf,
                    C_f = ${r.windResult.Cf}</span></td></tr>
            <tr><th scope="row">Seismic Lateral (E<sub>h</sub>)</th>
                <td>${r.seismicLateral_lbs_ft.toFixed(2)} lbs/ft
                  <span class="field-hint">SDC ${esc(r.seismicResult.sdc)},
                    F_p/W_p = ${(r.seismicResult.fpFactor * 100).toFixed(2)}%</span></td></tr>
            <tr><th scope="row">Vertical Seismic Effect (E<sub>v</sub> = 0.2·S<sub>DS</sub>·D)</th>
                <td>±${r.seismicVertical_lbs_ft.toFixed(2)} lbs/ft</td></tr>
          </tbody>
        </table>
      </section>

      <section class="card" aria-label="ASCE 7-22 load combinations">
        <h2>ASCE 7-22 ${esc(designMethod)} Load Combinations</h2>
        <p class="field-hint">Governing combination per direction is highlighted.
          Vertical demand is downward force per ft; lateral demand is horizontal force per ft.</p>
        <div class="table-responsive">
          <table class="result-table lc-table" aria-label="Load combination demands">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Combination</th>
                <th scope="col">Standard Reference</th>
                <th scope="col">Vertical Demand (lbs/ft)</th>
                <th scope="col">Lateral Demand (lbs/ft)</th>
              </tr>
            </thead>
            <tbody>${lcRows}</tbody>
          </table>
        </div>
        <div class="governing-summary">
          <p><strong>Governing Vertical:</strong> ${esc(r.governingVertical.id)} —
            ${r.governingVertical.demand_lbs_ft.toFixed(2)} lbs/ft
            <span class="field-hint">(${esc(r.governingVertical.label)})</span></p>
          <p><strong>Governing Lateral:</strong> ${esc(r.governingLateral.id)} —
            ${r.governingLateral.demand_lbs_ft.toFixed(2)} lbs/ft
            <span class="field-hint">(${esc(r.governingLateral.label)})</span></p>
        </div>
      </section>

      <details class="card method-note">
        <summary>Calculation method</summary>
        <p>Dead load D = tray weight + cable weight =
           ${r.deadLoad_lbs_ft.toFixed(2)} lbs/ft</p>
        <p>Wind lateral W per ASCE 7-22 Chapter 27/30, Eq. 27.3-1:
           F = q_z × G × C_f × A_f / span =
           ${r.windLateral_lbs_ft.toFixed(2)} lbs/ft</p>
        <p>Seismic E_h per ASCE 7-22 §13.3.1:
           F_p = (0.4·a_p·S_DS·W_p / (R_p/I_p)) × (1 + 2z/h),
           bounded by [0.3·S_DS·I_p·W_p, 1.6·S_DS·I_p·W_p] =
           ${r.seismicLateral_lbs_ft.toFixed(2)} lbs/ft</p>
        <p>Vertical seismic E_v per ASCE 7-22 §12.4.2.2:
           E_v = 0.2·S_DS·D =
           ±${r.seismicVertical_lbs_ft.toFixed(2)} lbs/ft</p>
      </details>

      ${capacitySection}`;
  }
});
