// Alias storage helpers to avoid name conflicts with local functions
import { getDuctbanks as readStoredDuctbanks, setDuctbanks, setItem, getItem } from './dataStore.mjs';
import { ContextMenu, FILTER_ICON_SVG } from './tableUtils.mjs';
import { openModal, showAlertModal } from './src/components/modal.js';
import { applyRecordImport, previewRecordImport } from './analysis/scheduleWorkflow.mjs';

(function(){
  let ductbanks=[];
  const DUCTBANK_KEY = TableUtils.STORAGE_KEYS.ductbankSchedule;
  let ductbankTbody;
  let filters=[];
  let filterButtons=[];
  let ductbankClipboard=null;
  let conduitClipboard=null;
  let rowContextMenusReady=false;
  let headerCells;
  let cableSizes=[];
  fetch('data/cableSizes.json').then(r=>r.json()).then(d=>{cableSizes=d;});
  const CONDUIT_MATERIAL_OPTIONS = ['Steel','Aluminum','PVC','Stainless Steel','Fiberglass'];
  const ROW_ACTION_ICONS = {
    viewBtn: 'icons/toolbar/grid.svg',
    insertBelowBtn: 'icons/toolbar/add-arrangement.svg',
    duplicateBtn: 'icons/toolbar/copy.svg',
    removeBtn: 'icons/toolbar/trash.svg'
  };

  function iconBtn(sym,cls,label,handler){
    const b=document.createElement('button');
    b.type='button';
    b.className=`${cls} row-icon-btn${cls === 'removeBtn' ? ' danger' : ''}`;
    b.title=label;
    b.setAttribute('aria-label',label);
    const icon=ROW_ACTION_ICONS[cls];
    if(icon){
      const img=document.createElement('img');
      img.src=icon;
      img.alt='';
      img.setAttribute('aria-hidden','true');
      img.className='control-icon';
      img.loading='lazy';
      img.decoding='async';
      b.appendChild(img);
      b.dataset.iconified='true';
    }else{
      b.textContent=sym;
    }
    b.addEventListener('click',handler);
    return b;
  }

  function appendActionButtons(cell,...buttons){
    cell.classList.add('raceway-action-cell');
    const group=document.createElement('div');
    group.className='row-action-group';
    buttons.forEach(button=>group.appendChild(button));
    cell.appendChild(group);
  }

  function parseSize(sz){
    if(sz.includes('-')){const[w,f]=sz.split('-');const[n,d]=f.split('/');return parseFloat(w)+parseFloat(n)/parseFloat(d);}
    if(sz.includes('/')){const[n,d]=sz.split('/');return parseFloat(n)/parseFloat(d);}
    return parseFloat(sz);
  }

  function defaultConduitMaterial(type = ''){
    return /PVC|ENT|LFNC/i.test(String(type)) ? 'PVC' : 'Steel';
  }

  function inferDuctbankParentTag(db, index, isDuctbankSample){
    const candidates = [
      db?.tag,
      db?.ductbank_id,
      typeof db?.id === 'string' ? db.id : '',
      ...(Array.isArray(db?.conduits) ? db.conduits.map(conduit => conduit?.ductbankTag) : [])
    ];
    const explicit = candidates.find(value => String(value || '').trim());
    if(explicit) return String(explicit).trim();

    const conduitId = (db?.conduits || [])
      .map(conduit => String(conduit?.conduit_id || ''))
      .find(Boolean);
    const match = conduitId.match(/^DB(\d+)-/i);
    if(match) return `DUCTBANK-DB-${match[1].padStart(2, '0')}`;
    return isDuctbankSample ? `DUCTBANK-DB-${String(index + 1).padStart(2, '0')}` : '';
  }

  function repairDuctbankParentRows(rows){
    const workflow = getItem('activeSampleWorkflow');
    const isDuctbankSample = workflow?.id === 'ductbank-network';
    const sampleDefaults = {
      'DUCTBANK-DB-01': { from: 'SUBSTATION-SW1', to: 'PAD-XFMR-T2 / PAD-XFMR-T3' },
      'DUCTBANK-DB-02': { from: 'SUBSTATION-SW2', to: 'BLDG-XFMR-T1' }
    };
    let changed = false;
    rows.forEach((db, index) => {
      const tag = inferDuctbankParentTag(db, index, isDuctbankSample);
      if(tag && db.tag !== tag){
        db.tag = tag;
        changed = true;
      }
      if(tag && !String(db.ductbank_id || '').trim()){
        db.ductbank_id = tag;
        changed = true;
      }
      if(tag && (db.id === undefined || db.id === null || db.id === '')){
        db.id = tag;
        changed = true;
      }
      const defaults = isDuctbankSample ? sampleDefaults[tag] : null;
      if(defaults && !String(db.from || '').trim()){
        db.from = defaults.from;
        changed = true;
      }
      if(defaults && !String(db.to || '').trim()){
        db.to = defaults.to;
        changed = true;
      }
      if(defaults && db.concrete_encasement !== true){
        db.concrete_encasement = true;
        changed = true;
      }
      (db.conduits || []).forEach(conduit => {
        if(tag && conduit.ductbankTag !== tag){
          conduit.ductbankTag = tag;
          changed = true;
        }
      });
    });
    return changed;
  }

  function populateMaterialOptions(select, value){
    select.innerHTML = '';
    CONDUIT_MATERIAL_OPTIONS.forEach(material => {
      const opt = document.createElement('option');
      opt.value = material;
      opt.textContent = material;
      select.appendChild(opt);
    });
    select.value = value && CONDUIT_MATERIAL_OPTIONS.includes(value) ? value : CONDUIT_MATERIAL_OPTIONS[0];
  }

  function setWidth(cell,idx){
    if(headerCells&&headerCells[idx]&&headerCells[idx].style.width){
      cell.style.width=headerCells[idx].style.width;
    }
  }

  function getDuctbankRows(){
    if(!ductbankTbody) return [];
    return Array.from(ductbankTbody.children).filter(row => (
      row.matches('tr') && !row.classList.contains('conduit-container')
    ));
  }

  function showFilterPopup(btn,index){
    document.querySelectorAll('.filter-popup').forEach(p=>p.remove());
    const popup=document.createElement('div');
    popup.className='filter-popup';
    const inp=document.createElement('input');
    inp.type='text';
    inp.value=filters[index]||'';
    popup.appendChild(inp);
    const apply=document.createElement('button');
    apply.textContent='Apply';
    apply.setAttribute('aria-label','Apply filter');
    apply.addEventListener('click',()=>{
      filters[index]=inp.value.trim();
      if(filters[index]) btn.classList.add('filtered'); else btn.classList.remove('filtered');
      applyFilters();
      popup.remove();
    });
    popup.appendChild(apply);
    const clear=document.createElement('button');
    clear.textContent='Clear';
    clear.setAttribute('aria-label','Clear filter');
    clear.addEventListener('click',()=>{
      inp.value='';
      filters[index]='';
      btn.classList.remove('filtered');
      applyFilters();
      popup.remove();
    });
    popup.appendChild(clear);
    const rect=btn.getBoundingClientRect();
    popup.style.top=(rect.bottom+window.scrollY)+'px';
    popup.style.left=(rect.left+window.scrollX)+'px';
    document.body.appendChild(popup);
    const close=e=>{if(!popup.contains(e.target)){popup.remove();document.removeEventListener('click',close);}};
    setTimeout(()=>document.addEventListener('click',close),0);
  }

  function applyFilters(){
    const rows=getDuctbankRows();
    rows.forEach((row,i)=>{
      let visible=true;
      for(let c=1;c<headerCells.length-1;c++){
        const f=filters[c];
        if(f){
          const cell=row.cells[c];
          let val='';
          if(cell){
            const inp=cell.querySelector('input');
            if(inp){
              if(inp.type==='checkbox') val=inp.checked?'true':'false';
              else val=inp.value;
            }else{val=cell.textContent;}
          }
          if(!String(val).toLowerCase().includes(f.toLowerCase())){visible=false;break;}
        }
      }
      row.style.display=visible?'':'none';
      const cRow=row.nextElementSibling;
      if(cRow&&cRow.classList.contains('conduit-container')){
        cRow.style.display=visible&&ductbanks[i]?.expanded?'':'none';
      }
    });
  }

  function clearFilters(){
    filters=filters.map(()=> '');
    filterButtons.forEach(b=>{if(b) b.classList.remove('filtered');});
    applyFilters();
  }

  function initHeader(){
    const table=document.getElementById('ductbankTable');
    headerCells=table.tHead.rows[0].cells;
    filters=Array(headerCells.length).fill('');
    filterButtons=[];
    Array.from(headerCells).forEach((th,idx)=>{
      th.style.position='relative';
      if(idx>0){
        const btn=document.createElement('button');
        btn.className='filter-btn';
        btn.innerHTML=FILTER_ICON_SVG;
        btn.setAttribute('aria-label','Filter column');
        btn.addEventListener('click',e=>{e.stopPropagation();showFilterPopup(btn,idx);});
        th.appendChild(btn);
        filterButtons[idx]=btn;
      }
      const res=document.createElement('span');
      res.className='col-resizer';
      th.appendChild(res);
      let startX,startWidth;
      const onMove=e=>{
        const newWidth=Math.max(30,startWidth+e.pageX-startX);
        th.style.width=newWidth+'px';
        Array.from(ductbankTbody.rows).forEach(r=>{if(r.cells[idx]) r.cells[idx].style.width=newWidth+'px';});
      };
      res.addEventListener('mousedown',e=>{
        startX=e.pageX;startWidth=th.offsetWidth;
        document.addEventListener('mousemove',onMove);
        document.addEventListener('mouseup',()=>{document.removeEventListener('mousemove',onMove);},{once:true});
      });
    });
  }

  function appendDuctbankRow(tr){
    if(!ductbankTbody){
      ductbankTbody=document.querySelector('#ductbankTable tbody');
      if(!ductbankTbody) return;
    }
    tr.classList.add('ductbank-row');
    ductbankTbody.appendChild(tr);
  }

  function renderDuctbanks(){
    // Lazily select the table body in case initialization was skipped
    if(!ductbankTbody){
      ductbankTbody=document.querySelector('#ductbankTable tbody');
      console.assert(ductbankTbody, 'Ductbank table body not found during render');
      if(!ductbankTbody) return;
    }
    const specs = globalThis.CONDUIT_SPECS || {};
    ductbankTbody.innerHTML='';
    ductbanks.forEach((db,i)=>{
      const row=document.createElement('tr');
      row.dataset.tag = db.tag;
      row.dataset.ductbankIndex = String(i);
      row.tabIndex = 0;
      row.classList.add('table-row-focusable');
      appendDuctbankRow(row);
      const tgl=row.insertCell();
      setWidth(tgl,0);
      const tglBtn=document.createElement('button');
      tglBtn.textContent=db.expanded?'\u25BC':'\u25B6';
      tglBtn.setAttribute('aria-label','Toggle ductbank');
      tglBtn.addEventListener('click',()=>{db.expanded=!db.expanded;renderDuctbanks();});
      tgl.appendChild(tglBtn);

      const tag=row.insertCell();
      setWidth(tag,1);
      const tagInput=document.createElement('input');
      tagInput.value=db.tag||'';
      const tagRules=['required'];
      tagInput.addEventListener('input',e=>{
        db.tag=e.target.value;
        // keep conduit ductbank tags in sync with parent tag
        db.conduits.forEach(c=>{c.ductbankTag=db.tag;});
        TableUtils.applyValidation(tagInput,tagRules);
        saveDuctbanks();
      });
      TableUtils.applyValidation(tagInput,tagRules);
      tag.appendChild(tagInput);

      const from=row.insertCell();
      setWidth(from,2);
      const fromInput=document.createElement('input');
      fromInput.value=db.from||'';
      const fromRules=['required'];
      fromInput.addEventListener('input',e=>{db.from=e.target.value;TableUtils.applyValidation(fromInput,fromRules);saveDuctbanks();});
      TableUtils.applyValidation(fromInput,fromRules);
      from.appendChild(fromInput);

      const to=row.insertCell();
      setWidth(to,3);
      const toInput=document.createElement('input');
      toInput.value=db.to||'';
      const toRules=['required'];
      toInput.addEventListener('input',e=>{db.to=e.target.value;TableUtils.applyValidation(toInput,toRules);saveDuctbanks();});
      TableUtils.applyValidation(toInput,toRules);
      to.appendChild(toInput);

      const ce=row.insertCell();
      setWidth(ce,4);
      const ceInput=document.createElement('input');
      ceInput.type='checkbox';
      ceInput.checked=db.concrete_encasement||false;
      ceInput.addEventListener('change',e=>{db.concrete_encasement=e.target.checked;saveDuctbanks();});
      ce.appendChild(ceInput);

      const sx=row.insertCell();
      setWidth(sx,5);
      const sxInput=document.createElement('input');
      sxInput.type='number';
      sxInput.value=db.start_x??'';
      const sxRules=['required','numeric'];
      sxInput.addEventListener('input',e=>{db.start_x=e.target.value;db.conduits.forEach(c=>c.start_x=db.start_x);TableUtils.applyValidation(sxInput,sxRules);saveDuctbanks();});
      TableUtils.applyValidation(sxInput,sxRules);
      sx.appendChild(sxInput);

      const sy=row.insertCell();
      setWidth(sy,6);
      const syInput=document.createElement('input');
      syInput.type='number';
      syInput.value=db.start_y??'';
      const syRules=['required','numeric'];
      syInput.addEventListener('input',e=>{db.start_y=e.target.value;db.conduits.forEach(c=>c.start_y=db.start_y);TableUtils.applyValidation(syInput,syRules);saveDuctbanks();});
      TableUtils.applyValidation(syInput,syRules);
      sy.appendChild(syInput);

      const sz=row.insertCell();
      setWidth(sz,7);
      const szInput=document.createElement('input');
      szInput.type='number';
      szInput.value=db.start_z??'';
      const szRules=['required','numeric'];
      szInput.addEventListener('input',e=>{db.start_z=e.target.value;db.conduits.forEach(c=>c.start_z=db.start_z);TableUtils.applyValidation(szInput,szRules);saveDuctbanks();});
      TableUtils.applyValidation(szInput,szRules);
      sz.appendChild(szInput);

      const ex=row.insertCell();
      setWidth(ex,8);
      const exInput=document.createElement('input');
      exInput.type='number';
      exInput.value=db.end_x??'';
      const exRules=['required','numeric'];
      exInput.addEventListener('input',e=>{db.end_x=e.target.value;db.conduits.forEach(c=>c.end_x=db.end_x);TableUtils.applyValidation(exInput,exRules);saveDuctbanks();});
      TableUtils.applyValidation(exInput,exRules);
      ex.appendChild(exInput);

      const ey=row.insertCell();
      setWidth(ey,9);
      const eyInput=document.createElement('input');
      eyInput.type='number';
      eyInput.value=db.end_y??'';
      const eyRules=['required','numeric'];
      eyInput.addEventListener('input',e=>{db.end_y=e.target.value;db.conduits.forEach(c=>c.end_y=db.end_y);TableUtils.applyValidation(eyInput,eyRules);saveDuctbanks();});
      TableUtils.applyValidation(eyInput,eyRules);
      ey.appendChild(eyInput);

      const ez=row.insertCell();
      setWidth(ez,10);
      const ezInput=document.createElement('input');
      ezInput.type='number';
      ezInput.value=db.end_z??'';
      const ezRules=['required','numeric'];
      ezInput.addEventListener('input',e=>{db.end_z=e.target.value;db.conduits.forEach(c=>c.end_z=db.end_z);TableUtils.applyValidation(ezInput,ezRules);saveDuctbanks();});
      TableUtils.applyValidation(ezInput,ezRules);
      ez.appendChild(ezInput);


      const cRow=document.createElement('tr');
      cRow.classList.add('conduit-container');
      ductbankTbody.appendChild(cRow);
      cRow.style.display=db.expanded?'':'none';
      const cCell=cRow.insertCell();
      cCell.colSpan=11;
      const cTable=document.createElement('table');
      cTable.className='nested-table';
      const cHead=cTable.createTHead();
      const h=cHead.insertRow();
      ['Conduit ID','Type','Material','Trade Size','Allowed Group'].forEach(txt=>{
        const th=document.createElement('th');
        th.textContent=txt;
        h.appendChild(th);
      });
      const cBody=cTable.createTBody();
      db.conduits.forEach(c=>{if(c.ductbankTag===undefined)c.ductbankTag=db.tag;});
      db.conduits.forEach((c,j)=>{
        const r=cBody.insertRow();
        r.dataset.ductbankIndex = String(i);
        r.dataset.conduitIndex = String(j);
        r.tabIndex = 0;
        r.classList.add('table-row-focusable');
        if (c.error) r.classList.add('missing-tag-row');

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

        // Material select
        cell=r.insertCell();
        const materialSel=document.createElement('select');
        const initialMaterial=c.material||defaultConduitMaterial(c.type);
        populateMaterialOptions(materialSel, initialMaterial);
        c.material=materialSel.value;
        cell.appendChild(materialSel);

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

        typeSel.addEventListener('change',e=>{
          const previousDefault=defaultConduitMaterial(c.type);
          c.type=e.target.value;
          populateSizes();
          c.trade_size=sizeSel.value;
          if(!c.material||c.material===previousDefault){
            c.material=defaultConduitMaterial(c.type);
            materialSel.value=c.material;
          }
          TableUtils.applyValidation(typeSel,typeRules);
          saveDuctbanks();
        });
        materialSel.addEventListener('change',e=>{c.material=e.target.value;saveDuctbanks();});
        sizeSel.addEventListener('change',e=>{c.trade_size=e.target.value;TableUtils.applyValidation(sizeSel,sizeRules);saveDuctbanks();});
        TableUtils.applyValidation(typeSel,typeRules);
        TableUtils.applyValidation(sizeSel,sizeRules);

        // Allowed group
        cell=r.insertCell();
        const agInp=document.createElement('input');
        agInp.type='text';
        agInp.value=c.allowed_cable_group||'';
        agInp.addEventListener('input',e=>{c.allowed_cable_group=e.target.value;saveDuctbanks();});
        cell.appendChild(agInp);

      });
      cCell.appendChild(cTable);
    });
    const rc=document.getElementById('ductbank-row-count');
    if(rc) rc.textContent=`Rows: ${ductbanks.length}`;
    applyFilters();
  }

  function cloneData(value){
    return JSON.parse(JSON.stringify(value || {}));
  }

  function makeDuctbank(data = {}){
    const next = {
      id:data.id || Date.now()+Math.random(),
      tag:data.tag || '',
      from:data.from || '',
      to:data.to || '',
      concrete_encasement:!!data.concrete_encasement,
      start_x:data.start_x ?? '',
      start_y:data.start_y ?? '',
      start_z:data.start_z ?? '',
      end_x:data.end_x ?? '',
      end_y:data.end_y ?? '',
      end_z:data.end_z ?? '',
      conduits:Array.isArray(data.conduits) ? cloneData(data.conduits) : [],
      expanded:data.expanded ?? true
    };
    next.conduits.forEach(c=>{
      if(c.ductbankTag===undefined) c.ductbankTag=next.tag;
      if(c.material===undefined) c.material=defaultConduitMaterial(c.type);
    });
    return next;
  }

  function makeCopiedDuctbank(db){
    const copy=makeDuctbank(cloneData(db));
    copy.id=Date.now()+Math.random();
    copy.conduits.forEach(c=>{c.ductbankTag=copy.tag;});
    return copy;
  }

  function makeConduit(db, data = {}){
    return {
      conduit_id:data.conduit_id || '',
      type:data.type || '',
      material:data.material || defaultConduitMaterial(data.type || ''),
      trade_size:data.trade_size || '',
      allowed_cable_group:data.allowed_cable_group || '',
      ductbankTag:db.tag,
      start_x:data.start_x ?? db.start_x,
      start_y:data.start_y ?? db.start_y,
      start_z:data.start_z ?? db.start_z,
      end_x:data.end_x ?? db.end_x,
      end_y:data.end_y ?? db.end_y,
      end_z:data.end_z ?? db.end_z
    };
  }

  function insertDuctbank(index, data = {}){
    const targetIndex=Math.max(0,Math.min(index,ductbanks.length));
    ductbanks.splice(targetIndex,0,makeDuctbank(data));
    renderDuctbanks();
    saveDuctbanks();
  }

  function insertConduit(ductbankIndex, conduitIndex, data = {}){
    const db=ductbanks[ductbankIndex];
    if(!db) return;
    const targetIndex=Math.max(0,Math.min(conduitIndex,db.conduits.length));
    db.conduits.splice(targetIndex,0,makeConduit(db,data));
    db.expanded=true;
    renderDuctbanks();
    saveDuctbanks();
  }

  function applyDuctbankBatchEdit({target='ductbanks',field,value='',scope='visible'} = {}){
    let count=0;
    let skipped=0;
    const visibleOnly=scope!=='all';
    const specs=globalThis.CONDUIT_SPECS||{};
    if(target==='ductbankConduits'){
      const targets=[];
      if(visibleOnly){
        document.querySelectorAll('#ductbankTable tr[data-conduit-index]').forEach(row=>{
          const container=row.closest('tr.conduit-container');
          if(row.style.display==='none'||container?.style.display==='none') return;
          const ductbankIndex=Number.parseInt(row.dataset.ductbankIndex,10);
          const conduitIndex=Number.parseInt(row.dataset.conduitIndex,10);
          if(Number.isInteger(ductbankIndex)&&Number.isInteger(conduitIndex)) targets.push([ductbankIndex,conduitIndex]);
        });
      }else{
        ductbanks.forEach((db,ductbankIndex)=>{
          (db.conduits||[]).forEach((c,conduitIndex)=>targets.push([ductbankIndex,conduitIndex]));
        });
      }
      targets.forEach(([ductbankIndex,conduitIndex])=>{
        const db=ductbanks[ductbankIndex];
        const conduit=db?.conduits?.[conduitIndex];
        if(!db||!conduit){skipped+=1;return;}
        if(field==='trade_size'){
          if(!specs[conduit.type]?.[value]){skipped+=1;return;}
          conduit.trade_size=value;
        }else if(field==='type'){
          conduit.type=value;
          const sizes=Object.keys(specs[value]||{}).sort((a,b)=>parseSize(a)-parseSize(b));
          conduit.trade_size=sizes[0]||conduit.trade_size||'';
          if(!conduit.material) conduit.material=defaultConduitMaterial(value);
        }else if(field){
          conduit[field]=value;
        }
        conduit.ductbankTag=db.tag;
        count+=1;
      });
    }else{
      const rowIndexes=[];
      if(visibleOnly){
        getDuctbankRows().forEach(row=>{
          if(row.style.display==='none') return;
          const index=Number.parseInt(row.dataset.ductbankIndex,10);
          if(Number.isInteger(index)) rowIndexes.push(index);
        });
      }else{
        ductbanks.forEach((db,index)=>rowIndexes.push(index));
      }
      rowIndexes.forEach(index=>{
        const db=ductbanks[index];
        if(!db){skipped+=1;return;}
        if(field==='concrete_encasement'){
          db.concrete_encasement=value==='Yes'||value==='true'||value===true;
        }else if(field){
          db[field]=value;
          if(['start_x','start_y','start_z','end_x','end_y','end_z'].includes(field)){
            db.conduits.forEach(c=>{c[field]=value;});
          }
        }
        count+=1;
      });
    }
    saveDuctbanks();
    return {count,skipped};
  }

  function addDuctbank(data = {}){
    const next = makeDuctbank(data);
    ductbanks.push(next);
    renderDuctbanks();
    saveDuctbanks();
  }

  function addConduit(i){
    const db=ductbanks[i];
    if(!db) return;
    ductbanks[i].conduits.push(makeConduit(db));
    db.expanded=true;
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

  function viewDuctbank(i){
    const db=ductbanks[i];
    const session={
      ductbankTag:db.tag,
      concreteEncasement:db.concrete_encasement,
      conduits:db.conduits.map(c=>({conduit_id:c.conduit_id,conduit_type:c.type,trade_size:c.trade_size}))
    };
    try{setItem('ductbankSession',session);}catch(e){console.error('Failed to store ductbank session',e);}
    window.location.href='ductbankroute.html';
  }

  function duplicateDuctbank(i){
    const copy=makeCopiedDuctbank(ductbanks[i]);
    ductbanks.splice(i+1,0,copy);
    renderDuctbanks();
    saveDuctbanks();
  }

  function duplicateConduit(i,j){
    const copy=makeConduit(ductbanks[i],cloneData(ductbanks[i].conduits[j]));
    ductbanks[i].conduits.splice(j+1,0,copy);
    renderDuctbanks();
    saveDuctbanks();
  }

  function saveDuctbanks(){
    let hasError=false;
    ductbanks.forEach(db=>db.conduits.forEach(c=>{
      if(!c.ductbankTag||c.ductbankTag!==db.tag){
        c.error=true;
        hasError=true;
      }else{
        delete c.error;
      }
    }));
    renderDuctbanks();
    if(hasError){
      showAlertModal('Validation Error', 'Every conduit must have a matching ductbank tag.');
      return;
    }
    ductbanks.forEach(db=>db.conduits.forEach(c=>{c.ductbankTag=db.tag;}));
    try{setDuctbanks(ductbanks);}catch(e){console.warn('setDuctbanks failed', e);}
    applyFilters();
  }

  function loadDuctbanks(){
    // Ensure the table body exists even if initDuctbankTable wasn't called
    if(!ductbankTbody){
      ductbankTbody=document.querySelector('#ductbankTable tbody');
      console.assert(ductbankTbody, 'Ductbank table body not found');
      if(!ductbankTbody) return;
    }
    try{ductbanks=cloneData(readStoredDuctbanks());}catch(e){ductbanks=[];}
    repairDuctbankParentRows(ductbanks);
    ductbanks.forEach(db=>{
      if(db.expanded===undefined) db.expanded=false;
      if(!db.conduits) db.conduits=[];
      if(db.concrete_encasement===undefined) db.concrete_encasement=false;
      ['start_x','start_y','start_z','end_x','end_y','end_z'].forEach(k=>{if(db[k]===undefined) db[k]='';});
      db.conduits.forEach(c=>{
        ['start_x','start_y','start_z','end_x','end_y','end_z'].forEach(k=>{if(c[k]===undefined) c[k]=db[k];});
        if(c.allowed_cable_group===undefined) c.allowed_cable_group='';
        if(c.ductbankTag===undefined) c.ductbankTag=db.tag;
        if(c.material===undefined) c.material=defaultConduitMaterial(c.type);
      });
    });
    renderDuctbanks();
    const rendered=getDuctbankRows().length;
    console.assert(rendered===ductbanks.length,`Rendered ${rendered} ductbanks, expected ${ductbanks.length}`);
  }

  function exportDuctbankXlsx(){
    if(typeof XLSX==='undefined'){
      showAlertModal('Library Error', 'XLSX library not loaded.');
      return;
    }
    const dbData=[['ductbank_id','tag','from','to','concrete_encasement','start_x','start_y','start_z','end_x','end_y','end_z']];
    ductbanks.forEach(db=>dbData.push([db.id,db.tag,db.from,db.to,db.concrete_encasement?1:0,db.start_x,db.start_y,db.start_z,db.end_x,db.end_y,db.end_z]));
    const cData=[['ductbank_id','ductbankTag','conduit_id','type','material','trade_size','start_x','start_y','start_z','end_x','end_y','end_z','allowed_cable_group']];
    ductbanks.forEach(db=>db.conduits.forEach(c=>cData.push([db.id,db.tag||db.id,c.conduit_id,c.type,c.material,c.trade_size,c.start_x,c.start_y,c.start_z,c.end_x,c.end_y,c.end_z,c.allowed_cable_group])));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(dbData),'Ductbanks');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(cData),'Conduits');
    XLSX.writeFile(wb,'ductbank_schedule.xlsx');
  }

  function readImportField(row,names){
    for(const name of names){
      if(Object.prototype.hasOwnProperty.call(row,name)) return row[name];
    }
    const lookup=Object.fromEntries(Object.keys(row).map(key=>[String(key).toLowerCase(),key]));
    for(const name of names){
      const key=lookup[String(name).toLowerCase()];
      if(key!==undefined) return row[key];
    }
    return '';
  }

  function normalizeImportTag(value){
    return String(value||'').trim().toLowerCase();
  }

  function parseImportedDuctbanks(dbJson,cJson){
    const mapByTag={};
    const mapById={};
    const imported=dbJson.map(r=>{
      const db={
        id:readImportField(r,['ductbank_id','id'])||Date.now()+Math.random(),
        tag:readImportField(r,['tag'])||'',
        from:readImportField(r,['from'])||'',
        to:readImportField(r,['to'])||'',
        concrete_encasement:['1','true','yes'].includes(String(readImportField(r,['concrete_encasement'])).trim().toLowerCase())||readImportField(r,['concrete_encasement'])===true,
        start_x:readImportField(r,['start_x'])||'',
        start_y:readImportField(r,['start_y'])||'',
        start_z:readImportField(r,['start_z'])||'',
        end_x:readImportField(r,['end_x'])||'',
        end_y:readImportField(r,['end_y'])||'',
        end_z:readImportField(r,['end_z'])||'',
        conduits:[],
        expanded:false
      };
      mapByTag[normalizeImportTag(db.tag)]=db;
      mapById[String(db.id)]=db;
      return db;
    });
    cJson.forEach(r=>{
      const ductbankTag=readImportField(r,['ductbankTag','ductbanktag','tag']);
      const ductbankId=readImportField(r,['ductbank_id','id']);
      const parent=mapByTag[normalizeImportTag(ductbankTag)]||mapById[String(ductbankId)];
      if(parent){
        parent.conduits.push({
          conduit_id:readImportField(r,['conduit_id','id'])||'',
          type:readImportField(r,['type'])||'',
          material:readImportField(r,['material','Material'])||defaultConduitMaterial(readImportField(r,['type'])||''),
          trade_size:readImportField(r,['trade_size'])||'',
          allowed_cable_group:readImportField(r,['allowed_cable_group'])||'',
          ductbankTag:ductbankTag||parent.tag,
          start_x:readImportField(r,['start_x'])||parent.start_x,
          start_y:readImportField(r,['start_y'])||parent.start_y,
          start_z:readImportField(r,['start_z'])||parent.start_z,
          end_x:readImportField(r,['end_x'])||parent.end_x,
          end_y:readImportField(r,['end_y'])||parent.end_y,
          end_z:readImportField(r,['end_z'])||parent.end_z
        });
      }
    });
    return imported;
  }

  function stripDuctbankConduits(db){
    const { conduits, ...rest } = db || {};
    return rest;
  }

  function ductbankIdentity(db){
    return normalizeImportTag(db?.tag)||normalizeImportTag(db?.id)||normalizeImportTag(db?.ductbank_id);
  }

  function flattenDuctbankConduits(rows){
    return (rows||[]).flatMap(db=>(db.conduits||[]).map(c=>{
      const parent=db.tag||db.id||c.ductbankTag||'';
      const conduitId=c.conduit_id||c.id||c.ref||'';
      return {
        ...c,
        ductbankTag:c.ductbankTag||db.tag,
        __identity:parent&&conduitId?`${parent}::${conduitId}`:conduitId
      };
    }));
  }

  function previewDuctbankImport(currentRows,incomingRows,mode){
    return {
      ductbanks:previewRecordImport(
        (currentRows||[]).map(stripDuctbankConduits),
        (incomingRows||[]).map(stripDuctbankConduits),
        { mode, identityFields:['tag','id','ductbank_id','ref'] }
      ),
      conduits:previewRecordImport(
        flattenDuctbankConduits(currentRows),
        flattenDuctbankConduits(incomingRows),
        { mode, identityFields:['__identity','conduit_id','id','ref'] }
      )
    };
  }

  function mergeDuctbankImportRows(currentRows,incomingRows,mode){
    if(mode==='append') return [...currentRows.map(cloneData), ...incomingRows.map(cloneData)];
    if(mode==='replace') return incomingRows.map(cloneData);
    const next=currentRows.map(cloneData);
    const index=new Map();
    next.forEach((db,idx)=>{
      const key=ductbankIdentity(db);
      if(key&&!index.has(key)) index.set(key,idx);
    });
    incomingRows.forEach(imported=>{
      const key=ductbankIdentity(imported);
      const existingIndex=key?index.get(key):undefined;
      if(existingIndex===undefined){
        next.push(cloneData(imported));
        return;
      }
      const existing=next[existingIndex];
      const top=applyRecordImport(
        [stripDuctbankConduits(existing)],
        [stripDuctbankConduits(imported)],
        { mode:'merge', identityFields:['tag','id','ductbank_id','ref'] }
      )[0];
      const conduits=applyRecordImport(
        existing.conduits||[],
        imported.conduits||[],
        { mode:'merge', identityFields:['conduit_id','id','ref'] }
      ).map(c=>({
        ...c,
        ductbankTag:c.ductbankTag||top.tag||existing.tag
      }));
      next[existingIndex]={...existing,...top,conduits};
    });
    return next;
  }

  async function chooseDuctbankImportMode(importedRows){
    let modeSelect=null;
    let previewPanel=null;
    const refreshPreview=()=>{
      if(!previewPanel) return;
      const mode=modeSelect?.value||'merge';
      const preview=previewDuctbankImport(ductbanks,importedRows,mode);
      previewPanel.innerHTML=`
        <p><strong>Ductbanks:</strong> ${preview.ductbanks.creates} create, ${preview.ductbanks.updates} update, ${preview.ductbanks.conflicts} conflict, ${preview.ductbanks.unchanged} unchanged.</p>
        <p><strong>Conduits:</strong> ${preview.conduits.creates} create, ${preview.conduits.updates} update, ${preview.conduits.conflicts} conflict, ${preview.conduits.unchanged} unchanged.</p>
        <p>${preview.ductbanks.preserved} existing ductbank row(s) preserved${preview.ductbanks.removed?`, ${preview.ductbanks.removed} removed by replace mode`:''}. Merge keeps existing non-empty values when conflicts are found.</p>
      `;
    };
    return openModal({
      title:'Preview Ductbank Import',
      description:'Choose how the workbook should be applied before updating the ductbank schedule.',
      primaryText:'Apply Import',
      secondaryText:'Cancel',
      defaultWidth:'wide',
      render(body){
        const modeLabel=document.createElement('label');
        modeLabel.className='modal-form-field';
        modeLabel.textContent='Import Mode';
        modeSelect=document.createElement('select');
        [
          ['merge','Merge with existing rows (recommended)'],
          ['append','Append as new rows'],
          ['replace','Replace current ductbank schedule']
        ].forEach(([value,text])=>{
          const option=document.createElement('option');
          option.value=value;
          option.textContent=text;
          modeSelect.appendChild(option);
        });
        modeSelect.addEventListener('change',refreshPreview);
        modeLabel.appendChild(modeSelect);
        previewPanel=document.createElement('div');
        previewPanel.className='import-preview-list';
        body.append(modeLabel,previewPanel);
        refreshPreview();
        return modeSelect;
      },
      onSubmit:()=>modeSelect?.value||'merge'
    });
  }

  async function importDuctbankXlsx(file){
    if(!file) return;
    if(typeof XLSX==='undefined'){
      showAlertModal('Library Error', 'XLSX library not loaded.');
      return;
    }
    try{
      const buffer=await file.arrayBuffer();
      const wb=XLSX.read(buffer,{type:'array'});
      const dbSheet=wb.Sheets['Ductbanks']||wb.Sheets[wb.SheetNames[0]];
      const cSheet=wb.Sheets['Conduits']||wb.Sheets[wb.SheetNames[1]];

      if(!dbSheet){
        showAlertModal('Import Error', 'Ductbanks sheet not found.');
        return;
      }
      if(!cSheet){
        showAlertModal('Import Error', 'Conduits sheet not found.');
        return;
      }

      const requiredDbHeaders=['ductbank_id','tag','from','to','concrete_encasement','start_x','start_y','start_z','end_x','end_y','end_z'];
      const dbHeaders=(XLSX.utils.sheet_to_json(dbSheet,{header:1})[0]||[]).map(h=>String(h).toLowerCase());
      const missingDb=requiredDbHeaders.filter(h=>!dbHeaders.includes(h));
      if(missingDb.length){
        showAlertModal('Import Error', 'Missing required Ductbanks headers: '+missingDb.join(', '));
        return;
      }

      const requiredCHeaders=['ductbanktag','conduit_id','type','trade_size','start_x','start_y','start_z','end_x','end_y','end_z'];
      const cHeaders=(XLSX.utils.sheet_to_json(cSheet,{header:1})[0]||[]).map(h=>String(h).toLowerCase());
      const missingC=requiredCHeaders.filter(h=>!cHeaders.includes(h));
      const hasLegacyId=cHeaders.includes('ductbank_id');
      if(missingC.length){
        if(!(missingC.length===1&&missingC[0]==='ductbanktag'&&hasLegacyId)){
          showAlertModal('Import Error', 'Missing required Conduits headers: '+missingC.join(', '));
          return;
        }
      }

      const dbJson=XLSX.utils.sheet_to_json(dbSheet,{defval:''});
      const cJson=XLSX.utils.sheet_to_json(cSheet,{defval:''});
      const importedDuctbanks=parseImportedDuctbanks(dbJson,cJson);
      const mode=await chooseDuctbankImportMode(importedDuctbanks);
      if(!mode) return;
      ductbanks=mergeDuctbankImportRows(ductbanks,importedDuctbanks,mode);
      renderDuctbanks();
      saveDuctbanks();
      if (typeof document !== 'undefined' && document.dispatchEvent) {
        document.dispatchEvent(new Event('imports-ready'));
      }
    }catch(error){
      console.error('Failed to import ductbank workbook', error);
      showAlertModal('Import Error', 'Unable to read the selected ductbank workbook.');
    }
  }

  function ductbankIndexFromRow(row){
    const index=Number.parseInt(row?.dataset?.ductbankIndex,10);
    return Number.isInteger(index) ? index : -1;
  }

  function conduitIndexFromRow(row){
    const index=Number.parseInt(row?.dataset?.conduitIndex,10);
    return Number.isInteger(index) ? index : -1;
  }

  function initRowContextMenus(){
    if(rowContextMenusReady) return;
    const table=document.getElementById('ductbankTable');
    if(!table) return;
    rowContextMenusReady=true;
    const ductbankMenu=new ContextMenu([
      {label:'View Ductbank Route',action:row=>{const i=ductbankIndexFromRow(row);if(i>=0)viewDuctbank(i);}},
      {label:'Expand / Collapse Conduits',action:row=>{const i=ductbankIndexFromRow(row);if(i<0)return;ductbanks[i].expanded=!ductbanks[i].expanded;renderDuctbanks();saveDuctbanks();}},
      {label:'Add Conduit',action:row=>{const i=ductbankIndexFromRow(row);if(i>=0)addConduit(i);}},
      {label:'Insert Ductbank Above',action:row=>{const i=ductbankIndexFromRow(row);if(i>=0)insertDuctbank(i);}},
      {label:'Insert Ductbank Below',action:row=>{const i=ductbankIndexFromRow(row);if(i>=0)insertDuctbank(i+1);}},
      {label:'Duplicate Ductbank',action:row=>{const i=ductbankIndexFromRow(row);if(i>=0)duplicateDuctbank(i);}},
      {label:'Copy Ductbank',action:row=>{const i=ductbankIndexFromRow(row);if(i>=0)ductbankClipboard=makeCopiedDuctbank(ductbanks[i]);}},
      {
        label:'Paste Ductbank Below',
        action:row=>{const i=ductbankIndexFromRow(row);if(i>=0&&ductbankClipboard)insertDuctbank(i+1,makeCopiedDuctbank(ductbankClipboard));},
        isDisabled:()=>!ductbankClipboard
      },
      {label:'Delete Ductbank',action:row=>{const i=ductbankIndexFromRow(row);if(i>=0)deleteDuctbank(i);}}
    ]);
    const conduitMenu=new ContextMenu([
      {label:'Insert Conduit Above',action:row=>{const i=ductbankIndexFromRow(row);const j=conduitIndexFromRow(row);if(i>=0&&j>=0)insertConduit(i,j);}},
      {label:'Insert Conduit Below',action:row=>{const i=ductbankIndexFromRow(row);const j=conduitIndexFromRow(row);if(i>=0&&j>=0)insertConduit(i,j+1);}},
      {label:'Duplicate Conduit',action:row=>{const i=ductbankIndexFromRow(row);const j=conduitIndexFromRow(row);if(i>=0&&j>=0)duplicateConduit(i,j);}},
      {label:'Copy Conduit',action:row=>{const i=ductbankIndexFromRow(row);const j=conduitIndexFromRow(row);if(i>=0&&j>=0)conduitClipboard=cloneData(ductbanks[i].conduits[j]);}},
      {
        label:'Paste Conduit Below',
        action:row=>{const i=ductbankIndexFromRow(row);const j=conduitIndexFromRow(row);if(i>=0&&j>=0&&conduitClipboard)insertConduit(i,j+1,conduitClipboard);},
        isDisabled:()=>!conduitClipboard
      },
      {label:'Delete Conduit',action:row=>{const i=ductbankIndexFromRow(row);const j=conduitIndexFromRow(row);if(i>=0&&j>=0)deleteConduit(i,j);}}
    ]);

    function showMenuForRow(row,x,y){
      if(!row) return false;
      if(row.dataset.conduitIndex!==undefined){
        conduitMenu.show(x,y,row);
        return true;
      }
      if(row.classList.contains('ductbank-row')){
        ductbankMenu.show(x,y,row);
        return true;
      }
      return false;
    }

    table.addEventListener('contextmenu',event=>{
      const row=event.target.closest('tbody tr[data-conduit-index], tbody tr.ductbank-row');
      if(row&&table.contains(row)){
        event.preventDefault();
        showMenuForRow(row,event.pageX,event.pageY);
      }else if(event.target.closest('#ductbankTable')){
        event.preventDefault();
      }
    });

    table.addEventListener('keydown',event=>{
      if(!((event.shiftKey&&event.key==='F10')||event.key==='ContextMenu')) return;
      const row=event.target.closest('tbody tr[data-conduit-index], tbody tr.ductbank-row');
      if(!row) return;
      event.preventDefault();
      const rect=event.target.getBoundingClientRect();
      showMenuForRow(row,rect.left+rect.width/2+window.pageXOffset,rect.bottom+window.pageYOffset);
    });
  }

  function initDuctbankTable(){
    ductbankTbody=document.querySelector('#ductbankTable tbody');
    document.getElementById('add-ductbank-btn').addEventListener('click',e=>{
      if(e.currentTarget?.dataset?.guidedAdd==='true') return;
      addDuctbank();
    });
    document.getElementById('save-ductbank-btn').addEventListener('click',saveDuctbanks);
    document.getElementById('load-ductbank-btn').addEventListener('click',loadDuctbanks);
    document.getElementById('delete-ductbank-btn').addEventListener('click',()=>{ductbanks=[];renderDuctbanks();saveDuctbanks();});
    document.getElementById('export-ductbank-xlsx-btn').addEventListener('click',exportDuctbankXlsx);
    document.getElementById('import-ductbank-xlsx-btn').addEventListener('click',()=>document.getElementById('import-ductbank-xlsx-input').click());
    document.getElementById('import-ductbank-xlsx-input').addEventListener('change',e=>{importDuctbankXlsx(e.target.files[0]);e.target.value='';});
    initHeader();
    initRowContextMenus();
    document.getElementById('clear-ductbank-filters-btn').addEventListener('click',clearFilters);
    const addCableBtn=document.getElementById('addCableBtn');
    if(addCableBtn){
      cableTbody=document.querySelector('#cableTable tbody');
      addCableBtn.addEventListener('click',addCable);
      renderCableTable();
    }
    loadDuctbanks();
    const params=new URLSearchParams(window.location.search);
    const tag=params.get('db');
    if(tag){
      const db=ductbanks.find(d=>d.tag===tag);
      if(db){
        db.expanded=true;
        renderDuctbanks();
        const sel = CSS && typeof CSS.escape==='function'?CSS.escape(tag):tag;
        const row=document.querySelector(`#ductbankTable tbody tr[data-tag="${sel}"]`);
        if(row) row.scrollIntoView({block:'center'});
      }
    }
  }

  function getDuctbanks(){
    ductbanks.forEach(db=>db.conduits.forEach(c=>{if(c.ductbankTag===undefined) c.ductbankTag=db.tag;}));
    return ductbanks;
  }

  // Optional cable table management
  let cableRows=[];
  let cableTbody;
  let cableSummary;

  function renderCableTable(){
    if(!cableTbody){
      cableTbody=document.querySelector('#cableTable tbody');
      if(!cableTbody) return;
    }
    cableTbody.innerHTML='';
    cableRows.forEach((cb,i)=>{
      const tr=cableTbody.insertRow();
      let cell=tr.insertCell();
      const tagInput=document.createElement('input');
      tagInput.value=cb.tag||'';
      tagInput.addEventListener('input',e=>{cb.tag=e.target.value;});
      cell.appendChild(tagInput);

      cell=tr.insertCell();
      const sel=document.createElement('select');
      const empty=document.createElement('option');
      empty.value='';
      empty.textContent='-- select --';
      sel.appendChild(empty);
      cableSizes.forEach(cs=>{
        const o=document.createElement('option');
        const label=cs.label||cs.type;
        o.value=label;
        o.textContent=label;
        o.dataset.od=cs.OD||cs.od;
        o.dataset.weight=cs.weight;
        sel.appendChild(o);
      });
      sel.value=cb.size||'';
      cell.appendChild(sel);

      cell=tr.insertCell();
      const odInput=document.createElement('input');
      odInput.type='number';
      odInput.step='0.01';
      odInput.readOnly=true;
      odInput.style.width='80px';
      odInput.value=cb.od||'';
      cell.appendChild(odInput);

      cell=tr.insertCell();
      const wtInput=document.createElement('input');
      wtInput.type='number';
      wtInput.step='0.01';
      wtInput.readOnly=true;
      wtInput.style.width='80px';
      wtInput.value=cb.weight||'';
      cell.appendChild(wtInput);

      cell=tr.insertCell();
      appendActionButtons(cell,iconBtn('Delete','removeBtn','Delete Cable',()=>{cableRows.splice(i,1);renderCableTable();}));

      sel.addEventListener('change',e=>{
        const opt=e.target.selectedOptions[0];
        cb.size=e.target.value;
        cb.od=opt.dataset.od||'';
        cb.weight=opt.dataset.weight||'';
        odInput.value=cb.od;
        wtInput.value=cb.weight;
        updateCableTotals();
      });
    });
    updateCableTotals();
  }

  function updateCableTotals(){
    const specs=globalThis.CONDUIT_SPECS||{};
    const cableArea=cableRows.reduce((sum,cb)=>{
      const od=parseFloat(cb.od);
      return isNaN(od)?sum:sum+Math.PI*Math.pow(od/2,2);
    },0);
    const conduitArea=ductbanks.reduce((tot,db)=>tot+db.conduits.reduce((s,c)=>{
      const a=specs[c.type]&&specs[c.type][c.trade_size];
      return s+(a||0);
    },0),0);
    const fill=conduitArea?cableArea/conduitArea*100:0;
    if(!cableSummary){
      cableSummary=document.createElement('p');
      cableSummary.id='cableFillInfo';
      const table=document.getElementById('cableTable');
      if(table&&table.parentElement) table.parentElement.appendChild(cableSummary);
    }
    if(cableSummary){
      cableSummary.textContent=`Total Cable Area: ${cableArea.toFixed(2)} in², Fill: ${fill.toFixed(1)}%`;
      cableSummary.style.color=fill>40?'red':'';
    }
  }

  function addCable(){
    cableRows.push({tag:'',size:'',od:'',weight:''});
    renderCableTable();
  }

  window.initDuctbankTable=initDuctbankTable;
  window.saveDuctbanks=saveDuctbanks;
  window.loadDuctbanks=loadDuctbanks;
  window.getDuctbanks=getDuctbanks;
  window.addDuctbankRow=addDuctbank;
  window.applyDuctbankBatchEdit=applyDuctbankBatchEdit;
})();

