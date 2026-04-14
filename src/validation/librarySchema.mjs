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

function validateComponent(component, index, categoriesSet, subtypeMap, errors) {
  if (!isPlainObject(component)) {
    errors.push(buildError(`components[${index}]`, 'Component must be an object.'));
    return;
  }

  const requiredFields = ['subtype', 'label', 'icon', 'category'];
  requiredFields.forEach((field) => {
    if (!isNonEmptyString(component[field])) {
      errors.push(
        buildError(`components[${index}].${field}`, `${field} is required and must be a non-empty string.`),
      );
    }
  });

  if (component.ports !== undefined && !isFiniteNumber(component.ports)) {
    errors.push(buildError(`components[${index}].ports`, 'ports must be a finite number.'));
  }

  if (component.schema !== undefined && !isPlainObject(component.schema)) {
    errors.push(buildError(`components[${index}].schema`, 'schema must be a JSON object.'));
  }

  if (isNonEmptyString(component.category) && categoriesSet.size && !categoriesSet.has(component.category.trim())) {
    errors.push(
      buildError(
        `components[${index}].category`,
        `category "${component.category}" is not listed in categories.`,
        'warning',
      ),
    );
  }

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
