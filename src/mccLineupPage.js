import * as dataStore from '../dataStore.mjs';
import {
  DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN,
  MCC_BUS_MATERIAL_TYPES,
  MCC_BUS_PLATING_TYPES,
  MCC_BUCKET_TYPES,
  MCC_COMMUNICATION_PROTOCOL_TYPES,
  MCC_ARRANGEMENT_TYPES,
  MCC_BUS_JOIN_PLATING_TYPES,
  MCC_ENCLOSURE_TYPES,
  MCC_EXPANSION_COVER_PLATE_TYPES,
  MCC_GROUND_BUS_LOCATION_TYPES,
  MCC_GROUND_BUS_REQUIRED_TYPES,
  MCC_INCOMING_LINE_POWER_TYPES,
  MCC_MOTOR_PROTECTION_DEVICE_TYPES,
  MCC_SPACE_HEATER_ACCESSORY_TYPES,
  MCC_STARTER_TYPES,
  bucketHeightFromUnits,
  bucketUnitsFromHeight,
  createDefaultMccLineup,
  createMccUniqueId,
  escapeXml,
  mccBucketPositionLabel,
  mccBusPlatingLabel,
  mccMainDeviceLabel,
  mccLineupDimensions,
  mccStarterTypeLabel,
  normalizeMccLineup,
  normalizeMccLineups,
  normalizeMccSpecRequirements,
  renderMccElevationSvg,
  renderMccLineupSheetSvg,
  renderMccOneLineSvg,
  syncMccLineupsToEquipment,
  validateMccLineup
} from './mccLineupModel.mjs';

const ACTIVE_LINEUP_KEY = 'mccLineupActiveId';
let jsPdfLoadPromise = null;

const MCC_SPEC_SELECT_OPTIONS = {
  busMaterial: MCC_BUS_MATERIAL_TYPES,
  busPlating: MCC_BUS_PLATING_TYPES,
  communicationProtocol: MCC_COMMUNICATION_PROTOCOL_TYPES,
  incomingLinePower: MCC_INCOMING_LINE_POWER_TYPES,
  enclosureRating: MCC_ENCLOSURE_TYPES,
  mccArrangement: MCC_ARRANGEMENT_TYPES,
  expansionCoverPlates: MCC_EXPANSION_COVER_PLATE_TYPES,
  busJoinPlating: MCC_BUS_JOIN_PLATING_TYPES,
  groundBusRequired: MCC_GROUND_BUS_REQUIRED_TYPES,
  groundBusLocation: MCC_GROUND_BUS_LOCATION_TYPES,
  motorProtectionDevice: MCC_MOTOR_PROTECTION_DEVICE_TYPES
};

const MCC_SPEC_MULTI_FIELDS = new Set(['spaceHeaterAccessories']);

const state = {
  lineups: [],
  activeId: '',
  selectedBucketId: '',
  pendingBucketMove: null
};

let bucketPointerDrag = null;
let canvasBucketDrag = null;
let suppressPreviewBucketClick = false;

const MCC_PROFILE_PRESETS = [
  {
    id: 'low-voltage-nema',
    label: 'Low Voltage NEMA MCC',
    values: {
      voltage: '480V',
      horizontalBusRatingA: 1600,
      verticalBusRatingA: 600,
      unitHeightIn: 6,
      sectionHeightIn: 90,
      topHorizontalWirewayHeightIn: 9,
      bottomHorizontalWirewayHeightIn: 9,
      usableBucketHeightIn: 72,
      sectionDepthIn: 20,
      specRequirements: {
        busMaterial: 'copper',
        busPlating: 'tin-plated',
        shortCircuitRatingKa: 65,
        controlVoltage: '120VAC',
        enclosureRating: 'NEMA 1'
      }
    }
  },
  {
    id: 'heavy-duty-480v',
    label: 'Heavy-Duty 480V Process MCC',
    values: {
      voltage: '480V',
      horizontalBusRatingA: 2000,
      verticalBusRatingA: 800,
      unitHeightIn: 6,
      sectionHeightIn: 90,
      topHorizontalWirewayHeightIn: 10,
      bottomHorizontalWirewayHeightIn: 8,
      usableBucketHeightIn: 72,
      sectionDepthIn: 24,
      specRequirements: {
        busMaterial: 'copper',
        busPlating: 'silver-plated',
        shortCircuitRatingKa: 100,
        communicationProtocol: 'ethernet-ip',
        controlVoltage: '24VDC',
        enclosureRating: 'NEMA 12'
      }
    }
  },
  {
    id: 'compact-600v',
    label: 'Compact 600V MCC',
    values: {
      voltage: '600V',
      horizontalBusRatingA: 1200,
      verticalBusRatingA: 600,
      unitHeightIn: 6,
      sectionHeightIn: 90,
      topHorizontalWirewayHeightIn: 9,
      bottomHorizontalWirewayHeightIn: 9,
      usableBucketHeightIn: 72,
      sectionDepthIn: 20,
      specRequirements: {
        busMaterial: 'aluminum',
        busPlating: 'tin-plated',
        shortCircuitRatingKa: 42,
        controlVoltage: '120VAC',
        enclosureRating: 'NEMA 1'
      }
    }
  }
];

function activeIndex() {
  return state.lineups.findIndex(lineup => lineup.id === state.activeId);
}

function activeLineup() {
  return state.lineups[activeIndex()] || state.lineups[0] || null;
}

function setActiveLineup(lineup) {
  if (!lineup) return;
  state.activeId = lineup.id;
}

function cloneLineup(lineup) {
  const clone = JSON.parse(JSON.stringify(lineup));
  clone.id = createMccUniqueId('mcc');
  clone.tag = `${lineup.tag || 'MCC'}-COPY`;
  clone.name = `${lineup.name || lineup.tag || 'MCC Lineup'} Copy`;
  clone.equipmentTag = '';
  clone.sections = (clone.sections || []).map(section => ({
    ...section,
    id: createMccUniqueId('mcc-sec'),
    buckets: (section.buckets || []).map(bucket => ({ ...bucket, id: createMccUniqueId('mcc-bkt') }))
  }));
  return normalizeMccLineup(clone, state.lineups.length);
}

function loadLineups() {
  const stored = normalizeMccLineups(dataStore.getMccLineups());
  state.lineups = stored.length ? stored : [createDefaultMccLineup(0)];
  const storedActiveId = dataStore.getItem(ACTIVE_LINEUP_KEY, '');
  state.activeId = state.lineups.some(lineup => lineup.id === storedActiveId)
    ? storedActiveId
    : state.lineups[0].id;
  persistLineups();
}

function persistLineups() {
  state.lineups = normalizeMccLineups(state.lineups);
  if (!state.lineups.length) {
    state.lineups = [createDefaultMccLineup(0)];
  }
  if (!state.lineups.some(lineup => lineup.id === state.activeId)) {
    state.activeId = state.lineups[0].id;
  }
  dataStore.setMccLineups(state.lineups);
  dataStore.setItem(ACTIVE_LINEUP_KEY, state.activeId);
}

function setStatus(message) {
  const status = document.getElementById('mcc-sync-status');
  if (status) status.textContent = message;
}

function formatNumber(value, digits = 2) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return '';
  return String(Math.round(number * (10 ** digits)) / (10 ** digits));
}

function bucketSelection(lineup, bucketId = state.selectedBucketId) {
  const targetId = String(bucketId || '');
  if (!lineup || !targetId) return null;
  for (let sectionIndex = 0; sectionIndex < lineup.sections.length; sectionIndex += 1) {
    const section = lineup.sections[sectionIndex];
    const bucketIndex = section.buckets.findIndex(bucket => String(bucket.id) === targetId);
    if (bucketIndex !== -1) {
      return {
        section,
        sectionIndex,
        bucket: section.buckets[bucketIndex],
        bucketIndex
      };
    }
  }
  return null;
}

function bucketSummary(context) {
  if (!context) return '';
  const mainDevice = mccMainDeviceLabel(context.bucket);
  const details = [
    context.section.name,
    context.bucket.equipmentTag || context.bucket.loadTag,
    context.bucket.equipmentDescription,
    mainDevice,
    !mainDevice && mccStarterTypeLabel(context.bucket) ? mccStarterTypeLabel(context.bucket) : '',
    !mainDevice && context.bucket.breakerA ? `${context.bucket.breakerA}A` : '',
    context.bucket.cableTag ? `Cable ${context.bucket.cableTag}` : ''
  ].filter(Boolean).join(' / ');
  return `Selected bucket: ${details}`;
}

function pendingBucketMoveMatches(sectionIndex, bucketIndex) {
  const move = state.pendingBucketMove;
  return Boolean(move && move.sectionIndex === sectionIndex && move.bucketIndex === bucketIndex);
}

function ensureSelectedBucket(lineup) {
  if (state.selectedBucketId && !bucketSelection(lineup)) {
    state.selectedBucketId = '';
  }
}

function optionList(values, selected) {
  return values.map(value => `<option value="${escapeXml(value)}"${value === selected ? ' selected' : ''}>${escapeXml(value)}</option>`).join('');
}

function bucketTypeValue(bucket = {}) {
  if (bucket.type === 'main') {
    return bucket.mainDevice === 'breaker' ? 'main-breaker' : 'main-mlo';
  }
  return bucket.type;
}

function bucketTypeOptionList(bucket = {}) {
  const selected = bucketTypeValue(bucket);
  const options = [
    { value: 'main-mlo', label: 'Main-MLO' },
    { value: 'main-breaker', label: 'Main-Breaker' },
    ...MCC_BUCKET_TYPES
      .filter(value => value !== 'main')
      .map(value => ({ value, label: titleCaseOption(value) }))
  ];
  return options.map(option => (
    `<option value="${escapeXml(option.value)}"${option.value === selected ? ' selected' : ''}>${escapeXml(option.label)}</option>`
  )).join('');
}

