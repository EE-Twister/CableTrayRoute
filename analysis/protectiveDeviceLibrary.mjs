const STATUS = Object.freeze({
  CALCULATION_READY: 'calculation_ready',
  SOURCE_VERIFIED: 'source_verified',
  STANDARDS_REFERENCE: 'standards_reference',
  SCREENING: 'screening'
});

const STATUS_DETAILS = Object.freeze({
  [STATUS.CALCULATION_READY]: {
    label: 'Calculation-ready',
    shortLabel: 'Ready',
    summary: 'Configuration, curve evidence, and validation metadata are present.'
  },
  [STATUS.SOURCE_VERIFIED]: {
    label: 'Source verified — peer review pending',
    shortLabel: 'Review',
    summary: 'Exact configuration, ratings, and manufacturer curve evidence are recorded. Complete an independent review before issued calculations or settings.'
  },
  [STATUS.STANDARDS_REFERENCE]: {
    label: 'Standards reference',
    shortLabel: 'Standard',
    summary: 'Uses the published IEC 60255 inverse-time equation family; verify the applied settings and associated interrupting device.'
  },
  [STATUS.SCREENING]: {
    label: 'Screening only',
    shortLabel: 'Screening',
    summary: 'Use for preliminary coordination only. Confirm the exact manufacturer curve and device configuration before issuing calculations or settings.'
  }
});

const PROTECTIVE_TYPES = new Set(['breaker', 'fuse', 'relay', 'relay_87', 'recloser', 'contactor', 'switch']);
const NON_INTERRUPTING_TYPES = new Set(['relay', 'relay_87']);

