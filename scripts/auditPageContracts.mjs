import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV_ROUTES } from '../src/components/navigation.js';
import { PAGE_CONTRACTS_BY_HREF, getPageContractCoverage } from '../src/pageContracts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'docs', 'page-contract-audit.md');
const contractSections = new Set(['Workflow', 'Studies']);
const routeEntryAliases = new Map([
  ['scenarios.html', ['src/scenarioComparison.js']]
]);
const ignoredSourceFiles = new Set([
  'site.js',
  'dataStore.mjs',
  'projectStorage.js',
  'dirtyTracker.js',
  'analysis/projectIntegration.mjs',
  'cdnFallback.js',
  'src/workflowStatus.js',
  'src/projectManager.js',
  'src/scenarios.js',
  'src/components/navigation.js',
  'src/components/modal.js'
]);

const dataStoreCalls = {
  listScenarios: ['read', 'settings.scenarios'],
  switchScenario: ['write', 'settings.scenarios'],
  cloneScenario: ['write', 'settings.scenarios'],
  getTrays: ['read', 'traySchedule'],
  setTrays: ['write', 'traySchedule'],
  getCables: ['read', 'cableSchedule'],
  setCables: ['write', 'cableSchedule'],
  addCable: ['write', 'cableSchedule'],
  getCableTypicals: ['read', 'cableTypicals'],
  setCableTypicals: ['write', 'cableTypicals'],
  getCableTemplates: ['read', 'settings.cableTemplates'],
  setCableTemplates: ['write', 'settings.cableTemplates'],
  getCableTagSettings: ['read', 'settings.cableTagSettings'],
  setCableTagSettings: ['write', 'settings.cableTagSettings'],
  getCableChangeLog: ['read', 'settings.cableChangeLog'],
  setCableChangeLog: ['write', 'settings.cableChangeLog'],
  getEquipmentFilterPresets: ['read', 'settings.equipmentFilterPresets'],
  setEquipmentFilterPresets: ['write', 'settings.equipmentFilterPresets'],
  getTrayHardwareCatalogCustomProducts: ['read', 'settings.trayHardwareCatalogCustomProducts'],
  setTrayHardwareCatalogCustomProducts: ['write', 'settings.trayHardwareCatalogCustomProducts'],
  getDrcAcceptedFindings: ['read', 'settings.drcAcceptedFindings'],
  setDrcAcceptedFindings: ['write', 'settings.drcAcceptedFindings'],
  getStudyApprovals: ['read', 'settings.studyApprovals'],
  setStudyApproval: ['write', 'settings.studyApprovals'],
  clearStudyApproval: ['write', 'settings.studyApprovals'],
  getStudyProvenance: ['read', 'settings.studyProvenance'],
  getReportSnapshots: ['read', 'settings.reportSnapshots'],
  setReportSnapshot: ['write', 'settings.reportSnapshots'],
  deleteReportSnapshot: ['write', 'settings.reportSnapshots'],
  getLifecyclePackages: ['read', 'settings.lifecyclePackages'],
  addLifecyclePackage: ['write', 'settings.lifecyclePackages'],
  deleteLifecyclePackage: ['write', 'settings.lifecyclePackages'],
  getProjectMeta: ['read', 'settings.projectMeta'],
  setProjectMeta: ['write', 'settings.projectMeta'],
  getDesignBasis: ['read', 'settings.designBasis'],
  setDesignBasis: ['write', 'settings.designBasis'],
  getDesignGateApprovals: ['read', 'settings.designGateApprovals'],
  setDesignGateApprovals: ['write', 'settings.designGateApprovals'],
  getCoachAuditTrail: ['read', 'settings.coachAuditTrail'],
  setCoachAuditTrail: ['write', 'settings.coachAuditTrail'],
  getGroundGridSoilMeasurements: ['read', 'settings.groundGridSoilMeasurements'],
  setGroundGridSoilMeasurements: ['write', 'settings.groundGridSoilMeasurements'],
  getGroundGridRiskPoints: ['read', 'settings.groundGridRiskPoints'],
  setGroundGridRiskPoints: ['write', 'settings.groundGridRiskPoints'],
  getMccLineups: ['read', 'mccLineups'],
  setMccLineups: ['write', 'mccLineups'],
  getDuctbanks: ['read', 'ductbankSchedule'],
  setDuctbanks: ['write', 'ductbankSchedule'],
  getConduits: ['read', 'conduitSchedule'],
  setConduits: ['write', 'conduitSchedule'],
  addRaceway: ['write', 'traySchedule|conduitSchedule'],
  getPanels: ['read', 'panelSchedule'],
  setPanels: ['write', 'panelSchedule'],
  getEquipment: ['read', 'equipment'],
  setEquipment: ['write', 'equipment'],
  addEquipment: ['write', 'equipment'],
  updateEquipment: ['write', 'equipment'],
  removeEquipment: ['write', 'equipment'],
  getOneLine: ['read', 'oneLineDiagram'],
  setOneLine: ['write', 'oneLineDiagram'],
  restoreRevision: ['write', 'oneLineDiagram'],
  getStudies: ['read', 'studyResults'],
  setStudies: ['write', 'studyResults'],
  getLoads: ['read', 'loadList'],
  setLoads: ['write', 'loadList'],
  addLoad: ['write', 'loadList'],
  insertLoad: ['write', 'loadList'],
  updateLoad: ['write', 'loadList'],
  removeLoad: ['write', 'loadList'],
  importFromCad: ['write', 'traySchedule|conduitSchedule'],
  exportProject: ['read', 'project-snapshot'],
  importProject: ['write', 'project-snapshot'],
  saveProject: ['write', 'project-snapshot'],
  loadProject: ['read', 'project-snapshot'],
  applyRemoteSnapshot: ['write', 'project-snapshot']
};

