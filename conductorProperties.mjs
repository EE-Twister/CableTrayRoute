import fallbackData from './data/conductor_properties.js';

export async function loadConductorProperties() {
  // Node does not currently support fetching local files with the Fetch API.
  // When running under Node (no `window` object), fall back to the bundled
  // data module instead of attempting a fetch that will always fail.
  if (typeof window === 'undefined') {
    try {
      return (await import('./conductorPropertiesData.mjs')).default;
    } catch (err) {
      console.warn('Failed to load conductor properties', err);
      return fallbackData;
    }
  }

  window.CONDUCTOR_PROPS = fallbackData;
  return fallbackData;
}

// Ensure the loader is available globally when modules are bundled.
if (typeof window !== 'undefined') {
  window.loadConductorProperties = loadConductorProperties;
}
