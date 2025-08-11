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
    const filterRow = this.thead.insertRow();
    this.filters = [];

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

    this.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      headerRow.appendChild(th);
      const fth = document.createElement('th');
      const input = document.createElement('input');
      input.type = 'text';
      input.addEventListener('input', () => this.applyFilters());
      this.filters.push(input);
      fth.appendChild(input);
      filterRow.appendChild(fth);
    });

    if (hasGroups){
      const blank = document.createElement('th');
      blank.rowSpan = 1;
      groupRow.appendChild(blank);
    }
    const actTh = document.createElement('th');
    actTh.textContent = 'Actions';
    headerRow.appendChild(actTh);
    filterRow.appendChild(document.createElement('th'));
  }

  addRow(data = {}) {
    const tr = this.tbody.insertRow();
    this.columns.forEach(col => {
      const td = tr.insertCell();
      let el;
      if (col.type === 'select') {
        el = document.createElement('select');
        (col.options || []).forEach(opt => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          el.appendChild(o);
        });
      } else {
        el = document.createElement('input');
        el.type = col.type || 'text';
      }
      if (data[col.key] !== undefined) el.value = data[col.key];
      td.appendChild(el);
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
        row[col.key] = el ? el.value : '';
      });
      rows.push(row);
    });
    return rows;
  }

  save() {
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
    this.filters.forEach(f => f.value='');
    this.applyFilters();
  }

  applyFilters() {
    Array.from(this.tbody.rows).forEach(row => {
      let visible = true;
      this.filters.forEach((f,i) => {
        const val = f.value.toLowerCase();
        if (val && !String(row.cells[i].firstChild.value).toLowerCase().includes(val)) visible = false;
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
}

function saveToStorage(key, data){
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e){}
}
function loadFromStorage(key){
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e){ return []; }
}

function createTable(opts){ return new TableManager(opts); }

window.TableUtils = { createTable, saveToStorage, loadFromStorage };
