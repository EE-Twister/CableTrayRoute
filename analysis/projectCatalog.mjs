import { getTrayHardwareCatalogCustomProducts } from '../dataStore.mjs';
import { mergeCatalogProducts, normalizeCatalogProduct } from './manufacturerCatalog.mjs';

const CATALOG_URL = 'data/manufacturer_catalog.json';
let baseCatalogPromise = null;

async function loadBaseCatalog() {
  if (!baseCatalogPromise) {
    baseCatalogPromise = fetch(CATALOG_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load catalog: HTTP ${response.status}`);
        return response.json();
      })
      .then(data => (Array.isArray(data.products) ? data.products : [])
        .map(product => normalizeCatalogProduct(product, { source: data._description || 'Manufacturer catalog' }))
        .filter(Boolean));
  }
  return baseCatalogPromise;
}

/** Load the immutable starter rows combined with the active project's catalog rows. */
export async function loadProjectManufacturerCatalog() {
  const base = await loadBaseCatalog();
  return mergeCatalogProducts(base, getTrayHardwareCatalogCustomProducts());
}
