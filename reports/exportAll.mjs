import { toCSV } from './reporting.mjs';
import { generateArcFlashLabel } from './labels.mjs';
import { buildArcFlashLabelData, getArcFlashLabelBaseName, isArcFlashLabelReady } from './arcFlashReport.mjs';
import * as dataStore from '../dataStore.mjs';
import { decorateStudyRows, studyMetadataColumns } from '../analysis/studyResultContext.mjs';

let jsPDF = null;
const loadScriptPromises = new Map();

async function loadScript(url, globalTest) {
  if (globalTest()) return;
  if (!loadScriptPromises.has(url)) {
    loadScriptPromises.set(url, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    }));
  }
  await loadScriptPromises.get(url);
}

async function ensureJsPDF() {
  if (jsPDF) return jsPDF;
  await loadScript('dist/vendor/jspdf.umd.min.js', () => Boolean(window.jspdf?.jsPDF));
  jsPDF = window.jspdf?.jsPDF;
  if (typeof jsPDF !== 'function') {
    throw new Error('jsPDF library is not loaded');
  }
  return jsPDF;
}

function getJsPDFConstructor() {
  if (jsPDF) return jsPDF;
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const ctor = globalScope.jspdf?.jsPDF;
  if (typeof ctor !== 'function') {
    throw new Error('jsPDF library is not loaded');
  }
  jsPDF = ctor;
  return jsPDF;
}

async function ensureHandlebars() {
  if (window.Handlebars) return window.Handlebars;
  await loadScript('dist/vendor/handlebars.min.js', () => Boolean(window.Handlebars));
  if (!window.Handlebars) {
    throw new Error('Handlebars library is not loaded');
  }
  return window.Handlebars;
}

let branding = { title: 'Project Report', logo: null, company: '' };
const printableCell = value => {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  try { return JSON.stringify(value); } catch (_) { return String(value); }
};
// Default template builder
let pdfTemplate = (ctx) => {
  const lines = [];
  if (ctx.company) lines.push(ctx.company);
  ctx.sections.forEach(sec => {
    lines.push(sec.title);
    sec.rows.forEach(row => {
      const line = sec.headers.map(h => printableCell(row[h])).join(', ');
      lines.push(line);
    });
    lines.push('');
  });
  return lines.join('\n');
};

/** Set branding information */
export function setBranding(opts = {}) {
  branding = { ...branding, ...opts };
}

/**
 * Set a custom template. Accepts either a function `(ctx)=>string` or a simple
 * template string with `{{title}}` and `{{company}}` tokens.
 */
export async function setReportTemplate(tpl) {
  if (typeof tpl === 'function') {
    pdfTemplate = tpl;
    return;
  }
  if (typeof tpl === 'string') {
    try {
      const Handlebars = await ensureHandlebars();
      const compiled = Handlebars.compile(tpl);
      pdfTemplate = ctx => compiled(ctx);
    } catch {
      pdfTemplate = ctx => tpl
        .replace(/{{\s*title\s*}}/g, ctx.title || '')
        .replace(/{{\s*company\s*}}/g, ctx.company || '');
    }
  }
}

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isPrivateKey = key => String(key).startsWith('_');

/**
 * Headers are the union of every row's keys in first-seen order, so a column
 * carried only by later rows (per-bus notes, required inputs) is not dropped.
 */
function unionHeaders(rows = [], extra = []) {
  const headers = new Set();
  rows.forEach(row => {
    if (isPlainObject(row)) Object.keys(row).forEach(key => headers.add(key));
  });
  extra.forEach(key => headers.add(key));
  return [...headers];
}

function scheduleSection(title, rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return { title, headers: unionHeaders(rows), rows };
}

// Study results saved as an object keep their table rows in named fields.
// The first field keeps the `<study> Analysis` name; later fields get their
// own CSV. Studies not listed here fall back to `results`/`rows` arrays or to
// a map keyed by id.
const STUDY_ROW_SOURCES = Object.freeze({
  voltageDropStudy: [{ key: 'results' }],
  loadFlow: [{ key: 'buses' }, { key: 'lines', title: 'Branch Flows' }],
  motorStart: [{ key: 'results' }],
  reliability: [{ key: 'componentStats' }],
});
const GENERIC_ROW_KEYS = ['results', 'rows'];

// Row identity survives withholding so a withheld row still names its cable,
// bus or branch.
const STUDY_ROW_IDENTITY_KEYS = ['tag', 'name', 'ref', 'displayLabel', 'fromLabel', 'toLabel', 'componentId', 'equipmentTag'];

function withoutPrivateKeys(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !isPrivateKey(key)));
}

function keyedStudyRow(id, entry) {
  if (isPlainObject(entry)) return { id, ...withoutPrivateKeys(entry) };
  if (Array.isArray(entry) && entry.every(item => item === null || typeof item !== 'object')) {
    return { id, value: entry.join('; ') };
  }
  return { id, value: entry };
}

