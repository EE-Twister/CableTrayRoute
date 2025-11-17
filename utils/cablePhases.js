export function normalizeCablePhases(source) {
  let raw = source;
  if (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'phases')) {
    raw = raw.phases;
  }
  if (Array.isArray(raw)) {
    return raw
      .map(phase => String(phase).trim().toUpperCase())
      .filter(Boolean);
  }
  if (typeof raw === 'number') {
    if (raw === 3) return ['A', 'B', 'C'];
    if (raw === 2) return ['A', 'B'];
    if (raw === 1) return ['A'];
    return [];
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      return Number.isFinite(num) ? normalizeCablePhases(num) : [];
    }
    return trimmed
      .split(/[\s,]+/)
      .map(phase => phase.trim().toUpperCase())
      .filter(Boolean);
  }
  return [];
}

export function formatCablePhases(value) {
  return normalizeCablePhases(value).join(',');
}
