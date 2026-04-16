const DEFAULT_VIEW = {
  width: 1200,
  height: 640
};

const LAYERS = {
  structure: 'structure',
  anodes: 'anodes',
  wiring: 'wiring',
  measurement: 'measurement'
};

const VIEW_MODES = {
  design: 'design',
  measurement: 'measurement'
};

const HEATMAP_THRESHOLDS = {
  medium: 0.4,
  high: 0.7
};

const HEATMAP_PALETTE = [
  { stop: 0, color: '#0072b2' },
  { stop: 0.45, color: '#56b4e9' },
  { stop: 0.72, color: '#e69f00' },
  { stop: 1, color: '#d55e00' }
];
const GRID_MINOR_SPACING = 55;
const GRID_MAJOR_SPACING = 110;
const PX_PER_METER = 11;

const MEASUREMENT_SETUPS = [
  {
    key: 'instantOffPotential',
    title: 'Instant-off potential',
    measured: 'Structure-to-electrolyte potential at the selected test point.',
    where: 'Reference electrode near the selected test point while interruption captures instant-off potential.',
    why: 'Confirms the structure meets the ≤ -850 mV (CSE) criterion.'
  },
  {
    key: 'polarizationShift',
    title: 'Polarization shift',
    measured: 'Difference between depolarized and polarized structure potential.',
    where: 'Reference electrode and test lead at a repeatable test station location.',
    why: 'Validates at least 100 mV of polarization shift for adequate protection.'
  },
  {
    key: 'testPointCoverage',
    title: 'Coverage sweep',
    measured: 'Pass/fail state across all defined test points.',
    where: 'Lead and reference electrode are moved station-by-station along the structure.',
    why: 'Ensures every monitored point satisfies acceptance criteria.'
  }
];

