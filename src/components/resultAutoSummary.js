import { stackedBarHtml, summarizeStatusColumn } from './resultViz.mjs';

const SELECTOR = 'table.results-table, table.data-table, table.study-results-table';
const REFRESH_DELAY_MS = 300;

function bodyRows(table) {
  return [...table.querySelectorAll('tbody tr')]
    .filter(row => !row.hidden)
    .map(row => [...row.cells].map(cell => cell.textContent));
}

function anchorFor(table) {
  return table.closest('.table-scroll, .table-scroll-container, .table-scroll-wrapper') || table;
}

function enhanceTable(table) {
  if (table.closest('[data-no-auto-summary]') || table.closest('[data-no-print]')) return;
  const section = table.closest('section, .card, main') || document.body;
  const anchor = anchorFor(table);
  const existing = anchor.previousElementSibling?.matches?.('[data-auto-summary]')
    ? anchor.previousElementSibling
    : null;
  // Pages that already render their own chart or stacked bar keep it.
  if (!existing && section.querySelector('.viz-stack:not([data-auto-summary]), .viz-bars')) return;
  const summary = summarizeStatusColumn(bodyRows(table));
  if (!summary) {
    existing?.remove();
    return;
  }
  const html = stackedBarHtml([
    { label: 'Pass', count: summary.pass, status: 'pass' },
    { label: 'Review', count: summary.warn, status: 'warn' },
    { label: 'Fail', count: summary.fail, status: 'fail' },
  ], { ariaLabel: 'Results by status' });
  if (!html) return;
  const host = existing || document.createElement('div');
  host.setAttribute('data-auto-summary', '');
  host.innerHTML = html;
  if (!existing) anchor.parentNode.insertBefore(host, anchor);
}

/**
 * Adds a pass / review / fail summary bar above any results table that has a
 * status column. Study pages with bespoke charts are left alone.
 */
export function mountResultAutoSummary(root = document) {
  if (typeof MutationObserver === 'undefined' || !root?.body) return;
  let timer = null;
  const refresh = () => root.querySelectorAll(SELECTOR).forEach(enhanceTable);
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, REFRESH_DELAY_MS);
  };
  const touchesResultTable = mutation => {
    const target = mutation.target;
    if (target?.closest?.(SELECTOR)) return true;
    return [...mutation.addedNodes].some(node => node.nodeType === 1
      && !(typeof SVGElement !== 'undefined' && node instanceof SVGElement)
      && !node.hasAttribute('data-auto-summary')
      && (node.matches(SELECTOR) || node.querySelector(SELECTOR)));
  };
  const observer = new MutationObserver(mutations => {
    if (mutations.some(touchesResultTable)) schedule();
  });
  observer.observe(root.body, { childList: true, subtree: true });
  schedule();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountResultAutoSummary());
  else mountResultAutoSummary();
}
