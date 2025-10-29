const MIN_TIME = 1e-4;
const DEFAULT_TOLERANCE = {
  timeLower: 0.8,
  timeUpper: 1.2
};
const CURVE_ROLE_VALUES = new Set(['melting', 'clearing']);

export function sanitizeCurve(points = []) {
  const filtered = points
    .map(point => ({
      current: Number(point?.current) || 0,
      time: Math.max(Number(point?.time) || MIN_TIME, MIN_TIME)
    }))
    .filter(point => point.current > 0)
    .sort((a, b) => {
      if (a.current === b.current) {
        return b.time - a.time;
      }
      return a.current - b.current;
    });

  let previousTime = null;
  return filtered.map((point, index) => {
    const safeTime = Math.max(point.time, MIN_TIME);
    if (index === 0) {
      previousTime = safeTime;
      return { current: point.current, time: safeTime };
    }
    const monotonicTime = previousTime === null ? safeTime : Math.min(safeTime, previousTime);
    previousTime = monotonicTime;
    return { current: point.current, time: monotonicTime };
  });
}

function normalizeProfileRole(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return CURVE_ROLE_VALUES.has(trimmed) ? trimmed : null;
}

function interpolateTimeAtCurrent(curve, current) {
  if (!Array.isArray(curve) || !curve.length || !Number.isFinite(current) || current <= 0) {
    return MIN_TIME;
  }
  const first = curve[0];
  if (!first || first.current >= current) {
    return Math.max(first?.time ?? MIN_TIME, MIN_TIME);
  }
  for (let index = 1; index < curve.length; index += 1) {
    const prev = curve[index - 1];
    const next = curve[index];
    if (!next) continue;
    if (current <= next.current) {
      const prevCurrent = Math.max(prev.current, MIN_TIME);
      const nextCurrent = Math.max(next.current, MIN_TIME);
      if (Math.abs(nextCurrent - prevCurrent) < 1e-12) {
        return Math.max(Math.min(prev.time, next.time), MIN_TIME);
      }
      const logPrevC = Math.log(prevCurrent);
      const logNextC = Math.log(nextCurrent);
      const span = logNextC - logPrevC;
      const ratio = span === 0 ? 0 : (Math.log(current) - logPrevC) / span;
      const clampedRatio = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
      const logPrevT = Math.log(Math.max(prev.time, MIN_TIME));
      const logNextT = Math.log(Math.max(next.time, MIN_TIME));
      const interpolated = logPrevT + clampedRatio * (logNextT - logPrevT);
      return Math.exp(interpolated);
    }
  }
  const last = curve[curve.length - 1];
  return Math.max(last?.time ?? MIN_TIME, MIN_TIME);
}

