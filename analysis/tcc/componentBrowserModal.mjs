export async function openComponentBrowserModalView(dependencies = {}) {
  const {
    activeComponentId,
    applySelectionSet,
    buildComponentDisplayEntries,
    buildOneLineProbeUrl,
    buildTypeGroups,
    compId,
    componentModalBtn,
    console = globalThis.console,
    deviceMap,
    deviceSelect,
    getActiveComponentId,
    getManufacturerLabel,
    getTypeInfo,
    openModal,
    plot,
    refreshCatalog,
    renderDeviceDetails,
    selectedDeviceIds,
    setActiveComponent,
    showAlertModal,
    updateComponentAssignment
  } = dependencies;
  if (componentModalBtn) {
    componentModalBtn.setAttribute('aria-expanded', 'true');
  }

  // Ensure we rebuild the catalog so one-line changes made since the last
  // refresh are represented when the modal opens. This keeps the component
  // list in sync with the latest diagram data instead of relying on the
  // previously cached entries.
  refreshCatalog({ preserveSelection: true });

  let componentEntries = buildComponentDisplayEntries();
  if (!componentEntries.length) {
    await openModal({
      title: 'One-Line Components',
      primaryText: 'Close',
      secondaryText: null,
      onSubmit: () => true,
      onCancel: () => {
        if (componentModalBtn) componentModalBtn.setAttribute('aria-expanded', 'false');
      },
      render(container) {
        const doc = container.ownerDocument;
        const message = doc.createElement('p');
        message.className = 'device-detail-empty';
        message.textContent = 'No one-line components are available to display.';
        container.appendChild(message);
        return message;
      }
    });
    if (componentModalBtn) {
      componentModalBtn.setAttribute('aria-expanded', 'false');
    }
    return;
  }

  let componentEntryMap = new Map(componentEntries.map(entry => [entry.componentId, entry]));
  let typeGroups = buildTypeGroups(componentEntries);
  const currentContextId = getActiveComponentId() || activeComponentId || compId;
  const initialEntry = (currentContextId && componentEntryMap.get(currentContextId)) || componentEntries[0] || null;
  const initialSelection = new Set(selectedDeviceIds());
  const selectionSet = new Set(initialSelection);
  const sanitizeSelectionSet = () => {
    componentEntries.forEach(entry => {
      if (
        entry.kind === 'component'
        && entry.plotDisabledReason
        && selectionSet.has(entry.uid)
      ) {
        selectionSet.delete(entry.uid);
      }
    });
    renderSelectionSummary();
  };
  let activeEntry = initialEntry;
  let activeTypeId = initialEntry ? getTypeInfo(initialEntry).id : typeGroups[0]?.id || null;
  let activeManufacturer = initialEntry ? getManufacturerLabel(initialEntry) : null;

  const getGroupById = id => typeGroups.find(group => group.id === id) || null;
  const ensureManufacturerForGroup = group => {
    if (!group || !group.manufacturers.length) return null;
    if (activeManufacturer && group.manufacturers.some(m => m.name === activeManufacturer)) {
      return group.manufacturers.find(m => m.name === activeManufacturer) || group.manufacturers[0];
    }
    activeManufacturer = group.manufacturers[0].name;
    return group.manufacturers[0];
  };

  const initialGroup = getGroupById(activeTypeId);
  const initialManufacturer = ensureManufacturerForGroup(initialGroup);
  if (!activeEntry || !initialManufacturer?.entries.some(entry => entry.uid === activeEntry.uid)) {
    activeEntry = initialManufacturer?.entries[0] || null;
  }

  const modelElements = new Map();
  const docRef = { current: null };
  const controllerRef = { current: null };
  let typeContainer;
  let manufacturerContainer;
  let modelContainer;
  let detailContainer;
  let modelsHeading;
  let selectionSummaryContainer;
  const firstButtonRef = { current: null };

  const updateModelSelectionIndicators = () => {
    modelElements.forEach(({ item, checkbox, entry: itemEntry }) => {
      const selected = selectionSet.has(itemEntry.uid);
      if (item) {
        item.classList.toggle('is-selected', selected);
      }
      if (checkbox) {
        checkbox.checked = selected;
      }
    });
  };

  const setEntrySelection = (entry, selected) => {
    if (!entry || !entry.uid) return;
    if (entry.plotDisabledReason) return;
    if (selected) {
      selectionSet.add(entry.uid);
    } else {
      selectionSet.delete(entry.uid);
    }
    updateModelSelectionIndicators();
    if (activeEntry && entry.uid === activeEntry.uid) {
      updateActiveEntry(entry);
    }
    renderSelectionSummary();
  };

  const getSelectedComponentEntries = () => [...selectionSet]
    .map(id => deviceMap.get(id))
    .filter(entry => (
      entry
      && entry.kind === 'component'
      && entry.componentId
      && !entry.plotDisabledReason
    ));

  const renderSelectionSummary = () => {
    if (!selectionSummaryContainer || !docRef.current) return;
    const doc = docRef.current;
    selectionSummaryContainer.innerHTML = '';
    const selectedComponents = getSelectedComponentEntries();
    const heading = doc.createElement('h3');
    heading.className = 'device-selection-subtitle';
    heading.textContent = 'Selected Components';
    selectionSummaryContainer.appendChild(heading);
    if (!selectedComponents.length) {
      const empty = doc.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No one-line components selected for plotting.';
      selectionSummaryContainer.appendChild(empty);
      return;
    }
    const typeLabels = new Map();
    selectedComponents.forEach(entry => {
      const info = getTypeInfo(entry);
      typeLabels.set(info.label, (typeLabels.get(info.label) || 0) + 1);
    });
    const list = doc.createElement('ul');
    list.className = 'component-selection-list';
    selectedComponents.forEach(entry => {
      const item = doc.createElement('li');
      item.className = 'component-selection-item';
      const name = doc.createElement('span');
      name.className = 'component-selection-name';
      name.textContent = entry.name;
      const removeBtn = doc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'component-selection-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        selectionSet.delete(entry.uid);
        updateModelSelectionIndicators();
        renderSelectionSummary();
      });
      item.append(name, removeBtn);
      list.appendChild(item);
    });
    selectionSummaryContainer.appendChild(list);
    const summary = doc.createElement('p');
    summary.className = 'component-selection-summary-text';
    const typeSummary = [...typeLabels.entries()]
      .map(([label, count]) => `${count} ${label}`)
      .join(', ');
    if (typeSummary) {
      summary.textContent = `Selected across ${typeSummary}.`;
      selectionSummaryContainer.appendChild(summary);
    }
  };

  const handleAssignment = async ({ componentId, deviceId, overrides }) => {
    if (!componentId) return false;
    try {
      const autoSelect = !!deviceId && (
        selectionSet.has(`component:${componentId}`)
        || getSelectedComponentEntries().length === 0
      );
      const result = updateComponentAssignment(componentId, deviceId, overrides || {}, {
        autoSelect,
        replaceSelection: false
      });
      if (result && Array.isArray(result.selection)) {
        result.selection.forEach(id => selectionSet.add(id));
      }
      componentEntries = buildComponentDisplayEntries();
      componentEntryMap = new Map(componentEntries.map(entry => [entry.componentId, entry]));
      typeGroups = buildTypeGroups(componentEntries);
      sanitizeSelectionSet();
      renderDeviceTypes();
      renderManufacturers();
      renderModels();
      const refreshed = componentEntryMap.get(componentId) || result.updatedEntry || null;
      if (refreshed) {
        updateActiveEntry(refreshed);
      } else {
        updateActiveEntry(activeEntry);
      }
      renderSelectionSummary();
      return true;
    } catch (err) {
      console.error('Failed to update TCC assignment', err);
      showAlertModal('Assignment Error', 'The device assignment could not be updated. Please try again.');
      return false;
    }
  };

  const applySelection = (activeComponentOverride = null) => {
    const componentSelectionsBefore = getSelectedComponentEntries();
    const activeEntrySelected = activeEntry && selectionSet.has(activeEntry.uid);
    if (activeComponentOverride) {
      const overrideEntry = componentEntryMap.get(activeComponentOverride);
      if (overrideEntry && !overrideEntry.plotDisabledReason) {
        selectionSet.add(overrideEntry.uid);
      }
    } else if (
      activeEntry
      && activeEntry.kind === 'component'
      && activeEntry.componentId
      && !activeEntry.plotDisabledReason
      && !activeEntrySelected
      && componentSelectionsBefore.length === 0
    ) {
      selectionSet.add(activeEntry.uid);
    }
    sanitizeSelectionSet();
    const selectedIds = Array.from(selectionSet);
    const orderMap = new Map([...deviceSelect.options].map((option, index) => [option.value, index]));
    selectedIds.sort((a, b) => {
      const orderA = orderMap.has(a) ? orderMap.get(a) : Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.has(b) ? orderMap.get(b) : Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
    const selectedComponents = getSelectedComponentEntries();
    const preferredComponentId = activeComponentOverride
      || (activeEntrySelected
        && activeEntry.kind === 'component'
        && activeEntry.componentId
        && !activeEntry.plotDisabledReason
        ? activeEntry.componentId
        : null)
      || selectedComponents[0]?.componentId
      || null;
    if (preferredComponentId) {
      setActiveComponent(preferredComponentId, { preserveSelection: true });
    }
    applySelectionSet(selectedIds, { persist: true });
    plot();
    return { appliedSelection: selectedIds, activeComponentId: preferredComponentId };
  };

  function updateActiveEntry(entry) {
    activeEntry = entry || null;
    modelElements.forEach(({ item, entry: itemEntry }, uid) => {
      const isActive = !!entry && uid === entry.uid;
      if (item) {
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
        item.tabIndex = isActive ? 0 : -1;
        if (itemEntry?.plotDisabledReason) {
          item.classList.add('device-model-unavailable');
          item.title = itemEntry.plotDisabledReason;
        } else {
          item.classList.remove('device-model-unavailable');
          item.removeAttribute('title');
        }
      }
    });
    renderDeviceDetails(entry, detailContainer, docRef.current);
    if (controllerRef.current && typeof controllerRef.current.setPrimaryDisabled === 'function') {
      controllerRef.current.setPrimaryDisabled(false);
    }
    if (entry && entry.kind === 'component' && detailContainer && docRef.current) {
      const actions = docRef.current.createElement('div');
      actions.className = 'device-detail-actions';
      const toggleBtn = docRef.current.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'btn primary-btn';
      const selected = selectionSet.has(entry.uid);
      toggleBtn.textContent = selected ? 'Remove from Plot' : 'Add to Plot';
      toggleBtn.disabled = !!entry.plotDisabledReason;
      toggleBtn.addEventListener('click', () => {
        if (entry.plotDisabledReason) return;
        const nextSelected = !selectionSet.has(entry.uid);
        setEntrySelection(entry, nextSelected);
      });
      actions.appendChild(toggleBtn);
      const openLink = docRef.current.createElement('a');
      openLink.className = 'btn secondary-btn';
      openLink.href = buildOneLineProbeUrl(
        { componentId: entry.componentId, probeType: 'tcc' },
        { probeType: 'tcc' }
      );
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      openLink.textContent = 'Open in One-Line';
      actions.appendChild(openLink);
      detailContainer.appendChild(actions);
    }
    updateModelSelectionIndicators();
  }

  function getActiveTypeGroup() {
    return getGroupById(activeTypeId) || typeGroups[0] || null;
  }

  function renderDeviceTypes() {
    if (!typeContainer || !docRef.current) return;
    typeContainer.innerHTML = '';
    const doc = docRef.current;
    typeGroups.forEach(group => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'device-type-btn';
      if (group.id === activeTypeId) button.classList.add('active');
      const selectedCount = group.manufacturers
        .reduce((total, manufacturer) => total + manufacturer.entries
          .filter(entry => selectionSet.has(entry.uid)).length, 0);
      button.innerHTML = '';
      const labelSpan = doc.createElement('span');
      labelSpan.className = 'device-type-label';
      labelSpan.textContent = `${group.label} (${group.total})`;
      button.appendChild(labelSpan);
      if (selectedCount > 0) {
        button.classList.add('has-selection');
        const countSpan = doc.createElement('span');
        countSpan.className = 'device-selection-count';
        countSpan.textContent = selectedCount === 1 ? '1 selected' : `${selectedCount} selected`;
        button.appendChild(countSpan);
      } else {
        button.classList.remove('has-selection');
      }
      button.addEventListener('click', () => {
        if (activeTypeId === group.id) return;
        activeTypeId = group.id;
        const manufacturer = ensureManufacturerForGroup(group);
        const selectedInGroup = manufacturer?.entries.find(item => selectionSet.has(item.uid)) || null;
        activeEntry = selectedInGroup || manufacturer?.entries[0] || null;
        renderDeviceTypes();
        renderManufacturers();
        renderModels();
        updateActiveEntry(activeEntry);
      });
      if (!firstButtonRef.current) firstButtonRef.current = button;
      typeContainer.appendChild(button);
    });
  }

  function renderManufacturers() {
    if (!manufacturerContainer || !docRef.current) return;
    manufacturerContainer.innerHTML = '';
    const doc = docRef.current;
    const group = getActiveTypeGroup();
    if (!group || !group.manufacturers.length) {
      const empty = doc.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No manufacturers available for this device type.';
      manufacturerContainer.appendChild(empty);
      return;
    }
    if (!group.manufacturers.some(manufacturer => manufacturer.name === activeManufacturer)) {
      activeManufacturer = group.manufacturers[0].name;
    }
    group.manufacturers.forEach(manufacturer => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'device-manufacturer-btn';
      if (manufacturer.name === activeManufacturer) button.classList.add('active');
      const selectedCount = manufacturer.entries.filter(entry => selectionSet.has(entry.uid)).length;
      button.innerHTML = '';
      const labelSpan = doc.createElement('span');
      labelSpan.className = 'device-type-label';
      labelSpan.textContent = `${manufacturer.name} (${manufacturer.entries.length})`;
      button.appendChild(labelSpan);
      if (selectedCount > 0) {
        button.classList.add('has-selection');
        const countSpan = doc.createElement('span');
        countSpan.className = 'device-selection-count';
        countSpan.textContent = selectedCount === 1 ? '1 selected' : `${selectedCount} selected`;
        button.appendChild(countSpan);
      } else {
        button.classList.remove('has-selection');
      }
      button.addEventListener('click', () => {
        if (activeManufacturer === manufacturer.name) return;
        activeManufacturer = manufacturer.name;
        const selectedInManufacturer = manufacturer.entries.find(entry => selectionSet.has(entry.uid));
        activeEntry = selectedInManufacturer || manufacturer.entries[0] || null;
        renderManufacturers();
        renderModels();
        updateActiveEntry(activeEntry);
      });
      if (!firstButtonRef.current) firstButtonRef.current = button;
      manufacturerContainer.appendChild(button);
    });
  }

  function renderModels() {
    if (!modelContainer || !docRef.current) return;
    modelContainer.innerHTML = '';
    modelElements.clear();
    const doc = docRef.current;
    const group = getActiveTypeGroup();
    const manufacturer = group?.manufacturers.find(m => m.name === activeManufacturer) || null;
    if (!manufacturer || !manufacturer.entries.length) {
      modelsHeading.textContent = activeManufacturer
        ? `One-Line Devices – ${activeManufacturer}`
        : 'One-Line Devices';
      const empty = doc.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No components available for this manufacturer.';
      modelContainer.appendChild(empty);
      return;
    }
    modelsHeading.textContent = `One-Line Devices – ${manufacturer.name}`;
    manufacturer.entries.forEach((entry, index) => {
      const item = doc.createElement('div');
      item.className = 'device-model-item';
      item.dataset.uid = entry.uid;
      item.setAttribute('role', 'button');
      const checkbox = doc.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'device-model-checkbox';
      const safeId = `component-model-${index}-${entry.uid.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      checkbox.id = safeId;
      checkbox.checked = selectionSet.has(entry.uid);
      if (entry.plotDisabledReason) {
        item.classList.add('device-model-unavailable');
        item.title = entry.plotDisabledReason;
        checkbox.disabled = true;
      }
      checkbox.addEventListener('click', event => {
        event.stopPropagation();
      });
      checkbox.addEventListener('change', event => {
        event.stopPropagation();
        setEntrySelection(entry, checkbox.checked);
      });

      const label = doc.createElement('label');
      label.className = 'device-model-label';
      label.setAttribute('for', safeId);
      label.textContent = entry.name;
      label.addEventListener('mouseenter', () => updateActiveEntry(entry));
      label.addEventListener('focus', () => updateActiveEntry(entry));

      const badge = doc.createElement('span');
      badge.className = 'device-model-badge';
      badge.textContent = 'One-Line';

      const isActive = !!activeEntry && entry.uid === activeEntry.uid;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
      item.tabIndex = isActive ? 0 : -1;
      item.addEventListener('click', () => {
        if (activeEntry && activeEntry.uid === entry.uid) return;
        updateActiveEntry(entry);
      });
      item.addEventListener('focus', () => {
        if (activeEntry && activeEntry.uid === entry.uid) return;
        updateActiveEntry(entry);
      });
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          updateActiveEntry(entry);
        }
      });
      item.addEventListener('dblclick', event => {
        event.preventDefault();
        if (entry.plotDisabledReason) return;
        setEntrySelection(entry, true);
        const payload = applySelection(entry.componentId);
        if (controllerRef.current && typeof controllerRef.current.close === 'function') {
          controllerRef.current.close(payload);
        }
      });

      item.append(checkbox, label, badge);
      if (!firstButtonRef.current) firstButtonRef.current = item;
      modelElements.set(entry.uid, { item, entry, checkbox });
      modelContainer.appendChild(item);
    });
    updateModelSelectionIndicators();
  }

  const modalPromise = openModal({
    title: 'One-Line Components',
    primaryText: 'Apply Selection',
    secondaryText: 'Close',
    onSubmit: () => applySelection(),
    onCancel: () => {
      if (componentModalBtn) componentModalBtn.setAttribute('aria-expanded', 'false');
    },
    render(container, controller) {
      const doc = container.ownerDocument;
      docRef.current = doc;
      controllerRef.current = controller;
      if (controller && typeof controller.setPrimaryDisabled === 'function') {
        controller.setPrimaryDisabled(false);
      }
      container.classList.add('device-selection-modal');

      const layout = doc.createElement('div');
      layout.className = 'device-selection-layout';

      const leftPane = doc.createElement('div');
      leftPane.className = 'device-selection-left';

      const typesHeading = doc.createElement('h3');
      typesHeading.className = 'device-selection-subtitle';
      typesHeading.textContent = 'Device Types';
      typeContainer = doc.createElement('div');
      typeContainer.className = 'device-type-list';

      const manufacturersHeading = doc.createElement('h3');
      manufacturersHeading.className = 'device-selection-subtitle';
      manufacturersHeading.textContent = 'Manufacturers';
      manufacturerContainer = doc.createElement('div');
      manufacturerContainer.className = 'device-manufacturer-list';

      modelsHeading = doc.createElement('h3');
      modelsHeading.className = 'device-selection-subtitle';
      modelsHeading.textContent = 'One-Line Devices';
      modelContainer = doc.createElement('div');
      modelContainer.className = 'device-model-list';

      leftPane.append(typesHeading, typeContainer, manufacturersHeading, manufacturerContainer, modelsHeading, modelContainer);

      detailContainer = doc.createElement('div');
      detailContainer.className = 'device-selection-details';

      layout.append(leftPane, detailContainer);
      container.appendChild(layout);

      firstButtonRef.current = null;
      renderDeviceTypes();
      renderManufacturers();
      renderModels();
      updateActiveEntry(activeEntry);

      return firstButtonRef.current || container.querySelector('button') || container;
    }
  });

  try {
    await modalPromise;
  } finally {
    controllerRef.current = null;
    if (componentModalBtn) componentModalBtn.setAttribute('aria-expanded', 'false');
  }
}
