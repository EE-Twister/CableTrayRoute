const STORAGE_KEYS = {
  cableSchedule: 'cableSchedule',
  ductbankSchedule: 'ductbankSchedule',
  traySchedule: 'traySchedule',
  conduitSchedule: 'conduitSchedule',
  collapsedGroups: 'collapsedGroups'
};

class TableManager {
  constructor(opts) {
    this.table = document.getElementById(opts.tableId);
    this.thead = this.table.createTHead();
    this.tbody = this.table.tBodies[0] || this.table.createTBody();
    this.columns = opts.columns || [];
    this.storageKey = opts.storageKey || opts.tableId;
    this.onChange = opts.onChange || null;
    this.onSave = opts.onSave || null;
    this.rowCountEl = opts.rowCountId ? document.getElementById(opts.rowCountId) : null;
    this.buildHeader();
    this.initButtons(opts);
    this.load();
    this.hiddenGroups = new Set();
    this.loadGroupState();
    this.updateRowCount();
  }

  initButtons(opts){
    if (opts.addRowBtnId) document.getElementById(opts.addRowBtnId).addEventListener('click', () => { this.addRow(); if (this.onChange) this.onChange(); });
    if (opts.saveBtnId) document.getElementById(opts.saveBtnId).addEventListener('click', () => { this.save(); if (this.onSave) this.onSave(); });
    if (opts.loadBtnId) document.getElementById(opts.loadBtnId).addEventListener('click', () => { this.tbody.innerHTML=''; this.load(); if (this.onSave) this.onSave(); });
    if (opts.clearFiltersBtnId) document.getElementById(opts.clearFiltersBtnId).addEventListener('click', () => this.clearFilters());
    if (opts.exportBtnId) document.getElementById(opts.exportBtnId).addEventListener('click', () => { this.exportXlsx(); if (this.onSave) this.onSave(); });
    if (opts.importBtnId && opts.importInputId){
      document.getElementById(opts.importBtnId).addEventListener('click', () => document.getElementById(opts.importInputId).click());
      document.getElementById(opts.importInputId).addEventListener('change', e => { this.importXlsx(e.target.files[0]); e.target.value=''; if (this.onChange) this.onChange(); });
    }
    if (opts.deleteAllBtnId) document.getElementById(opts.deleteAllBtnId).addEventListener('click', () => { this.deleteAll(); if (this.onChange) this.onChange(); });
  }

