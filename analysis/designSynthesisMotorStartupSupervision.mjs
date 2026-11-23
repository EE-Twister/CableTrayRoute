const SOURCE = 'ABB REM610 ANSI technical reference 1MRS755537, version E / IED revision C, printed pages 38–39 and 61';
const URL = 'https://library.e.abb.com/public/4774d1ee2bf67901c12579f7002d4e9e/REM610_TRM_755537_ENe_ANSI.pdf';
const KEYS = ['reference', 'relayFlaPrimaryA', 'relayFlaReference', 'pickupMultipleOfFla', 'settingTimeS', 'pickupMode', 'startConditionActiveEntireTrajectory', 'speedSwitchBlocking'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const issue = (code, path, message) => ({ code, path, message, severity: 'blocking' });

/** Nominal comparison only; neither a trip prediction nor an approved setting. */
export function evaluateRem610StartupSupervision(input, accelerationCase) {
  if (input === undefined) return { status: 'not-requested' };
  const issues = [];
  if (!object(input)) return { status: 'blocked', issues: [issue('REM610_STARTUP_INPUT_INVALID', 'startupSupervision', 'Start-up supervision requires a structured input object.')] };
  for (const key of Object.keys(input)) if (!KEYS.includes(key)) issues.push(issue('REM610_STARTUP_UNKNOWN_FIELD', `startupSupervision.${key}`, 'Field is not part of the start-up supervision contract.'));
  for (const key of ['reference', 'relayFlaReference']) if (!text(input[key])) issues.push(issue('REM610_STARTUP_REFERENCE_REQUIRED', `startupSupervision.${key}`, 'A nonblank configuration or current-basis reference is required.'));
  if (!finite(input.relayFlaPrimaryA) || input.relayFlaPrimaryA <= 0) issues.push(issue('REM610_STARTUP_FLA_INVALID', 'startupSupervision.relayFlaPrimaryA', 'The primary-equivalent relay FLA must be positive finite amperes.'));
  if (!finite(input.pickupMultipleOfFla) || input.pickupMultipleOfFla < 1 || input.pickupMultipleOfFla > 10) issues.push(issue('REM610_STARTUP_PICKUP_INVALID', 'startupSupervision.pickupMultipleOfFla', 'The start-up current setting must be from 1.00 through 10.0 times relay FLA.'));
  if (!finite(input.settingTimeS) || input.settingTimeS < 0.3 || input.settingTimeS > 80) issues.push(issue('REM610_STARTUP_TIME_INVALID', 'startupSupervision.settingTimeS', 'The start-up time setting must be from 0.30 through 80.0 seconds.'));
  if (input.pickupMode !== 'motor-start-condition' || input.startConditionActiveEntireTrajectory !== true || input.speedSwitchBlocking !== false) issues.push(issue('REM610_STARTUP_MODE_UNSUPPORTED', 'startupSupervision', 'This comparison requires the stated motor-start-condition mode, an active start condition for the entire simulated trajectory, and no speed-switch blocking.'));
  if (accelerationCase?.status !== 'evaluated' || !finite(accelerationCase?.timeS) || accelerationCase.timeS <= 0 || !finite(accelerationCase?.electricalExposureA2S) || accelerationCase.electricalExposureA2S <= 0) issues.push(issue('REM610_STARTUP_ACCELERATION_UNAVAILABLE', 'startupSupervision', 'A fresh evaluated acceleration duration and current-squared exposure are required.'));
  if (issues.length) return { status: 'blocked', issues };
  const pickupPrimaryA = input.relayFlaPrimaryA * input.pickupMultipleOfFla;
  const referenceExposureA2S = pickupPrimaryA * pickupPrimaryA * input.settingTimeS;
  const utilization = accelerationCase.electricalExposureA2S / referenceExposureA2S;
  const nominalExposurePercent = 100 * utilization;
  if (![pickupPrimaryA, referenceExposureA2S, utilization, nominalExposurePercent].every(finite) || referenceExposureA2S <= 0 || utilization <= 0) return { status: 'blocked', issues: [issue('REM610_STARTUP_NUMERIC_RANGE', 'startupSupervision', 'The exposure comparison is outside the finite positive numeric range.')] };
  return {
    status: 'nominal-comparison-only',
    source: { document: SOURCE, url: URL },
    inputs: { ...input },
    accelerationTimeS: accelerationCase.timeS,
    accelerationExposureA2S: accelerationCase.electricalExposureA2S,
    pickupPrimaryA,
    referenceExposureA2S,
    nominalExposurePercent,
    limitations: [
      'The current-squared integral is the supplied-curve quasi-steady acceleration model, not a measured relay history or an error-bounded physical exposure.',
      'The start condition and speed-switch state are supplied assumptions; setting increments, current scaling, CT wiring, activation and reset behavior are not verified.',
      'This is a nominal total-exposure comparison, not a predicted trip time, tolerance band, motor withstand, approved relay setting, or proof of protection.',
      'The 300 ms shortest operating time and the manual’s stated accuracy do not establish an uncertainty bound for this variable-current calculation.',
    ],
    issues: [],
  };
}
