import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_FILE = 'componentLibrary.json';
const OUTPUT_FILE = 'docs/component-gap-analysis.md';

const COMMON_COMPONENT_TYPES = [
  'bus',
  'utility',
  'generator',
  'transformer',
  'breaker',
  'fuse',
  'relay',
  'motor',
  'panel',
  'mcc',
  'switchboard',
  'ups',
  'busway',
  'ct',
  'pt_vt',
  'battery',
  'pv_array',
  'inverter',
  'load',
  'cable',
  'meter',
  'grounding_transformer',
  'bus_duct'
];

const ATTRIBUTE_BASELINE = {
  all: [
    'tag',
    'description',
    'manufacturer',
    'model',
    'catalog_number',
    'approved_part',
    'catalog_source',
    'catalog_last_verified',
    'datasheet_url',
    'bim_ref',
    'phases',
    'commissioning_state',
    'service_status',
    'notes'
  ],
  source: ['short_circuit_capacity', 'xr_ratio', 'frequency_hz'],
  transformer: ['kva', 'percent_z', 'primary_connection', 'secondary_connection'],
  protective: ['pickup_amps', 'time_dial', 'interrupting_rating_ka'],
  // A differential (87) element is a percentage-slope sensing device. It has
  // no time dial and no interrupting rating — the breaker it trips carries
  // the interrupting duty — so holding it to the time-overcurrent baseline
  // reports gaps that cannot legitimately be filled. Check the restraint
  // characteristic and protected-zone metadata instead.
  differential: ['pickup_amps', 'slope1_pct', 'protected_zone_type'],
  rotating: ['kw', 'efficiency', 'power_factor'],
  equipment: ['rated_voltage_kv', 'bus_rating_a'],
  load: ['kw', 'kvar', 'demand_factor'],
  // Ampacity is computed at runtime from size/material/insulation/temp via
  // analysis/ampacity.mjs and is intentionally NOT stored on the library
  // template. Keep it out of the baseline so the audit doesn't ask for a
  // value that would only invite drift between the stored and computed value.
  cable: ['size', 'material', 'insulation', 'length']
};

// Accept canonical/equivalent attribute names from the live library
// schemas as fulfilling the heuristic baseline. Keys are baseline names;
// values are the names actually used in componentLibrary.json or by the
// validators in src/validation/librarySchema.mjs.
const ATTRIBUTE_ALIASES = new Map([
  ['kw', ['hp', 'rated_kw', 'rated_hp', 'rated_kva', 'kva', 'watts', 'mva', 'rated_mva']],
  ['efficiency', ['efficiency_pct', 'full_load_efficiency_pct']],
  ['power_factor', ['pf', 'full_load_pf']],
  ['demand_factor', ['diversity_factor', 'load_diversity']],
  ['size', ['size_awg_kcmil', 'awg', 'kcmil', 'trade_size']],
  ['insulation', ['insulation_type']],
  ['length', ['length_ft', 'length_m']],
  ['ampacity', ['rated_ampacity_a', 'rated_current_a', 'rated_current']],
  ['time_dial', ['time_dial_or_tms', 'tms']],
  ['interrupting_rating_ka', ['interrupt_rating_ka', 'ka']],
  ['pickup_amps', ['pickup_a', 'pickup_pu']]
]);

const DC_COMPONENT_TYPES = new Set([
  'battery',
  'dc_bus',
  'rectifier',
  'pv_array'
]);

