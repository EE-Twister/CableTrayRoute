import { validateCatalogProduct } from '../../analysis/manufacturerCatalog.mjs';

function buildError(path, message, severity = 'error') {
  return { path, message, severity };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateMccComponent(component, index, errors) {
  const subtype = `${component?.subtype || ''}`.trim().toLowerCase();
  if (subtype !== 'mcc') return;
  if (!isPlainObject(component.props)) {
    errors.push(buildError(`components[${index}].props`, 'mcc component props must be an object.'));
    return;
  }
  const requiredStringProps = [
    'tag',
    'description',
    'manufacturer',
    'model',
    'main_device_type',
    'form_type'
  ];
  requiredStringProps.forEach((propKey) => {
    if (!isNonEmptyString(component.props[propKey])) {
      errors.push(buildError(
        `components[${index}].props.${propKey}`,
        `mcc.${propKey} is required and must be a non-empty string.`,
      ));
    }
  });

  const positiveNumberProps = ['rated_voltage_kv', 'bus_rating_a', 'sccr_ka', 'bucket_count'];
  positiveNumberProps.forEach((propKey) => {
    const value = Number(component.props[propKey]);
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(buildError(
        `components[${index}].props.${propKey}`,
        `mcc.${propKey} must be a finite number greater than 0.`,
      ));
    }
  });

  const spareBucketCount = Number(component.props.spare_bucket_count);
  const bucketCount = Number(component.props.bucket_count);
  if (!Number.isFinite(spareBucketCount) || spareBucketCount < 0) {
    errors.push(buildError(
      `components[${index}].props.spare_bucket_count`,
      'mcc.spare_bucket_count must be a finite number greater than or equal to 0.',
    ));
  } else if (Number.isFinite(bucketCount) && spareBucketCount > bucketCount) {
    errors.push(buildError(
      `components[${index}].props.spare_bucket_count`,
      'mcc.spare_bucket_count cannot exceed mcc.bucket_count.',
    ));
  }
}

const NEMA_DESIGN_CLASSES = new Set(['A', 'B', 'C', 'D']);
const VALID_STARTER_TYPES = new Set(['dol', 'vfd', 'soft_starter', 'wye_delta', 'autotransformer']);
const VALID_COMMISSIONING_STATES = new Set(['in_service', 'spare', 'decommissioned']);

function validateMotorComponent(component, index, errors) {
  const subtype = `${component?.subtype || ''}`.trim().toLowerCase();
  if (subtype !== 'motor') return;
  if (!isPlainObject(component.props)) {
    errors.push(buildError(`components[${index}].props`, 'motor component props must be an object.'));
    return;
  }
  const p = component.props;

  const requiredStringProps = ['tag', 'description', 'manufacturer', 'model'];
  requiredStringProps.forEach((key) => {
    if (typeof p[key] !== 'string') {
      errors.push(buildError(
        `components[${index}].props.${key}`,
        `motor.${key} is required and must be a string.`,
      ));
    }
  });

  const positiveNumbers = ['rated_hp', 'rated_voltage_kv', 'synchronous_speed_rpm', 'lr_current_pu'];
  positiveNumbers.forEach((key) => {
    const val = Number(p[key]);
    if (!Number.isFinite(val) || val <= 0) {
      errors.push(buildError(
        `components[${index}].props.${key}`,
        `motor.${key} must be a finite number greater than 0.`,
      ));
    }
  });

  const pf = Number(p.full_load_pf);
  if (!Number.isFinite(pf) || pf <= 0 || pf > 1) {
    errors.push(buildError(
      `components[${index}].props.full_load_pf`,
      'motor.full_load_pf must be a number in the range (0, 1].',
    ));
  }

  const eff = Number(p.full_load_efficiency_pct);
  if (!Number.isFinite(eff) || eff <= 0 || eff > 100) {
    errors.push(buildError(
      `components[${index}].props.full_load_efficiency_pct`,
      'motor.full_load_efficiency_pct must be a number in the range (0, 100].',
    ));
  }

  if (p.design_class !== undefined && !NEMA_DESIGN_CLASSES.has(String(p.design_class).toUpperCase())) {
    errors.push(buildError(
      `components[${index}].props.design_class`,
      `motor.design_class must be one of: ${[...NEMA_DESIGN_CLASSES].join(', ')}.`,
    ));
  }

  if (p.starter_type !== undefined && !VALID_STARTER_TYPES.has(String(p.starter_type).toLowerCase())) {
    errors.push(buildError(
      `components[${index}].props.starter_type`,
      `motor.starter_type must be one of: ${[...VALID_STARTER_TYPES].join(', ')}.`,
    ));
  }

  if (p.commissioning_state !== undefined && !VALID_COMMISSIONING_STATES.has(String(p.commissioning_state))) {
    errors.push(buildError(
      `components[${index}].props.commissioning_state`,
      `motor.commissioning_state must be one of: ${[...VALID_COMMISSIONING_STATES].join(', ')}.`,
    ));
  }
}

