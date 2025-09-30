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
  const instDelay = overrides.instantaneousDelay ?? base.instantaneousDelay ?? 0.01;
  const baseTime = base.time ?? base.delay ?? 1;
  const scaleI = base.pickup ? pickup / base.pickup : 1;
  const scaleT = baseTime ? time / baseTime : 1;
  const tolerance = {
    timeLower: Math.max(device.tolerance?.timeLower ?? DEFAULT_TOLERANCE.timeLower, 0.1),
    timeUpper: Math.max(device.tolerance?.timeUpper ?? DEFAULT_TOLERANCE.timeUpper, 1.0)
  };

  const sorted = (device.curve || [])
    .map(p => ({ current: Number(p.current) || 0, time: Math.max(Number(p.time) || MIN_TIME, MIN_TIME) }))
    .filter(p => p.current > 0)
    .sort((a, b) => a.current - b.current);

  const curve = sorted.map(p => ({
    current: p.current * scaleI,
    time: Math.max(p.time * scaleT, MIN_TIME)
  }));

  if (instantaneous) {
    const instCurrent = instantaneous;
    const instTime = Math.max(instDelay, MIN_TIME);
    const last = curve[curve.length - 1];
    if (last && last.current < instCurrent) {
      curve.push({ current: instCurrent, time: last.time });
    } else if (!last) {
      curve.push({ current: instCurrent, time: instTime });
    }
    curve.push({ current: instCurrent, time: instTime });
    curve.push({ current: instCurrent, time: MIN_TIME });
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
    settings: { pickup, time, instantaneous, instantaneousDelay: instDelay },
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
