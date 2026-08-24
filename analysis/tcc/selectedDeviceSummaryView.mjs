export function renderSelectedDeviceSummaryView(options = {}) {
  const {
    container,
    deviceButton,
    doc,
    ids = [],
    getEntry = () => null,
    getRelationship = () => null,
    selectedRelationship,
    hasComponentContext = false,
    onRendered = () => {},
  } = options;
  if (!container || !doc) return;
  container.innerHTML = '';
  if (deviceButton) {
    deviceButton.textContent = ids.length
      ? `Choose devices · ${ids.length} selected`
      : 'Choose devices';
  }
  if (!ids.length) {
    const empty = doc.createElement('p');
    empty.className = 'selected-device-empty';
    empty.textContent = 'No devices selected.';
    container.appendChild(empty);
    onRendered();
    return;
  }

  const list = doc.createElement('div');
  list.className = 'selected-device-list';
  list.setAttribute('role', 'list');
  const summaryItems = ids.map(uid => ({
    uid,
    entry: getEntry(uid),
    relationship: hasComponentContext ? getRelationship(uid) : selectedRelationship,
  }));
  const contextItems = hasComponentContext
    ? summaryItems.filter(item => item.relationship.role !== 'additional')
    : [];
  const additionalItems = summaryItems.filter(item => item.relationship.role === 'additional');
  const visibleItems = contextItems.length ? contextItems : summaryItems.slice(0, 4);
  visibleItems.forEach(({ uid, entry, relationship }) => {
    const chip = doc.createElement('span');
    chip.className = `selected-device-chip ${relationship.className}`;
    chip.dataset.contextRole = relationship.role;
    chip.setAttribute('role', 'listitem');
    const role = doc.createElement('span');
    role.className = 'selected-device-role';
    role.textContent = relationship.label;
    const name = doc.createElement('span');
    name.className = 'selected-device-name';
    name.textContent = entry ? entry.name : uid;
    chip.append(role, name);
    list.appendChild(chip);
  });
  const hiddenItems = contextItems.length ? additionalItems : summaryItems.slice(visibleItems.length);
  if (hiddenItems.length) {
    const chip = doc.createElement('span');
    chip.className = 'selected-device-chip is-additional is-summary-chip';
    chip.dataset.contextRole = 'additional';
    chip.setAttribute('role', 'listitem');
    chip.title = hiddenItems.map(item => item.entry ? item.entry.name : item.uid).join('\n');
    chip.setAttribute(
      'aria-label',
      `${hiddenItems.length} additional selected ${hiddenItems.length === 1 ? 'reference' : 'references'}: ${chip.title}`
    );
    const role = doc.createElement('span');
    role.className = 'selected-device-role';
    role.textContent = 'Additional';
    const name = doc.createElement('span');
    name.className = 'selected-device-name';
    name.textContent = hiddenItems.length === 1
      ? '1 equipment reference selected'
      : `${hiddenItems.length} equipment references selected`;
    chip.append(role, name);
    list.appendChild(chip);
  }
  container.appendChild(list);
  onRendered();
}
