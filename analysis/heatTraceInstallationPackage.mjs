import { buildHeatTraceBranchSchedule } from './heatTraceReport.mjs';

export const HEAT_TRACE_PACKAGE_VERSION = 'heat-trace-installation-package-v1';

export const DEFAULT_HEAT_TRACE_PRODUCT_FAMILIES = [
  {
    id: 'sr-industrial',
    label: 'Self-regulating industrial family',
    cableType: 'selfRegulating',
    allowedVoltages: [120, 208, 240, 277, 480],
    wattDensityOptionsWPerFt: [3, 5, 8, 10, 12, 15, 20],
    maxCircuitLengthFt: 500,
    exposureRatings: ['indoor-still', 'outdoor-sheltered', 'outdoor-windy', 'hazardous-area'],
    hazardousAreaSuitable: true,
    startupCurrentNote: 'Verify cold-start current multiplier against manufacturer breaker tables.',
    verificationNote: 'Final selection requires manufacturer output curve, T-rating, and maximum circuit length verification.',
  },
  {
    id: 'cw-process',
    label: 'Constant-watt process family',
    cableType: 'constantWattage',
    allowedVoltages: [120, 208, 240, 277, 480],
    wattDensityOptionsWPerFt: [5, 8, 10, 12, 15, 20, 25],
    maxCircuitLengthFt: 350,
    exposureRatings: ['indoor-still', 'outdoor-sheltered', 'outdoor-windy'],
    hazardousAreaSuitable: false,
    startupCurrentNote: 'Constant output assumed; verify sheath temperature and controller strategy.',
    verificationNote: 'Confirm zone length, over-temperature protection, and termination kit compatibility.',
  },
  {
    id: 'pl-zone',
    label: 'Power-limiting zone family',
    cableType: 'powerLimiting',
    allowedVoltages: [120, 208, 240, 277],
    wattDensityOptionsWPerFt: [5, 8, 10, 12, 15, 20],
    maxCircuitLengthFt: 400,
    exposureRatings: ['indoor-still', 'outdoor-sheltered', 'outdoor-windy', 'hazardous-area'],
    hazardousAreaSuitable: true,
    startupCurrentNote: 'Verify zone length and startup current at minimum ambient temperature.',
    verificationNote: 'Use manufacturer zone tables for final output and branch length.',
  },
  {
    id: 'mi-high-temp',
    label: 'Mineral-insulated high-temperature family',
    cableType: 'mineralInsulated',
    allowedVoltages: [120, 208, 240, 277, 480, 600],
    wattDensityOptionsWPerFt: [8, 10, 12, 15, 20, 25, 30, 40, 50],
    maxCircuitLengthFt: 1000,
    exposureRatings: ['indoor-still', 'outdoor-sheltered', 'outdoor-windy', 'hazardous-area', 'buried'],
    hazardousAreaSuitable: true,
    startupCurrentNote: 'Verify resistance design, cold resistance, and circuit protection with manufacturer software.',
    verificationNote: 'Final MI design requires manufacturer resistance schedule, bend radius, and termination details.',
  },
];

