checkPrereqs([{key:'cableSchedule',page:'cableschedule.html',label:'Cable Schedule'}]);

// Expose conduit specifications globally so other modules bundled into
// this file can access them after Rollup wraps everything in an IIFE. If
// the object isn't assigned to the global scope, modules like
// `ductbankTable.js` will throw a ReferenceError when they look up
// `CONDUIT_SPECS` during initialization.
const CONDUIT_SPECS = globalThis.CONDUIT_SPECS = {"EMT":{"1/2":0.304,"3/4":0.533,"1":0.864,"1-1/4":1.496,"1-1/2":2.036,"2":3.356,"2-1/2":5.858,"3":8.846,"3-1/2":11.545,"4":14.753},"ENT":{"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291},"FMC":{"3/8":0.116,"1/2":0.317,"3/4":0.533,"1":0.817,"1-1/4":1.277,"1-1/2":1.858,"2":3.269,"2-1/2":4.909,"3":7.069,"3-1/2":9.621,"4":12.566},"IMC":{"1/2":0.342,"3/4":0.586,"1":0.959,"1-1/4":1.647,"1-1/2":2.225,"2":3.63,"2-1/2":5.135,"3":7.922,"3-1/2":10.584,"4":13.631},"LFNC-A":{"3/8":0.192,"1/2":0.312,"3/4":0.535,"1":0.854,"1-1/4":1.502,"1-1/2":2.018,"2":3.343},"LFNC-B":{"3/8":0.192,"1/2":0.314,"3/4":0.541,"1":0.873,"1-1/4":1.528,"1-1/2":1.981,"2":3.246},"LFMC":{"3/8":0.192,"1/2":0.314,"3/4":0.541,"1":0.873,"1-1/4":1.277,"1-1/2":1.858,"2":3.269,"2-1/2":4.881,"3":7.475,"3-1/2":9.731,"4":12.692},"RMC":{"1/2":0.314,"3/4":0.549,"1":0.887,"1-1/4":1.526,"1-1/2":2.071,"2":3.408,"2-1/2":4.866,"3":7.499,"3-1/2":10.01,"4":12.882,"5":20.212,"6":29.158},"PVC Sch 80":{"1/2":0.217,"3/4":0.409,"1":0.688,"1-1/4":1.237,"1-1/2":1.711,"2":2.874,"2-1/2":4.119,"3":6.442,"3-1/2":8.688,"4":11.258,"5":17.855,"6":25.598},"PVC Sch 40":{"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291,"2-1/2":4.695,"3":7.268,"3-1/2":9.737,"4":12.554,"5":19.761,"6":28.567},"PVC Type A":{"1/2":0.385,"3/4":0.65,"1":1.084,"1-1/4":1.767,"1-1/2":2.324,"2":3.647,"2-1/2":5.453,"3":8.194,"3-1/2":10.694,"4":13.723},"PVC Type EB":{"2":3.874,"3":8.709,"3-1/2":11.365,"4":14.448,"5":22.195,"6":31.53}};

function parseSize(sz){
  if(sz.includes('-')){const[w,f]=sz.split('-');const[n,d]=f.split('/');return parseFloat(w)+parseFloat(n)/parseFloat(d);}
  if(sz.includes('/')){const[n,d]=sz.split('/');return parseFloat(n)/parseFloat(d);}
  return parseFloat(sz);
}

const CONDUIT_TYPES=Object.keys(CONDUIT_SPECS);
function tradeSizeOptions(type){
  return Object.keys(CONDUIT_SPECS[type]||{}).sort((a,b)=>parseSize(a)-parseSize(b));
}

const TRAY_WIDTH_OPTIONS=['2','3','4','6','8','9','12','16','18','20','24','30','36'];
const TRAY_DEPTH_OPTIONS=['2','3','4','5','6','7','8','9','10','11','12'];
const TRAY_TYPE_OPTIONS=['Ladder (50 % fill)','Solid Bottom (40 % fill)'];

