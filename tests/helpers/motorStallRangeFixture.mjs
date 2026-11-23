import { protectionTimingFixture } from './motorProtectionTimingFixture.mjs';

/** Synthetic constant-current curve comparison; no motor or relay data claim. */
export function motorStallRangeFixture(count = 25) {
  const input = protectionTimingFixture(count);
  const timing = input.equipment[0].motor.protectionTiming;
  timing.schemaVersion = '2.0.0';
  timing.stallCurrentRangeA = { minimumA: 80, maximumA: 110, reference: 'Synthetic declared stalled-current range, not a measured voltage/scenario envelope.' };
  const previous = timing.motorWithstand;
  timing.motorWithstand = {
    hotConditions: previous.hotConditions,
    coldConditions: previous.coldConditions,
    source: { ...previous.source, id: 'synthetic-current-dependent-stall-curves' },
    hotMinimumSafeStallCurve: [{ currentA: 80, minimumSafeStallTimeS: 39.0625 }, { currentA: 125, minimumSafeStallTimeS: 16 }],
    coldMinimumSafeStallCurve: [{ currentA: 80, minimumSafeStallTimeS: 62.5 }, { currentA: 125, minimumSafeStallTimeS: 25.6 }],
  };
  return input;
}
