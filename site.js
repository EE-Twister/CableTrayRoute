import "./units.js";
const FOCUSABLE="a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";
const PROJECT_KEY='CTR_PROJECT_V1';

function defaultProject(){
  return {name:'',ductbanks:[],conduits:[],trays:[],cables:[],settings:{session:{},collapsedGroups:{},units:'imperial'}};
}

function migrateProject(old={}){
  const settings = old.settings || {
    session: old.session || old.ctrSession || {},
    collapsedGroups: old.collapsedGroups || {}
  };
  if(!settings.units) settings.units='imperial';
  return {
    name: old.name || '',
    ductbanks: old.ductbanks || old.ductbankSchedule || [],
    conduits: old.conduits || old.conduitSchedule || [],
    trays: old.trays || old.traySchedule || [],
    cables: old.cables || old.cableSchedule || [],
    settings
  };
}

function initProjectStorage(){
  if(typeof localStorage==='undefined')return;
  const realGet=localStorage.getItem.bind(localStorage);
  const realSet=localStorage.setItem.bind(localStorage);
  const realRemove=localStorage.removeItem.bind(localStorage);

  let project;
  try{ project=JSON.parse(realGet(PROJECT_KEY)); }catch{ project=null; }
  if(!project||typeof project!=='object'){
    const old={
      cables: JSON.parse(realGet('cableSchedule')||'[]'),
      trays: JSON.parse(realGet('traySchedule')||'[]'),
      conduits: JSON.parse(realGet('conduitSchedule')||'[]'),
      ductbanks: JSON.parse(realGet('ductbankSchedule')||'[]'),
      settings:{
        session: JSON.parse(realGet('ctrSession')||'{}'),
        collapsedGroups: JSON.parse(realGet('collapsedGroups')||'{}'),
        conduitFillData: JSON.parse(realGet('conduitFillData')||'null'),
        trayFillData: JSON.parse(realGet('trayFillData')||'null'),
        ductbankSession: JSON.parse(realGet('ductbankSession')||'{}')
      }
    };
    project=migrateProject(old);
    try{realSet(PROJECT_KEY,JSON.stringify(project));}
    catch(e){console.warn('project save failed',e);}
  }

  function save(){
    try{realSet(PROJECT_KEY,JSON.stringify(project));}
    catch(e){console.warn('project save failed',e);}
    globalThis.updateProjectDisplay?.();
  }

  function setItem(key,value){
    if(key===PROJECT_KEY){
      try{realSet(key,value);}catch(e){console.warn('project save failed',e);}
      return;
    }
    switch(key){
      case 'cableSchedule': project.cables=JSON.parse(value); break;
      case 'traySchedule': project.trays=JSON.parse(value); break;
      case 'conduitSchedule': project.conduits=JSON.parse(value); break;
      case 'ductbankSchedule': project.ductbanks=JSON.parse(value); break;
      case 'collapsedGroups': project.settings.collapsedGroups=JSON.parse(value); break;
      case 'ctrSession': project.settings.session=JSON.parse(value); break;
      default:
        if(!project.settings) project.settings={};
        try{ project.settings[key]=JSON.parse(value); }
        catch{ project.settings[key]=value; }
    }
    save();
  }

  function getItem(key){
    if(key===PROJECT_KEY) return realGet(key);
    switch(key){
      case 'cableSchedule': return JSON.stringify(project.cables||[]);
      case 'traySchedule': return JSON.stringify(project.trays||[]);
      case 'conduitSchedule': return JSON.stringify(project.conduits||[]);
      case 'ductbankSchedule': return JSON.stringify(project.ductbanks||[]);
      case 'collapsedGroups': return JSON.stringify(project.settings?.collapsedGroups||{});
      case 'ctrSession': return JSON.stringify(project.settings?.session||{});
      default:
        return project.settings&&key in project.settings ? JSON.stringify(project.settings[key]) : null;
    }
  }

  function removeItem(key){
    if(key===PROJECT_KEY){ realRemove(key); return; }
    switch(key){
      case 'cableSchedule': project.cables=[]; break;
      case 'traySchedule': project.trays=[]; break;
      case 'conduitSchedule': project.conduits=[]; break;
      case 'ductbankSchedule': project.ductbanks=[]; break;
      case 'collapsedGroups': delete project.settings.collapsedGroups; break;
      case 'ctrSession': delete project.settings.session; break;
      default:
        if(project.settings) delete project.settings[key];
    }
    save();
  }

  localStorage.getItem=getItem;
  localStorage.setItem=setItem;
  localStorage.removeItem=removeItem;

  globalThis.getProject=()=>JSON.parse(JSON.stringify(project));
  globalThis.setProject=p=>{ project=migrateProject(p); save(); };
}

