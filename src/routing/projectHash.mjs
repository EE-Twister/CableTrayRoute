export function computeRoutingProjectHash(data) {
  const serialized = JSON.stringify(data, (key, value) => {
    if (key === 'route_segments' || key === 'voltage_drop_pct') return undefined;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
      : value;
  });
  let hash = 5381;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = ((hash << 5) + hash) ^ serialized.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}
