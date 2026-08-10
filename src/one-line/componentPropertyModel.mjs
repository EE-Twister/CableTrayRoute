const RESERVED_TOP_LEVEL_FIELDS = new Set([
  'id', 'type', 'subtype', 'x', 'y', 'width', 'height', 'rotation', 'rotationManual', 'flipped', 'label',
  'ports', 'connections', 'meta', 'svg', 'icon', 'scheduleLinks', 'props'
]);

export function isUnsafeNestedPathSegment(segment) {
  return segment === '__proto__' || segment === 'prototype' || segment === 'constructor';
}

export function readNestedValue(holder, path = []) {
  if (!holder || typeof holder !== 'object') return undefined;
  let current = holder;
  for (const key of path) {
    if (
      !current
      || typeof current !== 'object'
      || isUnsafeNestedPathSegment(key)
      || !Object.prototype.hasOwnProperty.call(current, key)
    ) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

export function writeNestedValue(holder, path = [], value) {
  if (!holder || typeof holder !== 'object' || !path.length || path.some(isUnsafeNestedPathSegment)) return;
  let current = holder;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const next = current[key];
    if (!Object.prototype.hasOwnProperty.call(current, key) || !next || typeof next !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

export function getNestedComponentValue(component, path = []) {
  const direct = readNestedValue(component, path);
  if (direct !== undefined) return direct;
  if (component?.props && typeof component.props === 'object') {
    return readNestedValue(component.props, path);
  }
  return undefined;
}

export function coerceComponentPropertyValue(rawValue, type) {
  if (type === 'checkbox') return !!rawValue;
  if (type !== 'number') return rawValue ?? '';
  if (rawValue === '' || rawValue === null || rawValue === undefined) return '';
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue;
  const parsed = parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : '';
}

export function setNestedComponentValue(component, path = [], rawValue, type) {
  if (!component || !path.length) return;
  const finalValue = coerceComponentPropertyValue(rawValue, type);
  writeNestedValue(component, path, finalValue);
  if (component.props && typeof component.props === 'object') {
    writeNestedValue(component.props, path, finalValue);
  }
}

export function inferSchemaFromProps(props, path = []) {
  const schema = [];
  Object.entries(props || {}).forEach(([key, value]) => {
    if (!path.length && RESERVED_TOP_LEVEL_FIELDS.has(key)) return;
    if (isUnsafeNestedPathSegment(key)) return;
    const currentPath = [...path, key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      schema.push(...inferSchemaFromProps(value, currentPath));
      return;
    }
    const type = typeof value === 'number'
      ? 'number'
      : typeof value === 'boolean'
        ? 'checkbox'
        : 'text';
    const field = {
      name: currentPath.join('_'),
      label: currentPath.map(part => part.replace(/_/g, ' ')).join(' '),
      type,
      default: value
    };
    if (path.length) {
      field.getValue = component => getNestedComponentValue(component, currentPath);
      field.setValue = (component, raw) => setNestedComponentValue(component, currentPath, raw, type);
    }
    schema.push(field);
  });
  return schema;
}
