/**
 * Multi-Standard Cable Sizing
 *
 * Supported standards:
 *   IEC_60364  — IEC 60364-5-52:2009 (international baseline, reference ambient 30 °C)
 *   BS_7671    — BS 7671:2018 + AMD 1:2020 (UK, reference ambient 30 °C)
 *               IEC_60364 and BS_7671 share identical base ampacity tables per
 *               IEC 60364-5-52 Annex B / BS 7671 Appendix 4. They differ only in
 *               grouping-factor table selection and labelling.
 *   AS_NZS_3008 — AS/NZS 3008.1.1:2017 (Australia/New Zealand, reference ambient 40 °C)
 *
 * Installation methods (IEC / BS labels; AS/NZS equivalent shown in parentheses):
 *   B2 — Multicore cable in conduit on wall or surface trunking (≈ wiring method C2/C3)
 *   C  — Single layer clipped direct to non-metallic surface    (≈ wiring method C1)
 *   E  — Multicore cable in free air                            (≈ wiring method C6)
 *   F  — Single-core cables touching in free air (trefoil)      (≈ wiring method C7)
 *
 * Insulation types:
 *   PVC  — 70 °C thermoplastic (IEC/BS designation: 70PVC; AS/NZS: thermoplastic 75 °C)
 *   XLPE — 90 °C thermosetting XLPE or EPR
 *
 * Conductor materials:  Cu (copper), Al (aluminium, min 16 mm²)
 *
 * References:
 *   IEC 60364-5-52:2009 Annex B tables B.52.2 – B.52.17
 *   BS 7671:2018 Appendix 4 tables 4D1A–4E4A, 4B1, 4B2, 4C1, 4C2
 *   AS/NZS 3008.1.1:2017 Tables 7, 8, 22, 25, 27
 */

// ---------------------------------------------------------------------------
// Standard and method metadata
// ---------------------------------------------------------------------------

/** @type {Object.<string,{name:string,refAmbient:number,note:string}>} */
export const STANDARDS = {
  IEC_60364: {
    name: 'IEC 60364-5-52:2009',
    refAmbient: 30,
    note: 'International standard, reference ambient 30 °C.',
  },
  BS_7671: {
    name: 'BS 7671:2018 (18th Edition)',
    refAmbient: 30,
    note: 'UK wiring regulations. Base ampacity tables identical to IEC 60364-5-52.',
  },
  AS_NZS_3008: {
    name: 'AS/NZS 3008.1.1:2017',
    refAmbient: 40,
    note: 'Australia/New Zealand. Reference ambient 40 °C; separate ampacity tables.',
  },
};

/** @type {Object.<string,{label:string,description:string}>} */
export const INSTALLATION_METHODS = {
  B2: { label: 'B2', description: 'Multicore cable in conduit on wall / in surface trunking' },
  C:  { label: 'C',  description: 'Multicore cable clipped direct to non-metallic surface' },
  E:  { label: 'E',  description: 'Multicore cable in free air (on cable tray or trefoil)' },
  F:  { label: 'F',  description: 'Single-core cables touching (trefoil) in free air' },
};

/** Standard metric conductor sizes in mm² */
export const CABLE_SIZES_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];

// ---------------------------------------------------------------------------
// Base ampacity tables
// IEC 60364-5-52:2009 Annex B / BS 7671:2018 Appendix 4
// Values in amperes, reference ambient 30 °C, single circuit, no grouping.
// ---------------------------------------------------------------------------

/**
 * Ampacity table structure:
 *   AMPACITY_IEC[method][phases][material][insulation]
 * where:
 *   method    — 'B2' | 'C' | 'E' | 'F'
 *   phases    — 2 (single-phase, 2 loaded conductors) | 3 (three-phase)
 *   material  — 'Cu' | 'Al'
 *   insulation— 'PVC' | 'XLPE'
 * Array index corresponds to CABLE_SIZES_MM2 index (0 = 1.5 mm²).
 * Al values start at index 5 (16 mm²); entries for smaller sizes are null.
 *
 * Source: IEC 60364-5-52:2009 Tables B.52.2 – B.52.9 /
 *         BS 7671:2018 Tables 4D1A, 4D2A, 4E1A, 4E2A, 4E3A, 4E4A.
 */
