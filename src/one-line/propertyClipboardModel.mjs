// Property clipboard model for the one-line editor: copy a component's engineering
// properties (excluding identity, geometry, and wiring keys) and paste them onto a
// compatible component without DOM or storage access.

export const PROPERTY_CLIPBOARD_EXCLUDE_KEYS = new Set([
  'id',
  'label',
  'name',
  'tag',
  'ref',
  'x',
  'y',
  'z',
  'connections',
  'ports',
  'portCounts',
  'icon',
  'width',
  'height',
  'rotation',
  'rotationManual',
  'flipped',
  'labelOffset',
  'category',
  'type',
  'subtype',
  'defaultRotation',
  'isVirtualNode',
  'templateId',
  'isTemplate',
  'diagramId',
  'diagramSheet',
  'diagram',
  'diagramScale',
  'diagramViewport',
  'diagramZoom',
  'diagramOffset',
  'locked',
  'componentVersion'
]);

export const PROPERTY_CLIPBOARD_UNIQUE_KEYS = new Set(['id', 'label', 'name', 'tag', 'ref']);

export function isDomNode(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof Element !== 'undefined' && value instanceof Element) return true;
  if (typeof Node !== 'undefined' && value instanceof Node) return true;
  return false;
}

export function clonePropertyClipboardValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => clonePropertyClipboardValue(item));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (isDomNode(value)) return undefined;
  const result = {};
  Object.keys(value).forEach(key => {
    if (PROPERTY_CLIPBOARD_UNIQUE_KEYS.has(key)) return;
    const cloned = clonePropertyClipboardValue(value[key]);
    if (cloned !== undefined) {
      result[key] = cloned;
    }
  });
  return result;
}

export function buildPropertyClipboardData(comp) {
  if (!comp || typeof comp !== 'object') return {};
  const data = {};
  Object.keys(comp).forEach(key => {
    if (PROPERTY_CLIPBOARD_EXCLUDE_KEYS.has(key)) return;
    const value = comp[key];
    if (typeof value === 'function') return;
    if (value === undefined) return;
    if (isDomNode(value)) return;
    const cloned = clonePropertyClipboardValue(value);
    if (cloned !== undefined) {
      data[key] = cloned;
    }
  });
  return data;
}

export function createPropertyClipboardFromComponent(comp) {
  if (!comp || comp.isVirtualNode) return null;
  const data = buildPropertyClipboardData(comp);
  if (!Object.keys(data).length) return null;
  return {
    subtype: comp.subtype || '',
    type: comp.type || '',
    data
  };
}

export function canPastePropertyClipboard(clipboardData, target) {
  if (!clipboardData || !clipboardData.data) return false;
  if (!target || target.isVirtualNode) return false;
  const sourceKey = clipboardData.subtype || clipboardData.type || '';
  const targetKey = target.subtype || target.type || '';
  if (!sourceKey || !targetKey) return true;
  return sourceKey === targetKey;
}

export function deepEqualValues(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualValues(a[i], b[i])) return false;
    }
    return true;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqualValues(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

export function applyPropertyClipboardToComponent(target, clipboardData) {
  if (!target || !clipboardData || !clipboardData.data) return false;
  const data = clipboardData.data;
  let changed = false;
  Object.keys(target).forEach(key => {
    if (PROPERTY_CLIPBOARD_EXCLUDE_KEYS.has(key)) return;
    if (Object.prototype.hasOwnProperty.call(data, key)) return;
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      delete target[key];
      changed = true;
    }
  });
  Object.entries(data).forEach(([key, value]) => {
    const cloned = clonePropertyClipboardValue(value);
    if (cloned === undefined && value !== undefined) return;
    if (!deepEqualValues(target[key], cloned)) {
      target[key] = cloned;
      changed = true;
    }
  });
  return changed;
}
