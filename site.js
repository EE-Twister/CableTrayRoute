import { installErrorTracking } from "./src/utils/errorTracking.js";
installErrorTracking();

import { UndoRedoManager } from "./undoRedo.mjs";
import { mountCopilot } from "./src/copilot.js";

import "./src/components/navigation.js";
import "./src/components/commandPalette.js";
import "./units.js";
import {
  exportProject,
  importProject,
  getOneLine,
  getStudies,
  loadProject,
  saveProject,
  getDuctbanks,
  getConduits,
  getEquipment,
  getLoads,
  getCables,
  getTrays,
  getLifecyclePackages,
  getReportSnapshots,
  getItem,
  applyRemoteSnapshot
} from "./dataStore.mjs";
import {
  workflowOrder as PROJECT_WORKFLOW_STEPS,
  getWorkflowStepForPage,
  getStepStatus,
  getCableReadiness,
  countOneLineComponents,
  getWorkflowPageModeContext
} from "./src/workflowStatus.js";
import { runValidation } from "./validation/rules.js";
import {
  PROJECT_KEY,
  defaultProject,
  initializeProjectStorage,
  getProjectState,
  setProjectKey,
  setProjectState,
  onProjectChange,
  getSessionPreferences,
  updateSessionPreferences,
  getThemePreference,
  setThemePreference,
  setConduitCache,
  getConduitCache,
  getAuthContextState
} from "./projectStorage.js";
import { openModal, showAlertModal } from "./src/components/modal.js";
import { createDomWriteBatcher, createElementCache, createHandlerProfiler } from "./src/utils/domLifecycle.js";
import { initCollaboration, stopCollaboration } from "./src/collabManager.js";

const FOCUSABLE="a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";
const CHECKPOINT_KEY='CTR_CHECKPOINT';
const MAX_CHECKPOINT_SIZE=2*1024*1024; // ~2MB
const AUTO_SAVE_INTERVAL_MS=5*60*1000;
const ONBOARDING_STATE_KEY='onboarding';
const ONBOARDING_VERSION='2026.03';
let cachedProjectFileHandle=null;
let autoSaveSchedulerInstance=null;
let dirtyTrackerInstance=null;
let operationToastTimer=null;
let lastSavedAt=null;
let lastSavedIndicatorTimer=null;

const ONBOARDING_SAMPLE_PROJECT={
  name:'Sample Project - Getting Started',
  equipment:[
    {id:'SUB-1',tag:'SUB-1',description:'Utility substation',category:'Source',voltage:'13.8kV',x:0,y:0,z:0},
    {id:'MCC-1',tag:'MCC-1',description:'Main motor control center',category:'Distribution',voltage:'480V',x:80,y:0,z:0},
    {id:'PANEL-A',tag:'PANEL-A',description:'Area panelboard',category:'Panel',voltage:'480V',x:150,y:40,z:0}
  ],
  loads:[
    {id:'MOTOR-101',tag:'MOTOR-101',description:'Cooling tower fan motor',source:'PANEL-A',kw:75,voltage:'480V',loadType:'Motor'},
    {id:'UPS-1',tag:'UPS-1',description:'Control UPS',source:'PANEL-A',kw:15,voltage:'480V',loadType:'UPS'}
  ],
  cables:[
    {id:'CABLE-001',from:'MCC-1',to:'PANEL-A',conductor_size:'500 kcmil',insulation_type:'XLPE',voltage_rating:'5kV',length:180,route_preference:'TRAY-01'},
    {id:'CABLE-002',from:'PANEL-A',to:'MOTOR-101',conductor_size:'2/0 AWG',insulation_type:'THHN',voltage_rating:'600V',length:95,route_preference:'TRAY-02'},
    {id:'CABLE-003',from:'PANEL-A',to:'UPS-1',conductor_size:'1/0 AWG',insulation_type:'THHN',voltage_rating:'600V',length:110,route_preference:'C-101'}
  ],
  trays:[
    {tray_id:'TRAY-01',start_x:0,start_y:0,start_z:12,end_x:140,end_y:0,end_z:12,inside_width:24,tray_depth:4,tray_type:'Ladder (50 % fill)',allowed_cable_group:'power'},
    {tray_id:'TRAY-02',start_x:140,start_y:0,start_z:12,end_x:140,end_y:80,end_z:12,inside_width:18,tray_depth:4,tray_type:'Ladder (50 % fill)',allowed_cable_group:'power'}
  ],
  conduits:[
    {conduit_id:'C-101',type:'RMC',trade_size:'3',start_x:140,start_y:80,start_z:0,end_x:200,end_y:80,end_z:0,allowed_cable_group:'control'}
  ],
  ductbanks:[
    {tag:'DB-01',from:'SUB-1',to:'MCC-1',concrete_encasement:true,start_x:-80,start_y:0,start_z:-4,end_x:0,end_y:0,end_z:-4}
  ],
  oneLine:{
    activeSheet:0,
    sheets:[{
      name:'Sample One-Line',
      components:[
        {id:'sub-1',ref:'SUB-1',label:'SUB-1',type:'utility_source',subtype:'utility',x:80,y:120,connections:[{target:'mcc-1'}]},
        {id:'mcc-1',ref:'MCC-1',label:'MCC-1',type:'equipment',subtype:'switchgear',x:300,y:120,connections:[{target:'panel-a'}]},
        {id:'panel-a',ref:'PANEL-A',label:'PANEL-A',type:'panel',subtype:'panelboard',x:520,y:120,connections:[{target:'motor-101'},{target:'ups-1'}]},
        {id:'motor-101',ref:'MOTOR-101',label:'MOTOR-101',type:'load',subtype:'motor_load',x:740,y:80,connections:[]},
        {id:'ups-1',ref:'UPS-1',label:'UPS-1',type:'load',subtype:'ups_load',x:740,y:180,connections:[]}
      ],
      connections:[]
    }]
  }
};

function ensureOperationToast(){
  if(typeof document==='undefined') return null;
  let toast=document.getElementById('toast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='toast';
    toast.className='toast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    document.body.appendChild(toast);
  }
  return toast;
}

function applyPageVisualIdentity(){
  if(typeof document==='undefined') return;
  const body=document.body;
  if(!body) return;
  const file=(window.location.pathname.split('/').pop()||'index.html').toLowerCase();
  const visualMap=[
    {match:/schedule|list/,value:'schedule'},
    {match:/route|ductbank|pullcards|supportspan/,value:'routing'},
    {match:/fill/,value:'capacity'},
    {match:/arcflash|harmonics|voltageflicker|motorstart|shortcircuit|loadflow|tcc|conduitbend|busdust|besshazard|insulationcoordination/,value:'analysis'},
    {match:/oneline|custom-components|mcclineup|lineup/,value:'diagram'},
    {match:/account|login|forgot-password|reset-password/,value:'account'},
    {match:/index/,value:'home'}
  ];
  const visual=visualMap.find(entry=>entry.match.test(file))?.value||'default';
  body.dataset.pageVisual=visual;

  document.querySelectorAll('.page-header').forEach((header,index)=>{
    if(!(header instanceof HTMLElement)) return;
    header.classList.add('page-header-graphic');
    const title=header.querySelector('h1,h2');
    if(title&&title.id){
      header.setAttribute('aria-labelledby',title.id);
    }else if(title&&index===0){
      const generatedId='page-header-title';
      title.id=generatedId;
      header.setAttribute('aria-labelledby',generatedId);
    }
  });
}

function showOperationToast(message,kind='success'){
  const toast=ensureOperationToast();
  if(!toast) return;
  toast.textContent=message;
  toast.classList.remove('toast-error','toast-success');
  toast.classList.add(kind==='error'?'toast-error':'toast-success','show');
  // Errors need immediate screen-reader announcement
  toast.setAttribute('aria-live', kind==='error' ? 'assertive' : 'polite');
  toast.setAttribute('role', kind==='error' ? 'alert' : 'status');
  if(operationToastTimer) clearTimeout(operationToastTimer);
  operationToastTimer=setTimeout(()=>{
    toast.classList.remove('show','toast-error','toast-success');
    operationToastTimer=null;
  },3200);
}

function getOnboardingSettings(){
  try{
    const state=getProjectState();
    const onboarding=state?.settings?.[ONBOARDING_STATE_KEY];
    return onboarding&&typeof onboarding==='object'?onboarding:{};
  }catch{
    return {};
  }
}

function saveOnboardingSettings(patch={}){
  const next={
    ...getOnboardingSettings(),
    ...patch,
    version:ONBOARDING_VERSION,
    updatedAt:new Date().toISOString()
  };
  setProjectKey(ONBOARDING_STATE_KEY,JSON.stringify(next));
  return next;
}

async function initializeSampleProject(){
  setProjectKey('equipment',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.equipment));
  setProjectKey('loadList',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.loads));
  setProjectKey('oneLineDiagram',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.oneLine));
  setProjectKey('cableSchedule',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.cables));
  setProjectKey('traySchedule',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.trays));
  setProjectKey('conduitSchedule',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.conduits));
  setProjectKey('ductbankSchedule',JSON.stringify(ONBOARDING_SAMPLE_PROJECT.ductbanks));
  const state=getProjectState();
  state.name=ONBOARDING_SAMPLE_PROJECT.name;
  setProjectState(state);
  saveProject(ONBOARDING_SAMPLE_PROJECT.name);
  saveOnboardingSettings({sampleLoadedAt:new Date().toISOString()});
  await updateProjectDisplay();
}

