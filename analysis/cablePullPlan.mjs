import { tracePullTension } from '../src/pullCalc.js';

const EPSILON = 1e-6;

const finitePositive = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
};

const finiteNonNegative = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
};

const normalizePoint = point => {
  if (!Array.isArray(point) || point.length < 3) return null;
  const normalized = point.slice(0, 3).map(Number);
  return normalized.every(Number.isFinite) ? normalized : null;
};

const distance = (start, end) => Math.hypot(
  end[0] - start[0],
  end[1] - start[1],
  end[2] - start[2]
);

const interpolate = (start, end, ratio) => start.map((value, index) => (
  value + (end[index] - value) * ratio
));

const direction = piece => [
  piece.end[0] - piece.start[0],
  piece.end[1] - piece.start[1],
  piece.end[2] - piece.start[2]
];

const bendAngle = (previous, current) => {
  const before = direction(previous);
  const after = direction(current);
  const beforeLength = Math.hypot(...before);
  const afterLength = Math.hypot(...after);
  if (beforeLength <= EPSILON || afterLength <= EPSILON) return 0;
  const cosine = Math.max(-1, Math.min(1, (
    before[0] * after[0] + before[1] * after[1] + before[2] * after[2]
  ) / (beforeLength * afterLength)));
  return Math.acos(cosine);
};

const normalizeContainment = segment => {
  const explicit = String(
    segment?.containmentType
      || segment?.containment
      || segment?.raceway_type
      || segment?.type
      || ''
  ).trim().toLowerCase();
  if (explicit === 'field' || segment?.isFieldRouting) return 'field';
  if (explicit.includes('duct')) return 'ductbank';
  if (explicit.includes('conduit') || segment?.conduit_id) return 'conduit';
  return 'tray';
};

const analysisSegments = (pieces, defaultBendRadiusFt) => {
  const segments = [];
  pieces.forEach((piece, index) => {
    if (index > 0) {
      const angle = bendAngle(pieces[index - 1], piece);
      if (angle > EPSILON) {
        const radius = finitePositive(
          piece.radius,
          pieces[index - 1].radius,
          defaultBendRadiusFt
        ) || 1;
        segments.push({
          type: 'bend',
          angle,
          radius,
          length: radius * angle,
          point: piece.start.slice(),
          pieceIndex: index
        });
      }
    }
    segments.push({ type: 'straight', length: piece.length, pieceIndex: index });
  });
  return segments;
};

const normalizeRoutePieces = routeSegments => (Array.isArray(routeSegments) ? routeSegments : [])
  .map((segment, sourceSegmentIndex) => {
    const start = normalizePoint(segment?.start);
    const end = normalizePoint(segment?.end);
    if (!start || !end) return null;
    const geometricLength = distance(start, end);
    const length = finitePositive(segment.length, geometricLength);
    if (!length) return null;
    return {
      start,
      end,
      length,
      radius: finitePositive(segment.radius, segment.bendRadiusFt, segment.bend_radius_ft),
      containment: normalizeContainment(segment),
      racewayId: String(segment.raceway_id || segment.tray_id || segment.conduit_id || '').trim(),
      sourceSegmentIndex
    };
  })
  .filter(Boolean);

const reversePieces = pieces => [...pieces].reverse().map(piece => ({
  ...piece,
  start: piece.end.slice(),
  end: piece.start.slice()
}));

const equipmentLimits = (cableMaxTension, options) => {
  const components = [
    { key: 'cable', label: 'Cable', value: cableMaxTension },
    { key: 'puller', label: 'Puller continuous rating', value: finitePositive(options.pullerCapacityLbf) || 3000 },
    { key: 'rope', label: 'Pulling rope WLL', value: finitePositive(options.ropeCapacityLbf) || 5000 },
    { key: 'grip', label: 'Grip / pulling eye', value: finitePositive(options.gripCapacityLbf) || 1000 },
    { key: 'anchorage', label: 'Anchorage', value: finitePositive(options.anchorageCapacityLbf) || 3000 }
  ].filter(component => component.value);
  const weakest = components.reduce((current, component) => (
    !current || component.value < current.value ? component : current
  ), null);
  return { components, weakest };
};