function buildEnvelopeFromCurves(lowerCurve = [], upperCurve = []) {
  if (!Array.isArray(lowerCurve) || !Array.isArray(upperCurve) || !lowerCurve.length || !upperCurve.length) {
    return [];
  }
  const currentSet = new Set();
  lowerCurve.forEach(point => {
    if (point && Number.isFinite(point.current) && point.current > 0) {
      currentSet.add(point.current);
    }
  });
  upperCurve.forEach(point => {
    if (point && Number.isFinite(point.current) && point.current > 0) {
      currentSet.add(point.current);
    }
  });
  const currents = Array.from(currentSet).sort((a, b) => a - b);
  return currents.map(current => {
    const minTime = Math.max(interpolateTimeAtCurrent(lowerCurve, current), MIN_TIME);
    const maxTime = Math.max(interpolateTimeAtCurrent(upperCurve, current), MIN_TIME);
    const lower = Math.min(minTime, maxTime);
    const upper = Math.max(minTime, maxTime);
    return {
      current,
      minTime: lower,
      maxTime: upper
    };
  });
}

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
        const role = normalizeProfileRole(profile.role ?? profile.kind);
        return {
          id: String(id),
          name: profile.name ?? profile.label ?? String(id),
          curve: Array.isArray(profile.curve) ? profile.curve : [],
          settings: profile.settings && typeof profile.settings === 'object' ? profile.settings : {},
          tolerance: profile.tolerance && typeof profile.tolerance === 'object' ? profile.tolerance : undefined,
          role: role ?? null
        };
      })
      .filter(Boolean);
  }
  if (typeof raw === 'object') {
    return Object.entries(raw)
      .map(([id, profile]) => {
        if (!profile || typeof profile !== 'object') return null;
        const resolvedId = profile.id ?? id;
        const role = normalizeProfileRole(profile.role ?? profile.kind);
        return {
          id: String(resolvedId),
          name: profile.name ?? profile.label ?? String(resolvedId),
          curve: Array.isArray(profile.curve) ? profile.curve : [],
          settings: profile.settings && typeof profile.settings === 'object' ? profile.settings : {},
          tolerance: profile.tolerance && typeof profile.tolerance === 'object' ? profile.tolerance : undefined,
          role: role ?? null
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
    overrides.ampRating,
    combinedBase.pickup,
    combinedBase.longTimePickup,
    combinedBase.ampRating,
    device.ampRating,
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
  const rawShortTimePickup = firstDefined(overrides.shortTimePickup, combinedBase.shortTimePickup);
  const rawShortTimeDelay = firstDefined(overrides.shortTimeDelay, combinedBase.shortTimeDelay);
  const parsedShortTimePickup = Number(rawShortTimePickup);
  const parsedShortTimeDelay = Number(rawShortTimeDelay);
  const shortTimePickup = Number.isFinite(parsedShortTimePickup) && parsedShortTimePickup > 0
    ? parsedShortTimePickup
    : null;
  const shortTimeDelay = Number.isFinite(parsedShortTimeDelay) && parsedShortTimeDelay > 0
    ? Math.max(parsedShortTimeDelay, MIN_TIME)
    : null;
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

  const basePickup = firstDefined(
    combinedBase.pickup,
    combinedBase.longTimePickup,
    combinedBase.ampRating,
    device.ampRating,
    1
  );
  const baseTime = firstDefined(combinedBase.time, combinedBase.delay, combinedBase.longTimeDelay, 1);
  const scaleI = basePickup ? pickup / basePickup : 1;
  const scaleT = baseTime ? time / baseTime : 1;

  const toleranceSource = profile.tolerance || device.tolerance || DEFAULT_TOLERANCE;
  const tolerance = {
    timeLower: Math.max(toleranceSource.timeLower ?? DEFAULT_TOLERANCE.timeLower, 0.1),
    timeUpper: Math.max(toleranceSource.timeUpper ?? DEFAULT_TOLERANCE.timeUpper, 1.0)
  };

  const baseCurve = sanitizeCurve(profile.curve || device.curve || []);

  let curve = baseCurve.map(point => ({
    current: point.current * scaleI,
    time: Math.max(point.time * scaleT, MIN_TIME)
  }));

  if (shortTimePickup && shortTimeDelay) {
    const plateauCurrent = shortTimePickup;
    const plateauTime = shortTimeDelay;
    const adjusted = [];
    let plateauStarted = false;
    const EPSILON = 1e-9;
    curve.forEach(point => {
      if (point.current + EPSILON < plateauCurrent) {
        adjusted.push(point);
        return;
      }
      if (!plateauStarted) {
        const prev = adjusted[adjusted.length - 1];
        const startTime = prev ? Math.min(prev.time, plateauTime) : plateauTime;
        adjusted.push({ current: plateauCurrent, time: Math.max(startTime, MIN_TIME) });
        plateauStarted = true;
      }
      const current = Math.max(point.current, plateauCurrent);
      const last = adjusted[adjusted.length - 1];
      const time = Math.max(Math.min(plateauTime, last ? last.time : plateauTime), MIN_TIME);
      if (!last || Math.abs(last.current - current) > EPSILON || Math.abs(last.time - time) > EPSILON) {
        adjusted.push({ current, time });
      }
    });
    if (!plateauStarted && adjusted.length) {
      const last = adjusted[adjusted.length - 1];
      const startTime = Math.max(Math.min(plateauTime, last.time), MIN_TIME);
      adjusted.push({ current: plateauCurrent, time: startTime });
    }
    curve = adjusted;
  }

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
    let referenceTime = instTime;
    for (let idx = curve.length - 1; idx >= 0; idx -= 1) {
      const point = curve[idx];
      if (point.current <= instCurrent + 1e-9) {
        referenceTime = Math.max(point.time, MIN_TIME);
        break;
      }
    }
    if (curve.length === 0) {
      referenceTime = instTime;
    }
    if (referenceTime > instTime + 1e-9) {
      curve.push({ current: instCurrent, time: referenceTime });
    } else if (!curve.length) {
      curve.push({ current: instCurrent, time: instTime });
    }
    curve.push({ current: instCurrent, time: instTime });
    if (instLimit > instCurrent) {
      curve.push({ current: instLimit, time: instTime });
    }
    curve.push({ current: instLimit, time: MIN_TIME });
  }

  curve = sanitizeCurve(curve);

  const scaleAdditionalCurve = profileCurve => sanitizeCurve(profileCurve || []).map(point => ({
    current: point.current * scaleI,
    time: Math.max(point.time * scaleT, MIN_TIME)
  }));

  const profiles = normalizeCurveProfiles(device);
  const meltingProfile = profiles.find(item => normalizeProfileRole(item.role) === 'melting');
  const clearingProfile = profiles.find(item => normalizeProfileRole(item.role) === 'clearing');
  const meltingCurve = meltingProfile ? scaleAdditionalCurve(meltingProfile.curve) : null;
  const clearingCurve = clearingProfile ? scaleAdditionalCurve(clearingProfile.curve) : null;

  let minCurve = curve.map(p => ({
    current: p.current,
    time: Math.max(p.time * tolerance.timeLower, MIN_TIME)
  }));
  let maxCurve = curve.map(p => ({
    current: p.current,
    time: Math.max(p.time * tolerance.timeUpper, MIN_TIME)
  }));
  let envelope = minCurve.map((p, idx) => ({
    current: p.current,
    minTime: p.time,
    maxTime: maxCurve[idx].time
  }));

  if (meltingCurve?.length && clearingCurve?.length) {
    minCurve = meltingCurve;
    maxCurve = clearingCurve;
    envelope = buildEnvelopeFromCurves(meltingCurve, clearingCurve);
  }

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
