const normalizeAlias = value => String(value || '').trim().toUpperCase();

export function formatConduitCountText(count, hasSchedule) {
    const normalizedCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    return `Conduits added: ${normalizedCount}${normalizedCount === 0 && hasSchedule ? ' (No valid conduits found; check geometry or IDs)' : ''}`;
}

export function getConduitAliases(conduit = {}, ductbankTag = '') {
    const parent = normalizeAlias(conduit.ductbankTag || conduit.ductbank_tag || conduit.ductbank || ductbankTag);
    const ids = [conduit.conduit_id, conduit.id, conduit.tag, conduit.tray_id]
        .map(normalizeAlias)
        .filter(Boolean);
    const aliases = new Set();
    ids.forEach(id => {
        aliases.add(`${parent}:${id}`);
        if (parent && !id.startsWith(`${parent}-`)) aliases.add(`${parent}:${parent}-${id}`);
        if (parent && id.startsWith(`${parent}-`)) aliases.add(`${parent}:${id.slice(parent.length + 1)}`);
    });
    return [...aliases];
}

const addUniqueConduit = (target, conduit, seenAliases) => {
    const aliases = getConduitAliases(conduit);
    if (aliases.some(alias => seenAliases.has(alias))) return;
    aliases.forEach(alias => seenAliases.add(alias));
    target.push(conduit);
};

export function expandScheduledRaceways(rawDuctbanks = [], rawConduits = []) {
    const nestedConduits = [];
    const conduits = Array.isArray(rawConduits) ? rawConduits : [];
    const topLevelAliases = new Set();
    conduits.forEach(conduit => getConduitAliases(conduit).forEach(alias => topLevelAliases.add(alias)));
    const ductbanks = (Array.isArray(rawDuctbanks) ? rawDuctbanks : []).map(ductbank => {
        (Array.isArray(ductbank.conduits) ? ductbank.conduits : []).forEach(conduit => {
            const ductbankTag = ductbank.tag || ductbank.id || ductbank.ductbank_id;
            const normalized = {
                ductbankTag,
                conduit_id: conduit.conduit_id || conduit.id || conduit.tag,
                tray_id: conduit.tray_id || conduit.tag || (ductbankTag && conduit.conduit_id ? `${ductbankTag}-${conduit.conduit_id}` : conduit.conduit_id),
                type: conduit.type || conduit.conduit_type,
                trade_size: conduit.trade_size,
                row: conduit.row,
                column: conduit.column ?? conduit.col,
                diameter: conduit.diameter,
                start_x: conduit.start_x,
                start_y: conduit.start_y,
                start_z: conduit.start_z,
                end_x: conduit.end_x,
                end_y: conduit.end_y,
                end_z: conduit.end_z,
                allowed_cable_group: conduit.allowed_cable_group
            };
            if (!getConduitAliases(normalized, ductbankTag).some(alias => topLevelAliases.has(alias))) {
                nestedConduits.push(normalized);
            }
        });
        const rest = { ...ductbank };
        delete rest.conduits;
        return rest;
    });
    const uniqueConduits = [];
    const seenAliases = new Set();
    conduits.forEach(conduit => addUniqueConduit(uniqueConduits, conduit, seenAliases));
    nestedConduits.forEach(conduit => addUniqueConduit(uniqueConduits, conduit, seenAliases));
    return { ductbanks, conduits: uniqueConduits };
}

export function normalizeTraySchedule(trays = []) {
    return trays.map(tray => ({
        tray_id: tray.tray_id,
        start_x: parseFloat(tray.start_x),
        start_y: parseFloat(tray.start_y),
        start_z: parseFloat(tray.start_z),
        end_x: parseFloat(tray.end_x),
        end_y: parseFloat(tray.end_y),
        end_z: parseFloat(tray.end_z),
        width: parseFloat(tray.inside_width),
        height: parseFloat(tray.tray_depth),
        num_slots: Math.max(1, parseInt(tray.num_slots) || 1),
        slot_groups: tray.slot_groups || null,
        current_fill: 0,
        shape: 'STR',
        allowed_cable_group: tray.allowed_cable_group || '',
        raceway_type: 'tray'
    }));
}

export function parseCableThickness(value) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return value;
    const text = String(value).trim().toLowerCase();
    const number = parseFloat(text);
    if (Number.isNaN(number)) return undefined;
    if (text.endsWith('mm')) return number / 25.4;
    if (text.endsWith('cm')) return number / 2.54;
    return number;
}

