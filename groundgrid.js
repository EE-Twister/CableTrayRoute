import { analyzeGroundGrid } from './analysis/groundGrid.mjs';

document.addEventListener('DOMContentLoaded', () => {
  const resultsDiv = document.getElementById('results');
  const form = document.getElementById('ground-grid-form');
  const previewSvg = document.getElementById('ground-grid-preview');
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

  function renderGridPreview() {
    if (!previewSvg) {
      return;
    }

    const gridLxInput = getNum('grid-lx');
    const gridLyInput = getNum('grid-ly');
    const nxInput = getInt('nx');
    const nyInput = getInt('ny');
    const hasRods = document.getElementById('has-rods').checked;

    const gridLx = Number.isFinite(gridLxInput) && gridLxInput > 0 ? gridLxInput : 1;
    const gridLy = Number.isFinite(gridLyInput) && gridLyInput > 0 ? gridLyInput : 1;
    const nx = Math.max(2, Number.isFinite(nxInput) ? nxInput : 2);
    const ny = Math.max(2, Number.isFinite(nyInput) ? nyInput : 2);

    const unit = getUnits() === 'imperial' ? 'ft' : 'm';
    const spacingX = ny > 1 ? gridLx / (ny - 1) : 0;
    const spacingY = nx > 1 ? gridLy / (nx - 1) : 0;

    const svgWidth = 520;
    const svgHeight = 360;
    const margin = 52;
    const drawableWidth = svgWidth - (margin * 2);
    const drawableHeight = svgHeight - (margin * 2);
    const scale = Math.min(drawableWidth / gridLx, drawableHeight / gridLy);
    const drawWidth = gridLx * scale;
    const drawHeight = gridLy * scale;
    const startX = (svgWidth - drawWidth) / 2;
    const startY = (svgHeight - drawHeight) / 2;
    const endX = startX + drawWidth;
    const endY = startY + drawHeight;

    previewSvg.innerHTML = '';
    previewSvg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
    previewSvg.setAttribute('width', String(svgWidth));
    previewSvg.setAttribute('height', String(svgHeight));

    const ns = 'http://www.w3.org/2000/svg';
    const make = (name, attrs = {}) => {
      const node = document.createElementNS(ns, name);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
      return node;
    };

    previewSvg.appendChild(make('rect', {
      x: startX,
      y: startY,
      width: drawWidth,
      height: drawHeight,
      class: 'grid-outline',
      fill: 'none',
      stroke: 'var(--border-strong, #5b6780)',
      'stroke-width': 2
    }));

    const dx = ny > 1 ? drawWidth / (ny - 1) : 0;
    const dy = nx > 1 ? drawHeight / (nx - 1) : 0;

    for (let i = 0; i < ny; i += 1) {
      const x = startX + (i * dx);
      previewSvg.appendChild(make('line', {
        x1: x,
        y1: startY,
        x2: x,
        y2: endY,
        class: 'grid-conductor',
        stroke: 'var(--accent, #0074d9)',
        'stroke-width': 2
      }));
    }
    for (let i = 0; i < nx; i += 1) {
      const y = startY + (i * dy);
      previewSvg.appendChild(make('line', {
        x1: startX,
        y1: y,
        x2: endX,
        y2: y,
        class: 'grid-conductor',
        stroke: 'var(--accent, #0074d9)',
        'stroke-width': 2
      }));
    }

    if (hasRods) {
      [[startX, startY], [endX, startY], [startX, endY], [endX, endY]].forEach(([x, y]) => {
        previewSvg.appendChild(make('circle', {
          cx: x,
          cy: y,
          r: 5,
          class: 'grid-rod',
          fill: 'var(--danger, #cf3f5c)',
          stroke: 'var(--surface, #ffffff)',
          'stroke-width': 1.5
        }));
      });
    }

    const summaryText = `Lx: ${gridLx.toFixed(1)} ${unit} • Ly: ${gridLy.toFixed(1)} ${unit} • `
      + `${nx} horizontal runs • ${ny} vertical runs • `
      + `Spacing: ${spacingX.toFixed(1)} ${unit} (x), ${spacingY.toFixed(1)} ${unit} (y)`
      + (hasRods ? ' • Corner rods enabled' : '');

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
