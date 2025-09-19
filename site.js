import "./units.js";
import { exportProject, importProject, getOneLine, getStudies, loadProject, getDuctbanks, getConduits } from "./dataStore.mjs";
import { runValidation } from "./validation/rules.js";
import { PROJECT_KEY, defaultProject, initializeProjectStorage, getProjectState, setProjectState, setProjectKey, onProjectChange } from "./projectStorage.js";

const FOCUSABLE="a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";
const CHECKPOINT_KEY='CTR_CHECKPOINT';
const MAX_CHECKPOINT_SIZE=2*1024*1024; // ~2MB

initializeProjectStorage().catch(e=>console.error('fast-json-patch load failed',e));

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

async function saveCheckpoint(){
  try{
    const proj=getProjectState();
    const json=canonicalJSONString(proj);
    const bytes=await compressString(json);
    if(bytes.length>MAX_CHECKPOINT_SIZE){
      alert('Checkpoint exceeds 2MB limit');
      return;
    }
    localStorage?.setItem(CHECKPOINT_KEY,bytesToBase64(bytes));
  }catch(e){
    console.error('Checkpoint save failed',e);
  }
}

async function updateProjectDisplay(snapshot){
  const proj=snapshot||getProjectState();
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
onProjectChange(updateProjectDisplay);
updateProjectDisplay();

async function copyShareLink(){
  try{
    const proj=getProjectState()||defaultProject();
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
      setProjectState(proj);
      location.hash='';
      location.reload();
    }catch(e){console.error('load share failed',e);}
  } else if(location.hash){
    try{
      const name=decodeURIComponent(location.hash.slice(1));
      if(name) loadProject(name);
    }catch(e){console.error('hash load failed',e);}
  }
}

function applyProjectHash(){
  const hash=location.hash;
  if(!hash) return;
  document.querySelectorAll('a[href$=".html"]').forEach(a=>{
    const href=a.getAttribute('href');
    if(!href||href.includes('#')) return;
    a.setAttribute('href',href+hash);
  });
}

// History and autosave features have been removed to avoid exceeding
// localStorage quotas in some browsers. The functions below are
// retained as no-ops to preserve any external references but they no
// longer store or restore snapshots.
function initHistory() {}

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

function loadScript(url){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=url;
    s.onload=()=>resolve();
    s.onerror=reject;
    document.head.appendChild(s);
  });
}

