import { evaluateEndpointInstallation } from './designSynthesisEndpointInstallation.mjs';
import { SOURCED_MC_R_X } from './designSynthesisCableCatalog.mjs';

const MAX_ANCHORS_PER_ENDPOINT = 8;
const EPS = 1e-9;

/** Return a deterministic, bounded set of explicitly permitted field attachments. */
export function buildAlternateAnchorPairs({ graph, source, target, maxAttachment, nearestFrom, nearestTo, distance }) {
  const anchors = point => [...graph.nodes.values()]
    .map(node => ({ node, distance: distance(node, point) }))
    .filter(item => Number.isFinite(item.distance) && item.distance <= maxAttachment + EPS)
    .sort((a, b) => a.distance - b.distance || String(a.node.id).localeCompare(String(b.node.id)));
  const allFrom = anchors(source); const allTo = anchors(target);
  const from = allFrom.slice(0, MAX_ANCHORS_PER_ENDPOINT); const to = allTo.slice(0, MAX_ANCHORS_PER_ENDPOINT);
  const pairs = from.flatMap(a => to.map(b => ({ from: a, to: b })))
    .filter(pair => pair.from.node.id !== nearestFrom.node.id || pair.to.node.id !== nearestTo.node.id)
    .sort((a, b) => (a.from.distance + a.to.distance) - (b.from.distance + b.to.distance)
      || String(a.from.node.id).localeCompare(String(b.from.node.id)) || String(a.to.node.id).localeCompare(String(b.to.node.id)));
  return { pairs, sourceAnchorCount: allFrom.length, destinationAnchorCount: allTo.length, limitPerEndpoint: MAX_ANCHORS_PER_ENDPOINT,
    truncated: allFrom.length > from.length || allTo.length > to.length };
}

/** Screen the same physical MC cable and endpoint assumptions used by final raceway evaluation. */
export function screenAlternateEndpointInstallation({ route, size, criteria }) {
  if (!route || ![route.sourceAttachmentFt, route.destinationAttachmentFt].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0) || !SOURCED_MC_R_X[size]) {
    return { ok: false, status: 'blocked', issueCodes: ['ENDPOINT_CANDIDATE_INPUT_INVALID'] };
  }
  const segments = [
    { type: 'field', endpointRole: 'source', length: route?.sourceAttachmentFt },
    { type: 'field', endpointRole: 'destination', length: route?.destinationAttachmentFt },
  ].filter(segment => typeof segment.length === 'number' && Number.isFinite(segment.length) && segment.length > 0);
  const cable = { id: 'endpoint-candidate', outerDiameterIn: SOURCED_MC_R_X[size]?.od };
  const result = evaluateEndpointInstallation({ cable, route: { route_segments: segments }, criteria });
  return { ok: result.coverage === 'complete' && ['evaluated', 'not-needed'].includes(result.status), status: result.status, issueCodes: result.issues.map(issue => issue.code) };
}
