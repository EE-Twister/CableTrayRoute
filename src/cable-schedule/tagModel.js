export const DEFAULT_TAG_SETTINGS = Object.freeze({
  enabled: true,
  prefix: "CBL-",
  nextNumber: 1,
  padding: 3
});

export function normalizeTagSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const nextNumber = Math.max(1, parseInt(source.nextNumber, 10) || DEFAULT_TAG_SETTINGS.nextNumber);
  const padding = Math.min(8, Math.max(1, parseInt(source.padding, 10) || DEFAULT_TAG_SETTINGS.padding));
  return {
    enabled: source.enabled !== false,
    prefix: typeof source.prefix === "string" ? source.prefix : DEFAULT_TAG_SETTINGS.prefix,
    nextNumber,
    padding
  };
}

export function formatCableTag(settings, number = settings?.nextNumber) {
  const normalized = normalizeTagSettings(settings);
  const safeNumber = Math.max(1, parseInt(number, 10) || 1);
  return `${normalized.prefix}${String(safeNumber).padStart(normalized.padding, "0")}`;
}

export function parseGeneratedTagNumber(tag, settings) {
  const text = `${tag || ""}`.trim();
  const prefix = normalizeTagSettings(settings).prefix;
  if (!text.startsWith(prefix)) return null;
  const suffix = text.slice(prefix.length);
  return /^\d+$/.test(suffix) ? parseInt(suffix, 10) : null;
}

export function generateTagSequence(settings, count, existingTags = []) {
  const normalized = normalizeTagSettings(settings);
  const total = Math.max(0, parseInt(count, 10) || 0);
  if (!normalized.enabled) return { tags: Array(total).fill(""), nextNumber: normalized.nextNumber };
  const used = new Set(Array.from(existingTags || [], tag => `${tag || ""}`.trim().toLowerCase()).filter(Boolean));
  const tags = [];
  let nextNumber = normalized.nextNumber;
  while (tags.length < total) {
    const tag = formatCableTag(normalized, nextNumber);
    nextNumber += 1;
    if (used.has(tag.toLowerCase())) continue;
    used.add(tag.toLowerCase());
    tags.push(tag);
  }
  return { tags, nextNumber };
}

export function nextTagNumberAfter(settings, tags) {
  const normalized = normalizeTagSettings(settings);
  if (!normalized.enabled || !Array.isArray(tags)) return normalized.nextNumber;
  let max = normalized.nextNumber - 1;
  tags.forEach(tag => {
    const number = parseGeneratedTagNumber(tag, normalized);
    if (Number.isFinite(number)) max = Math.max(max, number);
  });
  return Math.max(normalized.nextNumber, max + 1);
}
