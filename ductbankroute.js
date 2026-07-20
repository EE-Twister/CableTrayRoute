// ---- Inline E2E helpers (no external import) ----
const E2E = new URLSearchParams(location.search).has('e2e');

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markReady(flagName) {
  try {
    document.documentElement.setAttribute(flagName, '1');
    // also expose to window for debugging
    window[flagName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
  } catch { /* DOM/window unavailable in test sandboxes; readiness flag is best-effort */ }
}

function suppressResumeIfE2E() {
  if (!E2E) return;
  // Never clear browser storage from URL-controlled E2E flags.
  // Tests should seed/clear state explicitly in their own setup steps.
}

// Show resume modal in E2E so tests can click the No button
function forceShowResumeIfE2E() {
  const E2E = new URLSearchParams(location.search).has('e2e');
  if (!E2E) return;
  const modal = document.getElementById('resume-modal');
  const noBtn = document.getElementById('resume-no-btn');
  if (modal) {
    modal.removeAttribute('hidden');
    modal.classList.remove('hidden', 'is-hidden', 'invisible');
    modal.style.display = 'block';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
  }
  if (noBtn) {
    noBtn.style.display = 'inline-block';
    noBtn.disabled = false;
  }
}

window.E2E = E2E;

import { getItem, setItem, removeItem, getCables, getConduits, getDuctbanks } from './dataStore.mjs';
import { openModal, showAlertModal } from './src/components/modal.js';
import { buildProjectDuctbankRoute, parseDuctbankRouteData } from './src/ductbankProjectAdapter.mjs';

function projectDuctbankId(ductbank={}){
 return String(ductbank.ductbank_id||ductbank.id||ductbank.tag||'').trim();
}

function initProjectDuctbankSelector({ductbanks=[],conduits=[],cables=[],selectedId=''}){
 const select=document.getElementById('projectDuctbankSelect');
 if(!select) return;
 select.innerHTML='';
 ductbanks.forEach(ductbank=>{
  const id=projectDuctbankId(ductbank);
  if(!id) return;
  const option=document.createElement('option');
  option.value=id;
  const from=ductbank.from||ductbank.from_tag||'';
  const to=ductbank.to||ductbank.to_tag||'';
  option.textContent=[id,[from,to].filter(Boolean).join(' → ')].filter(Boolean).join(' · ');
  select.appendChild(option);
 });
 if(selectedId&&Array.from(select.options).some(option=>option.value===selectedId)) select.value=selectedId;
 select.disabled=select.options.length<2;
 select.addEventListener('change',()=>{
  const route=buildProjectDuctbankRoute({ductbanks,conduits,cables,selectedDuctbankId:select.value});
  if(!applyDuctbankRouteData(route)) return;
  const url=new URL(location.href);
  url.searchParams.set('ductbank',select.value);
  history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);
  showToast(`Loaded ${select.value}`);
 });
}

checkPrereqs([{key:'ductbankSchedule',page:'racewayschedule.html',label:'Raceway Schedule'}]);

suppressResumeIfE2E();
document.addEventListener('DOMContentLoaded', forceShowResumeIfE2E);

document.addEventListener('DOMContentLoaded',()=>{
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('helpBtn','helpOverlay','helpClose');
  initNavToggle();
  initPanZoom();
});
let heatVisible=false;
let utilHeatmap=false;
window.lastHeatGrid=null;
window.lastHeatGridMeta=null;
window.lastConduitTemps=null;
window.lastAmbient=0;
window.lastHeatImgData=null;
window.thermalLogs=[];
(function(){
 const warn=console.warn;
 const error=console.error;
 console.warn=function(...args){window.thermalLogs.push('WARN: '+args.join(' '));warn.apply(console,args);};
 console.error=function(...args){window.thermalLogs.push('ERROR: '+args.join(' '));error.apply(console,args);};
})();

function initPanZoom(){
  const wrapper=document.getElementById('gridWrapper');
  const container=document.getElementById('gridContainer');
  if(!wrapper||!container)return;
  let panX=0,panY=0,scale=1;
  try{
    const stored=getItem('ductbankPanZoom');
    if(stored){
      const s=JSON.parse(stored);
      panX=s.x||0;
      panY=s.y||0;
      scale=s.scale||1;
    }
  }catch(e){ console.warn('Failed to restore ductbank pan/zoom state', e); }
  apply();
  function apply(){
    container.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;
    try{setItem('ductbankPanZoom',JSON.stringify({x:panX,y:panY,scale}));}catch(e){ console.warn('Failed to save ductbank pan/zoom state', e); }
  }
  function zoomAt(cx,cy,f){
    const ns=Math.min(Math.max(scale*f,0.5),5);
    panX-=(cx-panX)*(ns/scale-1);
    panY-=(cy-panY)*(ns/scale-1);
    scale=ns;
    apply();
  }
  wrapper.addEventListener('wheel',e=>{
    e.preventDefault();
    const r=wrapper.getBoundingClientRect();
    zoomAt(e.clientX-r.left,e.clientY-r.top,e.deltaY<0?1.1:0.9);
  },{passive:false});
  let panning=false,startX=0,startY=0;
  wrapper.addEventListener('mousedown',e=>{
    if(e.button!==0)return;
    panning=true;
    startX=e.clientX-panX;
    startY=e.clientY-panY;
  });
  wrapper.addEventListener('mousemove',e=>{
    if(!panning)return;
    panX=e.clientX-startX;
    panY=e.clientY-startY;
    apply();
  });
  wrapper.addEventListener('mouseup',()=>{panning=false;});
  wrapper.addEventListener('mouseleave',()=>{panning=false;});
  const fitBtn=document.getElementById('fitViewBtn');
  const inBtn=document.getElementById('zoomInBtn');
  const outBtn=document.getElementById('zoomOutBtn');
  const centerZoom=f=>{
    const r=wrapper.getBoundingClientRect();
    zoomAt(r.width/2,r.height/2,f);
  };
  if(inBtn)inBtn.addEventListener('click',()=>centerZoom(1.2));
  if(outBtn)outBtn.addEventListener('click',()=>centerZoom(0.8));
  if(fitBtn)fitBtn.addEventListener('click',()=>{panX=0;panY=0;scale=1;apply();});
}
let GRID_SIZE = 20; // number of grid nodes across the ductbank for thermal solver
const SAMPLE_CONDUITS=[
 {conduit_id:"C1",conduit_type:"PVC Sch 40",trade_size:"4",x:0,y:0},
 {conduit_id:"C2",conduit_type:"PVC Sch 40",trade_size:"4",x:2,y:0},
 {conduit_id:"C3",conduit_type:"PVC Sch 40",trade_size:"4",x:4,y:0},
 {conduit_id:"C4",conduit_type:"PVC Sch 40",trade_size:"4",x:6,y:0},
 {conduit_id:"C5",conduit_type:"PVC Sch 40",trade_size:"4",x:0,y:2},
 {conduit_id:"C6",conduit_type:"PVC Sch 40",trade_size:"4",x:2,y:2},
 {conduit_id:"C7",conduit_type:"PVC Sch 40",trade_size:"4",x:4,y:2},
 {conduit_id:"C8",conduit_type:"PVC Sch 40",trade_size:"4",x:6,y:2},
 {conduit_id:"C9",conduit_type:"PVC Sch 40",trade_size:"4",x:0,y:4},
 {conduit_id:"C10",conduit_type:"PVC Sch 40",trade_size:"4",x:2,y:4},
 {conduit_id:"C11",conduit_type:"PVC Sch 40",trade_size:"4",x:4,y:4},
 {conduit_id:"C12",conduit_type:"PVC Sch 40",trade_size:"4",x:6,y:4},
 {conduit_id:"C13",conduit_type:"PVC Sch 40",trade_size:"4",x:0,y:6},
 {conduit_id:"C14",conduit_type:"PVC Sch 40",trade_size:"4",x:2,y:6},
 {conduit_id:"C15",conduit_type:"PVC Sch 40",trade_size:"4",x:4,y:6},
 {conduit_id:"C16",conduit_type:"PVC Sch 40",trade_size:"4",x:6,y:6},
];


const SAMPLE_CABLES=[
 {tag:'CBL01',cable_type:'Power',diameter:2.6,conductors:3,conductor_size:'500 kcmil',weight:6.0,conduit_id:'C1',est_load:400},
 {tag:'CBL02',cable_type:'Control',diameter:0.6,conductors:4,conductor_size:'#14 AWG',weight:0.8,conduit_id:'C1',est_load:15},
 {tag:'CBL03',cable_type:'Signal',diameter:0.16,conductors:1,conductor_size:'#18 AWG',weight:0.5,conduit_id:'C2',est_load:5},
 {tag:'CBL04',cable_type:'Power',diameter:1.3,conductors:3,conductor_size:'#2 AWG',weight:3.0,conduit_id:'C2',est_load:115},
 {tag:'CBL05',cable_type:'Power',diameter:2.1,conductors:3,conductor_size:'4/0 AWG',weight:5.0,conduit_id:'C3',est_load:260},
 {tag:'CBL06',cable_type:'Control',diameter:0.9,conductors:8,conductor_size:'#12 AWG',weight:1.2,conduit_id:'C3',est_load:20},
 {tag:'CBL07',cable_type:'Signal',diameter:0.35,conductors:2,conductor_size:'#16 AWG',weight:0.6,conduit_id:'C4',est_load:5},
 {tag:'CBL08',cable_type:'Power',diameter:1.8,conductors:3,conductor_size:'1/0 AWG',weight:3.2,conduit_id:'C4',est_load:150},
 {tag:'CBL09',cable_type:'Control',diameter:0.7,conductors:4,conductor_size:'#10 AWG',weight:1.5,conduit_id:'C5',est_load:40},
 {tag:'CBL10',cable_type:'Signal',diameter:0.1,conductors:1,conductor_size:'#22 AWG',weight:0.2,conduit_id:'C5',est_load:2},
 {tag:'CBL11',cable_type:'Power',diameter:1.8,conductors:3,conductor_size:'1/0 AWG',weight:4.2,conduit_id:'C5',est_load:150},
 {tag:'CBL12',cable_type:'Power',diameter:1.3,conductors:3,conductor_size:'#2 AWG',weight:3.5,conduit_id:'C6',est_load:115},
 {tag:'CBL13',cable_type:'Control',diameter:0.6,conductors:6,conductor_size:'#14 AWG',weight:1.0,conduit_id:'C6',est_load:15},
 {tag:'CBL14',cable_type:'Signal',diameter:0.3,conductors:2,conductor_size:'#18 AWG',weight:0.3,conduit_id:'C7',est_load:5},
 {tag:'CBL15',cable_type:'Power',diameter:1.1,conductors:3,conductor_size:'#4 AWG',weight:2.8,conduit_id:'C7',est_load:85},
 {tag:'CBL16',cable_type:'Signal',diameter:0.3,conductors:2,conductor_size:'#16 AWG',weight:0.7,conduit_id:'C8',est_load:5},
 {tag:'CBL17',cable_type:'Control',diameter:0.9,conductors:8,conductor_size:'#12 AWG',weight:1.8,conduit_id:'C8',est_load:20},
 {tag:'CBL18',cable_type:'Power',diameter:1.8,conductors:3,conductor_size:'1/0 AWG',weight:4.8,conduit_id:'C9',est_load:150},
 {tag:'CBL19',cable_type:'Signal',diameter:0.12,conductors:1,conductor_size:'#20 AWG',weight:0.3,conduit_id:'C9',est_load:3},
 {tag:'CBL20',cable_type:'Control',diameter:0.8,conductors:8,conductor_size:'#16 AWG',weight:1.2,conduit_id:'C10',est_load:10},
 {tag:'CBL21',cable_type:'Power',diameter:1.3,conductors:3,conductor_size:'#2 AWG',weight:3.6,conduit_id:'C10',est_load:115},
 {tag:'CBL22',cable_type:'Control',diameter:0.6,conductors:4,conductor_size:'#14 AWG',weight:0.9,conduit_id:'C11',est_load:15},
 {tag:'CBL23',cable_type:'Signal',diameter:0.1,conductors:1,conductor_size:'#22 AWG',weight:0.2,conduit_id:'C11',est_load:2},
 {tag:'CBL24',cable_type:'Power',diameter:1.5,conductors:3,conductor_size:'#1 AWG',weight:3.0,conduit_id:'C12',est_load:130},
 {tag:'CBL25',cable_type:'Control',diameter:0.8,conductors:6,conductor_size:'#12 AWG',weight:1.1,conduit_id:'C12',est_load:20},
 {tag:'CBL26',cable_type:'Power',diameter:1.3,conductors:3,conductor_size:'#2 AWG',weight:3.5,conduit_id:'C13',est_load:115},
 {tag:'CBL27',cable_type:'Signal',diameter:0.3,conductors:2,conductor_size:'#18 AWG',weight:0.4,conduit_id:'C13',est_load:5},
 {tag:'CBL28',cable_type:'Control',diameter:0.6,conductors:4,conductor_size:'#14 AWG',weight:1.3,conduit_id:'C14',est_load:15},
 {tag:'CBL29',cable_type:'Power',diameter:1.8,conductors:3,conductor_size:'1/0 AWG',weight:4.0,conduit_id:'C15',est_load:150},
 {tag:'CBL30',cable_type:'Signal',diameter:0.15,conductors:1,conductor_size:'#16 AWG',weight:0.6,conduit_id:'C16',est_load:3},
];
// add additional cable properties for sample data
SAMPLE_CABLES.forEach(c=>{
 c.conductor_material='Copper';
 c.insulation_type='THHN';
 c.insulation_rating='90';
 c.voltage_rating='600V';
 c.shielding_jacket='';
 if(c.est_load===undefined) c.est_load=250;
});

const CONDUIT_SPECS={
 "EMT":{"1/2":0.304,"3/4":0.533,"1":0.864,"1-1/4":1.496,"1-1/2":2.036,"2":3.356,"2-1/2":5.858,"3":8.846,"3-1/2":11.545,"4":14.753},
 "RMC":{"1/2":0.314,"3/4":0.549,"1":0.887,"1-1/4":1.526,"1-1/2":2.071,"2":3.408,"2-1/2":4.866,"3":7.499,"3-1/2":10.01,"4":12.882,"5":20.212,"6":29.158},
 "PVC Sch 40":{"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291,"2-1/2":4.695,"3":7.268,"3-1/2":9.737,"4":12.554,"5":19.761,"6":28.567}
};
const RDUCT_TABLE={
  PVC:{"1/2":0.12,"3/4":0.115,"1":0.11,"1-1/4":0.105,"1-1/2":0.10,"2":0.095,"2-1/2":0.09,"3":0.085,"3-1/2":0.082,"4":0.08,"5":0.078,"6":0.075},
  steel:{"1/2":0.09,"3/4":0.085,"1":0.08,"1-1/4":0.075,"1-1/2":0.07,"2":0.065,"2-1/2":0.06,"3":0.058,"3-1/2":0.056,"4":0.055,"5":0.053,"6":0.05},
  concrete:{"1/2":0.10,"3/4":0.10,"1":0.095,"1-1/4":0.09,"1-1/2":0.088,"2":0.085,"2-1/2":0.082,"3":0.08,"3-1/2":0.078,"4":0.075,"5":0.072,"6":0.07}
};


const INSULATION_TEMP_LIMIT={
  THHN:90,
  XLPE:90,
  PVC:75,
  XHHW:90,
  'XHHW-2':90,
  'THWN-2':90,
  THW:75,
  'THWN':75,
  TW:60,
  UF:60
};

function fToC(f){
  return (f-32)/1.8;
}

function finiteNumber(value, fallback = 0){
  const num=parseFloat(value);
  return Number.isFinite(num)?num:fallback;
}

function getConductorRating(){
  const val=parseFloat(document.getElementById('conductorRating')?.value);
  return isNaN(val)?90:val;
}

function cableTemperatureRating(cable){
  const direct=parseFloat(cable?.insulation_rating);
  if(Number.isFinite(direct) && direct > 0) return direct;
  const type=String(cable?.insulation_type || '').trim().toUpperCase();
  return INSULATION_TEMP_LIMIT[type] || getConductorRating();
}

function cableCurrentCarryingConductors(cable){
  return Math.max(1, finiteNumber(cable?.conductors, 1));
}

function conduitEquivalentDiameterMeters(conduit){
  const area=CONDUIT_SPECS[conduit?.conduit_type]?.[conduit?.trade_size];
  if(!Number.isFinite(area) || area <= 0) return 0;
  return 2 * Math.sqrt(area / Math.PI) * 0.0254;
}

function insulationTypesForRating(rating){
  const types=Object.keys(INSULATION_TEMP_LIMIT).filter(t=>INSULATION_TEMP_LIMIT[t]==rating);
  return types.length?types:Object.keys(INSULATION_TEMP_LIMIT);
}

// Conductor temperature rise per Neher‑McGrath thermal model
// See docs/AMPACITY_METHOD.md#equation for context
function neherMcGrathTemp(power, Rth, ambient, k, r){
  const r0 = 0.05; // reference radius in meters
  const radial = Math.log(Math.max(r, r0)/r0)/(2*Math.PI*k);
  return ambient + power*(Rth + radial);
}

function runNeherMcGrathTests(){
  const t = neherMcGrathTemp(10, 0.5, 20, 1, 0.5);
  console.assert(Math.abs(t-28.7)<0.5, 'neherMcGrathTemp basic test');
}

const CTR_VERSION='1.0.0';
runNeherMcGrathTests();

function parseSize(sz){
 if(sz.includes('-')){const[w,f]=sz.split('-');const[n,d]=f.split('/');return parseFloat(w)+parseFloat(n)/parseFloat(d);} 
 if(sz.includes('/')){const[n,d]=sz.split('/');return parseFloat(n)/parseFloat(d);} 
 return parseFloat(sz);
}

function conduitSizeOptions(type){
 const sel=document.createElement('select');
 Object.keys(CONDUIT_SPECS[type]||{}).sort((a,b)=>parseSize(a)-parseSize(b)).forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});
 return sel;
}

const DUCTBANK_ROW_ACTION_ICONS = {
  duplicateBtn: 'icons/toolbar/copy.svg',
  removeBtn: 'icons/toolbar/trash.svg',
  viewBtn: 'icons/toolbar/grid.svg',
  insertAboveBtn: 'icons/toolbar/arrow-up.svg',
  insertBelowBtn: 'icons/toolbar/arrow-down.svg'
};

const DUCTBANK_DEFAULTS = Object.freeze({
  ductbankDepth: '36',
  earthTemp: '68',
  airTemp: '86',
  soilResistivity: '90',
  moistureContent: '10',
  hSpacing: '3',
  vSpacing: '4',
  topPad: '0',
  bottomPad: '0',
  leftPad: '0',
  rightPad: '0',
  perRow: '4',
  conductorRating: '90',
  gridRes: '20',
  ductThermRes: '0.0'
});

const DEFAULT_CABLE_ENTRY = Object.freeze({
  cable_type: 'Power',
  diameter: '1.3',
  conductors: '3',
  conductor_size: '#2 AWG',
  est_load: '115',
  conductor_material: 'Copper',
  insulation_type: 'THHN',
  insulation_rating: '90',
  voltage_rating: '600V',
  shielding_jacket: ''
});

const DUCTBANK_CONDUIT_TEMPLATE_HEADERS = ['conduit_id','conduit_type','trade_size','x','y'];
const DUCTBANK_CABLE_TEMPLATE_HEADERS = [
  'tag','cable_type','diameter','conductors','conductor_size','insulation_thickness',
  'weight','est_load','conduit_id','conductor_material','insulation_type',
  'insulation_rating','voltage_rating','shielding_jacket'
];

function createButton(text,cls,label,handler){
 const b=document.createElement('button');
 b.type='button';
 b.className=cls;
 if(label){b.setAttribute('aria-label',label);b.title=label;}
 const icon=DUCTBANK_ROW_ACTION_ICONS[cls];
 if(icon){
   b.classList.add('row-icon-btn');
   b.innerHTML=`<img src="${icon}" alt="" aria-hidden="true" class="control-icon" loading="lazy" decoding="async">`;
 }else{
   b.textContent=text;
 }
 b.addEventListener('click',handler);
 return b;
}

function filterTable(table, query){
 const q = query.toLowerCase();
 table.querySelectorAll('tbody tr').forEach(row => {
   let text = row.textContent.toLowerCase();
   row.querySelectorAll('input').forEach(inp => {
     text += ' ' + (inp.value || '').toLowerCase();
   });
   row.style.display = text.includes(q) ? '' : 'none';
 });
}

function ductbankHeaderText(th, index){
 const label=th.dataset.sortLabel || th.querySelector('.sort-label')?.textContent || th.textContent;
 return label.trim() || `Column ${index + 1}`;
}

function refreshDuctbankTableControls(table){
 if(!table) return;
 const tableLabel=table.id==='conduitTable' ? 'conduit' : table.id==='cableTable' ? 'cable' : 'row';
 const headerLabels=Array.from(table.querySelectorAll('thead th')).map(ductbankHeaderText);
 table.querySelectorAll('tbody tr').forEach((row,rowIndex)=>{
   const rowId=normalizeDuctbankId(row.children[0]?.querySelector('input,select')?.value);
   const rowLabel=rowId || `${tableLabel} row ${rowIndex + 1}`;
   Array.from(row.children).forEach((cell,colIndex)=>{
     const control=cell.querySelector('input,select,button');
     if(!control) return;
     const header=headerLabels[colIndex] || `Column ${colIndex + 1}`;
     if(control.matches('input,select')){
       control.setAttribute('aria-label',`${rowLabel} ${header}`);
       return;
     }
     if(control.classList.contains('duplicateBtn')){
       control.setAttribute('aria-label',`Duplicate ${rowLabel}`);
       control.title=`Duplicate ${rowLabel}`;
     }else if(control.classList.contains('removeBtn')){
       control.setAttribute('aria-label',`Delete ${rowLabel}`);
       control.title=`Delete ${rowLabel}`;
     }
   });
 });
}

function refreshDuctbankTables(){
 ['conduitTable','cableTable','heatSourceTable'].forEach(id=>refreshDuctbankTableControls(document.getElementById(id)));
}

function makeTableSortable(tableId){
 const table=document.getElementById(tableId);
 if(!table) return;
 const tbody=table.querySelector('tbody');
 let sortIdx=null, asc=true;
 const sortableHeaders=Array.from(table.querySelectorAll('th[data-idx]'));
 const updateSortHeaderState=(activeHeader,direction)=>{
   sortableHeaders.forEach((header,index)=>{
     const button=header.querySelector('.header-sort');
     const label=ductbankHeaderText(header,index);
     const isActive=header===activeHeader;
     header.classList.toggle('is-sorted',isActive);
     header.setAttribute('aria-sort',isActive ? (direction==='asc' ? 'ascending' : 'descending') : 'none');
     if(button){
       button.dataset.sort=isActive ? direction : 'none';
       button.setAttribute('aria-label',isActive ? `Sort by ${label}, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`);
     }
   });
 };
 sortableHeaders.forEach((th,index)=>{
  const label=ductbankHeaderText(th,index);
  th.dataset.sortLabel=label;
  th.setAttribute('aria-sort','none');
  const button=document.createElement('button');
  button.type='button';
  button.className='header-sort';
  button.dataset.sort='none';
  button.setAttribute('aria-label',`Sort by ${label}`);
  const labelSpan=document.createElement('span');
  labelSpan.className='sort-label';
  labelSpan.textContent=label;
  const indicator=document.createElement('span');
  indicator.className='sort-indicator';
  indicator.setAttribute('aria-hidden','true');
  button.append(labelSpan,indicator);
  th.textContent='';
  th.appendChild(button);
  button.addEventListener('click',()=>{
   const idx=parseInt(th.dataset.idx);
   if(sortIdx===idx) asc=!asc; else {asc=true; sortIdx=idx;}
   const rows=Array.from(tbody.querySelectorAll('tr'));
   rows.sort((a,b)=>{
    const aVal=a.children[idx].querySelector('input,select');
    const bVal=b.children[idx].querySelector('input,select');
    const av=aVal?aVal.value:a.children[idx].textContent;
    const bv=bVal?bVal.value:b.children[idx].textContent;
    const na=parseFloat(av), nb=parseFloat(bv);
    if(!isNaN(na)&&!isNaN(nb)) return asc?na-nb:nb-na;
    return asc?av.localeCompare(bv):bv.localeCompare(av);
   });
   rows.forEach(r=>tbody.appendChild(r));
   updateSortHeaderState(th,asc ? 'asc' : 'desc');
   refreshDuctbankTableControls(table);
   scheduleDuctbankExperienceUpdate();
  });
 });
 refreshDuctbankTableControls(table);
}

function packCircles(cables,R){
 const placed=[];
 cables.sort((a,b)=>b.r-a.r);
 function yAtBoundary(x,r){return Math.sqrt(Math.max(0,(R-r)*(R-r)-x*x));}
 for(const c of cables){
  let best=null;let bestY=-Infinity;const maxX=R-c.r;const step=Math.max(0.05,c.r/4);
  for(let x=-maxX;x<=maxX;x+=step){
   let y=yAtBoundary(x,c.r);
   for(const p of placed){
     const dx=x-p.x;if(Math.abs(dx)<p.r+c.r){const dy=Math.sqrt((p.r+c.r)*(p.r+c.r)-dx*dx);y=Math.min(y,p.y-dy);}
   }
   if(y>bestY){bestY=y;best={x,y};}
  }
  if(best){
   let y=yAtBoundary(best.x,c.r);
   for(const p of placed){
     const dx=best.x-p.x;if(Math.abs(dx)<p.r+c.r){const dy=Math.sqrt((p.r+c.r)*(p.r+c.r)-dx*dx);y=Math.min(y,p.y-dy);}
   }
   placed.push({x:best.x,y,r:c.r,tag:c.tag});
  }else{
   placed.push({x:0,y:0,r:c.r,tag:c.tag});
  }
 }
 return placed;
}

function generateNextCableTag(sample){
  let prefix='CBL', digits=2, max=0;
  if(sample){
    const m=sample.match(/^(.*?)(\d+)$/);
    if(m){ prefix=m[1]; digits=m[2].length; }
  } else {
    document.querySelectorAll('#cableTable tbody tr').forEach(tr=>{
      const val=tr.children[0]?.querySelector('input')?.value.trim();
      const m=val&&val.match(/^(.*?)(\d+)$/);
      if(m){ prefix=m[1]; digits=m[2].length; }
    });
  }
  document.querySelectorAll('#cableTable tbody tr').forEach(tr=>{
    const val=tr.children[0]?.querySelector('input')?.value.trim();
    const regex=new RegExp('^'+prefix+'(\\d+)$');
    const m=val&&val.match(regex);
    if(m){
      max=Math.max(max,parseInt(m[1],10));
      digits=Math.max(digits,m[1].length);
    }
  });
  return prefix + String(max+1).padStart(digits,'0');
}

function addConduitRow(data={}){
 const tr=document.createElement('tr');
 const idTd=document.createElement('td');const idInput=document.createElement('input');idInput.name='conduit_id';idInput.value=data.conduit_id||'';idTd.appendChild(idInput);tr.appendChild(idTd);
 const typeTd=document.createElement('td');const typeSel=document.createElement('select');typeSel.name='conduit_type';Object.keys(CONDUIT_SPECS).forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;typeSel.appendChild(o);});typeSel.value=data.conduit_type||Object.keys(CONDUIT_SPECS)[0];typeTd.appendChild(typeSel);tr.appendChild(typeTd);
 const sizeTd=document.createElement('td');let sizeSel=conduitSizeOptions(typeSel.value);sizeSel.name='trade_size';sizeTd.appendChild(sizeSel);sizeSel.value=data.trade_size||sizeSel.options[0].value;tr.appendChild(sizeTd);
 typeSel.addEventListener('change',()=>{const old=sizeSel;sizeSel=conduitSizeOptions(typeSel.value);sizeSel.name='trade_size';sizeTd.replaceChild(sizeSel,old);});
 ['x','y'].forEach(k=>{const td=document.createElement('td');const inp=document.createElement('input');inp.name=k;inp.type='number';inp.value=data[k]||0;if(k==='x'||k==='y')inp.readOnly=true;td.appendChild(inp);tr.appendChild(td);});
 const dupTd=document.createElement('td');dupTd.appendChild(createButton('⧉','duplicateBtn','Duplicate row',()=>{const cloneData=rowToConduit(tr);addConduitRow(cloneData);}));tr.appendChild(dupTd);
 const delTd=document.createElement('td');delTd.appendChild(createButton('✖','removeBtn','Delete row',()=>{tr.remove();drawGrid();
 updateAmpacityReport();saveDuctbankSession();}));tr.appendChild(delTd);
 document.querySelector('#conduitTable tbody').appendChild(tr);
 autoPlaceConduits();
 saveDuctbankSession();
}

