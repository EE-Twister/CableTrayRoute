import "./units.js";
import { exportProject, importProject, getOneLine, getStudies, loadProject, getDuctbanks, getConduits } from "./dataStore.mjs";
import { runValidation } from "./validation/rules.js";
import {
  PROJECT_KEY,
  defaultProject,
  initializeProjectStorage,
  getProjectState,
  setProjectState,
  onProjectChange,
  getSessionPreferences,
  updateSessionPreferences,
  setConduitCache,
  getConduitCache
} from "./projectStorage.js";
import { openModal, showAlertModal } from "./src/components/modal.js";

const FOCUSABLE="a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";
const CHECKPOINT_KEY='CTR_CHECKPOINT';
const MAX_CHECKPOINT_SIZE=2*1024*1024; // ~2MB
const AUTO_SAVE_INTERVAL_MS=5*60*1000;
let cachedProjectFileHandle=null;
let autoSaveSchedulerInstance=null;
let dirtyTrackerInstance=null;

function currentProjectFromHash(){
  if(typeof location==='undefined') return '';
  const hash=location.hash;
  if(!hash||hash==='#'||hash.startsWith('#project=')) return '';
  try{
    return decodeURIComponent(hash.slice(1)).trim();
  }catch{
    return '';
  }
}

if(typeof window!=='undefined'){
  const initialProject=currentProjectFromHash()||(window.currentProjectId||'');
  window.currentProjectId=initialProject||'default';
}

function getDirtyTracker(){
  if(dirtyTrackerInstance) return dirtyTrackerInstance;
  const win=typeof window!=='undefined'?window:globalThis;
  if(!win) return null;
  if(win.dirtyTracker){
    dirtyTrackerInstance=win.dirtyTracker;
    return dirtyTrackerInstance;
  }
  if(typeof win.createDirtyTracker==='function'){
    try{
      dirtyTrackerInstance=win.createDirtyTracker(win);
      win.dirtyTracker=dirtyTrackerInstance;
      return dirtyTrackerInstance;
    }catch(err){console.error('Failed to initialize dirty tracker',err);}
  }
  return null;
}

function setAutoSaveFlag(active){
  if(typeof window!=='undefined'){
    window.autoSaveEnabled=Boolean(active);
  }
}
if(typeof window!=='undefined'&&!('autoSaveEnabled'in window)){
  window.autoSaveEnabled=false;
}

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
      await showAlertModal('Checkpoint Too Large', 'The checkpoint exceeds the 2MB limit. Reduce project data before saving again.');
      return;
    }
    localStorage?.setItem(CHECKPOINT_KEY,bytesToBase64(bytes));
    await save(proj,{flush:true,reason:'checkpoint'});
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

const projectDisplayMetrics={
  scheduledCalls:0,
  flushCalls:0,
  runCount:0,
  coalesced:0,
  lastRunDuration:0,
  lastQueueDelay:0,
  maxQueueDelay:0,
  lastReason:'',
  lastScheduledAt:0
};

const now=()=>globalThis.performance?.now?.()??Date.now();

