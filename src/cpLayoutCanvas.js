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

  const layerToggles = {
    [LAYERS.structure]: panel.querySelector('#cp-layer-structure'),
    [LAYERS.anodes]: panel.querySelector('#cp-layer-anodes'),
    [LAYERS.wiring]: panel.querySelector('#cp-layer-wiring'),
    [LAYERS.measurement]: panel.querySelector('#cp-layer-measurement')
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
    externalHoveredSegmentIndex: null
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
    return form.querySelector(`#${id}`);
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
    const pxPerMeter = 11;
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
    const rect = canvas.getBoundingClientRect();
    const localX = ((clientX - rect.left) / rect.width) * DEFAULT_VIEW.width;
    const localY = ((clientY - rect.top) / rect.height) * DEFAULT_VIEW.height;
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

  function render() {
    const { structureSegments, anodes, testPoints, referenceElectrode } = state.geometry;
    const { x, y, scale } = state.viewport;

    const structureVisible = state.layers[LAYERS.structure] ? '' : 'display="none"';
    const anodesVisible = state.layers[LAYERS.anodes] ? '' : 'display="none"';
    const wiringVisible = state.layers[LAYERS.wiring] ? '' : 'display="none"';
    const measurementVisible = state.layers[LAYERS.measurement] ? '' : 'display="none"';

    const activeSegmentIndex = Number.isInteger(state.externalHoveredSegmentIndex)
      ? state.externalHoveredSegmentIndex
      : state.hoveredSegmentIndex;
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
    const spacingMarkup = firstTwoAnodes ? `
      <line x1="${firstTwoAnodes.a.x}" y1="${firstTwoAnodes.a.y - 24}" x2="${firstTwoAnodes.b.x}" y2="${firstTwoAnodes.b.y - 24}" class="cp-layout-dimension"></line>
      <text x="${(firstTwoAnodes.a.x + firstTwoAnodes.b.x) / 2}" y="${firstTwoAnodes.a.y - 34}" text-anchor="middle" class="cp-layout-dimension-label">Anode spacing</text>
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
      <svg viewBox="0 0 ${DEFAULT_VIEW.width} ${DEFAULT_VIEW.height}" aria-label="Cathodic protection layout canvas" role="img">
        <g transform="translate(${x} ${y}) scale(${scale})">
          <rect x="0" y="0" width="${DEFAULT_VIEW.width}" height="${DEFAULT_VIEW.height}" class="cp-layout-background"></rect>
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
  }

  function onPointerDown(event) {
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
      const dx = ((event.clientX - dragState.startX) / canvas.clientWidth) * DEFAULT_VIEW.width;
      const dy = ((event.clientY - dragState.startY) / canvas.clientHeight) * DEFAULT_VIEW.height;
      state.viewport.x = dragState.originX + dx;
      state.viewport.y = dragState.originY + dy;
      render();
      return;
    }

    const world = worldFromClient(event.clientX, event.clientY);
    const dx = world.x - dragState.startX;
    const dy = world.y - dragState.startY;

    if (dragState.mode === 'anode' && state.geometry.anodes[dragState.itemIndex]) {
      const nextX = clamp(dragState.originX + dx, 40, DEFAULT_VIEW.width - 40);
      const nextY = clamp(dragState.originY + dy, 70, DEFAULT_VIEW.height - 40);
      state.geometry.anodes[dragState.itemIndex].x = nextX;
      state.geometry.anodes[dragState.itemIndex].y = nextY;
      render();
      announce('Anode marker moved.');
    }

    if (dragState.mode === 'test-point' && state.geometry.testPoints[dragState.itemIndex]) {
      const nextX = clamp(dragState.originX + dx, 40, DEFAULT_VIEW.width - 40);
      state.geometry.testPoints[dragState.itemIndex].x = nextX;
      render();
      announce('Test point marker moved.');
    }

    if (dragState.mode === 'reference') {
      const nextX = clamp(dragState.originX + dx, 40, DEFAULT_VIEW.width - 40);
      const nextY = clamp(dragState.originY + dy, 40, DEFAULT_VIEW.height - 40);
      state.geometry.referenceElectrode = { x: nextX, y: nextY };
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
    state.viewport.scale = clamp(nextScale, 0.5, 2.5);
    render();
    notifyLayoutChanged();
  }

  function setLayerVisibility(layer, visible) {
    state.layers[layer] = visible;
    render();
    notifyLayoutChanged();
  }

  function resetLayout() {
    state.viewport = { scale: 1, x: 0, y: 0 };
    buildGeometryFromInputs();
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

    render();
    notifyLayoutChanged();
  }

  buildGeometryFromInputs();
  applyPersistedLayout(initialLayout);
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
    checkbox.checked = Boolean(state.layers[layer]);
    checkbox.addEventListener('change', () => {
      setLayerVisibility(layer, checkbox.checked);
    });
  });

  return {
    syncFromInputs,
    resetLayout,
    getState: serializeLayout,
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
