export function computeOrthogonalPath(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5) return [start, end];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const elbowX = start.x + dx * 0.5;
    return [start, { x: elbowX, y: start.y }, { x: elbowX, y: end.y }, end];
  }
  const elbowY = start.y + dy * 0.5;
  return [start, { x: start.x, y: elbowY }, { x: end.x, y: elbowY }, end];
}

export function routeBusTapPath(source, target, start, end, {
  isBusComponent,
  defaultWidth = 80,
  defaultHeight = 40
}) {
  const sourceIsBus = isBusComponent(source);
  const targetIsBus = isBusComponent(target);
  if (sourceIsBus === targetIsBus) return null;
  const bus = sourceIsBus ? source : target;
  const otherPoint = sourceIsBus ? end : start;
  const busWidth = Number(bus.width) || defaultWidth;
  const busHeight = Number(bus.height) || defaultHeight;
  const busLeft = Number(bus.x) || 0;
  const busRight = busLeft + busWidth;
  const busMidY = (Number(bus.y) || 0) + busHeight / 2;
  const busPoint = {
    x: Math.min(Math.max(otherPoint.x, busLeft), busRight),
    y: busMidY
  };
  const aligned = Math.abs(otherPoint.x - busPoint.x) < 0.5;
  if (sourceIsBus) {
    return aligned ? [busPoint, end] : [busPoint, { x: end.x, y: busPoint.y }, end];
  }
  return aligned ? [start, busPoint] : [start, { x: start.x, y: busPoint.y }, busPoint];
}

function clampRouteMidpoint(value, viewport, axis) {
  if (!viewport) return value;
  const minimum = axis === 'x' ? viewport.minX : viewport.minY;
  const size = axis === 'x' ? viewport.width : viewport.height;
  if (!Number.isFinite(minimum) || !Number.isFinite(size)) return value;
  return Math.min(Math.max(value, minimum), minimum + size);
}

function pathIntersectsComponents(path, source, target, routeCandidates, defaultWidth, defaultHeight) {
  for (let index = 0; index < path.length - 1; index += 1) {
    const first = path[index];
    const second = path[index + 1];
    const horizontal = first.y === second.y;
    const x1 = Math.min(first.x, second.x);
    const x2 = Math.max(first.x, second.x);
    const y1 = Math.min(first.y, second.y);
    const y2 = Math.max(first.y, second.y);
    for (const component of routeCandidates(x1, y1, x2, y2)) {
      if (component === source || component === target) continue;
      const rect = {
        x: component.x,
        y: component.y,
        width: component.width || defaultWidth,
        height: component.height || defaultHeight
      };
      if (horizontal) {
        if (first.y >= rect.y && first.y <= rect.y + rect.height && x2 >= rect.x && x1 <= rect.x + rect.width) {
          return true;
        }
      } else if (first.x >= rect.x && first.x <= rect.x + rect.width && y2 >= rect.y && y1 <= rect.y + rect.height) {
        return true;
      }
    }
  }
  return false;
}

