/**
 * Lightning & Surge Protection Coordination (Gap #86)
 *
 * Screening-level lightning protection informed by IEC 62305:2024
 * (structural LPS) and IEEE 998-2026 (substation shielding), plus
 * medium/high-voltage surge-arrester screening per IEEE C62.22 /
 * IEC 60099-5:2018.
 *
 * Workflow:
 *   1. Lightning ground strike-point density from a direct value or a legacy
 *      keraunic-level screening estimate.
 *   2. Equivalent collection area Ad of the structure (screening geometry).
 *   3. Expected direct strikes Nd = Ng · Ad · Cd · 1e-6  (per year).
 *   4. Required Lightning Protection Level (LPL) from the protection-efficiency
 *      table (IEC 61024-1 / 62305): E = 1 − Nc/Nd.
 *   5. Rolling-sphere radius for the LPL and single-mast protective radius
 *      (electrogeometric model, IEEE 998 / IEC 62305-3:2024 Annex D).
 *   6. Down-conductor count and minimum cross-section (IEC 62305-3).
 *   7. Surge-arrester continuous operating voltage (MCOV) and rated voltage.
 *
 * Units: metres, kA, kV, m²; areas in m², frequencies per year.
 *
 * References:
 *   IEC 62305-1/-2/-3 — Protection against lightning.
 *   IEEE Std 998 — Guide for Direct Lightning Stroke Shielding of Substations.
 *   IEEE Std C62.22 / IEC 60099-5 — Application of surge arresters.
 */

/** Tolerable risk default — acceptable strike frequency Nc (per year). */
import { buildLightningProtectionBom } from './lightningProtectionBom.mjs';

export const DEFAULT_NC = 1e-3;

/**
 * Lightning Protection Levels (IEC 62305). Rolling-sphere radius (m),
 * minimum peak current captured Imin (kA), down-conductor spacing (m),
 * and the interception probability of the rolling sphere.
 */
export const LPL_TABLE = {
  I:   { label: 'I',   radius: 20, iMin: 3,  downSpacing: 10, interception: 0.99 },
  II:  { label: 'II',  radius: 30, iMin: 5,  downSpacing: 10, interception: 0.97 },
  III: { label: 'III', radius: 45, iMin: 10, downSpacing: 15, interception: 0.91 },
  IV:  { label: 'IV',  radius: 60, iMin: 16, downSpacing: 20, interception: 0.84 },
};

/** Minimum down-conductor cross-section by material (mm²), IEC 62305-3 Table 6. */
export const DOWN_CONDUCTOR_MIN_MM2 = { copper: 16, aluminum: 25, steel: 50 };

/** UL 96A / NFPA 780-style installation coordination reference. */
export const LIGHTNING_CONDUCTOR_MIN_BEND_RADIUS_M = 0.2032;
export const NFPA_UL_MAX_TERMINAL_SPACING_M = 6.096;
export const NFPA_UL_MAX_TERMINAL_EDGE_DISTANCE_M = 0.6096;
export const NFPA_UL_MIN_TERMINAL_RISE_M = 0.254;
export const NFPA_UL_MAX_CONDUCTOR_SUPPORT_SPACING_M = 0.9144;
export const NFPA_UL_CLASS_II_HEIGHT_M = 22.86;
export const NFPA_UL_MAX_DOWN_CONDUCTOR_SPACING_M = 30.48;

const DOWN_CONDUCTOR_SPACING_RATIO_TOLERANCE = 1e-4;

/** Screening location factor Cd retained from the legacy simplified method. */
export const LOCATION_FACTORS = {
  surroundedTaller: 0.25,  // object surrounded by taller objects
  surroundedEqual: 0.5,    // surrounded by equal/shorter objects
  isolated: 1.0,           // isolated, no nearby objects
  hilltop: 2.0,            // isolated on a hilltop or knoll
};

/** Standard surge-arrester duty-cycle voltage ratings (kV rms). */
export const STANDARD_ARRESTER_KV = [
  3, 6, 9, 10, 12, 15, 18, 21, 24, 27, 30, 36, 39, 45, 48, 54, 60, 72, 90, 96,
  108, 120, 144, 168, 180, 192, 228, 240, 258, 276, 294, 312, 396, 420, 444, 468, 540, 576,
];

/** IEEE C62.22 / IEC 60099-5 arrester screening is not for low-voltage SPDs. */
export const MIN_ARRESTER_SYSTEM_KV = 1;

export const STRUCTURE_SHAPES = Object.freeze({
  rectangle: 'Rectangular',
  circle: 'Circular / cylindrical',
  custom: 'Custom footprint',
});

export const PROTECTION_METHODS = Object.freeze({
  single: 'Single centered mast',
  'roof-array': 'Roof air-terminal array',
});

// ---------------------------------------------------------------------------
// Ground flash density and collection area
// ---------------------------------------------------------------------------

/**
 * Legacy screening estimate of ground flash density from keraunic level.
 * Prefer a directly supplied lightning ground strike-point density for
 * IEC 62305-2:2024 work.
 * @param {number} thunderstormDays - Td (days/yr)
 * @returns {number} Ng (flashes/km²/yr)
 */
export function groundFlashDensity(thunderstormDays) {
  if (!(thunderstormDays > 0)) return 0;
  return 0.04 * Math.pow(thunderstormDays, 1.25);
}

/**
 * Equivalent collection area of an isolated rectangular structure for this
 * screening: Ad = L·W + 2·(3H)(L+W) + π·(3H)²  (m²).
 * @param {number} length - L (m)
 * @param {number} width - W (m)
 * @param {number} height - H (m)
 * @returns {number} Collection area (m²)
 */
export function collectionArea(length, width, height) {
  const L = length, W = width, H = height;
  return collectionAreaFromFootprint(L * W, 2 * (L + W), H);
}

/**
 * Equivalent collection area from a plan footprint and its perimeter.
 * This is the area of the footprint expanded horizontally by 3H:
 * Ad = Af + (3H)P + pi(3H)^2.
 * @param {number} footprintAreaM2 - Plan area Af (m2)
 * @param {number} perimeterM - Plan perimeter P (m)
 * @param {number} heightM - Structure height H (m)
 * @returns {number} Collection area (m2)
 */