const AMPACITY_IEC = {
  B2: {
    2: {
      Cu: {
        PVC:  [15,   20,   27,   34,   46,   61,   80,   97,  119,  151,  182,  210,  240,  273,  320,  366],
        XLPE: [19.5, 27,   36,   46,   63,   85,  110,  134,  163,  207,  250,  288,  332,  377,  441,  506],
      },
      Al: {
        PVC:  [null, null, null, null, null,  47,   62,   75,   92,  116,  140,  162,  187,  212,  249,  285],
        XLPE: [null, null, null, null, null,  66,   86,  104,  127,  161,  195,  224,  258,  294,  344,  394],
      },
    },
    3: {
      Cu: {
        PVC:  [13.5, 18,   24,   31,   42,   56,   73,   89,  108,  136,  164,  188,  216,  245,  286,  328],
        XLPE: [17.5, 24,   32,   41,   57,   76,   99,  121,  147,  187,  227,  263,  302,  344,  400,  459],
      },
      Al: {
        PVC:  [null, null, null, null, null,  44,   57,   70,   84,  107,  129,  149,  170,  194,  227,  261],
        XLPE: [null, null, null, null, null,  59,   77,   94,  114,  146,  177,  204,  235,  267,  311,  357],
      },
    },
  },
  C: {
    2: {
      Cu: {
        PVC:  [17.5, 24,   32,   41,   57,   76,   96,  119,  144,  184,  223,  259,  299,  341,  403,  464],
        XLPE: [22,   30,   40,   51,   70,   94,  119,  148,  180,  232,  282,  328,  379,  434,  514,  593],
      },
      Al: {
        PVC:  [null, null, null, null, null,  59,   75,   92,  112,  142,  172,  200,  230,  262,  309,  355],
        XLPE: [null, null, null, null, null,  73,   93,  116,  142,  183,  222,  258,  297,  340,  403,  465],
      },
    },
    3: {
      Cu: {
        PVC:  [15.5, 21,   28,   36,   50,   66,   84,  104,  125,  160,  194,  225,  260,  297,  350,  401],
        XLPE: [18.5, 25,   34,   43,   60,   80,  101,  126,  153,  196,  238,  276,  319,  362,  424,  486],
      },
      Al: {
        PVC:  [null, null, null, null, null,  52,   66,   81,   98,  125,  151,  175,  201,  230,  271,  312],
        XLPE: [null, null, null, null, null,  62,   78,   98,  118,  152,  185,  214,  247,  281,  330,  381],
      },
    },
  },
  E: {
    2: {
      Cu: {
        PVC:  [19.5, 26,   35,   45,   61,   81,  106,  131,  158,  200,  241,  278,  318,  362,  424,  486],
        XLPE: [24,   33,   45,   58,   80,  107,  138,  171,  209,  269,  328,  382,  441,  506,  599,  693],
      },
      Al: {
        PVC:  [null, null, null, null, null,  62,   82,  101,  122,  155,  187,  216,  248,  282,  331,  381],
        XLPE: [null, null, null, null, null,  84,  107,  133,  163,  211,  257,  300,  346,  397,  470,  543],
      },
    },
    3: {
      Cu: {
        PVC:  [17.5, 23,   31,   40,   54,   73,   95,  117,  141,  179,  216,  249,  285,  324,  380,  435],
        XLPE: [22,   30,   40,   51,   70,   94,  119,  148,  180,  232,  282,  328,  379,  434,  514,  593],
      },
      Al: {
        PVC:  [null, null, null, null, null,  57,   74,   91,  110,  140,  170,  197,  226,  256,  300,  344],
        XLPE: [null, null, null, null, null,  73,   93,  116,  142,  183,  222,  258,  297,  340,  403,  464],
      },
    },
  },
  // F — single-core cables touching (trefoil), free air
  // Source: BS 7671 Table 4E3A (XLPE) and 4D3A (PVC), method F.
  F: {
    2: {
      Cu: {
        PVC:  [19.5, 26,   35,   45,   61,   81,  106,  131,  158,  200,  241,  278,  318,  362,  424,  486],
        XLPE: [24,   33,   45,   58,   80,  107,  138,  171,  209,  269,  328,  382,  441,  506,  599,  693],
      },
      Al: {
        PVC:  [null, null, null, null, null,  62,   82,  101,  122,  155,  187,  216,  248,  282,  331,  381],
        XLPE: [null, null, null, null, null,  84,  107,  133,  163,  211,  257,  300,  346,  397,  470,  543],
      },
    },
    3: {
      Cu: {
        PVC:  [17.5, 23,   31,   40,   54,   73,   95,  117,  141,  179,  216,  249,  285,  324,  380,  435],
        XLPE: [22,   30,   40,   51,   70,   94,  119,  148,  180,  232,  282,  328,  379,  434,  514,  593],
      },
      Al: {
        PVC:  [null, null, null, null, null,  57,   74,   91,  110,  140,  170,  197,  226,  256,  300,  344],
        XLPE: [null, null, null, null, null,  73,   93,  116,  142,  183,  222,  258,  297,  340,  403,  464],
      },
    },
  },
};

