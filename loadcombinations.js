import { evaluateLoadCombinations } from './analysis/loadCombinations.mjs';
import { calcBraceForces, calcSeismicDesignCategory, maxBraceSpacing } from './analysis/seismicBracing.mjs';
import { calcWindForce, calcVelocityPressure } from './analysis/windLoad.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  // Dead load
  const deadLoadInput   = document.getElementById('deadLoad');

  // Seismic inputs
  const sdsInput           = document.getElementById('sds');
  const sd1Input           = document.getElementById('sd1');
  const riskCatSel         = document.getElementById('riskCategory');
  const ipSel              = document.getElementById('ip');
  const trayHeightInput    = document.getElementById('trayHeight');
  const buildingHeightInput= document.getElementById('buildingHeight');
  const wpInput            = document.getElementById('wpPerFt');

  // Wind inputs
  const windSpeedInput  = document.getElementById('windSpeed');
  const exposureSel     = document.getElementById('exposure');
  const kztInput        = document.getElementById('kzt');
  const windHeightInput = document.getElementById('windHeight');
  const trayWidthInput  = document.getElementById('trayWidth');
  const fillLevelSel    = document.getElementById('fillLevel');

  // Snow
  const snowLoadInput = document.getElementById('snowLoad');

  // Controls / results
  const calcBtn    = document.getElementById('calcBtn');
  const resultsDiv = document.getElementById('results');

  // -------------------------------------------------------------------------
  // Live SDC preview (seismic section)
  // -------------------------------------------------------------------------
  function updateSdcPreview() {
    const sds = parseFloat(sdsInput.value);
    const sd1 = parseFloat(sd1Input.value);
    const rc  = riskCatSel.value;
    if (!Number.isFinite(sds) || !Number.isFinite(sd1)) return;
    const sdc     = calcSeismicDesignCategory(sds, sd1, rc);
    const spacing = maxBraceSpacing(sdc);
    let preview   = document.getElementById('sdc-preview');
    if (!preview) {
      preview = document.createElement('p');
      preview.id = 'sdc-preview';
      preview.className = 'field-hint sdc-preview';
      riskCatSel.closest('fieldset').appendChild(preview);
    }
    preview.textContent = spacing.required
      ? `SDC ${sdc}: Seismic bracing required — lateral ≤ ${spacing.lateral} ft, longitudinal ≤ ${spacing.longitudinal} ft.`
      : `SDC ${sdc}: Seismic bracing not required by ASCE 7.`;
    preview.dataset.sdc = sdc;
  }
  [sdsInput, sd1Input, riskCatSel].forEach(el => el.addEventListener('input', updateSdcPreview));
  updateSdcPreview();

  // -------------------------------------------------------------------------
  // Live q_z preview (wind section)
  // -------------------------------------------------------------------------
  function updateQzPreview() {
    const V        = parseFloat(windSpeedInput.value);
    const exposure = exposureSel.value;
    const z_ft     = parseFloat(windHeightInput.value);
    const K_zt     = parseFloat(kztInput.value) || 1.0;
    if (!Number.isFinite(V) || V <= 0 || !Number.isFinite(z_ft) || z_ft < 0) return;
    let preview = document.getElementById('qz-preview');
    if (!preview) {
      preview = document.createElement('p');
      preview.id = 'qz-preview';
      preview.className = 'field-hint';
      windHeightInput.closest('fieldset').appendChild(preview);
    }
    try {
      const qz = calcVelocityPressure({ V, z_ft, exposure, K_zt });
      preview.textContent = `q_z = ${qz.toFixed(2)} lbs/ft² at ${z_ft} ft, ${V} mph, Exposure ${exposure}.`;
    } catch {
      preview.textContent = '';
    }
  }
  [windSpeedInput, exposureSel, kztInput, windHeightInput].forEach(el =>
    el.addEventListener('input', updateQzPreview));
  updateQzPreview();

  // -------------------------------------------------------------------------
  // Calculate button
  // -------------------------------------------------------------------------
  calcBtn.addEventListener('click', () => {
    const D = parseFloat(deadLoadInput.value);
    if (!Number.isFinite(D) || D <= 0) {
      showAlertModal('Enter a positive dead load (lbs/ft).');
      return;
    }

    // --- Seismic ---
    const sds = parseFloat(sdsInput.value);
    const sd1 = parseFloat(sd1Input.value);
    const rc  = riskCatSel.value;
    const ip  = parseFloat(ipSel.value);
    const z   = parseFloat(trayHeightInput.value);
    const h   = parseFloat(buildingHeightInput.value);
    const wp  = parseFloat(wpInput.value);

    if (!Number.isFinite(sds) || sds < 0) {
      showAlertModal('Enter a valid S\u1D05\u209B value (≥ 0 g), or set to 0 for no seismic load.');
      return;
    }
    if (!Number.isFinite(sd1) || sd1 < 0) {
      showAlertModal('Enter a valid S\u1D05\u2081 value (≥ 0 g), or set to 0 for no seismic load.');
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
      showAlertModal('Enter a positive tray + cable operating weight per foot (lbs/ft).');
      return;
    }

    // --- Wind ---
    const V        = parseFloat(windSpeedInput.value);
    const exposure = exposureSel.value;
    const z_ft     = parseFloat(windHeightInput.value);
    const K_zt     = parseFloat(kztInput.value) || 1.0;
    const width_in = parseFloat(trayWidthInput.value);
    const fill     = fillLevelSel.value;

    if (!Number.isFinite(V) || V <= 0) {
      showAlertModal('Enter a positive basic wind speed (mph), or set to 0 to skip wind.');
      return;
    }
    if (!Number.isFinite(z_ft) || z_ft < 0) {
      showAlertModal('Wind analysis installation height must be ≥ 0 ft.');
      return;
    }
    if (!Number.isFinite(width_in) || width_in <= 0) {
      showAlertModal('Enter a positive tray width (inches) for wind analysis.');
      return;
    }

    // --- Snow ---
    const S = parseFloat(snowLoadInput.value) || 0;
    if (!Number.isFinite(S) || S < 0) {
      showAlertModal('Snow load must be ≥ 0 lbs/ft.');
      return;
    }

    // --- Run calculations ---
    let seismicResult = null;
    let windResult    = null;

    try {
      seismicResult = calcBraceForces({ sds, sd1, riskCategory: rc, wp, z, h, ip });
    } catch (err) {
      showAlertModal(`Seismic calculation error: ${err.message}`);
      return;
    }

    try {
      windResult = calcWindForce({ V, z_ft, exposure, trayWidth_in: width_in, spanLength_ft: 10, fillLevel: fill, K_zt });
    } catch (err) {
      showAlertModal(`Wind calculation error: ${err.message}`);
      return;
    }

    const E_lat = seismicResult.lateralForce;
    const E_v   = seismicResult.verticalForce;
    const W     = windResult.windForce_per_ft;

    let evaluation;
    try {
      evaluation = evaluateLoadCombinations({ D_lbs_ft: D, E_lat_lbs_ft: E_lat, E_v_lbs_ft: E_v, W_lbs_ft: W, S_lbs_ft: S });
    } catch (err) {
      showAlertModal(`Load combination error: ${err.message}`);
      return;
    }

    renderResults(evaluation, { sds, sd1, rc, z, h, wp, V, exposure, z_ft, width_in, fill, D, S, seismicResult, windResult });
  });

  // -------------------------------------------------------------------------
  // Render results
  // -------------------------------------------------------------------------
  function renderResults({ combinations, envelope }, params) {
    const { LC_W1, LC_W2, LC_S1, LC_S2 } = combinations;
    const all = [LC_W1, LC_W2, LC_S1, LC_S2];

    function rowClass(combo) {
      if (!combo.applicable) return 'result-na';
      if (envelope && combo.id === envelope.controllingId) return 'result-controlling';
      return '';
    }

    function applicableBadge(combo) {
      if (!combo.applicable) return '<span class="status-badge result-na">N/A</span>';
      if (envelope && combo.id === envelope.controllingId) return '<span class="status-badge result-fail">Controls</span>';
      return '<span class="status-badge result-ok">Applicable</span>';
    }

    const tableRows = all.map(c => `
      <tr class="${rowClass(c)}">
        <td><strong>${esc(c.id)}</strong></td>
        <td><code>${esc(c.formula)}</code></td>
        <td>${c.applicable ? c.vertical_lbs_ft.toFixed(2) : '—'}</td>
        <td>${c.applicable ? c.horizontal_lbs_ft.toFixed(2) : '—'}</td>
        <td>${c.applicable ? c.resultant_lbs_ft.toFixed(2) : '—'}</td>
        <td>${applicableBadge(c)}</td>
      </tr>`).join('');

    const envelopeSection = envelope ? `
      <div class="result-recommendation">
        <strong>Controlling Combination:</strong> ${esc(envelope.controllingId)} — ${esc(envelope.controllingLabel)}<br>
        Design resultant = <strong>${envelope.maxResultant_lbs_ft.toFixed(2)} lbs/ft</strong><br>
        Envelope: max vertical = ${envelope.maxVertical_lbs_ft.toFixed(2)} lbs/ft,
        max horizontal = ${envelope.maxHorizontal_lbs_ft.toFixed(2)} lbs/ft
      </div>` : `
      <div class="result-recommendation">
        No applicable load combinations — all lateral loads are zero.
        Check wind speed and seismic parameters.
      </div>`;

    const seismicRow = params.seismicResult.bracingRequired
      ? `<tr><th scope="row">Seismic (SDC ${esc(params.seismicResult.sdc)})</th>
             <td>${params.seismicResult.lateralForce.toFixed(2)} lbs/ft (lateral) /
                 ±${params.seismicResult.verticalForce.toFixed(2)} lbs/ft (vertical)</td></tr>`
      : `<tr><th scope="row">Seismic (SDC ${esc(params.seismicResult.sdc)})</th>
             <td>Bracing not required; vertical = ±${params.seismicResult.verticalForce.toFixed(2)} lbs/ft</td></tr>`;

    const detailSection = `
      <details class="method-note">
        <summary>Input summary &amp; step-by-step</summary>
        <table class="result-table" aria-label="Input summary">
          <tbody>
            <tr><th scope="row">Dead Load (D)</th><td>${params.D.toFixed(2)} lbs/ft</td></tr>
            ${seismicRow}
            <tr><th scope="row">Wind (W)</th>
                <td>${params.windResult.windForce_per_ft.toFixed(2)} lbs/ft
                (q_z = ${params.windResult.q_z_psf.toFixed(2)} lbs/ft², Cf = ${params.windResult.Cf})</td></tr>
            <tr><th scope="row">Snow (S)</th><td>${params.S.toFixed(2)} lbs/ft</td></tr>
          </tbody>
        </table>
        <p>Load factors per ASCE 7-22 §2.3.2. Seismic forces per §13.3.1.
        Wind forces per §26.10-1 and §29.4. For cable tray, L (live), Lr (roof live),
        and R (rain) loads are omitted per standard practice.</p>
        ${all.map(c => !c.applicable ? '' : `
        <p><strong>${esc(c.id)} (${esc(c.formula)}):</strong><br>
          Vertical = ${c.vertical_lbs_ft.toFixed(2)} lbs/ft,
          Horizontal = ${c.horizontal_lbs_ft.toFixed(2)} lbs/ft,
          Resultant = ${c.resultant_lbs_ft.toFixed(2)} lbs/ft</p>`).join('')}
      </details>`;

    resultsDiv.innerHTML = `
      <div class="result-card${envelope ? ' result-ok' : ''}" role="status" aria-live="polite">
        <h2>LRFD Load Combinations — ASCE 7-22 §2.3.2</h2>
        <table class="result-table" aria-label="Load combination results">
          <thead>
            <tr>
              <th scope="col">Combo</th>
              <th scope="col">Formula</th>
              <th scope="col">Vertical (lbs/ft)</th>
              <th scope="col">Horizontal (lbs/ft)</th>
              <th scope="col">Resultant (lbs/ft)</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        ${envelopeSection}
        ${detailSection}
        <p class="method-note">Per ASCE 7-22 §2.3.2 LRFD Load Combinations.
        N/A = combination not applicable (key lateral load is zero).</p>
      </div>`;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
