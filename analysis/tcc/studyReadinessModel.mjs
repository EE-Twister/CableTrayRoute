const STATUS = Object.freeze({
  CALCULATION_READY: 'calculation_ready',
  SOURCE_VERIFIED: 'source_verified',
  STANDARDS_REFERENCE: 'standards_reference',
  SCREENING: 'screening',
});

const PROTECTIVE_TYPES = new Set(['breaker', 'fuse', 'relay', 'relay_87', 'recloser', 'contactor', 'switch']);

function assessmentStatus(entry) {
  return entry?.libraryAssessment?.status || entry?.baseDevice?.libraryStatus || STATUS.SCREENING;
}

function isProtectiveEntry(entry) {
  const type = String(entry?.baseDevice?.type || entry?.deviceType || '').toLowerCase();
  const subtype = String(entry?.baseDevice?.subtype || '').toLowerCase();
  return PROTECTIVE_TYPES.has(type) || PROTECTIVE_TYPES.has(subtype);
}

function hasSettings(entry) {
  return Boolean(entry?.baseDevice && Object.keys(entry.baseDevice.settings || {}).length);
}

function curveDomain(entry) {
  const device = entry?.baseDevice || {};
  const curves = [device.curve, ...(device.curveProfiles || []).map(profile => profile?.curve)]
    .filter(Array.isArray)
    .flat();
  const currents = curves.map(point => Number(point?.current)).filter(value => Number.isFinite(value) && value > 0);
  if (!currents.length) return 'Not recorded';
  return `${Math.min(...currents)}–${Math.max(...currents)} A`;
}

