const MOTOR_HORSEPOWER_FIELDS = new Set(['hp', 'horsepower']);
const MOTOR_START_FIELDS = new Set([
  'inrushMultiple', 'lr_current_pu', 'thevenin_r', 'thevenin_x', 'inertia', 'load_torque_curve',
  'starter_type', 'vfd_current_limit_pu', 'initial_voltage_pu', 'ramp_time_s',
  'wye_delta_switch_time_s', 'autotransformer_tap', 'synchronous_speed_rpm',
  'full_load_amps', 'locked_rotor_current', 'locked_rotor_multiple', 'current_limit_pu',
  'start_time_s', 'stall_time', 'pf', 'power_factor', 'efficiency', 'full_load_efficiency_pct'
]);

export function classifyPropertyTarget(component, rawSchema, isSourceComponent) {
  const type = String(component?.type || '').toLowerCase();
  const subtype = String(component?.subtype || '').toLowerCase();
  const isMotorComponent = subtype === 'motor_load' || subtype === 'motor' || type === 'motor_load' || type === 'motor';
  const isMotorStudyComponent = isMotorComponent
    || type === 'motor_controller'
    || type === 'motor_starter'
    || subtype.includes('starter')
    || subtype === 'vfd'
    || subtype === 'soft_starter';
  const schemaNames = new Set((rawSchema || []).map(field => field?.name).filter(Boolean));
  return {
    isMotorComponent,
    isMotorStudyComponent,
    isStaticLoadComponent: subtype === 'static_load',
    isTransformerComponent: type === 'transformer',
    isSourceCategoryComponent: isSourceComponent(component),
    shouldApplyMotorDerivations: isMotorStudyComponent
      || [...MOTOR_HORSEPOWER_FIELDS].some(name => schemaNames.has(name))
  };
}

export function partitionPropertyFields({
  fields,
  baseFields,
  scheduleLinkFieldNames,
  isMotorStudyComponent,
  impedanceFieldNameSet,
  studyInputFieldNameSet,
  isPhysicalPropertyField,
  shouldApplyMotorDerivations,
  motorCalculatedFields
}) {
  const sections = {
    manufacturerFields: [],
    noteFields: [],
    electricalFields: [],
    motorStartFields: [],
    physicalFields: [],
    studyFields: [],
    scheduleLinkFields: [],
    generalFields: []
  };
  const baseFieldNames = new Set(baseFields.map(field => field.name));
  fields.forEach(field => {
    if (scheduleLinkFieldNames.has(field.name)) sections.scheduleLinkFields.push(field);
    else if (isMotorStudyComponent && MOTOR_START_FIELDS.has(field.name)) sections.motorStartFields.push(field);
    else if (impedanceFieldNameSet.has(field.name)) sections.electricalFields.push(field);
    else if (studyInputFieldNameSet.has(field.name)) sections.studyFields.push(field);
    else if (isPhysicalPropertyField(field)) sections.physicalFields.push(field);
    else if (['manufacturer', 'model'].includes(field.name)) sections.manufacturerFields.push(field);
    else if (['notes', 'failure_modes'].includes(field.name)) sections.noteFields.push(field);
    else if (baseFieldNames.has(field.name) || field.name === 'tccId') sections.generalFields.push(field);
    else sections.electricalFields.push(field);
  });
  if (shouldApplyMotorDerivations) {
    [
      sections.generalFields,
      sections.electricalFields,
      sections.physicalFields,
      sections.studyFields,
      sections.motorStartFields
    ].forEach(sectionFields => {
      const calculated = sectionFields.filter(field => motorCalculatedFields.has(field.name));
      const editable = sectionFields.filter(field => !motorCalculatedFields.has(field.name));
      sectionFields.splice(0, sectionFields.length, ...editable, ...calculated);
    });
  }
  return sections;
}
