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
  return { ...snapshot, settings };
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
  return importable;
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
