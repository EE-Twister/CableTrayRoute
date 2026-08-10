import {
  formatSettingLabel,
  formatSettingValue,
  normalizeSettingOptions,
  resolveSettingType,
  snapSettingValue,
  valuesEqual
} from './settingModel.mjs';

export function renderTccSettings({ container, documentRef, selectedIds = [], deviceMap }) {
  if (!container || !documentRef) return;
  container.innerHTML = '';
  selectedIds.forEach(uid => {
    const entry = deviceMap.get(uid);
    if (!entry || (entry.kind !== 'library' && entry.kind !== 'component')) return;
    const base = entry.baseDevice || {};
    const overrides = entry.overrideSource || {};
    const div = documentRef.createElement('div');
    div.className = 'device-settings';
    div.dataset.uid = uid;
    div.dataset.kind = entry.kind;
    div.dataset.baseId = entry.baseDeviceId;
    if (entry.kind === 'component') div.dataset.componentId = entry.componentId;
    const heading = documentRef.createElement('h3');
    heading.textContent = entry.name;
    div.appendChild(heading);
    Object.keys(base.settings || {}).forEach(field => {
      const defaultValue = base.settings?.[field];
      const overrideValue = overrides[field];
      const label = documentRef.createElement('label');
      label.textContent = `${formatSettingLabel(field)} `;
      const options = Array.isArray(base.settingOptions?.[field]) ? base.settingOptions[field] : null;
      const normalizedOptions = normalizeSettingOptions(options);
      if (normalizedOptions.length) {
        const select = documentRef.createElement('select');
        select.dataset.field = field;
        select.dataset.valueType = resolveSettingType(defaultValue, options);
        select.dataset.defaultValue = defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : '';
        normalizedOptions.forEach(option => {
          const optionElement = documentRef.createElement('option');
          optionElement.value = option.valueStr;
          optionElement.textContent = option.label;
          select.appendChild(optionElement);
        });
        const activeValue = overrideValue !== undefined ? overrideValue : defaultValue;
        if (activeValue !== undefined && activeValue !== null) {
          const snapped = snapSettingValue(base, field, activeValue);
          const match = normalizedOptions.find(option => valuesEqual(option.value, snapped));
          select.value = match?.valueStr ?? normalizedOptions[0]?.valueStr ?? '';
        } else {
          select.value = normalizedOptions[0]?.valueStr ?? '';
        }
        label.appendChild(select);
      } else {
        const input = documentRef.createElement('input');
        input.type = 'number';
        input.dataset.field = field;
        input.dataset.valueType = 'number';
        input.dataset.defaultValue = defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : '';
        if (overrideValue !== undefined && overrideValue !== null && overrideValue !== '') {
          const numeric = Number(overrideValue);
          if (Number.isFinite(numeric)) input.value = formatSettingValue(numeric);
        }
        if (defaultValue !== undefined && defaultValue !== null) {
          input.placeholder = formatSettingValue(defaultValue);
        }
        label.appendChild(input);
      }
      div.appendChild(label);
    });
    container.appendChild(div);
  });
}
