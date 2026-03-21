/**
 * Cable Tray Product Configurator
 *
 * Recommends cable tray type, NEMA load class, material, and finish based on
 * project inputs (cable weight, span, environment, application).  Generates a
 * structured specification suitable for inclusion in a project submittal.
 *
 * References:
 *   NEMA VE 1-2017 — Cable Tray Systems (load classes, dimensions, materials)
 *   NEMA FG 1-2014 — Fiberglass Cable Tray Systems
 *   NEMA VE 2-2013 — Cable Tray Installation Guidelines
 *   NEC Article 392 — Cable Trays
 *   ASTM A123  — Zinc (Hot-Dip Galvanized) Coatings on Iron and Steel
 *   ASTM A924  — General Requirements for Steel Sheet, Metallic-Coated
 */

// ---------------------------------------------------------------------------
// Catalogue data
// ---------------------------------------------------------------------------

/**
 * Standard inside widths (inches) per NEMA VE 1 Table 4.
 */
export const STANDARD_WIDTHS_IN = [6, 9, 12, 18, 24, 30, 36];

/**
 * Standard nominal side rail heights / usable cable space depths (inches).
 * Ladder and ventilated: 3, 4, or 6.  Solid-bottom: 2, 3, or 4.
 */
export const STANDARD_DEPTHS_IN = {
  ladder:       [3, 4, 6],
  ventilated:   [3, 4, 6],
  solidBottom:  [2, 3, 4],
  wireMesh:     [2, 3, 4],
  fiberglass:   [3, 4, 6],
};

/**
 * NEMA load classes with their rated working load (lbs/ft) at a 12-ft span.
 * Source: NEMA VE 1-2017 §4.
 */
export const NEMA_LOAD_CLASSES = {
  '8A':  { ratedLoad: 8,  ratedSpan: 12, label: 'Class 8A  (8 lbs/ft @ 12 ft)'  },
  '12A': { ratedLoad: 12, ratedSpan: 12, label: 'Class 12A (12 lbs/ft @ 12 ft)' },
  '16A': { ratedLoad: 16, ratedSpan: 12, label: 'Class 16A (16 lbs/ft @ 12 ft)' },
  '20A': { ratedLoad: 20, ratedSpan: 12, label: 'Class 20A (20 lbs/ft @ 12 ft)' },
  '25A': { ratedLoad: 25, ratedSpan: 12, label: 'Class 25A (25 lbs/ft @ 12 ft)' },
  '32A': { ratedLoad: 32, ratedSpan: 12, label: 'Class 32A (32 lbs/ft @ 12 ft)' },
};

/**
 * Material options with typical applications and finishes.
 */
export const MATERIALS = {
  aluminumAlloy: {
    label: 'Aluminum Alloy (6063-T6)',
    environments: ['indoorDry', 'indoorWet', 'outdoor'],
    notes: 'Lightweight, corrosion-resistant, no additional coating required for most environments. ' +
           'Not recommended for strongly alkaline or acidic atmospheres.',
    finishes: ['mill', 'anodized'],
    weightFactor: 1.0,  // relative weight factor (1 = baseline)
  },
  hotDipGalvanized: {
    label: 'Steel, Hot-Dip Galvanized (HDG, ASTM A123)',
    environments: ['indoorDry', 'indoorWet', 'outdoor'],
    notes: 'Most economical choice for indoor dry and general outdoor applications. ' +
           'Suitable for environments rated C3 (medium corrosivity) per ISO 9223.',
    finishes: ['hotDipGalvanized'],
    weightFactor: 1.5,
  },
  pregalvanized: {
    label: 'Steel, Pre-Galvanized (G90, ASTM A924)',
    environments: ['indoorDry'],
    notes: 'Interior, dry locations only.  Lighter zinc coating than HDG; less suitable for ' +
           'outdoor or wet locations.',
    finishes: ['pregalvanized', 'powderCoat'],
    weightFactor: 1.45,
  },
  stainless304: {
    label: 'Stainless Steel 304 (AISI 304)',
    environments: ['indoorDry', 'indoorWet', 'outdoor', 'corrosive'],
    notes: 'Suitable for food processing, pharmaceutical, and moderately corrosive environments. ' +
           'Use 316 for chloride exposure.',
    finishes: ['mill2B'],
    weightFactor: 1.6,
  },
  stainless316: {
    label: 'Stainless Steel 316L (AISI 316L)',
    environments: ['indoorWet', 'outdoor', 'corrosive'],
    notes: 'Best choice for marine, chemical, and high-chloride environments. ' +
           'Excellent resistance to pitting and crevice corrosion.',
    finishes: ['mill2B'],
    weightFactor: 1.65,
  },
  fiberglass: {
    label: 'Fiberglass Reinforced Plastic (FRP / NEMA FG 1)',
    environments: ['indoorWet', 'outdoor', 'corrosive'],
    notes: 'Non-conductive, non-magnetic. Required for high-corrosive environments, ' +
           'hazardous areas requiring non-sparking trays, and EMI-sensitive applications.',
    finishes: ['gelCoat'],
    weightFactor: 0.9,
  },
};

