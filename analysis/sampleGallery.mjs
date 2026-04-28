export const SAMPLE_PROJECT_SCHEMA_VERSION = 'sample-gallery-v1';

const REQUIRED_PROJECT_FIELDS = [
  'ductbanks',
  'conduits',
  'trays',
  'cables',
  'cableTypicals',
  'panels',
  'equipment',
  'loads',
  'settings',
];

const ARRAY_PROJECT_FIELDS = REQUIRED_PROJECT_FIELDS.filter(key => key !== 'settings');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function slug(value = '') {
  return String(value || 'sample')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sample';
}

function normalizeStep(step = {}, index = 0) {
  const title = String(step.title || `Step ${index + 1}`).trim();
  const href = String(step.href || 'workflowdashboard.html').trim();
  return {
    id: String(step.id || slug(title || `step-${index + 1}`)),
    title,
    description: String(step.description || '').trim(),
    href,
    category: String(step.category || 'workflow').trim(),
  };
}

function normalizeSample(sample = {}, index = 0) {
  const title = String(sample.title || `Sample Project ${index + 1}`).trim();
  const id = slug(sample.id || title);
  const steps = asArray(sample.guidedWorkflow || sample.steps).map(normalizeStep);
  return {
    id,
    title,
    description: String(sample.description || '').trim(),
    domain: String(sample.domain || 'General').trim(),
    tags: asArray(sample.tags).map(tag => String(tag).trim()).filter(Boolean),
    preview: String(sample.preview || '').trim(),
    projectPath: String(sample.projectPath || sample.file || '').trim(),
    startPage: String(sample.startPage || steps[0]?.href || 'workflowdashboard.html').trim(),
    workflows: asArray(sample.workflows).map(flow => String(flow).trim()).filter(Boolean),
    guidedWorkflow: steps,
  };
}

export function normalizeSampleProjectManifest(manifest = {}) {
  const source = Array.isArray(manifest) ? { samples: manifest } : asObject(manifest);
  const samples = asArray(source.samples).map(normalizeSample);
  return {
    version: String(source.version || SAMPLE_PROJECT_SCHEMA_VERSION),
    generatedFor: String(source.generatedFor || 'CableTrayRoute'),
    samples,
  };
}

export function validateSampleProjectPayload(payload = {}) {
  const project = asObject(payload);
  const data = project.meta ? Object.fromEntries(Object.entries(project).filter(([key]) => key !== 'meta')) : project;
  const errors = [];
  const warnings = [];

  REQUIRED_PROJECT_FIELDS.forEach(key => {
    if (!(key in data)) errors.push(`Missing required field: ${key}`);
  });

  ARRAY_PROJECT_FIELDS.forEach(key => {
    if (key in data && !Array.isArray(data[key])) errors.push(`Field must be an array: ${key}`);
  });

  if ('settings' in data && (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings))) {
    errors.push('Field must be an object: settings');
  }

  if ('oneLine' in data) {
    const oneLine = data.oneLine;
    const validOneLine = Array.isArray(oneLine) || Array.isArray(oneLine?.sheets);
    if (!validOneLine) errors.push('Field must be an array or object with sheets array: oneLine');
  } else {
    warnings.push('Optional oneLine field is not present.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    requiredFields: [...REQUIRED_PROJECT_FIELDS],
  };
}

export function buildSampleProjectSummary(payload = {}) {
  const studies = asObject(payload.settings?.studyResults);
  return {
    cables: asArray(payload.cables).length,
    trays: asArray(payload.trays).length,
    conduits: asArray(payload.conduits).length,
    ductbanks: asArray(payload.ductbanks).length,
    panels: asArray(payload.panels).length,
    equipment: asArray(payload.equipment).length,
    loads: asArray(payload.loads).length,
    studyCount: Object.keys(studies).length,
    studies: Object.keys(studies).sort(),
    hasOneLine: Array.isArray(payload.oneLine?.sheets) ? payload.oneLine.sheets.length > 0 : asArray(payload.oneLine).length > 0,
  };
}

export function buildGuidedDemoChecklist(sample = {}, payload = {}) {
  const normalized = normalizeSample(sample);
  const summary = buildSampleProjectSummary(payload);
  const explicitSteps = normalized.guidedWorkflow.length ? normalized.guidedWorkflow : [
    normalizeStep({ title: 'Review Dashboard', description: 'Open the project dashboard and confirm sample contents.', href: 'workflowdashboard.html', category: 'overview' }),
    normalizeStep({ title: 'Review Schedules', description: 'Inspect imported cable and raceway schedules.', href: 'cableschedule.html', category: 'schedules' }),
    normalizeStep({ title: 'Generate Report', description: 'Open the project report with the imported sample data.', href: 'projectreport.html', category: 'reports' }),
  ];
  return explicitSteps.map((step, index) => ({
    ...step,
    order: index + 1,
    sampleId: normalized.id,
    sampleTitle: normalized.title,
    projectSummary: summary,
  }));
}

export function prepareSampleProjectForImport(sample = {}, payload = {}) {
  const normalized = normalizeSample(sample);
  const prepared = deepClone(payload) || {};
  prepared.meta = {
    ...asObject(prepared.meta),
    version: prepared.meta?.version || 1,
    sampleGallery: {
      version: SAMPLE_PROJECT_SCHEMA_VERSION,
      id: normalized.id,
      title: normalized.title,
    },
  };
  prepared.settings = {
    ...asObject(prepared.settings),
    sampleProjectInfo: {
      version: SAMPLE_PROJECT_SCHEMA_VERSION,
      id: normalized.id,
      title: normalized.title,
      domain: normalized.domain,
      tags: normalized.tags,
      projectPath: normalized.projectPath,
      preview: normalized.preview,
      startPage: normalized.startPage,
      workflows: normalized.workflows,
    },
  };
  return prepared;
}
