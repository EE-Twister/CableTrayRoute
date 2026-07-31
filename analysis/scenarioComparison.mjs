const VOLATILE_KEYS = new Set([
  'generatedAt',
  'runAt',
  'updatedAt',
  'capturedAt',
  'timestamp',
]);

const DOMAIN_DEFINITIONS = [
  { key: 'equipment', label: 'Equipment', identity: ['id', 'tag', 'ref', 'equipment_tag'] },
  { key: 'loads', label: 'Loads', identity: ['id', 'tag', 'ref', 'load_tag'] },
  { key: 'panels', label: 'Panels', identity: ['id', 'tag', 'panel_name', 'name'] },
  { key: 'cables', label: 'Cables', identity: ['id', 'cable_tag', 'tag'] },
  { key: 'trays', label: 'Cable Trays', identity: ['id', 'tray_id', 'tag'] },
  { key: 'conduits', label: 'Conduits', identity: ['id', 'conduit_id', 'tag'] },
  { key: 'ductbanks', label: 'Ductbanks', identity: ['id', 'ductbank_id', 'tag'] },
];

export const STUDY_LABELS = {
  arcFlash: 'Arc Flash',
  batterySizing: 'Battery / UPS Sizing',
  bessHazard: 'BESS Hazard',
  busDuctSizing: 'Bus Duct Sizing',
  cableThermalEnvironment: 'Cable Thermal Environment',
  capacitorBank: 'Capacitor Bank',
  cathodicProtection: 'Cathodic Protection',
  contingency: 'N-1 Contingency',
  dcShortCircuit: 'DC Short Circuit',
  demandSchedule: 'Demand Schedule',
  derInterconnect: 'DER Interconnection',
  differentialProtection: 'Differential Protection',
  dissimilarMetals: 'Dissimilar Metals',
  duty: 'Equipment Duty',
  frequencyScan: 'Frequency Scan',
  generatorSizing: 'Generator Sizing',
  groundGrid: 'Ground Grid',
  harmonics: 'Harmonics',
  hazAreaClassification: 'Hazardous Area Classification',
  heatTraceSizing: 'Heat Trace Sizing',
  iec60287: 'IEC 60287 Cable Rating',
  iec60909: 'IEC 60909 Short Circuit',
  ibr: 'IBR Modeling',
  insulationCoordination: 'Insulation Coordination',
  lighting: 'Egress Lighting',
  lightningProtection: 'Lightning Protection',
  loadFlow: 'Load Flow',
  motorStart: 'Motor Starting',
  optimalPowerFlow: 'Optimal Power Flow',
  probabilisticLoadFlow: 'Probabilistic Load Flow',
  quasiDynamic: 'Quasi-Dynamic Load Flow',
  reliability: 'Reliability',
  sagTension: 'Sag-Tension',
  shortCircuit: 'Short Circuit',
  substationLayout: 'Substation Layout',
  sustainabilityFootprint: 'Sustainability',
  tcc: 'TCC Coordination',
  transientStability: 'Transient Stability',
  voltageDropStudy: 'Voltage Drop',
  voltageFlicker: 'Voltage Flicker',
  voltageStability: 'Voltage Stability',
  windLoad: 'Wind Load',
};

