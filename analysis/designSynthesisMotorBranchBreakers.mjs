import { evaluateMotor40HpCandidate } from './designSynthesisMotor40HpCandidate.mjs';
import { evaluateMotorS3Candidate } from './designSynthesisMotorS3Candidate.mjs';
import { evaluateMotor25HpCandidate, evaluateMotorS2Candidates } from './designSynthesisMotor25HpCandidate.mjs';
import { SMALL_MOTOR_BREAKER_PICKUPS, resolveMotorStarterPickup } from './motorStarterPickup.mjs';

const CERTIFICATE_SOURCE_ID = 'siemens-ul-e44653-2025-03-17';
const SPEEDFAX_SOURCE_ID = 'siemens-3va51-speedfax-2024';
const BREAKER_PRODUCT_SOURCE_ID = 'siemens-3va51-exact-product-data';
const BREAKER_30A_TCC_SOURCE_ID = 'siemens-3va5130-30a-tcc-2018-02-01';
const CONTACTOR_SOURCE_ID = 'siemens-3rt2027-1bb40-product-data';
const CONTACTOR_DATASHEET_SOURCE_ID = 'siemens-3rt2027-1bb40-datasheet';
const CONTACTOR_HP_SOURCE_ID = 'siemens-3rt2027-1bb40-datasheet-es';
const RELAY_SOURCE_ID = 'siemens-3ru2126-4ab0-datasheet';
const RELAY_20A_SOURCE_ID = 'siemens-3ru2126-4bb0-product';
const CODE_GUIDANCE_SOURCE_ID = 'eaton-motor-circuit-notes';
const MAX_COMBINATION_SCCR_KA = 65;
const INSTANTANEOUS_PICKUPS_A = SMALL_MOTOR_BREAKER_PICKUPS;

const SOURCES = Object.freeze([
  Object.freeze({
    id: CERTIFICATE_SOURCE_ID,
    publisher: 'UL LLC (Siemens-hosted certificate)',
    title: 'UL Certificate of Compliance E44653, Siemens 3RU2126 combination ratings',
    url: 'https://cache.industry.siemens.com/dl/files/299/40223299/att_1326996/v1/3RU2126_CoC_202505131337157102.pdf',
    revision: '2025-03-17',
    accessedOn: '2026-10-19',
    sha256: 'c55126215a47084e9d40a8f0e11589a083285798a294c2ff32ce1ef00e55d45d',
    locators: Object.freeze([
      'PDF page 12: lower-table scope heading for 3RT2027 and 3RT2028 contactors; the separate 3RT2023/2024/2025/2026 table starts on page 11 and continues at the top of page 12',
      'PDF page 12: 3RT2027/2028 + 3RU2126-4A, overload range 11–16 A; 3VA51 HEAS maximum 30 A; conditional Type 1 combination rating 65 kA at 480 V',
      'PDF page 12: 3RT2027/2028 + 3RU2126-4B, overload range 14–20 A; 3VA51 HEAS maximum 40 A; conditional Type 1 combination rating 65 kA at 480 V',
      'PDF page 2: overload relay published trip calibration is 125% of dial setting; this is not a clearing curve or application setting limit',
      'PDF page 12: BCPD and fault-current selection notes; rating is not assembled-panel SCCR'
    ])
  }),
  Object.freeze({
    id: SPEEDFAX_SOURCE_ID,
    publisher: 'Siemens Industry, Inc.',
    title: 'SPEEDFAX 2024, 3VA51 UL molded-case circuit-breaker catalog',
    url: 'https://cache.industry.siemens.com/dl/files/309/109983309/att_1316107/v1/SF-17-Sect-07-ALL-web.pdf?download=true',
    revision: '2024-09-30',
    accessedOn: '2026-10-19',
    sha256: '0ccebc370709cac0e919b99369693e64722183d0c27fdaeb766215722396f6cb',
    locators: Object.freeze([
      'PDF page 50 (printed 7-50): HEAS UL489 ratings; 3-pole 65 kA at 480 V and 480Y/277 V, 50/60 Hz',
      'PDF page 51 (printed 7-51): exact 25 A and 30 A three-pole TM230 FTAM catalog numbers under HEAS; supplied without lugs',
      'PDF page 53 (printed 7-53): TM230 instantaneous pickup values 150, 180, 210, 240, 270, and 300 A'
    ])
  }),
  Object.freeze({
    id: BREAKER_PRODUCT_SOURCE_ID,
    publisher: 'Siemens AG',
    title: 'Siemens Industry Mall exact 3VA51 breaker product records',
    url: 'https://mall.industry.siemens.com/mall/en/en/Catalog/product?mlfb=3VA5130-6EC31-0AA0',
    revision: 'Catalog product records, accessed 2026-10-19',
    accessedOn: '2026-10-19',
    locators: Object.freeze([
      '3VA5130-6EC31-0AA0 exact product: 3-pole, class H 65 kA at 480 V, TM230/FTAM, 30 A fixed Ir, Ii 5–10 × In, no connection included',
      '3VA5125-6EC31-0AA0 exact product: 3-pole, class H 65 kA at 480 V, TM230/FTAM, 25 A fixed Ir, Ii 6–12 × In, no connection included'
    ])
  }),
  Object.freeze({
    id: BREAKER_30A_TCC_SOURCE_ID,
    publisher: 'Siemens AG',
    title: 'SIE TCC 3VA5130 30 A 3P LI TM210-240',
    url: 'https://cache.industry.siemens.com/dl/files/743/109801743/att_1079474/v1/SIE_TCC_3VA5130_30A_3P_LI_TM210-240.pdf',
    revision: 'Drawing L1V30040333304ADS01 / PDF 304aUD_01, 2018-02-01',
    accessedOn: '2026-10-21',
    sha256: 'f62f22900761e701bde34df6308fe7c29fd5b2ecdf4a5d2947f882ced0e0c94e',
    locators: Object.freeze([
      'PDF page 1: Siemens 3VA5130 30 A, 3-pole, LI TM230 configuration graphic; exact candidate mapping uses Siemens catalog/product records because the full catalog number is not printed on the graphic',
      'PDF page 1: fixed Ir 30 A; listed Ii settings 150, 180, 210, 240, 270, and 300 A',
      'PDF page 1: plotted at 40 C, cold, open air, 4 ft, 75 C wire, per terminal, all main poles',
      'PDF page 1: 40 C cold-start thermal nominal trace with illustrated tolerances; this is not a guaranteed thermal-clearing envelope',
      'PDF page 1 instantaneous inset labels dashed maximum clearing and solid minimum tripping only; no 25 A 3VA5125 curve is supplied by this source',
      'Archived evidence: output/design-synthesis-protection-next-2026-10-21/sources/siemens-3va5130-30a.pdf; rendered image: siemens-3va5130-30a.png'
    ])
  }),
  Object.freeze({
    id: CONTACTOR_SOURCE_ID,
    publisher: 'Siemens AG',
    title: 'Siemens Industry Mall, 3RT2027-1BB40 contactor product record',
    url: 'https://mall.industry.siemens.com/mall/en/ietkeown/Catalog/Product?SiepCountryCode=OE&mlfb=3RT2027-1BB40',
    revision: 'Catalog product record, accessed 2026-10-19',
    accessedOn: '2026-10-19',
    locators: Object.freeze(['Exact article, three poles, S0 size, screw terminals, and 24 V DC coil'])
  }),
  Object.freeze({
    id: CONTACTOR_DATASHEET_SOURCE_ID,
    publisher: 'Siemens AG',
    title: 'Siemens 3RT2027-1BB40 product datasheet',
    url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RT20271BB40',
    revision: 'Exact article product datasheet, accessed 2026-10-19',
    accessedOn: '2026-10-19',
    locators: Object.freeze([
      'PDF page 4: UL 480 V three-phase motor FLA 27 A and 24 V DC coil'
    ])
  }),
  Object.freeze({
    id: CONTACTOR_HP_SOURCE_ID,
    publisher: 'Siemens AG',
    title: 'Siemens 3RT2027-1BB40 exact-article product datasheet, Spanish',
    url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=es&mlfbs=3RT2027-1BB40',
    revision: '2026-01-28; indexed primary-source text inspected, direct PDF retrieval unavailable',
    accessedOn: '2026-10-19',
    locators: Object.freeze(['PDF page 5: UL/CSA three-phase motor horsepower 20 hp at 460/480 V; exact base article without accessory suffix'])
  }),
  Object.freeze({
    id: RELAY_SOURCE_ID,
    publisher: 'Siemens AG',
    title: 'Siemens 3RU2126-4AB0 product datasheet',
    url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2126-4AB0',
    revision: 'Exact article product datasheet, accessed 2026-10-19',
    accessedOn: '2026-10-19',
    locators: Object.freeze(['PDF page 1: 11–16 A, class 10, S0, contactor-mounted, screw terminals'])
  }),
  Object.freeze({
    id: CODE_GUIDANCE_SOURCE_ID,
    publisher: 'Eaton',
    title: 'Motor circuit notes: inverse-time circuit-breaker sizing overview',
    url: 'https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-motor-circuit-notes.pdf',
    revision: '2005 Cooper Bussmann, printed page 142; historical manufacturer guidance, not an adopted-code determination',
    accessedOn: '2026-10-19',
    locators: Object.freeze(['Printed page 142: inverse-time squirrel-cage breaker 250% maximum and table-based design FLC rather than nameplate; exact adopted NEC edition and application remain unevaluated'])
  }),
  Object.freeze({
    id: RELAY_20A_SOURCE_ID,
    publisher: 'Siemens AG',
    title: 'Siemens 3RU2126-4BB0 overload relay product record',
    url: 'https://sieportal.siemens.com/en-be/products-services/detail/3RU21264BB0',
    revision: 'Exact article product record, accessed 2026-10-28',
    accessedOn: '2026-10-28',
    locators: Object.freeze(['14–20 A, class 10, size S0, contactor mounted, screw terminals'])
  })
]);