export const DEFAULT_HEAT_TRACE_ACCESSORY_RULES = {
  powerConnection: {
    description: 'Power connection kit',
    unit: 'ea',
    basis: 'One per heat-trace branch.',
  },
  endSeal: {
    description: 'End seal kit',
    unit: 'ea',
    basis: 'One per heat-trace branch.',
  },
  labelTag: {
    description: 'Circuit identification label/tag',
    unit: 'ea',
    basis: 'One per heat-trace branch.',
  },
  controller: {
    description: 'Thermostat/controller allowance',
    unit: 'ea',
    basis: 'One per controller schedule group.',
  },
  rtdSensor: {
    description: 'RTD or temperature sensor allowance',
    unit: 'ea',
    basis: 'One per controller schedule group.',
  },
  valveKit: {
    description: 'Valve/component insulation kit allowance',
    unit: 'ea',
    basis: 'Quantity follows valve component allowances.',
  },
  spliceKit: {
    description: 'Splice kit allowance',
    unit: 'ea',
    basis: 'Quantity follows flange/custom component allowances and manual overrides.',
  },
  teeKit: {
    description: 'Tee/tap kit allowance',
    unit: 'ea',
    basis: 'Quantity follows instrument tap component allowances and manual overrides.',
  },
  attachmentKit: {
    description: 'Attachment/support kit allowance',
    unit: 'ea',
    basis: 'Quantity follows pipe support allowances.',
  },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(asNumber(value) * factor) / factor;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function metadataFromCase(caseItem = {}) {
  const nested = caseItem.construction && typeof caseItem.construction === 'object'
    ? caseItem.construction
    : {};
  return {
    pipeTag: String(caseItem.pipeTag ?? nested.pipeTag ?? ''),
    service: String(caseItem.service ?? nested.service ?? ''),
    area: String(caseItem.area ?? nested.area ?? ''),
    sourcePanel: String(caseItem.sourcePanel ?? nested.sourcePanel ?? ''),
    controllerTag: String(caseItem.controllerTag ?? nested.controllerTag ?? ''),
    circuitNumber: String(caseItem.circuitNumber ?? nested.circuitNumber ?? ''),
    cableFamilyId: String(caseItem.cableFamilyId ?? nested.cableFamilyId ?? ''),
    accessoryOverrides: normalizeAccessoryOverrides(caseItem.accessoryOverrides ?? nested.accessoryOverrides),
    installationNotes: String(caseItem.installationNotes ?? nested.installationNotes ?? ''),
    assetType: String(caseItem.assetType ?? caseItem.advancedHeatTrace?.assetType ?? nested.assetType ?? 'pipe'),
    assetTag: String(caseItem.assetTag ?? caseItem.advancedHeatTrace?.assetTag ?? caseItem.pipeTag ?? nested.assetTag ?? ''),
    panelPhase: String(caseItem.panelPhase ?? caseItem.advancedHeatTrace?.panelPhase ?? nested.panelPhase ?? ''),
    diversityGroup: String(caseItem.diversityGroup ?? caseItem.advancedHeatTrace?.diversityGroup ?? nested.diversityGroup ?? ''),
  };
}

function normalizeAccessoryOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((out, [key, qty]) => {
    const parsed = asNumber(qty, 0);
    if (parsed > 0) out[key] = round(parsed, 3);
    return out;
  }, {});
}

function nearestRating(requiredWPerFt, ratings = []) {
  const sorted = [...ratings].sort((a, b) => a - b);
  return sorted.find(rating => rating >= requiredWPerFt) ?? sorted[sorted.length - 1] ?? 0;
}

function familyCompatibilityWarnings(branchRow = {}, family = {}) {
  const warnings = [];
  const voltage = asNumber(branchRow.voltageV, 0);
  const selectedWPerFt = asNumber(branchRow.selectedWPerFt, 0);
  const lengthFt = asNumber(branchRow.effectiveTraceLengthFt, 0);
  const environment = branchRow.environment || branchRow.inputs?.environment || '';
  if (family.cableType !== branchRow.heatTraceCableType) {
    warnings.push(`Cable type ${branchRow.heatTraceCableType || 'unknown'} does not match ${family.cableType}.`);
  }
  if (voltage > 0 && !asArray(family.allowedVoltages).includes(voltage)) {
    warnings.push(`${voltage} V is not listed for this vendor-neutral family.`);
  }
  if (selectedWPerFt > Math.max(...asArray(family.wattDensityOptionsWPerFt), 0)) {
    warnings.push(`${selectedWPerFt} W/ft exceeds this family rating range.`);
  }
  if (lengthFt > asNumber(family.maxCircuitLengthFt, 0)) {
    warnings.push(`${lengthFt} ft effective length exceeds ${family.maxCircuitLengthFt} ft family guidance.`);
  }
  if (environment && !asArray(family.exposureRatings).includes(environment)) {
    warnings.push(`Environment ${environment} is not listed for this family.`);
  }
  if (environment === 'hazardous-area' && !family.hazardousAreaSuitable) {
    warnings.push('Hazardous-area metadata requires a hazardous-area-suitable family.');
  }
  if (environment === 'hazardous-area') {
    warnings.push('Hazardous-area T-class, sheath temperature, and approval basis require manufacturer verification.');
  }
  return warnings;
}

