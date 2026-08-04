import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultReportPath = path.join(ROOT, 'output', 'playwright', 'performance', 'performance-report.json');
let reportPathArgument = '';
let baselinePathArgument = '';
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--baseline') baselinePathArgument = process.argv[++index] || '';
  else if (process.argv[index] === '--report') reportPathArgument = process.argv[++index] || '';
  else if (!process.argv[index].startsWith('--') && !reportPathArgument) reportPathArgument = process.argv[index];
}
const reportPath = path.resolve(reportPathArgument || defaultReportPath);
const baselinePath = baselinePathArgument ? path.resolve(baselinePathArgument) : '';

function formatDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) ? `${duration.toFixed(1)} ms` : 'missing';
}

function formatHeap(value) {
  const bytes = Number(value);
  return Number.isFinite(bytes) ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB` : 'missing';
}

function formatDelta(value, formatter) {
  const delta = Number(value);
  if (!Number.isFinite(delta)) return '—';
  const prefix = delta > 0 ? '+' : '';
  return `${prefix}${formatter(delta)}`;
}

function durationDelta(value) {
  return `${Number(value).toFixed(1)} ms`;
}

function heapDelta(value) {
  return `${(Number(value) / (1024 * 1024)).toFixed(1)} MiB`;
}

function statusLabel(passed) {
  return passed ? 'PASS' : 'FAIL';
}

async function readJson(filePath) {
  if (!filePath) return null;
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8');
    return;
  }
  console.log(markdown);
}

const report = await readJson(reportPath);
if (!report) {
  await writeSummary('## Browser performance contracts\n\nNo performance report was produced.\n');
  process.exit(0);
}
const baseline = await readJson(baselinePath);
const baselineEvaluations = new Map((baseline?.evaluations || []).map(item => [item.name, item]));
const baselineProfiles = new Map((baseline?.profileEvaluations || []).map(item => [item.name, item]));

const lines = [
  '## Browser performance contracts',
  '',
  `Overall: **${statusLabel(report.passed)}** · Browser: ${report.browser || 'unknown'} · Generated: ${report.generatedAt || 'unknown'}`,
  baseline ? `Baseline: ${baseline.generatedAt || 'unknown'} (${path.basename(path.dirname(baselinePath))})` : 'Baseline: unavailable; deltas will appear after a successful base-branch run.',
  '',
  '### Timed workflows',
  '',
  '| Metric | Result | Measured | Budget | Previous | Δ |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
];

(report.evaluations || []).forEach(evaluation => {
  const previous = baselineEvaluations.get(evaluation.name);
  const delta = previous ? evaluation.durationMs - previous.durationMs : Number.NaN;
  lines.push(`| \`${evaluation.name}\` | ${statusLabel(evaluation.passed)} | ${formatDuration(evaluation.durationMs)} | ${formatDuration(evaluation.maxMs)} | ${previous ? formatDuration(previous.durationMs) : '—'} | ${formatDelta(delta, durationDelta)} |`);
});

lines.push(
  '',
  '### Repeated-operation profiles',
  '',
  '| Profile | Result | Duration | Δ duration | Longest task | Heap growth | Δ heap | Storage reads |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
);

(report.profileEvaluations || []).forEach(evaluation => {
  const previous = baselineProfiles.get(evaluation.name);
  const durationChange = previous ? evaluation.durationMs - previous.durationMs : Number.NaN;
  const heapChange = previous ? evaluation.heapGrowthBytes - previous.heapGrowthBytes : Number.NaN;
  lines.push(`| \`${evaluation.name}\` | ${statusLabel(evaluation.passed)} | ${formatDuration(evaluation.durationMs)} | ${formatDelta(durationChange, durationDelta)} | ${formatDuration(evaluation.longestTaskMs)} | ${formatHeap(evaluation.heapGrowthBytes)} | ${formatDelta(heapChange, heapDelta)} | ${Number(evaluation.storageReads) || 0} |`);
});

const failedStartups = (report.routeStartupEvaluations || []).filter(evaluation => !evaluation.passed);
lines.push('', `Route startup contracts: **${failedStartups.length ? `FAIL (${failedStartups.length})` : 'PASS'}**.`);
if (failedStartups.length) {
  failedStartups.forEach(evaluation => lines.push(`- \`${evaluation.route}\`: ${(evaluation.failures || []).join('; ')}`));
}
lines.push('');

await writeSummary(`${lines.join('\n')}\n`);