globalThis.migrateProject=migrateProject;
initProjectStorage();

function canonicalize(obj){
  if(Array.isArray(obj)) return obj.map(canonicalize);
  if(obj&&typeof obj==='object'){
    const out={};
    Object.keys(obj).sort().forEach(k=>{out[k]=canonicalize(obj[k]);});
    return out;
  }
  return obj;
}

function canonicalJSONString(obj){
  return JSON.stringify(canonicalize(obj));
}

async function sha256Hex(str){
  const buf=new TextEncoder().encode(str);
  const subtle=crypto.subtle||crypto.webcrypto?.subtle;
  const hash=await subtle.digest('SHA-256',buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function bytesToBase64(bytes){
  let binary='';
  for(const b of bytes) binary+=String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64){
  const bin=atob(b64);
  const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return arr;
}

async function compressString(str){
  try{
    const cs=new CompressionStream('gzip');
    const writer=cs.writable.getWriter();
    await writer.write(new TextEncoder().encode(str));
    await writer.close();
    const buffer=await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buffer);
  }catch{
    return new TextEncoder().encode(str);
  }
}

async function decompressBytes(bytes){
  try{
    const ds=new DecompressionStream('gzip');
    const writer=ds.writable.getWriter();
    await writer.write(bytes);
    await writer.close();
    const buffer=await new Response(ds.readable).arrayBuffer();
    return new TextDecoder().decode(buffer);
  }catch{
    return new TextDecoder().decode(bytes);
  }
}

async function encodeProjectForUrl(project){
  const json=canonicalJSONString(project);
  const bytes=await compressString(json);
  return encodeURIComponent(bytesToBase64(bytes));
}

async function decodeProjectFromUrl(encoded){
  const bytes=base64ToBytes(decodeURIComponent(encoded));
  const json=await decompressBytes(bytes);
  return JSON.parse(json);
}

async function updateProjectDisplay(){
  if(typeof getProject!=='function') return;
  const proj=getProject();
  const name=proj.name||'Untitled';
  try{
    const hash=await sha256Hex(canonicalJSONString(proj));
    let span=document.getElementById('project-display');
    if(!span){
      const nav=document.querySelector('.top-nav .nav-links');
      const settingsBtn=document.getElementById('settings-btn');
      if(nav){
        span=document.createElement('span');
        span.id='project-display';
        span.style.marginLeft='auto';
        span.style.marginRight='1rem';
        nav.insertBefore(span,settingsBtn);
        if(settingsBtn) settingsBtn.style.marginLeft='0';
      }
    }
    if(span) span.textContent=`Project: ${name} (hash: ${hash.slice(0,8)})`;
  }catch(e){console.error('hash failed',e);}
}
globalThis.updateProjectDisplay=updateProjectDisplay;

async function copyShareLink(){
  try{
    const proj=getProject?getProject():defaultProject();
    const canonical=canonicalJSONString(proj);
    const encoded=await encodeProjectForUrl(proj);
    const url=`${location.origin}${location.pathname}#project=${encoded}`;
    if(url.length<2000){
      await navigator.clipboard.writeText(url);
      alert('Share link copied to clipboard');
    }else{
      const blob=new Blob([canonical],{type:'application/json'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='project.ctr.json';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),0);
      alert('Project too large for link; downloaded instead');
    }
  }catch(e){console.error('share link failed',e);}
}

async function loadProjectFromHash(){
  if(location.hash.startsWith('#project=')){
    try{
      const data=location.hash.slice(9);
      const proj=await decodeProjectFromUrl(data);
      if(globalThis.setProject) globalThis.setProject(proj);
      location.hash='';
      location.reload();
    }catch(e){console.error('load share failed',e);}
  }
}

const HISTORY_KEY='CTR_HISTORY';
const HISTORY_LIMIT=20;
let ctrHistory=[];
let historyIndex=-1;

function loadHistory(){
  try{ctrHistory=JSON.parse(localStorage.getItem(HISTORY_KEY))||[];}catch{ctrHistory=[];}
  historyIndex=ctrHistory.length-1;
}

function saveHistory(){
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(ctrHistory));}catch(e){console.error('history save failed',e);}
}

