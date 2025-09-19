(function(global){
  const FT_TO_M = 0.3048;
  const IN_TO_MM = 25.4;
  let cached = 'imperial';

  function getUnitSystem(){
    const storage = global.projectStorage;
    if (storage && typeof storage.getProjectState === 'function') {
      try { return storage.getProjectState().settings?.units || 'imperial'; }
      catch { return 'imperial'; }
    }
    return cached;
  }

  function setUnitSystem(sys){
    const val = sys === 'metric' ? 'metric' : 'imperial';
    const storage = global.projectStorage;
    if (storage && typeof storage.getProjectState === 'function' && typeof storage.setProjectState === 'function'){
      try {
        const proj = storage.getProjectState();
        proj.settings = proj.settings || {};
        proj.settings.units = val;
        storage.setProjectState(proj);
      } catch {}
    }
    cached = val;
  }

  function distanceToDisplay(ft){
    return getUnitSystem()==='imperial'?ft:ft*FT_TO_M;
  }
  function distanceFromInput(val){
    return getUnitSystem()==='imperial'?val:val/FT_TO_M;
  }
  function conduitToDisplay(inches){
    return getUnitSystem()==='imperial'?inches:inches*IN_TO_MM;
  }
  function conduitFromInput(val){
    return getUnitSystem()==='imperial'?val:val/IN_TO_MM;
  }
  function distanceLabel(){
    return getUnitSystem()==='imperial'?"ft":"m";
  }
  function conduitLabel(){
    return getUnitSystem()==='imperial'?"in":"mm";
  }
  function formatDistance(ft,prec=2){
    return `${distanceToDisplay(ft).toFixed(prec)} ${distanceLabel()}`;
  }
  function formatConduitSize(inches,prec=2){
    return `${conduitToDisplay(inches).toFixed(prec)} ${conduitLabel()}`;
  }

  const api={
    getUnitSystem,
    setUnitSystem,
    distanceToDisplay,
    distanceFromInput,
    conduitToDisplay,
    conduitFromInput,
    distanceLabel,
    conduitLabel,
    formatDistance,
    formatConduitSize
  };
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; }
  global.units=api;
})(typeof globalThis!=='undefined'?globalThis:window);
