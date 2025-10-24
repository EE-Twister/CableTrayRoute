import { getItem, setItem, STORAGE_KEYS } from './dataStore.mjs';

class ContextMenu {
  constructor(items = []) {
    this.items = [];
    this.itemElements = [];
    this.target = null;
    this.focusReturnEl = null;
    this.menu = document.createElement('ul');
    this.menu.className = 'context-menu';
    this.menu.setAttribute('role', 'menu');
    this.menu.tabIndex = -1;
    this.handleDocumentMouseDown = e => {
      if (e.button !== 0) return;
      if (!this.menu.contains(e.target)) this.hide();
    };
    this.handleDocumentKeyDown = e => {
      if (e.key === 'Escape') this.hide();
    };
    document.addEventListener('mousedown', this.handleDocumentMouseDown);
    document.addEventListener('keydown', this.handleDocumentKeyDown);
    document.body.appendChild(this.menu);
    this.setItems(items);
  }

  setItems(items) {
    this.items = Array.isArray(items) ? items.slice() : [];
    this.menu.innerHTML = '';
    this.itemElements = [];
    this.items.forEach(item => {
      const { label } = item;
      const li = document.createElement('li');
      li.textContent = label;
      li.setAttribute('role', 'menuitem');
      li.tabIndex = -1;
      li.addEventListener('click', () => {
        if (li.getAttribute('aria-disabled') === 'true') return;
        const target = this.target;
        this.hide();
        item.action(target);
      });
      li.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          li.click();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const dir = e.key === 'ArrowDown' ? 1 : -1;
          const total = this.itemElements.length;
          if (!total) return;
          let idx = this.itemElements.findIndex(entry => entry.element === li);
          let next = idx;
          do {
            next = (next + dir + total) % total;
          } while (
            next !== idx &&
            this.itemElements[next].element.getAttribute('aria-disabled') === 'true'
          );
          const nextEl = this.itemElements[next]?.element;
          if (
            nextEl &&
            nextEl.getAttribute('aria-disabled') !== 'true'
          ) {
            nextEl.focus();
          }
        }
      });
      this.menu.appendChild(li);
      this.itemElements.push({ element: li, item });
    });
  }

  updateItemStates(target) {
    this.itemElements.forEach(({ element, item }) => {
      const disabled = typeof item.isDisabled === 'function' ? item.isDisabled(target) : false;
      element.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      element.classList.toggle('is-disabled', disabled);
    });
  }

  show(x, y, target) {
    this.target = target;
    this.focusReturnEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.updateItemStates(target);
    this.menu.style.display = 'block';
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    requestAnimationFrame(() => {
      const rect = this.menu.getBoundingClientRect();
      const pageLeft = window.pageXOffset;
      const pageTop = window.pageYOffset;
      const maxLeft = pageLeft + window.innerWidth - rect.width - 8;
      const maxTop = pageTop + window.innerHeight - rect.height - 8;
      let left = x;
      let top = y;
      if (left > maxLeft) left = Math.max(pageLeft + 8, maxLeft);
      if (top > maxTop) top = Math.max(pageTop + 8, maxTop);
      if (left < pageLeft + 8) left = pageLeft + 8;
      if (top < pageTop + 8) top = pageTop + 8;
      this.menu.style.left = `${left}px`;
      this.menu.style.top = `${top}px`;
      const firstEnabled = this.itemElements.find(entry => entry.element.getAttribute('aria-disabled') !== 'true');
      if (firstEnabled) firstEnabled.element.focus();
    });
  }

  hide() {
    if (this.menu.style.display === 'none') return;
    this.menu.style.display = 'none';
    this.target = null;
    if (this.focusReturnEl && typeof this.focusReturnEl.focus === 'function') {
      this.focusReturnEl.focus();
    }
    this.focusReturnEl = null;
  }
}