const RELAYS = Object.freeze([
  Object.freeze({ catalogNumber: '3RU2126-4AB0', family: '3RU2126-4A', minA: 11, maxA: 16, certificateMaxA: 30, sourceId: RELAY_SOURCE_ID }),
  Object.freeze({ catalogNumber: '3RU2126-4BB0', family: '3RU2126-4B', minA: 14, maxA: 20, certificateMaxA: 40, sourceId: RELAY_20A_SOURCE_ID })
]);
const relayFor = current => RELAYS.find(relay => finitePositive(current) && current >= relay.minA && current <= relay.maxA) || RELAYS[0];

const BREAKERS = Object.freeze([
  Object.freeze({
    catalogNumber: '3VA5125-6EC31-0AA0', frame: 125, poles: 3, tripUnit: 'TM230', tripTechnology: 'FTAM',
    interruptingClass: 'H / HEAS', ratedVoltageV: 480, ratedNetworkFrequencyHz: Object.freeze([50, 60]), interruptingRatingKA: 65,
    continuousCurrentA: 25, fixedOverloadPickupA: 25,
    instantaneousPickupMinMultiple: 6, instantaneousPickupMaxMultiple: 12,
    allowedInstantaneousPickupA: INSTANTANEOUS_PICKUPS_A
  }),
  Object.freeze({
    catalogNumber: '3VA5130-6EC31-0AA0', frame: 125, poles: 3, tripUnit: 'TM230', tripTechnology: 'FTAM',
    interruptingClass: 'H / HEAS', ratedVoltageV: 480, ratedNetworkFrequencyHz: Object.freeze([50, 60]), interruptingRatingKA: 65,
    continuousCurrentA: 30, fixedOverloadPickupA: 30,
    instantaneousPickupMinMultiple: 5, instantaneousPickupMaxMultiple: 10,
    allowedInstantaneousPickupA: INSTANTANEOUS_PICKUPS_A
  })
]);

const finitePositive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function sanitize(value, seen = new WeakSet()) {
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular evidence]';
    seen.add(value);
    return value.map(item => sanitize(item, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular evidence]';
    seen.add(value);
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sanitize(nested, seen)]));
  }
  return value;
}

function check(id, status, message, evidence = null, sourceIds = []) {
  return { id, status, message, evidence: sanitize(evidence), sourceIds: [...sourceIds] };
}

