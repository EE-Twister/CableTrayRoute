import { getItem, setItem, removeItem, keys as storeKeys } from './dataStore.mjs';
import { FILTER_ICON_SVG } from './tableUtils.mjs';
import { showAlertModal, openModal } from './src/components/modal.js';
import { createFillGauge } from './src/components/fillGauge.js';
import { start as startTour, hasDoneTour } from './tour.js';

const TRAYFILL_TOUR_STEPS = [
  { selector: '#trayParameters',       message: 'Select the tray you want to analyze: choose width, depth, and tray type. These parameters are used to calculate the NEC-compliant fill percentage.' },
  { selector: '#addCableBtn',          message: 'Add cables to this tray. The tool will visualize how they pack into the cross-section.' },
  { selector: '#fill-gauge-container', message: 'The fill gauge shows the current fill percentage. NEC §392.22(A) limits tray fill to 40% for multi-conductor cables. Yellow = near limit, red = over limit.' },
  { selector: '#drawBtn',              message: 'Click Draw Tray to render the cross-section visualization with each cable shown to scale.' },
  { selector: '#exportExcelBtn',       message: 'Export the fill analysis to Excel for design documentation or submittal packages.' }
];

checkPrereqs([{key:'traySchedule',page:'racewayschedule.html',label:'Raceway Schedule'}]);

    document.addEventListener("DOMContentLoaded", async function() {
      initSettings();
      initDarkMode();
      initCompactMode();
      initHelpModal('help-btn','helpOverlay','helpClose');
      initNavToggle();
      const trayGauge = createFillGauge('fill-gauge-container', { label: 'Tray Fill %' });
      const dirty = createDirtyTracker();
      const markSaved = () => { dirty.markClean(); };
      const markUnsaved = () => { dirty.markDirty(); };
      // Load common cable sizes
      const cableOptions = await fetch('data/cableSizes.json').then(r=>r.json());

      // Populate the <datalist> (#sizeList) with conductor sizes in order
      const typeDatalist = document.getElementById("sizeList");
      const orderedSizes = [
        "#22 AWG", "#20 AWG", "#18 AWG", "#16 AWG", "#14 AWG", "#12 AWG",
        "#10 AWG", "#8 AWG", "#6 AWG", "#4 AWG", "#2 AWG", "#1 AWG",
        "1/0 AWG", "2/0 AWG", "3/0 AWG", "4/0 AWG", "250 kcmil",
        "350 kcmil", "500 kcmil", "750 kcmil", "1000 kcmil"
      ];
      orderedSizes.forEach(sz => {
        const option = document.createElement("option");
        option.value = sz;
        typeDatalist.appendChild(option);
      });

      // We’ll store last‐drawn data here (for “Expand Image”)
      let lastPlaced = null;   // array of { x, y, r, OD, tag, cableType, count, size, weight }
      let lastBarriers = [];   // x positions of separation barriers
      let lastTrayW   = 0;     // in inches
      let lastTrayD   = 0;     // in inches
      let lastType    = “”;    // “ladder” or “solid”
      let lastScale   = 20;    // px/in for small view
      let lastZones   = [];    // array of zone labels in order
      let lastColor   = ‘#66ccff’; // default cable color
      // Multi-compartment layout data for Expand Image
      let lastCompartmentLayouts = null; // array of per-compartment layout objects

      // Reference to <tbody> in the cable table
      const cableTbody = document.querySelector("#cableTable tbody");
      const cableTable = document.getElementById('cableTable');
      const headerCells = cableTable.querySelectorAll('thead th');
      const filters = [];
      const filterBtns = [];
      let cables = [];
      // compartments: up to 5 compartments, each with id, width (in), depth (in), label
      let compartments = [{ id: 1, width: 12, depth: 3, label: '' }];
      headerCells.forEach((th, idx) => {
        if (idx < headerCells.length - 2) {
          const btn = document.createElement('button');
          btn.className = 'filter-btn';
          btn.innerHTML = FILTER_ICON_SVG;
          btn.addEventListener('click', e => { e.stopPropagation(); showFilterPopup(btn, idx); });
          th.appendChild(btn);
          filters[idx] = '';
          filterBtns[idx] = btn;
        }
      });

      function showFilterPopup(btn, index){
        document.querySelectorAll('.filter-popup').forEach(p=>p.remove());
        const popup=document.createElement('div');
        popup.className='filter-popup';
        const inp=document.createElement('input');
        inp.type='text';
        inp.value=filters[index];
        popup.appendChild(inp);
        const apply=document.createElement('button');
        apply.textContent='Apply';
        apply.addEventListener('click',()=>{
          filters[index]=inp.value.trim().toLowerCase();
          if(filters[index]) btn.classList.add('filtered'); else btn.classList.remove('filtered');
          applyFilters();
          popup.remove();
        });
        popup.appendChild(apply);
        const clear=document.createElement('button');
        clear.textContent='Clear';
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
        Array.from(cableTbody.rows).forEach(row=>{
          let visible=true;
          filters.forEach((val,i)=>{
            if(!visible) return;
            const cell=row.cells[i];
            if(!cell) return;
            const input=cell.querySelector('input, select');
            const cellVal=input?String(input.value).toLowerCase():'';
            if(val && !cellVal.includes(val)) visible=false;
          });
          row.style.display=visible?'':'none';
        });
      }

      function clearFilters(){
        filters.forEach((_,i)=>{filters[i]=''; if(filterBtns[i]) filterBtns[i].classList.remove('filtered');});
        applyFilters();
      }

      const clearFiltersBtn=document.getElementById('clearCableFiltersBtn');
      if(clearFiltersBtn) clearFiltersBtn.addEventListener('click',clearFilters);

      // ── Compartment UI ────────────────────────────────────────────
      function renderCompartmentUI() {
        const container = document.getElementById('compartmentRows');
        if (!container) return;
        container.innerHTML = '';
        compartments.forEach((comp, i) => {
          const row = document.createElement('div');
          row.className = 'compartment-row';
          // Badge
          const badge = document.createElement('span');
          badge.className = 'comp-badge';
          badge.textContent = `Compartment ${comp.id}`;
          row.appendChild(badge);
          // Width input
          const wLabel = document.createElement('label');
          wLabel.textContent = ' Width (in): ';
          const wInp = document.createElement('input');
          wInp.type = 'number'; wInp.min = '0.5'; wInp.step = '0.5'; wInp.style.width = '60px';
          wInp.value = comp.width;
          wInp.addEventListener('input', e => {
            compartments[i].width = parseFloat(e.target.value) || comp.width;
            validateCompartmentWidths();
            updateTotals();
          });
          wLabel.appendChild(wInp);
          row.appendChild(wLabel);
          // Depth input
          const dLabel = document.createElement('label');
          dLabel.textContent = ' Depth (in): ';
          const dInp = document.createElement('input');
          dInp.type = 'number'; dInp.min = '0.5'; dInp.step = '0.5'; dInp.style.width = '60px';
          dInp.value = comp.depth;
          dInp.addEventListener('input', e => {
            compartments[i].depth = parseFloat(e.target.value) || comp.depth;
            updateTotals();
          });
          dLabel.appendChild(dInp);
          row.appendChild(dLabel);
          // Label input
          const lLabel = document.createElement('label');
          lLabel.textContent = ' Label: ';
          const lInp = document.createElement('input');
          lInp.type = 'text'; lInp.placeholder = 'e.g. Power'; lInp.style.width = '90px';
          lInp.value = comp.label || '';
          lInp.addEventListener('input', e => { compartments[i].label = e.target.value; });
          lLabel.appendChild(lInp);
          row.appendChild(lLabel);
          // Remove button
          const rmBtn = document.createElement('button');
          rmBtn.type = 'button'; rmBtn.textContent = '✖';
          rmBtn.className = 'comp-remove-btn';
          rmBtn.disabled = compartments.length === 1;
          rmBtn.addEventListener('click', () => {
            compartments.splice(i, 1);
            // Re-number ids to stay 1..N
            compartments.forEach((c, j) => { c.id = j + 1; });
            renderCompartmentUI();
            updateTotals();
          });
          row.appendChild(rmBtn);
          container.appendChild(row);
        });
        validateCompartmentWidths();
        // Sync addCompartmentBtn disabled state
        const addBtn = document.getElementById('addCompartmentBtn');
        if (addBtn) addBtn.disabled = compartments.length >= 5;
      }

      function validateCompartmentWidths() {
        const outerW = parseFloat(document.getElementById('trayWidth').value) || 0;
        const sumW = compartments.reduce((s, c) => s + (parseFloat(c.width) || 0), 0);
        const warn = document.getElementById('compartmentWidthWarning');
        if (!warn) return;
        if (outerW > 0 && Math.abs(sumW - outerW) > 0.01) {
          warn.textContent = `Note: compartment widths sum to ${sumW.toFixed(2)}" but tray outer width is ${outerW.toFixed(2)}".`;
          warn.hidden = false;
        } else {
          warn.hidden = true;
        }
      }

      document.getElementById('addCompartmentBtn').addEventListener('click', () => {
        if (compartments.length >= 5) {
          showAlertModal('Limit Reached', 'A maximum of 5 compartments is supported.');
          return;
        }
        const lastComp = compartments[compartments.length - 1];
        compartments.push({ id: compartments.length + 1, width: lastComp.width, depth: lastComp.depth, label: '' });
        renderCompartmentUI();
        updateTotals();
      });

      // Initialize compartment UI from trayWidth/trayDepth defaults
      (function initCompartments() {
        const w = parseFloat(document.getElementById('trayWidth').value) || 12;
        const d = parseFloat(document.getElementById('trayDepth').value) || 3;
        compartments[0].width = w;
        compartments[0].depth = d;
        renderCompartmentUI();
      })();

      // Keep single-compartment synced with trayWidth/trayDepth when only 1 compartment
      document.getElementById('trayWidth').addEventListener('change', () => {
        if (compartments.length === 1) {
          compartments[0].width = parseFloat(document.getElementById('trayWidth').value) || 12;
          renderCompartmentUI();
        } else {
          validateCompartmentWidths();
        }
        updateTotals();
      });
      document.getElementById('trayDepth').addEventListener('input', () => {
        if (compartments.length === 1) {
          compartments[0].depth = parseFloat(document.getElementById('trayDepth').value) || 3;
          renderCompartmentUI();
        }
        updateTotals();
      });

      let fillSummaryEl;
      function updateTotals() {
        const allow = document.getElementById('trayType').value === 'ladder' ? 50 : 40;
        let totalArea = 0;
        let worstFill = 0;
        compartments.forEach(comp => {
          const compArea = (parseFloat(comp.width) || 0) * (parseFloat(comp.depth) || 0);
          const compCables = cables.filter(c => (parseInt(c.zone) || 1) === comp.id);
          const cableArea = compCables.reduce((sum, c) => {
            const od = parseFloat(c.od || c.OD);
            const p = c.parallelCount || 1;
            return isNaN(od) ? sum : sum + Math.PI * Math.pow(od / 2, 2) * p;
          }, 0);
          totalArea += cableArea;
          const fillP = compArea ? cableArea / compArea * 100 : 0;
          if (fillP > worstFill) worstFill = fillP;
        });
        if (!fillSummaryEl) {
          fillSummaryEl = document.createElement('p');
          fillSummaryEl.id = 'trayFillInfo';
          cableTable.parentElement.appendChild(fillSummaryEl);
        }
        const compLabel = compartments.length > 1 ? ' (worst compartment)' : '';
        fillSummaryEl.textContent = `Total Cable Area: ${totalArea.toFixed(2)} in², Fill: ${worstFill.toFixed(1)}%${compLabel}`;
        fillSummaryEl.style.color = worstFill > allow ? 'red' : '';
        trayGauge.update(worstFill);
        return { totalArea, fillP: worstFill, allow };
      }

      // ─────────────────────────────────────────────────────────────
      // (B) Helper: create one cable‐entry <tr> (Tag / Cable Type / Configuration / OD / Weight / Remove)
      // ─────────────────────────────────────────────────────────────
      function createCableRow(data = {}, idx) {
        const tr = document.createElement("tr");
        // Store parallelCount as a dataset attribute so draw handler can read it
        if (data.parallelCount && data.parallelCount > 1) {
          tr.dataset.parallelCount = String(data.parallelCount);
        }

        // (1) Tag cell
        const tdTag = document.createElement("td");
        const inpTag = document.createElement("input");
        inpTag.type = "text";
        inpTag.placeholder = "e.g. P-20MP007-01";
        inpTag.required = true;
        inpTag.style.width = "120px";
        inpTag.value = data.tag || "";
        inpTag.addEventListener("input", e => { cables[idx].tag = e.target.value; });
        tdTag.appendChild(inpTag);
        tr.appendChild(tdTag);

        // (2) Cable Type cell (dropdown: Power, Control, Signal)
        const tdCableType = document.createElement("td");
        const selCableType = document.createElement("select");
        selCableType.style.width = "120px";
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "-- select --";
        selCableType.appendChild(emptyOpt);
        ["Power", "Control", "Signal"].forEach(optText => {
          const o = document.createElement("option");
          o.value = optText;
          o.textContent = optText;
          selCableType.appendChild(o);
        });
        selCableType.value = data.cableType || data.cable_type || "";
        selCableType.addEventListener("change", e => { cables[idx].cableType = e.target.value; });
        tdCableType.appendChild(selCableType);
        tr.appendChild(tdCableType);

        // (3) Number of Conductors
        const tdCount = document.createElement("td");
        const inpCount = document.createElement("input");
        inpCount.type = "number";
        inpCount.step = "1";
        inpCount.min = "1";
        inpCount.style.width = "60px";
        inpCount.value = data.count || data.conductors || "";
        inpCount.addEventListener("input", e => { cables[idx].count = e.target.value; tryAutofill(); });
        tdCount.appendChild(inpCount);
        tr.appendChild(tdCount);

        // (4) Conductor Size (with datalist)
        const tdSize = document.createElement("td");
        const inpSize = document.createElement("input");
        inpSize.type = "text";
        inpSize.setAttribute("list", "sizeList");
        inpSize.placeholder = "e.g. #1 AWG";
        inpSize.style.width = "100px";
        inpSize.value = data.size || data.conductor_size || "";
        inpSize.addEventListener("input", e => { cables[idx].size = e.target.value; tryAutofill(); });
        tdSize.appendChild(inpSize);
        tr.appendChild(tdSize);

        // (5) Cable Rating (V)
        const tdRating = document.createElement("td");
        const inpRating = document.createElement("input");
        inpRating.type = "number";
        inpRating.step = "1";
        inpRating.style.width = "80px";
        inpRating.value = data.rating || "";
        inpRating.addEventListener("input", e => { cables[idx].rating = e.target.value; });
        tdRating.appendChild(inpRating);
        tr.appendChild(tdRating);

        // (6) Operating Voltage (V)
        const tdVolt = document.createElement("td");
        const inpVolt = document.createElement("input");
        inpVolt.type = "number";
        inpVolt.step = "1";
        inpVolt.style.width = "80px";
        inpVolt.value = data.voltage || data.voltage_rating || "";
        inpVolt.addEventListener("input", e => { cables[idx].voltage = e.target.value; });
        tdVolt.appendChild(inpVolt);
        tr.appendChild(tdVolt);
        // (7) Cable size select and OD display
        const tdOD = document.createElement("td");
        const selOD = document.createElement("select");
        const optBlank = document.createElement("option");
        optBlank.value = "";
        optBlank.textContent = "-- select --";
        selOD.appendChild(optBlank);
        cableOptions.forEach(o => {
          const opt = document.createElement("option");
          opt.value = o.label;
          opt.textContent = o.label;
          opt.dataset.od = o.OD;
          opt.dataset.weight = o.weight;
          selOD.appendChild(opt);
        });
        const inpOD = document.createElement("input");
        inpOD.type = "number";
        inpOD.placeholder = "0.00";
        inpOD.step = "0.01";
        inpOD.style.width = "60px";
        inpOD.readOnly = true;
        inpOD.value = data.od || "";
        selOD.value = data.cable_size || "";
        tdOD.appendChild(selOD);
        tdOD.appendChild(inpOD);
        tr.appendChild(tdOD);
        // (8) Weight cell (number; auto‐filled or custom)
        const tdWt = document.createElement("td");
        const inpWt = document.createElement("input");
        inpWt.type = "number";
        inpWt.placeholder = "0.00";
        inpWt.step = "0.01";
        inpWt.style.width = "60px";
        inpWt.readOnly = true;
        inpWt.value = data.weight || "";
        tdWt.appendChild(inpWt);
        tr.appendChild(tdWt);
        if (!data.cable_size) {
          inpWt.readOnly = false;
          cables[idx].od = inpOD.value;
          cables[idx].weight = inpWt.value;
        }
        selOD.addEventListener("change", e => {
          const opt = e.target.selectedOptions[0];
          if (opt && opt.dataset.od) {
            inpOD.value = parseFloat(opt.dataset.od).toFixed(2);
            inpWt.value = parseFloat(opt.dataset.weight).toFixed(2);
            inpWt.readOnly = true;
            cables[idx].cable_size = e.target.value;
            cables[idx].od = inpOD.value;
            cables[idx].weight = inpWt.value;
          } else {
            inpOD.value = "";
            inpWt.value = "";
            inpWt.readOnly = false;
            cables[idx].cable_size = "";
            cables[idx].od = "";
            cables[idx].weight = "";
          }
          updateTotals();
        });
        inpWt.addEventListener("input", e => { cables[idx].weight = e.target.value; updateTotals(); });
        if (data.cable_size) selOD.dispatchEvent(new Event('change'));
        // (9) Cable Zone cell
        const tdZone = document.createElement("td");
        const inpZone = document.createElement("input");
        inpZone.type = "number";
        inpZone.step = "1";
        inpZone.min = "1";
        inpZone.style.width = "50px";
        inpZone.value = data.zone || data.cable_zone || 1;
        inpZone.addEventListener("input", e => { cables[idx].zone = e.target.value; });
        tdZone.appendChild(inpZone);
        tr.appendChild(tdZone);

        // (10) Circuit Group cell
        const tdGroup = document.createElement("td");
        const inpGroup = document.createElement("input");
        inpGroup.type = "number";
        inpGroup.step = "1";
        inpGroup.min = "1";
        inpGroup.style.width = "50px";
        inpGroup.value = data.circuitGroup || data.circuit_group || "";
        inpGroup.addEventListener("input", e => { cables[idx].circuitGroup = e.target.value; });
        tdGroup.appendChild(inpGroup);
        tr.appendChild(tdGroup);

        // (11) Duplicate button cell
        const tdDup = document.createElement("td");
        const btnDup = document.createElement("button");
        btnDup.type = "button";
        btnDup.textContent = "⧉";
        btnDup.className = "duplicateBtn";
        btnDup.addEventListener("click", () => {
          const clone = { ...cables[idx] };
          cables.splice(idx + 1, 0, clone);
          renderCableRows();
        });
        tdDup.appendChild(btnDup);
        tr.appendChild(tdDup);

        // (12) Remove button cell
        const tdRm = document.createElement("td");
        const btnRm = document.createElement("button");
        btnRm.type = "button";
        btnRm.textContent = "✖";
        btnRm.className = "removeBtn";
        btnRm.addEventListener("click", () => {
          cables.splice(idx, 1);
          renderCableRows();
        });
        tdRm.appendChild(btnRm);
        tr.appendChild(tdRm);

        // Auto-select cable if count & size match a default
        function tryAutofill() {
          const cnt = parseInt(inpCount.value);
          const sz  = inpSize.value.trim();
          const match = cableOptions.find(o => o.conductors === cnt && o.size === sz);
          if (match) {
            selOD.value = match.label;
            selOD.dispatchEvent(new Event('change'));
          } else {
            selOD.value = "";
            selOD.dispatchEvent(new Event('change'));
          }
        }
        inpCount.addEventListener("input", tryAutofill);
        inpSize.addEventListener("input", tryAutofill);

        return tr;
      }

      function renderCableRows(){
        cableTbody.innerHTML = "";
        cables.forEach((c,i)=>cableTbody.appendChild(createCableRow(c,i)));
        applyFilters();
        updateTotals();
      }

      // “Add Cable” button → append a blank row
      document.getElementById("addCableBtn").addEventListener("click", () => {
        cables.push({ tag:"", cableType:"", count:"", size:"", rating:"", voltage:"", od:"", weight:"", zone:1, circuitGroup:"" });
        renderCableRows();
      });
      // Start with one empty row
      cables.push({ tag:"", cableType:"", count:"", size:"", rating:"", voltage:"", od:"", weight:"", zone:1, circuitGroup:"" });
      renderCableRows();

      document.getElementById('trayType').addEventListener('change',updateTotals);

      // ─────────────────────────────────────────────────────────────
      // (C) NEC-2011 Sizing Helpers (Table 5 allowable area for small) :contentReference[oaicite:1]{index=1}
      // ─────────────────────────────────────────────────────────────
      const allowableAreaByWidth = {
        6:  7.0,
        9: 10.5,
        12:14.0,
        18:21.0,
        24:28.0,
        30:32.5,
        36:39.0
      };
      const standardWidths = [6, 9, 12, 18, 24, 30, 36];

      // NFPA 70 Table 392.22(A) “Column 2a” for Ladder (in²)
      const nfpaLadder = {
        6:  7.0,
        9: 10.5,
        12:14.0,
        18:21.0,
        24:28.0,
        30:32.5,
        36:39.0
      };
      // NFPA 70 Table 392.22(A) “Column 4a” for Solid Bottom (in²)
      const nfpaSolid = {
        6:  5.5,
        9:  8.0,
        12:11.0,
        18:16.5,
        24:22.0,
        30:27.5,
        36:33.0
      };

      function splitLargeSmall(cables) {
        const large = [], small = [];
        const rank1_0 = sizeRank('1/0 AWG');
        const rank4_0 = sizeRank('4/0 AWG');
        cables.forEach(c => {
          const r = sizeRank(c.size);
          if (
            c.isGroup ||
            c.OD >= 1.55 ||
            (c.count === 1 && r >= rank1_0 && r <= rank4_0)
          ) {
            large.push(c);
          } else {
            small.push(c);
          }
        });
        return { large, small };
      }
      function sumDiameters(arr) {
        return arr.reduce((sum, c) => sum + c.OD, 0);
      }
      function sumAreas(arr) {
        return arr.reduce((sum, c) => sum + Math.PI * (c.OD/2)**2 * (c.parallelCount || 1), 0);
      }
      function getAllowableArea(width, trayType) {
        const base = allowableAreaByWidth[width] || 0;
        return (trayType === "solid") ? base * 0.78 : base;
      }

      function sizeRank(sizeStr) {
        if (!sizeStr) return -Infinity;
        const s = sizeStr.trim().toUpperCase();
        if (s.endsWith('KCMIL')) return 2000 + parseFloat(s);
        const m = s.match(/(\d+)\/0\s*AWG/);
        if (m) return 1000 + parseInt(m[1]);
        const m2 = s.match(/#(\d+)\s*AWG/);
        if (m2) return -parseInt(m2[1]);
        return NaN;
      }

      function singleAllowPercent(rank, trayType) {
        if (rank >= sizeRank('4/0 AWG')) return 40;
        return (trayType === 'ladder') ? 50 : 40;
      }
      function computeNeededWidth(large, small, trayType) {
        let widthNeededLarge = 0;
        if (large.length > 0) {
          const sumD = sumDiameters(large);
          widthNeededLarge = (trayType === "solid") ? (sumD / 0.9) : sumD;
        }
        const areaNeededSmall = sumAreas(small);

        for (const W of standardWidths) {
          if (W < widthNeededLarge) continue;
          const allowA = getAllowableArea(W, trayType);
          if (small.length === 0 || areaNeededSmall <= allowA) {
            return W;
          }
        }
        return null;
      }

      // ─────────────────────────────────────────────────────────────
      // (D) Placement Helpers
      //   (1) placeLargeIgnoreBounds – bottom row for large (with optional spacing by larger OD)
      //   (2) placeSmallByPacking – true “tangent‐circle” packing
      // ─────────────────────────────────────────────────────────────

      // (1) Bottom‐row placement for large cables (y = r), ignoring tray width,
      //     but if spacingEnabled, add a gap based on each item’s spacingGap property.
      function placeLargeIgnoreBounds(largeCables, spacingEnabled) {
        // --- SORT largeCables BY DESCENDING OD (largest → smallest) ---
        const sortedLarge = largeCables.slice().sort((a, b) => b.OD - a.OD);

        const placed = [];
        sortedLarge.forEach((c, i) => {
          const r = c.OD / 2;
          let xCenter;
          if (i === 0) {
            // First large cable: center at r
            xCenter = r;
          } else {
            const prev = placed[i - 1];
            if (spacingEnabled) {
              const prevGap = prev.spacingGap || (2 * prev.r);
              const currGap = c.spacingGap || (2 * r);
              const gap = Math.max(prevGap, currGap);
              xCenter = prev.x + prev.r + gap + r;
            } else {
              // No extra spacing: edge‐to‐edge
              xCenter = prev.x + prev.r + r;
            }
          }
          const placedObj = Object.assign({}, c, {
            x: xCenter,
            y: r,
            r: r
          });
          placed.push(placedObj);
        });
        return placed;
      }

      // (2) True “tangent‐circle” packing for small cables
      function placeSmallByPacking(smallCables, trayW, barrierX, basePlaced) {
        // Copy basePlaced into new array
        const placed = basePlaced.map(p => ({
          x: p.x, y: p.y, r: p.r, OD: p.OD,
          tag: p.tag, cableType: p.cableType, count: p.count, size: p.size, weight: p.weight
        }));
        // Sort small descending by OD
        const sorted = smallCables.slice().sort((a, b) => b.OD - a.OD);
        const EPS = 1e-6;

        sorted.forEach(c => {
          const r = c.OD / 2;
          let best = { x: null, y: Infinity };
          const candidates = [];

          // A1) Floor‐only at x = barrierX + r, y = r
          candidates.push({ x: barrierX + r, y: r });

          // A2) Tangent to floor + each placed p → x = p.x ± (p.r + r), y = r
          placed.forEach(p => {
            const leftX  = p.x - (p.r + r);
            const rightX = p.x + (p.r + r);
            if (leftX >= barrierX + r - EPS && leftX <= trayW - r + EPS) {
              candidates.push({ x: leftX, y: r });
            }
            if (rightX >= barrierX + r - EPS && rightX <= trayW - r + EPS) {
              candidates.push({ x: rightX, y: r });
            }
          });

          // A3) Tangent to two placed circles p & q (circle‐circle intersection)
          for (let i = 0; i < placed.length; i++) {
            const p = placed[i];
            const R1 = p.r + r;
            for (let j = i + 1; j < placed.length; j++) {
              const q = placed[j];
              const R2 = q.r + r;
              const dx = q.x - p.x, dy = q.y - p.y;
              const d2 = dx*dx + dy*dy, d = Math.sqrt(d2);
              if (
                d < EPS ||
                d > (R1 + R2) - EPS ||
                d < Math.abs(R1 - R2) + EPS
              ) {
                continue;
              }
              const a = (R1*R1 - R2*R2 + d2) / (2 * d);
              const h2 = R1*R1 - a*a;
              if (h2 < -EPS) continue;
              const h = Math.sqrt(Math.max(0, h2));
              const xm = p.x + (a * dx / d);
              const ym = p.y + (a * dy / d);
              const rx = -dy * (h / d), ry = dx * (h / d);

              const cand1 = { x: xm + rx, y: ym + ry };
              const cand2 = { x: xm - rx, y: ym - ry };
              [cand1, cand2].forEach(({ x, y }) => {
                if (
                  x >= barrierX + r - EPS &&
                  x <= trayW - r + EPS &&
                  y >= r - EPS
                ) {
                  candidates.push({ x: x, y: y });
                }
              });
            }
          }

          // A4) Tangent to barrier + each placed circle p
          placed.forEach(p => {
            const cx = barrierX + r;
            const dx = Math.abs(cx - p.x);
            const R = p.r + r;
            if (dx < R - EPS) {
              const offset = Math.sqrt(Math.max(0, R*R - dx*dx));
              const yCand1 = p.y + offset;
              if (yCand1 >= r - EPS) {
                candidates.push({ x: cx, y: yCand1 });
              }
            }
          });

          // B) FILTER valid candidates (in‐bounds, no overlap)
          candidates.forEach(pos => {
            const xCand = pos.x, yCand = pos.y;
            if (xCand - r < barrierX - EPS || xCand + r > trayW + EPS) return;
            if (yCand - r < -EPS) return;
            let overl = false;
            for (const p of placed) {
              const dx = xCand - p.x, dy = yCand - p.y;
              const req = p.r + r;
              if (dx*dx + dy*dy < (req - EPS)*(req - EPS)) {
                overl = true;
                break;
              }
            }
            if (!overl) {
              if (
                yCand < best.y - EPS ||
                (Math.abs(yCand - best.y) < EPS && xCand < best.x)
              ) {
                best = { x: xCand, y: yCand };
              }
            }
          });

          // C) FALL BACK if no valid tangent found
          if (best.x === null) {
            const xForced = barrierX + r;
            let yForced = r;
            placed.forEach(p => {
              const dx = Math.abs(xForced - p.x);
              if (dx < p.r + r - EPS) {
                const supTop = p.y + p.r + r;
                if (supTop > yForced) yForced = supTop;
              }
            });
            best = { x: xForced, y: yForced };
          }

          // D) Commit placement
          placed.push({
            x: best.x,
            y: best.y,
            r: r,
            OD: c.OD,
            tag: c.tag,
            cableType: c.cableType,
            count: c.count,
            size: c.size,
            weight: c.weight
          });
        });

        return placed;
      }

      // (3) Place an entire cable zone within a given width and report width used
      function placeZone(zoneCables, maxWidth, spacingEnabled) {
        const { large: gLarge, small: gSmall } = splitLargeSmall(zoneCables);
        let largePlaced = [];
        if (gLarge.length > 0) {
          largePlaced = placeLargeIgnoreBounds(gLarge, spacingEnabled);
        }
        let barrierX = 0;
        if (largePlaced.length > 0) {
          barrierX = Math.max(...largePlaced.map(p => p.x + p.r));
        }
        let finalPlaced = largePlaced;
        if (gSmall.length > 0) {
          finalPlaced = placeSmallByPacking(gSmall, maxWidth, barrierX, largePlaced);
        }
        const placed = largePlaced.concat(finalPlaced.slice(largePlaced.length));
        const widthUsed = placed.length > 0 ? Math.max(...placed.map(p => p.x + p.r)) : 0;
        return { placed, widthUsed, barrierX, largeCount: gLarge.length, smallCount: gSmall.length };
      }

      // (3) Place an entire cable zone within a given width and report width used
      function placeZone(zoneCables, maxWidth, spacingEnabled) {
        const { large: gLarge, small: gSmall } = splitLargeSmall(zoneCables);
        let largePlaced = [];
        if (gLarge.length > 0) {
          largePlaced = placeLargeIgnoreBounds(gLarge, spacingEnabled);
        }
        let barrierX = 0;
        if (largePlaced.length > 0) {
          barrierX = Math.max(...largePlaced.map(p => p.x + p.r));
        }
        let finalPlaced = largePlaced;
        if (gSmall.length > 0) {
          finalPlaced = placeSmallByPacking(gSmall, maxWidth, barrierX, largePlaced);
        }
        const placed = largePlaced.concat(finalPlaced.slice(largePlaced.length));
        const widthUsed = placed.length > 0 ? Math.max(...placed.map(p => p.x + p.r)) : 0;
        return { placed, widthUsed, barrierX, largeCount: gLarge.length, smallCount: gSmall.length };
      }


      // ─────────────────────────────────────────────────────────────
      // (E) “Draw Tray” button: gather inputs → metrics → placement → draw SVG → show warnings
      // ─────────────────────────────────────────────────────────────
      document.getElementById("drawBtn").addEventListener("click", () => {
        // 1) Tray parameters
        const trayW    = parseFloat(document.getElementById("trayWidth").value);
        const trayD    = parseFloat(document.getElementById("trayDepth").value);
        const trayType = document.getElementById("trayType").value;
        const trayName = document.getElementById("trayName").value.trim();

        // 2) Gather cables from the table
        const rows = Array.from(cableTbody.querySelectorAll("tr"));
        const drawCables = [];
        for (const row of rows) {
          const tagVal     = row.children[0].querySelector("input").value.trim();
          const cableType  = row.children[1].querySelector("select").value;
          const countVal   = parseInt(row.children[2].querySelector("input").value);
          const sizeVal    = row.children[3].querySelector("input").value.trim();
          const ratingVal  = parseFloat(row.children[4].querySelector("input").value);
          const voltVal    = parseFloat(row.children[5].querySelector("input").value);
          const selSize    = row.children[6].querySelector("select");
          const odVal      = parseFloat(row.children[6].querySelector("input").value);
          const wtVal      = parseFloat(row.children[7].querySelector("input").value);
          const zoneVal    = parseInt(row.children[8].querySelector("input").value) || 1;
          const groupRaw   = row.children[9].querySelector("input").value;
          const groupVal   = groupRaw ? parseInt(groupRaw) : null;
          const multiVal   = countVal > 1;
          // Read parallelCount stored on the row element (set when cable was loaded from schedule)
          const parallelCount = Math.max(1, parseInt(row.dataset.parallelCount) || 1);

          if (!tagVal) {
            showAlertModal('Validation Error', 'Every cable row requires a Tag.');
            return;
          }
          if (!cableType) {
            showAlertModal('Validation Error', 'Every cable row requires a Cable Type.');
            return;
          }
          if (!countVal || !sizeVal) {
            showAlertModal('Validation Error', 'Every cable row requires Conductor count and size.');
            return;
          }
          if (isNaN(odVal) || isNaN(wtVal)) {
            showAlertModal('Validation Error', 'Every cable row requires numeric OD and Weight.');
            return;
          }

          drawCables.push({
            tag: tagVal,
            cableType: cableType,
            count: countVal,
            size: sizeVal,
            rating: ratingVal,
            voltage: voltVal,
            cable_size: selSize ? selSize.value : "",
            OD: odVal,
            weight: wtVal,
            multi: multiVal,
            zone: zoneVal,
            circuitGroup: groupVal,
            parallelCount,
          });
        }
        const cables = drawCables;
        if (cables.length === 0) {
          showAlertModal('Validation Error', 'Add at least one cable before drawing the tray.');
          return;
        }
        const totalArea = sumAreas(cables);
        const allowFill = trayType === "ladder" ? 50 : 40;
        const overallFill = (totalArea / (trayW * trayD)) * 100;
        const overLimit = overallFill > allowFill + 1e-6;
        const cableColor = overLimit ? '#ff6666' : '#66ccff';
        lastColor = cableColor;

        // 3) Convert circuit groups into placement groups
        let groupWarning = "";
        const groupsMap = {};
        cables.forEach((c, idx) => {
          if (c.circuitGroup !== null && c.circuitGroup !== undefined && c.circuitGroup !== "") {
            const key = `${c.zone}_${c.circuitGroup}`;
            if (!groupsMap[key]) groupsMap[key] = [];
            groupsMap[key].push({ idx, cable: c });
          }
        });
        const placementCables = [];
        const groupedIdx = new Set();
        Object.entries(groupsMap).forEach(([key, arr]) => {
          const [zoneId, gId] = key.split('_').map(n => parseInt(n));
          const members = arr.map(x => x.cable);
          const valid =
            (arr.length === 3 || arr.length === 4) &&
            members.every(m => m.cableType === 'Power' && m.count === 1 && !m.multi);
          if (!valid) {
            groupWarning += `<p class="warning">Circuit Group ${gId} in Zone ${zoneId} must contain 3 or 4 single-conductor power cables.</p>`;
            arr.forEach(x => { placementCables.push(x.cable); groupedIdx.add(x.idx); });
          } else {
            arr.forEach(x => groupedIdx.add(x.idx));
            const maxOD = Math.max(...members.map(m => m.OD));
            const weight = members.reduce((sum, m) => sum + m.weight, 0);
            const rMax = maxOD / 2;
            const factor = (members.length === 3) ? (1 + 2/Math.sqrt(3)) : (Math.SQRT2 + 1);
            const groupOD = 2 * rMax * factor;
            const offsets = [];
            if (members.length === 3) {
              offsets.push({x:-rMax, y:-rMax/Math.sqrt(3)});
              offsets.push({x: rMax, y:-rMax/Math.sqrt(3)});
              offsets.push({x:0, y:(2/Math.sqrt(3))*rMax});
            } else {
              offsets.push({x:-rMax, y:-rMax});
              offsets.push({x: rMax, y:-rMax});
              offsets.push({x:-rMax, y: rMax});
              offsets.push({x: rMax, y: rMax});
            }
            placementCables.push({
              tag: members.map(m=>m.tag).join('+'),
              cableType: 'Power',
              count: members.length,
              size: members.map(m=>m.size).join('+'),
              rating: NaN,
              voltage: NaN,
              OD: groupOD,
              weight: weight,
              multi: false,
              zone: zoneId,
              circuitGroup: gId,
              isGroup: true,
              members: members,
              offsets: offsets,
              spacingGap: 2.15 * maxOD
            });
          }
        });
        cables.forEach((c, idx) => {
          if (!groupedIdx.has(idx)) placementCables.push(c);
        });

        // 4) Compute extra metrics: small‐area & large‐diameter sums
        const { large, small } = splitLargeSmall(cables);
        let sumSmallArea = sumAreas(small);
        let sumLargeDiam = sumDiameters(large);
        const singleCables = cables.filter(c => !c.multi);

        let singleWarning = "";
        if (singleCables.length > 0) {
          const areaSingle = sumAreas(singleCables);
          const largestRank = Math.max(...singleCables.map(c => sizeRank(c.size)));
          const allowP = singleAllowPercent(largestRank, trayType);
          const fillP = (areaSingle / (trayW * trayD)) * 100;
          if (fillP > allowP + 1e-6) {
            singleWarning = `
              <p class="nfpaWarn">
                NFPA 70 392.22(B) WARNING:<br>
                Single-conductor fill (${fillP.toFixed(0)} %) exceeds ${allowP} % allowable.
              </p>`;
          }
          if (singleCables.some(c => c.count === 1 && sizeRank(c.size) < sizeRank('1/0 AWG'))) {
            singleWarning += `
              <p class="nfpaWarn">
                NFPA 70 392.10(B)(1)(a) WARNING:<br>
                Single-conductor cables smaller than #1/0 are not permitted in ladder cable trays.
              </p>`;
          }
        }

        // 4) Use the large/small split to compute recommended width
        let recommendedWidth = computeNeededWidth(large, small, trayType);

        // 5) Check if user wants one‐diameter spacing between 4/0+ cables
        const spacingEnabled = document.getElementById("largeSpacing").checked;

        // 6) Place cables by compartment
        // Returns a CSS class name based on fill percentage for heat-map coloring
        function fillHeatClass(pct) {
          if (pct >= 80) return 'zone-fill-danger';
          if (pct >= 40) return 'zone-fill-warning';
          return 'zone-fill-ok';
        }

        let voltageWarning = "";
        const allZoneData = [];
        let zoneHTML = "";

        // Build per-compartment layout data
        const compLayouts = compartments.map(comp => {
          const compId = comp.id;
          const compWidth = parseFloat(comp.width) || trayW;
          const compDepth = parseFloat(comp.depth) || trayD;
          const compCables = placementCables.filter(c => (parseInt(c.zone) || 1) === compId);
          const origCables = cables.filter(c => (parseInt(c.zone) || 1) === compId);

          const result = placeZone(compCables, compWidth, spacingEnabled);
          const { large: origLarge, small: origSmall } = splitLargeSmall(origCables);

          // Voltage check per compartment
          const volts = origCables.map(c => c.voltage).filter(v => !isNaN(v));
          const ratings = origCables.map(c => c.rating).filter(v => !isNaN(v));
          if (volts.length > 0 && ratings.length > 0) {
            const maxV = Math.max(...volts);
            const minR = Math.min(...ratings);
            if (maxV > minR + 1e-6) {
              const lbl = comp.label || `Compartment ${compId}`;
              voltageWarning += `<p class="warning">WARNING: In ${lbl}, operating voltage (${maxV.toFixed(0)} V) exceeds the lowest cable rating (${minR.toFixed(0)} V).</p>`;
            }
          }

          // Per-compartment fill HTML
          const lbl = comp.label || `Compartment ${compId}`;
          if (result.largeCount > 0 && result.smallCount > 0) {
            const areaLarge = sumAreas(origLarge);
            const areaSmall = sumAreas(origSmall);
            const widthLarge = result.barrierX;
            const widthSmall = result.widthUsed - result.barrierX;
            const fillLarge = widthLarge > 0 ? Math.min(100, (areaLarge / (widthLarge * compDepth)) * 100) : 0;
            const fillSmall = widthSmall > 0 ? Math.min(100, (areaSmall / (widthSmall * compDepth)) * 100) : 0;
            const gId1 = `comp-gauge-${compId}-1`;
            const gId2 = `comp-gauge-${compId}-2`;
            zoneHTML += `<div class="zone-result-block ${fillHeatClass(fillLarge)}">
              <div class="zone-result-header"><strong>${lbl} (Stackable) Fill:</strong> ${fillLarge.toFixed(0)}%</div>
              <div id="${gId1}" class="zone-gauge-container"></div>
            </div>`;
            zoneHTML += `<div class="zone-result-block ${fillHeatClass(fillSmall)}">
              <div class="zone-result-header"><strong>${lbl} (Non-Stackable) Fill:</strong> ${fillSmall.toFixed(0)}%</div>
              <div id="${gId2}" class="zone-gauge-container"></div>
            </div>`;
            allZoneData.push({ id: gId1, label: `${lbl} Stackable Fill %`, pct: fillLarge });
            allZoneData.push({ id: gId2, label: `${lbl} Non-Stackable Fill %`, pct: fillSmall });
          } else {
            const areaAll = sumAreas(origCables);
            const compArea = compWidth * compDepth;
            const fillP = compArea > 0 ? Math.min(100, (areaAll / compArea) * 100) : 0;
            const gId = `comp-gauge-${compId}`;
            zoneHTML += `<div class="zone-result-block ${fillHeatClass(fillP)}">
              <div class="zone-result-header"><strong>${lbl} Fill:</strong> ${fillP.toFixed(0)}%</div>
              <div id="${gId}" class="zone-gauge-container"></div>
            </div>`;
            allZoneData.push({ id: gId, label: `${lbl} Fill %`, pct: fillP });
          }

          return { comp, compWidth, compDepth, placed: result.placed, barrierX: result.barrierX, largeCount: result.largeCount, smallCount: result.smallCount };
        });

        // Flat placed list (for overflow checks)
        let placedAll = [];
        compLayouts.forEach(cl => placedAll.push(...cl.placed));

        // If combined width exceeds tray width, simply report overflow.
        // Previously the code scaled x positions to "squish" the layout, but
        // that could cause circles to overlap.  To honor the rules that
        // circles must not overlap and must remain inside the tray, we keep the
        // original layout and allow overflow detection to handle warnings.

        // 7) Determine if ALL cables are Control/Signal
        const allCS = cables.every(c => c.cableType === "Control" || c.cableType === "Signal");

        // 8) NFPA 70 Table 392.22(A) warning (area vs sumLargeDiam) — only if NOT allCS
        let nfpaWarning = "";
        if (!allCS) {
          const baseAllow = (trayType === "ladder") ? (nfpaLadder[trayW] || 0) : (nfpaSolid[trayW] || 0);
          const penaltyFactor = (trayType === "ladder") ? 1.2 : 1.0;
          if (baseAllow > 0) {
            let nfpaAllowable = baseAllow - (penaltyFactor * sumLargeDiam);
            if (nfpaAllowable < 0) nfpaAllowable = 0;
            if (sumSmallArea > nfpaAllowable + 1e-6) {
              nfpaWarning = `
                <p class="nfpaWarn">
                  NFPA 70 Table 392.22(A) WARNING:<br>
                  Small‐cable area (${sumSmallArea.toFixed(2)} in²) exceeds NFPA allowable
                  (${nfpaAllowable.toFixed(2)} in²) for a ${trayW}" ${trayType === "ladder" ? "Ladder" : "Solid Bottom"} tray.
                </p>`;
            }
          }
        }

        // 9) NFPA 70 392.22(A)(2) & (4) warning for Control/Signal‐only
        let csWarning = "";
        const csFill = (sumSmallArea / (trayW * trayD)) * 100;
        if (allCS) {
          if (trayType === "ladder" && csFill > 50) {
            csWarning = `
              <p class="nfpaWarn">
                NFPA 70 392.22(A)(2) WARNING:<br>
                All cables are Control/Signal and Fill % (${csFill.toFixed(0)} %) exceeds 50 % for Ladder tray.
              </p>`;
          } else if (trayType === "solid" && csFill > 40) {
            csWarning = `
              <p class="nfpaWarn">
                NFPA 70 392.22(A)(4) WARNING:<br>
                All cables are Control/Signal and Fill % (${csFill.toFixed(0)} %) exceeds 40 % for Solid Bottom tray.
              </p>`;
          }
        }

        // 10) Summarize metrics + total weight
        const totalWeight = cables.reduce((sum, c) => sum + c.weight, 0);

        // Build Zone Fill Summary (Worst Offenders) bar chart
        const sortedZones = [...allZoneData].sort((a, b) => b.pct - a.pct);
        let worstHTML = '';
        if (sortedZones.length > 0) {
          worstHTML = `<section class="worst-offenders" aria-label="Zone Fill Summary">
            <h3 class="worst-offenders-title">Zone Fill Summary</h3>
            <ul class="worst-offenders-list">`;
          for (const zd of sortedZones) {
            const barPct = Math.min(100, zd.pct).toFixed(1);
            worstHTML += `<li class="worst-offenders-item">
              <span class="wo-label">${zd.label.replace(' Fill %', '')}</span>
              <div class="wo-bar-track" role="meter" aria-valuenow="${zd.pct.toFixed(1)}" aria-valuemin="0" aria-valuemax="100" aria-label="${zd.label}: ${zd.pct.toFixed(1)}%">
                <div class="wo-bar-fill ${fillHeatClass(zd.pct)}" style="width:${barPct}%"></div>
              </div>
              <span class="wo-pct">${zd.pct.toFixed(1)}%</span>
            </li>`;
          }
          worstHTML += `</ul></section>`;
        }

        let resultsHTML = `${worstHTML}
          <p>
            <strong>Tray Type:</strong> ${trayType === “ladder” ? “Ladder (50 % fill)” : “Solid Bottom (40 % fill)”}<br>
            <strong>Compartments:</strong> ${compartments.length}
          </p>
          <p>
            <strong>Stackable Cables Cross-Sectional Area:</strong> ${sumSmallArea.toFixed(2)} in²<br>
            <strong>Non-Stackable Cables Sum of Diameters:</strong> ${sumLargeDiam.toFixed(2)} in
          </p>
          ${zoneHTML}
          <p><strong>Total Cable Weight:</strong> ${totalWeight.toFixed(2)} lbs/ft</p>
          ${nfpaWarning}
          ${csWarning}
          ${singleWarning}
          ${groupWarning}
          ${voltageWarning}
        `;

        // Store for “Expand Image”
        lastPlaced           = placedAll;
        lastTrayW            = trayW;
        lastTrayD            = trayD;
        lastType             = trayType;
        lastScale            = 20;
        lastCompartmentLayouts = compLayouts.map(cl => ({ ...cl }));

        // 14) Detect overflow per compartment
        let overflowHoriz = false;
        let overflowVert  = false;
        compLayouts.forEach(cl => {
          cl.placed.forEach(p => {
            if (p.x + p.r > cl.compWidth + 1e-6) overflowHoriz = true;
            if (p.y + p.r > cl.compDepth + 1e-6) overflowVert  = true;
          });
        });

        // 15) Draw the SVG — one rect per compartment, stacked vertically
        document.getElementById(“svgContainer”).innerHTML = buildCompartmentSvg(compLayouts, trayName, cableColor, 20);

        // 16) Show overflow warnings
        if (overflowHoriz) {
          if (recommendedWidth && recommendedWidth > trayW) {
            resultsHTML += `<p class=”warning”>WARNING: Some cables extend beyond their compartment width.</p>
              <p class=”recommend”>Recommend larger standard width: ${recommendedWidth}”</p>`;
          } else {
            resultsHTML += `<p class=”warning”>WARNING: Some cables extend beyond their compartment width.</p>`;
          }
        }
        if (overflowVert) {
          resultsHTML += `<p class=”warning”>WARNING: Some cables extend above their compartment depth.</p>
            <p class=”recommend”>Recommend increasing the affected compartment's depth.</p>`;
        }
        document.getElementById(“results”).innerHTML = resultsHTML;

        // Initialize per-compartment fill gauges (DOM nodes must exist first)
        for (const zd of allZoneData) {
          const gauge = createFillGauge(zd.id, { label: zd.label, width: 150, strokeWidth: 14 });
          gauge.update(zd.pct);
        }
      });

      // ── Shared SVG builder for compartment-based tray cross-section ──────
      function buildCompartmentSvg(compLayouts, trayName, cableColor, scale) {
        const nameRowPx    = trayName ? 24 : 0;
        const perCompHeaderPx = 24;  // dimension label row per compartment
        const compGapPx    = 8;      // vertical gap between compartments

        // Compute SVG dimensions
        let svgH = nameRowPx;
        const compPositions = compLayouts.map(cl => {
          const headerY = svgH;
          const rectY   = svgH + perCompHeaderPx;
          svgH += perCompHeaderPx + cl.compDepth * scale + compGapPx;
          return { headerY, rectY };
        });
        svgH = Math.max(svgH - compGapPx, nameRowPx + 10); // trim last gap
        const svgW = Math.max(...compLayouts.map(cl => cl.compWidth)) * scale;

        let svg = `<svg xmlns=”http://www.w3.org/2000/svg” width=”${svgW.toFixed(0)}” height=”${svgH.toFixed(0)}” style=”background:#f9f9f9;border:1px solid #999;”>`;

        // Tray name
        if (trayName) {
          svg += `<text x=”${(svgW/2).toFixed(2)}” y=”${(nameRowPx*0.7).toFixed(2)}” font-size=”14px” text-anchor=”middle” fill=”#000” font-family=”Arial,sans-serif”>${trayName}</text>`;
        }

        // Per-compartment elements
        compLayouts.forEach((cl, ci) => {
          const { headerY, rectY } = compPositions[ci];
          const compW = cl.compWidth * scale;
          const compH = cl.compDepth * scale;
          const label = cl.comp.label || `Compartment ${cl.comp.id}`;
          const dimLineY = headerY + 12;

          // Dimension line + label
          svg += `<line x1=”0” y1=”${dimLineY}” x2=”${compW.toFixed(2)}” y2=”${dimLineY}” stroke=”#000” stroke-width=”1”/>`;
          svg += `<line x1=”0” y1=”${dimLineY-4}” x2=”0” y2=”${dimLineY+4}” stroke=”#000” stroke-width=”1”/>`;
          svg += `<line x1=”${compW.toFixed(2)}” y1=”${dimLineY-4}” x2=”${compW.toFixed(2)}” y2=”${dimLineY+4}” stroke=”#000” stroke-width=”1”/>`;
          svg += `<text x=”${(compW/2).toFixed(2)}” y=”${dimLineY-4}” font-size=”9px” text-anchor=”middle” font-family=”Arial,sans-serif”>${label}</text>`;
          svg += `<text x=”${(compW/2).toFixed(2)}” y=”${dimLineY+9}” font-size=”9px” text-anchor=”middle” font-family=”Arial,sans-serif”>${cl.compWidth.toFixed(1)}” × ${cl.compDepth.toFixed(1)}”</text>`;

          // Compartment rectangle
          svg += `<rect x=”0” y=”${rectY}” width=”${compW.toFixed(2)}” height=”${compH.toFixed(2)}” fill=”none” stroke=”#333” stroke-width=”2”/>`;

          // Inner barrier (stackable vs non-stackable divider)
          if (cl.largeCount > 0 && cl.smallCount > 0) {
            const bxp = (cl.barrierX * scale).toFixed(2);
            svg += `<line x1=”${bxp}” y1=”${rectY}” x2=”${bxp}” y2=”${(rectY + compH).toFixed(2)}” stroke=”#aa3300” stroke-width=”2” stroke-dasharray=”4 2”/>`;
          }

          // Cables in this compartment
          cl.placed.forEach(p => {
            if (p.isGroup && p.members && p.offsets) {
              const gcx = (p.x * scale).toFixed(2);
              const gcy = (rectY + (cl.compDepth - p.y) * scale).toFixed(2);
              const gr  = (p.r * scale).toFixed(2);
              svg += `<circle cx=”${gcx}” cy=”${gcy}” r=”${gr}” fill=”none” stroke=”#0066aa” stroke-width=”1” stroke-dasharray=”4 2”/>`;
              p.members.forEach((m, mi) => {
                const mx = ((p.x + p.offsets[mi].x) * scale).toFixed(2);
                const my = (rectY + (cl.compDepth - (p.y + p.offsets[mi].y)) * scale).toFixed(2);
                const mr = ((m.OD / 2) * scale).toFixed(2);
                svg += `<circle cx=”${mx}” cy=”${my}” r=”${mr}” fill=”${cableColor}” stroke=”#0066aa” stroke-width=”1”><title>Cable Tag: ${m.tag}\nCable Type: ${m.cableType}\nConductors: ${m.count}\nSize: ${m.size}\nOD: ${m.OD.toFixed(2)}″\nWt: ${m.weight.toFixed(2)} lbs/ft</title></circle>`;
              });
            } else {
              const cx = (p.x * scale).toFixed(2);
              const cy = (rectY + (cl.compDepth - p.y) * scale).toFixed(2);
              const r  = (p.r * scale).toFixed(2);
              svg += `<circle cx=”${cx}” cy=”${cy}” r=”${r}” fill=”${cableColor}” stroke=”#0066aa” stroke-width=”1”><title>Cable Tag: ${p.tag}\nCable Type: ${p.cableType}\nConductors: ${p.count}\nSize: ${p.size}\nOD: ${p.OD.toFixed(2)}″\nWt: ${p.weight.toFixed(2)} lbs/ft</title></circle>`;
            }
          });
        });

        svg += '</svg>';
        return svg;
      }

      // ─────────────────────────────────────────────────────────────
      // (F) “Expand Image” button: popup at 160 px/in with text labels
      // ─────────────────────────────────────────────────────────────
      document.getElementById(“expandBtn”).addEventListener(“click”, () => {
        if (!lastCompartmentLayouts) {
          showAlertModal('Action Required', 'Please click “Draw Tray” first, then Expand.');
          return;
        }
        const bigScale = 160;
        const trayName = document.getElementById(“trayName”).value.trim();

        // Build base SVG using shared helper at bigScale
        let svg = buildCompartmentSvg(lastCompartmentLayouts, trayName, lastColor, bigScale);

        // Inject text labels into each circle by post-processing the placed data
        // Re-render with text labels: build a richer SVG directly
        const nameRowPx = trayName ? 24 : 0;
        const perCompHeaderPx = 24;
        const compGapPx = 8;
        let svgH = nameRowPx;
        const compPositions = lastCompartmentLayouts.map(cl => {
          const headerY = svgH;
          const rectY   = svgH + perCompHeaderPx;
          svgH += perCompHeaderPx + cl.compDepth * bigScale + compGapPx;
          return { headerY, rectY };
        });
        svgH = Math.max(svgH - compGapPx, nameRowPx + 10);
        const svgW = Math.max(...lastCompartmentLayouts.map(cl => cl.compWidth)) * bigScale;

        let bigSvg = `<svg xmlns=”http://www.w3.org/2000/svg” width=”${svgW.toFixed(0)}” height=”${svgH.toFixed(0)}” style=”background:#f9f9f9;border:1px solid #333;”>`;
        if (trayName) {
          bigSvg += `<text x=”${(svgW/2).toFixed(2)}” y=”${(nameRowPx*0.7).toFixed(2)}” font-size=”20px” text-anchor=”middle” fill=”#000” font-family=”Arial,sans-serif”>${trayName}</text>`;
        }

        lastCompartmentLayouts.forEach((cl, ci) => {
          const { headerY, rectY } = compPositions[ci];
          const compW = cl.compWidth * bigScale;
          const compH = cl.compDepth * bigScale;
          const label = cl.comp.label || `Compartment ${cl.comp.id}`;
          const dimLineY = headerY + 14;

          bigSvg += `<line x1=”0” y1=”${dimLineY}” x2=”${compW.toFixed(2)}” y2=”${dimLineY}” stroke=”#000” stroke-width=”2”/>`;
          bigSvg += `<line x1=”0” y1=”${dimLineY-6}” x2=”0” y2=”${dimLineY+6}” stroke=”#000” stroke-width=”2”/>`;
          bigSvg += `<line x1=”${compW.toFixed(2)}” y1=”${dimLineY-6}” x2=”${compW.toFixed(2)}” y2=”${dimLineY+6}” stroke=”#000” stroke-width=”2”/>`;
          bigSvg += `<text x=”${(compW/2).toFixed(2)}” y=”${dimLineY-5}” font-size=”14px” text-anchor=”middle” font-family=”Arial,sans-serif”>${label}</text>`;
          bigSvg += `<text x=”${(compW/2).toFixed(2)}” y=”${dimLineY+11}” font-size=”14px” text-anchor=”middle” font-family=”Arial,sans-serif”>${cl.compWidth.toFixed(1)}” × ${cl.compDepth.toFixed(1)}”</text>`;
          bigSvg += `<rect x=”0” y=”${rectY}” width=”${compW.toFixed(2)}” height=”${compH.toFixed(2)}” fill=”none” stroke=”#333” stroke-width=”4”/>`;

          if (cl.largeCount > 0 && cl.smallCount > 0) {
            const bxp = (cl.barrierX * bigScale).toFixed(2);
            bigSvg += `<line x1=”${bxp}” y1=”${rectY}” x2=”${bxp}” y2=”${(rectY+compH).toFixed(2)}” stroke=”#aa3300” stroke-width=”4” stroke-dasharray=”12 6”/>`;
          }

          cl.placed.forEach(p => {
            if (p.isGroup && p.members && p.offsets) {
              const gcx = (p.x * bigScale).toFixed(2);
              const gcy = (rectY + (cl.compDepth - p.y) * bigScale).toFixed(2);
              const gr  = (p.r * bigScale).toFixed(2);
              bigSvg += `<circle cx=”${gcx}” cy=”${gcy}” r=”${gr}” fill=”none” stroke=”#0066aa” stroke-width=”2” stroke-dasharray=”8 4”/>`;
              p.members.forEach((m, mi) => {
                const mx = (p.x + p.offsets[mi].x) * bigScale;
                const my = rectY + (cl.compDepth - (p.y + p.offsets[mi].y)) * bigScale;
                const mr = (m.OD / 2) * bigScale;
                bigSvg += `<circle cx=”${mx.toFixed(2)}” cy=”${my.toFixed(2)}” r=”${mr.toFixed(2)}” fill=”${lastColor}” stroke=”#0066aa” stroke-width=”2”/>`;
                const fs = Math.min(mr * 0.15, 20);
                const lbls = [`${m.tag}`, `${m.cableType}`, `${m.count}C ${m.size}`, `OD:${m.OD.toFixed(2)}″`, `${m.weight.toFixed(2)}lb/ft`];
                const lh = fs * 1.1;
                let y0 = my - (lbls.length * lh) / 2 + lh / 2;
                lbls.forEach((ln, li) => { bigSvg += `<text x=”${mx.toFixed(2)}” y=”${(y0+li*lh).toFixed(2)}” font-size=”${fs}px” text-anchor=”middle” fill=”#000” font-family=”Arial,sans-serif” pointer-events=”none”>${ln}</text>`; });
              });
            } else {
              const cx = p.x * bigScale;
              const cy = rectY + (cl.compDepth - p.y) * bigScale;
              const r  = p.r * bigScale;
              bigSvg += `<circle cx=”${cx.toFixed(2)}” cy=”${cy.toFixed(2)}” r=”${r.toFixed(2)}” fill=”${lastColor}” stroke=”#0066aa” stroke-width=”2”/>`;
              const fs = Math.min(r * 0.15, 20);
              const lbls = [`${p.tag}`, `${p.cableType}`, `${p.count}C ${p.size}`, `OD:${p.OD.toFixed(2)}″`, `${p.weight.toFixed(2)}lb/ft`];
              const lh = fs * 1.1;
              let y0 = cy - (lbls.length * lh) / 2 + lh / 2;
              lbls.forEach((ln, li) => { bigSvg += `<text x=”${cx.toFixed(2)}” y=”${(y0+li*lh).toFixed(2)}” font-size=”${fs}px” text-anchor=”middle” fill=”#000” font-family=”Arial,sans-serif” pointer-events=”none”>${ln}</text>`; });
            }
          });
        });

        bigSvg += '</svg>';
        svg = bigSvg;

        document.getElementById("expandedSVG").innerHTML = svg;
        document.getElementById("overlay").style.display = "flex";
      });

      // ─────────────────────────────────────────────────────────────
      // (G) Copy SVG to clipboard
      // ─────────────────────────────────────────────────────────────
      document.getElementById("copyBtn").addEventListener("click", () => {
        const container = document.getElementById("expandedSVG");
        const svgElem = container.querySelector("svg");
        if (!svgElem) {
          showAlertModal('Notice', 'No expanded SVG found to copy.');
          return;
        }
        const svgText = svgElem.outerHTML;
        navigator.clipboard.writeText(svgText).then(() => {
          showAlertModal('Copied', 'SVG markup copied to clipboard!');
        }).catch(err => {
          showAlertModal('Copy Error', 'Error copying SVG: ' + err);
        });
      });

      // ─────────────────────────────────────────────────────────────
      // (H) Print SVG in new window
      // ─────────────────────────────────────────────────────────────
      document.getElementById("printBtn").addEventListener("click", () => {
        const container = document.getElementById("expandedSVG");
        const svgElem = container.querySelector("svg");
        if (!svgElem) {
          showAlertModal('Notice', 'No expanded SVG found to print.');
          return;
        }
        const svgText = svgElem.outerHTML;
        const printWindow = window.open("", "_blank");
        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Print Cable Tray</title>
</head>
<body style="margin:0; padding:0;">
  ${svgText}
</body>
</html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 200);
      });

      // ─────────────────────────────────────────────────────────────
      // (I) Copy PNG to clipboard: SVG → canvas → PNG Blob → clipboard
      // ─────────────────────────────────────────────────────────────
      document.getElementById("copyPngBtn").addEventListener("click", () => {
        const container = document.getElementById("expandedSVG");
        const svgElem = container.querySelector("svg");
        if (!svgElem) {
          showAlertModal('Notice', 'No expanded SVG found to copy as PNG.');
          return;
        }
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElem);
        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width  = svgElem.getAttribute("width");
          canvas.height = svgElem.getAttribute("height");
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(pngBlob => {
            if (!pngBlob) {
              showAlertModal('Export Error', 'Failed to create PNG blob.');
              URL.revokeObjectURL(url);
              return;
            }
            const clipboardItem = new ClipboardItem({ "image/png": pngBlob });
            navigator.clipboard.write([clipboardItem]).then(() => {
              showAlertModal('Copied', 'PNG copied to clipboard!');
              URL.revokeObjectURL(url);
            }).catch(err => {
              showAlertModal('Copy Error', 'Error copying PNG: ' + err);
              URL.revokeObjectURL(url);
            });
          }, "image/png");
        };
        img.onerror = () => {
          showAlertModal('Export Error', 'Failed to load SVG into image for PNG conversion.');
          URL.revokeObjectURL(url);
        };
        img.src = url;
      });

      // ─────────────────────────────────────────────────────────────
      // (J) “Close” button hides the overlay
      // ─────────────────────────────────────────────────────────────
      document.getElementById("popupClose").addEventListener("click", () => {
        document.getElementById("overlay").style.display = "none";
      });

      // ─────────────────────────────────────────────────────────────
      // (K) Excel Export / Import helpers
      // ─────────────────────────────────────────────────────────────
      function exportCableXlsx(){
        if(typeof XLSX==='undefined'){
          showAlertModal('Library Error', 'XLSX library not loaded.');
          return;
        }
        const rows=Array.from(cableTbody.querySelectorAll('tr'));
        if(rows.length===0){
          showAlertModal('Notice', 'No cables to export.');
          return;
        }
        const data=[['Tag','Cable Type','Conductors','Conductor Size','Cable Rating (V)','Operating Voltage (V)','OD','Weight','Compartment','Circuit Group']];
        rows.forEach(row=>{
          const tag=row.children[0].querySelector('input').value.trim();
          const cableType=row.children[1].querySelector('select').value;
          const count=row.children[2].querySelector('input').value.trim();
          const size=row.children[3].querySelector('input').value.trim();
          const rating=row.children[4].querySelector('input').value.trim();
          const voltage=row.children[5].querySelector('input').value.trim();
          const od=row.children[6].querySelector('input').value.trim();
          const weight=row.children[7].querySelector('input').value.trim();
          const zone=row.children[8].querySelector('input').value.trim();
          const group=row.children[9].querySelector('input').value.trim();
          data.push([tag,cableType,count,size,rating,voltage,od,weight,zone,group]);
        });
        const wb=XLSX.utils.book_new();
        const ws=XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb,ws,'Cables');
        // Compartments sheet
        const compData=[['Compartment ID','Width (in)','Depth (in)','Label']];
        compartments.forEach(c=>compData.push([c.id,c.width,c.depth,c.label||'']));
        XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(compData),'Compartments');
        XLSX.writeFile(wb,'CableList.xlsx');
      }

      function importCableXlsx(file){
        if(!file) return;
        if(typeof XLSX==='undefined'){
          showAlertModal('Library Error', 'XLSX library not loaded.');
          return;
        }
        const reader=new FileReader();
        reader.onload=e=>{
          const wb=XLSX.read(e.target.result,{type:'binary'});
          const firstSheet=wb.Sheets[wb.SheetNames[0]];
          const jsonArr=XLSX.utils.sheet_to_json(firstSheet,{defval:""});
          if(jsonArr.length===0){
            showAlertModal('Import Error', 'Excel sheet is empty.');
            return;
          }
          // Load compartments from second sheet if present
          const compSheetName=wb.SheetNames.find(n=>n.toLowerCase()==='compartments');
          if(compSheetName){
            const compSheet=wb.Sheets[compSheetName];
            const compArr=XLSX.utils.sheet_to_json(compSheet,{defval:""});
            if(compArr.length>0){
              compartments=compArr.map(r=>({
                id:parseInt(r['Compartment ID'])||1,
                width:parseFloat(r['Width (in)'])||12,
                depth:parseFloat(r['Depth (in)'])||3,
                label:String(r['Label']||'')
              })).filter(c=>c.id>=1&&c.id<=5);
              renderCompartmentUI();
            }
          }
          cableTbody.innerHTML='';
          cables=[];
          jsonArr.forEach((obj,idx)=>{
            const Tag=obj['Tag'];
            const CableType=obj['Cable Type'];
            const Conductors=obj['Conductors'];
            const Size=obj['Conductor Size'];
            const Rating=obj['Cable Rating (V)'];
            const Voltage=obj['Operating Voltage (V)'];
            const OD=obj['OD'];
            const Weight=obj['Weight'];
            // Support both 'Compartment' (new) and 'Zone' (legacy)
            const ZoneVal=obj['Compartment']||obj['Zone'];
            if(
              typeof Tag==='undefined'||
              typeof CableType==='undefined'||
              typeof Conductors==='undefined'||
              typeof Size==='undefined'||
              typeof Rating==='undefined'||
              typeof Voltage==='undefined'||
              typeof OD==='undefined'||
              typeof Weight==='undefined'
            ){
              showAlertModal('Import Error', `Row ${idx+2} missing one of: Tag, Cable Type, Conductors, Conductor Size, Cable Rating (V), Operating Voltage (V), OD, Weight.`);
              return;
            }
            const idx2=cables.length;
            cables.push({});
            const newRow=createCableRow({},idx2);
            newRow.children[0].querySelector('input').value=Tag;
            newRow.children[1].querySelector('select').value=CableType;
            newRow.children[2].querySelector('input').value=Conductors;
            newRow.children[3].querySelector('input').value=Size;
            newRow.children[4].querySelector('input').value=Rating;
            newRow.children[5].querySelector('input').value=Voltage;
            const sizeInput=newRow.children[3].querySelector('input');
            sizeInput.dispatchEvent(new Event('input'));
            const selSize=newRow.children[6].querySelector('select');
            const odInput=newRow.children[6].querySelector('input');
            const wtInput=newRow.children[7].querySelector('input');
            const zoneInput=newRow.children[8].querySelector('input');
            const groupInput=newRow.children[9].querySelector('input');
            const matchIdx=cableOptions.findIndex(o=>o.conductors===parseInt(Conductors)&&o.size===Size);
            if(matchIdx>=0){
              selSize.value=cableOptions[matchIdx].label;
              selSize.dispatchEvent(new Event('change'));
            }else{
              odInput.value=parseFloat(OD).toFixed(2);
              wtInput.value=parseFloat(Weight).toFixed(2);
              odInput.readOnly=false;
              wtInput.readOnly=false;
            }
            zoneInput.value=ZoneVal||1;
            groupInput.value=obj['Circuit Group']||'';
            cableTbody.appendChild(newRow);
          });
          applyFilters();
          showAlertModal('Import Complete', 'Excel imported. Correct any unrecognized conductor details if needed.');
          document.getElementById('importExcelInput').value='';
        };
        reader.readAsBinaryString(file);
      }

      document.getElementById('exportExcelBtn').addEventListener('click',exportCableXlsx);
      document.getElementById('importExcelBtn').addEventListener('click',()=>document.getElementById('importExcelInput').click());
      document.getElementById('importExcelInput').addEventListener('change',e=>{importCableXlsx(e.target.files[0]);e.target.value='';});

      // (L2) Import Help button
      document.getElementById("importHelpBtn").addEventListener("click", () => {
        showAlertModal('Import Instructions',
          "1. Click 'Export Excel' to download a template.\n" +
          "2. Fill in Tag, Cable Type, Conductors, Conductor Size, Cable Rating (V), Operating Voltage (V), OD, Weight, Compartment (1–5), and Circuit Group.\n" +
          "3. Optionally edit the 'Compartments' sheet to define compartment widths, depths, and labels.\n" +
          "4. Save the file then choose it with 'Import Excel'."
        );
      });


      // ─────────────────────────────────────────────────────────────
      // (M) Profile Management (localStorage)
      // ─────────────────────────────────────────────────────────────
      const trayProfiles = {
        prefix: "trayProfile_",
        save(name, data) {
          setItem(this.prefix + name, data);
        },
        load(name) {
          return getItem(this.prefix + name);
        },
        remove(name) {
          removeItem(this.prefix + name);
        },
        list() {
          return storeKeys()
            .filter(k => k.startsWith(this.prefix))
            .map(k => k.replace(this.prefix, ""));
        }
      };

      const profileList = document.getElementById("profileList");
      function refreshProfileList() {
        profileList.innerHTML = "";
        const names = trayProfiles.list();
        if (names.length === 0) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "-- no profiles saved --";
          profileList.appendChild(opt);
          return;
        }
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "-- select profile --";
        profileList.appendChild(defaultOpt);
        names.sort();
        names.forEach(profileName => {
          const opt = document.createElement("option");
          opt.value = profileName;
          opt.textContent = profileName;
          profileList.appendChild(opt);
        });
      }

      // Save profile
      document.getElementById("saveProfileBtn").addEventListener("click", () => {
        const name = prompt("Enter a name for this cable profile:");
        if (!name) return;
        const rows = Array.from(cableTbody.querySelectorAll("tr"));
        const arr = [];
        for (const row of rows) {
          const tagVal     = row.children[0].querySelector("input").value.trim();
          const cableType  = row.children[1].querySelector("select").value;
          const countVal  = parseInt(row.children[2].querySelector("input").value);
          const sizeVal    = row.children[3].querySelector("input").value.trim();
          const ratingVal  = parseFloat(row.children[4].querySelector("input").value);
          const voltVal    = parseFloat(row.children[5].querySelector("input").value);
          const odVal      = parseFloat(row.children[6].querySelector("input").value);
          const wtVal      = parseFloat(row.children[7].querySelector("input").value);
          const zoneVal    = parseInt(row.children[8].querySelector("input").value) || 1;
          const groupRaw   = row.children[9].querySelector("input").value;
          const groupVal   = groupRaw ? parseInt(groupRaw) : null;
          const multiVal  = countVal > 1;
          if (!tagVal || !cableType || !countVal || !sizeVal || isNaN(odVal) || isNaN(wtVal)) {
            showAlertModal('Validation Error', 'All rows must have Tag, Cable Type, conductor count/size, OD, and Weight before saving.');
            return;
          }
          arr.push({
            tag: tagVal,
            cableType: cableType,
            count: countVal,
            size: sizeVal,
            rating: ratingVal,
            voltage: voltVal,
            OD: odVal,
            weight: wtVal,
            multi: multiVal,
            zone: zoneVal,
            circuitGroup: groupVal
          });
        }
        const trayData = {
          width: parseFloat(document.getElementById("trayWidth").value) || 0,
          depth: parseFloat(document.getElementById("trayDepth").value) || 0,
          type: document.getElementById("trayType").value,
          tray_id: document.getElementById("trayName").value.trim()
        };
        try {
          trayProfiles.save(name, { tray: trayData, cables: arr, compartments: compartments.map(c=>({...c})) });
          showAlertModal('Profile Saved', `Profile "${name}" saved.`);
          refreshProfileList();
        } catch (e) {
          showAlertModal('Profile Error', 'Error saving profile: ' + e.message);
        }
      });

      // Load profile
      document.getElementById("loadProfileBtn").addEventListener("click", () => {
        const profileName = profileList.value;
        if (!profileName) {
          showAlertModal('Notice', 'Select a profile to load.');
          return;
        }
        const data = trayProfiles.load(profileName);
        if (!data) {
          showAlertModal('Profile Not Found', `Profile "${profileName}" not found.`);
          refreshProfileList();
          return;
        }
        const { tray = {}, cables: arr = [], compartments: savedComps } = data;
        document.getElementById("trayWidth").value = tray.width ?? tray.w ?? "";
        document.getElementById("trayDepth").value = tray.depth ?? tray.height ?? "";
        if (tray.type) document.getElementById("trayType").value = tray.type;
        document.getElementById("trayName").value = tray.tray_id || tray.name || "";
        // Restore compartments (backward compat: default to single compartment from tray dims)
        if (savedComps && Array.isArray(savedComps) && savedComps.length > 0) {
          compartments = savedComps.map(c => ({ ...c }));
        } else {
          compartments = [{ id: 1, width: parseFloat(tray.width || tray.w) || 12, depth: parseFloat(tray.depth || tray.height) || 3, label: '' }];
        }
        renderCompartmentUI();
        cableTbody.innerHTML = "";
        cables = [];
        arr.forEach(cable => {
          const idx2 = cables.length;
          cables.push(cable);
          const newRow = createCableRow(cable, idx2);
          newRow.children[0].querySelector("input").value = cable.tag;
          newRow.children[1].querySelector("select").value = cable.cableType;
          newRow.children[2].querySelector("input").value = cable.count;
          newRow.children[3].querySelector("input").value = cable.size;
          newRow.children[4].querySelector("input").value = cable.rating || "";
          newRow.children[5].querySelector("input").value = cable.voltage || "";
          const sizeInput = newRow.children[3].querySelector("input");
          sizeInput.dispatchEvent(new Event("input"));
          const selSize = newRow.children[6].querySelector("select");
          const odInput = newRow.children[6].querySelector("input");
          const wtInput = newRow.children[7].querySelector("input");
          const zoneInput = newRow.children[8].querySelector("input");
          const groupInput = newRow.children[9].querySelector("input");
          if (cableOptions.findIndex(o => o.conductors === cable.count && o.size === cable.size) < 0) {
            selSize.value = "";
            odInput.value = cable.OD.toFixed(2);
            wtInput.value = cable.weight.toFixed(2);
            odInput.readOnly = false;
            wtInput.readOnly = false;
          }
          zoneInput.value = cable.zone || 1;
          groupInput.value = cable.circuitGroup || "";
          cableTbody.appendChild(newRow);
        });
        applyFilters();
        showAlertModal('Profile Loaded', `Profile "${profileName}" loaded.`);
      });

      // Delete profile
      document.getElementById("deleteProfileBtn").addEventListener("click", async () => {
        const profileName = profileList.value;
        if (!profileName) {
          showAlertModal('Notice', 'Select a profile to delete.');
          return;
        }
        const confirmed = await openModal({
          title: 'Delete Profile',
          description: `Delete profile "${profileName}"?`,
          primaryText: 'Delete',
          secondaryText: 'Cancel',
          variant: 'danger'
        });
        if (!confirmed) return;
        trayProfiles.remove(profileName);
        showAlertModal('Profile Deleted', `Profile "${profileName}" deleted.`);
        refreshProfileList();
      });

      // Initialize profile dropdown
      refreshProfileList();

      ['trayWidth','trayDepth','trayType','trayName','largeSpacing'].forEach(id=>{const el=document.getElementById(id);if(el){el.addEventListener('input',markUnsaved);el.addEventListener('change',markUnsaved);}});
      const cableTbl=document.getElementById('cableTable');
      if(cableTbl){
        cableTbl.addEventListener('input',markUnsaved);
        cableTbl.addEventListener('click',e=>{if(e.target.tagName==='BUTTON') markUnsaved();});
      }
      const addCableBtn=document.getElementById('addCableBtn');
      if(addCableBtn) addCableBtn.addEventListener('click',markUnsaved);
      const importExcelInput=document.getElementById('importExcelInput');
      if(importExcelInput) importExcelInput.addEventListener('change',markUnsaved);
      ['saveProfileBtn','loadProfileBtn','exportExcelBtn'].forEach(id=>{const el=document.getElementById(id);if(el) el.addEventListener('click',markSaved);});

      const stored = getItem('trayFillData');
      if (stored) {
        try {
          const { tray, cables: storedCables } = stored;
          document.getElementById('trayWidth').value = tray.width;
          document.getElementById('trayDepth').value = tray.height;
          document.getElementById('trayName').value = tray.tray_id || '';
          // Initialize single compartment from tray dimensions for this navigation flow
          compartments = [{ id: 1, width: parseFloat(tray.width) || 12, depth: parseFloat(tray.height) || 3, label: '' }];
          renderCompartmentUI();
          if (Array.isArray(storedCables)) {
            cables = storedCables.map(c => ({
              tag: c.name || c.tag || '',
              cableType: c.cable_type || '',
              count: c.conductors || c.count || '',
              size: c.conductor_size || c.size || '',
              rating: c.rating || '',
              voltage: c.voltage || '',
              od: (() => { const dia = parseFloat(c.cable_od ?? c.diameter ?? c.OD ?? c.od); return Number.isFinite(dia) ? dia.toFixed(2) : ''; })(),
              parallelCount: Math.max(1, parseInt(c.parallel_count) || 1),
              weight: (parseFloat(c.weight) || '').toString(),
              zone: c.zone || c.cable_zone || 1,
              circuitGroup: c.circuitGroup || c.circuit_group || ''
            }));
          } else {
            cables = [];
          }
          renderCableRows();
          document.getElementById('drawBtn').click();
        } catch (e) {
          console.error('Failed to load trayFillData', e);
        }
        removeItem('trayFillData');
      }

      // Attach help popups for table headers
      document.querySelectorAll('.helpBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          const doc = btn.getAttribute('data-doc');
          if(doc && globalThis.showHelpDoc) showHelpDoc(doc);
          else if(doc) window.open(doc, '_blank');
          else showAlertModal('Help', btn.getAttribute('data-help') || '');
        });
      });

      // --- Tour ---
      const tourBtn = document.getElementById('tour-btn');
      if (tourBtn) {
        tourBtn.addEventListener('click', () => startTour(TRAYFILL_TOUR_STEPS, 'trayFill'));
      }
      if (!hasDoneTour('trayFill')) {
        startTour(TRAYFILL_TOUR_STEPS, 'trayFill');
      }
    });
  