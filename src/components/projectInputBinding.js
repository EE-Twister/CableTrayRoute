const STYLE_ID = 'project-input-binding-styles';

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .project-input-panel{border:1px solid color-mix(in srgb,var(--primary-color,#2563eb) 38%,var(--border-color,#d1d5db));border-left:4px solid var(--primary-color,#2563eb);border-radius:8px;padding:.8rem 1rem;margin:0 0 1rem;background:color-mix(in srgb,var(--primary-color,#2563eb) 6%,var(--surface-color,#fff))}
    .project-input-panel__header{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;flex-wrap:wrap}
    .project-input-panel__title{font-weight:700;margin:0}.project-input-panel__summary{margin:.2rem 0 0;font-size:.875rem;color:var(--muted-text,#596579)}
    .project-input-panel__sources{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.65rem}.project-input-chip{display:inline-flex;align-items:center;gap:.3rem;border:1px solid var(--border-color,#d1d5db);border-radius:999px;padding:.18rem .55rem;font-size:.75rem;background:var(--surface-color,#fff)}
    .project-input-chip::before{content:'✓';font-weight:700;color:#16803c}.project-input-panel--missing{border-left-color:#b45309}.project-input-panel__missing{margin:.55rem 0 0;color:#92400e;font-size:.82rem}
    [data-project-input-state="linked"]{border-left:3px solid #16803c!important;background-image:linear-gradient(90deg,rgba(22,128,60,.06),transparent 35%)}
    [data-project-input-state="override"]{border-left:3px solid #b45309!important;background-image:linear-gradient(90deg,rgba(180,83,9,.07),transparent 35%)}
    .study-stale-banner{border:1px solid #d97706;border-radius:7px;padding:.65rem .8rem;margin:0 0 1rem;background:rgba(245,158,11,.1);color:var(--text-color,#4b2e05)}
  `;
  document.head.appendChild(style);
}

function uniqueSources(bindings = {}) {
  return [...new Set(Object.values(bindings).map(binding => binding?.sourceLabel).filter(Boolean))];
}

export function renderProjectInputPanel({ container, title = 'Using project data', summary = '', bindings = {}, missing = [], onRefresh = null } = {}) {
  if (!container || typeof document === 'undefined') return null;
  ensureStyles();
  const panel = document.createElement('section');
  panel.className = `project-input-panel${missing.length ? ' project-input-panel--missing' : ''}`;
  panel.setAttribute('aria-label', 'Project data sources');
  const header = document.createElement('div');
  header.className = 'project-input-panel__header';
  const copy = document.createElement('div');
  const heading = document.createElement('p');
  heading.className = 'project-input-panel__title';
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.className = 'project-input-panel__summary';
  detail.textContent = summary || 'Linked values update from the current project. Editing a linked field creates a local study override.';
  copy.append(heading, detail);
  header.appendChild(copy);
  if (typeof onRefresh === 'function') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn secondary-btn';
    button.textContent = 'Refresh from project';
    button.addEventListener('click', onRefresh);
    header.appendChild(button);
  }
  panel.appendChild(header);
  const sources = document.createElement('div');
  sources.className = 'project-input-panel__sources';
  uniqueSources(bindings).forEach(label => {
    const chip = document.createElement('span');
    chip.className = 'project-input-chip';
    chip.textContent = label;
    sources.appendChild(chip);
  });
  if (sources.childElementCount) panel.appendChild(sources);
  if (missing.length) {
    const warning = document.createElement('p');
    warning.className = 'project-input-panel__missing';
    warning.textContent = `Missing project data: ${missing.join(' ')}`;
    panel.appendChild(warning);
  }
  container.prepend(panel);
  return panel;
}

export function bindProjectField(element, binding, overrides, fieldName) {
  if (!element || !binding) return;
  element.dataset.projectSource = binding.sourcePath || '';
  element.dataset.projectSourceLabel = binding.sourceLabel || '';
  element.dataset.projectInputState = overrides.has(fieldName) ? 'override' : 'linked';
  if (element.dataset.projectBindingReady === 'true') return;
  element.dataset.projectBindingReady = 'true';
  element.addEventListener('input', event => {
    if (event.currentTarget.dataset.projectApplying === 'true') return;
    overrides.add(fieldName);
    event.currentTarget.dataset.projectInputState = 'override';
    event.currentTarget.title = `Manual override; originally linked to ${binding.sourceLabel || binding.sourcePath}`;
  });
}

export function attachProjectSourceBadge(element, label) {
  if (!element || !label || typeof document === 'undefined' || element.dataset.projectSourceBadge === 'true') return null;
  ensureStyles();
  const badge = document.createElement('span');
  badge.className = 'project-input-chip';
  badge.style.margin = '.25rem 0 .25rem .35rem';
  badge.textContent = label;
  badge.setAttribute('aria-label', `Linked source: ${label}`);
  element.insertAdjacentElement('afterend', badge);
  element.dataset.projectSourceBadge = 'true';
  return badge;
}

export function applyLinkedValue(element, value, overrides, fieldName, binding, { force = false } = {}) {
  if (!element || value === null || value === undefined || value === '') return false;
  bindProjectField(element, binding, overrides, fieldName);
  if (overrides.has(fieldName) && !force) return false;
  if (force) overrides.delete(fieldName);
  element.dataset.projectApplying = 'true';
  element.value = value;
  element.dataset.projectInputState = 'linked';
  element.title = `Linked to ${binding?.sourceLabel || binding?.sourcePath || 'project data'}`;
  delete element.dataset.projectApplying;
  return true;
}

export function renderStudyStaleBanner(container, staleness, onRefresh = null) {
  if (!container || !staleness?.stale || typeof document === 'undefined') return null;
  ensureStyles();
  const banner = document.createElement('div');
  banner.className = 'study-stale-banner';
  banner.setAttribute('role', 'status');
  const fields = staleness.changedFields?.length ? ` Changed: ${staleness.changedFields.join(', ')}.` : '';
  banner.appendChild(document.createTextNode(`Project inputs changed since this result was calculated.${fields}`));
  if (typeof onRefresh === 'function') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn secondary-btn';
    button.style.marginLeft = '.65rem';
    button.textContent = 'Load current inputs';
    button.addEventListener('click', onRefresh);
    banner.appendChild(button);
  }
  container.prepend(banner);
  return banner;
}

export function renderProjectScopeSelector({ container, title = 'Project scope', options = [], selectedValue = '', onSelect } = {}) {
  if (!container || typeof document === 'undefined') return null;
  ensureStyles();
  const panel = document.createElement('section');
  panel.className = `project-input-panel${options.length ? '' : ' project-input-panel--missing'}`;
  panel.setAttribute('aria-label', title);
  const label = document.createElement('label');
  label.className = 'project-input-panel__title';
  label.textContent = title;
  const select = document.createElement('select');
  select.className = 'field-input';
  select.setAttribute('aria-label', title);
  select.style.margin = '.45rem 0 0';
  if (!options.length) {
    const option = document.createElement('option');
    option.textContent = 'No compatible project records';
    option.value = '';
    select.appendChild(option);
    select.disabled = true;
  } else {
    options.forEach(item => {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });
    select.value = options.some(item => item.value === selectedValue) ? selectedValue : options[0].value;
  }
  label.appendChild(select);
  panel.appendChild(label);
  const hint = document.createElement('p');
  hint.className = 'project-input-panel__summary';
  hint.textContent = options.length
    ? 'Select the project record this calculation represents. Linked values remain editable as study overrides.'
    : 'Add a compatible schedule record to enable project-linked inputs.';
  panel.appendChild(hint);
  select.addEventListener('change', () => onSelect?.(select.value, { force: true }));
  container.prepend(panel);
  return { panel, select, value: () => select.value };
}
