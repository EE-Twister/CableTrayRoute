import { buildCableProcurementSchedule } from './analysis/spoolSheets.mjs';
import {
  buildSpoolSheetVisualModel,
  summarizeSpoolImpact,
} from './analysis/spoolSheetVisualModel.mjs';
import { getTrays, getCables, on } from './dataStore.mjs';
import { showAlertModal } from './src/components/modal.js';

const SVG_WIDTH = 860;
const SVG_HEIGHT = 430;
const PREVIEW_DEBOUNCE_MS = 120;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const VIEW_MIN_ZOOM = 0.65;
const VIEW_MAX_ZOOM = 3;
const VIEW_ZOOM_FACTOR = 1.18;
const VIEW_KEY_PAN_PX = 28;
const VIEW_ROTATION_STEP_DEG = 90;
const VIEW_ORBIT_DEG_PER_PX = 0.45;
const SVG_MIME = 'image/svg+xml;charset=utf-8';
const PNG_MIME = 'image/png';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const sectionLenInput = document.getElementById('sectionLength');
  const gridCellInput   = document.getElementById('gridCell');
  const elevBandInput   = document.getElementById('elevBand');
  const maxSegsInput    = document.getElementById('maxSegs');
  const splicePlatePairsInput = document.getElementById('splicePlatePairsPerJoint');
  const clampKitsInput   = document.getElementById('clampKitsPerSupport');
  const groundJumpersInput = document.getElementById('groundJumpersPerJoint');
  const expansionFittingInput = document.getElementById('expansionFittingIntervalFt');
  const fieldCutAllowanceInput = document.getElementById('fieldCutAllowancePct');
  const spareHardwareInput = document.getElementById('spareHardwarePct');
  const maxShippingLengthInput = document.getElementById('maxShippingLengthFt');
  const maxHandlingWeightInput = document.getElementById('maxHandlingWeightLb');
  const generateBtn     = document.getElementById('generateBtn');
  const exportXlsxBtn   = document.getElementById('exportXlsxBtn');
  const exportSvgBtn    = document.getElementById('exportSvgBtn');
  const exportPngBtn    = document.getElementById('exportPngBtn');
  const printBtn        = document.getElementById('printBtn');
  const resultsDiv      = document.getElementById('results');

  const previewStatus   = document.getElementById('spoolPreviewStatus');
  const kpiGrid         = document.getElementById('spoolKpis');
  const visualCanvas    = document.getElementById('spoolVisualCanvas');
  const inspector       = document.getElementById('spoolInspector');
  const impactPanel     = document.getElementById('spoolImpact');
  const constraintSummary = document.getElementById('spoolConstraintSummary');
  const bandSummary     = document.getElementById('spoolBandSummary');
  const fabricationPackage = document.getElementById('spoolFabricationPackage');
  const zoomOutBtn      = document.getElementById('spoolZoomOutBtn');
  const zoomInBtn       = document.getElementById('spoolZoomInBtn');
  const rotateLeftBtn   = document.getElementById('spoolRotateLeftBtn');
  const rotateRightBtn  = document.getElementById('spoolRotateRightBtn');
  const orbitBtn        = document.getElementById('spoolOrbitBtn');
  const fitViewBtn      = document.getElementById('spoolFitViewBtn');
  const isolateBtn      = document.getElementById('spoolIsolateBtn');
  const viewHomeBtn     = document.getElementById('spoolViewHomeBtn');
  const viewPlanBtn     = document.getElementById('spoolViewPlanBtn');
  const viewFrontBtn    = document.getElementById('spoolViewFrontBtn');
  const viewRightBtn    = document.getElementById('spoolViewRightBtn');
  const viewSelectedBtn = document.getElementById('spoolViewSelectedBtn');
  const zoomLevel       = document.getElementById('spoolZoomLevel');
  const rotationLevel   = document.getElementById('spoolRotationLevel');

  const sectionLenValue = document.getElementById('sectionLengthValue');
  const gridCellValue   = document.getElementById('gridCellValue');
  const elevBandValue   = document.getElementById('elevBandValue');
  const maxSegsValue    = document.getElementById('maxSegsValue');
  const splicePlatePairsValue = document.getElementById('splicePlatePairsPerJointValue');
  const clampKitsValue  = document.getElementById('clampKitsPerSupportValue');
  const groundJumpersValue = document.getElementById('groundJumpersPerJointValue');
  const expansionFittingValue = document.getElementById('expansionFittingIntervalFtValue');
  const fieldCutAllowanceValue = document.getElementById('fieldCutAllowancePctValue');
  const spareHardwareValue = document.getElementById('spareHardwarePctValue');
  const maxShippingLengthValue = document.getElementById('maxShippingLengthFtValue');
  const maxHandlingWeightValue = document.getElementById('maxHandlingWeightLbValue');

  let currentPreviewModel = null;
  let lastResult = null;
  let committedSummary = null;
  let previousPreviewSummary = null;
  let selectedSpoolId = '';
  let previewTimer = null;
  const viewState = {
    zoom: 1,
    rotationDeg: 0,
    panX: 0,
    panY: 0,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    dragStartX: 0,
    dragStartY: 0,
    dragMode: 'pan',
    orbitMode: false,
    orbitCenterX: 0,
    orbitCenterY: 0,
    orbitStartAngleDeg: 0,
    orbitStartRotationDeg: 0,
    orbitAnchor: null,
    orbitUseLinearDrag: false,
    dragged: false,
    suppressClick: false,
    isolateSelected: false,
    activePreset: 'home',
  };

  const previewInputs = [
    sectionLenInput,
    gridCellInput,
    elevBandInput,
    maxSegsInput,
    splicePlatePairsInput,
    clampKitsInput,
    groundJumpersInput,
    expansionFittingInput,
    fieldCutAllowanceInput,
    spareHardwareInput,
    maxShippingLengthInput,
    maxHandlingWeightInput,
  ].filter(Boolean);

  previewInputs.forEach(input => {
    input.addEventListener('input', () => schedulePreviewUpdate({ markOutputPending: true }));
    input.addEventListener('change', () => schedulePreviewUpdate({ markOutputPending: true }));
  });

  on('traySchedule', () => schedulePreviewUpdate({ markOutputPending: true }));
  on('cableSchedule', () => schedulePreviewUpdate({ markOutputPending: true }));

  zoomOutBtn.addEventListener('click', () => zoomView(1 / VIEW_ZOOM_FACTOR));
  zoomInBtn.addEventListener('click', () => zoomView(VIEW_ZOOM_FACTOR));
  rotateLeftBtn.addEventListener('click', () => rotateView(-VIEW_ROTATION_STEP_DEG));
  rotateRightBtn.addEventListener('click', () => rotateView(VIEW_ROTATION_STEP_DEG));
  orbitBtn.addEventListener('click', () => {
    viewState.orbitMode = !viewState.orbitMode;
    viewState.activePreset = 'custom';
    applyViewNavigation();
  });
  fitViewBtn.addEventListener('click', resetViewNavigation);
  isolateBtn.addEventListener('click', () => {
    viewState.isolateSelected = !viewState.isolateSelected;
    viewState.activePreset = 'custom';
    applyViewNavigation();
  });
  viewHomeBtn.addEventListener('click', () => applyViewPreset('home'));
  viewPlanBtn.addEventListener('click', () => applyViewPreset('plan'));
  viewFrontBtn.addEventListener('click', () => applyViewPreset('front'));
  viewRightBtn.addEventListener('click', () => applyViewPreset('right'));
  viewSelectedBtn.addEventListener('click', () => applyViewPreset('selected'));

  visualCanvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !hasNavigablePreview()) return;
    const rect = visualCanvas.getBoundingClientRect();
    viewState.pointerId = event.pointerId;
    viewState.lastX = event.clientX;
    viewState.lastY = event.clientY;
    viewState.dragStartX = event.clientX;
    viewState.dragStartY = event.clientY;
    viewState.dragMode = viewState.orbitMode ? 'orbit' : 'pan';
    if (viewState.dragMode === 'orbit') {
      viewState.orbitCenterX = rect.width / 2;
      viewState.orbitCenterY = rect.height / 2;
      viewState.orbitStartAngleDeg = pointerAngleDeg(event.clientX - rect.left, event.clientY - rect.top);
      viewState.orbitStartRotationDeg = viewState.rotationDeg;
      viewState.orbitAnchor = screenToViewPoint(viewState.orbitCenterX, viewState.orbitCenterY, viewState.zoom, viewState.rotationDeg);
      viewState.orbitUseLinearDrag = Math.hypot(
        event.clientX - rect.left - viewState.orbitCenterX,
        event.clientY - rect.top - viewState.orbitCenterY,
      ) < 28;
    }
    viewState.dragged = false;
    visualCanvas.classList.add(viewState.dragMode === 'orbit' ? 'is-orbiting' : 'is-panning');
    try {
      visualCanvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events used by tests may not have an active pointer capture target.
    }
  });

  visualCanvas.addEventListener('pointermove', event => {
    if (viewState.pointerId !== event.pointerId) return;
    const dx = event.clientX - viewState.lastX;
    const dy = event.clientY - viewState.lastY;
    viewState.lastX = event.clientX;
    viewState.lastY = event.clientY;
    if (viewState.dragMode === 'orbit') {
      orbitViewWithPointer(event);
    } else {
      viewState.panX += dx;
      viewState.panY += dy;
    }
    viewState.activePreset = 'custom';
    if (Math.hypot(event.clientX - viewState.dragStartX, event.clientY - viewState.dragStartY) > 4) {
      viewState.dragged = true;
    }
    applyViewNavigation();
  });

  visualCanvas.addEventListener('pointerup', endPointerNavigation);
  visualCanvas.addEventListener('pointercancel', endPointerNavigation);

  visualCanvas.addEventListener('wheel', event => {
    if (!hasNavigablePreview()) return;
    event.preventDefault();
    zoomView(event.deltaY < 0 ? VIEW_ZOOM_FACTOR : 1 / VIEW_ZOOM_FACTOR, event);
  }, { passive: false });

  visualCanvas.addEventListener('click', event => {
    if (viewState.suppressClick) {
      viewState.suppressClick = false;
      return;
    }
    const target = event.target.closest('[data-spool-id]');
    if (!target) return;
    selectSpool(target.getAttribute('data-spool-id'));
  });

  visualCanvas.addEventListener('keydown', event => {
    if (handleViewNavigationKey(event)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest('[data-spool-id]');
    if (!target) return;
    event.preventDefault();
    selectSpool(target.getAttribute('data-spool-id'));
  });

  resultsDiv.addEventListener('click', event => {
    const row = event.target.closest('[data-spool-row]');
    if (!row) return;
    selectSpool(row.getAttribute('data-spool-row'));
  });

  resultsDiv.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-spool-row]');
    if (!row) return;
    event.preventDefault();
    selectSpool(row.getAttribute('data-spool-row'));
  });

  generateBtn.addEventListener('click', () => {
    const model = currentPreviewModel || buildCurrentPreviewModel();
    if (!model.hasTrayData) {
      showAlertModal('No Data', 'No trays found in the Raceway Schedule. Add trays with 3D coordinates first.');
      return;
    }
    if (readOptions().sectionLengthFt <= 0) {
      showAlertModal('Invalid Input', 'Section length must be a positive number.');
      return;
    }

    lastResult = {
      ...model.result,
      constraints: model.constraints,
      options: model.options,
    };
    committedSummary = { ...model.summary };
    renderResults(lastResult);
    exportXlsxBtn.disabled = lastResult.spools.length === 0;
    printBtn.disabled = lastResult.spools.length === 0;
    renderPreview(model);
  });

  exportXlsxBtn.addEventListener('click', () => {
    if (!lastResult) return;
    try {
      exportToXlsx(lastResult);
    } catch (err) {
      showXlsxExportError(err);
    }
  });

  exportSvgBtn.addEventListener('click', () => {
    try {
      exportCurrentSvg();
    } catch (err) {
      showVisualExportError(err);
    }
  });

  exportPngBtn.addEventListener('click', async () => {
    try {
      await exportCurrentPng();
    } catch (err) {
      showVisualExportError(err);
    }
  });

  printBtn.addEventListener('click', () => {
    window.print();
  });

  const tabSpools        = document.getElementById('tab-spools');
  const tabProcurement   = document.getElementById('tab-procurement');
  const panelSpools      = document.getElementById('panel-spools');
  const panelProcurement = document.getElementById('panel-procurement');

  function activateTab(activeTab) {
    const isSpools = activeTab === tabSpools;
    tabSpools.classList.toggle('active', isSpools);
    tabSpools.setAttribute('aria-selected', String(isSpools));
    tabProcurement.classList.toggle('active', !isSpools);
    tabProcurement.setAttribute('aria-selected', String(!isSpools));
    panelSpools.hidden = !isSpools;
    panelProcurement.hidden = isSpools;
  }

  tabSpools.addEventListener('click', () => activateTab(tabSpools));
  tabProcurement.addEventListener('click', () => activateTab(tabProcurement));

  function readOptions() {
    return {
      sectionLengthFt: inputNumber(sectionLenInput, 12),
      gridCellFt: inputNumber(gridCellInput, 20),
      elevBandFt: inputNumber(elevBandInput, 2),
      maxSpoolSegments: inputInteger(maxSegsInput, 10),
      splicePlatePairsPerJoint: inputNumber(splicePlatePairsInput, 1),
      clampKitsPerSupport: inputNumber(clampKitsInput, 2),
      groundJumpersPerJoint: inputNumber(groundJumpersInput, 1),
      expansionFittingIntervalFt: inputNumber(expansionFittingInput, 100),
      fieldCutAllowancePct: inputNumber(fieldCutAllowanceInput, 5),
      spareHardwarePct: inputNumber(spareHardwareInput, 10),
      maxShippingLengthFt: inputNumber(maxShippingLengthInput, 40),
      maxHandlingWeightLb: inputNumber(maxHandlingWeightInput, 250),
    };
  }

  function updateParameterValues(options) {
    sectionLenValue.textContent = `${formatNumber(options.sectionLengthFt)} ft`;
    gridCellValue.textContent = `${formatNumber(options.gridCellFt)} ft`;
    elevBandValue.textContent = `${formatNumber(options.elevBandFt)} ft`;
    maxSegsValue.textContent = `${formatNumber(options.maxSpoolSegments)} segments`;
    splicePlatePairsValue.textContent = formatNumber(options.splicePlatePairsPerJoint);
    clampKitsValue.textContent = formatNumber(options.clampKitsPerSupport);
    groundJumpersValue.textContent = formatNumber(options.groundJumpersPerJoint);
    expansionFittingValue.textContent = `${formatNumber(options.expansionFittingIntervalFt)} ft`;
    fieldCutAllowanceValue.textContent = `${formatNumber(options.fieldCutAllowancePct)}%`;
    spareHardwareValue.textContent = `${formatNumber(options.spareHardwarePct)}%`;
    maxShippingLengthValue.textContent = `${formatNumber(options.maxShippingLengthFt)} ft`;
    maxHandlingWeightValue.textContent = `${formatNumber(options.maxHandlingWeightLb)} lb`;
  }

  function inputNumber(input, fallback) {
    const number = Number(input?.value);
    return Number.isFinite(number) ? number : fallback;
  }

  function inputInteger(input, fallback) {
    const number = Number.parseInt(input?.value, 10);
    return Number.isInteger(number) ? number : fallback;
  }

  function buildCurrentPreviewModel() {
    const options = readOptions();
    updateParameterValues(options);
    return buildSpoolSheetVisualModel(getTrays(), getCables(), options);
  }

  function schedulePreviewUpdate({ markOutputPending = false } = {}) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const model = buildCurrentPreviewModel();
      if (markOutputPending && lastResult) {
        lastResult = null;
        exportXlsxBtn.disabled = true;
        printBtn.disabled = true;
        renderOutputPending(model);
      }
      renderPreview(model);
    }, PREVIEW_DEBOUNCE_MS);
  }

  function renderPreview(model) {
    currentPreviewModel = model;
    if (!model.spools.some(spool => spool.spoolId === selectedSpoolId)) {
      selectedSpoolId = model.spools[0]?.spoolId || '';
    }

    previewStatus.textContent = previewStatusText(model);
    kpiGrid.innerHTML = renderKpis(model);
    visualCanvas.innerHTML = renderSpoolSvg(model, selectedSpoolId);
    inspector.innerHTML = renderInspector(model, selectedSpoolId);
    constraintSummary.innerHTML = renderConstraintSummary(model);
    fabricationPackage.innerHTML = renderFabricationPackage(model, selectedSpoolId);
    impactPanel.innerHTML = renderImpactPanel(
      model,
      previousPreviewSummary ? summarizeSpoolImpact(previousPreviewSummary, model.summary) : null
    );
    bandSummary.innerHTML = renderBandSummary(model);
    applyViewNavigation();
    updateSpoolRowSelection();
    previousPreviewSummary = { ...model.summary };
  }

  function hasNavigablePreview() {
    return Boolean(visualCanvas.querySelector('.spool-visual-svg'));
  }

  function clampZoom(value) {
    return Math.min(VIEW_MAX_ZOOM, Math.max(VIEW_MIN_ZOOM, value));
  }

  function zoomView(factor, event = null) {
    if (!hasNavigablePreview()) return;
    const nextZoom = clampZoom(viewState.zoom * factor);
    if (Math.abs(nextZoom - viewState.zoom) < 0.001) return;
    const rect = visualCanvas.getBoundingClientRect();
    const originX = event ? event.clientX - rect.left : rect.width / 2;
    const originY = event ? event.clientY - rect.top : rect.height / 2;
    const anchor = screenToViewPoint(originX, originY, viewState.zoom, viewState.rotationDeg);
    viewState.zoom = nextZoom;
    anchorViewPoint(originX, originY, anchor, viewState.zoom, viewState.rotationDeg);
    viewState.activePreset = 'custom';
    applyViewNavigation();
  }

  function rotateView(deltaDeg) {
    if (!hasNavigablePreview()) return;
    const rect = visualCanvas.getBoundingClientRect();
    const originX = rect.width / 2;
    const originY = rect.height / 2;
    const anchor = screenToViewPoint(originX, originY, viewState.zoom, viewState.rotationDeg);
    viewState.rotationDeg = normalizeRotation(viewState.rotationDeg + deltaDeg);
    anchorViewPoint(originX, originY, anchor, viewState.zoom, viewState.rotationDeg);
    viewState.activePreset = 'custom';
    applyViewNavigation();
  }

  function resetViewNavigation() {
    viewState.zoom = 1;
    viewState.rotationDeg = 0;
    viewState.panX = 0;
    viewState.panY = 0;
    viewState.orbitMode = false;
    viewState.activePreset = 'home';
    applyViewNavigation();
  }

  function applyViewPreset(preset) {
    if (!hasNavigablePreview()) return;
    viewState.orbitMode = false;
    viewState.activePreset = preset;
    if (preset === 'home') {
      viewState.zoom = 1;
      viewState.rotationDeg = 0;
      viewState.panX = 0;
      viewState.panY = 0;
      viewState.isolateSelected = false;
      applyViewNavigation();
      return;
    }
    if (preset === 'selected') {
      focusSelectedSpool();
      applyViewNavigation();
      return;
    }
    const rotations = {
      plan: 0,
      front: 90,
      right: -90,
    };
    viewState.zoom = 1;
    viewState.rotationDeg = rotations[preset] ?? 0;
    viewState.panX = 0;
    viewState.panY = 0;
    viewState.isolateSelected = false;
    applyViewNavigation();
  }

  function focusSelectedSpool() {
    if (!selectedSpoolId) return;
    const marker = [...visualCanvas.querySelectorAll('.spool-visual-marker')]
      .find(element => element.getAttribute('data-spool-id') === selectedSpoolId);
    const circle = marker?.querySelector('circle');
    if (!circle) return;
    const point = {
      x: Number(circle.getAttribute('cx')) || SVG_WIDTH / 2,
      y: Number(circle.getAttribute('cy')) || SVG_HEIGHT / 2,
    };
    const rect = visualCanvas.getBoundingClientRect();
    viewState.zoom = Math.max(viewState.zoom, 1.45);
    viewState.isolateSelected = true;
    anchorViewPoint(rect.width / 2, rect.height / 2, point, viewState.zoom, viewState.rotationDeg);
  }

  function endPointerNavigation(event) {
    if (viewState.pointerId !== event.pointerId) return;
    try {
      visualCanvas.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore pointer-capture cleanup when the browser did not grant capture.
    }
    visualCanvas.classList.remove('is-panning');
    visualCanvas.classList.remove('is-orbiting');
    viewState.pointerId = null;
    viewState.dragMode = 'pan';
    viewState.orbitAnchor = null;
    if (viewState.dragged) {
      viewState.suppressClick = true;
      window.setTimeout(() => {
        viewState.suppressClick = false;
      }, 160);
    }
  }

  function handleViewNavigationKey(event) {
    if (!hasNavigablePreview()) return false;
    const pan = event.shiftKey ? VIEW_KEY_PAN_PX * 2 : VIEW_KEY_PAN_PX;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomView(VIEW_ZOOM_FACTOR);
      return true;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomView(1 / VIEW_ZOOM_FACTOR);
      return true;
    }
    if (event.key === '0') {
      event.preventDefault();
      resetViewNavigation();
      return true;
    }
    if (event.key === '[' || event.key === '{') {
      event.preventDefault();
      rotateView(-VIEW_ROTATION_STEP_DEG);
      return true;
    }
    if (event.key === ']' || event.key === '}') {
      event.preventDefault();
      rotateView(VIEW_ROTATION_STEP_DEG);
      return true;
    }
    if (event.key === 'o' || event.key === 'O') {
      event.preventDefault();
      viewState.orbitMode = !viewState.orbitMode;
      viewState.activePreset = 'custom';
      applyViewNavigation();
      return true;
    }
    if (event.key === 'i' || event.key === 'I') {
      event.preventDefault();
      viewState.isolateSelected = !viewState.isolateSelected;
      viewState.activePreset = 'custom';
      applyViewNavigation();
      return true;
    }
    const panKeys = {
      ArrowLeft: [pan, 0],
      ArrowRight: [-pan, 0],
      ArrowUp: [0, pan],
      ArrowDown: [0, -pan],
    };
    const delta = panKeys[event.key];
    if (!delta) return false;
    event.preventDefault();
    viewState.panX += delta[0];
    viewState.panY += delta[1];
    viewState.activePreset = 'custom';
    applyViewNavigation();
    return true;
  }

  function applyViewNavigation() {
    const svg = visualCanvas.querySelector('.spool-visual-svg');
    if (svg) {
      const matrix = viewTransformMatrix(viewState.zoom, viewState.rotationDeg);
      svg.style.transform = `matrix(${formatMatrixValue(matrix.a)}, ${formatMatrixValue(matrix.b)}, ${formatMatrixValue(matrix.c)}, ${formatMatrixValue(matrix.d)}, ${formatMatrixValue(viewState.panX)}, ${formatMatrixValue(viewState.panY)})`;
    }
    const hasPreview = hasNavigablePreview();
    visualCanvas.classList.toggle('is-isolating', viewState.isolateSelected && Boolean(selectedSpoolId));
    visualCanvas.classList.toggle('is-orbit-tool', viewState.orbitMode && hasPreview);
    isolateBtn.disabled = !selectedSpoolId || !hasPreview;
    isolateBtn.setAttribute('aria-pressed', String(viewState.isolateSelected && Boolean(selectedSpoolId)));
    zoomOutBtn.disabled = !hasPreview || viewState.zoom <= VIEW_MIN_ZOOM + 0.001;
    zoomInBtn.disabled = !hasPreview || viewState.zoom >= VIEW_MAX_ZOOM - 0.001;
    rotateLeftBtn.disabled = !hasPreview;
    rotateRightBtn.disabled = !hasPreview;
    orbitBtn.disabled = !hasPreview;
    orbitBtn.setAttribute('aria-pressed', String(viewState.orbitMode && hasPreview));
    fitViewBtn.disabled = !hasPreview;
    exportSvgBtn.disabled = !hasPreview;
    exportPngBtn.disabled = !hasPreview;
    viewHomeBtn.dataset.viewPreset = 'home';
    viewPlanBtn.dataset.viewPreset = 'plan';
    viewFrontBtn.dataset.viewPreset = 'front';
    viewRightBtn.dataset.viewPreset = 'right';
    viewSelectedBtn.dataset.viewPreset = 'selected';
    [viewHomeBtn, viewPlanBtn, viewFrontBtn, viewRightBtn, viewSelectedBtn].forEach(button => {
      button.disabled = !hasPreview;
      button.classList.toggle('is-active', hasPreview && button.dataset.viewPreset === viewState.activePreset);
    });
    viewSelectedBtn.disabled = !hasPreview || !selectedSpoolId;
    zoomLevel.textContent = `${Math.round(viewState.zoom * 100)}%`;
    rotationLevel.textContent = formatRotationLabel(viewState.rotationDeg);
  }

  function orbitViewWithPointer(event) {
    const rect = visualCanvas.getBoundingClientRect();
    let nextRotation;
    if (viewState.orbitUseLinearDrag) {
      nextRotation = viewState.orbitStartRotationDeg + (event.clientX - viewState.dragStartX) * VIEW_ORBIT_DEG_PER_PX;
    } else {
      const angle = pointerAngleDeg(event.clientX - rect.left, event.clientY - rect.top);
      nextRotation = viewState.orbitStartRotationDeg + shortestAngleDelta(viewState.orbitStartAngleDeg, angle);
    }
    viewState.rotationDeg = normalizeRotation(nextRotation);
    if (viewState.orbitAnchor) {
      anchorViewPoint(viewState.orbitCenterX, viewState.orbitCenterY, viewState.orbitAnchor, viewState.zoom, viewState.rotationDeg);
    }
  }

  function pointerAngleDeg(canvasX, canvasY) {
    return Math.atan2(canvasY - viewState.orbitCenterY, canvasX - viewState.orbitCenterX) * 180 / Math.PI;
  }

  function shortestAngleDelta(startDeg, endDeg) {
    let delta = endDeg - startDeg;
    while (delta > 180) delta -= 360;
    while (delta <= -180) delta += 360;
    return delta;
  }

  function viewTransformMatrix(zoom, rotationDeg) {
    const radians = rotationDeg * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      a: zoom * cos,
      b: zoom * sin,
      c: -zoom * sin,
      d: zoom * cos,
    };
  }

  function screenToViewPoint(screenX, screenY, zoom, rotationDeg) {
    const matrix = viewTransformMatrix(zoom, rotationDeg);
    const x = screenX - viewState.panX;
    const y = screenY - viewState.panY;
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    if (Math.abs(determinant) < 0.000001) return { x: 0, y: 0 };
    return {
      x: (matrix.d * x - matrix.c * y) / determinant,
      y: (-matrix.b * x + matrix.a * y) / determinant,
    };
  }

  function anchorViewPoint(screenX, screenY, point, zoom, rotationDeg) {
    const matrix = viewTransformMatrix(zoom, rotationDeg);
    viewState.panX = screenX - (matrix.a * point.x + matrix.c * point.y);
    viewState.panY = screenY - (matrix.b * point.x + matrix.d * point.y);
  }

  function normalizeRotation(degrees) {
    let normalized = degrees % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized <= -180) normalized += 360;
    return Object.is(normalized, -0) ? 0 : normalized;
  }

  function formatMatrixValue(value) {
    const rounded = Math.abs(value) < 0.000001 ? 0 : Number(value.toFixed(6));
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function formatRotationLabel(value) {
    const rounded = Math.abs(value) < 0.05 ? 0 : Number(value.toFixed(1));
    return `${Object.is(rounded, -0) ? 0 : rounded} deg`;
  }

  function previewStatusText(model) {
    if (!model.hasTrayData) return 'No tray data loaded';
    if (model.hasExactCoordinates) return `Exact coordinates for ${model.trayCount} tray segments`;
    if (model.hasCoordinates) return `${model.coordinateCount} of ${model.trayCount} tray segments drawn`;
    return 'Coordinate data missing';
  }

  function renderKpis(model) {
    const delta = committedSummary
      ? summarizeSpoolImpact(committedSummary, model.summary)
      : null;
    const metrics = [
      { key: 'spoolCount', label: 'Spools', value: model.summary.spoolCount },
      { key: 'totalTrays', label: 'Tray Segments', value: model.summary.totalTrays },
      { key: 'totalLengthFt', label: 'Run Length', value: model.summary.totalLengthFt, suffix: ' ft' },
      { key: 'totalSections', label: 'Straight Sections', value: model.summary.totalSections },
      { key: 'totalBrackets', label: 'Brackets', value: model.summary.totalBrackets },
      { key: 'totalSplicePlatePairs', label: 'Splice Pairs', value: model.summary.totalSplicePlatePairs },
      { key: 'totalClampKits', label: 'Clamp Kits', value: model.summary.totalClampKits },
      { key: 'totalEstimatedWeight', label: 'Tray Weight', value: model.summary.totalEstimatedWeight, suffix: ' lb' },
      { key: 'totalCableEntries', label: 'Cable Assignments', value: model.summary.totalCableEntries },
      { key: 'warningCount', label: 'Constraint Warnings', value: model.summary.warningCount },
    ];

    return metrics.map(metric => {
      const change = delta ? delta[metric.key] : 0;
      const deltaHtml = committedSummary && change
        ? `<span class="spool-kpi-delta ${change > 0 ? 'is-positive' : 'is-negative'}">${change > 0 ? '+' : ''}${formatNumber(change)}${metric.suffix || ''}</span>`
        : `<span class="spool-kpi-delta is-muted">${committedSummary ? 'no change' : 'preview'}</span>`;
      return `
        <article class="spool-kpi">
          <span class="spool-kpi-label">${esc(metric.label)}</span>
          <strong>${esc(formatNumber(metric.value))}${esc(metric.suffix || '')}</strong>
          ${deltaHtml}
        </article>`;
    }).join('');
  }

  function renderImpactPanel(model, previewDelta = null) {
    if (!model.hasTrayData) {
      return `
        <div class="spool-impact-empty">
          <strong>Add raceway trays to start a spool preview.</strong>
          <span>Tray coordinates from the Raceway Schedule drive the visual grouping.</span>
        </div>`;
    }

    const warnings = model.warnings.length
      ? `<ul class="spool-warning-list">${model.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>`
      : '';

    if (!committedSummary) {
      const changed = previewDelta && Object.values(previewDelta).some(value => Math.abs(Number(value) || 0) > 0.001);
      const previewDeltaHtml = changed
        ? `<dl class="spool-impact-deltas">
            ${impactRow('Spools', previewDelta.spoolCount)}
            ${impactRow('Sections', previewDelta.totalSections)}
            ${impactRow('Clamp kits', previewDelta.totalClampKits)}
            ${impactRow('Field allowance', previewDelta.totalFieldCutAllowanceFt, ' ft')}
          </dl>`
        : '';
      return `
        <div>
          <strong>Preview is live.</strong>
          <span>Generate the spool sheets to enable print and Excel export for the current settings.</span>
        </div>
        ${previewDeltaHtml}
        ${warnings}`;
    }

    const delta = summarizeSpoolImpact(committedSummary, model.summary);
    const changed = Object.values(delta).some(value => Math.abs(Number(value) || 0) > 0.001);
    if (!changed) {
      return `
        <div>
          <strong>Preview matches the generated output.</strong>
          <span>Print and Excel export reflect the current spool setup.</span>
        </div>
        ${warnings}`;
    }

    return `
      <div>
        <strong>Inputs changed since generation.</strong>
        <span>Regenerate to refresh the printable spool sheet output.</span>
      </div>
      <dl class="spool-impact-deltas">
        ${impactRow('Spools', delta.spoolCount)}
        ${impactRow('Straight sections', delta.totalSections)}
        ${impactRow('Brackets', delta.totalBrackets)}
        ${impactRow('Clamp kits', delta.totalClampKits)}
        ${impactRow('Tray weight', delta.totalEstimatedWeight, ' lb')}
      </dl>
      ${warnings}`;
  }

  function renderConstraintSummary(model) {
    if (!model.hasTrayData) {
      return '';
    }
    const warnings = model.constraints.filter(alert => alert.severity === 'warning');
    const notices = model.constraints.filter(alert => alert.severity !== 'warning');
    const statusClass = warnings.length ? 'has-warnings' : 'is-clear';
    const statusText = warnings.length
      ? `${warnings.length} constraint warning${warnings.length === 1 ? '' : 's'}`
      : 'No shipping or handling warnings';
    const items = [...warnings, ...notices].slice(0, 5).map(alert => `
      <li class="spool-constraint-item is-${attr(alert.severity)}">
        <strong>${esc(alert.title)}${alert.spoolId ? ` - ${esc(alert.spoolId)}` : ''}</strong>
        <span>${esc(alert.message)}</span>
      </li>`).join('');
    return `
      <section class="spool-constraint-card ${statusClass}" aria-label="Spool fabrication constraints">
        <div>
          <strong>${esc(statusText)}</strong>
          <span>${esc(formatNumber(model.options.maxShippingLengthFt))} ft shipping target / ${esc(formatNumber(model.options.maxHandlingWeightLb))} lb handling target</span>
        </div>
        ${items ? `<ul>${items}</ul>` : ''}
      </section>`;
  }

  function impactRow(label, value, suffix = '') {
    const className = value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : 'is-muted';
    return `<div><dt>${esc(label)}</dt><dd class="${className}">${value > 0 ? '+' : ''}${esc(formatNumber(value))}${esc(suffix)}</dd></div>`;
  }

  function renderBandSummary(model) {
    if (!model.hasTrayData) {
      return '<p class="field-hint">No grouping bands are available until tray data is loaded.</p>';
    }

    const cells = model.gridCells.map(cell => `
      <span class="spool-band-chip ${cell.spoolIds.includes(selectedSpoolId) ? 'is-selected' : ''}">
        Cell ${esc(cell.gridX)},${esc(cell.gridY)} - ${esc(cell.trayCount)} tray${cell.trayCount === 1 ? '' : 's'}
      </span>`).join('');
    const bands = model.elevationBands.map(band => `
      <span class="spool-band-chip ${band.spoolIds.includes(selectedSpoolId) ? 'is-selected' : ''}">
        ${esc(band.label)} - ${esc(band.trayCount)} tray${band.trayCount === 1 ? '' : 's'}
      </span>`).join('');

    return `
      <div>
        <h3>Plan Grid Cells</h3>
        <div class="spool-band-chip-row">${cells || '<span class="field-hint">No drawable grid cells.</span>'}</div>
      </div>
      <div>
        <h3>Elevation Bands</h3>
        <div class="spool-band-chip-row">${bands || '<span class="field-hint">No elevation bands.</span>'}</div>
      </div>`;
  }

  function renderFabricationPackage(model, spoolId) {
    const spool = model.spools.find(item => item.spoolId === spoolId);
    if (!spool) {
      return '';
    }
    const hardwareRows = renderHardwareRows(spool.hardware?.items || []);
    const selectedAlerts = model.constraints
      .filter(alert => alert.spoolId === spool.spoolId)
      .map(alert => `<li class="is-${attr(alert.severity)}">${esc(alert.message)}</li>`)
      .join('');
    const cutList = spool.sections.map(section =>
      `${section.index}: ${formatNumber(section.lengthFt)} ft${section.isRemainder ? ' field-fit' : ''}`
    ).join(', ');

    return `
      <section class="spool-shop-package" aria-label="Selected spool shop package">
        <div class="spool-shop-header">
          <div>
            <h3>Shop Package - ${esc(spool.spoolId)}</h3>
            <p>${esc(spool.trayCount)} tray segment${spool.trayCount === 1 ? '' : 's'} / ${esc(formatNumber(spool.hardware?.materialLengthWithAllowanceFt || spool.totalLengthFt))} ft material with allowance</p>
          </div>
          <div class="spool-shop-label" aria-label="Shop label">${esc(spool.spoolId)}</div>
        </div>
        <div class="spool-shop-grid">
          <div>
            <h4>Fabrication Sequence</h4>
            <ol class="spool-shop-sequence">
              <li>Pull tray IDs: ${esc(spool.trayIds.join(', '))}</li>
              <li>Cut straight sections: ${esc(cutList || 'No sections calculated')}</li>
              <li>Stage hardware BOM and field-cut allowance.</li>
              <li>Attach cable assignment list before release to install.</li>
            </ol>
            ${selectedAlerts ? `<ul class="spool-shop-alerts">${selectedAlerts}</ul>` : ''}
          </div>
          <div>
            <h4>Selected-Spool Hardware</h4>
            <table class="result-table spool-hardware-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Basis</th>
                </tr>
              </thead>
              <tbody>${hardwareRows}</tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  function renderInspector(model, spoolId) {
    const spool = model.spools.find(item => item.spoolId === spoolId);
    if (!spool) {
      return `
        <div class="spool-inspector-empty">
          <h3>No Spool Selected</h3>
          <p class="field-hint">Select a spool in the preview or generated table to inspect grouping and material impact.</p>
        </div>`;
    }

    const sectionBars = spool.sections.map(section => {
      const pct = Math.max(4, Math.min(100, (section.lengthFt / model.options.sectionLengthFt) * 100));
      return `
        <span class="spool-section-bar ${section.isRemainder ? 'is-remainder' : ''}" style="--section-pct:${pct}%">
          <span>${esc(formatNumber(section.lengthFt))} ft</span>
        </span>`;
    }).join('');
    const cableRows = spool.cables.length
      ? spool.cables.map(c => `<li><strong>${esc(c.cable_tag)}</strong><span>${esc(c.from)} to ${esc(c.to)} - ${esc(formatNumber(c.lengthFt))} ft</span></li>`).join('')
      : '<li><span>No cable assignments for this spool.</span></li>';
    const groupLabel = spool.dominantGroup?.label || 'Unassigned group';
    const splitNotice = spool.wasCapacitySplit
      ? '<p class="spool-split-note">This grouping was split by the max segments per spool limit.</p>'
      : '';
    const hardwareRows = renderHardwareList(spool.hardware?.items || []);
    const selectedAlerts = model.constraints
      .filter(alert => alert.spoolId === spool.spoolId)
      .map(alert => `<li class="is-${attr(alert.severity)}">${esc(alert.title)}: ${esc(alert.message)}</li>`)
      .join('');

    return `
      <div class="spool-inspector-header">
        <span class="spool-color-dot spool-bg-${spool.colorIndex}"></span>
        <div>
          <h3>${esc(spool.spoolId)}</h3>
          <p>${esc(groupLabel)}</p>
        </div>
      </div>
      <dl class="spool-inspector-facts">
        <div><dt>Tray segments</dt><dd>${esc(spool.trayCount)} / ${esc(model.options.maxSpoolSegments)}</dd></div>
        <div><dt>Tray IDs</dt><dd>${esc(spool.trayIds.join(', '))}</dd></div>
        <div><dt>Width</dt><dd>${esc(formatNumber(spool.width_in))} in</dd></div>
        <div><dt>Run length</dt><dd>${esc(formatNumber(spool.totalLengthFt))} ft</dd></div>
        <div><dt>Material w/ allowance</dt><dd>${esc(formatNumber(spool.hardware?.materialLengthWithAllowanceFt || spool.totalLengthFt))} ft</dd></div>
        <div><dt>Section joints</dt><dd>${esc(spool.hardware?.sectionJointCount || 0)}</dd></div>
        <div><dt>Brackets</dt><dd>${esc(spool.bracketCount)}</dd></div>
        <div><dt>Clamp kits</dt><dd>${esc(spool.hardware?.clampKits || 0)}</dd></div>
        <div><dt>Est. weight</dt><dd>${esc(spool.estimatedWeight)} lb</dd></div>
      </dl>
      <div class="spool-capacity-meter" aria-label="Spool segment capacity">
        <span style="width:${Math.min(100, spool.capacityPct)}%"></span>
      </div>
      ${splitNotice}
      <h4>Section Cuts</h4>
      <div class="spool-section-stack">${sectionBars || '<span class="field-hint">No sections calculated.</span>'}</div>
      <h4>Hardware Takeoff</h4>
      <ul class="spool-inspector-hardware">${hardwareRows}</ul>
      ${selectedAlerts ? `<h4>Constraint Notes</h4><ul class="spool-inspector-alerts">${selectedAlerts}</ul>` : ''}
      <h4>Cable Assignments</h4>
      <ul class="spool-inspector-cables">${cableRows}</ul>`;
  }

  function renderHardwareList(items) {
    if (!items.length) {
      return '<li><span>No hardware assumptions calculated.</span></li>';
    }
    return items.map(item => `
      <li>
        <strong>${esc(item.item)}: ${esc(formatNumber(item.quantity))} ${esc(item.unit)}</strong>
        <span>${esc(item.basis)}</span>
      </li>`).join('');
  }

  function renderHardwareRows(items) {
    if (!items.length) {
      return '<tr><td colspan="3" class="field-hint">No hardware assumptions calculated.</td></tr>';
    }
    return items.map(item => `
      <tr>
        <td>${esc(item.item)}</td>
        <td>${esc(formatNumber(item.quantity))} ${esc(item.unit)}</td>
        <td>${esc(item.basis)}</td>
      </tr>`).join('');
  }

  function selectSpool(spoolId) {
    if (!spoolId || !currentPreviewModel?.spools.some(spool => spool.spoolId === spoolId)) return;
    selectedSpoolId = spoolId;
    renderPreview(currentPreviewModel);
  }

  function updateSpoolRowSelection() {
    document.querySelectorAll('[data-spool-row]').forEach(row => {
      row.classList.toggle('is-selected', row.getAttribute('data-spool-row') === selectedSpoolId);
    });
    document.querySelectorAll('[data-spool-detail]').forEach(detail => {
      detail.open = detail.getAttribute('data-spool-detail') === selectedSpoolId;
    });
  }

  function renderOutputPending(model) {
    resultsDiv.innerHTML = `
      <div class="spool-output-pending">
        <strong>Preview changed.</strong>
        <span>Generate spool sheets again to refresh printable tables and export files.</span>
        <span>${esc(formatNumber(model.summary.spoolCount))} spool${model.summary.spoolCount === 1 ? '' : 's'} in the current preview.</span>
      </div>`;
  }

  function renderResults({ spools, summary, constraints = [] }) {
    if (spools.length === 0) {
      resultsDiv.innerHTML = '<p>No spool assemblies generated. Verify that trays have valid coordinates in the Raceway Schedule.</p>';
      return;
    }

    const summaryHtml = `
      <section class="spool-results-summary">
        <h2>Generated Spool Output</h2>
        <div class="spool-kpi-grid spool-kpi-grid--compact">
          ${resultKpi('Spool Assemblies', summary.spoolCount)}
          ${resultKpi('Tray Segments', summary.totalTrays)}
          ${resultKpi('Run Length', `${summary.totalLengthFt.toFixed(1)} ft`)}
          ${resultKpi('Straight Sections', summary.totalSections)}
          ${resultKpi('Support Brackets', summary.totalBrackets)}
          ${resultKpi('Splice Plate Pairs', summary.totalSplicePlatePairs)}
          ${resultKpi('Clamp Kits', summary.totalClampKits)}
          ${resultKpi('Field Allowance', `${formatNumber(summary.totalFieldCutAllowanceFt)} ft`)}
          ${resultKpi('Tray Weight', `${summary.totalEstimatedWeight} lb`)}
          ${resultKpi('Cable Assignments', summary.totalCableEntries)}
        </div>
      </section>`;

    const rows = spools.map(spool => `
      <tr data-spool-row="${attr(spool.spoolId)}" tabindex="0">
        <td><strong>${esc(spool.spoolId)}</strong></td>
        <td>${esc(spool.trayCount)}</td>
        <td>${esc(spool.trayIds.join(', '))}</td>
        <td>${esc(formatNumber(spool.width_in))}</td>
        <td>${esc(formatNumber(spool.totalLengthFt))}</td>
        <td>${esc(formatNumber(spool.hardware?.materialLengthWithAllowanceFt || spool.totalLengthFt))}</td>
        <td>${esc(spool.straightSections)}</td>
        <td>${esc(spool.bracketCount)}</td>
        <td>${esc(spool.hardware?.splicePlatePairs || 0)}</td>
        <td>${esc(spool.hardware?.clampKits || 0)}</td>
        <td>${esc(spool.estimatedWeight)}</td>
        <td>${esc(spool.cables.length)}</td>
      </tr>`).join('');

    const details = spools.map(spool => {
      const cableRows = spool.cables.length > 0
        ? spool.cables.map(c =>
            `<tr>
              <td>${esc(c.cable_tag)}</td>
              <td>${esc(c.from)}</td>
              <td>${esc(c.to)}</td>
              <td>${esc(formatNumber(c.lengthFt))} ft</td>
            </tr>`).join('')
        : '<tr><td colspan="4" class="field-hint">No cable assignments for this spool.</td></tr>';
      const hardwareRows = renderHardwareRows(spool.hardware?.items || []);
      const spoolAlerts = constraints
        .filter(alert => alert.spoolId === spool.spoolId)
        .map(alert => `<li class="is-${attr(alert.severity)}">${esc(alert.message)}</li>`)
        .join('');

      return `
        <details class="spool-detail-card" data-spool-detail="${attr(spool.spoolId)}" ${spool.spoolId === selectedSpoolId ? 'open' : ''}>
          <summary>${esc(spool.spoolId)} material and cable detail</summary>
          <div class="spool-detail-grid">
            <table class="result-table" aria-label="Spool ${attr(spool.spoolId)} materials">
              <tbody>
                <tr><th scope="row">Tray Segments</th><td>${spool.trayCount} (${esc(spool.trayIds.join(', '))})</td></tr>
                <tr><th scope="row">Tray Width</th><td>${esc(formatNumber(spool.width_in))} in</td></tr>
                <tr><th scope="row">Total Run Length</th><td>${esc(formatNumber(spool.totalLengthFt))} ft</td></tr>
                <tr><th scope="row">Material w/ Allowance</th><td>${esc(formatNumber(spool.hardware?.materialLengthWithAllowanceFt || spool.totalLengthFt))} ft</td></tr>
                <tr><th scope="row">Straight Sections</th><td>${esc(spool.straightSections)}</td></tr>
                <tr><th scope="row">Support Brackets</th><td>${esc(spool.bracketCount)}</td></tr>
                <tr><th scope="row">Splice Plate Pairs</th><td>${esc(spool.hardware?.splicePlatePairs || 0)}</td></tr>
                <tr><th scope="row">Clamp Kits</th><td>${esc(spool.hardware?.clampKits || 0)}</td></tr>
                <tr><th scope="row">Est. Tray Weight</th><td>${esc(spool.estimatedWeight)} lb</td></tr>
              </tbody>
            </table>
            <table class="result-table" aria-label="Cables in spool ${attr(spool.spoolId)}">
              <thead>
                <tr>
                  <th scope="col">Cable Tag</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Length</th>
                </tr>
              </thead>
              <tbody>${cableRows}</tbody>
            </table>
          </div>
          <div class="spool-detail-grid">
            <table class="result-table spool-hardware-table" aria-label="Hardware BOM for spool ${attr(spool.spoolId)}">
              <thead>
                <tr>
                  <th scope="col">Hardware</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Basis</th>
                </tr>
              </thead>
              <tbody>${hardwareRows}</tbody>
            </table>
            ${spoolAlerts ? `<ul class="spool-detail-alerts">${spoolAlerts}</ul>` : '<p class="field-hint">No selected-spool constraint warnings.</p>'}
          </div>
        </details>`;
    }).join('');

    resultsDiv.innerHTML = `
      ${summaryHtml}
      <section class="spool-summary-table-section" aria-labelledby="spool-summary-heading">
        <h2 id="spool-summary-heading">Spool Summary Table</h2>
        <div class="table-scroll-x">
          <table class="result-table spool-summary-table" aria-label="Generated spool summary">
            <thead>
              <tr>
                <th scope="col">Spool</th>
                <th scope="col">Trays</th>
                <th scope="col">Tray IDs</th>
                <th scope="col">Width (in)</th>
                <th scope="col">Length (ft)</th>
                <th scope="col">Material (ft)</th>
                <th scope="col">Sections</th>
                <th scope="col">Brackets</th>
                <th scope="col">Splice Pairs</th>
                <th scope="col">Clamp Kits</th>
                <th scope="col">Weight (lb)</th>
                <th scope="col">Cables</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
      <section class="spool-detail-section" aria-label="Per-spool detail">
        ${details}
      </section>`;
    updateSpoolRowSelection();
  }

  function resultKpi(label, value) {
    return `
      <article class="spool-kpi">
        <span class="spool-kpi-label">${esc(label)}</span>
        <strong>${esc(value)}</strong>
      </article>`;
  }

  function exportToXlsx({ spools, summary, constraints = [], options = {} }) {
    const XLSX = requireXlsxLibrary();
    const wb = XLSX.utils.book_new();

    const summaryData = [
      [
        'Spool ID',
        'Tray Count',
        'Tray IDs',
        'Width (in)',
        'Length (ft)',
        'Material w/ Allowance (ft)',
        'Straight Sections',
        'Brackets',
        'Splice Plate Pairs',
        'Clamp Kits',
        'Ground Jumpers',
        'Expansion Fittings',
        'Field-Cut Allowance (ft)',
        'Est. Weight (lbs)',
        'Cable Assignments',
      ],
      ...spools.map(s => [
        s.spoolId,
        s.trayCount,
        s.trayIds.join(', '),
        s.width_in,
        s.totalLengthFt,
        s.hardware?.materialLengthWithAllowanceFt || s.totalLengthFt,
        s.straightSections,
        s.bracketCount,
        s.hardware?.splicePlatePairs || 0,
        s.hardware?.clampKits || 0,
        s.hardware?.groundJumpers || 0,
        s.hardware?.expansionFittings || 0,
        s.hardware?.fieldCutAllowanceFt || 0,
        s.estimatedWeight,
        s.cables.length,
      ]),
      [],
      [
        'TOTALS',
        summary.totalTrays,
        '',
        '',
        summary.totalLengthFt,
        summary.totalMaterialLengthWithAllowanceFt,
        summary.totalSections,
        summary.totalBrackets,
        summary.totalSplicePlatePairs,
        summary.totalClampKits,
        summary.totalGroundJumpers,
        summary.totalExpansionFittings,
        summary.totalFieldCutAllowanceFt,
        summary.totalEstimatedWeight,
        summary.totalCableEntries,
      ],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Spool Summary');

    const hardwareData = [
      ['Spool', 'Item', 'Quantity', 'Unit', 'Base Quantity', 'Spare Quantity', 'Basis'],
    ];
    for (const spool of spools) {
      for (const item of spool.hardware?.items || []) {
        hardwareData.push([
          spool.spoolId,
          item.item,
          item.quantity,
          item.unit,
          item.baseQuantity,
          item.spareQuantity,
          item.basis,
        ]);
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hardwareData), 'Hardware BOM');

    const assumptionData = [
      ['Assumption', 'Value'],
      ['Standard section length (ft)', options.sectionLengthFt ?? ''],
      ['Grouping grid cell (ft)', options.gridCellFt ?? ''],
      ['Elevation band (ft)', options.elevBandFt ?? ''],
      ['Max segments per spool', options.maxSpoolSegments ?? ''],
      ['Splice plate pairs per joint', options.splicePlatePairsPerJoint ?? ''],
      ['Clamp kits per support', options.clampKitsPerSupport ?? ''],
      ['Ground jumpers per joint', options.groundJumpersPerJoint ?? ''],
      ['Expansion fitting interval (ft)', options.expansionFittingIntervalFt ?? ''],
      ['Field-cut allowance (%)', options.fieldCutAllowancePct ?? ''],
      ['Hardware spare (%)', options.spareHardwarePct ?? ''],
      ['Shipping length target (ft)', options.maxShippingLengthFt ?? ''],
      ['Handling weight target (lb)', options.maxHandlingWeightLb ?? ''],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(assumptionData), 'Assumptions');

    const constraintData = [
      ['Severity', 'Spool', 'Title', 'Message'],
      ...constraints.map(alert => [alert.severity, alert.spoolId || '', alert.title, alert.message]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(constraintData), 'Constraints');

    for (const spool of spools) {
      if (spool.cables.length === 0) continue;
      const sheetName = spool.spoolId.replace(/[\\/?*[\]]/g, '-').slice(0, 31);
      const cableData = [
        ['Spool', 'Cable Tag', 'From', 'To', 'Length (ft)'],
        ...spool.cables.map(c => [spool.spoolId, c.cable_tag, c.from, c.to, c.lengthFt]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cableData), sheetName);
    }

    const stamp = new Date().toISOString().split('T')[0];
    downloadWorkbook(wb, `spool-sheets-${stamp}.xlsx`);
  }

  const generateProcurementBtn = document.getElementById('generateProcurementBtn');
  const exportProcurementBtn   = document.getElementById('exportProcurementBtn');
  const procurementResultsDiv  = document.getElementById('procurementResults');
  let lastProcurementResult = null;

  generateProcurementBtn.addEventListener('click', () => {
    const cables = getCables();
    const routeResults = cables
      .filter(c => c.total_length != null && parseFloat(c.total_length) > 0)
      .map(c => ({ cable: c.name || c.cable_tag || c.tag, total_length: parseFloat(c.total_length) }));

    if (routeResults.length === 0) {
      procurementResultsDiv.innerHTML = '<p class="field-hint">No routed cable lengths found. Run the <a href="optimalRoute.html">Optimal Route</a> tool first to populate cable lengths.</p>';
      return;
    }

    let reels;
    try {
      reels = buildCableProcurementSchedule(routeResults, cables);
    } catch (err) {
      showAlertModal('Procurement Error', err.message);
      return;
    }

    lastProcurementResult = reels;
    renderProcurementResults(reels);
    exportProcurementBtn.disabled = false;
  });

  exportProcurementBtn.addEventListener('click', () => {
    if (!lastProcurementResult) return;
    try {
      exportProcurementXlsx(lastProcurementResult);
    } catch (err) {
      showXlsxExportError(err);
    }
  });

  function renderProcurementResults(reels) {
    if (reels.length === 0) {
      procurementResultsDiv.innerHTML = '<p>No procurement data generated. Ensure cables have conductor specifications in the Cable Schedule.</p>';
      return;
    }

    const totalReels   = reels.length;
    const totalEntries = reels.reduce((s, r) => s + r.cableAssignments.length, 0);
    const totalOffcut  = reels.reduce((s, r) => s + r.offcutFt, 0);
    const avgUtil      = reels.reduce((s, r) => s + r.reelUtilizationPct, 0) / totalReels;

    const summary = `
      <section class="procurement-visual-summary">
        <h3>Reel Utilization</h3>
        <div class="spool-kpi-grid spool-kpi-grid--compact">
          ${resultKpi('Total Reels', totalReels)}
          ${resultKpi('Cable Entries', totalEntries)}
          ${resultKpi('Total Offcut', `${totalOffcut.toFixed(1)} ft`)}
          ${resultKpi('Average Utilization', `${avgUtil.toFixed(1)}%`)}
        </div>
      </section>`;

    const bySpec = new Map();
    for (const reel of reels) {
      if (!bySpec.has(reel.conductorSpec)) bySpec.set(reel.conductorSpec, []);
      bySpec.get(reel.conductorSpec).push(reel);
    }

    const groups = [...bySpec.entries()].map(([spec, specReels]) => {
      const reelCards = specReels.map(reel => {
        const rows = reel.cableAssignments.map(a => `
          <tr>
            <td>${esc(a.cableTag)}</td>
            <td>${esc(formatNumber(a.routedLengthFt))} ft</td>
            <td>${esc(formatNumber(a.addedAllowanceFt))} ft</td>
            <td>${esc(formatNumber(a.totalCutFt))} ft</td>
          </tr>`).join('');
        return `
          <article class="procurement-reel">
            <div class="procurement-reel-header">
              <h4>${esc(reel.reelSpec)}</h4>
              <strong>${esc(formatNumber(reel.reelUtilizationPct))}% used</strong>
            </div>
            <div class="procurement-util-bar" aria-label="Reel utilization ${attr(reel.reelUtilizationPct)} percent">
              <span style="width:${Math.min(100, Math.max(0, reel.reelUtilizationPct))}%"></span>
            </div>
            <div class="procurement-reel-meta">
              <span>${esc(formatNumber(reel.standardLengthFt))} ft reel</span>
              <span>${esc(formatNumber(reel.offcutFt))} ft offcut</span>
              <span>${esc(reel.cableAssignments.length)} cut${reel.cableAssignments.length === 1 ? '' : 's'}</span>
            </div>
            <div class="table-scroll-x">
              <table class="result-table" aria-label="${attr(reel.reelSpec)} assignments">
                <thead>
                  <tr>
                    <th scope="col">Cable Tag</th>
                    <th scope="col">Routed Length</th>
                    <th scope="col">Allowance</th>
                    <th scope="col">Cut Length</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </article>`;
      }).join('');
      return `<section class="procurement-spec-group"><h3>${esc(spec)}</h3>${reelCards}</section>`;
    }).join('');

    procurementResultsDiv.innerHTML = `${summary}${groups}`;
  }

  function exportProcurementXlsx(reels) {
    const XLSX = requireXlsxLibrary();
    const wb = XLSX.utils.book_new();

    const summaryData = [
      ['Reel', 'Conductor Spec', 'Reel Size (ft)', '# Cables', 'Total Used (ft)', 'Offcut (ft)', 'Utilization (%)'],
      ...reels.map(r => [
        r.reelSpec,
        r.conductorSpec,
        r.standardLengthFt,
        r.cableAssignments.length,
        +(r.standardLengthFt - r.offcutFt).toFixed(1),
        r.offcutFt,
        r.reelUtilizationPct,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Procurement Summary');

    const bySpec = new Map();
    for (const reel of reels) {
      if (!bySpec.has(reel.conductorSpec)) bySpec.set(reel.conductorSpec, []);
      bySpec.get(reel.conductorSpec).push(reel);
    }

    for (const [spec, specReels] of bySpec) {
      const sheetName = spec.replace(/[\\/?*[\]]/g, '-').slice(0, 31);
      const rows = [
        ['Reel', 'Cable Tag', 'Routed Length (ft)', 'Allowance (ft)', 'Cut Length (ft)', 'Reel Size (ft)', 'Offcut (ft)', 'Utilization (%)'],
      ];
      for (const reel of specReels) {
        for (const a of reel.cableAssignments) {
          rows.push([reel.reelSpec, a.cableTag, a.routedLengthFt, a.addedAllowanceFt, a.totalCutFt, reel.standardLengthFt, reel.offcutFt, reel.reelUtilizationPct]);
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
    }

    const stamp = new Date().toISOString().split('T')[0];
    downloadWorkbook(wb, `cable-procurement-${stamp}.xlsx`);
  }

  function exportCurrentSvg() {
    const svg = visualCanvas.querySelector('.spool-visual-svg');
    if (!svg) throw new Error('No spool visual is available to export.');
    const markup = buildStandaloneSpoolSvg(svg);
    downloadTextFile(markup, visualExportFilename('svg'), SVG_MIME);
  }

  async function exportCurrentPng() {
    const svg = visualCanvas.querySelector('.spool-visual-svg');
    if (!svg) throw new Error('No spool visual is available to export.');
    const markup = buildStandaloneSpoolSvg(svg);
    const blob = new Blob([markup], { type: SVG_MIME });
    const url = URL.createObjectURL(blob);
    try {
      const image = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = SVG_WIDTH;
      canvas.height = SVG_HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('PNG export is not available in this browser.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => {
          if (result) resolve(result);
          else reject(new Error('Unable to render the PNG export.'));
        }, PNG_MIME);
      });
      downloadBlob(pngBlob, visualExportFilename('png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function visualExportFilename(extension) {
    const stamp = new Date().toISOString().split('T')[0];
    const selected = selectedSpoolId ? `-${selectedSpoolId.toLowerCase()}` : '';
    return `spool-visual${selected}-${stamp}.${extension}`;
  }

  function showVisualExportError(err) {
    const message = err instanceof Error && err.message
      ? err.message
      : 'Unable to export the current spool visual.';
    showAlertModal('Visual Export Error', message);
  }

  function showXlsxExportError(err) {
    const message = err instanceof Error && err.message
      ? err.message
      : 'Unable to create the XLSX file.';
    const title = message.includes('XLSX library') ? 'Library Error' : 'Export Error';
    showAlertModal(title, message);
  }

  resultsDiv.innerHTML = '<p class="field-hint">Generate spool sheets to create printable tables and Excel export output from the live preview.</p>';
  renderPreview(buildCurrentPreviewModel());
});

function requireXlsxLibrary() {
  const library = globalThis.XLSX || null;
  if (!library?.utils || typeof library.write !== 'function') {
    throw new Error('XLSX library not loaded. Check your network connection.');
  }
  return library;
}

function downloadWorkbook(workbook, filename) {
  const XLSX = requireXlsxLibrary();
  const workbookData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const safeFilename = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const blob = new Blob([workbookData], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function downloadTextFile(text, filename, mimeType) {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the SVG visual for PNG export.'));
    image.src = url;
  });
}

function buildStandaloneSpoolSvg(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(SVG_WIDTH));
  clone.setAttribute('height', String(SVG_HEIGHT));
  const transform = svg.style.transform;
  clone.removeAttribute('style');

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = spoolExportStyles();
  const firstVisualNode = [...clone.childNodes].find(node => node.nodeType === Node.ELEMENT_NODE && node.tagName?.toLowerCase() === 'g');
  clone.insertBefore(style, firstVisualNode || clone.firstChild);

  if (transform && transform.startsWith('matrix(') && transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wrapper.setAttribute('transform', transform);
    [...clone.childNodes]
      .filter(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        const tag = node.tagName.toLowerCase();
        return tag !== 'title' && tag !== 'desc' && tag !== 'style';
      })
      .forEach(node => wrapper.appendChild(node));
    clone.appendChild(wrapper);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function spoolExportStyles() {
  return `
    .spool-grid-cell polygon { fill: rgba(59, 130, 246, .045); stroke: rgba(100, 116, 139, .38); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .spool-grid-cell.is-selected polygon { fill: rgba(16, 185, 129, .11); stroke: #0f766e; stroke-width: 2; }
    .spool-axis line { stroke: #64748b; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .spool-grid-cell text, .spool-axis text, .spool-visual-marker text, .spool-elevation-legend text { fill: #0f172a; font-size: 11px; font-weight: 700; paint-order: stroke; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; }
    .spool-visual-segment { stroke-width: 5; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .spool-visual-segment-group.is-selected .spool-visual-segment { stroke-width: 8; }
    .spool-visual-marker circle { stroke: #ffffff; stroke-width: 2.5; vector-effect: non-scaling-stroke; }
    .spool-visual-marker.is-selected circle { stroke: #111827; stroke-width: 3.5; }
    .spool-elevation-row rect { fill: rgba(255, 255, 255, .88); stroke: rgba(100, 116, 139, .32); }
    .spool-elevation-row.is-selected rect { fill: rgba(254, 243, 199, .94); stroke: #d97706; }
    .spool-elevation-title { font-size: 12px; }
    .spool-elevation-more { fill: #64748b; }
    .spool-stroke-0 { stroke: #2563eb; } .spool-stroke-1 { stroke: #0f766e; } .spool-stroke-2 { stroke: #d97706; } .spool-stroke-3 { stroke: #be123c; }
    .spool-stroke-4 { stroke: #7c3aed; } .spool-stroke-5 { stroke: #0891b2; } .spool-stroke-6 { stroke: #65a30d; } .spool-stroke-7 { stroke: #c2410c; }
    .spool-stroke-8 { stroke: #1d4ed8; } .spool-stroke-9 { stroke: #047857; } .spool-stroke-10 { stroke: #a16207; } .spool-stroke-11 { stroke: #9333ea; }
    .spool-fill-0 { fill: #2563eb; } .spool-fill-1 { fill: #0f766e; } .spool-fill-2 { fill: #d97706; } .spool-fill-3 { fill: #be123c; }
    .spool-fill-4 { fill: #7c3aed; } .spool-fill-5 { fill: #0891b2; } .spool-fill-6 { fill: #65a30d; } .spool-fill-7 { fill: #c2410c; }
    .spool-fill-8 { fill: #1d4ed8; } .spool-fill-9 { fill: #047857; } .spool-fill-10 { fill: #a16207; } .spool-fill-11 { fill: #9333ea; }
  `;
}

function renderSpoolSvg(model, selectedSpoolId) {
  if (!model.hasTrayData) {
    return renderPreviewEmptyState('No tray data', 'Add trays in the Raceway Schedule to preview prefabrication groups.');
  }
  if (!model.hasCoordinates) {
    return renderPreviewEmptyState('Coordinate data missing', 'Add start and end X/Y/Z coordinates to draw the spool preview.');
  }

  const bounds = expandBounds(model.bounds);
  const projector = createProjector(bounds, SVG_WIDTH, SVG_HEIGHT);
  const cells = model.gridCells.slice(0, 80).map(cell => renderGridCell(cell, projector, bounds.minZ, selectedSpoolId)).join('');
  const sortedSegments = [...model.segments].sort((a, b) => {
    if (a.spoolId === selectedSpoolId && b.spoolId !== selectedSpoolId) return 1;
    if (b.spoolId === selectedSpoolId && a.spoolId !== selectedSpoolId) return -1;
    return a.colorIndex - b.colorIndex || a.trayId.localeCompare(b.trayId);
  });
  const segments = sortedSegments.map(segment => renderSpoolSegment(segment, projector, selectedSpoolId)).join('');
  const markers = model.markers.map(marker => renderSpoolMarker(marker, projector, selectedSpoolId)).join('');
  const legend = renderElevationLegend(model, selectedSpoolId);

  return `
    <svg class="spool-visual-svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-labelledby="spool-visual-title spool-visual-desc">
      <title id="spool-visual-title">Prefabrication spool visual preview</title>
      <desc id="spool-visual-desc">Cable tray segments grouped into prefabrication spools by grid cell, elevation band, width, and max segment limit.</desc>
      <g class="spool-grid-cells">${cells}</g>
      <g class="spool-axis">${renderAxes(bounds, projector)}</g>
      <g class="spool-segments">${segments}</g>
      <g class="spool-markers">${markers}</g>
      ${legend}
    </svg>`;
}

function renderPreviewEmptyState(title, body) {
  return `
    <div class="spool-preview-empty">
      <strong>${esc(title)}</strong>
      <span>${esc(body)}</span>
    </div>`;
}

function renderGridCell(cell, projector, floorZ, selectedSpoolId) {
  const points = [
    projector.project({ xFt: cell.x0, yFt: cell.y0, zFt: floorZ }),
    projector.project({ xFt: cell.x1, yFt: cell.y0, zFt: floorZ }),
    projector.project({ xFt: cell.x1, yFt: cell.y1, zFt: floorZ }),
    projector.project({ xFt: cell.x0, yFt: cell.y1, zFt: floorZ }),
  ];
  const center = projector.project({ xFt: (cell.x0 + cell.x1) / 2, yFt: (cell.y0 + cell.y1) / 2, zFt: floorZ });
  const isSelected = cell.spoolIds.includes(selectedSpoolId);
  return `
    <g class="spool-grid-cell ${isSelected ? 'is-selected' : ''}">
      <polygon points="${points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}"></polygon>
      <text x="${center.x.toFixed(1)}" y="${center.y.toFixed(1)}">G${esc(cell.gridX)},${esc(cell.gridY)}</text>
    </g>`;
}

function renderSpoolSegment(segment, projector, selectedSpoolId) {
  const start = projector.project(segment.start);
  const end = projector.project(segment.end);
  const isSelected = segment.spoolId === selectedSpoolId;
  return `
    <g class="spool-visual-segment-group ${isSelected ? 'is-selected' : ''}" data-spool-id="${attr(segment.spoolId)}" data-tray-id="${attr(segment.trayId)}" tabindex="0" role="button" aria-label="${attr(segment.label)}">
      <line class="spool-visual-segment spool-stroke-${segment.colorIndex}" x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"></line>
    </g>`;
}

function renderSpoolMarker(marker, projector, selectedSpoolId) {
  const point = projector.project(marker.point);
  const isSelected = marker.spoolId === selectedSpoolId;
  return `
    <g class="spool-visual-marker ${isSelected ? 'is-selected' : ''}" data-spool-id="${attr(marker.spoolId)}" tabindex="0" role="button" aria-label="${attr(marker.label)}">
      <circle class="spool-fill-${marker.colorIndex}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${isSelected ? 7 : 5}"></circle>
      <text x="${(point.x + 10).toFixed(1)}" y="${(point.y - 8).toFixed(1)}">${esc(marker.label)}</text>
    </g>`;
}

function renderElevationLegend(model, selectedSpoolId) {
  const bands = model.elevationBands.slice(0, 7);
  const rows = bands.map((band, index) => {
    const y = 76 + index * 34;
    const isSelected = band.spoolIds.includes(selectedSpoolId);
    return `
      <g class="spool-elevation-row ${isSelected ? 'is-selected' : ''}">
        <rect x="704" y="${y - 16}" width="126" height="24" rx="4"></rect>
        <text x="714" y="${y}">${esc(band.label)}</text>
      </g>`;
  }).join('');
  const more = model.elevationBands.length > bands.length
    ? `<text class="spool-elevation-more" x="704" y="${80 + bands.length * 34}">+${model.elevationBands.length - bands.length} more</text>`
    : '';

  return `
    <g class="spool-elevation-legend" aria-hidden="true">
      <text class="spool-elevation-title" x="704" y="42">Elevation Bands</text>
      ${rows}
      ${more}
    </g>`;
}

function renderAxes(bounds, projector) {
  const origin = projector.project({ xFt: bounds.minX, yFt: bounds.minY, zFt: bounds.minZ });
  const xEnd = projector.project({ xFt: bounds.minX + Math.min(16, Math.max(4, bounds.maxX - bounds.minX) * 0.22), yFt: bounds.minY, zFt: bounds.minZ });
  const yEnd = projector.project({ xFt: bounds.minX, yFt: bounds.minY + Math.min(16, Math.max(4, bounds.maxY - bounds.minY) * 0.22), zFt: bounds.minZ });
  const zEnd = projector.project({ xFt: bounds.minX, yFt: bounds.minY, zFt: bounds.minZ + Math.min(16, Math.max(4, bounds.maxZ - bounds.minZ) * 0.5) });
  return `
    <line x1="${origin.x.toFixed(1)}" y1="${origin.y.toFixed(1)}" x2="${xEnd.x.toFixed(1)}" y2="${xEnd.y.toFixed(1)}"></line>
    <line x1="${origin.x.toFixed(1)}" y1="${origin.y.toFixed(1)}" x2="${yEnd.x.toFixed(1)}" y2="${yEnd.y.toFixed(1)}"></line>
    <line x1="${origin.x.toFixed(1)}" y1="${origin.y.toFixed(1)}" x2="${zEnd.x.toFixed(1)}" y2="${zEnd.y.toFixed(1)}"></line>
    <text x="${xEnd.x + 8}" y="${xEnd.y + 4}">X</text>
    <text x="${yEnd.x - 16}" y="${yEnd.y + 4}">Y</text>
    <text x="${zEnd.x + 6}" y="${zEnd.y - 6}">Z</text>`;
}

function expandBounds(bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const depth = Math.max(1, bounds.maxY - bounds.minY);
  const height = Math.max(1, bounds.maxZ - bounds.minZ);
  return {
    minX: bounds.minX - Math.max(4, width * 0.16),
    maxX: bounds.maxX + Math.max(4, width * 0.16),
    minY: bounds.minY - Math.max(4, depth * 0.16),
    maxY: bounds.maxY + Math.max(4, depth * 0.16),
    minZ: Math.min(0, bounds.minZ - Math.max(2, height * 0.16)),
    maxZ: bounds.maxZ + Math.max(4, height * 0.2),
  };
}

function rawProject(point) {
  return {
    x: (Number(point.xFt) - Number(point.yFt)) * 0.866,
    y: (Number(point.xFt) + Number(point.yFt)) * 0.5 - Number(point.zFt) * 0.92,
  };
}

function createProjector(bounds, width, height) {
  const corners = [
    { xFt: bounds.minX, yFt: bounds.minY, zFt: bounds.minZ },
    { xFt: bounds.maxX, yFt: bounds.minY, zFt: bounds.minZ },
    { xFt: bounds.maxX, yFt: bounds.maxY, zFt: bounds.minZ },
    { xFt: bounds.minX, yFt: bounds.maxY, zFt: bounds.minZ },
    { xFt: bounds.minX, yFt: bounds.minY, zFt: bounds.maxZ },
    { xFt: bounds.maxX, yFt: bounds.minY, zFt: bounds.maxZ },
    { xFt: bounds.maxX, yFt: bounds.maxY, zFt: bounds.maxZ },
    { xFt: bounds.minX, yFt: bounds.maxY, zFt: bounds.maxZ },
  ].map(rawProject);
  const projectedBounds = corners.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    maxX: Math.max(acc.maxX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxY: Math.max(acc.maxY, point.y),
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  });
  const projectedWidth = Math.max(1, projectedBounds.maxX - projectedBounds.minX);
  const projectedHeight = Math.max(1, projectedBounds.maxY - projectedBounds.minY);
  const scale = Math.min((width - 220) / projectedWidth, (height - 100) / projectedHeight);
  const offsetX = (width - 150) / 2 - ((projectedBounds.minX + projectedBounds.maxX) / 2) * scale;
  const offsetY = height / 2 - ((projectedBounds.minY + projectedBounds.maxY) / 2) * scale + 10;

  return {
    project(point) {
      const projected = rawProject(point);
      return {
        x: projected.x * scale + offsetX,
        y: projected.y * scale + offsetY,
      };
    },
  };
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attr(value) {
  return esc(value).replace(/"/g, '&quot;');
}
