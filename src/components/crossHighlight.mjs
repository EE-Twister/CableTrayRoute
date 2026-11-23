import { normalizeRouteResults, routeResultSucceeded, routeResultTag } from '../../analysis/routeResults.mjs';

const text = value => String(value ?? '').trim();

function racewayIdsOfSegment(segment) {
  return [segment.tray_id, segment.conduit_id, segment.ductbankTag, segment.raceway_id]
    .map(text)
    .filter(id => id && !/^field route$/i.test(id));
}

/** Raceway ids (trays, conduits, ductbanks) used by the saved route of one cable. */
export function racewaysForCable(routeSource, cableTag) {
  const wanted = text(cableTag).toLowerCase();
  const ids = new Set();
  if (!wanted) return [];
  normalizeRouteResults(routeSource).filter(routeResultSucceeded).forEach(result => {
    if (text(routeResultTag(result)).toLowerCase() !== wanted) return;
    result.route_segments.forEach(segment => {
      if (segment.type !== 'field') racewayIdsOfSegment(segment).forEach(id => ids.add(id));
    });
  });
  return [...ids];
}

/** Cable tags whose saved route passes through the given raceway id. */
export function cablesForRaceway(routeSource, racewayId) {
  const wanted = text(racewayId).toLowerCase();
  const tags = new Set();
  if (!wanted) return [];
  normalizeRouteResults(routeSource).filter(routeResultSucceeded).forEach(result => {
    const used = result.route_segments.some(segment => segment.type !== 'field'
      && racewayIdsOfSegment(segment).some(id => id.toLowerCase() === wanted));
    if (used) tags.add(text(routeResultTag(result)));
  });
  return [...tags];
}

/** Query string for the destination page's highlight handler. */
export function highlightQuery(ids, from) {
  const params = new URLSearchParams();
  params.set('highlight', ids.join(','));
  if (from) params.set('from', from);
  return params.toString();
}

export function parseHighlightParam(search) {
  const params = new URLSearchParams(search || '');
  return (params.get('highlight') || '').split(',').map(text).filter(Boolean);
}
