const text = value => String(value ?? '').trim();

export const isRacewayOverloaded = (row = {}) => {
    const utilization = Number(row.full_pct ?? row.utilization_pct ?? row.utilization);
    return Number.isFinite(utilization) && utilization > 80;
};

export const getRacewayReviewTarget = (raceway = {}, fallbackId = '') => {
    const racewayId = text(raceway.tray_id || raceway.raceway_id || raceway.id || fallbackId);
    const ductbankId = text(raceway.ductbankTag || raceway.ductbank_tag || raceway.ductbank_id);
    const conduitId = text(raceway.conduit_id || raceway.conduitId);
    const explicitType = text(raceway.raceway_type || raceway.kind || raceway.type).toLowerCase();

    if (ductbankId || explicitType.includes('ductbank')) {
        return {
            kind: conduitId ? 'ductbank-conduit' : 'ductbank',
            typeLabel: conduitId ? 'Ductbank conduit' : 'Ductbank',
            actionLabel: 'Open ductbank',
            page: 'ductbankroute.html',
            racewayId,
            ductbankId: ductbankId || racewayId,
            conduitId
        };
    }

    if (conduitId || explicitType.includes('conduit')) {
        return {
            kind: 'conduit',
            typeLabel: 'Conduit',
            actionLabel: 'Open conduit fill',
            page: 'conduitfill.html',
            racewayId,
            ductbankId: '',
            conduitId: conduitId || racewayId
        };
    }

    return {
        kind: 'tray',
        typeLabel: 'Cable tray',
        actionLabel: 'Open tray fill',
        page: 'cabletrayfill.html',
        racewayId,
        ductbankId: '',
        conduitId: ''
    };
};