function normalizeType(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

const TYPE_ALIASES = new Map([
  ['synchronous', 'generator'],
  ['asynchronous', 'generator'],
  ['pv_inverter', 'inverter'],
  ['bess_inverter', 'inverter'],
  ['rectifier', 'inverter'],
  ['shunt_capacitor_bank', 'load'],
  ['static_load', 'load'],
  ['motor_load', 'load'],
  ['feeder', 'load'],
  ['link_source', 'utility'],
  ['link_target', 'bus'],
  // `relay_87` is intentionally NOT aliased to `relay`. The library carries two
  // distinct relay subtypes (`overcurrent_relay` and `relay_87`) whose schemas
  // differ by protective function. Collapsing them into one row merges their
  // props, so a field missing from one is masked by the other.
  ['class_rk1', 'fuse'],
  ['lv_cb', 'breaker'],
  ['mv_cb', 'breaker'],
  ['hv_cb', 'breaker'],
  ['two_winding', 'transformer'],
  ['three_winding', 'transformer'],
  ['auto_transformer', 'transformer'],
  ['dc_bus', 'bus'],
  ['busway', 'busway'],
  ['ct', 'ct'],
  ['current_transformer', 'ct'],
  ['pt_vt', 'pt_vt'],
  ['vt', 'pt_vt'],
  ['pt', 'pt_vt'],
  ['ups', 'ups'],
  ['vfd', 'motor'],
  ['soft_starter', 'motor'],
  ['fvnr_starter', 'motor'],
  ['fvr_starter', 'motor'],
  ['combination_starter', 'motor'],
  ['motor_starter', 'motor'],
  ['motor_controller', 'motor'],
  ['fused_disconnect', 'switch'],
  ['non_fused_disconnect', 'switch'],
  ['load_break_switch', 'switch'],
  ['visible_blade_disconnect', 'switch'],
  ['contactor', 'switch']
]);

function canonicalType(type) {
  const normalized = normalizeType(type);
  if (!normalized) return '';
  return TYPE_ALIASES.get(normalized) || normalized;
}

function classifyType(type) {
  if (/utility|source|grid/.test(type)) return 'source';
  if (/transformer/.test(type)) return 'transformer';
  // Differential elements must be matched before the generic protective test,
  // which would otherwise claim them via the `relay` substring.
  if (/relay_87|differential/.test(type)) return 'differential';
  if (/breaker|fuse|relay|protection|recloser/.test(type)) return 'protective';
  // panel / switchboard / mcc are bus equipment with their own canonical
  // schema (rated_voltage_kv, bus_rating_a, etc.), not load-aggregate or
  // rotating-machine templates. Roll-up kw/kvar/demand_factor belong on
  // child loads, not on the equipment template.
  if (/mcc|panel|switchboard/.test(type)) return 'equipment';
  if (/motor|generator/.test(type)) return 'rotating';
  if (/load/.test(type)) return 'load';
  if (/cable|tray|conduit|duct/.test(type)) return 'cable';
  return 'all';
}

function isAttributeSatisfied(baselineKey, propKeys) {
  if (propKeys.includes(baselineKey)) return true;
  const aliases = ATTRIBUTE_ALIASES.get(baselineKey);
  if (!aliases) return false;
  return aliases.some((alias) => propKeys.includes(normalizeType(alias)));
}

function resolveVoltageBaselineKey(type) {
  return DC_COMPONENT_TYPES.has(type) ? 'nominal_voltage_vdc' : 'rated_voltage_kv';
}

function getPropKeys(component) {
  const props = component?.props && typeof component.props === 'object' ? component.props : {};
  return Object.keys(props).map((key) => normalizeType(key));
}

function isDiagramAssetComponent(component) {
  const type = normalizeType(component?.type);
  const subtype = normalizeType(component?.subtype);
  const label = normalizeType(component?.label);
  if (type === 'annotation' || type === 'sheet_link') return false;
  if (subtype === 'text_box' || subtype === 'link_source' || subtype === 'link_target') return false;
  if (label === 'text box' || label.startsWith('sheet link')) return false;
  return true;
}

function runtimeBaselineProps(component, canonical) {
  if (!isDiagramAssetComponent(component)) return [];
  return [
    ...ATTRIBUTE_BASELINE.all,
    resolveVoltageBaselineKey(canonical)
  ].map((key) => normalizeType(key));
}

function formatList(items) {
  return items.length ? items.join(', ') : '—';
}

export function computeCoverage(library) {
  const components = Array.isArray(library?.components) ? library.components : [];

  const discoveredTypes = new Set();
  const typeToProps = new Map();
  const typeToAsset = new Map();

  components.forEach((component) => {
    const type = canonicalType(component?.subtype || component?.type || component?.label);
    if (!type) return;
    discoveredTypes.add(type);
    typeToAsset.set(type, Boolean(typeToAsset.get(type)) || isDiagramAssetComponent(component));
    const existingProps = typeToProps.get(type) || [];
    const mergedProps = Array.from(new Set([
      ...existingProps,
      ...getPropKeys(component),
      ...runtimeBaselineProps(component, type)
    ]));
    typeToProps.set(type, mergedProps);
  });

  const missingComponents = COMMON_COMPONENT_TYPES.filter((baselineType) => {
    const normalized = normalizeType(baselineType);
    return !Array.from(discoveredTypes).some((existingType) => existingType.includes(normalized) || normalized.includes(existingType));
  });

  const attributeRows = Array.from(typeToProps.entries())
    .map(([type, props]) => {
      const classKey = classifyType(type);
      const expected = !typeToAsset.get(type)
        ? []
        : Array.from(new Set([
            ...ATTRIBUTE_BASELINE.all,
            resolveVoltageBaselineKey(type),
            ...(ATTRIBUTE_BASELINE[classKey] || [])
          ])).map((item) => normalizeType(item));
      const missing = expected.filter((key) => !isAttributeSatisfied(key, props));
      return {
        type,
        expected,
        missing
      };
    })
    .sort((a, b) => b.missing.length - a.missing.length || a.type.localeCompare(b.type));

  return { missingComponents, attributeRows };
}

// The `Generated on` line is the only date-dependent content, so it is emitted
// separately from the report body. Freshness checks compare the body alone.
export function buildReportBody({ missingComponents, attributeRows }) {
  return [
    '## Missing Common Component Types',
    '',
    missingComponents.length
      ? missingComponents.map((type) => `- ${type}`).join('\n')
      : '- None from the baseline list.',
    '',
    '## Attribute Coverage by Existing Component Type',
    '',
    '| Component Type | Missing Attributes (common baseline) |',
    '| --- | --- |',
    ...attributeRows.map((row) => `| ${row.type} | ${formatList(row.missing)} |`),
    '',
    '## Notes',
    '',
    '- Baseline attributes are derived from common fields found in peer one-line/power-system design tools.',
    '- Product-bearing one-line components receive runtime baseline manufacturer, catalog approval, source, verification, datasheet, BIM, lifecycle, and voltage fields even when a legacy library row omits them.',
    '- An attribute is considered present if it appears under its canonical name or any documented alias (e.g., `kw` is satisfied by `hp`, `rated_kva`, `kva`, etc.). See `ATTRIBUTE_ALIASES` in `scripts/componentCoverageAudit.mjs`.',
    '- `src/validation/librarySchema.mjs` is the canonical schema for MCC and Motor entries; the heuristic baseline here is intentionally looser so it surfaces gaps without duplicating the validator.',
    '- This report is a heuristic gap check and should be reviewed before schema enforcement.'
  ];
}

export function buildReport(library, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const coverage = computeCoverage(library);
  const lines = [
    '# Component & Attribute Gap Analysis',
    '',
    `Generated on ${date} from \`${SOURCE_FILE}\`.`,
    '',
    ...buildReportBody(coverage)
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const library = JSON.parse(await fs.readFile(SOURCE_FILE, 'utf8'));
  await fs.writeFile(OUTPUT_FILE, buildReport(library));
  console.log(`Wrote ${OUTPUT_FILE}`);
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
