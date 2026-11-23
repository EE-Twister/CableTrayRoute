/** Manufacturer reference data for explicitly selected preliminary motor models.
 * Typical starting values are not guaranteed or evidence of an installed unit. */
export const MOTOR_REFERENCE_PROFILES = Object.freeze([
  Object.freeze({
    id: 'baldor-gnem2332t-460-60', model: 'GNEM2332T', horsepower: 10,
    source: 'https://www.baldor.com/api/products/GNEM2332T/infopacket',
    sha256: '7af275fea860d9d38ccbfce69f802e1d58fa902dbd0b36a1f91cc25508c81de5',
    record: '101013',
    fullLoad: Object.freeze({ efficiency: 0.911, powerFactor: 0.61 }),
    values: Object.freeze({ motorRatedVoltageV: 460, motorNameplateCurrentA: 16.8, motorNameplateHorsepower: 10, motorNameplateFrequencyHz: 60, motorLockedRotorCurrentA: 121, motorLockedRotorPowerFactor: 0.254, motorStarterType: 'dol' })
  }),
  Object.freeze({
    id: 'baldor-ccpx32446t-460-60', model: 'CCPX32446T', horsepower: 40,
    source: 'https://www.baldor.com/api/products/CCPX32446T/infopacket',
    sha256: 'd9ff6796524852024ee60fd5f6a2fd623e228e878553ed125dd90f3ff0d6e6dd',
    record: '43813',
    fullLoad: Object.freeze({ efficiency: 0.942, powerFactor: 0.83 }),
    values: Object.freeze({ motorRatedVoltageV: 460, motorNameplateCurrentA: 48, motorNameplateHorsepower: 40, motorNameplateFrequencyHz: 60, motorLockedRotorCurrentA: 338, motorLockedRotorPowerFactor: 0.27, motorStarterType: 'dol' })
  })
]);

