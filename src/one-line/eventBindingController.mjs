export function createEventStateAdapter(descriptors) {
  const state = {};
  Object.defineProperties(state, Object.fromEntries(Object.entries(descriptors).map(([name, descriptor]) => [
    name,
    {
      configurable: false,
      enumerable: true,
      get: descriptor.get,
      ...(descriptor.set ? { set: descriptor.set } : {})
    }
  ])));
  return state;
}

export async function initializeOneLineEvents(context, state) {
  const { documentRef: document } = context;
  const {
    DEFAULT_DIAGRAM_ZOOM,
    DOUBLE_CLICK_THRESHOLD_MS,
    DRAG_MOVE_THRESHOLD,
    Element,
    HTMLElement,
    SINGLE_CLICK_DELAY_MS,
    URLSearchParams,
    addComponent,
    addPaletteSymbol,
    addSheet,
    adjustZoom,
    alignSelection,
    applyCableResultToConnection,
    applyDiagramZoom,
    applyDrawingModeClass,
    applyNextLabel,
    applyPropertyClipboardToComponent,
    arrangeDuctbankSampleLayout,
    asset,
    attachLocalWheelScroll,
    autoAttachComponent,
    bindHistorySidebarControls,
    buildDragSnapGuides,
    buildPalette,
    canPastePropertyClipboard,
    cancelPendingClickSelection,
    captureBusAnchors,
    categoryForType,
    chooseCable,
    clampPaletteWidth,
    clampStudiesWidth,
    clearBackground,
    closePaletteContextMenu,
    commandForShortcut,
    compHeight,
    compWidth,
    componentBounds,
    computeDragConnections,
    createConnectionPreviewLine,
    createLayer,
    createPropertyClipboardFromComponent,
    createProtectionZone,
    customComponentStorageKey,
    defaultLabelAnchor,
    deleteSheet,
    distributeSelection,
    editCableComponent,
    editManufacturerDefaults,
    editPrefixes,
    ensureBaselineComponentMetadata,
    ensureBaselineFieldsOnComponent,
    ensureGeneratorStudyFieldsOnComponent,
    ensureGeneratorStudyMetadata,
    ensureMccFieldsOnComponent,
    ensureMccMetadata,
    ensurePropModal,
    ensurePtVtFieldsOnComponent,
    ensurePtVtMetadata,
    ensureStudyInputFieldsOnComponent,
    ensureStudyInputMetadata,
    executeShortcutCommand,
    exitZoneAssignMode,
    exportAllReports,
    exportDWG,
    exportDXF,
    exportDiagram,
    exportOneLineDiagnostics,
    exportPDF,
    finalizeMarqueeSelection,
    findComponentByTag,
    finishConnectionToCandidate,
    flashSnapIndicator,
    focusComponentElement,
    focusCrossProbeTarget,
    getConnectionCandidateFromEvent,
    getItem,
    getOneLine,
    getOneLineViewSetting,
    getViewportCenter,
    groupSelection,
    handleImport,
    highlightFoundComponent,
    historyController,
    inferSchemaFromProps,
    initCompactMode,
    initDarkMode,
    initNavToggle,
    initSettings,
    isComponentPositionLocked,
    isComponentPropertiesLocked,
    isConductorSegmentComponent,
    loadComponentLibrary,
    loadSampleDiagram,
    loadSheet,
    loadTemplates,
    markScheduleReconcilePending,
    navigateToCustomComponentEditor,
    nearestPortToPoint,
    nearestPorts,
    normalizeComponent,
    normalizeComponentElectricalProperties,
    normalizePortsForCategory,
    openAutoBuildModal,
    openKeyboardShortcutsModal,
    openModal,
    openScheduleReconcileModal,
    openShapeModal,
    openViewModal,
    paletteContextMenu,
    paletteWidthStorageKey,
    panDiagram,
    performance,
    placeConnectionWaypoint,
    portPosition,
    promptDialog,
    pushHistory,
    reassignBusAnchors,
    rebuildComponentMaps,
    recordHistoryEvent,
    recordPaletteUsage,
    redo,
    refineOneLineCommandSurface,
    refreshAttributeOptions,
    renameSheet,
    render,
    renderBgPanel,
    renderHistorySidebar,
    renderLayerPanel,
    renderMinimap,
    renderProtectionZonesPanel,
    renderSheetTabs,
    renderTemplates,
    renderTitleBlock,
    repeatLastCommand,
    requestAnimationFrame,
    resetConnectInteraction,
    resetConnectionWaypoint,
    resolveComponentMeta,
    resolveComponentMetaKey,
    resolveInitialCrossProbe,
    runRepeatableCommand,
    save,
    scheduleNoncriticalWork,
    selectByType,
    selectComponent,
    selectConnected,
    serializeDiagram,
    setActiveOperatingState,
    setDataStateOverlayMode,
    setDatablockDensityMode,
    setDatablockFormatMode,
    setDiagramZoom,
    setDrawingMode,
    setItem,
    setOneLineViewSetting,
    setTimeout,
    setupLibraryTools,
    setupToolbarMenus,
    shareDiagram,
    showToast,
    snapToNearestBus,
    startMiddlePan,
    startTour,
    stopMiddlePan,
    studiesPanel,
    studiesWidthStorageKey,
    syncDataStateOverlayControl,
    syncDatablockDensityControl,
    syncDatablockFormatControl,
    syncDrawingModeControl,
    syncOperatingStateControl,
    toDiagramCoords,
    toggleComponentInZone,
    toggleGrid,
    toggleLock,
    togglePaletteFavorite,
    togglePropertiesLock,
    undo,
    ungroupComponent,
    updateBusPorts,
    updateMiddlePan,
    updateShortcutControlLabels,
    updateStatusBar,
    updateViewButtonLabel,
    updateZoomDisplay,
    uploadBackground,
    validateDiagram,
    window,
    writeAppSetting,
    zoomToFit,
    zoomToSelection
  } = context;

  state.lintPanel = document.getElementById('lint-panel');
  state.lintList = document.getElementById('lint-list');
  const lintCloseBtn = document.getElementById('lint-close-btn');
  if (lintCloseBtn) lintCloseBtn.addEventListener('click', () => state.lintPanel.classList.add('hidden'));

  let svg = document.getElementById('diagram');
  if (!svg) {
    svg = document.querySelector('svg');
    if (svg) svg.id = 'diagram';
  }
  if (svg) {
    svg.addEventListener('dragover', e => e.preventDefault());
    svg.addEventListener('drop', e => {
      e.preventDefault();
      const dataText = e.dataTransfer.getData('text/plain');
      if (!dataText) return;
      let info;
      try {
        info = JSON.parse(dataText);
      } catch {
        showToast('Cannot drop component');
        return;
      }
      const coords = toDiagramCoords(e);
      const { left, top } = svg.getBoundingClientRect();
      const fallbackX = e.clientX - left;
      const fallbackY = e.clientY - top;
      const x = Number.isFinite(coords?.x) ? coords.x : fallbackX;
      const y = Number.isFinite(coords?.y) ? coords.y : fallbackY;
      const comp = addComponent({ type: info.type, subtype: info.subtype, x, y, skipHistory: true });
      recordPaletteUsage(info.subtype);
      buildPalette();
      if (!snapToNearestBus(comp)) {
        autoAttachComponent(comp);
      }
      pushHistory();
      render();
      save();
      const elem = svg.querySelector(`g.component[data-id="${comp.id}"]`);
      if (elem) {
        elem.classList.add('flash');
        setTimeout(() => elem.classList.remove('flash'), 500);
      }
    });
  }

  const { sheets: storedSheets, activeSheet: storedActive = 0 } = getOneLine();
  state.sheets = storedSheets.map((s, i) => ({
    name: s.name || `Sheet ${i + 1}`,
    components: (s.components || []).map(normalizeComponent),
    connections: Array.isArray(s.connections) ? s.connections : [],
    layers: Array.isArray(s.layers) ? s.layers : [],
    protectionZones: Array.isArray(s.protectionZones) ? s.protectionZones : [],
    // Gap #52: preserve background image underlay per sheet
    ...(s.backgroundImage ? { backgroundImage: s.backgroundImage } : {})
  }));
  if (!state.sheets.length) state.sheets = [{ name: 'Sheet 1', components: [], connections: [] }];

  state.sheets.forEach(s => {
    s.components.forEach(c => {
      if (c.type === 'dimension') return;
      const resolvedMetaKey = resolveComponentMetaKey(c);
      if (resolvedMetaKey && resolvedMetaKey !== c.subtype && state.componentMeta[resolvedMetaKey]) {
        c.subtype = resolvedMetaKey;
      }
      if (!state.componentMeta[c.subtype]) {
        const icon = state.typeIcons[c.type] || asset('icons/equipment.svg');
        const category = categoryForType(c.type);
        state.componentMeta[c.subtype] = {
          icon,
          label: c.subtype,
          category,
          type: c.type,
          ports: normalizePortsForCategory(category, c.ports, c.type, c.subtype, c.width || compWidth, c.height || compHeight)
        };
      }
      if (!state.propSchemas[c.subtype]) {
        const skip = new Set(['id', 'type', 'subtype', 'x', 'y', 'rotation', 'rotationManual', 'flipped', 'connections', 'label', 'ref', 'props']);
        const raw = {};
        Object.entries(c).forEach(([k, v]) => {
          if (skip.has(k)) return;
          if (v && typeof v === 'object') return;
          raw[k] = v;
        });
        state.propSchemas[c.subtype] = inferSchemaFromProps(raw);
      }
      const currentMeta = resolveComponentMeta(c);
      ensureBaselineFieldsOnComponent(c, currentMeta);
      ensureGeneratorStudyFieldsOnComponent(c, currentMeta);
      ensureMccFieldsOnComponent(c, currentMeta);
      ensurePtVtFieldsOnComponent(c, currentMeta);
      ensureStudyInputFieldsOnComponent(c, currentMeta);
      normalizeComponentElectricalProperties(c);
    });
  });
  rebuildComponentMaps();
  Object.keys(state.componentMeta).forEach(sub => {
    if (!state.propSchemas[sub]) state.propSchemas[sub] = inferSchemaFromProps(state.componentMeta[sub].props || {});
  });
  ensureBaselineComponentMetadata();
  ensureGeneratorStudyMetadata();
  ensureMccMetadata();
  ensurePtVtMetadata();
  ensureStudyInputMetadata();
  state.sheets.forEach(s => {
    s.components.forEach(c => {
      (c.connections || []).forEach(conn => {
        const target = s.components.find(t => t.id === conn.target);
        if (target && (conn.sourcePort === undefined || conn.targetPort === undefined)) {
          const [sp, tp] = nearestPorts(c, target);
          conn.sourcePort = sp;
          conn.targetPort = tp;
        }
      });
    });
  });

  // initialize counters from existing labels
  state.labelCounters = getItem('labelCounters', state.labelCounters);
  state.sheets.forEach(s => {
    s.components.forEach(c => {
      const m = (c.label || '').match(/(\d+)$/);
      if (m) {
        const num = Number(m[1]);
        if (!state.labelCounters[c.subtype] || state.labelCounters[c.subtype] < num) {
          state.labelCounters[c.subtype] = num;
        }
      }
    });
  });
  const normalizedStoredActive = Number.isInteger(storedActive) ? storedActive : 0;
  state.activeSheet = Math.min(Math.max(normalizedStoredActive, 0), state.sheets.length - 1);
  state.components = state.sheets[state.activeSheet].components;
  state.connections = state.sheets[state.activeSheet].connections;
  // Gap #51: load layers for the initial active sheet
  state.layers = Array.isArray(state.sheets[state.activeSheet]?.layers) ? state.sheets[state.activeSheet].layers : [];
  state.activeLayerId = null;
  historyController.reset();
  state.checkpoints = [];
  state.historyEvents = [];
  recordHistoryEvent('init', 'History initialized');
  refreshAttributeOptions();
  renderSheetTabs();
  applyDrawingModeClass();
  render();
  renderLayerPanel();
  renderBgPanel();
  const initIssues = validateDiagram({ notify: false, revealPanel: false });

  const prefixBtn = document.getElementById('prefix-settings-btn');
  if (prefixBtn) prefixBtn.addEventListener('click', editPrefixes);

  const defaultsBtn = document.getElementById('update-defaults-btn');
  if (defaultsBtn) defaultsBtn.addEventListener('click', editManufacturerDefaults);

  const exportReportsBtn = document.getElementById('export-reports-btn');
  if (exportReportsBtn) exportReportsBtn.addEventListener('click', () => exportAllReports());

  scheduleNoncriticalWork(() => { buildPalette(); loadTemplates(); renderTemplates(); setupLibraryTools(); });
  const customComponentStorageSuffix = `:${customComponentStorageKey}`;
  window.addEventListener('storage', e => {
    if (!e.key) return;
    if (e.key === customComponentStorageKey || e.key.endsWith(customComponentStorageSuffix)) {
      loadComponentLibrary()
        .then(() => render())
        .catch(err => console.error('Custom component reload failed', err));
    }
  });
  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      state.connectMode = !state.connectMode;
      resetConnectInteraction({ keepMode: state.connectMode });
      connectBtn.classList.toggle('active', state.connectMode);
      render();
    });
  }
  const addShapeBtn = document.getElementById('add-shape-btn');
  if (addShapeBtn) {
    addShapeBtn.addEventListener('click', () => {
      openShapeModal();
    });
  }
  // dimension tool removed
  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('redo-btn').addEventListener('click', redo);
  bindHistorySidebarControls();
  renderHistorySidebar();

  // Gap #51: wire up the layers panel
  const layersToggleBtn = document.getElementById('layers-panel-toggle');
  const layersPanel = document.getElementById('layers-panel');
  const layersCloseBtn = document.getElementById('layers-close-btn');
  const addLayerBtn = document.getElementById('add-layer-btn');
  if (layersToggleBtn && layersPanel) {
    const layersPanelOpen = getOneLineViewSetting('layersPanelOpen', false);
    if (!layersPanelOpen) layersPanel.classList.add('hidden');
    layersToggleBtn.setAttribute('aria-expanded', String(!layersPanel.classList.contains('hidden')));
    layersToggleBtn.addEventListener('click', () => {
      const nowHidden = layersPanel.classList.toggle('hidden');
      layersToggleBtn.setAttribute('aria-expanded', String(!nowHidden));
      setOneLineViewSetting('layersPanelOpen', !nowHidden);
    });
  }
  if (layersCloseBtn && layersPanel) {
    layersCloseBtn.addEventListener('click', () => {
      layersPanel.classList.add('hidden');
      if (layersToggleBtn) layersToggleBtn.setAttribute('aria-expanded', 'false');
      setOneLineViewSetting('layersPanelOpen', false);
    });
  }
  if (addLayerBtn) {
    addLayerBtn.addEventListener('click', async () => {
      const name = await promptDialog('Add Layer', 'Layer name', `Layer ${state.layers.length + 1}`);
      if (name) createLayer(name);
    });
  }

  // Gap #50: wire up protection zones panel
  const pzToggleBtn = document.getElementById('protection-zones-panel-toggle');
  const pzPanel = document.getElementById('protection-zones-panel');
  const pzCloseBtn = document.getElementById('protection-zones-close-btn');
  const addZoneBtn = document.getElementById('add-protection-zone-btn');
  const pzOverlayToggle = document.getElementById('toggle-protection-zones');
  const pzAssignDoneBtn = document.getElementById('zone-assign-done-btn');

  if (pzToggleBtn && pzPanel) {
    pzPanel.classList.add('hidden');
    pzToggleBtn.setAttribute('aria-expanded', 'false');
    pzToggleBtn.addEventListener('click', () => {
      const nowHidden = pzPanel.classList.toggle('hidden');
      pzToggleBtn.setAttribute('aria-expanded', String(!nowHidden));
      if (!nowHidden) renderProtectionZonesPanel();
    });
  }
  if (pzCloseBtn && pzPanel) {
    pzCloseBtn.addEventListener('click', () => {
      pzPanel.classList.add('hidden');
      if (pzToggleBtn) pzToggleBtn.setAttribute('aria-expanded', 'false');
      exitZoneAssignMode();
    });
  }
  if (addZoneBtn) {
    addZoneBtn.addEventListener('click', () => createProtectionZone(''));
  }
  if (pzOverlayToggle) {
    pzOverlayToggle.addEventListener('change', () => {
      state.showProtectionZones = pzOverlayToggle.checked;
      render();
    });
  }
  const hazAreaToggle = document.getElementById('toggle-haz-area');
  if (hazAreaToggle) {
    state.showHazAreaOverlay = Boolean(getOneLineViewSetting('showHazAreaOverlay', false));
    hazAreaToggle.checked = state.showHazAreaOverlay;
    hazAreaToggle.addEventListener('change', () => {
      state.showHazAreaOverlay = hazAreaToggle.checked;
      setOneLineViewSetting('showHazAreaOverlay', state.showHazAreaOverlay);
      render();
    });
  }
  if (pzAssignDoneBtn) {
    pzAssignDoneBtn.addEventListener('click', () => exitZoneAssignMode());
  }

  // Gap #52: wire up background image controls
  const bgImageBtn = document.getElementById('bg-image-btn');
  const bgImageInput = document.getElementById('bg-image-input');
  const bgImagePanel = document.getElementById('bg-image-panel');
  const bgImageCloseBtn = document.getElementById('bg-image-close-btn');
  const bgOpacitySlider = document.getElementById('bg-opacity-slider');
  const bgToggleBtn = document.getElementById('bg-toggle-btn');
  const bgClearBtn = document.getElementById('bg-clear-btn');
  if (bgImageBtn && bgImageInput) {
    bgImageBtn.addEventListener('click', () => bgImageInput.click());
    bgImageInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) uploadBackground(file);
      e.target.value = '';
    });
  }
  if (bgImageCloseBtn && bgImagePanel) {
    bgImageCloseBtn.addEventListener('click', () => bgImagePanel.classList.add('hidden'));
  }
  if (bgOpacitySlider) {
    bgOpacitySlider.addEventListener('input', e => {
      const bg = state.sheets[state.activeSheet]?.backgroundImage;
      if (!bg) return;
      bg.opacity = Number(e.target.value) / 100;
      const underlayEl = document.getElementById('bg-underlay');
      if (underlayEl) underlayEl.setAttribute('opacity', String(bg.opacity));
      save();
    });
  }
  if (bgToggleBtn) {
    bgToggleBtn.addEventListener('click', () => {
      const bg = state.sheets[state.activeSheet]?.backgroundImage;
      if (!bg) return;
      bg.visible = bg.visible === false;
      save();
      render();
      renderBgPanel();
    });
  }
  if (bgClearBtn) {
    bgClearBtn.addEventListener('click', clearBackground);
  }

  document.getElementById('align-left-btn').addEventListener('click', () => alignSelection('left'));
  document.getElementById('align-right-btn').addEventListener('click', () => alignSelection('right'));
  document.getElementById('align-top-btn').addEventListener('click', () => alignSelection('top'));
  document.getElementById('align-bottom-btn').addEventListener('click', () => alignSelection('bottom'));
  document.getElementById('distribute-h-btn').addEventListener('click', () => distributeSelection('h'));
  document.getElementById('distribute-v-btn').addEventListener('click', () => distributeSelection('v'));
  const autoSpaceEquipmentBtn = document.getElementById('auto-space-equipment-btn');
  if (autoSpaceEquipmentBtn) autoSpaceEquipmentBtn.addEventListener('click', () => runRepeatableCommand({ id: 'auto-space' }));
  const exportBtn = document.getElementById('export-btn');
  const exportMenu = document.getElementById('export-menu');
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener('click', () => {
      const expanded = exportBtn.getAttribute('aria-expanded') === 'true';
      exportBtn.setAttribute('aria-expanded', String(!expanded));
      exportMenu.classList.toggle('show');
    });
    exportMenu.addEventListener('click', e => {
      const format = e.target?.dataset?.format;
      if (!format) return;
      exportMenu.classList.remove('show');
      exportBtn.setAttribute('aria-expanded', 'false');
      if (format === 'pdf') {
        exportPDF({
          svgEl: document.getElementById('diagram'),
          sheets: state.sheets,
          loadSheet,
          serializeDiagram,
          activeSheet: state.activeSheet
        });
      } else if (format === 'dxf') {
        exportDXF(state.sheets[state.activeSheet]?.components || []);
      } else if (format === 'dwg') {
        exportDWG(state.sheets[state.activeSheet]?.components || []);
      }
    });
  }
  const viewMenuBtn = document.getElementById('view-menu-btn');
  if (viewMenuBtn) {
    viewMenuBtn.setAttribute('aria-expanded', 'false');
    viewMenuBtn.addEventListener('click', event => {
      event.preventDefault();
      if (viewMenuBtn.disabled) return;
      openViewModal();
    });
    updateViewButtonLabel();
  }
  const drawingModeSelect = document.getElementById('drawing-mode-select');
  if (drawingModeSelect) {
    syncDrawingModeControl();
    drawingModeSelect.addEventListener('change', event => {
      setDrawingMode(event.target.value);
    });
  }
  const datablockFormatSelect = document.getElementById('datablock-format-select');
  if (datablockFormatSelect) {
    syncDatablockFormatControl();
    datablockFormatSelect.addEventListener('change', event => {
      setDatablockFormatMode(event.target.value);
    });
  }
  const datablockDensitySelect = document.getElementById('datablock-density-select');
  if (datablockDensitySelect) {
    syncDatablockDensityControl();
    datablockDensitySelect.addEventListener('change', event => {
      setDatablockDensityMode(event.target.value);
    });
  }
  const dataStateOverlaySelect = document.getElementById('data-state-overlay-select');
  if (dataStateOverlaySelect) {
    syncDataStateOverlayControl();
    dataStateOverlaySelect.addEventListener('change', event => {
      setDataStateOverlayMode(event.target.value);
    });
  }
  const operatingStateSelect = document.getElementById('operating-state-select');
  if (operatingStateSelect) {
    syncOperatingStateControl();
    operatingStateSelect.addEventListener('change', event => {
      setActiveOperatingState(event.target.value);
    });
  }
  const importBtn = document.getElementById('import-btn');
  if (importBtn) importBtn.addEventListener('click', () => document.getElementById('import-input').click());
  const importInput = document.getElementById('import-input');
  if (importInput) importInput.addEventListener('change', handleImport);
  const diagramExportBtn = document.getElementById('diagram-export-btn');
  if (diagramExportBtn) diagramExportBtn.addEventListener('click', exportDiagram);
  const diagramImportBtn = document.getElementById('diagram-import-btn');
  if (diagramImportBtn) diagramImportBtn.addEventListener('click', () => document.getElementById('diagram-import-input').click());
  const diagramImportInput = document.getElementById('diagram-import-input');
  if (diagramImportInput) diagramImportInput.addEventListener('change', handleImport);
  const shareBtn = document.getElementById('diagram-share-btn');
  if (shareBtn) shareBtn.addEventListener('click', shareDiagram);
  const sampleBtn = document.getElementById('sample-diagram-btn');
  if (sampleBtn) sampleBtn.addEventListener('click', loadSampleDiagram);
  const autoBuildBtn = document.getElementById('auto-build-oneline-btn');
  if (autoBuildBtn) autoBuildBtn.addEventListener('click', openAutoBuildModal);
  const autoArrangeBtn = document.getElementById('auto-arrange-btn');
  if (autoArrangeBtn) autoArrangeBtn.addEventListener('click', () => runRepeatableCommand({ id: 'auto-arrange' }));
  const reconcileBtn = document.getElementById('reconcile-schedules-btn');
  if (reconcileBtn) reconcileBtn.addEventListener('click', openScheduleReconcileModal);
  const primaryReconcileBtn = document.getElementById('reconcile-schedules-primary-btn');
  if (primaryReconcileBtn) primaryReconcileBtn.addEventListener('click', openScheduleReconcileModal);
  const onelineExportBtn = document.getElementById('export-oneline-data-btn');
  if (onelineExportBtn) onelineExportBtn.addEventListener('click', exportOneLineDiagnostics);
  document.getElementById('add-sheet-btn').addEventListener('click', () => addSheet());
  document.getElementById('rename-sheet-btn').addEventListener('click', () => renameSheet());
  document.getElementById('delete-sheet-btn').addEventListener('click', () => deleteSheet());
  document.getElementById('validate-btn').addEventListener('click', () => validateDiagram({ revealPanel: true }));

  updateZoomDisplay();
  applyDiagramZoom();
  window.addEventListener('resize', () => applyDiagramZoom());
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomResetBtn = document.getElementById('zoom-reset-btn');
  zoomInBtn?.addEventListener('click', () => {
    const focus = getViewportCenter();
    adjustZoom(1.2, focus ? { focusPoint: focus } : {});
  });
  zoomOutBtn?.addEventListener('click', () => {
    const focus = getViewportCenter();
    adjustZoom(1 / 1.2, focus ? { focusPoint: focus } : {});
  });
  zoomResetBtn?.addEventListener('click', () => {
    const focus = getViewportCenter();
    setDiagramZoom(DEFAULT_DIAGRAM_ZOOM, focus ? { focusPoint: focus } : {});
  });
  const zoomFitBtn = document.getElementById('zoom-fit-btn');
  zoomFitBtn?.addEventListener('click', () => zoomToFit());

  const panUpBtn = document.getElementById('pan-up-btn');
  const panDownBtn = document.getElementById('pan-down-btn');
  const panLeftBtn = document.getElementById('pan-left-btn');
  const panRightBtn = document.getElementById('pan-right-btn');
  const bindPan = (btn, direction) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!canvasScroll) return;
      panDiagram(direction, canvasScroll);
    });
  };
  bindPan(panUpBtn, 'up');
  bindPan(panDownBtn, 'down');
  bindPan(panLeftBtn, 'left');
  bindPan(panRightBtn, 'right');

  document.addEventListener('keydown', e => {
    if (!canvasScroll) return;
    if (e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target) {
      const tag = target.tagName;
      if (target.isContentEditable) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'OPTION') return;
    }
    const isArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    if (!isArrow) return;
    e.preventDefault();
    const nudgeTargets = state.selection.length ? state.selection : state.selected ? [state.selected] : [];
    if (nudgeTargets.length) {
      const step = e.shiftKey ? (state.gridSize || 20) * 4 : (state.gridSize || 20);
      let moved = false;
      nudgeTargets.forEach(c => {
        if (isComponentPositionLocked(c)) return;
        if (e.key === 'ArrowUp') c.y -= step;
        else if (e.key === 'ArrowDown') c.y += step;
        else if (e.key === 'ArrowLeft') c.x -= step;
        else if (e.key === 'ArrowRight') c.x += step;
        moved = true;
      });
      if (moved) {
        pushHistory();
        render();
        save();
      }
    } else {
      const dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowLeft' ? 'left' : 'right';
      panDiagram(dir, canvasScroll);
    }
  });

  const gridToggle = document.getElementById('grid-toggle');
  const gridSizeInput = document.getElementById('grid-size');
  const alignmentGuidesToggle = document.getElementById('alignment-guides-toggle');
  const gridPattern = document.getElementById('grid');
  const gridPath = gridPattern.querySelector('path');
  if (gridToggle) gridToggle.checked = state.gridEnabled;
  if (alignmentGuidesToggle) alignmentGuidesToggle.checked = state.alignmentGuidesEnabled;
  if (gridSizeInput) gridSizeInput.value = state.gridSize;
  gridPattern.setAttribute('width', state.gridSize);
  gridPattern.setAttribute('height', state.gridSize);
  gridPath.setAttribute('d', `M${state.gridSize} 0 L0 0 0 ${state.gridSize}`);
  document.getElementById('grid-bg').style.display = state.gridEnabled ? 'block' : 'none';
  gridToggle?.addEventListener('change', toggleGrid);
  alignmentGuidesToggle?.addEventListener('change', event => {
    state.alignmentGuidesEnabled = event.target.checked;
    setOneLineViewSetting('alignmentGuidesEnabled', state.alignmentGuidesEnabled);
    if (!state.alignmentGuidesEnabled && state.dragSnapGuides) {
      state.dragSnapGuides = null;
      render();
    }
  });
  gridSizeInput?.addEventListener('change', e => {
    state.gridSize = Number(e.target.value) || 20;
    gridPattern.setAttribute('width', state.gridSize);
    gridPattern.setAttribute('height', state.gridSize);
    gridPath.setAttribute('d', `M${state.gridSize} 0 L0 0 0 ${state.gridSize}`);
    setOneLineViewSetting('gridSize', state.gridSize);
    render();
  });

  const findForm = document.getElementById('find-device-form');
  const findInput = document.getElementById('find-device-input');
  const diagramFilterSelect = document.getElementById('diagram-filter-select');
  if (diagramFilterSelect) {
    diagramFilterSelect.value = state.diagramFilterMode;
    diagramFilterSelect.addEventListener('change', event => {
      state.diagramFilterMode = event.target.value || 'all';
      setOneLineViewSetting('oneLineDiagramFilterMode', state.diagramFilterMode);
      render();
    });
  }
  if (findForm && findInput) {
    findForm.addEventListener('submit', e => {
      e.preventDefault();
      const query = findInput.value.trim();
      if (!query) {
        showToast('Enter a device tag to find');
        findInput.focus();
        return;
      }
      const match = findComponentByTag(query);
      if (!match) {
        showToast(`No device found matching "${query}"`);
        return;
      }
      state.selection = [match];
      state.selected = match;
      state.selectedConnection = null;
      highlightFoundComponent(match.id);
      focusComponentElement(match);
      showToast(`Selected ${match.label || match.subtype || match.id}`);
    });
  }

  const workspaceEl = document.querySelector('.workspace');
  const splitter = document.querySelector('.splitter');
  const paletteToggle = document.getElementById('palette-toggle');

  if (workspaceEl) {
    workspaceEl.style.setProperty('--palette-width', `${state.paletteWidth}px`);
  }
  if (splitter) {
    splitter.style.left = `${state.paletteWidth}px`;
  }

  splitter?.addEventListener('mousedown', e => {
    state.resizingPalette = true;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    let handled = false;
    if (state.resizingPalette && workspaceEl) {
      const rect = workspaceEl.getBoundingClientRect();
      const nextWidth = clampPaletteWidth(e.clientX - rect.left, state.paletteWidth);
      if (nextWidth !== state.paletteWidth) {
        state.paletteWidth = nextWidth;
        workspaceEl.style.setProperty('--palette-width', `${state.paletteWidth}px`);
        workspaceEl.style.gridTemplateColumns = `${state.paletteWidth}px 1fr`;
        if (splitter) splitter.style.left = `${state.paletteWidth}px`;
      }
      handled = true;
    }
    if (state.resizingStudiesPanel && studiesPanel) {
      const delta = state.studiesResizeStartX - e.clientX;
      const nextWidth = clampStudiesWidth(state.studiesResizeStartWidth + delta, state.studiesWidth);
      if (nextWidth !== state.studiesWidth) {
        state.studiesWidth = nextWidth;
        studiesPanel.style.setProperty('--studies-width', `${state.studiesWidth}px`);
      }
      handled = true;
    }
    if (handled) {
      e.preventDefault();
    }
  });

  document.addEventListener('mouseup', () => {
    const wasResizingPalette = state.resizingPalette;
    const wasResizingStudies = state.resizingStudiesPanel;
    state.resizingPalette = false;
    state.resizingStudiesPanel = false;
    if (wasResizingPalette) {
      if (workspaceEl) {
        workspaceEl.style.setProperty('--palette-width', `${state.paletteWidth}px`);
      }
      setOneLineViewSetting(paletteWidthStorageKey, Math.round(state.paletteWidth));
    }
    if (wasResizingStudies && studiesPanel) {
      studiesPanel.classList.remove('is-resizing');
      studiesPanel.style.setProperty('--studies-width', `${state.studiesWidth}px`);
      if (Number.isFinite(state.studiesWidth)) {
        setOneLineViewSetting(studiesWidthStorageKey, Math.round(state.studiesWidth));
      }
    } else if (studiesPanel) {
      studiesPanel.classList.remove('is-resizing');
    }
    let needsRender = false;
    let needsSave = false;
    if (state.draggingLabel) {
      const moved = state.draggingLabel.moved;
      state.draggingLabel = null;
      if (moved) {
        pushHistory();
        needsRender = true;
        needsSave = true;
      }
    }
    if (state.resizingAnnotation) {
      const data = state.resizingAnnotation;
      state.resizingAnnotation = null;
      const comp = data.comp;
      if (comp) {
        const widthChanged = Math.abs((comp.width || 0) - data.startWidth) > 0.01;
        const heightChanged = Math.abs((comp.height || 0) - data.startHeight) > 0.01;
        if (widthChanged || heightChanged) {
          pushHistory();
          needsSave = true;
        }
        needsRender = true;
      }
    }
    if (state.marquee && state.marquee.active) {
      const changed = finalizeMarqueeSelection();
      state.marqueeSelectionMade = changed;
      needsRender = true;
    }
    if (needsRender) {
      render();
    }
    if (needsSave) {
      save();
    }
  });

  paletteToggle?.addEventListener('click', () => {
    if (!workspaceEl) return;
    const show = !workspaceEl.classList.contains('show-palette');
    const narrow = window.matchMedia?.('(max-width: 600px)')?.matches === true;
    workspaceEl.classList.toggle('show-palette', show);
    document.body.classList.toggle('palette-drawer-open', show && narrow);
    paletteToggle.setAttribute('aria-expanded', show);
    if (show) {
      workspaceEl.style.setProperty('--palette-width', `${state.paletteWidth}px`);
      workspaceEl.style.gridTemplateColumns = narrow ? '1fr' : `${state.paletteWidth}px 1fr`;
      if (splitter) splitter.style.left = `${state.paletteWidth}px`;
    } else {
      workspaceEl.style.gridTemplateColumns = '1fr';
    }
  });

  const editorEl = document.querySelector('.oneline-editor');
  const canvasScroll = document.querySelector('.oneline-canvas-scroll') || editorEl;
  const paletteRoot = document.getElementById('palette');
  const paletteScroll = paletteRoot?.querySelector('.palette-scroll');
  if (paletteScroll instanceof HTMLElement) {
    attachLocalWheelScroll(paletteScroll);
  } else {
    attachLocalWheelScroll(paletteRoot);
  }
  attachLocalWheelScroll(canvasScroll);
  // Gap #39 – Update minimap viewport on scroll
  if (canvasScroll) {
    canvasScroll.addEventListener('scroll', () => renderMinimap(), { passive: true });
  }
  const legendEl = document.getElementById('voltage-legend');
  if (canvasScroll) {
    canvasScroll.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const focus = toDiagramCoords(e);
      e.preventDefault();
      adjustZoom(factor, { focusPoint: focus });
    }, { passive: false });
  }
  legendEl?.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    state.legendDrag = {
      dx: e.offsetX,
      dy: e.offsetY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false
    };
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!state.middlePanState) return;
    updateMiddlePan(e);
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!state.legendDrag || !legendEl || !canvasScroll) return;
    const rect = canvasScroll.getBoundingClientRect();
    const parent = legendEl.offsetParent instanceof HTMLElement ? legendEl.offsetParent : canvasScroll;
    const boundsWidth = parent instanceof HTMLElement ? parent.clientWidth : rect.width;
    const boundsHeight = parent instanceof HTMLElement ? parent.clientHeight : rect.height;
    const rawLeft = e.clientX - rect.left - state.legendDrag.dx;
    const rawTop = e.clientY - rect.top - state.legendDrag.dy;
    const clampedLeft = Math.max(0, Math.min(boundsWidth - legendEl.offsetWidth, rawLeft));
    const clampedTop = Math.max(0, Math.min(boundsHeight - legendEl.offsetHeight, rawTop));
    legendEl.style.left = `${clampedLeft}px`;
    legendEl.style.top = `${clampedTop}px`;
    if (!state.legendDrag.moved) {
      const deltaX = Math.abs(e.clientX - state.legendDrag.startX);
      const deltaY = Math.abs(e.clientY - state.legendDrag.startY);
      if (deltaX > 2 || deltaY > 2) state.legendDrag.moved = true;
    }
  });
  document.addEventListener('mouseup', () => {
    if (state.legendDrag?.moved) state.legendUserMoved = true;
    state.legendDrag = null;
    stopMiddlePan();
  });

  // Reuse the diagram element fetched earlier in this function.
  // Avoid redeclaring the `svg` constant to prevent "Identifier has already been declared" errors.
  const menu = document.getElementById('context-menu');
    svg.addEventListener('mousedown', e => {
      cancelPendingClickSelection();
      state.marqueeSelectionMade = false;
      state.pointerDownComponentId = null;
      state.dragSnapGuides = null;
      if (e.button === 1) {
        if (canvasScroll) {
          e.preventDefault();
          startMiddlePan(e, canvasScroll);
        }
        return;
      }
      const coords = toDiagramCoords(e);
      const pointerX = coords.x;
      const pointerY = coords.y;
      if (state.connectMode) {
        const candidate = getConnectionCandidateFromEvent(e, pointerX, pointerY);
        if (candidate) {
          e.preventDefault();
          state.pointerDownComponentId = null;
          if (!state.connectSource) {
            state.connectSource = candidate;
            state.selected = candidate.component;
            state.selection = [candidate.component];
            state.selectedConnection = null;
            if (state.tempConnection) {
              state.tempConnection.remove();
              state.tempConnection = null;
            }
            render();
            showToast('Select the next device to complete the connection.');
          } else {
            finishConnectionToCandidate(candidate, { provisional: true });
            resetConnectInteraction({ keepMode: false });
            render();
          }
          updateStatusBar();
          return;
        }
        showToast('Click a device body, label, or visible port to connect.');
        return;
      }
      if (e.target.classList.contains('annotation-handle')) {
        const comp = state.components.find(c => c.id === e.target.dataset.id);
        if (comp) {
          state.pointerDownComponentId = comp.id;
          state.resizingAnnotation = {
            comp,
            startX: pointerX,
            startY: pointerY,
            startWidth: comp.width || compWidth,
            startHeight: comp.height || compHeight,
            changed: false
          };
        }
        return;
      }
      if (e.target.classList.contains('bus-handle')) {
        const comp = state.components.find(c => c.id === e.target.dataset.id);
        if (comp) {
          state.pointerDownComponentId = comp.id;
          state.resizingBus = {
            comp,
            startX: pointerX,
            startWidth: comp.width,
            startCompX: comp.x,
            side: e.target.dataset.side || 'right',
            anchors: captureBusAnchors(comp)
          };
        }
        return;
      }
      const g = e.target.closest('.component');
      if (!g) {
        state.dragOffset = null;
        state.marquee = {
          active: true,
          x1: pointerX,
          y1: pointerY,
          x2: pointerX,
          y2: pointerY
        };
        return;
      }
      state.pointerDownComponentId = g.dataset.id || null;
      const comp = state.components.find(c => c.id === g.dataset.id);
      if (!comp) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (state.selection.includes(comp)) {
          state.selection = state.selection.filter(c => c !== comp);
        } else {
          state.selection.push(comp);
        }
      } else if (!state.selection.includes(comp)) {
        state.selection = [comp];
      }
      state.selected = comp;
      // Gap #41 – Locked components cannot be dragged
      state.dragOffset = state.selection.filter(c => !isComponentPositionLocked(c)).map(c => ({
        comp: c,
        dx: pointerX - c.x,
        dy: pointerY - c.y,
        startX: c.x,
        startY: c.y
      }));
      state.dragConnections = computeDragConnections(state.selection);
      state.dragging = false;
      render();
    });
    svg.addEventListener('mousemove', e => {
      if (state.middlePanState) return;
      if (state.draggingLabel) return;
      const coords = toDiagramCoords(e);
      const pointerX = coords.x;
      const pointerY = coords.y;
      state.cursorPos = { x: pointerX, y: pointerY };
      state.cursorPosValid = Number.isFinite(pointerX) && Number.isFinite(pointerY);
      updateStatusBar();
      if (state.resizingAnnotation) {
        const data = state.resizingAnnotation;
        const comp = data.comp;
        if (comp) {
          let newW = Math.max(40, data.startWidth + (pointerX - data.startX));
          let newH = Math.max(20, data.startHeight + (pointerY - data.startY));
          if (state.gridEnabled) {
            newW = Math.max(40, Math.round(newW / state.gridSize) * state.gridSize);
            newH = Math.max(20, Math.round(newH / state.gridSize) * state.gridSize);
          }
          if (comp.width !== newW || comp.height !== newH) {
            comp.width = newW;
            comp.height = newH;
            data.changed = true;
            render();
          }
        }
        return;
      }
      if (state.marquee && state.marquee.active) {
        state.marquee.x2 = pointerX;
        state.marquee.y2 = pointerY;
        render();
        return;
      }
      if (state.draggingConnection) {
        const { component, index, start, mid } = state.draggingConnection;
        const conn = component.connections[index];
        if (conn) {
          let nextMid;
          if (conn.dir === 'h') {
            nextMid = mid + (pointerX - start.x);
          } else {
            nextMid = mid + (pointerY - start.y);
          }
          if (state.gridEnabled) nextMid = Math.round(nextMid / state.gridSize) * state.gridSize;
          nextMid = Number(nextMid.toFixed(2));
          if (conn.mid !== nextMid) {
            conn.mid = nextMid;
            state.draggingConnection.moved = true;
            render();
          }
        }
        return;
      }
      if (state.resizingBus) {
        let delta = pointerX - state.resizingBus.startX;
        if (state.resizingBus.side === 'right') {
          let newW = Math.max(40, state.resizingBus.startWidth + delta);
          if (state.gridEnabled) newW = Math.round(newW / state.gridSize) * state.gridSize;
          state.resizingBus.comp.width = newW;
        } else {
          let newW = Math.max(40, state.resizingBus.startWidth - delta);
          let newX = state.resizingBus.startCompX + delta;
          if (state.gridEnabled) {
            newW = Math.round(newW / state.gridSize) * state.gridSize;
            newX = Math.round(newX / state.gridSize) * state.gridSize;
          }
          if (newW === 40 && delta > state.resizingBus.startWidth - 40) {
            newX = state.resizingBus.startCompX + (state.resizingBus.startWidth - 40);
          }
          state.resizingBus.comp.width = newW;
          state.resizingBus.comp.x = newX;
        }
        updateBusPorts(state.resizingBus.comp);
        reassignBusAnchors(state.resizingBus.comp, state.resizingBus.anchors);
        render();
        return;
      }
      if (state.connectSource) {
        if (!state.tempConnection) {
          state.tempConnection = createConnectionPreviewLine(state.connectSource);
        }
        if (!state.tempConnection) return;
        const nearest = nearestPortToPoint(pointerX, pointerY, state.connectSource);
        let end = { x: pointerX, y: pointerY };
        state.hoverPort = null;
        if (nearest) {
          state.hoverPort = { component: nearest.component, port: nearest.port };
          end = nearest.pos;
        }
        state.tempConnection.setAttribute('x2', end.x);
        state.tempConnection.setAttribute('y2', end.y);
      }
    });
  svg.addEventListener('mousemove', e => {
    if (state.middlePanState) return;
    const coords = toDiagramCoords(e);
    const pointerX = coords.x;
    const pointerY = coords.y;
    if (state.draggingLabel) {
      let x = pointerX - state.draggingLabel.dx;
      let y = pointerY - state.draggingLabel.dy;
      if (state.gridEnabled) {
        x = Math.round(x / state.gridSize) * state.gridSize;
        y = Math.round(y / state.gridSize) * state.gridSize;
      }
      const comp = state.draggingLabel.component;
      const base = defaultLabelAnchor(comp);
      const newOffset = {
        x: Number((x - base.x).toFixed(2)),
        y: Number((y - base.y).toFixed(2))
      };
      const current = comp.labelOffset || { x: 0, y: 0 };
      if (newOffset.x !== current.x || newOffset.y !== current.y) {
        comp.labelOffset = newOffset;
        state.draggingLabel.moved = true;
        render();
      }
      return;
    }
    if (state.resizingAnnotation) return;
    if (state.marquee && state.marquee.active) return;
    if (state.resizingBus || state.draggingConnection) return;
    if (!state.dragOffset || !state.dragOffset.length) return;
    const projectedPositions = state.dragOffset.map(off => {
      const rawX = pointerX - off.dx;
      const rawY = pointerY - off.dy;
      return {
        off,
        rawX,
        rawY,
        x: state.gridEnabled ? Math.round(rawX / state.gridSize) * state.gridSize : rawX,
        y: state.gridEnabled ? Math.round(rawY / state.gridSize) * state.gridSize : rawY
      };
    });
    const primaryProjection = projectedPositions[0];
    const projectedPrimary = primaryProjection
      ? { ...primaryProjection.off.comp, x: primaryProjection.x, y: primaryProjection.y }
      : null;
    const nextSnapGuides = primaryProjection
      ? buildDragSnapGuides(projectedPrimary, new Set(state.dragOffset.map(off => off.comp.id)), {
        x: primaryProjection.off.startX,
        y: primaryProjection.off.startY
      })
      : null;
    const snapDeltaX = nextSnapGuides?.vertical?.delta || 0;
    const snapDeltaY = nextSnapGuides?.horizontal?.delta || 0;
    let snapPos = null;
    let moved = false;
    projectedPositions.forEach(({ off, rawX, rawY, x: projectedX, y: projectedY }) => {
      const x = projectedX + snapDeltaX;
      const y = projectedY + snapDeltaY;
      if (state.gridEnabled) {
        if (projectedX !== rawX || projectedY !== rawY) {
          snapPos = { x, y };
        }
      }
      const deltaX = Math.abs(rawX - off.startX);
      const deltaY = Math.abs(rawY - off.startY);
      const shouldMove = state.dragging || deltaX >= DRAG_MOVE_THRESHOLD || deltaY >= DRAG_MOVE_THRESHOLD;
      if (!shouldMove) return;
      if (!state.dragging) state.dragging = true;
      if (off.comp.x !== x || off.comp.y !== y) {
        off.comp.x = x;
        off.comp.y = y;
        moved = true;
      }
    });
    if (moved) {
      state.dragSnapGuides = nextSnapGuides;
      if (state.dragConnections && state.dragConnections.length) {
        state.dragConnections.forEach(entry => {
          const { conn, dir, source, target, offset } = entry;
          if (!conn || (dir !== 'h' && dir !== 'v')) return;
          const startPos = portPosition(source, conn.sourcePort);
          const endPos = target ? portPosition(target, conn.targetPort) : null;
          if (!startPos || !endPos) return;
          const base = dir === 'h'
            ? (startPos.x + endPos.x) / 2
            : (startPos.y + endPos.y) / 2;
          const nextMid = Number.isFinite(base)
            ? base + (Number.isFinite(offset) ? offset : 0)
            : base;
          if (Number.isFinite(nextMid)) {
            conn.mid = Number(nextMid.toFixed(2));
          }
        });
      }
      render();
      if (snapPos) flashSnapIndicator(snapPos.x, snapPos.y);
    }
  });
    svg.addEventListener('mouseup', async e => {
      if (e.button === 1 && state.middlePanState) {
        stopMiddlePan();
        state.pointerDownComponentId = null;
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (state.draggingLabel) {
        const moved = state.draggingLabel.moved;
        state.draggingLabel = null;
        if (moved) {
          pushHistory();
          render();
          save();
        }
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (state.resizingAnnotation) {
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (state.resizingBus) {
        state.resizingBus = null;
        pushHistory();
        render();
        save();
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (state.draggingConnection) {
        const moved = state.draggingConnection.moved;
        state.draggingConnection = null;
        if (moved) {
          pushHistory();
          render();
          save();
        }
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (state.marquee && state.marquee.active) {
        const changed = finalizeMarqueeSelection();
        state.marqueeSelectionMade = changed;
        render();
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (state.connectSource && state.tempConnection) {
        state.tempConnection.remove();
        state.tempConnection = null;
        if (state.hoverPort && state.hoverPort.component !== state.connectSource.component) {
          finishConnectionToCandidate(state.hoverPort, { provisional: true });
          resetConnectInteraction({ keepMode: false });
        } else {
          state.hoverPort = null;
          render();
          updateStatusBar();
        }
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      let movedDuringDrag = false;
      if (state.dragOffset && state.dragOffset.length) {
        if (state.dragging) {
          const moved = state.dragOffset.map(off => off.comp);
          const exclude = new Set(moved);
          moved.forEach(comp => {
            autoAttachComponent(comp, exclude);
          });
          pushHistory();
          render();
          save();
          movedDuringDrag = true;
        }
        state.dragSnapGuides = null;
        state.dragOffset = null;
        state.dragConnections = null;
        state.dragging = false;
      } else {
        state.dragOffset = null;
        state.dragConnections = null;
      }
      if (movedDuringDrag) {
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (e.button !== 0) {
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      const targetComponent = e.target instanceof Element ? e.target.closest('.component') : null;
      const compId = targetComponent?.dataset.id || state.pointerDownComponentId || null;
      if (!compId) {
        state.lastPointerUp = { id: null, time: 0 };
        return;
      }
      const now = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      if (state.lastPointerUp.id === compId && (now - state.lastPointerUp.time) <= DOUBLE_CLICK_THRESHOLD_MS) {
        state.lastPointerUp = { id: null, time: 0 };
        const comp = state.components.find(c => c.id === compId);
        if (comp) {
          cancelPendingClickSelection();
          state.lastComponentClick = { id: null, time: 0 };
          selectComponent(comp);
        }
        return;
      }
      state.lastPointerUp = { id: compId, time: now };
    });
  svg.addEventListener('click', e => {
    // Gap #50 – In zone assignment mode, clicks toggle component membership
    if (state.activeZoneId) {
      const compEl = e.target.closest('.component');
      const compId = compEl?.dataset.id;
      if (compId) {
        toggleComponentInZone(state.activeZoneId, compId);
        return;
      }
    }
    if (state.marqueeSelectionMade) {
      state.marqueeSelectionMade = false;
      state.pointerDownComponentId = null;
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      cancelPendingClickSelection();
      state.lastComponentClick = { id: null, time: 0 };
      state.pointerDownComponentId = null;
      return;
    }
    const compEl = e.target.closest('.component');
    let compId = compEl?.dataset.id || state.pointerDownComponentId || null;
    const clickedOutside = !compId;
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    cancelPendingClickSelection();
    state.pointerDownComponentId = null;
    if (compId && state.lastComponentClick.id === compId && (now - state.lastComponentClick.time) <= DOUBLE_CLICK_THRESHOLD_MS) {
      state.lastComponentClick = { id: null, time: 0 };
      const comp = state.components.find(c => c.id === compId);
      if (comp) {
        selectComponent(comp);
      }
      return;
    }
    state.lastComponentClick = { id: compId, time: now };
    if (e.detail > 1) return;
    state.clickSelectTimer = window.setTimeout(() => {
      state.clickSelectTimer = null;
      if (clickedOutside) {
        state.selection = [];
        state.selected = null;
        state.selectedConnection = null;
        render();
        return;
      }
      const comp = state.components.find(c => c.id === compId);
      if (!comp) return;
      state.selection = [comp];
      state.selected = comp;
      state.selectedConnection = null;
      render();
    }, SINGLE_CLICK_DELAY_MS);
  });

  svg.addEventListener('dblclick', e => {
    const targetComponent = e.target instanceof Element ? e.target.closest('g.component') : null;
    const compId = targetComponent?.dataset.id || state.pointerDownComponentId || null;
    state.pointerDownComponentId = null;
    if (!compId) return;
    const comp = state.components.find(c => c.id === compId);
    if (!comp) return;
    e.stopPropagation();
    cancelPendingClickSelection();
    state.lastComponentClick = { id: null, time: 0 };
    selectComponent(comp);
  });

  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    closePaletteContextMenu();
    state.contextCanvasPoint = toDiagramCoords(e);
    const connEl = e.target.closest('.connection');
    if (connEl) {
      const comp = state.components.find(c => c.id === connEl.dataset.comp);
      state.contextTarget = { component: comp, index: parseInt(connEl.dataset.index, 10), connection: true };
    } else {
      const g = e.target.closest('.component');
      state.contextTarget = g ? state.components.find(c => c.id === g.dataset.id) : null;
    }
    const compItems = menu.querySelectorAll('[data-context="component"]');
    const connItems = menu.querySelectorAll('[data-context="connection"]');
    const canvasItems = menu.querySelectorAll('[data-context="canvas"]');
    const isComponentContext = !!(state.contextTarget && !state.contextTarget.connection);
    compItems.forEach(li => li.style.display = isComponentContext ? 'block' : 'none');
    connItems.forEach(li => li.style.display = state.contextTarget && state.contextTarget.connection ? 'block' : 'none');
    canvasItems.forEach(li => li.style.display = state.contextTarget ? 'none' : 'block');
    const copyPropsItem = menu.querySelector('[data-action="copy-properties"]');
    if (copyPropsItem) copyPropsItem.style.display = isComponentContext ? 'block' : 'none';
    const pastePropsItem = menu.querySelector('[data-action="paste-properties"]');
    if (pastePropsItem) {
      const canPaste = isComponentContext && canPastePropertyClipboard(state.propertyClipboard, state.contextTarget);
      pastePropsItem.style.display = canPaste ? 'block' : 'none';
    }
    const positionLockItem = menu.querySelector('[data-action="toggle-lock"]');
    if (positionLockItem) positionLockItem.textContent = isComponentContext && isComponentPositionLocked(state.contextTarget) ? 'Unlock Position' : 'Lock Position';
    const propertiesLockItem = menu.querySelector('[data-action="toggle-properties-lock"]');
    if (propertiesLockItem) propertiesLockItem.textContent = isComponentContext && state.contextTarget?.propertiesLocked ? 'Unlock Properties' : 'Lock Properties';
    // Gap #40 – Show Group only when 2+ non-group components selected
    const groupItem = menu.querySelector('[data-action="group-selection"]');
    const ungroupItem = menu.querySelector('[data-action="ungroup"]');
    if (groupItem) groupItem.style.display = (isComponentContext && state.selection.length >= 2 && !state.selection.every(c => c.type === 'group')) ? 'block' : 'none';
    if (ungroupItem) ungroupItem.style.display = (isComponentContext && state.contextTarget?.type === 'group') ? 'block' : 'none';
    const inMultiSelection = isComponentContext && state.selection.length >= 2 && state.selection.includes(state.contextTarget);
    menu.querySelectorAll('[data-context="multi"]').forEach(li => {
      const needsThree = li.dataset.action === 'distribute-h' || li.dataset.action === 'distribute-v';
      li.style.display = (needsThree ? (state.selection.length >= 3 && inMultiSelection) : inMultiSelection) ? 'block' : 'none';
    });
    const rect = canvasScroll?.getBoundingClientRect();
    if (rect) {
      const scrollLeft = canvasScroll?.scrollLeft ?? 0;
      const scrollTop = canvasScroll?.scrollTop ?? 0;
      const left = e.clientX - rect.left + scrollLeft;
      const top = e.clientY - rect.top + scrollTop;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    } else {
      menu.style.left = `${e.pageX}px`;
      menu.style.top = `${e.pageY}px`;
    }
    menu.style.display = 'block';
  });

  const getContextTargets = target => {
    if (!target) return [];
    if (state.selection.length && state.selection.includes(target)) {
      return state.selection.slice();
    }
    return [target];
  };

  menu.addEventListener('click', async e => {
    const action = e.target.dataset.action;
    if (!action) return;
    e.stopPropagation();
    if (state.contextTarget && state.contextTarget.connection) {
      const { component, index } = state.contextTarget;
      const conn = component.connections[index];
      if (action === 'place-waypoint') {
        placeConnectionWaypoint(component, index, state.contextCanvasPoint);
      } else if (action === 'reset-waypoint') {
        resetConnectionWaypoint(component, index);
      } else if (action === 'edit') {
        const target = state.components.find(t => t.id === conn.target);
        const cableComp = isConductorSegmentComponent(component) ? component : isConductorSegmentComponent(target) ? target : null;
        if (cableComp) {
          await editCableComponent(cableComp);
        } else {
          const result = target ? await chooseCable(component, target, conn) : null;
          if (result && applyCableResultToConnection(conn, result)) {
            pushHistory();
            render();
            save();
            markScheduleReconcilePending();
          }
        }
      } else if (action === 'delete') {
        component.connections.splice(index, 1);
        state.selectedConnection = null;
        pushHistory();
        render();
        save();
      }
      menu.style.display = 'none';
      return;
    }
    if (action.startsWith('quick-add-')) {
      const subtype = action.slice('quick-add-'.length);
      const comp = addPaletteSymbol(subtype, { point: state.contextCanvasPoint });
      if (comp) showToast(`${comp.label || resolveComponentMeta(subtype)?.label || 'Symbol'} added`);
    } else if (action === 'repeat-last-symbol') {
      repeatLastCommand({ point: state.contextCanvasPoint });
    } else if (action === 'edit' && state.contextTarget) {
      selectComponent(state.contextTarget.id);
    } else if (action === 'rename' && state.contextTarget) {
      const targets = getContextTargets(state.contextTarget);
      if (!targets.length) return;
      if (targets.some(comp => isComponentPropertiesLocked(comp))) {
        showToast('Unlock component properties before renaming');
        return;
      }
      const current = state.contextTarget.label || '';
      const next = await promptDialog('Rename Component', 'Component label', current);
      if (next !== null) {
        let changed = false;
        targets.forEach(comp => {
          if ((comp.label || '') !== next) {
            comp.label = next;
            changed = true;
          }
        });
        if (changed) {
          pushHistory();
          render();
          save();
        }
      }
    } else if (action === 'copy-properties' && state.contextTarget && !state.contextTarget.connection) {
      const clipboardData = createPropertyClipboardFromComponent(state.contextTarget);
      if (clipboardData) {
        state.propertyClipboard = clipboardData;
        showToast('Properties copied');
      } else {
        state.propertyClipboard = null;
        showToast('No properties available to copy');
      }
    } else if (action === 'paste-properties' && state.contextTarget && !state.contextTarget.connection) {
      const targets = getContextTargets(state.contextTarget).filter(comp => comp && !comp.isVirtualNode);
      if (!state.propertyClipboard || !state.propertyClipboard.data) {
        showToast('Copy properties from a device first');
      } else if (!targets.length) {
        showToast('Select a device to paste properties');
      } else if (targets.some(target => isComponentPropertiesLocked(target))) {
        showToast('Unlock component properties before pasting');
      } else if (targets.some(target => !canPastePropertyClipboard(state.propertyClipboard, target))) {
        showToast('Properties can only be pasted to devices of the same type');
      } else {
        let changed = false;
        targets.forEach(target => {
          if (applyPropertyClipboardToComponent(target, state.propertyClipboard)) changed = true;
        });
        if (changed) {
          pushHistory();
          render();
          save();
          markScheduleReconcilePending();
          showToast('Properties pasted');
        } else {
          showToast('Properties already match');
        }
      }
    } else if (action === 'disconnect' && state.contextTarget) {
      const targets = getContextTargets(state.contextTarget);
      if (!targets.length) return;
      const targetIds = new Set(targets.map(t => t.id));
      let changed = false;
      targets.forEach(comp => {
        if (Array.isArray(comp.connections) && comp.connections.length) {
          comp.connections = [];
          changed = true;
        }
      });
      state.components.forEach(comp => {
        if (!Array.isArray(comp.connections) || !comp.connections.length) return;
        const filtered = comp.connections.filter(conn => !targetIds.has(conn.target));
        if (filtered.length !== comp.connections.length) {
          comp.connections = filtered;
          changed = true;
          if (state.selectedConnection && state.selectedConnection.component === comp) {
            state.selectedConnection = null;
          }
        }
      });
      if (state.selectedConnection && targetIds.has(state.selectedConnection.component?.id)) {
        state.selectedConnection = null;
      }
      if (changed) {
        pushHistory();
        render();
        save();
      }
    } else if (action === 'delete' && state.contextTarget) {
      const targets = getContextTargets(state.contextTarget);
      if (!targets.length) return;
      // Gap #41 – block deletion of locked components
      const locked = targets.filter(c => isComponentPositionLocked(c));
      if (locked.length) { showToast(`Cannot delete: ${locked.map(c => c.label || c.id).join(', ')} is locked`); return; }
      const ids = new Set(targets.map(c => c.id));
      state.components = state.components.filter(c => !ids.has(c.id));
      state.components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => !ids.has(conn.target));
      });
      state.selection = state.selection.filter(c => !ids.has(c.id));
      state.selected = state.selection[0] || null;
      state.selectedConnection = null;
      pushHistory();
      render();
      save();
      const modal = ensurePropModal();
      if (modal) modal.classList.remove('show');
    } else if (action === 'duplicate' && state.contextTarget) {
      const targets = getContextTargets(state.contextTarget);
      if (!targets.length) return;
      const base = Date.now();
      const idMap = {};
      const newComps = targets.map((comp, idx) => {
        const clone = {
          ...JSON.parse(JSON.stringify(comp)),
          id: 'n' + (base + idx),
          x: comp.x + state.gridSize,
          y: comp.y + state.gridSize,
          connections: (comp.connections || []).map(conn => ({ ...conn }))
        };
        idMap[comp.id] = clone.id;
        applyNextLabel(clone);
        return clone;
      });
      newComps.forEach(clone => {
        clone.connections = (clone.connections || [])
          .filter(conn => idMap[conn.target])
          .map(conn => ({ ...conn, target: idMap[conn.target] }));
      });
      state.components.push(...newComps);
      state.selection = newComps;
      state.selected = newComps[0] || null;
      state.selectedConnection = null;
      pushHistory();
      render();
      save();
    } else if (action === 'rotate' && state.contextTarget) {
      const targets = getContextTargets(state.contextTarget);
      if (!targets.length) return;
      targets.forEach(comp => {
        comp.rotation = ((comp.rotation || 0) + 90) % 360;
        comp.rotationManual = true;
      });
      state.selectedConnection = null;
      pushHistory();
      render();
      save();
    } else if (action === 'paste') {
      if (state.clipboard.length) {
        const base = Date.now();
        const idMap = {};
        const newComps = state.clipboard.map((c, idx) => {
          const newId = 'n' + (base + idx);
          idMap[c.id] = newId;
          const clone = {
            ...JSON.parse(JSON.stringify(c)),
            id: newId,
            x: c.x + state.gridSize,
            y: c.y + state.gridSize,
            connections: (c.connections || []).map(conn => ({ ...conn }))
          };
          applyNextLabel(clone);
          return clone;
        });
        newComps.forEach(c => {
          c.connections = (c.connections || [])
            .filter(conn => idMap[conn.target])
            .map(conn => ({ ...conn, target: idMap[conn.target] }));
        });
        state.components.push(...newComps);
        state.selection = newComps;
        state.selected = newComps[0] || null;
        pushHistory();
        render();
        save();
      }
    // Gap #41 – Lock / unlock
    } else if (action === 'toggle-lock' && state.contextTarget) {
      const targets = getContextTargets(state.contextTarget);
      targets.forEach(c => toggleLock(c));
    } else if (action === 'toggle-properties-lock' && state.contextTarget) {
      const targets = getContextTargets(state.contextTarget);
      targets.forEach(c => togglePropertiesLock(c));
    // Gap #43 – Select Connected
    } else if (action === 'select-connected' && state.contextTarget) {
      selectConnected(state.contextTarget.id);
    // Gap #44 – Select by Type
    } else if (action === 'select-by-type' && state.contextTarget) {
      selectByType(state.contextTarget.subtype || state.contextTarget.type);
    // Gap #40 – Group Selection
    } else if (action === 'group-selection') {
      groupSelection();
    // Gap #40 – Ungroup
    } else if (action === 'ungroup' && state.contextTarget) {
      if (state.contextTarget.type === 'group') ungroupComponent(state.contextTarget.id);
    } else if (action === 'bring-to-front' && state.contextTarget && !state.contextTarget.connection) {
      const targets = getContextTargets(state.contextTarget);
      targets.forEach(comp => {
        const idx = state.components.indexOf(comp);
        if (idx !== -1 && idx < state.components.length - 1) {
          state.components.splice(idx, 1);
          state.components.push(comp);
        }
      });
      pushHistory();
      render();
      save();
    } else if (action === 'send-to-back' && state.contextTarget && !state.contextTarget.connection) {
      const targets = getContextTargets(state.contextTarget);
      [...targets].reverse().forEach(comp => {
        const idx = state.components.indexOf(comp);
        if (idx !== -1 && idx > 0) {
          state.components.splice(idx, 1);
          state.components.unshift(comp);
        }
      });
      pushHistory();
      render();
      save();
    } else if (action === 'align-left') {
      alignSelection('left');
    } else if (action === 'align-right') {
      alignSelection('right');
    } else if (action === 'align-top') {
      alignSelection('top');
    } else if (action === 'align-bottom') {
      alignSelection('bottom');
    } else if (action === 'distribute-h') {
      distributeSelection('h');
    } else if (action === 'distribute-v') {
      distributeSelection('v');
    }
    menu.style.display = 'none';
  });

  document.addEventListener('click', e => {
    if (!menu.contains(e.target)) {
      menu.style.display = 'none';
    }
    if (paletteContextMenu && paletteContextMenu.style.display === 'block' && !paletteContextMenu.contains(e.target)) {
      const trigger = state.paletteContextTarget?.trigger;
      if (!(trigger instanceof Element) || !trigger.contains(e.target)) {
        closePaletteContextMenu();
      }
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      menu.style.display = 'none';
      closePaletteContextMenu();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Delete') return;
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) {
      return;
    }
    if (state.selectedConnection) {
      const { component, index } = state.selectedConnection;
      component.connections.splice(index, 1);
      state.selectedConnection = null;
      pushHistory();
      render();
      save();
      if (state.selected) selectComponent(state.selected);
      return;
    }
    if (state.selection.length) {
      // Gap #41 – block deletion of locked components
      const locked = state.selection.filter(c => isComponentPositionLocked(c));
      if (locked.length) { showToast(`Cannot delete: ${locked.map(c => c.label || c.id).join(', ')} is locked`); return; }
      const ids = new Set(state.selection.map(c => c.id));
      state.components = state.components.filter(c => !ids.has(c.id));
      state.components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => !ids.has(conn.target));
      });
      state.selection = [];
      state.selected = null;
      state.selectedConnection = null;
      pushHistory();
      render();
      save();
      const modal = ensurePropModal();
      if (modal) modal.classList.remove('show');
    }
  });

  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) {
      return;
    }
    const key = e.key.toLowerCase();
    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    } else if (mod && key === 'c') {
      e.preventDefault();
      state.clipboard = state.selection.map(c => JSON.parse(JSON.stringify(c)));
    } else if (mod && key === 'v') {
      e.preventDefault();
      if (state.clipboard.length) {
        const base = Date.now();
        const idMap = {};
        const newComps = state.clipboard.map((c, idx) => {
          const newId = 'n' + (base + idx);
          idMap[c.id] = newId;
          const clone = {
            ...JSON.parse(JSON.stringify(c)),
            id: newId,
            x: c.x + state.gridSize,
            y: c.y + state.gridSize,
            connections: (c.connections || []).map(conn => ({ ...conn }))
          };
          applyNextLabel(clone);
          return clone;
        });
        newComps.forEach(c => {
          c.connections = (c.connections || [])
            .filter(conn => idMap[conn.target])
            .map(conn => ({ ...conn, target: idMap[conn.target] }));
        });
        state.components.push(...newComps);
        state.selection = newComps;
        state.selected = newComps[0] || null;
        pushHistory();
        render();
        save();
      }
    } else if (!mod && commandForShortcut(e)) {
      e.preventDefault();
      executeShortcutCommand(commandForShortcut(e).id);
    } else if (mod && key === 'a') {
      e.preventDefault();
      state.selection = [...state.components];
      state.selected = state.components[0] || null;
      state.selectedConnection = null;
      render();
      updateStatusBar();
    } else if (mod && key === 'g' && !e.shiftKey) {
      e.preventDefault();
      if (state.selection.length >= 2) groupSelection();
    } else if (mod && key === 'g' && e.shiftKey) {
      e.preventDefault();
      const grp = state.selection.find(c => c.type === 'group') || (state.selected?.type === 'group' ? state.selected : null);
      if (grp) ungroupComponent(grp.id);
    } else if (mod && key === 'l') {
      e.preventDefault();
      const lockTargets = state.selection.length ? state.selection : state.selected ? [state.selected] : [];
      lockTargets.forEach(c => toggleLock(c));
    } else if (!mod && e.key === 'Escape') {
      // Cancel connect mode or deselect
      const anyModalOpen = document.querySelector('.prop-modal.show');
      if (!anyModalOpen) {
        if (state.connectMode) {
          resetConnectInteraction({ keepMode: false });
        }
        state.selection = [];
        state.selected = null;
        state.selectedConnection = null;
        render();
        updateStatusBar();
      }
    }
  });

  document.getElementById('repeat-last-symbol-btn')?.addEventListener('click', () => {
    repeatLastCommand();
  });
  document.getElementById('shortcuts-btn')?.addEventListener('click', openKeyboardShortcutsModal);
  updateShortcutControlLabels();

  if (paletteContextMenu) {
    paletteContextMenu.addEventListener('click', e => {
      const item = e.target.closest('li[data-action]');
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      if (item.dataset.action === 'edit' && state.paletteContextTarget?.meta) {
        navigateToCustomComponentEditor(state.paletteContextTarget.meta);
      } else if (item.dataset.action === 'toggle-favorite' && state.paletteContextTarget?.meta) {
        const isFavorite = togglePaletteFavorite(state.paletteContextTarget.subtype);
        buildPalette();
        showToast(isFavorite ? 'Added to Favorites' : 'Removed from Favorites');
      }
      closePaletteContextMenu();
    });
    paletteContextMenu.addEventListener('contextmenu', e => {
      e.preventDefault();
    });
  }
  svg.addEventListener('mouseenter', e => {
    const coords = toDiagramCoords(e);
    const pointerX = coords.x;
    const pointerY = coords.y;
    if (Number.isFinite(pointerX) && Number.isFinite(pointerY)) {
      state.cursorPos = { x: pointerX, y: pointerY };
      state.cursorPosValid = true;
    }
  });
  svg.addEventListener('mouseleave', () => {
    state.cursorPosValid = false;
    updateStatusBar();
  });
  window.addEventListener('resize', closePaletteContextMenu);
  document.addEventListener('scroll', closePaletteContextMenu, true);

  const tourBtn = document.getElementById('tour-btn');
  if (tourBtn) tourBtn.addEventListener('click', () => {
    startTour();
    writeAppSetting('onelineTourDone', 'true');
  });

  const params = new URLSearchParams(window.location.search);
  const probeTarget = resolveInitialCrossProbe(params);
  const shouldOpenComponentModal = params.has('componentModal');
  if (probeTarget) {
    const probeLabel = params.get('probe') || params.get('component') || probeTarget.matchValue || '';
    focusCrossProbeTarget(probeTarget, { componentModal: shouldOpenComponentModal, label: probeLabel });
  } else if (params.get('component') || params.get('probe')) {
    const probeLabel = params.get('probe') || params.get('component') || 'that item';
    showToast(`No one-line component found for ${probeLabel}.`);
    if (shouldOpenComponentModal) selectComponent();
  } else if (shouldOpenComponentModal) {
    selectComponent();
  }

  initSettings();
  initDarkMode();
  initCompactMode();
  initNavToggle();

  // ----------------------------------------------------------------
  // Gap #42 – Zoom to Selection button
  // ----------------------------------------------------------------
  document.getElementById('zoom-fit-selection-btn')?.addEventListener('click', () => zoomToSelection());

  // ----------------------------------------------------------------
  // Gap #36 – Energized/de-energized state toggle
  // ----------------------------------------------------------------
  const toggleEnergized = document.getElementById('toggle-energized');
  if (toggleEnergized) {
    toggleEnergized.checked = state.showEnergizedState;
    toggleEnergized.addEventListener('change', () => {
      state.showEnergizedState = toggleEnergized.checked;
      render();
    });
  }

  // ----------------------------------------------------------------
  // Gap #39 – Minimap toggle
  // ----------------------------------------------------------------
  const minimapToggle = document.getElementById('minimap-toggle');
  if (minimapToggle) {
    minimapToggle.checked = state.minimapVisible;
    minimapToggle.addEventListener('change', () => {
      state.minimapVisible = minimapToggle.checked;
      renderMinimap();
    });
    // Minimap click-to-navigate
    const minimapSvgEl = document.getElementById('minimap-svg');
    if (minimapSvgEl) {
      minimapSvgEl.addEventListener('mousedown', e => {
        if (!state.minimapVisible) return;
        const rect = minimapSvgEl.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // Convert minimap coords to diagram coords
        if (!state.components.length) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        state.components.forEach(c => {
          const b = componentBounds(c);
          minX = Math.min(minX, b.left); minY = Math.min(minY, b.top);
          maxX = Math.max(maxX, b.right); maxY = Math.max(maxY, b.bottom);
        });
        const pad = 20;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const dw = maxX - minX || 1, dh = maxY - minY || 1;
        const scale = Math.min(180 / dw, 120 / dh);
        const ox = (180 - dw * scale) / 2;
        const oy = (120 - dh * scale) / 2;
        const diagramX = (mx - ox) / scale + minX;
        const diagramY = (my - oy) / scale + minY;
        const editor = document.querySelector('.oneline-canvas-scroll');
        if (editor) {
          const zoom = state.diagramZoom || DEFAULT_DIAGRAM_ZOOM;
          editor.scrollLeft = Math.max(0, (diagramX - state.diagramViewport.minX) * zoom - editor.clientWidth / 2);
          editor.scrollTop = Math.max(0, (diagramY - state.diagramViewport.minY) * zoom - editor.clientHeight / 2);
          renderMinimap();
        }
      });
    }
  }

  // ----------------------------------------------------------------
  // Gap #47 – Orthogonal routing toggle
  // ----------------------------------------------------------------
  const orthoToggle = document.getElementById('orthogonal-routing-toggle');
  if (orthoToggle) {
    orthoToggle.checked = state.orthogonalRouting;
    orthoToggle.addEventListener('change', () => {
      state.orthogonalRouting = orthoToggle.checked;
      setOneLineViewSetting('orthogonalRouting', state.orthogonalRouting);
      // Clear cached dir/mid so routeConnection re-computes with the new mode
      state.components.forEach(c => (c.connections || []).forEach(conn => {
        delete conn.dir; delete conn.mid;
      }));
      render();
    });
    state.orthogonalRouting = !!getOneLineViewSetting('orthogonalRouting', false);
    orthoToggle.checked = state.orthogonalRouting;
  }

  // ----------------------------------------------------------------
  // Gap #37 – Symbol standard (IEC 60617 / ANSI-IEEE) toggle
  // ----------------------------------------------------------------
  const symStdSelect = document.getElementById('symbol-standard-select');
  if (symStdSelect) {
    state.symbolStandard = getOneLineViewSetting('symbolStandard', 'ANSI') || 'ANSI';
    symStdSelect.value = state.symbolStandard;
    symStdSelect.addEventListener('change', () => {
      state.symbolStandard = symStdSelect.value;
      setOneLineViewSetting('symbolStandard', state.symbolStandard);
      buildPalette();
      render();
    });
  }

  // ----------------------------------------------------------------
  // Gap #38 – Title block
  // ----------------------------------------------------------------
  const titleBlockBtn = document.getElementById('title-block-btn');
  if (titleBlockBtn) {
    state.titleBlockFields = getItem('diagramTitleBlock') || {};
    titleBlockBtn.addEventListener('click', () => {
      const fields = [
        ['projectName', 'Project Name'],
        ['drawingNumber', 'Drawing Number'],
        ['revision', 'Revision'],
        ['revDate', 'Date'],
        ['drawnBy', 'Drawn By'],
        ['checkedBy', 'Checked By'],
        ['company', 'Company'],
        ['peStamp', 'PE Stamp / Seal Note'],
      ];
      const form = document.createElement('form');
      form.className = 'title-block-modal-form';
      fields.forEach(([key, label]) => {
        const lbl = document.createElement('label');
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = state.titleBlockFields[key] || '';
        inp.dataset.key = key;
        lbl.appendChild(inp);
        form.appendChild(lbl);
      });
      const modal = openModal({ title: 'Title Block', content: '', buttons: [
        { text: 'Save', primary: true, id: 'tb-save-btn' },
        { text: 'Cancel', id: 'tb-cancel-btn' }
      ]});
      if (!modal) return;
      const body = modal.querySelector('.modal-body') || modal.querySelector('.prop-form');
      if (body) body.appendChild(form);
      modal.querySelector('#tb-save-btn')?.addEventListener('click', () => {
        form.querySelectorAll('input[data-key]').forEach(inp => {
          state.titleBlockFields[inp.dataset.key] = inp.value.trim();
        });
        setItem('diagramTitleBlock', state.titleBlockFields);
        renderTitleBlock();
        modal.classList.remove('show');
      });
    });
  }
  const titleBlockShowToggle = document.getElementById('title-block-show-toggle');
  if (titleBlockShowToggle) {
    titleBlockShowToggle.checked = state.showTitleBlock;
    titleBlockShowToggle.addEventListener('change', () => {
      state.showTitleBlock = titleBlockShowToggle.checked;
      renderTitleBlock();
    });
  }

  // ----------------------------------------------------------------
  // Gap #46 – Datablock config: hook into the existing Views button
  // ----------------------------------------------------------------
  state.diagramDatablockConfig = getItem('diagramDatablockConfig') || {};

  // Show/hide context menu items based on selection state
  const ctxGroupItem = document.getElementById('ctx-group-selection');
  const ctxUngroupItem = document.getElementById('ctx-ungroup');
  const ctxMenu = document.getElementById('context-menu');
  if (ctxMenu) {
    ctxMenu.addEventListener('contextmenu', e => e.preventDefault());
    // Update group/ungroup visibility just before menu is shown (handled in contextmenu event)
  }
  refineOneLineCommandSurface();
  setupToolbarMenus();
  const activeSampleWorkflow = getItem('activeSampleWorkflow');
  if (activeSampleWorkflow?.id === 'ductbank-network' && state.components.length) {
    const layoutVersion = Number(activeSampleWorkflow.layoutVersion || 0);
    if (layoutVersion < 2 && arrangeDuctbankSampleLayout(state.components)) {
      pushHistory();
      render();
      save();
      setItem('activeSampleWorkflow', { ...activeSampleWorkflow, layoutVersion: 2 });
    }
    requestAnimationFrame(() => requestAnimationFrame(() => zoomToFit({ pad: 120, maxZoom: 1.1 })));
  }

}
