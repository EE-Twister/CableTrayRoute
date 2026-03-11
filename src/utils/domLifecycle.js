const DEFAULT_PROFILE_LOG_INTERVAL=100;

export function createElementCache(root=document){
  const idCache=new Map();
  const selectorCache=new Map();
  return {
    getById(id){
      if(!idCache.has(id)) idCache.set(id,root.getElementById(id));
      return idCache.get(id);
    },
    query(selector){
      if(!selectorCache.has(selector)) selectorCache.set(selector,root.querySelector(selector));
      return selectorCache.get(selector);
    },
    clear(){
      idCache.clear();
      selectorCache.clear();
    }
  };
}

export function createDomWriteBatcher(){
  let frame=0;
  const queued=new Set();

  function flush(){
    frame=0;
    const tasks=Array.from(queued);
    queued.clear();
    tasks.forEach(task=>task());
  }

  return {
    write(task){
      if(typeof task!=='function') return;
      queued.add(task);
      if(frame) return;
      frame=requestAnimationFrame(flush);
    },
    flushNow(){
      if(frame){
        cancelAnimationFrame(frame);
        frame=0;
      }
      flush();
    }
  };
}

export function createHandlerProfiler(label,{logEvery=DEFAULT_PROFILE_LOG_INTERVAL}={}){
  let count=0;
  let totalDuration=0;

  return function profile(handlerName,handler){
    return function profiledHandler(...args){
      const started=globalThis.performance?.now?.()??Date.now();
      const result=handler.apply(this,args);
      const ended=globalThis.performance?.now?.()??Date.now();
      count+=1;
      totalDuration+=ended-started;
      if(count%logEvery===0){
        const avg=(totalDuration/count).toFixed(3);
        console.debug(`[${label}] ${handlerName}: count=${count}, avgMs=${avg}`);
      }
      return result;
    };
  };
}
