import { validateMotorDesignCurrentReference } from './motorDesignCurrentReference.mjs';
import { hasUnsupportedDesignSynthesisStarter } from './designSynthesisMotorClassification.mjs';
import { MOTOR_90A_3VA52_BREAKER_PICKUPS, resolveMotorStarterPickup } from './motorStarterPickup.mjs';

const sources = [
  { id: 'siemens-ul-e31519-2025', publisher: 'UL LLC (Siemens-hosted certificate)', title: 'UL E31519 individual certificate, 3RT204 contactor combinations', url: 'https://cache.industry.siemens.com/dl/files/233/109742233/att_1348606/v1/UL_CoC_3RT2_4-2025_202511121349065039.pdf', revision: '2025-10-28', locators: ['PDF page 17: 3RT204 + 3RU2146-4J, 45–63 A, 3VA52 HFAS/CFAS maximum 200 A; 65 kA at 480 V. Conditional component combination, not assembled-panel SCCR.'] },
  { id: 'siemens-3rt2046-1nb30', publisher: 'Siemens AG', title: '3RT2046-1NB30 contactor data sheet', url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RT2046-1NB30', revision: '2026-01-22; indexed manufacturer data', locators: ['Page 1: exact S3 contactor, 20–33 V AC/DC control; page 5: UL/CSA three-phase motor FLA 96 A at 480 V and 75 hp at 460/480 V.'] },
  { id: 'siemens-3ru2146-4jb0', publisher: 'Siemens AG', title: '3RU2146-4JB0 relay product data', url: 'https://mall.industry.siemens.com/mall/en/EN/Catalog/Product/3RU21464JB0', revision: 'Indexed exact product data', locators: ['45–63 A setting range, class 10, S3 contactor-mounted thermal overload relay.'] },
  { id: 'siemens-3va52-speedfax-2024', publisher: 'Siemens Industry, Inc.', title: 'SPEEDFAX 2024, 3VA52 UL breaker catalog', url: 'https://cache.industry.siemens.com/dl/files/309/109983309/att_1316107/v1/SF-17-Sect-07-ALL-web.pdf?download=true', revision: '2024-09-30', locators: ['3VA52 250 A frame: exact 90 A three-pole TM230 HFAS 3VA5290-6EC31-0AA0; no lugs included.', '3VA52 HFAS standalone UL 489 65 kA at 480 V, 50/60 Hz; 90 A fixed Ir and six instantaneous settings 450–900 A.'] },
  { id: 'eaton-historical-motor-notes', publisher: 'Eaton', title: 'Motor circuit notes', url: 'https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-motor-circuit-notes.pdf', revision: '2005, historical guidance', locators: ['Printed page 142: inverse-time reference; adopted edition and application remain unverified.'] },
];
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Exact-parts fit screen only; it cannot establish motor or assembly protection. */
export function evaluateMotorS3Candidate(input = {}) {
  const load = input.load && typeof input.load === 'object' ? input.load : {};
  const supply = input.supply && typeof input.supply === 'object' ? input.supply : {};
  const criteria = input.criteria && typeof input.criteria === 'object' ? input.criteria : {};
  const motor = load.motor && typeof load.motor === 'object' ? load.motor : {};
  const running = positive(load.kw) && positive(load.voltage) && load.phases === 3 && positive(load.powerFactor) && load.powerFactor <= 1 ? load.kw * 1000 / (Math.sqrt(3) * load.voltage * load.powerFactor) : null;
  const runningA = positive(running) ? running : null;
  const flcValid = positive(motor.fullLoadCurrentA) && typeof motor.fullLoadCurrentBasis?.reference === 'string' && Boolean(motor.fullLoadCurrentBasis.reference.trim()) && !validateMotorDesignCurrentReference(load);
  const hasOperating = input.operatingCurrentA !== undefined || input.operatingCurrentReference !== undefined;
  const operatingValid = positive(input.operatingCurrentA) && typeof input.operatingCurrentReference === 'string' && Boolean(input.operatingCurrentReference.trim());
  const floor = flcValid && runningA !== null ? finite(1.25 * Math.max(motor.fullLoadCurrentA, runningA, operatingValid ? input.operatingCurrentA : 0)) : null;
  const ceiling = flcValid ? finite(2.5 * motor.fullLoadCurrentA) : null;
  const pickupBasis = resolveMotorStarterPickup(motor, criteria);
  const pickup = pickupBasis.value;
  const checks = [];
  const add = (id, status, message, evidence = null, sourceIds = []) => checks.push({ id, status, message, evidence, sourceIds });
  const pass = condition => condition ? 'pass' : 'fail';
  add('motorAndCircuit', pass(!hasUnsupportedDesignSynthesisStarter(load) && positive(motor.nameplateHorsepower) && motor.nameplateHorsepower > 40 && motor.nameplateHorsepower <= 75 && [460, 480].includes(motor.ratedVoltageV) && motor.nameplateFrequencyHz === 60 && motor.starterType === 'dol' && motor.rotorType === 'squirrel-cage' && load.phases === 3 && supply.phases === 3 && load.voltage === 480 && supply.voltage === 480 && load.frequencyHz === 60 && supply.frequencyHz === 60), 'Requires a greater-than-40 to 75 hp, 460/480 V, 60 Hz squirrel-cage DOL motor on a direct 480 V, three-phase, 60 Hz circuit.');
  add('relayCurrentRange', pass(positive(motor.nameplateCurrentA) && motor.nameplateCurrentA >= 45 && motor.nameplateCurrentA <= 63), 'Nameplate current must be within the exact relay 45–63 A dial range.', { nameplateCurrentA: finite(motor.nameplateCurrentA) }, ['siemens-3ru2146-4jb0']);
  add('contactorUlCurrent', pass(positive(motor.nameplateCurrentA) && motor.nameplateCurrentA <= 96), 'Nameplate current must be within the exact contactor UL/CSA 96 A FLA rating at 480 V.', null, ['siemens-3rt2046-1nb30']);
  add('controlSupply', pass(criteria.motorStarter?.controlVoltageV === 24 && criteria.motorStarter?.controlCurrentType === 'DC'), 'Requires an explicit 24 V DC control basis within the contactor control-voltage range.', null, ['siemens-3rt2046-1nb30']);
  add('designCurrent', pass(flcValid && runningA !== null && load.ratingsBasis === 'electrical-input-kW' && load.duty === 'continuous'), 'Requires a referenced design FLC and continuous electrical-input kW/PF basis.');
  add('referencedOperatingCurrent', !hasOperating ? 'unevaluated' : operatingValid ? 'pass' : 'fail', !hasOperating ? 'No separately referenced operating-study current is supplied.' : operatingValid ? 'Referenced operating current is included in the floor.' : 'Operating current requires a positive value and nonblank reference.', { operatingCurrentA: operatingValid ? input.operatingCurrentA : null, reference: typeof input.operatingCurrentReference === 'string' ? input.operatingCurrentReference : null });
  add('inverseTimeBreakerSizing', pass(positive(floor) && positive(ceiling) && floor <= 90 && 90 <= ceiling), 'The 90 A fixed breaker must fit the conservative 125% floor and historical 250% ceiling; neither establishes code compliance.', { floorA: floor, breakerA: 90, ceilingA: ceiling }, ['siemens-3va52-speedfax-2024', 'eaton-historical-motor-notes']);
  add('certificateBreakerMaximum', 'pass', 'The 90 A HFAS breaker is within the cited 200 A family maximum.', { breakerCurrentA: 90, maximumA: 200 }, ['siemens-ul-e31519-2025']);
  add('codeAndMethod', pass(criteria.code === 'NEC' && criteria.motorStarter?.branchProtectionMethod === 'inverse-time-breaker'), 'Select the NEC screening basis and inverse-time branch-breaker method.');
  add('conditionalShortCircuitRating', pass(positive(supply.availableFaultCurrentKA) && supply.availableFaultCurrentKA <= 65), 'The source-only fault bound must be positive and at most the cited 65 kA conditional value; full local duty is unresolved.', { availableFaultCurrentKA: finite(supply.availableFaultCurrentKA), conditionalKA: 65 }, ['siemens-ul-e31519-2025']);
  add('instantaneousPickup', pickup === undefined ? 'unevaluated' : MOTOR_90A_3VA52_BREAKER_PICKUPS.includes(pickup) ? 'pass' : 'fail', 'A proposed setting must be one of the exact 90 A 3VA52 TM230 values; starting suitability is not established.', { selectedA: finite(pickup), allowedA: [...MOTOR_90A_3VA52_BREAKER_PICKUPS], basis: pickupBasis.basis }, ['siemens-3va52-speedfax-2024']);
  const explicitAmbient = motor.breakerAmbientTemperatureC !== undefined || motor.breakerAmbientReference !== undefined;
  const ambientSuppressed = motor.breakerAmbientTemperatureC === null && motor.breakerAmbientReference === null;
  add('breakerAmbientOperatingCurrent', explicitAmbient && !ambientSuppressed ? 'fail' : 'unevaluated', explicitAmbient && !ambientSuppressed ? 'The motor-specific 35–70 A temperature basis cannot be applied to this 90 A 3VA52 candidate.' : 'The exact 90 A enclosure-temperature suitability is not evaluated; smaller-breaker tables are not transferred.');
  add('tccStartingAndCoordination', 'unevaluated', 'No qualified exact-breaker timing envelope is supplied; starting ride-through and coordination remain unresolved.');
  add('coordinationAndInstallation', 'unevaluated', 'Complete local fault duty, motor protection, grounding, conductor withstand, installation and assembled-panel SCCR remain unresolved.');
  const eligible = checks.every(item => item.status !== 'fail');
  const candidate = {
    id: 'siemens-dol-s3-3rt2046-3ru2146-4jb0-3va5290', status: 'candidate', researchStatus: 'candidate', libraryStatus: 'screening', protectionStatus: 'blocked', selectedForApply: false, eligibleForResearchShortlist: eligible,
    topology: 'separate-branch-breaker-contactor-overload-relay', starterType: 'dol', manufacturer: 'Siemens',
    contactor: { catalogNumber: '3RT2046-1NB30', poles: 3, size: 'S3', coilVoltageV: 24, coilCurrentType: 'DC', ulThreePhaseMotorFlaAt480V: 96, ulThreePhaseMotorHorsepowerAt460Or480V: 75 },
    overloadRelay: { catalogNumber: '3RU2146-4JB0', currentSettingMinA: 45, currentSettingMaxA: 63, tripClass: 10, size: 'S3', candidateDialSettingA: positive(motor.nameplateCurrentA) ? motor.nameplateCurrentA : null, publishedTripCalibrationMultiplier: null, publishedNominalTripCurrentA: null },
    branchCircuitBreaker: { catalogNumber: '3VA5290-6EC31-0AA0', poles: 3, ratedVoltageV: 480, ratedNetworkFrequencyHz: [50, 60], tripUnit: 'TM230', tripTechnology: 'FTAM', interruptingClass: 'H / HFAS', interruptingRatingKA: 65, continuousCurrentA: 90, fixedOverloadPickupA: 90, allowedInstantaneousPickupA: [...MOTOR_90A_3VA52_BREAKER_PICKUPS], instantaneousPickupA: MOTOR_90A_3VA52_BREAKER_PICKUPS.includes(pickup) ? pickup : null, instantaneousPickupBasis: pickupBasis.basis },
    conditionalCombination: { certificate: 'E31519', certificateRevision: '2025-10-28', coordinationType: 'not established', combination: '3RT204 + 3RU2146-4J + 3VA52 HFAS', circuitVoltageV: 480, maximumBreakerCurrentA: 200, shortCircuitCurrentKA: 65 },
    sizing: { calculatedRunningCurrentA: runningA, operatingCurrentA: operatingValid ? input.operatingCurrentA : null, designFullLoadCurrentA: flcValid ? motor.fullLoadCurrentA : null, minimumBreakerPickupA: floor, conservativeMaximumBreakerPickupA: ceiling },
    curveResearch: { status: 'not-reviewed', matchingManufacturerGraphicAvailable: null, exactCandidateCatalogNumber: '3VA5290-6EC31-0AA0', sourceAvailability: 'No qualified numerical timing envelope or 480 V applicability is established for the exact 90 A 3VA52 part.' },
    motorNameplate: { ratedVoltageV: finite(motor.ratedVoltageV), nameplateCurrentA: finite(motor.nameplateCurrentA), nameplateHorsepower: finite(motor.nameplateHorsepower), nameplateFrequencyHz: finite(motor.nameplateFrequencyHz), fullLoadCurrentA: finite(motor.fullLoadCurrentA), fullLoadCurrentBasis: typeof motor.fullLoadCurrentBasis?.reference === 'string' ? { reference: motor.fullLoadCurrentBasis.reference } : null, rotorType: typeof motor.rotorType === 'string' ? motor.rotorType : null },
    checks, sources: structuredClone(sources), fieldSources: [
      { pointer: '/candidate/contactor/catalogNumber', sourceId: 'siemens-3rt2046-1nb30', locator: 'Exact contactor data sheet.' },
      { pointer: '/candidate/contactor/ulThreePhaseMotorFlaAt480V', sourceId: 'siemens-3rt2046-1nb30', locator: 'PDF page 5, UL/CSA three-phase motor FLA at 480 V.' },
      { pointer: '/candidate/contactor/ulThreePhaseMotorHorsepowerAt460Or480V', sourceId: 'siemens-3rt2046-1nb30', locator: 'PDF page 5, UL/CSA three-phase motor hp at 460/480 V.' },
      { pointer: '/candidate/contactor/coilVoltageV', sourceId: 'siemens-3rt2046-1nb30', locator: 'PDF page 1, 20–33 V AC/DC control; 24 V is the proposed project basis.', status: 'derived' },
      { pointer: '/candidate/overloadRelay/catalogNumber', sourceId: 'siemens-3ru2146-4jb0', locator: 'Exact relay product record.' },
      ...['currentSettingMinA', 'currentSettingMaxA', 'tripClass'].map(field => ({ pointer: `/candidate/overloadRelay/${field}`, sourceId: 'siemens-3ru2146-4jb0', locator: 'Exact relay product record, 45–63 A, class 10.' })),
      { pointer: '/candidate/overloadRelay/candidateDialSettingA', sourceId: 'project-input', locator: 'Proposed dial equals supplied nameplate current; installed setting unverified.', status: 'derived' },
      ...['catalogNumber', 'fixedOverloadPickupA', 'allowedInstantaneousPickupA', 'interruptingRatingKA', 'ratedVoltageV'].map(field => ({ pointer: `/candidate/branchCircuitBreaker/${field}`, sourceId: 'siemens-3va52-speedfax-2024', locator: 'Exact 3VA52 HFAS part and 90 A TM230 settings in Siemens catalog.' })),
      { pointer: '/candidate/conditionalCombination', sourceId: 'siemens-ul-e31519-2025', locator: 'PDF page 17: 3RT204 + 3RU2146-4J + 3VA52 HFAS, maximum 200 A, 65 kA at 480 V.' },
    ]
  };
  return { status: 'blocked', protectionStatus: 'blocked', researchStatus: 'candidate', libraryStatus: 'screening', candidate: eligible ? candidate : null, candidates: [candidate], rejectedCandidate: eligible ? null : { candidates: [candidate], sources: structuredClone(sources) }, diagnostics: checks.filter(item => item.status !== 'pass').map(item => ({ candidateId: candidate.id, ...item })), sources: structuredClone(sources), limitations: ['Exact-part preliminary fit only; installation, protection, local fault duty and assembled-panel SCCR remain unresolved.'] };
}
