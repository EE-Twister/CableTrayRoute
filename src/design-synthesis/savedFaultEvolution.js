/** Render read-only evidence for a saved fault source-profile history. */
export function renderSavedFaultEvolutionEvidence({ status = 'missing', faultCaseCount = 0, deviceHistoryCount = 0 } = {}) {
  const messages = {
    missing: 'No saved source-history evidence exists for the active project and scenario.',
    stale: 'Saved source-history evidence exists, but the current project or study records do not match it. Saved numerical results and downloads are hidden.',
    current: 'The saved history matches the current canonical project and study records. Inputs and results remain supplied, unverified screening evidence; protection adequacy is unevaluated.',
  };
  const valid = status === 'current';
  return `<section id="synthesis-saved-fault-evolution" class="card synthesis-saved-evidence" aria-labelledby="synthesis-saved-fault-evolution-heading"><h3 id="synthesis-saved-fault-evolution-heading">Saved source-history evidence</h3><p class="field-hint" role="status" aria-live="polite">${messages[status] || messages.stale}</p>${valid ? `<p data-saved-fault-evolution-summary>Saved screening result: ${faultCaseCount} fault cases and ${deviceHistoryCount} device histories. Supplied, unverified evidence; protection adequacy is unevaluated.</p><div class="synthesis-actions"><button type="button" class="btn" data-saved-fault-evolution-review>Review saved numerical history</button><button type="button" class="btn" data-saved-fault-evolution-download="json">Download saved history JSON</button><button type="button" class="btn" data-saved-fault-evolution-download="report">Download saved history TXT</button></div><div data-saved-fault-evolution-review-container hidden></div>` : ''}</section>`;
}

/** Bind one-shot file downloads after the containing view has been rendered. */
export function bindSavedFaultEvolutionDownloads(container, { getPayload, getReviewMarkup, download } = {}) {
  if (!container || typeof download !== 'function') return;
  const currentPayload = () => {
    const payload = getPayload?.();
    if (payload) return payload;
    container.innerHTML = renderSavedFaultEvolutionEvidence({ status: 'stale' });
    return null;
  };
  container.querySelector('[data-saved-fault-evolution-download="json"]')?.addEventListener('click', () => {
    const payload = currentPayload();
    if (payload) download('saved-fault-source-history.json', JSON.stringify(payload, null, 2), 'application/json');
  });
  container.querySelector('[data-saved-fault-evolution-download="report"]')?.addEventListener('click', () => {
    const payload = currentPayload();
    if (payload) download('saved-fault-source-history.txt', getReviewMarkup?.(payload, true) || '', 'text/plain');
  });
  container.querySelector('[data-saved-fault-evolution-review]')?.addEventListener('click', event => {
    const payload = currentPayload();
    if (!payload) return;
    const button = event.currentTarget;
    const target = container.querySelector('[data-saved-fault-evolution-review-container]');
    if (!target) return;
    if (!target.dataset.loaded) {
      target.innerHTML = getReviewMarkup?.(payload, false) || '<p>No saved numerical history is available.</p>';
      target.dataset.loaded = 'true';
    }
    target.hidden = false;
    button.hidden = true;
  });
}
