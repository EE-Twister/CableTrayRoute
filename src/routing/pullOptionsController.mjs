const PULL_OPTION_IDS = Object.freeze({
    pullMaxLength: 'pull-max-length',
    allowHandPulls: 'allow-hand-pulls',
    handPullMaxLength: 'hand-pull-max-length',
    handPullMaxTension: 'hand-pull-max-tension',
    pullMaxTension: 'pull-max-tension',
    pullMaxSidewall: 'pull-max-sidewall',
    pullCableLimitSource: 'pull-cable-limit-source',
    pullFriction: 'pull-friction',
    pullBendRadius: 'pull-bend-radius',
    pullBendGeometryConfirmed: 'pull-bend-geometry-confirmed',
    pullBendGeometrySource: 'pull-bend-geometry-source',
    pullDirection: 'pull-direction',
    pullIncomingTension: 'pull-incoming-tension',
    pullPullerCapacity: 'pull-puller-capacity',
    pullRopeCapacity: 'pull-rope-capacity',
    pullGripCapacity: 'pull-grip-capacity',
    pullAnchorageCapacity: 'pull-anchorage-capacity',
    pullSheaveCapacity: 'pull-sheave-capacity',
    pullEquipmentRatingsSource: 'pull-equipment-ratings-source',
    pullRollerSpacing: 'pull-roller-spacing',
    pullPointAccessSource: 'pull-point-access-source',
    pullGroupSuggestions: 'pull-group-suggestions',
    pullGroupMaxSize: 'pull-group-max-size'
});

const RESTORE_BINDINGS = Object.freeze([
    ['pullMaxLength', 'maxPullLengthFt'],
    ['allowHandPulls', 'allowHandPulls', 'checked-default-true'],
    ['handPullMaxLength', 'maxHandPullLengthFt'],
    ['handPullMaxTension', 'maxHandPullTensionLbf'],
    ['pullMaxTension', 'allowableTension'],
    ['pullMaxSidewall', 'allowableSidewallPressure'],
    ['pullCableLimitSource', 'cableLimitSource'],
    ['pullFriction', 'coeffFriction'],
    ['pullBendRadius', 'defaultBendRadiusFt'],
    ['pullBendGeometryConfirmed', 'bendGeometryConfirmed', 'checked-true'],
    ['pullBendGeometrySource', 'bendGeometrySource'],
    ['pullDirection', 'pullDirection'],
    ['pullIncomingTension', 'incomingTensionLbf'],
    ['pullPullerCapacity', 'pullerCapacityLbf'],
    ['pullRopeCapacity', 'ropeCapacityLbf'],
    ['pullGripCapacity', 'gripCapacityLbf'],
    ['pullAnchorageCapacity', 'anchorageCapacityLbf'],
    ['pullSheaveCapacity', 'sheaveCapacityLbf'],
    ['pullEquipmentRatingsSource', 'equipmentRatingsSource'],
    ['pullRollerSpacing', 'maxRollerSpacingFt'],
    ['pullPointAccessSource', 'pullPointAccessSource'],
    ['pullGroupSuggestions', 'suggestPullGroups', 'checked-default-true'],
    ['pullGroupMaxSize', 'maxPullGroupSize']
]);

const REFRESH_INPUT_KEYS = Object.freeze(Object.keys(PULL_OPTION_IDS)
    .filter(key => key !== 'allowHandPulls'));

export const createPullOptionElements = root => Object.fromEntries(
    Object.entries(PULL_OPTION_IDS).map(([key, id]) => [key, root.getElementById(id)])
);

export const readPullCheckOptions = elements => ({
    maxPullLengthFt: parseFloat(elements.pullMaxLength?.value) || 500,
    allowHandPulls: elements.allowHandPulls?.checked !== false,
    maxHandPullLengthFt: parseFloat(elements.handPullMaxLength?.value) || 25,
    maxHandPullTensionLbf: parseFloat(elements.handPullMaxTension?.value) || 200,
    allowableTension: parseFloat(elements.pullMaxTension?.value) || 1000,
    allowableSidewallPressure: parseFloat(elements.pullMaxSidewall?.value) || 500,
    cableLimitSource: String(elements.pullCableLimitSource?.value || '').trim(),
    coeffFriction: parseFloat(elements.pullFriction?.value) || 0.35,
    defaultBendRadiusFt: parseFloat(elements.pullBendRadius?.value) || 3,
    bendGeometryConfirmed: elements.pullBendGeometryConfirmed?.checked === true,
    bendGeometrySource: String(elements.pullBendGeometrySource?.value || '').trim(),
    pullDirection: elements.pullDirection?.value || 'auto',
    incomingTensionLbf: Math.max(0, parseFloat(elements.pullIncomingTension?.value) || 0),
    pullerCapacityLbf: parseFloat(elements.pullPullerCapacity?.value) || 3000,
    ropeCapacityLbf: parseFloat(elements.pullRopeCapacity?.value) || 5000,
    gripCapacityLbf: parseFloat(elements.pullGripCapacity?.value) || 1000,
    anchorageCapacityLbf: parseFloat(elements.pullAnchorageCapacity?.value) || 3000,
    sheaveCapacityLbf: parseFloat(elements.pullSheaveCapacity?.value) || 4000,
    equipmentRatingsSource: String(elements.pullEquipmentRatingsSource?.value || '').trim(),
    maxRollerSpacingFt: parseFloat(elements.pullRollerSpacing?.value) || 10,
    pullPointAccessSource: String(elements.pullPointAccessSource?.value || '').trim(),
    suggestPullGroups: elements.pullGroupSuggestions?.checked !== false,
    maxPullGroupSize: Math.max(2, Math.min(12, parseInt(elements.pullGroupMaxSize?.value, 10) || 4))
});

export const restorePullCheckOptions = (elements, options = {}) => {
    RESTORE_BINDINGS.forEach(([elementKey, optionKey, mode]) => {
        const element = elements[elementKey];
        const value = options[optionKey];
        if (!element || value === undefined) return;
        if (mode === 'checked-default-true') element.checked = value !== false;
        else if (mode === 'checked-true') element.checked = value === true;
        else element.value = value;
    });
};

export const getPullAnalysisInputs = elements => REFRESH_INPUT_KEYS
    .map(key => elements[key])
    .filter(Boolean);