function addCableRow(data={}, opts={}){
  const tr=document.createElement('tr');
 const cols=['tag','cable_type','diameter','conductors','conductor_size','insulation_thickness','weight','est_load','conduit_id','conductor_material','insulation_type','insulation_rating','voltage_rating','shielding_jacket'];
 const selectOptions={
  cable_type:['Power','Control','Signal'],
  conductor_material:['Copper','Aluminum'],
  insulation_type:Object.keys(INSULATION_TEMP_LIMIT),
  insulation_rating:['60','75','90'],
  shielding_jacket:['','Lead','Copper Tape']
};
 cols.forEach(c=>{
  const td=document.createElement('td');
  let inp;
  if(selectOptions[c]){
    inp=document.createElement('select');
    inp.name=c;
    selectOptions[c].forEach(opt=>{
      const o=document.createElement('option');
      o.value=opt;
      o.textContent=opt||'None';
      inp.appendChild(o);
    });
  }else{
    inp=document.createElement('input');
    inp.name=c;
    if(c==='diameter'||c==='weight'||c==='est_load'||c==='insulation_thickness') inp.type='number';
    else if(c==='conductors') inp.type='number';
    else inp.type='text';
    if(c==='conductor_size') inp.setAttribute('list','sizeList');
  }
  inp.value=data[c]||'';
  td.appendChild(inp);
  tr.appendChild(td);
});
 const tagInput=tr.children[0]?.querySelector('input');
 if(tagInput){
  if(data.autoTag || !data.tag){
    tagInput.value=generateNextCableTag(data.tag||tagInput.value);
  }
 }
function applyDefaults(){
  const sizeInput=tr.children[4]?.querySelector('input');
  const thickInput=tr.children[5]?.querySelector('input');
  const weightInput=tr.children[6]?.querySelector('input');
  const matSel=tr.children[9]?.querySelector('select');
  const size=sizeInput?.value.trim();
  const key=normalizeSizeKey(size);
  const props=window.CONDUCTOR_PROPS && window.CONDUCTOR_PROPS[key];
  if(props){
    if(thickInput && !thickInput.value) thickInput.value=props.insulation_thickness;
    if(thickInput){
      if(isNaN(parseFloat(thickInput.value))) tr.children[5].classList.add('missing-value');
      else tr.children[5].classList.remove('missing-value');
    }
    if(weightInput){
      const areaIn2=props.area_cm*7.854e-7;
      const density=(matSel&&matSel.value&&matSel.value.toLowerCase().includes('al'))?0.0975:0.323;
      weightInput.value=(areaIn2*density*12).toFixed(3);
    }
  }else if(thickInput && !thickInput.value){
    tr.children[5].classList.add('missing-value');
  }
 }
const sizeInput=tr.children[4]?.querySelector('input');
const matSel=tr.children[9]?.querySelector('select');
const thickInput=tr.children[5]?.querySelector('input');
sizeInput&&sizeInput.addEventListener('change',applyDefaults);
thickInput&&thickInput.addEventListener('input',applyDefaults);
matSel&&matSel.addEventListener('change',applyDefaults);
 applyDefaults();
const dupTd=document.createElement('td');dupTd.appendChild(createButton('⧉','duplicateBtn','Duplicate row',()=>{const clone=rowToCable(tr);clone.autoTag=true;addCableRow(clone);}));tr.appendChild(dupTd);
const delTd=document.createElement('td');delTd.appendChild(createButton('✖','removeBtn','Delete row',()=>{tr.remove();drawGrid();updateAmpacityReport();saveDuctbankSession();}));tr.appendChild(delTd);
document.querySelector('#cableTable tbody').appendChild(tr);
if(!opts.defer){
  drawGrid();
  updateAmpacityReport();
  saveDuctbankSession();
}
}

function updateInsulationOptions(){
 const rating=getConductorRating();
 const allowed=insulationTypesForRating(rating);
 document.querySelectorAll('#cableTable tbody tr').forEach(tr=>{
  const sel=tr.children[10]?.querySelector('select');
  if(!sel) return;
  Array.from(sel.options).forEach(opt=>{
    const type=opt.value;
    const limit=INSULATION_TEMP_LIMIT[type];
    opt.disabled=limit!==undefined && limit!==rating;
  });
  if(sel.options[sel.selectedIndex]?.disabled){
    const first=Array.from(sel.options).find(o=>!o.disabled);
    if(first) sel.value=first.value;
  }
 });
}

function rowToConduit(tr){
 const [id,type,size,x,y]=Array.from(tr.children).slice(0,5).map(td=>td.querySelector('input,select').value);
 return {conduit_id:id,conduit_type:type,trade_size:size,x:parseFloat(x),y:parseFloat(y)};
}

function rowToCable(tr){
 const cells=Array.from(tr.children);
 const getVal=idx=>{
   const el=cells[idx]?.querySelector('input,select');
   return el?el.value.trim():'';
 };
 return {
   tag:getVal(0),
   cable_type:getVal(1),
   diameter:parseFloat(getVal(2))||0,
   conductors:parseInt(getVal(3))||0,
   conductor_size:getVal(4),
   insulation_thickness:parseFloat(getVal(5))||0,
   weight:parseFloat(getVal(6))||0,
   est_load:parseFloat(getVal(7))||0,
   conduit_id:getVal(8),
   conductor_material:getVal(9),
   insulation_type:getVal(10),
   insulation_rating:getVal(11),
   voltage_rating:getVal(12),
   shielding_jacket:getVal(13)
 };
}

const HEAT_SOURCE_SHAPES=['Circle','Square'];
function addHeatSourceRow(data={}){
 const tr=document.createElement('tr');
 const fields=['tag','shape','width','height','temperature','x','y'];
 fields.forEach(f=>{
  const td=document.createElement('td');
  let inp;
  if(f==='shape'){
    inp=document.createElement('select');
    inp.name=f;
    HEAT_SOURCE_SHAPES.forEach(opt=>{
      const o=document.createElement('option');
      o.value=opt;
      o.textContent=opt;
      inp.appendChild(o);
    });
  }else{
    inp=document.createElement('input');
    inp.type=f==='tag'?'text':'number';
    inp.name=f;
  }
  if(f==='shape' && !data[f]) data[f]=HEAT_SOURCE_SHAPES[0];
  inp.value=data[f] ?? '';
  td.appendChild(inp);
  tr.appendChild(td);
 });
 const delTd=document.createElement('td');
 delTd.appendChild(createButton('✖','removeBtn','Delete row',()=>{tr.remove();saveDuctbankSession();}));
 tr.appendChild(delTd);
 document.querySelector('#heatSourceTable tbody').appendChild(tr);
 saveDuctbankSession();
}

function parseHeatSourceNumber(value){
 const text=String(value ?? '').trim();
 if(!text) return '';
 const parsed=parseFloat(text);
 return Number.isFinite(parsed) ? parsed : '';
}

function rowToHeatSource(tr){
 const vals=Array.from(tr.children).slice(0,7)
                .map(td=>td.querySelector('input,select')?.value);
 const [tag,shape,width,height,temperature,x,y]=vals;
 return {tag,shape:shape || HEAT_SOURCE_SHAPES[0],width:parseHeatSourceNumber(width),height:parseHeatSourceNumber(height),
         temperature:parseHeatSourceNumber(temperature),
         x:parseHeatSourceNumber(x),y:parseHeatSourceNumber(y)};
}

function isCompleteHeatSource(src){
 const width=parseFloat(src?.width);
 const height=parseFloat(src?.height);
 const temperature=parseFloat(src?.temperature);
 const x=parseFloat(src?.x);
 const y=parseFloat(src?.y);
 return Number.isFinite(width) && width > 0
   && Number.isFinite(height) && height > 0
   && Number.isFinite(temperature)
   && Number.isFinite(x)
   && Number.isFinite(y);
}

function getAllHeatSources({ includeIncomplete = false } = {}){
 const sources=Array.from(document.querySelectorAll('#heatSourceTable tbody tr')).map(rowToHeatSource);
 return includeIncomplete ? sources : sources.filter(isCompleteHeatSource);
}

function getAllConduits(){
 return Array.from(document.querySelectorAll('#conduitTable tbody tr')).map(rowToConduit);
}

function getAllCables(){
 return Array.from(document.querySelectorAll('#cableTable tbody tr')).map(tr=>rowToCable(tr));
}

function setDuctbankFieldDefault(id, value, onlyBlank){
 const el=document.getElementById(id);
 if(!el) return;
 if(onlyBlank && String(el.value || '').trim()) return;
 el.value=value;
}

function applyDuctbankDefaults({ onlyBlank = true, silent = false, persist = true } = {}){
 Object.entries(DUCTBANK_DEFAULTS).forEach(([id,value])=>setDuctbankFieldDefault(id,value,onlyBlank));
 const earthContextToggle=document.getElementById('showEarthContext');
 if(earthContextToggle && !onlyBlank) earthContextToggle.checked=true;
 updateInsulationOptions();
 updateHeatSourceVisibility();
 validateThermalInputs();
 GRID_SIZE=parseInt(document.getElementById('gridRes')?.value)||20;
 drawGrid();
 updateAmpacityReport(false);
 if(persist) saveDuctbankSession();
 scheduleDuctbankExperienceUpdate();
 if(!silent) showToast('Restored practical ductbank defaults');
}

function saveDuctbankSession(){
 const session={
  ductbankTag:document.getElementById('ductbankTag').value,
  concreteEncasement:document.getElementById('concreteEncasement').checked,
  ductbankDepth:document.getElementById('ductbankDepth').value,
  earthTemp:document.getElementById('earthTemp').value,
  airTemp:document.getElementById('airTemp').value,
  soilResistivity:document.getElementById('soilResistivity').value,
  moistureContent:document.getElementById('moistureContent').value,
  heatSources:document.getElementById('heatSources').checked,
  showEarthContext:document.getElementById('showEarthContext')?.checked !== false,
  heatSourceData:getAllHeatSources({ includeIncomplete:true }),
  hSpacing:document.getElementById('hSpacing').value,
  vSpacing:document.getElementById('vSpacing').value,
  topPad:document.getElementById('topPad').value,
  bottomPad:document.getElementById('bottomPad').value,
  leftPad:document.getElementById('leftPad').value,
  rightPad:document.getElementById('rightPad').value,
  perRow:document.getElementById('perRow').value,
  gridRes:document.getElementById('gridRes').value,
  ductThermRes:document.getElementById('ductThermRes').value,
  conduits:getAllConduits(),
  cables:getAllCables(),
  conductorRating:document.getElementById('conductorRating').value,
  darkMode:document.body.classList.contains('dark-mode')
};
 try{setItem('ductbankSession',session);}catch(e){console.error('save session failed',e);}
}

function loadDuctbankSession(){
 const stored=getItem('ductbankSession');
 if(!stored) return;
 try{
  const s=stored;
  if(s.ductbankTag!==undefined)document.getElementById('ductbankTag').value=s.ductbankTag;
  if(s.concreteEncasement!==undefined)document.getElementById('concreteEncasement').checked=s.concreteEncasement;
  if(s.ductbankDepth!==undefined)document.getElementById('ductbankDepth').value=s.ductbankDepth;
  if(s.earthTemp!==undefined)document.getElementById('earthTemp').value=s.earthTemp;
  if(s.airTemp!==undefined)document.getElementById('airTemp').value=s.airTemp;
  if(s.soilResistivity!==undefined)document.getElementById('soilResistivity').value=s.soilResistivity;
  if(s.moistureContent!==undefined)document.getElementById('moistureContent').value=s.moistureContent;
  if(s.conductorRating!==undefined)document.getElementById('conductorRating').value=s.conductorRating;
  if(s.heatSources!==undefined)document.getElementById('heatSources').checked=s.heatSources;
  if(s.showEarthContext!==undefined)document.getElementById('showEarthContext').checked=s.showEarthContext;
  if(Array.isArray(s.heatSourceData)){
    document.querySelector('#heatSourceTable tbody').innerHTML='';
    s.heatSourceData.forEach(addHeatSourceRow);
  }
  if(s.hSpacing!==undefined)document.getElementById('hSpacing').value=s.hSpacing;
  if(s.vSpacing!==undefined)document.getElementById('vSpacing').value=s.vSpacing;
  if(s.topPad!==undefined)document.getElementById('topPad').value=s.topPad;
  if(s.bottomPad!==undefined)document.getElementById('bottomPad').value=s.bottomPad;
  if(s.leftPad!==undefined)document.getElementById('leftPad').value=s.leftPad;
  if(s.rightPad!==undefined)document.getElementById('rightPad').value=s.rightPad;
  if(s.perRow!==undefined)document.getElementById('perRow').value=s.perRow;
  if(s.gridRes!==undefined)document.getElementById('gridRes').value=s.gridRes;
  if(s.ductThermRes!==undefined)document.getElementById('ductThermRes').value=s.ductThermRes;
  if(Array.isArray(s.conduits)){
    document.querySelector('#conduitTable tbody').innerHTML='';
    s.conduits.forEach(addConduitRow);
  }
  if(Array.isArray(s.cables)){
    document.querySelector('#cableTable tbody').innerHTML='';
    s.cables.forEach(c=>addCableRow(c,{defer:true}));
    updateInsulationOptions();
  }
  if(s.darkMode){document.body.classList.add('dark-mode');}
  else{document.body.classList.remove('dark-mode');}
  updateHeatSourceVisibility();
  GRID_SIZE=parseInt(document.getElementById('gridRes').value)||20;
  drawGrid();
  updateAmpacityReport();
  updateInsulationOptions();
 }catch(e){console.error('load session failed',e);}
}

// Reload the ductbank form whenever a remote collaborator's patch is applied
document.addEventListener('ctr:remote-applied', () => { loadDuctbankSession(); });

function loadCablesFromSchedule(){
  const tbody=document.querySelector('#cableTable tbody');
  if(!tbody||tbody.children.length>0) return;
  const cables=getCables();
  if(!cables||cables.length===0) return;
  const conduitSet=new Set(getAllConduits().map(c=>c.conduit_id));
  let added=false;
  cables.forEach(c=>{
    let ids=c.raceway_ids;
    if(typeof ids==='string') ids=ids.split(',').map(s=>s.trim()).filter(Boolean);
    ids=Array.isArray(ids)?ids:[];
    const matches=ids.filter(id=>conduitSet.has(id));
    if(matches.length===0) return;
    let conduit_id='';
    if(matches.length===1) conduit_id=matches[0];
    else console.warn(`Cable ${c.tag||''} matches multiple raceways: ${matches.join(', ')}; leaving conduit blank`);
    const diameter=c.diameter??c.cable_od??c.OD??c.od;
    const voltageRating=c.voltage_rating??c.cable_rating??c.rating;
    const row=Object.assign({},c,{
      conduit_id,
      diameter,
      voltage_rating:voltageRating
    });
    addCableRow(row,{defer:true});
    added=true;
  });
  if(added){
    updateInsulationOptions();
    drawGrid();
    updateAmpacityReport();
    saveDuctbankSession();
  }
}

function applyDuctbankRouteData(routeData){
  if(!routeData || !routeData.ductbank) return false;
  const {ductbank,cables=[],conduits,conduitId}=routeData;
  const tag=ductbank.ductbank_id || ductbank.id || ductbank.tag || '';
  const tagEl=document.getElementById('ductbankTag');
  if(tagEl) tagEl.value=tag;
  const projectSelect=document.getElementById('projectDuctbankSelect');
  if(projectSelect&&Array.from(projectSelect.options).some(option=>option.value===tag)) projectSelect.value=tag;
  const encasement=document.getElementById('concreteEncasement');
  const encasementValue=ductbank.encasement ?? ductbank.concrete_encasement;
  if(encasement && encasementValue!==undefined){
    encasement.checked=String(encasementValue).toLowerCase().includes('concrete') || encasementValue===true;
  }
  const projectFieldMap={
    ductbankDepth:'coverDepth',
    soilResistivity:'soilThermalResistivity',
    hSpacing:'hSpacing',
    vSpacing:'vSpacing',
    topPad:'topPad',
    bottomPad:'bottomPad',
    leftPad:'leftPad',
    rightPad:'rightPad',
    perRow:'perRow'
  };
  Object.entries(projectFieldMap).forEach(([elementId,projectKey])=>{
    const element=document.getElementById(elementId);
    if(element && ductbank[projectKey]!==undefined) element.value=ductbank[projectKey];
  });

  const conduitRows=Array.isArray(conduits) ? conduits : (Array.isArray(ductbank.conduits) ? ductbank.conduits : []);
  const cbody=document.querySelector('#conduitTable tbody');
  if(cbody){
    cbody.innerHTML='';
    conduitRows.forEach(cd=>{
      addConduitRow({
        conduit_id:cd.conduit_id || cd.id || cd.tag || '',
        conduit_type:cd.conduit_type || cd.type || '',
        trade_size:cd.trade_size || '',
        x:cd.x ?? cd.offset_x ?? 0,
        y:cd.y ?? cd.offset_y ?? 0
      });
    });
  }
  if(conduitId){
    const searchInput=document.getElementById('conduit-search');
    if(searchInput){
      searchInput.value=conduitId;
      filterTable(document.getElementById('conduitTable'),conduitId);
    }
  }

  const tbody=document.querySelector('#cableTable tbody');
  if(tbody && Array.isArray(cables)){
    tbody.innerHTML='';
    cables.forEach(c=>{
      addCableRow({
        tag:c.tag || c.name || c.id || '',
        cable_type:c.cable_type || '',
        diameter:c.diameter ?? c.cable_od ?? '',
        conductors:c.conductors ?? c.count ?? '',
        conductor_size:c.conductor_size || c.size || '',
        insulation_thickness:c.insulation_thickness ?? '',
        weight:c.weight ?? '',
        est_load:c.est_load ?? c.load_current ?? c.load ?? '',
        conduit_id:c.conduit_id || c.conduit || '',
        conductor_material:c.conductor_material || '',
        insulation_type:c.insulation_type || '',
        insulation_rating:c.insulation_rating || '',
        voltage_rating:c.voltage_rating || '',
        shielding_jacket:c.shielding_jacket || ''
      },{defer:true});
    });
    updateInsulationOptions();
    if(conduitId){
      const cableSearch=document.getElementById('cable-search');
      if(cableSearch){
        cableSearch.value=conduitId;
        filterTable(document.getElementById('cableTable'),conduitId);
      }
    }
  }
  drawGrid();
  updateAmpacityReport();
  saveDuctbankSession();
  return true;
}

function autoPlaceConduits(){
 const rows=document.querySelectorAll('#conduitTable tbody tr');
 if(rows.length===0) return;
 const h=parseFloat(document.getElementById('hSpacing').value)||3;
 const v=parseFloat(document.getElementById('vSpacing').value)||4;
 const bottomPad=parseFloat(document.getElementById('bottomPad').value)||0;
 const leftPad=parseFloat(document.getElementById('leftPad').value)||0;
 let perRow=parseInt(document.getElementById('perRow').value);
 if(!perRow) perRow=Math.ceil(Math.sqrt(rows.length))||1;

 const numRows=Math.ceil(rows.length/perRow);
 const rowMaxR=new Array(numRows).fill(0);
 const colMaxR=new Array(perRow).fill(0);
 for(let r=0;r<numRows;r++){
   for(let c=0;c<perRow;c++){
     const idx=r*perRow+c;
     if(idx>=rows.length)break;
     const tr=rows[idx];
     const type=tr.children[1].querySelector('select').value;
     const size=tr.children[2].querySelector('select').value;
     const Rin=Math.sqrt(CONDUIT_SPECS[type][size]/Math.PI);
     rowMaxR[r]=Math.max(rowMaxR[r],Rin);
     colMaxR[c]=Math.max(colMaxR[c],Rin);
   }
 }

 let yCursor=bottomPad;
 for(let r=0;r<numRows;r++){
   let xCursor=leftPad;
   for(let c=0;c<perRow;c++){
     const idx=r*perRow+c;
     if(idx>=rows.length)break;
     const tr=rows[idx];
     const type=tr.children[1].querySelector('select').value;
     const size=tr.children[2].querySelector('select').value;
     const Rin=Math.sqrt(CONDUIT_SPECS[type][size]/Math.PI);
     const cells=tr.querySelectorAll('td');
     const x=cells[3].querySelector('input');
     const y=cells[4].querySelector('input');
     x.value=xCursor+(colMaxR[c]-Rin);
     y.value=yCursor+(rowMaxR[r]-Rin);
     xCursor+=2*colMaxR[c]+h;
   }
   yCursor+=2*rowMaxR[r];
   if(r<numRows-1) yCursor+=v;
 }
}

/* Conduit fill limits per NEC Chapter 9 Tables 1 & 4 (see docs/standards.md) */
function fillResults(){
 const conduits=getAllConduits();
 const cables=getAllCables();
 const fillMap={};
 conduits.forEach(c=>{fillMap[c.conduit_id]={area:CONDUIT_SPECS[c.conduit_type][c.trade_size],cables:[]};});
 cables.forEach(cb=>{const cid=cb.conduit_id;if(fillMap[cid])fillMap[cid].cables.push(cb);});
 Object.values(fillMap).forEach(c=>{c.fillArea=c.cables.reduce((s,cb)=>s+Math.PI*Math.pow(cb.diameter/2,2),0);c.fillPct=(c.fillArea/c.area)*100;});
 return fillMap;
}

let CONDUCTOR_PROPS={};
const AWG_AREA={"22":642,"20":1020,"18":1624,"16":2583,"14":4107,"12":6530,"10":10380,"8":16510,"6":26240,"4":41740,"3":52620,"2":66360,"1":83690,"1/0":105600,"2/0":133100,"3/0":167800,"4/0":211600,"250":250000,"350":350000,"500":500000,"750":750000,"1000":1000000};

const BASE_RESISTIVITY={cu:0.017241,al:0.028264}; // ohm-mm^2/m @20C
const TEMP_COEFF={cu:0.00393,al:0.00403};
const RESISTANCE_TABLE={cu:{},al:{}};
for(const sz in AWG_AREA){
  const areaMM2=AWG_AREA[sz]*0.0005067;
  RESISTANCE_TABLE.cu[sz]=BASE_RESISTIVITY.cu/areaMM2;
  RESISTANCE_TABLE.al[sz]=BASE_RESISTIVITY.al/areaMM2;
}

