import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import {
  evaluateTimeCurrentCurve,
  normalizeTimeCurrentCurve,
} from '../analysis/timeCurrentCurve.mjs';

const workingDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(workingDirectory);
const canonicalLibrary = JSON.parse(await fs.readFile(
  path.join(repositoryRoot, 'data', 'protectiveDevices.json'),
  'utf8',
));

const sourceDefinitions = [
  {
    sourceId: 'sandc_tcc_153_2_xlsx',
    documentNumber: '153-2',
    title: 'SMU-20 and SMU-40 Standard Speed Minimum Melting Time-Current Characteristic Curves',
    file: 'tcc-number-153-2.xlsx',
    url: 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.xlsx',
    sourceDate: '2015-07-14',
    sheet: '153_2',
    semantics: 'Minimum-melting curves; plus 10 percent current tolerance for 10E through 400E.',
    profileId: 'minimum_melting',
    role: 'melting',
    boundary: 'lower',
    ranges: { '25E': 'P10:Q95', '65E': 'X10:Y95', '100E': 'AB10:AC95' },
  },
  {
    sourceId: 'sandc_tcc_153_2_2_xlsx',
    documentNumber: '153-2-2',
    title: 'SMU-20 14.4-kV Total Clearing Time-Current Characteristic Curves',
    file: 'tcc-number-153-2-2.xlsx',
    url: 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2-2.xlsx',
    sourceDate: '1988-08-29',
    sheet: '153_22',
    semantics: 'Total-clearing curves plotted to maximum test points; all variations are minus.',
    profileId: 'total_clearing_14_4kv',
    role: 'clearing',
    boundary: 'upper',
    ranges: { '25E': 'N8:O95', '65E': 'V8:W95', '100E': 'Z8:AA95' },
  },
];

const recordByRating = {
  '25E': 'sc_smu20_25e_standard_14kv',
  '65E': 'sc_smu20_65e_standard_14kv',
  '100E': 'sc_smu20_100e_standard_14kv',
};

function extractPoints(values) {
  return values
    .map(row => ({ current: Number(row?.[0]), time: Number(row?.[1]) }))
    .filter(point => Number.isFinite(point.current) && point.current > 0
      && Number.isFinite(point.time) && point.time > 0);
}

function groupExactCurrents(curve) {
  const groups = [];
  normalizeTimeCurrentCurve(curve).forEach(point => {
    const group = groups.at(-1);
    if (group?.current === point.current) {
      group.times.push(point.time);
      group.lowerTime = Math.min(group.lowerTime, point.time);
      group.upperTime = Math.max(group.upperTime, point.time);
      return;
    }
    groups.push({
      current: point.current,
      times: [point.time],
      lowerTime: point.time,
      upperTime: point.time,
    });
  });
  return groups;
}

function compareBoundary(sourceCurve, evaluatedCurve, boundary) {
  const groups = groupExactCurrents(sourceCurve);
  let maximumLog10Error = 0;
  let worstPoint = null;
  let rejectedPointCount = 0;
  groups.forEach(group => {
    const expectedTime = boundary === 'upper' ? group.upperTime : group.lowerTime;
    const evaluation = evaluateTimeCurrentCurve(evaluatedCurve, group.current, {
      boundary,
      outOfRange: 'reject',
    });
    if (!(evaluation.time > 0)) {
      rejectedPointCount += 1;
      return;
    }
    const log10Error = Math.abs(Math.log10(evaluation.time / expectedTime));
    if (log10Error > maximumLog10Error) {
      maximumLog10Error = log10Error;
      worstPoint = {
        currentA: group.current,
        officialBoundaryTimeS: expectedTime,
        evaluatedTimeS: evaluation.time,
        status: evaluation.status,
      };
    }
  });
  return {
    uniqueCurrentCount: groups.length,
    rejectedPointCount,
    maximumLog10Error,
    worstPoint,
  };
}

function geometrySummary(curve) {
  const groups = groupExactCurrents(curve);
  const duplicateGroups = groups
    .filter(group => group.times.length > 1)
    .map(group => ({
      currentA: group.current,
      pointCount: group.times.length,
      minimumTimeS: group.lowerTime,
      maximumTimeS: group.upperTime,
    }));
  const uniqueCurrents = groups.map(group => group.current);
  const nearVerticalPairs = [];
  for (let index = 1; index < uniqueCurrents.length; index += 1) {
    const previous = uniqueCurrents[index - 1];
    const current = uniqueCurrents[index];
    const relativeSeparation = (current - previous) / previous;
    if (relativeSeparation > 0 && relativeSeparation <= 0.005) {
      nearVerticalPairs.push({ lowerCurrentA: previous, upperCurrentA: current, relativeSeparation });
    }
  }
  return { duplicateGroups, nearVerticalPairs };
}

