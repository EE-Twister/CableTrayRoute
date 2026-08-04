import { startPerformanceMeasurement } from '../performance/performanceMetrics.js';
import { createScheduleCollectionCache } from './scheduleCollectionCache.js';
export { createBoxSpatialIndex } from './labelSpatialIndex.js';

const RENDERED_ELEMENT_SELECTOR = 'g.component, .connection, .conn-label, .connection-waypoint-handle, .port, .bus-handle, .annotation-handle, .issue-badge, .component-label, .component-attribute, .component-datablock, .operating-state-badge, .data-state-badge, .connection-junction, .selection-marquee, .transformer-port-label, .alignment-snap-guides';
export function prepareAtomicRenderLayer(svg, svgNamespace, components, getBounds) {
  const previous = svg.querySelector(':scope > .oneline-render-layer');
  if (!previous) svg.querySelectorAll(RENDERED_ELEMENT_SELECTOR).forEach(element => element.remove());
  const surface = document.createElementNS(svgNamespace, 'g');
  surface.classList.add('oneline-render-layer');
  return {
    surface,
    commit: () => (previous ? previous.replaceWith(surface) : svg.appendChild(surface)),
    componentById: new Map(components.map(component => [component.id, component])),
    routeCandidates: createComponentSpatialIndex(components, getBounds),
  };
}

export function createComponentSpatialIndex(components, getBounds, cellSize = 200) {
  const cells = new Map();
  components.forEach(component => {
    const bounds = getBounds(component);
    for (let x = Math.floor(bounds.left / cellSize); x <= Math.floor(bounds.right / cellSize); x += 1) {
      for (let y = Math.floor(bounds.top / cellSize); y <= Math.floor(bounds.bottom / cellSize); y += 1) {
        const key = `${x}:${y}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(component);
      }
    }
  });
  return (minX, minY, maxX, maxY) => {
    const candidates = new Set();
    for (let x = Math.floor(Math.min(minX, maxX) / cellSize); x <= Math.floor(Math.max(minX, maxX) / cellSize); x += 1) {
      for (let y = Math.floor(Math.min(minY, maxY) / cellSize); y <= Math.floor(Math.max(minY, maxY) / cellSize); y += 1) {
        (cells.get(`${x}:${y}`) || []).forEach(component => candidates.add(component));
      }
    }
    return candidates;
  };
}

export function snapComponentsToGrid(components, gridSize) {
  let changed = false;
  components.forEach(component => {
    const x = Math.round(component.x / gridSize) * gridSize;
    const y = Math.round(component.y / gridSize) * gridSize;
    if (x !== component.x || y !== component.y) changed = true;
    Object.assign(component, { x, y });
  });
  return changed;
}

export function createOneLineRenderPerformance(readers) {
  let scheduleCollections = null;
  let finishMeasurement = null;
  return {
    begin(detail) {
      scheduleCollections = typeof readers.getCollections === 'function'
        ? readers.getCollections()
        : createScheduleCollectionCache(readers);
      finishMeasurement = startPerformanceMeasurement('ctr.oneline-render', detail);
    },
    getCollection(key) {
      if (scheduleCollections?.has(key)) return scheduleCollections.get(key);
      const reader = {
        equipment: readers.getEquipment,
        panel: readers.getPanels,
        load: readers.getLoads,
        cable: readers.getCables,
      }[key] || readers.getEquipment;
      return reader();
    },
    finish(detail = {}) {
      scheduleCollections = null;
      const finish = finishMeasurement;
      finishMeasurement = null;
      return finish?.(detail) || null;
    },
  };
}
