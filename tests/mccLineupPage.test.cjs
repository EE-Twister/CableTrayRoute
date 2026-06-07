const assert = require('assert');
const fs = require('fs');
const path = require('path');

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const root = path.resolve(__dirname, '..');

describe('MCC lineup page', () => {
  const html = fs.readFileSync(path.join(root, 'mcclineup.html'), 'utf8');
  const entryJs = fs.readFileSync(path.join(root, 'src', 'mcclineup.js'), 'utf8');
  const pageJs = fs.readFileSync(path.join(root, 'src', 'mccLineupPage.js'), 'utf8');
  const modelJs = fs.readFileSync(path.join(root, 'src', 'mccLineupModel.mjs'), 'utf8');
  const dataStoreJs = fs.readFileSync(path.join(root, 'dataStore.mjs'), 'utf8');
  const arrangementHtml = fs.readFileSync(path.join(root, 'equipmentarrangements.html'), 'utf8');
  const arrangementJs = fs.readFileSync(path.join(root, 'equipmentarrangements.js'), 'utf8');
  const navJs = fs.readFileSync(path.join(root, 'src', 'components', 'navigation.js'), 'utf8');
  const commandPaletteJs = fs.readFileSync(path.join(root, 'src', 'components', 'commandPalette.js'), 'utf8');
  const siteJs = fs.readFileSync(path.join(root, 'site.js'), 'utf8');
  const styleCss = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const baseCss = fs.readFileSync(path.join(root, 'src', 'styles', 'base.css'), 'utf8');
  const distJs = fs.readFileSync(path.join(root, 'dist', 'mcclineup.js'), 'utf8');
  const distArrangementJs = fs.readFileSync(path.join(root, 'dist', 'equipmentarrangements.js'), 'utf8');
  // The bundler inlines dynamic imports (rollup `inlineDynamicImports: true`),
  // so mccLineupModel.mjs is emitted into dist/mcclineup.js rather than a
  // separate dist/chunks/ file. Assert against the inlined bundle.
  const distModelJs = distJs;

  it('adds a dedicated MCC Lineups page shell', () => {
    assert.ok(html.includes('<h1>MCC Lineups</h1>'), 'mcclineup.html missing page header');
    assert.ok(html.includes('id="mcc-lineup-select"'), 'mcclineup.html missing lineup selector');
    assert.ok(html.includes('id="mcc-elevation-preview"'), 'mcclineup.html missing elevation preview');
    assert.ok(html.includes('id="mcc-oneline-preview"'), 'mcclineup.html missing one-line preview');
    assert.ok(html.includes('id="mcc-selection-status"'), 'mcclineup.html missing bucket selection status');
    assert.ok(html.includes('id="mcc-section-list"'), 'mcclineup.html missing section editor');
    assert.ok(html.includes('id="mcc-file-protocol-warning"'), 'mcclineup.html missing file protocol warning');
    assert.ok(html.includes("window.location.protocol === 'file:'"), 'mcclineup.html missing file protocol detection');
    assert.ok(html.includes('placeholder="e.g. MCC-101"'), 'mcclineup.html missing lineup tag hint text');
    assert.ok(html.includes('placeholder="e.g. 480V, 600V, 4160V"'), 'mcclineup.html missing voltage hint text');
    assert.ok(html.includes('placeholder="e.g. 1600"'), 'mcclineup.html missing horizontal bus hint text');
    assert.ok(html.includes('placeholder="e.g. Front accessible, left-to-right"'), 'mcclineup.html missing arrangement hint text');
    assert.ok(html.includes('placeholder="72"'), 'mcclineup.html missing usable bucket stack hint text');
    assert.ok(html.includes('data-mcc-lineup-field="horizontalBusRatingA"'), 'mcclineup.html missing horizontal bus rating field');
    assert.ok(html.includes('data-mcc-lineup-field="verticalBusRatingA"'), 'mcclineup.html missing vertical bus rating field');
    assert.ok(html.includes('data-mcc-lineup-field="topHorizontalWirewayHeightIn"'), 'mcclineup.html missing top horizontal wireway field');
    assert.ok(html.includes('data-mcc-lineup-field="bottomHorizontalWirewayHeightIn"'), 'mcclineup.html missing bottom horizontal wireway field');
    assert.ok(html.includes('class="mcc-spec-details"'), 'mcclineup.html missing specification dropdown');
    assert.ok(html.includes('data-mcc-spec-field="busMaterial"'), 'mcclineup.html missing bus material specification field');
    assert.ok(html.includes('data-mcc-spec-field="busPlating"'), 'mcclineup.html missing bus plating specification field');
    assert.ok(html.includes('data-mcc-spec-field="busPlatingOther"'), 'mcclineup.html missing other bus plating specification field');
    assert.ok(html.includes('data-mcc-spec-field="spaceHeaterRequired"'), 'mcclineup.html missing space heater specification field');
    assert.ok(html.includes('data-mcc-spec-field="spaceHeaterVoltage"'), 'mcclineup.html missing space heater voltage field');
    assert.ok(html.includes('data-mcc-spec-field="communicationProtocol"'), 'mcclineup.html missing communication protocol specification field');
    assert.ok(html.includes('data-mcc-spec-field="incomingLinePower"'), 'mcclineup.html missing incoming line power field');
    assert.ok(html.includes('data-mcc-spec-field="incomingLinePowerOther"'), 'mcclineup.html missing other incoming line power field');
    assert.ok(html.includes('data-mcc-spec-field="mccArrangement"'), 'mcclineup.html missing MCC arrangement field');
    assert.ok(html.includes('data-mcc-spec-field="expansionCoverPlates"'), 'mcclineup.html missing expansion cover plates field');
    assert.ok(html.includes('data-mcc-spec-field="spaceHeaterAccessories"'), 'mcclineup.html missing space heater accessories field');
    assert.ok(html.includes('data-mcc-spec-field="busJoinPlating"'), 'mcclineup.html missing bus join plating field');
    assert.ok(html.includes('data-mcc-spec-field="groundBusRequired"'), 'mcclineup.html missing ground bus required field');
    assert.ok(html.includes('data-mcc-spec-field="groundBusLocation"'), 'mcclineup.html missing ground bus location field');
    assert.ok(html.includes('data-mcc-spec-field="motorProtectionDevice"'), 'mcclineup.html missing motor protection device field');
    assert.ok(
      html.indexOf('data-mcc-spec-field="spaceHeaterVoltage"') > html.indexOf('data-mcc-spec-field="spaceHeaterRequired"'),
      'mcclineup.html should place space heater voltage below the required checkbox'
    );
    assert.ok(html.includes('id="mcc-profile-preset"'), 'mcclineup.html missing MCC profile preset control');
    assert.ok(html.includes('id="apply-mcc-profile"'), 'mcclineup.html missing MCC profile apply control');
    assert.ok(html.includes('data-mcc-report-field="projectName"'), 'mcclineup.html missing PDF project name field');
    assert.ok(html.includes('data-mcc-report-field="drawingNumber"'), 'mcclineup.html missing PDF drawing number field');
    assert.ok(html.includes('id="export-mcc-lineup-pdf"'), 'mcclineup.html missing PDF report export control');
    assert.ok(html.includes('dist/mcclineup.js'), 'mcclineup.html missing bundled script');
  });

  it('keeps the MCC page aligned with shared header conventions', () => {
    assert.ok(html.includes('class="mcc-lineup-page"'), 'mcclineup.html missing page body class');
    assert.ok(html.includes('data-page-visual="diagram"'), 'mcclineup.html missing visual identity');
    assert.ok(html.includes('data-report-title="MCC Lineups"'), 'mcclineup.html missing print/report title');
    assert.ok(html.includes('"@type": "BreadcrumbList"'), 'mcclineup.html missing breadcrumb metadata');
    assert.ok(html.includes('id="unit-select"'), 'mcclineup.html missing settings unit selector');
    assert.ok(html.includes('page-header-graphic page-visual-showcase'), 'mcclineup.html missing shared header visual card');
    assert.ok(styleCss.includes('.mcc-file-protocol-warning'), 'style.css missing MCC file protocol warning styles');
    assert.ok(siteJs.includes('mcclineup'), 'site.js visual identity map missing MCC page route');
    assert.ok(siteJs.includes('!settingsBtn.contains(e.target)'), 'site.js settings menu outside-click handling should allow icon clicks');
    assert.ok(siteJs.includes('function enhanceSettingsMenu'), 'site.js missing enhanced settings menu grouping');
    assert.ok(baseCss.includes('.settings-menu__header'), 'base.css missing enhanced settings menu header styles');
    assert.ok(baseCss.includes('.settings-menu__action--primary'), 'base.css missing themed settings action styles');
    ['initSettings()', 'initDarkMode()', 'initCompactMode()', "initHelpModal('help-btn', 'help-modal', 'close-help-btn')", 'initNavToggle()']
      .forEach(fragment => assert.ok(entryJs.includes(fragment), `src/mcclineup.js missing ${fragment}`));
  });

  it('defines MCC model helpers for normalization, validation, rendering, and equipment sync', () => {
    [
      'export function normalizeMccLineup',
      'export function validateMccLineup',
      'export function mccLineupDimensions',
      'export function syncMccLineupsToEquipment',
      'export function renderMccElevationSvg',
      'export function renderMccOneLineSvg',
      'export function findMccLineupForEquipment',
      'export function normalizeMccSpecRequirements',
      'export function normalizeMccReportTitleBlock',
      'export function mccSpecSummary',
      'export function mccBucketPositionLabel',
      'MCC_MAIN_DEVICE_TYPES',
      'MCC_BUS_MATERIAL_TYPES',
      'MCC_BUS_PLATING_TYPES',
      'MCC_COMMUNICATION_PROTOCOL_TYPES',
      'MCC_INCOMING_LINE_POWER_TYPES',
      'MCC_ENCLOSURE_TYPES',
      'MCC_ARRANGEMENT_TYPES',
      'MCC_EXPANSION_COVER_PLATE_TYPES',
      'MCC_SPACE_HEATER_ACCESSORY_TYPES',
      'MCC_BUS_JOIN_PLATING_TYPES',
      'MCC_GROUND_BUS_REQUIRED_TYPES',
      'MCC_GROUND_BUS_LOCATION_TYPES',
      'MCC_MOTOR_PROTECTION_DEVICE_TYPES',
      'MCC_STARTER_TYPES',
      'mccMainDeviceLabel',
      'mccStarterTypeLabel',
      'mccStarterTypeSizeLabel',
      'mccBreakerAtAfLabel',
      'mccOneLineDeviceKind',
      'mcc-bucket-letter',
      'mcc-bucket-letter-box',
      'mcc-oneline-device-starter',
      'mcc-oneline-device-vfd',
      'mcc-oneline-device-breaker',
      'mcc-oneline-device-space',
      'mcc-oneline-position',
      'DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN',
      'specRequirements',
      'reportTitleBlock',
      'equipmentTag',
      'equipmentDescription',
      'busPlatingOther',
      'incomingLinePower',
      'spaceHeaterAccessories',
      'busJoinPlating',
      'groundBusRequired',
      'motorProtectionDevice',
      'motorSpaceHeaterRequired',
      'motorSpaceHeaterVa',
      'starterType',
      'horizontalBusRatingA',
      'verticalBusRatingA',
      'topHorizontalWirewayHeightIn',
      'bottomHorizontalWirewayHeightIn'
    ].forEach(fragment => assert.ok(modelJs.includes(fragment), `mccLineupModel.mjs missing ${fragment}`));
  });

  it('wires page controls to storage and equipment sync', () => {
    [
      'dataStore.getMccLineups()',
      'dataStore.setMccLineups(state.lineups)',
      'syncMccLineupsToEquipment(dataStore.getEquipment(), state.lineups)',
      "document.getElementById('add-mcc-lineup')",
      "document.getElementById('add-mcc-section')",
      "document.getElementById('export-mcc-lineup-svg')",
      "document.getElementById('export-mcc-lineup-pdf')",
      'downloadLineupPdfReport',
      'ensureMccJsPdf',
      'svgToPngDataUrl',
      'doc.addImage',
      'doc.save',
      'pdfSpecRows',
      'addSpecificationRequirements',
      'Specification Requirements',
      'Specified Value',
      'pdfOneLineBranchCount',
      'addPdfOneLinePages',
      'branchesPerRow',
      'branchStartIndex',
      'continuedAbove',
      'continuedBelow',
      'normalizeMccSpecRequirements',
      'mccBusPlatingLabel',
      'createDefaultSectionSpaces',
      "label: `SPACE ${index + 1}`",
      "type: 'space'",
      'heightIn = 12',
      'data-bucket-field="starterType"',
      'starterTypeOptionList',
      'starterSizeChartTooltip',
      'NEMA Size Motor Starters',
      'mcc-starter-chart-tooltip',
      'mcc-info-button',
      'data-bucket-field="motorSpaceHeaterRequired"',
      'data-bucket-field="motorSpaceHeaterVa"',
      'Motor Htr',
      'Htr VA',
      'MCC_PROFILE_PRESETS',
      'applySelectedProfile',
      'data-bucket-drag-handle',
      'startBucketPointerDrag',
      'startBucketMouseDrag',
      'updateBucketPointerTarget',
      'updateBucketMouseTarget',
      'finishBucketPointerDrag',
      'finishBucketMouseDrag',
      'pendingBucketMove',
      'beginClickBucketMove',
      'finishClickBucketMove',
      'handlePendingBucketMoveClick',
      'startCanvasBucketPointerDrag',
      'finishCanvasBucketPointerDrag',
      'canvasBucketElementAtPoint',
      'mcc-canvas-drop-target',
      'handleBucketDragStart',
      'handleBucketDrop',
      'data-mcc-report-field',
      'updateReportTitleBlockField',
      'addPdfTitleBlock',
      'state.selectedBucketId',
      'handlePreviewBucketSelection',
      'bucketTypeOptionList',
      'bucketTypeValue',
      'Main-MLO',
      'Main-Breaker',
      'data-bucket-field="equipmentTag"',
      'data-bucket-field="equipmentDescription"',
      'data-mcc-spec-field',
      'MCC_SPEC_SELECT_OPTIONS',
      'MCC_SPEC_MULTI_FIELDS',
      'spaceHeaterEnabled',
      'mcc-space-heater-dependent',
      'MCC_BUS_PLATING_TYPES',
      'MCC_INCOMING_LINE_POWER_TYPES',
      'updateSpecRequirementField',
      'spaceHeaterAccessories',
      'incomingLinePowerOther',
      'verticalWirewayWidthIn',
      'updateUsableBucketHeightFromWireways',
      'mcc-bucket-table-wrap',
      'renderPreservingBucketTableScroll',
      'bucketTableScrollPositions',
      'restoreBucketTableScrollPositions',
      'activeBucketTableField',
      'restoreActiveBucketTableField',
      'preventScroll: true',
      'iconMarkup',
      'mcc-bucket-icon-btn',
      'icons/toolbar/hand.svg',
      'icons/toolbar/arrow-up.svg',
      'icons/toolbar/arrow-down.svg',
      'icons/toolbar/trash.svg'
    ].forEach(fragment => assert.ok(pageJs.includes(fragment), `mccLineupPage.js missing ${fragment}`));
    assert.ok(!pageJs.includes('data-bucket-field="label"'), 'mccLineupPage.js should use Equipment Tag instead of a visible bucket Label field');
    assert.ok(!pageJs.includes('data-bucket-field="cableTag"'), 'mccLineupPage.js should not render Cable as a section bucket table column');
    assert.ok(!pageJs.includes('<th>Cable</th>'), 'mccLineupPage.js should not render a Cable column in the bucket table');
    assert.ok(!pageJs.includes('data-bucket-field="status"'), 'mccLineupPage.js should not render Status as a section bucket table column');
    assert.ok(!pageJs.includes('<th>Status</th>'), 'mccLineupPage.js should not render a Status column in the bucket table');
    assert.ok(!pageJs.includes('data-bucket-field="mainDevice"'), 'mccLineupPage.js should fold main device into the Type field');
    assert.ok(!pageJs.includes('<th>Main Device</th>'), 'mccLineupPage.js should not render a separate Main Device column');
    assert.ok(
      pageJs.indexOf('<th>Move / Drag</th>') > pageJs.indexOf('<th>Notes</th>'),
      'mccLineupPage.js should keep bucket controls at the right side of the table'
    );
    assert.ok(styleCss.includes('.mcc-bucket-table th:nth-child(9)'), 'style.css should explicitly size the Starter Size column');
    assert.ok(styleCss.includes('width:180px'), 'style.css should widen the Starter Size column');
    assert.ok(styleCss.includes('.mcc-starter-chart-tooltip'), 'style.css should style the NEMA starter size chart tooltip');
    assert.ok(styleCss.includes('.mcc-info-button'), 'style.css should style the starter size info button');
    assert.ok(styleCss.includes('.mcc-bucket-table th:nth-child(12)'), 'style.css should explicitly size the Notes column');
    assert.ok(styleCss.includes('min-width:1750px'), 'style.css should keep the MCC bucket table wide enough for motor heater, notes, and action buttons');
    assert.ok(styleCss.includes('.mcc-bucket-check-cell'), 'style.css should center bucket-level checkbox controls');
    assert.ok(styleCss.includes('.mcc-bucket-actions .mcc-bucket-icon-btn .control-icon'), 'style.css should style bucket action icons');
    assert.ok(styleCss.includes('flex:0 0 32px'), 'style.css should keep all bucket action buttons the same fixed size');
    assert.ok(styleCss.includes('.mcc-bucket-actions .mcc-bucket-icon-btn .sr-only'), 'style.css should prevent icon label text from affecting button layout');
    assert.ok(styleCss.includes('#mcc-oneline-preview svg'), 'style.css should target the MCC one-line preview SVG');
    assert.ok(styleCss.includes('#equipment-mcc-oneline-preview svg'), 'style.css should target the equipment arrangement MCC one-line preview SVG');
    assert.ok(styleCss.includes('max-width:none'), 'style.css should let one-line previews keep natural SVG width and scroll horizontally');
  });

  it('adds MCC lineup storage helpers and project persistence', () => {
    assert.ok(dataStoreJs.includes("mccLineups: 'mccLineups'"), 'dataStore.mjs missing mccLineups key');
    assert.ok(dataStoreJs.includes('export const getMccLineups'), 'dataStore.mjs missing getMccLineups helper');
    assert.ok(dataStoreJs.includes('export const setMccLineups'), 'dataStore.mjs missing setMccLineups helper');
    assert.ok(dataStoreJs.includes('mccLineups: getMccLineups()'), 'dataStore.mjs export/save missing mccLineups');
    assert.ok(dataStoreJs.includes('setMccLineups(Array.isArray(data.mccLineups)'), 'dataStore.mjs import missing mccLineups');
  });

  it('adds navigation and command-palette discovery', () => {
    assert.ok(navJs.includes("href: 'mcclineup.html'"), 'navigation.js missing mcclineup route');
    assert.ok(commandPaletteJs.includes('workflow:mcc-lineups'), 'command palette missing MCC action');
  });

  it('adds selected MCC detail preview on Equipment Arrangements', () => {
    assert.ok(arrangementHtml.includes('id="equipment-mcc-preview-panel"'), 'equipmentarrangements.html missing MCC preview panel');
    assert.ok(arrangementHtml.includes('id="equipment-mcc-edit-link"'), 'equipmentarrangements.html missing MCC edit link');
    assert.ok(arrangementHtml.includes('<option value="mcc-lineup">MCC Lineup</option>'), 'equipmentarrangements.html missing MCC lineup source');
    assert.ok(arrangementHtml.includes('id="mcc-lineup-preset"'), 'equipmentarrangements.html missing MCC lineup selector');
    assert.ok(arrangementJs.includes('function renderSelectedMccLineupPreview'), 'equipmentarrangements.js missing preview renderer');
    assert.ok(arrangementJs.includes('function populateMccLineupPreset'), 'equipmentarrangements.js missing MCC lineup preset population');
    assert.ok(arrangementJs.includes("source === 'mcc-lineup'"), 'equipmentarrangements.js missing MCC lineup add source');
    assert.ok(arrangementJs.includes('newEq.mccLineupId = mccLineupId'), 'equipmentarrangements.js missing direct MCC lineup placement reference');
    assert.ok(arrangementJs.includes('findMccLineupForEquipment(dataStore.getMccLineups()'), 'equipmentarrangements.js missing lineup lookup');
    assert.ok(arrangementJs.includes('renderSelectedMccLineupPreview();'), 'equipmentarrangements.js does not render MCC preview');
    assert.ok(arrangementJs.includes('mcclineup.html?mccLineupId='), 'equipmentarrangements.js missing MCC edit link target');
  });

  it('ships MCC page and arrangement preview in dist bundles', () => {
    assert.ok(distModelJs.includes('mccLineupId'), 'dist/mcclineup.js missing inlined MCC model bundle');
    assert.ok(distJs.includes('mcc-lineup-select'), 'dist/mcclineup.js missing MCC page wiring');
    assert.ok(distJs.includes('sync-mcc-equipment'), 'dist/mcclineup.js missing equipment sync control');
    assert.ok(distJs.includes('export-mcc-lineup-pdf'), 'dist/mcclineup.js missing PDF report export control');
    assert.ok(distJs.includes('mcc-lineup-report'), 'dist/mcclineup.js missing PDF report export filename');
    assert.ok(distJs.includes('mcc-profile-preset'), 'dist/mcclineup.js missing MCC profile preset wiring');
    assert.ok(distJs.includes('data-bucket-drag-handle'), 'dist/mcclineup.js missing bucket drag wiring');
    assert.ok(distJs.includes('reportTitleBlock'), 'dist/mcclineup.js missing PDF title block support');
    assert.ok(distModelJs.includes('mcc-lineup-elevation-svg'), 'dist MCC model chunk missing elevation renderer');
    assert.ok(distModelJs.includes('mcc-wireway'), 'dist MCC model chunk missing wireway renderer');
    assert.ok(distModelJs.includes('mcc-bucket-selected'), 'dist MCC model chunk missing bucket selection renderer');
    assert.ok(distModelJs.includes('mcc-bucket-letter'), 'dist MCC model chunk missing bucket position letters');
    assert.ok(distModelJs.includes('mcc-bucket-letter-box'), 'dist MCC model chunk missing bucket position letter badge');
    assert.ok(distModelJs.includes('equipmentDescription'), 'dist MCC model chunk missing equipment description support');
    assert.ok(distModelJs.includes('Main Breaker'), 'dist MCC model chunk missing main device renderer');
    assert.ok(distModelJs.includes('bus plating'), 'dist MCC model chunk missing bus plating summary');
    assert.ok(distModelJs.includes('space heater required'), 'dist MCC model chunk missing spec summary renderer');
    assert.ok(distModelJs.includes('H Bus'), 'dist MCC model chunk missing bus rating renderer');
    assert.ok(distModelJs.includes('Simple One-Line'), 'dist MCC model chunk missing one-line renderer');
    assert.ok(distArrangementJs.includes('equipment-mcc-preview-panel'), 'dist/equipmentarrangements.js missing MCC preview panel wiring');
    assert.ok(distArrangementJs.includes('equipment-mcc-elevation-preview'), 'dist/equipmentarrangements.js missing MCC elevation preview wiring');
  });
});
