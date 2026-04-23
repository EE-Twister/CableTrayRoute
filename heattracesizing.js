import { runHeatTraceSizingAnalysis } from './analysis/heatTraceSizing.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initAnalysisTabs();
  initSaveAction();

  const form = document.getElementById('heat-trace-form');
  const resultsDiv = document.getElementById('results');
  const overviewSvg = document.getElementById('system-overview-visual');
  const overviewLegend = document.getElementById('system-overview-legend');
  const temperatureProfileChart = document.getElementById('temperature-profile-chart');
  const temperatureProfileLegend = document.getElementById('temperature-profile-legend');
  const heatLossBreakdownChart = document.getElementById('heatloss-breakdown-chart');
  const heatLossBreakdownLegend = document.getElementById('heatloss-breakdown-legend');
  const unitSystemSelect = document.getElementById('unit-system');
  const sensitivityControls = document.getElementById('sensitivity-controls');
  const sensitivitySummary = document.getElementById('sensitivity-summary');
  const sensitivityInsightsList = document.getElementById('sensitivity-insights-list');
  const sensitivitySetBaselineButton = document.getElementById('sensitivity-set-baseline');
  let activeUnitSystem = unitSystemSelect?.value || 'imperial';
  let sensitivityBaseline = null;
  let sensitivityRecommendations = [];

  const sensitivityDrivers = [
    {
      key: 'insulationThicknessIn',
      label: 'Insulation thickness',
      inputId: 'insulation-thickness-in',
      stepDirection: 1,
      unit: () => activeUnitSystem === 'metric' ? 'mm' : 'in',
      fromInputToDisplay: value => activeUnitSystem === 'metric' ? imperialToMetric.insulationThicknessIn(value) : value,
      fromDisplayToInput: value => activeUnitSystem === 'metric' ? metricToImperial.insulationThicknessIn(value) : value,
      format: value => value.toFixed(activeUnitSystem === 'metric' ? 0 : 2),
    },
    {
      key: 'ambientTempC',
      label: 'Ambient temperature',
      inputId: 'ambient-temp-c',
      stepDirection: 1,
      unit: () => activeUnitSystem === 'metric' ? '°C' : '°F',
      fromInputToDisplay: value => activeUnitSystem === 'metric' ? value : cToF(value),
      fromDisplayToInput: value => activeUnitSystem === 'metric' ? value : fToC(value),
      format: value => value.toFixed(0),
    },
    {
      key: 'windSpeedMph',
      label: 'Wind speed',
      inputId: 'wind-speed-mph',
      stepDirection: -1,
      unit: () => activeUnitSystem === 'metric' ? 'km/h' : 'mph',
      fromInputToDisplay: value => activeUnitSystem === 'metric' ? imperialToMetric.windSpeedMph(value) : value,
      fromDisplayToInput: value => activeUnitSystem === 'metric' ? metricToImperial.windSpeedMph(value) : value,
      format: value => value.toFixed(0),
    },
    {
      key: 'maintainTempC',
      label: 'Maintain temperature',
      inputId: 'maintain-temp-c',
      stepDirection: -1,
      unit: () => activeUnitSystem === 'metric' ? '°C' : '°F',
      fromInputToDisplay: value => activeUnitSystem === 'metric' ? value : cToF(value),
      fromDisplayToInput: value => activeUnitSystem === 'metric' ? value : fToC(value),
      format: value => value.toFixed(0),
    },
    {
      key: 'safetyMarginPct',
      label: 'Design margin',
      inputId: 'design-margin-pct',
      stepDirection: -1,
      unit: () => '%',
      fromInputToDisplay: value => value,
      fromDisplayToInput: value => value,
      format: value => value.toFixed(0),
    },
  ];

  initStudyApprovalPanel('heatTraceSizing');

  const saved = getStudies().heatTraceSizing;
  if (saved) {
    const savedUnitSystem = saved.unitSystem || 'imperial';
    if (unitSystemSelect) {
      unitSystemSelect.value = savedUnitSystem;
      activeUnitSystem = savedUnitSystem;
    }
    applyUnitSystem(activeUnitSystem, { convertExistingValues: false });
    renderResults(saved);
    renderSystemOverview(saved);
    renderWorkspaceCharts(saved);
    captureSensitivityBaseline(saved);
  } else {
    applyUnitSystem(activeUnitSystem, { convertExistingValues: false });
    renderSystemOverview(null);
    renderWorkspaceCharts(null);
    captureSensitivityBaseline(getLiveAnalysisResult());
  }

  unitSystemSelect?.addEventListener('change', () => {
    const nextUnitSystem = unitSystemSelect.value;
    if (nextUnitSystem === activeUnitSystem) return;
    applyUnitSystem(nextUnitSystem, { convertExistingValues: true });
    activeUnitSystem = nextUnitSystem;
    renderSystemOverview(getStudies().heatTraceSizing || null);
    renderWorkspaceCharts(getLiveAnalysisResult() || getStudies().heatTraceSizing || null);
    renderSensitivityModule();
  });

  form.addEventListener('input', () => {
    renderWorkspaceCharts(getLiveAnalysisResult() || getStudies().heatTraceSizing || null);
    renderSystemOverview(getLiveAnalysisResult() || getStudies().heatTraceSizing || null);
    renderSensitivityModule();
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    let result;
    try {
      result = runHeatTraceSizingAnalysis(readInputs());
    } catch (err) {
      showModal('Input Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }
    result.unitSystem = activeUnitSystem;

    const studies = getStudies();
    studies.heatTraceSizing = result;
    setStudies(studies);

    renderResults(result);
    renderSystemOverview(result);
    renderWorkspaceCharts(result);
    captureSensitivityBaseline(result);
  });

  sensitivitySetBaselineButton?.addEventListener('click', () => {
    captureSensitivityBaseline(getLiveAnalysisResult() || getStudies().heatTraceSizing || null);
  });

  sensitivityInsightsList?.addEventListener('click', event => {
    const applyButton = event.target.closest('[data-sensitivity-apply]');
    if (!applyButton) return;
    const driverKey = applyButton.getAttribute('data-driver-key');
    const applyValue = parseFloat(applyButton.getAttribute('data-apply-value'));
    applySensitivitySuggestion(driverKey, applyValue);
  });

  function readInputs() {
    const get = id => document.getElementById(id);
    const getFloat = id => parseFloat(get(id).value);

    const ambientValue = getFloat('ambient-temp-c');
    const maintainValue = getFloat('maintain-temp-c');
    const insulationThicknessValue = getFloat('insulation-thickness-in');
    const lineLengthValue = getFloat('line-length-ft');
    const windSpeedValue = getFloat('wind-speed-mph') || 0;
    const maxCircuitLengthValue = getFloat('max-circuit-length-ft') || 0;

    const inputs = {
      pipeNps: get('pipe-nps').value,
      insulationThicknessIn: insulationThicknessValue,
      insulationType: get('insulation-type').value,
      lineLengthFt: lineLengthValue,
      pipeMaterial: get('pipe-material').value,
      environment: get('environment').value,
      ambientTempC: ambientValue,
      maintainTempC: maintainValue,
      windSpeedMph: windSpeedValue,
      safetyMarginPct: getFloat('design-margin-pct'),
      voltageV: getFloat('voltage-v') || 0,
      maxCircuitLengthFt: maxCircuitLengthValue,
    };

    if (activeUnitSystem === 'metric') {
      inputs.insulationThicknessIn = metricToImperial.insulationThicknessIn(insulationThicknessValue);
      inputs.lineLengthFt = metricToImperial.lineLengthFt(lineLengthValue);
      inputs.ambientTempC = ambientValue;
      inputs.maintainTempC = maintainValue;
      inputs.windSpeedMph = metricToImperial.windSpeedMph(windSpeedValue);
      inputs.maxCircuitLengthFt = metricToImperial.maxCircuitLengthFt(maxCircuitLengthValue);
    } else {
      inputs.ambientTempC = imperialToMetric.ambientTempC(ambientValue);
      inputs.maintainTempC = imperialToMetric.maintainTempC(maintainValue);
    }

    return inputs;
  }

  function renderResults(result) {
    const displayDeltaT = result.unitSystem === 'metric'
      ? `${result.deltaT.toFixed(1)} &deg;C`
      : `${cToFDelta(result.deltaT).toFixed(1)} &deg;F`;
    const displayHeatLoss = result.unitSystem === 'metric'
      ? `${(result.requiredWPerM / result.factors.safetyFactor).toFixed(2)} W/m`
      : `${(result.requiredWPerFt / result.factors.safetyFactor).toFixed(2)} W/ft`;
    const displayRequiredOutput = result.unitSystem === 'metric'
      ? `${result.requiredWPerM.toFixed(2)} W/m`
      : `${result.requiredWPerFt.toFixed(2)} W/ft`;
    const displaySelectedRating = result.unitSystem === 'metric'
      ? `${wPerFtToWPerM(result.recommendedCableRatingWPerFt).toFixed(2)} W/m`
      : `${result.recommendedCableRatingWPerFt} W/ft`;
    const lineLengthValue = result.unitSystem === 'metric'
      ? `${imperialToMetric.lineLengthFt(result.lineLengthFt).toFixed(1)} m`
      : `${result.lineLengthFt.toFixed(0)} ft`;
    const utilizationRatio = result.recommendedCableRatingWPerFt > 0
      ? (result.requiredWPerFt / result.recommendedCableRatingWPerFt) * 100
      : 0;
    const circuitCheckPass = result.maxCircuitLengthFt <= 0 || result.lineLengthFt <= result.maxCircuitLengthFt;
    const circuitCheckValue = result.maxCircuitLengthFt > 0
      ? `${lineLengthValue} / ${result.unitSystem === 'metric'
          ? `${imperialToMetric.maxCircuitLengthFt(result.maxCircuitLengthFt).toFixed(1)} m`
          : `${result.maxCircuitLengthFt.toFixed(0)} ft`}`
      : `${lineLengthValue} (no maximum set)`;
    const circuitCheckHelper = circuitCheckPass
      ? 'Circuit length is within the configured limit.'
      : 'Circuit length exceeds the configured maximum. Split the run or reconfigure the circuit.';

    const warningItems = result.warnings.length
      ? `<div class="heattrace-warning-grid" role="list">${result.warnings.map((w) => {
          const severity = classifyHeatTraceWarningSeverity(w);
          return `<article class="heattrace-warning-card heattrace-warning-card--${severity}" role="listitem">
            <div class="heattrace-warning-severity">${severity.toUpperCase()}</div>
            <p class="heattrace-warning-message">${escHtml(w)}</p>
          </article>`;
        }).join('')}</div>`
      : `<article class="heattrace-warning-card heattrace-warning-card--info">
          <div class="heattrace-warning-severity">INFO</div>
          <p class="heattrace-warning-message">No warnings detected for the current assumptions.</p>
        </article>`;

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Heat Trace Sizing Results</h2>

        <div class="result-group heattrace-kpi-grid" role="list" aria-label="Heat trace sizing KPI summary">
          <article class="heattrace-kpi-card" role="listitem">
            <p class="heattrace-kpi-label">Heat loss (base)</p>
            <p class="heattrace-kpi-value">${displayHeatLoss}</p>
            <p class="heattrace-kpi-context">Calculated before safety margin using ΔT of ${displayDeltaT}.</p>
          </article>
          <article class="heattrace-kpi-card" role="listitem">
            <p class="heattrace-kpi-label">Required heat input</p>
            <p class="heattrace-kpi-value">${displayRequiredOutput}</p>
            <p class="heattrace-kpi-context">Includes ${result.safetyMarginPct.toFixed(0)}% margin (${result.factors.safetyFactor.toFixed(2)}× safety factor).</p>
          </article>
          <article class="heattrace-kpi-card" role="listitem">
            <p class="heattrace-kpi-label">Recommended watt density</p>
            <p class="heattrace-kpi-value">${displaySelectedRating}</p>
            <p class="heattrace-kpi-context">Based on ${result.voltageV.toFixed(0)} V basis; utilization ${utilizationRatio.toFixed(1)}% of selected rating.</p>
          </article>
          <article class="heattrace-kpi-card${circuitCheckPass ? '' : ' heattrace-kpi-card--alert'}" role="listitem">
            <p class="heattrace-kpi-label">Circuit check</p>
            <p class="heattrace-kpi-value">${circuitCheckPass ? 'PASS' : 'REVIEW'}</p>
            <p class="heattrace-kpi-context">${escHtml(circuitCheckValue)}. ${escHtml(circuitCheckHelper)}</p>
          </article>
        </div>

        <div class="result-group">
          <h3>Thermal Detail Breakdown</h3>
          <div class="result-row">
            <span class="result-label">Insulation resistance (K·m/W)</span>
            <span class="result-value">${result.thermalResistance.insulationKmPerW.toFixed(4)}</span>
          </div>
          <div class="result-row">
            <span class="result-label">External film resistance (K·m/W)</span>
            <span class="result-value">${result.thermalResistance.externalKmPerW.toFixed(4)}</span>
          </div>
          <div class="result-row">
            <span class="result-label">Total resistance (K·m/W)</span>
            <span class="result-value"><strong>${result.thermalResistance.totalKmPerW.toFixed(4)}</strong></span>
          </div>
          <div class="result-row">
            <span class="result-label">Environment multiplier</span>
            <span class="result-value">${result.factors.environmentMultiplier.toFixed(2)}×</span>
          </div>
          <div class="result-row">
            <span class="result-label">Material factor</span>
            <span class="result-value">${result.factors.materialFactor.toFixed(2)}×</span>
          </div>
          <div class="result-row">
            <span class="result-label">Safety factor</span>
            <span class="result-value">${result.factors.safetyFactor.toFixed(2)}×</span>
          </div>
          <div class="result-row">
            <span class="result-label">Total estimated circuit load</span>
            <span class="result-value">${result.totalCircuitWatts.toFixed(0)} W</span>
          </div>
        </div>

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningItems}
        </div>
      </section>`;
  }

  function renderSystemOverview(result) {
    if (!overviewSvg || !overviewLegend) return;
    const currentInputs = readInputs();
    const pipeNpsValue = parseFloat(currentInputs.pipeNps) || 1;
    const insulationThicknessIn = Math.max(0.1, currentInputs.insulationThicknessIn || 0.1);
    const lineLengthFt = Math.max(1, currentInputs.lineLengthFt || 1);
    const ambientTempC = currentInputs.ambientTempC;
    const windSpeedMph = currentInputs.windSpeedMph || 0;

    const pipeOuterRadius = 18 + Math.min(28, pipeNpsValue * 3.4);
    const insulationOuterRadius = pipeOuterRadius + Math.min(42, insulationThicknessIn * 12);
    const lineBodyWidth = Math.max(300, Math.min(680, lineLengthFt * 1.8));
    const startX = 70;
    const endX = startX + lineBodyWidth;
    const centerY = 160;

    const diameterText = activeUnitSystem === 'metric'
      ? `${imperialToMetric.insulationThicknessIn(insulationThicknessIn).toFixed(0)} mm insulation`
      : `${insulationThicknessIn.toFixed(2)} in insulation`;
    const lengthText = activeUnitSystem === 'metric'
      ? `${imperialToMetric.lineLengthFt(lineLengthFt).toFixed(1)} m run`
      : `${lineLengthFt.toFixed(0)} ft run`;
    const ambientText = activeUnitSystem === 'metric'
      ? `${ambientTempC.toFixed(1)} °C ambient, ${imperialToMetric.windSpeedMph(windSpeedMph).toFixed(0)} km/h wind`
      : `${cToF(ambientTempC).toFixed(1)} °F ambient, ${windSpeedMph.toFixed(0)} mph wind`;
    const cableRatingText = result
      ? (activeUnitSystem === 'metric'
          ? `${wPerFtToWPerM(result.recommendedCableRatingWPerFt).toFixed(1)} W/m selected`
          : `${result.recommendedCableRatingWPerFt} W/ft selected`)
      : 'Run analysis for cable rating';

    overviewSvg.innerHTML = `
      <rect x="20" y="30" width="840" height="270" rx="14" fill="color-mix(in srgb, var(--panel-bg, #f8fafc) 90%, #dbeafe 10%)" stroke="var(--border-color, #7d8790)" />
      <line x1="${startX}" y1="${centerY}" x2="${endX}" y2="${centerY}" stroke="#0f172a" stroke-width="${insulationOuterRadius * 2}" stroke-linecap="round" opacity="0.15" />
      <line x1="${startX}" y1="${centerY}" x2="${endX}" y2="${centerY}" stroke="#2563eb" stroke-width="${pipeOuterRadius * 2}" stroke-linecap="round" opacity="0.7" />
      <path d="M ${startX + 15} ${centerY - pipeOuterRadius - 10} L ${endX - 15} ${centerY - pipeOuterRadius - 10}" stroke="#f97316" stroke-width="6" stroke-linecap="round" stroke-dasharray="12 10" />
      <line x1="${startX + 85}" y1="${centerY + insulationOuterRadius + 24}" x2="${endX - 85}" y2="${centerY + insulationOuterRadius + 24}" stroke="var(--text-color, #1f2b3a)" stroke-width="2" marker-start="url(#overview-arrow)" marker-end="url(#overview-arrow)" />
      <defs>
        <marker id="overview-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--text-color, #1f2b3a)" />
        </marker>
      </defs>
      <text x="${startX + 95}" y="${centerY + insulationOuterRadius + 45}" fill="var(--text-color, #1f2b3a)" font-size="14">${escHtml(lengthText)}</text>
      ${renderCallout(1, startX + 40, centerY - 94, startX + 120, centerY - 40, `Pipe material: ${formatMaterialLabel(currentInputs.pipeMaterial)}`)}
      ${renderCallout(2, startX + 180, centerY - 132, startX + 220, centerY - (insulationOuterRadius + 8), `Insulation: ${formatMaterialLabel(currentInputs.insulationType)} (${diameterText})`)}
      ${renderCallout(3, endX - 200, centerY - 118, endX - 130, centerY - pipeOuterRadius - 10, `Heat trace cable: ${cableRatingText}`)}
      ${renderCallout(4, endX - 225, centerY + 122, endX - 60, centerY + insulationOuterRadius + 5, `Ambient: ${ambientText}`)}
    `;

    overviewLegend.innerHTML = `
      <li><span class="legend-marker legend-pipe" aria-hidden="true"></span><span><strong>1.</strong> Pipe material (${escHtml(formatMaterialLabel(currentInputs.pipeMaterial))})</span></li>
      <li><span class="legend-marker legend-insulation" aria-hidden="true"></span><span><strong>2.</strong> Insulation type/thickness (${escHtml(formatMaterialLabel(currentInputs.insulationType))}, ${escHtml(diameterText)})</span></li>
      <li><span class="legend-marker legend-cable" aria-hidden="true"></span><span><strong>3.</strong> Heat trace cable (${escHtml(cableRatingText)})</span></li>
      <li><span class="legend-marker legend-ambient" aria-hidden="true"></span><span><strong>4.</strong> Ambient conditions (${escHtml(ambientText)})</span></li>
    `;
  }

  function getLiveAnalysisResult() {
    try {
      const liveResult = runHeatTraceSizingAnalysis(readInputs());
      liveResult.unitSystem = activeUnitSystem;
      return liveResult;
    } catch (err) {
      return null;
    }
  }

  function renderWorkspaceCharts(result) {
    renderTemperatureProfileChart(result);
    renderHeatLossBreakdownChart(result);
  }

  function renderTemperatureProfileChart(result) {
    if (!temperatureProfileChart || !temperatureProfileLegend) return;
    if (!result) {
      renderEmptyChart(temperatureProfileChart, 'Run analysis to render temperature profile.');
      temperatureProfileLegend.innerHTML = '';
      return;
    }

    const lengthUnit = result.unitSystem === 'metric' ? 'm' : 'ft';
    const temperatureUnit = result.unitSystem === 'metric' ? '°C' : '°F';
    const totalLength = result.unitSystem === 'metric'
      ? imperialToMetric.lineLengthFt(result.lineLengthFt)
      : result.lineLengthFt;
    const maintainTemp = result.unitSystem === 'metric' ? result.maintainTempC : cToF(result.maintainTempC);
    const ambientTemp = result.unitSystem === 'metric' ? result.ambientTempC : cToF(result.ambientTempC);
    const temperatureSpan = Math.max(0.5, maintainTemp - ambientTemp);
    const windFactor = Math.min(1.6, 1 + (result.windSpeedMph / 28));
    const externalRatio = result.thermalResistance.totalKmPerW > 0
      ? (result.thermalResistance.externalKmPerW / result.thermalResistance.totalKmPerW)
      : 0.4;

    const sampleCount = 11;
    const surfacePoints = [];
    const maintainPoints = [];
    const ambientPoints = [];
    for (let idx = 0; idx < sampleCount; idx += 1) {
      const progress = idx / (sampleCount - 1);
      const distance = totalLength * progress;
      const decay = 0.08 + (0.3 * progress * windFactor * externalRatio);
      const surfaceTemp = maintainTemp - (temperatureSpan * Math.min(0.85, decay));
      surfacePoints.push({ x: distance, y: surfaceTemp });
      maintainPoints.push({ x: distance, y: maintainTemp });
      ambientPoints.push({ x: distance, y: ambientTemp });
    }

    const chartSeries = [
      { label: `Pipe surface (${temperatureUnit})`, color: '#f97316', points: surfacePoints },
      { label: `Maintain target (${temperatureUnit})`, color: '#2563eb', points: maintainPoints },
      { label: `Ambient (${temperatureUnit})`, color: '#14b8a6', points: ambientPoints },
    ];
    renderLineChartSvg(temperatureProfileChart, {
      series: chartSeries,
      xLabel: `Pipe length (${lengthUnit})`,
      yLabel: `Temperature (${temperatureUnit})`,
    });
    temperatureProfileLegend.innerHTML = chartSeries.map(item => (
      `<li><span class="heattrace-chart-swatch" style="background:${item.color}" aria-hidden="true"></span><span>${escHtml(item.label)}</span></li>`
    )).join('');
  }

  function renderHeatLossBreakdownChart(result) {
    if (!heatLossBreakdownChart || !heatLossBreakdownLegend) return;
    if (!result) {
      renderEmptyChart(heatLossBreakdownChart, 'Run analysis to render heat-loss breakdown.');
      heatLossBreakdownLegend.innerHTML = '';
      return;
    }

    const outputUnit = result.unitSystem === 'metric' ? 'W/m' : 'W/ft';
    const requiredOutput = result.unitSystem === 'metric' ? result.requiredWPerM : result.requiredWPerFt;
    const preMarginOutput = requiredOutput / result.factors.safetyFactor;
    const conductionShare = result.thermalResistance.totalKmPerW > 0
      ? result.thermalResistance.insulationKmPerW / result.thermalResistance.totalKmPerW
      : 0.5;
    const filmShare = Math.max(0, 1 - conductionShare);
    const segments = [
      {
        label: `Conduction (${outputUnit})`,
        value: preMarginOutput * conductionShare,
        color: '#2563eb',
      },
      {
        label: `Convection / film (${outputUnit})`,
        value: preMarginOutput * filmShare,
        color: '#14b8a6',
      },
      {
        label: `Margin (${outputUnit})`,
        value: Math.max(0, requiredOutput - preMarginOutput),
        color: '#f97316',
      },
    ];

    renderDonutChartSvg(heatLossBreakdownChart, segments, outputUnit);
    heatLossBreakdownLegend.innerHTML = segments.map(segment => (
      `<li><span class="heattrace-chart-swatch" style="background:${segment.color}" aria-hidden="true"></span><span>${escHtml(segment.label)}: ${segment.value.toFixed(2)} ${outputUnit}</span></li>`
    )).join('');
  }

  function renderEmptyChart(svg, message) {
    svg.innerHTML = `
      <rect x="12" y="12" width="736" height="336" rx="12" fill="color-mix(in srgb, var(--panel-bg, #f8fafc) 98%, #e2e8f0 2%)" stroke="var(--border-color, #7d8790)" />
      <text x="380" y="185" text-anchor="middle" fill="var(--text-muted, #64748b)" font-size="15">${escHtml(message)}</text>
    `;
  }

  function renderLineChartSvg(svg, { series, xLabel, yLabel }) {
    const width = 760;
    const height = 360;
    const margin = { top: 24, right: 24, bottom: 58, left: 64 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const allPoints = series.flatMap(item => item.points);
    const xMax = Math.max(...allPoints.map(point => point.x), 1);
    const yMinRaw = Math.min(...allPoints.map(point => point.y));
    const yMaxRaw = Math.max(...allPoints.map(point => point.y));
    const yPadding = Math.max(1, (yMaxRaw - yMinRaw) * 0.14);
    const yMin = yMinRaw - yPadding;
    const yMax = yMaxRaw + yPadding;
    const xToSvg = x => margin.left + ((x / xMax) * plotWidth);
    const yToSvg = y => margin.top + (((yMax - y) / (yMax - yMin || 1)) * plotHeight);
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map(frac => ({ value: xMax * frac, x: xToSvg(xMax * frac) }));
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(frac => {
      const value = yMin + ((yMax - yMin) * frac);
      return { value, y: yToSvg(value) };
    });
    const paths = series.map(item => {
      const d = item.points.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${xToSvg(point.x).toFixed(2)} ${yToSvg(point.y).toFixed(2)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></path>`;
    }).join('');

    svg.innerHTML = `
      <rect x="12" y="12" width="736" height="336" rx="12" fill="color-mix(in srgb, var(--panel-bg, #f8fafc) 97%, #dbeafe 3%)" stroke="var(--border-color, #7d8790)" />
      ${yTicks.map(tick => `<line x1="${margin.left}" y1="${tick.y}" x2="${width - margin.right}" y2="${tick.y}" stroke="color-mix(in srgb, var(--border-color, #7d8790) 40%, transparent)" />`).join('')}
      ${xTicks.map(tick => `<line x1="${tick.x}" y1="${margin.top}" x2="${tick.x}" y2="${height - margin.bottom}" stroke="color-mix(in srgb, var(--border-color, #7d8790) 35%, transparent)" />`).join('')}
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="var(--text-color, #1f2b3a)" stroke-width="1.4"></line>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="var(--text-color, #1f2b3a)" stroke-width="1.4"></line>
      ${paths}
      ${xTicks.map(tick => `<text x="${tick.x}" y="${height - margin.bottom + 20}" text-anchor="middle" fill="var(--text-muted, #64748b)" font-size="12">${tick.value.toFixed(1)}</text>`).join('')}
      ${yTicks.map(tick => `<text x="${margin.left - 9}" y="${tick.y + 4}" text-anchor="end" fill="var(--text-muted, #64748b)" font-size="12">${tick.value.toFixed(1)}</text>`).join('')}
      <text x="${margin.left + (plotWidth / 2)}" y="${height - 14}" text-anchor="middle" fill="var(--text-color, #1f2b3a)" font-size="13">${escHtml(xLabel)}</text>
      <text x="18" y="${margin.top + (plotHeight / 2)}" transform="rotate(-90 18 ${margin.top + (plotHeight / 2)})" text-anchor="middle" fill="var(--text-color, #1f2b3a)" font-size="13">${escHtml(yLabel)}</text>
    `;
  }

  function renderDonutChartSvg(svg, segments, valueUnit) {
    const centerX = 250;
    const centerY = 180;
    const outerRadius = 110;
    const innerRadius = 62;
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    if (!Number.isFinite(total) || total <= 0) {
      renderEmptyChart(svg, 'No non-zero thermal contributions to chart.');
      return;
    }

    let currentAngle = -Math.PI / 2;
    const arcs = segments.map(segment => {
      const segmentAngle = (segment.value / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + segmentAngle;
      currentAngle = endAngle;
      return createArcPath(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle, segment.color);
    }).join('');

    const annotationX = 420;
    svg.innerHTML = `
      <rect x="12" y="12" width="736" height="336" rx="12" fill="color-mix(in srgb, var(--panel-bg, #f8fafc) 97%, #dbeafe 3%)" stroke="var(--border-color, #7d8790)" />
      ${arcs}
      <circle cx="${centerX}" cy="${centerY}" r="${innerRadius - 0.5}" fill="color-mix(in srgb, var(--panel-bg, #f8fafc) 98%, #e2e8f0 2%)"></circle>
      <text x="${centerX}" y="${centerY - 4}" text-anchor="middle" fill="var(--text-muted, #64748b)" font-size="12">Total</text>
      <text x="${centerX}" y="${centerY + 18}" text-anchor="middle" fill="var(--text-color, #1f2b3a)" font-size="16" font-weight="700">${total.toFixed(2)} ${escHtml(valueUnit)}</text>
      ${segments.map((segment, idx) => `
        <text x="${annotationX}" y="${102 + (idx * 34)}" fill="${segment.color}" font-size="13">●</text>
        <text x="${annotationX + 18}" y="${102 + (idx * 34)}" fill="var(--text-color, #1f2b3a)" font-size="13">${escHtml(segment.label)}: ${segment.value.toFixed(2)} ${escHtml(valueUnit)}</text>
      `).join('')}
    `;
  }

  function createArcPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill) {
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
    const startOuterX = cx + (outerRadius * Math.cos(startAngle));
    const startOuterY = cy + (outerRadius * Math.sin(startAngle));
    const endOuterX = cx + (outerRadius * Math.cos(endAngle));
    const endOuterY = cy + (outerRadius * Math.sin(endAngle));
    const startInnerX = cx + (innerRadius * Math.cos(startAngle));
    const startInnerY = cy + (innerRadius * Math.sin(startAngle));
    const endInnerX = cx + (innerRadius * Math.cos(endAngle));
    const endInnerY = cy + (innerRadius * Math.sin(endAngle));

    return `
      <path d="
        M ${startOuterX} ${startOuterY}
        A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuterX} ${endOuterY}
        L ${endInnerX} ${endInnerY}
        A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInnerX} ${startInnerY}
        Z
      " fill="${fill}"></path>
    `;
  }

  function applyUnitSystem(unitSystem, { convertExistingValues = true } = {}) {
    const fieldConfigs = [
      {
        id: 'insulation-thickness-in',
        labelId: 'insulation-thickness-label',
        imperialLabel: 'Insulation thickness (in)',
        metricLabel: 'Insulation thickness (mm)',
        imperialMin: 0.25,
        imperialMax: null,
        imperialStep: 0.25,
        metricMin: 6.35,
        metricMax: null,
        metricStep: 1,
        toMetric: imperialToMetric.insulationThicknessIn,
        toImperial: metricToImperial.insulationThicknessIn,
      },
      {
        id: 'line-length-ft',
        labelId: 'line-length-label',
        imperialLabel: 'Circuit length (ft)',
        metricLabel: 'Circuit length (m)',
        imperialMin: 1,
        imperialMax: null,
        imperialStep: 1,
        metricMin: 0.3,
        metricMax: null,
        metricStep: 0.1,
        toMetric: imperialToMetric.lineLengthFt,
        toImperial: metricToImperial.lineLengthFt,
      },
      {
        id: 'ambient-temp-c',
        labelId: 'ambient-temp-label',
        imperialLabel: 'Ambient temperature (&deg;F)',
        metricLabel: 'Ambient temperature (&deg;C)',
        imperialMin: -76,
        imperialMax: 140,
        imperialStep: 1,
        metricMin: -60,
        metricMax: 60,
        metricStep: 1,
        toMetric: imperialToMetric.ambientTempC,
        toImperial: metricToImperial.ambientTempC,
      },
      {
        id: 'wind-speed-mph',
        labelId: 'wind-speed-label',
        imperialLabel: 'Wind speed (mph)',
        metricLabel: 'Wind speed (km/h)',
        imperialMin: 0,
        imperialMax: 100,
        imperialStep: 1,
        metricMin: 0,
        metricMax: 161,
        metricStep: 1,
        toMetric: imperialToMetric.windSpeedMph,
        toImperial: metricToImperial.windSpeedMph,
      },
      {
        id: 'maintain-temp-c',
        labelId: 'maintain-temp-label',
        imperialLabel: 'Maintain temperature (&deg;F)',
        metricLabel: 'Maintain temperature (&deg;C)',
        imperialMin: -4,
        imperialMax: 482,
        imperialStep: 1,
        metricMin: -20,
        metricMax: 250,
        metricStep: 1,
        toMetric: imperialToMetric.maintainTempC,
        toImperial: metricToImperial.maintainTempC,
      },
      {
        id: 'max-circuit-length-ft',
        labelId: 'max-circuit-length-label',
        imperialLabel: 'Maximum allowable circuit length (ft)',
        metricLabel: 'Maximum allowable circuit length (m)',
        imperialMin: 10,
        imperialMax: null,
        imperialStep: 10,
        metricMin: 3,
        metricMax: null,
        metricStep: 1,
        toMetric: imperialToMetric.maxCircuitLengthFt,
        toImperial: metricToImperial.maxCircuitLengthFt,
      },
    ];

    fieldConfigs.forEach(config => {
      const input = document.getElementById(config.id);
      const label = document.getElementById(config.labelId);
      if (!input || !label) return;

      const currentValue = parseFloat(input.value);
      const convertedValue = convertExistingValues && Number.isFinite(currentValue)
        ? (unitSystem === 'metric' ? config.toMetric(currentValue) : config.toImperial(currentValue))
        : currentValue;

      if (unitSystem === 'metric') {
        setLabelText(label, config.metricLabel);
        input.min = String(config.metricMin);
        input.step = String(config.metricStep);
        if (config.metricMax == null) {
          input.removeAttribute('max');
        } else {
          input.max = String(config.metricMax);
        }
      } else {
        setLabelText(label, config.imperialLabel);
        input.min = String(config.imperialMin);
        input.step = String(config.imperialStep);
        if (config.imperialMax == null) {
          input.removeAttribute('max');
        } else {
          input.max = String(config.imperialMax);
        }
      }

      if (convertExistingValues && Number.isFinite(convertedValue)) {
        input.value = roundForDisplay(convertedValue, config.id);
      }
    });
  }

  function captureSensitivityBaseline(result) {
    if (!result) {
      sensitivityBaseline = null;
      sensitivityRecommendations = [];
      renderSensitivityModule();
      return;
    }

    sensitivityBaseline = {
      inputs: readInputs(),
      result,
    };
    renderSensitivityModule();
  }

  function renderSensitivityModule() {
    if (!sensitivityControls || !sensitivitySummary || !sensitivityInsightsList) return;
    if (!sensitivityBaseline || !sensitivityBaseline.result) {
      sensitivityControls.innerHTML = '<p class="field-hint">Run analysis to initialize sensitivity sliders.</p>';
      sensitivitySummary.innerHTML = '';
      sensitivityInsightsList.innerHTML = '';
      return;
    }

    const sensitivityRows = [];
    for (const driver of sensitivityDrivers) {
      const slider = getOrCreateSensitivitySlider(driver);
      const displayValue = parseFloat(slider.value);
      const scenarioInputs = {
        ...sensitivityBaseline.inputs,
        [driver.key]: driver.fromDisplayToInput(displayValue),
      };
      const scenarioResult = safeRunSensitivityCase(scenarioInputs);
      const deltaWPerFt = scenarioResult
        ? scenarioResult.requiredWPerFt - sensitivityBaseline.result.requiredWPerFt
        : NaN;
      sensitivityRows.push({
        driver,
        slider,
        displayValue,
        scenarioResult,
        deltaWPerFt,
      });
    }

    sensitivitySummary.innerHTML = `
      <div class="heattrace-sensitivity-grid" role="list" aria-label="Sensitivity deltas versus baseline">
        ${sensitivityRows.map(row => {
          const deltaText = Number.isFinite(row.deltaWPerFt)
            ? formatDeltaOutput(row.deltaWPerFt)
            : 'Invalid scenario';
          const deltaClass = !Number.isFinite(row.deltaWPerFt)
            ? 'warning'
            : (row.deltaWPerFt > 0 ? 'increase' : (row.deltaWPerFt < 0 ? 'decrease' : 'neutral'));
          return `
            <article class="heattrace-sensitivity-result heattrace-sensitivity-result--${deltaClass}" role="listitem">
              <p class="heattrace-kpi-label">${escHtml(row.driver.label)}</p>
              <p class="heattrace-kpi-value">${escHtml(row.driver.format(row.displayValue))} ${escHtml(row.driver.unit())}</p>
              <p class="heattrace-kpi-context">Δ required output vs baseline: <strong>${escHtml(deltaText)}</strong></p>
            </article>
          `;
        }).join('')}
      </div>
    `;

    sensitivityRecommendations = buildSensitivityRecommendations();
    if (!sensitivityRecommendations.length) {
      sensitivityInsightsList.innerHTML = '<li class="field-hint">No lower-output recommendation found within one slider step from baseline.</li>';
      return;
    }
    sensitivityInsightsList.innerHTML = sensitivityRecommendations.map((recommendation, index) => `
      <li class="heattrace-insight-item">
        <div>
          <strong>${index + 1}. ${escHtml(recommendation.title)}</strong>
          <p>${escHtml(recommendation.detail)}</p>
        </div>
        <button
          type="button"
          class="btn"
          data-sensitivity-apply="true"
          data-driver-key="${escHtml(recommendation.driverKey)}"
          data-apply-value="${recommendation.applyValue.toFixed(4)}"
        >Quick Apply</button>
      </li>
    `).join('');
  }

  function getOrCreateSensitivitySlider(driver) {
    const existing = sensitivityControls.querySelector(`#sensitivity-${driver.inputId}`);
    const sourceInput = document.getElementById(driver.inputId);
    if (existing && sourceInput) {
      existing.min = sourceInput.min || '0';
      existing.max = sourceInput.max || '500';
      existing.step = sourceInput.step || '1';
      if (existing.dataset.unitSystem !== activeUnitSystem) {
        existing.value = sourceInput.value;
      }
      existing.dataset.unitSystem = activeUnitSystem;
      const existingValueTag = document.getElementById(`sensitivity-${driver.inputId}-value`);
      if (existingValueTag) {
        existingValueTag.textContent = `${driver.format(parseFloat(existing.value))} ${driver.unit()}`;
      }
      return existing;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'heattrace-sensitivity-row';
    wrapper.innerHTML = `
      <label for="sensitivity-${driver.inputId}">
        ${escHtml(driver.label)} <span class="heattrace-sensitivity-value" id="sensitivity-${driver.inputId}-value"></span>
      </label>
      <input type="range" id="sensitivity-${driver.inputId}" class="heattrace-sensitivity-slider">
    `;
    sensitivityControls.appendChild(wrapper);

    const slider = wrapper.querySelector('input');
    const valueLabel = wrapper.querySelector('.heattrace-sensitivity-value');
    if (!sourceInput) return slider;

    slider.min = sourceInput.min || '0';
    slider.max = sourceInput.max || '500';
    slider.step = sourceInput.step || '1';
    slider.value = sourceInput.value;
    slider.dataset.unitSystem = activeUnitSystem;

    const updateLabel = () => {
      valueLabel.textContent = `${driver.format(parseFloat(slider.value))} ${driver.unit()}`;
    };
    updateLabel();
    slider.addEventListener('input', () => {
      updateLabel();
      renderSensitivityModule();
    });
    return slider;
  }

  function buildSensitivityRecommendations() {
    if (!sensitivityBaseline) return [];
    const baselineRequiredWPerFt = sensitivityBaseline.result.requiredWPerFt;
    const recommendations = [];

    for (const driver of sensitivityDrivers) {
      const slider = sensitivityControls.querySelector(`#sensitivity-${driver.inputId}`);
      if (!slider) continue;
      const step = parseFloat(slider.step) || 1;
      const currentValue = parseFloat(slider.value);
      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      const suggestedValue = clampValue(currentValue + (driver.stepDirection * step), min, max);
      if (!Number.isFinite(suggestedValue) || suggestedValue === currentValue) continue;
      const scenarioInputs = {
        ...sensitivityBaseline.inputs,
        [driver.key]: driver.fromDisplayToInput(suggestedValue),
      };
      const scenarioResult = safeRunSensitivityCase(scenarioInputs);
      if (!scenarioResult) continue;
      const improvementWPerFt = baselineRequiredWPerFt - scenarioResult.requiredWPerFt;
      if (improvementWPerFt <= 0) continue;

      recommendations.push({
        driverKey: driver.key,
        applyValue: suggestedValue,
        improvementWPerFt,
        title: `${driver.label}: move to ${driver.format(suggestedValue)} ${driver.unit()}`,
        detail: `Estimated reduction in required output: ${formatDeltaOutput(-improvementWPerFt)}.`,
      });
    }

    return recommendations.sort((a, b) => b.improvementWPerFt - a.improvementWPerFt).slice(0, 3);
  }

  function applySensitivitySuggestion(driverKey, applyValue) {
    const driver = sensitivityDrivers.find(item => item.key === driverKey);
    if (!driver || !Number.isFinite(applyValue)) return;
    const input = document.getElementById(driver.inputId);
    if (!input) return;
    input.value = roundForDisplay(applyValue, driver.inputId);
    const slider = sensitivityControls.querySelector(`#sensitivity-${driver.inputId}`);
    if (slider) {
      slider.value = roundForDisplay(applyValue, driver.inputId);
      const valueTag = document.getElementById(`sensitivity-${driver.inputId}-value`);
      if (valueTag) valueTag.textContent = `${driver.format(parseFloat(slider.value))} ${driver.unit()}`;
    }
    renderSystemOverview(getLiveAnalysisResult() || getStudies().heatTraceSizing || null);
    renderWorkspaceCharts(getLiveAnalysisResult() || getStudies().heatTraceSizing || null);
    renderSensitivityModule();
  }

  function safeRunSensitivityCase(inputs) {
    try {
      return runHeatTraceSizingAnalysis(inputs);
    } catch (err) {
      return null;
    }
  }

  function formatDeltaOutput(deltaWPerFt) {
    const magnitude = Math.abs(deltaWPerFt);
    const sign = deltaWPerFt > 0 ? '+' : (deltaWPerFt < 0 ? '−' : '±');
    if (activeUnitSystem === 'metric') {
      return `${sign}${wPerFtToWPerM(magnitude).toFixed(2)} W/m`;
    }
    return `${sign}${magnitude.toFixed(2)} W/ft`;
  }

  function clampValue(value, min, max) {
    let nextValue = value;
    if (Number.isFinite(min)) nextValue = Math.max(min, nextValue);
    if (Number.isFinite(max)) nextValue = Math.min(max, nextValue);
    return nextValue;
  }

  function renderCallout(number, x, y, anchorX, anchorY, label) {
    return `
      <line x1="${x + 8}" y1="${y + 8}" x2="${anchorX}" y2="${anchorY}" stroke="var(--text-color, #1f2b3a)" stroke-width="1.5" />
      <circle cx="${x}" cy="${y}" r="14" fill="var(--accent-color, #2a6fd6)" />
      <text x="${x}" y="${y + 4}" fill="#fff" font-size="12" font-weight="700" text-anchor="middle">${number}</text>
      <text x="${x + 22}" y="${y + 5}" fill="var(--text-color, #1f2b3a)" font-size="13">${escHtml(label)}</text>
    `;
  }
});

