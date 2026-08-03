import { startPerformanceMeasurement } from '../performance/performanceMetrics.js';
import { createScheduleCollectionCache } from './scheduleCollectionCache.js';

export function createOneLineRenderPerformance(readers) {
  let scheduleCollections = null;
  let finishMeasurement = null;
  return {
    begin(detail) {
      scheduleCollections = createScheduleCollectionCache(readers);
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