/**
 * AS/NZS 3008.1.1:2017 base ampacity tables, reference ambient 40 °C.
 * Values derived from AS/NZS 3008.1.1:2017 Tables 7, 8 for above-ground
 * installation in still air (installation method C equivalent) and in free
 * air (method E equivalent). Method B2 values scaled from AS/NZS Table 7.
 *
 * Al values not available below 16 mm².
 */
const AMPACITY_ASNZS = {
  B2: {
    2: {
      Cu: {
        PVC:  [13,   17,   23,   29,   40,   53,   70,   84,  103,  131,  158,  183,  209,  238,  279,  320],
        XLPE: [17,   23,   31,   40,   55,   74,   96,  117,  142,  181,  218,  252,  290,  330,  385,  442],
      },
      Al: {
        PVC:  [null, null, null, null, null,  41,   54,   65,   80,  101,  122,  141,  162,  184,  216,  248],
        XLPE: [null, null, null, null, null,  57,   75,   91,  111,  141,  170,  195,  225,  256,  300,  343],
      },
    },
    3: {
      Cu: {
        PVC:  [11,   15,   21,   27,   37,   49,   63,   77,   94,  118,  143,  164,  188,  213,  249,  286],
        XLPE: [15,   21,   28,   36,   50,   66,   86,  106,  128,  163,  198,  229,  263,  300,  348,  400],
      },
      Al: {
        PVC:  [null, null, null, null, null,  38,   50,   61,   73,   93,  112,  130,  148,  169,  198,  227],
        XLPE: [null, null, null, null, null,  51,   67,   82,   99,  127,  154,  178,  205,  233,  271,  311],
      },
    },
  },
  C: {
    2: {
      Cu: {
        PVC:  [15,   20,   28,   36,   50,   66,   84,  104,  126,  160,  194,  226,  261,  298,  351,  404],
        XLPE: [19,   26,   35,   45,   61,   82,  104,  129,  157,  202,  246,  286,  331,  379,  449,  517],
      },
      Al: {
        PVC:  [null, null, null, null, null,  52,   65,   81,   98,  124,  150,  174,  201,  229,  270,  310],
        XLPE: [null, null, null, null, null,  64,   81,  101,  124,  160,  194,  225,  259,  296,  351,  405],
      },
    },
    3: {
      Cu: {
        PVC:  [13,   18,   24,   31,   44,   58,   73,   91,  109,  140,  169,  196,  227,  259,  305,  350],
        XLPE: [17,   23,   31,   39,   55,   73,   88,  110,  134,  172,  208,  241,  278,  317,  371,  425],
      },
      Al: {
        PVC:  [null, null, null, null, null,  45,   57,   71,   86,  109,  132,  153,  176,  201,  237,  272],
        XLPE: [null, null, null, null, null,  54,   68,   86,  103,  133,  162,  187,  216,  246,  288,  333],
      },
    },
  },
  E: {
    2: {
      Cu: {
        PVC:  [17,   23,   30,   39,   53,   71,   92,  114,  138,  175,  210,  243,  278,  317,  371,  424],
        XLPE: [21,   29,   39,   51,   70,   93,  120,  149,  182,  235,  286,  333,  385,  442,  523,  605],
      },
      Al: {
        PVC:  [null, null, null, null, null,  54,   72,   88,  107,  135,  163,  189,  217,  247,  289,  332],
        XLPE: [null, null, null, null, null,  73,   93,  116,  142,  184,  224,  262,  302,  347,  410,  474],
      },
    },
    3: {
      Cu: {
        PVC:  [15,   20,   27,   35,   47,   63,   83,  102,  123,  156,  188,  217,  249,  283,  332,  381],
        XLPE: [19,   26,   35,   45,   61,   82,  104,  129,  157,  202,  246,  286,  331,  379,  449,  517],
      },
      Al: {
        PVC:  [null, null, null, null, null,  50,   64,   80,   96,  122,  148,  172,  198,  225,  262,  301],
        XLPE: [null, null, null, null, null,  64,   81,  101,  124,  160,  194,  225,  259,  296,  351,  405],
      },
    },
  },
  F: {
    2: {
      Cu: {
        PVC:  [17,   23,   30,   39,   53,   71,   92,  114,  138,  175,  210,  243,  278,  317,  371,  424],
        XLPE: [21,   29,   39,   51,   70,   93,  120,  149,  182,  235,  286,  333,  385,  442,  523,  605],
      },
      Al: {
        PVC:  [null, null, null, null, null,  54,   72,   88,  107,  135,  163,  189,  217,  247,  289,  332],
        XLPE: [null, null, null, null, null,  73,   93,  116,  142,  184,  224,  262,  302,  347,  410,  474],
      },
    },
    3: {
      Cu: {
        PVC:  [15,   20,   27,   35,   47,   63,   83,  102,  123,  156,  188,  217,  249,  283,  332,  381],
        XLPE: [19,   26,   35,   45,   61,   82,  104,  129,  157,  202,  246,  286,  331,  379,  449,  517],
      },
      Al: {
        PVC:  [null, null, null, null, null,  50,   64,   80,   96,  122,  148,  172,  198,  225,  262,  301],
        XLPE: [null, null, null, null, null,  64,   81,  101,  124,  160,  194,  225,  259,  296,  351,  405],
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Temperature correction factors
// ---------------------------------------------------------------------------

/**
 * Ambient temperature correction factors for IEC 60364 / BS 7671.
 * Reference ambient = 30 °C.
 * Source: IEC 60364-5-52:2009 Table B.52.14 / BS 7671:2018 Table 4B1.
 * @type {Object.<string, Object.<number,number>>}
 */
export const TEMP_CORRECTION_IEC = {
  PVC: {
    10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1.00,
    35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71, 55: 0.61, 60: 0.50,
  },
  XLPE: {
    10: 1.15, 15: 1.12, 20: 1.08, 25: 1.04, 30: 1.00,
    35: 0.96, 40: 0.91, 45: 0.87, 50: 0.82, 55: 0.76, 60: 0.71,
    65: 0.65, 70: 0.58, 75: 0.50, 80: 0.41,
  },
};

/**
 * Ambient temperature correction factors for AS/NZS 3008.1.1.
 * Reference ambient = 40 °C.
 * Source: AS/NZS 3008.1.1:2017 Table 27.
 * @type {Object.<string, Object.<number,number>>}
 */
export const TEMP_CORRECTION_ASNZS = {
  PVC: {
    // AS/NZS uses 75 °C PVC as reference (slightly higher than IEC 70 °C)
    20: 1.23, 25: 1.17, 30: 1.11, 35: 1.06, 40: 1.00,
    45: 0.94, 50: 0.87, 55: 0.79, 60: 0.71, 65: 0.61, 70: 0.50,
  },
  XLPE: {
    25: 1.07, 30: 1.04, 35: 1.02, 40: 1.00, 45: 0.97,
    50: 0.94, 55: 0.91, 60: 0.87, 65: 0.84, 70: 0.80,
    75: 0.76, 80: 0.72,
  },
};

// ---------------------------------------------------------------------------
// Grouping (bunching) derating factors
// ---------------------------------------------------------------------------

/**
 * Grouping derating factors for cables in enclosed conduit or trunking (Method B2).
 * Source: IEC 60364-5-52:2009 Table B.52.17 / BS 7671:2018 Table 4C1.
 * @type {Object.<number,number>}
 */
export const GROUPING_ENCLOSED = {
  1: 1.00, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60,
  6: 0.57, 7: 0.54, 8: 0.52, 9: 0.50, 12: 0.45, 16: 0.41, 20: 0.38,
};

/**
 * Grouping derating factors for cables clipped, on tray or in free air (Methods C, E, F).
 * Source: IEC 60364-5-52:2009 Table B.52.17 / BS 7671:2018 Table 4C1.
 * @type {Object.<number,number>}
 */
export const GROUPING_OPEN = {
  1: 1.00, 2: 0.88, 3: 0.82, 4: 0.77, 5: 0.75,
  6: 0.73, 7: 0.73, 8: 0.72, 9: 0.72, 12: 0.69, 16: 0.66, 20: 0.63,
};

// ---------------------------------------------------------------------------
// Core lookup functions
// ---------------------------------------------------------------------------

/**
 * Look up base (un-derated) ampacity for a single circuit.
 *
 * @param {string} standard    — 'IEC_60364' | 'BS_7671' | 'AS_NZS_3008'
 * @param {string} method      — 'B2' | 'C' | 'E' | 'F'
 * @param {number} phases      — 2 (single-phase) | 3 (three-phase)
 * @param {string} material    — 'Cu' | 'Al'
 * @param {string} insulation  — 'PVC' | 'XLPE'
 * @param {number} sizeMm2     — nominal size in mm² (must be in CABLE_SIZES_MM2)
 * @returns {number} ampacity in amperes
 * @throws {Error} if any parameter is invalid or combination is not available
 */
export function lookupAmpacity(standard, method, phases, material, insulation, sizeMm2) {
  if (!STANDARDS[standard]) throw new Error(`Unknown standard: ${standard}`);
  if (!INSTALLATION_METHODS[method]) throw new Error(`Unknown installation method: ${method}`);
  if (phases !== 2 && phases !== 3) throw new Error('phases must be 2 (single-phase) or 3 (three-phase)');
  if (material !== 'Cu' && material !== 'Al') throw new Error('material must be Cu or Al');
  if (insulation !== 'PVC' && insulation !== 'XLPE') throw new Error('insulation must be PVC or XLPE');

  const idx = CABLE_SIZES_MM2.indexOf(sizeMm2);
  if (idx === -1) {
    throw new Error(
      `${sizeMm2} mm² is not a standard size. Valid sizes: ${CABLE_SIZES_MM2.join(', ')}`
    );
  }

  const table = standard === 'AS_NZS_3008' ? AMPACITY_ASNZS : AMPACITY_IEC;
  const amps = table[method]?.[phases]?.[material]?.[insulation]?.[idx];

  if (amps == null) {
    if (material === 'Al' && sizeMm2 < 16) {
      throw new Error(
        `Aluminium conductors are not rated below 16 mm² (requested ${sizeMm2} mm²)`
      );
    }
    throw new Error(
      `No ampacity data for ${standard} method ${method}, ` +
      `${phases}-phase, ${material}, ${insulation}, ${sizeMm2} mm²`
    );
  }
  return amps;
}

// ---------------------------------------------------------------------------
// Derating factor functions
// ---------------------------------------------------------------------------

/**
 * Return the ambient temperature correction factor for the given conditions.
 * Interpolates linearly between the two nearest tabulated temperatures.
 *
 * @param {string} standard   — 'IEC_60364' | 'BS_7671' | 'AS_NZS_3008'
 * @param {string} insulation — 'PVC' | 'XLPE'
 * @param {number} ambientTemp — °C
 * @returns {number} correction factor (1.0 at reference temperature)
 */
export function getTempCorrectionFactor(standard, insulation, ambientTemp) {
  if (!Number.isFinite(ambientTemp)) {
    throw new Error('ambientTemp must be a finite number in °C');
  }
  if (insulation !== 'PVC' && insulation !== 'XLPE') {
    throw new Error('insulation must be PVC or XLPE');
  }

  const table = standard === 'AS_NZS_3008'
    ? TEMP_CORRECTION_ASNZS[insulation]
    : TEMP_CORRECTION_IEC[insulation];

  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const min = keys[0];
  const max = keys[keys.length - 1];

  if (ambientTemp < min || ambientTemp > max) {
    throw new Error(
      `Ambient temperature ${ambientTemp} °C is outside the tabulated range ` +
      `(${min}–${max} °C) for ${insulation} insulation under ${standard}`
    );
  }

  // Exact match
  if (table[ambientTemp] !== undefined) return table[ambientTemp];

  // Linear interpolation between adjacent tabulated values
  const lower = keys.filter(k => k <= ambientTemp).at(-1);
  const upper = keys.find(k => k > ambientTemp);
  const f = (ambientTemp - lower) / (upper - lower);
  return Math.round((table[lower] + f * (table[upper] - table[lower])) * 10000) / 10000;
}

/**
 * Return the grouping (bunching) derating factor.
 * Uses the enclosed-conduit table for Method B2; open-tray table for C, E, F.
 * For numbers of circuits beyond the highest tabulated value the lowest
 * tabulated factor is returned (conservative).
 *
 * @param {string} method    — installation method
 * @param {number} numGroups — number of circuits / cables grouped together (≥ 1)
 * @returns {number} grouping factor
 */
export function getGroupingFactor(method, numGroups) {
  if (!Number.isFinite(numGroups) || numGroups < 1) {
    throw new Error('numGroups must be a positive integer');
  }
  const n = Math.floor(numGroups);
  const table = method === 'B2' ? GROUPING_ENCLOSED : GROUPING_OPEN;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);

  // Exact match
  if (table[n] !== undefined) return table[n];

  // For values between tabulated points, interpolate
  const lower = keys.filter(k => k <= n).at(-1);
  const upper = keys.find(k => k > n);
  if (upper === undefined) return table[keys.at(-1)]; // beyond table maximum

  const f = (n - lower) / (upper - lower);
  return Math.round((table[lower] + f * (table[upper] - table[lower])) * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Main sizing functions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SizingParams
 * @property {string} standard    — 'IEC_60364' | 'BS_7671' | 'AS_NZS_3008'
 * @property {string} method      — 'B2' | 'C' | 'E' | 'F'
 * @property {number} phases      — 2 | 3
 * @property {string} material    — 'Cu' | 'Al'
 * @property {string} insulation  — 'PVC' | 'XLPE'
 * @property {number} loadAmps    — design current in amperes (Ib)
 * @property {number} [ambientTemp] — ambient temperature in °C (defaults to standard reference)
 * @property {number} [numGroups]   — number of grouped circuits (default 1)
 */

/**
 * @typedef {Object} SizingResult
 * @property {number|null} size           — recommended size in mm² (null if load cannot be met)
 * @property {number|null} baseAmpacity   — table ampacity at reference conditions (A)
 * @property {number|null} correctedAmpacity — derated ampacity (A)
 * @property {number}      tempFactor     — ambient temperature correction factor
 * @property {number}      groupFactor    — grouping derating factor
 * @property {number}      totalFactor    — tempFactor × groupFactor
 * @property {string}      status         — 'PASS' | 'UNDERSIZED' | 'NO_SIZE_AVAILABLE'
 * @property {string}      recommendation — human-readable guidance
 */

/**
 * Select the minimum standard cable size that satisfies the design current
 * after applying ambient temperature and grouping derating factors.
 *
 * @param {SizingParams} params
 * @returns {SizingResult}
 */
export function sizeCable(params) {
  const {
    standard,
    method,
    phases,
    material,
    insulation,
    loadAmps,
  } = params;

  const ambientTemp = params.ambientTemp ?? STANDARDS[standard].refAmbient;
  const numGroups   = params.numGroups   ?? 1;

  if (!Number.isFinite(loadAmps) || loadAmps <= 0) {
    throw new Error('loadAmps must be a positive finite number');
  }

  const tempFactor  = getTempCorrectionFactor(standard, insulation, ambientTemp);
  const groupFactor = getGroupingFactor(method, numGroups);
  const totalFactor = Math.round(tempFactor * groupFactor * 10000) / 10000;

  const minSize = material === 'Al' ? 16 : 1.5;
  const candidateSizes = CABLE_SIZES_MM2.filter(s => s >= minSize);

  for (const sizeMm2 of candidateSizes) {
    let baseAmpacity;
    try {
      baseAmpacity = lookupAmpacity(standard, method, phases, material, insulation, sizeMm2);
    } catch {
      continue; // skip sizes with no data for this combination
    }

    const correctedAmpacity = Math.round(baseAmpacity * totalFactor * 100) / 100;

    if (correctedAmpacity >= loadAmps) {
      const utilizationPct = Math.round((loadAmps / correctedAmpacity) * 1000) / 10;
      return {
        size:              sizeMm2,
        baseAmpacity,
        correctedAmpacity,
        tempFactor,
        groupFactor,
        totalFactor,
        status:           'PASS',
        recommendation:
          `Use ${sizeMm2} mm² ${material} ${insulation} cable. ` +
          `Derated ampacity ${correctedAmpacity} A ≥ design current ${loadAmps} A ` +
          `(${utilizationPct}% utilisation). ` +
          `Derating: temperature factor ${tempFactor} × grouping factor ${groupFactor} = ${totalFactor}.`,
      };
    }
  }

  // No standard size is sufficient
  const largest = candidateSizes.at(-1);
  let largestBase, largestCorrected;
  try {
    largestBase = lookupAmpacity(standard, method, phases, material, insulation, largest);
    largestCorrected = Math.round(largestBase * totalFactor * 100) / 100;
  } catch {
    largestBase = null;
    largestCorrected = null;
  }

  return {
    size:              null,
    baseAmpacity:      largestBase,
    correctedAmpacity: largestCorrected,
    tempFactor,
    groupFactor,
    totalFactor,
    status:           'NO_SIZE_AVAILABLE',
    recommendation:
      `Design current ${loadAmps} A exceeds the derated ampacity of the ` +
      `largest standard ${material} ${insulation} cable ` +
      `(${largest} mm², ${largestCorrected} A derated). ` +
      `Consider parallel conductors, a different installation method, ` +
      `or a lower ambient temperature.`,
  };
}

/**
 * Verify that a specific cable size is adequate for the given design current.
 *
 * @param {SizingParams & {size: number}} params — same as sizeCable but with explicit size
 * @returns {SizingResult}
 */
export function checkCableAdequacy(params) {
  const {
    standard,
    method,
    phases,
    material,
    insulation,
    loadAmps,
    size,
  } = params;

  if (!Number.isFinite(size) || !CABLE_SIZES_MM2.includes(size)) {
    throw new Error(
      `${size} mm² is not a standard size. Valid sizes: ${CABLE_SIZES_MM2.join(', ')}`
    );
  }
  if (!Number.isFinite(loadAmps) || loadAmps <= 0) {
    throw new Error('loadAmps must be a positive finite number');
  }

  const ambientTemp = params.ambientTemp ?? STANDARDS[standard].refAmbient;
  const numGroups   = params.numGroups   ?? 1;

  const tempFactor  = getTempCorrectionFactor(standard, insulation, ambientTemp);
  const groupFactor = getGroupingFactor(method, numGroups);
  const totalFactor = Math.round(tempFactor * groupFactor * 10000) / 10000;

  const baseAmpacity      = lookupAmpacity(standard, method, phases, material, insulation, size);
  const correctedAmpacity = Math.round(baseAmpacity * totalFactor * 100) / 100;
  const passes            = correctedAmpacity >= loadAmps;
  const utilizationPct    = Math.round((loadAmps / correctedAmpacity) * 1000) / 10;

  let recommendation;
  if (passes) {
    recommendation =
      `${size} mm² ${material} ${insulation} cable is ADEQUATE. ` +
      `Derated ampacity ${correctedAmpacity} A ≥ design current ${loadAmps} A ` +
      `(${utilizationPct}% utilisation). ` +
      `Derating: temperature factor ${tempFactor} × grouping factor ${groupFactor} = ${totalFactor}.`;
  } else {
    recommendation =
      `${size} mm² ${material} ${insulation} cable is UNDERSIZED. ` +
      `Derated ampacity ${correctedAmpacity} A < design current ${loadAmps} A. ` +
      `Upsize the cable or improve installation conditions. ` +
      `Derating: temperature factor ${tempFactor} × grouping factor ${groupFactor} = ${totalFactor}.`;
  }

  return {
    size,
    baseAmpacity,
    correctedAmpacity,
    tempFactor,
    groupFactor,
    totalFactor,
    status:        passes ? 'PASS' : 'UNDERSIZED',
    recommendation,
  };
}
