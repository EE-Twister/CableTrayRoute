import fs from 'node:fs/promises';
import path from 'node:path';

import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = path.resolve('.');
const candidatePath = path.join(root, 'docs', 'protective-device-research-candidates-smu20-2026-08-12.json');
const batch = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
const outputDir = path.join(root, 'outputs', '019ff634-ad72-7a30-a116-8938931b0346');
const outputPath = path.join(outputDir, 'SMU20-qualified-human-review-handoff.xlsx');

await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const readme = workbook.worksheets.add('Review Guide');
const candidates = workbook.worksheets.add('Candidates');
const checks = workbook.worksheets.add('Spot Checks');
const tolerance = workbook.worksheets.add('Tolerance');
const sources = workbook.worksheets.add('Sources');

const navy = '#17365D';
const blue = '#D9EAF7';
const paleBlue = '#EEF5FB';
const green = '#E2F0D9';
const amber = '#FFF2CC';
const gray = '#E7E6E6';
const red = '#F4CCCC';
const white = '#FFFFFF';
const dark = '#1F1F1F';
const border = '#B8C4CE';

function titleBand(sheet, title, subtitle, endColumn) {
  sheet.showGridLines = false;
  const titleRange = sheet.getRange(`A1:${endColumn}1`);
  titleRange.merge();
  titleRange.values = [[title]];
  titleRange.format = {
    fill: navy,
    font: { bold: true, color: white, size: 18 },
    rowHeight: 30,
    verticalAlignment: 'center',
  };
  const subtitleRange = sheet.getRange(`A2:${endColumn}2`);
  subtitleRange.merge();
  subtitleRange.values = [[subtitle]];
  subtitleRange.format = {
    fill: paleBlue,
    font: { color: dark, italic: true, size: 10 },
    wrapText: true,
    rowHeight: 34,
    verticalAlignment: 'center',
  };
}

function styleHeader(range) {
  range.format = {
    fill: navy,
    font: { bold: true, color: white },
    borders: { preset: 'all', style: 'thin', color: border },
    wrapText: true,
    verticalAlignment: 'center',
  };
}

function styleBody(range) {
  range.format = {
    borders: { preset: 'all', style: 'thin', color: border },
    verticalAlignment: 'top',
    wrapText: true,
  };
}

titleBand(
  readme,
  'SMU-20 Qualified Human Review Handoff',
  'Technical candidate package only — not licensed-engineer approval, not calculation-ready promotion, and not authorization for coordination settings or arc-flash labels.',
  'F',
);
readme.getRange('A4:B12').values = [
  ['Package field', 'Value'],
  ['Candidate file', 'docs/protective-device-research-candidates-smu20-2026-08-12.json'],
  ['Candidate count', batch.records.length],
  ['Ratings', batch.records.map(record => record.settings.ampRating + 'E').join(', ')],
  ['Manufacturer points', batch.records.flatMap(record => record.curveProfiles).reduce((sum, profile) => sum + profile.curve.length, 0)],
  ['Automated spot checks', batch.records.reduce((sum, record) => sum + record.curveValidation.spotChecks.length, 0)],
  ['Research status', 'candidate'],
  ['Library status', 'screening'],
  ['Remaining production gate', 'Independent qualified human review'],
];
styleHeader(readme.getRange('A4:B4'));
styleBody(readme.getRange('A5:B12'));
readme.getRange('A14:F14').merge();
readme.getRange('A14').values = [['Source identity resolution']];
styleHeader(readme.getRange('A14:F14'));
readme.getRange('A15:F16').merge(true);
readme.getRange('A15:F16').values = [
  ['Bulletin 242-31 is the direct SMD-20/SMU-20 outdoor ordering bulletin and is used for catalog and application provenance.'],
  ['Bulletin 665-31 is a PME pad-mounted-gear bulletin. It is retained as a cross-application source only and is excluded from direct catalog/application field mappings.'],
];
styleBody(readme.getRange('A15:F16'));