const cablePullProperties = (cable, options) => {
  const conductorSize = String(cable?.conductor_size || cable?.conductorSize || '');
  const weight = finitePositive(cable?.weight, cable?.weight_lbs_ft, cable?.weightLbsPerFt);
  const cableMaxTension = finitePositive(
    cable?.maxTension,
    cable?.allowableTension,
    cable?.max_tension,
    options.allowableTension
  );
  const limits = equipmentLimits(cableMaxTension, options);
  const configuredIncoming = finiteNonNegative(options.incomingTensionLbf);
  return {
    weight,
    coeffFriction: finitePositive(cable?.coeffFriction, cable?.mu, options.coeffFriction) || 0.35,
    cableMaxTension,
    maxTension: limits.weakest?.value || cableMaxTension,
    maxSidewallPressure: finitePositive(
      cable?.maxSidewallPressure,
      cable?.allowableSidewallPressure,
      cable?.max_sidewall_pressure,
      options.allowableSidewallPressure
    ),
    minBendRadiusFt: finitePositive(
      cable?.minBendRadiusFt,
      cable?.min_bend_radius_ft,
      finitePositive(cable?.min_bend_radius_in) ? Number(cable.min_bend_radius_in) / 12 : null
    ),
    conductorMaterial: String(cable?.conductorMaterial || cable?.material || '').toLowerCase().startsWith('al')
      ? 'al'
      : 'cu',
    jacketMaterial: String(cable?.jacketMaterial || cable?.insulation_type || 'XLPE').toUpperCase().includes('PVC')
      ? 'PVC'
      : 'XLPE',
    ambientTempC: Number.isFinite(Number(options.ambientTempC)) ? Number(options.ambientTempC) : 30,
    sizeKcmil: finitePositive(cable?.sizeKcmil, /kcmil/i.test(conductorSize) ? Number.parseFloat(conductorSize) : null) || 0,
    outerDiameterIn: finitePositive(cable?.outerDiameterIn, cable?.diameter, cable?.cable_od) || 0,
    incomingTension: configuredIncoming && configuredIncoming > 0
      ? configuredIncoming
      : (weight ? 25 * weight : 0),
    incomingTensionSource: configuredIncoming && configuredIncoming > 0 ? 'configured' : 'estimated at 25 × cable weight',
    isInitialPull: true,
    limits
  };
};

const traceForPieces = (pieces, properties, settings) => {
  const inputs = analysisSegments(pieces, settings.defaultBendRadiusFt);
  return { inputs, trace: tracePullTension(inputs, properties) };
};

const summarizeSection = (pieces, properties, settings, index) => {
  const length = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const { inputs, trace } = traceForPieces(pieces, properties, settings);
  const reasons = [];
  if (length > settings.maxPullLengthFt + EPSILON) reasons.push('maximum pull-section length');
  if (trace.summary.maxTension > properties.maxTension + EPSILON) reasons.push('weakest tension limit');
  if (trace.summary.maxSidewallPressure > properties.maxSidewallPressure + EPSILON) reasons.push('allowable sidewall pressure');
  return {
    index,
    startPoint: pieces[0]?.start?.slice() || null,
    endPoint: pieces.at(-1)?.end?.slice() || null,
    length,
    maxTension: trace.summary.maxTension,
    maxSidewallPressure: trace.summary.maxSidewallPressure,
    bendCount: trace.segments.filter(segment => segment.type === 'bend').length,
    reasons,
    pass: reasons.length === 0,
    sourceSegmentStart: pieces[0]?.sourceSegmentIndex ?? null,
    sourceSegmentEnd: pieces.at(-1)?.sourceSegmentIndex ?? null,
    pieces: pieces.map(piece => ({ ...piece, start: piece.start.slice(), end: piece.end.slice() })),
    analysisInputs: inputs,
    traceSegments: trace.segments
  };
};

const largestFittingPiece = ({ start, end, length, radius, containment, racewayId, sourceSegmentIndex }, currentPieces, evaluate) => {
  let low = 0;
  let high = 1;
  let best = null;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const ratio = (low + high) / 2;
    const candidate = {
      start: start.slice(),
      end: interpolate(start, end, ratio),
      length: length * ratio,
      radius,
      containment,
      racewayId,
      sourceSegmentIndex
    };
    if (evaluate([...currentPieces, candidate]).pass) {
      best = candidate;
      low = ratio;
    } else {
      high = ratio;
    }
  }
  return best;
};

const pointKey = point => point.map(value => Number(value).toFixed(4)).join(':');

