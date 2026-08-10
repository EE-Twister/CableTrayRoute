const COMMON_PALETTE_LABELS = new Set([
  'utility',
  'utility source',
  'generator',
  'bus',
  'panel',
  'transformer',
  'xfmr 2w',
  'lv cb',
  'motor load',
  'cable',
  'cable segment'
]);

const COMMON_PALETTE_TYPES = new Set([
  'utility_source',
  'generator',
  'bus',
  'panel',
  'transformer',
  'circuit_breaker',
  'motor_load',
  'cable'
]);

export function normalizePaletteCategory(category) {
  if (category === 'bus' || category === 'busway' || category === 'panel') return 'equipment';
  if (category === 'load') return 'load';
  return category || 'equipment';
}

export function getPaletteIdentity(subtype, meta = {}) {
  const type = String(meta.type || '').trim().toLowerCase();
  const normalizedSubtype = String(meta.subtype || subtype || '').trim().toLowerCase();
  const label = String(meta.label || '').trim().toLowerCase();
  if (type === 'utility_source' || normalizedSubtype === 'utility_source' || normalizedSubtype === 'utility' || label === 'utility_source') {
    return 'sources:utility';
  }
  return `${normalizePaletteCategory(meta.category)}:${type}:${normalizedSubtype}`;
}

export function collectPaletteEntries(componentTypes = {}, componentMeta = {}) {
  const renderedLabels = new Set();
  const renderedIdentities = new Set();
  const entries = [];
  Object.entries(componentTypes).forEach(([category, subtypes]) => {
    subtypes.forEach(subtype => {
      const meta = componentMeta[subtype];
      if (!meta || meta.hidden) return;
      const normalizedLabel = String(meta.label || meta.subtype || meta.type || subtype).trim().toLowerCase();
      const identity = getPaletteIdentity(subtype, meta);
      if (identity && renderedIdentities.has(identity)) return;
      if (normalizedLabel && renderedLabels.has(normalizedLabel)) return;
      if (identity) renderedIdentities.add(identity);
      if (normalizedLabel) renderedLabels.add(normalizedLabel);
      entries.push({ category, subtype, meta });
    });
  });
  return entries;
}

export function selectPinnedPaletteEntries(entries, favorites = [], recent = []) {
  const bySubtype = new Map(entries.map(entry => [entry.subtype, entry]));
  const favoriteSubtypes = favorites.filter(subtype => bySubtype.has(subtype));
  const favoriteSet = new Set(favoriteSubtypes);
  const recentSubtypes = recent.filter(subtype => bySubtype.has(subtype) && !favoriteSet.has(subtype));
  return [
    ...favoriteSubtypes.map(subtype => ({ ...bySubtype.get(subtype), pinnedKind: 'favorite' })),
    ...recentSubtypes.map(subtype => ({ ...bySubtype.get(subtype), pinnedKind: 'recent' }))
  ];
}

export function paletteEntryMatchesFilter(entry, term, activeFilter) {
  const label = String(entry?.label || '').toLowerCase();
  const subtype = String(entry?.subtype || '').toLowerCase();
  const type = String(entry?.type || '').toLowerCase();
  const category = entry?.filterCategory || entry?.category || '';
  const matchesText = !term || label.includes(term) || subtype.includes(term) || type.includes(term);
  const matchesCategory = activeFilter === 'all'
    || (activeFilter === 'common' && entry?.common === '1')
    || category === activeFilter;
  return matchesText && matchesCategory;
}

