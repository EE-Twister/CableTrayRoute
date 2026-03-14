/**
 * HTML escaping utilities for safe DOM insertion.
 *
 * Use escapeHtml() whenever inserting user-controlled or external data
 * into innerHTML, attribute values, or any HTML string context.
 */

/**
 * Escape a value for safe insertion into HTML content or attributes.
 * Handles null/undefined gracefully by returning an empty string.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escape a value for use inside an HTML attribute (e.g. value="...").
 * Alias for escapeHtml — kept separate for readability at call sites.
 * @param {*} value
 * @returns {string}
 */
export const escapeAttr = escapeHtml;
