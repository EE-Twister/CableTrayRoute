import { saveProject as dsSaveProject, loadProject as dsLoadProject, exportProject, importProject } from './dataStore.mjs';

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

async function serverSaveProject(name) {
  const token = localStorage.getItem('authToken');
  if (!token) return false;
  const res = await fetch(`/projects/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(exportProject())
  });
  return res.ok;
}

async function serverLoadProject(name) {
  const token = localStorage.getItem('authToken');
  if (!token) return false;
  const res = await fetch(`/projects/${encodeURIComponent(name)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return false;
  const { data } = await res.json();
  importProject(data);
  return true;
}

async function saveProject() {
  let name = currentProject();
  if (!name) name = promptProjectName('Save project as');
  if (!name) return;
  setProjectHash(name);
  // Save locally and attempt server sync if logged in
  dsSaveProject(name);
  try { await serverSaveProject(name); } catch (e) { console.error(e); }
}

async function loadProject() {
  const projects = listProjects();
  const name = window.prompt('Load which project?\n' + projects.join('\n'));
  if (!name) return;
  setProjectHash(name);
  let loaded = false;
  try { loaded = await serverLoadProject(name); } catch (e) { console.error(e); }
  if (!loaded) dsLoadProject(name);
  location.reload();
}

if (typeof window !== 'undefined') {
  window.projectManager = { listProjects, newProject, saveProject, loadProject };
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('new-project-btn')?.addEventListener('click', newProject);
    document.getElementById('save-project-btn')?.addEventListener('click', saveProject);
    document.getElementById('load-project-btn')?.addEventListener('click', loadProject);

    // Add login/logout button
    const menu = document.getElementById('settings-menu');
    if (menu) {
      const btn = document.createElement('button');
      function updateLabel() {
        btn.textContent = localStorage.getItem('authToken') ? 'Logout' : 'Login';
      }
      updateLabel();
      btn.addEventListener('click', () => {
        if (localStorage.getItem('authToken')) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          updateLabel();
        } else {
          location.href = 'login.html';
        }
      });
      menu.appendChild(btn);
    }
  });
}
