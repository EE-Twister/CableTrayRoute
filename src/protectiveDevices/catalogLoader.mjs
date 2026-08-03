import { startPerformanceMeasurement } from '../performance/performanceMetrics.js';

function defaultFetch(...args) {
  return globalThis.fetch(...args);
}

async function fetchJson(fetchFn, url, label) {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status})`);
  }
  return response.json();
}

export function createProtectiveDeviceCatalogLoader({
  indexUrl = 'data/protectiveDeviceIndex.json',
  shardBaseUrl = 'data/protectiveDeviceCatalog',
  legacyUrl = 'data/protectiveDevices.json',
  fetchFn = defaultFetch,
} = {}) {
  let indexPromise;
  let indexById;
  let legacyPromise;
  let legacyFallbackUsed = false;
  const shardPromises = new Map();
  const records = new Map();

  async function loadIndex() {
    if (!indexPromise) {
      const finishMeasurement = startPerformanceMeasurement('ctr.protective-device-index-load');
      indexPromise = fetchJson(fetchFn, indexUrl, 'Protective-device index')
        .then(value => {
          if (!Array.isArray(value)) throw new Error('Protective-device index is not an array.');
          indexById = new Map(value.map(device => [device.id, device]));
          finishMeasurement({ deviceCount: value.length });
          return value;
        })
        .catch(async error => {
          console.warn('Failed to load protective-device index; using the legacy catalog.', error);
          const value = await loadLegacyCatalog();
          indexById = new Map(value.map(device => [device.id, device]));
          return value;
        });
    }
    return indexPromise;
  }

  async function loadLegacyCatalog() {
    if (!legacyPromise) {
      legacyFallbackUsed = true;
      legacyPromise = fetchJson(fetchFn, legacyUrl, 'Protective-device fallback catalog')
        .then(value => {
          if (!Array.isArray(value)) throw new Error('Protective-device fallback catalog is not an array.');
          value.forEach(device => records.set(device.id, device));
          return value;
        });
    }
    return legacyPromise;
  }

  async function loadShard(shard) {
    if (!shardPromises.has(shard)) {
      const finishMeasurement = startPerformanceMeasurement('ctr.protective-device-shard-load', { shard });
      const url = `${shardBaseUrl.replace(/\/$/, '')}/${shard}.json`;
      const pending = fetchJson(fetchFn, url, `Protective-device shard ${shard}`)
        .then(value => {
          if (!Array.isArray(value)) throw new Error(`Protective-device shard ${shard} is not an array.`);
          value.forEach(device => records.set(device.id, device));
          finishMeasurement({ deviceCount: value.length });
          return value;
        })
        .catch(async error => {
          console.warn(`Failed to load protective-device shard ${shard}; using the legacy catalog.`, error);
          return loadLegacyCatalog();
        });
      shardPromises.set(shard, pending);
    }
    return shardPromises.get(shard);
  }

  async function loadDevice(id) {
    if (!id) return null;
    if (records.has(id)) return records.get(id);
    await loadIndex();
    if (records.has(id)) return records.get(id);
    const metadata = indexById.get(id);
    if (!metadata) return null;
    await loadShard(metadata.catalogShard);
    return records.get(id) || null;
  }

  async function loadDevices(ids) {
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    const loaded = await Promise.all(uniqueIds.map(loadDevice));
    return loaded.filter(Boolean);
  }

  function getStats() {
    return {
      indexLoaded: !!indexById,
      loadedShardCount: shardPromises.size,
      hydratedDeviceCount: records.size,
      legacyFallbackUsed,
    };
  }

  return {
    getStats,
    loadDevice,
    loadDevices,
    loadIndex,
  };
}