export function collectionAreaFromFootprint(footprintAreaM2, perimeterM, heightM) {
  return footprintAreaM2 + 3 * heightM * perimeterM + Math.PI * Math.pow(3 * heightM, 2);
}

/**
 * Resolve the plan geometry used by collection-area, down-conductor, and
 * centered single-mast coverage checks.
 * @param {Object} config
 * @returns {{shape:string,label:string,areaM2:number,perimeterM:number,spanXM:number,spanYM:number,requiredCoverageRadiusM:number}}
 */
export function resolveFootprintGeometry(config = {}) {
  const shape = Object.hasOwn(STRUCTURE_SHAPES, config.structureShape)
    ? config.structureShape
    : 'rectangle';

  if (shape === 'circle') {
    const diameter = Number(config.diameter);
    if (!(diameter > 0)) {
      throw new Error('Enter a positive structure diameter.');
    }
    const radius = diameter / 2;
    return {
      shape,
      label: STRUCTURE_SHAPES[shape],
      areaM2: Math.PI * radius * radius,
      perimeterM: Math.PI * diameter,
      spanXM: diameter,
      spanYM: diameter,
      requiredCoverageRadiusM: radius,
    };
  }

  if (shape === 'custom') {
    const areaM2 = Number(config.footprintArea);
    const perimeterM = Number(config.footprintPerimeter);
    const requiredCoverageRadiusM = Number(config.farthestPointRadius);
    if (!(areaM2 > 0) || !(perimeterM > 0)) {
      throw new Error('Enter a positive custom footprint area and perimeter.');
    }
    const maximumAreaForPerimeter = perimeterM * perimeterM / (4 * Math.PI);
    if (areaM2 > maximumAreaForPerimeter * 1.001) {
      throw new Error('Custom footprint area is too large for the entered perimeter.');
    }
    const equivalentRadius = Math.sqrt(areaM2 / Math.PI);
    if (!(requiredCoverageRadiusM >= equivalentRadius)) {
      throw new Error('Farthest protected point is too small for the entered footprint area.');
    }
    return {
      shape,
      label: STRUCTURE_SHAPES[shape],
      areaM2,
      perimeterM,
      spanXM: requiredCoverageRadiusM * 2,
      spanYM: requiredCoverageRadiusM * 2,
      requiredCoverageRadiusM,
    };
  }

  const length = Number(config.length);
  const width = Number(config.width);
  if (!(length > 0) || !(width > 0)) {
    throw new Error('Enter positive structure length and width.');
  }
  const result = {
    shape,
    label: STRUCTURE_SHAPES[shape],
    areaM2: length * width,
    perimeterM: 2 * (length + width),
    spanXM: length,
    spanYM: width,
    requiredCoverageRadiusM: Math.hypot(length / 2, width / 2),
  };
  return result;
}

/**
 * Expected number of direct strikes to the structure per year.
 * Nd = Ng · Ad · Cd · 1e-6  (Ng per km²; Ad in m² → 1e-6 converts m²→km²).
 * @param {number} ng - Ground flash density (per km²/yr)
 * @param {number} areaM2 - Collection area (m²)
 * @param {number} [cd=1] - Location factor
 * @returns {number} Strikes per year
 */
export function expectedStrikes(ng, areaM2, cd = 1) {
  return ng * areaM2 * cd * 1e-6;
}

// ---------------------------------------------------------------------------
// Protection level selection
// ---------------------------------------------------------------------------

/**
 * Recommend the least-restrictive LPL whose declared interception probability
 * meets the required screening efficiency E = 1 − Nc/Nd.
 *
 * @param {number} nd - Expected strikes per year
 * @param {number} [nc=DEFAULT_NC] - Tolerable strike frequency per year
 * @returns {{required:boolean, efficiency:number, level:(string|null), note:string}}
 */
export function recommendLPL(nd, nc = DEFAULT_NC) {
  if (!(nd > nc)) {
    return { required: false, efficiency: 0, level: null, note: 'Nd ≤ Nc — a dedicated LPS is not required (verify bonding and SPDs).' };
  }
  const efficiency = 1 - nc / nd;
  const level = ['IV', 'III', 'II', 'I']
    .find(key => LPL_TABLE[key].interception >= efficiency) || 'I';
  const capability = LPL_TABLE[level].interception;
  const note = efficiency > capability
    ? `LPL ${level} alone does not meet the ${Math.round(efficiency * 1000) / 10}% required efficiency; add risk-reduction measures.`
    : `LPL ${level} meets the screening efficiency requirement.`;
  return { required: true, efficiency, level, note };
}

// ---------------------------------------------------------------------------
// Rolling sphere / electrogeometric model
// ---------------------------------------------------------------------------

/**
 * Striking distance for a given peak current (IEEE 998): r = 10·I^0.65 (m).
 * @param {number} currentKa - Peak stroke current (kA)
 * @returns {number} Striking distance (m)
 */
export function strikingDistance(currentKa) {
  return 10 * Math.pow(currentKa, 0.65);
}

/**
 * Protective radius of a single vertical mast at a protected-object height,
 * by the rolling-sphere method (IEEE 998 / IEC 62305-3:2024 Annex D):
 *   rp = √(h(2R − h)) − √(hx(2R − hx)),  with h, hx ≤ R.
 * Heights above R are capped at R (no additional protection from a sphere
 * that rolls under the tip).
 *
 * @param {number} mastHeight - Mast/air-terminal height h (m)
 * @param {number} protectedHeight - Protected object height hx (m)
 * @param {number} sphereRadius - Rolling-sphere radius R (m)
 * @returns {number} Protective radius at the object height (m), ≥ 0
 */
export function singleMastRadius(mastHeight, protectedHeight, sphereRadius) {
  const R = sphereRadius;
  const h = Math.min(mastHeight, R);
  const hx = Math.min(Math.max(protectedHeight, 0), R);
  if (hx >= h) return 0;
  const rp = Math.sqrt(h * (2 * R - h)) - Math.sqrt(hx * (2 * R - hx));
  return Math.max(0, rp);
}

