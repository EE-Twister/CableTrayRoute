/**
 * Ground Grid / Substation Grounding Analysis
 * Per IEEE 80-2013 — IEEE Guide for Safety in AC Substation Grounding
 *
 * Methodology:
 *   Grid resistance (Sverak, IEEE 80-2013 Eq. 57):
 *     Rg = ρ/L + ρ/√(20A) × (1 + 1/(1 + h × √(20/A)))
 *
 *   Mesh voltage (IEEE 80-2013 Eq. 86):
 *     Em = ρ × Ig × Km × Ki / Lm
 *
 *   Step voltage (IEEE 80-2013 Eq. 92):
 *     Es = ρ × Ig × Ks × Ki / Ls
 *
 *   Ground potential rise:
 *     GPR = Ig × Rg
 *
 *   Tolerable touch voltage (50 kg, IEEE 80-2013 Eq. 32):
 *     Etouch50 = (1000 + 1.5 × Cs × ρs) × 0.116 / √tf
 *
 *   Tolerable step voltage (50 kg, IEEE 80-2013 Eq. 29):
 *     Estep50 = (1000 + 6 × Cs × ρs) × 0.116 / √tf
 *
 * References:
 *   IEEE 80-2013 — IEEE Guide for Safety in AC Substation Grounding
 *   ANSI/IEEE Std 80-2013 (Revision of IEEE Std 80-2000)
 */

/**
 * Compute the surface layer reduction factor Cs (IEEE 80-2013 Eq. 27).
 *
 * If no surface layer is present (hs = 0 or ρs === ρ), Cs = 1.
 *
 * @param {number} rho   Soil resistivity (Ω·m)
 * @param {number} rhoS  Surface layer resistivity (Ω·m). Use rho for no surface layer.
 * @param {number} hs    Surface layer thickness (m). Use 0 for no surface layer.
 * @returns {number} Cs — surface layer reduction factor (dimensionless, 0 < Cs ≤ 1)
 */
export function surfaceLayerFactor(rho, rhoS, hs) {
  if (hs <= 0 || rhoS <= 0) return 1;
  const K = (rho - rhoS) / (rho + rhoS);
  // Cs = 1 - (0.09 × (1 − ρ/ρs)) / (2hs + 0.09)
  // Using the simplified IEEE 80-2013 formula:
  return 1 - (0.09 * (1 - rho / rhoS)) / (2 * hs + 0.09);
}

/**
 * Compute grid resistance using Sverak formula (IEEE 80-2013 Eq. 57).
 *
 * @param {number} rho  Soil resistivity (Ω·m)
 * @param {number} L    Total length of buried conductors (m)
 * @param {number} A    Total grid area (m²)
 * @param {number} h    Burial depth of conductors (m)
 * @returns {number} Rg — grid resistance (Ω)
 */
export function gridResistance(rho, L, A, h) {
  if (L <= 0 || A <= 0 || h < 0) throw new Error('Invalid grid parameters');
  return rho / L + (rho / Math.sqrt(20 * A)) * (1 + 1 / (1 + h * Math.sqrt(20 / A)));
}

/**
 * Compute the n parameter (geometric mean number of parallel conductors)
 * per IEEE 80-2013 Eq. 85 for a rectangular grid.
 *
 * n = na × nb
 *   na = 2 × L / Lp                  (accounts for conductor density)
 *   nb = √(Lp / (4 × √A))           (accounts for aspect ratio)
 *
 * @param {number} L   Total buried conductor length (m)
 * @param {number} Lp  Perimeter of the grid (m)
 * @param {number} A   Grid area (m²)
 * @returns {number} n — effective number of parallel conductors
 */
export function effectiveN(L, Lp, A) {
  const na = (2 * L) / Lp;
  const nb = Math.sqrt(Lp / (4 * Math.sqrt(A)));
  return na * nb;
}

/**
 * Compute the mesh spacing correction factor Km (IEEE 80-2013 Eq. 81).
 *
 * For grids without ground rods (Kii = 1), or grids with rods at corners only.
 *
 * @param {number} D    Mesh spacing (m) — assumes uniform square mesh
 * @param {number} h    Burial depth (m)
 * @param {number} d    Conductor diameter (m)
 * @param {number} n    Effective number of parallel conductors
 * @param {boolean} hasRods  Whether perimeter rods are present
 * @returns {number} Km — geometric mesh factor (dimensionless)
 */
