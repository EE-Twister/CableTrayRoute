// @ts-check
// Cable rows carry two different voltages. `operating_voltage` is the nominal
// system voltage that the Cable Schedule column, the schedule summary, and the
// sizing and voltage-drop checks read. `cable_rating` / `voltage_rating` is
// the insulation rating. Samples and hand-authored projects often record the
// system voltage under a bare `voltage` key, which only the spreadsheet header
// import mapped to `operating_voltage`. These helpers copy a plain numeric
// `voltage` into a missing `operating_voltage` at the project migration and
// import boundaries so every page reads the same value.

// A whole-string match: a positive number with an optional volt unit. Forms
// such as "480/277", "13.8 kV", or "600 V rated" are left for the user to
// enter rather than guessed.
const VOLTAGE_TEXT_PATTERN = /^(\d+(?:\.\d+)?|\.\d+)\s*(?:v|vac|volts?)?$/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/**
 * Parse a cable system voltage written as a number or as text such as "480",
 * "480 V", or "480V".
 * @returns {number|null} The voltage in volts, or null when it is not a plain positive value.
 */
export function parseCableSystemVoltage(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(VOLTAGE_TEXT_PATTERN);
  if (!match) return null;
  const volts = Number(match[1]);
  return Number.isFinite(volts) && volts > 0 ? volts : null;
}

/**
 * Fill a blank `operating_voltage` from the row's `voltage`. Returns the input
 * object when nothing changes so repeated migrations are idempotent and do not
 * create spurious undo diffs. An existing operating voltage is never replaced
 * and the original `voltage` field is kept.
 */
export function normalizeCableOperatingVoltageEntry(cable) {
  if (!isPlainObject(cable) || !isBlank(cable.operating_voltage)) return cable;
  const volts = parseCableSystemVoltage(cable.voltage);
  return volts === null ? cable : { ...cable, operating_voltage: volts };
}

/** Normalize every row of a cable schedule; non-arrays pass through unchanged. */
export function normalizeCableOperatingVoltage(cables) {
  if (!Array.isArray(cables)) return cables;
  let next = cables;
  cables.forEach((cable, index) => {
    const normalized = normalizeCableOperatingVoltageEntry(cable);
    if (normalized === cable) return;
    if (next === cables) next = [...cables];
    next[index] = normalized;
  });
  return next;
}