async function generateTechnicalReport(format='pdf'){
  const getLabel=id=>document.querySelector(`label[for="${id}"]`)?.textContent.trim()||id;
  const inputs=[...document.querySelectorAll('input, select, textarea')]
    .map(el=>`${getLabel(el.id||el.name||'')}: ${el.value}`);
  const outputEl=document.getElementById('results')||document.getElementById('output');
  const outputs=outputEl?outputEl.innerText.trim():'';
  const refs=[...document.querySelectorAll('.method-panel a')].map(a=>a.href);

  if(format==='pdf'){
    if(!window.jspdf){
      await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    }
    const { jsPDF } = window.jspdf;
    const doc=new jsPDF();
    let y=10;
    doc.text('Technical Report',10,y); y+=10;
    doc.text('Inputs:',10,y); y+=10;
    inputs.forEach(line=>{doc.text(line,10,y); y+=10; if(y>280){doc.addPage(); y=10;}});
    if(outputs){doc.addPage(); y=10; doc.text('Outputs:',10,y); y+=10; doc.text(outputs,10,y);}
    if(refs.length){doc.addPage(); y=10; doc.text('References:',10,y); y+=10; refs.forEach(r=>{doc.text(r,10,y); y+=10; if(y>280){doc.addPage(); y=10;}});}
    doc.save('technical_report.pdf');
  }else{
    if(!window.docx){
      await loadScript('https://cdn.jsdelivr.net/npm/docx@8.4.0/build/index.min.js');
    }
    const { Document, Packer, Paragraph } = window.docx;
    const paragraphs=[new Paragraph('Technical Report'),new Paragraph('Inputs:')];
    inputs.forEach(line=>paragraphs.push(new Paragraph(line)));
    if(outputs){paragraphs.push(new Paragraph('Outputs:')); paragraphs.push(new Paragraph(outputs));}
    if(refs.length){paragraphs.push(new Paragraph('References:')); refs.forEach(r=>paragraphs.push(new Paragraph(r)));}
    const doc=new Document({sections:[{properties:{},children:paragraphs}]});
    const blob=await Packer.toBlob(doc);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='technical_report.docx';
    a.click();
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
    try{nameInput.value=getProjectState().name||'';}catch{}
    nameLabel.appendChild(nameInput);
    settingsMenu.insertBefore(nameLabel,settingsMenu.firstChild);
    nameInput.addEventListener('input',e=>{
      try{
        const proj=getProjectState();
        proj.name=e.target.value;
        setProjectState(proj);
        updateProjectDisplay(proj);
      }catch{}
    });

    const exportBtn=document.getElementById('export-project-btn');
    const shareBtn=document.createElement('button');
    shareBtn.id='copy-share-link-btn';
    shareBtn.textContent='Copy Share Link';
    if(exportBtn) exportBtn.insertAdjacentElement('beforebegin',shareBtn);
    else settingsMenu.appendChild(shareBtn);
    shareBtn.addEventListener('click',copyShareLink);

    const selfCheckBtn=document.createElement('button');
    selfCheckBtn.id='run-self-check-btn';
    selfCheckBtn.textContent='Run Self-Check';
    settingsMenu.appendChild(selfCheckBtn);
    selfCheckBtn.addEventListener('click',()=>{ location.href='optimalRoute.html?selfcheck=1'; });

    const refreshLibBtn=document.createElement('button');
    refreshLibBtn.id='refresh-library-btn';
    refreshLibBtn.textContent='Refresh Library';
    settingsMenu.appendChild(refreshLibBtn);
    refreshLibBtn.addEventListener('click',async()=>{
      if(typeof globalThis.loadComponentLibrary==='function') await globalThis.loadComponentLibrary();
      if(typeof globalThis.loadManufacturerLibrary==='function') await globalThis.loadManufacturerLibrary();
      alert('Library refreshed');
    });

    const reportBtn=document.createElement('button');
    reportBtn.id='generate-report-btn';
    reportBtn.textContent='Generate Technical Report';
    settingsMenu.appendChild(reportBtn);
    reportBtn.addEventListener('click',async()=>{
      const useDocx=confirm('Generate DOCX? Cancel for PDF');
      await generateTechnicalReport(useDocx?'docx':'pdf');
    });

    const exportReportsBtn=document.createElement('button');
    exportReportsBtn.id='export-reports-btn';
    exportReportsBtn.textContent='Export Reports';
    settingsMenu.appendChild(exportReportsBtn);
    exportReportsBtn.addEventListener('click',async()=>{
      const { downloadCSV } = await import('./reports/reporting.mjs');
      const headers=['sample'];
      const rows=[{sample:'demo'}];
      downloadCSV(headers,rows,'reports.csv');
      const issues=runValidation(getOneLine().sheets,getStudies());
      const vHeaders=['component','message'];
      const vRows=issues.length?issues:[{component:'-',message:'No issues'}];
      downloadCSV(vHeaders,vRows,'validation-report.csv');
    });

    const printLabelsBtn=document.createElement('button');
    printLabelsBtn.id='print-labels-btn';
    printLabelsBtn.textContent='Print Labels';
    settingsMenu.appendChild(printLabelsBtn);
    printLabelsBtn.addEventListener('click',async()=>{
      const { generateArcFlashLabel } = await import('./reports/labels.mjs');
      const svg=generateArcFlashLabel({equipment:'Demo',incidentEnergy:'--',boundary:'--'});
      const win=window.open('');
      if(win){
        win.document.write(svg);
        win.document.close();
        win.print();
      }
    });
  }
  const unitSelect=document.getElementById('unit-select');
  if(unitSelect){
    try{ unitSelect.value=getProjectState().settings?.units||'imperial'; }catch{}
    unitSelect.addEventListener('change',e=>{
      try{
        const proj=getProjectState();
        proj.settings=proj.settings||{};
        proj.settings.units=e.target.value;
        setProjectState(proj);
      }catch{}
      applyUnitLabels();
    });
  }
  applyUnitLabels();
  updateProjectDisplay();
}

