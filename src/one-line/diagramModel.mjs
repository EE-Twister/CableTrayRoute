export function getComponentBounds(component, {
  defaultWidth = 80,
  defaultHeight = 40
} = {}) {
  const width = component?.width || defaultWidth;
  const height = component?.height || defaultHeight;
  const x = Number(component?.x) || 0;
  const y = Number(component?.y) || 0;
  const angle = (Number(component?.rotation) || 0) * Math.PI / 180;
  if (!angle) {
    return { left: x, top: y, right: x + width, bottom: y + height };
  }

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const rotatePoint = (pointX, pointY) => {
    const dx = pointX - centerX;
    const dy = pointY - centerY;
    return {
      x: centerX + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: centerY + dx * Math.sin(angle) + dy * Math.cos(angle)
    };
  };
  const points = [
    rotatePoint(x, y),
    rotatePoint(x + width, y),
    rotatePoint(x, y + height),
    rotatePoint(x + width, y + height)
  ];
  const xValues = points.map(point => point.x);
  const yValues = points.map(point => point.y);
  return {
    left: Math.min(...xValues),
    top: Math.min(...yValues),
    right: Math.max(...xValues),
    bottom: Math.max(...yValues)
  };
}

export function getConnectedComponentIds(startId, components = [], sheetConnections = []) {
  if (!startId) return new Set();
  const validComponents = Array.isArray(components) ? components.filter(component => component?.id) : [];
  const byId = new Map(validComponents.map(component => [component.id, component]));
  if (!byId.has(startId)) return new Set();

  const adjacency = new Map(validComponents.map(component => [component.id, new Set()]));
  const connect = (from, to) => {
    if (!byId.has(from) || !byId.has(to)) return;
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  };
  validComponents.forEach(component => {
    (component.connections || []).forEach(connection => connect(component.id, connection?.target));
  });
  (Array.isArray(sheetConnections) ? sheetConnections : []).forEach(connection => {
    connect(connection?.from || connection?.source, connection?.to || connection?.target);
  });

  const visited = new Set();
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    (adjacency.get(id) || []).forEach(nextId => {
      if (!visited.has(nextId)) queue.push(nextId);
    });
  }
  return visited;
}