  buildHeader() {
    this.thead.innerHTML='';
    const hasGroups = this.columns.some(c=>c.group);
    let groupRow;
    if (hasGroups) {
      groupRow = this.thead.insertRow();
      this.groupRow = groupRow;
    }
    const headerRow = this.thead.insertRow();
    this.headerRow = headerRow;
    this.filters = Array(this.columns.length).fill('');
    this.filterButtons = [];
    this.groupCols = {};
    this.groupThs = {};
    this.groupToggles = {};
    this.groupFirstIndex = {};
    this.groupLastIndex = {};
    this.groupOrder = [];
    
    if (hasGroups){
      const groups = [];
      let current = null;
      let colIndex = 0;
      this.columns.forEach(col => {
        if (col.group){
          if (!current || current.name !== col.group){
            current = {name:col.group, span:1};
            groups.push(current);
            if (!this.groupCols[col.group]){
              this.groupCols[col.group] = [];
              this.groupFirstIndex[col.group] = colIndex;
              this.groupOrder.push(col.group);
            }
          } else {
            current.span++;
          }
          this.groupCols[col.group].push(colIndex);
          this.groupLastIndex[col.group] = colIndex;
        } else {
          groups.push({name:'', span:1});
          current = null;
        }
        colIndex++;
      });
      groups.forEach(g => {
        const th = document.createElement('th');
        th.colSpan = g.span;
        th.classList.add('group-header');
        if (g.name){
          const label = document.createElement('span');
          label.textContent = g.name;
          th.appendChild(label);
          const toggle = document.createElement('button');
          toggle.className = 'group-toggle';
          toggle.textContent = '-';
          toggle.addEventListener('click', e => { e.stopPropagation(); this.toggleGroup(g.name); });
          th.appendChild(toggle);
          this.groupThs[g.name] = th;
          this.groupToggles[g.name] = toggle;
          if (this.groupOrder.indexOf(g.name) > 0) th.classList.add('category-separator');
          th.classList.add('category-separator-right');
        }
        groupRow.appendChild(th);
      });
    }

    this.columns.forEach((col,idx) => {
      const th = document.createElement('th');
      th.style.position = 'relative';
      const labelSpan=document.createElement('span');
      labelSpan.textContent=col.label;
      th.appendChild(labelSpan);
      const btn=document.createElement('button');
      btn.className='filter-btn';
      btn.innerHTML='\u25BC';
      btn.addEventListener('click',e=>{e.stopPropagation();this.showFilterPopup(btn,idx);});
      th.appendChild(btn);
      const resizer=document.createElement('span');
      resizer.className='col-resizer';
      th.appendChild(resizer);
      let startX,startWidth;
      const onMove=e=>{
        const newWidth=Math.max(30,startWidth+e.pageX-startX);
        th.style.width=newWidth+'px';
        Array.from(this.tbody.rows).forEach(r=>{if(r.cells[idx]) r.cells[idx].style.width=newWidth+'px';});
      };
      resizer.addEventListener('mousedown',e=>{
        startX=e.pageX;startWidth=th.offsetWidth;
        document.addEventListener('mousemove',onMove);
        document.addEventListener('mouseup',()=>{
          document.removeEventListener('mousemove',onMove);
        },{once:true});
      });
      if (col.group && idx === this.groupFirstIndex[col.group] && this.groupOrder.indexOf(col.group) > 0) {
        th.classList.add('category-separator');
      }
      if (col.group && idx === this.groupLastIndex[col.group]) {
        th.classList.add('category-separator-right');
      }
      headerRow.appendChild(th);
      this.filterButtons.push(btn);
    });

    if (hasGroups){
      const blank = document.createElement('th');
      blank.rowSpan = 1;
      blank.style.position='relative';
      groupRow.appendChild(blank);
    }
    const actTh = document.createElement('th');
    actTh.textContent = 'Actions';
    actTh.style.position='relative';
    const res=document.createElement('span');
    res.className='col-resizer';
    actTh.appendChild(res);
    let startX,startWidth;
    const move=e=>{
      const newWidth=Math.max(30,startWidth+e.pageX-startX);
      actTh.style.width=newWidth+'px';
      Array.from(this.tbody.rows).forEach(r=>{if(r.cells[this.columns.length]) r.cells[this.columns.length].style.width=newWidth+'px';});
    };
    res.addEventListener('mousedown',e=>{startX=e.pageX;startWidth=actTh.offsetWidth;document.addEventListener('mousemove',move);document.addEventListener('mouseup',()=>{document.removeEventListener('mousemove',move);},{once:true});});
    headerRow.appendChild(actTh);
  }

  setGroupVisibility(name, hide) {
    const indices = this.groupCols[name] || [];
    indices.forEach(i => {
      if (this.headerRow && this.headerRow.cells[i]) this.headerRow.cells[i].classList.toggle('group-hidden', hide);
      Array.from(this.tbody.rows).forEach(row => {
        if (row.cells[i]) row.cells[i].classList.toggle('group-hidden', hide);
      });
    });
    if (this.groupThs[name]) this.groupThs[name].classList.toggle('group-collapsed', hide);
    if (this.groupToggles[name]) this.groupToggles[name].textContent = hide ? '+' : '-';
    if (hide) this.hiddenGroups.add(name); else this.hiddenGroups.delete(name);
  }

  toggleGroup(name) {
    const hide = !this.hiddenGroups.has(name);
    this.setGroupVisibility(name, hide);
    this.saveGroupState();
  }

