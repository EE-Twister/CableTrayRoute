import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';

if(!globalThis.performance) globalThis.performance=performance;
if(!globalThis.crypto) globalThis.crypto=crypto.webcrypto;

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
    removeAttribute(){},
    classList:{add(){},remove(){},toggle(){},contains(){return false;}}
  };
}

const saveButton=Object.assign(elementStub(),{
  removeAttribute(attr){ if(attr==='title') delete this.title; },
  title:''
});
const exportButton=elementStub();
const importButton=elementStub();
const fileInput=Object.assign(elementStub(),{style:{display:'none'},files:[],value:''});

globalThis.document={
  baseURI:new URL('index.html',repoRoot).href,
  getElementById(id){
    if(id==='save-project-btn') return saveButton;
    if(id==='export-project-btn') return exportButton;
    if(id==='import-project-btn') return importButton;
    if(id==='import-project-input') return fileInput;
    return null;
  },
  querySelector(){return null;},
  querySelectorAll(){return [];},
  createElement(){return elementStub();},
  body:Object.assign(elementStub(),{classList:{add(){},remove(){},toggle(){},contains(){return false;}},appendChild(){},style:{}}),
  head:Object.assign(elementStub(),{appendChild(){}}),
  addEventListener(){},
  removeEventListener(){},
  ownerDocument:null
};
document.ownerDocument=document;

globalThis.window={
  matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
  addEventListener(){},
  removeEventListener(){},
  document,
  open:()=>({document:{write(){},close(){}},print(){},close(){}})
};

globalThis.requestIdleCallback=undefined;
globalThis.addEventListener=()=>{};

globalThis.URL=globalThis.URL||class URLMock{
  constructor(url){this.href=url;}
  static createObjectURL(){return 'blob:mock';}
  static revokeObjectURL(){}
};

const {
  createAutoSaveScheduler,
  manualSaveProject,
  __setCachedProjectFileHandle
}=await import('../site.js');

await new Promise(resolve=>setTimeout(resolve,10));

window.autoSaveEnabled=false;
let scheduledRunner=null;
let warnCount=0;
let markCleanCount=0;
const autoStates=[];
const scheduler=createAutoSaveScheduler({
  getHandle:()=>({ token:'handle-1' }),
  writer:async handle=>{autoStates.push({during:window.autoSaveEnabled,handle}); return true;},
  markClean:()=>{markCleanCount+=1;},
  setFlag:value=>{window.autoSaveEnabled=value;},
  warn:()=>{warnCount+=1;},
  schedule:(fn)=>{scheduledRunner=fn; return Symbol('timer');},
  cancel:()=>{}
});

scheduler.start();
await scheduledRunner();

assert.deepEqual(autoStates.map(s=>s.during),[true],'autoSaveEnabled should be true while writing');
assert.equal(window.autoSaveEnabled,false,'autoSaveEnabled should reset after autosave completes');
assert.equal(markCleanCount,1,'dirty tracker should be marked clean after autosave');
assert.equal(warnCount,0,'autosave should not warn when a handle is available');

let missingHandleRunner=null;
const schedulerNoHandle=createAutoSaveScheduler({
  getHandle:()=>null,
  writer:async()=>true,
  setFlag:value=>{window.autoSaveEnabled=value;},
  warn:()=>{warnCount+=1;},
  schedule:(fn)=>{missingHandleRunner=fn; return Symbol('timer-2');},
  cancel:()=>{}
});

schedulerNoHandle.start();
await missingHandleRunner();

assert.equal(warnCount,1,'autosave should warn when no handle is available');
assert.equal(window.autoSaveEnabled,false,'autoSaveEnabled should remain false when skipping autosave');

__setCachedProjectFileHandle(null);
let pickerCalls=0;
const savedHandles=[];
const handleRef={name:'project.ctr.json'};

const firstResult=await manualSaveProject({
  requestHandle:async()=>{pickerCalls+=1; return {handle:handleRef,cancelled:false};},
  writer:async handle=>{savedHandles.push(handle); return true;},
  ensurePermission:async()=>true,
  markClean:()=>{markCleanCount+=1;},
  notifyNoHandle:()=>{}
});

assert.equal(firstResult,true,'manual save should succeed when a handle is chosen');
assert.equal(pickerCalls,1,'picker should be invoked the first time');
assert.equal(savedHandles.length,1,'writer should be called once for the initial save');

const secondResult=await manualSaveProject({
  requestHandle:()=>{throw new Error('requestHandle should not be called when a handle is cached');},
  writer:async handle=>{savedHandles.push(handle); return true;},
  ensurePermission:async()=>true,
  markClean:()=>{markCleanCount+=1;},
  notifyNoHandle:()=>{}
});

assert.equal(secondResult,true,'manual save should succeed with the cached handle');
assert.equal(pickerCalls,1,'picker should not be invoked again when handle is cached');
assert.equal(savedHandles.length,2,'writer should be called for the cached handle save');
assert(savedHandles.every(handle=>handle===handleRef),'cached handle should be reused for each save');

console.log('autoSave scheduler and manual save behaviors verified');
