const MIN_TIME = 1e-4;
const DEFAULT_TOLERANCE = {
  timeLower: 0.8,
  timeUpper: 1.2
};

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizeCurveProfiles(device = {}) {
  const raw = device.curveProfiles;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map(profile => {
        if (!profile || typeof profile !== 'object') return null;
        const id = profile.id ?? profile.key ?? profile.name;
        if (!id) return null;
        return {
          id: String(id),
          name: profile.name ?? profile.label ?? String(id),
          curve: Array.isArray(profile.curve) ? profile.curve : [],
          settings: profile.settings && typeof profile.settings === 'object' ? profile.settings : {},
          tolerance: profile.tolerance && typeof profile.tolerance === 'object' ? profile.tolerance : undefined
        };
      })
      .filter(Boolean);
  }
  if (typeof raw === 'object') {
    return Object.entries(raw)
      .map(([id, profile]) => {
        if (!profile || typeof profile !== 'object') return null;
        const resolvedId = profile.id ?? id;
        return {
          id: String(resolvedId),
          name: profile.name ?? profile.label ?? String(resolvedId),
          curve: Array.isArray(profile.curve) ? profile.curve : [],
          settings: profile.settings && typeof profile.settings === 'object' ? profile.settings : {},
          tolerance: profile.tolerance && typeof profile.tolerance === 'object' ? profile.tolerance : undefined
        };
      })
      .filter(Boolean);
  }
  return [];
}

function pickCurveProfile(device = {}, profileId) {
  const profiles = normalizeCurveProfiles(device);
  if (!profiles.length) {
    return {
      id: profileId ? String(profileId) : null,
      name: null,
      curve: device.curve || [],
      settings: {},
      tolerance: device.tolerance
    };
  }
  if (profileId !== undefined && profileId !== null) {
    const idStr = String(profileId);
    const match = profiles.find(profile => profile.id === idStr)
      || profiles.find(profile => profile.name === profileId);
    if (match) {
      const fallbackCurve = device.curve || [];
      return {
        ...match,
        curve: match.curve && match.curve.length ? match.curve : fallbackCurve,
        tolerance: match.tolerance ?? device.tolerance
      };
    }
  }
  const first = profiles[0];
  return {
    ...first,
    curve: first.curve && first.curve.length ? first.curve : device.curve || [],
    tolerance: first.tolerance ?? device.tolerance
  };
}

export function scaleCurve(device = {}, overrides = {}) {
  const baseSettings = device.settings || {};
  const selectedProfileId = firstDefined(
    overrides.curveProfile,
    baseSettings.curveProfile,
    device.curveProfile
  );
  const profile = pickCurveProfile(device, selectedProfileId);
  const combinedBase = { ...baseSettings, ...profile.settings };

  const pickup = firstDefined(
    overrides.pickup,
    overrides.longTimePickup,
    combinedBase.pickup,
    combinedBase.longTimePickup,
    1
  );
  const time = firstDefined(
    overrides.time,
    overrides.delay,
    overrides.longTimeDelay,
    combinedBase.time,
    combinedBase.delay,
    combinedBase.longTimeDelay,
    1
  );
  const shortTimePickup = firstDefined(overrides.shortTimePickup, combinedBase.shortTimePickup);
  const shortTimeDelay = firstDefined(overrides.shortTimeDelay, combinedBase.shortTimeDelay);
  const instantaneous = firstDefined(
    overrides.instantaneous,
    overrides.instantaneousPickup,
    combinedBase.instantaneous,
    combinedBase.instantaneousPickup,
    0
  );
  const instDelay = firstDefined(
    overrides.instantaneousDelay,
    combinedBase.instantaneousDelay,
    combinedBase.instantaneousDelaySetting,
    0.01
  );
  const instMaxSetting = firstDefined(
    overrides.instantaneousMax,
    combinedBase.instantaneousMax,
    device.instantaneousMax
  );

  const basePickup = firstDefined(combinedBase.pickup, combinedBase.longTimePickup, 1);
  const baseTime = firstDefined(combinedBase.time, combinedBase.delay, combinedBase.longTimeDelay, 1);
  const scaleI = basePickup ? pickup / basePickup : 1;
  const scaleT = baseTime ? time / baseTime : 1;

  const toleranceSource = profile.tolerance || device.tolerance || DEFAULT_TOLERANCE;
  const tolerance = {
    timeLower: Math.max(toleranceSource.timeLower ?? DEFAULT_TOLERANCE.timeLower, 0.1),
    timeUpper: Math.max(toleranceSource.timeUpper ?? DEFAULT_TOLERANCE.timeUpper, 1.0)
  };

  const sorted = (profile.curve || device.curve || [])
    .map(p => ({ current: Number(p.current) || 0, time: Math.max(Number(p.time) || MIN_TIME, MIN_TIME) }))
    .filter(p => p.current > 0)
    .sort((a, b) => a.current - b.current);

  const curve = sorted.map(p => ({
    current: p.current * scaleI,
    time: Math.max(p.time * scaleT, MIN_TIME)
  }));

  let resolvedInstMax = instMaxSetting;
  if (instantaneous) {
    const instCurrent = instantaneous;
    const instTime = Math.max(instDelay, MIN_TIME);
    const last = curve[curve.length - 1];
    const ratedCeiling = Number.isFinite(Number(device.interruptRating))
      ? Number(device.interruptRating) * 1000
      : null;
    let instLimit = Number(instMaxSetting);
    if (!Number.isFinite(instLimit) || instLimit <= instCurrent) {
      instLimit = ratedCeiling && ratedCeiling > instCurrent ? ratedCeiling : instCurrent * 10;
    }
    resolvedInstMax = instLimit;
    if (last && last.current < instCurrent) {
      curve.push({ current: instCurrent, time: last.time });
    } else if (!last) {
      curve.push({ current: instCurrent, time: instTime });
    }
    curve.push({ current: instCurrent, time: instTime });
    if (instLimit > instCurrent) {
      curve.push({ current: instLimit, time: instTime });
    }
    curve.push({ current: instLimit, time: MIN_TIME });
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
    settings: {
      curveProfile: profile.id ?? null,
      curveProfileLabel: profile.name ?? null,
      pickup,
      time,
      longTimePickup: pickup,
      longTimeDelay: time,
      shortTimePickup,
      shortTimeDelay,
      instantaneous,
      instantaneousPickup: instantaneous,
      instantaneousDelay: instDelay,
      instantaneousMax: resolvedInstMax
    },
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
