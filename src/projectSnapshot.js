function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function countOneLineComponents(record = {}) {
  const oneLine = record.oneLine;
  if (Array.isArray(oneLine)) return oneLine.length;
  if (!oneLine || typeof oneLine !== 'object') return 0;
  const sheets = Array.isArray(oneLine.sheets) ? oneLine.sheets : [];
  return sheets.reduce((sum, sheet) => sum + countArray(sheet?.components), 0);
}

export function prepareProjectSnapshotForSave(snapshot, { transientSettingKeys = [] } = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const settings = snapshot.settings && typeof snapshot.settings === 'object' && !Array.isArray(snapshot.settings)
    ? { ...snapshot.settings }
    : {};
  transientSettingKeys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(settings, key)) settings[key] = [];
  });
  const scenarioData = snapshot.scenarioData && typeof snapshot.scenarioData === 'object'
    ? Object.fromEntries(Object.entries(snapshot.scenarioData).map(([name, value]) => [name, prepareProjectSnapshotForSave(value, { transientSettingKeys })]))
    : snapshot.scenarioData;
  return { ...snapshot, settings, ...(scenarioData ? { scenarioData } : {}) };
}

export function isVersionedProjectSnapshot(snapshot) {
  return Boolean(
    snapshot
    && typeof snapshot === 'object'
    && !Array.isArray(snapshot)
    && Number.isFinite(Number(snapshot.schemaVersion))
    && snapshot.meta
    && typeof snapshot.meta === 'object'
    && !Array.isArray(snapshot.meta)
  );
}

export function createImportableProjectSnapshot(snapshot) {
  if (!isVersionedProjectSnapshot(snapshot)) return null;
  const importable = { ...snapshot };
  delete importable.__meta;
  // Saved records may carry synchronization metadata that belongs to the
  // storage envelope, never to the interchange document.
  Object.keys(importable).forEach(key => {
    if (key.startsWith('__')) delete importable[key];
  });
  return importable;
}

/**
 * What My Projects offers when no project has been saved yet. A workspace that
 * already holds records is offered Save first: creating or opening another
 * project from there would replace the unsaved records, so Create New and the
 * sample are not offered beside it.
 * @param {{equipment?: number, loads?: number, cables?: number, raceways?: number, oneLineComponents?: number}} [counts]
 * @returns {{kind: 'unsaved-workspace'|'first-project', eyebrow: string, title: string, detail: string, actions: Array<{action?: string, href?: string, label: string, primary?: boolean}>}}
 */
export function resolveEmptyProjectPrompt(counts = {}) {
  const records = ['equipment', 'loads', 'cables', 'raceways', 'oneLineComponents']
    .reduce((total, key) => total + (Number(counts?.[key]) || 0), 0);
  if (records > 0) {
    return {
      kind: 'unsaved-workspace',
      eyebrow: 'Not saved yet',
      title: 'Save this workspace as a project',
      detail: `This workspace holds ${records} unsaved record${records === 1 ? '' : 's'}. Save it to keep your work; creating or opening a project first would replace it.`,
      actions: [
        { action: 'save', label: 'Save Project', primary: true },
        { action: 'load', label: 'Open Existing Project' }
      ]
    };
  }
  return {
    kind: 'first-project',
    eyebrow: 'First project',
    title: 'Create or open a project',
    detail: 'Start a named project, open saved work, or use a sample project to explore the workflow.',
    actions: [
      { action: 'new', label: 'Create New Project', primary: true },
      { action: 'load', label: 'Open Existing Project' },
      { href: 'samplegallery.html', label: 'Try a Sample Project' }
    ]
  };
}

export function summarizeSavedProjectRecord(name, record = {}) {
  const raceways = record.raceways && typeof record.raceways === 'object' ? record.raceways : {};
  const meta = record.__meta && typeof record.__meta === 'object' ? record.__meta : {};
  return {
    name,
    source: 'local',
    sources: ['local'],
    createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : null,
    updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : null,
    counts: {
      equipment: countArray(record.equipment),
      loads: countArray(record.loads),
      cables: countArray(record.cables),
      raceways: countArray(record.trays || raceways.trays)
        + countArray(record.conduits || raceways.conduits)
        + countArray(record.ductbanks || raceways.ductbanks),
      oneLineComponents: countOneLineComponents(record)
    }
  };
}