/**
 * Horizontal rolling-sphere coverage radius of one point terminal above a
 * horizontal roof or equipment plane.
 *
 * The reference plane is treated as z=0 and the terminal protrusion is p:
 *   rp = sqrt(p(2R - p)), with p capped at R.
 *
 * @param {number} terminalTipElevationM - Terminal tip elevation above grade.
 * @param {number} referencePlaneElevationM - Roof/equipment plane elevation.
 * @param {number} sphereRadiusM - Rolling-sphere radius R.
 * @returns {number} Protective radius on the reference plane.
 */
export function roofTerminalRadius(
  terminalTipElevationM,
  referencePlaneElevationM,
  sphereRadiusM,
) {
  const R = Number(sphereRadiusM);
  const protrusion = Number(terminalTipElevationM) - Number(referencePlaneElevationM);
  if (!(R > 0) || !(protrusion > 0)) return 0;
  const effectiveProtrusion = Math.min(protrusion, R);
  return Math.sqrt(effectiveProtrusion * (2 * R - effectiveProtrusion));
}

function evenlySpacedCoordinates(count, minimum, maximum) {
  if (count === 1) return [(minimum + maximum) / 2];
  return Array.from(
    { length: count },
    (_, index) => minimum + (maximum - minimum) * index / (count - 1),
  );
}

/**
 * Generate a regular array of roof-mounted point terminals.
 * Rectangular footprints use the entered edge setback directly. Circular
 * footprints use a grid inside the largest setback-adjusted inscribed square.
 *
 * @param {ReturnType<resolveFootprintGeometry>} footprint
 * @param {Object} config
 * @returns {{rows:number,columns:number,edgeSetbackM:number,terminals:Array<{xM:number,yM:number,row:number,column:number}>}}
 */
export function generateTerminalArray(footprint, config = {}) {
  const rows = Number(config.terminalRows);
  const columns = Number(config.terminalColumns);
  const edgeSetbackM = Number.isFinite(config.terminalEdgeSetback)
    ? Number(config.terminalEdgeSetback)
    : 0;

  if (!Number.isInteger(rows) || rows < 1 || rows > 50
    || !Number.isInteger(columns) || columns < 1 || columns > 50) {
    throw new Error('Air-terminal array rows and columns must be whole numbers from 1 through 50.');
  }
  if (!(edgeSetbackM >= 0)) {
    throw new Error('Air-terminal edge setback cannot be negative.');
  }
  if (footprint.shape === 'custom') {
    throw new Error('Roof-array coverage requires a rectangular or circular footprint with known boundaries.');
  }

  let xCoordinates;
  let yCoordinates;
  if (footprint.shape === 'circle') {
    const usableRadius = footprint.spanXM / 2 - edgeSetbackM;
    if (!(usableRadius > 0)) {
      throw new Error('Air-terminal edge setback leaves no usable circular roof area.');
    }
    const extent = usableRadius / Math.sqrt(2);
    xCoordinates = evenlySpacedCoordinates(columns, -extent, extent);
    yCoordinates = evenlySpacedCoordinates(rows, -extent, extent);
  } else {
    const xLimit = footprint.spanXM / 2 - edgeSetbackM;
    const yLimit = footprint.spanYM / 2 - edgeSetbackM;
    if (!(xLimit >= 0) || !(yLimit >= 0)) {
      throw new Error('Air-terminal edge setback exceeds half of a structure dimension.');
    }
    if ((columns > 1 && xLimit === 0) || (rows > 1 && yLimit === 0)) {
      throw new Error('Air-terminal edge setback leaves no spacing for the selected rows or columns.');
    }
    xCoordinates = evenlySpacedCoordinates(columns, -xLimit, xLimit);
    yCoordinates = evenlySpacedCoordinates(rows, -yLimit, yLimit);
  }

  const terminals = [];
  yCoordinates.forEach((yM, row) => {
    xCoordinates.forEach((xM, column) => {
      terminals.push({ xM, yM, row, column });
    });
  });
  return { rows, columns, edgeSetbackM, terminals };
}

function maximumGridSpacing(array) {
  if (!array) return { xM: Infinity, yM: Infinity, maximumM: Infinity };
  const xs = [...new Set(array.terminals.map(item => item.xM))].sort((a, b) => a - b);
  const ys = [...new Set(array.terminals.map(item => item.yM))].sort((a, b) => a - b);
  const maximumStep = values => values.length < 2
    ? 0
    : Math.max(...values.slice(1).map((value, index) => value - values[index]));
  const xM = maximumStep(xs);
  const yM = maximumStep(ys);
  return { xM, yM, maximumM: Math.max(xM, yM) };
}

/**
 * Generate a conservative NFPA 780 / UL 96A ordinary-structure roof grid.
 * The regular grid keeps terminals within 2 ft of the roof edge and no more
 * than 20 ft apart. This is intentionally more restrictive than the permitted
 * center-roof spacing alternatives so one transparent rule applies throughout.
 */
export function generateNfpaUlTerminalArray(footprint) {
  if (footprint.shape !== 'rectangle') {
    throw new Error('Automatic NFPA 780 / UL 96A roof-grid layout currently requires a rectangular footprint.');
  }
  const edgeSetbackM = Math.min(
    NFPA_UL_MAX_TERMINAL_EDGE_DISTANCE_M,
    footprint.spanXM / 2,
    footprint.spanYM / 2,
  );
  const usableX = Math.max(0, footprint.spanXM - 2 * edgeSetbackM);
  const usableY = Math.max(0, footprint.spanYM - 2 * edgeSetbackM);
  const columns = Math.max(2, Math.ceil(usableX / NFPA_UL_MAX_TERMINAL_SPACING_M) + 1);
  const rows = Math.max(2, Math.ceil(usableY / NFPA_UL_MAX_TERMINAL_SPACING_M) + 1);
  return generateTerminalArray(footprint, {
    terminalRows: rows,
    terminalColumns: columns,
    terminalEdgeSetback: edgeSetbackM,
  });
}

