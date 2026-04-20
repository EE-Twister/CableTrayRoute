/**
 * Shared error type and result envelope for analysis modules.
 * Mirrors the .code pattern in src/validation/librarySchema.mjs.
 */

/**
 * Typed error for analysis failures. Carries a machine-readable code
 * and optional structured context for logging/UI display.
 *
 * @property {string} code     - Machine-readable code, e.g. 'INPUT_VALIDATION'
 * @property {object} [context] - Optional structured diagnostic data
 */
export class AnalysisError extends Error {
  constructor(message, code = 'ANALYSIS_ERROR', context = null) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
    if (context !== null) this.context = context;
  }
}

/**
 * Wrap a successful analysis result in a normalized envelope.
 *
 * @template T
 * @param {T} data
 * @param {string[]} [warnings]
 * @returns {{ ok: true, data: T, warnings: string[] }}
 */
export function createResult(data, warnings = []) {
  return { ok: true, data, warnings };
}

/**
 * Wrap a failure in a normalized envelope (non-throwing path).
 *
 * @param {string} message
 * @param {string} [code]
 * @returns {{ ok: false, error: string, code: string }}
 */
export function createErrorResult(message, code = 'ANALYSIS_ERROR') {
  return { ok: false, error: message, code };
}
