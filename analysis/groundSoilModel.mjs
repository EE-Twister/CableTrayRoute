/**
 * Advanced Grounding: Soil Model, Irregular Grid, and Hazard Map
 * Gap #74 — CableTrayRoute competitor feature parity with SES CDEGS / XGSLab / SKM GroundMat
 *
 * IMPORTANT LIMITATION: All hazard-map calculations in this module use a simplified
 * superposition / screening-level approximation, NOT a full boundary element method
 * (BEM) or finite element method (FEM). Results are suitable for preliminary design
 * review and shall not be used as a substitute for a full numerical grounding study
 * performed with tools such as SES CDEGS, XGSLab, or equivalent.
 *
 * Standards:
 *   IEEE 80-2013 — IEEE Guide for Safety in AC Substation Grounding
 *   ANSI/ASTM G57 — Field Measurement of Soil Resistivity (Wenner four-electrode method)
 *   Sunde (1968) — Earth Conduction Effects in Transmission Systems, image method
 */

// ---------------------------------------------------------------------------
// Two-layer soil model: Wenner apparent resistivity (Sunde image method)
// ---------------------------------------------------------------------------

/**
 * Compute the Wenner apparent resistivity for a two-layer soil using Sunde's
 * image method (N terms of the series).
 *
 * Formula (Sunde 1968, adapted for Wenner array):
 *   ρa(a) = ρ1 × [1 + 4 × Σ_{n=1}^{N} Kⁿ × f(n, a, h)]
 *   f(n, a, h) = 1/√(1 + (2nh/a)²) − 1/√(4 + (2nh/a)²)
 *   K = (ρ2 − ρ1) / (ρ2 + ρ1)    reflection coefficient
 *
 * Boundary behaviour:
 *   a → 0:  ρa → ρ1   (shallow measurement samples top layer only)
 *   a → ∞:  ρa → ρ2   (deep measurement samples bottom layer)
 *   ρ1 = ρ2: ρa = ρ1  (homogeneous soil)
 *
 * @param {number} rho1    Top-layer resistivity (Ω·m), must be > 0
 * @param {number} rho2    Bottom-layer resistivity (Ω·m), must be > 0
 * @param {number} h       Top-layer thickness (m), must be > 0
 * @param {number} a       Wenner electrode spacing (m), must be > 0
 * @param {number} [nTerms] Number of image terms. Default: sum until the terms are
 *   negligible (the series converges slowly when |K| is near 1, e.g. rock under clay:
 *   8 terms returns 16 Ω·m instead of 94 Ω·m for ρ2/ρ1 = 100 at large spacing).
 * @returns {number} Apparent resistivity ρa (Ω·m)
 */
export function wennerApparentResistivity(rho1, rho2, h, a, nTerms) {
  if (!(rho1 > 0) || !(rho2 > 0) || !(h > 0) || !(a > 0)) {
    throw new Error('All parameters must be positive');
  }
  const K = (rho2 - rho1) / (rho2 + rho1);
  // |K| < 1 so the tail is geometric; cap generously for |K| very close to 1.
  const maxTerms = Number.isFinite(nTerms) && nTerms > 0 ? Math.floor(nTerms) : 20000;
  let series = 0;
  for (let n = 1; n <= maxTerms; n++) {
    const ratio = (2 * n * h) / a;
    series += Math.pow(K, n) * (
      1 / Math.sqrt(1 + ratio * ratio) -
      1 / Math.sqrt(4 + ratio * ratio)
    );
    if (maxTerms === 20000 && Math.abs(K) ** n < 1e-10) break;
  }
  return rho1 * (1 + 4 * series);
}

// ---------------------------------------------------------------------------
// Two-layer soil model fitting
// ---------------------------------------------------------------------------

/**
 * Compute RMS relative error between measured and model-predicted apparent
 * resistivities.
 *
 * @param {number} rho1
 * @param {number} rho2
 * @param {number} h
 * @param {Array<{a: number, rhoA: number}>} measurements
 * @returns {number} RMS relative error (fraction, not percent)
 */
function rmsRelativeError(rho1, rho2, h, measurements) {
  let sumSq = 0;
  for (const m of measurements) {
    const predicted = wennerApparentResistivity(rho1, rho2, h, m.a);
    const rel = (predicted - m.rhoA) / m.rhoA;
    sumSq += rel * rel;
  }
  return Math.sqrt(sumSq / measurements.length);
}

