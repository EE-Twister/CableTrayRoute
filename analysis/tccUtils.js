export function scaleCurve(device = {}, overrides = {}) {
  const base = device.settings || {};
  const pickup = overrides.pickup ?? base.pickup ?? 1;
  const time = overrides.time ?? base.time ?? base.delay ?? 1;
  const instantaneous = overrides.instantaneous ?? base.instantaneous ?? 0;
  const baseTime = base.time ?? base.delay ?? 1;
  const scaleI = base.pickup ? pickup / base.pickup : 1;
  const scaleT = baseTime ? time / baseTime : 1;
  const curve = (device.curve || []).map(p => ({
    current: p.current * scaleI,
    time: p.time * scaleT
  }));
  if (instantaneous) curve.push({ current: instantaneous, time: 0.01 });
  return { ...device, curve, settings: { pickup, time, instantaneous } };
}

export function checkDuty(device = {}, faultKA) {
  if (!faultKA || !device.interruptRating) return null;
  if (device.interruptRating < faultKA) {
    return `${device.name} interrupt rating ${device.interruptRating}kA < fault ${faultKA}kA`;
  }
  return null;
}