function buildDesignCompliance({
  designStandard,
  footprint,
  protectionMethod,
  terminalArray,
  terminalRiseM,
  coverageComplete,
  downConductorLayout,
  bomAssumptions,
  heightM,
}) {
  if (designStandard !== 'nfpa-ul') {
    return {
      standard: 'IEC 62305 / IEEE 998 screening',
      status: 'screening-only',
      label: 'Screening only',
      designReady: false,
      criteria: [],
      assumptions: [],
      exclusions: ['NFPA 780 / UL 96A prescriptive design verification and field inspection are outside this screening mode.'],
      inspectionRequired: true,
    };
  }

  const spacing = maximumGridSpacing(terminalArray);
  const roofSupportSpacingM = Number(bomAssumptions?.roofSupportSpacingM);
  const downSupportSpacingM = Number(bomAssumptions?.downConductorSupportSpacingM);
  const includePerimeterRing = bomAssumptions?.includePerimeterRing !== false;
  const criteria = [
    {
      id: 'footprint',
      label: 'Rectangular footprint has defined boundaries',
      pass: footprint.shape === 'rectangle',
      detail: footprint.shape === 'rectangle'
        ? 'Automatic terminal coordinates are generated from the entered length and width.'
        : 'Use a rectangular footprint or complete a project-specific perimeter layout.',
    },
    {
      id: 'roof-array',
      label: 'Interconnected roof air-terminal array selected',
      pass: protectionMethod === 'roof-array' && Boolean(terminalArray),
      detail: 'The NFPA/UL workflow requires a complete roof network rather than a screening-only centered mast.',
    },
    {
      id: 'terminal-rise',
      label: 'Air-terminal tips are at least 10 in above the protected surface',
      pass: terminalRiseM >= NFPA_UL_MIN_TERMINAL_RISE_M,
      detail: `Entered projection is ${terminalRiseM.toFixed(3)} m; minimum checked value is ${NFPA_UL_MIN_TERMINAL_RISE_M.toFixed(3)} m.`,
    },
    {
      id: 'edge-distance',
      label: 'Terminals are within 2 ft of roof edges',
      pass: Boolean(terminalArray)
        && terminalArray.edgeSetbackM <= NFPA_UL_MAX_TERMINAL_EDGE_DISTANCE_M + 1e-9,
      detail: terminalArray
        ? `Generated edge distance is ${terminalArray.edgeSetbackM.toFixed(3)} m.`
        : 'No terminal array is available.',
    },
    {
      id: 'terminal-spacing',
      label: 'Terminal grid spacing does not exceed 20 ft',
      pass: spacing.maximumM <= NFPA_UL_MAX_TERMINAL_SPACING_M + 1e-9,
      detail: Number.isFinite(spacing.maximumM)
        ? `Maximum generated spacing is ${spacing.maximumM.toFixed(3)} m.`
        : 'No terminal grid is available.',
    },
    {
      id: 'rolling-sphere',
      label: 'Entered reference plane passes the rolling-sphere coverage check',
      pass: coverageComplete === true,
      detail: coverageComplete
        ? 'Every evaluated roof point is inside at least one terminal protection footprint.'
        : 'Increase terminal projection or revise the layout before design release.',
    },
    {
      id: 'down-paths',
      label: 'At least two independent paths to ground are provided',
      pass: (downConductorLayout?.count || 0) >= 2,
      detail: `${downConductorLayout?.count || 0} distributed down paths are generated.`,
    },
    {
      id: 'perimeter-network',
      label: 'Roof perimeter network is included',
      pass: includePerimeterRing,
      detail: includePerimeterRing
        ? 'The terminal grid is connected to a perimeter conductor.'
        : 'Enable the roof perimeter ring for this workflow.',
    },
    {
      id: 'roof-supports',
      label: 'Roof conductor supports do not exceed 3 ft spacing',
      pass: roofSupportSpacingM > 0
        && roofSupportSpacingM <= NFPA_UL_MAX_CONDUCTOR_SUPPORT_SPACING_M + 1e-9,
      detail: Number.isFinite(roofSupportSpacingM)
        ? `Entered support spacing is ${roofSupportSpacingM.toFixed(3)} m.`
        : 'Enter a roof support spacing.',
    },
    {
      id: 'down-supports',
      label: 'Down-conductor supports do not exceed 3 ft spacing',
      pass: downSupportSpacingM > 0
        && downSupportSpacingM <= NFPA_UL_MAX_CONDUCTOR_SUPPORT_SPACING_M + 1e-9,
      detail: Number.isFinite(downSupportSpacingM)
        ? `Entered support spacing is ${downSupportSpacingM.toFixed(3)} m.`
        : 'Enter a down-conductor support spacing.',
    },
  ];
  const failed = criteria.filter(item => !item.pass);
  const componentClass = heightM > NFPA_UL_CLASS_II_HEIGHT_M ? 'Class II' : 'Class I';
  return {
    standard: 'NFPA 780 / UL 96A design workflow',
    componentClass,
    status: failed.length ? 'action-required' : 'design-ready-with-assumptions',
    label: failed.length ? `${failed.length} design check${failed.length === 1 ? '' : 's'} require action` : 'Design checks pass',
    designReady: failed.length === 0,
    criteria,
    assumptions: [
      `All air terminals, ${componentClass} conductors, fittings, connectors, fasteners, and grounding interfaces are UL 96 Listed and compatible with the selected materials.`,
      'Air terminals or masts taller than 24 in are structurally designed and supported for wind, ice, roof loading, and the manufacturer installation instructions.',
      'Every rooftop projection, conductive body, antenna, cable tray, service, and grounded metal mass is either inside the verified zone of protection or bonded with the required main-size conductor.',
      'Every down path is connected to a qualifying grounding electrode system or the bonded station ground grid using listed direct-burial or exothermic connections.',
      'Surge protection is provided and coordinated at every incoming power, communications, coaxial, control, and other conductive service where required.',
      'Separation distance, side-flash control, corrosion compatibility, roof flashing, and weatherproofing are resolved in the project installation drawings.',
    ],
    exclusions: [
      'Site survey verification of roof elevations, obstructions, projections, and final conductor routing.',
      'Structural calculations and attachment design for terminals, masts, conductor supports, and roof penetrations.',
      'Ground-grid and electrode engineering based on soil resistivity, fault duty, touch/step voltage, and station standards.',
      'Product catalog selections, installer means and methods, permits, authority review, testing, commissioning, and the final UL field inspection or Master Label Certificate.',
    ],
    inspectionRequired: true,
  };
}

