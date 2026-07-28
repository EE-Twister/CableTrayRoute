import assert from 'node:assert/strict';
import {
  DEFAULT_NC,
  LPL_TABLE,
  DOWN_CONDUCTOR_MIN_MM2,
  LOCATION_FACTORS,
  STANDARD_ARRESTER_KV,
  MIN_ARRESTER_SYSTEM_KV,
  STRUCTURE_SHAPES,
  groundFlashDensity,
  collectionArea,
  collectionAreaFromFootprint,
  resolveFootprintGeometry,
  expectedStrikes,
  recommendLPL,
  strikingDistance,
  singleMastRadius,
  roofTerminalRadius,
  generateTerminalArray,
  evaluateTerminalArrayCoverage,
  downConductorCount,
  generateDownConductorLayout,
  LIGHTNING_CONDUCTOR_MIN_BEND_RADIUS_M,
  NFPA_UL_MAX_TERMINAL_SPACING_M,
  NFPA_UL_MAX_TERMINAL_EDGE_DISTANCE_M,
  NFPA_UL_MAX_CONDUCTOR_SUPPORT_SPACING_M,
  generateNfpaUlTerminalArray,
  arresterMCOV,
  recommendArrester,
  runLightningProtection,
} from '../analysis/lightningProtection.mjs';
import { buildLightningProtectionReportModel } from '../src/lightningProtectionPdf.js';

