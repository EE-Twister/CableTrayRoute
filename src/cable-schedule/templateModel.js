import { normalizeCableTypical } from "../../analysis/cableLibrary.mjs";

export const MAX_TEMPLATE_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TEMPLATE_IMPORT_COUNT = 5000;
export const MAX_TEMPLATE_IMPORT_FIELD_LENGTH = 2048;

const TYPICAL_EXCLUDED_GROUPS = new Set(["Identification", "Terminations", "Routing Details"]);
const ADDITIONAL_TEMPLATE_FIELD_EXCLUSIONS = [
  "install_method",
  "operating_voltage",
  "est_load",
  "terminal_temp_rating",
  "load_flow_current",
  "ambient_temp",
  "duty_cycle",
  "length",
  "calc_ampacity",
  "voltage_drop_pct",
  "sizing_warning",
  "review_status",
  "last_modified"
];

export function buildTemplateHeaderConfig(columns) {
  const seen = new Set();
  const config = [];
  const add = (key, header) => {
    if (!header) return;
    let candidate = header;
    while (seen.has(candidate)) candidate = `${header} (${key})`;
    seen.add(candidate);
    config.push({ key, header: candidate });
  };
  add("label", "Typical Name");
  add("template_id", "Template ID");
  columns.forEach(column => add(column.key, column.label || column.key));
  return config;
}

export function buildTemplateHeaderLookup(config) {
  const lookup = new Map();
  config.forEach(({ key, header }) => {
    const normalizedHeader = typeof header === "string" ? header.trim().toLowerCase() : "";
    const normalizedKey = typeof key === "string" ? key.trim().toLowerCase() : "";
    if (normalizedHeader && !lookup.has(normalizedHeader)) lookup.set(normalizedHeader, key);
    if (normalizedKey && !lookup.has(normalizedKey)) lookup.set(normalizedKey, key);
  });
  return lookup;
}

export function createTemplateFieldPolicy(columns) {
  const excludedKeys = new Set(
    columns
      .filter(column => TYPICAL_EXCLUDED_GROUPS.has(column.group))
      .map(column => column.key)
  );
  ADDITIONAL_TEMPLATE_FIELD_EXCLUSIONS.forEach(key => excludedKeys.add(key));
  const libraryColumns = columns.filter(
    column => !TYPICAL_EXCLUDED_GROUPS.has(column.group) && !excludedKeys.has(column.key)
  );
  const headerConfig = buildTemplateHeaderConfig(libraryColumns);
  return {
    excludedKeys,
    libraryColumns,
    headerConfig,
    headerLookup: buildTemplateHeaderLookup(headerConfig)
  };
}

export function cloneTemplates(templates) {
  return Array.isArray(templates) ? templates.map(template => JSON.parse(JSON.stringify(template))) : [];
}

export function truncateImportedTemplateValues(input = {}) {
  const out = {};
  Object.entries(input || {}).forEach(([key, value]) => {
    out[key] = typeof value === "string" ? value.slice(0, MAX_TEMPLATE_IMPORT_FIELD_LENGTH) : value;
  });
  return out;
}

export function sanitizeTemplateFieldValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(item => (item == null ? "" : `${item}`)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

export function filterTemplateFields(input = {}, excludedKeys = new Set(), options = {}) {
  const { keepLabel = true, keepTypicalId = false } = options;
  const copy = { ...input };
  Object.keys(copy).forEach(key => {
    if (excludedKeys.has(key)) delete copy[key];
  });
  if (!keepLabel) delete copy.label;
  if (!keepTypicalId) delete copy.typical_id;
  Object.keys(copy).forEach(key => {
    copy[key] = sanitizeTemplateFieldValue(copy[key]);
  });
  return copy;
}

export function generateTemplateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const rand = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  return `tpl-${stamp}-${rand}`;
}

export function ensureTemplateIds(templates, excludedKeys = new Set()) {
  const copies = cloneTemplates(templates);
  let changed = false;
  copies.forEach((template, index) => {
    const sanitized = normalizeCableTypical(filterTemplateFields(template, excludedKeys));
    const templateKeys = Object.keys(template || {});
    const sanitizedKeys = Object.keys(sanitized || {});
    if (templateKeys.length !== sanitizedKeys.length || sanitizedKeys.some(key => sanitized[key] !== template[key])) {
      changed = true;
    }
    if (!sanitized.template_id) {
      sanitized.template_id = generateTemplateId();
      changed = true;
    }
    copies[index] = sanitized;
  });
  return { templates: copies, changed };
}

export function sanitizeTemplate(template, excludedKeys = new Set()) {
  return filterTemplateFields(template, excludedKeys, { keepLabel: false, keepTypicalId: false });
}

export function getTemplateDisplayName(template, index) {
  return template?.label || template?.tag || `Typical ${index + 1}`;
}

export function mergeTemplateValues(templateValues, existingValues = {}, options = {}) {
  const preserveKeys = new Set(options.preserveKeys || []);
  const skipUndefined = options.skipUndefined !== undefined ? options.skipUndefined : true;
  const overwriteExisting = options.overwriteExisting || false;
  const merged = { ...existingValues };
  Object.entries(templateValues || {}).forEach(([key, value]) => {
    if (key === "label" || key === "template_id" || preserveKeys.has(key)) return;
    if ((value === undefined || value === null) && skipUndefined) return;
    if (!overwriteExisting) {
      const existing = merged[key];
      const isArrayEmpty = Array.isArray(existing) && existing.length === 0;
      const isStringEmpty = typeof existing === "string" && existing.trim() === "";
      const hasExisting = !(existing === undefined || existing === null || isArrayEmpty || isStringEmpty);
      if (hasExisting) return;
    }
    merged[key] = Array.isArray(value) ? value.map(item => (item != null ? `${item}` : item)) : value;
  });
  return merged;
}
