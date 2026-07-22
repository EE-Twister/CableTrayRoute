const text = value => String(value || '').trim();

const compactPoint = value => Array.isArray(value)
    ? value.slice(0, 3).map(Number)
    : undefined;

const compactRouteSegment = segment => ({
    type: segment?.type || 'raceway',
    start: compactPoint(segment?.start),
    end: compactPoint(segment?.end),
    length: Number(segment?.length) || 0,
    ...(text(segment?.tray_id) ? { tray_id: text(segment.tray_id) } : {}),
    ...(text(segment?.conduit_id) ? { conduit_id: text(segment.conduit_id) } : {}),
    ...(text(segment?.ductbankTag || segment?.ductbank_tag) ? { ductbankTag: text(segment.ductbankTag || segment.ductbank_tag) } : {}),
    ...(Number.isFinite(Number(segment?.radius)) ? { radius: Number(segment.radius) } : {})
});

const compactExclusions = records => {
    const seen = new Set();
    return (Array.isArray(records) ? records : []).flatMap(record => {
        const trayId = text(record?.tray_id || record?.id);
        const reason = text(record?.reason) || 'other';
        const key = `${trayId.toLowerCase()}|${reason.toLowerCase()}`;
        if (!trayId || seen.has(key)) return [];
        seen.add(key);
        return [{
            tray_id: trayId,
            reason,
            ...(text(record?.conduit_id) ? { conduit_id: text(record.conduit_id) } : {}),
            ...(text(record?.ductbank_tag || record?.ductbankTag) ? { ductbank_tag: text(record.ductbank_tag || record.ductbankTag) } : {})
        }];
    });
};

export function compactRouteResultForStorage(result = {}) {
    const {
        breakdown: _breakdown,
        tray_segments: _traySegments,
        mismatched_records: _mismatchedRecords,
        route_segments: routeSegments,
        exclusions,
        ...rest
    } = result;
    return {
        ...rest,
        route_segments: (Array.isArray(routeSegments) ? routeSegments : []).map(compactRouteSegment),
        exclusions: compactExclusions(exclusions)
    };
}

export function compactCableReference(cable = {}) {
    const name = text(cable.name || cable.tag || cable.id);
    return {
        name,
        ...(text(cable.tag) && text(cable.tag) !== name ? { tag: text(cable.tag) } : {}),
        ...(Number.isFinite(Number(cable.diameter)) ? { diameter: Number(cable.diameter) } : {}),
        ...(Number.isFinite(Number(cable.parallel_count)) && Number(cable.parallel_count) > 1 ? { parallel_count: Number(cable.parallel_count) } : {}),
        ...(text(cable.allowed_cable_group) ? { allowed_cable_group: text(cable.allowed_cable_group) } : {}),
        ...(text(cable.conduit_id) ? { conduit_id: text(cable.conduit_id) } : {})
    };
}

export function compactTrayCableMapForStorage(source = {}) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    return Object.fromEntries(Object.entries(source).map(([racewayId, cables]) => {
        const seen = new Set();
        const compactCables = (Array.isArray(cables) ? cables : []).flatMap(cable => {
            const compact = compactCableReference(cable);
            const key = `${compact.name.toLowerCase()}|${text(compact.conduit_id).toLowerCase()}`;
            if (!compact.name || seen.has(key)) return [];
            seen.add(key);
            return [compact];
        });
        return [racewayId, compactCables];
    }));
}

export function compactRouteResultStateForStorage(state = {}) {
    const screeningCatalog = {};
    const screeningRecords = {};
    const screeningRefs = new Map();
    const screeningRecordRefs = new Map();
    const batchResults = (Array.isArray(state.batchResults) ? state.batchResults : []).map(result => {
        const compact = compactRouteResultForStorage(result);
        if (!compact.exclusions.length) return compact;
        const signature = JSON.stringify(compact.exclusions);
        let screeningRef = screeningRefs.get(signature);
        if (!screeningRef) {
            screeningRef = `screening-${screeningRefs.size + 1}`;
            screeningRefs.set(signature, screeningRef);
            screeningCatalog[screeningRef] = compact.exclusions.map(exclusion => {
                const recordSignature = JSON.stringify(exclusion);
                let recordRef = screeningRecordRefs.get(recordSignature);
                if (!recordRef) {
                    recordRef = `record-${screeningRecordRefs.size + 1}`;
                    screeningRecordRefs.set(recordSignature, recordRef);
                    screeningRecords[recordRef] = exclusion;
                }
                return recordRef;
            });
        }
        const { exclusions: _exclusions, ...routeResult } = compact;
        return { ...routeResult, screening_ref: screeningRef };
    });
    const {
        routedCableNames: _routedCableNames,
        screeningCatalog: _screeningCatalog,
        screeningRecords: _screeningRecords,
        trayCableMap: _trayCableMap,
        ...rest
    } = state;
    return {
        ...rest,
        batchResults,
        trayCableMap: {},
        screeningCatalog,
        screeningRecords
    };
}
