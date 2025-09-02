import * as dataStore from './dataStore.mjs';
import { sampleDuctbanks, sampleConduits, sampleTrays, normalizeDuctbankRow, normalizeConduitRow, normalizeTrayRow } from './racewaySampleData.mjs';

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
  initCompactMode();
  initHelpModal('help-btn','help-modal','close-help-btn');
  initHelpModal('ductbank-help-btn','ductbank-help-modal');
  initHelpModal('tray-help-btn','tray-help-modal');
  initHelpModal('conduit-help-btn','conduit-help-modal');
  initNavToggle();
  const tables={};
  function assertTablesReady(){
    for(const [name,t] of Object.entries(tables)){
      if(!t || typeof t.setData !== 'function'){
        console.error(`Table '${name}' not initialized`);
        alert("Raceway tables not initialized. See console.");
        return false;
      }
    }
    return true;
  }
  function cablesForRaceway(id){
    try{
      const arr=dataStore.getCables();
      if(!arr) return [];
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
  const dirty = createDirtyTracker();
  const markSaved = () => dirty.markClean();
  const markUnsaved = () => dirty.markDirty();

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
    tables.ductbanks={
      async setData(rows){
        try{dataStore.setDuctbanks(rows);}catch(e){console.error('Failed to set ductbank data',e);}
        // Ensure ductbank table is initialized before loading
        if(!document.querySelector('#ductbankTable tbody')){
          window.initDuctbankTable?.();
        }
        if(typeof window.loadDuctbanks==='function') window.loadDuctbanks();
        const rendered=document.querySelectorAll('#ductbankTable tbody tr.ductbank-row').length;
        console.assert(rendered===rows.length && rendered>0,
          `Ductbank table rendered ${rendered} rows for ${rows.length} samples`);
      },
      getData(){try{return window.getDuctbanks?window.getDuctbanks():[];}catch{return[];}},
      getDataCount(){return this.getData().length;}
    };
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
    {key:'tray_type',label:'Tray Type',type:'select',options:TRAY_TYPE_OPTIONS,default:TRAY_TYPE_OPTIONS[0],validate:['required']},
    {key:'allowed_cable_group',label:'Allowed Group',type:'text'}
  ];
  const trayTable=TableUtils.createTable({
    tableId:'trayTable',
    storageKey:TableUtils.STORAGE_KEYS.trays,
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
        trayTable.save();
        const tray={tray_id:row.tray_id,width:parseFloat(row.inside_width),height:parseFloat(row.tray_depth),allowed_cable_group:row.allowed_cable_group};
        const cables=cablesForRaceway(row.tray_id);
        dataStore.setItem('trayFillData',{tray,cables});
      }catch(e){console.error('Failed to store tray fill data',e);}
      window.location.href='cabletrayfill.html';
    }
  });
  trayTable.setData=function(rows){
    this.tbody.innerHTML='';
    (rows||[]).forEach(r=>this.addRow(r));
    this.updateRowCount?.();
    this.applyFilters?.();
  };
  trayTable.getDataCount=function(){return this.getData().length;};
  tables.trays=trayTable;

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
    {key:'capacity',label:'Capacity',type:'number',validate:['numeric']},
    {key:'allowed_cable_group',label:'Allowed Group',type:'text'}
  ];
  const conduitTable=TableUtils.createTable({
    tableId:'conduitTable',
    storageKey:TableUtils.STORAGE_KEYS.conduits,
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
    onSave:()=>{markSaved();persistAllConduits();},
    rowCountId:'conduit-row-count',
    onView:(row)=>{
      try{
        const cables=cablesForRaceway(row.conduit_id);
        dataStore.setItem('conduitFillData',{type:row.type,tradeSize:row.trade_size,cables});
      }catch(e){console.error('Failed to store conduit fill data',e);}
      window.location.href='conduitfill.html';
    }
  });
  conduitTable.setData=function(rows){
    this.tbody.innerHTML='';
    (rows||[]).forEach(r=>this.addRow(r));
    this.updateRowCount?.();
    this.applyFilters?.();
  };
  conduitTable.getDataCount=function(){return this.getData().length;};
  tables.conduits=conduitTable;

  if(typeof window.saveDuctbanks==='function'){
    const origSave=window.saveDuctbanks;
    window.saveDuctbanks=()=>{origSave();persistAllConduits();};
  }

  function showToast(msg,type='success'){
    const t=document.getElementById('toast');
    if(!t)return; t.textContent=msg;
    t.className='toast '+(type==='error'?'toast-error':'toast-success');
    requestAnimationFrame(()=>t.classList.add('show'));
    setTimeout(()=>t.classList.remove('show'),4000);
  }

  async function onRacewayLoadSamples(){
    if(!assertTablesReady()) return;
    console.time('raceway:loadSamples');
    try{
      const dbRows=sampleDuctbanks.map(normalizeDuctbankRow);
      const trayRows=sampleTrays.map(normalizeTrayRow);
      const conduitRowsRaw=sampleConduits.map(normalizeConduitRow);
      const tags=new Set(dbRows.map(db=>String(db.tag||'').trim().toLowerCase()));
      const dbConduits=[]; const standalone=[]; const skipped=[];
      conduitRowsRaw.forEach(c=>{
        const tag=(c.ductbankTag||'').trim().toLowerCase();
        if(tag && tags.has(tag)) dbConduits.push(c);
        else if(tag) skipped.push(c);
        else standalone.push(c);
      });
      const nested=dbRows.map(db=>({
        ...db,
        conduits: dbConduits.filter(c=> (c.ductbankTag||'').trim().toLowerCase()===String(db.tag||'').trim().toLowerCase())
      }));
      await tables.ductbanks.setData(nested);
      await tables.trays.setData(trayRows);
      await tables.conduits.setData(standalone);
      dataStore.setDuctbanks(nested);
      dataStore.setTrays(trayRows);
      dataStore.setConduits([...dbConduits,...standalone]);
      persistConduits({ductbanks:dbRows,conduits:[...dbConduits,...standalone]});
      markSaved();
      if(skipped.length) console.warn('Skipped conduits without matching ductbank',skipped);
      console.table(nested);
      console.table([...dbConduits,...standalone]);
      console.table(trayRows);
      const dbCount=document.querySelectorAll('#ductbankTable tbody tr.ductbank-row').length;
      console.assert(dbCount>0,`Ductbank table is empty after sample load (count=${dbCount})`);
      const conduitCount=dbConduits.length+standalone.length;
      console.log(`Loaded samples: ductbanks=${dbRows.length}, trays=${trayRows.length}, conduits=${conduitCount}`);
      showToast(`Loaded samples: ${dbRows.length} ductbanks, ${conduitCount} conduits, ${trayRows.length} trays.`,'success');
    }catch(err){
      console.error(err);
      showToast('Sample load failed – see console.','error');
    }finally{
      console.timeEnd('raceway:loadSamples');
    }
  }

  function serializeDuctbankSchedule(){
    const nested=getDuctbanks();
    const ductbanks=nested.map(({conduits,...db})=>db);
    const conduits=[];
    nested.forEach(db=>{
      (db.conduits||[]).forEach(c=>{
        c.ductbankTag=db.tag;
        conduits.push({
          ductbankTag:db.tag,
          conduit_id:c.conduit_id,
          tray_id:`${db.tag}-${c.conduit_id}`,
          type:c.type,
          trade_size:c.trade_size,
          start_x:c.start_x,
          start_y:c.start_y,
          start_z:c.start_z,
          end_x:c.end_x,
          end_y:c.end_y,
          end_z:c.end_z,
          allowed_cable_group:c.allowed_cable_group
        });
      });
    });
    return {ductbanks,conduits};
  }

  function persistAllConduits(){
    const {ductbanks,conduits:dbConduits}=serializeDuctbankSchedule();
    const standalone=conduitTable.getData();
    const all=[...dbConduits,...standalone];
    persistConduits({ductbanks,conduits:all});
    try{dataStore.setConduits(all);}catch(e){console.error('Failed to store conduits',e);}
  }

  function getRacewaySchedule(){
    saveDuctbanks();
    trayTable.save();
    conduitTable.save();
    const {ductbanks,conduits:dbConduits}=serializeDuctbankSchedule();
    const conduits=[...dbConduits,...conduitTable.getData()];
    return {ductbanks,trays:trayTable.getData(),conduits};
  }
  window.getRacewaySchedule=getRacewaySchedule;
  persistAllConduits();
  document.getElementById('raceway-load-samples')?.addEventListener('click', onRacewayLoadSamples, { once:false });

  const normalize=s=>(s||'').trim().toUpperCase();

  function attachConduitsToDuctbanks(rows){
    const banks=(typeof window.getDuctbanks==='function'?window.getDuctbanks():[]);
    const tags=new Set(banks.map(db=>normalize(db.tag)));
    const map={};
    rows.forEach(r=>{
      const tag=normalize(r.ductbankTag||r.ductbank_tag);
      if(tags.has(tag)){(map[tag] ||= []).push(r);r._unmapped=false;}
      else{r._unmapped=true;}
    });
    globalThis.conduitsByDb=map;
    return map;
  }

  function parseCsv(txt){
    const lines=txt.trim().split(/\r?\n/);
    const headers=lines.shift().split(',').map(h=>h.trim());
    return lines.filter(Boolean).map(line=>{
      const cols=line.split(',');
      const obj={};
      headers.forEach((h,i)=>obj[h]=(cols[i]||'').trim());
      return obj;
    });
  }

  async function parseConduitFile(file){
    const name=file.name.toLowerCase();
    if(name.endsWith('.csv')) return parseCsv(await file.text());
    const data=new Uint8Array(await file.arrayBuffer());
    const wb=XLSX.read(data,{type:'array'});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  }

  function showConduitsWizard(){
    const overlay=document.createElement('div');
    overlay.id='conduits-wizard';
    overlay.style.position='fixed';
    overlay.style.top=0;overlay.style.left=0;overlay.style.right=0;overlay.style.bottom=0;
    overlay.style.background='rgba(0,0,0,0.5)';
    overlay.style.display='flex';
    overlay.style.alignItems='center';
    overlay.style.justifyContent='center';
    overlay.style.zIndex='1000';
    overlay.innerHTML=`<div style="background:#fff;padding:20px;max-width:400px;width:90%;">
        <h3>Add/Import Conduits</h3>
        <input type="file" id="wizard-conduit-file" accept=".csv,.xlsx">
        <div style="margin-top:8px;">
          <button id="wizard-load-sample">Load Sample</button>
          <button id="wizard-close">Close</button>
        </div>
        <table id="wizard-conduit-table" style="margin-top:10px;width:100%;border-collapse:collapse;">
          <thead><tr><th>Ductbank Tag</th><th>Conduit ID</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>`;
    const close=()=>overlay.remove();
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.body.appendChild(overlay);
    overlay.querySelector('#wizard-close').addEventListener('click',close);
    const processRows=rows=>{
      attachConduitsToDuctbanks(rows);
      persistConduits({ductbanks: typeof window.getDuctbanks==='function'?window.getDuctbanks():[], conduits: rows});
      const tbody=overlay.querySelector('#wizard-conduit-table tbody');
      tbody.innerHTML='';
      rows.forEach(r=>{
        const tr=document.createElement('tr');
        if(r._unmapped) tr.classList.add('missing-tag-row');
        tr.innerHTML=`<td>${r.ductbankTag||''}</td><td>${r.conduit_id||''}</td>`;
        tbody.appendChild(tr);
      });
    };
    overlay.querySelector('#wizard-conduit-file').addEventListener('change',async e=>{
      const f=e.target.files[0];if(f){const rows=await parseConduitFile(f);processRows(rows);} });
    overlay.querySelector('#wizard-load-sample').addEventListener('click',async()=>{
      const res=await fetch('examples/ductbank_schedule_conduits.csv');
      const txt=await res.text();
      processRows(parseCsv(txt));
    });
  }

  const params=new URLSearchParams(window.location.search);
  if(params.get('expandAll')==='true'){
    document.querySelectorAll('#ductbankTable tbody tr.ductbank-row td:first-child button').forEach(btn=>{if(btn.textContent==='\u25B6') btn.click();});
  }
  if(params.get('focus')==='ductbanks'){
    const tbl=document.getElementById('ductbankTable');
    if(tbl) tbl.scrollIntoView({behavior:'smooth',block:'start'});
  }
  if(params.get('showConduitsWizard')==='true') showConduitsWizard();

  // Validation button and lint panel
  const validateBtn=document.getElementById('validate-raceway-btn');
  const lintPanel=document.getElementById('lint-panel');
  const lintList=document.getElementById('lint-list');
  const lintCloseBtn=document.getElementById('lint-close-btn');

  function focusIssue(issue){
    if(!issue) return;
    let row, el;
    if(issue.table==='tray'){
      row=document.querySelector(`#trayTable tbody tr:nth-child(${issue.row+1})`);
      el=row?row.querySelector(`[name="${issue.col}"]`):null;
    }else if(issue.table==='conduit'){
      row=document.querySelector(`#conduitTable tbody tr:nth-child(${issue.row+1})`);
      el=row?row.querySelector(`[name="${issue.col}"]`):null;
    }else if(issue.table==='ductbank'){
      const rows=document.querySelectorAll('#ductbankTable tbody tr.ductbank-row');
      row=rows[issue.row];
      el=row?row.cells[1].querySelector('input'):null;
    }
    if(el){
      el.focus();
      if(typeof el.scrollIntoView==='function') el.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }

  function lintRaceways(){
    const issues=[];
    // Duplicate ductbank tags
    const ductbanks=getDuctbanks();
    const dbTags=new Set();
    ductbanks.forEach((db,i)=>{
      if(dbTags.has(db.tag)) issues.push({message:`Duplicate ductbank tag "${db.tag}"`,table:'ductbank',row:i});
      dbTags.add(db.tag);
    });
    // Tray checks
    const trays=trayTable.getData();
    const trayIds=new Set();
    trays.forEach((t,i)=>{
      if(trayIds.has(t.tray_id)) issues.push({message:`Duplicate tray ID "${t.tray_id}"`,table:'tray',row:i,col:'tray_id'});
      trayIds.add(t.tray_id);
      const sx=parseFloat(t.start_x), sy=parseFloat(t.start_y), sz=parseFloat(t.start_z);
      const ex=parseFloat(t.end_x), ey=parseFloat(t.end_y), ez=parseFloat(t.end_z);
      if(sx===ex && sy===ey && sz===ez) issues.push({message:`Tray ${t.tray_id} has zero length`,table:'tray',row:i,col:'end_x'});
      if(ex<sx || ey<sy || ez<sz) issues.push({message:`Tray ${t.tray_id} has non-monotonic coordinates`,table:'tray',row:i,col:'end_x'});
    });
    // Conduit checks
    const conduits=conduitTable.getData();
    const cIds=new Set();
    conduits.forEach((c,i)=>{
      if(cIds.has(c.conduit_id)) issues.push({message:`Duplicate conduit ID "${c.conduit_id}"`,table:'conduit',row:i,col:'conduit_id'});
      cIds.add(c.conduit_id);
      const sx=parseFloat(c.start_x), sy=parseFloat(c.start_y), sz=parseFloat(c.start_z);
      const ex=parseFloat(c.end_x), ey=parseFloat(c.end_y), ez=parseFloat(c.end_z);
      if([sx,sy,sz,ex,ey,ez].some(v=>!Number.isFinite(v))) issues.push({message:`Dangling conduit ${c.conduit_id}`,table:'conduit',row:i,col:'start_x'});
      if(ex<sx || ey<sy || ez<sz) issues.push({message:`Conduit ${c.conduit_id} has non-monotonic coordinates`,table:'conduit',row:i,col:'end_x'});
      if(!CONDUIT_SPECS[c.type] || !CONDUIT_SPECS[c.type][c.trade_size]) issues.push({message:`Conduit ${c.conduit_id} has illegal size`,table:'conduit',row:i,col:'trade_size'});
    });
    return issues;
  }

  if(validateBtn){
    validateBtn.addEventListener('click',()=>{
      const issues=lintRaceways();
      lintList.innerHTML='';
      if(issues.length===0){
        const li=document.createElement('li');
        li.textContent='No issues found';
        lintList.appendChild(li);
      }else{
        issues.forEach(issue=>{
          const li=document.createElement('li');
          li.textContent=issue.message;
          li.addEventListener('click',()=>focusIssue(issue));
          lintList.appendChild(li);
        });
      }
      lintPanel.classList.remove('hidden');
    });
  }

  if(lintCloseBtn){
    lintCloseBtn.addEventListener('click',()=>{
      lintPanel.classList.add('hidden');
    });
  }
});

