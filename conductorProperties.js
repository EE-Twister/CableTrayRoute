function loadConductorProperties(){
  return fetch('data/conductor_properties.json')
    .then(r=>r.json())
    .then(data=>{window.CONDUCTOR_PROPS=data;return data;})
    .catch(err=>{console.error('Failed to load conductor properties',err);window.CONDUCTOR_PROPS={};return {};});
}

// Ensure the loader is available globally when modules are bundled.
if (typeof window !== 'undefined') {
  window.loadConductorProperties = loadConductorProperties;
}