function validateComponent(component, index, categoriesSet, subtypeMap, errors) {
  if (!isPlainObject(component)) {
    errors.push(buildError(`components[${index}]`, 'Component must be an object.'));
    return;
  }

  const requiredFields = ['subtype', 'label', 'icon'];
  requiredFields.forEach((field) => {
    if (!isNonEmptyString(component[field])) {
      errors.push(
        buildError(`components[${index}].${field}`, `${field} is required and must be a non-empty string.`),
      );
    }
  });

  if (
    component.ports !== undefined
    && !isFiniteNumber(component.ports)
    && !(
      Array.isArray(component.ports)
      && component.ports.every(port => (
        isPlainObject(port)
        && isFiniteNumber(Number(port.x))
        && isFiniteNumber(Number(port.y))
      ))
    )
  ) {
    errors.push(buildError(
      `components[${index}].ports`,
      'ports must be a finite count or an array of finite {x, y} coordinates.',
    ));
  }

  if (component.schema !== undefined && !isPlainObject(component.schema)) {
    errors.push(buildError(`components[${index}].schema`, 'schema must be a JSON object.'));
  }

  if (component.category !== undefined && !isNonEmptyString(component.category)) {
    errors.push(buildError(`components[${index}].category`, 'category must be a non-empty string when provided.'));
  } else if (isNonEmptyString(component.category) && categoriesSet.size && !categoriesSet.has(component.category.trim())) {
    errors.push(
      buildError(
        `components[${index}].category`,
        `category "${component.category}" is not listed in categories.`,
        'warning',
      ),
    );
  }

  validateMccComponent(component, index, errors);
  validateMotorComponent(component, index, errors);
  validateCatalogMetadata(component, index, errors);

  if (isNonEmptyString(component.subtype)) {
    const normalizedSubtype = component.subtype.trim();
    const firstIndex = subtypeMap.get(normalizedSubtype);
    if (firstIndex === undefined) {
      subtypeMap.set(normalizedSubtype, index);
    } else {
      errors.push(
        buildError(
          `components[${index}].subtype`,
          `Duplicate subtype "${normalizedSubtype}" already used at components[${firstIndex}].subtype.`,
        ),
      );
    }
  }
}

function validateCatalogMetadata(component, index, errors) {
  if (!isPlainObject(component.props)) return;
  const props = component.props;
  const approved = props.approved_part === true || props.catalog_approved === true;
  const hasCatalogFields = approved
    || isNonEmptyString(props.catalog_number)
    || isNonEmptyString(props.catalogNumber)
    || isNonEmptyString(props.catalog_source)
    || isNonEmptyString(props.catalog_last_verified)
    || isNonEmptyString(props.datasheet_url);
  if (!hasCatalogFields) return;

  const result = validateCatalogProduct({
    id: props.catalog_number || props.catalogNumber || component.subtype || component.label,
    manufacturer: props.manufacturer,
    catalogNumber: props.catalog_number || props.catalogNumber,
    category: component.category || component.type,
    description: props.description || component.label,
    unit: props.catalog_unit || 'EA',
    approved,
    source: props.catalog_source,
    lastVerified: props.catalog_last_verified,
    datasheetUrl: props.datasheet_url,
    standards: props.standards
  }, { requireApprovalAuthority: false });

  result.errors.forEach((error) => {
    errors.push(buildError(
      `components[${index}].props.${error.path}`,
      `catalog metadata: ${error.message}`
    ));
  });

  result.warnings.forEach((warning) => {
    errors.push(buildError(
      `components[${index}].props.${warning.path}`,
      `catalog metadata: ${warning.message}`,
      'warning'
    ));
  });
}

/**
 * Primary validator for library payloads before local/cloud persistence.
 * Future spreadsheet import parsers should call this function before saving.
 */
export function validateLibraryPayload(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: [buildError('', 'Library payload must be an object with { categories, components, icons }.')],
    };
  }

  const expectedTopLevel = ['categories', 'components', 'icons'];
  expectedTopLevel.forEach((key) => {
    if (!(key in payload)) {
      errors.push(buildError(key, `${key} is required.`));
    }
  });

  const categories = payload.categories;
  const components = payload.components;
  const icons = payload.icons;

  if (!Array.isArray(categories)) {
    errors.push(buildError('categories', 'categories must be an array of strings.'));
  }
  if (!Array.isArray(components)) {
    errors.push(buildError('components', 'components must be an array of component objects.'));
  }
  if (!isPlainObject(icons)) {
    errors.push(buildError('icons', 'icons must be an object map of icon keys to paths.'));
  }

  const categorySet = new Set();
  if (Array.isArray(categories)) {
    categories.forEach((value, index) => {
      if (!isNonEmptyString(value)) {
        errors.push(buildError(`categories[${index}]`, 'Category must be a non-empty string.'));
        return;
      }
      const category = value.trim();
      if (categorySet.has(category)) {
        errors.push(buildError(`categories[${index}]`, `Duplicate category "${category}".`));
        return;
      }
      categorySet.add(category);
    });
  }

  if (isPlainObject(icons)) {
    Object.entries(icons).forEach(([key, value]) => {
      if (!isNonEmptyString(key)) {
        errors.push(buildError('icons', 'Icon keys must be non-empty strings.'));
      }
      if (!isNonEmptyString(value)) {
        errors.push(buildError(`icons.${key || '(empty)'}`, 'Icon path must be a non-empty string.'));
      }
    });
  }

  if (Array.isArray(components)) {
    const subtypeMap = new Map();
    components.forEach((component, index) => {
      validateComponent(component, index, categorySet, subtypeMap, errors);
    });
  }

  return {
    valid: errors.filter((item) => item.severity !== 'warning').length === 0,
    errors,
  };
}

export function assertValidLibraryPayload(payload) {
  const validation = validateLibraryPayload(payload);
  if (!validation.valid) {
    const error = new Error('library-validation-failed');
    error.code = 'LIBRARY_VALIDATION_FAILED';
    error.validation = validation;
    throw error;
  }
  return validation;
}
