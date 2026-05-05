/**
 * Embodied Carbon / Sustainability Footprint — Gap #85
 *
 * Calculates cradle-to-gate embodied CO₂e (Scope 3) from project BOM and
 * capitalised operating CO₂e (Scope 2) from annual I²R losses over the
 * project lifetime.
 *
 * Factor sources / methodology:
 *   Embodied factors: representative industry EPD averages per IEC/EN 15804
 *     (cradle-to-gate, A1–A3).  Values represent typical mid-range for common
 *     cable, tray, conduit, and electrical equipment types.  Item-level
 *     co2eKgPerUnit overrides take precedence when present.
 *   Operating losses: P_loss [kW] × 8 760 h/yr × gridFactor [kg CO₂e/kWh]
 *     × projectLifeYears, summed across all conductors whose losses are known.
 *   Grid emission factors: national average generation-mix values (2023–2024
 *     data, market-based) from IEA and EPA eGRID sources.
 *
 * Final designs must be verified against manufacturer-specific EPDs and the
 * project-specific grid emission factor before use in formal sustainability
 * reports or LEED / BREEAM submittals.
 */

// ---------------------------------------------------------------------------
// Grid emission factors (kg CO₂e per kWh of electricity consumed)
// ---------------------------------------------------------------------------

/**
 * National / regional average grid emission factors.
 * Source: IEA Emissions Factors 2023, EPA eGRID 2022 US national average.
 *
 * @type {Record<string, {label: string, kgPerKwh: number, source: string}>}
 */
export const GRID_EMISSION_FACTORS = {
  us:      { label: 'United States (national avg)',    kgPerKwh: 0.386, source: 'EPA eGRID 2022' },
  eu:      { label: 'European Union (avg)',            kgPerKwh: 0.233, source: 'IEA 2023' },
  uk:      { label: 'United Kingdom',                  kgPerKwh: 0.207, source: 'DESNZ 2023' },
  ca:      { label: 'Canada (national avg)',           kgPerKwh: 0.130, source: 'NRCAN 2022' },
  au:      { label: 'Australia (NEM avg)',             kgPerKwh: 0.510, source: 'DCCEEW 2023' },
  cn:      { label: 'China (national avg)',            kgPerKwh: 0.581, source: 'IEA 2023' },
  custom:  { label: 'Custom / project-specific',      kgPerKwh: 0.400, source: 'User-defined' },
};

// ---------------------------------------------------------------------------
// Embodied CO₂e factor library (A1–A3 cradle-to-gate)
// ---------------------------------------------------------------------------

/**
 * Cable embodied CO₂e factors in kg CO₂e per metre.
 *
 * Values represent typical LV power cables (Cu or Al conductor, XLPE/PVC
 * insulation, PVC outer jacket) based on published EPD averages from
 * manufacturers including Nexans, Prysmian, and Southwire.
 *
 * Keyed by conductor cross-section band (mm²) — covers common AWG/mm² sizes.
 * Use the closest size; linear interpolation is not required for screening.
 *
 * AWG to mm² approximate equivalents used for lookup:
 *   14 AWG ≈ 2.5 mm²  | 12 AWG ≈ 4 mm²   | 10 AWG ≈ 6 mm²
 *    8 AWG ≈ 10 mm²   |  6 AWG ≈ 16 mm²  |  4 AWG ≈ 25 mm²
 *    2 AWG ≈ 35 mm²   |  1 AWG ≈ 50 mm²  | 1/0 ≈ 55 mm²
 *   2/0 ≈ 70 mm²      | 3/0 ≈ 95 mm²     | 4/0 ≈ 120 mm²
 *  250 kcmil ≈ 127 mm² | 350 kcmil ≈ 177 mm² | 500 kcmil ≈ 253 mm²
 */
