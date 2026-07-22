const FACILITY_GROUPS = [
    {
        key: 'HV',
        laneY: -90,
        elevation: 18,
        trayWidth: 24,
        trayHeight: 4,
        branchCount: 5,
        conduitCount: 6,
        cableType: 'Power',
        conductors: 3,
        conductorSize: '500 kcmil',
        diameter: 0.65,
        weight: 2.7
    },
    {
        key: 'LV',
        laneY: -30,
        elevation: 28,
        trayWidth: 18,
        trayHeight: 4,
        branchCount: 5,
        conduitCount: 6,
        cableType: 'Power',
        conductors: 3,
        conductorSize: '4/0 AWG',
        diameter: 0.48,
        weight: 1.8
    },
    {
        key: 'INSTRUMENT',
        laneY: 30,
        elevation: 38,
        trayWidth: 12,
        trayHeight: 3,
        branchCount: 5,
        conduitCount: 4,
        cableType: 'Signal',
        conductors: 6,
        conductorSize: '#16 AWG',
        diameter: 0.28,
        weight: 0.35
    },
    {
        key: 'COMMUNICATION',
        laneY: 90,
        elevation: 48,
        trayWidth: 12,
        trayHeight: 3,
        branchCount: 4,
        conduitCount: 4,
        cableType: 'Signal',
        conductors: 12,
        conductorSize: '#22 AWG',
        diameter: 0.24,
        weight: 0.25
    }
];

const MAIN_SPAN_FT = 50;
const MAIN_SPAN_COUNT = 7;
const CABLES_PER_GROUP = 50;

const trayIdPrefix = group => group.key === 'COMMUNICATION' ? 'COMM' : group.key === 'INSTRUMENT' ? 'INST' : group.key;

const buildTrayCorridor = group => {
    const prefix = trayIdPrefix(group);
    const trays = [];
    for (let index = 0; index < MAIN_SPAN_COUNT; index += 1) {
        trays.push({
            tray_id: `${prefix}-TRUNK-${String(index + 1).padStart(2, '0')}`,
            start_x: index * MAIN_SPAN_FT,
            start_y: group.laneY,
            start_z: group.elevation,
            end_x: (index + 1) * MAIN_SPAN_FT,
            end_y: group.laneY,
            end_z: group.elevation,
            width: group.trayWidth,
            height: group.trayHeight,
            current_fill: 1.5 + ((index + group.branchCount) % 4) * 0.5,
            allowed_cable_group: group.key,
            shape: 'STR',
            raceway_type: 'tray'
        });
    }

    const branchXs = [100, 200, 300, 350];
    branchXs.forEach((x, index) => {
        trays.push({
            tray_id: `${prefix}-BRANCH-${String(index + 1).padStart(2, '0')}`,
            start_x: x,
            start_y: group.laneY,
            start_z: group.elevation,
            end_x: x,
            end_y: group.laneY + 40,
            end_z: group.elevation,
            width: group.trayWidth,
            height: group.trayHeight,
            current_fill: 0.75 + index * 0.25,
            allowed_cable_group: group.key,
            shape: 'TEE',
            raceway_type: 'tray'
        });
    });

    if (group.branchCount === 5) {
        trays.push({
            tray_id: `${prefix}-BRANCH-05`,
            start_x: 250,
            start_y: group.laneY,
            start_z: group.elevation,
            end_x: 250,
            end_y: group.laneY - 40,
            end_z: group.elevation,
            width: group.trayWidth,
            height: group.trayHeight,
            current_fill: 1,
            allowed_cable_group: group.key,
            shape: 'TEE',
            raceway_type: 'tray'
        });
    }
    return trays;
};

const buildDuctbank = group => {
    const prefix = trayIdPrefix(group);
    const tag = `DB-${prefix}-01`;
    const start = [-250, group.laneY, -8];
    const end = [0, group.laneY, -8];
    return {
        id: tag,
        tag,
        width: group.conduitCount >= 6 ? 48 : 36,
        height: 30,
        conduit_spacing: 8,
        outline: [start, end],
        conduits: Array.from({ length: group.conduitCount }, (_, index) => ({
            id: `${prefix}-C${String(index + 1).padStart(2, '0')}`,
            conduit_id: `${prefix}-C${String(index + 1).padStart(2, '0')}`,
            ductbankTag: tag,
            type: 'PVC Sch 40',
            trade_size: '4',
            diameter: 4,
            row: Math.floor(index / 3) + 1,
            column: (index % 3) + 1,
            path: [start.slice(), end.slice()],
            allowed_cable_group: group.key
        }))
    };
};

const buildRiser = group => {
    const prefix = trayIdPrefix(group);
    return {
        conduit_id: `RISER-${prefix}-01`,
        tray_id: `RISER-${prefix}-01`,
        type: 'RMC',
        trade_size: '4',
        diameter: 4,
        start_x: 0,
        start_y: group.laneY,
        start_z: -8,
        end_x: 0,
        end_y: group.laneY,
        end_z: group.elevation,
        allowed_cable_group: group.key
    };
};

const destinationPoints = group => {
    const points = [
        [50, group.laneY, group.elevation],
        [100, group.laneY + 40, group.elevation],
        [150, group.laneY, group.elevation],
        [200, group.laneY + 40, group.elevation],
        [300, group.laneY + 40, group.elevation],
        [350, group.laneY, group.elevation],
        [350, group.laneY + 40, group.elevation]
    ];
    if (group.branchCount === 5) points.push([250, group.laneY - 40, group.elevation]);
    return points;
};

const buildCables = group => {
    const prefix = trayIdPrefix(group);
    const destinations = destinationPoints(group);
    return Array.from({ length: CABLES_PER_GROUP }, (_, index) => {
        const destinationIndex = index % destinations.length;
        return {
            name: `${prefix}-CABLE-${String(index + 1).padStart(3, '0')}`,
            cable_type: group.cableType,
            conductors: group.conductors,
            conductor_size: group.conductorSize,
            diameter: group.diameter,
            weight: group.weight,
            start: [-250, group.laneY, -8],
            end: destinations[destinationIndex].slice(),
            start_tag: `${prefix}-SWGR-01`,
            end_tag: `${prefix}-LOAD-${String(destinationIndex + 1).padStart(2, '0')}`,
            allowed_cable_group: group.key,
            manual_path: '',
            raceway_ids: [],
            locked: false
        };
    });
};

export function buildLargeFacilityRoutingSample() {
    const manualTrays = FACILITY_GROUPS.flatMap(buildTrayCorridor);
    const ductbanks = FACILITY_GROUPS.map(buildDuctbank);
    const conduitData = FACILITY_GROUPS.map(buildRiser);
    const cableList = FACILITY_GROUPS.flatMap(buildCables);
    const ductbankConduitCount = ductbanks.reduce((total, ductbank) => total + ductbank.conduits.length, 0);
    const routableRacewayCount = manualTrays.length + ductbankConduitCount + conduitData.length;
    const modeledRacewayCount = routableRacewayCount + ductbanks.length;

    return {
        manualTrays,
        ductbankData: { ductbanks },
        conduitData,
        cableList,
        summary: {
            cableCount: cableList.length,
            routableRacewayCount,
            modeledRacewayCount,
            cableTraySegments: manualTrays.length,
            ductbankCount: ductbanks.length,
            ductbankConduits: ductbankConduitCount,
            riserConduits: conduitData.length,
            facilityLengthFt: 600,
            facilityWidthFt: 220
        }
    };
}

export { FACILITY_GROUPS };