/**
 * Fit a two-layer soil model to Wenner apparent resistivity field measurements.
 *
 * Algorithm:
 *   1. Coarse logarithmic grid search over (rho1, rho2, h) to find global minimum region
 *   2. Nelder-Mead simplex refinement from the best coarse point
 *
 * @param {Array<{a: number, rhoA: number}>} measurements
 *   Array of at least 3 measurements with electrode spacing `a` (m) and
 *   measured apparent resistivity `rhoA` (Ω·m). Sort order does not matter.
 * @returns {{rho1: number, rho2: number, h: number, fitError: number}}
 *   Fitted parameters; `fitError` is RMS relative error as a percentage.
 * @throws {Error} If fewer than 3 measurements are provided
 */
export function fitTwoLayerSoil(measurements) {
  if (!measurements || measurements.length < 3) {
    throw new Error('At least 3 Wenner measurements required for two-layer soil fitting');
  }
  if (measurements.some(m => !(m?.a > 0) || !(m?.rhoA > 0))) {
    throw new Error('Each Wenner measurement needs a spacing a > 0 and an apparent resistivity rhoA > 0');
  }

  // --- Coarse grid search (log-space) ---
  const rho1Candidates = [10, 30, 100, 300, 1000, 3000, 10000];
  const rho2Candidates = [10, 30, 100, 300, 1000, 3000, 10000];
  const hCandidates   = [0.5, 1, 2, 4, 8, 15, 25];

  let bestErr = Infinity;
  let bestRho1 = 100, bestRho2 = 100, bestH = 2;

  for (const rho1 of rho1Candidates) {
    for (const rho2 of rho2Candidates) {
      for (const h of hCandidates) {
        const err = rmsRelativeError(rho1, rho2, h, measurements);
        if (err < bestErr) {
          bestErr = err;
          bestRho1 = rho1;
          bestRho2 = rho2;
          bestH = h;
        }
      }
    }
  }

  // --- Nelder-Mead simplex refinement in log space ---
  // Work in log space so all parameters stay positive
  let p = [Math.log(bestRho1), Math.log(bestRho2), Math.log(bestH)];

  function cost(lp) {
    const r1 = Math.exp(lp[0]);
    const r2 = Math.exp(lp[1]);
    const hv = Math.exp(lp[2]);
    return rmsRelativeError(r1, r2, hv, measurements);
  }

  // Build initial simplex
  const step = 0.5; // log-space step
  let simplex = [
    [...p],
    [p[0] + step, p[1],        p[2]       ],
    [p[0],        p[1] + step, p[2]       ],
    [p[0],        p[1],        p[2] + step],
  ];
  let vals = simplex.map(cost);

  const alpha = 1.0, gamma = 2.0, rho = 0.5, sigma = 0.5;
  const maxIter = 500;

  for (let iter = 0; iter < maxIter; iter++) {
    // Sort by cost
    const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i]);
    vals    = order.map(([v])   => v);

    if (vals[vals.length - 1] - vals[0] < 1e-8) break;

    // Centroid (exclude worst)
    const n = simplex[0].length;
    const centroid = Array(n).fill(0);
    for (let i = 0; i < simplex.length - 1; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= (simplex.length - 1);

    // Reflection
    const worst = simplex[simplex.length - 1];
    const reflected = centroid.map((c, j) => c + alpha * (c - worst[j]));
    const rVal = cost(reflected);

    if (rVal < vals[0]) {
      // Expansion
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      const eVal = cost(expanded);
      if (eVal < rVal) {
        simplex[simplex.length - 1] = expanded;
        vals[vals.length - 1] = eVal;
      } else {
        simplex[simplex.length - 1] = reflected;
        vals[vals.length - 1] = rVal;
      }
    } else if (rVal < vals[vals.length - 2]) {
      simplex[simplex.length - 1] = reflected;
      vals[vals.length - 1] = rVal;
    } else {
      // Contraction
      const contracted = centroid.map((c, j) => c + rho * (worst[j] - c));
      const cVal = cost(contracted);
      if (cVal < vals[vals.length - 1]) {
        simplex[simplex.length - 1] = contracted;
        vals[vals.length - 1] = cVal;
      } else {
        // Shrink
        const best = simplex[0];
        for (let i = 1; i < simplex.length; i++) {
          simplex[i] = simplex[i].map((x, j) => best[j] + sigma * (x - best[j]));
          vals[i] = cost(simplex[i]);
        }
      }
    }
  }

  const finalP = simplex[0];
  const rho1 = Math.exp(finalP[0]);
  const rho2 = Math.exp(finalP[1]);
  const hFit = Math.exp(finalP[2]);
  const fitError = rmsRelativeError(rho1, rho2, hFit, measurements) * 100; // as percent

  return { rho1, rho2, h: hFit, fitError };
}

