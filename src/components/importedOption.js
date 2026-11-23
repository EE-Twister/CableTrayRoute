export function ensureImportedOption(select, value) {
  if (!select || select.tagName !== 'SELECT' || value == null || value === '') return;
  const normalized = String(value);
  if ([...select.options].some(option => option.value === normalized)) return;
  const option = document.createElement('option');
  option.value = normalized;
  option.textContent = `${normalized} (imported)`;
  option.dataset.imported = 'true';
  select.appendChild(option);
}