const buildGuideInventory = (pieces, sections, properties, settings) => {
  const tensionAtPoint = new Map();
  sections.forEach(section => {
    section.analysisInputs.forEach((input, inputIndex) => {
      if (input.type !== 'bend' || !input.point) return;
      const result = section.traceSegments[inputIndex];
      tensionAtPoint.set(pointKey(input.point), Math.max(
        tensionAtPoint.get(pointKey(input.point)) || 0,
        Number(result?.tensionOut) || 0
      ));
    });
  });
  const sheaves = [];
  let distanceFromPullStart = pieces[0]?.length || 0;
  for (let index = 1; index < pieces.length; index += 1) {
    const previous = pieces[index - 1];
    const current = pieces[index];
    const angle = bendAngle(previous, current);
    const isTransition = previous.containment !== current.containment;
    if (angle <= EPSILON && !isTransition) {
      distanceFromPullStart += current.length;
      continue;
    }
    const point = current.start.slice();
    const tension = tensionAtPoint.get(pointKey(point)) || properties.incomingTension;
    const actualRadiusFt = finitePositive(current.radius, previous.radius, settings.defaultBendRadiusFt) || 1;
    const sidewallRadiusFt = properties.maxSidewallPressure > 0 ? tension / properties.maxSidewallPressure : 0;
    const recommendedRadiusFt = Math.max(actualRadiusFt, properties.minBendRadiusFt || 0, sidewallRadiusFt);
    const reactionLbf = angle > EPSILON
      ? 2 * tension * Math.sin(angle / 2)
      : tension;
    sheaves.push({
      index: sheaves.length + 1,
      point,
      distanceFromPullStart,
      angleDeg: angle * 180 / Math.PI,
      actualRadiusFt,
      recommendedRadiusFt,
      tensionLbf: tension,
      reactionLbf,
      capacityLbf: settings.sheaveCapacityLbf,
      pass: reactionLbf <= settings.sheaveCapacityLbf + EPSILON,
      kind: isTransition && angle <= EPSILON ? 'feed-guide' : 'bend-sheave',
      transition: isTransition ? `${previous.containment} to ${current.containment}` : '',
      sourceSegmentIndex: current.sourceSegmentIndex
    });
    distanceFromPullStart += current.length;
  }
  return sheaves;
};

const buildRollerInventory = (sections, settings) => {
  const rollers = [];
  sections.forEach(section => {
    let sectionDistance = section.startDistance;
    section.pieces.forEach(piece => {
      if (piece.containment === 'tray') {
        const count = Math.max(0, Math.ceil(piece.length / settings.maxRollerSpacingFt) - 1);
        for (let rollerIndex = 1; rollerIndex <= count; rollerIndex += 1) {
          const ratio = rollerIndex / (count + 1);
          rollers.push({
            index: rollers.length + 1,
            point: interpolate(piece.start, piece.end, ratio),
            distanceFromPullStart: sectionDistance + piece.length * ratio,
            racewayId: piece.racewayId,
            maxSpacingFt: settings.maxRollerSpacingFt
          });
        }
      }
      sectionDistance += piece.length;
    });
  });
  return rollers;
};

