const DEFAULT_LAYOUT = Object.freeze({
  dcBusVoltageV: 480,
  cellCapacityAh: 200,
  cellsPerModule: 12,
  modulesPerRack: 40,
  rackWidthFt: 2.5,
  rackDepthFt: 3,
  rackHeightFt: 7,
  racksPerRow: 4,
  frontAisleFt: 3,
  rearClearanceFt: 1,
  sideClearanceFt: 2,
  rowSpacingFt: 4,
  terminalSide: 'front-left',
  includeStringProtection: true,
});

const CHEMISTRY_CELL_DEFAULTS = Object.freeze({
  'lead-acid-flooded': 2,
  'lead-acid-agm': 2,
  'lithium-ion': 3.2,
  'nickel-cadmium': 1.2,
});

const TERMINAL_SIDES = new Set(['front-left', 'front-right', 'rear-left', 'rear-right']);
const RACK_GAP_FT = 0.5;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value) * factor) / factor;
}

function positiveNumber(overrides, key, fallback, warnings, label, options = {}) {
  const raw = overrides?.[key];
  const value = finite(raw);
  if (value === null || value <= 0) {
    if (raw !== undefined && raw !== null && raw !== '') {
      warnings.push(`${label} was invalid and defaulted to ${fallback}.`);
    }
    return options.integer ? Math.max(1, Math.round(fallback)) : fallback;
  }
  if (options.integer) return Math.max(1, Math.round(value));
  return value;
}