export function routeConnection(source, target, connection, {
  portPosition,
  portDirection,
  isBusComponent,
  isConductorSegmentComponent = () => false,
  routeCandidates = () => [],
  diagramViewport = null,
  orthogonalRouting = false,
  defaultWidth = 80,
  defaultHeight = 40,
  maxAdjustSteps = 12
}) {
  const start = portPosition(source, connection?.sourcePort);
  const end = portPosition(target, connection?.targetPort);
  const sourceDirection = portDirection(source, connection?.sourcePort);
  const targetDirection = portDirection(target, connection?.targetPort);
  let path;
  let busTapPath = false;
  if (connection?.dir && !isBusComponent(source) && !isBusComponent(target)) {
    const mid = connection.mid ?? (connection.dir === 'h'
      ? (start.x + end.x) / 2
      : (start.y + end.y) / 2);
    path = connection.dir === 'h'
      ? [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end]
      : [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end];
    connection.mid = mid;
  }

  const horizontalFirst = () => {
    const initialMid = (start.x + end.x) / 2;
    let midX = initialMid;
    for (let attempt = 0; attempt < maxAdjustSteps; attempt += 1) {
      let moved = false;
      routeCandidates(
        Math.min(start.x, end.x, midX), Math.min(start.y, end.y),
        Math.max(start.x, end.x, midX), Math.max(start.y, end.y)
      ).forEach(component => {
        if (component === source || component === target) return;
        const rect = {
          x: component.x, y: component.y,
          width: component.width || defaultWidth, height: component.height || defaultHeight
        };
        if (
          rect.x <= midX && midX <= rect.x + rect.width
          && Math.min(start.y, end.y) <= rect.y + rect.height
          && Math.max(start.y, end.y) >= rect.y
        ) {
          midX = midX < rect.x + rect.width / 2 ? rect.x - 10 : rect.x + rect.width + 10;
          moved = true;
        }
        if (
          start.y >= rect.y && start.y <= rect.y + rect.height
          && Math.min(start.x, midX) <= rect.x + rect.width
          && Math.max(start.x, midX) >= rect.x
        ) {
          midX = midX < rect.x ? rect.x - 10 : rect.x + rect.width + 10;
          moved = true;
        }
        if (
          end.y >= rect.y && end.y <= rect.y + rect.height
          && Math.min(end.x, midX) <= rect.x + rect.width
          && Math.max(end.x, midX) >= rect.x
        ) {
          midX = midX < rect.x ? rect.x - 10 : rect.x + rect.width + 10;
          moved = true;
        }
      });
      if (!moved) break;
    }
    if (!Number.isFinite(midX)) midX = initialMid;
    midX = clampRouteMidpoint(midX, diagramViewport, 'x');
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  };

  const verticalFirst = () => {
    const initialMid = (start.y + end.y) / 2;
    let midY = initialMid;
    for (let attempt = 0; attempt < maxAdjustSteps; attempt += 1) {
      let moved = false;
      routeCandidates(
        Math.min(start.x, end.x), Math.min(start.y, end.y, midY),
        Math.max(start.x, end.x), Math.max(start.y, end.y, midY)
      ).forEach(component => {
        if (component === source || component === target) return;
        const rect = {
          x: component.x, y: component.y,
          width: component.width || defaultWidth, height: component.height || defaultHeight
        };
        if (
          rect.y <= midY && midY <= rect.y + rect.height
          && Math.min(start.x, end.x) <= rect.x + rect.width
          && Math.max(start.x, end.x) >= rect.x
        ) {
          midY = midY < rect.y + rect.height / 2 ? rect.y - 10 : rect.y + rect.height + 10;
          moved = true;
        }
        if (
          start.x >= rect.x && start.x <= rect.x + rect.width
          && Math.min(start.y, midY) <= rect.y + rect.height
          && Math.max(start.y, midY) >= rect.y
        ) {
          midY = midY < rect.y ? rect.y - 10 : rect.y + rect.height + 10;
          moved = true;
        }
        if (
          end.x >= rect.x && end.x <= rect.x + rect.width
          && Math.min(end.y, midY) <= rect.y + rect.height
          && Math.max(end.y, midY) >= rect.y
        ) {
          midY = midY < rect.y ? rect.y - 10 : rect.y + rect.height + 10;
          moved = true;
        }
      });
      if (!moved) break;
    }
    if (!Number.isFinite(midY)) midY = initialMid;
    midY = clampRouteMidpoint(midY, diagramViewport, 'y');
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  };

  if (!path) {
    const busPath = routeBusTapPath(source, target, start, end, {
      isBusComponent, defaultWidth, defaultHeight
    });
    if (busPath) {
      path = busPath;
      busTapPath = true;
      if (connection) {
        delete connection.dir;
        delete connection.mid;
      }
    } else if (orthogonalRouting) {
      path = computeOrthogonalPath(start, end);
      if (connection) {
        delete connection.dir;
        delete connection.mid;
      }
    } else {
      const horizontal = horizontalFirst();
      const vertical = verticalFirst();
      const horizontalBlocked = pathIntersectsComponents(
        horizontal, source, target, routeCandidates, defaultWidth, defaultHeight
      );
      const verticalBlocked = pathIntersectsComponents(
        vertical, source, target, routeCandidates, defaultWidth, defaultHeight
      );
      const preferHorizontal = targetDirection === 'left' || targetDirection === 'right';
      if (preferHorizontal) {
        path = !horizontalBlocked ? horizontal : !verticalBlocked ? vertical : horizontal.length <= vertical.length ? horizontal : vertical;
      } else {
        path = !verticalBlocked ? vertical : !horizontalBlocked ? horizontal : horizontal.length <= vertical.length ? horizontal : vertical;
      }
      if (connection) {
        connection.dir = path === horizontal ? 'h' : 'v';
        connection.mid = connection.dir === 'h' ? path[1].x : path[1].y;
      }
    }
  }

  if (!busTapPath) {
    const penultimate = path[path.length - 2];
    if ((targetDirection === 'top' || targetDirection === 'bottom') && penultimate.x !== end.x) {
      path.splice(path.length - 1, 0, { x: end.x, y: penultimate.y });
    } else if ((targetDirection === 'left' || targetDirection === 'right') && penultimate.y !== end.y) {
      path.splice(path.length - 1, 0, { x: penultimate.x, y: end.y });
    }
  }

  const samePoint = (first, second) => Math.abs(first.x - second.x) < 0.01 && Math.abs(first.y - second.y) < 0.01;
  const offsetPoint = (point, direction) => {
    if (direction === 'left') return { x: point.x - 18, y: point.y };
    if (direction === 'right') return { x: point.x + 18, y: point.y };
    if (direction === 'top') return { x: point.x, y: point.y - 18 };
    if (direction === 'bottom') return { x: point.x, y: point.y + 18 };
    return point;
  };
  if (isConductorSegmentComponent(source) && sourceDirection && path.length > 1) {
    const stub = offsetPoint(path[0], sourceDirection);
    if (!samePoint(path[0], stub) && (!path[1] || !samePoint(path[1], stub))) path.splice(1, 0, stub);
  }
  if (isConductorSegmentComponent(target) && targetDirection && path.length > 1) {
    const insertAt = path.length - 1;
    const stub = offsetPoint(path[insertAt], targetDirection);
    if (!samePoint(path[insertAt], stub) && (!path[insertAt - 1] || !samePoint(path[insertAt - 1], stub))) {
      path.splice(insertAt, 0, stub);
    }
  }
  return path;
}