export function meshFactor(D, h, d, n, hasRods) {
  const Kii = hasRods ? 1 / (Math.pow(2 * n, 2 / n)) : 1;
  const Kh = Math.sqrt(1 + h / 1.0); // h0 = 1 m reference
  const term1 = Math.log((D * D) / (16 * h * d) + (D + 2 * h) * (D + 2 * h) / (8 * D * d) - h / (4 * d));
  const term2 = (Kii / Kh) * Math.log(8 / (Math.PI * (2 * n - 1)));
  return (1 / (2 * Math.PI)) * (term1 + term2);
}

/**
 * Compute the step voltage geometric factor Ks (IEEE 80-2013 Eq. 91).
 *
 * @param {number} D  Mesh spacing (m)
 * @param {number} h  Burial depth (m)
 * @param {number} n  Effective number of parallel conductors
 * @returns {number} Ks — step voltage geometric factor (dimensionless)
 */
export function stepFactor(D, h, n) {
  return (1 / Math.PI) * (1 / (2 * h) + 1 / (D + h) + (1 / D) * (1 - Math.pow(0.5, n - 2)));
}

/**
 * Compute the irregularity correction factor Ki (IEEE 80-2013 Eq. 89).
 *
 * @param {number} n  Effective number of parallel conductors
 * @returns {number} Ki — irregularity factor
 */
export function irregularityFactor(n) {
  return 0.644 + 0.148 * n;
}

/**
 * Tolerable touch voltage (IEEE 80-2013 Eq. 32/33).
 *
 * @param {number} Cs    Surface layer reduction factor (1 if no surface layer)
 * @param {number} rhoS  Surface layer resistivity (Ω·m); use soil resistivity if no layer
 * @param {number} tf    Fault duration (s)
 * @param {50|70} bw     Body weight (kg)
 * @returns {number} Etouch — tolerable touch voltage (V)
 */
export function tolerableTouch(Cs, rhoS, tf, bw) {
  const k = bw === 70 ? 0.157 : 0.116;
  return (1000 + 1.5 * Cs * rhoS) * k / Math.sqrt(tf);
}

/**
 * Tolerable step voltage (IEEE 80-2013 Eq. 29/30).
 *
 * @param {number} Cs    Surface layer reduction factor
 * @param {number} rhoS  Surface layer resistivity (Ω·m)
 * @param {number} tf    Fault duration (s)
 * @param {50|70} bw     Body weight (kg)
 * @returns {number} Estep — tolerable step voltage (V)
 */
export function tolerableStep(Cs, rhoS, tf, bw) {
  const k = bw === 70 ? 0.157 : 0.116;
  return (1000 + 6 * Cs * rhoS) * k / Math.sqrt(tf);
}

/**
 * Complete ground grid analysis per IEEE 80-2013.
 *
 * @param {object} params
 * @param {number} params.rho       Soil resistivity (Ω·m)
 * @param {number} params.gridLx    Grid length in x direction (m)
 * @param {number} params.gridLy    Grid width in y direction (m)
 * @param {number} params.nx        Number of conductors parallel to x axis (runs in y direction)
 * @param {number} params.ny        Number of conductors parallel to y axis (runs in x direction)
 * @param {number} params.h         Burial depth of conductors (m)
 * @param {number} params.d         Conductor diameter (m)
 * @param {number} params.Ig        Maximum grid current (A)
 * @param {number} params.tf        Fault duration (s)
 * @param {boolean} [params.hasRods]  Whether ground rods are present
 * @param {number}  [params.rodCount] Number of rods tied to the grid
 * @param {number}  [params.rodLength] Length of each rod (m)
 * @param {number}  [params.rhoS]   Surface layer resistivity (Ω·m); 0 = no layer
 * @param {number}  [params.hs]     Surface layer thickness (m); 0 = no layer
 * @param {50|70}   [params.bw]     Body weight for tolerable limits (kg, default 70)
 * @returns {object} Analysis results
 */
