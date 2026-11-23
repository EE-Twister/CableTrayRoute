const SOURCE_IDS = Object.freeze({
  ulCombination: 'siemens-ul-e44653-2025-03-17',
  contactor: 'siemens-3rt2025-1bb40-datasheet',
  overloadRelay: 'siemens-3ru2126-4ab0-datasheet',
  manualController: 'siemens-3rv2021-4aa10-datasheet',
  controllerSlashVoltage: 'siemens-3rv2021-g120d-ul-480y-277',
  typeEAccessories: 'siemens-ic12-2023-type-e-accessories',
  voltageSystem: 'siemens-ul-voltage-system-guidance'
});

const sourceRecord = source => Object.freeze({
  ...source,
  publisher: source.publisher ?? 'Siemens AG',
  accessedOn: '2026-10-19',
  locators: Object.freeze([...source.locators])
});

const SOURCES = Object.freeze([
  {
    id: SOURCE_IDS.ulCombination,
    publisher: 'UL LLC (Siemens-hosted certificate)',
    title: 'UL Certificate of Compliance E44653, Siemens 3RU2126 combination ratings',
    url: 'https://cache.industry.siemens.com/dl/files/299/40223299/att_1326996/v1/3RU2126_CoC_202505131337157102.pdf',
    revision: '2025-03-17',
    sha256: 'c55126215a47084e9d40a8f0e11589a083285798a294c2ff32ce1ef00e55d45d',
    locators: ['PDF page 8: Type 1 contactor/overload/manual-controller combination, 480 V, 65 kA, 16 A controller, enclosure minimum', 'PDF page 9: Type 2 combination motor controller, 480 V, 65 kA, 16 A controller', 'PDF page 2: relay trip calibration statement', 'PDF page 12: BCPD selection notes and HIC breaker-family table', 'PDF page 13: nomenclature for exact relay suffixes']
  },
  {
    id: SOURCE_IDS.contactor,
    title: 'Siemens 3RT2025-1BB40 product datasheet',
    url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RT20251BB40',
    revision: '2026-01-27',
    locators: ['PDF pages 1 and 4–5: exact article data, coil, poles, terminals, UL/CSA motor FLA and horsepower']
  },
  {
    id: SOURCE_IDS.overloadRelay,
    title: 'Siemens 3RU2126-4AB0 product datasheet',
    url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2126-4AB0',
    revision: '2026-01-27',
    locators: ['PDF page 1: exact article, 11–16 A, thermal class 10, size S0, contactor mounting, screw terminals']
  },
  {
    id: SOURCE_IDS.manualController,
    title: 'Siemens 3RV2021-4AA10 product datasheet',
    url: 'https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RV2021-4AA10',
    revision: '2026-02-09',
    locators: ['PDF pages 1–2: exact article, 10–16 A thermal range, 208 A instantaneous pickup, UL/CSA motor FLA and horsepower']
  },
  {
    id: SOURCE_IDS.controllerSlashVoltage,
    title: 'Siemens SINAMICS G120D operating instructions, branch protection table',
    url: 'https://cache.industry.siemens.com/dl/files/592/109757592/att_951166/v1/G120D_CU250D2_op_instr_0418_en-US.pdf',
    revision: '2018-04',
    locators: ['PDF page 47: 3RV2021-4AA family listed as NKJH, 16 A maximum, 65 kA at 480Y/277 V AC in the stated G120D application; not a general standalone SCCR claim']
  },
  {
    id: SOURCE_IDS.typeEAccessories,
    title: 'Siemens IC 12 · 2023, 3RV2 Type E terminal blocks and phase barriers',
    url: 'https://cache.industry.siemens.com/dl/files/824/109747824/att_1115550/v1/IC12_EN_2023_WEB_II_202209141408233539.pdf',
    revision: '2023',
    locators: ['PDF page 2/202: screw-terminal S00/S0 Type E accessory numbers and limitations']
  },
  {
    id: SOURCE_IDS.voltageSystem,
    title: 'Siemens 3VA molded case circuit breaker UL/IEC manual, voltage system explanation',
    url: 'https://cache.industry.siemens.com/dl/files/561/109758561/att_971663/v1/3VA_IEC_UL_manual_molded_case_circuit_breakers_en_en-US.pdf',
    revision: '2019-01',
    locators: ['PDF page 15: straight versus slash voltage and grounding applicability explanation']
  }
].map(sourceRecord));