async function runOnboardingFlow({force=false,source='auto'}={}){
  if(typeof document==='undefined') return;
  if(!force&&new URLSearchParams(window.location.search).has('e2e')) return;
  const state=getOnboardingSettings();
  if(!force&&state.completed===true&&state.version===ONBOARDING_VERSION) return;
  if(!force&&state.dismissedVersion===ONBOARDING_VERSION) return;
  const totalSteps=6;
  const stepIndicator=i=>`Step ${i+1} of ${totalSteps}`;
  const steps=[
    {
      title:'Welcome to CableTrayRoute',
      description:'This quick onboarding walks you through the project workflow in under a minute.',
      details:`${stepIndicator(0)}\n\nCableTrayRoute modules can be used independently, but the integrated path is Equipment List -> Load List -> One-Line -> Cable Schedule -> Raceway Schedule -> Fill / Routing -> Studies -> Deliverables.\n\nThe One-Line no longer overwrites schedules automatically. Use Reconcile Schedules when you want to preview and apply schedule updates.`
    },
    {
      title:'Load a sample project in one click',
      description:'Need a working baseline? Seed the workflow with sample equipment, loads, cables, raceways, and a one-line.',
      details:`${stepIndicator(1)}\n\nClick "Load Sample Project" to populate a sample dataset with equipment, loads, a one-line, 3 cables, 2 trays, 1 conduit, and 1 ductbank. This lets you explore the integrated workflow without manual data entry.`,
      showSampleLoader:true
    },
    {
      title:'Step 1 - Equipment and Loads',
      description:'Start with the project inventory and load definitions.',
      details:`${stepIndicator(2)}\n\nUse Equipment List for major equipment, then Load List for load records and source relationships. Either page can still be used by itself when you are only building one schedule.`,
      links:[
        {href:'equipmentlist.html',label:'Open Equipment List'},
        {href:'loadlist.html',label:'Open Load List'}
      ]
    },
    {
      title:'Step 2 - One-Line and Reconcile',
      description:'Draw the model and choose when schedule data should update.',
      details:`${stepIndicator(3)}\n\nUse One-Line to model the electrical relationships. When you want those records to feed schedules, click Reconcile Schedules and review the create, update, and conflict counts before applying.`,
      link:{href:'oneline.html',label:'Open One-Line'}
    },
    {
      title:'Step 3 - Cable and Raceway Schedules',
      description:'Complete schedule-ready cables and routing-ready raceway assignments.',
      details:`${stepIndicator(4)}\n\nCable rows are schedule-ready when they have tag, from/to, conductor size, and length. They become routing-ready after a raceway assignment is added. Raceway Schedule captures trays, conduits, and ductbanks for fill and routing.`,
      links:[
        {href:'cableschedule.html',label:'Open Cable Schedule'},
        {href:'racewayschedule.html',label:'Open Raceway Schedule'}
      ]
    },
    {
      title:'Settings, help, and collaboration',
      description:'Find everything you need from the settings menu.',
      details:`${stepIndicator(5)}\n\nAfter the model is coordinated, run fill/routing pages, studies, and deliverables from the workflow navigation.\n\nUse Settings > Site Help for reference documentation. Save and load projects using the project buttons in Settings. Reopen this tour at any time from Settings > Reopen Onboarding.`,
      links:[
        {href:'cabletrayfill.html',label:'Tray Fill'},
        {href:'optimalRoute.html',label:'Optimal Route'},
        {href:'projectreport.html',label:'Project Report'}
      ]
    }
  ];

  let index=0;
  while(index<steps.length){
    const isFirst=index===0;
    const isLast=index===steps.length-1;
    const step=steps[index];
    let move='next';
    const result=await openModal({
      title:step.title,
      description:step.description,
      primaryText:isLast?'Finish':'Next',
      secondaryText:isFirst?'Skip':'Back',
      defaultWidth:'medium',
      onSubmit(){
        move='next';
        return true;
      },
      onCancel(){
        move=isFirst?'skip':'back';
      },
      render(container){
        const note=document.createElement('pre');
        note.className='modal-message onboarding-details';
        note.style.cssText='white-space:pre-wrap;font-family:inherit;margin:0 0 0.75rem;font-size:0.88rem;';
        note.textContent=step.details;
        container.appendChild(note);

        // Quick-link buttons for workflow steps
        const allLinks=[...(step.links||[]),...(step.link?[step.link]:[])];
        if(allLinks.length){
          const linkRow=document.createElement('div');
          linkRow.style.cssText='display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;';
          allLinks.forEach(({href,label})=>{
            const a=document.createElement('a');
            a.href=href;
            a.textContent=label;
            a.className='btn secondary-btn';
            a.style.fontSize='0.8rem';
            linkRow.appendChild(a);
          });
          container.appendChild(linkRow);
        }

        if(!step.showSampleLoader) return null;
        const loadSampleBtn=document.createElement('button');
        loadSampleBtn.type='button';
        loadSampleBtn.className='btn secondary-btn';
        loadSampleBtn.textContent='Load Sample Project';
        loadSampleBtn.addEventListener('click',async()=>{
          try{
            loadSampleBtn.disabled=true;
            await initializeSampleProject();
            loadSampleBtn.textContent='Sample Project Loaded ✓';
            showOperationToast('Sample project initialized.','success');
          }catch(err){
            console.error('Sample project initialization failed',err);
            loadSampleBtn.disabled=false;
            loadSampleBtn.textContent='Load Sample Project';
            showOperationToast('Sample project initialization failed.','error');
          }
        });
        container.appendChild(loadSampleBtn);
        return loadSampleBtn;
      }
    });
    if(result===null){
      if(move==='back'){
        index=Math.max(0,index-1);
        continue;
      }
      saveOnboardingSettings({
        completed:false,
        dismissedVersion:ONBOARDING_VERSION,
        dismissedAt:new Date().toISOString(),
        source
      });
      return;
    }
    index+=1;
  }

  saveOnboardingSettings({
    completed:true,
    completedAt:new Date().toISOString(),
    dismissedVersion:'',
    source
  });
}

function initOperationStatusHost(container){
  if(!container||typeof document==='undefined') return null;
  let host=document.getElementById('settings-operation-status');
  if(host) return host;
  host=document.createElement('div');
  host.id='settings-operation-status';
  host.className='settings-operation-status';
  host.setAttribute('aria-live','polite');
  host.setAttribute('aria-atomic','true');
  host.setAttribute('role','status');
  host.innerHTML='\n    <div class="operation-placeholder" aria-hidden="true">\n      <span class="operation-spinner"></span>\n      <span class="operation-progress-text">Idle</span>\n    </div>\n    <p class="operation-status-screenreader visually-hidden">Ready</p>\n  ';
  container.appendChild(host);
  // Inject last-saved indicator if not already present
  if(!document.getElementById('last-saved-indicator')){
    const indicator=document.createElement('span');
    indicator.id='last-saved-indicator';
    indicator.className='last-saved-indicator';
    indicator.setAttribute('aria-live','polite');
    container.appendChild(indicator);
  }
  updateLastSavedIndicator();
  return host;
}

function setOperationStatus(statusHost,phase,statusText){
  if(!statusHost) return;
  const placeholder=statusHost.querySelector('.operation-placeholder');
  const progressText=statusHost.querySelector('.operation-progress-text');
  const sr=statusHost.querySelector('.operation-status-screenreader');
  if(!placeholder||!progressText||!sr) return;
  progressText.textContent=statusText;
  sr.textContent=statusText;
  statusHost.dataset.phase=phase;
  const isBusy=phase==='busy';
  placeholder.classList.toggle('is-active',isBusy);
  placeholder.classList.toggle('is-complete',phase==='success');
  placeholder.classList.toggle('is-error',phase==='error');
}

function createSettingsSection(title,description,sectionKey){
  const section=document.createElement('section');
  section.className=`settings-menu__section settings-menu__section--${sectionKey}`;
  section.dataset.settingsSection=sectionKey;
  const heading=document.createElement('h3');
  heading.className='settings-menu__section-title';
  heading.textContent=title;
  section.appendChild(heading);
  if(description){
    const copy=document.createElement('p');
    copy.className='settings-menu__section-description';
    copy.textContent=description;
    section.appendChild(copy);
  }
  const body=document.createElement('div');
  body.className='settings-menu__section-body';
  body.dataset.settingsSectionBody=sectionKey;
  section.appendChild(body);
  return { section, body };
}

function moveSettingsNode(body,node){
  if(!body||!node) return;
  body.appendChild(node);
}

