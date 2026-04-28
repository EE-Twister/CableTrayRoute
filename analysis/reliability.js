const VISUAL_TYPES = new Set(['dimension', 'annotation']);
export const RELIABILITY_NETWORK_VERSION = 'reliability-network-v1';

function isVisualComponent(comp) {
  return comp ? VISUAL_TYPES.has(comp.type) : false;
}

function isConnectorComponent(comp) {
  if (!comp) return false;
  const type = (comp.type || '').toLowerCase();
  if (!type) return false;
  if (type.includes('link')) return true;
  if (type.includes('cable')) return true;
  if (type.includes('feeder')) return true;
  if (type.includes('conductor')) return true;
  if (type.includes('tap')) return true;
  if (type.includes('splice')) return true;
  return false;
}

export function runReliability(components = []) {
  // Filter out non-operational components like dimensions or annotations
  const ops = components.filter(c => !isVisualComponent(c));
  const eligible = ops.filter(c => !isConnectorComponent(c));
  // Compute component availability and expected downtime per year
  const componentStats = {};
  const availMap = {};
  eligible.forEach(c => {
    const mtbf = Number(c.mtbf);
    const mttr = Number(c.mttr);
    if (mtbf > 0 && mttr >= 0) {
      const availability = mtbf / (mtbf + mttr);
      // expected downtime hours per year
      const downtime = (8760 / mtbf) * mttr;
      componentStats[c.id] = { availability, downtime };
      availMap[c.id] = { p: availability, q: 1 - availability };
    }
  });

  const expectedOutage = Object.values(componentStats).reduce((sum, s) => sum + s.downtime, 0);

  // Minimal cut set probabilities up to N-2
  const baseProd = Object.values(availMap).reduce((p, v) => p * v.p, 1) || 1;
  const n1Failures = [];
  const n2Failures = [];
  const n1Impacts = [];
  const n2Impacts = [];
  const n1FailureDetails = {};
  const unavailability = n1Impacts.reduce((s, i) => s + i.probability, 0)
    + n2Impacts.reduce((s, i) => s + i.probability, 0);
  const systemAvailability = 1 - unavailability;

  return {
    systemAvailability,
    expectedOutage,
    componentStats,
    n1Failures,
    n2Failures,
    n1Impacts,
    n2Impacts,
    n1FailureDetails
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value = '') {
  return String(value ?? '').trim();
}

function num(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 4) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function requireNonNegative(value, field, fallback = 0) {
  const parsed = num(value, fallback);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative number`);
  return parsed;
}

function requirePositive(value, field, fallback = 1) {
  const parsed = num(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be greater than zero`);
  return parsed;
}

function componentLabel(row = {}) {
  return text(row.tag || row.label || row.name || row.id || row.componentId || row.elementId);
}

function matchesCustomer(component = {}, customer = {}) {
  if (customer.componentId && customer.componentId === component.id) return true;
  if (customer.elementId && customer.elementId === component.id) return true;
  if (customer.protectionZone && component.protectionZone && customer.protectionZone === component.protectionZone) return true;
  if (customer.zone && component.protectionZone && customer.zone === component.protectionZone) return true;
  return false;
}

function matchesRestoration(component = {}, row = {}) {
  if (!row.enabled) return false;
  if (row.affectedComponentId && row.affectedComponentId === component.id) return true;
  if (row.affectedZone && component.protectionZone && row.affectedZone === component.protectionZone) return true;
  if (!row.affectedComponentId && !row.affectedZone) return true;
  return false;
}

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function normalizeReliabilityModel(input = {}) {
  const source = input.model || input;
  const annualHours = requirePositive(source.annualHours, 'annualHours', 8760);
  return {
    scenarioMode: text(source.scenarioMode || 'n1'),
    includeN1: source.includeN1 !== false,
    includeN2: Boolean(source.includeN2),
    includeCommonMode: source.includeCommonMode !== false,
    restorationEnabled: source.restorationEnabled !== false,
    defaultValueOfLostLoadPerKwh: requireNonNegative(source.defaultValueOfLostLoadPerKwh ?? source.valueOfLostLoadPerKwh, 'defaultValueOfLostLoadPerKwh', 10),
    saidiReviewLimitHours: requireNonNegative(source.saidiReviewLimitHours, 'saidiReviewLimitHours', 4),
    saifiReviewLimit: requireNonNegative(source.saifiReviewLimit, 'saifiReviewLimit', 1),
    eensReviewLimitKwh: requireNonNegative(source.eensReviewLimitKwh, 'eensReviewLimitKwh', 1000),
    annualHours,
    notes: text(source.notes || ''),
  };
}