function fieldSource(pointer, sourceId, locator, status = 'verified') {
  return { pointer, sourceId, locator, status };
}

function sourceCopies(excludedIds = []) {
  const excluded = new Set(excludedIds);
  return SOURCES
    .filter(source => !excluded.has(source.id))
    .map(source => ({ ...source, locators: [...source.locators] }));
}

function breakerCurveResearch(breaker, selectedInstantaneousPickupA = null) {
  if (breaker.catalogNumber !== '3VA5130-6EC31-0AA0') {
    return {
      status: 'exact-source-missing',
      matchingManufacturerGraphicAvailable: false,
      exactCandidateCatalogNumber: breaker.catalogNumber,
      sourceId: null,
      sourceUrl: null,
      sourceAvailability: 'No exact 25 A 3VA5125 curve was located; the available 30 A graphic applies only to 3VA5130-6EC31-0AA0 and is not transferable.',
      settingsApplicability: 'Unknown for the exact 25 A candidate; no curve settings are inferred from the 30 A source.',
      testConditions: 'Not established for the exact 25 A candidate.',
      remainingQualification: [
        'Obtain the exact 25 A manufacturer curve and establish its settings and applicability.',
        'No qualified numeric envelope, motor-start trace, or coordination assessment is available.'
      ]
    };
  }
  return {
    status: 'matching-graphic-located-unqualified',
    matchingManufacturerGraphicAvailable: true,
    exactCandidateCatalogNumber: breaker.catalogNumber,
    sourceId: BREAKER_30A_TCC_SOURCE_ID,
    sourceUrl: SOURCES.find(source => source.id === BREAKER_30A_TCC_SOURCE_ID).url,
    sourceAvailability: 'Official Siemens manufacturer graphic matching the 30 A 3-pole TM230 LI configuration is located; the full catalog number is matched through Siemens catalog/product records and is not printed on the graphic.',
    settingsApplicability: {
      tripUnit: 'TM230 LI',
      fixedIrA: 30,
      instantaneousPickupA: [...INSTANTANEOUS_PICKUPS_A],
      selectedInstantaneousPickupA: INSTANTANEOUS_PICKUPS_A.includes(selectedInstantaneousPickupA) ? selectedInstantaneousPickupA : null,
      applicability: 'Graphic identifies listed settings; installed setting and motor-start suitability are not established.'
    },
    testConditions: {
      ambientC: 40,
      initialCondition: 'cold start',
      installation: 'open air',
      wireLength: '4 ft',
      conductorTemperatureRatingC: 75,
      conductorBasis: 'per terminal',
      poles: 'all main poles'
    },
    curveInterpretation: {
      thermal: '40 C cold-start nominal trace with illustrated tolerances; not a guaranteed thermal-clearing envelope.',
      instantaneous: 'Inset labels dashed maximum clearing and solid minimum tripping only.'
    },
    remainingQualification: [
      'No qualified numeric protective envelope is derived from the graphic.',
      'No motor starting trace or device operation / clearing applicability is established.',
      'Starting discrimination, conductor thermal withstand, and selective coordination remain unverified.'
    ]
  };
}

function runningCurrent(load) {
  const kw = load?.kw;
  const voltage = load?.voltage;
  const powerFactor = load?.powerFactor ?? load?.motor?.powerFactor;
  if (!finitePositive(kw) || !finitePositive(voltage) || load?.phases !== 3 || !finitePositive(powerFactor) || powerFactor > 1) return null;
  const current = kw * 1000 / (Math.sqrt(3) * voltage * powerFactor);
  return Number.isFinite(current) && current > 0 ? current : null;
}