// ---------------------------------------------------------------------------
// Risk point classification
// ---------------------------------------------------------------------------

/**
 * Classify the risk level at a single point given computed touch and step voltages.
 *
 * @param {number} touchV          Computed touch voltage (V)
 * @param {number} stepV           Computed step voltage (V)
 * @param {number} tolerableTouch  Tolerable touch voltage limit (V)
 * @param {number} tolerableStep   Tolerable step voltage limit (V)
 * @returns {'safe'|'touch-risk'|'step-risk'|'both-risk'}
 */
export function classifyRiskPoint(touchV, stepV, tolerableTouch, tolerableStep) {
  const touchFail = touchV > tolerableTouch;
  const stepFail  = stepV  > tolerableStep;
  if (touchFail && stepFail) return 'both-risk';
  if (touchFail)             return 'touch-risk';
  if (stepFail)              return 'step-risk';
  return 'safe';
}

// ---------------------------------------------------------------------------
// Polygon grid geometry
// ---------------------------------------------------------------------------

/**
 * Generate conductor segment list from a polygon perimeter + interior mesh.
 *
 * The interior mesh follows the bounding box of the polygon, clipping segments
 * to inside the polygon using a simple point-in-polygon test.
 *
 * @param {Array<{x: number, y: number}>} vertices  Perimeter corners (metres)
 * @param {number} meshSpacing   Interior mesh spacing (m)
 * @param {number} depth         Burial depth (m, positive = below grade)
 * @param {Array<{x: number, y: number}>} [rodLocations=[]]  Rod positions
 * @returns {{
 *   conductors: Array<{x1,y1,z1,x2,y2,z2}>,
 *   rods: Array<{x,y,z1,z2}>,
 *   area: number,
 *   perimeter: number,
 *   centroid: {x, y},
 *   totalConductorLength: number,
 *   bounds: {minX, maxX, minY, maxY}
 * }}
 */
export function buildPolygonGeometry(vertices, meshSpacing, depth, rodLocations = []) {
  if (!vertices || vertices.length < 3) {
    throw new Error('At least 3 vertices required');
  }
  if (!(meshSpacing > 0)) throw new Error('meshSpacing must be positive');
  if (!(depth > 0)) throw new Error('depth must be positive');

  const z = -depth; // conductor elevation (below grade)

  // --- Bounding box ---
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }

  // --- Polygon area (shoelace) ---
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  area = Math.abs(area) / 2;

  // --- Perimeter ---
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = vertices[j].x - vertices[i].x;
    const dy = vertices[j].y - vertices[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  // --- Centroid ---
  let cx = 0, cy = 0;
  for (const v of vertices) { cx += v.x; cy += v.y; }
  const centroid = { x: cx / n, y: cy / n };

  // Point-in-polygon test (ray casting)
  function insidePolygon(px, py) {
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const conductors = [];

  // --- Perimeter conductors ---
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    conductors.push({ x1: vertices[i].x, y1: vertices[i].y, z1: z,
                      x2: vertices[j].x, y2: vertices[j].y, z2: z });
  }

  // --- Interior mesh (x-direction runs) ---
  // Snap grid start to nearest mesh multiple from minX
  const gridStartX = Math.ceil(minX / meshSpacing) * meshSpacing;
  const gridStartY = Math.ceil(minY / meshSpacing) * meshSpacing;

  // X-direction conductors (horizontal runs clipped to polygon)
  for (let y = gridStartY; y <= maxY + 1e-9; y += meshSpacing) {
    // Collect intersection x-values with polygon edges at this y
    const xIntersects = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const yi = vertices[i].y, yj = vertices[j].y;
      if ((yi <= y && yj > y) || (yj <= y && yi > y)) {
        const xi = vertices[i].x, xj = vertices[j].x;
        xIntersects.push(xi + (y - yi) / (yj - yi) * (xj - xi));
      }
    }
    xIntersects.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xIntersects.length; k += 2) {
      const x1 = xIntersects[k], x2 = xIntersects[k + 1];
      if (x2 - x1 > 0.01) {
        conductors.push({ x1, y1: y, z1: z, x2, y2: y, z2: z });
      }
    }
  }

  // Y-direction conductors (vertical runs clipped to polygon)
  for (let x = gridStartX; x <= maxX + 1e-9; x += meshSpacing) {
    const yIntersects = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = vertices[i].x, xj = vertices[j].x;
      if ((xi <= x && xj > x) || (xj <= x && xi > x)) {
        const yi = vertices[i].y, yj = vertices[j].y;
        yIntersects.push(yi + (x - xi) / (xj - xi) * (yj - yi));
      }
    }
    yIntersects.sort((a, b) => a - b);
    for (let k = 0; k + 1 < yIntersects.length; k += 2) {
      const y1 = yIntersects[k], y2 = yIntersects[k + 1];
      if (y2 - y1 > 0.01) {
        conductors.push({ x1: x, y1, z1: z, x2: x, y2, z2: z });
      }
    }
  }

  // --- Total conductor length ---
  let totalConductorLength = 0;
  for (const c of conductors) {
    const dx = c.x2 - c.x1, dy = c.y2 - c.y1, dz = c.z2 - c.z1;
    totalConductorLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // --- Ground rods ---
  const rodDepth = 3; // default rod depth (m) — callers should pass this explicitly
  const rods = (rodLocations || []).map(r => ({
    x: r.x, y: r.y, z1: z, z2: z - (r.length || rodDepth)
  }));

  return { conductors, rods, area, perimeter, centroid, totalConductorLength,
           bounds: { minX, maxX, minY, maxY } };
}

