export function createScheduleCollectionCache(readers) {
  return new Map([
    ['equipment', readers.getEquipment()],
    ['panel', readers.getPanels()],
    ['load', readers.getLoads()],
    ['cable', readers.getCables()],
  ]);
}