function initAnalysisTabs() {
  const tabs = Array.from(document.querySelectorAll('.heattrace-tab[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('.heattrace-panel[role="tabpanel"]'));
  if (!tabs.length || !panels.length) return;

  const activateTab = nextTab => {
    tabs.forEach(tab => {
      const isActive = tab === nextTab;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.tabIndex = isActive ? 0 : -1;
    });

    panels.forEach(panel => {
      const showPanel = panel.id === nextTab.getAttribute('aria-controls');
      panel.hidden = !showPanel;
    });
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      let nextIndex = index;
      if (event.key === 'ArrowRight') {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      activateTab(nextTab);
      nextTab.focus();
    });
  });
}

function initSaveAction() {
  const saveActionButton = document.getElementById('heattrace-save-action');
  const primarySaveButton = document.getElementById('save-project-btn');
  if (!saveActionButton || !primarySaveButton) return;

  saveActionButton.addEventListener('click', () => {
    primarySaveButton.click();
  });
}

function roundForDisplay(value, fieldId) {
  const precisionByField = {
    'insulation-thickness-in': 1,
    'line-length-ft': 1,
    'ambient-temp-c': 0,
    'wind-speed-mph': 0,
    'maintain-temp-c': 0,
    'max-circuit-length-ft': 0,
    'design-margin-pct': 0,
  };
  const decimals = precisionByField[fieldId] ?? 2;
  return value.toFixed(decimals);
}

