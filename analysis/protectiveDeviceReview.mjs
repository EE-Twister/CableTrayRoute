import { openModal } from '../src/components/modal.js';
import { interpolateTime } from './tccAutoCoord.mjs';
import { assessProtectiveDeviceLibraryEntry } from './protectiveDeviceLibrary.mjs';
import {
  getProtectiveDeviceProductionMissing,
  validateProtectiveDeviceRecord
} from './protectiveDeviceValidation.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_TIME = 1e-4;
const DEFAULT_AXES = Object.freeze({ currentMin: 10, currentMax: 100000, timeMin: 0.001, timeMax: 100 });

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function sanitizePoint(point) {
  const current = numeric(point?.current);
  const time = numeric(point?.time);
  if (!(current > 0) || !(time > 0)) return null;
  return { current, time: Math.max(time, MIN_TIME) };
}

export function normalizeReviewCurve(points) {
  return (Array.isArray(points) ? points : [])
    .map(sanitizePoint)
    .filter(Boolean)
    .sort((a, b) => a.current - b.current);
}

function primaryCurve(device) {
  if (Array.isArray(device?.curve) && device.curve.length) {
    return normalizeReviewCurve(device.curve);
  }
  const profile = Array.isArray(device?.curveProfiles)
    ? device.curveProfiles.find(item => Array.isArray(item?.curve) && item.curve.length)
    : null;
  return normalizeReviewCurve(profile?.curve || []);
}

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function defaultSourceDocument(device) {
  const sources = Array.isArray(device?.sourceDocuments) ? device.sourceDocuments : [];
  return sources.find(source => source?.purposes?.includes('curve_data')) || sources[0] || null;
}

function normalizeReview(raw = {}, device = {}) {
  const evidence = {
    ...(device.curveEvidence && typeof device.curveEvidence === 'object' ? device.curveEvidence : {}),
    ...(raw.curveEvidence && typeof raw.curveEvidence === 'object' ? raw.curveEvidence : {})
  };
  const review = raw.review && typeof raw.review === 'object' ? raw.review : {};
  const libraryCurve = normalizeReviewCurve(raw.libraryCurve || primaryCurve(device));
  const sourceCurve = normalizeReviewCurve(raw.sourceCurve);
  const spotChecks = Array.isArray(raw.curveValidation?.spotChecks)
    ? clone(raw.curveValidation.spotChecks)
    : [];
  return {
    deviceId: cleanText(raw.deviceId) || cleanText(device.id),
    profileId: cleanText(raw.profileId),
    libraryCurve,
    sourceCurve,
    curveEvidence: evidence,
    curveValidation: {
      spotChecks,
      notes: cleanText(raw.curveValidation?.notes)
    },
    review: {
      reviewer: cleanText(review.reviewer || raw.reviewer),
      reviewedOn: cleanText(review.reviewedOn || raw.reviewedOn),
      notes: cleanText(review.notes || raw.notes)
    },
    lastVerified: cleanText(raw.lastVerified),
    libraryStatus: cleanText(raw.libraryStatus),
    researchStatus: cleanText(raw.researchStatus),
    reviewStatus: cleanText(raw.reviewStatus) || 'in_review'
  };
}

export function mergeProtectiveDeviceReview(device, rawReview) {
  if (!device || typeof device !== 'object') return device;
  if (!rawReview || typeof rawReview !== 'object') return device;
  const review = normalizeReview(rawReview, device);
  const merged = { ...device };
  if (review.libraryCurve.length) {
    merged.curve = clone(review.libraryCurve);
  }
  if (Object.keys(review.curveEvidence).length) {
    merged.curveEvidence = { ...(device.curveEvidence || {}), ...clone(review.curveEvidence) };
  }
  if (review.curveValidation.spotChecks.length || review.curveValidation.notes) {
    merged.curveValidation = clone(review.curveValidation);
  }
  if (review.review.reviewer || review.review.reviewedOn || review.review.notes) {
    merged.review = clone(review.review);
  }
  if (review.lastVerified) merged.lastVerified = review.lastVerified;
  if (['screening', 'source_verified', 'calculation_ready'].includes(review.libraryStatus)) {
    merged.libraryStatus = review.libraryStatus;
  }
  if (['candidate', 'reviewed'].includes(review.researchStatus)) {
    merged.researchStatus = review.researchStatus;
  }
  return merged;
}