function starterTypeOptionList(selected) {
  const labels = {
    '': '-',
    fvnr: 'FVNR',
    fvr: 'FVR',
    'soft-starter': 'Soft Starter',
    'wye-delta': 'Wye-Delta',
    'two-speed': 'Two-Speed',
    'reduced-voltage-autotransformer': 'Reduced Voltage Autotransformer',
    other: 'Other'
  };
  return MCC_STARTER_TYPES.map(value => (
    `<option value="${escapeXml(value)}"${value === selected ? ' selected' : ''}>${escapeXml(labels[value] || titleCaseOption(value))}</option>`
  )).join('');
}

function iconMarkup(src, label) {
  return `<img src="${escapeXml(src)}" alt="" aria-hidden="true" class="control-icon"><span class="sr-only">${escapeXml(label)}</span>`;
}

function starterSizeChartContent() {
  const rows = [
    ['00', '1 1/2', '1 1/2', '2', '--', '--', '--', '--', '--', '--', '--', '--', '--'],
    ['0', '3', '3', '5', '--', '--', '--', '--', '--', '--', '--', '--', '--'],
    ['1', '7 1/2', '7 1/2', '10', '7 1/2', '7 1/2', '10', '10', '10', '15', '10', '10', '15'],
    ['2', '10', '15', '25', '10', '15', '25', '20', '25', '40', '20', '25', '40'],
    ['3', '25', '30', '50', '25', '30', '50', '40', '50', '75', '40', '50', '75'],
    ['4', '40', '50', '100', '40', '50', '100', '75', '75', '150', '60', '75', '150'],
    ['5', '75', '100', '200', '75', '100', '200', '150', '150', '350', '150', '150', '300'],
    ['6', '150', '200', '400', '150', '200', '400', '--', '300', '600', '300', '350', '700'],
    ['7', '--', '300', '600', '--', '300', '600', '--', '450', '900', '500', '500', '1000'],
    ['8', '--', '450', '900', '--', '450', '900', '--', '700', '1400', '750', '800', '1500'],
    ['9', '--', '800', '1600', '--', '800', '1600', '--', '1300', '2600', '1500', '1500', '3000']
  ];
  const body = rows.map(row => (
    `<tr>${row.map(cell => `<td>${escapeXml(cell)}</td>`).join('')}</tr>`
  )).join('');
  return `
    <strong>NEMA Size Motor Starters</strong>
    <span class="mcc-starter-chart-caption">Maximum horsepower, three phase motors.</span>
    <table>
      <thead>
        <tr>
          <th rowspan="2">NEMA<br>Size</th>
          <th colspan="3">Full Voltage</th>
          <th colspan="3">Auto Transformer</th>
          <th colspan="3">Part Winding</th>
          <th colspan="3">Wye Delta</th>
        </tr>
        <tr>
          <th>200V</th><th>230V</th><th>460V<br>575V</th>
          <th>200V</th><th>230V</th><th>460V<br>575V</th>
          <th>200V</th><th>230V</th><th>460V<br>575V</th>
          <th>200V</th><th>230V</th><th>460V<br>575V</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function starterSizeChartTooltip() {
  return `
    <span class="mcc-starter-chart-help">
      <button class="mcc-info-button" type="button" aria-label="NEMA size motor starters chart" aria-controls="mcc-starter-chart-tooltip" aria-expanded="false">i</button>
    </span>
  `;
}

function titleCaseOption(value) {
  const labels = {
    'ethernet-ip': 'EtherNet/IP',
    'modbus-tcp': 'Modbus TCP',
    'modbus-rtu': 'Modbus RTU',
    profibus: 'PROFIBUS',
    profinet: 'PROFINET',
    devicenet: 'DeviceNet',
    hardwired: 'Hardwired',
    'tin-plated': 'Tin-Plated',
    'silver-plated': 'Silver-Plated',
    'manufacturer-standard': 'Manufacturer Standard',
    bare: 'Bare',
    other: 'Other',
    'front-only': 'Front Only',
    'back-to-back': 'Back to Back',
    'NEMA 1': 'NEMA 1',
    'NEMA 1A': 'NEMA 1A',
    'NEMA 3R': 'NEMA 3R',
    'NEMA 12': 'NEMA 12',
    'horizontal-bottom': 'Horizontal Bottom',
    'horizontal-top': 'Horizontal Top',
    'thermal-magnetic': 'Thermal-Magnetic',
    magnetic: 'Magnetic',
    'high-temp-cutout': 'High-Temp Cutout',
    'heater-circuit-breaker': 'Heater Circuit Breaker',
    'thermostat-controlled': 'Thermostat Controlled',
    'test-pushbutton-ammeter': 'Test Pushbutton and Ammeter'
  };
  if (labels[value]) return labels[value];
  if (value === 'mlo') return 'MLO';
  if (value === 'none') return 'None';
  return String(value)
    .split('-')
    .map(part => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : '')
    .join('-');
}

function labeledOptionList(values, selected) {
  return values.map(value => (
    `<option value="${escapeXml(value)}"${value === selected ? ' selected' : ''}>${escapeXml(titleCaseOption(value))}</option>`
  )).join('');
}

function renderProfilePresetOptions() {
  const select = document.getElementById('mcc-profile-preset');
  if (!select) return;
  select.innerHTML = MCC_PROFILE_PRESETS.map(profile => (
    `<option value="${escapeXml(profile.id)}">${escapeXml(profile.label)}</option>`
  )).join('');
}

function renderLineupSelector() {
  const select = document.getElementById('mcc-lineup-select');
  const deleteButton = document.getElementById('delete-mcc-lineup');
  if (!select) return;
  select.innerHTML = state.lineups.map((lineup, index) => (
    `<option value="${escapeXml(lineup.id)}">${index + 1}. ${escapeXml(lineup.tag)} - ${escapeXml(lineup.name)}</option>`
  )).join('');
  select.value = state.activeId;
  if (deleteButton) deleteButton.disabled = state.lineups.length <= 1;
}

function renderLineupFields(lineup) {
  document.querySelectorAll('[data-mcc-lineup-field]').forEach(input => {
    const key = input.dataset.mccLineupField;
    input.value = lineup[key] ?? '';
  });
}

function renderSpecRequirementFields(lineup) {
  const spec = lineup.specRequirements || {};
  document.querySelectorAll('[data-mcc-spec-field]').forEach(input => {
    const key = input.dataset.mccSpecField;
    if (input.tagName === 'SELECT' && MCC_SPEC_SELECT_OPTIONS[key]) {
      input.innerHTML = labeledOptionList(MCC_SPEC_SELECT_OPTIONS[key], spec[key]);
    }
    if (input.type === 'checkbox' && MCC_SPEC_MULTI_FIELDS.has(key)) {
      input.checked = Array.isArray(spec[key]) && spec[key].includes(input.value);
    } else if (input.type === 'checkbox') {
      input.checked = Boolean(spec[key]);
    } else {
      input.value = spec[key] ?? '';
    }
  });
  const otherBusPlating = document.querySelector('[data-mcc-spec-field="busPlatingOther"]');
  if (otherBusPlating) {
    const enabled = spec.busPlating === 'other';
    otherBusPlating.disabled = !enabled;
    otherBusPlating.closest('label')?.classList.toggle('mcc-spec-other-disabled', !enabled);
  }
  const otherIncomingLinePower = document.querySelector('[data-mcc-spec-field="incomingLinePowerOther"]');
  if (otherIncomingLinePower) {
    const enabled = spec.incomingLinePower === 'other';
    otherIncomingLinePower.disabled = !enabled;
    otherIncomingLinePower.closest('label')?.classList.toggle('mcc-spec-other-disabled', !enabled);
  }
  const spaceHeaterEnabled = Boolean(spec.spaceHeaterRequired);
  document.querySelectorAll('[data-mcc-spec-field="spaceHeaterVoltage"], [data-mcc-spec-field="spaceHeaterAccessories"]').forEach(input => {
    input.disabled = !spaceHeaterEnabled;
  });
  document.querySelectorAll('.mcc-space-heater-dependent').forEach(element => {
    element.classList.toggle('mcc-spec-other-disabled', !spaceHeaterEnabled);
  });
}

function renderReportTitleBlockFields(lineup) {
  const report = lineup.reportTitleBlock || {};
  document.querySelectorAll('[data-mcc-report-field]').forEach(input => {
    const key = input.dataset.mccReportField;
    input.value = report[key] ?? '';
  });
}

function renderStats(lineup) {
  const stats = document.getElementById('mcc-lineup-stats');
  if (!stats) return;
  const dimensions = mccLineupDimensions(lineup);
  stats.textContent = `${dimensions.sectionCount} sections / ${dimensions.bucketCount} buckets / ${dimensions.totalWidthIn}" wide`;
}

function renderSelectionStatus(lineup) {
  const status = document.getElementById('mcc-selection-status');
  if (!status) return;
  status.textContent = bucketSummary(bucketSelection(lineup));
}

function renderValidation(lineup) {
  const list = document.getElementById('mcc-validation-list');
  if (!list) return;
  const messages = validateMccLineup(lineup);
  list.innerHTML = '';
  if (!messages.length) {
    const item = document.createElement('li');
    item.className = 'mcc-validation-ok';
    item.textContent = 'Lineup layout checks passed.';
    list.appendChild(item);
    return;
  }
  messages.forEach(message => {
    const item = document.createElement('li');
    item.className = message.severity === 'error' ? 'mcc-validation-error' : 'mcc-validation-warning';
    item.textContent = message.message;
    list.appendChild(item);
  });
}

