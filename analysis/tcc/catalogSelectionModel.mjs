export function resolveCatalogSelection({
  entries,
  savedDeviceIds = [],
  previousSelection = [],
  preserveSelection = false,
  resetSelection = false,
  includeComponentContext = false,
  contextComponentUid = '',
  neighborDeviceIds = [],
  includeDeviceParam = false,
  deviceParam = '',
}) {
  const available = new Set(entries.map(entry => entry.uid));
  const defaults = new Set(resetSelection ? [] : savedDeviceIds.filter(id => available.has(id)));
  if (preserveSelection) {
    previousSelection.forEach(id => {
      if (available.has(id)) defaults.add(id);
    });
  }
  if (includeComponentContext && contextComponentUid) {
    defaults.add(contextComponentUid);
    neighborDeviceIds.forEach(id => {
      if (available.has(id)) defaults.add(id);
    });
  }
  if (includeDeviceParam && deviceParam) {
    const hasComponentDevice = [...defaults].some(id => {
      const entry = entries.find(item => item.uid === id);
      return entry?.kind === 'component' && entry.baseDeviceId === deviceParam;
    });
    const libraryEntry = entries.find(entry => (
      entry.kind === 'library' && entry.baseDeviceId === deviceParam
    ));
    if (libraryEntry && !hasComponentDevice) defaults.add(libraryEntry.uid);
  }
  entries.filter(entry => entry.autoSelect).forEach(entry => defaults.add(entry.uid));
  if (!defaults.size && entries.length) {
    const first = entries.find(entry => entry.kind === 'component')
      || entries.find(entry => entry.kind === 'library');
    if (first) defaults.add(first.uid);
  }
  return [...defaults].filter(id => available.has(id));
}