const STUDY_IMPACT_RULES = {
  equipment: {
    priority: 'high',
    studies: ['loadFlow', 'shortCircuit', 'arcFlash', 'tcc', 'duty', 'reliability'],
  },
  loads: {
    priority: 'high',
    studies: ['loadFlow', 'voltageDropStudy', 'arcFlash', 'demandSchedule', 'generatorSizing', 'motorStart', 'reliability'],
  },
  panels: {
    priority: 'medium',
    studies: ['loadFlow', 'shortCircuit', 'arcFlash', 'voltageDropStudy', 'demandSchedule'],
  },
  cables: {
    priority: 'high',
    studies: ['loadFlow', 'shortCircuit', 'arcFlash', 'voltageDropStudy', 'cableThermalEnvironment', 'iec60287', 'tcc'],
  },
  trays: {
    priority: 'medium',
    studies: ['cableThermalEnvironment', 'iec60287', 'voltageDropStudy'],
  },
  conduits: {
    priority: 'medium',
    studies: ['cableThermalEnvironment', 'iec60287', 'voltageDropStudy'],
  },
  ductbanks: {
    priority: 'medium',
    studies: ['cableThermalEnvironment', 'iec60287', 'voltageDropStudy'],
  },
  oneLineSheets: {
    priority: 'high',
    studies: ['loadFlow', 'shortCircuit', 'arcFlash', 'tcc', 'reliability', 'contingency'],
  },
  oneLine: {
    priority: 'high',
    studies: ['loadFlow', 'shortCircuit', 'arcFlash', 'tcc', 'reliability', 'contingency', 'harmonics'],
  },
  oneLineConnections: {
    priority: 'high',
    studies: ['loadFlow', 'shortCircuit', 'arcFlash', 'tcc', 'reliability', 'contingency', 'harmonics'],
  },
};

const IMPACT_PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizedIdentifier(value) {
  return String(value ?? '').trim().toLowerCase();
}

function displayIdentifier(record, keys, fallback) {
  for (const key of keys) {
    const value = record?.[key];
    if (String(value ?? '').trim()) return String(value).trim();
  }
  return fallback;
}

function identityFor(record, keys, index) {
  return normalizedIdentifier(displayIdentifier(record, keys, `row-${index + 1}`));
}

function changedFields(before, after) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  return [...keys]
    .filter(key => !VOLATILE_KEYS.has(key))
    .filter(key => stableSerialize(before?.[key]) !== stableSerialize(after?.[key]))
    .sort();
}

export function compareEntityCollections(before = [], after = [], options = {}) {
  const identityKeys = options.identityKeys || ['id', 'tag', 'ref', 'name'];
  const beforeMap = new Map();
  const afterMap = new Map();

  (Array.isArray(before) ? before : []).forEach((record, index) => {
    beforeMap.set(identityFor(record, identityKeys, index), { record, index });
  });
  (Array.isArray(after) ? after : []).forEach((record, index) => {
    afterMap.set(identityFor(record, identityKeys, index), { record, index });
  });

  const changes = [];
  for (const [identity, entry] of afterMap) {
    const previous = beforeMap.get(identity);
    const label = displayIdentifier(entry.record, identityKeys, identity);
    if (!previous) {
      changes.push({ status: 'added', identity, label, before: null, after: entry.record, fields: [] });
      continue;
    }
    const fields = changedFields(previous.record, entry.record);
    if (fields.length) {
      changes.push({
        status: 'changed',
        identity,
        label,
        before: previous.record,
        after: entry.record,
        fields,
      });
    }
  }
  for (const [identity, entry] of beforeMap) {
    if (afterMap.has(identity)) continue;
    changes.push({
      status: 'removed',
      identity,
      label: displayIdentifier(entry.record, identityKeys, identity),
      before: entry.record,
      after: null,
      fields: [],
    });
  }

  const counts = {
    before: beforeMap.size,
    after: afterMap.size,
    added: changes.filter(change => change.status === 'added').length,
    removed: changes.filter(change => change.status === 'removed').length,
    changed: changes.filter(change => change.status === 'changed').length,
  };
  counts.totalChanges = counts.added + counts.removed + counts.changed;

  return { counts, changes };
}

