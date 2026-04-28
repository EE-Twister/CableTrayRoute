import { interpolateTime } from './tccAutoCoord.mjs';
import { scaleCurve } from './tccUtils.js';

export const PROTECTION_SETTING_SHEET_VERSION = 'protection-setting-sheet-v1';

const PROTECTIVE_TYPES = new Set(['breaker', 'fuse', 'relay', 'relay_87', 'recloser', 'contactor', 'switch']);
const STANDARD_FUNCTIONS = new Set(['50', '51', '50N', '51N', '50G', '51G', '87', 'custom']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback = null) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value, fallback = null) {
  const parsed = finiteNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function parseRatio(value, primaryKey, secondaryKey, row = {}) {
  const directPrimary = positive(row[primaryKey]);
  const directSecondary = positive(row[secondaryKey]);
  if (directPrimary || directSecondary) {
    return { primary: directPrimary, secondary: directSecondary };
  }
  if (value && typeof value === 'object') {
    return {
      primary: positive(value.primary ?? value.primaryA ?? value.primaryV),
      secondary: positive(value.secondary ?? value.secondaryA ?? value.secondaryV),
    };
  }
  if (typeof value === 'number') {
    return { primary: positive(value), secondary: null };
  }
  const text = String(value || '').trim();
  if (!text) return { primary: null, secondary: null };
  const match = text.match(/([0-9.]+)\s*[:/]\s*([0-9.]+)/);
  if (!match) return { primary: positive(text), secondary: null };
  return {
    primary: positive(match[1]),
    secondary: positive(match[2]),
  };
}

function normalizeExistingSheets(existingSheets = []) {
  const rows = asArray(existingSheets.deviceRows ? existingSheets.deviceRows : existingSheets);
  const byComponent = new Map();
  rows.forEach(row => {
    const key = row.componentId || row.oneLineRef || row.deviceId || row.id;
    if (key) byComponent.set(String(key), row);
  });
  return byComponent;
}

function flattenOneLineComponents(oneLine = {}) {
  return asArray(oneLine.sheets).flatMap((sheet, sheetIndex) => {
    const sheetName = sheet.name || sheet.id || `Sheet ${sheetIndex + 1}`;
    return asArray(sheet.components).map(component => ({
      sheet,
      sheetIndex,
      sheetName,
      component,
    }));
  });
}

function findCatalogDevice(protectiveDevices = [], id) {
  if (!id) return null;
  return asArray(protectiveDevices).find(device => device.id === id || device.name === id) || null;
}

function componentLabel(component = {}) {
  return component.label || component.tag || component.name || component.id || 'Protective Device';
}

function componentProps(component = {}) {
  return asObject(component.props);
}

function normalizeFunctionCode(value) {
  const text = String(value || '').trim();
  return STANDARD_FUNCTIONS.has(text) ? text : 'custom';
}

function settingSource(field, overrides = {}, baseSettings = {}) {
  if (Object.prototype.hasOwnProperty.call(overrides, field)) return 'override';
  if (Object.prototype.hasOwnProperty.call(baseSettings, field)) return 'catalog';
  return 'derived';
}

function secondaryValue(primaryValue, row) {
  if (!Number.isFinite(primaryValue) || !Number.isFinite(row.ctPrimaryA) || !Number.isFinite(row.ctSecondaryA) || row.ctPrimaryA <= 0) {
    return null;
  }
  return round(primaryValue * (row.ctSecondaryA / row.ctPrimaryA), 4);
}

function buildFunctionRowsForDevice(deviceRow, catalogDevice = null) {
  const settings = asObject(deviceRow.settings);
  const baseSettings = asObject(catalogDevice?.settings);
  const overrides = asObject(deviceRow.overrides);
  const rows = [];
  const tolerance = catalogDevice?.tolerance || { timeLower: 0.8, timeUpper: 1.2 };

  const longPickup = positive(firstDefined(settings.pickup, settings.longTimePickup, settings.ampRating));
  if (longPickup) {
    rows.push({
      functionCode: '51',
      functionName: 'Phase time overcurrent',
      enabled: true,
      pickupA: round(longPickup, 3),
      secondaryPickupA: secondaryValue(longPickup, deviceRow),
      delaySec: round(finiteNumber(firstDefined(settings.time, settings.delay, settings.longTimeDelay)), 4),
      timeDial: round(finiteNumber(firstDefined(settings.tms, settings.time, settings.longTimeDelay)), 4),
      curveFamily: settings.curveFamily || catalogDevice?.curveFamily || '',
      curveProfile: settings.curveProfile || settings.curveProfileLabel || '',
      instantaneousPickupA: null,
      tolerance,
      source: settingSource('pickup', overrides, baseSettings),
    });
  }

  const instantaneous = positive(firstDefined(settings.instantaneousPickup, settings.instantaneous));
  if (instantaneous) {
    rows.push({
      functionCode: '50',
      functionName: 'Phase instantaneous overcurrent',
      enabled: true,
      pickupA: round(instantaneous, 3),
      secondaryPickupA: secondaryValue(instantaneous, deviceRow),
      delaySec: round(finiteNumber(settings.instantaneousDelay, 0.01), 4),
      timeDial: null,
      curveFamily: '',
      curveProfile: settings.curveProfile || settings.curveProfileLabel || '',
      instantaneousPickupA: round(instantaneous, 3),
      tolerance,
      source: settingSource('instantaneous', overrides, baseSettings),
    });
  }

  const groundPickup = positive(firstDefined(settings.groundPickup, settings.groundFaultPickup, settings.gfpPickup));
  const groundInstantaneous = positive(firstDefined(settings.groundInstantaneous, settings.groundFaultInstantaneous, settings.gfpInstantaneous));
  if (catalogDevice?.groundFault || groundPickup || groundInstantaneous) {
    rows.push({
      functionCode: catalogDevice?.groundFault ? '51G' : '51N',
      functionName: catalogDevice?.groundFault ? 'Ground time overcurrent' : 'Neutral time overcurrent',
      enabled: Boolean(groundPickup),
      pickupA: round(groundPickup, 3),
      secondaryPickupA: secondaryValue(groundPickup, deviceRow),
      delaySec: round(finiteNumber(firstDefined(settings.groundDelay, settings.groundFaultDelay, settings.gfpDelay)), 4),
      timeDial: round(finiteNumber(firstDefined(settings.groundTms, settings.groundTimeDial)), 4),
      curveFamily: settings.groundCurveFamily || '',
      curveProfile: settings.groundCurveProfile || '',
      instantaneousPickupA: null,
      tolerance,
      source: groundPickup ? 'catalog' : 'missingData',
    });
    rows.push({
      functionCode: catalogDevice?.groundFault ? '50G' : '50N',
      functionName: catalogDevice?.groundFault ? 'Ground instantaneous overcurrent' : 'Neutral instantaneous overcurrent',
      enabled: Boolean(groundInstantaneous),
      pickupA: round(groundInstantaneous, 3),
      secondaryPickupA: secondaryValue(groundInstantaneous, deviceRow),
      delaySec: round(finiteNumber(settings.groundInstantaneousDelay), 4),
      timeDial: null,
      curveFamily: '',
      curveProfile: '',
      instantaneousPickupA: round(groundInstantaneous, 3),
      tolerance,
      source: groundInstantaneous ? 'catalog' : 'missingData',
    });
  }

  if (catalogDevice?.type === 'relay_87' || settings.differentialPickup || settings.slope1Pct) {
    const diffPickup = positive(settings.differentialPickup || settings.pickup);
    rows.push({
      functionCode: '87',
      functionName: 'Differential protection',
      enabled: Boolean(diffPickup),
      pickupA: round(diffPickup, 3),
      secondaryPickupA: secondaryValue(diffPickup, deviceRow),
      delaySec: round(finiteNumber(settings.differentialDelay, 0), 4),
      timeDial: null,
      curveFamily: '',
      curveProfile: '',
      instantaneousPickupA: null,
      tolerance,
      source: diffPickup ? 'catalog' : 'missingData',
    });
  }

  const consumed = new Set([
    'pickup', 'longTimePickup', 'ampRating', 'time', 'delay', 'longTimeDelay', 'tms',
    'instantaneousPickup', 'instantaneous', 'instantaneousDelay', 'curveFamily', 'curveProfile',
    'curveProfileLabel', 'groundPickup', 'groundFaultPickup', 'gfpPickup', 'groundDelay',
    'groundFaultDelay', 'gfpDelay', 'groundTms', 'groundTimeDial', 'groundCurveFamily',
    'groundCurveProfile', 'groundInstantaneous', 'groundFaultInstantaneous', 'gfpInstantaneous',
    'groundInstantaneousDelay', 'differentialPickup', 'differentialDelay', 'slope1Pct',
  ]);
  Object.entries(settings)
    .filter(([key]) => !consumed.has(key))
    .forEach(([key, value]) => {
      rows.push({
        functionCode: 'custom',
        functionName: key,
        enabled: true,
        pickupA: positive(value),
        secondaryPickupA: secondaryValue(positive(value), deviceRow),
        delaySec: null,
        timeDial: null,
        curveFamily: '',
        curveProfile: '',
        instantaneousPickupA: null,
        tolerance,
        source: settingSource(key, overrides, baseSettings),
      });
    });

  if (!rows.length) {
    rows.push({
      functionCode: 'custom',
      functionName: 'Unmapped device setting',
      enabled: false,
      pickupA: null,
      secondaryPickupA: null,
      delaySec: null,
      timeDial: null,
      curveFamily: '',
      curveProfile: '',
      instantaneousPickupA: null,
      tolerance,
      source: 'missingData',
    });
  }

  return rows.map((row, index) => {
    const missingFields = [];
    if (row.enabled && !Number.isFinite(row.pickupA)) missingFields.push('pickupA');
    if (row.enabled && !Number.isFinite(row.secondaryPickupA)) missingFields.push('ctRatio');
    const status = !row.enabled ? 'disabled' : missingFields.length ? 'missingData' : 'pass';
    return {
      id: `${deviceRow.id}-fn-${index + 1}`,
      deviceRowId: deviceRow.id,
      componentId: deviceRow.componentId,
      deviceTag: deviceRow.deviceTag,
      ...row,
      functionCode: normalizeFunctionCode(row.functionCode),
      status,
      missingFields,
      recommendation: status === 'missingData'
        ? 'Complete CT ratio and pickup data before issuing the setting sheet.'
        : status === 'disabled'
          ? 'Confirm this expected protection function is intentionally disabled or not applicable.'
          : 'Keep this function row with the active setting-sheet revision.',
    };
  });
}

export function normalizeProtectionSettingSheet(input = {}) {
  const row = asObject(input);
  return {
    id: row.id || row.packageId || 'protection-setting-sheet',
    version: row.version || PROTECTION_SETTING_SHEET_VERSION,
    generatedAt: row.generatedAt || null,
    projectName: row.projectName || 'Untitled Project',
    summary: row.summary || {
      deviceCount: asArray(row.deviceRows).length,
      functionCount: asArray(row.functionRows).length,
      testCount: asArray(row.testRows).length,
      missingData: 0,
      warn: 0,
      pass: 0,
    },
    deviceRows: asArray(row.deviceRows),
    functionRows: asArray(row.functionRows),
    settingGroupRows: asArray(row.settingGroupRows),
    testRows: asArray(row.testRows),
    coordinationBasis: row.coordinationBasis || null,
    revisionHistory: asArray(row.revisionHistory),
    warnings: asArray(row.warnings),
    assumptions: asArray(row.assumptions),
    approval: row.approval || null,
  };
}

export function validateProtectionSettingSheet(sheet = {}, catalogDevice = null) {
  const warnings = [];
  if (!sheet.catalogDeviceId && !catalogDevice) warnings.push('No catalog protective device is linked.');
  if (!Number.isFinite(sheet.ctPrimaryA) || !Number.isFinite(sheet.ctSecondaryA)) warnings.push('CT ratio is missing.');
  if (!sheet.reviewer) warnings.push('Setting revision has no reviewer.');
  if (!sheet.revision || sheet.revision === 'R0') warnings.push('Setting revision is still draft or unset.');
  const status = warnings.some(warning => /CT ratio|catalog/i.test(warning)) ? 'missingData'
    : warnings.length ? 'warn' : 'pass';
  return {
    status,
    warnings,
    recommendation: status === 'pass'
      ? 'Setting-sheet device metadata is traceable.'
      : 'Complete linked catalog, CT/PT, revision, and reviewer metadata before release.',
  };
}

export function buildProtectionSettingRows({
  oneLine = {},
  tccSettings = {},
  protectiveDevices = [],
  existingSheets = [],
} = {}) {
  const existingByComponent = normalizeExistingSheets(existingSheets);
  const tcc = asObject(tccSettings);
  const deviceRows = [];
  const functionRows = [];
  const settingGroupRows = [];
  const warnings = [];

  flattenOneLineComponents(oneLine)
    .filter(({ component }) => PROTECTIVE_TYPES.has(component?.type) || component?.tccId)
    .forEach(({ component, sheetName }, index) => {
      const props = componentProps(component);
      const existing = existingByComponent.get(String(component.id)) || {};
      const catalogDeviceId = firstDefined(component.tccId, props.tccId, existing.catalogDeviceId);
      const catalogDevice = findCatalogDevice(protectiveDevices, catalogDeviceId);
      const overrides = {
        ...asObject(component.tccOverrides),
        ...asObject(tcc.componentOverrides?.[component.id]),
        ...asObject(existing.overrides),
      };
      const settings = {
        ...asObject(catalogDevice?.settings),
        ...overrides,
      };
      const ct = parseRatio(firstDefined(existing.ctRatio, props.ctRatio, component.ctRatio), 'ctPrimaryA', 'ctSecondaryA', {
        ...props,
        ...existing,
      });
      const pt = parseRatio(firstDefined(existing.ptRatio, props.ptRatio, component.ptRatio), 'ptPrimaryV', 'ptSecondaryV', {
        ...props,
        ...existing,
      });
      const row = {
        id: existing.id || `ps-device-${index + 1}`,
        componentId: component.id || `component-${index + 1}`,
        oneLineRef: component.id || '',
        sheetName,
        deviceTag: componentLabel(component),
        catalogDeviceId: catalogDeviceId || '',
        manufacturer: existing.manufacturer || catalogDevice?.vendor || catalogDevice?.manufacturer || '',
        model: existing.model || catalogDevice?.name || '',
        voltage: firstDefined(existing.voltage, props.voltage, props.voltageClass, component.voltage, ''),
        ctPrimaryA: round(ct.primary, 3),
        ctSecondaryA: round(ct.secondary, 3),
        ptPrimaryV: round(pt.primary, 3),
        ptSecondaryV: round(pt.secondary, 3),
        connectedBus: existing.connectedBus || props.connectedBus || props.bus || component.bus || '',
        role: existing.role || props.protectionRole || props.role || 'unspecified',
        activeGroup: existing.activeGroup || props.activeGroup || 'Group 1',
        revision: existing.revision || props.settingRevision || 'R0',
        reviewer: existing.reviewer || props.reviewer || '',
        settings,
        overrides,
      };
      const validation = validateProtectionSettingSheet(row, catalogDevice);
      row.status = validation.status;
      row.missingFields = validation.warnings;
      row.recommendation = validation.recommendation;
      deviceRows.push(row);
      if (validation.warnings.length) {
        warnings.push(...validation.warnings.map(message => `${row.deviceTag}: ${message}`));
      }
      const functions = buildFunctionRowsForDevice(row, catalogDevice);
      functionRows.push(...functions);
      settingGroupRows.push({
        id: `${row.id}-group`,
        deviceRowId: row.id,
        componentId: row.componentId,
        deviceTag: row.deviceTag,
        activeGroup: row.activeGroup,
        revision: row.revision,
        reviewer: row.reviewer,
        functionCount: functions.length,
        status: !row.reviewer || row.revision === 'R0' ? 'warn' : 'pass',
      });
    });

  return { deviceRows, functionRows, settingGroupRows, warnings };
}

export function buildProtectionTestRows(settingRows = [], options = {}) {
  const protectiveDevices = asArray(options.protectiveDevices);
  const deviceRows = asArray(settingRows.deviceRows || options.deviceRows);
  const functionRows = asArray(settingRows.functionRows || settingRows);
  const deviceMap = new Map(deviceRows.map(row => [row.id, row]));
  return functionRows
    .filter(row => row.enabled !== false)
    .map((row, index) => {
      const deviceRow = deviceMap.get(row.deviceRowId) || {};
      const catalogDevice = findCatalogDevice(protectiveDevices, deviceRow.catalogDeviceId);
      const scaled = catalogDevice ? scaleCurve(catalogDevice, deviceRow.settings || {}) : null;
      const baseTestCurrent = row.functionCode === '50' || row.functionCode === '50G' || row.functionCode === '50N'
        ? positive(row.instantaneousPickupA, positive(row.pickupA))
        : positive(row.pickupA);
      const testCurrentPrimaryA = Number.isFinite(baseTestCurrent)
        ? baseTestCurrent * (row.functionCode === '50' || row.functionCode === '50G' || row.functionCode === '50N' ? 1.1 : 2)
        : null;
      const expectedTripSec = scaled && Number.isFinite(testCurrentPrimaryA)
        ? interpolateTime(scaled.curve || [], testCurrentPrimaryA)
        : null;
      const tolerance = scaled?.tolerance || row.tolerance || { timeLower: 0.8, timeUpper: 1.2 };
      const secondaryInjectionA = secondaryValue(testCurrentPrimaryA, deviceRow);
      const missingFields = [];
      if (!catalogDevice) missingFields.push('catalogDevice');
      if (!Number.isFinite(testCurrentPrimaryA)) missingFields.push('testCurrentPrimaryA');
      if (!Number.isFinite(secondaryInjectionA)) missingFields.push('ctRatio');
      if (!Number.isFinite(expectedTripSec)) missingFields.push('expectedTripSec');
      const status = missingFields.length ? 'missingData' : 'pass';
      return {
        id: `ps-test-${index + 1}`,
        deviceRowId: row.deviceRowId,
        componentId: row.componentId,
        deviceTag: row.deviceTag,
        functionCode: row.functionCode,
        testCurrentPrimaryA: round(testCurrentPrimaryA, 3),
        secondaryInjectionA: round(secondaryInjectionA, 4),
        expectedTripSec: round(expectedTripSec, 4),
        toleranceMinSec: Number.isFinite(expectedTripSec) ? round(expectedTripSec * tolerance.timeLower, 4) : null,
        toleranceMaxSec: Number.isFinite(expectedTripSec) ? round(expectedTripSec * tolerance.timeUpper, 4) : null,
        status,
        missingFields,
        recommendation: status === 'pass'
          ? 'Record secondary-injection test result against this expected operating time.'
          : 'Complete catalog and CT data before calculating relay test values.',
      };
    });
}

export function buildProtectionSettingPackage({
  projectName = 'Untitled Project',
  oneLine = {},
  tccSettings = {},
  protectiveDevices = [],
  coordinationState = null,
  existingSheets = [],
  approval = null,
  generatedAt = null,
} = {}) {
  const timestamp = generatedAt || new Date().toISOString();
  const rows = buildProtectionSettingRows({ oneLine, tccSettings, protectiveDevices, existingSheets });
  const testRows = buildProtectionTestRows(rows, { protectiveDevices });
  const warnings = [
    ...rows.warnings,
    ...rows.functionRows
      .filter(row => row.status === 'missingData' || row.status === 'disabled')
      .map(row => `${row.deviceTag} ${row.functionCode}: ${row.recommendation}`),
    ...testRows
      .filter(row => row.status === 'missingData')
      .map(row => `${row.deviceTag} ${row.functionCode}: test values missing ${row.missingFields.join(', ')}`),
  ];
  const summary = {
    deviceCount: rows.deviceRows.length,
    functionCount: rows.functionRows.length,
    testCount: testRows.length,
    pass: [
      ...rows.deviceRows,
      ...rows.functionRows,
      ...testRows,
    ].filter(row => row.status === 'pass').length,
    warn: rows.settingGroupRows.filter(row => row.status === 'warn').length,
    missingData: [
      ...rows.deviceRows,
      ...rows.functionRows,
      ...testRows,
    ].filter(row => row.status === 'missingData').length,
    disabledFunctions: rows.functionRows.filter(row => row.status === 'disabled').length,
    warningCount: warnings.length,
    activeRevisionCount: new Set(rows.settingGroupRows.map(row => row.revision).filter(Boolean)).size,
    coordinationLinked: Boolean(coordinationState),
  };

  return {
    version: PROTECTION_SETTING_SHEET_VERSION,
    generatedAt: timestamp,
    projectName,
    summary,
    deviceRows: rows.deviceRows,
    functionRows: rows.functionRows,
    settingGroupRows: rows.settingGroupRows,
    testRows,
    coordinationBasis: coordinationState ? {
      maxFaultA: round(finiteNumber(coordinationState.maxFaultA), 3),
      margin: round(finiteNumber(coordinationState.margin), 3),
      coordinated: Boolean(coordinationState.result?.allCoordinated && (!coordinationState.gfpResult || coordinationState.gfpResult.allCoordinated)),
      phaseResultCount: asArray(coordinationState.result?.results).length,
      groundResultCount: asArray(coordinationState.gfpResult?.results).length,
    } : null,
    revisionHistory: rows.settingGroupRows.map(row => ({
      deviceRowId: row.deviceRowId,
      deviceTag: row.deviceTag,
      activeGroup: row.activeGroup,
      revision: row.revision,
      reviewer: row.reviewer,
      status: row.status,
    })),
    warnings,
    assumptions: [
      'Protection setting sheets are local engineering governance records tied to plotted TCC device settings.',
      'Relay test values are deterministic secondary-injection screening values from CT/PT metadata and TCC curves.',
      'Native manufacturer relay setting files and formal commissioning signoff are outside v1 scope.',
    ],
    approval,
  };
}

export function renderProtectionSettingSheetHTML(pkg = {}) {
  const normalized = normalizeProtectionSettingSheet(pkg);
  const summary = normalized.summary || {};
  return `<section class="report-section" id="rpt-protection-setting-sheets">
  <h2>Protection Setting Sheets</h2>
  <p class="report-note">Local setting governance record only; not a native relay settings file or commissioning signoff.</p>
  <dl class="report-dl">
    <dt>Devices</dt><dd>${escapeHtml(summary.deviceCount || 0)}</dd>
    <dt>Functions</dt><dd>${escapeHtml(summary.functionCount || 0)}</dd>
    <dt>Test Rows</dt><dd>${escapeHtml(summary.testCount || 0)}</dd>
    <dt>Missing Data</dt><dd>${escapeHtml(summary.missingData || 0)}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Device</th><th>Catalog</th><th>CT</th><th>PT</th><th>Group</th><th>Revision</th><th>Status</th></tr></thead>
      <tbody>${normalized.deviceRows.length ? normalized.deviceRows.map(row => `<tr>
        <td>${escapeHtml(row.deviceTag)}</td>
        <td>${escapeHtml(row.catalogDeviceId || row.model || '—')}</td>
        <td>${escapeHtml(row.ctPrimaryA ?? '—')}:${escapeHtml(row.ctSecondaryA ?? '—')}</td>
        <td>${escapeHtml(row.ptPrimaryV ?? '—')}:${escapeHtml(row.ptSecondaryV ?? '—')}</td>
        <td>${escapeHtml(row.activeGroup)}</td>
        <td>${escapeHtml(row.revision)}</td>
        <td>${escapeHtml(row.status)}</td>
      </tr>`).join('') : '<tr><td colspan="7">No protection setting rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Device</th><th>Function</th><th>Pickup A</th><th>Secondary A</th><th>Delay</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${normalized.functionRows.length ? normalized.functionRows.map(row => `<tr>
        <td>${escapeHtml(row.deviceTag)}</td>
        <td>${escapeHtml(row.functionCode)}</td>
        <td>${escapeHtml(row.pickupA ?? '—')}</td>
        <td>${escapeHtml(row.secondaryPickupA ?? '—')}</td>
        <td>${escapeHtml(row.delaySec ?? row.timeDial ?? '—')}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="7">No function rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Device</th><th>Function</th><th>Primary Test A</th><th>Secondary Test A</th><th>Expected Trip s</th><th>Tolerance s</th><th>Status</th></tr></thead>
      <tbody>${normalized.testRows.length ? normalized.testRows.map(row => `<tr>
        <td>${escapeHtml(row.deviceTag)}</td>
        <td>${escapeHtml(row.functionCode)}</td>
        <td>${escapeHtml(row.testCurrentPrimaryA ?? '—')}</td>
        <td>${escapeHtml(row.secondaryInjectionA ?? '—')}</td>
        <td>${escapeHtml(row.expectedTripSec ?? '—')}</td>
        <td>${escapeHtml(row.toleranceMinSec ?? '—')} - ${escapeHtml(row.toleranceMaxSec ?? '—')}</td>
        <td>${escapeHtml(row.status)}</td>
      </tr>`).join('') : '<tr><td colspan="7">No relay test rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${normalized.warnings.length ? `<p class="report-note">${normalized.warnings.map(escapeHtml).join(' | ')}</p>` : ''}
</section>`;
}
