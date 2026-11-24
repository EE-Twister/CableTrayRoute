export function buildSegmentRows(results = []) {
    const rows = [];
    const parsePoint = point => {
        if (Array.isArray(point)) return point.map(Number);
        if (typeof point === 'string') return point.split(',').map(part => Number(part.trim()));
        return [];
    };
    const pointValue = (point, index) => {
        const parsed = parsePoint(point);
        return Number.isFinite(parsed[index]) ? parsed[index] : '';
    };
    results.forEach(res => {
        const reasons = (res.exclusions || []).map(e => e.reason).join('; ');
        let cumulative = 0;
        const sourceSegments = Array.isArray(res.breakdown) && res.breakdown.length
            ? res.breakdown
            : (Array.isArray(res.route_segments) ? res.route_segments : []);
        if (sourceSegments.length) {
            sourceSegments.forEach((seg, idx) => {
                const routeSeg = (res.route_segments || [])[idx] || {};
                const start = seg.start || seg.from || routeSeg.start;
                const end = seg.end || seg.to || routeSeg.end;
                let elementType = seg.type === 'field' ? 'field' : 'tray';
                let elementId = seg.type === 'field' ? 'Field Route' : (seg.tray_id || '');
                if (seg.conduit_id) {
                    elementType = 'conduit';
                    elementId = `${seg.ductbankTag ? seg.ductbankTag + ':' : ''}${seg.conduit_id}`;
                } else if (seg.ductbankTag) {
                    elementType = 'ductbank';
                    elementId = seg.ductbankTag;
                }
                const len = parseFloat(seg.length ?? routeSeg.length) || 0;
                cumulative += len;
                rows.push({
                    cable_tag: res.cable,
                    segment_order: idx + 1,
                    element_type: elementType,
                    element_id: elementId,
                    length: len,
                    cumulative_length: cumulative,
                    start_x: pointValue(start, 0),
                    start_y: pointValue(start, 1),
                    start_z: pointValue(start, 2),
                    end_x: pointValue(end, 0),
                    end_y: pointValue(end, 1),
                    end_z: pointValue(end, 2),
                    reason_codes: reasons
                });
            });
        } else {
            rows.push({
                cable_tag: res.cable,
                segment_order: '',
                element_type: '',
                element_id: '',
                length: '',
                cumulative_length: '',
                start_x: '',
                start_y: '',
                start_z: '',
                end_x: '',
                end_y: '',
                end_z: '',
                reason_codes: reasons
            });
        }
    });
    return rows;
}

export function buildSummaryRows(results = []) {
    return results.map(res => ({
        cable_tag: res.cable,
        total_length: parseFloat(res.total_length) || 0,
        field_length: parseFloat(res.field_length) || 0,
        segments_count: res.segments_count || 0,
        reason_codes: (res.exclusions || []).map(e => e.reason).join('; ')
    }));
}

export { buildTrayHardwareBOM } from './analysis/trayHardware.mjs';

const positiveNumber = (...values) => {
    for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number) && number > 0) return number;
    }
    return 0;
};

// Scheduled length of a raceway record: an explicit length, else its start/end geometry.
// Mirrors recordLength() in analysis/routeCostAssurance.mjs so the BOM and the Cost Estimate agree.
const scheduledRacewayLength = (record = {}) => {
    const coordinates = ['start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z']
        .map(key => (record[key] === '' || record[key] == null ? Number.NaN : Number(record[key])));
    const geometry = coordinates.every(Number.isFinite)
        ? Math.hypot(coordinates[3] - coordinates[0], coordinates[4] - coordinates[1], coordinates[5] - coordinates[2])
        : 0;
    return positiveNumber(record.length_ft, record.lengthFt, record.length, geometry);
};

/**
 * Collect the physical raceways used by the routes, keyed by raceway identity
 * (tray id, or ductbank tag + conduit id) so a raceway shared by several cables
 * is counted once.
 */