readme.getRange('A18:F18').merge();
readme.getRange('A18').values = [['Qualified reviewer checklist']];
styleHeader(readme.getRange('A18:F18'));
readme.getRange('A19:F25').values = [
  ['Review item', 'Automated package status', 'Evidence location', 'Qualified reviewer action', 'Reviewer', 'Review date'],
  ['Catalog/application identity', 'READY FOR REVIEW', 'Candidates + Sources', 'Confirm 242-31 applicability and catalog mapping.', '', ''],
  ['Standards editions', 'READY FOR REVIEW', 'Candidates + Sources', 'Confirm derived C37.41-2016/C37.46-2010 edition mapping and current project basis.', '', ''],
  ['Curve transcription', 'PASS — 522 points retained', 'Spot Checks', 'Independently compare representative points to official spreadsheets/PDF plots.', '', ''],
  ['Tolerance semantics', 'READY FOR REVIEW', 'Tolerance', 'Confirm minimum-melt plus-current and total-clearing minus-only interpretation.', '', ''],
  ['Runtime boundary policy', 'PASS — bounded evaluator', 'Candidates + Spot Checks', 'Confirm lower/upper boundary selection is suitable for intended study workflow.', '', ''],
  ['Promotion decision', 'NOT AUTHORIZED', 'Candidate JSON review block', 'Only after all checks: set reviewed status/reviewer/date and approve controlled canonical replacement.', '', ''],
];
styleHeader(readme.getRange('A19:F19'));
styleBody(readme.getRange('A20:F25'));
readme.getRange('B20:B25').format.fill = amber;
readme.getRange('E20:F25').format.fill = gray;
readme.freezePanes.freezeRows(2);
readme.getRange('A:F').format.columnWidth = 18;
readme.getRange('A:A').format.columnWidth = 28;
readme.getRange('B:B').format.columnWidth = 26;
readme.getRange('C:D').format.columnWidth = 31;
readme.getRange('E:F').format.columnWidth = 16;
readme.getRange('A4:F25').format.autofitRows();

titleBand(candidates, 'SMU-20 Candidate Matrix', 'One row per governed screening candidate. Formula columns reconcile the supporting spot-check sheet.', 'L');
const candidateHeaders = [[
  'Candidate ID', 'Rating', 'Catalog', 'Nominal kV', 'Frequencies', 'Poles',
  'Curve points', 'Spot checks', 'Max relative error', 'Research status', 'Library status', 'Production gate',
]];
candidates.getRange('A4:L4').values = candidateHeaders;
styleHeader(candidates.getRange('A4:L4'));
const candidateRows = batch.records.map((record) => [
  record.id,
  `${record.settings.ampRating}E`,
  record.catalogNumber,
  record.ratedVoltageVac / 1000,
  record.frequencyHz.join('/'),
  record.poles.join('/'),
  record.curveProfiles.reduce((sum, profile) => sum + profile.curve.length, 0),
  null,
  null,
  record.researchStatus,
  record.libraryStatus,
  record.missingForProduction.join('; '),
]);
candidates.getRange(`A5:L${4 + candidateRows.length}`).values = candidateRows;
for (let row = 5; row <= 4 + candidateRows.length; row += 1) {
  candidates.getRange(`H${row}`).formulas = [[`=COUNTIF('Spot Checks'!$A$5:$A$22,A${row})`]];
  candidates.getRange(`I${row}`).formulas = [[`=MAXIFS('Spot Checks'!$H$5:$H$22,'Spot Checks'!$A$5:$A$22,A${row})`]];
}
styleBody(candidates.getRange(`A5:L${4 + candidateRows.length}`));
candidates.getRange(`I5:I${4 + candidateRows.length}`).setNumberFormat('0.000000%');
candidates.getRange(`J5:K${4 + candidateRows.length}`).format.fill = amber;
candidates.getRange(`L5:L${4 + candidateRows.length}`).format.fill = red;
candidates.freezePanes.freezeRows(4);
candidates.getRange('A:L').format.columnWidth = 16;
candidates.getRange('A:A').format.columnWidth = 35;
candidates.getRange('L:L').format.columnWidth = 28;
candidates.getRange('A4:L8').format.autofitRows();

titleBand(checks, 'Automated Source-Point Spot Checks', 'Relative error and result are formula-driven. Expected values are official operational-boundary values; actual values are from the bounded log-log evaluator.', 'I');
checks.getRange('A4:I4').values = [[
  'Candidate ID', 'Profile ID', 'Role', 'Source ID', 'Current (A)', 'Expected time (s)', 'Actual time (s)', 'Relative error', 'Result',
]];
styleHeader(checks.getRange('A4:I4'));
const checkRows = batch.records.flatMap(record => record.curveValidation.spotChecks.map((check) => {
  const profile = record.curveProfiles.find(item => item.id === check.profileId);
  return [
    record.id,
    check.profileId,
    profile.role,
    check.sourceId,
    check.current,
    check.expectedTime,
    check.actualTime,
    null,
    null,
  ];
}));
checks.getRange(`A5:I${4 + checkRows.length}`).values = checkRows;
for (let row = 5; row <= 4 + checkRows.length; row += 1) {
  checks.getRange(`H${row}`).formulas = [[`=ABS((G${row}-F${row})/F${row})`]];
  checks.getRange(`I${row}`).formulas = [[`=IF(H${row}<=0.000001,"PASS","CHECK")`]];
}
styleBody(checks.getRange(`A5:I${4 + checkRows.length}`));
checks.getRange(`E5:G${4 + checkRows.length}`).setNumberFormat('0.000000');
checks.getRange(`H5:H${4 + checkRows.length}`).setNumberFormat('0.000000%');
checks.getRange(`I5:I${4 + checkRows.length}`).format.fill = green;
checks.freezePanes.freezeRows(4);
checks.getRange('A:I').format.columnWidth = 18;
checks.getRange('A:B').format.columnWidth = 35;
checks.getRange('D:D').format.columnWidth = 27;
checks.getRange('A4:I22').format.autofitRows();

