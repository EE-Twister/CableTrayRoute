/**
 * Optimal Route file formats: tray list CSV round trip (E3), CSV quoting and
 * formula guarding, and route_data unit labels (E8).
 */
import assert from 'assert';
import Papa from 'papaparse';
import {
    TRAY_TEMPLATE_HEADERS,
    buildCableOptionsCsv,
    buildRouteDataCsv,
    buildTrayListCsv,
    labelRouteRows,
    mapImportedTrayRow,
    normalizeImportRow,
    ROUTE_SEGMENT_COLUMNS,
    ROUTE_SUMMARY_COLUMNS
} from '../src/routing/routingFileModel.mjs';
import { getSampleTrays } from '../src/routing/routingSamples.mjs';
import { buildSegmentRows, buildSummaryRows } from '../resultsExport.mjs';
import { parsePullRouteRows } from '../analysis/pullCardRouteImport.mjs';
import { stripCsvFormulaGuard } from '../utils/csv.mjs';

function describe(name, fn) {
    console.log(name);
    fn();
}

function it(name, fn) {
    try {
        fn();
        console.log('  ✓', name);
    } catch (err) {
        console.log('  ✗', name);
        console.error(err);
        process.exitCode = 1;
    }
}

// Same parse path as app.mjs parseFile + importManualTrays for a .csv file.
const importTrayCsv = csv => Papa.parse(csv, { header: true, skipEmptyLines: true }).data
    .map(normalizeImportRow)
    .map(mapImportedTrayRow);

const TRAY_FIELDS = [
    'tray_id', 'start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z', 'width', 'height',
    'tray_type', 'current_fill', 'num_slots', 'slot_groups', 'allowed_cable_group', 'shape'
];
const pick = tray => Object.fromEntries(TRAY_FIELDS.map(field => [field, tray[field]]));

describe('tray list CSV (E3)', () => {
    const sampleTrays = getSampleTrays().map(tray => ({ ...tray, raceway_type: 'tray' }));

    it('writes one value per header for every tray', () => {
        const csv = buildTrayListCsv(sampleTrays);
        const parsed = Papa.parse(csv, { skipEmptyLines: true }).data;
        assert.strictEqual(parsed[0].length, TRAY_TEMPLATE_HEADERS.length);
        assert.strictEqual(parsed.length, sampleTrays.length + 1);
        parsed.slice(1).forEach(row => assert.strictEqual(row.length, parsed[0].length, `row ${row[0]} is misaligned`));
    });

    it('keeps ENTRY-HV segregation in its own columns', () => {
        const csv = buildTrayListCsv(sampleTrays);
        const lines = csv.trim().split('\n');
        assert.strictEqual(lines[0], 'tray_id,start_x,start_y,start_z,end_x,end_y,end_z,inside_width,tray_depth,tray_type,current_fill,num_slots,slot_groups,allowed_cable_group,shape');
        assert.strictEqual(lines.find(line => line.startsWith('ENTRY-HV,')), 'ENTRY-HV,0,-12,10,0,0,10,16,3.94,,2.4,1,,HV,STR');
        const [entry] = Papa.parse(csv, { header: true }).data;
        assert.strictEqual(entry.num_slots, '1');
        assert.strictEqual(entry.slot_groups, '');
        assert.strictEqual(entry.allowed_cable_group, 'HV');
        assert.strictEqual(entry.shape, 'STR');
    });

    it('round-trips trays through export and import without losing fields', () => {
        const trays = [
            ...sampleTrays,
            {
                tray_id: 'TC-COMP', start_x: -5, start_y: 0, start_z: 12, end_x: 95.5, end_y: 0, end_z: 12,
                width: 24, height: 4, tray_type: 'Ladder (50 % fill)', current_fill: 3.5, num_slots: 2,
                slot_groups: { 0: 'Zone 1 - 480 V, Feeders', 1: 'Zone 2 - "208 V"' },
                allowed_cable_group: 'LV', shape: 'STR', raceway_type: 'tray'
            },
            {
                tray_id: 'TC-TEXT', start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0,
                width: 12, height: 4, tray_type: '', current_fill: 0, num_slots: 3,
                slot_groups: '{"0":"power","1":"control","2":"instrument"}',
                allowed_cable_group: '', shape: 'STR', raceway_type: 'tray'
            }
        ];
        const imported = importTrayCsv(buildTrayListCsv(trays));
        assert.strictEqual(imported.length, trays.length);
        const expected = trays.map(tray => ({
            ...pick(tray),
            tray_type: tray.tray_type || '',
            num_slots: tray.num_slots ?? 1,
            slot_groups: typeof tray.slot_groups === 'string' ? JSON.parse(tray.slot_groups) : (tray.slot_groups ?? null)
        }));
        assert.deepStrictEqual(imported.map(pick), expected);
        const entry = imported.find(tray => tray.tray_id === 'ENTRY-HV');
        assert.strictEqual(entry.allowed_cable_group, 'HV');
        assert.strictEqual(entry.num_slots, 1);
        assert.strictEqual(entry.slot_groups, null);
        assert.strictEqual(imported.every(tray => tray.raceway_type === 'tray'), true);
    });

    it('formula-guards text cells and the importer restores the original text', () => {
        const trays = [{
            tray_id: '=HYPERLINK("x")', start_x: 0, start_y: -1, start_z: 0, end_x: 1, end_y: 0, end_z: 0,
            width: 6, height: 2, tray_type: '@type', current_fill: 0, allowed_cable_group: '+24V DC', shape: 'STR'
        }];
        const csv = buildTrayListCsv(trays);
        const dataLine = csv.trim().split('\n')[1];
        assert.ok(dataLine.startsWith('"\'=HYPERLINK(""x"")",0,-1,'), dataLine);
        assert.ok(dataLine.includes(',\'@type,'), dataLine);
        assert.ok(dataLine.includes(',\'+24V DC,'), dataLine);
        const [imported] = importTrayCsv(csv);
        assert.strictEqual(imported.tray_id, '=HYPERLINK("x")');
        assert.strictEqual(imported.tray_type, '@type');
        assert.strictEqual(imported.allowed_cable_group, '+24V DC');
        assert.strictEqual(imported.start_y, -1);
    });

    it('keeps slot group text that is not a JSON object instead of dropping it', () => {
        const [imported] = importTrayCsv('tray_id,start_x,start_y,start_z,end_x,end_y,end_z,inside_width,tray_depth,num_slots,slot_groups\nT1,0,0,0,1,0,0,6,2,2,power|control\n');
        assert.strictEqual(imported.slot_groups, 'power|control');
        assert.strictEqual(imported.num_slots, 2);
    });

    it('stripCsvFormulaGuard leaves ordinary values alone', () => {
        assert.strictEqual(stripCsvFormulaGuard("'-5"), "'-5");
        assert.strictEqual(stripCsvFormulaGuard("it's"), "it's");
        assert.strictEqual(stripCsvFormulaGuard(12), 12);
        assert.strictEqual(stripCsvFormulaGuard("'=SUM(A1)"), '=SUM(A1)');
    });
});

