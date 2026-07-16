export const MCC_LINEUPS_KEY = 'mccLineups';

export const DEFAULT_MCC_UNIT_HEIGHT_IN = 6;
export const DEFAULT_MCC_SECTION_HEIGHT_IN = 90;
export const DEFAULT_MCC_USABLE_BUCKET_HEIGHT_IN = 72;
export const DEFAULT_MCC_SECTION_WIDTH_IN = 20;
export const DEFAULT_MCC_SECTION_DEPTH_IN = 20;
export const DEFAULT_MCC_HORIZONTAL_BUS_RATING_A = 1600;
export const DEFAULT_MCC_VERTICAL_BUS_RATING_A = 600;
export const DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN = 4;
export const DEFAULT_MCC_TOP_HORIZONTAL_WIREWAY_HEIGHT_IN = 9;
export const DEFAULT_MCC_BOTTOM_HORIZONTAL_WIREWAY_HEIGHT_IN = 9;
export const DEFAULT_MCC_SPEC_REQUIREMENTS = {
  busMaterial: 'copper',
  busPlating: 'tin-plated',
  busPlatingOther: '',
  shortCircuitRatingKa: 65,
  incomingLinePower: 'top',
  incomingLinePowerOther: '',
  spaceHeaterRequired: false,
  spaceHeaterVoltage: '120VAC',
  spaceHeaterAccessories: [],
  communicationProtocol: 'none',
  controlVoltage: '120VAC',
  enclosureRating: 'NEMA 1',
  mccArrangement: 'front-only',
  expansionCoverPlates: 'right',
  busJoinPlating: 'manufacturer-standard',
  groundBusRequired: 'yes',
  groundBusLocation: 'horizontal-bottom',
  motorProtectionDevice: 'thermal-magnetic',
  finish: 'ANSI 61 gray',
  notes: ''
};
export const DEFAULT_MCC_REPORT_TITLE_BLOCK = {
  projectName: '',
  client: '',
  drawingNumber: '',
  revision: 'A',
  preparedBy: '',
  checkedBy: '',
  reportDate: ''
};

export const MCC_BUCKET_TYPES = [
  'main',
  'starter',
  'vfd',
  'breaker',
  'feeder',
  'space',
  'spare'
];

export const MCC_STARTER_TYPES = [
  '',
  'fvnr',
  'fvr',
  'soft-starter',
  'wye-delta',
  'two-speed',
  'reduced-voltage-autotransformer',
  'other'
];

export const MCC_BUCKET_STATUSES = [
  'active',
  'spare',
  'space'
];

export const MCC_MAIN_DEVICE_TYPES = [
  'mlo',
  'breaker'
];

export const MCC_BUS_MATERIAL_TYPES = [
  'copper',
  'aluminum'
];

export const MCC_BUS_PLATING_TYPES = [
  'tin-plated',
  'silver-plated',
  'bare',
  'other'
];

export const MCC_COMMUNICATION_PROTOCOL_TYPES = [
  'none',
  'hardwired',
  'ethernet-ip',
  'modbus-tcp',
  'modbus-rtu',
  'profibus',
  'profinet',
  'devicenet'
];

export const MCC_INCOMING_LINE_POWER_TYPES = [
  'top',
  'bottom',
  'left',
  'right',
  'other'
];

export const MCC_ENCLOSURE_TYPES = [
  'NEMA 1',
  'NEMA 1A',
  'NEMA 3R',
  'NEMA 12'
];

export const MCC_ARRANGEMENT_TYPES = [
  'front-only',
  'back-to-back'
];

export const MCC_EXPANSION_COVER_PLATE_TYPES = [
  'left',
  'right'
];

export const MCC_SPACE_HEATER_ACCESSORY_TYPES = [
  'high-temp-cutout',
  'heater-circuit-breaker',
  'thermostat-controlled',
  'test-pushbutton-ammeter'
];

export const MCC_BUS_JOIN_PLATING_TYPES = [
  'manufacturer-standard',
  'tin-plated',
  'silver-plated'
];

export const MCC_GROUND_BUS_REQUIRED_TYPES = [
  'yes',
  'no'
];

export const MCC_GROUND_BUS_LOCATION_TYPES = [
  'horizontal-bottom',
  'horizontal-top'
];

export const MCC_MOTOR_PROTECTION_DEVICE_TYPES = [
  'thermal-magnetic',
  'magnetic'
];

let mccIdSequence = 0;

export function createMccUniqueId(prefix = 'mcc') {
  mccIdSequence += 1;
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `${prefix}-${randomUuid}`;
  const timePart = Date.now().toString(36);
  const sequencePart = mccIdSequence.toString(36);
  const randomPart = Math.round(Math.random() * 1_000_000_000).toString(36);
  return `${prefix}-${timePart}-${sequencePart}-${randomPart}`;
}

function finiteNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value, fallback, min = 0.01) {
  return Math.max(min, finiteNumber(value, fallback));
}

function nonNegativeNumber(value, fallback) {
  return Math.max(0, finiteNumber(value, fallback));
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'required'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'none', 'not required'].includes(normalized)) return false;
  return fallback;
}

function text(value, fallback = '') {
  const stringValue = value === undefined || value === null ? '' : String(value);
  return stringValue.trim() || fallback;
}

function choiceToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function choiceValue(value, choices, fallback = '') {
  const token = choiceToken(value);
  return choices.find(choice => choiceToken(choice) === token) || fallback;
}

function normalizeMultiChoice(value, choices) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? '')
      .split(/[,;|]/)
      .map(part => part.trim())
      .filter(Boolean);
  return rawValues.reduce((result, rawValue) => {
    const normalized = choiceValue(rawValue, choices);
    if (normalized && !result.includes(normalized)) result.push(normalized);
    return result;
  }, []);
}