export function analyzeGroundGrid(params) {
  const {
    rho, gridLx, gridLy, nx, ny, h, d, Ig, tf,
    hasRods = false,
    rodCount = hasRods ? 4 : 0,
    rodLength = 0,
    rhoS = 0,
    hs = 0,
    bw = 70
  } = params;

  // Validate inputs
  if (rho <= 0) throw new Error('Soil resistivity must be positive');
  if (gridLx <= 0 || gridLy <= 0) throw new Error('Grid dimensions must be positive');
  if (nx < 2 || ny < 2) throw new Error('At least 2 conductors required in each direction');
  if (h <= 0) throw new Error('Burial depth must be positive');
  if (d <= 0) throw new Error('Conductor diameter must be positive');
  if (Ig <= 0) throw new Error('Grid current must be positive');
  if (tf <= 0) throw new Error('Fault duration must be positive');
  if (!Number.isFinite(rodCount) || rodCount < 0) throw new Error('Rod count must be non-negative');
  if (!Number.isFinite(rodLength) || rodLength < 0) throw new Error('Rod length must be non-negative');

  // Grid geometry
  const A = gridLx * gridLy;                         // Grid area (m²)
  const Lp = 2 * (gridLx + gridLy);                  // Perimeter (m)
  const conductorLength = nx * gridLx + ny * gridLy;  // Total buried length (m)
  const totalRodLength = hasRods ? rodCount * rodLength : 0;
  const effectiveLength = conductorLength + totalRodLength;

  // Mesh spacing (average for non-square grids)
  const Dx = gridLx / (ny - 1);  // spacing between conductors running in x-direction
  const Dy = gridLy / (nx - 1);  // spacing between conductors running in y-direction
  const D = Math.sqrt(Dx * Dy);  // geometric mean spacing

  // Effective n
  const n = effectiveN(effectiveLength, Lp, A);

  // Km and Ks
  const Km = meshFactor(D, h, d, n, hasRods);
  const Ks = stepFactor(D, h, n);
  const Ki = irregularityFactor(n);

  // Lm and Ls — effective lengths for voltage calculations (IEEE 80-2013 §16.5)
  // For grids without ground rods: Lm = Ls = L
  const Lm = effectiveLength;
  const Ls = effectiveLength;

  // Grid resistance
  const Rg = gridResistance(rho, effectiveLength, A, h);

  // Ground potential rise
  const GPR = Ig * Rg;

  // Mesh and step voltages
  const Em = (rho * Ig * Km * Ki) / Lm;
  const Es = (rho * Ig * Ks * Ki) / Ls;

  // Surface layer factor
  const effectiveRhoS = rhoS > 0 ? rhoS : rho;
  const effectiveHs = hs > 0 ? hs : 0;
  const Cs = surfaceLayerFactor(rho, effectiveRhoS, effectiveHs);

  // Tolerable voltages
  const Etouch = tolerableTouch(Cs, effectiveRhoS, tf, bw);
  const Estep = tolerableStep(Cs, effectiveRhoS, tf, bw);

  return {
    // Grid geometry
    A,
    Lp,
    conductorLength,
    totalRodLength,
    effectiveLength,
    rodCount,
    rodLength,
    D,
    Dx,
    Dy,
    n,
    // Correction factors
    Km,
    Ks,
    Ki,
    Cs,
    // Results
    Rg,
    GPR,
    Em,
    Es,
    // Tolerable limits
    Etouch,
    Estep,
    // Safety assessment
    touchSafe: Em <= Etouch,
    stepSafe: Es <= Estep,
    gprExceedsTouch: GPR > Etouch
  };
}

/**
 * Run IEEE 80 grid analysis using a fitted two-layer soil model.
 *
 * Per IEEE 80-2013 §12.4, when a two-layer soil model is available the top-layer
 * resistivity rho1 is used as the effective uniform resistivity for mesh/step
 * voltage calculations (conservative for most cases where rho1 ≥ rho2).
 *
 * @param {object} params          Same as analyzeGroundGrid()
 * @param {{rho1: number, rho2: number, h: number}|null} soilModel
 *   Fitted two-layer soil. If null, falls back to params.rho.
 * @returns {object} Same shape as analyzeGroundGrid() plus {usedTwoLayer, effectiveRho}
 */
export function analyzeGroundGridWithSoil(params, soilModel) {
  let effectiveRho = params.rho;
  let usedTwoLayer = false;

  if (soilModel && soilModel.rho1 > 0) {
    effectiveRho = soilModel.rho1;
    usedTwoLayer = true;
  }

  const result = analyzeGroundGrid({ ...params, rho: effectiveRho });
  return { ...result, usedTwoLayer, effectiveRho };
}