  saveGroupState() {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(STORAGE_KEYS.collapsedGroups) || '{}'); } catch(e) {}
    all[this.storageKey] = Array.from(this.hiddenGroups);
    try { localStorage.setItem(STORAGE_KEYS.collapsedGroups, JSON.stringify(all)); } catch(e) {}
  }

  loadGroupState() {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(STORAGE_KEYS.collapsedGroups) || '{}'); } catch(e) {}
    const hidden = all[this.storageKey] || [];
    hidden.forEach(g => this.setGroupVisibility(g, true));
  }

  updateRowCount() {
    if (this.rowCountEl) {
      this.rowCountEl.textContent = `Rows: ${this.tbody.querySelectorAll('tr').length}`;
    }
  }

  showFilterPopup(btn, index){
    document.querySelectorAll('.filter-popup').forEach(p=>p.remove());
    const popup=document.createElement('div');
    popup.className='filter-popup';
    const inp=document.createElement('input');
    inp.type='text';
    inp.value=this.filters[index];
    popup.appendChild(inp);
    const apply=document.createElement('button');
    apply.textContent='Apply';
    apply.addEventListener('click',()=>{
      this.filters[index]=inp.value.trim();
      if(this.filters[index]) btn.classList.add('filtered'); else btn.classList.remove('filtered');
      this.applyFilters();
      popup.remove();
    });
    popup.appendChild(apply);
    const clear=document.createElement('button');
    clear.textContent='Clear';
    clear.addEventListener('click',()=>{
      inp.value='';
      this.filters[index]='';
      btn.classList.remove('filtered');
      this.applyFilters();
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

  showRacewayModal(selectEl, originBtn){
    const modal=document.createElement('div');
    modal.className='modal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-hidden','false');
    const content=document.createElement('div');
    content.className='modal-content';
    modal.appendChild(content);

    const dual=document.createElement('div');
    dual.className='dual-listbox';
    content.appendChild(dual);

    const buildSection=title=>{
      const wrap=document.createElement('div');
      wrap.className='list-container';
      const hdr=document.createElement('h3');
      hdr.textContent=title;
      wrap.appendChild(hdr);
      const search=document.createElement('input');
      search.type='text';
      search.placeholder='Search';
      wrap.appendChild(search);
      const list=document.createElement('select');
      list.multiple=true;
      list.setAttribute('role','listbox');
      list.setAttribute('aria-multiselectable','true');
      wrap.appendChild(list);
      return {wrap,search,list};
    };

    const avail=buildSection('Available Raceways');
    const chosen=buildSection('Selected Raceways');

    const opts=Array.from(selectEl.options).map(o=>({value:o.value,text:o.text,selected:o.selected}));
    opts.forEach(o=>{
      const opt=document.createElement('option');
      opt.value=o.value;opt.textContent=o.text;
      (o.selected?chosen.list:avail.list).appendChild(opt);
    });

    dual.appendChild(avail.wrap);

    const btnCol=document.createElement('div');
    btnCol.className='button-column';
    const mkBtn=txt=>{
      const b=document.createElement('button');
      b.type='button';
      b.textContent=txt;
      b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click();}});
      return b;
    };
    const allR=mkBtn('>>');
    const someR=mkBtn('>');
    const someL=mkBtn('<');
    const allL=mkBtn('<<');
    [allR,someR,someL,allL].forEach(b=>btnCol.appendChild(b));
    dual.appendChild(btnCol);
    dual.appendChild(chosen.wrap);

    const moveSelected=(from,to)=>{Array.from(from.selectedOptions).forEach(o=>to.appendChild(o));};
    const moveAll=(from,to)=>{Array.from(from.options).forEach(o=>to.appendChild(o));};
    allR.addEventListener('click',()=>moveAll(avail.list,chosen.list));
    someR.addEventListener('click',()=>moveSelected(avail.list,chosen.list));
    someL.addEventListener('click',()=>moveSelected(chosen.list,avail.list));
    allL.addEventListener('click',()=>moveAll(chosen.list,avail.list));

    const filter=(list,term)=>{
      const t=term.toLowerCase();
      Array.from(list.options).forEach(o=>o.style.display=o.text.toLowerCase().includes(t)?'':'none');
    };
    avail.search.addEventListener('input',()=>filter(avail.list,avail.search.value));
    chosen.search.addEventListener('input',()=>filter(chosen.list,chosen.search.value));

    const actions=document.createElement('div');
    actions.style.marginTop='1rem';
    actions.style.textAlign='right';
    const saveBtn=document.createElement('button');
    saveBtn.type='button';
    saveBtn.textContent='Save';
    const cancelBtn=document.createElement('button');
    cancelBtn.type='button';
    cancelBtn.textContent='Cancel';
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    content.appendChild(actions);

    const close=()=>{
      modal.remove();
      document.removeEventListener('keydown',handleKey);
      if(originBtn) originBtn.focus();
    };
    cancelBtn.addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});

    saveBtn.addEventListener('click',()=>{
      const values=Array.from(chosen.list.options).map(o=>o.value);
      Array.from(selectEl.options).forEach(o=>o.selected=values.includes(o.value));
      selectEl.dispatchEvent(new Event('change',{bubbles:true}));
      close();
    });

    const handleKey=e=>{if(e.key==='Escape'){e.preventDefault();close();}else trapFocus(e,content);};
    document.addEventListener('keydown',handleKey);

    document.body.appendChild(modal);
    modal.style.display='flex';
    avail.search.focus();
  }

  addRow(data = {}) {
    const tr = this.tbody.insertRow();
    this.columns.forEach((col, idx) => {
      const td = tr.insertCell();
      if (col.group && idx === this.groupFirstIndex[col.group] && this.groupOrder.indexOf(col.group) > 0) {
        td.classList.add('category-separator');
      }
      if (col.group && idx === this.groupLastIndex[col.group]) {
        td.classList.add('category-separator-right');
      }
      let el;
      if (col.type === 'select') {
        const opts = typeof col.options === 'function' ? col.options(tr, data) : (col.options || []);
        if (col.multiple) {
          el = document.createElement('select');
          el.multiple = true;
          if (col.size) el.size = col.size;
          opts.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            el.appendChild(o);
          });
          el.style.display = 'none';
          el.getSelectedValues = () => Array.from(el.selectedOptions).map(o => o.value);
          el.setSelectedValues = vals => {
            Array.from(el.options).forEach(o => { o.selected = (vals || []).includes(o.value); });
          };
        } else {
          el = document.createElement('select');
          opts.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            el.appendChild(o);
          });
        }
      } else {
        el = document.createElement('input');
        el.type = col.type || 'text';
      }
      el.name = col.key;
      const val = data[col.key] !== undefined ? data[col.key] : col.default;
      if (val !== undefined) {
        if (col.multiple) {
          const vals = Array.isArray(val) ? val : [val];
          if (el.setSelectedValues) {
            el.setSelectedValues(vals);
          } else if (el.options) {
            Array.from(el.options).forEach(o => { o.selected = vals.includes(o.value); });
          }
        } else {
          el.value = val;
        }
      } else if (el.tagName === 'SELECT' && el.options.length && !col.multiple) {
        el.value = el.options[0].value;
      }
      if (this.headerRow && this.headerRow.cells[idx] && this.headerRow.cells[idx].style.width) {
        td.style.width = this.headerRow.cells[idx].style.width;
      }
      td.appendChild(el);
      let summaryEl, updateSummary;
      if (col.multiple) {
        summaryEl = document.createElement('button');
        summaryEl.type = 'button';
        summaryEl.className = 'raceway-summary';
        summaryEl.addEventListener('click', e => {
          e.stopPropagation();
          this.showRacewayModal(el, summaryEl);
        });
        summaryEl.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.showRacewayModal(el, summaryEl);
          }
        });
        td.addEventListener('click', () => {
          this.showRacewayModal(el, summaryEl);
        });
        td.appendChild(summaryEl);
        updateSummary = () => {
          const vals = el.getSelectedValues ? el.getSelectedValues() : [];
          if (vals.length) {
            summaryEl.textContent = vals.join(', ');
            summaryEl.classList.remove('placeholder');
          } else {
            summaryEl.textContent = 'Select Raceways';
            summaryEl.classList.add('placeholder');
          }
        };
        el.addEventListener('change', () => {
          updateSummary();
          if (this.onChange) this.onChange();
        });
        updateSummary();
      } else {
        el.addEventListener('input', () => { if (this.onChange) this.onChange(); });
      }
      el.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          let allSelected = true;
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const start = e.target.selectionStart ?? 0;
            const end = e.target.selectionEnd ?? 0;
            const len = (e.target.value || '').length;
            allSelected = start === 0 && end === len;
          }
          if (allSelected) {
            e.preventDefault();
            const sib = e.key === 'ArrowLeft' ? td.previousElementSibling : td.nextElementSibling;
            if (sib) {
              const next = sib.querySelector('input,select,textarea');
              if (next) {
                next.focus();
                if (typeof next.select === 'function') next.select();
              }
            }
          }
        }
      });
      if (col.onChange) el.addEventListener('change', () => { col.onChange(el, tr); });
      if (col.validate) {
        const rules = Array.isArray(col.validate) ? col.validate : [col.validate];
        el.addEventListener(col.multiple ? 'change' : 'input', () => applyValidation(el, rules));
        applyValidation(el, rules);
      }
    });
    const actTd = tr.insertCell();
    if (this.headerRow && this.headerRow.cells[this.columns.length] && this.headerRow.cells[this.columns.length].style.width) {
      actTd.style.width = this.headerRow.cells[this.columns.length].style.width;
    }
    const addBtn=document.createElement('button');
    addBtn.textContent='\u2795';
    addBtn.className='insertBelowBtn';
    addBtn.title='Add row';
    addBtn.setAttribute('aria-label','Add row');
    addBtn.addEventListener('click',()=>{const newRow=this.addRow();if(newRow) this.tbody.insertBefore(newRow,tr.nextSibling);if(this.onChange) this.onChange();});
    actTd.appendChild(addBtn);

    const dupBtn = document.createElement('button');
    dupBtn.textContent = '\u29C9';
    dupBtn.className='duplicateBtn';
    dupBtn.title='Duplicate row';
    dupBtn.setAttribute('aria-label','Duplicate row');
    dupBtn.addEventListener('click', () => {
      const row = {};
      this.columns.forEach((col,i) => {
        const el = tr.cells[i].firstChild;
        if (!el) return;
        if (col.multiple) {
          if (typeof el.getSelectedValues === 'function') {
            row[col.key] = el.getSelectedValues();
          } else {
            row[col.key] = Array.from(el.selectedOptions || []).map(o=>o.value);
          }
        } else {
          row[col.key] = el.value;
        }
      });
      const newRow = this.addRow(row);
      if (newRow) this.tbody.insertBefore(newRow, tr.nextSibling);
      if (this.onChange) this.onChange();
    });
    actTd.appendChild(dupBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = '\u2716';
    delBtn.className='removeBtn';
    delBtn.title='Delete row';
    delBtn.setAttribute('aria-label','Delete row');
    delBtn.addEventListener('click', () => { tr.remove(); this.save(); this.updateRowCount(); if (this.onChange) this.onChange(); });
    actTd.appendChild(delBtn);

    Object.keys(this.groupCols || {}).forEach(g => {
      if (this.hiddenGroups && this.hiddenGroups.has(g)) {
        (this.groupCols[g] || []).forEach(i => {
          if (tr.cells[i]) tr.cells[i].classList.add('group-hidden');
        });
      }
    });
    this.updateRowCount();
    return tr;
  }

  getData() {
    const rows = [];
    Array.from(this.tbody.rows).forEach(tr => {
      const row = {};
      this.columns.forEach((col,i) => {
        const el = tr.cells[i].firstChild;
        if (el) {
          const val = el.value;
          if (col.multiple) {
            if (typeof el.getSelectedValues === 'function') {
              row[col.key] = el.getSelectedValues();
            } else {
              row[col.key] = Array.from(el.selectedOptions || []).map(o => o.value);
            }
          } else if (col.type === 'number') {
            const num = parseFloat(val);
            if (val === '') {
              row[col.key] = '';
            } else {
              row[col.key] = isNaN(num) ? null : num;
            }
          } else {
            row[col.key] = val;
          }
        } else {
          row[col.key] = '';
        }
      });
      rows.push(row);
    });
    return rows;
  }

  save() {
    this.validateAll();
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.getData()));
    } catch(e) { console.error('save failed', e); }
  }

  load() {
    let data = [];
    try { data = JSON.parse(localStorage.getItem(this.storageKey) || '[]'); } catch(e) {}
    data.forEach(row => this.addRow(row));
    this.updateRowCount();
  }

  clearFilters() {
    this.filters=this.filters.map(()=> '');
    this.filterButtons.forEach(btn=>btn.classList.remove('filtered'));
    this.applyFilters();
  }

  applyFilters() {
    Array.from(this.tbody.rows).forEach(row => {
      let visible = true;
      this.filters.forEach((val,i) => {
        const v = val.toLowerCase();
        if (v && !String(row.cells[i].firstChild.value).toLowerCase().includes(v)) visible = false;
      });
      row.style.display = visible ? '' : 'none';
    });
  }

  deleteAll() {
    this.tbody.innerHTML='';
    this.save();
    this.updateRowCount();
    if (this.onChange) this.onChange();
  }

  exportXlsx() {
    const data = [this.columns.map(c=>c.label)];
    this.getData().forEach(row => {
      data.push(this.columns.map(c => row[c.key] || ''));
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${this.storageKey}.xlsx`);
  }

  importXlsx(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const wb = XLSX.read(e.target.result, {type:'binary'});
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, {defval:''});
      this.tbody.innerHTML='';
      json.forEach(obj => {
        const row = {};
        this.columns.forEach(col => row[col.key] = obj[col.label] || '');
        this.addRow(row);
      });
      this.applyFilters();
      this.save();
      if (this.onChange) this.onChange();
    };
    reader.readAsBinaryString(file);
  }

  validateAll() {
    let valid = true;
    Array.from(this.tbody.rows).forEach(row => {
      this.columns.forEach((col,i) => {
        const el = row.cells[i].firstChild;
        if (col.validate && !applyValidation(el, Array.isArray(col.validate) ? col.validate : [col.validate])) valid = false;
      });
    });
    return valid;
  }
}

function saveToStorage(key, data){
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e){}
}
function loadFromStorage(key){
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e){ return []; }
}

function createTable(opts){ return new TableManager(opts); }

function applyValidation(el, rules = []) {
  const value = (el.value || '').trim();
  let error = '';
  rules.forEach(rule => {
    if (error) return;
    if (typeof rule === 'function') {
      const msg = rule(value);
      if (msg) error = msg;
    } else if (rule === 'required') {
      if (!value) error = 'Required';
    } else if (rule === 'numeric') {
      if (value === '' || isNaN(Number(value))) error = 'Must be numeric';
    }
  });
  const existing = el.nextElementSibling;
  if (error) {
    el.classList.add('input-error');
    let msg = existing && existing.classList && existing.classList.contains('error-message') ? existing : null;
    if (!msg) {
      msg = document.createElement('span');
      msg.className = 'error-message';
      el.insertAdjacentElement('afterend', msg);
    }
    msg.textContent = error;
    return false;
  } else {
    el.classList.remove('input-error');
    if (existing && existing.classList && existing.classList.contains('error-message')) existing.remove();
    return true;
  }
}

window.TableUtils = { createTable, saveToStorage, loadFromStorage, applyValidation, STORAGE_KEYS };
