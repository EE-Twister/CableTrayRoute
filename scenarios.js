import { listScenarios, getCurrentScenario, switchScenario, cloneScenario, compareStudies } from './dataStore.mjs';

function initScenarioUI() {
  const container = document.createElement('div');
  container.id = 'scenario-controls';
  const select = document.createElement('select');
  select.id = 'scenario-select';
  for (const name of listScenarios()) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  select.value = getCurrentScenario();
  select.addEventListener('change', e => {
    switchScenario(e.target.value);
    location.reload();
  });

  const cloneBtn = document.createElement('button');
  cloneBtn.id = 'clone-scenario-btn';
  cloneBtn.textContent = 'Clone';
  cloneBtn.addEventListener('click', () => {
    const name = prompt('New scenario name');
    if (name) {
      cloneScenario(name);
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
      select.value = name;
      switchScenario(name);
      location.reload();
    }
  });

  const compareBtn = document.createElement('button');
  compareBtn.id = 'compare-scenario-btn';
  compareBtn.textContent = 'Compare Studies';
  compareBtn.addEventListener('click', () => {
    const other = prompt('Compare current with which scenario?', listScenarios().join(', '));
    if (other) {
      const diff = compareStudies(getCurrentScenario(), other);
      alert(JSON.stringify(diff, null, 2));
    }
  });

  container.appendChild(select);
  container.appendChild(cloneBtn);
  container.appendChild(compareBtn);
  document.body.insertBefore(container, document.body.firstChild);
}

document.addEventListener('DOMContentLoaded', initScenarioUI);