export function selectHeatTraceProductFamily(branchRow = {}, families = DEFAULT_HEAT_TRACE_PRODUCT_FAMILIES) {
  const requestedId = branchRow.cableFamilyId || branchRow.productFamilyId || '';
  const selectedWPerFt = asNumber(branchRow.selectedWPerFt, branchRow.recommendedCableRatingWPerFt || 0);
  let candidates = asArray(families).filter(family => family.cableType === branchRow.heatTraceCableType);
  if (requestedId) {
    const requested = asArray(families).find(family => family.id === requestedId);
    if (requested) candidates = [requested];
  }
  if (!candidates.length) {
    return {
      family: null,
      familyId: requestedId || '',
      familyLabel: 'No compatible family',
      selectedRatingWPerFt: selectedWPerFt,
      status: 'incompatible',
      warnings: [`No vendor-neutral product family supports cable type ${branchRow.heatTraceCableType || 'unknown'}.`],
    };
  }
  const voltage = asNumber(branchRow.voltageV, 0);
  const environment = branchRow.environment || branchRow.inputs?.environment || '';
  const scored = candidates.map(family => {
    const warnings = familyCompatibilityWarnings(branchRow, family);
    const voltageScore = voltage > 0 && asArray(family.allowedVoltages).includes(voltage) ? 0 : 4;
    const environmentScore = !environment || asArray(family.exposureRatings).includes(environment) ? 0 : 2;
    const rating = nearestRating(selectedWPerFt, family.wattDensityOptionsWPerFt);
    const ratingScore = rating >= selectedWPerFt ? Math.abs(rating - selectedWPerFt) / 10 : 10;
    return { family, warnings, score: warnings.length * 8 + voltageScore + environmentScore + ratingScore, rating };
  }).sort((a, b) => a.score - b.score)[0];
  return {
    family: scored.family,
    familyId: scored.family.id,
    familyLabel: scored.family.label,
    selectedRatingWPerFt: scored.rating || selectedWPerFt,
    status: scored.warnings.length ? 'verify' : 'compatible',
    warnings: [
      ...scored.warnings,
      scored.family.startupCurrentNote,
      scored.family.verificationNote,
    ].filter(Boolean),
  };
}

export function buildHeatTraceLineList(cases = [], options = {}) {
  const schedule = buildHeatTraceBranchSchedule(cases);
  const families = options.families || DEFAULT_HEAT_TRACE_PRODUCT_FAMILIES;
  const rows = schedule.rows.map((branch, index) => {
    const original = asArray(cases)[index] || {};
    const metadata = metadataFromCase(original);
    const selection = selectHeatTraceProductFamily({
      ...branch,
      ...metadata,
      environment: branch.inputs?.environment || branch.result?.environment || '',
    }, families);
    return {
      id: branch.id,
      branchName: branch.name,
      pipeTag: metadata.pipeTag || branch.name,
      assetType: metadata.assetType || 'pipe',
      assetTag: metadata.assetTag || metadata.pipeTag || branch.name,
      service: metadata.service,
      area: metadata.area,
      sourcePanel: metadata.sourcePanel || 'Unassigned',
      controllerTag: metadata.controllerTag || 'Unassigned',
      circuitNumber: metadata.circuitNumber || '',
      panelPhase: metadata.panelPhase,
      diversityGroup: metadata.diversityGroup,
      heatTraceCableType: branch.heatTraceCableType,
      heatTraceCableTypeLabel: branch.heatTraceCableTypeLabel,
      cableFamilyId: selection.familyId,
      cableFamilyLabel: selection.familyLabel,
      productSelectionStatus: selection.status,
      voltageV: branch.voltageV,
      selectedWPerFt: branch.selectedWPerFt,
      familyRatingWPerFt: selection.selectedRatingWPerFt,
      traceRunCount: branch.traceRunCount,
      lineLengthFt: branch.lineLengthFt,
      componentAllowanceLengthFt: branch.componentAllowanceLengthFt,
      effectiveTraceLengthFt: branch.effectiveTraceLengthFt,
      maxCircuitLengthFt: branch.maxCircuitLengthFt,
      requiredWatts: branch.requiredWatts,
      installedWatts: branch.totalWatts,
      loadAmps: branch.loadAmps,
      status: branch.status,
      environment: branch.inputs?.environment || '',
      componentAllowances: branch.componentAllowances,
      accessoryOverrides: metadata.accessoryOverrides,
      installationNotes: metadata.installationNotes,
      warnings: [
        ...branch.warnings,
        ...selection.warnings,
        ...(metadata.assetType && metadata.assetType !== 'pipe' ? [`${metadata.assetType} asset heat tracing requires manufacturer/software verification.`] : []),
      ],
    };
  });
  return {
    rows,
    summary: {
      lineCount: rows.length,
      totalInstalledWatts: round(rows.reduce((sum, row) => sum + row.installedWatts, 0), 1),
      totalLoadAmps: round(rows.reduce((sum, row) => sum + row.loadAmps, 0), 2),
      verificationCount: rows.filter(row => row.productSelectionStatus !== 'compatible' || row.warnings.length).length,
    },
  };
}

