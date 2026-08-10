export async function renderTccChart(dependencies = {}) {
  const {
    state = {},
    activeRangePreset,
    activeViewOptions,
    applySelectionSet,
    arcFlashOverlayComponentId,
    arcFlashOverlayControls,
    arcFlashOverlayThreshold,
    areCalloutsEnabled,
    bindEquipmentOverlayTooltip,
    chart,
    checkDuty,
    clampValue,
    clearPinnedChartDetail,
    clearPlotRefreshPending,
    collectNeighborDeviceDefaults,
    componentDeviceMap,
    computeEquipmentConstraintChecks,
    computeLegendLayout,
    contextMenu,
    d3,
    DEFAULT_INRUSH_DURATION,
    defaultAnnotationOffsets,
    deviceEntries,
    deviceMap,
    document,
    entryInteractiveKey,
    escapeHtml,
    exportCtiBtn,
    findSettingsDeviceDiv,
    focusDeviceSettings,
    formatCalloutDeviceLabel,
    formatSettingValue,
    formatViewSummaries,
    gatherOverridesFromInputs,
    getActiveComponentId,
    getComputedStyle,
    getContextDeviceRelationshipMap,
    getDeviceRelationship,
    getStudies,
    GFP_COLOR_PALETTE,
    hideCurveHoverTooltip,
    hydrateProtectiveDevices,
    incidentEnergyLimitCurve,
    isEquipmentOverlayKind,
    MAX_DELAY,
    MAX_PICKUP,
    MIN_DELAY,
    MIN_PICKUP,
    MOTOR_START_PLOT_CEILING,
    MOTOR_START_PLOT_FLOOR,
    normalizeProtectionType,
    persistSettings,
    plot,
    renderAnnotations,
    renderCoordOrderList,
    renderEquipmentMetrics,
    renderOneLinePreview,
    resolvePlotDomains,
    saved,
    scaleCurve,
    selectedDeviceIds,
    setItem,
    setPlotAvailability,
    setStudies,
    settingsDiv,
    shouldRenderCalloutForEntry,
    showCurveContextMenu,
    showCurveHoverTooltip,
    showPinnedCurveDetail,
    snapOverridesToOptions,
    snapSettingValue,
    startPerformanceMeasurement,
    summarizeActiveViewLabels,
    TCC_DEFAULT_CHART_HEIGHT,
    TCC_DEFAULT_CHART_WIDTH,
    TCC_MIN_PLOT_HEIGHT,
    updateCoordinationStatus,
    viewCalloutOffsets,
    violationDiv
  } = dependencies;
  let {
    activeCoordMarkerDrawer,
    activeCurvesUpdater,
    activeEquipmentConstraintChecks,
    activeEquipmentOverlays,
    activeLegendFocusKey,
    activePlotted,
    annotationContext,
    lastCoordState
  } = state;
  try {
    const finishPlotMeasurement = startPerformanceMeasurement('ctr.tcc-plot', {
    selectedDeviceCount: selectedDeviceIds().length,
  });
  updateCoordinationStatus('Loading selected device curves...', 'pending');
  await hydrateProtectiveDevices(selectedDeviceIds().map(uid => deviceMap.get(uid)?.baseDeviceId));
  contextMenu.hide();
  clearPinnedChartDetail();
  activeLegendFocusKey = null;
  chart.selectAll('*').remove();
  violationDiv.textContent = '';
  annotationContext = null;
  setPlotAvailability(false);
  updateCoordinationStatus('Updating plot...', 'pending');
  activeEquipmentOverlays = [];
  activeEquipmentConstraintChecks = [];
  lastCoordState = null;
  exportCtiBtn?.classList.add('hidden');
  renderEquipmentMetrics([], []);
  chart.classed('annotation-mode', false);
  let selectionIds = selectedDeviceIds();
  let selections = selectionIds.map(id => deviceMap.get(id)).filter(Boolean);
  const contextComponentId = getActiveComponentId();
  if (contextComponentId) {
    const ensureSelectionIds = () => {
      const set = new Set(selectionIds);
      let changed = false;
      const addUid = uid => {
        if (!uid || set.has(uid)) return;
        if (!deviceMap.has(uid)) return;
        set.add(uid);
        selectionIds.push(uid);
        changed = true;
      };
      const contextEntry = componentDeviceMap.get(contextComponentId);
      if (contextEntry) {
        addUid(contextEntry.uid);
      }
      collectNeighborDeviceDefaults(contextComponentId).forEach(addUid);
      deviceEntries
        .filter(entry => entry?.autoSelect && isEquipmentOverlayKind(entry.kind))
        .forEach(entry => addUid(entry.uid));
      if (!changed) return false;
      applySelectionSet(selectionIds);
      saved.devices = [...selectionIds];
      saved.viewOptions = [...activeViewOptions];
      saved.rangePreset = activeRangePreset;
      setItem('tccSettings', saved);
      return true;
    };
    if (ensureSelectionIds()) {
      selectionIds = selectedDeviceIds();
      selections = selectionIds.map(id => deviceMap.get(id)).filter(Boolean);
    }
  }
  if (!selections.length) {
    updateCoordinationStatus('No devices selected. Choose devices to update the plot.', 'warning');
    renderEquipmentMetrics([], []);
    clearPlotRefreshPending();
    finishPlotMeasurement({ plottedCount: 0 });
    return;
  }

  const devicePlots = [];
  const overlays = [];
  const relationshipMap = getContextDeviceRelationshipMap(contextComponentId);

  selections.forEach(selection => {
    if (selection.kind === 'library' || selection.kind === 'component') {
      const overrides = snapOverridesToOptions(
        selection.baseDevice,
        {
          ...selection.overrideSource,
        ...gatherOverridesFromInputs(selection.uid)
        }
      );
      const scaled = scaleCurve(selection.baseDevice, overrides);
      devicePlots.push({ selection, overrides, scaled, relationship: getDeviceRelationship(selection.uid, relationshipMap) });
    } else if (isEquipmentOverlayKind(selection.kind)) {
      overlays.push({ ...selection });
    }
  });

  if (!devicePlots.length && !overlays.length) {
    updateCoordinationStatus('No plottable curves are available for the selected devices.', 'warning');
    renderEquipmentMetrics([], []);
    clearPlotRefreshPending();
    finishPlotMeasurement({ plottedCount: 0 });
    return;
  }

  let allCurrents = [];
  let allTimes = [];
  devicePlots.forEach(plotEntry => {
    const scaled = plotEntry.scaled;
    allCurrents = allCurrents.concat(scaled.curve.map(p => p.current).filter(v => v > 0));
    const band = scaled.envelope?.flatMap(p => [p.minTime, p.maxTime]) || [];
    const times = scaled.curve.map(p => p.time);
    allTimes = allTimes.concat(times.filter(v => v > 0), band.filter(v => v > 0));
  });
  overlays.forEach(entry => {
    if (entry.kind === 'cable') {
      entry.curve.forEach(point => {
        if (point.current > 0) allCurrents.push(point.current);
        if (point.time > 0) allTimes.push(point.time);
      });
    } else if (entry.kind === 'inrush') {
      if (entry.current > 0) allCurrents.push(entry.current);
      const normalizedDuration = Number.isFinite(entry.duration) && entry.duration > 0
        ? entry.duration
        : DEFAULT_INRUSH_DURATION;
      entry.normalizedDuration = normalizedDuration;
      allTimes.push(normalizedDuration);
    } else if (entry.kind === 'transformerDamage' || entry.kind === 'motorStart' || entry.kind === 'motorThermal') {
      entry.curve.forEach(point => {
        if (Number.isFinite(point.current) && point.current > 0) allCurrents.push(point.current);
        if (Number.isFinite(point.time) && point.time > 0) allTimes.push(point.time);
      });
    }
  });

  if (overlays.some(entry => entry.kind === 'motorStart')) {
    allTimes.push(MOTOR_START_PLOT_FLOOR, MOTOR_START_PLOT_CEILING);
  }

  const studies = getStudies();
  const contextId = getActiveComponentId();
  const fault = contextId ? studies.shortCircuit?.[contextId]?.threePhaseKA : null;
  if (fault) {
    allCurrents.push(fault * 1000);
  }

  // Arc flash incident energy limit curve overlay (Gap #54)
  if (activeViewOptions.includes('arcFlashOverlay')) {
    const afResults = studies?.arcFlash;
    const afEntry = arcFlashOverlayComponentId
      ? afResults?.[arcFlashOverlayComponentId]
      : (afResults ? Object.values(afResults)[0] : null);
    if (afEntry?.calculationInputs) {
      const ci = afEntry.calculationInputs;
      const enclosure = ci.enclosureType || 'box';
      const gap = Number.isFinite(ci.gapMM) && ci.gapMM > 0 ? ci.gapMM : 25;
      const dist = Number.isFinite(ci.workingDistanceMM) && ci.workingDistanceMM > 0 ? ci.workingDistanceMM : 455;
      const V = Number.isFinite(ci.voltageKVUsed) && ci.voltageKVUsed > 0 ? ci.voltageKVUsed : 0.48;
      const cfg = ci.electrodeConfiguration || 'VCB';
      const boxHeight = Number.isFinite(ci.boxHeightMM) && ci.boxHeightMM > 0 ? ci.boxHeightMM : 508;
      const boxWidth = Number.isFinite(ci.boxWidthMM) && ci.boxWidthMM > 0 ? ci.boxWidthMM : 508;
      const boxDepth = Number.isFinite(ci.boxDepthMM) && ci.boxDepthMM > 0 ? ci.boxDepthMM : 508;
      // Sweep 200 points log-spaced across the current domain
      const domainMinKA = (d3.min(allCurrents) || 100) / 1000 / 2;
      const domainMaxKA = (d3.max(allCurrents) || 10000) / 1000 * 2;
      const nPts = 200;
      const logMin = Math.log10(Math.max(domainMinKA, 0.001));
      const logMax = Math.log10(Math.max(domainMaxKA, domainMinKA * 10));
      const currentRangeKA = Array.from({ length: nPts }, (_, i) =>
        Math.pow(10, logMin + (logMax - logMin) * i / (nPts - 1)));
      const limitPoints = incidentEnergyLimitCurve(
        { EC: cfg, Voc_kV: V, G_mm: gap, D_mm: dist, enclosure,
          height_mm: boxHeight, width_mm: boxWidth, depth_mm: boxDepth },
        arcFlashOverlayThreshold,
        currentRangeKA
      );
      if (limitPoints.length > 1) {
        const label = `${arcFlashOverlayThreshold} cal/cm² – ${afEntry.equipmentTag || 'Arc Flash Limit'}`;
        overlays.push({ kind: 'arcFlashLimit', label, curve: limitPoints });
        limitPoints.forEach(p => {
          allCurrents.push(p.current);
          allTimes.push(p.time);
        });
      }
    }
  }

  const BASE_MARGIN = { top: 24, right: 90, bottom: 70, left: 70 };
  const svgWidth = Number(chart.attr('width')) || TCC_DEFAULT_CHART_WIDTH;
  const baseWidth = svgWidth - BASE_MARGIN.left - BASE_MARGIN.right;
  const color = d3.scaleOrdinal(d3.schemeCategory10);
  const plottables = [...devicePlots, ...overlays];
  let gfpColorIndex = 0;
  plottables.forEach((entry, index) => {
    if (entry.selection?.baseDevice?.groundFault === true) {
      entry.color = GFP_COLOR_PALETTE[gfpColorIndex % GFP_COLOR_PALETTE.length];
      entry.isGFP = true;
      gfpColorIndex++;
    } else {
      entry.color = color(index);
    }
  });

  const { layouts: legendLayouts, height: legendHeight } = computeLegendLayout(plottables, baseWidth);
  const legendSpacing = legendHeight ? 12 : 0;
  const margin = {
    top: BASE_MARGIN.top + legendHeight + legendSpacing,
    right: BASE_MARGIN.right,
    bottom: BASE_MARGIN.bottom,
    left: BASE_MARGIN.left
  };
  const width = baseWidth;
  const baseSvgHeight = TCC_DEFAULT_CHART_HEIGHT;
  const svgHeight = Math.max(baseSvgHeight, margin.top + TCC_MIN_PLOT_HEIGHT + margin.bottom);
  chart
    .attr('height', svgHeight)
    .attr('viewBox', `0 0 ${svgWidth} ${svgHeight}`)
    .attr('preserveAspectRatio', 'xMidYMin meet');
  const height = svgHeight - margin.top - margin.bottom;
  const g = chart.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const faultCurrentA = fault ? fault * 1000 : null;
  const { currentDomain, timeDomain } = resolvePlotDomains(devicePlots, overlays, faultCurrentA, allCurrents, allTimes);
  const x = d3.scaleLog()
    .domain(currentDomain)
    .range([0, width]);
  const y = d3.scaleLog()
    .domain(timeDomain)
    .range([height, 0]);
  const pageStyles = getComputedStyle(document.body);
  const chartTextColor = pageStyles.getPropertyValue('--text-color').trim() || '#333';
  const chartAxisColor = pageStyles.getPropertyValue('--border-color').trim() || '#999';
  const xAxis = d3.axisBottom(x).ticks(10, '~g');
  const yAxis = d3.axisLeft(y).ticks(10, '~g');

  const xAxisGroup = g.append('g').attr('transform', `translate(0,${height})`).call(xAxis);
  const yAxisGroup = g.append('g').call(yAxis);
  [xAxisGroup, yAxisGroup].forEach(axisGroup => {
    axisGroup.selectAll('text').attr('fill', chartTextColor);
    axisGroup.selectAll('path,line')
      .attr('stroke', chartAxisColor)
      .attr('stroke-opacity', 0.85);
  });

  g.append('g')
    .attr('class', 'grid grid-x')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis.tickSize(-height).tickFormat(''))
    .call(axis => axis.select('.domain').remove())
    .call(axis => axis.selectAll('line').attr('stroke', chartAxisColor).attr('stroke-opacity', 0.28));
  g.append('g')
    .attr('class', 'grid grid-y')
    .call(yAxis.tickSize(-width).tickFormat(''))
    .call(axis => axis.select('.domain').remove())
    .call(axis => axis.selectAll('line').attr('stroke', chartAxisColor).attr('stroke-opacity', 0.28));

  g.append('text')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 5)
    .attr('text-anchor', 'middle')
    .attr('fill', chartTextColor)
    .text('Current (A)');

  g.append('text')
    .attr('x', width / 2)
    .attr('y', -margin.top + 20)
    .attr('text-anchor', 'middle')
    .attr('fill', chartTextColor)
    .text('Current (A)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -margin.left + 15)
    .attr('text-anchor', 'middle')
    .attr('fill', chartTextColor)
    .text('Time (s)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', width + margin.right - 20)
    .attr('text-anchor', 'middle')
    .attr('fill', chartTextColor)
    .text('Time (s)');

  const clipIdBase = chart.attr('id') || 'tcc-chart';
  const clipId = `${clipIdBase}-plot-clip`;
  const defs = chart.append('defs');
  defs.append('clipPath')
    .attr('id', clipId)
    .attr('clipPathUnits', 'userSpaceOnUse')
    .append('rect')
    .attr('width', width)
    .attr('height', height);

  const plotLayer = g.append('g')
    .attr('class', 'tcc-plot-layer')
    .attr('clip-path', `url(#${clipId})`);
  const deviceLayer = plotLayer.append('g').attr('class', 'tcc-device-layer');
  const overlayLayer = plotLayer.append('g').attr('class', 'tcc-overlay-layer');
  const indicatorLayer = plotLayer.append('g').attr('class', 'tcc-indicator-layer');

  const legend = chart.append('g')
    .attr('class', 'tcc-legend')
    .attr('transform', `translate(${margin.left},${BASE_MARGIN.top})`);

  legendLayouts.forEach(layout => {
    const { entry, viewSummaries, legendLabel, x: itemX, y: itemY } = layout;
    const legendKey = entryInteractiveKey(entry);
    const legendItem = legend.append('g')
      .attr('class', 'tcc-legend-item')
      .attr('transform', `translate(${itemX},${itemY})`)
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('data-entry-key', legendKey)
      .attr('aria-label', `Highlight ${legendLabel} on the chart`)
      .attr('title', 'Click to highlight this curve. Double-click to focus its settings.')
      .style('cursor', 'pointer')
      .on('click', event => {
        event.stopPropagation();
        toggleLegendFocus(entry);
      })
      .on('dblclick', event => {
        event.stopPropagation();
        if (entry.selection?.uid) focusDeviceSettings(entry.selection.uid);
      })
      .on('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleLegendFocus(entry);
      });
    if (entry.kind === 'cable') {
      legendItem.append('line')
        .attr('x1', 0)
        .attr('x2', 16)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,3');
    } else if (entry.kind === 'inrush') {
      legendItem.append('line')
        .attr('x1', 2)
        .attr('x2', 14)
        .attr('y1', 2)
        .attr('y2', 14)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2);
      legendItem.append('line')
        .attr('x1', 2)
        .attr('x2', 14)
        .attr('y1', 14)
        .attr('y2', 2)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2);
    } else if (entry.kind === 'transformerDamage') {
      legendItem.append('line')
        .attr('x1', 0)
        .attr('x2', 16)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '8,4');
    } else if (entry.kind === 'motorStart') {
      legendItem.append('line')
        .attr('x1', 0)
        .attr('x2', 16)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '2,2');
    } else if (entry.kind === 'motorThermal') {
      legendItem.append('line')
        .attr('x1', 0)
        .attr('x2', 16)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,1,1,1');
    } else if (entry.kind === 'arcFlashLimit') {
      legendItem.append('line')
        .attr('x1', 0)
        .attr('x2', 16)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '10,5');
    } else {
      legendItem.append('rect')
        .attr('width', 16)
        .attr('height', 16)
        .attr('fill', entry.color)
        .attr('opacity', 0.6);
    }
    legendItem.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .attr('fill', chartTextColor)
      .attr('font-size', 12)
      .text(legendLabel);

    if (viewSummaries.length) {
      const badgesGroup = legendItem.append('g')
        .attr('class', 'tcc-view-badges')
        .attr('transform', `translate(20, ${12 + 14})`);
      let offsetX = 0;
      viewSummaries.forEach(summary => {
        const badge = badgesGroup.append('g')
          .attr('class', 'tcc-view-badge')
          .attr('transform', `translate(${offsetX},0)`);
        const text = badge.append('text')
          .attr('class', 'tcc-view-badge-text')
          .attr('x', 0)
          .attr('y', 10)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .text(summary);
        const textNode = text.node();
        const textWidth = Math.ceil(textNode ? textNode.getComputedTextLength() : summary.length * 7);
        const badgeWidth = Math.max(32, textWidth + 16);
        badge.insert('rect', 'text')
          .attr('class', 'tcc-view-badge-bg')
          .attr('x', 0)
          .attr('y', -2)
          .attr('rx', 6)
          .attr('ry', 6)
          .attr('width', badgeWidth)
          .attr('height', 20);
        text.attr('x', badgeWidth / 2);
        offsetX += badgeWidth + 8;
      });
    }
  });

  const viewSummaryLabel = summarizeActiveViewLabels();
  if (viewSummaryLabel) {
    chart.append('text')
      .attr('class', 'tcc-view-label')
      .attr('x', margin.left + width)
      .attr('y', Math.max(16, margin.top - 24))
      .attr('text-anchor', 'end')
      .text(`Views: ${viewSummaryLabel}`);
  }

  if (fault) {
    indicatorLayer.append('line')
      .attr('x1', x(fault * 1000))
      .attr('x2', x(fault * 1000))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#000')
      .attr('stroke-dasharray', '4,2');
  }

  const line = d3.line().x(p => x(p.current)).y(p => y(p.time)).curve(d3.curveLinear);
  const bandArea = d3.area()
    .x(p => x(p.current))
    .y0(p => y(p.maxTime))
    .y1(p => y(p.minTime))
    .curve(d3.curveLinear);
  const [xMin, xMax] = x.range();
  const [yMin, yMax] = y.range();
  const [domainMinTime, domainMaxTime] = y.domain();
  const motorStartCurves = new Map();

  const addOrReplacePoint = (list, time, current) => {
    if (!Number.isFinite(time) || time <= 0) return;
    if (!Number.isFinite(current) || current <= 0) return;
    const existing = list.find(point => Math.abs(point.time - time) <= Math.max(time, point.time) * 1e-9);
    if (existing) {
      existing.time = time;
      existing.current = current;
    } else {
      list.push({ time, current });
    }
  };

  overlays.filter(entry => entry.kind === 'motorStart').forEach(entry => {
    const basePoints = Array.isArray(entry.curve)
      ? entry.curve.map(point => ({ time: point.time, current: point.current }))
      : [];
    const sanitized = basePoints.filter(point => (
      Number.isFinite(point.time)
      && point.time > 0
      && Number.isFinite(point.current)
      && point.current > 0
    ));
    addOrReplacePoint(sanitized, domainMinTime, entry.lockedRotor);
    addOrReplacePoint(sanitized, domainMaxTime, entry.fla);
    sanitized.sort((a, b) => a.time - b.time);
    motorStartCurves.set(entry, sanitized);
  });

  const appendEquipmentOverlayPath = (entry, curve, strokeDasharray, strokeWidth = 2) => {
    const safeCurve = Array.isArray(curve) ? curve : [];
    const pathData = safeCurve.length ? line(safeCurve) : null;
    const visiblePath = overlayLayer.append('path')
      .datum(safeCurve)
      .attr('class', 'tcc-equipment-overlay-path')
      .attr('fill', 'none')
      .attr('stroke', entry.color)
      .attr('stroke-width', strokeWidth)
      .attr('stroke-dasharray', strokeDasharray || null)
      .attr('d', pathData)
      .attr('aria-hidden', 'true')
      .style('pointer-events', 'none');
    if (pathData) {
      bindEquipmentOverlayTooltip(
        overlayLayer.append('path')
          .datum(safeCurve)
          .attr('class', 'tcc-overlay-hit-target')
          .attr('fill', 'none')
          .attr('stroke', 'transparent')
          .attr('stroke-width', Math.max(12, strokeWidth + 8))
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('d', pathData)
          .style('pointer-events', 'stroke'),
        entry,
        x,
        margin,
        safeCurve
      );
    }
    entry.overlayPath = visiblePath;
    return visiblePath;
  };

  overlays.filter(entry => entry.kind === 'cable').forEach(entry => {
    appendEquipmentOverlayPath(entry, entry.curve, '6,3');
  });

  overlays.filter(entry => entry.kind === 'transformerDamage').forEach(entry => {
    appendEquipmentOverlayPath(entry, entry.curve, '8,4');
  });

  overlays.filter(entry => entry.kind === 'motorThermal').forEach(entry => {
    appendEquipmentOverlayPath(entry, entry.curve, '4,1,1,1');
  });

  overlays.filter(entry => entry.kind === 'inrush').forEach(entry => {
    if (!(entry.current > 0)) return;
    const duration = entry.normalizedDuration ?? DEFAULT_INRUSH_DURATION;
    const xPos = x(entry.current);
    const yPos = y(duration);
    if (!Number.isFinite(xPos) || !Number.isFinite(yPos)) return;
    const size = 6;
    const labelY = yPos - size - 2 < 12 ? size + 14 : -size - 2;
    const marker = bindEquipmentOverlayTooltip(
      overlayLayer.append('g')
        .attr('class', 'tcc-overlay-marker tcc-inrush-marker')
        .attr('transform', `translate(${xPos},${yPos})`),
      entry,
      x,
      margin
    );
    marker.append('circle')
      .attr('class', 'tcc-overlay-marker-hit-target')
      .attr('r', 14)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all');
    marker.append('line')
      .attr('x1', -size)
      .attr('x2', size)
      .attr('y1', -size)
      .attr('y2', size)
      .attr('stroke', entry.color)
      .attr('stroke-width', 2);
    marker.append('line')
      .attr('x1', -size)
      .attr('x2', size)
      .attr('y1', size)
      .attr('y2', -size)
      .attr('stroke', entry.color)
      .attr('stroke-width', 2);
    marker.append('text')
      .attr('class', 'tcc-equipment-tag-callout')
      .attr('data-equipment-tag', entry.sourceLabel || entry.sourceId || '')
      .attr('x', size + 4)
      .attr('y', labelY)
      .attr('fill', entry.color)
      .attr('font-size', 12)
      .text(`${entry.sourceLabel || entry.sourceId || 'Transformer'} inrush`);
    entry.overlayMarker = marker;
  });

  const motorStartEntries = overlays.filter(entry => entry.kind === 'motorStart');
  const motorStartLabelYValues = motorStartEntries
    .map(entry => y(entry.startTime))
    .filter(Number.isFinite);
  const motorStartLabelTop = motorStartLabelYValues.length
    ? Math.max(14, Math.min(...motorStartLabelYValues) - (motorStartEntries.length * 14))
    : 14;
  motorStartEntries.forEach((entry, startIndex) => {
    const curve = motorStartCurves.get(entry) || entry.curve;
    appendEquipmentOverlayPath(entry, curve, '2,2');
    const xPos = x(entry.lockedRotor);
    const yPos = y(entry.startTime);
    if (!Number.isFinite(xPos) || !Number.isFinite(yPos)) return;
    const tag = entry.sourceLabel || entry.sourceId || 'Motor';
    const marker = bindEquipmentOverlayTooltip(
      overlayLayer.append('g')
        .attr('class', 'tcc-overlay-marker tcc-motor-start-marker')
        .attr('transform', `translate(${xPos},${yPos})`),
      entry,
      x,
      margin
    );
    marker.append('circle')
      .attr('class', 'tcc-overlay-marker-hit-target')
      .attr('r', 12)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all');
    marker.append('circle')
      .attr('r', 4)
      .attr('fill', entry.color)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.25);
    marker.append('text')
      .attr('class', 'tcc-equipment-tag-callout')
      .attr('data-equipment-tag', tag)
      .attr('x', 7)
      .attr('y', motorStartLabelTop + (startIndex * 14) - yPos)
      .attr('fill', entry.color)
      .attr('font-size', 12)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .text(`${tag} ${entry.startProfile || 'start'}`);
    entry.overlayMarker = marker;
  });

  overlays.filter(entry => entry.kind === 'arcFlashLimit').forEach(entry => {
    overlayLayer.append('path')
      .datum(entry.curve)
      .attr('fill', 'none')
      .attr('stroke', entry.color)
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '10,5')
      .attr('d', entry.curve.length ? line(entry.curve) : null);
  });

  const plotted = devicePlots.map((plotEntry, plotIndex) => {
    const selection = plotEntry.selection;
    const scaled = plotEntry.scaled;
    const entry = { ...plotEntry, selection, scaled };
    const isSelectedContextDevice = entry.relationship?.role === 'selected';
    entry.isFuse = normalizeProtectionType(selection?.baseDevice?.type || entry.deviceType) === 'fuse';
    if (entry.isFuse) {
      entry.fusePatternId = `${clipIdBase}-fuse-band-${plotIndex}`;
      const pattern = defs.append('pattern')
        .attr('id', entry.fusePatternId)
        .attr('class', 'tcc-fuse-band-pattern')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 8)
        .attr('height', 8);
      pattern.append('rect')
        .attr('width', 8)
        .attr('height', 8)
        .attr('fill', entry.color)
        .attr('fill-opacity', 0.07);
      pattern.append('path')
        .attr('d', 'M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6')
        .attr('fill', 'none')
        .attr('stroke', entry.color)
        .attr('stroke-width', 0.8)
        .attr('stroke-opacity', 0.5);
    }
    entry.bandPath = deviceLayer.append('path')
      .datum(scaled.envelope || [])
      .attr('class', entry.isFuse ? 'tcc-tolerance-band tcc-fuse-tolerance-band' : 'tcc-tolerance-band')
      .attr('fill', entry.isFuse ? `url(#${entry.fusePatternId})` : entry.color)
      .attr('opacity', entry.isFuse ? 1 : (isSelectedContextDevice ? 0.2 : 0.12))
      .attr('stroke', 'none');
    entry.minPath = deviceLayer.append('path')
      .datum(scaled.minCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', isSelectedContextDevice ? 1.4 : 1)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '4,4');
    entry.maxPath = deviceLayer.append('path')
      .datum(scaled.maxCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', isSelectedContextDevice ? 1.4 : 1)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '4,4');
    entry.peakPath = deviceLayer.append('path')
      .datum(scaled.peakCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', 1.5)
      .attr('stroke-linecap', 'round')
      .attr('stroke-dasharray', '6,4')
      .attr('stroke', entry.color)
      .attr('opacity', 0.85)
      .attr('d', (Array.isArray(scaled.peakCurve) && scaled.peakCurve.length) ? line(scaled.peakCurve) : null)
      .style('display', Array.isArray(scaled.peakCurve) && scaled.peakCurve.length ? null : 'none');
    entry.path = deviceLayer.append('path')
      .datum(scaled.curve)
      .attr('fill', 'none')
      .attr('stroke-width', isSelectedContextDevice ? 3.25 : (entry.isGFP ? 2.5 : 2))
      .attr('stroke', entry.color)
      .attr('opacity', isSelectedContextDevice ? 1 : 0.86)
      .attr('stroke-dasharray', entry.isGFP ? '8,4' : null)
      .attr('stroke-linecap', entry.isGFP ? 'round' : null)
      .attr('tabindex', 0)
      .style('cursor', 'move')
      .on('mousemove', event => showCurveHoverTooltip(event, entry, x, y, margin))
      .on('click', event => {
        event.stopPropagation();
        showPinnedCurveDetail(event, entry, x, margin);
      })
      .on('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        showPinnedCurveDetail(event, entry, x, margin);
      })
      .on('mouseleave', hideCurveHoverTooltip)
      .on('focus', event => showCurveHoverTooltip(event, entry, x, y, margin))
      .on('blur', hideCurveHoverTooltip)
      .on('contextmenu', event => {
        event.preventDefault();
        event.stopPropagation();
        showCurveContextMenu(event, entry);
    });
    return entry;
  });
  const equipmentOverlays = overlays.filter(entry => isEquipmentOverlayKind(entry.kind));

  const setEntryVisualFocus = (entry, active, dimmed) => {
    [
      entry.path,
      entry.bandPath,
      entry.minPath,
      entry.maxPath,
      entry.peakPath,
      entry.overlayPath,
      entry.overlayMarker
    ].filter(Boolean).forEach(selection => {
      selection.classed('is-highlighted', active).classed('is-dimmed', dimmed);
    });
  };

  function clearLegendFocus() {
    activeLegendFocusKey = null;
    [...plotted, ...equipmentOverlays].forEach(entry => setEntryVisualFocus(entry, false, false));
    legend.selectAll('.tcc-legend-item').classed('is-active', false).classed('is-muted', false);
  }

  function toggleLegendFocus(entry) {
    const key = entryInteractiveKey(entry);
    if (!key) return;
    if (activeLegendFocusKey === key) {
      clearLegendFocus();
      updateCoordinationStatus('Legend highlight cleared.', 'neutral');
      return;
    }
    activeLegendFocusKey = key;
    [...plotted, ...equipmentOverlays].forEach(item => {
      const isActive = entryInteractiveKey(item) === key;
      setEntryVisualFocus(item, isActive, !isActive);
    });
    legend.selectAll('.tcc-legend-item')
      .classed('is-active', function isActiveLegend() {
        return this.getAttribute('data-entry-key') === key;
      })
      .classed('is-muted', function isMutedLegend() {
        return this.getAttribute('data-entry-key') !== key;
      });
    updateCoordinationStatus(`${entry.selection?.name || entry.name || 'Curve'} highlighted from the legend. Select it again to clear.`, 'neutral');
  }

  const viewCalloutLayer = g.append('g').attr('class', 'view-callout-layer');

  const buildViewCalloutData = () => {
    if (!areCalloutsEnabled()) return [];
    return plotted
      .map(entry => {
        if (!entry || !entry.selection) return null;
        if (entry.selection.kind !== 'library' && entry.selection.kind !== 'component') return null;
        if (!shouldRenderCalloutForEntry(entry)) return null;
        const summaries = formatViewSummaries(entry);
        const deviceLabel = formatCalloutDeviceLabel(entry);
        const curve = Array.isArray(entry.scaled?.curve) ? entry.scaled.curve : [];
        if (!curve.length) return null;
        const anchor = curve[Math.floor(curve.length / 2)] || curve[curve.length - 1] || curve[0];
        if (!anchor || !(anchor.current > 0) || !(anchor.time > 0)) return null;
        const anchorX = x(anchor.current);
        const anchorY = y(anchor.time);
        if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) return null;
        return {
          id: entry.selection.uid || entry.selection.baseDeviceId || deviceLabel,
          entry,
          anchor,
          anchorX,
          anchorY,
          lines: [deviceLabel, ...summaries]
        };
      })
      .filter(Boolean);
  };

  const updateViewCallouts = () => {
    const data = buildViewCalloutData();
    if (!data.length) {
      viewCalloutLayer.selectAll('*').remove();
      viewCalloutOffsets.clear();
      return;
    }
    const activeIds = new Set(data.map(datum => datum.id));
    viewCalloutOffsets.forEach((_, key) => {
      if (!activeIds.has(key)) viewCalloutOffsets.delete(key);
    });
    const callouts = viewCalloutLayer.selectAll('g.view-callout').data(data, datum => datum.id);
    callouts.exit().each(datum => {
      viewCalloutOffsets.delete(datum.id);
    }).remove();
    const entered = callouts.enter().append('g').attr('class', 'view-callout');
    entered.append('line').attr('class', 'view-callout-connector');
    entered.append('circle').attr('class', 'view-callout-anchor').attr('r', 4);
    const labelGroup = entered.append('g').attr('class', 'view-callout-label');
    labelGroup.append('rect').attr('class', 'view-callout-bg').attr('rx', 6).attr('ry', 6);
    labelGroup.append('text').attr('class', 'view-callout-text');

    const merged = entered.merge(callouts);
    merged.each(function renderViewCallout(datum, index) {
      const group = d3.select(this);
      const entry = datum.entry;
      const curve = Array.isArray(entry.scaled?.curve) ? entry.scaled.curve : [];
      const anchor = curve[Math.floor(curve.length / 2)] || curve[curve.length - 1] || curve[0] || datum.anchor;
      if (!anchor || !(anchor.current > 0) || !(anchor.time > 0)) {
        group.attr('display', 'none');
        return;
      }
      const anchorX = x(anchor.current);
      const anchorY = y(anchor.time);
      if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
        group.attr('display', 'none');
        return;
      }
      group.attr('display', null);
      datum.anchorX = anchorX;
      datum.anchorY = anchorY;
      const baseOffsets = defaultAnnotationOffsets(anchorX, anchorY, width, height);
      const horizontal = baseOffsets.offsetX >= 0 ? 1 : -1;
      const vertical = baseOffsets.offsetY >= 0 ? 1 : -1;
      const storedOffset = viewCalloutOffsets.get(datum.id);
      let offsetX;
      let offsetY;
      if (storedOffset && Number.isFinite(storedOffset.dx) && Number.isFinite(storedOffset.dy)) {
        offsetX = storedOffset.dx;
        offsetY = storedOffset.dy;
      } else {
        const magnitudeX = Math.max(60, Math.abs(baseOffsets.offsetX)) + (index % 3) * 18;
        const magnitudeY = Math.max(40, Math.abs(baseOffsets.offsetY)) + ((index + 1) % 3) * 14;
        offsetX = horizontal * magnitudeX;
        offsetY = vertical * magnitudeY;
      }
      let labelX = clampValue(anchorX + offsetX, 24, width - 24);
      let labelY = clampValue(anchorY + offsetY, 24, height - 24);
      const appliedOffset = {
        dx: labelX - anchorX,
        dy: labelY - anchorY
      };
      viewCalloutOffsets.set(datum.id, appliedOffset);
      datum.labelX = labelX;
      datum.labelY = labelY;
      group.select('line.view-callout-connector')
        .attr('x1', anchorX)
        .attr('y1', anchorY)
        .attr('x2', labelX)
        .attr('y2', labelY)
        .attr('stroke', entry.color)
        .attr('stroke-width', 1.4);
      group.select('circle.view-callout-anchor')
        .attr('cx', anchorX)
        .attr('cy', anchorY)
        .attr('stroke', entry.color)
        .attr('stroke-width', 1.4);
      const label = group.select('g.view-callout-label')
        .attr('transform', `translate(${labelX},${labelY})`)
        .style('touch-action', 'none')
        .call(d3.drag()
          .subject(() => ({ x: datum.labelX, y: datum.labelY }))
          .on('start', event => {
            if (event.sourceEvent) event.sourceEvent.stopPropagation();
          })
          .on('drag', function handleCalloutDrag(event) {
            const newX = clampValue(event.x, 24, width - 24);
            const newY = clampValue(event.y, 24, height - 24);
            datum.labelX = newX;
            datum.labelY = newY;
            const offset = {
              dx: newX - datum.anchorX,
              dy: newY - datum.anchorY
            };
            viewCalloutOffsets.set(datum.id, offset);
            d3.select(this).attr('transform', `translate(${newX},${newY})`);
            group.select('line.view-callout-connector')
              .attr('x2', newX)
              .attr('y2', newY);
          })
          .on('end', function handleCalloutDragEnd() {
            const stored = viewCalloutOffsets.get(datum.id);
            if (!stored) return;
            const finalX = clampValue(datum.anchorX + stored.dx, 24, width - 24);
            const finalY = clampValue(datum.anchorY + stored.dy, 24, height - 24);
            datum.labelX = finalX;
            datum.labelY = finalY;
            viewCalloutOffsets.set(datum.id, {
              dx: finalX - datum.anchorX,
              dy: finalY - datum.anchorY
            });
            d3.select(this).attr('transform', `translate(${finalX},${finalY})`);
            group.select('line.view-callout-connector')
              .attr('x2', finalX)
              .attr('y2', finalY);
          }));
      const text = label.select('text.view-callout-text')
        .attr('text-anchor', 'start');
      const tspans = text.selectAll('tspan').data(datum.lines, (line, lineIndex) => `${datum.id}:${lineIndex}`);
      tspans.exit().remove();
      const tspansEnter = tspans.enter().append('tspan');
      tspansEnter.merge(tspans)
        .attr('x', 0)
        .attr('dy', (_, lineIndex) => (lineIndex === 0 ? '0' : '1.2em'))
        .attr('class', (_, lineIndex) => (lineIndex === 0 ? 'view-callout-title' : null))
        .text(line => line);
      const textNode = text.node();
      if (textNode) {
        const bbox = textNode.getBBox();
        const paddingX = 8;
        const paddingY = 6;
        label.select('rect.view-callout-bg')
          .attr('x', bbox.x - paddingX)
          .attr('y', bbox.y - paddingY)
          .attr('width', bbox.width + paddingX * 2)
          .attr('height', bbox.height + paddingY * 2)
          .attr('stroke', entry.color)
          .attr('stroke-width', 1.2);
      }
    });
  };

  const updateDutyResults = violations => {
    if (violations.length) {
      violationDiv.innerHTML = violations.map(v => `<p>${escapeHtml(v)}</p>`).join('');
    } else {
      violationDiv.textContent = '';
    }
    const contextIdForDuty = getActiveComponentId();
    if (!contextIdForDuty) return;
    const res = getStudies();
    res.duty = res.duty || {};
    res.duty[contextIdForDuty] = violations;
    setStudies(res);
  };

  const updateCurves = () => {
    const contextIdForFault = getActiveComponentId();
    const faultKA = contextIdForFault ? getStudies().shortCircuit?.[contextIdForFault]?.threePhaseKA : null;
    const violations = [];
    plotted.forEach(entry => {
      entry.scaled = scaleCurve(entry.selection.baseDevice, entry.overrides);
      const envelope = entry.scaled.envelope || [];
      const minCurve = entry.scaled.minCurve || [];
      const maxCurve = entry.scaled.maxCurve || [];
      const mainCurve = entry.scaled.curve || [];
      entry.bandPath
        .datum(envelope)
        .attr('d', envelope.length ? bandArea(envelope) : null)
        .attr('fill', entry.isFuse ? `url(#${entry.fusePatternId})` : entry.color);
      entry.minPath
        .datum(minCurve)
        .attr('d', minCurve.length ? line(minCurve) : null)
        .attr('stroke', entry.color);
      entry.maxPath
        .datum(maxCurve)
        .attr('d', maxCurve.length ? line(maxCurve) : null)
        .attr('stroke', entry.color);
      const peakCurve = Array.isArray(entry.scaled?.peakCurve) ? entry.scaled.peakCurve : [];
      if (entry.peakPath) {
        entry.peakPath
          .datum(peakCurve)
          .attr('d', peakCurve.length ? line(peakCurve) : null)
          .attr('stroke', entry.color)
          .style('display', peakCurve.length ? null : 'none');
      } else if (peakCurve.length) {
        entry.peakPath = deviceLayer.append('path')
          .datum(peakCurve)
          .attr('fill', 'none')
          .attr('stroke-width', 1.5)
          .attr('stroke-linecap', 'round')
          .attr('stroke-dasharray', '6,4')
          .attr('stroke', entry.color)
          .attr('opacity', 0.85)
          .attr('d', line(peakCurve));
      }
      entry.path
        .datum(mainCurve)
        .attr('d', mainCurve.length ? line(mainCurve) : null)
        .attr('stroke', () => {
          const violation = checkDuty(entry.scaled, faultKA);
          if (violation) {
            violations.push(violation);
            return 'red';
          }
          return entry.color;
        });
    });
    updateDutyResults(violations);
    activeEquipmentOverlays = equipmentOverlays;
    activeEquipmentConstraintChecks = computeEquipmentConstraintChecks(plotted, equipmentOverlays);
    renderEquipmentMetrics(equipmentOverlays, activeEquipmentConstraintChecks);
    if (activeEquipmentConstraintChecks.some(check => check.status === 'warning')) {
      updateCoordinationStatus('Equipment reference checks need review. See the metrics below the chart status.', 'warning');
    }
    updateViewCallouts();
  };

  const crosshairGroup = g.append('g')
    .attr('class', 'tcc-crosshair')
    .attr('pointer-events', 'none')
    .style('display', 'none');
  const crosshairVertical = crosshairGroup.append('line').attr('class', 'tcc-crosshair-line');
  const crosshairHorizontal = crosshairGroup.append('line').attr('class', 'tcc-crosshair-line');
  const crosshairPoint = crosshairGroup.append('circle')
    .attr('class', 'tcc-crosshair-point')
    .attr('r', 4);

  const readoutGroup = g.append('g')
    .attr('class', 'tcc-crosshair-readout')
    .attr('pointer-events', 'none')
    .style('display', 'none');
  const readoutBackground = readoutGroup.append('rect')
    .attr('class', 'tcc-crosshair-bg')
    .attr('rx', 6)
    .attr('ry', 6);
  const readoutText = readoutGroup.append('text')
    .attr('class', 'tcc-crosshair-text')
    .attr('x', 8)
    .attr('y', 6)
    .attr('dominant-baseline', 'hanging');

  const crosshairFormat = d3.format('.3~g');

  const hideCrosshair = () => {
    crosshairGroup.style('display', 'none');
    readoutGroup.style('display', 'none');
  };

  const updateCrosshair = event => {
    if (chart.classed('annotation-mode')) {
      hideCrosshair();
      return;
    }
    const [svgX, svgY] = d3.pointer(event, chart.node());
    const localX = svgX - margin.left;
    const localY = svgY - margin.top;
    if (localX < 0 || localX > width || localY < 0 || localY > height) {
      hideCrosshair();
      return;
    }
    const currentValue = x.invert(localX);
    const timeValue = y.invert(localY);
    if (!Number.isFinite(currentValue) || !Number.isFinite(timeValue)) {
      hideCrosshair();
      return;
    }

    crosshairGroup.style('display', null);
    readoutGroup.style('display', null);

    crosshairVertical
      .attr('x1', localX)
      .attr('x2', localX)
      .attr('y1', 0)
      .attr('y2', height);
    crosshairHorizontal
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', localY)
      .attr('y2', localY);
    crosshairPoint
      .attr('cx', localX)
      .attr('cy', localY);

    const formattedCurrent = crosshairFormat(currentValue);
    const formattedTime = crosshairFormat(timeValue);
    readoutText.text(`I: ${formattedCurrent} A • t: ${formattedTime} s`);
    const textNode = readoutText.node();
    const bbox = textNode ? textNode.getBBox() : { width: 0, height: 0 };
    const paddingX = 8;
    const paddingY = 6;
    const boxWidth = Math.max(48, bbox.width + paddingX * 2);
    const boxHeight = Math.max(24, bbox.height + paddingY * 2);
    const targetX = Math.min(Math.max(localX + 12, 0), width - boxWidth);
    const targetY = Math.min(Math.max(localY - boxHeight - 12, 0), height - boxHeight);
    readoutGroup.attr('transform', `translate(${targetX},${targetY})`);
    readoutBackground
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', boxWidth)
      .attr('height', boxHeight);
  };

  chart
    .on('pointermove.crosshair', updateCrosshair)
    .on('pointerenter.crosshair', updateCrosshair)
    .on('pointerleave.crosshair', hideCrosshair);

  hideCrosshair();

  const updateDeviceInputs = entry => {
    if (!settingsDiv) return;
    const div = findSettingsDeviceDiv(entry.selection.uid);
    if (!div) return;
    Object.entries(entry.overrides).forEach(([field, value]) => {
      const input = div.querySelector(`[data-field="${field}"]`);
      if (!input) return;
      const sanitized = snapSettingValue(entry.selection.baseDevice, field, value);
      entry.overrides[field] = sanitized;
      const formatted = formatSettingValue(sanitized);
      if (input.tagName === 'SELECT') {
        const valueStr = String(sanitized ?? '');
        const option = [...input.options].find(o => o.value === valueStr);
        if (option) {
          input.value = valueStr;
        }
      } else if (formatted !== '') {
        input.value = formatted;
      }
    });
  };

  const createDragBehavior = entry => d3.drag()
    .on('start', event => {
      event.sourceEvent?.stopPropagation?.();
      const curve = entry.scaled.curve || [];
      const reference = curve[Math.floor(curve.length / 2)] || curve[0];
      if (!reference) return;
      entry.dragState = {
        reference,
        offsetX: event.x - x(reference.current),
        offsetY: event.y - y(reference.time),
        startPickup: entry.overrides.pickup ?? entry.scaled.settings?.pickup ?? entry.selection.baseDevice.settings?.pickup ?? 1,
        startDelay: entry.overrides.time ?? entry.scaled.settings?.time ?? entry.selection.baseDevice.settings?.time ?? entry.selection.baseDevice.settings?.delay ?? 0.1
      };
      entry.path.attr('stroke-width', entry.relationship?.role === 'selected' ? 3.75 : 3);
    })
    .on('drag', event => {
      const state = entry.dragState;
      if (!state) return;
      const targetX = clampValue(event.x - state.offsetX, xMin + 1, xMax - 1);
      const targetY = clampValue(event.y - state.offsetY, Math.min(yMin, yMax) + 1, Math.max(yMin, yMax) - 1);
      const newCurrent = clampValue(x.invert(targetX), MIN_PICKUP, MAX_PICKUP * 10);
      const newTime = clampValue(y.invert(targetY), MIN_DELAY, MAX_DELAY);
      const ratioI = newCurrent / Math.max(state.reference.current, MIN_PICKUP);
      const ratioT = newTime / Math.max(state.reference.time, MIN_DELAY);
      entry.overrides.pickup = clampValue(state.startPickup * ratioI, MIN_PICKUP, MAX_PICKUP);
      entry.overrides.time = clampValue(state.startDelay * ratioT, MIN_DELAY, MAX_DELAY);
      updateDeviceInputs(entry);
      updateCurves();
    })
    .on('end', () => {
      entry.path.attr('stroke-width', entry.relationship?.role === 'selected' ? 3.25 : (entry.isGFP ? 2.5 : 2));
      entry.dragState = null;
      persistSettings();
      plot();
    });

  plotted.forEach(entry => {
    entry.path.call(createDragBehavior(entry));
  });

  const annotationLayer = g.append('g').attr('class', 'annotation-layer');
  annotationContext = { g, x, y, width, height, layer: annotationLayer };

  // Show arc flash overlay controls only when arc flash results are available
  if (arcFlashOverlayControls) {
    const afResultsAvailable = Boolean(
      studies?.arcFlash && Object.keys(studies.arcFlash).length > 0
    );
    arcFlashOverlayControls.classList.toggle('hidden', !afResultsAvailable);
  }

  setPlotAvailability(true);
  renderAnnotations();

  // Expose closures for autoCoordinate() which runs outside plot()
  activePlotted = plotted;
  activeCurvesUpdater = updateCurves;
  activeCoordMarkerDrawer = (coordResults, orderedEntries) => {
    indicatorLayer.selectAll('.tcc-coord-violation').remove();
    if (!coordResults) return;
    coordResults.forEach((r, i) => {
      if (i === 0 || !r.violations?.length) return;
      const upEntry = orderedEntries[i];
      const dnEntry = orderedEntries[i - 1];
      const upColor = upEntry?.color ?? 'red';
      const dnColor = dnEntry?.color ?? 'orange';
      r.violations.forEach(v => {
        const cx = x(v.current);
        if (!Number.isFinite(cx)) return;
        const s = 6;
        const uy = y(v.upstreamMinTime);
        if (Number.isFinite(uy)) {
          indicatorLayer.append('path')
            .attr('class', 'tcc-coord-violation')
            .attr('d', `M${cx},${uy - s} L${cx + s},${uy} L${cx},${uy + s} L${cx - s},${uy} Z`)
            .attr('fill', upColor)
            .attr('stroke', 'red')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.85);
        }
        const dy = y(v.downstreamMaxTime);
        if (Number.isFinite(dy)) {
          indicatorLayer.append('path')
            .attr('class', 'tcc-coord-violation')
            .attr('d', `M${cx},${dy - s} L${cx + s},${dy} L${cx},${dy + s} L${cx - s},${dy} Z`)
            .attr('fill', dnColor)
            .attr('stroke', 'darkorange')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.85);
        }
        if (Number.isFinite(uy) && Number.isFinite(dy)) {
          indicatorLayer.append('line')
            .attr('class', 'tcc-coord-violation')
            .attr('x1', cx).attr('x2', cx)
            .attr('y1', Math.min(uy, dy)).attr('y2', Math.max(uy, dy))
            .attr('stroke', 'red')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,2')
            .attr('opacity', 0.7);
        }
      });
    });
  };

  renderOneLinePreview(getActiveComponentId());
  clearPlotRefreshPending();
  updateCoordinationStatus(
    `${plotted.length} device ${plotted.length === 1 ? 'curve is' : 'curves are'} plotted. Run Auto-Coordinate to check margins.`,
    'ok'
  );
  renderCoordOrderList();
  updateCurves();
    finishPlotMeasurement({ plottedCount: plotted.length });
  } finally {
    Object.assign(state, {
      activeCoordMarkerDrawer,
      activeCurvesUpdater,
      activeEquipmentConstraintChecks,
      activeEquipmentOverlays,
      activeLegendFocusKey,
      activePlotted,
      annotationContext,
      lastCoordState
    });
  }
}
