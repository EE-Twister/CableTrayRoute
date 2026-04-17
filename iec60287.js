import {
  calcAmpacity,
  defaultInsulThickMm,
  MAX_TEMP_C,
} from './analysis/iec60287.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('iec60287-form');
  const resultsDiv = document.getElementById('results');
  const installMethodSel = document.getElementById('install-method');
  const burialFields = document.getElementById('burial-fields');
  const conduitFields = document.getElementById('conduit-fields');
  const useDefaultThickBtn = document.getElementById('use-default-thick-btn');
  const voltageClassSel = document.getElementById('voltage-class');
  const sizeMm2Sel = document.getElementById('size-mm2');
  const insulThickInput = document.getElementById('insul-thick-mm');

  initStudyApprovalPanel('iec60287');

  // --- Restore previous results ---
  const saved = getStudies().iec60287;
  if (saved) {
    restoreForm(saved);
    renderResults(saved);
  }

  // --- Show/hide burial / conduit fields based on installation method ---
  installMethodSel.addEventListener('change', updateInstallFields);
  updateInstallFields();

  function updateInstallFields() {
    const method = installMethodSel.value;
    burialFields.classList.toggle('hidden', method === 'tray' || method === 'air');
    conduitFields.classList.toggle('hidden', method !== 'conduit');
  }

  // --- Default insulation thickness lookup ---
  useDefaultThickBtn.addEventListener('click', () => {
    const size = parseFloat(sizeMm2Sel.value);
    const vc = voltageClassSel.value;
    try {
      const t = defaultInsulThickMm(size, vc);
      insulThickInput.value = t;
    } catch (err) {
      showModal('Lookup Error', `<p>${escHtml(err.message)}</p>`, 'error');
    }
  });

  // Auto-update thickness when size or voltage class changes
  sizeMm2Sel.addEventListener('change', tryUpdateDefaultThickness);
  voltageClassSel.addEventListener('change', tryUpdateDefaultThickness);

  function tryUpdateDefaultThickness() {
    try {
      const t = defaultInsulThickMm(parseFloat(sizeMm2Sel.value), voltageClassSel.value);
      insulThickInput.value = t;
    } catch (_) { /* ignore — user may have an out-of-range combination */ }
  }

  // --- Form submission ---
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      result = calcAmpacity(inputs);
    } catch (err) {
      showModal('Calculation Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }

    // Persist result
    const studies = getStudies();
    studies.iec60287 = result;
    setStudies(studies);

    renderResults(result);
  });

  // --------------------------------------------------------------------------

  function readFormInputs() {
    const get = id => document.getElementById(id);
    const getFloat = id => parseFloat(get(id).value);

    const sizeMm2 = parseFloat(get('size-mm2').value);
    const material = get('material').value;
    const insulation = get('insulation').value;
    const insulThickMm = getFloat('insul-thick-mm');
    const outerSheathMm = getFloat('outer-sheath-mm');
    const nCores = parseInt(get('n-cores').value, 10);
    const armoured = get('armoured').checked;
    const installMethod = get('install-method').value;
    const burialDepthMm = getFloat('burial-depth-mm') || 800;
    const soilResistivity = getFloat('soil-resistivity') || 1.0;
    const conduitOD_mm = getFloat('conduit-od-mm') || 0;
    const ambientTempC = getFloat('ambient-temp-c');
    const frequencyHz = parseInt(get('frequency-hz').value, 10);
    const U0_kV = getFloat('u0-kv') || 0;
    const nCables = parseInt(get('n-cables').value, 10) || 1;
    const groupArrangement = get('group-arrangement').value;

    if (!Number.isFinite(insulThickMm) || insulThickMm <= 0) {
      showModal('Input Error', '<p>Insulation wall thickness must be greater than 0 mm. Use the <strong>Use Default Thickness</strong> button to populate a standard value.</p>', 'error');
      return null;
    }
    if (!Number.isFinite(ambientTempC)) {
      showModal('Input Error', '<p>Ambient temperature (°C) is required.</p>', 'error');
      return null;
    }
    const thetaMax = MAX_TEMP_C[insulation] ?? 90;
    if (ambientTempC >= thetaMax) {
      showModal('Input Error', `<p>Ambient temperature (${ambientTempC} °C) must be less than the maximum conductor temperature (${thetaMax} °C for ${insulation}).</p>`, 'error');
      return null;
    }

    return {
      sizeMm2, material, insulation, insulThickMm,
      outerSheathMm: Number.isFinite(outerSheathMm) ? outerSheathMm : 3,
      nCores, armoured, installMethod,
      burialDepthMm, soilResistivity, conduitOD_mm,
      ambientTempC, frequencyHz, U0_kV, nCables, groupArrangement,
    };
  }

  function restoreForm(r) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val != null) el.value = val;
    };
    set('size-mm2', r.sizeMm2);
    set('material', r.material);
    set('insulation', r.insulation);
    set('insul-thick-mm', r.insulThickMm);
    set('install-method', r.installMethod);
    set('burial-depth-mm', r.burialDepthMm);
    set('soil-resistivity', r.soilResistivity);
    set('ambient-temp-c', r.ambientTempC);
    set('frequency-hz', r.frequencyHz);
    set('u0-kv', r.U0_kV);
    set('n-cables', r.nCables);
    set('group-arrangement', r.groupArrangement);
    if (document.getElementById('armoured') && r.armoured != null) {
      document.getElementById('armoured').checked = r.armoured;
    }
    updateInstallFields();
  }

  function renderResults(r) {
    resultsDiv.innerHTML = '';

    const installLabels = {
      'direct-burial': 'Direct burial',
      'conduit': 'In conduit (buried)',
      'tray': 'Cable tray (air)',
      'air': 'Free air',
    };

    const warningsHtml = r.warnings && r.warnings.length
      ? `<ul class="drc-findings">
           ${r.warnings.map(w =>
             `<li class="drc-finding drc-warn"><span class="drc-msg">${escHtml(w)}</span></li>`
           ).join('')}
         </ul>`
      : '';

    const groupingHtml = r.nCables > 1
      ? `<div class="result-row">
           <span class="result-label">Number of cables in group</span>
           <span class="result-value">${r.nCables} (${r.groupArrangement})</span>
         </div>
         <div class="result-row">
           <span class="result-label">Grouping derating factor</span>
           <span class="result-value">${r.f_group}</span>
         </div>
         <div class="result-row">
           <span class="result-label">Ungrouped rating (single cable)</span>
           <span class="result-value">${r.I_base} A</span>
         </div>`
      : '';

    const dielectricHtml = r.W_d > 0
      ? `<div class="result-row">
           <span class="result-label">Dielectric losses W_d</span>
           <span class="result-value">${(r.W_d * 1000).toFixed(4)} mW/m</span>
         </div>`
      : '';

    const tr = r.thermalResistances;

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">IEC 60287 Ampacity Results</h2>

        <div class="result-group">
          <h3>Current Rating</h3>
          <div class="result-row result-row--primary">
            <span class="result-label"><strong>Rated current I</strong></span>
            <span class="result-value result-value--large"><strong>${r.I_rated} A</strong></span>
          </div>
          ${groupingHtml}
          <p class="field-hint">
            ${r.sizeMm2} mm² ${r.material} — ${r.insulation} (${r.thetaMax} °C max) —
            ${escHtml(installLabels[r.installMethod] || r.installMethod)} —
            ${r.ambientTempC} °C ambient — ${r.frequencyHz} Hz
          </p>
          <p class="field-hint">
            Temperature budget: Δθ = ${r.thetaMax} − ${r.ambientTempC} = <strong>${r.deltaTheta} K</strong>
            &nbsp;|&nbsp; Conductor at rated current: <strong>${r.thetaConductorActual} °C</strong>
          </p>
        </div>

        <div class="result-group">
          <h3>Conductor Properties</h3>
          <div class="result-row">
            <span class="result-label">DC resistance at 20 °C  R₂₀</span>
            <span class="result-value">${(r.R_dc20 * 1000).toFixed(4)} mΩ/m</span>
          </div>
          <div class="result-row">
            <span class="result-label">DC resistance at ${r.thetaMax} °C  R_dc_θ</span>
            <span class="result-value">${(r.R_dcTheta * 1000).toFixed(4)} mΩ/m</span>
          </div>
          <div class="result-row">
            <span class="result-label">AC resistance (with y_s + y_p)  R_ac</span>
            <span class="result-value">${(r.R_ac * 1000).toFixed(4)} mΩ/m</span>
          </div>
          <div class="result-row">
            <span class="result-label">Skin effect coefficient y_s</span>
            <span class="result-value">${r.ys}</span>
          </div>
          <div class="result-row">
            <span class="result-label">Proximity effect coefficient y_p</span>
            <span class="result-value">${r.yp}</span>
          </div>
          <div class="result-row">
            <span class="result-label">Cable outer diameter D_e</span>
            <span class="result-value">${r.D_e_mm} mm</span>
          </div>
          ${dielectricHtml}
        </div>

        <div class="result-group">
          <h3>Thermal Circuit</h3>
          <table class="data-table" aria-label="Thermal resistance breakdown">
            <thead>
              <tr>
                <th>Component</th>
                <th>Symbol</th>
                <th>Value (K·m/W)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Insulation (per core)</td>
                <td><em>T</em>₁</td>
                <td>${tr.T1}</td>
              </tr>
              <tr>
                <td>Bedding / filler</td>
                <td><em>T</em>₂</td>
                <td>${tr.T2}</td>
              </tr>
              <tr>
                <td>Outer sheath</td>
                <td><em>T</em>₃</td>
                <td>${tr.T3}</td>
              </tr>
              <tr>
                <td>External (${escHtml(installLabels[r.installMethod] || r.installMethod)})</td>
                <td><em>T</em>₄</td>
                <td>${tr.T4}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2"><strong>Total (n·T₂ + n·(T₃+T₄))</strong></td>
                <td><strong>${(tr.T1 + 3 * tr.T2 + 3 * (tr.T3 + tr.T4)).toFixed(4)}</strong></td>
              </tr>
            </tfoot>
          </table>
          <div class="result-row">
            <span class="result-label">Sheath loss factor λ₁</span>
            <span class="result-value">${r.lossFactors.lambda1}</span>
          </div>
          <div class="result-row">
            <span class="result-label">Armour loss factor λ₂</span>
            <span class="result-value">${r.lossFactors.lambda2}</span>
          </div>
        </div>

        ${warningsHtml}

      </section>`;
  }
});
