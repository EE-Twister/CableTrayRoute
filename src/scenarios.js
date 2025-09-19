import { listScenarios, getCurrentScenario, switchScenario, cloneScenario, getOneLine, getRevisions, restoreRevision } from '../dataStore.mjs';

function ensureDefaults() {
  const defaults = ['base', 'future', 'emergency'];
  const existing = listScenarios();
  for (const name of defaults) {
    if (!existing.includes(name)) {
      cloneScenario(name);
    }
  }
}

function populateSelect(select) {
  select.innerHTML = '';
  for (const name of listScenarios()) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  select.value = getCurrentScenario();
}

function diffScenarios(a, b) {
  const diagram = document.getElementById('diagram');
  if (!diagram) return;
  diagram.querySelectorAll('.scenario-diff').forEach(el => el.classList.remove('scenario-diff'));
  const { sheets: sheetsA } = getOneLine(a);
  const { sheets: sheetsB } = getOneLine(b);
  const map = arr => {
    const m = new Map();
    for (const s of arr) {
      for (const c of s.components || []) {
        m.set(c.id, JSON.stringify(c));
      }
    }
    return m;
  };
  const mapA = map(sheetsA);
  const mapB = map(sheetsB);
  const diff = new Set();
  for (const [id, val] of mapA) {
    if (mapB.get(id) !== val) diff.add(id);
  }
  for (const id of mapB.keys()) {
    if (!mapA.has(id)) diff.add(id);
  }
  diff.forEach(id => {
    const g = diagram.querySelector(`g.component[data-id="${id}"]`);
    if (g) g.classList.add('scenario-diff');
  });
}

function initScenarioUI() {
  ensureDefaults();
  const select = document.getElementById('scenario-select');
  if (!select) return;
  populateSelect(select);
  select.addEventListener('change', e => {
    switchScenario(e.target.value);
    location.reload();
  });

  const dupBtn = document.getElementById('scenario-duplicate-btn');
  dupBtn?.addEventListener('click', () => {
    const name = prompt('New scenario name');
    if (name) {
      cloneScenario(name);
      populateSelect(select);
      select.value = name;
      switchScenario(name);
      location.reload();
    }
  });

  const diffBtn = document.getElementById('scenario-diff-btn');
  diffBtn?.addEventListener('click', () => {
    const other = prompt('Compare with which scenario?', listScenarios().join(', '));
    if (other) diffScenarios(getCurrentScenario(), other);
  });

  const revBtn = document.getElementById('revision-btn');
  revBtn?.addEventListener('click', () => {
    const revs = getRevisions();
    if (!revs.length) { alert('No revisions'); return; }
    const msg = revs.map((r,i) => `${i}: ${new Date(r.time).toLocaleString()}`).join('\n');
    const choice = prompt(`Restore which revision?\n${msg}`);
    const idx = Number(choice);
    if (!Number.isNaN(idx)) {
      restoreRevision(idx);
      location.reload();
    }
  });
}

document.addEventListener('DOMContentLoaded', initScenarioUI);
