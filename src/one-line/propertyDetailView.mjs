import { createVirtualNodePropertyRenderer } from './virtualNodePropertyView.mjs';
import { classifyPropertyTarget, partitionPropertyFields } from './propertySectionModel.mjs';

export function createPropertyDetailRenderer(context) {
  const {
    Element,
    FormData,
    URLSearchParams,
    activeSheet,
    applyPropertyFieldFromForm,
    cablePropertyMetadata,
    calculateTransformerImpedance,
    closeModal,
    compatibleProtectiveDevices,
    componentProtectionKind,
    components: initialComponents,
    computeTransformerBaseKV,
    connections: initialConnections,
    defaultHarmonicProfileId,
    defaultShapeProps,
    deriveTransformerBaseKV,
    documentRef: document,
    editCableComponent,
    ensureShapeDefaults,
    escapeHtml,
    estimateVoltageHarmonicPoints,
    findHarmonicProfileById,
    findHarmonicProfileBySpectrum,
    formatAttributeLabel,
    formatHarmonicMetric,
    formatOperatingVoltage,
    formatPropertyFieldLabel,
    formatPropertyNumber,
    getCableForConnection,
    getCables,
    getCategory,
    getComponentListLabel,
    getEquipment,
    getHarmonicProfileOptions,
    getImpedancePart,
    getLoads,
    getManufacturerModels,
    getNestedComponentValue,
    getPanels,
    harmonicThdPercent,
    hasImpedance,
    impedanceFieldNameSet,
    inferSchemaFromProps,
    isComponentPropertiesLocked,
    isConductorSegmentComponent,
    isPhysicalPropertyField,
    isSourceComponent,
    manualHarmonicProfileId,
    manufacturerDefaults,
    manufacturerOptions,
    markScheduleReconcilePending,
    modal,
    normalizeComponentElectricalProperties,
    normalizePropertySchema,
    normalizeVoltageToVolts,
    parseHarmonicSpectrumPoints,
    parsePropertyNumber,
    promptDialog,
    propertyContainer,
    propertyHeading,
    propSchemas,
    protectiveDevices,
    pushHistory,
    readPropertyValue,
    render,
    renderTemplates,
    resolveComponentMeta,
    resolveTransformerKva,
    resolveTransformerPercentZ,
    resolveTransformerXrRatio,
    save,
    saveCustomHarmonicProfile,
    saveTemplates,
    selectComponent,
    setActiveComponent,
    setComponents,
    setConnections,
    setImpedancePart,
    setSelectedConnection,
    sheets,
    showToast,
    studyInputFieldNameSet,
    syncSourceVoltageFields,
    templates,
    thermalRatings,
    toBaseKV,
    transformerConnectionOptions,
    voltageClasses,
    window,
    zoomToComponentNeighborhood
  } = context;
  let components = initialComponents;
  let connections = initialConnections;
  const renderNodeProperties = createVirtualNodePropertyRenderer({
    documentRef: document,
    propertyContainer,
    propertyHeading,
    getComponentListLabel,
    getComponents: () => components,
    getActiveSheet: () => sheets[activeSheet],
    setConnections: nextConnections => {
      connections = nextConnections;
      setConnections(nextConnections);
    },
    setActiveComponent,
    pushHistory,
    render,
    save,
    showToast,
    closeModal,
    selectComponent
  });
  function renderPropertiesFor(targetComp) {
    propertyContainer.innerHTML = '';
    propertyContainer.classList.remove('prop-property-container-form');
    modal._applyChanges = null;
    if (!targetComp) {
      propertyHeading.textContent = 'Properties';
      const empty = document.createElement('p');
      empty.className = 'prop-property-empty view-modal-empty';
      empty.textContent = 'Select a device to view its properties.';
      propertyContainer.appendChild(empty);
      return;
    }

    if (targetComp.isVirtualNode) {
      renderNodeProperties(targetComp);
      return;
    }

    if (isConductorSegmentComponent(targetComp) && (!targetComp.cable || typeof targetComp.cable !== 'object')) {
      targetComp.cable = {};
    }

    propertyHeading.textContent = `${getComponentListLabel(targetComp)} Properties`;

    let rawSchema = propSchemas[targetComp.subtype] || [];
    if (!rawSchema.length) {
      const metaProps = resolveComponentMeta(targetComp)?.props || {};
      rawSchema = inferSchemaFromProps({ ...metaProps, ...(targetComp.props || {}) });
    }
    const {
      isMotorStudyComponent,
      isStaticLoadComponent,
      isTransformerComponent,
      isSourceCategoryComponent,
      shouldApplyMotorDerivations
    } = classifyPropertyTarget(targetComp, rawSchema, isSourceComponent);
    const motorInputMap = new Map();
    const staticInputMap = isStaticLoadComponent ? new Map() : null;
    const transformerInputMap = isTransformerComponent ? new Map() : null;
    const transformerCustomBadges = isTransformerComponent ? new Map() : null;
    const sourceInputMap = isSourceCategoryComponent ? new Map() : null;
    const sourceCustomBadges = isSourceCategoryComponent ? new Map() : null;
    const motorCalculatedFields = new Set([
      'load_kw',
      'load_kvar',
      'impedance_r',
      'impedance_x'
    ]);
    const staticCalculatedFields = isStaticLoadComponent
      ? new Set(['load_kw', 'load_kvar', 'baseKV', 'kV', 'kv', 'prefault_voltage'])
      : null;
    const staticManualFields = isStaticLoadComponent
      ? new Set(['watts', 'kva', 'pf', 'power_factor', 'volts', 'voltage'])
      : null;
    const transformerCalculatedFields = new Set(['impedance_r', 'impedance_x']);
    const transformerAutoFieldNames = new Set(['baseKV', 'kV', 'kv', 'prefault_voltage']);
    const sourceCalculatedFields = new Set(['thevenin_mva']);
    const sourceAutoFieldNames = new Set(['baseKV', 'kV', 'kv', 'prefault_voltage']);

    const parseNumericValue = parsePropertyNumber;
    const readComponentValue = name => readPropertyValue(targetComp, name);
    const formatNumber = formatPropertyNumber;

    const schema = normalizePropertySchema({
      rawSchema,
      targetComponent: targetComp,
      isMotorStudyComponent,
      isConductorSegment: isConductorSegmentComponent(targetComp),
      voltageClasses,
      thermalRatings,
      manufacturerOptions,
      getManufacturerModels,
      transformerConnectionOptions,
      cablePropertyMetadata,
      getHarmonicProfileOptions
    });
    let baseFields;
    if (isConductorSegmentComponent(targetComp)) {
      baseFields = [
        { name: 'label', label: 'Label', type: 'text' },
        { name: 'ref', label: 'Ref ID', type: 'text' },
        {
          name: 'cable_rating',
          label: 'Cable Rating (V)',
          type: 'number',
          getValue: comp => comp.cable?.cable_rating ?? '',
          setValue: (comp, rawValue) => {
            if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
            const trimmed = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            if (trimmed === '' || trimmed === null || trimmed === undefined) {
              delete comp.cable.cable_rating;
              return;
            }
            const num = Number(trimmed);
            comp.cable.cable_rating = Number.isFinite(num) ? num : trimmed;
          }
        },
        {
          name: 'cable_impedance_r',
          label: 'Impedance R (Ω)',
          type: 'number',
          getValue: comp => getImpedancePart(comp.cable, 'r'),
          setValue: (comp, value) => {
            if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
            setImpedancePart(comp.cable, 'r', value, { keepEmpty: false });
          }
        },
        {
          name: 'cable_impedance_x',
          label: 'Impedance X (Ω)',
          type: 'number',
          getValue: comp => getImpedancePart(comp.cable, 'x'),
          setValue: (comp, value) => {
            if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
            setImpedancePart(comp.cable, 'x', value, { keepEmpty: false });
          }
        }
      ];
    } else if (targetComp.type === 'annotation') {
      const isShapeAnnotation = targetComp.subtype === 'annotation_custom_shape';
      baseFields = [
        { name: 'label', label: 'Label', type: 'text' },
        {
          name: 'width',
          label: 'Width (px)',
          type: 'number',
          help: isShapeAnnotation ? 'For circles width controls the diameter.' : undefined
        },
        {
          name: 'height',
          label: 'Height (px)',
          type: 'number',
          help: isShapeAnnotation ? 'Circles keep height equal to width.' : undefined
        }
      ];
      if (isShapeAnnotation) {
        baseFields.push(
          {
            name: 'shapeType',
            label: 'Shape Type',
            type: 'select',
            options: [
              { value: 'rectangle', label: 'Rectangle' },
              { value: 'rounded', label: 'Rounded Rectangle' },
              { value: 'circle', label: 'Circle' }
            ]
          },
          {
            name: 'strokeStyle',
            label: 'Line Style',
            type: 'select',
            options: [
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' }
            ]
          },
          {
            name: 'strokeWidth',
            label: 'Line Weight',
            type: 'number'
          },
          {
            name: 'strokeColor',
            label: 'Line Color',
            type: 'color'
          },
          {
            name: 'fillColor',
            label: 'Fill Color',
            type: 'color',
            getValue: comp => {
              const raw = comp.fillColor || comp.props?.fillColor || defaultShapeProps.fillColor;
              return raw && raw !== 'none' ? raw : defaultShapeProps.fillColor;
            }
          },
          {
            name: 'fillOpacity',
            label: 'Fill Opacity',
            type: 'number',
            help: '0 = transparent, 1 = opaque.',
            min: 0,
            max: 1,
            step: 0.05,
            getValue: comp => {
              const value = comp.fillOpacity ?? comp.props?.fillOpacity ?? defaultShapeProps.fillOpacity;
              const numeric = Number(value);
              if (Number.isFinite(numeric)) return numeric;
              const fallback = Number(defaultShapeProps.fillOpacity);
              return Number.isFinite(fallback) ? fallback : 1;
            }
          },
          {
            name: 'cornerRadius',
            label: 'Corner Radius',
            type: 'number',
            help: 'Applied to rounded rectangles.'
          }
        );
      }
    } else {
      baseFields = [
        { name: 'label', label: 'Label', type: 'text' },
        { name: 'ref', label: 'Ref ID', type: 'text' },
        {
          name: 'enclosure',
          label: 'Enclosure',
          type: 'select',
          options: [
            { value: 'box', label: 'Box / enclosed' },
            { value: 'open', label: 'Open air' },
            { value: 'NEMA 1', label: 'NEMA 1' },
            { value: 'NEMA 3R', label: 'NEMA 3R' },
            { value: 'NEMA 4', label: 'NEMA 4' },
            { value: 'NEMA 4X', label: 'NEMA 4X' }
          ]
        },
        { name: 'gap', label: 'Electrode Gap (mm)', type: 'number' },
        { name: 'working_distance', label: 'Working Distance (mm)', type: 'number' },
        { name: 'clearing_time', label: 'Clearing Time (s)', type: 'number' }
      ];

      if (isMotorStudyComponent) {
        baseFields = baseFields.filter(
          f => !['conductor_type', 'cable_assembly', 'breaker_frame', 'conductor_assembly'].includes(f.name)
        );
      }

      if (hasImpedance(targetComp)) {
        baseFields = baseFields.concat([
          {
            name: 'impedance_r',
            label: 'Impedance R (Ω)',
            type: 'number',
            getValue: comp => getImpedancePart(comp, 'r'),
            setValue: (comp, value) => setImpedancePart(comp, 'r', value, { keepEmpty: true })
          },
          {
            name: 'impedance_x',
            label: 'Impedance X (Ω)',
            type: 'number',
            getValue: comp => getImpedancePart(comp, 'x'),
            setValue: (comp, value) => setImpedancePart(comp, 'x', value, { keepEmpty: true })
          }
        ]);
      }
    }

    let manufacturerInput = null;
    let modelInput = null;
    let tccInput = null;
    let harmonicProfileInput = null;
    let harmonicSpectrumInput = null;

    const form = document.createElement('form');
    form.id = 'prop-form';
    form.className = 'prop-detail-form';
    let hasApplied = false;

    const buildField = (f, container) => {
      const lbl = document.createElement('label');
      const labelHeader = document.createElement('span');
      labelHeader.className = 'prop-field-label';
      const labelName = document.createElement('span');
      labelName.className = 'prop-field-name';
      labelName.textContent = formatPropertyFieldLabel(f.label, formatAttributeLabel(f.name) || f.name);
      labelHeader.appendChild(labelName);
      const requiredBadge = document.createElement('span');
      requiredBadge.className = `prop-field-badge ${f.required ? 'prop-field-badge-required' : 'prop-field-badge-optional'}`;
      requiredBadge.textContent = f.required ? 'Required' : 'Optional';
      labelHeader.appendChild(requiredBadge);
      let input;
      const defVal = manufacturerDefaults[targetComp.subtype]?.[f.name] || '';
      let curVal;
      if (typeof f.getValue === 'function') {
        curVal = f.getValue(targetComp);
      } else if (targetComp[f.name] !== undefined && targetComp[f.name] !== '') {
        curVal = targetComp[f.name];
      } else if (
        targetComp.props
        && typeof targetComp.props === 'object'
        && Object.prototype.hasOwnProperty.call(targetComp.props, f.name)
        && targetComp.props[f.name] !== ''
      ) {
        curVal = targetComp.props[f.name];
      } else {
        curVal = defVal;
      }
      if (f.type === 'select') {
        input = document.createElement('select');
        const selectOptions = typeof f.options === 'function' ? f.options(targetComp, f) : f.options;
        (selectOptions || []).forEach(opt => {
          const optionValue = typeof opt === 'object' ? opt.value ?? opt.label ?? '' : opt;
          const optionLabel = typeof opt === 'object' ? opt.label ?? opt.value ?? '' : opt;
          const o = document.createElement('option');
          o.value = optionValue;
          o.textContent = optionLabel;
          if ((curVal ?? '') == optionValue) o.selected = true;
          input.appendChild(o);
        });
      } else if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.value = curVal ?? '';
        if (f.rows) input.rows = f.rows;
        input.spellcheck = false;
      } else if (f.type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!curVal;
      } else {
        input = document.createElement('input');
        input.type = f.type || 'text';
        if (f.type === 'number') {
          input.step = f.step !== undefined ? String(f.step) : 'any';
          if (f.min !== undefined) input.min = String(f.min);
          if (f.max !== undefined) input.max = String(f.max);
        }
        input.value = curVal ?? '';
      }
      input.name = f.name;
      if (f.required) input.required = true;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.name === 'manufacturer') manufacturerInput = input;
      if (f.name === 'model') modelInput = input;
      if (f.name === 'tccId') tccInput = input;
      if (f.name === 'harmonicProfileId' || f.name === 'harmonic_profile_id') harmonicProfileInput = input;
      if (f.name === 'harmonics' || f.name === 'harmonic_spectrum') harmonicSpectrumInput = input;
      if (shouldApplyMotorDerivations) {
        motorInputMap.set(f.name, input);
      }
      if (isStaticLoadComponent && staticInputMap) {
        staticInputMap.set(f.name, input);
      }
      if (isTransformerComponent && transformerInputMap) {
        transformerInputMap.set(f.name, input);
      }
      if (isSourceCategoryComponent && sourceInputMap) {
        sourceInputMap.set(f.name, input);
      }
      const isMotorCalculatedField = shouldApplyMotorDerivations && motorCalculatedFields.has(f.name);
      const isStaticCalculatedField = isStaticLoadComponent && staticCalculatedFields?.has(f.name);
      const isTransformerCalculatedField = isTransformerComponent && transformerCalculatedFields.has(f.name);
      const isSourceCalculatedField = isSourceCategoryComponent && sourceCalculatedFields.has(f.name);
      const isStaticManualField = isStaticLoadComponent && staticManualFields?.has(f.name);
      if (isStaticManualField) {
        const badge = document.createElement('span');
        badge.className = 'prop-field-badge prop-field-badge-manual';
        badge.textContent = 'Input';
        labelHeader.appendChild(badge);
      }
      if (isMotorCalculatedField || isStaticCalculatedField || isTransformerCalculatedField || isSourceCalculatedField) {
        lbl.classList.add('prop-field-calculated');
        input.classList.add('prop-input-calculated');
        input.readOnly = true;
        input.setAttribute('aria-readonly', 'true');
        const badge = document.createElement('span');
        badge.className = 'prop-field-badge prop-field-badge-calculated';
        badge.textContent = 'Calculated';
        labelHeader.appendChild(badge);
      }
      if (isTransformerComponent && transformerAutoFieldNames.has(f.name) && transformerCustomBadges) {
        const customBadge = document.createElement('span');
        customBadge.className = 'prop-field-badge prop-field-badge-custom';
        customBadge.textContent = 'Custom';
        customBadge.hidden = true;
        labelHeader.appendChild(customBadge);
        transformerCustomBadges.set(f.name, { badge: customBadge, input });
      }
      if (isSourceCategoryComponent && sourceAutoFieldNames.has(f.name) && sourceCustomBadges) {
        const customBadge = document.createElement('span');
        customBadge.className = 'prop-field-badge prop-field-badge-custom';
        customBadge.textContent = 'Custom';
        customBadge.hidden = true;
        labelHeader.appendChild(customBadge);
        sourceCustomBadges.set(f.name, { badge: customBadge, input });
      }
      if (f.help) {
        const helpBtn = document.createElement('button');
        helpBtn.type = 'button';
        helpBtn.className = 'prop-help-btn';
        helpBtn.title = f.help;
        helpBtn.setAttribute('aria-label', f.help);
        helpBtn.textContent = '?';
        labelHeader.appendChild(helpBtn);
      }
      lbl.appendChild(labelHeader);
      lbl.appendChild(input);
      container.appendChild(lbl);
    };

    const applyFieldFromForm = applyPropertyFieldFromForm;

    let fields = [...baseFields, ...schema];
    const seenFieldNames = new Set();
    fields = fields.filter(field => {
      if (!field || !field.name) return true;
      if (seenFieldNames.has(field.name)) return false;
      seenFieldNames.add(field.name);
      return true;
    });
    if (isMotorStudyComponent) {
      fields = fields.filter(
        f => !['conductor_type', 'cable_assembly', 'breaker_frame', 'conductor_assembly'].includes(f.name)
      );
    }

    const compatibleTccDevices = compatibleProtectiveDevices(protectiveDevices, targetComp);
    const shouldShowTccField = targetComp.type !== 'cable' && componentProtectionKind(targetComp) !== null;

    if (shouldShowTccField) {
      const tccOptions = [
        { value: '', label: '--Select Device--' },
        ...compatibleTccDevices.map(dev => ({ value: dev.id, label: dev.name }))
      ];
      fields.push({
        name: 'tccId',
        label: 'TCC Device',
        type: 'select',
        options: tccOptions,
        getValue: comp => comp.tccId || '',
        setValue: (comp, value) => {
          comp.tccId = value || '';
        },
        help: compatibleTccDevices.length
          ? 'Only device families compatible with this component type and voltage class are shown.'
          : 'No compatible protective-device records are available for this component type and voltage class.'
      });
    }

    const makeScheduleLinkOptions = records => {
      const seen = new Set();
      const options = [{ value: '', label: '--None--' }];
      (Array.isArray(records) ? records : []).forEach(record => {
        const value = String(record?.ref || record?.id || record?.tag || record?.cable_id || record?.cableId || '').trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        const description = record?.description || record?.name || record?.loadType || '';
        options.push({
          value,
          label: description ? `${value} - ${description}` : value
        });
      });
      return options;
    };

    const setScheduleLink = (comp, key, directKey, value) => {
      if (!comp.scheduleLinks || typeof comp.scheduleLinks !== 'object') comp.scheduleLinks = {};
      const nextValue = String(value || '').trim();
      if (nextValue) {
        comp.scheduleLinks[key] = nextValue;
        comp[directKey] = nextValue;
      } else {
        delete comp.scheduleLinks[key];
        delete comp[directKey];
      }
      if (!Object.keys(comp.scheduleLinks).length) delete comp.scheduleLinks;
    };

    const scheduleLinkFieldDefs = [
      {
        name: 'equipmentRef',
        label: 'Equipment Record',
        type: 'select',
        options: makeScheduleLinkOptions(getEquipment()),
        getValue: comp => comp.scheduleLinks?.equipment || comp.equipmentRef || '',
        setValue: (comp, value) => setScheduleLink(comp, 'equipment', 'equipmentRef', value)
      },
      {
        name: 'loadRef',
        label: 'Load Record',
        type: 'select',
        options: makeScheduleLinkOptions(getLoads()),
        getValue: comp => comp.scheduleLinks?.load || comp.loadRef || '',
        setValue: (comp, value) => setScheduleLink(comp, 'load', 'loadRef', value)
      },
      {
        name: 'panelRef',
        label: 'Panel Record',
        type: 'select',
        options: makeScheduleLinkOptions(getPanels()),
        getValue: comp => comp.scheduleLinks?.panel || comp.panelRef || '',
        setValue: (comp, value) => setScheduleLink(comp, 'panel', 'panelRef', value)
      },
      {
        name: 'cableRef',
        label: 'Cable Record',
        type: 'select',
        options: makeScheduleLinkOptions(getCables()),
        getValue: comp => comp.scheduleLinks?.cable || comp.cableRef || '',
        setValue: (comp, value) => setScheduleLink(comp, 'cable', 'cableRef', value)
      }
    ];
    fields.push(...scheduleLinkFieldDefs);
    const scheduleLinkFieldNames = new Set(scheduleLinkFieldDefs.map(field => field.name));

    const hasTccField = fields.some(f => f.name === 'tccId');
    let lastSourceVoltageDriver = null;

    const applyChanges = () => {
      if (isComponentPropertiesLocked(targetComp)) {
        showToast('Unlock component properties before applying changes');
        return;
      }
      if (hasApplied) return;
      hasApplied = true;
      const fd = new FormData(form);
      fields.forEach(f => {
        applyFieldFromForm(targetComp, f, fd);
      });
      normalizeComponentElectricalProperties(targetComp);
      ensureShapeDefaults(targetComp);
      if (hasTccField) {
        targetComp.tccId = fd.get('tccId') || '';
      }
      if (isSourceCategoryComponent) {
        syncSourceVoltageFields(targetComp, lastSourceVoltageDriver);
      }
      pushHistory();
      render();
      zoomToComponentNeighborhood(targetComp, { pad: 110, maxZoom: 1.2 });
      save();
      markScheduleReconcilePending();
    };
    modal._applyChanges = applyChanges;

    const {
      manufacturerFields,
      noteFields,
      electricalFields,
      motorStartFields,
      physicalFields,
      studyFields,
      scheduleLinkFields,
      generalFields
    } = partitionPropertyFields({
      fields,
      baseFields,
      scheduleLinkFieldNames,
      isMotorStudyComponent,
      impedanceFieldNameSet,
      studyInputFieldNameSet,
      isPhysicalPropertyField,
      shouldApplyMotorDerivations,
      motorCalculatedFields
    });
    const createFieldset = (legendText, fieldArr) => {
      const fs = document.createElement('fieldset');
      if (legendText) {
        const legend = document.createElement('legend');
        legend.textContent = legendText;
        fs.appendChild(legend);
      }
      fieldArr.forEach(field => buildField(field, fs));
      return fs;
    };

    const tabList = document.createElement('div');
    tabList.className = 'prop-tabs';
    tabList.setAttribute('role', 'tablist');
    form.appendChild(tabList);

    const tabPanels = document.createElement('div');
    tabPanels.className = 'prop-tab-panels';
    form.appendChild(tabPanels);

    const tabs = [];
    const tabMap = new Map();

    const activateTab = id => {
      tabs.forEach(tab => {
        const isSelected = tab.id === id;
        tab.button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        tab.button.tabIndex = isSelected ? 0 : -1;
        tab.panel.hidden = !isSelected;
      });
    };

    const focusTabAt = index => {
      if (!tabs.length) return;
      const normalized = ((index % tabs.length) + tabs.length) % tabs.length;
      const tab = tabs[normalized];
      activateTab(tab.id);
      tab.button.focus();
    };

    const createTabSection = (id, label, legendText, fieldArr, options = {}) => {
      const hasFields = Array.isArray(fieldArr) && fieldArr.length > 0;
      if (!options.force && !hasFields) return null;
      const tabButton = document.createElement('button');
      tabButton.type = 'button';
      tabButton.className = 'prop-tab';
      tabButton.id = `prop-tab-${id}`;
      tabButton.textContent = label;
      tabButton.setAttribute('role', 'tab');
      tabButton.setAttribute('aria-selected', 'false');
      tabButton.setAttribute('aria-controls', `prop-tab-panel-${id}`);
      tabButton.tabIndex = -1;
      tabList.appendChild(tabButton);

      const panel = document.createElement('div');
      panel.className = 'prop-tab-panel';
      panel.id = `prop-tab-panel-${id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabButton.id);
      panel.hidden = true;
      if (hasFields) panel.appendChild(createFieldset(legendText, fieldArr));
      tabPanels.appendChild(panel);

      const tabRecord = { id, button: tabButton, panel };
      tabs.push(tabRecord);
      tabMap.set(id, tabRecord);

      tabButton.addEventListener('click', () => {
        activateTab(id);
      });
      tabButton.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          focusTabAt(tabs.findIndex(t => t.id === id) + 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          focusTabAt(tabs.findIndex(t => t.id === id) - 1);
        }
      });

      return tabRecord;
    };

    createTabSection('general', 'General', 'General', generalFields);
    createTabSection('links', 'Links', 'Schedule Links', scheduleLinkFields);
    createTabSection('electrical', 'Electrical', 'Electrical', electricalFields);
    createTabSection('studies', 'Studies', 'Study Inputs', studyFields);
    createTabSection('physical', 'Physical', 'Physical', physicalFields);
    createTabSection('motor', 'Motor Start', 'Motor Start', motorStartFields);
    createTabSection('manufacturer', 'Manufacturer', 'Manufacturer', manufacturerFields);
    createTabSection('notes', 'Notes', 'Notes', noteFields);

    if (shouldApplyMotorDerivations) {
      const driverFieldNames = [
        'hp',
        'horsepower',
        'pf',
        'power_factor',
        'efficiency',
        'eff',
        'voltage',
        'volts',
        'volts_primary',
        'volts_secondary',
        'baseKV',
        'kV',
        'kv',
        'phases',
        'phase_count',
        'phaseCount',
        'inrushMultiple',
        'lr_current_pu',
        'locked_rotor_multiple',
        'lockedRotorMultiple'
      ];

      const parseNumericValue = raw => {
        if (raw === null || raw === undefined) return null;
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
        const text = String(raw).trim();
        if (!text) return null;
        const num = Number.parseFloat(text);
        return Number.isFinite(num) ? num : null;
      };

      const parsePercentValue = raw => {
        const num = parseNumericValue(raw);
        if (num === null) return null;
        let ratio = num;
        if (Math.abs(ratio) > 1.5) ratio /= 100;
        if (!Number.isFinite(ratio) || ratio <= 0) return null;
        return ratio;
      };

      const readComponentValue = name => {
        if (targetComp && Object.prototype.hasOwnProperty.call(targetComp, name)) {
          const direct = targetComp[name];
          if (direct !== undefined && direct !== null && direct !== '') return direct;
        }
        if (targetComp?.props && Object.prototype.hasOwnProperty.call(targetComp.props, name)) {
          const propVal = targetComp.props[name];
          if (propVal !== undefined && propVal !== null && propVal !== '') return propVal;
        }
        return null;
      };

      const getNumeric = (names, { percent = false } = {}) => {
        for (const name of names) {
          const input = motorInputMap.get(name);
          if (!input) continue;
          const value = percent ? parsePercentValue(input.value) : parseNumericValue(input.value);
          if (value !== null) return value;
        }
        for (const name of names) {
          const fromComp = readComponentValue(name);
          if (fromComp === null) continue;
          const value = percent ? parsePercentValue(fromComp) : parseNumericValue(fromComp);
          if (value !== null) return value;
        }
        return null;
      };

      const clamp = (val, min, max) => {
        if (!Number.isFinite(val)) return val;
        if (val < min) return min;
        if (val > max) return max;
        return val;
      };

      const updateMotorDerivedFields = () => {
        const hpVal = getNumeric(['hp', 'horsepower']);
        let effVal = getNumeric(['efficiency', 'eff'], { percent: true });
        let pfVal = getNumeric(['pf', 'power_factor'], { percent: true });
        let voltageVal = getNumeric(['voltage', 'volts', 'volts_primary', 'volts_secondary']);
        if (voltageVal === null) {
          const baseKv = getNumeric(['baseKV', 'kV', 'kv']);
          if (Number.isFinite(baseKv) && baseKv > 0) voltageVal = baseKv * 1000;
        }
        let phasesVal = getNumeric(['phases', 'phase_count', 'phaseCount']);
        const loadKwInput = motorInputMap.get('load_kw');
        const loadKvarInput = motorInputMap.get('load_kvar');
        const impRInput = motorInputMap.get('impedance_r');
        const impXInput = motorInputMap.get('impedance_x');
        effVal = effVal !== null ? clamp(effVal, 0.01, 0.9999) : null;
        pfVal = pfVal !== null ? clamp(pfVal, 0.01, 0.9999) : null;
        phasesVal = Number.isFinite(phasesVal) && phasesVal > 0 ? phasesVal : 3;

        let inputKw = null;
        if (Number.isFinite(hpVal) && hpVal > 0 && Number.isFinite(effVal) && effVal > 0) {
          const outputKw = hpVal * 0.746;
          inputKw = outputKw / effVal;
          if (loadKwInput) loadKwInput.value = formatNumber(inputKw, 3);
        }

        if (Number.isFinite(inputKw) && pfVal !== null && loadKvarInput) {
          const kva = inputKw / pfVal;
          const kvar = Math.sqrt(Math.max(kva * kva - inputKw * inputKw, 0));
          loadKvarInput.value = formatNumber(kvar, 3);
        }

        const voltageValid = Number.isFinite(voltageVal) && voltageVal > 0 ? voltageVal : null;
        let lineCurrent = null;
        if (Number.isFinite(inputKw) && pfVal !== null && voltageValid !== null) {
          const isSinglePhase = phasesVal <= 1.5;
          const denom = isSinglePhase ? voltageValid * pfVal : Math.sqrt(3) * voltageValid * pfVal;
          if (denom > 0) {
            lineCurrent = (inputKw * 1000) / denom;
          }
          if (lineCurrent && lineCurrent > 0 && impRInput && impXInput) {
            const phaseVoltage = isSinglePhase ? voltageValid : voltageValid / Math.sqrt(3);
            const impedanceMag = phaseVoltage / lineCurrent;
            if (Number.isFinite(impedanceMag) && impedanceMag > 0) {
              const sinPhi = Math.sqrt(Math.max(1 - pfVal * pfVal, 0));
              const resistance = impedanceMag * pfVal;
              const reactance = impedanceMag * sinPhi;
              impRInput.value = formatNumber(resistance, 4);
              impXInput.value = formatNumber(reactance, 4);
            }
          }
        }
      };

      const attachUpdate = input => {
        if (!input) return;
        input.addEventListener('input', updateMotorDerivedFields);
        input.addEventListener('change', updateMotorDerivedFields);
      };

      driverFieldNames.forEach(name => {
        const input = motorInputMap.get(name);
        if (input) attachUpdate(input);
      });

      updateMotorDerivedFields();
    }

    if (isStaticLoadComponent && staticInputMap) {
      const pfFieldNames = ['pf', 'power_factor'];
      const wattsFieldNames = ['watts'];
      const kvaFieldNames = ['kva'];
      const voltageFieldNames = ['volts', 'voltage'];
      const baseFieldNames = ['baseKV', 'kV', 'kv', 'prefault_voltage'];

      const parsePfValue = raw => {
        const numeric = parseNumericValue(raw);
        if (numeric === null) return null;
        let pf = numeric;
        if (Math.abs(pf) > 1.5) pf /= 100;
        if (!Number.isFinite(pf) || pf === 0) return null;
        const sign = pf >= 0 ? 1 : -1;
        pf = Math.abs(pf);
        if (pf < 0.01) pf = 0.01;
        if (pf > 1) pf = 1;
        return sign * pf;
      };

      const getInputValue = (names, parser) => {
        for (const name of names) {
          const input = staticInputMap.get(name);
          if (!input) continue;
          const parsed = parser(input.value);
          if (parsed !== null) return parsed;
        }
        return null;
      };

      const updateStaticPowerFields = (source, { commitFormatting = false, allowFallback = false } = {}) => {
        const wattsInput = staticInputMap.get('watts');
        const kvaInput = staticInputMap.get('kva');
        const loadKwInput = staticInputMap.get('load_kw');
        const loadKvarInput = staticInputMap.get('load_kvar');
        const pfInput = staticInputMap.get('pf') || staticInputMap.get('power_factor');

        const setFieldValue = (input, value, decimals, { skip = false, preserveOnInvalid = false } = {}) => {
          if (!input || skip) return;
          if (Number.isFinite(value)) {
            input.value = formatNumber(value, decimals);
          } else if (!preserveOnInvalid || commitFormatting) {
            input.value = '';
          }
        };

        let pfVal = getInputValue(pfFieldNames, parsePfValue);
        if (pfVal === null && allowFallback) {
          for (const name of pfFieldNames) {
            const fallback = parsePfValue(readComponentValue(name));
            if (fallback !== null) {
              pfVal = fallback;
              break;
            }
          }
        }

        let wattsVal = getInputValue(wattsFieldNames, parseNumericValue);
        if (wattsVal === null && allowFallback) {
          const fallbackWatts = parseNumericValue(readComponentValue('watts'));
          if (fallbackWatts !== null) {
            wattsVal = fallbackWatts;
          } else {
            const loadKwFallback = parseNumericValue(getNestedComponentValue(targetComp, ['load', 'kw']));
            if (loadKwFallback !== null) wattsVal = loadKwFallback * 1000;
          }
        }

        let kvaVal = getInputValue(kvaFieldNames, parseNumericValue);
        if (kvaVal === null && allowFallback) {
          const fallbackKva = parseNumericValue(readComponentValue('kva'));
          if (fallbackKva !== null) kvaVal = fallbackKva;
        }

        const pfMagnitude = Number.isFinite(pfVal) ? Math.min(Math.max(Math.abs(pfVal), 0.01), 1) : null;
        const kvarSign = Number.isFinite(pfVal) && pfVal < 0 ? -1 : 1;

        let kwVal = Number.isFinite(wattsVal) ? wattsVal / 1000 : null;
        if (!Number.isFinite(kwVal) && Number.isFinite(kvaVal) && pfMagnitude !== null) {
          kwVal = kvaVal * pfMagnitude;
        }

        const sourceIsWattsOrPf = source === 'watts' || pfFieldNames.includes(source);
        if (sourceIsWattsOrPf && Number.isFinite(kwVal) && pfMagnitude !== null && pfMagnitude > 0) {
          kvaVal = kwVal / pfMagnitude;
        } else if (!Number.isFinite(kvaVal) && Number.isFinite(kwVal) && pfMagnitude !== null && pfMagnitude > 0) {
          kvaVal = kwVal / pfMagnitude;
        }

        if (!Number.isFinite(wattsVal) && Number.isFinite(kwVal)) {
          wattsVal = kwVal * 1000;
        }

        let kvarVal = null;
        if (Number.isFinite(kvaVal) && Number.isFinite(kwVal)) {
          const diff = Math.max(kvaVal * kvaVal - kwVal * kwVal, 0);
          kvarVal = Math.sqrt(diff) * (Number.isFinite(pfVal) ? kvarSign : 1);
        }

        const existingKvarVal = allowFallback
          ? parseNumericValue(getNestedComponentValue(targetComp, ['load', 'kvar']))
          : null;

        const skipManual = !commitFormatting;

        setFieldValue(wattsInput, wattsVal, 3, {
          skip: source === 'watts' && skipManual,
          preserveOnInvalid: true
        });
        setFieldValue(kvaInput, kvaVal, 3, {
          skip: source === 'kva' && skipManual,
          preserveOnInvalid: true
        });

        if (pfInput) {
          const pfNames = pfFieldNames.filter(name => staticInputMap.has(name));
          const pfSkip = pfNames.includes(source) && skipManual;
          if (Number.isFinite(pfVal)) {
            if (!pfSkip) pfInput.value = formatNumber(pfVal, 3);
          } else if (!pfSkip && commitFormatting) {
            pfInput.value = '';
          }
        }

        if (loadKwInput) {
          if (Number.isFinite(kwVal)) loadKwInput.value = formatNumber(kwVal, 3);
          else loadKwInput.value = '';
        }
        if (loadKvarInput) {
          if (Number.isFinite(kvarVal)) loadKvarInput.value = formatNumber(kvarVal, 3);
          else if (Number.isFinite(existingKvarVal)) loadKvarInput.value = formatNumber(existingKvarVal, 3);
          else loadKvarInput.value = '';
        }
      };

      const parseVoltageValue = raw => {
        const normalized = normalizeVoltageToVolts(raw);
        if (!Number.isFinite(normalized) || normalized <= 0) return null;
        return normalized;
      };

      const updateStaticVoltageFields = (source, { commitFormatting = false, allowFallback = false } = {}) => {
        const voltsInput = staticInputMap.get('volts');
        const voltageInput = staticInputMap.get('voltage');
        const baseInputs = baseFieldNames
          .map(name => ({ name, input: staticInputMap.get(name) }))
          .filter(entry => entry.input);

        const getVoltageFromInput = input => {
          if (!input) return null;
          return parseVoltageValue(input.value);
        };

        let voltsVal = null;
        if (source === 'volts') voltsVal = getVoltageFromInput(voltsInput);
        if (voltsVal === null && source === 'voltage') voltsVal = getVoltageFromInput(voltageInput);
        if (voltsVal === null) {
          voltsVal = getVoltageFromInput(voltsInput) ?? getVoltageFromInput(voltageInput);
        }
        if (voltsVal === null) {
          for (const entry of baseInputs) {
            const parsed = parseVoltageValue(entry.input.value);
            if (parsed !== null) {
              voltsVal = parsed;
              break;
            }
          }
        }
        if (voltsVal === null && allowFallback) {
          const fallbackSources = [...voltageFieldNames, ...baseFieldNames];
          for (const name of fallbackSources) {
            const parsed = parseVoltageValue(readComponentValue(name));
            if (parsed !== null) {
              voltsVal = parsed;
              break;
            }
          }
          if (voltsVal === null) {
            const nested = parseVoltageValue(getNestedComponentValue(targetComp, ['voltage']));
            if (nested !== null) voltsVal = nested;
          }
        }

        const kvVal = Number.isFinite(voltsVal) ? voltsVal / 1000 : null;

        const skipManual = !commitFormatting;

        if (voltsInput) {
          const skip = source === 'volts' && skipManual;
          if (Number.isFinite(voltsVal)) {
            if (!skip) voltsInput.value = formatNumber(voltsVal, 3);
          } else if (!skip && commitFormatting) {
            voltsInput.value = '';
          }
        }

        if (voltageInput) {
          const skip = source === 'voltage' && skipManual;
          if (Number.isFinite(voltsVal)) {
            if (!skip) voltageInput.value = formatNumber(voltsVal, 3);
          } else if (!skip && commitFormatting) {
            voltageInput.value = '';
          }
        }

        baseInputs.forEach(({ input }) => {
          if (!input) return;
          if (Number.isFinite(kvVal)) {
            input.value = formatNumber(kvVal, 6);
          } else if (commitFormatting || !input.value) {
            input.value = '';
          }
        });
      };

      const attachPowerListener = name => {
        const input = staticInputMap.get(name);
        if (!input) return;
        input.addEventListener('input', () => updateStaticPowerFields(name, { allowFallback: false }));
        input.addEventListener('change', () => updateStaticPowerFields(name, { commitFormatting: true, allowFallback: false }));
      };

      const attachVoltageListener = name => {
        const input = staticInputMap.get(name);
        if (!input) return;
        input.addEventListener('input', () => updateStaticVoltageFields(name, { allowFallback: false }));
        input.addEventListener('change', () => updateStaticVoltageFields(name, { commitFormatting: true, allowFallback: false }));
      };

      [...wattsFieldNames, ...kvaFieldNames, ...pfFieldNames].forEach(attachPowerListener);
      voltageFieldNames.forEach(attachVoltageListener);

      updateStaticPowerFields(null, { commitFormatting: true, allowFallback: true });
      updateStaticVoltageFields(null, { commitFormatting: true, allowFallback: true });
    }

    if (isSourceCategoryComponent && sourceInputMap) {
      const baseFieldNames = ['baseKV', 'kV', 'kv', 'prefault_voltage'];
      const sourceVoltageDriverNames = [
        'source_voltage_base',
        'voltage',
        'volts',
        'voltage_primary',
        'voltage_secondary',
        'nominalVoltage',
        'nominal_voltage'
      ];
      const orderedSourceVoltageDrivers = preferredDriver => (
        preferredDriver && sourceVoltageDriverNames.includes(preferredDriver)
          ? [preferredDriver, ...sourceVoltageDriverNames.filter(name => name !== preferredDriver)]
          : sourceVoltageDriverNames
      );

      const setCustomIndicator = (name, active) => {
        if (!sourceCustomBadges) return;
        const entry = sourceCustomBadges.get(name);
        if (!entry) return;
        const { badge, input } = entry;
        if (badge) badge.hidden = !active;
        if (input) {
          if (active) input.classList.add('prop-input-custom');
          else input.classList.remove('prop-input-custom');
        }
      };

      const parseKvValue = raw => {
        if (raw === null || raw === undefined) return null;
        const directKv = toBaseKV(raw);
        if (Number.isFinite(directKv) && directKv > 0.2) return directKv;
        const numeric = parseNumericValue(raw);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        if (numeric > 1000) return numeric / 1000;
        return numeric;
      };

      const getKvFromInputs = names => {
        for (const name of names) {
          const input = sourceInputMap.get(name);
          if (!input) continue;
          const kv = parseKvValue(input.value);
          if (kv !== null) return kv;
        }
        return null;
      };

      const getKvFromComponent = names => {
        for (const name of names) {
          const kv = parseKvValue(readComponentValue(name));
          if (kv !== null) return kv;
        }
        return null;
      };

      const getKvFromOverrideInputs = names => {
        for (const name of names) {
          const entry = sourceCustomBadges?.get(name);
          const input = entry?.input ?? sourceInputMap.get(name);
          if (!input) continue;
          if (input.dataset.userOverride !== '1') continue;
          const kv = parseKvValue(input.value);
          if (kv !== null) return kv;
        }
        return null;
      };

      const resolveAutoBaseKV = ({ includeOverrides = false, preferredDriver = null } = {}) => {
        if (includeOverrides) {
          const fromOverrides = getKvFromOverrideInputs(baseFieldNames);
          if (Number.isFinite(fromOverrides) && fromOverrides > 0) return fromOverrides;
        }
        const driverInputs = orderedSourceVoltageDrivers(preferredDriver);
        const fromInputs = getKvFromInputs(driverInputs);
        if (Number.isFinite(fromInputs) && fromInputs > 0) return fromInputs;
        const fromComponentDrivers = getKvFromComponent(driverInputs);
        if (Number.isFinite(fromComponentDrivers) && fromComponentDrivers > 0) return fromComponentDrivers;
        if (includeOverrides) {
          const fromBaseInputs = getKvFromInputs(baseFieldNames);
          if (Number.isFinite(fromBaseInputs) && fromBaseInputs > 0) return fromBaseInputs;
        }
        const fromBase = getKvFromComponent(baseFieldNames);
        if (Number.isFinite(fromBase) && fromBase > 0) return fromBase;
        return null;
      };

      const syncSourceVoltageInputs = preferredDriver => {
        const autoKv = resolveAutoBaseKV({ preferredDriver });
        if (!Number.isFinite(autoKv) || autoKv <= 0) return;
        const formattedKv = formatNumber(autoKv, 6);
        const formattedVolts = formatNumber(autoKv * 1000, 3);
        [
          { name: 'source_voltage_base', value: formattedKv },
          { name: 'voltage', value: formattedVolts },
          { name: 'volts', value: formattedVolts }
        ].forEach(({ name, value }) => {
          if (name === preferredDriver) return;
          const input = sourceInputMap.get(name);
          if (input) input.value = value;
        });
      };

      const parseShortCircuitCapacity = raw => {
        if (raw === null || raw === undefined) return null;
        if (typeof raw === 'number') {
          return Number.isFinite(raw) && raw > 0 ? { value: raw, unit: 'mva' } : null;
        }
        const text = String(raw).trim();
        if (!text) return null;
        const match = text.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
        if (!match) return null;
        const numeric = Number.parseFloat(match[0].replace(/,/g, ''));
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        const lowered = text.toLowerCase();
        if (lowered.includes('ka')) return { value: numeric, unit: 'ka' };
        if (lowered.includes('mva')) return { value: numeric, unit: 'mva' };
        return { value: numeric, unit: 'mva' };
      };

      const getShortCircuitCapacity = () => {
        const input = sourceInputMap.get('short_circuit_capacity');
        const fromInput = parseShortCircuitCapacity(input?.value ?? null);
        if (fromInput) return fromInput;
        return parseShortCircuitCapacity(readComponentValue('short_circuit_capacity'));
      };

      const updateSourceBaseFields = (options = {}) => {
        const autoKv = resolveAutoBaseKV(options);
        const tolerance = 1e-6;
        baseFieldNames.forEach(name => {
          const entry = sourceCustomBadges?.get(name);
          const input = entry?.input ?? sourceInputMap.get(name);
          if (!input) return;
          if (!Number.isFinite(autoKv) || autoKv <= 0) {
            delete input.dataset.autoValue;
            if (!input.value.trim()) delete input.dataset.userOverride;
            const active = input.dataset.userOverride === '1';
            setCustomIndicator(name, active);
            return;
          }
          const formatted = formatNumber(autoKv, 6);
          input.dataset.autoValue = formatted;
          const currentVal = parseNumericValue(input.value);
          const hasValue = typeof input.value === 'string' && input.value.trim() !== '';
          let isOverride = input.dataset.userOverride === '1';
          if (!hasValue) {
            isOverride = false;
          } else if (Number.isFinite(currentVal) && Math.abs(currentVal - autoKv) <= tolerance) {
            isOverride = false;
          } else if (!isOverride) {
            isOverride = true;
          }
          if (!isOverride) {
            input.value = formatted;
            delete input.dataset.userOverride;
          } else {
            input.dataset.userOverride = '1';
          }
          setCustomIndicator(name, isOverride);
        });
      };

      const updateSourceDerivedFields = () => {
        const theveninInput = sourceInputMap.get('thevenin_mva');
        if (!theveninInput) return;
        let theveninMva = null;
        const sc = getShortCircuitCapacity();
        if (sc) {
          if (sc.unit === 'ka') {
            const baseKv = resolveAutoBaseKV({ includeOverrides: true, preferredDriver: lastSourceVoltageDriver });
            if (Number.isFinite(baseKv) && baseKv > 0) {
              theveninMva = Math.sqrt(3) * baseKv * sc.value;
            }
          } else {
            theveninMva = sc.value;
          }
        }
        if (theveninMva === null) {
          const existing = parseNumericValue(readComponentValue('thevenin_mva'));
          if (Number.isFinite(existing)) theveninMva = existing;
          else {
            const fallback = parseNumericValue(readComponentValue('mva'));
            if (Number.isFinite(fallback)) theveninMva = fallback;
          }
        }
        theveninInput.value = Number.isFinite(theveninMva) ? formatNumber(theveninMva, 6) : '';
      };

      const attachBaseDriverListener = name => {
        const input = sourceInputMap.get(name);
        if (!input) return;
        const handler = () => {
          lastSourceVoltageDriver = name;
          syncSourceVoltageInputs(name);
          updateSourceBaseFields({ preferredDriver: name });
          updateSourceDerivedFields();
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      };

      ['source_voltage_base', 'voltage', 'volts', 'voltage_primary', 'voltage_secondary', 'nominalVoltage', 'nominal_voltage'].forEach(
        attachBaseDriverListener
      );

      const attachDerivedListener = name => {
        const input = sourceInputMap.get(name);
        if (!input) return;
        const handler = () => {
          updateSourceDerivedFields();
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      };

      ['short_circuit_capacity'].forEach(attachDerivedListener);

      baseFieldNames.forEach(name => {
        const entry = sourceCustomBadges?.get(name);
        const input = entry?.input ?? sourceInputMap.get(name);
        if (!input) return;
        input.addEventListener('input', () => {
          if (!input.value.trim()) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateSourceBaseFields();
            updateSourceDerivedFields();
            return;
          }
          input.dataset.userOverride = '1';
          setCustomIndicator(name, true);
          updateSourceDerivedFields();
        });
        input.addEventListener('change', () => {
          if (!input.value.trim()) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateSourceBaseFields();
            updateSourceDerivedFields();
            return;
          }
          const autoVal = parseNumericValue(input.dataset.autoValue);
          const currentVal = parseNumericValue(input.value);
          if (Number.isFinite(autoVal) && Number.isFinite(currentVal) && Math.abs(currentVal - autoVal) <= 1e-6) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateSourceBaseFields();
          } else {
            input.dataset.userOverride = '1';
            setCustomIndicator(name, true);
          }
          updateSourceDerivedFields();
        });
      });

      updateSourceBaseFields();
      updateSourceDerivedFields();
    }

    if (isTransformerComponent && transformerInputMap) {
      const impedanceDriverFields = [
        'kva',
        'kva_lv',
        'kva_secondary',
        'kva_primary',
        'kva_hv',
        'kva_tv',
        'kva_tertiary',
        'percent_z',
        'z_percent',
        'percent_primary',
        'percent_secondary',
        'percent_tertiary',
        'z_hv_lv_percent',
        'z_hv_tv_percent',
        'z_lv_tv_percent',
        'xr_ratio',
        'xr'
      ];
      const voltageFieldPriority = [
        'volts_secondary',
        'volts_lv',
        'volts_tv',
        'volts_tertiary',
        'volts_primary',
        'volts_hv',
        'voltage_secondary',
        'voltage_primary',
        'voltage'
      ];
      const baseFieldNames = ['baseKV', 'kV', 'kv', 'prefault_voltage'];

      const setCustomIndicator = (name, active) => {
        if (!transformerCustomBadges) return;
        const entry = transformerCustomBadges.get(name);
        if (!entry) return;
        const { badge, input } = entry;
        if (active) {
          badge.hidden = false;
          input.classList.add('prop-input-custom');
        } else {
          badge.hidden = true;
          input.classList.remove('prop-input-custom');
        }
      };

      const parseVoltageToKV = raw => {
        const volts = normalizeVoltageToVolts(raw);
        if (!Number.isFinite(volts) || volts <= 0) return null;
        return volts / 1000;
      };

      const getNumericFromInputs = (names, { voltage = false } = {}) => {
        for (const name of names) {
          const input = transformerInputMap.get(name);
          if (!input) continue;
          const raw = input.value;
          const value = voltage ? parseVoltageToKV(raw) : parseNumericValue(raw);
          if (value !== null) return value;
        }
        return null;
      };

      const resolveAutoBaseKV = () => {
        const fromInputs = getNumericFromInputs(voltageFieldPriority, { voltage: true });
        if (Number.isFinite(fromInputs) && fromInputs > 0) return fromInputs;
        const derived = deriveTransformerBaseKV(targetComp);
        if (Number.isFinite(derived) && derived > 0) return derived;
        const fallback = computeTransformerBaseKV(targetComp);
        if (Number.isFinite(fallback) && fallback > 0) return fallback;
        return null;
      };

      const updateTransformerDerivedFields = () => {
        const kvaVal = getNumericFromInputs(impedanceDriverFields) ?? resolveTransformerKva(targetComp);
        const percentVal = getNumericFromInputs([
          'percent_z',
          'z_percent',
          'percent_primary',
          'percent_secondary',
          'percent_tertiary',
          'z_hv_lv_percent',
          'z_hv_tv_percent',
          'z_lv_tv_percent'
        ]) ?? resolveTransformerPercentZ(targetComp);
        let baseKv = getNumericFromInputs(voltageFieldPriority, { voltage: true });
        if (baseKv === null) {
          const fromBaseInputs = getNumericFromInputs(baseFieldNames);
          if (Number.isFinite(fromBaseInputs) && fromBaseInputs > 0) baseKv = fromBaseInputs;
        }
        if (baseKv === null) baseKv = computeTransformerBaseKV(targetComp);
        const xrVal = getNumericFromInputs(['xr_ratio', 'xr']) ?? resolveTransformerXrRatio(targetComp);
        const impRInput = transformerInputMap.get('impedance_r');
        const impXInput = transformerInputMap.get('impedance_x');
        if (
          Number.isFinite(kvaVal)
          && Number.isFinite(percentVal)
          && Number.isFinite(baseKv)
          && kvaVal !== 0
          && percentVal !== 0
          && baseKv !== 0
        ) {
          const impedance = calculateTransformerImpedance({ kva: kvaVal, percentZ: percentVal, voltageKV: baseKv, xrRatio: xrVal });
          if (impedance && Number.isFinite(impedance.r) && Number.isFinite(impedance.x)) {
            if (impRInput) impRInput.value = formatNumber(impedance.r, 6);
            if (impXInput) impXInput.value = formatNumber(impedance.x, 6);
            return;
          }
        }
        if (impRInput) impRInput.value = '';
        if (impXInput) impXInput.value = '';
      };

      const updateTransformerBaseFields = () => {
        const autoKv = resolveAutoBaseKV();
        const tolerance = 1e-6;
        baseFieldNames.forEach(name => {
          const input = transformerInputMap.get(name);
          if (!input) return;
          if (!Number.isFinite(autoKv) || autoKv <= 0) {
            delete input.dataset.autoValue;
            const isCustom = input.dataset.userOverride === '1';
            setCustomIndicator(name, isCustom);
            return;
          }
          const formatted = formatNumber(autoKv, 6);
          input.dataset.autoValue = formatted;
          const currentVal = parseNumericValue(input.value);
          const hasValue = typeof input.value === 'string' && input.value.trim() !== '';
          let isOverride = input.dataset.userOverride === '1';
          if (!hasValue) {
            isOverride = false;
          } else if (Number.isFinite(currentVal) && Math.abs(currentVal - autoKv) <= tolerance) {
            isOverride = false;
          } else if (!isOverride) {
            isOverride = true;
          }
          if (!isOverride) {
            input.value = formatted;
            delete input.dataset.userOverride;
          } else {
            input.dataset.userOverride = '1';
          }
          setCustomIndicator(name, isOverride);
        });
      };

      const attachDerivedListener = name => {
        const input = transformerInputMap.get(name);
        if (!input) return;
        const handler = () => {
          updateTransformerDerivedFields();
          if (voltageFieldPriority.includes(name)) updateTransformerBaseFields();
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      };

      impedanceDriverFields.concat(voltageFieldPriority).forEach(attachDerivedListener);

      baseFieldNames.forEach(name => {
        const input = transformerInputMap.get(name);
        if (!input) return;
        input.addEventListener('input', () => {
          if (!input.value.trim()) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateTransformerBaseFields();
            updateTransformerDerivedFields();
            return;
          }
          input.dataset.userOverride = '1';
          setCustomIndicator(name, true);
          updateTransformerDerivedFields();
        });
        input.addEventListener('change', () => {
          if (!input.value.trim()) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateTransformerBaseFields();
            updateTransformerDerivedFields();
            return;
          }
          const autoVal = parseNumericValue(input.dataset.autoValue);
          const currentVal = parseNumericValue(input.value);
          if (Number.isFinite(autoVal) && Number.isFinite(currentVal) && Math.abs(currentVal - autoVal) <= 1e-6) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateTransformerBaseFields();
          } else {
            input.dataset.userOverride = '1';
            setCustomIndicator(name, true);
          }
          updateTransformerDerivedFields();
        });
      });

      updateTransformerDerivedFields();
      updateTransformerBaseFields();
    }

    const getTabPanel = id => tabMap.get(id)?.panel || tabs[0]?.panel || null;

    if (harmonicProfileInput && harmonicSpectrumInput) {
      const studiesPanel = getTabPanel('studies');
      const studiesFieldset = studiesPanel?.querySelector('fieldset');
      const helper = document.createElement('div');
      helper.className = 'harmonic-profile-helper';

      const selectedInfo = document.createElement('div');
      selectedInfo.className = 'harmonic-profile-selected';
      const selectedTitle = document.createElement('strong');
      selectedTitle.textContent = 'Profile spectrum';
      const selectedText = document.createElement('span');
      selectedInfo.appendChild(selectedTitle);
      selectedInfo.appendChild(selectedText);

      const chartActionRow = document.createElement('div');
      chartActionRow.className = 'harmonic-profile-action-row';
      const viewChartsButton = document.createElement('button');
      viewChartsButton.type = 'button';
      viewChartsButton.className = 'btn harmonic-profile-chart-btn';
      viewChartsButton.textContent = 'View Profile Charts';
      chartActionRow.appendChild(viewChartsButton);

      const saveRow = document.createElement('div');
      saveRow.className = 'harmonic-profile-save-row';
      const customName = document.createElement('input');
      customName.type = 'text';
      customName.placeholder = 'Custom profile name';
      customName.autocomplete = 'off';
      const saveProfileButton = document.createElement('button');
      saveProfileButton.type = 'button';
      saveProfileButton.className = 'btn harmonic-profile-save-btn';
      saveProfileButton.textContent = 'Save Current Spectrum';
      saveRow.appendChild(customName);
      saveRow.appendChild(saveProfileButton);

      helper.appendChild(selectedInfo);
      helper.appendChild(chartActionRow);
      helper.appendChild(saveRow);
      if (studiesFieldset) studiesFieldset.appendChild(helper);

      const getNamedFormElement = name => {
        const element = form.elements.namedItem(name);
        if (!element) return null;
        if (typeof Element !== 'undefined' && element instanceof Element) return element;
        return element[0] || null;
      };

      const readFormOrComponentValue = name => {
        const element = getNamedFormElement(name);
        if (element) {
          if (element.type === 'checkbox') return element.checked;
          if (element.value !== undefined && element.value !== '') return element.value;
        }
        return readComponentValue(name);
      };

      const getPreviewNumeric = names => {
        for (const name of names) {
          const parsed = parseNumericValue(readFormOrComponentValue(name));
          if (parsed !== null) return parsed;
        }
        return null;
      };

      const getPreviewVoltage = () => {
        const voltageNames = [
          'voltage',
          'volts',
          'rated_voltage',
          'rated_voltage_v',
          'nominal_voltage',
          'nominalVoltage',
          'baseKV',
          'kV',
          'kv',
          'prefault_voltage'
        ];
        for (const name of voltageNames) {
          const volts = normalizeVoltageToVolts(readFormOrComponentValue(name));
          if (Number.isFinite(volts) && volts > 0) return volts;
        }
        const fallback = normalizeVoltageToVolts(targetComp);
        return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
      };

      const getPreviewLoadKw = () => {
        const loadValue = readComponentValue('load');
        if (loadValue && typeof loadValue === 'object') {
          const nestedKw = parseNumericValue(loadValue.kw ?? loadValue.kW ?? loadValue.P);
          if (nestedKw !== null) return nestedKw;
        }
        const kw = getPreviewNumeric(['load_kw', 'kw', 'kW', 'rated_kw', 'output_kw']);
        if (kw !== null) return kw;
        const hp = getPreviewNumeric(['hp', 'horsepower']);
        return hp !== null ? hp * 0.746 : null;
      };

      const makeSvgElement = (tagName, attrs = {}) => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', tagName);
        Object.entries(attrs).forEach(([key, value]) => {
          el.setAttribute(key, String(value));
        });
        return el;
      };

      const createChartPanel = (chartGrid, title, unitLabel, emptyText, className) => {
        const panel = document.createElement('div');
        panel.className = 'harmonic-profile-chart-panel';
        const header = document.createElement('div');
        header.className = 'harmonic-profile-chart-header';
        const heading = document.createElement('strong');
        heading.textContent = title;
        const summary = document.createElement('span');
        header.appendChild(heading);
        header.appendChild(summary);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 320 170');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', `${title} chart`);
        svg.classList.add('harmonic-profile-chart', className);
        const empty = document.createElement('p');
        empty.className = 'harmonic-profile-chart-empty';
        empty.textContent = emptyText;
        panel.appendChild(header);
        panel.appendChild(svg);
        panel.appendChild(empty);
        chartGrid.appendChild(panel);
        return { svg, summary, empty, emptyText, unitLabel };
      };

      let chartModalState = null;

      const ensureHarmonicChartModal = () => {
        if (chartModalState) return chartModalState;
        const chartModalEl = document.createElement('div');
        chartModalEl.className = 'harmonic-profile-chart-modal';
        chartModalEl.hidden = true;
        chartModalEl.setAttribute('role', 'dialog');
        chartModalEl.setAttribute('aria-modal', 'true');
        chartModalEl.setAttribute('aria-labelledby', 'harmonic-profile-chart-title');

        const panel = document.createElement('div');
        panel.className = 'harmonic-profile-chart-modal-panel';

        const header = document.createElement('div');
        header.className = 'harmonic-profile-chart-modal-header';
        const title = document.createElement('h3');
        title.id = 'harmonic-profile-chart-title';
        title.textContent = 'Harmonic Profile Charts';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'harmonic-profile-chart-close';
        closeButton.setAttribute('aria-label', 'Close harmonic profile charts');
        closeButton.textContent = 'x';
        header.appendChild(title);
        header.appendChild(closeButton);

        const profileSummary = document.createElement('p');
        profileSummary.className = 'harmonic-profile-chart-summary';

        const chartGrid = document.createElement('div');
        chartGrid.className = 'harmonic-profile-chart-grid';
        const currentChart = createChartPanel(
          chartGrid,
          'Current Harmonics',
          '% I1',
          'No harmonic orders are defined for this profile.',
          'harmonic-profile-current-chart'
        );
        const voltageChart = createChartPanel(
          chartGrid,
          'Voltage Harmonics',
          '% V1 est.',
          'Voltage estimate needs load, voltage, and short-circuit MVA.',
          'harmonic-profile-voltage-chart'
        );

        const basisText = document.createElement('p');
        basisText.className = 'harmonic-profile-basis';

        const actions = document.createElement('div');
        actions.className = 'harmonic-profile-chart-modal-actions';
        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = 'btn';
        doneButton.textContent = 'Done';
        actions.appendChild(doneButton);

        panel.appendChild(header);
        panel.appendChild(profileSummary);
        panel.appendChild(chartGrid);
        panel.appendChild(basisText);
        panel.appendChild(actions);
        chartModalEl.appendChild(panel);
        document.body.appendChild(chartModalEl);

        const closeChartModal = () => {
          const lastFocused = chartModalState?.lastFocused;
          chartModalEl.hidden = true;
          chartModalEl.classList.remove('show');
          chartModalEl.remove();
          document.removeEventListener('keydown', keyHandler);
          chartModalState = null;
          lastFocused?.focus?.();
        };
        closeButton.addEventListener('click', closeChartModal);
        doneButton.addEventListener('click', closeChartModal);
        chartModalEl.addEventListener('click', e => {
          if (e.target === chartModalEl) closeChartModal();
        });
        const keyHandler = e => {
          if (chartModalEl.hidden || e.key !== 'Escape') return;
          e.preventDefault();
          closeChartModal();
        };
        document.addEventListener('keydown', keyHandler);

        chartModalState = {
          modal: chartModalEl,
          closeButton,
          profileSummary,
          currentChart,
          voltageChart,
          basisText,
          lastFocused: null
        };
        return chartModalState;
      };

      const renderBarChart = (chart, points, { summaryLabel, emptyText } = {}) => {
        const svg = chart.svg;
        svg.textContent = '';
        const validPoints = (Array.isArray(points) ? points : [])
          .filter(point => Number.isFinite(point.order) && Number.isFinite(point.pct) && point.order > 1 && point.pct >= 0);
        if (!validPoints.length) {
          chart.empty.hidden = false;
          chart.empty.textContent = emptyText || chart.emptyText;
          chart.summary.textContent = '';
          return;
        }

        chart.empty.hidden = true;
        chart.empty.textContent = emptyText || chart.emptyText;
        const width = 320;
        const height = 170;
        const margin = { top: 18, right: 16, bottom: 34, left: 42 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const maxPct = Math.max(1, ...validPoints.map(point => point.pct)) * 1.18;
        const barGap = 8;
        const barWidth = Math.max(12, (plotWidth - barGap * (validPoints.length - 1)) / validPoints.length);

        const yAxis = makeSvgElement('line', {
          x1: margin.left,
          y1: margin.top,
          x2: margin.left,
          y2: margin.top + plotHeight,
          class: 'harmonic-profile-chart-axis'
        });
        const xAxis = makeSvgElement('line', {
          x1: margin.left,
          y1: margin.top + plotHeight,
          x2: margin.left + plotWidth,
          y2: margin.top + plotHeight,
          class: 'harmonic-profile-chart-axis'
        });
        svg.appendChild(yAxis);
        svg.appendChild(xAxis);

        [0.5, 1].forEach(ratio => {
          const y = margin.top + plotHeight - ratio * plotHeight;
          svg.appendChild(makeSvgElement('line', {
            x1: margin.left,
            y1: y,
            x2: margin.left + plotWidth,
            y2: y,
            class: 'harmonic-profile-chart-gridline'
          }));
          const tick = makeSvgElement('text', {
            x: margin.left - 8,
            y: y + 4,
            'text-anchor': 'end',
            class: 'harmonic-profile-chart-text'
          });
          tick.textContent = formatHarmonicMetric(maxPct * ratio, 1);
          svg.appendChild(tick);
        });

        validPoints.forEach((point, index) => {
          const x = margin.left + index * (barWidth + barGap);
          const barHeight = maxPct ? (point.pct / maxPct) * plotHeight : 0;
          const y = margin.top + plotHeight - barHeight;
          const rect = makeSvgElement('rect', {
            x,
            y,
            width: barWidth,
            height: Math.max(1, barHeight),
            rx: 2,
            class: 'harmonic-profile-chart-bar'
          });
          const title = makeSvgElement('title');
          title.textContent = `${point.order}th harmonic: ${formatHarmonicMetric(point.pct, 2)} ${chart.unitLabel}`;
          rect.appendChild(title);
          svg.appendChild(rect);

          const orderLabel = makeSvgElement('text', {
            x: x + barWidth / 2,
            y: margin.top + plotHeight + 18,
            'text-anchor': 'middle',
            class: 'harmonic-profile-chart-text'
          });
          orderLabel.textContent = String(point.order);
          svg.appendChild(orderLabel);

          const valueLabel = makeSvgElement('text', {
            x: x + barWidth / 2,
            y: Math.max(margin.top + 10, y - 5),
            'text-anchor': 'middle',
            class: 'harmonic-profile-chart-value'
          });
          valueLabel.textContent = formatHarmonicMetric(point.pct, point.pct < 1 ? 2 : 1);
          svg.appendChild(valueLabel);
        });

        const xLabel = makeSvgElement('text', {
          x: margin.left + plotWidth / 2,
          y: height - 4,
          'text-anchor': 'middle',
          class: 'harmonic-profile-chart-text'
        });
        xLabel.textContent = 'Harmonic order';
        svg.appendChild(xLabel);

        const yLabel = makeSvgElement('text', {
          x: 12,
          y: margin.top + plotHeight / 2,
          transform: `rotate(-90 12 ${margin.top + plotHeight / 2})`,
          'text-anchor': 'middle',
          class: 'harmonic-profile-chart-text'
        });
        yLabel.textContent = chart.unitLabel;
        svg.appendChild(yLabel);

        const thd = harmonicThdPercent(validPoints);
        chart.summary.textContent = `${summaryLabel}: ${formatHarmonicMetric(thd, thd < 1 ? 2 : 1)}%`;
      };

      const renderHarmonicPreview = () => {
        const state = chartModalState;
        if (!state || state.modal.hidden) return;
        const activeProfile = findHarmonicProfileById(harmonicProfileInput.value);
        const spectrumText = String(harmonicSpectrumInput.value || '').trim();
        state.profileSummary.textContent = activeProfile && activeProfile.id !== manualHarmonicProfileId
          ? `${activeProfile.label}: ${spectrumText || activeProfile.spectrum || 'No spectrum defined'}`
          : `Manual spectrum: ${spectrumText || 'No spectrum defined'}`;
        const currentPoints = parseHarmonicSpectrumPoints(harmonicSpectrumInput.value);
        renderBarChart(state.currentChart, currentPoints, { summaryLabel: 'ITHD' });

        const voltage = getPreviewVoltage();
        const loadKw = getPreviewLoadKw();
        const scMVA = getPreviewNumeric(['scMVA', 'short_circuit_mva', 'thevenin_mva']);
        const voltagePoints = estimateVoltageHarmonicPoints(currentPoints, { voltage, loadKw, scMVA });
        const missing = [];
        if (!Number.isFinite(voltage) || voltage <= 0) missing.push('voltage');
        if (!Number.isFinite(loadKw) || loadKw <= 0) missing.push('load kW or HP');
        if (!Number.isFinite(scMVA) || scMVA <= 0) missing.push('short-circuit MVA');
        const voltageEmptyText = missing.length
          ? `Voltage estimate needs ${missing.join(', ')}.`
          : 'No voltage harmonic estimate is available for this profile.';
        renderBarChart(state.voltageChart, voltagePoints, {
          summaryLabel: 'VTHD est.',
          emptyText: voltageEmptyText
        });
        state.basisText.textContent = voltagePoints.length
          ? `Voltage estimate uses ${formatHarmonicMetric(loadKw, 1)} kW, ${formatHarmonicMetric(voltage, 0)} V, and ${formatHarmonicMetric(scMVA, 1)} MVA short-circuit strength.`
          : voltageEmptyText;
      };

      viewChartsButton.addEventListener('click', () => {
        const state = ensureHarmonicChartModal();
        state.lastFocused = document.activeElement;
        state.modal.hidden = false;
        state.modal.classList.add('show');
        renderHarmonicPreview();
        state.closeButton.focus();
      });

      const refreshProfileOptions = selectedId => {
        const nextValue = selectedId || harmonicProfileInput.value || manualHarmonicProfileId;
        harmonicProfileInput.innerHTML = '';
        getHarmonicProfileOptions().forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          harmonicProfileInput.appendChild(option);
        });
        harmonicProfileInput.value = findHarmonicProfileById(nextValue) ? nextValue : manualHarmonicProfileId;
      };

      const updateSelectedInfo = profile => {
        const activeProfile = profile || findHarmonicProfileById(harmonicProfileInput.value);
        if (!activeProfile || activeProfile.id === manualHarmonicProfileId) {
          selectedText.textContent = 'Manual spectrum';
          renderHarmonicPreview();
          return;
        }
        selectedText.textContent = activeProfile.spectrum
          ? `${activeProfile.label}: ${activeProfile.spectrum}`
          : activeProfile.label;
        renderHarmonicPreview();
      };

      const syncProfileFromSpectrum = () => {
        const match = findHarmonicProfileBySpectrum(harmonicSpectrumInput.value);
        harmonicProfileInput.value = match ? match.id : manualHarmonicProfileId;
        updateSelectedInfo(match);
      };

      const applySelectedProfile = ({ force = false } = {}) => {
        const profile = findHarmonicProfileById(harmonicProfileInput.value);
        if (!profile) {
          harmonicProfileInput.value = manualHarmonicProfileId;
          updateSelectedInfo(null);
          return;
        }
        if (profile.id !== manualHarmonicProfileId && profile.spectrum && (force || !harmonicSpectrumInput.value.trim())) {
          harmonicSpectrumInput.value = profile.spectrum;
        }
        updateSelectedInfo(profile);
      };

      const initialSpectrum = String(harmonicSpectrumInput.value || '').trim();
      const matchingProfile = findHarmonicProfileBySpectrum(initialSpectrum);
      refreshProfileOptions(harmonicProfileInput.value || matchingProfile?.id || defaultHarmonicProfileId(targetComp));
      if (!initialSpectrum) applySelectedProfile({ force: false });
      else if (matchingProfile && !harmonicProfileInput.value) harmonicProfileInput.value = matchingProfile.id;
      updateSelectedInfo(findHarmonicProfileById(harmonicProfileInput.value));

      harmonicProfileInput.addEventListener('change', () => applySelectedProfile({ force: true }));
      harmonicSpectrumInput.addEventListener('input', syncProfileFromSpectrum);
      const previewDriverNames = new Set([
        'voltage',
        'volts',
        'rated_voltage',
        'rated_voltage_v',
        'nominal_voltage',
        'nominalVoltage',
        'baseKV',
        'kV',
        'kv',
        'prefault_voltage',
        'load_kw',
        'kw',
        'kW',
        'rated_kw',
        'output_kw',
        'hp',
        'horsepower',
        'scMVA',
        'short_circuit_mva',
        'thevenin_mva'
      ]);
      Array.from(form.elements).forEach(element => {
        if (!element?.name || !previewDriverNames.has(element.name)) return;
        element.addEventListener('input', renderHarmonicPreview);
        element.addEventListener('change', renderHarmonicPreview);
      });
      saveProfileButton.addEventListener('click', () => {
        const profile = saveCustomHarmonicProfile(customName.value, harmonicSpectrumInput.value);
        if (!profile) {
          showToast('Enter a custom profile name and harmonic spectrum');
          return;
        }
        refreshProfileOptions(profile.id);
        harmonicProfileInput.value = profile.id;
        customName.value = '';
        updateSelectedInfo(profile);
        showToast('Harmonic profile saved');
      });
    }

    const connectionCount = Array.isArray(targetComp.connections) ? targetComp.connections.length : 0;
    if (connectionCount > 0) {
      const connectionsTab = createTabSection('connections', 'Connections', null, [], { force: true });
      if (connectionsTab) {
        const header = document.createElement('h3');
        header.textContent = 'Connections';
        connectionsTab.panel.appendChild(header);
        const list = document.createElement('ul');
        list.className = 'prop-connection-list';
        (targetComp.connections || []).forEach((conn, idx) => {
          const li = document.createElement('li');
          const target = components.find(t => t.id === conn.target);
          const span = document.createElement('span');
          const cableInfo = getCableForConnection(targetComp, target, conn);
          const cableLabel = cableInfo?.tag || cableInfo?.cable_type;
          span.textContent = `to ${target?.label || target?.subtype || conn.target}${cableLabel ? ` (${cableLabel})` : ''}`;
          li.appendChild(span);
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.textContent = 'Edit';
          edit.classList.add('btn');
          edit.addEventListener('click', async e => {
            e.stopPropagation();
            const cableComp = isConductorSegmentComponent(targetComp) ? targetComp : isConductorSegmentComponent(target) ? target : null;
            if (cableComp) {
              await editCableComponent(cableComp);
              renderPropertiesFor(targetComp);
            } else {
              showToast('No conductor segment on this connection');
            }
          });
          li.appendChild(edit);
          const del = document.createElement('button');
          del.type = 'button';
          del.textContent = 'Delete';
          del.classList.add('btn');
          del.addEventListener('click', e => {
            e.stopPropagation();
            targetComp.connections.splice(idx, 1);
            pushHistory();
            render();
            save();
            renderPropertiesFor(targetComp);
          });
          li.appendChild(del);
          li.addEventListener('click', () => {
            setSelectedConnection({ component: targetComp, index: idx });
          });
          list.appendChild(li);
        });
        connectionsTab.panel.appendChild(list);
      }
    }

    if (tabs.length) {
      activateTab(tabs[0].id);
    } else {
      tabList.remove();
      tabPanels.remove();
    }

    if (manufacturerInput && modelInput) {
      const updateModels = () => {
        const models = getManufacturerModels(manufacturerInput.value);
        modelInput.innerHTML = '';
        models.forEach(m => {
          const o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          if (targetComp.model === m) o.selected = true;
          modelInput.appendChild(o);
        });
      };
      manufacturerInput.addEventListener('change', updateModels);
      if (!manufacturerInput.value) manufacturerInput.value = manufacturerOptions[0];
      updateModels();
    }

    if (tccInput) {
      const generalPanel = getTabPanel('general');
      if (generalPanel) {
        const tccActions = document.createElement('div');
        tccActions.className = 'prop-tab-actions';
        const tccBtn = document.createElement('button');
        tccBtn.type = 'button';
        tccBtn.classList.add('btn');
        const updateTccActionLabel = () => {
          const hasAssignedDevice = !!tccInput.value;
          tccBtn.textContent = hasAssignedDevice ? 'View TCC Curve' : 'Assign/View TCC';
          tccBtn.title = hasAssignedDevice
            ? 'Open the TCC page with this device and adjacent protective devices selected.'
            : 'Open the TCC page after assigning a protective device.';
        };
        updateTccActionLabel();
        tccInput.addEventListener('change', updateTccActionLabel);
        tccBtn.addEventListener('click', () => {
          if (!targetComp.id) return;
          applyChanges();
          const navParams = new URLSearchParams();
          navParams.set('component', targetComp.id);
          const assignedDevice = targetComp.tccId || tccInput.value;
          if (assignedDevice) navParams.set('device', assignedDevice);
          navParams.set('tccContext', 'adjacent');
          window.location.href = `tcc.html?${navParams.toString()}`;
        });
        tccActions.appendChild(tccBtn);
        generalPanel.appendChild(tccActions);
      }
    }

    if (isConductorSegmentComponent(targetComp)) {
      const generalPanel = getTabPanel('general');
      if (generalPanel) {
        const cable = targetComp.cable || {};
        const cableInfo = document.createElement('div');
        cableInfo.className = 'cable-info';
        cableInfo.innerHTML = `
          <p><strong>Tag:</strong> ${escapeHtml(cable.tag)}</p>
          <p><strong>Type:</strong> ${escapeHtml(cable.cable_type)}</p>
          <p><strong>Cable Rating (V):</strong> ${escapeHtml(cable.cable_rating ?? '')}</p>
          <p><strong>Operating Voltage (V):</strong> ${escapeHtml(formatOperatingVoltage(cable.operating_voltage) || '')}</p>
          <p><strong>Conductors:</strong> ${escapeHtml(cable.conductors)}</p>
          <p><strong>Phases:</strong> ${escapeHtml(Array.isArray(cable.phases) ? cable.phases.join(',') : cable.phases || '')}</p>
          <p><strong>Conductor Size (AWG or mm²):</strong> ${escapeHtml(cable.conductor_size)}</p>
          <p><strong>Conductor Material (Cu/Al):</strong> ${escapeHtml(cable.conductor_material)}</p>
          <p><strong>Resistance (Ω/km):</strong> ${escapeHtml(cable.resistance_per_km ?? '')}</p>
          <p><strong>Reactance (Ω/km):</strong> ${escapeHtml(cable.reactance_per_km ?? '')}</p>
          <p><strong>Zero Sequence Impedance:</strong> ${escapeHtml(cable.zero_sequence_impedance)}</p>
          <p><strong>Mutual Coupling:</strong> ${escapeHtml(cable.mutual_coupling)}</p>
          <p><strong>Length:</strong> ${escapeHtml(cable.length ?? '')}</p>
          <p><strong>Operating Temperature (°C):</strong> ${escapeHtml(cable.operating_temp ?? '')}</p>
          <p><strong>Ambient Temperature (°C):</strong> ${escapeHtml(cable.ambient_temp ?? '')}</p>
          <p><strong>Thermal Rating/Ampacity (A):</strong> ${escapeHtml(cable.thermal_rating_ampacity ?? '')}</p>
          <p><strong>Shield/Armor Data:</strong> ${escapeHtml(cable.shield_armor)}</p>
          <p><strong>Impedance per Length:</strong> ${escapeHtml(cable.impedance_per_length)}</p>
          <p><strong>Capacitance (µF/km):</strong> ${escapeHtml(cable.capacitance_per_km ?? '')}</p>
          <p><strong>Insulation Type:</strong> ${escapeHtml(cable.insulation_type)}</p>
          <p><strong>Installation Type (in conduit, tray, buried):</strong> ${escapeHtml(cable.install_method)}</p>
          <p><strong>Short Circuit Rating (kA):</strong> ${escapeHtml(cable.short_circuit_rating ?? '')}</p>
          <p><strong>Grouping Factor:</strong> ${escapeHtml(cable.grouping_factor ?? '')}</p>
          <p><strong>Resistance Temp Correction Coeff:</strong> ${escapeHtml(cable.resistance_temp_correction_coeff ?? '')}</p>
          <p><strong>Core Configuration (1C,3C):</strong> ${escapeHtml(cable.core_configuration)}</p>
          <p><strong>Ground Return Path Resistance:</strong> ${escapeHtml(cable.ground_return_path_resistance ?? '')}</p>
          <p><strong>Impedance R (Ω):</strong> ${escapeHtml(getImpedancePart(cable, 'r') || '')}</p>
          <p><strong>Impedance X (Ω):</strong> ${escapeHtml(getImpedancePart(cable, 'x') || '')}</p>
        `;
        generalPanel.appendChild(cableInfo);

        const cableActions = document.createElement('div');
        cableActions.className = 'prop-tab-actions';
        const editCableBtn = document.createElement('button');
        editCableBtn.type = 'button';
        editCableBtn.textContent = 'Edit Segment Details';
        editCableBtn.classList.add('btn');
        editCableBtn.addEventListener('click', async () => {
          await editCableComponent(targetComp);
          renderPropertiesFor(targetComp);
        });
        cableActions.appendChild(editCableBtn);
        generalPanel.appendChild(cableActions);
      }
    }

    const actions = document.createElement('div');
    actions.className = 'prop-form-actions';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'submit';
    applyBtn.textContent = 'Apply';
    applyBtn.classList.add('btn');
    actions.appendChild(applyBtn);

    const templateBtn = document.createElement('button');
    templateBtn.type = 'button';
    templateBtn.textContent = 'Save as Template';
    templateBtn.classList.add('btn');
    templateBtn.addEventListener('click', async () => {
      const name = await promptDialog('Save Template', 'Template name', targetComp.label || targetComp.subtype);
      if (!name) return;
      const fd = new FormData(form);
      const data = {
        subtype: targetComp.subtype,
        type: getCategory(targetComp),
        rotation: targetComp.rotation || 0,
        flipped: !!targetComp.flipped
      };
      fields.forEach(f => {
        applyFieldFromForm(data, f, fd);
      });
      if (hasTccField) {
        data.tccId = fd.get('tccId') || '';
      }
      templates.push({ name, component: data });
      saveTemplates();
      renderTemplates();
      showToast('Template saved');
    });
    actions.appendChild(templateBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.classList.add('btn');
    cancelBtn.addEventListener('click', closeModal);
    actions.appendChild(cancelBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete Component';
    deleteBtn.classList.add('btn');
    deleteBtn.addEventListener('click', () => {
      components = components.filter(c => c !== targetComp);
      setComponents(components);
      components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => conn.target !== targetComp.id);
      });
      closeModal();
      pushHistory();
      render();
      save();
    });
    actions.appendChild(deleteBtn);

    form.appendChild(actions);

    if (isComponentPropertiesLocked(targetComp)) {
      const lockedNotice = document.createElement('p');
      lockedNotice.className = 'prop-property-lock-notice';
      lockedNotice.textContent = 'Properties are locked. Unlock them from the component context menu to edit this device.';
      form.prepend(lockedNotice);
      form.querySelectorAll('input, select, textarea').forEach(control => {
        control.disabled = true;
      });
      applyBtn.disabled = true;
      applyBtn.title = 'Unlock component properties to apply changes';
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      applyChanges();
      closeModal();
    });

    propertyContainer.classList.add('prop-property-container-form');
    propertyContainer.appendChild(form);
    propertyContainer.scrollTop = 0;

  }


  return renderPropertiesFor;
}