function enhanceSettingsMenu(settingsMenu){
  if(!settingsMenu||settingsMenu.dataset.enhanced==='1') return;
  settingsMenu.dataset.enhanced='1';
  settingsMenu.classList.add('settings-menu--enhanced');

  const header=document.createElement('div');
  header.className='settings-menu__header';
  header.innerHTML='<div><p class="settings-menu__eyebrow">Workspace</p><h2 id="settings-menu-title">Settings</h2></div>';
  settingsMenu.insertBefore(header,settingsMenu.firstChild);
  settingsMenu.setAttribute('aria-labelledby','settings-menu-title');

  const project=createSettingsSection(
    'Project',
    'Manage the current project, backups, and share links.',
    'project'
  );
  const preferences=createSettingsSection(
    'Preferences',
    'Adjust how the workspace looks and reports units.',
    'preferences'
  );
  const tools=createSettingsSection(
    'Tools',
    'Run checks, refresh libraries, and create reports.',
    'tools'
  );
  const account=createSettingsSection(
    'Account',
    'Server login controls for cloud-backed project workflows.',
    'account'
  );
  account.section.hidden=true;

  const projectNameLabel=document.getElementById('project-name-input')?.closest('label');
  const themeLabel=document.getElementById('theme-select')?.closest('label');
  const compactLabel=document.getElementById('compact-toggle')?.closest('label');
  const unitLabel=document.getElementById('unit-select')?.closest('label');
  const projectButtons=[
    document.getElementById('new-project-btn'),
    document.getElementById('save-project-btn'),
    document.getElementById('load-project-btn'),
    document.getElementById('copy-share-link-btn'),
    document.getElementById('export-project-btn'),
    document.getElementById('import-project-btn')
  ];
  const toolButtons=[
    document.getElementById('help-btn'),
    document.getElementById('reopen-onboarding-btn'),
    document.getElementById('run-self-check-btn'),
    document.getElementById('refresh-library-btn'),
    document.getElementById('generate-report-btn'),
    document.getElementById('export-reports-btn'),
    document.getElementById('print-labels-btn')
  ];
  const statusHost=document.getElementById('settings-operation-status');
  const lastSaved=document.getElementById('last-saved-indicator');

  moveSettingsNode(project.body,projectNameLabel);
  projectButtons.forEach(button=>moveSettingsNode(project.body,button));
  moveSettingsNode(project.body,statusHost);
  moveSettingsNode(project.body,lastSaved);

  [themeLabel,compactLabel,unitLabel].forEach(label=>moveSettingsNode(preferences.body,label));
  toolButtons.forEach(button=>moveSettingsNode(tools.body,button));

  [project.section,preferences.section,tools.section,account.section].forEach(section=>{
    settingsMenu.appendChild(section);
  });

  settingsMenu.querySelectorAll('label').forEach(label=>{
    label.classList.add('settings-menu__field');
  });
  compactLabel?.classList.add('settings-menu__toggle-row');
  settingsMenu.querySelectorAll('button,.btn').forEach(button=>{
    button.classList.add('settings-menu__action');
  });
  document.getElementById('save-project-btn')?.classList.add('settings-menu__action--primary');

  const moveUngroupedNode=node=>{
    if(!node||node.nodeType!==1) return;
    if(node.closest('.settings-menu__section')) return;
    if(node.matches('button,.btn')){
      node.classList.add('settings-menu__action');
      moveSettingsNode(account.body,node);
      account.section.hidden=false;
    }
  };

  Array.from(settingsMenu.children).forEach(moveUngroupedNode);

  if(typeof MutationObserver!=='undefined'){
    const observer=new MutationObserver(mutations=>{
      mutations.forEach(mutation=>{
        mutation.addedNodes.forEach(moveUngroupedNode);
      });
    });
    observer.observe(settingsMenu,{childList:true});
  }
}

async function runOperationWithStatus(statusHost,{pendingText,successText,errorText,operation,toastSuccess=true}){
  setOperationStatus(statusHost,'busy',pendingText);
  try{
    const result=await operation();
    setOperationStatus(statusHost,'success',successText);
    if(toastSuccess) showOperationToast(successText,'success');
    return result;
  }catch(err){
    console.error(errorText,err);
    const detail=err instanceof Error&&err.message?` ${err.message}`:'';
    const message=`${errorText}.${detail}`.trim();
    setOperationStatus(statusHost,'error',message);
    showOperationToast(errorText,'error');
    throw err;
  }
}

function currentProjectFromHash(){
  if(typeof location==='undefined') return '';
  const hash=location.hash;
  if(!hash||hash==='#'||hash.startsWith('#project=')) return '';
  try{
    const value=decodeURIComponent(hash.slice(1)).trim();
    return isPageAnchorHash(value)?'':value;
  }catch{
    return '';
  }
}

function isPageAnchorHash(value){
  if(!value||typeof document==='undefined') return false;
  try{
    if(document.getElementById?.(value)) return true;
    if(typeof document.querySelector==='function'&&typeof CSS!=='undefined'&&typeof CSS.escape==='function'){
      return Boolean(document.querySelector(`[name="${CSS.escape(value)}"]`));
    }
  }catch{}
  return false;
}

function displayProjectName(rawName){
  const name=String(rawName||'').trim();
  if(!name||name==='default'||isPageAnchorHash(name)) return 'Untitled';
  return name;
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

function formatLastSaved(date){
  if(!date) return '';
  const diff=Math.round((Date.now()-date.getTime())/1000);
  if(diff<5) return 'Saved just now';
  if(diff<60) return `Saved ${diff}s ago`;
  const mins=Math.floor(diff/60);
  if(mins<60) return `Saved ${mins}m ago`;
  const hrs=Math.floor(mins/60);
  return `Saved ${hrs}h ago`;
}

function updateLastSavedIndicator(){
  if(typeof document==='undefined') return;
  const el=document.getElementById('last-saved-indicator');
  if(!el) return;
  const savedText=formatLastSaved(lastSavedAt);
  if(savedText){
    el.textContent=`${savedText} • Edits auto-save in this browser.`;
  }else{
    el.textContent='Edits auto-save in this browser. Use Save Project for a downloadable backup.';
  }
}

function recordSave(){
  lastSavedAt=new Date();
  updateLastSavedIndicator();
  // Refresh "X ago" text every 30 seconds while the page is open
  if(lastSavedIndicatorTimer) clearInterval(lastSavedIndicatorTimer);
  lastSavedIndicatorTimer=setInterval(updateLastSavedIndicator,30000);
  if(lastSavedIndicatorTimer&&typeof lastSavedIndicatorTimer.unref==='function'){
    lastSavedIndicatorTimer.unref();
  }
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
    if(typeof CompressionStream==='function'&&typeof Blob==='function'){
      const stream=new Blob([str],{type:'application/json'}).stream().pipeThrough(new CompressionStream('gzip'));
      const buffer=await new Response(stream).arrayBuffer();
      return new Uint8Array(buffer);
    }
  }catch{}
  try{
    return new TextEncoder().encode(str);
  }catch{
    return new Uint8Array();
  }
}

async function decompressBytes(bytes){
  try{
    if(typeof DecompressionStream==='function'&&typeof Blob==='function'){
      const stream=new Blob([bytes],{type:'application/octet-stream'}).stream().pipeThrough(new DecompressionStream('gzip'));
      const buffer=await new Response(stream).arrayBuffer();
      return new TextDecoder().decode(buffer);
    }
  }catch{}
  try{
    return new TextDecoder().decode(bytes);
  }catch{
    return '';
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
  const name=displayProjectName(proj.name);
  try{
    const hash=await sha256Hex(canonicalJSONString(proj));
    let span=document.getElementById('project-display');
    if(!span){
      const nav=document.querySelector('.top-nav .nav-links');
      if(nav){
        span=document.createElement('span');
        span.id='project-display';
        span.style.marginLeft='auto';
        span.style.marginRight='var(--space-4)';
        const currentSettingsBtn=document.getElementById('settings-btn');
        if(currentSettingsBtn&&currentSettingsBtn.parentElement===nav&&nav.contains(currentSettingsBtn)){
          try{
            nav.insertBefore(span,currentSettingsBtn);
            currentSettingsBtn.style.marginLeft='0';
          }catch(err){
            console.warn('project display insert fallback',err);
            nav.appendChild(span);
          }
        }else{
          nav.appendChild(span);
        }
      }
    }
    if(span){
      span.classList?.add('project-display-chip');
      span.textContent=`Project: ${name}`;
      span.title=`Project hash: ${hash.slice(0,8)}`;
    }
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
      if(name&&!isPageAnchorHash(name)) loadProject(name);
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
      const globalName=typeof window.currentProjectId==='string'?window.currentProjectId.trim():'';
      if(globalName&&globalName!=='default'&&!isPageAnchorHash(globalName)) activeName=globalName;
    }
    window.currentProjectId=activeName||'default';
  }
  if(typeof document==='undefined'||typeof location==='undefined') return;
  const projectHash=currentProjectFromHash();
  const navHash=projectHash?`#${encodeURIComponent(projectHash)}`:(activeName?`#${encodeURIComponent(activeName)}`:'');
  if(!navHash) return;
  document.querySelectorAll('a[href$=".html"]').forEach(a=>{
    const href=a.getAttribute('href');
    if(!href||href.includes('#')) return;
    a.setAttribute('href',href+navHash);
  });
}

function hasWorkflowValue(value){
  if(Array.isArray(value)) return value.some(hasWorkflowValue);
  if(value&&typeof value==='object') return Object.keys(value).length>0;
  return value!==null&&value!==undefined&&String(value).trim()!=='';
}

function meaningfulHomeRecords(records){
  if(!Array.isArray(records)) return [];
  return records.filter(record=>{
    if(!record||typeof record!=='object') return false;
    return Object.entries(record).some(([key,value])=>!key.startsWith('_')&&hasWorkflowValue(value));
  });
}

function safeReadHomeData(getter,fallback){
  try{return getter();}
  catch(err){
    console.warn('Homepage summary read failed',err);
    return fallback;
  }
}

function homeField(record,names){
  for(const name of names){
    if(hasWorkflowValue(record?.[name])) return record[name];
  }
  return '';
}

function homeCableTag(cable){
  return homeField(cable,['tag','id','cable_id','cableId','ref'])||'Untitled';
}

function homeCableFrom(cable){
  return homeField(cable,['from','from_tag','fromTag','source','source_tag'])||'--';
}

function homeCableTo(cable){
  return homeField(cable,['to','to_tag','toTag','destination','load','load_tag'])||'--';
}

function homeCableSize(cable){
  return homeField(cable,['conductor_size','conductorSize','cable_size','wire_size','size'])||'--';
}

function countHomeStudies(studies){
  if(!studies||typeof studies!=='object') return 0;
  return Object.values(studies).filter(hasWorkflowValue).length;
}