// ---------------------------------------------------------------------------
// Hazard map: surface potential estimation
// ---------------------------------------------------------------------------

/**
 * Potential (V) at (px, py, pz) of a buried conductor carrying uniformly distributed
 * leakage current `current` in a homogeneous half-space (surface at z = 0, conductors
 * at z < 0). Each segment is integrated exactly (line source plus its image above
 * grade) instead of being lumped at its midpoint:
 *
 *   V = ρ I / (4π L) × [asinh((L − s)/d) + asinh(s/d)] × (1 + image term)
 *
 * where s is the projection of the point on the segment and d its distance to the line.
 * At the surface the image term equals the direct term, which gives the familiar
 * ρ I / (2π r) far field.
 */
function segmentPotential(c, px, py, pz, rho, current, wireRadius = 0.005) {
  const dx = c.x2 - c.x1, dy = c.y2 - c.y1, dz = c.z2 - c.z1;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!(L > 0)) return 0;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  const line = (ax, ay, az) => {
    const vx = px - ax, vy = py - ay, vz = pz - az;
    const sProj = vx * ux + vy * uy + vz * uz;
    const d2 = Math.max(vx * vx + vy * vy + vz * vz - sProj * sProj, wireRadius * wireRadius);
    const d = Math.sqrt(d2);
    return Math.asinh((L - sProj) / d) + Math.asinh(sProj / d);
  };
  const direct = line(c.x1, c.y1, c.z1);
  // Image source: mirror of the segment about the earth surface (z -> -z)
  const image = (() => {
    const imC = { x1: c.x1, y1: c.y1, z1: -c.z1 };
    const uzi = -uz;
    const vx = px - imC.x1, vy = py - imC.y1, vz = pz - imC.z1;
    const sProj = vx * ux + vy * uy + vz * uzi;
    const d2 = Math.max(vx * vx + vy * vy + vz * vz - sProj * sProj, wireRadius * wireRadius);
    const d = Math.sqrt(d2);
    return Math.asinh((L - sProj) / d) + Math.asinh(sProj / d);
  })();
  return (rho * current) / (4 * Math.PI * L) * (direct + image);
}

