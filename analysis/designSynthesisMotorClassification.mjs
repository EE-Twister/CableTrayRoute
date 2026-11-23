const MOTOR_CLASSES = new Set(['motor', 'motorload', 'motorcontroller', 'motorstarter', 'vfd', 'softstarter']);
const CLASSIFICATION_FIELDS = ['type', 'subtype', 'category', 'subCategory', 'loadType', 'mccUnitType'];
const FLAT_MOTOR_FIELDS = [
  'motorRatedVoltageV', 'motorFullLoadCurrentA', 'motorFullLoadCurrentReference',
  'motorNameplateCurrentA', 'motorNameplateHorsepower', 'motorNameplateFrequencyHz',
  'motorLockedRotorCurrentA', 'motorLockedRotorPowerFactor', 'motorStarterType',
  'motorRotorType', 'motorInstantaneousPickupA', 'motorBreakerAmbientTemperatureC', 'motorBreakerAmbientReference', 'motorDataReference', 'motorOperatingBasis',
];

function normalized(value) { return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function meaningful(value) { return value !== undefined && value !== null && !(typeof value === 'string' && !value.trim()); }

export function indicatesDesignSynthesisMotor(record = {}) {
  return record?.motor !== undefined
    || CLASSIFICATION_FIELDS.some(key => MOTOR_CLASSES.has(normalized(record?.[key])))
    || FLAT_MOTOR_FIELDS.some(key => meaningful(record?.[key]))
    || meaningful(record?.starterType);
}

export function hasUnsupportedDesignSynthesisStarter(record = {}) {
  return [...CLASSIFICATION_FIELDS.map(key => record?.[key]), record?.starterType, record?.motorStarterType, record?.motor?.starterType]
    .some(value => ['vfd', 'softstarter'].includes(normalized(value)));
}
