import { downloadCSV, downloadPDF } from './reporting.mjs';
import { generateArcFlashLabel } from './labels.mjs';

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
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${id}_label.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  });
}
