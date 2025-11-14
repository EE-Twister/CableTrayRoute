const UNIT_TO_METERS = new Map([
  ['km', 1000],
  ['kilometer', 1000],
  ['kilometers', 1000],
  ['m', 1],
  ['meter', 1],
  ['meters', 1],
  ['metre', 1],
  ['metres', 1],
  ['cm', 0.01],
  ['centimeter', 0.01],
  ['centimeters', 0.01],
  ['centimetre', 0.01],
  ['centimetres', 0.01],
  ['mm', 0.001],
  ['millimeter', 0.001],
  ['millimeters', 0.001],
  ['millimetre', 0.001],
  ['millimetres', 0.001],
  ['mi', 1609.344],
  ['mile', 1609.344],
  ['miles', 1609.344],
  ['yd', 0.9144],
  ['yard', 0.9144],
  ['yards', 0.9144],
  ['ft', 0.3048],
  ['foot', 0.3048],
  ['feet', 0.3048],
  ['', 0.3048],
  ['in', 0.0254],
  ['inch', 0.0254],
  ['inches', 0.0254]
]);

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function lengthToKilometers(length, unit) {
  const numericLength = toFiniteNumber(length);
  if (numericLength === null || numericLength <= 0) return null;
  const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  const metersPerUnit = UNIT_TO_METERS.get(normalizedUnit) ?? UNIT_TO_METERS.get('');
  if (!Number.isFinite(metersPerUnit) || metersPerUnit <= 0) return null;
  const meters = numericLength * metersPerUnit;
  return meters / 1000;
}

export function computeImpedanceFromPerKm({ resistancePerKm, reactancePerKm, length, unit } = {}) {
  const lengthKm = lengthToKilometers(length, unit);
  if (lengthKm === null) return null;
  const rPerKm = toFiniteNumber(resistancePerKm);
  const xPerKm = toFiniteNumber(reactancePerKm);
  const result = {};
  if (rPerKm !== null) result.r = rPerKm * lengthKm;
  if (xPerKm !== null) result.x = xPerKm * lengthKm;
  return Object.keys(result).length ? result : null;
}

export default computeImpedanceFromPerKm;
