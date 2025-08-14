(function(){
  let ductbanks=[];
  const DUCTBANK_KEY = TableUtils.STORAGE_KEYS.ductbankSchedule;
  let ductbankTbody;

  function parseSize(sz){
    if(sz.includes('-')){const[w,f]=sz.split('-');const[n,d]=f.split('/');return parseFloat(w)+parseFloat(n)/parseFloat(d);}
    if(sz.includes('/')){const[n,d]=sz.split('/');return parseFloat(n)/parseFloat(d);}
    return parseFloat(sz);
  }

  function renderDuctbanks(){
    const specs = globalThis.CONDUIT_SPECS || {};
    ductbankTbody.innerHTML='';
    ductbanks.forEach((db,i)=>{
      const row=ductbankTbody.insertRow();
      row.className='ductbank-row';
      const tgl=row.insertCell();
      const tglBtn=document.createElement('button');
      tglBtn.textContent=db.expanded?'\u25BC':'\u25B6';
      tglBtn.addEventListener('click',()=>{db.expanded=!db.expanded;renderDuctbanks();});
      tgl.appendChild(tglBtn);

      const tag=row.insertCell();
      const tagInput=document.createElement('input');
      tagInput.value=db.tag||'';
      const tagRules=['required'];
      tagInput.addEventListener('input',e=>{db.tag=e.target.value;TableUtils.applyValidation(tagInput,tagRules);saveDuctbanks();});
      TableUtils.applyValidation(tagInput,tagRules);
      tag.appendChild(tagInput);

      const from=row.insertCell();
      const fromInput=document.createElement('input');
      fromInput.value=db.from||'';
      const fromRules=['required'];
      fromInput.addEventListener('input',e=>{db.from=e.target.value;TableUtils.applyValidation(fromInput,fromRules);saveDuctbanks();});
      TableUtils.applyValidation(fromInput,fromRules);
      from.appendChild(fromInput);

      const to=row.insertCell();
      const toInput=document.createElement('input');
      toInput.value=db.to||'';
      const toRules=['required'];
      toInput.addEventListener('input',e=>{db.to=e.target.value;TableUtils.applyValidation(toInput,toRules);saveDuctbanks();});
      TableUtils.applyValidation(toInput,toRules);
      to.appendChild(toInput);

      const ce=row.insertCell();
      const ceInput=document.createElement('input');
      ceInput.type='checkbox';
      ceInput.checked=db.concrete_encasement||false;
      ceInput.addEventListener('change',e=>{db.concrete_encasement=e.target.checked;saveDuctbanks();});
      ce.appendChild(ceInput);

      const sx=row.insertCell();
      const sxInput=document.createElement('input');
      sxInput.type='number';
      sxInput.value=db.start_x||'';
      const sxRules=['required','numeric'];
      sxInput.addEventListener('input',e=>{db.start_x=e.target.value;db.conduits.forEach(c=>c.start_x=db.start_x);TableUtils.applyValidation(sxInput,sxRules);saveDuctbanks();});
      TableUtils.applyValidation(sxInput,sxRules);
      sx.appendChild(sxInput);

      const sy=row.insertCell();
      const syInput=document.createElement('input');
      syInput.type='number';
      syInput.value=db.start_y||'';
      const syRules=['required','numeric'];
      syInput.addEventListener('input',e=>{db.start_y=e.target.value;db.conduits.forEach(c=>c.start_y=db.start_y);TableUtils.applyValidation(syInput,syRules);saveDuctbanks();});
      TableUtils.applyValidation(syInput,syRules);
      sy.appendChild(syInput);

      const sz=row.insertCell();
      const szInput=document.createElement('input');
      szInput.type='number';
      szInput.value=db.start_z||'';
      const szRules=['required','numeric'];
      szInput.addEventListener('input',e=>{db.start_z=e.target.value;db.conduits.forEach(c=>c.start_z=db.start_z);TableUtils.applyValidation(szInput,szRules);saveDuctbanks();});
      TableUtils.applyValidation(szInput,szRules);
      sz.appendChild(szInput);

      const ex=row.insertCell();
      const exInput=document.createElement('input');
      exInput.type='number';
      exInput.value=db.end_x||'';
      const exRules=['required','numeric'];
      exInput.addEventListener('input',e=>{db.end_x=e.target.value;db.conduits.forEach(c=>c.end_x=db.end_x);TableUtils.applyValidation(exInput,exRules);saveDuctbanks();});
      TableUtils.applyValidation(exInput,exRules);
      ex.appendChild(exInput);

      const ey=row.insertCell();
      const eyInput=document.createElement('input');
      eyInput.type='number';
      eyInput.value=db.end_y||'';
      const eyRules=['required','numeric'];
      eyInput.addEventListener('input',e=>{db.end_y=e.target.value;db.conduits.forEach(c=>c.end_y=db.end_y);TableUtils.applyValidation(eyInput,eyRules);saveDuctbanks();});
      TableUtils.applyValidation(eyInput,eyRules);
      ey.appendChild(eyInput);

      const ez=row.insertCell();
      const ezInput=document.createElement('input');
      ezInput.type='number';
      ezInput.value=db.end_z||'';
      const ezRules=['required','numeric'];
      ezInput.addEventListener('input',e=>{db.end_z=e.target.value;db.conduits.forEach(c=>c.end_z=db.end_z);TableUtils.applyValidation(ezInput,ezRules);saveDuctbanks();});
      TableUtils.applyValidation(ezInput,ezRules);
      ez.appendChild(ezInput);

      const act=row.insertCell();
      const addC=document.createElement('button');
      addC.textContent='Add Conduit';
      addC.addEventListener('click',()=>{addConduit(i);});
      const dup=document.createElement('button');
      dup.textContent='Duplicate';
      dup.addEventListener('click',()=>{duplicateDuctbank(i);});
      const del=document.createElement('button');
      del.textContent='Delete';
      del.addEventListener('click',()=>{deleteDuctbank(i);});
      act.appendChild(addC);
      act.appendChild(dup);
      act.appendChild(del);

      const cRow=ductbankTbody.insertRow();
      cRow.className='conduit-container';
      cRow.style.display=db.expanded?'':'none';
      const cCell=cRow.insertCell();
      cCell.colSpan=12;
      const cTable=document.createElement('table');
      cTable.className='nested-table';
      const cHead=cTable.createTHead();
      const h=cHead.insertRow();
      ['Conduit ID','Type','Trade Size','Actions'].forEach(txt=>{
        const th=document.createElement('th');
        th.textContent=txt;
        h.appendChild(th);
      });
      const cBody=cTable.createTBody();
      db.conduits.forEach((c,j)=>{
        const r=cBody.insertRow();

        // Conduit ID
        let cell=r.insertCell();
        const idInp=document.createElement('input');
        idInp.value=c.conduit_id||'';
        const idRules=['required'];
        idInp.addEventListener('input',e=>{c.conduit_id=e.target.value;TableUtils.applyValidation(idInp,idRules);saveDuctbanks();});
        TableUtils.applyValidation(idInp,idRules);
        cell.appendChild(idInp);

        // Type select
        cell=r.insertCell();
        const typeSel=document.createElement('select');
        Object.keys(specs).forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;typeSel.appendChild(o);});
        typeSel.value=c.type||Object.keys(specs)[0];
        c.type=typeSel.value;
        const typeRules=['required'];
        cell.appendChild(typeSel);

        // Trade size select
        cell=r.insertCell();
        const sizeSel=document.createElement('select');
        function populateSizes(){
          sizeSel.innerHTML='';
          Object.keys(specs[typeSel.value]||{}).sort((a,b)=>parseSize(a)-parseSize(b)).forEach(sz=>{const o=document.createElement('option');o.value=sz;o.textContent=sz;sizeSel.appendChild(o);});
        }
        populateSizes();
        sizeSel.value=c.trade_size||sizeSel.options[0].value;
        c.trade_size=sizeSel.value;
        const sizeRules=['required'];
        cell.appendChild(sizeSel);

        typeSel.addEventListener('change',e=>{c.type=e.target.value;populateSizes();c.trade_size=sizeSel.value;TableUtils.applyValidation(typeSel,typeRules);saveDuctbanks();});
        sizeSel.addEventListener('change',e=>{c.trade_size=e.target.value;TableUtils.applyValidation(sizeSel,sizeRules);saveDuctbanks();});
        TableUtils.applyValidation(typeSel,typeRules);
        TableUtils.applyValidation(sizeSel,sizeRules);

        const actc=r.insertCell();
        const dupe=document.createElement('button');
        dupe.textContent='Duplicate';
        dupe.addEventListener('click',()=>{duplicateConduit(i,j);});
        const delc=document.createElement('button');
        delc.textContent='Delete';
        delc.addEventListener('click',()=>{deleteConduit(i,j);});
        actc.appendChild(dupe);
        actc.appendChild(delc);
      });
      cCell.appendChild(cTable);
    });
    const rc=document.getElementById('ductbank-row-count');
    if(rc) rc.textContent=`Rows: ${ductbanks.length}`;
  }

  function addDuctbank(){
    ductbanks.push({id:Date.now(),tag:'',from:'',to:'',concrete_encasement:false,start_x:'',start_y:'',start_z:'',end_x:'',end_y:'',end_z:'',conduits:[],expanded:true});
    renderDuctbanks();
    saveDuctbanks();
  }

  function addConduit(i){
    const db=ductbanks[i];
    ductbanks[i].conduits.push({conduit_id:'',type:'',trade_size:'',start_x:db.start_x,start_y:db.start_y,start_z:db.start_z,end_x:db.end_x,end_y:db.end_y,end_z:db.end_z});
    renderDuctbanks();
    saveDuctbanks();
  }

  function deleteDuctbank(i){
    ductbanks.splice(i,1);
    renderDuctbanks();
    saveDuctbanks();
  }

  function deleteConduit(i,j){
    ductbanks[i].conduits.splice(j,1);
    renderDuctbanks();
    saveDuctbanks();
  }

  function duplicateDuctbank(i){
    const copy=JSON.parse(JSON.stringify(ductbanks[i]));
    copy.id=Date.now()+Math.random();
    ductbanks.splice(i+1,0,copy);
    renderDuctbanks();
    saveDuctbanks();
  }

  function duplicateConduit(i,j){
    const copy=JSON.parse(JSON.stringify(ductbanks[i].conduits[j]));
    ductbanks[i].conduits.splice(j+1,0,copy);
    renderDuctbanks();
    saveDuctbanks();
  }

  function saveDuctbanks(){
    try{localStorage.setItem(DUCTBANK_KEY,JSON.stringify(ductbanks));}catch(e){}
  }

  function loadDuctbanks(){
    try{ductbanks=JSON.parse(localStorage.getItem(DUCTBANK_KEY))||[];}catch(e){ductbanks=[];}
    ductbanks.forEach(db=>{
      if(db.expanded===undefined) db.expanded=false;
      if(!db.conduits) db.conduits=[];
      if(db.concrete_encasement===undefined) db.concrete_encasement=false;
      ['start_x','start_y','start_z','end_x','end_y','end_z'].forEach(k=>{if(db[k]===undefined) db[k]='';});
      db.conduits.forEach(c=>{
        ['start_x','start_y','start_z','end_x','end_y','end_z'].forEach(k=>{if(c[k]===undefined) c[k]=db[k];});
      });
    });
    renderDuctbanks();
  }

  function exportDuctbankXlsx(){
    const dbData=[['ductbank_id','tag','from','to','concrete_encasement','start_x','start_y','start_z','end_x','end_y','end_z']];
    ductbanks.forEach(db=>dbData.push([db.id,db.tag,db.from,db.to,db.concrete_encasement?1:0,db.start_x,db.start_y,db.start_z,db.end_x,db.end_y,db.end_z]));
    const cData=[['ductbank_id','conduit_id','type','trade_size','start_x','start_y','start_z','end_x','end_y','end_z']];
    ductbanks.forEach(db=>db.conduits.forEach(c=>cData.push([db.id,c.conduit_id,c.type,c.trade_size,c.start_x,c.start_y,c.start_z,c.end_x,c.end_y,c.end_z])));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(dbData),'Ductbanks');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(cData),'Conduits');
    XLSX.writeFile(wb,'ductbank_schedule.xlsx');
  }

  function importDuctbankXlsx(file){
    if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>{
      const wb=XLSX.read(e.target.result,{type:'binary'});
      const dbSheet=wb.Sheets['Ductbanks']||wb.Sheets[wb.SheetNames[0]];
      const cSheet=wb.Sheets['Conduits']||wb.Sheets[wb.SheetNames[1]];

      if(!dbSheet){
        alert('Ductbanks sheet not found');
        return;
      }
      if(!cSheet){
        alert('Conduits sheet not found');
        return;
      }

      const requiredDbHeaders=['ductbank_id','tag','from','to','concrete_encasement','start_x','start_y','start_z','end_x','end_y','end_z'];
      const dbHeaders=(XLSX.utils.sheet_to_json(dbSheet,{header:1})[0]||[]).map(h=>String(h).toLowerCase());
      const missingDb=requiredDbHeaders.filter(h=>!dbHeaders.includes(h));
      if(missingDb.length){
        alert('Missing required Ductbanks headers: '+missingDb.join(', '));
        return;
      }

      const requiredCHeaders=['ductbank_id','conduit_id','type','trade_size','start_x','start_y','start_z','end_x','end_y','end_z'];
      const cHeaders=(XLSX.utils.sheet_to_json(cSheet,{header:1})[0]||[]).map(h=>String(h).toLowerCase());
      const missingC=requiredCHeaders.filter(h=>!cHeaders.includes(h));
      if(missingC.length){
        alert('Missing required Conduits headers: '+missingC.join(', '));
        return;
      }

      const dbJson=XLSX.utils.sheet_to_json(dbSheet,{defval:''});
      const cJson=XLSX.utils.sheet_to_json(cSheet,{defval:''});
      const map={};
      ductbanks=dbJson.map(r=>{
        const db={
          id:r['ductbank_id']||r['id']||Date.now()+Math.random(),
          tag:r['tag']||'',
          from:r['from']||'',
          to:r['to']||'',
          concrete_encasement:r['concrete_encasement']==='1'||r['concrete_encasement']==='true'||r['concrete_encasement']===true,
          start_x:r['start_x']||'',
          start_y:r['start_y']||'',
          start_z:r['start_z']||'',
          end_x:r['end_x']||'',
          end_y:r['end_y']||'',
          end_z:r['end_z']||'',
          conduits:[],
          expanded:false
        };
        map[db.id]=db;
        return db;
      });
      cJson.forEach(r=>{
        const p=map[r['ductbank_id']];
        if(p){
          p.conduits.push({
            conduit_id:r['conduit_id']||'',
            type:r['type']||'',
            trade_size:r['trade_size']||'',
            start_x:r['start_x']||p.start_x,
            start_y:r['start_y']||p.start_y,
            start_z:r['start_z']||p.start_z,
            end_x:r['end_x']||p.end_x,
            end_y:r['end_y']||p.end_y,
            end_z:r['end_z']||p.end_z
          });
        }
      });
      renderDuctbanks();
      saveDuctbanks();
    };
    reader.readAsBinaryString(file);
  }

  function initDuctbankTable(){
    ductbankTbody=document.querySelector('#ductbankTable tbody');
    document.getElementById('add-ductbank-btn').addEventListener('click',addDuctbank);
    document.getElementById('save-ductbank-btn').addEventListener('click',saveDuctbanks);
    document.getElementById('load-ductbank-btn').addEventListener('click',loadDuctbanks);
    document.getElementById('delete-ductbank-btn').addEventListener('click',()=>{ductbanks=[];renderDuctbanks();saveDuctbanks();});
    document.getElementById('export-ductbank-xlsx-btn').addEventListener('click',exportDuctbankXlsx);
    document.getElementById('import-ductbank-xlsx-btn').addEventListener('click',()=>document.getElementById('import-ductbank-xlsx-input').click());
    document.getElementById('import-ductbank-xlsx-input').addEventListener('change',e=>{importDuctbankXlsx(e.target.files[0]);e.target.value='';});
    loadDuctbanks();
  }

  function getDuctbanks(){return ductbanks;}

  window.initDuctbankTable=initDuctbankTable;
  window.saveDuctbanks=saveDuctbanks;
  window.getDuctbanks=getDuctbanks;
})();

