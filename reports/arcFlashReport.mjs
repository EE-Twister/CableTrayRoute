import { downloadCSV, downloadPDF } from './reporting.mjs';
import { generateArcFlashLabel } from './labels.mjs';

const LABEL_SHEET_STYLE = `
  body { margin: 0; padding: 16px; font-family: Helvetica, Arial, sans-serif; background: #f5f5f5; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 13px; color: #555; margin: 0 0 12px; }
  .no-print { display: inline-block; margin-bottom: 16px; padding: 8px 20px; font-size: 14px; background: #1565c0; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  .label-grid { display: grid; grid-template-columns: repeat(2, 6in); gap: 0.25in; }
  .label-cell { break-inside: avoid; background: #fff; }
  .label-cell svg { display: block; width: 6in; height: 4in; }
  @media print {
    body { background: #fff; padding: 0; }
    h1, .meta, .no-print { display: none; }
    .label-grid { grid-template-columns: repeat(2, 6in); gap: 0; }
    @page { margin: 0.5in; size: landscape; }
  }
`;

const MM_PER_INCH = 25.4;

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatVoltage(voltage) {
  if (!Number.isFinite(voltage) || voltage <= 0) return 'Not Specified';
  if (voltage >= 1000) {
    const kv = voltage / 1000;
    return `${round(kv, kv >= 10 ? 1 : 2)} kV`;
  }
  return `${round(voltage, 0)} V`;
}

function formatDistanceVerbose(mm) {
  if (!Number.isFinite(mm) || mm <= 0) return 'Not Applicable';
  const inchesTotal = mm / MM_PER_INCH;
  const feet = Math.floor(inchesTotal / 12);
  const inches = inchesTotal - feet * 12;
  if (feet > 0) {
    const inchesRounded = round(inches, 1);
    const inchesText = inchesRounded === 0 ? '' : ` ${inchesRounded.toFixed(inchesRounded % 1 ? 1 : 0)} in`;
    return `${feet} ft${inchesText} (${round(mm, 0)} mm)`;
  }
  const inchesRounded = round(inchesTotal, 1);
  return `${inchesRounded.toFixed(inchesRounded % 1 ? 1 : 0)} in (${round(mm, 0)} mm)`;
}

function formatDistanceShort(mm) {
  if (!Number.isFinite(mm) || mm <= 0) return 'N/A';
  const inchesTotal = mm / MM_PER_INCH;
  const feet = Math.floor(inchesTotal / 12);
  const inches = round(inchesTotal - feet * 12, 1);
  if (feet > 0) {
    if (!inches) return `${feet} ft`;
    return `${feet} ft ${inches.toFixed(inches % 1 ? 1 : 0)} in`;
  }
  return `${inches.toFixed(inches % 1 ? 1 : 0)} in`;
}

function formatApproach(mm) {
  if (!Number.isFinite(mm) || mm <= 0) return 'Not Applicable';
  return formatDistanceVerbose(mm);
}

function formatIncidentEnergy(energy, workingDistance) {
  if (!Number.isFinite(energy)) return 'Not Calculated';
  const distance = formatDistanceShort(workingDistance);
  return `${round(energy, 2).toFixed(2)} cal/cm² @ ${distance}`;
}

function formatPpeCategory(ppeCategory) {
  if (!Number.isFinite(ppeCategory)) return 'N/A';
  return ppeCategory.toString();
}

function resolveStudyDate(info) {
  if (info?.studyDate) return info.studyDate;
  return new Date().toISOString().split('T')[0];
}

function safeEntries(results = {}) {
  return Object.entries(results).filter(([key, value]) => {
    return key && typeof value === 'object' && value !== null && !key.startsWith('_');
  });
}

