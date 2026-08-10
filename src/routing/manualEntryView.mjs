const CABLE_TYPES = ['Power', 'Control', 'Signal'];
const CONDUCTOR_SIZES = [
    '#22 AWG', '#20 AWG', '#18 AWG', '#16 AWG', '#14 AWG', '#12 AWG', '#10 AWG',
    '#8 AWG', '#6 AWG', '#4 AWG', '#2 AWG', '#1 AWG', '1/0 AWG', '2/0 AWG',
    '3/0 AWG', '4/0 AWG', '250 kcmil', '350 kcmil', '500 kcmil', '750 kcmil', '1000 kcmil'
];

const optionMarkup = (options, selected) => options
    .map(option => `<option value="${option}" ${selected === option ? 'selected' : ''}>${option}</option>`)
    .join('');

export const buildManualTrayTableMarkup = (trays, options = {}) => {
    const { shapeCodes = [], escapeAttr } = options;
    let table = '<table id="trayTable" class="sticky-table"><thead><tr>' +
        '<th data-key="tray_id">Tray ID</th>' +
        '<th data-key="start_x">Start (X,Y,Z)</th>' +
        '<th data-key="end_x">End (X,Y,Z)</th>' +
        '<th data-key="width">Width</th>' +
        '<th data-key="height">Height</th>' +
        '<th data-key="current_fill">Current Fill</th>' +
        '<th data-key="allowed_cable_group">Allowed Group</th>' +
        '<th data-key="shape">Shape <span class="help-icon" tabindex="0" role="button" aria-label="Help" aria-expanded="false" aria-describedby="shape-help">?<span id="shape-help" class="tooltip">STR: Straight<br>90B: 90° Bend<br>45B: 45° Bend<br>30B/60B: 30°/60° Bend<br>TEE: Tee<br>X: Cross<br>VI: Vertical Inside<br>VO: Vertical Outside<br>45VI: 45° Vertical Inside<br>45VO: 45° Vertical Outside<br>RED-C: Center Reducer<br>RED-S: Side Reducer<br>Z: Z-Bend<br>OFFSET: Offset<br>SPIRAL: Spiral</span></span></th>' +
        '<th></th><th></th></tr></thead><tbody>';
    trays.forEach((tray, index) => {
        table += `<tr data-idx="${index}">
                    <td><input type="text" class="tray-id-input" data-idx="${index}" value="${escapeAttr(tray.tray_id)}" style="width:80px;"></td>
                    <td>
                        <input type="number" class="tray-start-input" data-idx="${index}" data-coord="0" value="${tray.start_x}" step="0.1" style="width:70px;">
                        <input type="number" class="tray-start-input" data-idx="${index}" data-coord="1" value="${tray.start_y}" step="0.1" style="width:70px;">
                        <input type="number" class="tray-start-input" data-idx="${index}" data-coord="2" value="${tray.start_z}" step="0.1" style="width:70px;">
                    </td>
                    <td>
                        <input type="number" class="tray-end-input" data-idx="${index}" data-coord="0" value="${tray.end_x}" step="0.1" style="width:70px;">
                        <input type="number" class="tray-end-input" data-idx="${index}" data-coord="1" value="${tray.end_y}" step="0.1" style="width:70px;">
                        <input type="number" class="tray-end-input" data-idx="${index}" data-coord="2" value="${tray.end_z}" step="0.1" style="width:70px;">
                    </td>
                    <td><input type="number" class="tray-width-input" data-idx="${index}" value="${tray.width}" min="0" step="0.1" style="width:60px;"></td>
                    <td><input type="number" class="tray-height-input" data-idx="${index}" value="${tray.height}" min="0" step="0.1" style="width:60px;"></td>
                    <td><input type="number" class="tray-fill-input" data-idx="${index}" value="${tray.current_fill}" min="0" step="0.1" style="width:80px;"></td>
                    <td><input type="text" class="tray-group-input" data-idx="${index}" value="${escapeAttr(tray.allowed_cable_group || '')}" style="width:100px;"></td>
                    <td><select class="tray-shape-select" data-idx="${index}" style="width:100px;">${optionMarkup(shapeCodes, tray.shape)}</select></td>
                    <td><button class="icon-button dup-tray" data-idx="${index}" title="Duplicate" aria-label="Duplicate tray">📋</button></td>
                    <td><button class="icon-button delete-tray icon-delete" data-idx="${index}" title="Delete" aria-label="Delete tray">❌</button></td>
                 </tr>`;
    });
    return `${table}</tbody></table>`;
};