export function normalizeReliabilityComponentRows(rows = [], options = {}) {
  const explicitRows = asArray(rows);
  const sourceRows = explicitRows.length ? explicitRows : asArray(options.components);
  return sourceRows
    .filter(row => row && !isVisualComponent(row) && !isConnectorComponent(row))
    .map((row, index) => {
      const id = text(row.id || row.componentId || row.elementId || `component-${index + 1}`);
      const mtbfHours = num(row.mtbfHours ?? row.mtbf, null);
      const failureRatePerYear = num(row.failureRatePerYear, mtbfHours > 0 ? (options.model?.annualHours || 8760) / mtbfHours : null);
      const repairTimeHours = num(row.repairTimeHours ?? row.mttrHours ?? row.mttr, null);
      const missingFields = [];
      if (!Number.isFinite(failureRatePerYear) || failureRatePerYear < 0) missingFields.push('failureRatePerYear');
      if (!Number.isFinite(repairTimeHours) || repairTimeHours < 0) missingFields.push('repairTimeHours');
      if (Number.isFinite(failureRatePerYear) && failureRatePerYear < 0) throw new Error(`componentRows[${index}].failureRatePerYear must be non-negative`);
      if (Number.isFinite(repairTimeHours) && repairTimeHours < 0) throw new Error(`componentRows[${index}].repairTimeHours must be non-negative`);
      return {
        id,
        tag: componentLabel(row) || id,
        type: text(row.type || row.componentType || 'component'),
        failureRatePerYear: Number.isFinite(failureRatePerYear) ? round(failureRatePerYear, 6) : null,
        mtbfHours: Number.isFinite(mtbfHours) ? round(mtbfHours, 3) : null,
        repairTimeHours: Number.isFinite(repairTimeHours) ? round(repairTimeHours, 3) : null,
        switchingTimeHours: requireNonNegative(row.switchingTimeHours ?? row.switchingHours, `componentRows[${index}].switchingTimeHours`, 0),
        isolationTimeHours: requireNonNegative(row.isolationTimeHours ?? row.isolationHours, `componentRows[${index}].isolationTimeHours`, 0),
        protectionZone: text(row.protectionZone || row.zone || ''),
        commonModeGroup: text(row.commonModeGroup || ''),
        enabled: row.enabled !== false,
        notes: text(row.notes || ''),
        missingFields,
      };
    });
}

export function normalizeReliabilityCustomerRows(rows = [], options = {}) {
  const explicitRows = asArray(rows);
  const sourceRows = explicitRows.length ? explicitRows : asArray(options.customers);
  return sourceRows.map((row, index) => {
    const customerCount = num(row.customerCount ?? row.customers, null);
    const loadKw = num(row.loadKw ?? row.kw, 0);
    if (Number.isFinite(customerCount) && customerCount < 0) throw new Error(`customerRows[${index}].customerCount must be non-negative`);
    if (Number.isFinite(loadKw) && loadKw < 0) throw new Error(`customerRows[${index}].loadKw must be non-negative`);
    const missingFields = [];
    if (!Number.isFinite(customerCount)) missingFields.push('customerCount');
    return {
      id: text(row.id || `customer-${index + 1}`),
      name: text(row.name || row.group || row.tag || `Customer Group ${index + 1}`),
      componentId: text(row.componentId || row.elementId || ''),
      protectionZone: text(row.protectionZone || row.zone || ''),
      customerCount: Number.isFinite(customerCount) ? customerCount : null,
      loadKw: Number.isFinite(loadKw) ? loadKw : 0,
      loadClass: text(row.loadClass || 'general'),
      valueOfLostLoadPerKwh: requireNonNegative(row.valueOfLostLoadPerKwh ?? row.voll ?? options.model?.defaultValueOfLostLoadPerKwh, `customerRows[${index}].valueOfLostLoadPerKwh`, options.model?.defaultValueOfLostLoadPerKwh ?? 10),
      critical: Boolean(row.critical),
      notes: text(row.notes || ''),
      missingFields,
    };
  });
}