function nearestTerminal(point, terminals) {
  let nearest = null;
  let distanceM = Infinity;
  terminals.forEach((terminal, index) => {
    const distance = Math.hypot(point.xM - terminal.xM, point.yM - terminal.yM);
    if (distance < distanceM) {
      distanceM = distance;
      nearest = { ...terminal, index };
    }
  });
  return { distanceM, terminal: nearest };
}

/**
 * Evaluate whether the union of point-terminal rolling-sphere footprints
 * covers the complete horizontal structure reference plane.
 *
 * A rectangular regular grid is evaluated exactly at its Voronoi-cell
 * vertices and footprint boundaries. A circular footprint is evaluated with
 * a dense interior/boundary screen and a conservative half-cell allowance.
 *
 * @param {ReturnType<resolveFootprintGeometry>} footprint
 * @param {Array<{xM:number,yM:number}>} terminals
 * @param {number} protectiveRadiusM
 * @returns {{coverageComplete:boolean,coverageMarginM:number,maxRequiredRadiusM:number,criticalPoint:{xM:number,yM:number},nearestTerminal:Object,evaluationMethod:string,evaluatedPointCount:number,toleranceM:number}}
 */
export function evaluateTerminalArrayCoverage(footprint, terminals, protectiveRadiusM) {
  if (!Array.isArray(terminals) || terminals.length === 0) {
    throw new Error('At least one air terminal is required for array coverage.');
  }

  const candidates = [];
  let toleranceM = 0;
  let evaluationMethod = 'exact rectangular grid';
  if (footprint.shape === 'rectangle') {
    const xs = [...new Set(terminals.map(terminal => terminal.xM))].sort((a, b) => a - b);
    const ys = [...new Set(terminals.map(terminal => terminal.yM))].sort((a, b) => a - b);
    const candidateXs = [-footprint.spanXM / 2, footprint.spanXM / 2];
    const candidateYs = [-footprint.spanYM / 2, footprint.spanYM / 2];
    for (let index = 1; index < xs.length; index += 1) {
      candidateXs.push((xs[index - 1] + xs[index]) / 2);
    }
    for (let index = 1; index < ys.length; index += 1) {
      candidateYs.push((ys[index - 1] + ys[index]) / 2);
    }
    candidateXs.forEach(xM => {
      candidateYs.forEach(yM => candidates.push({ xM, yM }));
    });
  } else {
    evaluationMethod = 'conservative circular surface screen';
    const radius = footprint.spanXM / 2;
    const divisions = 120;
    const step = 2 * radius / divisions;
    toleranceM = step / Math.sqrt(2);
    for (let ix = 0; ix <= divisions; ix += 1) {
      const xM = -radius + ix * step;
      for (let iy = 0; iy <= divisions; iy += 1) {
        const yM = -radius + iy * step;
        if (xM * xM + yM * yM <= radius * radius + 1e-9) {
          candidates.push({ xM, yM });
        }
      }
    }
    for (let index = 0; index < 720; index += 1) {
      const angle = 2 * Math.PI * index / 720;
      candidates.push({ xM: radius * Math.cos(angle), yM: radius * Math.sin(angle) });
    }
  }

  let criticalPoint = candidates[0];
  let nearestAtCritical = nearestTerminal(criticalPoint, terminals);
  candidates.forEach(point => {
    const nearest = nearestTerminal(point, terminals);
    if (nearest.distanceM > nearestAtCritical.distanceM) {
      criticalPoint = point;
      nearestAtCritical = nearest;
    }
  });

  const maxRequiredRadiusM = nearestAtCritical.distanceM + toleranceM;
  const coverageMarginM = protectiveRadiusM - maxRequiredRadiusM;
  return {
    coverageComplete: coverageMarginM >= -1e-9,
    coverageMarginM,
    maxRequiredRadiusM,
    criticalPoint,
    nearestTerminal: nearestAtCritical.terminal,
    evaluationMethod,
    evaluatedPointCount: candidates.length,
    toleranceM,
  };
}

// ---------------------------------------------------------------------------
// Down-conductors
// ---------------------------------------------------------------------------

/**
 * Number of down-conductors around a structure perimeter (IEC 62305-3),
 * minimum two, spaced no further apart than the class spacing.
 * @param {number} perimeterM - Structure perimeter (m)
 * @param {number} spacingM - Maximum down-conductor spacing for the class (m)
 * @returns {number}
 */
export function downConductorCount(perimeterM, spacingM) {
  if (!(perimeterM > 0) || !(spacingM > 0)) return 2;
  const spacingRatio = perimeterM / spacingM;
  return Math.max(2, Math.ceil(spacingRatio - DOWN_CONDUCTOR_SPACING_RATIO_TOLERANCE));
}

