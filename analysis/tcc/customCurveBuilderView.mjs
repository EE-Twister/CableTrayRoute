
import { sanitizeCurve } from '../tccUtils.js';
import {
  CUSTOM_CURVE_CATEGORY,
  sanitizeCustomCurveSettings
} from './customCurveModel.mjs';
import {
  CUSTOM_CURVE_SETTING_CONFIG,
  CUSTOM_CURVE_SETTING_OPTIONS
} from './viewModel.mjs';
import { escapeHtml } from './reportMarkupModel.mjs';
import { formatSettingValue } from './settingModel.mjs';
import {
  CUSTOM_CURVE_DEFAULT_AXES,
  CUSTOM_CURVE_DEFAULT_BOUNDS,
  clampCustomCurveValue as clamp,
  computeCustomCurvePlotMetrics,
  customCurveDataToPixel as dataToPixel,
  customCurvePixelToData as pixelToData,
  formatCustomCurveValue,
  generateCustomCurveLogGrid as generateLogGrid,
  readCustomCurveAxes,
  readCustomCurveBounds
} from './customCurveReferenceModel.mjs';
import {
  CUSTOM_CURVE_VARIANT_ROLE_OPTIONS as VARIANT_ROLE_OPTIONS,
  buildCustomCurveProfilesPayload,
  cloneCustomCurvePoints as clonePoints,
  defaultCustomCurveVariantName as defaultVariantName,
  getCustomCurveVariantDisplayName as getVariantDisplayName,
  normalizeCustomCurveVariantRole as normalizeVariantRole,
  resolveCustomCurvePointHighlight
} from './customCurvePointEditorModel.mjs';
import {
  buildCustomCurveSubmission,
  getCustomCurvePromotionError
} from './customCurveEvidenceModel.mjs';

