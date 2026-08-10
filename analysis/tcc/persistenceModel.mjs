export function settingsEqual(a, b) {
  const objA = a && typeof a === 'object' ? a : {};
  const objB = b && typeof b === 'object' ? b : {};
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => Object.is(objA[key], objB[key]));
}

export function buildTccSettingsSnapshot({
  saved = {},
  selectedIds = [],
  entryOverrides = [],
  annotations = [],
  viewOptions = [],
  rangePreset
}) {
  const deviceSettings = {};
  const componentSettings = {};
  entryOverrides.forEach(record => {
    if (!record || !record.entry) return;
    const { entry, overrides = {} } = record;
    if (entry.kind === 'component' && Object.keys(overrides).length) {
      componentSettings[entry.componentId] = overrides;
    } else if (entry.kind === 'library' && Object.keys(overrides).length) {
      deviceSettings[entry.baseDeviceId] = overrides;
    }
  });
  return {
    snapshot: {
      ...saved,
      devices: [...selectedIds],
      settings: deviceSettings,
      componentOverrides: componentSettings,
      viewOptions: [...viewOptions],
      rangePreset,
      annotations: annotations.map(annotation => ({ ...annotation }))
    },
    deviceSettings,
    componentSettings
  };
}

export function reconcileComponentOverrides(
  oneLine,
  componentSettings,
  libraryDevices,
  { isProtectiveType, snapOverrides }
) {
  let changed = false;
  (oneLine?.sheets || []).forEach(sheet => {
    (sheet.components || []).forEach(component => {
      if (!(isProtectiveType(component.type) || isProtectiveType(component.subtype))) return;
      const baseDevice = libraryDevices.find(device => device.id === component.tccId);
      const rawOverrides = componentSettings[component.id];
      const overrides = snapOverrides(baseDevice, rawOverrides || {});
      if (rawOverrides && Object.keys(overrides).length) {
        if (!settingsEqual(component.tccOverrides, overrides)) {
          component.tccOverrides = overrides;
          changed = true;
        }
      } else if (component.tccOverrides) {
        delete component.tccOverrides;
        changed = true;
      }
    });
  });
  return { oneLine, changed };
}
