function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildPersistedSheets({ sheets, activeSheet, components, layers, protectionZones }) {
  const buildConnections = componentList => componentList.flatMap(component => (
    (component.connections || []).map(connection => ({
      ...connection,
      from: component.id,
      to: connection.target
    }))
  ));
  return sheets.map((sheet, index) => {
    const sheetComponents = (index === activeSheet ? components : sheet.components).map(component => ({
      ...component,
      rotation: component.rotation || 0,
      flipped: !!component.flipped
    }));
    return {
      name: sheet.name,
      components: sheetComponents,
      connections: buildConnections(sheetComponents),
      layers: index === activeSheet ? clone(layers) : (Array.isArray(sheet.layers) ? sheet.layers : []),
      protectionZones: index === activeSheet
        ? clone(protectionZones)
        : (Array.isArray(sheet.protectionZones) ? clone(sheet.protectionZones) : []),
      ...(sheet.backgroundImage ? { backgroundImage: sheet.backgroundImage } : {})
    };
  });
}

export function createSheetPersistenceController({
  documentRef,
  getState,
  onActivateSheet,
  onPersistedSheets,
  onAfterSheetLoad,
  onAfterSheetDelete,
  persistOneLine,
  persistDiagramScale,
  getDiagramScale,
  normalizeDiagramScale,
  synchronizeProjectData,
  validateDiagram,
  getProtectionZones,
  promptDialog,
  confirmDialog,
  showToast
}) {
  const renderTabs = () => {
    const tabs = documentRef.getElementById('sheet-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    const { sheets, activeSheet } = getState();
    sheets.forEach((sheet, index) => {
      const tab = documentRef.createElement('button');
      tab.textContent = sheet.name || `Sheet ${index + 1}`;
      tab.className = `sheet-tab${index === activeSheet ? ' active' : ''}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(index === activeSheet));
      tab.tabIndex = index === activeSheet ? 0 : -1;
      tab.addEventListener('click', () => load(index));
      tabs.appendChild(tab);
    });
  };

  const save = (notify = true) => {
    const state = getState();
    const persistedSheets = buildPersistedSheets({
      ...state,
      protectionZones: getProtectionZones()
    });
    const activeSheet = persistedSheets.length
      ? Math.min(Math.max(state.activeSheet, 0), persistedSheets.length - 1)
      : 0;
    const components = persistedSheets[activeSheet]?.components || [];
    const connections = persistedSheets[activeSheet]?.connections || [];
    onPersistedSheets({ sheets: persistedSheets, activeSheet, components, connections });
    persistOneLine({ activeSheet, sheets: persistedSheets });
    persistDiagramScale(normalizeDiagramScale(getDiagramScale()));
    const synchronized = synchronizeProjectData();
    const issues = validateDiagram({ notify: false, revealPanel: false });
    if (!notify) return synchronized;
    if (issues.length === 0) {
      const changeCount = synchronized.creates + synchronized.updates;
      showToast(changeCount
        ? `One-line saved; shared project data updated (${synchronized.creates} new, ${synchronized.updates} changed).`
        : 'One-line saved; shared project data is current.');
    } else {
      showToast('One-line and shared project data saved. Resolve the remaining validation issues before engineering use.');
    }
    return synchronized;
  };

  const load = (index, { skipCurrentSave = false } = {}) => {
    const state = getState();
    if (index < 0 || index >= state.sheets.length) return false;
    if (!skipCurrentSave) save(false);
    const current = getState();
    onActivateSheet(index, current.sheets[index]);
    renderTabs();
    onAfterSheetLoad(index);
    const next = getState();
    persistOneLine({ activeSheet: next.activeSheet, sheets: next.sheets });
    return true;
  };

  const add = async name => {
    const state = getState();
    const sheetName = name || await promptDialog('Add Sheet', 'Sheet name', `Sheet ${state.sheets.length + 1}`);
    if (!sheetName) return false;
    state.sheets.push({ name: sheetName, components: [], connections: [], layers: [] });
    load(state.sheets.length - 1);
    save();
    return true;
  };

  const rename = async (id, newName) => {
    const state = getState();
    const index = id ?? state.activeSheet;
    if (index < 0 || index >= state.sheets.length) return false;
    const sheetName = newName || await promptDialog('Rename Sheet', 'Sheet name', state.sheets[index].name);
    if (!sheetName) return false;
    state.sheets[index].name = sheetName;
    renderTabs();
    save();
    return true;
  };

  const remove = async id => {
    const state = getState();
    if (state.sheets.length <= 1) return false;
    const index = id ?? state.activeSheet;
    if (index < 0 || index >= state.sheets.length) return false;
    const confirmed = await confirmDialog('Delete Sheet', `Delete "${state.sheets[index].name}"? This cannot be undone.`, { primaryText: 'Delete' });
    if (!confirmed) return false;
    state.sheets.splice(index, 1);
    const activeSheet = Math.max(0, index - 1);
    onActivateSheet(activeSheet, state.sheets[activeSheet], { resetHistory: false });
    renderTabs();
    onAfterSheetDelete(activeSheet);
    save();
    return true;
  };

  return { add, load, remove, rename, renderTabs, save };
}
