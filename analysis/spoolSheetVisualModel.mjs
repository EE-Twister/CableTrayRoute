import { generateSpoolSheets } from './spoolSheets.mjs';

const DEFAULT_SECTION_LENGTH_FT = 12;
const DEFAULT_GRID_CELL_FT = 20;
const DEFAULT_ELEV_BAND_FT = 2;
const DEFAULT_MAX_SPOOL_SEGMENTS = 10;
const DEFAULT_SPLICE_PLATE_PAIRS_PER_JOINT = 1;
const DEFAULT_CLAMP_KITS_PER_SUPPORT = 2;
const DEFAULT_GROUND_JUMPERS_PER_JOINT = 1;
const DEFAULT_EXPANSION_FITTING_INTERVAL_FT = 100;
const DEFAULT_FIELD_CUT_ALLOWANCE_PCT = 5;
const DEFAULT_SPARE_HARDWARE_PCT = 10;
const DEFAULT_MAX_SHIPPING_LENGTH_FT = 40;
const DEFAULT_MAX_HANDLING_WEIGHT_LB = 250;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(finite(value) * factor) / factor;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function integerAtLeast(value, min, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number >= min ? number : fallback;
}

function trayId(tray = {}, index = 0) {
  return String(tray.tray_id || tray.id || `TRAY-${index + 1}`);
}

function widthIn(tray = {}) {
  return round(finite(tray.inside_width ?? tray.width, 12), 1);
}

function pointFromTray(tray = {}, prefix) {
  const x = finiteOrNull(tray[`${prefix}_x`]);
  const y = finiteOrNull(tray[`${prefix}_y`]);
  const z = finiteOrNull(tray[`${prefix}_z`]);
  if (x == null || y == null || z == null) return null;
  return { xFt: x, yFt: y, zFt: z };
}

function trayGeometry(tray = {}, index = 0) {
  const start = pointFromTray(tray, 'start');
  const end = pointFromTray(tray, 'end');
  if (!start || !end) {
    return {
      id: trayId(tray, index),
      hasCoordinates: false,
      lengthFt: 0,
      midpoint: { xFt: 0, yFt: 0, zFt: 0 },
      elevationFt: 0,
    };
  }

  const lengthFt = Math.hypot(
    end.xFt - start.xFt,
    end.yFt - start.yFt,
    end.zFt - start.zFt
  );
  const midpoint = {
    xFt: (start.xFt + end.xFt) / 2,
    yFt: (start.yFt + end.yFt) / 2,
    zFt: (start.zFt + end.zFt) / 2,
  };

  return {
    id: trayId(tray, index),
    hasCoordinates: true,
    start,
    end,
    lengthFt: round(lengthFt, 2),
    midpoint,
    elevationFt: round(midpoint.zFt, 2),
  };
}

function baseGroupKey(geometry, tray, options) {
  const gridX = Math.floor(geometry.midpoint.xFt / options.gridCellFt);
  const gridY = Math.floor(geometry.midpoint.yFt / options.gridCellFt);
  const band = Math.round(geometry.elevationFt / options.elevBandFt);
  const w = Math.round(widthIn(tray));
  return {
    key: `W${w}-E${band}-G${gridX}_${gridY}`,
    gridX,
    gridY,
    band,
    widthIn: w,
    label: `${w} in / EL ${round(band * options.elevBandFt, 1)} ft / Cell ${gridX},${gridY}`,
  };
}

function cableTag(cable = {}) {
  return String(cable.cable_tag || cable.name || cable.tag || cable.id || '');
}

function cableLengthFt(cable = {}, fallback = 0) {
  return round(finite(cable.length_ft ?? cable.cable_length ?? cable.length ?? cable.total_length, fallback), 1);
}

function boundsFor(points) {
  if (!points.length) {
    return {
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
      minZ: 0,
      maxZ: 1,
    };
  }
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.xFt),
    maxX: Math.max(bounds.maxX, point.xFt),
    minY: Math.min(bounds.minY, point.yFt),
    maxY: Math.max(bounds.maxY, point.yFt),
    minZ: Math.min(bounds.minZ, point.zFt),
    maxZ: Math.max(bounds.maxZ, point.zFt),
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  });
}