export function normalizeCableSchedule(cables = [], conductorProps = {}, { warningLog = () => {} } = {}) {
    return cables.map(cable => {
        const {
            tag,
            from_tag,
            to_tag,
            start_x,
            start_y,
            start_z,
            end_x,
            end_y,
            end_z,
            raceway_ids,
            cable_od,
            diameter: diameterRaw,
            OD,
            od,
            ...rest
        } = cable;
        let diameter = parseFloat(diameterRaw ?? cable_od ?? OD ?? od);
        let weight = parseFloat(rest.weight);
        const size = (rest.conductor_size || '').trim();
        const properties = conductorProps[size];
        if (!diameter) {
            let bare = 0.25;
            if (properties?.area_cm) {
                bare = Math.sqrt(properties.area_cm) / 1000;
            } else {
                warningLog(`Unknown conductor size '${size}' for cable ${tag}; using ${bare} in.`);
            }
            let insulation = parseCableThickness(rest.insulation_thickness);
            if (insulation === undefined) {
                if (properties?.insulation_thickness !== undefined) {
                    insulation = properties.insulation_thickness;
                } else {
                    insulation = 0.03;
                    warningLog(`Missing insulation thickness for cable ${tag}; assuming ${insulation} in.`);
                }
            }
            let shielding = parseCableThickness(rest.shielding_jacket);
            if (rest.shielding_jacket && shielding === undefined) {
                warningLog(`Unrecognized shielding/jacket value '${rest.shielding_jacket}' for cable ${tag}; assuming 0 in.`);
            }
            shielding = shielding || 0;
            diameter = bare + 2 * (insulation + shielding);
        }
        if (Number.isNaN(weight)) {
            if (properties?.area_cm) {
                const areaSquareInches = properties.area_cm * 7.8539816e-7;
                const conductors = parseFloat(rest.conductors) || 1;
                const material = String(rest.conductor_material || 'copper').toLowerCase();
                const density = material.startsWith('al') ? 0.0975 : 0.321;
                weight = areaSquareInches * density * 12 * conductors;
            } else {
                weight = 0;
            }
        }
        return {
            name: tag,
            start_tag: from_tag,
            end_tag: to_tag,
            start: [parseFloat(start_x), parseFloat(start_y), parseFloat(start_z)],
            end: [parseFloat(end_x), parseFloat(end_y), parseFloat(end_z)],
            manual_path: '',
            ...rest,
            diameter,
            weight,
            raceway_ids: Array.isArray(raceway_ids) ? raceway_ids : [],
            locked: 'locked' in rest ? rest.locked : false,
            route_segments: Array.isArray(rest.route_segments) ? rest.route_segments : []
        };
    });
}

export function normalizeDuctbankSchedule(ductbanks = [], conduits = []) {
    const conduitsByDuctbank = {};
    const standaloneConduits = [];
    conduits.forEach(conduit => {
        const key = normalizeAlias(conduit.ductbankTag);
        if (key) {
            (conduitsByDuctbank[key] ||= []).push(conduit);
        } else {
            standaloneConduits.push(conduit);
        }
    });
    const normalizedDuctbanks = ductbanks.map(ductbank => {
        const tag = ductbank.tag;
        const key = normalizeAlias(tag);
        return {
            id: ductbank.id || ductbank.tag || ductbank.ductbank_id,
            tag,
            width: ductbank.width ?? ductbank.inside_width,
            height: ductbank.height ?? ductbank.depth,
            conduit_spacing: ductbank.conduit_spacing ?? ductbank.spacing,
            outline: [
                [parseFloat(ductbank.start_x), parseFloat(ductbank.start_y), parseFloat(ductbank.start_z)],
                [parseFloat(ductbank.end_x), parseFloat(ductbank.end_y), parseFloat(ductbank.end_z)]
            ],
            conduits: (conduitsByDuctbank[key] || []).map(conduit => {
                const conduitId = conduit.conduit_id || conduit.id;
                const trayId = conduit.tray_id || `${tag}-${conduitId}`;
                return {
                    id: conduitId,
                    tag: trayId,
                    tray_id: trayId,
                    conduit_id: conduitId,
                    ductbankTag: tag,
                    type: conduit.type,
                    conduit_type: conduit.type,
                    trade_size: conduit.trade_size,
                    diameter: conduit.diameter,
                    row: conduit.row,
                    column: conduit.column ?? conduit.col,
                    path: [
                        [parseFloat(conduit.start_x), parseFloat(conduit.start_y), parseFloat(conduit.start_z)],
                        [parseFloat(conduit.end_x), parseFloat(conduit.end_y), parseFloat(conduit.end_z)]
                    ],
                    allowed_cable_group: conduit.allowed_cable_group
                };
            })
        };
    });
    return {
        ductbankData: { ductbanks: normalizedDuctbanks },
        conduitsByDuctbank,
        standaloneConduits,
        ductbanksWithoutConduits: normalizedDuctbanks
            .filter(ductbank => (conduitsByDuctbank[normalizeAlias(ductbank.tag || ductbank.id)] || []).length === 0)
            .map(ductbank => ductbank.tag || ductbank.id)
    };
}