/**
 * Estimate the earth-surface potential at a point (px, py) for a grid whose
 * conductors leak current uniformly per unit length.
 *
 * SCREENING ONLY — not a BEM/FEM solution. Leakage is assumed uniform along the
 * conductors (real grids leak more near the perimeter), soil is homogeneous, and
 * the absolute level is normalised separately by buildHazardMap so that the mean
 * conductor potential equals GPR = Ig × Rg.
 *
 * @param {{x: number, y: number}} point   Surface evaluation point
 * @param {Array<{x1,y1,z1,x2,y2,z2}>} conductors  Grid conductor segments
 * @param {number} rho    Soil resistivity (Ω·m)
 * @param {number} Ig     Maximum grid current (A)
 * @param {number} totalLength  Total conductor length (m), used for current distribution
 * @returns {number} Estimated surface potential (V)
 */
export function estimateSurfacePotential(point, conductors, rho, Ig, totalLength) {
  if (!conductors || conductors.length === 0 || !(totalLength > 0)) return 0;
  let V = 0;
  for (const c of conductors) {
    const dx = c.x2 - c.x1, dy = c.y2 - c.y1, dz = c.z2 - c.z1;
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    V += segmentPotential(c, point.x, point.y, 0, rho, Ig * (segLen / totalLength));
  }
  return V;
}

/**
 * Mean potential (V) on the conductor surfaces for the same uniform-leakage model.
 * Used to scale the map so the grid sits at GPR.
 */
function meanConductorPotential(conductors, rho, Ig, totalLength) {
  let weighted = 0;
  let lengthSum = 0;
  for (const c of conductors) {
    const dx = c.x2 - c.x1, dy = c.y2 - c.y1, dz = c.z2 - c.z1;
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(segLen > 0)) continue;
    const probe = { x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2, z: (c.z1 + c.z2) / 2 };
    let v = 0;
    for (const o of conductors) {
      const ox = o.x2 - o.x1, oy = o.y2 - o.y1, oz = o.z2 - o.z1;
      const oLen = Math.sqrt(ox * ox + oy * oy + oz * oz);
      v += segmentPotential(o, probe.x, probe.y, probe.z + 0.005, rho, Ig * (oLen / totalLength));
    }
    weighted += v * segLen;
    lengthSum += segLen;
  }
  return lengthSum > 0 ? weighted / lengthSum : 0;
}

/**
 * Build a hazard map grid over the bounding area of a ground grid.
 *
 * For each grid point the function computes:
 *   - Surface potential V(x, y)
 *   - Touch voltage: difference between grid potential (GPR) and surface potential
 *   - Step voltage: potential difference between adjacent 1-metre points
 *   - Risk classification
 *
 * @param {{
 *   conductors: Array<{x1,y1,z1,x2,y2,z2}>,
 *   totalConductorLength: number,
 *   bounds: {minX, maxX, minY, maxY}
 * }} gridGeometry  Output of buildPolygonGeometry or constructed from rectangular grid
 * @param {number} rho            Soil resistivity (Ω·m)
 * @param {number} Ig             Maximum grid current (A)
 * @param {number} Rg             Grid resistance (Ω) used to compute GPR
 * @param {number} etouchLimit    Tolerable touch voltage (V)
 * @param {number} estepLimit     Tolerable step voltage (V)
 * @param {number} [resolution=2] Grid spacing for map (m)
 * @returns {Array<{x,y,surfaceV,touchV,stepV,riskClass}>}
 *   Flat array of map cells. `_method` field is 'screening-superposition'.
 */
