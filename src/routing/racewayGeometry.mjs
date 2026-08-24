export function normalizeRacewayPath(path) {
    if (!Array.isArray(path) || path.length < 2) return null;
    const normalized = path.map(point => Array.isArray(point) ? point.slice(0, 3).map(Number) : []);
    return normalized.every(point => point.length === 3 && point.every(Number.isFinite)) ? normalized : null;
}