function countHomeReportSnapshots(snapshots){
  if(Array.isArray(snapshots)) return snapshots.length;
  if(snapshots&&typeof snapshots==='object') return Object.keys(snapshots).length;
  return 0;
}

function pluralHome(count,singular,plural=singular+'s'){
  return `${count} ${count===1?singular:plural}`;
}

function stripWorkflowNumber(label){
  return String(label||'').replace(/^\d+\.\s*/,'');
}

function setHomeText(id,text){
  const el=document.getElementById(id);
  if(el) el.textContent=text;
}

function setHomeLink(id,href,text){
  const el=document.getElementById(id);
  if(!el) return;
  el.setAttribute('href',href);
  el.textContent=text;
}

function numericPercent(record,names){
  for(const name of names){
    const raw=record?.[name];
    if(raw===null||raw===undefined||raw==='') continue;
    const value=Number(String(raw).replace('%',''));
    if(Number.isFinite(value)) return value;
  }
  return null;
}

function averageHomeFill(records){
  const values=records
    .map(record=>numericPercent(record,['fill_pct','fillPercent','percent_fill','percentFill','fill','tray_fill_pct','conduit_fill_pct']))
    .filter(value=>Number.isFinite(value));
  if(!values.length) return null;
  return Math.round(values.reduce((sum,value)=>sum+value,0)/values.length);
}

function collectHomepageSummary(){
  const equipment=meaningfulHomeRecords(safeReadHomeData(getEquipment,[]));
  const loads=meaningfulHomeRecords(safeReadHomeData(getLoads,[]));
  const oneLine=safeReadHomeData(getOneLine,{activeSheet:0,sheets:[]});
  const cables=meaningfulHomeRecords(safeReadHomeData(getCables,[]));
  const trays=meaningfulHomeRecords(safeReadHomeData(getTrays,[]));
  const conduits=meaningfulHomeRecords(safeReadHomeData(getConduits,[]));
  const ductbanks=meaningfulHomeRecords(safeReadHomeData(getDuctbanks,[]));
  const studies=safeReadHomeData(getStudies,{});
  const lifecyclePackages=safeReadHomeData(getLifecyclePackages,[]);
  const reportSnapshots=safeReadHomeData(getReportSnapshots,{});
  const reconcilePending=Boolean(safeReadHomeData(()=>getItem('oneLineScheduleReconcilePending',false),false));
  const cableReadiness=getCableReadiness(cables);
  const oneLineComponents=countOneLineComponents(oneLine);
  const raceways=trays.length+conduits.length+ductbanks.length;
  const stepStatuses=PROJECT_WORKFLOW_STEPS.map(step=>({
    ...step,
    status:getStepStatus(step.key,{
      equipment,
      loads,
      oneLine,
      cables,
      trays,
      conduits,
      ductbanks,
      studies,
      lifecyclePackages,
      reportSnapshots
    })
  }));
  const completeCount=stepStatuses.filter(step=>step.status.complete).length;
  const nextStep=stepStatuses.find(step=>!step.status.complete)||stepStatuses[stepStatuses.length-1];
  const packageCount=Array.isArray(lifecyclePackages)?lifecyclePackages.length:0;
  const reportCount=countHomeReportSnapshots(reportSnapshots);
  const routeRecords=[...trays,...conduits,...ductbanks];

  return {
    equipment,
    loads,
    oneLine,
    oneLineComponents,
    cables,
    trays,
    conduits,
    ductbanks,
    studies,
    studyCount:countHomeStudies(studies),
    lifecyclePackages,
    reportCount:packageCount+reportCount,
    reconcilePending,
    cableReadiness,
    raceways,
    routeRecords,
    averageFill:averageHomeFill(routeRecords),
    routeWarnings:routeRecords.filter(record=>{
      const pct=numericPercent(record,['fill_pct','fillPercent','percent_fill','percentFill','fill']);
      return Number.isFinite(pct)&&pct>40;
    }).length,
    stepStatuses,
    completeCount,
    nextStep
  };
}

function renderHomeCablePreview(cables){
  const table=document.getElementById('home-cable-preview-table');
  if(!table) return;
  const head=table.querySelector('.mini-table__head');
  table.replaceChildren();
  if(head) table.appendChild(head);

  const rows=cables.slice(0,3);
  if(!rows.length){
    const empty=document.createElement('div');
    empty.className='mini-table__empty';
    empty.setAttribute('role','row');
    const cell=document.createElement('span');
    cell.setAttribute('role','cell');
    cell.textContent='No cable rows yet. Start the Cable Schedule to populate this preview.';
    empty.appendChild(cell);
    table.appendChild(empty);
    return;
  }

  rows.forEach(cable=>{
    const row=document.createElement('div');
    row.setAttribute('role','row');
    const status=getCableReadiness([cable]);
    const statusClass=status.routingReady?'status-dot--ready':status.scheduleReady?'status-dot--route':'status-dot--open';
    const statusText=status.routingReady?'Routing-ready':status.scheduleReady?'Schedule-ready':'Needs schedule';
    [
      homeCableTag(cable),
      homeCableFrom(cable),
      homeCableTo(cable),
      homeCableSize(cable)
    ].forEach(value=>{
      const cell=document.createElement('span');
      cell.setAttribute('role','cell');
      cell.textContent=value;
      row.appendChild(cell);
    });
    const statusCell=document.createElement('span');
    statusCell.setAttribute('role','cell');
    const dot=document.createElement('i');
    dot.className=`status-dot ${statusClass}`;
    statusCell.appendChild(dot);
    statusCell.append(statusText);
    row.appendChild(statusCell);
    table.appendChild(row);
  });
}

function renderHomeReadiness(summary){
  const list=document.getElementById('home-readiness-list');
  if(!list) return;
  const items=[
    ['Equipment basis',summary.equipment.length?pluralHome(summary.equipment.length,'item'):'Not started'],
    ['Load relationships',summary.loads.length?pluralHome(summary.loads.length,'load'):'Not started'],
    ['Schedule reconcile',summary.reconcilePending?'Pending':'Manual'],
    ['Cable schedule',summary.cableReadiness.total?`${summary.cableReadiness.scheduleReady}/${summary.cableReadiness.total} ready`:'Not started'],
    ['Raceway model',summary.raceways?pluralHome(summary.raceways,'raceway','raceways'):'Not started'],
    ['Reports',summary.reportCount?pluralHome(summary.reportCount,'deliverable'):'Pending']
  ];
  list.replaceChildren();
  items.forEach(([label,value])=>{
    const item=document.createElement('li');
    const labelEl=document.createElement('span');
    labelEl.textContent=label;
    const valueEl=document.createElement('strong');
    valueEl.textContent=value;
    item.append(labelEl,valueEl);
    list.appendChild(item);
  });
}

function renderHomepageCommandCenter(){
  if(typeof document==='undefined'||!document.body?.classList?.contains('home-page')) return;
  const summary=collectHomepageSummary();
  let projectName='Untitled';
  try{projectName=displayProjectName(getProjectState().name);}
  catch{}

  setHomeText('home-project-card-title',projectName==='Untitled'?'Untitled Project':projectName);
  setHomeText('home-project-card-meta',summary.completeCount?`${summary.completeCount} of ${PROJECT_WORKFLOW_STEPS.length} workflow steps complete`:'Local workspace');
  setHomeText('home-project-record-count',pluralHome(summary.equipment.length+summary.loads.length+summary.cables.length,'record'));
  setHomeText('home-project-route-count',pluralHome(summary.raceways,'raceway','raceways'));

  if(summary.reconcilePending){
    setHomeText('home-next-action-title','Reconcile One-Line');
    setHomeText('home-next-action-detail','One-Line changes are pending schedule reconcile.');
    setHomeLink('home-next-action-link','oneline.html','Open One-Line');
  } else if(summary.nextStep){
    const stepName=stripWorkflowNumber(summary.nextStep.label);
    const actionPrefix=summary.completeCount?'Continue':'Start';
    setHomeText('home-next-action-title',`${actionPrefix} ${stepName}`);
    setHomeText('home-next-action-detail',summary.nextStep.status.hint||summary.nextStep.hint||summary.nextStep.status.label);
    setHomeLink('home-next-action-link',summary.nextStep.href,`Open ${stepName}`);
  }
  setHomeText('home-next-action-metrics',`${pluralHome(summary.equipment.length,'equipment item')} / ${pluralHome(summary.loads.length,'load')} / ${pluralHome(summary.cableReadiness.total,'cable row')}`);

  const sheetCount=Array.isArray(summary.oneLine?.sheets)?summary.oneLine.sheets.length:0;
  setHomeText(
    'home-oneline-summary',
    summary.oneLineComponents
      ? `${pluralHome(summary.oneLineComponents,'component')} across ${pluralHome(sheetCount,'sheet')}`
      : 'No one-line components yet. Schedules can still be built independently.'
  );

  renderHomeCablePreview(summary.cables);

  setHomeText('home-raceway-count',String(summary.raceways));
  setHomeText('home-raceway-label',summary.raceways?'available':'defined');
  setHomeText('home-avg-fill',summary.averageFill===null?'--':`${summary.averageFill}%`);
  setHomeText('home-route-warning-count',String(summary.routeWarnings));
  const total=Math.max(summary.cableReadiness.total,1);
  const schedulePct=Math.round((summary.cableReadiness.scheduleReady/total)*100);
  const routePct=Math.round((summary.cableReadiness.routingReady/total)*100);
  const deliverablePct=Math.round((summary.completeCount/PROJECT_WORKFLOW_STEPS.length)*100);
  const scheduleMeter=document.getElementById('home-schedule-ready-meter');
  const routeMeter=document.getElementById('home-routing-ready-meter');
  const deliverableMeter=document.getElementById('home-deliverable-ready-meter');
  if(scheduleMeter) scheduleMeter.style.width=`${schedulePct}%`;
  if(routeMeter) routeMeter.style.width=`${routePct}%`;
  if(deliverableMeter) deliverableMeter.style.width=`${deliverablePct}%`;

  renderHomeReadiness(summary);
}

