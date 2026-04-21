import { analyzeGroundGrid } from './analysis/groundGrid.mjs';
import { normalizePreviewGeometry } from './src/groundgridPreviewGeometry.js';

document.addEventListener('DOMContentLoaded', () => {
  const resultsDiv = document.getElementById('results');
  const form = document.getElementById('ground-grid-form');
  const previewTopSvg = document.getElementById('ground-grid-preview-top');
  const previewElevationSvg = document.getElementById('ground-grid-preview-elevation');
  const previewSummary = document.getElementById('grid-preview-summary');
  const stepOverlayHint = document.getElementById('step-overlay-hint');

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

  function updateUnitLabels(imperial) {
    document.querySelectorAll('.unit-label-ft').forEach(el => { el.hidden = !imperial; });
    document.querySelectorAll('.unit-label-m').forEach(el => { el.hidden = imperial; });
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
  let latestAnalysisResult = null;

  function makeSvg(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function formatDim(value, unit) {
    return `${value.toFixed(value < 10 ? 2 : 1)} ${unit}`;
  }

  function getPreviewParams() {
    const imperial = getUnits() === 'imperial';
    const unit = imperial ? 'ft' : 'm';
    const gridLxInput = getNum('grid-lx');
    const gridLyInput = getNum('grid-ly');
    const burialDepthInput = getNum('burial-depth');
    const hsRaw = getNum('surface-hs') || 0;
    const hsInput = imperial ? hsRaw / 12 : hsRaw; // convert in→ft so hs is same unit as burialDepth
    const conductorInput = getNum('conductor-diameter');
    const nxInput = getInt('nx');
    const nyInput = getInt('ny');
    const hasRods = document.getElementById('has-rods').checked;
    const rodSpacingXInput = getNum('rod-spacing-x');
    const rodSpacingYInput = getNum('rod-spacing-y');
    const diameterUnit = imperial ? 'in' : 'mm';

    const normalized = normalizePreviewGeometry({
      gridLxInput,
      gridLyInput,
      burialDepthInput,
      hsInput,
      conductorInput,
      nxInput,
      nyInput,
      hasRods,
      rodSpacingXInput,
      rodSpacingYInput,
    });

    return { unit, diameterUnit, hasRods, ...normalized, hsDisplay: hsRaw, hsDisplayUnit: imperial ? 'in' : 'm' };
  }

  function setRodSpacingVisibility() {
    const hasRods = document.getElementById('has-rods')?.checked;
    ['rod-spacing-x-row', 'rod-spacing-y-row'].forEach(id => {
      const row = document.getElementById(id);
      if (row) {
        row.classList.toggle('rod-spacing-field-disabled', !hasRods);
        row.setAttribute('aria-disabled', hasRods ? 'false' : 'true');
      }
    });
    ['rod-spacing-x', 'rod-spacing-y'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.disabled = !hasRods;
      }
    });
    updateRodLayoutHint();
  }

  function updateRodLayoutHint() {
    const hint = document.getElementById('rod-layout-hint');
    if (!hint) {
      return;
    }
    const params = getPreviewParams();
    if (!params.hasRods) {
      hint.textContent = 'Enable “Include perimeter / corner ground rods” to activate interstitial rod spacing.';
      return;
    }
    if (params.rodLayout.intermediateCount > 0) {
      hint.textContent = `Current layout: ${params.rodLayout.count} rods total (${params.rodLayout.intermediateCount} interstitial)`;
      return;
    }
    hint.textContent = `Current layout: ${params.rodLayout.count} corner/perimeter rods (set interstitial spacing above 0 ${params.unit} to add interior rods).`;
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
    const showStepOverlay = document.getElementById('show-step-overlay')?.checked ?? false;
    const overlayOpacityInput = parseFloat(document.getElementById('step-overlay-opacity')?.value);
    const overlayOpacity = Number.isFinite(overlayOpacityInput) ? overlayOpacityInput : 0.6;

    svgEl.appendChild(makeSvg('rect', { x: startX, y: startY, width: drawWidth, height: drawHeight, class: 'grid-outline' }));

    if (showStepOverlay) {
      const CELLS_PER_MESH = 8;
      const MIN_RES = 24;
      const MAX_RES = 120;
      const cols = Math.max(MIN_RES, Math.min(MAX_RES, (params.ny - 1) * CELLS_PER_MESH));
      const rows = Math.max(MIN_RES, Math.min(MAX_RES, (params.nx - 1) * CELLS_PER_MESH));
      const safetyRatio = latestAnalysisResult
        ? Math.max(0, latestAnalysisResult.Es / Math.max(latestAnalysisResult.Estep, 1))
        : 0.55;
      const severityScale = Math.max(0.25, Math.min(1.25, safetyRatio));

      const canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      const ctx = canvas.getContext('2d');

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const px = startX + ((col + 0.5) * drawWidth / cols);
          const py = startY + ((row + 0.5) * drawHeight / rows);
          const nearestVerticalDistance = dx > 0
            ? Math.min(...Array.from({ length: params.ny }, (_, i) => Math.abs(px - (startX + (i * dx)))))
            : 0;
          const nearestHorizontalDistance = dy > 0
            ? Math.min(...Array.from({ length: params.nx }, (_, i) => Math.abs(py - (startY + (i * dy)))))
            : 0;
          const distX = dx > 0 ? Math.min(1, nearestVerticalDistance / (dx / 2 || 1)) : 0;
          const distY = dy > 0 ? Math.min(1, nearestHorizontalDistance / (dy / 2 || 1)) : 0;
          const localGradient = (distX + distY) / 2;
          const nxCenter = Math.abs(((px - startX) / drawWidth) - 0.5) * 2;
          const nyCenter = Math.abs(((py - startY) / drawHeight) - 0.5) * 2;
          const edgeBoost = Math.max(nxCenter, nyCenter);
          const intensity = Math.max(0, Math.min(1, (0.18 + (0.62 * localGradient) + (0.22 * edgeBoost)) * severityScale));
          const hue = Math.max(0, 125 - (intensity * 125));
          const alpha = (0.08 + (intensity * 0.38)) * overlayOpacity;
          ctx.fillStyle = `hsla(${hue}, 86%, 48%, ${alpha.toFixed(3)})`;
          ctx.fillRect(col, row, 1, 1);
        }
      }

      svgEl.appendChild(makeSvg('image', {
        x: startX,
        y: startY,
        width: drawWidth,
        height: drawHeight,
        href: canvas.toDataURL(),
        class: 'grid-step-overlay',
        preserveAspectRatio: 'none',
      }));
    }

    for (let i = 0; i < params.ny; i += 1) {
      const x = startX + (i * dx);
      svgEl.appendChild(makeSvg('line', { x1: x, y1: startY, x2: x, y2: endY, class: 'grid-conductor' }));
    }
    for (let i = 0; i < params.nx; i += 1) {
      const y = startY + (i * dy);
      svgEl.appendChild(makeSvg('line', { x1: startX, y1: y, x2: endX, y2: y, class: 'grid-conductor' }));
    }
    if (params.hasRods) {
      params.rodLayout.points.forEach(point => {
        const x = startX + (point.xIndex * dx);
        const y = startY + (point.yIndex * dy);
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
    if (!params.hasRods) {
      rodText.textContent = 'Corner rod (disabled)';
    } else if (params.rodLayout.intermediateCount > 0) {
      rodText.textContent = `Rods @ intersections (${params.rodLayout.count} total)`;
    } else {
      rodText.textContent = 'Perimeter/corner rods';
    }
    legend.appendChild(rodText);
    if (showStepOverlay) {
      legend.appendChild(makeSvg('rect', { x: 28, y: 68, width: 30, height: 10, class: 'grid-step-overlay-legend' }));
      const overlayText = makeSvg('text', { x: 65, y: 76, class: 'grid-legend-text' });
      overlayText.textContent = 'Step-potential estimate';
      legend.appendChild(overlayText);
    }
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
      const rodCount = params.rodLayout.intermediateCount > 0 ? 3 : 1;
      const firstRodX = right - 112;
      const rodGap = 32;
      const rodBottom = Math.min(svgHeight - 54, gradeY + ((params.burialDepth + params.rodLength) * depthScale));
      for (let rodIndex = 0; rodIndex < rodCount; rodIndex += 1) {
        const rodX = firstRodX + (rodIndex * rodGap);
        svgEl.appendChild(makeSvg('line', { x1: rodX, y1: conductorY, x2: rodX, y2: rodBottom, class: 'grid-rod' }));
      }
      const dimX = firstRodX + ((rodCount - 1) * rodGap) + 16;
      drawDimension(svgEl, dimX, conductorY, dimX, rodBottom, `Rod = ${formatDim(params.rodLength, params.unit)}`, -10);
    }

    drawDimension(svgEl, left - 24, gradeY, left - 24, conductorY, `h = ${formatDim(params.burialDepth, params.unit)}`, -10);
    if (params.hs > 0) {
      drawDimension(svgEl, right + 20, gradeY, right + 20, surfaceBottom, `hs = ${formatDim(params.hsDisplay, params.hsDisplayUnit)}`, -10);
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
      + (params.hs > 0 ? ` • hs: ${params.hsDisplay.toFixed(2)} ${params.hsDisplayUnit}` : '')
      + (params.hasRods ? ` • Ground rods: ${params.rodLayout.count} (${params.rodLayout.intermediateCount} intermediate)` : '')
      + (params.hasRods && params.rodLayout.axisSpacingX > 0 ? ` • Rod spacing x ≈ ${params.rodLayout.axisSpacingX.toFixed(1)} ${params.unit}` : '')
      + (params.hasRods && params.rodLayout.axisSpacingY > 0 ? ` • Rod spacing y ≈ ${params.rodLayout.axisSpacingY.toFixed(1)} ${params.unit}` : '');
    const showStepOverlay = document.getElementById('show-step-overlay')?.checked ?? false;
    const overlaySafety = latestAnalysisResult
      ? ` • Step overlay ratio Es/Estep = ${(latestAnalysisResult.Es / Math.max(latestAnalysisResult.Estep, 1)).toFixed(2)}`
      : ' • Step overlay ratio uses nominal value until analysis runs';

    if (previewSummary) {
      previewSummary.textContent = hadInitError
        ? `Some page setup features failed to initialize. Preview is still active. ${summaryText}${showStepOverlay ? overlaySafety : ''}`
        : `${summaryText}${showStepOverlay ? overlaySafety : ''}`;
    } else if (hadInitError) {
      console.error('[groundgrid] #grid-preview-summary not found; preview fallback message unavailable.');
    }
    if (stepOverlayHint) {
      stepOverlayHint.textContent = latestAnalysisResult
        ? `Overlay scales with latest Es (${latestAnalysisResult.Es.toFixed(1)} V) vs Estep (${latestAnalysisResult.Estep.toFixed(1)} V).`
        : 'Overlay is estimated from conductor spacing. Run Analyze Ground Grid to scale by Es / Estep.';
    }
    updateRodLayoutHint();
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
      hs = inToM(getNum('surface-hs') || 0);
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
    const previewParams = getPreviewParams();
    const hasRods = document.getElementById('has-rods').checked;
    const rodCount = hasRods ? previewParams.rodLayout.count : 0;
    const rodLength = hasRods
      ? (imperial ? ftToM(previewParams.rodLength) : previewParams.rodLength)
      : 0;
    const bw = parseInt(document.getElementById('body-weight').value, 10);

    let r;
    try {
      r = analyzeGroundGrid({
        rho,
        gridLx,
        gridLy,
        nx,
        ny,
        h,
        d,
        Ig,
        tf,
        hasRods,
        rodCount,
        rodLength,
        rhoS,
        hs,
        bw,
      });
    } catch (err) {
      resultsDiv.innerHTML = `<p class="alert-error" role="alert">Error: ${err.message}</p>`;
      return;
    }
    latestAnalysisResult = r;
    renderGridPreview();

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
    if (r.totalRodLength > 0) {
      const rodLengthDisplay = imperial
        ? `${(r.totalRodLength / 0.3048).toFixed(1)} ft`
        : `${r.totalRodLength.toFixed(1)} m`;
      const effectiveLengthDisplay = imperial
        ? `${(r.effectiveLength / 0.3048).toFixed(1)} ft`
        : `${r.effectiveLength.toFixed(1)} m`;
      section.appendChild(renderResult('Total Rod Length (ΣLr)', rodLengthDisplay, '', null));
      section.appendChild(renderResult('Effective Buried Length (L + ΣLr)', effectiveLengthDisplay, '', null));
      section.appendChild(renderResult('Rod Count', String(r.rodCount), '', null));
    }
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

  function handleFormStateChange() {
    setRodSpacingVisibility();
    renderGridPreview();
  }

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      calculate();
    });

    form.addEventListener('input', handleFormStateChange);
    form.addEventListener('change', handleFormStateChange);
  } else {
    console.error('[groundgrid] #ground-grid-form not found; form event wiring skipped.');
  }

  const hasRodsCheckbox = document.getElementById('has-rods');
  if (hasRodsCheckbox) {
    hasRodsCheckbox.addEventListener('change', handleFormStateChange);
  }

  function onUnitChange() {
    const imperial = getUnits() === 'imperial';
    updateUnitLabels(imperial);
    document.querySelectorAll('[data-unit]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.unit === (imperial ? 'imperial' : 'metric'));
    });
    renderGridPreview();
  }

  document.querySelectorAll('[data-unit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const unitSel = document.getElementById('unit-select');
      if (unitSel) unitSel.value = btn.dataset.unit;
      onUnitChange();
    });
  });

  const unitSelect = document.getElementById('unit-select');
  if (unitSelect) {
    unitSelect.addEventListener('change', onUnitChange);
  }

  ['show-step-overlay', 'step-overlay-opacity'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', renderGridPreview);
      input.addEventListener('change', renderGridPreview);
    }
  });

  renderGridPreview();
  setRodSpacingVisibility();

  const initialImperial = getUnits() === 'imperial';
  updateUnitLabels(initialImperial);
  document.querySelectorAll('[data-unit]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.unit === (initialImperial ? 'imperial' : 'metric'));
  });
});
