/**
 * Preliminary material takeoff for a regular roof air-terminal array.
 *
 * Quantities are based on visible geometry and editable routing assumptions.
 * They are suitable for concept estimating, not issued-for-construction work.
 */

export const DEFAULT_LIGHTNING_BOM_ASSUMPTIONS = Object.freeze({
  conductorWastePercent: 10,
  roofSupportSpacingM: 1,
  downConductorSupportSpacingM: 1,
  downConductorRouteAllowanceM: 2,
  includePerimeterRing: true,
});

const MATERIAL_LABELS = Object.freeze({
  copper: 'Copper',
  aluminum: 'Aluminum',
  steel: 'Steel',
});

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function resolveAssumptions(options = {}) {
  return {
    conductorWastePercent: nonNegativeNumber(
      options.conductorWastePercent,
      DEFAULT_LIGHTNING_BOM_ASSUMPTIONS.conductorWastePercent,
    ),
    roofSupportSpacingM: positiveNumber(
      options.roofSupportSpacingM,
      DEFAULT_LIGHTNING_BOM_ASSUMPTIONS.roofSupportSpacingM,
    ),
    downConductorSupportSpacingM: positiveNumber(
      options.downConductorSupportSpacingM,
      DEFAULT_LIGHTNING_BOM_ASSUMPTIONS.downConductorSupportSpacingM,
    ),
    downConductorRouteAllowanceM: nonNegativeNumber(
      options.downConductorRouteAllowanceM,
      DEFAULT_LIGHTNING_BOM_ASSUMPTIONS.downConductorRouteAllowanceM,
    ),
    includePerimeterRing: options.includePerimeterRing !== false,
  };
}

function conductorSpecification(result) {
  const material = MATERIAL_LABELS[result.downConductorMaterial] || 'Copper';
  if (result.designCompliance?.standard?.startsWith('NFPA')) {
    return `UL 96 Listed ${result.designCompliance.componentClass || 'Class I'} ${material.toLowerCase()} main lightning conductor; final catalog selection required`;
  }
  return `${material} lightning-protection conductor, minimum ${result.downConductorMinAreaMm2} mm2`;
}

function terminalSegments(terminals = []) {
  const rows = new Map();
  const columns = new Map();
  terminals.forEach(terminal => {
    if (!rows.has(terminal.row)) rows.set(terminal.row, []);
    if (!columns.has(terminal.column)) columns.set(terminal.column, []);
    rows.get(terminal.row).push(terminal);
    columns.get(terminal.column).push(terminal);
  });

  const segments = [];
  rows.forEach(row => {
    row.sort((a, b) => a.column - b.column);
    for (let index = 1; index < row.length; index += 1) {
      segments.push([row[index - 1], row[index]]);
    }
  });
  columns.forEach(column => {
    column.sort((a, b) => a.row - b.row);
    for (let index = 1; index < column.length; index += 1) {
      segments.push([column[index - 1], column[index]]);
    }
  });
  return segments;
}

function segmentLength(segment) {
  return Math.hypot(
    segment[1].xM - segment[0].xM,
    segment[1].yM - segment[0].yM,
  );
}

function lengthRow(category, item, specification, quantityM, basis) {
  return { category, item, specification, quantity: quantityM, unit: 'm', basis };
}

function eachRow(category, item, specification, quantity, basis) {
  return { category, item, specification, quantity, unit: 'EA', basis };
}

/**
 * Build a preliminary construction takeoff from a completed lightning result.
 */
