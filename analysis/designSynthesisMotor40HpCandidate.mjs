import { validateMotorDesignCurrentReference } from './motorDesignCurrentReference.mjs';
import { MOTOR_70A_BREAKER_PICKUPS, resolveMotorStarterPickup } from './motorStarterPickup.mjs';
import { hasUnsupportedDesignSynthesisStarter } from './designSynthesisMotorClassification.mjs';

const sources = Object.freeze([
  { id: 'siemens-ul-3ru2136-2023', publisher: 'UL LLC (Siemens-hosted certificate)', title: 'UL E44653 certificate for 3RU2136 combinations', url: 'https://cache.industry.siemens.com/dl/files/763/103200763/att_1148449/v1/3RU2136_CoC_202307191454405318.pdf?download=true', revision: '2023-03-20', locators: ['PDF page 3: stated trip-current calibration is 125% of the dial FLA; this is not a time-current curve', 'PDF page 8: 3RT203. + 3RU2136-4H, 40–50 A, 3VA51 maximum 70 A, 25 kA at 480 V; conditional combination rating, not panel SCCR'] },
  { id: 'siemens-3rt2036-1nb30', publisher: 'Siemens AG', title: '3RT2036-1NB30 contactor data sheet', url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RT20361NB30', revision: '2026-02-11; indexed manufacturer text', locators: ['PDF page 5: UL/CSA 52 A FLA at 480 V and 40 hp at 460/480 V'] },
  { id: 'siemens-3rt2036-coil-2015', publisher: 'Siemens AG (distributor-hosted data sheet)', title: '3RT2036-1NB30 archived contactor data sheet', url: 'https://asset.conrad.com/media10/add/160267/c1/-/en/001431165DS02/datasheet-1431165-siemens-3rt2036-1nb30-contactor-3-makers-22-kw-24-v-dc-24-v-ac-50-a-auxiliary-contact-1-pcs.pdf', revision: '2015-05-19', locators: ['PDF page 4: 20–33 V AC/DC control supply'] },
  { id: 'siemens-3ru2136-4hb0', publisher: 'Siemens AG', title: 'SIRIUS IC 10 2021 overload relay catalog', url: 'https://cache.industry.siemens.com/dl/files/999/109771999/att_1058579/v1/SIRIUS_IC10_chap07_English_2021_202103301020326928.pdf', revision: '2021', locators: ['Printed page 7/99: 3RU2136-4HB0, 40–50 A, S2, contactor-mounted thermal overload relay'] },
  { id: 'siemens-3va5170-6ec31', publisher: 'Siemens AG', title: '3VA5170-6EC31-0AA0 breaker data sheet', url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3VA5170-6EC31-0AA0', revision: '2025-10-29; indexed exact manufacturer product data', locators: ['Three-pole UL 3VA5 H, 70 A fixed Ir, 65 kA standalone interrupting rating at 480 V; combination rating is separate', 'PDF page 1: discrete operating currents at 40–70 °C; not marked as a 100%-rated breaker'] },
  { id: 'siemens-3va5170-alternate-temperature', publisher: 'Siemens AG (distributor-hosted data sheet)', title: '3VA5170-6EC31-0AA0 alternative manufacturer temperature table', url: 'https://my.goagilix.com/assets/f3/d8/f3d80715-800d-46a1-a55a-b841b5dfbe99/Sentron_3VA51706EC310AA0_Specification_Sheet.pdf', revision: 'Indexed alternate Siemens datasheet; source date not established', locators: ['PDF page 1: 45–65 °C values differ from the 2025 Siemens indexed table; applicability and revision must be reconciled'] },
  { id: 'siemens-3va51-speedfax-2024', publisher: 'Siemens Industry, Inc.', title: 'SPEEDFAX 2024, 3VA51 UL breaker catalog', url: 'https://cache.industry.siemens.com/dl/files/309/109983309/att_1316107/v1/SF-17-Sect-07-ALL-web.pdf?download=true', revision: '2024-09-30', locators: ['Printed page 7-53: 70 A TM230 fixed thermal trip and listed 350, 420, 490, 560, 630, 700 A instantaneous settings'] },
  { id: 'siemens-simaris-3va5170-2026', publisher: 'Siemens AG', title: 'SIMARIS curves, exact 3VA5170-6EC31-0AA0 tripping characteristic', url: 'https://curves.simaris.siemens.com/curves/3VA51706EC310AA0#trip', revision: 'Exported 2026-10-29; viewer v2026.10.20-405ccf96', locators: ['Viewer Details: exact device, 415 V, three poles, TM230 LI, 70 A, IEC Icu 70 kA, 40 °C; 480 V applicability is not established', 'Export page 1: tripping characteristic; page 4: exact identity, In/Ir 70 A and selected Ii 350 A or 490 A in separate archived exports', 'Raster exports contain no qualified numeric minimum-trip or total-clearing envelope'] },
  { id: 'eaton-historical-motor-notes', publisher: 'Eaton', title: 'Motor circuit notes', url: 'https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-motor-circuit-notes.pdf', revision: '2005, historical guidance', locators: ['Printed page 142: historical inverse-time breaker reference; application and adopted edition remain unverified'] }
]);
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const finiteOrNull = n => typeof n === 'number' && Number.isFinite(n) ? n : null;
export const MOTOR_40HP_BREAKER_AMBIENT_RATINGS = Object.freeze({ 40: 70, 45: 69, 50: 68, 55: 67, 60: 66, 65: 65, 70: 64 });

/** A bounded, independently sourced S2 combination for explicit 40 hp DOL motors.
 * The absence of a fault or timing study is never promoted to protection approval. */
export function evaluateMotor40HpCandidate({ load = {}, supply = {}, criteria = {}, operatingCurrentA, operatingCurrentReference } = {}) {
  load = load && typeof load === 'object' ? load : {};
  supply = supply && typeof supply === 'object' ? supply : {};
  criteria = criteria && typeof criteria === 'object' ? criteria : {};
  const m = load.motor && typeof load.motor === 'object' ? load.motor : {};
  const running = positive(load.kw) && positive(load.voltage) && load.phases === 3 && positive(load.powerFactor) && load.powerFactor <= 1
    ? load.kw * 1000 / (Math.sqrt(3) * load.voltage * load.powerFactor) : null;
  const runningA = positive(running) ? running : null;
  const hasOperating = operatingCurrentA !== undefined || operatingCurrentReference !== undefined;
  const operatingValid = positive(operatingCurrentA) && typeof operatingCurrentReference === 'string' && !!operatingCurrentReference.trim();
  const flcValid = positive(m.fullLoadCurrentA) && typeof m.fullLoadCurrentBasis?.reference === 'string' && !!m.fullLoadCurrentBasis.reference.trim() && !validateMotorDesignCurrentReference(load);
  const calculatedFloor = flcValid && positive(runningA) ? 1.25 * Math.max(m.fullLoadCurrentA, runningA, operatingValid ? operatingCurrentA : 0) : null;
  const calculatedCeiling = flcValid ? 2.5 * m.fullLoadCurrentA : null;
  const floor = positive(calculatedFloor) ? calculatedFloor : null;
  const ceiling = positive(calculatedCeiling) ? calculatedCeiling : null;
  const pickupBasis = resolveMotorStarterPickup(m, criteria);
  const pickup = pickupBasis.value;
  const checks = [];
  const checkSources = { relayCurrentRange: ['siemens-3ru2136-4hb0'], contactorUlCurrent: ['siemens-3rt2036-1nb30'], controlSupply: ['siemens-3rt2036-coil-2015'], conditionalShortCircuitRating: ['siemens-ul-3ru2136-2023'], breakerSizing: ['siemens-3va5170-6ec31', 'eaton-historical-motor-notes'], instantaneousPickup: ['siemens-3va51-speedfax-2024'] };
  const add = (id, pass, message, evidence = {}) => checks.push({ id, status: pass ? 'pass' : 'fail', message, evidence, sourceIds: checkSources[id] || [] });
  const unsupportedClassification = hasUnsupportedDesignSynthesisStarter(load);
  add('motorAndCircuit', !unsupportedClassification && m.nameplateHorsepower === 40 && [460, 480].includes(m.ratedVoltageV) && m.nameplateFrequencyHz === 60 && m.starterType === 'dol' && m.rotorType === 'squirrel-cage' && load.phases === 3 && supply.phases === 3 && load.voltage === 480 && supply.voltage === 480 && load.frequencyHz === 60 && supply.frequencyHz === 60, 'Requires an explicit 40 hp, 460/480 V, 60 Hz squirrel-cage DOL motor on a direct 480 V three-phase, 60 Hz circuit; VFD and soft-starter classifications are unsupported.');
  add('relayCurrentRange', positive(m.nameplateCurrentA) && m.nameplateCurrentA >= 40 && m.nameplateCurrentA <= 50, 'Nameplate current must fall within the 40–50 A overload-relay setting range.', { nameplateCurrentA: finiteOrNull(m.nameplateCurrentA) });
  add('contactorUlCurrent', positive(m.nameplateCurrentA) && m.nameplateCurrentA <= 52, 'Nameplate current must be within the contactor 52 A UL/CSA FLA rating at 480 V.');
  add('controlSupply', criteria.motorStarter?.controlVoltageV === 24 && criteria.motorStarter?.controlCurrentType === 'DC', 'This candidate requires the explicitly selected 24 V DC control basis.');
  add('designCurrent', flcValid && positive(runningA) && load.ratingsBasis === 'electrical-input-kW' && load.duty === 'continuous', 'Requires a current, referenced design FLC and continuous electrical-input kW/PF basis.');
  checks.push({ id: 'referencedOperatingCurrent', status: !hasOperating ? 'unevaluated' : operatingValid ? 'pass' : 'fail', message: !hasOperating ? 'No separately referenced operating-study current is supplied.' : operatingValid ? 'The referenced operating-study current is included in the breaker floor.' : 'An operating-current floor requires a positive current and a nonblank reference.', evidence: { operatingCurrentA: operatingValid ? operatingCurrentA : null, reference: typeof operatingCurrentReference === 'string' ? operatingCurrentReference : null }, sourceIds: [] });
  add('breakerSizing', positive(floor) && positive(ceiling) && floor <= 70 && 70 <= ceiling, 'The 70 A fixed breaker must fit the 125% screening floor and historical 250% screening ceiling.', { floorA: floor, breakerA: 70, ceilingA: ceiling });
  const motorAmbientSupplied = m.breakerAmbientTemperatureC !== undefined || m.breakerAmbientReference !== undefined;
  const ambient = motorAmbientSupplied ? m.breakerAmbientTemperatureC : criteria.motorStarter?.breakerAmbientTemperatureC;
  const ambientReference = motorAmbientSupplied ? m.breakerAmbientReference : criteria.motorStarter?.breakerAmbientReference;
  const ambientSuppressed = motorAmbientSupplied && ambient === null && ambientReference === null;
  const ambientBasis = ambientSuppressed ? 'motor-unset' : motorAmbientSupplied ? 'motor' : (ambient !== undefined || ambientReference !== undefined ? 'project' : 'unspecified');
  const ambientProvided = ambient !== undefined || ambientReference !== undefined;
  const ambientValid = typeof ambient === 'number' && Object.prototype.hasOwnProperty.call(MOTOR_40HP_BREAKER_AMBIENT_RATINGS, ambient)
    && typeof ambientReference === 'string' && !!ambientReference.trim();
  const ambientRating = ambientValid ? MOTOR_40HP_BREAKER_AMBIENT_RATINGS[ambient] : null;
  const ambientExceeded = ambientValid && floor !== null && floor > ambientRating;
  checks.push({
    id: 'breakerAmbientOperatingCurrent',
    status: ambientProvided && !ambientSuppressed && (!ambientValid || ambientExceeded) ? 'fail' : 'unevaluated',
    message: !ambientProvided || ambientSuppressed ? 'Breaker enclosure temperature and its reference are not supplied for this motor; operating-current temperature suitability is unevaluated.'
      : !ambientValid ? 'Supply a referenced breaker enclosure temperature matching a published 40–70 °C table point; no interpolation or corridor-temperature substitution is used.'
        : floor === null ? 'A valid operating-current floor is required for the 2025 table comparison; installation suitability remains unevaluated.'
          : `The 2025 Siemens table lists ${ambientRating} A at ${ambient} °C; the project screening floor is ${floor} A and ${ambientExceeded ? 'exceeds' : 'does not exceed'} that value. Another Siemens datasheet reports different values; reconcile its revision and installation applicability. No installed rating or protection approval is established.`,
    evidence: { enclosureTemperatureC: finiteOrNull(ambient), reference: typeof ambientReference === 'string' ? ambientReference : null, basis: ambientBasis, publishedOperatingCurrentA: ambientRating, screeningFloorA: floor, comparison: ambientValid && floor !== null ? (ambientExceeded ? 'exceeds-2025-table' : 'within-2025-table-unqualified') : 'not-evaluated', tableRevision: '2025-10-29', differingDatasheetValuesUnresolved: true },
    sourceIds: ['siemens-3va5170-6ec31', 'siemens-3va5170-alternate-temperature']
  });
  add('codeAndMethod', criteria.code === 'NEC' && criteria.motorStarter?.branchProtectionMethod === 'inverse-time-breaker', 'Select the NEC screening basis and inverse-time branch-breaker method.');
  add('conditionalShortCircuitRating', positive(supply.availableFaultCurrentKA) && supply.availableFaultCurrentKA <= 25, 'The source-only fault bound must be positive and no greater than the historical 2023 certificate’s 25 kA conditional combination rating; complete local duty is unresolved.', { availableFaultCurrentKA: finiteOrNull(supply.availableFaultCurrentKA), conditionalKA: 25 });
  checks.push({ id: 'instantaneousPickup', status: pickup === undefined ? 'unevaluated' : MOTOR_70A_BREAKER_PICKUPS.includes(pickup) ? 'pass' : 'fail', message: pickup === undefined ? 'No instantaneous setting is proposed; starting suitability remains unevaluated.' : 'A proposed instantaneous setting must match a listed 70 A TM230 value; its starting suitability is not established.', evidence: { selectedA: finiteOrNull(pickup), allowedA: [...MOTOR_70A_BREAKER_PICKUPS], basis: pickupBasis.basis }, sourceIds: checkSources.instantaneousPickup });
  const curveResearch = {
    status: 'matching-graphic-located-unqualified', matchingManufacturerGraphicAvailable: true,
    exactCandidateCatalogNumber: '3VA5170-6EC31-0AA0', sourceId: 'siemens-simaris-3va5170-2026',
    sourceUrl: 'https://curves.simaris.siemens.com/curves/3VA51706EC310AA0#trip',
    sourceAvailability: 'Official Siemens SIMARIS tripping graphics for the exact 70 A TM230 candidate are located. Viewer details show 415 V and 40 °C; applicability to this 480 V proposal remains unqualified. The 30 A graphic is not transferred or scaled to this breaker.',
    settingsApplicability: {
      fixedIrA: 70, selectedInstantaneousPickupA: MOTOR_70A_BREAKER_PICKUPS.includes(pickup) ? pickup : null,
      archivedInstantaneousPickupA: [350, 490],
      selectedSettingArchived: MOTOR_70A_BREAKER_PICKUPS.includes(pickup) ? [350, 490].includes(pickup) : null,
      note: 'Two separate PDF exports identify 350 A and 490 A. The viewer URL does not encode the selected pickup; reopening it requires checking the setting. No installed setting or suitability is established.'
    },
    displayedConditions: { operatingVoltageV: 415, ambientTemperatureC: 40, poles: 3, tripUnit: 'TM230', protectiveFunctions: 'LI', iecIcuKA: 70, initialState: null, installation: null, frequencyHz: null },
    voltageApplicability: 'unqualified-for-480v',
    archivedExports: [
      { instantaneousPickupA: 350, sha256: '487f28195e3761809208a8acbebc7362b822abc1a915144adb08bcec815d9c07', curvePage: 1, settingsPage: 4 },
      { instantaneousPickupA: 490, sha256: 'fa55fd533b8bc87e2059384bcb34570ab3f4a285e7daff6e63340eaa7d804e15', curvePage: 1, settingsPage: 4 }
    ],
    remainingQualification: ['Establish 480 V applicability, frequency, initial state, installation, boundary meaning and tolerances from authoritative evidence.', 'Transcribe and independently qualify minimum-trip and total-clearing envelopes before numerical use; the raster plots are not runtime curves.', 'Starting ride-through, conductor thermal withstand and coordination remain unevaluated.']
  };
  checks.push({ id: 'tccStartingAndCoordination', status: 'unevaluated', message: curveResearch.sourceAvailability, evidence: structuredClone(curveResearch), sourceIds: [curveResearch.sourceId] });
  checks.push({ id: 'coordinationAndInstallation', status: 'unevaluated', message: 'Starting tolerance, breaker curve and settings, local fault duty, ground faults, conductor withstand, panel SCCR, installation and complete protection remain unresolved.', evidence: null, sourceIds: [] });
  const eligible = checks.every(item => item.status !== 'fail');
  const candidate = {
    id: 'siemens-dol-40hp-3rt2036-3ru2136-3va5170', status: 'candidate', researchStatus: 'candidate', libraryStatus: 'screening', protectionStatus: 'blocked', selectedForApply: false,
    eligibleForResearchShortlist: eligible, topology: 'separate-branch-breaker-contactor-overload-relay', starterType: 'dol', manufacturer: 'Siemens',
    contactor: { catalogNumber: '3RT2036-1NB30', poles: 3, size: 'S2', coilVoltageV: 24, coilCurrentType: 'DC', ulThreePhaseMotorFlaAt480V: 52, ulThreePhaseMotorHorsepowerAt460Or480V: 40 },
    overloadRelay: { catalogNumber: '3RU2136-4HB0', currentSettingMinA: 40, currentSettingMaxA: 50, tripClass: 10, size: 'S2', candidateDialSettingA: positive(m.nameplateCurrentA) ? m.nameplateCurrentA : null, publishedTripCalibrationMultiplier: 1.25, publishedNominalTripCurrentA: positive(m.nameplateCurrentA) && positive(m.nameplateCurrentA * 1.25) ? m.nameplateCurrentA * 1.25 : null },
    branchCircuitBreaker: { catalogNumber: '3VA5170-6EC31-0AA0', poles: 3, ratedVoltageV: 480, ratedNetworkFrequencyHz: [50, 60], tripUnit: 'TM230', tripTechnology: 'FTAM', interruptingRatingKA: 65, continuousCurrentA: 70, fixedOverloadPickupA: 70, allowedInstantaneousPickupA: [...MOTOR_70A_BREAKER_PICKUPS], instantaneousPickupA: MOTOR_70A_BREAKER_PICKUPS.includes(pickup) ? pickup : null, instantaneousPickupBasis: pickupBasis.basis },
    conditionalCombination: { certificate: 'E44653', certificateRevision: '2023-03-20', coordinationType: 'not established', combination: '3RT203. + 3RU2136-4H + 3VA51', circuitVoltageV: 480, maximumBreakerCurrentA: 70, shortCircuitCurrentKA: 25 },
    sizing: { calculatedRunningCurrentA: runningA, operatingCurrentA: operatingValid ? operatingCurrentA : null, designFullLoadCurrentA: flcValid ? m.fullLoadCurrentA : null, minimumBreakerPickupA: floor, conservativeMaximumBreakerPickupA: ceiling },
    curveResearch,
    motorNameplate: { ratedVoltageV: finiteOrNull(m.ratedVoltageV), nameplateCurrentA: finiteOrNull(m.nameplateCurrentA), nameplateHorsepower: finiteOrNull(m.nameplateHorsepower), nameplateFrequencyHz: finiteOrNull(m.nameplateFrequencyHz), fullLoadCurrentA: finiteOrNull(m.fullLoadCurrentA), fullLoadCurrentBasis: typeof m.fullLoadCurrentBasis?.reference === 'string' ? { reference: m.fullLoadCurrentBasis.reference } : null, rotorType: typeof m.rotorType === 'string' ? m.rotorType : null },
    checks, sources: structuredClone(sources), fieldSources: [
      { pointer: '/candidate/contactor/catalogNumber', sourceId: 'siemens-3rt2036-1nb30', locator: 'Exact contactor data sheet' },
      { pointer: '/candidate/contactor/ulThreePhaseMotorFlaAt480V', sourceId: 'siemens-3rt2036-1nb30', locator: 'PDF page 5, UL/CSA 480 V FLA' },
      { pointer: '/candidate/contactor/ulThreePhaseMotorHorsepowerAt460Or480V', sourceId: 'siemens-3rt2036-1nb30', locator: 'PDF page 5, three-phase motor hp' },
      { pointer: '/candidate/contactor/coilVoltageV', sourceId: 'siemens-3rt2036-coil-2015', locator: 'PDF page 4, 20–33 V DC range; 24 V is the selected project basis' },
      { pointer: '/candidate/overloadRelay/catalogNumber', sourceId: 'siemens-3ru2136-4hb0', locator: 'Catalog page 7/99' },
      { pointer: '/candidate/overloadRelay/currentSettingMinA', sourceId: 'siemens-3ru2136-4hb0', locator: 'Catalog page 7/99, 40–50 A range' },
      { pointer: '/candidate/overloadRelay/currentSettingMaxA', sourceId: 'siemens-3ru2136-4hb0', locator: 'Catalog page 7/99, 40–50 A range' },
      { pointer: '/candidate/overloadRelay/publishedTripCalibrationMultiplier', sourceId: 'siemens-ul-3ru2136-2023', locator: 'PDF page 3: trip current stated as 125% of dial FLA; no time-current clearing curve' },
      { pointer: '/candidate/overloadRelay/candidateDialSettingA', sourceId: 'project-input', locator: 'Proposed dial equals the supplied nameplate current; installed setting and suitability are unverified', status: 'derived' },
      { pointer: '/candidate/overloadRelay/publishedNominalTripCurrentA', sourceId: 'siemens-ul-3ru2136-2023', locator: 'PDF page 3 calibration multiplied by the proposed nameplate dial; no clearing time inferred', status: 'derived' },
      { pointer: '/candidate/branchCircuitBreaker/catalogNumber', sourceId: 'siemens-3va5170-6ec31', locator: 'Exact 70 A product data sheet' },
      { pointer: '/candidate/branchCircuitBreaker/fixedOverloadPickupA', sourceId: 'siemens-3va5170-6ec31', locator: 'Exact product data sheet, fixed Ir 70 A' },
      { pointer: '/candidate/branchCircuitBreaker/interruptingRatingKA', sourceId: 'siemens-3va5170-6ec31', locator: 'Standalone breaker rating 65 kA at 480 V; see separate combination rating' },
      { pointer: '/candidate/branchCircuitBreaker/ratedVoltageV', sourceId: 'siemens-3va5170-6ec31', locator: 'Exact 70 A product data sheet, standalone interrupting rating at 480 V' },
      { pointer: '/candidate/branchCircuitBreaker/allowedInstantaneousPickupA', sourceId: 'siemens-3va51-speedfax-2024', locator: 'Printed page 7-53, 70 A TM230 row' },
      { pointer: '/candidate/curveResearch', sourceId: 'siemens-simaris-3va5170-2026', locator: 'Exact device viewer and archived exports; located source only, numerical envelopes and 480 V applicability unqualified', status: 'located' },
      { pointer: '/candidate/conditionalCombination', sourceId: 'siemens-ul-3ru2136-2023', locator: 'PDF page 8, 3RT203. + 3RU2136-4H + 3VA51 row' }
    ]
  };
  return { status: 'blocked', protectionStatus: 'blocked', researchStatus: 'candidate', libraryStatus: 'screening', candidate: eligible ? candidate : null, candidates: [candidate], rejectedCandidate: eligible ? null : { candidates: [candidate], sources: structuredClone(sources) }, diagnostics: checks.filter(item => item.status !== 'pass'), sources: structuredClone(sources), limitations: ['The 40 hp S2 assembly is a preliminary research candidate, not a selected or approved device.', 'The 25 kA certificate row is conditional and does not establish complete fault duty or assembled-panel SCCR.', 'Any supplied instantaneous setting is a proposed manufacturer-listed value; installed settings, motor-start tolerance, coordination, installation and complete protection are not established.'] };
}
