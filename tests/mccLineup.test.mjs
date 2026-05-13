import assert from 'node:assert/strict';
import {
  bucketHeightFromUnits,
  bucketUnitsFromHeight,
  createDefaultMccLineup,
  findMccLineupForEquipment,
  mccBucketPositionLabel,
  mccLineupDimensions,
  mccSpecSummary,
  normalizeMccLineup,
  renderMccElevationSvg,
  renderMccOneLineSvg,
  syncMccLineupsToEquipment,
  validateMccLineup
} from '../src/mccLineupModel.mjs';

assert.equal(bucketHeightFromUnits(1.5, 6), 9);
assert.equal(bucketUnitsFromHeight(18, 6), 3);

const lineup = normalizeMccLineup({
  tag: 'MCC-A',
  equipmentTag: 'MCC-A',
  voltage: '480V',
  horizontalBusRatingA: 1200,
  verticalBusRatingA: 600,
  unitHeightIn: 6,
  sectionHeightIn: 90,
  topHorizontalWirewayHeightIn: 9,
  bottomHorizontalWirewayHeightIn: 9,
  usableBucketHeightIn: 12,
  sectionDepthIn: 24,
  specRequirements: {
    busMaterial: 'aluminum',
    busPlating: 'silver-plated',
    shortCircuitRatingKa: 100,
    spaceHeaterRequired: true,
    spaceHeaterVoltage: '120VAC',
    communicationProtocol: 'ethernet-ip',
    controlVoltage: '24VDC',
    enclosureRating: 'NEMA 12',
    finish: 'ANSI 49 gray',
    notes: 'Owner standard MCC spec'
  },
  reportTitleBlock: {
    projectName: 'Boiler Upgrade',
    drawingNumber: 'E-601',
    revision: 'B',
    preparedBy: 'CTR'
  },
  sections: [
    {
      name: 'S1',
      widthIn: 20,
      verticalWirewayWidthIn: 4,
      buckets: [
        { label: 'MAIN', type: 'main', status: 'active', mainDevice: 'mlo', sizeUnits: 1, loadTag: 'Incoming' },
        { label: 'P-101', type: 'starter', status: 'active', sizeUnits: 1, equipmentTag: '11-MP-001A', equipmentDescription: 'Boiler Main Pump A', loadTag: 'P-101' },
        { label: 'SPARE', type: 'spare', status: 'spare', heightIn: 6 }
      ]
    },
    { name: 'S2', widthIn: 20, buckets: [] }
  ]
});