function renderPreviews(lineup) {
  const elevation = document.getElementById('mcc-elevation-preview');
  const oneLine = document.getElementById('mcc-oneline-preview');
  const renderOptions = { selectedBucketId: state.selectedBucketId };
  if (elevation) {
    elevation.innerHTML = renderMccElevationSvg(lineup, {
      ...renderOptions,
      maxWidth: 980,
      maxHeight: 430
    });
  }
  if (oneLine) oneLine.innerHTML = renderMccOneLineSvg(lineup, renderOptions);
}

function renderSections(lineup) {
  const container = document.getElementById('mcc-section-list');
  if (!container) return;
  container.innerHTML = '';
  lineup.sections.forEach((section, sectionIndex) => {
    const panel = document.createElement('section');
    panel.className = 'mcc-section-editor';
    panel.dataset.sectionIndex = String(sectionIndex);
    panel.dataset.sectionId = String(section.id);
    panel.innerHTML = `
      <div class="mcc-section-editor__header">
        <label>Section Name
          <input type="text" data-section-field="name" value="${escapeXml(section.name)}">
        </label>
        <label>Width (in)
          <input type="number" step="0.5" min="6" data-section-field="widthIn" value="${escapeXml(formatNumber(section.widthIn))}">
        </label>
        <label>Vertical Wireway (in)
          <input type="number" step="0.5" min="0" data-section-field="verticalWirewayWidthIn" value="${escapeXml(formatNumber(section.verticalWirewayWidthIn))}">
        </label>
        <div class="mcc-section-editor__actions">
          <button class="btn" type="button" data-section-action="add-bucket">Add Bucket</button>
          <button class="btn" type="button" data-section-action="duplicate-section">Duplicate</button>
          <button class="btn" type="button" data-section-action="delete-section">Delete</button>
        </div>
      </div>
      <div class="overflow-x-auto mcc-bucket-table-wrap">
        <table class="mcc-bucket-table">
          <thead>
            <tr>
              <th>Equipment Tag</th>
              <th>Equipment Description</th>
              <th>Type</th>
              <th>Units</th>
              <th>Height (in)</th>
              <th>HP</th>
              <th>Breaker</th>
              <th>Starter Type</th>
              <th><span class="mcc-table-header-with-help">Starter Size ${starterSizeChartTooltip()}</span></th>
              <th>Motor Htr</th>
              <th>Htr VA</th>
              <th>Notes</th>
              <th>Move / Drag</th>
            </tr>
          </thead>
          <tbody>
            ${section.buckets.map((bucket, bucketIndex) => `
              <tr data-bucket-index="${bucketIndex}" data-bucket-id="${escapeXml(bucket.id)}" class="${[
                String(bucket.id) === state.selectedBucketId ? 'mcc-bucket-row-selected' : '',
                pendingBucketMoveMatches(sectionIndex, bucketIndex) ? 'mcc-bucket-row-moving' : ''
              ].filter(Boolean).join(' ')}" aria-selected="${String(bucket.id) === state.selectedBucketId ? 'true' : 'false'}">
                <td><input type="text" data-bucket-field="equipmentTag" value="${escapeXml(bucket.equipmentTag)}"></td>
                <td><input type="text" data-bucket-field="equipmentDescription" value="${escapeXml(bucket.equipmentDescription)}"></td>
                <td><select data-bucket-field="type">${bucketTypeOptionList(bucket)}</select></td>
                <td><input type="number" step="0.25" min="0.25" data-bucket-field="sizeUnits" value="${escapeXml(formatNumber(bucket.sizeUnits))}"></td>
                <td><input type="number" step="0.5" min="1" data-bucket-field="heightIn" value="${escapeXml(formatNumber(bucket.heightIn))}"></td>
                <td><input type="text" data-bucket-field="hp" value="${escapeXml(bucket.hp)}"></td>
                <td><input type="text" data-bucket-field="breakerA" value="${escapeXml(bucket.breakerA)}"></td>
                <td><select data-bucket-field="starterType"${bucket.type === 'starter' ? '' : ' disabled'}>${starterTypeOptionList(bucket.starterType)}</select></td>
                <td><input type="text" data-bucket-field="starterSize" value="${escapeXml(bucket.starterSize)}"></td>
                <td class="mcc-bucket-check-cell"><input type="checkbox" data-bucket-field="motorSpaceHeaterRequired"${bucket.motorSpaceHeaterRequired ? ' checked' : ''} aria-label="Motor space heater feed required"></td>
                <td><input type="number" min="0" step="1" data-bucket-field="motorSpaceHeaterVa" value="${escapeXml(bucket.motorSpaceHeaterVa)}"${bucket.motorSpaceHeaterRequired ? '' : ' disabled'}></td>
                <td><input type="text" data-bucket-field="notes" value="${escapeXml(bucket.notes)}"></td>
                <td class="mcc-bucket-actions">
                  <span class="btn mcc-bucket-icon-btn mcc-bucket-drag-handle" role="button" tabindex="0" data-bucket-drag-handle aria-label="${state.pendingBucketMove && !pendingBucketMoveMatches(sectionIndex, bucketIndex) ? 'Place bucket here' : 'Drag bucket to reorder'}" title="${state.pendingBucketMove && !pendingBucketMoveMatches(sectionIndex, bucketIndex) ? 'Place bucket here' : 'Drag bucket to reorder'}">${state.pendingBucketMove && !pendingBucketMoveMatches(sectionIndex, bucketIndex) ? iconMarkup('icons/toolbar/validate.svg', 'Place bucket here') : iconMarkup('icons/toolbar/hand.svg', 'Drag bucket to reorder')}</span>
                  <button class="btn mcc-bucket-icon-btn" type="button" data-bucket-action="up" aria-label="Move bucket up" title="Move bucket up">${iconMarkup('icons/toolbar/arrow-up.svg', 'Move bucket up')}</button>
                  <button class="btn mcc-bucket-icon-btn" type="button" data-bucket-action="down" aria-label="Move bucket down" title="Move bucket down">${iconMarkup('icons/toolbar/arrow-down.svg', 'Move bucket down')}</button>
                  <button class="btn mcc-bucket-icon-btn" type="button" data-bucket-action="delete" aria-label="Delete bucket" title="Delete bucket">${iconMarkup('icons/toolbar/trash.svg', 'Delete bucket')}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(panel);
  });
}

function bucketTableScrollPositions() {
  const positions = new Map();
  document.querySelectorAll('.mcc-section-editor').forEach(panel => {
    const scroller = panel.querySelector('.mcc-bucket-table-wrap');
    const key = panel.dataset.sectionId || panel.dataset.sectionIndex;
    if (scroller && key) {
      positions.set(key, { left: scroller.scrollLeft, top: scroller.scrollTop });
    }
  });
  return positions;
}

function restoreBucketTableScrollPositions(positions) {
  document.querySelectorAll('.mcc-section-editor').forEach(panel => {
    const scroller = panel.querySelector('.mcc-bucket-table-wrap');
    const key = panel.dataset.sectionId || panel.dataset.sectionIndex;
    const position = key ? positions.get(key) : null;
    if (scroller && position) {
      scroller.scrollLeft = position.left;
      scroller.scrollTop = position.top;
    }
  });
}

function activeBucketTableField() {
  const field = document.activeElement?.closest?.('[data-bucket-field]');
  const row = field?.closest('[data-bucket-id]');
  const panel = field?.closest('.mcc-section-editor');
  if (!field || !row || !panel) return null;
  return {
    sectionId: panel.dataset.sectionId,
    bucketId: row.dataset.bucketId,
    fieldName: field.dataset.bucketField
  };
}

function restoreActiveBucketTableField(target) {
  if (!target?.sectionId || !target.bucketId || !target.fieldName) return;
  const panel = document.querySelector(`.mcc-section-editor[data-section-id="${CSS.escape(target.sectionId)}"]`);
  const row = panel?.querySelector(`[data-bucket-id="${CSS.escape(target.bucketId)}"]`);
  const field = row?.querySelector(`[data-bucket-field="${CSS.escape(target.fieldName)}"]`);
  field?.focus?.({ preventScroll: true });
}

function renderPreservingBucketTableScroll() {
  const positions = bucketTableScrollPositions();
  const activeField = activeBucketTableField();
  render();
  restoreBucketTableScrollPositions(positions);
  restoreActiveBucketTableField(activeField);
  window.requestAnimationFrame(() => {
    restoreBucketTableScrollPositions(positions);
    restoreActiveBucketTableField(activeField);
  });
}

function render() {
  const lineup = activeLineup();
  if (!lineup) return;
  ensureSelectedBucket(lineup);
  renderLineupSelector();
  renderLineupFields(lineup);
  renderSpecRequirementFields(lineup);
  renderReportTitleBlockFields(lineup);
  renderStats(lineup);
  renderSelectionStatus(lineup);
  renderValidation(lineup);
  renderSections(lineup);
  renderPreviews(lineup);
}

