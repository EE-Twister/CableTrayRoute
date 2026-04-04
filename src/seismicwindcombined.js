import { calcSeismicWindCombined, evaluateTraysCombined } from './analysis/seismicWindCombined.mjs';
import { calcSeismicDesignCategory, maxBraceSpacing } from './analysis/seismicBracing.mjs';
import { getTrays, getCables } from './dataStore.mjs';
import { CABLE_WEIGHT_LB_FT } from './analysis/supportSpan.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  // ---- DOM references ----

  const wpInput        = document.getElementById('wp-per-ft');
  const sdsInput       = document.getElementById('sds');
  const sd1Input       = document.getElementById('sd1');
  const riskCatSel     = document.getElementById('risk-category');
  const ipSel          = document.getElementById('ip');
  const zInput         = document.getElementById('z-ft');
  const hInput         = document.getElementById('h-ft');
  const windSpeedInput = document.getElementById('wind-speed');
  const exposureSel    = document.getElementById('wind-exposure');
  const kztInput       = document.getElementById('k-zt');
  const trayWidthInput = document.getElementById('tray-width');
  const spanInput      = document.getElementById('span-length');
  const fillSel        = document.getElementById('fill-level');
  const snowInput      = document.getElementById('snow-load');
  const singleRadio    = document.getElementById('mode-single');
  const scheduleRadio  = document.getElementById('mode-schedule');
  const calcBtn        = document.getElementById('calc-btn');
  const scheduleBtn    = document.getElementById('schedule-btn');
  const resultsDiv     = document.getElementById('results');
  const schedSection   = document.getElementById('schedule-section');
  const schedResultsDiv= document.getElementById('schedule-results');
  const sdcPreview     = document.getElementById('sdc-preview');

  // ---- Mode toggle ----

  function updateMode() {
    const isSingle = singleRadio.checked;
    schedSection.hidden = isSingle;
    resultsDiv.innerHTML = '';
    schedResultsDiv.innerHTML = '';
  }
  singleRadio.addEventListener('change', updateMode);
  scheduleRadio.addEventListener('change', updateMode);
  updateMode();

  // ---- Live SDC preview ----

  function updateSdcPreview() {
    const sds = parseFloat(sdsInput.value);
    const sd1 = parseFloat(sd1Input.value);
    const rc  = riskCatSel.value;
    if (!Number.isFinite(sds) || !Number.isFinite(sd1)) return;
    const sdc = calcSeismicDesignCategory(sds, sd1, rc);
    const spacing = maxBraceSpacing(sdc);
    if (spacing.required) {
      sdcPreview.textContent =
        `SDC ${sdc} — bracing required: lateral ≤ ${spacing.lateral} ft, ` +
        `longitudinal ≤ ${spacing.longitudinal} ft.`;
    } else {
      sdcPreview.textContent = `SDC ${sdc} — seismic bracing not required by ASCE 7.`;
    }
    sdcPreview.dataset.sdc = sdc;
  }
  [sdsInput, sd1Input, riskCatSel].forEach(el => el.addEventListener('input', updateSdcPreview));
  updateSdcPreview();

  // ---- Helpers ----

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readParams() {
    return {
      wp_lbs_ft:     parseFloat(wpInput.value),
      z_ft:          parseFloat(zInput.value),
      h_ft:          parseFloat(hInput.value),
      spanLength_ft: parseFloat(spanInput.value),
      trayWidth_in:  parseFloat(trayWidthInput.value),
      sds:           parseFloat(sdsInput.value),
      sd1:           parseFloat(sd1Input.value),
      riskCategory:  riskCatSel.value,
      ip:            parseFloat(ipSel.value),
      windSpeed_mph: parseFloat(windSpeedInput.value) || 0,
      windExposure:  exposureSel.value,
      K_zt:          parseFloat(kztInput.value) || 1.0,
      fillLevel:     fillSel.value,
      snowLoad_lbs_ft: parseFloat(snowInput.value) || 0,
    };
  }

  // ---- Single-tray calculation ----

  calcBtn.addEventListener('click', () => {
    const params = readParams();

    if (!Number.isFinite(params.sds) || params.sds < 0) {
      showAlertModal('Enter a valid S\u1D05\u209B value (≥ 0 g).');
      return;
    }
    if (!Number.isFinite(params.sd1) || params.sd1 < 0) {
      showAlertModal('Enter a valid S\u1D05\u2081 value (≥ 0 g).');
      return;
    }
    if (!Number.isFinite(params.z_ft) || params.z_ft < 0) {
      showAlertModal('Tray attachment height z must be ≥ 0 ft.');
      return;
    }
    if (!Number.isFinite(params.h_ft) || params.h_ft <= 0) {
      showAlertModal('Average roof height h must be a positive number.');
      return;
    }
    if (params.z_ft > params.h_ft) {
      showAlertModal('Tray attachment height z cannot exceed roof height h.');
      return;
    }
    if (!Number.isFinite(params.wp_lbs_ft) || params.wp_lbs_ft <= 0) {
      showAlertModal('Enter a positive tray + cable weight per foot (lbs/ft).');
      return;
    }
    if (!Number.isFinite(params.spanLength_ft) || params.spanLength_ft <= 0) {
      showAlertModal('Enter a positive span length (ft).');
      return;
    }
    if (!Number.isFinite(params.trayWidth_in) || params.trayWidth_in <= 0) {
      showAlertModal('Enter a positive tray width (in).');
      return;
    }

    let result;
    try {
      result = calcSeismicWindCombined(params);
    } catch (err) {
      showAlertModal(`Calculation error: ${err.message}`);
      return;
    }

    renderSingleResult(result, params);
  });

  // ---- Render single result ----

  function lcRowClass(lc, governingId) {
    if (!lc.applicable) return 'lc-na';
    if (lc.id === governingId) return 'lc-governing';
    return '';
  }

  function renderSingleResult(r, params) {
    const s = r.seismicDetail;
    const w = r.windDetail;
    const governingId = r.envelope?.controllingId ?? null;

    const comboRows = [r.combinations.LC_W1, r.combinations.LC_W2,
                       r.combinations.LC_S1, r.combinations.LC_S2].map(lc => {
      const cls      = lcRowClass(lc, governingId);
      const na       = !lc.applicable;
      const govMark  = lc.id === governingId ? ' ★' : '';
      return `<tr class="${esc(cls)}">
        <td><strong>${esc(lc.id)}${esc(govMark)}</strong></td>
        <td>${esc(lc.formula)}</td>
        <td>${na ? 'N/A' : esc(lc.vertical_lbs_ft.toFixed(2))}</td>
        <td>${na ? 'N/A' : esc(lc.horizontal_lbs_ft.toFixed(2))}</td>
        <td>${na ? 'N/A' : esc(lc.resultant_lbs_ft.toFixed(2))}</td>
      </tr>`;
    }).join('');

    const envCard = r.envelope ? `
      <div class="result-card result-ok" role="status">
        <h3>Governing Combination: ${esc(r.envelope.controllingId)}</h3>
        <table class="result-table">
          <tbody>
            <tr><th scope="row">Controlling LC</th>
                <td>${esc(r.envelope.controllingLabel)}</td></tr>
            <tr><th scope="row">Max Resultant</th>
                <td><strong>${r.envelope.maxResultant_lbs_ft.toFixed(2)} lbs/ft</strong></td></tr>
            <tr><th scope="row">Envelope Vertical</th>
                <td>${r.envelope.maxVertical_lbs_ft.toFixed(2)} lbs/ft</td></tr>
            <tr><th scope="row">Envelope Horizontal</th>
                <td>${r.envelope.maxHorizontal_lbs_ft.toFixed(2)} lbs/ft</td></tr>
          </tbody>
        </table>
        <p class="result-recommendation">${esc(r.envelope.recommendation)}</p>
      </div>` : '<p>No applicable load combinations (all loads are zero).</p>';

    const windNote = params.windSpeed_mph === 0
      ? '<p class="field-hint">Wind speed = 0: LC-W1 and LC-W2 are not applicable (sheltered/indoor).</p>'
      : '';

    const seismicNote = !s.bracingRequired
      ? `<p class="field-hint">SDC ${esc(s.sdc)}: seismic bracing not required. LC-S1 and LC-S2 have near-zero E terms.</p>`
      : '';

    resultsDiv.innerHTML = `
      <h2>Combined Load Results</h2>

      ${windNote}${seismicNote}

      <section aria-label="Component forces">
        <h3>Component Forces</h3>
        <table class="result-table" aria-label="Seismic and wind force summary">
          <thead>
            <tr><th>Load</th><th>Force per Linear Foot</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr><td>Dead load D</td>
                <td>${r.wp_lbs_ft.toFixed(2)} lbs/ft</td>
                <td>Input</td></tr>
            <tr><td>Seismic lateral E</td>
                <td>${s.lateralForce.toFixed(2)} lbs/ft</td>
                <td>ASCE 7-22 §13.3.1 (SDC ${esc(s.sdc)})</td></tr>
            <tr><td>Seismic vertical E<sub>v</sub></td>
                <td>±${s.verticalForce.toFixed(2)} lbs/ft</td>
                <td>ASCE 7-22 §12.4.2</td></tr>
            <tr><td>Wind lateral W</td>
                <td>${w.windForce_per_ft.toFixed(2)} lbs/ft</td>
                <td>ASCE 7-22 §29.4 (K<sub>z</sub>${w.Kz.toFixed(3)}, C<sub>f</sub>${w.Cf.toFixed(1)}, G${w.G.toFixed(2)})</td></tr>
            ${r.snowLoad_lbs_ft > 0
              ? `<tr><td>Snow S</td>
                     <td>${r.snowLoad_lbs_ft.toFixed(2)} lbs/ft</td>
                     <td>Input</td></tr>`
              : ''}
          </tbody>
        </table>
      </section>

      <section aria-label="LRFD load combinations">
        <h3>ASCE 7-22 §2.3.2 LRFD Load Combinations</h3>
        <table class="result-table" aria-label="LRFD load combinations">
          <thead>
            <tr>
              <th>ID</th>
              <th>Formula</th>
              <th>Vertical (lbs/ft)</th>
              <th>Horizontal (lbs/ft)</th>
              <th>Resultant (lbs/ft)</th>
            </tr>
          </thead>
          <tbody>${comboRows}</tbody>
        </table>
        <p class="field-hint">★ = governing combination. N/A = combination not applicable
        (lateral load is zero).</p>
      </section>

      ${envCard}

      <details class="method-note">
        <summary>Calculation detail</summary>
        <p><strong>Seismic (ASCE 7-22 §13.3.1):</strong></p>
        <pre>Fp = (0.4 × ap × SDS × Wp) / (Rp / Ip) × (1 + 2z/h)
   = (0.4 × 1.0 × ${params.sds.toFixed(3)} × ${r.wp_lbs_ft.toFixed(2)}) / (2.5 / ${params.ip ?? 1.0}) × (1 + 2×${params.z_ft}/${params.h_ft})
E_lat = ${s.lateralForce.toFixed(2)} lbs/ft
E_v   = ±${s.verticalForce.toFixed(2)} lbs/ft</pre>
        <p><strong>Wind (ASCE 7-22 §29.4):</strong></p>
        <pre>q_z = 0.00256 × Kz × Kzt × V²
    = 0.00256 × ${w.Kz.toFixed(3)} × ${params.K_zt.toFixed(2)} × ${params.windSpeed_mph}²
    = ${w.q_z_psf.toFixed(3)} lbs/ft²
W   = q_z × G × Cf × width = ${w.windForce_per_ft.toFixed(2)} lbs/ft</pre>
        <p><strong>LRFD combinations (ASCE 7-22 §2.3.2):</strong></p>
        <pre>LC-W1 vertical   = 1.2 × ${r.wp_lbs_ft.toFixed(2)} = ${r.combinations.LC_W1.vertical_lbs_ft.toFixed(2)} lbs/ft
LC-W1 horizontal = 1.6 × ${w.windForce_per_ft.toFixed(2)} = ${r.combinations.LC_W1.horizontal_lbs_ft.toFixed(2)} lbs/ft
LC-S1 vertical   = 1.2 × ${r.wp_lbs_ft.toFixed(2)} + ${s.verticalForce.toFixed(2)} + 0.2 × ${r.snowLoad_lbs_ft.toFixed(2)} = ${r.combinations.LC_S1.vertical_lbs_ft.toFixed(2)} lbs/ft
LC-S1 horizontal = 1.0 × ${s.lateralForce.toFixed(2)} = ${r.combinations.LC_S1.horizontal_lbs_ft.toFixed(2)} lbs/ft</pre>
      </details>`;
  }

  // ---- Schedule mode ----

  scheduleBtn.addEventListener('click', () => {
    const trays  = getTrays();
    const cables = getCables();

    if (!trays.length) {
      showAlertModal('No trays found in the Raceway Schedule. Please add trays first.');
      return;
    }

    const siteParams = readParams();

    if (!Number.isFinite(siteParams.sds) || !Number.isFinite(siteParams.sd1)) {
      showAlertModal('Please fill in valid S\u1D05\u209B and S\u1D05\u2081 values.');
      return;
    }
    if (!Number.isFinite(siteParams.z_ft) || !Number.isFinite(siteParams.h_ft) || siteParams.h_ft <= 0) {
      showAlertModal('Please fill in valid height parameters.');
      return;
    }
    if (siteParams.z_ft > siteParams.h_ft) {
      showAlertModal('Tray attachment height z cannot exceed roof height h.');
      return;
    }

    // Compute cable weight per tray
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

    const trayEntries = trays.map(tray => {
      const selfWeight = 2 + (parseFloat(tray.inside_width) || 12) * 0.05;
      const wp_per_ft  = (trayWeightMap[tray.tray_id] || 0) + selfWeight;
      const trayWidth_in = parseFloat(tray.inside_width) || siteParams.trayWidth_in;
      return { tray_id: tray.tray_id, wp_per_ft, trayWidth_in };
    });

    let rows;
    try {
      rows = evaluateTraysCombined(trayEntries, siteParams);
    } catch (err) {
      showAlertModal(`Calculation error: ${err.message}`);
      return;
    }

    renderScheduleResults(rows);
  });

  function renderScheduleResults(rows) {
    if (!rows.length) {
      schedResultsDiv.innerHTML = '<p>No trays to display.</p>';
      return;
    }

    const tableRows = rows.map(({ tray_id, result: r }) => {
      const s   = r.seismicDetail;
      const env = r.envelope;
      const rowClass = env
        ? (env.controllingId.startsWith('LC-S') ? 'result-fail' : '')
        : '';
      return `<tr class="${rowClass}">
        <td>${esc(tray_id)}</td>
        <td>${r.wp_lbs_ft.toFixed(2)}</td>
        <td>${esc(s.sdc)}${s.bracingRequired ? '' : ' (no bracing req.)'}</td>
        <td>${r.windDetail.windForce_per_ft.toFixed(2)}</td>
        <td>${s.lateralForce.toFixed(2)}</td>
        <td>${env ? esc(env.controllingId) : '—'}</td>
        <td>${env ? env.maxResultant_lbs_ft.toFixed(2) : '—'}</td>
      </tr>`;
    }).join('');

    schedResultsDiv.innerHTML = `
      <table class="result-table" aria-label="Schedule combined load results">
        <thead>
          <tr>
            <th>Tray ID</th>
            <th>W<sub>p</sub> (lbs/ft)</th>
            <th>SDC</th>
            <th>Wind W (lbs/ft)</th>
            <th>Seismic E (lbs/ft)</th>
            <th>Governing LC</th>
            <th>Resultant (lbs/ft)</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p class="field-hint">Rows highlighted where the seismic combination (LC-S1/S2) governs.</p>`;
  }
});
