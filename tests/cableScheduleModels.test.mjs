import assert from "node:assert/strict";
import test from "node:test";
import {
  createTemplateFieldPolicy,
  ensureTemplateIds,
  filterTemplateFields,
  mergeTemplateValues,
  truncateImportedTemplateValues
} from "../src/cable-schedule/templateModel.js";
import {
  DEFAULT_TAG_SETTINGS,
  formatCableTag,
  generateTagSequence,
  nextTagNumberAfter,
  normalizeTagSettings,
  parseGeneratedTagNumber
} from "../src/cable-schedule/tagModel.js";
import {
  BASIC_ENTRY_KEYS,
  CABLE_TYPES,
  CONDUCTOR_SIZES,
  STARTER_CABLE_TYPES,
  createCableScheduleColumns,
  createCableSchedulePresets
} from "../src/cable-schedule/scheduleConfig.js";

const columns = [
  { key: "tag", label: "Tag", group: "Identification" },
  { key: "raceway_ids", label: "Raceway(s)", group: "Terminations" },
  { key: "conductor_size", label: "Size", group: "Cable Construction" },
  { key: "install_method", label: "Install Method", group: "Cable Construction" },
  { key: "notes", label: "Notes", group: "Notes" }
];

test("builds a template policy that excludes project-specific schedule fields", () => {
  const policy = createTemplateFieldPolicy(columns);

  assert.deepEqual(policy.libraryColumns.map(column => column.key), ["conductor_size", "notes"]);
  assert.equal(policy.excludedKeys.has("tag"), true);
  assert.equal(policy.excludedKeys.has("raceway_ids"), true);
  assert.equal(policy.excludedKeys.has("install_method"), true);
  assert.deepEqual(policy.headerConfig.map(item => item.header), ["Typical Name", "Template ID", "Size", "Notes"]);
  assert.equal(policy.headerLookup.get("size"), "conductor_size");
});

test("sanitizes imported typicals without mutating their source records", () => {
  const policy = createTemplateFieldPolicy(columns);
  const source = {
    label: "Feeder",
    tag: "CBL-001",
    conductor_size: "#2 AWG",
    notes: ["indoor", "copper"],
    typical_id: "legacy"
  };

  const filtered = filterTemplateFields(source, policy.excludedKeys);
  const result = ensureTemplateIds([source], policy.excludedKeys);

  assert.deepEqual(filtered, {
    label: "Feeder",
    conductor_size: "#2 AWG",
    notes: "indoor, copper"
  });
  assert.equal(source.tag, "CBL-001");
  assert.equal(source.typical_id, "legacy");
  assert.equal(result.changed, true);
  assert.equal(result.templates[0].tag, undefined);
  assert.equal(result.templates[0].typical_id, undefined);
  assert.ok(result.templates[0].template_id);
  assert.equal(result.templates[0].catalog_evidence_status, "screening");
});

test("merges template values only into empty fields unless overwrite is requested", () => {
  const template = { label: "Typical", template_id: "tpl-1", conductor_size: "#4 AWG", notes: "template" };

  assert.deepEqual(
    mergeTemplateValues(template, { tag: "CBL-010", conductor_size: "#2 AWG", notes: "" }, { preserveKeys: ["tag"] }),
    { tag: "CBL-010", conductor_size: "#2 AWG", notes: "template" }
  );
  assert.deepEqual(
    mergeTemplateValues(template, { conductor_size: "#2 AWG" }, { overwriteExisting: true }),
    { conductor_size: "#4 AWG", notes: "template" }
  );
  assert.equal(truncateImportedTemplateValues({ notes: "x".repeat(3000) }).notes.length, 2048);
});

test("normalizes cable tag settings and skips existing tags deterministically", () => {
  const normalized = normalizeTagSettings({ prefix: "FDR-", nextNumber: 0, padding: 20 });
  assert.deepEqual(normalized, { enabled: true, prefix: "FDR-", nextNumber: 1, padding: 8 });
  assert.equal(formatCableTag(normalized, 7), "FDR-00000007");
  assert.equal(parseGeneratedTagNumber("FDR-00000007", normalized), 7);
  assert.equal(parseGeneratedTagNumber("CBL-007", normalized), null);

  const sequence = generateTagSequence(
    { enabled: true, prefix: "CBL-", nextNumber: 1, padding: 3 },
    3,
    ["CBL-001", "cbl-003"]
  );
  assert.deepEqual(sequence, { tags: ["CBL-002", "CBL-004", "CBL-005"], nextNumber: 6 });
  assert.equal(nextTagNumberAfter({ ...DEFAULT_TAG_SETTINGS, nextNumber: 2 }, ["CBL-010", "OTHER-999"]), 11);
});

test("disabled tag generation returns the requested blank slots", () => {
  assert.deepEqual(
    generateTagSequence({ ...DEFAULT_TAG_SETTINGS, enabled: false, nextNumber: 12 }, 2, ["CBL-012"]),
    { tags: ["", ""], nextNumber: 12 }
  );
  assert.deepEqual(generateTagSequence(DEFAULT_TAG_SETTINGS, -3), { tags: [], nextNumber: 1 });
});

test("creates the cable table schema with injected option providers", () => {
  const equipment = ["M-1"];
  const raceways = ["T-1"];
  const panels = ["P-1"];
  const scheduleColumns = createCableScheduleColumns({
    getEquipmentOptions: () => equipment,
    getRacewayOptions: () => raceways,
    getPanelOptions: () => panels
  });
  const byKey = new Map(scheduleColumns.map(column => [column.key, column]));

  assert.equal(scheduleColumns.length, 54);
  assert.deepEqual(byKey.get("from_tag").datalist(), equipment);
  assert.deepEqual(byKey.get("raceway_ids").options(), raceways);
  assert.deepEqual(byKey.get("panel_id").datalist(), panels);
  assert.equal(byKey.get("length").step, "any");
  assert.equal(byKey.get("length").validate, "numeric");
  assert.equal(byKey.get("tag").sticky, "left");
  assert.deepEqual(CABLE_TYPES, ["Power", "Control", "Signal", "Data", "Fiber"]);
  assert.ok(CONDUCTOR_SIZES.includes("1000 kcmil"));
});

test("keeps entry presets and starter cable catalog data outside the page controller", () => {
  const scheduleColumns = createCableScheduleColumns({
    getEquipmentOptions: () => [],
    getRacewayOptions: () => [],
    getPanelOptions: () => []
  });
  const { groupNames, presets } = createCableSchedulePresets(scheduleColumns);

  assert.ok(groupNames.includes("Cable Construction"));
  assert.deepEqual(presets.entry.keys, ["tag", "from_tag", "to_tag", "raceway_ids", "cable_type", "conductors", "conductor_size", "ground_size", "ocpd_rating", "length"]);
  assert.equal(BASIC_ENTRY_KEYS.has("terminal_temp_rating"), true);
  assert.equal(STARTER_CABLE_TYPES.length, 6);
  assert.equal(STARTER_CABLE_TYPES[0].catalog_evidence_status, "source_verified");
  assert.equal(STARTER_CABLE_TYPES[1].catalog_evidence_status, undefined);
});