function getViewBounds(geometry) {
  const points = [];
  const structureSegments = Array.isArray(geometry?.structureSegments) ? geometry.structureSegments : [];
  const anodes = Array.isArray(geometry?.anodes) ? geometry.anodes : [];
  const testPoints = Array.isArray(geometry?.testPoints) ? geometry.testPoints : [];
  const referenceElectrode = geometry?.referenceElectrode;

  structureSegments.forEach((segment) => {
    points.push({ x: segment.x1, y: segment.y1 });
    points.push({ x: segment.x2, y: segment.y2 });
  });
  anodes.forEach((point) => points.push(point));
  testPoints.forEach((point) => points.push(point));
  if (referenceElectrode && Number.isFinite(referenceElectrode.x) && Number.isFinite(referenceElectrode.y)) {
    points.push(referenceElectrode);
  }

  const padding = 80;
  const maxX = points.length
    ? points.reduce((max, point) => Math.max(max, point.x || 0), 0)
    : DEFAULT_VIEW.width;
  const maxY = points.length
    ? points.reduce((max, point) => Math.max(max, point.y || 0), 0)
    : DEFAULT_VIEW.height;

  return {
    width: Math.max(DEFAULT_VIEW.width, Math.ceil(maxX + padding)),
    height: Math.max(DEFAULT_VIEW.height, Math.ceil(maxY + padding))
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clonePoints(points = []) {
  return points.map((point) => ({ ...point }));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function roundTo(value, decimals = 2) {
  const p = 10 ** decimals;
  return Math.round((Number(value) || 0) * p) / p;
}

function hexToRgb(color) {
  const safeColor = String(color || '').replace('#', '');
  const full = safeColor.length === 3
    ? safeColor.split('').map((char) => `${char}${char}`).join('')
    : safeColor.padStart(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function interpolateColor(colorA, colorB, amount) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const t = clamp01(amount);
  const toHex = (value) => Math.round(value).toString(16).padStart(2, '0');
  return `#${toHex(a.r + (b.r - a.r) * t)}${toHex(a.g + (b.g - a.g) * t)}${toHex(a.b + (b.b - a.b) * t)}`;
}

function getHeatColor(score) {
  const normalized = clamp01(score);
  for (let i = 1; i < HEATMAP_PALETTE.length; i += 1) {
    const current = HEATMAP_PALETTE[i];
    const previous = HEATMAP_PALETTE[i - 1];
    if (normalized <= current.stop) {
      const localRange = Math.max(0.0001, current.stop - previous.stop);
      const t = (normalized - previous.stop) / localRange;
      return interpolateColor(previous.color, current.color, t);
    }
  }
  return HEATMAP_PALETTE[HEATMAP_PALETTE.length - 1].color;
}

export function initCpLayoutCanvas({
  panelId = 'cp-layout-canvas-panel',
  formId = 'cp-form',
  initialLayout = null,
  onLayoutChange = null,
  onSegmentHover = null
} = {}) {
  const panel = document.getElementById(panelId);
  const form = document.getElementById(formId);
  if (!panel || !form) {
    return null;
  }

  const canvas = panel.querySelector('#cp-layout-canvas');
  const messageEl = panel.querySelector('#cp-layout-status');
  const resetButton = panel.querySelector('[data-cp-layout-action="reset"]');
  const zoomInButton = panel.querySelector('[data-cp-layout-action="zoom-in"]');
  const zoomOutButton = panel.querySelector('[data-cp-layout-action="zoom-out"]');
  const fitButton = panel.querySelector('[data-cp-layout-action="fit"]');
  const modeButtons = Array.from(panel.querySelectorAll('[data-cp-mode]'));
  const measurementPanel = panel.querySelector('#cp-measurement-side-panel');
  const measurementStateList = panel.querySelector('#cp-measurement-state-list');
  const hotspotInspector = panel.querySelector('#cp-hotspot-inspector');
  const propertiesPanelContent = panel.querySelector('#cp-element-properties-content');

  const layerToggles = {
    [LAYERS.structure]: panel.querySelector('#cp-layer-structure'),
    [LAYERS.anodes]: panel.querySelector('#cp-layer-anodes'),
    [LAYERS.wiring]: panel.querySelector('#cp-layer-wiring'),
    [LAYERS.measurement]: panel.querySelector('#cp-layer-measurement'),
    heatmap: panel.querySelector('#cp-layer-heatmap')
  };

  const heatmapFilters = {
    highRiskOnly: panel.querySelector('#cp-heat-filter-high-risk'),
    failedCriteriaOnly: panel.querySelector('#cp-heat-filter-failed-criteria'),
    lowMarginOnly: panel.querySelector('#cp-heat-filter-low-margin')
  };

  const state = {
    viewport: {
      scale: 1,
      x: 0,
      y: 0
    },
    layers: {
      [LAYERS.structure]: true,
      [LAYERS.anodes]: true,
      [LAYERS.wiring]: true,
      [LAYERS.measurement]: true
    },
    geometry: {
      structureSegments: [],
      anodes: [],
      testPoints: [],
      referenceElectrode: { x: 260, y: 280 }
    },
    viewMode: VIEW_MODES.design,
    activeMeasurementSetup: MEASUREMENT_SETUPS[0].key,
    animationTick: 0,
    hoveredSegmentIndex: null,
    externalHoveredSegmentIndex: null,
    heatmapEnabled: true,
    heatmapFilters: {
      highRiskOnly: false,
      failedCriteriaOnly: false,
      lowMarginOnly: false
    },
    assessmentData: null,
    selectedHotspotIndex: null,
    selectedElement: null
  };

  let animationFrameId = null;

  const dragState = {
    mode: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    itemIndex: -1,
    originX: 0,
    originY: 0
  };

  function getInput(id) {
    return form.querySelector(`#${id}`) || document.getElementById(id);
  }

  function getInputValues() {
    return {
      isMetric: getInput('unit-select')?.value === 'metric',
      numberOfAnodes: Math.max(1, Math.round(toNumber(getInput('number-of-anodes')?.value, 1))),
      anodeSpacing: Math.max(0.1, toNumber(getInput('anode-spacing')?.value, 100)),
      anodeDistance: Math.max(0.1, toNumber(getInput('anode-distance-to-structure')?.value, 10)),
      testPointCount: Math.max(1, Math.round(toNumber(getInput('test-point-count')?.value, 8))),
      referenceLocation: getInput('reference-electrode-location')?.value || 'local'
    };
  }

  function metersPerInputUnit(isMetric) {
    return isMetric ? 1 : 0.3048;
  }

  function buildGeometryFromInputs() {
    const values = getInputValues();
    const pxPerMeter = PX_PER_METER;
    const unitFactor = metersPerInputUnit(values.isMetric);
    const structureLengthM = Math.max(60, (values.numberOfAnodes - 1) * values.anodeSpacing * unitFactor + 80);
    const structureStartX = 110;
    const structureStartY = 310;
    const structureLengthPx = structureLengthM * pxPerMeter;
    const segmentLengthPx = structureLengthPx / 4;

    state.geometry.structureSegments = Array.from({ length: 4 }, (_, index) => ({
      x1: structureStartX + segmentLengthPx * index,
      y1: structureStartY,
      x2: structureStartX + segmentLengthPx * (index + 1),
      y2: structureStartY,
      label: `S${index + 1}`
    }));

    const anodeOffsetPx = values.anodeDistance * unitFactor * pxPerMeter;
    const anodeSpacingPx = values.anodeSpacing * unitFactor * pxPerMeter;
    const firstAnodeX = structureStartX + 30;

    state.geometry.anodes = Array.from({ length: values.numberOfAnodes }, (_, index) => ({
      x: firstAnodeX + index * anodeSpacingPx,
      y: structureStartY - anodeOffsetPx,
      label: `A${index + 1}`
    }));

    const testPointSpacingPx = values.testPointCount > 1
      ? (structureLengthPx - 60) / (values.testPointCount - 1)
      : 0;
    state.geometry.testPoints = Array.from({ length: values.testPointCount }, (_, index) => ({
      x: structureStartX + 30 + index * testPointSpacingPx,
      y: structureStartY + 58,
      label: `TP${index + 1}`
    }));

    state.geometry.referenceElectrode = {
      x: structureStartX + 200,
      y: values.referenceLocation === 'remote'
        ? structureStartY + 130
        : (values.referenceLocation === 'coupon-lead' ? structureStartY + 34 : structureStartY + 78)
    };
  }

  function applyPersistedLayout(layout = null) {
    if (!layout || typeof layout !== 'object') {
      return;
    }

    state.viewport = {
      ...state.viewport,
      ...(layout.viewport || {})
    };
    state.layers = {
      ...state.layers,
      ...(layout.layers || {})
    };
    if (typeof layout.heatmapEnabled === 'boolean') {
      state.heatmapEnabled = layout.heatmapEnabled;
    }
    if (layout.heatmapFilters && typeof layout.heatmapFilters === 'object') {
      state.heatmapFilters = {
        ...state.heatmapFilters,
        ...layout.heatmapFilters
      };
    }
    if (layout.viewMode) {
      state.viewMode = layout.viewMode;
    }
    if (layout.activeMeasurementSetup) {
      state.activeMeasurementSetup = layout.activeMeasurementSetup;
    }

    if (layout.geometry && typeof layout.geometry === 'object') {
      if (Array.isArray(layout.geometry.anodes) && layout.geometry.anodes.length) {
        state.geometry.anodes = clonePoints(layout.geometry.anodes);
      }
      if (Array.isArray(layout.geometry.testPoints) && layout.geometry.testPoints.length) {
        state.geometry.testPoints = clonePoints(layout.geometry.testPoints);
      }
      if (layout.geometry.referenceElectrode && typeof layout.geometry.referenceElectrode === 'object') {
        state.geometry.referenceElectrode = { ...layout.geometry.referenceElectrode };
      }
      if (Array.isArray(layout.geometry.structureSegments) && layout.geometry.structureSegments.length) {
        state.geometry.structureSegments = clonePoints(layout.geometry.structureSegments);
      }
    }
  }

  function worldFromClient(clientX, clientY) {
    const bounds = getViewBounds(state.geometry);
    const rect = canvas.getBoundingClientRect();
    const localX = ((clientX - rect.left) / rect.width) * bounds.width;
    const localY = ((clientY - rect.top) / rect.height) * bounds.height;
    return {
      x: (localX - state.viewport.x) / state.viewport.scale,
      y: (localY - state.viewport.y) / state.viewport.scale
    };
  }

  function updateFormValue(id, value) {
    const input = getInput(id);
    if (!input) return;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function syncInputsFromGeometry() {
    if (state.geometry.anodes.length >= 2) {
      const distances = [];
      for (let i = 1; i < state.geometry.anodes.length; i += 1) {
        distances.push(Math.abs(state.geometry.anodes[i].x - state.geometry.anodes[i - 1].x));
      }
      const averageSpacingPx = distances.reduce((sum, value) => sum + value, 0) / distances.length;
      const unitFactor = metersPerInputUnit(getInputValues().isMetric);
      const spacingValue = (averageSpacingPx / 11) / unitFactor;
      updateFormValue('anode-spacing', spacingValue.toFixed(2));
    }

    if (state.geometry.anodes.length) {
      const structureY = state.geometry.structureSegments[0]?.y1 ?? 310;
      const avgAnodeY = state.geometry.anodes.reduce((sum, point) => sum + point.y, 0) / state.geometry.anodes.length;
      const unitFactor = metersPerInputUnit(getInputValues().isMetric);
      const offsetValue = Math.abs(structureY - avgAnodeY) / 11 / unitFactor;
      updateFormValue('anode-distance-to-structure', offsetValue.toFixed(2));
    }

    if (state.geometry.referenceElectrode) {
      const structureY = state.geometry.structureSegments[0]?.y1 ?? 310;
      const delta = state.geometry.referenceElectrode.y - structureY;
      const location = delta < 48 ? 'coupon-lead' : (delta > 118 ? 'remote' : 'local');
      updateFormValue('reference-electrode-location', location);
    }
  }

  function announce(message) {
    if (messageEl) {
      messageEl.textContent = message;
    }
  }

  function serializeLayout() {
    return {
      viewport: { ...state.viewport },
      layers: { ...state.layers },
      heatmapEnabled: state.heatmapEnabled,
      heatmapFilters: { ...state.heatmapFilters },
      viewMode: state.viewMode,
      activeMeasurementSetup: state.activeMeasurementSetup,
      geometry: {
        structureSegments: clonePoints(state.geometry.structureSegments),
        anodes: clonePoints(state.geometry.anodes),
        testPoints: clonePoints(state.geometry.testPoints),
        referenceElectrode: { ...state.geometry.referenceElectrode }
      }
    };
  }

  function notifyLayoutChanged() {
    if (typeof onLayoutChange === 'function') {
      onLayoutChange(serializeLayout());
    }
  }

  function getMeasurementTargetPoint(setupKey) {
    const points = state.geometry.testPoints;
    if (!Array.isArray(points) || !points.length) {
      return null;
    }
    if (setupKey === 'polarizationShift') {
      return points[Math.floor(points.length / 2)];
    }
    if (setupKey === 'testPointCoverage') {
      const index = Math.floor((state.animationTick / 45) % points.length);
      return points[index];
    }
    return points[0];
  }

  function renderMeasurementStateList() {
    if (!measurementStateList) return;
    measurementStateList.innerHTML = MEASUREMENT_SETUPS.map((setup) => `
      <article class="cp-measurement-state ${setup.key === state.activeMeasurementSetup ? 'is-active' : ''}">
        <button type="button" data-measurement-setup="${setup.key}" aria-pressed="${setup.key === state.activeMeasurementSetup}">
          <strong>${setup.title}</strong>
          <p class="field-hint">Measured: ${setup.measured}</p>
          <p class="field-hint">Where: ${setup.where}</p>
          <p class="field-hint">Why: ${setup.why}</p>
        </button>
      </article>
    `).join('');
  }

  function buildSegmentAssessment(index) {
    const assessment = state.assessmentData || {};
    const profileData = assessment.profileData || {};
    const conservativeScenario = profileData?.scenarios?.conservative || {};
    const conservativeDemand = Array.isArray(conservativeScenario.currentDemand) ? conservativeScenario.currentDemand : [];
    const conservativePotential = Array.isArray(conservativeScenario.potential) ? conservativeScenario.potential : [];
    const attenuationRows = Array.isArray(profileData.attenuation) ? profileData.attenuation : [];
    const thresholdBands = profileData.thresholdBands || {};
    const distributionSegments = Array.isArray(assessment.distributionModel?.segments) ? assessment.distributionModel.segments : [];
    const interferenceScore = toNumber(assessment.interferenceAssessment?.score, 0);
    const safetyMarginPercent = toNumber(assessment.safetyMarginPercent, 0);
    const safetyMarginYears = toNumber(assessment.safetyMarginYears, 0);
    const lowSafetyMargin = safetyMarginYears < 0 || safetyMarginPercent < 15;

    const attenuationValue = toNumber(attenuationRows[index]?.value ?? distributionSegments[index]?.attenuationFactor, 1);
    const demandRatio = toNumber(conservativeDemand[index]?.passMetricValue, 1);
    const potentialMv = toNumber(conservativePotential[index]?.value, toNumber(assessment.measuredInstantOffPotentialMv, -850));

    const attenuationLimit = toNumber(thresholdBands?.attenuation?.passWhenGreaterThanOrEqual, 0.75);
    const demandLimit = toNumber(thresholdBands?.currentDemandRatio?.passWhenLessThanOrEqual, 1);
    const potentialLimit = toNumber(thresholdBands?.potentialMv?.passWhenLessThanOrEqual, -850);

    const attenuationFail = attenuationValue < attenuationLimit;
    const demandFail = demandRatio > demandLimit;
    const potentialFail = potentialMv > potentialLimit;
    const failedCriteria = attenuationFail || demandFail || potentialFail;

    const attenuationRisk = clamp01((attenuationLimit + 0.18 - attenuationValue) / 0.33);
    const demandRisk = clamp01((demandRatio - 0.82) / 0.55);
    const potentialRisk = clamp01((potentialMv + 900) / 110);
    const interferenceRisk = clamp01(interferenceScore / 20);
    const safetyRisk = lowSafetyMargin ? clamp01((15 - Math.max(safetyMarginPercent, -25)) / 40) : 0;
    const segment = state.geometry.structureSegments[index];
    const segmentMid = segment
      ? { x: (segment.x1 + segment.x2) / 2, y: (segment.y1 + segment.y2) / 2 }
      : null;
    const nearestAnodeDistance = segmentMid && state.geometry.anodes.length
      ? state.geometry.anodes.reduce((minDistance, anode) => {
        const dx = anode.x - segmentMid.x;
        const dy = anode.y - segmentMid.y;
        const distance = Math.sqrt((dx ** 2) + (dy ** 2));
        return Math.min(minDistance, distance);
      }, Number.POSITIVE_INFINITY)
      : 0;
    const geometricCoverageRisk = nearestAnodeDistance
      ? clamp01((nearestAnodeDistance - 120) / 260)
      : 0;

    const rawSeverity = (demandRisk * 0.3)
      + (attenuationRisk * 0.26)
      + (potentialRisk * 0.2)
      + (interferenceRisk * 0.16)
      + (safetyRisk * 0.08)
      + (geometricCoverageRisk * 0.12)
      + (failedCriteria ? 0.08 : 0);
    const severityScore = clamp01(rawSeverity);
    const severityBand = severityScore >= HEATMAP_THRESHOLDS.high
      ? 'high'
      : (severityScore >= HEATMAP_THRESHOLDS.medium ? 'medium' : 'low');

    return {
      segmentIndex: index,
      severityScore,
      severityBand,
      failedCriteria,
      lowSafetyMargin,
      demandRatio: roundTo(demandRatio, 3),
      attenuationValue: roundTo(attenuationValue, 3),
      potentialMv: roundTo(potentialMv, 1),
      interferenceScore: roundTo(interferenceScore, 2),
      assumptions: {
        thresholdDemandRatio: demandLimit,
        thresholdAttenuation: attenuationLimit,
        thresholdPotentialMv: potentialLimit,
        targetLifeYears: assessment.targetLifeYears
      }
    };
  }

  function passesFilters(segmentAssessment) {
    if (!segmentAssessment) return false;
    if (state.heatmapFilters.highRiskOnly && segmentAssessment.severityBand !== 'high') {
      return false;
    }
    if (state.heatmapFilters.failedCriteriaOnly && !segmentAssessment.failedCriteria) {
      return false;
    }
    if (state.heatmapFilters.lowMarginOnly && !segmentAssessment.lowSafetyMargin) {
      return false;
    }
    return true;
  }

  function renderHotspotInspector(segmentAssessment) {
    if (!hotspotInspector) return;
    if (!segmentAssessment) {
      hotspotInspector.innerHTML = `
        <h3>Hotspot inspector</h3>
        <p class="field-hint">Click a hotspot on the layout canvas to inspect assumptions and contributing factors.</p>
      `;
      return;
    }
    hotspotInspector.innerHTML = `
      <h3>Hotspot inspector · Segment ${segmentAssessment.segmentIndex + 1}</h3>
      <p class="field-hint">Severity: <strong>${segmentAssessment.severityBand.toUpperCase()}</strong> (${segmentAssessment.severityScore.toFixed(2)}).</p>
      <ul>
        <li>Demand ratio: ${segmentAssessment.demandRatio} (limit ≤ ${segmentAssessment.assumptions.thresholdDemandRatio}).</li>
        <li>Attenuation factor: ${segmentAssessment.attenuationValue} (limit ≥ ${segmentAssessment.assumptions.thresholdAttenuation}).</li>
        <li>Estimated instant-off potential: ${segmentAssessment.potentialMv} mV (limit ≤ ${segmentAssessment.assumptions.thresholdPotentialMv} mV).</li>
        <li>Interference score contribution: ${segmentAssessment.interferenceScore} / 20.</li>
        <li>Safety margin status: ${segmentAssessment.lowSafetyMargin ? 'Low safety margin flagged.' : 'Safety margin within preferred range.'}</li>
      </ul>
      <p class="field-hint">Contributing factors are drawn from distribution attenuation, profile demand/potential traces, and saved CP criteria assumptions.</p>
    `;
  }

  function getElementBySelection(selection) {
    if (!selection || typeof selection !== 'object') return null;
    if (selection.kind === 'anode') {
      return state.geometry.anodes[selection.index] || null;
    }
    if (selection.kind === 'test-point') {
      return state.geometry.testPoints[selection.index] || null;
    }
    if (selection.kind === 'reference') {
      return selection.index === 0 ? state.geometry.referenceElectrode : null;
    }
    if (selection.kind === 'segment') {
      return state.geometry.structureSegments[selection.index] || null;
    }
    return null;
  }

  function renderPropertiesPanel() {
    if (!propertiesPanelContent) return;
    const selected = state.selectedElement;
    const selectedItem = getElementBySelection(selected);
    if (!selected || !selectedItem) {
      propertiesPanelContent.innerHTML = `
        <p class="field-hint">No element selected.</p>
        <p class="field-hint">Double click an anode, test point, structure segment, or the reference electrode to edit properties.</p>
      `;
      return;
    }
    const titleByKind = {
      anode: 'Anode',
      'test-point': 'Test point',
      reference: 'Reference electrode',
      segment: 'Structure segment'
    };
    const title = titleByKind[selected.kind] || 'Element';
    const indexLabel = selected.kind === 'reference' ? '' : ` ${selected.index + 1}`;
    const fields = selected.kind === 'segment'
      ? `
          <label>X1 <input type="number" step="1" data-cp-prop-key="x1" value="${roundTo(selectedItem.x1, 2)}"></label>
          <label>Y1 <input type="number" step="1" data-cp-prop-key="y1" value="${roundTo(selectedItem.y1, 2)}"></label>
          <label>X2 <input type="number" step="1" data-cp-prop-key="x2" value="${roundTo(selectedItem.x2, 2)}"></label>
          <label>Y2 <input type="number" step="1" data-cp-prop-key="y2" value="${roundTo(selectedItem.y2, 2)}"></label>
          <label>Label <input type="text" data-cp-prop-key="label" value="${selectedItem.label || ''}"></label>
        `
      : `
          <label>X <input type="number" step="1" data-cp-prop-key="x" value="${roundTo(selectedItem.x, 2)}"></label>
          <label>Y <input type="number" step="1" data-cp-prop-key="y" value="${roundTo(selectedItem.y, 2)}"></label>
          <label>Label <input type="text" data-cp-prop-key="label" value="${selectedItem.label || ''}" ${selected.kind === 'reference' ? 'disabled' : ''}></label>
        `;
    propertiesPanelContent.innerHTML = `
      <h4>${title}${indexLabel}</h4>
      <form class="cp-properties-form" id="cp-properties-form">
        ${fields}
      </form>
      <p class="field-hint">Changes are applied immediately and persisted with the layout.</p>
    `;
  }

  function render() {
    const { structureSegments, anodes, testPoints, referenceElectrode } = state.geometry;
    const { x, y, scale } = state.viewport;
    const bounds = getViewBounds(state.geometry);

    const structureVisible = state.layers[LAYERS.structure] ? '' : 'display="none"';
    const anodesVisible = state.layers[LAYERS.anodes] ? '' : 'display="none"';
    const wiringVisible = state.layers[LAYERS.wiring] ? '' : 'display="none"';
    const measurementVisible = state.layers[LAYERS.measurement] ? '' : 'display="none"';

    const activeSegmentIndex = Number.isInteger(state.externalHoveredSegmentIndex)
      ? state.externalHoveredSegmentIndex
      : state.hoveredSegmentIndex;
    const selectedSegmentAssessment = Number.isInteger(state.selectedHotspotIndex)
      ? buildSegmentAssessment(state.selectedHotspotIndex)
      : null;
    const values = getInputValues();
    const displayDistanceUnit = values.isMetric ? 'm' : 'ft';
    const distanceScale = values.isMetric ? 1 : (1 / 0.3048);
    const gridMinorLines = [];
    const gridMajorLines = [];
    for (let xPos = 0; xPos <= bounds.width; xPos += GRID_MINOR_SPACING) {
      gridMinorLines.push(`<line x1="${xPos}" y1="0" x2="${xPos}" y2="${bounds.height}" class="cp-layout-grid-minor"></line>`);
    }
    for (let yPos = 0; yPos <= bounds.height; yPos += GRID_MINOR_SPACING) {
      gridMinorLines.push(`<line x1="0" y1="${yPos}" x2="${bounds.width}" y2="${yPos}" class="cp-layout-grid-minor"></line>`);
    }
    for (let xPos = 0; xPos <= bounds.width; xPos += GRID_MAJOR_SPACING) {
      const labelValue = roundTo((xPos / PX_PER_METER) * distanceScale, 0);
      gridMajorLines.push(`<line x1="${xPos}" y1="0" x2="${xPos}" y2="${bounds.height}" class="cp-layout-grid-major"></line>`);
      if (xPos > 0) {
        gridMajorLines.push(`<text x="${xPos + 4}" y="18" class="cp-layout-grid-label">${labelValue} ${displayDistanceUnit}</text>`);
      }
    }
    for (let yPos = 0; yPos <= bounds.height; yPos += GRID_MAJOR_SPACING) {
      gridMajorLines.push(`<line x1="0" y1="${yPos}" x2="${bounds.width}" y2="${yPos}" class="cp-layout-grid-major"></line>`);
    }
    const heatmapMarkup = state.heatmapEnabled
      ? structureSegments.map((segment, index) => {
        const segmentAssessment = buildSegmentAssessment(index);
        const visible = passesFilters(segmentAssessment);
        const severity = segmentAssessment.severityScore;
        const heatColor = getHeatColor(severity);
        const midX = (segment.x1 + segment.x2) / 2;
        const midY = (segment.y1 + segment.y2) / 2;
        const isSelected = state.selectedHotspotIndex === index;
        const mediumContour = severity >= HEATMAP_THRESHOLDS.medium
          ? `<line x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" class="cp-layout-heat-contour cp-layout-heat-contour--medium"></line>`
          : '';
        const highContour = severity >= HEATMAP_THRESHOLDS.high
          ? `<line x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" class="cp-layout-heat-contour cp-layout-heat-contour--high"></line>`
          : '';
        const zoneAria = `Hotspot segment ${index + 1}. Severity ${segmentAssessment.severityBand}, score ${segmentAssessment.severityScore.toFixed(2)}. Demand ratio ${segmentAssessment.demandRatio}.`;
        return `
          <g class="cp-layout-heat-zone-group ${isSelected ? 'is-selected' : ''}" ${visible ? '' : 'aria-hidden="true"'}>
            <line x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" class="cp-layout-heat-zone ${visible ? '' : 'is-filtered'} ${isSelected ? 'is-selected' : ''}" stroke="${heatColor}" stroke-width="22" data-segment-index="${index}"></line>
            ${visible ? mediumContour : ''}
            ${visible ? highContour : ''}
            <g class="cp-layout-hotspot ${isSelected ? 'is-selected' : ''}" data-hotspot-index="${index}" role="button" tabindex="0" aria-label="${zoneAria}">
              <circle cx="${midX}" cy="${midY - 24}" r="13" class="cp-layout-hotspot-marker"></circle>
              <text x="${midX}" y="${midY - 20}" text-anchor="middle" class="cp-layout-hotspot-text">S${index + 1}</text>
            </g>
          </g>
        `;
      }).join('')
      : '';
    const segmentMarkup = structureSegments.map((segment, index) => `
      <line
        x1="${segment.x1}"
        y1="${segment.y1}"
        x2="${segment.x2}"
        y2="${segment.y2}"
        class="cp-layout-structure-line ${activeSegmentIndex === index ? 'is-hovered' : ''}"
        data-segment-index="${index}"
      />
      <text x="${(segment.x1 + segment.x2) / 2}" y="${segment.y1 - 14}" class="cp-layout-segment-label" text-anchor="middle">${segment.label}</text>
    `).join('');

    const anodeMarkup = anodes.map((anode, index) => `
      <g class="cp-layout-anode" data-drag-kind="anode" data-index="${index}">
        <circle cx="${anode.x}" cy="${anode.y}" r="9" class="cp-layout-anode-node">
          <title>${anode.label}: anode bed position used for current distribution.</title>
        </circle>
        <text x="${anode.x}" y="${anode.y - 14}" text-anchor="middle" class="cp-layout-anode-label">${anode.label}</text>
      </g>
    `).join('');

    const wiringMarkup = anodes.map((anode) => `
      <line x1="${anode.x}" y1="${anode.y + 10}" x2="${anode.x}" y2="${structureSegments[0]?.y1 ?? 310}" class="cp-layout-wire"></line>
    `).join('');

    const measurementMarkup = testPoints.map((point, index) => `
      <g class="cp-layout-test-point" data-drag-kind="test-point" data-index="${index}">
        <rect x="${point.x - 7}" y="${point.y - 7}" width="14" height="14" rx="2" class="cp-layout-test-node">
          <title>${point.label}: test point for structure potential verification.</title>
        </rect>
        <text x="${point.x}" y="${point.y + 22}" text-anchor="middle" class="cp-layout-test-label">${point.label}</text>
      </g>
    `).join('');

    const firstTwoAnodes = anodes.length >= 2 ? { a: anodes[0], b: anodes[1] } : null;
    const spacingValue = firstTwoAnodes
      ? roundTo((Math.abs(firstTwoAnodes.b.x - firstTwoAnodes.a.x) / PX_PER_METER) * distanceScale, 2)
      : null;
    const spacingMarkup = firstTwoAnodes ? `
      <line x1="${firstTwoAnodes.a.x}" y1="${firstTwoAnodes.a.y - 24}" x2="${firstTwoAnodes.b.x}" y2="${firstTwoAnodes.b.y - 24}" class="cp-layout-dimension"></line>
      <text x="${(firstTwoAnodes.a.x + firstTwoAnodes.b.x) / 2}" y="${firstTwoAnodes.a.y - 34}" text-anchor="middle" class="cp-layout-dimension-label">Anode spacing ≈ ${spacingValue} ${displayDistanceUnit}</text>
    ` : '';

    const activeSetup = MEASUREMENT_SETUPS.find((setup) => setup.key === state.activeMeasurementSetup) || MEASUREMENT_SETUPS[0];
    const activeTargetPoint = getMeasurementTargetPoint(activeSetup.key);
    const measurementModeEnabled = state.viewMode === VIEW_MODES.measurement;
    const leadPulse = 8 + Math.abs(Math.sin(state.animationTick / 18)) * 10;
    const leadMarkup = measurementModeEnabled && activeTargetPoint ? `
      <line x1="${referenceElectrode.x}" y1="${referenceElectrode.y}" x2="${activeTargetPoint.x}" y2="${activeTargetPoint.y}" class="cp-layout-test-lead">
        <title>Animated test lead from reference electrode to active test point.</title>
      </line>
      <circle cx="${activeTargetPoint.x}" cy="${activeTargetPoint.y}" r="${leadPulse.toFixed(2)}" class="cp-layout-target-ring"></circle>
      <text x="${activeTargetPoint.x + 14}" y="${activeTargetPoint.y - 10}" class="cp-layout-focus-label">${activeSetup.title}</text>
    ` : '';

    canvas.innerHTML = `
      <svg viewBox="0 0 ${bounds.width} ${bounds.height}" preserveAspectRatio="none" aria-label="Cathodic protection layout canvas" role="img">
        <g transform="translate(${x} ${y}) scale(${scale})">
          <rect x="0" y="0" width="${bounds.width}" height="${bounds.height}" class="cp-layout-background"></rect>
          ${gridMinorLines.join('')}
          ${gridMajorLines.join('')}
          ${heatmapMarkup}
          <g ${structureVisible}>${segmentMarkup}</g>
          <g ${wiringVisible}>${wiringMarkup}${spacingMarkup}</g>
          <g ${anodesVisible}>${anodeMarkup}</g>
          <g ${measurementVisible}>
            ${measurementMarkup}
            <g class="cp-layout-reference-electrode" data-drag-kind="reference" data-index="0">
              <circle cx="${referenceElectrode.x}" cy="${referenceElectrode.y}" r="10" class="cp-layout-reference-node">
                <title>Reference electrode symbol used for potential measurements.</title>
              </circle>
              <text x="${referenceElectrode.x + 16}" y="${referenceElectrode.y + 4}" class="cp-layout-reference-label">Reference electrode</text>
            </g>
            ${leadMarkup}
          </g>
        </g>
      </svg>
    `;
    renderMeasurementStateList();
    renderHotspotInspector(selectedSegmentAssessment);
    renderPropertiesPanel();
  }

  function onPointerDown(event) {
    const hotspot = event.target.closest('[data-hotspot-index]');
    if (hotspot) {
      const hotspotIndex = Number.parseInt(hotspot.dataset.hotspotIndex || '-1', 10);
      if (Number.isInteger(hotspotIndex) && hotspotIndex >= 0) {
        state.selectedHotspotIndex = hotspotIndex;
        announce(`Hotspot selected: Segment ${hotspotIndex + 1}.`);
        render();
      }
      return;
    }
    const segment = event.target.closest('[data-segment-index]');
    if (segment) {
      const segmentIndex = Number.parseInt(segment.dataset.segmentIndex || '-1', 10);
      if (Number.isInteger(segmentIndex) && segmentIndex >= 0) {
        state.selectedHotspotIndex = segmentIndex;
        announce(`Segment selected: Segment ${segmentIndex + 1}.`);
        render();
      }
      return;
    }
    const target = event.target.closest('[data-drag-kind]');
    if (!target) {
      dragState.mode = 'pan';
      dragState.pointerId = event.pointerId;
      dragState.startX = event.clientX;
      dragState.startY = event.clientY;
      dragState.originX = state.viewport.x;
      dragState.originY = state.viewport.y;
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    dragState.mode = target.dataset.dragKind;
    dragState.pointerId = event.pointerId;
    dragState.itemIndex = Number.parseInt(target.dataset.index || '-1', 10);
    const world = worldFromClient(event.clientX, event.clientY);
    dragState.startX = world.x;
    dragState.startY = world.y;

    if (dragState.mode === 'anode') {
      const selected = state.geometry.anodes[dragState.itemIndex];
      dragState.originX = selected?.x ?? 0;
      dragState.originY = selected?.y ?? 0;
    } else if (dragState.mode === 'test-point') {
      const selected = state.geometry.testPoints[dragState.itemIndex];
      dragState.originX = selected?.x ?? 0;
      dragState.originY = selected?.y ?? 0;
    } else if (dragState.mode === 'reference') {
      dragState.originX = state.geometry.referenceElectrode.x;
      dragState.originY = state.geometry.referenceElectrode.y;
    }

    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (dragState.pointerId !== event.pointerId || !dragState.mode) {
      return;
    }

    if (dragState.mode === 'pan') {
      const bounds = getViewBounds(state.geometry);
      const dx = ((event.clientX - dragState.startX) / canvas.clientWidth) * bounds.width;
      const dy = ((event.clientY - dragState.startY) / canvas.clientHeight) * bounds.height;
      state.viewport.x = dragState.originX + dx;
      state.viewport.y = dragState.originY + dy;
      clampViewportToBounds();
      render();
      return;
    }

    const world = worldFromClient(event.clientX, event.clientY);
    const dx = world.x - dragState.startX;
    const dy = world.y - dragState.startY;

    if (dragState.mode === 'anode' && state.geometry.anodes[dragState.itemIndex]) {
      const bounds = getViewBounds(state.geometry);
      const nextX = clamp(dragState.originX + dx, 40, bounds.width - 40);
      const nextY = clamp(dragState.originY + dy, 70, bounds.height - 40);
      state.geometry.anodes[dragState.itemIndex].x = nextX;
      state.geometry.anodes[dragState.itemIndex].y = nextY;
      syncInputsFromGeometry();
      render();
      announce('Anode marker moved.');
    }

    if (dragState.mode === 'test-point' && state.geometry.testPoints[dragState.itemIndex]) {
      const bounds = getViewBounds(state.geometry);
      const nextX = clamp(dragState.originX + dx, 40, bounds.width - 40);
      state.geometry.testPoints[dragState.itemIndex].x = nextX;
      render();
      announce('Test point marker moved.');
    }

    if (dragState.mode === 'reference') {
      const bounds = getViewBounds(state.geometry);
      const nextX = clamp(dragState.originX + dx, 40, bounds.width - 40);
      const nextY = clamp(dragState.originY + dy, 40, bounds.height - 40);
      state.geometry.referenceElectrode = { x: nextX, y: nextY };
      syncInputsFromGeometry();
      render();
      announce('Reference electrode marker moved.');
    }
  }

  function onPointerUp(event) {
    if (dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.mode === 'anode' || dragState.mode === 'reference') {
      syncInputsFromGeometry();
    }

    notifyLayoutChanged();
    dragState.mode = null;
    dragState.pointerId = null;
    dragState.itemIndex = -1;
    canvas.releasePointerCapture(event.pointerId);
  }

  function selectElementFromTarget(target) {
    const dragTarget = target.closest('[data-drag-kind]');
    if (dragTarget) {
      const kind = dragTarget.dataset.dragKind;
      const index = Number.parseInt(dragTarget.dataset.index || '-1', 10);
      if (kind === 'reference') {
        state.selectedElement = { kind: 'reference', index: 0 };
        return true;
      }
      if (Number.isInteger(index) && index >= 0) {
        state.selectedElement = { kind, index };
        return true;
      }
    }
    const segment = target.closest('[data-segment-index]');
    if (segment) {
      const index = Number.parseInt(segment.dataset.segmentIndex || '-1', 10);
      if (Number.isInteger(index) && index >= 0) {
        state.selectedElement = { kind: 'segment', index };
        state.selectedHotspotIndex = index;
        return true;
      }
    }
    const hotspot = target.closest('[data-hotspot-index]');
    if (hotspot) {
      const index = Number.parseInt(hotspot.dataset.hotspotIndex || '-1', 10);
      if (Number.isInteger(index) && index >= 0) {
        state.selectedElement = { kind: 'segment', index };
        state.selectedHotspotIndex = index;
        return true;
      }
    }
    return false;
  }

  function onCanvasHover(event) {
    const segmentEl = event.target.closest('[data-segment-index]');
    const nextIndex = segmentEl ? Number.parseInt(segmentEl.dataset.segmentIndex || '-1', 10) : null;
    const normalizedIndex = Number.isInteger(nextIndex) && nextIndex >= 0 ? nextIndex : null;
    if (state.hoveredSegmentIndex === normalizedIndex) {
      return;
    }
    state.hoveredSegmentIndex = normalizedIndex;
    if (typeof onSegmentHover === 'function') {
      onSegmentHover(normalizedIndex);
    }
    render();
  }

  function setZoom(nextScale) {
    const bounds = getViewBounds(state.geometry);
    const previousScale = state.viewport.scale;
    const normalizedScale = clamp(nextScale, 0.5, 4);
    if (Math.abs(normalizedScale - previousScale) < 0.0001) {
      return;
    }
    const focalX = bounds.width / 2;
    const focalY = bounds.height / 2;
    const focalWorldX = (focalX - state.viewport.x) / previousScale;
    const focalWorldY = (focalY - state.viewport.y) / previousScale;
    state.viewport.scale = normalizedScale;
    state.viewport.x = focalX - (focalWorldX * normalizedScale);
    state.viewport.y = focalY - (focalWorldY * normalizedScale);
    clampViewportToBounds();
    render();
    notifyLayoutChanged();
  }

  function clampViewportToBounds() {
    const bounds = getViewBounds(state.geometry);
    const minX = Math.min(0, bounds.width * (1 - state.viewport.scale));
    const minY = Math.min(0, bounds.height * (1 - state.viewport.scale));
    state.viewport.x = clamp(state.viewport.x, minX, 0);
    state.viewport.y = clamp(state.viewport.y, minY, 0);
  }

  function setLayerVisibility(layer, visible) {
    if (layer === 'heatmap') {
      state.heatmapEnabled = visible;
    } else {
      state.layers[layer] = visible;
    }
    render();
    notifyLayoutChanged();
  }

  function resetLayout() {
    state.viewport = { scale: 1, x: 0, y: 0 };
    buildGeometryFromInputs();
    clampViewportToBounds();
    render();
    announce('Layout reset to current form values.');
    notifyLayoutChanged();
  }

  function setViewMode(nextMode) {
    state.viewMode = nextMode === VIEW_MODES.measurement ? VIEW_MODES.measurement : VIEW_MODES.design;
    modeButtons.forEach((button) => {
      const isActive = button.dataset.cpMode === state.viewMode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    if (measurementPanel) {
      measurementPanel.hidden = state.viewMode !== VIEW_MODES.measurement;
    }
    render();
    notifyLayoutChanged();
  }

  function setMeasurementSetup(setupKey, options = {}) {
    if (!MEASUREMENT_SETUPS.some((setup) => setup.key === setupKey)) {
      return;
    }
    state.activeMeasurementSetup = setupKey;
    if (options.forceMeasurementView) {
      setViewMode(VIEW_MODES.measurement);
    } else {
      render();
      notifyLayoutChanged();
    }
  }

  function syncFromInputs() {
    const existing = serializeLayout();
    buildGeometryFromInputs();

    if (existing.geometry.anodes.length === state.geometry.anodes.length) {
      state.geometry.anodes = existing.geometry.anodes;
    }
    if (existing.geometry.testPoints.length === state.geometry.testPoints.length) {
      state.geometry.testPoints = existing.geometry.testPoints;
    }
    if (existing.geometry.referenceElectrode) {
      state.geometry.referenceElectrode = existing.geometry.referenceElectrode;
    }

    clampViewportToBounds();
    render();
    notifyLayoutChanged();
  }

  function setAssessmentData(nextAssessment) {
    state.assessmentData = nextAssessment && typeof nextAssessment === 'object' ? nextAssessment : null;
    const hasSegments = Array.isArray(state.geometry.structureSegments) && state.geometry.structureSegments.length > 0;
    if (hasSegments && Number.isInteger(state.selectedHotspotIndex)) {
      state.selectedHotspotIndex = clamp(state.selectedHotspotIndex, 0, state.geometry.structureSegments.length - 1);
    } else if (!Number.isInteger(state.selectedHotspotIndex)) {
      state.selectedHotspotIndex = 0;
    }
    render();
  }

  buildGeometryFromInputs();
  applyPersistedLayout(initialLayout);
  clampViewportToBounds();
  setViewMode(state.viewMode);
  render();

  function animateMeasurement() {
    state.animationTick += 1;
    if (state.viewMode === VIEW_MODES.measurement) {
      render();
    }
    animationFrameId = window.requestAnimationFrame(animateMeasurement);
  }
  animationFrameId = window.requestAnimationFrame(animateMeasurement);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('mousemove', onCanvasHover);
  canvas.addEventListener('dblclick', (event) => {
    if (!selectElementFromTarget(event.target)) {
      return;
    }
    render();
    announce('Element selected for property editing.');
  });
  canvas.addEventListener('mouseleave', () => {
    if (state.hoveredSegmentIndex === null) {
      return;
    }
    state.hoveredSegmentIndex = null;
    if (typeof onSegmentHover === 'function') {
      onSegmentHover(null);
    }
    render();
  });

  resetButton?.addEventListener('click', resetLayout);
  zoomInButton?.addEventListener('click', () => setZoom(state.viewport.scale + 0.15));
  zoomOutButton?.addEventListener('click', () => setZoom(state.viewport.scale - 0.15));
  fitButton?.addEventListener('click', () => {
    state.viewport = { scale: 1, x: 0, y: 0 };
    clampViewportToBounds();
    render();
    notifyLayoutChanged();
  });

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setViewMode(button.dataset.cpMode);
      announce(state.viewMode === VIEW_MODES.measurement ? 'Measurement view enabled.' : 'Design view enabled.');
    });
  });

  measurementStateList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-measurement-setup]');
    if (!button) {
      return;
    }
    setMeasurementSetup(button.dataset.measurementSetup);
    announce(`Measurement setup focused: ${button.textContent.trim()}.`);
  });

  Object.entries(layerToggles).forEach(([layer, checkbox]) => {
    if (!checkbox) return;
    checkbox.checked = layer === 'heatmap' ? Boolean(state.heatmapEnabled) : Boolean(state.layers[layer]);
    checkbox.addEventListener('change', () => {
      setLayerVisibility(layer, checkbox.checked);
    });
  });

  Object.entries(heatmapFilters).forEach(([filterKey, checkbox]) => {
    if (!checkbox) return;
    checkbox.checked = Boolean(state.heatmapFilters[filterKey]);
    checkbox.addEventListener('change', () => {
      state.heatmapFilters[filterKey] = checkbox.checked;
      render();
      announce('Heatmap filter updated.');
    });
  });

  canvas.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const hotspot = event.target.closest('[data-hotspot-index]');
    if (!hotspot) {
      return;
    }
    event.preventDefault();
    const hotspotIndex = Number.parseInt(hotspot.dataset.hotspotIndex || '-1', 10);
    if (!Number.isInteger(hotspotIndex) || hotspotIndex < 0) {
      return;
    }
    state.selectedHotspotIndex = hotspotIndex;
    render();
    announce(`Hotspot selected: Segment ${hotspotIndex + 1}.`);
  });

  propertiesPanelContent?.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const key = input.dataset.cpPropKey;
    if (!key || !state.selectedElement) {
      return;
    }
    const selected = getElementBySelection(state.selectedElement);
    if (!selected) {
      return;
    }

    if (key === 'label') {
      selected.label = input.value;
    } else {
      const parsed = Number.parseFloat(input.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      selected[key] = parsed;
    }

    if (state.selectedElement.kind === 'anode' || state.selectedElement.kind === 'reference') {
      syncInputsFromGeometry();
    }
    clampViewportToBounds();
    render();
    notifyLayoutChanged();
  });

  return {
    syncFromInputs,
    resetLayout,
    getState: serializeLayout,
    setAssessmentData,
    setExternalHoverSegment: (segmentIndex) => {
      const normalizedIndex = Number.isInteger(segmentIndex) && segmentIndex >= 0 ? segmentIndex : null;
      if (state.externalHoveredSegmentIndex === normalizedIndex) {
        return;
      }
      state.externalHoveredSegmentIndex = normalizedIndex;
      render();
    },
    setMeasurementSetup: (setupKey) => setMeasurementSetup(setupKey, { forceMeasurementView: true }),
    destroy: () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    }
  };
}
