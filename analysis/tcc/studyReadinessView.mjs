import { summarizeTccStudyReadiness } from './studyReadinessModel.mjs';

export function createTccStudyReadinessView(doc, options = {}) {
  const elements = {
    summary: doc?.getElementById('tcc-readiness-summary'),
    heading: doc?.getElementById('tcc-readiness-heading'),
    detail: doc?.getElementById('tcc-readiness-detail'),
    selected: doc?.getElementById('tcc-readiness-selected'),
    ready: doc?.getElementById('tcc-readiness-ready'),
    review: doc?.getElementById('tcc-readiness-review'),
    screening: doc?.getElementById('tcc-readiness-screening'),
    action: doc?.getElementById('tcc-readiness-action'),
  };
  elements.action?.addEventListener('click', () => options.onChooseDevices?.());
  doc?.getElementById('tcc-chart-empty-action')?.addEventListener('click', () => options.onUpdatePlot?.());

  return function renderTccStudyReadiness() {
    const readiness = summarizeTccStudyReadiness(options.getEntries?.() || []);
    if (elements.summary) elements.summary.dataset.status = readiness.status;
    if (elements.heading) elements.heading.textContent = readiness.heading;
    if (elements.detail) elements.detail.textContent = readiness.summary;
    if (elements.selected) elements.selected.textContent = String(readiness.counts.selected);
    if (elements.ready) elements.ready.textContent = String(readiness.counts.calculationReady);
    if (elements.review) {
      elements.review.textContent = String(readiness.counts.sourceVerified + readiness.counts.standardsReference);
    }
    if (elements.screening) elements.screening.textContent = String(readiness.counts.screening);
    if (elements.action) elements.action.textContent = readiness.actionLabel;
  };
}