export function normalizeReliabilityRestorationRows(rows = [], options = {}) {
  const explicitRows = asArray(rows);
  const sourceRows = explicitRows.length ? explicitRows : asArray(options.restoration);
  return sourceRows.map((row, index) => {
    const pickupCapacityKw = num(row.pickupCapacityKw ?? row.capacityKw, null);
    if (Number.isFinite(pickupCapacityKw) && pickupCapacityKw < 0) throw new Error(`restorationRows[${index}].pickupCapacityKw must be non-negative`);
    const missingFields = [];
    if (!text(row.tieSourceId || row.sourceId)) missingFields.push('tieSourceId');
    if (!text(row.switchingDevice || row.switchId)) missingFields.push('switchingDevice');
    if (!Number.isFinite(pickupCapacityKw)) missingFields.push('pickupCapacityKw');
    return {
      id: text(row.id || `restoration-${index + 1}`),
      tieSourceId: text(row.tieSourceId || row.sourceId || ''),
      switchingDevice: text(row.switchingDevice || row.switchId || ''),
      affectedZone: text(row.affectedZone || row.protectionZone || row.zone || ''),
      affectedComponentId: text(row.affectedComponentId || row.componentId || ''),
      restorationTimeHours: requireNonNegative(row.restorationTimeHours ?? row.timeHours, `restorationRows[${index}].restorationTimeHours`, 1),
      pickupCapacityKw: Number.isFinite(pickupCapacityKw) ? pickupCapacityKw : null,
      mode: text(row.mode || 'manual'),
      enabled: row.enabled !== false,
      notes: text(row.notes || ''),
      missingFields,
    };
  });
}