describe('cable options CSV', () => {
    it('quotes values that contain commas and keeps 15 columns', () => {
        const csv = buildCableOptionsCsv([{
            name: 'C-1, spare', start_tag: 'MCC-1', end_tag: '-M1', cable_type: 'Power', conductors: 3,
            conductor_size: '#12 AWG', diameter: 0.5, weight: 0.4, allowed_cable_group: 'LV',
            start: [0, -2, 3], end: [10, 0, 3]
        }]);
        const rows = Papa.parse(csv, { skipEmptyLines: true }).data;
        assert.strictEqual(rows[0].length, 15);
        assert.strictEqual(rows[1].length, 15);
        assert.strictEqual(rows[1][0], 'C-1, spare');
        assert.strictEqual(rows[1][2], "'-M1");
        assert.deepStrictEqual(rows[1].slice(9), ['0', '-2', '3', '10', '0', '3']);
    });
});

describe('route_data units (E8)', () => {
    const results = [{
        cable: 'C-1',
        total_length: 30,
        field_length: 5,
        segments_count: 2,
        route_segments: [
            { type: 'tray', tray_id: 'TR, A', length: 25, start: [0, 0, 10], end: [25, 0, 10] },
            { type: 'field', length: 5, start: [25, 0, 10], end: [30, 0, 10] }
        ],
        exclusions: [{ reason: 'over_capacity' }]
    }];

    it('labels length columns in feet in the CSV and quotes ids with commas', () => {
        const csv = buildRouteDataCsv(buildSegmentRows(results));
        const rows = Papa.parse(csv, { header: true, skipEmptyLines: true }).data;
        const headers = Object.keys(rows[0]);
        assert.deepStrictEqual(headers, ROUTE_SEGMENT_COLUMNS.map(([, label]) => label));
        assert.ok(headers.includes('Length (ft)'));
        assert.ok(headers.includes('Cumulative Length (ft)'));
        assert.strictEqual(rows[0].element_id, 'TR, A');
        assert.strictEqual(rows[0]['Length (ft)'], '25');
        assert.strictEqual(rows[1]['Cumulative Length (ft)'], '30');
    });

    it('uses the same labels for the workbook sheets', () => {
        const segmentSheet = labelRouteRows(buildSegmentRows(results));
        const summarySheet = labelRouteRows(buildSummaryRows(results), ROUTE_SUMMARY_COLUMNS);
        assert.deepStrictEqual(Object.keys(segmentSheet[0]), ROUTE_SEGMENT_COLUMNS.map(([, label]) => label));
        assert.deepStrictEqual(summarySheet[0], {
            cable_tag: 'C-1',
            'Total Length (ft)': 30,
            'Field Length (ft)': 5,
            segments_count: 2,
            reason_codes: 'over_capacity'
        });
    });

    it('stays importable by Pull Cards with lengths and coordinates intact', () => {
        const csvRows = Papa.parse(buildRouteDataCsv(buildSegmentRows(results)), { header: true, skipEmptyLines: true }).data;
        const summarySheet = labelRouteRows(buildSummaryRows(results), ROUTE_SUMMARY_COLUMNS);
        const [route] = parsePullRouteRows(csvRows, summarySheet);
        assert.strictEqual(route.total_length, 30);
        assert.deepStrictEqual(route.breakdown.map(segment => segment.length), [25, 5]);
        assert.deepStrictEqual(route.breakdown[0].start, [0, 0, 10]);
        assert.deepStrictEqual(route.breakdown[1].end, [30, 0, 10]);
        assert.strictEqual(route.breakdown[0].tray_id, 'TR, A');
        assert.strictEqual(route.breakdown[1].tray_id, 'Field Route');
    });
});