function diffObj(a,b){
  const diff={};
  const keys=new Set([...Object.keys(a||{}),...Object.keys(b||{})]);
  keys.forEach(k=>{
    const av=a?a[k]:undefined;
    const bv=b?b[k]:undefined;
    if(typeof av==='object'&&av&&typeof bv==='object'&&bv){
      const d=diffObj(av,bv);
      if(Object.keys(d).length) diff[k]=d;
    }else if(JSON.stringify(av)!==JSON.stringify(bv)){
      diff[k]={old:av,new:bv};
    }
  });
  return diff;
}

function takeSnapshot(){
  if(typeof getProject!=='function') return;
  const project=getProject();
  const last=ctrHistory[ctrHistory.length-1];
  if(last&&JSON.stringify(last.project)===JSON.stringify(project)) return;
  if(historyIndex<ctrHistory.length-1) ctrHistory=ctrHistory.slice(0,historyIndex+1);
  ctrHistory.push({ts:Date.now(),project});
  if(ctrHistory.length>HISTORY_LIMIT){
    ctrHistory.shift();
    if(historyIndex>0) historyIndex--;
  }
  historyIndex=ctrHistory.length-1;
  saveHistory();
  updateUndoRedoButtons();
}

function restoreSnapshot(idx){
  const snap=ctrHistory[idx];
  if(!snap)return;
  const diff=diffObj(getProject(),snap.project);
  const ts=new Date(snap.ts).toLocaleString();
  const diffStr=JSON.stringify(diff,null,2);
  if(!confirm(`Restore snapshot from ${ts}?\n\nChanges:\n${diffStr}`)) return;
  setProject(snap.project);
  historyIndex=idx;
  saveHistory();
  location.reload();
}

function undoHistory(){ if(historyIndex>0) restoreSnapshot(historyIndex-1); }
function redoHistory(){ if(historyIndex<ctrHistory.length-1) restoreSnapshot(historyIndex+1); }

function updateUndoRedoButtons(){
  const undoBtns=document.querySelectorAll('.ctr-undo-btn');
  const redoBtns=document.querySelectorAll('.ctr-redo-btn');
  undoBtns.forEach(b=>b.disabled=historyIndex<=0);
  redoBtns.forEach(b=>b.disabled=historyIndex>=ctrHistory.length-1);
}

function attachHistoryButtons(){
  const saveBtns=document.querySelectorAll('button[id^="save"]');
  saveBtns.forEach(btn=>{
    if(btn.dataset.historyAttached) return;
    btn.dataset.historyAttached='1';
    const undo=document.createElement('button');
    undo.type='button';
    undo.textContent='Undo';
    undo.className='ctr-undo-btn';
    const redo=document.createElement('button');
    redo.type='button';
    redo.textContent='Redo';
    redo.className='ctr-redo-btn';
    btn.insertAdjacentElement('afterend',redo);
    btn.insertAdjacentElement('afterend',undo);
    undo.addEventListener('click',undoHistory);
    redo.addEventListener('click',redoHistory);
  });
  updateUndoRedoButtons();
}

function initHistory(){
  if(typeof window==='undefined'||typeof localStorage==='undefined') return;
  loadHistory();
  if(!ctrHistory.length) takeSnapshot();
  attachHistoryButtons();
  setInterval(takeSnapshot,20000);
  window.addEventListener('blur',takeSnapshot);
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undoHistory();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redoHistory();}
  });
}

