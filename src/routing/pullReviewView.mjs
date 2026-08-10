const formatCheck = (actual, allowable, unit) => Number.isFinite(actual) && Number.isFinite(allowable)
    ? `${Number(actual).toFixed(1)} / ${Number(allowable).toFixed(0)} ${unit}`
    : 'Inputs required';

const getStatusDetails = (check, sectionCount = 0) => {
    if (!check) return { label: 'Not calculated', className: 'inputs' };
    if (check.status === 'pass') return { label: '1 setup · within limits', className: 'pass' };
    if (check.status === 'setups-required') {
        const count = Math.max(2, sectionCount || 0);
        return { label: `${count} setups required`, className: 'setup' };
    }
    if (check.status === 'review-required') return { label: 'Review required', className: 'review' };
    return { label: 'Inputs missing', className: 'inputs' };
};

export const buildPullGroupAnalysisMarkup = (analysis, options = {}) => {
    const {
        decisions = {},
        expandedGroupIds = new Set(),
        escapeHtml,
        escapeAttr
    } = options;
    const groups = [...analysis.suggestions, ...analysis.reviewGroups];
    const acceptedCount = analysis.suggestions.filter(group => decisions[group.id] === 'together').length;
    let html = `<section class="pull-group-review" aria-label="Automatic pull set suggestions"><div class="pull-group-review-heading"><div><span>Automatic pull-set suggestions</span><h4>${analysis.summary.suggestedGroups} recommended pull set${analysis.summary.suggestedGroups === 1 ? '' : 's'}</h4><p>Review the compact rows, make the pull decision, or expand a row for cables, assumptions, and equipment details.</p></div><div class="pull-group-review-tools"><div class="pull-group-summary-badges"><span class="is-recommended">${analysis.summary.suggestedCables} eligible cables</span><span>${analysis.summary.separateCables} kept separate</span>${acceptedCount ? `<span class="is-selected">${acceptedCount} selected</span>` : ''}</div>${groups.length ? '<div class="pull-group-display-actions" aria-label="Pull set display controls"><button type="button" data-pull-group-display="expand">Expand all</button><button type="button" data-pull-group-display="collapse">Collapse all</button></div>' : ''}</div></div>`;
    if (groups.length) {
        html += `<div class="pull-group-card-grid" aria-label="${groups.length} pull set recommendation${groups.length === 1 ? '' : 's'}">`;
        groups.forEach(group => {
            const decision = decisions[group.id] || 'suggested';
            const isReview = group.status === 'review';
            const plan = group.plan || {};
            const equipment = group.fieldEquipment || {};
            const weakest = plan.equipment?.weakestLink;
            const isExpanded = expandedGroupIds.has(group.id);
            const detailId = `pull-group-detail-${group.id}`;
            const decisionLabel = isReview
                ? 'Keep separate pending review'
                : decision === 'together'
                    ? 'Planned together'
                    : decision === 'separate'
                        ? 'Kept separate'
                        : 'Suggested together';
            const cardClass = isReview ? 'is-review' : decision === 'together' ? 'is-together' : decision === 'separate' ? 'is-separate' : '';
            html += `<article class="pull-group-card ${cardClass} ${isExpanded ? 'is-expanded' : ''}" data-pull-group-card="${escapeAttr(group.id)}"><div class="pull-group-card-summary">`;
            html += `<button type="button" class="pull-group-card-toggle" data-pull-group-id="${escapeAttr(group.id)}" aria-expanded="${isExpanded}" aria-controls="${escapeAttr(detailId)}"><span class="pull-group-card-chevron" aria-hidden="true">›</span><span class="pull-group-card-identity"><span>${escapeHtml(group.label)} · ${escapeHtml(group.className)}</span><strong>${group.cableCount} cables</strong></span></button>`;
            html += `<div class="pull-group-card-preview"><span><strong>${Number(group.routeLengthFt).toFixed(0)} ft</strong>route</span><span><strong>${plan.sections?.length || '—'}</strong>sections</span><span><strong>${Number.isFinite(plan.maxTension) ? `${Number(plan.maxTension).toFixed(0)} lbf` : 'Review'}</strong>max tension</span></div>`;
            html += `<span class="pull-group-status">${escapeHtml(decisionLabel)}</span><div class="pull-group-actions">`;
            if (!isReview) {
                html += `<button type="button" class="pull-group-decision ${decision === 'together' ? 'is-active' : ''}" data-pull-group-id="${escapeAttr(group.id)}" data-pull-group-decision="together">Plan together</button><button type="button" class="pull-group-decision ${decision === 'separate' ? 'is-active' : ''}" data-pull-group-id="${escapeAttr(group.id)}" data-pull-group-decision="separate">Keep separate</button>`;
            } else {
                html += `<button type="button" class="pull-group-decision is-active" data-pull-group-id="${escapeAttr(group.id)}" data-pull-group-decision="separate">Keep separate</button>`;
            }
            html += `<button type="button" class="pull-group-review-route" data-pull-group-id="${escapeAttr(group.id)}">Show route</button></div></div>`;
            html += `<div class="pull-group-card-detail" id="${escapeAttr(detailId)}" ${isExpanded ? '' : 'hidden'}><div class="pull-group-cables">${group.cableNames.map(name => `<span>${escapeHtml(name)}</span>`).join('')}</div>`;
            html += `<div class="pull-group-metrics"><span><strong>${Number(group.routeLengthFt).toFixed(0)} ft</strong>Shared route</span><span><strong>${Number(group.combinedWeightLbsFt).toFixed(2)} lb/ft</strong>Combined weight</span><span><strong>${Number(group.equivalentDiameterIn).toFixed(2)} in</strong>Equivalent bundle OD</span><span><strong>${plan.sections?.length || '—'}</strong>Pull sections</span><span><strong>${Number.isFinite(plan.maxTension) ? `${Number(plan.maxTension).toFixed(0)} lbf` : 'Review'}</strong>Maximum tension</span><span><strong>${escapeHtml(weakest?.label || 'Inputs')}</strong>Weakest link</span></div>`;
            html += `<ul class="pull-group-reasons">${group.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`;
            if (!isReview) {
                html += `<p class="pull-group-equipment-note">Group plan: ${equipment.payoffStations || 0} payoff station${equipment.payoffStations === 1 ? '' : 's'} · ${equipment.cableReels || 0} cable reels · ${equipment.tuggers || 0} tugger setup${equipment.tuggers === 1 ? '' : 's'} · ${equipment.handPulls || 0} hand pull${equipment.handPulls === 1 ? '' : 's'} · ${equipment.sheaves || 0} sheaves · ${equipment.rollers || 0} rollers.${group.equipmentSavings.pullOperations ? ` Avoids ${group.equipmentSavings.pullOperations} separate pull operation${group.equipmentSavings.pullOperations === 1 ? '' : 's'}.` : ' No pull-operation reduction; grouping is still physically feasible under the screening limits.'}</p>`;
            }
            html += '</div></article>';
        });
        html += '</div>';
    } else {
        html += '<div class="pull-group-empty"><strong>No complete-route pull sets found.</strong><span>Cables may share portions of a corridor, but no two currently share the same complete route and circuit class.</span></div>';
    }
    if (analysis.separate.length) {
        html += `<details class="pull-group-separate"><summary>Why ${analysis.separate.length} cable${analysis.separate.length === 1 ? '' : 's'} stay separate</summary><div class="pull-group-separate-list">${analysis.separate.map(item => `<div><strong>${escapeHtml(item.cableName)}</strong><span>${escapeHtml(item.className)}</span><p>${escapeHtml(item.reason)}</p></div>`).join('')}</div></details>`;
    }
    html += '<p class="pull-group-assumption">Screening model: combined tension is distributed by cable weight and bundle OD is area-equivalent. Confirm pulling-head design, conduit jam ratio, manufacturer limits, and field conditions before construction.</p></section>';
    return html;
};

