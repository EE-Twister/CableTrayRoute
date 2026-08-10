export const ROUTE_PRESETS = {
    conservative: {
        label: 'Conservative',
        fillLimit: 40,
        proximityThreshold: 72,
        maxFieldEdge: 1000,
        fieldPenalty: 4,
        sharedPenalty: 0.7,
        description: 'Uses a 40% tray fill limit and higher field-route cost for a conservative first pass.'
    },
    'tray-preferred': {
        label: 'Tray Preferred',
        fillLimit: 45,
        proximityThreshold: 72,
        maxFieldEdge: 1000,
        fieldPenalty: 6,
        sharedPenalty: 0.8,
        description: 'Strongly favors existing trays and conduits before accepting field-routed connections.'
    },
    'field-allowed': {
        label: 'Allow Field Routes',
        fillLimit: 50,
        proximityThreshold: 120,
        maxFieldEdge: 1500,
        fieldPenalty: 1.8,
        sharedPenalty: 0.45,
        description: 'Allows longer endpoint jumps and lower field-route cost when tray coverage is incomplete.'
    },
    'high-density': {
        label: 'High Density Review',
        fillLimit: 70,
        proximityThreshold: 96,
        maxFieldEdge: 1200,
        fieldPenalty: 3,
        sharedPenalty: 0.55,
        description: 'Raises the fill limit for what-if studies and highlights trays that need follow-up review.'
    },
    custom: {
        label: 'Custom',
        description: 'Uses the current routing values without applying a preset.'
    }
};