function cleanText(value) {
  return String(value ?? '').trim();
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function parsePairList(value, firstKey, secondKey) {
  if (Array.isArray(value)) return value;
  return cleanText(value)
    .split(/[;\n]+/)
    .map((entry) => {
      const [first, second] = entry.split(/[:@]/, 2).map(part => numeric(part));
      if (!(first > 0) || !(second > 0)) return null;
      return { [firstKey]: first, [secondKey]: second };
    })
    .filter(Boolean);
}

function normalizeCurve(value) {
  const rows = Array.isArray(value) ? value : parsePairList(value, 'current', 'time');
  return rows
    .map((row) => {
      const current = numeric(row?.current);
      const time = numeric(row?.time);
      return current > 0 && time > 0 ? { current, time } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.current - b.current);
}

function normalizeInterruptingRatings(value) {
  const rows = Array.isArray(value) ? value : parsePairList(value, 'voltageVac', 'currentKA');
  return rows
    .map((row) => {
      const voltageVac = numeric(row?.voltageVac ?? row?.voltage ?? row?.ratedVoltageVac);
      const currentKA = numeric(row?.currentKA ?? row?.valueKA ?? row?.value);
      return voltageVac > 0 && currentKA > 0 ? {
        voltageVac,
        currentKA,
        currentType: cleanText(row?.currentType) || 'AC',
        ratingType: cleanText(row?.ratingType) || 'AIR'
      } : null;
    })
    .filter(Boolean);
}

/**
 * Adapt a governed project manufacturer-catalog row into the TCC device
 * shape. This intentionally carries only declared curve points and provenance;
 * it never manufactures a curve or promotes a screening row to usable status.
 */
export function normalizeCatalogProtectiveDevice(product) {
  if (!product || typeof product !== 'object' || product.category !== 'protective_device') return null;
  const type = cleanText(product.protective_device_type ?? product.device_type ?? product.type).toLowerCase();
  if (!PROTECTIVE_TYPES.has(type)) return null;

  const catalogNumber = cleanText(product.catalogNumber ?? product.catalog_number ?? product.partNumber ?? product.id);
  const manufacturer = cleanText(product.manufacturer ?? product.vendor);
  const identity = [manufacturer, catalogNumber || cleanText(product.id)]
    .filter(Boolean)
    .join('_')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!identity) return null;

  const curveEvidence = {
    document: cleanText(product.protective_device_curve_document ?? product.curveEvidence?.document ?? product.datasheetUrl),
    revision: cleanText(product.protective_device_curve_revision ?? product.curveEvidence?.revision),
    curveNumber: cleanText(product.protective_device_curve_id ?? product.curveEvidence?.curveNumber ?? product.curveEvidence?.curveId),
    extractionMethod: cleanText(product.protective_device_curve_extraction_method ?? product.curveEvidence?.extractionMethod),
    reviewer: cleanText(product.protective_device_curve_reviewer ?? product.curveEvidence?.reviewer)
  };
  const declaredStatus = cleanText(product.protective_device_library_status).toLowerCase();
  const sourceVerified = product.evidenceStatus === STATUS.SOURCE_VERIFIED;
  const libraryStatus = sourceVerified && (declaredStatus === STATUS.CALCULATION_READY || declaredStatus === STATUS.SOURCE_VERIFIED)
    ? declaredStatus
    : sourceVerified ? STATUS.SOURCE_VERIFIED : STATUS.SCREENING;
  const interruptingRatings = normalizeInterruptingRatings(
    product.protective_device_interrupting_ratings ?? product.interruptingRatings
  );
  const curve = normalizeCurve(product.protective_device_curve ?? product.curve);
  const settings = {
    pickup: numeric(product.protective_device_pickup ?? product.settings?.pickup),
    time: numeric(product.protective_device_time ?? product.settings?.time),
    instantaneous: numeric(product.protective_device_instantaneous ?? product.settings?.instantaneous)
  };
  Object.keys(settings).forEach(key => {
    if (!(settings[key] > 0)) delete settings[key];
  });

  return {
    id: `project_catalog_${identity}`,
    type,
    vendor: manufacturer,
    manufacturer,
    name: cleanText(product.description) || [manufacturer, catalogNumber].filter(Boolean).join(' '),
    catalogNumber,
    tripUnitModel: cleanText(product.protective_device_trip_unit_model ?? product.tripUnitModel),
    voltageClass: cleanText(product.protective_device_voltage_class ?? product.voltageClass),
    interruptingRating: interruptingRatings.reduce((highest, row) => Math.max(highest, row.currentKA), 0) || null,
    interruptingRatings,
    curve,
    curveEvidence,
    libraryStatus,
    settings,
    catalogSource: cleanText(product.source ?? product.catalog_source),
    catalogLastVerified: cleanText(product.lastVerified ?? product.catalog_last_verified),
    datasheetUrl: cleanText(product.datasheetUrl ?? product.datasheet_url),
    approved: product.approved === true,
    evidenceStatus: cleanText(product.evidenceStatus ?? product.evidence_status) || STATUS.SCREENING,
    projectCatalog: true
  };
}

function hasCurveData(device) {
  if (!device || typeof device !== 'object') return false;
  if (Array.isArray(device.curve) && device.curve.length >= 2) return true;
  if (Array.isArray(device.curveProfiles)) {
    return device.curveProfiles.some(profile => Array.isArray(profile?.curve) && profile.curve.length >= 2);
  }
  return false;
}

function isDifferentialRelay(device) {
  return device?.type === 'relay_87' || device?.subtype === 'relay_87';
}

function hasDifferentialCharacteristic(device) {
  if (!isDifferentialRelay(device)) return false;
  const settings = device?.settings;
  return Boolean(
    settings
    && Number(settings.slope1) > 0
    && Number(settings.slope2) > 0
    && Number(settings.minPickupPu) > 0
    && Number(settings.breakpointPu) > 0
  );
}

function hasProtectionCharacteristic(device) {
  return isDifferentialRelay(device) ? hasDifferentialCharacteristic(device) : hasCurveData(device);
}

function hasTraceableCurveEvidence(device, { requireReviewer = true } = {}) {
  const evidence = device?.curveEvidence;
  return Boolean(
    evidence
    && typeof evidence === 'object'
    && evidence.document
    && (evidence.revision || evidence.date)
    && (evidence.curveId || evidence.curveNumber || evidence.page)
    && evidence.extractionMethod
    && (!requireReviewer || evidence.reviewer)
  );
}

function hasRequiredRatings(device) {
  if (NON_INTERRUPTING_TYPES.has(device?.type) || device?.subtype === 'relay_87') return true;
  return Array.isArray(device?.interruptingRatings) && device.interruptingRatings.some(rating => {
    const voltage = Number(rating?.voltageVac ?? rating?.voltage ?? rating?.ratedVoltageVac);
    const current = Number(rating?.currentKA ?? rating?.valueKA ?? rating?.value);
    return Number.isFinite(voltage) && voltage > 0 && Number.isFinite(current) && current > 0;
  });
}

function calculationReadyRequirements(device, { requireReviewer = true } = {}) {
  const missing = [];
  if (!device?.catalogNumber && !device?.tripUnitModel) {
    missing.push('exact catalog number or trip-unit model');
  }
  if (!hasRequiredRatings(device)) {
    missing.push('voltage-specific interrupting ratings');
  }
  if (!hasProtectionCharacteristic(device)) {
    missing.push(isDifferentialRelay(device) ? 'differential protection characteristic' : 'curve data');
  }
  if (!hasTraceableCurveEvidence(device, { requireReviewer })) {
    missing.push(requireReviewer ? 'traceable curve evidence and reviewer' : 'traceable curve evidence');
  }
  return missing;
}

/**
 * Assess how a protective-device entry may be used. A record is never promoted
 * merely because it names a manufacturer: production status requires an exact
 * configuration, ratings, curve provenance, and independent review.
 */
export function assessProtectiveDeviceLibraryEntry(device) {
  if (!device || typeof device !== 'object') {
    return {
      status: STATUS.SCREENING,
      ...STATUS_DETAILS[STATUS.SCREENING],
      missing: ['device record']
    };
  }

  if (device.iec60255 === true) {
    return {
      status: STATUS.STANDARDS_REFERENCE,
      ...STATUS_DETAILS[STATUS.STANDARDS_REFERENCE],
      missing: []
    };
  }

  const missing = calculationReadyRequirements(device);
  if (device.libraryStatus === STATUS.CALCULATION_READY && !missing.length) {
    return {
      status: STATUS.CALCULATION_READY,
      ...STATUS_DETAILS[STATUS.CALCULATION_READY],
      missing: []
    };
  }

  const sourceVerifiedMissing = calculationReadyRequirements(device, { requireReviewer: false });
  if (device.libraryStatus === STATUS.SOURCE_VERIFIED && !sourceVerifiedMissing.length) {
    return {
      status: STATUS.SOURCE_VERIFIED,
      ...STATUS_DETAILS[STATUS.SOURCE_VERIFIED],
      missing: device?.curveEvidence?.reviewer ? [] : ['independent reviewer']
    };
  }

  return {
    status: STATUS.SCREENING,
    ...STATUS_DETAILS[STATUS.SCREENING],
    missing
  };
}

export function summarizeProtectiveDeviceLibrary(devices) {
  const counts = {
    [STATUS.CALCULATION_READY]: 0,
    [STATUS.SOURCE_VERIFIED]: 0,
    [STATUS.STANDARDS_REFERENCE]: 0,
    [STATUS.SCREENING]: 0,
    total: 0
  };
  (Array.isArray(devices) ? devices : []).forEach(device => {
    const assessment = assessProtectiveDeviceLibraryEntry(device);
    counts[assessment.status] += 1;
    counts.total += 1;
  });
  return counts;
}

export { STATUS as PROTECTIVE_DEVICE_LIBRARY_STATUS };
