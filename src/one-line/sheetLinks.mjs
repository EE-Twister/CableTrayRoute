export function normalizeSheetLinkValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function resolveLinkedSheetIndex(component, sheets = []) {
  const name = normalizeSheetLinkValue(component?.props?.linked_sheet ?? component?.linked_sheet);
  if (!name) return -1;
  return sheets.findIndex(sheet => sheet?.name === name);
}

export function findPairedConnector(linkId, subtype, sheets = []) {
  if (!linkId) return null;
  const partnerSubtype = subtype === 'link_source' ? 'link_target' : 'link_source';
  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
    const component = (sheets[sheetIndex]?.components || []).find(candidate => (
      candidate?.type === 'sheet_link'
      && candidate.subtype === partnerSubtype
      && (candidate.props?.link_id ?? candidate.link_id ?? '') === linkId
    ));
    if (component) return { sheetIndex, component };
  }
  return null;
}

export function validateSheetLinks(sheets = []) {
  const issues = [];
  sheets.forEach((sheet, sheetIndex) => {
    (sheet?.components || []).forEach(component => {
      if (component?.type !== 'sheet_link') return;
      const linkId = normalizeSheetLinkValue(component.props?.link_id ?? component.link_id);
      const linkedSheet = normalizeSheetLinkValue(component.props?.linked_sheet ?? component.linked_sheet);
      if (!linkId) {
        issues.push({ component: component.id, sheetIndex, message: 'Sheet link has no link_id' });
      }
      if (!linkedSheet) {
        issues.push({ component: component.id, sheetIndex, message: 'Sheet link has no target sheet set' });
      }
      if (linkId && !findPairedConnector(linkId, component.subtype, sheets)) {
        issues.push({
          component: component.id,
          sheetIndex,
          message: `No matching paired connector for link_id "${linkId}"`
        });
      }
    });
  });
  return issues;
}

export function getSheetLinkBadgeText(component) {
  const name = normalizeSheetLinkValue(component?.props?.linked_sheet ?? component?.linked_sheet);
  if (!name) return '';
  const arrow = component?.subtype === 'link_source' ? '→' : '←';
  return `${arrow} ${name}`;
}