const CANDIDATE = Object.freeze({
  id: 'siemens-dol-480v-3rt2025-1bb40-3ru2126-4ab0-3rv2021-4aa10',
  starterType: 'dol',
  manufacturer: 'Siemens',
  contactor: Object.freeze({
    catalogNumber: '3RT2025-1BB40',
    poles: 3,
    size: 'S0',
    coilVoltageV: 24,
    coilCurrentType: 'DC',
    mainAndControlTerminals: 'screw',
    ulThreePhaseMotorFlaAt480V: 14,
    ulThreePhaseMotorHorsepowerAt460Or480V: 10,
    sourceId: SOURCE_IDS.contactor
  }),
  overloadRelay: Object.freeze({
    catalogNumber: '3RU2126-4AB0',
    currentSettingMinA: 11,
    currentSettingMaxA: 16,
    publishedTripCalibrationMultiplier: 1.25,
    tripClass: 10,
    size: 'S0',
    mounting: 'contactor-mounted',
    terminals: 'screw',
    sourceId: SOURCE_IDS.overloadRelay
  }),
  shortCircuitController: Object.freeze({
    catalogNumber: '3RV2021-4AA10',
    family: '3RV2.1',
    size: 'S0',
    currentSettingMinA: 10,
    currentSettingMaxA: 16,
    instantaneousPickupA: 208,
    ulThreePhaseMotorFlaAt480V: 16,
    ulThreePhaseMotorHorsepowerAt460Or480V: 10,
    terminals: 'screw',
    sourceId: SOURCE_IDS.manualController
  }),
  ulCombination: Object.freeze({
    certificate: 'E44653',
    certificateRevision: '2025-03-17',
    combination: '3RT2025 + 3RU2126-4A + 3RV2.1/3RV2.2',
    coordinationType: 'Type 1',
    voltageV: 480,
    evaluatedNetworkFrequencyHz: null,
    shortCircuitCurrentKA: 65,
    controllerCurrentConditionA: 16,
    minimumEnclosureDimensionTripletMm: Object.freeze([610, 305, 205]),
    sourceId: SOURCE_IDS.ulCombination
  })
});

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finitePositive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
function check(id, status, message, evidence = null, sourceIds = []) {
  return { id, status, message, evidence: evidenceValue(evidence), sourceIds };
}

function inputCheck(id, value, label) {
  if (value === undefined || value === null) return check(id, 'fail', `${label} is required.`);
  if (!finitePositive(value)) return check(id, 'fail', `${label} must be a finite positive number.`);
  return check(id, 'pass', `${label} is supplied and valid.`, value);
}

function evidenceValue(value, seen = new WeakSet()) {
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular evidence]';
    seen.add(value);
    return value.map(item => evidenceValue(item, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular evidence]';
    seen.add(value);
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, evidenceValue(nested, seen)]));
  }
  return value;
}

function fieldSource(pointer, sourceId, locator, status = 'verified') {
  return { pointer, sourceId, locator, status };
}

