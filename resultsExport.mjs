export function buildSegmentRows(results = []) {
    const rows = [];
    results.forEach(res => {
        const reasons = (res.exclusions || []).map(e => e.reason).join('; ');
        let cumulative = 0;
        if (Array.isArray(res.breakdown) && res.breakdown.length) {
            res.breakdown.forEach((seg, idx) => {
                let elementType = 'tray';
                let elementId = seg.tray_id || '';
                if (seg.conduit_id) {
                    elementType = 'conduit';
                    elementId = `${seg.ductbankTag ? seg.ductbankTag + ':' : ''}${seg.conduit_id}`;
                } else if (seg.ductbankTag) {
                    elementType = 'ductbank';
                    elementId = seg.ductbankTag;
                }
                const len = parseFloat(seg.length) || 0;
                cumulative += len;
                rows.push({
                    cable_tag: res.cable,
                    segment_order: idx + 1,
                    element_type: elementType,
                    element_id: elementId,
                    length: len,
                    cumulative_length: cumulative,
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

export function buildBOM(results = [], trayData = [], cableList = [], conductorProps = {}, materialCosts = {}) {
    const trayLookup = new Map();
    trayData.forEach(t => {
        if (t.tray_id) trayLookup.set(t.tray_id, t);
        if (t.conduit_id) trayLookup.set(t.conduit_id, t);
    });

    const racewayMap = new Map();
    results.forEach(res => {
        (res.breakdown || []).forEach(seg => {
            const len = parseFloat(seg.length) || 0;
            if (seg.tray_id) {
                const tray = trayLookup.get(seg.tray_id) || {};
                const type = tray.tray_type || tray.type || 'tray';
                const r = racewayMap.get(type) || { type, total_length: 0 };
                r.total_length += len;
                racewayMap.set(type, r);
            } else if (seg.conduit_id) {
                const conduit = trayLookup.get(seg.conduit_id) || {};
                const type = conduit.type || 'conduit';
                const r = racewayMap.get(type) || { type, total_length: 0 };
                r.total_length += len;
                racewayMap.set(type, r);
            }
        });
    });

    const raceways = Array.from(racewayMap.values()).map(r => {
        const info = (materialCosts.raceways || {})[r.type] || {};
        const weightPerFt = info.weight_per_ft || 0;
        const costPerFt = info.cost_per_ft;
        const weight = weightPerFt * r.total_length;
        return {
            type: r.type,
            total_length: r.total_length,
            weight,
            cost: costPerFt != null ? costPerFt * r.total_length : ''
        };
    });

    const cableLookup = new Map(cableList.map(c => [c.tag || c.cable_tag, c]));
    const cableMap = new Map();
    const CM_TO_SQIN = Math.PI / 4e6;

    results.forEach(res => {
        const cable = cableLookup.get(res.cable);
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

    return { raceways, cables };
}