export const buildPullReviewMarkup = (results, options = {}) => {
    const {
        groupAnalysis,
        decisions = {},
        expandedGroupIds = new Set(),
        selectedRouteIndex,
        formatDistance,
        escapeHtml,
        escapeAttr
    } = options;
    const checks = results.map(result => result.pull_check).filter(Boolean);
    const setupCount = checks.filter(check => check.status === 'setups-required').length;
    const reviewCount = checks.filter(check => ['review-required', 'inputs-required'].includes(check.status)).length;
    let html = `<div class="pull-check-summary"><strong>${checks.length} cable pull plans</strong><span>${setupCount} require multiple setups</span><span>${reviewCount} require input or equipment review</span><span>Auto direction compares both ends · weakest equipment rating governs</span></div>`;
    if (groupAnalysis) {
        html += buildPullGroupAnalysisMarkup(groupAnalysis, {
            decisions,
            expandedGroupIds,
            escapeHtml,
            escapeAttr
        });
    }
    html += '<div class="pull-check-guidance"><span aria-hidden="true">↗</span><div><strong>Setup locations are already calculated.</strong><p>The Pull plan pill describes the result; it is not a button. Choose <strong>Show setup locations</strong> to select that cable and display its reel, tugger or hand-pull receiving point, sheave, and roller locations on the 3D canvas.</p></div></div>';
    html += '<div class="table-scroll"><table class="sticky-table"><thead><tr><th>Cable</th><th>Pull plan</th><th>3D locations</th><th>Pull direction</th><th>Sections</th><th>Max tension / weakest limit</th><th>Max pressure / limit</th><th>Field equipment</th></tr></thead><tbody>';
    results.forEach((result, routeIndex) => {
        const check = result.pull_check;
        const sections = Array.isArray(check?.sections) ? check.sections : [];
        const status = getStatusDetails(check, sections.length);
        const equipment = check?.equipment || {};
        const guidance = check?.status === 'inputs-required'
            ? `Missing: ${(check.missingInputs || []).join(', ')}`
            : check
                ? `${equipment.counts?.reels || 0} reel · ${equipment.counts?.tuggers || 0} tugger · ${equipment.counts?.handPulls || 0} hand pull · ${equipment.counts?.sheaves || 0} sheave · ${equipment.counts?.rollers || 0} rollers`
                : 'Run routing with pull planning enabled';
        const canShowSetups = check && check.status !== 'inputs-required';
        const setupLabel = sections.length === 1 ? 'Show setup location' : `Show ${sections.length} setup locations`;
        const canvasAction = canShowSetups
            ? `<button type="button" class="pull-check-view-setups" data-pull-route-index="${routeIndex}" aria-label="${escapeAttr(`${setupLabel} for ${result.cable} on the 3D canvas`)}">${escapeHtml(setupLabel)}</button>`
            : '<span class="pull-check-canvas-unavailable">Complete inputs first</span>';
        html += `<tr data-pull-route="${escapeAttr(result.cable)}"><td>${escapeHtml(result.cable)}</td><td><span class="pull-check-status pull-check-status--${status.className}">${status.label}</span></td><td>${canvasAction}</td><td>${escapeHtml(check?.directionLabel || '—')}</td><td>${sections.length || '—'}</td><td>${escapeHtml(formatCheck(check?.maxTension, check?.allowableTension, 'lbf'))}</td><td>${escapeHtml(formatCheck(check?.maxSidewallPressure, check?.allowableSidewallPressure, 'lbf/ft'))}</td><td>${escapeHtml(guidance)}</td></tr>`;
    });
    html += '</tbody></table></div>';

    const selectedRoute = results[selectedRouteIndex] || results.find(result => result.pull_check);
    const selected = selectedRoute?.pull_check;
    if (selected && selected.status !== 'inputs-required') {
        const equipment = selected.equipment || {};
        const weakest = equipment.weakestLink;
        const forward = selected.directionComparison?.forward;
        const reverse = selected.directionComparison?.reverse;
        const directionReason = selected.directionMode === 'auto' && forward && reverse
            ? `Compared both directions: From → To ${forward.sections} section(s), ${Number(forward.maxTension).toFixed(0)} lbf; To → From ${reverse.sections} section(s), ${Number(reverse.maxTension).toFixed(0)} lbf.`
            : 'Direction was fixed by the pull strategy setting.';
        const handPullCount = equipment.counts?.handPulls || 0;
        const handPullReason = handPullCount
            ? ` ${handPullCount} short section${handPullCount === 1 ? '' : 's'} meet both hand-pull limits: ≤ ${Number(selected.assumptions?.maxHandPullLengthFt || 25).toFixed(0)} ft and ≤ ${Number(selected.assumptions?.maxHandPullTensionLbf || 200).toFixed(0)} lbf.`
            : '';
        html += `<section class="pull-field-plan" aria-label="Selected cable field pull plan"><div class="pull-field-plan-heading"><div><span>Selected cable field plan</span><h4>${escapeHtml(selectedRoute.cable)} · ${escapeHtml(selected.directionLabel)}</h4><p>${escapeHtml(directionReason + handPullReason)}</p></div><span class="pull-direction-badge">${escapeHtml(selected.direction === 'reverse' ? 'Reverse pull selected' : 'Forward pull selected')}</span></div>`;
        html += `<div class="pull-equipment-kpis"><span><i class="legend-reel"></i><strong>${equipment.counts?.reels || 0}</strong>Reels</span><span><i class="legend-tugger"></i><strong>${equipment.counts?.tuggers || 0}</strong>Tuggers</span><span><i class="legend-hand-pull"></i><strong>${handPullCount}</strong>Hand pulls</span><span><i class="legend-sheave"></i><strong>${equipment.counts?.sheaves || 0}</strong>Sheaves</span><span><i class="legend-roller"></i><strong>${equipment.counts?.rollers || 0}</strong>Tray rollers</span><span><strong>${escapeHtml(weakest?.label || '—')}</strong>Weakest link · ${escapeHtml(weakest ? `${weakest.value.toFixed(0)} lbf` : '—')}</span></div>`;
        html += '<div class="table-scroll"><table class="sticky-table pull-section-table"><thead><tr><th>Section</th><th>Reel / payoff</th><th>Receiving method / end</th><th>Length</th><th>Maximum tension</th><th>Sheaves</th><th>Tray rollers</th></tr></thead><tbody>';
        selected.sections.forEach(section => {
            const sheaveCount = (equipment.sheaves || []).filter(item => item.distanceFromPullStart >= section.startDistance - 0.01 && item.distanceFromPullStart <= section.endDistance + 0.01).length;
            const rollerCount = (equipment.rollers || []).filter(item => item.distanceFromPullStart >= section.startDistance - 0.01 && item.distanceFromPullStart <= section.endDistance + 0.01).length;
            const receivingMethod = section.pullMethod === 'hand'
                ? `<span class="pull-method-hand">PULL BY HAND</span> @ ${escapeHtml(formatDistance(section.endDistance))}`
                : `Tugger ${section.index} @ ${escapeHtml(formatDistance(section.endDistance))}`;
            html += `<tr><td>Pull ${section.index}</td><td>Reel ${section.index} @ ${escapeHtml(formatDistance(section.startDistance))}</td><td>${receivingMethod}</td><td>${escapeHtml(formatDistance(section.length))}</td><td>${escapeHtml(`${Number(section.maxTension).toFixed(1)} lbf`)}</td><td>${sheaveCount}</td><td>${rollerCount}</td></tr>`;
        });
        html += '</tbody></table></div>';
        if ((equipment.sheaves || []).length) {
            html += '<div class="pull-sheave-strip"><strong>Sheave schedule</strong>';
            equipment.sheaves.forEach(sheave => {
                const transition = sheave.transition ? ` · ${sheave.transition}` : '';
                html += `<span class="${sheave.pass ? '' : 'is-warning'}">S${sheave.index} @ ${escapeHtml(formatDistance(sheave.distanceFromPullStart))} · ${Number(sheave.angleDeg).toFixed(0)}° · radius ≥ ${Number(sheave.recommendedRadiusFt).toFixed(2)} ft · support ${Number(sheave.reactionLbf).toFixed(0)} / ${Number(sheave.capacityLbf).toFixed(0)} lbf${escapeHtml(transition)}</span>`;
            });
            html += '</div>';
        }
        html += '</section>';
    }
    return { html, setupCount, reviewCount };
};