export function buildLightningProtectionBom(result, options = {}) {
  const assumptions = resolveAssumptions(options);
  const isArray = result?.protectionMethod === 'roof-array' && result?.terminalArray;
  const required = result?.lpl?.required === true;
  const ready = Boolean(isArray && required && result.terminalArray.terminals.length);
  const base = {
    ready,
    procurementReady: ready
      && result.coverageComplete === true
      && (result.designCompliance?.standard?.startsWith('NFPA')
        ? result.designCompliance.designReady === true
        : true),
    designBasis: result.designCompliance?.standard?.startsWith('NFPA')
      ? `${result.designCompliance.standard}; ${result.designCompliance.componentClass} listed components with field verification and inspection excluded.`
      : 'IEC 62305-3 screening geometry with an interconnected roof network.',
    assumptions,
    rows: [],
    warnings: [],
    installationNotes: [],
    exclusions: [
      'Ground-ring conductor and grounding electrodes beyond the listed earth-interface clamps; size these from the grounding study and soil conditions.',
      'Bonds to rooftop metal, parapets, penetrations, mechanical equipment, cable trays, and other conductive services.',
      'Roof flashing, weatherproofing, structural reinforcing, and project-specific mounting details.',
      'Separation-distance measures, isolated supports, shield wires, and side-flash protection.',
      'Surge protective devices and surge arresters; select and coordinate these in their applicable voltage workflow.',
      'Labor, testing, certification, permits, taxes, freight, and manufacturer-specific spare parts.',
    ],
    summary: {
      terminalCount: isArray ? result.terminalArray.terminals.length : 0,
      downConductorCount: required ? result.downConductorCount : 0,
      gridConductorM: 0,
      perimeterConductorM: 0,
      downConductorM: 0,
      totalConductorM: 0,
    },
  };

  if (!required) {
    base.warnings.push('The entered screening does not indicate a structural LPS, so an array BOM is not generated.');
    return base;
  }
  if (!isArray) {
    base.warnings.push('Select Roof air-terminal array to generate the grid-protection BOM.');
    return base;
  }

  const terminals = result.terminalArray.terminals;
  const downLayout = result.downConductorLayout;
  const bendRadiusM = result.lightningConductorMinBendRadiusM || 0.2032;
  base.installationNotes = [
    'Air terminals connect to the common roof grid; downconductors are separate discharge paths and are not assigned one-for-one to terminals.',
    downLayout
      ? `${downLayout.placementMethod} ${downLayout.count} total routes are shown for the current footprint and LPL spacing.`
      : `${result.downConductorCount} downconductor routes are distributed around the structure perimeter.`,
    `Route lightning conductors short and direct. Where UL 96A / NFPA 780-style requirements govern, use at least ${Math.round(bendRadiusM * 1000)} mm (8 in) bend radius and no turn sharper than 90 degrees; verify the adopted standard and listed system.`,
    'Connect every downconductor to the project earth-termination network. Ground-ring conductor and electrodes remain subject to the grounding study and soil conditions.',
  ];
  if (result.designCompliance?.standard?.startsWith('NFPA')) {
    base.installationNotes.unshift(
      'Design-check status applies only to the calculated geometry and entered takeoff assumptions; it is not a UL certification or Master Label.',
    );
    base.exclusions = [...result.designCompliance.exclusions];
    result.designCompliance.assumptions.forEach(item => {
      base.installationNotes.push(`Assumption: ${item}`);
    });
    result.designCompliance.criteria.filter(item => !item.pass).forEach(item => {
      base.warnings.push(`${item.label}: ${item.detail}`);
    });
  }
  const segments = terminalSegments(terminals);
  const gridBaseM = segments.reduce((total, segment) => total + segmentLength(segment), 0);
  const perimeterBaseM = assumptions.includePerimeterRing ? result.perimeterM : 0;
  const wasteFactor = 1 + assumptions.conductorWastePercent / 100;
  const gridConductorM = gridBaseM * wasteFactor;
  const perimeterConductorM = perimeterBaseM * wasteFactor;
  const downLeadBaseM = result.downConductorCount
    * (result.inputs.height + assumptions.downConductorRouteAllowanceM);
  const downConductorM = downLeadBaseM * wasteFactor;
  const roofBaseM = gridBaseM + perimeterBaseM;
  const roofSupportCount = Math.ceil(roofBaseM / assumptions.roofSupportSpacingM)
    + terminals.length
    + (result.footprint?.shape === 'rectangle' && assumptions.includePerimeterRing ? 4 : 0);
  const downSupportCount = result.downConductorCount
    * (Math.ceil(
      (result.inputs.height + assumptions.downConductorRouteAllowanceM)
      / assumptions.downConductorSupportSpacingM,
    ) + 1);
  const conductorSpec = conductorSpecification(result);
  base.rows = [
    eachRow(
      'Air termination',
      'Point air terminal',
      'Projection follows the current tip and reference-plane elevations; coordinate material and attachment with roof construction',
      terminals.length,
      `${result.terminalArray.columns} columns x ${result.terminalArray.rows} rows`,
    ),
    eachRow(
      'Air termination',
      'Air-terminal base / roof mount',
      'Manufacturer-compatible base, pedestal, or non-penetrating mount',
      terminals.length,
      'One per point terminal',
    ),
    eachRow(
      'Air termination',
      'Air-terminal-to-grid connector',
      'Listed connector compatible with the terminal and conductor materials',
      terminals.length,
      'One connection kit per point terminal',
    ),
    lengthRow(
      'Roof network',
      'Roof grid conductor',
      conductorSpec,
      gridConductorM,
      `${segments.length} straight grid segments before ${assumptions.conductorWastePercent}% allowance`,
    ),
  ];

  if (assumptions.includePerimeterRing) {
    base.rows.push(lengthRow(
      'Roof network',
      'Roof perimeter ring conductor',
      conductorSpec,
      perimeterConductorM,
      `Entered roof perimeter + ${assumptions.conductorWastePercent}% allowance`,
    ));
  }

  base.rows.push(
    eachRow(
      'Roof network',
      'Roof conductor support / holder',
      'Listed support compatible with roof membrane and conductor material',
      roofSupportCount,
      'Net roof network / entered maximum spacing, plus terminal and corner points',
    ),
    eachRow(
      'Roof network',
      'Perimeter-to-down-conductor transition connector',
      'Listed tee, cross, or transition connector; avoid incompatible-metal contact',
      result.downConductorCount,
      'One transition per independent down-conductor route; not one per air terminal',
    ),
    lengthRow(
      'Down path',
      'Down conductor',
      conductorSpec,
      downConductorM,
      `${result.downConductorCount} corner-first / perimeter routes using structure height + entered routing and conductor allowances`,
    ),
    eachRow(
      'Down path',
      'Down-conductor clip / standoff',
      'Listed wall support compatible with substrate and conductor material',
      downSupportCount,
      `${result.downConductorCount} routes at the entered maximum spacing`,
    ),
    eachRow(
      'Down path',
      'Test / disconnect joint',
      'Accessible listed test joint with enclosure where required',
      result.downConductorCount,
      'One per down conductor near grade',
    ),
    eachRow(
      'Ground interface',
      'Ground-ring / electrode connection clamp',
      'Listed direct-burial or exothermic connection compatible with grounding materials',
      result.downConductorCount,
      'One earth-interface connection per down conductor',
    ),
    eachRow(
      'Identification',
      'Lightning down-conductor identification label',
      'Permanent weather-resistant identification',
      result.downConductorCount,
      'One per accessible down-conductor test point',
    ),
  );

  base.summary = {
    terminalCount: terminals.length,
    downConductorCount: result.downConductorCount,
    gridConductorM,
    perimeterConductorM,
    downConductorM,
    totalConductorM: gridConductorM + perimeterConductorM + downConductorM,
  };

  if (!result.coverageComplete) {
    base.warnings.push('Coverage does not pass. Quantities represent the current incomplete concept and should not be used for procurement.');
  }
  base.warnings.push('Confirm listed components, conductor class/shape, compatible metals, roof attachment, bonding, and final routes with the authority and lightning-protection designer.');
  return base;
}