function studyCollectionRows(collection) {
  if (Array.isArray(collection)) {
    return collection
      .filter(entry => entry != null)
      .map(entry => (isPlainObject(entry) ? withoutPrivateKeys(entry) : { value: entry }));
  }
  if (isPlainObject(collection)) {
    return Object.entries(collection)
      .filter(([id]) => !isPrivateKey(id))
      .map(([id, entry]) => keyedStudyRow(id, entry));
  }
  return [];
}

/** Expand one saved study result into one or more `{ title, rows }` tables. */
function buildStudyTables(studyKey, result) {
  if (Array.isArray(result)) return [{ title: '', rows: studyCollectionRows(result) }];
  if (!isPlainObject(result)) return [];
  const sources = (STUDY_ROW_SOURCES[studyKey] || []).filter(source => result[source.key] != null);
  if (sources.length) {
    return sources.map(source => ({ title: source.title || '', rows: studyCollectionRows(result[source.key]) }));
  }
  const genericKey = GENERIC_ROW_KEYS.find(key => Array.isArray(result[key]));
  if (genericKey) return [{ title: '', rows: studyCollectionRows(result[genericKey]) }];
  return [{ title: '', rows: studyCollectionRows(result) }];
}

function buildSections(data = {}) {
  const sections = [
    scheduleSection('Equipment Schedule', data.equipment),
    scheduleSection('Panel Schedule', data.panels),
    scheduleSection('Cable Schedule', data.cables),
  ].filter(Boolean);
  if (isPlainObject(data.analyses)) {
    Object.entries(data.analyses)
      .filter(([name]) => !isPrivateKey(name))
      .forEach(([name, result]) => {
        const assessment = data.studyAssessments?.[name];
        buildStudyTables(name, result).forEach(table => {
          if (!table.rows.length) return;
          const reportRows = assessment
            ? decorateStudyRows(table.rows, assessment, { preserve: STUDY_ROW_IDENTITY_KEYS })
            : table.rows;
          const headers = unionHeaders(reportRows, assessment ? studyMetadataColumns() : []);
          const title = table.title ? `${name} ${table.title} Analysis` : `${name} Analysis`;
          sections.push({ title, headers, rows: reportRows });
        });
      });
  }
  if (data.studyAssessments && Object.keys(data.studyAssessments).length) {
    const rows = Object.values(data.studyAssessments).map(assessment => ({
      studyKey: assessment.studyKey,
      present: assessment.present,
      validity: assessment.validity?.state || assessment.validity || 'unevaluated',
      freshness: assessment.freshness || 'unknown',
      eligible: assessment.eligible === true ? 'eligible' : 'withheld',
      resultStatus: assessment.label || 'Freshness unknown',
      calculationVersion: assessment.calculationVersion || null,
      calculatedAt: assessment.runAt || null,
      source: assessment.source || null,
      inputSources: assessment.inputSources || {},
      assumptions: assessment.assumptions || [],
      limitations: assessment.limitations || [],
      units: assessment.units || {},
      warnings: assessment.warnings || [],
      studyOptions: assessment.studyOptions || {},
      provenance: assessment.provenance || {},
    }));
    sections.push({
      title: 'Study Result Lifecycle Index',
      headers: unionHeaders(rows),
      rows,
    });
  }
  const tccSection = scheduleSection('TCC Plots', data.tcc);
  if (tccSection) sections.push(tccSection);
  return sections;
}

// Minimal CRC32 implementation
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function sanitizeZipFileName(name, fallback = 'report') {
  const raw = String(name || '');
  const normalized = raw.replace(/\\/g, '/').split('/').pop() || '';
  const stripped = normalized
    .replace(/\.\.+/g, '.')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.\-]+|[_\.\-]+$/g, '');
  return stripped || fallback;
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const textEncoder = new TextEncoder();

// Entry data arrives as text (CSV/SVG) or as jsPDF's ArrayBuffer; store bytes.
function toZipBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return textEncoder.encode(data == null ? '' : String(data));
}