function normalizeSizeKey(size){
  const s=size?size.toString().trim():'';
  if(CONDUCTOR_PROPS[s]) return s;
  const alt=s.replace(/^#/, '');
  if(CONDUCTOR_PROPS[alt]) return alt;
  return s;
}

function dcResistance(size,material,temp=20){
  const key=normalizeSizeKey(size);
  const mat=material&&material.toLowerCase().includes('al')?'al':'cu';
  let base;
  const props=CONDUCTOR_PROPS[key];
  if(props){
    base=(mat==='al'?props.rdc_al:props.rdc_cu);
  }else{
    base=RESISTANCE_TABLE[mat][key];
    if(base===undefined){
      const areaCM=sizeToArea(size);
      if(!areaCM)return 0;
      const areaMM2=areaCM*0.0005067;
      base=BASE_RESISTIVITY[mat]/areaMM2;
    }
  }
  return base*(1+TEMP_COEFF[mat]*(temp-20));
}

function sizeToArea(size){
 if(!size)return 0;
 let s=size.toString().trim();
 if(CONDUCTOR_PROPS[s]) return CONDUCTOR_PROPS[s].area_cm;
 s=s.replace(/^#/, '');
 if(/kcmil/i.test(s))return parseFloat(s)*1000;
 const m=s.match(/(\d+(?:\/0)?)/);
 if(!m)return 0;
 return AWG_AREA[m[1]]||0;
}

function skinEffect(size){
  // AC skin effect per IEEE Std 835 Table 4.
  // Interpolate Yc using conductor area in kcmil.
  const area=sizeToArea(size)/1000; // convert to kcmil
  if(!area) return 0;
  const table=[
    [0,0], [100,0], [250,0.05], [500,0.1],
    [1000,0.15], [2000,0.2]
  ];
  for(let i=1;i<table.length;i++){
    const a=table[i-1];
    const b=table[i];
    if(area<=b[0]){
      const t=(area-a[0])/(b[0]-a[0]);
      return a[1]+t*(b[1]-a[1]);
    }
  }
  return table[table.length-1][1];
}

function dielectricRise(voltage){
  // Dielectric loss temperature rise from IEEE Std 835 Table 9
  const v=(parseFloat(voltage)||0)/1000; // kV
  const table=[
    [0,0],[2,0],[5,5],[15,10],[25,15],[35,20]
  ];
  if(v<=table[0][0]) return table[0][1];
  for(let i=1;i<table.length;i++){
    const a=table[i-1];
    const b=table[i];
    if(v<=b[0]){
      const t=(v-a[0])/(b[0]-a[0]);
      return a[1]+t*(b[1]-a[1]);
    }
  }
  return table[table.length-1][1];
}

function conductorThermalResistance(cable){
  const key=normalizeSizeKey(cable.conductor_size);
  const props=CONDUCTOR_PROPS[key];
  if(!props){
    throw new Error('Invalid conductor size: '+cable.conductor_size);
  }
  const areaM2=props.area_cm*5.067e-10;
  const r=Math.sqrt(areaM2/Math.PI); // conductor radius (m)
  const t=(parseFloat(cable.insulation_thickness)||props.insulation_thickness||0)*0.0254;
  const r_i=r;
  const r_o=r+t;
  const r_inner_equivalent=r*0.001;
  const kCond=cable.conductor_material&&cable.conductor_material.toLowerCase().includes('al')?237:401;
  const kIns=parseFloat(cable.insulation_k)||0.3;
  const Rcond=Math.log(r_i/r_inner_equivalent)/(2*Math.PI*kCond);
  const Rins=Math.log(r_o/r_i)/(2*Math.PI*kIns);
  return {Rcond,Rins};
}

function findConduit(id){
  if(typeof getAllConduits==='function'){
    return getAllConduits().find(c=>c.conduit_id===id)||{};
  }
  return {};
}

function getRduct(conduit,params){
  if(!conduit||!conduit.conduit_type)return params.concreteEncasement?0.1:0.08;
  const mat=conduit.conduit_type.includes('PVC')?'PVC':'steel';
  const base=(RDUCT_TABLE[mat]||{})[conduit.trade_size];
  let val=base!==undefined?base:(mat==='PVC'?0.1:0.08);
  if(params.concreteEncasement){
    const extra=RDUCT_TABLE.concrete[conduit.trade_size];
    val+=(extra!==undefined?extra:0.05);
  }
  return val;
}

// Thermal resistance components for Neher‑McGrath
// see docs/AMPACITY_METHOD.md#equation
function calcRcaComponents(cable,params,count=1,total=1){
 const cr=conductorThermalResistance(cable);
 let Rcond=cr.Rcond;
 let Rins=cr.Rins;
 const conduit=findConduit(cable.conduit_id);
 let Rduct=getRduct(conduit,params);
 let rho=params.soilResistivity||90;
 rho=Math.min(150,Math.max(40,rho));
 const rho_m=rho/100;
 const burialDepth=(params.ductbankDepth||0)*0.0254;
 const conduitDiameter=conduitEquivalentDiameterMeters(conduit);
 let Rsoil=0;
 if(burialDepth>0&&conduitDiameter>0){
  Rsoil=(rho_m/(2*Math.PI))*Math.log(4*burialDepth/conduitDiameter);
 }
 return {Rcond,Rins,Rduct,Rsoil,Rca:Rcond+Rins+Rduct+Rsoil};
}

function calcRca(cable,params,count=1,total=1){
  // helper for Neher‑McGrath ampacity, see docs/AMPACITY_METHOD.md
  return calcRcaComponents(cable,params,count,total).Rca;
}

/* Ampacity via full Neher-McGrath equation
   See docs/AMPACITY_METHOD.md#equation */
function estimateAmpacity(cable,params,count=1,total=0){
 const rating=cableTemperatureRating(cable);
 const Rdc=dcResistance(cable.conductor_size,cable.conductor_material,rating);
 const Yc=skinEffect(cable.conductor_size);
 const dTd=dielectricRise(cable.voltage_rating);
 const comps=calcRcaComponents(cable,params,count,total);
 const Rca=(+comps.Rcond)+(+comps.Rins)+(+comps.Rduct)+(+comps.Rsoil);
 if(!Number.isFinite(Rca)||Rca<=0) return {ampacity:NaN};
 const amb=Math.max(Number.isFinite(params.earthTemp)?params.earthTemp:20,
                   isNaN(params.airTemp)?-Infinity:params.airTemp);
 const num=rating-(amb+dTd);
 if(num<=0 || !Number.isFinite(Rdc) || Rdc<=0) return {ampacity:0};
 const conductorFactor=cableCurrentCarryingConductors(cable);
 const ampacity=Math.sqrt(num/(Rdc*(1+Yc)*Rca*conductorFactor));
 return {ampacity};
}

function ampacityDetails(cable,params,count=1,total=0){
 const areaCM=sizeToArea(cable.conductor_size);
 if(!areaCM) return {ampacity:0};
 const rating=cableTemperatureRating(cable);
 const Rdc=dcResistance(cable.conductor_size,cable.conductor_material,rating);
 const Yc=skinEffect(cable.conductor_size);
 const dTd=dielectricRise(cable.voltage_rating);
 const comps=calcRcaComponents(cable,params,count,total);
 const Rca=comps.Rca;
 const amb=Math.max(Number.isFinite(params.earthTemp)?params.earthTemp:20,
                   isNaN(params.airTemp)?-Infinity:params.airTemp);
 const num=rating-(amb+dTd);
 const conductorFactor=cableCurrentCarryingConductors(cable);
 const ampacity=num<=0 || !Number.isFinite(Rdc) || Rdc<=0 || !Number.isFinite(Rca) || Rca<=0
   ? 0
   : Math.sqrt(num/(Rdc*(1+Yc)*Rca*conductorFactor));
 return {Rdc,Yc,deltaTd:dTd,Rcond:comps.Rcond,Rins:comps.Rins,Rduct:comps.Rduct,Rsoil:comps.Rsoil,Rca,ampacity,rating,conductorFactor};
}

function cableHeatLoss(cable,current=finiteNumber(cable?.est_load,0),rating=cableTemperatureRating(cable)){
 const Rdc=dcResistance(cable.conductor_size,cable.conductor_material,rating);
 if(!Number.isFinite(Rdc) || Rdc<=0) return 0;
 return current * current * Rdc * (1 + skinEffect(cable.conductor_size)) * cableCurrentCarryingConductors(cable);
}

function cableSelfThermalResistance(cable){
 try{
   const comps=conductorThermalResistance(cable);
   return comps.Rcond + comps.Rins;
 }catch(e){
   return 0;
 }
}

function cableConductorTemperature(cable,conduitTemp,current=finiteNumber(cable?.est_load,0)){
 const base=Number.isFinite(conduitTemp)?conduitTemp:20;
 return base + cableHeatLoss(cable,current) * cableSelfThermalResistance(cable);
}

function conduitTemperatureLimit(conduitId,cables){
 const ratings=cables
   .filter(c=>normalizeDuctbankId(c.conduit_id)===normalizeDuctbankId(conduitId))
   .map(cableTemperatureRating)
   .filter(r=>Number.isFinite(r) && r>0);
 return ratings.length?Math.min(...ratings):getConductorRating();
}

// Iterative ampacity search using Neher‑McGrath temps
// See docs/AMPACITY_METHOD.md#equation
async function calcFiniteAmpacity(cable, conduits, cables, params){
 const cd=conduits.find(d=>d.conduit_id===cable.conduit_id);
 if(!cd) return NaN;
 const rating=cableTemperatureRating(cable);
 const original=cable.est_load;
 let low=0;
 let high=Math.max(parseFloat(original)||1,1);
 let temp=Number.isFinite(params.earthTemp)?params.earthTemp:20;
 // increase upper bound until temperature exceeds rating or limit reached
 for(let i=0;i<6;i++){
   cable.est_load=high;
  const res=await solveDuctbankTemperaturesWorker(conduits,cables,params);
   const conduitTemp=res.conduitTemps[cable.conduit_id]??temp;
   temp=cableConductorTemperature(cable,conduitTemp,high);
   if(temp>=rating||high>=2000) break;
   low=high;
   high*=2;
 }
 for(let i=0;i<12;i++){
   const mid=(low+high)/2;
   cable.est_load=mid;
   const res=await solveDuctbankTemperaturesWorker(conduits,cables,params);
   const conduitTemp=res.conduitTemps[cable.conduit_id]??temp;
   temp=cableConductorTemperature(cable,conduitTemp,mid);
   if(Math.abs(temp-rating)<=0.5){
     low=high=mid;
     break;
   }
   if(temp>rating) high=mid; else low=mid;
 }
 cable.est_load=original;
 return (low+high)/2;
}

function updateAmpacityReport(scroll=false){
 if(checkInsulationThickness()){
   document.getElementById('ampacityReport').innerHTML='<div class="message warning">Enter insulation thickness for highlighted cables.</div>';
   return;
 }
 const earthF=parseFloat(document.getElementById('earthTemp').value);
 const airF=parseFloat(document.getElementById('airTemp').value);
 const params={
  earthTemp:isNaN(earthF)?20:fToC(earthF),
  airTemp:isNaN(airF)?NaN:fToC(airF),
  soilResistivity:parseFloat(document.getElementById('soilResistivity').value)||90,
  moistureContent:parseFloat(document.getElementById('moistureContent').value)||0,
  heatSources:document.getElementById('heatSources').checked,
  hSpacing:parseFloat(document.getElementById('hSpacing').value)||3,
  vSpacing:parseFloat(document.getElementById('vSpacing').value)||4,
  concreteEncasement:document.getElementById('concreteEncasement').checked,
  ductbankDepth:parseFloat(document.getElementById('ductbankDepth').value)||0,
  gridSize:parseInt(document.getElementById('gridRes').value)||20,
  ductThermRes:parseFloat(document.getElementById('ductThermRes').value)||0
 };
 const cables=getAllCables();
 if(cables.length===0){
  document.getElementById('ampacityReport').innerHTML='<div class="message warning">No cables found.</div>';
  return;
 }
 const total=cables.length;
 const countMap={};
 cables.forEach(c=>{countMap[c.conduit_id]=(countMap[c.conduit_id]||0)+1;});
 const rows=cables.map(c=>{
 const d=ampacityDetails(c,params,countMap[c.conduit_id],total);
 const neher=isFinite(d.ampacity)?d.ampacity.toFixed(0):'N/A';
 const finite=window.finiteAmpacity?window.finiteAmpacity[c.tag]||'N/A':'N/A';
 const load=parseFloat(c.est_load)||0;
 const neherNum=parseFloat(neher);
 const finiteNum=parseFloat(finite);
 const over=(isFinite(neherNum)&&load>neherNum) ||
             (isFinite(finiteNum)&&load>finiteNum);
 if(window.cableOverLimit) window.cableOverLimit[c.tag]=over;
 return `<tr class="${over?'over-limit-row':''}"><td>${escapeHtml(c.tag)}</td>`+
        `<td>${d.Rdc.toFixed(4)}</td><td>${d.Yc.toFixed(3)}</td><td>${d.deltaTd.toFixed(2)}</td>`+
        `<td>${d.Rcond.toFixed(3)}</td><td>${d.Rins.toFixed(3)}</td><td>${d.Rduct.toFixed(3)}</td>`+
        `<td>${d.Rsoil.toFixed(3)}</td><td>${d.Rca.toFixed(3)}</td>`+
        `<td>${d.rating.toFixed(0)}</td><td>${d.conductorFactor.toFixed(0)}</td>`+
        `<td>${neher}</td><td>${finite}</td><td>${over?'Yes':''}</td></tr>`;
}).join('');
document.getElementById('ampacityReport').innerHTML=
   `<div class="ampacity-container"><table class="db-table ampacity-table"><thead><tr>`+
   `<th>Cable</th><th>Rdc</th><th>Yc</th><th>&Delta;Td</th><th>Rcond</th><th>Rins</th><th>Rduct</th>`+
   `<th>Rsoil</th><th>Rca</th><th>Tc</th><th>Cond.</th><th>Neher (A)</th><th>Finite (A)</th><th>Over</th></tr>`+
   `</thead><tbody>${rows}</tbody></table></div>`;
 updateCableRowStyles();
 const det=document.getElementById('ampacityDetails');
 if(det){
  det.open=true;
  if(scroll) det.scrollIntoView({behavior:'smooth'});
 }
}

function updateCableRowStyles(){
 const rows=document.querySelectorAll('#cableTable tbody tr');
 rows.forEach(r=>{
  const tag=r.children[0]?.querySelector('input')?.value||'';
  if(window.cableOverLimit&&window.cableOverLimit[tag]) r.classList.add('over-limit-row');
  else r.classList.remove('over-limit-row');
 });
}

function formatDuctbankQuickValue(value, suffix = '', empty = 'Not provided'){
 const text=String(value ?? '').trim();
 return text ? `${text}${suffix}` : empty;
}

function formatDuctbankQuickNumber(value, digits = 2, suffix = '', empty = 'Not provided'){
 const num=parseFloat(value);
 if(!Number.isFinite(num)) return empty;
 return `${num.toFixed(digits)}${suffix}`;
}

function ductbankCableByTag(tag){
 const needle=normalizeDuctbankId(tag);
 return getAllCables().find(cable=>normalizeDuctbankId(cable.tag)===needle) || null;
}

function ductbankCableRowByTag(tag){
 const needle=normalizeDuctbankId(tag);
 return Array.from(document.querySelectorAll('#cableTable tbody tr')).find(row=>{
   const value=row.children[0]?.querySelector('input')?.value;
   return normalizeDuctbankId(value)===needle;
 }) || null;
}

function ductbankCableFillStatus(cable){
 const fill=fillResults()[cable.conduit_id];
 if(!fill) return { label:'No conduit fill data', detail:'Assign this cable to an existing conduit.', tone:'warning' };
 const count=fill.cables.length || 0;
 const limit=conduitFillLimit(count);
 const fillPct=Number.isFinite(fill.fillPct) ? fill.fillPct : 0;
 const tone=fillPct > limit ? 'error' : fillPct > limit * 0.8 ? 'warning' : 'success';
 return {
   label:`${fillPct.toFixed(1)}% fill`,
   detail:`${cable.conduit_id} limit ${limit}% with ${count} cable${count === 1 ? '' : 's'}`,
   tone
 };
}

function ductbankCableAmpacityStatus(cable){
 if(window.cableOverLimit && Object.prototype.hasOwnProperty.call(window.cableOverLimit,cable.tag)){
   return window.cableOverLimit[cable.tag]
     ? { label:'Ampacity warning', detail:'Estimated load exceeds an available ampacity estimate.', tone:'error' }
     : { label:'Ampacity OK', detail:'Estimated load is within available ampacity estimates.', tone:'success' };
 }
 return { label:'Ampacity not calculated', detail:'Run thermal analysis or refresh ampacity estimates for more detail.', tone:'neutral' };
}

function cablePopoverMetric(label, value){
 return `<div class="ductbank-cable-popover-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function cablePopoverStatus(status){
 return `<div class="ductbank-cable-popover-status ductbank-cable-popover-status--${escapeHtml(status.tone)}"><strong>${escapeHtml(status.label)}</strong><span>${escapeHtml(status.detail)}</span></div>`;
}

function positionDuctbankCablePopover(popover, point){
 const wrapper=document.getElementById('gridWrapper');
 if(!wrapper) return;
 const rect=wrapper.getBoundingClientRect();
 const offset=14;
 const rawLeft=point.clientX-rect.left+wrapper.scrollLeft+offset;
 const rawTop=point.clientY-rect.top+wrapper.scrollTop+offset;
 const maxLeft=wrapper.scrollLeft+wrapper.clientWidth-popover.offsetWidth-12;
 const maxTop=wrapper.scrollTop+wrapper.clientHeight-popover.offsetHeight-12;
 popover.style.left=`${Math.max(wrapper.scrollLeft+8,Math.min(rawLeft,maxLeft))}px`;
 popover.style.top=`${Math.max(wrapper.scrollTop+8,Math.min(rawTop,maxTop))}px`;
}

function renderDuctbankCablePopover(cable, point){
 const popover=document.getElementById('ductbank-cable-popover');
 if(!popover) return;
 const fillStatus=ductbankCableFillStatus(cable);
 const ampacityStatus=ductbankCableAmpacityStatus(cable);
 popover.innerHTML=`
  <div class="ductbank-cable-popover-header">
   <div>
    <span>Selected cable</span>
    <strong>${escapeHtml(cable.tag || 'Cable')}</strong>
   </div>
   <button type="button" class="row-icon-btn ductbank-cable-popover-close" data-ductbank-cable-popover-action="close" aria-label="Close cable quick properties">x</button>
  </div>
  <div class="ductbank-cable-popover-grid">
   ${cablePopoverMetric('Type',formatDuctbankQuickValue(cable.cable_type))}
   ${cablePopoverMetric('Conduit',formatDuctbankQuickValue(cable.conduit_id,'','Unassigned'))}
   ${cablePopoverMetric('Diameter',formatDuctbankQuickNumber(cable.diameter,2,' in'))}
   ${cablePopoverMetric('Conductors',formatDuctbankQuickValue(cable.conductors))}
   ${cablePopoverMetric('Size',formatDuctbankQuickValue(cable.conductor_size))}
   ${cablePopoverMetric('Load',formatDuctbankQuickNumber(cable.est_load,0,' A'))}
   ${cablePopoverMetric('Insulation',formatDuctbankQuickValue(cable.insulation_type))}
   ${cablePopoverMetric('Rating',formatDuctbankQuickValue(cable.insulation_rating,' C'))}
  </div>
  <div class="ductbank-cable-popover-statuses">
   ${cablePopoverStatus(fillStatus)}
   ${cablePopoverStatus(ampacityStatus)}
  </div>
  <div class="ductbank-cable-popover-actions">
   <button type="button" class="btn toolbar-btn" data-ductbank-cable-popover-action="find-row">Find row</button>
  </div>
 `;
 popover.hidden=false;
 requestAnimationFrame(()=>positionDuctbankCablePopover(popover,point));
}

function syncDuctbankCableSelection(){
 const tag=normalizeDuctbankId(selectedDuctbankCableTag);
 let found=false;
 document.querySelectorAll('.ductbank-cable-marker').forEach(marker=>{
   const selected=normalizeDuctbankId(marker.dataset.ductbankCableTag)===tag && tag;
   marker.classList.toggle('is-selected',Boolean(selected));
   marker.setAttribute('aria-pressed',String(Boolean(selected)));
   if(selected) found=true;
 });
 if(tag && !found) hideDuctbankCablePopover();
}

function selectDuctbankCable(tag, point){
 const normalized=normalizeDuctbankId(tag);
 const cable=ductbankCableByTag(normalized);
 if(!cable) return;
 selectedDuctbankCableTag=normalized;
 syncDuctbankCableSelection();
 renderDuctbankCablePopover(cable,point);
}

function hideDuctbankCablePopover({ clearSelection = true } = {}){
 const popover=document.getElementById('ductbank-cable-popover');
 if(popover){
   popover.hidden=true;
   popover.innerHTML='';
 }
 if(clearSelection){
   selectedDuctbankCableTag='';
   syncDuctbankCableSelection();
 }
}

function focusDuctbankCableRow(tag){
 const row=ductbankCableRowByTag(tag);
 if(!row) return;
 clearDuctbankFilters('all');
 document.querySelectorAll('#cableTable tbody tr').forEach(tr=>tr.classList.remove('ductbank-row-selected'));
 row.classList.add('ductbank-row-selected');
 row.scrollIntoView({behavior:'smooth',block:'center'});
 const first=row.querySelector('input,select,button');
 if(first){
   first.focus();
   if(typeof first.select==='function') first.select();
 }
 setTimeout(()=>row.classList.remove('ductbank-row-selected'),3500);
}

function initDuctbankCablePopover(){
 const svg=document.getElementById('grid');
 const popover=document.getElementById('ductbank-cable-popover');
 if(!svg || !popover) return;
 svg.addEventListener('click',event=>{
   const marker=event.target.closest('[data-ductbank-cable-tag]');
   if(!marker || !svg.contains(marker)) return;
   event.preventDefault();
   event.stopPropagation();
   selectDuctbankCable(marker.dataset.ductbankCableTag,{clientX:event.clientX,clientY:event.clientY});
 });
 svg.addEventListener('keydown',event=>{
   if(event.key!=='Enter' && event.key!==' ') return;
   const marker=event.target.closest('[data-ductbank-cable-tag]');
   if(!marker || !svg.contains(marker)) return;
   event.preventDefault();
   const rect=marker.getBoundingClientRect();
   selectDuctbankCable(marker.dataset.ductbankCableTag,{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2});
 });
 popover.addEventListener('click',event=>{
   const action=event.target.closest('[data-ductbank-cable-popover-action]')?.dataset.ductbankCablePopoverAction;
   if(!action) return;
   event.stopPropagation();
   if(action==='close') hideDuctbankCablePopover();
   if(action==='find-row'){
     focusDuctbankCableRow(selectedDuctbankCableTag);
     hideDuctbankCablePopover({clearSelection:false});
   }
 });
 document.addEventListener('click',event=>{
   if(event.target.closest('#ductbank-cable-popover,[data-ductbank-cable-tag]')) return;
   hideDuctbankCablePopover();
 });
 document.addEventListener('keydown',event=>{
   if(event.key==='Escape') hideDuctbankCablePopover();
 });
}

const DUCTBANK_DRAWING_MARGIN=20;
const DUCTBANK_DRAWING_SCALE=40;
const DUCTBANK_SKY_HEIGHT=64;

function appendDuctbankSvgElement(parent, tag, attrs={}, text=''){
 const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
 Object.entries(attrs).forEach(([key,value])=>{
   if(value!==undefined && value!==null) el.setAttribute(key,String(value));
 });
 if(text) el.textContent=text;
 parent.appendChild(el);
 return el;
}

function formatDuctbankDepthCallout(value){
 const depth=finiteNumber(value,0);
 if(depth <= 0) return 'At grade';
 return `${Math.round(depth * 10) / 10} in`;
}

function showDuctbankEarthContext(){
 return document.getElementById('showEarthContext')?.checked !== false;
}

function ductbankDrawingContext(scale=DUCTBANK_DRAWING_SCALE){
 const depthIn=Math.max(0,finiteNumber(document.getElementById('ductbankDepth')?.value,0));
 const showContext=showDuctbankEarthContext();
 const skyHeight=showContext ? DUCTBANK_SKY_HEIGHT : 0;
 const gradeY=skyHeight;
 const soilPad=showContext ? depthIn * scale : 0;
 const ductTopY=showContext ? gradeY + soilPad : DUCTBANK_DRAWING_MARGIN;
 return { depthIn, showContext, skyHeight, gradeY, soilPad, sideSoilPx:soilPad, bottomSoilPx:soilPad, ductTopY };
}

function drawDuctbankSoilContext(svg, defs, options){
 const { width, height, originX, originY, gradeY, ductWidth, ductHeight, scale, showContext } = options;
 const skyGradient=appendDuctbankSvgElement(defs,'linearGradient',{
   id:'ductbank-sky-gradient',
   x1:'0%',
   y1:'0%',
   x2:'0%',
   y2:'100%'
 });
 appendDuctbankSvgElement(skyGradient,'stop',{offset:'0%', 'stop-color':'#dbeafe'});
 appendDuctbankSvgElement(skyGradient,'stop',{offset:'100%', 'stop-color':'#eff6ff'});

 const soilPattern=appendDuctbankSvgElement(defs,'pattern',{
   id:'ductbank-soil-pattern',
   width:28,
   height:22,
   patternUnits:'userSpaceOnUse'
 });
 appendDuctbankSvgElement(soilPattern,'rect',{x:0,y:0,width:28,height:22,fill:'#f7efdf'});
 appendDuctbankSvgElement(soilPattern,'path',{
   d:'M2 16 C7 12 11 20 17 14 S25 12 28 17',
   fill:'none',
   stroke:'#d4b985',
   'stroke-width':1,
   'stroke-opacity':0.55
 });
 appendDuctbankSvgElement(soilPattern,'circle',{cx:8,cy:7,r:1.2,fill:'#b7935a','fill-opacity':0.45});
 appendDuctbankSvgElement(soilPattern,'circle',{cx:21,cy:5,r:1,fill:'#b7935a','fill-opacity':0.35});
 appendDuctbankSvgElement(soilPattern,'circle',{cx:24,cy:17,r:1.3,fill:'#b7935a','fill-opacity':0.32});

 const marker=appendDuctbankSvgElement(defs,'marker',{
   id:'ductbank-dim-arrow',
   viewBox:'0 0 8 8',
   refX:4,
   refY:4,
   markerWidth:6,
   markerHeight:6,
   orient:'auto-start-reverse'
 });
 appendDuctbankSvgElement(marker,'path',{d:'M0 0 L8 4 L0 8 Z',fill:'#334155'});

 if(showContext){
   appendDuctbankSvgElement(svg,'rect',{
     x:0,
     y:0,
     width,
     height:gradeY,
     fill:'url(#ductbank-sky-gradient)',
     class:'ductbank-sky-backdrop'
   });

   appendDuctbankSvgElement(svg,'rect',{
     x:0,
     y:gradeY,
     width,
     height:Math.max(0,height-gradeY),
     fill:'url(#ductbank-soil-pattern)',
     class:'ductbank-soil-backdrop'
   });

   appendDuctbankSvgElement(svg,'rect',{
     x:0,
     y:gradeY-3,
     width,
     height:6,
     class:'ductbank-grade-surface'
   });
 }else{
   appendDuctbankSvgElement(svg,'rect',{
     x:0,
     y:0,
     width,
     height,
     fill:'#ffffff',
     class:'ductbank-no-context-backdrop'
   });
 }

 appendDuctbankSvgElement(svg,'rect',{
   x:originX,
   y:originY,
   width:ductWidth*scale,
   height:ductHeight*scale,
   fill:document.getElementById('concreteEncasement')?.checked ? '#d9dde3' : '#f8fafc',
   'fill-opacity':document.getElementById('concreteEncasement')?.checked ? 0.92 : 0.76,
   class:'ductbank-envelope-fill'
 });
}

function drawDuctbankGradeCallout(svg, options){
 const {
   width,
   height,
   originX,
   originY,
   gradeY,
   ductWidth,
   scale,
   depthIn,
   utilHeatmap: showLegend=false
 } = options;
 const group=appendDuctbankSvgElement(svg,'g',{class:'ductbank-grade-callout-layer'});
 appendDuctbankSvgElement(group,'line',{
   x1:0,
   x2:width,
   y1:gradeY,
   y2:gradeY,
   class:'ductbank-grade-line',
   stroke:'#7c5f2f',
   'stroke-width':2
 });
 appendDuctbankSvgElement(group,'text',{
   x:originX,
   y:gradeY-6,
   class:'ductbank-grade-label',
   fill:'#334155',
   'font-size':10,
   'font-weight':800
 },'GRADE / GROUND LEVEL');
 appendDuctbankSvgElement(group,'text',{
   x:Math.max(originX, width - 62),
   y:Math.max(16, gradeY/2 + 4),
   class:'ductbank-sky-label',
   fill:'#1e3a8a',
   'font-size':10,
   'font-weight':800
 },'Sky');

 const ductTopY=originY;
 const coverPx=Math.max(0, ductTopY - gradeY);
 const dimX=Math.max(8,originX-10);
 appendDuctbankSvgElement(group,'line',{
   x1:dimX,
   x2:dimX,
   y1:gradeY,
   y2:ductTopY,
   class:'ductbank-dimension-line',
   stroke:'#334155',
   'stroke-width':1.4,
   'marker-start':'url(#ductbank-dim-arrow)',
   'marker-end':'url(#ductbank-dim-arrow)'
 });
 appendDuctbankSvgElement(group,'line',{
   x1:dimX-5,
   x2:originX,
   y1:gradeY,
   y2:gradeY,
   class:'ductbank-dimension-extension',
   stroke:'#334155',
   'stroke-width':1.4
 });
 appendDuctbankSvgElement(group,'line',{
   x1:dimX-5,
   x2:originX,
   y1:ductTopY,
   y2:ductTopY,
   class:'ductbank-dimension-extension',
   stroke:'#334155',
   'stroke-width':1.4
 });

 const labelWidth=190;
 const labelX=Math.max(originX + 44, Math.min(width-labelWidth-12, originX + Math.max(120, ductWidth*scale*0.18)));
 const labelY=coverPx >= 90
   ? Math.min(ductTopY - 20, gradeY + Math.max(58, coverPx*0.08))
   : Math.max(gradeY + 54, ductTopY + 44);
 appendDuctbankSvgElement(group,'path',{
   d:`M${dimX + 4} ${Math.min(ductTopY - 6, gradeY + Math.max(20, coverPx*0.18))} L${labelX - 10} ${labelY - 6}`,
   class:'ductbank-dimension-leader',
   stroke:'#334155',
   'stroke-width':1.4,
   fill:'none'
 });
 appendDuctbankSvgElement(group,'rect',{
   x:labelX - 8,
   y:labelY - 18,
   width:labelWidth + 14,
   height:28,
   rx:5,
   class:'ductbank-depth-callout-bg',
   fill:'#ffffff',
   'fill-opacity':0.98,
   stroke:'#94a3b8'
 });
 appendDuctbankSvgElement(group,'text',{
   x:labelX,
   y:labelY,
   class:'ductbank-depth-callout',
   fill:'#0f172a',
   'font-size':13,
   'font-weight':800
 },`Elevation to grade: ${formatDuctbankDepthCallout(depthIn)}`);
 appendDuctbankSvgElement(group,'text',{
   x:Math.max(originX, width - 118),
   y:Math.min(height - (showLegend ? 72 : 12), gradeY + 28),
   class:'ductbank-soil-label',
   fill:'#334155',
   'font-size':10,
   'font-weight':800
 },'Native soil');
}

function drawGrid(){
 const svg=document.getElementById('grid');
 const heat=document.getElementById('tempCanvas');
 const overlay=document.getElementById('tempOverlay');
 if(heat){const ctx=heat.getContext('2d');ctx.clearRect(0,0,heat.width,heat.height);}
 if(overlay){const octx=overlay.getContext('2d');octx.clearRect(0,0,overlay.width,overlay.height);}
 svg.innerHTML='';
 const oldLegend=document.getElementById('fillLegend');
 if(oldLegend) oldLegend.remove();
 autoPlaceConduits();
 const conduits=getAllConduits();
 if(conduits.length===0){
  hideDuctbankCablePopover();
  return;
 }
 const topPad=parseFloat(document.getElementById('topPad').value)||0;
 const bottomPad=parseFloat(document.getElementById('bottomPad').value)||0;
 const leftPad=parseFloat(document.getElementById('leftPad').value)||0;
 const rightPad=parseFloat(document.getElementById('rightPad').value)||0;
const margin=DUCTBANK_DRAWING_MARGIN;
const scale=DUCTBANK_DRAWING_SCALE; // pixels per inch
const { depthIn, showContext, gradeY, ductTopY, sideSoilPx, bottomSoilPx } = ductbankDrawingContext(scale);
const originX=margin + sideSoilPx;
const originY=ductTopY;
const fillMap=fillResults();
const cableLegendEntries=[];
const seenCableTags=new Set();
conduits.forEach(conduit=>{
  const data=fillMap[conduit.conduit_id];
  (data?.cables||[]).forEach(cable=>{
    if(!cable?.tag || seenCableTags.has(cable.tag))return;
    seenCableTags.add(cable.tag);
    cableLegendEntries.push({
      marker:cableLegendEntries.length+1,
      tag:cable.tag,
      diameter:Number(cable.diameter)||0,
      conduitId:conduit.conduit_id
    });
  });
});
const cableMarkerByTag=new Map(cableLegendEntries.map(entry=>[entry.tag,entry.marker]));
let maxX=0,maxY=0;
conduits.forEach(c=>{
  const Rin=Math.sqrt(CONDUIT_SPECS[c.conduit_type][c.trade_size]/Math.PI);
  maxX=Math.max(maxX,c.x+2*Rin);
  maxY=Math.max(maxY,c.y+2*Rin);
});
maxY+=topPad;
maxX+=rightPad;
const ductWidth=maxX;
const ductHeight=maxY;

let overallMaxX=ductWidth;
let overallMaxY=ductHeight;
if(document.getElementById('heatSources').checked){
  getAllHeatSources().forEach(h=>{
    const w=parseFloat(h.width)||0;
    const ht=parseFloat(h.height)||0;
    if((h.shape||'').toLowerCase()==='circle'){
      const r=Math.max(w,ht)/2;
      overallMaxX=Math.max(overallMaxX,(parseFloat(h.x)||0)+2*r);
      overallMaxY=Math.max(overallMaxY,(parseFloat(h.y)||0)+2*r);
    }else{
      overallMaxX=Math.max(overallMaxX,(parseFloat(h.x)||0)+w);
      overallMaxY=Math.max(overallMaxY,(parseFloat(h.y)||0)+ht);
    }
  });
}

const rightContextPx=showContext ? sideSoilPx : 0;
const bottomContextPx=showContext ? bottomSoilPx : margin;
const width=Math.round(Math.max(overallMaxX*scale+originX+rightContextPx+margin+80,360));
const cableLegendColumns=width>=620?2:1;
const cableLegendRows=Math.ceil(cableLegendEntries.length/cableLegendColumns);
const cableLegendHeight=cableLegendEntries.length?38+cableLegendRows*18:0;
const height=Math.round(overallMaxY*scale+originY+bottomContextPx+(utilHeatmap?60:20)+cableLegendHeight);
svg.setAttribute('width',width);
svg.setAttribute('height',height);

 const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
 svg.appendChild(defs);

 drawDuctbankSoilContext(svg, defs, {
   width,
   height,
   originX,
   originY,
   gradeY,
   ductWidth,
   ductHeight,
   scale,
   showContext
 });

 const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
 rect.setAttribute('x',originX);
 rect.setAttribute('y',originY);
 rect.setAttribute('width',ductWidth*scale);
 rect.setAttribute('height',ductHeight*scale);
 rect.setAttribute('fill','none');
 rect.setAttribute('stroke','#64748b');
 rect.setAttribute('stroke-dasharray','4 2');
 svg.appendChild(rect);

 if(document.getElementById('concreteEncasement')?.checked){
   const minimumCover=Math.min(topPad,bottomPad,leftPad,rightPad);
   const coverLabel=document.createElementNS('http://www.w3.org/2000/svg','text');
   coverLabel.setAttribute('x',originX+8);
   coverLabel.setAttribute('y',originY+16);
   coverLabel.setAttribute('font-size','10');
   coverLabel.setAttribute('font-weight','700');
   coverLabel.setAttribute('fill','#334155');
   coverLabel.textContent=`CONCRETE ENCASEMENT - ${minimumCover.toFixed(2)}\" MIN COVER`;
   svg.appendChild(coverLabel);
 }

 // overall dimension lines
 const widthY=originY+ductHeight*scale+15;
 const wStart=originX, wEnd=originX+ductWidth*scale;
 const widthLine=document.createElementNS('http://www.w3.org/2000/svg','line');
 widthLine.setAttribute('x1',wStart);
 widthLine.setAttribute('x2',wEnd);
 widthLine.setAttribute('y1',widthY);
 widthLine.setAttribute('y2',widthY);
 widthLine.setAttribute('stroke','black');
 svg.appendChild(widthLine);
 const tick1=document.createElementNS('http://www.w3.org/2000/svg','line');
 tick1.setAttribute('x1',wStart);
 tick1.setAttribute('x2',wStart);
 tick1.setAttribute('y1',widthY-4);
 tick1.setAttribute('y2',widthY+4);
 tick1.setAttribute('stroke','black');
 svg.appendChild(tick1);
 const tick2=document.createElementNS('http://www.w3.org/2000/svg','line');
 tick2.setAttribute('x1',wEnd);
 tick2.setAttribute('x2',wEnd);
 tick2.setAttribute('y1',widthY-4);
 tick2.setAttribute('y2',widthY+4);
 tick2.setAttribute('stroke','black');
 svg.appendChild(tick2);
const widthText=document.createElementNS('http://www.w3.org/2000/svg','text');
widthText.setAttribute('x',(wStart+wEnd)/2);
widthText.setAttribute('y',widthY-6);
widthText.setAttribute('font-size','10');
widthText.setAttribute('text-anchor','middle');
widthText.textContent=ductWidth.toFixed(2)+'"';
svg.appendChild(widthText);

 const tag=document.getElementById('ductbankTag').value.trim();
 if(tag){
   const tagText=document.createElementNS('http://www.w3.org/2000/svg','text');
   tagText.setAttribute('x',originX+ductWidth*scale/2);
   tagText.setAttribute('y',originY-4);
   tagText.setAttribute('font-size','14');
   tagText.setAttribute('text-anchor','middle');
   tagText.textContent=tag;
   svg.appendChild(tagText);
 }

 const heightX=originX+ductWidth*scale+15;
 const hStart=originY, hEnd=originY+ductHeight*scale;
 const heightLine=document.createElementNS('http://www.w3.org/2000/svg','line');
 heightLine.setAttribute('x1',heightX);
 heightLine.setAttribute('x2',heightX);
 heightLine.setAttribute('y1',hStart);
 heightLine.setAttribute('y2',hEnd);
 heightLine.setAttribute('stroke','black');
 svg.appendChild(heightLine);
 const hTick1=document.createElementNS('http://www.w3.org/2000/svg','line');
 hTick1.setAttribute('x1',heightX-4);
 hTick1.setAttribute('x2',heightX+4);
 hTick1.setAttribute('y1',hStart);
 hTick1.setAttribute('y2',hStart);
 hTick1.setAttribute('stroke','black');
 svg.appendChild(hTick1);
 const hTick2=document.createElementNS('http://www.w3.org/2000/svg','line');
 hTick2.setAttribute('x1',heightX-4);
 hTick2.setAttribute('x2',heightX+4);
 hTick2.setAttribute('y1',hEnd);
 hTick2.setAttribute('y2',hEnd);
 hTick2.setAttribute('stroke','black');
 svg.appendChild(hTick2);
 const heightText=document.createElementNS('http://www.w3.org/2000/svg','text');
 heightText.setAttribute('x',heightX+6);
 heightText.setAttribute('y',(hStart+hEnd)/2);
 heightText.setAttribute('font-size','10');
 heightText.setAttribute('text-anchor','start');
 heightText.setAttribute('dominant-baseline','middle');
heightText.textContent=ductHeight.toFixed(2)+'"';
 svg.appendChild(heightText);

 conduits.forEach(c=>{
   const Rin=Math.sqrt(CONDUIT_SPECS[c.conduit_type][c.trade_size]/Math.PI);
   const R=Rin*scale;
   const cx=c.x*scale+R+originX;
   const cy=c.y*scale+R+originY;
  const data=fillMap[c.conduit_id];
  let color=utilHeatmap?'green':'lightgray';
  if(utilHeatmap && data){
    const count=data.cables.length;
    const limit=count===1?53:count===2?31:40;
    if(data.fillPct>limit)color='red';else if(data.fillPct>0.8*limit)color='yellow';
  }
   const clip=document.createElementNS('http://www.w3.org/2000/svg','clipPath');
   const clipId=`clip-${c.conduit_id}`;
   clip.setAttribute('id',clipId);
   const clipCircle=document.createElementNS('http://www.w3.org/2000/svg','circle');
   clipCircle.setAttribute('cx',cx);clipCircle.setAttribute('cy',cy);clipCircle.setAttribute('r',R);
   clip.appendChild(clipCircle);
   defs.appendChild(clip);
   if(data){
     const placed=packCircles(data.cables.map(cb=>({tag:cb.tag,r:cb.diameter/2})),Rin);
    placed.forEach(p=>{
       const cable=ductbankCableByTag(p.tag);
       const cableGroup=document.createElementNS('http://www.w3.org/2000/svg','g');
       cableGroup.classList.add('ductbank-cable-marker');
       cableGroup.dataset.ductbankCableTag=p.tag;
       cableGroup.setAttribute('role','button');
       cableGroup.setAttribute('tabindex','0');
       cableGroup.setAttribute('aria-pressed',String(normalizeDuctbankId(p.tag)===normalizeDuctbankId(selectedDuctbankCableTag)));
       cableGroup.setAttribute('aria-label',`Cable ${p.tag} in conduit ${c.conduit_id}. Select to view quick properties.`);
       cableGroup.setAttribute('clip-path',`url(#${clipId})`);
       const title=document.createElementNS('http://www.w3.org/2000/svg','title');
       title.textContent=cable
         ? `${p.tag}: ${formatDuctbankQuickValue(cable.cable_type)} cable in ${formatDuctbankQuickValue(cable.conduit_id,'','unassigned conduit')}`
         : `${p.tag}: cable in ${c.conduit_id}`;
       cableGroup.appendChild(title);
       const sc=document.createElementNS('http://www.w3.org/2000/svg','circle');
       sc.setAttribute('cx',cx+p.x*scale);
       sc.setAttribute('cy',cy+p.y*scale);
       sc.setAttribute('r',p.r*scale);
       sc.setAttribute('fill','lightblue');
       sc.setAttribute('stroke','black');
       sc.classList.add('ductbank-cable-shape');
       cableGroup.appendChild(sc);
       if(p.tag){
         const marker=String(cableMarkerByTag.get(p.tag)||'');
         const fs=Math.max(8,Math.min(13,p.r*scale*1.15));
         const text=document.createElementNS('http://www.w3.org/2000/svg','text');
         text.setAttribute('x',cx+p.x*scale);
         text.setAttribute('y',cy+p.y*scale);
         text.setAttribute('font-size',fs);
         text.setAttribute('font-weight','800');
         text.setAttribute('text-anchor','middle');
         text.setAttribute('dominant-baseline','middle');
         text.classList.add('ductbank-cable-label');
         text.textContent=marker;
         cableGroup.appendChild(text);
       }
       svg.appendChild(cableGroup);
     });
   }
   const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
   circle.setAttribute('cx',cx);circle.setAttribute('cy',cy);circle.setAttribute('r',R);
  circle.setAttribute('fill',color);
  circle.setAttribute('fill-opacity',utilHeatmap?'0.4':'0.0');
   circle.setAttribute('stroke','black');
  circle.setAttribute('pointer-events','stroke');
  if(data){
    const names=data.cables.map(c=>c.tag).join(', ');
    circle.setAttribute('title',`${c.conduit_id}: ${data.fillPct.toFixed(1)}% - ${names}`);
  }
  svg.appendChild(circle);
  const cidText=document.createElementNS('http://www.w3.org/2000/svg','text');
  cidText.setAttribute('x',cx);
  cidText.setAttribute('y',cy-R-22);
  cidText.setAttribute('font-size','10');
  cidText.setAttribute('text-anchor','middle');
  cidText.textContent=c.conduit_id;
  svg.appendChild(cidText);
  const typeText=document.createElementNS('http://www.w3.org/2000/svg','text');
  typeText.setAttribute('x',cx);
  typeText.setAttribute('y',cy-R-10);
  typeText.setAttribute('font-size','8');
  typeText.setAttribute('text-anchor','middle');
  typeText.textContent=`${c.conduit_type} ${c.trade_size}\"`;
  svg.appendChild(typeText);
});

if(cableLegendEntries.length){
  const legendX=originX;
  const legendY=height-cableLegendHeight+8;
  const legendWidth=Math.max(260,width-originX-margin);
  const legendPanel=document.createElementNS('http://www.w3.org/2000/svg','rect');
  legendPanel.setAttribute('x',legendX-6);
  legendPanel.setAttribute('y',legendY-4);
  legendPanel.setAttribute('width',legendWidth+6);
  legendPanel.setAttribute('height',cableLegendHeight-8);
  legendPanel.setAttribute('rx','4');
  legendPanel.setAttribute('fill','#ffffff');
  legendPanel.setAttribute('fill-opacity','0.96');
  legendPanel.setAttribute('stroke','#94a3b8');
  svg.appendChild(legendPanel);
  const legendTitle=document.createElementNS('http://www.w3.org/2000/svg','text');
  legendTitle.setAttribute('x',legendX);
  legendTitle.setAttribute('y',legendY+10);
  legendTitle.setAttribute('font-size','10');
  legendTitle.setAttribute('font-weight','800');
  legendTitle.setAttribute('fill','#0f172a');
  legendTitle.textContent='CABLE IDENTIFICATION (marker - cable tag - outside diameter - conduit)';
  svg.appendChild(legendTitle);
  const columnWidth=legendWidth/cableLegendColumns;
  cableLegendEntries.forEach((entry,index)=>{
    const column=Math.floor(index/cableLegendRows);
    const row=index%cableLegendRows;
    const item=document.createElementNS('http://www.w3.org/2000/svg','text');
    item.setAttribute('x',legendX+column*columnWidth);
    item.setAttribute('y',legendY+29+row*18);
    item.setAttribute('font-size','10');
    item.setAttribute('fill','#0f172a');
    item.textContent=`${entry.marker} - ${entry.tag} - ${entry.diameter.toFixed(2)}\" - ${entry.conduitId}`;
    svg.appendChild(item);
  });
}

 if(document.getElementById('heatSources').checked){
   const heatSources=getAllHeatSources();
   heatSources.forEach(h=>{
     const x=parseFloat(h.x)||0;
     const y=parseFloat(h.y)||0;
     const w=parseFloat(h.width)||0;
     const ht=parseFloat(h.height)||0;
     const shape=(h.shape||'').toLowerCase();
     const color='orange';
     let hx=x*scale+originX;
     let hy=y*scale+originY;
     let wScaled=w*scale;
     let hScaled=ht*scale;
     if(shape==='circle'){
       const r=Math.max(w,ht)/2*scale;
       hx=x*scale+originX;
       hy=y*scale+originY;
       wScaled=hScaled=2*r;
       const cx=hx+r;
       const cy=hy+r;
       const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
       c.setAttribute('cx',cx);
       c.setAttribute('cy',cy);
       c.setAttribute('r',r);
       c.setAttribute('fill','none');
       c.setAttribute('stroke',color);
       c.setAttribute('stroke-dasharray','4 2');
       svg.appendChild(c);
       if(h.temperature){
         const t=document.createElementNS('http://www.w3.org/2000/svg','text');
         t.setAttribute('x',cx);
         t.setAttribute('y',cy);
         t.setAttribute('font-size','10');
         t.setAttribute('text-anchor','middle');
         t.setAttribute('dominant-baseline','middle');
         t.textContent=h.temperature;
         svg.appendChild(t);
       }
       if(h.tag){
         const tagText=document.createElementNS('http://www.w3.org/2000/svg','text');
         tagText.setAttribute('x',cx);
         // place the tag inside the circle above the temperature value
         tagText.setAttribute('y',cy - r/2);
         tagText.setAttribute('font-size','10');
         tagText.setAttribute('text-anchor','middle');
         tagText.setAttribute('dominant-baseline','middle');
         tagText.textContent=h.tag;
         svg.appendChild(tagText);
       }
     }else{
       const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
       rect.setAttribute('x',hx);
       rect.setAttribute('y',hy);
       rect.setAttribute('width',wScaled);
       rect.setAttribute('height',hScaled);
       rect.setAttribute('fill','none');
       rect.setAttribute('stroke',color);
       rect.setAttribute('stroke-dasharray','4 2');
       svg.appendChild(rect);
       if(h.temperature){
         const t=document.createElementNS('http://www.w3.org/2000/svg','text');
         t.setAttribute('x',hx+wScaled/2);
         t.setAttribute('y',hy+hScaled/2);
         t.setAttribute('font-size','10');
         t.setAttribute('text-anchor','middle');
         t.setAttribute('dominant-baseline','middle');
         t.textContent=h.temperature;
         svg.appendChild(t);
       }
       if(h.tag){
         const tagText=document.createElementNS('http://www.w3.org/2000/svg','text');
         tagText.setAttribute('x',hx+wScaled/2);
         // place the tag inside the rectangle above the temperature value
         tagText.setAttribute('y',hy+hScaled/2-6);
         tagText.setAttribute('font-size','10');
         tagText.setAttribute('text-anchor','middle');
         tagText.setAttribute('dominant-baseline','middle');
         tagText.textContent=h.tag;
         svg.appendChild(tagText);
       }
     }
     const rightEdge=originX+ductWidth*scale;
    const bottomEdge=originY+ductHeight*scale;
    const topEdge=originY;
    // horizontal dimension
     const dx=x-ductWidth;
     const lineH=document.createElementNS('http://www.w3.org/2000/svg','line');
     lineH.setAttribute('x1',rightEdge);
     lineH.setAttribute('x2',hx);
     lineH.setAttribute('y1',hy+hScaled/2);
     lineH.setAttribute('y2',hy+hScaled/2);
     lineH.setAttribute('stroke','black');
     svg.appendChild(lineH);
     const ht1=document.createElementNS('http://www.w3.org/2000/svg','line');
     ht1.setAttribute('x1',rightEdge);
     ht1.setAttribute('x2',rightEdge);
     ht1.setAttribute('y1',hy+hScaled/2-4);
     ht1.setAttribute('y2',hy+hScaled/2+4);
     ht1.setAttribute('stroke','black');
     svg.appendChild(ht1);
     const ht2=document.createElementNS('http://www.w3.org/2000/svg','line');
     ht2.setAttribute('x1',hx);
     ht2.setAttribute('x2',hx);
     ht2.setAttribute('y1',hy+hScaled/2-4);
     ht2.setAttribute('y2',hy+hScaled/2+4);
     ht2.setAttribute('stroke','black');
     svg.appendChild(ht2);
     const textH=document.createElementNS('http://www.w3.org/2000/svg','text');
     textH.setAttribute('x',(rightEdge+hx)/2);
     textH.setAttribute('y',hy+hScaled/2-6);
     textH.setAttribute('font-size','10');
     textH.setAttribute('text-anchor','middle');
     textH.textContent=Math.max(0,dx).toFixed(2)+'"';
     svg.appendChild(textH);

    // vertical dimension from top of ductbank
    const dy=y;
    const lineV=document.createElementNS('http://www.w3.org/2000/svg','line');
    lineV.setAttribute('x1',hx+wScaled/2);
    lineV.setAttribute('x2',hx+wScaled/2);
    lineV.setAttribute('y1',topEdge);
    lineV.setAttribute('y2',hy);
     lineV.setAttribute('stroke','black');
     svg.appendChild(lineV);
     const vt1=document.createElementNS('http://www.w3.org/2000/svg','line');
    vt1.setAttribute('x1',hx+wScaled/2-4);
    vt1.setAttribute('x2',hx+wScaled/2+4);
    vt1.setAttribute('y1',topEdge);
    vt1.setAttribute('y2',topEdge);
     vt1.setAttribute('stroke','black');
     svg.appendChild(vt1);
     const vt2=document.createElementNS('http://www.w3.org/2000/svg','line');
     vt2.setAttribute('x1',hx+wScaled/2-4);
     vt2.setAttribute('x2',hx+wScaled/2+4);
     vt2.setAttribute('y1',hy);
     vt2.setAttribute('y2',hy);
     vt2.setAttribute('stroke','black');
     svg.appendChild(vt2);
    const textV=document.createElementNS('http://www.w3.org/2000/svg','text');
    textV.setAttribute('x',hx+wScaled/2+6);
    textV.setAttribute('y',(topEdge+hy)/2);
    textV.setAttribute('font-size','10');
    textV.setAttribute('text-anchor','start');
    textV.setAttribute('dominant-baseline','middle');
    textV.textContent=Math.abs(dy).toFixed(2)+'"';
     svg.appendChild(textV);
   });
 }
 if(showContext){
   drawDuctbankGradeCallout(svg, {
     width,
     height,
     originX,
     originY,
     gradeY,
     ductWidth,
     scale,
     depthIn,
     utilHeatmap
   });
 }
 if(utilHeatmap){
   addFillLegend(svg, originX, overallMaxY*scale+originY+20);
 }
svg.style.background=showContext ? '#f7efdf' : '#ffffff';
if(heat){
  heat.width=width;
  heat.height=height;
  heat.style.width=width+'px';
  heat.style.height=height+'px';
}
if(overlay){
  overlay.width=width;
  overlay.height=height;
  overlay.style.width=width+'px';
  overlay.style.height=height+'px';
}
const heatMeta=window.lastHeatGridMeta || {};
if(heatVisible && window.lastHeatGrid && heatMeta.width===width && heatMeta.height===height && heatMeta.originX===originX && heatMeta.originY===originY && heatMeta.showContext===showContext){
  drawHeatMap(window.lastHeatGrid, window.lastConduitTemps || {}, conduits, window.lastAmbient||0);
}else if(heatVisible){
  if(heat) heat.style.display='none';
  if(overlay) overlay.style.display='none';
}
syncDuctbankCableSelection();
}

function addFillLegend(svg,x,y){
  const legend=document.createElementNS('http://www.w3.org/2000/svg','g');
  legend.setAttribute('id','fillLegend');
  legend.setAttribute('transform',`translate(${x},${y})`);
  const entries=[
    {color:'green',text:'\u226480%'},
    {color:'yellow',text:'80-100%'},
    {color:'red',text:'>100%'}
  ];
  entries.forEach((e,i)=>{
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('transform',`translate(${i*80},0)`);
    const r=document.createElementNS('http://www.w3.org/2000/svg','rect');
    r.setAttribute('width',20);r.setAttribute('height',20);r.setAttribute('fill',e.color);
    g.appendChild(r);
    const t=document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x',25);t.setAttribute('y',15);t.setAttribute('font-size','12');
    t.textContent=e.text;
    g.appendChild(t);
    legend.appendChild(g);
  });
  svg.appendChild(legend);
}

function checkInsulationThickness(){
  let missing=false;
  document.querySelectorAll('#cableTable tbody tr').forEach(tr=>{
    const td=tr.children[5];
    const inp=td?.querySelector('input');
    if(!inp) return;
    const val=parseFloat(inp.value);
    if(!isFinite(val) || val<=0){
      td.classList.add('missing-value');
      missing=true;
    }else{
      td.classList.remove('missing-value');
    }
  });
  return missing;
}

function validateThermalInputs(){
  const warnings=[];
  const soilEl=document.getElementById('soilResistivity');
  let soil=parseFloat(soilEl.value);
  if(isFinite(soil)){
    let min=40, max=150;
    if(Array.isArray(window.SOIL_RESISTIVITY_OPTIONS) && window.SOIL_RESISTIVITY_OPTIONS.length){
      min=Math.min(...SOIL_RESISTIVITY_OPTIONS);
      max=Math.max(...SOIL_RESISTIVITY_OPTIONS);
    }
    if(soil<min||soil>max){
      warnings.push(`Soil resistivity ${soil} is outside ${min}-${max} \xB0C\xB7cm/W typical range.`);
    }
  }
  const depthEl=document.getElementById('ductbankDepth');
  let depth=parseFloat(depthEl.value);
  if(isFinite(depth)){
    if(depth>120){
      warnings.push('Ductbank depth capped at 120 in (10 ft).');
      depthEl.value=120;
    }else if(depth<0){
      warnings.push('Ductbank depth cannot be negative.');
      depthEl.value=0;
    }
  }
  const hEl=document.getElementById('hSpacing');
  let h=parseFloat(hEl.value);
  if(isFinite(h)){
    if(h>24){warnings.push('Horiz spacing capped at 24 in.');hEl.value=24;}
    else if(h<1){warnings.push('Horiz spacing raised to 1 in.');hEl.value=1;}
  }
  const vEl=document.getElementById('vSpacing');
  let v=parseFloat(vEl.value);
  if(isFinite(v)){
    if(v>24){warnings.push('Vert spacing capped at 24 in.');vEl.value=24;}
    else if(v<1){warnings.push('Vert spacing raised to 1 in.');vEl.value=1;}
  }
  if(checkInsulationThickness()){
    warnings.push('Enter insulation thickness for all cables.');
  }
  if(document.getElementById('heatSources')?.checked){
    const heatRows=getAllHeatSources({ includeIncomplete:true });
    const incompleteCount=heatRows.filter(src=>!isCompleteHeatSource(src)).length;
    if(incompleteCount){
      warnings.push(`${incompleteCount} incomplete heat source row${incompleteCount===1?' is':'s are'} ignored. Enter positive width/height, temperature, X, and Y values.`);
    }
  }
  document.querySelectorAll('#cableTable tbody tr').forEach(tr=>{
    const loadCell=tr.children[7];
    if(!loadCell)return;
    const inp=loadCell.querySelector('input');
    if(!inp)return;
    let val=parseFloat(inp.value);
    const tagCell=tr.children[0];
    const tag=tagCell?tagCell.querySelector('input')?.value||'Cable':'Cable';
    if(isFinite(val)){
      if(val>2000){warnings.push(`${tag} load capped at 2000 A.`);inp.value=2000;}
      else if(val<0){warnings.push(`${tag} load cannot be negative.`);inp.value=0;}
    }
  });
 const Tc=getConductorRating();
 document.querySelectorAll('#cableTable tbody tr').forEach(tr=>{
   const tag=tr.children[0]?.querySelector('input')?.value||'Cable';
   const type=tr.children[10]?.querySelector('select')?.value||'';
   const rateEl=tr.children[11]?.querySelector('select,input');
   const rating=parseFloat(rateEl?.value);
   const typeRating=INSULATION_TEMP_LIMIT[(type||'').toUpperCase()];
   if(isFinite(rating)&&rating!==Tc){
     warnings.push(`${tag} rating ${rating}\u00B0C does not match ${Tc}\u00B0C.`);
   }else if(typeRating!==undefined&&typeRating!==Tc){
     warnings.push(`${tag} insulation ${type} rated ${typeRating}\u00B0C differs from ${Tc}\u00B0C.`);
   }
 });
 const warnEl=document.getElementById('warning-area');
 if(warnEl){
   if(warnings.length){
     warnEl.innerHTML=`<div class="message warning"><ul>${warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`;
     warnEl.style.display='block';
   }else{
     warnEl.innerHTML='';
     warnEl.style.display='none';
   }
 }
}

function validateSoilResistivity(){
  const el=document.getElementById('soilResistivity');
  const warn=document.getElementById('soilWarning');
  if(!el||!warn) return;
  let val=parseFloat(el.value);
  const min=40, max=150;
  if(isNaN(val)){
    warn.textContent='Enter a numeric value.';
    warn.style.display='block';
    return;
  }
  if(val < min || val > max){
    warn.textContent=`Value outside ${min}-${max} \u00B0C\u00B7cm/W typical range.`;
    warn.style.display='block';
  }else{
    warn.style.display='none';
  }
}

function validateMoistureContent(){
  const el=document.getElementById('moistureContent');
  const warn=document.getElementById('moistureWarning');
  if(!el||!warn) return;
  let val=parseFloat(el.value);
  const min=0, max=40;
  if(isNaN(val)){
    warn.textContent='Enter a numeric value.';
    warn.style.display='block';
    return;
  }
  if(val<min){
    warn.textContent=`Value raised to ${min}%.`;
    val=min;
  }else if(val>max){
    warn.textContent=`Value reduced to ${max}%.`;
    val=max;
  }else{
    warn.style.display='none';
  }
  el.value=val;
}

function solveDuctbankTemperatures(conduits,cables,params,progress){
  const svg=document.getElementById('grid');
  const width=Math.round(parseFloat(svg.getAttribute('width'))||svg.clientWidth);
  const height=Math.round(parseFloat(svg.getAttribute('height'))||svg.clientHeight);
  const scale=40,margin=20;
  GRID_SIZE=params.gridSize||GRID_SIZE;
  let minCenterIn=Infinity;
  conduits.forEach(cd=>{
    const area=CONDUIT_SPECS[cd.conduit_type]?.[cd.trade_size];
    if(!Number.isFinite(area) || area<=0) return;
    const Rin=Math.sqrt(area/Math.PI);
    minCenterIn=Math.min(minCenterIn,(finiteNumber(cd.y,0)+Rin));
  });
  if(!Number.isFinite(minCenterIn)) minCenterIn=0;
  const depthIn=Math.max(0,finiteNumber(params.ductbankDepth,0));
  const coverOffsetPx=Math.max(0,(depthIn-minCenterIn)*scale);
  const boundaryPadPx=Math.max(12,depthIn || 36)*scale;
  const solverWidth=width+2*boundaryPadPx;
  const solverHeight=height+coverOffsetPx+boundaryPadPx;
  const referenceWidth=Math.max(1,finiteNumber(params.solverReferenceWidth,width));
  const referenceHeight=Math.max(1,finiteNumber(params.solverReferenceHeight,height));
  const referenceSolverWidth=referenceWidth+2*boundaryPadPx;
  const referenceSolverHeight=referenceHeight+coverOffsetPx+boundaryPadPx;
  const requestedStep=Math.ceil(Math.max(solverWidth,solverHeight)/GRID_SIZE);
  const referenceStep=Math.ceil(Math.max(referenceSolverWidth,referenceSolverHeight)/GRID_SIZE);
  const step=Math.max(4,Math.min(requestedStep,referenceStep,scale*2)); // pixel step for solver grid
  const dx=(0.0254/scale)*step;
  const nx=Math.ceil(solverWidth/step);
  const ny=Math.ceil(solverHeight/step);
  /* Thermal resistivity model based on Neher-McGrath and IEEE Std 835
     see docs/AMPACITY_METHOD.md#soil-resistivity-ranges */
  let soil=(params.soilResistivity)||90;
  soil*=1-Math.min(params.moistureContent||0,100)/200;
  const k=100/soil;
  const hConv=10; // W/(m^2*K)
  const Bi=hConv*dx/k;
  const earthT=Number.isFinite(params.earthTemp)?params.earthTemp:20;
  const airT=isNaN(params.airTemp)?earthT:params.airTemp;

  const grid=new Array(ny).fill(0).map(()=>new Array(nx).fill(earthT));
  const newGrid=new Array(ny).fill(0).map(()=>new Array(nx).fill(earthT));
  const powerGrid=new Array(ny).fill(0).map(()=>new Array(nx).fill(0));
  const conduitCells={};
  const sourceMask=new Array(ny).fill(0).map(()=>new Array(nx).fill(false));
  const sourceTemp=new Array(ny).fill(0).map(()=>new Array(nx).fill(earthT));

  const heatMap={};
  cables.forEach(c=>{
    const cd=conduits.find(d=>d.conduit_id===c.conduit_id);
    if(!cd)return;
    const Rin=Math.sqrt(CONDUIT_SPECS[cd.conduit_type][cd.trade_size]/Math.PI);
    const cx=(cd.x+Rin)*0.0254,cy=(cd.y+Rin)*0.0254;
    const current=parseFloat(c.est_load)||0;
    const power=cableHeatLoss(c,current);
    if(!heatMap[c.conduit_id]){
      heatMap[c.conduit_id]={cx,cy,r:Rin*0.0254,power:0};
    }
    heatMap[c.conduit_id].power+=power;
  });

  Object.keys(heatMap).forEach(cid=>{
    const h=heatMap[cid];
    const cxPx=Math.round((h.cx/0.0254*scale+margin+boundaryPadPx)/step);
    const cyPx=Math.round((h.cy/0.0254*scale+margin+coverOffsetPx)/step);
    const rPx=Math.max(1,Math.round((h.r/0.0254*scale)/step));
    const q=h.power/(Math.PI*h.r*h.r)*dx*dx/k;
    for(let j=Math.max(0,cyPx-rPx);j<=Math.min(ny-1,cyPx+rPx);j++){
      for(let i=Math.max(0,cxPx-rPx);i<=Math.min(nx-1,cxPx+rPx);i++){
        const dxp=i-cxPx,dyp=j-cyPx;
        if(dxp*dxp+dyp*dyp<=rPx*rPx){
          powerGrid[j][i]+=q;
          if(!conduitCells[cid])conduitCells[cid]=[];
          conduitCells[cid].push([j,i]);
        }
      }
    }
  });

  const heatSources=(params.heatSourceData||[]).filter(isCompleteHeatSource);
  heatSources.forEach(src=>{
    const tempC=fToC(parseFloat(src.temperature));
    const shape=(src.shape||'').toLowerCase();
    const x=parseFloat(src.x);
    const y=parseFloat(src.y);
    const w=parseFloat(src.width);
    const ht=parseFloat(src.height);
    if(shape==='circle'){
      const r=Math.max(w,ht)/2;
      const cx=x+r, cy=y+r;
      const cxPx=Math.round((cx*scale+margin+boundaryPadPx)/step);
      const cyPx=Math.round((cy*scale+margin+coverOffsetPx)/step);
      const rPx=Math.max(1,Math.round((r*scale)/step));
      for(let j=Math.max(0,cyPx-rPx);j<=Math.min(ny-1,cyPx+rPx);j++){
        for(let i=Math.max(0,cxPx-rPx);i<=Math.min(nx-1,cxPx+rPx);i++){
          const dxp=i-cxPx,dyp=j-cyPx;
          if(dxp*dxp+dyp*dyp<=rPx*rPx){
            sourceMask[j][i]=true;
            sourceTemp[j][i]=tempC;
            grid[j][i]=tempC;
            newGrid[j][i]=tempC;
          }
        }
      }
    }else{
      const x1=Math.round((x*scale+margin+boundaryPadPx)/step);
      const y1=Math.round((y*scale+margin+coverOffsetPx)/step);
      const x2=Math.round(((x+w)*scale+margin+boundaryPadPx)/step);
      const y2=Math.round(((y+ht)*scale+margin+coverOffsetPx)/step);
      for(let j=Math.max(0,y1);j<=Math.min(ny-1,y2);j++){
        for(let i=Math.max(0,x1);i<=Math.min(nx-1,x2);i++){
          sourceMask[j][i]=true;
          sourceTemp[j][i]=tempC;
          grid[j][i]=tempC;
          newGrid[j][i]=tempC;
        }
      }
    }
  });

  let diff=Infinity,iter=0,maxIter=2000;
  const minIter=Math.max(80,GRID_SIZE*4);
  return new Promise(resolve=>{
    function step(){
      let count=0;
      while((iter<minIter || diff>0.01)&&iter<maxIter&&count<10){
        diff=0;
        for(let j=0;j<ny;j++){
          for(let i=0;i<nx;i++){
            let val;
            if(sourceMask[j][i]){
              val=sourceTemp[j][i];
            }else if(j===ny-1||i===0||i===nx-1){
              val=earthT;
            }else if(j===0){
              val=(grid[j+1][i]+Bi*airT)/(1+Bi);
            }else{
              val=0.25*(grid[j][i-1]+grid[j][i+1]+grid[j-1][i]+grid[j+1][i]+powerGrid[j][i]);
            }
            newGrid[j][i]=val;
            diff=Math.max(diff,Math.abs(val-grid[j][i]));
          }
        }
        for(let j=0;j<ny;j++){
          for(let i=0;i<nx;i++)grid[j][i]=newGrid[j][i];
        }
        iter++;
        count++;
      }
      if(typeof progress==='function') progress(iter,maxIter);
      if(diff>0.01&&iter<maxIter){
        requestAnimationFrame(step);
      }else{
        const temps={};
        Object.keys(conduitCells).forEach(cid=>{
          const cells=conduitCells[cid];
          let sum=0;
          cells.forEach(([j,i])=>{sum+=grid[j][i];});
          const base=sum/cells.length;
          const p=heatMap[cid].power||0;
          const cd=conduits.find(d=>d.conduit_id===cid)||{};
          const rduct=getRduct(cd,params)+(params.ductThermRes||0);
          temps[cid]=base+p*rduct;
        });
        const cropCols=Math.max(1,GRID_SIZE);
        const cropRows=Math.max(1,Math.ceil((height/Math.max(width,1))*GRID_SIZE));
        const drawingOriginX=Number.isFinite(params.drawingOriginX)?params.drawingOriginX:margin;
        const drawingOriginY=Number.isFinite(params.drawingOriginY)?params.drawingOriginY:margin;
        const cropOriginX=boundaryPadPx+margin-drawingOriginX;
        const cropOriginY=coverOffsetPx+margin-drawingOriginY;
        const visibleGrid=[];
        for(let j=0;j<cropRows;j++){
          const yPx=cropOriginY+(cropRows===1?0:(j/(cropRows-1))*height);
          const sourceJ=Math.min(ny-1,Math.max(0,Math.round(yPx/step)));
          const sourceRow=grid[sourceJ] || [];
          const row=[];
          for(let i=0;i<cropCols;i++){
            const xPx=cropOriginX+(cropCols===1?0:(i/(cropCols-1))*width);
            const sourceI=Math.min(nx-1,Math.max(0,Math.round(xPx/step)));
            row.push(Number.isFinite(sourceRow[sourceI])?sourceRow[sourceI]:earthT);
          }
          visibleGrid.push(row);
        }
        resolve({grid:visibleGrid,conduitTemps:temps,iter,diff,ambient:earthT});
      }
    }
    step();
  });
}

function solveDuctbankTemperaturesWorker(conduits,cables,params,progress){
  const svg=document.getElementById('grid');
  const width=Math.round(parseFloat(svg.getAttribute('width'))||svg.clientWidth);
  const height=Math.round(parseFloat(svg.getAttribute('height'))||svg.clientHeight);
  return new Promise(resolve=>{
    let worker;
    try{
      worker=new Worker(`thermalWorker.js?v=${encodeURIComponent(CTR_VERSION)}`);
    }catch(err){
      console.warn('Worker failed, running solver on main thread',err);
      solveDuctbankTemperatures(conduits,cables,{...params,width,height},progress)
        .then(resolve);
      return;
    }
    worker.onmessage=e=>{
      const data=e.data;
      if(data.type==='progress'){
        if(typeof progress==='function') progress(data.iter,data.maxIter);
      }else if(data.type==='result'){
        worker.terminate();
        resolve(data);
      }
    };
    worker.postMessage({conduits,cables,params,width,height,gridSize:GRID_SIZE,
                       ductThermRes:params.ductThermRes,
                       conductorProps:window.CONDUCTOR_PROPS,
                       heatSources:params.heatSourceData||[]});
  });
}

async function runFiniteThermalAnalysis(){
  heatVisible=true;
  drawGrid();
  const conduits=getAllConduits();
 const cables=getAllCables();
 const canvas=document.getElementById('tempCanvas');
 const overlay=document.getElementById('tempOverlay');
 const svg=document.getElementById('grid');
 const width=Math.round(parseFloat(svg.getAttribute('width')) || svg.clientWidth);
 const height=Math.round(parseFloat(svg.getAttribute('height')) || svg.clientHeight);
 [canvas,overlay].forEach(cv=>{if(!cv)return;cv.width=width;cv.height=height;cv.style.width=width+'px';cv.style.height=height+'px';cv.style.display='block';});
 const ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,width,height);
 const octx=overlay.getContext('2d');
 octx.clearRect(0,0,width,height);
 const scale=40,margin=20;
 const drawingContext=ductbankDrawingContext(DUCTBANK_DRAWING_SCALE);
 const drawingOriginX=DUCTBANK_DRAWING_MARGIN + drawingContext.sideSoilPx;
 const drawingOriginY=drawingContext.ductTopY;
 const earthF=parseFloat(document.getElementById('earthTemp').value);
 const airF=parseFloat(document.getElementById('airTemp').value);
const ambient=isNaN(earthF)?20:fToC(earthF);
GRID_SIZE=parseInt(document.getElementById('gridRes').value)||20;
const ductRes=parseFloat(document.getElementById('ductThermRes').value)||0;
 const heatSourceData=getAllHeatSources();
const params={
  soilResistivity:parseFloat(document.getElementById('soilResistivity').value)||90,
  moistureContent:parseFloat(document.getElementById('moistureContent').value)||0,
  heatSources:document.getElementById('heatSources').checked,
  heatSourceData,
  hSpacing:parseFloat(document.getElementById('hSpacing').value)||3,
  vSpacing:parseFloat(document.getElementById('vSpacing').value)||4,
  concreteEncasement:document.getElementById('concreteEncasement').checked,
  ductbankDepth:parseFloat(document.getElementById('ductbankDepth').value)||0,
  earthTemp:ambient,
  airTemp:isNaN(airF)?NaN:fToC(airF),
  gridSize:GRID_SIZE,
  ductThermRes:ductRes,
  drawingOriginX,
  drawingOriginY,
  solverReferenceWidth:Math.max(360,width-(drawingContext.showContext ? drawingContext.sideSoilPx*2 : 0)),
  solverReferenceHeight:Math.max(360,height-(drawingContext.showContext ? Math.max(0,drawingContext.skyHeight+drawingContext.soilPad+drawingContext.bottomSoilPx-DUCTBANK_DRAWING_MARGIN) : 0))
 };

 const pc=document.getElementById('analysis-progress-container');
 const pb=document.getElementById('analysis-progress-bar');
 const pl=document.getElementById('analysis-progress-label');
 pc.style.display='block';
 pb.style.width='0%';
 pb.setAttribute('aria-valuenow','0');
 pl.textContent='Solving...';
 const result=await solveDuctbankTemperaturesWorker(conduits,cables,params,(it,max)=>{
  const pct=Math.round(it/max*100);
  pb.style.width=pct+'%';
  pb.setAttribute('aria-valuenow',pct);
  pl.textContent=`Solving (${it}/${max})`;
 });
 pc.style.display='none';
 const residual = result.residual !== undefined ? result.residual : result.diff;
 document.getElementById('solver-info').textContent =
  `Iterations: ${result.iter}  Residual: ${Number(residual).toFixed(3)}`;
const grid=result.grid;
const conduitTemps=result.conduitTemps;
const ambientRes=result.ambient;
window.lastHeatGrid=grid;
window.lastHeatGridMeta={width,height,originX:drawingOriginX,originY:drawingOriginY,showContext:drawingContext.showContext};
window.lastConduitTemps=conduitTemps;
window.lastAmbient=ambientRes;
 window.conduitOverLimit={};
 Object.entries(conduitTemps || {}).forEach(([conduitId,temp])=>{
   const rating=conduitTemperatureLimit(conduitId,cables);
   window.conduitOverLimit[conduitId]={temp,over:temp>rating,rating};
 });
if(heatVisible) drawHeatMap(grid,conduitTemps,conduits,ambientRes);

 window.finiteAmpacity = {};
 window.cableOverLimit = {};
 window.cableThermalTemps = {};
 for(const c of cables){
  const areaCM=sizeToArea(c.conductor_size);
  if(!areaCM){
    window.finiteAmpacity[c.tag]='N/A';
    window.cableOverLimit[c.tag]=false;
    window.cableThermalTemps[c.tag]=NaN;
    continue;
  }
  const conductorTemp=cableConductorTemperature(c,conduitTemps[c.conduit_id],finiteNumber(c.est_load,0));
  window.cableThermalTemps[c.tag]=conductorTemp;
  const amp=await calcFiniteAmpacity(c,conduits,cables,params);
  window.finiteAmpacity[c.tag]=isFinite(amp)?amp.toFixed(0):'N/A';
  window.cableOverLimit[c.tag]=(isFinite(amp)&&parseFloat(c.est_load)>amp) || conductorTemp>cableTemperatureRating(c);
 }
 updateAmpacityReport();
 updateCableRowStyles();
 scheduleDuctbankExperienceUpdate();
}

