import {
  runLightingStudy,
  parseIES,
  generateDefaultFixtureLayout,
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
  const layoutPreview = document.getElementById('lighting-layout-preview');
  const layoutSummary = document.getElementById('lighting-layout-summary');
  const layoutStats   = document.getElementById('lighting-layout-stats');

  let iesData = null; // parsed IES result

  calculateBtn.addEventListener('click', calculate);
  exportBtn.addEventListener('click', exportCsv);
  iesFileInput.addEventListener('change', loadIES);
  addFixBtn.addEventListener('click', addFixtureRow);
  document.getElementById('fixture-positions-list').addEventListener('input', renderLayoutPreviewFromInputs);
  [
    'room-label',
    'room-length',
    'room-width',
    'ceiling-height',
    'mounting-height',
    'workplane-height',
    'num-fixtures',
    'lumens-per-fixture',
    'llf',
    'ceiling-refl',
    'wall-refl',
  ].forEach((id) => {
    const control = document.getElementById(id);
    if (!control) return;
    control.addEventListener('input', renderLayoutPreviewFromInputs);
    control.addEventListener('change', renderLayoutPreviewFromInputs);
  });

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
  renderLayoutPreviewFromInputs(saved?.valid ? saved : null);

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
        renderLayoutPreviewFromInputs();
      } catch (err) {
        iesData = null;
        iesStatus.textContent = `Parse error: ${escapeHtml(err.message)}`;
        fixPosSect.hidden = true;
        renderLayoutPreviewFromInputs();
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
    row.querySelector('.remove-fix-btn').addEventListener('click', () => {
      row.remove();
      renumberFixtureRows();
      renderLayoutPreviewFromInputs();
    });
    list.appendChild(row);
    renumberFixtureRows();
    renderLayoutPreviewFromInputs();
  }

  function renumberFixtureRows() {
    const rows = document.querySelectorAll('.fixture-pos-row');
    rows.forEach((row, idx) => {
      const num = idx + 1;
      const labels = row.querySelectorAll('label');
      const xInput = row.querySelector('.fix-x');
      const yInput = row.querySelector('.fix-y');
      const removeBtn = row.querySelector('.remove-fix-btn');
      if (labels[0]) labels[0].firstChild.textContent = `Fixture ${num} X (ft)`;
      if (labels[1]) labels[1].firstChild.textContent = `Fixture ${num} Y (ft)`;
      if (xInput) xInput.setAttribute('aria-label', `Fixture ${num} X position`);
      if (yInput) yInput.setAttribute('aria-label', `Fixture ${num} Y position`);
      if (removeBtn) removeBtn.setAttribute('aria-label', `Remove fixture ${num}`);
    });
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
    renderLayoutPreview(inputs, toStore);
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
      ceilingHeightFt:     parseFloat(document.getElementById('ceiling-height').value),
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
    set('ceiling-height',      inputs.ceilingHeightFt);
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

  function renderLayoutPreviewFromInputs(result = null) {
    renderLayoutPreview(readInputs(), result);
  }

  function renderLayoutPreview(inputs, result = null) {
    if (!layoutPreview) return;

    const lengthFt = positiveNumber(inputs.roomLengthFt, 60);
    const widthFt = positiveNumber(inputs.roomWidthFt, 10);
    const ceilingHeightFt = positiveNumber(inputs.ceilingHeightFt, Math.max(9, positiveNumber(inputs.mountingHeightFt, 9)));
    const mountingHeightFt = positiveNumber(inputs.mountingHeightFt, ceilingHeightFt);
    const workplaneHeightFt = nonNegativeNumber(inputs.workplaneHeightFt, 0);
    const fixtureCount = Math.max(1, Math.floor(positiveNumber(inputs.numFixtures, 1)));
    const lumens = positiveNumber(inputs.lumensPerFixture, 0);
    const area = lengthFt * widthFt;
    const enteredPositions = Array.isArray(inputs.fixturePositions)
      ? inputs.fixturePositions.filter(pos => isFinite(pos.x) && isFinite(pos.y))
      : [];

    let layoutSource = 'Auto-spaced preview';
    let layout;
    if (enteredPositions.length > 0) {
      layoutSource = 'Entered fixture positions';
      layout = { rows: null, cols: null, positions: enteredPositions };
    } else {
      layout = generateDefaultFixtureLayout(lengthFt, widthFt, fixtureCount);
    }

    const viewW = 760;
    const viewH = 420;
    const planMaxW = 550;
    const planMaxH = 245;
    const planOriginX = 58;
    const planOriginY = 58;
    const planScale = Math.min(planMaxW / lengthFt, planMaxH / widthFt);
    const planW = lengthFt * planScale;
    const planH = widthFt * planScale;
    const planX = planOriginX + (planMaxW - planW) / 2;
    const planY = planOriginY + (planMaxH - planH) / 2;
    const toX = x => planX + x * planScale;
    const toY = y => planY + planH - y * planScale;
    const pathH = Math.min(planH * 0.72, Math.max(18, planH * 0.30));
    const pathY = planY + planH / 2 - pathH / 2;
    const markerRadius = Math.max(4, Math.min(8, Math.sqrt((planW * planH) / Math.max(1, layout.positions.length)) * 0.035));
    const showFixtureNumbers = layout.positions.length <= 24;

    const fixtures = layout.positions.map((pos, idx) => {
      const outOfBounds = pos.x < 0 || pos.x > lengthFt || pos.y < 0 || pos.y > widthFt;
      const drawX = clamp(pos.x, 0, lengthFt);
      const drawY = clamp(pos.y, 0, widthFt);
      return {
        ...pos,
        idx,
        outOfBounds,
        sx: toX(drawX),
        sy: toY(drawY),
      };
    });
    const outOfBoundsCount = fixtures.filter(pos => pos.outOfBounds).length;

    const gridLines = buildPreviewGrid(planX, planY, planW, planH);
    const fixtureSvg = fixtures.map(pos => `
      <g class="lighting-layout-fixture${pos.outOfBounds ? ' lighting-layout-fixture--error' : ''}">
        <circle cx="${round(pos.sx)}" cy="${round(pos.sy)}" r="${round(markerRadius + 5)}" class="lighting-layout-fixture-glow"></circle>
        <circle cx="${round(pos.sx)}" cy="${round(pos.sy)}" r="${round(markerRadius)}" class="lighting-layout-fixture-core"></circle>
        ${showFixtureNumbers ? `<text x="${round(pos.sx)}" y="${round(pos.sy + 3.2)}" class="lighting-layout-fixture-label">${pos.idx + 1}</text>` : ''}
        <title>Fixture ${pos.idx + 1}: ${formatFt(pos.x)} ft, ${formatFt(pos.y)} ft${pos.outOfBounds ? ' outside room boundary' : ''}</title>
      </g>`).join('');

    const statusText = result?.valid
      ? `${result.egressCheck.pass ? 'Pass' : 'Fail'} at ${formatFc(result.egressCheck.avgFc)} fc average`
      : 'Preview only';
    const statusClass = result?.valid
      ? (result.egressCheck.pass ? 'lighting-layout-stat--pass' : 'lighting-layout-stat--fail')
      : '';
    const roomLabel = inputs.label || 'Egress Area';
    const luminaireSummary = enteredPositions.length > 0 && enteredPositions.length !== fixtureCount
      ? `${enteredPositions.length} positioned / ${fixtureCount} total`
      : `${layout.positions.length} luminaires`;

    layoutSummary.textContent = `${formatFt(lengthFt)} ft x ${formatFt(widthFt)} ft | ${luminaireSummary} | ${layoutSource}`;
    layoutStats.innerHTML = [
      ['Area', `${formatArea(area)} sq ft`],
      ['Layout', fixtureSpacingLabel(layout, lengthFt, widthFt, enteredPositions.length > 0)],
      ['Mounting', `${formatFt(mountingHeightFt)} ft AFF`],
      ['Luminaire', lumens > 0 ? `${formatArea(lumens)} lm each` : 'Not set'],
      ['Status', statusText, statusClass],
      outOfBoundsCount > 0 ? ['Position check', `${outOfBoundsCount} outside room`, 'lighting-layout-stat--fail'] : null,
    ].filter(Boolean).map(([label, value, cls = '']) => `
      <span class="lighting-layout-stat ${cls}">
        <strong>${escapeHtml(label)}</strong>
        ${escapeHtml(value)}
      </span>`).join('');

    layoutPreview.setAttribute(
      'aria-label',
      `${roomLabel} sample layout, ${formatFt(lengthFt)} feet by ${formatFt(widthFt)} feet, ${luminaireSummary}, ${layoutSource}.`,
    );
    layoutPreview.innerHTML = `
      <svg class="lighting-layout-svg" viewBox="0 0 ${viewW} ${viewH}" focusable="false" aria-hidden="true">
        <defs>
          <marker id="lighting-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" class="lighting-layout-arrow"></path>
          </marker>
        </defs>
        <text x="${planX}" y="28" class="lighting-layout-title">${escapeHtml(roomLabel)}</text>
        <text x="${planX}" y="46" class="lighting-layout-subtitle">${escapeHtml(layoutSource)}</text>
        <g class="lighting-layout-plan">
          <rect x="${round(planX)}" y="${round(planY)}" width="${round(planW)}" height="${round(planH)}" class="lighting-layout-room"></rect>
          ${gridLines}
          <rect x="${round(planX)}" y="${round(pathY)}" width="${round(planW)}" height="${round(pathH)}" class="lighting-layout-egress-path"></rect>
          <line x1="${round(planX + 16)}" y1="${round(planY + planH / 2)}" x2="${round(planX + planW - 16)}" y2="${round(planY + planH / 2)}" class="lighting-layout-path-center" marker-end="url(#lighting-arrow)"></line>
          <text x="${round(planX + planW / 2)}" y="${round(planY + planH / 2 - pathH / 2 - 8)}" class="lighting-layout-path-label">Egress path</text>
          ${fixtureSvg}
          <line x1="${round(planX)}" y1="${round(planY + planH + 28)}" x2="${round(planX + planW)}" y2="${round(planY + planH + 28)}" class="lighting-layout-dimension" marker-start="url(#lighting-arrow)" marker-end="url(#lighting-arrow)"></line>
          <text x="${round(planX + planW / 2)}" y="${round(planY + planH + 48)}" class="lighting-layout-dimension-label">${formatFt(lengthFt)} ft</text>
          <line x1="${round(planX - 28)}" y1="${round(planY)}" x2="${round(planX - 28)}" y2="${round(planY + planH)}" class="lighting-layout-dimension" marker-start="url(#lighting-arrow)" marker-end="url(#lighting-arrow)"></line>
          <text x="${round(planX - 38)}" y="${round(planY + planH / 2)}" class="lighting-layout-dimension-label lighting-layout-dimension-label--vertical">${formatFt(widthFt)} ft</text>
        </g>
        ${renderElevationPreview(650, 74, 70, 224, ceilingHeightFt, mountingHeightFt, workplaneHeightFt)}
      </svg>`;
  }

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

    const lm = sanitizeLumenMethod(result.lumenMethod);
    const eg = sanitizeEgressCheck(result.egressCheck);
    const pg = sanitizePointGrid(result.pointGrid);

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
    if (pg) drawIsoluxCanvas(pg);
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

  function sanitizeLumenMethod(value) {
    const lm = value && typeof value === 'object' ? value : {};
    return {
      avgFc: finiteDisplay(lm.avgFc),
      roomAreaSqFt: finiteDisplay(lm.roomAreaSqFt),
      rcr: finiteDisplay(lm.rcr),
      cavityHeightFt: finiteDisplay(lm.cavityHeightFt),
      cu: finiteDisplay(lm.cu),
      llf: finiteDisplay(lm.llf),
      ceilingReflPct: finiteDisplay(lm.ceilingReflPct),
      wallReflPct: finiteDisplay(lm.wallReflPct),
    };
  }

  function sanitizeEgressCheck(value) {
    const eg = value && typeof value === 'object' ? value : {};
    const avgFc = finiteNumber(eg.avgFc, 0);
    const minFc = eg.minFc === null ? null : finiteNumber(eg.minFc, null);
    return {
      pass: Boolean(eg.pass),
      avgFc,
      avgThresholdFc: finiteDisplay(eg.avgThresholdFc),
      minFc,
      minThresholdFc: finiteDisplay(eg.minThresholdFc),
      violations: Array.isArray(eg.violations)
        ? eg.violations.map(v => String(v))
        : [],
    };
  }

  function sanitizePointGrid(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      avgFc: finiteNumber(value.avgFc, 0),
      maxFc: finiteNumber(value.maxFc, 0),
      minFc: finiteNumber(value.minFc, 0),
      rows: Math.max(1, Math.floor(finiteNumber(value.rows, 1))),
      cols: Math.max(1, Math.floor(finiteNumber(value.cols, 1))),
      grid: Array.isArray(value.grid)
        ? value.grid.map(cell => finiteNumber(cell, 0))
        : [],
    };
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

  function renderElevationPreview(x, y, w, h, ceilingHeightFt, mountingHeightFt, workplaneHeightFt) {
    const maxHeight = Math.max(1, ceilingHeightFt, mountingHeightFt, workplaneHeightFt);
    const floorY = y + h;
    const heightY = value => y + h - clamp(value, 0, maxHeight) / maxHeight * h;
    const ceilingY = heightY(ceilingHeightFt);
    const mountingY = heightY(mountingHeightFt);
    const workplaneY = heightY(workplaneHeightFt);
    const mountLabelY = Math.min(floorY - 8, mountingY + (Math.abs(mountingY - ceilingY) < 14 ? 18 : -6));
    const workLabelY = Math.max(y + 12, workplaneY - (Math.abs(workplaneY - floorY) < 14 ? 8 : 6));

    return `
      <g class="lighting-layout-elevation">
        <text x="${x}" y="46" class="lighting-layout-subtitle">Height reference</text>
        <line x1="${x}" y1="${floorY}" x2="${x + w}" y2="${floorY}" class="lighting-layout-floor"></line>
        <line x1="${x}" y1="${ceilingY}" x2="${x + w}" y2="${ceilingY}" class="lighting-layout-ceiling"></line>
        <line x1="${x + w / 2}" y1="${ceilingY}" x2="${x + w / 2}" y2="${floorY}" class="lighting-layout-height-axis"></line>
        <circle cx="${x + w / 2}" cy="${mountingY}" r="7" class="lighting-layout-elevation-fixture"></circle>
        <line x1="${x + 8}" y1="${workplaneY}" x2="${x + w - 8}" y2="${workplaneY}" class="lighting-layout-workplane"></line>
        <text x="${x + w + 10}" y="${Math.max(y + 12, ceilingY - 6)}" class="lighting-layout-elevation-label">Ceiling ${formatFt(ceilingHeightFt)} ft</text>
        <text x="${x + w + 10}" y="${mountLabelY}" class="lighting-layout-elevation-label">Mount ${formatFt(mountingHeightFt)} ft</text>
        <text x="${x + w + 10}" y="${workLabelY}" class="lighting-layout-elevation-label">Workplane ${formatFt(workplaneHeightFt)} ft</text>
      </g>`;
  }

  function buildPreviewGrid(planX, planY, planW, planH) {
    const lines = [];
    for (let i = 1; i < 4; i++) {
      const x = planX + planW * i / 4;
      const y = planY + planH * i / 4;
      lines.push(`<line x1="${round(x)}" y1="${round(planY)}" x2="${round(x)}" y2="${round(planY + planH)}" class="lighting-layout-grid"></line>`);
      lines.push(`<line x1="${round(planX)}" y1="${round(y)}" x2="${round(planX + planW)}" y2="${round(y)}" class="lighting-layout-grid"></line>`);
    }
    return lines.join('');
  }

  function fixtureSpacingLabel(layout, lengthFt, widthFt, explicit) {
    if (explicit) return `${layout.positions.length} entered positions`;
    if (layout.positions.length <= 1) return 'Single fixture';
    const xSpacing = lengthFt / ((layout.cols || 1) + 1);
    if ((layout.rows || 1) <= 1) return `${formatFt(xSpacing)} ft along centerline`;
    const ySpacing = widthFt / ((layout.rows || 1) + 1);
    return `${formatFt(xSpacing)} ft x ${formatFt(ySpacing)} ft grid`;
  }

  function positiveNumber(value, fallback) {
    return isFinite(value) && value > 0 ? value : fallback;
  }

  function nonNegativeNumber(value, fallback) {
    return isFinite(value) && value >= 0 ? value : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value) {
    return Number(value).toFixed(2);
  }

  function formatFt(value) {
    if (!isFinite(value)) return '0';
    return Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1);
  }

  function formatArea(value) {
    if (!isFinite(value)) return '0';
    return Math.round(value).toLocaleString('en-US');
  }

  function formatFc(value) {
    if (!isFinite(value)) return '0';
    return value >= 10 ? value.toFixed(1) : value.toFixed(2);
  }

  function finiteNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function finiteDisplay(value) {
    const num = finiteNumber(value, null);
    return num === null ? '—' : num;
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
      ['Layout Preview', 'Ceiling height',         inp.ceilingHeightFt,         'ft',   ''],
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
