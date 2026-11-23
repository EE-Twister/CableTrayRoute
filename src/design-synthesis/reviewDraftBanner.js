const initializedDocuments = new WeakSet();

/** Keep the project-level review status visible when navigating between pages. */
export function initReviewDraftBanner({ readDraft, subscribe }) {
  if (typeof document === 'undefined' || typeof readDraft !== 'function') return;
  if (initializedDocuments.has(document)) return;
  initializedDocuments.add(document);
  const render = () => {
    let banner = document.getElementById('design-synthesis-review-draft-banner');
    let draft;
    try { draft = readDraft(); } catch { draft = false; }
    if (draft === null || draft === undefined) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'design-synthesis-review-draft-banner';
      banner.setAttribute('role', 'status');
      banner.style.cssText = 'padding:0.75rem 1rem;background:#fff2c2;color:#3b2800;border-bottom:2px solid #805500;font-weight:700;text-align:center;';
      const nav = document.querySelector('.top-nav');
      if (nav?.parentNode) nav.parentNode.insertBefore(banner, nav.nextSibling);
      else document.body.prepend(banner);
    }
    banner.textContent = 'PRELIMINARY REVIEW PROJECT — NOT FOR ISSUE. Motor protection, fault duty and installation remain unresolved. Some standalone exports may not carry this notice.';
  };
  render();
  if (typeof subscribe === 'function') subscribe(render);
}
