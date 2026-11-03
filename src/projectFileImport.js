import { getLastProjectImportError, importProject } from '../dataStore.mjs';
import { getProjectState, listSavedProjects, setProjectState } from '../projectStorage.js';
import { importedProjectName, recoverActiveProjectName } from './projectContext.js';

/**
 * Import a parsed `.ctr.json` project into the open project, or into a new
 * project named after the file when none is open.
 *
 * Collection writes are rejected outside a named project, so a fresh browser
 * used to "import" nothing while reporting success. The destination is named
 * before importing, and the previous context is restored if the import fails.
 *
 * @param {object} projectData Parsed project file.
 * @param {{fileName?: string, hashName?: string}} [options]
 * @returns {{ok: boolean, projectName: string, createdProject: boolean, error: string}}
 */
export function importProjectFileData(projectData, { fileName = '', hashName = '' } = {}) {
  const previousProjectState = getProjectState();
  const previousProjectId = typeof window !== 'undefined' ? window.currentProjectId : undefined;
  const activeName = recoverActiveProjectName({
    hashName,
    currentProjectId: previousProjectId,
    readStoredProjectName: () => previousProjectState?.name || ''
  });
  const projectName = activeName || importedProjectName(fileName, listSavedProjects());
  const createdProject = !activeName;
  const setActiveProject = id => {
    if (typeof window !== 'undefined') window.currentProjectId = id;
  };
  if (createdProject) {
    setProjectState({ ...previousProjectState, name: projectName });
    setActiveProject(projectName);
  }
  let ok = false;
  let error = '';
  try {
    ok = importProject(projectData) === true;
    if (!ok) error = getLastProjectImportError() || 'Import canceled or invalid project data.';
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  if (!ok && createdProject) {
    setProjectState(previousProjectState);
    setActiveProject(previousProjectId);
  }
  return { ok, projectName, createdProject, error };
}
