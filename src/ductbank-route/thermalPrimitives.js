export const CONDUIT_SPECS = Object.freeze({
  EMT: { '1/2': 0.304, '3/4': 0.533, '1': 0.864, '1-1/4': 1.496, '1-1/2': 2.036, '2': 3.356, '2-1/2': 5.858, '3': 8.846, '3-1/2': 11.545, '4': 14.753 },
  RMC: { '1/2': 0.314, '3/4': 0.549, '1': 0.887, '1-1/4': 1.526, '1-1/2': 2.071, '2': 3.408, '2-1/2': 4.866, '3': 7.499, '3-1/2': 10.01, '4': 12.882, '5': 20.212, '6': 29.158 },
  'PVC Sch 40': { '1/2': 0.285, '3/4': 0.508, '1': 0.832, '1-1/4': 1.453, '1-1/2': 1.986, '2': 3.291, '2-1/2': 4.695, '3': 7.268, '3-1/2': 9.737, '4': 12.554, '5': 19.761, '6': 28.567 }
});

export const INSULATION_TEMP_LIMIT = Object.freeze({
  THHN: 90,
  XLPE: 90,
  PVC: 75,
  XHHW: 90,
  'XHHW-2': 90,
  'THWN-2': 90,
  THW: 75,
  THWN: 75,
  TW: 60,
  UF: 60
});

export function fahrenheitToCelsius(value) {
  return (value - 32) / 1.8;
}

export function finiteNumber(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

export function resolveCableTemperatureRating(cable, fallbackRating = 90) {
  const direct = Number.parseFloat(cable?.insulation_rating);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const type = String(cable?.insulation_type || '').trim().toUpperCase();
  return INSULATION_TEMP_LIMIT[type] || fallbackRating;
}

export function cableCurrentCarryingConductors(cable) {
  return Math.max(1, finiteNumber(cable?.conductors, 1));
}

export function conduitEquivalentDiameterMeters(conduit) {
  const area = CONDUIT_SPECS[conduit?.conduit_type]?.[conduit?.trade_size];
  if (!Number.isFinite(area) || area <= 0) return 0;
  return 2 * Math.sqrt(area / Math.PI) * 0.0254;
}

export function insulationTypesForRating(rating) {
  const types = Object.keys(INSULATION_TEMP_LIMIT)
    .filter(type => INSULATION_TEMP_LIMIT[type] === Number(rating));
  return types.length ? types : Object.keys(INSULATION_TEMP_LIMIT);
}

export function neherMcGrathTemperature(power, thermalResistance, ambient, conductivity, radius) {
  const referenceRadius = 0.05;
  const radial = Math.log(Math.max(radius, referenceRadius) / referenceRadius)
    / (2 * Math.PI * conductivity);
  return ambient + power * (thermalResistance + radial);
}

export function parseTradeSize(value) {
  const size = String(value || '');
  if (size.includes('-')) {
    const [whole, fraction] = size.split('-');
    const [numerator, denominator] = fraction.split('/');
    return Number.parseFloat(whole) + Number.parseFloat(numerator) / Number.parseFloat(denominator);
  }
  if (size.includes('/')) {
    const [numerator, denominator] = size.split('/');
    return Number.parseFloat(numerator) / Number.parseFloat(denominator);
  }
  return Number.parseFloat(size);
}