class TableManager {
  constructor(opts) {
    this.table = document.getElementById(opts.tableId);
    this.thead = this.table.createTHead();
    this.tbody = this.table.tBodies[0] || this.table.createTBody();
    this.columnsKey = opts.columnsKey || null;
    this.columns = opts.columns || [];
    if (this.columnsKey) {
      try {
        const savedCols = getItem(this.columnsKey, null);
        if (Array.isArray(savedCols) && savedCols.length) {
          this.columns = savedCols;
        } else {
          setItem(this.columnsKey, this.columns);
        }
      } catch(e) {}
    }
    this.storageKey = opts.storageKey || opts.tableId;
    this.onChange = opts.onChange || null;
    this.onSave = opts.onSave || null;
    this.onView = opts.onView || null;
    this.rowCountEl = opts.rowCountId ? document.getElementById(opts.rowCountId) : null;
    this.selectable = opts.selectable || false;
    this.colOffset = this.selectable ? 1 : 0;
    this.enableContextMenu = opts.enableContextMenu || false;
    this.showActionColumn = opts.showActionColumn !== false;
    this.customFilters = new Map();
    this.handleHeaderDragStart = this.handleHeaderDragStart.bind(this);
    this.handleHeaderDragOver = this.handleHeaderDragOver.bind(this);
    this.handleHeaderDrop = this.handleHeaderDrop.bind(this);
    this.buildHeader();
    this.initButtons(opts);
    this.load();
    if (this.enableContextMenu) this.initContextMenu();
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
    if (opts.deleteSelectedBtnId) document.getElementById(opts.deleteSelectedBtnId).addEventListener('click', () => { this.deleteSelected(); if (this.onChange) this.onChange(); });
  }

  buildHeader() {
    this.thead.innerHTML='';
    const hasGroups = this.columns.some(c=>c.group);
    const showActions = this.showActionColumn;
    let groupRow;
    if (hasGroups) {
      groupRow = this.thead.insertRow();
      if (this.selectable) {
        groupRow.appendChild(document.createElement('th'));
      }
      this.groupRow = groupRow;
    }
    const headerRow = this.thead.insertRow();
    this.headerRow = headerRow;
    this.filters = Array(this.columns.length).fill('');
    this.filterButtons = [];
    this.globalFilter = '';
    this.globalFilterCols = [];
    this.groupCols = {};
    this.groupThs = {};
    this.groupToggles = {};
    this.groupFirstIndex = {};
    this.groupLastIndex = {};
    this.groupOrder = [];
    const offset = this.colOffset;

    if (this.selectable) {
      const selTh = document.createElement('th');
      const selAll = document.createElement('input');
      selAll.type = 'checkbox';
      selAll.id = `${this.table.id}-select-all`;
      selAll.className = 'select-all';
      selAll.setAttribute('aria-label','Select all rows');
      selAll.addEventListener('change', () => {
        Array.from(this.tbody.rows).forEach(tr => {
          if (tr.style.display === 'none') return;
          const cb = tr.querySelector('.row-select');
          if (cb) cb.checked = selAll.checked;
        });
      });
      selTh.appendChild(selAll);
      headerRow.appendChild(selTh);
      this.selectAll = selAll;
    }
    
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
          toggle.setAttribute('aria-label','Toggle group');
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
      th.draggable = true;
      th.dataset.index = idx;
      const labelSpan=document.createElement('span');
      labelSpan.textContent=col.label;
      th.appendChild(labelSpan);
      const btn=document.createElement('button');
      btn.className='filter-btn';
      btn.innerHTML='\u25BC';
      btn.setAttribute('aria-label','Filter column');
      btn.addEventListener('click',e=>{e.stopPropagation();this.showFilterPopup(btn,idx);});
      th.appendChild(btn);
      const resizer=document.createElement('span');
      resizer.className='col-resizer';
      th.appendChild(resizer);
      let startX,startWidth;
      const onMove=e=>{
        const newWidth=Math.max(30,startWidth+e.pageX-startX);
        th.style.width=newWidth+'px';
        Array.from(this.tbody.rows).forEach(r=>{if(r.cells[idx+offset]) r.cells[idx+offset].style.width=newWidth+'px';});
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

    this.groupBlankTh = null;
    if (hasGroups && showActions){
      const blank = document.createElement('th');
      blank.rowSpan = 1;
      blank.style.position='relative';
      groupRow.appendChild(blank);
      this.groupBlankTh = blank;
    }
    if (showActions) {
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
        const idx = this.columns.length + offset;
        Array.from(this.tbody.rows).forEach(r=>{if(r.cells[idx]) r.cells[idx].style.width=newWidth+'px';});
        if(this.groupBlankTh) this.groupBlankTh.style.width=newWidth+'px';
      };
      res.addEventListener('mousedown',e=>{startX=e.pageX;startWidth=actTh.offsetWidth;document.addEventListener('mousemove',move);document.addEventListener('mouseup',()=>{document.removeEventListener('mousemove',move);},{once:true});});
      headerRow.appendChild(actTh);
    }
    headerRow.addEventListener('dragstart', this.handleHeaderDragStart);
    headerRow.addEventListener('dragover', this.handleHeaderDragOver);
    headerRow.addEventListener('drop', this.handleHeaderDrop);
    this.syncGroupBlankWidth();
  }

