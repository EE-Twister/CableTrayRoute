// Load typical soil thermal resistivity values (\u00b0C\u00b7cm/W) from JSON
// This exposes two globals:
//   SOIL_RESISTIVITY_DATA    - map of soil description -> resistivity
//   SOIL_RESISTIVITY_OPTIONS - array of resistivity values
function loadSoilResistivityData(){
  return fetch('data/soil_resistivity.json')
    .then(r => r.json())
    .then(data => {
      window.SOIL_RESISTIVITY_DATA = data;
      window.SOIL_RESISTIVITY_OPTIONS = Object.values(data);
      return data;
    })
    .catch(err => {
      console.error('Failed to load soil resistivity data', err);
      window.SOIL_RESISTIVITY_DATA = {};
      window.SOIL_RESISTIVITY_OPTIONS = [];
      return {};
    });
}