const trayFieldBindings = [
    ['.tray-id-input', 'tray_id', value => value],
    ['.tray-start-input', 'start', Number.parseFloat],
    ['.tray-end-input', 'end', Number.parseFloat],
    ['.tray-width-input', 'width', Number.parseFloat],
    ['.tray-height-input', 'height', Number.parseFloat],
    ['.tray-fill-input', 'current_fill', Number.parseFloat],
    ['.tray-group-input', 'allowed_cable_group', value => value],
    ['.tray-shape-select', 'shape', value => value, 'change']
];

export const bindManualTrayTable = (container, callbacks = {}) => {
    trayFieldBindings.forEach(([selector, field, parse, eventName = 'input']) => {
        container.querySelectorAll(selector).forEach(input => {
            input.addEventListener(eventName, event => {
                if (field === 'tray_id') event.target.classList.remove('input-error');
                callbacks.onFieldChange?.({
                    index: Number.parseInt(event.target.dataset.idx, 10),
                    field,
                    coordinate: Number.parseInt(event.target.dataset.coord, 10),
                    value: parse(event.target.value),
                    input: event.target
                });
            });
        });
    });
    container.querySelectorAll('.delete-tray').forEach(button => {
        button.addEventListener('click', event => callbacks.onDelete?.(Number.parseInt(event.currentTarget.dataset.idx, 10)));
    });
    container.querySelectorAll('.dup-tray').forEach(button => {
        button.addEventListener('click', event => callbacks.onDuplicate?.(Number.parseInt(event.currentTarget.dataset.idx, 10)));
    });
};

export const buildCableTableMarkup = (cables, options = {}) => {
    const { escapeAttr } = options;
    let html = '<h4>Cables to Route:</h4><table id="cables-panel" class="sticky-table"><thead><tr>' +
        '<th data-key="name">Tag</th><th data-key="start_tag">Start Tag</th><th data-key="end_tag">End Tag</th>' +
        '<th data-key="cable_type">Cable Type</th><th data-key="conductors">Conductors</th><th data-key="conductor_size">Conductor Size</th>' +
        '<th data-key="diameter">Diameter (in)</th><th data-key="weight">Weight (lbs/ft)</th><th data-key="allowed_cable_group">Allowed Group</th>' +
        '<th data-key="start0">Start (X,Y,Z)</th><th data-key="end0">End (X,Y,Z)</th><th data-key="manual_path">Manual Path</th>' +
        '<th data-key="locked">Locked</th><th></th><th></th></tr></thead><tbody>';
    cables.forEach((cable, index) => {
        html += `<tr>
                    <td><input type="text" class="cable-tag-input" data-idx="${index}" value="${escapeAttr(cable.name)}"></td>
                    <td><input type="text" class="cable-start-tag-input" data-idx="${index}" value="${escapeAttr(cable.start_tag || '')}" style="width:180px;"></td>
                    <td><input type="text" class="cable-end-tag-input" data-idx="${index}" value="${escapeAttr(cable.end_tag || '')}" style="width:180px;"></td>
                    <td><select class="cable-type-select" data-idx="${index}">${optionMarkup(CABLE_TYPES, cable.cable_type)}</select></td>
                    <td><input type="number" class="cable-conductors-input" data-idx="${index}" value="${cable.conductors || 0}" min="1" step="1" style="width:60px;"></td>
                    <td><select class="cable-size-select" data-idx="${index}">${optionMarkup(CONDUCTOR_SIZES, cable.conductor_size)}</select></td>
                    <td><input type="number" class="cable-diameter-input" data-idx="${index}" value="${cable.diameter}" min="0" step="0.01" style="width:60px;"></td>
                    <td><input type="number" class="cable-weight-input" data-idx="${index}" value="${cable.weight || 0}" min="0" step="0.01" style="width:80px;"></td>
                    <td><input type="text" class="cable-group-input" data-idx="${index}" value="${escapeAttr(cable.allowed_cable_group || '')}" style="width:120px;"></td>
                    <td>
                        <input type="number" class="cable-start-input" data-idx="${index}" data-coord="0" value="${cable.start[0]}" step="0.1" style="width:60px;">
                        <input type="number" class="cable-start-input" data-idx="${index}" data-coord="1" value="${cable.start[1]}" step="0.1" style="width:60px;">
                        <input type="number" class="cable-start-input" data-idx="${index}" data-coord="2" value="${cable.start[2]}" step="0.1" style="width:60px;">
                    </td>
                    <td>
                        <input type="number" class="cable-end-input" data-idx="${index}" data-coord="0" value="${cable.end[0]}" step="0.1" style="width:60px;">
                        <input type="number" class="cable-end-input" data-idx="${index}" data-coord="1" value="${cable.end[1]}" step="0.1" style="width:60px;">
                        <input type="number" class="cable-end-input" data-idx="${index}" data-coord="2" value="${cable.end[2]}" step="0.1" style="width:60px;">
                    </td>
                    <td><input type="text" class="cable-manual-input" data-idx="${index}" value="${escapeAttr(cable.manual_path || '')}" placeholder="Tray1>Tray2 or x,y,z;..." style="width:180px;"></td>
                    <td><span class="lock-indicator">${cable.locked ? '🔒' : ''}</span>${cable.locked ? `<button class="unlock-cable" data-idx="${index}">Unlock</button>` : (cable.route_segments && cable.route_segments.length ? `<button class="relock-cable" data-idx="${index}">Relock</button>` : '')}</td>
                    <td><button class="icon-button dup-cable" data-idx="${index}" title="Duplicate" aria-label="Duplicate cable">📋</button></td>
                    <td><button class="icon-button del-cable icon-delete" data-idx="${index}" title="Delete" aria-label="Delete cable">❌</button></td>
                </tr>`;
    });
    return `${html}</tbody></table>`;
};

