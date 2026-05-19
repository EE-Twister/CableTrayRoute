export function createDirectedConnectionMap(componentIds = []) {
  const map = new Map();
  componentIds.forEach(id => {
    if (!id) return;
    map.set(String(id), { upstream: new Set(), downstream: new Set() });
  });
  return map;
}

function ensureNode(map, id) {
  const key = id ? String(id) : '';
  if (!key) return null;
  if (!map.has(key)) map.set(key, { upstream: new Set(), downstream: new Set() });
  return map.get(key);
}

export function addDirectedConnection(map, from, to) {
  const source = from ? String(from) : '';
  const target = to ? String(to) : '';
  if (!source || !target || source === target) return;
  const sourceNode = ensureNode(map, source);
  const targetNode = ensureNode(map, target);
  sourceNode.downstream.add(target);
  targetNode.upstream.add(source);
}

export function collectNearestDirectionalDeviceUids(targetId, flowMap, componentDeviceUidMap, direction, depthLimit = 4) {
  const result = new Set();
  const target = targetId ? String(targetId) : '';
  const edgeKey = direction === 'upstream' ? 'upstream' : 'downstream';
  if (!target || !flowMap?.has(target) || !componentDeviceUidMap) return result;

  const visited = new Set([target]);
  let frontier = [...(flowMap.get(target)?.[edgeKey] || [])];
  let depth = 0;

  while (frontier.length && depth < depthLimit && result.size === 0) {
    const next = [];
    frontier.forEach(id => {
      if (!id || visited.has(id)) return;
      visited.add(id);
      const uid = componentDeviceUidMap.get(id);
      if (uid) {
        result.add(uid);
        return;
      }
      const node = flowMap.get(id);
      if (!node) return;
      node[edgeKey].forEach(nextId => {
        if (!visited.has(nextId)) next.push(nextId);
      });
    });
    frontier = next;
    depth += 1;
  }

  return result;
}

export function collectAdjacentDeviceUids(targetId, flowMap, componentDeviceUidMap, depthLimit = 4) {
  const result = new Set();
  collectNearestDirectionalDeviceUids(targetId, flowMap, componentDeviceUidMap, 'upstream', depthLimit)
    .forEach(uid => result.add(uid));
  collectNearestDirectionalDeviceUids(targetId, flowMap, componentDeviceUidMap, 'downstream', depthLimit)
    .forEach(uid => result.add(uid));
  return result;
}

export function collectAdjacentDeviceRelationships(targetId, flowMap, componentDeviceUidMap, depthLimit = 4) {
  const relationships = new Map();
  collectNearestDirectionalDeviceUids(targetId, flowMap, componentDeviceUidMap, 'upstream', depthLimit)
    .forEach(uid => relationships.set(uid, 'upstream'));
  collectNearestDirectionalDeviceUids(targetId, flowMap, componentDeviceUidMap, 'downstream', depthLimit)
    .forEach(uid => {
      if (!relationships.has(uid)) relationships.set(uid, 'downstream');
    });
  return relationships;
}