function drawHeatMap(grid, conduitTemps, conduits, ambient){
 const canvas=document.getElementById('tempCanvas');
 const overlay=document.getElementById('tempOverlay');
 if(!canvas||!overlay)return;
 const ctx=canvas.getContext('2d');
 const octx=overlay.getContext('2d');
 const svg=document.getElementById('grid');
 const width=Math.round(parseFloat(svg.getAttribute('width'))||svg.clientWidth);
 const height=Math.round(parseFloat(svg.getAttribute('height'))||svg.clientHeight);
const rows=Array.isArray(grid)?grid.length:0;
const cols=rows ? (grid[0]?.length||0) : 0;
if(!rows || !cols) return;
const cellX=width/cols;
const cellY=height/rows;
const heatContext=ductbankDrawingContext(DUCTBANK_DRAWING_SCALE);
const heatmapStartY=heatContext.showContext ? heatContext.gradeY : 0;
const img=ctx.createImageData(width,height);
let maxT=-Infinity,maxPx=0,maxPy=0;
let minT=Infinity;

 const VIRIDIS=[[68,1,84],[71,44,122],[59,81,139],[44,113,142],[33,144,141],
                [39,173,129],[92,200,99],[170,220,50],[253,231,37]];
 function viridisColor(f){
   f=Math.min(Math.max(f,0),1);
   const n=VIRIDIS.length-1;
   const idx=Math.floor(f*n);
   const t=f*n-idx;
   const c1=VIRIDIS[idx];
   const c2=VIRIDIS[Math.min(idx+1,n)];
   return [
     Math.round(c1[0]+(c2[0]-c1[0])*t),
     Math.round(c1[1]+(c2[1]-c1[1])*t),
     Math.round(c1[2]+(c2[2]-c1[2])*t)
   ];
 }
 for(let j=0;j<grid.length;j++){
   const rowCenterY=(j+0.5)*cellY;
   if(rowCenterY < heatmapStartY) continue;
   for(let i=0;i<cols;i++){
     const T=finiteNumber(grid[j]?.[i],ambient);
     if(!Number.isFinite(T)) continue;
     if(T>maxT){maxT=T;maxPx=i*cellX+cellX/2;maxPy=rowCenterY;}
     if(T<minT)minT=T;
   }
 }
 if(!Number.isFinite(maxT) || !Number.isFinite(minT)){
   maxT=finiteNumber(ambient,20);
   minT=maxT;
   maxPx=width/2;
   maxPy=Math.max(heatmapStartY,height/2);
 }
 const range=maxT-minT||1;
 for(let j=0;j<grid.length;j++){
   const yStart=Math.max(Math.floor(j*cellY),Math.ceil(heatmapStartY));
   const yEnd=Math.min(height,Math.ceil((j+1)*cellY));
   if(yEnd<=yStart) continue;
   for(let i=0;i<cols;i++){
     const T=finiteNumber(grid[j]?.[i],ambient);
     const frac=(T-minT)/range;
     const [r,g,b]=viridisColor(frac);
     const xStart=Math.floor(i*cellX);
     const xEnd=Math.min(width,Math.ceil((i+1)*cellX));
     for(let y=yStart;y<yEnd;y++){
       for(let x=xStart;x<xEnd;x++){
         const idx=(y*width+x)*4;
        img.data[idx]=r;
        img.data[idx+1]=g;
        img.data[idx+2]=b;
        img.data[idx+3]=160;
      }
     }
   }
 }
ctx.clearRect(0,0,width,height);
ctx.putImageData(img,0,0);
window.lastHeatImgData = img;
octx.clearRect(0,0,width,height);

 // legend
 const legendH=80, legendW=12;
 const legendX=width-legendW-10;
 const legendY=10;
 for(let y=0;y<legendH;y++){
   const frac=1-y/(legendH-1);
   const [r,g,b]=viridisColor(frac);
   octx.fillStyle=`rgb(${r},${g},${b})`;
   octx.fillRect(legendX,legendY+y,legendW,1);
 }
 octx.fillStyle='black';
 octx.font='10px sans-serif';
 octx.fillText((maxT*9/5+32).toFixed(0)+'\u00B0F',legendX-4,legendY+8);
 octx.fillText((minT*9/5+32).toFixed(0)+'\u00B0F',legendX-4,legendY+legendH-2);
 const maxTF=maxT*9/5+32;
 const cables=getAllCables();
 const ratings=cables.map(cableTemperatureRating).filter(r=>Number.isFinite(r) && r>0);
 const Tc=ratings.length?Math.min(...ratings):getConductorRating();
 if(maxT>Tc){
   console.warn(`Maximum temperature ${maxT.toFixed(1)}\u00B0C exceeds ${Tc}\u00B0C rating.`);
 }
 octx.beginPath();
 octx.arc(maxPx,maxPy,5,0,Math.PI*2);
 octx.fillStyle='yellow';
 octx.fill();
 octx.strokeStyle='red';
 octx.stroke();
 octx.font='12px sans-serif';
 octx.fillStyle='black';
 octx.fillText(maxTF.toFixed(1)+'\u00B0F',maxPx+8,maxPy-8);

 window.conduitOverLimit={};
 const scale=DUCTBANK_DRAWING_SCALE;
 const { ductTopY, sideSoilPx } = ductbankDrawingContext(scale);
 const originX=DUCTBANK_DRAWING_MARGIN + sideSoilPx;
 conduits.forEach(cd=>{
   const Rin=Math.sqrt(CONDUIT_SPECS[cd.conduit_type][cd.trade_size]/Math.PI);
   const px=(cd.x+Rin)*scale+originX;
   const py=(cd.y+Rin)*scale+ductTopY;
   const t=conduitTemps[cd.conduit_id]??ambient;
   const tf=t*9/5+32;
   const rating=conduitTemperatureLimit(cd.conduit_id,cables);
   const over=t>rating;
   window.conduitOverLimit[cd.conduit_id]={temp:t,over,rating};
   if(over){
     console.warn(`Temperature at conduit ${cd.conduit_id} reaches ${t.toFixed(1)}\u00B0C > rating ${rating}\u00B0C`);
   }
   octx.beginPath();
   octx.arc(px,py,4,0,Math.PI*2);
   octx.fillStyle=over?'red':'yellow';
   octx.fill();
   octx.strokeStyle='black';
   octx.stroke();
   octx.fillStyle='black';
   octx.fillText(tf.toFixed(1)+'\u00B0F'+(over?' ⚠':''),px+6,py+4);
});
}