/**
 * Tray type definitions.
 * Application guidance per NEMA VE 1 and NEC 392.
 */
export const TRAY_TYPES = {
  ladder: {
    label: 'Ladder Tray',
    description: 'Open-top tray with two side rails connected by rungs. ' +
                 'Best airflow; preferred for power cables ≥ 4/0 AWG.',
    applications: ['power', 'communication', 'mixed'],
    necArticle: 'NEC 392.10(A)(1)',
    advantages: ['Maximum heat dissipation', 'Easy cable installation and maintenance',
                 'Widest NEMA load-class availability'],
    rungSpacing_in: [6, 9, 12],
  },
  ventilated: {
    label: 'Ventilated Trough / Channel Tray',
    description: 'Solid bottom with ventilation slots. Provides cable support ' +
                 'with partial ventilation. Suitable for mixed cable types.',
    applications: ['control', 'instrumentation', 'mixed'],
    necArticle: 'NEC 392.10(A)(3)',
    advantages: ['Better cable support than ladder for small cables',
                 'More ventilation than solid-bottom',
                 'Reduces cable damage at rung crossings'],
    rungSpacing_in: [],
  },
  solidBottom: {
    label: 'Solid-Bottom Tray',
    description: 'Enclosed bottom without openings. Provides EMI shielding ' +
                 'and protection for sensitive instrumentation cables.',
    applications: ['instrumentation', 'communication', 'control'],
    necArticle: 'NEC 392.10(A)(2)',
    advantages: ['EMI/RFI shielding', 'Protection from drips and contaminants',
                 'Required segregation between power and instrument cables (NEMA VE 2)'],
    rungSpacing_in: [],
  },
  wireMesh: {
    label: 'Wire Mesh / Cable Basket',
    description: 'Welded wire grid construction. Very lightweight; ' +
                 'popular for data centres and light-duty applications.',
    applications: ['communication', 'data', 'lightDuty'],
    necArticle: 'NEC 392.10(A)(4)',
    advantages: ['Lowest weight', 'Easy field modification',
                 'Excellent visibility for cable identification'],
    rungSpacing_in: [],
  },
  fiberglass: {
    label: 'Fiberglass (FRP) Ladder Tray',
    description: 'Glass-fibre-reinforced polyester or vinyl ester ladder tray ' +
                 'per NEMA FG 1. Non-conductive and non-magnetic.',
    applications: ['corrosive', 'hazardous', 'marine'],
    necArticle: 'NEC 392.10(A)(1) + NEMA FG 1',
    advantages: ['Non-conductive (no bonding/grounding of tray)', 'Chemical resistance',
                 'Non-sparking in hazardous locations'],
    rungSpacing_in: [6, 9, 12],
  },
};

// ---------------------------------------------------------------------------
// Recommendation engine
// ---------------------------------------------------------------------------

/**
 * Calculate the minimum effective load per foot on the tray for a given
 * cable weight and actual support span.
 *
 * For a simple span, the equivalent uniform load that produces the same
 * midpoint deflection as the rated test condition scales as:
 *   w_min ≤ w_rated × (L_rated / L_actual)³
 *
 * Rearranging: required w_rated ≥ w_actual × (L_actual / L_rated)³
 *
 * @param {number} cableWeightLbFt  Total cable weight per linear foot (lbs/ft)
 * @param {number} spanFt           Required support span in feet
 * @returns {number}  Minimum rated load class working load needed (lbs/ft)
 */
