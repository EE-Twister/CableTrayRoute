import { normalizeTrayConstruction, table39222AllowableArea } from '../../analysis/trayFill.mjs';

// The router limits fill to a percentage of the tray cross-section (width x depth).
// NEC 392.22(A)(1) instead caps multiconductor cable area by tray width alone, so on a
// deep tray the planning limit can sit well above the code allowance. Report trays whose
// planning limit exceeds the Table 392.22(A)(1) area so users confirm on the Tray Fill page.
// Unknown construction is treated as ladder, the larger allowance, so only unambiguous cases are flagged.
export function getTrayNecAdvisories(trays = [], fillLimitPercent = 40) {
    const fillLimit = parseFloat(fillLimitPercent) / 100;
    const advisories = [];
    for (const tray of trays) {
        const width = parseFloat(tray?.width) || 0;
        const planningArea = width * (parseFloat(tray?.height) || 0) * fillLimit;
        const construction = normalizeTrayConstruction(tray?.tray_type ?? tray?.trayType) || 'ladder';
        const necArea = table39222AllowableArea(width, construction);
        if (necArea && planningArea > necArea + 1e-9) {
            advisories.push({ tray_id: tray.tray_id, planningArea, necArea, construction });
        }
    }
    return advisories;
}