function rectangleDownConductorPoints(footprint, spacingM) {
  const halfX = footprint.spanXM / 2;
  const halfY = footprint.spanYM / 2;
  const horizontalSegments = Math.max(
    1,
    Math.ceil(footprint.spanXM / spacingM - DOWN_CONDUCTOR_SPACING_RATIO_TOLERANCE),
  );
  const verticalSegments = Math.max(
    1,
    Math.ceil(footprint.spanYM / spacingM - DOWN_CONDUCTOR_SPACING_RATIO_TOLERANCE),
  );
  const points = [];

  for (let index = 0; index < horizontalSegments; index += 1) {
    points.push({
      xM: -halfX + footprint.spanXM * index / horizontalSegments,
      yM: halfY,
      edge: 'north',
      isCorner: index === 0,
    });
  }
  for (let index = 0; index < verticalSegments; index += 1) {
    points.push({
      xM: halfX,
      yM: halfY - footprint.spanYM * index / verticalSegments,
      edge: 'east',
      isCorner: index === 0,
    });
  }
  for (let index = 0; index < horizontalSegments; index += 1) {
    points.push({
      xM: halfX - footprint.spanXM * index / horizontalSegments,
      yM: -halfY,
      edge: 'south',
      isCorner: index === 0,
    });
  }
  for (let index = 0; index < verticalSegments; index += 1) {
    points.push({
      xM: -halfX,
      yM: -halfY + footprint.spanYM * index / verticalSegments,
      edge: 'west',
      isCorner: index === 0,
    });
  }

  return {
    points,
    achievedMaxSpacingM: Math.max(
      footprint.spanXM / horizontalSegments,
      footprint.spanYM / verticalSegments,
    ),
  };
}

/**
 * Generate the preliminary down-conductor arrangement around the footprint.
 * Rectangles start at all four corners, then add evenly spaced intermediate
 * routes on each wall. Circles use uniform perimeter spacing.
 *
 * @param {ReturnType<resolveFootprintGeometry>} footprint
 * @param {number} spacingM - Typical maximum spacing used by the screening.
 * @returns {{count:number,points:Array<Object>,cornerCount:number,intermediateCount:number,targetSpacingM:number,achievedMaxSpacingM:number|null,placementMethod:string}}
 */
export function generateDownConductorLayout(footprint, spacingM) {
  if (!footprint || !(footprint.perimeterM > 0) || !(spacingM > 0)) {
    return {
      count: 2,
      points: [],
      cornerCount: 0,
      intermediateCount: 2,
      targetSpacingM: spacingM,
      achievedMaxSpacingM: null,
      placementMethod: 'Field-coordinate two or more routes on opposite sides.',
    };
  }

  if (footprint.shape === 'rectangle') {
    const layout = rectangleDownConductorPoints(footprint, spacingM);
    return {
      count: layout.points.length,
      points: layout.points,
      cornerCount: 4,
      intermediateCount: Math.max(0, layout.points.length - 4),
      targetSpacingM: spacingM,
      achievedMaxSpacingM: layout.achievedMaxSpacingM,
      placementMethod: 'Four corners first, then evenly spaced intermediate routes on each wall.',
    };
  }

  if (footprint.shape === 'circle') {
    const count = downConductorCount(footprint.perimeterM, spacingM);
    const radius = footprint.spanXM / 2;
    const points = Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * index / count;
      return {
        xM: radius * Math.cos(angle),
        yM: radius * Math.sin(angle),
        edge: 'perimeter',
        isCorner: false,
      };
    });
    return {
      count,
      points,
      cornerCount: 0,
      intermediateCount: count,
      targetSpacingM: spacingM,
      achievedMaxSpacingM: footprint.perimeterM / count,
      placementMethod: 'Evenly distributed around the circular perimeter.',
    };
  }

  const count = downConductorCount(footprint.perimeterM, spacingM);
  return {
    count,
    points: [],
    cornerCount: 0,
    intermediateCount: count,
    targetSpacingM: spacingM,
    achievedMaxSpacingM: footprint.perimeterM / count,
    placementMethod: 'Count only; surveyed custom-perimeter coordinates are required.',
  };
}

// ---------------------------------------------------------------------------
// Surge arrester selection
// ---------------------------------------------------------------------------

/**
 * Minimum arrester continuous operating voltage (MCOV / Uc) for a system,
 * IEEE C62.22 / IEC 60099-5.
 *   Effectively/solidly grounded: Uc ≥ 1.05 · VLL / √3
 *   Ungrounded / resonant-grounded: Uc ≥ 1.05 · VLL
 * @param {number} systemKvLL - Nominal system line-to-line voltage (kV)
 * @param {'solid'|'ungrounded'} grounding
 * @returns {number} Minimum MCOV (kV)
 */
export function arresterMCOV(systemKvLL, grounding) {
  const factor = grounding === 'ungrounded' ? 1.0 : 1 / Math.sqrt(3);
  return 1.05 * systemKvLL * factor;
}

/**
 * Recommend a standard arrester duty-cycle rating for a system.
 * Rated voltage Ur ≈ MCOV / 0.8; the nearest standard rating ≥ Ur is chosen.
 * @param {number} systemKvLL - Nominal system L-L voltage (kV)
 * @param {'solid'|'ungrounded'} grounding
 * @returns {{mcov:number, ratedRequired:number, ratedStandard:(number|null)}}
 */
export function recommendArrester(systemKvLL, grounding) {
  if (!(systemKvLL > 0)) {
    throw new Error('System voltage must be positive.');
  }
  if (systemKvLL <= MIN_ARRESTER_SYSTEM_KV) {
    return {
      applicable: false,
      scope: 'low-voltage',
      mcov: null,
      ratedRequired: null,
      ratedStandard: null,
      note: 'Use a low-voltage SPD selection workflow; IEEE C62.22 and IEC 60099-5 arrester screening applies above 1 kV.',
    };
  }
  const mcov = arresterMCOV(systemKvLL, grounding);
  const ratedRequired = mcov / 0.8;
  const ratedStandard = STANDARD_ARRESTER_KV.find(v => v >= ratedRequired) ?? null;
  return {
    applicable: true,
    scope: 'medium-high-voltage',
    mcov,
    ratedRequired,
    ratedStandard,
    note: 'Preliminary rating only; verify maximum system voltage, temporary overvoltage duty, insulation coordination, and manufacturer data.',
  };
}

// ---------------------------------------------------------------------------
// Top-level study runner
// ---------------------------------------------------------------------------