export function buildHeatTraceControllerSchedule(lineListRows = []) {
  const groups = new Map();
  asArray(lineListRows).forEach(row => {
    const key = `${row.sourcePanel || 'Unassigned'}::${row.controllerTag || 'Unassigned'}::${row.voltageV || 'unknown'}`;
    const group = groups.get(key) || {
      sourcePanel: row.sourcePanel || 'Unassigned',
      controllerTag: row.controllerTag || 'Unassigned',
      voltageV: row.voltageV,
      branchCount: 0,
      totalWatts: 0,
      totalKw: 0,
      totalAmps: 0,
      circuitNumbers: [],
      pipeTags: [],
      warnings: [],
    };
    group.branchCount += 1;
    group.totalWatts += row.installedWatts;
    group.totalAmps += row.loadAmps;
    if (row.circuitNumber) group.circuitNumbers.push(row.circuitNumber);
    if (row.pipeTag) group.pipeTags.push(row.pipeTag);
    if (row.controllerTag === 'Unassigned' || row.sourcePanel === 'Unassigned') {
      group.warnings.push('Assign source panel and controller tag before issue for construction.');
    }
    groups.set(key, group);
  });
  const rows = Array.from(groups.values()).map(group => ({
    ...group,
    totalWatts: round(group.totalWatts, 1),
    totalKw: round(group.totalWatts / 1000, 3),
    totalAmps: round(group.totalAmps, 2),
    circuitNumbers: Array.from(new Set(group.circuitNumbers)).join(', '),
    pipeTags: Array.from(new Set(group.pipeTags)).join(', '),
    warnings: Array.from(new Set(group.warnings)),
  }));
  return {
    rows,
    summary: {
      controllerCount: rows.length,
      totalWatts: round(rows.reduce((sum, row) => sum + row.totalWatts, 0), 1),
      totalKw: round(rows.reduce((sum, row) => sum + row.totalKw, 0), 3),
      totalAmps: round(rows.reduce((sum, row) => sum + row.totalAmps, 0), 2),
    },
  };
}

function addBomItem(map, id, quantity, rules, basisDetails = '') {
  const qty = asNumber(quantity, 0);
  if (qty <= 0) return;
  const rule = rules[id] || { description: id, unit: 'ea', basis: 'Manual allowance.' };
  const existing = map.get(id) || {
    itemId: id,
    description: rule.description,
    unit: rule.unit || 'ea',
    quantity: 0,
    basis: rule.basis || '',
    notes: [],
  };
  existing.quantity += qty;
  if (basisDetails) existing.notes.push(basisDetails);
  map.set(id, existing);
}

export function buildHeatTraceBOM(lineListRows = [], accessoryRules = DEFAULT_HEAT_TRACE_ACCESSORY_RULES) {
  const rows = asArray(lineListRows);
  const map = new Map();
  const controllerSchedule = buildHeatTraceControllerSchedule(rows);
  rows.forEach(row => {
    addBomItem(map, 'powerConnection', 1, accessoryRules, row.pipeTag);
    addBomItem(map, 'endSeal', 1, accessoryRules, row.pipeTag);
    addBomItem(map, 'labelTag', 1, accessoryRules, row.pipeTag);
    asArray(row.componentAllowances).forEach(component => {
      const qty = asNumber(component.quantity, 0);
      if (component.type === 'valve') addBomItem(map, 'valveKit', qty, accessoryRules, row.pipeTag);
      if (component.type === 'flangePair' || component.type === 'custom') addBomItem(map, 'spliceKit', qty, accessoryRules, row.pipeTag);
      if (component.type === 'instrumentTap') addBomItem(map, 'teeKit', qty, accessoryRules, row.pipeTag);
      if (component.type === 'pipeSupport') addBomItem(map, 'attachmentKit', qty, accessoryRules, row.pipeTag);
    });
    Object.entries(row.accessoryOverrides || {}).forEach(([id, qty]) => {
      addBomItem(map, id, qty, accessoryRules, `${row.pipeTag} manual allowance`);
    });
  });
  controllerSchedule.rows.forEach(row => {
    addBomItem(map, 'controller', 1, accessoryRules, row.controllerTag || row.sourcePanel);
    addBomItem(map, 'rtdSensor', 1, accessoryRules, row.controllerTag || row.sourcePanel);
  });
  return {
    rows: Array.from(map.values()).map(row => ({
      ...row,
      quantity: round(row.quantity, 3),
      notes: Array.from(new Set(row.notes)).join('; '),
    })).sort((a, b) => a.itemId.localeCompare(b.itemId)),
    summary: {
      itemCount: map.size,
      totalQuantity: round(Array.from(map.values()).reduce((sum, row) => sum + row.quantity, 0), 3),
    },
  };
}