function initHomepageCommandCenter(){
  if(typeof document==='undefined'||!document.body?.classList?.contains('home-page')) return;
  renderHomepageCommandCenter();
  onProjectChange(()=>renderHomepageCommandCenter());
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initHomepageCommandCenter,{once:true});
  }else{
    initHomepageCommandCenter();
  }
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
    await loadScript('dist/vendor/jspdf.umd.min.js');
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
    await loadScript('dist/vendor/docx.umd.js');
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
  const operationStatusHost=initOperationStatusHost(settingsMenu);
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
      if(open&&!settingsMenu.contains(e.target)&&!settingsBtn.contains(e.target)){
        close();
      }
    });

    const nameLabel=document.createElement('label');
    nameLabel.textContent='Project Name';
    const nameInput=document.createElement('input');
    nameInput.type='text';
    nameInput.id='project-name-input';
    let initialProjectName='';
    try{initialProjectName=getProjectState().name||'';}catch(e){ console.warn('Could not read initial project name:', e); }
    nameInput.value=initialProjectName;
    nameInput.dataset.originalName=(initialProjectName||'').trim();
    nameLabel.appendChild(nameInput);
    if(!document.getElementById('project-name-input')&&nameLabel.parentNode!==settingsMenu){
      const currentFirstChild=settingsMenu.firstChild;
      if(currentFirstChild&&currentFirstChild.parentNode===settingsMenu){
        settingsMenu.insertBefore(nameLabel,currentFirstChild);
      }else{
        settingsMenu.appendChild(nameLabel);
      }
    }
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
      }catch(e){ console.warn('Could not save project name during input:', e); }
    });
    nameInput.addEventListener('change',()=>{commitProjectNameChange().catch(console.error);});
    nameInput.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        nameInput.blur();
      }
    });

    const exportBtn=document.getElementById('export-project-btn');
    const helpBtn=document.getElementById('help-btn');
    if(helpBtn&&!document.getElementById('reopen-onboarding-btn')){
      const onboardingBtn=document.createElement('button');
      onboardingBtn.id='reopen-onboarding-btn';
      onboardingBtn.innerHTML='<img src="icons/oneline.svg" alt="" aria-hidden="true" class="control-icon"><span>Reopen Onboarding</span>';
      helpBtn.insertAdjacentElement('afterend',onboardingBtn);
    }
    const onboardingReopenBtn=document.getElementById('reopen-onboarding-btn');
    if(onboardingReopenBtn&&!onboardingReopenBtn.dataset.wired){
      onboardingReopenBtn.dataset.wired='1';
      onboardingReopenBtn.addEventListener('click',()=>{
        runOnboardingFlow({force:true,source:'settings'}).catch(err=>{
          console.error('Onboarding reopen failed',err);
        });
      });
    }
    const shareBtn=document.createElement('button');
    shareBtn.id='copy-share-link-btn';
    shareBtn.innerHTML='<img src="icons/toolbar/copy.svg" alt="" aria-hidden="true" class="control-icon"><span>Copy Share Link</span>';
    if(exportBtn) exportBtn.insertAdjacentElement('beforebegin',shareBtn);
    else settingsMenu.appendChild(shareBtn);
    shareBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Preparing share link…',
        successText:'Share link ready.',
        errorText:'Share link generation failed',
        operation:copyShareLink
      });
    });

    const selfCheckBtn=document.createElement('button');
    selfCheckBtn.id='run-self-check-btn';
    selfCheckBtn.innerHTML='<img src="icons/toolbar/validate.svg" alt="" aria-hidden="true" class="control-icon"><span>Run Self-Check</span>';
    settingsMenu.appendChild(selfCheckBtn);
    selfCheckBtn.addEventListener('click',()=>{ location.href='optimalRoute.html?selfcheck=1'; });

    const refreshLibBtn=document.createElement('button');
    refreshLibBtn.id='refresh-library-btn';
    refreshLibBtn.innerHTML='<img src="icons/toolbar/redo.svg" alt="" aria-hidden="true" class="control-icon"><span>Refresh Library</span>';
    settingsMenu.appendChild(refreshLibBtn);
    refreshLibBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Refreshing component and manufacturer libraries…',
        successText:'Library refresh complete.',
        errorText:'Library refresh failed',
        operation:async()=>{
          if(typeof globalThis.loadComponentLibrary==='function') await globalThis.loadComponentLibrary();
          if(typeof globalThis.loadManufacturerLibrary==='function') await globalThis.loadManufacturerLibrary();
          await showAlertModal('Library Refreshed','Component and manufacturer libraries were reloaded.');
        }
      });
    });

    const reportBtn=document.createElement('button');
    reportBtn.id='generate-report-btn';
    reportBtn.innerHTML='<img src="icons/toolbar/dimension.svg" alt="" aria-hidden="true" class="control-icon"><span>Generate Technical Report</span>';
    settingsMenu.appendChild(reportBtn);
    reportBtn.addEventListener('click',async()=>{
      const useDocx=confirm('Generate DOCX? Cancel for PDF');
      await runOperationWithStatus(operationStatusHost,{
        pendingText:`Generating technical report (${useDocx?'DOCX':'PDF'})…`,
        successText:'Technical report generated.',
        errorText:'Technical report generation failed',
        operation:()=>generateTechnicalReport(useDocx?'docx':'pdf')
      });
    });

    const exportReportsBtn=document.createElement('button');
    exportReportsBtn.id='export-reports-btn';
    exportReportsBtn.innerHTML='<img src="icons/toolbar/export.svg" alt="" aria-hidden="true" class="control-icon"><span>Export Reports</span>';
    settingsMenu.appendChild(exportReportsBtn);
    exportReportsBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Exporting report files…',
        successText:'Report export complete.',
        errorText:'Report export failed',
        operation:async()=>{
          const { downloadCSV } = await import('./reports/reporting.mjs');
          const headers=['sample'];
          const rows=[{sample:'demo'}];
          downloadCSV(headers,rows,'reports.csv');
          const oneLine=getOneLine();
          const components=(oneLine?.sheets||[]).flatMap(sheet=>Array.isArray(sheet.components)?sheet.components:[]);
          const issues=runValidation(components,getStudies());
          const vHeaders=['component','message'];
          const vRows=issues.length?issues:[{component:'-',message:'No issues'}];
          downloadCSV(vHeaders,vRows,'validation-report.csv');
        }
      });
    });

    const printLabelsBtn=document.createElement('button');
    printLabelsBtn.id='print-labels-btn';
    printLabelsBtn.innerHTML='<img src="icons/annotation.svg" alt="" aria-hidden="true" class="control-icon"><span>Print Labels</span>';
    settingsMenu.appendChild(printLabelsBtn);
    printLabelsBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Preparing printable labels…',
        successText:'Labels ready for printing.',
        errorText:'Label preparation failed',
        operation:async()=>{
          const { generateArcFlashLabel } = await import('./reports/labels.mjs');
          const svg=generateArcFlashLabel({equipment:'Demo',incidentEnergy:'--',boundary:'--'});
          const win=window.open('');
          if(win){
            win.document.write(svg);
            win.document.close();
            win.print();
          }
        }
      });
    });
    enhanceSettingsMenu(settingsMenu);
  }
  const unitSelect=document.getElementById('unit-select');
  if(unitSelect){
    try{ unitSelect.value=getProjectState().settings?.units||'imperial'; }catch(e){ console.warn('Could not read unit setting:', e); }
    unitSelect.addEventListener('change',e=>{
      try{
        const proj=getProjectState();
        proj.settings=proj.settings||{};
        proj.settings.units=e.target.value;
        setProjectState(proj);
      }catch(e){ console.warn('Could not save unit setting:', e); }
      applyUnitLabels();
    });
  }
  applyUnitLabels();
  save(null,{flush:true,reason:'settings-init'});
}