function settingsFingerprint(entries, context) {
  const payload = JSON.stringify({
    faultCurrentA: context.faultCurrentA,
    componentId: context.componentId,
    coordinationMargin: context.coordinationMargin,
    coordinationOrder: context.coordinationOrder,
    rangePreset: context.rangePreset,
    entries: entries.map(entry => ({
      id: entry?.baseDevice?.id || entry?.uid || '',
      status: assessmentStatus(entry),
      settings: { ...(entry?.baseDevice?.settings || {}), ...(entry?.overrideSource || {}) },
      curve: entry?.baseDevice?.curve || null,
      curveProfiles: entry?.baseDevice?.curveProfiles || null,
      curveEvidence: entry?.baseDevice?.curveEvidence || null,
    })),
  });
  let hash = 5381;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (((hash << 5) + hash) ^ payload.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function countAssessmentStatus(entries, status) {
  return entries.filter(entry => entry?.libraryAssessment?.status === status).length;
}

export function summarizeTccStudyReadiness(entries = []) {
  const selectedEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const assessedEntries = selectedEntries.filter(entry => entry?.libraryAssessment?.status);
  const counts = {
    selected: selectedEntries.length,
    calculationReady: countAssessmentStatus(assessedEntries, STATUS.CALCULATION_READY),
    sourceVerified: countAssessmentStatus(assessedEntries, STATUS.SOURCE_VERIFIED),
    standardsReference: countAssessmentStatus(assessedEntries, STATUS.STANDARDS_REFERENCE),
    screening: countAssessmentStatus(assessedEntries, STATUS.SCREENING),
    references: selectedEntries.length - assessedEntries.length,
  };

  if (!selectedEntries.length) {
    return {
      status: 'empty',
      heading: 'Choose protective devices',
      summary: 'Select the exact devices and configurations that define the coordination path.',
      actionLabel: 'Choose devices',
      counts,
    };
  }

  if (counts.screening) {
    const restrictedCount = counts.screening;
    return {
      status: 'screening',
      heading: 'Screening-only study',
      summary: `${restrictedCount} selected ${restrictedCount === 1 ? 'curve is' : 'curves are'} not calculation-ready. Use the plot for preliminary comparison only, not issued settings or arc-flash clearing times.`,
      actionLabel: 'Review device evidence',
      counts,
    };
  }

  if (counts.sourceVerified) {
    return {
      status: 'review',
      heading: 'Independent review required',
      summary: `${counts.sourceVerified} source-verified ${counts.sourceVerified === 1 ? 'curve is' : 'curves are'} awaiting peer review before issued calculations or settings.`,
      actionLabel: 'Review device evidence',
      counts,
    };
  }

  if (counts.standardsReference) {
    return {
      status: 'review',
      heading: 'Settings basis requires review',
      summary: `${counts.standardsReference} selected ${counts.standardsReference === 1 ? 'curve uses' : 'curves use'} a standards-reference equation. Verify the applied settings and associated interrupting device.`,
      actionLabel: 'Review selected devices',
      counts,
    };
  }

  if (assessedEntries.length && counts.calculationReady === assessedEntries.length) {
    return {
      status: 'ready',
      heading: 'Device evidence is calculation-ready',
      summary: 'The selected device records meet the library gate. Confirm project topology, settings, fault-current basis, and coordination order before engineering review.',
      actionLabel: 'Review selected devices',
      counts,
    };
  }

  return {
    status: 'review',
    heading: 'Review the selected curves',
    summary: 'System and equipment-reference curves still require project-specific verification before issued use.',
    actionLabel: 'Review selected devices',
    counts,
  };
}

export function buildTccWorkflowContext(entries = [], options = {}) {
  const selectedEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const protectiveEntries = selectedEntries.filter(isProtectiveEntry);
  const settingsEntries = protectiveEntries.filter(hasSettings);
  const restrictedEntries = protectiveEntries.filter(entry => assessmentStatus(entry) !== STATUS.CALCULATION_READY);
  const restrictedSettingsEntries = settingsEntries.filter(entry => assessmentStatus(entry) !== STATUS.CALCULATION_READY);
  const faultCurrentA = Number(options.faultCurrentA);
  const hasFaultCurrent = Number.isFinite(faultCurrentA) && faultCurrentA > 0;
  const autoCoordination = {
    allowed: protectiveEntries.length >= 2 && !restrictedEntries.length && hasFaultCurrent,
    reason: protectiveEntries.length < 2
      ? 'Select and plot at least two protective devices before automatic coordination.'
      : restrictedEntries.length
        ? `${restrictedEntries.length} protective ${restrictedEntries.length === 1 ? 'curve is' : 'curves are'} not calculation-ready. Automatic settings are blocked; use the plot for preliminary comparison.`
        : 'Run the Short Circuit study for the active component before automatic coordination. No assumed fault current is used.',
  };
  const settingsExport = {
    allowed: Boolean(settingsEntries.length) && !restrictedSettingsEntries.length,
    reason: !settingsEntries.length
      ? 'No selected calculation-ready device has configurable settings to export.'
      : `${restrictedSettingsEntries.length} settings-bearing ${restrictedSettingsEntries.length === 1 ? 'device is' : 'devices are'} not calculation-ready. Draft settings export is blocked.`,
  };
  const readiness = summarizeTccStudyReadiness(selectedEntries);
  const context = {
    readiness,
    selectedEntries,
    protectiveEntries,
    settingsEntries,
    faultCurrentA: hasFaultCurrent ? faultCurrentA : null,
    faultCurrentSource: hasFaultCurrent ? String(options.faultCurrentSource || 'Project short-circuit study') : 'Unavailable — no assumed fault current',
    componentId: String(options.componentId || ''),
    coordinationMargin: Number.isFinite(Number(options.coordinationMargin)) ? Number(options.coordinationMargin) : 0.3,
    coordinationOrder: Array.isArray(options.coordinationOrder) ? [...options.coordinationOrder] : [],
    rangePreset: String(options.rangePreset || 'full'),
    autoCoordination,
    settingsExport,
  };
  context.provenance = {
    status: readiness.status,
    heading: readiness.heading,
    summary: readiness.summary,
    intendedUse: readiness.status === 'ready'
      ? 'Device evidence is calculation-ready; qualified human review of topology, settings, fault-current basis, and coordination remains required.'
      : 'Preliminary screening only — not for issued settings or arc-flash clearing times.',
    faultCurrentA: context.faultCurrentA,
    faultCurrentSource: context.faultCurrentSource,
    componentId: context.componentId,
    coordinationMargin: context.coordinationMargin,
    coordinationOrder: context.coordinationOrder,
    rangePreset: context.rangePreset,
    inputFingerprint: settingsFingerprint(protectiveEntries, context),
    devices: protectiveEntries.map(entry => {
      const device = entry.baseDevice || {};
      const evidence = device.curveEvidence || {};
      return {
        name: entry.name || device.name || entry.uid || 'Unknown device',
        identity: device.catalogNumber || device.tripUnitModel || device.id || entry.uid || 'Not recorded',
        manufacturer: device.manufacturer || device.vendor || 'Not recorded',
        readiness: entry?.libraryAssessment?.label || assessmentStatus(entry).replaceAll('_', ' '),
        curveSource: evidence.document || device.datasheetUrl || 'Not recorded',
        curveReference: evidence.curveNumber || evidence.curveId || evidence.page || 'Not recorded',
        revision: evidence.revision || evidence.date || 'Not recorded',
        curveDomain: curveDomain(entry),
      };
    }),
  };
  return context;
}