export const CABLE_CO2E = Object.freeze({
  //  mm²:  { Cu: kg/m,   Al: kg/m  }
  2.5:  { Cu: 0.110, Al: 0.065 },
  4:    { Cu: 0.155, Al: 0.090 },
  6:    { Cu: 0.210, Al: 0.120 },
  10:   { Cu: 0.310, Al: 0.175 },
  16:   { Cu: 0.450, Al: 0.250 },
  25:   { Cu: 0.640, Al: 0.355 },
  35:   { Cu: 0.870, Al: 0.480 },
  50:   { Cu: 1.160, Al: 0.635 },
  70:   { Cu: 1.530, Al: 0.835 },
  95:   { Cu: 1.980, Al: 1.080 },
  120:  { Cu: 2.430, Al: 1.325 },
  150:  { Cu: 2.960, Al: 1.615 },
  185:  { Cu: 3.540, Al: 1.930 },
  240:  { Cu: 4.450, Al: 2.430 },
  300:  { Cu: 5.340, Al: 2.910 },
  400:  { Cu: 6.850, Al: 3.740 },
  500:  { Cu: 8.300, Al: 4.530 },
  630:  { Cu: 10.30, Al: 5.620 },
});

/**
 * AWG size label → nearest mm² band for CO₂e lookup.
 */
export const AWG_TO_MM2 = Object.freeze({
  '14 AWG': 2.5,  '12 AWG': 4,    '10 AWG': 6,
  '8 AWG':  10,   '6 AWG':  16,   '4 AWG':  25,
  '2 AWG':  35,   '1 AWG':  50,   '1/0':    50,
  '1/0 AWG': 55,  '2/0':    70,   '2/0 AWG': 70,
  '3/0':    95,   '3/0 AWG': 95,  '4/0':    120,  '4/0 AWG': 120,
  '250 kcmil': 127, '300 kcmil': 152, '350 kcmil': 177,
  '400 kcmil': 203, '500 kcmil': 253, '600 kcmil': 304,
  '750 kcmil': 380,
});

/**
 * Cable tray embodied CO₂e in kg CO₂e per metre run.
 *
 * Steel values from Niedax, OBO, and B-Line EPDs (galvanised carbon steel).
 * Aluminium values are approximately 1.8× steel by mass, but Al production
 * is more energy-intensive — net ratio ~1.4× per metre for same load class.
 * FRP values from Enduro / Fibre-Glass Systems EPD ranges.
 *
 * Keyed by nominal tray width in inches.
 */
export const TRAY_CO2E = Object.freeze({
  //  width_in: { steel: kg/m, aluminum: kg/m, frp: kg/m }
  6:  { steel: 2.8,  aluminum: 3.2,  frp: 1.6 },
  9:  { steel: 3.4,  aluminum: 3.9,  frp: 1.9 },
  12: { steel: 4.1,  aluminum: 4.7,  frp: 2.3 },
  18: { steel: 5.6,  aluminum: 6.4,  frp: 3.2 },
  24: { steel: 7.2,  aluminum: 8.2,  frp: 4.0 },
  30: { steel: 8.8,  aluminum: 10.0, frp: 4.9 },
  36: { steel: 10.4, aluminum: 11.8, frp: 5.8 },
});

/**
 * Conduit embodied CO₂e in kg CO₂e per metre.
 *
 * Steel conduit: based on Atkore / ABB Thomas & Betts EPD typical values
 * (galvanised EMT, IMC, RGS).  PVC: based on Charlotte Pipe EPDs.
 *
 * Keyed by NEC trade size (in).
 */