function initDarkMode(){
  const elementCache=createElementCache(document);
  const settingsMenu=elementCache.getById('settings-menu');
  const darkToggle=elementCache.getById('dark-toggle');
  const domBatcher=createDomWriteBatcher();
  const prefersDarkQuery=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
  const prefersContrastQuery=window.matchMedia?window.matchMedia('(prefers-contrast: more)'):null;
  const profileHandler=createHandlerProfiler('initDarkMode');

  let themeSelect=elementCache.getById('theme-select');
  if(!themeSelect&&settingsMenu){
    const wrapper=document.createElement('label');
    wrapper.setAttribute('for','theme-select');
    wrapper.textContent='Theme';
    themeSelect=document.createElement('select');
    themeSelect.id='theme-select';
    themeSelect.innerHTML=`
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="high-contrast">High Contrast</option>
    `;
    wrapper.appendChild(themeSelect);
    const currentThemeSelect=document.getElementById('theme-select');
    if(!currentThemeSelect&&wrapper.parentNode!==settingsMenu){
      const currentFirstChild=settingsMenu.firstChild;
      if(currentFirstChild&&currentFirstChild.parentNode===settingsMenu){
        settingsMenu.insertBefore(wrapper,currentFirstChild);
      }else{
        settingsMenu.appendChild(wrapper);
      }
    }
  }

  const resolveTheme=theme=>{
    if(theme==='dark'||theme==='light'||theme==='high-contrast') return theme;
    if(prefersContrastQuery&&prefersContrastQuery.matches) return 'high-contrast';
    return prefersDarkQuery&&prefersDarkQuery.matches?'dark':'light';
  };

  const applyTheme=(themePreference,{syncControls=true}={})=>{
    const theme=resolveTheme(themePreference);
    domBatcher.write(()=>{
      document.body.classList.toggle('dark-mode',theme==='dark');
      document.body.classList.toggle('theme-light',theme==='light');
      document.body.classList.toggle('theme-high-contrast',theme==='high-contrast');
      document.body.dataset.theme=theme;
      document.documentElement.style.colorScheme=theme==='dark'?'dark':(theme==='high-contrast'?'only light':'light');
      if(syncControls){
        if(themeSelect) themeSelect.value=themePreference;
        if(darkToggle) darkToggle.checked=theme==='dark';
      }
    });
  };

  const syncFromStorage=()=>{
    const storedTheme=getThemePreference();
    applyTheme(storedTheme);
  };

  syncFromStorage();

  if(themeSelect){
    themeSelect.addEventListener('change',profileHandler('themeSelect.change',()=>{
      const nextTheme=themeSelect.value||'system';
      setThemePreference(nextTheme);
      applyTheme(nextTheme,{syncControls:false});
      if(typeof window.saveSession==='function') window.saveSession();
      if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
    }));
  }

  if(darkToggle){
    darkToggle.closest('label')?.classList.add('legacy-dark-toggle');
    darkToggle.addEventListener('change',profileHandler('darkToggle.change',()=>{
      const nextTheme=darkToggle.checked?'dark':'light';
      setThemePreference(nextTheme);
      applyTheme(nextTheme,{syncControls:false});
      if(themeSelect) themeSelect.value=nextTheme;
    }));
  }

  if(prefersDarkQuery){
    prefersDarkQuery.addEventListener('change',profileHandler('prefersDark.change',()=>{
      if(getThemePreference()==='system') applyTheme('system');
    }));
  }
  if(prefersContrastQuery){
    prefersContrastQuery.addEventListener('change',profileHandler('prefersContrast.change',()=>{
      if(getThemePreference()==='system') applyTheme('system');
    }));
  }
  onProjectChange(()=>syncFromStorage());
}

function initCompactMode(){
  const elementCache=createElementCache(document);
  const compactToggle=elementCache.getById('compact-toggle');
  const domBatcher=createDomWriteBatcher();
  const profileHandler=createHandlerProfiler('initCompactMode');
  let session=getSessionPreferences();
  if(session.compactMode===undefined){
    session=updateSessionPreferences(prev=>({...(prev&&typeof prev==='object'?prev:{}),compactMode:false}));
  }
  const applyState=value=>{
    domBatcher.write(()=>{
      document.body.classList.toggle('compact-mode',!!value);
      if(compactToggle) compactToggle.checked=!!value;
    });
  };
  applyState(session.compactMode);
  if(compactToggle){
    compactToggle.addEventListener('change',profileHandler('compactToggle.change',()=>{
      const value=!!compactToggle.checked;
      applyState(value);
      session=updateSessionPreferences(prev=>({...(prev&&typeof prev==='object'?prev:{}),compactMode:value}));
      if(typeof window.saveSession==='function') window.saveSession();
      if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
    }));
  }
  window.addEventListener('storage',profileHandler('window.storage',e=>{
    if(e.key==='ctrSession'){
      try{
        const data=e.newValue?JSON.parse(e.newValue):{};
        applyState(data&&data.compactMode);
        session=data||{};
      }catch(e){ console.warn('Could not parse ctrSession storage event:', e); }
    }
  }));
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
    if(btnId==='help-btn'&&!content.querySelector('#help-reopen-onboarding-btn')){
      const onboardingBtn=document.createElement('button');
      onboardingBtn.type='button';
      onboardingBtn.id='help-reopen-onboarding-btn';
      onboardingBtn.innerHTML='<img src="icons/oneline.svg" alt="" aria-hidden="true" class="control-icon"><span>Reopen Onboarding</span>';
      content.appendChild(onboardingBtn);
      onboardingBtn.addEventListener('click',()=>{
        close();
        runOnboardingFlow({force:true,source:'help'}).catch(err=>console.error('Help onboarding reopen failed',err));
      });
    }
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
        iframe.style.width='var(--size-full)';
        iframe.style.height='var(--size-help-modal-height)';
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
  const elementCache=createElementCache(document);
  const toggle=elementCache.query('.nav-toggle');
  if(!toggle) return;
  const target=elementCache.getById(toggle.getAttribute('aria-controls'));
  if(!target) return;
  const profileHandler=createHandlerProfiler('initNavToggle');

  function closeMenu(){
    toggle.setAttribute('aria-expanded','false');
    target.classList.remove('open');
  }

  toggle.addEventListener('click',profileHandler('toggle.click',()=>{
    const expanded=toggle.getAttribute('aria-expanded')==='true';
    toggle.setAttribute('aria-expanded',String(!expanded));
    target.classList.toggle('open',!expanded);
  }));

  document.addEventListener('keydown',profileHandler('document.keydown',e=>{
    if(e.key==='Escape') closeMenu();
  }));
}

  function checkPrereqs(prereqs=[]){
    // Previously this function displayed a banner when required data was missing.
    // The banner has been removed to declutter the interface, so this function now
    // intentionally performs no UI actions even if data is absent.
  }

function initTableNav(){
  const profileHandler=createHandlerProfiler('initTableNav',{logEvery:250});
  document.addEventListener('keydown',profileHandler('document.keydown',e=>{
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
  }));
}

// ─── Keyboard Shortcuts Overlay (? key) ────────────────────────────────────
const SHORTCUT_GROUPS=[
  {
    heading:'Navigation',
    rows:[
      {keys:['Ctrl','K'],desc:'Open command palette'},
      {keys:['?'],desc:'Show this keyboard shortcuts overlay'},
      {keys:['Escape'],desc:'Close modal / cancel action'},
    ]
  },
  {
    heading:'Project',
    rows:[
      {keys:['Ctrl','S'],desc:'Save project to server'},
      {keys:['Ctrl','Z'],desc:'Undo last action (where supported)'},
      {keys:['Ctrl','Shift','Z'],desc:'Redo (where supported)'},
    ]
  },
  {
    heading:'Tables',
    rows:[
      {keys:['↑'],desc:'Move focus up one row in the same column'},
      {keys:['↓'],desc:'Move focus down one row in the same column'},
      {keys:['Tab'],desc:'Move to next cell / field'},
    ]
  },
  {
    heading:'Tour',
    rows:[
      {keys:['→',' '],desc:'Next tour step'},
      {keys:['←'],desc:'Previous tour step'},
    ]
  },
];

function initShortcutsOverlay(){
  if(typeof document==='undefined') return;
  // Build overlay DOM
  const overlay=document.createElement('div');
  overlay.className='shortcuts-overlay';
  overlay.id='shortcuts-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-labelledby','shortcuts-overlay-title');
  overlay.setAttribute('aria-hidden','true');
  overlay.inert = true;
  overlay.hidden = true;

  const panel=document.createElement('div');
  panel.className='shortcuts-overlay-panel';

  const closeBtn=document.createElement('button');
  closeBtn.className='close-btn';
  closeBtn.setAttribute('aria-label','Close keyboard shortcuts');
  closeBtn.tabIndex = -1;
  closeBtn.textContent='\u00D7';

  const title=document.createElement('h2');
  title.id='shortcuts-overlay-title';
  title.className='shortcuts-overlay-title';
  title.textContent='Keyboard Shortcuts';

  const table=document.createElement('table');
  table.className='shortcuts-table';
  const thead=document.createElement('thead');
  const headRow=document.createElement('tr');
  ['Key','Action'].forEach(h=>{const th=document.createElement('th');th.textContent=h;headRow.appendChild(th);});
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody=document.createElement('tbody');

  SHORTCUT_GROUPS.forEach(group=>{
    const groupRow=document.createElement('tr');
    const groupCell=document.createElement('td');
    groupCell.setAttribute('colspan','2');
    groupCell.style.cssText='font-weight:600;padding-top:0.75rem;color:var(--color-primary)';
    groupCell.textContent=group.heading;
    groupRow.appendChild(groupCell);
    tbody.appendChild(groupRow);

    group.rows.forEach(({keys,desc})=>{
      const tr=document.createElement('tr');
      const keyTd=document.createElement('td');
      keyTd.style.whiteSpace='nowrap';
      keys.forEach((k,i)=>{
        if(i>0){const plus=document.createElement('span');plus.textContent=' + ';keyTd.appendChild(plus);}
        const kbd=document.createElement('kbd');kbd.textContent=k;keyTd.appendChild(kbd);
      });
      const descTd=document.createElement('td');
      descTd.textContent=desc;
      tr.appendChild(keyTd);
      tr.appendChild(descTd);
      tbody.appendChild(tr);
    });
  });

  table.appendChild(tbody);

  const hint=document.createElement('p');
  hint.className='shortcuts-overlay-hint';
  hint.textContent='Press ? or Escape to dismiss';

  panel.appendChild(closeBtn);
  panel.appendChild(title);
  panel.appendChild(table);
  panel.appendChild(hint);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function open(){
    overlay.inert = false;
    overlay.hidden = false;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden','false');
    closeBtn.tabIndex = 0;
    closeBtn.focus();
  }
  function close(){
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden','true');
    overlay.inert = true;
    closeBtn.tabIndex = -1;
    overlay.hidden = true;
  }

  closeBtn.addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  document.addEventListener('keydown',e=>{
    const active=document.activeElement;
    const inInput=['INPUT','SELECT','TEXTAREA'].includes(active?.tagName);
    if(e.key==='?' && !inInput && !e.ctrlKey && !e.metaKey){
      e.preventDefault();
      overlay.classList.contains('is-open')?close():open();
    }
    if(e.key==='Escape'&&overlay.classList.contains('is-open')) close();
  });
}

