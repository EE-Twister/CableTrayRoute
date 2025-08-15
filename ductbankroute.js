checkPrereqs([{key:'ductbankSchedule',page:'racewayschedule.html',label:'Raceway Schedule'}]);

document.addEventListener('DOMContentLoaded',()=>{
  initSettings();
  initDarkMode();
  initHelpModal('helpBtn','helpOverlay','helpClose');
  initNavToggle();
});
let heatVisible=false;
window.lastHeatGrid=null;
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

function getConductorRating(){
  const val=parseFloat(document.getElementById('conductorRating')?.value);
  return isNaN(val)?90:val;
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
  console.log('neherMcGrathTemp(10W,0.5m,Rth=0.5,k=1) ->', t.toFixed(2),'°C');
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

function createButton(text,cls,label,handler){
 const b=document.createElement('button');
 b.type='button';
 b.textContent=text;
 b.className=cls;
 if(label){b.setAttribute('aria-label',label);b.title=label;}
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

function makeTableSortable(tableId){
 const table=document.getElementById(tableId);
 if(!table) return;
 const tbody=table.querySelector('tbody');
 let sortIdx=null, asc=true;
 table.querySelectorAll('th[data-idx]').forEach(th=>{
  th.style.cursor='pointer';
  th.addEventListener('click',()=>{
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
  });
 });
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
 typeSel.addEventListener('change',()=>{const old=sizeSel;sizeSel=conduitSizeOptions(typeSel.value);sizeTd.replaceChild(sizeSel,old);});
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
  inp.value=data[f]||'';
  td.appendChild(inp);
  tr.appendChild(td);
 });
 const delTd=document.createElement('td');
 delTd.appendChild(createButton('✖','removeBtn','Delete row',()=>{tr.remove();saveDuctbankSession();}));
 tr.appendChild(delTd);
 document.querySelector('#heatSourceTable tbody').appendChild(tr);
 saveDuctbankSession();
}

function rowToHeatSource(tr){
 const vals=Array.from(tr.children).slice(0,7)
                .map(td=>td.querySelector('input,select')?.value);
 const [tag,shape,width,height,temperature,x,y]=vals;
 return {tag,shape,width:parseFloat(width)||0,height:parseFloat(height)||0,
         temperature:parseFloat(temperature)||0,
         x:parseFloat(x)||0,y:parseFloat(y)||0};
}

function getAllHeatSources(){
 return Array.from(document.querySelectorAll('#heatSourceTable tbody tr')).map(rowToHeatSource);
}

function getAllConduits(){
 return Array.from(document.querySelectorAll('#conduitTable tbody tr')).map(rowToConduit);
}

function getAllCables(){
 return Array.from(document.querySelectorAll('#cableTable tbody tr')).map(tr=>rowToCable(tr));
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
  heatSourceData:getAllHeatSources(),
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
 try{localStorage.setItem('ductbankSession',JSON.stringify(session));}catch(e){console.error('save session failed',e);}
}