function collectRacewayUsage(results, trayData) {
    const trayLookup = new Map();
    const conduitLookup = new Map();
    trayData.forEach(t => {
        if (t.tray_id) trayLookup.set(String(t.tray_id), t);
        if (t.conduit_id) {
            conduitLookup.set(String(t.conduit_id), t);
            conduitLookup.set(`${t.ductbankTag || ''}|${t.conduit_id}`, t);
        }
    });

    const usage = new Map();
    results.forEach((res, resultIndex) => {
        const cableTag = String(res?.cable ?? res?.cable_tag ?? res?.name ?? `route ${resultIndex + 1}`);
        const segments = Array.isArray(res.breakdown) && res.breakdown.length
            ? res.breakdown
            : (Array.isArray(res.route_segments) ? res.route_segments : []);
        segments.forEach(seg => {
            if (!seg || typeof seg !== 'object') return;
            const segmentType = String(seg.type || seg.containmentType || seg.containment || '').toLowerCase();
            const trayId = seg.tray_id ?? seg.trayId;
            const conduitId = seg.conduit_id ?? seg.conduitId;
            const fieldLabel = String(trayId ?? conduitId ?? '').trim().toLowerCase();
            if (segmentType === 'field' || segmentType.includes('field') || seg.isFieldRouting === true
                || fieldLabel === 'field route' || fieldLabel === 'field') {
                return;
            }
            const len = parseFloat(seg.length) || 0;
            let entry;
            // A conduit-bearing segment can also carry its parent tray/ductbank id.
            // Prefer the conduit material whenever both ids are present.
            if (conduitId) {
                const ductbankTag = String(seg.ductbankTag ?? seg.ductbank_tag ?? seg.ductbank_id ?? '');
                const conduit = conduitLookup.get(`${ductbankTag}|${conduitId}`) || conduitLookup.get(String(conduitId));
                const ownerTag = conduit ? (conduit.ductbankTag || '') : ductbankTag;
                const id = String(conduit?.conduit_id ?? conduitId);
                entry = { key: `conduit|${ownerTag}|${id}`, kind: 'conduit', id: ownerTag ? `${ownerTag}:${id}` : id, type: conduit?.type || 'conduit', record: conduit };
            } else if (trayId) {
                const tray = trayLookup.get(String(trayId));
                entry = { key: `tray|${trayId}`, kind: 'tray', id: String(trayId), type: tray?.tray_type || tray?.type || 'tray', record: tray };
            } else {
                return;
            }
            if (!usage.has(entry.key)) usage.set(entry.key, { ...entry, perCable: new Map() });
            const row = usage.get(entry.key);
            row.perCable.set(cableTag, (row.perCable.get(cableTag) || 0) + len);
        });
    });
    return Array.from(usage.values()).map(row => {
        const scheduled = scheduledRacewayLength(row.record || {});
        const routedLengths = Array.from(row.perCable.values());
        return {
            ...row,
            length: scheduled || Math.max(0, ...routedLengths),
            basis: scheduled ? 'scheduled length' : 'longest routed length (no scheduled geometry)',
            routedCableFt: routedLengths.reduce((sum, value) => sum + value, 0)
        };
    });
}

export function buildBOM(results = [], trayData = [], cableList = [], conductorProps = {}, materialCosts = {}) {
    const usedRaceways = collectRacewayUsage(results, trayData);
    const racewayMap = new Map();
    usedRaceways.forEach(raceway => {
        const r = racewayMap.get(raceway.type) || { type: raceway.type, raceway_count: 0, total_length: 0 };
        r.raceway_count += 1;
        r.total_length += raceway.length;
        racewayMap.set(raceway.type, r);
    });

    // Procurement quantities: each physical raceway once, at its scheduled length.
    const raceways = Array.from(racewayMap.values()).map(r => {
        const info = (materialCosts.raceways || {})[r.type] || {};
        const weightPerFt = info.weight_per_ft || 0;
        const costPerFt = info.cost_per_ft;
        const weight = weightPerFt * r.total_length;
        return {
            type: r.type,
            raceway_count: r.raceway_count,
            total_length: r.total_length,
            weight,
            cost: costPerFt != null ? costPerFt * r.total_length : ''
        };
    });

    // Traceability view: which raceways make up each total and how much cable runs through them.
    // routed_cable_ft is cable length, not raceway to purchase, so this view carries no cost.
    const racewayUsage = usedRaceways.map(raceway => ({
        raceway_id: raceway.id,
        kind: raceway.kind,
        type: raceway.type,
        physical_length_ft: raceway.length,
        length_basis: raceway.basis,
        cable_count: raceway.perCable.size,
        routed_cable_ft: raceway.routedCableFt
    }));

    const cableLookup = new Map();
    cableList.forEach(c => {
        const key = c?.tag || c?.cable_tag || c?.name;
        if (key) cableLookup.set(String(key), c);
    });
    const cableMap = new Map();
    const CM_TO_SQIN = Math.PI / 4e6;

    results.forEach(res => {
        const resultCable = res?.cable ?? res?.cable_tag ?? res?.name;
        const cable = cableLookup.get(String(resultCable ?? ''));
        if (!cable) return;
        const size = cable.conductor_size || '';
        const material = (cable.conductor_material || '').toLowerCase();
        const conductors = parseInt(cable.conductors) || 1;
        const len = parseFloat(res.total_length) || 0;
        const key = `${size}|${material}`;
        if (!cableMap.has(key)) cableMap.set(key, { conductor_size: size, material, count: 0, total_length: 0, weight: 0, cost: 0 });
        const entry = cableMap.get(key);
        entry.count += 1;
        entry.total_length += len;

        const props = conductorProps[size];
        if (props) {
            const areaIn2 = props.area_cm * CM_TO_SQIN;
            const volumePerFt = areaIn2 * 12 * conductors;
            const mat = (materialCosts.conductors || {})[material] || {};
            const density = mat.density_lb_per_in3 || 0;
            const weightPerFt = volumePerFt * density;
            entry.weight += weightPerFt * len;
            if (mat.cost_per_lb != null) {
                entry.cost += weightPerFt * len * mat.cost_per_lb;
            }
        }
    });

    const cables = Array.from(cableMap.values()).map(c => ({
        conductor_size: c.conductor_size,
        material: c.material,
        count: c.count,
        total_length: c.total_length,
        weight: c.weight,
        cost: c.cost ? c.cost : ''
    }));

    return { raceways, racewayUsage, cables };
}