export const CONDUIT_CO2E = Object.freeze({
  //  trade_size: { emt: kg/m, imc: kg/m, rgs: kg/m, pvc: kg/m }
  0.5:  { emt: 0.65,  imc: 0.95,  rgs: 1.20, pvc: 0.18 },
  0.75: { emt: 0.90,  imc: 1.30,  rgs: 1.65, pvc: 0.24 },
  1:    { emt: 1.20,  imc: 1.75,  rgs: 2.20, pvc: 0.31 },
  1.25: { emt: 1.55,  imc: 2.25,  rgs: 2.85, pvc: 0.40 },
  1.5:  { emt: 1.90,  imc: 2.70,  rgs: 3.40, pvc: 0.49 },
  2:    { emt: 2.55,  imc: 3.60,  rgs: 4.55, pvc: 0.65 },
  2.5:  { emt: 3.20,  imc: 4.55,  rgs: 5.75, pvc: 0.82 },
  3:    { emt: 3.90,  imc: 5.50,  rgs: 6.95, pvc: 0.99 },
  3.5:  { emt: 4.55,  imc: 6.45,  rgs: 8.15, pvc: 1.16 },
  4:    { emt: 5.25,  imc: 7.40,  rgs: 9.35, pvc: 1.33 },
});

/**
 * Equipment embodied CO₂e in kg CO₂e per unit (typical).
 *
 * These are screening-level estimates based on published lifecycle assessment
 * literature (ETH ecoinvent v3.9, Siemens Eco Declaration, ABB EPD ranges).
 * Equipment is highly variable — use item-level co2eKgPerUnit overrides for
 * named equipment when EPD data is available.
 *
 * Keyed by equipment category.
 */
export const EQUIPMENT_CO2E = Object.freeze({
  transformer_dist:    { label: 'Distribution Transformer (< 500 kVA)',   kgPerUnit: 450  },
  transformer_power:   { label: 'Power Transformer (500–5000 kVA)',        kgPerUnit: 2800 },
  transformer_large:   { label: 'Large Transformer (> 5 MVA)',             kgPerUnit: 9500 },
  switchgear_lv:       { label: 'LV Switchgear / MCC (per section)',       kgPerUnit: 380  },
  switchgear_mv:       { label: 'MV Switchgear (per breaker bay)',         kgPerUnit: 850  },
  breaker_lv:          { label: 'LV Circuit Breaker (< 2000 A)',           kgPerUnit: 28   },
  breaker_mv:          { label: 'MV Circuit Breaker',                      kgPerUnit: 120  },
  motor_lt:            { label: 'LV Motor (< 100 hp)',                     kgPerUnit: 180  },
  motor_ht:            { label: 'MV Motor (> 100 hp)',                     kgPerUnit: 650  },
  generator_diesel:    { label: 'Diesel Generator (per kW rated)',         kgPerUnit: 3.5  },
  ups_system:          { label: 'UPS / Battery System (per kWh rated)',    kgPerUnit: 80   },
  vfd:                 { label: 'Variable Frequency Drive (per kW rated)', kgPerUnit: 8    },
  panel_board:         { label: 'Panelboard / Load Center',                kgPerUnit: 95   },
  busway_per_m:        { label: 'Busway / Bus Duct (per metre)',           kgPerUnit: 12   },
  general:             { label: 'General Electrical Equipment',             kgPerUnit: 50   },
});

// ---------------------------------------------------------------------------
// CO₂e lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up the nearest cable CO₂e factor for a given conductor size and material.
 *
 * @param {string|number} sizeLabel - AWG string (e.g. "4 AWG") or mm² number
 * @param {'Cu'|'Al'} material - conductor material
 * @returns {{ kgPerM: number, mm2Used: number } | null}
 */
export function cableCO2eFactor(sizeLabel, material = 'Cu') {
  let targetMm2 = null;

  if (typeof sizeLabel === 'number') {
    targetMm2 = sizeLabel;
  } else if (typeof sizeLabel === 'string') {
    const awgKey = sizeLabel.trim();
    if (AWG_TO_MM2[awgKey] != null) {
      targetMm2 = AWG_TO_MM2[awgKey];
    } else {
      const numeric = parseFloat(sizeLabel);
      if (!isNaN(numeric)) targetMm2 = numeric;
    }
  }

  if (targetMm2 == null || targetMm2 <= 0) return null;

  const mat = material === 'Al' ? 'Al' : 'Cu';
  const sizes = Object.keys(CABLE_CO2E).map(Number).sort((a, b) => a - b);

  // Find nearest size (round up to be conservative)
  let mm2Used = sizes[sizes.length - 1];
  for (const s of sizes) {
    if (s >= targetMm2) { mm2Used = s; break; }
  }

  const entry = CABLE_CO2E[mm2Used];
  if (!entry || entry[mat] == null) return null;

  return { kgPerM: entry[mat], mm2Used };
}