function createProjectDisplayScheduler(){
  let pendingSnapshot=null;
  let pendingReason='change';
  let scheduledHandle=null;
  let scheduledType=null;
  let runningPromise=null;

  function cancelScheduled(){
    if(scheduledHandle===null)return;
    if(scheduledType==='idle'&&typeof cancelIdleCallback==='function'){
      cancelIdleCallback(scheduledHandle);
    }else{
      clearTimeout(scheduledHandle);
    }
    scheduledHandle=null;
    scheduledType=null;
  }

  function run(snapshot,reason){
    const started=now();
    return updateProjectDisplay(snapshot).catch(err=>{
      console.error('project display update failed',err);
    }).finally(()=>{
      const duration=now()-started;
      projectDisplayMetrics.lastRunDuration=duration;
      projectDisplayMetrics.runCount+=1;
      projectDisplayMetrics.lastReason=reason;
    });
  }

  function processNext(){
    scheduledHandle=null;
    scheduledType=null;
    if(!pendingSnapshot){
      return;
    }
    if(runningPromise){
      runningPromise.finally(()=>{
        if(pendingSnapshot) ensureProcessing();
      });
      return;
    }
    const snapshot=pendingSnapshot;
    const reason=pendingReason;
    pendingSnapshot=null;
    pendingReason='change';
    runningPromise=run(snapshot,reason).finally(()=>{
      runningPromise=null;
      if(pendingSnapshot) ensureProcessing();
    });
  }

  function ensureProcessing(){
    if(scheduledHandle!==null||runningPromise){
      return;
    }
    if(!pendingSnapshot){
      return;
    }
    projectDisplayMetrics.lastScheduledAt=now();
    const runner=()=>{
      const delay=now()-projectDisplayMetrics.lastScheduledAt;
      projectDisplayMetrics.lastQueueDelay=delay;
      if(delay>projectDisplayMetrics.maxQueueDelay) projectDisplayMetrics.maxQueueDelay=delay;
      processNext();
    };
    if(typeof requestIdleCallback==='function'){
      scheduledType='idle';
      scheduledHandle=requestIdleCallback(runner,{timeout:200});
    }else{
      scheduledType='timeout';
      scheduledHandle=setTimeout(runner,32);
    }
  }

  function schedule(snapshot,{reason='change'}={}){
    const alreadyPending=!!pendingSnapshot||scheduledHandle!==null||!!runningPromise;
    pendingSnapshot=snapshot??getProjectState();
    pendingReason=reason;
    projectDisplayMetrics.scheduledCalls+=1;
    if(alreadyPending) projectDisplayMetrics.coalesced+=1;
    ensureProcessing();
  }

  async function flush(snapshot,{reason='flush'}={}){
    projectDisplayMetrics.flushCalls+=1;
    pendingSnapshot=snapshot??pendingSnapshot??getProjectState();
    pendingReason=reason;
    cancelScheduled();
    if(runningPromise){
      try{await runningPromise;}catch{}
    }
    const next=pendingSnapshot;
    pendingSnapshot=null;
    pendingReason='change';
    if(!next) return;
    await run(next,reason);
  }

  function resetMetrics(){
    projectDisplayMetrics.scheduledCalls=0;
    projectDisplayMetrics.flushCalls=0;
    projectDisplayMetrics.runCount=0;
    projectDisplayMetrics.coalesced=0;
    projectDisplayMetrics.lastRunDuration=0;
    projectDisplayMetrics.lastQueueDelay=0;
    projectDisplayMetrics.maxQueueDelay=0;
    projectDisplayMetrics.lastReason='';
    projectDisplayMetrics.lastScheduledAt=0;
  }

  function getMetrics(){
    return {
      ...projectDisplayMetrics,
      hasPending:!!pendingSnapshot||scheduledHandle!==null||!!runningPromise
    };
  }

  return {schedule,flush,resetMetrics,getMetrics};
}

const projectDisplayScheduler=createProjectDisplayScheduler();

function save(snapshot,options={}){
  if(options.flush){
    return projectDisplayScheduler.flush(snapshot,options);
  }
  projectDisplayScheduler.schedule(snapshot,options);
  return Promise.resolve();
}

globalThis.updateProjectDisplay=updateProjectDisplay;
if(typeof globalThis!=='undefined'){
  globalThis.__CTR_projectDisplayScheduler=projectDisplayScheduler;
}
export const __projectDisplayScheduler=projectDisplayScheduler;
export const __projectDisplaySave=save;
onProjectChange(save);
save(null,{flush:true,reason:'initial-render'});

