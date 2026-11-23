// Limited historical reference points for preliminary review, not a code determination.
const REFERENCE = 'https://www.nyecountynv.gov/DocumentCenter/View/38288/2017-NEC-Code-2';
const PREFIX = 'CTR historical motor current v1: ';
const TABLE = Object.freeze({ 10: 14, 40: 52 });
const present = value => value !== undefined && value !== null && String(value).trim() !== '';

function bindingFor(motor, phases, voltage) {
  const hp = Number(motor.nameplateHorsepower);
  const nameplateA = Number(motor.nameplateCurrentA);
  const tableA = TABLE[hp];
  if (![460, 480].includes(Number(voltage)) || Number(phases) !== 3 || Number(motor.ratedVoltageV) !== 460
    || Number(motor.nameplateFrequencyHz) !== 60 || motor.rotorType !== 'squirrel-cage' || motor.starterType !== 'dol'
    || !Number.isFinite(nameplateA) || nameplateA <= 0 || tableA === undefined) return null;
  return { hp, nameplateA, tableA, selectedA: Math.max(nameplateA, tableA), voltage: Number(voltage), phases: 3, source: REFERENCE };
}

function flatMotor(row) {
  return { ratedVoltageV: row.motorRatedVoltageV, nameplateHorsepower: row.motorNameplateHorsepower,
    nameplateCurrentA: row.motorNameplateCurrentA, nameplateFrequencyHz: row.motorNameplateFrequencyHz,
    rotorType: String(row.motorRotorType ?? '').trim().toLowerCase(), starterType: String(row.motorStarterType ?? '').trim().toLowerCase() };
}

function readBinding(reference) {
  if (typeof reference !== 'string' || !reference.startsWith(PREFIX)) return null;
  try { return JSON.parse(reference.slice(PREFIX.length)); } catch { return null; }
}

export function validateMotorDesignCurrentReference(record) {
  const motor = record?.motor;
  const reference = motor?.fullLoadCurrentBasis?.reference;
  if (typeof reference !== 'string' || !reference.startsWith(PREFIX)) return null;
  const binding = readBinding(reference);
  const expected = bindingFor(motor, record.phases, record.voltage);
  if (!binding || !expected || JSON.stringify(binding) !== JSON.stringify(expected)
    || Number(motor.fullLoadCurrentA) !== expected.selectedA) {
    return 'Historical motor current basis is stale or invalid. Reapply the reference or enter a separately documented design basis.';
  }
  return null;
}

/** Preview an explicit, atomic user choice. No existing independent design basis is replaced. */
export function prepareMotorDesignCurrentReference(rows, selectedIds) {
  const ids = Array.isArray(selectedIds) ? selectedIds.map(id => String(id ?? '').trim()) : [];
  if (!Array.isArray(rows) || !ids.length || ids.some(id => !id) || new Set(ids).size !== ids.length) return { ok: false, issues: ['Select distinct equipment rows.'], rows: null, preview: [] };
  const selected = rows.filter(row => ids.includes(String(row?.id ?? '').trim()));
  if (selected.length !== ids.length || new Set(selected.map(row => String(row.id).trim())).size !== ids.length) return { ok: false, issues: ['Selected equipment identities are missing or ambiguous.'], rows: null, preview: [] };
  const issues = [];
  const preview = [];
  for (const row of selected) {
    const label = String(row.tag || row.id);
    const motor = flatMotor(row);
    const binding = bindingFor(motor, row.phases, row.voltage);
    const old = readBinding(row.motorFullLoadCurrentReference);
    const classification = [row.category, row.subCategory, row.type, row.subtype, row.loadType].join(' ').toLowerCase();
    if (/vfd|soft[\s_-]*starter|motor[\s_-]*(?:control|starter)|\b(?:panel|panelboard|transformer|source|mcc|busbar)\b/.test(classification)) issues.push(`${label}: this equipment classification is not a supported DOL motor load.`);
    if (row.motor || row._designSynthesis) issues.push(`${label}: nested or generated motor records are not supported.`);
    if (!binding) issues.push(`${label}: requires a 10 or 40 hp, 460 V, 60 Hz, three-phase squirrel-cage DOL motor with a positive nameplate current and a 460/480 V circuit.`);
    if ((present(row.motorFullLoadCurrentA) || present(row.motorFullLoadCurrentReference))
      && (!old || !Number.isFinite(old.selectedA) || Number(row.motorFullLoadCurrentA) !== old.selectedA)) issues.push(`${label}: an existing independent or edited design-current basis cannot be replaced.`);
    if (binding) preview.push({ id: String(row.id).trim(), tag: label, ...binding });
  }
  if (issues.length) return { ok: false, issues, rows: null, preview };
  const byId = new Map(preview.map(item => [item.id, item]));
  return { ok: true, issues: [], preview, rows: rows.map(row => {
    const item = byId.get(String(row?.id ?? '').trim());
    if (!item) return structuredClone(row);
    const { hp, nameplateA, tableA, selectedA, voltage, phases, source } = item;
    return { ...structuredClone(row), motorFullLoadCurrentA: selectedA, motorFullLoadCurrentReference: PREFIX + JSON.stringify({ hp, nameplateA, tableA, selectedA, voltage, phases, source }) };
  }) };
}

export const MOTOR_DESIGN_CURRENT_REFERENCE_URL = REFERENCE;