export function evaluateReliabilityNetworkModel(context = {}, options = {}) {
  const model = normalizeReliabilityModel(context.model || options.model || {});
  const componentRows = normalizeReliabilityComponentRows(context.componentRows || [], { components: context.components || [], model });
  const customerRows = normalizeReliabilityCustomerRows(context.customerRows || [], { customers: context.customers || [], model });
  const restorationRows = normalizeReliabilityRestorationRows(context.restorationRows || [], { restoration: context.restoration || [], model });
  const warningRows = [];
  if (!customerRows.length) warningRows.push({ severity: 'warning', code: 'missingCustomerRows', message: 'Customer/load impact rows are missing; SAIFI/SAIDI/EENS/ECOST cannot be fully evaluated.' });
  const totalCustomers = customerRows.reduce((sum, row) => sum + (Number(row.customerCount) || 0), 0);
  if (totalCustomers <= 0) warningRows.push({ severity: 'warning', code: 'missingCustomerCount', message: 'Total customer count is zero or missing.' });
  componentRows.forEach(row => {
    if (row.missingFields.length) warningRows.push({ severity: 'warning', code: 'missingComponentReliabilityData', sourceId: row.id, message: `${row.tag} is missing ${row.missingFields.join(', ')}.` });
  });
  customerRows.forEach(row => {
    if (row.missingFields.length) warningRows.push({ severity: 'warning', code: 'missingCustomerData', sourceId: row.id, message: `${row.name} is missing ${row.missingFields.join(', ')}.` });
  });
  restorationRows.forEach(row => {
    if (row.missingFields.length) warningRows.push({ severity: 'warning', code: 'missingRestorationData', sourceId: row.id, message: `${row.id} is missing ${row.missingFields.join(', ')}.` });
  });
  const scenarioRows = [];
  const contributorRows = [];
  componentRows.filter(row => row.enabled).forEach(component => {
    if (!Number.isFinite(component.failureRatePerYear) || !Number.isFinite(component.repairTimeHours)) return;
    const affectedCustomers = customerRows.filter(customer => matchesCustomer(component, customer));
    const affectedCustomerCount = affectedCustomers.reduce((sum, row) => sum + (Number(row.customerCount) || 0), 0);
    const affectedLoadKw = affectedCustomers.reduce((sum, row) => sum + (Number(row.loadKw) || 0), 0);
    const restoration = model.restorationEnabled ? restorationRows.find(row => matchesRestoration(component, row)) : null;
    const baseDuration = component.repairTimeHours + component.switchingTimeHours + component.isolationTimeHours;
    const capacityOk = restoration ? (restoration.pickupCapacityKw == null ? false : restoration.pickupCapacityKw >= affectedLoadKw) : false;
    const restoredDuration = restoration && capacityOk ? Math.min(baseDuration, restoration.restorationTimeHours) : baseDuration;
    const customerInterruptions = component.failureRatePerYear * affectedCustomerCount;
    const customerHours = customerInterruptions * restoredDuration;
    const energyNotServedKwh = component.failureRatePerYear * affectedLoadKw * restoredDuration;
    const economicCost = affectedCustomers.reduce((sum, row) => {
      const share = affectedLoadKw > 0 ? (row.loadKw || 0) / affectedLoadKw : 0;
      return sum + (energyNotServedKwh * share * row.valueOfLostLoadPerKwh);
    }, 0);
    const status = affectedCustomerCount === 0 ? 'missingData' : restoration && !capacityOk ? 'warn' : 'pass';
    const scenario = {
      id: `n1-${component.id}`,
      scenarioType: 'N-1',
      componentId: component.id,
      componentTag: component.tag,
      protectionZone: component.protectionZone,
      failureRatePerYear: component.failureRatePerYear,
      affectedCustomerCount,
      affectedLoadKw: round(affectedLoadKw, 3),
      outageDurationHours: round(restoredDuration, 3),
      baseOutageDurationHours: round(baseDuration, 3),
      restorationId: restoration?.id || '',
      restorationApplied: Boolean(restoration && capacityOk),
      customerInterruptions: round(customerInterruptions, 6),
      customerHours: round(customerHours, 6),
      energyNotServedKwh: round(energyNotServedKwh, 6),
      economicCost: round(economicCost, 2),
      status,
      recommendation: status === 'missingData'
        ? 'Assign customer/load impact rows to this component or protection zone.'
        : status === 'warn'
          ? 'Review tie-source pickup capacity or restoration scope.'
          : 'Scenario is represented in reliability indices.',
    };
    scenarioRows.push(scenario);
    contributorRows.push({
      id: `contributor-${component.id}`,
      componentId: component.id,
      componentTag: component.tag,
      protectionZone: component.protectionZone,
      commonModeGroup: component.commonModeGroup,
      customerInterruptions: scenario.customerInterruptions,
      customerHours: scenario.customerHours,
      energyNotServedKwh: scenario.energyNotServedKwh,
      economicCost: scenario.economicCost,
      rankScore: round((scenario.customerHours || 0) + ((scenario.energyNotServedKwh || 0) / 1000), 6),
      status,
    });
  });
  const groups = new Map();
  componentRows.filter(row => row.enabled && row.commonModeGroup).forEach(row => {
    if (!groups.has(row.commonModeGroup)) groups.set(row.commonModeGroup, []);
    groups.get(row.commonModeGroup).push(row);
  });
  if (model.includeCommonMode) {
    groups.forEach((components, group) => {
      if (components.length < 2) return;
      const componentIds = components.map(row => row.id);
      const impacted = customerRows.filter(customer => components.some(component => matchesCustomer(component, customer)));
      const affectedCustomerCount = impacted.reduce((sum, row) => sum + (Number(row.customerCount) || 0), 0);
      const affectedLoadKw = impacted.reduce((sum, row) => sum + (Number(row.loadKw) || 0), 0);
      const lambda = Math.max(...components.map(row => row.failureRatePerYear || 0)) * 0.1;
      const duration = Math.max(...components.map(row => row.repairTimeHours || 0));
      const customerInterruptions = lambda * affectedCustomerCount;
      const customerHours = customerInterruptions * duration;
      const energyNotServedKwh = lambda * affectedLoadKw * duration;
      const economicCost = impacted.reduce((sum, row) => {
        const share = affectedLoadKw > 0 ? (row.loadKw || 0) / affectedLoadKw : 0;
        return sum + (energyNotServedKwh * share * row.valueOfLostLoadPerKwh);
      }, 0);
      scenarioRows.push({
        id: `common-mode-${group}`,
        scenarioType: 'commonMode',
        componentId: componentIds.join(','),
        componentTag: group,
        protectionZone: [...new Set(components.map(row => row.protectionZone).filter(Boolean))].join(','),
        failureRatePerYear: round(lambda, 6),
        affectedCustomerCount,
        affectedLoadKw: round(affectedLoadKw, 3),
        outageDurationHours: round(duration, 3),
        baseOutageDurationHours: round(duration, 3),
        restorationId: '',
        restorationApplied: false,
        customerInterruptions: round(customerInterruptions, 6),
        customerHours: round(customerHours, 6),
        energyNotServedKwh: round(energyNotServedKwh, 6),
        economicCost: round(economicCost, 2),
        status: 'warn',
        recommendation: 'Review common-mode outage assumptions and physical independence.',
      });
      warningRows.push({ severity: 'warning', code: 'commonModeGroup', sourceId: group, message: `Common-mode group ${group} contains ${components.length} components.` });
    });
  }
  contributorRows.sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0) || a.componentTag.localeCompare(b.componentTag));
  contributorRows.forEach((row, index) => { row.rank = index + 1; });
  return { model, componentRows, customerRows, restorationRows, scenarioRows, contributorRows, warningRows };
}

