export const E2E = new URLSearchParams(location.search).get('e2e') === '1';

export function suppressResumeIfE2E() {
  if (!E2E) return;
  // Never clear browser storage from URL-controlled E2E flags.
  // Let tests control resume behavior via the modal buttons only.
}

// Show resume modal in E2E so tests can click the No button
export function forceShowResumeIfE2E() {
  if (!E2E) return;
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
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', forceShowResumeIfE2E);
}

export function markReady(flagName) {
  if (flagName && typeof document !== 'undefined') {
    document.documentElement.setAttribute(flagName, '1');
  }
}

export function ensureBeacon(id) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;inset:auto auto 0 0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
  }
}