async function showShareLinkModal(url,{copied=true}={}){
  if(typeof document==='undefined') return;
  const inputId=`share-link-${Math.random().toString(36).slice(2)}`;
  const description=copied?
    'Share link copied to clipboard. You can also copy it manually below.':
    'Clipboard access is unavailable. Copy the link below to share the project.';
  await openModal({
    title:'Share Project',
    description,
    primaryText:'Close',
    secondaryText:null,
    onSubmit(){return true;},
    render(container,controls){
      const doc=container.ownerDocument;
      const wrapper=doc.createElement('div');
      wrapper.className='modal-form';
      const label=doc.createElement('label');
      label.setAttribute('for',inputId);
      label.textContent='Share URL';
      const input=doc.createElement('input');
      input.type='text';
      input.id=inputId;
      input.value=url;
      input.readOnly=true;
      input.addEventListener('focus',()=>input.select());
      label.appendChild(input);
      wrapper.appendChild(label);
      const note=doc.createElement('p');
      note.className='modal-message';
      note.id=`${inputId}-note`;
      note.textContent=copied?'Use this link to collaborate with your team.':'Select the link and use Ctrl+C (or ⌘C) to copy it.';
      const described=[controls.descriptionId,note.id].filter(Boolean).join(' ').trim();
      if(described) input.setAttribute('aria-describedby',described);
      wrapper.appendChild(note);
      container.appendChild(wrapper);
      controls.setInitialFocus(input);
      return input;
    }
  });
}

async function copyShareLink(){
  let shareUrl='';
  try{
    const proj=getProjectState()||defaultProject();
    const canonical=canonicalJSONString(proj);
    const encoded=await encodeProjectForUrl(proj);
    shareUrl=`${location.origin}${location.pathname}#project=${encoded}`;
    if(shareUrl.length<2000){
      let copied=false;
      if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
        try{
          await navigator.clipboard.writeText(shareUrl);
          copied=true;
        }catch(err){
          console.warn('Clipboard copy failed',err);
        }
      }
      await showShareLinkModal(shareUrl,{copied});
    }else{
      const blob=new Blob([canonical],{type:'application/json'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='project.ctr.json';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),0);
      await showAlertModal('Download Ready','The project is too large to share as a link. A download has started instead.');
    }
  }catch(e){
    console.error('share link failed',e);
    if(shareUrl){
      await showShareLinkModal(shareUrl,{copied:false});
    }else{
      await showAlertModal('Share Failed','We could not generate a share link. Please try again.');
    }
  }
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
  let activeName='';
  if(typeof window!=='undefined'){
    const fromHash=currentProjectFromHash();
    if(fromHash){
      activeName=fromHash;
    }else{
      try{
        const stateName=(getProjectState().name||'').trim();
        if(stateName) activeName=stateName;
      }catch{}
      if(!activeName){
        const globalName=typeof window.currentProjectId==='string'?window.currentProjectId.trim():'';
        if(globalName&&globalName!=='default') activeName=globalName;
      }
    }
    window.currentProjectId=activeName||'default';
    if(activeName){
      try{
        const proj=getProjectState();
        if((proj.name||'')!==activeName){
          proj.name=activeName;
          setProjectState(proj);
        }
      }catch(err){console.warn('Project name sync failed',err);}
    }
  }
  if(typeof document==='undefined'||typeof location==='undefined') return;
  const navHash=location.hash||(activeName?`#${encodeURIComponent(activeName)}`:'');
  if(!navHash) return;
  document.querySelectorAll('a[href$=".html"]').forEach(a=>{
    const href=a.getAttribute('href');
    if(!href||href.includes('#')) return;
    a.setAttribute('href',href+navHash);
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
    let initialProjectName='';
    try{initialProjectName=getProjectState().name||'';}catch{}
    nameInput.value=initialProjectName;
    nameInput.dataset.originalName=(initialProjectName||'').trim();
    nameLabel.appendChild(nameInput);
    settingsMenu.insertBefore(nameLabel,settingsMenu.firstChild);
    nameInput.addEventListener('focus',()=>{
      try{nameInput.dataset.originalName=(getProjectState().name||'').trim();}
      catch{nameInput.dataset.originalName=nameInput.value.trim();}
    });
    const commitProjectNameChange=async()=>{
      const manager=globalThis.projectManager;
      const previous=(nameInput.dataset.originalName||'').trim();
      const next=nameInput.value.trim();
      if(!next){
        nameInput.value=previous;
        return;
      }
      if(next===previous) return;
      if(!manager?.renameProject){
        try{
          const proj=getProjectState();
          proj.name=next;
          setProjectState(proj);
          save(proj,{flush:true,reason:'name-rename-fallback'});
        }catch{}
        nameInput.dataset.originalName=next;
        return;
      }
      try{
        const updated=manager.renameProject(next);
        const resolved=(updated||next).trim();
        if(resolved!==nameInput.value) nameInput.value=resolved;
        nameInput.dataset.originalName=resolved;
      }catch(err){
        console.error('Project rename failed',err);
        try{
          const proj=getProjectState();
          proj.name=previous;
          setProjectState(proj);
          save(proj,{flush:true,reason:'name-revert'});
        }catch{}
        nameInput.value=previous;
        nameInput.dataset.originalName=previous;
        const message=err instanceof Error?err.message:'Project name could not be updated.';
        await showAlertModal('Rename Failed',message);
      }
    };
    nameInput.addEventListener('input',e=>{
      try{
        const proj=getProjectState();
        proj.name=e.target.value;
        setProjectState(proj);
        save(proj,{flush:true,reason:'name-input'});
      }catch{}
    });
    nameInput.addEventListener('change',()=>{commitProjectNameChange().catch(console.error);});
    nameInput.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        nameInput.blur();
      }
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
      await showAlertModal('Library Refreshed','Component and manufacturer libraries were reloaded.');
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
  save(null,{flush:true,reason:'settings-init'});
}

