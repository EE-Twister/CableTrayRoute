const conductorProps = await (async () => {
  try {
    return await fetch('./data/conductor_properties.json').then(r => r.json());
  } catch {
    return (await import('./conductorProperties.mjs')).default;
  }
})();

const AWG_AREA = {"22":642,"20":1020,"18":1624,"16":2583,"14":4107,"12":6530,"10":10380,"8":16510,"6":26240,"4":41740,"3":52620,"2":66360,"1":83690,"1/0":105600,"2/0":133100,"3/0":167800,"4/0":211600,"250":250000,"350":350000,"500":500000,"750":750000,"1000":1000000};
const BASE_RESISTIVITY = { cu: 0.017241, al: 0.028264 };
const TEMP_COEFF = { cu: 0.00393, al: 0.00403 };

// Tunable model parameters. These may be adjusted by the calibration routine
// to better match published ampacity tables.
const modelParams = {
  // thermal resistance of a cable in air (°C·m/W)
  airThermalResistance: 3.4,
  // insulation thermal conductivity when no value is supplied (W/m·°C)
  insulationThermalConductivity: 0.3,
  // baseline duct thermal resistance values (°C·m/W)
  defaultDuctRthPVC: 0.1,
  defaultDuctRthSteel: 0.08,
  // multiplier on IEEE 835 soil thermal resistance formula
  soilThermalResistanceFactor: 8.2
};
const RESISTANCE_TABLE = { cu: {}, al: {} };
for (const sz in AWG_AREA) {
  const areaMM2 = AWG_AREA[sz] * 0.0005067;
  RESISTANCE_TABLE.cu[sz] = BASE_RESISTIVITY.cu / areaMM2;
  RESISTANCE_TABLE.al[sz] = BASE_RESISTIVITY.al / areaMM2;
}