export function buildHazardMap(gridGeometry, rho, Ig, Rg, etouchLimit, estepLimit, resolution = 2) {
  const { conductors, totalConductorLength, bounds } = gridGeometry;
  const { minX, maxX, minY, maxY } = bounds;
  const GPR = Ig * Rg;
  // Normalise the uniform-leakage potential so the conductors sit at GPR = Ig × Rg.
  const meanV = meanConductorPotential(conductors, rho, Ig, totalConductorLength);
  const scale = meanV > 0 ? GPR / meanV : 1;

  // Pre-compute surface potential for all grid points
  const xs = [];
  const ys = [];
  for (let x = minX - resolution; x <= maxX + resolution + 1e-9; x += resolution) xs.push(x);
  for (let y = minY - resolution; y <= maxY + resolution + 1e-9; y += resolution) ys.push(y);

  const result = [];

  for (const y of ys) {
    for (const x of xs) {
      const surfaceV = scale * estimateSurfacePotential({ x, y }, conductors, rho, Ig, totalConductorLength);

      // Touch voltage: person stands at grid edge, touches energised structure = GPR
      const touchV = Math.max(0, GPR - surfaceV);

      // Step voltage: 1-metre step in x direction
      const surfaceV1m = scale * estimateSurfacePotential({ x: x + 1, y }, conductors, rho, Ig, totalConductorLength);
      const stepV = Math.abs(surfaceV - surfaceV1m);

      const riskClass = classifyRiskPoint(touchV, stepV, etouchLimit, estepLimit);

      result.push({
        x, y, surfaceV, touchV, stepV, riskClass,
        _method: 'screening-superposition'
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Risk-point evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate named inspection points against a pre-computed hazard map.
 *
 * Nearest-neighbour lookup from hazardMapData array.
 *
 * @param {Array<{id: string, label: string, x: number, y: number}>} inspectionPoints
 * @param {Array<{x,y,touchV,stepV,riskClass}>} hazardMapData  Output of buildHazardMap
 * @param {number} etouchLimit  Tolerable touch voltage (V)
 * @param {number} estepLimit   Tolerable step voltage (V)
 * @returns {Array<{id,label,x,y,touchV,stepV,riskClass,touchMarginPct,stepMarginPct}>}
 */
export function evaluateRiskPoints(inspectionPoints, hazardMapData, etouchLimit, estepLimit) {
  return inspectionPoints.map(pt => {
    // Find nearest cell in hazard map
    let nearest = null;
    let minDist = Infinity;
    for (const cell of hazardMapData) {
      const d = (cell.x - pt.x) ** 2 + (cell.y - pt.y) ** 2;
      if (d < minDist) { minDist = d; nearest = cell; }
    }

    if (!nearest) {
      return { ...pt, touchV: 0, stepV: 0, riskClass: 'safe', touchMarginPct: 100, stepMarginPct: 100 };
    }

    const touchMarginPct = etouchLimit > 0
      ? ((etouchLimit - nearest.touchV) / etouchLimit) * 100
      : 0;
    const stepMarginPct = estepLimit > 0
      ? ((estepLimit - nearest.stepV) / estepLimit) * 100
      : 0;

    return {
      id: pt.id,
      label: pt.label,
      x: pt.x,
      y: pt.y,
      touchV: nearest.touchV,
      stepV: nearest.stepV,
      riskClass: nearest.riskClass,
      touchMarginPct,
      stepMarginPct,
    };
  });
}

// ---------------------------------------------------------------------------
// Helper: build rectangular geometry from IEEE 80 params for hazard map
// ---------------------------------------------------------------------------

/**
 * Convert rectangular IEEE 80 grid parameters into a geometry object compatible
 * with buildHazardMap, without requiring a polygon vertex list.
 *
 * @param {number} gridLx   Grid length (m)
 * @param {number} gridLy   Grid width (m)
 * @param {number} nx       Number of conductors in x direction
 * @param {number} ny       Number of conductors in y direction
 * @param {number} depth    Burial depth (m)
 * @returns geometry object with conductors, totalConductorLength, bounds, centroid
 */
export function buildRectangularGeometry(gridLx, gridLy, nx, ny, depth) {
  const z = -depth;
  const conductors = [];

  // x-direction conductors (parallel to x-axis) — nx conductors spanning gridLx
  const ySpacing = nx > 1 ? gridLy / (nx - 1) : 0;
  for (let i = 0; i < nx; i++) {
    const y = i * ySpacing;
    conductors.push({ x1: 0, y1: y, z1: z, x2: gridLx, y2: y, z2: z });
  }

  // y-direction conductors (parallel to y-axis) — ny conductors spanning gridLy
  const xSpacing = ny > 1 ? gridLx / (ny - 1) : 0;
  for (let j = 0; j < ny; j++) {
    const x = j * xSpacing;
    conductors.push({ x1: x, y1: 0, z1: z, x2: x, y2: gridLy, z2: z });
  }

  let totalConductorLength = 0;
  for (const c of conductors) {
    const dx = c.x2 - c.x1, dy = c.y2 - c.y1, dz = c.z2 - c.z1;
    totalConductorLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return {
    conductors,
    rods: [],
    area: gridLx * gridLy,
    perimeter: 2 * (gridLx + gridLy),
    centroid: { x: gridLx / 2, y: gridLy / 2 },
    totalConductorLength,
    bounds: { minX: 0, maxX: gridLx, minY: 0, maxY: gridLy },
  };
}
