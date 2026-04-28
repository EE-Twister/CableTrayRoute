import {
  HEAT_TRACE_CABLE_TYPES,
  HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES,
  runHeatTraceSizingAnalysis,
} from './analysis/heatTraceSizing.mjs';
import {
  buildHeatTraceBranchSchedule,
  buildHeatTraceReport,
  renderHeatTraceReportHTML,
} from './analysis/heatTraceReport.mjs';
import {
  buildHeatTraceInstallationPackage,
  renderHeatTraceInstallationPackageHTML,
} from './analysis/heatTraceInstallationPackage.mjs';
import {
  buildHeatTraceAdvancedPackage,
  renderHeatTraceAdvancedHTML,
} from './analysis/heatTraceAdvancedAssets.mjs';
import { getStudies, getStudyApprovals, setStudies } from './dataStore.mjs';
import { getProjectState } from './projectStorage.js';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { initStudyBasisPanel } from './src/components/studyBasis.js';

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
  const componentRoutingGuide = document.getElementById('component-routing-guide');
  const temperatureProfileChart = document.getElementById('temperature-profile-chart');
  const temperatureProfileLegend = document.getElementById('temperature-profile-legend');
  const heatLossBreakdownChart = document.getElementById('heatloss-breakdown-chart');
  const heatLossBreakdownLegend = document.getElementById('heatloss-breakdown-legend');
  const unitSystemSelect = document.getElementById('unit-system');
  const sensitivityControls = document.getElementById('sensitivity-controls');
  const sensitivitySummary = document.getElementById('sensitivity-summary');
  const sensitivityInsightsList = document.getElementById('sensitivity-insights-list');
  const sensitivitySetBaselineButton = document.getElementById('sensitivity-set-baseline');
  const sideWarningsList = document.getElementById('heattrace-side-warnings-list');
  const thermalDetailPanel = document.getElementById('heattrace-thermal-detail');
  const circuitDetailPanel = document.getElementById('heattrace-circuit-detail');
  const temperatureDetailPanel = document.getElementById('heattrace-temperature-detail');
  const warningOnlyToggle = document.getElementById('heattrace-warning-only');
  const workspace = document.querySelector('.heattrace-content');
  const environmentSelect = document.getElementById('environment');
  const buriedFields = Array.from(document.querySelectorAll('.heattrace-buried-field'));
  const circuitCaseNameInput = document.getElementById('circuit-case-name');
  const addCircuitCaseButton = document.getElementById('add-circuit-case');
  const clearCircuitCasesButton = document.getElementById('clear-circuit-cases');
  const circuitCaseList = document.getElementById('circuit-case-list');
  const reportActionButton = document.getElementById('heattrace-report-action');
  const reportGenerateButton = document.getElementById('heattrace-generate-report');
  const packageGenerateButton = document.getElementById('heattrace-generate-install-package');
  const advancedPackageGenerateButton = document.getElementById('heattrace-generate-advanced-package');
  const reportExportJsonButton = document.getElementById('heattrace-export-report-json');
  const packageExportJsonButton = document.getElementById('heattrace-export-package-json');
  const advancedPackageExportJsonButton = document.getElementById('heattrace-export-advanced-json');
  const reportPrintButton = document.getElementById('heattrace-print-report');
  const reportPreview = document.getElementById('heattrace-report-preview');
  const reportStatus = document.getElementById('heattrace-report-status');
  const sidebarTabButtons = Array.from(document.querySelectorAll('[data-sidebar-tab]'));
  const inputSections = document.getElementById('heattrace-input-sections');
  const assumptionsSection = document.getElementById('heattrace-assumptions-section');
  const componentAllowanceRows = document.getElementById('component-allowance-rows');
  const addComponentAllowanceButton = document.getElementById('add-component-allowance');
  const componentAllowanceSummary = document.getElementById('component-allowance-summary');
  const constructionFields = {
    pipeTag: document.getElementById('construction-pipe-tag'),
    service: document.getElementById('construction-service'),
    area: document.getElementById('construction-area'),
    sourcePanel: document.getElementById('construction-source-panel'),
    controllerTag: document.getElementById('construction-controller-tag'),
    circuitNumber: document.getElementById('construction-circuit-number'),
    cableFamilyId: document.getElementById('construction-cable-family'),
    accessoryOverrides: document.getElementById('construction-accessory-overrides'),
    installationNotes: document.getElementById('construction-installation-notes'),
  };
  const advancedFields = {
    assetType: document.getElementById('advanced-asset-type'),
    assetTag: document.getElementById('advanced-asset-tag'),
    panelPhase: document.getElementById('advanced-panel-phase'),
    diversityGroup: document.getElementById('advanced-diversity-group'),
    controllerType: document.getElementById('advanced-controller-type'),
    controlMode: document.getElementById('advanced-control-mode'),
    sensorCount: document.getElementById('advanced-sensor-count'),
    sensorLocation: document.getElementById('advanced-sensor-location'),
    highLimitSensor: document.getElementById('advanced-high-limit-sensor'),
    hazardousEnabled: document.getElementById('advanced-hazardous-enabled'),
    hazardousClassification: document.getElementById('advanced-hazardous-classification'),
    tRatingTargetC: document.getElementById('advanced-t-rating-target-c'),
    startupAmbientC: document.getElementById('advanced-startup-ambient-c'),
    startupDiversity: document.getElementById('advanced-startup-diversity'),
    segmentsJson: document.getElementById('advanced-segments-json'),
    notes: document.getElementById('advanced-notes'),
  };
  let activeUnitSystem = unitSystemSelect?.value || 'imperial';
  let sensitivityBaseline = null;
  let sensitivityRecommendations = [];
  let currentHeatTraceResult = null;
  let circuitCases = Array.isArray(getStudies().heatTraceSizingCircuits)
    ? getStudies().heatTraceSizingCircuits
    : [];
  let circuitCaseHandlersAttached = false;
  let componentAllowanceHandlersAttached = false;
  let editingCircuitCaseId = null;

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

  initStudyBasisPanel('heatTraceSizing', {
    standard: 'IEC 62395-2 / IEEE 515-2017',
    clause: 'Steady-state heat-balance screening method',
    formulas: [
      'q_loss = ΔT / R_total — heat loss per unit length (W/m)',
      'R_ins = ln(r_o/r_i) / (2π k_ins) — cylindrical insulation thermal resistance',
      'q_req = q_loss × SF — required watt density with safety factor',
    ],
    assumptions: [
      'Steady-state thermal equilibrium (heat input = heat loss)',
      'Cylindrical insulation geometry; simplified for non-circular cross-sections',
      'Constant-watt or self-regulating cable selected at rated watt density',
    ],
    limitations: [
      'Startup power (cold inrush current) not modeled in screening',
      'Hazardous area (Class I Div 1/2) T-class derating requires manual adjustment',
      'Cyclic and intermittent operation not modeled (steady-state only)',
    ],
    benchmarkId: 'heat-trace-screening',
  });
  initStudyApprovalPanel('heatTraceSizing');
  initSidebarTabs();
  attachCircuitCaseHandlers();
  attachComponentAllowanceHandlers();
  renderComponentAllowanceRows([]);

  const saved = getStudies().heatTraceSizing;
  if (saved) {
    const savedUnitSystem = saved.unitSystem || 'imperial';
    if (unitSystemSelect) {
      unitSystemSelect.value = savedUnitSystem;
      activeUnitSystem = savedUnitSystem;
    }
    applyUnitSystem(activeUnitSystem, { convertExistingValues: false });
    const liveResult = getLiveAnalysisResult();
    renderResults(liveResult);
    renderSystemOverview(liveResult);
    renderWorkspaceCharts(liveResult);
    captureSensitivityBaseline(liveResult);
  } else {
    applyUnitSystem(activeUnitSystem, { convertExistingValues: false });
    const liveResult = getLiveAnalysisResult();
    renderResults(liveResult);
    renderSystemOverview(liveResult);
    renderWorkspaceCharts(liveResult);
    captureSensitivityBaseline(liveResult);
  }
  updateBuriedFieldVisibility();
  renderCircuitCaseList();

  unitSystemSelect?.addEventListener('change', () => {
    const nextUnitSystem = unitSystemSelect.value;
    if (nextUnitSystem === activeUnitSystem) return;
    applyUnitSystem(nextUnitSystem, { convertExistingValues: true });
    activeUnitSystem = nextUnitSystem;
    const liveResult = getLiveAnalysisResult() || getStudies().heatTraceSizing || null;
    renderResults(liveResult);
    renderSystemOverview(liveResult);
    renderWorkspaceCharts(liveResult);
    renderSensitivityModule();
    updateBuriedFieldVisibility();
  });

  form.addEventListener('input', () => {
    const liveResult = getLiveAnalysisResult() || getStudies().heatTraceSizing || null;
    renderResults(liveResult);
    renderWorkspaceCharts(liveResult);
    renderSystemOverview(liveResult);
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
    studies.heatTraceSizing = {
      ...result,
      reportExport: buildCurrentHeatTraceReport(result),
    };
    setStudies(studies);

    renderResults(result);
    renderSystemOverview(result);
    renderWorkspaceCharts(result);
    captureSensitivityBaseline(result);
  });

  sensitivitySetBaselineButton?.addEventListener('click', () => {
    captureSensitivityBaseline(getLiveAnalysisResult() || getStudies().heatTraceSizing || null);
  });

  warningOnlyToggle?.addEventListener('change', () => {
    workspace?.classList.toggle('heattrace-warnings-only', warningOnlyToggle.checked);
  });

  environmentSelect?.addEventListener('change', updateBuriedFieldVisibility);

  attachCircuitCaseHandlers();
  attachReportHandlers();

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
    const soilConductivityValue = getFloat('soil-conductivity') || 1.2;
    const burialDepthValue = getFloat('burial-depth-ft') || 3;

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
      heatTraceCableType: get('heat-trace-cable-type')?.value || 'selfRegulating',
      traceRunCount: parseInt(get('trace-run-count')?.value || '1', 10) || 1,
      componentAllowances: readComponentAllowances(),
      maxCircuitLengthFt: maxCircuitLengthValue,
      soilThermalConductivityWPerMK: soilConductivityValue,
      burialDepthFt: burialDepthValue,
    };

    if (activeUnitSystem === 'metric') {
      inputs.insulationThicknessIn = metricToImperial.insulationThicknessIn(insulationThicknessValue);
      inputs.lineLengthFt = metricToImperial.lineLengthFt(lineLengthValue);
      inputs.ambientTempC = ambientValue;
      inputs.maintainTempC = maintainValue;
      inputs.windSpeedMph = metricToImperial.windSpeedMph(windSpeedValue);
      inputs.maxCircuitLengthFt = metricToImperial.maxCircuitLengthFt(maxCircuitLengthValue);
      inputs.burialDepthFt = metricToImperial.burialDepthFt(burialDepthValue);
    } else {
      inputs.ambientTempC = imperialToMetric.ambientTempC(ambientValue);
      inputs.maintainTempC = imperialToMetric.maintainTempC(maintainValue);
    }

    return inputs;
  }

  function readComponentAllowances() {
    if (!componentAllowanceRows) return [];
    return Array.from(componentAllowanceRows.querySelectorAll('[data-component-row]')).map((row, index) => {
      const type = row.querySelector('[data-component-type]')?.value || 'custom';
      const label = row.querySelector('[data-component-label]')?.value?.trim() || getComponentTypeLabel(type);
      const quantity = parseFloat(row.querySelector('[data-component-quantity]')?.value || '0');
      const equivalentLengthFtEach = parseFloat(row.querySelector('[data-component-length]')?.value || '0');
      return {
        id: row.getAttribute('data-component-id') || `component-${index + 1}`,
        type,
        label,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        equivalentLengthFtEach: Number.isFinite(equivalentLengthFtEach) ? equivalentLengthFtEach : 0,
      };
    }).filter(item => item.quantity > 0 || item.equivalentLengthFtEach > 0 || item.label);
  }

  function getComponentTypeLabel(type) {
    return HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES[type]?.label || HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES.custom.label;
  }

  function getComponentTypeDefaultLength(type) {
    return HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES[type]?.defaultEquivalentLengthFt ?? 0;
  }

  function renderComponentAllowanceRows(items = null) {
    if (!componentAllowanceRows) return;
    const rows = Array.isArray(items) ? items : readComponentAllowances();
    componentAllowanceRows.innerHTML = rows.map((item, index) => renderComponentAllowanceRow(item, index)).join('');
    updateComponentAllowanceSummary(rows);
  }

  function renderComponentAllowanceRow(item = {}, index = 0) {
    const type = item.type || 'valve';
    const quantity = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 1;
    const lengthEach = Number.isFinite(Number(item.equivalentLengthFtEach))
      ? Number(item.equivalentLengthFtEach)
      : getComponentTypeDefaultLength(type);
    const label = item.label || getComponentTypeLabel(type);
    const id = item.id || `component-${Date.now()}-${index}`;
    const typeOptions = Object.entries(HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES).map(([key, value]) => (
      `<option value="${escHtml(key)}"${key === type ? ' selected' : ''}>${escHtml(value.label)}</option>`
    )).join('');

    return `
      <div class="heattrace-component-row" data-component-row data-component-id="${escHtml(id)}">
        <div class="field-row">
          <label>Component type</label>
          <select data-component-type>${typeOptions}</select>
        </div>
        <div class="field-row">
          <label>Quantity</label>
          <input type="number" min="0" step="1" value="${escHtml(quantity)}" data-component-quantity>
        </div>
        <div class="field-row">
          <label>Eq. length each (ft)</label>
          <input type="number" min="0" step="0.5" value="${escHtml(lengthEach)}" data-component-length>
        </div>
        <div class="field-row">
          <label>Label / note</label>
          <input type="text" value="${escHtml(label)}" data-component-label>
        </div>
        <button type="button" class="btn heattrace-component-remove" data-component-remove>Remove</button>
      </div>`;
  }

  function updateComponentAllowanceSummary(rows = null) {
    if (!componentAllowanceSummary) return;
    const items = Array.isArray(rows) ? rows : readComponentAllowances();
    const total = items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.equivalentLengthFtEach) || 0)), 0);
    componentAllowanceSummary.textContent = `${total.toFixed(total % 1 === 0 ? 0 : 1)} ft equivalent length`;
  }

  function attachComponentAllowanceHandlers() {
    if (componentAllowanceHandlersAttached) return;
    componentAllowanceHandlersAttached = true;
    addComponentAllowanceButton?.addEventListener('click', () => {
      const rows = readComponentAllowances();
      rows.push({
        id: `component-${Date.now()}-${rows.length}`,
        type: 'valve',
        label: 'Valve',
        quantity: 1,
        equivalentLengthFtEach: getComponentTypeDefaultLength('valve'),
      });
      renderComponentAllowanceRows(rows);
      renderLiveFromInputs();
    });
    componentAllowanceRows?.addEventListener('click', event => {
      if (!event.target.closest('[data-component-remove]')) return;
      event.preventDefault();
      const row = event.target.closest('[data-component-row]');
      row?.remove();
      updateComponentAllowanceSummary();
      renderLiveFromInputs();
    });
    componentAllowanceRows?.addEventListener('change', event => {
      if (event.target.matches('[data-component-type]')) {
        const row = event.target.closest('[data-component-row]');
        const lengthInput = row?.querySelector('[data-component-length]');
        const labelInput = row?.querySelector('[data-component-label]');
        const nextType = event.target.value;
        if (lengthInput && Number(lengthInput.value || 0) === 0) {
          lengthInput.value = String(getComponentTypeDefaultLength(nextType));
        }
        if (labelInput && !labelInput.value.trim()) {
          labelInput.value = getComponentTypeLabel(nextType);
        }
      }
      updateComponentAllowanceSummary();
      renderLiveFromInputs();
    });
    componentAllowanceRows?.addEventListener('input', () => {
      updateComponentAllowanceSummary();
    });
  }

  function renderLiveFromInputs() {
    const liveResult = getLiveAnalysisResult() || getStudies().heatTraceSizing || null;
    renderResults(liveResult);
    renderWorkspaceCharts(liveResult);
    renderSystemOverview(liveResult);
    renderSensitivityModule();
    refreshReportIfVisible();
  }

  function renderLegacyResults(result) {
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

  function renderResults(result) {
    if (!resultsDiv) return;
    if (!result) {
      currentHeatTraceResult = null;
      resultsDiv.innerHTML = '<p class="field-hint">Enter valid inputs to render heat trace results.</p>';
      renderSideWarnings(null);
      renderDetailPanels(null);
      return;
    }
    currentHeatTraceResult = result;

    const displayDeltaT = result.unitSystem === 'metric'
      ? `${result.deltaT.toFixed(1)} &deg;C`
      : `${cToFDelta(result.deltaT).toFixed(1)} &deg;F`;
    const baseHeatLossTotalWatts = result.totalCircuitWatts / result.factors.safetyFactor;
    const displayHeatLoss = result.unitSystem === 'metric'
      ? `${baseHeatLossTotalWatts.toFixed(0)} W`
      : `${wattsToBtuHr(baseHeatLossTotalWatts).toFixed(0)} BTU/hr`;
    const displayRequiredOutput = result.unitSystem === 'metric'
      ? `${result.totalCircuitWatts.toFixed(0)} W`
      : `${wattsToBtuHr(result.totalCircuitWatts).toFixed(0)} BTU/hr`;
    const displaySelectedRating = result.unitSystem === 'metric'
      ? `${wPerFtToWPerM(result.recommendedCableRatingWPerFt).toFixed(1)} W/m`
      : `${result.recommendedCableRatingWPerFt.toFixed(1)} W/ft`;
    const displayInstalledOutput = result.unitSystem === 'metric'
      ? `${wPerFtToWPerM(result.installedWPerFt ?? result.recommendedCableRatingWPerFt).toFixed(1)} W/m installed`
      : `${(result.installedWPerFt ?? result.recommendedCableRatingWPerFt).toFixed(1)} W/ft installed`;
    const displayInstalledLoad = result.unitSystem === 'metric'
      ? `${(result.installedTotalWatts ?? result.totalCircuitWatts).toFixed(0)} W`
      : `${wattsToBtuHr(result.installedTotalWatts ?? result.totalCircuitWatts).toFixed(0)} BTU/hr`;
    const effectiveMaxCircuitLengthFt = getEffectiveMaxCircuitLengthFt(result);
    const lineLengthValue = result.unitSystem === 'metric'
      ? `${imperialToMetric.lineLengthFt(result.effectiveTraceLengthFt ?? result.lineLengthFt).toFixed(1)} m`
      : `${(result.effectiveTraceLengthFt ?? result.lineLengthFt).toFixed(0)} ft`;
    const maxCircuitLengthValue = result.unitSystem === 'metric'
      ? `${imperialToMetric.maxCircuitLengthFt(effectiveMaxCircuitLengthFt).toFixed(1)} m`
      : `${effectiveMaxCircuitLengthFt.toFixed(0)} ft`;
    const coverageRatio = Number.isFinite(result.coverageRatio)
      ? result.coverageRatio * 100
      : (result.recommendedCableRatingWPerFt > 0 ? (result.requiredWPerFt / result.recommendedCableRatingWPerFt) * 100 : 0);
    const currentVoltage = result.voltageV || readInputs().voltageV || 0;
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const circuitCheckPass = effectiveMaxCircuitLengthFt <= 0 || (result.effectiveTraceLengthFt ?? result.lineLengthFt) <= effectiveMaxCircuitLengthFt;
    const statusClass = !warnings.length && circuitCheckPass ? 'success' : (circuitCheckPass ? 'warning' : 'error');
    const statusTitle = statusClass === 'success'
      ? 'System is configured within design limits.'
      : 'System needs engineering review.';
    const statusBody = statusClass === 'success'
      ? 'All inputs are valid and the system should maintain the target temperature.'
      : 'Review the warnings and circuit constraints before using this selection.';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-label="Heat trace sizing results">
        <div class="heattrace-kpi-grid" role="list" aria-label="Heat trace sizing KPI summary">
          <article class="heattrace-kpi-card" role="listitem">
            <p class="heattrace-kpi-label">Heat Loss</p>
            <p class="heattrace-kpi-value">${displayHeatLoss}</p>
            <p class="heattrace-kpi-context">Before ${result.safetyMarginPct.toFixed(0)}% design margin</p>
            <a href="#heattrace-panel-heatloss">View details</a>
          </article>
          <article class="heattrace-kpi-card" role="listitem">
            <p class="heattrace-kpi-label">Required Heat Input</p>
            <p class="heattrace-kpi-value">${displayRequiredOutput}</p>
            <p class="heattrace-kpi-context">Includes ${result.safetyMarginPct.toFixed(0)}% margin</p>
            <a href="#heattrace-panel-heatloss">View details</a>
          </article>
          <article class="heattrace-kpi-card" role="listitem">
            <p class="heattrace-kpi-label">Installed Connected Load</p>
            <p class="heattrace-kpi-value">${displayInstalledLoad}</p>
            <p class="heattrace-kpi-context">${escHtml(displayInstalledOutput)} from ${result.traceRunCount || 1} trace run${(result.traceRunCount || 1) === 1 ? '' : 's'} @ ${currentVoltage.toFixed(0)} V</p>
            <a href="#heattrace-panel-circuit">View details</a>
          </article>
          <article class="heattrace-kpi-card${circuitCheckPass ? '' : ' heattrace-kpi-card--alert'}" role="listitem">
            <p class="heattrace-kpi-label">Circuit Check</p>
            <p class="heattrace-kpi-value">${circuitCheckPass ? 'Within Limit' : 'Review'}</p>
            <p class="heattrace-kpi-context">${escHtml(lineLengthValue)} / ${escHtml(maxCircuitLengthValue)}</p>
            <a href="#heattrace-panel-circuit">View details</a>
          </article>
        </div>
        <article class="heattrace-status-banner heattrace-status-banner--${statusClass}">
          <span class="heattrace-status-icon" aria-hidden="true">${statusClass === 'success' ? '&#10003;' : '!'}</span>
          <div>
            <strong>${escHtml(statusTitle)}</strong>
            <p>${escHtml(statusBody)}</p>
          </div>
        </article>
      </section>`;

    renderSideWarnings(result);
    renderDetailPanels(result, { displayDeltaT, displayHeatLoss, displayRequiredOutput, displaySelectedRating, displayInstalledOutput, displayInstalledLoad, coverageRatio });
  }

  function renderSideWarnings(result) {
    if (!sideWarningsList) return;
    if (!result) {
      sideWarningsList.innerHTML = '<p class="field-hint">Warnings appear after valid inputs are entered.</p>';
      return;
    }
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    if (!warnings.length) {
      sideWarningsList.innerHTML = `
        <article class="heattrace-warning-card heattrace-warning-card--success">
          <div class="heattrace-warning-severity">OK</div>
          <p class="heattrace-warning-message">No warnings detected for the current assumptions.</p>
        </article>`;
      return;
    }
    sideWarningsList.innerHTML = `<div class="heattrace-warning-grid" role="list">${warnings.map((warning) => {
      const severity = classifyHeatTraceWarningSeverity(warning);
      return `<article class="heattrace-warning-card heattrace-warning-card--${severity}" role="listitem">
        <div class="heattrace-warning-severity">${severity.toUpperCase()}</div>
        <p class="heattrace-warning-message">${escHtml(warning)}</p>
      </article>`;
    }).join('')}</div>`;
  }

  function renderDetailPanels(result, summary = {}) {
    if (thermalDetailPanel) {
      thermalDetailPanel.innerHTML = !result ? '' : `
        ${renderDetailItem('Temperature differential', summary.displayDeltaT)}
        ${renderDetailItem('Base heat loss', summary.displayHeatLoss)}
        ${renderDetailItem('Required heat input', summary.displayRequiredOutput)}
        ${renderDetailItem('Heat Loss answers', 'How much heat must be replaced and which path drives it.')}
        ${renderDetailItem('Insulation resistance', `${result.thermalResistance.insulationKmPerW.toFixed(4)} K-m/W`)}
        ${renderDetailItem('External film resistance', `${result.thermalResistance.externalKmPerW.toFixed(4)} K-m/W`)}
        ${renderDetailItem('Total resistance', `${result.thermalResistance.totalKmPerW.toFixed(4)} K-m/W`)}
        ${renderDetailItem('Environment multiplier', `${result.factors.environmentMultiplier.toFixed(2)}x`)}
        ${renderDetailItem('Material factor', `${result.factors.materialFactor.toFixed(2)}x`)}
        ${renderDetailItem('Safety factor', `${result.factors.safetyFactor.toFixed(2)}x`)}
      `;
    }

    if (circuitDetailPanel) {
      const voltage = result ? (result.voltageV || readInputs().voltageV || 0) : 0;
      const loadAmps = result ? (result.installedLoadAmps ?? (voltage > 0 ? result.totalCircuitWatts / voltage : 0)) : 0;
      const lineLength = result ? formatLength(result.lineLengthFt, result.unitSystem) : '';
      const effectiveLength = result ? formatLength(result.effectiveTraceLengthFt ?? result.lineLengthFt, result.unitSystem) : '';
      const componentAllowanceLength = result ? formatLength(result.componentAllowanceLengthFt || 0, result.unitSystem) : '';
      const maxLength = result ? formatLength(getEffectiveMaxCircuitLengthFt(result), result.unitSystem) : '';
      const warnings = Array.isArray(result?.warnings) ? result.warnings.length : 0;
      const status = result && (result.effectiveTraceLengthFt ?? result.lineLengthFt) <= getEffectiveMaxCircuitLengthFt(result) ? 'Within limit' : 'Review required';
      circuitDetailPanel.innerHTML = !result ? '' : `
        ${renderDetailItem('Circuit being sized', 'Heat trace branch circuit/load')}
        ${renderDetailItem('Not included', 'Upstream feeder, transformer, or panel bus sizing')}
        ${renderDetailItem('Cable type', formatHeatTraceCableType(result.heatTraceCableType))}
        ${renderDetailItem('Selected trace output', `${formatCableRating(result)} selected cable basis`)}
        ${renderDetailItem('Parallel trace runs', `${result.traceRunCount || 1} run${(result.traceRunCount || 1) === 1 ? '' : 's'}`)}
        ${renderDetailItem('Installed watt density', summary.displayInstalledOutput || `${(result.installedWPerFt ?? result.recommendedCableRatingWPerFt).toFixed(1)} W/ft installed`)}
        ${renderDetailItem('Coverage ratio', `${((result.coverageRatio ?? 0) * 100).toFixed(0)}% of required W/ft`)}
        ${renderDetailItem('Cable basis note', result.heatTraceCableSelectionNote || 'Verify manufacturer output curves and circuit limits.')}
        ${renderDetailItem('Required heat load', `${result.totalCircuitWatts.toFixed(0)} W`)}
        ${renderDetailItem('Installed connected load', `${(result.installedTotalWatts ?? result.totalCircuitWatts).toFixed(0)} W`)}
        ${renderDetailItem('Estimated branch current', `${loadAmps.toFixed(1)} A at ${voltage.toFixed(0)} V`)}
        ${renderDetailItem('Pipe length', lineLength)}
        ${renderDetailItem('Component allowance', componentAllowanceLength)}
        ${renderDetailItem('Effective trace length', effectiveLength)}
        ${renderDetailItem('Length check', `${effectiveLength} effective / ${maxLength}`)}
        ${renderDetailItem('Utilization status', status)}
        ${renderDetailItem('Warnings', `${warnings} active warning${warnings === 1 ? '' : 's'}`)}
      `;
    }

    if (temperatureDetailPanel) {
      const maintainTemp = result
        ? (result.unitSystem === 'metric' ? result.maintainTempC : cToF(result.maintainTempC))
        : null;
      const ambientTemp = result
        ? (result.unitSystem === 'metric' ? result.ambientTempC : cToF(result.ambientTempC))
        : null;
      const unit = result?.unitSystem === 'metric' ? '&deg;C' : '&deg;F';
      const utilizationRatio = Number.isFinite(result?.circuitUtilizationRatio)
        ? result.circuitUtilizationRatio
        : result.lineLengthFt / getEffectiveMaxCircuitLengthFt(result);
      temperatureDetailPanel.innerHTML = !result ? '' : `
        ${renderDetailItem('Maintain target', `${maintainTemp.toFixed(1)} ${unit}`)}
        ${renderDetailItem('Ambient baseline', `${ambientTemp.toFixed(1)} ${unit}`)}
        ${renderDetailItem('Profile samples', `${result.profile.length} points`)}
        ${renderDetailItem('Circuit utilization', `${(utilizationRatio * 100).toFixed(0)}%`)}
        ${renderDetailItem('Different from Heat Loss', 'Profile checks temperature trend along the run after the selected heat input is applied.')}
      `;
    }
  }

  function renderDetailItem(label, value) {
    return `<article class="heattrace-detail-item">
      <span>${escHtml(label)}</span>
      <strong>${value}</strong>
    </article>`;
  }

  function getEffectiveMaxCircuitLengthFt(result) {
    if (Number.isFinite(result?.maxCircuitLengthFt) && result.maxCircuitLengthFt > 0) {
      return result.maxCircuitLengthFt;
    }
    const inputMaxCircuitLength = readInputs().maxCircuitLengthFt;
    return Number.isFinite(inputMaxCircuitLength) && inputMaxCircuitLength > 0 ? inputMaxCircuitLength : 500;
  }

  function renderLegacySystemOverview(result) {
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
      ? `${formatHeatTraceCableType(result.heatTraceCableType)}, ${activeUnitSystem === 'metric'
          ? `${wPerFtToWPerM(result.recommendedCableRatingWPerFt).toFixed(1)} W/m selected`
          : `${result.recommendedCableRatingWPerFt} W/ft selected`}`
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

  function renderSystemOverview(result) {
    if (!overviewSvg || !overviewLegend) return;
    const currentInputs = readInputs();
    const pipeNpsValue = parseFloat(currentInputs.pipeNps) || 1;
    const insulationThicknessIn = Math.max(0.1, currentInputs.insulationThicknessIn || 0.1);
    const lineLengthFt = Math.max(1, currentInputs.lineLengthFt || 1);
    const ambientTempC = currentInputs.ambientTempC;
    const windSpeedMph = currentInputs.windSpeedMph || 0;
    const traceRunCount = Math.max(1, Math.min(4, result?.traceRunCount || currentInputs.traceRunCount || 1));

    const insulationWidth = Math.min(44, Math.max(22, insulationThicknessIn * 18));
    const pipeRadius = 38 + Math.min(24, pipeNpsValue * 4);
    const lineBodyWidth = Math.max(620, Math.min(735, lineLengthFt * 3.2));
    const startX = 66;
    const endX = startX + lineBodyWidth;
    const centerY = 174;
    const insulationTop = centerY - pipeRadius - insulationWidth;
    const insulationBottom = centerY + pipeRadius + insulationWidth;
    const lengthText = activeUnitSystem === 'metric'
      ? `${imperialToMetric.lineLengthFt(lineLengthFt).toFixed(1)} m`
      : `${lineLengthFt.toFixed(0)} ft`;
    const npsText = `NPS ${currentInputs.pipeNps}`;
    const insulationText = activeUnitSystem === 'metric'
      ? `${imperialToMetric.insulationThicknessIn(insulationThicknessIn).toFixed(0)} mm ${formatMaterialLabel(currentInputs.insulationType)}`
      : `${insulationThicknessIn.toFixed(1)} in ${formatMaterialLabel(currentInputs.insulationType)}`;
    const ambientText = activeUnitSystem === 'metric'
      ? `${ambientTempC.toFixed(0)} C, ${imperialToMetric.windSpeedMph(windSpeedMph).toFixed(0)} km/h`
      : `${cToF(ambientTempC).toFixed(0)} F, ${windSpeedMph.toFixed(0)} mph`;
    const cableRatingText = result
      ? `${traceRunCount} run${traceRunCount === 1 ? '' : 's'} ${formatHeatTraceCableType(result.heatTraceCableType)}, ${activeUnitSystem === 'metric'
          ? `${wPerFtToWPerM(result.recommendedCableRatingWPerFt).toFixed(1)} W/m`
          : `${result.recommendedCableRatingWPerFt.toFixed(1)} W/ft`}`
      : 'Live sizing';
    const effectiveLengthText = result
      ? (activeUnitSystem === 'metric'
          ? `${imperialToMetric.lineLengthFt(result.effectiveTraceLengthFt ?? lineLengthFt).toFixed(1)} m effective`
          : `${(result.effectiveTraceLengthFt ?? lineLengthFt).toFixed(0)} ft effective`)
      : lengthText;
    const traceCablePaths = renderTraceCablePaths({
      count: traceRunCount,
      startX,
      endX,
      centerY,
      pipeRadius,
    });

    if (overviewSvg?.tagName?.toLowerCase() === 'img') {
      overviewSvg.alt = `Generated heat trace illustration for ${npsText}: ${formatMaterialLabel(currentInputs.pipeMaterial)} pipe with ${insulationText}, heat trace cable rated ${cableRatingText}, and ambient exposure ${ambientText}.`;
    } else {
      overviewSvg.innerHTML = `
      <defs>
        <linearGradient id="ht-pipe-grad" x1="0" x2="1">
          <stop offset="0" stop-color="#111827"></stop>
          <stop offset="0.18" stop-color="#d8dde3"></stop>
          <stop offset="0.48" stop-color="#7b8490"></stop>
          <stop offset="0.72" stop-color="#363d45"></stop>
          <stop offset="1" stop-color="#111827"></stop>
        </linearGradient>
        <linearGradient id="ht-insulation-grad" x1="0" x2="1">
          <stop offset="0" stop-color="#b8b9aa"></stop>
          <stop offset="0.35" stop-color="#f1f0df"></stop>
          <stop offset="0.72" stop-color="#d5d4c2"></stop>
          <stop offset="1" stop-color="#a9ac9c"></stop>
        </linearGradient>
        <pattern id="ht-insulation-lines" width="10" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L10 0" stroke="#8d907f" stroke-width="0.65" opacity="0.35"></path>
        </pattern>
        <marker id="ht-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#98a2b3"></path>
        </marker>
      </defs>
      <rect x="18" y="16" width="844" height="306" rx="18" fill="#f8fbff" stroke="#d8e3f3"></rect>
      <line x1="${startX}" y1="56" x2="${endX}" y2="56" stroke="#98a2b3" stroke-width="1.6" marker-start="url(#ht-arrow)" marker-end="url(#ht-arrow)"></line>
      <text x="${(startX + endX) / 2}" y="46" text-anchor="middle" fill="#111827" font-size="20" font-weight="800">${escHtml(lengthText)}</text>
      <line x1="${startX}" y1="48" x2="${startX}" y2="86" stroke="#cbd5e1"></line>
      <line x1="${endX}" y1="48" x2="${endX}" y2="86" stroke="#cbd5e1"></line>
      <line x1="${startX - 56}" y1="${centerY - pipeRadius}" x2="${startX - 56}" y2="${centerY + pipeRadius}" stroke="#98a2b3" stroke-width="1.3" marker-start="url(#ht-arrow)" marker-end="url(#ht-arrow)"></line>
      <line x1="${startX - 44}" y1="${centerY - pipeRadius}" x2="${startX - 4}" y2="${centerY - pipeRadius}" stroke="#cbd5e1"></line>
      <line x1="${startX - 44}" y1="${centerY + pipeRadius}" x2="${startX - 4}" y2="${centerY + pipeRadius}" stroke="#cbd5e1"></line>
      <text x="${startX - 74}" y="${centerY + 5}" text-anchor="end" fill="#111827" font-size="16">${escHtml(npsText)}</text>

      <rect x="${startX + 118}" y="${insulationTop}" width="${lineBodyWidth - 112}" height="${insulationBottom - insulationTop}" rx="44" fill="url(#ht-insulation-grad)" stroke="#30343a" stroke-width="2.4"></rect>
      <rect x="${startX + 118}" y="${insulationTop}" width="${lineBodyWidth - 112}" height="${insulationBottom - insulationTop}" rx="44" fill="url(#ht-insulation-lines)" opacity="0.78"></rect>
      ${Array.from({ length: 7 }, (_, idx) => {
        const x = startX + 175 + (idx * ((lineBodyWidth - 215) / 6));
        return `<path d="M ${x} ${insulationTop + 8} C ${x + 16} ${centerY - 30}, ${x + 16} ${centerY + 30}, ${x} ${insulationBottom - 8}" fill="none" stroke="#2f3338" stroke-width="4" opacity="0.7"></path>`;
      }).join('')}
      <rect x="${startX - 7}" y="${centerY - pipeRadius}" width="215" height="${pipeRadius * 2}" rx="${pipeRadius}" fill="url(#ht-pipe-grad)" stroke="#1f2933" stroke-width="3.4"></rect>
      <ellipse cx="${startX}" cy="${centerY}" rx="${pipeRadius * 0.52}" ry="${pipeRadius}" fill="#4a4f54" stroke="#24282d" stroke-width="4"></ellipse>
      <ellipse cx="${startX + 6}" cy="${centerY}" rx="${pipeRadius * 0.34}" ry="${pipeRadius * 0.74}" fill="#b7bbc0" opacity="0.72"></ellipse>
      ${traceCablePaths}
      ${renderNumberMarker(1, startX + 138, centerY - pipeRadius - 8)}
      ${renderNumberMarker(2, startX + 425, centerY - pipeRadius - insulationWidth + 12)}
      ${renderNumberMarker(3, startX + 520, centerY + pipeRadius + 28)}
      ${renderNumberMarker(4, endX - 110, centerY + pipeRadius + 2)}
    `;
    }

    overviewLegend.innerHTML = `
      <li><span class="legend-number">1</span><span>Pipe (${escHtml(formatMaterialLabel(currentInputs.pipeMaterial))})</span></li>
      <li><span class="legend-number">2</span><span>Insulation (${escHtml(insulationText)})</span></li>
      <li><span class="legend-number">3</span><span>Heat trace cable (${escHtml(cableRatingText)}, ${escHtml(effectiveLengthText)})</span></li>
      <li><span class="legend-number">4</span><span>Ambient air (${escHtml(ambientText)})</span></li>
    `;
  }

  function renderTraceCablePaths({ count, startX, endX, centerY, pipeRadius }) {
    const pathConfigs = [
      { offset: 2, color: '#e31b23', width: 5.2, opacity: 1 },
      { offset: -68, color: '#fb923c', width: 4.6, opacity: .95 },
      { offset: 26, color: '#ef4444', width: 3.8, opacity: .78 },
      { offset: -34, color: '#f97316', width: 3.8, opacity: .78 },
    ];
    return pathConfigs.slice(0, count).map((config, index) => {
      const y = centerY + pipeRadius + config.offset;
      const controlLift = index === 1 || index === 3 ? -34 : 42;
      const shadowY = y + 9;
      return `
        <path d="M ${startX + 98} ${shadowY} C ${startX + 160} ${shadowY + controlLift}, ${startX + 330} ${shadowY + controlLift - 9}, ${startX + 490} ${shadowY - 21} S ${endX - 155} ${shadowY - 36}, ${endX + 18} ${shadowY - 36}" fill="none" stroke="#111827" stroke-width="${config.width + 3.2}" stroke-linecap="round" opacity=".72"></path>
        <path d="M ${startX + 98} ${y} C ${startX + 160} ${y + controlLift}, ${startX + 330} ${y + controlLift - 9}, ${startX + 490} ${y - 21} S ${endX - 155} ${y - 36}, ${endX + 18} ${y - 36}" fill="none" stroke="${config.color}" stroke-width="${config.width}" stroke-linecap="round" opacity="${config.opacity}"></path>
      `;
    }).join('');
  }

  function getComponentVisual(type) {
    const visuals = {
      valve: {
        color: '#dc2626',
        fill: '#fee2e2',
        shortLabel: 'V',
        label: 'Valve',
      },
      flangePair: {
        color: '#7c3aed',
        fill: '#ede9fe',
        shortLabel: 'F',
        label: 'Flange pair',
      },
      pipeSupport: {
        color: '#0891b2',
        fill: '#cffafe',
        shortLabel: 'S',
        label: 'Pipe support',
      },
      instrumentTap: {
        color: '#16a34a',
        fill: '#dcfce7',
        shortLabel: 'I',
        label: 'Instrument tap',
      },
      custom: {
        color: '#f59e0b',
        fill: '#fef3c7',
        shortLabel: 'C',
        label: 'Custom',
      },
    };
    return visuals[type] || visuals.custom;
  }

  function renderComponentLegendItems(componentAllowances) {
    const activeTypes = Array.from(new Set((componentAllowances || [])
      .filter(item => Number(item.quantity) > 0)
      .map(item => item.type || 'custom')));
    if (!activeTypes.length) return '';
    return activeTypes.map(type => {
      const visual = getComponentVisual(type);
      return `<li><span class="legend-component-symbol" style="--component-color:${visual.color};--component-fill:${visual.fill}">${escHtml(visual.shortLabel)}</span><span>${escHtml(visual.label)} routing allowance</span></li>`;
    }).join('');
  }

  function renderComponentSvgMarkers({ componentAllowances, startX, endX, centerY, insulationTop, insulationBottom }) {
    const active = componentAllowances
      .filter(item => Number(item.quantity) > 0 && Number(item.equivalentLengthFtEach) >= 0)
      .slice(0, 5);
    if (!active.length) return '';
    const span = Math.max(1, active.length + 1);
    return active.map((item, index) => {
      const x = startX + 230 + ((endX - startX - 315) * ((index + 1) / span));
      const visual = getComponentVisual(item.type || 'custom');
      const markerY = insulationTop - 8 - (index % 2) * 24;
      const pipeTouchY = insulationTop + 18;
      const label = `${visual.label} x${Number(item.quantity).toFixed(0)}`;
      const labelX = Math.max(86, Math.min(812, x));
      const tagWidth = Math.max(112, Math.min(170, label.length * 7.2 + 42));
      const tagX = Math.max(34, Math.min(838 - tagWidth, labelX - tagWidth / 2));
      const tagY = Math.max(24, markerY - 52);
      return `
        ${renderComponentRoutingPattern(item.type || 'custom', x, centerY, insulationBottom, visual)}
        <path d="M ${x} ${pipeTouchY} L ${x} ${markerY + 17}" stroke="${visual.color}" stroke-width="2.4" stroke-dasharray="4 4"></path>
        ${renderComponentIcon(item.type || 'custom', x, markerY, visual)}
        <rect x="${tagX}" y="${tagY}" width="${tagWidth}" height="30" rx="15" fill="${visual.fill}" stroke="${visual.color}" stroke-width="1.6"></rect>
        <circle cx="${tagX + 17}" cy="${tagY + 15}" r="10" fill="${visual.color}"></circle>
        <text x="${tagX + 17}" y="${tagY + 19}" text-anchor="middle" font-size="11" font-weight="900" fill="#fff">${escHtml(visual.shortLabel)}</text>
        <text x="${tagX + 33}" y="${tagY + 19}" font-size="12" font-weight="800" fill="#111827">${escHtml(label)}</text>
      `;
    }).join('');
  }

  function renderComponentIcon(type, x, y, visual) {
    if (type === 'valve') {
      return `
        <path d="M ${x - 17} ${y} L ${x} ${y - 17} L ${x + 17} ${y} L ${x} ${y + 17} Z" fill="${visual.fill}" stroke="${visual.color}" stroke-width="3"></path>
        <path d="M ${x - 11} ${y - 8} L ${x + 11} ${y + 8} M ${x + 11} ${y - 8} L ${x - 11} ${y + 8}" stroke="${visual.color}" stroke-width="3" stroke-linecap="round"></path>
      `;
    }
    if (type === 'flangePair') {
      return `
        <rect x="${x - 18}" y="${y - 16}" width="10" height="32" rx="3" fill="${visual.fill}" stroke="${visual.color}" stroke-width="3"></rect>
        <rect x="${x + 8}" y="${y - 16}" width="10" height="32" rx="3" fill="${visual.fill}" stroke="${visual.color}" stroke-width="3"></rect>
        <line x1="${x - 6}" y1="${y}" x2="${x + 6}" y2="${y}" stroke="${visual.color}" stroke-width="4" stroke-linecap="round"></line>
      `;
    }
    if (type === 'pipeSupport') {
      return `
        <path d="M ${x - 20} ${y + 11} Q ${x} ${y - 15} ${x + 20} ${y + 11}" fill="${visual.fill}" stroke="${visual.color}" stroke-width="3"></path>
        <line x1="${x}" y1="${y + 12}" x2="${x}" y2="${y + 30}" stroke="${visual.color}" stroke-width="4" stroke-linecap="round"></line>
        <line x1="${x - 18}" y1="${y + 30}" x2="${x + 18}" y2="${y + 30}" stroke="${visual.color}" stroke-width="4" stroke-linecap="round"></line>
      `;
    }
    if (type === 'instrumentTap') {
      return `
        <line x1="${x}" y1="${y + 17}" x2="${x}" y2="${y - 14}" stroke="${visual.color}" stroke-width="4" stroke-linecap="round"></line>
        <circle cx="${x}" cy="${y - 17}" r="14" fill="${visual.fill}" stroke="${visual.color}" stroke-width="3"></circle>
        <path d="M ${x - 6} ${y - 15} L ${x - 1} ${y - 20} L ${x + 8} ${y - 11}" fill="none" stroke="${visual.color}" stroke-width="2.6" stroke-linecap="round"></path>
      `;
    }
    return `
      <path d="M ${x - 16} ${y - 10} L ${x} ${y - 19} L ${x + 16} ${y - 10} L ${x + 16} ${y + 10} L ${x} ${y + 19} L ${x - 16} ${y + 10} Z" fill="${visual.fill}" stroke="${visual.color}" stroke-width="3"></path>
      <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="13" font-weight="900" fill="${visual.color}">+</text>
    `;
  }

  function renderComponentRoutingPattern(type, x, centerY, insulationBottom, visual) {
    const lowerY = insulationBottom + 42;
    if (type === 'valve') {
      return `
        <path d="M ${x - 30} ${centerY + 82} C ${x - 44} ${lowerY}, ${x + 44} ${lowerY}, ${x + 30} ${centerY + 82}" fill="none" stroke="#111827" stroke-width="6" opacity=".5"></path>
        <path d="M ${x - 25} ${centerY + 77} C ${x - 35} ${lowerY - 10}, ${x + 35} ${lowerY - 10}, ${x + 25} ${centerY + 77}" fill="none" stroke="${visual.color}" stroke-width="3.6"></path>
      `;
    }
    if (type === 'flangePair') {
      return `
        <line x1="${x - 22}" y1="${centerY + 86}" x2="${x - 22}" y2="${lowerY}" stroke="#111827" stroke-width="5" opacity=".45"></line>
        <line x1="${x + 22}" y1="${centerY + 86}" x2="${x + 22}" y2="${lowerY}" stroke="#111827" stroke-width="5" opacity=".45"></line>
        <path d="M ${x - 22} ${lowerY} C ${x - 4} ${lowerY + 11}, ${x + 4} ${lowerY + 11}, ${x + 22} ${lowerY}" fill="none" stroke="${visual.color}" stroke-width="3.6"></path>
      `;
    }
    if (type === 'pipeSupport') {
      return `
        <path d="M ${x - 22} ${centerY + 82} L ${x} ${lowerY + 8} L ${x + 22} ${centerY + 82}" fill="none" stroke="#111827" stroke-width="5" opacity=".45"></path>
        <path d="M ${x - 16} ${centerY + 78} L ${x} ${lowerY - 3} L ${x + 16} ${centerY + 78}" fill="none" stroke="${visual.color}" stroke-width="3.5"></path>
      `;
    }
    if (type === 'instrumentTap') {
      return `
        <path d="M ${x - 18} ${centerY + 80} C ${x - 22} ${lowerY - 8}, ${x + 10} ${lowerY - 2}, ${x + 30} ${lowerY - 18}" fill="none" stroke="#111827" stroke-width="5" opacity=".45"></path>
        <path d="M ${x - 14} ${centerY + 75} C ${x - 18} ${lowerY - 16}, ${x + 8} ${lowerY - 10}, ${x + 26} ${lowerY - 27}" fill="none" stroke="${visual.color}" stroke-width="3.4"></path>
      `;
    }
    return `
      <path d="M ${x - 18} ${centerY + 80} C ${x - 30} ${lowerY - 8}, ${x + 30} ${lowerY - 8}, ${x + 18} ${centerY + 80}" fill="none" stroke="#111827" stroke-width="5" opacity=".45"></path>
      <path d="M ${x - 14} ${centerY + 76} C ${x - 23} ${lowerY - 18}, ${x + 23} ${lowerY - 18}, ${x + 14} ${centerY + 76}" fill="none" stroke="${visual.color}" stroke-width="3.2"></path>
    `;
  }

  function renderNumberMarker(number, x, y) {
    return `<g>
      <circle cx="${x}" cy="${y}" r="16" fill="#1268f3"></circle>
      <text x="${x}" y="${y + 5}" fill="#fff" font-size="14" font-weight="700" text-anchor="middle">${number}</text>
    </g>`;
  }

  function renderComponentRoutingGuide() {
    if (!componentRoutingGuide) return;
    const inputs = readInputs();
    const allowances = Array.isArray(inputs.componentAllowances) ? inputs.componentAllowances : [];
    const counts = allowances.reduce((map, item) => {
      const type = item.type || 'custom';
      map[type] = (map[type] || 0) + (Number(item.quantity) || 0);
      return map;
    }, {});
    const patterns = [
      {
        type: 'valve',
        title: 'Valve Body',
        subtitle: 'Loop around valve body and bonnet heat sink',
        note: 'Add cable on the valve mass before insulation kit is closed.',
        x: 24,
        y: 48,
        draw: renderValvePattern,
      },
      {
        type: 'flangePair',
        title: 'Flange Pair',
        subtitle: 'Serpentine around both flange plates',
        note: 'Route around bolt circle area without crossing sharp edges.',
        x: 492,
        y: 48,
        draw: renderFlangePattern,
      },
      {
        type: 'pipeSupport',
        title: 'Pipe Support',
        subtitle: 'Bridge around saddle / support heat sink',
        note: 'Keep trace against pipe where possible; avoid pinch points.',
        x: 24,
        y: 282,
        draw: renderSupportPattern,
      },
      {
        type: 'instrumentTap',
        title: 'Instrument Tap',
        subtitle: 'Loop around branch, tap, and root valve area',
        note: 'Maintain bend radius and leave service clearance.',
        x: 492,
        y: 282,
        draw: renderInstrumentPattern,
      },
    ];

    componentRoutingGuide.innerHTML = `
      <defs>
        <linearGradient id="routing-pipe-grad" x1="0" x2="1">
          <stop offset="0" stop-color="#1f2937"></stop>
          <stop offset="0.24" stop-color="#d7dde5"></stop>
          <stop offset="0.55" stop-color="#7a8594"></stop>
          <stop offset="1" stop-color="#111827"></stop>
        </linearGradient>
        <filter id="routing-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0f172a" flood-opacity=".16"></feDropShadow>
        </filter>
      </defs>
      <rect x="0" y="0" width="960" height="520" rx="18" fill="#f8fbff"></rect>
      <text x="32" y="30" fill="#0f172a" font-size="18" font-weight="900">Representative component installation patterns</text>
      <text x="530" y="30" fill="#64748b" font-size="12" font-weight="700">Use manufacturer installation details for final routing, attachment spacing, and insulation kits.</text>
      ${patterns.map(pattern => renderRoutingPatternPanel(pattern, counts[pattern.type] || 0)).join('')}
    `;
  }

  function renderRoutingPatternPanel(pattern, activeCount) {
    const visual = getComponentVisual(pattern.type);
    return `
      <g transform="translate(${pattern.x} ${pattern.y})">
        <rect x="0" y="0" width="444" height="206" rx="18" fill="#ffffff" stroke="#d8e3f3" filter="url(#routing-shadow)"></rect>
        <rect x="16" y="16" width="52" height="30" rx="15" fill="${visual.fill}" stroke="${visual.color}" stroke-width="1.8"></rect>
        <text x="42" y="37" text-anchor="middle" fill="${visual.color}" font-size="14" font-weight="900">${escHtml(visual.shortLabel)}</text>
        <text x="80" y="31" fill="#0f172a" font-size="16" font-weight="900">${escHtml(pattern.title)}</text>
        <text x="80" y="49" fill="#64748b" font-size="12" font-weight="700">${escHtml(pattern.subtitle)}</text>
        ${activeCount > 0 ? `<text x="394" y="36" text-anchor="middle" fill="${visual.color}" font-size="12" font-weight="900">${activeCount} in case</text>` : ''}
        ${pattern.draw(visual)}
        <text x="24" y="188" fill="#475569" font-size="12" font-weight="700">${escHtml(pattern.note)}</text>
      </g>
    `;
  }

  function renderBasePipe(x1, y, width = 250) {
    return `
      <rect x="${x1}" y="${y - 22}" width="${width}" height="44" rx="22" fill="url(#routing-pipe-grad)" stroke="#1f2937" stroke-width="2.2"></rect>
      <ellipse cx="${x1}" cy="${y}" rx="18" ry="22" fill="#4b5563" stroke="#1f2937" stroke-width="2.2"></ellipse>
      <text x="${x1 + width - 8}" y="${y - 32}" text-anchor="end" fill="#64748b" font-size="11" font-weight="800">pipe</text>
    `;
  }

  function renderValvePattern(visual) {
    return `
      ${renderBasePipe(66, 112, 300)}
      <path d="M 191 112 L 226 78 L 261 112 L 226 146 Z" fill="#f8fafc" stroke="#334155" stroke-width="5"></path>
      <rect x="215" y="54" width="22" height="32" rx="5" fill="#cbd5e1" stroke="#334155" stroke-width="3"></rect>
      <path d="M 145 135 C 178 176, 270 176, 307 135" fill="none" stroke="#111827" stroke-width="9" stroke-linecap="round" opacity=".42"></path>
      <path d="M 145 128 C 178 166, 270 166, 307 128" fill="none" stroke="${visual.color}" stroke-width="5.5" stroke-linecap="round"></path>
      <path d="M 188 82 C 154 68, 140 97, 172 119" fill="none" stroke="${visual.color}" stroke-width="4" stroke-linecap="round"></path>
      <path d="M 264 82 C 298 68, 312 97, 280 119" fill="none" stroke="${visual.color}" stroke-width="4" stroke-linecap="round"></path>
      <text x="226" y="165" text-anchor="middle" fill="${visual.color}" font-size="12" font-weight="900">extra loop around valve mass</text>
    `;
  }

  function renderFlangePattern(visual) {
    return `
      ${renderBasePipe(68, 112, 300)}
      <rect x="182" y="70" width="18" height="84" rx="4" fill="#e2e8f0" stroke="#334155" stroke-width="4"></rect>
      <rect x="236" y="70" width="18" height="84" rx="4" fill="#e2e8f0" stroke="#334155" stroke-width="4"></rect>
      <circle cx="191" cy="86" r="3" fill="#475569"></circle>
      <circle cx="191" cy="138" r="3" fill="#475569"></circle>
      <circle cx="245" cy="86" r="3" fill="#475569"></circle>
      <circle cx="245" cy="138" r="3" fill="#475569"></circle>
      <path d="M 138 130 C 178 162, 216 162, 254 130 S 318 98, 354 130" fill="none" stroke="#111827" stroke-width="8" opacity=".4" stroke-linecap="round"></path>
      <path d="M 138 124 C 178 153, 216 153, 254 124 S 318 94, 354 124" fill="none" stroke="${visual.color}" stroke-width="5" stroke-linecap="round"></path>
      <text x="218" y="169" text-anchor="middle" fill="${visual.color}" font-size="12" font-weight="900">serpentine across flange pair</text>
    `;
  }

  function renderSupportPattern(visual) {
    return `
      ${renderBasePipe(72, 102, 294)}
      <path d="M 172 125 Q 218 160 264 125 L 250 174 L 186 174 Z" fill="#e2e8f0" stroke="#334155" stroke-width="4"></path>
      <line x1="186" y1="174" x2="250" y2="174" stroke="#334155" stroke-width="6" stroke-linecap="round"></line>
      <path d="M 118 121 C 154 150, 186 151, 218 132 S 282 112, 332 134" fill="none" stroke="#111827" stroke-width="8" opacity=".4" stroke-linecap="round"></path>
      <path d="M 118 115 C 154 141, 186 142, 218 124 S 282 105, 332 126" fill="none" stroke="${visual.color}" stroke-width="5" stroke-linecap="round"></path>
      <path d="M 185 130 C 200 145, 236 145, 252 130" fill="none" stroke="${visual.color}" stroke-width="4" stroke-linecap="round"></path>
      <text x="218" y="190" text-anchor="middle" fill="${visual.color}" font-size="12" font-weight="900">bridge around support heat sink</text>
    `;
  }

  function renderInstrumentPattern(visual) {
    return `
      ${renderBasePipe(66, 120, 300)}
      <line x1="218" y1="100" x2="218" y2="54" stroke="#334155" stroke-width="11" stroke-linecap="round"></line>
      <circle cx="218" cy="48" r="22" fill="#e2e8f0" stroke="#334155" stroke-width="4"></circle>
      <path d="M 205 49 L 216 38 L 231 55" fill="none" stroke="#475569" stroke-width="3" stroke-linecap="round"></path>
      <path d="M 130 140 C 172 168, 250 168, 308 140" fill="none" stroke="#111827" stroke-width="8" opacity=".4" stroke-linecap="round"></path>
      <path d="M 130 134 C 172 158, 250 158, 308 134" fill="none" stroke="${visual.color}" stroke-width="5" stroke-linecap="round"></path>
      <path d="M 201 111 C 175 88, 190 58, 217 70 C 246 82, 242 106, 220 120" fill="none" stroke="${visual.color}" stroke-width="4.5" stroke-linecap="round"></path>
      <text x="218" y="187" text-anchor="middle" fill="${visual.color}" font-size="12" font-weight="900">loop branch/tap before continuing</text>
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
    renderComponentRoutingGuide();
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
      { label: `Pipe Surface Temperature`, color: '#1d6cff', points: surfacePoints },
      { label: `Fluid Temperature (Maintained)`, color: '#8aa7d6', dash: '7 7', points: maintainPoints },
      { label: `Ambient Temperature`, color: '#98a2b3', dash: '7 7', points: ambientPoints },
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
        label: `Conduction (Through Insulation)`,
        value: preMarginOutput * conductionShare,
        color: '#4f8df7',
      },
      {
        label: result.environment === 'buried' ? `Soil Conduction` : `Convection (External Air)`,
        value: preMarginOutput * filmShare,
        color: '#86aef4',
      },
      {
        label: `Radiation / Margin (${outputUnit})`,
        value: Math.max(0, requiredOutput - preMarginOutput),
        color: '#fed36f',
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
      return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="${item.dash ? 2.4 : 3.4}" stroke-linejoin="round" stroke-linecap="round" ${item.dash ? `stroke-dasharray="${item.dash}"` : ''}></path>`;
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
      {
        id: 'burial-depth-ft',
        labelId: 'burial-depth-label',
        imperialLabel: 'Burial depth (ft)',
        metricLabel: 'Burial depth (m)',
        imperialMin: 0.5,
        imperialMax: 20,
        imperialStep: 0.5,
        metricMin: 0.15,
        metricMax: 6,
        metricStep: 0.1,
        toMetric: imperialToMetric.burialDepthFt,
        toImperial: metricToImperial.burialDepthFt,
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
      const exactInput = sensitivityControls.querySelector(`#sensitivity-${driver.inputId}-number`);
      existing.min = sourceInput.min || '0';
      existing.max = sourceInput.max || '500';
      existing.step = sourceInput.step || '1';
      if (existing.dataset.unitSystem !== activeUnitSystem) {
        existing.value = sourceInput.value;
      }
      existing.dataset.unitSystem = activeUnitSystem;
      if (exactInput) {
        exactInput.min = existing.min;
        exactInput.max = existing.max;
        exactInput.step = existing.step;
        exactInput.value = roundForDisplay(parseFloat(existing.value), driver.inputId);
      }
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
      <div class="heattrace-sensitivity-control-line">
        <input type="range" id="sensitivity-${driver.inputId}" class="heattrace-sensitivity-slider">
        <input type="number" id="sensitivity-${driver.inputId}-number" class="heattrace-sensitivity-number" aria-label="${escHtml(driver.label)} exact sensitivity value">
      </div>
    `;
    sensitivityControls.appendChild(wrapper);

    const slider = wrapper.querySelector('.heattrace-sensitivity-slider');
    const exactInput = wrapper.querySelector('.heattrace-sensitivity-number');
    const valueLabel = wrapper.querySelector('.heattrace-sensitivity-value');
    if (!sourceInput) return slider;

    slider.min = sourceInput.min || '0';
    slider.max = sourceInput.max || '500';
    slider.step = sourceInput.step || '1';
    slider.value = sourceInput.value;
    slider.dataset.unitSystem = activeUnitSystem;
    exactInput.min = slider.min;
    exactInput.max = slider.max;
    exactInput.step = slider.step;
    exactInput.value = roundForDisplay(parseFloat(slider.value), driver.inputId);

    const updateLabel = () => {
      valueLabel.textContent = `${driver.format(parseFloat(slider.value))} ${driver.unit()}`;
    };
    updateLabel();
    slider.addEventListener('input', () => {
      exactInput.value = roundForDisplay(parseFloat(slider.value), driver.inputId);
      updateLabel();
      renderSensitivityModule();
    });
    exactInput.addEventListener('change', () => {
      const nextValue = clampValue(parseFloat(exactInput.value), parseFloat(slider.min), parseFloat(slider.max));
      if (!Number.isFinite(nextValue)) {
        exactInput.value = roundForDisplay(parseFloat(slider.value), driver.inputId);
        return;
      }
      slider.value = roundForDisplay(nextValue, driver.inputId);
      exactInput.value = roundForDisplay(nextValue, driver.inputId);
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
      const exactInput = document.getElementById(`sensitivity-${driver.inputId}-number`);
      if (exactInput) exactInput.value = roundForDisplay(applyValue, driver.inputId);
      const valueTag = document.getElementById(`sensitivity-${driver.inputId}-value`);
      if (valueTag) valueTag.textContent = `${driver.format(parseFloat(slider.value))} ${driver.unit()}`;
    }
    const liveResult = getLiveAnalysisResult() || getStudies().heatTraceSizing || null;
    renderResults(liveResult);
    renderSystemOverview(liveResult);
    renderWorkspaceCharts(liveResult);
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

  function updateBuriedFieldVisibility() {
    const showBuriedFields = environmentSelect?.value === 'buried';
    buriedFields.forEach(field => {
      field.hidden = !showBuriedFields;
    });
  }

  function addCurrentCircuitCase() {
    const result = getLiveAnalysisResult() || currentHeatTraceResult || getStudies().heatTraceSizing || null;
    if (!result) {
      showModal('Input Error', '<p>Enter valid heat trace inputs before adding a branch to the schedule.</p>', 'error');
      return;
    }

    const inputs = readInputs();
    const constructionMetadata = readConstructionMetadata();
    if (!constructionMetadata) return;
    const name = circuitCaseNameInput?.value.trim() || `HT-${circuitCases.length + 1}`;
    const voltage = inputs.voltageV || 0;
    const loadAmps = result.installedLoadAmps ?? (voltage > 0 ? result.totalCircuitWatts / voltage : 0);
    const existingIndex = editingCircuitCaseId
      ? circuitCases.findIndex(item => item.id === editingCircuitCaseId)
      : -1;
    const nextCase = {
      id: existingIndex >= 0 ? circuitCases[existingIndex].id : `ht-${Date.now()}-${circuitCases.length}`,
      name,
      unitSystem: activeUnitSystem,
      inputs,
      result,
      loadAmps,
      ...constructionMetadata,
      createdAt: existingIndex >= 0 ? circuitCases[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    circuitCases = existingIndex >= 0
      ? circuitCases.map((item, index) => index === existingIndex ? nextCase : item)
      : [...circuitCases, nextCase];
    editingCircuitCaseId = null;
    persistCircuitCases();
    updateCircuitCaseActionState();
    renderCircuitCaseList();
    refreshReportIfVisible();
    if (circuitCaseNameInput) {
      circuitCaseNameInput.value = `HT-${circuitCases.length + 1}`;
    }
  }

  function attachCircuitCaseHandlers() {
    if (circuitCaseHandlersAttached) return;
    circuitCaseHandlersAttached = true;

    document.addEventListener('click', event => {
      if (event.target.closest('#add-circuit-case')) {
        event.preventDefault();
        event.stopPropagation();
        addCurrentCircuitCase();
        return;
      }
      if (event.target.closest('#clear-circuit-cases')) {
        event.preventDefault();
        event.stopPropagation();
        circuitCases = [];
        editingCircuitCaseId = null;
        persistCircuitCases();
        updateCircuitCaseActionState();
        renderCircuitCaseList();
        refreshReportIfVisible();
        return;
      }
      const editButton = event.target.closest('[data-circuit-case-edit]');
      if (editButton) {
        event.preventDefault();
        event.stopPropagation();
        loadCircuitCase(editButton.getAttribute('data-circuit-case-edit'));
        return;
      }
      const duplicateButton = event.target.closest('[data-circuit-case-duplicate]');
      if (duplicateButton) {
        event.preventDefault();
        event.stopPropagation();
        duplicateCircuitCase(duplicateButton.getAttribute('data-circuit-case-duplicate'));
        return;
      }
      const deleteButton = event.target.closest('[data-circuit-case-delete]');
      if (!deleteButton) return;
      event.preventDefault();
      event.stopPropagation();
      const id = deleteButton.getAttribute('data-circuit-case-delete');
      circuitCases = circuitCases.filter(item => item.id !== id);
      if (editingCircuitCaseId === id) {
        editingCircuitCaseId = null;
        updateCircuitCaseActionState();
      }
      persistCircuitCases();
      renderCircuitCaseList();
      refreshReportIfVisible();
    }, true);
  }

  function initSidebarTabs() {
    if (!sidebarTabButtons.length || !inputSections || !assumptionsSection) return;

    const activateSidebarTab = tabName => {
      const showAssumptions = tabName === 'assumptions';
      inputSections.hidden = showAssumptions;
      assumptionsSection.hidden = !showAssumptions;
      if (showAssumptions) {
        assumptionsSection.open = true;
      }
      sidebarTabButtons.forEach(button => {
        const isActive = button.dataset.sidebarTab === tabName;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        button.tabIndex = isActive ? 0 : -1;
      });
    };

    sidebarTabButtons.forEach(button => {
      button.addEventListener('click', () => activateSidebarTab(button.dataset.sidebarTab));
      button.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const nextTab = button.dataset.sidebarTab === 'inputs' ? 'assumptions' : 'inputs';
        activateSidebarTab(nextTab);
        sidebarTabButtons.find(item => item.dataset.sidebarTab === nextTab)?.focus();
      });
    });

    activateSidebarTab('inputs');
  }

  function loadCircuitCase(caseId) {
    const circuitCase = circuitCases.find(item => item.id === caseId);
    if (!circuitCase) return;

    editingCircuitCaseId = caseId;
    updateCircuitCaseActionState();
    writeInputsToForm(circuitCase.inputs || {}, circuitCase.unitSystem || activeUnitSystem);
    writeConstructionMetadataToForm(circuitCase);
    if (circuitCaseNameInput) {
      circuitCaseNameInput.value = circuitCase.name || '';
    }
    const liveResult = getLiveAnalysisResult() || circuitCase.result || null;
    renderResults(liveResult);
    renderWorkspaceCharts(liveResult);
    renderSystemOverview(liveResult);
    renderSensitivityModule();
    renderCircuitCaseList();
  }

  function duplicateCircuitCase(caseId) {
    const circuitCase = circuitCases.find(item => item.id === caseId);
    if (!circuitCase) return;
    const duplicateName = nextDuplicateName(circuitCase.name || `HT-${circuitCases.length + 1}`);
    const duplicate = {
      ...circuitCase,
      id: `ht-${Date.now()}-${circuitCases.length}`,
      name: duplicateName,
      inputs: { ...(circuitCase.inputs || {}) },
      result: circuitCase.result ? { ...circuitCase.result } : circuitCase.result,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    circuitCases = [...circuitCases, duplicate];
    editingCircuitCaseId = null;
    persistCircuitCases();
    updateCircuitCaseActionState();
    renderCircuitCaseList();
    refreshReportIfVisible();
    if (circuitCaseNameInput) {
      circuitCaseNameInput.value = `HT-${circuitCases.length + 1}`;
    }
  }

  function nextDuplicateName(baseName) {
    const cleanBase = String(baseName || 'HT').replace(/\s+Copy(?:\s+\d+)?$/i, '');
    let nextName = `${cleanBase} Copy`;
    let suffix = 2;
    const names = new Set(circuitCases.map(item => item.name));
    while (names.has(nextName)) {
      nextName = `${cleanBase} Copy ${suffix}`;
      suffix += 1;
    }
    return nextName;
  }

  function writeInputsToForm(inputs, unitSystem) {
    if (unitSystemSelect) {
      unitSystemSelect.value = unitSystem;
    }
    activeUnitSystem = unitSystem;
    applyUnitSystem(unitSystem, { convertExistingValues: false });

    setControlValue('pipe-nps', inputs.pipeNps);
    setControlValue('insulation-type', inputs.insulationType);
    setControlValue('pipe-material', inputs.pipeMaterial);
    setControlValue('environment', inputs.environment);
    setControlValue('voltage-v', inputs.voltageV);
    setControlValue('heat-trace-cable-type', inputs.heatTraceCableType || 'selfRegulating');
    setControlValue('trace-run-count', inputs.traceRunCount || 1);
    setControlValue('soil-conductivity', inputs.soilThermalConductivityWPerMK);
    setDisplayValue('insulation-thickness-in', inputs.insulationThicknessIn, unitSystem === 'metric' ? imperialToMetric.insulationThicknessIn : value => value);
    setDisplayValue('line-length-ft', inputs.lineLengthFt, unitSystem === 'metric' ? imperialToMetric.lineLengthFt : value => value);
    setDisplayValue('ambient-temp-c', inputs.ambientTempC, unitSystem === 'metric' ? value => value : cToF);
    setDisplayValue('maintain-temp-c', inputs.maintainTempC, unitSystem === 'metric' ? value => value : cToF);
    setDisplayValue('wind-speed-mph', inputs.windSpeedMph, unitSystem === 'metric' ? imperialToMetric.windSpeedMph : value => value);
    setDisplayValue('max-circuit-length-ft', inputs.maxCircuitLengthFt, unitSystem === 'metric' ? imperialToMetric.maxCircuitLengthFt : value => value);
    setDisplayValue('burial-depth-ft', inputs.burialDepthFt, unitSystem === 'metric' ? imperialToMetric.burialDepthFt : value => value);
    setControlValue('design-margin-pct', inputs.safetyMarginPct);
    renderComponentAllowanceRows(Array.isArray(inputs.componentAllowances) ? inputs.componentAllowances : []);
    updateBuriedFieldVisibility();
  }

  function setControlValue(id, value) {
    if (value == null) return;
    const input = document.getElementById(id);
    if (input) input.value = String(value);
  }

  function setDisplayValue(id, value, transform) {
    if (value == null) return;
    const nextValue = transform(Number(value));
    if (!Number.isFinite(nextValue)) return;
    setControlValue(id, roundForDisplay(nextValue, id));
  }

  function persistCircuitCases() {
    const studies = getStudies();
    studies.heatTraceSizingCircuits = circuitCases;
    setStudies(studies);
  }

  function readConstructionMetadata() {
    const accessoryOverrides = parseAccessoryOverrides(constructionFields.accessoryOverrides?.value || '');
    if (accessoryOverrides === null) return null;
    const advancedMetadata = readAdvancedMetadata();
    if (advancedMetadata === null) return null;
    return {
      pipeTag: constructionFields.pipeTag?.value?.trim() || '',
      service: constructionFields.service?.value?.trim() || '',
      area: constructionFields.area?.value?.trim() || '',
      sourcePanel: constructionFields.sourcePanel?.value?.trim() || '',
      controllerTag: constructionFields.controllerTag?.value?.trim() || '',
      circuitNumber: constructionFields.circuitNumber?.value?.trim() || '',
      cableFamilyId: constructionFields.cableFamilyId?.value || '',
      accessoryOverrides,
      installationNotes: constructionFields.installationNotes?.value?.trim() || '',
      ...advancedMetadata,
    };
  }

  function readAdvancedMetadata() {
    const advancedSegments = parseAdvancedSegments(advancedFields.segmentsJson?.value || '');
    if (advancedSegments === null) return null;
    const startupAmbient = Number(advancedFields.startupAmbientC?.value);
    const startupDiversity = Number(advancedFields.startupDiversity?.value);
    const sensorCount = Number(advancedFields.sensorCount?.value);
    const tRatingTargetC = Number(advancedFields.tRatingTargetC?.value);
    return {
      assetType: advancedFields.assetType?.value || 'pipe',
      assetTag: advancedFields.assetTag?.value?.trim() || '',
      panelPhase: advancedFields.panelPhase?.value || 'unassigned',
      diversityGroup: advancedFields.diversityGroup?.value?.trim() || '',
      advancedSegments,
      controlMetadata: {
        controllerType: advancedFields.controllerType?.value?.trim() || '',
        controlMode: advancedFields.controlMode?.value?.trim() || '',
        sensorCount: Number.isFinite(sensorCount) ? sensorCount : 0,
        sensorLocation: advancedFields.sensorLocation?.value?.trim() || '',
        highLimitSensor: Boolean(advancedFields.highLimitSensor?.checked),
      },
      hazardousArea: {
        enabled: Boolean(advancedFields.hazardousEnabled?.checked),
        classification: advancedFields.hazardousClassification?.value?.trim() || '',
        tRatingTargetC: Number.isFinite(tRatingTargetC) ? tRatingTargetC : 0,
      },
      startupBasis: {
        minimumAmbientC: Number.isFinite(startupAmbient) ? startupAmbient : undefined,
        diversityFactor: Number.isFinite(startupDiversity) ? startupDiversity : undefined,
      },
      advancedNotes: advancedFields.notes?.value?.trim() || '',
    };
  }

  function parseAdvancedSegments(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error('Advanced segment rows must be a JSON array.');
      }
      return parsed;
    } catch (err) {
      showModal('Advanced Segment Error', `<p>${escHtml(err.message || 'Advanced segment rows must be valid JSON.')}</p>`, 'error');
      return null;
    }
  }

  function parseAccessoryOverrides(raw) {
    const text = String(raw || '').trim();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Accessory overrides must be a JSON object.');
      }
      return Object.fromEntries(Object.entries(parsed)
        .map(([key, value]) => [key, Number(value)])
        .filter(([, value]) => Number.isFinite(value) && value > 0));
    } catch (err) {
      showModal('Accessory Override Error', `<p>${escHtml(err.message || 'Accessory overrides must be valid JSON.')}</p>`, 'error');
      return null;
    }
  }

  function writeConstructionMetadataToForm(caseItem = {}) {
    const nested = caseItem.construction && typeof caseItem.construction === 'object' ? caseItem.construction : {};
    setFieldValue(constructionFields.pipeTag, caseItem.pipeTag ?? nested.pipeTag ?? '');
    setFieldValue(constructionFields.service, caseItem.service ?? nested.service ?? '');
    setFieldValue(constructionFields.area, caseItem.area ?? nested.area ?? '');
    setFieldValue(constructionFields.sourcePanel, caseItem.sourcePanel ?? nested.sourcePanel ?? '');
    setFieldValue(constructionFields.controllerTag, caseItem.controllerTag ?? nested.controllerTag ?? '');
    setFieldValue(constructionFields.circuitNumber, caseItem.circuitNumber ?? nested.circuitNumber ?? '');
    setFieldValue(constructionFields.cableFamilyId, caseItem.cableFamilyId ?? nested.cableFamilyId ?? '');
    const overrides = caseItem.accessoryOverrides ?? nested.accessoryOverrides ?? {};
    setFieldValue(constructionFields.accessoryOverrides, Object.keys(overrides).length ? JSON.stringify(overrides) : '');
    setFieldValue(constructionFields.installationNotes, caseItem.installationNotes ?? nested.installationNotes ?? '');
    writeAdvancedMetadataToForm(caseItem);
  }

  function writeAdvancedMetadataToForm(caseItem = {}) {
    const advanced = caseItem.advancedHeatTrace && typeof caseItem.advancedHeatTrace === 'object' ? caseItem.advancedHeatTrace : {};
    setFieldValue(advancedFields.assetType, caseItem.assetType ?? advanced.assetType ?? 'pipe');
    setFieldValue(advancedFields.assetTag, caseItem.assetTag ?? advanced.assetTag ?? '');
    setFieldValue(advancedFields.panelPhase, caseItem.panelPhase ?? advanced.panelPhase ?? 'unassigned');
    setFieldValue(advancedFields.diversityGroup, caseItem.diversityGroup ?? advanced.diversityGroup ?? '');
    const control = caseItem.controlMetadata ?? advanced.controlMetadata ?? {};
    setFieldValue(advancedFields.controllerType, control.controllerType ?? '');
    setFieldValue(advancedFields.controlMode, control.controlMode ?? '');
    setFieldValue(advancedFields.sensorCount, control.sensorCount ?? 0);
    setFieldValue(advancedFields.sensorLocation, control.sensorLocation ?? '');
    if (advancedFields.highLimitSensor) advancedFields.highLimitSensor.checked = Boolean(control.highLimitSensor);
    const hazardous = caseItem.hazardousArea ?? advanced.hazardousArea ?? {};
    if (advancedFields.hazardousEnabled) advancedFields.hazardousEnabled.checked = Boolean(hazardous.enabled);
    setFieldValue(advancedFields.hazardousClassification, hazardous.classification ?? '');
    setFieldValue(advancedFields.tRatingTargetC, hazardous.tRatingTargetC ?? '');
    const startup = caseItem.startupBasis ?? advanced.startupBasis ?? {};
    setFieldValue(advancedFields.startupAmbientC, startup.minimumAmbientC ?? '');
    setFieldValue(advancedFields.startupDiversity, startup.diversityFactor ?? '');
    const segments = caseItem.advancedSegments ?? advanced.advancedSegments ?? [];
    setFieldValue(advancedFields.segmentsJson, Array.isArray(segments) && segments.length ? JSON.stringify(segments, null, 2) : '');
    setFieldValue(advancedFields.notes, caseItem.advancedNotes ?? advanced.advancedNotes ?? '');
  }

  function setFieldValue(field, value) {
    if (field) field.value = String(value ?? '');
  }

  function updateCircuitCaseActionState() {
    if (!addCircuitCaseButton) return;
    addCircuitCaseButton.textContent = editingCircuitCaseId ? 'Update Branch' : 'Add Current Branch';
    addCircuitCaseButton.classList.toggle('heattrace-circuit-update-active', Boolean(editingCircuitCaseId));
  }

  function renderCircuitCaseList() {
    if (!circuitCaseList) return;
    const schedule = buildHeatTraceBranchSchedule(circuitCases);
    if (!schedule.rows.length) {
      circuitCaseList.innerHTML = '<p class="field-hint heattrace-circuit-empty">No heat-trace branches added yet. Configure the current run, then add it here to build a branch schedule.</p>';
      return;
    }

    const voltageSummary = schedule.summary.byVoltage
      .map(group => {
        const voltage = Number(group.voltageV);
        const voltageLabel = Number.isFinite(voltage) && voltage > 0 ? `${voltage.toFixed(0)} V` : 'unknown voltage';
        return `${group.count} @ ${voltageLabel}: ${group.totalAmps.toFixed(1)} A`;
      })
      .join(' | ');
    circuitCaseList.innerHTML = `
      <div class="heattrace-circuit-case-total">
        <span>${schedule.summary.branchCount} heat-trace branch${schedule.summary.branchCount === 1 ? '' : 'es'}</span>
        <strong>${schedule.summary.totalConnectedWatts.toFixed(0)} W (${schedule.summary.totalConnectedKw.toFixed(2)} kW) connected</strong>
        <small>${escHtml(voltageSummary || 'No voltage basis')}</small>
        <small>${schedule.summary.overLimitCount} over length limit, ${schedule.summary.warningCount} with warnings</small>
      </div>
      <div class="heattrace-circuit-case-table-wrap">
        <table class="heattrace-circuit-case-table">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Status</th>
              <th>Effective Length</th>
              <th>Selected</th>
              <th>Installed Load</th>
              <th>Construction</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
        ${schedule.rows.map(row => {
          return `
            <tr class="heattrace-circuit-case-row${row.id === editingCircuitCaseId ? ' is-editing' : ''}" data-circuit-case-id="${escHtml(row.id)}">
              <td><strong>${escHtml(row.name)}</strong><span>${escHtml(row.warnings.join(' | ') || 'No warnings')}</span></td>
              <td>${renderBranchStatusBadge(row.status)}</td>
              <td>${escHtml(formatLength(row.effectiveTraceLengthFt ?? row.lineLengthFt, row.unitSystem))} / ${escHtml(formatLength(row.maxCircuitLengthFt, row.unitSystem))}<br><span>${escHtml(formatLength(row.componentAllowanceLengthFt || 0, row.unitSystem))} allowance</span></td>
              <td>${escHtml(formatHeatTraceCableType(row.heatTraceCableType))}<br>${row.selectedWPerFt.toFixed(1)} W/ft x ${row.traceRunCount || 1}</td>
              <td>${row.totalWatts.toFixed(0)} W<br>${row.loadAmps.toFixed(1)} A @ ${escHtml(formatVoltage(row.voltageV))}<br><span>${row.requiredWatts.toFixed(0)} W required</span></td>
              <td>${escHtml((circuitCases.find(item => item.id === row.id)?.pipeTag) || row.name)}<br><span>${escHtml((circuitCases.find(item => item.id === row.id)?.controllerTag) || 'No controller')}</span></td>
              <td>
                <div class="heattrace-circuit-case-actions">
                  <button type="button" class="btn" data-circuit-case-edit="${escHtml(row.id)}">Edit</button>
                  <button type="button" class="btn" data-circuit-case-duplicate="${escHtml(row.id)}">Duplicate</button>
                  <button type="button" class="btn" data-circuit-case-delete="${escHtml(row.id)}">Remove</button>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderBranchStatusBadge(status) {
    const labelByStatus = {
      withinLimit: 'Within limit',
      warning: 'Review',
      overLimit: 'Over limit',
      invalid: 'Invalid',
    };
    return `<span class="heattrace-branch-status heattrace-branch-status--${escHtml(status)}">${escHtml(labelByStatus[status] || status)}</span>`;
  }

  function formatVoltage(voltageV) {
    const voltage = Number(voltageV);
    return Number.isFinite(voltage) && voltage > 0 ? `${voltage.toFixed(0)} V` : 'n/a';
  }

  function attachReportHandlers() {
    reportActionButton?.addEventListener('click', () => {
      document.getElementById('heattrace-tab-report')?.click();
      renderReportPreview();
    });
    reportGenerateButton?.addEventListener('click', renderReportPreview);
    packageGenerateButton?.addEventListener('click', renderInstallationPackagePreview);
    advancedPackageGenerateButton?.addEventListener('click', renderAdvancedPackagePreview);
    reportExportJsonButton?.addEventListener('click', exportReportJson);
    packageExportJsonButton?.addEventListener('click', exportInstallationPackageJson);
    advancedPackageExportJsonButton?.addEventListener('click', exportAdvancedPackageJson);
    reportPrintButton?.addEventListener('click', () => {
      if (!reportPreview || reportPreview.hidden) {
        renderReportPreview();
      }
      if (reportPreview && !reportPreview.hidden) {
        setTimeout(() => window.print(), 100);
      }
    });
  }

  function getProjectName() {
    const state = getProjectState();
    return state?.name || document.querySelector('.heattrace-footer-meta strong')?.textContent?.trim() || 'Untitled Project';
  }

  function getReportActiveResult(preferredResult = null) {
    const result = preferredResult || currentHeatTraceResult || getLiveAnalysisResult() || getStudies().heatTraceSizing || null;
    if (result && !result.unitSystem) {
      result.unitSystem = activeUnitSystem;
    }
    return result;
  }

  function buildCurrentHeatTraceReport(preferredResult = null) {
    return buildHeatTraceReport({
      activeResult: getReportActiveResult(preferredResult),
      activeInputs: readInputs(),
      circuitCases,
      approval: getStudyApprovals().heatTraceSizing || null,
      projectName: getProjectName(),
    });
  }

  function buildCurrentHeatTraceInstallationPackage(preferredResult = null) {
    return buildHeatTraceInstallationPackage({
      activeResult: getReportActiveResult(preferredResult),
      activeInputs: readInputs(),
      circuitCases,
      approval: getStudyApprovals().heatTraceSizing || null,
      projectName: getProjectName(),
    });
  }

  function buildCurrentHeatTraceAdvancedPackage(preferredResult = null) {
    return buildHeatTraceAdvancedPackage({
      activeResult: getReportActiveResult(preferredResult),
      activeInputs: readInputs(),
      circuitCases,
      approval: getStudyApprovals().heatTraceSizing || null,
      projectName: getProjectName(),
    });
  }

  function renderReportPreview() {
    const report = buildCurrentHeatTraceReport();
    const hasReportContent = Boolean(report.activeCase) || report.branchSchedule.summary.branchCount > 0;
    if (!hasReportContent) {
      if (reportStatus) reportStatus.textContent = 'Run a valid analysis or add at least one branch case before generating the calculation sheet.';
      if (reportPreview) {
        reportPreview.hidden = true;
        reportPreview.innerHTML = '';
      }
      return false;
    }
    if (reportPreview) {
      reportPreview.innerHTML = renderHeatTraceReportHTML(report);
      reportPreview.hidden = false;
    }
    if (reportStatus) {
      reportStatus.textContent = `Report generated for ${report.branchSchedule.summary.branchCount} saved branch${report.branchSchedule.summary.branchCount === 1 ? '' : 'es'} and active status ${report.summary.activeStatus}.`;
    }
    return true;
  }

  function refreshReportIfVisible() {
    if (reportPreview && !reportPreview.hidden) {
      renderReportPreview();
    }
  }

  function renderInstallationPackagePreview() {
    const pkg = buildCurrentHeatTraceInstallationPackage();
    if (!pkg.lineList.rows.length) {
      if (reportStatus) reportStatus.textContent = 'Add at least one branch case before generating the installation package.';
      if (reportPreview) {
        reportPreview.hidden = true;
        reportPreview.innerHTML = '';
      }
      return false;
    }
    if (reportPreview) {
      reportPreview.innerHTML = renderHeatTraceInstallationPackageHTML(pkg);
      reportPreview.hidden = false;
    }
    if (reportStatus) {
      reportStatus.textContent = `Installation package generated: ${pkg.summary.lineCount} line list row${pkg.summary.lineCount === 1 ? '' : 's'}, ${pkg.summary.bomItemCount} BOM item type${pkg.summary.bomItemCount === 1 ? '' : 's'}, ${pkg.summary.warningCount} warning${pkg.summary.warningCount === 1 ? '' : 's'}.`;
    }
    return true;
  }

  function renderAdvancedPackagePreview() {
    const pkg = buildCurrentHeatTraceAdvancedPackage();
    if (!pkg.assetRows.length) {
      if (reportStatus) reportStatus.textContent = 'Run a valid analysis or add at least one branch case before generating the advanced package.';
      if (reportPreview) {
        reportPreview.hidden = true;
        reportPreview.innerHTML = '';
      }
      return false;
    }
    if (reportPreview) {
      reportPreview.innerHTML = renderHeatTraceAdvancedHTML(pkg);
      reportPreview.hidden = false;
    }
    if (reportStatus) {
      reportStatus.textContent = `Advanced heat trace package generated: ${pkg.summary.assetCount} asset${pkg.summary.assetCount === 1 ? '' : 's'}, ${pkg.summary.segmentCount} segment${pkg.summary.segmentCount === 1 ? '' : 's'}, ${pkg.summary.warningCount} warning${pkg.summary.warningCount === 1 ? '' : 's'}.`;
    }
    return true;
  }

  function exportReportJson() {
    const report = buildCurrentHeatTraceReport();
    const hasReportContent = Boolean(report.activeCase) || report.branchSchedule.summary.branchCount > 0;
    if (!hasReportContent) {
      if (reportStatus) reportStatus.textContent = 'Nothing to export yet. Run analysis or add at least one branch case.';
      showModal('No Heat Trace Report', '<p>Run analysis or add at least one branch case before exporting JSON.</p>', 'info');
      return;
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `heat-trace-report-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    if (reportStatus) reportStatus.textContent = 'Heat trace report JSON exported.';
  }

  function exportInstallationPackageJson() {
    const pkg = buildCurrentHeatTraceInstallationPackage();
    if (!pkg.lineList.rows.length) {
      if (reportStatus) reportStatus.textContent = 'Nothing to export yet. Add at least one branch case.';
      showModal('No Installation Package', '<p>Add at least one branch case before exporting the heat trace installation package.</p>', 'info');
      return;
    }
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `heat-trace-installation-package-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    if (reportStatus) reportStatus.textContent = 'Heat trace installation package JSON exported.';
  }

  function exportAdvancedPackageJson() {
    const pkg = buildCurrentHeatTraceAdvancedPackage();
    if (!pkg.assetRows.length) {
      if (reportStatus) reportStatus.textContent = 'Nothing to export yet. Run analysis or add at least one branch case.';
      showModal('No Advanced Package', '<p>Run analysis or add at least one branch case before exporting the advanced heat trace package.</p>', 'info');
      return;
    }
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `heat-trace-advanced-package-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    if (reportStatus) reportStatus.textContent = 'Heat trace advanced package JSON exported.';
  }

  function formatLength(lengthFt, unitSystem = activeUnitSystem) {
    if (unitSystem === 'metric') {
      return `${imperialToMetric.lineLengthFt(lengthFt).toFixed(1)} m`;
    }
    return `${Number(lengthFt || 0).toFixed(0)} ft`;
  }

  function formatCableRating(result) {
    if (!result || !Number.isFinite(result.recommendedCableRatingWPerFt)) return 'No rating';
    if (result.unitSystem === 'metric') {
      return `${wPerFtToWPerM(result.recommendedCableRatingWPerFt).toFixed(1)} W/m`;
    }
    return `${result.recommendedCableRatingWPerFt.toFixed(1)} W/ft`;
  }

  function formatHeatTraceCableType(type) {
    return HEAT_TRACE_CABLE_TYPES[type]?.label || HEAT_TRACE_CABLE_TYPES.selfRegulating.label;
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
    'burial-depth-ft': 1,
    'soil-conductivity': 2,
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

function wattsToBtuHr(watts) {
  return watts * 3.412142;
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
    selfRegulating: 'Self-regulating',
    constantWattage: 'Constant wattage',
    powerLimiting: 'Power-limiting / zone',
    mineralInsulated: 'Mineral insulated',
    'indoor-still': 'Indoor — Still Air',
    'outdoor-sheltered': 'Outdoor — Sheltered',
    'outdoor-windy': 'Outdoor — Windy',
    'hazardous-area': 'Hazardous Area',
    freezer: 'Freezer / Cold Room',
    buried: 'Buried / Below Grade',
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
  burialDepthFt: feet => feet * 0.3048,
};

const metricToImperial = {
  ambientTempC: cToF,
  maintainTempC: cToF,
  insulationThicknessIn: mm => mm / 25.4,
  lineLengthFt: meters => meters / 0.3048,
  windSpeedMph: kmh => kmh / 1.60934,
  maxCircuitLengthFt: meters => meters / 0.3048,
  burialDepthFt: meters => meters / 0.3048,
};
