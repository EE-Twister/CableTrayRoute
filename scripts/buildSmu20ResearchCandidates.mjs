import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateTimeCurrentCurve } from '../analysis/timeCurrentCurve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidencePath = path.join(root, 'docs', 'protective-device-source-geometry-smu20-2026-08-12.json');
const outputPath = path.join(root, 'docs', 'protective-device-research-candidates-smu20-2026-08-12.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

const ACCESSED_ON = '2026-08-12';
const PRODUCT_URL = 'https://www.sandc.com/en/products--services/products/smd-power-fuses-outdoor-distribution/';
const BULLETIN_242_URL = 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/specification-bulletin-242-31.pdf';
const BULLETIN_665_URL = 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/specification-bulletin-665-31.pdf';
const INSTRUCTION_URL = 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/instruction-sheet-252-550.pdf';
const MINIMUM_PDF_URL = 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.pdf';
const CLEARING_PDF_URL = 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2-2.pdf';
const MINIMUM_XLSX_URL = 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.xlsx';
const CLEARING_XLSX_URL = 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2-2.xlsx';

const sourceDocuments = [
  {
    id: 'sc_smd20_product',
    sourceType: 'manufacturer',
    purposes: ['technical_data', 'lifecycle', 'market_prevalence'],
    publisher: 'S&C Electric Company',
    title: 'SMD Power Fuses - Outdoor Distribution',
    url: PRODUCT_URL,
    accessedOn: ACCESSED_ON,
    notes: 'Current manufacturer product page; identifies SMU-20 use, 14.4-kV SMD-20 ratings, 50/60-Hz interrupting ratings, and the applicable TCC documents.'
  },
  {
    id: 'sc_smu20_spec_242_31',
    sourceType: 'manufacturer',
    purposes: ['technical_data', 'lifecycle', 'market_prevalence'],
    publisher: 'S&C Electric Company',
    title: 'Types SM-4, SM-5, SMD-20, and SMD-40 Power Fuses - Outdoor Distribution Specifications',
    url: BULLETIN_242_URL,
    documentNumber: '242-31',
    revision: 'November 24, 2025',
    date: '2025-11-24',
    accessedOn: ACCESSED_ON,
    page: '10 (Table 4)',
    notes: 'Direct SMD-20/SMU-20 ordering source for 14.4-kV standard-speed 25E, 65E, and 100E fuse-unit catalog numbers.'
  },
  {
    id: 'sc_smu20_instruction_252_550',
    sourceType: 'manufacturer',
    purposes: ['technical_data', 'lifecycle'],
    publisher: 'S&C Electric Company',
    title: 'SMU-20 Fuse Units',
    url: INSTRUCTION_URL,
    documentNumber: '252-550',
    accessedOn: ACCESSED_ON,
    notes: 'Current installation publication; states that SMU-20 ratings are listed in Specification Bulletin 242-31 and describes each fuse unit as a separately installed device.'
  },
  {
    id: 'sc_smu20_spec_665_31_cross_application',
    sourceType: 'manufacturer',
    purposes: ['technical_data'],
    publisher: 'S&C Electric Company',
    title: 'S&C Manual PME Pad-Mounted Gear',
    url: BULLETIN_665_URL,
    documentNumber: '665-31',
    accessedOn: ACCESSED_ON,
    notes: 'Cross-application source only. It lists SMU-20 units for PME gear and notes other compatible mountings; it is not the direct SMD-20 outdoor ordering bulletin and is intentionally excluded from catalog/applicability field provenance.'
  },
  {
    id: 'sc_tcc_153_2_pdf',
    sourceType: 'manufacturer',
    purposes: ['curve_data', 'standards'],
    publisher: 'S&C Electric Company',
    title: 'SMU Fuse Units - S&C Standard Speed Minimum Melting Time-Current Characteristic Curves',
    url: MINIMUM_PDF_URL,
    documentNumber: '153-2',
    date: '2019-06-03',
    accessedOn: ACCESSED_ON,
    page: '1',
    notes: 'Defines minimum-test-point plotting, plus 10% current variation for 10E through 400E ratings, 25 C/no-initial-load basis, and IEEE C37.41/C37.46 basis.'
  },
  {
    id: 'sc_tcc_153_2_xlsx',
    sourceType: 'manufacturer',
    purposes: ['curve_data'],
    publisher: 'S&C Electric Company',
    title: 'TCC Number 153-2 manufacturer spreadsheet',
    url: MINIMUM_XLSX_URL,
    documentNumber: '153-2',
    date: '2015-07-14',
    accessedOn: ACCESSED_ON,
    page: 'Worksheet 153_2',
    notes: 'Structured manufacturer points transcribed without curve reduction; source ranges are retained in profile settings.'
  },
  {
    id: 'sc_tcc_153_2_2_pdf',
    sourceType: 'manufacturer',
    purposes: ['curve_data', 'standards'],
    publisher: 'S&C Electric Company',
    title: 'SMU Fuse Units - S&C Standard Speed Total Clearing Time-Current Characteristic Curves',
    url: CLEARING_PDF_URL,
    documentNumber: '153-2-2',
    date: '2019-06-03',
    accessedOn: ACCESSED_ON,
    page: '1',
    notes: 'Defines maximum-test-point plotting, minus-only variation, total-clearing semantics, 25 C/no-initial-load basis, and IEEE C37.41/C37.46 basis.'
  },
  {
    id: 'sc_tcc_153_2_2_xlsx',
    sourceType: 'manufacturer',
    purposes: ['curve_data'],
    publisher: 'S&C Electric Company',
    title: 'TCC Number 153-2-2 manufacturer spreadsheet',
    url: CLEARING_XLSX_URL,
    documentNumber: '153-2-2',
    date: '1988-08-29',
    accessedOn: ACCESSED_ON,
    page: 'Worksheet 153_22',
    notes: 'Structured manufacturer points transcribed without curve reduction; worksheet source date retained separately from the 2019 PDF publication.'
  },
  {
    id: 'ieee_c37_41_2016',
    sourceType: 'standards_body',
    purposes: ['standards'],
    publisher: 'IEEE Standards Association',
    title: 'IEEE C37.41-2016 - IEEE Standard Design Tests for High-Voltage (>1000 V) Fuses and Accessories',
    url: 'https://standards.ieee.org/ieee/C37.41/5578/',
    documentNumber: 'IEEE C37.41-2016',
    date: '2016-12-09',
    accessedOn: ACCESSED_ON,
    notes: 'Edition in force when the manufacturer TCC publications dated 2019-06-03 were issued; the manufacturer publications cite C37.41 without an edition.'
  },
  {
    id: 'ieee_c37_46_2010',
    sourceType: 'standards_body',
    purposes: ['standards'],
    publisher: 'IEEE Standards Association',
    title: 'IEEE C37.46-2010 - IEEE Standard Specifications for High-Voltage (>1000 V) Expulsion and Current-Limiting Power Class Fuses and Fuse Disconnecting Switches',
    url: 'https://standards.ieee.org/ieee/C37.46/4619/',
    documentNumber: 'IEEE C37.46-2010',
    date: '2010-10-29',
    accessedOn: ACCESSED_ON,
    notes: 'Final C37.46 edition. IEEE identifies it as superseded by C37.42-2016; the manufacturer TCC publications nevertheless cite C37.46 without an edition.'
  }
];

function groupCurve(curve) {
  const groups = new Map();
  curve.forEach((point) => {
    const key = String(point.current);
    const group = groups.get(key) || { current: point.current, times: [] };
    group.times.push(point.time);
    groups.set(key, group);
  });
  return [...groups.values()].sort((a, b) => a.current - b.current);
}

function profileSpotChecks(profile, profileId) {
  const boundary = profile.role === 'clearing' ? 'upper' : 'lower';
  const sourceId = profile.role === 'clearing' ? 'sc_tcc_153_2_2_xlsx' : 'sc_tcc_153_2_xlsx';
  const groups = groupCurve(profile.rawCurve);
  const indices = [0, Math.floor((groups.length - 1) / 2), groups.length - 1];
  return indices.map((index) => {
    const group = groups[index];
    const expectedTime = boundary === 'upper' ? Math.max(...group.times) : Math.min(...group.times);
    const result = evaluateTimeCurrentCurve(profile.rawCurve, group.current, { boundary });
    if (!(result.time > 0)) throw new Error(`Unable to evaluate ${profileId} at ${group.current} A: ${result.status}`);
    return {
      profileId,
      current: group.current,
      expectedTime,
      actualTime: result.time,
      relativeError: Math.abs(result.time - expectedTime) / expectedTime,
      sourceId
    };
  });
}

function curveEvidenceFor(profile) {
  const clearing = profile.role === 'clearing';
  return {
    document: clearing ? 'S&C TCC Number 153-2-2 PDF and manufacturer spreadsheet' : 'S&C TCC Number 153-2 PDF and manufacturer spreadsheet',
    date: clearing ? '2019-06-03 (PDF); 1988-08-29 (worksheet source)' : '2019-06-03 (PDF); 2015-07-14 (worksheet source)',
    curveNumber: clearing ? '153-2-2' : '153-2',
    page: '1 / cited worksheet range',
    representation: clearing ? 'total_clearing' : 'minimum_melt',
    currentUnit: 'A',
    timeUnit: 's',
    frequencyHz: null,
    referenceAmbientC: 25,
    scalingBasis: 'No scaling. Full manufacturer spreadsheet coordinates are retained in source order, including duplicate-current and near-vertical geometry.',
    extractionMethod: 'manufacturer spreadsheet; full source-point transcription with duplicate-current points preserved; no curve reduction',
    extractionDate: ACCESSED_ON,
    sourceId: clearing ? 'sc_tcc_153_2_2_xlsx' : 'sc_tcc_153_2_xlsx',
    reviewer: null
  };
}

function buildRecord(sourceRecord) {
  const ampRating = Number.parseInt(sourceRecord.rating, 10);
  const slug = sourceRecord.rating.toLowerCase();
  const curveProfiles = sourceRecord.profiles.map((profile) => {
    const profileId = profile.role === 'clearing'
      ? `smu20_${slug}_total_clearing_14_4kv`
      : `smu20_${slug}_minimum_melting`;
    return {
      id: profileId,
      name: `SMU-20 ${sourceRecord.rating} ${profile.role === 'clearing' ? '14.4-kV total clearing' : 'minimum melting'}`,
      role: profile.role,
      curve: profile.rawCurve,
      curveEvidence: curveEvidenceFor(profile),
      settings: {
        ampRating,
        speed: 'standard',
        sourceRange: profile.sourceRange,
        sourcePointCount: profile.sourcePointCount,
        operationalBoundary: profile.operationalBoundary,
        duplicateCurrentPolicy: profile.operationalBoundary === 'upper' ? 'select longest time' : 'select shortest time'
      }
    };
  });
  const spotChecks = sourceRecord.profiles.flatMap((profile) => {
    const profileId = profile.role === 'clearing'
      ? `smu20_${slug}_total_clearing_14_4kv`
      : `smu20_${slug}_minimum_melting`;
    return profileSpotChecks(profile, profileId);
  });
  const totalClearing = curveProfiles.find(profile => profile.role === 'clearing');

  return {
    id: sourceRecord.canonicalRecordId,
    type: 'fuse',
    subtype: 'medium_voltage_power_fuse_e_standard',
    voltageClass: 'MV',
    vendor: 'S&C Electric Company',
    manufacturer: 'S&C Electric Company',
    series: 'SMU-20 in SMD-20',
    name: `S&C SMU-20 ${sourceRecord.rating} Standard Speed (14.4 kV)`,
    catalogNumber: sourceRecord.catalogNumber,
    tripUnitModel: null,
    lifecycleStatus: 'current',
    region: ['US'],
    standards: [
      'IEEE C37.41-2016 (edition derived from publication history; manufacturer TCC cites IEEE C37.41 without edition)',
      'IEEE C37.46-2010 (final edition; manufacturer TCC cites IEEE C37.46 without edition)'
    ],
    frequencyHz: [50, 60],
    poles: [1],
    ratedVoltageVac: 14400,
    ratedVoltageVdc: null,
    maximumVoltageVac: 17000,
    continuousCurrentA: ampRating,
    frameA: null,
    sensorA: null,
    tripRatingA: null,
    interruptRating: null,
    interruptingRatings: [
      {
        voltageVac: 14400,
        currentKA: 14,
        currentType: 'AC',
        ratingType: 'RMS symmetrical',
        standard: 'IEEE C37.46 (manufacturer-stated compliance; edition not stated)',
        frequencyHz: 60,
        poles: 1,
        basis: 'Complete SMD-20 mounting with the selected SMU-20 fuse unit; X/R basis is 15 in Specification Bulletin 242-31.',
        sourceId: 'sc_smd20_product'
      },
      {
        voltageVac: 14400,
        currentKA: 11.2,
        currentType: 'AC',
        ratingType: 'RMS symmetrical',
        standard: 'IEEE C37.46 (manufacturer-stated compliance; edition not stated)',
        frequencyHz: 50,
        poles: 1,
        basis: 'Complete SMD-20 mounting with the selected SMU-20 fuse unit.',
        sourceId: 'sc_smd20_product'
      }
    ],
    makingCapacityKApeak: null,
    withstandRatingKA: null,
    withstandCycles: null,
    shortTimeWithstand: [],
    installationRequirement: 'Use the SMU-20 fuse unit with compatible SMD-20 mounting and end fittings. Match fuse-unit and mounting voltage ratings; apply the interrupting rating of the complete assembly.',
    settings: { ampRating, speed: 'standard' },
    settingOptions: { ampRating: [ampRating], speed: ['standard'] },
    protectionSettings: {},
    curve: null,
    curveProfiles,
    curveEvidence: {
      document: 'S&C TCC Numbers 153-2 and 153-2-2 with manufacturer spreadsheets',
      date: '2019-06-03 PDFs; worksheet source dates retained in profile evidence',
      curveNumber: '153-2 / 153-2-2',
      page: '1 / cited worksheet ranges',
      representation: 'tolerance_band',
      currentUnit: 'A',
      timeUnit: 's',
      frequencyHz: null,
      referenceAmbientC: 25,
      scalingBasis: 'Minimum-melting profile is the lower operational boundary; total-clearing profile is the upper operational boundary. No scaling or reduced proxy curve is used.',
      extractionMethod: 'manufacturer spreadsheets; full source-point transcription with duplicate-current points preserved; no curve reduction',
      extractionDate: ACCESSED_ON,
      sourceId: 'sc_tcc_153_2_2_xlsx',
      reviewer: null
    },
    curveValidation: {
      spotChecks,
      notes: 'Six automated source-point checks per record: three minimum-melting lower-boundary checks and three total-clearing upper-boundary checks. Exact duplicate-current checks use the documented boundary policy. These are extraction/software checks, not independent engineering review.'
    },
    curveReduction: {
      method: 'none_full_source_geometry',
      interpolation: 'bounded log-current/log-time; extrapolation rejected',
      minimumMelting: {
        sourcePoints: curveProfiles.find(profile => profile.role === 'melting').curve.length,
        retainedPoints: curveProfiles.find(profile => profile.role === 'melting').curve.length,
        duplicateCurrentPolicy: 'lower boundary selects shortest time'
      },
      totalClearing: {
        sourcePoints: totalClearing.curve.length,
        retainedPoints: totalClearing.curve.length,
        duplicateCurrentPolicy: 'upper boundary selects longest time'
      }
    },
    tolerance: {
      profileSemantics: [
        {
          profileId: `smu20_${slug}_minimum_melting`,
          plottedBoundary: 'minimum_test_points',
          variationAxis: 'current',
          variationDirection: 'plus',
          variationPercent: 10,
          operationalBoundary: 'lower',
          sourceId: 'sc_tcc_153_2_pdf',
          notes: 'Manufacturer statement for 10E through 400E ratings. The published minimum-test-point curve is retained directly; no symmetric time multiplier is inferred.'
        },
        {
          profileId: `smu20_${slug}_total_clearing_14_4kv`,
          plottedBoundary: 'maximum_test_points',
          variationAxis: 'manufacturer_curve',
          variationDirection: 'minus',
          variationPercent: null,
          operationalBoundary: 'upper',
          sourceId: 'sc_tcc_153_2_2_pdf',
          notes: 'Manufacturer states all variations are minus and provides no percentage. The published maximum-test-point curve is retained directly; no symmetric tolerance is invented.'
        }
      ]
    },
    letThrough: null,
    openingTime: null,
    formula: null,
    iec60255: null,
    curveFamily: 'SMU-20 standard-speed E-rated fuse-unit TCC 153-2 / 153-2-2',
    groundFault: null,
    sensorType: null,
    nec230_95: null,
    zoneType: null,
    harmonicRestraint: null,
    sourceUrls: sourceDocuments.map(source => source.url),
    sourceDocuments,
    fieldSources: {
      '/type': ['sc_smd20_product'],
      '/vendor': ['sc_smd20_product'],
      '/series': ['sc_smd20_product', 'sc_smu20_spec_242_31'],
      '/catalogNumber': ['sc_smu20_spec_242_31'],
      '/lifecycleStatus': ['sc_smd20_product', 'sc_smu20_spec_242_31', 'sc_smu20_instruction_252_550'],
      '/region': ['sc_smd20_product', 'sc_smu20_spec_242_31'],
      '/standards': ['sc_tcc_153_2_pdf', 'sc_tcc_153_2_2_pdf', 'ieee_c37_41_2016', 'ieee_c37_46_2010'],
      '/frequencyHz': ['sc_smd20_product'],
      '/poles': ['sc_smu20_spec_242_31', 'sc_smu20_instruction_252_550'],
      '/ratedVoltageVac': ['sc_smd20_product', 'sc_smu20_spec_242_31'],
      '/continuousCurrentA': ['sc_smu20_spec_242_31', 'sc_tcc_153_2_pdf'],
      '/interruptingRatings': ['sc_smd20_product', 'sc_smu20_spec_242_31'],
      '/settings': ['sc_smu20_spec_242_31'],
      '/settingOptions': ['sc_smu20_spec_242_31'],
      '/curveProfiles': ['sc_tcc_153_2_xlsx', 'sc_tcc_153_2_2_xlsx', 'sc_tcc_153_2_pdf', 'sc_tcc_153_2_2_pdf'],
      '/curveEvidence': ['sc_tcc_153_2_xlsx', 'sc_tcc_153_2_2_xlsx', 'sc_tcc_153_2_pdf', 'sc_tcc_153_2_2_pdf'],
      '/curveValidation': ['sc_tcc_153_2_xlsx', 'sc_tcc_153_2_2_xlsx']
    },
    fieldStatus: {
      '/type': 'verified',
      '/vendor': 'verified',
      '/series': 'verified',
      '/catalogNumber': 'verified',
      '/tripUnitModel': 'not_applicable',
      '/lifecycleStatus': 'derived',
      '/region': 'derived',
      '/standards': 'derived',
      '/frequencyHz': 'verified',
      '/poles': 'derived',
      '/ratedVoltageVac': 'verified',
      '/ratedVoltageVdc': 'not_applicable',
      '/continuousCurrentA': 'verified',
      '/frameA': 'not_applicable',
      '/sensorA': 'not_applicable',
      '/tripRatingA': 'not_applicable',
      '/interruptingRatings': 'verified',
      '/makingCapacityKApeak': 'not_applicable',
      '/shortTimeWithstand': 'not_applicable',
      '/settings': 'derived',
      '/settingOptions': 'derived',
      '/protectionSettings': 'not_applicable',
      '/curve': 'not_applicable',
      '/curveProfiles': 'verified',
      '/curveEvidence': 'verified',
      '/curveValidation': 'derived',
      '/openingTime': 'not_applicable'
    },
    lastVerified: ACCESSED_ON,
    missingForProduction: ['independent engineering review'],
    researchStatus: 'candidate',
    libraryStatus: 'screening',
    review: {
      reviewer: null,
      reviewedOn: null,
      notes: 'Candidate for qualified human review. Bulletin 242-31 is the direct SMD-20/SMU-20 ordering source; Bulletin 665-31 is retained only as a PME cross-application reference. Automated checks do not constitute independent engineering review or licensed-engineer approval.'
    }
  };
}

const output = {
  schemaVersion: 1,
  purpose: 'protective_device_research_candidates',
  researchedOn: ACCESSED_ON,
  scope: 'Replacement research candidates for S&C SMU-20 25E, 65E, and 100E standard-speed fuse units in 14.4-kV SMD-20 outdoor distribution mountings; full manufacturer source geometry retained and canonical production data left unchanged.',
  records: evidence.records.map(buildRecord)
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${output.records.length} SMU-20 research candidates to ${path.relative(root, outputPath)}.`);
