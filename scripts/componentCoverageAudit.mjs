import fs from 'node:fs/promises';

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
  rotating: ['kw', 'efficiency', 'power_factor'],
  load: ['kw', 'kvar', 'demand_factor'],
  cable: ['size', 'material', 'insulation', 'ampacity', 'length']
};

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
  ['relay_87', 'relay'],
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
  if (/breaker|fuse|relay|protection|recloser/.test(type)) return 'protective';
  if (/motor|generator|mcc/.test(type)) return 'rotating';
  if (/load|panel|switchboard/.test(type)) return 'load';
  if (/cable|tray|conduit|duct/.test(type)) return 'cable';
  return 'all';
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

async function main() {
  const library = JSON.parse(await fs.readFile(SOURCE_FILE, 'utf8'));
  const components = Array.isArray(library.components) ? library.components : [];

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
      const missing = expected.filter((key) => !props.includes(key));
      return {
        type,
        expected,
        missing
      };
    })
    .sort((a, b) => b.missing.length - a.missing.length || a.type.localeCompare(b.type));

  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '# Component & Attribute Gap Analysis',
    '',
    `Generated on ${today} from \`${SOURCE_FILE}\`.`,
    '',
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
    '- This report is a heuristic gap check and should be reviewed before schema enforcement.'
  ];

  await fs.writeFile(OUTPUT_FILE, `${lines.join('\n')}\n`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