export function routeMidpoint(points) {
  if (!Array.isArray(points) || !points.length) return { x: 0, y: 0 };
  const segments = [];
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];
    const segmentLength = Math.hypot(second.x - first.x, second.y - first.y);
    if (!Number.isFinite(segmentLength) || segmentLength <= 0) continue;
    segments.push({ first, second, length: segmentLength });
    length += segmentLength;
  }
  if (!segments.length) return points[0] || { x: 0, y: 0 };
  let remaining = length / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = remaining / segment.length;
      return {
        x: segment.first.x + (segment.second.x - segment.first.x) * ratio,
        y: segment.first.y + (segment.second.y - segment.first.y) * ratio
      };
    }
    remaining -= segment.length;
  }
  return segments.at(-1).second;
}

export function connectionLabelPosition(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { ...routeMidpoint(points), textAnchor: 'middle' };
  }
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];
    const length = Math.hypot(second.x - first.x, second.y - first.y);
    if (Number.isFinite(length) && length > 0) segments.push({ first, second, length });
  }
  const segment = segments.sort((first, second) => second.length - first.length)[0];
  if (!segment) return { ...routeMidpoint(points), textAnchor: 'middle' };
  const horizontal = Math.abs(segment.second.x - segment.first.x) >= Math.abs(segment.second.y - segment.first.y);
  const x = (segment.first.x + segment.second.x) / 2;
  const y = (segment.first.y + segment.second.y) / 2;
  return horizontal ? { x, y: y - 11, textAnchor: 'middle' } : { x: x + 11, y, textAnchor: 'start' };
}