// MS-DOS date/time fields; ZIP cannot represent dates before 1980.
function toDosDateTime(value) {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;

/**
 * Write a stored (uncompressed) ZIP archive with typed arrays only, so the
 * same code runs in browsers and Node without the Node `Buffer` global.
 */
function buildZipBytes(entries, modified) {
  if (entries.length > 0xffff) throw new Error('Too many files for a ZIP archive.');
  const stamp = toDosDateTime(modified);
  const records = entries.map(entry => {
    const name = textEncoder.encode(entry.name);
    const content = toZipBytes(entry.data);
    return { name, content, crc: crc32(content), offset: 0 };
  });
  const localSize = records.reduce((sum, record) => sum + LOCAL_HEADER_SIZE + record.name.length + record.content.length, 0);
  const centralSize = records.reduce((sum, record) => sum + CENTRAL_HEADER_SIZE + record.name.length, 0);
  if (localSize + centralSize > 0xffffffff) throw new Error('Report bundle is too large for a ZIP archive.');
  const out = new Uint8Array(localSize + centralSize + END_OF_CENTRAL_DIRECTORY_SIZE);
  const view = new DataView(out.buffer);
  let offset = 0;
  records.forEach(record => {
    record.offset = offset;
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, stamp.time, true);
    view.setUint16(offset + 12, stamp.date, true);
    view.setUint32(offset + 14, record.crc, true);
    view.setUint32(offset + 18, record.content.length, true);
    view.setUint32(offset + 22, record.content.length, true);
    view.setUint16(offset + 26, record.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(record.name, offset + LOCAL_HEADER_SIZE);
    out.set(record.content, offset + LOCAL_HEADER_SIZE + record.name.length);
    offset += LOCAL_HEADER_SIZE + record.name.length + record.content.length;
  });
  const centralStart = offset;
  records.forEach(record => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, stamp.time, true);
    view.setUint16(offset + 14, stamp.date, true);
    view.setUint32(offset + 16, record.crc, true);
    view.setUint32(offset + 20, record.content.length, true);
    view.setUint32(offset + 24, record.content.length, true);
    view.setUint16(offset + 28, record.name.length, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, record.offset, true);
    out.set(record.name, offset + CENTRAL_HEADER_SIZE);
    offset += CENTRAL_HEADER_SIZE + record.name.length;
  });
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, records.length, true);
  view.setUint16(offset + 10, records.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true);
  return out;
}

class SimpleZip {
  constructor() { this.entries = []; }
  file(name, data) {
    const safeName = sanitizeZipFileName(name);
    const used = new Set(this.entries.map(entry => entry.name));
    let uniqueName = safeName;
    const dot = safeName.lastIndexOf('.');
    const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
    const ext = dot > 0 ? safeName.slice(dot) : '';
    for (let counter = 2; used.has(uniqueName); counter += 1) uniqueName = `${stem}_${counter}${ext}`;
    this.entries.push({ name: uniqueName, data: toZipBytes(data) });
  }
  /**
   * @param {{type?: 'uint8array'|'arraybuffer'|'blob', date?: Date}} [options]
   */
  async generateAsync({ type = 'uint8array', date } = {}) {
    const bytes = buildZipBytes(this.entries, date);
    if (type === 'uint8array') return bytes;
    if (type === 'arraybuffer') return bytes.buffer;
    if (type === 'blob') return new Blob([bytes], { type: 'application/zip' });
    throw new Error(`Unsupported ZIP output type: ${type}`);
  }
  get files() {
    const map = {};
    this.entries.forEach(e => { map[e.name] = e; });
    return map;
  }
}

/**
 * Build a zip file containing consolidated PDF, CSVs, and arc-flash labels.
 */
export function buildReportZip(data = {}) {
  const JsPDF = getJsPDFConstructor();
  const sections = buildSections(data);
  const zip = new SimpleZip();

  // Build PDF content
  const doc = new JsPDF();
  let y = 10;
  if (branding.logo) {
    try { doc.addImage(branding.logo, 'PNG', 10, 10, 30, 15); } catch {}
    y += 20;
  }
  doc.setFontSize(16);
  doc.text(branding.title || 'Report', 10, y);
  y += 10;
  doc.setFontSize(10);
  const text = pdfTemplate({ ...branding, sections });
  text.split('\n').forEach(line => {
    if (y > 270) { doc.addPage(); y = 10; }
    doc.text(line, 10, y);
    y += 6;
  });
  zip.file('reports.pdf', doc.output('arraybuffer'));

  // Add CSVs for each section
  sections.forEach(sec => {
    const csv = toCSV(sec.headers, sec.rows);
    const baseName = sanitizeZipFileName(sec.title.toLowerCase().replace(/\s+/g, '_'), 'analysis');
    zip.file(`${baseName}.csv`, csv);
  });

  // Arc flash labels
  const usedLabelNames = new Set();
  if (data.arcFlash) {
    Object.entries(data.arcFlash)
      .filter(([key, value]) => key && typeof value === 'object' && value !== null && !key.startsWith('_')
        && data.studyAssessments?.arcFlash?.eligible !== false
        && isArcFlashLabelReady(value))
      .forEach(([id, info]) => {
        const svg = generateArcFlashLabel(buildArcFlashLabelData(id, info));
        const baseName = getArcFlashLabelBaseName(id, info);
        let fileName = `${baseName}.svg`;
        let counter = 2;
        while (usedLabelNames.has(fileName)) {
          fileName = `${baseName}_${counter}.svg`;
          counter += 1;
        }
        usedLabelNames.add(fileName);
        zip.file(fileName, svg);
      });
  }
  return zip;
}

/**
 * Gather data from the data store and trigger download of all reports as zip.
 */
export async function exportAllReports() {
  await ensureJsPDF();
  const data = {
    equipment: dataStore.getEquipment(),
    panels: dataStore.getPanels ? dataStore.getPanels() : [],
    cables: dataStore.getCables(),
    analyses: dataStore.getStudies(),
    studyAssessments: dataStore.getStudyAssessments(),
    arcFlash: (dataStore.getStudies().arcFlash) || {}
  };
  const zip = buildReportZip(data);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'reports.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