const cableFieldBindings = [
    ['.cable-tag-input', 'name', value => value],
    ['.cable-start-tag-input', 'start_tag', value => value],
    ['.cable-end-tag-input', 'end_tag', value => value],
    ['.cable-diameter-input', 'diameter', Number.parseFloat],
    ['.cable-conductors-input', 'conductors', value => Number.parseInt(value, 10)],
    ['.cable-size-select', 'conductor_size', value => value, 'change'],
    ['.cable-weight-input', 'weight', Number.parseFloat],
    ['.cable-type-select', 'cable_type', value => value, 'change'],
    ['.cable-group-input', 'allowed_cable_group', value => value],
    ['.cable-start-input', 'start', Number.parseFloat],
    ['.cable-end-input', 'end', Number.parseFloat],
    ['.cable-manual-input', 'manual_path', value => value]
];

export const bindCableTable = (container, callbacks = {}) => {
    cableFieldBindings.forEach(([selector, field, parse, eventName = 'input']) => {
        container.querySelectorAll(selector).forEach(input => {
            input.addEventListener(eventName, event => {
                if (field === 'manual_path') {
                    event.target.classList.remove('input-error');
                    const error = event.target.nextElementSibling;
                    if (error?.classList.contains('error-message')) error.remove();
                }
                callbacks.onFieldChange?.({
                    index: Number.parseInt(event.target.dataset.idx, 10),
                    field,
                    coordinate: Number.parseInt(event.target.dataset.coord, 10),
                    value: parse(event.target.value),
                    input: event.target
                });
            });
        });
    });
    const bindAction = (selector, callback) => {
        container.querySelectorAll(selector).forEach(button => {
            button.addEventListener('click', event => callback?.(Number.parseInt(event.currentTarget.dataset.idx, 10)));
        });
    };
    bindAction('.dup-cable', callbacks.onDuplicate);
    bindAction('.del-cable', callbacks.onDelete);
    bindAction('.unlock-cable', index => callbacks.onLockChange?.(index, false));
    bindAction('.relock-cable', index => callbacks.onLockChange?.(index, true));
};
