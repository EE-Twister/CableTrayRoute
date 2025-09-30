const MIN_TIME = 1e-4;
const DEFAULT_TOLERANCE = {
  timeLower: 0.8,
  timeUpper: 1.2
};

export function scaleCurve(device = {}, overrides = {}) {
  const base = device.settings || {};
  const pickup = overrides.pickup ?? base.pickup ?? 1;
  const time = overrides.time ?? base.time ?? base.delay ?? 1;
  const instantaneous = overrides.instantaneous ?? base.instantaneous ?? 0;
  const baseTime = base.time ?? base.delay ?? 1;
  const scaleI = base.pickup ? pickup / base.pickup : 1;
  const scaleT = baseTime ? time / baseTime : 1;
  const tolerance = {
    timeLower: Math.max(device.tolerance?.timeLower ?? DEFAULT_TOLERANCE.timeLower, 0.1),
    timeUpper: Math.max(device.tolerance?.timeUpper ?? DEFAULT_TOLERANCE.timeUpper, 1.0)
  };

  const curve = (device.curve || []).map(p => ({
    current: p.current * scaleI,
    time: Math.max(p.time * scaleT, MIN_TIME)
  }));
  if (instantaneous) {
    curve.push({ current: instantaneous, time: 0.01 });
  }

  const minCurve = curve.map(p => ({
    current: p.current,
    time: Math.max(p.time * tolerance.timeLower, MIN_TIME)
  }));
  const maxCurve = curve.map(p => ({
    current: p.current,
    time: Math.max(p.time * tolerance.timeUpper, MIN_TIME)
  }));
  const envelope = minCurve.map((p, idx) => ({
    current: p.current,
    minTime: p.time,
    maxTime: maxCurve[idx].time
  }));

  return {
    ...device,
    curve,
    minCurve,
    maxCurve,
    envelope,
    settings: { pickup, time, instantaneous },
    tolerance
  };
}

export function checkDuty(device = {}, faultKA) {
  if (!faultKA || !device.interruptRating) return null;
  if (device.interruptRating < faultKA) {
    return `${device.name} interrupt rating ${device.interruptRating}kA < fault ${faultKA}kA`;
  }
  return null;
}
