function defaultEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildRouteExplanationMarkup(points = [], escape = defaultEscape) {
  if (!Array.isArray(points) || !points.length) return '';
  return `<ul class="route-explanation-list">${points.map(point => `<li>${escape(point)}</li>`).join('')}</ul>`;
}

export function buildRouteScreeningReviewMarkup(
  summary,
  { escapeHtml = defaultEscape, escapeAttr = defaultEscape, isSafeUrl = () => false } = {}
) {
  if (!summary?.total) {
    return '<section class="route-screening-review route-screening-review--clear"><strong>No candidates were screened out.</strong><p>Every raceway segment considered by the routing search remained eligible.</p></section>';
  }
  const groupCards = summary.groups.map(group => `
        <article class="route-screening-reason" data-route-screening-reason="${escapeAttr(group.code)}">
            <strong>${group.count}</strong>
            <span>${escapeHtml(group.label)}</span>
            <p>${escapeHtml(group.description)}</p>
        </article>
    `).join('');
  const candidateRows = summary.candidates.map(candidate => {
    const details = candidate.message
      ? candidate.message.replace(/^Rejected\s+[^:]+:\s*/i, '')
      : summary.groups.find(group => group.code === candidate.reason)?.label || candidate.reason;
    const link = candidate.filter && isSafeUrl(candidate.filter)
      ? `<a href="${escapeAttr(candidate.filter)}">Open raceway</a>`
      : '';
    return `<li><strong>${escapeHtml(candidate.id)}</strong><span>${escapeHtml(details)}</span>${link}</li>`;
  }).join('');
  return `
        <section class="route-screening-review" tabindex="-1">
            <div class="route-screening-review-heading">
                <div><span>Routing search review</span><h4>Why ${summary.total} candidate${summary.total === 1 ? ' was' : 's were'} not used</h4></div>
                <span class="route-screening-advisory">Selected route remains valid</span>
            </div>
            <p class="route-screening-explanation">The router evaluates nearby raceway segments before choosing a continuous path. These are alternatives removed by the configured rules—not ${summary.total} defects in the selected route.</p>
            <div class="route-screening-reason-grid">${groupCards}</div>
            <details class="route-screening-records">
                <summary>Show ${summary.total} candidate raceway record${summary.total === 1 ? '' : 's'}</summary>
                <ul>${candidateRows}</ul>
            </details>
        </section>
    `;
}

export function renderRouteSummaryPanel(
  panel,
  summary,
  { formatDistance, escapeHtml = defaultEscape, onOverload = null } = {}
) {
  if (!panel) return;
  if (!summary) {
    panel.innerHTML = '';
    return;
  }
  const distance = typeof formatDistance === 'function' ? formatDistance : value => `${Number(value).toFixed(2)} ft`;
  panel.innerHTML = `
        <div class="route-review-kpis" aria-label="Recommended route summary">
            <div class="route-review-kpi route-review-kpi--recommended"><i aria-hidden="true">✓</i><span><strong>Recommended</strong><small>${summary.routedCount} routed${summary.failedCount ? ` · ${summary.failedCount} need review` : ''}</small></span></div>
            <div class="route-review-kpi"><i aria-hidden="true">↔</i><span><strong id="selected-route-kpi-length">${escapeHtml(distance(summary.primaryLength))}</strong><small>selected route</small></span></div>
            <div class="route-review-kpi"><i aria-hidden="true">◦</i><span><strong id="selected-route-kpi-contained">${summary.primaryContainedPercent.toFixed(0)}% contained</strong><small>${escapeHtml(distance(summary.containedLength))} in raceway</small></span></div>
            ${summary.overloadCount
                ? `<button type="button" id="route-overload-kpi" class="route-review-kpi route-review-kpi--warning" aria-controls="updated-utilization-details"><i aria-hidden="true">!</i><span><strong>${summary.overloadCount} overloads</strong><small>View affected raceways</small></span></button>`
                : '<div class="route-review-kpi route-review-kpi--safe"><i aria-hidden="true">◆</i><span><strong>0 overloads</strong><small>within review threshold</small></span></div>'}
        </div>
    `;
  if (typeof onOverload === 'function') {
    panel.querySelector('#route-overload-kpi')?.addEventListener('click', onOverload);
  }
}
