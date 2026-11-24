// Chooses the tray Cable Tray Fill opens on (application review U5).
//
// Precedence:
//   1. a one-shot handoff stored by Raceway Schedule or Optimal Route
//      (`trayFillData`), which carries the tray and its cables;
//   2. `?blank=1`, the "New blank tray" choice for manual entry;
//   3. `?tray=<id>`, when that tray is in the project (a missing id keeps the
//      blank tray and is reported, rather than silently showing another tray);
//   4. the first project tray that carries cables, then the first project tray;
//   5. otherwise the blank tray, so Tray Fill still works standalone.

export const BLANK_TRAY_PARAM = 'blank';

export function trayIdentity(tray) {
  return String(tray?.tray_id || tray?.tag || tray?.id || '').trim();
}

export function findTrayById(trays, trayId) {
  const wanted = String(trayId || '').trim().toLowerCase();
  if (!wanted) return null;
  return (Array.isArray(trays) ? trays : []).find(tray => trayIdentity(tray).toLowerCase() === wanted) || null;
}

export function selectInitialTray({ stored = null, search = '', trays = [], cablesForTray = () => [] } = {}) {
  if (stored?.tray) return { source: 'handoff', context: stored };
  const params = new URLSearchParams(search || '');
  if (params.has(BLANK_TRAY_PARAM)) return { source: 'blank' };
  const requestedTrayId = String(params.get('tray') || '').trim();
  if (requestedTrayId) {
    const tray = findTrayById(trays, requestedTrayId);
    return tray ? { source: 'url', tray } : { source: 'missing', requestedTrayId };
  }
  const projectTrays = (Array.isArray(trays) ? trays : []).filter(tray => trayIdentity(tray));
  const loaded = projectTrays.find(tray => cablesForTray(trayIdentity(tray)).length > 0);
  const tray = loaded || projectTrays[0];
  return tray ? { source: 'first', tray } : { source: 'blank' };
}
