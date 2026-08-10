export function getPropertyEditorDeviceLabel(component) {
  if (!component) return 'Device';
  const label = typeof component.label === 'string' ? component.label.trim() : '';
  if (label) return label;
  return component.subtype || component.type || component.id || 'Device';
}

export function buildPropertyEditorCategories(devices, getCategory) {
  const sortedDevices = [...devices].sort((left, right) => (
    getPropertyEditorDeviceLabel(left).localeCompare(
      getPropertyEditorDeviceLabel(right),
      undefined,
      { sensitivity: 'base' }
    )
  ));
  const categories = new Map();
  sortedDevices.forEach(device => {
    const category = getCategory(device) || 'equipment';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(device);
  });
  return categories;
}

export function createPropertyEditorController({
  documentRef,
  modal,
  devices,
  initialComponent,
  getCategory,
  getCategoryLabel,
  onSelectionChange
}) {
  if (!documentRef || !modal) throw new TypeError('documentRef and modal must be provided');
  if (modal._outsideHandler) modal.removeEventListener('click', modal._outsideHandler);
  if (modal._keyHandler) documentRef.removeEventListener('keydown', modal._keyHandler);
  modal.innerHTML = '';

  const categories = buildPropertyEditorCategories(devices, getCategory);
  const categoryOrder = Array.from(categories.keys()).sort((left, right) => (
    getCategoryLabel(left).localeCompare(getCategoryLabel(right), undefined, { sensitivity: 'base' })
  ));
  let activeComponent = initialComponent || devices[0] || null;
  let activeCategory = activeComponent ? getCategory(activeComponent) || null : null;
  if (!activeCategory || !categories.has(activeCategory)) activeCategory = categoryOrder[0] || null;
  if (activeCategory && (!activeComponent || !categories.get(activeCategory).some(device => device.id === activeComponent.id))) {
    activeComponent = categories.get(activeCategory)?.[0] || null;
  }
  let activeId = activeComponent?.id || null;
  let renderProperties = () => {};

  const panel = documentRef.createElement('div');
  panel.className = 'prop-modal-panel';
  modal.appendChild(panel);
  const layout = documentRef.createElement('div');
  layout.className = 'prop-modal-layout';
  panel.appendChild(layout);

  const componentColumn = documentRef.createElement('div');
  componentColumn.className = 'prop-modal-column prop-modal-components';
  const categoryHeading = documentRef.createElement('h3');
  categoryHeading.className = 'prop-modal-heading';
  categoryHeading.textContent = 'Categories';
  const categoryList = documentRef.createElement('div');
  categoryList.className = 'prop-category-list';
  const componentHeading = documentRef.createElement('h3');
  componentHeading.className = 'prop-modal-heading';
  componentHeading.textContent = 'Device Tags';
  const componentList = documentRef.createElement('div');
  componentList.className = 'prop-component-list';
  componentColumn.append(categoryHeading, categoryList, componentHeading, componentList);
  layout.appendChild(componentColumn);

  const propertyColumn = documentRef.createElement('div');
  propertyColumn.className = 'prop-modal-column prop-modal-properties';
  const propertyHeading = documentRef.createElement('h3');
  propertyHeading.className = 'prop-modal-heading';
  propertyColumn.appendChild(propertyHeading);
  const propertyContainer = documentRef.createElement('div');
  propertyContainer.className = 'prop-property-container';
  propertyColumn.appendChild(propertyContainer);
  layout.appendChild(propertyColumn);

  const categoryButtons = new Map();
  const deviceButtons = new Map();
  const applyPendingChanges = () => {
    if (typeof modal._applyChanges === 'function') modal._applyChanges();
  };

  const updateCategoryStates = () => {
    categoryButtons.forEach((button, category) => {
      const selected = category === activeCategory;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  };

  const updateDeviceStates = () => {
    deviceButtons.forEach((button, id) => {
      const selected = id === activeId;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  };

  const notifySelection = component => onSelectionChange(component || null);

  let renderDeviceButtons = () => {};
  const setActiveComponent = target => {
    if (!target) return;
    applyPendingChanges();
    const targetCategory = getCategory(target) || activeCategory;
    if (targetCategory && targetCategory !== activeCategory) {
      activeCategory = targetCategory;
      renderDeviceButtons();
      updateCategoryStates();
    } else if (!deviceButtons.has(target.id)) {
      renderDeviceButtons();
    }
    activeComponent = target;
    activeId = target.id;
    notifySelection(target);
    updateDeviceStates();
    renderProperties(target);
  };

  renderDeviceButtons = () => {
    componentList.innerHTML = '';
    deviceButtons.clear();
    const categoryDevices = activeCategory ? categories.get(activeCategory) || [] : [];
    componentHeading.textContent = activeCategory
      ? `Device Tags – ${getCategoryLabel(activeCategory)}`
      : 'Device Tags';
    categoryDevices.forEach(device => {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'prop-component-option';
      button.dataset.componentId = device.id;
      button.textContent = getPropertyEditorDeviceLabel(device);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (activeId === device.id) return;
        setActiveComponent(device);
      });
      deviceButtons.set(device.id, button);
      componentList.appendChild(button);
    });
    if (!categoryDevices.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'prop-component-empty view-modal-empty';
      empty.textContent = 'No devices in this category.';
      componentList.appendChild(empty);
    }
  };

  const renderCategoryButtons = () => {
    categoryList.innerHTML = '';
    categoryButtons.clear();
    categoryOrder.forEach(category => {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'prop-category-option';
      button.textContent = getCategoryLabel(category);
      button.dataset.category = category;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (activeCategory === category) return;
        activeCategory = category;
        const nextDevice = categories.get(activeCategory)?.[0] || null;
        renderDeviceButtons();
        updateCategoryStates();
        if (nextDevice) {
          setActiveComponent(nextDevice);
        } else {
          applyPendingChanges();
          activeComponent = null;
          activeId = null;
          notifySelection(null);
          renderProperties(null);
          updateDeviceStates();
        }
      });
      categoryButtons.set(category, button);
      categoryList.appendChild(button);
    });
  };

  const close = options => {
    const shouldApply = !!(
      options
      && typeof options === 'object'
      && Object.prototype.hasOwnProperty.call(options, 'applyChanges')
      && options.applyChanges
    );
    if (shouldApply) applyPendingChanges();
    modal.classList.remove('show');
    modal.removeEventListener('click', outsideHandler);
    if (modal._pointerDownHandler) modal.removeEventListener('pointerdown', modal._pointerDownHandler);
    documentRef.removeEventListener('keydown', keyHandler);
    delete modal._outsideHandler;
    delete modal._keyHandler;
    delete modal._applyChanges;
    delete modal._pointerDownHandler;
    delete modal._pointerDownOnOverlay;
    notifySelection(null);
  };

  const outsideHandler = event => {
    if (event.target === modal && modal._pointerDownOnOverlay) close({ applyChanges: true });
    modal._pointerDownOnOverlay = false;
  };
  const keyHandler = event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  };
  const pointerDownHandler = event => {
    modal._pointerDownOnOverlay = event.target === modal;
  };

  const start = () => {
    renderCategoryButtons();
    renderDeviceButtons();
    updateCategoryStates();
    updateDeviceStates();
    notifySelection(activeComponent);
    renderProperties(activeComponent);
    deviceButtons.get(activeId)?.focus();
    modal.classList.add('show');
    modal.addEventListener('click', outsideHandler);
    modal.addEventListener('pointerdown', pointerDownHandler);
    modal._pointerDownHandler = pointerDownHandler;
    modal._pointerDownOnOverlay = false;
    documentRef.addEventListener('keydown', keyHandler);
    modal._outsideHandler = outsideHandler;
    modal._keyHandler = keyHandler;
  };

  return {
    close,
    modal,
    propertyContainer,
    propertyHeading,
    setActiveComponent,
    setPropertyRenderer(renderer) {
      renderProperties = typeof renderer === 'function' ? renderer : () => {};
    },
    start
  };
}
