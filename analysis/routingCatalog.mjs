import { catalogIdentity, normalizeCatalogProduct } from './manufacturerCatalog.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesDimension(actual, expected) {
  if (!(actual > 0) || !(expected > 0)) return true;
  return Math.abs(actual - expected) <= 0.25;
}

export function routeCatalogCategory(routeKind) {
  return routeKind === 'conduit' ? 'conduit' : 'tray';
}

/**
 * Return approved catalog products compatible with a route segment. Tray rows
 * must match the catalog width/depth when those dimensions are declared.
 */
export function compatibleRouteCatalogProducts(products = [], route = {}, routeKind = 'tray') {
  const category = routeCatalogCategory(routeKind);
  const width = number(route.inside_width ?? route.width);
  const depth = number(route.tray_depth ?? route.depth ?? route.height);
  return (Array.isArray(products) ? products : [])
    .map(product => normalizeCatalogProduct(product))
    .filter(product => product && product.category === category && product.approved === true)
    .filter((product) => {
      if (category !== 'tray') return true;
      return matchesDimension(width, number(product.dimensions?.widthIn))
        && matchesDimension(depth, number(product.dimensions?.depthIn));
    })
    .sort((a, b) => `${a.manufacturer} ${a.catalogNumber}`.localeCompare(`${b.manufacturer} ${b.catalogNumber}`));
}

export function routeCatalogOptionLabel(product) {
  const normalized = normalizeCatalogProduct(product);
  if (!normalized) return '';
  const dimensions = normalized.category === 'tray'
    ? [normalized.dimensions?.widthIn, normalized.dimensions?.depthIn].every(value => Number(value) > 0)
      ? ` — ${normalized.dimensions.widthIn} in × ${normalized.dimensions.depthIn} in`
      : ''
    : '';
  return `${normalized.manufacturer} ${normalized.catalogNumber}${dimensions}`;
}

/**
 * Copy a governed approved product into a routing record. The result keeps a
 * source/date snapshot so downstream BOM and export data remain traceable even
 * if the project catalog subsequently changes.
 */
export function assignCatalogProductToRoute(route = {}, product, routeKind = 'tray') {
  const normalized = normalizeCatalogProduct(product);
  if (!normalized || normalized.category !== routeCatalogCategory(routeKind)) {
    return { valid: false, route: { ...route }, error: `Select an approved ${routeCatalogCategory(routeKind)} catalog product.` };
  }
  if (!normalized.approved) {
    return { valid: false, route: { ...route }, error: 'Only project-approved catalog products can be assigned to routed segments.' };
  }
  const compatible = compatibleRouteCatalogProducts([normalized], route, routeKind).length > 0;
  if (!compatible) {
    return { valid: false, route: { ...route }, error: 'The catalog product dimensions do not match this routed tray segment.' };
  }
  const productLabel = routeCatalogOptionLabel(normalized);
  return {
    valid: true,
    route: {
      ...route,
      catalog_product: productLabel,
      catalog_identity: catalogIdentity(normalized),
      manufacturer: normalized.manufacturer,
      catalog_number: normalized.catalogNumber,
      catalogNumber: normalized.catalogNumber,
      approved_part: true,
      catalog_source: normalized.source,
      catalog_last_verified: normalized.lastVerified,
      catalog_datasheet_url: normalized.datasheetUrl,
      catalog_approval_status: normalized.approval?.status || 'approved'
    }
  };
}

export function catalogAssignmentForRoute(route = {}) {
  const catalogNumber = text(route.catalog_number ?? route.catalogNumber);
  if (!catalogNumber) return null;
  return {
    catalog_product: text(route.catalog_product),
    catalog_identity: text(route.catalog_identity),
    manufacturer: text(route.manufacturer),
    catalog_number: catalogNumber,
    approved_part: route.approved_part === true || String(route.approved_part).toLowerCase() === 'true',
    catalog_source: text(route.catalog_source),
    catalog_last_verified: text(route.catalog_last_verified),
    catalog_datasheet_url: text(route.catalog_datasheet_url),
    catalog_approval_status: text(route.catalog_approval_status)
  };
}