function buildInstallationDetails(lineListRows = []) {
  return [
    'Install heat-trace cable, power connections, end seals, sensors, and labels per the final manufacturer installation manual.',
    'Verify startup current, breaker sizing, maximum circuit length, T-class, and sheath temperature before issue for construction.',
    'Maintain bend radius, attachment spacing, weatherproofing, and insulation-jacket sealing per project specifications.',
    `${asArray(lineListRows).length} heat-trace line(s) are included in this construction-planning package.`,
  ];
}

export function buildHeatTraceInstallationPackage({
  activeResult = null,
  activeInputs = null,
  circuitCases = [],
  approval = null,
  projectName = 'Untitled Project',
  families = DEFAULT_HEAT_TRACE_PRODUCT_FAMILIES,
  accessoryRules = DEFAULT_HEAT_TRACE_ACCESSORY_RULES,
} = {}) {
  const packageCases = asArray(circuitCases).length
    ? circuitCases
    : (activeResult ? [{
        id: 'active-heat-trace-case',
        name: 'Current active case',
        inputs: activeInputs || activeResult,
        result: activeResult,
      }] : []);
  const lineList = buildHeatTraceLineList(packageCases, { families });
  const controllerSchedule = buildHeatTraceControllerSchedule(lineList.rows);
  const bom = buildHeatTraceBOM(lineList.rows, accessoryRules);
  const warnings = [
    ...lineList.rows.flatMap(row => row.warnings.map(message => ({ source: row.pipeTag || row.branchName, message }))),
    ...controllerSchedule.rows.flatMap(row => row.warnings.map(message => ({ source: row.controllerTag || row.sourcePanel, message }))),
  ];
  return {
    version: HEAT_TRACE_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    projectName,
    summary: {
      lineCount: lineList.summary.lineCount,
      controllerCount: controllerSchedule.summary.controllerCount,
      bomItemCount: bom.summary.itemCount,
      totalInstalledKw: round(lineList.summary.totalInstalledWatts / 1000, 3),
      totalLoadAmps: lineList.summary.totalLoadAmps,
      warningCount: warnings.length,
      approvalStatus: approval?.status || 'pending',
    },
    lineList,
    controllerSchedule,
    bom,
    installationDetails: buildInstallationDetails(lineList.rows),
    warnings,
    assumptions: [
      'Vendor-neutral product families are placeholders for construction planning and are not manufacturer SKUs.',
      'Cable family, startup current, sheath temperature, T-class, and maximum circuit length require final manufacturer verification.',
      'Accessory BOM quantities are planning allowances based on saved branch cases and component allowances.',
      'Controller schedule totals are load summaries from branch outputs; upstream feeder, transformer, and panel-bus sizing are excluded.',
    ],
    approval: approval || { status: 'pending' },
  };
}

