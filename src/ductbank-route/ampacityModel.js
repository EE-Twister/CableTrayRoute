import {
  cableCurrentCarryingConductors,
  conduitEquivalentDiameterMeters,
  finiteNumber,
  resolveCableTemperatureRating
} from './thermalPrimitives.js';

const AWG_AREA = Object.freeze({
  '22': 642,
  '20': 1020,
  '18': 1624,
  '16': 2583,
  '14': 4107,
  '12': 6530,
  '10': 10380,
  '8': 16510,
  '6': 26240,
  '4': 41740,
  '3': 52620,
  '2': 66360,
  '1': 83690,
  '1/0': 105600,
  '2/0': 133100,
  '3/0': 167800,
  '4/0': 211600,
  '250': 250000,
  '350': 350000,
  '500': 500000,
  '750': 750000,
  '1000': 1000000
});

const BASE_RESISTIVITY = Object.freeze({ cu: 0.017241, al: 0.028264 });
const TEMP_COEFFICIENT = Object.freeze({ cu: 0.00393, al: 0.00403 });
const RESISTANCE_TABLE = Object.freeze(Object.fromEntries(
  Object.keys(BASE_RESISTIVITY).map(material => [
    material,
    Object.freeze(Object.fromEntries(Object.entries(AWG_AREA).map(([size, areaCircularMils]) => [
      size,
      BASE_RESISTIVITY[material] / (areaCircularMils * 0.0005067)
    ])))
  ])
));