function trapFocus(e,container){
  if(e.key!=='Tab')return;
  const focusables=container.querySelectorAll(FOCUSABLE);
  if(!focusables.length)return;
  const first=focusables[0];
  const last=focusables[focusables.length-1];
  if(e.shiftKey&&document.activeElement===first){
    e.preventDefault();
    last.focus();
  }else if(!e.shiftKey&&document.activeElement===last){
    e.preventDefault();
    first.focus();
  }
}

function initSettings(){
  const settingsBtn=document.getElementById('settings-btn');
  const settingsMenu=document.getElementById('settings-menu');
  if(settingsBtn&&settingsMenu){
    settingsMenu.setAttribute('role','dialog');
    settingsMenu.setAttribute('aria-modal','true');
    settingsMenu.setAttribute('aria-hidden','true');
    let open=false;

    const handleKey=e=>{
      if(e.key==='Escape')close();
      else trapFocus(e,settingsMenu);
    };

    const openMenu=()=>{
      open=true;
      settingsMenu.style.display='flex';
      settingsMenu.setAttribute('aria-hidden','false');
      settingsBtn.setAttribute('aria-expanded','true');
      document.addEventListener('keydown',handleKey);
      const focusables=settingsMenu.querySelectorAll(FOCUSABLE);
      if(focusables.length)focusables[0].focus();
    };

    const close=()=>{
      if(!open)return;
      open=false;
      settingsMenu.style.display='none';
      settingsMenu.setAttribute('aria-hidden','true');
      settingsBtn.setAttribute('aria-expanded','false');
      document.removeEventListener('keydown',handleKey);
      settingsBtn.focus();
    };

    settingsBtn.addEventListener('click',()=>{
      open?close():openMenu();
    });

    document.addEventListener('click',e=>{
      if(open&&!settingsMenu.contains(e.target)&&e.target!==settingsBtn){
        close();
      }
    });

    const nameLabel=document.createElement('label');
    nameLabel.textContent='Project Name';
    const nameInput=document.createElement('input');
    nameInput.type='text';
    nameInput.id='project-name-input';
    try{nameInput.value=getProject().name||'';}catch{}
    nameLabel.appendChild(nameInput);
    settingsMenu.insertBefore(nameLabel,settingsMenu.firstChild);
    nameInput.addEventListener('input',e=>{
      try{
        const proj=getProject();
        proj.name=e.target.value;
        setProject(proj);
        updateProjectDisplay();
      }catch{}
    });

    const exportBtn=document.getElementById('export-project-btn');
    const shareBtn=document.createElement('button');
    shareBtn.id='copy-share-link-btn';
    shareBtn.textContent='Copy Share Link';
    if(exportBtn) exportBtn.insertAdjacentElement('beforebegin',shareBtn);
    else settingsMenu.appendChild(shareBtn);
    shareBtn.addEventListener('click',copyShareLink);
  }
  const unitSelect=document.getElementById('unit-select');
  if(unitSelect){
    try{ unitSelect.value=getProject().settings?.units||'imperial'; }catch{}
    unitSelect.addEventListener('change',e=>{
      try{
        const proj=getProject();
        proj.settings=proj.settings||{};
        proj.settings.units=e.target.value;
        setProject(proj);
      }catch{}
      applyUnitLabels();
    });
  }
  applyUnitLabels();
  updateProjectDisplay();
  window.addEventListener('storage',e=>{if(e.key===PROJECT_KEY) updateProjectDisplay();});
  if(!globalThis.__ctrHistoryInit){
    initHistory();
    globalThis.__ctrHistoryInit=true;
  }
}

