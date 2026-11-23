const explicitId = cable => cable?.id == null || cable.id === '' ? null : String(cable.id);
const alias = cable => String(cable?.tag ?? cable?.cable_tag ?? cable?.name ?? '').trim();

const editableFieldMap = {
    name: 'tag',
    start_tag: 'from_tag',
    end_tag: 'to_tag',
    cable_type: 'cable_type',
    conductors: 'conductors',
    conductor_size: 'conductor_size',
    diameter: 'diameter',
    weight: 'weight',
    allowed_cable_group: 'allowed_cable_group',
    manual_path: 'manual_path',
    locked: 'locked',
};

const findCanonicalMatch = (canonical, edited, fallback = null) => {
    const id = explicitId(edited);
    if (id) {
        const byId = canonical.filter(candidate => explicitId(candidate) === id);
        if (byId.length === 1) return byId[0];
    }
    const candidates = canonical.filter(candidate => {
        const candidateId = explicitId(candidate);
        return alias(candidate) === alias(edited) && (!id || !candidateId || candidateId === id);
    });
    if (candidates.length === 1) return candidates[0];
    if (fallback) return findCanonicalMatch(canonical, fallback);
    return null;
};

/** Apply one explicit routing-table edit to its canonical schedule record. */
export function applyCanonicalCableEdit(canonicalCables = [], editedCable, { field, coordinate, value, previousCable = null } = {}) {
    const canonical = Array.isArray(canonicalCables) ? canonicalCables : [];
    const match = findCanonicalMatch(canonical, editedCable, previousCable);
    if (!match) return canonical;
    let key = editableFieldMap[field];
    if (field === 'start' || field === 'end') {
        const axis = ['x', 'y', 'z'][Number.parseInt(coordinate, 10)];
        if (!axis) return canonical;
        key = `${field === 'start' ? 'start' : 'end'}_${axis}`;
    }
    if (!key) return canonical;
    return canonical.map(candidate => candidate === match ? { ...candidate, [key]: value } : candidate);
}

/** Remove one explicitly deleted routing-table record from the canonical schedule. */
export function removeCanonicalCable(canonicalCables = [], deletedCable) {
    const canonical = Array.isArray(canonicalCables) ? canonicalCables : [];
    const match = findCanonicalMatch(canonical, deletedCable);
    return match ? canonical.filter(candidate => candidate !== match) : canonical;
}

/** Persist an intentional routing-table edit while leaving built-in samples session-only. */
export function persistCanonicalCableEdit({ sampleDataMode = false, getCables, setCables, cable, field, coordinate, value, previousCable = null } = {}) {
    if (sampleDataMode || typeof getCables !== 'function' || typeof setCables !== 'function') return;
    setCables(applyCanonicalCableEdit(getCables(), cable, { field, coordinate, value, previousCable }));
}

const derivedFields = route => ({
    ...(Object.prototype.hasOwnProperty.call(route, 'route_segments') ? { route_segments: route.route_segments } : {}),
    ...(Object.prototype.hasOwnProperty.call(route, 'voltage_drop_pct') ? { voltage_drop_pct: route.voltage_drop_pct } : {}),
});

const canonicalFromProjection = route => {
    const {
        name: _name,
        cable: _cable,
        cable_tag: _cableTag,
        start: _start,
        end: _end,
        start_tag: _startTag,
        end_tag: _endTag,
        ...engineeringFields
    } = route;
    const start = Array.isArray(route.start) ? route.start : [];
    const end = Array.isArray(route.end) ? route.end : [];
    const tag = route.tag ?? route.cable_tag ?? route.name ?? route.cable ?? route.id;
    return {
        ...engineeringFields,
        ...(route.id != null ? { id: route.id } : {}),
        ...(tag != null ? { tag } : {}),
        ...((route.from_tag ?? route.start_tag) != null ? { from_tag: route.from_tag ?? route.start_tag } : {}),
        ...((route.to_tag ?? route.end_tag) != null ? { to_tag: route.to_tag ?? route.end_tag } : {}),
        ...(start.length >= 3 ? { start_x: start[0], start_y: start[1], start_z: start[2] } : {}),
        ...(end.length >= 3 ? { end_x: end[0], end_y: end[1], end_z: end[2] } : {}),
        ...derivedFields(route),
    };
};

/** Merge routing-derived fields without replacing canonical cable schedule records. */
export function mergeCanonicalCableRoutes(canonicalCables = [], routingCables = [], { allowAdd = true, originalCables = canonicalCables } = {}) {
    const canonical = Array.isArray(canonicalCables) ? canonicalCables : [];
    const routed = Array.isArray(routingCables) ? routingCables : [];
    const canonicalById = new Map(canonical.filter(cable => explicitId(cable)).map(cable => [explicitId(cable), cable]));
    const canonicalByAlias = new Map();
    canonical.forEach(cable => {
        const key = alias(cable);
        if (!key) return;
        const records = canonicalByAlias.get(key) || [];
        records.push(cable);
        canonicalByAlias.set(key, records);
    });
    const originalRecords = Array.isArray(originalCables) ? originalCables : [];
    const originalIds = new Set(originalRecords.map(explicitId).filter(Boolean));
    const wasOriginalIdentity = route => {
        const id = explicitId(route);
        if (id && originalIds.has(id)) return true;
        const candidates = originalRecords.filter(original => {
            const originalId = explicitId(original);
            return alias(original) === alias(route) && (!id || !originalId || originalId === id);
        });
        return candidates.length === 1;
    };
    const consumedRouteIds = new Set();
    const findMatch = route => {
        const id = explicitId(route);
        if (id) {
            const byId = canonicalById.get(id);
            if (byId) return byId;
        }
        const candidates = (canonicalByAlias.get(alias(route)) || []).filter(candidate => {
            const candidateId = explicitId(candidate);
            return !id || !candidateId || candidateId === id;
        });
        return candidates.length === 1 ? candidates[0] : null;
    };
    const merged = canonical.map(cable => {
        const route = routed.find(candidate => {
            const match = findMatch(candidate);
            const id = explicitId(candidate);
            return match === cable && (!id || !consumedRouteIds.has(id));
        });
        if (!route) return cable;
        if (explicitId(route)) consumedRouteIds.add(explicitId(route));
        return { ...cable, ...derivedFields(route) };
    });
    if (!allowAdd) return merged;
    routed.forEach(route => {
        const match = findMatch(route);
        const id = explicitId(route);
        if (match || (id && consumedRouteIds.has(id))) return;
        if (wasOriginalIdentity(route)) return;
        const projected = canonicalFromProjection(route);
        if (projected.id && canonicalById.has(projected.id)) return;
        merged.push(projected);
        if (id) consumedRouteIds.add(id);
    });
    return merged;
}
