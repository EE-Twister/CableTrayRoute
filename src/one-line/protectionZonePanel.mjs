export function renderProtectionZonePanel({
  list,
  zones = [],
  activeZoneId = null,
  onColorChange = () => {},
  onVisibilityChange = () => {},
  onRename = () => {},
  onAssign = () => {},
  onDelete = () => {},
  onRefresh = () => {}
} = {}) {
  if (!list) return;
  const doc = list.ownerDocument;
  list.innerHTML = '';

  if (!zones.length) {
    const empty = doc.createElement('li');
    empty.className = 'layer-row';
    empty.style.color = 'var(--color-muted, #888)';
    empty.style.fontStyle = 'italic';
    empty.textContent = 'No zones — click + Add Zone';
    list.appendChild(empty);
    return;
  }

  zones.forEach(zone => {
    const row = doc.createElement('li');
    row.className = `layer-row${activeZoneId === zone.id ? ' active-layer' : ''}`;
    row.dataset.zoneId = zone.id;

    const colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.value = zone.color;
    colorInput.className = 'zone-color-swatch';
    colorInput.title = 'Change zone color';
    colorInput.setAttribute('aria-label', 'Zone color');
    colorInput.addEventListener('input', event => {
      event.stopPropagation();
      onColorChange(zone.id, event.target.value);
    });

    const visibilityButton = doc.createElement('button');
    visibilityButton.className = 'layer-vis-btn';
    visibilityButton.title = zone.visible ? 'Hide zone' : 'Show zone';
    visibilityButton.setAttribute('aria-label', visibilityButton.title);
    visibilityButton.textContent = zone.visible ? '👁' : '🚫';
    visibilityButton.addEventListener('click', event => {
      event.stopPropagation();
      onVisibilityChange(zone.id, !zone.visible);
    });

    const name = doc.createElement('span');
    name.className = 'layer-row-name';
    name.textContent = zone.name;
    name.title = 'Double-click to rename';
    name.addEventListener('dblclick', event => {
      event.stopPropagation();
      const input = doc.createElement('input');
      input.type = 'text';
      input.value = zone.name;
      input.className = 'layer-rename-input';
      name.replaceWith(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const nextName = input.value.trim();
        if (nextName && nextName !== zone.name) onRename(zone.id, nextName);
        else onRefresh();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', keyEvent => {
        if (keyEvent.key === 'Enter') commit();
        if (keyEvent.key === 'Escape') {
          committed = true;
          onRefresh();
        }
      });
    });

    const count = doc.createElement('span');
    count.className = 'layer-row-count';
    count.textContent = Array.isArray(zone.componentIds) ? zone.componentIds.length : 0;

    const assignButton = doc.createElement('button');
    assignButton.className = 'layer-vis-btn';
    assignButton.title = activeZoneId === zone.id ? 'Exit assignment mode' : 'Click components on canvas to assign/unassign';
    assignButton.setAttribute('aria-label', 'Assign components');
    assignButton.textContent = activeZoneId === zone.id ? '✔' : '±';
    assignButton.addEventListener('click', event => {
      event.stopPropagation();
      onAssign(zone.id, activeZoneId !== zone.id);
    });

    const deleteButton = doc.createElement('button');
    deleteButton.className = 'layer-del-btn';
    deleteButton.title = 'Delete zone';
    deleteButton.setAttribute('aria-label', 'Delete zone');
    deleteButton.textContent = '✕';
    deleteButton.addEventListener('click', event => {
      event.stopPropagation();
      onDelete(zone.id);
    });

    row.append(colorInput, visibilityButton, name, count, assignButton, deleteButton);
    list.appendChild(row);
  });
}