function normalizeOptions(options = {}) {
  return {
    sectionLengthFt: positive(options.sectionLengthFt, DEFAULT_SECTION_LENGTH_FT),
    gridCellFt: positive(options.gridCellFt, DEFAULT_GRID_CELL_FT),
    elevBandFt: positive(options.elevBandFt, DEFAULT_ELEV_BAND_FT),
    maxSpoolSegments: integerAtLeast(options.maxSpoolSegments, 1, DEFAULT_MAX_SPOOL_SEGMENTS),
    splicePlatePairsPerJoint: nonNegative(
      options.splicePlatePairsPerJoint,
      DEFAULT_SPLICE_PLATE_PAIRS_PER_JOINT
    ),
    clampKitsPerSupport: nonNegative(options.clampKitsPerSupport, DEFAULT_CLAMP_KITS_PER_SUPPORT),
    groundJumpersPerJoint: nonNegative(options.groundJumpersPerJoint, DEFAULT_GROUND_JUMPERS_PER_JOINT),
    expansionFittingIntervalFt: nonNegative(
      options.expansionFittingIntervalFt,
      DEFAULT_EXPANSION_FITTING_INTERVAL_FT
    ),
    fieldCutAllowancePct: nonNegative(options.fieldCutAllowancePct, DEFAULT_FIELD_CUT_ALLOWANCE_PCT),
    spareHardwarePct: nonNegative(options.spareHardwarePct, DEFAULT_SPARE_HARDWARE_PCT),
    maxShippingLengthFt: positive(options.maxShippingLengthFt, DEFAULT_MAX_SHIPPING_LENGTH_FT),
    maxHandlingWeightLb: positive(options.maxHandlingWeightLb, DEFAULT_MAX_HANDLING_WEIGHT_LB),
  };
}

function buildGridCells(spools, options) {
  const cells = new Map();
  for (const spool of spools) {
    for (const group of spool.groups) {
      const key = `G${group.gridX}_${group.gridY}`;
      if (!cells.has(key)) {
        cells.set(key, {
          key,
          gridX: group.gridX,
          gridY: group.gridY,
          x0: group.gridX * options.gridCellFt,
          x1: (group.gridX + 1) * options.gridCellFt,
          y0: group.gridY * options.gridCellFt,
          y1: (group.gridY + 1) * options.gridCellFt,
          spoolIds: [],
          trayCount: 0,
        });
      }
      const cell = cells.get(key);
      if (!cell.spoolIds.includes(spool.spoolId)) cell.spoolIds.push(spool.spoolId);
      cell.trayCount += group.trayCount;
    }
  }
  return [...cells.values()].sort((a, b) => a.gridX - b.gridX || a.gridY - b.gridY);
}

function buildElevationBands(spools, options) {
  const bands = new Map();
  for (const spool of spools) {
    for (const group of spool.groups) {
      const key = String(group.band);
      if (!bands.has(key)) {
        bands.set(key, {
          index: group.band,
          minFt: round((group.band - 0.5) * options.elevBandFt, 1),
          maxFt: round((group.band + 0.5) * options.elevBandFt, 1),
          label: `${round(group.band * options.elevBandFt, 1)} ft band`,
          spoolIds: [],
          trayCount: 0,
        });
      }
      const band = bands.get(key);
      if (!band.spoolIds.includes(spool.spoolId)) band.spoolIds.push(spool.spoolId);
      band.trayCount += group.trayCount;
    }
  }
  return [...bands.values()].sort((a, b) => a.index - b.index);
}

function buildSections(totalLengthFt, sectionLengthFt) {
  const sections = [];
  let remaining = positive(totalLengthFt, 0);
  const standard = positive(sectionLengthFt, DEFAULT_SECTION_LENGTH_FT);
  let index = 1;
  while (remaining > 0.01) {
    const lengthFt = Math.min(standard, remaining);
    sections.push({
      index,
      lengthFt: round(lengthFt, 2),
      isRemainder: lengthFt < standard - 0.01,
    });
    remaining -= lengthFt;
    index++;
  }
  return sections;
}