function booleanValue(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function chemistryCellVoltage(sizingResult = {}, overrides = {}) {
  const chemistry = overrides.chemistry || sizingResult.chemistry || '';
  return CHEMISTRY_CELL_DEFAULTS[chemistry] || DEFAULT_LAYOUT.dcBusVoltageV / 240;
}

function addModuleRange(ranges, rackId, slot) {
  const last = ranges[ranges.length - 1];
  if (last && last.rackId === rackId && last.slotEnd + 1 === slot) {
    last.slotEnd = slot;
    return;
  }
  ranges.push({ rackId, slotStart: slot, slotEnd: slot });
}

function rackRangeLabel(ranges) {
  return ranges.map(range => (
    range.slotStart === range.slotEnd
      ? `${range.rackId} slot ${range.slotStart}`
      : `${range.rackId} slots ${range.slotStart}-${range.slotEnd}`
  )).join(', ');
}

function makeRacks(count, inputs) {
  const columns = Math.max(1, Math.min(inputs.racksPerRow, count));
  return Array.from({ length: count }, (_, index) => {
    const rowIndex = Math.floor(index / inputs.racksPerRow);
    const colIndex = index % inputs.racksPerRow;
    return {
      id: `R${index + 1}`,
      row: rowIndex + 1,
      column: colIndex + 1,
      xFt: round(inputs.sideClearanceFt + colIndex * (inputs.rackWidthFt + RACK_GAP_FT)),
      yFt: round(inputs.frontAisleFt + rowIndex * (inputs.rackDepthFt + inputs.rowSpacingFt)),
      widthFt: inputs.rackWidthFt,
      depthFt: inputs.rackDepthFt,
      heightFt: inputs.rackHeightFt,
      modules: [],
      usedModuleSlots: 0,
      unusedModuleSlots: inputs.modulesPerRack,
      visibleColumnCount: columns,
    };
  });
}

function buildTopView(inputs, rows, columns) {
  const widthFt = round(
    inputs.sideClearanceFt * 2
    + columns * inputs.rackWidthFt
    + Math.max(0, columns - 1) * RACK_GAP_FT
  );
  const depthFt = round(
    inputs.frontAisleFt
    + inputs.rearClearanceFt
    + rows * inputs.rackDepthFt
    + Math.max(0, rows - 1) * inputs.rowSpacingFt
  );
  const terminalAtFront = inputs.terminalSide.startsWith('front');
  const terminalAtLeft = inputs.terminalSide.endsWith('left');
  const busYFt = terminalAtFront
    ? Math.max(0.5, inputs.frontAisleFt * 0.45)
    : Math.max(inputs.frontAisleFt + rows * inputs.rackDepthFt, depthFt - Math.max(0.5, inputs.rearClearanceFt * 0.45));
  const busStartXFt = inputs.sideClearanceFt;
  const busEndXFt = Math.max(busStartXFt, widthFt - inputs.sideClearanceFt);
  const busBoxXFt = terminalAtLeft
    ? Math.max(0.35, inputs.sideClearanceFt * 0.35)
    : Math.max(0.35, widthFt - inputs.sideClearanceFt * 0.35);

  return {
    widthFt,
    depthFt,
    rackGapFt: RACK_GAP_FT,
    terminalSide: inputs.terminalSide,
    positiveBus: {
      x1Ft: round(busStartXFt),
      x2Ft: round(busEndXFt),
      yFt: round(busYFt - 0.18),
    },
    negativeBus: {
      x1Ft: round(busStartXFt),
      x2Ft: round(busEndXFt),
      yFt: round(busYFt + 0.18),
    },
    dcBus: {
      xFt: round(busBoxXFt),
      yFt: round(busYFt),
      label: 'DC bus / UPS',
    },
  };
}

function moduleGrid(modulesPerRack) {
  const moduleColumns = modulesPerRack <= 12 ? 2 : modulesPerRack <= 30 ? 3 : 4;
  return {
    moduleColumns,
    moduleRows: Math.ceil(modulesPerRack / moduleColumns),
  };
}

export function normalizeBatteryRackLayoutInputs(sizingResult = {}, overrides = {}) {
  const warnings = [];
  const nominalCellVoltageDefault = chemistryCellVoltage(sizingResult, overrides);
  const inputWarnings = Array.isArray(overrides.inputWarnings) ? overrides.inputWarnings : [];
  const terminalSide = TERMINAL_SIDES.has(overrides.terminalSide)
    ? overrides.terminalSide
    : DEFAULT_LAYOUT.terminalSide;

  if (overrides.terminalSide && !TERMINAL_SIDES.has(overrides.terminalSide)) {
    warnings.push(`Terminal side "${overrides.terminalSide}" was invalid and defaulted to ${DEFAULT_LAYOUT.terminalSide}.`);
  }

  return {
    dcBusVoltageV: round(positiveNumber(overrides, 'dcBusVoltageV', DEFAULT_LAYOUT.dcBusVoltageV, warnings, 'DC bus voltage'), 3),
    nominalCellVoltageV: round(positiveNumber(overrides, 'nominalCellVoltageV', nominalCellVoltageDefault, warnings, 'Nominal cell voltage'), 3),
    cellCapacityAh: round(positiveNumber(overrides, 'cellCapacityAh', DEFAULT_LAYOUT.cellCapacityAh, warnings, 'Cell capacity'), 3),
    cellsPerModule: positiveNumber(overrides, 'cellsPerModule', DEFAULT_LAYOUT.cellsPerModule, warnings, 'Cells per module', { integer: true }),
    modulesPerRack: positiveNumber(overrides, 'modulesPerRack', DEFAULT_LAYOUT.modulesPerRack, warnings, 'Modules per rack', { integer: true }),
    rackWidthFt: round(positiveNumber(overrides, 'rackWidthFt', DEFAULT_LAYOUT.rackWidthFt, warnings, 'Rack width'), 3),
    rackDepthFt: round(positiveNumber(overrides, 'rackDepthFt', DEFAULT_LAYOUT.rackDepthFt, warnings, 'Rack depth'), 3),
    rackHeightFt: round(positiveNumber(overrides, 'rackHeightFt', DEFAULT_LAYOUT.rackHeightFt, warnings, 'Rack height'), 3),
    racksPerRow: positiveNumber(overrides, 'racksPerRow', DEFAULT_LAYOUT.racksPerRow, warnings, 'Racks per row', { integer: true }),
    frontAisleFt: round(positiveNumber(overrides, 'frontAisleFt', DEFAULT_LAYOUT.frontAisleFt, warnings, 'Front aisle'), 3),
    rearClearanceFt: round(positiveNumber(overrides, 'rearClearanceFt', DEFAULT_LAYOUT.rearClearanceFt, warnings, 'Rear clearance'), 3),
    sideClearanceFt: round(positiveNumber(overrides, 'sideClearanceFt', DEFAULT_LAYOUT.sideClearanceFt, warnings, 'Side clearance'), 3),
    rowSpacingFt: round(positiveNumber(overrides, 'rowSpacingFt', DEFAULT_LAYOUT.rowSpacingFt, warnings, 'Row spacing'), 3),
    terminalSide,
    includeStringProtection: booleanValue(overrides.includeStringProtection, DEFAULT_LAYOUT.includeStringProtection),
    inputWarnings: [...inputWarnings, ...warnings],
  };
}

export function buildBatteryRackLayoutModel(sizingResult = {}, layoutInputs = {}) {
  const inputs = normalizeBatteryRackLayoutInputs(sizingResult, layoutInputs);
  const targetBankKwh = finite(sizingResult.selectedBankKwh) || finite(sizingResult.kwhFinal);
  if (!targetBankKwh || targetBankKwh <= 0) {
    throw new Error('sizingResult must include selectedBankKwh or kwhFinal greater than zero.');
  }

  const warnings = [...inputs.inputWarnings];
  const cellsPerString = Math.max(1, Math.round(inputs.dcBusVoltageV / inputs.nominalCellVoltageV));
  const stringVoltageV = round(cellsPerString * inputs.nominalCellVoltageV, 3);
  const voltageMismatchPct = round(Math.abs(stringVoltageV - inputs.dcBusVoltageV) / inputs.dcBusVoltageV * 100, 2);
  const modulesPerString = Math.ceil(cellsPerString / inputs.cellsPerModule);
  const stringKwh = round(stringVoltageV * inputs.cellCapacityAh / 1000, 3);
  const requiredParallelStrings = Math.max(1, Math.ceil(targetBankKwh / stringKwh));
  const totalModules = modulesPerString * requiredParallelStrings;
  const rackCount = Math.max(1, Math.ceil(totalModules / inputs.modulesPerRack));
  const rows = Math.ceil(rackCount / inputs.racksPerRow);
  const columns = Math.min(inputs.racksPerRow, rackCount);
  const totalRackSlots = rackCount * inputs.modulesPerRack;
  const unusedRackSlots = totalRackSlots - totalModules;
  const installedKwh = round(requiredParallelStrings * stringKwh, 2);
  const racks = makeRacks(rackCount, inputs);
  const strings = [];
  const connections = [];
  let globalModuleSlot = 0;

  for (let stringIndex = 0; stringIndex < requiredParallelStrings; stringIndex += 1) {
    const stringId = `S${stringIndex + 1}`;
    const ranges = [];
    for (let moduleIndex = 1; moduleIndex <= modulesPerString; moduleIndex += 1) {
      const rackIndex = Math.floor(globalModuleSlot / inputs.modulesPerRack);
      const rack = racks[rackIndex];
      const slot = globalModuleSlot % inputs.modulesPerRack + 1;
      const cellStart = (moduleIndex - 1) * inputs.cellsPerModule + 1;
      const cellEnd = Math.min(cellsPerString, moduleIndex * inputs.cellsPerModule);
      rack.modules.push({
        slot,
        stringId,
        moduleIndex,
        cellStart,
        cellEnd,
      });
      addModuleRange(ranges, rack.id, slot);
      globalModuleSlot += 1;
    }

    const firstRange = ranges[0];
    const lastRange = ranges[ranges.length - 1];
    const rangeText = rackRangeLabel(ranges);
    const protection = inputs.includeStringProtection
      ? 'String fuse/disconnect at positive lead'
      : 'No string protection modeled';

    strings.push({
      id: stringId,
      index: stringIndex + 1,
      cellsPerString,
      modulesPerString,
      stringVoltageV,
      stringKwh,
      rackRanges: ranges,
      startRackId: firstRange?.rackId || '',
      endRackId: lastRange?.rackId || '',
      routeLabel: rangeText,
    });

    connections.push({
      id: `${stringId}-series`,
      type: 'Series string',
      stringId,
      polarity: 'series',
      from: `${firstRange?.rackId || ''} slot ${firstRange?.slotStart || ''}`,
      to: `${lastRange?.rackId || ''} slot ${lastRange?.slotEnd || ''}`,
      route: rangeText,
      protection: 'Module-to-module jumpers',
      notes: `${cellsPerString} cells in series across ${modulesPerString} modules`,
    });
    connections.push({
      id: `${stringId}-positive`,
      type: 'Positive home run',
      stringId,
      polarity: '+',
      from: `${stringId} positive terminal`,
      to: 'DC bus + / UPS battery input',
      route: `${inputs.terminalSide} rack bus route`,
      protection,
      notes: rangeText,
    });
    connections.push({
      id: `${stringId}-negative`,
      type: 'Negative home run',
      stringId,
      polarity: '-',
      from: `${stringId} negative terminal`,
      to: 'DC bus - / UPS battery input',
      route: `${inputs.terminalSide} rack bus route`,
      protection: 'Negative return lead',
      notes: rangeText,
    });
  }

  racks.forEach((rack) => {
    rack.modules.sort((a, b) => a.slot - b.slot);
    rack.usedModuleSlots = rack.modules.length;
    rack.unusedModuleSlots = Math.max(0, inputs.modulesPerRack - rack.usedModuleSlots);
  });

  if (voltageMismatchPct > 2) {
    warnings.push(
      `Computed string voltage ${stringVoltageV} V differs from the DC bus voltage ${inputs.dcBusVoltageV} V by ${voltageMismatchPct}%. Verify cell count and nominal voltage.`
    );
  }
  if (requiredParallelStrings > 6) {
    warnings.push(`${requiredParallelStrings} parallel strings are required. Review protection, monitoring, and equal-length cabling with the manufacturer.`);
  }
  if (rackCount > 12) {
    warnings.push(`${rackCount} battery racks are required. Consider splitting the installation into multiple lineups or rooms.`);
  }
  if (unusedRackSlots > 0 && unusedRackSlots / totalRackSlots > 0.3) {
    warnings.push(`${unusedRackSlots} of ${totalRackSlots} rack module slots are unused. Confirm the rack module count or cell capacity selection.`);
  }

  const topView = buildTopView(inputs, rows, columns);
  const grid = moduleGrid(inputs.modulesPerRack);

  return {
    inputs,
    summary: {
      targetBankKwh: round(targetBankKwh, 2),
      installedKwh,
      dcBusVoltageV: inputs.dcBusVoltageV,
      nominalCellVoltageV: inputs.nominalCellVoltageV,
      cellsPerString,
      stringVoltageV,
      voltageMismatchPct,
      cellCapacityAh: inputs.cellCapacityAh,
      stringKwh,
      modulesPerString,
      requiredParallelStrings,
      totalModules,
      modulesPerRack: inputs.modulesPerRack,
      rackCount,
      rows,
      columns,
      unusedRackSlots,
      totalRackSlots,
      includeStringProtection: inputs.includeStringProtection,
    },
    racks,
    strings,
    connections,
    topView,
    elevationView: {
      rackWidthFt: inputs.rackWidthFt,
      rackHeightFt: inputs.rackHeightFt,
      rackGapFt: RACK_GAP_FT,
      moduleColumns: grid.moduleColumns,
      moduleRows: grid.moduleRows,
    },
    warnings,
  };
}