const buildDirectionalPlan = (pieces, properties, settings, directionName) => {
  const evaluate = sectionPieces => summarizeSection(sectionPieces, properties, settings, 0);
  const continuous = summarizeSection(pieces, properties, settings, 1);
  const sections = [];
  const setupPoints = [{
    index: 1,
    point: pieces[0].start.slice(),
    distanceFromStart: 0,
    reason: 'Start of pull'
  }];
  let currentPieces = [];
  let completedLength = 0;

  const finalizeSection = () => {
    if (!currentPieces.length) return;
    const section = summarizeSection(currentPieces, properties, settings, sections.length + 1);
    section.startDistance = completedLength;
    section.endDistance = completedLength + section.length;
    sections.push(section);
    completedLength = section.endDistance;
    currentPieces = [];
  };

  const addSetup = (point, reason) => {
    const previous = setupPoints.at(-1);
    if (previous && distance(previous.point, point) <= EPSILON) return;
    setupPoints.push({
      index: setupPoints.length + 1,
      point: point.slice(),
      distanceFromStart: completedLength,
      reason: reason || 'Pull limit'
    });
  };

  pieces.forEach(originalPiece => {
    let remaining = { ...originalPiece, start: originalPiece.start.slice(), end: originalPiece.end.slice() };
    let guard = 0;
    while (remaining.length > EPSILON && guard < 100) {
      guard += 1;
      const trial = evaluate([...currentPieces, remaining]);
      if (trial.pass) {
        currentPieces.push(remaining);
        remaining = { ...remaining, start: remaining.end.slice(), length: 0 };
        continue;
      }

      const fitting = largestFittingPiece(remaining, currentPieces, evaluate);
      if (fitting && fitting.length > 0.05) {
        currentPieces.push(fitting);
        const splitPoint = fitting.end.slice();
        const consumedRatio = fitting.length / remaining.length;
        remaining = {
          ...remaining,
          start: splitPoint,
          length: remaining.length - fitting.length,
          end: remaining.end.slice()
        };
        finalizeSection();
        if (remaining.length > EPSILON) addSetup(splitPoint, trial.reasons.join(', '));
        if (consumedRatio >= 1 - EPSILON) remaining.length = 0;
        continue;
      }

      if (currentPieces.length) {
        const splitPoint = remaining.start.slice();
        finalizeSection();
        addSetup(splitPoint, trial.reasons.join(', '));
        continue;
      }

      currentPieces.push(remaining);
      remaining = { ...remaining, start: remaining.end.slice(), length: 0 };
    }
  });
  finalizeSection();

  const sheaves = buildGuideInventory(pieces, sections, properties, settings);
  const rollers = buildRollerInventory(sections, settings);
  sections.forEach(section => {
    section.pullMethod = settings.allowHandPulls
      && section.length <= settings.maxHandPullLengthFt + EPSILON
      && section.maxTension <= settings.maxHandPullTensionLbf + EPSILON
        ? 'hand'
        : 'tugger';
  });
  const reels = sections.map(section => ({
    index: section.index,
    point: section.startPoint.slice(),
    distanceFromPullStart: section.startDistance,
    reason: setupPoints[section.index - 1]?.reason || 'Start of pull section'
  }));
  const tuggers = sections.filter(section => section.pullMethod === 'tugger').map(section => ({
    index: section.index,
    point: section.endPoint.slice(),
    distanceFromPullStart: section.endDistance,
    requiredCapacityLbf: section.maxTension,
    continuousRatingLbf: settings.pullerCapacityLbf,
    pass: section.maxTension <= settings.pullerCapacityLbf + EPSILON
  }));
  const handPulls = sections.filter(section => section.pullMethod === 'hand').map(section => ({
    index: section.index,
    point: section.endPoint.slice(),
    distanceFromPullStart: section.endDistance,
    sectionLengthFt: section.length,
    requiredForceLbf: section.maxTension,
    maxDistanceFt: settings.maxHandPullLengthFt,
    maxForceLbf: settings.maxHandPullTensionLbf,
    pass: true
  }));
  const failedSections = sections.filter(section => !section.pass);
  const equipmentFailures = [
    ...tuggers.filter(item => !item.pass),
    ...sheaves.filter(item => !item.pass)
  ];
  const maxTension = Math.max(0, ...sections.map(section => section.maxTension));
  const maxSidewallPressure = Math.max(0, ...sections.map(section => section.maxSidewallPressure));
  const status = failedSections.length || equipmentFailures.length
    ? 'review-required'
    : sections.length > 1
      ? 'setups-required'
      : 'pass';
  const utilization = Math.max(
    properties.maxTension ? maxTension / properties.maxTension : 0,
    properties.maxSidewallPressure ? maxSidewallPressure / properties.maxSidewallPressure : 0,
    ...sheaves.map(item => item.capacityLbf ? item.reactionLbf / item.capacityLbf : 0)
  );

  return {
    direction: directionName,
    status,
    sections,
    setupPoints,
    reels,
    tuggers,
    handPulls,
    sheaves,
    rollers,
    maxTension,
    maxSidewallPressure,
    continuousPull: {
      maxTension: continuous.maxTension,
      maxSidewallPressure: continuous.maxSidewallPressure,
      pass: continuous.pass,
      reasons: continuous.reasons
    },
    score: sections.length * 1000 + tuggers.length * 100 + utilization * 100 + equipmentFailures.length * 10000,
    equipmentFailures: equipmentFailures.length
  };
};

const directionSummary = plan => ({
  direction: plan.direction,
  status: plan.status,
  sections: plan.sections.length,
  maxTension: plan.maxTension,
  maxSidewallPressure: plan.maxSidewallPressure,
  handPulls: plan.handPulls.length,
  tuggers: plan.tuggers.length,
  equipmentFailures: plan.equipmentFailures,
  score: plan.score
});