function buildConstraintAlerts(spools, options) {
  const alerts = [];
  for (const spool of spools) {
    if (spool.totalLengthFt > options.maxShippingLengthFt) {
      alerts.push({
        severity: 'warning',
        spoolId: spool.spoolId,
        title: 'Shipping length',
        message: `${spool.spoolId} is ${round(spool.totalLengthFt, 1)} ft, above the ${round(options.maxShippingLengthFt, 1)} ft shipping target.`,
      });
    }
    if (spool.estimatedWeight > options.maxHandlingWeightLb) {
      alerts.push({
        severity: 'warning',
        spoolId: spool.spoolId,
        title: 'Handling weight',
        message: `${spool.spoolId} is ${spool.estimatedWeight} lb, above the ${round(options.maxHandlingWeightLb, 1)} lb handling target.`,
      });
    }
    if (spool.isAtCapacity) {
      alerts.push({
        severity: 'notice',
        spoolId: spool.spoolId,
        title: 'Segment capacity',
        message: `${spool.spoolId} is at the max segment limit and may split if another tray is added to this group.`,
      });
    }
    if (spool.hardware?.fieldCutAllowanceFt <= 0) {
      alerts.push({
        severity: 'notice',
        spoolId: spool.spoolId,
        title: 'No field-cut allowance',
        message: `${spool.spoolId} has no field-cut allowance included in the material length.`,
      });
    }
  }
  return alerts;
}

export function summarizeSpoolImpact(previousSummary, nextSummary) {
  const prev = previousSummary || {};
  const next = nextSummary || {};
  return {
    spoolCount: finite(next.spoolCount) - finite(prev.spoolCount),
    totalTrays: finite(next.totalTrays) - finite(prev.totalTrays),
    totalLengthFt: round(finite(next.totalLengthFt) - finite(prev.totalLengthFt), 2),
    totalSections: finite(next.totalSections) - finite(prev.totalSections),
    totalBrackets: finite(next.totalBrackets) - finite(prev.totalBrackets),
    totalEstimatedWeight: finite(next.totalEstimatedWeight) - finite(prev.totalEstimatedWeight),
    totalCableEntries: finite(next.totalCableEntries) - finite(prev.totalCableEntries),
    totalSplicePlatePairs: finite(next.totalSplicePlatePairs) - finite(prev.totalSplicePlatePairs),
    totalClampKits: finite(next.totalClampKits) - finite(prev.totalClampKits),
    totalGroundJumpers: finite(next.totalGroundJumpers) - finite(prev.totalGroundJumpers),
    totalExpansionFittings: finite(next.totalExpansionFittings) - finite(prev.totalExpansionFittings),
    totalFieldCutAllowanceFt: round(
      finite(next.totalFieldCutAllowanceFt) - finite(prev.totalFieldCutAllowanceFt),
      2
    ),
  };
}

