/**
 * Normalize the supported One-Line interchange forms at a study boundary.
 *
 * Callers may provide a component array, an object with a flat `sheets`
 * array, or the canonical sheet envelope.  This helper deliberately keeps
 * records by reference and only creates the envelope needed by the analysis
 * engines; study inputs therefore remain caller-owned and immutable.
 */
export function normalizeOneLineStudyInput(input = {}, explicitOptions = {}) {
  const source = input && typeof input === 'object' ? input : {};
  if (source && !Array.isArray(input) && 'components' in source && !Array.isArray(source.components)) {
    throw new TypeError('One-line components must be an array');
  }
  if (source && !Array.isArray(input) && 'sheets' in source && !Array.isArray(source.sheets)) {
    throw new TypeError('One-line sheets must be an array');
  }
  for (const envelopeKey of ['oneLine', 'oneLineData', 'oneLineDiagram']) {
    const envelope = source?.[envelopeKey];
    if (envelope != null && typeof envelope !== 'object') {
      throw new TypeError(`One-line ${envelopeKey} must be an object or array`);
    }
    if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)
      && 'sheets' in envelope && !Array.isArray(envelope.sheets)) {
      throw new TypeError(`One-line ${envelopeKey}.sheets must be an array`);
    }
  }
  const rawOneLine = Array.isArray(input)
    ? input
    : source.oneLine ?? source.oneLineData ?? source.oneLineDiagram
      ?? (Array.isArray(source.components) ? source.components : source);
  const rawSheets = Array.isArray(rawOneLine)
    ? rawOneLine
    : (rawOneLine && Array.isArray(rawOneLine.sheets) ? rawOneLine.sheets : []);

  const isSheetMarker = value => value && typeof value === 'object' && !Array.isArray(value)
    && !('type' in value) && !('subtype' in value)
    && ('components' in value || 'connections' in value || 'layers' in value
      || typeof value.name === 'string');
  const isSheet = value => isSheetMarker(value)
    && (Array.isArray(value.components) || Array.isArray(value.connections)
      || Array.isArray(value.layers) || typeof value.name === 'string');
  // Validate sheet-owned fields before deciding whether the array is a flat
  // component list. This catches malformed sheets even when mixed with valid
  // component records and when the sheet has no name.
  for (const sheet of rawSheets) {
    if (!isSheetMarker(sheet)) continue;
    for (const key of ['components', 'connections', 'layers']) {
      if (key in sheet && !Array.isArray(sheet[key])) {
        throw new TypeError(`One-line sheet ${key} must be an array`);
      }
    }
  }
  const isNested = rawSheets.length === 0 || rawSheets.every(isSheet);
  const sheets = isNested
    ? rawSheets.map(sheet => ({ ...sheet, components: Array.isArray(sheet?.components) ? sheet.components : [] }))
    : [{ name: 'Sheet 1', components: rawSheets }];
  const oneLine = {
    ...(rawOneLine && !Array.isArray(rawOneLine) && typeof rawOneLine === 'object' ? rawOneLine : {}),
    activeSheet: Number.isInteger(rawOneLine?.activeSheet) ? rawOneLine.activeSheet : 0,
    sheets,
  };
  const components = sheets.flatMap(sheet => sheet.components);

  const inheritedOptions = source.studyOptions && typeof source.studyOptions === 'object'
    ? source.studyOptions : (source.options && typeof source.options === 'object' ? source.options : {});
  const dataOptions = {};
  if (Array.isArray(source.cables)) dataOptions.cables = source.cables;
  if (source.tccSettings && typeof source.tccSettings === 'object') dataOptions.tccSettings = source.tccSettings;
  const options = { ...inheritedOptions, ...dataOptions, ...(explicitOptions || {}) };

  return { oneLine, components, options };
}