const SAMPLE_TRAYS = [
    { tray_id: 'ENTRY-HV', start_x: 0, start_y: -12, start_z: 10, end_x: 0, end_y: 0, end_z: 10, width: 16, height: 3.94, current_fill: 2.40, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'ENTRY-LV', start_x: 40, start_y: 12, start_z: 30, end_x: 40, end_y: 0, end_z: 30, width: 12, height: 3.15, current_fill: 1.80, allowed_cable_group: 'LV', shape: 'STR' },
    { tray_id: 'H1-A', start_x: 0, start_y: 0, start_z: 10, end_x: 40, end_y: 0, end_z: 10, width: 16, height: 3.94, current_fill: 9.30, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'H1-B', start_x: 40, start_y: 0, start_z: 10, end_x: 80, end_y: 0, end_z: 10, width: 16, height: 3.94, current_fill: 6.98, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'H1-C', start_x: 80, start_y: 0, start_z: 10, end_x: 120, end_y: 0, end_z: 10, width: 16, height: 3.94, current_fill: 12.71, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'H2-A', start_x: 0, start_y: 0, start_z: 30, end_x: 40, end_y: 0, end_z: 30, width: 12, height: 3.15, current_fill: 4.96, allowed_cable_group: 'LV', shape: 'STR' },
    { tray_id: 'H2-B', start_x: 40, start_y: 0, start_z: 30, end_x: 80, end_y: 0, end_z: 30, width: 12, height: 3.15, current_fill: 8.99, allowed_cable_group: 'LV', shape: 'STR' },
    { tray_id: 'H2-C', start_x: 80, start_y: 0, start_z: 30, end_x: 120, end_y: 0, end_z: 30, width: 12, height: 3.15, current_fill: 3.26, allowed_cable_group: 'LV', shape: 'STR' },
    { tray_id: 'V1', start_x: 40, start_y: 0, start_z: 10, end_x: 40, end_y: 0, end_z: 30, width: 8, height: 2.36, current_fill: 2.79, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'V2', start_x: 80, start_y: 0, start_z: 10, end_x: 80, end_y: 0, end_z: 30, width: 8, height: 2.36, current_fill: 3.41, allowed_cable_group: 'LV', shape: 'STR' },
    { tray_id: 'C1', start_x: 60, start_y: 0, start_z: 10, end_x: 60, end_y: 40, end_z: 10, width: 9, height: 2.95, current_fill: 5.43, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'C2', start_x: 100, start_y: 0, start_z: 30, end_x: 100, end_y: 60, end_z: 30, width: 9, height: 2.95, current_fill: 6.36, allowed_cable_group: 'LV', shape: 'STR' },
    { tray_id: 'B1', start_x: 60, start_y: 40, start_z: 10, end_x: 60, end_y: 80, end_z: 10, width: 6, height: 1.97, current_fill: 1.86, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'B2', start_x: 100, start_y: 60, start_z: 30, end_x: 100, end_y: 100, end_z: 30, width: 6, height: 1.97, current_fill: 1.40, allowed_cable_group: 'LV', shape: 'STR' },
    { tray_id: 'TRUNK', start_x: 0, start_y: 20, start_z: 50, end_x: 120, end_y: 20, end_z: 50, width: 24, height: 5.91, current_fill: 27.90, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'EQ1', start_x: 20, start_y: 0, start_z: 10, end_x: 20, end_y: 15, end_z: 5, width: 4, height: 1.57, current_fill: 1.24, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'EQ2', start_x: 100, start_y: 60, start_z: 30, end_x: 110, end_y: 90, end_z: 20, width: 4, height: 1.57, current_fill: 0.93, allowed_cable_group: 'LV', shape: 'STR' },
    { tray_id: 'CONN1', start_x: 120, start_y: 0, start_z: 10, end_x: 120, end_y: 20, end_z: 25, width: 8, height: 2.95, current_fill: 3.10, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'CONN2', start_x: 120, start_y: 20, start_z: 25, end_x: 120, end_y: 20, end_z: 50, width: 8, height: 2.95, current_fill: 2.33, allowed_cable_group: 'HV', shape: 'STR' },
    { tray_id: 'INST-ENTRY', start_x: 0, start_y: -40, start_z: 20, end_x: 0, end_y: -20, end_z: 20, width: 6, height: 2.00, current_fill: 0.70, allowed_cable_group: 'INSTRUMENT', shape: 'STR' },
    { tray_id: 'INST-A', start_x: 0, start_y: -20, start_z: 20, end_x: 60, end_y: -20, end_z: 20, width: 6, height: 2.00, current_fill: 1.20, allowed_cable_group: 'INSTRUMENT', shape: 'STR' },
    { tray_id: 'INST-B', start_x: 60, start_y: -20, start_z: 20, end_x: 60, end_y: 70, end_z: 20, width: 6, height: 2.00, current_fill: 1.50, allowed_cable_group: 'INSTRUMENT', shape: 'STR' },
    { tray_id: 'INST-C', start_x: 60, start_y: 70, start_z: 20, end_x: 110, end_y: 70, end_z: 20, width: 6, height: 2.00, current_fill: 0.90, allowed_cable_group: 'INSTRUMENT', shape: 'STR' },
    { tray_id: 'COMM-ENTRY', start_x: 20, start_y: 30, start_z: 45, end_x: 20, end_y: 40, end_z: 45, width: 8, height: 2.00, current_fill: 0.80, allowed_cable_group: 'COMMUNICATION', shape: 'STR' },
    { tray_id: 'COMM-A', start_x: 20, start_y: 40, start_z: 45, end_x: 70, end_y: 40, end_z: 45, width: 8, height: 2.00, current_fill: 1.10, allowed_cable_group: 'COMMUNICATION', shape: 'STR' },
    { tray_id: 'COMM-B', start_x: 70, start_y: 40, start_z: 45, end_x: 70, end_y: 95, end_z: 45, width: 8, height: 2.00, current_fill: 1.30, allowed_cable_group: 'COMMUNICATION', shape: 'STR' },
    { tray_id: 'COMM-C', start_x: 70, start_y: 95, start_z: 45, end_x: 120, end_y: 95, end_z: 45, width: 8, height: 2.00, current_fill: 0.60, allowed_cable_group: 'COMMUNICATION', shape: 'STR' }
];

export function getSampleTrays() {
    return SAMPLE_TRAYS.map(tray => ({ ...tray }));
}

export function getSampleDuctbanks() {
    const ductbank = (tag, outline, group) => ({
        id: tag,
        tag,
        width: 32,
        height: 24,
        conduit_spacing: 8,
        outline: outline.map(point => point.slice()),
        conduits: [
            { id: `${group}-C1`, conduit_id: `${group}-C1`, ductbankTag: tag, type: 'PVC Sch 40', trade_size: '4', diameter: 4, row: 1, column: 1, path: outline.map(point => point.slice()), allowed_cable_group: group },
            { id: `${group}-C2`, conduit_id: `${group}-C2`, ductbankTag: tag, type: 'PVC Sch 40', trade_size: '4', diameter: 4, row: 1, column: 2, path: outline.map(point => point.slice()), allowed_cable_group: group },
            { id: `${group}-C3`, conduit_id: `${group}-C3`, ductbankTag: tag, type: 'PVC Sch 40', trade_size: '4', diameter: 4, row: 2, column: 1, path: outline.map(point => point.slice()), allowed_cable_group: group },
            { id: `${group}-C4`, conduit_id: `${group}-C4`, ductbankTag: tag, type: 'PVC Sch 40', trade_size: '4', diameter: 4, row: 2, column: 2, path: outline.map(point => point.slice()), allowed_cable_group: group }
        ]
    });
    return {
        ductbanks: [
            ductbank('DB-HV-01', [[-60, -12, -8], [0, -12, -8]], 'HV'),
            ductbank('DB-LV-01', [[-60, 12, -8], [40, 12, -8]], 'LV')
        ]
    };
}