function initDarkMode(){
  const darkToggle=document.getElementById('dark-toggle');
  const session=JSON.parse(localStorage.getItem('ctrSession')||'{}');
  if(session.darkMode===undefined){
    const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
    session.darkMode=prefersDark;
    localStorage.setItem('ctrSession',JSON.stringify(session));
  }
  document.body.classList.toggle('dark-mode',session.darkMode);
  if(darkToggle) darkToggle.checked=!!session.darkMode;
  if(darkToggle){
    darkToggle.addEventListener('change',()=>{
      document.body.classList.toggle('dark-mode',darkToggle.checked);
      session.darkMode=darkToggle.checked;
      localStorage.setItem('ctrSession',JSON.stringify(session));
      if(typeof window.saveSession==='function') window.saveSession();
      if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
    });
  }
  window.addEventListener('storage',e=>{
    if(e.key==='ctrSession'){
      try{
        const data=JSON.parse(e.newValue);
        document.body.classList.toggle('dark-mode',data&&data.darkMode);
        if(darkToggle) darkToggle.checked=!!(data&&data.darkMode);
      }catch{}
    }
  });
}

function initCompactMode(){
  const compactToggle=document.getElementById('compact-toggle');
  const session=JSON.parse(localStorage.getItem('ctrSession')||'{}');
  if(session.compactMode===undefined){
    session.compactMode=false;
    localStorage.setItem('ctrSession',JSON.stringify(session));
  }
  document.body.classList.toggle('compact-mode',session.compactMode);
  if(compactToggle) compactToggle.checked=!!session.compactMode;
  if(compactToggle){
    compactToggle.addEventListener('change',()=>{
      document.body.classList.toggle('compact-mode',compactToggle.checked);
      session.compactMode=compactToggle.checked;
      localStorage.setItem('ctrSession',JSON.stringify(session));
      if(typeof window.saveSession==='function') window.saveSession();
      if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
    });
  }
  window.addEventListener('storage',e=>{
    if(e.key==='ctrSession'){
      try{
        const data=JSON.parse(e.newValue);
        document.body.classList.toggle('compact-mode',data&&data.compactMode);
        if(compactToggle) compactToggle.checked=!!(data&&data.compactMode);
      }catch{}
    }
  });
}

function initHelpModal(btnId='help-btn',modalId='help-modal',closeId){
  const btn=document.getElementById(btnId);
  const modal=document.getElementById(modalId);
  const closeBtn=closeId?document.getElementById(closeId):(modal?modal.querySelector('.close-btn'):null);
  if(btn&&modal&&closeBtn){
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-hidden','true');

    const handleKey=e=>{
      if(e.key==='Escape')close();
      else trapFocus(e,modal);
    };

    const open=()=>{
      modal.style.display='flex';
      modal.setAttribute('aria-hidden','false');
      btn.setAttribute('aria-expanded','true');
      document.addEventListener('keydown',handleKey);
      const focusables=modal.querySelectorAll(FOCUSABLE);
      if(focusables.length)focusables[0].focus();
    };
    const close=()=>{
      modal.style.display='none';
      modal.setAttribute('aria-hidden','true');
      btn.setAttribute('aria-expanded','false');
      document.removeEventListener('keydown',handleKey);
      btn.focus();
    };
    btn.addEventListener('click',open);
    closeBtn.addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
  }
}

function initNavToggle(){
  const nav=document.querySelector('.top-nav');
  if(!nav) return;
  const toggle=nav.querySelector('.nav-toggle');
  if(!toggle) return;
  toggle.addEventListener('click',()=>{
    nav.classList.toggle('open');
  });
}

  function checkPrereqs(prereqs=[]){
    // Previously this function displayed a banner when required data was missing.
    // The banner has been removed to declutter the interface, so this function now
    // intentionally performs no UI actions even if data is absent.
  }

function initTableNav(){
  document.addEventListener('keydown',e=>{
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
    const target=e.target;
    if(!['INPUT','SELECT','TEXTAREA'].includes(target.tagName))return;
    const cell=target.closest('td');
    if(!cell||!cell.closest('table'))return;
    const row=cell.parentElement;
    const idx=cell.cellIndex;
    const targetRow=e.key==='ArrowUp'?row.previousElementSibling:row.nextElementSibling;
    if(!targetRow)return;
    const targetCell=targetRow.cells[idx];
    if(!targetCell)return;
    const focusable=targetCell.querySelector('input, select, textarea');
    if(!focusable)return;
    e.preventDefault();
    focusable.focus();
    if(typeof focusable.select==='function') focusable.select();
  });
}

