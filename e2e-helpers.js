export const E2E = new URLSearchParams(location.search).get('e2e') === '1';

export function suppressResumeIfE2E() {
  if (!E2E) return;
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {}
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('resume-yes-btn')?.click();
    document.getElementById('resume-no-btn')?.click();
  });
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