function sharedChecks(load, supply, criteria, relay) {
  const motor = isRecord(load?.motor) ? load.motor : {};
  const checks = [];
  const addRequired = (id, value, label) => {
    const valid = finitePositive(value);
    checks.push(check(id, valid ? 'pass' : 'fail', valid ? `${label} is supplied as a finite positive value.` : `${label} must be a finite positive number.`, value));
  };
  checks.push(check('motorPresent', isRecord(load?.motor) ? 'pass' : 'fail', isRecord(load?.motor) ? 'Motor input is present.' : 'A motor record is required.'));
  checks.push(check('electricalInputAndDuty', load?.ratingsBasis === 'electrical-input-kW' && load?.duty === 'continuous' ? 'pass' : 'fail', 'This candidate screen requires explicitly continuous duty and electrical-input-kW ratings; shaft output is not substituted.', { ratingsBasis: load?.ratingsBasis ?? null, duty: load?.duty ?? null }));
  addRequired('loadCircuitVoltage', load?.voltage, 'Local motor-circuit voltage');
  addRequired('sourceVoltage', supply?.voltage, 'Supply voltage');
  addRequired('motorNameplateVoltage', motor.ratedVoltageV, 'Motor nameplate voltage');
  addRequired('motorNameplateCurrent', motor.nameplateCurrentA, 'Motor nameplate current');
  addRequired('motorNameplateHorsepower', motor.nameplateHorsepower, 'Motor nameplate horsepower');
  addRequired('motorNameplateFrequency', motor.nameplateFrequencyHz, 'Motor nameplate frequency');
  checks.push(check('loadPhases', load?.phases === 3 ? 'pass' : 'fail', load?.phases === 3 ? 'Load circuit is three-phase.' : 'Load motor circuit must be explicitly three-phase.', load?.phases ?? null));
  checks.push(check('sourcePhases', supply?.phases === 3 ? 'pass' : 'fail', supply?.phases === 3 ? 'Supply is three-phase.' : 'Supply must be explicitly three-phase.', supply?.phases ?? null));
  checks.push(check('effectiveFrequency', load?.frequencyHz === 60 ? 'pass' : 'fail', load?.frequencyHz === 60 ? 'Local motor circuit is 60 Hz.' : 'Local motor circuit must be explicitly 60 Hz.', load?.frequencyHz ?? null));
  checks.push(check('sourceFrequency', supply?.frequencyHz === 60 ? 'pass' : 'fail', supply?.frequencyHz === 60 ? 'Source is 60 Hz.' : 'Source frequency must be explicitly 60 Hz.', supply?.frequencyHz ?? null));
  const direct480 = load?.voltage === 480 && supply?.voltage === 480;
  checks.push(check('direct480VCircuit', direct480 ? 'pass' : 'fail', direct480 ? 'Source and local motor circuit are both directly 480 V; no transformer referral is assumed.' : 'The candidate requires a direct 480 V source and local 480 V motor circuit.', { sourceVoltageV: supply?.voltage ?? null, loadVoltageV: load?.voltage ?? null }));
  const motorVoltage = motor.ratedVoltageV === 460 || motor.ratedVoltageV === 480;
  checks.push(check('motorVoltageRating', motorVoltage ? 'pass' : 'fail', motorVoltage ? `The ${motor.ratedVoltageV} V motor nameplate rating is within the contactor's published 460/480 V rating.` : 'Motor nameplate voltage must be explicitly 460 V or 480 V.', { motorNameplateVoltageV: motor.ratedVoltageV ?? null, circuitVoltageV: load?.voltage ?? null }, [CONTACTOR_DATASHEET_SOURCE_ID]));
  const threePhase60Dol = load?.phases === 3 && supply?.phases === 3 && load?.frequencyHz === 60 && supply?.frequencyHz === 60 && motor.nameplateFrequencyHz === 60 && motor.starterType === 'dol';
  checks.push(check('threePhase60Hz', threePhase60Dol ? 'pass' : 'fail', threePhase60Dol ? 'Source and motor circuit are three-phase, 60 Hz, with a 60 Hz nameplate and DOL starter.' : 'Require three-phase source/load, 60 Hz source/load/nameplate, and DOL starting.', { sourcePhases: supply?.phases ?? null, loadPhases: load?.phases ?? null, sourceFrequencyHz: supply?.frequencyHz ?? null, loadFrequencyHz: load?.frequencyHz ?? null, nameplateFrequencyHz: motor.nameplateFrequencyHz ?? null, starterType: motor.starterType ?? null }, [CONTACTOR_DATASHEET_SOURCE_ID]));
  const nameplateCurrent = motor.nameplateCurrentA;
  const withinContactorFla = finitePositive(nameplateCurrent) && nameplateCurrent <= 27;
  checks.push(check('contactorUlCurrent', withinContactorFla ? 'pass' : 'fail', withinContactorFla ? 'Motor nameplate current is within the 27 A UL 480 V three-phase FLA rating of 3RT2027-1BB40.' : 'Motor nameplate current must not exceed 27 A, the contactor UL 480 V FLA rating.', { nameplateCurrentA: nameplateCurrent ?? null, maximumA: 27 }, [CONTACTOR_DATASHEET_SOURCE_ID]));
  const relayRange = finitePositive(nameplateCurrent) && nameplateCurrent >= relay.minA && nameplateCurrent <= relay.maxA;
  checks.push(check('relayCurrentRange', relayRange ? 'pass' : 'fail', relayRange ? `Motor nameplate current is within the ${relay.catalogNumber} ${relay.minA}–${relay.maxA} A setting range; the actual dial setting is not asserted.` : 'Motor nameplate current must be within a supported relay range (11–16 A or 14–20 A); no design FLC substitution is made.', { nameplateCurrentA: nameplateCurrent ?? null, minA: relay.minA, maxA: relay.maxA, catalogNumber: relay.catalogNumber }, [relay.sourceId]));
  const horsepower = motor.nameplateHorsepower;
  const hpFits = finitePositive(horsepower) && horsepower <= 20;
  checks.push(check('ulHorsepower', hpFits ? 'pass' : 'fail', hpFits ? 'Motor nameplate horsepower is within the 20 hp 460/480 V UL/CSA contactor rating.' : 'Explicit motor nameplate horsepower must not exceed 20 hp; electrical-input kW is not converted to hp.', { nameplateHorsepower: horsepower ?? null, maximumHorsepower: 20 }, [CONTACTOR_HP_SOURCE_ID]));
  const control = criteria?.motorStarter;
  const controlMatches = control?.controlVoltageV === 24 && control?.controlCurrentType === 'DC';
  checks.push(check('controlSupply', controlMatches ? 'pass' : 'fail', controlMatches ? 'Explicit project control criteria match the contactor 24 V DC coil.' : 'Explicit motor-starter criteria must specify a 24 V DC control supply.', { controlVoltageV: control?.controlVoltageV ?? null, controlCurrentType: control?.controlCurrentType ?? null }, [CONTACTOR_SOURCE_ID]));
  return checks;
}

function sizingCheck(breaker, values) {
  const { flc, runningA, minimumIrA, maximumIrA, relay } = values;
  if (flc === null || runningA === null || minimumIrA === null || maximumIrA === null) {
    return check('inverseTimeBreakerSizing', 'unevaluated', 'Eligibility needs a positive referenced design FLC and a calculable three-phase running-current estimate.', { catalogNumber: breaker.catalogNumber, fixedIrA: breaker.fixedOverloadPickupA, designFLC_A: flc, runningCurrentA: runningA, minimumIrA, maximumIrA }, [CODE_GUIDANCE_SOURCE_ID]);
  }
  const fits = breaker.fixedOverloadPickupA >= minimumIrA
    && breaker.fixedOverloadPickupA <= maximumIrA
    && breaker.fixedOverloadPickupA <= relay.certificateMaxA;
  return check('inverseTimeBreakerSizing', fits ? 'pass' : 'fail', fits
    ? `Fixed ${breaker.fixedOverloadPickupA} A pickup meets the conservative 125% maximum-current floor (nominal running, referenced operating when supplied, and design FLC), the conservative 250% design-FLC ceiling, and the certificate's ${relay.certificateMaxA} A maximum for ${relay.family}.`
    : `Fixed ${breaker.fixedOverloadPickupA} A pickup is outside the screening interval ${minimumIrA.toFixed(3)}–${Math.min(maximumIrA, relay.certificateMaxA).toFixed(3)} A; no next-size or startup exception is applied.`,
  { catalogNumber: breaker.catalogNumber, fixedIrA: breaker.fixedOverloadPickupA, designFLC_A: flc, runningCurrentA: runningA, minimumIrA, maximumIrA, certificateMaximumA: relay.certificateMaxA }, [CODE_GUIDANCE_SOURCE_ID, CERTIFICATE_SOURCE_ID]);
}