export function getEnergizedComponentIds(components = [], sheetConnections = [], {
  isComponentOpen = () => false,
  isSourceComponent = () => false,
  resolveComponentPorts = () => null
} = {}) {
  const allComponents = Array.isArray(components) ? components.filter(component => component?.id) : [];
  const byId = new Map(allComponents.map(component => [component.id, component]));
  const energized = new Set();
  const endpointAdjacency = new Map();
  const endpointKey = (id, port) => `${id}\u0000${Math.max(0, Number(port) || 0)}`;
  const connectEndpoints = (first, second) => {
    if (!endpointAdjacency.has(first)) endpointAdjacency.set(first, new Set());
    if (!endpointAdjacency.has(second)) endpointAdjacency.set(second, new Set());
    endpointAdjacency.get(first).add(second);
    endpointAdjacency.get(second).add(first);
  };
  const portCount = component => {
    const ports = Array.isArray(component?.ports) && component.ports.length
      ? component.ports
      : resolveComponentPorts(component);
    return Math.max(1, Array.isArray(ports) ? ports.length : 1);
  };
  const sourceAvailable = component => {
    if (!component || isComponentOpen(component)) return false;
    const values = [
      component.available,
      component.props?.available,
      component.enabled,
      component.props?.enabled
    ];
    if (values.some(value => value === false || value === 0 || value === 'false')) return false;
    const status = String(
      component.service_status
      || component.props?.service_status
      || component.commissioning_state
      || component.props?.commissioning_state
      || ''
    ).trim().toLowerCase();
    return !['off', 'offline', 'out_of_service', 'decommissioned', 'disabled', 'unavailable'].includes(status);
  };

  allComponents.forEach(component => {
    const count = portCount(component);
    if (isComponentOpen(component)) return;
    const subtype = String(component.subtype || '').toLowerCase();
    if ((subtype === 'ats' || subtype.endsWith('_ats')) && count >= 3) {
      const selectedSource = String(
        component.selected_source
        || component.props?.selected_source
        || component.source_priority
        || component.props?.source_priority
        || 'normal'
      ).toLowerCase();
      const selectedPort = selectedSource === 'emergency' || selectedSource === 'alternate' ? 1 : 0;
      const availableKey = selectedPort === 1 ? 'emergency_source_available' : 'normal_source_available';
      const selectedAvailable = component[availableKey] ?? component.props?.[availableKey] ?? true;
      if (selectedAvailable !== false) {
        connectEndpoints(endpointKey(component.id, selectedPort), endpointKey(component.id, 2));
      }
      return;
    }
    for (let first = 0; first < count; first += 1) {
      for (let second = first + 1; second < count; second += 1) {
        connectEndpoints(endpointKey(component.id, first), endpointKey(component.id, second));
      }
    }
  });

  allComponents.forEach(source => {
    (source.connections || []).forEach(connection => {
      if (!connection?.target || !byId.has(connection.target)) return;
      connectEndpoints(
        endpointKey(source.id, connection.sourcePort ?? connection.fromPort ?? 0),
        endpointKey(connection.target, connection.targetPort ?? connection.toPort ?? 0)
      );
    });
  });
  (Array.isArray(sheetConnections) ? sheetConnections : []).forEach(connection => {
    const from = connection?.from || connection?.source;
    const to = connection?.to || connection?.target;
    if (!byId.has(from) || !byId.has(to)) return;
    connectEndpoints(
      endpointKey(from, connection.sourcePort ?? connection.fromPort ?? 0),
      endpointKey(to, connection.targetPort ?? connection.toPort ?? 0)
    );
  });

  const queue = [];
  allComponents.forEach(component => {
    const builtInSource = component.type === 'sources'
      || component.subtype === 'bus_Utility'
      || component.subtype === 'bus_Generator';
    if (!(isSourceComponent(component) || builtInSource) || !sourceAvailable(component)) return;
    for (let port = 0; port < portCount(component); port += 1) {
      queue.push(endpointKey(component.id, port));
    }
  });
  const visited = new Set();
  while (queue.length) {
    const endpoint = queue.shift();
    if (visited.has(endpoint)) continue;
    visited.add(endpoint);
    const separator = endpoint.indexOf('\u0000');
    const id = separator >= 0 ? endpoint.slice(0, separator) : endpoint;
    if (byId.has(id)) energized.add(id);
    (endpointAdjacency.get(endpoint) || []).forEach(next => {
      if (!visited.has(next)) queue.push(next);
    });
  }
  return energized;
}

export function createComponentGroup(components = [], {
  id,
  label = 'Group',
  padding = 8,
  defaultWidth = 80,
  defaultHeight = 40
} = {}) {
  const members = Array.isArray(components) ? components.filter(component => component?.type !== 'group') : [];
  if (members.length < 2 || !id) return null;
  const bounds = members.map(component => getComponentBounds(component, { defaultWidth, defaultHeight }));
  const left = Math.min(...bounds.map(item => item.left));
  const top = Math.min(...bounds.map(item => item.top));
  const right = Math.max(...bounds.map(item => item.right));
  const bottom = Math.max(...bounds.map(item => item.bottom));
  return {
    id,
    type: 'group',
    subtype: 'group',
    x: left - padding,
    y: top - padding,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
    label,
    rotation: 0,
    memberIds: members.map(component => component.id),
    connections: [],
    props: {}
  };
}

export function getGroupMembers(components = [], groupId) {
  const group = (Array.isArray(components) ? components : [])
    .find(component => component?.id === groupId && component.type === 'group');
  if (!group) return [];
  const memberIds = new Set(group.memberIds || []);
  return components.filter(component => memberIds.has(component?.id));
}