/**
 * Run IEEE 80 grid analysis for an irregular (polygon) grid.
 *
 * The polygon geometry (area, perimeter, total conductor length) is computed
 * from the vertices and mesh spacing, then the standard IEEE 80 formulas are
 * applied. This is an engineering approximation — IEEE 80 formulas are strictly
 * derived for rectangular grids; polygon equivalence is documented in the study
 * basis as a limitation.
 *
 * @param {object} params
 * @param {Array<{x: number, y: number}>} params.vertices   Perimeter corners (m)
 * @param {number} params.spacingX   Interior mesh spacing in x direction (m)
 * @param {number} params.spacingY   Interior mesh spacing in y direction (m)
 * @param {number} params.h          Burial depth (m)
 * @param {number} params.d          Conductor diameter (m)
 * @param {number} params.Ig         Maximum grid current (A)
 * @param {number} params.tf         Fault duration (s)
 * @param {boolean} [params.hasRods]
 * @param {number}  [params.rodCount]
 * @param {number}  [params.rodLength]
 * @param {number}  [params.rhoS]
 * @param {number}  [params.hs]
 * @param {50|70}   [params.bw]
 * @param {number}  params.rho  Soil resistivity (Ω·m) — or pass soilModel instead
 * @param {{rho1: number, rho2: number, h: number}|null} [soilModel]
 * @returns {object} Same shape as analyzeGroundGrid() plus {isIrregular, vertices, polygonArea, polygonPerimeter}
 */
export function analyzeIrregularGrid(params, soilModel = null) {
  const {
    vertices, spacingX, spacingY, h, d, Ig, tf,
    hasRods = false, rodCount = hasRods ? 4 : 0, rodLength = 0,
    rhoS = 0, hs = 0, bw = 70,
  } = params;

  if (!vertices || vertices.length < 3) throw new Error('At least 3 polygon vertices required');
  if (spacingX <= 0 || spacingY <= 0) throw new Error('Mesh spacing must be positive');

  // Polygon area via shoelace
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  area = Math.abs(area) / 2;

  // Perimeter
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = vertices[j].x - vertices[i].x;
    const dy = vertices[j].y - vertices[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  // Approximate bounding box for conductor count estimate
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
  }
  const nxEst = Math.max(2, Math.round((maxX - minX) / spacingX) + 1);
  const nyEst = Math.max(2, Math.round((maxY - minY) / spacingY) + 1);

  // Conductor length: sum of horizontal + vertical runs (approximate for polygon)
  // Use fill fraction relative to bounding box
  const fillFraction = area / ((maxX - minX) * (maxY - minY));
  const conductorLength = (nxEst * (maxX - minX) + nyEst * (maxY - minY)) * fillFraction +
                          perimeter;  // perimeter conductors always present

  const totalRodLength = hasRods ? rodCount * rodLength : 0;
  const effectiveLength = conductorLength + totalRodLength;

  // Effective mesh spacing (geometric mean of x and y spacings)
  const D = Math.sqrt(spacingX * spacingY);

  // Reuse formula functions defined earlier in this module
  const nEff = effectiveN(effectiveLength, perimeter, area);
  const Km  = meshFactor(D, h, d, nEff, hasRods);
  const Ks  = stepFactor(D, h, nEff);
  const Ki  = irregularityFactor(nEff);

  const effectiveRho = (soilModel && soilModel.rho1 > 0) ? soilModel.rho1 : params.rho;
  const Rg  = gridResistance(effectiveRho, effectiveLength, area, h);
  const GPR = Ig * Rg;
  const Em  = (effectiveRho * Ig * Km * Ki) / effectiveLength;
  const Es  = (effectiveRho * Ig * Ks * Ki) / effectiveLength;

  const effectiveRhoS = rhoS > 0 ? rhoS : effectiveRho;
  const Cs   = surfaceLayerFactor(effectiveRho, effectiveRhoS, hs > 0 ? hs : 0);
  const Etouch = tolerableTouch(Cs, effectiveRhoS, tf, bw);
  const Estep  = tolerableStep(Cs, effectiveRhoS, tf, bw);

  return {
    A: area, Lp: perimeter, conductorLength, totalRodLength, effectiveLength,
    D, n: nEff, Km, Ks, Ki, Cs, Rg, GPR, Em, Es, Etouch, Estep,
    touchSafe: Em <= Etouch, stepSafe: Es <= Estep, gprExceedsTouch: GPR > Etouch,
    isIrregular: true, vertices,
    polygonArea: area, polygonPerimeter: perimeter,
    usedTwoLayer: soilModel != null, effectiveRho,
  };
}