export const bindPullReviewActions = (container, callbacks = {}) => {
    const setCardExpanded = (card, expanded) => {
        const toggle = card?.querySelector('.pull-group-card-toggle');
        const detail = card?.querySelector('.pull-group-card-detail');
        const groupId = card?.dataset.pullGroupCard;
        if (!toggle || !detail || !groupId) return;
        toggle.setAttribute('aria-expanded', String(expanded));
        detail.hidden = !expanded;
        card.classList.toggle('is-expanded', expanded);
        callbacks.onExpandedChange?.(groupId, expanded);
    };
    container.querySelectorAll('.pull-group-card-toggle').forEach(button => {
        button.addEventListener('click', () => {
            setCardExpanded(button.closest('.pull-group-card'), button.getAttribute('aria-expanded') !== 'true');
        });
    });
    container.querySelectorAll('[data-pull-group-display]').forEach(button => {
        button.addEventListener('click', () => {
            const expanded = button.dataset.pullGroupDisplay === 'expand';
            container.querySelectorAll('.pull-group-card').forEach(card => setCardExpanded(card, expanded));
        });
    });
    container.querySelectorAll('.pull-group-decision').forEach(button => {
        button.addEventListener('click', () => callbacks.onDecision?.(
            button.dataset.pullGroupId,
            button.dataset.pullGroupDecision
        ));
    });
    container.querySelectorAll('.pull-group-review-route').forEach(button => {
        button.addEventListener('click', () => callbacks.onShowGroupRoute?.(button.dataset.pullGroupId));
    });
    container.querySelectorAll('.pull-check-view-setups').forEach(button => {
        button.addEventListener('click', () => callbacks.onShowSetups?.(Number(button.dataset.pullRouteIndex)));
    });
};