export function createPaletteController({
  documentRef,
  categoryFilters,
  getActiveFilter,
  setActiveFilter,
  getComponentTypes,
  getComponentMeta,
  getSymbolStandard,
  getDefaultRotation,
  getViewSetting,
  setViewSetting,
  getFavorites,
  getRecent,
  clearRecent,
  onActivate,
  onDragStart,
  onContextMenu,
  onCloseContextMenu
}) {
  if (!documentRef) throw new TypeError('documentRef must be provided');

  let applyFilters = () => {};

  const createButton = (category, subtype, meta, { pinnedKind = '' } = {}) => {
    const template = documentRef.getElementById('palette-button-template');
    const button = template ? template.content.firstElementChild.cloneNode(true) : documentRef.createElement('button');
    const rotation = getDefaultRotation(meta, meta?.type);
    button.draggable = true;
    button.setAttribute('draggable', 'true');
    button.dataset.type = meta.type;
    button.dataset.category = category;
    button.dataset.filterCategory = normalizePaletteCategory(category);
    button.dataset.subtype = meta.subtype || '';
    button.setAttribute('data-subtype', meta.subtype || '');
    button.setAttribute('data-testid', 'palette-button');
    button.dataset.label = meta.label;
    button.dataset.common = COMMON_PALETTE_LABELS.has(String(meta.label || '').trim().toLowerCase())
      || COMMON_PALETTE_TYPES.has(String(meta.type || '').trim().toLowerCase())
      ? '1'
      : '0';
    button.dataset.custom = meta.isCustom ? '1' : '0';
    button.title = `${meta.label} - Drag to canvas or click to add`;
    button.setAttribute('aria-label', meta.label || meta.subtype || meta.type || subtype);
    if (pinnedKind) {
      button.classList.add('palette-pinned-button');
      button.dataset.palettePinnedKind = pinnedKind;
      button.title = `${meta.label} — ${pinnedKind === 'favorite' ? 'Favorite' : 'Recent'}; drag to canvas or click to add`;
    }

    const iconWrapper = documentRef.createElement('span');
    iconWrapper.className = 'palette-icon';
    iconWrapper.dataset.rotation = String(rotation);
    const icon = documentRef.createElement('img');
    icon.src = getSymbolStandard() === 'IEC' && meta.iconIEC ? meta.iconIEC : meta.icon;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    iconWrapper.appendChild(icon);
    button.innerHTML = '';
    button.appendChild(iconWrapper);
    const label = documentRef.createElement('span');
    label.className = 'palette-label';
    label.textContent = meta.label || meta.subtype || meta.type || subtype;
    button.appendChild(label);

    button.addEventListener('click', event => {
      if (event.button !== 0) return;
      onActivate({ meta, subtype, rerender: render });
    });
    button.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', JSON.stringify({ type: meta.type, subtype }));
      onDragStart(event, meta, rotation);
    });
    button.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      onContextMenu(meta, button, event.clientX, event.clientY, subtype);
    });
    button.addEventListener('keydown', event => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      event.preventDefault();
      const rect = button.getBoundingClientRect();
      onContextMenu(meta, button, rect.left + rect.width / 2, rect.top + rect.height / 2, subtype);
    });
    return button;
  };

  const render = () => {
    onCloseContextMenu();
    const palette = documentRef.getElementById('component-buttons');
    const pinnedContainer = documentRef.getElementById('palette-pinned-buttons');
    const noResults = documentRef.getElementById('palette-no-results');
    if (!palette) return;
    if (pinnedContainer) pinnedContainer.innerHTML = '';
    const sectionContainers = {
      sources: documentRef.getElementById('sources-buttons'),
      equipment: documentRef.getElementById('equipment-buttons'),
      protection: documentRef.getElementById('protection-buttons'),
      load: documentRef.getElementById('load-buttons'),
      bus: documentRef.getElementById('bus-buttons'),
      cable: documentRef.getElementById('cable-buttons'),
      links: documentRef.getElementById('links-buttons'),
      annotations: documentRef.getElementById('annotations-buttons')
    };
    Object.values(sectionContainers).forEach(container => {
      if (container) container.innerHTML = '';
    });

    applyFilters = () => {
      const search = documentRef.getElementById('palette-search');
      const term = search?.value.trim().toLowerCase() || '';
      const configuredFilter = getActiveFilter();
      const activeFilter = Object.prototype.hasOwnProperty.call(categoryFilters, configuredFilter)
        ? configuredFilter
        : 'common';
      let visibleCount = 0;
      palette.querySelectorAll('button[data-testid="palette-button"]').forEach(button => {
        const visible = paletteEntryMatchesFilter(button.dataset, term, activeFilter);
        button.hidden = !visible;
        if (visible) visibleCount += 1;
      });
      documentRef.querySelectorAll('#component-buttons .palette-filter').forEach(button => {
        const active = button.dataset.paletteFilter === activeFilter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      documentRef.querySelectorAll('#component-buttons details').forEach(details => {
        const sectionFilter = details.dataset.filterCategory || details.dataset.category || '';
        const categoryVisible = activeFilter === 'all' || activeFilter === 'common' || sectionFilter === activeFilter;
        const buttons = Array.from(details.querySelectorAll('button[data-testid="palette-button"]'));
        const hasVisibleButton = buttons.some(button => !button.hidden);
        const card = details.closest('.palette-card');
        if (card) card.hidden = buttons.length === 0 || !categoryVisible || (!hasVisibleButton && term);
        if (term && hasVisibleButton) details.open = true;
      });
      const pinned = documentRef.getElementById('palette-pinned');
      if (pinned) {
        const hasPinned = Array.from(pinned.querySelectorAll('button[data-testid="palette-button"]')).some(button => !button.hidden);
        pinned.hidden = !hasPinned;
      }
      if (noResults) noResults.hidden = visibleCount > 0;
    };

    const textNodeType = documentRef.defaultView?.Node?.TEXT_NODE ?? 3;
    Object.entries(sectionContainers).forEach(([category, container]) => {
      const summary = container?.parentElement?.querySelector('summary');
      if (!summary) return;
      const details = summary.closest('details');
      if (details) {
        details.dataset.category = category;
        details.dataset.filterCategory = normalizePaletteCategory(category);
      }
      Array.from(summary.childNodes).forEach(node => {
        if (node.nodeType === textNodeType) summary.removeChild(node);
      });
      let label = summary.querySelector('.summary-label');
      if (!label) {
        label = documentRef.createElement('span');
        label.className = 'summary-label';
        summary.appendChild(label);
      }
      label.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    });

    const entries = collectPaletteEntries(getComponentTypes(), getComponentMeta());
    entries.forEach(entry => {
      const container = sectionContainers[entry.category]
        || (entry.category === 'busway' ? sectionContainers.equipment : null)
        || palette;
      container.appendChild(createButton(entry.category, entry.subtype, entry.meta));
    });
    if (pinnedContainer) {
      selectPinnedPaletteEntries(entries, getFavorites(), getRecent()).forEach(entry => {
        pinnedContainer.appendChild(createButton(entry.category, entry.subtype, entry.meta, {
          pinnedKind: entry.pinnedKind
        }));
      });
    }

    documentRef.querySelectorAll('#component-buttons details').forEach(details => {
      const key = `palette-${details.id}-open`;
      const container = details.querySelector('.section-buttons');
      const hasButtons = container && container.children.length > 0;
      const card = details.closest('.palette-card');
      if (card) card.hidden = !hasButtons;
      if (!hasButtons && container) {
        const placeholder = documentRef.createElement('div');
        placeholder.className = 'no-components';
        placeholder.textContent = 'No components available';
        container.appendChild(placeholder);
      }
      const stored = getViewSetting(key, null);
      if (stored !== null) {
        details.open = stored === true || stored === 'true';
      } else if (!hasButtons) {
        details.open = true;
      }
      if (!details.dataset.paletteToggleBound) {
        details.addEventListener('toggle', () => setViewSetting(key, details.open));
        details.dataset.paletteToggleBound = '1';
      }
    });

    const search = documentRef.getElementById('palette-search');
    if (search && !search.dataset.paletteSearchBound) {
      search.addEventListener('input', () => applyFilters());
      search.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        search.value = '';
        setActiveFilter('common');
        applyFilters();
      });
      search.dataset.paletteSearchBound = '1';
    }
    documentRef.querySelectorAll('#component-buttons .palette-filter').forEach(button => {
      if (button.dataset.paletteFilterBound) return;
      button.addEventListener('click', () => {
        const filter = button.dataset.paletteFilter || 'all';
        setActiveFilter(Object.prototype.hasOwnProperty.call(categoryFilters, filter) ? filter : 'all');
        applyFilters();
      });
      button.dataset.paletteFilterBound = '1';
    });
    const clearFilterButton = documentRef.getElementById('palette-clear-filter-btn');
    if (clearFilterButton && !clearFilterButton.dataset.paletteClearBound) {
      clearFilterButton.addEventListener('click', () => {
        const searchInput = documentRef.getElementById('palette-search');
        if (searchInput) searchInput.value = '';
        setActiveFilter('all');
        applyFilters();
      });
      clearFilterButton.dataset.paletteClearBound = '1';
    }
    const clearRecentButton = documentRef.getElementById('palette-clear-recent-btn');
    if (clearRecentButton && !clearRecentButton.dataset.paletteRecentBound) {
      clearRecentButton.addEventListener('click', () => {
        clearRecent();
        render();
      });
      clearRecentButton.dataset.paletteRecentBound = '1';
    }
    applyFilters();
  };

  return { applyFilters: () => applyFilters(), render };
}
