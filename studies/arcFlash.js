import { runArcFlash } from '../analysis/arcFlash.mjs';
import { getStudies, setStudies } from '../dataStore.mjs';
import { generateArcFlashReport } from '../reports/arcFlashReport.mjs';

// JSON imports require a .mjs wrapper for broad browser compatibility.

/**
 * Perform an IEEE 1584 arc‑flash study based on the current project data.
 * Results are persisted and a PDF/CSV report with labels is generated.
 * @returns {Object}
 */
export async function runArcFlashStudy() {
  const res = await runArcFlash();
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
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const res = await runArcFlashStudy();
      out.textContent = JSON.stringify(res, null, 2);
    });
  }
}
