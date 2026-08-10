export async function openDeviceSelectionModalView(dependencies = {}) {
  const {
    applySelectionSet,
    assessProtectiveDeviceLibraryEntry,
    buildTypeGroups,
    deviceEntries,
    deviceMap,
    getContextDeviceRelationshipMap,
    getDeviceRelationship,
    hydrateProtectiveDevices,
    libraryDevices,
    mergeProtectiveDeviceReview,
    openModal,
    openProtectiveDeviceReview,
    renderDeviceDetails,
    requestPlotRefresh,
    saved,
    selectedDeviceIds,
    setItem,
    sortDeviceIdsForContext,
    summarizeProtectiveDeviceLibrary
  } = dependencies;
  const contextRelationshipMap = getContextDeviceRelationshipMap();
  const getLibraryAssessment = entry => entry.kind === 'library'
    ? (entry.libraryAssessment || assessProtectiveDeviceLibraryEntry(entry.baseDevice))
    : null;
  const libraryEntries = deviceEntries.filter(entry => entry.kind === 'library' && !entry.isCustom);
  const libraryStatusFilters = [
    {
      id: 'library-calculation-ready',
      label: 'Calculation Ready',
      status: 'calculation_ready'
    },
    {
      id: 'library-source-verified',
      label: 'Source Verified',
      status: 'source_verified'
    },
    {
      id: 'library-standards-reference',
      label: 'Standards Reference',
      status: 'standards_reference'
    },
    {
      id: 'library-screening',
      label: 'Screening Only',
      status: 'screening'
    }
  ].map(filter => ({
    ...filter,
    count: libraryEntries.filter(entry => getLibraryAssessment(entry)?.status === filter.status).length,
    predicate: entry => getLibraryAssessment(entry)?.status === filter.status
  }));
  const quickFilters = [
    {
      id: 'context',
      label: 'One-Line Context',
      count: [...contextRelationshipMap.keys()].filter(uid => deviceMap.has(uid)).length,
      predicate: entry => contextRelationshipMap.has(entry.uid)
    },
    {
      id: 'library',
      label: 'Library',
      count: deviceEntries.filter(entry => entry.kind === 'library' && !entry.isCustom && entry.baseDevice?.groundFault !== true).length,
      predicate: entry => entry.kind === 'library' && !entry.isCustom && entry.baseDevice?.groundFault !== true
    },
    {
      id: 'custom',
      label: 'Custom Curves',
      count: deviceEntries.filter(entry => entry.isCustom).length,
      predicate: entry => entry.isCustom
    },
    {
      id: 'gfp',
      label: 'Ground Fault',
      count: deviceEntries.filter(entry => entry.baseDevice?.groundFault === true).length,
      predicate: entry => entry.baseDevice?.groundFault === true
    },
    {
      id: 'all',
      label: 'All Devices',
      count: deviceEntries.length,
      predicate: () => true
    },
    ...libraryStatusFilters
  ];
  let activeQuickFilter = contextRelationshipMap.size ? 'context' : 'all';
  const getActiveQuickFilter = () => quickFilters.find(filter => filter.id === activeQuickFilter) || quickFilters[quickFilters.length - 1];
  const filterModalEntries = () => deviceEntries.filter(entry => getActiveQuickFilter().predicate(entry));
  let typeGroups = buildTypeGroups(filterModalEntries());
  if (!typeGroups.length && activeQuickFilter !== 'all') {
    activeQuickFilter = 'all';
    typeGroups = buildTypeGroups(filterModalEntries());
  }
  if (!typeGroups.length) {
    await openModal({
      title: 'Select Devices',
      primaryText: 'Close',
      secondaryText: null,
      onSubmit: () => true,
      render(container) {
        const doc = container.ownerDocument;
        const message = doc.createElement('p');
        message.className = 'device-detail-empty';
        message.textContent = 'No protective devices are available for selection.';
        container.appendChild(message);
        return message;
      }
    });
    return;
  }

  const initialSelection = new Set(selectedDeviceIds());
  const selectionSet = new Set(initialSelection);

  const overrideSnapshots = new Map();
  deviceEntries
    .filter(entry => entry && (entry.kind === 'library' || entry.kind === 'component'))
    .forEach(entry => {
      overrideSnapshots.set(entry.uid, { ...(entry.overrideSource || {}) });
    });

  const findSelectedContext = () => {
    for (const group of typeGroups) {
      for (const manufacturer of group.manufacturers) {
        const entry = manufacturer.entries.find(item => selectionSet.has(item.uid));
        if (entry) {
          return { group, manufacturer, entry };
        }
      }
    }
    return null;
  };

  const selectedContext = findSelectedContext();
  let activeTypeId = selectedContext?.group?.id || typeGroups[0]?.id || null;
  let activeManufacturer = selectedContext?.manufacturer?.name
    || (typeGroups.find(group => group.id === activeTypeId)?.manufacturers[0]?.name)
    || null;
  let activeEntry = selectedContext?.entry
    || (typeGroups.find(group => group.id === activeTypeId)?.manufacturers.find(m => m.name === activeManufacturer)?.entries[0])
    || null;

  const getActiveTypeGroup = () => typeGroups.find(group => group.id === activeTypeId) || typeGroups[0] || null;

  function syncActiveDeviceContext() {
    const selectedContext = findSelectedContext();
    activeTypeId = selectedContext?.group?.id || typeGroups[0]?.id || null;
    activeManufacturer = selectedContext?.manufacturer?.name
      || (typeGroups.find(group => group.id === activeTypeId)?.manufacturers[0]?.name)
      || null;
    activeEntry = selectedContext?.entry
      || (typeGroups.find(group => group.id === activeTypeId)?.manufacturers.find(m => m.name === activeManufacturer)?.entries[0])
      || null;
  }

  function refreshTypeGroupsForFilter() {
    typeGroups = buildTypeGroups(filterModalEntries());
    if (!typeGroups.length && activeQuickFilter !== 'all') {
      activeQuickFilter = 'all';
      typeGroups = buildTypeGroups(filterModalEntries());
    }
    syncActiveDeviceContext();
  }

  syncActiveDeviceContext();

  let filterContainer;
  let typeContainer;
  let manufacturerContainer;
  let modelContainer;
  let detailContainer;
  let selectionSummaryContainer;
  const modelElements = new Map();
  const firstButtonRef = { current: null };

  const docRef = { current: null };
  let readinessEl = null;

  const updateReadinessSummary = () => {
    if (!readinessEl) return;
    const summary = summarizeProtectiveDeviceLibrary(libraryDevices);
    readinessEl.textContent = `Library readiness: ${summary.calculation_ready} calculation-ready, ${summary.source_verified} source-verified pending peer review, ${summary.standards_reference} standards-reference, and ${summary.screening} screening-only entries.`;
  };

  async function handleEntryReview(entry) {
    await hydrateProtectiveDevices([entry?.baseDeviceId]);
    const device = libraryDevices.find(item => item.id === entry?.baseDeviceId);
    if (!device?.id) return null;
    return openProtectiveDeviceReview(device, {
      review: saved.protectiveDeviceReviews?.[device.id] || null,
      onSave: review => {
        saved.protectiveDeviceReviews[device.id] = review;
        setItem('tccSettings', saved);
        const merged = mergeProtectiveDeviceReview(device, review);
        deviceEntries
          .filter(item => item.baseDeviceId === device.id)
          .forEach(item => {
            item.baseDevice = merged;
            item.libraryAssessment = assessProtectiveDeviceLibraryEntry(merged);
          });
        const libraryDevice = libraryDevices.find(item => item.id === device.id);
        if (libraryDevice) Object.assign(libraryDevice, merged);
        updateReadinessSummary();
        return true;
      }
    }).then(result => {
      const refreshed = deviceMap.get(entry.uid) || entry;
      activeEntry = refreshed;
      renderDeviceDetails(refreshed, detailContainer, docRef.current, { onReview: handleEntryReview });
      return result;
    });
  }

  function updateActiveEntry(entry) {
    activeEntry = entry;
    modelElements.forEach(({ item }, uid) => {
      item.classList.toggle('active', !!entry && uid === entry.uid);
    });
    renderDeviceDetails(entry, detailContainer, docRef.current, { onReview: handleEntryReview });
  }

  function updateModelSelectionIndicators() {
    modelElements.forEach(({ item, checkbox }, uid) => {
      const selected = selectionSet.has(uid);
      if (item) item.classList.toggle('is-selected', selected);
      if (checkbox) checkbox.checked = selected;
    });
  }

  const getSelectedEntries = () => sortDeviceIdsForContext([...selectionSet])
    .map(id => deviceMap.get(id))
    .filter(Boolean);

  function renderQuickFilters() {
    if (!filterContainer || !docRef.current) return;
    filterContainer.innerHTML = '';
    quickFilters.forEach(filter => {
      const button = docRef.current.createElement('button');
      button.type = 'button';
      button.className = 'device-filter-btn';
      if (filter.status) button.dataset.libraryStatus = filter.status;
      if (filter.id === activeQuickFilter) button.classList.add('active');
      button.textContent = `${filter.label} (${filter.count})`;
      button.disabled = filter.count === 0 && filter.id !== 'all';
      button.addEventListener('click', () => {
        if (button.disabled || activeQuickFilter === filter.id) return;
        activeQuickFilter = filter.id;
        refreshTypeGroupsForFilter();
        renderQuickFilters();
        renderDeviceTypes();
        renderManufacturers();
        renderModels();
        updateActiveEntry(activeEntry);
      });
      filterContainer.appendChild(button);
    });
  }

  function renderSelectionSummary() {
    if (!selectionSummaryContainer || !docRef.current) return;
    const doc = docRef.current;
    selectionSummaryContainer.innerHTML = '';
    const heading = doc.createElement('h3');
    heading.className = 'device-selection-subtitle';
    heading.textContent = 'Selected Devices';
    selectionSummaryContainer.appendChild(heading);

    const selectedEntries = getSelectedEntries();
    if (!selectedEntries.length) {
      const empty = doc.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No devices selected for plotting.';
      selectionSummaryContainer.appendChild(empty);
      return;
    }

    const list = doc.createElement('ul');
    list.className = 'component-selection-list';
    selectedEntries.forEach(entry => {
      const relationship = getDeviceRelationship(entry.uid, contextRelationshipMap);
      const item = doc.createElement('li');
      item.className = `component-selection-item ${relationship.className}`;
      const name = doc.createElement('span');
      name.className = 'component-selection-name';
      name.textContent = entry.name;
      const role = doc.createElement('span');
      role.className = 'component-selection-role';
      role.textContent = relationship.label;
      const removeBtn = doc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'component-selection-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        selectionSet.delete(entry.uid);
        applySelectionSet(selectionSet);
        updateModelSelectionIndicators();
        renderSelectionSummary();
      });
      item.append(role, name, removeBtn);
      list.appendChild(item);
    });
    selectionSummaryContainer.appendChild(list);

    const summary = doc.createElement('p');
    summary.className = 'component-selection-summary-text';
    summary.textContent = `${selectedEntries.length} device${selectedEntries.length === 1 ? '' : 's'} selected for plotting.`;
    selectionSummaryContainer.appendChild(summary);
  }

  function renderDeviceTypes() {
    if (!typeContainer || !docRef.current) return;
    typeContainer.innerHTML = '';
    firstButtonRef.current = firstButtonRef.current && docRef.current.contains(firstButtonRef.current)
      ? firstButtonRef.current
      : null;
    if (!typeGroups.length) {
      const empty = docRef.current.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No devices match this filter.';
      typeContainer.appendChild(empty);
      updateActiveEntry(null);
      return;
    }
    typeGroups.forEach(group => {
      const button = docRef.current.createElement('button');
      button.type = 'button';
      button.className = 'device-type-btn';
      if (group.id === activeTypeId) button.classList.add('active');
      button.textContent = `${group.label} (${group.total})`;
      button.addEventListener('click', () => {
        activeTypeId = group.id;
        const selectedInGroup = group.manufacturers
          .map(manufacturer => ({ manufacturer, entry: manufacturer.entries.find(item => selectionSet.has(item.uid)) }))
          .find(result => result && result.entry);
        const fallbackManufacturer = group.manufacturers[0]?.name || null;
        activeManufacturer = selectedInGroup?.manufacturer?.name || fallbackManufacturer;
        activeEntry = selectedInGroup?.entry
          || (group.manufacturers.find(manufacturer => manufacturer.name === activeManufacturer)?.entries[0] || null);
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
    const group = getActiveTypeGroup();
    if (!group || !group.manufacturers.length) {
      const empty = docRef.current.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No manufacturers available for this device type.';
      manufacturerContainer.appendChild(empty);
      return;
    }
    if (!group.manufacturers.some(manufacturer => manufacturer.name === activeManufacturer)) {
      activeManufacturer = group.manufacturers[0].name;
    }
    group.manufacturers.forEach(manufacturer => {
      const button = docRef.current.createElement('button');
      button.type = 'button';
      button.className = 'device-manufacturer-btn';
      if (manufacturer.name === activeManufacturer) button.classList.add('active');
      button.textContent = `${manufacturer.name} (${manufacturer.entries.length})`;
      button.addEventListener('click', () => {
        activeManufacturer = manufacturer.name;
        const selectedInGroup = manufacturer.entries.find(entry => selectionSet.has(entry.uid));
        activeEntry = selectedInGroup || manufacturer.entries[0] || null;
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
    modelElements.clear();
    modelContainer.innerHTML = '';
    const group = getActiveTypeGroup();
    if (!group) {
      const empty = docRef.current.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No devices available for this type.';
      modelContainer.appendChild(empty);
      updateActiveEntry(null);
      return;
    }
    const manufacturer = group.manufacturers.find(m => m.name === activeManufacturer)
      || group.manufacturers[0];
    if (!manufacturer || !manufacturer.entries.length) {
      const empty = docRef.current.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No models available for this manufacturer.';
      modelContainer.appendChild(empty);
      updateActiveEntry(null);
      return;
    }
    if (!manufacturer.entries.some(entry => entry.uid === (activeEntry && activeEntry.uid))) {
      activeEntry = manufacturer.entries.find(entry => selectionSet.has(entry.uid)) || manufacturer.entries[0] || null;
    }
    manufacturer.entries.forEach((entry, index) => {
      const relationship = getDeviceRelationship(entry.uid, contextRelationshipMap);
      const item = docRef.current.createElement('div');
      item.className = `device-model-item ${relationship.className}`;
      if (activeEntry && activeEntry.uid === entry.uid) {
        item.classList.add('active');
      }
      const checkbox = docRef.current.createElement('input');
      checkbox.type = 'checkbox';
      const safeId = `device-model-${index}-${entry.uid.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      checkbox.id = safeId;
      checkbox.checked = selectionSet.has(entry.uid);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectionSet.add(entry.uid);
        } else {
          selectionSet.delete(entry.uid);
        }
        applySelectionSet(selectionSet);
        updateModelSelectionIndicators();
        renderSelectionSummary();
      });
      checkbox.addEventListener('focus', () => updateActiveEntry(entry));
      item.appendChild(checkbox);

      const label = docRef.current.createElement('label');
      label.className = 'device-model-label';
      label.setAttribute('for', safeId);
      label.textContent = entry.name;
      label.addEventListener('click', () => updateActiveEntry(entry));
      label.addEventListener('focus', () => updateActiveEntry(entry));
      label.addEventListener('mouseenter', () => updateActiveEntry(entry));
      item.appendChild(label);

      const badge = docRef.current.createElement('span');
      badge.className = 'device-model-badge';
      if (relationship.role !== 'additional') {
        badge.textContent = relationship.label;
      } else if (entry.kind === 'component') {
        badge.textContent = 'One-Line';
      } else if (entry.kind === 'library') {
        const assessment = entry.libraryAssessment || assessProtectiveDeviceLibraryEntry(entry.baseDevice);
        badge.textContent = assessment.shortLabel;
      } else {
        badge.textContent = 'Curve';
      }
      item.appendChild(badge);

      modelContainer.appendChild(item);
      modelElements.set(entry.uid, { item, checkbox });
    });
  }

  await openModal({
    title: 'Select Devices',
    description: 'Choose protective devices to include on the TCC chart. Filter the library by readiness to separate calculation-ready, source-verified, standards-reference, and screening-only curves.',
    primaryText: 'Done',
    secondaryText: 'Cancel',
    resizable: true,
    defaultWidth: 960,
    closeOnBackdrop: false,
    onSubmit() {
      applySelectionSet(selectionSet, { persist: true });
      requestPlotRefresh();
      return true;
    },
    onCancel() {
      overrideSnapshots.forEach((overrides, uid) => {
        const entry = deviceMap.get(uid);
        if (entry && (entry.kind === 'library' || entry.kind === 'component')) {
          entry.overrideSource = { ...overrides };
        }
      });
      applySelectionSet(initialSelection, { persist: true });
      requestPlotRefresh();
    },
    render(container, controls) {
      const doc = container.ownerDocument;
      docRef.current = doc;
      container.classList.add('device-selection-modal');
      const librarySummary = summarizeProtectiveDeviceLibrary(libraryDevices);
      readinessEl = doc.createElement('p');
      readinessEl.className = 'device-library-readiness';
      readinessEl.textContent = `Library readiness: ${librarySummary.calculation_ready} calculation-ready, ${librarySummary.source_verified} source-verified pending peer review, ${librarySummary.standards_reference} standards-reference, and ${librarySummary.screening} screening-only entries.`;
      container.appendChild(readinessEl);
      const layout = doc.createElement('div');
      layout.className = 'device-selection-layout';

      const leftPane = doc.createElement('div');
      leftPane.className = 'device-selection-left';

      const filtersHeading = doc.createElement('h3');
      filtersHeading.className = 'device-selection-subtitle';
      filtersHeading.textContent = 'Filters';
      leftPane.appendChild(filtersHeading);

      filterContainer = doc.createElement('div');
      filterContainer.className = 'device-filter-list';
      leftPane.appendChild(filterContainer);

      const typesHeading = doc.createElement('h3');
      typesHeading.className = 'device-selection-subtitle';
      typesHeading.textContent = 'Device Types';
      leftPane.appendChild(typesHeading);

      typeContainer = doc.createElement('div');
      typeContainer.className = 'device-type-list';
      leftPane.appendChild(typeContainer);

      const manufacturersHeading = doc.createElement('h3');
      manufacturersHeading.className = 'device-selection-subtitle';
      manufacturersHeading.textContent = 'Manufacturers';
      leftPane.appendChild(manufacturersHeading);

      manufacturerContainer = doc.createElement('div');
      manufacturerContainer.className = 'device-manufacturer-list';
      leftPane.appendChild(manufacturerContainer);

      const modelsHeading = doc.createElement('h3');
      modelsHeading.className = 'device-selection-subtitle';
      modelsHeading.textContent = 'Devices';
      leftPane.appendChild(modelsHeading);

      modelContainer = doc.createElement('div');
      modelContainer.className = 'device-model-list';
      leftPane.appendChild(modelContainer);

      detailContainer = doc.createElement('div');
      detailContainer.className = 'device-selection-details';

      selectionSummaryContainer = doc.createElement('div');
      selectionSummaryContainer.className = 'component-selection-summary-panel';

      const rightPane = doc.createElement('div');
      rightPane.className = 'device-selection-right';
      rightPane.append(selectionSummaryContainer, detailContainer);

      layout.append(leftPane, rightPane);
      container.appendChild(layout);

      renderQuickFilters();
      renderDeviceTypes();
      renderManufacturers();
      renderModels();
      updateActiveEntry(activeEntry);
      renderSelectionSummary();

      const initialFocus = firstButtonRef.current || leftPane;
      if (initialFocus && controls && typeof controls.setInitialFocus === 'function') {
        controls.setInitialFocus(initialFocus);
      }
      return initialFocus;
    }
  });
}