/**
 * Run the lightning & surge protection screening study.
 *
 * @param {Object} config
 * @param {'rectangle'|'circle'|'custom'} [config.structureShape='rectangle'].
 * @param {number} [config.thunderstormDays] - Keraunic level Td (days/yr).
 * @param {number} [config.groundFlashDensity] - Ng directly (overrides Td).
 * @param {number} [config.length] - Rectangular structure length L (m).
 * @param {number} [config.width] - Rectangular structure width W (m).
 * @param {number} [config.diameter] - Circular structure diameter (m).
 * @param {number} [config.footprintArea] - Custom plan area (m2).
 * @param {number} [config.footprintPerimeter] - Custom plan perimeter (m).
 * @param {number} [config.farthestPointRadius] - Custom farthest protected plan point from the centered mast (m).
 * @param {number} config.height - Structure height H (m).
 * @param {string} [config.location='isolated'] - Location factor key.
 * @param {number} [config.tolerableFrequency=DEFAULT_NC] - Nc (per year).
 * @param {number} [config.protectedHeight=0] - Equipment height to protect (m).
 * @param {number} [config.airTerminalHeight=config.height] - Mast or air-terminal tip height above grade (m).
 * @param {'single'|'roof-array'} [config.protectionMethod='single'] - Air-termination arrangement.
 * @param {number} [config.terminalRows=2] - Roof-array rows across the footprint.
 * @param {number} [config.terminalColumns=4] - Roof-array columns along the footprint.
 * @param {number} [config.terminalEdgeSetback=0] - Roof-array setback from the footprint edge (m).
 * @param {'iec-screening'|'nfpa-ul'} [config.designStandard='iec-screening'].
 * @param {boolean} [config.autoTerminalLayout=false] - Generate the conservative NFPA/UL roof grid.
 * @param {string} [config.downConductorMaterial='copper'].
 * @param {number} [config.systemKvLL] - Surge-arrester system voltage (kV), optional.
 * @param {'solid'|'ungrounded'} [config.grounding='solid'].
 * @returns {LightningResult}
 */
