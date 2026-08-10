export function buildDiagramExportData(sheets = []) {
  return {
    sheets: sheets.map(sheet => ({
      name: sheet.name,
      components: (sheet.components || []).map(component => ({ ...component })),
      connections: (sheet.connections || []).map(connection => ({ ...connection })),
      layers: Array.isArray(sheet.layers) ? sheet.layers.map(layer => ({ ...layer })) : []
    }))
  };
}

export function sanitizeDiagramExport(value, seen = new WeakSet(), windowRef = null) {
  if (value === undefined) return undefined;
  const type = typeof value;
  if (type === 'bigint') {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value.toString();
  }
  if (type === 'number') {
    if (Number.isFinite(value)) return value;
    if (Number.isNaN(value)) return 'NaN';
    return value > 0 ? 'Infinity' : '-Infinity';
  }
  if (type === 'boolean' || type === 'string') return value;
  if (type === 'function') return undefined;
  if (value === null) return null;
  if (type !== 'object') return value;
  if (windowRef && (value === windowRef || value === windowRef.document)) return undefined;
  if (typeof value.nodeType === 'number' && typeof value.nodeName === 'string') return undefined;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Set) return Array.from(value, item => sanitizeDiagramExport(item, seen, windowRef));
  if (value instanceof Map) {
    const output = {};
    value.forEach((item, key) => {
      const sanitized = sanitizeDiagramExport(item, seen, windowRef);
      if (sanitized !== undefined) output[String(key)] = sanitized;
    });
    return output;
  }
  if (ArrayBuffer.isView(value)) return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  if (Array.isArray(value)) return value.map(item => sanitizeDiagramExport(item, seen, windowRef));
  const output = {};
  Object.keys(value).forEach(key => {
    const sanitized = sanitizeDiagramExport(value[key], seen, windowRef);
    if (sanitized !== undefined) output[key] = sanitized;
  });
  return output;
}

export function migrateOneLineDiagram(data, diagramVersion) {
  let migrated = Array.isArray(data)
    ? { version: 0, templates: [], sheets: [{ name: 'Sheet 1', components: data }] }
    : data;
  const version = migrated.version || 0;
  if (version < 1) {
    migrated = { version: 1, templates: migrated.templates || [], sheets: migrated.sheets || [] };
  }
  if (version < 2) migrated.scale = migrated.scale || { unitPerPx: 1, unit: 'in' };
  if (version < 3) {
    migrated.sheets = (migrated.sheets || []).map(sheet => ({
      ...sheet,
      layers: Array.isArray(sheet.layers) ? sheet.layers : []
    }));
  }
  if (version < 4) {
    migrated.sheets = (migrated.sheets || []).map(sheet => ({
      ...sheet,
      components: (sheet.components || []).map(component => {
        if (component.type !== 'sheet_link') return component;
        const next = { ...component, props: { ...(component.props || {}) } };
        if ('target_sheet' in next.props && !('linked_sheet' in next.props)) {
          next.props.linked_sheet = next.props.target_sheet;
          delete next.props.target_sheet;
        }
        if ('from_sheet' in next.props && !('linked_sheet' in next.props)) {
          next.props.linked_sheet = next.props.from_sheet;
          delete next.props.from_sheet;
        }
        return next;
      })
    }));
  }
  migrated.version = diagramVersion;
  return migrated;
}

export function createDiagramFileController({
  documentRef,
  windowRef,
  URLRef,
  BlobCtor,
  setTimeoutFn,
  getSheets,
  getScenario,
  getOneLine,
  getStudies,
  diagramVersion,
  switchScenario,
  normalizeDiagramScale,
  applyDiagramScale,
  applyTemplates,
  normalizeComponent,
  applySheets,
  loadSheet,
  renderSheetTabs,
  save,
  showToast
}) {
  const downloadJson = (payload, filename, { deferRevoke = false } = {}) => {
    const blob = new BlobCtor([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = documentRef.createElement('a');
    const url = URLRef.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    const parent = documentRef.body || documentRef.documentElement;
    if (parent) parent.appendChild(link);
    link.click();
    if (link.parentNode) link.parentNode.removeChild(link);
    else link.remove?.();
    if (deferRevoke) setTimeoutFn(() => URLRef.revokeObjectURL(url), 0);
    else URLRef.revokeObjectURL(url);
  };

  const exportDiagram = () => {
    downloadJson(buildDiagramExportData(getSheets()), 'oneline.json');
  };

  const exportDiagnostics = () => {
    try {
      const scenario = getScenario() || 'default';
      const safeScenario = scenario.replace(/[^a-z0-9-_]+/gi, '_') || 'default';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const payload = sanitizeDiagramExport({
        exportedAt: new Date().toISOString(),
        scenario,
        oneLine: getOneLine(),
        studies: getStudies()
      }, new WeakSet(), windowRef);
      downloadJson(payload, `oneline-diagnostics-${safeScenario}-${timestamp}.json`, { deferRevoke: true });
      showToast('One-line diagnostics exported');
    } catch (error) {
      console.error('Failed to export one-line diagnostics', error);
      showToast('Failed to export one-line diagnostics');
    }
  };

  const importDiagram = async data => {
    if (data.meta?.scenario) switchScenario(data.meta.scenario);
    const migrated = migrateOneLineDiagram(data, diagramVersion);
    applyDiagramScale(normalizeDiagramScale(migrated.scale));
    applyTemplates(migrated.templates || []);
    const sheets = (migrated.sheets || []).map((sheet, index) => ({
      name: sheet.name || `Sheet ${index + 1}`,
      components: (sheet.components || []).map(normalizeComponent),
      connections: Array.isArray(sheet.connections) ? sheet.connections : [],
      layers: Array.isArray(sheet.layers) ? sheet.layers : [],
      ...(sheet.backgroundImage ? { backgroundImage: sheet.backgroundImage } : {})
    }));
    applySheets(sheets);
    if (sheets.length) {
      loadSheet(0, { skipCurrentSave: true });
      renderSheetTabs();
      save();
    }
  };

  const handleImport = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await importDiagram(JSON.parse(await file.text()));
    } catch (error) {
      console.error('Failed to import diagram', error);
    }
    event.target.value = '';
  };

  return { exportDiagnostics, exportDiagram, handleImport, importDiagram };
}
