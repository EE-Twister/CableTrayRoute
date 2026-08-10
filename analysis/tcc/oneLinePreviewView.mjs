function wrapPreviewLabel(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return [''];
  const maxLength = 18;
  const words = value.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach(word => {
    const tentative = current ? `${current} ${word}` : word;
    if (tentative.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = tentative;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, 3).map(line => (line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line));
}

function describeConnectionLabel(conn) {
  if (!conn || typeof conn !== 'object') return '';
  const keys = ['label', 'name', 'id', 'type', 'circuit'];
  for (const key of keys) {
    const value = conn[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

function resolveComponentId(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (value && typeof value === 'object') {
    const keys = ['id', 'component', 'target', 'to', 'from', 'a', 'b'];
    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) return trimmed;
      }
    }
  }
  return null;
}

function buildPreviewAdjacency(componentMap, sheet) {
  const adjacency = new Map();
  const ensureEntry = id => {
    if (!adjacency.has(id)) adjacency.set(id, new Set());
    return adjacency.get(id);
  };
  const addConnection = (source, target) => {
    const sourceId = resolveComponentId(source);
    const targetId = resolveComponentId(target);
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!componentMap.has(sourceId) || !componentMap.has(targetId)) return;
    ensureEntry(sourceId).add(targetId);
    ensureEntry(targetId).add(sourceId);
  };

  (sheet?.connections || []).forEach(conn => {
    if (!conn) return;
    const from = conn.from ?? conn.source ?? conn.a ?? conn.start ?? null;
    const to = conn.to ?? conn.target ?? conn.b ?? conn.end ?? null;
    addConnection(from, to);
  });

  componentMap.forEach((comp, id) => {
    if (!comp) return;
    const list = Array.isArray(comp.connections) ? comp.connections : [];
    list.forEach(conn => {
      if (!conn) return;
      const candidates = [
        conn.target,
        conn.to,
        conn.source,
        conn.from,
        conn.a,
        conn.b,
        conn.end,
        conn.start,
        conn.component
      ];
      let targetId = null;
      for (const candidate of candidates) {
        const resolved = resolveComponentId(candidate);
        if (resolved && resolved !== id) {
          targetId = resolved;
          break;
        }
      }
      if (!targetId && typeof conn.id === 'string' && conn.id !== id) {
        targetId = conn.id;
      }
      if (targetId) {
        addConnection(id, targetId);
      }
    });
  });

  return adjacency;
}

export function renderOneLinePreviewView(componentId, dependencies = {}) {
  const {
    state = {},
    buildAnnotationPreviewLines,
    clampValue,
    componentLabel,
    componentLookup,
    d3,
    deviceMap,
    getContextComponentRelationshipMap,
    getCurveColorForComponentId,
    getPreviewDefinition,
    normalizeAnnotationPreview,
    normalizeTypeKey,
    onelinePreviewContainer,
    onelinePreviewEmpty,
    onelinePreviewNote,
    onelinePreviewSvg,
    placeholderIcon,
    PREVIEW_SHAPE_DASH_PATTERNS,
    previewPositionOverrides,
    renderOneLinePreview,
    resolveIconSource,
    selectedDeviceIds,
    setActiveComponent
  } = dependencies;
  let { onelinePreviewSvgEl, onelinePreviewTransform } = state;
  try {
  if (!onelinePreviewSvgEl || !onelinePreviewSvg) return;
  if (!componentId || !componentLookup.has(componentId)) {
    onelinePreviewTransform = null;
    onelinePreviewSvg.selectAll('*').remove();
    if (onelinePreviewSvgEl) onelinePreviewSvgEl.classList.add('hidden');
    if (onelinePreviewContainer) onelinePreviewContainer.classList.add('empty');
    if (onelinePreviewEmpty) {
      onelinePreviewEmpty.textContent = 'Select a one-line component to see its connections.';
      onelinePreviewEmpty.classList.remove('hidden');
    }
    if (onelinePreviewNote) onelinePreviewNote.classList.add('hidden');
    return;
  }

  const record = componentLookup.get(componentId);
  if (!record) {
    renderOneLinePreview(null);
    return;
  }

  const sheet = record.sheet;
  const sheetComponents = Array.isArray(sheet?.components) ? sheet.components : [];
  const componentMap = new Map(sheetComponents.map(comp => [comp.id, comp]));

  const selectedEntries = selectedDeviceIds()
    .map(uid => deviceMap.get(uid))
    .filter(entry => entry && entry.kind === 'component');
  const selectedIds = new Set(selectedEntries.map(entry => entry.componentId));
  const sameSheetSelections = [...selectedIds].filter(id => {
    const info = componentLookup.get(id);
    return info && info.sheetIndex === record.sheetIndex;
  });
  const offSheetCount = Math.max(0, selectedEntries.length - sameSheetSelections.length);
  const adjacency = buildPreviewAdjacency(componentMap, sheet);
  const neighborSet = componentId && adjacency.has(componentId)
    ? adjacency.get(componentId)
    : new Set();
  const neighborCount = neighborSet.size + 1; // include the active component itself
  const HARD_MAX_PREVIEW_COMPONENTS = 200;
  const maxComponents = Math.min(
    HARD_MAX_PREVIEW_COMPONENTS,
    Math.max(20, neighborCount, sameSheetSelections.length + 5)
  );
  // Bound how much of the neighbor set we traverse so a pathological
  // high-degree node cannot freeze the preview render. Anything beyond the
  // bound could never be displayed (maxComponents is the hard ceiling).
  const MAX_PREVIEW_NEIGHBORS = Math.max(maxComponents * 3, sameSheetSelections.length + 5);
  const boundedNeighbors = [];
  for (const id of neighborSet) {
    if (!componentMap.has(id)) continue;
    boundedNeighbors.push(id);
    if (boundedNeighbors.length >= MAX_PREVIEW_NEIGHBORS) break;
  }

  const addUnique = (list, seen, id) => {
    if (!id) return;
    if (!componentMap.has(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    list.push(id);
  };

  const orderedTargets = [];
  const orderedTargetSet = new Set();
  addUnique(orderedTargets, orderedTargetSet, componentId);
  boundedNeighbors.forEach(id => addUnique(orderedTargets, orderedTargetSet, id));

  const prioritizedTargets = [];
  const prioritizedTargetSet = new Set();
  addUnique(prioritizedTargets, prioritizedTargetSet, componentId);
  boundedNeighbors.forEach(id => addUnique(prioritizedTargets, prioritizedTargetSet, id));
  sameSheetSelections.forEach(id => addUnique(prioritizedTargets, prioritizedTargetSet, id));

  const availableTargets = prioritizedTargets.length ? prioritizedTargets : orderedTargets;
  if (!availableTargets.length) {
    onelinePreviewTransform = null;
    onelinePreviewSvg.selectAll('*').remove();
    onelinePreviewSvgEl.classList.add('hidden');
    if (onelinePreviewContainer) onelinePreviewContainer.classList.add('empty');
    if (onelinePreviewEmpty) {
      onelinePreviewEmpty.textContent = 'No one-line preview available for the current selection.';
      onelinePreviewEmpty.classList.remove('hidden');
    }
    if (onelinePreviewNote) {
      if (offSheetCount > 0) {
        onelinePreviewNote.textContent = `${offSheetCount} selected ${offSheetCount === 1 ? 'device is' : 'devices are'} on other sheets and are not shown.`;
        onelinePreviewNote.classList.remove('hidden');
      } else {
        onelinePreviewNote.classList.add('hidden');
      }
    }
    return;
  }

  const width = Number(onelinePreviewSvgEl.getAttribute('width')) || 320;
  const height = Number(onelinePreviewSvgEl.getAttribute('height')) || 280;
  onelinePreviewSvg.attr('viewBox', `0 0 ${width} ${height}`);
  onelinePreviewSvg.selectAll('*').remove();
  const gridPatternId = 'oneline-preview-grid-pattern';
  const gridSize = 24;
  const defs = onelinePreviewSvg.append('defs');
  defs.append('pattern')
    .attr('id', gridPatternId)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', gridSize)
    .attr('height', gridSize)
    .append('path')
    .attr('class', 'oneline-preview-grid-line')
    .attr('d', `M ${gridSize} 0 L 0 0 0 ${gridSize}`);
  defs.append('marker')
    .attr('id', 'oneline-preview-flow-arrow')
    .attr('viewBox', '0 0 8 8')
    .attr('refX', 7)
    .attr('refY', 4)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto-start-reverse')
    .append('path')
    .attr('class', 'preview-orientation-arrow-head')
    .attr('d', 'M 0 0 L 8 4 L 0 8 z');

  onelinePreviewSvg.append('rect')
    .attr('class', 'oneline-preview-grid')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', `url(#${gridPatternId})`);
  const orientationCue = onelinePreviewSvg.append('g')
    .attr('class', 'preview-orientation-cue')
    .attr('transform', `translate(${Math.max(16, width - 72)}, 18)`);
  orientationCue.append('text')
    .attr('x', 0)
    .attr('y', 0)
    .text('Source');
  orientationCue.append('line')
    .attr('x1', 22)
    .attr('x2', 22)
    .attr('y1', 8)
    .attr('y2', 54)
    .attr('marker-end', 'url(#oneline-preview-flow-arrow)');
  orientationCue.append('text')
    .attr('x', 0)
    .attr('y', 72)
    .text('Load');
  onelinePreviewSvgEl.classList.remove('hidden');
  if (onelinePreviewContainer) onelinePreviewContainer.classList.remove('empty');
  if (onelinePreviewEmpty) onelinePreviewEmpty.classList.add('hidden');

  const displayedTargets = availableTargets.slice(0, maxComponents);
  const truncatedCount = Math.max(0, availableTargets.length - displayedTargets.length);
  const displayedSet = new Set(displayedTargets);
  const hiddenSelectionCount = sameSheetSelections.filter(id => !displayedSet.has(id)).length;

  const DEFAULT_WIDTH = 120;
  const DEFAULT_HEIGHT = 60;
  const MIN_NODE_WIDTH = 24;
  const MIN_NODE_HEIGHT = 18;

  const normalizeRotation = value => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const normalized = numeric % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  };

  const defaultPreviewRotationFor = (comp, definition) => {
    if (definition && Number.isFinite(Number(definition.defaultRotation))) {
      return normalizeRotation(Number(definition.defaultRotation));
    }
    const type = normalizeTypeKey(comp?.type || comp?.subtype || definition?.type || definition?.category || '');
    if (type === 'bus' || type === 'annotation') return 0;
    if (type === 'load' || type === 'static_load' || type === 'motor_load' || type.endsWith('_load')) return 270;
    return 90;
  };

  const resolvePreviewRotation = (comp, definition) => {
    const rawRotation = comp?.rotation ?? comp?.rot;
    if (rawRotation !== undefined && rawRotation !== null && rawRotation !== '') {
      return normalizeRotation(rawRotation);
    }
    return defaultPreviewRotationFor(comp, definition);
  };

  const computeBounds = (x, y, width, height, rotation) => {
    if (!rotation) {
      return {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height
      };
    }
    const angle = rotation * Math.PI / 180;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rotatePoint = (px, py) => {
      const dx = px - cx;
      const dy = py - cy;
      return {
        x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: cy + dx * Math.sin(angle) + dy * Math.cos(angle)
      };
    };
    const points = [
      rotatePoint(x, y),
      rotatePoint(x + width, y),
      rotatePoint(x, y + height),
      rotatePoint(x + width, y + height)
    ];
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys)
    };
  };

  const componentPreviewMeta = new Map();

  displayedTargets.forEach(id => {
    const comp = componentMap.get(id);
    if (!comp) return;
    const compWidth = Number.isFinite(comp.width) ? Number(comp.width) : DEFAULT_WIDTH;
    const compHeight = Number.isFinite(comp.height) ? Number(comp.height) : DEFAULT_HEIGHT;
    const compX = Number.isFinite(comp.x) ? Number(comp.x) : 0;
    const compY = Number.isFinite(comp.y) ? Number(comp.y) : 0;
    const definition = getPreviewDefinition(comp);
    const rotation = resolvePreviewRotation(comp, definition);
    const baseBounds = computeBounds(compX, compY, compWidth, compHeight, rotation);
    const spanWidth = baseBounds.right - baseBounds.left;
    const spanHeight = baseBounds.bottom - baseBounds.top;
    const centerX = (baseBounds.left + baseBounds.right) / 2;
    const centerY = (baseBounds.top + baseBounds.bottom) / 2;
    const adjustedBounds = {
      left: centerX - spanWidth / 2,
      right: centerX + spanWidth / 2,
      top: centerY - spanHeight / 2,
      bottom: centerY + spanHeight / 2
    };
    const icon = definition?.icon || resolveIconSource(comp.icon, comp.symbol);
    const category = definition?.category || definition?.type || comp.type || '';
    const previewType = definition?.type || comp.type || '';
    const annotation = normalizeAnnotationPreview(comp);
    componentPreviewMeta.set(id, {
      bounds: adjustedBounds,
      width: compWidth,
      height: compHeight,
      originalWidth: compWidth,
      originalHeight: compHeight,
      rotation,
      center: { x: centerX, y: centerY },
      spanWidth,
      spanHeight,
      icon: icon || placeholderIcon,
      category,
      type: previewType,
      flipped: !!comp.flipped,
      annotation,
      definition
    });
  });

  const computeMetaExtents = () => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    componentPreviewMeta.forEach(meta => {
      if (!meta || !meta.bounds) return;
      minX = Math.min(minX, meta.bounds.left);
      minY = Math.min(minY, meta.bounds.top);
      maxX = Math.max(maxX, meta.bounds.right);
      maxY = Math.max(maxY, meta.bounds.bottom);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }
    return { minX, minY, maxX, maxY };
  };

  let extents = computeMetaExtents();
  if (!extents) {
    extents = { minX: 0, minY: 0, maxX: width, maxY: height };
  }

  const expandExtents = (current, minSpan) => {
    const { minX, maxX, minY, maxY } = current;
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const desiredX = Math.max(spanX, minSpan.width);
    const desiredY = Math.max(spanY, minSpan.height);
    let nextMinX = minX;
    let nextMaxX = maxX;
    let nextMinY = minY;
    let nextMaxY = maxY;
    if (spanX < desiredX) {
      const centerX = (minX + maxX) / 2 || 0;
      nextMinX = centerX - desiredX / 2;
      nextMaxX = centerX + desiredX / 2;
    }
    if (spanY < desiredY) {
      const centerY = (minY + maxY) / 2 || 0;
      nextMinY = centerY - desiredY / 2;
      nextMaxY = centerY + desiredY / 2;
    }
    return { minX: nextMinX, maxX: nextMaxX, minY: nextMinY, maxY: nextMaxY };
  };

  extents = expandExtents(extents, { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  const boundsWidth = Math.max(1, extents.maxX - extents.minX);
  const boundsHeight = Math.max(1, extents.maxY - extents.minY);
  const padding = Math.min(width, height) < 320 ? 24 : 36;
  const scaleX = (width - padding * 2) / boundsWidth;
  const scaleY = (height - padding * 2) / boundsHeight;
  const rawScale = Math.min(scaleX, scaleY);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? Math.min(rawScale, 2.5) : 1;
  const offsetX = padding - extents.minX * scale;
  const offsetY = padding - extents.minY * scale;

  onelinePreviewTransform = {
    scale,
    offsetX,
    offsetY,
    width,
    height
  };

  const overrideKeyForComponent = compId => {
    const sheetKey = sheet?.id || sheet?.key || sheet?.name || record.sheetIndex || 'sheet';
    return `${sheetKey}:${compId}`;
  };

  const componentRelationshipMap = getContextComponentRelationshipMap(componentId);
  const nodes = displayedTargets.map(id => {
    const comp = componentMap.get(id);
    const meta = componentPreviewMeta.get(id);
    if (!comp || !meta) return null;
    const { bounds, width: compWidth, height: compHeight, rotation, center, spanWidth, spanHeight } = meta;
    const baseCenterX = center ? center.x * scale + offsetX : ((bounds.left + bounds.right) / 2) * scale + offsetX;
    const baseCenterY = center ? center.y * scale + offsetY : ((bounds.top + bounds.bottom) / 2) * scale + offsetY;
    const scaledWidth = Math.max(0, (bounds.right - bounds.left) * scale);
    const scaledHeight = Math.max(0, (bounds.bottom - bounds.top) * scale);
    const fallbackWidth = Number.isFinite(compWidth) ? compWidth * scale : 0;
    const fallbackHeight = Number.isFinite(compHeight) ? compHeight * scale : 0;
    const spanWidthScaled = Number.isFinite(spanWidth) ? spanWidth * scale : 0;
    const spanHeightScaled = Number.isFinite(spanHeight) ? spanHeight * scale : 0;
    const widthCandidates = [scaledWidth, fallbackWidth, spanWidthScaled].filter(value => Number.isFinite(value) && value > 0);
    const heightCandidates = [scaledHeight, fallbackHeight, spanHeightScaled].filter(value => Number.isFinite(value) && value > 0);
    const baseWidth = widthCandidates.length ? widthCandidates[0] : MIN_NODE_WIDTH;
    const baseHeight = heightCandidates.length ? heightCandidates[0] : MIN_NODE_HEIGHT;
    const visualWidth = Math.max(12, baseWidth);
    const visualHeight = Math.max(12, baseHeight);
    const overrideKey = overrideKeyForComponent(comp.id);
    const storedOverride = previewPositionOverrides.get(overrideKey);
    const overrideDx = Number.isFinite(storedOverride?.dx) ? storedOverride.dx : 0;
    const overrideDy = Number.isFinite(storedOverride?.dy) ? storedOverride.dy : 0;
    const centerX = baseCenterX + overrideDx;
    const centerY = baseCenterY + overrideDy;
    const originalWidth = Number.isFinite(meta.originalWidth) ? meta.originalWidth : compWidth;
    const originalHeight = Number.isFinite(meta.originalHeight) ? meta.originalHeight : compHeight;
    const widthScale = Number.isFinite(originalWidth) && originalWidth > 0 ? visualWidth / originalWidth : 1;
    const heightScale = Number.isFinite(originalHeight) && originalHeight > 0 ? visualHeight / originalHeight : 1;
    const relationship = componentRelationshipMap.get(comp.id) || null;
    return {
      id: comp.id,
      label: componentLabel(comp),
      sheet: record.sheetName,
      x: centerX,
      y: centerY,
      baseX: baseCenterX,
      baseY: baseCenterY,
      overrideKey,
      overrideDx,
      overrideDy,
      active: comp.id === componentId,
      component: comp,
      selected: selectedIds.has(comp.id),
      relationship,
      curveColor: getCurveColorForComponentId(comp.id) || relationship?.color || null,
      width: visualWidth,
      height: visualHeight,
      rotation,
      icon: meta.icon || placeholderIcon,
      category: meta.category || '',
      type: meta.type || '',
      flipped: !!meta.flipped,
      annotation: meta.annotation,
      definition: meta.definition || null,
      originalWidth,
      originalHeight,
      widthScale,
      heightScale
    };
  }).filter(Boolean);

  const displayedIdSet = new Set(nodes.map(node => node.id));
  const edgesMap = new Map();

  const addEdge = (source, target, labelText) => {
    if (!source || !target || source === target) return;
    if (!displayedIdSet.has(source) || !displayedIdSet.has(target)) return;
    const key = source < target ? `${source}--${target}` : `${target}--${source}`;
    let entry = edgesMap.get(key);
    if (!entry) {
      entry = { source, target, labels: [] };
      edgesMap.set(key, entry);
    }
    if (labelText) entry.labels.push(labelText);
  };

  (sheet?.connections || []).forEach(conn => {
    if (!conn) return;
    const from = conn.from ?? conn.source ?? conn.a ?? conn.start ?? null;
    const to = conn.to ?? conn.target ?? conn.b ?? conn.end ?? null;
    if (!from || !to) return;
    addEdge(from, to, describeConnectionLabel(conn));
  });

  displayedTargets.forEach(id => {
    const comp = componentMap.get(id);
    if (!comp) return;
    (comp.connections || []).forEach(conn => {
      if (!conn) return;
      const targetId = typeof conn.target === 'string' ? conn.target : conn.target?.id;
      if (!targetId) return;
      addEdge(comp.id, targetId, describeConnectionLabel(conn));
    });
  });

  const edges = [...edgesMap.values()].map(edge => ({
    source: edge.source,
    target: edge.target,
    label: edge.labels.filter(Boolean).join(', ')
  }));

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const nodeXs = nodes.map(node => node.x).filter(Number.isFinite);
  const nodeYs = nodes.map(node => node.y).filter(Number.isFinite);
  const nodeSpanX = nodeXs.length ? Math.max(...nodeXs) - Math.min(...nodeXs) : 0;
  const nodeSpanY = nodeYs.length ? Math.max(...nodeYs) - Math.min(...nodeYs) : 0;
  const useSidePreviewLabels = nodes.length > 2 && nodeSpanY > Math.max(80, nodeSpanX * 1.35);

  const linkGroup = onelinePreviewSvg.append('g').attr('class', 'preview-links');
  const edgeKey = edge => (edge.source < edge.target ? `${edge.source}--${edge.target}` : `${edge.target}--${edge.source}`);
  const linkLines = linkGroup.selectAll('line')
    .data(edges, edgeKey)
    .join('line')
    .attr('class', 'preview-link');

  const linkLabelSelection = linkGroup.selectAll('text')
    .data(edges.filter(edge => edge.label), edgeKey)
    .join('text')
    .attr('class', 'preview-link-label')
    .text(d => d.label);

  const updateLinks = () => {
    linkLines
      .attr('x1', d => nodeById.get(d.source)?.x ?? 0)
      .attr('y1', d => nodeById.get(d.source)?.y ?? 0)
      .attr('x2', d => nodeById.get(d.target)?.x ?? 0)
      .attr('y2', d => nodeById.get(d.target)?.y ?? 0);
    linkLabelSelection
      .attr('x', d => {
        const source = nodeById.get(d.source);
        const target = nodeById.get(d.target);
        return source && target ? (source.x + target.x) / 2 : width / 2;
      })
      .attr('y', d => {
        const source = nodeById.get(d.source);
        const target = nodeById.get(d.target);
        return source && target ? (source.y + target.y) / 2 : height / 2;
      });
  };

  updateLinks();

  const nodeGroup = onelinePreviewSvg.append('g').attr('class', 'preview-nodes');
  const node = nodeGroup.selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', d => {
      const classes = ['preview-node'];
      if (d.active) classes.push('is-active');
      else if (d.selected) classes.push('is-selected');
      if (d.relationship?.role) classes.push(`is-${d.relationship.role}`);
      return classes.join(' ');
    })
    .attr('transform', d => `translate(${d.x},${d.y})`)
    .attr('pointer-events', 'bounding-box')
    .style('pointer-events', 'bounding-box');

  const computeOutlineRadius = datum => {
    if (datum.annotation) {
      if (datum.annotation.shapeType === 'circle') {
        return Math.min(datum.width, datum.height) / 2;
      }
      if (datum.annotation.shapeType === 'rounded') {
        const baseRadius = Number(datum.annotation.cornerRadius) || 0;
        const scaleFactor = Math.min(datum.widthScale || 1, datum.heightScale || 1);
        const scaledRadius = Math.max(0, baseRadius * scaleFactor);
        return Math.min(Math.min(datum.width, datum.height) / 2, scaledRadius);
      }
      return 0;
    }
    return Math.min(18, Math.max(6, datum.height / 4));
  };

  const shapeGroup = node.append('g')
    .attr('class', 'preview-node-shape')
    .attr('transform', d => {
      const transforms = [];
      if (d.flipped) transforms.push('scale(-1,1)');
      if (d.rotation) transforms.push(`rotate(${d.rotation})`);
      return transforms.length ? transforms.join(' ') : null;
    });

  shapeGroup.append('rect')
    .attr('class', 'preview-node-outline')
    .attr('x', d => -(d.width / 2))
    .attr('y', d => -(d.height / 2))
    .attr('width', d => d.width)
    .attr('height', d => d.height)
    .attr('rx', d => computeOutlineRadius(d))
    .attr('ry', d => computeOutlineRadius(d))
    .attr('fill', 'transparent')
    .style('stroke', d => d.curveColor || null)
    .style('stroke-width', d => (d.curveColor ? (d.active ? '3px' : '2.5px') : null));

  const standardShapeGroup = shapeGroup.filter(d => !d.annotation);

  standardShapeGroup.append('image')
    .attr('class', 'preview-node-icon')
    .attr('href', d => d.icon || placeholderIcon)
    .attr('x', d => -(d.width / 2))
    .attr('y', d => -(d.height / 2))
    .attr('width', d => d.width)
    .attr('height', d => d.height)
    .attr('preserveAspectRatio', d => (d.category === 'bus' ? 'none' : 'xMidYMid meet'));

  standardShapeGroup.filter(d => d.component?.subtype === 'motor_load')
    .append('text')
    .attr('class', 'preview-node-icon-letter')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('y', 4)
    .attr('transform', d => (d.rotation ? `rotate(${-d.rotation})` : null))
    .text('M');

  const annotationShapeGroup = shapeGroup.filter(d => d.annotation);

  annotationShapeGroup.each(function renderAnnotationShape(datum) {
    const group = d3.select(this);
    const config = datum.annotation;
    if (!config) return;
    if (config.subtype === 'annotation_text_box') {
      group.append('rect')
        .attr('class', 'preview-annotation-box')
        .attr('x', -(datum.width / 2))
        .attr('y', -(datum.height / 2))
        .attr('width', datum.width)
        .attr('height', datum.height)
        .attr('rx', 8)
        .attr('ry', 8);
      const content = (config.text && config.text.trim()) || datum.label || '';
      const lines = buildAnnotationPreviewLines(content);
      if (lines.length) {
        const textEl = group.append('text')
          .attr('class', 'preview-annotation-text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle');
        const lineHeight = 14;
        const offset = ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => {
          textEl.append('tspan')
            .attr('x', 0)
            .attr('y', index === 0 ? -offset : undefined)
            .attr('dy', index === 0 ? 0 : lineHeight)
            .text(line);
        });
      }
      return;
    }

    const dash = PREVIEW_SHAPE_DASH_PATTERNS[config.strokeStyle] || '';
    const strokeColor = config.strokeColor || '#333333';
    const strokeWidth = Number.isFinite(config.strokeWidth) ? config.strokeWidth : 2;
    const fillColor = config.fillColor && config.fillColor !== 'none' && config.fillColor !== 'transparent'
      ? config.fillColor
      : 'none';
    const fillOpacity = fillColor === 'none' ? 0 : config.fillOpacity;
    if (config.shapeType === 'circle') {
      group.append('ellipse')
        .attr('class', 'preview-annotation-shape')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('rx', datum.width / 2)
        .attr('ry', datum.height / 2)
        .attr('fill', fillColor)
        .attr('fill-opacity', fillOpacity)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('stroke-dasharray', dash || null)
        .attr('stroke-linecap', config.strokeStyle === 'dotted' ? 'round' : null);
    } else {
      const radius = config.shapeType === 'rounded'
        ? Math.min(
          Math.min(datum.width, datum.height) / 2,
          Math.max(0, (config.cornerRadius || 0) * Math.min(datum.widthScale || 1, datum.heightScale || 1))
        )
        : 0;
      group.append('rect')
        .attr('class', 'preview-annotation-shape')
        .attr('x', -(datum.width / 2))
        .attr('y', -(datum.height / 2))
        .attr('width', datum.width)
        .attr('height', datum.height)
        .attr('rx', radius)
        .attr('ry', radius)
        .attr('fill', fillColor)
        .attr('fill-opacity', fillOpacity)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('stroke-dasharray', dash || null)
        .attr('stroke-linecap', config.strokeStyle === 'dotted' ? 'round' : null);
    }
  });

  const labelOffset = datum => {
    const baseGap = datum.active ? 32 : datum.selected ? 28 : 24;
    return Math.round(datum.height / 2 + baseGap);
  };

  const labelPlacement = datum => {
    if (useSidePreviewLabels && !datum.annotation) {
      const placeRight = datum.x <= width * 0.62;
      const sideOffset = Math.round(Math.max(28, datum.width / 2 + 12));
      return {
        x: placeRight ? sideOffset : -sideOffset,
        y: 0,
        anchor: placeRight ? 'start' : 'end',
        baseline: 'middle',
        side: true
      };
    }
    return {
      x: 0,
      y: labelOffset(datum),
      anchor: 'middle',
      baseline: 'hanging',
      side: false
    };
  };

  const labelLinesFor = datum => {
    if (datum.annotation && datum.annotation.subtype === 'annotation_text_box') return [];
    return wrapPreviewLabel(datum.label);
  };

  node.filter(d => labelPlacement(d).side && labelLinesFor(d).length)
    .append('line')
    .attr('class', 'preview-node-label-leader')
    .attr('x1', d => (labelPlacement(d).x >= 0 ? d.width / 2 : -d.width / 2))
    .attr('y1', 0)
    .attr('x2', d => labelPlacement(d).x + (labelPlacement(d).x >= 0 ? -6 : 6))
    .attr('y2', 0);

  node.append('text')
    .attr('class', 'preview-node-label')
    .attr('text-anchor', d => labelPlacement(d).anchor)
    .attr('dominant-baseline', d => labelPlacement(d).baseline)
    .attr('x', d => labelPlacement(d).x)
    .attr('y', d => labelPlacement(d).y)
    .each(function renderLabel(datum) {
      const lines = labelLinesFor(datum);
      if (!lines.length) {
        d3.select(this).attr('display', 'none');
        return;
      }
      const placement = labelPlacement(datum);
      const label = d3.select(this);
      const lineHeight = 15;
      const firstDy = placement.side ? -((lines.length - 1) * lineHeight) / 2 : 0;
      label.selectAll('tspan')
        .data(lines)
        .enter()
        .append('tspan')
        .attr('x', placement.x)
        .attr('dy', (line, index) => (index === 0 ? firstDy : lineHeight))
        .text(line => line);
    });

  node.each(function addLabelBackground() {
    const textNode = this.querySelector?.('text.preview-node-label');
    if (!textNode || textNode.getAttribute('display') === 'none') return;
    try {
      const box = textNode.getBBox();
      d3.select(this)
        .insert('rect', 'text.preview-node-label')
        .attr('class', 'preview-node-label-bg')
        .attr('x', box.x - 4)
        .attr('y', box.y - 3)
        .attr('width', box.width + 8)
        .attr('height', box.height + 6)
        .attr('rx', 4)
        .attr('ry', 4);
    } catch {
      // getBBox can fail for detached SVG nodes; labels remain readable without the backing plate.
    }
  });

  node.append('title')
    .text(d => {
      const role = d.relationship?.label ? `${d.relationship.label} - ` : '';
      return d.sheet ? `${role}${d.label} (${d.sheet})` : `${role}${d.label}`;
    });

  const dragBehavior = d3.drag()
    .on('start', function handlePreviewDragStart(event, datum) {
      event.sourceEvent?.stopPropagation?.();
      const target = onelinePreviewSvg?.node?.();
      if (target) {
        const pointerEvent = event?.sourceEvent || event;
        const [pointerX, pointerY] = d3.pointer(pointerEvent, target);
        datum.__dragOffsetX = datum.x - pointerX;
        datum.__dragOffsetY = datum.y - pointerY;
      }
      d3.select(this).classed('is-dragging', true);
      if (this.parentNode) {
        this.parentNode.appendChild(this);
      }
    })
    .on('drag', function handlePreviewDrag(event, datum) {
      const target = onelinePreviewSvg?.node?.();
      if (!target) return;
      const pointerEvent = event?.sourceEvent || event;
      const [pointerX, pointerY] = d3.pointer(pointerEvent, target);
      const offsetX = Number.isFinite(datum.__dragOffsetX) ? datum.__dragOffsetX : 0;
      const offsetY = Number.isFinite(datum.__dragOffsetY) ? datum.__dragOffsetY : 0;
      const newX = clampValue(pointerX + offsetX, 32, width - 32);
      const newY = clampValue(pointerY + offsetY, 32, height - 32);
      datum.x = newX;
      datum.y = newY;
      d3.select(this).attr('transform', `translate(${datum.x},${datum.y})`);
      const dx = datum.x - datum.baseX;
      const dy = datum.y - datum.baseY;
      previewPositionOverrides.set(datum.overrideKey, { dx, dy });
      updateLinks();
    })
    .on('end', function handlePreviewDragEnd(event, datum) {
      d3.select(this).classed('is-dragging', false);
      const dx = datum.x - datum.baseX;
      const dy = datum.y - datum.baseY;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        previewPositionOverrides.delete(datum.overrideKey);
      }
      delete datum.__dragOffsetX;
      delete datum.__dragOffsetY;
    });

  node.call(dragBehavior);

  node.filter(d => !d.active)
    .on('click', (event, datum) => {
      event.preventDefault();
      setActiveComponent(datum.id, { preserveSelection: true });
    });

  if (onelinePreviewNote) {
    const noteMessages = [];
    if (offSheetCount > 0) {
      noteMessages.push(`${offSheetCount} selected ${offSheetCount === 1 ? 'device is' : 'devices are'} on other sheets and are not shown.`);
    }
    if (hiddenSelectionCount > 0) {
      noteMessages.push(`${hiddenSelectionCount} selected ${hiddenSelectionCount === 1 ? 'device is' : 'devices are'} hidden due to preview limits.`);
    }
    if (truncatedCount > 0) {
      const contextLabel = prioritizedTargets.length ? 'selected devices' : 'devices';
      noteMessages.push(`Showing ${displayedTargets.length} of ${availableTargets.length} ${contextLabel}.`);
    }
    if (!noteMessages.length && selectedEntries.length && !displayedTargets.length) {
      noteMessages.push('No one-line preview available for the current selection.');
    }
    if (displayedTargets.length) {
      noteMessages.push('Drag devices within the preview to adjust their layout.');
    }
    if (noteMessages.length) {
      onelinePreviewNote.textContent = noteMessages.join(' ');
      onelinePreviewNote.classList.remove('hidden');
    } else {
      onelinePreviewNote.classList.add('hidden');
    }
  }
  } finally {
    Object.assign(state, { onelinePreviewSvgEl, onelinePreviewTransform });
  }
}
