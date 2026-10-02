import { kpiStripHtml } from './resultViz.mjs';

const toNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Summarise cable rows into KPI items and a voltage-class mix. */
export function summarizeCables(cables) {
  const rows = Array.isArray(cables) ? cables : [];
  let totalLength = 0;
  let missing = 0;
  const voltageMix = new Map();
  rows.forEach(cable => {
    const length = toNumber(cable?.length);
    const voltage = toNumber(cable?.operating_voltage);
    if (length === null || length <= 0 || voltage === null) missing += 1;
    if (length !== null && length > 0) totalLength += length;
    const label = voltage === null ? 'Unspecified' : voltage > 1000 ? 'Medium voltage' : voltage > 50 ? 'Low voltage' : 'Control / signal';
    voltageMix.set(label, (voltageMix.get(label) || 0) + 1);
  });
  return { count: rows.length, totalLength, missing, voltageMix: Object.fromEntries(voltageMix) };
}

export function cableSummaryHtml(cables) {
  const s = summarizeCables(cables);
  if (!s.count) return '';
  const mix = Object.entries(s.voltageMix).map(([label, n]) => `${label} ${n}`).join(' · ');
  return kpiStripHtml([
    { label: 'Cables', value: String(s.count), status: 'info', hint: mix },
    { label: 'Total length', value: `${Math.round(s.totalLength).toLocaleString()} ft`, status: 'info' },
    { label: 'Missing length or voltage', value: String(s.missing), status: s.missing ? 'warn' : 'pass', hint: s.missing ? 'Complete these before routing' : 'Ready for routing' },
  ]);
}

export function racewaySummaryHtml({ trays = [], conduits = [], ductbanks = [] } = {}) {
  const total = trays.length + conduits.length + ductbanks.length;
  if (!total) return '';
  return kpiStripHtml([
    { label: 'Cable trays', value: String(trays.length), status: 'info' },
    { label: 'Conduits', value: String(conduits.length), status: 'info' },
    { label: 'Ductbanks', value: String(ductbanks.length), status: 'info' },
  ]);
}