titleBand(tolerance, 'Asymmetric Tolerance Semantics', 'Manufacturer statements are recorded without converting them into an invented symmetric time multiplier.', 'I');
tolerance.getRange('A4:I4').values = [[
  'Candidate ID', 'Profile ID', 'Role', 'Plotted boundary', 'Variation axis', 'Direction', 'Percent', 'Operational boundary', 'Source / notes',
]];
styleHeader(tolerance.getRange('A4:I4'));
const toleranceRows = batch.records.flatMap(record => record.tolerance.profileSemantics.map((item) => {
  const profile = record.curveProfiles.find(entry => entry.id === item.profileId);
  return [
    record.id,
    item.profileId,
    profile.role,
    item.plottedBoundary,
    item.variationAxis,
    item.variationDirection,
    item.variationPercent,
    item.operationalBoundary,
    `${item.sourceId}: ${item.notes}`,
  ];
}));
tolerance.getRange(`A5:I${4 + toleranceRows.length}`).values = toleranceRows;
styleBody(tolerance.getRange(`A5:I${4 + toleranceRows.length}`));
tolerance.getRange(`G5:G${4 + toleranceRows.length}`).setNumberFormat('0.0');
tolerance.getRange(`D5:H${4 + toleranceRows.length}`).format.fill = amber;
tolerance.freezePanes.freezeRows(4);
tolerance.getRange('A:I').format.columnWidth = 18;
tolerance.getRange('A:B').format.columnWidth = 35;
tolerance.getRange('I:I').format.columnWidth = 65;
tolerance.getRange(`A4:I${4 + toleranceRows.length}`).format.autofitRows();

titleBand(sources, 'Primary Source Register', 'All technical sources are manufacturer or standards-body publications. Bulletin 665-31 is retained only to document the resolved cross-application mapping.', 'H');
sources.getRange('A4:H4').values = [[
  'Source ID', 'Publisher', 'Document', 'Number', 'Date/revision', 'Purposes', 'Applicability', 'URL',
]];
styleHeader(sources.getRange('A4:H4'));
const sourceRows = batch.records[0].sourceDocuments.map(source => [
  source.id,
  source.publisher,
  source.title,
  source.documentNumber || '',
  source.date || source.revision || '',
  source.purposes.join(', '),
  source.id.includes('665_31') ? 'Cross-application only; excluded from direct field mappings.' : (source.notes || ''),
  source.url,
]);
sources.getRange(`A5:H${4 + sourceRows.length}`).values = sourceRows;
styleBody(sources.getRange(`A5:H${4 + sourceRows.length}`));
const crossApplicationRow = sourceRows.findIndex(row => row[0].includes('665_31')) + 5;
sources.getRange(`A${crossApplicationRow}:H${crossApplicationRow}`).format.fill = amber;
sources.freezePanes.freezeRows(4);
sources.getRange('A:H').format.columnWidth = 20;
sources.getRange('A:A').format.columnWidth = 37;
sources.getRange('C:C').format.columnWidth = 46;
sources.getRange('G:G').format.columnWidth = 55;
sources.getRange('H:H').format.columnWidth = 70;
sources.getRange(`A4:H${4 + sourceRows.length}`).format.autofitRows();

const exportBlob = await SpreadsheetFile.exportXlsx(workbook);
await exportBlob.save(outputPath);

for (const sheetName of ['Review Guide', 'Candidates', 'Spot Checks', 'Tolerance', 'Sources']) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' });
  const previewBytes = new Uint8Array(await preview.arrayBuffer());
  await fs.writeFile(path.join(outputDir, `${sheetName.toLowerCase().replaceAll(' ', '-')}.png`), previewBytes);
}

const formulaInspection = await workbook.inspect({
  kind: 'formula',
  maxChars: 12000,
  options: { maxResults: 100 },
});
const inspectionText = typeof formulaInspection === 'string' ? formulaInspection : JSON.stringify(formulaInspection);
if (/#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(inspectionText)) {
  throw new Error(`Formula error found in workbook inspection: ${inspectionText}`);
}

console.log(JSON.stringify({
  outputPath,
  sheets: ['Review Guide', 'Candidates', 'Spot Checks', 'Tolerance', 'Sources'],
  candidateCount: batch.records.length,
  spotCheckCount: checkRows.length,
  formulaInspection: inspectionText,
}, null, 2));
