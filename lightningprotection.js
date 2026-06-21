import {
  runLightningProtection,
  LOCATION_FACTORS,
} from './analysis/lightningProtection.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { initStudyBasisPanel } from './src/components/studyBasis.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyBasisPanel('lightningProtection', {
    standard: 'IEC 62305-1/-2/-3 (lightning protection); IEEE Std 998 (substation shielding); IEEE C62.22 (arresters)',
    clause: 'Risk-based LPL selection, rolling-sphere protective radius, and surge-arrester MCOV',
    formulas: [
      'Ng = 0.04 · Td^1.25  — ground flash density (per km²/yr)',
      'Ad = L·W + 2·(3H)(L+W) + π·(3H)²  — collection area',
      'Nd = Ng · Ad · Cd · 1e-6  — expected direct strikes/yr',
      'Efficiency E = 1 − Nc/Nd → LPL I/II/III/IV',
      'rp = √(h(2R−h)) − √(hx(2R−hx))  — single-mast protective radius',
      'Uc ≥ 1.05·VLL/√3 (solid) or 1.05·VLL (ungrounded)  — arrester MCOV',
    ],
    assumptions: [
      'Isolated rectangular structure collection area (IEC 62305-2 Annex A)',
      'IEC 61024-1 protection-efficiency table for LPL selection',
      'Electrogeometric / rolling-sphere model for protective radius',
    ],
    limitations: [
      'Screening-level: simplified single-component risk, not the full R1–R4 assessment',
      'Single-mast protection only (no multi-mast or shield-wire optimisation)',
      'Verify against a full IEC 62305-2 risk study before final design',
    ],
  });

  initStudyApprovalPanel('lightningProtection');

  const form       = document.getElementById('lp-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv  = document.getElementById('calc-errors');
  const exportBtn  = document.getElementById('export-csv-btn');
  const ngModeSel  = document.getElementById('ng-mode');

  // Toggle Td vs direct-Ng inputs
  function syncNgMode() {
    const direct = ngModeSel.value === 'direct';
    document.getElementById('row-td').hidden = direct;
    document.getElementById('row-ng').hidden = !direct;
  }
  ngModeSel.addEventListener('change', syncNgMode);
  syncNgMode();

  const saved = getStudies().lightningProtection;
  if (saved && saved.inputs) {
    restoreForm(saved.inputs);
    renderResults(saved);
    exportBtn.hidden = false;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const runBtn = document.getElementById('run-btn');
    runBtn.disabled = true;
    runBtn.textContent = 'Assessing…';

    let result;
    try {
      const num = id => parseFloat(document.getElementById(id).value);
      const config = {
        length: num('length'),
        width: num('width'),
        height: num('height'),
        location: document.getElementById('location').value,
        tolerableFrequency: num('nc'),
        protectedHeight: num('protected-height'),
        downConductorMaterial: document.getElementById('down-material').value,
      };
      if (ngModeSel.value === 'direct') config.groundFlashDensity = num('ng');
      else config.thunderstormDays = num('td');

      const kv = num('system-kv');
      if (Number.isFinite(kv) && kv > 0) {
        config.systemKvLL = kv;
        config.grounding = document.getElementById('grounding').value;
      }
      result = runLightningProtection(config);
      result.inputs._formState = { ngMode: ngModeSel.value };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run the lightning study.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      runBtn.disabled = false;
      runBtn.textContent = 'Run Lightning Assessment';
      return;
    }

    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.lightningProtection = result;
    setStudies(studies);

    renderResults(result);
    exportBtn.hidden = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Run Lightning Assessment';
  });

  exportBtn.addEventListener('click', () => {
    const s = getStudies().lightningProtection;
    if (s) download('lightning-protection.csv', resultToCsv(s), 'text/csv');
  });

  function restoreForm(inputs) {
    if (!inputs) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('length', inputs.length); set('width', inputs.width); set('height', inputs.height);
    set('location', inputs.location); set('nc', inputs.tolerableFrequency);
    set('protected-height', inputs.protectedHeight); set('down-material', inputs.downConductorMaterial);
    if (Number.isFinite(inputs.systemKvLL)) { set('system-kv', inputs.systemKvLL); set('grounding', inputs.grounding); }
    if (inputs._formState && inputs._formState.ngMode) { ngModeSel.value = inputs._formState.ngMode; }
    syncNgMode();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  function renderResults(r) {
    const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const sci = x => (Number.isFinite(x) ? x.toExponential(2) : '—');
    const lplClass = r.lpl.required ? 'result-warn' : 'result-ok';

    const arresterHtml = r.arrester ? `
      <div class="result-group">
        <h3>Surge Arrester (IEEE C62.22 / IEC 60099-5)</h3>
        <div class="table-scroll">
          <table class="data-table" aria-label="Surge arrester selection">
            <thead><tr><th>System (kV L-L)</th><th>Grounding</th><th>Min MCOV (kV)</th><th>Rated required (kV)</th><th>Standard rating (kV)</th></tr></thead>
            <tbody><tr>
              <td>${f(r.arrester.systemKvLL, 1)}</td>
              <td>${escapeHtml(r.arrester.grounding)}</td>
              <td>${f(r.arrester.mcov, 2)}</td>
              <td>${f(r.arrester.ratedRequired, 2)}</td>
              <td><strong>${r.arrester.ratedStandard != null ? f(r.arrester.ratedStandard, 0) : '—'}</strong></td>
            </tr></tbody>
          </table>
        </div>
      </div>` : '';

    const warningHtml = r.warnings.length
      ? `<ul class="drc-findings">${r.warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escapeHtml(w)}</span></li>`).join('')}</ul>`
      : '<p class="field-hint">No warnings.</p>';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Lightning Protection Results</h2>

        <div class="result-group">
          <h3>Risk Assessment</h3>
          <div class="result-cards">
            <div class="result-card">
              <div class="result-card-label">Ground flash density</div>
              <div class="result-card-value">${f(r.groundFlashDensity, 2)}</div>
              <div class="result-card-sub">flashes/km²/yr</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Expected strikes</div>
              <div class="result-card-value">${sci(r.expectedStrikesPerYear)}</div>
              <div class="result-card-sub">Nd /yr · area ${f(r.collectionAreaM2, 0)} m²</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Required LPL</div>
              <div class="result-card-value ${lplClass}">${r.lpl.level ? r.lpl.level : 'None'}</div>
              <div class="result-card-sub">${r.lpl.required ? `efficiency ${f(r.lpl.efficiency * 100, 1)}%` : 'LPS not required'}</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Rolling sphere</div>
              <div class="result-card-value">${f(r.rollingSphereRadius, 0)}</div>
              <div class="result-card-sub">m radius · captures ≥ ${f(r.minStrikeCurrentKa, 0)} kA</div>
            </div>
          </div>
          <p class="field-hint">${escapeHtml(r.lpl.note)}</p>
        </div>

        <div class="result-group">
          <h3>Air Termination &amp; Down-Conductors</h3>
          <div class="table-scroll">
            <table class="data-table" aria-label="Lightning protection system sizing">
              <tbody>
                <tr><th scope="row">Single-mast protective radius</th><td>${f(r.mastProtectiveRadiusM, 2)} m (at ${f(r.inputs.protectedHeight, 1)} m object height)</td></tr>
                <tr><th scope="row">Minimum striking distance</th><td>${f(r.minStrikeDistanceM, 1)} m</td></tr>
                <tr><th scope="row">Structure perimeter</th><td>${f(r.perimeterM, 1)} m</td></tr>
                <tr><th scope="row">Down-conductors</th><td>${r.downConductorCount} (${escapeHtml(r.downConductorMaterial)}, min ${r.downConductorMinAreaMm2} mm²)</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        ${arresterHtml}

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningHtml}
        </div>
      </section>`;
  }

  // -------------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------------
  function resultToCsv(r) {
    const lines = [];
    lines.push('# Lightning & Surge Protection Assessment');
    lines.push(`Ground flash density (per km2/yr),${r.groundFlashDensity.toFixed(3)}`);
    lines.push(`Collection area (m2),${r.collectionAreaM2.toFixed(1)}`);
    lines.push(`Location factor Cd,${r.locationFactor}`);
    lines.push(`Expected strikes Nd (per yr),${r.expectedStrikesPerYear.toExponential(3)}`);
    lines.push(`Tolerable frequency Nc (per yr),${r.tolerableFrequency.toExponential(3)}`);
    lines.push(`Required LPL,${r.lpl.level || 'none'}`);
    lines.push(`Protection efficiency,${(r.lpl.efficiency * 100).toFixed(2)}%`);
    lines.push(`Rolling sphere radius (m),${r.rollingSphereRadius}`);
    lines.push(`Single-mast protective radius (m),${r.mastProtectiveRadiusM.toFixed(2)}`);
    lines.push(`Down-conductors,${r.downConductorCount}`);
    lines.push(`Down-conductor min area (mm2),${r.downConductorMinAreaMm2}`);
    if (r.arrester) {
      lines.push(`Arrester MCOV (kV),${r.arrester.mcov.toFixed(2)}`);
      lines.push(`Arrester rated standard (kV),${r.arrester.ratedStandard ?? 'n/a'}`);
    }
    return lines.join('\n');
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  void LOCATION_FACTORS;
});