const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const normalized = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const frequencyIs60 = value => (typeof value === 'number' || (typeof value === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) && Number(value) === 60;
const operatingBasis = (profile, voltage) => ({
  method: 'manufacturer-typical-rated-load-v1', profileId: profile.id, model: profile.model,
  sourceUrl: profile.source, sourceSha256: profile.sha256, sourcePage: 6, record: profile.record,
  motorRatedVoltageV: 460, circuitVoltageV: Number(voltage), frequencyHz: 60, phases: 3,
  ratedOutputHp: profile.horsepower, loadFraction: 1, efficiency: profile.fullLoad.efficiency,
  powerFactor: profile.fullLoad.powerFactor, inputKW: profile.horsepower * 0.7457 / profile.fullLoad.efficiency,
  limitation: 'Typical 100%-rated-load data at 460 V; not guaranteed or verified installed. Constant-power screening at the stated circuit voltage is an assumption.'
});

/** Check a stored, explicitly chosen reference against the actual motor and operating inputs. */
export function validateMotorOperatingReference(row) {
  if (!Object.prototype.hasOwnProperty.call(row || {}, 'motorOperatingBasis')) return null;
  const basis = row.motorOperatingBasis;
  const profile = MOTOR_REFERENCE_PROFILES.find(item => item.id === basis?.profileId);
  const motor = row.motor && typeof row.motor === 'object' ? row.motor : {
    ratedVoltageV: row.motorRatedVoltageV, nameplateHorsepower: row.motorNameplateHorsepower,
    nameplateFrequencyHz: row.motorNameplateFrequencyHz, nameplateCurrentA: row.motorNameplateCurrentA,
    lockedRotorCurrentA: row.motorLockedRotorCurrentA, lockedRotorPowerFactor: row.motorLockedRotorPowerFactor,
    starterType: row.motorStarterType,
  };
  if (!profile || ![460, 480].includes(Number(row.voltage)) || Number(row.phases) !== 3) return 'Motor operating reference is invalid or no longer matches the circuit.';
  if (['frequencyHz', 'frequency'].some(key => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && !frequencyIs60(row[key]))) return 'Motor operating reference requires a 60 Hz circuit.';
  const expected = operatingBasis(profile, row.voltage);
  const sameBasis = basis && typeof basis === 'object' && !Array.isArray(basis)
    && Object.keys(basis).length === Object.keys(expected).length
    && Object.keys(expected).every(key => basis[key] === expected[key]);
  if (!sameBasis || Number(row.kw) !== expected.inputKW
    || Number(row.powerFactor) !== expected.powerFactor || normalized(row.ratingsBasis) !== 'electricalinputkw'
    || normalized(row.duty) !== 'continuous' || Number(motor.ratedVoltageV) !== 460
    || (present(row.model) && normalized(row.model) !== normalized(profile.model))
    || (present(row.manufacturer) && !['abb', 'baldor', 'abbbaldor', 'baldorreliance', 'abbbaldorreliance'].includes(normalized(row.manufacturer)))
    || Number(motor.nameplateHorsepower) !== profile.horsepower || Number(motor.nameplateFrequencyHz) !== 60
    || Number(motor.nameplateCurrentA) !== profile.values.motorNameplateCurrentA
    || Number(motor.lockedRotorCurrentA) !== profile.values.motorLockedRotorCurrentA
    || Number(motor.lockedRotorPowerFactor) !== profile.values.motorLockedRotorPowerFactor
    || normalized(motor.starterType) !== 'dol') return 'Motor operating reference is stale or inconsistent with the selected manufacturer model. Review it again or supply a separately documented operating basis.';
  return null;
}

/** Apply a user-selected model to selected equipment atomically. Existing
 * contradictory data blocks all changes; no design FLC or load is inferred. */
export function applyMotorReferenceProfile(rows, selectedIds, profileId, { useTypicalFullLoad = false } = {}) {
  const profile = MOTOR_REFERENCE_PROFILES.find(item => item.id === profileId);
  const selected = Array.isArray(selectedIds) ? selectedIds.map(id => String(id ?? '').trim()) : [];
  const issues = [];
  if (!profile) issues.push('Choose a supported manufacturer motor reference.');
  if (typeof useTypicalFullLoad !== 'boolean') issues.push('The full-load option must be explicitly selected or left unchecked.');
  if (!Array.isArray(rows) || !selected.length || selected.some(id => !id) || new Set(selected).size !== selected.length) issues.push('Select distinct equipment rows with stable identities.');
  if (issues.length) return { ok: false, rows: null, issues };
  const matches = rows.filter(row => selected.includes(String(row?.id ?? '').trim()));
  if (matches.length !== selected.length || new Set(matches.map(row => String(row.id).trim())).size !== selected.length) return { ok: false, rows: null, issues: ['Selected equipment identities are missing or ambiguous.'] };
  for (const row of matches) {
    const label = String(row.tag || row.id);
    const classifications = [row.category, row.subCategory, row.type, row.subtype, row.loadType, row.starterType];
    const unsupported = classifications.some(value => {
      const compact = normalized(value);
      const words = String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return ['vfd', 'softstarter', 'motorcontroller', 'motorstarter', 'motorcontrol'].some(token => compact.includes(token))
        || words.some(word => ['source', 'panel', 'panelboard', 'bus', 'busbar', 'transformer', 'mcc'].includes(word));
    });
    if (unsupported) issues.push(`${label}: this equipment classification is not a supported DOL motor load.`);
    if (row._designSynthesis) issues.push(`${label}: generated equipment is not an editable motor input.`);
    if (row.motor !== undefined && row.motor !== null && row.motor !== '') issues.push(`${label}: resolve the existing nested motor record before applying flat reference fields.`);
    if (present(row.motorDataReference) && typeof row.motorDataReference !== 'string') issues.push(`${label}: existing motor reference must be text.`);
    if (present(row.model) && normalized(row.model) !== normalized(profile.model)) issues.push(`${label}: existing model conflicts with ${profile.model}.`);
    if (present(row.manufacturer) && !['abb', 'baldor', 'abbbaldor', 'baldorreliance', 'abbbaldorreliance'].includes(normalized(row.manufacturer))) issues.push(`${label}: existing manufacturer conflicts with ABB Baldor.`);
    if (present(row.voltage) && ![460, 480].includes(Number(row.voltage))) issues.push(`${label}: this profile is for a 460 V motor on a 460/480 V circuit.`);
    if (present(row.phases) && Number(row.phases) !== 3) issues.push(`${label}: this profile requires a three-phase circuit.`);
    if (useTypicalFullLoad) {
      if (![460, 480].includes(Number(row.voltage)) || Number(row.phases) !== 3) issues.push(`${label}: full-load operating data requires an explicit 460/480 V three-phase circuit.`);
      if (['frequencyHz', 'frequency'].some(key => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && !frequencyIs60(row[key]))) issues.push(`${label}: full-load operating data requires a 60 Hz circuit when frequency is supplied.`);
      const basis = operatingBasis(profile, row.voltage);
      if (present(row.kw) && Number(row.kw) !== basis.inputKW) issues.push(`${label}: existing operating kW conflicts with the selected full-load estimate.`);
      if (present(row.powerFactor) && Number(row.powerFactor) !== basis.powerFactor) issues.push(`${label}: existing running power factor conflicts with the selected full-load estimate.`);
      if (present(row.ratingsBasis) && normalized(row.ratingsBasis) !== 'electricalinputkw') issues.push(`${label}: existing rating basis is not electrical input kW.`);
      if (present(row.duty) && normalized(row.duty) !== 'continuous') issues.push(`${label}: existing duty conflicts with the continuous full-load screening basis.`);
      if (Object.prototype.hasOwnProperty.call(row, 'motorOperatingBasis')) {
        const previous = row.motorOperatingBasis;
        if (!previous || typeof previous !== 'object' || Array.isArray(previous) || Object.keys(previous).length !== Object.keys(basis).length || Object.keys(basis).some(key => previous[key] !== basis[key])) issues.push(`${label}: existing motor operating reference conflicts with the selected basis.`);
      }
    }
    for (const [field, value] of Object.entries(profile.values)) {
      if (!present(row[field])) continue;
      const agrees = typeof value === 'number' ? Number(row[field]) === value : normalized(row[field]) === normalized(value);
      if (!agrees) issues.push(`${label}: existing ${field} conflicts with the selected motor reference.`);
    }
  }
  if (issues.length) return { ok: false, rows: null, issues };
  const reference = `ABB Baldor ${profile.model}, customer information packet p. 6, record ${profile.record}; starting data typical, not guaranteed; ${profile.source}; SHA-256 ${profile.sha256}; selected for preliminary screening, not verified installed.`;
  const selectedSet = new Set(selected);
  return { ok: true, issues: [], rows: rows.map(row => {
    if (!selectedSet.has(String(row?.id ?? '').trim())) return structuredClone(row);
    const result = structuredClone(row);
    for (const [field, value] of Object.entries(profile.values)) if (!present(result[field])) result[field] = value;
    if (useTypicalFullLoad) {
      const basis = operatingBasis(profile, result.voltage);
      result.kw = basis.inputKW;
      result.powerFactor = basis.powerFactor;
      result.ratingsBasis = 'electrical-input-kW';
      result.duty = 'continuous';
      result.motorOperatingBasis = basis;
    }
    const prior = String(result.motorDataReference || '').trim();
    result.motorDataReference = prior.includes(profile.sha256) ? prior : [prior, reference].filter(Boolean).join(' | ');
    return result;
  }) };
}
