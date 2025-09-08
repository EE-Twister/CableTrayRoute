export async function loadConductorProperties() {
  try {
    const url = new URL('./data/conductor_properties.json', import.meta.url);
    const res = await fetch(url);
    const data = await res.json();
    if (typeof window !== 'undefined') {
      window.CONDUCTOR_PROPS = data;
    }
    return data;
  } catch (err) {
    console.warn('Failed to load conductor properties', err);
    if (typeof window !== 'undefined') {
      window.CONDUCTOR_PROPS = {};
    }
    try {
      return (await import('./conductorProperties.mjs')).default;
    } catch {
      return {};
    }
  }
}

// Ensure the loader is available globally when modules are bundled.
if (typeof window !== 'undefined') {
  window.loadConductorProperties = loadConductorProperties;
}
