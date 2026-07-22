const CONDUIT_OUTSIDE_DIAMETER_IN = Object.freeze({
  EMT: Object.freeze({
    '1/2': 0.706, '3/4': 0.922, '1': 1.163, '1-1/4': 1.510, '1-1/2': 1.740,
    '2': 2.197, '2-1/2': 2.875, '3': 3.500, '3-1/2': 4.000, '4': 4.500
  }),
  RMC: Object.freeze({
    '1/2': 0.840, '3/4': 1.050, '1': 1.315, '1-1/4': 1.660, '1-1/2': 1.900,
    '2': 2.375, '2-1/2': 2.875, '3': 3.500, '3-1/2': 4.000, '4': 4.500,
    '5': 5.563, '6': 6.625
  }),
  'PVC Sch 40': Object.freeze({
    '1/2': 0.840, '3/4': 1.050, '1': 1.315, '1-1/4': 1.660, '1-1/2': 1.900,
    '2': 2.375, '2-1/2': 2.875, '3': 3.500, '3-1/2': 4.000, '4': 4.500,
    '5': 5.563, '6': 6.625
  })
});

export const DEFAULT_DUCTBANK_BOM_ASSUMPTIONS = Object.freeze({
  conduitWastePct: 5,
  concreteWastePct: 10,
  spacerSpacingFt: 5,
  workingClearanceIn: 12,
  beddingDepthIn: 6,
  conduitStickLengthFt: 10,
  groundWireWastePct: 5,
  linearAccessoryWastePct: 10
});

export const DEFAULT_DUCTBANK_BOM_OPTIONAL_MATERIALS = Object.freeze({
  groundWire: false,
  groundWireCount: 1,
  redWarningDye: false,
  excavationShoring: false
});