function baseChecks(load, supply, criteria) {
  const motor = isRecord(load?.motor) ? load.motor : {};
  const voltage = load?.voltage;
  const supplyVoltage = supply?.voltage;
  const motorVoltage = motor.ratedVoltageV;
  const nameplateCurrent = motor.nameplateCurrentA;
  const motorNameplateFrequency = motor.nameplateFrequencyHz;
  const hp = motor.nameplateHorsepower;
  const phases = load?.phases;
  const frequency = load?.frequencyHz;
  const sourceFrequency = supply?.frequencyHz;
  const checks = [
    check('motorPresent', isRecord(load?.motor) ? 'pass' : 'fail', isRecord(load?.motor) ? 'Motor input is present.' : 'A motor record is required.'),
    inputCheck('loadCircuitVoltage', voltage, 'Load motor-circuit voltage'),
    inputCheck('sourceVoltage', supplyVoltage, 'Supply voltage'),
    inputCheck('motorNameplateVoltage', motorVoltage, 'Motor nameplate voltage'),
    inputCheck('motorNameplateCurrent', nameplateCurrent, 'Motor nameplate current'),
    inputCheck('motorNameplateFrequency', motorNameplateFrequency, 'Motor nameplate frequency'),
    inputCheck('motorNameplateHorsepower', hp, 'Motor nameplate horsepower'),
    check('loadPhases', Number.isInteger(phases) && phases > 0 ? 'pass' : 'fail', Number.isInteger(phases) && phases > 0 ? 'Load phase count is a positive integer.' : 'Load phase count must be a positive integer.', phases ?? null),
    check('sourcePhases', Number.isInteger(supply?.phases) && supply.phases > 0 ? 'pass' : 'fail', Number.isInteger(supply?.phases) && supply.phases > 0 ? 'Source phase count is a positive integer.' : 'Source phase count must be a positive integer.', evidenceValue(supply?.phases)),
    inputCheck('effectiveFrequency', frequency, 'Effective motor-circuit frequency'),
    inputCheck('sourceFrequency', sourceFrequency, 'Effective source frequency'),
    inputCheck('sourceFaultBound', supply?.availableFaultCurrentKA, 'Available fault-current bound'),
    check('voltageSystemReference', typeof supply?.voltageSystem?.reference === 'string' && supply.voltageSystem.reference.trim() ? 'pass' : 'fail', typeof supply?.voltageSystem?.reference === 'string' && supply.voltageSystem.reference.trim() ? 'Voltage-system basis has a reference.' : 'A referenced voltage-system basis is required.'),
    check('criteriaPresent', isRecord(criteria?.motorStarter) ? 'pass' : 'fail', isRecord(criteria?.motorStarter) ? 'Motor-starter criteria are present.' : 'Explicit motor-starter criteria are required.')
  ];

  const directVoltageMatch = finitePositive(voltage) && finitePositive(supplyVoltage) && voltage === 480 && supplyVoltage === 480;
  checks.push(check('direct480VCircuit', directVoltageMatch ? 'pass' : 'fail', directVoltageMatch ? 'Supply and local motor circuit are both explicitly 480 V; no transformer fault-current referral is used.' : 'The candidate requires a direct 480 V source and 480 V local motor circuit. A transformed or different-voltage motor circuit needs its own fault-current basis.', { supplyVoltage: supplyVoltage ?? null, loadVoltage: voltage ?? null }));
  const motorVoltageMatchesPublishedRating = motorVoltage === 460 || motorVoltage === 480;
  checks.push(check('motorVoltageRating', motorVoltageMatchesPublishedRating ? 'pass' : 'fail', motorVoltageMatchesPublishedRating ? `The ${motorVoltage} V motor nameplate rating is retained separately from the 480 V network rating.` : 'Motor nameplate voltage must explicitly be 460 V or 480 V for this candidate.', { motorNameplateVoltageV: motorVoltage ?? null, networkVoltageV: voltage ?? null }, [SOURCE_IDS.contactor, SOURCE_IDS.manualController]));
  const frequencyAndPhaseMatch = supply?.phases === 3 && phases === 3 && sourceFrequency === 60 && frequency === 60 && motorNameplateFrequency === 60 && motor.starterType === 'dol';
  checks.push(check('threePhase60Hz', frequencyAndPhaseMatch ? 'pass' : 'fail', frequencyAndPhaseMatch ? 'Source and load are explicitly three-phase at 60 Hz, the motor nameplate is 60 Hz, and starting is direct-on-line. The certificate row does not itself specify 60 Hz.' : 'This candidate requires three-phase source and load records at 60 Hz, a 60 Hz motor nameplate, and direct-on-line starting.', { sourcePhases: evidenceValue(supply?.phases), loadPhases: evidenceValue(phases), sourceFrequencyHz: evidenceValue(sourceFrequency), loadFrequencyHz: evidenceValue(frequency), motorNameplateFrequencyHz: evidenceValue(motorNameplateFrequency), starterType: motor.starterType ?? null }, [SOURCE_IDS.contactor, SOURCE_IDS.manualController]));

  const currentContactor = finitePositive(nameplateCurrent) && nameplateCurrent <= CANDIDATE.contactor.ulThreePhaseMotorFlaAt480V;
  checks.push(check('contactorUlCurrent', currentContactor ? 'pass' : 'fail', currentContactor ? `Nameplate current is within the contactor's UL 480 V FLA limit of ${CANDIDATE.contactor.ulThreePhaseMotorFlaAt480V} A.` : `Nameplate current must not exceed the contactor's UL 480 V FLA limit of ${CANDIDATE.contactor.ulThreePhaseMotorFlaAt480V} A.`, { nameplateCurrentA: nameplateCurrent ?? null, maximumA: CANDIDATE.contactor.ulThreePhaseMotorFlaAt480V }, [SOURCE_IDS.contactor]));
  const relayCurrent = finitePositive(nameplateCurrent) && nameplateCurrent >= CANDIDATE.overloadRelay.currentSettingMinA && nameplateCurrent <= CANDIDATE.overloadRelay.currentSettingMaxA;
  checks.push(check('relayCurrentRange', relayCurrent ? 'pass' : 'fail', relayCurrent ? `Nameplate current is within the S0 relay's ${CANDIDATE.overloadRelay.currentSettingMinA}–${CANDIDATE.overloadRelay.currentSettingMaxA} A setting range.` : `Nameplate current must be within the S0 relay's ${CANDIDATE.overloadRelay.currentSettingMinA}–${CANDIDATE.overloadRelay.currentSettingMaxA} A setting range.`, { nameplateCurrentA: nameplateCurrent ?? null, minA: 11, maxA: 16 }, [SOURCE_IDS.overloadRelay]));
  const controllerCurrent = finitePositive(nameplateCurrent) && nameplateCurrent >= CANDIDATE.shortCircuitController.currentSettingMinA && nameplateCurrent <= CANDIDATE.shortCircuitController.currentSettingMaxA;
  checks.push(check('controllerCurrentRange', controllerCurrent ? 'pass' : 'fail', controllerCurrent ? `Nameplate current is within the controller's ${CANDIDATE.shortCircuitController.currentSettingMinA}–${CANDIDATE.shortCircuitController.currentSettingMaxA} A adjustable range.` : `Nameplate current must be within the controller's ${CANDIDATE.shortCircuitController.currentSettingMinA}–${CANDIDATE.shortCircuitController.currentSettingMaxA} A adjustable range.`, { nameplateCurrentA: nameplateCurrent ?? null, minA: 10, maxA: 16 }, [SOURCE_IDS.manualController]));
  const nominalRelayTripCurrentA = finitePositive(nameplateCurrent)
    ? CANDIDATE.overloadRelay.publishedTripCalibrationMultiplier * nameplateCurrent
    : null;
  checks.push(check('relayPublishedTripCalibration', Number.isFinite(nominalRelayTripCurrentA) ? 'pass' : 'fail', Number.isFinite(nominalRelayTripCurrentA) ? 'The certificate states nominal relay trip current is 125% of the FLA shown on its dial. This value is a manufacturer calibration relation, not an overload limit or a clearing time.' : 'A finite positive nameplate current is required to derive the published nominal relay trip calibration.', { candidateDialSettingA: evidenceValue(nameplateCurrent), calibrationMultiplier: 1.25, nominalRelayTripCurrentA: evidenceValue(nominalRelayTripCurrentA) }, [SOURCE_IDS.ulCombination]));
  const hpMatches = finitePositive(hp) && hp <= Math.min(CANDIDATE.contactor.ulThreePhaseMotorHorsepowerAt460Or480V, CANDIDATE.shortCircuitController.ulThreePhaseMotorHorsepowerAt460Or480V);
  checks.push(check('ulHorsepower', hpMatches ? 'pass' : 'fail', hpMatches ? `Nameplate horsepower is within both devices' 10 hp UL limit at 460/480 V.` : 'An explicit motor nameplate horsepower no greater than 10 hp is required; electrical-input kW is not converted to horsepower.', { nameplateHorsepower: hp ?? null, maximumHorsepower: 10 }, [SOURCE_IDS.contactor, SOURCE_IDS.manualController]));

  const faultKA = supply?.availableFaultCurrentKA;
  const localFaultBasisSupported = directVoltageMatch && supply?.phases === 3 && phases === 3;
  const faultWithinRating = finitePositive(faultKA) && faultKA <= CANDIDATE.ulCombination.shortCircuitCurrentKA;
  const conditionalFaultStatus = !localFaultBasisSupported ? 'unevaluated' : faultWithinRating ? 'pass' : 'fail';
  const conditionalFaultMessage = !localFaultBasisSupported
    ? 'The supplied fault bound cannot be compared with this 480 V certificate row because the motor circuit is not explicitly a direct, three-phase 480 V circuit; a transformed load requires a local fault-current basis.'
    : faultWithinRating
      ? 'The supplied positive symmetrical fault-current bound at the direct 480 V motor circuit does not exceed the certificate row’s 65 kA rating.'
      : 'Available fault current at the direct 480 V motor circuit must be finite, positive, and no greater than the certificate row’s 65 kA rating.';
  checks.push(check('conditionalShortCircuitRating', conditionalFaultStatus, conditionalFaultMessage, { availableFaultCurrentKA: evidenceValue(faultKA), conditionalRatingKA: 65, voltageV: 480, localFaultBasisSupported }, [SOURCE_IDS.ulCombination]));

  const voltageSystem = supply?.voltageSystem;
  const lineToGround = voltageSystem?.lineToGroundVoltageV;
  const nominalGroundVoltage = 480 / Math.sqrt(3);
  const exactCalculatedLineGround = finitePositive(lineToGround)
    && Math.abs(lineToGround - nominalGroundVoltage) <= Number.EPSILON * nominalGroundVoltage * 4;
  const nominalOrCalculatedLineGround = lineToGround === 277 || exactCalculatedLineGround;
  const voltageSystemMatches = voltageSystem?.connection === 'wye'
    && voltageSystem?.grounding === 'solid'
    && typeof voltageSystem.reference === 'string'
    && voltageSystem.reference.trim().length > 0
    && nominalOrCalculatedLineGround;
  const lineToGroundBasis = lineToGround === 277 ? 'nominal-480Y/277' : exactCalculatedLineGround ? 'calculated-480-over-sqrt3' : null;
  checks.push(check('slashVoltageSystem', voltageSystemMatches ? 'pass' : 'fail', voltageSystemMatches ? 'The supplied local system basis is explicitly solidly grounded 480Y/277 V wye, represented by nominal 277 V or the direct 480/√3 value within machine precision.' : 'This candidate requires a referenced, solidly grounded 480Y/277 V wye system. Delta, ungrounded, high-resistance-grounded, and other bases are unsupported.', { connection: voltageSystem?.connection ?? null, grounding: voltageSystem?.grounding ?? null, lineToGroundVoltageV: evidenceValue(lineToGround), acceptedBasis: lineToGroundBasis, nominalLineToGroundV: 277, calculatedLineToGroundV: nominalGroundVoltage }, [SOURCE_IDS.controllerSlashVoltage, SOURCE_IDS.voltageSystem]));

  const control = criteria?.motorStarter;
  const controlVoltageCheck = control?.controlVoltageV === 24 && control?.controlCurrentType === 'DC';
  checks.push(check('controlSupply', controlVoltageCheck ? 'pass' : 'fail', controlVoltageCheck ? 'Explicit project control criteria match the contactor 24 V DC coil.' : 'Explicit motor-starter criteria must select a 24 V DC control supply; no control voltage is assumed.', { controlVoltageV: control?.controlVoltageV ?? null, controlCurrentType: control?.controlCurrentType ?? null }, [SOURCE_IDS.contactor]));

  const enclosure = control?.enclosureMm;
  const enclosureDimensionsValid = isRecord(enclosure)
    && finitePositive(enclosure.height)
    && finitePositive(enclosure.width)
    && finitePositive(enclosure.depth);
  const enclosureNumericEnvelopePasses = enclosureDimensionsValid
    && enclosure.height >= 610
    && enclosure.width >= 305
    && enclosure.depth >= 205;
  checks.push(check('minimumEnclosureDimensions', enclosureDimensionsValid ? (enclosureNumericEnvelopePasses ? 'pass' : 'fail') : 'fail', enclosureNumericEnvelopePasses ? 'The entered height, width, and depth numerically meet the certificate’s 610 × 305 × 205 mm triplet when compared in that order; orientation remains unevaluated.' : 'Enter positive enclosure dimensions that numerically meet 610, 305, and 205 mm when compared in height, width, and depth order.', { requestedMm: enclosure ?? null, certificateDimensionTripletMm: CANDIDATE.ulCombination.minimumEnclosureDimensionTripletMm }, [SOURCE_IDS.ulCombination]));
  checks.push(check('enclosureOrientation', 'unevaluated', 'The UL certificate publishes a 610 × 305 × 205 mm minimum but does not label those dimensions as height, width, and depth. Axis orientation and actual enclosure applicability remain unresolved.', { enteredDimensionsMm: enclosure ?? null, publishedDimensionTripletMm: [610, 305, 205] }, [SOURCE_IDS.ulCombination]));

  checks.push(check('certifiedControllerCondition', 'unevaluated', 'The 2025 UL certificate row specifies a 16.0 A manual motor controller condition. The exact 3RV article is identified, but its applied setting and equivalence to that tested condition are unresolved; no 16 A setting is inferred.', { certificateControllerCurrentA: 16, catalogNumber: CANDIDATE.shortCircuitController.catalogNumber, actualSettingA: null }, [SOURCE_IDS.ulCombination, SOURCE_IDS.manualController]));
  checks.push(check('branchProtectionSelection', 'unevaluated', 'The certificate requires branch-circuit protection to be selected for the actual application; no conductor, fuse, or upstream breaker device is selected by this helper.', null, [SOURCE_IDS.ulCombination]));
  checks.push(check('typeEAccessories', 'unevaluated', 'The certificate row supports a Type 1 combination. No Type E claim is made. If a separate Type E/self-protected controller installation is required, Siemens specifies Type E terminal blocks or phase barriers for this screw-terminal S0 device; installation must be checked.', { terminalBlock: '3RV2928-1H', phaseBarrier: '3RV2928-1K' }, [SOURCE_IDS.typeEAccessories]));
  checks.push(check('motorOverloadApplication', 'unevaluated', 'The relay range fit does not establish permitted overload-trip limits, required adjustment, starting ride-through, or motor thermal protection.', { nameplateCurrentA: nameplateCurrent ?? null, candidateRelayRangeA: [11, 16] }, [SOURCE_IDS.overloadRelay, SOURCE_IDS.ulCombination]));
  checks.push(check('faultDutyAndCoordination', 'unevaluated', 'The 65 kA value is a conditional combination rating, not an assembled-panel SCCR or a complete fault-duty/coordination study. Local fault contribution, ground-fault duty, asymmetry, conductor withstand, and clearing coordination remain unresolved.', { conditionalCombinationRatingKA: 65, localFaultContributionStatus: 'unresolved' }, [SOURCE_IDS.ulCombination]));
  checks.push(check('startingAndThermalWithstand', 'unevaluated', 'Direct-on-line starting ride-through, acceleration, and thermal withstand have not been evaluated.', null, [SOURCE_IDS.contactor, SOURCE_IDS.overloadRelay]));

  return checks;
}

