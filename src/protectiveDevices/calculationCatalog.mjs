import { createProtectiveDeviceCatalogLoader } from './catalogLoader.mjs';

export { createProtectiveDeviceCatalogLoader };

const defaultCatalogLoader = createProtectiveDeviceCatalogLoader();

export function collectDiagramComponents(modelOrComponents = []) {
  if (Array.isArray(modelOrComponents)) return modelOrComponents.filter(Boolean);
  if (Array.isArray(modelOrComponents?.components)) return modelOrComponents.components.filter(Boolean);
  if (Array.isArray(modelOrComponents?.buses)) return modelOrComponents.buses.filter(Boolean);
  if (!Array.isArray(modelOrComponents?.sheets)) return [];
  return modelOrComponents.sheets.flatMap(sheet => (
    Array.isArray(sheet?.components) ? sheet.components : []
  ));
}

export function collectReferencedProtectiveDeviceIds(modelOrComponents = []) {
  return [...new Set(collectDiagramComponents(modelOrComponents)
    .flatMap(component => [component?.tccId, component?.props?.device])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
}

export async function loadReferencedProtectiveDevices(modelOrComponents = [], {
  catalog = defaultCatalogLoader,
  additionalDevices = [],
} = {}) {
  const ids = collectReferencedProtectiveDeviceIds(modelOrComponents);
  if (!ids.length) return [];

  const additionalById = new Map((additionalDevices || [])
    .filter(device => device?.id)
    .map(device => [device.id, device]));
  const missingIds = ids.filter(id => !additionalById.has(id));
  const loaded = missingIds.length ? await catalog.loadDevices(missingIds) : [];
  const loadedById = new Map(loaded.map(device => [device.id, device]));

  return ids
    .map(id => additionalById.get(id) || loadedById.get(id))
    .filter(Boolean);
}
