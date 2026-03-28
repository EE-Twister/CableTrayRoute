import { start as startTour, hasDoneTour } from './tour.js';

const OPTIMALROUTE_TOUR_STEPS = [
  { selector: '#fill-limit',            message: 'Set the maximum fill limit (default 40%). The routing engine will not assign cables to trays that exceed this threshold.' },
  { selector: '#field-route-penalty',   message: 'The field routing penalty makes routing in open air more expensive than using trays. A value of 3 means 1 ft of field routing costs as much as 3 ft in a tray.' },
  { selector: '#calculate-route-btn',   message: 'Click to run the 3D Dijkstra algorithm. It finds the shortest path for each cable through your tray network, respecting fill limits and segregation rules.' },
  { selector: '#progress-container',    message: 'Progress is shown here for large networks. You can pause and resume routing without losing results.' },
  { selector: '#main-content',          message: 'Results appear in the 3D visualization. Each cable\'s optimal path is highlighted. Click any cable to see its full route details and tray fill contribution.' }
];

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
  } catch (e) {
    console.warn('Failed to store resume choice in sessionStorage', e);
  }
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

/**
 * When navigated from the Cable Schedule with ?autoRoute=1, automatically
 * trigger the "Calculate Optimal Route" button once the page is ready.
 * The trigger waits for the calculate button to become available and for
 * any resume-session modal to be dismissed (by simulating a "Yes" click).
 */
function autoTriggerRouteIfRequested() {
  const params = new URLSearchParams(location.search);
  if (!params.has('autoRoute')) return;

  // Auto-dismiss the resume modal by clicking "Yes" to load saved data
  const tryResumeYes = () => {
    const yesBtn = document.getElementById('resume-yes-btn');
    if (yesBtn && !yesBtn.disabled && yesBtn.offsetParent !== null) {
      yesBtn.click();
    }
  };

  // Poll until the calculate button is present and enabled, then click it
  const startMs = performance.now();
  const MAX_WAIT_MS = 15000;
  const poll = () => {
    tryResumeYes();
    const btn = document.getElementById('calculate-route-btn');
    if (btn && !btn.disabled) {
      btn.click();
      // Clean up the query param so refreshing doesn't re-trigger
      const url = new URL(location.href);
      url.searchParams.delete('autoRoute');
      history.replaceState(null, '', url.toString());
      return;
    }
    if (performance.now() - startMs < MAX_WAIT_MS) {
      setTimeout(poll, 200);
    }
  };
  setTimeout(poll, 500);
}

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
  autoTriggerRouteIfRequested();

  // --- Tour ---
  const tourBtn = document.getElementById('tour-btn');
  if (tourBtn) {
    tourBtn.addEventListener('click', () => startTour(OPTIMALROUTE_TOUR_STEPS, 'optimalRoute'));
  }
  if (!hasDoneTour('optimalRoute')) {
    startTour(OPTIMALROUTE_TOUR_STEPS, 'optimalRoute');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage, { once: true });
} else {
  initializePage();
}
