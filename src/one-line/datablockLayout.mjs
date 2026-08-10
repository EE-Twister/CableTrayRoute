export function rectsOverlap(first, second, padding = 0) {
  if (!first || !second) return false;
  return !(
    first.x + first.width + padding < second.x
    || second.x + second.width + padding < first.x
    || first.y + first.height + padding < second.y
    || second.y + second.height + padding < first.y
  );
}

export function expandRect(rect, padding = 0) {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };
}

export function rectFromComponentBounds(bounds) {
  return {
    x: bounds.left,
    y: bounds.top,
    width: Math.max(1, bounds.right - bounds.left),
    height: Math.max(1, bounds.bottom - bounds.top)
  };
}

export function createDatablockLayout(items = [], {
  getComponentBounds,
  fallbackBounds = { minX: 0, minY: 0, width: 1200, height: 800 }
} = {}) {
  if (typeof getComponentBounds !== 'function') {
    throw new TypeError('getComponentBounds must be provided');
  }
  const occupied = [];
  const content = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  items.forEach(component => {
    if (!component || component.type === 'dimension') return;
    const bounds = getComponentBounds(component);
    occupied.push(expandRect(rectFromComponentBounds(bounds), 12));
    content.minX = Math.min(content.minX, bounds.left);
    content.minY = Math.min(content.minY, bounds.top);
    content.maxX = Math.max(content.maxX, bounds.right);
    content.maxY = Math.max(content.maxY, bounds.bottom);
  });
  if (!Number.isFinite(content.minX)) {
    content.minX = fallbackBounds.minX;
    content.minY = fallbackBounds.minY;
    content.maxX = fallbackBounds.minX + fallbackBounds.width;
    content.maxY = fallbackBounds.minY + fallbackBounds.height;
  }
  return {
    content,
    occupied,
    reserve(rect) {
      occupied.push(expandRect(rect, 10));
    }
  };
}

export function chooseDatablockPlacement(bounds, width, height, layout) {
  const centerX = (bounds.left + bounds.right) / 2;
  const margin = 14;
  const rightCrowded = bounds.right + width > layout.content.maxX + 140;
  const leftCrowded = bounds.left - width < layout.content.minX - 140;
  let sideOrder = ['right', 'left', 'bottom', 'top'];
  if (rightCrowded && !leftCrowded) sideOrder = ['left', 'bottom', 'top', 'right'];
  if (leftCrowded && !rightCrowded) sideOrder = ['right', 'bottom', 'top', 'left'];
  const offsets = [0, 28, -28, 58, -58, 92, -92, 126, -126];
  const makeCandidate = (side, offset) => {
    if (side === 'right') return { side, x: bounds.right + margin, y: bounds.top + offset };
    if (side === 'left') return { side, x: bounds.left - width - margin, y: bounds.top + offset };
    if (side === 'bottom') return { side, x: centerX - width / 2 + offset, y: bounds.bottom + margin };
    return { side, x: centerX - width / 2 + offset, y: bounds.top - height - margin };
  };
  for (const side of sideOrder) {
    for (const offset of offsets) {
      const candidate = makeCandidate(side, offset);
      const rect = { x: candidate.x, y: candidate.y, width, height };
      if (!layout.occupied.some(existing => rectsOverlap(rect, existing, 4))) return candidate;
    }
  }
  return makeCandidate(sideOrder[0], offsets[offsets.length - 1]);
}

export function chooseEngineeringDatablockPlacement(component, bounds, width, height, layout, {
  isBusComponent = () => false,
  resolveComponentCategory = () => ''
} = {}) {
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const bus = isBusComponent(component);
  const margin = bus ? 18 : 10;
  const preferred = bus || resolveComponentCategory(component) === 'sources'
    ? ['right', 'bottom', 'left', 'top']
    : ['bottom', 'right', 'left', 'top'];
  const offsets = [0, 22, -22, 44, -44, 72, -72, 100, -100];
  const makeCandidate = (side, offset) => {
    if (side === 'right') return { side, x: bounds.right + margin, y: centerY - height / 2 + offset };
    if (side === 'left') return { side, x: bounds.left - width - margin, y: centerY - height / 2 + offset };
    if (side === 'bottom') return { side, x: centerX - width / 2 + offset, y: bounds.bottom + margin };
    return { side, x: centerX - width / 2 + offset, y: bounds.top - height - margin };
  };
  for (const side of preferred) {
    for (const offset of offsets) {
      const candidate = makeCandidate(side, offset);
      const rect = { x: candidate.x, y: candidate.y, width, height };
      if (!layout.occupied.some(existing => rectsOverlap(rect, existing, 4))) return candidate;
    }
  }
  return makeCandidate(preferred[0], offsets[offsets.length - 1]);
}

export function truncateDatablockLine(line, limit = 38) {
  const text = String(line || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}