/**
 * Look up tray CO₂e factor in kg/m for a given width and material.
 *
 * @param {number} widthIn - nominal tray width in inches
 * @param {'steel'|'aluminum'|'frp'} material
 * @returns {{ kgPerM: number, widthUsed: number } | null}
 */
export function trayCO2eFactor(widthIn, material = 'steel') {
  const widths = Object.keys(TRAY_CO2E).map(Number).sort((a, b) => a - b);
  let widthUsed = widths[widths.length - 1];
  for (const w of widths) {
    if (w >= widthIn) { widthUsed = w; break; }
  }
  const entry = TRAY_CO2E[widthUsed];
  const mat = ['steel', 'aluminum', 'frp'].includes(material) ? material : 'steel';
  if (!entry || entry[mat] == null) return null;
  return { kgPerM: entry[mat], widthUsed };
}

/**
 * Look up conduit CO₂e factor in kg/m for a given trade size and type.
 *
 * @param {number} tradeSizeIn - NEC trade size in inches (0.5 = 1/2")
 * @param {'emt'|'imc'|'rgs'|'pvc'} conduitType
 * @returns {{ kgPerM: number, sizeUsed: number } | null}
 */
export function conduitCO2eFactor(tradeSizeIn, conduitType = 'emt') {
  const sizes = Object.keys(CONDUIT_CO2E).map(Number).sort((a, b) => a - b);
  let sizeUsed = sizes[sizes.length - 1];
  for (const s of sizes) {
    if (s >= tradeSizeIn) { sizeUsed = s; break; }
  }
  const entry = CONDUIT_CO2E[sizeUsed];
  const ct = ['emt', 'imc', 'rgs', 'pvc'].includes(conduitType) ? conduitType : 'emt';
  if (!entry || entry[ct] == null) return null;
  return { kgPerM: entry[ct], sizeUsed };
}

// ---------------------------------------------------------------------------
// Embodied CO₂e — BOM roll-up
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id?: string,
 *   type: 'cable'|'tray'|'conduit'|'equipment',
 *   quantity: number,         // metres for cable/tray/conduit; units for equipment
 *   conductors?: number,      // number of conductors in cable (default 1 per BOM entry)
 *   size?: string|number,     // AWG string or mm² number (for cable)
 *   material?: string,        // conductor material (cable) or tray/conduit material
 *   widthIn?: number,         // tray width in inches
 *   tradeSizeIn?: number,     // conduit trade size
 *   category?: string,        // equipment CO₂e category key
 *   co2eKgPerUnit?: number,   // EPD override — kg CO₂e per metre or per unit
 *   epdSource?: string,
 * }} BomItem
 */

/**
 * @typedef {{
 *   id?: string,
 *   type: string,
 *   quantity: number,
 *   co2eKgPerUnit: number,
 *   subtotalKg: number,
 *   source: 'override'|'library',
 *   factorNote: string,
 * }} CO2eLine
 */

/**
 * Calculate embodied CO₂e for a BOM array.
 *
 * Items with a `co2eKgPerUnit` field use that as the factor (EPD override).
 * Otherwise the built-in library is used.  Items whose size/material/category
 * cannot be resolved are added to `skippedItems[]`.
 *
 * For cable, `quantity` is the cable length in metres and `conductors` is the
 * number of current-carrying conductors.  The factor from CABLE_CO2E already
 * represents a single-conductor metre; multiply by conductors when relevant.
 *
 * @param {BomItem[]} bom
 * @returns {{ lines: CO2eLine[], totalKg: number, skippedItems: Array<{id?:string,reason:string}> }}
 */
