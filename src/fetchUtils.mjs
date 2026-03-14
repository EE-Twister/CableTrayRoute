/**
 * Standardized fetch helpers with timeout, status checking, and consistent
 * error messages.
 *
 * All helpers throw an Error on network failure, timeout, or non-2xx
 * responses, so callers can use a single try/catch.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Fetch a URL and return the parsed JSON body.
 * Throws if the network request fails, times out, or the server returns
 * a non-ok (≥ 400) status code.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 * @returns {Promise<unknown>}
 */
export async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, ...options });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching ${url}`);
        }
        return await res.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Fetch a URL with Bearer + CSRF auth headers and return the parsed JSON body.
 * Callers should pass the auth context object from getAuthContext().
 *
 * @param {string} url
 * @param {{ token: string, csrfToken: string }} auth
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 * @returns {Promise<unknown>}
 */
export async function fetchAuthJson(url, auth, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const { method = 'GET', body, ...rest } = options;
    const headers = {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'Authorization': `Bearer ${auth.token}`,
        'X-CSRF-Token': auth.csrfToken,
        ...rest.headers,
    };
    return fetchJson(url, { method, body, ...rest, headers }, timeoutMs);
}

/**
 * Fetch a static JSON data file (e.g. from /data/ or /examples/).
 * Returns `fallback` instead of throwing when the request fails, so the
 * app can degrade gracefully for non-critical assets.
 *
 * @param {string} url
 * @param {*} [fallback]
 * @param {number} [timeoutMs]
 * @returns {Promise<unknown>}
 */
export async function fetchDataFile(url, fallback = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    try {
        return await fetchJson(url, {}, timeoutMs);
    } catch (err) {
        console.warn(`Failed to load data file: ${url}`, err);
        return fallback;
    }
}