function importCSV(file,callback){
 const reader=new FileReader();
 reader.onload=e=>{const rows=e.target.result.trim().split(/\r?\n/).map(r=>r.split(','));const headers=rows.shift();const objs=rows.map(r=>{const o={};headers.forEach((h,i)=>o[h.trim()]=r[i]);return o;});callback(objs);};
 reader.readAsText(file);
}

let activeDuctbankFilter = 'all';
let ductbankExperienceRaf = 0;
let selectedDuctbankCableTag = '';

function setDuctbankText(id, value){
 const el=document.getElementById(id);
 if(el) el.textContent=value;
}

function normalizeDuctbankId(value){
 return String(value || '').trim();
}

function rowTextContent(row){
 let text=row.textContent || '';
 row.querySelectorAll('input, select').forEach(field=>{
   text += ' ' + (field.value || '');
 });
 return text.toLowerCase();
}

function duplicateValues(values){
 const counts=new Map();
 values.map(normalizeDuctbankId).filter(Boolean).forEach(value=>{
   counts.set(value,(counts.get(value)||0)+1);
 });
 return new Set(Array.from(counts.entries()).filter(([,count])=>count>1).map(([value])=>value));
}

function conduitFillLimit(cableCount){
 if(cableCount===1) return 53;
 if(cableCount===2) return 31;
 return 40;
}

function defaultDuctbankIssueDetails(issue){
 const defaults={
   missing:{severity:'Missing Data',field:issue.table==='conduit'?'conduit_id':'tag',fix:'Complete the highlighted required field.'},
   duplicate:{severity:'Duplicate',field:issue.table==='conduit'?'conduit_id':'tag',fix:'Rename the duplicate value so each row has a unique identifier.'},
   assignment:{severity:'Assignment',field:'conduit_id',fix:'Assign the cable to an existing conduit.'},
   fill:{severity:'Fill',field:'conduit_id',fix:'Move cables to another conduit or increase the conduit size.'},
   thermal:{severity:'Thermal',field:'est_load',fix:'Reduce load, increase spacing, or review soil and thermal inputs.'},
   ampacity:{severity:'Ampacity',field:'est_load',fix:'Reduce load, increase conductor size, or review ampacity assumptions.'}
 };
 return defaults[issue.code] || {severity:'Review',field:null,fix:'Review this row before exporting.'};
}

function addDuctbankIssue(context, issue){
 const normalized={...defaultDuctbankIssueDetails(issue),...issue};
 context.issues.push(normalized);
 const target=normalized.table==='conduit' ? context.conduitIssuesByRow : context.cableIssuesByRow;
 const list=target.get(normalized.row) || [];
 list.push(normalized);
 target.set(normalized.row,list);
}