export function embodiedCO2e(bom = []) {
  const lines = [];
  const skippedItems = [];

  for (const item of bom) {
    const id = item.id || undefined;
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) {
      skippedItems.push({ id, reason: 'Zero or missing quantity' });
      continue;
    }

    // --- EPD override ---
    if (item.co2eKgPerUnit != null) {
      const factor = Number(item.co2eKgPerUnit);
      if (!isFinite(factor) || factor < 0) {
        skippedItems.push({ id, reason: 'Invalid co2eKgPerUnit override value' });
        continue;
      }
      lines.push({
        id,
        type: item.type || 'unknown',
        quantity: qty,
        co2eKgPerUnit: factor,
        subtotalKg: qty * factor,
        source: 'override',
        factorNote: item.epdSource ? `EPD: ${item.epdSource}` : 'EPD override',
      });
      continue;
    }

    // --- Library lookup by type ---
    const type = String(item.type || '').toLowerCase();

    if (type === 'cable') {
      const f = cableCO2eFactor(item.size, item.material);
      if (!f) {
        skippedItems.push({ id, reason: `Cable size/material not found in library: size=${item.size} material=${item.material}` });
        continue;
      }
      const conductors = Math.max(1, Number(item.conductors) || 1);
      const factor = f.kgPerM * conductors;
      lines.push({
        id,
        type: 'cable',
        quantity: qty,
        co2eKgPerUnit: factor,
        subtotalKg: qty * factor,
        source: 'library',
        factorNote: `${item.material || 'Cu'} ${f.mm2Used} mm² × ${conductors}c — CABLE_CO2E`,
      });
      continue;
    }

    if (type === 'tray') {
      const f = trayCO2eFactor(item.widthIn, item.material);
      if (!f) {
        skippedItems.push({ id, reason: `Tray width/material not found: widthIn=${item.widthIn} material=${item.material}` });
        continue;
      }
      lines.push({
        id,
        type: 'tray',
        quantity: qty,
        co2eKgPerUnit: f.kgPerM,
        subtotalKg: qty * f.kgPerM,
        source: 'library',
        factorNote: `${f.widthUsed}" ${item.material || 'steel'} tray — TRAY_CO2E`,
      });
      continue;
    }

    if (type === 'conduit') {
      const f = conduitCO2eFactor(item.tradeSizeIn, item.material);
      if (!f) {
        skippedItems.push({ id, reason: `Conduit size/type not found: tradeSizeIn=${item.tradeSizeIn} material=${item.material}` });
        continue;
      }
      lines.push({
        id,
        type: 'conduit',
        quantity: qty,
        co2eKgPerUnit: f.kgPerM,
        subtotalKg: qty * f.kgPerM,
        source: 'library',
        factorNote: `${f.sizeUsed}" ${item.material || 'emt'} conduit — CONDUIT_CO2E`,
      });
      continue;
    }

    if (type === 'equipment') {
      const catKey = item.category || 'general';
      const cat = EQUIPMENT_CO2E[catKey];
      if (!cat) {
        skippedItems.push({ id, reason: `Equipment category not found: category=${catKey}` });
        continue;
      }
      lines.push({
        id,
        type: 'equipment',
        quantity: qty,
        co2eKgPerUnit: cat.kgPerUnit,
        subtotalKg: qty * cat.kgPerUnit,
        source: 'library',
        factorNote: `${cat.label} — EQUIPMENT_CO2E`,
      });
      continue;
    }

    skippedItems.push({ id, reason: `Unknown BOM item type: "${item.type}"` });
  }

  const totalKg = lines.reduce((s, l) => s + l.subtotalKg, 0);
  return { lines, totalKg, skippedItems };
}