function selectBucket(bucketId, options = {}) {
  const lineup = activeLineup();
  if (!lineup || !bucketSelection(lineup, bucketId)) return;
  state.selectedBucketId = String(bucketId);
  render();
  if (options.scrollRow !== false) {
    const row = document.querySelector(`[data-bucket-id="${CSS.escape(state.selectedBucketId)}"]`);
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function beginClickBucketMove(context) {
  if (!context) return;
  state.pendingBucketMove = {
    sectionIndex: context.sectionIndex,
    bucketIndex: context.bucketIndex,
    bucketId: context.bucket.id
  };
  setStatus('Bucket move started. Click another bucket row to place it there.');
  render();
}

function finishClickBucketMove(targetContext) {
  const move = state.pendingBucketMove;
  state.pendingBucketMove = null;
  if (!move || !targetContext) {
    render();
    return;
  }
  if (move.sectionIndex === targetContext.sectionIndex && move.bucketIndex === targetContext.bucketIndex) {
    setStatus('Bucket move canceled.');
    render();
    return;
  }
  moveBucketToIndex(move.sectionIndex, move.bucketIndex, targetContext.sectionIndex, targetContext.bucketIndex);
  setStatus('Bucket moved.');
}

function updateUsableBucketHeightFromWireways(lineup) {
  const sectionHeight = Number.parseFloat(lineup.sectionHeightIn);
  const topWireway = Number.parseFloat(lineup.topHorizontalWirewayHeightIn);
  const bottomWireway = Number.parseFloat(lineup.bottomHorizontalWirewayHeightIn);
  if (!Number.isFinite(sectionHeight) || !Number.isFinite(topWireway) || !Number.isFinite(bottomWireway)) return;
  lineup.usableBucketHeightIn = Math.max(6, Math.round((sectionHeight - topWireway - bottomWireway) * 100) / 100);
}

function updateActiveLineupField(key, value) {
  const lineup = activeLineup();
  if (!lineup) return;
  const numericFields = new Set([
    'busRatingA',
    'horizontalBusRatingA',
    'verticalBusRatingA',
    'unitHeightIn',
    'sectionHeightIn',
    'topHorizontalWirewayHeightIn',
    'bottomHorizontalWirewayHeightIn',
    'usableBucketHeightIn',
    'sectionDepthIn'
  ]);
  lineup[key] = numericFields.has(key) ? Number.parseFloat(value) : value;
  if (key === 'sectionHeightIn' || key === 'topHorizontalWirewayHeightIn' || key === 'bottomHorizontalWirewayHeightIn') {
    updateUsableBucketHeightFromWireways(lineup);
  }
  if (key === 'unitHeightIn') {
    const unitHeight = Number.parseFloat(value);
    if (Number.isFinite(unitHeight) && unitHeight > 0) {
      lineup.sections.forEach(section => {
        section.buckets.forEach(bucket => {
          bucket.heightIn = bucketHeightFromUnits(bucket.sizeUnits, unitHeight);
        });
      });
    }
  }
  const normalized = normalizeMccLineup(lineup, activeIndex());
  state.lineups[activeIndex()] = normalized;
  persistLineups();
  render();
}

function updateSpecRequirementField(input) {
  const lineup = activeLineup();
  if (!lineup) return;
  const key = input.dataset.mccSpecField;
  const numericFields = new Set(['shortCircuitRatingKa']);
  const value = MCC_SPEC_MULTI_FIELDS.has(key)
    ? Array.from(document.querySelectorAll(`input[type="checkbox"][data-mcc-spec-field="${CSS.escape(key)}"]`))
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value)
    : input.type === 'checkbox'
    ? input.checked
    : (numericFields.has(key) ? Number.parseFloat(input.value) : input.value);
  lineup.specRequirements = {
    ...(lineup.specRequirements || {}),
    [key]: value
  };
  state.lineups[activeIndex()] = normalizeMccLineup(lineup, activeIndex());
  persistLineups();
  render();
}

function updateReportTitleBlockField(input) {
  const lineup = activeLineup();
  if (!lineup) return;
  const key = input.dataset.mccReportField;
  lineup.reportTitleBlock = {
    ...(lineup.reportTitleBlock || {}),
    [key]: input.value
  };
  state.lineups[activeIndex()] = normalizeMccLineup(lineup, activeIndex());
  persistLineups();
  render();
}

function applySelectedProfile() {
  const lineup = activeLineup();
  const profileId = document.getElementById('mcc-profile-preset')?.value;
  const profile = MCC_PROFILE_PRESETS.find(candidate => candidate.id === profileId);
  if (!lineup || !profile) return;
  const { specRequirements = {}, ...lineupValues } = profile.values;
  Object.entries(lineupValues).forEach(([key, value]) => {
    lineup[key] = value;
  });
  lineup.specRequirements = {
    ...(lineup.specRequirements || {}),
    ...specRequirements
  };
  state.lineups[activeIndex()] = normalizeMccLineup(lineup, activeIndex());
  persistLineups();
  render();
  setStatus(`Applied ${profile.label} defaults to ${lineup.tag}.`);
}

function sectionForPanel(panel) {
  const lineup = activeLineup();
  const sectionIndex = Number.parseInt(panel?.dataset.sectionIndex || '-1', 10);
  if (!lineup || sectionIndex < 0 || sectionIndex >= lineup.sections.length) return null;
  return { lineup, section: lineup.sections[sectionIndex], sectionIndex };
}

function bucketForRow(row) {
  const panel = row?.closest('.mcc-section-editor');
  const context = sectionForPanel(panel);
  if (!context) return null;
  const bucketIndex = Number.parseInt(row?.dataset.bucketIndex || '-1', 10);
  if (bucketIndex < 0 || bucketIndex >= context.section.buckets.length) return null;
  return { ...context, bucket: context.section.buckets[bucketIndex], bucketIndex };
}

function updateSectionField(input) {
  const context = sectionForPanel(input.closest('.mcc-section-editor'));
  if (!context) return;
  const key = input.dataset.sectionField;
  const numericFields = new Set(['widthIn', 'verticalWirewayWidthIn']);
  context.section[key] = numericFields.has(key) ? Number.parseFloat(input.value) : input.value;
  state.lineups[activeIndex()] = normalizeMccLineup(context.lineup, activeIndex());
  persistLineups();
  render();
}

function updateBucketField(input) {
  const context = bucketForRow(input.closest('tr'));
  if (!context) return;
  const key = input.dataset.bucketField;
  if (key === 'sizeUnits') {
    const units = Number.parseFloat(input.value);
    context.bucket.sizeUnits = units;
    context.bucket.heightIn = bucketHeightFromUnits(units, context.lineup.unitHeightIn);
  } else if (key === 'heightIn') {
    const height = Number.parseFloat(input.value);
    context.bucket.heightIn = height;
    context.bucket.sizeUnits = bucketUnitsFromHeight(height, context.lineup.unitHeightIn);
  } else if (key === 'equipmentTag') {
    context.bucket.equipmentTag = input.value;
    context.bucket.loadTag = input.value;
  } else if (key === 'motorSpaceHeaterRequired') {
    context.bucket.motorSpaceHeaterRequired = input.checked;
    if (!input.checked) context.bucket.motorSpaceHeaterVa = '';
  } else if (key === 'motorSpaceHeaterVa') {
    context.bucket.motorSpaceHeaterVa = input.value;
  } else if (key === 'type') {
    if (input.value === 'main-mlo' || input.value === 'main-breaker') {
      context.bucket.type = 'main';
      context.bucket.mainDevice = input.value === 'main-breaker' ? 'breaker' : 'mlo';
      context.bucket.status = 'active';
    } else {
      context.bucket.type = input.value;
      context.bucket.mainDevice = '';
      if (input.value === 'space') context.bucket.status = 'space';
      if (input.value === 'spare') context.bucket.status = 'spare';
      if (context.bucket.status === 'space' && input.value !== 'space') context.bucket.status = 'active';
      if (context.bucket.status === 'spare' && input.value !== 'spare') context.bucket.status = 'active';
    }
  } else {
    context.bucket[key] = input.value;
  }
  state.lineups[activeIndex()] = normalizeMccLineup(context.lineup, activeIndex());
  persistLineups();
  renderPreservingBucketTableScroll();
}

function addLineup() {
  const lineup = createDefaultMccLineup(state.lineups.length);
  state.lineups.push(lineup);
  setActiveLineup(lineup);
  persistLineups();
  render();
}

function duplicateLineup() {
  const lineup = activeLineup();
  if (!lineup) return;
  const duplicate = cloneLineup(lineup);
  state.lineups.push(duplicate);
  setActiveLineup(duplicate);
  persistLineups();
  render();
}

function deleteLineup() {
  if (state.lineups.length <= 1) return;
  const index = activeIndex();
  state.lineups.splice(index, 1);
  setActiveLineup(state.lineups[Math.max(0, Math.min(index, state.lineups.length - 1))]);
  persistLineups();
  render();
}

function createSpaceBucket(lineup, index, heightIn = 12) {
  const bucketHeightIn = Math.max(1, Math.min(heightIn, Number.parseFloat(lineup.usableBucketHeightIn) || heightIn));
  return {
    id: createMccUniqueId('mcc-bkt'),
    label: `SPACE ${index + 1}`,
    type: 'space',
    mainDevice: '',
    status: 'space',
    sizeUnits: bucketUnitsFromHeight(bucketHeightIn, lineup.unitHeightIn),
    heightIn: bucketHeightIn,
    equipmentTag: '',
    equipmentDescription: '',
    loadTag: '',
    hp: '',
    breakerA: '',
    starterType: '',
    starterSize: '',
    motorSpaceHeaterRequired: false,
    motorSpaceHeaterVa: '',
    cableTag: '',
    notes: ''
  };
}

function createDefaultSectionSpaces(lineup) {
  const usableHeightIn = Number.parseFloat(lineup.usableBucketHeightIn);
  const spaceHeightIn = 12;
  const spaceCount = Math.max(1, Math.floor((Number.isFinite(usableHeightIn) ? usableHeightIn : spaceHeightIn) / spaceHeightIn));
  return Array.from({ length: spaceCount }, (_, index) => createSpaceBucket(lineup, index, spaceHeightIn));
}

function addSection() {
  const lineup = activeLineup();
  if (!lineup) return;
  lineup.sections.push({
    id: createMccUniqueId('mcc-sec'),
    name: `Section ${lineup.sections.length + 1}`,
    widthIn: 20,
    verticalWirewayWidthIn: DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN,
    buckets: createDefaultSectionSpaces(lineup)
  });
  state.lineups[activeIndex()] = normalizeMccLineup(lineup, activeIndex());
  persistLineups();
  render();
}

function duplicateSection(context) {
  const copy = JSON.parse(JSON.stringify(context.section));
  copy.id = createMccUniqueId('mcc-sec');
  copy.name = `${context.section.name} Copy`;
  copy.buckets = (copy.buckets || []).map(bucket => ({ ...bucket, id: createMccUniqueId('mcc-bkt') }));
  context.lineup.sections.splice(context.sectionIndex + 1, 0, copy);
  state.lineups[activeIndex()] = normalizeMccLineup(context.lineup, activeIndex());
  persistLineups();
  render();
}

function deleteSection(context) {
  context.lineup.sections.splice(context.sectionIndex, 1);
  state.lineups[activeIndex()] = normalizeMccLineup(context.lineup, activeIndex());
  persistLineups();
  render();
}

function addBucket(context) {
  context.section.buckets.push({
    id: createMccUniqueId('mcc-bkt'),
    label: `B${context.section.buckets.length + 1}`,
    type: 'starter',
    mainDevice: '',
    status: 'active',
    sizeUnits: 1,
    heightIn: bucketHeightFromUnits(1, context.lineup.unitHeightIn),
    equipmentTag: '',
    equipmentDescription: '',
    loadTag: '',
    hp: '',
    breakerA: '',
    starterType: 'fvnr',
    starterSize: '',
    motorSpaceHeaterRequired: false,
    motorSpaceHeaterVa: '',
    cableTag: '',
    notes: ''
  });
  state.lineups[activeIndex()] = normalizeMccLineup(context.lineup, activeIndex());
  persistLineups();
  render();
}

function moveBucket(context, direction) {
  const nextIndex = context.bucketIndex + direction;
  if (nextIndex < 0 || nextIndex >= context.section.buckets.length) return;
  const [bucket] = context.section.buckets.splice(context.bucketIndex, 1);
  context.section.buckets.splice(nextIndex, 0, bucket);
  persistLineups();
  render();
}

function moveBucketToIndex(sourceSectionIndex, sourceBucketIndex, targetSectionIndex, targetBucketIndex) {
  const lineup = activeLineup();
  if (!lineup) return;
  const sourceSection = lineup.sections[sourceSectionIndex];
  const targetSection = lineup.sections[targetSectionIndex];
  if (!sourceSection || !targetSection) return;
  if (sourceBucketIndex < 0 || sourceBucketIndex >= sourceSection.buckets.length) return;
  let insertIndex = Math.max(0, Math.min(targetBucketIndex, targetSection.buckets.length));
  const [bucket] = sourceSection.buckets.splice(sourceBucketIndex, 1);
  if (sourceSectionIndex === targetSectionIndex && sourceBucketIndex < insertIndex) {
    insertIndex -= 1;
  }
  targetSection.buckets.splice(insertIndex, 0, bucket);
  state.pendingBucketMove = null;
  state.lineups[activeIndex()] = normalizeMccLineup(lineup, activeIndex());
  persistLineups();
  render();
}

function canvasBucketElementAtPoint(clientX, clientY) {
  return document.elementFromPoint(clientX, clientY)?.closest('#mcc-elevation-preview [data-mcc-bucket-id]') || null;
}

function canvasBucketContext(element) {
  const bucketId = element?.dataset?.mccBucketId;
  return bucketSelection(activeLineup(), bucketId);
}

function clearCanvasBucketDropTargets() {
  document.querySelectorAll('#mcc-elevation-preview .mcc-canvas-drop-target').forEach(node => {
    node.classList.remove('mcc-canvas-drop-target');
  });
}

function beginCanvasBucketDrag(event, pointerId) {
  const bucketNode = event.target.closest('#mcc-elevation-preview [data-mcc-bucket-id]');
  if (!bucketNode || event.button !== 0 || canvasBucketDrag) return;
  const context = canvasBucketContext(bucketNode);
  if (!context) return;
  canvasBucketDrag = {
    pointerId,
    startX: event.clientX,
    startY: event.clientY,
    hasMoved: false,
    sourceBucketId: context.bucket.id,
    sourceSectionIndex: context.sectionIndex,
    sourceBucketIndex: context.bucketIndex,
    node: bucketNode
  };
  bucketNode.classList.add('mcc-bucket-node-dragging');
  event.preventDefault();
}

function startCanvasBucketPointerDrag(event) {
  beginCanvasBucketDrag(event, event.pointerId);
  if (!canvasBucketDrag) return;
  const bucketNode = event.target.closest('#mcc-elevation-preview [data-mcc-bucket-id]');
  bucketNode?.setPointerCapture?.(event.pointerId);
}

function startCanvasBucketMouseDrag(event) {
  beginCanvasBucketDrag(event, 'mouse');
}

function updateCanvasBucketDragTarget(clientX, clientY) {
  if (!canvasBucketDrag) return;
  const distance = Math.hypot(clientX - canvasBucketDrag.startX, clientY - canvasBucketDrag.startY);
  if (distance < 4) return;
  canvasBucketDrag.hasMoved = true;
  const target = canvasBucketElementAtPoint(clientX, clientY);
  clearCanvasBucketDropTargets();
  if (target && target.dataset.mccBucketId !== String(canvasBucketDrag.sourceBucketId)) {
    target.classList.add('mcc-canvas-drop-target');
  }
}

function updateCanvasBucketPointerTarget(event) {
  if (!canvasBucketDrag || event.pointerId !== canvasBucketDrag.pointerId) return;
  updateCanvasBucketDragTarget(event.clientX, event.clientY);
  event.preventDefault();
}

function updateCanvasBucketMouseTarget(event) {
  if (!canvasBucketDrag || event.buttons !== 1) return;
  updateCanvasBucketDragTarget(event.clientX, event.clientY);
  event.preventDefault();
}

function finishCanvasBucketDrag(clientX, clientY) {
  const drag = canvasBucketDrag;
  canvasBucketDrag = null;
  drag.node?.classList.remove('mcc-bucket-node-dragging');
  clearCanvasBucketDropTargets();
  if (!drag.hasMoved) return;
  suppressPreviewBucketClick = true;
  window.setTimeout(() => {
    suppressPreviewBucketClick = false;
  }, 0);
  const target = canvasBucketElementAtPoint(clientX, clientY);
  const targetContext = canvasBucketContext(target);
  if (!targetContext) {
    setStatus('Drop the bucket onto another bucket in the elevation view to move it.');
    return;
  }
  if (drag.sourceSectionIndex === targetContext.sectionIndex && drag.sourceBucketIndex === targetContext.bucketIndex) return;
  state.selectedBucketId = String(drag.sourceBucketId);
  moveBucketToIndex(drag.sourceSectionIndex, drag.sourceBucketIndex, targetContext.sectionIndex, targetContext.bucketIndex);
  setStatus(`Moved bucket to ${targetContext.section.name}.`);
}

function finishCanvasBucketPointerDrag(event) {
  if (!canvasBucketDrag || event.pointerId !== canvasBucketDrag.pointerId) return;
  finishCanvasBucketDrag(event.clientX, event.clientY);
  event.preventDefault();
}

function finishCanvasBucketMouseDrag(event) {
  if (!canvasBucketDrag) return;
  finishCanvasBucketDrag(event.clientX, event.clientY);
  event.preventDefault();
}

function cancelCanvasBucketPointerDrag(event) {
  if (!canvasBucketDrag || event.pointerId !== canvasBucketDrag.pointerId) return;
  canvasBucketDrag.node?.classList.remove('mcc-bucket-node-dragging');
  canvasBucketDrag = null;
  clearCanvasBucketDropTargets();
}

function handleBucketDragStart(event) {
  const handle = event.target.closest('[data-bucket-drag-handle]');
  if (!handle) return;
  const row = handle.closest('tr');
  const context = bucketForRow(row);
  if (!context || !event.dataTransfer) return;
  const payload = JSON.stringify({
    sectionIndex: context.sectionIndex,
    bucketIndex: context.bucketIndex
  });
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-mcc-bucket', payload);
  event.dataTransfer.setData('text/plain', payload);
  row?.classList.add('mcc-bucket-row-dragging');
}

function handleBucketDragEnd(event) {
  event.target.closest('tr')?.classList.remove('mcc-bucket-row-dragging');
  document.querySelectorAll('.mcc-bucket-row-drop-target').forEach(row => row.classList.remove('mcc-bucket-row-drop-target'));
}

function clearBucketDropTargets() {
  document.querySelectorAll('.mcc-bucket-row-drop-target').forEach(row => row.classList.remove('mcc-bucket-row-drop-target'));
}

function bucketRowAtPoint(clientX, clientY) {
  return document.elementFromPoint(clientX, clientY)?.closest('[data-bucket-id]') || null;
}

function beginBucketDrag(event, pointerId) {
  const handle = event.target.closest('[data-bucket-drag-handle]');
  if (!handle || event.button !== 0 || bucketPointerDrag) return;
  const row = handle.closest('tr');
  const context = bucketForRow(row);
  if (!context) return;
  state.pendingBucketMove = null;
  bucketPointerDrag = {
    pointerId,
    startX: event.clientX,
    startY: event.clientY,
    hasMoved: false,
    sourceSectionIndex: context.sectionIndex,
    sourceBucketIndex: context.bucketIndex,
    row
  };
  row.classList.add('mcc-bucket-row-dragging');
  event.preventDefault();
}

function startBucketPointerDrag(event) {
  beginBucketDrag(event, event.pointerId);
  if (!bucketPointerDrag) return;
  const handle = event.target.closest('[data-bucket-drag-handle]');
  handle.setPointerCapture?.(event.pointerId);
}

function startBucketMouseDrag(event) {
  beginBucketDrag(event, 'mouse');
}

function updateBucketDragTarget(clientX, clientY) {
  const distance = Math.hypot(clientX - bucketPointerDrag.startX, clientY - bucketPointerDrag.startY);
  if (distance < 4) return;
  bucketPointerDrag.hasMoved = true;
  const row = bucketRowAtPoint(clientX, clientY);
  clearBucketDropTargets();
  row?.classList.add('mcc-bucket-row-drop-target');
}

function updateBucketPointerTarget(event) {
  if (!bucketPointerDrag || event.pointerId !== bucketPointerDrag.pointerId) return;
  updateBucketDragTarget(event.clientX, event.clientY);
  event.preventDefault();
}

function updateBucketMouseTarget(event) {
  if (!bucketPointerDrag || event.buttons !== 1) return;
  updateBucketDragTarget(event.clientX, event.clientY);
  event.preventDefault();
}

function finishBucketDrag(clientX, clientY) {
  const drag = bucketPointerDrag;
  bucketPointerDrag = null;
  drag.row?.classList.remove('mcc-bucket-row-dragging');
  if (!drag.hasMoved) return;
  const row = bucketRowAtPoint(clientX, clientY);
  clearBucketDropTargets();
  if (!row) return;
  const targetContext = bucketForRow(row);
  if (!targetContext) return;
  if (drag.sourceSectionIndex === targetContext.sectionIndex && drag.sourceBucketIndex === targetContext.bucketIndex) return;
  moveBucketToIndex(drag.sourceSectionIndex, drag.sourceBucketIndex, targetContext.sectionIndex, targetContext.bucketIndex);
}

function finishBucketPointerDrag(event) {
  if (!bucketPointerDrag || event.pointerId !== bucketPointerDrag.pointerId) return;
  finishBucketDrag(event.clientX, event.clientY);
  event.preventDefault();
}

function finishBucketMouseDrag(event) {
  if (!bucketPointerDrag) return;
  finishBucketDrag(event.clientX, event.clientY);
  event.preventDefault();
}

function handlePendingBucketMoveClick(event) {
  if (!state.pendingBucketMove || event.target.closest('[data-bucket-drag-handle]')) return;
  const row = event.target.closest('[data-bucket-id]');
  if (!row) return;
  event.preventDefault();
  event.stopPropagation();
  finishClickBucketMove(bucketForRow(row));
}

function cancelBucketPointerDrag(event) {
  if (!bucketPointerDrag || event.pointerId !== bucketPointerDrag.pointerId) return;
  bucketPointerDrag.row?.classList.remove('mcc-bucket-row-dragging');
  bucketPointerDrag = null;
  clearBucketDropTargets();
}

function handleBucketDragOver(event) {
  const row = event.target.closest('[data-bucket-id]');
  const types = Array.from(event.dataTransfer?.types || []);
  if (!row || (!types.includes('application/x-mcc-bucket') && !types.includes('text/plain'))) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  clearBucketDropTargets();
  row.classList.add('mcc-bucket-row-drop-target');
}

function handleBucketDrop(event) {
  const row = event.target.closest('[data-bucket-id]');
  if (!row || !event.dataTransfer) return;
  const targetContext = bucketForRow(row);
  const raw = event.dataTransfer.getData('application/x-mcc-bucket') || event.dataTransfer.getData('text/plain');
  if (!targetContext || !raw) return;
  event.preventDefault();
  try {
    const source = JSON.parse(raw);
    moveBucketToIndex(source.sectionIndex, source.bucketIndex, targetContext.sectionIndex, targetContext.bucketIndex);
  } catch {
    setStatus('Unable to reorder that bucket.');
  }
}

function deleteBucket(context) {
  context.section.buckets.splice(context.bucketIndex, 1);
  persistLineups();
  render();
}

function handleSectionClick(event) {
  const dragHandle = event.target.closest('[data-bucket-drag-handle]');
  if (dragHandle) {
    const context = bucketForRow(dragHandle.closest('tr'));
    if (state.pendingBucketMove) {
      finishClickBucketMove(context);
    } else {
      beginClickBucketMove(context);
    }
    return;
  }

  const pendingTargetRow = event.target.closest('[data-bucket-id]');
  if (pendingTargetRow && state.pendingBucketMove) {
    finishClickBucketMove(bucketForRow(pendingTargetRow));
    return;
  }

  const sectionButton = event.target.closest('[data-section-action]');
  if (sectionButton) {
    const context = sectionForPanel(sectionButton.closest('.mcc-section-editor'));
    if (!context) return;
    const action = sectionButton.dataset.sectionAction;
    if (action === 'add-bucket') addBucket(context);
    if (action === 'duplicate-section') duplicateSection(context);
    if (action === 'delete-section') deleteSection(context);
    return;
  }

  const bucketButton = event.target.closest('[data-bucket-action]');
  if (bucketButton) {
    const context = bucketForRow(bucketButton.closest('tr'));
    if (!context) return;
    const action = bucketButton.dataset.bucketAction;
    if (action === 'up') moveBucket(context, -1);
    if (action === 'down') moveBucket(context, 1);
    if (action === 'delete') deleteBucket(context);
    return;
  }

  if (event.target.matches('input,select,textarea,button')) return;
  const bucketRow = event.target.closest('[data-bucket-id]');
  if (bucketRow) selectBucket(bucketRow.dataset.bucketId, { scrollRow: false });
}

function handleSectionChange(event) {
  if (event.target.matches('[data-section-field]')) {
    updateSectionField(event.target);
    return;
  }
  if (event.target.matches('[data-bucket-field]')) {
    updateBucketField(event.target);
  }
}

function syncEquipmentList() {
  const synced = syncMccLineupsToEquipment(dataStore.getEquipment(), state.lineups);
  const linkedCount = state.lineups.filter(lineup => String(lineup.equipmentTag || '').trim()).length;
  const standaloneCount = state.lineups.length - linkedCount;
  dataStore.setEquipment(synced);
  const skipped = standaloneCount
    ? ` ${standaloneCount} standalone lineup${standaloneCount === 1 ? '' : 's'} skipped.`
    : '';
  setStatus(`Synced ${linkedCount} MCC lineup${linkedCount === 1 ? '' : 's'} to the Equipment List.${skipped}`);
}

function downloadLineupSheet() {
  const lineup = activeLineup();
  if (!lineup) return;
  const svg = renderMccLineupSheetSvg(lineup);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${lineup.tag}-mcc-lineup.svg`.replace(/[^\w.-]+/g, '-').toLowerCase();
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ensureMccJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPdfLoadPromise) {
    jsPdfLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-mcc-jspdf]');
      const finish = () => {
        const JsPDF = window.jspdf?.jsPDF;
        if (JsPDF) resolve(JsPDF);
        else reject(new Error('jsPDF did not initialize.'));
      };
      if (existing) {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', () => reject(new Error('Unable to load jsPDF.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'dist/vendor/jspdf.umd.min.js';
      script.dataset.mccJspdf = 'true';
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => reject(new Error('Unable to load jsPDF.')), { once: true });
      document.head.appendChild(script);
    }).catch(error => {
      jsPdfLoadPromise = null;
      throw error;
    });
  }
  return jsPdfLoadPromise;
}

function sanitizeExportFilename(value, extension) {
  const base = String(value || 'mcc-lineup')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'mcc-lineup';
  return `${base}.${extension}`;
}

function svgViewBoxSize(svg, fallback = { width: 1200, height: 650 }) {
  const match = String(svg || '').match(/viewBox="\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*"/);
  if (!match) return fallback;
  const width = Number.parseFloat(match[1]);
  const height = Number.parseFloat(match[2]);
  return {
    width: Number.isFinite(width) && width > 0 ? width : fallback.width,
    height: Number.isFinite(height) && height > 0 ? height : fallback.height
  };
}

function svgToPngDataUrl(svg) {
  return new Promise((resolve, reject) => {
    const size = svgViewBoxSize(svg);
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.addEventListener('load', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(size.width * ratio);
        canvas.height = Math.ceil(size.height * ratio);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: size.width,
          height: size.height
        });
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    }, { once: true });
    image.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to render MCC SVG for PDF export.'));
    }, { once: true });
    image.src = url;
  });
}

function pdfCellText(value) {
  const text = String(value ?? '').trim();
  return text || '-';
}

function pdfBucketRows(lineup) {
  return lineup.sections.flatMap(section => {
    let usedHeightIn = 0;
    return section.buckets.map(bucket => {
      const position = mccBucketPositionLabel(usedHeightIn, bucket, lineup.unitHeightIn);
      usedHeightIn += Number.parseFloat(bucket.heightIn) || 0;
      return {
        section: section.name,
        position,
        tag: bucket.equipmentTag || bucket.loadTag || bucket.label,
        description: bucket.equipmentDescription,
        type: bucket.type,
        units: bucket.sizeUnits,
        height: bucket.heightIn,
        breaker: bucket.type === 'main'
          ? (mccMainDeviceLabel(bucket) || bucket.breakerA)
          : bucket.breakerA,
        starter: [mccStarterTypeLabel(bucket), bucket.starterSize].filter(Boolean).join(' / '),
        motorHeater: bucket.motorSpaceHeaterRequired
          ? (bucket.motorSpaceHeaterVa ? `Yes / ${bucket.motorSpaceHeaterVa} VA` : 'Yes')
          : 'No',
        cable: bucket.cableTag,
        notes: bucket.notes
      };
    });
  });
}

function pdfSpecRows(lineup) {
  const spec = normalizeMccSpecRequirements(lineup.specRequirements);
  const incomingLinePower = spec.incomingLinePower === 'other'
    ? pdfCellText(spec.incomingLinePowerOther || 'Other')
    : titleCaseOption(spec.incomingLinePower);
  const heaterStatus = spec.spaceHeaterRequired ? 'Required' : 'Not required';
  const heaterAccessories = spec.spaceHeaterRequired
    ? (spec.spaceHeaterAccessories.length
      ? spec.spaceHeaterAccessories.map(titleCaseOption).join(', ')
      : 'None specified')
    : 'Not applicable';
  const rows = [
    { group: 'Electrical', item: 'Voltage', value: lineup.voltage },
    { group: 'Electrical', item: 'Short-Circuit Rating', value: `${spec.shortCircuitRatingKa} kA` },
    { group: 'Electrical', item: 'Control Voltage', value: spec.controlVoltage },
    { group: 'Electrical', item: 'Incoming Line Power', value: incomingLinePower },
    { group: 'Electrical', item: 'Motor Protection Devices', value: titleCaseOption(spec.motorProtectionDevice) },
    { group: 'Bus', item: 'Horizontal Bus Rating', value: `${lineup.horizontalBusRatingA} A` },
    { group: 'Bus', item: 'Vertical Bus Rating', value: `${lineup.verticalBusRatingA} A` },
    { group: 'Bus', item: 'Bus Material', value: titleCaseOption(spec.busMaterial) },
    { group: 'Bus', item: 'Bus Plating', value: mccBusPlatingLabel(spec) },
    { group: 'Bus', item: 'Bus Join Plating', value: titleCaseOption(spec.busJoinPlating) },
    { group: 'Bus', item: 'Ground Bus Required', value: titleCaseOption(spec.groundBusRequired) },
    { group: 'Bus', item: 'Ground Bus Location', value: spec.groundBusRequired === 'yes' ? titleCaseOption(spec.groundBusLocation) : 'Not applicable' },
    { group: 'Construction', item: 'MCC Enclosure', value: spec.enclosureRating },
    { group: 'Construction', item: 'MCC Arrangement', value: titleCaseOption(spec.mccArrangement) },
    { group: 'Construction', item: 'Expansion Cover Plates', value: titleCaseOption(spec.expansionCoverPlates) },
    { group: 'Construction', item: 'Finish', value: spec.finish },
    { group: 'Controls', item: 'Communication Protocol', value: titleCaseOption(spec.communicationProtocol) },
    { group: 'Options', item: 'Space Heater', value: heaterStatus },
    { group: 'Options', item: 'Space Heater Voltage', value: spec.spaceHeaterRequired ? spec.spaceHeaterVoltage : 'Not applicable' },
    { group: 'Options', item: 'Space Heater Accessories', value: heaterAccessories }
  ];
  if (spec.notes) {
    rows.push({ group: 'Notes', item: 'Specification Notes', value: spec.notes });
  }
  return rows;
}

function pdfOneLineBranchCount(lineup) {
  return lineup.sections.reduce((count, section) => (
    count + section.buckets.filter(bucket => bucket.type !== 'main').length
  ), 0);
}

function addPdfHeader(doc, lineup, subtitle) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const report = lineup.reportTitleBlock || {};
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(report.projectName || `${lineup.tag} MCC Lineup Report`, 36, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);
  doc.text(`${lineup.tag} - ${lineup.name} / ${subtitle}`, 36, 50);
  doc.text(report.reportDate || new Date().toLocaleDateString(), pageWidth - 36, 50, { align: 'right' });
  doc.setDrawColor(203, 213, 225);
  doc.line(36, 60, pageWidth - 36, 60);
  return 78;
}

function addPdfTitleBlock(doc, lineup, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const report = lineup.reportTitleBlock || {};
  const cells = [
    ['Client', report.client],
    ['Drawing No.', report.drawingNumber],
    ['Revision', report.revision],
    ['Prepared By', report.preparedBy],
    ['Checked By', report.checkedBy],
    ['Date', report.reportDate || new Date().toLocaleDateString()]
  ];
  const margin = 36;
  const cellWidth = (pageWidth - margin * 2) / 3;
  const cellHeight = 28;
  cells.forEach((cell, index) => {
    const x = margin + (index % 3) * cellWidth;
    const y = startY + Math.floor(index / 3) * cellHeight;
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, cellWidth, cellHeight, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(75, 85, 99);
    doc.text(cell[0], x + 6, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text(doc.splitTextToSize(pdfCellText(cell[1]), cellWidth - 12), x + 6, y + 21);
  });
  return startY + cellHeight * 2 + 14;
}

function addPdfFooter(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text('Generated from CableTrayRoute MCC Lineups', 36, pageHeight - 18);
  doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - 36, pageHeight - 18, { align: 'right' });
}

function addSummaryGrid(doc, lineup, dimensions, startY) {
  const items = [
    ['Name', lineup.name],
    ['Voltage', lineup.voltage],
    ['Horizontal Bus', `${lineup.horizontalBusRatingA} A`],
    ['Vertical Bus', `${lineup.verticalBusRatingA} A`],
    ['Sections', dimensions.sectionCount],
    ['Buckets', dimensions.bucketCount],
    ['Dimensions', `${dimensions.totalWidthIn}" W x ${lineup.sectionDepthIn}" D x ${lineup.sectionHeightIn}" H`],
    ['Arrangement', lineup.arrangement],
    ['Specifications', 'See Specification Requirements page']
  ];
  const columnWidth = 238;
  const rowHeight = 18;
  items.forEach((item, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 36 + column * columnWidth;
    const y = startY + row * rowHeight;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    doc.text(`${item[0]}:`, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(17, 24, 39);
    doc.text(doc.splitTextToSize(pdfCellText(item[1]), columnWidth - 74), x + 66, y);
  });
  return startY + Math.ceil(items.length / 3) * rowHeight + 8;
}

function addSpecificationRequirements(doc, lineup, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const columns = [
    { key: 'group', label: 'Category', width: 96 },
    { key: 'item', label: 'Requirement', width: 190 },
    { key: 'value', label: 'Specified Value', width: pageWidth - margin * 2 - 286 }
  ];
  const rows = pdfSpecRows(lineup);
  const drawTableHeader = y => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text('Specification Requirements', margin, y);
    y += 10;
    doc.setFillColor(30, 64, 175);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    let x = margin;
    columns.forEach(column => {
      doc.rect(x, y, column.width, 18, 'F');
      doc.text(column.label, x + 5, y + 12);
      x += column.width;
    });
    return y + 18;
  };
  let y = drawTableHeader(startY);
  let previousGroup = '';
  rows.forEach((row, index) => {
    const cellsForRow = () => columns.map(column => {
      const value = column.key === 'group' && row.group === previousGroup ? '' : row[column.key];
      return doc.splitTextToSize(column.key === 'group' && value === '' ? '' : pdfCellText(value), column.width - 10);
    });
    let cells = cellsForRow();
    let rowHeight = Math.max(22, 9 * Math.max(...cells.map(cell => cell.length)) + 10);
    if (y + rowHeight > pageHeight - 42) {
      addPdfFooter(doc);
      doc.addPage('letter', 'landscape');
      previousGroup = '';
      y = drawTableHeader(addPdfHeader(doc, lineup, 'Specification Requirements'));
      cells = cellsForRow();
      rowHeight = Math.max(22, 9 * Math.max(...cells.map(cell => cell.length)) + 10);
    }
    let x = margin;
    cells.forEach((cell, cellIndex) => {
      const column = columns[cellIndex];
      doc.setDrawColor(203, 213, 225);
      if (index % 2 === 0) doc.setFillColor(248, 250, 252);
      else doc.setFillColor(255, 255, 255);
      doc.rect(x, y, column.width, rowHeight, 'FD');
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', cellIndex === 0 && String(cell[0] || '').trim() ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.text(cell, x + 5, y + 13);
      x += column.width;
    });
    previousGroup = row.group;
    y += rowHeight;
  });
  return y + 12;
}