function normalizeSizeKey(size) {
  const s = size ? size.toString().trim() : '';
  if (conductorProps[s]) return s;
  const alt = s.replace(/^#/, '');
  if (conductorProps[alt]) return alt;
  return s;
}

function sizeToArea(size) {
  if (!size) return 0;
  let s = size.toString().trim();
  if (conductorProps[s]) return conductorProps[s].area_cm;
  s = s.replace(/^#/, '');
  if (/kcmil/i.test(s)) return parseFloat(s) * 1000;
  const m = s.match(/(\d+(?:\/0)?)/);
  if (!m) return 0;
  return AWG_AREA[m[1]] || 0;
}

function dcResistance(size, material, temp = 20) {
  const key = normalizeSizeKey(size);
  const mat = material && material.toLowerCase().includes('al') ? 'al' : 'cu';
  let base;
  const props = conductorProps[key];
  if (props) {
    base = mat === 'al' ? props.rdc_al : props.rdc_cu;
  } else {
    base = RESISTANCE_TABLE[mat][key];
    if (base === undefined) {
      const areaCM = sizeToArea(size);
      if (!areaCM) return 0;
      const areaMM2 = areaCM * 0.0005067;
      base = BASE_RESISTIVITY[mat] / areaMM2;
    }
  }
  return base * (1 + TEMP_COEFF[mat] * (temp - 20));
}

function skinEffect(size) {
  const area = sizeToArea(size) / 1000;
  if (!area) return 0;
  const table = [
    [0, 0], [100, 0], [250, 0.05], [500, 0.1],
    [1000, 0.15], [2000, 0.2]
  ];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1];
    const b = table[i];
    if (area <= b[0]) {
      const t = (area - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return table[table.length - 1][1];
}

function dielectricRise(voltage) {
  const v = (parseFloat(voltage) || 0) / 1000;
  const table = [
    [0, 0], [2, 0], [5, 5], [15, 10], [25, 15], [35, 20]
  ];
  if (v <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1];
    const b = table[i];
    if (v <= b[0]) {
      const t = (v - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return table[table.length - 1][1];
}

function conductorThermalResistance(cable) {
  const key = normalizeSizeKey(cable.conductor_size);
  const props = conductorProps[key];
  if (!props) throw new Error('Invalid conductor size: ' + cable.conductor_size);
  const areaM2 = props.area_cm * 5.067e-10;
  const r = Math.sqrt(areaM2 / Math.PI);
  const t = (parseFloat(cable.insulation_thickness) || props.insulation_thickness || 0) * 0.0254;
  const r_i = r;
  const r_o = r + t;
  const r_ie = r * 0.001;
  const kCond = cable.conductor_material && cable.conductor_material.toLowerCase().includes('al') ? 237 : 401;
  const kIns = parseFloat(cable.insulation_k) || modelParams.insulationThermalConductivity;
  const Rcond = Math.log(r_i / r_ie) / (2 * Math.PI * kCond);
  const Rins = Math.log(r_o / r_i) / (2 * Math.PI * kIns);
  return { Rcond, Rins };
}


function calcRcaComponents(cable, params = {}) {
  const { Rcond, Rins } = conductorThermalResistance(cable);
  let Rduct = 0;
  let Rsoil = 0;
  if (params.medium === 'air') {
    Rduct = modelParams.airThermalResistance;
  } else {
    const mat = (params.conduit_type || '').includes('PVC') ? 'PVC' : 'steel';
    const tables = {
      PVC: { "4": 0.08 },
      steel: { "4": 0.055 }
    };
    const base = tables[mat] && tables[mat][params.trade_size];
    if (base !== undefined) {
      Rduct = base;
    } else {
      Rduct = mat === 'PVC' ? modelParams.defaultDuctRthPVC
                            : modelParams.defaultDuctRthSteel;
    }
    let rho = params.soilResistivity || 90;
    rho = Math.min(150, Math.max(40, rho));
    const rho_m = rho / 100;
    const burial = (params.ductbankDepth || 0) * 0.0254;
    const D = params.conduit_diameter || 0.1;
    if (burial > 0 && D > 0) {
      Rsoil = modelParams.soilThermalResistanceFactor *
              (rho_m / (2 * Math.PI)) * Math.log(4 * burial / D);
    }
  }
  const Rca = Rcond + Rins + Rduct + Rsoil;
  return { Rcond, Rins, Rduct, Rsoil, Rca };
}

function ampacity(cable, params = {}) {
  const Tc = parseFloat(cable.insulation_rating || 90);
  const Ta = params.ambient || 30;
  const Rdc = dcResistance(cable.conductor_size, cable.conductor_material, Tc);
  const Yc = skinEffect(cable.conductor_size);
  const dTd = dielectricRise(cable.voltage_rating || 600);
  const comps = calcRcaComponents(cable, params);
  const I = Math.sqrt((Tc - (Ta + dTd)) / (Rdc * (1 + Yc) * comps.Rca));
  return { ampacity: I, components: comps };
}

function getModelParams() {
  return { ...modelParams };
}

function setModelParams(overrides = {}) {
  Object.assign(modelParams, overrides);
}

function calibrateAmpacityModel() {
  const targets = [
    {
      cable: { conductor_size: '4/0 AWG', conductor_material: 'Copper', insulation_rating: 90, voltage_rating: 600 },
      params: { medium: 'air' },
      reference: 260
    },
    {
      cable: { conductor_size: '500 kcmil', conductor_material: 'Copper', insulation_rating: 90, voltage_rating: 600 },
      params: { medium: 'air' },
      reference: 430
    },
    {
      cable: { conductor_size: '250 kcmil', conductor_material: 'Aluminum', insulation_rating: 75, voltage_rating: 600 },
      params: { medium: 'air' },
      reference: 215
    }
  ];

  let bestErr = Infinity;
  let best = getModelParams();
  for (let air = 3.0; air <= 3.8; air += 0.1) {
    for (let kIns = 0.26; kIns <= 0.34; kIns += 0.01) {
      for (let duct = 0.08; duct <= 0.12; duct += 0.01) {
        setModelParams({
          airThermalResistance: air,
          insulationThermalConductivity: kIns,
          defaultDuctRthPVC: duct,
          defaultDuctRthSteel: duct - 0.02
        });
        let maxErr = 0;
        for (const t of targets) {
          const I = ampacity(t.cable, t.params).ampacity;
          const err = Math.abs(I - t.reference) / t.reference;
          if (err > maxErr) maxErr = err;
        }
        if (maxErr < bestErr) {
          bestErr = maxErr;
          best = getModelParams();
        }
      }
    }
  }
  setModelParams(best);
  return { maxError: bestErr, params: getModelParams() };
}

export default {
  sizeToArea,
  dcResistance,
  skinEffect,
  dielectricRise,
  conductorThermalResistance,
  calcRcaComponents,
  ampacity,
  getModelParams,
  setModelParams,
  calibrateAmpacityModel,
};