function collectDuctbankContext(){
 const conduits=getAllConduits();
 const cables=getAllCables();
 const context={
   conduits,
   cables,
   issues:[],
   conduitIssuesByRow:new Map(),
   cableIssuesByRow:new Map(),
   conduitIds:new Set(conduits.map(c=>normalizeDuctbankId(c.conduit_id)).filter(Boolean)),
   cableCountByConduit:new Map(),
   fillMap:{},
   fillWarningConduits:new Set(),
   thermalConduits:new Set(),
   ampacityConduits:new Set(),
   ampacityCables:new Set()
 };
 conduits.forEach(c=>context.cableCountByConduit.set(normalizeDuctbankId(c.conduit_id),0));
 cables.forEach(c=>{
   const cid=normalizeDuctbankId(c.conduit_id);
   if(cid) context.cableCountByConduit.set(cid,(context.cableCountByConduit.get(cid)||0)+1);
 });
 try{
   context.fillMap=fillResults();
 }catch(e){
   console.warn('Unable to collect ductbank fill results for summary', e);
 }
 const duplicateConduits=duplicateValues(conduits.map(c=>c.conduit_id));
 const duplicateCables=duplicateValues(cables.map(c=>c.tag));
 conduits.forEach((conduit,row)=>{
   const id=normalizeDuctbankId(conduit.conduit_id);
   if(!id) addDuctbankIssue(context,{table:'conduit',row,code:'missing',field:'conduit_id',message:'Conduit is missing an ID',fix:'Enter a unique conduit ID.'});
   if(id && duplicateConduits.has(id)) addDuctbankIssue(context,{table:'conduit',row,code:'duplicate',field:'conduit_id',message:`Duplicate conduit ID "${id}"`,fix:'Rename this conduit so every conduit ID is unique.'});
   if(!CONDUIT_SPECS[conduit.conduit_type] || !CONDUIT_SPECS[conduit.conduit_type][conduit.trade_size]){
     addDuctbankIssue(context,{table:'conduit',row,code:'missing',field:'trade_size',message:`Conduit ${id || row + 1} needs a valid type and trade size`,fix:'Choose a valid conduit type and trade size.'});
   }
 });
 Object.entries(context.fillMap || {}).forEach(([conduitId,data])=>{
   const count=data?.cables?.length || 0;
   if(!count || !Number.isFinite(data.fillPct)) return;
   const limit=conduitFillLimit(count);
   if(data.fillPct > limit || data.fillPct > limit * 0.8){
     context.fillWarningConduits.add(conduitId);
     const row=conduits.findIndex(c=>normalizeDuctbankId(c.conduit_id)===conduitId);
     if(row >= 0){
       addDuctbankIssue(context,{
         table:'conduit',
         row,
         code:'fill',
         field:'conduit_id',
         message:`Conduit ${conduitId} fill is ${data.fillPct.toFixed(1)}% of a ${limit}% limit`,
         fix:'Move one or more cables to another conduit or select a larger trade size.'
       });
     }
   }
 });
 Object.entries(window.conduitOverLimit || {}).forEach(([conduitId,result])=>{
   if(result?.over) context.thermalConduits.add(conduitId);
 });
 Object.entries(window.cableOverLimit || {}).forEach(([tag,over])=>{
   const normalizedTag=normalizeDuctbankId(tag);
   if(over && normalizedTag) context.ampacityCables.add(normalizedTag);
 });
 cables.forEach((cable,row)=>{
   const tag=normalizeDuctbankId(cable.tag);
   const conduitId=normalizeDuctbankId(cable.conduit_id);
   if(!tag) addDuctbankIssue(context,{table:'cable',row,code:'missing',field:'tag',message:'Cable is missing a tag',fix:'Enter a unique cable tag.'});
   if(tag && duplicateCables.has(tag)) addDuctbankIssue(context,{table:'cable',row,code:'duplicate',field:'tag',message:`Duplicate cable tag "${tag}"`,fix:'Rename this cable so every cable tag is unique.'});
   if(!(parseFloat(cable.diameter)>0)) addDuctbankIssue(context,{table:'cable',row,code:'missing',field:'diameter',message:`Cable ${tag || row + 1} needs a diameter`,fix:'Enter the outside diameter in inches.'});
   if(!conduitId) addDuctbankIssue(context,{table:'cable',row,code:'assignment',field:'conduit_id',message:`Cable ${tag || row + 1} is not assigned to a conduit`,fix:'Choose the conduit this cable will be installed in.'});
   else if(!context.conduitIds.has(conduitId)) addDuctbankIssue(context,{table:'cable',row,code:'assignment',field:'conduit_id',message:`Cable ${tag || row + 1} references missing conduit ${conduitId}`,fix:'Choose an existing conduit or add the missing conduit.'});
   if(!(parseFloat(cable.insulation_thickness)>0)) addDuctbankIssue(context,{table:'cable',row,code:'missing',field:'insulation_thickness',message:`Cable ${tag || row + 1} needs insulation thickness`,fix:'Enter insulation thickness or select a conductor size with known defaults.'});
   if(context.fillWarningConduits.has(conduitId)) addDuctbankIssue(context,{table:'cable',row,code:'fill',field:'conduit_id',message:`Cable ${tag || row + 1} is in a conduit near or over fill limit`,fix:'Move this cable to another conduit or increase conduit size.'});
   if(context.thermalConduits.has(conduitId)){
     addDuctbankIssue(context,{table:'cable',row,code:'thermal',field:'est_load',message:`Cable ${tag || row + 1} has a thermal alert`,fix:'Reduce estimated load, adjust spacing, or review soil assumptions.'});
   }
   if(context.ampacityCables.has(tag)){
     if(conduitId) context.ampacityConduits.add(conduitId);
     addDuctbankIssue(context,{table:'cable',row,code:'ampacity',field:'est_load',message:`Cable ${tag || row + 1} exceeds an ampacity estimate`,fix:'Reduce estimated load, increase conductor size, or review ampacity assumptions.'});
   }
 });
 return context;
}

function hasIssueCode(issues, codes){
 return issues.some(issue=>codes.includes(issue.code));
}

function ductbankIssueCodeMatchesFilter(code, filter=activeDuctbankFilter){
 if(filter==='all' || filter==='assigned' || filter==='unassigned') return true;
 if(filter==='missing') return ['missing','duplicate','assignment'].includes(code);
 return code===filter;
}

function ductbankIssueMatchesActiveFilter(issue, context){
 if(!issue) return false;
 if(['all','missing','fill','thermal','ampacity'].includes(activeDuctbankFilter)){
   return ductbankIssueCodeMatchesFilter(issue.code);
 }
 const rowData=issue.table==='conduit'
   ? context.conduits[issue.row]
   : context.cables[issue.row];
 return rowData ? rowMatchesDuctbankFilter(issue.table,rowData,issue.row,context) : true;
}

function rowMatchesDuctbankFilter(type, rowData, index, context){
 const issues=type==='conduit'
   ? context.conduitIssuesByRow.get(index) || []
   : context.cableIssuesByRow.get(index) || [];
 if(activeDuctbankFilter==='all') return true;
 if(type==='conduit'){
   const id=normalizeDuctbankId(rowData.conduit_id);
   const assigned=(context.cableCountByConduit.get(id) || 0) > 0;
   if(activeDuctbankFilter==='assigned') return assigned;
   if(activeDuctbankFilter==='unassigned') return id ? !assigned : false;
   if(activeDuctbankFilter==='missing') return hasIssueCode(issues,['missing','duplicate','assignment']);
   if(activeDuctbankFilter==='fill') return hasIssueCode(issues,['fill']);
   if(activeDuctbankFilter==='thermal') return context.thermalConduits.has(id);
   if(activeDuctbankFilter==='ampacity') return context.ampacityConduits.has(id);
 }else{
   const tag=normalizeDuctbankId(rowData.tag);
   const conduitId=normalizeDuctbankId(rowData.conduit_id);
   const assigned=Boolean(conduitId && context.conduitIds.has(conduitId));
   if(activeDuctbankFilter==='assigned') return assigned;
   if(activeDuctbankFilter==='unassigned') return !assigned;
   if(activeDuctbankFilter==='missing') return hasIssueCode(issues,['missing','duplicate','assignment']);
   if(activeDuctbankFilter==='fill') return hasIssueCode(issues,['fill']);
   if(activeDuctbankFilter==='thermal') return context.thermalConduits.has(conduitId);
   if(activeDuctbankFilter==='ampacity') return context.ampacityCables.has(tag);
 }
 return true;
}

function applyDuctbankQuickFilter(context){
 const conduitQuery=(document.getElementById('conduit-search')?.value || '').toLowerCase();
 document.querySelectorAll('#conduitTable tbody tr').forEach((row,index)=>{
   const data=context.conduits[index] || rowToConduit(row);
   const textMatch=!conduitQuery || rowTextContent(row).includes(conduitQuery);
   const filterMatch=rowMatchesDuctbankFilter('conduit',data,index,context);
   const issues=context.conduitIssuesByRow.get(index) || [];
   const visibleIssues=issues.filter(issue=>ductbankIssueCodeMatchesFilter(issue.code));
   row.style.display=textMatch && filterMatch ? '' : 'none';
   row.classList.toggle('ductbank-row-warning', visibleIssues.length > 0);
   row.classList.toggle('ductbank-row-fill-warning', hasIssueCode(visibleIssues,['fill']));
   row.classList.toggle('ductbank-row-thermal-warning', ductbankIssueCodeMatchesFilter('thermal') && context.thermalConduits.has(normalizeDuctbankId(data.conduit_id)));
   row.classList.toggle('ductbank-row-ampacity-warning', ductbankIssueCodeMatchesFilter('ampacity') && context.ampacityConduits.has(normalizeDuctbankId(data.conduit_id)));
 });
 const cableQuery=(document.getElementById('cable-search')?.value || '').toLowerCase();
 document.querySelectorAll('#cableTable tbody tr').forEach((row,index)=>{
   const data=context.cables[index] || rowToCable(row);
   const textMatch=!cableQuery || rowTextContent(row).includes(cableQuery);
   const filterMatch=rowMatchesDuctbankFilter('cable',data,index,context);
   const issues=context.cableIssuesByRow.get(index) || [];
   const visibleIssues=issues.filter(issue=>ductbankIssueCodeMatchesFilter(issue.code));
   row.style.display=textMatch && filterMatch ? '' : 'none';
   row.classList.toggle('ductbank-row-warning', visibleIssues.length > 0);
   row.classList.toggle('ductbank-row-fill-warning', hasIssueCode(visibleIssues,['fill']));
   row.classList.toggle('ductbank-row-thermal-warning',
     ductbankIssueCodeMatchesFilter('thermal') && context.thermalConduits.has(normalizeDuctbankId(data.conduit_id)));
   row.classList.toggle('ductbank-row-ampacity-warning',
     ductbankIssueCodeMatchesFilter('ampacity') && context.ampacityCables.has(normalizeDuctbankId(data.tag)));
 });
 document.querySelectorAll('[data-ductbank-filter]').forEach(btn=>{
   const active=btn.dataset.ductbankFilter===activeDuctbankFilter;
   btn.classList.toggle('active',active);
   btn.setAttribute('aria-pressed',String(active));
 });
 document.querySelectorAll('[data-ductbank-summary-filter]').forEach(card=>{
   const active=card.dataset.ductbankSummaryFilter===activeDuctbankFilter;
   card.classList.toggle('active',active);
   card.setAttribute('aria-pressed',String(active));
 });
 updateDuctbankTableState(context);
}

function visibleDuctbankRowCount(selector){
 return Array.from(document.querySelectorAll(selector)).filter(row=>row.style.display !== 'none').length;
}

function setDuctbankEmptyState(id, { hidden, title, message, filtered = false }){
 const state=document.getElementById(id);
 if(!state) return;
 state.hidden=hidden;
 state.classList.toggle('is-filtered',filtered);
 const titleEl=state.querySelector('strong');
 const messageEl=state.querySelector('span');
 if(titleEl && title) titleEl.textContent=title;
 if(messageEl && message) messageEl.textContent=message;
}

function hasUnassignedDuctbankCables(context){
 return context.cables.some(cable=>{
   const conduitId=normalizeDuctbankId(cable.conduit_id);
   return !conduitId || !context.conduitIds.has(conduitId);
 });
}

function updateDuctbankTableState(context){
 const conduitVisible=visibleDuctbankRowCount('#conduitTable tbody tr');
 const cableVisible=visibleDuctbankRowCount('#cableTable tbody tr');
 const conduitFiltered=Boolean((document.getElementById('conduit-search')?.value || '').trim()) || activeDuctbankFilter !== 'all';
 const cableFiltered=Boolean((document.getElementById('cable-search')?.value || '').trim()) || activeDuctbankFilter !== 'all';
 const conduitCount=document.getElementById('conduit-table-count');
 const cableCount=document.getElementById('cable-table-count');
 if(conduitCount){
   conduitCount.textContent=conduitFiltered
     ? `Showing ${conduitVisible} of ${context.conduits.length} conduit${context.conduits.length === 1 ? '' : 's'}`
     : `${context.conduits.length} conduit${context.conduits.length === 1 ? '' : 's'}`;
 }
 if(cableCount){
   cableCount.textContent=cableFiltered
     ? `Showing ${cableVisible} of ${context.cables.length} cable${context.cables.length === 1 ? '' : 's'}`
     : `${context.cables.length} cable${context.cables.length === 1 ? '' : 's'}`;
 }
 const clearConduit=document.getElementById('clearConduitFiltersBtn');
 const clearCable=document.getElementById('clearCableFiltersBtn');
 if(clearConduit){
   clearConduit.hidden=!conduitFiltered;
   clearConduit.disabled=!conduitFiltered;
 }
 if(clearCable){
   clearCable.hidden=!cableFiltered;
   clearCable.disabled=!cableFiltered;
 }
 setDuctbankEmptyState('conduit-empty-state',{
   hidden:context.conduits.length > 0 && conduitVisible > 0,
   filtered:context.conduits.length > 0 && conduitVisible === 0,
   title:context.conduits.length ? 'No conduits match the current filters' : 'No conduits yet',
   message:context.conduits.length
     ? 'Clear filters or adjust the search text to return to the full conduit list.'
     : 'Add a conduit, import CSV data, or load a complete example to start the layout.'
 });
 setDuctbankEmptyState('cable-empty-state',{
   hidden:context.cables.length > 0 && cableVisible > 0,
   filtered:context.cables.length > 0 && cableVisible === 0,
   title:context.cables.length ? 'No cables match the current filters' : 'No cables yet',
   message:context.cables.length
     ? 'Clear filters or adjust the search text to return to the full cable list.'
     : 'Add cables with the guided dialog, import CSV data, or load a complete example.'
 });
 const autoAssign=document.getElementById('autoAssignCablesBtn');
 if(autoAssign){
   const canAssign=context.conduits.length > 0 && hasUnassignedDuctbankCables(context);
   setDuctbankButtonEnabled('autoAssignCablesBtn',canAssign,context.conduits.length ? 'All cables are already assigned to valid conduits.' : 'Add conduits before auto assigning cables.');
 }
}

function clearDuctbankFilters(scope='all'){
 if(scope==='all' || scope==='conduit'){
   const input=document.getElementById('conduit-search');
   if(input) input.value='';
 }
 if(scope==='all' || scope==='cable'){
   const input=document.getElementById('cable-search');
   if(input) input.value='';
 }
 activeDuctbankFilter='all';
 updateDuctbankExperience();
}

function setDuctbankButtonEnabled(id, enabled, disabledTitle){
 const el=document.getElementById(id);
 if(!el) return;
 if(!el.dataset.defaultTitle) el.dataset.defaultTitle=el.title || '';
 el.disabled=!enabled;
 el.setAttribute('aria-disabled',String(!enabled));
 el.title=enabled ? el.dataset.defaultTitle : disabledTitle || el.dataset.defaultTitle;
}

function setDuctbankWorkflowStep(step, state){
 const el=document.getElementById(`ductbank-step-${step}`);
 if(!el) return;
 el.classList.remove('is-current','is-complete','is-blocked','is-locked');
 el.classList.add(`is-${state}`);
}

function updateDuctbankWorkflowState(context, warningCount, thermalCount, ampacityCount=0){
 const hasConduits=context.conduits.length > 0;
 const hasCables=context.cables.length > 0;
 const hasAny=hasConduits || hasCables;
 const hasHeat=Array.isArray(window.lastHeatGrid) && window.lastHeatGrid.length > 0;
 const hasFill=hasConduits && Object.keys(context.fillMap || {}).length > 0;
 const alertCount=thermalCount + ampacityCount;
 const validated=hasAny && warningCount === 0;
 setDuctbankWorkflowStep('validate', !hasAny ? 'current' : validated ? 'complete' : 'blocked');
 setDuctbankWorkflowStep('fill', !hasConduits ? 'locked' : hasFill ? 'complete' : validated ? 'current' : 'locked');
 setDuctbankWorkflowStep('thermal', !hasConduits || !hasCables ? 'locked' : hasHeat && alertCount === 0 ? 'complete' : hasHeat ? 'blocked' : validated ? 'current' : 'locked');
 setDuctbankWorkflowStep('export', !hasAny ? 'locked' : validated && (!hasCables || hasHeat || alertCount === 0) ? 'current' : 'locked');
 setDuctbankButtonEnabled('calc',hasConduits,'Add at least one conduit before calculating fill.');
 setDuctbankButtonEnabled('thermalBtn',hasConduits && hasCables,'Add conduits and assigned cables before running thermal analysis.');
 setDuctbankButtonEnabled('heatToggleBtn',hasHeat,'Run thermal analysis before toggling the heat map.');
 setDuctbankButtonEnabled('exportBtn',hasAny,'Add ductbank data before exporting.');
 setDuctbankButtonEnabled('exportConduitsBtn',hasConduits,'Add conduits before exporting conduit CSV.');
 setDuctbankButtonEnabled('exportCablesBtn',hasCables,'Add cables before exporting cable CSV.');
 setDuctbankButtonEnabled('exportImgBtn',hasConduits,'Calculate a ductbank drawing before exporting an image.');
 setDuctbankButtonEnabled('exportThermalBtn',hasHeat,'Run thermal analysis before exporting thermal data.');
 setDuctbankButtonEnabled('exportCanvasDataBtn',hasHeat,'Run thermal analysis before exporting heat map data.');
 setDuctbankButtonEnabled('downloadCalcReportBtn',hasConduits && hasCables,'Add conduits and cables before downloading a calculation report.');
 renderDuctbankNextAction(context, warningCount, thermalCount, ampacityCount);
}

function ductbankNextActionButton(label, action, primary=false){
 return `<button type="button" class="btn ${primary ? 'primary-btn' : 'secondary-btn'}" data-ductbank-next-action="${action}">${escapeHtml(label)}</button>`;
}

function renderDuctbankNextAction(context, warningCount, thermalCount, ampacityCount=0){
 const el=document.getElementById('ductbank-next-action');
 if(!el) return;
 const hasConduits=context.conduits.length > 0;
 const hasCables=context.cables.length > 0;
 const hasHeat=Array.isArray(window.lastHeatGrid) && window.lastHeatGrid.length > 0;
 const hasFill=hasConduits && Object.keys(context.fillMap || {}).length > 0;
 const assigned=context.cables.filter(c=>context.conduitIds.has(normalizeDuctbankId(c.conduit_id))).length;
 const alertCount=thermalCount + ampacityCount;
 let title='Ductbank inputs are ready.';
 let detail='Run the final exports or continue to the report package.';
 let meta=`${context.conduits.length} conduit(s), ${assigned}/${context.cables.length} assigned cable(s)`;
 let actions=[
   ductbankNextActionButton('Download Calc Report','calc-report',true),
   '<a class="btn secondary-btn" href="projectreport.html">Project Report</a>'
 ];
 let warning=false;

 if(!hasConduits){
   title='Add ductbank conduits.';
   detail='The underground route needs conduit records before fill, thermal checks, or exports can run.';
   meta='No conduits loaded';
   actions=[
     ductbankNextActionButton('Load Complete Example','load-sample',true),
     ductbankNextActionButton('Add Conduit','add-conduit')
   ];
   warning=true;
 }else if(!hasCables){
   title='Add or assign ductbank cables.';
   detail='Thermal and ampacity checks need cable records assigned to the conduit layout.';
   meta=`${context.conduits.length} conduit(s) ready`;
   actions=[
     ductbankNextActionButton('Load Sample Cables','sample-cables',true),
     ductbankNextActionButton('Add Cable','add-cable')
   ];
   warning=true;
 }else if(warningCount){
   title='Resolve ductbank validation warnings.';
   detail=`${warningCount} data, assignment, or fill warning(s) need review before release exports.`;
   meta=`${assigned}/${context.cables.length} assigned cable(s)`;
   actions=[
     ductbankNextActionButton('Validate and Focus','validate',true),
     ductbankNextActionButton('Calculate Fill','calculate-fill')
   ];
   warning=true;
 }else if(!hasFill){
   title='Calculate conduit fill.';
   detail='Conduit and cable inputs are present; calculate fill before running thermal checks.';
   meta=`${assigned}/${context.cables.length} assigned cable(s)`;
   actions=[
     ductbankNextActionButton('Calculate Fill','calculate-fill',true),
     ductbankNextActionButton('Validate','validate')
   ];
 }else if(!hasHeat){
   title='Run ductbank thermal analysis.';
   detail='Fill is available. Run thermal to complete the underground route check.';
   meta=`${context.conduits.length} conduit(s), ${context.cables.length} cable(s)`;
   actions=[
     ductbankNextActionButton('Run Thermal','thermal',true),
     ductbankNextActionButton('Calculate Fill','calculate-fill')
   ];
 }else if(alertCount){
   title='Review thermal and ampacity alerts.';
   detail=`${thermalCount} thermal alert(s) and ${ampacityCount} ampacity alert(s) need review before exporting.`;
   meta='Thermal analysis complete with alerts';
   actions=[
     ductbankNextActionButton('Show Alerts','show-alerts',true),
     ductbankNextActionButton('Run Thermal Again','thermal')
   ];
   warning=true;
 }

 el.classList.toggle('is-warning',warning);
 el.classList.toggle('is-ready',!warning && hasConduits && hasCables && hasFill && hasHeat);
 el.innerHTML=`
   <div>
     <strong>${escapeHtml(title)}</strong>
     <p>${escapeHtml(detail)}</p>
   </div>
   <span class="workflow-next-action__meta">${escapeHtml(meta)}</span>
   <div class="workflow-next-action__actions">${actions.join('')}</div>`;
 el.querySelectorAll('[data-ductbank-next-action]').forEach(button=>{
   button.addEventListener('click',()=>{
     const action=button.dataset.ductbankNextAction;
     if(action==='load-sample') document.getElementById('loadDuctbankExample')?.click();
     if(action==='add-conduit') document.getElementById('addConduit')?.click();
     if(action==='sample-cables') document.getElementById('sampleCables')?.click();
     if(action==='add-cable') document.getElementById('addCable')?.click();
     if(action==='validate') validateDuctbankInputs({focusFirst:true});
     if(action==='calculate-fill') document.getElementById('calc')?.click();
     if(action==='thermal') document.getElementById('thermalBtn')?.click();
     if(action==='calc-report') document.getElementById('downloadCalcReportBtn')?.click();
     if(action==='show-alerts'){
       activeDuctbankFilter=thermalCount ? 'thermal' : 'ampacity';
       updateDuctbankExperience();
       document.getElementById('ductbank-warning-list')?.scrollIntoView({behavior:'smooth',block:'nearest'});
     }
   });
 });
}

function focusDuctbankIssue(issue){
 if(!issue) return;
 const tableId=issue.table==='conduit' ? 'conduitTable' : 'cableTable';
 const row=document.querySelectorAll(`#${tableId} tbody tr`)[issue.row];
 if(!row) return;
 activeDuctbankFilter=issue.code==='thermal' ? 'thermal' : issue.code==='ampacity' ? 'ampacity' : issue.code==='fill' ? 'fill' : 'missing';
 updateDuctbankExperience();
 const field=issue.field ? row.querySelector(`[name="${issue.field}"]`) : row.querySelector('input,select,button');
 row.scrollIntoView({behavior:'smooth',block:'center'});
 if(field){
   field.focus();
   if(typeof field.select==='function') field.select();
 }
}

function currentDuctbankAmpacityParams(){
 const earthF=parseFloat(document.getElementById('earthTemp')?.value);
 const airF=parseFloat(document.getElementById('airTemp')?.value);
 return {
  earthTemp:isNaN(earthF)?20:fToC(earthF),
  airTemp:isNaN(airF)?NaN:fToC(airF),
  soilResistivity:parseFloat(document.getElementById('soilResistivity')?.value)||90,
  moistureContent:parseFloat(document.getElementById('moistureContent')?.value)||0,
  heatSources:Boolean(document.getElementById('heatSources')?.checked),
  hSpacing:parseFloat(document.getElementById('hSpacing')?.value)||3,
  vSpacing:parseFloat(document.getElementById('vSpacing')?.value)||4,
  concreteEncasement:Boolean(document.getElementById('concreteEncasement')?.checked),
  ductbankDepth:parseFloat(document.getElementById('ductbankDepth')?.value)||0,
  gridSize:parseInt(document.getElementById('gridRes')?.value)||20,
  ductThermRes:parseFloat(document.getElementById('ductThermRes')?.value)||0
 };
}

function formatDuctbankAmpacity(value){
 return Number.isFinite(value) ? `${Math.round(value)} A` : 'N/A';
}

function collectDuctbankAmpacityOverEntries(context){
 if(!context.ampacityCables.size) return [];
 const params=currentDuctbankAmpacityParams();
 const total=context.cables.length;
 const countMap={};
 context.cables.forEach(cable=>{countMap[cable.conduit_id]=(countMap[cable.conduit_id]||0)+1;});
 return context.cables.map((cable,row)=>{
   const tag=normalizeDuctbankId(cable.tag);
   if(!tag || !context.ampacityCables.has(tag)) return null;
   const load=finiteNumber(cable.est_load,0);
   let neher=NaN;
   let rating=cableTemperatureRating(cable);
   try{
     const details=ampacityDetails(cable,params,countMap[cable.conduit_id],total);
     neher=details.ampacity;
     rating=details.rating;
   }catch(e){
     neher=NaN;
   }
   const finite=parseFloat(window.finiteAmpacity?.[cable.tag] ?? window.finiteAmpacity?.[tag]);
   const conductorTemp=parseFloat(window.cableThermalTemps?.[cable.tag] ?? window.cableThermalTemps?.[tag]);
   const reasons=[];
   if(Number.isFinite(neher) && load > neher) reasons.push(`Neher ${formatDuctbankAmpacity(neher)}`);
   if(Number.isFinite(finite) && load > finite) reasons.push(`Finite ${formatDuctbankAmpacity(finite)}`);
   if(Number.isFinite(conductorTemp) && Number.isFinite(rating) && conductorTemp > rating){
     reasons.push(`Temp ${conductorTemp.toFixed(1)}\u00B0C > ${rating.toFixed(0)}\u00B0C`);
   }
   return {
     row,
     tag,
     load,
     neher,
     finite,
     conductorTemp,
     rating,
     conduitId:normalizeDuctbankId(cable.conduit_id),
     reasons
   };
 }).filter(Boolean);
}

function focusDuctbankAmpacityOverEntry(entry){
 if(!entry) return;
 activeDuctbankFilter='ampacity';
 updateDuctbankExperience();
 const row=document.querySelectorAll('#cableTable tbody tr')[entry.row] || ductbankCableRowByTag(entry.tag);
 if(!row) return;
 row.scrollIntoView({behavior:'smooth',block:'center'});
 row.classList.add('ductbank-row-selected');
 const field=row.querySelector('[name="est_load"]') || row.querySelector('[name="tag"]') || row.querySelector('input,select,button');
 if(field){
   field.focus();
   if(typeof field.select==='function') field.select();
 }
 setTimeout(()=>row.classList.remove('ductbank-row-selected'),3500);
}

function renderDuctbankAmpacityOverList(context){
 const list=document.getElementById('ductbank-ampacity-over-list');
 if(!list) return;
 list.innerHTML='';
 if(activeDuctbankFilter !== 'all' && activeDuctbankFilter !== 'ampacity'){
   list.hidden=true;
   return;
 }
 const entries=collectDuctbankAmpacityOverEntries(context);
 if(!entries.length){
   list.hidden=true;
   return;
 }
 list.hidden=false;
 const header=document.createElement('div');
 header.className='ductbank-ampacity-over-list-header';
 const title=document.createElement('strong');
 title.textContent='Ampacity estimates over';
 const helper=document.createElement('span');
 helper.textContent='Select a cable to jump to its estimated load field.';
 header.append(title,helper);
 list.appendChild(header);
 const items=document.createElement('div');
 items.className='ductbank-ampacity-over-items';
 entries.slice(0,8).forEach(entry=>{
   const item=document.createElement('button');
   item.type='button';
   item.className='ductbank-ampacity-over-item';
   const tag=document.createElement('span');
   tag.className='ductbank-ampacity-over-tag';
   tag.textContent=entry.tag;
   const message=document.createElement('span');
   message.className='ductbank-ampacity-over-message';
   message.textContent=`Load ${formatDuctbankAmpacity(entry.load)} exceeds estimate`;
   const detail=document.createElement('span');
   detail.className='ductbank-ampacity-over-detail';
   const estimates=[
     `Neher ${formatDuctbankAmpacity(entry.neher)}`,
     `Finite ${formatDuctbankAmpacity(entry.finite)}`
   ];
   const conduit=entry.conduitId ? `Conduit ${entry.conduitId}` : 'No conduit';
   const extraReasons=entry.reasons.filter(reason=>!reason.startsWith('Neher ') && !reason.startsWith('Finite '));
   detail.textContent=`${estimates.join(' / ')} - ${conduit}${extraReasons.length ? ` - ${extraReasons.join('; ')}` : ''}`;
   item.append(tag,message,detail);
   item.addEventListener('click',()=>focusDuctbankAmpacityOverEntry(entry));
   items.appendChild(item);
 });
 list.appendChild(items);
 if(entries.length > 8){
   const more=document.createElement('p');
   more.className='ductbank-ampacity-over-more';
   more.textContent=`${entries.length - 8} additional over-limit cable${entries.length - 8 === 1 ? '' : 's'} are visible in the ampacity filter.`;
   list.appendChild(more);
 }
}