const storageKeyAliases = {
  trays: 'traySchedule',
  cables: 'cableSchedule',
  cableTypicals: 'cableTypicals',
  ductbanks: 'ductbankSchedule',
  conduits: 'conduitSchedule',
  panels: 'panelSchedule',
  loads: 'loadList',
  equipment: 'equipment',
  oneLine: 'oneLineDiagram',
  studies: 'studyResults',
  traySchedule: 'traySchedule',
  cableSchedule: 'cableSchedule',
  ductbankSchedule: 'ductbankSchedule',
  conduitSchedule: 'conduitSchedule',
  panelSchedule: 'panelSchedule',
  loadList: 'loadList',
  equipmentList: 'equipment',
  oneLineDiagram: 'oneLineDiagram',
  equipmentColumns: 'settings.equipmentColumns',
  cableSchedulePreset: 'settings.cableSchedulePreset',
  cableTemplates: 'settings.cableTemplates',
  cableTagSettings: 'settings.cableTagSettings',
  cableChangeLog: 'settings.cableChangeLog',
  loadListViewPreset: 'settings.loadListViewPreset',
  racewayScheduleViewPreset: 'settings.racewayScheduleViewPreset',
  equipmentFilterPresets: 'settings.equipmentFilterPresets',
  trayHardwareCatalogCustomProducts: 'settings.trayHardwareCatalogCustomProducts',
  drcAcceptedFindings: 'settings.drcAcceptedFindings',
  studyApprovals: 'settings.studyApprovals',
  reportSnapshots: 'settings.reportSnapshots',
  lifecyclePackages: 'settings.lifecyclePackages',
  designBasis: 'settings.designBasis',
  designGateApprovals: 'settings.designGateApprovals',
  coachAuditTrail: 'settings.coachAuditTrail',
  groundGridSoilMeasurements: 'settings.groundGridSoilMeasurements',
  groundGridRiskPoints: 'settings.groundGridRiskPoints',
  mccLineups: 'mccLineups'
};

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativePath(filePath) {
  return toPosix(path.relative(root, filePath));
}