function makeCandidate(breaker, checks, load, supply, values) {
  const motor = load?.motor ?? {};
  const relay = values.relay;
  const blockersForShortlist = new Set([
    'motorPresent', 'loadCircuitVoltage', 'sourceVoltage', 'motorNameplateVoltage',
    'motorNameplateCurrent', 'motorNameplateHorsepower', 'motorNameplateFrequency',
    'loadPhases', 'sourcePhases', 'effectiveFrequency', 'sourceFrequency',
    'direct480VCircuit', 'motorVoltageRating', 'threePhase60Hz', 'contactorUlCurrent',
    'relayCurrentRange', 'ulHorsepower', 'controlSupply', 'explicitCode',
    'branchProtectionMethod', 'rotorType', 'designFLC', 'fullLoadCurrentBasis',
    'runningCurrentBasis', 'conditionalShortCircuitRating', 'motorStarterInstantaneousPickup', 'electricalInputAndDuty', 'referencedOperatingCurrent'
  ]);
  const blocker = checks.some(item => blockersForShortlist.has(item.id) && item.status === 'fail');
  const breakerSizing = checks.find(item => item.id === 'inverseTimeBreakerSizing');
  const selectedPickup = checks.find(item => item.id === 'motorStarterInstantaneousPickup')?.evidence?.selectedA;
  const curveResearch = breakerCurveResearch(breaker, selectedPickup);
  const sources = sourceCopies(breaker.catalogNumber === '3VA5130-6EC31-0AA0' ? [] : [BREAKER_30A_TCC_SOURCE_ID]);
  return {
    id: `siemens-dol-inverse-time-${breaker.catalogNumber.toLowerCase()}${relay === RELAYS[0] ? '' : `-${relay.catalogNumber.toLowerCase()}`}`,
    status: 'candidate',
    researchStatus: 'candidate',
    libraryStatus: 'screening',
    protectionStatus: 'blocked',
    selectedForApply: false,
    topology: 'separate-branch-breaker-contactor-overload-relay',
    starterType: 'dol',
    manufacturer: 'Siemens',
    contactor: {
      catalogNumber: '3RT2027-1BB40', poles: 3, size: 'S0', coilVoltageV: 24,
      coilCurrentType: 'DC', terminals: 'screw', ulThreePhaseMotorFlaAt480V: 27,
      ulThreePhaseMotorHorsepowerAt460Or480V: 20
    },
    overloadRelay: {
      catalogNumber: relay.catalogNumber, currentSettingMinA: relay.minA, currentSettingMaxA: relay.maxA,
      tripClass: 10, size: 'S0', mounting: 'contactor-mounted', terminals: 'screw',
      publishedTripCalibrationMultiplier: 1.25,
      candidateDialSettingA: finitePositive(motor.nameplateCurrentA) ? motor.nameplateCurrentA : null,
      publishedNominalTripCurrentA: finitePositive(motor.nameplateCurrentA * 1.25) ? motor.nameplateCurrentA * 1.25 : null
    },
    branchCircuitBreaker: {
      ...breaker,
      ratedNetworkFrequencyHz: [...breaker.ratedNetworkFrequencyHz],
      allowedInstantaneousPickupA: [...breaker.allowedInstantaneousPickupA],
      instantaneousPickupA: INSTANTANEOUS_PICKUPS_A.includes(selectedPickup) ? selectedPickup : null,
      instantaneousPickupBasis: checks.find(row => row.id === 'motorStarterInstantaneousPickup')?.evidence?.basis || 'unspecified'
    },
    motorNameplate: sanitize({
      ratedVoltageV: motor.ratedVoltageV ?? null,
      nameplateCurrentA: motor.nameplateCurrentA ?? null,
      nameplateHorsepower: motor.nameplateHorsepower ?? null,
      nameplateFrequencyHz: motor.nameplateFrequencyHz ?? null,
      fullLoadCurrentA: finitePositive(motor.fullLoadCurrentA) ? motor.fullLoadCurrentA : null,
      fullLoadCurrentBasis: sanitize(motor.fullLoadCurrentBasis),
      rotorType: motor.rotorType ?? null
    }),
    sizing: {
      calculatedRunningCurrentA: values.runningA,
      operatingCurrentA: values.operatingA ?? null,
      designFullLoadCurrentA: values.flc,
      minimumBreakerPickupA: values.minimumIrA,
      conservativeMaximumBreakerPickupA: values.maximumIrA
    },
    curveResearch,
    conditionalCombination: {
      certificate: 'E44653', certificateRevision: '2025-03-17', coordinationType: 'Type 1',
      combination: `3RT2027 / 3RT2028 + ${relay.family} + 3VA51 HEAS BCPD`,
      circuitVoltageV: 480, overloadRelayRangeMinA: relay.minA, overloadRelayRangeMaxA: relay.maxA,
      maximumBreakerCurrentA: relay.certificateMaxA, shortCircuitCurrentKA: MAX_COMBINATION_SCCR_KA,
      sourceAvailableFaultCurrentKA: finitePositive(supply?.availableFaultCurrentKA) ? supply.availableFaultCurrentKA : null
    },
    sources,
    fieldSources: [
      fieldSource('/candidate/contactor/catalogNumber', CONTACTOR_SOURCE_ID, 'Exact article in Siemens Industry Mall product record'),
      fieldSource('/candidate/contactor/poles', CONTACTOR_SOURCE_ID, 'Three poles in exact article product record'),
      fieldSource('/candidate/contactor/size', CONTACTOR_SOURCE_ID, 'S0 size in exact article product record'),
      fieldSource('/candidate/contactor/terminals', CONTACTOR_SOURCE_ID, 'Screw terminals in exact article product record'),
      fieldSource('/candidate/contactor/coilVoltageV', CONTACTOR_SOURCE_ID, '24 V DC coil in exact article product record'),
      fieldSource('/candidate/contactor/ulThreePhaseMotorFlaAt480V', CONTACTOR_DATASHEET_SOURCE_ID, 'Product datasheet PDF page 4: UL 480 V three-phase FLA 27 A'),
      fieldSource('/candidate/contactor/ulThreePhaseMotorHorsepowerAt460Or480V', CONTACTOR_HP_SOURCE_ID, 'Exact article Spanish product datasheet PDF page 5: 20 hp at 460/480 V'),
      fieldSource('/candidate/overloadRelay/catalogNumber', relay.sourceId, 'Exact relay article number from Siemens product record'),
      fieldSource('/candidate/overloadRelay/catalogNumber', CERTIFICATE_SOURCE_ID, `PDF page 12 lists relay family ${relay.family}; PDF page 13 maps its suffix into that family`, 'derived'),
      fieldSource('/candidate/overloadRelay/currentSettingMinA', relay.sourceId, `${relay.minA}–${relay.maxA} A setting range`),
      fieldSource('/candidate/overloadRelay/currentSettingMaxA', relay.sourceId, `${relay.minA}–${relay.maxA} A setting range`),
      fieldSource('/candidate/overloadRelay/publishedTripCalibrationMultiplier', CERTIFICATE_SOURCE_ID, 'PDF page 2: published nominal 125% trip calibration, not a time-current curve'),
      fieldSource('/candidate/overloadRelay/candidateDialSettingA', 'project-input', 'Proposed dial equals explicit motor nameplate current; application suitability remains unevaluated', 'derived'),
      fieldSource('/candidate/overloadRelay/publishedNominalTripCurrentA', CERTIFICATE_SOURCE_ID, 'PDF page 2: proposed dial multiplied by published 1.25 nominal calibration; no clearing time inferred', 'derived'),
      fieldSource('/candidate/branchCircuitBreaker/catalogNumber', SPEEDFAX_SOURCE_ID, 'PDF page 51 (printed 7-51), exact 25 A and 30 A TM230/FTAM numbers under HEAS ordering column'),
      fieldSource('/candidate/branchCircuitBreaker/interruptingRatingKA', SPEEDFAX_SOURCE_ID, 'PDF page 50 (printed 7-50): standalone UL 489 65 kA interrupting rating at 480 V and 480Y/277 V; conditional combination SCCR is separate evidence'),
      fieldSource('/candidate/branchCircuitBreaker/ratedVoltageV', SPEEDFAX_SOURCE_ID, 'PDF page 50 (printed 7-50): standalone 65 kA rating voltage is 480 V and 480Y/277 V'),
      fieldSource('/candidate/branchCircuitBreaker/fixedOverloadPickupA', SPEEDFAX_SOURCE_ID, 'PDF pages 51 and 53: exact 25 A/30 A TM230 FTAM entries; Ir fixed to rated current'),
      fieldSource('/candidate/branchCircuitBreaker/ratedNetworkFrequencyHz', SPEEDFAX_SOURCE_ID, 'PDF page 50 (printed 7-50), UL489 ratings at 50/60 Hz'),
      fieldSource('/candidate/branchCircuitBreaker/instantaneousPickupMinMultiple', BREAKER_PRODUCT_SOURCE_ID, 'Exact Siemens product listing: 25 A breaker 6–12× In; 30 A breaker 5–10× In'),
      fieldSource('/candidate/branchCircuitBreaker/allowedInstantaneousPickupA', SPEEDFAX_SOURCE_ID, 'PDF page 53 (printed 7-53): discrete TM230 instantaneous values'),
      ...(curveResearch.sourceId ? [fieldSource('/candidate/curveResearch/sourceId', curveResearch.sourceId, 'Exact 30 A catalog-number TCC graphic; research metadata only', 'located')] : []),
      fieldSource('/candidate/conditionalCombination/combination', CERTIFICATE_SOURCE_ID, 'PDF page 12 lower-table scope heading and row: 3RT2027/2028 only'),
      fieldSource('/candidate/conditionalCombination/maximumBreakerCurrentA', CERTIFICATE_SOURCE_ID, `PDF page 12 lower table, ${relay.family} row: 3VA51 HEAS maximum ${relay.certificateMaxA} A`),
      fieldSource('/candidate/conditionalCombination/shortCircuitCurrentKA', CERTIFICATE_SOURCE_ID, 'PDF page 12 lower table, conditional 65 kA at 480 V'),
      fieldSource('/candidate/sizing/minimumBreakerPickupA', 'project-policy', 'Conservative policy: 125% × max(nominal running current, referenced operating floor when supplied, design FLC); not a sourced NEC minimum breaker rating', 'derived'),
      fieldSource('/candidate/sizing/operatingCurrentA', 'project-study', 'Separately referenced operating-study current floor when supplied; otherwise null', 'derived'),
      fieldSource('/candidate/sizing/conservativeMaximumBreakerPickupA', CODE_GUIDANCE_SOURCE_ID, 'Derived 250% × design FLC conservative screen; edition and application unresolved', 'derived'),
      fieldSource('/candidate/motorNameplate/fullLoadCurrentA', 'project-input', 'Explicit design FLC input'),
      fieldSource('/candidate/motorNameplate/fullLoadCurrentBasis', 'project-input', 'Explicit cited design FLC basis')
    ],
    checks,
    eligibleForResearchShortlist: !blocker && breakerSizing?.status === 'pass'
  };
}

