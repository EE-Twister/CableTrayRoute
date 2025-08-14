window.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.workflow-grid .workflow-card');
  cards.forEach(card => {
    const key = card.dataset.storageKey;
    const statusEl = card.querySelector('.status');
    if (!statusEl) return;

    let complete = false;
    if (key === 'racewaySchedule') {
      // Raceway data is spread across multiple storage keys; mark complete
      // when any of the related tables has saved data.
      complete = ['ductbankSchedule', 'traySchedule', 'conduitSchedule']
        .some(k => localStorage.getItem(k));
    } else if (key === 'optimalRoute') {
      // Optimal routing relies on both cable and tray schedules.
      complete = ['cableSchedule', 'traySchedule']
        .every(k => localStorage.getItem(k));
    } else if (key) {
      complete = !!localStorage.getItem(key);
    }

    if (complete) {
      card.classList.add('complete');
      statusEl.textContent = '✓';
      statusEl.setAttribute('aria-label', 'Completed');
    } else {
      statusEl.textContent = 'Incomplete';
    }
  });
});
