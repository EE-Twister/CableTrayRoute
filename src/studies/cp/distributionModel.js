function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function parseZoneResistivityValues(rawValue) {
  const text = String(rawValue ?? '').trim();
  if (!text) {
    return [];
  }

  return text
    .split(',')
    .map((part) => Number.parseFloat(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export function computeDistributionBySegment({
  anodeTypeSystem,
  numberOfAnodes,
  anodeSpacingM,
  anodeDistanceToStructureM,
  anodeBurialDepthM,
  soilResistivityOhmM,
  zoneResistivityOhmM = []
}) {
  const segmentCount = Math.max(1, Math.round(numberOfAnodes));
  const normalizedZoneResistivity = Array.isArray(zoneResistivityOhmM) && zoneResistivityOhmM.length
    ? zoneResistivityOhmM
    : [soilResistivityOhmM];

  const systemFactor = anodeTypeSystem === 'iccp' ? 0.92 : 0.82;
  const spacingFactor = clamp(1 - (Math.max(0, anodeSpacingM - 30) / 600), 0.7, 1.05);
  const distanceFactor = clamp(1 - ((Math.max(0, anodeDistanceToStructureM - 3)) / 120), 0.75, 1.05);
  const depthFactor = clamp(0.88 + Math.min(0.14, anodeBurialDepthM / 100), 0.85, 1.02);
  const baseFactor = systemFactor * spacingFactor * distanceFactor * depthFactor;

  const segments = Array.from({ length: segmentCount }, (_, index) => {
    const zoneResistivity = normalizedZoneResistivity[index % normalizedZoneResistivity.length];
    const ratio = zoneResistivity / soilResistivityOhmM;
    const resistivityFactor = clamp(1 / Math.sqrt(Math.max(ratio, 0.1)), 0.6, 1.2);
    const edgePenalty = segmentCount <= 2
      ? 1
      : (index === 0 || index === segmentCount - 1 ? 0.92 : 1.0);
    const effectiveness = clamp(baseFactor * resistivityFactor * edgePenalty, 0.45, 1.1);

    return {
      segment: index + 1,
      zoneResistivityOhmM: Math.round(zoneResistivity * 1000) / 1000,
      effectivenessFactor: Math.round(effectiveness * 1000) / 1000,
      attenuationFactor: Math.round((1 / effectiveness) * 1000) / 1000
    };
  });

  const averageEffectivenessFactor = segments.reduce((sum, segment) => sum + segment.effectivenessFactor, 0) / segments.length;
  const globalAttenuationFactor = Math.round((1 / averageEffectivenessFactor) * 1000) / 1000;

  return {
    segmentCount,
    segments,
    averageEffectivenessFactor: Math.round(averageEffectivenessFactor * 1000) / 1000,
    globalAttenuationFactor
  };
}
