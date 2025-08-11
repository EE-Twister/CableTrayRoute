const STORAGE_KEYS = {
  cableSchedule: 'cableSchedule',
  ductbankSchedule: 'ductbankSchedule',
  traySchedule: 'traySchedule',
  conduitSchedule: 'conduitSchedule'
};

class TableManager {
  constructor(opts) {
    this.table = document.getElementById(opts.tableId);
    this.thead = this.table.createTHead();
    this.tbody = this.table.tBodies[0] || this.table.createTBody();
    this.columns = opts.columns || [];
    this.storageKey = opts.storageKey || opts.tableId;
    this.buildHeader();
    this.initButtons(opts);
    this.load();
  }

  initButtons(opts){
    if (opts.addRowBtnId) document.getElementById(opts.addRowBtnId).addEventListener('click', () => this.addRow());
    if (opts.saveBtnId) document.getElementById(opts.saveBtnId).addEventListener('click', () => this.save());
    if (opts.loadBtnId) document.getElementById(opts.loadBtnId).addEventListener('click', () => { this.tbody.innerHTML=''; this.load(); });
    if (opts.clearFiltersBtnId) document.getElementById(opts.clearFiltersBtnId).addEventListener('click', () => this.clearFilters());
    if (opts.exportBtnId) document.getElementById(opts.exportBtnId).addEventListener('click', () => this.exportXlsx());
    if (opts.importBtnId && opts.importInputId){
      document.getElementById(opts.importBtnId).addEventListener('click', () => document.getElementById(opts.importInputId).click());
      document.getElementById(opts.importInputId).addEventListener('change', e => { this.importXlsx(e.target.files[0]); e.target.value=''; });
    }
    if (opts.deleteAllBtnId) document.getElementById(opts.deleteAllBtnId).addEventListener('click', () => this.deleteAll());
  }

  buildHeader() {
    this.thead.innerHTML='';
    const hasGroups = this.columns.some(c=>c.group);
    let groupRow;
    if (hasGroups) groupRow = this.thead.insertRow();
    const headerRow = this.thead.insertRow();
    this.filters = Array(this.columns.length).fill('');
    this.filterButtons = [];

    if (hasGroups){
      const groups = [];
      let current = null;
      this.columns.forEach(col => {
        if (col.group){
          if (!current || current.name !== col.group){
            current = {name:col.group, span:1};
            groups.push(current);
          } else {
            current.span++;
          }
        } else {
          groups.push({name:'', span:1});
          current = null;
        }
      });
      groups.forEach(g => {
        const th = document.createElement('th');
        th.textContent = g.name;
        th.colSpan = g.span;
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

  addRow(data = {}) {
    const tr = this.tbody.insertRow();
    this.columns.forEach(col => {
      const td = tr.insertCell();
      let el;
      if (col.type === 'select') {
        el = document.createElement('select');
        const opts = typeof col.options === 'function' ? col.options(tr, data) : (col.options || []);
        opts.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          el.appendChild(o);
        });
      } else {
        el = document.createElement('input');
        el.type = col.type || 'text';
      }
      el.name = col.key;
      const val = data[col.key] !== undefined ? data[col.key] : col.default;
      if (val !== undefined) {
        el.value = val;
      } else if (el.tagName === 'SELECT' && el.options.length) {
        el.value = el.options[0].value;
      }
      td.appendChild(el);
      if (col.onChange) el.addEventListener('change', () => col.onChange(el, tr));
      if (col.validate) {
        const rules = Array.isArray(col.validate) ? col.validate : [col.validate];
        el.addEventListener('input', () => applyValidation(el, rules));
        applyValidation(el, rules);
      }
    });
    const actTd = tr.insertCell();
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => { tr.remove(); this.save(); });
    actTd.appendChild(delBtn);
  }

  getData() {
    const rows = [];
    Array.from(this.tbody.rows).forEach(tr => {
      const row = {};
      this.columns.forEach((col,i) => {
        const el = tr.cells[i].firstChild;
        if (el) {
          const val = el.value;
          if (col.type === 'number') {
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
