import { runBatterySizingAnalysis } from './analysis/batterySizing.mjs';
import { buildBatteryRackLayoutModel } from './analysis/batteryRackLayout.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

const CELL_VOLTAGE_DEFAULTS = {
  'lead-acid-agm': 2,
  'lead-acid-flooded': 2,
  'lithium-ion': 3.2,
  'nickel-cadmium': 1.2,
};

const STRING_COLORS = [
  '#2563eb',
  '#0f766e',
  '#b45309',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#4d7c0f',
  '#be185d',
];

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('battery-form');
  const resultsDiv = document.getElementById('results');
  const chemistrySelect = document.getElementById('chemistry');
  const cellVoltageInput = document.getElementById('rack-cell-voltage-v');
  let cellVoltageEdited = false;

  initStudyApprovalPanel('batterySizing');

  if (cellVoltageInput && chemistrySelect) {
    cellVoltageInput.addEventListener('input', () => {
      cellVoltageEdited = true;
    });
    chemistrySelect.addEventListener('change', () => {
      if (!cellVoltageEdited) {
        cellVoltageInput.value = CELL_VOLTAGE_DEFAULTS[chemistrySelect.value] || 2;
      }
    });
  }

  // --- Restore previous results from project store ---
  const saved = getStudies().batterySizing;
  if (saved) {
    renderResults(saved);
  }

  // --- Form submission ---
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      result = runBatterySizingAnalysis(inputs);
      const rackLayout = buildBatteryRackLayoutModel(result, inputs.rackLayoutInputs);
      result.rackLayoutInputs = rackLayout.inputs;
      result.rackLayoutSummary = rackLayout.summary;
    } catch (err) {
      showModal('Analysis Error', `<p>${err.message}</p>`, 'error');
      return;
    }

    // Persist
    const studies = getStudies();
    studies.batterySizing = result;
    setStudies(studies);

    renderResults(result);
  });

  // --------------------------------------------------------------------------

  function readFormInputs() {
    const get = id => document.getElementById(id);
    const getFloat = id => parseFloat(get(id).value);

    const averageLoadKw   = getFloat('avg-load-kw');
    const peakLoadKw      = getFloat('peak-load-kw');
    const runtimeHours    = getFloat('runtime-hours');
    const chemistry       = get('chemistry').value;
    const ambientTempC    = getFloat('ambient-temp-c');
    const designMarginPct = getFloat('design-margin-pct');
    const upsPowerFactor  = getFloat('ups-pf');
    const systemLabel     = get('system-label').value.trim();
    const rackLayoutInputs = readRackLayoutInputs(get, getFloat);

    if (!averageLoadKw || averageLoadKw <= 0) {
      showModal('Input Error', '<p>Average load P<sub>avg</sub> (kW) must be greater than zero.</p>', 'error');
      return null;
    }
    if (!peakLoadKw || peakLoadKw <= 0) {
      showModal('Input Error', '<p>Peak load P<sub>peak</sub> (kW) must be greater than zero.</p>', 'error');
      return null;
    }
    if (!runtimeHours || runtimeHours <= 0) {
      showModal('Input Error', '<p>Required runtime must be greater than zero.</p>', 'error');
      return null;
    }
    if (isNaN(designMarginPct) || designMarginPct < 0) {
      showModal('Input Error', '<p>Design margin must be ≥ 0%.</p>', 'error');
      return null;
    }
    if (!upsPowerFactor || upsPowerFactor <= 0 || upsPowerFactor > 1) {
      showModal('Input Error', '<p>UPS power factor must be between 0 (exclusive) and 1.0.</p>', 'error');
      return null;
    }

    return {
      systemLabel,
      averageLoadKw,
      peakLoadKw,
      runtimeHours,
      chemistry,
      ambientTempC,
      designMarginPct,
      upsPowerFactor,
      rackLayoutInputs,
    };
  }

  function readRackLayoutInputs(get, getFloat) {
    return {
      dcBusVoltageV: getFloat('rack-dc-bus-voltage-v'),
      nominalCellVoltageV: getFloat('rack-cell-voltage-v'),
      cellCapacityAh: getFloat('rack-cell-capacity-ah'),
      cellsPerModule: getFloat('rack-cells-per-module'),
      modulesPerRack: getFloat('rack-modules-per-rack'),
      rackWidthFt: getFloat('rack-width-ft'),
      rackDepthFt: getFloat('rack-depth-ft'),
      rackHeightFt: getFloat('rack-height-ft'),
      racksPerRow: getFloat('rack-racks-per-row'),
      frontAisleFt: getFloat('rack-front-aisle-ft'),
      rearClearanceFt: getFloat('rack-rear-clearance-ft'),
      sideClearanceFt: getFloat('rack-side-clearance-ft'),
      rowSpacingFt: getFloat('rack-row-spacing-ft'),
      terminalSide: get('rack-terminal-side').value,
      includeStringProtection: get('rack-string-protection').checked,
    };
  }

  function renderResults(r) {
    resultsDiv.innerHTML = '';

    let rackLayoutModel = null;
    let rackLayoutError = '';
    try {
      rackLayoutModel = buildBatteryRackLayoutModel(r, r.rackLayoutInputs || {});
    } catch (err) {
      rackLayoutError = err.message;
    }

    const warnings = Array.isArray(r.warnings) ? r.warnings : [];
    const warningsHtml = warnings.length
      ? `<ul class="drc-findings">${warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escHtml(String(w))}</span></li>`
        ).join('')}</ul>`
      : '';

    // Runtime curve table rows
    const runtimePoints = Array.isArray(r.runtimeCurvePoints) ? r.runtimeCurvePoints : [];
    const runtimeRows = runtimePoints.map(pt => {
      const loadFraction = Number(pt?.loadFraction);
      const loadKw = Number(pt?.loadKw);
      const runtimeHours = Number(pt?.runtimeHours);
      if (!Number.isFinite(loadFraction) || !Number.isFinite(loadKw) || !Number.isFinite(runtimeHours)) return '';
      const highlight = loadFraction === 1.00 ? ' style="font-weight:600"' : '';
      return `<tr${highlight}>
        <td>${Math.round(loadFraction * 100)}%</td>
        <td>${loadKw.toFixed(1)} kW</td>
        <td>${runtimeHours.toFixed(2)} h</td>
      </tr>`;
    }).join('');

    // Bank options tags
    const selectedBankKwh = Number(r.selectedBankKwh);
    const bankOptions = Array.isArray(r.bankOptions) ? r.bankOptions : [];
    const bankOptionsHtml = bankOptions.map(s => {
      const bankKwh = Number(s);
      if (!Number.isFinite(bankKwh)) return '';
      return `<span class="tag${bankKwh === selectedBankKwh ? ' tag--primary' : ''}">${bankKwh} kWh</span>`;
    }).join(' ');

    // K_temp status colour
    const tempClass = r.kTempFactor < 0.85
      ? 'result-badge--fail'
      : r.kTempFactor < 0.95
        ? 'result-badge--warn'
        : 'result-badge--pass';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Battery / UPS Sizing Results</h2>
        ${r.systemLabel ? `<p class="field-hint">System: <strong>${escHtml(r.systemLabel)}</strong></p>` : ''}
        <p class="field-hint">Chemistry: <strong>${escHtml(r.chemistryLabel)}</strong>
          &nbsp;|&nbsp; DoD: ${r.dod * 100}%
          &nbsp;|&nbsp; &eta;: ${r.eta * 100}%
          &nbsp;|&nbsp; Aging factor: ${r.agingFactor}&times;</p>

        <!-- Energy chain -->
        <div class="result-group">
          <h3>Energy Requirement (IEEE 485)</h3>
          <div class="result-row">
            <span class="result-label">Net energy required</span>
            <span class="result-value">${r.kwhNet.toFixed(1)} kWh</span>
          </div>
          <p class="field-hint result-formula">
            kWh<sub>net</sub> = ${r.averageLoadKw} kW &times; ${r.runtimeHours} h = ${r.kwhNet.toFixed(1)} kWh
          </p>

          <div class="result-row">
            <span class="result-label">Design capacity (&div; &eta; &times; DoD)</span>
            <span class="result-value">${r.kwhDesign.toFixed(1)} kWh</span>
          </div>
          <p class="field-hint result-formula">
            ${r.kwhNet.toFixed(1)} / (${r.eta} &times; ${r.dod}) = ${r.kwhDesign.toFixed(1)} kWh
          </p>

          <div class="result-row">
            <span class="result-label">Temperature correction
              (K<sub>temp</sub>&nbsp;=&nbsp;${r.kTempFactor})</span>
            <span class="result-value">${r.kwhTempCorrected.toFixed(1)} kWh</span>
          </div>
          <div class="result-badge ${tempClass}" role="status">
            ${r.ambientTempC} &deg;C ambient &rarr; K<sub>temp</sub> = ${r.kTempFactor}
            ${r.kTempFactor < 1.0
              ? ` (capacity de-rated by ${Math.round((1 / r.kTempFactor - 1) * 100)}%)`
              : ' (no de-rating at 25 &deg;C)'}
          </div>

          <div class="result-row">
            <span class="result-label">With aging factor (&times;&nbsp;${r.agingFactor})</span>
            <span class="result-value">${r.kwhWithAging.toFixed(1)} kWh</span>
          </div>

          <div class="result-row">
            <span class="result-label">Final with design margin
              (&times;&nbsp;${(1 + r.designMarginPct / 100).toFixed(2)})</span>
            <span class="result-value"><strong>${r.kwhFinal.toFixed(1)} kWh</strong></span>
          </div>
        </div>

        <!-- Bank selection -->
        <div class="result-group">
          <h3>Battery Bank Selection</h3>
          <div class="result-row">
            <span class="result-label">Recommended bank size</span>
            <span class="result-value"><strong>${r.selectedBankKwh} kWh</strong></span>
          </div>
          ${r.nextLargerKwh
            ? `<div class="result-row">
                <span class="result-label">Next larger standard size</span>
                <span class="result-value">${r.nextLargerKwh} kWh</span>
               </div>`
            : ''}
          <p class="field-hint">Nearby standard sizes: ${bankOptionsHtml}</p>
          ${r.exceedsStandard
            ? `<div class="alert-warn" role="note">
                <strong>Requirement exceeds largest standard size.</strong>
                Multiple parallel battery strings will be required.
               </div>`
            : ''}
        </div>

        <!-- Runtime curve -->
        <div class="result-group">
          <h3>Runtime Curve (${r.selectedBankKwh} kWh bank)</h3>
          <table class="results-table" aria-label="Runtime at various load levels">
            <thead>
              <tr>
                <th scope="col">Load</th>
                <th scope="col">Power (kW)</th>
                <th scope="col">Runtime (h)</th>
              </tr>
            </thead>
            <tbody>
              ${runtimeRows}
            </tbody>
          </table>
          <p class="field-hint">
            Usable energy = ${r.selectedBankKwh} kWh &times; ${r.dod} DoD &times;
            ${r.eta} &eta; = ${(r.selectedBankKwh * r.dod * r.eta).toFixed(1)} kWh
          </p>
        </div>

        <!-- UPS sizing -->
        <div class="result-group">
          <h3>UPS Sizing</h3>
          <div class="result-row">
            <span class="result-label">Required UPS kVA</span>
            <span class="result-value">${r.kvaRequired.toFixed(1)} kVA</span>
          </div>
          <p class="field-hint result-formula">
            kVA = ${r.peakLoadKw} kW / ${r.upsPowerFactor} PF = ${r.kvaRequired.toFixed(1)} kVA
          </p>
          <div class="result-row">
            <span class="result-label">Recommended standard UPS size</span>
            <span class="result-value"><strong>${r.standardKva} kVA</strong></span>
          </div>
        </div>

        ${rackLayoutModel
          ? renderRackLayoutSection(rackLayoutModel)
          : `<div class="alert-warn" role="note"><strong>Rack layout unavailable.</strong> ${escHtml(rackLayoutError)}</div>`}

        ${warningsHtml}

        <p class="field-hint result-timestamp">Analysis run: ${new Date(r.timestamp).toLocaleString()}</p>
      </section>`;
  }

  function renderRackLayoutSection(model) {
    const s = model.summary;
    const warningHtml = model.warnings.length
      ? `<ul class="drc-findings battery-layout-warnings">${model.warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escHtml(w)}</span></li>`
        ).join('')}</ul>`
      : '';

    return `
      <div class="result-group battery-rack-layout" aria-label="Battery rack layout and connections">
        <h3>Rack Layout &amp; Connections</h3>
        <div class="battery-rack-summary-grid">
          ${rackFact('Cells / string', s.cellsPerString)}
          ${rackFact('String energy', `${s.stringKwh.toFixed(1)} kWh`)}
          ${rackFact('Parallel strings', s.requiredParallelStrings)}
          ${rackFact('Modules / string', s.modulesPerString)}
          ${rackFact('Battery racks', s.rackCount)}
          ${rackFact('Installed nominal', `${s.installedKwh.toFixed(1)} kWh`)}
        </div>
        <p class="field-hint">
          Layout generated from ${s.dcBusVoltageV} VDC bus, ${s.nominalCellVoltageV} V nominal cells,
          ${s.cellCapacityAh} Ah cells, ${s.modulesPerRack} module slots per rack, and
          ${s.includeStringProtection ? 'string fuse/disconnect callouts enabled' : 'string protection callouts disabled'}.
        </p>
        <div class="battery-rack-view-grid">
          <figure class="battery-rack-view">
            <figcaption>Top View</figcaption>
            ${renderRackTopViewSvg(model)}
          </figure>
          <figure class="battery-rack-view">
            <figcaption>Elevation View</figcaption>
            ${renderRackElevationSvg(model)}
          </figure>
        </div>
        ${renderRackConnectionTable(model)}
        ${warningHtml}
        <p class="field-hint">
          Coordination view only. Confirm rack footprints, seismic anchorage, ventilation clearance,
          disconnect locations, cable ratings, and final cell/module arrangement against manufacturer shop drawings.
        </p>
      </div>`;
  }

  function rackFact(label, value) {
    return `<div><span>${escHtml(label)}</span><strong>${escHtml(value)}</strong></div>`;
  }

  function renderRackTopViewSvg(model) {
    const { topView, racks, strings, inputs } = model;
    const width = 860;
    const scale = Math.max(
      10,
      Math.min(44, (width - 90) / topView.widthFt, (520 - 80) / topView.depthFt)
    );
    const height = Math.max(300, Math.ceil(80 + topView.depthFt * scale));
    const px = value => 40 + value * scale;
    const py = value => 40 + value * scale;
    const terminalAtFront = topView.terminalSide.startsWith('front');

    const rackRects = racks.map(rack => `
      <g class="battery-rack-plan-rack">
        <title>${escHtml(rack.id)}: ${rack.usedModuleSlots}/${inputs.modulesPerRack} module slots used</title>
        <rect x="${px(rack.xFt).toFixed(1)}" y="${py(rack.yFt).toFixed(1)}"
              width="${(rack.widthFt * scale).toFixed(1)}" height="${(rack.depthFt * scale).toFixed(1)}"></rect>
        <text x="${px(rack.xFt + rack.widthFt / 2).toFixed(1)}"
              y="${py(rack.yFt + rack.depthFt / 2).toFixed(1)}"
              text-anchor="middle" dominant-baseline="middle">${escHtml(rack.id)}</text>
        <text x="${px(rack.xFt + rack.widthFt / 2).toFixed(1)}"
              y="${py(rack.yFt + rack.depthFt / 2).toFixed(1) + 15}"
              text-anchor="middle" class="battery-rack-small-label">${rack.usedModuleSlots}/${inputs.modulesPerRack}</text>
      </g>`).join('');

    const stringRoutes = strings.map((string) => {
      const rack = racks.find(item => item.id === string.startRackId) || racks[0];
      if (!rack) return '';
      const startX = rack.xFt + rack.widthFt / 2;
      const startY = terminalAtFront ? rack.yFt : rack.yFt + rack.depthFt;
      const busY = topView.positiveBus.yFt;
      const color = colorForString(string.index);
      const points = [
        `${px(startX).toFixed(1)},${py(startY).toFixed(1)}`,
        `${px(startX).toFixed(1)},${py(busY).toFixed(1)}`,
        `${px(topView.dcBus.xFt).toFixed(1)},${py(busY).toFixed(1)}`,
      ].join(' ');
      return `
        <polyline class="battery-string-route" points="${points}" style="stroke:${color}">
          <title>${escHtml(string.id)} parallel tie to DC bus</title>
        </polyline>`;
    }).join('');

    return `
      <svg id="battery-rack-top-svg" class="battery-rack-svg" viewBox="0 0 ${width} ${height}"
           role="img" aria-labelledby="battery-rack-top-title battery-rack-top-desc">
        <title id="battery-rack-top-title">Battery rack top view</title>
        <desc id="battery-rack-top-desc">Plan view showing rack footprints, aisles, polarity bus, and DC bus connection.</desc>
        <rect x="${px(0).toFixed(1)}" y="${py(0).toFixed(1)}"
              width="${(topView.widthFt * scale).toFixed(1)}" height="${(topView.depthFt * scale).toFixed(1)}"
              class="battery-layout-room"></rect>
        <rect x="${px(0).toFixed(1)}" y="${py(0).toFixed(1)}"
              width="${(topView.widthFt * scale).toFixed(1)}" height="${(inputs.frontAisleFt * scale).toFixed(1)}"
              class="battery-layout-aisle"></rect>
        <text x="${px(topView.widthFt / 2).toFixed(1)}" y="${py(Math.max(0.35, inputs.frontAisleFt / 2)).toFixed(1)}"
              text-anchor="middle" class="battery-rack-small-label">Front aisle ${inputs.frontAisleFt} ft</text>
        ${rackRects}
        <line class="battery-bus-line battery-bus-line--positive"
              x1="${px(topView.positiveBus.x1Ft).toFixed(1)}" y1="${py(topView.positiveBus.yFt).toFixed(1)}"
              x2="${px(topView.positiveBus.x2Ft).toFixed(1)}" y2="${py(topView.positiveBus.yFt).toFixed(1)}"></line>
        <line class="battery-bus-line battery-bus-line--negative"
              x1="${px(topView.negativeBus.x1Ft).toFixed(1)}" y1="${py(topView.negativeBus.yFt).toFixed(1)}"
              x2="${px(topView.negativeBus.x2Ft).toFixed(1)}" y2="${py(topView.negativeBus.yFt).toFixed(1)}"></line>
        ${stringRoutes}
        <rect class="battery-dc-bus-box"
              x="${(px(topView.dcBus.xFt) - 34).toFixed(1)}" y="${(py(topView.dcBus.yFt) - 18).toFixed(1)}"
              width="68" height="36" rx="4"></rect>
        <text x="${px(topView.dcBus.xFt).toFixed(1)}" y="${(py(topView.dcBus.yFt) + 4).toFixed(1)}"
              text-anchor="middle" class="battery-dc-bus-label">DC BUS</text>
        <text x="${px(topView.positiveBus.x2Ft).toFixed(1)}" y="${(py(topView.positiveBus.yFt) - 8).toFixed(1)}"
              text-anchor="end" class="battery-polarity-label">+</text>
        <text x="${px(topView.negativeBus.x2Ft).toFixed(1)}" y="${(py(topView.negativeBus.yFt) + 16).toFixed(1)}"
              text-anchor="end" class="battery-polarity-label">-</text>
      </svg>`;
  }

  function renderRackElevationSvg(model) {
    const racks = model.racks;
    const { moduleColumns, moduleRows } = model.elevationView;
    const columns = Math.min(4, Math.max(1, racks.length));
    const rows = Math.ceil(racks.length / columns);
    const width = 900;
    const rackGap = 18;
    const rackWidth = Math.min(132, (width - 80 - rackGap * (columns - 1)) / columns);
    const rackHeight = 235;
    const rowGap = 68;
    const height = 70 + rows * (rackHeight + rowGap);
    const rackDraws = new Map();

    const rackGroups = racks.map((rack, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = 40 + col * (rackWidth + rackGap);
      const y = 38 + row * (rackHeight + rowGap);
      rackDraws.set(rack.id, { x, y, width: rackWidth, height: rackHeight });
      const moduleBySlot = new Map(rack.modules.map(module => [module.slot, module]));
      const modules = Array.from({ length: model.inputs.modulesPerRack }, (_, slotIndex) => {
        const slot = slotIndex + 1;
        const module = moduleBySlot.get(slot);
        const box = moduleSlotBox(slot, x, y, rackWidth, rackHeight, moduleColumns, moduleRows);
        const fill = module ? colorForString(module.stringId) : 'transparent';
        return `
          <rect class="battery-module-slot ${module ? 'is-used' : 'is-empty'}"
                x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}"
                width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}"
                style="fill:${fill}">
            <title>${module ? `${module.stringId} module ${module.moduleIndex}, cells ${module.cellStart}-${module.cellEnd}` : `Empty slot ${slot}`}</title>
          </rect>`;
      }).join('');
      return `
        <g class="battery-rack-elevation-rack">
          <rect class="battery-rack-elevation-frame" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
                width="${rackWidth.toFixed(1)}" height="${rackHeight.toFixed(1)}"></rect>
          <text x="${(x + rackWidth / 2).toFixed(1)}" y="${(y + 18).toFixed(1)}"
                text-anchor="middle" class="battery-rack-title">${escHtml(rack.id)}</text>
          ${modules}
          <text x="${(x + rackWidth / 2).toFixed(1)}" y="${(y + rackHeight + 18).toFixed(1)}"
                text-anchor="middle" class="battery-rack-small-label">${rack.usedModuleSlots}/${model.inputs.modulesPerRack} modules</text>
        </g>`;
    }).join('');

    const stringJumpers = model.strings.map((string) => string.rackRanges.map((range) => {
      const rackDraw = rackDraws.get(range.rackId);
      if (!rackDraw) return '';
      const first = moduleSlotBox(range.slotStart, rackDraw.x, rackDraw.y, rackDraw.width, rackDraw.height, moduleColumns, moduleRows);
      const last = moduleSlotBox(range.slotEnd, rackDraw.x, rackDraw.y, rackDraw.width, rackDraw.height, moduleColumns, moduleRows);
      const x = rackDraw.x + rackDraw.width - 6 - ((string.index - 1) % 4) * 4;
      const y1 = Math.min(first.y, last.y) + first.height / 2;
      const y2 = Math.max(first.y, last.y) + last.height / 2;
      const color = colorForString(string.index);
      return `
        <g class="battery-string-jumper">
          <line x1="${x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y2.toFixed(1)}" style="stroke:${color}"></line>
          <text x="${(x - 5).toFixed(1)}" y="${Math.max(rackDraw.y + 36, y1 - 4).toFixed(1)}"
                text-anchor="end" style="fill:${color}">${escHtml(string.id)}</text>
        </g>`;
    }).join('')).join('');

    return `
      <svg id="battery-rack-elevation-svg" class="battery-rack-svg" viewBox="0 0 ${width} ${height}"
           role="img" aria-labelledby="battery-rack-elevation-title battery-rack-elevation-desc">
        <title id="battery-rack-elevation-title">Battery rack elevation view</title>
        <desc id="battery-rack-elevation-desc">Front elevation showing rack module slots, string groupings, and series jumper callouts.</desc>
        ${rackGroups}
        ${stringJumpers}
      </svg>`;
  }

  function moduleSlotBox(slot, rackX, rackY, rackWidth, rackHeight, moduleColumns, moduleRows) {
    const gap = 3;
    const padX = 9;
    const topPad = 30;
    const bottomPad = 12;
    const gridWidth = rackWidth - padX * 2;
    const gridHeight = rackHeight - topPad - bottomPad;
    const moduleWidth = (gridWidth - gap * (moduleColumns - 1)) / moduleColumns;
    const moduleHeight = (gridHeight - gap * (moduleRows - 1)) / moduleRows;
    const index = slot - 1;
    const col = index % moduleColumns;
    const row = Math.floor(index / moduleColumns);
    return {
      x: rackX + padX + col * (moduleWidth + gap),
      y: rackY + topPad + row * (moduleHeight + gap),
      width: moduleWidth,
      height: moduleHeight,
    };
  }

  function renderRackConnectionTable(model) {
    const rows = model.connections.map(connection => `
      <tr>
        <td>${escHtml(connection.type)}</td>
        <td>${escHtml(connection.stringId)}</td>
        <td>${escHtml(connection.polarity)}</td>
        <td>${escHtml(connection.from)}</td>
        <td>${escHtml(connection.to)}</td>
        <td>${escHtml(connection.protection)}</td>
        <td>${escHtml(connection.notes)}</td>
      </tr>`).join('');
    return `
      <div class="table-scroll-x">
        <table class="results-table battery-connection-table" aria-label="Battery rack connection schedule">
          <thead>
            <tr>
              <th scope="col">Connection</th>
              <th scope="col">String</th>
              <th scope="col">Polarity</th>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">Protection</th>
              <th scope="col">Rack / module range</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function colorForString(value) {
    const index = typeof value === 'number'
      ? value - 1
      : Math.max(0, parseInt(String(value).replace(/\D/g, ''), 10) - 1);
    return STRING_COLORS[index % STRING_COLORS.length];
  }

  function escHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
});