export function requiredRatedLoad(cableWeightLbFt, spanFt) {
  if (cableWeightLbFt < 0) throw new Error('cableWeightLbFt must be ≥ 0');
  if (spanFt <= 0) throw new Error('spanFt must be positive');
  // Use 12 ft as the reference span (all NEMA standard classes)
  const L_rated = 12;
  return cableWeightLbFt * Math.pow(spanFt / L_rated, 3);
}

/**
 * Select the minimum-sufficient NEMA load class for a given required rated load.
 *
 * @param {number} requiredLoad  Minimum rated load (lbs/ft) needed
 * @returns {{ classId: string, def: object }|null}  Matching class, or null if none sufficient
 */
export function selectLoadClass(requiredLoad) {
  const classes = Object.entries(NEMA_LOAD_CLASSES).sort(
    ([, a], [, b]) => a.ratedLoad - b.ratedLoad
  );
  for (const [classId, def] of classes) {
    if (def.ratedLoad >= requiredLoad) return { classId, def };
  }
  return null;  // exceeds max class — custom fabrication needed
}

/**
 * Recommend material(s) suitable for the installation environment.
 *
 * @param {'indoorDry'|'indoorWet'|'outdoor'|'corrosive'} environment
 * @returns {string[]}  Array of material keys in preference order
 */
export function recommendMaterials(environment) {
  return Object.entries(MATERIALS)
    .filter(([, m]) => m.environments.includes(environment))
    .map(([key]) => key);
}

/**
 * Recommend tray type(s) for a given application.
 *
 * @param {'power'|'control'|'instrumentation'|'communication'|'data'|'mixed'|'corrosive'} application
 * @returns {string[]}  Tray type keys in preference order
 */
export function recommendTrayTypes(application) {
  return Object.entries(TRAY_TYPES)
    .filter(([, t]) => t.applications.includes(application))
    .map(([key]) => key);
}

/**
 * Select the minimum standard tray width to accommodate the total cable fill.
 *
 * Uses the simplified NEC 392.22(A) approach:
 *   Allowed fill = 50% of the tray cross-sectional area (single-layer cables)
 *   Total cable cross-section = Σ (π/4 × OD²) per cable
 *
 * @param {number} totalCableCsaIn2   Sum of cable cross-sections (sq in)
 * @param {number} depthIn            Tray nominal depth (inches)
 * @param {number} [fillFraction=0.5] NEC fill fraction (default 50%)
 * @returns {number}  Minimum standard width in inches, or -1 if none sufficient
 */
export function selectMinWidth(totalCableCsaIn2, depthIn, fillFraction = 0.5) {
  if (totalCableCsaIn2 < 0) throw new Error('totalCableCsaIn2 must be ≥ 0');
  if (depthIn <= 0) throw new Error('depthIn must be positive');
  if (fillFraction <= 0 || fillFraction > 1) throw new Error('fillFraction must be in (0, 1]');

  for (const w of STANDARD_WIDTHS_IN) {
    const allowedFill = w * depthIn * fillFraction;
    if (totalCableCsaIn2 <= allowedFill) return w;
  }
  return -1;  // no standard width sufficient
}

// ---------------------------------------------------------------------------
// Main configurator
// ---------------------------------------------------------------------------

/**
 * Run the full product configurator and return a structured recommendation.
 *
 * @param {object} inputs
 * @param {number}  inputs.cableWeightLbFt   Total cable weight per linear foot (lbs/ft)
 * @param {number}  inputs.spanFt            Required support span (ft)
 * @param {number}  inputs.totalCableCsaIn2  Total cable cross-sectional area (sq in)
 * @param {'indoorDry'|'indoorWet'|'outdoor'|'corrosive'} inputs.environment
 * @param {'power'|'control'|'instrumentation'|'communication'|'data'|'mixed'|'corrosive'} inputs.application
 * @param {number}  [inputs.depthIn=4]       Preferred tray depth (in)
 * @param {number}  [inputs.fillFraction=0.5] NEC fill fraction
 *
 * @returns {ConfigResult}
 */