export function buildCablePullPlan(routeSegments = [], cable = {}, options = {}) {
  const forwardPieces = normalizeRoutePieces(routeSegments);
  const settings = {
    maxPullLengthFt: finitePositive(options.maxPullLengthFt) || 500,
    defaultBendRadiusFt: finitePositive(options.defaultBendRadiusFt) || 3,
    pullerCapacityLbf: finitePositive(options.pullerCapacityLbf) || 3000,
    ropeCapacityLbf: finitePositive(options.ropeCapacityLbf) || 5000,
    gripCapacityLbf: finitePositive(options.gripCapacityLbf) || 1000,
    anchorageCapacityLbf: finitePositive(options.anchorageCapacityLbf) || 3000,
    sheaveCapacityLbf: finitePositive(options.sheaveCapacityLbf) || 4000,
    maxRollerSpacingFt: finitePositive(options.maxRollerSpacingFt) || 10,
    allowHandPulls: options.allowHandPulls !== false,
    maxHandPullLengthFt: finitePositive(options.maxHandPullLengthFt) || 25,
    maxHandPullTensionLbf: finitePositive(options.maxHandPullTensionLbf) || 200,
    pullDirection: ['forward', 'reverse'].includes(options.pullDirection) ? options.pullDirection : 'auto'
  };
  const properties = cablePullProperties(cable, { ...options, ...settings });
  const missingInputs = [];
  if (!properties.weight) missingInputs.push('Cable weight (lb/ft)');
  if (!properties.cableMaxTension) missingInputs.push('Allowable cable pulling tension');
  if (!properties.maxSidewallPressure) missingInputs.push('Allowable sidewall pressure');
  if (!forwardPieces.length) missingInputs.push('Route geometry');

  if (missingInputs.length) {
    return {
      enabled: true,
      status: 'inputs-required',
      missingInputs,
      maxTension: null,
      allowableTension: properties.maxTension,
      cableAllowableTension: properties.cableMaxTension,
      maxSidewallPressure: null,
      allowableSidewallPressure: properties.maxSidewallPressure,
      sections: [],
      setupPoints: [],
      equipment: { reels: [], tuggers: [], handPulls: [], sheaves: [], rollers: [] },
      assumptions: {
        coeffFriction: properties.coeffFriction,
        defaultBendRadiusFt: settings.defaultBendRadiusFt,
        maxPullLengthFt: settings.maxPullLengthFt
      }
    };
  }

  const forward = buildDirectionalPlan(forwardPieces, properties, settings, 'forward');
  const reverse = buildDirectionalPlan(reversePieces(forwardPieces), properties, settings, 'reverse');
  const selected = settings.pullDirection === 'forward'
    ? forward
    : settings.pullDirection === 'reverse'
      ? reverse
      : reverse.score + EPSILON < forward.score
        ? reverse
        : forward;
  const startLabel = selected.direction === 'reverse'
    ? (cable?.end_tag || cable?.to || 'End')
    : (cable?.start_tag || cable?.from || 'Start');
  const endLabel = selected.direction === 'reverse'
    ? (cable?.start_tag || cable?.from || 'Start')
    : (cable?.end_tag || cable?.to || 'End');

  return {
    enabled: true,
    status: selected.status,
    missingInputs: [],
    direction: selected.direction,
    directionMode: settings.pullDirection,
    directionLabel: `${startLabel} → ${endLabel}`,
    directionComparison: {
      forward: directionSummary(forward),
      reverse: directionSummary(reverse)
    },
    maxTension: selected.maxTension,
    allowableTension: properties.maxTension,
    cableAllowableTension: properties.cableMaxTension,
    maxSidewallPressure: selected.maxSidewallPressure,
    allowableSidewallPressure: properties.maxSidewallPressure,
    continuousPull: selected.continuousPull,
    sections: selected.sections.map(section => {
      const { pieces, analysisInputs, traceSegments, ...serializable } = section;
      return serializable;
    }),
    setupPoints: selected.setupPoints,
    equipment: {
      reels: selected.reels,
      tuggers: selected.tuggers,
      handPulls: selected.handPulls,
      sheaves: selected.sheaves,
      rollers: selected.rollers,
      weakestLink: properties.limits.weakest,
      tensionLimits: properties.limits.components,
      counts: {
        reels: selected.reels.length,
        tuggers: selected.tuggers.length,
        handPulls: selected.handPulls.length,
        sheaves: selected.sheaves.length,
        rollers: selected.rollers.length
      }
    },
    assumptions: {
      coeffFriction: properties.coeffFriction,
      defaultBendRadiusFt: settings.defaultBendRadiusFt,
      maxPullLengthFt: settings.maxPullLengthFt,
      incomingTensionLbf: properties.incomingTension,
      incomingTensionSource: properties.incomingTensionSource,
      maxRollerSpacingFt: settings.maxRollerSpacingFt,
      allowHandPulls: settings.allowHandPulls,
      maxHandPullLengthFt: settings.maxHandPullLengthFt,
      maxHandPullTensionLbf: settings.maxHandPullTensionLbf,
      sheaveCapacityLbf: settings.sheaveCapacityLbf,
      inferredBends: true
    }
  };
}

export { analysisSegments };
