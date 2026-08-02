export const TCC_VIEW_OPTIONS = Object.freeze([
  { id: 'none', label: 'No Additional View', field: null, description: 'Hide device settings in the legend.' },
  { id: 'callouts', label: 'Chart Callouts', field: null, shortLabel: 'Callouts', description: 'Show draggable labels on the chart with the device tag and selected settings.' },
  { id: 'pickup', label: 'Pickup', field: 'pickup', unit: 'A', shortLabel: 'Pickup', description: 'Display the long-time pickup current.' },
  { id: 'time', label: 'Delay', field: 'time', unit: 's', shortLabel: 'Delay', description: 'Display the long-time delay setting.' },
  { id: 'shortTimePickup', label: 'Short-Time Pickup', field: 'shortTimePickup', unit: 'A', shortLabel: 'ST Pickup', description: 'Display the short-time pickup current.' },
  { id: 'shortTimeDelay', label: 'Short-Time Delay', field: 'shortTimeDelay', unit: 's', shortLabel: 'ST Delay', description: 'Display the short-time delay setting.' },
  { id: 'instantaneousPickup', label: 'Instantaneous Pickup (INST)', field: 'instantaneousPickup', unit: 'A', shortLabel: 'INST', description: 'Display the instantaneous pickup current.' },
  { id: 'instantaneousDelay', label: 'Instantaneous Delay', field: 'instantaneousDelay', unit: 's', shortLabel: 'INST Delay', description: 'Display the instantaneous delay setting.' },
  { id: 'instantaneousMax', label: 'Instantaneous Max', field: 'instantaneousMax', unit: 'A', shortLabel: 'INST Max', description: 'Display the instantaneous ceiling current.' },
  { id: 'curveProfile', label: 'Curve Profile', field: 'curveProfileLabel', shortLabel: 'Curve', description: 'Display the selected curve profile.' },
  { id: 'arcFlashOverlay', label: 'Arc Flash Limit Curve', field: null, description: 'Overlay a constant incident energy limit curve from arc flash study results.' },
  { id: 'groundFault', label: 'Ground Fault Plane', field: null, description: 'Plot ground fault relay curves as a separate plane with dashed purple curves (NEC 230.95 / OSHA 29 CFR 1910.304).' }
]);

export const TCC_RANGE_PRESETS = Object.freeze([
  { id: 'full', label: 'Full Range' },
  { id: 'coordination', label: 'Coordination Region' },
  { id: 'motorStart', label: 'Motor Starting' },
  { id: 'transformerInrush', label: 'Transformer Inrush' },
  { id: 'faultCurrent', label: 'Fault Current Region' }
]);

export const TCC_CALLOUT_SCOPES = Object.freeze([
  { id: 'context', label: 'Context Devices' },
  { id: 'selected', label: 'Selected Device' },
  { id: 'all', label: 'All Plotted Devices' }
]);

export const CUSTOM_CURVE_SETTING_OPTIONS = Object.freeze(TCC_VIEW_OPTIONS
  .filter(option => option.field)
  .map(option => Object.freeze({
    field: option.field,
    label: option.label,
    unit: option.unit || '',
    numeric: Boolean(option.unit)
  })));

export const CUSTOM_CURVE_SETTING_CONFIG = new Map(
  CUSTOM_CURVE_SETTING_OPTIONS.map(option => [option.field, option])
);

const viewOptionMap = new Map(TCC_VIEW_OPTIONS.map(option => [option.id, option]));
const rangePresetMap = new Map(TCC_RANGE_PRESETS.map(option => [option.id, option]));
const calloutScopeMap = new Map(TCC_CALLOUT_SCOPES.map(option => [option.id, option]));

export function getTccViewOption(id) {
  return viewOptionMap.get(id) || null;
}

export function getTccRangePreset(id) {
  return rangePresetMap.get(id) || null;
}

export function normalizeViewOption(id) {
  if (typeof id !== 'string') return 'none';
  const trimmed = id.trim();
  return viewOptionMap.has(trimmed) ? trimmed : 'none';
}

export function normalizeViewOptionList(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const normalized = [];
  list.forEach(value => {
    const normalizedValue = normalizeViewOption(value);
    if (normalizedValue === 'none' || seen.has(normalizedValue)) return;
    seen.add(normalizedValue);
    normalized.push(normalizedValue);
  });
  return normalized;
}

export function normalizeRangePreset(value) {
  const preset = typeof value === 'string' ? value.trim() : '';
  return rangePresetMap.has(preset) ? preset : 'full';
}

export function normalizeCalloutScope(value) {
  const scope = typeof value === 'string' ? value.trim() : '';
  return calloutScopeMap.has(scope) ? scope : 'context';
}

export function getActiveViewConfigs(activeViewOptions = []) {
  return activeViewOptions
    .map(id => viewOptionMap.get(id))
    .filter(option => option?.field);
}

export function formatViewValue(option, value, formatNumber = String) {
  if (!option || value === undefined || value === null) return null;
  if (typeof value === 'number') {
    const formatted = formatNumber(value);
    if (!formatted && formatted !== '0') return null;
    return option.unit ? `${formatted} ${option.unit}`.trim() : formatted;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return option.unit ? `${trimmed} ${option.unit}`.trim() : trimmed;
  }
  return null;
}

export function summarizeActiveViewLabels(activeViewOptions = []) {
  const options = TCC_VIEW_OPTIONS
    .filter(option => option.id !== 'none' && activeViewOptions.includes(option.id));
  if (!options.length) return null;
  const labels = options.map(option => option.shortLabel || option.label);
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]}, ${labels[1]}, +${labels.length - 2}`;
}

export function estimateLegendItemMetrics(label, viewSummaries) {
  const baseLabel = typeof label === 'string' && label.trim() ? label.trim() : 'Device';
  const summaries = Array.isArray(viewSummaries) ? viewSummaries : [];
  const textWidth = Math.ceil(baseLabel.length * 7);
  const badgeWidths = summaries.map(summary => Math.max(32, Math.ceil(String(summary || '').length * 6.5) + 16));
  const badgeSpacing = badgeWidths.length > 1 ? (badgeWidths.length - 1) * 8 : 0;
  const badgesWidth = badgeWidths.reduce((sum, value) => sum + value, 0) + badgeSpacing;
  return {
    width: 24 + textWidth + (badgeWidths.length ? 8 + badgesWidth : 0),
    height: 20 + (badgeWidths.length ? 26 : 0)
  };
}

export function computeLegendLayout(entries, availableWidth, formatSummaries = () => []) {
  const layouts = [];
  if (!Array.isArray(entries) || !entries.length) return { layouts, height: 0 };
  const safeWidth = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 400;
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  entries.forEach(entry => {
    const baseLabel = entry.selection?.name || entry.name || entry.selection?.baseDevice?.name || '';
    const relationship = entry.relationship?.role && entry.relationship.role !== 'additional'
      ? `${entry.relationship.label}: `
      : '';
    const legendLabel = `${relationship}${baseLabel || 'Device'}`;
    const viewSummaries = formatSummaries(entry);
    const metrics = estimateLegendItemMetrics(legendLabel, viewSummaries);
    if (cursorX > 0 && cursorX + metrics.width > safeWidth) {
      cursorX = 0;
      cursorY += rowHeight + 12;
      rowHeight = 0;
    }
    layouts.push({ entry, x: cursorX, y: cursorY, ...metrics, legendLabel, viewSummaries });
    cursorX += metrics.width + 16;
    rowHeight = Math.max(rowHeight, metrics.height);
  });

  return { layouts, height: layouts.length ? cursorY + rowHeight : 0 };
}