export function configure(inputs) {
  const {
    cableWeightLbFt,
    spanFt,
    totalCableCsaIn2,
    environment,
    application,
    depthIn = 4,
    fillFraction = 0.5,
  } = inputs;

  // Validate
  if (typeof cableWeightLbFt !== 'number' || cableWeightLbFt < 0)
    throw new Error('cableWeightLbFt must be a non-negative number');
  if (typeof spanFt !== 'number' || spanFt <= 0)
    throw new Error('spanFt must be a positive number');
  if (typeof totalCableCsaIn2 !== 'number' || totalCableCsaIn2 < 0)
    throw new Error('totalCableCsaIn2 must be a non-negative number');
  if (!MATERIALS[environment] === undefined && !['indoorDry','indoorWet','outdoor','corrosive'].includes(environment))
    throw new Error(`Unknown environment: ${environment}`);

  // 1. Load class
  const reqLoad = requiredRatedLoad(cableWeightLbFt, spanFt);
  const loadClassResult = selectLoadClass(reqLoad);
  const loadClassExceeded = loadClassResult === null;
  const loadClassId = loadClassResult ? loadClassResult.classId : '32A';
  const loadClassDef = loadClassResult ? loadClassResult.def : NEMA_LOAD_CLASSES['32A'];

  // 2. Width
  const widthIn = selectMinWidth(totalCableCsaIn2, depthIn, fillFraction);

  // 3. Tray types
  const trayTypeKeys = recommendTrayTypes(application);
  // Override to fiberglass if environment is corrosive
  const primaryTrayKey = environment === 'corrosive'
    ? 'fiberglass'
    : (trayTypeKeys[0] || 'ladder');
  const primaryTray = TRAY_TYPES[primaryTrayKey];

  // 4. Materials
  const materialKeys = recommendMaterials(environment);
  // Prefer fiberglass for corrosive
  const primaryMaterialKey = environment === 'corrosive' ? 'fiberglass' : materialKeys[0];
  const primaryMaterial = MATERIALS[primaryMaterialKey];

  // 5. Specification text
  const specText = buildSpecText({
    trayKey: primaryTrayKey,
    tray: primaryTray,
    materialKey: primaryMaterialKey,
    material: primaryMaterial,
    loadClassId,
    loadClassDef,
    widthIn: widthIn > 0 ? widthIn : 36,
    depthIn,
    spanFt,
  });

  return {
    // Inputs echo
    inputs: { cableWeightLbFt, spanFt, totalCableCsaIn2, environment, application, depthIn, fillFraction },

    // Load class
    loadClass: {
      id: loadClassId,
      def: loadClassDef,
      requiredRatedLoad: Math.round(reqLoad * 100) / 100,
      exceeded: loadClassExceeded,
    },

    // Tray geometry
    geometry: {
      widthIn: widthIn > 0 ? widthIn : -1,
      widthInsufficient: widthIn < 0,
      depthIn,
      fillFraction,
      allowedFillIn2: widthIn > 0 ? Math.round(widthIn * depthIn * fillFraction * 100) / 100 : 0,
    },

    // Recommendations
    trayType: {
      primary: { key: primaryTrayKey, ...primaryTray },
      alternates: trayTypeKeys.filter(k => k !== primaryTrayKey).map(k => ({ key: k, ...TRAY_TYPES[k] })),
    },
    material: {
      primary: { key: primaryMaterialKey, ...primaryMaterial },
      alternates: materialKeys.filter(k => k !== primaryMaterialKey).map(k => ({ key: k, ...MATERIALS[k] })),
    },

    // Generated spec
    specificationText: specText,
  };
}

/**
 * Build a short specification paragraph for insertion into a project submittal.
 * @private
 */
function buildSpecText({ trayKey, tray, materialKey, material, loadClassId, loadClassDef, widthIn, depthIn, spanFt }) {
  const finish = material.finishes[0];
  const finishLabel = {
    mill: 'mill finish',
    anodized: 'anodized',
    hotDipGalvanized: 'hot-dip galvanized (ASTM A123)',
    pregalvanized: 'pre-galvanized G90 (ASTM A924)',
    powderCoat: 'powder coat',
    mill2B: '2B mill finish',
    gelCoat: 'gel coat',
  }[finish] || finish;

  return [
    `Cable tray shall be ${tray.label} type, ${widthIn}-inch inside width × ` +
    `${depthIn}-inch depth, ${material.label}, ${finishLabel}.`,
    `NEMA load class: ${loadClassId} (${loadClassDef.ratedLoad} lbs/ft at ${loadClassDef.ratedSpan}-ft span).`,
    `Maximum support span: ${spanFt} ft.`,
    `Cable tray system shall comply with NEMA VE 1-2017 and NEC Article 392.`,
    material.notes ? `Material note: ${material.notes}` : '',
  ].filter(Boolean).join('  ');
}