function renderTable(headers, rows) {
  return `
    <div class="report-scroll">
      <table class="report-table">
        <thead><tr>${headers.map(header => `<th>${esc(header.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map(row => `<tr>${headers.map(header => `<td>${esc(row[header.key])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">No rows.</td></tr>`}</tbody>
      </table>
    </div>`;
}

export function renderHeatTraceInstallationPackageHTML(pkg = {}) {
  const lineRows = asArray(pkg.lineList?.rows).map(row => ({
    pipeTag: row.pipeTag,
    service: row.service || 'n/a',
    area: row.area || 'n/a',
    controllerTag: row.controllerTag,
    circuitNumber: row.circuitNumber || 'n/a',
    family: row.cableFamilyLabel,
    length: row.effectiveTraceLengthFt,
    load: `${row.installedWatts} W / ${row.loadAmps} A`,
    status: row.productSelectionStatus,
    notes: row.installationNotes || '',
  }));
  const controllerRows = asArray(pkg.controllerSchedule?.rows).map(row => ({
    controllerTag: row.controllerTag,
    sourcePanel: row.sourcePanel,
    voltageV: row.voltageV,
    branchCount: row.branchCount,
    totalKw: row.totalKw,
    totalAmps: row.totalAmps,
    circuits: row.circuitNumbers || 'n/a',
  }));
  const bomRows = asArray(pkg.bom?.rows).map(row => ({
    itemId: row.itemId,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    basis: row.basis,
    notes: row.notes || '',
  }));
  return `
    <article class="heattrace-report-document">
      <header class="report-header">
        <h1 class="report-title">${esc(pkg.projectName || 'Untitled Project')} - Heat Trace Installation Package</h1>
        <p class="report-meta">Generated ${esc(pkg.generatedAt ? new Date(pkg.generatedAt).toLocaleString() : 'n/a')} - ${esc(pkg.version || HEAT_TRACE_PACKAGE_VERSION)}</p>
      </header>

      <section class="report-section">
        <h2>Summary</h2>
        <dl class="report-dl">
          <dt>Approval status</dt><dd>${esc(pkg.approval?.status || 'pending')}</dd>
          <dt>Line list rows</dt><dd>${esc(pkg.summary?.lineCount || 0)}</dd>
          <dt>Controllers</dt><dd>${esc(pkg.summary?.controllerCount || 0)}</dd>
          <dt>BOM item types</dt><dd>${esc(pkg.summary?.bomItemCount || 0)}</dd>
          <dt>Total installed load</dt><dd>${esc(pkg.summary?.totalInstalledKw || 0)} kW</dd>
          <dt>Package warnings</dt><dd>${esc(pkg.summary?.warningCount || 0)}</dd>
        </dl>
      </section>

      <section class="report-section">
        <h2>Line List</h2>
        ${renderTable([
          { key: 'pipeTag', label: 'Pipe Tag' },
          { key: 'service', label: 'Service' },
          { key: 'area', label: 'Area' },
          { key: 'controllerTag', label: 'Controller' },
          { key: 'circuitNumber', label: 'Circuit' },
          { key: 'family', label: 'Cable Family' },
          { key: 'length', label: 'Effective ft' },
          { key: 'load', label: 'Installed Load' },
          { key: 'status', label: 'Selection Status' },
          { key: 'notes', label: 'Installation Notes' },
        ], lineRows)}
      </section>

      <section class="report-section">
        <h2>Circuit Schedule</h2>
        ${renderTable([
          { key: 'controllerTag', label: 'Controller' },
          { key: 'sourcePanel', label: 'Source Panel' },
          { key: 'voltageV', label: 'Voltage' },
          { key: 'branchCount', label: 'Branches' },
          { key: 'totalKw', label: 'kW' },
          { key: 'totalAmps', label: 'A' },
          { key: 'circuits', label: 'Circuits' },
        ], controllerRows)}
      </section>

      <section class="report-section">
        <h2>BOM</h2>
        ${renderTable([
          { key: 'itemId', label: 'Item' },
          { key: 'description', label: 'Description' },
          { key: 'quantity', label: 'Qty' },
          { key: 'unit', label: 'Unit' },
          { key: 'basis', label: 'Basis' },
          { key: 'notes', label: 'Notes' },
        ], bomRows)}
      </section>

      <section class="report-section">
        <h2>Installation Details</h2>
        <ul>${asArray(pkg.installationDetails).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
      </section>

      <section class="report-section">
        <h2>Warnings</h2>
        ${asArray(pkg.warnings).length
          ? `<ul>${pkg.warnings.map(warning => `<li><strong>${esc(warning.source)}:</strong> ${esc(warning.message)}</li>`).join('')}</ul>`
          : '<p class="report-empty">No package warnings detected.</p>'}
      </section>

      <section class="report-section">
        <h2>Assumptions</h2>
        <ul>${asArray(pkg.assumptions).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
      </section>
    </article>`;
}
