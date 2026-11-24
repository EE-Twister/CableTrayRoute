import { csvCell, stripCsvFormulaGuard } from '../../utils/csv.mjs';

/**
 * DOM-free file formats for the Optimal Route page: tray list and cable option
 * CSV columns, the tray import mapper, and the route_data column labels. The
 * header list and the row builder live together so a CSV row always has one
 * value per header.
 */

export const TRAY_TEMPLATE_HEADERS = Object.freeze([
    'tray_id', 'start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z',
    ['inside_width', 'width'],
    ['tray_depth', 'height'],
    'tray_type', 'current_fill', 'num_slots', 'slot_groups', 'allowed_cable_group', 'shape'
]);

export const CABLE_TEMPLATE_HEADERS = Object.freeze([
    'tag',
    ['from_tag', 'start_tag'],
    ['to_tag', 'end_tag'],
    'cable_type', 'conductors', 'conductor_size',
    ['cable_od', 'diameter'],
    ['weight', 'weight_lb_ft'],
    'allowed_cable_group', 'start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z'
]);

export const primaryHeaders = headers => headers.map(header => (Array.isArray(header) ? header[0] : header));

/** Join header names and row arrays into CSV text, quoting and formula-guarding every cell. */
export function buildCsvText(headers, rows) {
    const lines = [headers.map(csvCell).join(',')];
    rows.forEach(row => lines.push(row.map(csvCell).join(',')));
    return `${lines.join('\n')}\n`;
}

const slotCount = value => Math.max(1, Number.parseInt(value, 10) || 1);

/** slot_groups may be an object, a Map or JSON text; the CSV cell always holds JSON text. */
export function serializeSlotGroups(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'string') return value.trim();
    if (value instanceof Map) return JSON.stringify(Object.fromEntries(value));
    return JSON.stringify(value);
}

/** JSON object text becomes an object; text that is not a JSON object is kept so it is not lost. */
export function parseSlotGroups(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') return value;
    const raw = String(value).trim();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : raw;
    } catch {
        return raw;
    }
}

const TRAY_CSV_VALUES = {
    inside_width: tray => tray.width ?? tray.inside_width,
    tray_depth: tray => tray.height ?? tray.tray_depth,
    tray_type: tray => tray.tray_type || '',
    num_slots: tray => slotCount(tray.num_slots ?? tray.numSlots),
    slot_groups: tray => serializeSlotGroups(tray.slot_groups ?? tray.slotGroups)
};

export function buildTrayListCsv(trays = []) {
    const headers = primaryHeaders(TRAY_TEMPLATE_HEADERS);
    const rows = trays.map(tray => headers.map(header => (TRAY_CSV_VALUES[header] ? TRAY_CSV_VALUES[header](tray) : tray[header])));
    return buildCsvText(headers, rows);
}

/** Trim and lowercase the keys of a parsed import row and undo the CSV formula guard on text values. */
export function normalizeImportRow(row = {}) {
    const normalized = {};
    Object.keys(row).forEach(key => {
        normalized[key.trim().toLowerCase()] = stripCsvFormulaGuard(row[key]);
    });
    return normalized;
}

/** Map one normalized tray import row (CSV or XLSX) to the Optimal Route manual tray shape. */
export function mapImportedTrayRow(row = {}) {
    return {
        tray_id: row.tray_id,
        start_x: parseFloat(row.start_x) || 0,
        start_y: parseFloat(row.start_y) || 0,
        start_z: parseFloat(row.start_z) || 0,
        end_x: parseFloat(row.end_x) || 0,
        end_y: parseFloat(row.end_y) || 0,
        end_z: parseFloat(row.end_z) || 0,
        width: parseFloat(row.inside_width ?? row.width) || 0,
        height: parseFloat(row.tray_depth ?? row.height) || 0,
        tray_type: row.tray_type || '',
        current_fill: parseFloat(row.current_fill) || 0,
        num_slots: slotCount(row.num_slots),
        slot_groups: parseSlotGroups(row.slot_groups),
        allowed_cable_group: row.allowed_cable_group || '',
        shape: row.shape || 'STR',
        raceway_type: 'tray'
    };
}

export function buildCableOptionsCsv(cables = []) {
    const optional = value => (value !== undefined ? value : '');
    const rows = cables.map(cable => {
        const start = Array.isArray(cable.start) ? cable.start : [];
        const end = Array.isArray(cable.end) ? cable.end : [];
        return [
            cable.name || '', cable.start_tag || '', cable.end_tag || '', cable.cable_type || '',
            optional(cable.conductors), cable.conductor_size || '', optional(cable.diameter), optional(cable.weight),
            cable.allowed_cable_group || '', start[0], start[1], start[2], end[0], end[1], end[2]
        ];
    });
    return buildCsvText(primaryHeaders(CABLE_TEMPLATE_HEADERS), rows);
}

/**
 * route_data.csv / route_data.xlsx columns. Lengths and coordinates are always
 * written in feet (the routing model's unit), whatever the display unit system.
 * Length headers carry "(ft)" using labels the Pull Cards importer accepts;
 * coordinate headers keep the start_x … end_z names that importer requires.
 */
export const ROUTE_SEGMENT_COLUMNS = Object.freeze([
    ['cable_tag', 'cable_tag'],
    ['segment_order', 'segment_order'],
    ['element_type', 'element_type'],
    ['element_id', 'element_id'],
    ['length', 'Length (ft)'],
    ['cumulative_length', 'Cumulative Length (ft)'],
    ['start_x', 'start_x'],
    ['start_y', 'start_y'],
    ['start_z', 'start_z'],
    ['end_x', 'end_x'],
    ['end_y', 'end_y'],
    ['end_z', 'end_z'],
    ['reason_codes', 'reason_codes']
]);

export const ROUTE_SUMMARY_COLUMNS = Object.freeze([
    ['cable_tag', 'cable_tag'],
    ['total_length', 'Total Length (ft)'],
    ['field_length', 'Field Length (ft)'],
    ['segments_count', 'segments_count'],
    ['reason_codes', 'reason_codes']
]);

/** Re-key rows to their export header labels, in column order, for json_to_sheet. */
export function labelRouteRows(rows = [], columns = ROUTE_SEGMENT_COLUMNS) {
    return rows.map(row => Object.fromEntries(columns.map(([key, label]) => [label, row[key] ?? ''])));
}

export function buildRouteDataCsv(segmentRows = []) {
    const headers = ROUTE_SEGMENT_COLUMNS.map(([, label]) => label);
    const rows = segmentRows.map(row => ROUTE_SEGMENT_COLUMNS.map(([key]) => row[key] ?? ''));
    return buildCsvText(headers, rows);
}