function setLabelText(label, text) {
  const helpButton = label.querySelector('.helpBtn');
  if (helpButton) {
    const existingTextNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    if (existingTextNode) {
      existingTextNode.textContent = `${text} `;
    } else {
      label.insertBefore(document.createTextNode(`${text} `), helpButton);
    }
    return;
  }
  label.innerHTML = text;
}

function cToF(tempC) {
  return (tempC * 9 / 5) + 32;
}

function fToC(tempF) {
  return (tempF - 32) * 5 / 9;
}

function cToFDelta(deltaC) {
  return deltaC * 9 / 5;
}

function wPerFtToWPerM(wPerFt) {
  return wPerFt / 0.3048;
}

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

  function formatMaterialLabel(value) {
  const labels = {
    carbonSteel: 'Carbon Steel',
    stainlessSteel: 'Stainless Steel',
    copper: 'Copper',
    aluminum: 'Aluminum',
    pvc: 'PVC',
    hdpe: 'HDPE',
    mineralWool: 'Mineral Wool',
    closedCellFoam: 'Closed Cell Foam',
    fiberglass: 'Fiberglass',
    calciumSilicate: 'Calcium Silicate',
    aerogelBlanket: 'Aerogel Blanket',
    'indoor-still': 'Indoor — Still Air',
    'outdoor-sheltered': 'Outdoor — Sheltered',
    'outdoor-windy': 'Outdoor — Windy',
    'hazardous-area': 'Hazardous Area',
    freezer: 'Freezer / Cold Room',
  };
  return labels[value] || String(value ?? '');
  }

  function classifyHeatTraceWarningSeverity(message) {
    const text = String(message || '').toLowerCase();
    if (text.includes('exceeds available standard ratings') || text.includes('exceeds')) return 'error';
    if (text.includes('very low ambient') || text.includes('high wind') || text.includes('long circuit length')) return 'warning';
    return 'info';
  }

const imperialToMetric = {
  ambientTempC: fToC,
  maintainTempC: fToC,
  insulationThicknessIn: inches => inches * 25.4,
  lineLengthFt: feet => feet * 0.3048,
  windSpeedMph: mph => mph * 1.60934,
  maxCircuitLengthFt: feet => feet * 0.3048,
};

const metricToImperial = {
  ambientTempC: cToF,
  maintainTempC: cToF,
  insulationThicknessIn: mm => mm / 25.4,
  lineLengthFt: meters => meters / 0.3048,
  windSpeedMph: kmh => kmh / 1.60934,
  maxCircuitLengthFt: meters => meters / 0.3048,
};