function flattenOneLine(oneLine) {
  const sheets = Array.isArray(oneLine?.sheets)
    ? oneLine.sheets
    : (Array.isArray(oneLine) ? oneLine : []);
  const components = sheets.flatMap(sheet => (
    (sheet?.components || []).map(component => ({
      ...component,
      sheet: sheet.name || sheet.title || sheet.id || '',
    }))
  ));
  const connections = components.flatMap(component => (
    (component.connections || []).map((connection, index) => ({
      ...connection,
      source: component.id,
      sourceLabel: component.tag || component.name || component.label || component.id,
      connectionKey: connection.id
        || `${component.id}->${connection.target}:${connection.sourcePort || ''}:${connection.targetPort || ''}:${index}`,
    }))
  ));
  const sheetRecords = sheets.map((sheet, index) => {
    const { components: _components, ...metadata } = sheet || {};
    return {
      ...metadata,
      sheetKey: sheet?.id || sheet?.name || sheet?.title || `sheet-${index + 1}`,
    };
  });
  return {
    sheets: sheetRecords,
    components,
    connections,
    connectionCount: connections.length,
  };
}

function withoutVolatileFields(value) {
  if (Array.isArray(value)) return value.map(withoutVolatileFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !VOLATILE_KEYS.has(key))
      .map(([key, child]) => [key, withoutVolatileFields(child)]),
  );
}

function collectMetrics(value, prefix = '', output = [], depth = 0) {
  if (output.length >= 6 || depth > 2 || value == null) return output;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    if (prefix && !VOLATILE_KEYS.has(prefix.split('.').pop())) {
      output.push({ key: prefix, value });
    }
    return output;
  }
  if (Array.isArray(value)) {
    if (prefix) output.push({ key: `${prefix}.count`, value: value.length });
    return output;
  }
  const preferred = ['summary', 'systemAvailability', 'expectedOutage', 'eensKwh', 'converged', 'valid', 'status'];
  const keys = [...new Set([...preferred.filter(key => key in value), ...Object.keys(value)])];
  for (const key of keys) {
    if (output.length >= 6) break;
    if (VOLATILE_KEYS.has(key) || key === 'runMetadata' || key === 'inputs' || key === 'results') continue;
    collectMetrics(value[key], prefix ? `${prefix}.${key}` : key, output, depth + 1);
  }
  return output;
}

export function summarizeStudyResult(studyKey, value, provenance = {}) {
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    return {
      key: studyKey,
      label: STUDY_LABELS[studyKey] || studyKey,
      present: false,
      valid: false,
      runAt: null,
      sourceFingerprint: null,
      metrics: [],
    };
  }
  return {
    key: studyKey,
    label: STUDY_LABELS[studyKey] || studyKey,
    present: true,
    valid: value?.runMetadata ? value.runMetadata.valid === true : null,
    runAt: value?.runMetadata?.runAt || value?.generatedAt || value?.updatedAt || provenance?.capturedAt || null,
    sourceFingerprint: value?.runMetadata?.sourceFingerprint || provenance?.inputHash || null,
    metrics: collectMetrics(value),
  };
}

export function compareStudyCollections(before = {}, after = {}, provenanceBefore = {}, provenanceAfter = {}) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
  return keys.map(key => {
    const first = summarizeStudyResult(key, before?.[key], provenanceBefore?.[key]);
    const second = summarizeStudyResult(key, after?.[key], provenanceAfter?.[key]);
    let status = 'unchanged';
    if (!first.present && second.present) status = 'added';
    else if (first.present && !second.present) status = 'removed';
    else if (
      stableSerialize(withoutVolatileFields(before?.[key]))
      !== stableSerialize(withoutVolatileFields(after?.[key]))
    ) status = 'changed';
    return { key, label: first.label, status, before: first, after: second };
  });
}

/**
 * Build a deterministic, read-only study rerun checklist from a comparison.
 * The checklist identifies potentially affected study families; it does not
 * recalculate results, establish result freshness, or grant approval.
 */