function renderDuctbankWarningList(context){
 const list=document.getElementById('ductbank-warning-list');
 if(!list) return;
 list.innerHTML='';
 const visibleIssues=context.issues.filter(issue=>ductbankIssueMatchesActiveFilter(issue,context));
 if(!visibleIssues.length){
   list.hidden=true;
   return;
 }
 list.hidden=false;
 const header=document.createElement('div');
 header.className='ductbank-warning-list-header';
 const title=document.createElement('strong');
 title.textContent='Actionable warnings';
 const helper=document.createElement('span');
 helper.textContent=activeDuctbankFilter==='all'
   ? 'Select a warning to jump to the row that needs attention.'
   : 'Showing warnings that match the active filter.';
 header.append(title,helper);
 list.appendChild(header);
 const items=document.createElement('div');
 items.className='ductbank-warning-items';
 visibleIssues.slice(0,8).forEach((issue,index)=>{
   const item=document.createElement('button');
   item.type='button';
   item.className=`ductbank-warning-item ductbank-warning-item--${issue.code}`;
   item.dataset.ductbankIssueIndex=String(index);
   const severity=document.createElement('span');
   severity.className='ductbank-warning-severity';
   severity.textContent=issue.severity;
   const message=document.createElement('span');
   message.className='ductbank-warning-message';
   message.textContent=issue.message;
   const fix=document.createElement('span');
   fix.className='ductbank-warning-fix';
   fix.textContent=issue.fix;
   item.append(severity,message,fix);
   item.addEventListener('click',()=>focusDuctbankIssue(issue));
   items.appendChild(item);
 });
 list.appendChild(items);
 if(visibleIssues.length > 8){
   const more=document.createElement('p');
   more.className='ductbank-warning-more';
   more.textContent=`${visibleIssues.length - 8} additional warning${visibleIssues.length - 8 === 1 ? '' : 's'} are visible in the highlighted table rows.`;
   list.appendChild(more);
 }
}

function updateDuctbankSummary(context){
 const assigned=context.cables.filter(c=>context.conduitIds.has(normalizeDuctbankId(c.conduit_id))).length;
 const unassigned=context.cables.length - assigned;
 const warningCount=context.issues.filter(issue=>!['thermal','ampacity'].includes(issue.code)).length;
 const thermalCount=context.thermalConduits.size;
 const ampacityCount=context.ampacityCables.size;
 setDuctbankText('ductbank-conduit-count',String(context.conduits.length));
 setDuctbankText('ductbank-cable-count',String(context.cables.length));
 setDuctbankText('ductbank-assigned-count',String(assigned));
 setDuctbankText('ductbank-unassigned-count',String(unassigned));
 setDuctbankText('ductbank-warning-count',String(warningCount));
 setDuctbankText('ductbank-thermal-count',String(thermalCount));
 setDuctbankText('ductbank-ampacity-count',String(ampacityCount));
 const summary=document.getElementById('ductbank-readiness-summary');
 if(summary){
   if(!context.conduits.length && !context.cables.length){
     summary.className='load-validation-summary';
     summary.textContent='Add conduits and cables or load sample data to begin a ductbank check.';
   }else if(warningCount || thermalCount || ampacityCount){
     summary.className='load-validation-summary is-warning';
     const parts=[];
     if(warningCount) parts.push(`${warningCount} data or fill warning${warningCount===1?'':'s'}`);
     if(thermalCount) parts.push(`${thermalCount} thermal alert${thermalCount===1?'':'s'}`);
     if(ampacityCount) parts.push(`${ampacityCount} ampacity alert${ampacityCount===1?'':'s'}`);
     summary.textContent=`Review ${parts.join(' and ')} before exporting the calculation package.`;
   }else{
     summary.className='load-validation-summary is-success';
     summary.textContent='Ductbank inputs are ready for fill, thermal analysis, and export.';
   }
 }
 renderDuctbankAmpacityOverList(context);
 renderDuctbankWarningList(context);
 updateDuctbankWorkflowState(context, warningCount, thermalCount, ampacityCount);
}

function decorateDuctbankActionButtons(){
 document.querySelectorAll('#conduitTable .removeBtn, #conduitTable .duplicateBtn, #cableTable .removeBtn, #cableTable .duplicateBtn, #heatSourceTable .removeBtn').forEach(btn=>{
   if(btn.dataset.iconified==='true') return;
   const iconClass=Array.from(btn.classList).find(cls=>DUCTBANK_ROW_ACTION_ICONS[cls]);
   const icon=DUCTBANK_ROW_ACTION_ICONS[iconClass];
   if(!icon) return;
   const label=btn.getAttribute('aria-label') || btn.title || btn.textContent.trim();
   btn.classList.add('row-icon-btn');
   btn.title=label;
   btn.setAttribute('aria-label',label);
   btn.innerHTML=`<img src="${icon}" alt="" aria-hidden="true" class="control-icon" loading="lazy" decoding="async">`;
   btn.dataset.iconified='true';
 });
}

function updateDuctbankExperience(){
 const context=collectDuctbankContext();
 updateDuctbankSummary(context);
 applyDuctbankQuickFilter(context);
 decorateDuctbankActionButtons();
 refreshDuctbankTables();
}

function validateDuctbankInputs({ focusFirst = false, scrollToWarnings = true } = {}){
 validateThermalInputs();
 const context=collectDuctbankContext();
 updateDuctbankSummary(context);
 applyDuctbankQuickFilter(context);
 if(context.issues.length){
   const warningList=document.getElementById('ductbank-warning-list');
   if(scrollToWarnings && warningList){
     warningList.scrollIntoView({behavior:'smooth',block:'nearest'});
   }
   if(focusFirst) focusDuctbankIssue(context.issues[0]);
   showToast(`${context.issues.length} ductbank warning${context.issues.length === 1 ? '' : 's'} need review`);
 }else{
   showToast('Ductbank inputs look ready');
 }
 return context;
}

function scheduleDuctbankExperienceUpdate(){
 if(ductbankExperienceRaf) cancelAnimationFrame(ductbankExperienceRaf);
 ductbankExperienceRaf=requestAnimationFrame(()=>{
   ductbankExperienceRaf=0;
   updateDuctbankExperience();
 });
}

function initDuctbankExperience(){
 document.querySelectorAll('[data-ductbank-filter]').forEach(btn=>{
   btn.addEventListener('click',()=>{
     activeDuctbankFilter=btn.dataset.ductbankFilter || 'all';
     updateDuctbankExperience();
   });
 });
 document.querySelectorAll('[data-ductbank-summary-filter]').forEach(card=>{
   const applySummaryFilter=()=>{
     activeDuctbankFilter=card.dataset.ductbankSummaryFilter || 'all';
     updateDuctbankExperience();
     if(['missing','fill','thermal','ampacity'].includes(activeDuctbankFilter)){
       const targetId=activeDuctbankFilter==='ampacity' ? 'ductbank-ampacity-over-list' : 'ductbank-warning-list';
       document.getElementById(targetId)?.scrollIntoView({behavior:'smooth',block:'nearest'});
     }
   };
   card.addEventListener('click',applySummaryFilter);
   card.addEventListener('keydown',event=>{
     if(event.key==='Enter' || event.key===' '){
       event.preventDefault();
       applySummaryFilter();
     }
   });
 });
 ['conduit-search','cable-search'].forEach(id=>{
   const input=document.getElementById(id);
   if(input) input.addEventListener('input',scheduleDuctbankExperienceUpdate);
 });
 document.addEventListener('input',event=>{
   if(event.target.closest('#conduitTable,#cableTable,#heatSourceTable,#infoSection,#paramSection')){
     scheduleDuctbankExperienceUpdate();
   }
 });
 document.addEventListener('change',event=>{
   if(event.target.closest('#conduitTable,#cableTable,#heatSourceTable,#infoSection,#paramSection')){
     scheduleDuctbankExperienceUpdate();
   }
 });
 document.addEventListener('click',event=>{
   if(event.target.closest('#addConduit,#addCable,#sampleConduits,#sampleCables,#loadDuctbankExample,#restoreDuctbankDefaults,#autoAssignCablesBtn,#clearConduitFiltersBtn,#clearCableFiltersBtn,#addHeatSource,#resetBtn,#deleteDataBtn,#calc,#thermalBtn,#heatToggleBtn,#conduitTable button,#cableTable button,#heatSourceTable button')){
     setTimeout(scheduleDuctbankExperienceUpdate,0);
     setTimeout(scheduleDuctbankExperienceUpdate,800);
   }
 });
 ['#conduitTable tbody','#cableTable tbody','#heatSourceTable tbody','#ampacityReport'].forEach(selector=>{
   const node=document.querySelector(selector);
   if(!node) return;
   const observer=new MutationObserver(scheduleDuctbankExperienceUpdate);
   observer.observe(node,{childList:true,subtree:true});
 });
 scheduleDuctbankExperienceUpdate();
}

function modalField({ label, name, type = 'text', value = '', options = null, min = null, step = null, required = false, wide = false, help = '' }){
 const wrap=document.createElement('label');
 wrap.className=`modal-form-field${wide ? ' modal-form-field-wide' : ''}`;
 const span=document.createElement('span');
 span.textContent=label;
 wrap.appendChild(span);
 const field=options ? document.createElement('select') : document.createElement('input');
 field.name=name;
 if(!options) field.type=type;
 if(min !== null) field.min=String(min);
 if(step !== null) field.step=String(step);
 if(required) field.required=true;
 if(options){
   options.forEach(option=>{
     const opt=document.createElement('option');
     if(typeof option === 'object'){
       opt.value=option.value;
       opt.textContent=option.label;
     }else{
       opt.value=option;
       opt.textContent=option || 'Unassigned';
     }
     field.appendChild(opt);
   });
 }
 field.value=value ?? '';
 wrap.appendChild(field);
 if(help){
   const helper=document.createElement('span');
   helper.className='modal-helper-text';
   helper.textContent=help;
   wrap.appendChild(helper);
 }
 return wrap;
}

function getFormData(form){
 return Object.fromEntries(new FormData(form).entries());
}

function renderDuctbankEntryForm(body, fields){
 const form=document.createElement('form');
 form.className='ductbank-entry-form load-entry-grid';
 fields.forEach(field=>form.appendChild(modalField(field)));
 body.appendChild(form);
 return form;
}

function generateNextConduitId(){
 let max=0, digits=0, prefix='C';
 document.querySelectorAll('#conduitTable tbody tr').forEach(tr=>{
   const value=tr.children[0]?.querySelector('input')?.value.trim();
   const match=value && value.match(/^(.*?)(\d+)$/);
   if(match){
     prefix=match[1] || 'C';
     digits=Math.max(digits,match[2].length);
     max=Math.max(max,parseInt(match[2],10));
   }
 });
 return prefix + String(max + 1).padStart(digits || 1,'0');
}

function updateSelectOptions(select, values, selectedValue){
 select.innerHTML='';
 values.forEach(value=>{
   const opt=document.createElement('option');
   opt.value=value;
   opt.textContent=value || 'Unassigned';
   select.appendChild(opt);
 });
 if(selectedValue !== undefined) select.value=selectedValue;
}

function conductorSizeEntryOptions(){
 const values=Array.from(document.querySelectorAll('#sizeList option'))
   .map(option=>option.value)
   .filter(Boolean);
 return values.length ? values : Object.keys(AWG_AREA).map(size=>size.includes('/') || /^\d+$/.test(size) ? `#${size} AWG` : `${size} kcmil`);
}

async function ensureDuctbankConductorProperties(){
 if(!Object.keys(window.CONDUCTOR_PROPS || {}).length && typeof loadConductorProperties === 'function'){
   await loadConductorProperties();
 }
 if(window.CONDUCTOR_PROPS) CONDUCTOR_PROPS=window.CONDUCTOR_PROPS;
}

function applyCableEntryDefaults(form, { force = false } = {}){
 const size=form.elements.conductor_size?.value.trim();
 const key=normalizeSizeKey(size);
 const props=window.CONDUCTOR_PROPS?.[key] || CONDUCTOR_PROPS[key];
 if(!props) return;
 const insulation=form.elements.insulation_thickness;
 const weight=form.elements.weight;
 const material=form.elements.conductor_material?.value || 'Copper';
 if(insulation && (force || !insulation.value)) insulation.value=props.insulation_thickness || '';
 if(weight && (force || !weight.value)){
   const areaIn2=props.area_cm*7.854e-7;
   const density=material.toLowerCase().includes('al') ? 0.0975 : 0.323;
   weight.value=(areaIn2*density*12).toFixed(3);
 }
}

function openConduitEntryModal(){
 const typeOptions=Object.keys(CONDUIT_SPECS);
 const initialType=typeOptions.includes('PVC Sch 40') ? 'PVC Sch 40' : typeOptions[0];
 openModal({
   title:'Add Conduit',
   description:'Enter the required conduit details. The layout controls will place the row automatically.',
   primaryText:'Add Conduit',
   defaultWidth:'medium',
   render(body,controller){
     const form=renderDuctbankEntryForm(body,[
       {label:'Conduit ID',name:'conduit_id',value:generateNextConduitId(),required:true},
       {label:'Type',name:'conduit_type',options:typeOptions,value:initialType},
       {label:'Trade Size',name:'trade_size',options:Object.keys(CONDUIT_SPECS[initialType] || {}),value:'4'}
     ]);
     const typeSel=form.elements.conduit_type;
     const sizeSel=form.elements.trade_size;
     typeSel.addEventListener('change',()=>{
       updateSelectOptions(sizeSel,Object.keys(CONDUIT_SPECS[typeSel.value] || {}),sizeSel.value);
       if(!sizeSel.value) sizeSel.value=sizeSel.options[0]?.value || '';
     });
     controller.registerForm(form);
     return form.elements.conduit_id;
   },
   onSubmit(controller){
     const form=controller.body.querySelector('.ductbank-entry-form');
     const values=getFormData(form);
     const conduitId=normalizeDuctbankId(values.conduit_id);
     if(!conduitId){
       showAlertModal('Conduit ID Required','Enter a conduit ID before adding the row.');
       return false;
     }
     if(getAllConduits().some(conduit=>normalizeDuctbankId(conduit.conduit_id)===conduitId)){
       showAlertModal('Duplicate Conduit ID','Each conduit needs a unique ID.');
       return false;
     }
     addConduitRow({
       conduit_id:conduitId,
       conduit_type:values.conduit_type,
       trade_size:values.trade_size
     });
     drawGrid();
     updateAmpacityReport(false);
     saveDuctbankSession();
     scheduleDuctbankExperienceUpdate();
     showToast(`Added conduit ${conduitId}`);
     return true;
   }
 });
}

async function openCableEntryModal(){
 await ensureDuctbankConductorProperties();
 const conduits=getAllConduits();
 const conduitOptions=conduits.map(conduit=>normalizeDuctbankId(conduit.conduit_id)).filter(Boolean);
 if(!conduitOptions.length) conduitOptions.push('');
 openModal({
   title:'Add Cable',
   description:'Enter the cable fields needed for fill and thermal checks.',
   primaryText:'Add Cable',
   defaultWidth:'wide',
   render(body,controller){
     const form=renderDuctbankEntryForm(body,[
       {label:'Cable Tag',name:'tag',value:generateNextCableTag(),required:true},
       {label:'Type',name:'cable_type',options:['Power','Control','Signal'],value:DEFAULT_CABLE_ENTRY.cable_type},
       {label:'Conduit',name:'conduit_id',options:conduitOptions,value:conduitOptions[0] || '',help:conduitOptions[0] ? '' : 'Add a conduit first to assign this cable.'},
       {label:'Outside Diameter (in)',name:'diameter',type:'number',value:DEFAULT_CABLE_ENTRY.diameter,min:0,step:'any',required:true},
       {label:'Conductors',name:'conductors',type:'number',value:DEFAULT_CABLE_ENTRY.conductors,min:1,step:1},
       {label:'Conductor Size',name:'conductor_size',options:conductorSizeEntryOptions(),value:DEFAULT_CABLE_ENTRY.conductor_size},
       {label:'Estimated Load (A)',name:'est_load',type:'number',value:DEFAULT_CABLE_ENTRY.est_load,min:0,step:'any'},
       {label:'Material',name:'conductor_material',options:['Copper','Aluminum'],value:DEFAULT_CABLE_ENTRY.conductor_material}
     ]);
     const details=document.createElement('details');
     details.className='ductbank-modal-advanced modal-form-field-wide';
     const summary=document.createElement('summary');
     summary.textContent='Advanced cable properties';
     details.appendChild(summary);
     const advanced=document.createElement('div');
     advanced.className='load-entry-grid';
     [
       {label:'Insulation Type',name:'insulation_type',options:insulationTypesForRating(getConductorRating()),value:DEFAULT_CABLE_ENTRY.insulation_type},
       {label:'Insulation Rating',name:'insulation_rating',options:['60','75','90'],value:String(getConductorRating())},
       {label:'Insulation Thickness (in)',name:'insulation_thickness',type:'number',value:'',min:0,step:'any'},
       {label:'Weight (lb/ft)',name:'weight',type:'number',value:'',min:0,step:'any'},
       {label:'Voltage Rating',name:'voltage_rating',value:DEFAULT_CABLE_ENTRY.voltage_rating},
       {label:'Shielding / Jacket',name:'shielding_jacket',options:['','Lead','Copper Tape'],value:DEFAULT_CABLE_ENTRY.shielding_jacket}
     ].forEach(field=>advanced.appendChild(modalField(field)));
     details.appendChild(advanced);
     form.appendChild(details);
     ['conductor_size','conductor_material'].forEach(name=>{
       form.elements[name]?.addEventListener('change',()=>applyCableEntryDefaults(form,{force:true}));
     });
     applyCableEntryDefaults(form);
     controller.registerForm(form);
     return form.elements.tag;
   },
   onSubmit(controller){
     const form=controller.body.querySelector('.ductbank-entry-form');
     const values=getFormData(form);
     const tag=normalizeDuctbankId(values.tag);
     const conduitId=normalizeDuctbankId(values.conduit_id);
     if(!tag){
       showAlertModal('Cable Tag Required','Enter a cable tag before adding the row.');
       return false;
     }
     if(getAllCables().some(cable=>normalizeDuctbankId(cable.tag)===tag)){
       showAlertModal('Duplicate Cable Tag','Each cable needs a unique tag.');
       return false;
     }
     if(!(parseFloat(values.diameter)>0)){
       showAlertModal('Cable Diameter Required','Enter the cable outside diameter in inches.');
       return false;
     }
     if(conduits.length && !conduitId){
       showAlertModal('Conduit Assignment Required','Choose the conduit this cable will be installed in.');
       return false;
     }
     if(conduitId && !conduits.some(conduit=>normalizeDuctbankId(conduit.conduit_id)===conduitId)){
       showAlertModal('Missing Conduit','Choose an existing conduit or add the missing conduit first.');
       return false;
     }
     applyCableEntryDefaults(form);
     addCableRow({...values,tag,conduit_id:conduitId},{defer:true});
     updateInsulationOptions();
     checkInsulationThickness();
     drawGrid();
     updateAmpacityReport();
     saveDuctbankSession();
     scheduleDuctbankExperienceUpdate();
     showToast(`Added cable ${tag}`);
     return true;
   }
 });
}

function loadSampleConduits({ silent = false } = {}){
 document.querySelector('#conduitTable tbody').innerHTML='';
 SAMPLE_CONDUITS.forEach(addConduitRow);
 const search=document.getElementById('conduit-search');
 if(search){
   search.value='';
   filterTable(document.getElementById('conduitTable'), '');
 }
 drawGrid();
 updateAmpacityReport(false);
 saveDuctbankSession();
 scheduleDuctbankExperienceUpdate();
 if(!silent) showToast('Loaded sample conduits');
}

async function loadSampleCables({ silent = false } = {}){
  if(!Object.keys(window.CONDUCTOR_PROPS||{}).length){
    await ensureDuctbankConductorProperties();
  }
  if(window.CONDUCTOR_PROPS) CONDUCTOR_PROPS = window.CONDUCTOR_PROPS;
  const tbody=document.querySelector('#cableTable tbody');
  tbody.innerHTML='';

  const samples=SAMPLE_CABLES.map(c=>{
    const props=window.CONDUCTOR_PROPS?.[c.conductor_size];
    return Object.assign({},c,{
      insulation_thickness:c.insulation_thickness??props?.insulation_thickness??0.05,
      weight:c.weight??(props?((props.area_cm*7.854e-7)*0.323*12).toFixed(3):'')
    });
  });
  samples.forEach(s=>addCableRow(s,{defer:true}));
  const search=document.getElementById('cable-search');
  if(search){
    search.value='';
    filterTable(document.getElementById('cableTable'), '');
  }
  updateInsulationOptions();
  checkInsulationThickness();
  drawGrid();
  updateAmpacityReport();
  saveDuctbankSession();
  scheduleDuctbankExperienceUpdate();
  if(!silent) showToast('Loaded sample cables');
}

async function loadCompleteDuctbankExample(){
 applyDuctbankDefaults({onlyBlank:false,silent:true,persist:false});
 const tagEl=document.getElementById('ductbankTag');
 if(tagEl) tagEl.value='DB-01';
 loadSampleConduits({silent:true});
 document.querySelectorAll('#conduitTable tbody tr').forEach(row=>{
   const size=row.querySelector('[name="trade_size"]');
   if(size && Array.from(size.options).some(option=>option.value==='6')) size.value='6';
 });
 autoPlaceConduits();
 await loadSampleCables({silent:true});
 validateDuctbankInputs({scrollToWarnings:false});
 saveDuctbankSession();
 showToast('Loaded complete ductbank example');
}

document.getElementById('addConduit').addEventListener('click',openConduitEntryModal);
document.getElementById('addCable').addEventListener('click',()=>{openCableEntryModal();});
document.getElementById('validateDuctbankBtn').addEventListener('click',()=>validateDuctbankInputs());
document.getElementById('restoreDuctbankDefaults').addEventListener('click',()=>applyDuctbankDefaults({onlyBlank:false}));
document.getElementById('loadDuctbankExample').addEventListener('click',()=>{loadCompleteDuctbankExample();});
document.getElementById('sampleConduits').addEventListener('click',()=>loadSampleConduits());
document.getElementById('sampleCables').addEventListener('click',()=>{loadSampleCables();});
document.getElementById('downloadConduitTemplateBtn').addEventListener('click',()=>downloadDuctbankTemplate('conduits'));
document.getElementById('downloadCableTemplateBtn').addEventListener('click',()=>downloadDuctbankTemplate('cables'));
document.getElementById('autoAssignCablesBtn').addEventListener('click',autoAssignUnassignedCables);
document.getElementById('clearConduitFiltersBtn').addEventListener('click',()=>clearDuctbankFilters('conduit'));
document.getElementById('clearCableFiltersBtn').addEventListener('click',()=>clearDuctbankFilters('cable'));
document.addEventListener('click',event=>{
 const action=event.target.closest('[data-ductbank-empty-action]')?.dataset.ductbankEmptyAction;
 if(!action) return;
 if(action==='add-conduit') openConduitEntryModal();
 if(action==='add-cable') openCableEntryModal();
 if(action==='complete-example') loadCompleteDuctbankExample();
});

document.getElementById('importConduits').addEventListener('change',e=>{const f=e.target.files[0];if(f)importCSV(f,data=>{document.querySelector('#conduitTable tbody').innerHTML='';data.forEach(addConduitRow);drawGrid();updateAmpacityReport();saveDuctbankSession();});});
document.getElementById('importCables').addEventListener('change',e=>{const f=e.target.files[0];if(f)importCSV(f,data=>{document.querySelector('#cableTable tbody').innerHTML='';data.forEach(d=>addCableRow(d,{defer:true}));updateInsulationOptions();drawGrid();updateAmpacityReport();saveDuctbankSession();});});

document.getElementById('calc').addEventListener('click',()=>{
  drawGrid();
  updateAmpacityReport();
  const param=document.getElementById('paramSection');
  if(param) param.open=true;
});

['hSpacing','vSpacing'].forEach(id=>{
 document.getElementById(id).addEventListener('input',()=>{
  drawGrid();
  updateAmpacityReport();
 });
});

document.getElementById('exportBtn').addEventListener('click',()=>{
 const wb=XLSX.utils.book_new();
 const conduits=getAllConduits();
 const cables=getAllCables();
 const fill=fillResults();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(conduits),'conduits');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(cables),'cables');
 const compliance=Object.keys(fill).map(k=>{const f=fill[k];return{conduit_id:k,fill_pct:f.fillPct.toFixed(2),cable_count:f.cables.length};});
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(compliance),'fill');
 XLSX.writeFile(wb,'ductbank_data.xlsx');
 exportCalcData(conduits,cables);
});