export function runLightningProtection(config = {}) {
  const H = Number(config.height);
  if (!(H > 0)) {
    throw new Error('Enter a positive structure height.');
  }
  const footprint = resolveFootprintGeometry(config);
  const ng = Number.isFinite(config.groundFlashDensity) && config.groundFlashDensity > 0
    ? config.groundFlashDensity
    : groundFlashDensity(Number(config.thunderstormDays));
  if (!(ng > 0)) {
    throw new Error('Provide a positive ground flash density or thunderstorm-day count.');
  }
  const cd = LOCATION_FACTORS[config.location] ?? LOCATION_FACTORS.isolated;
  const nc = Number.isFinite(config.tolerableFrequency) && config.tolerableFrequency > 0
    ? config.tolerableFrequency
    : DEFAULT_NC;

  const area = collectionAreaFromFootprint(footprint.areaM2, footprint.perimeterM, H);
  const nd = expectedStrikes(ng, area, cd);
  const lpl = recommendLPL(nd, nc);
  const designStandard = config.designStandard === 'nfpa-ul' ? 'nfpa-ul' : 'iec-screening';

  const level = lpl.required ? LPL_TABLE[lpl.level] : null;
  const protectedHeight = Number.isFinite(config.protectedHeight) ? config.protectedHeight : 0;
  const airTerminalHeight = Number.isFinite(config.airTerminalHeight) ? Number(config.airTerminalHeight) : H;
  if (!(airTerminalHeight > 0)) {
    throw new Error('Enter a positive mast or air-terminal tip height.');
  }
  if (airTerminalHeight < H) {
    throw new Error('Mast or air-terminal tip height must be at least the structure height.');
  }
  const protectionMethod = Object.hasOwn(PROTECTION_METHODS, config.protectionMethod)
    ? config.protectionMethod
    : 'single';
  const referencePlaneHeight = protectionMethod === 'roof-array'
    ? Math.max(H, protectedHeight)
    : protectedHeight;
  const mastProtectiveRadius = level
    ? protectionMethod === 'roof-array'
      ? roofTerminalRadius(airTerminalHeight, referencePlaneHeight, level.radius)
      : singleMastRadius(airTerminalHeight, protectedHeight, level.radius)
    : null;
  const autoTerminalLayout = designStandard === 'nfpa-ul' && config.autoTerminalLayout !== false;
  const terminalArray = protectionMethod === 'roof-array'
    ? autoTerminalLayout
      ? generateNfpaUlTerminalArray(footprint)
      : generateTerminalArray(footprint, {
        terminalRows: Number.isFinite(config.terminalRows) ? Number(config.terminalRows) : 2,
        terminalColumns: Number.isFinite(config.terminalColumns) ? Number(config.terminalColumns) : 4,
        terminalEdgeSetback: Number.isFinite(config.terminalEdgeSetback)
          ? Number(config.terminalEdgeSetback)
          : 0,
      })
    : null;
  const arrayCoverage = level && terminalArray
    ? evaluateTerminalArrayCoverage(footprint, terminalArray.terminals, mastProtectiveRadius)
    : null;
  const requiredCoverageRadius = arrayCoverage
    ? arrayCoverage.maxRequiredRadiusM
    : footprint.requiredCoverageRadiusM;
  const coverageMargin = level
    ? arrayCoverage
      ? arrayCoverage.coverageMarginM
      : mastProtectiveRadius - requiredCoverageRadius
    : null;
  const coverageComplete = level
    ? coverageMargin >= 0
    : null;
  const minStrikeCurrent = level ? level.iMin : null;
  const minStrikeDistance = level ? strikingDistance(minStrikeCurrent) : null;

  // Down-conductors
  const perimeter = footprint.perimeterM;
  const downConductorLayout = level
    ? generateDownConductorLayout(
      footprint,
      designStandard === 'nfpa-ul' ? NFPA_UL_MAX_DOWN_CONDUCTOR_SPACING_M : level.downSpacing,
    )
    : null;
  const downCount = downConductorLayout?.count ?? 0;
  const material = DOWN_CONDUCTOR_MIN_MM2[config.downConductorMaterial] ? config.downConductorMaterial : 'copper';
  const downMinArea = DOWN_CONDUCTOR_MIN_MM2[material];

  // Surge arrester (optional)
  let arrester = null;
  if (Number.isFinite(config.systemKvLL) && config.systemKvLL > 0) {
    arrester = recommendArrester(config.systemKvLL, config.grounding === 'ungrounded' ? 'ungrounded' : 'solid');
    arrester.systemKvLL = config.systemKvLL;
    arrester.grounding = config.grounding === 'ungrounded' ? 'ungrounded' : 'solid';
  }

  const warnings = [];
  if (lpl.required) {
    warnings.push(`Direct strikes Nd = ${nd.toExponential(2)}/yr exceed the tolerable ${nc.toExponential(2)}/yr — install an LPS class ${lpl.level} (${lpl.note}).`);
  }
  if (lpl.required && mastProtectiveRadius <= 0) {
    warnings.push(protectionMethod === 'roof-array'
      ? 'The air-terminal tips do not rise above the roof/equipment reference plane — increase terminal height.'
      : 'The entered mast or air-terminal tip height does not protect equipment at the specified height — add taller masts or overhead shield wires.');
  } else if (lpl.required && !coverageComplete) {
    warnings.push(protectionMethod === 'roof-array'
      ? `The ${terminalArray.terminals.length}-terminal roof array reaches ${mastProtectiveRadius.toFixed(2)} m from each terminal at the reference plane, but the worst roof point is ${requiredCoverageRadius.toFixed(2)} m from its nearest terminal — add terminals, reduce spacing/setback, or increase terminal height.`
      : `A centered single mast reaches ${mastProtectiveRadius.toFixed(2)} m at the protected height, short of the ${footprint.requiredCoverageRadiusM.toFixed(2)} m farthest footprint point — use a taller or multi-terminal arrangement.`);
  }
  if (lpl.efficiency > 0.99) {
    warnings.push('Required protection efficiency exceeds 0.99 — combine LPL I air termination with surge protective devices and equipotential bonding.');
  }
  if (arrester && !arrester.applicable) {
    warnings.push(arrester.note);
  } else if (arrester && arrester.ratedStandard == null) {
    warnings.push('System voltage exceeds the standard arrester table — consult the manufacturer for a custom rating.');
  }
  if (footprint.shape === 'custom') {
    warnings.push('Custom-footprint collection area uses the entered plan area and perimeter; the plan outline is schematic and must be checked against survey geometry.');
  }
  if (protectionMethod === 'roof-array') {
    warnings.push(`Roof-array coverage is evaluated on the ${referencePlaneHeight === H ? 'roof' : 'entered equipment'} plane using a regular ${terminalArray.columns} × ${terminalArray.rows} terminal grid. Coordinate the final layout with rooftop obstructions, conductive roof features, separation distance, and attachment details.`);
  }
  if (lpl.required && downConductorLayout) {
    warnings.push(`Down-conductors are independent of the air-terminal count: ${downConductorLayout.placementMethod} Interconnect the roof network and earth-termination network; do not assign one downconductor to each air terminal.`);
  }

  const result = {
    inputs: {
      thunderstormDays: Number.isFinite(config.thunderstormDays) ? Number(config.thunderstormDays) : undefined,
      groundFlashDensity: Number.isFinite(config.groundFlashDensity) ? Number(config.groundFlashDensity) : undefined,
      structureShape: footprint.shape,
      length: footprint.shape === 'rectangle' ? Number(config.length) : undefined,
      width: footprint.shape === 'rectangle' ? Number(config.width) : undefined,
      diameter: footprint.shape === 'circle' ? Number(config.diameter) : undefined,
      footprintArea: footprint.shape === 'custom' ? footprint.areaM2 : undefined,
      footprintPerimeter: footprint.shape === 'custom' ? footprint.perimeterM : undefined,
      farthestPointRadius: footprint.shape === 'custom' ? footprint.requiredCoverageRadiusM : undefined,
      height: H,
      location: config.location || 'isolated',
      tolerableFrequency: nc,
      protectedHeight,
      airTerminalHeight,
      protectionMethod,
      designStandard,
      autoTerminalLayout,
      terminalRows: terminalArray?.rows,
      terminalColumns: terminalArray?.columns,
      terminalEdgeSetback: terminalArray?.edgeSetbackM,
      downConductorMaterial: material,
      bomAssumptions: config.bomAssumptions,
      systemKvLL: config.systemKvLL,
      grounding: config.grounding,
    },
    groundFlashDensity: ng,
    locationFactor: cd,
    footprint,
    footprintAreaM2: footprint.areaM2,
    collectionAreaM2: area,
    expectedStrikesPerYear: nd,
    tolerableFrequency: nc,
    lpl,
    rollingSphereRadius: level?.radius ?? null,
    minStrikeCurrentKa: minStrikeCurrent,
    minStrikeDistanceM: minStrikeDistance,
    mastProtectiveRadiusM: mastProtectiveRadius,
    terminalProtectiveRadiusM: mastProtectiveRadius,
    requiredCoverageRadiusM: requiredCoverageRadius,
    coverageMarginM: coverageMargin,
    coverageComplete,
    protectionMethod,
    referencePlaneHeightM: referencePlaneHeight,
    terminalArray: terminalArray ? {
      ...terminalArray,
      protectiveRadiusM: mastProtectiveRadius,
      referencePlaneHeightM: referencePlaneHeight,
      terminalRiseM: Math.max(0, airTerminalHeight - referencePlaneHeight),
      coverage: arrayCoverage,
    } : null,
    perimeterM: perimeter,
    downConductorCount: downCount,
    downConductorLayout,
    downConductorMaterial: material,
    downConductorMinAreaMm2: downMinArea,
    lightningConductorMinBendRadiusM: LIGHTNING_CONDUCTOR_MIN_BEND_RADIUS_M,
    arrester,
    warnings,
  };
  result.designCompliance = buildDesignCompliance({
    designStandard,
    footprint,
    protectionMethod,
    terminalArray,
    terminalRiseM: Math.max(0, airTerminalHeight - referencePlaneHeight),
    coverageComplete,
    downConductorLayout,
    bomAssumptions: config.bomAssumptions,
    heightM: H,
  });
  result.bom = buildLightningProtectionBom(result, config.bomAssumptions);
  return result;
}