function addFieldSources() {
  return [
    fieldSource('/candidate/motorNameplate/ratedVoltageV', 'project-input', 'load.motor.ratedVoltageV; retained as the motor nameplate value'),
    fieldSource('/candidate/motorNameplate/nameplateCurrentA', 'project-input', 'load.motor.nameplateCurrentA; used for independent relay/controller range checks'),
    fieldSource('/candidate/motorNameplate/nameplateHorsepower', 'project-input', 'load.motor.nameplateHorsepower; no conversion from electrical-input kW'),
    fieldSource('/candidate/motorNameplate/nameplateFrequencyHz', 'project-input', 'load.motor.nameplateFrequencyHz; kept distinct from effective network frequency'),
    fieldSource('/candidate/motorNameplate/starterType', 'project-input', 'load.motor.starterType; the candidate is limited to direct-on-line starting'),
    fieldSource('/candidate/manufacturer', SOURCE_IDS.contactor, 'Siemens product data and certificate'),
    fieldSource('/candidate/starterType', 'project-input', 'load.motor.starterType; direct-on-line starting'),
    fieldSource('/candidate/contactor/poles', SOURCE_IDS.contactor, 'Three-pole contactor, PDF page 1'),
    fieldSource('/candidate/contactor/size', SOURCE_IDS.contactor, 'S0 size, PDF page 1'),
    fieldSource('/candidate/contactor/catalogNumber', SOURCE_IDS.contactor, 'Exact article number in product datasheet, PDF page 1'),
    fieldSource('/candidate/contactor/coilVoltageV', SOURCE_IDS.contactor, '24 V DC control supply, PDF page 1'),
    fieldSource('/candidate/contactor/coilCurrentType', SOURCE_IDS.contactor, 'DC coil, PDF page 1'),
    fieldSource('/candidate/contactor/mainAndControlTerminals', SOURCE_IDS.contactor, 'Screw terminals, PDF page 1'),
    fieldSource('/candidate/contactor/ulThreePhaseMotorFlaAt480V', SOURCE_IDS.contactor, 'UL/CSA 3-phase motor FLA at 480 V, PDF page 4'),
    fieldSource('/candidate/contactor/ulThreePhaseMotorHorsepowerAt460Or480V', SOURCE_IDS.contactor, 'UL/CSA 3-phase motor horsepower at 460/480 V, PDF page 5'),
    fieldSource('/candidate/overloadRelay/catalogNumber', SOURCE_IDS.overloadRelay, 'Exact article number in product datasheet, PDF page 1'),
    fieldSource('/candidate/overloadRelay/size', SOURCE_IDS.overloadRelay, 'S0 size, PDF page 1'),
    fieldSource('/candidate/overloadRelay/tripClass', SOURCE_IDS.overloadRelay, 'Class 10, PDF page 1'),
    fieldSource('/candidate/overloadRelay/mounting', SOURCE_IDS.overloadRelay, 'Contactor-mounted, PDF page 1'),
    fieldSource('/candidate/overloadRelay/terminals', SOURCE_IDS.overloadRelay, 'Screw terminals, PDF page 1'),
    fieldSource('/candidate/overloadRelay/currentSettingMinA', SOURCE_IDS.overloadRelay, '11–16 A range, PDF page 1'),
    fieldSource('/candidate/overloadRelay/currentSettingMaxA', SOURCE_IDS.overloadRelay, '11–16 A range, PDF page 1'),
    fieldSource('/candidate/overloadRelay/publishedTripCalibrationMultiplier', SOURCE_IDS.ulCombination, '2025 CoC E44653, PDF page 2: trip current is 125% of FLA shown on dial'),
    fieldSource('/candidate/relayDialSettingCandidateA', 'project-input', 'Derived candidate dial value from explicit motor nameplate current; actual installed setting is unverified', 'derived'),
    fieldSource('/candidate/relayPublishedNominalTripCurrentA', SOURCE_IDS.ulCombination, '2025 CoC E44653, PDF page 2: 1.25 × dial FLA; nominal relation only, derived from candidate dial value', 'derived'),
    fieldSource('/candidate/shortCircuitController/catalogNumber', SOURCE_IDS.manualController, 'Exact article number in product datasheet, PDF page 1'),
    fieldSource('/candidate/shortCircuitController/family', SOURCE_IDS.manualController, '3RV2.1 article family, product description and article number'),
    fieldSource('/candidate/shortCircuitController/size', SOURCE_IDS.manualController, 'S0 size, PDF page 1'),
    fieldSource('/candidate/shortCircuitController/terminals', SOURCE_IDS.manualController, 'Screw terminals, PDF page 1'),
    fieldSource('/candidate/shortCircuitController/currentSettingMinA', SOURCE_IDS.manualController, '10–16 A A-release, PDF page 1'),
    fieldSource('/candidate/shortCircuitController/currentSettingMaxA', SOURCE_IDS.manualController, '10–16 A A-release, PDF page 1'),
    fieldSource('/candidate/shortCircuitController/instantaneousPickupA', SOURCE_IDS.manualController, '208 A N-release, PDF page 1'),
    fieldSource('/candidate/shortCircuitController/ulThreePhaseMotorFlaAt480V', SOURCE_IDS.manualController, 'UL/CSA 3-phase motor FLA at 480 V, PDF page 2'),
    fieldSource('/candidate/shortCircuitController/ulThreePhaseMotorHorsepowerAt460Or480V', SOURCE_IDS.manualController, 'UL/CSA 3-phase motor horsepower at 460/480 V, PDF page 2'),
    fieldSource('/candidate/shortCircuitControllerSettingA', SOURCE_IDS.ulCombination, 'The certificate gives a 16 A combination condition but does not establish the actual applied controller setting', 'not_found'),
    fieldSource('/candidate/ulCombination/coordinationType', SOURCE_IDS.ulCombination, '2025 CoC E44653, PDF page 8: Type 1'),
    fieldSource('/candidate/ulCombination/certificate', SOURCE_IDS.ulCombination, '2025 CoC E44653 certificate title'),
    fieldSource('/candidate/ulCombination/certificateRevision', SOURCE_IDS.ulCombination, '2025 CoC E44653, issue date 2025-03-17'),
    fieldSource('/candidate/ulCombination/voltageV', SOURCE_IDS.ulCombination, '2025 CoC E44653, PDF page 8: 480 V'),
    fieldSource('/candidate/ulCombination/evaluatedNetworkFrequencyHz', 'project-input', 'supply.frequencyHz, validated project basis; not stated in the certificate'),
    fieldSource('/candidate/ulCombination/shortCircuitCurrentKA', SOURCE_IDS.ulCombination, '2025 CoC E44653, PDF page 8; 65 kA at 480 V'),
    fieldSource('/candidate/ulCombination/controllerCurrentConditionA', SOURCE_IDS.ulCombination, '2025 CoC E44653, PDF page 8; 16.0 A controller condition'),
    fieldSource('/candidate/ulCombination/minimumEnclosureDimensionTripletMm', SOURCE_IDS.ulCombination, '2025 CoC E44653, PDF page 8; 610 × 305 × 205 mm; axis labels are not given'),
    fieldSource('/candidate/ulCombination/combination', SOURCE_IDS.ulCombination, '2025 CoC names 3RT2025 + 3RU2126-4A + 3RV2.1/3RV2.2; exact order-number mapping is derived from product data', 'derived')
  ];
}

