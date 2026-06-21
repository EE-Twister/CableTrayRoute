import {
  runSagTension,
  CONDUCTOR_LIBRARY,
  NESC_DISTRICTS,
} from './analysis/sagTension.mjs';
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

  initStudyBasisPanel('sagTension', {
    standard: 'IEEE Std 524 (overhead conductor installation); NESC (IEEE C2) §250 loading districts',
    clause: 'Parabolic/catenary sag-tension with ruling-span averaging and change-of-state thermal/elastic equation',
    formulas: [
      'Ruling span = √(Σ Sᵢ³ / Σ Sᵢ)',
      'Parabolic sag D = w·S² / (8·H)',
      'Catenary sag D = (H/w)·(cosh(w·S/2H) − 1)',
      'Change of state: H₂²[H₂ − H₁ + αEA(t₂−t₁) + EAw₁²S²/24H₁²] = EAw₂²S²/24',
    ],
    assumptions: [
      'Level spans; ruling span governs the tension shared across the section',
      'Final modulus (no separate initial/creep curve)',
      'NESC radial ice density 57 lb/ft³ and district load adders',
    ],
    limitations: [
      'Screening-level: no inclined spans, galloping, or aeolian-vibration limits',
      'Single conductor type per run; verify against the manufacturer sag-tension chart',
      'Stringing table is for the bare (unloaded) conductor',
    ],
  });

  initStudyApprovalPanel('sagTension');

  const form         = document.getElementById('st-form');
  const conductorSel = document.getElementById('conductor');
  const resultsDiv   = document.getElementById('results');
  const errorsDiv    = document.getElementById('calc-errors');
  const exportBtn    = document.getElementById('export-csv-btn');

  // Populate conductor library
  conductorSel.innerHTML = CONDUCTOR_LIBRARY.map((c, i) =>
    `<option value="${i}">${escapeHtml(c.name)}</option>`).join('');

  // Restore saved run
  const saved = getStudies().sagTension;
  if (saved && saved.inputs) {
    restoreForm(saved.inputs);
    renderResults(saved);
    exportBtn.hidden = false;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const runBtn = document.getElementById('run-btn');
    runBtn.disabled = true;
    runBtn.textContent = 'Calculating…';

    let result;
    try {
      const conductor = CONDUCTOR_LIBRARY[parseInt(conductorSel.value, 10)] || CONDUCTOR_LIBRARY[0];
      const spans = (document.getElementById('spans').value || '')
        .split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0);
      if (spans.length === 0) throw new Error('Enter one or more positive span lengths (ft).');
      const config = {
        conductor,
        spans,
        district: document.getElementById('district').value,
        designTensionPct: parseFloat(document.getElementById('design-pct').value),
        stringingTemps: {
          min: parseFloat(document.getElementById('temp-min').value),
          max: parseFloat(document.getElementById('temp-max').value),
          step: parseFloat(document.getElementById('temp-step').value),
        },
      };
      result = runSagTension(config);
      result.inputs._formState = {
        conductorIndex: conductorSel.value,
        spans: document.getElementById('spans').value,
        district: config.district,
        designTensionPct: config.designTensionPct,
        stringingTemps: config.stringingTemps,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run the sag-tension study.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      runBtn.disabled = false;
      runBtn.textContent = 'Run Sag-Tension';
      return;
    }

    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.sagTension = result;
    setStudies(studies);

    renderResults(result);
    exportBtn.hidden = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Run Sag-Tension';
  });

  exportBtn.addEventListener('click', () => {
    const s = getStudies().sagTension;
    if (s) download('sag-tension-stringing.csv', resultToCsv(s), 'text/csv');
  });

  function restoreForm(inputs) {
    const fs = inputs && inputs._formState;
    if (!fs) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('conductor', fs.conductorIndex);
    set('spans', fs.spans);
    set('district', fs.district);
    set('design-pct', fs.designTensionPct);
    if (fs.stringingTemps) {
      set('temp-min', fs.stringingTemps.min);
      set('temp-max', fs.stringingTemps.max);
      set('temp-step', fs.stringingTemps.step);
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  function renderResults(result) {
    const {
      rulingSpan, district, loading, designTensionLb, designTensionPctUts,
      designSagFt, designSupportTensionLb, loadingCases, stringingTable, warnings,
    } = result;
    const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

    const caseRows = loadingCases.map(c => `
      <tr>
        <td>${escapeHtml(c.label)}</td>
        <td>${f(c.tempF, 0)}</td>
        <td>${f(c.unitLoad, 3)}</td>
        <td>${f(c.tensionLb, 0)}</td>
        <td class="${c.tensionPctUts > 60 ? 'result-warn' : ''}">${f(c.tensionPctUts, 1)}%</td>
        <td>${f(c.sagFt, 2)}</td>
      </tr>`).join('');

    const stringRows = stringingTable.map(t => `
      <tr>
        <td>${f(t.tempF, 0)}</td>
        <td>${f(t.tensionLb, 0)}</td>
        <td>${f(t.supportTensionLb, 0)}</td>
        <td>${f(t.sagFt, 2)}</td>
      </tr>`).join('');

    const warningHtml = warnings.length
      ? `<ul class="drc-findings">${warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escapeHtml(w)}</span></li>`).join('')}</ul>`
      : '<p class="field-hint">No warnings — tensions and sag are within typical screening limits.</p>';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Sag-Tension Results</h2>

        <div class="result-group">
          <h3>Summary</h3>
          <div class="result-cards">
            <div class="result-card">
              <div class="result-card-label">Ruling span</div>
              <div class="result-card-value">${f(rulingSpan, 1)}</div>
              <div class="result-card-sub">ft</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Design tension</div>
              <div class="result-card-value">${f(designTensionLb, 0)}</div>
              <div class="result-card-sub">lb · ${f(designTensionPctUts, 1)}% UTS @ ${escapeHtml(district.label)}</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Design sag</div>
              <div class="result-card-value">${f(designSagFt, 2)}</div>
              <div class="result-card-sub">ft (loaded, ${escapeHtml(district.label)})</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Loaded unit weight</div>
              <div class="result-card-value">${f(loading.wResultant, 3)}</div>
              <div class="result-card-sub">lb/ft · support ${f(designSupportTensionLb, 0)} lb</div>
            </div>
          </div>
        </div>

        <div class="result-group">
          <h3>NESC Loading Cases</h3>
          <div class="table-scroll">
            <table class="data-table" aria-label="NESC loading cases">
              <thead><tr><th>District</th><th>Temp (°F)</th><th>Unit load (lb/ft)</th><th>Tension (lb)</th><th>% UTS</th><th>Sag (ft)</th></tr></thead>
              <tbody>${caseRows}</tbody>
            </table>
          </div>
        </div>

        <div class="result-group">
          <h3>Stringing Table (bare conductor)</h3>
          <div id="st-chart-container">${sagChartSvg(stringingTable)}</div>
          <div class="table-scroll">
            <table class="data-table" aria-label="Stringing table">
              <thead><tr><th>Temp (°F)</th><th>Horiz. tension (lb)</th><th>Support tension (lb)</th><th>Sag (ft)</th></tr></thead>
              <tbody>${stringRows}</tbody>
            </table>
          </div>
        </div>

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningHtml}
        </div>
      </section>`;
  }

  // Line chart of sag vs temperature.
  function sagChartSvg(table) {
    if (!table || table.length < 2) return '';
    const W = 700, H = 240, padL = 50, padR = 16, padT = 12, padB = 36;
    const temps = table.map(t => t.tempF);
    const sags = table.map(t => t.sagFt);
    const tMin = Math.min(...temps), tMax = Math.max(...temps);
    const sMin = Math.min(...sags), sMax = Math.max(...sags);
    const sx = t => padL + ((t - tMin) / (tMax - tMin || 1)) * (W - padL - padR);
    const sy = s => H - padB - ((s - sMin) / (sMax - sMin || 1)) * (H - padT - padB);
    const pts = table.map(t => `${sx(t.tempF).toFixed(1)},${sy(t.sagFt).toFixed(1)}`).join(' ');
    const dots = table.map(t =>
      `<circle cx="${sx(t.tempF).toFixed(1)}" cy="${sy(t.sagFt).toFixed(1)}" r="2.5" fill="#3a7bd5"></circle>`).join('');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sag versus temperature chart">
        <title>Conductor sag rises with temperature</title>
        <polyline points="${pts}" fill="none" stroke="#3a7bd5" stroke-width="2"></polyline>
        ${dots}
        <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="currentColor"></line>
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="currentColor"></line>
        <text x="${padL}" y="${H - 10}" font-size="11" fill="currentColor">${tMin.toFixed(0)}°F</text>
        <text x="${W - padR}" y="${H - 10}" text-anchor="end" font-size="11" fill="currentColor">${tMax.toFixed(0)}°F</text>
        <text x="${padL - 6}" y="${sy(sMax).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor">${sMax.toFixed(1)} ft</text>
        <text x="${padL - 6}" y="${sy(sMin).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor">${sMin.toFixed(1)} ft</text>
      </svg>`;
  }

  // -------------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------------
  function resultToCsv(r) {
    const lines = [];
    lines.push('# Overhead Conductor Sag-Tension');
    lines.push(`# Conductor,${r.inputs.conductor.name}`);
    lines.push(`# Ruling span (ft),${r.rulingSpan.toFixed(2)}`);
    lines.push(`# Design,${r.designTensionPctUts.toFixed(1)}% UTS @ ${r.district.label} (${r.designTensionLb.toFixed(0)} lb)`);
    lines.push('# --- NESC Loading Cases ---');
    lines.push('District,TempF,UnitLoad_lbft,Tension_lb,Pct_UTS,Sag_ft');
    r.loadingCases.forEach(c => lines.push(
      [c.label, c.tempF, c.unitLoad.toFixed(3), c.tensionLb.toFixed(0), c.tensionPctUts.toFixed(1), c.sagFt.toFixed(2)].join(',')));
    lines.push('# --- Stringing Table (bare) ---');
    lines.push('TempF,HorizTension_lb,SupportTension_lb,Sag_ft');
    r.stringingTable.forEach(t => lines.push(
      [t.tempF, t.tensionLb.toFixed(0), t.supportTensionLb.toFixed(0), t.sagFt.toFixed(2)].join(',')));
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

  void NESC_DISTRICTS;
});
