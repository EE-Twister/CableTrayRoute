export function calcSidewallPressure(bendRadius, tension) {
    if (!bendRadius) return 0;
    return tension / bendRadius;
}

export function calcPullTension(routeSegments = [], cableProps = {}) {
    const mu = cableProps.coeffFriction ?? cableProps.mu ?? 0.35;
    const weight = cableProps.weight ?? 0;
    let tension = 0;
    let maxTension = 0;
    let maxSidewall = 0;
    for (const seg of routeSegments) {
        if (!seg) continue;
        if (seg.type === 'bend') {
            tension += weight * mu * (seg.length || 0);
            tension *= Math.exp(mu * (seg.angle || 0));
            const swp = calcSidewallPressure(seg.radius || 1, tension);
            if (swp > maxSidewall) maxSidewall = swp;
        } else {
            tension += weight * mu * (seg.length || 0);
        }
        if (tension > maxTension) maxTension = tension;
    }
    return {
        totalTension: tension,
        maxTension,
        maxSidewallPressure: maxSidewall,
        allowableTension: cableProps.maxTension ?? cableProps.allowableTension ?? cableProps.max_tension ?? Infinity,
        allowableSidewallPressure: cableProps.maxSidewallPressure ?? cableProps.allowableSidewallPressure ?? cableProps.max_sidewall_pressure ?? Infinity
    };
}

if (typeof self !== 'undefined') {
    self.calcPullTension = calcPullTension;
    self.calcSidewallPressure = calcSidewallPressure;
}
