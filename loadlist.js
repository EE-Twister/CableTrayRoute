import * as dataStore from './dataStore.mjs';

window.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initNavToggle();

  const tbody = document.querySelector('#load-table tbody');
  const modal = document.getElementById('form-modal');
  const form = document.getElementById('load-form');

  function closeModal() {
    modal.style.display = 'none';
    form.reset();
    delete form.dataset.index;
  }

  function render() {
    tbody.innerHTML = '';
    const loads = dataStore.getLoads();
    loads.forEach((load, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${load.description || ''}</td>
        <td>${load.power || ''}</td>
        <td>${load.phases || ''}</td>
        <td>${load.circuit || ''}</td>
        <td>
          <button class="edit-btn" data-index="${idx}">Edit</button>
          <button class="delete-btn" data-index="${idx}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('add-btn').addEventListener('click', () => {
    form.dataset.index = '';
    modal.style.display = 'block';
  });

  document.getElementById('cancel-btn').addEventListener('click', e => {
    e.preventDefault();
    closeModal();
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const load = {
      description: form.description.value.trim(),
      power: form.power.value.trim(),
      phases: form.phases.value.trim(),
      circuit: form.circuit.value.trim()
    };
    const idx = form.dataset.index;
    if (idx === '' || idx === undefined) {
      dataStore.addLoad(load);
    } else {
      dataStore.updateLoad(Number(idx), load);
    }
    closeModal();
    render();
  });

  tbody.addEventListener('click', e => {
    const target = e.target;
    const idx = target.dataset.index;
    if (target.classList.contains('edit-btn')) {
      const loads = dataStore.getLoads();
      const load = loads[idx];
      form.description.value = load.description || '';
      form.power.value = load.power || '';
      form.phases.value = load.phases || '';
      form.circuit.value = load.circuit || '';
      form.dataset.index = idx;
      modal.style.display = 'block';
    } else if (target.classList.contains('delete-btn')) {
      if (confirm('Delete load?')) {
        dataStore.removeLoad(Number(idx));
        render();
      }
    }
  });

  document.getElementById('search').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    Array.from(tbody.rows).forEach(row => {
      const match = Array.from(row.cells).slice(0,4).some(td => td.textContent.toLowerCase().includes(term));
      row.style.display = match ? '' : 'none';
    });
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const data = dataStore.getLoads();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'loads.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const importInput = document.getElementById('import-input');
  document.getElementById('import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          dataStore.setLoads(data);
          render();
        } else {
          alert('Invalid load data');
        }
      } catch {
        alert('Invalid load data');
      }
    });
    e.target.value = '';
  });

  render();
});