function createElement(doc, tag, className, text = '') {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function appendField(doc, parent, labelText, input, className = '') {
  const label = createElement(doc, 'label', `protective-review-field ${className}`.trim());
  label.append(createElement(doc, 'span', 'protective-review-label', labelText), input);
  parent.appendChild(label);
  return label;
}

function inputControl(doc, type, value = '', className = 'protective-review-input') {
  const input = doc.createElement('input');
  input.type = type;
  input.className = className;
  input.value = value;
  if (type === 'number') {
    input.min = '0';
    input.step = 'any';
  }
  return input;
}

function makeSvgElement(doc, tag, attributes = {}) {
  const element = doc.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function logScale(value, min, max) {
  const logMin = Math.log(Math.max(min, MIN_TIME));
  const logMax = Math.log(Math.max(max, min * 1.01));
  return (Math.log(Math.max(value, MIN_TIME)) - logMin) / (logMax - logMin || 1);
}

function renderReviewChart(svg, libraryCurve, sourceCurve) {
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const allPoints = [...libraryCurve, ...sourceCurve];
  const currentMin = allPoints.length
    ? Math.max(MIN_TIME, Math.min(...allPoints.map(point => point.current)) / 1.5)
    : DEFAULT_AXES.currentMin;
  const currentMax = allPoints.length
    ? Math.max(currentMin * 10, Math.max(...allPoints.map(point => point.current)) * 1.5)
    : DEFAULT_AXES.currentMax;
  const timeMin = allPoints.length
    ? Math.max(MIN_TIME, Math.min(...allPoints.map(point => point.time)) / 3)
    : DEFAULT_AXES.timeMin;
  const timeMax = allPoints.length
    ? Math.max(timeMin * 10, Math.max(...allPoints.map(point => point.time)) * 3)
    : DEFAULT_AXES.timeMax;
  const plot = { left: 70, top: 24, width: 560, height: 286 };
  const toX = current => plot.left + logScale(current, currentMin, currentMax) * plot.width;
  const toY = time => plot.top + (1 - logScale(time, timeMin, timeMax)) * plot.height;
  const addText = (x, y, text, attributes = {}) => {
    const label = makeSvgElement(svg.ownerDocument, 'text', { x, y, ...attributes });
    label.textContent = text;
    svg.appendChild(label);
  };

  for (let index = 0; index <= 5; index += 1) {
    const x = plot.left + (plot.width * index) / 5;
    const y = plot.top + (plot.height * index) / 5;
    svg.appendChild(makeSvgElement(svg.ownerDocument, 'line', { class: 'protective-review-grid-line', x1: x, y1: plot.top, x2: x, y2: plot.top + plot.height }));
    svg.appendChild(makeSvgElement(svg.ownerDocument, 'line', { class: 'protective-review-grid-line', x1: plot.left, y1: y, x2: plot.left + plot.width, y2: y }));
  }
  svg.appendChild(makeSvgElement(svg.ownerDocument, 'line', { class: 'protective-review-axis', x1: plot.left, y1: plot.top + plot.height, x2: plot.left + plot.width, y2: plot.top + plot.height }));
  svg.appendChild(makeSvgElement(svg.ownerDocument, 'line', { class: 'protective-review-axis', x1: plot.left, y1: plot.top, x2: plot.left, y2: plot.top + plot.height }));
  addText(plot.left + plot.width / 2, 350, 'Current (A)', { class: 'protective-review-axis-label', 'text-anchor': 'middle' });
  addText(17, plot.top + plot.height / 2, 'Time (s)', { class: 'protective-review-axis-label', transform: `rotate(-90 17 ${plot.top + plot.height / 2})`, 'text-anchor': 'middle' });
  addText(plot.left + plot.width, 18, 'log-log comparison', { class: 'protective-review-chart-note', 'text-anchor': 'end' });

  const pathFor = points => points
    .map((point, index) => `${index ? 'L' : 'M'} ${toX(point.current).toFixed(2)} ${toY(point.time).toFixed(2)}`)
    .join(' ');
  if (sourceCurve.length >= 2) {
    svg.appendChild(makeSvgElement(svg.ownerDocument, 'path', { class: 'protective-review-source-line', d: pathFor(sourceCurve) }));
  }
  if (libraryCurve.length >= 2) {
    svg.appendChild(makeSvgElement(svg.ownerDocument, 'path', { class: 'protective-review-library-line', d: pathFor(libraryCurve) }));
  }
  sourceCurve.forEach((point, index) => {
    svg.appendChild(makeSvgElement(svg.ownerDocument, 'circle', { class: 'protective-review-source-point', cx: toX(point.current), cy: toY(point.time), r: 4 }));
    if (index < 3) {
      const label = makeSvgElement(svg.ownerDocument, 'text', { class: 'protective-review-spot-label', x: toX(point.current), y: toY(point.time) - 10, 'text-anchor': 'middle' });
      label.textContent = String(index + 1);
      svg.appendChild(label);
    }
  });
  libraryCurve.forEach(point => {
    svg.appendChild(makeSvgElement(svg.ownerDocument, 'circle', { class: 'protective-review-library-point', cx: toX(point.current), cy: toY(point.time), r: 3.5 }));
  });
  for (let index = 0; index <= 5; index += 1) {
    const current = Math.exp(Math.log(currentMin) + ((Math.log(currentMax) - Math.log(currentMin)) * index) / 5);
    const time = Math.exp(Math.log(timeMax) - ((Math.log(timeMax) - Math.log(timeMin)) * index) / 5);
    addText(toX(current), plot.top + plot.height + 17, current >= 1000 ? `${(current / 1000).toFixed(1)}k` : current.toFixed(0), { class: 'protective-review-tick', 'text-anchor': 'middle' });
    addText(plot.left - 8, toY(time) + 3, time >= 1 ? time.toFixed(1) : time.toPrecision(1), { class: 'protective-review-tick', 'text-anchor': 'end' });
  }
}

function createPointTable(doc, title, points, { editable, onChange, onRemove, emptyText, comparisonCurve = null }) {
  const section = createElement(doc, 'section', 'protective-review-point-section');
  const heading = createElement(doc, 'div', 'protective-review-section-heading');
  heading.append(createElement(doc, 'h3', 'protective-review-section-title', title));
  section.appendChild(heading);
  const table = createElement(doc, 'table', 'protective-review-points-table');
  const head = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  const headers = comparisonCurve
    ? ['Current (A)', 'Source time (s)', 'Stored time (s)', 'Relative error', 'Action']
    : ['Current (A)', 'Time (s)', editable ? 'Action' : 'Stored checks'];
  headers.forEach(text => {
    const cell = createElement(doc, 'th', '', text);
    cell.scope = 'col';
    headRow.appendChild(cell);
  });
  head.appendChild(headRow);
  table.appendChild(head);
  const body = doc.createElement('tbody');
  if (!points.length) {
    const row = doc.createElement('tr');
    const cell = createElement(doc, 'td', 'protective-review-empty-cell', emptyText);
    cell.colSpan = comparisonCurve ? 5 : 3;
    row.appendChild(cell);
    body.appendChild(row);
  }
  points.forEach((point, index) => {
    const row = doc.createElement('tr');
    if (editable) {
      const currentInput = inputControl(doc, 'number', point.current);
      const timeInput = inputControl(doc, 'number', point.time);
      currentInput.setAttribute('aria-label', `${title} current point ${index + 1}`);
      timeInput.setAttribute('aria-label', `${title} time point ${index + 1}`);
      currentInput.addEventListener('change', () => onChange(index, 'current', currentInput.value));
      timeInput.addEventListener('change', () => onChange(index, 'time', timeInput.value));
      const currentCell = doc.createElement('td');
      const timeCell = doc.createElement('td');
      currentCell.appendChild(currentInput);
      timeCell.appendChild(timeInput);
      row.append(currentCell, timeCell);
      if (comparisonCurve) {
        const storedTime = interpolateTime(normalizeReviewCurve(comparisonCurve), Number(point.current));
        const relativeError = Number(point.time) > 0 ? (storedTime - Number(point.time)) / Number(point.time) : null;
        row.append(
          createElement(doc, 'td', '', Number.isFinite(storedTime) ? storedTime.toPrecision(4) : '—'),
          createElement(doc, 'td', '', Number.isFinite(relativeError) ? `${relativeError >= 0 ? '+' : ''}${(relativeError * 100).toFixed(2)}%` : '—')
        );
      }
      const actionCell = doc.createElement('td');
      const removeButton = createElement(doc, 'button', 'protective-review-icon-button', 'Remove');
      removeButton.type = 'button';
      removeButton.addEventListener('click', () => onRemove(index));
      actionCell.appendChild(removeButton);
      row.appendChild(actionCell);
    } else {
      row.append(
        createElement(doc, 'td', '', point.current.toLocaleString()),
        createElement(doc, 'td', '', point.time < 1 ? point.time.toPrecision(3) : point.time.toFixed(3)),
        createElement(doc, 'td', 'protective-review-readonly', 'Stored library data')
      );
    }
    body.appendChild(row);
  });
  table.appendChild(body);
  section.appendChild(table);
  return section;
}

function spotChecksFor(sourceCurve, libraryCurve, sourceId, profileId = null) {
  return sourceCurve.map(point => {
    const actualTime = interpolateTime(libraryCurve, point.current);
    const relativeError = actualTime > 0 ? (actualTime - point.time) / point.time : null;
    return {
      profileId,
      current: point.current,
      expectedTime: point.time,
      actualTime,
      relativeError: Number.isFinite(relativeError) ? Math.abs(relativeError) : null,
      sourceId: sourceId || null
    };
  });
}

function buildCandidate(device, draft, promote) {
  const candidate = mergeProtectiveDeviceReview(device, {
    ...draft,
    libraryStatus: promote ? 'calculation_ready' : device.libraryStatus,
    researchStatus: promote ? 'reviewed' : device.researchStatus
  });
  return candidate;
}

export async function openProtectiveDeviceReview(device, { review = null, onSave = null } = {}) {
  if (!device || typeof device !== 'object') return null;
  const initial = normalizeReview(review || {}, device);
  let promoteInput = null;
  let statusEl = null;
  let readDraft = null;
  let result = null;

  await openModal({
    title: `Curve Review — ${device.name || device.id}`,
    description: 'Compare the stored library curve with manufacturer source points, document the evidence, and complete the engineering review without editing JSON.',
    primaryText: 'Save Review',
    secondaryText: 'Cancel',
    closeOnBackdrop: false,
    resizable: true,
    defaultWidth: 1180,
    onSubmit(controller) {
      const promote = promoteInput?.checked === true;
      const draft = readDraft();
      const candidate = buildCandidate(device, draft, promote);
      const validation = validateProtectiveDeviceRecord(candidate, { mode: 'promotion' });
      if (promote && !validation.valid) {
        statusEl.textContent = `Promotion is blocked: ${validation.errors.map(item => item.message.replace(/^Calculation-ready record is missing /, '')).slice(0, 4).join('; ')}.`;
        statusEl.className = 'protective-review-status is-error';
        return false;
      }
      if (typeof onSave === 'function') {
        const saveResult = onSave({ ...draft, libraryStatus: promote ? 'calculation_ready' : device.libraryStatus, researchStatus: promote ? 'reviewed' : device.researchStatus, reviewStatus: promote ? 'calculation_ready' : 'in_review' });
        if (saveResult === false) return false;
      }
      result = { ...draft, libraryStatus: promote ? 'calculation_ready' : device.libraryStatus, researchStatus: promote ? 'reviewed' : device.researchStatus, reviewStatus: promote ? 'calculation_ready' : 'in_review' };
      return true;
    },
    render(container, controls) {
      const doc = container.ownerDocument;
      let libraryPoints = [...initial.libraryCurve];
      let sourcePoints = [...initial.sourceCurve];
      const sourceDocuments = Array.isArray(device.sourceDocuments) ? device.sourceDocuments : [];
      const defaultSource = defaultSourceDocument(device);

      const shell = createElement(doc, 'div', 'protective-review-shell');
      const heading = createElement(doc, 'div', 'protective-review-record-heading');
      const headingText = createElement(doc, 'div');
      headingText.append(
        createElement(doc, 'p', 'protective-review-eyebrow', 'Engineering review workspace'),
        createElement(doc, 'h3', 'protective-review-device-title', device.name || device.id),
        createElement(doc, 'p', 'protective-review-device-subtitle', [device.vendor || device.manufacturer, device.catalogNumber || device.tripUnitModel, device.ratedVoltageVac ? `${device.ratedVoltageVac} VAC` : ''].filter(Boolean).join(' · '))
      );
      const statusBadge = createElement(doc, 'span', `protective-review-badge ${device.libraryStatus === 'calculation_ready' ? 'is-ready' : 'is-screening'}`, device.libraryStatus === 'calculation_ready' ? 'Calculation-ready' : 'Screening only');
      heading.append(headingText, statusBadge);
      shell.appendChild(heading);

      const comparisonGrid = createElement(doc, 'div', 'protective-review-comparison-grid');
      const chartPanel = createElement(doc, 'section', 'protective-review-panel');
      const chartHeader = createElement(doc, 'div', 'protective-review-panel-header');
      chartHeader.append(createElement(doc, 'h3', 'protective-review-panel-title', 'Curve comparison'), createElement(doc, 'span', 'protective-review-panel-meta', 'Log-log axes · source versus stored library curve'));
      const chart = makeSvgElement(doc, 'svg', { class: 'protective-review-chart', viewBox: '0 0 700 375', role: 'img', 'aria-label': 'Manufacturer source curve compared to stored library curve' });
      const chartLegend = createElement(doc, 'div', 'protective-review-legend');
      chartLegend.append(
        createElement(doc, 'span', 'protective-review-legend-item protective-review-legend-source', 'Manufacturer source'),
        createElement(doc, 'span', 'protective-review-legend-item protective-review-legend-library', 'Stored library curve'),
        createElement(doc, 'span', 'protective-review-legend-item protective-review-legend-check', 'Source spot check')
      );
      chartPanel.append(chartHeader, chart, chartLegend);

      const gatePanel = createElement(doc, 'aside', 'protective-review-panel protective-review-gate-panel');
      const gateHeader = createElement(doc, 'div', 'protective-review-panel-header');
      gateHeader.append(createElement(doc, 'h3', 'protective-review-panel-title', 'Promotion gate'), createElement(doc, 'span', 'protective-review-panel-meta', 'Live validation'));
      statusEl = createElement(doc, 'p', 'protective-review-status');
      const gateList = createElement(doc, 'ul', 'protective-review-gate-list');
      const promoteLabel = createElement(doc, 'label', 'protective-review-promote-label');
      promoteInput = doc.createElement('input');
      promoteInput.type = 'checkbox';
      promoteInput.checked = initial.libraryStatus === 'calculation_ready';
      promoteLabel.append(promoteInput, createElement(doc, 'span', '', 'Mark calculation-ready after all checks pass'));
      gatePanel.append(gateHeader, statusEl, gateList, promoteLabel);

      comparisonGrid.append(chartPanel, gatePanel);
      shell.appendChild(comparisonGrid);

      const pointGrid = createElement(doc, 'div', 'protective-review-point-grid');
      const sourceSectionHost = createElement(doc, 'div', 'protective-review-point-host');
      const librarySectionHost = createElement(doc, 'div', 'protective-review-point-host');
      pointGrid.append(sourceSectionHost, librarySectionHost);
      shell.appendChild(pointGrid);

      const sourcePaste = doc.createElement('textarea');
      sourcePaste.className = 'protective-review-textarea protective-review-paste-input';
      sourcePaste.placeholder = 'Paste source points as current,time pairs, one per line. Example: 200,10.0';
      const pasteButton = createElement(doc, 'button', 'btn secondary-btn', 'Load pasted source points');
      pasteButton.type = 'button';
      pasteButton.addEventListener('click', () => {
        const parsed = sourcePaste.value.split(/[;\n]+/).map(line => line.trim()).filter(Boolean).map(line => {
          const [current, time] = line.split(/[,\s:]+/, 2);
          return sanitizePoint({ current, time });
        }).filter(Boolean);
        if (!parsed.length) {
          statusEl.textContent = 'No valid source points were found. Use current,time pairs.';
          statusEl.className = 'protective-review-status is-error';
          return;
        }
        sourcePoints = parsed;
        renderAll();
        sourcePaste.value = '';
      });
      const sourcePasteWrap = createElement(doc, 'div', 'protective-review-paste-wrap');
      sourcePasteWrap.append(createElement(doc, 'span', 'protective-review-label', 'Optional paste helper'), sourcePaste, pasteButton);
      sourceSectionHost.appendChild(sourcePasteWrap);

      const evidencePanel = createElement(doc, 'section', 'protective-review-panel protective-review-evidence-panel');
      const evidenceHeader = createElement(doc, 'div', 'protective-review-panel-header');
      evidenceHeader.append(createElement(doc, 'h3', 'protective-review-panel-title', 'Source evidence and sign-off'), createElement(doc, 'span', 'protective-review-panel-meta', 'Review details saved with this project'));
      const evidenceGrid = createElement(doc, 'div', 'protective-review-evidence-grid');
      const sourceSelect = doc.createElement('select');
      sourceSelect.className = 'protective-review-input';
      sourceDocuments.forEach(source => {
        const option = doc.createElement('option');
        option.value = source.id || '';
        option.textContent = `${source.publisher || 'Source'} — ${source.title || source.id}`;
        option.dataset.url = source.url || '';
        sourceSelect.appendChild(option);
      });
      if (sourceDocuments.length) sourceSelect.value = initial.curveEvidence.sourceId || defaultSource?.id || sourceDocuments[0].id || '';
      const revisionInput = inputControl(doc, 'text', initial.curveEvidence.revision || initial.curveEvidence.date || '');
      const curveReferenceInput = inputControl(doc, 'text', initial.curveEvidence.curveNumber || initial.curveEvidence.curveId || initial.curveEvidence.page || '');
      const extractionInput = inputControl(doc, 'text', initial.curveEvidence.extractionMethod || '');
      const reviewerInput = inputControl(doc, 'text', initial.review.reviewer || '');
      const reviewedOnInput = inputControl(doc, 'date', initial.review.reviewedOn || '');
      const notesInput = doc.createElement('textarea');
      notesInput.className = 'protective-review-textarea';
      notesInput.value = initial.review.notes || '';
      notesInput.placeholder = 'Record the configuration, curve comparison result, applicability, limitations, and review decision.';
      appendField(doc, evidenceGrid, 'Source document', sourceSelect, 'protective-review-field-wide');
      appendField(doc, evidenceGrid, 'Revision or date', revisionInput);
      appendField(doc, evidenceGrid, 'Curve number / page', curveReferenceInput);
      appendField(doc, evidenceGrid, 'Extraction method', extractionInput);
      appendField(doc, evidenceGrid, 'Independent reviewer', reviewerInput);
      appendField(doc, evidenceGrid, 'Review date', reviewedOnInput);
      appendField(doc, evidenceGrid, 'Review notes', notesInput, 'protective-review-field-wide');
      const sourceLink = createElement(doc, 'a', 'protective-review-source-link', 'Open source document');
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      const updateSourceLink = () => {
        const selected = sourceSelect.selectedOptions[0];
        sourceLink.href = selected?.dataset.url || '#';
        sourceLink.setAttribute('aria-disabled', selected?.dataset.url ? 'false' : 'true');
      };
      sourceSelect.addEventListener('change', updateSourceLink);
      updateSourceLink();
      evidencePanel.append(evidenceHeader, evidenceGrid, sourceLink);
      shell.appendChild(evidencePanel);
      container.appendChild(shell);

      const addPoint = (target, point = { current: '', time: '' }) => {
        target.push(point);
        renderAll();
      };
      readDraft = () => {
        const selectedSource = sourceSelect.selectedOptions[0];
        const sourceId = selectedSource?.value || initial.curveEvidence.sourceId || null;
        const normalizedSource = normalizeReviewCurve(sourcePoints);
        const normalizedLibrary = normalizeReviewCurve(libraryPoints);
        const spotChecks = spotChecksFor(normalizedSource, normalizedLibrary, sourceId, initial.profileId || null);
        return {
          deviceId: device.id,
          profileId: initial.profileId || null,
          libraryCurve: normalizedLibrary,
          sourceCurve: normalizedSource,
          curveEvidence: {
            document: selectedSource?.textContent || initial.curveEvidence.document || '',
            revision: revisionInput.value.trim(),
            curveNumber: curveReferenceInput.value.trim(),
            extractionMethod: extractionInput.value.trim(),
            sourceId
          },
          curveValidation: {
            spotChecks,
            notes: `Reviewer compared ${spotChecks.length} source point${spotChecks.length === 1 ? '' : 's'} against the stored curve.`
          },
          review: {
            reviewer: reviewerInput.value.trim(),
            reviewedOn: reviewedOnInput.value,
            notes: notesInput.value.trim()
          },
          lastVerified: reviewedOnInput.value,
          libraryStatus: initial.libraryStatus,
          researchStatus: initial.researchStatus
        };
      };
      const renderGate = () => {
        const draft = readDraft();
        const candidate = buildCandidate(device, draft, true);
        const missing = getProtectiveDeviceProductionMissing(candidate);
        const compatibility = assessProtectiveDeviceLibraryEntry(candidate);
        gateList.innerHTML = '';
        const checks = [
          ['Stored library curve', draft.libraryCurve.length >= 2, `${draft.libraryCurve.length} point${draft.libraryCurve.length === 1 ? '' : 's'}`],
          ['Source comparison', draft.curveValidation.spotChecks.length >= 3, `${draft.curveValidation.spotChecks.length} of 3 spot checks`],
          ['Curve evidence', Boolean(draft.curveEvidence.document && draft.curveEvidence.revision && draft.curveEvidence.curveNumber && draft.curveEvidence.extractionMethod), 'Document, revision, reference, method'],
          ['Independent sign-off', Boolean(draft.review.reviewer && draft.review.reviewedOn), 'Reviewer and date'],
          ['Production applicability', missing.length === 0, missing.length ? `${missing.length} item${missing.length === 1 ? '' : 's'} remaining` : 'All required fields present']
        ];
        checks.forEach(([label, passed, detail]) => {
          const item = createElement(doc, 'li', passed ? 'is-complete' : 'is-pending');
          item.append(createElement(doc, 'span', 'protective-review-check-icon', passed ? '✓' : '—'), createElement(doc, 'span', 'protective-review-check-copy', `${label}: ${detail}`));
          gateList.appendChild(item);
        });
        const gateReady = !missing.length && compatibility.status === 'calculation_ready';
        statusEl.textContent = gateReady ? 'All promotion checks pass. The record may be marked calculation-ready after the reviewer confirms the notes.' : `In review — ${missing.length} production requirement${missing.length === 1 ? '' : 's'} remaining.`;
        statusEl.className = `protective-review-status ${gateReady ? 'is-ready' : ''}`;
        if (promoteInput.checked && !gateReady) {
          statusEl.textContent = `Promotion blocked — ${missing.slice(0, 3).join('; ')}${missing.length > 3 ? '; …' : ''}.`;
          statusEl.className = 'protective-review-status is-error';
        }
      };
      const refreshLive = () => {
        const draft = readDraft();
        renderReviewChart(chart, draft.libraryCurve, draft.sourceCurve);
        const rows = sourceSectionHost.querySelectorAll('tbody tr');
        draft.curveValidation.spotChecks.forEach((check, index) => {
          const cells = rows[index]?.children;
          if (!cells || cells.length < 5) return;
          cells[2].textContent = Number.isFinite(check.actualTime) ? check.actualTime.toPrecision(4) : '—';
          cells[3].textContent = Number.isFinite(check.relativeError)
            ? `${check.relativeError >= 0 ? '+' : ''}${(check.relativeError * 100).toFixed(2)}%`
            : '—';
        });
        renderGate();
      };
      const renderAll = () => {
        renderReviewChart(chart, normalizeReviewCurve(libraryPoints), normalizeReviewCurve(sourcePoints));
        sourceSectionHost.querySelectorAll('.protective-review-point-section').forEach(section => section.remove());
        librarySectionHost.querySelectorAll('.protective-review-point-section').forEach(section => section.remove());
        const sourceSection = createPointTable(doc, 'Manufacturer source points', sourcePoints, {
          editable: true,
          comparisonCurve: libraryPoints,
          onChange: (index, field, value) => {
            sourcePoints[index][field] = value;
            sourcePoints = sourcePoints.map(point => ({ current: point.current, time: point.time }));
            refreshLive();
          },
          onRemove: index => {
            sourcePoints.splice(index, 1);
            renderAll();
          },
          emptyText: 'No source points entered. Add three or more official points to enable spot checks.'
        });
        const librarySection = createPointTable(doc, 'Stored library points', libraryPoints, {
          editable: true,
          onChange: (index, field, value) => {
            libraryPoints[index][field] = value;
            libraryPoints = libraryPoints.map(point => ({ current: point.current, time: point.time }));
            refreshLive();
          },
          onRemove: index => {
            libraryPoints.splice(index, 1);
            renderAll();
          },
          emptyText: 'No stored curve points. Add the transcribed library points before promotion.'
        });
        const sourceAdd = createElement(doc, 'button', 'btn secondary-btn protective-review-add-button', 'Add source point');
        sourceAdd.type = 'button';
        sourceAdd.addEventListener('click', () => addPoint(sourcePoints));
        sourceSection.querySelector('.protective-review-section-heading').appendChild(sourceAdd);
        const libraryAdd = createElement(doc, 'button', 'btn secondary-btn protective-review-add-button', 'Add library point');
        libraryAdd.type = 'button';
        libraryAdd.addEventListener('click', () => addPoint(libraryPoints));
        librarySection.querySelector('.protective-review-section-heading').appendChild(libraryAdd);
        sourceSectionHost.insertBefore(sourceSection, sourcePasteWrap);
        librarySectionHost.appendChild(librarySection);
        renderGate();
      };
      renderAll();
      promoteInput.addEventListener('change', renderGate);
      [revisionInput, curveReferenceInput, extractionInput, reviewerInput, reviewedOnInput, notesInput].forEach(input => input.addEventListener('input', renderGate));
      const firstFocus = sourcePoints.length ? sourceSectionHost.querySelector('input') : sourceSelect;
      if (controls && typeof controls.setInitialFocus === 'function') controls.setInitialFocus(firstFocus || sourceSelect);
      return firstFocus || sourceSelect;
    }
  });
  return result;
}
