export function hasStudyResultContent(element, { allowInnerText = false } = {}) {
  if (!element) return false;
  const text = ((allowInnerText ? element.innerText : '') || element.textContent || '').trim();
  return !!text && text !== 'No results';
}

export function gatherStudyResultSections(resultsElement, loadFlowElement) {
  const sections = [];
  if (hasStudyResultContent(resultsElement)) sections.push((resultsElement.textContent || '').trim());
  if (hasStudyResultContent(loadFlowElement, { allowInnerText: true })) {
    sections.push((loadFlowElement.innerText || loadFlowElement.textContent || '').trim());
  }
  return sections.filter(Boolean).join('\n\n').trim();
}

export function createStudyPanelController({
  documentRef,
  navigatorRef,
  elements,
  getSettings,
  updateSettings,
  defaultSettings,
  getStudyResults,
  onOverlayChange,
  showToast
}) {
  const {
    settingsButton,
    settingsForm,
    copyButton,
    loadFlowBase,
    loadFlowIterations,
    loadFlowBalanced,
    shortCircuitMethod,
    results,
    loadFlowResults,
    overlayToggle
  } = elements;

  const applySettingsToForm = () => {
    const settings = getSettings();
    if (loadFlowBase) loadFlowBase.value = String(settings.loadFlow.baseMVA);
    if (loadFlowIterations) loadFlowIterations.value = String(settings.loadFlow.maxIterations);
    if (loadFlowBalanced) loadFlowBalanced.checked = !!settings.loadFlow.balanced;
    if (shortCircuitMethod) shortCircuitMethod.value = settings.shortCircuit.method;
  };

  const updateCopyState = () => {
    if (!copyButton) return;
    copyButton.disabled = !(
      hasStudyResultContent(results)
      || hasStudyResultContent(loadFlowResults, { allowInnerText: true })
    );
  };

  const renderResults = () => {
    if (!results) return;
    const studyResults = getStudyResults();
    results.textContent = Object.keys(studyResults).length ? JSON.stringify(studyResults, null, 2) : 'No results';
    updateCopyState();
  };

  const copyResults = async () => {
    const payload = gatherStudyResultSections(results, loadFlowResults);
    if (!payload) {
      showToast('No study results to copy');
      return false;
    }
    let copied = false;
    if (navigatorRef?.clipboard?.writeText) {
      try {
        await navigatorRef.clipboard.writeText(payload);
        copied = true;
      } catch (error) {
        console.error('Clipboard write failed', error);
      }
    }
    if (!copied) {
      try {
        const textarea = documentRef.createElement('textarea');
        textarea.value = payload;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        documentRef.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        copied = documentRef.execCommand('copy');
        textarea.remove();
      } catch (error) {
        console.error('Fallback copy failed', error);
        copied = false;
      }
    }
    showToast(copied ? 'Study results copied to clipboard' : 'Unable to copy study results');
    return copied;
  };

  const bind = () => {
    if (overlayToggle) {
      onOverlayChange(overlayToggle.checked, { initial: true });
      overlayToggle.addEventListener('change', () => onOverlayChange(overlayToggle.checked, { initial: false }));
    }
    applySettingsToForm();
    if (settingsButton && settingsForm) {
      settingsButton.addEventListener('click', () => {
        const hidden = settingsForm.classList.toggle('hidden');
        settingsButton.setAttribute('aria-expanded', String(!hidden));
        settingsForm.setAttribute('aria-hidden', String(hidden));
        if (!hidden) applySettingsToForm();
      });
    }
    if (settingsForm) {
      settingsForm.addEventListener('submit', event => event.preventDefault());
      if (!settingsForm.hasAttribute('aria-hidden')) settingsForm.setAttribute('aria-hidden', 'true');
    }
    if (copyButton) {
      copyButton.addEventListener('click', () => copyResults());
      updateCopyState();
    }
    loadFlowBase?.addEventListener('change', () => {
      const value = Number(loadFlowBase.value);
      const normalized = Number.isFinite(value) && value > 0 ? value : defaultSettings.loadFlow.baseMVA;
      updateSettings(settings => ({ ...settings, loadFlow: { ...settings.loadFlow, baseMVA: normalized } }));
      loadFlowBase.value = String(normalized);
    });
    loadFlowIterations?.addEventListener('change', () => {
      const value = Number(loadFlowIterations.value);
      const normalized = Number.isFinite(value) && value > 0
        ? Math.min(Math.floor(value), 999)
        : defaultSettings.loadFlow.maxIterations;
      updateSettings(settings => ({ ...settings, loadFlow: { ...settings.loadFlow, maxIterations: normalized } }));
      loadFlowIterations.value = String(normalized);
    });
    loadFlowBalanced?.addEventListener('change', () => {
      updateSettings(settings => ({ ...settings, loadFlow: { ...settings.loadFlow, balanced: loadFlowBalanced.checked } }));
    });
    shortCircuitMethod?.addEventListener('change', () => {
      const method = (shortCircuitMethod.value || '').toUpperCase() === 'ANSI' ? 'ANSI' : 'IEC';
      updateSettings(settings => ({ ...settings, shortCircuit: { ...settings.shortCircuit, method } }));
      shortCircuitMethod.value = method;
    });
  };

  return {
    applySettingsToForm,
    bind,
    copyResults,
    gatherResultsText: () => gatherStudyResultSections(results, loadFlowResults),
    hasLoadFlowResults: () => hasStudyResultContent(loadFlowResults, { allowInnerText: true }),
    hasResults: () => hasStudyResultContent(results),
    renderResults,
    updateCopyState
  };
}
