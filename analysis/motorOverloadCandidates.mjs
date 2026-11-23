const SIEMENS_IC10_CATALOG_URL = 'https://cache.industry.siemens.com/dl/files/999/109771999/att_1058579/v1/SIRIUS_IC10_chap07_English_2021_202103301020326928.pdf';
const SIEMENS_3RU2_OPERATING_MANUAL_URL = 'https://cache.industry.siemens.com/dl/files/164/60298164/att_95533/v1/manual_overload_relay_3RU2_3RB3_en-US.pdf';

const SIEMENS_3RU2_CANDIDATES = Object.freeze([
  { catalogNumber: '3RU2116-0AB0', minSettingA: 0.11, maxSettingA: 0.16, size: 'S00' },
  { catalogNumber: '3RU2116-0BB0', minSettingA: 0.14, maxSettingA: 0.2, size: 'S00' },
  { catalogNumber: '3RU2116-0CB0', minSettingA: 0.18, maxSettingA: 0.25, size: 'S00' },
  { catalogNumber: '3RU2116-0DB0', minSettingA: 0.22, maxSettingA: 0.32, size: 'S00' },
  { catalogNumber: '3RU2116-0EB0', minSettingA: 0.28, maxSettingA: 0.4, size: 'S00' },
  { catalogNumber: '3RU2116-0FB0', minSettingA: 0.35, maxSettingA: 0.5, size: 'S00' },
  { catalogNumber: '3RU2116-0GB0', minSettingA: 0.45, maxSettingA: 0.63, size: 'S00' },
  { catalogNumber: '3RU2116-0HB0', minSettingA: 0.55, maxSettingA: 0.8, size: 'S00' },
  { catalogNumber: '3RU2116-0JB0', minSettingA: 0.7, maxSettingA: 1, size: 'S00' },
  { catalogNumber: '3RU2116-0KB0', minSettingA: 0.9, maxSettingA: 1.25, size: 'S00' },
  { catalogNumber: '3RU2116-1AB0', minSettingA: 1.1, maxSettingA: 1.6, size: 'S00' },
  { catalogNumber: '3RU2116-1BB0', minSettingA: 1.4, maxSettingA: 2, size: 'S00' },
  { catalogNumber: '3RU2116-1CB0', minSettingA: 1.8, maxSettingA: 2.5, size: 'S00' },
  { catalogNumber: '3RU2116-1DB0', minSettingA: 2.2, maxSettingA: 3.2, size: 'S00' },
  { catalogNumber: '3RU2116-1EB0', minSettingA: 2.8, maxSettingA: 4, size: 'S00' },
  { catalogNumber: '3RU2116-1FB0', minSettingA: 3.5, maxSettingA: 5, size: 'S00' },
  { catalogNumber: '3RU2116-1GB0', minSettingA: 4.5, maxSettingA: 6.3, size: 'S00' },
  { catalogNumber: '3RU2116-1HB0', minSettingA: 5.5, maxSettingA: 8, size: 'S00' },
  { catalogNumber: '3RU2116-1JB0', minSettingA: 7, maxSettingA: 10, size: 'S00' },
  { catalogNumber: '3RU2116-1KB0', minSettingA: 9, maxSettingA: 12.5, size: 'S00' },
  { catalogNumber: '3RU2116-4AB0', minSettingA: 11, maxSettingA: 16, size: 'S00' },
  { catalogNumber: '3RU2126-1CB0', minSettingA: 1.8, maxSettingA: 2.5, size: 'S0' },
  { catalogNumber: '3RU2126-1DB0', minSettingA: 2.2, maxSettingA: 3.2, size: 'S0' },
  { catalogNumber: '3RU2126-1EB0', minSettingA: 2.8, maxSettingA: 4, size: 'S0' },
  { catalogNumber: '3RU2126-1FB0', minSettingA: 3.5, maxSettingA: 5, size: 'S0' },
  { catalogNumber: '3RU2126-1GB0', minSettingA: 4.5, maxSettingA: 6.3, size: 'S0' },
  { catalogNumber: '3RU2126-1HB0', minSettingA: 5.5, maxSettingA: 8, size: 'S0' },
  { catalogNumber: '3RU2126-1JB0', minSettingA: 7, maxSettingA: 10, size: 'S0' },
  { catalogNumber: '3RU2126-1KB0', minSettingA: 9, maxSettingA: 12.5, size: 'S0' },
  { catalogNumber: '3RU2126-4AB0', minSettingA: 11, maxSettingA: 16, size: 'S0' },
  { catalogNumber: '3RU2126-4BB0', minSettingA: 14, maxSettingA: 20, size: 'S0' },
  { catalogNumber: '3RU2126-4CB0', minSettingA: 17, maxSettingA: 22, size: 'S0' },
  { catalogNumber: '3RU2126-4DB0', minSettingA: 20, maxSettingA: 25, size: 'S0' },
  { catalogNumber: '3RU2126-4NB0', minSettingA: 23, maxSettingA: 28, size: 'S0' },
  { catalogNumber: '3RU2126-4EB0', minSettingA: 27, maxSettingA: 32, size: 'S0' },
  { catalogNumber: '3RU2126-4PB0', minSettingA: 30, maxSettingA: 36, size: 'S0' },
  { catalogNumber: '3RU2126-4FB0', minSettingA: 34, maxSettingA: 40, size: 'S0' },
  { catalogNumber: '3RU2136-4EB0', minSettingA: 22, maxSettingA: 32, size: 'S2' },
  { catalogNumber: '3RU2136-4FB0', minSettingA: 28, maxSettingA: 40, size: 'S2' },
  { catalogNumber: '3RU2136-4GB0', minSettingA: 36, maxSettingA: 45, size: 'S2' },
  { catalogNumber: '3RU2136-4HB0', minSettingA: 40, maxSettingA: 50, size: 'S2' },
  { catalogNumber: '3RU2136-4QB0', minSettingA: 47, maxSettingA: 57, size: 'S2' },
  { catalogNumber: '3RU2136-4JB0', minSettingA: 54, maxSettingA: 65, size: 'S2' },
  { catalogNumber: '3RU2136-4KB0', minSettingA: 62, maxSettingA: 73, size: 'S2', tripClass: '10A' },
].map(item => Object.freeze({
  ...item,
  manufacturer: 'Siemens',
  family: 'SIRIUS 3RU2 thermal overload relay',
  tripClass: item.tripClass || '10',
  phases: 3,
  assemblyScope: 'contactor-mounted overload relay; contactor and complete starter assembly not selected',
  sourceDocuments: Object.freeze([
    Object.freeze({
      id: item.size === 'S2' ? 'siemens_ic10_2021_page_7_99' : 'siemens_ic10_2021_page_7_98',
      publisher: 'Siemens AG',
      title: 'SIRIUS IC 10, Protection Equipment: SIRIUS 3RU2 thermal overload relays',
      revision: '2021',
      page: item.size === 'S2' ? '7/99' : '7/98',
      sha256: '0f9bd5ec76a0d5dbc84816dc53472b88aa2b748030c937e0aa05ea1166611dfe',
      accessedOn: '2026-10-19',
      url: SIEMENS_IC10_CATALOG_URL,
      evidence: 'Verified page lists exact article number, current setting range, relay size, and trip class; table header identifies contactor-mounted application.',
    }),
    Object.freeze({
      id: `siemens_product_${item.catalogNumber.toLowerCase().replaceAll('-', '_')}`,
      publisher: 'Siemens AG',
      title: `Uninspected Siemens data-sheet follow-up for ${item.catalogNumber}`,
      revision: 'Link only; exact data sheet not retrieved',
      page: 'Not reviewed',
      accessedOn: null,
      url: `https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=${item.catalogNumber}`,
      evidence: 'Exact-part follow-up link only; technical fields in this candidate are sourced to the inspected Siemens 2021 catalog table.',
    }),
    Object.freeze({
      id: 'siemens_3ru2_operating_manual_2014',
      publisher: 'Siemens AG',
      title: 'SIRIUS 3RU2 thermal overload relays / 3RB3 solid-state overload relays operating manual',
      revision: '09/2014, A5E03656507420A/RS-AA/002',
      page: 'Printed p.22, section 3.3; p.75, section 9.1',
      accessedOn: '2026-10-19',
      url: SIEMENS_3RU2_OPERATING_MANUAL_URL,
      evidence: 'Section 3.3 identifies 3RU21 protection for three-phase loads; section 9.1 says set the rotary knob to rated motor current Ie and do not set outside the relay scale.',
    }),
  ]),
  fieldSources: Object.freeze(Object.fromEntries(Object.entries({
    manufacturer: [item.size === 'S2' ? 'siemens_ic10_2021_page_7_99' : 'siemens_ic10_2021_page_7_98'],
    family: [item.size === 'S2' ? 'siemens_ic10_2021_page_7_99' : 'siemens_ic10_2021_page_7_98'],
    catalogNumber: [item.size === 'S2' ? 'siemens_ic10_2021_page_7_99' : 'siemens_ic10_2021_page_7_98'],
    minSettingA: [item.size === 'S2' ? 'siemens_ic10_2021_page_7_99' : 'siemens_ic10_2021_page_7_98'],
    maxSettingA: [item.size === 'S2' ? 'siemens_ic10_2021_page_7_99' : 'siemens_ic10_2021_page_7_98'],
    size: [item.size === 'S2' ? 'siemens_ic10_2021_page_7_99' : 'siemens_ic10_2021_page_7_98'],
    tripClass: [item.size === 'S2' ? 'siemens_ic10_2021_page_7_99' : 'siemens_ic10_2021_page_7_98'],
    phases: ['siemens_3ru2_operating_manual_2014'],
    assemblyScope: [item.size === 'S2' ? 'siemens_ic10_2021_page_7_99' : 'siemens_ic10_2021_page_7_98'],
  }).map(([field, sourceIds]) => [field, Object.freeze(sourceIds)]))),
})));

function validPositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function blocked(code, message) {
  return { status: 'blocked', candidate: null, issues: [{ code, message }] };
}

/**
 * Screen a motor nameplate current against exact Siemens SIRIUS 3RU2 S00/S0/S2
 * Class 10/10A product ranges. This does not establish overload protection,
 * standards compliance, or a complete starter selection.
 */
export function selectMotorOverloadCandidate({ motor = {}, phases } = {}) {
  if (!validPositive(motor?.nameplateCurrentA)) {
    return blocked('MOTOR_NAMEPLATE_CURRENT_REQUIRED', 'Provide an explicit motor.nameplateCurrentA; design-table fullLoadCurrentA is not a substitute for the overload setting basis.');
  }
  if (!validPositive(motor?.ratedVoltageV)) {
    return blocked('MOTOR_NAMEPLATE_VOLTAGE_REQUIRED', 'Provide the explicit motor rated voltage so voltage-system applicability can be reviewed.');
  }
  if (phases !== 3) {
    return blocked('UNSUPPORTED_OVERLOAD_PHASES', 'This candidate set is limited to three-phase motor applications.');
  }
  if (motor?.starterType !== 'dol') {
    return blocked('UNSUPPORTED_OVERLOAD_STARTER', 'This candidate set is limited to explicitly identified direct-on-line motor starters.');
  }

  // The library chooses the narrowest published interval, then the lowest
  // upper bound, then the catalog number for deterministic range screening.
  const matching = SIEMENS_3RU2_CANDIDATES
    .filter(item => motor.nameplateCurrentA >= item.minSettingA && motor.nameplateCurrentA <= item.maxSettingA)
    .sort((left, right) => (left.maxSettingA - left.minSettingA) - (right.maxSettingA - right.minSettingA)
      || left.maxSettingA - right.maxSettingA
      || left.catalogNumber.localeCompare(right.catalogNumber));
  const selected = matching[0];
  if (!selected) {
    return blocked('MOTOR_NAMEPLATE_CURRENT_OUTSIDE_CATALOG', 'The explicit nameplate current is outside the source-backed Siemens SIRIUS 3RU2 0.11–73 A setting-range inventory.');
  }

  return {
    status: 'screening_only',
    candidate: {
      ...selected,
      sourceDocuments: selected.sourceDocuments.map(source => ({ ...source })),
      fieldSources: {
        ...Object.fromEntries(Object.entries(selected.fieldSources).map(([field, sources]) => [field, [...sources]])),
        dialSettingA: ['input:motor.nameplateCurrentA'],
        dialSettingBasis: ['siemens_3ru2_operating_manual_2014'],
        settingRangeA: [...selected.fieldSources.minSettingA, ...selected.fieldSources.maxSettingA],
        motorNameplateVoltageV: ['input:motor.ratedVoltageV'],
        motorPhases: ['input:phases'],
      },
      motorNameplateVoltageV: motor.ratedVoltageV,
      motorPhases: phases,
      dialSettingA: motor.nameplateCurrentA,
      dialSettingBasis: 'explicit motor.nameplateCurrentA per Siemens 3RU2 operating manual §9.1',
      settingRangeA: [selected.minSettingA, selected.maxSettingA],
      voltageApplicability: 'unresolved; verify the selected contactor and complete starter assembly for this motor system voltage',
      protectionStatus: 'range screening only; overload protection not established',
      unresolved: [
        'NEC permitted overload trip limit and applicable nameplate/service-factor/temperature-rise basis',
        'contactor, short-circuit protective device, and complete starter assembly compatibility',
        'system voltage applicability of the assembled starter',
        'ambient temperature and installation applicability',
        'trip class, starting duty, acceleration, and motor thermal suitability',
        'short-circuit and ground-fault protection and coordination',
      ],
    },
    issues: [],
  };
}

export { SIEMENS_3RU2_CANDIDATES };

export default { selectMotorOverloadCandidate, SIEMENS_3RU2_CANDIDATES };
