import { runArcFlash } from '../analysis/arcFlash.js';
import { getStudies, setStudies } from '../dataStore.mjs';
import { generateArcFlashReport } from '../reports/arcFlashReport.mjs';

// JSON imports require a .mjs wrapper for broad browser compatibility.

/**
 * Perform an IEEE 1584 arc‑flash study based on the current project data.
 * Results are persisted and a PDF/CSV report with labels is generated.
 * @returns {Object}
 */
export function runArcFlashStudy() {
  const res = runArcFlash();
  const studies = getStudies();
  studies.arcFlash = res;
  setStudies(studies);
  generateArcFlashReport(res);
  return res;
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('arcflash-form');
  const out = document.getElementById('arcflash-output');
  if (form && out) {
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const res = runArcFlashStudy();
      out.textContent = JSON.stringify(res, null, 2);
    });
  }
}