function specChoiceLabel(value) {
  const labels = {
    top: 'Top',
    bottom: 'Bottom',
    left: 'Left',
    right: 'Right',
    other: 'Other',
    'front-only': 'Front Only',
    'back-to-back': 'Back to Back',
    'manufacturer-standard': 'Manufacturer Standard',
    'tin-plated': 'Tin-Plated',
    'silver-plated': 'Silver-Plated',
    yes: 'Yes',
    no: 'No',
    'horizontal-bottom': 'Horizontal Bottom',
    'horizontal-top': 'Horizontal Top',
    'thermal-magnetic': 'Thermal-Magnetic',
    magnetic: 'Magnetic',
    'high-temp-cutout': 'High-Temp Cutout',
    'heater-circuit-breaker': 'Heater Circuit Breaker',
    'thermostat-controlled': 'Thermostat Controlled',
    'test-pushbutton-ammeter': 'Test Pushbutton and Ammeter'
  };
  return labels[value] || String(value ?? '');
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeBucketType(bucket = {}) {
  const value = String(bucket.type || '').trim().toLowerCase();
  if (value === 'main-mlo' || value === 'main mlo' || value === 'mlo') {
    return { type: 'main', mainDevice: 'mlo' };
  }
  if (value === 'main-breaker' || value === 'main breaker' || value === 'main-circuit-breaker') {
    return { type: 'main', mainDevice: 'breaker' };
  }
  return {
    type: MCC_BUCKET_TYPES.includes(value) ? value : 'starter',
    mainDevice: ''
  };
}

function normalizeMainDevice(bucket = {}, type = bucket.type, typeMainDevice = '') {
  if (type !== 'main') return '';
  if (typeMainDevice) return typeMainDevice;
  const value = String(bucket.mainDevice || '').trim().toLowerCase();
  if (value === 'mlo' || value === 'main lug only' || value === 'main lugs only' || value === 'main-lug-only') {
    return 'mlo';
  }
  if (value === 'breaker' || value === 'main breaker' || value === 'circuit breaker') {
    return 'breaker';
  }
  return text(bucket.breakerA) ? 'breaker' : 'mlo';
}

function truncateText(value, limit = 80) {
  const stringValue = String(value ?? '');
  return stringValue.length > limit ? `${stringValue.slice(0, Math.max(1, limit - 1))}.` : stringValue;
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function bucketHeightFromUnits(sizeUnits, unitHeightIn) {
  return round(positiveNumber(sizeUnits, 1) * positiveNumber(unitHeightIn, DEFAULT_MCC_UNIT_HEIGHT_IN), 2);
}

export function bucketUnitsFromHeight(heightIn, unitHeightIn) {
  return round(positiveNumber(heightIn, DEFAULT_MCC_UNIT_HEIGHT_IN) / positiveNumber(unitHeightIn, DEFAULT_MCC_UNIT_HEIGHT_IN), 2);
}

function bucketPositionLetter(index) {
  let value = Math.max(0, Math.floor(index));
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

export function mccBucketPositionLabel(startHeightIn, bucket = {}, unitHeightIn = DEFAULT_MCC_UNIT_HEIGHT_IN) {
  const unitHeight = positiveNumber(unitHeightIn, DEFAULT_MCC_UNIT_HEIGHT_IN);
  const startUnitIndex = Math.max(0, Math.floor(nonNegativeNumber(startHeightIn, 0) / unitHeight));
  const endHeightIn = nonNegativeNumber(startHeightIn, 0) + positiveNumber(bucket.heightIn, unitHeight);
  const endUnitIndex = Math.max(startUnitIndex, Math.ceil(endHeightIn / unitHeight) - 1);
  const startLetter = bucketPositionLetter(startUnitIndex);
  const endLetter = bucketPositionLetter(endUnitIndex);
  return startLetter === endLetter ? startLetter : `${startLetter}-${endLetter}`;
}

export function mccMainDeviceLabel(bucket = {}, options = {}) {
  if (bucket.type !== 'main') return '';
  const mainDevice = normalizeMainDevice(bucket, 'main');
  const rating = text(bucket.breakerA);
  if (mainDevice === 'breaker') {
    if (options.short) return rating ? `BKR ${rating}A` : 'BKR';
    return rating ? `Main Breaker ${rating}A` : 'Main Breaker';
  }
  return options.short ? 'MLO' : 'Main Lug Only (MLO)';
}

export function mccBusPlatingLabel(spec = {}) {
  const normalized = normalizeMccSpecRequirements(spec);
  if (normalized.busPlating === 'other') {
    return text(normalized.busPlatingOther, 'other');
  }
  return normalized.busPlating;
}

export function normalizeMccSpecRequirements(spec = {}) {
  const source = spec && typeof spec === 'object' ? spec : {};
  const busMaterial = text(source.busMaterial, DEFAULT_MCC_SPEC_REQUIREMENTS.busMaterial).toLowerCase();
  const rawBusPlating = text(source.busPlating, DEFAULT_MCC_SPEC_REQUIREMENTS.busPlating);
  const busPlating = rawBusPlating.toLowerCase().replace(/\s+/g, '-');
  const communicationProtocol = text(source.communicationProtocol, DEFAULT_MCC_SPEC_REQUIREMENTS.communicationProtocol).toLowerCase();
  const incomingLinePower = choiceValue(source.incomingLinePower, MCC_INCOMING_LINE_POWER_TYPES, DEFAULT_MCC_SPEC_REQUIREMENTS.incomingLinePower);
  const groundBusRequired = choiceValue(source.groundBusRequired, MCC_GROUND_BUS_REQUIRED_TYPES, DEFAULT_MCC_SPEC_REQUIREMENTS.groundBusRequired);
  const busPlatingIsStandard = MCC_BUS_PLATING_TYPES.includes(busPlating);
  return {
    busMaterial: MCC_BUS_MATERIAL_TYPES.includes(busMaterial) ? busMaterial : DEFAULT_MCC_SPEC_REQUIREMENTS.busMaterial,
    busPlating: busPlatingIsStandard ? busPlating : 'other',
    busPlatingOther: busPlatingIsStandard
      ? text(source.busPlatingOther, DEFAULT_MCC_SPEC_REQUIREMENTS.busPlatingOther)
      : text(source.busPlatingOther, rawBusPlating),
    shortCircuitRatingKa: nonNegativeNumber(source.shortCircuitRatingKa, DEFAULT_MCC_SPEC_REQUIREMENTS.shortCircuitRatingKa),
    incomingLinePower,
    incomingLinePowerOther: incomingLinePower === 'other'
      ? text(source.incomingLinePowerOther, DEFAULT_MCC_SPEC_REQUIREMENTS.incomingLinePowerOther)
      : text(source.incomingLinePowerOther, DEFAULT_MCC_SPEC_REQUIREMENTS.incomingLinePowerOther),
    spaceHeaterRequired: booleanValue(source.spaceHeaterRequired, DEFAULT_MCC_SPEC_REQUIREMENTS.spaceHeaterRequired),
    spaceHeaterVoltage: text(source.spaceHeaterVoltage, DEFAULT_MCC_SPEC_REQUIREMENTS.spaceHeaterVoltage),
    spaceHeaterAccessories: normalizeMultiChoice(source.spaceHeaterAccessories, MCC_SPACE_HEATER_ACCESSORY_TYPES),
    communicationProtocol: MCC_COMMUNICATION_PROTOCOL_TYPES.includes(communicationProtocol)
      ? communicationProtocol
      : DEFAULT_MCC_SPEC_REQUIREMENTS.communicationProtocol,
    controlVoltage: text(source.controlVoltage, DEFAULT_MCC_SPEC_REQUIREMENTS.controlVoltage),
    enclosureRating: choiceValue(source.enclosureRating, MCC_ENCLOSURE_TYPES, DEFAULT_MCC_SPEC_REQUIREMENTS.enclosureRating),
    mccArrangement: choiceValue(source.mccArrangement, MCC_ARRANGEMENT_TYPES, DEFAULT_MCC_SPEC_REQUIREMENTS.mccArrangement),
    expansionCoverPlates: choiceValue(source.expansionCoverPlates, MCC_EXPANSION_COVER_PLATE_TYPES, DEFAULT_MCC_SPEC_REQUIREMENTS.expansionCoverPlates),
    busJoinPlating: choiceValue(source.busJoinPlating, MCC_BUS_JOIN_PLATING_TYPES, DEFAULT_MCC_SPEC_REQUIREMENTS.busJoinPlating),
    groundBusRequired,
    groundBusLocation: groundBusRequired === 'yes'
      ? choiceValue(source.groundBusLocation, MCC_GROUND_BUS_LOCATION_TYPES, DEFAULT_MCC_SPEC_REQUIREMENTS.groundBusLocation)
      : choiceValue(source.groundBusLocation, MCC_GROUND_BUS_LOCATION_TYPES, DEFAULT_MCC_SPEC_REQUIREMENTS.groundBusLocation),
    motorProtectionDevice: choiceValue(source.motorProtectionDevice, MCC_MOTOR_PROTECTION_DEVICE_TYPES, DEFAULT_MCC_SPEC_REQUIREMENTS.motorProtectionDevice),
    finish: text(source.finish, DEFAULT_MCC_SPEC_REQUIREMENTS.finish),
    notes: text(source.notes, DEFAULT_MCC_SPEC_REQUIREMENTS.notes)
  };
}

export function normalizeMccReportTitleBlock(report = {}) {
  const source = report && typeof report === 'object' ? report : {};
  return {
    projectName: text(source.projectName, DEFAULT_MCC_REPORT_TITLE_BLOCK.projectName),
    client: text(source.client, DEFAULT_MCC_REPORT_TITLE_BLOCK.client),
    drawingNumber: text(source.drawingNumber, DEFAULT_MCC_REPORT_TITLE_BLOCK.drawingNumber),
    revision: text(source.revision, DEFAULT_MCC_REPORT_TITLE_BLOCK.revision),
    preparedBy: text(source.preparedBy, DEFAULT_MCC_REPORT_TITLE_BLOCK.preparedBy),
    checkedBy: text(source.checkedBy, DEFAULT_MCC_REPORT_TITLE_BLOCK.checkedBy),
    reportDate: text(source.reportDate, DEFAULT_MCC_REPORT_TITLE_BLOCK.reportDate)
  };
}

export function mccSpecSummary(spec = {}) {
  const normalized = normalizeMccSpecRequirements(spec);
  const protocol = normalized.communicationProtocol === 'none' ? 'no comms' : normalized.communicationProtocol;
  const incomingLinePower = normalized.incomingLinePower === 'other'
    ? text(normalized.incomingLinePowerOther, 'other')
    : specChoiceLabel(normalized.incomingLinePower);
  const heaterAccessories = normalized.spaceHeaterAccessories.length
    ? `space heater accessories: ${normalized.spaceHeaterAccessories.map(specChoiceLabel).join(' / ')}`
    : '';
  const groundBus = normalized.groundBusRequired === 'yes'
    ? `ground bus at ${specChoiceLabel(normalized.groundBusLocation)}`
    : 'ground bus not required';
  return [
    `${normalized.busMaterial} bus`,
    `${mccBusPlatingLabel(normalized)} bus plating`,
    `${normalized.shortCircuitRatingKa} kA SCCR`,
    `incoming line power ${incomingLinePower}`,
    `${normalized.enclosureRating} enclosure`,
    `${specChoiceLabel(normalized.mccArrangement)} arrangement`,
    `${specChoiceLabel(normalized.expansionCoverPlates)} expansion cover plate`,
    normalized.spaceHeaterRequired ? 'space heater required' : 'space heater not required',
    heaterAccessories,
    protocol,
    `${specChoiceLabel(normalized.busJoinPlating)} bus join plating`,
    groundBus,
    `${specChoiceLabel(normalized.motorProtectionDevice)} motor protection`
  ].filter(Boolean).join(', ');
}

export function createDefaultMccLineup(index = 0) {
  const number = index + 1;
  return normalizeMccLineup({
    id: createMccUniqueId('mcc'),
    tag: `MCC-${number}`,
    name: `MCC Lineup ${number}`,
    equipmentTag: '',
    voltage: '480V',
    busRatingA: DEFAULT_MCC_HORIZONTAL_BUS_RATING_A,
    horizontalBusRatingA: DEFAULT_MCC_HORIZONTAL_BUS_RATING_A,
    verticalBusRatingA: DEFAULT_MCC_VERTICAL_BUS_RATING_A,
    unitHeightIn: DEFAULT_MCC_UNIT_HEIGHT_IN,
    sectionHeightIn: DEFAULT_MCC_SECTION_HEIGHT_IN,
    topHorizontalWirewayHeightIn: DEFAULT_MCC_TOP_HORIZONTAL_WIREWAY_HEIGHT_IN,
    bottomHorizontalWirewayHeightIn: DEFAULT_MCC_BOTTOM_HORIZONTAL_WIREWAY_HEIGHT_IN,
    usableBucketHeightIn: DEFAULT_MCC_USABLE_BUCKET_HEIGHT_IN,
    sectionDepthIn: DEFAULT_MCC_SECTION_DEPTH_IN,
    arrangement: 'MCC Room',
    specRequirements: DEFAULT_MCC_SPEC_REQUIREMENTS,
    sections: [
      {
        id: createMccUniqueId('mcc-sec'),
        name: 'Main',
        widthIn: DEFAULT_MCC_SECTION_WIDTH_IN,
        verticalWirewayWidthIn: DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN,
        buckets: [
          { id: createMccUniqueId('mcc-bkt'), label: 'MAIN', type: 'main', status: 'active', mainDevice: 'breaker', sizeUnits: 3, equipmentTag: 'MAIN', equipmentDescription: 'Incoming Main', loadTag: 'MAIN', breakerA: 1600 },
          { id: createMccUniqueId('mcc-bkt'), label: 'SPARE', type: 'spare', status: 'spare', sizeUnits: 1 }
        ]
      },
      {
        id: createMccUniqueId('mcc-sec'),
        name: 'Section 2',
        widthIn: DEFAULT_MCC_SECTION_WIDTH_IN,
        verticalWirewayWidthIn: DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN,
        buckets: [
          { id: createMccUniqueId('mcc-bkt'), label: 'P-101', type: 'starter', status: 'active', sizeUnits: 1, equipmentTag: 'P-101', equipmentDescription: 'Process Pump P-101', loadTag: 'P-101', hp: 25, breakerA: 60, starterType: 'fvnr', starterSize: 'NEMA 2', motorSpaceHeaterRequired: true, motorSpaceHeaterVa: 250 },
          { id: createMccUniqueId('mcc-bkt'), label: 'FAN-102', type: 'starter', status: 'active', sizeUnits: 1, equipmentTag: 'FAN-102', equipmentDescription: 'Ventilation Fan 102', loadTag: 'FAN-102', hp: 15, breakerA: 40, starterType: 'fvr', starterSize: 'NEMA 1' },
          { id: createMccUniqueId('mcc-bkt'), label: 'SPACE', type: 'space', status: 'space', sizeUnits: 0.5 }
        ]
      }
    ]
  });
}

export function normalizeBucket(bucket = {}, unitHeightIn = DEFAULT_MCC_UNIT_HEIGHT_IN, index = 0) {
  const sizeUnits = finiteNumber(bucket.sizeUnits, Number.NaN);
  const heightIn = finiteNumber(bucket.heightIn, Number.NaN);
  const normalizedUnits = Number.isFinite(sizeUnits)
    ? Math.max(0.25, sizeUnits)
    : bucketUnitsFromHeight(heightIn, unitHeightIn);
  const normalizedHeight = Number.isFinite(heightIn)
    ? Math.max(1, heightIn)
    : bucketHeightFromUnits(normalizedUnits, unitHeightIn);
  const normalizedBucketType = normalizeBucketType(bucket);
  const type = normalizedBucketType.type;
  const status = MCC_BUCKET_STATUSES.includes(bucket.status) ? bucket.status : (type === 'space' ? 'space' : (type === 'spare' ? 'spare' : 'active'));
  const equipmentTag = text(bucket.equipmentTag, bucket.loadTag || '');
  const starterType = text(bucket.starterType).toLowerCase().replace(/[\s_]+/g, '-');
  const motorSpaceHeaterRequired = booleanValue(bucket.motorSpaceHeaterRequired, false);

  return {
    id: bucket.id || createMccUniqueId('mcc-bkt'),
    label: text(bucket.label, status === 'active' ? `Bucket ${index + 1}` : status.toUpperCase()),
    type,
    mainDevice: normalizeMainDevice(bucket, type, normalizedBucketType.mainDevice),
    status,
    sizeUnits: round(normalizedUnits, 2),
    heightIn: round(normalizedHeight, 2),
    equipmentTag,
    equipmentDescription: text(bucket.equipmentDescription, bucket.description || ''),
    loadTag: text(bucket.loadTag, equipmentTag),
    hp: text(bucket.hp),
    breakerA: text(bucket.breakerA),
    starterType: MCC_STARTER_TYPES.includes(starterType) ? starterType : '',
    starterSize: text(bucket.starterSize),
    motorSpaceHeaterRequired,
    motorSpaceHeaterVa: text(bucket.motorSpaceHeaterVa ?? bucket.motorSpaceHeaterVA ?? bucket.spaceHeaterVa ?? bucket.spaceHeaterVA),
    cableTag: text(bucket.cableTag),
    notes: text(bucket.notes)
  };
}

export function normalizeSection(section = {}, unitHeightIn = DEFAULT_MCC_UNIT_HEIGHT_IN, index = 0) {
  return {
    id: section.id || createMccUniqueId('mcc-sec'),
    name: text(section.name, `Section ${index + 1}`),
    widthIn: positiveNumber(section.widthIn, DEFAULT_MCC_SECTION_WIDTH_IN, 6),
    verticalWirewayWidthIn: nonNegativeNumber(section.verticalWirewayWidthIn, DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN),
    buckets: Array.isArray(section.buckets)
      ? section.buckets.map((bucket, bucketIndex) => normalizeBucket(bucket, unitHeightIn, bucketIndex))
      : []
  };
}

export function normalizeMccLineup(lineup = {}, index = 0) {
  const unitHeightIn = positiveNumber(lineup.unitHeightIn, DEFAULT_MCC_UNIT_HEIGHT_IN, 1);
  const sectionHeightIn = positiveNumber(lineup.sectionHeightIn, DEFAULT_MCC_SECTION_HEIGHT_IN, 12);
  const rawUsableBucketHeightIn = positiveNumber(lineup.usableBucketHeightIn, DEFAULT_MCC_USABLE_BUCKET_HEIGHT_IN, 6);
  const derivedHorizontalWirewayHeightIn = Math.max(0, round((sectionHeightIn - rawUsableBucketHeightIn) / 2, 2));
  const horizontalWirewayFallback = derivedHorizontalWirewayHeightIn > 0
    ? derivedHorizontalWirewayHeightIn
    : DEFAULT_MCC_TOP_HORIZONTAL_WIREWAY_HEIGHT_IN;
  const topHorizontalWirewayHeightIn = nonNegativeNumber(lineup.topHorizontalWirewayHeightIn, horizontalWirewayFallback);
  const bottomHorizontalWirewayHeightIn = nonNegativeNumber(lineup.bottomHorizontalWirewayHeightIn, horizontalWirewayFallback);
  const usableBucketHeightIn = positiveNumber(
    lineup.usableBucketHeightIn,
    Math.max(6, sectionHeightIn - topHorizontalWirewayHeightIn - bottomHorizontalWirewayHeightIn),
    6
  );
  const horizontalBusRatingA = positiveNumber(
    lineup.horizontalBusRatingA ?? lineup.busRatingA,
    DEFAULT_MCC_HORIZONTAL_BUS_RATING_A,
    1
  );
  const tag = text(lineup.tag, `MCC-${index + 1}`);
  const hasEquipmentTag = Object.prototype.hasOwnProperty.call(lineup, 'equipmentTag');
  const specRequirements = normalizeMccSpecRequirements(lineup.specRequirements || lineup.specificationRequirements || lineup.specification || {});
  const reportTitleBlock = normalizeMccReportTitleBlock(lineup.reportTitleBlock || lineup.titleBlock || {});
  const sections = Array.isArray(lineup.sections)
    ? lineup.sections.map((section, sectionIndex) => normalizeSection(section, unitHeightIn, sectionIndex))
    : [];

  return {
    id: lineup.id || createMccUniqueId('mcc'),
    tag,
    name: text(lineup.name, tag),
    equipmentTag: hasEquipmentTag ? text(lineup.equipmentTag) : tag,
    voltage: text(lineup.voltage, '480V'),
    busRatingA: horizontalBusRatingA,
    horizontalBusRatingA,
    verticalBusRatingA: positiveNumber(lineup.verticalBusRatingA, DEFAULT_MCC_VERTICAL_BUS_RATING_A, 1),
    unitHeightIn,
    sectionHeightIn,
    topHorizontalWirewayHeightIn,
    bottomHorizontalWirewayHeightIn,
    usableBucketHeightIn,
    sectionDepthIn: positiveNumber(lineup.sectionDepthIn, DEFAULT_MCC_SECTION_DEPTH_IN, 6),
    arrangement: text(lineup.arrangement, ''),
    specRequirements,
    reportTitleBlock,
    sections
  };
}

export function normalizeMccLineups(lineups = []) {
  return Array.isArray(lineups)
    ? lineups.map((lineup, index) => normalizeMccLineup(lineup, index))
    : [];
}

export function mccLineupDimensions(lineup) {
  const normalized = normalizeMccLineup(lineup);
  const totalWidthIn = normalized.sections.reduce((sum, section) => sum + section.widthIn, 0);
  const bucketCount = normalized.sections.reduce((sum, section) => sum + section.buckets.length, 0);
  const spareBucketCount = normalized.sections.reduce((sum, section) => (
    sum + section.buckets.filter(bucket => bucket.status === 'spare' || bucket.status === 'space').length
  ), 0);
  return {
    totalWidthIn: round(totalWidthIn, 2),
    totalWidthFt: round(totalWidthIn / 12, 2),
    depthIn: round(normalized.sectionDepthIn, 2),
    depthFt: round(normalized.sectionDepthIn / 12, 2),
    heightIn: round(normalized.sectionHeightIn, 2),
    heightFt: round(normalized.sectionHeightIn / 12, 2),
    sectionCount: normalized.sections.length,
    bucketCount,
    spareBucketCount
  };
}

export function validateMccLineup(lineup) {
  const normalized = normalizeMccLineup(lineup);
  const messages = [];
  if (!normalized.tag) {
    messages.push({ severity: 'error', message: 'Lineup tag is required.' });
  }
  if (!normalized.sections.length) {
    messages.push({ severity: 'error', message: 'Add at least one MCC section.' });
  }
  if (normalized.usableBucketHeightIn > normalized.sectionHeightIn) {
    messages.push({ severity: 'error', message: 'Usable bucket height cannot exceed section height.' });
  }
  const requiredSectionHeight = normalized.topHorizontalWirewayHeightIn
    + normalized.usableBucketHeightIn
    + normalized.bottomHorizontalWirewayHeightIn;
  if (requiredSectionHeight > normalized.sectionHeightIn + 0.001) {
    messages.push({
      severity: 'error',
      message: `Top/bottom horizontal wireways plus bucket stack use ${round(requiredSectionHeight, 1)} in of ${round(normalized.sectionHeightIn, 1)} in section height.`
    });
  }
  normalized.sections.forEach(section => {
    if (!section.buckets.length) {
      messages.push({ severity: 'warning', sectionId: section.id, message: `${section.name} has no buckets.` });
    }
    const bucketColumnWidth = section.widthIn - section.verticalWirewayWidthIn;
    if (section.verticalWirewayWidthIn >= section.widthIn) {
      messages.push({
        severity: 'error',
        sectionId: section.id,
        message: `${section.name} vertical wireway width must be smaller than the section width.`
      });
    } else if (bucketColumnWidth < 6) {
      messages.push({
        severity: 'warning',
        sectionId: section.id,
        message: `${section.name} has only ${round(bucketColumnWidth, 1)} in left for buckets after the vertical wireway.`
      });
    }
    const usedHeight = section.buckets.reduce((sum, bucket) => sum + bucket.heightIn, 0);
    if (usedHeight > normalized.usableBucketHeightIn + 0.001) {
      messages.push({
        severity: 'error',
        sectionId: section.id,
        message: `${section.name} uses ${round(usedHeight, 1)} in of ${round(normalized.usableBucketHeightIn, 1)} in bucket space.`
      });
    }
    section.buckets.forEach(bucket => {
      const expectedHeight = bucketHeightFromUnits(bucket.sizeUnits, normalized.unitHeightIn);
      const bucketName = bucket.equipmentTag || bucket.loadTag || bucket.label;
      if (Math.abs(expectedHeight - bucket.heightIn) > 0.05) {
        messages.push({
          severity: 'warning',
          sectionId: section.id,
          bucketId: bucket.id,
          message: `${section.name} ${bucketName} has unit and inch sizes that do not match.`
        });
      }
      if (bucket.status === 'active' && !bucket.equipmentTag && bucket.type !== 'main') {
        messages.push({
          severity: 'warning',
          sectionId: section.id,
          bucketId: bucket.id,
          message: `${section.name} ${bucketName} is active but has no equipment tag.`
        });
      }
      if (bucket.type === 'main' && bucket.mainDevice === 'breaker' && !bucket.breakerA) {
        messages.push({
          severity: 'warning',
          sectionId: section.id,
          bucketId: bucket.id,
          message: `${section.name} ${bucketName} is set as a main breaker but has no breaker rating.`
        });
      }
      if (bucket.motorSpaceHeaterRequired && !bucket.motorSpaceHeaterVa) {
        messages.push({
          severity: 'warning',
          sectionId: section.id,
          bucketId: bucket.id,
          message: `${section.name} ${bucketName} requires a motor space heater feed but has no VA rating.`
        });
      }
    });
  });
  return messages;
}

export function mccLineupEquipmentSummary(lineup) {
  const normalized = normalizeMccLineup(lineup);
  const dimensions = mccLineupDimensions(normalized);
  return {
    id: normalized.equipmentTag || normalized.tag,
    ref: normalized.equipmentTag || normalized.tag,
    tag: normalized.equipmentTag || normalized.tag,
    description: normalized.name,
    voltage: normalized.voltage,
    category: 'Electrical Distribution',
    subCategory: 'MCC',
    arrangement: normalized.arrangement,
    width: String(dimensions.totalWidthFt),
    depth: String(dimensions.depthFt),
    height: String(dimensions.heightFt),
    lineup: normalized.tag,
    notes: `${dimensions.sectionCount} sections, ${dimensions.bucketCount} buckets, ${normalized.horizontalBusRatingA} A horizontal bus, ${normalized.verticalBusRatingA} A vertical bus, ${mccSpecSummary(normalized.specRequirements)}`
  };
}

export function syncMccLineupsToEquipment(equipment = [], lineups = []) {
  const next = Array.isArray(equipment) ? equipment.map(item => ({ ...item })) : [];
  normalizeMccLineups(lineups).forEach(lineup => {
    const summary = mccLineupEquipmentSummary(lineup);
    const target = String(lineup.equipmentTag || '').trim();
    if (!target) return;
    const index = next.findIndex(item => [item.tag, item.ref, item.id].some(value => String(value || '').trim() === target));
    if (index === -1) {
      next.push(summary);
    } else {
      next[index] = {
        ...next[index],
        category: summary.category,
        subCategory: summary.subCategory,
        voltage: summary.voltage,
        width: summary.width,
        depth: summary.depth,
        height: summary.height,
        arrangement: summary.arrangement,
        lineup: summary.lineup
      };
      if (!next[index].description) next[index].description = summary.description;
      if (!next[index].id) next[index].id = summary.id;
      if (!next[index].ref) next[index].ref = summary.ref;
      if (!next[index].tag) next[index].tag = summary.tag;
    }
  });
  return next;
}

function bucketClass(bucket) {
  if (bucket.status === 'space') return 'mcc-bucket mcc-bucket-space';
  if (bucket.status === 'spare') return 'mcc-bucket mcc-bucket-spare';
  if (bucket.type === 'main') return 'mcc-bucket mcc-bucket-main';
  return 'mcc-bucket';
}

function selectedBucketDetails(lineup, selectedBucketId) {
  const targetId = String(selectedBucketId || '');
  if (!targetId) return null;
  for (let sectionIndex = 0; sectionIndex < lineup.sections.length; sectionIndex += 1) {
    const section = lineup.sections[sectionIndex];
    let usedHeightIn = 0;
    for (let bucketIndex = 0; bucketIndex < section.buckets.length; bucketIndex += 1) {
      const bucket = section.buckets[bucketIndex];
      const positionLabel = mccBucketPositionLabel(usedHeightIn, bucket, lineup.unitHeightIn);
      if (String(bucket.id) === targetId) {
        return {
          ...bucket,
          sectionName: section.name,
          sectionIndex,
          bucketIndex,
          positionLabel,
          sectionPositionLabel: `${sectionIndex + 1}${positionLabel}`
        };
      }
      usedHeightIn += bucket.heightIn;
    }
  }
  return null;
}

function bucketDisplayName(bucket) {
  return bucket.equipmentTag || bucket.loadTag || bucket.label;
}

export function mccStarterTypeLabel(bucket = {}) {
  const labels = {
    fvnr: 'FVNR',
    fvr: 'FVR',
    'soft-starter': 'Soft Starter',
    'wye-delta': 'Wye-Delta',
    'two-speed': 'Two-Speed',
    'reduced-voltage-autotransformer': 'RV Auto',
    other: 'Other'
  };
  return labels[bucket.starterType] || '';
}

export function mccStarterTypeSizeLabel(bucket = {}) {
  const starterType = mccStarterTypeLabel(bucket);
  const starterSize = text(bucket.starterSize).replace(/^NEMA\s+/i, '');
  if (starterType && starterSize) return `${starterType}-${starterSize}`;
  return starterType || starterSize;
}

export function mccBreakerAtAfLabel(bucket = {}) {
  const raw = text(bucket.breakerA);
  if (!raw) return '';
  if (/\b(?:AT|AF)\b/i.test(raw)) return raw;
  const ratings = raw.match(/\d+(?:\.\d+)?/g) || [];
  if (ratings.length >= 2) return `${ratings[0]}AT/${ratings[1]}AF`;
  if (ratings.length === 1) return `${ratings[0]}AT`;
  return raw;
}

export function mccOneLineDeviceKind(bucket = {}) {
  if (bucket.status === 'space' || bucket.type === 'space') return 'space';
  if (bucket.status === 'spare' || bucket.type === 'spare') return 'spare';
  if (bucket.type === 'vfd') return 'vfd';
  if (bucket.type === 'starter') return 'starter';
  if (bucket.type === 'main' || bucket.type === 'breaker' || bucket.type === 'feeder') return 'breaker';
  return 'load';
}

function mccOneLineDeviceLabel(bucket = {}) {
  const kind = mccOneLineDeviceKind(bucket);
  if (kind === 'starter') return mccStarterTypeLabel(bucket) || 'Starter';
  if (kind === 'vfd') return 'VFD';
  if (kind === 'breaker') return mccMainDeviceLabel(bucket, { short: true }) || 'CB';
  if (kind === 'space') return 'Space';
  if (kind === 'spare') return 'Spare';
  return bucket.type || 'Load';
}

function mccOneLineDeviceMeta(bucket = {}) {
  const kind = mccOneLineDeviceKind(bucket);
  if (kind === 'starter') return mccStarterTypeSizeLabel(bucket) || 'Starter';
  if (kind === 'spare') return mccBreakerAtAfLabel(bucket) || 'Spare';
  if (kind === 'breaker') return mccMainDeviceLabel(bucket, { short: true }) || mccBreakerAtAfLabel(bucket) || 'CB';
  if (kind === 'vfd') return mccBreakerAtAfLabel(bucket) || 'VFD';
  if (kind === 'space') return 'Space';
  return mccBreakerAtAfLabel(bucket) || bucket.type || '';
}

function svgStyle() {
  return [
    'svg{font-family:Arial,sans-serif;background:#f8fbff;}',
    '.mcc-title{fill:#111827;font-size:16px;font-weight:700;}',
    '.mcc-subtitle,.mcc-axis{fill:#4b5563;font-size:11px;}',
    '.mcc-section{fill:#e7eef8;stroke:#334155;stroke-width:1.5;}',
    '.mcc-section-name{fill:#111827;font-size:11px;font-weight:700;}',
    '.mcc-bus{stroke:#dc2626;stroke-width:5;stroke-linecap:round;}',
    '.mcc-vertical-bus{stroke:#dc2626;stroke-width:3;stroke-linecap:round;}',
    '.mcc-horizontal-wireway{fill:#fef3c7;stroke:#d97706;stroke-width:1;opacity:0.95;}',
    '.mcc-wireway{fill:#dbeafe;stroke:#2563eb;stroke-width:1;opacity:0.95;}',
    '.mcc-wireway-label{fill:#1e3a8a;font-size:8px;font-weight:700;}',
    '.mcc-bucket-node{cursor:pointer;outline:none;}',
    '.mcc-bucket-node-dragging{opacity:.62;}',
    '.mcc-canvas-drop-target .mcc-bucket,.mcc-canvas-drop-target .mcc-bucket-main,.mcc-canvas-drop-target .mcc-bucket-spare,.mcc-canvas-drop-target .mcc-bucket-space{stroke:#22c55e;stroke-width:3;filter:drop-shadow(0 1px 3px rgba(21,128,61,.35));}',
    '.mcc-bucket{fill:#267acf;stroke:#0e437a;stroke-width:1;}',
    '.mcc-bucket-main{fill:#475569;stroke:#1e293b;}',
    '.mcc-bucket-spare{fill:#8bb8e8;stroke:#315f96;stroke-dasharray:4 3;}',
    '.mcc-bucket-space{fill:#ffffff;stroke:#64748b;stroke-dasharray:4 3;}',
    '.mcc-bucket-selected{stroke:#f59e0b;stroke-width:3;filter:drop-shadow(0 1px 3px rgba(146,64,14,.35));}',
    '.mcc-bucket-text{fill:#ffffff;font-size:10px;font-weight:700;}',
    '.mcc-bucket-letter-box{fill:#fde047;stroke:#a16207;stroke-width:1;}',
    '.mcc-bucket-letter{fill:#422006;font-size:9px;font-weight:800;}',
    '.mcc-bucket-meta{fill:#ffffff;font-size:9px;}',
    '.mcc-bucket-space+.mcc-bucket-text,.mcc-bucket-space~.mcc-bucket-meta{fill:#334155;}',
    '.mcc-oneline-bus{stroke:#111827;stroke-width:4;stroke-linecap:round;}',
    '.mcc-oneline-node{cursor:pointer;outline:none;}',
    '.mcc-oneline-branch{stroke:#2563eb;stroke-width:2;fill:none;}',
    '.mcc-oneline-branch-space{stroke:#64748b;stroke-dasharray:4 3;}',
    '.mcc-oneline-device{fill:#ffffff;stroke:#2563eb;stroke-width:1.5;}',
    '.mcc-oneline-device-starter{fill:#ecfdf5;stroke:#059669;}',
    '.mcc-oneline-device-vfd{fill:#f5f3ff;stroke:#7c3aed;}',
    '.mcc-oneline-device-breaker{fill:#eff6ff;stroke:#1d4ed8;}',
    '.mcc-oneline-device-space{fill:#f8fafc;stroke:#64748b;stroke-dasharray:4 3;}',
    '.mcc-oneline-device-spare{fill:#f1f5f9;stroke:#64748b;stroke-dasharray:4 3;}',
    '.mcc-oneline-symbol{fill:#111827;font-size:10px;font-weight:800;}',
    '.mcc-oneline-symbol-line{stroke:#111827;stroke-width:1.5;fill:none;stroke-linecap:round;}',
    '.mcc-oneline-symbol-vfd{stroke:#7c3aed;stroke-width:1.6;fill:none;stroke-linecap:round;}',
    '.mcc-oneline-main{fill:#f8fafc;stroke:#111827;stroke-width:1.5;}',
    '.mcc-oneline-main-node{cursor:pointer;outline:none;}',
    '.mcc-oneline-position{fill:#1e3a8a;font-size:9px;font-weight:800;}',
    '.mcc-oneline-label{fill:#111827;font-size:10px;font-weight:700;}',
    '.mcc-oneline-meta{fill:#4b5563;font-size:9px;}',
    '.mcc-oneline-selected .mcc-oneline-branch{stroke:#f59e0b;stroke-width:3;}',
    '.mcc-oneline-selected .mcc-oneline-device{fill:#fffbeb;stroke:#f59e0b;stroke-width:3;}',
    '.mcc-oneline-selected .mcc-oneline-main{fill:#fffbeb;stroke:#f59e0b;stroke-width:3;}',
    '.mcc-oneline-selected .mcc-oneline-label{fill:#92400e;}',
    '.mcc-oneline-selected .mcc-oneline-meta{fill:#92400e;font-weight:700;}',
    '.mcc-oneline-selected-info{fill:#fffbeb;stroke:#f59e0b;stroke-width:1.2;}',
    '.mcc-oneline-selected-info-text{fill:#92400e;font-size:10px;font-weight:700;}',
    '.mcc-oneline-continuation{fill:#1e3a8a;font-size:9px;font-weight:800;letter-spacing:.4px;}',
    '.mcc-oneline-continuation-line{stroke:#1e3a8a;stroke-width:1.2;stroke-dasharray:4 3;fill:none;marker-end:url(#mcc-arrow);}'
  ].join('');
}

export function renderMccElevationSvg(lineup, options = {}) {
  const normalized = normalizeMccLineup(lineup);
  const selectedBucketId = String(options.selectedBucketId || '');
  const dimensions = mccLineupDimensions(normalized);
  const maxWidth = positiveNumber(options.maxWidth, 1000, 420);
  const maxHeight = positiveNumber(options.maxHeight, 430, 260);
  const padding = { left: 48, right: 32, top: 48, bottom: 42 };
  const scale = Math.min(
    6,
    Math.max(1.6, Math.min(
      (maxWidth - padding.left - padding.right) / Math.max(dimensions.totalWidthIn, 1),
      (maxHeight - padding.top - padding.bottom) / Math.max(normalized.sectionHeightIn, 1)
    ))
  );
  const sectionWidths = normalized.sections.map(section => Math.max(110, section.widthIn * scale));
  const lineupDrawWidth = sectionWidths.reduce((sum, sectionWidth) => sum + sectionWidth, 0);
  const width = Math.max(620, Math.ceil(lineupDrawWidth + padding.left + padding.right));
  const height = Math.max(260, Math.ceil(normalized.sectionHeightIn * scale + padding.top + padding.bottom));
  const baseY = height - padding.bottom;
  const sectionTopY = baseY - normalized.sectionHeightIn * scale;
  const topWirewayHeight = normalized.topHorizontalWirewayHeightIn * scale;
  const bottomWirewayHeight = normalized.bottomHorizontalWirewayHeightIn * scale;
  const bucketTopY = sectionTopY + topWirewayHeight;
  const bottomWirewayY = baseY - bottomWirewayHeight;
  const horizontalBusY = sectionTopY + Math.max(8, topWirewayHeight / 2);
  let x = padding.left;
  const parts = [
    `<svg class="mcc-lineup-elevation-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(normalized.tag)} MCC elevation">`,
    `<style>${svgStyle()}</style>`,
    `<text x="${padding.left}" y="24" class="mcc-title">${escapeXml(normalized.tag)} - ${escapeXml(normalized.name)}</text>`,
    `<text x="${width - padding.right}" y="24" text-anchor="end" class="mcc-subtitle">${escapeXml(normalized.voltage)} / H Bus ${escapeXml(normalized.horizontalBusRatingA)}A / V Bus ${escapeXml(normalized.verticalBusRatingA)}A</text>`,
    `<text x="${padding.left}" y="${baseY + 26}" class="mcc-axis">${dimensions.totalWidthIn}" W x ${normalized.sectionDepthIn}" D x ${normalized.sectionHeightIn}" H</text>`
  ];

  normalized.sections.forEach((section, sectionIndex) => {
    const sectionWidth = sectionWidths[sectionIndex] || Math.max(110, section.widthIn * scale);
    const wirewayWidth = Math.max(0, Math.min(sectionWidth - 6, section.verticalWirewayWidthIn * scale));
    const wirewayX = x + sectionWidth - wirewayWidth;
    const bucketColumnWidth = Math.max(10, sectionWidth - wirewayWidth - 8);
    const verticalBusX = wirewayX + Math.max(3, wirewayWidth * 0.28);
    const wirewayLabelX = wirewayX + Math.min(wirewayWidth - 3, Math.max(3, wirewayWidth * 0.72));
    parts.push(`<rect x="${x}" y="${sectionTopY}" width="${sectionWidth}" height="${normalized.sectionHeightIn * scale}" class="mcc-section"></rect>`);
    if (topWirewayHeight > 0) {
      parts.push(`<rect x="${x}" y="${sectionTopY}" width="${sectionWidth}" height="${topWirewayHeight}" class="mcc-horizontal-wireway"></rect>`);
    }
    if (bottomWirewayHeight > 0) {
      parts.push(`<rect x="${x}" y="${bottomWirewayY}" width="${sectionWidth}" height="${bottomWirewayHeight}" class="mcc-horizontal-wireway"></rect>`);
    }
    if (wirewayWidth > 0) {
      parts.push(`<rect x="${wirewayX}" y="${bucketTopY}" width="${wirewayWidth}" height="${normalized.usableBucketHeightIn * scale}" class="mcc-wireway"></rect>`);
      parts.push(`<line x1="${verticalBusX}" y1="${bucketTopY + 4}" x2="${verticalBusX}" y2="${Math.max(bucketTopY + 4, bottomWirewayY - 4)}" class="mcc-vertical-bus"></line>`);
      if (wirewayWidth > 13 && normalized.usableBucketHeightIn * scale > 52) {
        parts.push(`<text x="${wirewayLabelX}" y="${bucketTopY + 46}" text-anchor="middle" transform="rotate(-90 ${wirewayLabelX} ${bucketTopY + 46})" class="mcc-wireway-label">V WIREWAY ${escapeXml(section.verticalWirewayWidthIn)}"</text>`);
      }
    }
    parts.push(`<text x="${x + sectionWidth / 2}" y="${baseY + 15}" text-anchor="middle" class="mcc-section-name">${escapeXml(section.name)}</text>`);
    let bucketY = bucketTopY;
    let usedBucketHeightIn = 0;
    section.buckets.forEach((bucket, bucketIndex) => {
      const isSelected = String(bucket.id) === selectedBucketId;
      const bucketHeight = Math.max(10, bucket.heightIn * scale);
      const positionLabel = mccBucketPositionLabel(usedBucketHeightIn, bucket, normalized.unitHeightIn);
      const letterBoxWidth = Math.max(16, positionLabel.length * 5 + 8);
      const letterBoxHeight = Math.min(16, Math.max(8, bucketHeight - 4));
      const letterBoxX = x + 4 + bucketColumnWidth - letterBoxWidth - 4;
      const letterBoxY = bucketY + Math.max(1, Math.min(4, (bucketHeight - letterBoxHeight) / 2));
      const letterTextX = letterBoxX + letterBoxWidth / 2;
      const letterTextY = letterBoxY + letterBoxHeight / 2 + 3;
      const labelMaxWidth = Math.max(0, letterBoxX - (x + 8) - 4);
      const labelLimit = Math.floor(labelMaxWidth / 6);
      const equipmentTag = bucketDisplayName(bucket);
      const equipmentDescription = bucket.equipmentDescription;
      const label = labelLimit <= 0
        ? ''
        : (equipmentTag.length > labelLimit
          ? (labelLimit < 3 ? equipmentTag.slice(0, labelLimit) : `${equipmentTag.slice(0, labelLimit - 1)}.`)
          : equipmentTag);
      const fullLineLimit = Math.max(5, Math.floor((bucketColumnWidth - 8) / 6));
      const description = equipmentDescription.length > fullLineLimit
        ? `${equipmentDescription.slice(0, Math.max(1, fullLineLimit - 1))}.`
        : equipmentDescription;
      const nodeClass = `mcc-bucket-node${isSelected ? ' mcc-bucket-node-selected' : ''}`;
      const rectClass = `${bucketClass(bucket)}${isSelected ? ' mcc-bucket-selected' : ''}`;
      const nodeLabel = `${section.name} ${equipmentTag} ${equipmentDescription} bucket position ${positionLabel}`;
      parts.push(`<g class="${nodeClass}" data-mcc-bucket-id="${escapeXml(bucket.id)}" data-mcc-section-index="${sectionIndex}" data-mcc-bucket-index="${bucketIndex}" tabindex="0" role="button" aria-label="${escapeXml(nodeLabel)}">`);
      parts.push(`<rect x="${x + 4}" y="${bucketY}" width="${bucketColumnWidth}" height="${bucketHeight}" class="${rectClass}"></rect>`);
      parts.push(`<text x="${x + 8}" y="${bucketY + 13}" class="mcc-bucket-text">${escapeXml(label)}</text>`);
      parts.push(`<rect x="${letterBoxX}" y="${letterBoxY}" width="${letterBoxWidth}" height="${letterBoxHeight}" rx="2" class="mcc-bucket-letter-box"></rect>`);
      parts.push(`<text x="${letterTextX}" y="${letterTextY}" text-anchor="middle" class="mcc-bucket-letter">${escapeXml(positionLabel)}</text>`);
      if (bucketHeight > 24 && description) {
        parts.push(`<text x="${x + 8}" y="${bucketY + 25}" class="mcc-bucket-meta">${escapeXml(description)}</text>`);
      }
      if (bucketHeight > 36) {
        parts.push(`<text x="${x + 8}" y="${bucketY + 37}" class="mcc-bucket-meta">${escapeXml(bucket.sizeUnits)}U / ${escapeXml(bucket.heightIn)}"</text>`);
      }
      if (bucketHeight > 48 && bucket.type === 'main') {
        parts.push(`<text x="${x + 8}" y="${bucketY + 49}" class="mcc-bucket-meta">${escapeXml(mccMainDeviceLabel(bucket, { short: true }))}</text>`);
      }
      parts.push('</g>');
      bucketY += bucketHeight;
      usedBucketHeightIn += bucket.heightIn;
    });
    x += sectionWidth;
  });

  parts.push(`<line x1="${padding.left + 4}" y1="${horizontalBusY}" x2="${padding.left + lineupDrawWidth - 4}" y2="${horizontalBusY}" class="mcc-bus"></line>`);
  parts.push(`<text x="${padding.left + 8}" y="${sectionTopY + Math.max(12, Math.min(topWirewayHeight - 3, 16))}" class="mcc-wireway-label">TOP HORIZONTAL WIREWAY ${escapeXml(normalized.topHorizontalWirewayHeightIn)}"</text>`);
  if (bottomWirewayHeight > 0) {
    parts.push(`<text x="${padding.left + 8}" y="${bottomWirewayY + Math.max(12, Math.min(bottomWirewayHeight - 3, 16))}" class="mcc-wireway-label">BOTTOM HORIZONTAL WIREWAY ${escapeXml(normalized.bottomHorizontalWirewayHeightIn)}"</text>`);
  }
  parts.push(`<text x="${width - padding.right}" y="${sectionTopY + 38}" text-anchor="end" class="mcc-subtitle">Horizontal bus ${escapeXml(normalized.horizontalBusRatingA)}A / vertical bus ${escapeXml(normalized.verticalBusRatingA)}A</text>`);
  parts.push('</svg>');
  return parts.join('');
}

export function renderMccOneLineSvg(lineup, options = {}) {
  const normalized = normalizeMccLineup(lineup);
  const selectedBucketId = String(options.selectedBucketId || '');
  const selectedBucket = selectedBucketDetails(normalized, selectedBucketId);
  const mainBucket = normalized.sections
    .flatMap((section, sectionIndex) => section.buckets.map((bucket, bucketIndex) => ({
      ...bucket,
      sectionName: section.name,
      sectionIndex,
      bucketIndex
    })))
    .find(bucket => bucket.type === 'main');
  const allBuckets = normalized.sections.flatMap((section, sectionIndex) => {
    let usedHeightIn = 0;
    return section.buckets.map((bucket, bucketIndex) => {
      const positionLabel = mccBucketPositionLabel(usedHeightIn, bucket, normalized.unitHeightIn);
      usedHeightIn += bucket.heightIn;
      return {
        ...bucket,
        sectionName: section.name,
        sectionIndex,
        bucketIndex,
        positionLabel,
        sectionPositionLabel: `${sectionIndex + 1}${positionLabel}`
      };
    }).filter(bucket => bucket.type !== 'main');
  });
  const branchStartIndex = Math.max(0, Math.floor(Number.parseFloat(options.branchStartIndex) || 0));
  const requestedBranchLimit = Number.parseFloat(options.branchLimit);
  const branchLimit = Number.isFinite(requestedBranchLimit) && requestedBranchLimit > 0
    ? Math.floor(requestedBranchLimit)
    : allBuckets.length;
  const buckets = allBuckets.slice(branchStartIndex, branchStartIndex + branchLimit);
  const branchCount = Math.max(1, buckets.length);
  const spacing = positiveNumber(options.spacing, 82, 54);
  const fixedWidth = Number.parseFloat(options.fixedWidth);
  const width = Number.isFinite(fixedWidth) && fixedWidth > 0
    ? Math.max(620, fixedWidth)
    : Math.max(620, 140 + branchCount * spacing);
  const height = 230;
  const busY = 76;
  const firstX = 104;
  const continuedAbove = Boolean(options.continuedAbove);
  const continuedBelow = Boolean(options.continuedBelow);
  const mainSelected = mainBucket && String(mainBucket.id) === selectedBucketId;
  const mainNodeClass = `mcc-oneline-main-node${mainSelected ? ' mcc-oneline-selected' : ''}`;
  const mainNodeAttrs = mainBucket
    ? ` data-mcc-bucket-id="${escapeXml(mainBucket.id)}" tabindex="0" role="button" aria-label="${escapeXml(`${mainBucket.sectionName} main one-line device`)}"`
    : '';
  const mainMeta = mainBucket ? mccMainDeviceLabel(mainBucket, { short: true }) : '';
  const parts = [
    `<svg class="mcc-lineup-oneline-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(normalized.tag)} MCC one-line">`,
    `<style>${svgStyle()}</style>`,
    '<defs><marker id="mcc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L6,3 z" fill="#1e3a8a"></path></marker></defs>',
    `<text x="24" y="28" class="mcc-title">${escapeXml(normalized.tag)} Simple One-Line</text>`,
    continuedAbove ? '<text x="24" y="48" class="mcc-oneline-continuation">CONT\'D ABOVE</text>' : '',
    continuedBelow ? `<text x="${width - 116}" y="48" class="mcc-oneline-continuation">CONT'D BELOW</text>` : '',
    continuedAbove ? `<line x1="24" y1="54" x2="88" y2="54" class="mcc-oneline-continuation-line"></line>` : '',
    continuedBelow ? `<line x1="${width - 40}" y1="54" x2="${width - 104}" y2="54" class="mcc-oneline-continuation-line"></line>` : '',
    `<line x1="${firstX}" y1="${busY}" x2="${width - 40}" y2="${busY}" class="mcc-oneline-bus"></line>`,
    `<g class="${mainNodeClass}"${mainNodeAttrs}>`,
    `<line x1="44" y1="${busY}" x2="${firstX}" y2="${busY}" class="mcc-oneline-branch"></line>`,
    `<rect x="22" y="${busY - 17}" width="46" height="34" rx="4" class="mcc-oneline-main"></rect>`,
    `<text x="45" y="${busY + 4}" text-anchor="middle" class="mcc-oneline-label">MAIN</text>`,
    mainMeta ? `<text x="45" y="${busY + 34}" text-anchor="middle" class="mcc-oneline-meta">${escapeXml(mainMeta)}</text>` : '',
    '</g>'
  ];

  buckets.forEach((bucket, index) => {
    const isSelected = String(bucket.id) === selectedBucketId;
    const x = firstX + index * spacing;
    const deviceY = 118;
    const label = bucketDisplayName(bucket);
    const deviceKind = mccOneLineDeviceKind(bucket);
    const deviceLabel = mccOneLineDeviceLabel(bucket);
    const branchClass = `mcc-oneline-branch${deviceKind === 'space' ? ' mcc-oneline-branch-space' : ''}`;
    const deviceClass = `mcc-oneline-device mcc-oneline-device-${deviceKind}`;
    const nodeClass = `mcc-oneline-node${isSelected ? ' mcc-oneline-selected' : ''}`;
    const nodeLabel = `${bucket.sectionName} ${label || deviceLabel} ${deviceLabel} one-line device`;
    parts.push(`<g class="${nodeClass}" data-mcc-bucket-id="${escapeXml(bucket.id)}" tabindex="0" role="button" aria-label="${escapeXml(nodeLabel)}">`);
    parts.push(`<line x1="${x}" y1="${busY}" x2="${x}" y2="${deviceY}" class="${branchClass}"></line>`);
    parts.push(`<text x="${x + 7}" y="${busY + 16}" class="mcc-oneline-position">${escapeXml(bucket.sectionPositionLabel)}</text>`);
    parts.push(`<rect x="${x - 20}" y="${deviceY}" width="40" height="28" rx="4" class="${deviceClass}"></rect>`);
    if (deviceKind === 'starter') {
      parts.push(`<circle cx="${x}" cy="${deviceY + 14}" r="8" class="mcc-oneline-symbol-line"></circle>`);
      parts.push(`<text x="${x}" y="${deviceY + 18}" text-anchor="middle" class="mcc-oneline-symbol">M</text>`);
    } else if (deviceKind === 'vfd') {
      parts.push(`<path d="M ${x - 12} ${deviceY + 17} C ${x - 8} ${deviceY + 7}, ${x - 2} ${deviceY + 7}, ${x + 2} ${deviceY + 17} S ${x + 10} ${deviceY + 27}, ${x + 14} ${deviceY + 17}" class="mcc-oneline-symbol-vfd"></path>`);
    } else if (deviceKind === 'breaker') {
      parts.push(`<line x1="${x - 11}" y1="${deviceY + 20}" x2="${x + 11}" y2="${deviceY + 8}" class="mcc-oneline-symbol-line"></line>`);
      parts.push(`<circle cx="${x - 12}" cy="${deviceY + 21}" r="2" class="mcc-oneline-symbol-line"></circle>`);
      parts.push(`<circle cx="${x + 12}" cy="${deviceY + 7}" r="2" class="mcc-oneline-symbol-line"></circle>`);
    } else if (deviceKind === 'space' || deviceKind === 'spare') {
      parts.push(`<text x="${x}" y="${deviceY + 18}" text-anchor="middle" class="mcc-oneline-symbol">${deviceKind === 'space' ? 'SPC' : 'SPR'}</text>`);
    }
    parts.push(`<line x1="${x}" y1="${deviceY + 28}" x2="${x}" y2="${deviceY + 52}" class="${branchClass}"></line>`);
    parts.push(`<text x="${x}" y="${deviceY + 70}" text-anchor="middle" class="mcc-oneline-label">${escapeXml(label || deviceLabel)}</text>`);
    parts.push(`<text x="${x}" y="${deviceY + 84}" text-anchor="middle" class="mcc-oneline-meta">${escapeXml(mccOneLineDeviceMeta(bucket))}</text>`);
    parts.push('</g>');
  });

  if (selectedBucket) {
    const selectedMainDeviceLabel = mccMainDeviceLabel(selectedBucket);
    const details = [
      `Selected Bucket: ${selectedBucket.sectionName}`,
      bucketDisplayName(selectedBucket),
      selectedBucket.equipmentDescription,
      mccOneLineDeviceLabel(selectedBucket),
      selectedMainDeviceLabel,
      !selectedMainDeviceLabel && selectedBucket.breakerA ? `${selectedBucket.breakerA}A` : '',
      selectedBucket.cableTag ? `Cable ${selectedBucket.cableTag}` : ''
    ].filter(Boolean).join(' / ');
    parts.push(`<rect x="24" y="${height - 38}" width="${width - 48}" height="24" rx="5" class="mcc-oneline-selected-info"></rect>`);
    parts.push(`<text x="34" y="${height - 22}" class="mcc-oneline-selected-info-text">${escapeXml(truncateText(details, 110))}</text>`);
  }

  parts.push('</svg>');
  return parts.join('');
}

export function renderMccLineupSheetSvg(lineup) {
  const normalized = normalizeMccLineup(lineup);
  const elevation = renderMccElevationSvg(normalized, { maxWidth: 1100, maxHeight: 420 });
  const oneLine = renderMccOneLineSvg(normalized);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="820" viewBox="0 0 1200 820">',
    '<rect x="0" y="0" width="1200" height="820" fill="#fff"></rect>',
    `<text x="42" y="38" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#111827">${escapeXml(normalized.tag)} MCC Lineup Sheet</text>`,
    `<foreignObject x="42" y="62" width="1116" height="420"><div xmlns="http://www.w3.org/1999/xhtml">${elevation}</div></foreignObject>`,
    `<foreignObject x="42" y="500" width="1116" height="260"><div xmlns="http://www.w3.org/1999/xhtml">${oneLine}</div></foreignObject>`,
    '</svg>'
  ].join('');
}

export function findMccLineupForEquipment(lineups = [], equipment = {}) {
  const candidates = [
    equipment.mccLineupId,
    equipment.listTag,
    equipment.tag,
    equipment.ref,
    equipment.id,
    equipment.name,
    equipment.lineup
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (!candidates.length) return null;
  return normalizeMccLineups(lineups).find(lineup => {
    const keys = [lineup.id, lineup.tag, lineup.equipmentTag, lineup.name]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    return keys.some(key => candidates.includes(key));
  }) || null;
}
