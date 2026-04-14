import { analyzeGroundGrid } from './analysis/groundGrid.mjs';
import { normalizePreviewGeometry } from './src/groundgridPreviewGeometry.js';

document.addEventListener('DOMContentLoaded', () => {
  const resultsDiv = document.getElementById('results');
  const form = document.getElementById('ground-grid-form');
  const previewTopSvg = document.getElementById('ground-grid-preview-top');
  const previewElevationSvg = document.getElementById('ground-grid-preview-elevation');
  const previewSummary = document.getElementById('grid-preview-summary');

  let hadInitError = false;

  function safeInit(name, fn) {
    try {
      fn();
    } catch (err) {
      hadInitError = true;
      console.error(`[groundgrid] ${name} initialization failed`, err);
    }
  }

  safeInit('initSettings', () => initSettings());
  safeInit('initDarkMode', () => initDarkMode());
  safeInit('initCompactMode', () => initCompactMode());
  safeInit('initHelpModal', () => initHelpModal('help-btn', 'help-modal', 'close-help-btn'));
  safeInit('initNavToggle', () => initNavToggle());

  function getNum(id) { return parseFloat(document.getElementById(id).value); }
  function getInt(id) { return parseInt(document.getElementById(id).value, 10); }

  function ftToM(ft) { return ft * 0.3048; }
  function inToM(in_) { return in_ * 0.0254; }

  function getUnits() {
    const sel = document.getElementById('unit-select');
    return sel ? sel.value : 'imperial';
  }

  function renderResult(label, value, unit, safe) {
    const row = document.createElement('div');
    row.className = 'result-row' + (safe === true ? ' result-safe' : safe === false ? ' result-fail' : '');
    row.innerHTML = `<span class="result-label">${label}</span><span class="result-value">${value} ${unit}</span>`;
    return row;
  }

  function renderBadge(label, passed) {
    const b = document.createElement('div');
    b.className = 'result-badge ' + (passed ? 'result-badge--pass' : 'result-badge--fail');
    b.setAttribute('role', 'status');
    b.textContent = passed ? `✓ ${label} — PASS` : `✗ ${label} — FAIL`;
    return b;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgWidth = 520;
  const svgHeight = 360;

  function makeSvg(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function formatDim(value, unit) {
    return `${value.toFixed(value < 10 ? 2 : 1)} ${unit}`;
  }

  function getPreviewParams() {
    const unit = getUnits() === 'imperial' ? 'ft' : 'm';
    const gridLxInput = getNum('grid-lx');
    const gridLyInput = getNum('grid-ly');
    const burialDepthInput = getNum('burial-depth');
    const hsInput = getNum('surface-hs') || 0;
    const conductorInput = getNum('conductor-diameter');
    const nxInput = getInt('nx');
    const nyInput = getInt('ny');
    const hasRods = document.getElementById('has-rods').checked;
    const diameterUnit = unit === 'ft' ? 'in' : 'mm';

    const normalized = normalizePreviewGeometry({
      gridLxInput,
      gridLyInput,
      burialDepthInput,
      hsInput,
      conductorInput,
      nxInput,
      nyInput,
      hasRods,
    });

    return { unit, diameterUnit, hasRods, ...normalized };
  }

  function clearAndPrimeSvg(svgEl, titleText) {
    svgEl.innerHTML = '';
    svgEl.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
    svgEl.setAttribute('width', String(svgWidth));
    svgEl.setAttribute('height', String(svgHeight));
    const title = makeSvg('title');
    title.textContent = titleText;
    svgEl.appendChild(title);
  }

  function drawDimension(svgEl, x1, y1, x2, y2, label, textOffset = -8) {
    const g = makeSvg('g', { class: 'grid-dimension' });
    g.appendChild(makeSvg('line', { x1, y1, x2, y2, class: 'grid-dimension-line' }));
    g.appendChild(makeSvg('line', { x1, y1, x2: x1 + (x1 <= x2 ? 7 : -7), y2: y1 - 4, class: 'grid-dimension-arrow' }));
    g.appendChild(makeSvg('line', { x1, y1, x2: x1 + (x1 <= x2 ? 7 : -7), y2: y1 + 4, class: 'grid-dimension-arrow' }));
    g.appendChild(makeSvg('line', { x1: x2, y1: y2, x2: x2 + (x2 >= x1 ? -7 : 7), y2: y2 - 4, class: 'grid-dimension-arrow' }));
    g.appendChild(makeSvg('line', { x1: x2, y1: y2, x2: x2 + (x2 >= x1 ? -7 : 7), y2: y2 + 4, class: 'grid-dimension-arrow' }));
    const text = makeSvg('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 + textOffset, class: 'grid-dimension-text' });
    text.textContent = label;
    g.appendChild(text);
    svgEl.appendChild(g);
  }

  function renderTopView(params, svgEl) {
    if (!svgEl) {
      return;
    }
    clearAndPrimeSvg(svgEl, 'Ground grid top view with conductor matrix and spacing dimensions');
    const margin = 62;
    const drawableWidth = svgWidth - (margin * 2);
    const drawableHeight = svgHeight - (margin * 2) - 24;
    const scale = Math.min(drawableWidth / params.gridLx, drawableHeight / params.gridLy);
    const drawWidth = params.gridLx * scale;
    const drawHeight = params.gridLy * scale;
    const startX = (svgWidth - drawWidth) / 2;
    const startY = (svgHeight - drawHeight) / 2 + 10;
    const endX = startX + drawWidth;
    const endY = startY + drawHeight;
    const dx = params.ny > 1 ? drawWidth / (params.ny - 1) : 0;
    const dy = params.nx > 1 ? drawHeight / (params.nx - 1) : 0;

    svgEl.appendChild(makeSvg('rect', { x: startX, y: startY, width: drawWidth, height: drawHeight, class: 'grid-outline' }));
    for (let i = 0; i < params.ny; i += 1) {
      const x = startX + (i * dx);
      svgEl.appendChild(makeSvg('line', { x1: x, y1: startY, x2: x, y2: endY, class: 'grid-conductor' }));
    }
    for (let i = 0; i < params.nx; i += 1) {
      const y = startY + (i * dy);
      svgEl.appendChild(makeSvg('line', { x1: startX, y1: y, x2: endX, y2: y, class: 'grid-conductor' }));
    }
    if (params.hasRods) {
      [[startX, startY], [endX, startY], [startX, endY], [endX, endY]].forEach(([x, y]) => {
        svgEl.appendChild(makeSvg('circle', { cx: x, cy: y, r: 5, class: 'grid-rod' }));
      });
    }

    drawDimension(svgEl, startX, endY + 24, endX, endY + 24, `Lx = ${formatDim(params.gridLx, params.unit)}`);
    drawDimension(svgEl, startX - 24, endY, startX - 24, startY, `Ly = ${formatDim(params.gridLy, params.unit)}`, -10);
    drawDimension(svgEl, startX, startY - 18, Math.min(endX, startX + dx), startY - 18, `Sx = ${formatDim(params.spacingX, params.unit)}`);
    drawDimension(svgEl, endX + 18, startY, endX + 18, Math.min(endY, startY + dy), `Sy = ${formatDim(params.spacingY, params.unit)}`, -10);

    const legend = makeSvg('g', { class: 'grid-legend' });
    legend.appendChild(makeSvg('rect', { x: 16, y: 14, width: 190, height: 66, rx: 6, class: 'grid-legend-box' }));
    legend.appendChild(makeSvg('line', { x1: 28, y1: 34, x2: 58, y2: 34, class: 'grid-conductor' }));
    const conductorText = makeSvg('text', { x: 65, y: 38, class: 'grid-legend-text' });
    conductorText.textContent = 'Grid conductor';
    legend.appendChild(conductorText);
    legend.appendChild(makeSvg('circle', { cx: 43, cy: 56, r: 5, class: 'grid-rod' }));
    const rodText = makeSvg('text', { x: 65, y: 60, class: 'grid-legend-text' });
    rodText.textContent = params.hasRods ? 'Perimeter/corner rod' : 'Corner rod (disabled)';
    legend.appendChild(rodText);
    svgEl.appendChild(legend);
  }

  function renderElevationView(params, svgEl) {
    if (!svgEl) {
      return;
    }
    clearAndPrimeSvg(svgEl, 'Ground grid elevation with burial depth, layer thickness, and rod depth');
    const left = 70;
    const right = svgWidth - 60;
    const gradeY = 102;
    const maxDepth = Math.max(params.burialDepth + params.hs + params.rodLength, params.burialDepth + 0.3);
    const depthScale = (svgHeight - 96 - gradeY) / maxDepth;
    const surfaceBottom = gradeY + (params.hs * depthScale);
    const conductorY = gradeY + (params.burialDepth * depthScale);
    const conductorBand = Math.max(4, Math.min(10, (params.conductorDiameter / (params.unit === 'ft' ? 12 : 1000)) * depthScale * 6));

    svgEl.appendChild(makeSvg('line', { x1: left, y1: gradeY, x2: right, y2: gradeY, class: 'grid-grade-line' }));
    if (params.hs > 0) {
      svgEl.appendChild(makeSvg('rect', { x: left, y: gradeY, width: right - left, height: surfaceBottom - gradeY, class: 'grid-layer-surface' }));
    }
    svgEl.appendChild(makeSvg('rect', { x: left, y: surfaceBottom, width: right - left, height: svgHeight - 54 - surfaceBottom, class: 'grid-layer-soil' }));
    svgEl.appendChild(makeSvg('rect', { x: left + 18, y: conductorY - (conductorBand / 2), width: right - left - 36, height: conductorBand, class: 'grid-conductor-band' }));
    svgEl.appendChild(makeSvg('rect', { x: left + 18, y: conductorY - 16, width: right - left - 36, height: 32, class: 'grid-trench-band' }));

    if (params.hasRods) {
      const rodX = right - 52;
      const rodBottom = Math.min(svgHeight - 54, gradeY + ((params.burialDepth + params.rodLength) * depthScale));
      svgEl.appendChild(makeSvg('line', { x1: rodX, y1: conductorY, x2: rodX, y2: rodBottom, class: 'grid-rod' }));
      drawDimension(svgEl, rodX + 18, conductorY, rodX + 18, rodBottom, `Rod = ${formatDim(params.rodLength, params.unit)}`, -10);
    }

    drawDimension(svgEl, left - 24, gradeY, left - 24, conductorY, `h = ${formatDim(params.burialDepth, params.unit)}`, -10);
    if (params.hs > 0) {
      drawDimension(svgEl, right + 20, gradeY, right + 20, surfaceBottom, `hs = ${formatDim(params.hs, params.unit)}`, -10);
    }

    const gradeLabel = makeSvg('text', { x: left + 4, y: gradeY - 8, class: 'grid-legend-text' });
    gradeLabel.textContent = 'Grade line';
    svgEl.appendChild(gradeLabel);
    const conductorLabel = makeSvg('text', { x: left + 24, y: conductorY - 10, class: 'grid-legend-text' });
    conductorLabel.textContent = `Conductor depth @ ${formatDim(params.burialDepth, params.unit)}`;
    svgEl.appendChild(conductorLabel);

    const legend = makeSvg('g', { class: 'grid-legend' });
    legend.appendChild(makeSvg('rect', { x: 16, y: 14, width: 214, height: 84, rx: 6, class: 'grid-legend-box' }));
    legend.appendChild(makeSvg('line', { x1: 28, y1: 32, x2: 56, y2: 32, class: 'grid-grade-line' }));
    const t1 = makeSvg('text', { x: 64, y: 36, class: 'grid-legend-text' });
    t1.textContent = 'Grade';
    legend.appendChild(t1);
    legend.appendChild(makeSvg('rect', { x: 28, y: 44, width: 28, height: 10, class: 'grid-layer-surface' }));
    const t2 = makeSvg('text', { x: 64, y: 53, class: 'grid-legend-text' });
    t2.textContent = params.hs > 0 ? 'Surface layer (hs)' : 'No surface layer';
    legend.appendChild(t2);
    legend.appendChild(makeSvg('rect', { x: 28, y: 63, width: 28, height: 8, class: 'grid-conductor-band' }));
    const t3 = makeSvg('text', { x: 64, y: 70, class: 'grid-legend-text' });
    t3.textContent = 'Cable / trench zone';
    legend.appendChild(t3);
    svgEl.appendChild(legend);
  }

  function renderGridPreview() {
    const params = getPreviewParams();
    renderTopView(params, previewTopSvg);
    renderElevationView(params, previewElevationSvg);
    const summaryText = `Lx: ${params.gridLx.toFixed(1)} ${params.unit} • Ly: ${params.gridLy.toFixed(1)} ${params.unit} • `
      + `${params.nx} horizontal runs • ${params.ny} vertical runs • `
      + `Spacing: ${params.spacingX.toFixed(1)} ${params.unit} (x), ${params.spacingY.toFixed(1)} ${params.unit} (y)`
      + ` • h: ${params.burialDepth.toFixed(2)} ${params.unit}`
      + (params.hs > 0 ? ` • hs: ${params.hs.toFixed(2)} ${params.unit}` : '')
      + (params.hasRods ? ' • Corner rods enabled' : '');

    if (previewSummary) {
      previewSummary.textContent = hadInitError
        ? `Some page setup features failed to initialize. Preview is still active. ${summaryText}`
        : summaryText;
    } else if (hadInitError) {
      console.error('[groundgrid] #grid-preview-summary not found; preview fallback message unavailable.');
    }
  }

  function calculate() {
    resultsDiv.innerHTML = '';

    const imperial = getUnits() === 'imperial';

    let rho, gridLx, gridLy, h, d, rhoS, hs;

    rho = getNum('soil-rho');
    if (imperial) {
      // Convert from US customary
      gridLx = ftToM(getNum('grid-lx'));
      gridLy = ftToM(getNum('grid-ly'));
      h = ftToM(getNum('burial-depth'));
      d = inToM(getNum('conductor-diameter'));
      rhoS = getNum('surface-rho') || 0;
      hs = ftToM(getNum('surface-hs') || 0);
    } else {
      gridLx = getNum('grid-lx');
      gridLy = getNum('grid-ly');
      h = getNum('burial-depth');
      d = getNum('conductor-diameter') / 1000; // mm → m
      rhoS = getNum('surface-rho') || 0;
      hs = getNum('surface-hs') || 0;
    }

    const nx = getInt('nx');
    const ny = getInt('ny');
    const Ig = getNum('grid-current');
    const tf = getNum('fault-duration');
    const hasRods = document.getElementById('has-rods').checked;
    const bw = parseInt(document.getElementById('body-weight').value, 10);

    let r;
    try {
      r = analyzeGroundGrid({ rho, gridLx, gridLy, nx, ny, h, d, Ig, tf, hasRods, rhoS, hs, bw });
    } catch (err) {
      resultsDiv.innerHTML = `<p class="alert-error" role="alert">Error: ${err.message}</p>`;
      return;
    }

    const section = document.createElement('section');
    section.className = 'results-panel';
    section.setAttribute('aria-label', 'Ground grid analysis results');

    const h2 = document.createElement('h2');
    h2.textContent = 'Analysis Results';
    section.appendChild(h2);

    // Safety badges
    section.appendChild(renderBadge('Touch Voltage', r.touchSafe));
    section.appendChild(renderBadge('Step Voltage', r.stepSafe));

    // Grid parameters
    const gridPara = document.createElement('h3');
    gridPara.textContent = 'Grid Parameters';
    section.appendChild(gridPara);

    const areaDisplay = imperial
      ? `${(r.A / 0.0929).toFixed(1)} ft²`
      : `${r.A.toFixed(1)} m²`;
    const lDisplay = imperial
      ? `${(r.conductorLength / 0.3048).toFixed(1)} ft`
      : `${r.conductorLength.toFixed(1)} m`;

    section.appendChild(renderResult('Grid Area (A)', areaDisplay, '', null));
    section.appendChild(renderResult('Total Conductor Length (L)', lDisplay, '', null));
    section.appendChild(renderResult('Effective n', r.n.toFixed(2), '', null));
    section.appendChild(renderResult('Mesh Spacing Km', r.Km.toFixed(3), '', null));
    section.appendChild(renderResult('Step Factor Ks', r.Ks.toFixed(3), '', null));
    section.appendChild(renderResult('Irregularity Ki', r.Ki.toFixed(3), '', null));
    if (r.Cs < 1) {
      section.appendChild(renderResult('Surface Factor Cs', r.Cs.toFixed(3), '', null));
    }

    // Electrical results
    const elec = document.createElement('h3');
    elec.textContent = 'Electrical Results';
    section.appendChild(elec);

    section.appendChild(renderResult('Grid Resistance Rg', r.Rg.toFixed(4), 'Ω', null));
    section.appendChild(renderResult('Ground Potential Rise (GPR)', r.GPR.toFixed(1), 'V', null));

    // Voltage comparison table
    const tbl = document.createElement('table');
    tbl.className = 'results-table';
    tbl.innerHTML = `
      <caption>Voltage Safety Check</caption>
      <thead>
        <tr>
          <th scope="col">Quantity</th>
          <th scope="col">Actual (V)</th>
          <th scope="col">Tolerable (V)</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr class="${r.touchSafe ? 'row-pass' : 'row-fail'}">
          <td>Mesh Voltage Em</td>
          <td>${r.Em.toFixed(1)}</td>
          <td>${r.Etouch.toFixed(1)}</td>
          <td>${r.touchSafe ? 'PASS' : 'FAIL'}</td>
        </tr>
        <tr class="${r.stepSafe ? 'row-pass' : 'row-fail'}">
          <td>Step Voltage Es</td>
          <td>${r.Es.toFixed(1)}</td>
          <td>${r.Estep.toFixed(1)}</td>
          <td>${r.stepSafe ? 'PASS' : 'FAIL'}</td>
        </tr>
      </tbody>
    `;
    section.appendChild(tbl);

    if (r.gprExceedsTouch) {
      const warn = document.createElement('p');
      warn.className = 'alert-warning';
      warn.setAttribute('role', 'alert');
      warn.textContent = `Warning: GPR (${r.GPR.toFixed(0)} V) exceeds tolerable touch voltage (${r.Etouch.toFixed(0)} V). Transferred voltage must be considered per IEEE 80-2013 §17.`;
      section.appendChild(warn);
    }

    resultsDiv.appendChild(section);
  }

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      calculate();
    });

    form.addEventListener('input', () => {
      renderGridPreview();
    });
  } else {
    console.error('[groundgrid] #ground-grid-form not found; form event wiring skipped.');
  }

  const unitSelect = document.getElementById('unit-select');
  if (unitSelect) {
    unitSelect.addEventListener('change', () => {
      renderGridPreview();
    });
  }

  renderGridPreview();
});