const evidence = {
  schemaVersion: 1,
  evidenceId: 'SMU20-SOURCE-GEOMETRY-2026-08-12',
  assessmentDate: '2026-08-12',
  status: 'technical_candidate_only_not_for_promotion',
  notice: 'Manufacturer source-point transcription and software comparison only. This file is not independent engineering review, licensed-engineer approval, or authorization for calculation-ready promotion, coordination settings, or arc-flash clearing-time use.',
  interpolationPolicy: {
    axes: 'log-current/log-time',
    exactDuplicateCurrent: 'lower selects shortest time; upper selects longest time',
    segmentTraversal: 'enter the upper end of a vertical segment from the left and leave its lower end to the right',
    extrapolation: 'rejected for coordination and arc-flash clearing-time use',
  },
  sourceDocuments: sourceDefinitions.map(({ ranges, file, ...source }) => ({
    ...source,
    downloadedFileName: file,
    accessedOn: '2026-08-12',
    ranges,
  })),
  records: [],
};

const workbooks = new Map();
for (const source of sourceDefinitions) {
  const input = await FileBlob.load(path.join(workingDirectory, source.file));
  workbooks.set(source.sourceId, await SpreadsheetFile.importXlsx(input));
}

for (const [rating, canonicalRecordId] of Object.entries(recordByRating)) {
  const canonical = canonicalLibrary.find(record => record.id === canonicalRecordId);
  if (!canonical) throw new Error(`Missing canonical record ${canonicalRecordId}`);
  const record = {
    rating,
    canonicalRecordId,
    catalogNumber: canonical.catalogNumber,
    canonicalLibraryStatus: canonical.libraryStatus,
    disposition: 'retain_canonical_record_unchanged',
    profiles: [],
  };
  for (const source of sourceDefinitions) {
    const workbook = workbooks.get(source.sourceId);
    const sheet = workbook.worksheets.getItem(source.sheet);
    const sourceRange = source.ranges[rating];
    const rawCurve = extractPoints(sheet.getRange(sourceRange).values);
    const storedProfile = canonical.curveProfiles.find(profile => profile.id === source.profileId);
    if (!storedProfile) throw new Error(`Missing ${source.profileId} in ${canonicalRecordId}`);
    const candidateComparison = compareBoundary(rawCurve, rawCurve, source.boundary);
    const canonicalComparison = compareBoundary(rawCurve, storedProfile.curve, source.boundary);
    record.profiles.push({
      id: source.profileId,
      role: source.role,
      operationalBoundary: source.boundary,
      sourceId: source.sourceId,
      sourceRange: `${source.sheet}!${sourceRange}`,
      sourcePointCount: rawCurve.length,
      storedPointCount: storedProfile.curve.length,
      geometry: geometrySummary(rawCurve),
      candidateBoundaryComparison: candidateComparison,
      canonicalBoundaryComparison: canonicalComparison,
      rawCurve: normalizeTimeCurrentCurve(rawCurve).map(({ current, time }) => ({ current, time })),
    });
  }
  evidence.records.push(record);
}

const outputPath = path.join(
  repositoryRoot,
  'docs',
  'protective-device-source-geometry-smu20-2026-08-12.json',
);
await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  outputPath,
  records: evidence.records.map(record => ({
    rating: record.rating,
    profiles: record.profiles.map(profile => ({
      id: profile.id,
      sourcePointCount: profile.sourcePointCount,
      duplicateGroupCount: profile.geometry.duplicateGroups.length,
      nearVerticalPairCount: profile.geometry.nearVerticalPairs.length,
      candidateMaximumLog10Error: profile.candidateBoundaryComparison.maximumLog10Error,
      canonicalMaximumLog10Error: profile.canonicalBoundaryComparison.maximumLog10Error,
      canonicalRejectedPointCount: profile.canonicalBoundaryComparison.rejectedPointCount,
      canonicalWorstPoint: profile.canonicalBoundaryComparison.worstPoint,
    })),
  })),
}, null, 2));
