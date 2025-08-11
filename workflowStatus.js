window.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.workflow-grid .workflow-card');
  cards.forEach(card => {
    const key = card.dataset.storageKey;
    const statusEl = card.querySelector('.status');
    if (!statusEl) return;
    if (key && localStorage.getItem(key)) {
      card.classList.add('complete');
      statusEl.textContent = '✓';
      statusEl.setAttribute('aria-label', 'Completed');
    } else {
      statusEl.textContent = 'Incomplete';
    }
  });
});