function initDarkMode(){
  const darkToggle=document.getElementById('dark-toggle');
  const session=JSON.parse(localStorage.getItem('ctrSession')||'{}');
  if(session.darkMode===undefined){
    const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
    session.darkMode=prefersDark;
    setProjectKey('ctrSession',JSON.stringify(session));
  }
  document.body.classList.toggle('dark-mode',session.darkMode);
  if(darkToggle) darkToggle.checked=!!session.darkMode;
  if(darkToggle){
    darkToggle.addEventListener('change',()=>{
      document.body.classList.toggle('dark-mode',darkToggle.checked);
      session.darkMode=darkToggle.checked;
      setProjectKey('ctrSession',JSON.stringify(session));
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
    setProjectKey('ctrSession',JSON.stringify(session));
  }
  document.body.classList.toggle('compact-mode',session.compactMode);
  if(compactToggle) compactToggle.checked=!!session.compactMode;
  if(compactToggle){
    compactToggle.addEventListener('change',()=>{
      document.body.classList.toggle('compact-mode',compactToggle.checked);
      session.compactMode=compactToggle.checked;
      setProjectKey('ctrSession',JSON.stringify(session));
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
    const content=modal.querySelector('.modal-content') || closeBtn.parentElement || modal;
    const defaults=Array.from(content.children);
    let iframe=null;

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
      if(iframe){iframe.style.display='none';iframe.src='';}
      defaults.forEach(el=>{if(el!==closeBtn)el.style.display='';});
    };
    globalThis.showHelpDoc=url=>{
      if(!iframe){
        iframe=document.createElement('iframe');
        iframe.id='help-iframe';
        iframe.style.width='100%';
        iframe.style.height='80vh';
        content.appendChild(iframe);
      }
      defaults.forEach(el=>{if(el!==closeBtn)el.style.display='none';});
      iframe.style.display='block';
      iframe.src=url;
      open();
    };
    btn.addEventListener('click',open);
    closeBtn.addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
  }
}

function initNavToggle(){
  const toggle=document.querySelector('.nav-toggle');
  if(!toggle) return;
  const target=document.getElementById(toggle.getAttribute('aria-controls'));
  if(!target) return;

  function closeMenu(){
    toggle.setAttribute('aria-expanded','false');
    target.classList.remove('open');
  }

  toggle.addEventListener('click',()=>{
    const expanded=toggle.getAttribute('aria-expanded')==='true';
    toggle.setAttribute('aria-expanded',String(!expanded));
    target.classList.toggle('open',!expanded);
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') closeMenu();
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
  let ductbanks=[];let conduits=[];
  try{ductbanks=getDuctbanks();}catch(e){}
  try{conduits=getConduits();}catch(e){}
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
  applyProjectHash();
  const exportBtn=document.getElementById('export-project-btn');
  if(exportBtn){
    const checkpointBtn=document.createElement('button');
    checkpointBtn.id='save-checkpoint-btn';
    checkpointBtn.textContent='Save Checkpoint';
    exportBtn.insertAdjacentElement('afterend',checkpointBtn);
    checkpointBtn.addEventListener('click',saveCheckpoint);
  }
  const importBtn=document.getElementById('import-project-btn');
  const fileInput=document.getElementById('import-project-input');
  console.assert(importBtn&&fileInput,'Project import controls missing');
  if(exportBtn){
    exportBtn.addEventListener('click',()=>{
      try{
        const data=exportProject();
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
          if(importProject(obj)) location.reload();
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

function showSelfCheckModal(data){
  const modal=document.createElement('div');
  modal.className='modal';
  modal.id='self-check-modal';
  const content=document.createElement('div');
  content.className='modal-content';
  const close=document.createElement('button');
  close.className='close-btn';
  close.textContent='\u00D7';
  close.addEventListener('click',()=>modal.remove());
  const title=document.createElement('h2');
  title.textContent=data.pass?'Self-Check PASSED':'Self-Check FAILED';
  const pre=document.createElement('pre');
  const json=JSON.stringify(data,null,2);
  pre.textContent=json;
  const actions=document.createElement('div');
  actions.className='modal-actions';
  const copyBtn=document.createElement('button');
  copyBtn.textContent='Copy Diagnostics';
  copyBtn.addEventListener('click',()=>navigator.clipboard.writeText(json));
  actions.appendChild(copyBtn);
  content.appendChild(close);
  content.appendChild(title);
  content.appendChild(pre);
  content.appendChild(actions);
  modal.appendChild(content);
  document.body.appendChild(modal);
  modal.style.display='flex';
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
globalThis.applyProjectHash=applyProjectHash;
globalThis.showSelfCheckModal=showSelfCheckModal;