function fitImageSize(image, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return {
    width: image.width * scale,
    height: image.height * scale
  };
}

async function addPdfOneLinePages(doc, lineup) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const availableWidth = pageWidth - margin * 2;
  const spacing = 70;
  const rowHeight = 230;
  const branchesPerRow = Math.max(1, Math.floor((availableWidth - 150) / spacing));
  const branchCount = pdfOneLineBranchCount(lineup);
  const rowCount = Math.max(1, Math.ceil(branchCount / branchesPerRow));
  let y = addPdfHeader(doc, lineup, 'Simple One-Line');
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    if (y + rowHeight > pageHeight - 42) {
      addPdfFooter(doc);
      doc.addPage('letter', 'landscape');
      y = addPdfHeader(doc, lineup, 'Simple One-Line');
    }
    const oneLineSvg = renderMccOneLineSvg(lineup, {
      spacing,
      fixedWidth: availableWidth,
      branchStartIndex: rowIndex * branchesPerRow,
      branchLimit: branchesPerRow,
      continuedAbove: rowIndex > 0,
      continuedBelow: rowIndex < rowCount - 1
    });
    const oneLineImage = await svgToPngDataUrl(oneLineSvg);
    doc.addImage(oneLineImage.dataUrl, 'PNG', margin, y, availableWidth, rowHeight, undefined, 'FAST');
    y += rowHeight + 16;
  }
  addPdfFooter(doc);
}

