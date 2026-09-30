import { CONDUIT_INTERNAL_AREA_IN2 } from '../../analysis/conduitFill.mjs';

// Conduit types the ductbank thermal model supports; areas come from the shared table.
export const CONDUIT_SPECS = Object.freeze({
  EMT: CONDUIT_INTERNAL_AREA_IN2.EMT,
  RMC: CONDUIT_INTERNAL_AREA_IN2.RMC,
  'PVC Sch 40': CONDUIT_INTERNAL_AREA_IN2['PVC Sch 40']
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