/**
 * Screens two exact 3VA51 breaker parts for the separate 3RT2027 + 3RU2126
 * motor branch topology. Results are research candidates only and keep motor
 * protection blocked pending full fault-duty and coordination evidence.
 */
export function evaluateMotorBranchBreakerCandidate({ load, supply, criteria, operatingCurrentA, operatingCurrentReference } = {}) {
  const input = { load, supply, criteria, operatingCurrentA, operatingCurrentReference };
  if (finitePositive(load?.motor?.nameplateHorsepower) && load.motor.nameplateHorsepower > 40) return evaluateMotorS3Candidate(input);
  if (load?.motor?.nameplateHorsepower === 25) {
    const exact = evaluateMotor25HpCandidate(input);
    return exact.candidate ? exact : evaluateMotorS2Candidates(input);
  }
  if (finitePositive(load?.motor?.nameplateHorsepower) && load.motor.nameplateHorsepower > 20 && load.motor.nameplateHorsepower < 40) return evaluateMotorS2Candidates(input);
  if (load?.motor?.nameplateHorsepower === 40) return evaluateMotor40HpCandidate({ load, supply, criteria, operatingCurrentA, operatingCurrentReference });
  const motor = isRecord(load?.motor) ? load.motor : {};
  const designFLCValid = finitePositive(motor.fullLoadCurrentA)
    && typeof motor.fullLoadCurrentBasis?.reference === 'string'
    && motor.fullLoadCurrentBasis.reference.trim().length > 0;
  const flc = designFLCValid ? motor.fullLoadCurrentA : null;
  const runningA = runningCurrent(load);
  const hasOperatingBasis = operatingCurrentA !== undefined || operatingCurrentReference !== undefined;
  const validOperatingBasis = finitePositive(operatingCurrentA) && typeof operatingCurrentReference === 'string' && operatingCurrentReference.trim().length > 0;
  const operatingA = validOperatingBasis ? operatingCurrentA : null;
  const minimumCalculation = flc !== null && runningA !== null ? 1.25 * Math.max(flc, runningA, operatingA ?? 0) : null;
  const maximumCalculation = flc !== null ? 2.5 * flc : null;
  const minimumIrA = finitePositive(minimumCalculation) ? minimumCalculation : null;
  const maximumIrA = finitePositive(maximumCalculation) ? maximumCalculation : null;
  const code = criteria?.code;
  const method = criteria?.motorStarter?.branchProtectionMethod;
  const rotorType = motor.rotorType;
  const pickupBasis = resolveMotorStarterPickup(motor, criteria);
  const selectedIi = pickupBasis.value;
  const relay = relayFor(motor.nameplateCurrentA);
  const baseChecks = sharedChecks(load, supply, criteria, relay);
  const checks = [
    ...baseChecks,
    ...((motor.breakerAmbientTemperatureC !== undefined || motor.breakerAmbientReference !== undefined) && !(motor.breakerAmbientTemperatureC === null && motor.breakerAmbientReference === null) ? [check('breakerAmbientApplicability', 'fail', 'The sourced 35–70 A enclosure-temperature tables do not apply to the 25 A or 30 A candidates.')] : []),
    check('explicitCode', code === 'NEC' ? 'pass' : 'fail', code === 'NEC' ? 'Code basis is explicitly NEC.' : 'Set criteria.code to NEC for this limited screening rule.', { code: code ?? null }),
    check('branchProtectionMethod', method === 'inverse-time-breaker' ? 'pass' : 'fail', method === 'inverse-time-breaker' ? 'Inverse-time breaker branch protection is explicitly selected.' : 'Explicitly select criteria.motorStarter.branchProtectionMethod = inverse-time-breaker.', { branchProtectionMethod: method ?? null }),
    check('rotorType', rotorType === 'squirrel-cage' ? 'pass' : 'fail', rotorType === 'squirrel-cage' ? 'Motor rotor is explicitly identified as squirrel-cage.' : 'Explicit squirrel-cage rotor type is required for this screening method.', { rotorType: rotorType ?? null }),
    check('designFLC', finitePositive(motor.fullLoadCurrentA) ? 'pass' : 'fail', finitePositive(motor.fullLoadCurrentA) ? 'A finite positive design FLC is supplied.' : 'Supply a positive design full-load current; nameplate current is not substituted.', { fullLoadCurrentA: motor.fullLoadCurrentA ?? null }),
    check('fullLoadCurrentBasis', designFLCValid ? 'pass' : 'fail', designFLCValid ? 'Design FLC has a nonblank cited basis.' : 'Provide a nonblank fullLoadCurrentBasis.reference for design FLC.', sanitize(motor.fullLoadCurrentBasis)),
    check('runningCurrentBasis', runningA !== null ? 'pass' : 'fail', runningA !== null ? 'Running-current estimate is calculated from electrical-input kW, local voltage, three phases, and explicit power factor.' : 'Positive electrical-input kW, local voltage, three phases, and power factor in (0, 1] are required.', { electricalInputKW: load?.kw ?? null, localVoltageV: load?.voltage ?? null, phases: load?.phases ?? null, powerFactor: load?.powerFactor ?? motor.powerFactor ?? null, calculatedCurrentA: runningA }),
    check('referencedOperatingCurrent', !hasOperatingBasis ? 'unevaluated' : validOperatingBasis ? 'pass' : 'fail',
      !hasOperatingBasis ? 'No separately referenced operating-study current floor is supplied; this selection uses nominal input current and design FLC.'
        : validOperatingBasis ? 'The referenced operating-study current is included in the conservative 125% breaker floor without changing nominal kW or design FLC.'
          : 'An operating-study current floor requires both a finite positive current and a nonblank reference.',
      { operatingCurrentA: operatingA, reference: typeof operatingCurrentReference === 'string' ? operatingCurrentReference : null }),
    check('motorStarterInstantaneousPickup', selectedIi === undefined
      ? 'unevaluated'
      : INSTANTANEOUS_PICKUPS_A.includes(selectedIi) ? 'pass' : 'fail',
    selectedIi === undefined
      ? 'No instantaneous pickup is assumed. A listed discrete setting is needed before starting and coordination can be evaluated.'
      : INSTANTANEOUS_PICKUPS_A.includes(selectedIi)
        ? 'The supplied value is a Siemens-listed TM230 discrete setting; suitability is not evaluated.'
        : 'Instantaneous pickup must equal one of the listed Siemens TM230 values: 150, 180, 210, 240, 270, or 300 A.',
    { selectedA: selectedIi ?? null, allowedA: [...INSTANTANEOUS_PICKUPS_A], basis: pickupBasis.basis }, [SPEEDFAX_SOURCE_ID])
  ];
  const direct480ThreePhase = load?.voltage === 480 && supply?.voltage === 480 && load?.phases === 3 && supply?.phases === 3;
  const faultKA = supply?.availableFaultCurrentKA;
  const faultStatus = !direct480ThreePhase ? 'unevaluated'
    : !finitePositive(faultKA) || faultKA > MAX_COMBINATION_SCCR_KA ? 'fail' : 'pass';
  checks.push(check('conditionalShortCircuitRating', faultStatus, !direct480ThreePhase
    ? 'The certificate’s 480 V three-phase combination row cannot be compared to the source fault bound because the local motor circuit is not explicitly direct 480 V three-phase.'
    : faultStatus === 'pass'
      ? 'The stated positive external fault bound is within the 65 kA conditional Type 1 combination value at direct 480 V; motor contribution and full duty remain unresolved.'
      : 'A positive external fault-current bound at or below 65 kA is required for this conditional direct-480 V comparison.',
  { availableFaultCurrentKA: faultKA ?? null, conditionalCombinationRatingKA: MAX_COMBINATION_SCCR_KA, direct480ThreePhase }, [CERTIFICATE_SOURCE_ID]));
  checks.push(check('groundingAndCompleteFaultDuty', 'unevaluated', 'Grounding/system compatibility, motor-contributed fault current, ground-fault duty, asymmetry, and complete local fault duty remain unresolved.', { systemGrounding: 'not evaluated', motorContribution: 'unresolved' }, [CERTIFICATE_SOURCE_ID, SPEEDFAX_SOURCE_ID]));
  checks.push(check('codeEditionAndApplication', 'unevaluated', 'The conservative 250% reference is not an adopted-code compliance determination. NEC edition, jurisdiction, motor category/application, and any applicable exceptions require engineering review.', { statedCode: code ?? null, adoptedEdition: criteria?.codeEdition ?? null, application: 'unresolved' }, [CODE_GUIDANCE_SOURCE_ID]));
  checks.push(check('breakerLugsEnclosureAndInstallation', 'unevaluated', 'The breakers are supplied without connection hardware. Lug selection, conductor terminal conditions, enclosure, complete assembly listing, and field installation are not established.', { breakerCatalogNumbers: BREAKERS.map(item => item.catalogNumber), connectionHardware: 'not included', enclosure: 'not evaluated' }, [SPEEDFAX_SOURCE_ID, BREAKER_PRODUCT_SOURCE_ID]));

  const candidates = BREAKERS.map(breaker => {
    const curveResearch = breakerCurveResearch(breaker, selectedIi);
    const curveCheckMessage = breaker.catalogNumber === '3VA5130-6EC31-0AA0'
      ? 'A matching Siemens graphic for the 30 A TM230 configuration is located. It shows a 40 C cold-start nominal thermal trace with illustrated tolerances, not guaranteed thermal clearing; the instantaneous inset labels maximum clearing and minimum tripping only. No qualified numeric protective envelope or motor-start trace is available; starting discrimination, conductor thermal withstand, and selective coordination remain unverified.'
      : 'No exact 25 A Siemens curve was located. The 30 A graphic is specific to 3VA5130-6EC31-0AA0 and is not applied to this candidate; starting discrimination, conductor thermal withstand, and selective coordination remain unverified.';
    const candidateChecks = [
      sizingCheck(breaker, { flc, runningA, minimumIrA, maximumIrA, relay }),
      check('certificateBreakerMaximum', breaker.continuousCurrentA <= relay.certificateMaxA ? 'pass' : 'fail', breaker.continuousCurrentA <= relay.certificateMaxA ? `${breaker.continuousCurrentA} A is within the certificate's ${relay.certificateMaxA} A 3VA51 HEAS maximum for ${relay.family}.` : `Breaker exceeds the certificate ${relay.certificateMaxA} A maximum.`, { breakerCurrentA: breaker.continuousCurrentA, maximumA: relay.certificateMaxA }, [CERTIFICATE_SOURCE_ID]),
      check('tccStartingAndCoordination', 'unevaluated', curveCheckMessage, curveResearch, curveResearch.sourceId ? [curveResearch.sourceId] : []),
      ...checks
    ];
    return makeCandidate(breaker, candidateChecks, load, supply, { flc, runningA, minimumIrA, maximumIrA, operatingA, relay });
  });
  const selected = candidates.find(candidate => candidate.eligibleForResearchShortlist) ?? null;
  const hasMotorAmbient = (motor.breakerAmbientTemperatureC !== undefined || motor.breakerAmbientReference !== undefined)
    && !(motor.breakerAmbientTemperatureC === null && motor.breakerAmbientReference === null);
  if (!selected && finitePositive(motor.nameplateCurrentA) && (motor.nameplateCurrentA > 20 || hasMotorAmbient)) {
    const larger = evaluateMotorS2Candidates(input);
    if (larger.candidate) return larger;
  }
  const diagnostics = candidates.flatMap(candidate => candidate.checks.filter(item => item.status !== 'pass')
    .map(({ id, status, message, evidence }) => ({ candidateId: candidate.id, id, status, message, evidence })));
  return {
    status: 'blocked',
    protectionStatus: 'blocked',
    researchStatus: 'candidate',
    libraryStatus: 'screening',
    candidate: selected,
    candidates,
    rejectedCandidate: selected ? null : {
      topology: 'separate-branch-breaker-contactor-overload-relay',
      candidates,
      sources: sourceCopies()
    },
    diagnostics,
    sources: sourceCopies(),
    limitations: [
      'This research selector evaluates 3RT2027/2028 + 3RU2126-4A or 3RU2126-4B + 3VA51 HEAS only; it does not add a 3RV2 controller or use the separate 3RT2023/2024/2025/2026 certificate table.',
      'Only exact 25 A and 30 A breaker candidates are screened. No next-standard-size, starting, or other code exception is applied.',
      'The 250% design-FLC ceiling is a conservative manufacturer-guidance screening reference; adopted code edition and application are not confirmed.',
      'The certificate 65 kA value is a conditional Type 1 combination rating, not an assembled-panel SCCR or full fault-duty conclusion.',
      'The relay dial and its published 125% nominal trip calibration are candidate values, not installed settings, overload limits, or clearing times.',
      'No TCC, actual clearing time, starting tolerance, or coordination result is generated.',
      'Motor contribution, grounding, terminals/lugs, enclosure/listing, conductor withstand, and field installation remain unresolved.'
    ]
  };
}

export const MOTOR_BRANCH_BREAKER_SOURCES = SOURCES;
