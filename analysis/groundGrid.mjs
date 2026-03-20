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
 * @param {boolean} [params.hasRods]  Whether corner/perimeter ground rods are present
 * @param {number}  [params.rhoS]   Surface layer resistivity (Ω·m); 0 = no layer
 * @param {number}  [params.hs]     Surface layer thickness (m); 0 = no layer
 * @param {50|70}   [params.bw]     Body weight for tolerable limits (kg, default 70)
 * @returns {object} Analysis results
 */
export function analyzeGroundGrid(params) {
  const {
    rho, gridLx, gridLy, nx, ny, h, d, Ig, tf,
    hasRods = false,
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

  // Grid geometry
  const A = gridLx * gridLy;                         // Grid area (m²)
  const Lp = 2 * (gridLx + gridLy);                  // Perimeter (m)
  const conductorLength = nx * gridLx + ny * gridLy;  // Total buried length (m)

  // Mesh spacing (average for non-square grids)
  const Dx = gridLx / (ny - 1);  // spacing between conductors running in x-direction
  const Dy = gridLy / (nx - 1);  // spacing between conductors running in y-direction
  const D = Math.sqrt(Dx * Dy);  // geometric mean spacing

  // Effective n
  const n = effectiveN(conductorLength, Lp, A);

  // Km and Ks
  const Km = meshFactor(D, h, d, n, hasRods);
  const Ks = stepFactor(D, h, n);
  const Ki = irregularityFactor(n);

  // Lm and Ls — effective lengths for voltage calculations (IEEE 80-2013 §16.5)
  // For grids without ground rods: Lm = Ls = L
  const Lm = conductorLength;
  const Ls = conductorLength;

  // Grid resistance
  const Rg = gridResistance(rho, conductorLength, A, h);

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