function pathKey(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isExternalUrl(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function parseRollupEntries() {
  const config = await readText(path.join(root, 'rollup.config.cjs'));
  const entries = new Map();
  const entryPattern = /^\s*['"]?([A-Za-z0-9_-]+)['"]?\s*:\s*'([^']+)'/gm;
  for (const match of config.matchAll(entryPattern)) {
    entries.set(match[1], match[2]);
  }
  return entries;
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function addEvidence(map, key, evidence) {
  if (!key || key === 'project-snapshot') return;
  for (const part of String(key).split('|')) {
    if (!map.has(part)) map.set(part, []);
    map.get(part).push(evidence);
  }
}

function literalConstants(text) {
  const constants = new Map();
  const pattern = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(pattern)) {
    constants.set(match[1], match[2]);
  }
  return constants;
}

function resolveLiteralArg(rawArg, constants) {
  const trimmed = rawArg.trim();
  const literal = trimmed.match(/^['"]([^'"]+)['"]$/);
  if (literal) return literal[1];
  const storageKey = trimmed.match(/^dataStore\.STORAGE_KEYS\.([A-Za-z0-9_]+)$/);
  if (storageKey) return storageKeyAliases[storageKey[1]] || null;
  if (constants.has(trimmed)) return constants.get(trimmed);
  return null;
}

function settingKey(rawKey) {
  if (!rawKey) return null;
  if (rawKey.startsWith('settings.')) return rawKey;
  return `settings.${rawKey}`;
}

function classifyDirectStorageHit(item) {
  if (item.file === 'tour.js' || item.key.startsWith('tour_done_') || item.key === 'onelineTourDone') {
    return {
      classification: 'page-preference',
      purpose: 'Per-browser tour completion state; not exported with project data.'
    };
  }
  if (item.file === 'oneline.js' && item.storage === 'sessionStorage' && item.key === '<dynamic>') {
    return {
      classification: 'session-handoff',
      purpose: 'Temporary custom component editor prefill; not durable project state.'
    };
  }
  if (item.file === 'optimalRoute.js' && item.storage === 'sessionStorage' && item.key === 'resume:choice') {
    return {
      classification: 'session-handoff',
      purpose: 'E2E resume modal choice for the current tab only.'
    };
  }
  if (item.file === 'pullcards.js' && item.storage === 'sessionStorage') {
    return {
      classification: 'session-handoff',
      purpose: 'Temporary route-result handoff; persisted route results use settings.latestRouteResults.'
    };
  }
  return {
    classification: 'unclassified',
    purpose: 'Review whether this is project data that should move through dataStore/projectStorage.'
  };
}

function maskJavaScriptComments(text) {
  let out = '';
  let state = 'code';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (state === 'lineComment') {
      if (ch === '\n' || ch === '\r') {
        out += ch;
        state = 'code';
      } else {
        out += ' ';
      }
      continue;
    }

    if (state === 'blockComment') {
      if (ch === '*' && next === '/') {
        out += '  ';
        i++;
        state = 'code';
      } else {
        out += ch === '\n' || ch === '\r' ? ch : ' ';
      }
      continue;
    }

    if (state === 'singleQuote' || state === 'doubleQuote' || state === 'template') {
      out += ch;
      if (ch === '\\') {
        if (i + 1 < text.length) {
          out += text[i + 1];
          i++;
        }
        continue;
      }
      if (state === 'singleQuote' && ch === "'") state = 'code';
      if (state === 'doubleQuote' && ch === '"') state = 'code';
      if (state === 'template' && ch === '`') state = 'code';
      continue;
    }

    if (ch === '/' && next === '/') {
      out += '  ';
      i++;
      state = 'lineComment';
      continue;
    }
    if (ch === '/' && next === '*') {
      out += '  ';
      i++;
      state = 'blockComment';
      continue;
    }
    if (ch === "'") state = 'singleQuote';
    else if (ch === '"') state = 'doubleQuote';
    else if (ch === '`') state = 'template';
    out += ch;
  }
  return out;
}

function scanSourceFile(filePath, text) {
  const scanText = maskJavaScriptComments(text);
  const rel = relativePath(filePath);
  const reads = new Map();
  const writes = new Map();
  const directStorage = [];
  const constants = literalConstants(scanText);
  const callNames = Object.keys(dataStoreCalls).join('|');
  const callPattern = new RegExp(`(?:^|[^\\w.])(${callNames})\\s*\\(`, 'g');
  const objectCallPattern = new RegExp(`(?:dataStore|window\\.dataStore|globalThis\\.dataStore|store)\\.(${callNames})\\s*\\(`, 'g');

  for (const pattern of [callPattern, objectCallPattern]) {
    for (const match of scanText.matchAll(pattern)) {
      const name = match[1];
      const [mode, key] = dataStoreCalls[name];
      const evidence = `${rel}:${lineForIndex(text, match.index)} ${name}()`;
      if (mode === 'read') addEvidence(reads, key, evidence);
      if (mode === 'write') addEvidence(writes, key, evidence);
    }
  }

  const tablePattern = /TableUtils\.createTable\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  for (const match of scanText.matchAll(tablePattern)) {
    const body = match[1];
    const tableKeys = [
      ...body.matchAll(/\b(?:storageKey|columnsKey)\s*:\s*TableUtils\.STORAGE_KEYS\.([A-Za-z0-9_]+)/g)
    ].map(item => storageKeyAliases[item[1]]).filter(Boolean);
    for (const key of tableKeys) {
      const evidence = `${rel}:${lineForIndex(text, match.index)} TableUtils.createTable(${key})`;
      addEvidence(reads, key, evidence);
      addEvidence(writes, key, evidence);
    }
  }

  const genericPattern = /(?:^|[^\w.])((?:dataStore|window\.dataStore|globalThis\.dataStore|store)\.)?(getItem|setItem|removeItem)\s*\(([^,\n\r)]+)/g;
  for (const match of scanText.matchAll(genericPattern)) {
    const rawKey = resolveLiteralArg(match[3], constants);
    if (!rawKey) continue;
    const key = settingKey(rawKey);
    const evidence = `${rel}:${lineForIndex(text, match.index)} ${match[2]}(${rawKey})`;
    if (match[2] === 'getItem') addEvidence(reads, key, evidence);
    else addEvidence(writes, key, evidence);
  }

  const legacyMigrationPattern = /\bmigrateLegacyItem\s*\([^,\n\r]+,\s*([^,\n\r)]+)/g;
  for (const match of scanText.matchAll(legacyMigrationPattern)) {
    const rawKey = resolveLiteralArg(match[1], constants);
    if (!rawKey) continue;
    const key = settingKey(rawKey);
    const evidence = `${rel}:${lineForIndex(text, match.index)} migrateLegacyItem(..., ${rawKey})`;
    addEvidence(reads, key, evidence);
    addEvidence(writes, key, evidence);
  }

  const directStoragePattern = /\b(localStorage|sessionStorage)\.(getItem|setItem|removeItem)\s*\(([^,\n\r)]+)/g;
  for (const match of scanText.matchAll(directStoragePattern)) {
    const rawKey = resolveLiteralArg(match[3], constants);
    const item = {
      file: rel,
      line: lineForIndex(text, match.index),
      storage: match[1],
      operation: match[2],
      key: rawKey || '<dynamic>'
    };
    directStorage.push({ ...item, ...classifyDirectStorageHit(item) });
  }
  const directClearPattern = /\b(localStorage|sessionStorage)\.clear\s*\(/g;
  for (const match of scanText.matchAll(directClearPattern)) {
    const item = {
      file: rel,
      line: lineForIndex(text, match.index),
      storage: match[1],
      operation: 'clear',
      key: '*'
    };
    directStorage.push({ ...item, ...classifyDirectStorageHit(item) });
  }

  const studyReadPattern = /\bgetStudies\(\)\??\.([A-Za-z0-9_]+)/g;
  for (const match of scanText.matchAll(studyReadPattern)) {
    addEvidence(reads, `studyResults.${match[1]}`, `${rel}:${lineForIndex(text, match.index)} getStudies().${match[1]}`);
  }

  const studyPropertyPattern = /\bstudies\??\.([A-Za-z0-9_]+)\b/g;
  for (const match of scanText.matchAll(studyPropertyPattern)) {
    const after = scanText.slice(match.index + match[0].length).match(/^\s*(=|:)/);
    const key = `studyResults.${match[1]}`;
    const evidence = `${rel}:${lineForIndex(text, match.index)} ${match[0]}`;
    if (after?.[1] === '=') addEvidence(writes, key, evidence);
    else addEvidence(reads, key, evidence);
  }

  const setStudiesObjectPattern = /\bsetStudies\s*\(\s*\{[^)]*?\b([A-Za-z0-9_]+)\s*:/gs;
  for (const match of scanText.matchAll(setStudiesObjectPattern)) {
    addEvidence(writes, `studyResults.${match[1]}`, `${rel}:${lineForIndex(text, match.index)} setStudies({ ${match[1]}: ... })`);
  }

  return { reads, writes, directStorage };
}

function importSpecifiers(text) {
  const specs = [];
  const importPattern = /\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of text.matchAll(importPattern)) specs.push(match[1]);
  for (const match of text.matchAll(dynamicImportPattern)) specs.push(match[1]);
  return specs;
}

async function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.js')
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function isExcludedSource(filePath) {
  const rel = relativePath(filePath);
  if (ignoredSourceFiles.has(rel)) return true;
  return rel.startsWith('dist/')
    || rel.startsWith('docs/')
    || rel.startsWith('node_modules/')
    || rel.startsWith('assets/')
    || rel.startsWith('samples/')
    || rel.startsWith('examples/')
    || rel.includes('/vendor/');
}

async function collectSources(entryFiles) {
  const visited = new Set();
  const included = [];

  async function visit(filePath) {
    const absolute = path.resolve(filePath);
    if (!(await fileExists(absolute))) return;
    const realPath = await fs.realpath(absolute).catch(() => absolute);
    const key = pathKey(realPath);
    if (visited.has(key)) return;
    visited.add(key);
    if (isExcludedSource(realPath)) return;
    included.push(realPath);
    const text = await readText(realPath);
    for (const specifier of importSpecifiers(text)) {
      const resolved = await resolveImport(realPath, specifier);
      if (resolved) await visit(resolved);
    }
  }

  for (const entry of entryFiles) {
    await visit(path.resolve(root, entry));
  }
  return included;
}

function htmlScriptSources(html) {
  const sources = [];
  const scriptPattern = /<script[^>]+src=["']([^"']+)["']/g;
  const scriptLoaderPattern = /\bsrc:\s*['"]([^'"]+)['"]/g;
  for (const match of html.matchAll(scriptPattern)) sources.push(match[1]);
  for (const match of html.matchAll(scriptLoaderPattern)) sources.push(match[1]);
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of html.matchAll(dynamicPattern)) sources.push(match[1]);
  return sources;
}

async function routeEntryFiles(route, rollupEntries) {
  const href = route.href;
  const stem = href.replace(/\.html$/i, '');
  const lowerEntries = new Map([...rollupEntries.entries()].map(([key, value]) => [key.toLowerCase(), value]));
  const entries = new Set();

  if (rollupEntries.has(stem)) entries.add(rollupEntries.get(stem));
  if (lowerEntries.has(stem.toLowerCase())) entries.add(lowerEntries.get(stem.toLowerCase()));
  for (const alias of routeEntryAliases.get(href) || []) entries.add(alias);

  const htmlPath = path.join(root, href);
  const html = await readText(htmlPath).catch(() => '');
  for (const source of htmlScriptSources(html)) {
    const clean = source.replace(/^\.\//, '').split(/[?#]/)[0];
    if (isExternalUrl(clean)) continue;
    if (clean.startsWith('dist/')) {
      const distStem = path.basename(clean, '.js');
      if (rollupEntries.has(distStem)) entries.add(rollupEntries.get(distStem));
      if (lowerEntries.has(distStem.toLowerCase())) entries.add(lowerEntries.get(distStem.toLowerCase()));
      continue;
    }
    if (clean.endsWith('.js') || clean.endsWith('.mjs')) entries.add(clean);
  }

  const candidates = [
    `${stem}.js`,
    `src/${stem}.js`,
    `studies/${stem}.js`,
    `analysis/${stem}.js`,
    `analysis/${stem}.mjs`
  ];
  for (const candidate of candidates) {
    if (await fileExists(path.join(root, candidate))) entries.add(candidate);
  }

  const normalized = new Map();
  for (const entry of entries) {
    const absolute = path.join(root, entry);
    if (isExcludedSource(absolute) || !(await fileExists(absolute))) continue;
    const realPath = await fs.realpath(absolute).catch(() => absolute);
    if (!normalized.has(pathKey(realPath))) normalized.set(pathKey(realPath), relativePath(realPath));
  }
  return [...normalized.values()].sort();
}

function mapToSortedObject(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, evidence]) => [key, [...new Set(evidence)].sort()]));
}