export async function openCustomCurveBuilderView(curveId = null, dependencies = {}) {
  const {
    document = globalThis.document,
    URL = globalThis.URL,
    Image = globalThis.Image,
    console = globalThis.console,
    PROTECTIVE_TYPES,
    ensurePdfJs,
    getCustomCurveById,
    openModal,
    saveCustomCurve
  } = dependencies;
  const isEditing = !!curveId;
  const existing = isEditing ? getCustomCurveById(curveId) : null;
  const axes = { ...CUSTOM_CURVE_DEFAULT_AXES, ...(existing?.axes || {}) };
  const bounds = { ...CUSTOM_CURVE_DEFAULT_BOUNDS, ...(existing?.bounds || {}) };
  let workingPoints = [];
  let referenceImage = null;
  let referenceObjectUrl = null;
  let pendingPdfUrl = null;
  let lastCapturedPoint = null;

  const doc = document;
  const axisInputs = {};
  const boundInputs = {};
  const axisKeys = ['currentMin', 'currentMax', 'timeMin', 'timeMax'];
  const boundKeys = ['left', 'right', 'top', 'bottom'];

  let canvas = null;
  let ctx = null;
  let canvasContainer = null;
  let canvasScrollEl = null;
  let tableBody = null;
  let statusEl = null;
  let readoutEl = null;
  let cursorReadoutEl = null;
  let hoverTooltipEl = null;
  let manualCurrentInput = null;
  let manualTimeInput = null;
  let pointCountEl = null;

  let customSettings = { ...sanitizeCustomCurveSettings(existing?.settings || existing?.baseDevice?.settings || {}) };
  let lastPointer = null;

  let showAxisOverlay = true;
  let showReferenceImage = true;
  let referenceToggleInput = null;
  let axisOverlayInput = null;

  let axisTitleXEl = null;
  let axisTitleYEl = null;
  let axisTickContainerX = null;
  let axisTickContainerY = null;

  const ZOOM_DEFAULT = 1;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 0.1;
  let zoomLevel = ZOOM_DEFAULT;
  let zoomSliderEl = null;
  let zoomValueEl = null;

  let nameInputEl = null;
  let manufacturerInputEl = null;
  let deviceTypeInputEl = null;
  let descriptionInputEl = null;
  let catalogNumberInputEl = null;
  let ratingVoltageInputEl = null;
  let ratingCurrentInputEl = null;
  let sourceDocumentInputEl = null;
  let sourceRevisionInputEl = null;
  let sourceCurveInputEl = null;
  let extractionMethodInputEl = null;
  let reviewerInputEl = null;
  let reviewedInputEl = null;

  const usedVariantIds = new Set();
  let curveVariants = [];
  let activeVariantId = null;
  let variantSelectEl = null;
  let variantNameInputEl = null;
  let removeVariantBtn = null;
  let variantRoleSelectEl = null;
  let variantCounter = 0;

  const syncVariantCounter = id => {
    if (typeof id !== 'string') return;
    const match = /([0-9]+)$/.exec(id);
    if (!match) return;
    const suffix = match[1];
    if (suffix.length > 15) return;
    const parsed = Number(suffix);
    if (!Number.isSafeInteger(parsed) || parsed < 0) return;
    variantCounter = Math.max(variantCounter, Math.min(parsed, Number.MAX_SAFE_INTEGER));
  };

  const reserveVariantId = candidate => {
    let base = '';
    if (typeof candidate === 'string' && candidate.trim()) {
      base = candidate.trim();
    } else if (Number.isFinite(candidate)) {
      base = `curve-${Math.abs(Math.trunc(candidate))}`;
    }
    if (!base) {
      variantCounter += 1;
      base = `curve-${variantCounter}`;
    }
    let id = base;
    syncVariantCounter(id);
    while (usedVariantIds.has(id)) {
      variantCounter += 1;
      id = `${base}-${variantCounter}`;
    }
    usedVariantIds.add(id);
    syncVariantCounter(id);
    return id;
  };

  const getActiveVariant = () => curveVariants.find(variant => variant.id === activeVariantId) || null;

  const updatePointCountLabel = () => {
    if (!pointCountEl) return;
    const variant = getActiveVariant();
    const index = variant ? curveVariants.findIndex(item => item.id === variant.id) : -1;
    const displayName = variant ? getVariantDisplayName(variant, index === -1 ? 0 : index) : '';
    const baseCount = `${workingPoints.length} point${workingPoints.length === 1 ? '' : 's'}`;
    pointCountEl.textContent = displayName ? `${baseCount} – ${displayName}` : baseCount;
  };

  const commitActiveVariant = () => {
    const variant = getActiveVariant();
    if (!variant) return;
    variant.points = clonePoints(workingPoints);
    variant.lastCaptured = lastCapturedPoint ? { ...lastCapturedPoint } : null;
  };

  const initializeVariants = () => {
    const profileSource = Array.isArray(existing?.curveProfiles) ? existing.curveProfiles : [];
    profileSource.forEach(profile => {
      const rawPoints = Array.isArray(profile?.curve)
        ? profile.curve
        : Array.isArray(profile?.points)
          ? profile.points
          : [];
      const points = sanitizeCurve(rawPoints);
      if (!points.length) return;
      const id = reserveVariantId(profile.id ?? profile.key ?? profile.name ?? profile.label ?? '');
      const nameSource = profile.name ?? profile.label;
      const role = normalizeVariantRole(profile?.role ?? profile?.kind);
      const name = typeof nameSource === 'string' && nameSource.trim()
        ? nameSource.trim()
        : defaultVariantName(curveVariants.length, role);
      curveVariants.push({
        id,
        name,
        role,
        points: clonePoints(points),
        lastCaptured: points.length ? { ...points[points.length - 1] } : null
      });
    });
    if (!curveVariants.length) {
      const fallbackPoints = sanitizeCurve(existing?.curve || []);
      const id = reserveVariantId(existing?.curveProfiles?.[0]?.id ?? '');
      const fallbackRole = normalizeVariantRole(profileSource[0]?.role ?? profileSource[0]?.kind);
      const fallbackName = profileSource.length
        && typeof profileSource[0]?.name === 'string'
        && profileSource[0].name.trim()
          ? profileSource[0].name.trim()
          : defaultVariantName(0, fallbackRole);
      curveVariants.push({
        id,
        name: fallbackName,
        role: fallbackRole,
        points: clonePoints(fallbackPoints),
        lastCaptured: fallbackPoints.length ? { ...fallbackPoints[fallbackPoints.length - 1] } : null
      });
    }
    if (!curveVariants.length) {
      const id = reserveVariantId('');
      curveVariants.push({
        id,
        name: defaultVariantName(0),
        role: 'standard',
        points: [],
        lastCaptured: null
      });
    }
    activeVariantId = curveVariants[0].id;
    workingPoints = clonePoints(curveVariants[0].points);
    lastCapturedPoint = curveVariants[0].lastCaptured
      ? { ...curveVariants[0].lastCaptured }
      : (workingPoints.length ? { ...workingPoints[workingPoints.length - 1] } : null);
  };

  const updateVariantControls = () => {
    if (variantSelectEl) {
      variantSelectEl.innerHTML = '';

      curveVariants.forEach((variant, index) => {
        const option = doc.createElement('option');
        option.value = variant.id;
        option.textContent = getVariantDisplayName(variant, index);
        variantSelectEl.appendChild(option);
      });
      if (activeVariantId && curveVariants.some(variant => variant.id === activeVariantId)) {
        variantSelectEl.value = activeVariantId;
      }
    }
    if (variantNameInputEl) {
      const variant = getActiveVariant();
      variantNameInputEl.value = variant?.name || '';
    }
    if (variantRoleSelectEl) {
      const variant = getActiveVariant();
      variantRoleSelectEl.value = normalizeVariantRole(variant?.role);
    }
    if (removeVariantBtn) {
      removeVariantBtn.disabled = curveVariants.length <= 1;
    }
    updatePointCountLabel();
  };

  const setActiveVariant = variantId => {
    if (!variantId || variantId === activeVariantId) return;
    commitActiveVariant();
    activeVariantId = variantId;
    const variant = getActiveVariant();
    workingPoints = clonePoints(variant ? variant.points : []);
    lastCapturedPoint = variant?.lastCaptured
      ? { ...variant.lastCaptured }
      : (workingPoints.length ? { ...workingPoints[workingPoints.length - 1] } : null);
    refreshPointTable();
    updateVariantControls();
  };

  initializeVariants();

  const updateStatus = (message, type = 'info') => {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.dataset.variant = type;
  };

  const updateReadout = point => {
    if (!readoutEl) return;
    if (!point) {
      readoutEl.textContent = 'Click within the plot area to capture a point.';
      return;
    }
    readoutEl.textContent = `Last point: ${formatCustomCurveValue(point.current)} A @ ${formatCustomCurveValue(point.time)} s`;
  };

  const CURSOR_DEFAULT_TEXT = 'Cursor: Hover over the plot to see amperage and time.';
  const CURSOR_AXIS_PROMPT = 'Cursor: Enter valid axis bounds to enable readout.';

  const formatZoomValue = value => `${Math.round(value * 100)}%`;

  const applyZoom = () => {
    if (!canvas) return;
    const width = canvas.width || 720;
    const height = canvas.height || 480;
    canvas.style.width = `${Math.round(width * zoomLevel)}px`;
    canvas.style.height = `${Math.round(height * zoomLevel)}px`;
  };

  const updateZoomDisplay = () => {
    if (zoomSliderEl) zoomSliderEl.value = String(Math.round(zoomLevel * 100));
    if (zoomValueEl) zoomValueEl.textContent = formatZoomValue(zoomLevel);
  };

  const updateHoverTooltip = pointer => {
    if (!hoverTooltipEl || !canvasContainer) return;
    if (!pointer) {
      hoverTooltipEl.classList.remove('is-visible');
      return;
    }
    const metrics = computePlotMetrics();
    if (!metrics.axisValid) {
      hoverTooltipEl.classList.remove('is-visible');
      return;
    }
    const dataPoint = pixelToData(pointer.canvasX, pointer.canvasY, metrics);
    if (!dataPoint) {
      hoverTooltipEl.classList.remove('is-visible');
      return;
    }
    const containerRect = canvasContainer.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height) {
      hoverTooltipEl.classList.remove('is-visible');
      return;
    }
    const currentText = `${formatCustomCurveValue(dataPoint.current)} A`;
    const timeText = `${formatCustomCurveValue(dataPoint.time)} s`;
    hoverTooltipEl.innerHTML = `<span>${escapeHtml(currentText)}</span><span>${escapeHtml(timeText)}</span>`;
    const margin = 16;
    const containerWidth = canvasContainer.offsetWidth || containerRect.width;
    const containerHeight = canvasContainer.offsetHeight || containerRect.height;
    let left = pointer.clientX - containerRect.left + margin;
    let top = pointer.clientY - containerRect.top + margin;
    const tooltipWidth = hoverTooltipEl.offsetWidth || 0;
    const tooltipHeight = hoverTooltipEl.offsetHeight || 0;
    if (left + tooltipWidth > containerWidth - margin) {
      left = Math.max(margin, pointer.clientX - containerRect.left - margin - tooltipWidth);
    }
    if (top + tooltipHeight > containerHeight - margin) {
      top = Math.max(margin, pointer.clientY - containerRect.top - margin - tooltipHeight);
    }
    hoverTooltipEl.style.left = `${left}px`;
    hoverTooltipEl.style.top = `${top}px`;
    hoverTooltipEl.classList.add('is-visible');
  };

  const setZoomLevel = value => {
    const next = clamp(value, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(next - zoomLevel) < 0.0001) return;
    zoomLevel = next;
    applyZoom();
    if (lastPointer) {
      const pointer = getPointerFromClient(lastPointer.clientX, lastPointer.clientY);
      lastPointer = pointer;
    }
    updateZoomDisplay();
    refreshCanvas();
    if (lastPointer) updateHoverTooltip(lastPointer);
    else updateHoverTooltip(null);
  };

  const adjustZoom = delta => {
    setZoomLevel(zoomLevel + delta);
  };

  const handleZoomWheel = event => {
    if (!event || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    const delta = Number(event.deltaY) || 0;
    if (!delta) return;
    const direction = delta > 0 ? -1 : 1;
    adjustZoom(direction * ZOOM_STEP);
  };

  const updateCursorReadout = pointer => {
    if (!cursorReadoutEl) return;
    if (!pointer) {
      cursorReadoutEl.textContent = CURSOR_DEFAULT_TEXT;
      updateHoverTooltip(null);
      return;
    }
    const metrics = computePlotMetrics();
    if (!metrics.axisValid) {
      cursorReadoutEl.textContent = CURSOR_AXIS_PROMPT;
      updateHoverTooltip(null);
      return;
    }
    const dataPoint = pixelToData(pointer.canvasX, pointer.canvasY, metrics);
    if (!dataPoint) {
      cursorReadoutEl.textContent = CURSOR_AXIS_PROMPT;
      updateHoverTooltip(null);
      return;
    }
    cursorReadoutEl.textContent = `Cursor: ${formatCustomCurveValue(dataPoint.current)} A @ ${formatCustomCurveValue(dataPoint.time)} s`;
    updateHoverTooltip(pointer);
  };

  const getSettingOption = field => CUSTOM_CURVE_SETTING_CONFIG.get(field) || null;

  const updateSettingValue = (field, value) => {
    const option = getSettingOption(field);
    if (!option) return;
    if (option.numeric) {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue) && numberValue >= 0) {
        customSettings[field] = numberValue;
      } else {
        delete customSettings[field];
      }
    } else if (value !== undefined && value !== null) {
      const strValue = String(value).trim();
      if (strValue) {
        customSettings[field] = strValue;
      } else {
        delete customSettings[field];
      }
    } else {
      delete customSettings[field];
    }
  };

  const bindSettingInput = (field, input) => {
    if (!input) return;
    const option = getSettingOption(field);
    if (!option) return;
    const existingValue = customSettings[field];
    if (existingValue !== undefined && existingValue !== null) {
      input.value = option.numeric
        ? formatSettingValue(Number(existingValue))
        : String(existingValue);
    }
    const handler = () => {
      updateSettingValue(field, option.numeric ? Number(input.value) : input.value);
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  };

  const getPointerFromClient = (clientX, clientY) => {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    if (!rect.width || !rect.height) return null;
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    if (offsetX < 0 || offsetY < 0 || offsetX > rect.width || offsetY > rect.height) return null;
    const scaleX = canvas.width / rect.width || 1;
    const scaleY = canvas.height / rect.height || 1;
    return {
      canvasX: offsetX * scaleX,
      canvasY: offsetY * scaleY,
      clientX,
      clientY
    };
  };

  const updateReferenceToggleState = () => {
    if (!referenceToggleInput) return;
    referenceToggleInput.disabled = !referenceImage;
    if (!referenceImage) {
      referenceToggleInput.checked = false;
    } else {
      referenceToggleInput.checked = showReferenceImage;
    }
  };

  const drawAxisOverlay = metrics => {
    if (!ctx || !metrics?.axisValid) {
      return { verticalMajor: [], horizontalMajor: [] };
    }
    const axis = metrics.axisValues;
    const vertical = generateLogGrid(axis.currentMin, axis.currentMax);
    const horizontal = generateLogGrid(axis.timeMin, axis.timeMax);
    const isDarkMode = document.body?.classList?.contains('dark-mode');
    const minorStroke = isDarkMode ? 'rgba(96, 165, 250, 0.25)' : 'rgba(30, 64, 175, 0.25)';
    const majorStroke = isDarkMode ? 'rgba(96, 165, 250, 0.6)' : 'rgba(30, 64, 175, 0.55)';
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = minorStroke;
    const drawVerticalLine = value => {
      const top = dataToPixel({ current: value, time: axis.timeMin }, metrics);
      const bottom = dataToPixel({ current: value, time: axis.timeMax }, metrics);
      if (!top || !bottom) return;
      ctx.beginPath();
      ctx.moveTo(top.x, metrics.plotTop);
      ctx.lineTo(top.x, metrics.plotTop + metrics.plotHeight);
      ctx.stroke();
    };
    const drawHorizontalLine = value => {
      const left = dataToPixel({ current: axis.currentMin, time: value }, metrics);
      const right = dataToPixel({ current: axis.currentMax, time: value }, metrics);
      if (!left || !right) return;
      ctx.beginPath();
      ctx.moveTo(metrics.plotLeft, left.y);
      ctx.lineTo(metrics.plotLeft + metrics.plotWidth, left.y);
      ctx.stroke();
    };
    vertical.minor.forEach(drawVerticalLine);
    horizontal.minor.forEach(drawHorizontalLine);
    ctx.setLineDash([]);
    ctx.strokeStyle = majorStroke;
    ctx.lineWidth = 1.5;
    vertical.major.forEach(drawVerticalLine);
    horizontal.major.forEach(drawHorizontalLine);
    ctx.restore();
    return { verticalMajor: vertical.major, horizontalMajor: horizontal.major };
  };

  const clearAxisTickLabels = () => {
    if (axisTickContainerX) axisTickContainerX.innerHTML = '';
    if (axisTickContainerY) axisTickContainerY.innerHTML = '';
  };

  const updateAxisTickLabels = (metrics, verticalTicks = [], horizontalTicks = []) => {
    if (!axisTickContainerX || !axisTickContainerY || !canvasContainer || !canvasScrollEl || !canvas) {
      return;
    }
    const shouldShow = showAxisOverlay && metrics?.axisValid;
    axisTickContainerX.style.display = shouldShow ? 'block' : 'none';
    axisTickContainerY.style.display = shouldShow ? 'block' : 'none';
    clearAxisTickLabels();
    if (!shouldShow) {
      return;
    }
    const docRef = axisTickContainerX.ownerDocument || document;
    const containerRect = canvasContainer.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const scrollLeft = canvasScrollEl.scrollLeft || 0;
    const scrollTop = canvasScrollEl.scrollTop || 0;
    const offsetLeft = canvasRect.left - containerRect.left + scrollLeft;
    const offsetTop = canvasRect.top - containerRect.top + scrollTop;
    const intrinsicWidth = canvas.width || canvasRect.width || 1;
    const intrinsicHeight = canvas.height || canvasRect.height || 1;
    const scaleX = canvasRect.width ? canvasRect.width / intrinsicWidth : 1;
    const scaleY = canvasRect.height ? canvasRect.height / intrinsicHeight : 1;
    const axis = metrics.axisValues;
    const labelYOffset = 18;
    const labelXOffset = 18;
    verticalTicks.forEach(value => {
      const point = dataToPixel({ current: value, time: axis.timeMin }, metrics);
      if (!point) return;
      const label = docRef.createElement('div');
      label.className = 'custom-curve-axis-tick custom-curve-axis-tick-x';
      label.textContent = formatSettingValue(value);
      const displayX = offsetLeft + point.x * scaleX;
      const displayY = offsetTop + (metrics.plotTop + metrics.plotHeight) * scaleY + labelYOffset;
      label.style.left = `${displayX}px`;
      label.style.top = `${displayY}px`;
      axisTickContainerX.appendChild(label);
    });
    horizontalTicks.forEach(value => {
      const point = dataToPixel({ current: axis.currentMin, time: value }, metrics);
      if (!point) return;
      const label = docRef.createElement('div');
      label.className = 'custom-curve-axis-tick custom-curve-axis-tick-y';
      label.textContent = formatSettingValue(value);
      const displayLeft = offsetLeft + metrics.plotLeft * scaleX - labelXOffset;
      const displayTop = offsetTop + point.y * scaleY;
      label.style.left = `${displayLeft}px`;
      label.style.top = `${displayTop}px`;
      axisTickContainerY.appendChild(label);
    });
  };

  const getAxisValues = () => {
    const result = readCustomCurveAxes(axisInputs, axes);
    if (result.valid) {
      Object.assign(axes, result.values);
    }
    return result;
  };

  const getBoundValues = () => {
    const values = readCustomCurveBounds(boundInputs, bounds);
    Object.assign(bounds, values);
    return values;
  };

  const computePlotMetrics = () => {
    const axisResult = getAxisValues();
    const boundValues = getBoundValues();
    return computeCustomCurvePlotMetrics({
      canvas,
      axisValues: axisResult.values,
      axisValid: canvas ? axisResult.valid : true,
      bounds: boundValues
    });
  };

  const configureCanvasSize = image => {
    if (!canvas) return;
    if (image && image.width && image.height) {
      const maxWidth = 960;
      const maxHeight = 640;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = Math.max(480, Math.round(image.width * scale));
      const height = Math.max(360, Math.round(image.height * scale));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    } else {
      canvas.width = 720;
      canvas.height = 480;
      canvas.style.width = '720px';
      canvas.style.height = '480px';
    }
    applyZoom();
  };

  const refreshCanvas = () => {
    if (!canvas || !ctx) return;
    const metrics = computePlotMetrics();
    const { width, height, plotLeft, plotTop, plotWidth, plotHeight } = metrics;
    const isDarkMode = document.body?.classList?.contains('dark-mode');
    const canvasBackground = isDarkMode ? '#0f172a' : '#f8fafc';
    const plotBackground = isDarkMode ? '#1e293b' : '#f1f5f9';
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = canvasBackground;
    ctx.fillRect(0, 0, width, height);
    if (referenceImage && showReferenceImage) {
      ctx.drawImage(referenceImage, 0, 0, width, height);
    } else {
      ctx.fillStyle = plotBackground;
      ctx.fillRect(plotLeft, plotTop, plotWidth, plotHeight);
    }
    ctx.save();
    ctx.fillStyle = canvasBackground;
    ctx.fillRect(0, 0, width, plotTop);
    ctx.fillRect(0, plotTop + plotHeight, width, Math.max(0, height - (plotTop + plotHeight)));
    ctx.fillRect(0, plotTop, plotLeft, plotHeight);
    ctx.fillRect(plotLeft + plotWidth, plotTop, Math.max(0, width - (plotLeft + plotWidth)), plotHeight);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);
    ctx.restore();
    const overlayTicks = showAxisOverlay && metrics.axisValid
      ? drawAxisOverlay(metrics)
      : { verticalMajor: [], horizontalMajor: [] };
    updateAxisTickLabels(metrics, overlayTicks.verticalMajor, overlayTicks.horizontalMajor);
    if (axisTitleXEl && axisTitleYEl && canvasContainer && canvasScrollEl) {
      const shouldShow = showAxisOverlay && metrics.axisValid;
      axisTitleXEl.style.display = shouldShow ? 'block' : 'none';
      axisTitleYEl.style.display = shouldShow ? 'block' : 'none';
      if (shouldShow) {
        const containerRect = canvasContainer.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const scrollLeft = canvasScrollEl.scrollLeft || 0;
        const scrollTop = canvasScrollEl.scrollTop || 0;
        const offsetLeft = canvasRect.left - containerRect.left + scrollLeft;
        const offsetTop = canvasRect.top - containerRect.top + scrollTop;
        const canvasWidth = canvasRect.width || canvas.width || 0;
        const canvasHeight = canvasRect.height || canvas.height || 0;
        const axisTitleXLeft = offsetLeft + canvasWidth / 2;
        const baseAxisTitleXTop = offsetTop + canvasHeight + 24;
        const maxAxisTitleXTop = canvasScrollEl.scrollHeight + 48;
        axisTitleXEl.style.left = `${axisTitleXLeft}px`;
        axisTitleXEl.style.top = `${Math.min(baseAxisTitleXTop, maxAxisTitleXTop)}px`;
        axisTitleXEl.style.transform = 'translate(-50%, 0)';
        const desiredYLeft = offsetLeft - 32;
        const axisYWidth = axisTitleYEl.offsetWidth || 0;
        const minYLeft = axisYWidth ? axisYWidth / 2 : 32;
        let resolvedLeft = Math.max(minYLeft, desiredYLeft);
        let transform = 'translate(-100%, -50%) rotate(-90deg)';
        if (resolvedLeft === minYLeft) {
          transform = 'translate(-50%, -50%) rotate(-90deg)';
        }
        axisTitleYEl.style.left = `${resolvedLeft}px`;
        axisTitleYEl.style.top = `${offsetTop + canvasHeight / 2}px`;
        axisTitleYEl.style.transform = transform;
      }
    }
    if (metrics.axisValid) {
      if (workingPoints.length >= 2) {
        ctx.save();
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        let started = false;
        workingPoints.forEach(point => {
          const pixel = dataToPixel(point, metrics);
          if (!pixel) return;
          if (!started) {
            ctx.beginPath();
            ctx.moveTo(pixel.x, pixel.y);
            started = true;
          } else {
            ctx.lineTo(pixel.x, pixel.y);
          }
        });
        if (started) ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.fillStyle = '#1d4ed8';
      workingPoints.forEach(point => {
        const pixel = dataToPixel(point, metrics);
        if (!pixel) return;
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    if (lastCapturedPoint) {
      const highlight = dataToPixel(lastCapturedPoint, metrics);
      if (highlight) {
        ctx.save();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(highlight.x, highlight.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (lastPointer) {
      updateCursorReadout(lastPointer);
    } else {
      updateCursorReadout(null);
    }
  };

  const refreshPointTable = ({ highlight } = {}) => {
    if (!tableBody) return lastCapturedPoint;
    const resolved = resolveCustomCurvePointHighlight(workingPoints, highlight, lastCapturedPoint);
    workingPoints = resolved.points;
    tableBody.innerHTML = '';
    if (!workingPoints.length) {
      const row = doc.createElement('tr');
      const cell = doc.createElement('td');
      cell.colSpan = 3;
      cell.className = 'custom-curve-table-empty';
      cell.textContent = 'No curve points defined. Capture points or add them manually to continue.';
      row.appendChild(cell);
      tableBody.appendChild(row);
      lastCapturedPoint = null;
      commitActiveVariant();
      updatePointCountLabel();
      refreshCanvas();
      updateReadout(null);
      return lastCapturedPoint;
    }
    workingPoints.forEach((point, index) => {
      const row = doc.createElement('tr');
      row.dataset.index = String(index);

      const currentCell = doc.createElement('td');
      const currentInput = doc.createElement('input');
      currentInput.type = 'number';
      currentInput.min = '0';
      currentInput.step = '0.001';
      currentInput.value = formatCustomCurveValue(point.current);
      currentInput.addEventListener('input', () => {
        workingPoints[index].current = Number(currentInput.value);
      });
      currentInput.addEventListener('change', () => {
        const nextCurrent = Number(currentInput.value);
        workingPoints[index].current = nextCurrent;
        refreshPointTable({ highlight: { current: nextCurrent, time: workingPoints[index].time } });
      });

      currentCell.appendChild(currentInput);

      const timeCell = doc.createElement('td');
      const timeInput = doc.createElement('input');
      timeInput.type = 'number';
      timeInput.min = '0';
      timeInput.step = '0.001';
      timeInput.value = formatCustomCurveValue(point.time);
      timeInput.addEventListener('input', () => {
        workingPoints[index].time = Number(timeInput.value);
      });
      timeInput.addEventListener('change', () => {
        const nextTime = Number(timeInput.value);
        workingPoints[index].time = nextTime;
        refreshPointTable({ highlight: { current: workingPoints[index].current, time: nextTime } });
      });
      timeCell.appendChild(timeInput);

      const actionCell = doc.createElement('td');
      const removeBtn = doc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'custom-curve-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        workingPoints.splice(index, 1);
        refreshPointTable();
      });
      actionCell.appendChild(removeBtn);

      row.append(currentCell, timeCell, actionCell);
      tableBody.appendChild(row);
    });

    lastCapturedPoint = resolved.lastCapturedPoint;

    commitActiveVariant();
    updatePointCountLabel();
    refreshCanvas();
    updateReadout(lastCapturedPoint);
    return lastCapturedPoint;
  };

  const addPoint = (current, time, { announce = true } = {}) => {
    if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(time) || time <= 0) {
      return null;
    }
    workingPoints.push({ current, time });
    const captured = refreshPointTable({ highlight: { current, time } });
    if (announce) {
      updateStatus(`Added point ${formatCustomCurveValue(current)} A @ ${formatCustomCurveValue(time)} s.`, 'info');
    }
    return captured;
  };

  const handleManualAdd = () => {
    const current = Number(manualCurrentInput.value);
    const time = Number(manualTimeInput.value);
    if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(time) || time <= 0) {
      updateStatus('Provide positive values for current and time before adding the point.', 'error');
      return;
    }
    addPoint(current, time);
    manualCurrentInput.value = '';
    manualTimeInput.value = '';
    manualCurrentInput.focus();
  };

  const handleCanvasClick = event => {
    if (!canvas) return;
    const pointer = getPointerFromClient(event.clientX, event.clientY);
    if (!pointer) return;
    lastPointer = pointer;
    const metrics = computePlotMetrics();
    const point = pixelToData(pointer.canvasX, pointer.canvasY, metrics);
    if (!point) {
      updateStatus('Provide valid axis bounds before digitizing points.', 'error');
      return;
    }
    const captured = addPoint(point.current, point.time, { announce: true });
    if (captured) {
      lastCapturedPoint = captured;
    }
    updateCursorReadout(pointer);
  };

  const handleCanvasHover = event => {
    const pointer = getPointerFromClient(event.clientX, event.clientY);
    if (!pointer) {
      lastPointer = null;
      updateCursorReadout(null);
      return;
    }
    lastPointer = pointer;
    updateCursorReadout(pointer);
  };

  const handleCanvasLeave = () => {
    lastPointer = null;
    updateCursorReadout(null);
    if (hoverTooltipEl) hoverTooltipEl.classList.remove('is-visible');
  };

  const resetReference = () => {
    referenceImage = null;
    lastCapturedPoint = null;
    showReferenceImage = true;
    if (referenceObjectUrl) {
      URL.revokeObjectURL(referenceObjectUrl);
      referenceObjectUrl = null;
    }
    if (pendingPdfUrl) {
      URL.revokeObjectURL(pendingPdfUrl);
      pendingPdfUrl = null;
    }
    configureCanvasSize(null);
    refreshCanvas();
    updateReadout(null);
    updateReferenceToggleState();
  };

  const loadImageFromSource = src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load reference image.'));
    image.src = src;
  });

  const handleReferenceFile = async file => {
    if (!file) return;
    updateStatus('Loading reference file…', 'info');
    try {
      resetReference();
      const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
      if (isPdf) {
        const pdfModule = await ensurePdfJs();
        pendingPdfUrl = URL.createObjectURL(file);
        const pdf = await pdfModule.getDocument({
          url: pendingPdfUrl,
          isEvalSupported: false
        }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.6 });
        const tempCanvas = doc.createElement('canvas');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        const tempCtx = tempCanvas.getContext('2d');
        await page.render({ canvasContext: tempCtx, viewport }).promise;
        const dataUrl = tempCanvas.toDataURL('image/png');
        referenceImage = await loadImageFromSource(dataUrl);
      } else {
        referenceObjectUrl = URL.createObjectURL(file);
        referenceImage = await loadImageFromSource(referenceObjectUrl);
      }
      configureCanvasSize(referenceImage);
      showReferenceImage = true;
      updateReferenceToggleState();
      refreshCanvas();
      updateStatus('Reference loaded. Click within the plot area to capture points.', 'info');
    } catch (err) {
      console.error('Failed to load reference', err);
      updateStatus('Unable to load the reference file. Try converting the PDF to an image if the issue persists.', 'error');
      resetReference();
    } finally {
      if (pendingPdfUrl) {
        URL.revokeObjectURL(pendingPdfUrl);
        pendingPdfUrl = null;
      }
      if (referenceObjectUrl) {
        URL.revokeObjectURL(referenceObjectUrl);
        referenceObjectUrl = null;
      }
    }
    updateReferenceToggleState();
  };

  const clearPoints = () => {
    workingPoints = [];
    refreshPointTable();
    updateStatus('Removed all curve points.', 'info');
  };

  const setAxisInputValues = () => {
    axisKeys.forEach(key => {
      if (axisInputs[key]) {
        axisInputs[key].value = axes[key];
      }
    });
  };

  const setBoundInputValues = () => {
    boundKeys.forEach(key => {
      if (boundInputs[key]) {
        boundInputs[key].value = bounds[key];
      }
    });
  };

  const result = await openModal({
    title: isEditing ? 'Edit Custom Curve' : 'Create Custom Curve',
    primaryText: isEditing ? 'Save Curve' : 'Add Curve',

    secondaryText: 'Cancel',
    resizable: true,
    defaultWidth: 920,
    render(body, controls) {
      const form = doc.createElement('form');
      form.className = 'custom-curve-form';
      controls.registerForm(form);

      const detailsSection = doc.createElement('section');
      detailsSection.className = 'custom-curve-section';
      const detailsHeading = doc.createElement('h3');
      detailsHeading.textContent = 'Curve Details';
      const detailsGrid = doc.createElement('div');
      detailsGrid.className = 'custom-curve-grid';

      const nameLabel = doc.createElement('label');
      nameLabel.textContent = 'Curve name';
      nameInputEl = doc.createElement('input');
      nameInputEl.type = 'text';
      nameInputEl.required = true;
      nameInputEl.value = existing?.name || '';
      nameLabel.appendChild(nameInputEl);

      const manufacturerLabel = doc.createElement('label');
      manufacturerLabel.textContent = 'Manufacturer (optional)';
      manufacturerInputEl = doc.createElement('input');
      manufacturerInputEl.type = 'text';
      manufacturerInputEl.value = existing?.manufacturer || '';
      manufacturerLabel.appendChild(manufacturerInputEl);

      const deviceTypeLabel = doc.createElement('label');
      deviceTypeLabel.textContent = 'Device type';
      deviceTypeInputEl = doc.createElement('select');
      const typeOptions = [CUSTOM_CURVE_CATEGORY, ...Array.from(PROTECTIVE_TYPES).sort()];
      typeOptions.forEach(typeValue => {
        const option = doc.createElement('option');
        option.value = typeValue;
        option.textContent = typeValue
          .split(/[_\s]+/)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
        deviceTypeInputEl.appendChild(option);
      });
      if (existing?.deviceType && !typeOptions.includes(existing.deviceType)) {
        const customOption = doc.createElement('option');
        customOption.value = existing.deviceType;
        customOption.textContent = existing.deviceType
          .split(/[_\s]+/)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
        deviceTypeInputEl.appendChild(customOption);
      }
      deviceTypeInputEl.value = existing?.deviceType && deviceTypeInputEl.querySelector(`option[value="${existing.deviceType}"]`)
        ? existing.deviceType
        : CUSTOM_CURVE_CATEGORY;
      deviceTypeLabel.appendChild(deviceTypeInputEl);

      const catalogNumberLabel = doc.createElement('label');
      catalogNumberLabel.textContent = 'Exact catalog / trip-unit identifier';
      catalogNumberInputEl = doc.createElement('input');
      catalogNumberInputEl.type = 'text';
      catalogNumberInputEl.placeholder = 'Required to promote a reviewed device';
      catalogNumberInputEl.value = existing?.catalogNumber || '';
      catalogNumberLabel.appendChild(catalogNumberInputEl);

      detailsGrid.append(nameLabel, manufacturerLabel, deviceTypeLabel, catalogNumberLabel);

      const descriptionLabel = doc.createElement('label');
      descriptionLabel.textContent = 'Description (optional)';
      descriptionInputEl = doc.createElement('textarea');
      descriptionInputEl.rows = 3;
      descriptionInputEl.value = existing?.description || '';
      descriptionLabel.appendChild(descriptionInputEl);

      const settingsFieldset = doc.createElement('fieldset');
      settingsFieldset.className = 'custom-curve-fieldset';
      const settingsLegend = doc.createElement('legend');
      settingsLegend.textContent = 'Adjustable settings (optional)';
      const settingsHint = doc.createElement('p');
      settingsHint.className = 'custom-curve-settings-hint';
      settingsHint.textContent = 'Provide breaker pickup, delay, and instantaneous values when applicable. Leave fields blank to omit them.';
      const settingsGrid = doc.createElement('div');
      settingsGrid.className = 'custom-curve-settings-grid';
      CUSTOM_CURVE_SETTING_OPTIONS.forEach(option => {
        const label = doc.createElement('label');
        label.className = 'custom-curve-setting';
        const title = doc.createElement('span');
        title.className = 'custom-curve-setting-title';
        title.textContent = option.label;
        const input = doc.createElement('input');
        input.type = option.numeric ? 'number' : 'text';
        if (option.numeric) {
          input.min = '0';
          input.step = 'any';
        }
        input.placeholder = option.unit ? option.unit : 'Value';
        label.appendChild(title);
        if (option.unit) {
          const unitEl = doc.createElement('span');
          unitEl.className = 'custom-curve-setting-unit';
          unitEl.textContent = option.unit;
          label.appendChild(unitEl);
        }
        label.appendChild(input);
        bindSettingInput(option.field, input);
        settingsGrid.appendChild(label);
      });
      settingsFieldset.append(settingsLegend, settingsHint, settingsGrid);

      detailsSection.append(detailsHeading, detailsGrid, descriptionLabel, settingsFieldset);

      const evidenceSection = doc.createElement('section');
      evidenceSection.className = 'custom-curve-section';
      const evidenceHeading = doc.createElement('h3');
      evidenceHeading.textContent = 'Source Evidence and Review';
      const evidenceHint = doc.createElement('p');
      evidenceHint.className = 'custom-curve-settings-hint';
      evidenceHint.textContent = 'Record the exact published curve before promoting this entry. Screening-only curves may be saved with partial evidence.';
      const evidenceGrid = doc.createElement('div');
      evidenceGrid.className = 'custom-curve-grid';
      const createEvidenceInput = (labelText, value = '', placeholder = '') => {
        const label = doc.createElement('label');
        label.textContent = labelText;
        const input = doc.createElement('input');
        input.type = 'text';
        input.value = value;
        input.placeholder = placeholder;
        label.appendChild(input);
        evidenceGrid.appendChild(label);
        return input;
      };
      sourceDocumentInputEl = createEvidenceInput('Source document', existing?.curveEvidence?.document || '', 'Manufacturer publication title or number');
      sourceRevisionInputEl = createEvidenceInput('Revision or date', existing?.curveEvidence?.revision || existing?.curveEvidence?.date || '', 'Revision, issue date, or publication date');
      sourceCurveInputEl = createEvidenceInput('Curve number or page', existing?.curveEvidence?.curveNumber || existing?.curveEvidence?.page || '', 'Exact curve reference');
      extractionMethodInputEl = createEvidenceInput('Extraction method', existing?.curveEvidence?.extractionMethod || '', 'e.g., manufacturer spreadsheet');
      reviewerInputEl = createEvidenceInput('Reviewer', existing?.curveEvidence?.reviewer || '', 'Independent reviewer name or role');

      const ratingFieldset = doc.createElement('fieldset');
      ratingFieldset.className = 'custom-curve-fieldset';
      const ratingLegend = doc.createElement('legend');
      ratingLegend.textContent = 'Interrupting rating (breakers and fuses)';
      const ratingHint = doc.createElement('p');
      ratingHint.className = 'custom-curve-settings-hint';
      ratingHint.textContent = 'A voltage-specific AC interrupting rating is required to promote an interrupting device.';
      const ratingGrid = doc.createElement('div');
      ratingGrid.className = 'custom-curve-grid';
      const ratingVoltageLabel = doc.createElement('label');
      ratingVoltageLabel.textContent = 'Voltage (VAC)';
      ratingVoltageInputEl = doc.createElement('input');
      ratingVoltageInputEl.type = 'number';
      ratingVoltageInputEl.min = '0';
      ratingVoltageInputEl.step = 'any';
      ratingVoltageInputEl.value = existing?.interruptingRatings?.[0]?.voltageVac || '';
      ratingVoltageLabel.appendChild(ratingVoltageInputEl);
      const ratingCurrentLabel = doc.createElement('label');
      ratingCurrentLabel.textContent = 'Interrupting rating (kA)';
      ratingCurrentInputEl = doc.createElement('input');
      ratingCurrentInputEl.type = 'number';
      ratingCurrentInputEl.min = '0';
      ratingCurrentInputEl.step = 'any';
      ratingCurrentInputEl.value = existing?.interruptingRatings?.[0]?.currentKA || '';
      ratingCurrentLabel.appendChild(ratingCurrentInputEl);
      ratingGrid.append(ratingVoltageLabel, ratingCurrentLabel);
      ratingFieldset.append(ratingLegend, ratingHint, ratingGrid);

      const reviewedLabel = doc.createElement('label');
      reviewedLabel.className = 'custom-curve-toggle';
      reviewedInputEl = doc.createElement('input');
      reviewedInputEl.type = 'checkbox';
      reviewedInputEl.checked = existing?.libraryStatus === 'calculation_ready';
      reviewedLabel.append(reviewedInputEl, doc.createTextNode('Promote as calculation-ready after independent source review'));

      evidenceSection.append(evidenceHeading, evidenceHint, evidenceGrid, ratingFieldset, reviewedLabel);

      const referenceSection = doc.createElement('section');
      referenceSection.className = 'custom-curve-section';
      const referenceHeading = doc.createElement('h3');
      referenceHeading.textContent = 'Reference Mapping';
      const referenceGrid = doc.createElement('div');
      referenceGrid.className = 'custom-curve-reference';

      const referenceControls = doc.createElement('div');
      referenceControls.className = 'custom-curve-reference-controls';

      const uploadButton = doc.createElement('button');
      uploadButton.type = 'button';
      uploadButton.textContent = 'Upload PDF or image';
      const uploadInput = doc.createElement('input');
      uploadInput.type = 'file';
      uploadInput.accept = '.pdf,.png,.jpg,.jpeg,.gif,.webp';
      uploadInput.className = 'visually-hidden';
      uploadButton.addEventListener('click', () => uploadInput.click());
      uploadInput.addEventListener('change', () => {
        const [file] = uploadInput.files || [];
        handleReferenceFile(file);
        uploadInput.value = '';
      });

      const clearRefButton = doc.createElement('button');
      clearRefButton.type = 'button';
      clearRefButton.textContent = 'Clear reference';
      clearRefButton.addEventListener('click', () => {
        resetReference();
        updateStatus('Reference cleared.', 'info');
      });

      const fileControls = doc.createElement('div');
      fileControls.className = 'custom-curve-file-controls';
      fileControls.append(uploadButton, clearRefButton);

      const referenceToggleLabel = doc.createElement('label');
      referenceToggleLabel.className = 'custom-curve-toggle';
      referenceToggleInput = doc.createElement('input');
      referenceToggleInput.type = 'checkbox';
      referenceToggleInput.checked = showReferenceImage;
      referenceToggleInput.disabled = !referenceImage;
      referenceToggleInput.addEventListener('change', () => {
        showReferenceImage = referenceToggleInput.checked;
        refreshCanvas();
      });

      referenceToggleLabel.append(referenceToggleInput, doc.createTextNode('Show uploaded reference'));

      const axisFieldset = doc.createElement('fieldset');
      axisFieldset.className = 'custom-curve-fieldset';
      const axisLegend = doc.createElement('legend');
      axisLegend.textContent = 'Axis bounds';
      axisFieldset.appendChild(axisLegend);
      axisKeys.forEach(key => {
        const label = doc.createElement('label');
        label.textContent = key;
        const input = doc.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = 'any';
        axisInputs[key] = input;
        label.appendChild(input);
        input.addEventListener('input', () => refreshCanvas());
        input.addEventListener('change', () => {
          getAxisValues();
          refreshCanvas();
        });
        axisFieldset.appendChild(label);
      });

      const boundsFieldset = doc.createElement('fieldset');
      boundsFieldset.className = 'custom-curve-fieldset';
      const boundsLegend = doc.createElement('legend');
      boundsLegend.textContent = 'Plot padding (px)';
      boundsFieldset.appendChild(boundsLegend);
      boundKeys.forEach(key => {
        const label = doc.createElement('label');
        label.textContent = key;
        const input = doc.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        boundInputs[key] = input;
        label.appendChild(input);
        input.addEventListener('input', () => refreshCanvas());
        input.addEventListener('change', () => {
          getBoundValues();
          refreshCanvas();
        });
        boundsFieldset.appendChild(label);
      });

      const axisOverlayLabel = doc.createElement('label');
      axisOverlayLabel.className = 'custom-curve-toggle';
      axisOverlayInput = doc.createElement('input');
      axisOverlayInput.type = 'checkbox';
      axisOverlayInput.checked = showAxisOverlay;
      axisOverlayInput.addEventListener('change', () => {
        showAxisOverlay = axisOverlayInput.checked;
        refreshCanvas();
      });
      axisOverlayLabel.append(axisOverlayInput, doc.createTextNode('Show generated axes overlay'));

      const zoomControls = doc.createElement('div');
      zoomControls.className = 'custom-curve-zoom-controls';

      const zoomHeader = doc.createElement('div');
      zoomHeader.className = 'custom-curve-zoom-header';
      const zoomLabel = doc.createElement('span');
      zoomLabel.className = 'custom-curve-zoom-label';
      zoomLabel.textContent = 'Zoom';
      zoomValueEl = doc.createElement('span');
      zoomValueEl.className = 'custom-curve-zoom-display';
      zoomHeader.append(zoomLabel, zoomValueEl);

      const zoomRow = doc.createElement('div');
      zoomRow.className = 'custom-curve-zoom-row';
      const zoomOutBtn = doc.createElement('button');
      zoomOutBtn.type = 'button';
      zoomOutBtn.className = 'custom-curve-zoom-button';
      zoomOutBtn.textContent = '−';
      zoomOutBtn.setAttribute('aria-label', 'Zoom out');
      zoomOutBtn.addEventListener('click', () => adjustZoom(-ZOOM_STEP));

      zoomSliderEl = doc.createElement('input');
      zoomSliderEl.type = 'range';
      zoomSliderEl.className = 'custom-curve-zoom-slider';
      zoomSliderEl.min = String(Math.round(ZOOM_MIN * 100));
      zoomSliderEl.max = String(Math.round(ZOOM_MAX * 100));
      zoomSliderEl.step = String(Math.round(ZOOM_STEP * 100));
      zoomSliderEl.value = String(Math.round(zoomLevel * 100));
      zoomSliderEl.setAttribute('aria-label', 'Zoom level');
      const syncZoom = () => {
        const parsed = Number(zoomSliderEl.value);
        if (Number.isFinite(parsed)) setZoomLevel(parsed / 100);
      };
      zoomSliderEl.addEventListener('input', syncZoom);
      zoomSliderEl.addEventListener('change', syncZoom);

      const zoomInBtn = doc.createElement('button');
      zoomInBtn.type = 'button';
      zoomInBtn.className = 'custom-curve-zoom-button';
      zoomInBtn.textContent = '+';
      zoomInBtn.setAttribute('aria-label', 'Zoom in');
      zoomInBtn.addEventListener('click', () => adjustZoom(ZOOM_STEP));

      zoomRow.append(zoomOutBtn, zoomSliderEl, zoomInBtn);

      const zoomResetBtn = doc.createElement('button');
      zoomResetBtn.type = 'button';
      zoomResetBtn.className = 'custom-curve-zoom-reset';
      zoomResetBtn.textContent = 'Reset';
      zoomResetBtn.addEventListener('click', () => setZoomLevel(ZOOM_DEFAULT));

      zoomControls.append(zoomHeader, zoomRow, zoomResetBtn);

      const displayToggleGroup = doc.createElement('div');
      displayToggleGroup.className = 'custom-curve-display-toggles';
      displayToggleGroup.append(referenceToggleLabel, axisOverlayLabel);

      const displayControls = doc.createElement('div');
      displayControls.className = 'custom-curve-display-controls';
      displayControls.append(displayToggleGroup, zoomControls);

      statusEl = doc.createElement('p');
      statusEl.className = 'custom-curve-status';
      cursorReadoutEl = doc.createElement('p');
      cursorReadoutEl.className = 'custom-curve-readout custom-curve-cursor';
      cursorReadoutEl.textContent = CURSOR_DEFAULT_TEXT;
      readoutEl = doc.createElement('p');
      readoutEl.className = 'custom-curve-readout';

      referenceControls.append(
        fileControls,
        uploadInput,
        axisFieldset,
        boundsFieldset,
        statusEl,
        cursorReadoutEl,
        readoutEl
      );

      canvasContainer = doc.createElement('div');
      canvasContainer.className = 'custom-curve-canvas-container';
      canvasScrollEl = doc.createElement('div');
      canvasScrollEl.className = 'custom-curve-canvas-scroll';
      canvas = doc.createElement('canvas');
      canvas.className = 'custom-curve-canvas';
      ctx = canvas.getContext('2d');
      canvas.addEventListener('click', handleCanvasClick);
      canvas.addEventListener('mousemove', handleCanvasHover);
      canvas.addEventListener('mouseleave', handleCanvasLeave);
      canvasScrollEl.addEventListener('wheel', handleZoomWheel, { passive: false });
      canvasScrollEl.appendChild(canvas);
      canvasContainer.appendChild(canvasScrollEl);

      axisTitleXEl = doc.createElement('div');
      axisTitleXEl.className = 'custom-curve-axis-title custom-curve-axis-title-x';
      axisTitleXEl.textContent = 'Current (A)';
      axisTitleXEl.style.display = 'none';
      canvasContainer.appendChild(axisTitleXEl);
      axisTitleYEl = doc.createElement('div');
      axisTitleYEl.className = 'custom-curve-axis-title custom-curve-axis-title-y';
      axisTitleYEl.textContent = 'Time (s)';
      axisTitleYEl.style.transformOrigin = 'left center';
      axisTitleYEl.style.display = 'none';
      canvasContainer.appendChild(axisTitleYEl);
      axisTickContainerX = doc.createElement('div');
      axisTickContainerX.className = 'custom-curve-axis-ticks custom-curve-axis-ticks-x';
      axisTickContainerX.style.display = 'none';
      canvasContainer.appendChild(axisTickContainerX);
      axisTickContainerY = doc.createElement('div');
      axisTickContainerY.className = 'custom-curve-axis-ticks custom-curve-axis-ticks-y';
      axisTickContainerY.style.display = 'none';
      canvasContainer.appendChild(axisTickContainerY);
      hoverTooltipEl = doc.createElement('div');
      hoverTooltipEl.className = 'custom-curve-hover-tooltip';
      hoverTooltipEl.setAttribute('aria-hidden', 'true');
      canvasContainer.appendChild(hoverTooltipEl);
      const canvasColumn = doc.createElement('div');
      canvasColumn.className = 'custom-curve-canvas-column';
      canvasColumn.append(displayControls, canvasContainer);

      referenceGrid.append(referenceControls, canvasColumn);
      referenceSection.append(referenceHeading, referenceGrid);

      const pointsSection = doc.createElement('section');
      pointsSection.className = 'custom-curve-section';
      const pointsHeading = doc.createElement('h3');
      pointsHeading.textContent = 'Curve Points';
      const variantControls = doc.createElement('div');
      variantControls.className = 'custom-curve-variant-controls';

      const variantSelectLabel = doc.createElement('label');
      variantSelectLabel.textContent = 'Curve';
      variantSelectEl = doc.createElement('select');
      variantSelectEl.className = 'custom-curve-variant-select';
      variantSelectLabel.appendChild(variantSelectEl);

      variantNameInputEl = doc.createElement('input');
      variantNameInputEl.type = 'text';
      variantNameInputEl.className = 'custom-curve-variant-name';
      variantNameInputEl.placeholder = 'Label (e.g., Melting)';

      const variantRoleLabel = doc.createElement('label');
      variantRoleLabel.textContent = 'Curve type';
      variantRoleSelectEl = doc.createElement('select');
      variantRoleSelectEl.className = 'custom-curve-variant-role';
      VARIANT_ROLE_OPTIONS.forEach(option => {
        const opt = doc.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        variantRoleSelectEl.appendChild(opt);
      });
      variantRoleLabel.appendChild(variantRoleSelectEl);

      const variantActions = doc.createElement('div');
      variantActions.className = 'custom-curve-variant-actions';
      const addVariantBtn = doc.createElement('button');
      addVariantBtn.type = 'button';
      addVariantBtn.textContent = 'Add curve';
      const removeVariantBtnEl = doc.createElement('button');
      removeVariantBtnEl.type = 'button';
      removeVariantBtnEl.textContent = 'Remove curve';
      variantActions.append(addVariantBtn, removeVariantBtnEl);


      variantControls.append(variantSelectLabel, variantNameInputEl, variantRoleLabel, variantActions);

      variantSelectEl.addEventListener('change', () => {
        const nextId = variantSelectEl.value;
        if (nextId) setActiveVariant(nextId);
      });

      variantNameInputEl.addEventListener('input', () => {
        const variant = getActiveVariant();
        if (!variant) return;
        variant.name = variantNameInputEl.value;
        updateVariantControls();
      });

      variantRoleSelectEl.addEventListener('change', () => {
        const variant = getActiveVariant();
        if (!variant) return;
        const nextRole = normalizeVariantRole(variantRoleSelectEl.value);
        variant.role = nextRole;
        if ((!variant.name || !variant.name.trim()) && nextRole !== 'standard') {
          const match = VARIANT_ROLE_OPTIONS.find(option => option.value === nextRole);
          if (match) {
            const suggested = match.label.split(' (')[0];
            variant.name = suggested;
            if (variantNameInputEl) {
              variantNameInputEl.value = variant.name;
            }
          }
        }
        updateVariantControls();
      });

      addVariantBtn.addEventListener('click', () => {
        commitActiveVariant();
        const newId = reserveVariantId('');
        const defaultName = defaultVariantName(curveVariants.length);
        const newVariant = { id: newId, name: defaultName, role: 'standard', points: [], lastCaptured: null };
        curveVariants.push(newVariant);
        activeVariantId = newId;
        workingPoints = [];
        lastCapturedPoint = null;
        updateVariantControls();
        refreshPointTable();
        updateStatus('New curve added. Capture or enter points for this rating.', 'info');
        if (variantNameInputEl) {
          variantNameInputEl.focus();
          variantNameInputEl.select();
        }
      });

      removeVariantBtn = removeVariantBtnEl;
      removeVariantBtn.addEventListener('click', () => {
        if (curveVariants.length <= 1) {
          updateStatus('At least one curve is required.', 'error');
          return;
        }
        const removedIndex = curveVariants.findIndex(variant => variant.id === activeVariantId);
        const removed = removedIndex !== -1 ? curveVariants[removedIndex] : null;
        curveVariants = curveVariants.filter(variant => variant.id !== activeVariantId);
        activeVariantId = curveVariants[0]?.id || null;
        const activeVariant = getActiveVariant();
        workingPoints = activeVariant ? clonePoints(activeVariant.points) : [];
        lastCapturedPoint = activeVariant
          ? (activeVariant.lastCaptured
            ? { ...activeVariant.lastCaptured }
            : (workingPoints.length ? { ...workingPoints[workingPoints.length - 1] } : null))
          : null;
        updateVariantControls();
        refreshPointTable();
        if (removed) {
          const label = getVariantDisplayName(removed, removedIndex === -1 ? 0 : removedIndex);
          updateStatus(`Removed curve ${label}.`, 'info');
        } else {
          updateStatus('Curve removed.', 'info');
        }
      });

      const toolbar = doc.createElement('div');
      toolbar.className = 'custom-curve-toolbar';
      manualCurrentInput = doc.createElement('input');
      manualCurrentInput.type = 'number';
      manualCurrentInput.min = '0';
      manualCurrentInput.step = '0.001';
      manualCurrentInput.placeholder = 'Current (A)';
      manualTimeInput = doc.createElement('input');
      manualTimeInput.type = 'number';
      manualTimeInput.min = '0';
      manualTimeInput.step = '0.001';
      manualTimeInput.placeholder = 'Time (s)';
      const addManualBtn = doc.createElement('button');
      addManualBtn.type = 'button';
      addManualBtn.textContent = 'Add point';
      addManualBtn.addEventListener('click', handleManualAdd);
      const handleManualKey = event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleManualAdd();
        }
      };
      manualCurrentInput.addEventListener('keydown', handleManualKey);
      manualTimeInput.addEventListener('keydown', handleManualKey);
      toolbar.append(manualCurrentInput, manualTimeInput, addManualBtn);

      const clearBtn = doc.createElement('button');
      clearBtn.type = 'button';
      clearBtn.textContent = 'Clear points';
      clearBtn.addEventListener('click', clearPoints);
      toolbar.appendChild(clearBtn);

      const table = doc.createElement('table');
      table.className = 'custom-curve-table';
      const thead = doc.createElement('thead');
      const headerRow = doc.createElement('tr');
      ['Current (A)', 'Time (s)', ''].forEach(label => {
        const th = doc.createElement('th');
        th.textContent = label;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      tableBody = doc.createElement('tbody');
      table.append(thead, tableBody);

      pointCountEl = doc.createElement('p');
      pointCountEl.className = 'custom-curve-count';

      pointsSection.append(pointsHeading, variantControls, toolbar, pointCountEl, table);

      form.append(detailsSection, evidenceSection, referenceSection, pointsSection);
      body.appendChild(form);

      setAxisInputValues();
      setBoundInputValues();
      configureCanvasSize(referenceImage);
      updateReferenceToggleState();
      updateZoomDisplay();
      lastPointer = null;
      updateCursorReadout(null);
      updateVariantControls();
      refreshPointTable();
      updateStatus('Use the reference or manual inputs to define the curve.', 'info');

      if (controls && typeof controls.setInitialFocus === 'function') {
        controls.setInitialFocus(nameInputEl);
      }
      return { initialFocus: nameInputEl };
    },
    onSubmit() {
      const name = nameInputEl?.value.trim();
      if (!name) {
        updateStatus('Enter a curve name before saving.', 'error');
        if (nameInputEl) nameInputEl.focus();
        return false;
      }
      const axisResult = getAxisValues();
      if (!axisResult.valid) {
        updateStatus('Axis bounds must be positive values with the maximum greater than the minimum.', 'error');
        return false;
      }
      commitActiveVariant();
      const invalidVariant = curveVariants.find((variant, index) => {
        const points = sanitizeCurve(variant.points);
        if (points.length >= 2) return false;
        const label = getVariantDisplayName(variant, index);
        updateStatus(`Add at least two curve points for ${label}.`, 'error');
        return true;
      });
      if (invalidVariant) {
        return false;
      }
      const profilesPayload = buildCustomCurveProfilesPayload(curveVariants);
      const calculationReady = !!reviewedInputEl?.checked;
      const submission = buildCustomCurveSubmission({
        existing,
        name,
        manufacturer: manufacturerInputEl?.value,
        deviceType: deviceTypeInputEl?.value,
        description: descriptionInputEl?.value,
        profiles: profilesPayload,
        axes: axisResult.values,
        bounds: getBoundValues(),
        settings: customSettings,
        catalogNumber: catalogNumberInputEl?.value,
        ratingVoltage: ratingVoltageInputEl?.value,
        ratingCurrent: ratingCurrentInputEl?.value,
        evidence: {
          document: sourceDocumentInputEl?.value,
          revision: sourceRevisionInputEl?.value,
          curveNumber: sourceCurveInputEl?.value,
          extractionMethod: extractionMethodInputEl?.value,
          reviewer: reviewerInputEl?.value
        },
        calculationReady
      });
      if (!submission.payload) {
        updateStatus('Add at least two curve points before saving.', 'error');
        return false;
      }
      const promotionError = getCustomCurvePromotionError(calculationReady, submission.assessment);
      if (promotionError) {
        updateStatus(promotionError, 'error');
        return false;
      }
      const payload = submission.payload;
      saveCustomCurve(payload, { select: !isEditing });
      updateStatus(isEditing ? 'Custom curve updated.' : 'Custom curve created.', 'info');
      return payload;
    }
  });

  if (referenceObjectUrl) {
    URL.revokeObjectURL(referenceObjectUrl);
  }
  if (pendingPdfUrl) {
    URL.revokeObjectURL(pendingPdfUrl);
  }
  return result;
}
