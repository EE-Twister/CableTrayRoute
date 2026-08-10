export function createVirtualNodePropertyRenderer({
  documentRef,
  propertyContainer,
  propertyHeading,
  getComponentListLabel,
  getComponents,
  getActiveSheet,
  setConnections,
  setActiveComponent,
  pushHistory,
  render,
  save,
  showToast,
  closeModal,
  selectComponent
}) {
  return function renderVirtualNodeProperties(node) {
    const displayName = node.label || node.id || 'Node';
    propertyHeading.textContent = `${displayName} Node`;
    const inbound = Array.isArray(node.inbound) ? node.inbound : [];
    const outbound = Array.isArray(node.outbound) ? node.outbound : [];
    const summary = documentRef.createElement('p');
    summary.className = 'prop-node-summary';
    const formatCount = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
    summary.textContent = `This node has ${formatCount(inbound.length, 'inbound connection')} and ${formatCount(outbound.length, 'outbound connection')}.`;
    propertyContainer.appendChild(summary);

    const formatEndpoint = (component, fallback) => component
      ? getComponentListLabel(component)
      : fallback || 'Unknown';
    const describeCable = connection => {
      if (!connection) return '';
      if (connection.cable?.tag) return ` (${connection.cable.tag})`;
      if (connection.cable?.cable_type) return ` (${connection.cable.cable_type})`;
      if (connection.cable_tag) return ` (${connection.cable_tag})`;
      if (connection.cable_type) return ` (${connection.cable_type})`;
      return '';
    };
    const addConnectionList = (title, entries, direction) => {
      const header = documentRef.createElement('h4');
      header.textContent = title;
      propertyContainer.appendChild(header);
      if (!entries.length) {
        const empty = documentRef.createElement('p');
        empty.className = 'view-modal-empty prop-node-empty';
        empty.textContent = direction === 'inbound' ? 'No inbound connections.' : 'No outbound connections.';
        propertyContainer.appendChild(empty);
        return;
      }
      const list = documentRef.createElement('ul');
      list.className = 'prop-node-connection-list';
      entries.forEach(entry => {
        const item = documentRef.createElement('li');
        const text = documentRef.createElement('span');
        text.textContent = direction === 'inbound'
          ? `From ${formatEndpoint(entry.sourceComponent, entry.sourceId)}${describeCable(entry.connection)}`
          : `To ${formatEndpoint(entry.targetComponent, entry.targetId)}${describeCable(entry.connection)}`;
        item.appendChild(text);
        const related = direction === 'inbound' ? entry.sourceComponent : entry.targetComponent;
        if (related) {
          const viewButton = documentRef.createElement('button');
          viewButton.type = 'button';
          viewButton.textContent = 'View';
          viewButton.classList.add('btn');
          viewButton.addEventListener('click', event => {
            event.stopPropagation();
            setActiveComponent(related);
          });
          item.appendChild(viewButton);
        }
        list.appendChild(item);
      });
      propertyContainer.appendChild(list);
    };

    addConnectionList('Inbound Connections', inbound, 'inbound');
    addConnectionList('Outbound Connections', outbound, 'outbound');

    const actions = documentRef.createElement('div');
    actions.className = 'prop-form-actions';
    const deleteButton = documentRef.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete Node';
    deleteButton.classList.add('btn');
    deleteButton.addEventListener('click', event => {
      event.stopPropagation();
      if (!node.id) return;
      let updated = false;
      getComponents().forEach(component => {
        if (!Array.isArray(component.connections)) return;
        const filtered = component.connections.filter(connection => connection && connection.target !== node.id);
        if (filtered.length !== component.connections.length) {
          component.connections = filtered;
          updated = true;
        }
      });
      const sheet = getActiveSheet();
      if (sheet && Array.isArray(sheet.connections)) {
        const filtered = sheet.connections.filter(connection => connection && connection.from !== node.id && connection.to !== node.id);
        if (filtered.length !== sheet.connections.length) {
          sheet.connections.splice(0, sheet.connections.length, ...filtered);
          setConnections(sheet.connections);
          updated = true;
        }
      }
      if (!updated) {
        showToast('No connections referenced this node');
        return;
      }
      pushHistory();
      render();
      save();
      showToast('Node deleted');
      closeModal();
      selectComponent();
    });
    actions.appendChild(deleteButton);
    const closeButton = documentRef.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    closeButton.classList.add('btn');
    closeButton.addEventListener('click', () => closeModal());
    actions.appendChild(closeButton);
    propertyContainer.appendChild(actions);
    propertyContainer.scrollTop = 0;
  };
}