export function buildSpoolSheetVisualModel(trays = [], cables = [], options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const safeTrays = Array.isArray(trays) ? trays : [];
  const safeCables = Array.isArray(cables) ? cables : [];
  const generated = generateSpoolSheets(safeTrays, safeCables, normalizedOptions);
  const warnings = [];

  if (safeTrays.length === 0) {
    warnings.push('No trays found. Add tray runs with start and end coordinates in the Raceway Schedule.');
  }

  const trayLookup = new Map();
  const trayMeta = safeTrays.map((tray, index) => {
    const geometry = trayGeometry(tray, index);
    const group = baseGroupKey(geometry, tray, normalizedOptions);
    const meta = { tray, index, id: geometry.id, geometry, group };
    trayLookup.set(geometry.id, meta);
    return meta;
  });

  const coordinateCount = trayMeta.filter(meta => meta.geometry.hasCoordinates).length;
  if (safeTrays.length && coordinateCount !== safeTrays.length) {
    warnings.push(`${safeTrays.length - coordinateCount} tray${safeTrays.length - coordinateCount === 1 ? '' : 's'} are missing complete coordinates; those trays are included in quantities but not drawn exactly.`);
  }
  if (trayMeta.some(meta => meta.geometry.hasCoordinates && meta.geometry.lengthFt <= 0.01)) {
    warnings.push('One or more trays have zero-length coordinates and may not be visible in the preview.');
  }
  const trayIds = new Set(trayMeta.map(meta => String(meta.id)));
  const unmatchedCableCount = safeCables.filter(cable => {
    const routePreference = String(cable.route_preference || '');
    return routePreference && !trayIds.has(routePreference);
  }).length;
  if (unmatchedCableCount) {
    warnings.push(`${unmatchedCableCount} cable${unmatchedCableCount === 1 ? '' : 's'} reference tray IDs that are not in the current Raceway Schedule.`);
  }

  const baseGroupCounts = new Map();
  for (const meta of trayMeta) {
    baseGroupCounts.set(meta.group.key, (baseGroupCounts.get(meta.group.key) || 0) + 1);
  }

  const spools = generated.spools.map((spool, spoolIndex) => {
    const metas = spool.trayIds
      .map(id => trayLookup.get(String(id)))
      .filter(Boolean);
    const groups = new Map();
    for (const meta of metas) {
      if (!groups.has(meta.group.key)) {
        groups.set(meta.group.key, {
          ...meta.group,
          trayCount: 0,
          trayIds: [],
        });
      }
      const group = groups.get(meta.group.key);
      group.trayCount++;
      group.trayIds.push(meta.id);
    }
    const points = [];
    for (const meta of metas) {
      if (meta.geometry.start) points.push(meta.geometry.start);
      if (meta.geometry.end) points.push(meta.geometry.end);
    }
    const baseKeys = [...groups.keys()];
    const wasCapacitySplit = baseKeys.some(key => baseGroupCounts.get(key) > normalizedOptions.maxSpoolSegments);
    const dominantGroup = [...groups.values()].sort((a, b) => b.trayCount - a.trayCount)[0] || null;
    return {
      ...spool,
      colorIndex: spoolIndex % 12,
      capacityPct: round(Math.min(100, (spool.trayCount / normalizedOptions.maxSpoolSegments) * 100), 1),
      isAtCapacity: spool.trayCount >= normalizedOptions.maxSpoolSegments,
      wasCapacitySplit,
      dominantGroup,
      groups: [...groups.values()],
      bounds: boundsFor(points),
      midpoint: points.length
        ? {
            xFt: round(points.reduce((sum, point) => sum + point.xFt, 0) / points.length, 2),
            yFt: round(points.reduce((sum, point) => sum + point.yFt, 0) / points.length, 2),
            zFt: round(points.reduce((sum, point) => sum + point.zFt, 0) / points.length, 2),
          }
        : { xFt: 0, yFt: 0, zFt: 0 },
      sections: buildSections(spool.totalLengthFt, normalizedOptions.sectionLengthFt),
      cableTags: spool.cables.map(cable => cableTag(cable)).filter(Boolean),
    };
  });

  const segments = [];
  for (const spool of spools) {
    const spoolMeta = spool.trayIds
      .map(id => trayLookup.get(String(id)))
      .filter(Boolean);
    spoolMeta.forEach((meta, index) => {
      if (!meta.geometry.hasCoordinates) return;
      segments.push({
        id: `${spool.spoolId}-${meta.id}`,
        spoolId: spool.spoolId,
        trayId: meta.id,
        colorIndex: spool.colorIndex,
        label: `${spool.spoolId} / ${meta.id} / ${round(meta.geometry.lengthFt, 1)} ft`,
        start: meta.geometry.start,
        end: meta.geometry.end,
        lengthFt: meta.geometry.lengthFt,
        widthIn: widthIn(meta.tray),
        group: meta.group,
        sequence: index + 1,
      });
    });
  }

  const markers = spools.map(spool => ({
    id: `${spool.spoolId}-midpoint`,
    spoolId: spool.spoolId,
    colorIndex: spool.colorIndex,
    label: spool.spoolId,
    point: spool.midpoint,
  }));

  const allPoints = [
    ...segments.flatMap(segment => [segment.start, segment.end]),
    ...markers.map(marker => marker.point),
  ];
  const modelBounds = boundsFor(allPoints);
  const gridCells = buildGridCells(spools, normalizedOptions);
  const elevationBands = buildElevationBands(spools, normalizedOptions);
  const constraints = buildConstraintAlerts(spools, normalizedOptions);

  return {
    title: 'Spool sheet visual preview',
    description: 'Tray spool grouping preview generated from project tray coordinates and spool parameters.',
    options: normalizedOptions,
    result: generated,
    spools,
    segments,
    markers,
    gridCells,
    elevationBands,
    constraints,
    warnings,
    hasTrayData: safeTrays.length > 0,
    hasCoordinates: coordinateCount > 0,
    hasExactCoordinates: coordinateCount === safeTrays.length && safeTrays.length > 0,
    coordinateCount,
    trayCount: safeTrays.length,
    bounds: modelBounds,
    summary: {
      ...generated.summary,
      drawnSegments: segments.length,
      gridCellCount: gridCells.length,
      elevationBandCount: elevationBands.length,
      capacitySplitCount: spools.filter(spool => spool.wasCapacitySplit).length,
      warningCount: constraints.filter(alert => alert.severity === 'warning').length,
    },
    cableAssignments: safeCables.map(cable => ({
      cableTag: cableTag(cable),
      routePreference: String(cable.route_preference || ''),
      from: String(cable.from || cable.source || ''),
      to: String(cable.to || cable.destination || ''),
      lengthFt: cableLengthFt(cable),
    })),
  };
}