document.addEventListener('DOMContentLoaded',()=>{
  initSettings();
  initDarkMode();
  initHelpModal('help-btn','help-modal','close-help-btn');
  initHelpModal('ductbank-help-btn','ductbank-help-modal');
  initHelpModal('tray-help-btn','tray-help-modal');
  initHelpModal('conduit-help-btn','conduit-help-modal');
  initNavToggle();
  function cablesForRaceway(id){
    try{
      const json=localStorage.getItem(TableUtils.STORAGE_KEYS.cableSchedule);
      if(!json) return [];
      const arr=JSON.parse(json);
      return arr
        .filter(c=>{
          let ids=c.raceway_ids;
          if(typeof ids==='string') ids=ids.split(',').map(s=>s.trim()).filter(Boolean);
          return Array.isArray(ids)&&ids.includes(id);
        })
        .map(c=>{
          const rawOd=c.cable_od??c.OD??c.od??c.diameter;
          const od=parseFloat(rawOd);
          const val=Number.isFinite(od)?od:undefined;
          return {
            ...c,
            cable_od:c.cable_od??val,
            OD:c.OD??val,
            od:c.od??val,
            diameter:c.diameter??val,
            rating:c.rating??c.cable_rating,
            voltage:c.voltage??c.operating_voltage,
            circuitGroup:c.circuitGroup??c.circuit_group,
            zone:c.zone??c.cable_zone
          };
        });
    }catch(e){console.error('Failed to load cables for',id,e);return[];}
  }
  let saved=true;
  const markSaved=()=>{saved=true;};
  const markUnsaved=()=>{saved=false;};
  window.addEventListener('beforeunload',e=>{if(!saved){e.preventDefault();e.returnValue='';}});

  document.addEventListener('keydown',e=>{
    if((e.key==='ArrowUp'||e.key==='ArrowDown')&&['INPUT','SELECT'].includes(e.target.tagName)){
      const td=e.target.closest('td');
      if(!td) return;
      const tr=td.parentElement;
      const tbody=tr.parentElement;
      const rows=Array.from(tbody.rows);
      let idx=rows.indexOf(tr);
      const dir=e.key==='ArrowUp'?-1:1;
      let targetRow;
      do{
        idx+=dir;
        targetRow=rows[idx];
      }while(targetRow&&(targetRow.style.display==='none'||targetRow.classList.contains('conduit-container')));
      if(targetRow&&targetRow.cells[td.cellIndex]){
        const next=targetRow.cells[td.cellIndex].querySelector('input,select');
        if(next){e.preventDefault();next.focus();if(typeof next.select==='function')next.select();}
      }else{
        e.preventDefault();
      }
    }
  });
  if(typeof initDuctbankTable==='function'){
    initDuctbankTable();
    const dbTable=document.getElementById('ductbankTable');
    if(dbTable){
      dbTable.addEventListener('input',markUnsaved);
      dbTable.addEventListener('click',e=>{if(e.target.tagName==='BUTTON'&&(['Add Conduit','Delete'].includes(e.target.textContent))) markUnsaved();});
    }
    ['add-ductbank-btn','delete-ductbank-btn'].forEach(id=>{const el=document.getElementById(id);if(el) el.addEventListener('click',markUnsaved);});
    const importDb=document.getElementById('import-ductbank-xlsx-input');
    if(importDb) importDb.addEventListener('change',markUnsaved);
    ['save-ductbank-btn','load-ductbank-btn','export-ductbank-xlsx-btn'].forEach(id=>{const el=document.getElementById(id);if(el) el.addEventListener('click',markSaved);});
  }

  const trayColumns=[
    {key:'tray_id',label:'Tray ID',type:'text',validate:['required']},
    {key:'start_x',label:'Start X',type:'number',validate:['required','numeric']},
    {key:'start_y',label:'Start Y',type:'number',validate:['required','numeric']},
    {key:'start_z',label:'Start Z',type:'number',validate:['required','numeric']},
    {key:'end_x',label:'End X',type:'number',validate:['required','numeric']},
    {key:'end_y',label:'End Y',type:'number',validate:['required','numeric']},
    {key:'end_z',label:'End Z',type:'number',validate:['required','numeric']},
    {key:'inside_width',label:'Inside Width (in)',type:'select',options:TRAY_WIDTH_OPTIONS,default:TRAY_WIDTH_OPTIONS[0],validate:['required']},
    {key:'tray_depth',label:'Tray Depth (in)',type:'select',options:TRAY_DEPTH_OPTIONS,default:TRAY_DEPTH_OPTIONS[0],validate:['required']},
    {key:'tray_type',label:'Tray Type',type:'select',options:TRAY_TYPE_OPTIONS,default:TRAY_TYPE_OPTIONS[0],validate:['required']}
  ];
  const trayTable=TableUtils.createTable({
    tableId:'trayTable',
    storageKey:TableUtils.STORAGE_KEYS.traySchedule,
    addRowBtnId:'add-tray-btn',
    saveBtnId:'save-tray-btn',
    loadBtnId:'load-tray-btn',
    clearFiltersBtnId:'clear-tray-filters-btn',
    exportBtnId:'export-tray-xlsx-btn',
    importInputId:'import-tray-xlsx-input',
    importBtnId:'import-tray-xlsx-btn',
    deleteAllBtnId:'delete-tray-btn',
    columns:trayColumns,
    onChange:markUnsaved,
    onSave:markSaved,
    rowCountId:'tray-row-count',
    onView:(row)=>{
      try{
        const tray={tray_id:row.tray_id,width:parseFloat(row.inside_width),height:parseFloat(row.tray_depth)};
        const cables=cablesForRaceway(row.tray_id);
        localStorage.setItem('trayFillData',JSON.stringify({tray,cables}));
      }catch(e){console.error('Failed to store tray fill data',e);}
      window.location.href='cabletrayfill.html';
    }
  });

  const conduitColumns=[
    {key:'conduit_id',label:'Conduit ID',type:'text',validate:['required']},
    {key:'type',label:'Type',type:'select',options:CONDUIT_TYPES,default:CONDUIT_TYPES[0],validate:['required'],onChange:(el,tr)=>{const sizeSel=tr.querySelector('select[name="trade_size"]');if(sizeSel){const opts=tradeSizeOptions(el.value);sizeSel.innerHTML='';opts.forEach(sz=>{const o=document.createElement('option');o.value=sz;o.textContent=sz;sizeSel.appendChild(o);});}}},
    {key:'trade_size',label:'Trade Size',type:'select',options:(tr)=>tradeSizeOptions(tr.querySelector('select[name="type"]').value),validate:['required']},
    {key:'start_x',label:'Start X',type:'number',validate:['required','numeric']},
    {key:'start_y',label:'Start Y',type:'number',validate:['required','numeric']},
    {key:'start_z',label:'Start Z',type:'number',validate:['required','numeric']},
    {key:'end_x',label:'End X',type:'number',validate:['required','numeric']},
    {key:'end_y',label:'End Y',type:'number',validate:['required','numeric']},
    {key:'end_z',label:'End Z',type:'number',validate:['required','numeric']},
    {key:'capacity',label:'Capacity',type:'number',validate:['numeric']}
  ];
  const conduitTable=TableUtils.createTable({
    tableId:'conduitTable',
    storageKey:TableUtils.STORAGE_KEYS.conduitSchedule,
    addRowBtnId:'add-conduit-btn',
    saveBtnId:'save-conduit-btn',
    loadBtnId:'load-conduit-btn',
    clearFiltersBtnId:'clear-conduit-filters-btn',
    exportBtnId:'export-conduit-xlsx-btn',
    importInputId:'import-conduit-xlsx-input',
    importBtnId:'import-conduit-xlsx-btn',
    deleteAllBtnId:'delete-conduit-btn',
    columns:conduitColumns,
    onChange:markUnsaved,
    onSave:markSaved,
    rowCountId:'conduit-row-count',
    onView:(row)=>{
      try{
        const cables=cablesForRaceway(row.conduit_id);
        localStorage.setItem('conduitFillData',JSON.stringify({type:row.type,tradeSize:row.trade_size,cables}));
      }catch(e){console.error('Failed to store conduit fill data',e);}
      window.location.href='conduitfill.html';
    }
  });

  const loadSampleBtn=document.getElementById('load-sample-raceway-btn');
  if(loadSampleBtn){
    loadSampleBtn.addEventListener('click',async()=>{
      try{
        const res=await fetch('examples/sample_raceways.json');
        const data=await res.json();
        localStorage.setItem(TableUtils.STORAGE_KEYS.ductbankSchedule,JSON.stringify(data.ductbanks));
        localStorage.setItem(TableUtils.STORAGE_KEYS.traySchedule,JSON.stringify(data.trays));
        localStorage.setItem(TableUtils.STORAGE_KEYS.conduitSchedule,JSON.stringify(data.conduits));
        document.getElementById('load-ductbank-btn').click();
        document.getElementById('load-tray-btn').click();
        document.getElementById('load-conduit-btn').click();
        markSaved();
      }catch(e){console.error('Failed to load sample raceway data',e);}
    });
  }

  function getRacewaySchedule(){
    saveDuctbanks();
    trayTable.save();
    conduitTable.save();
    return {ductbanks:getDuctbanks(),trays:trayTable.getData(),conduits:conduitTable.getData()};
  }
  window.getRacewaySchedule=getRacewaySchedule;
});

