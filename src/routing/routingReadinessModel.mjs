import { buildRoutingReadinessDiagnostics } from '../../analysis/scheduleWorkflow.mjs';

export function getRoutingCounts(state = {}) {
    const raceways = Array.isArray(state.trayData) ? state.trayData : [];
    const trays = raceways.filter(row => (row.raceway_type || 'tray') === 'tray');
    const conduits = raceways.filter(row => row.raceway_type === 'conduit');
    const ductbanks = state.ductbankData?.ductbanks || [];
    const routableSegments = raceways.filter(row => row.raceway_type !== 'ductbank');
    return {
        trays,
        conduits,
        ductbanks,
        routableSegments,
        cables: Array.isArray(state.cableList) ? state.cableList : []
    };
}

export function getDuplicateRacewayIds(rows = []) {
    const seen = new Set();
    const duplicates = new Set();
    rows.forEach(row => {
        const id = String(row?.tray_id || '').trim();
        if (!id) return;
        if (seen.has(id)) duplicates.add(id);
        seen.add(id);
    });
    return Array.from(duplicates);
}

export function hasValidRouteGeometry(row = {}) {
    const values = ['start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z', 'width', 'height']
        .map(key => parseFloat(row[key]));
    return values.every(Number.isFinite) && values[6] > 0 && values[7] > 0;
}

export function getRacewayGroupWarnings(raceways = [], cables = []) {
    const racewayGroups = new Set(raceways
        .map(row => String(row?.allowed_cable_group || '').trim())
        .filter(Boolean));
    const hasOpenRaceway = raceways.some(row => !String(row?.allowed_cable_group || '').trim());
    if (hasOpenRaceway || racewayGroups.size === 0) return [];
    const cableGroups = new Set(cables
        .map(row => String(row?.allowed_cable_group || '').trim())
        .filter(Boolean));
    return Array.from(cableGroups).filter(group => !racewayGroups.has(group));
}

export function getTrayFillWarnings(trays = [], fillLimitPercent = 40) {
    const fillLimit = parseFloat(fillLimitPercent) / 100;
    return trays.filter(tray => {
        const maximum = (parseFloat(tray?.width) || 0) * (parseFloat(tray?.height) || 0) * fillLimit;
        return maximum > 0 && (parseFloat(tray?.current_fill) || 0) > maximum;
    });
}

export function buildRoutingReadiness(state = {}, { fillLimitPercent = 40 } = {}) {
    const counts = getRoutingCounts(state);
    const duplicateIds = getDuplicateRacewayIds(counts.routableSegments);
    const missingGeometry = counts.routableSegments.filter(row => !hasValidRouteGeometry(row));
    const groupWarnings = getRacewayGroupWarnings(counts.routableSegments, counts.cables);
    const overLimit = getTrayFillWarnings(counts.trays, fillLimitPercent);
    const geometryWarnings = [
        ...(state.geometryWarnings?.ductbanks || []),
        ...(state.geometryWarnings?.conduits || [])
    ];
    const diagnostics = buildRoutingReadinessDiagnostics({
        cables: counts.cables,
        trays: counts.trays,
        conduits: counts.conduits,
        ductbanks: counts.ductbanks
    });
    const blocking = [];
    const warnings = [];
    if (counts.routableSegments.length === 0) blocking.push('Add or import at least one tray, conduit, or ductbank conduit.');
    if (counts.cables.length === 0) blocking.push('Add or import at least one cable.');
    if (counts.cables.length && diagnostics.coordinateReady === 0) blocking.push('Add start/end XYZ coordinates for at least one cable before running routing.');
    if (missingGeometry.length) blocking.push(`${missingGeometry.length} raceway segment(s) need valid geometry.`);
    if (duplicateIds.length) blocking.push(`${duplicateIds.length} duplicate raceway ID(s) need unique names.`);
    if (diagnostics.invalidAssignedRefs.length) blocking.push(`${diagnostics.invalidAssignedRefs.length} cable raceway assignment(s) do not match the Raceway Schedule.`);
    if (diagnostics.cableSummary.missingSchedule) warnings.push(`${diagnostics.cableSummary.missingSchedule} cable row(s) are not schedule-ready.`);
    if (diagnostics.cableSummary.missingRaceway) warnings.push(`${diagnostics.cableSummary.missingRaceway} schedule-ready cable row(s) need raceway assignments.`);
    if (diagnostics.coordinateReady > 0 && diagnostics.coordinateReady < diagnostics.cableSummary.total) {
        warnings.push(`${diagnostics.cableSummary.total - diagnostics.coordinateReady} cable row(s) are missing start/end coordinates for auto-routing.`);
    }
    if (groupWarnings.length) warnings.push(`No matching raceway group for ${groupWarnings.join(', ')}.`);
    if (overLimit.length) warnings.push(`${overLimit.length} tray(s) already exceed the selected fill limit.`);
    if (geometryWarnings.length) warnings.push(`${geometryWarnings.length} ductbank/conduit geometry warning(s) were found.`);
    return {
        ...counts,
        diagnostics,
        duplicateIds,
        missingGeometry,
        groupWarnings,
        overLimit,
        geometryWarnings,
        blocking,
        warnings,
        ready: blocking.length === 0
    };
}