export function createDuctbankAmpacityModel({
  getConductorProperties,
  findConduit,
  getConductorRating,
  getCableTemperatureRating = resolveCableTemperatureRating,
  normalizeConduitId,
  ductResistanceTable
}) {
  const conductorProperties = () => getConductorProperties() || {};

  function normalizeSizeKey(size) {
    const properties = conductorProperties();
    const normalized = size ? size.toString().trim() : '';
    if (properties[normalized]) return normalized;
    const alternate = normalized.replace(/^#/, '');
    if (properties[alternate]) return alternate;
    return normalized;
  }

  function sizeToArea(size) {
    if (!size) return 0;
    const properties = conductorProperties();
    let normalized = size.toString().trim();
    if (properties[normalized]) return properties[normalized].area_cm;
    normalized = normalized.replace(/^#/, '');
    if (/kcmil/i.test(normalized)) return Number.parseFloat(normalized) * 1000;
    const match = normalized.match(/(\d+(?:\/0)?)/);
    if (!match) return 0;
    return AWG_AREA[match[1]] || 0;
  }

  function dcResistance(size, material, temperature = 20) {
    const properties = conductorProperties();
    const key = normalizeSizeKey(size);
    const conductorMaterial = material && material.toLowerCase().includes('al') ? 'al' : 'cu';
    const property = properties[key];
    let base = property
      ? (conductorMaterial === 'al' ? property.rdc_al : property.rdc_cu)
      : RESISTANCE_TABLE[conductorMaterial][key];
    if (base === undefined) {
      const areaCircularMils = sizeToArea(size);
      if (!areaCircularMils) return 0;
      base = BASE_RESISTIVITY[conductorMaterial] / (areaCircularMils * 0.0005067);
    }
    return base * (1 + TEMP_COEFFICIENT[conductorMaterial] * (temperature - 20));
  }

  function skinEffect(size) {
    const areaKcmil = sizeToArea(size) / 1000;
    if (!areaKcmil) return 0;
    const table = [[0, 0], [100, 0], [250, 0.05], [500, 0.1], [1000, 0.15], [2000, 0.2]];
    for (let index = 1; index < table.length; index += 1) {
      const lower = table[index - 1];
      const upper = table[index];
      if (areaKcmil <= upper[0]) {
        const fraction = (areaKcmil - lower[0]) / (upper[0] - lower[0]);
        return lower[1] + fraction * (upper[1] - lower[1]);
      }
    }
    return table[table.length - 1][1];
  }

  function dielectricRise(voltage) {
    const voltageKv = (Number.parseFloat(voltage) || 0) / 1000;
    const table = [[0, 0], [2, 0], [5, 5], [15, 10], [25, 15], [35, 20]];
    if (voltageKv <= table[0][0]) return table[0][1];
    for (let index = 1; index < table.length; index += 1) {
      const lower = table[index - 1];
      const upper = table[index];
      if (voltageKv <= upper[0]) {
        const fraction = (voltageKv - lower[0]) / (upper[0] - lower[0]);
        return lower[1] + fraction * (upper[1] - lower[1]);
      }
    }
    return table[table.length - 1][1];
  }

  function conductorThermalResistance(cable) {
    const property = conductorProperties()[normalizeSizeKey(cable.conductor_size)];
    if (!property) throw new Error(`Invalid conductor size: ${cable.conductor_size}`);
    const areaM2 = property.area_cm * 5.067e-10;
    const conductorRadius = Math.sqrt(areaM2 / Math.PI);
    const insulationThickness = (Number.parseFloat(cable.insulation_thickness) || property.insulation_thickness || 0) * 0.0254;
    const insulationRadius = conductorRadius + insulationThickness;
    const innerEquivalentRadius = conductorRadius * 0.001;
    const conductorConductivity = cable.conductor_material && cable.conductor_material.toLowerCase().includes('al') ? 237 : 401;
    const insulationConductivity = Number.parseFloat(cable.insulation_k) || 0.3;
    return {
      Rcond: Math.log(conductorRadius / innerEquivalentRadius) / (2 * Math.PI * conductorConductivity),
      Rins: Math.log(insulationRadius / conductorRadius) / (2 * Math.PI * insulationConductivity)
    };
  }

  function getDuctThermalResistance(conduit, params) {
    if (!conduit || !conduit.conduit_type) return params.concreteEncasement ? 0.1 : 0.08;
    const material = conduit.conduit_type.includes('PVC') ? 'PVC' : 'steel';
    const base = ductResistanceTable[material]?.[conduit.trade_size];
    let resistance = base !== undefined ? base : (material === 'PVC' ? 0.1 : 0.08);
    if (params.concreteEncasement) {
      const concrete = ductResistanceTable.concrete[conduit.trade_size];
      resistance += concrete !== undefined ? concrete : 0.05;
    }
    return resistance;
  }

  function calcRcaComponents(cable, params) {
    const { Rcond, Rins } = conductorThermalResistance(cable);
    const conduit = findConduit(cable.conduit_id) || {};
    const Rduct = getDuctThermalResistance(conduit, params);
    const soilResistivity = Math.min(150, Math.max(40, params.soilResistivity || 90)) / 100;
    const burialDepth = (params.ductbankDepth || 0) * 0.0254;
    const conduitDiameter = conduitEquivalentDiameterMeters(conduit);
    const Rsoil = burialDepth > 0 && conduitDiameter > 0
      ? (soilResistivity / (2 * Math.PI)) * Math.log(4 * burialDepth / conduitDiameter)
      : 0;
    return { Rcond, Rins, Rduct, Rsoil, Rca: Rcond + Rins + Rduct + Rsoil };
  }

  function ampacityDetails(cable, params) {
    const areaCircularMils = sizeToArea(cable.conductor_size);
    if (!areaCircularMils) return { ampacity: 0 };
    const rating = getCableTemperatureRating(cable);
    const Rdc = dcResistance(cable.conductor_size, cable.conductor_material, rating);
    const Yc = skinEffect(cable.conductor_size);
    const deltaTd = dielectricRise(cable.voltage_rating);
    const components = calcRcaComponents(cable, params);
    const ambient = Math.max(Number.isFinite(params.earthTemp) ? params.earthTemp : 20, Number.isNaN(Number(params.airTemp)) ? -Infinity : params.airTemp);
    const temperatureMargin = rating - (ambient + deltaTd);
    const conductorFactor = cableCurrentCarryingConductors(cable);
    const ampacity = temperatureMargin <= 0 || !Number.isFinite(Rdc) || Rdc <= 0 || !Number.isFinite(components.Rca) || components.Rca <= 0
      ? 0
      : Math.sqrt(temperatureMargin / (Rdc * (1 + Yc) * components.Rca * conductorFactor));
    return { Rdc, Yc, deltaTd, ...components, ampacity, rating, conductorFactor };
  }

  function estimateAmpacity(cable, params) {
    const rating = getCableTemperatureRating(cable);
    const resistance = dcResistance(cable.conductor_size, cable.conductor_material, rating);
    const skinEffectFactor = skinEffect(cable.conductor_size);
    const dielectricTemperatureRise = dielectricRise(cable.voltage_rating);
    const components = calcRcaComponents(cable, params);
    const thermalResistance = components.Rcond + components.Rins + components.Rduct + components.Rsoil;
    if (!Number.isFinite(thermalResistance) || thermalResistance <= 0) return { ampacity: Number.NaN };
    const ambient = Math.max(Number.isFinite(params.earthTemp) ? params.earthTemp : 20, Number.isNaN(Number(params.airTemp)) ? -Infinity : params.airTemp);
    const temperatureMargin = rating - (ambient + dielectricTemperatureRise);
    if (temperatureMargin <= 0 || !Number.isFinite(resistance) || resistance <= 0) return { ampacity: 0 };
    const conductorFactor = cableCurrentCarryingConductors(cable);
    return { ampacity: Math.sqrt(temperatureMargin / (resistance * (1 + skinEffectFactor) * thermalResistance * conductorFactor)) };
  }

  function cableHeatLoss(cable, current = finiteNumber(cable?.est_load, 0), rating = getCableTemperatureRating(cable)) {
    const resistance = dcResistance(cable.conductor_size, cable.conductor_material, rating);
    if (!Number.isFinite(resistance) || resistance <= 0) return 0;
    return current * current * resistance * (1 + skinEffect(cable.conductor_size)) * cableCurrentCarryingConductors(cable);
  }

  function cableSelfThermalResistance(cable) {
    try {
      const components = conductorThermalResistance(cable);
      return components.Rcond + components.Rins;
    } catch {
      return 0;
    }
  }

  function cableConductorTemperature(cable, conduitTemperature, current = finiteNumber(cable?.est_load, 0)) {
    const baseTemperature = Number.isFinite(conduitTemperature) ? conduitTemperature : 20;
    return baseTemperature + cableHeatLoss(cable, current) * cableSelfThermalResistance(cable);
  }

  function conduitTemperatureLimit(conduitId, cables) {
    const ratings = cables
      .filter(cable => normalizeConduitId(cable.conduit_id) === normalizeConduitId(conduitId))
      .map(cable => getCableTemperatureRating(cable))
      .filter(rating => Number.isFinite(rating) && rating > 0);
    return ratings.length ? Math.min(...ratings) : getConductorRating();
  }

  return {
    ampacityDetails,
    cableConductorTemperature,
    cableHeatLoss,
    cableSelfThermalResistance,
    calcRca: (cable, params) => calcRcaComponents(cable, params).Rca,
    calcRcaComponents,
    conductorThermalResistance,
    conduitTemperatureLimit,
    dcResistance,
    dielectricRise,
    estimateAmpacity,
    normalizeSizeKey,
    sizeToArea,
    skinEffect
  };
}
