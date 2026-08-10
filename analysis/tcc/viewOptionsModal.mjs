export async function openTccViewOptionsModal({
  triggerButton,
  activeOptions = [],
  viewOptions = [],
  openModal,
  applyOptions,
  restoreOptions,
  updateButtonLabel,
  hasSelectedDevices,
  requestPlotRefresh
}) {
  if (!triggerButton) return;
  triggerButton.setAttribute('aria-expanded', 'true');
  const initial = [...activeOptions];
  const pending = new Set(initial);

  await openModal({
    title: 'Device Views',
    description: 'Choose which device characteristics to display alongside the plotted curves.',
    primaryText: 'Apply',
    secondaryText: 'Cancel',
    closeOnBackdrop: true,
    onSubmit() {
      applyOptions([...pending]);
      if (hasSelectedDevices()) requestPlotRefresh();
      triggerButton.setAttribute('aria-expanded', 'false');
      return true;
    },
    onCancel() {
      restoreOptions(initial);
      updateButtonLabel();
      triggerButton.setAttribute('aria-expanded', 'false');
    },
    onClose() {
      triggerButton.setAttribute('aria-expanded', 'false');
    },
    render(container, controls) {
      const doc = container.ownerDocument;
      container.classList.add('tcc-view-modal');
      const list = doc.createElement('ul');
      list.className = 'tcc-view-option-list';

      const clearItem = doc.createElement('li');
      clearItem.className = 'tcc-view-option-reset';
      const clearButton = doc.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'tcc-view-option-clear';
      clearButton.textContent = 'Clear all selections';
      clearButton.addEventListener('click', () => {
        pending.clear();
        list.querySelectorAll('input[type="checkbox"]').forEach(input => {
          input.checked = false;
        });
      });
      clearItem.appendChild(clearButton);
      list.appendChild(clearItem);

      viewOptions
        .filter(option => option.id !== 'none')
        .forEach(option => {
          const item = doc.createElement('li');
          const label = doc.createElement('label');
          label.className = 'tcc-view-option';
          const checkbox = doc.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.name = 'tcc-view-option';
          checkbox.value = option.id;
          checkbox.checked = pending.has(option.id);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) pending.add(option.id);
            else pending.delete(option.id);
          });
          const textWrap = doc.createElement('div');
          const title = doc.createElement('span');
          title.className = 'tcc-view-option-label';
          title.textContent = option.label;
          textWrap.appendChild(title);
          if (option.description) {
            const description = doc.createElement('span');
            description.className = 'tcc-view-option-description';
            description.textContent = option.description;
            textWrap.appendChild(description);
          }
          label.append(checkbox, textWrap);
          item.appendChild(label);
          list.appendChild(item);
        });
      container.appendChild(list);
      const focusTarget = list.querySelector('input:checked') || list.querySelector('input');
      if (focusTarget && controls && typeof controls.setInitialFocus === 'function') {
        controls.setInitialFocus(focusTarget);
      }
      return focusTarget || list;
    }
  });
}