export function buildScenarioStudyImpact(comparison = {}) {
  const impacts = new Map();
  const targetStudies = new Map(
    (Array.isArray(comparison.studies) ? comparison.studies : [])
      .map(study => [study.key, study.after]),
  );

  for (const domain of Array.isArray(comparison.domains) ? comparison.domains : []) {
    if (!domain?.counts?.totalChanges) continue;
    const rule = STUDY_IMPACT_RULES[domain.key];
    if (!rule) continue;
    for (const studyKey of rule.studies) {
      const existing = impacts.get(studyKey) || {
        key: studyKey,
        label: STUDY_LABELS[studyKey] || studyKey,
        priority: rule.priority,
        domains: [],
        changedRecords: 0,
      };
      if (IMPACT_PRIORITY_RANK[rule.priority] < IMPACT_PRIORITY_RANK[existing.priority]) {
        existing.priority = rule.priority;
      }
      existing.domains.push(domain.label);
      existing.changedRecords += domain.counts.totalChanges;
      impacts.set(studyKey, existing);
    }
  }

  return [...impacts.values()]
    .map(impact => {
      const target = targetStudies.get(impact.key);
      return {
        ...impact,
        domains: [...new Set(impact.domains)],
        action: target?.present ? 'rerun' : 'consider',
        targetState: target?.present ? 'Saved result present' : 'Not saved in comparison scenario',
      };
    })
    .sort((first, second) => (
      IMPACT_PRIORITY_RANK[first.priority] - IMPACT_PRIORITY_RANK[second.priority]
      || first.label.localeCompare(second.label)
    ));
}

export function compareProjectScenarios(before = {}, after = {}) {
  const domains = DOMAIN_DEFINITIONS.map(definition => ({
    key: definition.key,
    label: definition.label,
    ...compareEntityCollections(before?.[definition.key], after?.[definition.key], {
      identityKeys: definition.identity,
    }),
  }));

  const firstOneLine = flattenOneLine(before?.oneLine);
  const secondOneLine = flattenOneLine(after?.oneLine);
  const oneLine = {
    key: 'oneLine',
    label: 'One-Line Components',
    ...compareEntityCollections(firstOneLine.components, secondOneLine.components, {
      identityKeys: ['id', 'tag', 'ref', 'name'],
    }),
    sheetCountBefore: firstOneLine.sheets.length,
    sheetCountAfter: secondOneLine.sheets.length,
    connectionCountBefore: firstOneLine.connectionCount,
    connectionCountAfter: secondOneLine.connectionCount,
  };
  const oneLineSheets = {
    key: 'oneLineSheets',
    label: 'One-Line Sheets',
    ...compareEntityCollections(firstOneLine.sheets, secondOneLine.sheets, {
      identityKeys: ['sheetKey'],
    }),
  };
  const oneLineConnections = {
    key: 'oneLineConnections',
    label: 'One-Line Connections',
    ...compareEntityCollections(firstOneLine.connections, secondOneLine.connections, {
      identityKeys: ['connectionKey'],
    }),
  };
  domains.push(oneLineSheets, oneLine, oneLineConnections);

  const studies = compareStudyCollections(
    before?.studies,
    after?.studies,
    before?.studyProvenance,
    after?.studyProvenance,
  ).map(study => {
    const beforeApproval = before?.studyApprovals?.[study.key] || null;
    const afterApproval = after?.studyApprovals?.[study.key] || null;
    const approvalChanged = stableSerialize(withoutVolatileFields(beforeApproval))
      !== stableSerialize(withoutVolatileFields(afterApproval));
    return {
      ...study,
      status: study.status === 'unchanged' && approvalChanged ? 'changed' : study.status,
      approvalChanged,
      beforeApproval,
      afterApproval,
    };
  });
  const changedStudies = studies.filter(study => study.status !== 'unchanged').length;
  const totals = domains.reduce((summary, domain) => ({
    added: summary.added + domain.counts.added,
    removed: summary.removed + domain.counts.removed,
    changed: summary.changed + domain.counts.changed,
  }), { added: 0, removed: 0, changed: 0 });

  return {
    beforeScenario: before?.scenario || 'Scenario A',
    afterScenario: after?.scenario || 'Scenario B',
    domains,
    studies,
    impact: buildScenarioStudyImpact({ domains, studies }),
    totals: {
      ...totals,
      changedStudies,
      totalChanges: totals.added + totals.removed + totals.changed + changedStudies,
    },
  };
}
