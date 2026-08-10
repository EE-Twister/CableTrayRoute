import { assessProtectiveDeviceLibraryEntry } from '../protectiveDeviceLibrary.mjs';
import { showAlertModal } from '../../src/components/modal.js';
import {
  describeEntryAttributes,
  getManufacturerLabel
} from './catalogPresentationModel.mjs';
import {
  formatOptionLabel,
  formatSettingValue,
  normalizeSettingOptions,
  resolveSettingType,
  snapSettingValue,
  valuesEqual
} from './settingModel.mjs';

export function renderDeviceDetailsView(entry, container, doc, options = {}) {
  if (!container) return;
  const docRef = doc || container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!docRef) return;
  container.innerHTML = '';
  const {
    allowAssignment = false,
    onAssign = null,
    assignmentBusy = false,
    onReview = null,
    getAssignmentOptions = () => [],
    onOverrideControlChange = () => {}
  } = options;
  if (!entry) {
    const empty = docRef.createElement('p');
    empty.className = 'device-detail-empty';
    empty.textContent = 'Select a device to view its properties.';
    container.appendChild(empty);
    return;
  }
  const title = docRef.createElement('h3');
  title.className = 'device-detail-title';
  title.textContent = entry.name;
  container.appendChild(title);

  const meta = docRef.createElement('dl');
  meta.className = 'device-detail-meta';
  const appendMeta = (term, value) => {
    if (!value) return;
    const dt = docRef.createElement('dt');
    dt.textContent = term;
    const dd = docRef.createElement('dd');
    dd.textContent = value;
    meta.append(dt, dd);
  };

  appendMeta('Manufacturer', getManufacturerLabel(entry));
  if (entry.kind === 'library') {
    appendMeta('Source', 'Library Device');
  } else if (entry.kind === 'component') {
    appendMeta('Source', 'One-Line Device');
    if (entry.sheetName) appendMeta('Sheet', entry.sheetName);
    if (entry.componentId) appendMeta('Component ID', entry.componentId);
    const assigned = entry.baseDevice?.name || entry.baseDeviceId || entry.component?.tccId;
    appendMeta('Assigned TCC Device', assigned || 'Not Assigned');
    appendMeta('Plot Status', entry.plotDisabledReason ? 'Unavailable' : 'Ready to Plot');
  } else {
    appendMeta('Source', 'System Curve');
  }

  const base = entry.baseDevice || {};
  const libraryAssessment = (entry.kind === 'library' || entry.kind === 'component')
    ? (entry.libraryAssessment || assessProtectiveDeviceLibraryEntry(base))
    : null;
  if (libraryAssessment) {
    appendMeta('Library Status', libraryAssessment.label);
  }
  if (base.catalogNumber || base.tripUnitModel) {
    appendMeta('Catalog / trip unit', base.catalogNumber || base.tripUnitModel);
  }
  if (base.curveEvidence?.document) {
    const revision = base.curveEvidence.revision || base.curveEvidence.date;
    const location = base.curveEvidence.curveNumber || base.curveEvidence.page;
    appendMeta('Curve Evidence', [base.curveEvidence.document, revision, location].filter(Boolean).join(' · '));
  }
  if (base.curveEvidence?.reviewer) {
    appendMeta('Evidence Reviewer', base.curveEvidence.reviewer);
  }
  const typeLabel = entry.deviceType || base.type;
  if (typeLabel) appendMeta('Type', formatOptionLabel(typeLabel));
  if (base.interruptRating !== undefined) {
    appendMeta('Interrupt Rating', `${formatSettingValue(base.interruptRating)} kA`);
  }
  if (entry.kind === 'inrush' || entry.kind === 'transformerDamage' || entry.kind === 'motorStart' || entry.kind === 'motorThermal') {
    appendMeta('Component', entry.sourceLabel || entry.sourceId || 'Associated Component');
  } else if (entry.kind === 'cable') {
    appendMeta('From', entry.sourceLabel || 'Source');
    appendMeta('To', entry.targetLabel || 'Destination');
  }
  if (entry.autoSelect) {
    appendMeta('Auto Selection', 'Added automatically when analyzing the linked component.');
  }

  if (meta.childElementCount) {
    container.appendChild(meta);
  }

  if (entry.kind === 'component' && entry.plotDisabledReason) {
    const warning = docRef.createElement('p');
    warning.className = 'device-detail-warning';
    warning.textContent = entry.plotDisabledReason;
    container.appendChild(warning);
  }

  if (libraryAssessment && libraryAssessment.status !== 'calculation_ready') {
    const notice = docRef.createElement('p');
    notice.className = libraryAssessment.status === 'screening'
      ? 'device-detail-warning'
      : 'device-detail-notice';
    notice.textContent = libraryAssessment.summary;
    container.appendChild(notice);
  }

  if (entry.kind === 'library' && typeof onReview === 'function') {
    const reviewSection = docRef.createElement('section');
    reviewSection.className = 'protective-device-review-launch';
    const reviewHeading = docRef.createElement('h4');
    reviewHeading.textContent = 'Engineering Review';
    const reviewHint = docRef.createElement('p');
    reviewHint.className = 'protective-device-review-launch-hint';
    reviewHint.textContent = 'Compare the manufacturer source curve with the stored library curve and record spot checks without editing code.';
    const reviewButton = docRef.createElement('button');
    reviewButton.type = 'button';
    reviewButton.className = 'btn primary-btn';
    reviewButton.textContent = 'Open Curve Review';
    reviewButton.addEventListener('click', async () => {
      reviewButton.disabled = true;
      reviewButton.textContent = 'Opening review…';
      try {
        await onReview(entry);
      } catch (error) {
        console.error('Failed to open protective-device review', error);
        reviewButton.disabled = false;
        reviewButton.textContent = 'Open Curve Review';
        showAlertModal('Review Error', 'The protective-device review workspace could not be opened.');
      }
    });
    reviewSection.append(reviewHeading, reviewHint, reviewButton);
    container.appendChild(reviewSection);
  }

  const properties = describeEntryAttributes(entry);
  if (properties.length) {
    const table = docRef.createElement('table');
    table.className = 'device-property-table';
    const thead = docRef.createElement('thead');
    const headerRow = docRef.createElement('tr');
    ['Property', 'Default', 'Range / Options'].forEach(text => {
      const th = docRef.createElement('th');
      th.scope = 'col';
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = docRef.createElement('tbody');
    properties.forEach(prop => {
      const row = docRef.createElement('tr');
      const nameCell = docRef.createElement('th');
      nameCell.scope = 'row';
      nameCell.textContent = prop.label;
      row.appendChild(nameCell);
      const valueCell = docRef.createElement('td');
      valueCell.textContent = prop.value || '—';
      row.appendChild(valueCell);
      const rangeCell = docRef.createElement('td');
      rangeCell.textContent = prop.range || '—';
      row.appendChild(rangeCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  } else {
    const emptyProps = docRef.createElement('p');
    emptyProps.className = 'device-detail-empty';
    emptyProps.textContent = 'No adjustable properties available.';
    container.appendChild(emptyProps);
  }

  if (entry.kind === 'library' || entry.kind === 'component') {
    const base = entry.baseDevice || {};
    const settingKeys = Object.keys(base.settings || {});
    if (settingKeys.length) {
      const settingsWrapper = docRef.createElement('div');
      settingsWrapper.className = 'device-detail-settings';
      const heading = docRef.createElement('h4');
      heading.textContent = 'Adjust Settings';
      settingsWrapper.appendChild(heading);
      settingKeys.forEach(field => {
        const label = docRef.createElement('div');
        label.className = 'device-setting-control';
        const title = docRef.createElement('span');
        title.textContent = formatSettingLabel(field);
        label.appendChild(title);
        const options = Array.isArray(base.settingOptions?.[field]) ? base.settingOptions[field] : null;
        const normalizedOptions = normalizeSettingOptions(options);
        const defaultValue = base.settings?.[field];
        const overrideValue = entry.overrideSource?.[field];
        if (normalizedOptions.length) {
          const select = docRef.createElement('select');
          select.dataset.field = field;
          select.dataset.valueType = resolveSettingType(defaultValue, options);
          select.dataset.defaultValue = defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : '';
          normalizedOptions.forEach(opt => {
            const optEl = docRef.createElement('option');
            optEl.value = opt.valueStr;
            optEl.textContent = opt.label;
            select.appendChild(optEl);
          });
          const activeValue = overrideValue !== undefined ? overrideValue : defaultValue;
          const snapped = snapSettingValue(base, field, activeValue);
          const match = normalizedOptions.find(opt => valuesEqual(opt.value, snapped) || opt.valueStr === String(snapped ?? ''));
          if (match) {
            select.value = match.valueStr;
          }
          select.addEventListener('change', () => {
            onOverrideControlChange(entry, select);
          });
          label.appendChild(select);
        } else {
          const valueType = resolveSettingType(defaultValue, options);
          const input = docRef.createElement('input');
          input.type = valueType === 'string' ? 'text' : 'number';
          input.dataset.field = field;
          input.dataset.valueType = valueType;
          input.dataset.defaultValue = defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : '';
          const sanitizedOverride = snapSettingValue(base, field, overrideValue);
          if (sanitizedOverride !== undefined && sanitizedOverride !== null && sanitizedOverride !== '') {
            input.value = valueType === 'string'
              ? String(sanitizedOverride)
              : formatSettingValue(Number(sanitizedOverride));
          }
          if (defaultValue !== undefined && defaultValue !== null) {
            input.placeholder = valueType === 'string'
              ? String(defaultValue)
              : formatSettingValue(Number(defaultValue));
          }
          input.addEventListener('change', () => {
            onOverrideControlChange(entry, input);
          });
          label.appendChild(input);
        }
        settingsWrapper.appendChild(label);
      });
      container.appendChild(settingsWrapper);
    }
  }

  if (
    allowAssignment
    && entry.kind === 'component'
    && entry.component
    && entry.componentId
    && typeof onAssign === 'function'
  ) {
    const assignmentSection = docRef.createElement('div');
    assignmentSection.className = 'component-assignment';
    const heading = docRef.createElement('h4');
    heading.textContent = 'Assign TCC Device';
    assignmentSection.appendChild(heading);

    const helperText = docRef.createElement('p');
    helperText.className = 'component-assignment-hint';
    helperText.textContent = 'Choose a protective device from the library to associate with this component.';
    assignmentSection.appendChild(helperText);

    const controls = docRef.createElement('div');
    controls.className = 'component-assignment-controls';

    const select = docRef.createElement('select');
    select.className = 'component-assignment-select';
    select.disabled = assignmentBusy;

    const currentDeviceId = entry.baseDeviceId
      || entry.component?.tccId
      || '';

    const addPlaceholder = () => {
      const placeholder = docRef.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select a device…';
      placeholder.disabled = true;
      placeholder.selected = !currentDeviceId;
      select.appendChild(placeholder);
    };

    const optionGroups = getAssignmentOptions(entry.component);
    if (!optionGroups.length) {
      addPlaceholder();
    } else {
      let hasMatch = false;
      optionGroups.forEach(group => {
        const groupEl = docRef.createElement('optgroup');
        if (group.label) groupEl.label = group.label;
        group.options.forEach(option => {
          const opt = docRef.createElement('option');
          opt.value = option.id;
          opt.textContent = option.label;
          if (option.id === currentDeviceId) {
            opt.selected = true;
            hasMatch = true;
          }
          groupEl.appendChild(opt);
        });
        select.appendChild(groupEl);
      });
      if (!hasMatch) {
        addPlaceholder();
      }
    }

    const buttonBar = docRef.createElement('div');
    buttonBar.className = 'component-assignment-buttons';

    const assignBtn = docRef.createElement('button');
    assignBtn.type = 'button';
    assignBtn.className = 'btn primary-btn';
    assignBtn.textContent = 'Assign Device';
    assignBtn.disabled = assignmentBusy || !select.value || select.value === currentDeviceId;

    const clearBtn = docRef.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn secondary-btn';
    clearBtn.textContent = 'Clear Assignment';
    const hasAssignment = !!currentDeviceId;
    clearBtn.disabled = assignmentBusy || !hasAssignment;

    const statusEl = docRef.createElement('p');
    statusEl.className = 'component-assignment-status';

    const setStatus = (message, variant = '') => {
      statusEl.textContent = message || '';
      if (!message) {
        statusEl.classList.remove('is-error', 'is-success', 'is-pending');
      } else {
        statusEl.classList.remove('is-error', 'is-success', 'is-pending');
        if (variant) statusEl.classList.add(`is-${variant}`);
      }
    };

    const handleResult = success => {
      select.disabled = false;
      assignBtn.disabled = !select.value || select.value === currentDeviceId;
      clearBtn.disabled = !select.value && !currentDeviceId;
      if (success) {
        setStatus('Assignment updated.', 'success');
      } else {
        setStatus('Assignment could not be updated.', 'error');
      }
    };

    select.addEventListener('change', () => {
      assignBtn.disabled = assignmentBusy || !select.value || select.value === currentDeviceId;
      setStatus('');
    });

    assignBtn.addEventListener('click', async () => {
      if (assignmentBusy || !select.value || select.value === currentDeviceId) return;
      if (typeof onAssign !== 'function') return;
      select.disabled = true;
      assignBtn.disabled = true;
      clearBtn.disabled = true;
      setStatus('Assigning device…', 'pending');
      try {
        const result = await onAssign({
          componentId: entry.componentId,
          deviceId: select.value,
          overrides: entry.overrideSource || {},
          entry
        });
        handleResult(!!result);
      } catch (err) {
        console.error('Failed to assign TCC device', err);
        showAlertModal('Assignment Error', 'The device could not be assigned. Please try again.');
        handleResult(false);
      }
    });

    clearBtn.addEventListener('click', async () => {
      if (assignmentBusy || !hasAssignment) return;
      if (typeof onAssign !== 'function') return;
      select.disabled = true;
      assignBtn.disabled = true;
      clearBtn.disabled = true;
      setStatus('Removing assignment…', 'pending');
      try {
        const result = await onAssign({
          componentId: entry.componentId,
          deviceId: null,
          overrides: {},
          entry
        });
        handleResult(!!result);
      } catch (err) {
        console.error('Failed to clear TCC assignment', err);
        showAlertModal('Assignment Error', 'The device assignment could not be cleared. Please try again.');
        handleResult(false);
      }
    });

    buttonBar.append(assignBtn, clearBtn);
    controls.append(select, buttonBar);
    assignmentSection.append(controls, statusEl);
    container.appendChild(assignmentSection);
  }
}

