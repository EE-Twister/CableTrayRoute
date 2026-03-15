/**
 * CDN failure detection helper.
 *
 * Call initCdnFallback() after CDN <script> tags load. If any expected
 * globals are missing the user sees a non-intrusive banner instead of a
 * silent feature failure.
 *
 * Usage in HTML:
 *   <script>
 *     document.addEventListener('DOMContentLoaded', function () {
 *       initCdnFallback([{ global: 'XLSX', label: 'Excel import/export (XLSX)' }]);
 *     });
 *   </script>
 */

window.initCdnFallback = function initCdnFallback(deps) {
  var missing = deps.filter(function (d) {
    return !window[d.global];
  });
  if (!missing.length) return;

  var banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');
  banner.style.cssText = [
    'position:fixed', 'bottom:1rem', 'left:50%',
    'transform:translateX(-50%)',
    'background:#7c3aed', 'color:#fff',
    'padding:0.65rem 1.2rem',
    'border-radius:8px',
    'font:600 0.875rem/1.4 system-ui,sans-serif',
    'z-index:9999',
    'max-width:calc(100vw - 2rem)',
    'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
    'display:flex', 'align-items:center', 'gap:0.75rem',
  ].join(';');

  var labels = missing.map(function (d) { return d.label; }).join(', ');
  var msg = document.createTextNode('Some features may be unavailable: ' + labels + '. Check your network connection.');
  var close = document.createElement('button');
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss');
  close.style.cssText = 'background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;padding:0 0.25rem;line-height:1;';
  close.onclick = function () { banner.remove(); };

  banner.appendChild(msg);
  banner.appendChild(close);
  document.body.appendChild(banner);
};