const CTR_CONDUITS = 'CTR_CONDUITS';

function persistConduits(data){
  try{
    localStorage.setItem(CTR_CONDUITS,JSON.stringify(data));
    const condKey=globalThis.TableUtils?.STORAGE_KEYS?.conduitSchedule||'conduitSchedule';
    localStorage.setItem(condKey,JSON.stringify(data.conduits||[]));
  }catch(e){console.error('Failed to persist conduits',e);}
}

function loadConduits(){
  try{
    const raw=localStorage.getItem(CTR_CONDUITS);
    if(raw){
      const parsed=JSON.parse(raw);
      return {ductbanks:parsed.ductbanks||[],conduits:parsed.conduits||[]};
    }
  }catch(e){}
  const dbKey=globalThis.TableUtils?.STORAGE_KEYS?.ductbankSchedule||'ductbankSchedule';
  const condKey=globalThis.TableUtils?.STORAGE_KEYS?.conduitSchedule||'conduitSchedule';
  let ductbanks=[];let conduits=[];
  try{ductbanks=JSON.parse(localStorage.getItem(dbKey)||'[]');}catch(e){}
  try{conduits=JSON.parse(localStorage.getItem(condKey)||'[]');}catch(e){}
  const flattened=[];
  ductbanks=ductbanks.map(db=>{
    (db.conduits||[]).forEach(c=>{
      flattened.push({
        ductbankTag:db.tag,
        conduit_id:c.conduit_id,
        tray_id:`${db.tag}-${c.conduit_id}`,
        type:c.type,
        trade_size:c.trade_size,
        start_x:c.start_x,start_y:c.start_y,start_z:c.start_z,
        end_x:c.end_x,end_y:c.end_y,end_z:c.end_z,
        allowed_cable_group:c.allowed_cable_group
      });
    });
    const {conduits:_,...rest}=db;
    return rest;
  });
  return {ductbanks,conduits:[...flattened,...conduits]};
}

 globalThis.document?.addEventListener('DOMContentLoaded',initTableNav);

function initProjectIO(){
  loadProjectFromHash();
  const exportBtn=document.getElementById('export-project-btn');
  const importBtn=document.getElementById('import-project-btn');
  const fileInput=document.getElementById('import-project-input');
  if(exportBtn){
    exportBtn.addEventListener('click',()=>{
      try{
        const data=globalThis.getProject?globalThis.getProject():defaultProject();
        const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download='project.ctr.json';
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),0);
      }catch(e){console.error('Export failed',e);}
    });
  }
  if(importBtn&&fileInput){
    importBtn.addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',e=>{
      const file=e.target.files[0];
      if(!file)return;
      const reader=new FileReader();
      reader.onload=ev=>{
        try{
          const obj=JSON.parse(ev.target.result);
          if(globalThis.setProject)globalThis.setProject(obj);
          location.reload();
        }catch(err){console.error('Import failed',err);}
      };
      reader.readAsText(file);
      fileInput.value='';
    });
  }
}

globalThis.addEventListener?.('DOMContentLoaded',initProjectIO);

function applyUnitLabels(){
  const sys=globalThis.units?.getUnitSystem()?globalThis.units.getUnitSystem():'imperial';
  const d=sys==='imperial'?'ft':'m';
  const c=sys==='imperial'?'in':'mm';
  document.querySelectorAll('[data-unit="distance"]').forEach(el=>el.textContent=d);
  document.querySelectorAll('[data-unit="conduit"]').forEach(el=>el.textContent=c);
}

globalThis.initSettings=initSettings;
globalThis.initDarkMode=initDarkMode;
globalThis.initCompactMode=initCompactMode;
globalThis.initHelpModal=initHelpModal;
globalThis.initNavToggle=initNavToggle;
globalThis.checkPrereqs=checkPrereqs;
globalThis.persistConduits=persistConduits;
globalThis.loadConduits=loadConduits;
globalThis.applyUnitLabels=applyUnitLabels;
