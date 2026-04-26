/**
 * Study Calculation Basis Panel
 *
 * Renders a collapsible "Calculation Basis" card on electrical study pages,
 * documenting the standard reference, key formulas, assumptions, limitations,
 * and a link to the public validation/benchmark page.
 *
 * Usage:
 *   import { initStudyBasisPanel } from './src/components/studyBasis.js';
 *   initStudyBasisPanel('arcFlash', {
 *     standard: 'IEEE 1584-2018',
 *     clause: '§4 — Arc Flash Calculation',
 *     formulas: ['I_af = f(Ibf, V, gap, config)', 'E = 4.184 Cf En (t/0.2) (610/D)^x'],
 *     assumptions: ['Bolted fault current from system model', '...'],
 *     limitations: ['208 V – 15 kV only', 'AC three-phase systems'],
 *     benchmarkId: 'ieee1584-arc-flash',
 *   });
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Initialise the calculation basis panel inside a container element.
 *
 * @param {string} studyKey   Identifier for this study (used for aria label).
 * @param {Object} config     Basis configuration.
 * @param {string} config.standard        Full standard name and year.
 * @param {string} [config.clause]        Specific clause or section reference.
 * @param {string[]} [config.formulas]    Key formula strings (plain text or inline math).
 * @param {string[]} [config.assumptions] List of calculation assumptions.
 * @param {string[]} [config.limitations] Known scope limitations.
 * @param {string} [config.benchmarkId]   Anchor ID in validation.html for this benchmark.
 * @param {string} [containerId='study-basis-panel']  ID of the host element.
 */
export function initStudyBasisPanel(studyKey, config = {}, containerId = 'study-basis-panel') {
  if (typeof document === 'undefined') return;

  const container = document.getElementById(containerId);
  if (!container) return;

  const {
    standard = '',
    clause = '',
    formulas = [],
    assumptions = [],
    limitations = [],
    benchmarkId = '',
  } = config;

  const formulaHtml = formulas.length
    ? `<div class="study-basis__section">
        <h4>Key Formulas</h4>
        <ul class="study-basis__list study-basis__list--code">
          ${formulas.map(f => `<li><code>${esc(f)}</code></li>`).join('\n          ')}
        </ul>
       </div>`
    : '';

  const assumptionsHtml = assumptions.length
    ? `<div class="study-basis__section">
        <h4>Assumptions</h4>
        <ul class="study-basis__list">
          ${assumptions.map(a => `<li>${esc(a)}</li>`).join('\n          ')}
        </ul>
       </div>`
    : '';

  const limitationsHtml = limitations.length
    ? `<div class="study-basis__section">
        <h4>Known Limitations</h4>
        <ul class="study-basis__list study-basis__list--warn">
          ${limitations.map(l => `<li>${esc(l)}</li>`).join('\n          ')}
        </ul>
       </div>`
    : '';

  const benchmarkLink = benchmarkId
    ? `<p class="study-basis__benchmark-link">
         <a href="validation.html#${esc(benchmarkId)}">View benchmark case &rarr;</a>
       </p>`
    : '';

  const headerId = `${containerId}-heading`;

  container.innerHTML = `
    <details class="study-basis-panel" aria-labelledby="${headerId}">
      <summary class="study-basis-panel__summary" id="${headerId}">
        <span class="study-basis-panel__title">Calculation Basis</span>
        <span class="study-basis-panel__standard">${esc(standard)}${clause ? ` — ${esc(clause)}` : ''}</span>
      </summary>
      <div class="study-basis-panel__body">
        ${formulaHtml}
        ${assumptionsHtml}
        ${limitationsHtml}
        ${benchmarkLink}
      </div>
    </details>`;
}