// ---------------------------------------------------------------------------
// Operating CO₂e — lifetime energy losses
// ---------------------------------------------------------------------------

/**
 * Calculate operating (Scope 2) CO₂e from annual I²R losses capitalised over
 * the project lifetime.
 *
 * @param {number} lossesKw          - annual average I²R losses in kW
 * @param {number} gridFactorKgPerKwh - grid emission factor (kg CO₂e / kWh)
 * @param {number} projectLifeYears   - project design life (years)
 * @returns {{ annualKwh: number, lifetimeKwh: number, lifetimeKgCO2e: number }}
 */
export function operatingCO2e(lossesKw, gridFactorKgPerKwh, projectLifeYears) {
  const kw   = Math.max(0, Number(lossesKw)             || 0);
  const gf   = Math.max(0, Number(gridFactorKgPerKwh)   || 0);
  const life = Math.max(0, Number(projectLifeYears)      || 0);

  const annualKwh   = kw * 8760;
  const lifetimeKwh = annualKwh * life;
  const lifetimeKgCO2e = lifetimeKwh * gf;

  return { annualKwh, lifetimeKwh, lifetimeKgCO2e };
}

// ---------------------------------------------------------------------------
// Unified report builder
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   gridRegion?: string,            // key into GRID_EMISSION_FACTORS (default 'us')
 *   gridFactorKgPerKwh?: number,    // custom override; takes precedence over gridRegion
 *   projectLifeYears?: number,      // default 25
 *   lossesKw?: number,              // annual average conductor losses in kW (optional)
 *   alternative?: BomItem[],        // second BOM for comparison (optional)
 * }} SustainabilityOptions
 */

/**
 * Assemble a complete sustainability footprint report.
 *
 * @param {BomItem[]} bom
 * @param {SustainabilityOptions} [options]
 * @returns {{
 *   embodied: { lines: CO2eLine[], totalKg: number, skippedItems: any[] },
 *   operating: { annualKwh: number, lifetimeKwh: number, lifetimeKgCO2e: number } | null,
 *   totalKg: number,
 *   totalTonnes: number,
 *   gridRegion: string,
 *   gridFactorKgPerKwh: number,
 *   projectLifeYears: number,
 *   alternativeComparison: object | null,
 * }}
 */
export function buildSustainabilityReport(bom = [], options = {}) {
  const gridRegion = options.gridRegion || 'us';
  const gridDef    = GRID_EMISSION_FACTORS[gridRegion] || GRID_EMISSION_FACTORS.us;
  const gridFactor = (options.gridFactorKgPerKwh != null && isFinite(options.gridFactorKgPerKwh))
    ? Number(options.gridFactorKgPerKwh)
    : gridDef.kgPerKwh;
  const projectLifeYears = Math.max(1, Number(options.projectLifeYears) || 25);

  const embodied = embodiedCO2e(bom);

  let operating = null;
  if (options.lossesKw != null && Number(options.lossesKw) > 0) {
    operating = operatingCO2e(options.lossesKw, gridFactor, projectLifeYears);
  }

  const operatingKg = operating ? operating.lifetimeKgCO2e : 0;
  const totalKg     = embodied.totalKg + operatingKg;
  const totalTonnes = totalKg / 1000;

  let alternativeComparison = null;
  if (Array.isArray(options.alternative) && options.alternative.length > 0) {
    const altEmbodied = embodiedCO2e(options.alternative);
    const altTotal    = altEmbodied.totalKg + operatingKg;
    alternativeComparison = {
      embodiedKg:  altEmbodied.totalKg,
      totalKg:     altTotal,
      totalTonnes: altTotal / 1000,
      deltaKg:     altTotal - totalKg,
      skippedItems: altEmbodied.skippedItems,
    };
  }

  return {
    embodied,
    operating,
    totalKg,
    totalTonnes,
    gridRegion,
    gridFactorKgPerKwh: gridFactor,
    projectLifeYears,
    alternativeComparison,
  };
}
