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
  all: ['tag', 'description', 'manufacturer', 'model', 'volts', 'phases'],
  source: ['short_circuit_capacity', 'xr_ratio', 'frequency_hz'],
  transformer: ['kva', 'percent_z', 'primary_connection', 'secondary_connection'],
  protective: ['pickup_amps', 'time_dial', 'interrupting_rating_ka'],
  rotating: ['kw', 'efficiency', 'power_factor'],
  load: ['kw', 'kvar', 'demand_factor'],
  cable: ['size', 'material', 'insulation', 'ampacity', 'length']
};

function normalizeType(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
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

function getPropKeys(component) {
  return Object.keys(component?.props || {}).map((key) => normalizeType(key));
}

function formatList(items) {
  return items.length ? items.join(', ') : '—';
}

async function main() {
  const library = JSON.parse(await fs.readFile(SOURCE_FILE, 'utf8'));
  const components = Array.isArray(library.components) ? library.components : [];

  const discoveredTypes = new Set();
  const typeToProps = new Map();

  components.forEach((component) => {
    const type = normalizeType(component?.subtype || component?.type || component?.label);
    if (!type) return;
    discoveredTypes.add(type);
    typeToProps.set(type, getPropKeys(component));
  });

  const missingComponents = COMMON_COMPONENT_TYPES.filter((baselineType) => {
    const normalized = normalizeType(baselineType);
    return !Array.from(discoveredTypes).some((existingType) => existingType.includes(normalized) || normalized.includes(existingType));
  });

  const attributeRows = Array.from(typeToProps.entries())
    .map(([type, props]) => {
      const classKey = classifyType(type);
      const expected = Array.from(new Set([
        ...ATTRIBUTE_BASELINE.all,
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
    '- This report is a heuristic gap check and should be reviewed before schema enforcement.'
  ];

  await fs.writeFile(OUTPUT_FILE, `${lines.join('\n')}\n`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
