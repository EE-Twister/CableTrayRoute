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
    this.buildHeader();
    this.initButtons(opts);
    this.load();
    this.hiddenGroups = new Set();
    this.loadGroupState();
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

    if (hasGroups){
      const groups = [];
      let current = null;
      let colIndex = 0;
      this.columns.forEach(col => {
        if (col.group){
          if (!current || current.name !== col.group){
            current = {name:col.group, span:1};
            groups.push(current);
          } else {
            current.span++;
          }
          if (!this.groupCols[col.group]) this.groupCols[col.group] = [];
          this.groupCols[col.group].push(colIndex);
        } else {
          groups.push({name:'', span:1});
          current = null;
        }
        colIndex++;
      });
      groups.forEach(g => {
        const th = document.createElement('th');
        th.colSpan = g.span;
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
        }
        groupRow.appendChild(th);
      });
    }

    this.columns.forEach((col,idx) => {
      const th = document.createElement('th');
      const labelSpan=document.createElement('span');
      labelSpan.textContent=col.label;
      th.appendChild(labelSpan);
      const btn=document.createElement('button');
      btn.className='filter-btn';
      btn.innerHTML='\u25BC';
      btn.addEventListener('click',e=>{e.stopPropagation();this.showFilterPopup(btn,idx);});
      th.appendChild(btn);
      headerRow.appendChild(th);
      this.filterButtons.push(btn);
    });

    if (hasGroups){
      const blank = document.createElement('th');
      blank.rowSpan = 1;
      groupRow.appendChild(blank);
    }
    const actTh = document.createElement('th');
    actTh.textContent = 'Actions';
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

  showListboxPopup(el, td){
    document.querySelectorAll('.listbox-popup').forEach(p=>{
      const sel = p.querySelector('select');
      const parent = p._parentCell;
      if(sel && parent){
        parent.appendChild(sel);
        sel.style.display = 'none';
      }
      p.remove();
    });
    const popup = document.createElement('div');
    popup.className = 'listbox-popup';
    popup._parentCell = td;
    popup.appendChild(el);
    const rect = td.getBoundingClientRect();
    popup.style.top = (rect.bottom + window.scrollY) + 'px';
    popup.style.left = (rect.left + window.scrollX) + 'px';
    document.body.appendChild(popup);
    el.style.display = 'block';
    el.focus();
    const close = e => {
      if(!popup.contains(e.target)){
        td.appendChild(el);
        el.style.display = 'none';
        popup.remove();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(()=>document.addEventListener('click', close),0);
  }

  addRow(data = {}) {
    const tr = this.tbody.insertRow();
    this.columns.forEach(col => {
      const td = tr.insertCell();
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
      td.appendChild(el);
      let summaryEl, updateSummary;
      if (col.multiple) {
        summaryEl = document.createElement('span');
        summaryEl.className = 'raceway-summary';
        summaryEl.tabIndex = 0;
        summaryEl.addEventListener('click', e => {
          e.stopPropagation();
          this.showListboxPopup(el, td);
        });
        summaryEl.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.showListboxPopup(el, td);
          }
        });
        td.addEventListener('click', () => {
          this.showListboxPopup(el, td);
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
      if (col.onChange) el.addEventListener('change', () => { col.onChange(el, tr); });
      if (col.validate) {
        const rules = Array.isArray(col.validate) ? col.validate : [col.validate];
        el.addEventListener(col.multiple ? 'change' : 'input', () => applyValidation(el, rules));
        applyValidation(el, rules);
      }
    });
    const actTd = tr.insertCell();
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => { tr.remove(); this.save(); if (this.onChange) this.onChange(); });
    actTd.appendChild(delBtn);

    Object.keys(this.groupCols || {}).forEach(g => {
      if (this.hiddenGroups && this.hiddenGroups.has(g)) {
        (this.groupCols[g] || []).forEach(i => {
          if (tr.cells[i]) tr.cells[i].classList.add('group-hidden');
        });
      }
    });
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
