import { validateMotorDesignCurrentReference } from './motorDesignCurrentReference.mjs';
import { MOTOR_35A_BREAKER_PICKUPS, MOTOR_50A_BREAKER_PICKUPS, MOTOR_60A_BREAKER_PICKUPS, resolveMotorStarterPickup } from './motorStarterPickup.mjs';
import { hasUnsupportedDesignSynthesisStarter } from './designSynthesisMotorClassification.mjs';
import { evaluateMotorS2BreakerAmbient, motorS2BreakerAmbientSources } from './motorS2BreakerAmbient.mjs';

const sources = Object.freeze([
  { id: 'siemens-ul-3ru2136-2023', publisher: 'UL LLC (Siemens-hosted certificate)', title: 'UL E44653 certificate for 3RU2136 combinations', url: 'https://cache.industry.siemens.com/dl/files/763/103200763/att_1148449/v1/3RU2136_CoC_202307191454405318.pdf?download=true', revision: '2023-03-20', locators: ['PDF page 3: trip-current calibration is 125% of dial FLA, not a clearing time', 'PDF page 8: 3RT203. + 3RU2136-4E, 22–32 A, 3VA51 maximum 50 A, 25 kA at 480 V; conditional combination rating, not panel SCCR'] },
  { id: 'siemens-3rt2036-1nb30', publisher: 'Siemens AG', title: '3RT2036-1NB30 contactor data sheet', url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RT20361NB30', revision: '2026-02-11; indexed manufacturer text', locators: ['PDF page 5: UL/CSA 52 A FLA at 480 V and 40 hp at 460/480 V'] },
  { id: 'siemens-3rt2036-coil-2015', publisher: 'Siemens AG (distributor-hosted data sheet)', title: '3RT2036-1NB30 archived contactor data sheet', url: 'https://asset.conrad.com/media10/add/160267/c1/-/en/001431165DS02/datasheet-1431165-siemens-3rt2036-1nb30-contactor-3-makers-22-kw-24-v-dc-24-v-ac-50-a-auxiliary-contact-1-pcs.pdf', revision: '2015-05-19', locators: ['PDF page 4: 20–33 V AC/DC control supply'] },
  { id: 'siemens-3ru2136-4eb0', publisher: 'Siemens AG', title: '3RU2136-4EB0 overload relay data sheet', url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2136-4EB0', revision: 'Indexed manufacturer product data', locators: ['Page 1: 22–32 A, S2, class 10, contactor-mounted thermal overload'] },
  { id: 'siemens-3va51-speedfax-2024', publisher: 'Siemens Industry, Inc.', title: 'SPEEDFAX 2024, 3VA51 UL breaker catalog', url: 'https://cache.industry.siemens.com/dl/files/309/109983309/att_1316107/v1/SF-17-Sect-07-ALL-web.pdf?download=true', revision: '2024-09-30', locators: ['Printed page 7-51: 50 A, three-pole TM230 HEAS 3VA5150-6EC31-0AA0; 65 kA at 480 V standalone', 'Printed page 7-53: fixed 50 A Ir and six discrete instantaneous settings'] },
  { id: 'eaton-historical-motor-notes', publisher: 'Eaton', title: 'Motor circuit notes', url: 'https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-motor-circuit-notes.pdf', revision: '2005, historical guidance', locators: ['Printed page 142: inverse-time reference; adopted edition and application remain unverified'] }
]);
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const finiteOrNull = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

const profiles = Object.freeze([
  { relay: '4DB0', min: 18, max: 25, breaker: 35, pickups: MOTOR_35A_BREAKER_PICKUPS },
  { relay: '4EB0', min: 22, max: 32, breaker: 50, pickups: MOTOR_50A_BREAKER_PICKUPS },
  { relay: '4FB0', min: 28, max: 40, breaker: 60, pickups: MOTOR_60A_BREAKER_PICKUPS },
  { relay: '4GB0', min: 36, max: 45, breaker: 60, pickups: MOTOR_60A_BREAKER_PICKUPS }
]);

function evaluateS2Profile({ load = {}, supply = {}, criteria = {}, operatingCurrentA, operatingCurrentReference } = {}, profile, exact25 = false) {
  const { relay, min, max, breaker, pickups } = profile;
  const relaySourceId = `siemens-3ru2136-${relay.toLowerCase()}`;
  const breakerCatalog = `3VA51${breaker}-6EC31-0AA0`;
  const profileSources = structuredClone(sources);
  const relaySource = profileSources.find(source => source.id === 'siemens-3ru2136-4eb0');
  Object.assign(relaySource, { id: relaySourceId, title: `3RU2136-${relay} overload relay data sheet`, url: `https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2136-${relay}`, locators: [`Page 1: ${min}–${max} A, S2, class 10, contactor-mounted thermal overload`] });
  profileSources.find(source => source.id === 'siemens-ul-3ru2136-2023').locators[1] = `PDF page 8: 3RT203. + 3RU2136-${relay.slice(0, 2)}, ${min}–${max} A, 3VA51 maximum ${breaker} A, 25 kA at 480 V; conditional combination rating, not panel SCCR`;
  profileSources.find(source => source.id === 'siemens-3va51-speedfax-2024').locators = [`Printed page 7-51: ${breaker} A, three-pole TM230 HEAS ${breakerCatalog}; 65 kA at 480 V standalone`, `Printed page 7-53: fixed ${breaker} A Ir and six discrete instantaneous settings`];
  profileSources.push(...motorS2BreakerAmbientSources(breaker));
  if (breaker === 60) profileSources.push({ id: 'siemens-simaris-3va5160-2026', publisher: 'Siemens AG', title: 'SIMARIS curves, exact 3VA5160-6EC31-0AA0 tripping characteristic', url: 'https://curves.simaris.siemens.com/curves/3VA51606EC310AA0#trip', revision: 'Exported 2026-11-01; viewer v2026.10.20-405ccf96', locators: ['Viewer Details: exact device, 415 V, three poles, TM230 LI, 60 A, IEC Icu 70 kA, 40 °C; applicability to 480 V is not established', 'PDF page 1: tripping characteristic; page 4: exact identity, In/Ir 60 A and selected Ii 300 A or 480 A in separately archived exports', 'The graphics do not establish qualified numerical minimum-trip or total-clearing envelopes'] });
  load = load && typeof load === 'object' ? load : {};
  supply = supply && typeof supply === 'object' ? supply : {};
  criteria = criteria && typeof criteria === 'object' ? criteria : {};
  const motor = load.motor && typeof load.motor === 'object' ? load.motor : {};
  const running = positive(load.kw) && positive(load.voltage) && load.phases === 3 && positive(load.powerFactor) && load.powerFactor <= 1 ? load.kw * 1000 / (Math.sqrt(3) * load.voltage * load.powerFactor) : null;
  const runningA = positive(running) ? running : null;
  const hasOperating = operatingCurrentA !== undefined || operatingCurrentReference !== undefined;
  const operatingValid = positive(operatingCurrentA) && typeof operatingCurrentReference === 'string' && Boolean(operatingCurrentReference.trim());
  const flcValid = positive(motor.fullLoadCurrentA) && typeof motor.fullLoadCurrentBasis?.reference === 'string' && Boolean(motor.fullLoadCurrentBasis.reference.trim()) && !validateMotorDesignCurrentReference(load);
  const floor = flcValid && runningA !== null ? 1.25 * Math.max(motor.fullLoadCurrentA, runningA, operatingValid ? operatingCurrentA : 0) : null;
  const ceiling = flcValid ? 2.5 * motor.fullLoadCurrentA : null;
  const pickupBasis = resolveMotorStarterPickup(motor, criteria);
  const pickup = pickupBasis.value;
  const checks = [];
  const add = (id, status, message, evidence = null, sourceIds = []) => checks.push({ id, status, message, evidence, sourceIds });
  const pass = value => value ? 'pass' : 'fail';
  add('motorAndCircuit', pass(!hasUnsupportedDesignSynthesisStarter(load) && (exact25 ? motor.nameplateHorsepower === 25 : positive(motor.nameplateHorsepower) && motor.nameplateHorsepower <= 40) && [460, 480].includes(motor.ratedVoltageV) && motor.nameplateFrequencyHz === 60 && motor.starterType === 'dol' && motor.rotorType === 'squirrel-cage' && load.phases === 3 && supply.phases === 3 && load.voltage === 480 && supply.voltage === 480 && load.frequencyHz === 60 && supply.frequencyHz === 60), `Requires an explicit ${exact25 ? '25 hp' : 'motor of at most 40 hp'}, 460/480 V, 60 Hz squirrel-cage DOL motor on a direct 480 V three-phase, 60 Hz circuit; VFD and soft-starter classifications are unsupported.`);
  add('relayCurrentRange', pass(positive(motor.nameplateCurrentA) && motor.nameplateCurrentA >= min && motor.nameplateCurrentA <= max), `Nameplate current must be within the relay’s ${min}–${max} A setting range.`, { nameplateCurrentA: finiteOrNull(motor.nameplateCurrentA) }, [relaySourceId]);
  add('contactorUlCurrent', pass(positive(motor.nameplateCurrentA) && motor.nameplateCurrentA <= 52), 'Nameplate current must be within the contactor’s 52 A UL/CSA FLA rating at 480 V.', null, ['siemens-3rt2036-1nb30']);
  add('controlSupply', pass(criteria.motorStarter?.controlVoltageV === 24 && criteria.motorStarter?.controlCurrentType === 'DC'), 'This candidate requires the explicitly selected 24 V DC control basis.', null, ['siemens-3rt2036-coil-2015']);
  add('designCurrent', pass(flcValid && runningA !== null && load.ratingsBasis === 'electrical-input-kW' && load.duty === 'continuous'), 'Requires a referenced design FLC and continuous electrical-input kW/PF basis.');
  add('referencedOperatingCurrent', !hasOperating ? 'unevaluated' : operatingValid ? 'pass' : 'fail', !hasOperating ? 'No separately referenced operating-study current is supplied.' : operatingValid ? 'The referenced operating-study current is included in the breaker floor.' : 'An operating-current floor requires a positive current and a nonblank reference.', { operatingCurrentA: operatingValid ? operatingCurrentA : null, reference: typeof operatingCurrentReference === 'string' ? operatingCurrentReference : null });
  add('inverseTimeBreakerSizing', pass(positive(floor) && positive(ceiling) && floor <= breaker && breaker <= ceiling), `The ${breaker} A fixed breaker must fit the 125% screening floor and historical 250% screening ceiling.`, { floorA: finiteOrNull(floor), breakerA: breaker, ceilingA: finiteOrNull(ceiling) }, ['siemens-3va51-speedfax-2024', 'eaton-historical-motor-notes']);
  add('certificateBreakerMaximum', 'pass', `The selected ${breaker} A breaker is within the certificate’s ${breaker} A maximum for the 3RU2136-${relay.slice(0, 2)} combination.`, { breakerCurrentA: breaker, maximumA: breaker }, ['siemens-ul-3ru2136-2023']);
  checks.push(evaluateMotorS2BreakerAmbient({ breakerA: breaker, motor, criteria, floorA: floor }));
  add('codeAndMethod', pass(criteria.code === 'NEC' && criteria.motorStarter?.branchProtectionMethod === 'inverse-time-breaker'), 'Select the NEC screening basis and inverse-time branch-breaker method.');
  add('conditionalShortCircuitRating', pass(positive(supply.availableFaultCurrentKA) && supply.availableFaultCurrentKA <= 25), 'The source-only fault bound must be positive and at most 25 kA for the 2023 conditional combination comparison; complete local duty remains unresolved.', { availableFaultCurrentKA: finiteOrNull(supply.availableFaultCurrentKA), conditionalKA: 25 }, ['siemens-ul-3ru2136-2023']);
  add('instantaneousPickup', pickup === undefined ? 'unevaluated' : pickups.includes(pickup) ? 'pass' : 'fail', pickup === undefined ? 'No instantaneous setting is proposed; starting suitability remains unevaluated.' : `A proposed setting must match a listed ${breaker} A TM230 value; starting suitability is not established.`, { selectedA: finiteOrNull(pickup), allowedA: [...pickups], basis: pickupBasis.basis }, ['siemens-3va51-speedfax-2024']);
  const curveResearch = breaker === 60 ? {
    status: 'matching-graphic-located-unqualified', matchingManufacturerGraphicAvailable: true,
    exactCandidateCatalogNumber: breakerCatalog, sourceId: 'siemens-simaris-3va5160-2026',
    sourceUrl: 'https://curves.simaris.siemens.com/curves/3VA51606EC310AA0#trip',
    sourceAvailability: 'Official Siemens SIMARIS tripping graphics for the exact 60 A TM230 candidate are located. Viewer details show 415 V and 40 °C; applicability to this 480 V proposal remains unqualified. The 30 A and 70 A graphics are not transferred or scaled to this breaker.',
    settingsApplicability: { fixedIrA: 60, selectedInstantaneousPickupA: pickups.includes(pickup) ? pickup : null, archivedInstantaneousPickupA: [300, 480], selectedSettingArchived: pickups.includes(pickup) ? [300, 480].includes(pickup) : null, note: 'Separate PDF exports identify 300 A and 480 A. The viewer URL does not encode pickup; check the setting after reopening. No installed setting or suitability is established.' },
    displayedConditions: { operatingVoltageV: 415, ambientTemperatureC: 40, poles: 3, tripUnit: 'TM230', protectiveFunctions: 'LI', iecIcuKA: 70, initialState: null, installation: null, frequencyHz: null },
    voltageApplicability: 'unqualified-for-480v',
    archivedExports: [
      { instantaneousPickupA: 300, sha256: '510a94e7894c321ead74edf7a755d27718d002d5a095fefc2b9ff8db9fec7d22', curvePage: 1, settingsPage: 4 },
      { instantaneousPickupA: 480, sha256: '0ac65017ced1114fdb41af5a5557dedbd95ca333612a65756546579d7dc4844b', curvePage: 1, settingsPage: 4 }
    ],
    remainingQualification: ['Establish 480 V applicability, frequency, initial state, installation, boundary meaning and tolerances.', 'Independently qualify numerical minimum-trip and total-clearing envelopes before use; graphics are not runtime curves.', 'Starting ride-through, conductor withstand and coordination remain unevaluated.']
  } : { status: 'not-reviewed', matchingManufacturerGraphicAvailable: null, exactCandidateCatalogNumber: breakerCatalog, sourceAvailability: `No qualified exact ${breaker} A timing envelope is established; exact-graphic availability has not been verified. The 30 A and 70 A graphics are not transferred or scaled to this breaker.` };
  add('tccStartingAndCoordination', 'unevaluated', curveResearch.sourceAvailability, structuredClone(curveResearch), curveResearch.sourceId ? [curveResearch.sourceId] : []);
  add('coordinationAndInstallation', 'unevaluated', 'Starting tolerance, breaker timing and settings, local fault duty, ground faults, conductor withstand, panel SCCR, ambient/enclosure rating, installation and complete protection remain unresolved.');
  const eligible = checks.every(item => item.status !== 'fail');
  const candidate = {
    id: exact25 ? 'siemens-dol-25hp-3rt2036-3ru2136-3va5150' : `siemens-dol-s2-3rt2036-3ru2136-${relay.toLowerCase()}-3va51${breaker}`, status: 'candidate', researchStatus: 'candidate', libraryStatus: 'screening', protectionStatus: 'blocked', selectedForApply: false,
    eligibleForResearchShortlist: eligible, topology: 'separate-branch-breaker-contactor-overload-relay', starterType: 'dol', manufacturer: 'Siemens',
    contactor: { catalogNumber: '3RT2036-1NB30', poles: 3, size: 'S2', coilVoltageV: 24, coilCurrentType: 'DC', ulThreePhaseMotorFlaAt480V: 52, ulThreePhaseMotorHorsepowerAt460Or480V: 40 },
    overloadRelay: { catalogNumber: `3RU2136-${relay}`, currentSettingMinA: min, currentSettingMaxA: max, tripClass: 10, size: 'S2', candidateDialSettingA: positive(motor.nameplateCurrentA) ? motor.nameplateCurrentA : null, publishedTripCalibrationMultiplier: 1.25, publishedNominalTripCurrentA: positive(motor.nameplateCurrentA) && positive(motor.nameplateCurrentA * 1.25) ? motor.nameplateCurrentA * 1.25 : null },
    branchCircuitBreaker: { catalogNumber: breakerCatalog, poles: 3, ratedVoltageV: 480, ratedNetworkFrequencyHz: [50, 60], tripUnit: 'TM230', tripTechnology: 'FTAM', interruptingRatingKA: 65, continuousCurrentA: breaker, fixedOverloadPickupA: breaker, allowedInstantaneousPickupA: [...pickups], instantaneousPickupA: pickups.includes(pickup) ? pickup : null, instantaneousPickupBasis: pickupBasis.basis },
    conditionalCombination: { certificate: 'E44653', certificateRevision: '2023-03-20', coordinationType: 'not established', combination: `3RT203. + 3RU2136-${relay.slice(0, 2)} + 3VA51`, circuitVoltageV: 480, maximumBreakerCurrentA: breaker, shortCircuitCurrentKA: 25 },
    sizing: { calculatedRunningCurrentA: runningA, operatingCurrentA: operatingValid ? operatingCurrentA : null, designFullLoadCurrentA: flcValid ? motor.fullLoadCurrentA : null, minimumBreakerPickupA: finiteOrNull(floor), conservativeMaximumBreakerPickupA: finiteOrNull(ceiling) },
    curveResearch, motorNameplate: { ratedVoltageV: finiteOrNull(motor.ratedVoltageV), nameplateCurrentA: finiteOrNull(motor.nameplateCurrentA), nameplateHorsepower: finiteOrNull(motor.nameplateHorsepower), nameplateFrequencyHz: finiteOrNull(motor.nameplateFrequencyHz), fullLoadCurrentA: finiteOrNull(motor.fullLoadCurrentA), fullLoadCurrentBasis: typeof motor.fullLoadCurrentBasis?.reference === 'string' ? { reference: motor.fullLoadCurrentBasis.reference } : null, rotorType: typeof motor.rotorType === 'string' ? motor.rotorType : null },
    checks, sources: structuredClone(profileSources), fieldSources: [
      { pointer: '/candidate/contactor/catalogNumber', sourceId: 'siemens-3rt2036-1nb30', locator: 'Exact contactor data sheet' },
      { pointer: '/candidate/contactor/ulThreePhaseMotorFlaAt480V', sourceId: 'siemens-3rt2036-1nb30', locator: 'PDF page 5, UL/CSA 480 V FLA' },
      { pointer: '/candidate/contactor/ulThreePhaseMotorHorsepowerAt460Or480V', sourceId: 'siemens-3rt2036-1nb30', locator: 'PDF page 5, three-phase motor hp' },
      { pointer: '/candidate/contactor/coilVoltageV', sourceId: 'siemens-3rt2036-coil-2015', locator: 'PDF page 4, 20–33 V DC range; 24 V is the selected project basis' },
      { pointer: '/candidate/overloadRelay/catalogNumber', sourceId: relaySourceId, locator: `Exact ${min}–${max} A S2 class 10 relay` },
      { pointer: '/candidate/overloadRelay/currentSettingMinA', sourceId: relaySourceId, locator: `PDF page 1, ${min}–${max} A range` },
      { pointer: '/candidate/overloadRelay/currentSettingMaxA', sourceId: relaySourceId, locator: `PDF page 1, ${min}–${max} A range` },
      { pointer: '/candidate/overloadRelay/publishedTripCalibrationMultiplier', sourceId: 'siemens-ul-3ru2136-2023', locator: 'PDF page 3; not a clearing time' },
      { pointer: '/candidate/overloadRelay/candidateDialSettingA', sourceId: 'project-input', locator: 'Proposed dial equals supplied nameplate current; installed setting unverified', status: 'derived' },
      { pointer: '/candidate/overloadRelay/publishedNominalTripCurrentA', sourceId: 'siemens-ul-3ru2136-2023', locator: 'PDF page 3 calibration multiplied by proposed dial; not a clearing time', status: 'derived' },
      { pointer: '/candidate/branchCircuitBreaker/catalogNumber', sourceId: 'siemens-3va51-speedfax-2024', locator: `Printed page 7-51, ${breaker} A HEAS TM230 row` },
      { pointer: '/candidate/branchCircuitBreaker/fixedOverloadPickupA', sourceId: 'siemens-3va51-speedfax-2024', locator: `Printed page 7-53, ${breaker} A TM230 row` },
      { pointer: '/candidate/branchCircuitBreaker/interruptingRatingKA', sourceId: 'siemens-3va51-speedfax-2024', locator: 'Printed page 7-51, HEAS standalone 480 V rating; combination rating is separate' },
      { pointer: '/candidate/branchCircuitBreaker/ratedVoltageV', sourceId: 'siemens-3va51-speedfax-2024', locator: 'Printed page 7-51, HEAS three-pole standalone interrupting rating at 480 V' },
      { pointer: '/candidate/branchCircuitBreaker/allowedInstantaneousPickupA', sourceId: 'siemens-3va51-speedfax-2024', locator: `Printed page 7-53, ${breaker} A TM230 row` },
      ...(breaker === 60 ? [{ pointer: '/candidate/curveResearch', sourceId: 'siemens-simaris-3va5160-2026', locator: 'Exact device viewer and archived exports; graphical source located, numerical envelopes and 480 V applicability unqualified', status: 'located' }] : []),
      { pointer: '/candidate/conditionalCombination', sourceId: 'siemens-ul-3ru2136-2023', locator: `PDF page 8, 3RT203. + 3RU2136-${relay.slice(0, 2)} + 3VA51 row` }
    ]
  };
  return { status: 'blocked', protectionStatus: 'blocked', researchStatus: 'candidate', libraryStatus: 'screening', candidate: eligible ? candidate : null, candidates: [candidate], rejectedCandidate: eligible ? null : { candidates: [candidate], sources: structuredClone(profileSources) }, diagnostics: checks.filter(item => item.status !== 'pass').map(item => ({ candidateId: candidate.id, id: item.id, status: item.status, message: item.message, evidence: item.evidence })), sources: structuredClone(profileSources), limitations: ['This exact-part candidate is a preliminary fit screen, not an installed setting or a qualified assembly.', 'No applicable breaker timing envelope, complete motor protection, starting withstand, coordination, or assembled-panel SCCR is established.'] };
}

/** The original exact 25 hp/50 A screen remains available independently. */
export function evaluateMotor25HpCandidate(input = {}) {
  return evaluateS2Profile(input, profiles[1], true);
}

/** Enumerate the separately sourced S2 combinations; all remain research only. */
export function evaluateMotorS2Candidates(input = {}) {
  const results = profiles.map(profile => evaluateS2Profile(input, profile));
  const candidates = results.map(result => result.candidates[0]);
  const selected = candidates.find(candidate => candidate.eligibleForResearchShortlist) ?? null;
  const sourceMap = new Map();
  for (const source of results.flatMap(result => result.sources)) {
    const existing = sourceMap.get(source.id);
    if (existing) existing.locators = [...new Set([...existing.locators, ...source.locators])];
    else sourceMap.set(source.id, structuredClone(source));
  }
  return {
    status: 'blocked', protectionStatus: 'blocked', researchStatus: 'candidate', libraryStatus: 'screening',
    candidate: selected, candidates,
    rejectedCandidate: selected ? null : { candidates, sources: [...sourceMap.values()] },
    diagnostics: results.flatMap(result => result.diagnostics), sources: [...sourceMap.values()],
    limitations: results[0].limitations
  };
}
