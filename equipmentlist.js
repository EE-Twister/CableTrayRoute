import * as dataStore from './dataStore.mjs';

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initSettings();
    initDarkMode();
    initCompactMode();
    initNavToggle();

    const tbody = document.querySelector('#equipment-table tbody');
    const addBtn = document.getElementById('add-row-btn');
    const deleteBtn = document.getElementById('delete-selected-btn');
    const selectAll = document.getElementById('select-all');

    function gatherRow(tr) {
      return {
        id: tr.querySelector('input[name="id"]').value.trim(),
        description: tr.querySelector('input[name="description"]').value.trim(),
        voltage: tr.querySelector('input[name="voltage"]').value.trim()
      };
    }

    function saveRow(tr) {
      const idx = Number(tr.dataset.index);
      const item = gatherRow(tr);
      dataStore.updateEquipment(idx, item);
    }

    function createRow(item, idx) {
      const tr = document.createElement('tr');
      tr.dataset.index = idx;
      tr.innerHTML = `
        <td><input type="checkbox" class="row-select" aria-label="Select row"></td>
        <td><input name="id" type="text" value="${item.id || ''}"></td>
        <td><input name="description" type="text" value="${item.description || ''}"></td>
        <td><input name="voltage" type="text" value="${item.voltage || ''}"></td>`;
      tr.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('blur', () => saveRow(tr));
      });
      return tr;
    }

    function render() {
      tbody.innerHTML = '';
      const list = dataStore.getEquipment();
      list.forEach((item, idx) => tbody.appendChild(createRow(item, idx)));
      selectAll.checked = false;
    }

    addBtn?.addEventListener('click', () => {
      dataStore.addEquipment({ id: '', description: '', voltage: '' });
      render();
    });

    deleteBtn?.addEventListener('click', () => {
      Array.from(tbody.querySelectorAll('tr')).reverse().forEach((tr, idx, arr) => {
        if (tr.querySelector('.row-select').checked) {
          dataStore.removeEquipment(arr.length - 1 - idx);
        }
      });
      render();
    });

    selectAll?.addEventListener('change', () => {
      const checked = selectAll.checked;
      tbody.querySelectorAll('.row-select').forEach(chk => chk.checked = checked);
    });

    render();
  });
}
