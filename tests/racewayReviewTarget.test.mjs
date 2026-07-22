import assert from 'node:assert/strict';
import { getRacewayReviewTarget, isRacewayOverloaded } from '../analysis/racewayReviewTarget.mjs';

assert.equal(isRacewayOverloaded({ full_pct: 80 }), false);
assert.equal(isRacewayOverloaded({ full_pct: 80.1 }), true);
assert.equal(isRacewayOverloaded({ utilization: '91.5' }), true);
assert.equal(isRacewayOverloaded({ utilization: 'not available' }), false);
assert.equal([
    { full_pct: 48.4 },
    { full_pct: 98.6 }
].filter(isRacewayOverloaded).length, 1);

const ductbankConduit = getRacewayReviewTarget({
    tray_id: 'DB-HV-01-HV-C04',
    raceway_type: 'conduit',
    ductbankTag: 'DB-HV-01',
    conduit_id: 'HV-C04'
});
assert.deepEqual(ductbankConduit, {
    kind: 'ductbank-conduit',
    typeLabel: 'Ductbank conduit',
    actionLabel: 'Open ductbank',
    page: 'ductbankroute.html',
    racewayId: 'DB-HV-01-HV-C04',
    ductbankId: 'DB-HV-01',
    conduitId: 'HV-C04'
});

const standaloneConduit = getRacewayReviewTarget({
    tray_id: 'RISER-HV-01',
    raceway_type: 'conduit',
    conduit_id: 'RISER-HV-01'
});
assert.equal(standaloneConduit.kind, 'conduit');
assert.equal(standaloneConduit.page, 'conduitfill.html');

const tray = getRacewayReviewTarget({ tray_id: 'TRAY-HV-01', raceway_type: 'tray' });
assert.equal(tray.kind, 'tray');
assert.equal(tray.page, 'cabletrayfill.html');

const ductbank = getRacewayReviewTarget({ tray_id: 'DB-HV-01', raceway_type: 'ductbank' });
assert.equal(ductbank.kind, 'ductbank');
assert.equal(ductbank.ductbankId, 'DB-HV-01');

console.log('raceway utilization review targets verified');