function sanitizeFileName(value, fallback = 'equipment') {
  if (typeof value !== 'string') {
    if (value && typeof value.toString === 'function') {
      value = value.toString();
    } else {
      value = fallback;
    }
  }
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = normalized.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

export function getArcFlashLabelBaseName(id, info = {}) {
  const tag = info.equipmentTag || info.tag || info.name || info.label || id || 'equipment';
  return sanitizeFileName(tag, id || 'equipment');
}

export function buildArcFlashLabelData(id, info = {}) {
  const incidentEnergy = Number.isFinite(info.incidentEnergy) ? info.incidentEnergy : NaN;
  const signalWord = incidentEnergy >= 40 ? 'DANGER' : 'WARNING';
  const signalColor = signalWord === 'DANGER' ? '#d32f2f' : '#f57c00';
  const equipmentTag = info.equipmentTag || id || 'Unnamed Equipment';
  const voltage = formatVoltage(info.nominalVoltage);
  const workingDistanceVerbose = formatDistanceVerbose(info.workingDistance);
  const boundary = formatDistanceVerbose(info.boundary);
  const limited = formatApproach(info.limitedApproach);
  const restricted = formatApproach(info.restrictedApproach);
  const incidentEnergyText = formatIncidentEnergy(info.incidentEnergy, info.workingDistance);
  const studyDate = resolveStudyDate(info);
  return {
    signalWord,
    signalColor,
    equipmentTag,
    voltage,
    incidentEnergy: incidentEnergyText,
    arcFlashBoundary: boundary,
    limitedApproach: limited,
    restrictedApproach: restricted,
    upstreamDevice: info.upstreamDevice || 'Not Specified',
    studyDate,
    ppeCategory: formatPpeCategory(info.ppeCategory),
    workingDistance: workingDistanceVerbose
  };
}

/**
 * Build a print-ready HTML document containing all NFPA 70E arc flash labels
 * arranged in a 2-column grid suitable for printing on label stock (6"×4" per label).
 * @param {Object<string, object>} results - Arc flash results keyed by component ID
 * @param {string} [projectName] - Optional project name shown in the page heading
 * @returns {string} Full HTML document string
 */
export function buildLabelSheetHtml(results = {}, projectName = '') {
  const entries = safeEntries(results);
  const date = new Date().toISOString().split('T')[0];
  const heading = projectName ? `Arc Flash Warning Labels — ${projectName}` : 'Arc Flash Warning Labels';

  const labelCells = entries.map(([id, info]) => {
    const data = buildArcFlashLabelData(id, info);
    const svg = generateArcFlashLabel(data);
    return `<div class="label-cell">${svg}</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Arc Flash Labels</title>
<style>${LABEL_SHEET_STYLE}</style>
</head>
<body>
<h1>${heading}</h1>
<p class="meta">Generated: ${date} &nbsp;|&nbsp; ${entries.length} label(s)</p>
<button class="no-print" onclick="window.print()">Print All Labels</button>
<div class="label-grid">
${labelCells}
</div>
</body>
</html>`;
}

/**
 * Open a new browser window containing a print-ready NFPA 70E label sheet.
 * @param {Object<string, object>} results - Arc flash results keyed by component ID
 * @param {string} [projectName] - Optional project name for the page heading
 * @returns {Window|null} The opened window, or null if blocked
 */
export function openLabelPrintWindow(results = {}, projectName = '') {
  const html = buildLabelSheetHtml(results, projectName);
  const win = window.open('', '_blank');
  if (!win) return null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}

/**
 * Generate CSV and PDF reports from arc flash analysis results.
 * @param {Object<string, {incidentEnergy:number, ppeCategory:number, boundary:number, clearingTime:number}>} results
 */
export function generateArcFlashReport(results = {}) {
  const entries = safeEntries(results);
  const headers = [
    'bus',
    'equipmentTag',
    'nominalVoltage',
    'incidentEnergy',
    'ppeCategory',
    'boundary',
    'clearingTime',
    'workingDistance',
    'limitedApproach',
    'restrictedApproach',
    'upstreamDevice',
    'studyDate'
  ];
  const rows = entries.map(([id, data]) => ({
    bus: id,
    equipmentTag: data.equipmentTag || id,
    nominalVoltage: data.nominalVoltage ?? '',
    incidentEnergy: data.incidentEnergy,
    ppeCategory: data.ppeCategory,
    boundary: data.boundary,
    clearingTime: data.clearingTime,
    workingDistance: data.workingDistance ?? '',
    limitedApproach: data.limitedApproach ?? '',
    restrictedApproach: data.restrictedApproach ?? '',
    upstreamDevice: data.upstreamDevice || '',
    studyDate: resolveStudyDate(data)
  }));
  if (!rows.length) return;
  downloadCSV(headers, rows, 'arcflash.csv');
  downloadPDF('Arc Flash Report', headers, rows, 'arcflash.pdf');
  // export individual labels
  entries.forEach(([id, info]) => {
    const svg = generateArcFlashLabel(buildArcFlashLabelData(id, info));
    const baseName = getArcFlashLabelBaseName(id, info);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${baseName}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  });
}
