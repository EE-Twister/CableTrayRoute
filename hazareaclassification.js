import {
  runHazAreaStudy,
  NEC_CLASSES,
  NEC_DIVISIONS,
  NEC_GAS_GROUPS,
  NEC_DUST_GROUPS,
  IEC_GAS_ZONES,
  IEC_DUST_ZONES,
  IEC_EQUIPMENT_GROUPS,
  EX_PROTECTION_TYPES,
  T_RATINGS,
  buildHazAreaMapModel,
  normalizeHazAreaLayout,
} from './analysis/hazAreaClassification.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initStudyApprovalPanel('hazAreaClassification');

  const tabAreas   = document.getElementById('tab-areas');
  const tabEquip   = document.getElementById('tab-equipment');
  const panelAreas = document.getElementById('panel-areas');
  const panelEquip = document.getElementById('panel-equipment');
  const areasContainer = document.getElementById('areas-container');
  const equipmentContainer = document.getElementById('equipment-container');
  const exportBtn = document.getElementById('export-csv-btn');
  const warningsPanel = document.getElementById('warnings-panel');
  const layoutWidthInput = document.getElementById('haz-layout-width');
  const layoutHeightInput = document.getElementById('haz-layout-height');
  const layoutGridInput = document.getElementById('haz-layout-grid');
  const layoutElevationInput = document.getElementById('haz-layout-elevation');
  const mapSummaryEl = document.getElementById('haz-map-summary');
  const mapCanvasEl = document.getElementById('haz-map-canvas');
  const mapLegendEl = document.getElementById('haz-map-legend');
  const mapInspectorEl = document.getElementById('haz-map-inspector');
  const mapRotateLeftBtn = document.getElementById('haz-map-rotate-left');
  const mapRotateRightBtn = document.getElementById('haz-map-rotate-right');
  const mapPanLeftBtn = document.getElementById('haz-map-pan-left');
  const mapPanRightBtn = document.getElementById('haz-map-pan-right');
  const mapPanUpBtn = document.getElementById('haz-map-pan-up');
  const mapPanDownBtn = document.getElementById('haz-map-pan-down');
  const mapResetViewBtn = document.getElementById('haz-map-reset-view');
  const mapViewReadoutEl = document.getElementById('haz-map-view-readout');

  let areaCount = 0;
  let equipCount = 0;
  let latestStudyResult = null;
  let mapView = { yawDeg: 0, panX: 0, panY: 0 };
  let mapDrag = null;
  let selectedMapObject = null;

  function activateTab(tab) {
    const isAreas = tab === 'areas';
    tabAreas.setAttribute('aria-selected', isAreas ? 'true' : 'false');
    tabEquip.setAttribute('aria-selected', isAreas ? 'false' : 'true');
    tabAreas.classList.toggle('tab-btn--active', isAreas);
    tabEquip.classList.toggle('tab-btn--active', !isAreas);
    panelAreas.hidden = !isAreas;
    panelEquip.hidden = isAreas;
  }

  tabAreas.addEventListener('click', () => activateTab('areas'));
  tabEquip.addEventListener('click', () => activateTab('equipment'));

  document.getElementById('add-area-btn').addEventListener('click', () => {
    addAreaRow();
    handleStudyInputChanged();
  });
  document.getElementById('add-equip-btn').addEventListener('click', () => {
    addEquipRow();
    handleStudyInputChanged();
  });
  document.getElementById('run-study-btn').addEventListener('click', runStudy);
  document.getElementById('check-equip-btn').addEventListener('click', checkEquipment);
  exportBtn.addEventListener('click', exportCsv);

  [layoutWidthInput, layoutHeightInput, layoutGridInput, layoutElevationInput].forEach((input) => {
    input.addEventListener('input', handleStudyInputChanged);
    input.addEventListener('change', handleStudyInputChanged);
  });
  initMapViewControls();
  initMapDragControls();
  initMapSelectionControls();

  const saved = getStudies().hazAreaClassification;
  if (saved && saved._inputs) {
    latestStudyResult = saved;
    restoreState(saved._inputs);
    renderAreaResults(saved);
    renderEquipResults(saved);
    enableExport();
    renderMapPreview(saved);
  } else {
    setLayoutInputs();
    addAreaRow({
      id: 'zone-1',
      label: 'Pump Room',
      standard: 'IEC',
      iecZone: '1',
      gasGroup: 'IIB',
      tRating: 'T3',
      geometry: { shape: 'circle', xFt: 40, yFt: 25, radiusFt: 12, zMinFt: 0, zMaxFt: 12 }
    });
    addEquipRow({
      id: 'e1',
      label: 'Junction Box',
      hazAreaId: 'zone-1',
      exProtection: 'e',
      exGroup: 'IIB',
      tRating: 'T3',
      xFt: 40,
      yFt: 25,
      zFt: 4
    });
    renderMapPreview();
  }

  function setLayoutInputs(layout = {}) {
    const normalized = normalizeHazAreaLayout(layout);
    layoutWidthInput.value = normalized.widthFt;
    layoutHeightInput.value = normalized.heightFt;
    layoutGridInput.value = normalized.gridFt;
    layoutElevationInput.value = normalized.elevationFt;
  }

  function readOptionalNumber(input) {
    if (!input) return undefined;
    const raw = input.value.trim();
    if (raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }

  function formatNumberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : '';
  }

  function initMapViewControls() {
    mapRotateLeftBtn?.addEventListener('click', () => changeMapView({ yawDeg: mapView.yawDeg - 15 }));
    mapRotateRightBtn?.addEventListener('click', () => changeMapView({ yawDeg: mapView.yawDeg + 15 }));
    mapPanLeftBtn?.addEventListener('click', () => changeMapView({ panX: mapView.panX - 36 }));
    mapPanRightBtn?.addEventListener('click', () => changeMapView({ panX: mapView.panX + 36 }));
    mapPanUpBtn?.addEventListener('click', () => changeMapView({ panY: mapView.panY - 36 }));
    mapPanDownBtn?.addEventListener('click', () => changeMapView({ panY: mapView.panY + 36 }));
    mapResetViewBtn?.addEventListener('click', () => {
      mapView = { yawDeg: 0, panX: 0, panY: 0 };
      renderMapPreview();
    });
  }

  function initMapDragControls() {
    if (!mapCanvasEl) return;

    mapCanvasEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      mapDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: mapView.panX,
        panY: mapView.panY
      };
      mapCanvasEl.setPointerCapture?.(event.pointerId);
      mapCanvasEl.classList.add('haz-map-canvas--dragging');
    });

    mapCanvasEl.addEventListener('pointermove', (event) => {
      if (!mapDrag || mapDrag.pointerId !== event.pointerId) return;
      event.preventDefault();
      mapView = {
        ...mapView,
        panX: clampMapPan(mapDrag.panX + event.clientX - mapDrag.startX),
        panY: clampMapPan(mapDrag.panY + event.clientY - mapDrag.startY)
      };
      renderMapPreview();
    });

    const finishDrag = (event) => {
      if (!mapDrag || mapDrag.pointerId !== event.pointerId) return;
      mapCanvasEl.releasePointerCapture?.(event.pointerId);
      mapCanvasEl.classList.remove('haz-map-canvas--dragging');
      mapDrag = null;
    };

    mapCanvasEl.addEventListener('pointerup', finishDrag);
    mapCanvasEl.addEventListener('pointercancel', finishDrag);
    mapCanvasEl.addEventListener('lostpointercapture', () => {
      mapCanvasEl.classList.remove('haz-map-canvas--dragging');
      mapDrag = null;
    });
  }

  function initMapSelectionControls() {
    if (!mapCanvasEl) return;

    mapCanvasEl.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-map-type][data-map-id]');
      if (!target) return;
      selectMapObject(target.dataset.mapType, target.dataset.mapId, { revealTab: true });
    });

    mapCanvasEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target.closest?.('[data-map-type][data-map-id]');
      if (!target) return;
      event.preventDefault();
      selectMapObject(target.dataset.mapType, target.dataset.mapId, { revealTab: true });
    });

    mapInspectorEl?.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-map-type][data-map-id]');
      if (!target) return;
      selectMapObject(target.dataset.mapType, target.dataset.mapId, { revealTab: true });
    });
  }

  function selectMapObject(type, id, options = {}) {
    if (!type || !id) return;
    selectedMapObject = { type, id };
    if (options.revealTab) {
      activateTab(type === 'equipment' ? 'equipment' : 'areas');
    }
    renderMapPreview();
  }

  function normalizeYaw(value) {
    const normalized = ((Number(value) % 360) + 360) % 360;
    return normalized > 180 ? normalized - 360 : normalized;
  }

  function clampMapPan(value) {
    return clampMap(Number(value) || 0, -320, 320);
  }

  function changeMapView(next) {
    mapView = {
      yawDeg: normalizeYaw(next.yawDeg ?? mapView.yawDeg),
      panX: clampMapPan(next.panX ?? mapView.panX),
      panY: clampMapPan(next.panY ?? mapView.panY)
    };
    renderMapPreview();
  }

  function readLayout() {
    return normalizeHazAreaLayout({
      widthFt: readOptionalNumber(layoutWidthInput),
      heightFt: readOptionalNumber(layoutHeightInput),
      gridFt: readOptionalNumber(layoutGridInput),
      elevationFt: readOptionalNumber(layoutElevationInput)
    });
  }

  function readStudyInputs() {
    return {
      layout: readLayout(),
      areas: readAreas(),
      equipment: readEquipment()
    };
  }

  function handleStudyInputChanged() {
    latestStudyResult = null;
    renderMapPreview();
  }

  function enableExport() {
    exportBtn.disabled = false;
    exportBtn.removeAttribute('aria-disabled');
  }

  function optionMarkup(options, selectedValue, placeholder = '-- Not specified --') {
    return ['', ...options.map(item => item.value)].map((value) => {
      const option = options.find(item => item.value === value);
      const label = value ? option?.label || value : placeholder;
      return `<option value="${escapeHtml(value)}"${(selectedValue || '') === value ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  }

  function addAreaRow(defaults = {}) {
    const id = ++areaCount;
    const row = document.createElement('div');
    row.className = 'field-group field-group--bordered area-row';
    row.dataset.rowId = id;
    row.dataset.mapType = 'area';

    const geometry = defaults.geometry || {};
    const shape = geometry.shape === 'rect' ? 'rect' : 'circle';
    const necClassOpts = NEC_CLASSES.map(c =>
      `<option value="${c.value}"${defaults.necClass === c.value ? ' selected' : ''}>${escapeHtml(c.label)}</option>`
    ).join('');
    const necDivOpts = NEC_DIVISIONS.map(d =>
      `<option value="${d.value}"${defaults.necDivision === d.value ? ' selected' : ''}>${escapeHtml(d.label)}</option>`
    ).join('');
    const gasGroupOpts = optionMarkup(NEC_GAS_GROUPS, defaults.gasGroup, '-- Not specified --');
    const dustGroupOpts = optionMarkup(NEC_DUST_GROUPS, defaults.dustGroup, '-- Not specified --');
    const iecGasOpts = optionMarkup(IEC_GAS_ZONES, defaults.iecZone, '-- None --');
    const iecDustOpts = optionMarkup(IEC_DUST_ZONES, defaults.dustZone, '-- None --');
    const iecGroupOpts = optionMarkup(IEC_EQUIPMENT_GROUPS, defaults.gasGroup || defaults.dustGroup, '-- Not specified --');
    const tRatingOpts = optionMarkup(T_RATINGS, defaults.tRating, '-- Not specified --');

    row.innerHTML = `
      <div class="haz-row-header">
        <div class="haz-row-title-block">
          <strong class="area-row-title">Area ${id}</strong>
          <span class="haz-row-status-pill" data-role="map-status">Map pending</span>
        </div>
        <button type="button" class="btn area-remove-btn" aria-label="Remove area ${id}" title="Remove">x</button>
      </div>
      <div class="field-row-inline">
        <label>Area ID <input type="text" class="area-id" value="${escapeHtml(defaults.id || `area-${id}`)}" placeholder="e.g. pump-room" aria-label="Area ID"></label>
        <label>Label <input type="text" class="area-label" value="${escapeHtml(defaults.label || '')}" placeholder="e.g. Pump Room" aria-label="Area label"></label>
        <label>Standard
          <select class="area-standard" aria-label="Classification standard">
            <option value="NEC"${defaults.standard !== 'IEC' ? ' selected' : ''}>NEC (Class/Division)</option>
            <option value="IEC"${defaults.standard === 'IEC' ? ' selected' : ''}>IEC 60079 (Zone)</option>
          </select>
        </label>
      </div>
      <div class="area-nec-fields field-row-inline"${defaults.standard === 'IEC' ? ' hidden' : ''}>
        <label>NEC Class <select class="area-nec-class" aria-label="NEC class">${necClassOpts}</select></label>
        <label>Division <select class="area-nec-div" aria-label="NEC division">${necDivOpts}</select></label>
        <label>Gas Group (Class I) <select class="area-gas-group-nec" aria-label="NEC gas group">${gasGroupOpts}</select></label>
        <label>Dust Group (Class II) <select class="area-dust-group-nec" aria-label="NEC dust group">${dustGroupOpts}</select></label>
      </div>
      <div class="area-iec-fields field-row-inline"${defaults.standard !== 'IEC' ? ' hidden' : ''}>
        <label>Gas Zone <select class="area-iec-zone" aria-label="IEC gas zone">${iecGasOpts}</select></label>
        <label>Dust Zone <select class="area-dust-zone" aria-label="IEC dust zone">${iecDustOpts}</select></label>
        <label>Equipment Group <select class="area-iec-group" aria-label="IEC equipment group">${iecGroupOpts}</select></label>
      </div>
      <div class="field-row-inline">
        <label>Minimum T-Rating <select class="area-t-rating" aria-label="Minimum T-rating required">${tRatingOpts}</select></label>
        <label style="flex:2">Area Description / Notes <input type="text" class="area-notes" value="${escapeHtml(defaults.notes || '')}" placeholder="Optional notes" aria-label="Notes"></label>
      </div>
      <div class="haz-map-row-block">
        <div class="haz-map-row-heading">Map Footprint</div>
        <div class="field-row-inline haz-map-input-grid">
          <label>Shape
            <select class="area-geometry-shape" aria-label="Area footprint shape">
              <option value="circle"${shape === 'circle' ? ' selected' : ''}>Circle</option>
              <option value="rect"${shape === 'rect' ? ' selected' : ''}>Rectangle</option>
            </select>
          </label>
          <label>Center X (ft) <input type="number" class="area-geometry-x" value="${formatNumberValue(geometry.xFt)}" step="1" inputmode="decimal" aria-label="Area center X in feet"></label>
          <label>Center Y (ft) <input type="number" class="area-geometry-y" value="${formatNumberValue(geometry.yFt)}" step="1" inputmode="decimal" aria-label="Area center Y in feet"></label>
          <label class="area-circle-field">Radius (ft) <input type="number" class="area-geometry-radius" value="${formatNumberValue(geometry.radiusFt)}" min="1" step="1" inputmode="decimal" aria-label="Area radius in feet"></label>
          <label class="area-rect-field">Width (ft) <input type="number" class="area-geometry-width" value="${formatNumberValue(geometry.widthFt)}" min="1" step="1" inputmode="decimal" aria-label="Area width in feet"></label>
          <label class="area-rect-field">Height (ft) <input type="number" class="area-geometry-height" value="${formatNumberValue(geometry.heightFt)}" min="1" step="1" inputmode="decimal" aria-label="Area height in feet"></label>
          <label>Bottom Elev. (ft) <input type="number" class="area-geometry-z-min" value="${formatNumberValue(geometry.zMinFt)}" min="0" step="1" inputmode="decimal" aria-label="Area bottom elevation in feet"></label>
          <label>Top Elev. (ft) <input type="number" class="area-geometry-z-max" value="${formatNumberValue(geometry.zMaxFt)}" min="0" step="1" inputmode="decimal" aria-label="Area top elevation in feet"></label>
        </div>
      </div>`;

    const stdSelect = row.querySelector('.area-standard');
    const necFields = row.querySelector('.area-nec-fields');
    const iecFields = row.querySelector('.area-iec-fields');
    const shapeSelect = row.querySelector('.area-geometry-shape');

    stdSelect.addEventListener('change', () => {
      const isIec = stdSelect.value === 'IEC';
      necFields.hidden = isIec;
      iecFields.hidden = !isIec;
    });
    shapeSelect.addEventListener('change', () => updateAreaGeometryFields(row));
    row.querySelector('.area-remove-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      row.remove();
      handleStudyInputChanged();
    });
    row.addEventListener('click', () => {
      const areaId = row.querySelector('.area-id')?.value.trim();
      if (areaId) selectMapObject('area', areaId);
    });
    row.addEventListener('focusin', () => {
      const areaId = row.querySelector('.area-id')?.value.trim();
      if (areaId) selectMapObject('area', areaId);
    });
    row.addEventListener('input', handleStudyInputChanged);
    row.addEventListener('change', handleStudyInputChanged);

    areasContainer.appendChild(row);
    updateAreaGeometryFields(row);
  }

  function updateAreaGeometryFields(row) {
    const shape = row.querySelector('.area-geometry-shape').value;
    row.querySelectorAll('.area-circle-field').forEach(field => { field.hidden = shape !== 'circle'; });
    row.querySelectorAll('.area-rect-field').forEach(field => { field.hidden = shape !== 'rect'; });
  }

  function readAreas() {
    return Array.from(document.querySelectorAll('.area-row')).map(row => {
      const standard = row.querySelector('.area-standard').value;
      const geometry = {
        shape: row.querySelector('.area-geometry-shape').value,
        xFt: readOptionalNumber(row.querySelector('.area-geometry-x')),
        yFt: readOptionalNumber(row.querySelector('.area-geometry-y')),
        radiusFt: readOptionalNumber(row.querySelector('.area-geometry-radius')),
        widthFt: readOptionalNumber(row.querySelector('.area-geometry-width')),
        heightFt: readOptionalNumber(row.querySelector('.area-geometry-height')),
        zMinFt: readOptionalNumber(row.querySelector('.area-geometry-z-min')),
        zMaxFt: readOptionalNumber(row.querySelector('.area-geometry-z-max'))
      };
      const area = {
        id:       row.querySelector('.area-id').value.trim(),
        label:    row.querySelector('.area-label').value.trim(),
        standard,
        tRating:  row.querySelector('.area-t-rating').value || undefined,
        notes:    row.querySelector('.area-notes').value.trim(),
        geometry
      };

      if (standard === 'NEC') {
        area.necClass    = row.querySelector('.area-nec-class').value;
        area.necDivision = row.querySelector('.area-nec-div').value;
        area.gasGroup    = row.querySelector('.area-gas-group-nec').value || undefined;
        area.dustGroup   = row.querySelector('.area-dust-group-nec').value || undefined;
      } else {
        area.iecZone  = row.querySelector('.area-iec-zone').value || undefined;
        area.dustZone = row.querySelector('.area-dust-zone').value || undefined;
        area.gasGroup = row.querySelector('.area-iec-group').value || undefined;
      }

      return area;
    });
  }

  function addEquipRow(defaults = {}) {
    const id = ++equipCount;
    const row = document.createElement('div');
    row.className = 'field-group field-group--bordered equip-row';
    row.dataset.rowId = id;
    row.dataset.mapType = 'equipment';

    const protOpts = optionMarkup(EX_PROTECTION_TYPES, defaults.exProtection, '-- Not specified --');
    const groupOpts = optionMarkup(IEC_EQUIPMENT_GROUPS, defaults.exGroup, '-- Not specified --');
    const tOpts = optionMarkup(T_RATINGS, defaults.tRating, '-- Not specified --');

    row.innerHTML = `
      <div class="haz-row-header">
        <div class="haz-row-title-block">
          <strong>Equipment ${id}</strong>
          <span class="haz-row-status-pill" data-role="map-status">Map pending</span>
        </div>
        <button type="button" class="btn equip-remove-btn" aria-label="Remove equipment ${id}" title="Remove">x</button>
      </div>
      <div class="field-row-inline">
        <label>Equipment ID <input type="text" class="equip-id" value="${escapeHtml(defaults.id || `equip-${id}`)}" placeholder="e.g. JB-101" aria-label="Equipment ID"></label>
        <label>Label / Description <input type="text" class="equip-label" value="${escapeHtml(defaults.label || '')}" placeholder="e.g. Junction Box" aria-label="Equipment label"></label>
        <label>Assigned Area ID <input type="text" class="equip-area-id" value="${escapeHtml(defaults.hazAreaId || '')}" placeholder="e.g. pump-room" aria-label="Assigned area ID"></label>
      </div>
      <div class="field-row-inline">
        <label>Ex Protection Type <select class="equip-protection" aria-label="Ex protection type">${protOpts}</select></label>
        <label>Equipment Group <select class="equip-group" aria-label="Equipment group">${groupOpts}</select></label>
        <label>T-Rating <select class="equip-t-rating" aria-label="Equipment T-rating">${tOpts}</select></label>
        <label>Cert Number <input type="text" class="equip-cert" value="${escapeHtml(defaults.certNumber || '')}" placeholder="e.g. IECEx UL 22.0001" aria-label="Certification number"></label>
      </div>
      <div class="haz-map-row-block">
        <div class="haz-map-row-heading">Map Position</div>
        <div class="field-row-inline haz-map-input-grid">
          <label>X (ft) <input type="number" class="equip-map-x" value="${formatNumberValue(defaults.xFt)}" step="1" inputmode="decimal" aria-label="Equipment X position in feet"></label>
          <label>Y (ft) <input type="number" class="equip-map-y" value="${formatNumberValue(defaults.yFt)}" step="1" inputmode="decimal" aria-label="Equipment Y position in feet"></label>
          <label>Elevation (ft) <input type="number" class="equip-map-z" value="${formatNumberValue(defaults.zFt)}" step="1" inputmode="decimal" aria-label="Equipment elevation in feet"></label>
        </div>
      </div>`;

    row.querySelector('.equip-remove-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      row.remove();
      handleStudyInputChanged();
    });
    row.addEventListener('click', () => {
      const equipmentId = row.querySelector('.equip-id')?.value.trim();
      if (equipmentId) selectMapObject('equipment', equipmentId);
    });
    row.addEventListener('focusin', () => {
      const equipmentId = row.querySelector('.equip-id')?.value.trim();
      if (equipmentId) selectMapObject('equipment', equipmentId);
    });
    row.addEventListener('input', handleStudyInputChanged);
    row.addEventListener('change', handleStudyInputChanged);

    equipmentContainer.appendChild(row);
  }

  function readEquipment() {
    return Array.from(document.querySelectorAll('.equip-row')).map(row => ({
      id:           row.querySelector('.equip-id').value.trim(),
      label:        row.querySelector('.equip-label').value.trim(),
      hazAreaId:    row.querySelector('.equip-area-id').value.trim(),
      exProtection: row.querySelector('.equip-protection').value || undefined,
      exGroup:      row.querySelector('.equip-group').value || undefined,
      tRating:      row.querySelector('.equip-t-rating').value || undefined,
      certNumber:   row.querySelector('.equip-cert').value.trim() || undefined,
      xFt:          readOptionalNumber(row.querySelector('.equip-map-x')),
      yFt:          readOptionalNumber(row.querySelector('.equip-map-y')),
      zFt:          readOptionalNumber(row.querySelector('.equip-map-z'))
    })).filter(e => e.id || e.label);
  }

  function runStudy() {
    const inputs = readStudyInputs();
    const areaRes = document.getElementById('area-results');
    const { valid, errors, result } = runHazAreaStudy(inputs);

    if (!valid) {
      latestStudyResult = null;
      renderMapPreview();
      warningsPanel.hidden = false;
      warningsPanel.innerHTML = `<div class="drc-error"><strong>Input errors:</strong><ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
      areaRes.hidden = true;
      return;
    }

    latestStudyResult = result;
    warningsPanel.hidden = true;
    renderAreaResults(result);
    renderEquipResults(result);
    renderMapPreview(result);
    enableExport();
    setStudies({ ...getStudies(), hazAreaClassification: result });
  }

  function checkEquipment() {
    const inputs = readStudyInputs();
    const { valid, errors, result } = runHazAreaStudy(inputs);
    if (!valid) {
      latestStudyResult = null;
      renderMapPreview();
      const equipRes = document.getElementById('equipment-results');
      equipRes.hidden = false;
      equipRes.innerHTML = `<div class="drc-error"><strong>Fix classified areas first:</strong><ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
      return;
    }

    latestStudyResult = result;
    renderEquipResults(result);
    renderMapPreview(result);
    enableExport();
    setStudies({ ...getStudies(), hazAreaClassification: result });
  }

  function statusBadge(status) {
    const cls = status === 'PASS' ? 'drc-pass' : status === 'FAIL' ? 'drc-error' : status === 'WARN' ? 'drc-warning' : 'haz-status-info';
    return `<span class="${cls}">${escapeHtml(status)}</span>`;
  }

  function renderAreaResults(result) {
    const el = document.getElementById('area-results');
    if (!result || !result.areas) return;

    const { summary, areas } = result;
    const mapAreas = new Map((result.mapModel?.areas || []).map(area => [area.id, area]));
    const areaRows = areas.map((a) => {
      const mapped = mapAreas.get(a.id);
      return `
      <tr class="haz-result-row haz-result-row--area" style="--haz-row-accent:${mapped?.stroke || '#64748b'}">
        <td><code>${escapeHtml(a.id)}</code></td>
        <td>${escapeHtml(a.label)}</td>
        <td><code>${escapeHtml(a.standard)}</code></td>
        <td>${escapeHtml(a.designation)}</td>
        <td>${escapeHtml(a.gasGroup)}</td>
        <td>${escapeHtml(a.tRating)}</td>
        <td>${a.equipCount}</td>
        <td>${statusBadge(a.status)}</td>
      </tr>`;
    }).join('');

    el.hidden = false;
    el.innerHTML = `
      <h2>Classification Summary</h2>
      <p>Overall status: ${statusBadge(summary.status)} - ${summary.totalAreas} areas, ${summary.totalEquipment} equipment items checked (${summary.passCount} pass, ${summary.failCount} fail, ${summary.warnCount} warnings)</p>
      <table class="results-table" aria-label="Classified area summary">
        <thead>
          <tr>
            <th>Area ID</th><th>Area</th><th>Standard</th><th>Designation</th>
            <th>Group</th><th>T-Rating</th><th>Equipment</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${areaRows}</tbody>
      </table>`;
  }

  function renderEquipResults(result) {
    const el = document.getElementById('equipment-results');
    if (!result || !result.equipment) return;
    const mapEquipment = new Map((result.mapModel?.equipment || []).map(item => [item.id, item]));

    const rows = result.equipment.map(r => {
      const mapped = mapEquipment.get(r.equipId);
      const status = mapped ? mapped.status : r.pass === null ? 'WARN' : r.pass ? 'PASS' : 'FAIL';
      const issues = [
        ...(r.failures || []),
        ...(r.warnings || []),
        ...(mapped?.geometryWarnings || [])
      ];
      return `
        <tr class="haz-result-row haz-result-row--equipment" style="--haz-row-accent:${mapped?.color || '#64748b'}">
          <td><code>${escapeHtml(r.equipId)}</code> ${escapeHtml(r.label || '')}</td>
          <td><code>${escapeHtml(r.areaId || '')}</code> ${escapeHtml(r.areaLabel || '')}</td>
          <td>${statusBadge(status)}</td>
          <td>${issues.length > 0
              ? `<ul class="compact-list">${issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
              : '-'}</td>
        </tr>`;
    }).join('');

    el.hidden = false;
    el.innerHTML = `
      <h2>Equipment Compatibility Results</h2>
      <table class="results-table" aria-label="Equipment compatibility results">
        <thead><tr><th>Equipment</th><th>Area</th><th>Status</th><th>Issues</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No equipment to check.</td></tr>'}</tbody>
      </table>`;
  }

  function renderMapPreview(result = latestStudyResult) {
    if (!mapCanvasEl) return;
    const model = buildHazAreaMapModel(readStudyInputs(), result);
    ensureSelectedMapObject(model);
    renderMapSummary(model);
    renderMapSvg(model);
    renderMapLegend(model);
    renderMapInspector(model);
    applyLinkedSelection(model);
  }

  function renderMapSummary(model) {
    const { summary } = model;
    mapSummaryEl.innerHTML = `
      ${summaryChip('Areas', summary.areas)}
      ${summaryChip('Equipment', summary.equipment)}
      ${summaryChip('Failures', summary.fail, summary.fail ? 'FAIL' : 'INFO')}
      ${summaryChip('Warnings', summary.warn, summary.warn ? 'WARN' : 'INFO')}`;
  }

  function summaryChip(label, value, status = 'INFO') {
    return `<span class="haz-map-chip haz-map-chip--${status.toLowerCase()}"><strong>${escapeHtml(String(value))}</strong>${escapeHtml(label)}</span>`;
  }

  function findSelectedMapItem(model, selection = selectedMapObject) {
    if (!selection) return null;
    if (selection.type === 'area') {
      const item = model.areas.find(area => area.id === selection.id);
      return item ? { type: 'area', item } : null;
    }
    if (selection.type === 'equipment') {
      const item = model.equipment.find(equipment => equipment.id === selection.id);
      return item ? { type: 'equipment', item } : null;
    }
    return null;
  }

  function ensureSelectedMapObject(model) {
    if (findSelectedMapItem(model)) return;
    const priorityEquipment = model.equipment.find(item => item.status === 'FAIL' || item.status === 'WARN') || model.equipment[0];
    if (priorityEquipment) {
      selectedMapObject = { type: 'equipment', id: priorityEquipment.id };
    } else if (model.areas[0]) {
      selectedMapObject = { type: 'area', id: model.areas[0].id };
    } else {
      selectedMapObject = null;
    }
  }

  function isSelectedMapObject(type, id) {
    return Boolean(selectedMapObject && selectedMapObject.type === type && selectedMapObject.id === id);
  }

  function mapStatusClass(status = 'INFO') {
    return String(status || 'INFO').toLowerCase();
  }

  function areaSeverityKey(area = {}) {
    const label = area.severityLabel || '';
    if (label.includes('0/20') || label.includes('Div 1')) return 'severe';
    if (label.includes('1/21')) return 'elevated';
    if (label.includes('2/22') || label.includes('Div 2')) return 'moderate';
    return 'general';
  }

  function geometrySummary(geometry = {}) {
    if (geometry.shape === 'rect') {
      return [
        ['Shape', 'Rectangle'],
        ['Center', `${roundLabel(geometry.xFt)} ft X, ${roundLabel(geometry.yFt)} ft Y`],
        ['Footprint', `${roundLabel(geometry.widthFt)} ft x ${roundLabel(geometry.heightFt)} ft`],
        ['Elevation', `${roundLabel(geometry.zMinFt)}-${roundLabel(geometry.zMaxFt)} ft`]
      ];
    }
    return [
      ['Shape', 'Spherical / circular'],
      ['Center', `${roundLabel(geometry.xFt)} ft X, ${roundLabel(geometry.yFt)} ft Y`],
      ['Radius', `${roundLabel(geometry.radiusFt)} ft`],
      ['Elevation', `${roundLabel(geometry.zMinFt)}-${roundLabel(geometry.zMaxFt)} ft`]
    ];
  }

  function renderInspectorFacts(facts) {
    return facts.map(([label, value]) => `
      <div class="haz-inspector-fact">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value ?? '-'))}</strong>
      </div>`).join('');
  }

  function renderIssueList(issues) {
    if (!issues.length) return '<p class="haz-inspector-empty">No open map or compatibility issues.</p>';
    return `<ul class="compact-list haz-inspector-issues">${issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>`;
  }

  function renderMapInspector(model) {
    if (!mapInspectorEl) return;
    const selected = findSelectedMapItem(model);
    if (!selected) {
      mapInspectorEl.innerHTML = `
        <div class="haz-inspector-empty-state">
          <h3>Selected Object</h3>
          <p>Select a classified volume or equipment marker to review its geometry and status.</p>
        </div>`;
      return;
    }

    if (selected.type === 'area') {
      const area = selected.item;
      const equipment = model.equipment.filter(item => item.hazAreaId === area.id);
      const linkedEquipment = equipment.length
        ? equipment.map(item => `<button type="button" class="haz-inspector-link" data-map-type="equipment" data-map-id="${escapeHtml(item.id)}">${escapeHtml(item.id)}</button>`).join('')
        : '<span class="haz-inspector-muted">No equipment assigned</span>';

      mapInspectorEl.innerHTML = `
        <div class="haz-inspector-header">
          <span class="haz-inspector-kicker">Classified volume</span>
          <h3>${escapeHtml(area.label || area.id)}</h3>
          <code>${escapeHtml(area.id)}</code>
        </div>
        <div class="haz-inspector-status-row">
          <span class="haz-row-status-pill haz-row-status-pill--${areaSeverityKey(area)}">${escapeHtml(area.severityLabel)}</span>
          ${statusBadge(area.status || 'INFO')}
        </div>
        <div class="haz-inspector-facts">
          ${renderInspectorFacts([
            ['Designation', area.designation],
            ['Standard', area.standard],
            ['Group', area.gasGroup || '-'],
            ['T-rating', area.tRating || '-'],
            ['Equipment', area.equipCount]
          ])}
          ${renderInspectorFacts(geometrySummary(area.geometry))}
        </div>
        <div class="haz-inspector-section">
          <h4>Linked Equipment</h4>
          <div class="haz-inspector-links">${linkedEquipment}</div>
        </div>`;
      return;
    }

    const equipment = selected.item;
    const issues = [
      ...(equipment.failures || []),
      ...(equipment.warnings || []),
      ...(equipment.geometryWarnings || [])
    ];

    mapInspectorEl.innerHTML = `
      <div class="haz-inspector-header">
        <span class="haz-inspector-kicker">Equipment marker</span>
        <h3>${escapeHtml(equipment.label || equipment.id)}</h3>
        <code>${escapeHtml(equipment.id)}</code>
      </div>
      <div class="haz-inspector-status-row">
        ${statusBadge(equipment.status)}
        <button type="button" class="haz-inspector-link" data-map-type="area" data-map-id="${escapeHtml(equipment.hazAreaId)}">${escapeHtml(equipment.hazAreaId || 'Unassigned')}</button>
      </div>
      <div class="haz-inspector-facts">
        ${renderInspectorFacts([
          ['Assigned area', equipment.hazAreaId || '-'],
          ['Position', `${roundLabel(equipment.position.xFt)} ft X, ${roundLabel(equipment.position.yFt)} ft Y`],
          ['Elevation', `${roundLabel(equipment.position.zFt)} ft`],
          ['Marker', equipment.marker],
          ['Issues', equipment.issueCount]
        ])}
      </div>
      <div class="haz-inspector-section">
        <h4>Issues</h4>
        ${renderIssueList(issues)}
      </div>`;
  }

  function applyLinkedSelection(model) {
    const areaById = new Map(model.areas.map(area => [area.id, area]));
    const equipmentById = new Map(model.equipment.map(item => [item.id, item]));

    document.querySelectorAll('.area-row').forEach((row) => {
      const id = row.querySelector('.area-id')?.value.trim();
      const area = areaById.get(id);
      row.dataset.mapId = id || '';
      row.classList.toggle('haz-linked-row--selected', isSelectedMapObject('area', id));
      row.style.setProperty('--haz-row-accent', area?.stroke || '#64748b');
      row.dataset.mapSeverity = area ? areaSeverityKey(area) : 'general';
      updateRowStatusPill(row, area ? area.severityLabel : 'Missing map ID', area ? areaSeverityKey(area) : 'general');
    });

    document.querySelectorAll('.equip-row').forEach((row) => {
      const id = row.querySelector('.equip-id')?.value.trim();
      const equipment = equipmentById.get(id);
      row.dataset.mapId = id || '';
      row.classList.toggle('haz-linked-row--selected', isSelectedMapObject('equipment', id));
      row.style.setProperty('--haz-row-accent', equipment?.color || '#64748b');
      row.dataset.mapStatus = equipment?.status || 'INFO';
      updateRowStatusPill(row, equipment ? equipment.status : 'Missing map ID', equipment ? mapStatusClass(equipment.status) : 'info');
    });
  }

  function updateRowStatusPill(row, label, variant) {
    const pill = row.querySelector('[data-role="map-status"]');
    if (!pill) return;
    pill.className = `haz-row-status-pill haz-row-status-pill--${variant}`;
    pill.textContent = label;
  }

  function clampMap(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function renderMapSvg(model) {
    const viewWidth = 1080;
    const viewHeight = 520;
    const projector = createIsoProjector(model.layout, viewWidth, viewHeight, mapView);
    const floor = [
      projector.project(0, 0, 0),
      projector.project(model.layout.widthFt, 0, 0),
      projector.project(model.layout.widthFt, model.layout.heightFt, 0),
      projector.project(0, model.layout.heightFt, 0)
    ];
    const gridLines = renderIsoGrid(model.layout, projector);
    const volumes = model.areas
      .map(area => renderClassifiedVolume(area, projector))
      .join('');
    const markers = model.equipment
      .map(item => renderEquipmentVolumeMarker(item, model.layout, projector))
      .join('');
    const emptyText = model.areas.length ? '' : `<text class="haz-map-empty" x="${viewWidth / 2}" y="${viewHeight / 2}" text-anchor="middle">Add classified areas to build a 3D volume map.</text>`;
    const svgViewBox = applyMapViewPan(mapSvgViewBox(model, projector, viewWidth, viewHeight));
    const bgBox = {
      x: svgViewBox.x - 24,
      y: svgViewBox.y - 24,
      width: svgViewBox.width + 48,
      height: svgViewBox.height + 48
    };

    mapCanvasEl.innerHTML = `
      <svg class="haz-map-svg" viewBox="${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.width} ${svgViewBox.height}" role="img" aria-labelledby="haz-map-svg-title haz-map-svg-desc">
        <title id="haz-map-svg-title">Hazardous area classified volume layout</title>
        <desc id="haz-map-svg-desc">Isometric classified volume schematic with floor footprint, vertical extent, and equipment elevation markers.</desc>
        <rect class="haz-map-bg" x="${bgBox.x}" y="${bgBox.y}" width="${bgBox.width}" height="${bgBox.height}"></rect>
        <text class="haz-map-view-title" x="58" y="44">3D classified volume schematic</text>
        ${renderMiniAxisWidget(svgViewBox)}
        <polygon class="haz-map-floor" points="${points(floor)}"></polygon>
        ${gridLines.join('')}
        ${renderIsoAxes(model.layout, projector)}
        ${volumes}
        ${markers}
        ${emptyText}
      </svg>`;

    mapCanvasEl.scrollLeft = 0;
    renderMapViewReadout();
  }

  function applyMapViewPan(viewBox) {
    return {
      ...viewBox,
      x: Number((viewBox.x - mapView.panX).toFixed(3)),
      y: Number((viewBox.y - mapView.panY).toFixed(3))
    };
  }

  function renderMapViewReadout() {
    if (!mapViewReadoutEl) return;
    const yaw = Math.round(mapView.yawDeg);
    const panX = Math.round(mapView.panX);
    const panY = Math.round(mapView.panY);
    mapViewReadoutEl.textContent = `${yaw}° / ${panX}, ${panY}`;
  }

  function mapSvgViewBox(model, projector, viewWidth, viewHeight) {
    const compact = window.matchMedia?.('(max-width: 760px)').matches;
    const bounds = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    };

    function includePoint(point, pad = 0) {
      bounds.minX = Math.min(bounds.minX, point.x - pad);
      bounds.minY = Math.min(bounds.minY, point.y - pad);
      bounds.maxX = Math.max(bounds.maxX, point.x + pad);
      bounds.maxY = Math.max(bounds.maxY, point.y + pad);
    }

    [
      projector.project(0, 0, 0),
      projector.project(model.layout.widthFt, 0, 0),
      projector.project(model.layout.widthFt, model.layout.heightFt, 0),
      projector.project(0, model.layout.heightFt, 0),
      projector.project(0, 0, model.layout.elevationFt)
    ].forEach(point => includePoint(point, 36));
    includePoint({ x: 58, y: 44 }, 72);

    for (const area of model.areas) {
      const geometry = area.geometry;
      if (geometry.shape === 'rect') {
        const x1 = geometry.xFt - (geometry.widthFt / 2);
        const x2 = geometry.xFt + (geometry.widthFt / 2);
        const y1 = geometry.yFt - (geometry.heightFt / 2);
        const y2 = geometry.yFt + (geometry.heightFt / 2);
        [
          projector.project(x1, y1, geometry.zMinFt),
          projector.project(x2, y1, geometry.zMinFt),
          projector.project(x2, y2, geometry.zMaxFt),
          projector.project(x1, y2, geometry.zMaxFt)
        ].forEach(point => includePoint(point, 110));
      } else {
        const midpoint = projector.project(geometry.xFt, geometry.yFt, (geometry.zMinFt + geometry.zMaxFt) / 2);
        const top = projector.project(geometry.xFt, geometry.yFt, geometry.zMaxFt);
        const bottom = projector.project(geometry.xFt, geometry.yFt, geometry.zMinFt);
        const radius = geometry.radiusFt * projector.scale;
        includePoint(midpoint, radius * 1.7);
        includePoint(top, radius * 1.2);
        includePoint(bottom, radius * 1.35);
      }
    }
    for (const item of model.equipment) {
      const point = projector.project(
        clampMap(item.position.xFt, 0, model.layout.widthFt),
        clampMap(item.position.yFt, 0, model.layout.heightFt),
        clampMap(item.position.zFt, 0, model.layout.elevationFt)
      );
      includePoint(point, 100);
    }

    if (!Number.isFinite(bounds.minX)) return { x: 0, y: 0, width: viewWidth, height: viewHeight };

    const padding = compact ? 42 : 50;
    let minX = bounds.minX - padding;
    let maxX = bounds.maxX + padding;
    let minY = bounds.minY - padding;
    let maxY = bounds.maxY + padding;
    const targetAspect = compact ? 1.22 : 2.28;
    let width = Math.max(compact ? 520 : 760, maxX - minX);
    let height = Math.max(compact ? 360 : 330, maxY - minY);
    const aspect = width / height;

    if (aspect > targetAspect) {
      const nextHeight = width / targetAspect;
      const delta = nextHeight - height;
      minY -= delta / 2;
      maxY += delta / 2;
      height = nextHeight;
    } else {
      const nextWidth = height * targetAspect;
      const delta = nextWidth - width;
      minX -= delta / 2;
      maxX += delta / 2;
      width = nextWidth;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    width = Math.min(width, viewWidth);
    height = Math.min(height, compact ? viewHeight : 480);
    let x = centerX - (width / 2);
    let y = centerY - (height / 2);
    if (!compact) {
      x = clampMap(x, 0, viewWidth - width);
      y = clampMap(y, 0, viewHeight - height);
    }

    return {
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      width: Number(width.toFixed(3)),
      height: Number(height.toFixed(3))
    };
  }

  function roundLabel(value) {
    return String(Number(value.toFixed(1)));
  }

  function createIsoProjector(layout, viewWidth, viewHeight, view = mapView) {
    const zExaggeration = 1.85;
    const yaw = (normalizeYaw(view.yawDeg || 0) * Math.PI) / 180;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const centerX = layout.widthFt / 2;
    const centerY = layout.heightFt / 2;
    const rotatedCorners = [
      rotateLayoutPoint(0, 0),
      rotateLayoutPoint(layout.widthFt, 0),
      rotateLayoutPoint(layout.widthFt, layout.heightFt),
      rotateLayoutPoint(0, layout.heightFt)
    ];
    const minRotX = Math.min(...rotatedCorners.map(point => point.x));
    const maxRotX = Math.max(...rotatedCorners.map(point => point.x));
    const minRotY = Math.min(...rotatedCorners.map(point => point.y));
    const maxRotY = Math.max(...rotatedCorners.map(point => point.y));
    const rotatedWidth = Math.max(1, maxRotX - minRotX);
    const rotatedHeight = Math.max(1, maxRotY - minRotY);
    const projectedWidth = rotatedWidth + (rotatedHeight * 0.44);
    const projectedHeight = (rotatedHeight * 0.34) + (layout.elevationFt * zExaggeration);
    const topMargin = 72;
    const bottomMargin = 52;
    const scale = Math.min((viewWidth - 150) / projectedWidth, (viewHeight - topMargin - bottomMargin) / projectedHeight);
    const xScale = scale;
    const ySkew = scale * 0.44;
    const yScale = scale * 0.34;
    const zScale = scale * zExaggeration;
    const floorWidth = (rotatedWidth * xScale) + (rotatedHeight * ySkew);
    const totalHeight = (rotatedHeight * yScale) + (layout.elevationFt * zScale);
    const originX = (viewWidth - floorWidth) / 2;
    const originY = topMargin + totalHeight;

    function rotateLayoutPoint(xFt, yFt) {
      const dx = xFt - centerX;
      const dy = yFt - centerY;
      return {
        x: (dx * cosYaw) - (dy * sinYaw),
        y: (dx * sinYaw) + (dy * cosYaw)
      };
    }

    return {
      scale,
      xScale,
      ySkew,
      yScale,
      zScale,
      originX,
      originY,
      project(xFt, yFt, zFt = 0) {
        const rotated = rotateLayoutPoint(xFt, yFt);
        const normalizedX = rotated.x - minRotX;
        const normalizedY = rotated.y - minRotY;
        return {
          x: originX + (normalizedX * xScale) + (normalizedY * ySkew),
          y: originY - (normalizedY * yScale) - (zFt * zScale)
        };
      }
    };
  }

  function points(items) {
    return items.map(point => `${point.x},${point.y}`).join(' ');
  }

  function renderIsoGrid(layout, projector) {
    const gridLines = [];
    for (let x = 0; x <= layout.widthFt + 0.001; x += layout.gridFt) {
      const a = projector.project(x, 0, 0);
      const b = projector.project(x, layout.heightFt, 0);
      gridLines.push(`<line class="haz-map-iso-grid" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`);
      gridLines.push(`<text class="haz-map-axis-label" x="${a.x}" y="${a.y + 18}" text-anchor="middle">${roundLabel(x)}</text>`);
    }
    for (let y = 0; y <= layout.heightFt + 0.001; y += layout.gridFt) {
      const a = projector.project(0, y, 0);
      const b = projector.project(layout.widthFt, y, 0);
      gridLines.push(`<line class="haz-map-iso-grid" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`);
      gridLines.push(`<text class="haz-map-axis-label" x="${a.x - 10}" y="${a.y + 4}" text-anchor="end">${roundLabel(y)}</text>`);
    }
    return gridLines;
  }

  function renderIsoAxes(layout, projector) {
    const origin = projector.project(0, 0, 0);
    const xEnd = projector.project(layout.widthFt, 0, 0);
    const yEnd = projector.project(0, layout.heightFt, 0);
    const zEnd = projector.project(0, 0, layout.elevationFt);
    return `
      <g class="haz-map-axes">
        <line x1="${origin.x}" y1="${origin.y}" x2="${xEnd.x + 28}" y2="${xEnd.y}"></line>
        <line x1="${origin.x}" y1="${origin.y}" x2="${yEnd.x - 12}" y2="${yEnd.y - 10}"></line>
        <line x1="${origin.x}" y1="${origin.y}" x2="${zEnd.x}" y2="${zEnd.y - 22}"></line>
        <text x="${xEnd.x + 34}" y="${xEnd.y + 4}">X</text>
        <text x="${yEnd.x - 22}" y="${yEnd.y - 14}">Y</text>
        <text x="${zEnd.x - 5}" y="${zEnd.y - 30}">Z ${roundLabel(layout.elevationFt)} ft</text>
      </g>`;
  }

  function renderMiniAxisWidget(viewBox) {
    const yaw = (normalizeYaw(mapView.yawDeg || 0) * Math.PI) / 180;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const center = {
      x: viewBox.x + viewBox.width - 82,
      y: viewBox.y + viewBox.height - 54
    };

    function vector(xFt, yFt, zFt = 0) {
      const rotatedX = (xFt * cosYaw) - (yFt * sinYaw);
      const rotatedY = (xFt * sinYaw) + (yFt * cosYaw);
      return {
        x: center.x + (rotatedX * 32) + (rotatedY * 15),
        y: center.y - (rotatedY * 12) - (zFt * 34)
      };
    }

    const xEnd = vector(1, 0, 0);
    const yEnd = vector(0, 1, 0);
    const zEnd = vector(0, 0, 1);

    return `
      <g class="haz-map-mini-axis" aria-hidden="true">
        <rect x="${center.x - 50}" y="${center.y - 62}" width="104" height="92" rx="10"></rect>
        <line class="haz-map-mini-axis__x" x1="${center.x}" y1="${center.y}" x2="${xEnd.x}" y2="${xEnd.y}"></line>
        <line class="haz-map-mini-axis__y" x1="${center.x}" y1="${center.y}" x2="${yEnd.x}" y2="${yEnd.y}"></line>
        <line class="haz-map-mini-axis__z" x1="${center.x}" y1="${center.y}" x2="${zEnd.x}" y2="${zEnd.y}"></line>
        <circle cx="${center.x}" cy="${center.y}" r="3"></circle>
        <text x="${xEnd.x + 6}" y="${xEnd.y + 4}">X</text>
        <text x="${yEnd.x + 6}" y="${yEnd.y + 4}">Y</text>
        <text x="${zEnd.x - 4}" y="${zEnd.y - 8}">Z</text>
      </g>`;
  }

  function renderClassifiedVolume(area, projector) {
    const geometry = area.geometry;
    if (geometry.shape === 'rect') {
      return renderRectVolume(area, projector);
    }
    return renderSphericalVolume(area, projector);
  }

  function renderSphericalVolume(area, projector) {
    const geometry = area.geometry;
    const bottom = projector.project(geometry.xFt, geometry.yFt, geometry.zMinFt);
    const mid = projector.project(geometry.xFt, geometry.yFt, (geometry.zMinFt + geometry.zMaxFt) / 2);
    const top = projector.project(geometry.xFt, geometry.yFt, geometry.zMaxFt);
    const radiusX = geometry.radiusFt * projector.scale;
    const radiusY = Math.max(8, geometry.radiusFt * projector.yScale);
    const heightPx = Math.max(12, (geometry.zMaxFt - geometry.zMinFt) * projector.zScale);
    const shellRy = Math.max(heightPx / 2, radiusY * 2.4);
    const labelRight = mid.x < 840;
    const labelX = labelRight ? mid.x + radiusX + 26 : mid.x - radiusX - 26;
    const labelY = Math.max(38, top.y + 10);
    const anchor = labelRight ? 'start' : 'end';
    const labelLineEndX = labelRight ? labelX - 8 : labelX + 8;
    const selectedClass = isSelectedMapObject('area', area.id) ? ' is-selected' : '';

    return `
      <g class="haz-volume-group haz-volume-group--sphere${selectedClass}" data-map-type="area" data-map-id="${escapeHtml(area.id)}" role="button" tabindex="0" aria-label="Select classified area ${escapeHtml(area.id)}">
        <ellipse class="haz-volume-footprint" cx="${bottom.x}" cy="${bottom.y}" rx="${radiusX}" ry="${radiusY}" fill="${area.fill}" stroke="${area.stroke}"></ellipse>
        <line class="haz-volume-centerline" x1="${bottom.x}" y1="${bottom.y}" x2="${top.x}" y2="${top.y}"></line>
        <ellipse class="haz-volume-shell" cx="${mid.x}" cy="${mid.y}" rx="${radiusX}" ry="${shellRy}" fill="${area.fill}" stroke="${area.stroke}"></ellipse>
        <ellipse class="haz-volume-latitude" cx="${mid.x}" cy="${mid.y}" rx="${radiusX * 0.82}" ry="${radiusY * 0.72}" stroke="${area.stroke}"></ellipse>
        <ellipse class="haz-volume-latitude haz-volume-latitude--bottom" cx="${bottom.x}" cy="${bottom.y}" rx="${radiusX * 0.92}" ry="${radiusY * 0.62}" stroke="${area.stroke}"></ellipse>
        <ellipse class="haz-volume-latitude haz-volume-latitude--top" cx="${top.x}" cy="${top.y}" rx="${radiusX * 0.56}" ry="${radiusY * 0.42}" stroke="${area.stroke}"></ellipse>
        <line class="haz-volume-label-leader" x1="${top.x}" y1="${top.y}" x2="${labelLineEndX}" y2="${labelY - 6}"></line>
        <text class="haz-volume-label" x="${labelX}" y="${labelY}" text-anchor="${anchor}">
          <tspan>${escapeHtml(area.id)}</tspan>
          <tspan x="${labelX}" dy="14">${escapeHtml(area.designation)}</tspan>
          <tspan x="${labelX}" dy="14">${escapeHtml(`${roundLabel(geometry.zMinFt)}-${roundLabel(geometry.zMaxFt)} ft elev.`)}</tspan>
        </text>
      </g>`;
  }

  function renderRectVolume(area, projector) {
    const geometry = area.geometry;
    const x1 = geometry.xFt - (geometry.widthFt / 2);
    const x2 = geometry.xFt + (geometry.widthFt / 2);
    const y1 = geometry.yFt - (geometry.heightFt / 2);
    const y2 = geometry.yFt + (geometry.heightFt / 2);
    const z1 = geometry.zMinFt;
    const z2 = geometry.zMaxFt;
    const bottom = [
      projector.project(x1, y1, z1),
      projector.project(x2, y1, z1),
      projector.project(x2, y2, z1),
      projector.project(x1, y2, z1)
    ];
    const top = [
      projector.project(x1, y1, z2),
      projector.project(x2, y1, z2),
      projector.project(x2, y2, z2),
      projector.project(x1, y2, z2)
    ];
    const label = projector.project(geometry.xFt, geometry.yFt, z2);
    const labelRight = label.x < 840;
    const labelX = labelRight ? label.x + 72 : label.x - 72;
    const labelY = Math.max(38, label.y + 8);
    const anchor = labelRight ? 'start' : 'end';
    const selectedClass = isSelectedMapObject('area', area.id) ? ' is-selected' : '';

    return `
      <g class="haz-volume-group haz-volume-group--box${selectedClass}" data-map-type="area" data-map-id="${escapeHtml(area.id)}" role="button" tabindex="0" aria-label="Select classified area ${escapeHtml(area.id)}">
        <polygon class="haz-volume-footprint" points="${points(bottom)}" fill="${area.fill}" stroke="${area.stroke}"></polygon>
        <polygon class="haz-volume-face" points="${points([bottom[0], bottom[1], top[1], top[0]])}" fill="${area.fill}" stroke="${area.stroke}"></polygon>
        <polygon class="haz-volume-face haz-volume-face--side" points="${points([bottom[1], bottom[2], top[2], top[1]])}" fill="${area.fill}" stroke="${area.stroke}"></polygon>
        <polygon class="haz-volume-face haz-volume-face--top" points="${points(top)}" fill="${area.fill}" stroke="${area.stroke}"></polygon>
        <line class="haz-volume-label-leader" x1="${label.x}" y1="${label.y}" x2="${labelRight ? labelX - 8 : labelX + 8}" y2="${labelY - 6}"></line>
        <text class="haz-volume-label" x="${labelX}" y="${labelY}" text-anchor="${anchor}">
          <tspan>${escapeHtml(area.id)}</tspan>
          <tspan x="${labelX}" dy="14">${escapeHtml(area.designation)}</tspan>
          <tspan x="${labelX}" dy="14">${escapeHtml(`${roundLabel(z1)}-${roundLabel(z2)} ft elev.`)}</tspan>
        </text>
      </g>`;
  }

  function renderEquipmentVolumeMarker(item, layout, projector) {
    const xFt = clampMap(item.position.xFt, 0, layout.widthFt);
    const yFt = clampMap(item.position.yFt, 0, layout.heightFt);
    const zFt = clampMap(item.position.zFt, 0, layout.elevationFt);
    const point = projector.project(xFt, yFt, zFt);
    const floor = projector.project(xFt, yFt, 0);
    const cx = point.x;
    const cy = point.y;
    const size = 10;
    let marker = '';

    if (item.marker === 'diamond') {
      marker = `<polygon points="${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}" fill="${item.color}"></polygon>`;
    } else if (item.marker === 'triangle') {
      marker = `<polygon points="${cx},${cy - size - 1} ${cx + size + 1},${cy + size} ${cx - size - 1},${cy + size}" fill="${item.color}"></polygon>`;
    } else if (item.marker === 'square') {
      marker = `<rect x="${cx - 8}" y="${cy - 8}" width="16" height="16" rx="3" fill="${item.color}"></rect>`;
    } else {
      marker = `<circle cx="${cx}" cy="${cy}" r="8" fill="${item.color}"></circle>`;
    }
    const selectedClass = isSelectedMapObject('equipment', item.id) ? ' is-selected' : '';

    return `
      <g class="haz-equip-marker haz-equip-marker--${item.status.toLowerCase()}${selectedClass}" data-map-type="equipment" data-map-id="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="Select equipment ${escapeHtml(item.id)}">
        <title>${escapeHtml(item.id)} ${escapeHtml(item.status)}</title>
        <line class="haz-equip-leader" x1="${floor.x}" y1="${floor.y}" x2="${cx}" y2="${cy}"></line>
        <rect class="haz-equip-hit-target" x="${cx - 18}" y="${cy - 20}" width="72" height="40" rx="8"></rect>
        ${marker}
        <text class="haz-equip-label" x="${cx + 13}" y="${cy + 4}">${escapeHtml(item.id)}</text>
      </g>`;
  }

  function renderMapLegend(model) {
    const legendItems = model.legend.map((item) => {
      const swatch = item.fill
        ? `<span class="haz-map-legend-swatch" style="background:${item.fill}; border-color:${item.stroke}"></span>`
        : `<span class="haz-map-legend-marker haz-map-legend-marker--${item.marker}" style="background:${item.color}"></span>`;
      return `<span class="haz-map-legend-item">${swatch}${escapeHtml(item.label)}</span>`;
    }).join('');
    const warnings = model.equipment
      .filter(item => item.geometryWarnings.length)
      .map(item => `<li><code>${escapeHtml(item.id)}</code>: ${item.geometryWarnings.map(warning => escapeHtml(warning)).join(' ')}</li>`)
      .join('');

    mapLegendEl.innerHTML = `
      <div class="haz-map-legend-items">${legendItems}</div>
      ${warnings ? `<ul class="compact-list haz-map-warning-list">${warnings}</ul>` : ''}`;
  }

  function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const saved = getStudies().hazAreaClassification;
    if (!saved) return;

    const inputs = saved._inputs || {};
    const layout = normalizeHazAreaLayout(inputs.layout || {});
    const inputAreas = new Map((inputs.areas || []).map(area => [area.id, area]));
    const inputEquipment = new Map((inputs.equipment || []).map(item => [item.id, item]));
    const mapEquipment = new Map((saved.mapModel?.equipment || []).map(item => [item.id, item]));
    const mapAreas = new Map((saved.mapModel?.areas || []).map(area => [area.id, area]));

    const layoutLines = [
      'Layout Field,Value',
      ['Width Ft', layout.widthFt].map(csvCell).join(','),
      ['Height Ft', layout.heightFt].map(csvCell).join(','),
      ['Grid Ft', layout.gridFt].map(csvCell).join(','),
      ['Vertical Limit Ft', layout.elevationFt].map(csvCell).join(','),
      ''
    ];
    const areaLines = [
      'Area ID,Label,Standard,Designation,Gas/Dust Group,T-Rating,Equipment Count,Status,Shape,Center X Ft,Center Y Ft,Radius Ft,Width Ft,Height Ft,Bottom Elevation Ft,Top Elevation Ft',
      ...(saved.areas || []).map((area) => {
        const inputArea = inputAreas.get(area.id) || {};
        const geometry = inputArea.geometry || mapAreas.get(area.id)?.geometry || {};
        return [
          area.id,
          area.label,
          area.standard,
          area.designation,
          area.gasGroup,
          area.tRating,
          area.equipCount,
          area.status,
          geometry.shape,
          geometry.xFt,
          geometry.yFt,
          geometry.radiusFt,
          geometry.widthFt,
          geometry.heightFt,
          geometry.zMinFt,
          geometry.zMaxFt
        ].map(csvCell).join(',');
      }),
    ];

    const equipLines = [
      '',
      'Equipment ID,Label,Area,Status,Map X Ft,Map Y Ft,Elevation Ft,Issues',
      ...(saved.equipment || []).map((row) => {
        const mapped = mapEquipment.get(row.equipId);
        const inputItem = inputEquipment.get(row.equipId) || {};
        const status = mapped ? mapped.status : row.pass === null ? 'WARN' : row.pass ? 'PASS' : 'FAIL';
        const issues = [
          ...(row.failures || []),
          ...(row.warnings || []),
          ...(mapped?.geometryWarnings || [])
        ].join('; ');
        return [
          row.equipId,
          row.label,
          row.areaId,
          status,
          inputItem.xFt ?? mapped?.position?.xFt,
          inputItem.yFt ?? mapped?.position?.yFt,
          inputItem.zFt ?? mapped?.position?.zFt,
          issues
        ].map(csvCell).join(',');
      }),
    ];

    const csv = [...layoutLines, ...areaLines, ...equipLines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'haz-area-classification.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function restoreState(inputs) {
    if (!inputs) return;
    setLayoutInputs(inputs.layout);
    areasContainer.innerHTML = '';
    equipmentContainer.innerHTML = '';
    areaCount = 0;
    equipCount = 0;
    for (const area of (inputs.areas || [])) addAreaRow(area);
    for (const equipment of (inputs.equipment || [])) addEquipRow(equipment);
  }
});
