import { meaningfulHomeRecords, safeReadHomeData } from './homepageSummary.js';

/**
 * Count the workspace records the home page reports (equipment, loads,
 * cables, and raceways), ignoring placeholder rows.
 * @param {Record<string, () => unknown[]>} readers Canonical list readers.
 * @param {(error: unknown) => void} [onReadError]
 * @returns {number}
 */
export function countHomeWorkspaceRecords(readers = {}, onReadError) {
  const names = ['getEquipment', 'getLoads', 'getCables', 'getTrays', 'getConduits', 'getDuctbanks'];
  return names.reduce((total, name) => {
    if (typeof readers[name] !== 'function') return total;
    return total + meaningfulHomeRecords(safeReadHomeData(readers[name], [], onReadError)).length;
  }, 0);
}

/**
 * Decide which home page to show. An empty workspace (no open project and no
 * records) starts from My Projects; anything else is a project in progress,
 * led by its identity card and next action. Save is offered only when there
 * is unsaved work: a named project with unsaved changes, or records in an
 * unnamed workspace.
 * @param {{saveState?: {state?: string}, recordCount?: number}} input
 * @returns {{state: 'empty'|'active', canSave: boolean}}
 */
export function resolveHomeState({ saveState, recordCount } = {}) {
  const projectState = saveState?.state;
  const hasProject = projectState === 'saved' || projectState === 'unsaved';
  const hasRecords = Number(recordCount) > 0;
  return {
    state: hasProject || hasRecords ? 'active' : 'empty',
    canSave: projectState === 'unsaved' || (!hasProject && hasRecords)
  };
}
