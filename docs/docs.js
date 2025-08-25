document.addEventListener('DOMContentLoaded', () => {
  const last = document.getElementById('last-updated');
  if (last) {
    const date = new Date(document.lastModified);
    last.textContent = date.toLocaleDateString();
  }
  const search = document.getElementById('doc-search');
  if (search) {
    search.addEventListener('input', () => {
      const term = search.value.toLowerCase();
      document.querySelectorAll('#doc-list li').forEach(li => {
        const text = li.textContent.toLowerCase();
        li.style.display = text.includes(term) ? '' : 'none';
      });
    });
  }
});
