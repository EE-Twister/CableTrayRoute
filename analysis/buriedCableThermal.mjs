/**
 * Mutual heating between buried line heat sources (IEC 60287-2-1 image method).
 *
 * For equally loaded cables, the external thermal resistance of cable p is
 * increased by the heat that every other cable k adds at p's position:
 *
 *   ΔT4_p = (ρ / 2π) · Σ_{k≠p} ln(d′_pk / d_pk)
 *
 * where d_pk is the distance between p and k, and d′_pk the distance from p to
 * the image of k reflected in the soil surface. Because every cable dissipates
 * the same loss per metre, the result can be added to T4 in the rating formula
 * (see the externalT4Extra input of calcAmpacity in iec60287.mjs).
 *
 * Pure module — no DOM, no storage access.
 */

/**
 * @param {{x:number,y:number}[]} sources  Cable centres in mm; y is depth below grade
 * @param {number} index                   Cable whose extra T4 is wanted
 * @param {number} soilResistivity         Soil thermal resistivity ρ (K·m/W)
 * @returns {number} Extra external thermal resistance (K·m/W)
 */
export function mutualHeatingT4(sources, index, soilResistivity) {
  const p = sources[index];
  let sumLn = 0;
  for (let k = 0; k < sources.length; k += 1) {
    if (k === index) continue;
    const dx = p.x - sources[k].x;
    const d = Math.hypot(dx, p.y - sources[k].y);
    const dImage = Math.hypot(dx, p.y + sources[k].y);
    sumLn += Math.log(dImage / d);
  }
  return (soilResistivity / (2 * Math.PI)) * sumLn;
}
