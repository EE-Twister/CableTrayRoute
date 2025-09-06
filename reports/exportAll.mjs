import { jsPDF } from 'jspdf';
import { toCSV } from './reporting.mjs';
import { generateArcFlashLabel } from './labels.mjs';
import * as dataStore from '../dataStore.mjs';

let branding = { title: 'Project Report', logo: null, company: '' };
// Default template builder
let pdfTemplate = (ctx) => {
  const lines = [];
  if (ctx.company) lines.push(ctx.company);
  ctx.sections.forEach(sec => {
    lines.push(sec.title);
    sec.rows.forEach(row => {
      const line = sec.headers.map(h => row[h] ?? '').join(', ');
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
export function setReportTemplate(tpl) {
  if (typeof tpl === 'function') pdfTemplate = tpl;
  else if (typeof tpl === 'string') {
    pdfTemplate = ctx => tpl
      .replace(/{{\s*title\s*}}/g, ctx.title || '')
      .replace(/{{\s*company\s*}}/g, ctx.company || '');
  }
}

function buildSections(data = {}) {
  const sections = [];
  if (Array.isArray(data.equipment) && data.equipment.length) {
    const headers = Object.keys(data.equipment[0]);
    sections.push({ title: 'Equipment Schedule', headers, rows: data.equipment });
  }
  if (Array.isArray(data.panels) && data.panels.length) {
    const headers = Object.keys(data.panels[0]);
    sections.push({ title: 'Panel Schedule', headers, rows: data.panels });
  }
  if (Array.isArray(data.cables) && data.cables.length) {
    const headers = Object.keys(data.cables[0]);
    sections.push({ title: 'Cable Schedule', headers, rows: data.cables });
  }
  if (data.analyses) {
    Object.entries(data.analyses).forEach(([name, rows]) => {
      let arr = rows;
      if (!Array.isArray(rows) && rows && typeof rows === 'object') {
        arr = Object.entries(rows).map(([id, val]) => {
          if (typeof val === 'object' && !Array.isArray(val)) return { id, ...val };
          return { id, value: Array.isArray(val) ? val.join('; ') : val };
        });
      }
      if (Array.isArray(arr) && arr.length) {
        const headers = Object.keys(arr[0]);
        sections.push({ title: `${name} Analysis`, headers, rows: arr });
      }
    });
  }
  if (Array.isArray(data.tcc) && data.tcc.length) {
    const headers = Object.keys(data.tcc[0]);
    sections.push({ title: 'TCC Plots', headers, rows: data.tcc });
  }
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
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

class SimpleZip {
  constructor() { this.entries = []; }
  file(name, data) {
    if (typeof data === 'string') data = new TextEncoder().encode(data);
    this.entries.push({ name, data });
  }
  async generateAsync({ type = 'nodebuffer' } = {}) {
    const fileRecords = [];
    const central = [];
    let offset = 0;
    this.entries.forEach(entry => {
      const nameBuf = Buffer.from(entry.name);
      const content = Buffer.from(entry.data);
      const crc = crc32(content);
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0, 6);
      header.writeUInt16LE(0, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(0, 12);
      header.writeUInt32LE(crc, 14);
      header.writeUInt32LE(content.length, 18);
      header.writeUInt32LE(content.length, 22);
      header.writeUInt16LE(nameBuf.length, 26);
      header.writeUInt16LE(0, 28);
      fileRecords.push(header, nameBuf, content);

      const centralHdr = Buffer.alloc(46);
      centralHdr.writeUInt32LE(0x02014b50, 0);
      centralHdr.writeUInt16LE(20, 4);
      centralHdr.writeUInt16LE(20, 6);
      centralHdr.writeUInt16LE(0, 8);
      centralHdr.writeUInt16LE(0, 10);
      centralHdr.writeUInt16LE(0, 12);
      centralHdr.writeUInt16LE(0, 14);
      centralHdr.writeUInt32LE(crc, 16);
      centralHdr.writeUInt32LE(content.length, 20);
      centralHdr.writeUInt32LE(content.length, 24);
      centralHdr.writeUInt16LE(nameBuf.length, 28);
      centralHdr.writeUInt16LE(0, 30);
      centralHdr.writeUInt16LE(0, 32);
      centralHdr.writeUInt16LE(0, 34);
      centralHdr.writeUInt16LE(0, 36);
      centralHdr.writeUInt32LE(0, 38);
      centralHdr.writeUInt32LE(offset, 42);
      central.push(centralHdr, nameBuf);
      offset += header.length + nameBuf.length + content.length;
    });
    const centralBuf = Buffer.concat(central);
    const eocdr = Buffer.alloc(22);
    eocdr.writeUInt32LE(0x06054b50, 0);
    eocdr.writeUInt16LE(0, 4);
    eocdr.writeUInt16LE(0, 6);
    eocdr.writeUInt16LE(this.entries.length, 8);
    eocdr.writeUInt16LE(this.entries.length, 10);
    eocdr.writeUInt32LE(centralBuf.length, 12);
    eocdr.writeUInt32LE(offset, 16);
    eocdr.writeUInt16LE(0, 20);
    const out = Buffer.concat([...fileRecords, centralBuf, eocdr]);
    if (type === 'blob') return new Blob([out]);
    if (type === 'arraybuffer') return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    return out;
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
  const sections = buildSections(data);
  const zip = new SimpleZip();

  // Build PDF content
  const doc = new jsPDF();
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
    const name = sec.title.toLowerCase().replace(/\s+/g, '_') + '.csv';
    zip.file(name, csv);
  });

  // Arc flash labels
  if (data.arcFlash) {
    Object.entries(data.arcFlash).forEach(([id, info]) => {
      const svg = generateArcFlashLabel({
        equipment: id,
        incidentEnergy: info.incidentEnergy,
        boundary: info.boundary
      });
      zip.file(`arcflash_${id}.svg`, svg);
    });
  }
  return zip;
}

/**
 * Gather data from the data store and trigger download of all reports as zip.
 */
export async function exportAllReports() {
  const data = {
    equipment: dataStore.getEquipment(),
    panels: dataStore.getPanels ? dataStore.getPanels() : [],
    cables: dataStore.getCables(),
    analyses: dataStore.getStudies(),
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