/**
 * Selects one evidence-backed motor-starter research candidate. This helper
 * performs catalog and conditional-rating fit checks only; it never clears
 * motor protection or produces device curves or clearing times.
 */
export function evaluateMotorStarterCandidates({ load, supply, criteria } = {}) {
  const checks = baseChecks(load, supply, criteria);
  const basicFitCheckIds = new Set([
    'motorPresent',
    'loadCircuitVoltage',
    'sourceVoltage',
    'motorNameplateVoltage',
    'motorNameplateCurrent',
    'motorNameplateFrequency',
    'motorNameplateHorsepower',
    'loadPhases',
    'sourcePhases',
    'effectiveFrequency',
    'sourceFrequency',
    'direct480VCircuit',
    'motorVoltageRating',
    'threePhase60Hz',
    'contactorUlCurrent',
    'relayCurrentRange',
    'controllerCurrentRange',
    'ulHorsepower'
  ]);
  const basicFitFailed = checks.some(item => basicFitCheckIds.has(item.id) && item.status === 'fail');
  const candidate = basicFitFailed ? null : {
    ...CANDIDATE,
    status: 'candidate',
    researchStatus: 'candidate',
    libraryStatus: 'screening',
    protectionStatus: 'blocked',
    selectedForApply: false,
    ulCombination: {
      ...CANDIDATE.ulCombination,
      evaluatedNetworkFrequencyHz: supply.frequencyHz
    },
    motorNameplate: {
      ratedVoltageV: load.motor.ratedVoltageV,
      nameplateCurrentA: load.motor.nameplateCurrentA,
      nameplateHorsepower: load.motor.nameplateHorsepower,
      nameplateFrequencyHz: load.motor.nameplateFrequencyHz,
      starterType: load.motor.starterType
    },
    relayDialSettingCandidateA: load.motor.nameplateCurrentA,
    relayPublishedNominalTripCurrentA: load.motor.nameplateCurrentA * CANDIDATE.overloadRelay.publishedTripCalibrationMultiplier,
    shortCircuitControllerSettingA: null,
    sources: SOURCES.map(source => ({ ...source, locators: [...source.locators] })),
    fieldSources: addFieldSources(),
    checks
  };

  const diagnostics = checks.filter(item => item.status !== 'pass').map(({ id, status, message }) => ({ id, status, message }));
  const status = 'blocked';
  return {
    status,
    protectionStatus: 'blocked',
    researchStatus: 'candidate',
    libraryStatus: 'screening',
    candidate,
    rejectedCandidate: candidate ? null : {
      id: CANDIDATE.id,
      catalogNumbers: [CANDIDATE.contactor.catalogNumber, CANDIDATE.overloadRelay.catalogNumber, CANDIDATE.shortCircuitController.catalogNumber],
      sources: SOURCES.map(source => ({ ...source, locators: [...source.locators] })),
      checks
    },
    diagnostics,
    limitations: [
      'The UL short-circuit value is conditional for the listed combination; it is not the assembled panel SCCR.',
      'The helper does not determine conductor, BCPD, motor overload, ground-fault, starting, thermal-withstand, or coordination compliance.',
      'No device curve, clearing time, or code-compliance conclusion is generated.'
    ]
  };
}

export const MOTOR_STARTER_CANDIDATE_SOURCES = SOURCES;