function keyCoveredBy(key, declaredKeys) {
  return declaredKeys.some(declared => {
    if (key === declared) return true;
    if (declared === 'studyResults' && key.startsWith('studyResults.')) return true;
    if (key === 'studyResults' && declared.startsWith('studyResults.')) return true;
    return false;
  });
}

function uniqueSorted(items) {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

function compareRoute(route, pageContract, reads, writes) {
  const inputKeys = pageContract.projectInputs.map(item => item.key);
  const outputKeys = pageContract.outputs.filter(item => item.key !== 'export-only').map(item => item.key);
  const declaredKeys = uniqueSorted([...inputKeys, ...outputKeys]);
  const readKeys = [...reads.keys()];
  const writeKeys = [...writes.keys()];
  const unreadInputs = pageContract.projectInputs.filter(item => !keyCoveredBy(item.key, readKeys) && !keyCoveredBy(item.key, writeKeys));
  const declaredOutputsNotWritten = outputKeys.filter(key => !keyCoveredBy(key, writeKeys));
  const undocumentedReads = readKeys.filter(key => !keyCoveredBy(key, declaredKeys));
  const undocumentedWrites = writeKeys.filter(key => !keyCoveredBy(key, outputKeys));

  return {
    declaredInputsNotRead: unreadInputs.map(item => item.key),
    declaredInputWarnings: unreadInputs.map(item => ({
      key: item.key,
      reason: item.audit?.reason || 'No static read/write evidence was detected for this declared input.'
    })),
    declaredOutputsNotWritten,
    undocumentedReads,
    undocumentedWrites,
    declaredKeys
  };
}

export async function buildPageContractAudit() {
  const rollupEntries = await parseRollupEntries();
  const scopedRoutes = NAV_ROUTES.filter(route => contractSections.has(route.section));
  const coverage = getPageContractCoverage(NAV_ROUTES);
  const routes = [];

  for (const route of scopedRoutes) {
    const pageContract = PAGE_CONTRACTS_BY_HREF[route.href];
    const entryFiles = await routeEntryFiles(route, rollupEntries);
    const sourceFiles = await collectSources(entryFiles);
    const reads = new Map();
    const writes = new Map();
    const directStorage = [];

    for (const filePath of sourceFiles) {
      const text = await readText(filePath);
      const scanned = scanSourceFile(filePath, text);
      for (const [key, evidence] of scanned.reads) {
        for (const item of evidence) addEvidence(reads, key, item);
      }
      for (const [key, evidence] of scanned.writes) {
        for (const item of evidence) addEvidence(writes, key, item);
      }
      directStorage.push(...scanned.directStorage);
    }

    const comparison = pageContract
      ? compareRoute(route, pageContract, reads, writes)
      : {
        declaredInputsNotRead: [],
        declaredInputWarnings: [],
        declaredOutputsNotWritten: [],
        undocumentedReads: [],
          undocumentedWrites: [],
          declaredKeys: []
        };

    routes.push({
      href: route.href,
      label: route.label,
      section: route.section,
      group: route.group || 'General',
      entryFiles: entryFiles.map(entry => toPosix(entry)).sort(),
      sourceFiles: sourceFiles.map(relativePath).sort(),
      detectedReads: mapToSortedObject(reads),
      detectedWrites: mapToSortedObject(writes),
      directStorage,
      ...comparison
    });
  }

  const summary = {
    totalRoutes: scopedRoutes.length,
    totalContracts: Object.keys(PAGE_CONTRACTS_BY_HREF).length,
    missingContracts: coverage.missing,
    extraContracts: coverage.extra,
    routesWithoutSources: routes.filter(route => route.sourceFiles.length === 0).map(route => route.href),
    routesWithUndocumentedReads: routes.filter(route => route.undocumentedReads.length > 0).length,
    routesWithUndocumentedWrites: routes.filter(route => route.undocumentedWrites.length > 0).length,
    routesWithDeclaredInputsNotRead: routes.filter(route => route.declaredInputsNotRead.length > 0).length,
    routesWithDeclaredOutputsNotWritten: routes.filter(route => route.declaredOutputsNotWritten.length > 0).length,
    directStorageHits: routes.reduce((sum, route) => sum + route.directStorage.length, 0),
    unclassifiedDirectStorageHits: routes.reduce((sum, route) => (
      sum + route.directStorage.filter(item => item.classification === 'unclassified').length
    ), 0),
    directStorageClassifications: routes.reduce((counts, route) => {
      for (const item of route.directStorage) {
        counts[item.classification] = (counts[item.classification] || 0) + 1;
      }
      return counts;
    }, {}),
    actionableFailures: routes.reduce((sum, route) => (
      sum
      + route.undocumentedReads.length
      + route.undocumentedWrites.length
      + route.declaredOutputsNotWritten.length
      + route.directStorage.filter(item => item.classification === 'unclassified').length
    ), 0),
    warningCount: routes.reduce((sum, route) => sum + route.declaredInputsNotRead.length, 0)
  };

  return { generatedAt: new Date(0).toISOString(), summary, routes };
}

function formatKeyList(items) {
  if (!items.length) return '- None';
  return items.map(item => `- \`${item}\``).join('\n');
}

function formatInputWarnings(items) {
  if (!items.length) return '- None';
  return items.map(item => `- \`${item.key}\` - ${item.reason}`).join('\n');
}

function formatEvidence(title, object) {
  const entries = Object.entries(object);
  if (!entries.length) return `**${title}**\n- None`;
  const lines = [`**${title}**`];
  for (const [key, evidence] of entries) {
    lines.push(`- \`${key}\``);
    for (const item of evidence.slice(0, 5)) {
      lines.push(`  - ${item}`);
    }
    if (evidence.length > 5) lines.push(`  - ... ${evidence.length - 5} more`);
  }
  return lines.join('\n');
}

function formatDirectStorage(items) {
  if (!items.length) return '**Direct Browser Storage**\n- None';
  return [
    '**Direct Browser Storage**',
    ...items.slice(0, 12).map(item => `- ${item.file}:${item.line} ${item.storage}.${item.operation}(${item.key}) - ${item.classification}: ${item.purpose}`),
    ...(items.length > 12 ? [`- ... ${items.length - 12} more`] : [])
  ].join('\n');
}

function routeHasAuditFindings(route) {
  return route.undocumentedReads.length
    || route.undocumentedWrites.length
    || route.declaredInputsNotRead.length
    || route.declaredOutputsNotWritten.length
    || route.directStorage.length
    || route.sourceFiles.length === 0;
}

export function renderPageContractAuditMarkdown(audit) {
  const lines = [
    '# Page Contract Code Audit',
    '',
    '<!-- Generated by scripts/auditPageContracts.mjs. Do not edit by hand. -->',
    '',
    'This report compares the Workflow and Studies page contracts against statically detected storage access in page source files.',
    '',
    'The audit is intentionally conservative: `--check` fails on actionable drift and reports declared-but-unread inputs as warnings for review.',
    '',
    '## Summary',
    '',
    `- Routes audited: ${audit.summary.totalRoutes}`,
    `- Contracts: ${audit.summary.totalContracts}`,
    `- Missing contracts: ${audit.summary.missingContracts.length}`,
    `- Extra contracts: ${audit.summary.extraContracts.length}`,
    `- Routes without source files: ${audit.summary.routesWithoutSources.length}`,
    `- Routes with undocumented reads: ${audit.summary.routesWithUndocumentedReads}`,
    `- Routes with undocumented writes: ${audit.summary.routesWithUndocumentedWrites}`,
    `- Routes with declared inputs not statically read: ${audit.summary.routesWithDeclaredInputsNotRead}`,
    `- Routes with declared outputs not statically written: ${audit.summary.routesWithDeclaredOutputsNotWritten}`,
    `- Direct browser storage hits: ${audit.summary.directStorageHits}`,
    `- Unclassified direct browser storage hits: ${audit.summary.unclassifiedDirectStorageHits}`,
    `- Direct browser storage classifications: ${Object.entries(audit.summary.directStorageClassifications).map(([key, count]) => `${key}=${count}`).join(', ') || 'none'}`,
    `- Actionable failures: ${audit.summary.actionableFailures}`,
    `- Warnings: ${audit.summary.warningCount}`,
    '',
    '## Findings',
    ''
  ];

  const routesWithFindings = audit.routes.filter(routeHasAuditFindings);
  if (!routesWithFindings.length) {
    lines.push('No contract drift was detected.');
  }

  for (const route of routesWithFindings) {
    lines.push(`### ${route.label} (\`${route.href}\`)`, '');
    lines.push(`- Section: ${route.section}`);
    lines.push(`- Group: ${route.group}`);
    lines.push(`- Source files: ${route.sourceFiles.length ? route.sourceFiles.map(file => `\`${file}\``).join(', ') : 'none'}`);
    lines.push('');
    lines.push('**Undocumented Reads**');
    lines.push(formatKeyList(route.undocumentedReads));
    lines.push('');
    lines.push('**Undocumented Writes**');
    lines.push(formatKeyList(route.undocumentedWrites));
    lines.push('');
    lines.push('**Declared Inputs Not Statically Read**');
    lines.push(formatInputWarnings(route.declaredInputWarnings || []));
    lines.push('');
    lines.push('**Declared Outputs Not Statically Written**');
    lines.push(formatKeyList(route.declaredOutputsNotWritten));
    lines.push('');
    lines.push(formatDirectStorage(route.directStorage));
    lines.push('');
    lines.push(formatEvidence('Detected Reads', route.detectedReads));
    lines.push('');
    lines.push(formatEvidence('Detected Writes', route.detectedWrites));
    lines.push('');
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

async function main() {
  const audit = await buildPageContractAudit();
  const markdown = renderPageContractAuditMarkdown(audit);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }
  if (process.argv.includes('--check')) {
    const current = await fs.readFile(outputPath, 'utf8').catch(() => '');
    if (audit.summary.actionableFailures > 0) {
      throw new Error(`Page contract audit has ${audit.summary.actionableFailures} actionable failure(s). Run node scripts/auditPageContracts.mjs and reconcile contracts/storage access.`);
    }
    if (current !== markdown) {
      throw new Error('docs/page-contract-audit.md is out of date. Run node scripts/auditPageContracts.mjs.');
    }
    console.log('[page-contract-audit] docs/page-contract-audit.md is current.');
    return;
  }
  await fs.writeFile(outputPath, markdown);
  console.log(`[page-contract-audit] Wrote ${path.relative(root, outputPath)} for ${audit.summary.totalRoutes} routes.`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
