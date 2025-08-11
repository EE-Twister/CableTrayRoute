(function(){
  let ductbanks=[];
  const DUCTBANK_KEY = TableUtils.STORAGE_KEYS.ductbankSchedule;
  let ductbankTbody;

  function renderDuctbanks(){
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

      const act=row.insertCell();
      const addC=document.createElement('button');
      addC.textContent='Add Conduit';
      addC.addEventListener('click',()=>{addConduit(i);});
      const del=document.createElement('button');
      del.textContent='Delete';
      del.addEventListener('click',()=>{deleteDuctbank(i);});
      act.appendChild(addC);
      act.appendChild(del);

      const cRow=ductbankTbody.insertRow();
      cRow.className='conduit-container';
      cRow.style.display=db.expanded?'':'none';
      const cCell=cRow.insertCell();
      cCell.colSpan=5;
      const cTable=document.createElement('table');
      cTable.className='nested-table';
      const cHead=cTable.createTHead();
      const h=cHead.insertRow();
      ['Conduit ID','Type','Trade Size','From','To','Actions'].forEach(txt=>{
        const th=document.createElement('th');
        th.textContent=txt;
        h.appendChild(th);
      });
      const cBody=cTable.createTBody();
      db.conduits.forEach((c,j)=>{
        const r=cBody.insertRow();
        ['conduit_id','type','trade_size','from','to'].forEach(key=>{
          const cell=r.insertCell();
          const inp=document.createElement('input');
          inp.value=c[key]||'';
          const rules=['required'];
          inp.addEventListener('input',e=>{c[key]=e.target.value;TableUtils.applyValidation(inp,rules);saveDuctbanks();});
          TableUtils.applyValidation(inp,rules);
          cell.appendChild(inp);
        });
        const actc=r.insertCell();
        const delc=document.createElement('button');
        delc.textContent='Delete';
        delc.addEventListener('click',()=>{deleteConduit(i,j);});
        actc.appendChild(delc);
      });
      cCell.appendChild(cTable);
    });
  }

  function addDuctbank(){
    ductbanks.push({id:Date.now(),tag:'',from:'',to:'',conduits:[],expanded:true});
    renderDuctbanks();
    saveDuctbanks();
  }

  function addConduit(i){
    ductbanks[i].conduits.push({conduit_id:'',type:'',trade_size:'',from:'',to:''});
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

  function saveDuctbanks(){
    try{localStorage.setItem(DUCTBANK_KEY,JSON.stringify(ductbanks));}catch(e){}
  }

  function loadDuctbanks(){
    try{ductbanks=JSON.parse(localStorage.getItem(DUCTBANK_KEY))||[];}catch(e){ductbanks=[];}
    ductbanks.forEach(db=>{if(db.expanded===undefined) db.expanded=false; if(!db.conduits) db.conduits=[];});
    renderDuctbanks();
  }

  function exportDuctbankXlsx(){
    const dbData=[['ductbank_id','tag','from','to']];
    ductbanks.forEach(db=>dbData.push([db.id,db.tag,db.from,db.to]));
    const cData=[['ductbank_id','conduit_id','type','trade_size','from','to']];
    ductbanks.forEach(db=>db.conduits.forEach(c=>cData.push([db.id,c.conduit_id,c.type,c.trade_size,c.from,c.to])));
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

      const requiredDbHeaders=['ductbank_id','tag','from','to'];
      const dbHeaders=(XLSX.utils.sheet_to_json(dbSheet,{header:1})[0]||[]).map(h=>String(h).toLowerCase());
      const missingDb=requiredDbHeaders.filter(h=>!dbHeaders.includes(h));
      if(missingDb.length){
        alert('Missing required Ductbanks headers: '+missingDb.join(', '));
        return;
      }

      const requiredCHeaders=['ductbank_id','conduit_id','type','trade_size','from','to'];
      const cHeaders=(XLSX.utils.sheet_to_json(cSheet,{header:1})[0]||[]).map(h=>String(h).toLowerCase());
      const missingC=requiredCHeaders.filter(h=>!cHeaders.includes(h));
      if(missingC.length){
        alert('Missing required Conduits headers: '+missingC.join(', '));
        return;
      }

      const dbJson=XLSX.utils.sheet_to_json(dbSheet,{defval:''});
      const cJson=XLSX.utils.sheet_to_json(cSheet,{defval:''});
      const map={};
      ductbanks=dbJson.map(r=>{const db={id:r['ductbank_id']||r['id']||Date.now()+Math.random(),tag:r['tag']||'',from:r['from']||'',to:r['to']||'',conduits:[],expanded:false};map[db.id]=db;return db;});
      cJson.forEach(r=>{const p=map[r['ductbank_id']];if(p){p.conduits.push({conduit_id:r['conduit_id']||'',type:r['type']||'',trade_size:r['trade_size']||'',from:r['from']||'',to:r['to']||''});}});
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

