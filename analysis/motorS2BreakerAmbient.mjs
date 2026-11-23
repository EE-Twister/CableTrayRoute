// Exact-part Siemens operating-current tables. These are research comparisons,
// not installed breaker ratings or approval of an enclosure.
const TABLES = Object.freeze({
  35: Object.freeze({
    current: Object.freeze({ 40: 35, 45: 34, 50: 34, 55: 33, 60: 33, 65: 32, 70: 32 }),
    alternate: Object.freeze({ 40: 35, 45: 34.4, 50: 33.9, 55: 33.4, 60: 32.9, 65: 32.4, 70: 31.9 }),
    sources: Object.freeze([
      { id: 'siemens-3va5135-ambient-2024', publisher: 'Siemens AG (RS-hosted data sheet)', title: '3VA5135-6EC31-0AA0 operating-current table', url: 'https://docs.rs-online.com/9ab1/A700000011979558.pdf', revision: '10/1/2024 as printed', locators: ['PDF page 1: operating current at 40–70 °C; not marked as 100%-rated', 'SHA-256 c6f169987ef8a8969cd3cc00001dc6f770c5326a43f0e6ae9470125fb7f1e58b'] },
      { id: 'siemens-3va5135-ambient-2020', publisher: 'Siemens AG (Octopart-hosted data sheet)', title: '3VA5135-6EC31-0AA0 alternative operating-current table', url: 'https://datasheet.octopart.com/3VA5135-6EC31-0AA0-Siemens-datasheet-180754463.pdf', revision: '08/03/2020 as printed', locators: ['PDF page 2: decimal operating currents differ from the 2024 values; source applicability remains unresolved', 'SHA-256 ac42ae2f94c4e9584213c3ba79d7b221feb64776f9a686d67f8482f885f06efa'] }
    ])
  }),
  50: Object.freeze({
    current: Object.freeze({ 40: 50, 45: 49.1, 50: 48.3, 55: 47.5, 60: 46.7, 65: 46, 70: 45.2 }),
    sources: Object.freeze([
      { id: 'siemens-3va5150-ambient-2020', publisher: 'Siemens AG (Octopart-hosted data sheet)', title: '3VA5150-6EC31-0AA0 operating-current table', url: 'https://datasheet.octopart.com/3VA5150-6EC31-0AA0-Siemens-datasheet-141221825.pdf', revision: '2020-04-26', locators: ['PDF page 2: operating current at 40–70 °C; not marked as 100%-rated', 'SHA-256 c9f11d20227fba07a843ff8a3babb3102ee42b9ba92f7cd2597cf7fcaff440f0'] }
    ])
  }),
  60: Object.freeze({
    current: Object.freeze({ 40: 60, 45: 59, 50: 58, 55: 57, 60: 56, 65: 55, 70: 54 }),
    sources: Object.freeze([
      { id: 'siemens-3va5160-ambient-2023', publisher: 'Siemens AG (distributor-hosted data sheet)', title: '3VA5160-6EC31-0AA0 operating-current table', url: 'https://media.distributordatasolutions.com/siemenscomplete/2023q1/documents/5e2548dca669afb232592124109988fe4c9941f7.pdf', revision: '2/10/2023 as printed', locators: ['PDF pages 1–2: operating current at 40–70 °C; not marked as 100%-rated', 'SHA-256 99912f08976143d15fa88334e3cdf37dd93d56038b13f44349f06d4b25ba6ee5'] }
    ])
  })
});

export const MOTOR_S2_AMBIENT_TEMPERATURES = Object.freeze([40, 45, 50, 55, 60, 65, 70]);

export function motorS2BreakerAmbientSources(breakerA) {
  return structuredClone(TABLES[breakerA]?.sources || []);
}

export function evaluateMotorS2BreakerAmbient({ breakerA, motor = {}, criteria = {}, floorA = null } = {}) {
  const table = TABLES[breakerA];
  if (!table) throw new TypeError('Unsupported S2 breaker temperature table');
  const motorSupplied = motor.breakerAmbientTemperatureC !== undefined || motor.breakerAmbientReference !== undefined;
  const temperature = motorSupplied ? motor.breakerAmbientTemperatureC : criteria.motorStarter?.s2BreakerAmbientTemperatureC;
  const reference = motorSupplied ? motor.breakerAmbientReference : criteria.motorStarter?.s2BreakerAmbientReference;
  const suppressed = motorSupplied && temperature === null && reference === null;
  const provided = temperature !== undefined || reference !== undefined;
  const basis = suppressed ? 'motor-unset' : motorSupplied ? 'motor' : provided ? 'project-s2' : 'unspecified';
  const valid = typeof temperature === 'number' && Object.prototype.hasOwnProperty.call(table.current, temperature)
    && typeof reference === 'string' && Boolean(reference.trim());
  const primary = valid ? table.current[temperature] : null;
  const alternate = valid && table.alternate ? table.alternate[temperature] : null;
  const limit = valid ? Math.min(primary, alternate ?? primary) : null;
  const finiteFloor = typeof floorA === 'number' && Number.isFinite(floorA) && floorA > 0 ? floorA : null;
  const exceeded = valid && finiteFloor !== null && finiteFloor > limit;
  const sourceIds = table.sources.map(source => source.id);
  return {
    id: 'breakerAmbientOperatingCurrent',
    status: provided && !suppressed && (!valid || exceeded) ? 'fail' : 'unevaluated',
    message: !provided || suppressed ? `No referenced ${breakerA} A breaker enclosure temperature is supplied; temperature suitability remains unevaluated.`
      : !valid ? 'Supply a referenced enclosure temperature at a published 40–70 °C table point; no interpolation or cable-ambient substitution is used.'
        : finiteFloor === null ? 'A valid current floor is required for the temperature comparison; installation suitability remains unevaluated.'
          : `The exact ${breakerA} A Siemens table${alternate !== null ? `s list ${primary} A and ${alternate} A` : ` lists ${primary} A`} at ${temperature} °C; the ${finiteFloor} A screening floor ${exceeded ? 'exceeds' : 'does not exceed'} the ${limit} A comparison value. ${alternate !== null ? 'The differing source revisions require reconciliation. ' : ''}The installed temperature, rating, and protection remain unqualified.`,
    evidence: { enclosureTemperatureC: valid ? temperature : null, reference: typeof reference === 'string' ? reference : null, basis, publishedOperatingCurrentA: primary, alternatePublishedOperatingCurrentA: alternate, conservativeComparisonA: limit, screeningFloorA: finiteFloor, comparison: valid && finiteFloor !== null ? (exceeded ? 'exceeds-screening-value' : 'within-screening-value-unqualified') : 'not-evaluated', differingDatasheetValuesUnresolved: Boolean(table.alternate), valuesDifferAtTemperature: alternate !== null ? primary !== alternate : null },
    sourceIds
  };
}
