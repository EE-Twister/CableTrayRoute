export const buildPullAccessMarkup = ({ constructability, routeIndex, formatDistance, escapeHtml, escapeAttr }) => {
    const records = constructability?.pullPoints?.records || [];
    if (!records.length) return '';
    let html = `<section class="pull-access-records" aria-label="Pull-point access records"><div class="pull-access-heading"><div><strong>Per-point access evidence</strong><p>Record each calculated location separately. Confirmed status requires a cited site-plan, structure-schedule, or field-walkdown source.</p></div><span>${constructability.pullPoints.confirmedCount || 0}/${records.length} confirmed</span></div>`;
    html += '<div class="table-scroll"><table class="sticky-table pull-access-table"><thead><tr><th>Point</th><th>Station / coordinates</th><th>Status</th><th>Evidence source</th><th>Access note</th></tr></thead><tbody>';
    records.forEach(record => {
        const coordinates = Array.isArray(record.point)
            ? record.point.map(value => Number(value).toFixed(1)).join(', ')
            : 'Coordinates unavailable';
        const option = (value, label) => `<option value="${value}"${record.status === value ? ' selected' : ''}>${label}</option>`;
        html += `<tr data-pull-access-record="${escapeAttr(record.id)}"><td><strong>${escapeHtml(record.label)}</strong><small>${escapeHtml(record.type)}</small></td><td>${escapeHtml(formatDistance(record.distanceFt))}<small>${escapeHtml(coordinates)}</small></td><td><select data-pull-access-status aria-label="Access status for ${escapeAttr(record.label)}">${option('pending', 'Pending')}${option('confirmed', 'Confirmed')}${option('blocked', 'Blocked')}</select></td><td><input type="text" data-pull-access-source value="${escapeAttr(record.source || '')}" placeholder="Evidence document and revision" aria-label="Evidence source for ${escapeAttr(record.label)}"></td><td><input type="text" data-pull-access-notes value="${escapeAttr(record.notes || '')}" placeholder="Clearance, staging, anchorage, obstruction" aria-label="Access note for ${escapeAttr(record.label)}"></td></tr>`;
    });
    return `${html}</tbody></table></div><div class="pull-access-actions"><button type="button" data-save-pull-access="${routeIndex}">Save access evidence and recalculate</button><p>Changing route geometry or pull direction invalidates records that no longer match a calculated point.</p></div></section>`;
};

export const bindPullAccessActions = (container, callback) => {
    container.querySelectorAll('[data-save-pull-access]').forEach(button => {
        button.addEventListener('click', () => callback?.(
            Number(button.dataset.savePullAccess),
            [...container.querySelectorAll('[data-pull-access-record]')].map(row => ({
                id: row.dataset.pullAccessRecord,
                status: row.querySelector('[data-pull-access-status]')?.value || 'pending',
                source: String(row.querySelector('[data-pull-access-source]')?.value || '').trim(),
                notes: String(row.querySelector('[data-pull-access-notes]')?.value || '').trim(),
            }))
        ));
    });
};
