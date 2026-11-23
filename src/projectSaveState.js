import { getProjectSaveState, on, saveProject } from '../dataStore.mjs';
import { getProjectState } from '../projectStorage.js';
import { resolveActiveProjectName } from './projectContext.js';

export const PROJECT_SAVE_STATE_EVENT = 'ctr:project-save-state';

/**
 * Header badge text for a project save state.
 * @param {{state:'unnamed'|'saved'|'unsaved', projectName?:string, hasSavedVersion?:boolean}} saveState
 * @returns {{label:string, tone:'local'|'saved'|'dirty', detail:string}}
 */
export function describeProjectSaveState(saveState = {}) {
  if (saveState.state === 'saved') {
    return { label: 'Saved', tone: 'saved', detail: 'All changes are saved in this browser.' };
  }
  if (saveState.state === 'unsaved' && !saveState.hasSavedVersion) {
    return {
      label: 'Not saved yet',
      tone: 'dirty',
      detail: 'This project has not been saved in this browser yet. Use Save Project to keep it.'
    };
  }
  if (saveState.state === 'unsaved') {
    return {
      label: 'Unsaved changes',
      tone: 'dirty',
      detail: 'Some changes are not saved. Reloading or opening a project link restores the last saved version. Use Save Project to keep them.'
    };
  }
  return {
    label: 'No project',
    tone: 'local',
    detail: 'Create or open a project to save your work.'
  };
}

/**
 * Re-evaluate the active project's save state after project changes and
 * saves (coalesced), and broadcast it as PROJECT_SAVE_STATE_EVENT on window.
 * The latest detail is also kept on window.__ctrProjectSaveState so UI that
 * mounts later can render it immediately.
 */
export function startProjectSaveStateTracking({
  evaluate = getProjectSaveState,
  delayMs = 250,
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null
} = {}) {
  let timer = null;
  let lastKey = '';
  const canDispatch = Boolean(win && typeof win.dispatchEvent === 'function' && typeof CustomEvent === 'function');

  const run = () => {
    timer = null;
    let saveState;
    try {
      saveState = evaluate();
    } catch (error) {
      console.warn('Project save state unavailable', error);
      return null;
    }
    const detail = { ...saveState, ...describeProjectSaveState(saveState) };
    const key = `${detail.state}|${detail.projectName}|${detail.hasSavedVersion}`;
    if (win) win.__ctrProjectSaveState = detail;
    if (key !== lastKey && canDispatch) {
      lastKey = key;
      win.dispatchEvent(new CustomEvent(PROJECT_SAVE_STATE_EVENT, { detail }));
    }
    return detail;
  };

  const schedule = () => {
    if (timer !== null) return;
    timer = setTimeout(run, delayMs);
    if (typeof timer?.unref === 'function') timer.unref();
  };

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    return run();
  };

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('ctr:project-saved', schedule);
  }
  if (win && typeof win.addEventListener === 'function') {
    // Another tab saving or editing the same project changes both copies.
    win.addEventListener('storage', schedule);
  }

  return { schedule, flush };
}

/**
 * Keep the active project's saved version current whenever this page writes
 * one of `keys` (coalesced), as the schedule pages do. Opening a project link
 * restores the saved version, so pages that write without saving lose those
 * edits on navigation and leave the project "Unsaved changes" on open.
 * @param {string[]} keys dataStore keys whose writes should be saved.
 * @returns {() => void} Flush any pending save immediately.
 */
export function saveProjectOnChange(keys, { delayMs = 300 } = {}) {
  let timer = null;
  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    let storedName = '';
    try {
      storedName = getProjectState()?.name || '';
    } catch {
      storedName = '';
    }
    const name = resolveActiveProjectName(typeof window !== 'undefined' ? window.currentProjectId : '', storedName);
    if (name) saveProject(name);
  };
  const schedule = () => {
    if (timer === null) timer = setTimeout(flush, delayMs);
  };
  (keys || []).forEach(key => on(key, schedule));
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', () => { if (timer !== null) flush(); });
  }
  return flush;
}