export function buildReliabilityIndices(evaluation = {}) {
  const customerRows = asArray(evaluation.customerRows);
  const scenarioRows = asArray(evaluation.scenarioRows);
  const model = evaluation.model || normalizeReliabilityModel({});
  const totalCustomers = customerRows.reduce((sum, row) => sum + (Number(row.customerCount) || 0), 0);
  const customerInterruptions = scenarioRows.reduce((sum, row) => sum + (Number(row.customerInterruptions) || 0), 0);
  const customerHours = scenarioRows.reduce((sum, row) => sum + (Number(row.customerHours) || 0), 0);
  const energyNotServedKwh = scenarioRows.reduce((sum, row) => sum + (Number(row.energyNotServedKwh) || 0), 0);
  const economicCost = scenarioRows.reduce((sum, row) => sum + (Number(row.economicCost) || 0), 0);
  const saifi = totalCustomers > 0 ? customerInterruptions / totalCustomers : null;
  const saidi = totalCustomers > 0 ? customerHours / totalCustomers : null;
  const caidi = saifi > 0 ? saidi / saifi : null;
  const asai = saidi == null ? null : Math.max(0, 1 - (saidi / model.annualHours));
  return [
    { id: 'SAIFI', label: 'SAIFI', value: round(saifi, 6), unit: 'interruptions/customer-year', status: saifi == null ? 'missingData' : saifi > model.saifiReviewLimit ? 'warn' : 'pass' },
    { id: 'SAIDI', label: 'SAIDI', value: round(saidi, 6), unit: 'hours/customer-year', status: saidi == null ? 'missingData' : saidi > model.saidiReviewLimitHours ? 'warn' : 'pass' },
    { id: 'CAIDI', label: 'CAIDI', value: round(caidi, 6), unit: 'hours/interruption', status: caidi == null ? 'missingData' : 'pass' },
    { id: 'ASAI', label: 'ASAI', value: round(asai, 8), unit: 'pu', status: asai == null ? 'missingData' : asai < 0.999 ? 'warn' : 'pass' },
    { id: 'EENS', label: 'EENS', value: round(energyNotServedKwh, 3), unit: 'kWh/year', status: energyNotServedKwh > model.eensReviewLimitKwh ? 'warn' : 'pass' },
    { id: 'ECOST', label: 'ECOST', value: round(economicCost, 2), unit: 'currency/year', status: economicCost > 0 ? 'review' : 'pass' },
  ];
}

function summarizeReliabilityPackage(evaluation, indexRows, warningRows) {
  const indexWarn = indexRows.filter(row => row.status === 'warn' || row.status === 'review').length;
  const missingData = [
    ...evaluation.componentRows,
    ...evaluation.customerRows,
    ...evaluation.restorationRows,
    ...evaluation.scenarioRows,
    ...indexRows,
  ].filter(row => row.status === 'missingData' || row.missingFields?.length).length;
  return {
    componentCount: evaluation.componentRows.length,
    customerGroupCount: evaluation.customerRows.length,
    restorationCount: evaluation.restorationRows.length,
    scenarioCount: evaluation.scenarioRows.length,
    totalCustomers: evaluation.customerRows.reduce((sum, row) => sum + (Number(row.customerCount) || 0), 0),
    totalLoadKw: round(evaluation.customerRows.reduce((sum, row) => sum + (Number(row.loadKw) || 0), 0), 3),
    saifi: indexRows.find(row => row.id === 'SAIFI')?.value ?? null,
    saidi: indexRows.find(row => row.id === 'SAIDI')?.value ?? null,
    caidi: indexRows.find(row => row.id === 'CAIDI')?.value ?? null,
    asai: indexRows.find(row => row.id === 'ASAI')?.value ?? null,
    eensKwh: indexRows.find(row => row.id === 'EENS')?.value ?? null,
    ecost: indexRows.find(row => row.id === 'ECOST')?.value ?? null,
    warningCount: warningRows.length,
    indexWarn,
    missingData,
    status: missingData ? 'review' : indexWarn || warningRows.length ? 'review' : 'pass',
  };
}

