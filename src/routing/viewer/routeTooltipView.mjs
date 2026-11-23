export function renderRouteTooltip(tooltip, data) {
  const detail = tooltip.ownerDocument.createElement('small');
  detail.textContent = data.kind === 'raceway'
    ? `${data.racewayKind} · ${data.allowedGroup || 'OPEN'} cable class · ${Number(data.utilizationPct || 0).toFixed(0)}% utilized${data.routeCount ? ` · ${data.routeCount} route${data.routeCount === 1 ? '' : 's'}` : ''}${data.geometrySource === 'inferred-arrangement' ? ' · inferred arrangement' : ''}`
    : `${data.containmentType || 'route'} segment`;
  tooltip.replaceChildren(tooltip.ownerDocument.createTextNode(data.label ?? ''), detail);
}
