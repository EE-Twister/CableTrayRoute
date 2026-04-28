export const RACEWAY_CONSTRUCTION_VERSION = 'raceway-construction-detailing-v1';

const RACEWAY_TYPES = ['tray', 'conduit', 'ductbank'];
const CONSTRUCTION_STATUSES = ['notStarted', 'planned', 'released', 'inProgress', 'installed', 'verified', 'hold'];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value = '') {
  return String(value ?? '').trim();
}

function numberValue(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function slug(value = '') {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value = '') {
  let result = 2166136261;
  const input = String(value);
  for (let index = 0; index < input.length; index += 1) {
    result ^= input.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstValue(row = {}, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return '';
}

function pointFrom(row = {}, prefix = 'start') {
  const nested = asObject(row[prefix]);
  return {
    x: numberValue(row[`${prefix}_x`] ?? row[`${prefix}X`] ?? nested.x, null),
    y: numberValue(row[`${prefix}_y`] ?? row[`${prefix}Y`] ?? nested.y, null),
    z: numberValue(row[`${prefix}_z`] ?? row[`${prefix}Z`] ?? nested.z, 0),
  };
}

function lengthFromGeometry(row = {}) {
  const start = pointFrom(row, 'start');
  const end = pointFrom(row, 'end');
  if ([start.x, start.y, end.x, end.y].some(value => value === null)) {
    return numberValue(row.lengthFt ?? row.length_ft ?? row.length, 0) || 0;
  }
  return Math.hypot(end.x - start.x, end.y - start.y, (end.z || 0) - (start.z || 0));
}

function normalizeRacewayType(value = '', row = {}) {
  const raw = stringValue(value || row.racewayType || row.raceway_type || row.type).toLowerCase().replace(/[\s_-]+/g, '');
  if (raw.includes('ductbank') || row.concrete_encasement !== undefined || row.tag && row.from && row.to && !row.conduit_id && !row.tray_id) return 'ductbank';
  if (raw.includes('conduit') || row.conduit_id || row.trade_size) return 'conduit';
  if (raw.includes('tray') || row.tray_id || row.inside_width || row.tray_depth) return 'tray';
  return RACEWAY_TYPES.includes(value) ? value : 'tray';
}

function normalizeStatus(value = '') {
  const raw = stringValue(value || 'notStarted').toLowerCase().replace(/[\s_-]+/g, '');
  const match = CONSTRUCTION_STATUSES.find(status => status.toLowerCase() === raw);
  return match || 'notStarted';
}

function normalizeAccessoryKit(row = {}, index = 0, racewayId = '') {
  if (typeof row === 'string') {
    return {
      id: `kit-${index + 1}`,
      name: row,
      category: slug(row),
      quantity: 1,
      unit: 'ea',
      basis: 'manual accessory text',
      notes: '',
    };
  }
  const source = asObject(row);
  const name = stringValue(source.name || source.item || source.description || source.category || `Accessory ${index + 1}`);
  return {
    id: stringValue(source.id || `${slug(racewayId || 'raceway')}-${slug(name)}-${index + 1}`),
    name,
    category: stringValue(source.category || source.type || slug(name)),
    quantity: numberValue(source.quantity ?? source.qty ?? source.count, 1) ?? 1,
    unit: stringValue(source.unit || 'ea'),
    basis: stringValue(source.basis || 'manual accessory kit'),
    notes: stringValue(source.notes || source.note || ''),
  };
}

function parseAccessoryKits(value, racewayId = '') {
  if (value === undefined || value === null || value === '') return { rows: [], warnings: [] };
  if (Array.isArray(value)) {
    return { rows: value.map((row, index) => normalizeAccessoryKit(row, index, racewayId)), warnings: [] };
  }
  if (typeof value === 'object') {
    const rows = Array.isArray(value.kits || value.rows || value.items)
      ? value.kits || value.rows || value.items
      : Object.entries(value).map(([name, quantity]) => ({ name, quantity }));
    return { rows: rows.map((row, index) => normalizeAccessoryKit(row, index, racewayId)), warnings: [] };
  }
  const text = stringValue(value);
  if (!text) return { rows: [], warnings: [] };
  try {
    const parsed = JSON.parse(text);
    return parseAccessoryKits(parsed, racewayId);
  } catch {
    if (text.includes(':') || text.includes(',')) {
      const rows = text.split(',').map((part, index) => {
        const [name, quantity] = part.split(':').map(item => item.trim());
        return normalizeAccessoryKit({ name, quantity: numberValue(quantity, 1) }, index, racewayId);
      }).filter(row => row.name);
      return { rows, warnings: [] };
    }
    return {
      rows: [],
      warnings: [`${racewayId || 'Raceway'} accessoryKits is not valid JSON or comma-delimited accessory text.`],
    };
  }
}

function buildDimensions(row = {}, type = 'tray') {
  if (type === 'tray') {
    return {
      widthIn: numberValue(row.inside_width ?? row.width ?? row.widthIn, null),
      depthIn: numberValue(row.tray_depth ?? row.depth ?? row.depthIn, null),
      trayType: stringValue(row.tray_type || row.type || ''),
      slots: Math.max(1, Math.round(numberValue(row.num_slots, 1) || 1)),
    };
  }
  if (type === 'conduit') {
    return {
      type: stringValue(row.type || row.conduit_type || ''),
      tradeSize: stringValue(row.trade_size || row.tradeSize || ''),
      capacity: numberValue(row.capacity, null),
    };
  }
  return {
    from: stringValue(row.from || ''),
    to: stringValue(row.to || ''),
    concreteEncasement: Boolean(row.concrete_encasement || row.concreteEncasement),
  };
}

function warning(code, severity, racewayId, message, source = {}) {
  return { code, severity, racewayId, message, source };
}

export function normalizeRacewayConstructionDetail(row = {}, options = {}) {
  const source = asObject(row);
  const racewayType = normalizeRacewayType(options.racewayType || source.racewayType, source);
  const id = stringValue(firstValue(source, ['id', 'tray_id', 'conduit_id', 'tag', 'label', 'name']) || `${racewayType}-${hash(stableStringify(source))}`);
  const lengthFt = round(numberValue(source.lengthFt ?? source.length_ft ?? source.length, null) ?? lengthFromGeometry(source), 3);
  const start = pointFrom(source, 'start');
  const end = pointFrom(source, 'end');
  const accessory = parseAccessoryKits(source.accessoryKits ?? source.accessory_kits, id);
  const supportSpacingFt = numberValue(source.supportSpacingFt ?? source.support_spacing_ft ?? source.supportSpacing, null);
  const constructionStatus = normalizeStatus(source.constructionStatus || source.construction_status);
  const dividerLane = stringValue(source.dividerLane || source.divider_lane);
  const labelId = stringValue(source.labelId || source.label_id);
  const drawingRef = stringValue(source.drawingRef || source.drawing_ref);
  const detailRef = stringValue(source.detailRef || source.detail_ref);
  const sectionRef = stringValue(source.sectionRef || source.section_ref);
  const supportType = stringValue(source.supportType || source.support_type);
  const supportFamily = stringValue(source.supportFamily || source.support_family);
  const notes = stringValue(source.constructionNotes || source.construction_notes || source.notes);
  const dimensions = buildDimensions(source, racewayType);
  const warnings = [...accessory.warnings];

  if (!supportType && racewayType !== 'ductbank') warnings.push(`${id} is missing support type.`);
  if (!supportSpacingFt && racewayType !== 'ductbank') warnings.push(`${id} is missing support spacing.`);
  if (!labelId) warnings.push(`${id} is missing a construction label ID.`);
  if (!drawingRef && !detailRef) warnings.push(`${id} is missing drawing/detail references.`);
  if (!sectionRef) warnings.push(`${id} is missing a section reference.`);
  if (constructionStatus === 'notStarted' || constructionStatus === 'hold') warnings.push(`${id} has unresolved construction status ${constructionStatus}.`);
  if (racewayType === 'tray') {
    const slots = dimensions.slots || 1;
    const laneIndex = numberValue(dividerLane, null);
    if (dividerLane && laneIndex !== null && (laneIndex < 1 || laneIndex > slots)) {
      warnings.push(`${id} divider lane ${dividerLane} is outside the configured ${slots} tray slot(s).`);
    }
  }

  return {
    id,
    racewayId: id,
    racewayType,
    tag: stringValue(source.tag || source.tray_id || source.conduit_id || source.id || id),
    lengthFt,
    start,
    end,
    dimensions,
    supportFamily,
    supportType,
    supportSpacingFt,
    accessoryKits: accessory.rows,
    dividerLane,
    constructionPhase: stringValue(source.constructionPhase || source.construction_phase),
    constructionStatus,
    drawingRef,
    detailRef,
    labelId,
    sectionRef,
    installArea: stringValue(source.installArea || source.install_area || source.area || ''),
    constructionNotes: notes,
    source,
    warnings,
    status: warnings.some(message => /invalid|outside|not valid/i.test(message))
      ? 'fail'
      : warnings.length
        ? 'warn'
        : 'pass',
  };
}

export function normalizeRacewayDetailRows({ trays = [], conduits = [], ductbanks = [] } = {}) {
  return [
    ...asArray(trays).map(row => normalizeRacewayConstructionDetail(row, { racewayType: 'tray' })),
    ...asArray(conduits).map(row => normalizeRacewayConstructionDetail(row, { racewayType: 'conduit' })),
    ...asArray(ductbanks).map(row => normalizeRacewayConstructionDetail(row, { racewayType: 'ductbank' })),
  ].sort((a, b) => `${a.racewayType}:${a.racewayId}`.localeCompare(`${b.racewayType}:${b.racewayId}`));
}

function addTakeoff(map, row) {
  const key = [
    row.category,
    row.item,
    row.racewayType || '',
    row.widthIn || '',
    row.unit || 'ea',
    row.source || '',
  ].join('|');
  const current = map.get(key) || { ...row, quantity: 0, racewayIds: [] };
  current.quantity = round((current.quantity || 0) + (Number(row.quantity) || 0), 3);
  if (row.racewayId && !current.racewayIds.includes(row.racewayId)) current.racewayIds.push(row.racewayId);
  map.set(key, current);
}

export function buildRacewayAccessoryTakeoff(detailRows = [], options = {}) {
  const rows = asArray(detailRows).map(row => row.racewayId ? row : normalizeRacewayConstructionDetail(row));
  const standardSectionLength = numberValue(options.standardSectionLengthFt, 12) || 12;
  const takeoff = new Map();
  rows.forEach(row => {
    const lengthFt = Number(row.lengthFt) || 0;
    const widthIn = row.dimensions?.widthIn || '';
    if (row.racewayType !== 'ductbank' && row.supportSpacingFt) {
      addTakeoff(takeoff, {
        category: 'Support',
        item: `${row.supportFamily || 'Generic'} ${row.supportType || 'Support'}`.trim(),
        racewayType: row.racewayType,
        widthIn,
        quantity: Math.ceil(lengthFt / row.supportSpacingFt) + 1,
        unit: 'ea',
        basis: `${lengthFt} ft at ${row.supportSpacingFt} ft spacing plus end supports`,
        source: 'constructionDetail',
        racewayId: row.racewayId,
      });
    }
    if (row.racewayType === 'tray') {
      if (row.dividerLane || (row.dimensions?.slots || 1) > 1) {
        addTakeoff(takeoff, {
          category: 'Divider',
          item: 'Tray divider / lane marker',
          racewayType: row.racewayType,
          widthIn,
          quantity: Math.ceil(lengthFt / standardSectionLength),
          unit: 'ea',
          basis: `${lengthFt} ft tray divided into ${row.dimensions?.slots || 1} slot(s)`,
          source: 'constructionDetail',
          racewayId: row.racewayId,
        });
      }
      addTakeoff(takeoff, {
        category: 'Splice',
        item: 'Straight section splice plate allowance',
        racewayType: row.racewayType,
        widthIn,
        quantity: Math.max(0, Math.ceil(lengthFt / standardSectionLength) - 1),
        unit: 'set',
        basis: `${standardSectionLength} ft tray section allowance`,
        source: 'constructionDetail',
        racewayId: row.racewayId,
      });
    }
    if (row.racewayType === 'ductbank') {
      addTakeoff(takeoff, {
        category: 'Trench',
        item: row.dimensions?.concreteEncasement ? 'Concrete-encased ductbank trench allowance' : 'Ductbank trench allowance',
        racewayType: row.racewayType,
        widthIn: '',
        quantity: lengthFt,
        unit: 'ft',
        basis: 'Ductbank construction length',
        source: 'constructionDetail',
        racewayId: row.racewayId,
      });
    }
    if (row.labelId) {
      addTakeoff(takeoff, {
        category: 'Label',
        item: 'Raceway label / tag',
        racewayType: row.racewayType,
        widthIn,
        quantity: 1,
        unit: 'ea',
        basis: row.labelId,
        source: 'constructionDetail',
        racewayId: row.racewayId,
      });
    }
    asArray(row.accessoryKits).forEach(kit => {
      addTakeoff(takeoff, {
        category: kit.category || 'Accessory',
        item: kit.name || 'Manual accessory kit',
        racewayType: row.racewayType,
        widthIn,
        quantity: kit.quantity,
        unit: kit.unit || 'ea',
        basis: kit.basis || 'manual accessory kit',
        source: 'manualAccessory',
        notes: kit.notes || '',
        racewayId: row.racewayId,
      });
    });
  });
  return [...takeoff.values()]
    .filter(row => row.quantity > 0)
    .sort((a, b) => `${a.category}:${a.item}:${a.racewayIds.join(',')}`.localeCompare(`${b.category}:${b.item}:${b.racewayIds.join(',')}`));
}

export function buildRacewaySectionExtraction(detailRows = [], options = {}) {
  const baseUrl = stringValue(options.baseUrl || 'fieldview.html');
  return asArray(detailRows).map(row => row.racewayId ? row : normalizeRacewayConstructionDetail(row)).map(row => {
    const targetParam = row.racewayType === 'tray' ? 'tray' : row.racewayType;
    return {
      id: row.sectionRef || `${row.racewayType}-section-${slug(row.racewayId)}`,
      racewayId: row.racewayId,
      racewayType: row.racewayType,
      labelId: row.labelId,
      sectionRef: row.sectionRef,
      drawingRef: row.drawingRef,
      detailRef: row.detailRef,
      installArea: row.installArea,
      lengthFt: row.lengthFt,
      dimensions: row.dimensions,
      start: row.start,
      end: row.end,
      dividerLane: row.dividerLane,
      constructionPhase: row.constructionPhase,
      constructionStatus: row.constructionStatus,
      notes: row.constructionNotes,
      fieldViewHref: `${baseUrl}#${targetParam}=${encodeURIComponent(row.racewayId)}`,
    };
  }).sort((a, b) => `${a.racewayType}:${a.racewayId}`.localeCompare(`${b.racewayType}:${b.racewayId}`));
}

function warningRows(detailRows = []) {
  return asArray(detailRows).flatMap(row => asArray(row.warnings).map(message => {
    let code = 'constructionDetailReview';
    let severity = 'warning';
    if (/support type/i.test(message)) code = 'missingSupportType';
    if (/support spacing/i.test(message)) code = 'missingSupportSpacing';
    if (/label/i.test(message)) code = 'missingLabel';
    if (/drawing|detail/i.test(message)) code = 'missingDrawingRef';
    if (/section reference/i.test(message)) code = 'missingSectionRef';
    if (/accessoryKits|not valid JSON/i.test(message)) {
      code = 'invalidAccessoryKits';
      severity = 'error';
    }
    if (/divider lane|outside/i.test(message)) {
      code = 'dividerLaneMismatch';
      severity = 'error';
    }
    if (/construction status/i.test(message)) code = 'unresolvedConstructionStatus';
    return warning(code, severity, row.racewayId, message, {
      racewayType: row.racewayType,
      pageHref: 'racewayschedule.html',
    });
  }));
}

function summarize(detailRows = [], takeoffRows = [], sectionRows = [], warnings = []) {
  return {
    detailCount: detailRows.length,
    trayCount: detailRows.filter(row => row.racewayType === 'tray').length,
    conduitCount: detailRows.filter(row => row.racewayType === 'conduit').length,
    ductbankCount: detailRows.filter(row => row.racewayType === 'ductbank').length,
    takeoffRowCount: takeoffRows.length,
    sectionCount: sectionRows.length,
    warningCount: warnings.length,
    fail: detailRows.filter(row => row.status === 'fail').length,
    warn: detailRows.filter(row => row.status === 'warn').length,
    pass: detailRows.filter(row => row.status === 'pass').length,
  };
}

export function buildRacewayConstructionPackage(context = {}) {
  const detailRows = normalizeRacewayDetailRows({
    trays: context.trays || context.projectState?.trays || [],
    conduits: context.conduits || context.projectState?.conduits || [],
    ductbanks: context.ductbanks || context.projectState?.ductbanks || [],
  });
  const accessoryTakeoffRows = buildRacewayAccessoryTakeoff(detailRows, context.options || context);
  const sectionRows = buildRacewaySectionExtraction(detailRows, context.options || context);
  const warnings = warningRows(detailRows);
  return {
    version: RACEWAY_CONSTRUCTION_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || context.projectState?.projectName || 'Untitled Project',
    summary: summarize(detailRows, accessoryTakeoffRows, sectionRows, warnings),
    detailRows,
    accessoryTakeoffRows,
    sectionRows,
    warningRows: warnings,
    assumptions: [
      'Raceway construction detailing is a browser-local planning and takeoff aid; it does not generate sealed construction drawings.',
      'Support/accessory quantities are deterministic allowances from schedule metadata and require field and vendor verification.',
      'BIM/CAD write-back remains review-only; exported detail metadata is provided as connector-ready properties and mapping hints.',
    ],
  };
}

export function renderRacewayConstructionHTML(pkg = {}) {
  const rows = asArray(pkg.detailRows);
  const takeoff = asArray(pkg.accessoryTakeoffRows);
  const warnings = asArray(pkg.warningRows);
  return `<section class="report-section" id="rpt-raceway-construction">
  <h2>Raceway Construction Details</h2>
  <p class="report-note">Local construction-detailing and takeoff package. Final support layout, accessories, labels, and drawing references require field and vendor verification.</p>
  <dl class="report-dl">
    <dt>Raceways</dt><dd>${escapeHtml(pkg.summary?.detailCount || 0)}</dd>
    <dt>Takeoff Rows</dt><dd>${escapeHtml(pkg.summary?.takeoffRowCount || 0)}</dd>
    <dt>Sections</dt><dd>${escapeHtml(pkg.summary?.sectionCount || 0)}</dd>
    <dt>Warnings</dt><dd>${escapeHtml(pkg.summary?.warningCount || 0)}</dd>
  </dl>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Raceway</th><th>Type</th><th>Support</th><th>Spacing</th><th>Label</th><th>Drawing</th><th>Section</th><th>Status</th><th>Warnings</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>
      <td>${escapeHtml(row.racewayId)}</td>
      <td>${escapeHtml(row.racewayType)}</td>
      <td>${escapeHtml([row.supportFamily, row.supportType].filter(Boolean).join(' ') || 'n/a')}</td>
      <td>${escapeHtml(row.supportSpacingFt ?? 'n/a')}</td>
      <td>${escapeHtml(row.labelId || 'n/a')}</td>
      <td>${escapeHtml(row.drawingRef || row.detailRef || 'n/a')}</td>
      <td>${escapeHtml(row.sectionRef || 'n/a')}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(asArray(row.warnings).join(' | ') || 'None')}</td>
    </tr>`).join('') : '<tr><td colspan="9">No raceway detail rows.</td></tr>'}</tbody>
  </table>
  </div>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Category</th><th>Item</th><th>Qty</th><th>Unit</th><th>Raceways</th><th>Basis</th></tr></thead>
    <tbody>${takeoff.length ? takeoff.map(row => `<tr>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.item)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td>${escapeHtml(asArray(row.racewayIds).join(', '))}</td>
      <td>${escapeHtml(row.basis)}</td>
    </tr>`).join('') : '<tr><td colspan="6">No construction takeoff rows.</td></tr>'}</tbody>
  </table>
  </div>
  ${warnings.length ? `<div class="report-alert report-alert--warning"><strong>Raceway construction warnings:</strong><ul>${warnings.map(row => `<li>${escapeHtml(row.racewayId)}: ${escapeHtml(row.message)}</li>`).join('')}</ul></div>` : '<p class="report-empty">No raceway construction warnings.</p>'}
</section>`;
}