function exportCSV(filename,headers,rows,meta={}){
 const csv=[];
 Object.keys(meta).forEach(k=>{csv.push(`# ${k}: ${meta[k]}`);});
 csv.push(headers.join(','));
 rows.forEach(r=>{csv.push(headers.map(h=>r[h]!==undefined?r[h]:'').join(','));});
 const blob=new Blob([csv.join('\n')],{type:'text/csv;charset=utf-8;'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

function downloadDuctbankTemplate(type){
 if(type==='conduits'){
   exportCSV('ductbank_conduits_template.csv',DUCTBANK_CONDUIT_TEMPLATE_HEADERS,[
     {conduit_id:'C1',conduit_type:'PVC Sch 40',trade_size:'4',x:'0',y:'0'}
   ],{version:CTR_VERSION,type:'ductbank conduits template'});
   showToast('Downloaded conduit template');
   return;
 }
 exportCSV('ductbank_cables_template.csv',DUCTBANK_CABLE_TEMPLATE_HEADERS,[
   {
     tag:'CBL01',
     cable_type:'Power',
     diameter:'1.3',
     conductors:'3',
     conductor_size:'#2 AWG',
     insulation_thickness:'0.05',
     weight:'3.5',
     est_load:'115',
     conduit_id:'C1',
     conductor_material:'Copper',
     insulation_type:'THHN',
     insulation_rating:'90',
     voltage_rating:'600V',
     shielding_jacket:''
   }
 ],{version:CTR_VERSION,type:'ductbank cables template'});
 showToast('Downloaded cable template');
}

function autoAssignUnassignedCables(){
 const conduitIds=getAllConduits().map(conduit=>normalizeDuctbankId(conduit.conduit_id)).filter(Boolean);
 if(!conduitIds.length){
   showToast('Add conduits before auto assigning cables');
   return;
 }
 const validConduits=new Set(conduitIds);
 const counts=new Map(conduitIds.map(id=>[id,0]));
 getAllCables().forEach(cable=>{
   const conduitId=normalizeDuctbankId(cable.conduit_id);
   if(validConduits.has(conduitId)) counts.set(conduitId,(counts.get(conduitId) || 0) + 1);
 });
 let assigned=0;
 document.querySelectorAll('#cableTable tbody tr').forEach(row=>{
   const conduitInput=row.querySelector('[name="conduit_id"]');
   if(!conduitInput) return;
   const current=normalizeDuctbankId(conduitInput.value);
   if(current && validConduits.has(current)) return;
   const next=conduitIds.reduce((best,id)=>(counts.get(id) || 0) < (counts.get(best) || 0) ? id : best,conduitIds[0]);
   conduitInput.value=next;
   counts.set(next,(counts.get(next) || 0) + 1);
   assigned += 1;
 });
 if(!assigned){
   showToast('All cables are already assigned');
   scheduleDuctbankExperienceUpdate();
   return;
 }
 drawGrid();
 updateAmpacityReport();
 saveDuctbankSession();
 updateDuctbankExperience();
 showToast(`Assigned ${assigned} cable${assigned === 1 ? '' : 's'} to available conduits`);
}

function exportConduits(){
 const rows=getAllConduits();
 const headers=['conduit_id','conduit_type','trade_size','x','y'];
 const meta={version:CTR_VERSION,timestamp:new Date().toISOString()};
 exportCSV('ductbank_conduits.csv',headers,rows,meta);
}

function exportCables(){
 const rows=getAllCables();
 const headers=DUCTBANK_CABLE_TEMPLATE_HEADERS;
 const meta={version:CTR_VERSION,timestamp:new Date().toISOString()};
 exportCSV('ductbank_cables.csv',headers,rows,meta);
}

function gatherInputParams(){
 return {
  ductbankTag:document.getElementById('ductbankTag').value,
  concreteEncasement:document.getElementById('concreteEncasement').checked,
  ductbankDepth:parseFloat(document.getElementById('ductbankDepth').value)||0,
  earthTemp:parseFloat(document.getElementById('earthTemp').value)||0,
  airTemp:parseFloat(document.getElementById('airTemp').value)||0,
  soilResistivity:parseFloat(document.getElementById('soilResistivity').value)||90,
  moistureContent:parseFloat(document.getElementById('moistureContent').value)||0,
  heatSources:document.getElementById('heatSources').checked,
  hSpacing:parseFloat(document.getElementById('hSpacing').value)||3,
  vSpacing:parseFloat(document.getElementById('vSpacing').value)||4,
  topPad:parseFloat(document.getElementById('topPad').value)||0,
  bottomPad:parseFloat(document.getElementById('bottomPad').value)||0,
  leftPad:parseFloat(document.getElementById('leftPad').value)||0,
  rightPad:parseFloat(document.getElementById('rightPad').value)||0,
  perRow:parseInt(document.getElementById('perRow').value)||0,
  conductorRating:getConductorRating()
 };
}

function exportCalcData(conduits,cables){
 const params=gatherInputParams();
 const total=cables.length;
 const countMap={};
 cables.forEach(c=>{countMap[c.conduit_id]=(countMap[c.conduit_id]||0)+1;});
 const details=cables.map(c=>{
   const d=ampacityDetails(c,{...params,earthTemp:fToC(params.earthTemp),airTemp:isNaN(params.airTemp)?NaN:fToC(params.airTemp)},countMap[c.conduit_id],total);
   return {tag:c.tag,...d};
 });
const exportObj={version:CTR_VERSION,timestamp:new Date().toISOString(),inputs:{params,conduits,cables},results:details};
 const blob=new Blob([JSON.stringify(exportObj,null,2)],{type:'application/json'});
 const a=document.createElement('a');
 a.href=URL.createObjectURL(blob);
 a.download='ductbank_analysis.json';
 document.body.appendChild(a);a.click();document.body.removeChild(a);
 URL.revokeObjectURL(a.href);
 const csvHeaders=['tag','Rdc','Yc','Rcond','Rins','Rduct','Rsoil','Rca','deltaTd','rating','conductorFactor','ampacity'];
 const meta={version:CTR_VERSION,timestamp:new Date().toISOString(),inputs:JSON.stringify(params)};
 exportCSV('ductbank_analysis.csv',csvHeaders,details,meta);
}

function buildCalcReport(){
 const params=gatherInputParams();
 const conduits=getAllConduits();
 const cables=getAllCables();
 const total=cables.length;
 const countMap={};
 cables.forEach(c=>{countMap[c.conduit_id]=(countMap[c.conduit_id]||0)+1;});
 const info={
  ductbankDepth:{unit:'in'},earthTemp:{unit:'\u00B0F'},
  airTemp:{unit:'\u00B0F'},soilResistivity:{unit:'\u00B0C\u00B7cm/W'},
  moistureContent:{unit:'%'},hSpacing:{unit:'in'},vSpacing:{unit:'in'},
  topPad:{unit:'in'},bottomPad:{unit:'in'},leftPad:{unit:'in'},rightPad:{unit:'in'},
  conductorRating:{unit:'\u00B0C'}
 };
 const lines=[];
 lines.push('Cable Ampacity Calculation Report');
 lines.push(`Version: ${CTR_VERSION}`);
 lines.push(`Timestamp: ${new Date().toISOString()}`);
 lines.push('');
 lines.push('Input Parameters');
 lines.push('----------------');
 Object.keys(params).forEach(k=>{
  const unit=info[k]?.unit||'';
  lines.push(`${k}: ${params[k]}${unit?` ${unit}`:''}`);
 });
 lines.push('');
 lines.push(`Conduits: ${conduits.length}`);
 lines.push(`Cables: ${cables.length}`);
 lines.push('');
 lines.push('Ampacity Results');
 lines.push('----------------');
 lines.push('Cable             Load  Tc  Cond  Neher  Finite  Overload');
 lines.push('----------------------------------------------------------');
 cables.forEach(c=>{
  const d=ampacityDetails(c,{...params,earthTemp:fToC(params.earthTemp),airTemp:isNaN(params.airTemp)?NaN:fToC(params.airTemp)},countMap[c.conduit_id],total);
  const finite=parseFloat(window.finiteAmpacity?.[c.tag]);
  const finiteStr=isNaN(finite)?'N/A':finite.toFixed(1);
  const load=parseFloat(c.est_load)||0;
  const over=(load>(isNaN(d.ampacity)?Infinity:d.ampacity))||(load>(isNaN(finite)?Infinity:finite));
  lines.push(`${(c.tag||'').padEnd(16)}${load.toFixed(1).padStart(5)} ${d.rating.toFixed(0).padStart(3)} ${d.conductorFactor.toFixed(0).padStart(5)} ${(d.ampacity.toFixed(1)).padStart(6)} ${finiteStr.padStart(7)} ${over?'Yes':'No'}`);
  lines.push(`  Rdc=${d.Rdc.toFixed(4)}, Yc=${d.Yc.toFixed(3)}, \u0394Td=${d.deltaTd.toFixed(2)}, Rcond=${d.Rcond.toFixed(3)}, Rins=${d.Rins.toFixed(3)}, Rduct=${d.Rduct.toFixed(3)}, Rsoil=${d.Rsoil.toFixed(3)}, Rca=${d.Rca.toFixed(3)}`);
 });
 lines.push('');
 lines.push('Ampacity calculations use the Neher-McGrath equation with cable-specific temperature ratings and current-carrying conductor count. Formulas for Yc and \u0394Td appear in the AC Resistance Correction documentation. Rdc, Rcond, Rins, Rduct, Rsoil and Rca are defined in Variable Definitions.');
 lines.push('');
 lines.push('Variable Legend');
 lines.push('---------------');
 lines.push('load - estimated cable load (A)');
lines.push('Neher - ampacity via Neher-McGrath (A)');
lines.push('Finite - ampacity from finite-element solver (A)');
 lines.push('Tc - cable-specific allowable conductor temperature (\u00B0C)');
 lines.push('Cond - current-carrying conductor count used for heat loss');
 lines.push('Rdc - dc conductor resistance at T_c (\u03A9/m)');
 lines.push('Yc - ac resistance factor (dimensionless)');
 lines.push('\u0394Td - dielectric-loss temperature rise (\u00B0C)');
 lines.push('Rcond - conductor thermal resistance (\u00B0C·m/W)');
 lines.push('Rins - insulation thermal resistance (\u00B0C·m/W)');
 lines.push('Rduct - raceway thermal resistance (\u00B0C·m/W)');
 lines.push('Rsoil - soil thermal resistance (\u00B0C·m/W)');
 lines.push('Rca - total external thermal resistance (\u00B0C·m/W)');
 return lines.join('\n');
}

async function downloadCalcReportDocx(){
 const params=gatherInputParams();
 const conduits=getAllConduits();
 const cables=getAllCables();
 const total=cables.length;
 const countMap={};
 cables.forEach(c=>{countMap[c.conduit_id]=(countMap[c.conduit_id]||0)+1;});
 const info={
  ductbankDepth:{unit:'in'},earthTemp:{unit:'\u00B0F'},
  airTemp:{unit:'\u00B0F'},soilResistivity:{unit:'\u00B0C\u00B7cm/W'},
  moistureContent:{unit:'%'},hSpacing:{unit:'in'},vSpacing:{unit:'in'},
  topPad:{unit:'in'},bottomPad:{unit:'in'},leftPad:{unit:'in'},rightPad:{unit:'in'},
 conductorRating:{unit:'\u00B0C'}
};

const doc=new docx.Document({
 creator:'Cable Ampacity Tool',
 title:'Cable Ampacity Calculation Report',
 description:'Ampacity results generated by Cable Ampacity Tool',
 sections:[]
});
const children=[];
 children.push(new docx.Paragraph({text:'Cable Ampacity Calculation Report',heading:docx.HeadingLevel.HEADING_1}));
 children.push(new docx.Paragraph(`Version: ${CTR_VERSION}`));
 children.push(new docx.Paragraph(`Timestamp: ${new Date().toISOString()}`));
 children.push(new docx.Paragraph(''));
 children.push(new docx.Paragraph('Input Parameters'));
 children.push(new docx.Paragraph('----------------'));
 Object.keys(params).forEach(k=>{
  const unit=info[k]?.unit||'';
  children.push(new docx.Paragraph(`${k}: ${params[k]}${unit?` ${unit}`:''}`));
 });
 children.push(new docx.Paragraph(''));
 children.push(new docx.Paragraph(`Conduits: ${conduits.length}`));
 children.push(new docx.Paragraph(`Cables: ${cables.length}`));
 children.push(new docx.Paragraph(''));
 async function captureLayout(){
  const svg=document.getElementById('grid');
  if(!svg) return null;
  const serializer=new XMLSerializer();
  let source=serializer.serializeToString(svg);
  if(!source.match(/^<svg[^>]+xmlns=/)){
   source=source.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const svgBlob=new Blob([source],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(svgBlob);
  const img=new Image();
  await new Promise(res=>{img.onload=res; img.src=url;});
  const canvas=document.createElement('canvas');
  canvas.width=img.width; canvas.height=img.height;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(img,0,0);
  URL.revokeObjectURL(url);
  const buffer=await new Promise(resolve=>
   canvas.toBlob(b=>b?b.arrayBuffer().then(buf=>resolve(new Uint8Array(buf))):resolve(null),'image/png')
  );
  return buffer?{buffer,width:img.width,height:img.height}:null;
 }
 const imgData=await captureLayout();
 if(imgData){
 const image=new docx.ImageRun({data:imgData.buffer,transformation:{width:imgData.width,height:imgData.height}});
 children.push(new docx.Paragraph({children:[image]}));
 children.push(new docx.Paragraph(''));
 }
 children.push(new docx.Paragraph('Ampacity Results'));
 children.push(new docx.Paragraph('----------------'));

  const rows=[new docx.TableRow({children:['Cable','Load','Tc','Cond.','Rdc','Yc','\u0394Td','Rcond','Rins','Rduct','Rsoil','Rca','Neher','Finite','Overload'].map(t=>
    new docx.TableCell({children:[new docx.Paragraph(t)]}))})];

  cables.forEach(c=>{
   const d=ampacityDetails(c,{...params,earthTemp:fToC(params.earthTemp),airTemp:isNaN(params.airTemp)?NaN:fToC(params.airTemp)},countMap[c.conduit_id],total);
   const finite=parseFloat(window.finiteAmpacity?.[c.tag]);
   const finiteStr=isNaN(finite)?'N/A':finite.toFixed(1);
   const load=parseFloat(c.est_load)||0;
   const over=(load>(isNaN(d.ampacity)?Infinity:d.ampacity))||(load>(isNaN(finite)?Infinity:finite));
   rows.push(new docx.TableRow({children:[
     new docx.TableCell({children:[new docx.Paragraph(c.tag||'')]}),
     new docx.TableCell({children:[new docx.Paragraph(load.toFixed(1))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.rating.toFixed(0))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.conductorFactor.toFixed(0))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.Rdc.toFixed(4))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.Yc.toFixed(3))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.deltaTd.toFixed(2))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.Rcond.toFixed(3))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.Rins.toFixed(3))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.Rduct.toFixed(3))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.Rsoil.toFixed(3))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.Rca.toFixed(3))]}),
     new docx.TableCell({children:[new docx.Paragraph(d.ampacity.toFixed(1))]}),
     new docx.TableCell({children:[new docx.Paragraph(finiteStr)]}),
     new docx.TableCell({children:[new docx.Paragraph(over?'Yes':'No')]})
   ]}));
  });
  children.push(new docx.Table({rows}));

 children.push(new docx.Paragraph(''));
 children.push(new docx.Paragraph('Ampacity calculations use the Neher-McGrath equation with cable-specific temperature ratings and current-carrying conductor count:'));
 children.push(new docx.Paragraph({
   children:[
     new docx.Math({
       children:[
         new docx.MathRadical({
           children:[
             new docx.MathFraction({
               numerator:[new docx.MathRun('T_c - (T_a + \u0394T_d)')],
               denominator:[new docx.MathRun('R_dc \u00D7 (1 + Y_c) \u00D7 R_ca \u00D7 N_c')]
             })
           ]
         })
       ]
     })
   ]
 }));
 children.push(new docx.Paragraph(''));
 children.push(new docx.Paragraph('Variable Legend'));
 children.push(new docx.Paragraph('---------------'));
 children.push(new docx.Paragraph('load - estimated cable load (A)'));
 children.push(new docx.Paragraph('Neher - ampacity via Neher-McGrath (A)'));
 children.push(new docx.Paragraph('Finite - ampacity from finite-element solver (A)'));
 children.push(new docx.Paragraph('Rdc - dc conductor resistance at T_c (\u03A9/m)'));
 children.push(new docx.Paragraph('Yc - ac resistance factor (dimensionless)'));
 children.push(new docx.Paragraph('\u0394Td - dielectric-loss temperature rise (\u00B0C)'));
 children.push(new docx.Paragraph('Rcond - conductor thermal resistance (\u00B0C\u00B7m/W)'));
 children.push(new docx.Paragraph('Rins - insulation thermal resistance (\u00B0C\u00B7m/W)'));
 children.push(new docx.Paragraph('Rduct - raceway thermal resistance (\u00B0C\u00B7m/W)'));
 children.push(new docx.Paragraph('Rsoil - soil thermal resistance (\u00B0C\u00B7m/W)'));
 children.push(new docx.Paragraph('Rca - total external thermal resistance (\u00B0C\u00B7m/W)'));

 doc.addSection({properties:{},children});
 const blob=await docx.Packer.toBlob(doc);
 const a=document.createElement('a');
 a.href=URL.createObjectURL(blob);
 a.download='ampacity_report.docx';
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(a.href);
}

function exportImage(){
 const svg=document.getElementById('grid');
 const serializer=new XMLSerializer();
 const source=serializer.serializeToString(svg);
 const img=new Image();
 img.onload=()=>{
   const canvas=document.createElement('canvas');
   canvas.width=img.width;
   canvas.height=img.height;
   const ctx=canvas.getContext('2d');
   ctx.drawImage(img,0,0);
   const url=canvas.toDataURL('image/png');
   const a=document.createElement('a');
   a.href=url;
   a.download='ductbank.png';
   document.body.appendChild(a);
   a.click();
   document.body.removeChild(a);
 };
img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);
}

function downloadThermalData(){
 const data={
   grid:window.lastHeatGrid,
   gridMeta:window.lastHeatGridMeta,
   conduitTemps:window.lastConduitTemps,
   ambient:window.lastAmbient,
   logs:window.thermalLogs||[]
 };
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'text/plain'});
 const a=document.createElement('a');
 a.href=URL.createObjectURL(blob);
 a.download='thermal_data.txt';
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(a.href);
}

function downloadCanvasData(){
 const canvas=document.getElementById('tempCanvas');
 if(!canvas) return;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const img=window.lastHeatImgData || ctx.getImageData(0,0,canvas.width,canvas.height);
 if(!img){
   showToast('No canvas data available');
   return;
 }
 const out={width:img.width,height:img.height,data:Array.from(img.data)};
 const blob=new Blob([JSON.stringify(out)],{type:'application/json'});
 const a=document.createElement('a');
 a.href=URL.createObjectURL(blob);
 a.download='tempCanvas_imagedata.json';
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(a.href);
}

function deleteSavedData(){
removeItem('ductbankSession');
 document.querySelector('#conduitTable tbody').innerHTML='';
 document.querySelector('#cableTable tbody').innerHTML='';
 ['ductbankTag','ductbankDepth','earthTemp','airTemp','soilResistivity','moistureContent','hSpacing','vSpacing','topPad','bottomPad','leftPad','rightPad','perRow','conductorRating','gridRes','ductThermRes'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.value='';
});
 ['concreteEncasement','heatSources'].forEach(id=>{
 const el=document.getElementById(id);
 if(el) el.checked=false;
 });
 const earthContextToggle=document.getElementById('showEarthContext');
 if(earthContextToggle) earthContextToggle.checked=true;
 window.lastHeatGrid=null;
 window.lastHeatGridMeta=null;
 applyDuctbankDefaults({onlyBlank:false,silent:true,persist:false});
 drawGrid();
 updateAmpacityReport();
 saveDuctbankSession();
 scheduleDuctbankExperienceUpdate();
}

function showToast(msg){
 const t=document.getElementById('toast');
 if(!t)return;
 t.textContent=msg;
 t.classList.add('show');
 setTimeout(()=>t.classList.remove('show'),3000);
}

async function toggleHeatMap(){
 const canvas=document.getElementById('tempCanvas');
 const overlay=document.getElementById('tempOverlay');
 if(!canvas||!overlay)return;
 const ctx=canvas.getContext('2d');
 const octx=overlay.getContext('2d');
 if(heatVisible){
   ctx.clearRect(0,0,canvas.width,canvas.height);
   octx.clearRect(0,0,overlay.width,overlay.height);
   canvas.style.display='none';
   overlay.style.display='none';
   heatVisible=false;
   return;
 }
 heatVisible=true;
 const svg=document.getElementById('grid');
 const width=Math.round(parseFloat(svg.getAttribute('width'))||svg.clientWidth);
 const height=Math.round(parseFloat(svg.getAttribute('height'))||svg.clientHeight);
 const context=ductbankDrawingContext(DUCTBANK_DRAWING_SCALE);
 const originX=DUCTBANK_DRAWING_MARGIN + context.sideSoilPx;
 const originY=context.ductTopY;
 const heatMeta=window.lastHeatGridMeta || {};
 if(window.lastHeatGrid && heatMeta.width===width && heatMeta.height===height && heatMeta.originX===originX && heatMeta.originY===originY && heatMeta.showContext===context.showContext){
   drawHeatMap(window.lastHeatGrid, window.lastConduitTemps||{}, getAllConduits(), window.lastAmbient||0);
   canvas.style.display='block';
   overlay.style.display='block';
 }else{
   await runFiniteThermalAnalysis();
 }
}

document.getElementById('exportConduitsBtn').addEventListener('click',exportConduits);
document.getElementById('exportCablesBtn').addEventListener('click',exportCables);
document.getElementById('exportImgBtn').addEventListener('click',exportImage);
document.getElementById('exportThermalBtn').addEventListener('click',downloadThermalData);
document.getElementById('exportCanvasDataBtn').addEventListener('click',downloadCanvasData);
document.getElementById('downloadCalcReportBtn').addEventListener('click',downloadCalcReportDocx);
document.getElementById('thermalBtn').addEventListener('click',async()=>{
  validateThermalInputs();
  await runFiniteThermalAnalysis();
  const soil=document.getElementById('soilRef');
  if(soil) soil.open=false;
});
document.getElementById('scrollTopBtn').addEventListener('click',()=>{
  window.scrollTo({top:0,behavior:'smooth'});
});
document.getElementById('heatToggleBtn').addEventListener('click',toggleHeatMap);

const hideDrawing=document.getElementById('hideDrawing');
if(hideDrawing){
  hideDrawing.addEventListener('change',()=>{
    const gc=document.getElementById('gridContainer');
    if(gc){
      gc.classList.toggle('hidden', hideDrawing.checked);
    }
    updateAmpacityReport();
  });
}

const utilHeatmapToggle=document.getElementById('utilHeatmapToggle');
if(utilHeatmapToggle){
  utilHeatmapToggle.addEventListener('change',e=>{utilHeatmap=e.target.checked;drawGrid();});
}

const showEarthContextToggle=document.getElementById('showEarthContext');
if(showEarthContextToggle){
  showEarthContextToggle.addEventListener('change',async()=>{
    if(heatVisible){
      await runFiniteThermalAnalysis();
    }else{
      drawGrid();
    }
    saveDuctbankSession();
    scheduleDuctbankExperienceUpdate();
  });
}

document.getElementById('deleteDataBtn').addEventListener('click',deleteSavedData);
document.getElementById('resetBtn').addEventListener('click',deleteSavedData);

const initHelpIcons=(root=document)=>{
 root.querySelectorAll('.help-icon').forEach(icon=>{
  icon.setAttribute('role','button');
  if(!icon.hasAttribute('aria-label'))icon.setAttribute('aria-label','Help');
  if(!icon.hasAttribute('aria-expanded'))icon.setAttribute('aria-expanded','false');
  icon.addEventListener('mouseenter',()=>icon.setAttribute('aria-expanded','true'));
  icon.addEventListener('mouseleave',()=>icon.setAttribute('aria-expanded','false'));
  icon.addEventListener('focus',()=>icon.setAttribute('aria-expanded','true'));
  icon.addEventListener('blur',()=>icon.setAttribute('aria-expanded','false'));
 });
};
initHelpIcons();

// keyboard navigation within conduit and cable tables
document.addEventListener('keydown',e=>{
 const selector='#conduitTable input, #conduitTable select, #conduitTable button, '+
 '#cableTable input, #cableTable select, #cableTable button';
 if(!e.target.matches(selector))return;
 const key=e.key;
   if(key!=='ArrowUp'&&key!=='ArrowDown'&&key!=='Enter')return;
 const cell=e.target.closest('td');
 const row=cell.parentElement;
 const index=Array.prototype.indexOf.call(row.children,cell);
 const targetRow=key==='ArrowUp'?row.previousElementSibling:row.nextElementSibling;
 if(targetRow){
  const focusable=targetRow.children[index].querySelector('input,select,button');
  if(focusable){
   e.preventDefault();
   focusable.focus();
   if((key==='Enter'||key==='ArrowUp'||key==='ArrowDown')&&typeof focusable.select==='function'){
     focusable.select();
   }
  }
 }
});

['ductbankTag','concreteEncasement','ductbankDepth','earthTemp','airTemp','soilResistivity','moistureContent','heatSources','showEarthContext','hSpacing','vSpacing','topPad','bottomPad','leftPad','rightPad','perRow','conductorRating','gridRes','ductThermRes'].forEach(id=>{
 const el=document.getElementById(id);
 if(el){
  el.addEventListener('input',saveDuctbankSession);
  el.addEventListener('change',saveDuctbankSession);
 }
});
document.querySelector('#conduitTable').addEventListener('input',saveDuctbankSession);
document.querySelector('#cableTable').addEventListener('input',saveDuctbankSession);
document.querySelector('#heatSourceTable').addEventListener('input',saveDuctbankSession);
window.addEventListener('beforeunload',saveDuctbankSession);
const dirty = createDirtyTracker();
const markSaved = () => dirty.markClean();
const markUnsaved = () => dirty.markDirty();
['ductbankTag','concreteEncasement','ductbankDepth','earthTemp','airTemp','soilResistivity','moistureContent','heatSources','showEarthContext','hSpacing','vSpacing','topPad','bottomPad','leftPad','rightPad','perRow','conductorRating','gridRes','ductThermRes'].forEach(id=>{const el=document.getElementById(id);if(el){el.addEventListener('input',markUnsaved);el.addEventListener('change',markUnsaved);}});
document.getElementById('conduitTable').addEventListener('input',markUnsaved);
document.getElementById('cableTable').addEventListener('input',markUnsaved);
document.getElementById('heatSourceTable').addEventListener('input',markUnsaved);
['addConduit','sampleConduits','addCable','sampleCables','loadDuctbankExample','restoreDuctbankDefaults','autoAssignCablesBtn','addHeatSource','deleteDataBtn','resetBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('click',markUnsaved);});
const impC=document.getElementById('importConduits'); if(impC) impC.addEventListener('change',markUnsaved);
const impCb=document.getElementById('importCables'); if(impCb) impCb.addEventListener('change',markUnsaved);
document.getElementById('conduitTable').addEventListener('click',e=>{if(e.target.tagName==='BUTTON') markUnsaved();});
document.getElementById('cableTable').addEventListener('click',e=>{if(e.target.tagName==='BUTTON') markUnsaved();});
['exportConduitsBtn','exportCablesBtn','exportImgBtn','exportBtn','exportThermalBtn','exportCanvasDataBtn','downloadCalcReportBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('click',markSaved);});
const conduitSearch=document.getElementById('conduit-search');
if(conduitSearch){
 conduitSearch.addEventListener('input',()=>{
  filterTable(document.getElementById('conduitTable'), conduitSearch.value);
 });
}
const cableSearch=document.getElementById('cable-search');
if(cableSearch){
 cableSearch.addEventListener('input',()=>{
  filterTable(document.getElementById('cableTable'), cableSearch.value);
 });
}
makeTableSortable('conduitTable');
makeTableSortable('cableTable');
makeTableSortable('heatSourceTable');

const ratingSelect=document.getElementById('conductorRating');
ratingSelect.addEventListener('change',()=>{
 updateInsulationOptions();
 updateAmpacityReport();
 saveDuctbankSession();
});

const heatSourcesCheck=document.getElementById('heatSources');
const heatDetails=document.getElementById('heatSourceDetails');
const addHeatBtn=document.getElementById('addHeatSource');
function updateHeatSourceVisibility(){
 const show=heatSourcesCheck.checked;
 heatDetails.style.display=show?'block':'none';
 addHeatBtn.style.display=show?'inline-block':'none';
}
heatSourcesCheck.addEventListener('change',updateHeatSourceVisibility);
addHeatBtn.addEventListener('click',()=>addHeatSourceRow());

function populateSoilReferences(data){
  const list=document.getElementById('soilResList');
  const table=document.getElementById('soilTableBody');
  if(list){
    list.innerHTML=Object.values(data).map(o=>`<option value="${escapeHtml(o.resistivity)}">${escapeHtml(o.desc)}</option>`).join('');
  }
  if(table){
    table.innerHTML='';
    Object.values(data).forEach(o=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${escapeHtml(o.desc)}</td><td>${escapeHtml(o.resistivity)}</td>`;
      table.appendChild(tr);
    });
  }
}
updateHeatSourceVisibility();
initDuctbankCablePopover();
initDuctbankExperience();
loadConductorProperties().then(()=>{
  // sync local copy used by inline functions
  if(window.CONDUCTOR_PROPS) CONDUCTOR_PROPS = window.CONDUCTOR_PROPS;
  updateInsulationOptions();
  checkInsulationThickness();
  applyDuctbankDefaults({onlyBlank:true,silent:true,persist:false});
  const projectDuctbanks=getDuctbanks();
  const projectConduits=getConduits();
  const projectCables=getCables();
  const requestedDuctbankId=new URLSearchParams(location.search).get('ductbank')||'';
  const storedSession=getItem('ductbankSession');
  loadDuctbankSession();
  const sessionDuctbankId=document.getElementById('ductbankTag')?.value||'';
  const selectedDuctbankId=requestedDuctbankId||sessionDuctbankId||projectDuctbankId(projectDuctbanks[0]);
  initProjectDuctbankSelector({
    ductbanks:projectDuctbanks,
    conduits:projectConduits,
    cables:projectCables,
    selectedId:selectedDuctbankId
  });
  const storedRoute=parseDuctbankRouteData(getItem('ductbankRouteData'));
  if(storedRoute&&!requestedDuctbankId){
    applyDuctbankRouteData(storedRoute);
    removeItem('ductbankRouteData');
  }else if(requestedDuctbankId||!storedSession){
    const projectRoute=buildProjectDuctbankRoute({
      ductbanks:projectDuctbanks,
      conduits:projectConduits,
      cables:projectCables,
      selectedDuctbankId
    });
    applyDuctbankRouteData(projectRoute);
  }
  loadCablesFromSchedule();
});
loadSoilResistivityData().then(data=>{
  populateSoilReferences(data);
  validateThermalInputs();
});
const soilInput=document.getElementById('soilResistivity');
soilInput.addEventListener('change',validateThermalInputs);
soilInput.addEventListener('blur',validateSoilResistivity);
const moistureInput=document.getElementById('moistureContent');
moistureInput.addEventListener('change',validateThermalInputs);
moistureInput.addEventListener('blur',validateMoistureContent);