const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ${b} ±${tol})`);

// ---------------------------------------------------------------------------
// Tables & constants
// ---------------------------------------------------------------------------
(function testTables() {
  assert.equal(LPL_TABLE.I.radius, 20);
  assert.equal(LPL_TABLE.IV.radius, 60);
  assert.ok(LPL_TABLE.I.iMin < LPL_TABLE.IV.iMin, 'lower LPL captures lower currents');
  assert.equal(DOWN_CONDUCTOR_MIN_MM2.copper, 16);
  assert.equal(LOCATION_FACTORS.isolated, 1.0);
  assert.ok(STANDARD_ARRESTER_KV.length > 10 && STANDARD_ARRESTER_KV.every((v, i, a) => i === 0 || v > a[i - 1]),
    'arrester table is sorted ascending');
  assert.ok(DEFAULT_NC > 0);
})();

// ---------------------------------------------------------------------------
// Ground flash density
// ---------------------------------------------------------------------------
(function testNg() {
  approx(groundFlashDensity(30), 0.04 * Math.pow(30, 1.25), 1e-9, 'Ng = 0.04·Td^1.25');
  approx(groundFlashDensity(30), 2.808, 0.01, 'Ng(30) ≈ 2.81');
  assert.equal(groundFlashDensity(0), 0, 'no storm days → zero Ng');
  // Monotonic increasing in Td
  assert.ok(groundFlashDensity(50) > groundFlashDensity(20), 'Ng increases with Td');
})();

// ---------------------------------------------------------------------------
// Collection area and expected strikes
// ---------------------------------------------------------------------------
(function testAreaStrikes() {
  // Ad = L·W + 2·(3H)(L+W) + π·(3H)²
  const expected = 50 * 30 + 2 * 60 * 80 + Math.PI * 3600;
  approx(collectionArea(50, 30, 20), expected, 1e-6, 'collection area formula');
  approx(collectionArea(50, 30, 20), 22409.7, 1, 'collection area ≈ 22410 m²');

  const rectangle = resolveFootprintGeometry({ structureShape: 'rectangle', length: 50, width: 30 });
  assert.equal(rectangle.areaM2, 1500, 'rectangular footprint area');
  assert.equal(rectangle.perimeterM, 160, 'rectangular footprint perimeter');
  approx(rectangle.requiredCoverageRadiusM, Math.hypot(25, 15), 1e-9, 'rectangle farthest centered point');
  approx(collectionAreaFromFootprint(rectangle.areaM2, rectangle.perimeterM, 20), expected, 1e-6,
    'general footprint formula matches rectangular helper');

  const circle = resolveFootprintGeometry({ structureShape: 'circle', diameter: 40 });
  approx(circle.areaM2, Math.PI * 20 ** 2, 1e-9, 'circular footprint area');
  approx(circle.perimeterM, Math.PI * 40, 1e-9, 'circular footprint perimeter');
  assert.equal(circle.requiredCoverageRadiusM, 20, 'circular farthest centered point');

  const custom = resolveFootprintGeometry({
    structureShape: 'custom',
    footprintArea: 600,
    footprintPerimeter: 110,
    farthestPointRadius: 18,
  });
  assert.equal(custom.label, STRUCTURE_SHAPES.custom, 'custom footprint label');
  assert.equal(custom.areaM2, 600, 'custom area preserved');
  assert.equal(custom.perimeterM, 110, 'custom perimeter preserved');

  // Nd = Ng · Ad · Cd · 1e-6
  approx(expectedStrikes(2.81, 22410, 1), 2.81 * 22410 * 1e-6, 1e-12, 'expected strikes formula');
  // Location factor scales linearly
  approx(expectedStrikes(2.81, 22410, 0.5), expectedStrikes(2.81, 22410, 1) * 0.5, 1e-12, 'Cd scales Nd');
})();

// ---------------------------------------------------------------------------
// LPL recommendation (efficiency table)
// ---------------------------------------------------------------------------
(function testRecommendLPL() {
  // Nd ≤ Nc → not required
  const none = recommendLPL(1e-4, 1e-3);
  assert.equal(none.required, false, 'low strike rate → no LPS required');

  // Select the least-restrictive class whose own interception probability
  // meets the calculated screening efficiency.
  assert.equal(recommendLPL(1.0, 0.005).level, 'I', 'E=0.995 → LPL I plus additional measures');
  assert.equal(recommendLPL(1.0, 0.03).level, 'II', 'E=0.97 → LPL II');
  assert.equal(recommendLPL(1.0, 0.07).level, 'II', 'E=0.93 → LPL II');
  assert.equal(recommendLPL(1.0, 0.15).level, 'III', 'E=0.85 → LPL III');
  assert.equal(recommendLPL(1.0, 0.30).level, 'IV', 'E=0.70 → LPL IV sufficient');

  const r = recommendLPL(0.05, 1e-3);
  approx(r.efficiency, 1 - 1e-3 / 0.05, 1e-9, 'efficiency = 1 - Nc/Nd');
  assert.ok(r.required);
  assert.ok(LPL_TABLE[r.level].interception >= r.efficiency || r.level === 'I',
    'recommended class meets required efficiency or identifies the LPL I ceiling');
})();

// ---------------------------------------------------------------------------
// Rolling sphere geometry
// ---------------------------------------------------------------------------
(function testRollingSphere() {
  // Striking distance r = 10·I^0.65
  approx(strikingDistance(10), 10 * Math.pow(10, 0.65), 1e-9, 'striking distance formula');

  // Single mast: rp = √(h(2R-h)) - √(hx(2R-hx))
  const rp = singleMastRadius(30, 3, 45);
  approx(rp, Math.sqrt(30 * 60) - Math.sqrt(3 * 87), 1e-9, 'single-mast protective radius');
  approx(rp, 26.27, 0.05, 'protective radius ≈ 26.3 m');

  // Protected radius shrinks as the protected object gets taller
  assert.ok(singleMastRadius(30, 10, 45) < singleMastRadius(30, 3, 45), 'taller object → smaller protected radius');
  // No protection when object is as tall as the mast
  assert.equal(singleMastRadius(20, 20, 45), 0, 'object at mast height → zero radius');
  // Larger sphere (lower LPL) gives larger protective radius for the same mast
  assert.ok(singleMastRadius(30, 3, 60) > singleMastRadius(30, 3, 20), 'bigger sphere → bigger radius');

  const roofRadius = roofTerminalRadius(15, 10, 20);
  approx(roofRadius, Math.sqrt(5 * 35), 1e-9, 'roof terminal uses protrusion above the reference plane');
  assert.equal(roofTerminalRadius(10, 10, 20), 0, 'terminal at the reference plane provides no roof coverage');
  assert.equal(roofTerminalRadius(35, 10, 20), 20, 'terminal protrusion is capped at R');

  const footprint = resolveFootprintGeometry({
    structureShape: 'rectangle',
    length: 40,
    width: 20,
  });
  const array = generateTerminalArray(footprint, {
    terminalRows: 2,
    terminalColumns: 3,
    terminalEdgeSetback: 2,
  });
  assert.equal(array.terminals.length, 6, 'rows × columns creates the terminal count');
  assert.deepEqual(array.terminals[0], { xM: -18, yM: -8, row: 0, column: 0 },
    'rectangular array starts at the setback-adjusted corner');
  const arrayCoverage = evaluateTerminalArrayCoverage(footprint, array.terminals, roofRadius);
  approx(arrayCoverage.maxRequiredRadiusM, Math.hypot(9, 8), 1e-9,
    'exact grid evaluation finds the worst Voronoi-cell point');
  assert.equal(arrayCoverage.coverageComplete, true, 'six-terminal array covers the example roof');

  const sparseArray = generateTerminalArray(footprint, {
    terminalRows: 2,
    terminalColumns: 2,
    terminalEdgeSetback: 2,
  });
  assert.equal(
    evaluateTerminalArrayCoverage(footprint, sparseArray.terminals, roofRadius).coverageComplete,
    false,
    'sparse array exposes a center gap',
  );
})();

// ---------------------------------------------------------------------------
// NFPA 780 / UL 96A design workflow
// ---------------------------------------------------------------------------
(function testNfpaUlDesignWorkflow() {
  const footprint = resolveFootprintGeometry({
    structureShape: 'rectangle',
    length: 60,
    width: 40,
  });
  const generated = generateNfpaUlTerminalArray(footprint);
  assert.ok(generated.edgeSetbackM <= NFPA_UL_MAX_TERMINAL_EDGE_DISTANCE_M,
    'automatic layout keeps terminals within 2 ft of the roof edge');
  const xCoordinates = [...new Set(generated.terminals.map(item => item.xM))].sort((a, b) => a - b);
  const maxXSpacing = Math.max(...xCoordinates.slice(1).map((value, index) => value - xCoordinates[index]));
  assert.ok(maxXSpacing <= NFPA_UL_MAX_TERMINAL_SPACING_M + 1e-9,
    'automatic layout limits terminal spacing to 20 ft');

  const result = runLightningProtection({
    designStandard: 'nfpa-ul',
    autoTerminalLayout: true,
    groundFlashDensity: 4,
    structureShape: 'rectangle',
    length: 60,
    width: 40,
    height: 25,
    airTerminalHeight: 30,
    protectedHeight: 3,
    protectionMethod: 'roof-array',
    bomAssumptions: {
      conductorWastePercent: 10,
      roofSupportSpacingM: 0.9,
      downConductorSupportSpacingM: 0.9,
      downConductorRouteAllowanceM: 2,
      includePerimeterRing: true,
    },
  });
  assert.equal(result.designCompliance.designReady, true,
    'all calculable NFPA/UL checks pass for the automatic rectangular layout');
  assert.equal(result.designCompliance.status, 'design-ready-with-assumptions');
  assert.equal(result.designCompliance.componentClass, 'Class II',
    'structures above 75 ft use the Class II component basis');
  assert.ok(result.designCompliance.assumptions.length >= 5,
    'field-dependent requirements are recorded as project assumptions');
  assert.ok(result.designCompliance.exclusions.some(item => /final UL field inspection/i.test(item)),
    'final inspection is explicitly excluded');
  assert.equal(result.bom.procurementReady, true,
    'BOM planning status requires the calculable standards checks to pass');
  assert.match(result.bom.designBasis, /NFPA 780 \/ UL 96A/);

  const supportFailure = runLightningProtection({
    ...result.inputs,
    groundFlashDensity: 4,
    designStandard: 'nfpa-ul',
    autoTerminalLayout: true,
    bomAssumptions: {
      ...result.inputs.bomAssumptions,
      roofSupportSpacingM: NFPA_UL_MAX_CONDUCTOR_SUPPORT_SPACING_M + 0.1,
    },
  });
  assert.equal(supportFailure.designCompliance.designReady, false,
    'support spacing over 3 ft prevents design-ready status');
  assert.equal(supportFailure.bom.procurementReady, false,
    'a failed standards check prevents BOM procurement readiness');
})();

// ---------------------------------------------------------------------------
// Down-conductors
// ---------------------------------------------------------------------------
(function testDownConductors() {
  assert.equal(downConductorCount(160, 10), 16, 'perimeter 160 / spacing 10 = 16');
  assert.equal(downConductorCount(15, 10), 2, 'minimum two down-conductors');
  assert.equal(downConductorCount(0, 10), 2, 'degenerate → minimum two');
  assert.equal(
    downConductorCount(200.00000000000003, 10),
    20,
    'unit-conversion noise does not add an extra down-conductor',
  );

  const rectangle = resolveFootprintGeometry({
    structureShape: 'rectangle',
    length: 60,
    width: 40,
  });
  const rectangleLayout = generateDownConductorLayout(rectangle, 10);
  assert.equal(rectangleLayout.count, 20, '60 m by 40 m rectangle uses twenty 10 m perimeter segments');
  assert.equal(rectangleLayout.cornerCount, 4, 'rectangular layout starts with all four corners');
  assert.equal(rectangleLayout.intermediateCount, 16, 'additional routes are distributed along the walls');
  approx(rectangleLayout.achievedMaxSpacingM, 10, 1e-9, 'wall spacing respects the selected class spacing');
  assert.equal(rectangleLayout.points.filter(point => point.isCorner).length, 4,
    'four generated coordinates are identified as corners');
  const imperialRoundTrip = resolveFootprintGeometry({
    structureShape: 'rectangle',
    length: 196.85 / 3.280839895,
    width: 131.234 / 3.280839895,
  });
  assert.equal(
    generateDownConductorLayout(imperialRoundTrip, 10).count,
    20,
    'three-decimal imperial display values retain the nominal 60 m by 40 m layout count',
  );

  const smallSquare = resolveFootprintGeometry({
    structureShape: 'rectangle',
    length: 11,
    width: 11,
  });
  assert.equal(
    generateDownConductorLayout(smallSquare, 10).count,
    8,
    'corner-first layout adds intermediate routes when each wall exceeds the spacing',
  );
  approx(LIGHTNING_CONDUCTOR_MIN_BEND_RADIUS_M, 0.2032, 1e-12,
    'installation coordination exposes the 8 inch bend-radius reference');
})();

// ---------------------------------------------------------------------------
// Surge arrester selection
// ---------------------------------------------------------------------------
(function testArrester() {
  // Solidly grounded 138 kV: Uc ≥ 1.05·138/√3
  approx(arresterMCOV(138, 'solid'), 1.05 * 138 / Math.sqrt(3), 1e-9, 'solid MCOV formula');
  approx(arresterMCOV(138, 'solid'), 83.66, 0.05, 'MCOV(138 kV solid) ≈ 83.7 kV');
  // Ungrounded uses full line-to-line
  approx(arresterMCOV(13.8, 'ungrounded'), 1.05 * 13.8, 1e-9, 'ungrounded MCOV = 1.05·VLL');
  assert.ok(arresterMCOV(138, 'ungrounded') > arresterMCOV(138, 'solid'), 'ungrounded needs higher MCOV');

  const rec = recommendArrester(138, 'solid');
  assert.equal(rec.applicable, true, 'MV arrester workflow applies above 1 kV');
  approx(rec.ratedRequired, rec.mcov / 0.8, 1e-9, 'rated = MCOV/0.8');
  assert.ok(rec.ratedStandard >= rec.ratedRequired, 'standard rating ≥ required');
  assert.ok(STANDARD_ARRESTER_KV.includes(rec.ratedStandard), 'standard rating is from the table');

  const lv = recommendArrester(MIN_ARRESTER_SYSTEM_KV, 'solid');
  assert.equal(lv.applicable, false, '1 kV and below routes to low-voltage SPD review');
  assert.equal(lv.ratedStandard, null, 'LV systems do not receive an MV arrester rating');
})();

// ---------------------------------------------------------------------------
// runLightningProtection — full study
// ---------------------------------------------------------------------------
(function testRun() {
  const r = runLightningProtection({
    thunderstormDays: 40,
    length: 60, width: 40, height: 25,
    location: 'isolated',
    tolerableFrequency: 1e-3,
    protectedHeight: 3,
    airTerminalHeight: 30,
    downConductorMaterial: 'copper',
    systemKvLL: 138,
    grounding: 'solid',
  });

  assert.ok(r.groundFlashDensity > 0, 'Ng computed');
  assert.equal(r.inputs.thunderstormDays, 40, 'source thunderstorm-day input is preserved for visual study restore');
  approx(r.collectionAreaM2, collectionArea(60, 40, 25), 1e-6, 'area matches helper');
  assert.ok(r.expectedStrikesPerYear > 0, 'Nd computed');
  assert.ok(['I', 'II', 'III', 'IV'].includes(r.lpl.level), 'an LPL is recommended');
  assert.equal(r.rollingSphereRadius, LPL_TABLE[r.lpl.level].radius, 'sphere radius matches LPL');
  assert.ok(r.mastProtectiveRadiusM >= 0, 'protective radius present');
  approx(r.requiredCoverageRadiusM, Math.hypot(30, 20), 1e-9, 'rectangle centered coverage target');
  assert.equal(r.coverageComplete, r.mastProtectiveRadiusM >= r.requiredCoverageRadiusM,
    'coverage check compares rolling-sphere radius with farthest footprint point');
  assert.equal(r.inputs.airTerminalHeight, 30, 'air-terminal height is preserved');
  assert.equal(r.perimeterM, 2 * (60 + 40), 'perimeter = 2(L+W)');
  assert.ok(r.downConductorCount >= 2, 'at least two down-conductors');
  assert.equal(r.downConductorMinAreaMm2, 16, 'copper min 16 mm²');
  assert.ok(r.arrester && r.arrester.ratedStandard > 0, 'arrester recommended');
  assert.ok(Array.isArray(r.warnings));

  const roofArray = runLightningProtection({
    groundFlashDensity: 4,
    length: 40,
    width: 20,
    height: 10,
    airTerminalHeight: 15,
    protectedHeight: 3,
    protectionMethod: 'roof-array',
    terminalRows: 2,
    terminalColumns: 3,
    terminalEdgeSetback: 2,
  });
  assert.equal(roofArray.protectionMethod, 'roof-array', 'roof-array method is preserved');
  assert.equal(roofArray.referencePlaneHeightM, 10, 'roof is the minimum array reference plane');
  assert.equal(roofArray.terminalArray.terminals.length, 6, 'array coordinates are returned');
  approx(
    roofArray.terminalProtectiveRadiusM,
    roofTerminalRadius(15, 10, roofArray.rollingSphereRadius),
    1e-9,
    'array coverage uses terminal protrusion above the roof plane',
  );
  assert.equal(roofArray.coverageComplete, true, 'combined array coverage reaches the complete roof');
  assert.equal(roofArray.bom.ready, true, 'roof array generates a construction takeoff');
  assert.equal(roofArray.bom.procurementReady, true, 'passing coverage marks the takeoff ready for planning');
  approx(roofArray.bom.summary.gridConductorM, 132, 1e-9, 'grid conductor follows every row/column segment plus allowance');
  approx(roofArray.bom.summary.perimeterConductorM, 132, 1e-9, 'perimeter ring follows the roof perimeter plus allowance');
  assert.equal(
    roofArray.bom.rows.find(item => item.item === 'Point air terminal').quantity,
    6,
    'BOM includes one point terminal per array coordinate',
  );
  assert.equal(roofArray.bom.summary.downConductorCount, roofArray.downConductorCount,
    'BOM reports independent down paths separately from terminal quantity');
  assert.ok(roofArray.bom.installationNotes.some(note => /not assigned one-for-one/i.test(note)),
    'BOM explains that terminals and downconductors are not paired');
  assert.ok(roofArray.bom.installationNotes.some(note => /8 in/i.test(note)),
    'BOM carries the bend-radius installation reference');
  assert.ok(roofArray.warnings.some(warning => /regular 3 × 2 terminal grid/i.test(warning)),
    'array coordination limitation is visible');
})();

// ---------------------------------------------------------------------------
// runLightningProtection — Ng override and no-arrester path
// ---------------------------------------------------------------------------
(function testRunVariants() {
  const r = runLightningProtection({ groundFlashDensity: 4.0, length: 10, width: 10, height: 5 });
  approx(r.groundFlashDensity, 4.0, 1e-9, 'direct Ng override honoured');
  assert.equal(r.arrester, null, 'no arrester when system voltage omitted');

  const lowRisk = runLightningProtection({
    groundFlashDensity: 0.01,
    length: 10,
    width: 10,
    height: 10,
    airTerminalHeight: 12,
    location: 'surroundedTaller',
    tolerableFrequency: 1e-3,
  });
  assert.equal(lowRisk.lpl.required, false, 'low-risk case does not require an LPS');
  assert.equal(lowRisk.rollingSphereRadius, null, 'low-risk case does not invent LPL III geometry');
  assert.equal(lowRisk.mastProtectiveRadiusM, null, 'low-risk case omits mast coverage geometry');
  assert.equal(lowRisk.downConductorCount, 0, 'low-risk case omits a down-conductor design');
  assert.equal(lowRisk.bom.ready, false, 'low-risk screening does not generate an arbitrary LPS BOM');

  const lv = runLightningProtection({
    groundFlashDensity: 3,
    length: 60,
    width: 40,
    height: 25,
    airTerminalHeight: 30,
    systemKvLL: 0.208,
    grounding: 'solid',
  });
  assert.equal(lv.arrester.applicable, false, '208 V system routes to LV SPD review');
  assert.ok(lv.warnings.some(warning => /low-voltage SPD/i.test(warning)), 'LV SPD scope warning is emitted');

  const circular = runLightningProtection({
    structureShape: 'circle',
    diameter: 30,
    height: 12,
    airTerminalHeight: 20,
    protectedHeight: 3,
    groundFlashDensity: 3,
  });
  assert.equal(circular.inputs.structureShape, 'circle', 'circle shape is preserved');
  approx(circular.footprintAreaM2, Math.PI * 15 ** 2, 1e-9, 'circle area feeds the study');
  approx(circular.perimeterM, Math.PI * 30, 1e-9, 'circle perimeter feeds down-conductor layout');

  const custom = runLightningProtection({
    structureShape: 'custom',
    footprintArea: 600,
    footprintPerimeter: 110,
    farthestPointRadius: 18,
    height: 12,
    airTerminalHeight: 20,
    protectedHeight: 3,
    groundFlashDensity: 3,
  });
  assert.equal(custom.inputs.structureShape, 'custom', 'custom shape is preserved');
  assert.equal(custom.requiredCoverageRadiusM, 18, 'custom farthest point drives plan coverage check');
  assert.ok(custom.warnings.some(warning => /plan outline is schematic/i.test(warning)),
    'custom geometry limitation is visible');
})();

// ---------------------------------------------------------------------------
// PDF report model
// ---------------------------------------------------------------------------
(function testPdfReportModel() {
  const result = runLightningProtection({
    groundFlashDensity: 3,
    structureShape: 'rectangle',
    length: 40,
    width: 24,
    height: 10,
    airTerminalHeight: 11,
    protectedHeight: 10,
    protectionMethod: 'roof-array',
    terminalRows: 2,
    terminalColumns: 4,
    terminalEdgeSetback: 1,
    systemKvLL: 13.8,
    grounding: 'solid',
  });
  const metric = buildLightningProtectionReportModel(result, 'metric', new Date('2026-07-28T12:00:00Z'));
  const imperial = buildLightningProtectionReportModel(result, 'imperial', new Date('2026-07-28T12:00:00Z'));

  assert.equal(metric.summary[1].value, '8 point terminals', 'PDF summarizes the complete roof array');
  assert.ok(metric.dimensions.some(item => item.value === '40.00 m'), 'metric report retains metre dimensions');
  assert.ok(imperial.dimensions.some(item => item.value === '131.23 ft'), 'imperial report converts metre dimensions to feet');
  assert.ok(metric.protection.some(item => /Rolling-sphere radius/.test(item.label)), 'PDF includes rolling-sphere design values');
  assert.ok(metric.surge.some(item => item.label === 'Minimum MCOV'), 'PDF includes surge-arrester screening');
  assert.ok(metric.bom?.rows.some(item => item.item === 'Point air terminal'), 'PDF model includes the live BOM');
  assert.ok(imperial.bom?.rows.some(item => /ft$/.test(item.quantity)), 'PDF BOM converts conductor lengths to feet');
  assert.ok(imperial.warnings.some(item => /\d+(?:\.\d+)? ft/.test(item)),
    'imperial PDF design-check statements convert embedded metre values to feet');
  assert.ok(!imperial.warnings.some(item => /\d+(?:\.\d+)? m\b/.test(item)),
    'imperial PDF design-check statements do not leak metre values');
  assert.ok(metric.limitations.some(item => /not a complete IEC 62305-2/i.test(item)), 'PDF states the screening limitation');
})();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
(function testValidation() {
  assert.throws(() => runLightningProtection({ length: 0, width: 10, height: 5, thunderstormDays: 30 }),
    /positive structure/i, 'zero dimension rejected');
  assert.throws(() => runLightningProtection({ length: 10, width: 10, height: 5 }),
    /ground flash density|thunderstorm/i, 'missing Ng/Td rejected');
  assert.throws(() => runLightningProtection({
    length: 10, width: 10, height: 5, airTerminalHeight: 4, thunderstormDays: 30,
  }), /at least the structure height/i, 'air-terminal height below structure is rejected');
  assert.throws(() => runLightningProtection({
    structureShape: 'circle', diameter: 0, height: 5, thunderstormDays: 30,
  }), /positive structure diameter/i, 'zero circular diameter rejected');
  assert.throws(() => runLightningProtection({
    structureShape: 'custom',
    footprintArea: 600,
    footprintPerimeter: 80,
    farthestPointRadius: 18,
    height: 5,
    thunderstormDays: 30,
  }), /too large/i, 'impossible custom area and perimeter rejected');
  assert.throws(() => runLightningProtection({
    structureShape: 'custom',
    footprintArea: 600,
    footprintPerimeter: 110,
    farthestPointRadius: 18,
    height: 10,
    airTerminalHeight: 15,
    groundFlashDensity: 3,
    protectionMethod: 'roof-array',
    terminalRows: 2,
    terminalColumns: 3,
  }), /rectangular or circular footprint/i, 'custom roof arrays require known boundaries');
})();

console.log('lightningProtection.test.mjs — all assertions passed');
