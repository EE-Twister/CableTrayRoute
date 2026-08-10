export function renderCoordinationOrderView(dependencies = {}) {
  const {
    state = {},
    activePlotted,
    coordOrderList,
    document = globalThis.document,
    isProtectiveType,
    moveCoordOrderIndex,
    moveCoordOrderUid
  } = dependencies;
  let { coordOrderIds = [] } = state;
  try {
  if (!coordOrderList) return;
  const entries = activePlotted ?? [];
  const protective = entries.filter(e =>
    isProtectiveType(e.selection?.baseDevice?.type)
  );
  if (!protective.length) {
    coordOrderList.innerHTML = '';
    return;
  }

  // Keep only currently plotted devices and default to load→source ordering.
  const defaultOrderIds = [...protective].reverse().map(e => e.selection.uid);
  const plotted = new Set(defaultOrderIds);
  const existingOrder = coordOrderIds.filter(uid => plotted.has(uid));
  const missingIds = defaultOrderIds.filter(uid => !existingOrder.includes(uid));
  coordOrderIds = [...existingOrder, ...missingIds];

  coordOrderList.innerHTML = '';
  coordOrderIds.forEach((uid, index) => {
    const entry = protective.find(e => e.selection.uid === uid);
    if (!entry) return;
    const name = entry.selection.name || entry.selection.baseDevice?.name || uid;
    const item = document.createElement('div');
    item.className = 'coord-order-item';
    item.dataset.uid = uid;
    item.setAttribute('role', 'listitem');
    item.tabIndex = 0;
    item.draggable = true;
    const handle = document.createElement('span');
    handle.className = 'coord-order-handle';
    handle.setAttribute('aria-hidden', 'true');
    const badge = document.createElement('span');
    badge.className = 'coord-order-badge';
    badge.style.background = entry.color;
    badge.style.color = '#fff';
    badge.textContent = String(index + 1);
    const label = document.createElement('span');
    label.className = 'coord-order-label';
    label.textContent = name;
    const controlName = name.replace(/\s+/g, ' ').trim();
    item.setAttribute('aria-label', `${controlName} coordination order ${index + 1}`);
    const actions = document.createElement('span');
    actions.className = 'coord-order-actions';
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'coord-order-move';
    upBtn.dataset.direction = 'up';
    upBtn.disabled = index === 0;
    upBtn.title = 'Move toward load side';
    upBtn.setAttribute('aria-label', `Move ${controlName} toward load side`);
    upBtn.addEventListener('click', () => moveCoordOrderIndex(index, -1));
    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'coord-order-move';
    downBtn.dataset.direction = 'down';
    downBtn.disabled = index === coordOrderIds.length - 1;
    downBtn.title = 'Move toward source side';
    downBtn.setAttribute('aria-label', `Move ${controlName} toward source side`);
    downBtn.addEventListener('click', () => moveCoordOrderIndex(index, 1));
    actions.append(upBtn, downBtn);
    item.append(handle, badge, label, actions);
    item.addEventListener('dragstart', ev => { ev.dataTransfer.setData('uid', uid); });
    item.addEventListener('dragover', ev => ev.preventDefault());
    item.addEventListener('drop', ev => {
      const fromUid = ev.dataTransfer.getData('uid');
      moveCoordOrderUid(fromUid, uid);
    });
    item.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowUp' && (ev.altKey || ev.ctrlKey)) {
        ev.preventDefault();
        moveCoordOrderIndex(index, -1);
      } else if (ev.key === 'ArrowDown' && (ev.altKey || ev.ctrlKey)) {
        ev.preventDefault();
        moveCoordOrderIndex(index, 1);
      }
    });
    coordOrderList.appendChild(item);
  });
  const hint = document.createElement('p');
  hint.className = 'coord-order-hint';
  hint.textContent = 'Drag to reorder: top = load side, bottom = source side.';
  coordOrderList.appendChild(hint);
  } finally {
    state.coordOrderIds = coordOrderIds;
  }
}