function initDarkMode(){
  const darkToggle=document.getElementById('dark-toggle');
  let session=getSessionPreferences();
  if(session.darkMode===undefined){
    const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
    session=updateSessionPreferences(prev=>({...(prev&&typeof prev==='object'?prev:{}),darkMode:prefersDark}));
  }
  const applyState=value=>{
    document.body.classList.toggle('dark-mode',!!value);
    if(darkToggle) darkToggle.checked=!!value;
  };
  applyState(session.darkMode);
  if(darkToggle){
    darkToggle.addEventListener('change',()=>{
      const value=!!darkToggle.checked;
      applyState(value);
      session=updateSessionPreferences(prev=>({...(prev&&typeof prev==='object'?prev:{}),darkMode:value}));
      if(typeof window.saveSession==='function') window.saveSession();
      if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
    });
  }
  window.addEventListener('storage',e=>{
    if(e.key==='ctrSession'){
      try{
        const data=e.newValue?JSON.parse(e.newValue):{};
        applyState(data&&data.darkMode);
        session=data||{};
      }catch{}
    }
  });
}

function initCompactMode(){
  const compactToggle=document.getElementById('compact-toggle');
  let session=getSessionPreferences();
  if(session.compactMode===undefined){
    session=updateSessionPreferences(prev=>({...(prev&&typeof prev==='object'?prev:{}),compactMode:false}));
  }
  const applyState=value=>{
    document.body.classList.toggle('compact-mode',!!value);
    if(compactToggle) compactToggle.checked=!!value;
  };
  applyState(session.compactMode);
  if(compactToggle){
    compactToggle.addEventListener('change',()=>{
      const value=!!compactToggle.checked;
      applyState(value);
      session=updateSessionPreferences(prev=>({...(prev&&typeof prev==='object'?prev:{}),compactMode:value}));
      if(typeof window.saveSession==='function') window.saveSession();
      if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
    });
  }
  window.addEventListener('storage',e=>{
    if(e.key==='ctrSession'){
      try{
        const data=e.newValue?JSON.parse(e.newValue):{};
        applyState(data&&data.compactMode);
        session=data||{};
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

function persistConduits(data){
  try{
    setConduitCache(data);
  }catch(e){console.error('Failed to persist conduits',e);}
}

function loadConduits(){
  try{
    const cached=getConduitCache();
    if(cached){
      return {
        ductbanks:Array.isArray(cached.ductbanks)?cached.ductbanks:[],
        conduits:Array.isArray(cached.conduits)?cached.conduits:[]
      };
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

function downloadProjectAsBlob(precomputedJson){
  try{
    const json=typeof precomputedJson==='string'?precomputedJson:JSON.stringify(exportProject(),null,2);
    const blob=new Blob([json],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='project.ctr.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),0);
  }catch(err){console.error('Export fallback failed',err);}
}

let fileWriteLock=Promise.resolve();
async function withFileWriteLock(fn){
  let release;
  const next=new Promise(resolve=>{release=resolve;});
  const previous=fileWriteLock;
  fileWriteLock=next;
  await previous.catch(()=>{});
  try{
    return await fn();
  }finally{
    release();
  }
}

async function writeProjectToHandle(handle){
  return withFileWriteLock(async()=>{
    if(!handle){
      downloadProjectAsBlob();
      return false;
    }
    let writable;
    let json;
    try{
      const data=exportProject();
      json=JSON.stringify(data,null,2);
      writable=await handle.createWritable();
      const shouldCompress=typeof handle.name==='string'&&handle.name.endsWith('.gz');
      const payload=shouldCompress?await compressString(json):json;
      await writable.write(payload);
      await writable.close();
      return true;
    }catch(err){
      console.error('File System Access export failed',err);
      if(writable){
        try{
          if(typeof writable.abort==='function') await writable.abort();
          else await writable.close();
        }catch(closeErr){console.error('Writable cleanup failed',closeErr);}
      }
      downloadProjectAsBlob(json);
      return false;
    }
  });
}

function updateSaveButtonState(){
  if(typeof document==='undefined') return;
  const btn=document.getElementById('save-project-btn');
  if(!btn) return;
  btn.disabled=false;
  if(cachedProjectFileHandle){
    btn.removeAttribute('title');
  }else if(typeof globalThis.showSaveFilePicker==='function'){
    btn.title='Choose a save location to enable autosave and quick saves.';
  }else{
    btn.title='Saving downloads a JSON backup because direct file access is unavailable.';
  }
}

function defaultManualSaveWarn(){
  console.warn('Select a save location with Save Project to enable autosave.');
}

async function defaultRequestProjectFileHandle(){
  if(typeof globalThis.showSaveFilePicker!=='function'){
    downloadProjectAsBlob();
    return {handle:null,cancelled:false};
  }
  try{
    const handle=await globalThis.showSaveFilePicker({
      suggestedName:'project.ctr.json',
      types:[{
        description:'CableTrayRoute Project',
        accept:{'application/json':['.ctr.json','.json']}
      }]
    });
    if(!handle) return {handle:null,cancelled:true};
    return {handle,cancelled:false};
  }catch(err){
    if(err?.name==='AbortError') return {handle:null,cancelled:true};
    console.error('showSaveFilePicker failed',err);
    downloadProjectAsBlob();
    return {handle:null,cancelled:false};
  }
}

async function ensureHandlePermission(handle){
  if(!handle||typeof handle.queryPermission!=='function') return true;
  try{
    let permission=await handle.queryPermission({mode:'readwrite'});
    if(permission==='granted') return true;
    if(typeof handle.requestPermission==='function'){
      permission=await handle.requestPermission({mode:'readwrite'});
      return permission==='granted';
    }
  }catch(err){console.warn('File permission request failed',err);}
  return false;
}

export function createAutoSaveScheduler({
  getHandle,
  writer=writeProjectToHandle,
  markClean=()=>getDirtyTracker()?.markClean?.(),
  setFlag=setAutoSaveFlag,
  warn=()=>{},
  intervalMs=AUTO_SAVE_INTERVAL_MS,
  schedule=(fn,delay)=>setInterval(fn,delay),
  cancel=id=>clearInterval(id)
}={}){
  let timerId=null;
  async function run(){
    const handle=typeof getHandle==='function'?getHandle():undefined;
    if(!handle){
      setFlag?.(false);
      warn?.();
      return false;
    }
    setFlag?.(true);
    let saved=false;
    try{
      saved=await writer(handle);
      if(saved) markClean?.();
    }catch(err){
      console.error('Autosave execution failed',err);
    }finally{
      setFlag?.(false);
    }
    return saved;
  }
  function start(){
    if(timerId!==null) return;
    timerId=schedule(run,intervalMs);
  }
  function stop(){
    if(timerId===null) return;
    cancel(timerId);
    timerId=null;
  }
  return {start,stop,run};
}

function ensureAutoSaveScheduler(){
  if(autoSaveSchedulerInstance) return autoSaveSchedulerInstance;
  autoSaveSchedulerInstance=createAutoSaveScheduler({
    getHandle:()=>cachedProjectFileHandle,
    writer:handle=>writeProjectToHandle(handle),
    markClean:()=>getDirtyTracker()?.markClean?.(),
    setFlag:setAutoSaveFlag,
    warn:()=>{updateSaveButtonState(); console.warn('Autosave skipped: choose Save Project to select a file for updates.');}
  });
  if(typeof window!=='undefined'){
    window.__CTR_autoSaveScheduler=autoSaveSchedulerInstance;
  }
  return autoSaveSchedulerInstance;
}

export async function manualSaveProject({
  requestHandle=defaultRequestProjectFileHandle,
  writer=writeProjectToHandle,
  ensurePermission=ensureHandlePermission,
  markClean=()=>getDirtyTracker()?.markClean?.(),
  notifyNoHandle=defaultManualSaveWarn
}={}){
  updateSaveButtonState();
  let handle=cachedProjectFileHandle;
  if(!handle){
    let requestResult=null;
    try{requestResult=await requestHandle();}catch(err){console.error('Manual save handle request failed',err);}
    if(requestResult&&typeof requestResult==='object'&&('handle'in requestResult||'cancelled'in requestResult)){
      const cancelled=Boolean(requestResult.cancelled);
      handle=requestResult.handle??null;
      if(!handle){
        if(cancelled) return false;
        notifyNoHandle?.();
        return null;
      }
    }else{
      handle=requestResult??null;
      if(!handle){
        notifyNoHandle?.();
        return null;
      }
    }
    cachedProjectFileHandle=handle;
    updateSaveButtonState();
  }
  let permitted=false;
  try{permitted=await ensurePermission(handle);}catch(err){console.error('Manual save permission check failed',err);}
  if(!permitted){
    cachedProjectFileHandle=null;
    updateSaveButtonState();
    notifyNoHandle?.();
    return false;
  }
  let saved=false;
  try{saved=await writer(handle);}catch(err){console.error('Manual save write failed',err);}
  if(saved){
    markClean?.();
    return true;
  }
  return null;
}

export function __setCachedProjectFileHandle(handle){
  cachedProjectFileHandle=handle||null;
  updateSaveButtonState();
}

export function __getCachedProjectFileHandle(){
  return cachedProjectFileHandle;
}

if(typeof window!=='undefined'){
  window.manualSaveProject=manualSaveProject;
}

function initProjectIO(){
  loadProjectFromHash();
  applyProjectHash();
  updateSaveButtonState();
  const exportBtn=document.getElementById('export-project-btn');
  const importBtn=document.getElementById('import-project-btn');
  const fileInput=document.getElementById('import-project-input');
  console.assert(importBtn&&fileInput,'Project import controls missing');
  if(exportBtn){
    exportBtn.addEventListener('click',async()=>{
      if(typeof globalThis.showSaveFilePicker==='function'){
        try{
          const handle=await globalThis.showSaveFilePicker({
            suggestedName:'project.ctr.json',
            types:[{
              description:'CableTrayRoute Project',
              accept:{'application/json':['.ctr.json','.json']}
            }]
          });
          if(!handle)return;
          cachedProjectFileHandle=handle;
          updateSaveButtonState();
          await writeProjectToHandle(handle);
        }catch(err){
          if(err?.name==='AbortError')return;
          console.error('showSaveFilePicker failed',err);
          downloadProjectAsBlob();
        }
      }else{
        downloadProjectAsBlob();
      }
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
  ensureAutoSaveScheduler().start();
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
