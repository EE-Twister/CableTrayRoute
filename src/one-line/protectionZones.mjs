export const PROTECTION_ZONE_COLORS = Object.freeze([
  '#e74c3c',
  '#1abc9c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#16a085',
  '#e67e22',
]);

function defaultZoneId() {
  if (globalThis.crypto?.randomUUID) return `zone_${globalThis.crypto.randomUUID()}`;
  return `zone_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getProtectionZones(sheet) {
  if (!sheet || typeof sheet !== 'object') return [];
  if (!Array.isArray(sheet.protectionZones)) sheet.protectionZones = [];
  return sheet.protectionZones;
}

export function createProtectionZone(sheet, name, { idFactory = defaultZoneId } = {}) {
  const zones = getProtectionZones(sheet);
  const zone = {
    id: idFactory(),
    name: String(name || '').trim() || `Zone ${zones.length + 1}`,
    color: PROTECTION_ZONE_COLORS[zones.length % PROTECTION_ZONE_COLORS.length],
    componentIds: [],
    visible: true,
  };
  zones.push(zone);
  return zone;
}

export function deleteProtectionZone(sheet, zoneId) {
  const zones = getProtectionZones(sheet);
  const index = zones.findIndex(zone => zone.id === zoneId);
  if (index < 0) return false;
  zones.splice(index, 1);
  return true;
}

export function renameProtectionZone(sheet, zoneId, newName) {
  const name = String(newName || '').trim();
  const zone = getProtectionZones(sheet).find(item => item.id === zoneId);
  if (!zone || !name) return false;
  zone.name = name;
  return true;
}

export function setProtectionZoneVisibility(sheet, zoneId, visible) {
  const zone = getProtectionZones(sheet).find(item => item.id === zoneId);
  if (!zone) return false;
  zone.visible = Boolean(visible);
  return true;
}

export function setProtectionZoneColor(sheet, zoneId, color) {
  const nextColor = String(color || '').trim();
  const zone = getProtectionZones(sheet).find(item => item.id === zoneId);
  if (!zone || !nextColor) return false;
  zone.color = nextColor;
  return true;
}

export function toggleProtectionZoneComponent(sheet, zoneId, componentId) {
  const zone = getProtectionZones(sheet).find(item => item.id === zoneId);
  const id = String(componentId || '').trim();
  if (!zone || !id) return false;
  if (!Array.isArray(zone.componentIds)) zone.componentIds = [];
  const index = zone.componentIds.indexOf(id);
  if (index < 0) zone.componentIds.push(id);
  else zone.componentIds.splice(index, 1);
  return true;
}

function defaultComponentBounds(component, defaultWidth, defaultHeight) {
  const x = Number(component?.x) || 0;
  const y = Number(component?.y) || 0;
  const width = Number(component?.width) || defaultWidth;
  const height = Number(component?.height) || defaultHeight;
  return { left: x, top: y, right: x + width, bottom: y + height };
}

export function computeProtectionZoneBounds(zone, components = [], options = {}) {
  const normalizedOptions = typeof options === 'number' ? { padding: options } : options;
  const {
    padding = 12,
    defaultWidth = 50,
    defaultHeight = 50,
    boundsFor = component => defaultComponentBounds(component, defaultWidth, defaultHeight),
  } = normalizedOptions;
  const records = new Map((Array.isArray(components) ? components : []).map(component => [component?.id, component]));
  const bounds = (Array.isArray(zone?.componentIds) ? zone.componentIds : [])
    .map(id => records.get(id))
    .filter(Boolean)
    .map(boundsFor)
    .filter(value => (
      value
      && Number.isFinite(value.left)
      && Number.isFinite(value.top)
      && Number.isFinite(value.right)
      && Number.isFinite(value.bottom)
    ));
  if (!bounds.length) return null;

  const left = Math.min(...bounds.map(value => value.left));
  const top = Math.min(...bounds.map(value => value.top));
  const right = Math.max(...bounds.map(value => value.right));
  const bottom = Math.max(...bounds.map(value => value.bottom));
  return {
    x: left - padding,
    y: top - padding,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
    left,
    top,
    right,
    bottom,
  };
}
