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