globalThis.document?.addEventListener('DOMContentLoaded',initShortcutsOverlay);

// ─── Rich Empty States for Data Tables ─────────────────────────────────────
const TABLE_EMPTY_CONFIGS={
  'equipment-table':{icon:'🗂️',title:'No equipment yet',body:'Add a row to start building your equipment list, or import from XLSX or CSV.',actionId:'add-row-btn',actionLabel:'Add Row'},
  'cable-table':{icon:'🔌',title:'No cables yet',body:'Add your first cable entry, load sample data, or import from Excel to begin.',actionId:'load-sample-cables-btn',actionLabel:'Load Sample Data'},
  'load-table':{icon:'⚡',title:'No load items yet',body:'Add a row to define load items for this project.',actionId:'add-load-btn',actionLabel:'Add Row'},
  'raceway-table':{icon:'🛤️',title:'No raceways yet',body:'Add trays, conduits, or ductbanks to build the raceway schedule.',actionId:'add-tray-btn',actionLabel:'Add Tray'},
  'panel-table':{icon:'🔲',title:'No panels yet',body:'Add a panel to begin building the panel schedule.',actionId:'add-panel-btn',actionLabel:'Add Panel'},
};

function initTableEmptyStates(){
  if(typeof document==='undefined') return;

  function makeEmptyState(config,addRowBtn){
    const div=document.createElement('div');
    div.className='table-empty-state';
    div.setAttribute('aria-live','polite');

    const icon=document.createElement('span');
    icon.className='table-empty-state-icon';
    icon.setAttribute('aria-hidden','true');
    icon.textContent=config.icon||'📋';

    const ttl=document.createElement('p');
    ttl.className='table-empty-state-title';
    ttl.textContent=config.title||'No data yet';

    const body=document.createElement('p');
    body.className='table-empty-state-body';
    body.textContent=config.body||'Add a row to get started.';

    div.appendChild(icon);
    div.appendChild(ttl);
    div.appendChild(body);

    // Mirror the existing add-row button as a CTA if found
    if(addRowBtn){
      const cta=document.createElement('button');
      cta.className='btn primary-btn table-empty-state-action';
      cta.textContent=config.actionLabel||'Add Row';
      cta.addEventListener('click',()=>addRowBtn.click());
      div.appendChild(cta);
    }
    return div;
  }

  Object.entries(TABLE_EMPTY_CONFIGS).forEach(([tableId,config])=>{
    const table=document.getElementById(tableId);
    if(!table) return;
    const tbody=table.querySelector('tbody');
    if(!tbody) return;

    const actionBtn=config.actionId?document.getElementById(config.actionId):null;
    const emptyState=makeEmptyState(config,actionBtn);

    // Insert after the table's closest scrollable wrapper or the table itself
    const wrapper=table.closest('.overflow-x-auto')||table.closest('.table-scroll-x')||table;
    wrapper.insertAdjacentElement('afterend',emptyState);

    function syncVisibility(){
      const hasRows=tbody.rows.length>0;
      emptyState.classList.toggle('is-visible',!hasRows);
      table.style.display=hasRows?'':'none';
    }

    syncVisibility();
    const mo=new MutationObserver(syncVisibility);
    mo.observe(tbody,{childList:true});
  });
}

globalThis.document?.addEventListener('DOMContentLoaded',initTableEmptyStates);

// ─── Workflow Step Navigator ────────────────────────────────────────────────
const WORKFLOW_STEPS=PROJECT_WORKFLOW_STEPS;

function initWorkflowStepNav(){
  if(typeof document==='undefined') return;
  const page=window.location.pathname.split('/').pop()||'index.html';
  const currentStep=getWorkflowStepForPage(page);
  const idx=currentStep?WORKFLOW_STEPS.findIndex(s=>s.key===currentStep.key):-1;
  if(idx<0) return; // Not a workflow page

  const step=WORKFLOW_STEPS[idx];
  const prev=WORKFLOW_STEPS[idx-1]||null;
  const next=WORKFLOW_STEPS[idx+1]||null;

  const nav=document.createElement('nav');
  nav.className='workflow-step-nav';
  nav.setAttribute('aria-label','Workflow step navigation');

  const label=document.createElement('span');
  label.className='workflow-step-nav-label';
  label.textContent=`Step ${idx+1} of ${WORKFLOW_STEPS.length}: ${step.label}`;

  const links=document.createElement('div');
  links.className='workflow-step-nav-links';

  function makeLink(target,text){
    const a=document.createElement('a');
    a.href=target.href;
    a.className='workflow-step-nav-link';
    a.textContent=text;
    return a;
  }

  if(prev) links.appendChild(makeLink(prev,`\u2190 ${prev.short}`));

  const home=document.createElement('a');
  home.href='index.html';
  home.className='workflow-step-nav-link';
  home.textContent='Home';
  links.appendChild(home);

  if(next) links.appendChild(makeLink(next,`${next.short} \u2192`));

  nav.appendChild(label);
  nav.appendChild(links);

  // Insert before the first <section> inside main, or at the top of main
  const main=document.getElementById('main-content');
  if(!main) return;
  const firstSection=main.querySelector(':scope > section, :scope > header');
  if(firstSection){
    main.insertBefore(nav,firstSection);
  }else{
    main.prepend(nav);
  }
}

globalThis.document?.addEventListener('DOMContentLoaded',initWorkflowStepNav);

function makeWorkflowModeTag(text, tone = 'neutral') {
  const tag = document.createElement('span');
  tag.className = `workflow-mode-tag workflow-mode-tag--${tone}`;
  tag.textContent = text;
  return tag;
}

function makeWorkflowModeCard(modeName, mode, options = {}) {
  const card = document.createElement('article');
  card.className = `workflow-mode-card workflow-mode-card--${options.tone || 'neutral'}`;
  card.dataset.workflowMode = modeName;

  const header = document.createElement('div');
  header.className = 'workflow-mode-card__header';
  const label = document.createElement('span');
  label.className = 'workflow-mode-card__label';
  label.textContent = mode.label;
  const status = makeWorkflowModeTag(mode.status, options.tone || 'neutral');
  header.append(label, status);

  const detail = document.createElement('p');
  detail.className = 'workflow-mode-card__detail';
  detail.textContent = mode.detail;

  card.append(header, detail);

  if (mode.readiness) {
    const readiness = document.createElement('dl');
    readiness.className = 'workflow-mode-card__readiness';

    const addItem = (labelText, valueText) => {
      const term = document.createElement('dt');
      term.textContent = labelText;
      const value = document.createElement('dd');
      value.textContent = valueText;
      readiness.append(term, value);
    };

    addItem(mode.readiness.terms.ready, mode.readiness.readyWhen);
    addItem(mode.readiness.terms.missingInputs, mode.readiness.blockers.join('; '));
    addItem(mode.readiness.terms.downstreamHandoff, mode.readiness.downstreamText);
    card.appendChild(readiness);
  }

  if (Array.isArray(options.actions) && options.actions.length) {
    const actions = document.createElement('div');
    actions.className = 'workflow-mode-card__actions';
    options.actions.forEach(action => {
      const link = document.createElement('a');
      link.className = action.primary ? 'btn btn-sm primary-btn' : 'btn btn-sm';
      link.href = action.href;
      link.textContent = action.label;
      actions.appendChild(link);
    });
    card.appendChild(actions);
  }

  return card;
}

function renderWorkflowModePanel(panel, page) {
  const context = getWorkflowPageModeContext(page);
  if (!context) {
    panel.remove();
    return;
  }

  panel.replaceChildren();
  panel.dataset.workflowPage = context.pageName;
  panel.dataset.workflowStep = context.project.step?.key || (context.isDashboard ? 'dashboard' : '');
  panel.classList.toggle('workflow-mode-panel--ready', context.project.tone === 'ready');

  const title = document.createElement('div');
  title.className = 'workflow-mode-panel__title';

  const heading = document.createElement('strong');
  heading.textContent = context.isDashboard
    ? 'Workflow modes'
    : `${context.project.step.label.replace(/^\d+\.\s*/, '')} modes`;

  const progress = document.createElement('span');
  progress.textContent = `${context.completeCount}/${context.totalSteps} workflow steps ready`;

  title.append(heading, progress);

  const grid = document.createElement('div');
  grid.className = 'workflow-mode-panel__grid';
  grid.appendChild(makeWorkflowModeCard('standalone', context.standalone, {
    tone: 'ready'
  }));
  grid.appendChild(makeWorkflowModeCard('project', context.project, {
    tone: context.project.tone,
    actions: [
      { href: context.project.dashboardHref, label: 'Dashboard' },
      { href: context.project.primaryHref, label: context.project.primaryLabel, primary: true }
    ]
  }));

  panel.append(title, grid);
}

