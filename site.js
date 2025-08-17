const FOCUSABLE="a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";
const PROJECT_KEY='CTR_PROJECT_V1';

function defaultProject(){
  return {ductbanks:[],conduits:[],trays:[],cables:[],settings:{}};
}

function migrateProject(old={}){
  return {
    ductbanks: old.ductbanks || old.ductbankSchedule || [],
    conduits: old.conduits || old.conduitSchedule || [],
    trays: old.trays || old.traySchedule || [],
    cables: old.cables || old.cableSchedule || [],
    settings: old.settings || {
      session: old.session || old.ctrSession || {},
      collapsedGroups: old.collapsedGroups || {}
    }
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
    realSet(PROJECT_KEY,JSON.stringify(project));
  }

  function save(){ realSet(PROJECT_KEY,JSON.stringify(project)); }

  function setItem(key,value){
    if(key===PROJECT_KEY){ realSet(key,value); return; }
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
  try{localStorage.setItem(CTR_CONDUITS,JSON.stringify(data));}catch(e){console.error('Failed to persist conduits',e);}
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

globalThis.initSettings=initSettings;
globalThis.initDarkMode=initDarkMode;
globalThis.initHelpModal=initHelpModal;
globalThis.initNavToggle=initNavToggle;
globalThis.checkPrereqs=checkPrereqs;
globalThis.persistConduits=persistConduits;
globalThis.loadConduits=loadConduits;