const conduitDiameter = (conduit, conduitSpecs) => {
    const area = (conduitSpecs[conduit.type] || {})[conduit.trade_size];
    return area ? Math.sqrt((4 * area) / Math.PI) : parseFloat(conduit.diameter) || 0;
};

export function buildRoutingRacewayData({
    manualTrays = [],
    ductbankData = {},
    conduitData = [],
    includeDuctbankOutlines = false,
    conduitSpecs = {},
    warningLog = () => {}
} = {}) {
    const trayData = manualTrays.map(tray => ({ ...tray }));
    const geometryWarnings = { ductbanks: [], conduits: [] };
    (ductbankData.ductbanks || []).forEach(ductbank => {
        const hasOutline = Array.isArray(ductbank.outline) && ductbank.outline.length >= 2;
        const start = hasOutline
            ? ductbank.outline[0]
            : [parseFloat(ductbank.start_x), parseFloat(ductbank.start_y), parseFloat(ductbank.start_z)];
        const end = hasOutline
            ? ductbank.outline[ductbank.outline.length - 1]
            : [parseFloat(ductbank.end_x), parseFloat(ductbank.end_y), parseFloat(ductbank.end_z)];
        const coordinatesValid = start.every(value => !isNaN(value)) && end.every(value => !isNaN(value));
        if (!hasOutline && !coordinatesValid) {
            const id = ductbank.id || ductbank.tag || '(unnamed)';
            geometryWarnings.ductbanks.push(id);
            warningLog(`Skipping ductbank ${id}: missing outline and coordinates.`);
            return;
        }
        if (includeDuctbankOutlines && coordinatesValid) {
            trayData.push({
                tray_id: ductbank.id || ductbank.tag,
                start_x: start[0], start_y: start[1], start_z: start[2],
                end_x: end[0], end_y: end[1], end_z: end[2],
                width: parseFloat(ductbank.width) || 12,
                height: parseFloat(ductbank.height) || 12,
                current_fill: 0,
                shape: 'STR',
                allowed_cable_group: '',
                raceway_type: 'ductbank'
            });
        }
        (ductbank.conduits || []).forEach(conduit => {
            if (!Array.isArray(conduit.path) || conduit.path.length < 2) {
                const id = conduit.conduit_id || conduit.id || '(unnamed)';
                geometryWarnings.conduits.push(id);
                warningLog(`Skipping conduit ${id}: missing path.`);
                return;
            }
            const conduitId = conduit.conduit_id || conduit.id;
            const ductbankTag = conduit.ductbankTag || ductbank.tag || ductbank.id || ductbank.ductbank_id;
            const startPoint = conduit.path[0];
            const endPoint = conduit.path[conduit.path.length - 1];
            const diameter = conduitDiameter(conduit, conduitSpecs);
            trayData.push({
                tray_id: `${ductbankTag}-${conduitId}`,
                ductbankTag,
                conduit_id: conduitId,
                start_x: startPoint[0], start_y: startPoint[1], start_z: startPoint[2],
                end_x: endPoint[0], end_y: endPoint[1], end_z: endPoint[2],
                width: diameter,
                height: diameter,
                row: conduit.row,
                column: conduit.column ?? conduit.col,
                current_fill: 0,
                shape: 'STR',
                allowed_cable_group: conduit.allowed_cable_group || '',
                raceway_type: 'conduit'
            });
        });
    });
    conduitData.forEach(conduit => {
        const conduitId = conduit.conduit_id || conduit.id;
        const diameter = conduitDiameter(conduit, conduitSpecs);
        trayData.push({
            tray_id: conduit.tray_id || conduitId,
            ductbankTag: conduit.ductbankTag,
            conduit_id: conduitId,
            start_x: parseFloat(conduit.start_x), start_y: parseFloat(conduit.start_y), start_z: parseFloat(conduit.start_z),
            end_x: parseFloat(conduit.end_x), end_y: parseFloat(conduit.end_y), end_z: parseFloat(conduit.end_z),
            width: diameter,
            height: diameter,
            row: conduit.row,
            column: conduit.column ?? conduit.col,
            current_fill: 0,
            shape: 'STR',
            allowed_cable_group: conduit.allowed_cable_group || '',
            raceway_type: 'conduit'
        });
    });
    return {
        trayData,
        geometryWarnings,
        conduitCount: trayData.filter(row => row.raceway_type === 'conduit').length,
        hasSchedule: Boolean(
            (ductbankData.ductbanks || []).some(ductbank => (ductbank.conduits || []).length)
            || conduitData.length
        )
    };
}
