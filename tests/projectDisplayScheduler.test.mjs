import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';

if(!globalThis.performance) globalThis.performance=performance;
if(!globalThis.crypto) globalThis.crypto=crypto.webcrypto;
if(typeof globalThis.structuredClone!=='function'){
  globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value));
}

const repoRoot=new URL('../', import.meta.url);
const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>{storage.set(key,String(value));},
  removeItem:key=>{storage.delete(key);},
  clear:()=>storage.clear()
};

globalThis.alert=()=>{};
globalThis.confirm=()=>false;
globalThis.navigator={clipboard:{writeText:async()=>{}}};
globalThis.location={origin:'http://localhost',pathname:'/index.html',hash:'',reload:()=>{}};

globalThis.btoa=str=>Buffer.from(str,'binary').toString('base64');
globalThis.atob=b64=>Buffer.from(b64,'base64').toString('binary');

function elementStub(){
  return {
    style:{},
    appendChild(){},
    insertBefore(){},
    insertAdjacentElement(){},
    setAttribute(){},
    getAttribute(){return null;},
    addEventListener(){},
    removeEventListener(){},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    focus(){},
    click(){},
    textContent:'',
    innerText:'',
    value:'',
    href:'',
    id:'',
    classList:{add(){},remove(){},toggle(){},contains(){return false;}}
  };
}

globalThis.document={
  baseURI:new URL('index.html',repoRoot).href,
  getElementById(){return null;},
  querySelector(){return null;},
  querySelectorAll(){return [];},
  createElement(){return elementStub();},
  body:Object.assign(elementStub(),{classList:{add(){},remove(){},toggle(){},contains(){return false;}},appendChild(){},style:{}}),
  head:Object.assign(elementStub(),{appendChild(){}}),
  addEventListener(){},
  removeEventListener(){}
};

globalThis.window={
  matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
  addEventListener(){},
  removeEventListener(){},
  document:globalThis.document,
  open:()=>({document:{write(){},close(){}},print(){},close(){}})
};

globalThis.requestIdleCallback=undefined;

globalThis.addEventListener=()=>{};

globalThis.URL=globalThis.URL||class URLMock{
  constructor(url){this.href=url;}
  static createObjectURL(){return 'blob:mock';}
  static revokeObjectURL(){}
};

const { __projectDisplayScheduler: scheduler, __projectDisplaySave: save } = await import('../site.js');

// Allow any initialization triggered by site.js to settle.
await new Promise(resolve=>setTimeout(resolve,20));
await scheduler.flush(null,{reason:'test-setup'});
scheduler.resetMetrics();

function createLargeProject(){
  const ductbanks=Array.from({length:12},(_,i)=>({
    tag:`DB-${i}`,
    conduits:Array.from({length:8},(_,j)=>({
      conduit_id:j,
      type:'PVC',
      trade_size:'4',
      start_x:j,start_y:j,start_z:j,
      end_x:j+1,end_y:j+1,end_z:j+1,
      allowed_cable_group:`G-${i}-${j}`
    }))
  }));
  const cables=Array.from({length:150},(_,i)=>({
    cable_id:i,
    circuits:Array.from({length:6},(_,j)=>({circuit:`C-${i}-${j}`,load:j*10})),
    metadata:{idx:i,tags:Array.from({length:4},(_,k)=>`T-${i}-${k}`)}
  }));
  return {
    name:'Large Project',
    ductbanks,
    conduits:[],
    trays:[],
    cables,
    settings:{session:{},collapsedGroups:{},units:'imperial'}
  };
}

const baseProject=createLargeProject();
for(let i=0;i<10;i++){
  const snapshot=structuredClone(baseProject);
  snapshot.name=`Rapid Edit ${i}`;
  scheduler.schedule(snapshot,{reason:'rapid-edit'});
}

const midMetrics=scheduler.getMetrics();
assert.equal(midMetrics.runCount,0,'hashing should be deferred during rapid edits');
assert(midMetrics.hasPending,'scheduler should report pending work while debounced');

await scheduler.flush(null,{reason:'debounce-flush'});
const afterFlush=scheduler.getMetrics();
assert.equal(afterFlush.runCount,1,'flush should process the pending hash once');
assert(afterFlush.coalesced>=9,'multiple rapid edits should be coalesced');

await save(structuredClone(baseProject),{flush:true,reason:'manual-checkpoint'});
const manualMetrics=scheduler.getMetrics();
assert.equal(manualMetrics.lastReason,'manual-checkpoint','flush reason should be tracked');
assert(manualMetrics.runCount>=2,'manual flush should trigger another hash computation');

scheduler.resetMetrics();
await save(structuredClone(baseProject),{flush:true,reason:'reset-check'});
const finalMetrics=scheduler.getMetrics();
assert.equal(finalMetrics.runCount,1,'metrics should reset between runs');
assert.equal(finalMetrics.lastReason,'reset-check','reason should update after reset');

console.log('projectDisplayScheduler responsiveness checks passed');
