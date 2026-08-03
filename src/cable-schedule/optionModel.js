function addIdentifier(target, value) {
  const normalized = value == null ? '' : String(value).trim();
  if (normalized) target.add(normalized);
}

export function collectRacewayOptions({ trays = [], conduits = [], ductbanks = [] } = {}) {
  const identifiers = new Set();
  trays.forEach(tray => addIdentifier(identifiers, tray?.tray_id || tray?.id));
  conduits.forEach(conduit => {
    addIdentifier(
      identifiers,
      conduit?.tray_id || (conduit?.ductbank_id && conduit?.conduit_id
        ? `${conduit.ductbank_id}-${conduit.conduit_id}`
        : conduit?.conduit_id)
    );
  });
  ductbanks.forEach(ductbank => {
    const ductbankId = ductbank?.ductbank_id || ductbank?.id || ductbank?.tag;
    const nestedConduits = Array.isArray(ductbank?.conduits) ? ductbank.conduits : [];
    nestedConduits.forEach(conduit => {
      addIdentifier(
        identifiers,
        conduit?.tray_id || (ductbankId && conduit?.conduit_id
          ? `${ductbankId}-${conduit.conduit_id}`
          : conduit?.conduit_id)
      );
    });
  });
  return [...identifiers];
}

export function collectPanelOptions(panels = []) {
  const identifiers = new Set();
  panels.forEach(panel => addIdentifier(identifiers, panel?.panel_id || panel?.id || panel?.tag));
  return [...identifiers];
}