function loadDuctbankSession(){
 const stored=localStorage.getItem('ductbankSession');
 if(!stored) return;
 try{
  const s=JSON.parse(stored);
  if(s.ductbankTag!==undefined)document.getElementById('ductbankTag').value=s.ductbankTag;
  if(s.concreteEncasement!==undefined)document.getElementById('concreteEncasement').checked=s.concreteEncasement;
  if(s.ductbankDepth!==undefined)document.getElementById('ductbankDepth').value=s.ductbankDepth;
  if(s.earthTemp!==undefined)document.getElementById('earthTemp').value=s.earthTemp;
  if(s.airTemp!==undefined)document.getElementById('airTemp').value=s.airTemp;
  if(s.soilResistivity!==undefined)document.getElementById('soilResistivity').value=s.soilResistivity;
  if(s.moistureContent!==undefined)document.getElementById('moistureContent').value=s.moistureContent;
  if(s.conductorRating!==undefined)document.getElementById('conductorRating').value=s.conductorRating;
  if(s.heatSources!==undefined)document.getElementById('heatSources').checked=s.heatSources;
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

function loadCablesFromSchedule(){
  const tbody=document.querySelector('#cableTable tbody');
  if(!tbody||tbody.children.length>0) return;
  const key=globalThis.TableUtils?.STORAGE_KEYS?.cableSchedule||'cableSchedule';
  const json=localStorage.getItem(key);
  if(!json) return;
  let cables;
  try{cables=JSON.parse(json);}catch(e){console.error('Failed to parse cable schedule',e);return;}
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
 const cd=CONDUIT_SPECS[conduit.conduit_type]&&CONDUIT_SPECS[conduit.conduit_type][conduit.trade_size];
 const conduitDiameter=cd?cd*0.0254:0;
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
 const rating=getConductorRating();
 const Rdc=dcResistance(cable.conductor_size,cable.conductor_material,rating);
 const Yc=skinEffect(cable.conductor_size);
 const dTd=dielectricRise(cable.voltage_rating);
 const comps=calcRcaComponents(cable,params,count,total);
 const Rca=(+comps.Rcond)+(+comps.Rins)+(+comps.Rduct)+(+comps.Rsoil);
 if(!Number.isFinite(Rca)||Rca<=0) return {ampacity:NaN};
 const amb=Math.max(params.earthTemp||20,
                   isNaN(params.airTemp)?-Infinity:params.airTemp);
 const num=rating-(amb+dTd);
 const ampacity=num<0?Infinity:
   Math.sqrt(num/(Rdc*(1+Yc)*Rca));
 return {ampacity};
}

function ampacityDetails(cable,params,count=1,total=0){
 const areaCM=sizeToArea(cable.conductor_size);
 if(!areaCM) return {ampacity:0};
 const rating=getConductorRating();
 const Rdc=dcResistance(cable.conductor_size,cable.conductor_material,rating);
 const Yc=skinEffect(cable.conductor_size);
 const dTd=dielectricRise(cable.voltage_rating);
 const comps=calcRcaComponents(cable,params,count,total);
 const Rca=comps.Rca;
 const amb=Math.max(params.earthTemp||20,
                   isNaN(params.airTemp)?-Infinity:params.airTemp);
 const num=rating-(amb+dTd);
 const ampacity=Math.sqrt(num/(Rdc*(1+Yc)*Rca));
 return {Rdc,Yc,deltaTd:dTd,Rcond:comps.Rcond,Rins:comps.Rins,Rduct:comps.Rduct,Rsoil:comps.Rsoil,Rca,ampacity};
}

// Iterative ampacity search using Neher‑McGrath temps
// See docs/AMPACITY_METHOD.md#equation
async function calcFiniteAmpacity(cable, conduits, cables, params){
 const cd=conduits.find(d=>d.conduit_id===cable.conduit_id);
 if(!cd) return NaN;
 const rating=getConductorRating();
 const original=cable.est_load;
 let low=0;
 let high=Math.max(parseFloat(original)||1,1);
 let temp=params.earthTemp||20;
 // increase upper bound until temperature exceeds rating or limit reached
 for(let i=0;i<6;i++){
   cable.est_load=high;
  const res=await solveDuctbankTemperaturesWorker(conduits,cables,params);
   temp=res.conduitTemps[cable.conduit_id]??temp;
   if(temp>=rating||high>=2000) break;
   low=high;
   high*=2;
 }
 for(let i=0;i<12;i++){
   const mid=(low+high)/2;
   cable.est_load=mid;
   const res=await solveDuctbankTemperaturesWorker(conduits,cables,params);
   temp=res.conduitTemps[cable.conduit_id]??temp;
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
 return `<tr class="${over?'over-limit-row':''}"><td>${c.tag}</td>`+
        `<td>${d.Rdc.toFixed(4)}</td><td>${d.Yc.toFixed(3)}</td><td>${d.deltaTd.toFixed(2)}</td>`+
        `<td>${d.Rcond.toFixed(3)}</td><td>${d.Rins.toFixed(3)}</td><td>${d.Rduct.toFixed(3)}</td>`+
        `<td>${d.Rsoil.toFixed(3)}</td><td>${d.Rca.toFixed(3)}</td>`+
        `<td>${neher}</td><td>${finite}</td><td>${over?'Yes':''}</td></tr>`;
}).join('');
document.getElementById('ampacityReport').innerHTML=
   `<div class="ampacity-container"><table class="db-table ampacity-table"><thead><tr>`+
   `<th>Cable</th><th>Rdc</th><th>Yc</th><th>&Delta;Td</th><th>Rcond</th><th>Rins</th><th>Rduct</th>`+
   `<th>Rsoil</th><th>Rca</th><th>Neher (A)</th><th>Finite (A)</th><th>Over</th></tr>`+
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

function drawGrid(){
 const svg=document.getElementById('grid');
 const heat=document.getElementById('tempCanvas');
 const overlay=document.getElementById('tempOverlay');
 if(heat){const ctx=heat.getContext('2d');ctx.clearRect(0,0,heat.width,heat.height);} 
 if(overlay){const octx=overlay.getContext('2d');octx.clearRect(0,0,overlay.width,overlay.height);} 
 svg.innerHTML='';
 autoPlaceConduits();
 const conduits=getAllConduits();
 if(conduits.length===0)return;
 const topPad=parseFloat(document.getElementById('topPad').value)||0;
 const bottomPad=parseFloat(document.getElementById('bottomPad').value)||0;
 const leftPad=parseFloat(document.getElementById('leftPad').value)||0;
 const rightPad=parseFloat(document.getElementById('rightPad').value)||0;
const margin=20;
const scale=40; // pixels per unit
const fillMap=fillResults();
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

 const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
 svg.appendChild(defs);

 const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
 rect.setAttribute('x',margin);
 rect.setAttribute('y',margin);
 rect.setAttribute('width',ductWidth*scale);
 rect.setAttribute('height',ductHeight*scale);
 rect.setAttribute('fill','none');
 rect.setAttribute('stroke','gray');
 rect.setAttribute('stroke-dasharray','4 2');
svg.appendChild(rect);

 // overall dimension lines
 const widthY=margin+ductHeight*scale+15;
 const wStart=margin, wEnd=margin+ductWidth*scale;
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
   tagText.setAttribute('x',margin+ductWidth*scale/2);
   tagText.setAttribute('y',margin-4);
   tagText.setAttribute('font-size','14');
   tagText.setAttribute('text-anchor','middle');
   tagText.textContent=tag;
   svg.appendChild(tagText);
 }

 const heightX=margin+ductWidth*scale+15;
 const hStart=margin, hEnd=margin+ductHeight*scale;
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
   const cx=c.x*scale+R+margin;
   const cy=c.y*scale+R+margin;
   const data=fillMap[c.conduit_id];
   let color='green';
   if(data){
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
       const sc=document.createElementNS('http://www.w3.org/2000/svg','circle');
       sc.setAttribute('cx',cx+p.x*scale);
       sc.setAttribute('cy',cy+p.y*scale);
       sc.setAttribute('r',p.r*scale);
       sc.setAttribute('fill','lightblue');
       sc.setAttribute('stroke','black');
       sc.setAttribute('clip-path',`url(#${clipId})`);
       svg.appendChild(sc);
       if(p.tag){
         const fs=Math.max(6,Math.min(p.r*scale,(2*p.r*scale*0.8)/(p.tag.length*0.6)));
         const text=document.createElementNS('http://www.w3.org/2000/svg','text');
         text.setAttribute('x',cx+p.x*scale);
         text.setAttribute('y',cy+p.y*scale);
         text.setAttribute('font-size',fs);
         text.setAttribute('text-anchor','middle');
         text.setAttribute('dominant-baseline','middle');
         text.setAttribute('clip-path',`url(#${clipId})`);
         text.textContent=p.tag;
         svg.appendChild(text);
         const text2=document.createElementNS('http://www.w3.org/2000/svg','text');
         text2.setAttribute('x',cx+p.x*scale);
         text2.setAttribute('y',cy+p.y*scale+fs*0.8);
         text2.setAttribute('font-size',Math.max(6,fs*0.7));
         text2.setAttribute('text-anchor','middle');
         text2.setAttribute('dominant-baseline','hanging');
         text2.setAttribute('clip-path',`url(#${clipId})`);
         text2.textContent=(2*p.r).toFixed(2)+'"';
         svg.appendChild(text2);
       }
     });
   }
   const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
   circle.setAttribute('cx',cx);circle.setAttribute('cy',cy);circle.setAttribute('r',R);
   circle.setAttribute('fill',color);
   circle.setAttribute('fill-opacity','0.4');
   circle.setAttribute('stroke','black');
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

 if(document.getElementById('heatSources').checked){
   const heatSources=getAllHeatSources();
   heatSources.forEach(h=>{
     const x=parseFloat(h.x)||0;
     const y=parseFloat(h.y)||0;
     const w=parseFloat(h.width)||0;
     const ht=parseFloat(h.height)||0;
     const shape=(h.shape||'').toLowerCase();
     const color='orange';
     let hx=x*scale+margin;
     let hy=y*scale+margin;
     let wScaled=w*scale;
     let hScaled=ht*scale;
     if(shape==='circle'){
       const r=Math.max(w,ht)/2*scale;
       hx=x*scale+margin;
       hy=y*scale+margin;
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
     const rightEdge=margin+ductWidth*scale;
    const bottomEdge=margin+ductHeight*scale;
    const topEdge=margin;
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
const width=Math.round(overallMaxX*scale+2*margin+80);
const height=Math.round(overallMaxY*scale+2*margin+20);
svg.setAttribute('width',width);
svg.setAttribute('height',height);
svg.style.background='white';
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
 if(heatVisible && window.lastHeatGrid){
   drawHeatMap(window.lastHeatGrid, window.lastConduitTemps || {}, conduits, window.lastAmbient||0);
 }
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
     warnEl.innerHTML=`<div class="message warning"><ul>${warnings.map(w=>`<li>${w}</li>`).join('')}</ul></div>`;
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
  const step=Math.ceil(Math.max(width,height)/GRID_SIZE); // pixel step for solver grid
  const dx=(0.0254/scale)*step;
  const nx=Math.ceil(width/step);
  const ny=Math.ceil(height/step);
  /* Thermal resistivity model based on Neher-McGrath and IEEE Std 835
     see docs/AMPACITY_METHOD.md#soil-resistivity-ranges */
  let soil=(params.soilResistivity)||90;
  soil*=1-Math.min(params.moistureContent||0,100)/200;
  const k=100/soil;
  const hConv=10; // W/(m^2*K)
  const Bi=hConv*dx/k;
  const earthT=params.earthTemp||20;
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
    const Rdc=dcResistance(c.conductor_size,c.conductor_material,90);
    const current=parseFloat(c.est_load)||0;
    const power=current*current*Rdc;
    if(!heatMap[c.conduit_id]){
      heatMap[c.conduit_id]={cx,cy,r:Rin*0.0254,power:0};
    }
    heatMap[c.conduit_id].power+=power*(c.conductors||1);
  });

  Object.keys(heatMap).forEach(cid=>{
    const h=heatMap[cid];
    const cxPx=Math.round((h.cx/0.0254*scale+margin)/step);
    const cyPx=Math.round((h.cy/0.0254*scale+margin)/step);
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

  const heatSources=params.heatSourceData||[];
  heatSources.forEach(src=>{
    const tempC=isNaN(parseFloat(src.temperature))?earthT:fToC(parseFloat(src.temperature));
    const shape=(src.shape||'').toLowerCase();
    const x=parseFloat(src.x)||0;
    const y=parseFloat(src.y)||0;
    const w=parseFloat(src.width)||0;
    const ht=parseFloat(src.height)||0;
    if(shape==='circle'){
      const r=Math.max(w,ht)/2;
      const cx=x+r, cy=y+r;
      const cxPx=Math.round((cx*scale+margin)/step);
      const cyPx=Math.round((cy*scale+margin)/step);
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
      const x1=Math.round((x*scale+margin)/step);
      const y1=Math.round((y*scale+margin)/step);
      const x2=Math.round(((x+w)*scale+margin)/step);
      const y2=Math.round(((y+ht)*scale+margin)/step);
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

  let diff=Infinity,iter=0,maxIter=500;
  return new Promise(resolve=>{
    function step(){
      let count=0;
      while(diff>0.01&&iter<maxIter&&count<10){
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
        resolve({grid,conduitTemps:temps,iter,diff,ambient:earthT});
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
      worker=new Worker('thermalWorker.js');
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
  ductThermRes:ductRes
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
window.lastConduitTemps=conduitTemps;
window.lastAmbient=ambientRes;
if(heatVisible) drawHeatMap(grid,conduitTemps,conduits,ambientRes);

 window.finiteAmpacity = {};
 window.cableOverLimit = {};
 for(const c of cables){
  const areaCM=sizeToArea(c.conductor_size);
  if(!areaCM){
    window.finiteAmpacity[c.tag]='N/A';
    window.cableOverLimit[c.tag]=false;
    continue;
  }
  const amp=await calcFiniteAmpacity(c,conduits,cables,params);
  window.finiteAmpacity[c.tag]=isFinite(amp)?amp.toFixed(0):'N/A';
  window.cableOverLimit[c.tag]=isFinite(amp)&&parseFloat(c.est_load)>amp;
 }
 updateAmpacityReport();
 updateCableRowStyles();
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
const stepX=Math.ceil(width/(grid[0]?.length||1));
const stepY=Math.ceil(height/(grid.length||1));
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
   for(let i=0;i<grid[j].length;i++){
     const T=grid[j][i];
     if(T>maxT){maxT=T;maxPx=i*stepX+stepX/2;maxPy=j*stepY+stepY/2;}
     if(T<minT)minT=T;
   }
 }
 const range=maxT-minT||1;
 for(let j=0;j<grid.length;j++){
   for(let i=0;i<grid[j].length;i++){
     const T=grid[j][i];
     const frac=(T-minT)/range;
     const [r,g,b]=viridisColor(frac);
     for(let dy=0;dy<stepY;dy++){
       for(let dx=0;dx<stepX;dx++){
         const idx=((j*stepY+dy)*width+(i*stepX+dx))*4;
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
 const Tc=getConductorRating();
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
 const scale=40,margin=20;
 conduits.forEach(cd=>{
   const Rin=Math.sqrt(CONDUIT_SPECS[cd.conduit_type][cd.trade_size]/Math.PI);
   const px=(cd.x+Rin)*scale+margin;
   const py=(cd.y+Rin)*scale+margin;
   const t=conduitTemps[cd.conduit_id]??ambient;
   const tf=t*9/5+32;
   const rating=getConductorRating();
   const over=t>rating;
   window.conduitOverLimit[cd.conduit_id]={temp:t,over};
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

document.getElementById('addConduit').addEventListener('click',()=>{addConduitRow();});
document.getElementById('addCable').addEventListener('click',()=>{addCableRow({autoTag:true});updateInsulationOptions();});
document.getElementById('sampleConduits').addEventListener('click',()=>{
 document.querySelector('#conduitTable tbody').innerHTML='';
 SAMPLE_CONDUITS.forEach(addConduitRow);
 drawGrid();
 updateAmpacityReport(false);
 saveDuctbankSession();
});
document.getElementById('sampleCables').addEventListener('click', async ()=>{
  if(!Object.keys(window.CONDUCTOR_PROPS||{}).length){
    await loadConductorProperties();
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

function exportConduits(){
 const rows=getAllConduits();
 const headers=['conduit_id','conduit_type','trade_size','x','y'];
 const meta={version:CTR_VERSION,timestamp:new Date().toISOString()};
 exportCSV('ductbank_conduits.csv',headers,rows,meta);
}

function exportCables(){
 const rows=getAllCables();
 const headers=['tag','cable_type','diameter','conductors','conductor_size','weight','est_load','conduit_id','conductor_material','insulation_type','insulation_rating','voltage_rating','shielding_jacket'];
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
 const csvHeaders=['tag','Rdc','Yc','Rcond','Rins','Rduct','Rsoil','Rca','deltaTd','ampacity'];
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
 lines.push('Cable             Load  Neher  Finite  Overload');
 lines.push('------------------------------------------------');
 cables.forEach(c=>{
  const d=ampacityDetails(c,{...params,earthTemp:fToC(params.earthTemp),airTemp:isNaN(params.airTemp)?NaN:fToC(params.airTemp)},countMap[c.conduit_id],total);
  const finite=parseFloat(window.finiteAmpacity?.[c.tag]);
  const finiteStr=isNaN(finite)?'N/A':finite.toFixed(1);
  const load=parseFloat(c.est_load)||0;
  const over=(load>(isNaN(d.ampacity)?Infinity:d.ampacity))||(load>(isNaN(finite)?Infinity:finite));
  lines.push(`${(c.tag||'').padEnd(16)}${load.toFixed(1).padStart(5)} ${(d.ampacity.toFixed(1)).padStart(6)} ${finiteStr.padStart(7)} ${over?'Yes':'No'}`);
  lines.push(`  Rdc=${d.Rdc.toFixed(4)}, Yc=${d.Yc.toFixed(3)}, \u0394Td=${d.deltaTd.toFixed(2)}, Rcond=${d.Rcond.toFixed(3)}, Rins=${d.Rins.toFixed(3)}, Rduct=${d.Rduct.toFixed(3)}, Rsoil=${d.Rsoil.toFixed(3)}, Rca=${d.Rca.toFixed(3)}`);
 });
 lines.push('');
 lines.push('Ampacity calculations use the Neher-McGrath equation. Formulas for Yc and \u0394Td appear in the AC Resistance Correction documentation. Rdc, Rcond, Rins, Rduct, Rsoil and Rca are defined in Variable Definitions.');
 lines.push('');
 lines.push('Variable Legend');
 lines.push('---------------');
 lines.push('load - estimated cable load (A)');
 lines.push('Neher - ampacity via Neher-McGrath (A)');
 lines.push('Finite - ampacity from finite-element solver (A)');
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

  const rows=[new docx.TableRow({children:['Cable','Load','Rdc','Yc','\u0394Td','Rcond','Rins','Rduct','Rsoil','Rca','Neher','Finite','Overload'].map(t=>
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
 children.push(new docx.Paragraph('Ampacity calculations use the Neher-McGrath equation:'));
 children.push(new docx.Paragraph({
   children:[
     new docx.Math({
       children:[
         new docx.MathRadical({
           children:[
             new docx.MathFraction({
               numerator:[new docx.MathRun('T_c - (T_a + \u0394T_d)')],
               denominator:[new docx.MathRun('R_dc \u00D7 (1 + Y_c) \u00D7 R_ca')]
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
 localStorage.removeItem('ductbankSession');
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
 drawGrid();
 updateAmpacityReport();
}

function showToast(msg){
 const t=document.getElementById('toast');
 if(!t)return;
 t.textContent=msg;
 t.classList.add('show');
 setTimeout(()=>t.classList.remove('show'),3000);
}

function toggleHeatMap(){
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
 }else if(window.lastHeatGrid){
   drawHeatMap(window.lastHeatGrid, window.lastConduitTemps||{}, getAllConduits(), window.lastAmbient||0);
   canvas.style.display='block';
   overlay.style.display='block';
 }
 heatVisible=!heatVisible;
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

['ductbankTag','concreteEncasement','ductbankDepth','earthTemp','airTemp','soilResistivity','moistureContent','heatSources','hSpacing','vSpacing','topPad','bottomPad','leftPad','rightPad','perRow','conductorRating','gridRes','ductThermRes'].forEach(id=>{
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
let saved=true;
const markSaved=()=>{saved=true;};
const markUnsaved=()=>{saved=false;};
window.addEventListener('beforeunload',e=>{if(!saved){e.preventDefault();e.returnValue='';}});
['ductbankTag','concreteEncasement','ductbankDepth','earthTemp','airTemp','soilResistivity','moistureContent','heatSources','hSpacing','vSpacing','topPad','bottomPad','leftPad','rightPad','perRow','conductorRating','gridRes','ductThermRes'].forEach(id=>{const el=document.getElementById(id);if(el){el.addEventListener('input',markUnsaved);el.addEventListener('change',markUnsaved);}});
document.getElementById('conduitTable').addEventListener('input',markUnsaved);
document.getElementById('cableTable').addEventListener('input',markUnsaved);
document.getElementById('heatSourceTable').addEventListener('input',markUnsaved);
['addConduit','sampleConduits','addCable','sampleCables','addHeatSource','deleteDataBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('click',markUnsaved);});
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
    list.innerHTML=Object.values(data).map(o=>`<option value="${o.resistivity}">${o.desc}</option>`).join('');
  }
  if(table){
    table.innerHTML='';
    Object.values(data).forEach(o=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${o.desc}</td><td>${o.resistivity}</td>`;
      table.appendChild(tr);
    });
  }
}
updateHeatSourceVisibility();
loadConductorProperties().then(()=>{
  // sync local copy used by inline functions
  if(window.CONDUCTOR_PROPS) CONDUCTOR_PROPS = window.CONDUCTOR_PROPS;
  updateInsulationOptions();
  checkInsulationThickness();
  loadDuctbankSession();
  const storedRoute = localStorage.getItem('ductbankRouteData');
  if (storedRoute) {
    try {
      const { ductbank, cables } = JSON.parse(storedRoute);
      if (ductbank && ductbank.tag !== undefined) {
        const tagEl = document.getElementById('ductbankTag');
        if (tagEl) tagEl.value = ductbank.tag;
      }
      if (Array.isArray(cables)) {
        const tbody = document.querySelector('#cableTable tbody');
        if (tbody) {
          tbody.innerHTML = '';
          cables.forEach(c => {
            addCableRow({
              tag: c.name || c.tag || '',
              cable_type: c.cable_type || '',
              diameter: c.diameter || '',
              conductors: c.conductors || c.count || '',
              conductor_size: c.conductor_size || c.size || '',
              weight: c.weight || '',
              est_load: c.est_load || c.load || '',
              conduit_id: c.conduit_id || c.conduit || ''
            }, { defer: true });
          });
          updateInsulationOptions();
        }
      }
    } catch (e) {
      console.error('Failed to load ductbankRouteData', e);
    }
    localStorage.removeItem('ductbankRouteData');
    drawGrid();
    updateAmpacityReport();
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