function positiveNumber(value, fallback = 0){
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function round(value, digits = 2){
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function groupBy(rows, keyFor){
  const groups = new Map();
  rows.forEach(row=>{
    const key = keyFor(row);
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

export function conduitOutsideDiameterIn(type, tradeSize){
  return CONDUIT_OUTSIDE_DIAMETER_IN[String(type || '')]?.[String(tradeSize || '')] || 0;
}

export function buildDuctbankBOM({
  tag = '',
  lengthFt = 0,
  depthIn = 0,
  concreteEncasement = false,
  conduits = [],
  layout = {},
  assumptions = {},
  optionalMaterials = {}
} = {}){
  const resolved = {...DEFAULT_DUCTBANK_BOM_ASSUMPTIONS, ...assumptions};
  Object.keys(resolved).forEach(key=>{
    resolved[key] = positiveNumber(resolved[key], DEFAULT_DUCTBANK_BOM_ASSUMPTIONS[key]);
  });
  const optional = {
    ...DEFAULT_DUCTBANK_BOM_OPTIONAL_MATERIALS,
    ...optionalMaterials
  };
  optional.groundWire=Boolean(optional.groundWire);
  optional.groundWireCount=Math.min(2,Math.max(1,Math.round(positiveNumber(optional.groundWireCount,1))));
  optional.redWarningDye=Boolean(optional.redWarningDye);
  optional.excavationShoring=Boolean(optional.excavationShoring);
  const routeLengthFt = positiveNumber(lengthFt);
  const conduitRows = Array.isArray(conduits) ? conduits : [];
  const warnings = [];
  const rows = [];
  const optionalRows = [];

  if(!routeLengthFt) warnings.push('Enter a ductbank route length greater than 0 ft to calculate quantities.');
  if(!conduitRows.length) warnings.push('Add at least one conduit to build the ductbank BOM.');

  const conduitGroups = groupBy(conduitRows, conduit=>`${conduit.conduit_type || 'Conduit'}|${conduit.trade_size || ''}`);
  conduitGroups.forEach((group, key)=>{
    const [type, size] = key.split('|');
    const count = group.length;
    const conduitLength = count * routeLengthFt * (1 + resolved.conduitWastePct / 100);
    rows.push({
      category: 'Raceway',
      item: `${type} conduit`,
      specification: `${size || 'Unspecified'} in trade size`,
      quantity: round(conduitLength),
      unit: 'LF',
      basis: `${count} run${count === 1 ? '' : 's'} × ${round(routeLengthFt)} ft + ${resolved.conduitWastePct}% waste`
    });
    const jointsPerRun = Math.max(Math.ceil(routeLengthFt / Math.max(resolved.conduitStickLengthFt, 1)) - 1, 0);
    rows.push({
      category: 'Raceway',
      item: `${type} couplings`,
      specification: `${size || 'Unspecified'} in trade size`,
      quantity: count * jointsPerRun,
      unit: 'EA',
      basis: `${resolved.conduitStickLengthFt} ft stock length; ${jointsPerRun} joint${jointsPerRun === 1 ? '' : 's'} per run`
    });
  });

  if(conduitRows.length){
    rows.push({
      category: 'Accessories',
      item: 'Conduit end fittings',
      specification: concreteEncasement ? 'End bells / terminations' : 'Route terminations',
      quantity: conduitRows.length * 2,
      unit: 'EA',
      basis: 'Two ends per conduit run'
    });
    rows.push({
      category: 'Accessories',
      item: 'Ductbank spacer assemblies',
      specification: `Maximum ${resolved.spacerSpacingFt} ft spacing`,
      quantity: routeLengthFt ? Math.ceil(routeLengthFt / Math.max(resolved.spacerSpacingFt, 0.1)) + 1 : 0,
      unit: 'SET',
      basis: 'Route endpoints plus intermediate spacing'
    });
    rows.push({
      category: 'Accessories',
      item: 'Pull rope / mule tape',
      specification: 'One per conduit',
      quantity: round(conduitRows.length * routeLengthFt * (1 + resolved.linearAccessoryWastePct / 100)),
      unit: 'LF',
      basis: `${conduitRows.length} conduits × route length + ${resolved.linearAccessoryWastePct}% allowance`
    });
  }

  const ods = conduitRows.map(conduit=>({
    conduit,
    od: conduitOutsideDiameterIn(conduit.conduit_type, conduit.trade_size),
    x: Number(conduit.x),
    y: Number(conduit.y)
  }));
  const missingOds = ods.filter(entry=>!entry.od);
  if(missingOds.length){
    warnings.push(`${missingOds.length} conduit outside diameter${missingOds.length === 1 ? ' is' : 's are'} unavailable; civil volumes exclude those conduits.`);
  }
  const positioned = ods.filter(entry=>entry.od && Number.isFinite(entry.x) && Number.isFinite(entry.y));
  if(conduitRows.length && positioned.length !== conduitRows.length){
    warnings.push('Auto-place the conduits before relying on civil volume quantities.');
  }
  const rightPad = positiveNumber(layout.rightPad);
  const topPad = positiveNumber(layout.topPad);
  const envelopeWidthIn = positioned.length ? Math.max(...positioned.map(entry=>entry.x + entry.od)) + rightPad : 0;
  const envelopeHeightIn = positioned.length ? Math.max(...positioned.map(entry=>entry.y + entry.od)) + topPad : 0;
  const trenchWidthIn = envelopeWidthIn + 2 * resolved.workingClearanceIn;
  const trenchDepthIn = positiveNumber(depthIn) + envelopeHeightIn + resolved.beddingDepthIn;
  const excavationCubicYards = routeLengthFt && trenchWidthIn && trenchDepthIn
    ? (trenchWidthIn / 12) * (trenchDepthIn / 12) * routeLengthFt / 27
    : 0;
  const beddingCubicYards = routeLengthFt && trenchWidthIn
    ? (trenchWidthIn / 12) * (resolved.beddingDepthIn / 12) * routeLengthFt / 27
    : 0;
  const concreteBaseCubicYards = concreteEncasement && routeLengthFt && envelopeWidthIn && envelopeHeightIn
    ? (envelopeWidthIn / 12) * (envelopeHeightIn / 12) * routeLengthFt / 27
    : 0;
  const concreteCubicYards = concreteBaseCubicYards * (1 + resolved.concreteWastePct / 100);
  const backfillCubicYards = Math.max(excavationCubicYards - beddingCubicYards - concreteBaseCubicYards, 0);
  const topSurfaceSquareFeet = routeLengthFt && envelopeWidthIn
    ? (envelopeWidthIn / 12) * routeLengthFt
    : 0;
  const shoringSquareFeet = routeLengthFt && trenchWidthIn && trenchDepthIn
    ? 2 * (trenchDepthIn / 12) * (routeLengthFt + trenchWidthIn / 12)
    : 0;

  if(positioned.length && routeLengthFt){
    rows.push({category: 'Civil', item: 'Trench excavation', specification: `${round(trenchWidthIn)} in W × ${round(trenchDepthIn)} in D`, quantity: round(excavationCubicYards), unit: 'CY', basis: 'Continuous rectangular trench envelope'});
    rows.push({category: 'Civil', item: 'Bedding / thermal fill', specification: `${resolved.beddingDepthIn} in depth`, quantity: round(beddingCubicYards), unit: 'CY', basis: 'Full trench width below ductbank'});
    if(concreteEncasement){
      rows.push({category: 'Civil', item: 'Concrete encasement', specification: `${round(envelopeWidthIn)} in W × ${round(envelopeHeightIn)} in H`, quantity: round(concreteCubicYards), unit: 'CY', basis: `Ductbank envelope + ${resolved.concreteWastePct}% waste`});
    }
    rows.push({category: 'Civil', item: 'Selected backfill', specification: 'Trench restoration allowance', quantity: round(backfillCubicYards), unit: 'CY', basis: 'Excavation less bedding and concrete envelope'});
    rows.push({category: 'Accessories', item: 'Underground warning tape', specification: 'Continuous above route', quantity: round(routeLengthFt * (1 + resolved.linearAccessoryWastePct / 100)), unit: 'LF', basis: `Route length + ${resolved.linearAccessoryWastePct}% allowance`});
  }

  const groundWireRow={
      category: 'Optional',
      item: '#4/0 grounding conductor',
      specification: `${optional.groundWireCount} bare copper run${optional.groundWireCount === 1 ? '' : 's'} on top of ductbank`,
      quantity: round(optional.groundWireCount * routeLengthFt * (1 + resolved.groundWireWastePct / 100)),
      unit: 'LF',
      basis: `${optional.groundWireCount} run${optional.groundWireCount === 1 ? '' : 's'} × route length + ${resolved.groundWireWastePct}% allowance`,
      optional: true,
      optionKey: 'groundWire',
      included: optional.groundWire
  };
  optionalRows.push(groundWireRow);
  if(groundWireRow.included) rows.push(groundWireRow);

  const redWarningDyeRow={
      category: 'Optional',
      item: 'Red warning dye / pigment',
      specification: 'Top surface application area',
      quantity: round(topSurfaceSquareFeet),
      unit: 'SF',
      basis: 'Ductbank envelope width × route length; convert to packages using supplier coverage',
      optional: true,
      optionKey: 'redWarningDye',
      included: optional.redWarningDye
  };
  optionalRows.push(redWarningDyeRow);
  if(redWarningDyeRow.included) rows.push(redWarningDyeRow);
  if(optional.redWarningDye && topSurfaceSquareFeet){
    if(!concreteEncasement) warnings.push('Red warning dye is selected without concrete encasement; verify the intended application surface.');
  }

  const excavationShoringRow={
      category: 'Optional',
      item: 'Excavation shoring / protective system allowance',
      specification: `${round(trenchDepthIn / 12)} ft trench depth`,
      quantity: round(shoringSquareFeet),
      unit: 'SF',
      basis: 'Both trench sidewalls plus end returns; system selection remains site-specific',
      optional: true,
      optionKey: 'excavationShoring',
      included: optional.excavationShoring
  };
  optionalRows.push(excavationShoringRow);
  if(excavationShoringRow.included) rows.push(excavationShoringRow);
  if(trenchDepthIn >= 60 && positioned.length && routeLengthFt){
    warnings.push(`The calculated trench depth is ${round(trenchDepthIn / 12)} ft. A competent person must determine the required protective system; shoring is only one available approach.`);
  }
  if(trenchDepthIn > 240 && positioned.length && routeLengthFt){
    warnings.push('Excavations deeper than 20 ft require a protective system designed by a registered professional engineer under OSHA 29 CFR 1926.652.');
  }

  const ready = routeLengthFt > 0 && conduitRows.length > 0;
  return {
    tag: String(tag || '').trim(),
    ready,
    assumptions: resolved,
    optionalMaterials: optional,
    optionalRows,
    warnings,
    exclusions: [
      'Manholes, pull boxes, sweeps, and route-specific fittings require plan/profile geometry.',
      'Cable is excluded from this BOM and remains governed by the cable schedule.',
      'Reinforcing steel, dewatering, rock excavation, labor, tax, and pricing are not included.',
      'Optional shoring is a planning-area allowance, not a protective-system design or OSHA compliance determination.',
      'Verify all quantities against project specifications and issued-for-construction drawings before procurement.'
    ],
    rows,
    summary: {
      routeLengthFt: round(routeLengthFt),
      conduitLengthFt: round(conduitRows.length * routeLengthFt * (1 + resolved.conduitWastePct / 100)),
      concreteCubicYards: round(concreteCubicYards),
      excavationCubicYards: round(excavationCubicYards),
      spacerSets: conduitRows.length && routeLengthFt ? Math.ceil(routeLengthFt / Math.max(resolved.spacerSpacingFt, 0.1)) + 1 : 0,
      optionalLineItems: optionalRows.filter(row=>row.included).length
    }
  };
}