  setGroupVisibility(name, hide) {
    const offset = this.colOffset;
    const indices = this.groupCols[name] || [];
    indices.forEach(i => {
      if (this.headerRow && this.headerRow.cells[i + offset]) this.headerRow.cells[i + offset].classList.toggle('group-hidden', hide);
      Array.from(this.tbody.rows).forEach(row => {
        if (row.cells[i + offset]) row.cells[i + offset].classList.toggle('group-hidden', hide);
      });
    });
    if (this.groupThs[name]) {
      this.groupThs[name].classList.toggle('group-collapsed', hide);
      this.groupThs[name].colSpan = hide ? 1 : indices.length;
    }
    if (this.groupToggles[name]) this.groupToggles[name].textContent = hide ? '+' : '-';
    if (hide) this.hiddenGroups.add(name); else this.hiddenGroups.delete(name);
    this.syncGroupBlankWidth();
  }

  toggleGroup(name) {
    const hide = !this.hiddenGroups.has(name);
    this.setGroupVisibility(name, hide);
    this.saveGroupState();
  }

  saveGroupState() {
    let all = {};
    try { all = getItem(STORAGE_KEYS.collapsedGroups, {}); } catch(e) {}
    all[this.storageKey] = Array.from(this.hiddenGroups);
    try { setItem(STORAGE_KEYS.collapsedGroups, all); } catch(e) {}
  }

  loadGroupState() {
    let all = {};
    try { all = getItem(STORAGE_KEYS.collapsedGroups, {}); } catch(e) {}
    const hidden = all[this.storageKey] || [];
    hidden.forEach(g => this.setGroupVisibility(g, true));
  }

  syncGroupBlankWidth(){
    if(!this.showActionColumn) return;
    const idx = this.columns.length + this.colOffset;
    if(this.groupBlankTh && this.headerRow && this.headerRow.cells[idx]){
      const w=this.headerRow.cells[idx].offsetWidth;
      this.groupBlankTh.style.width=w+'px';
    }
  }

  updateRowCount() {
    if (this.rowCountEl) {
      this.rowCountEl.textContent = `Rows: ${this.tbody.querySelectorAll('tr').length}`;
    }
    this.updateSelectAllState();
  }

  persistColumns() {
    if (this.columnsKey) {
      try { setItem(this.columnsKey, this.columns); } catch(e) {}
    }
  }

  handleHeaderDragStart(e) {
    const th = e.target.closest('th');
    if (!th || th.dataset.index === undefined) return;
    e.dataTransfer.setData('text/plain', th.dataset.index);
  }

  handleHeaderDragOver(e) {
    if (e.target.closest('th')) e.preventDefault();
  }

  handleHeaderDrop(e) {
    const th = e.target.closest('th');
    if (!th || th.dataset.index === undefined) return;
    e.preventDefault();
    const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const to = parseInt(th.dataset.index, 10);
    if (isNaN(from) || isNaN(to) || from === to) return;
    const col = this.columns.splice(from, 1)[0];
    this.columns.splice(to, 0, col);
    this.persistColumns();
    const data = this.getData();
    this.buildHeader();
    this.tbody.innerHTML = '';
    data.forEach(row => this.addRow(row));
    this.save();
  }

