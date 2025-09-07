import { saveProject as dsSaveProject, loadProject as dsLoadProject } from './dataStore.mjs';

function listProjects() {
  if (typeof localStorage === 'undefined') return [];
  const names = new Set();
  const suffixes = ['equipment', 'panels', 'loads', 'cables', 'raceways', 'oneLine'];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const [name, suffix] = key.split(':');
    if (suffixes.includes(suffix)) names.add(name);
  }
  return [...names];
}

function promptProjectName(message = 'Enter project name') {
  return window.prompt(message) || '';
}

function currentProject() {
  return decodeURIComponent(location.hash.slice(1)) || '';
}

function setProjectHash(name) {
  location.hash = encodeURIComponent(name);
  globalThis.applyProjectHash?.();
}

function newProject() {
  const name = promptProjectName('New project name');
  if (!name) return;
  setProjectHash(name);
  dsLoadProject(name);
  location.reload();
}

function saveProject() {
  let name = currentProject();
  if (!name) name = promptProjectName('Save project as');
  if (!name) return;
  setProjectHash(name);
  dsSaveProject(name);
}

function loadProject() {
  const projects = listProjects();
  const name = window.prompt('Load which project?\n' + projects.join('\n'));
  if (!name) return;
  setProjectHash(name);
  dsLoadProject(name);
  location.reload();
}

if (typeof window !== 'undefined') {
  window.projectManager = { listProjects, newProject, saveProject, loadProject };
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('new-project-btn')?.addEventListener('click', newProject);
    document.getElementById('save-project-btn')?.addEventListener('click', saveProject);
    document.getElementById('load-project-btn')?.addEventListener('click', loadProject);
  });
}
