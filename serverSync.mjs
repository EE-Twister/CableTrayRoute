import { exportProject, importProject } from './dataStore.mjs';

export async function saveProjectToServer(url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(exportProject())
  });
  return res.ok;
}

export async function loadProjectFromServer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load project');
  const data = await res.json();
  return importProject(data);
}

if (typeof window !== 'undefined') {
  window.serverSync = { saveProjectToServer, loadProjectFromServer };
}