  addColumn(col) {
    const data = this.getData();
    this.columns.push(col);
    this.persistColumns();
    this.buildHeader();
    this.tbody.innerHTML = '';
    data.forEach(row => this.addRow(row));
    this.save();
    this.updateRowCount();
    if (this.onChange) this.onChange();
  }

  removeColumn(key) {
    const idx = this.columns.findIndex(c => c.key === key);
    if (idx === -1) return;
    const data = this.getData();
    data.forEach(r => { delete r[key]; });
    this.columns.splice(idx, 1);
    this.persistColumns();
    this.buildHeader();
    this.tbody.innerHTML = '';
    data.forEach(row => this.addRow(row));
    this.save();
    this.updateRowCount();
    if (this.onChange) this.onChange();
  }

  showFilterPopup(btn, index){
    document.querySelectorAll('.filter-popup').forEach(p=>p.remove());
    const popup=document.createElement('div');
    popup.className='filter-popup';
    const col=this.columns[index];
    const offset=this.colOffset;
    let control;
    if(col.filter==='dropdown'){
      control=document.createElement('select');
      const allOpt=document.createElement('option');
      allOpt.value='';
      allOpt.textContent='All';
      control.appendChild(allOpt);
      const values=[...new Set(Array.from(this.tbody.rows).map(r=>{
        const cell=r.cells[index+offset];
        return cell?cell.firstChild.value:'';
      }).filter(v=>v))].sort();
      values.forEach(v=>{
        const opt=document.createElement('option');
        opt.value=v;
        opt.textContent=v;
        control.appendChild(opt);
      });
      control.value=this.filters[index];
    }else{
      control=document.createElement('input');
      control.type='text';
      control.value=this.filters[index];
    }
    popup.appendChild(control);
    let debounceTimer;
    const applyFilter=()=>{
      this.filters[index]=control.value.trim();
      if(this.filters[index]) btn.classList.add('filtered'); else btn.classList.remove('filtered');
      this.applyFilters();
    };
    if(col.filter==='dropdown'){
      control.addEventListener('change',applyFilter);
    }else{
      control.addEventListener('input',()=>{
        clearTimeout(debounceTimer);
        debounceTimer=setTimeout(applyFilter,300);
      });
    }
    const apply=document.createElement('button');
    apply.textContent='Apply';
    apply.setAttribute('aria-label','Apply filter');
    apply.addEventListener('click',()=>{
      clearTimeout(debounceTimer);
      applyFilter();
      popup.remove();
    });
    popup.appendChild(apply);
    const clear=document.createElement('button');
    clear.textContent='Clear';
    clear.setAttribute('aria-label','Clear filter');
    clear.addEventListener('click',()=>{
      control.value='';
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
    const mkBtn=(txt,label)=>{
      const b=document.createElement('button');
      b.type='button';
      b.textContent=txt;
      if(label) b.setAttribute('aria-label',label);
      b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click();}});
      return b;
    };
    const allR=mkBtn('>>','Move all to selected');
    const someR=mkBtn('>','Move selected to selected');
    const someL=mkBtn('<','Move selected to available');
    const allL=mkBtn('<<','Move all to available');
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
    saveBtn.setAttribute('aria-label','Save selection');
    const cancelBtn=document.createElement('button');
    cancelBtn.type='button';
    cancelBtn.textContent='Cancel';
    cancelBtn.setAttribute('aria-label','Cancel selection');
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
    if (data.ref !== undefined) tr.dataset.ref = data.ref;
    if (data.id !== undefined) tr.dataset.id = data.id;
    if (this.selectable) {
      const selTd = tr.insertCell();
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'row-select';
      chk.addEventListener('change', () => {
        if (!chk.checked && this.selectAll) this.selectAll.checked = false;
        this.updateSelectAllState();
      });
      selTd.appendChild(chk);
    }
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
        if (el.type === 'number') {
          el.step = col.step || 'any';
        }
        if (col.maxlength) el.maxLength = col.maxlength;
        if (col.className) el.className = col.className;
        if (col.datalist) {
          const listId = `${col.key}-datalist`;
          el.setAttribute('list', listId);
          let dl = document.getElementById(listId);
          if (!dl) {
            dl = document.createElement('datalist');
            dl.id = listId;
            document.body.appendChild(dl);
          }
          const opts = typeof col.datalist === 'function' ? col.datalist(tr, data) : col.datalist;
          dl.innerHTML = '';
          (opts || []).forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            dl.appendChild(o);
          });
        }
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
      if (this.headerRow && this.headerRow.cells[idx + this.colOffset] && this.headerRow.cells[idx + this.colOffset].style.width) {
        td.style.width = this.headerRow.cells[idx + this.colOffset].style.width;
      }
      td.appendChild(el);
      let summaryEl, updateSummary;
      if (col.multiple) {
        summaryEl = document.createElement('button');
        summaryEl.type = 'button';
        summaryEl.className = 'raceway-summary';
        summaryEl.setAttribute('aria-label','View selected raceways');
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
      el.addEventListener('focus',()=>{el.dataset.prevValue=el.value;});
      el.addEventListener('keydown', e => {
        const cellIdx = idx + this.colOffset;
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
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          let targetRow = tr;
          const dir = e.key === 'ArrowUp' ? 'previousElementSibling' : 'nextElementSibling';
          do{targetRow = targetRow[dir];}while(targetRow && targetRow.style.display==='none');
          if(targetRow && targetRow.cells[cellIdx]){
            const next = targetRow.cells[cellIdx].querySelector('input,select,textarea');
            if(next){next.focus(); if(typeof next.select==='function') next.select();}
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          let nextRow = tr.nextElementSibling;
          if (!nextRow) {
            nextRow = this.addRow();
            if (this.onChange) this.onChange();
          }
          if (nextRow && nextRow.cells[cellIdx]) {
            const next = nextRow.cells[cellIdx].querySelector('input,select,textarea');
            if (next) {
              next.focus();
              if (typeof next.select === 'function') next.select();
            }
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if(el.dataset.prevValue!==undefined){
            el.value = el.dataset.prevValue;
            if (this.onChange) this.onChange();
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
    if (this.showActionColumn) {
      const actTd = tr.insertCell();
      const actIdx = this.columns.length + this.colOffset;
      if (this.headerRow && this.headerRow.cells[actIdx] && this.headerRow.cells[actIdx].style.width) {
        actTd.style.width = this.headerRow.cells[actIdx].style.width;
      }
      if(this.onView){
        const viewBtn=document.createElement('button');
        viewBtn.textContent='👁';
        viewBtn.className='viewBtn';
        viewBtn.title='View row';
        viewBtn.setAttribute('aria-label','View row');
        viewBtn.addEventListener('click',()=>{
          const row=this.getRowData(tr);
          this.onView(row,tr);
        });
        actTd.appendChild(viewBtn);
      }
      const addBtn=document.createElement('button');
      addBtn.textContent='+';
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
        const row = this.getRowData(tr);
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
    }

    Object.keys(this.groupCols || {}).forEach(g => {
      if (this.hiddenGroups && this.hiddenGroups.has(g)) {
        (this.groupCols[g] || []).forEach(i => {
          if (tr.cells[i + this.colOffset]) tr.cells[i + this.colOffset].classList.add('group-hidden');
        });
      }
    });
    if (data.typical_id !== undefined) {
      tr.dataset.typicalId = data.typical_id || '';
    } else {
      delete tr.dataset.typicalId;
    }
    this.updateRowCount();
    this.updateSelectAllState();
    return tr;
  }

  getRowData(tr) {
    const row = {};
    const offset = this.colOffset;
    this.columns.forEach((col,i) => {
      const el = tr.cells[i + offset] ? tr.cells[i + offset].firstChild : null;
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
    row.typical_id = tr.dataset.typicalId || '';
    return row;
  }

  getData() {
    const rows = [];
    const offset = this.colOffset;
    Array.from(this.tbody.rows).forEach(tr => {
      const row = {};
      this.columns.forEach((col,i) => {
        const el = tr.cells[i + offset].firstChild;
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
      row.typical_id = tr.dataset.typicalId || '';
      rows.push(row);
      if (tr.dataset.ref !== undefined) row.ref = tr.dataset.ref;
      if (tr.dataset.id !== undefined && row.id === undefined) row.id = tr.dataset.id;
    });
    return rows;
  }

  save() {
    this.validateAll();
    try {
      setItem(this.storageKey, this.getData());
    } catch(e) { console.error('save failed', e); }
  }

  load() {
    let data = [];
    try { data = getItem(this.storageKey, []); } catch(e) {}
    data.forEach(row => this.addRow(row));
    this.updateRowCount();
  }

  clearFilters() {
    this.filters=this.filters.map(()=> '');
    this.filterButtons.forEach(btn=>btn.classList.remove('filtered'));
    this.customFilters.clear();
    this.applyFilters();
  }

  applyFilters() {
    const offset = this.colOffset;
    Array.from(this.tbody.rows).forEach(row => {
      let visible = true;
      this.filters.forEach((val,i) => {
        const v = val.toLowerCase();
        if (v && !String(row.cells[i + offset].firstChild.value).toLowerCase().includes(v)) visible = false;
      });
      if (visible && this.globalFilter) {
        const term = this.globalFilter.toLowerCase();
        const cols = this.globalFilterCols.length ? this.globalFilterCols : this.columns.map(c=>c.key);
        const match = cols.some(key => {
          const idx = this.columns.findIndex(c=>c.key === key);
          if (idx === -1) return false;
          const cell = row.cells[idx + offset];
          if (!cell) return false;
          return String(cell.firstChild.value || '').toLowerCase().includes(term);
        });
        if (!match) visible = false;
      }
      if (visible && this.customFilters.size) {
        for (const filterFn of this.customFilters.values()) {
          if (typeof filterFn !== 'function') continue;
          if (!filterFn(row)) { visible = false; break; }
        }
      }
      row.style.display = visible ? '' : 'none';
    });
    this.updateSelectAllState();
  }

  deleteAll() {
    this.tbody.innerHTML='';
    if (this.selectAll) this.selectAll.checked = false;
    this.save();
    this.updateRowCount();
    if (this.onChange) this.onChange();
  }

  deleteSelected() {
    this.getSelectedRows(true).forEach(tr => tr.remove());
    if (this.selectAll) this.selectAll.checked = false;
    this.save();
    this.updateRowCount();
    this.updateSelectAllState();
    if (this.onChange) this.onChange();
  }

  initContextMenu() {
    const menu = new ContextMenu();
    let clipboard = null;
    const items = [];
    if (typeof this.onView === 'function') {
      items.push({
        label: 'View / Edit Row',
        action: tr => {
          if (!tr) return;
          const row = this.getRowData(tr);
          this.onView(row, tr);
        }
      });
    }
    items.push(
      { label: 'Insert Row Above', action: tr => { if (!tr) return; const newRow = this.addRow(); this.tbody.insertBefore(newRow, tr); if (this.onChange) this.onChange(); } },
      { label: 'Insert Row Below', action: tr => { if (!tr) return; const newRow = this.addRow(); this.tbody.insertBefore(newRow, tr.nextSibling); if (this.onChange) this.onChange(); } },
      { label: 'Duplicate Row', action: tr => { if (!tr) return; const data = this.getRowData(tr); const newRow = this.addRow(data); this.tbody.insertBefore(newRow, tr.nextSibling); if (this.onChange) this.onChange(); } },
      { label: 'Copy Row', action: tr => { if (!tr) return; clipboard = this.getRowData(tr); } },
      {
        label: 'Paste Row',
        action: tr => {
          if (!tr || !clipboard) return;
          const newRow = this.addRow(clipboard);
          this.tbody.insertBefore(newRow, tr.nextSibling);
          if (this.onChange) this.onChange();
        },
        isDisabled: () => !clipboard
      },
      { label: 'Delete Row', action: tr => { if (!tr) return; tr.remove(); this.save(); this.updateRowCount(); if (this.onChange) this.onChange(); } }
    );
    menu.setItems(items);

    this.table.addEventListener('contextmenu', e => {
      const row = e.target.closest('tbody tr');
      if (row) {
        e.preventDefault();
        menu.show(e.pageX, e.pageY, row);
      } else if (e.target.closest(`#${this.table.id}`)) {
        e.preventDefault();
      }
    });

    this.table.addEventListener('keydown', e => {
      if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) return;
      const row = e.target.closest('tbody tr');
      if (!row) return;
      e.preventDefault();
      const rect = e.target.getBoundingClientRect();
      const x = rect.left + rect.width / 2 + window.pageXOffset;
      const y = rect.bottom + window.pageYOffset;
      menu.show(x, y, row);
    });

    document.addEventListener('keydown', e => {
      const tag = document.activeElement.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      const row = document.activeElement.closest(`#${this.table.id} tbody tr`);
      if (!row) return;
      if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        clipboard = this.getRowData(row);
        e.preventDefault();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        if (!clipboard) return;
        const newRow = this.addRow(clipboard);
        this.tbody.insertBefore(newRow, row.nextSibling);
        if (this.onChange) this.onChange();
        e.preventDefault();
      }
    });
  }

  getSelectedRows(includeHidden = false) {
    if (!this.selectable) return [];
    return Array.from(this.tbody.rows).filter(tr => {
      const cb = tr.querySelector('.row-select');
      if (!cb || !cb.checked) return false;
      if (!includeHidden && tr.style.display === 'none') return false;
      return true;
    });
  }

  getSelectedRowData(includeHidden = false) {
    return this.getSelectedRows(includeHidden).map(tr => this.getRowData(tr));
  }

  clearSelection() {
    if (!this.selectable) return;
    Array.from(this.tbody.querySelectorAll('.row-select')).forEach(cb => { cb.checked = false; });
    if (this.selectAll) this.selectAll.checked = false;
  }

  updateSelectAllState() {
    if (!this.selectAll) return;
    const rows = Array.from(this.tbody.rows).filter(tr => tr.style.display !== 'none');
    if (!rows.length) {
      this.selectAll.checked = false;
      return;
    }
    const allChecked = rows.every(tr => {
      const cb = tr.querySelector('.row-select');
      return cb && cb.checked;
    });
    this.selectAll.checked = allChecked;
  }

  setCustomFilter(name, fn) {
    if (!name) return;
    if (typeof fn === 'function') {
      this.customFilters.set(name, fn);
    } else {
      this.customFilters.delete(name);
    }
    this.applyFilters();
  }

  clearCustomFilters() {
    this.customFilters.clear();
    this.applyFilters();
  }

  applyValuesToRow(tr, values = {}, options = {}) {
    if (!tr) return;
    const skipUndefined = options.skipUndefined || false;
    const offset = this.colOffset;
    this.columns.forEach((col, idx) => {
      if (!(col.key in values) && skipUndefined) return;
      const rawValue = values[col.key];
      const cell = tr.cells[idx + offset];
      if (!cell) return;
      const el = cell.firstChild;
      if (!el) return;
      if (col.multiple) {
        if (!(col.key in values)) return;
        const vals = Array.isArray(rawValue) ? rawValue : (rawValue ? [rawValue] : []);
        if (typeof el.setSelectedValues === 'function') {
          el.setSelectedValues(vals);
        } else if (el.options) {
          Array.from(el.options).forEach(opt => {
            opt.selected = vals.includes(opt.value);
          });
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const value = rawValue ?? '';
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    if ('typical_id' in values) {
      tr.dataset.typicalId = values.typical_id || '';
    }
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
    const offset = this.colOffset;
    Array.from(this.tbody.rows).forEach(row => {
      this.columns.forEach((col,i) => {
        const el = row.cells[i + offset].firstChild;
        if (col.validate && !applyValidation(el, Array.isArray(col.validate) ? col.validate : [col.validate])) valid = false;
      });
    });
    return valid;
  }
}

function saveToStorage(key, data){
  try { setItem(key, data); } catch(e){}
}
function loadFromStorage(key){
  try { return getItem(key, []); } catch(e){ return []; }
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
      if (value !== '' && Number.isNaN(Number(value))) error = 'Must be numeric';
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

window.TableUtils = {
  createTable,
  saveToStorage,
  loadFromStorage,
  applyValidation,
  showRacewayModal: TableManager.prototype.showRacewayModal,
  STORAGE_KEYS
};

export {
  createTable,
  saveToStorage,
  loadFromStorage,
  applyValidation,
  STORAGE_KEYS
};
