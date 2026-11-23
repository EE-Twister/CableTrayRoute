const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const record = value => value && typeof value === 'object' && !Array.isArray(value);

export function corridorPermission(edge) {
  if (!record(edge)) return 'invalid';
  const values = ['permitted', 'allowed'].filter(key => Object.prototype.hasOwnProperty.call(edge, key)).map(key => edge[key]);
  if (values.some(value => typeof value !== 'boolean') || (values.length === 2 && values[0] !== values[1])) return 'invalid';
  return values.length ? (values[0] ? 'allowed' : 'closed') : 'unspecified';
}

export function renderCorridorEditor(graph) {
  if (graph == null || (record(graph) && !Object.prototype.hasOwnProperty.call(graph, 'nodes') && !Object.prototype.hasOwnProperty.call(graph, 'edges'))) return '<p>No corridor graph has been defined.</p><button type="button" data-corridor-initialize>Start empty corridor graph</button>';
  if (!record(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return '<p>Corridor nodes and edges must be arrays in the graph JSON before the table editor can be used.</p>';
  const field = (kind, index, key, value, type = 'text') => `<input data-corridor-kind="${kind}" data-corridor-index="${index}" data-corridor-field="${key}" type="${type}" ${type === 'number' ? 'step="any"' : ''} aria-label="${kind === 'nodes' ? 'Node' : 'Edge'} ${index + 1} ${escape(key)}" value="${escape(value ?? '')}">`;
  const nodes = graph.nodes.map((node, index) => record(node) ? `<tr><td>${field('nodes', index, 'id', node.id)}</td>${['x', 'y', 'z'].map(key => `<td>${field('nodes', index, key, node[key], 'number')}</td>`).join('')}<td><button type="button" data-corridor-remove="nodes" data-corridor-index="${index}" aria-label="Remove node ${index + 1}">Remove</button></td></tr>` : `<tr><td colspan="4">Invalid node ${index + 1}; correct it in JSON or remove it.</td><td><button type="button" data-corridor-remove="nodes" data-corridor-index="${index}" aria-label="Remove node ${index + 1}">Remove</button></td></tr>`).join('');
  const edges = graph.edges.map((edge, index) => {
    if (!record(edge)) return `<tr><td colspan="6">Invalid edge ${index + 1}; correct it in JSON or remove it.</td><td><button type="button" data-corridor-remove="edges" data-corridor-index="${index}" aria-label="Remove edge ${index + 1}">Remove</button></td></tr>`;
    const permission = corridorPermission(edge);
    const options = [['unspecified', 'Not specified (treated as allowed)'], ['allowed', 'Allowed'], ['closed', 'Closed'], ...(permission === 'invalid' ? [['invalid', 'Invalid or conflicting — resolve']] : [])];
    return `<tr>${['id', 'from', 'to'].map(key => `<td>${field('edges', index, key, edge[key])}</td>`).join('')}${['widthIn', 'depthIn'].map(key => `<td>${field('edges', index, key, edge[key], 'number')}</td>`).join('')}<td><select data-corridor-kind="edges" data-corridor-index="${index}" data-corridor-field="permission" aria-label="Edge ${index + 1} permission">${options.map(([value, label]) => `<option value="${value}" ${value === permission ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><button type="button" data-corridor-remove="edges" data-corridor-index="${index}" aria-label="Remove edge ${index + 1}">Remove</button></td></tr>`;
  }).join('');
  return `<p>Coordinates are feet and corridor dimensions are inches. New edges start closed. Removing or renaming a node does not change edge references; repair any affected edges before generating.</p><h3>Corridor nodes</h3><div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>ID</th><th>X (ft)</th><th>Y (ft)</th><th>Z (ft)</th><th></th></tr></thead><tbody>${nodes || '<tr><td colspan="5">No nodes.</td></tr>'}</tbody></table></div><button type="button" data-corridor-add="nodes">Add node</button><h3>Corridor edges</h3><div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>ID</th><th>From node</th><th>To node</th><th>Width (in)</th><th>Depth (in)</th><th>Permission</th><th></th></tr></thead><tbody>${edges || '<tr><td colspan="7">No edges.</td></tr>'}</tbody></table></div><button type="button" data-corridor-add="edges">Add edge</button>`;
}

export function editCorridorGraph(graph, { action, kind, index, field, value } = {}) {
  if (action === 'initialize' && (graph == null || (record(graph) && !Object.prototype.hasOwnProperty.call(graph, 'nodes') && !Object.prototype.hasOwnProperty.call(graph, 'edges')))) return { ...(graph || {}), nodes: [], edges: [] };
  if (!record(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !['nodes', 'edges'].includes(kind)) return null;
  const rows = graph[kind].slice();
  if (action === 'add') rows.push(kind === 'nodes' ? { id: '', x: '', y: '', z: '' } : { id: '', from: '', to: '', widthIn: '', depthIn: '', permitted: false });
  else if (action === 'remove' && Number.isInteger(index) && index >= 0 && index < rows.length) rows.splice(index, 1);
  else if (action === 'edit' && Number.isInteger(index) && index >= 0 && index < rows.length && record(rows[index])) {
    const allowedFields = kind === 'nodes' ? ['id', 'x', 'y', 'z'] : ['id', 'from', 'to', 'widthIn', 'depthIn', 'permission'];
    if (!allowedFields.includes(field)) return null;
    const row = { ...rows[index] };
    if (field === 'permission') {
      if (!['unspecified', 'allowed', 'closed'].includes(value)) return null;
      delete row.allowed; delete row.permitted;
      if (value !== 'unspecified') row.permitted = value === 'allowed';
    } else if (['x', 'y', 'z', 'widthIn', 'depthIn'].includes(field)) {
      const text = String(value ?? '').trim();
      row[field] = text === '' ? '' : Number.isFinite(Number(text)) ? Number(text) : text;
    } else row[field] = String(value ?? '');
    rows[index] = row;
  } else return null;
  return { ...graph, [kind]: rows };
}
