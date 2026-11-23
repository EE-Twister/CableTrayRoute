export function renderSharedRouteMetrics(container, routes, { formatPoint, onHighlight, onFill }) {
    const document = container.ownerDocument;
    container.replaceChildren();
    if (!Array.isArray(routes) || !routes.length) {
        const message = document.createElement('p');
        message.textContent = 'No common field routes detected.';
        container.appendChild(message);
        return;
    }
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Potential Shared Field Routes';
    const list = document.createElement('ul');
    routes.forEach((route, index) => {
        const group = route.allowed_cable_group ? ` (Group ${route.allowed_cable_group})` : '';
        const recommendation = String(route.recommendation || '');
        let recommendationText;
        if (recommendation === 'conduit' && route.trade_size && route.trade_size !== 'N/A') {
            recommendationText = `Recommended: ${route.trade_size}" Conduit`;
        } else if ((recommendation === 'tray' || recommendation === 'channel') && route.tray_size) {
            recommendationText = `Recommended: ${route.tray_size}" ${recommendation === 'tray' ? 'Tray' : 'Channel'}`;
        } else {
            recommendationText = `Recommended: ${recommendation.charAt(0).toUpperCase()}${recommendation.slice(1)}`;
        }
        const item = document.createElement('li');
        item.className = 'shared-route-item';
        item.dataset.routeIndex = String(index);
        item.textContent = `${route.name}${group}: ${formatPoint(route.start)} to ${formatPoint(route.end)} - ${(Array.isArray(route.cables) ? route.cables : []).join(', ')} | ${recommendationText}`;
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => onHighlight(index));
        if (recommendation === 'conduit') {
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'conduit-fill-link';
            link.dataset.routeIndex = String(index);
            link.textContent = 'Fill';
            link.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                onFill(index);
            });
            item.append(' ', link);
        }
        list.appendChild(item);
    });
    details.append(summary, list);
    container.appendChild(details);
}