export function getSampleRiserConduits() {
    return [
        {
            conduit_id: 'RISER-HV-01', tray_id: 'RISER-HV-01', type: 'RMC', trade_size: '4', diameter: 4,
            start_x: 0, start_y: -12, start_z: -8, end_x: 0, end_y: -12, end_z: 10,
            allowed_cable_group: 'HV'
        },
        {
            conduit_id: 'RISER-LV-01', tray_id: 'RISER-LV-01', type: 'RMC', trade_size: '4', diameter: 4,
            start_x: 40, start_y: 12, start_z: -8, end_x: 40, end_y: 12, end_z: 30,
            allowed_cable_group: 'LV'
        }
    ];
}

export function getSampleCables() {
    const templates = [
        { cable_type: 'Power', conductors: 3, conductor_size: '#12 AWG', diameter: 1.26, weight: 1.5, start: [5, 5, 5], end: [110, 95, 45], allowed_cable_group: 'HV' },
        { cable_type: 'Control', conductors: 3, conductor_size: '#12 AWG', diameter: 0.47, weight: 0.8, start: [10, 0, 10], end: [100, 80, 25], allowed_cable_group: 'LV' },
        { cable_type: 'Signal', conductors: 3, conductor_size: '#12 AWG', diameter: 0.31, weight: 0.5, start: [15, 5, 15], end: [105, 85, 30], allowed_cable_group: 'INSTRUMENT' },
        { cable_type: 'Signal', conductors: 12, conductor_size: '#22 AWG', diameter: 0.55, weight: 0.4, start: [20, 10, 8], end: [115, 90, 35], allowed_cable_group: 'COMMUNICATION' },
        { cable_type: 'Control', conductors: 3, conductor_size: '#12 AWG', diameter: 0.59, weight: 0.9, start: [25, 15, 12], end: [95, 75, 28], allowed_cable_group: 'LV' }
    ];
    const cables = [];
    for (let index = 0; index < 30; index += 1) {
        const template = templates[index % templates.length];
        const offset = Math.floor(index / templates.length) * 5;
        cables.push({
            name: `Cable ${String(index + 1).padStart(2, '0')}`,
            cable_type: template.cable_type,
            conductors: template.conductors,
            conductor_size: template.conductor_size,
            diameter: template.diameter,
            weight: template.weight,
            start: template.start.map(value => value + offset),
            end: template.end.map(value => value + offset),
            start_tag: `ST${index + 1}`,
            end_tag: `ET${index + 1}`,
            allowed_cable_group: template.allowed_cable_group,
            manual_path: '',
            raceway_ids: []
        });
    }
    Object.assign(cables[0], { start: [-60, -12, -8], end: [120, 0, 10], start_tag: 'SWGR-UG-HV', end_tag: 'MCC-HV-01', allowed_cable_group: 'HV' });
    Object.assign(cables[1], { start: [-60, 12, -8], end: [100, 100, 30], start_tag: 'SWGR-UG-LV', end_tag: 'MCC-LV-01', allowed_cable_group: 'LV' });
    Object.assign(cables[2], { start: [0, -40, 20], end: [110, 70, 20], start_tag: 'PLC-IO-01', end_tag: 'JB-INST-07', allowed_cable_group: 'INSTRUMENT' });
    Object.assign(cables[3], { start: [20, 30, 45], end: [120, 95, 45], start_tag: 'NET-RACK-01', end_tag: 'IDF-02', allowed_cable_group: 'COMMUNICATION' });
    [10, 20].forEach(index => Object.assign(cables[index], {
        start: cables[0].start.slice(), end: cables[0].end.slice(), start_tag: 'SWGR-UG-HV', end_tag: 'MCC-HV-01', allowed_cable_group: 'HV'
    }));
    [7, 17].forEach(index => Object.assign(cables[index], {
        start: cables[2].start.slice(), end: cables[2].end.slice(), start_tag: 'PLC-IO-01', end_tag: 'JB-INST-07', allowed_cable_group: 'INSTRUMENT'
    }));
    return cables;
}