assert.equal(lineup.sections[0].buckets[0].heightIn, 6);
assert.equal(lineup.sections[0].buckets[0].mainDevice, 'mlo');
assert.equal(lineup.sections[0].buckets[1].sizeUnits, 1);
assert.equal(lineup.sections[0].buckets[0].equipmentTag, 'Incoming');
assert.equal(lineup.sections[0].buckets[1].equipmentTag, '11-MP-001A');
assert.equal(lineup.sections[0].buckets[1].equipmentDescription, 'Boiler Main Pump A');
assert.equal(lineup.busRatingA, 1200);
assert.equal(lineup.horizontalBusRatingA, 1200);
assert.equal(lineup.verticalBusRatingA, 600);
assert.equal(lineup.sections[0].verticalWirewayWidthIn, 4);
assert.equal(lineup.specRequirements.busMaterial, 'aluminum');
assert.equal(lineup.specRequirements.busPlating, 'silver-plated');
assert.equal(lineup.specRequirements.spaceHeaterRequired, true);
assert.equal(lineup.specRequirements.communicationProtocol, 'ethernet-ip');
assert.equal(lineup.reportTitleBlock.projectName, 'Boiler Upgrade');
assert.equal(lineup.reportTitleBlock.drawingNumber, 'E-601');
assert.equal(lineup.reportTitleBlock.revision, 'B');
assert.ok(mccSpecSummary(lineup.specRequirements).includes('aluminum bus'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('silver-plated bus plating'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('space heater required'));
assert.equal(mccBucketPositionLabel(0, { heightIn: 18 }, 6), 'A-C');
assert.equal(mccBucketPositionLabel(18, { heightIn: 6 }, 6), 'D');

const customPlating = normalizeMccLineup({
  tag: 'MCC-CUSTOM',
  specRequirements: { busPlating: 'nickel plated' },
  sections: []
});
assert.equal(customPlating.specRequirements.busPlating, 'other');
assert.equal(customPlating.specRequirements.busPlatingOther, 'nickel plated');
assert.ok(mccSpecSummary(customPlating.specRequirements).includes('nickel plated bus plating'));

const dimensions = mccLineupDimensions(lineup);
assert.equal(dimensions.totalWidthIn, 40);
assert.equal(dimensions.totalWidthFt, 3.33);
assert.equal(dimensions.bucketCount, 3);
assert.equal(dimensions.spareBucketCount, 1);

const overflow = normalizeMccLineup({
  tag: 'MCC-B',
  usableBucketHeightIn: 6,
  sections: [{ name: 'S1', widthIn: 20, buckets: [{ label: 'A', sizeUnits: 2, loadTag: 'A' }] }]
});
assert.ok(validateMccLineup(overflow).some(message => message.severity === 'error' && message.message.includes('uses 12')));

const equipment = syncMccLineupsToEquipment(
  [{ tag: 'MCC-A', manufacturer: 'Existing', notes: 'Keep me' }],
  [lineup]
);
assert.equal(equipment.length, 1);
assert.equal(equipment[0].manufacturer, 'Existing');
assert.equal(equipment[0].category, 'Electrical Distribution');
assert.equal(equipment[0].subCategory, 'MCC');
assert.equal(equipment[0].width, '3.33');
assert.equal(equipment[0].depth, '2');
assert.equal(equipment[0].height, '7.5');
const newEquipment = syncMccLineupsToEquipment([], [lineup]);
assert.ok(newEquipment[0].notes.includes('1200 A horizontal bus'));
assert.ok(newEquipment[0].notes.includes('600 A vertical bus'));
assert.ok(newEquipment[0].notes.includes('aluminum bus'));
assert.ok(newEquipment[0].notes.includes('silver-plated bus plating'));

const seeded = createDefaultMccLineup(0);
assert.equal(seeded.equipmentTag, '');
assert.equal(seeded.horizontalBusRatingA, 1600);
assert.equal(seeded.verticalBusRatingA, 600);
assert.equal(seeded.topHorizontalWirewayHeightIn, 9);
assert.equal(seeded.bottomHorizontalWirewayHeightIn, 9);
assert.equal(seeded.sections[0].verticalWirewayWidthIn, 4);
assert.equal(seeded.sections[0].buckets[0].mainDevice, 'breaker');
assert.equal(seeded.specRequirements.busMaterial, 'copper');
assert.equal(seeded.specRequirements.busPlating, 'tin-plated');
assert.equal(seeded.specRequirements.busPlatingOther, '');
assert.equal(seeded.specRequirements.spaceHeaterRequired, false);
assert.equal(seeded.specRequirements.communicationProtocol, 'none');
const seededElevation = renderMccElevationSvg(seeded);
assert.ok(seededElevation.includes('mcc-lineup-elevation-svg'));
assert.ok(seededElevation.includes('H Bus 1600A / V Bus 600A'));
assert.ok(seededElevation.includes('TOP HORIZONTAL WIREWAY'));
assert.ok(seededElevation.includes('V WIREWAY 4'));
assert.ok(seededElevation.includes('BKR 1600A'));
assert.ok(seededElevation.includes('Incoming Main'));
assert.ok(seededElevation.includes('mcc-bucket-letter'));
assert.ok(seededElevation.includes('mcc-bucket-letter-box'));
assert.ok(seededElevation.includes('>A-C</text>'));
assert.ok(renderMccOneLineSvg(seeded).includes('Simple One-Line'));
assert.ok(renderMccOneLineSvg(lineup).includes('MLO'));
assert.ok(renderMccOneLineSvg(lineup).includes('11-MP-001A'));
const selectedBucketId = seeded.sections[0].buckets[0].id;
const selectedElevation = renderMccElevationSvg(seeded, { selectedBucketId });
const selectedOneLine = renderMccOneLineSvg(seeded, { selectedBucketId });
assert.ok(selectedElevation.includes(`data-mcc-bucket-id="${selectedBucketId}"`));
assert.ok(selectedElevation.includes('mcc-bucket-selected'));
assert.ok(selectedOneLine.includes('mcc-oneline-selected'));
assert.ok(selectedOneLine.includes('Selected Bucket: Main'));
assert.ok(selectedOneLine.includes('Incoming Main'));
assert.ok(selectedOneLine.includes('Main Breaker 1600A'));

const breakerMissingRating = normalizeMccLineup({
  tag: 'MCC-MAIN',
  sections: [{ name: 'S1', widthIn: 20, buckets: [{ label: 'MAIN', type: 'main', mainDevice: 'breaker', sizeUnits: 1, loadTag: 'Incoming' }] }]
});
assert.ok(validateMccLineup(breakerMissingRating).some(message => message.message.includes('main breaker')));

const wirewayWidthError = normalizeMccLineup({
  tag: 'MCC-WW',
  sections: [{ name: 'S1', widthIn: 6, verticalWirewayWidthIn: 6, buckets: [] }]
});
assert.ok(validateMccLineup(wirewayWidthError).some(message => message.message.includes('vertical wireway width')));

const standalone = normalizeMccLineup({
  id: 'mcc-standalone',
  tag: 'MCC-STANDALONE',
  equipmentTag: '',
  sections: [{ name: 'S1', widthIn: 20, buckets: [] }]
});
const afterStandaloneSync = syncMccLineupsToEquipment([], [standalone]);
assert.equal(afterStandaloneSync.length, 0);
assert.equal(findMccLineupForEquipment([standalone], { mccLineupId: 'mcc-standalone' })?.tag, 'MCC-STANDALONE');

console.log('MCC lineup model tests passed');