export function buildReliabilityNetworkPackage(context = {}) {
  if (context.version === RELIABILITY_NETWORK_VERSION && context.summary) return context;
  const legacyResult = context.legacyResult || (context.componentStats ? context : context.reliability);
  const components = context.components || context.componentRows || [];
  const evaluation = evaluateReliabilityNetworkModel({
    model: context.model || {},
    components,
    componentRows: context.componentRows || [],
    customerRows: context.customerRows || [],
    restorationRows: context.restorationRows || [],
  });
  const indexRows = buildReliabilityIndices(evaluation);
  const warningRows = [...evaluation.warningRows];
  if (legacyResult && !legacyResult.version) {
    warningRows.push({ severity: 'warning', code: 'legacyReliabilityResult', message: 'Legacy reliability result has no customer-index model basis.' });
  }
  const summary = summarizeReliabilityPackage(evaluation, indexRows, warningRows);
  return {
    version: RELIABILITY_NETWORK_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || 'Untitled Project',
    legacyResult: legacyResult || runReliability(components),
    model: evaluation.model,
    componentRows: evaluation.componentRows,
    customerRows: evaluation.customerRows,
    restorationRows: evaluation.restorationRows,
    scenarioRows: evaluation.scenarioRows,
    indexRows,
    contributorRows: evaluation.contributorRows,
    warningRows,
    assumptions: [
      'Reliability network results are deterministic screening indices using local component, customer, and restoration assumptions.',
      'Restoration rows reduce outage duration only when tie-source capacity and affected zone/component metadata are explicit.',
      'Common-mode scenarios are simplified engineering-review rows and do not replace a full distribution automation restoration solver.',
    ],
    summary,
  };
}

export function renderReliabilityNetworkHTML(pkg = {}) {
  const packageData = buildReliabilityNetworkPackage(pkg);
  const table = (rows, columns) => `<table class="report-table"><thead><tr>${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map(row => `<tr>${columns.map(col => `<td>${escapeHtml(col.format ? col.format(row[col.key], row) : row[col.key])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">No rows.</td></tr>`
  }</tbody></table>`;
  return `<section class="report-section" id="rpt-reliability-network">
  <h2>Reliability Network Model and Customer Indices</h2>
  <p class="report-note">Local reliability screening package with failure/repair data, customer impact rows, restoration assumptions, and IEEE-style customer interruption indices.</p>
  <dl class="report-dl">
    <dt>Components</dt><dd>${escapeHtml(packageData.summary.componentCount)}</dd>
    <dt>Customer Groups</dt><dd>${escapeHtml(packageData.summary.customerGroupCount)}</dd>
    <dt>SAIFI</dt><dd>${escapeHtml(packageData.summary.saifi ?? 'n/a')}</dd>
    <dt>SAIDI</dt><dd>${escapeHtml(packageData.summary.saidi ?? 'n/a')} hr/customer-year</dd>
    <dt>Status</dt><dd>${escapeHtml(packageData.summary.status)}</dd>
  </dl>
  <h3>Reliability Indices</h3>
  ${table(packageData.indexRows, [
    { key: 'label', label: 'Index' },
    { key: 'value', label: 'Value' },
    { key: 'unit', label: 'Unit' },
    { key: 'status', label: 'Status' },
  ])}
  <h3>Top Contributors</h3>
  ${table(packageData.contributorRows.slice(0, 10), [
    { key: 'rank', label: 'Rank' },
    { key: 'componentTag', label: 'Component' },
    { key: 'customerHours', label: 'Customer Hours' },
    { key: 'energyNotServedKwh', label: 'EENS kWh' },
    { key: 'economicCost', label: 'ECOST' },
    { key: 'status', label: 'Status' },
  ])}
  <h3>Scenario Rows</h3>
  ${table(packageData.scenarioRows, [
    { key: 'scenarioType', label: 'Scenario' },
    { key: 'componentTag', label: 'Component' },
    { key: 'affectedCustomerCount', label: 'Customers' },
    { key: 'outageDurationHours', label: 'Duration hr' },
    { key: 'restorationApplied', label: 'Restored' },
    { key: 'status', label: 'Status' },
    { key: 'recommendation', label: 'Recommendation' },
  ])}
  <h3>Warnings</h3>
  <ul>${packageData.warningRows.length ? packageData.warningRows.map(row => `<li><strong>${escapeHtml(row.severity)}:</strong> ${escapeHtml(row.message)}</li>`).join('') : '<li>No reliability warnings.</li>'}</ul>
</section>`;
}