function addBucketSchedule(doc, lineup) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const columns = [
    { key: 'section', label: 'Section', width: 52 },
    { key: 'position', label: 'Pos.', width: 34 },
    { key: 'tag', label: 'Equipment Tag', width: 78 },
    { key: 'description', label: 'Equipment Description', width: 120 },
    { key: 'type', label: 'Type', width: 46 },
    { key: 'units', label: 'Units', width: 34 },
    { key: 'height', label: 'Ht.', width: 34 },
    { key: 'breaker', label: 'Main/Breaker', width: 62 },
    { key: 'starter', label: 'Starter', width: 60 },
    { key: 'motorHeater', label: 'Motor Htr', width: 64 },
    { key: 'cable', label: 'Cable', width: 52 },
    { key: 'notes', label: 'Notes', width: 64 }
  ];
  const drawHeader = y => {
    doc.setFillColor(30, 64, 175);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    let x = margin;
    columns.forEach(column => {
      doc.rect(x, y, column.width, 18, 'F');
      doc.text(column.label, x + 4, y + 12);
      x += column.width;
    });
    return y + 18;
  };

  let y = addPdfHeader(doc, lineup, 'Bucket Schedule');
  y = drawHeader(y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  pdfBucketRows(lineup).forEach(row => {
    const cells = columns.map(column => (
      doc.splitTextToSize(pdfCellText(row[column.key]), column.width - 8)
    ));
    const rowHeight = Math.max(22, Math.max(...cells.map(cell => cell.length)) * 9 + 8);
    if (y + rowHeight > pageHeight - 38) {
      addPdfFooter(doc);
      doc.addPage('letter', 'landscape');
      y = addPdfHeader(doc, lineup, 'Bucket Schedule');
      y = drawHeader(y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    let x = margin;
    cells.forEach((cell, index) => {
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
      doc.rect(x, y, columns[index].width, rowHeight, 'FD');
      doc.setTextColor(17, 24, 39);
      doc.text(cell, x + 4, y + 12);
      x += columns[index].width;
    });
    y += rowHeight;
  });
  addPdfFooter(doc);
}

async function downloadLineupPdfReport() {
  const lineup = activeLineup();
  if (!lineup) return;
  const normalized = normalizeMccLineup(lineup, activeIndex());
  setStatus('Generating MCC PDF report...');
  try {
    const JsPDF = await ensureMccJsPdf();
    const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    const dimensions = mccLineupDimensions(normalized);
    const elevationSvg = renderMccElevationSvg(normalized, { maxWidth: 1300, maxHeight: 650 });
    const elevationImage = await svgToPngDataUrl(elevationSvg);

    let y = addPdfHeader(doc, normalized, 'Elevation');
    y = addPdfTitleBlock(doc, normalized, y);
    y = addSummaryGrid(doc, normalized, dimensions, y);
    const elevationSize = fitImageSize(elevationImage, pageWidth - margin * 2, pageHeight - y - 54);
    doc.addImage(elevationImage.dataUrl, 'PNG', margin, y, elevationSize.width, elevationSize.height, undefined, 'FAST');
    addPdfFooter(doc);

    doc.addPage('letter', 'landscape');
    await addPdfOneLinePages(doc, normalized);

    doc.addPage('letter', 'landscape');
    y = addPdfHeader(doc, normalized, 'Specification Requirements');
    addSpecificationRequirements(doc, normalized, y);
    addPdfFooter(doc);

    doc.addPage('letter', 'landscape');
    addBucketSchedule(doc, normalized);
    doc.save(sanitizeExportFilename(`${normalized.tag}-mcc-lineup-report`, 'pdf'));
    setStatus(`Exported PDF report for ${normalized.tag}.`);
  } catch (error) {
    console.error(error);
    setStatus('Unable to export the MCC PDF report. Check the browser console for details.');
  }
}

function handlePreviewBucketSelection(event) {
  if (suppressPreviewBucketClick) {
    event.preventDefault();
    return;
  }
  const target = event.target.closest('[data-mcc-bucket-id]');
  if (!target) return;
  selectBucket(target.dataset.mccBucketId);
}

function handlePreviewBucketKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target.closest('[data-mcc-bucket-id]');
  if (!target) return;
  event.preventDefault();
  selectBucket(target.dataset.mccBucketId);
}

function ensureStarterSizeChartTooltip() {
  let tooltip = document.getElementById('mcc-starter-chart-tooltip');
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'mcc-starter-chart-tooltip';
  tooltip.className = 'mcc-starter-chart-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.innerHTML = starterSizeChartContent();
  document.body.appendChild(tooltip);
  return tooltip;
}

function hideStarterSizeChartTooltip() {
  const tooltip = document.getElementById('mcc-starter-chart-tooltip');
  if (tooltip) {
    tooltip.classList.remove('is-visible');
    tooltip.setAttribute('aria-hidden', 'true');
  }
  document.querySelectorAll('.mcc-info-button[aria-expanded="true"]').forEach(button => {
    button.setAttribute('aria-expanded', 'false');
  });
}

function showStarterSizeChartTooltip(button) {
  const tooltip = ensureStarterSizeChartTooltip();
  tooltip.classList.add('is-visible');
  tooltip.setAttribute('aria-hidden', 'false');
  document.querySelectorAll('.mcc-info-button').forEach(item => {
    item.setAttribute('aria-expanded', item === button ? 'true' : 'false');
  });
}

function handleStarterSizeChartTooltipClick(event) {
  const button = event.target.closest('.mcc-info-button');
  const tooltip = document.getElementById('mcc-starter-chart-tooltip');
  if (!button) {
    if (tooltip && !tooltip.contains(event.target)) hideStarterSizeChartTooltip();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (button.getAttribute('aria-expanded') === 'true') {
    hideStarterSizeChartTooltip();
  } else {
    showStarterSizeChartTooltip(button);
  }
}

function handleStarterSizeChartTooltipKeydown(event) {
  if (event.key === 'Escape') hideStarterSizeChartTooltip();
}

function bindUi() {
  document.getElementById('mcc-lineup-select')?.addEventListener('change', event => {
    state.activeId = event.target.value;
    persistLineups();
    render();
  });
  document.getElementById('add-mcc-lineup')?.addEventListener('click', addLineup);
  document.getElementById('duplicate-mcc-lineup')?.addEventListener('click', duplicateLineup);
  document.getElementById('delete-mcc-lineup')?.addEventListener('click', deleteLineup);
  document.getElementById('apply-mcc-profile')?.addEventListener('click', applySelectedProfile);
  document.getElementById('add-mcc-section')?.addEventListener('click', addSection);
  document.getElementById('sync-mcc-equipment')?.addEventListener('click', syncEquipmentList);
  document.getElementById('export-mcc-lineup-svg')?.addEventListener('click', downloadLineupSheet);
  document.getElementById('export-mcc-lineup-pdf')?.addEventListener('click', downloadLineupPdfReport);
  document.querySelectorAll('[data-mcc-lineup-field]').forEach(input => {
    input.addEventListener('change', () => updateActiveLineupField(input.dataset.mccLineupField, input.value));
  });
  document.querySelectorAll('[data-mcc-spec-field]').forEach(input => {
    input.addEventListener('change', () => updateSpecRequirementField(input));
  });
  document.querySelectorAll('[data-mcc-report-field]').forEach(input => {
    input.addEventListener('change', () => updateReportTitleBlockField(input));
  });
  const sections = document.getElementById('mcc-section-list');
  sections?.addEventListener('click', handlePendingBucketMoveClick, true);
  sections?.addEventListener('click', handleSectionClick);
  sections?.addEventListener('change', handleSectionChange);
  sections?.addEventListener('pointerdown', startBucketPointerDrag);
  sections?.addEventListener('mousedown', startBucketMouseDrag);
  sections?.addEventListener('dragstart', handleBucketDragStart);
  sections?.addEventListener('dragend', handleBucketDragEnd);
  sections?.addEventListener('dragover', handleBucketDragOver);
  sections?.addEventListener('drop', handleBucketDrop);
  document.addEventListener('pointermove', updateBucketPointerTarget);
  document.addEventListener('pointerup', finishBucketPointerDrag);
  document.addEventListener('pointercancel', cancelBucketPointerDrag);
  document.addEventListener('mousemove', updateBucketMouseTarget);
  document.addEventListener('mouseup', finishBucketMouseDrag);
  ['mcc-elevation-preview', 'mcc-oneline-preview'].forEach(id => {
    const preview = document.getElementById(id);
    preview?.addEventListener('click', handlePreviewBucketSelection);
    preview?.addEventListener('keydown', handlePreviewBucketKeydown);
  });
  const elevationPreview = document.getElementById('mcc-elevation-preview');
  elevationPreview?.addEventListener('pointerdown', startCanvasBucketPointerDrag);
  elevationPreview?.addEventListener('mousedown', startCanvasBucketMouseDrag);
  document.addEventListener('pointermove', updateCanvasBucketPointerTarget);
  document.addEventListener('pointerup', finishCanvasBucketPointerDrag);
  document.addEventListener('pointercancel', cancelCanvasBucketPointerDrag);
  document.addEventListener('mousemove', updateCanvasBucketMouseTarget);
  document.addEventListener('mouseup', finishCanvasBucketMouseDrag);
  document.addEventListener('click', handleStarterSizeChartTooltipClick);
  document.addEventListener('keydown', handleStarterSizeChartTooltipKeydown);
}

function initialize() {
  loadLineups();
  const params = new URLSearchParams(window.location.search);
  const requestedLineupId = params.get('mccLineupId');
  if (requestedLineupId) {
    const requestedLineup = state.lineups.find(lineup => String(lineup.id) === requestedLineupId);
    if (requestedLineup) setActiveLineup(requestedLineup);
  }
  renderProfilePresetOptions();
  bindUi();
  render();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initialize);
}
