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
