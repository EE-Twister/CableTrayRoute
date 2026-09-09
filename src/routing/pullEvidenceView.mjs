export const getPullStatusDetails = (check, sectionCount = 0) => {
    if (!check) return { label: 'Not calculated', className: 'inputs' };
    if (check.constructability?.status === 'blocked') return { label: 'Evidence incomplete', className: 'review' };
    if (check.status === 'pass') return { label: '1 setup · within limits', className: 'pass' };
    if (check.status === 'setups-required') return { label: `${Math.max(2, sectionCount || 0)} setups required`, className: 'setup' };
    if (check.status === 'review-required') return { label: 'Review required', className: 'review' };
    return { label: 'Inputs missing', className: 'inputs' };
};

export const getPullGuidance = (check, equipment = {}) => {
    if (check?.constructability?.status === 'blocked') {
        return `Evidence: ${check.constructability.issues?.[0]?.message || 'constructability inputs are incomplete'}`;
    }
    if (check?.status === 'inputs-required') return `Missing: ${(check.missingInputs || []).join(', ')}`;
    if (!check) return 'Run routing with pull planning enabled';
    const counts = equipment.counts || {};
    return `${counts.reels || 0} reel · ${counts.tuggers || 0} tugger · ${counts.handPulls || 0} hand pull · ${counts.sheaves || 0} sheave · ${counts.rollers || 0} rollers`;
};

export const buildPullConstructabilityMarkup = (constructability = {}, escapeHtml) => {
    const ready = constructability.status === 'pass';
    const issues = (constructability.issues || []).map(item => `<li>${escapeHtml(item.message)}</li>`).join('');
    const pullPoints = constructability.pullPoints || {};
    const pointSummary = `${pullPoints.confirmedCount || 0}/${pullPoints.requiredCount || 0} points confirmed`;
    return `<div class="pull-check-guidance ${ready ? 'is-ready' : ''}"><span aria-hidden="true">${ready ? '✓' : '!'}</span><div><strong>Constructability evidence: ${escapeHtml(ready ? 'complete for qualified review' : 'incomplete')}</strong><p>Signature ${escapeHtml(constructability.signature || 'not available')} · cable limits ${escapeHtml(constructability.sources?.cableLimits || 'source missing')} · equipment ${escapeHtml(constructability.sources?.equipmentRatings || 'source missing')} · access ${escapeHtml(pointSummary)}.</p>${issues ? `<ul>${issues}</ul>` : ''}</div></div>`;
};
