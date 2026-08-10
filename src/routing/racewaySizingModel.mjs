export const STANDARD_TRAY_WIDTHS_IN = Object.freeze([6, 9, 12, 18, 24, 30, 36]);

export const ALLOWABLE_TRAY_AREA_IN2 = Object.freeze({
  6: 7.0,
  9: 10.5,
  12: 14.0,
  18: 21.0,
  24: 28.0,
  30: 32.5,
  36: 39.0
});

export function conductorSizeRank(size) {
  if (!size) return -Infinity;
  const normalized = String(size).trim().toUpperCase();
  if (normalized.endsWith('KCMIL')) return 2000 + Number.parseFloat(normalized);
  const aughtMatch = normalized.match(/(\d+)\/0\s*AWG/);
  if (aughtMatch) return 1000 + Number.parseInt(aughtMatch[1], 10);
  const awgMatch = normalized.match(/#(\d+)\s*AWG/);
  if (awgMatch) return -Number.parseInt(awgMatch[1], 10);
  return Number.NaN;
}

export function splitTrayCables(cables) {
  const large = [];
  const small = [];
  const rank1_0 = conductorSizeRank('1/0 AWG');
  const rank4_0 = conductorSizeRank('4/0 AWG');
  cables.forEach(cable => {
    const rank = conductorSizeRank(cable.conductor_size);
    if (cable.isGroup || cable.diameter >= 1.55 || (cable.conductors === 1 && rank >= rank1_0 && rank <= rank4_0)) {
      large.push(cable);
    } else {
      small.push(cable);
    }
  });
  return { large, small };
}

export function allowableTrayArea(width, trayType) {
  const base = ALLOWABLE_TRAY_AREA_IN2[width] || 0;
  return trayType === 'solid' ? base * 0.78 : base;
}

export function computeNeededTrayWidth(cables, trayType = 'ladder') {
  const { large, small } = splitTrayCables(cables);
  const widthNeededForLargeCables = large.length
    ? large.reduce((sum, cable) => sum + cable.diameter, 0) / (trayType === 'solid' ? 0.9 : 1)
    : 0;
  const areaNeededForSmallCables = small.reduce((sum, cable) => sum + Math.PI * (cable.diameter / 2) ** 2, 0);
  return STANDARD_TRAY_WIDTHS_IN.find(width => width >= widthNeededForLargeCables
    && (!small.length || areaNeededForSmallCables <= allowableTrayArea(width, trayType))) || null;
}

export function recommendRaceway(cables, { thresholds, conduitType, conduitSpecs, trayType = 'ladder', totalAreaOverride = null }) {
  const count = cables.length;
  const recommendation = count <= thresholds.conduit
    ? 'conduit'
    : count <= thresholds.channel ? 'channel' : 'tray';
  const calculatedArea = cables.reduce((sum, cable) => sum + Math.PI * (cable.diameter / 2) ** 2, 0);
  const totalArea = Number.isFinite(totalAreaOverride) ? totalAreaOverride : calculatedArea;
  let tradeSize = null;
  let traySize = null;
  if (recommendation === 'conduit') {
    const specification = conduitSpecs[conduitType] || {};
    const fillFraction = count === 1 ? 0.53 : count === 2 ? 0.31 : 0.40;
    tradeSize = Object.keys(specification).find(size => totalArea <= specification[size] * fillFraction) || null;
  } else {
    traySize = computeNeededTrayWidth(cables, trayType);
  }
  return { recommendation, tradeSize, traySize, totalArea, cableCount: count };
}

export function formatRacewayRecommendation(result) {
  if (result.recommendation === 'conduit') {
    return `Recommended: ${result.tradeSize ? `${result.tradeSize}\" Conduit` : 'Conduit'}`;
  }
  const label = result.recommendation === 'tray' ? 'Tray' : 'Channel';
  return `Recommended: ${result.traySize ? `${result.traySize}\" ${label}` : label}`;
}
