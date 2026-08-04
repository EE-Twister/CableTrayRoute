export function createRouteBreakdown(result, formatPoint, getSegmentType) {
  if (Array.isArray(result?.breakdown)) return result.breakdown;
  return (Array.isArray(result?.route_segments) ? result.route_segments : []).map((segment, index) => ({
    segment: index + 1,
    tray_id: segment.type === 'field' ? 'Field Route' : (segment.tray_id || 'N/A'),
    type: getSegmentType(segment),
    from: formatPoint(segment.start),
    to: formatPoint(segment.end),
    length: Number(segment.length).toFixed(2),
    raceway: segment.raceway || '',
    conduit_id: segment.conduit_id || '',
    ductbankTag: segment.ductbankTag,
    segment_key: segment.segment_key,
    sourceSegment: segment,
  }));
}
