const MOJIBAKE_REPLACEMENTS = [
  ['â€”', '—'],
  ['â€“', '–'],
  ['â€™', '’'],
  ['â€˜', '‘'],
  ['â€œ', '“'],
  ['â€', '”'],
  ['â€¦', '…'],
  ['â€¢', '•'],
  ['â†’', '→'],
  ['â†', '←'],
  ['âœ“', '✓'],
  ['Â·', '·'],
  ['Â°', '°'],
  ['Â²', '²'],
  ['Â³', '³'],
  ['Âµ', 'µ'],
  ['Â', '']
];

export function repairMojibake(value) {
  if (typeof value !== 'string' || !/[âÂ]/.test(value)) return value;
  return MOJIBAKE_REPLACEMENTS.reduce(
    (text, [broken, replacement]) => text.split(broken).join(replacement),
    value
  );
}

export function repairMojibakeDeep(value, seen = new WeakMap()) {
  if (typeof value === 'string') return repairMojibake(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const next = [];
    seen.set(value, next);
    value.forEach(item => next.push(repairMojibakeDeep(item, seen)));
    return next;
  }

  const next = {};
  seen.set(value, next);
  Object.entries(value).forEach(([key, item]) => {
    next[key] = repairMojibakeDeep(item, seen);
  });
  return next;
}
