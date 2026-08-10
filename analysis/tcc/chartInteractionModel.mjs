import { formatSettingValue } from './settingModel.mjs';

export function formatHoverSettings(entry) {
  const settings = entry?.scaled?.settings || entry?.overrides || {};
  const fields = [
    ['pickup', 'Pickup', 'A'],
    ['time', 'Delay', 's'],
    ['shortTimePickup', 'ST Pickup', 'A'],
    ['shortTimeDelay', 'ST Delay', 's'],
    ['instantaneousPickup', 'INST', 'A'],
    ['instantaneous', 'INST', 'A'],
    ['curveProfileLabel', 'Curve', '']
  ];
  const seen = new Set();
  const seenLabels = new Set();
  const parts = [];
  fields.forEach(([field, label, unit]) => {
    if (seen.has(field)) return;
    if (field === 'instantaneous' && settings.instantaneousPickup !== undefined) return;
    seen.add(field);
    const formatted = formatSettingValue(settings[field]);
    if (!formatted || seenLabels.has(label)) return;
    seenLabels.add(label);
    parts.push(`${label}: ${formatted}${unit ? ` ${unit}` : ''}`);
  });
  return parts.length ? parts.join(' | ') : 'Using device library settings';
}

export function findNearestCurvePoint(curve, current) {
  if (!Array.isArray(curve) || !curve.length || !(current > 0)) return null;
  const target = Math.log(current);
  return curve.reduce((closest, point) => {
    if (!point || !(point.current > 0) || !(point.time > 0)) return closest;
    if (!closest) return point;
    return Math.abs(Math.log(point.current) - target) < Math.abs(Math.log(closest.current) - target)
      ? point
      : closest;
  }, null);
}

export function getHoverClientPoint(event) {
  if (!event) return null;
  if (event.type !== 'focus' && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return { clientX: event.clientX, clientY: event.clientY };
  }
  const rect = event.currentTarget?.getBoundingClientRect?.();
  if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
    return {
      clientX: rect.left + (rect.width / 2),
      clientY: rect.top + (rect.height / 2)
    };
  }
  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return { clientX: event.clientX, clientY: event.clientY };
  }
  return null;
}

export function entryInteractiveKey(entry) {
  return String(entry?.selection?.uid || entry?.uid || entry?.name || entry?.label || '');
}

export function buildEquipmentOverlayAriaLabel(entry, { title, rows }) {
  if (!entry) return 'Equipment reference';
  const subtitle = [entry.sourceLabel, entry.targetLabel].filter(Boolean).join(' to ');
  const rowText = rows(entry)
    .filter(row => row.value !== undefined && row.value !== null && row.value !== '')
    .map(row => `${row.label}: ${row.value}`)
    .join(', ');
  return [title(entry), subtitle || entry.name, rowText].filter(Boolean).join(', ');
}
