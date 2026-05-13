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
    incomingLinePower: 'other',
    incomingLinePowerOther: 'Left side cable pull box',
    spaceHeaterRequired: true,
    spaceHeaterVoltage: '120VAC',
    spaceHeaterAccessories: ['high temp cutout', 'thermostat controlled'],
    communicationProtocol: 'ethernet-ip',
    controlVoltage: '24VDC',
    enclosureRating: 'NEMA 12',
    mccArrangement: 'back to back',
    expansionCoverPlates: 'left',
    busJoinPlating: 'silver plated',
    groundBusRequired: 'yes',
    groundBusLocation: 'horizontal top',
    motorProtectionDevice: 'magnetic',
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
        { label: 'P-101', type: 'starter', status: 'active', sizeUnits: 1, equipmentTag: '11-MP-001A', equipmentDescription: 'Boiler Main Pump A', loadTag: 'P-101', starterType: 'soft_starter', motorSpaceHeaterRequired: true, motorSpaceHeaterVa: 300 },
        { label: 'VFD-101', type: 'vfd', status: 'active', sizeUnits: 1, equipmentTag: '11-VFD-001A', equipmentDescription: 'Pump VFD', loadTag: 'VFD-101' },
        { label: 'SPACE', type: 'space', status: 'space', sizeUnits: 1 },
        { label: 'SPARE', type: 'spare', status: 'spare', heightIn: 6, breakerA: '100/250' }
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
assert.equal(lineup.sections[0].buckets[1].starterType, 'soft-starter');
assert.equal(lineup.sections[0].buckets[1].motorSpaceHeaterRequired, true);
assert.equal(lineup.sections[0].buckets[1].motorSpaceHeaterVa, '300');
assert.equal(lineup.busRatingA, 1200);
assert.equal(lineup.horizontalBusRatingA, 1200);
assert.equal(lineup.verticalBusRatingA, 600);
assert.equal(lineup.sections[0].verticalWirewayWidthIn, 4);
assert.equal(lineup.specRequirements.busMaterial, 'aluminum');
assert.equal(lineup.specRequirements.busPlating, 'silver-plated');
assert.equal(lineup.specRequirements.incomingLinePower, 'other');
assert.equal(lineup.specRequirements.incomingLinePowerOther, 'Left side cable pull box');
assert.equal(lineup.specRequirements.spaceHeaterRequired, true);
assert.deepEqual(lineup.specRequirements.spaceHeaterAccessories, ['high-temp-cutout', 'thermostat-controlled']);
assert.equal(lineup.specRequirements.communicationProtocol, 'ethernet-ip');
assert.equal(lineup.specRequirements.enclosureRating, 'NEMA 12');
assert.equal(lineup.specRequirements.mccArrangement, 'back-to-back');
assert.equal(lineup.specRequirements.expansionCoverPlates, 'left');
assert.equal(lineup.specRequirements.busJoinPlating, 'silver-plated');
assert.equal(lineup.specRequirements.groundBusRequired, 'yes');
assert.equal(lineup.specRequirements.groundBusLocation, 'horizontal-top');
assert.equal(lineup.specRequirements.motorProtectionDevice, 'magnetic');
assert.equal(lineup.reportTitleBlock.projectName, 'Boiler Upgrade');
assert.equal(lineup.reportTitleBlock.drawingNumber, 'E-601');
assert.equal(lineup.reportTitleBlock.revision, 'B');
assert.ok(mccSpecSummary(lineup.specRequirements).includes('aluminum bus'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('silver-plated bus plating'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('incoming line power Left side cable pull box'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('NEMA 12 enclosure'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('Back to Back arrangement'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('space heater required'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('High-Temp Cutout / Thermostat Controlled'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('Silver-Plated bus join plating'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('ground bus at Horizontal Top'));
assert.ok(mccSpecSummary(lineup.specRequirements).includes('Magnetic motor protection'));
assert.equal(mccBucketPositionLabel(0, { heightIn: 18 }, 6), 'A-C');
assert.equal(mccBucketPositionLabel(18, { heightIn: 6 }, 6), 'D');

const mainTypeChoices = normalizeMccLineup({
  tag: 'MCC-MAIN-TYPES',
  sections: [{
    name: 'S1',
    widthIn: 20,
    buckets: [
      { label: 'MAIN MLO', type: 'main-mlo', sizeUnits: 1 },
      { label: 'MAIN BKR', type: 'main-breaker', sizeUnits: 1 }
    ]
  }]
});
assert.equal(mainTypeChoices.sections[0].buckets[0].type, 'main');
assert.equal(mainTypeChoices.sections[0].buckets[0].mainDevice, 'mlo');
assert.equal(mainTypeChoices.sections[0].buckets[1].type, 'main');
assert.equal(mainTypeChoices.sections[0].buckets[1].mainDevice, 'breaker');

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
assert.equal(dimensions.bucketCount, 5);
assert.equal(dimensions.spareBucketCount, 2);

const overflow = normalizeMccLineup({
  tag: 'MCC-B',
  usableBucketHeightIn: 6,
  sections: [{ name: 'S1', widthIn: 20, buckets: [{ label: 'A', sizeUnits: 2, loadTag: 'A' }] }]
});
assert.ok(validateMccLineup(overflow).some(message => message.severity === 'error' && message.message.includes('uses 12')));

const missingMotorHeaterVa = normalizeMccLineup({
  tag: 'MCC-HTR',
  sections: [{ name: 'S1', widthIn: 20, buckets: [{ label: 'P-201', type: 'starter', sizeUnits: 1, equipmentTag: 'P-201', motorSpaceHeaterRequired: true }] }]
});
assert.ok(validateMccLineup(missingMotorHeaterVa).some(message => message.message.includes('motor space heater feed but has no VA rating')));

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
assert.equal(seeded.sections[1].buckets[0].starterType, 'fvnr');
assert.equal(seeded.sections[1].buckets[0].motorSpaceHeaterRequired, true);
assert.equal(seeded.sections[1].buckets[0].motorSpaceHeaterVa, '250');
assert.equal(seeded.sections[1].buckets[1].starterType, 'fvr');
assert.equal(seeded.specRequirements.busMaterial, 'copper');
assert.equal(seeded.specRequirements.busPlating, 'tin-plated');
assert.equal(seeded.specRequirements.busPlatingOther, '');
assert.equal(seeded.specRequirements.incomingLinePower, 'top');
assert.equal(seeded.specRequirements.spaceHeaterRequired, false);
assert.deepEqual(seeded.specRequirements.spaceHeaterAccessories, []);
assert.equal(seeded.specRequirements.communicationProtocol, 'none');
assert.equal(seeded.specRequirements.enclosureRating, 'NEMA 1');
assert.equal(seeded.specRequirements.mccArrangement, 'front-only');
assert.equal(seeded.specRequirements.expansionCoverPlates, 'right');
assert.equal(seeded.specRequirements.busJoinPlating, 'manufacturer-standard');
assert.equal(seeded.specRequirements.groundBusRequired, 'yes');
assert.equal(seeded.specRequirements.groundBusLocation, 'horizontal-bottom');
assert.equal(seeded.specRequirements.motorProtectionDevice, 'thermal-magnetic');
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
assert.ok(renderMccOneLineSvg(lineup).includes('Soft Starter'));
assert.ok(renderMccOneLineSvg(seeded).includes('FVNR-2'));
assert.ok(renderMccOneLineSvg(lineup).includes('100AT/250AF'));
assert.ok(renderMccOneLineSvg(seeded).includes('>1D</text>'));
assert.ok(renderMccOneLineSvg(seeded).includes('>2A</text>'));
assert.equal((renderMccOneLineSvg(seeded).match(/>MAIN<\/text>/g) || []).length, 1);
assert.ok(renderMccOneLineSvg(lineup).includes('mcc-oneline-device-starter'));
assert.ok(renderMccOneLineSvg(lineup).includes('mcc-oneline-device-vfd'));
assert.ok(renderMccOneLineSvg(lineup).includes('mcc-oneline-device-breaker'));
assert.ok(renderMccOneLineSvg(lineup).includes('mcc-oneline-device-space'));
const wideLineup = normalizeMccLineup({
  tag: 'MCC-WIDE',
  sections: [{
    name: 'S1',
    widthIn: 20,
    buckets: Array.from({ length: 16 }, (_, index) => ({
      label: `P-${index + 1}`,
      type: 'starter',
      sizeUnits: 1,
      equipmentTag: `P-${index + 1}`
    }))
  }]
});
const wideOneLine = renderMccOneLineSvg(wideLineup);
assert.ok(wideOneLine.includes('width="1452"'));
const continuedOneLine = renderMccOneLineSvg(wideLineup, {
  fixedWidth: 720,
  branchStartIndex: 8,
  branchLimit: 8,
  continuedAbove: true,
  continuedBelow: true
});
assert.ok(continuedOneLine.includes('width="720"'));
assert.ok(continuedOneLine.includes('CONT\'D ABOVE'));
assert.ok(continuedOneLine.includes('CONT\'D BELOW'));
assert.ok(continuedOneLine.includes('P-9'));
assert.ok(!continuedOneLine.includes('P-1</text>'));
const selectedBucketId = seeded.sections[0].buckets[0].id;
const selectedElevation = renderMccElevationSvg(seeded, { selectedBucketId });
const selectedOneLine = renderMccOneLineSvg(seeded, { selectedBucketId });
assert.ok(selectedElevation.includes(`data-mcc-bucket-id="${selectedBucketId}"`));
assert.ok(selectedElevation.includes('mcc-bucket-selected'));
assert.ok(selectedOneLine.includes('mcc-oneline-selected'));
assert.ok(selectedOneLine.includes('Selected Bucket: Main'));
assert.ok(selectedOneLine.includes('Incoming Main'));
assert.ok(selectedOneLine.includes('Main Breaker 1600A'));
assert.equal((selectedOneLine.match(/>MAIN<\/text>/g) || []).length, 1);

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