function initWorkflowModePanel() {
  if (typeof document === 'undefined') return;
  const main = document.getElementById('main-content');
  if (!main || main.querySelector('[data-workflow-mode-panel]')) return;

  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (!getWorkflowPageModeContext(page)) return;

  const panel = document.createElement('section');
  panel.className = 'workflow-mode-panel';
  panel.dataset.workflowModePanel = 'true';
  panel.setAttribute('aria-label', 'Workflow mode status');
  panel.setAttribute('data-no-print', '');

  const stepNav = main.querySelector(':scope > .workflow-step-nav');
  if (stepNav) {
    stepNav.insertAdjacentElement('afterend', panel);
  } else {
    const firstSection = main.querySelector(':scope > section, :scope > header');
    if (firstSection) main.insertBefore(panel, firstSection);
    else main.prepend(panel);
  }

  renderWorkflowModePanel(panel, page);
  onProjectChange(() => renderWorkflowModePanel(panel, page));
}

globalThis.document?.addEventListener('DOMContentLoaded', initWorkflowModePanel);

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
  }catch(e){ console.warn('loadConduits: cache read failed', e); }
  let ductbanks=[];let conduits=[];
  try{
    const raw=localStorage?.getItem('ductbankSchedule');
    if(raw!=null){
      const parsed=JSON.parse(raw);
      ductbanks=Array.isArray(parsed)?parsed:[];
    }else{
      ductbanks=getDuctbanks();
    }
  }catch(e){ console.warn('loadConduits: ductbankSchedule read failed', e); }
  try{
    const raw=localStorage?.getItem('conduitSchedule');
    if(raw!=null){
      const parsed=JSON.parse(raw);
      conduits=Array.isArray(parsed)?parsed:[];
    }else{
      conduits=getConduits();
    }
  }catch(e){ console.warn('loadConduits: conduitSchedule read failed', e); }
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

function initTableScrollIndicators(){
  if(typeof document==='undefined') return;
  const update=(el)=>{
    el.classList.toggle('has-overflow', el.scrollWidth > el.clientWidth + 4);
  };
  const els=document.querySelectorAll('.table-scroll-x');
  if(!els.length) return;
  const ro=typeof ResizeObserver!=='undefined'
    ? new ResizeObserver(entries=>entries.forEach(e=>update(e.target)))
    : null;
  els.forEach(el=>{
    update(el);
    el.addEventListener('scroll',()=>update(el),{passive:true});
    ro?.observe(el);
  });
}
globalThis.document?.addEventListener('DOMContentLoaded',initTableScrollIndicators);
globalThis.document?.addEventListener('DOMContentLoaded',applyPageVisualIdentity);

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
    markClean:()=>{getDirtyTracker()?.markClean?.(); recordSave();},
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
    recordSave();
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
  const operationStatusHost=initOperationStatusHost(document.getElementById('settings-menu'));
  runOperationWithStatus(operationStatusHost,{
    pendingText:'Loading project from URL…',
    successText:'Project URL sync complete.',
    errorText:'Project URL sync failed',
    toastSuccess:false,
    operation:async()=>{
      await loadProjectFromHash();
      applyProjectHash();
    }
  }).catch(()=>{});
  updateSaveButtonState();
  const exportBtn=document.getElementById('export-project-btn');
  const importBtn=document.getElementById('import-project-btn');
  const fileInput=document.getElementById('import-project-input');
  console.assert(importBtn&&fileInput,'Project import controls missing');
  if(exportBtn){
    exportBtn.addEventListener('click',async()=>{
      await runOperationWithStatus(operationStatusHost,{
        pendingText:'Exporting project file…',
        successText:'Project export complete.',
        errorText:'Project export failed',
        operation:async()=>{
          if(typeof globalThis.showSaveFilePicker==='function'){
            try{
              const handle=await globalThis.showSaveFilePicker({
                suggestedName:'project.ctr.json',
                types:[{
                  description:'CableTrayRoute Project',
                  accept:{'application/json':['.ctr.json','.json']}
                }]
              });
              if(!handle) return;
              cachedProjectFileHandle=handle;
              updateSaveButtonState();
              await writeProjectToHandle(handle);
            }catch(err){
              if(err?.name==='AbortError') return;
              console.error('showSaveFilePicker failed',err);
              downloadProjectAsBlob();
            }
          }else{
            downloadProjectAsBlob();
          }
        }
      }).catch(()=>{});
    });
  }
  if(importBtn&&fileInput){
    importBtn.addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',e=>{
      const file=e.target.files[0];
      if(!file) return;
      runOperationWithStatus(operationStatusHost,{
        pendingText:'Importing project file…',
        successText:'Project import complete. Reloading…',
        errorText:'Project import failed',
        operation:()=>new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=ev=>{
            try{
              const obj=JSON.parse(ev.target.result);
              if(importProject(obj)){
                resolve(true);
                location.reload();
                return;
              }
              reject(new Error('Import canceled or invalid project data.'));
            }catch(err){
              reject(err);
            }
          };
          reader.onerror=()=>reject(reader.error||new Error('Unable to read import file.'));
          reader.readAsText(file);
        })
      }).catch(err=>{
        if(err?.message==='Import canceled or invalid project data.') return;
        console.error('Import failed',err);
      }).finally(()=>{
        fileInput.value='';
      });
    });
  }
  ensureAutoSaveScheduler().start();
}

globalThis.addEventListener?.('DOMContentLoaded',initProjectIO);
globalThis.addEventListener?.('DOMContentLoaded',()=>{
  const params = new URLSearchParams(window.location.search);
  if (params.has('e2e')) return;
  if (document.body?.dataset.onboarding === 'manual') return;
  runOnboardingFlow({source:'auto'}).catch(err=>console.error('Onboarding startup failed',err));
});

function applyUnitLabels(){
  const sys=globalThis.units?.getUnitSystem()?globalThis.units.getUnitSystem():'imperial';
  const d=sys==='imperial'?'ft':'m';
  const c=sys==='imperial'?'in':'mm';
  const domBatcher=createDomWriteBatcher();
  const distanceNodes=document.querySelectorAll('[data-unit="distance"]');
  const conduitNodes=document.querySelectorAll('[data-unit="conduit"]');
  domBatcher.write(()=>{
    distanceNodes.forEach(el=>el.textContent=d);
    conduitNodes.forEach(el=>el.textContent=c);
  });
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

// ─── Global Undo/Redo ───────────────────────────────────────────────────────
const _undoManager = new UndoRedoManager({
  maxSize: 50,
  onUndo: (label) => {
    if (typeof showOperationToast === 'function') {
      showOperationToast(label ? `Undone: ${label}` : 'Undone', 'success');
    }
  },
  onRedo: (label) => {
    if (typeof showOperationToast === 'function') {
      showOperationToast(label ? `Redone: ${label}` : 'Redone', 'success');
    }
  }
});

globalThis.__undoManager = _undoManager;

globalThis.document?.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  const active = document.activeElement;
  // Don't intercept inside contenteditable or text inputs where browser undo should apply
  if (active && (active.isContentEditable || active.tagName === 'TEXTAREA')) return;
  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    _undoManager.undo();
  } else if (e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    _undoManager.redo();
  } else if (e.key === 'y') {
    e.preventDefault();
    _undoManager.redo();
  }
});

globalThis.initSettings=initSettings;
globalThis.initDarkMode=initDarkMode;
globalThis.initCompactMode=initCompactMode;
globalThis.initHelpModal=initHelpModal;
globalThis.initNavToggle=initNavToggle;

export { initSettings, initDarkMode, initCompactMode, initHelpModal, initNavToggle };
globalThis.checkPrereqs=checkPrereqs;
globalThis.persistConduits=persistConduits;
globalThis.loadConduits=loadConduits;
globalThis.applyUnitLabels=applyUnitLabels;
globalThis.applyProjectHash=applyProjectHash;
globalThis.showSelfCheckModal=showSelfCheckModal;

// ----- Real-time collaboration -----
(function initCollabOnLoad() {
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    function startCollab() {
      const auth = getAuthContextState ? getAuthContextState() : null;
      if (!auth) return; // only start when logged in
      if (window.localStorage?.getItem('ctrEnableCollaboration') !== 'true') return;
      const projectId = (window.currentProjectId || '').trim();
      initCollaboration({
        projectId,
        username: auth.user,
        authToken: auth.token,
        csrfToken: auth.csrfToken,
      });
    }
    startCollab();
    // Re-init when project changes (project manager fires storage events)
    window.addEventListener('storage', (e) => {
      if (e.key === 'currentProjectId' || e.key === 'authToken') {
        stopCollaboration();
        startCollab();
      }
    });
    // Apply incoming remote patches to local state
    document.addEventListener('ctr:remote-patch', (ev) => {
      const patch = ev.detail && ev.detail.patch;
      if (!patch || typeof patch !== 'object') return;
      const projectId = (window.currentProjectId || '').trim();
      applyRemoteSnapshot(patch, projectId);
    });
    // Clean up on page unload
    window.addEventListener('beforeunload', () => stopCollaboration());
  });
}());

// ----- Scroll-to-top button -----
(function initScrollTopBtn() {
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.createElement('button');
    btn.className = 'scroll-top-btn';
    btn.setAttribute('aria-label', 'Scroll to top');
    btn.setAttribute('title', 'Scroll to top');
    btn.innerHTML = '&#8679;'; // ↑ upward arrow
    document.body.appendChild(btn);

    const SHOW_AFTER_PX = 300;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        btn.classList.toggle('visible', window.scrollY > SHOW_AFTER_PX);
        ticking = false;
      });
    }, { passive: true });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}());

// ----- AI Copilot -----
(function initCopilot() {
  if (typeof document === 'undefined') return;
  // Inject copilot stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'src/styles/copilot.css';
  document.head.appendChild(link);
  document.addEventListener('DOMContentLoaded', () => {
    mountCopilot();
  });
}());
