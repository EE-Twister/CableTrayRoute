const STRUCTURE_TYPES = new Set([
  'Manhole',
  'Handhole',
  'Pull box',
  'Building entry',
  'Crossing'
]);

function finite(value, fallback = 0){
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2){
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizePoint(point = {}, index = 0){
  return {
    id: String(point.id || `P${index + 1}`).trim(),
    stationFt: finite(point.stationFt ?? point.station_ft ?? point.station),
    eastingFt: finite(point.eastingFt ?? point.easting_ft ?? point.x),
    northingFt: finite(point.northingFt ?? point.northing_ft ?? point.y),
    gradeElevationFt: finite(point.gradeElevationFt ?? point.grade_elevation_ft ?? point.grade ?? point.z),
    coverIn: Math.max(0, finite(point.coverIn ?? point.cover_in ?? point.cover, 36))
  };
}

function normalizeStructure(structure = {}, index = 0){
  const type = String(structure.type || '').trim();
  return {
    id: String(structure.id || `S${index + 1}`).trim(),
    type: STRUCTURE_TYPES.has(type) ? type : 'Pull box',
    stationFt: Math.max(0, finite(structure.stationFt ?? structure.station_ft ?? structure.station)),
    note: String(structure.note || structure.notes || '').trim()
  };
}

function directionChangeDegrees(first, second){
  const firstLength = Math.hypot(first.dx, first.dy);
  const secondLength = Math.hypot(second.dx, second.dy);
  if(!firstLength || !secondLength) return 0;
  const cosine = Math.min(1, Math.max(-1, (first.dx * second.dx + first.dy * second.dy) / (firstLength * secondLength)));
  return Math.acos(cosine) * 180 / Math.PI;
}

export function analyzeDuctbankRouteProfile({ points = [], structures = [] } = {}){
  const normalizedPoints = (Array.isArray(points) ? points : [])
    .map(normalizePoint)
    .sort((a, b)=>a.stationFt - b.stationFt);
  const normalizedStructures = (Array.isArray(structures) ? structures : [])
    .map(normalizeStructure)
    .sort((a, b)=>a.stationFt - b.stationFt);
  const warnings = [];
  const segments = [];

  if(normalizedPoints.length < 2){
    warnings.push('Add at least two profile stations to calculate route geometry.');
  }
  normalizedPoints.forEach((point, index)=>{
    if(index && point.stationFt <= normalizedPoints[index - 1].stationFt){
      warnings.push(`Station ${point.stationFt} ft must be greater than the preceding station.`);
    }
  });

  for(let index = 1; index < normalizedPoints.length; index += 1){
    const from = normalizedPoints[index - 1];
    const to = normalizedPoints[index];
    const stationLengthFt = to.stationFt - from.stationFt;
    if(stationLengthFt <= 0) continue;
    const dx = to.eastingFt - from.eastingFt;
    const dy = to.northingFt - from.northingFt;
    const coordinatePlanLengthFt = Math.hypot(dx, dy);
    const planLengthFt = coordinatePlanLengthFt > 0 ? coordinatePlanLengthFt : stationLengthFt;
    const topFromFt = from.gradeElevationFt - from.coverIn / 12;
    const topToFt = to.gradeElevationFt - to.coverIn / 12;
    const elevationChangeFt = topToFt - topFromFt;
    const developedLengthFt = Math.hypot(planLengthFt, elevationChangeFt);
    const gradePct = planLengthFt ? elevationChangeFt / planLengthFt * 100 : 0;
    segments.push({
      fromId: from.id,
      toId: to.id,
      fromStationFt: from.stationFt,
      toStationFt: to.stationFt,
      stationLengthFt: round(stationLengthFt),
      planLengthFt: round(planLengthFt),
      developedLengthFt: round(developedLengthFt),
      elevationChangeFt: round(elevationChangeFt),
      gradePct: round(gradePct),
      dx,
      dy
    });
    if(coordinatePlanLengthFt > 0 && Math.abs(coordinatePlanLengthFt - stationLengthFt) > Math.max(1, stationLengthFt * 0.02)){
      warnings.push(`${from.id}–${to.id}: coordinate length differs from station interval by more than 2%.`);
    }
    if(Math.abs(gradePct) > 10){
      warnings.push(`${from.id}–${to.id}: calculated ductbank grade is ${round(gradePct)}%; verify constructability and drainage.`);
    }
  }

  let horizontalBends = 0;
  let verticalBends = 0;
  for(let index = 1; index < segments.length; index += 1){
    if(directionChangeDegrees(segments[index - 1], segments[index]) >= 1) horizontalBends += 1;
    if(Math.abs(segments[index].gradePct - segments[index - 1].gradePct) >= 0.5) verticalBends += 1;
  }

  const stationLengthFt = segments.reduce((sum, segment)=>sum + segment.stationLengthFt, 0);
  const planLengthFt = segments.reduce((sum, segment)=>sum + segment.planLengthFt, 0);
  const developedLengthFt = segments.reduce((sum, segment)=>sum + segment.developedLengthFt, 0);
  const minimumCoverIn = normalizedPoints.length ? Math.min(...normalizedPoints.map(point=>point.coverIn)) : 0;
  const maximumCoverIn = normalizedPoints.length ? Math.max(...normalizedPoints.map(point=>point.coverIn)) : 0;
  const coverLengthProduct = segments.reduce((sum, segment, index)=>{
    const averageCoverIn = (normalizedPoints[index].coverIn + normalizedPoints[index + 1].coverIn) / 2;
    return sum + averageCoverIn * segment.developedLengthFt;
  }, 0);
  const averageCoverIn = developedLengthFt ? coverLengthProduct / developedLengthFt : minimumCoverIn;
  const routeEndStationFt = normalizedPoints.at(-1)?.stationFt || 0;
  normalizedStructures.forEach(structure=>{
    if(structure.stationFt > routeEndStationFt){
      warnings.push(`${structure.id} is beyond the last route station.`);
    }
  });
  const structureCounts = normalizedStructures.reduce((counts, structure)=>{
    counts[structure.type] = (counts[structure.type] || 0) + 1;
    return counts;
  }, {});

  return {
    ready: normalizedPoints.length >= 2 && segments.length === normalizedPoints.length - 1,
    points: normalizedPoints,
    structures: normalizedStructures,
    segments,
    warnings,
    summary: {
      stationLengthFt: round(stationLengthFt),
      planLengthFt: round(planLengthFt),
      developedLengthFt: round(developedLengthFt),
      minimumCoverIn: round(minimumCoverIn),
      maximumCoverIn: round(maximumCoverIn),
      averageCoverIn: round(averageCoverIn),
      horizontalBends,
      verticalBends,
      structureCount: normalizedStructures.length,
      structureCounts
    },
    limitations: [
      'This station model is a planning profile, not survey or construction staking data.',
      'Bend counts identify direction changes; bend radius, sweep geometry, cable pulling limits, and fitting selection require detailed design.',
      'Structure quantities are counts only. Dimensions, penetrations, drainage, grounding, traffic rating, and accessories remain project-specific.',
      'Crossings are location markers and do not calculate utility clearance, casing, permits, or restoration.'
    ]
  };
}
