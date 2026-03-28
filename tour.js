/**
 * Reusable per-page interactive tour runner.
 *
 * Usage:
 *   import { start, hasDoneTour } from './tour.js';
 *   start(steps, 'myPageKey');       // run tour; marks key done on finish/skip
 *   if (!hasDoneTour('myPageKey')) { start(steps, 'myPageKey'); } // auto-trigger once
 */

/**
 * Returns true if the user has previously completed or skipped the tour for
 * the given key.
 * @param {string} tourKey
 * @returns {boolean}
 */
export function hasDoneTour(tourKey) {
  if (!tourKey) return false;
  try {
    return !!localStorage.getItem('tour_done_' + tourKey);
  } catch {
    return false;
  }
}

/**
 * Starts an interactive overlay tour.
 *
 * @param {Array<{selector: string, message: string}>} steps
 * @param {string|null} tourKey  When provided, sets localStorage on finish/skip
 *                               so hasDoneTour(tourKey) returns true afterward.
 */
export function start(steps, tourKey = null) {
  if (!Array.isArray(steps) || steps.length === 0) return;

  let currentStep = 0;

  // --- overlay ---
  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;';
  overlay.setAttribute('aria-hidden', 'true');

  // --- tooltip ---
  const tooltip = document.createElement('div');
  tooltip.id = 'tour-tooltip';
  tooltip.setAttribute('role', 'dialog');
  tooltip.setAttribute('aria-modal', 'false');
  tooltip.setAttribute('aria-labelledby', 'tour-step-counter');
  tooltip.setAttribute('aria-live', 'polite');
  tooltip.style.cssText = 'position:absolute;background:#fff;padding:0.75em 1em;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.3);max-width:280px;font-size:0.9rem;display:flex;flex-direction:column;gap:0.5em;';

  const stepCounter = document.createElement('span');
  stepCounter.id = 'tour-step-counter';
  stepCounter.style.cssText = 'font-size:0.75rem;color:#6c757d;font-weight:600;';

  const messageEl = document.createElement('p');
  messageEl.id = 'tour-message';
  messageEl.style.margin = '0';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:0.5em;justify-content:flex-end;margin-top:0.25em;';

  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip tour';
  skipBtn.style.cssText = 'font-size:0.8rem;background:none;border:none;cursor:pointer;color:#6c757d;padding:0.2em 0.4em;';

  const nextBtn = document.createElement('button');
  nextBtn.style.cssText = 'font-size:0.85rem;background:#0b3954;color:#fff;border:none;border-radius:3px;padding:0.3em 0.8em;cursor:pointer;';

  btnRow.append(skipBtn, nextBtn);
  tooltip.append(stepCounter, messageEl, btnRow);
  overlay.appendChild(tooltip);

  // --- highlight style ---
  const style = document.createElement('style');
  style.textContent = '.tour-highlight{position:relative;z-index:1001;box-shadow:0 0 0 4px #ffeb3b;border-radius:4px;}';
  document.head.appendChild(style);
  document.body.appendChild(overlay);

  function markDone() {
    if (tourKey) {
      try { localStorage.setItem('tour_done_' + tourKey, '1'); } catch { /* storage unavailable */ }
    }
  }

  function clearHighlight() {
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  }

  function cleanup() {
    clearHighlight();
    overlay.remove();
    style.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function end() {
    markDone();
    cleanup();
  }

  function showStep(index) {
    if (index >= steps.length) {
      end();
      return;
    }
    const step = steps[index];
    const el = document.querySelector(step.selector);

    stepCounter.textContent = `Step ${index + 1} of ${steps.length}`;
    messageEl.textContent = step.message;
    nextBtn.textContent = index === steps.length - 1 ? 'Done' : 'Next';
    nextBtn.setAttribute('aria-label', index === steps.length - 1 ? 'Finish tour' : 'Next step');

    clearHighlight();

    if (el) {
      const rect = el.getBoundingClientRect();
      const tipTop = rect.bottom + window.scrollY + 10;
      const tipLeft = Math.min(rect.left + window.scrollX, window.innerWidth - 300);
      tooltip.style.top = `${tipTop}px`;
      tooltip.style.left = `${Math.max(8, tipLeft)}px`;
      tooltip.style.transform = '';
      el.classList.add('tour-highlight');
    } else {
      tooltip.style.top = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
    }

    nextBtn.focus();
  }

  nextBtn.addEventListener('click', () => {
    currentStep++;
    showStep(currentStep);
  });

  skipBtn.addEventListener('click', () => {
    end();
  });

  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      currentStep++;
      showStep(currentStep);
    }
  });

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      end();
    } else if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      currentStep++;
      showStep(currentStep);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (currentStep > 0) {
        currentStep--;
        showStep(currentStep);
      }
    }
  }

  document.addEventListener('keydown', onKeyDown);

  showStep(0);
}
