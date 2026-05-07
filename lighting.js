import {
  runLightingStudy,
  parseIES,
} from './analysis/lighting.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initStudyApprovalPanel('lighting');

  const calculateBtn = document.getElementById('calculate-btn');
  const exportBtn    = document.getElementById('export-btn');
  const iesFileInput = document.getElementById('ies-file');
  const iesStatus    = document.getElementById('ies-status');
  const fixPosSect   = document.getElementById('fixture-positions-section');
  const addFixBtn    = document.getElementById('add-fixture-btn');

  let iesData = null; // parsed IES result

  calculateBtn.addEventListener('click', calculate);
  exportBtn.addEventListener('click', exportCsv);
  iesFileInput.addEventListener('change', loadIES);
  addFixBtn.addEventListener('click', addFixtureRow);

  // Restore previously saved state
  const saved = getStudies().lighting;
  if (saved && saved._inputs) {
    restoreInputs(saved._inputs);
    if (saved._iesData) {
      iesData = saved._iesData;
      iesStatus.textContent = `Loaded: ${saved._iesFileName || 'fixture.ies'} — ${iesData.totalLumens.toFixed(0)} lm`;
      fixPosSect.hidden = false;
      restoreFixturePositions(saved._inputs.fixturePositions || []);
    }
    renderResults(saved);
    exportBtn.disabled = false;
  }

  // -------------------------------------------------------------------
  // IES file loading
  // -------------------------------------------------------------------

  function loadIES() {
    const file = iesFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        iesData = parseIES(e.target.result);
        iesStatus.textContent = `Loaded: ${escapeHtml(file.name)} — ${iesData.totalLumens.toFixed(0)} lm initial, ${iesData.inputWatts} W`;
        // Pre-fill lumens from IES if field is at its default
        const lmEl = document.getElementById('lumens-per-fixture');
        if (lmEl && parseFloat(lmEl.value) === 1600) {
          lmEl.value = Math.round(iesData.totalLumens);
        }
        fixPosSect.hidden = false;
        // Add default fixture row if none exist
        if (document.querySelectorAll('.fixture-pos-row').length === 0) {
          addFixtureRow();
        }
      } catch (err) {
        iesData = null;
        iesStatus.textContent = `Parse error: ${escapeHtml(err.message)}`;
        fixPosSect.hidden = true;
      }
    };
    reader.readAsText(file);
  }

  // -------------------------------------------------------------------
  // Fixture position rows
  // -------------------------------------------------------------------

  function addFixtureRow(x = '', y = '') {
    const list = document.getElementById('fixture-positions-list');
    const row  = document.createElement('div');
    row.className = 'fixture-pos-row field-row-inline';
    const idx = list.children.length + 1;
    row.innerHTML = `
      <label>Fixture ${idx} X (ft)
        <input type="number" class="fix-x" value="${escapeHtml(String(x))}" min="0" step="0.5" aria-label="Fixture ${idx} X position">
      </label>
      <label>Fixture ${idx} Y (ft)
        <input type="number" class="fix-y" value="${escapeHtml(String(y))}" min="0" step="0.5" aria-label="Fixture ${idx} Y position">
      </label>
      <button type="button" class="btn remove-fix-btn" aria-label="Remove fixture ${idx}">✕</button>`;
    row.querySelector('.remove-fix-btn').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }

  function readFixturePositions() {
    const rows = document.querySelectorAll('.fixture-pos-row');
    const positions = [];
    for (const row of rows) {
      const x = parseFloat(row.querySelector('.fix-x').value);
      const y = parseFloat(row.querySelector('.fix-y').value);
      if (isFinite(x) && isFinite(y)) positions.push({ x, y });
    }
    return positions;
  }

  function restoreFixturePositions(positions) {
    const list = document.getElementById('fixture-positions-list');
    list.innerHTML = '';
    for (const pos of positions) addFixtureRow(pos.x, pos.y);
  }

  // -------------------------------------------------------------------
  // Calculate
  // -------------------------------------------------------------------

  function calculate() {
    const inputs = readInputs();
    const result = runLightingStudy(inputs);

    const toStore = {
      ...result,
      _inputs:      inputs,
      _iesData:     iesData,
      _iesFileName: iesFileInput.files[0]?.name || null,
    };
    const studies = getStudies();
    studies.lighting = toStore;
    setStudies(studies);

    renderResults(toStore);
    exportBtn.disabled = !result.valid;
  }

  // -------------------------------------------------------------------
  // Input reading
  // -------------------------------------------------------------------

  function readInputs() {
    const positions = iesData ? readFixturePositions() : null;
    return {
      label:               document.getElementById('room-label').value.trim() || 'Egress Area',
      roomLengthFt:        parseFloat(document.getElementById('room-length').value),
      roomWidthFt:         parseFloat(document.getElementById('room-width').value),
      mountingHeightFt:    parseFloat(document.getElementById('mounting-height').value),
      workplaneHeightFt:   parseFloat(document.getElementById('workplane-height').value),
      numFixtures:         parseInt(document.getElementById('num-fixtures').value, 10),
      lumensPerFixture:    parseFloat(document.getElementById('lumens-per-fixture').value),
      llf:                 parseFloat(document.getElementById('llf').value),
      ceilingReflPct:      parseInt(document.getElementById('ceiling-refl').value, 10),
      wallReflPct:         parseInt(document.getElementById('wall-refl').value, 10),
      fixturePositions:    positions,
      vertAngles:          iesData ? iesData.vertAngles : null,
      candelas:            iesData ? iesData.candelaSets[0] : null,
    };
  }

  function restoreInputs(inputs) {
    if (!inputs) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    set('room-label',          inputs.label);
    set('room-length',         inputs.roomLengthFt);
    set('room-width',          inputs.roomWidthFt);
    set('mounting-height',     inputs.mountingHeightFt);
    set('workplane-height',    inputs.workplaneHeightFt);
    set('num-fixtures',        inputs.numFixtures);
    set('lumens-per-fixture',  inputs.lumensPerFixture);
    set('llf',                 inputs.llf);
    set('ceiling-refl',        inputs.ceilingReflPct);
    set('wall-refl',           inputs.wallReflPct);
  }

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------

  function renderResults(result) {
    renderWarnings(result);

    const el = document.getElementById('results');
    if (!result.valid) {
      el.hidden = false;
      el.innerHTML = `<div class="error-msg" role="alert"><strong>Input errors:</strong><ul>${
        result.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')
      }</ul></div>`;
      return;
    }

    const lm = result.lumenMethod;
    const eg = result.egressCheck;
    const pg = result.pointGrid;

    const avgClass = eg.pass ? 'fill-ok' : 'fill-over';
    const avgLabel = eg.pass ? '✓ Pass' : '✗ Fail';

    el.hidden = false;
    el.innerHTML = `
      <h2>${escapeHtml(result._inputs?.label || 'Egress Area')}</h2>

      <!-- Lumen method card -->
      <section class="field-group" aria-label="Lumen method results" style="margin-bottom:1.5rem">
        <h3>Lumen Method (IES HB-10)</h3>
        <table class="results-table" aria-label="Lumen method summary">
          <tbody>
            <tr>
              <td>Average illuminance</td>
              <td><strong>${lm.avgFc} fc</strong></td>
              <td><span class="fill-badge ${avgClass}">${avgLabel} (≥ 1.0 fc)</span></td>
            </tr>
            <tr><td>Room area</td><td>${lm.roomAreaSqFt} ft²</td><td></td></tr>
            <tr><td>Room Cavity Ratio (RCR)</td><td>${lm.rcr}</td><td></td></tr>
            <tr><td>Cavity height</td><td>${lm.cavityHeightFt} ft</td><td></td></tr>
            <tr><td>Coefficient of Utilization (CU)</td><td>${lm.cu}</td><td></td></tr>
            <tr><td>Light Loss Factor (LLF)</td><td>${lm.llf}</td><td></td></tr>
            <tr><td>Ceiling / wall reflectance</td><td>${lm.ceilingReflPct}% / ${lm.wallReflPct}%</td><td></td></tr>
          </tbody>
        </table>
      </section>

      ${pg ? renderGridCard(pg, eg) : ''}

      <!-- Egress compliance card -->
      <section class="field-group" aria-label="NFPA 101 egress compliance" style="margin-bottom:1.5rem">
        <h3>NFPA 101 §7.9.2.1 Egress Compliance</h3>
        <table class="results-table" aria-label="Egress compliance summary">
          <tbody>
            <tr>
              <td>Overall result</td>
              <td></td>
              <td><span class="fill-badge ${eg.pass ? 'fill-ok' : 'fill-over'}">${eg.pass ? '✓ Pass' : '✗ Fail'}</span></td>
            </tr>
            <tr>
              <td>Average illuminance</td>
              <td><strong>${eg.avgFc} fc</strong></td>
              <td><span class="fill-badge ${eg.avgFc >= 1.0 ? 'fill-ok' : 'fill-over'}">${eg.avgFc >= 1.0 ? `✓ ≥ ${eg.avgThresholdFc} fc` : `✗ < ${eg.avgThresholdFc} fc`}</span></td>
            </tr>
            ${eg.minFc !== null ? `
            <tr>
              <td>Minimum illuminance</td>
              <td><strong>${eg.minFc} fc</strong></td>
              <td><span class="fill-badge ${eg.minFc >= 0.1 ? 'fill-ok' : 'fill-over'}">${eg.minFc >= 0.1 ? `✓ ≥ ${eg.minThresholdFc} fc` : `✗ < ${eg.minThresholdFc} fc`}</span></td>
            </tr>` : '<tr><td colspan="3"><em>Minimum illuminance check requires IES file and fixture positions</em></td></tr>'}
          </tbody>
        </table>
        ${eg.violations.length > 0 ? `
        <div class="warning-panel" style="border-left:4px solid var(--color-error,#c0392b);padding:.75rem 1rem;margin:.5rem 0;background:var(--color-bg-error,#fdecea)" role="alert">
          <strong>Non-compliance:</strong>
          <ul>${eg.violations.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul>
        </div>` : ''}
      </section>`;
  }

  function renderGridCard(pg, eg) {
    const uniformity = pg.avgFc > 0 ? (pg.minFc / pg.avgFc).toFixed(2) : '—';
    return `
      <section class="field-group" aria-label="Point-by-point illuminance grid" style="margin-bottom:1.5rem">
        <h3>Point-by-Point Grid (Cosine-Cube Method)</h3>
        <table class="results-table" aria-label="Grid summary">
          <tbody>
            <tr><td>Average illuminance</td><td><strong>${pg.avgFc} fc</strong></td><td></td></tr>
            <tr><td>Maximum illuminance</td><td>${pg.maxFc} fc</td><td></td></tr>
            <tr><td>Minimum illuminance</td><td>${pg.minFc} fc</td><td></td></tr>
            <tr><td>Uniformity ratio (min/avg)</td><td>${uniformity}</td><td></td></tr>
            <tr><td>Grid resolution</td><td>${pg.rows} × ${pg.cols} cells</td><td></td></tr>
          </tbody>
        </table>
        <canvas id="isolux-canvas" width="300" height="200"
          style="display:block;margin-top:.75rem;border:1px solid var(--color-border)"
          aria-label="Pseudo-colour isolux grid"></canvas>
      </section>`;
  }

  function renderWarnings(result) {
    const el = document.getElementById('warnings-panel');
    const warnings = result.warnings || [];
    if (warnings.length === 0) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `
      <div class="warning-panel" style="border-left:4px solid var(--color-warn,#e6a000);padding:.75rem 1rem;margin:1rem 0;background:var(--color-bg-warn,#fffbe6)">
        <strong>⚠ Notices</strong>
        <ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
      </div>`;
  }

  // Draw pseudo-colour isolux grid on canvas after DOM update
  document.getElementById('results').addEventListener('DOMNodeInserted', () => {
    const saved = getStudies().lighting;
    if (saved?.pointGrid) drawIsoluxCanvas(saved.pointGrid);
  }, { once: false });

  function drawIsoluxCanvas(pg) {
    const canvas = document.getElementById('isolux-canvas');
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const cw   = canvas.width;
    const ch   = canvas.height;
    const cw1  = cw / pg.cols;
    const ch1  = ch / pg.rows;
    const min  = pg.minFc;
    const range = pg.maxFc - min || 1;

    for (let r = 0; r < pg.rows; r++) {
      for (let c = 0; c < pg.cols; c++) {
        const val = pg.grid[r * pg.cols + c];
        const t   = Math.min(1, (val - min) / range);
        // Blue (low) → yellow → red (high)
        const R = Math.round(t < 0.5 ? 0 : (t - 0.5) * 2 * 255);
        const G = Math.round(t < 0.5 ? t * 2 * 255 : (1 - (t - 0.5) * 2) * 255);
        const B = Math.round(t < 0.5 ? 255 - t * 2 * 255 : 0);
        ctx.fillStyle = `rgb(${R},${G},${B})`;
        ctx.fillRect(c * cw1, r * ch1, cw1, ch1);
      }
    }
  }

  // -------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------

  function exportCsv() {
    const saved = getStudies().lighting;
    if (!saved || !saved.valid) return;

    const lm = saved.lumenMethod;
    const eg = saved.egressCheck;
    const pg = saved.pointGrid;
    const inp = saved._inputs || {};

    const rows = [
      ['Section', 'Parameter', 'Value', 'Unit', 'Status'],
      // Lumen method
      ['Lumen Method', 'Room / area',            escapeHtml(inp.label || ''), '',     ''],
      ['Lumen Method', 'Room length',             inp.roomLengthFt,            'ft',   ''],
      ['Lumen Method', 'Room width',              inp.roomWidthFt,             'ft',   ''],
      ['Lumen Method', 'Room area',               lm.roomAreaSqFt,             'ft²',  ''],
      ['Lumen Method', 'Mounting height',         inp.mountingHeightFt,        'ft',   ''],
      ['Lumen Method', 'Workplane height',        inp.workplaneHeightFt,       'ft',   ''],
      ['Lumen Method', 'Cavity height',           lm.cavityHeightFt,           'ft',   ''],
      ['Lumen Method', 'Room Cavity Ratio (RCR)', lm.rcr,                      '',     ''],
      ['Lumen Method', 'Ceiling reflectance',     lm.ceilingReflPct,           '%',    ''],
      ['Lumen Method', 'Wall reflectance',        lm.wallReflPct,              '%',    ''],
      ['Lumen Method', 'Number of luminaires',    inp.numFixtures,             '',     ''],
      ['Lumen Method', 'Lumens per luminaire',    inp.lumensPerFixture,        'lm',   ''],
      ['Lumen Method', 'CU',                      lm.cu,                       '',     ''],
      ['Lumen Method', 'LLF',                     lm.llf,                      '',     ''],
      ['Lumen Method', 'Average illuminance',     lm.avgFc,                    'fc',   lm.avgFc >= 1.0 ? 'Pass' : 'FAIL'],
      // Egress compliance
      ['Egress (NFPA 101 §7.9.2.1)', 'Overall result', '', '', eg.pass ? 'Pass' : 'FAIL'],
      ['Egress (NFPA 101 §7.9.2.1)', 'Average illuminance', eg.avgFc, 'fc', eg.avgFc >= 1.0 ? 'Pass' : 'FAIL'],
    ];

    if (eg.minFc !== null) {
      rows.push(['Egress (NFPA 101 §7.9.2.1)', 'Minimum illuminance', eg.minFc, 'fc', eg.minFc >= 0.1 ? 'Pass' : 'FAIL']);
    }

    if (pg) {
      rows.push(['Point Grid', 'Average illuminance', pg.avgFc, 'fc', '']);
      rows.push(['Point Grid', 'Maximum illuminance', pg.maxFc, 'fc', '']);
      rows.push(['Point Grid', 'Minimum illuminance', pg.minFc, 'fc', '']);
      rows.push(['Point Grid', 'Grid rows × cols', `${pg.rows} × ${pg.cols}`, '', '']);
    }

    const csv = rows.map(r =>
      r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','),
    ).join('\n');

    const blob  = new Blob([csv], { type: 'text/csv' });
    const url   = URL.createObjectURL(blob);
    const a_el  = Object.assign(document.createElement('a'), {
      href: url, download: 'egress-lighting.csv',
    });
    a_el.click();
    URL.revokeObjectURL(url);
  }
});
