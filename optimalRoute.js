const searchParams = new URLSearchParams(globalThis.location?.search || '');
const E2E = typeof globalThis.E2E === 'boolean' ? globalThis.E2E : searchParams.has('e2e');

function e2eOpenDetailsAndControls() {
  if (!E2E) return;
  document.querySelectorAll('details').forEach(detail => {
    detail.open = true;
  });
  ['#settings-panel', '#controls', '#toolbar', '#sidebar'].forEach(selector => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList?.remove('hidden', 'is-hidden', 'invisible');
    el.removeAttribute?.('hidden');
    Object.assign(el.style, {
      display: 'block',
      visibility: 'visible',
      pointerEvents: 'auto',
      opacity: '1'
    });
  });
  const importBtn = document.getElementById('import-project-btn');
  if (importBtn) {
    importBtn.disabled = false;
    importBtn.style.display = 'inline-block';
    importBtn.style.pointerEvents = 'auto';
  }
}

function ensureReadyBeacon(attrName, id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;z-index:2147483647;';
    document.body.appendChild(el);
  }
  el.setAttribute(attrName, '1');
}

function setReadyWhen(selector, attrName, id, timeoutMs = 25000) {
  const start = performance.now();
  const poll = () => {
    const el = document.querySelector(selector);
    const visible = !!el && !!(el.offsetParent || el.getClientRects().length);
    if (visible) {
      ensureReadyBeacon(attrName, id);
      return;
    }
    if (performance.now() - start > timeoutMs) return;
    setTimeout(poll, 50);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', poll, { once: true });
  } else {
    poll();
  }
}

function storeResumeChoice(choice) {
  try {
    sessionStorage.setItem('resume:choice', choice);
  } catch {}
}

let wiredResumeTracking = false;
function wireResumeTracking() {
  if (wiredResumeTracking) return;
  wiredResumeTracking = true;
  const yesBtn = document.getElementById('resume-yes-btn');
  const noBtn = document.getElementById('resume-no-btn');
  if (yesBtn && yesBtn.getAttribute('type') !== 'button') yesBtn.setAttribute('type', 'button');
  if (noBtn && noBtn.getAttribute('type') !== 'button') noBtn.setAttribute('type', 'button');
  if (yesBtn) yesBtn.addEventListener('click', () => storeResumeChoice('yes'));
  if (noBtn) noBtn.addEventListener('click', () => storeResumeChoice('no'));
}

function showResumeModalForE2E() {
  if (!E2E) return;
  try {
    if (sessionStorage.getItem('resume:choice')) return;
  } catch {}
  const modal = document.getElementById('resume-modal');
  if (!modal) return;
  modal.classList.remove('hidden', 'is-hidden', 'invisible');
  modal.removeAttribute('hidden');
  Object.assign(modal.style, {
    display: 'flex',
    visibility: 'visible',
    opacity: '1',
    pointerEvents: 'auto'
  });
}

document.addEventListener('exclusions-found', () => {
  const details = document.getElementById('route-breakdown-details');
  if (details) details.open = true;
});

function initializePage() {
  e2eOpenDetailsAndControls();
  wireResumeTracking();
  showResumeModalForE2E();
  setReadyWhen('#settings-btn', 'data-optimal-ready', 'optimal-ready-beacon');
  if (typeof globalThis.checkPrereqs === 'function') {
    globalThis.checkPrereqs([
      { key: 'cableSchedule', page: 'cableschedule.html', label: 'Cable Schedule' },
      { key: 'traySchedule', page: 'racewayschedule.html', label: 'Raceway Schedule' }
    ]);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage, { once: true });
} else {
  initializePage();
}
