/**
 * Centralized input validation helpers.
 *
 * Each helper validates a single value and returns a safe result.
 * Prefer these over raw parseFloat/parseInt in business logic.
 */

/**
 * Parse and validate a numeric value.
 * Returns `fallback` when the parsed result is NaN.
 * @param {*} value - Raw input (string, number, etc.)
 * @param {{ min?: number, max?: number, fallback?: number }} [opts]
 * @returns {number}
 */
export function validateNumber(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
    const n = Number(value);
    if (!isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

/**
 * Validate a coordinate value (must be a finite number).
 * Returns `fallback` (default 0) when invalid.
 * @param {*} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function validateCoordinate(value, fallback = 0) {
    const n = Number(value);
    return isFinite(n) ? n : fallback;
}

/**
 * Validate a strictly positive number (> 0).
 * Returns `fallback` (default 0) when the value is ≤ 0 or non-finite.
 * @param {*} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function validatePositive(value, fallback = 0) {
    const n = Number(value);
    return isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Validate a non-negative number (≥ 0).
 * Returns `fallback` (default 0) when the value is < 0 or non-finite.
 * @param {*} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function validateNonNegative(value, fallback = 0) {
    const n = Number(value);
    return isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Validate a string ID (must be a non-empty string after trimming).
 * Returns `fallback` (default '') when invalid.
 * @param {*} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function validateId(value, fallback = '') {
    const s = String(value ?? '').trim();
    return s.length > 0 ? s : fallback;
}

/**
 * Validate a CSV row against a schema of required column names.
 * Returns an object describing missing/extra columns.
 * @param {string[]} actualHeaders - Headers parsed from the CSV.
 * @param {string[]} requiredHeaders - Columns that must be present.
 * @returns {{ valid: boolean, missing: string[], extra: string[] }}
 */
export function validateCsvHeaders(actualHeaders, requiredHeaders) {
    const actual = new Set(actualHeaders.map(h => h.trim()));
    const missing = requiredHeaders.filter(h => !actual.has(h));
    const extra = [...actual].filter(h => !requiredHeaders.includes(h));
    return { valid: missing.length === 0, missing, extra };
}

/**
 * Parse and validate a JSON string, returning `fallback` on any error.
 * @param {string} text
 * @param {*} [fallback]
 * @returns {*}
 */
export function safeParseJson(text, fallback = null) {
    try {
        return JSON.parse(text);
    } catch {
        return fallback;
    }
}

/**
 * Safely read a JSON value from localStorage, returning `fallback` on error.
 * @param {string} key
 * @param {*} [fallback]
 * @returns {*}
 */
export function localStorageGetJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}
