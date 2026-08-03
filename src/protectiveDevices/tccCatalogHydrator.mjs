export function createTccCatalogHydrator({
  catalog,
  getBaseDevices,
  getLibraryDevices,
  setBaseDevices,
  setLibraryDevices,
  getDeviceEntries,
  getReviews,
  mergeReview,
  assess,
}) {
  return async function hydrateProtectiveDevices(ids) {
    const requestedIds = [...new Set((ids || []).filter(Boolean))];
    const libraryDevices = getLibraryDevices();
    const metadataIds = requestedIds.filter(id => (
      libraryDevices.find(device => device.id === id)?.catalogShard
    ));
    if (!metadataIds.length) return [];

    let loaded;
    try {
      loaded = await catalog.loadDevices(metadataIds);
    } catch (error) {
      console.error('Failed to load selected protective-device curves', error);
      return [];
    }
    if (!loaded.length) return [];
    const loadedById = new Map(loaded.map(device => [device.id, device]));
    setBaseDevices(getBaseDevices().map(device => loadedById.get(device.id) || device));
    const reviews = getReviews();
    const hydratedLibrary = libraryDevices.map(device => {
      const hydrated = loadedById.get(device.id);
      if (!hydrated) return device;
      const review = reviews?.[device.id];
      return review ? mergeReview(hydrated, review) : hydrated;
    });
    setLibraryDevices(hydratedLibrary);

    const activeById = new Map(hydratedLibrary.map(device => [device.id, device]));
    getDeviceEntries().forEach(entry => {
      const hydrated = activeById.get(entry.baseDeviceId);
      if (!hydrated) return;
      entry.baseDevice = hydrated;
      entry.libraryAssessment = assess(hydrated);
    });
    return loaded;
  };
}
