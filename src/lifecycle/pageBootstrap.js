/**
 * Shared page initialisation helper.
 *
 * Consolidates the boilerplate that every page entry-point repeats:
 *   - E2E mode detection and `window.E2E` flag
 *   - Resume-modal suppression / force-show for Playwright runs
 *   - Standard DOMContentLoaded gating for page init
 *   - Optional Playwright readiness beacon and ready-event dispatch
 *
 * Usage:
 *   import { bootstrapPage } from './src/lifecycle/pageBootstrap.js';
 *
 *   bootstrapPage({
 *     readyEvent: 'cableschedule-ready',
 *     initFlag: '__CableScheduleInitOK',
 *     onReady: initCableSchedule,
 *   });
 *
 * Options:
 *   onReady              async () => void — main init function to invoke once
 *                        the DOM is ready and the resume modal has been
 *                        handled. Receives `{ E2E }`.
 *   readyEvent           string — name of a window event dispatched after
 *                        `onReady` resolves successfully.
 *   initFlag             string — name of a window property to set to `true`
 *                        after `onReady` resolves successfully.
 *   bodyReadyDataset     string — name to set on `document.body.dataset`
 *                        (e.g. `onelineReady` ➜ `document.body.dataset.onelineReady = '1'`).
 *   openDetailsInE2E     boolean — when true and running under E2E, open
 *                        every `<details>` element so tests can reach nested
 *                        controls.
 *   beacon               {
 *                          id:        string  — element id for the beacon div
 *                          attr:      string  — attribute to set to '1'
 *                          waitFor?:  string  — selector that must be visible
 *                                              before the beacon is set
 *                          timeoutMs?:number  — give up after this long
 *                        }
 */

function detectE2E() {
  if (typeof location === 'undefined') return false;
  try {
    return new URLSearchParams(location.search).has('e2e');
  } catch {
    return false;
  }
}

function suppressResumeIfE2E(_E2E) {
  // Intentionally a no-op: we never clear browser storage from URL-controlled
  // E2E flags. Tests must seed/clear state explicitly via their own setup.
}

function forceShowResumeIfE2E(E2E) {
  if (!E2E || typeof document === 'undefined') return;
  const modal = document.getElementById('resume-modal');
  const noBtn = document.getElementById('resume-no-btn');
  if (modal) {
    modal.removeAttribute('hidden');
    modal.classList.remove('hidden', 'is-hidden', 'invisible');
    modal.style.display = 'block';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
  }
  if (noBtn) {
    noBtn.style.display = 'inline-block';
    noBtn.disabled = false;
  }
}

function ensureReadyBeacon(attrName, id) {
  if (typeof document === 'undefined' || !document.body) return null;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(el);
  }
  if (attrName) el.setAttribute(attrName, '1');
  return el;
}

function setBeaconWhenVisible(selector, attrName, id, timeoutMs = 25000) {
  if (typeof document === 'undefined') return;
  const start = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  const now = () => ((typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now());
  const poll = () => {
    const el = document.querySelector(selector);
    const visible = !!el && !!(el.offsetParent || (typeof el.getClientRects === 'function' && el.getClientRects().length));
    if (visible) { ensureReadyBeacon(attrName, id); return; }
    if (now() - start > timeoutMs) return;
    setTimeout(poll, 50);
  };
  poll();
}

function openAllDetails() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
}

export function bootstrapPage(opts = {}) {
  const {
    onReady,
    readyEvent,
    initFlag,
    bodyReadyDataset,
    openDetailsInE2E = false,
    beacon = null,
  } = opts;

  const E2E = detectE2E();
  if (typeof window !== 'undefined') window.E2E = E2E;

  suppressResumeIfE2E(E2E);

  const run = async () => {
    forceShowResumeIfE2E(E2E);

    let initOk = false;
    try {
      if (typeof onReady === 'function') {
        await onReady({ E2E });
      }
      initOk = true;
    } catch (err) {
      console.error('bootstrapPage: onReady failed', err);
    }

    if (bodyReadyDataset && typeof document !== 'undefined' && document.body) {
      document.body.dataset[bodyReadyDataset] = '1';
    }

    if (openDetailsInE2E && E2E) {
      openAllDetails();
    }

    if (initOk) {
      if (initFlag && typeof window !== 'undefined') {
        window[initFlag] = true;
      }
      if (readyEvent && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(readyEvent));
      }
    }

    if (beacon && beacon.id) {
      const { id, attr, waitFor, timeoutMs } = beacon;
      if (waitFor) {
        setBeaconWhenVisible(waitFor, attr, id, timeoutMs);
      } else {
        ensureReadyBeacon(attr, id);
      }
    }
  };

  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
