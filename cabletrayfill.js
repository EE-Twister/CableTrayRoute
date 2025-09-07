import { getItem, setItem, removeItem, keys as storeKeys } from './dataStore.mjs';

checkPrereqs([{key:'traySchedule',page:'racewayschedule.html',label:'Raceway Schedule'}]);

    document.addEventListener("DOMContentLoaded", function() {
      initSettings();
      initDarkMode();
      initCompactMode();
      initHelpModal('help-btn','helpOverlay','helpClose');
      initNavToggle();
      const dirty = createDirtyTracker();
      const markSaved = () => { dirty.markClean(); };
      const markUnsaved = () => { dirty.markDirty(); };
      // ─────────────────────────────────────────────────────────────
      // (A) Default Configurations (3 conductors + ground) :contentReference[oaicite:0]{index=0}
      // ─────────────────────────────────────────────────────────────
      const cableOptions = [
        { label: "3/C – #8 AWG",     conductors: 3, size: "#8 AWG",     OD: 0.66, weight: 0.33 },
        { label: "3/C – #6 AWG",     conductors: 3, size: "#6 AWG",     OD: 0.74, weight: 0.45 },
        { label: "3/C – #4 AWG",     conductors: 3, size: "#4 AWG",     OD: 0.88, weight: 0.66 },
        { label: "3/C – #2 AWG",     conductors: 3, size: "#2 AWG",     OD: 1.00, weight: 0.96 },
        { label: "3/C – #1 AWG",     conductors: 3, size: "#1 AWG",     OD: 1.13, weight: 1.17 },
        { label: "3/C – 1/0 AWG",    conductors: 3, size: "1/0 AWG",    OD: 1.22, weight: 1.43 },
        { label: "3/C – 2/0 AWG",    conductors: 3, size: "2/0 AWG",    OD: 1.31, weight: 1.72 },
        { label: "3/C – 3/0 AWG",    conductors: 3, size: "3/0 AWG",    OD: 1.42, weight: 2.14 },
        { label: "3/C – 4/0 AWG",    conductors: 3, size: "4/0 AWG",    OD: 1.55, weight: 2.64 },
        { label: "3/C – 250 kcmil",  conductors: 3, size: "250 kcmil",  OD: 1.76, weight: 3.18 },
        { label: "3/C – 350 kcmil",  conductors: 3, size: "350 kcmil",  OD: 1.98, weight: 4.29 },
        { label: "3/C – 500 kcmil",  conductors: 3, size: "500 kcmil",  OD: 2.26, weight: 5.94 },
        { label: "3/C – 750 kcmil",  conductors: 3, size: "750 kcmil",  OD: 2.71, weight: 9.01 },
        { label: "3/C – 1000 kcmil", conductors: 3, size: "1000 kcmil", OD: 3.10, weight: 11.70 }
      ];

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
      let lastType    = "";    // “ladder” or “solid”
      let lastScale   = 20;    // px/in for small view
      let lastZones   = [];    // array of zone labels in order

      // Reference to <tbody> in the cable table
      const cableTbody = document.querySelector("#cableTable tbody");
      const cableTable = document.getElementById('cableTable');
      const headerCells = cableTable.querySelectorAll('thead th');
      const filters = [];
      const filterBtns = [];
      let cables = [];
      headerCells.forEach((th, idx) => {
        if (idx < headerCells.length - 2) {
          const btn = document.createElement('button');
          btn.className = 'filter-btn';
          btn.innerHTML = '\u25BC';
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

      // ─────────────────────────────────────────────────────────────
      // (B) Helper: create one cable‐entry <tr> (Tag / Cable Type / Configuration / OD / Weight / Remove)
      // ─────────────────────────────────────────────────────────────
      function createCableRow(data = {}, idx) {
        const tr = document.createElement("tr");

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
        // (7) OD cell (number; auto‐filled or custom)
        const tdOD = document.createElement("td");
        const inpOD = document.createElement("input");
        inpOD.type = "number";
        inpOD.placeholder = "0.00";
        inpOD.step = "0.01";
        inpOD.style.width = "60px";
        inpOD.readOnly = true;
        inpOD.value = data.od || data.cable_od || "";
        if (inpOD.value) inpOD.readOnly = false;
        inpOD.addEventListener("input", e => { cables[idx].od = e.target.value; });
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
        if (inpWt.value) inpWt.readOnly = false;
        inpWt.addEventListener("input", e => { cables[idx].weight = e.target.value; });
        tdWt.appendChild(inpWt);
        tr.appendChild(tdWt);
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

        // Auto-fill OD/Weight if count & size match a default
        function tryAutofill() {
          const cnt = parseInt(inpCount.value);
          const sz  = inpSize.value.trim();
          const matchIdx = cableOptions.findIndex(o => o.conductors === cnt && o.size === sz);
          if (matchIdx >= 0) {
            inpOD.value    = cableOptions[matchIdx].OD.toFixed(2);
            inpWt.value    = cableOptions[matchIdx].weight.toFixed(2);
            inpOD.readOnly = true;
            inpWt.readOnly = true;
          } else {
            inpOD.value    = "";
            inpWt.value    = "";
            inpOD.readOnly = false;
            inpWt.readOnly = false;
          }
          cables[idx].od = inpOD.value;
          cables[idx].weight = inpWt.value;
        }
        inpCount.addEventListener("input", tryAutofill);
        inpSize.addEventListener("input", tryAutofill);

        return tr;
      }

      function renderCableRows(){
        cableTbody.innerHTML = "";
        cables.forEach((c,i)=>cableTbody.appendChild(createCableRow(c,i)));
        applyFilters();
      }

      // “Add Cable” button → append a blank row
      document.getElementById("addCableBtn").addEventListener("click", () => {
        cables.push({ tag:"", cableType:"", count:"", size:"", rating:"", voltage:"", od:"", weight:"", zone:1, circuitGroup:"" });
        renderCableRows();
      });
      // Start with one empty row
      cables.push({ tag:"", cableType:"", count:"", size:"", rating:"", voltage:"", od:"", weight:"", zone:1, circuitGroup:"" });
      renderCableRows();

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
        return arr.reduce((sum, c) => sum + Math.PI * (c.OD/2)**2, 0);
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
        const cables = [];
        for (const row of rows) {
          const tagVal     = row.children[0].querySelector("input").value.trim();
          const cableType  = row.children[1].querySelector("select").value;
          const countVal   = parseInt(row.children[2].querySelector("input").value);
          const sizeVal     = row.children[3].querySelector("input").value.trim();
          const ratingVal   = parseFloat(row.children[4].querySelector("input").value);
          const voltVal     = parseFloat(row.children[5].querySelector("input").value);
          const odVal       = parseFloat(row.children[6].querySelector("input").value);
          const wtVal       = parseFloat(row.children[7].querySelector("input").value);
          const zoneVal     = parseInt(row.children[8].querySelector("input").value) || 1;
          const groupRaw    = row.children[9].querySelector("input").value;
          const groupVal    = groupRaw ? parseInt(groupRaw) : null;
          const multiVal   = countVal > 1;

          if (!tagVal) {
            alert("ERROR: Every cable row requires a Tag.");
            return;
          }
          if (!cableType) {
            alert(`ERROR: Every cable row requires a Cable Type.`);
            return;
          }
          if (!countVal || !sizeVal) {
            alert(`ERROR: Every cable row requires Conductor count and size.`);
            return;
          }
          if (isNaN(odVal) || isNaN(wtVal)) {
            alert(`ERROR: Every cable row requires numeric OD and Weight.`);
            return;
          }

          cables.push({
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
        if (cables.length === 0) {
          alert("ERROR: Add at least one cable before drawing the tray.");
          return;
        }

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

        // 6) Place cables zone by zone
        const zoneIds = [...new Set(placementCables.map(c => c.zone))].sort((a,b) => a - b);
        let placedAll = [];
        let barrierLines = [];
        let offset = 0;
        let zoneHTML = "";
        let voltageWarning = "";
        let zoneNames = [];

        // First pass: determine natural width of each zone
        const zoneInfo = [];
        let totalWidthNeeded = 0;
        zoneIds.forEach(zid => {
          const gCables = placementCables.filter(c => c.zone === zid);
          const measure = placeZone(gCables, trayW, spacingEnabled);
          const origCables = cables.filter(c => c.zone === zid);
          zoneInfo.push({ zid, cables: gCables, orig: origCables, width: measure.widthUsed });
          totalWidthNeeded += measure.widthUsed;

          const volts   = origCables.map(c => c.voltage).filter(v => !isNaN(v));
          const ratings = origCables.map(c => c.rating).filter(v => !isNaN(v));
          if (volts.length > 0 && ratings.length > 0) {
            const maxV = Math.max(...volts);
            const minR = Math.min(...ratings);
            if (maxV > minR + 1e-6) {
              voltageWarning += `
                <p class="warning">
                  WARNING: In Zone ${zid}, operating voltage (${maxV.toFixed(0)} V) exceeds the lowest cable rating (${minR.toFixed(0)} V).
                </p>`;
            }
          }
        });

        // Adjust recommended width based on actual layout requirement
        const layoutWidth = standardWidths.find(w => w >= totalWidthNeeded) || null;
        if (!recommendedWidth || (layoutWidth && layoutWidth > recommendedWidth)) {
          recommendedWidth = layoutWidth;
        }

        let scaleFactor = totalWidthNeeded > trayW ? trayW / totalWidthNeeded : 1;

        // Helper to place all zones using a given scale factor
        function layoutZones(scale) {
          let off = 0;
          let html = "";
          const lines = [];
          const names = [];
          const placed = [];
          zoneInfo.forEach(info => {
            const widthLimit = info.width * scale;
            const result = placeZone(info.cables, widthLimit, spacingEnabled);
            const widthUsed = result.widthUsed;
            const { large: origLarge, small: origSmall } = splitLargeSmall(info.orig);
            if (result.largeCount > 0 && result.smallCount > 0) {
              const areaLarge = sumAreas(origLarge);
              const areaSmall = sumAreas(origSmall);
              const widthLarge = result.barrierX;
              const widthSmall = widthUsed - result.barrierX;
              const fillLarge = widthLarge > 0 ? Math.min(100, (areaLarge / (widthLarge * trayD)) * 100) : 0;
              const fillSmall = widthSmall > 0 ? Math.min(100, (areaSmall / (widthSmall * trayD)) * 100) : 0;
              html += `<p><strong>Zone ${info.zid}.1 Fill %:</strong> ${fillLarge.toFixed(0)} %</p>`;
              html += `<p><strong>Zone ${info.zid}.2 Fill %:</strong> ${fillSmall.toFixed(0)} %</p>`;
            } else {
              const areaAll = sumAreas(info.orig);
              const fillP = widthUsed > 0 ? Math.min(100, (areaAll / (widthUsed * trayD)) * 100) : 0;
              html += `<p><strong>Zone ${info.zid} Fill %:</strong> ${fillP.toFixed(0)} %</p>`;
            }
            if (off > 0) lines.push(off);
            if (result.largeCount > 0 && result.smallCount > 0) {
              lines.push(off + result.barrierX);
              names.push(`${info.zid}.1`);
              names.push(`${info.zid}.2`);
            } else {
              names.push(`${info.zid}`);
            }
            result.placed.forEach(p => { p.x += off; placed.push(p); });
            off += widthUsed;
          });
          return { placed, lines, names, width: off, html };
        }

        // Try packing with iterative scaling until width fits within the tray
        let layout = layoutZones(scaleFactor);
        for (let i = 0; i < 8 && layout.width > trayW + 1e-6; i++) {
          scaleFactor *= trayW / layout.width;
          layout = layoutZones(scaleFactor);
        }

        placedAll    = layout.placed;
        barrierLines = layout.lines;
        zoneNames    = layout.names;
        offset       = layout.width;
        zoneHTML    = layout.html;

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
        const overallFill = (sumSmallArea / (trayW * trayD)) * 100;
        if (allCS) {
          if (trayType === "ladder" && overallFill > 50) {
            csWarning = `
              <p class="nfpaWarn">
                NFPA 70 392.22(A)(2) WARNING:<br>
                All cables are Control/Signal and Fill % (${overallFill.toFixed(0)} %) exceeds 50 % for Ladder tray.
              </p>`;
          } else if (trayType === "solid" && overallFill > 40) {
            csWarning = `
              <p class="nfpaWarn">
                NFPA 70 392.22(A)(4) WARNING:<br>
                All cables are Control/Signal and Fill % (${overallFill.toFixed(0)} %) exceeds 40 % for Solid Bottom tray.
              </p>`;
          }
        }

        // 10) Summarize metrics + total weight
        const totalWeight = cables.reduce((sum, c) => sum + c.weight, 0);
        let resultsHTML = `
          <p>
            <strong>Using Tray Width:</strong> ${trayW}"<br>
            <strong>Tray Depth:</strong> ${trayD}"<br>
            <strong>Type:</strong> ${trayType === "ladder" ? "Ladder (50 % fill)" : "Solid Bottom (40 % fill)"}
          </p>

          <p>
            <strong>Stackable Cables Cross-Sectional Area:</strong>
            ${sumSmallArea.toFixed(2)} in²
          </p>
          ${zoneHTML}
          <p>
            <strong>Non-Stackable Cables Sum of Diameters:</strong>
            ${sumLargeDiam.toFixed(2)} in
          </p>

          <p>
          <strong>Total Cable Weight:</strong> ${totalWeight.toFixed(2)} lbs/ft
        </p>
        ${nfpaWarning}
        ${csWarning}
        ${singleWarning}
        ${groupWarning}
        ${voltageWarning}
      `;

        // Store for “Expand Image”
        lastPlaced   = placedAll;
        lastBarriers = barrierLines;
        lastTrayW    = trayW;
        lastTrayD    = trayD;
        lastType     = trayType;
        lastScale    = 20;  // px/in for small view
        lastZones    = zoneNames.slice();

        // 14) Detect overflow horizontally/vertically
        let overflowHoriz = false;
        let overflowVert  = false;
        placedAll.forEach(p => {
          if (p.x + p.r > trayW + 1e-6) overflowHoriz = true;
          if (p.y + p.r > trayD + 1e-6) overflowVert  = true;
        });

        // 15) Draw the SVG (20 px/in) but with extra rows for “name” and “dimension”
        const scale = lastScale;
        const nameRowPx    = 20;   // 20px for the tray name
        const dimRowPx     = 24;   // more room for dimension text
        const trayRowPx    = trayD * scale;
        const totalSvgH    = nameRowPx + dimRowPx + trayRowPx;
        const totalSvgW    = trayW * scale;
        const nameTextY    = 14;   // Y‐coordinate to place the tray name text
        const dimLineY     = nameRowPx + 8;         // mid‐height of dimension row
        const trayTopY     = nameRowPx + dimRowPx;  // Y‐coordinate of tray top edge

        let svg = `
          <svg
            width="${totalSvgW}"
            height="${totalSvgH}"
            style="background:#f9f9f9; border:1px solid #999;"
          >
        `;

        // (A) Draw the tray name (if provided)
        if (trayName) {
          svg += `
            <text
              x="${(totalSvgW/2).toFixed(2)}"
              y="${nameTextY}"
              font-size="16px"
              text-anchor="middle"
              fill="#000"
              font-family="Arial, sans-serif"
            >${trayName}</text>
          `;
        }

        // (B) Draw separation barriers
        barrierLines.forEach(x => {
          const xp = (x * scale).toFixed(2);
          svg += `
            <line
              x1="${xp}" y1="${trayTopY}"
              x2="${xp}" y2="${(trayTopY + trayRowPx).toFixed(2)}"
              stroke="#aa3300"
              stroke-width="2"
              stroke-dasharray="4 2"
            />
          `;
        });

        // (B2) Dimension lines for each zone
        const zoneBounds = [0, ...barrierLines, trayW];
        for (let i = 0; i < zoneBounds.length - 1; i++) {
          const xs = zoneBounds[i] * scale;
          const xe = zoneBounds[i+1] * scale;
          const mid = (xs + xe) / 2;
          const wText = (zoneBounds[i+1] - zoneBounds[i]).toFixed(1) + '"';
          const zoneLabel = zoneNames[i] ? `Zone ${zoneNames[i]}` : 'Zone Unknown';
          svg += `
            <line x1="${xs.toFixed(2)}" y1="${dimLineY}" x2="${xe.toFixed(2)}" y2="${dimLineY}" stroke="#000" stroke-width="1" />
            <line x1="${xs.toFixed(2)}" y1="${dimLineY-4}" x2="${xs.toFixed(2)}" y2="${dimLineY+4}" stroke="#000" stroke-width="1" />
            <line x1="${xe.toFixed(2)}" y1="${dimLineY-4}" x2="${xe.toFixed(2)}" y2="${dimLineY+4}" stroke="#000" stroke-width="1" />
            <text x="${mid.toFixed(2)}" y="${dimLineY-6}" font-size="10px" text-anchor="middle" font-family="Arial, sans-serif">${zoneLabel}</text>
            <text x="${mid.toFixed(2)}" y="${dimLineY+10}" font-size="10px" text-anchor="middle" font-family="Arial, sans-serif">${wText}</text>
          `;
        }

        // (C) Draw the tray rectangle (starts at trayTopY)
        svg += `
          <rect
            x="0" y="${trayTopY}"
            width="${(trayW * scale).toFixed(2)}"
            height="${(trayD * scale).toFixed(2)}"
            fill="none"
            stroke="#333"
            stroke-width="2"
          />
        `;

        // (E) Draw each circle (all shifted down by trayTopY, and Y‐flipped inside the tray)
        placedAll.forEach(p => {
          if (p.isGroup && p.members && p.offsets) {
            const gcx = p.x * scale;
            const gcy = trayTopY + ((trayD - p.y) * scale);
            const gr  = p.r * scale;
            svg += `
              <circle
                cx="${gcx.toFixed(2)}"
                cy="${gcy.toFixed(2)}"
                r="${gr.toFixed(2)}"
                fill="none"
                stroke="#0066aa"
                stroke-width="1"
                stroke-dasharray="4 2"
              />
            `;
            p.members.forEach((m, idx) => {
              const mx = (p.x + p.offsets[idx].x) * scale;
              const my = trayTopY + ((trayD - (p.y + p.offsets[idx].y)) * scale);
              const mr = (m.OD / 2) * scale;
              svg += `
                <circle
                  cx="${mx.toFixed(2)}"
                  cy="${my.toFixed(2)}"
                  r="${mr.toFixed(2)}"
                  fill="#66ccff"
                  stroke="#0066aa"
                  stroke-width="1"
                >
                  <title>
Cable Tag: ${m.tag}
Cable Type: ${m.cableType}
Conductors: ${m.count}
Size: ${m.size}
OD: ${m.OD.toFixed(2)}″
Wt: ${m.weight.toFixed(2)} lbs/ft
                  </title>
                </circle>
              `;
            });
          } else {
            const cx = p.x * scale;
            const cy = trayTopY + ((trayD - p.y) * scale);
            const r  = p.r * scale;
            svg += `
              <circle
                cx="${cx.toFixed(2)}"
                cy="${cy.toFixed(2)}"
                r="${r.toFixed(2)}"
                fill="#66ccff"
                stroke="#0066aa"
                stroke-width="1"
              >
                <title>
Cable Tag: ${p.tag}
Cable Type: ${p.cableType}
Conductors: ${p.count}
Size: ${p.size}
OD: ${p.OD.toFixed(2)}″
Wt: ${p.weight.toFixed(2)} lbs/ft
                </title>
              </circle>
            `;
          }
        });

        svg += `</svg>`;
        document.getElementById("svgContainer").innerHTML = svg;

        // 16) Show overflow warnings & recommendations
        if (overflowHoriz || overflowVert) {
          if (overflowHoriz) {
            if (recommendedWidth && recommendedWidth > trayW) {
              resultsHTML += `
                <p class="warning">
                  WARNING: Some cables extend beyond the tray width (${trayW}").
                </p>
                <p class="recommend">
                  Recommend larger standard width: ${recommendedWidth}" 
                </p>`;
            } else {
              resultsHTML += `
                <p class="warning">
                  WARNING: Some cables extend beyond the tray width (${trayW}").
                </p>
                <p class="recommend">
                  No larger standard width can accommodate all cables.
                </p>`;
            }
          }
          if (overflowVert) {
            const neededDepth = Math.max(...placedAll.map(p => p.y + p.r));
            resultsHTML += `
              <p class="warning">
                WARNING: Some cables extend above the tray depth (${trayD}").
              </p>
              <p class="recommend">
                Recommend increasing tray depth to at least ${neededDepth.toFixed(2)}".
              </p>`;
          }
        }
        document.getElementById("results").innerHTML = resultsHTML;
      });

      // ─────────────────────────────────────────────────────────────
      // (F) “Expand Image” button: popup at 160 px/in (double the 80 px/in)
      //           (We apply the same “name + dimension + tray” logic, but with a larger scale.)
      // ─────────────────────────────────────────────────────────────
      document.getElementById("expandBtn").addEventListener("click", () => {
        if (!lastPlaced) {
          alert("Please click “Draw Tray” first, then Expand.");
          return;
        }
        const bigScale = 160;  // 160 px/in for high resolution
        const trayW = lastTrayW, trayD = lastTrayD;
        const trayName = document.getElementById("trayName").value.trim();
        const nameRowPx    = 40;   // give more room for big text and spacing
        const dimRowPx     = 36;   // more room for dimension text
        const trayRowPx    = trayD * bigScale;
        const totalSvgH    = nameRowPx + dimRowPx + trayRowPx;
        const totalSvgW    = trayW * bigScale;
        const nameTextY    = 24;
        const dimLineY     = nameRowPx + 12;    
        const trayTopY     = nameRowPx + dimRowPx;

        let svg = `
          <svg
            width="${totalSvgW}"
            height="${totalSvgH}"
            style="background:#f9f9f9; border:1px solid #333;"
          >
        `;

        // (A) Tray Name
        if (trayName) {
          svg += `
            <text
              x="${(totalSvgW/2).toFixed(2)}"
              y="${nameTextY}"
              font-size="24px"
              text-anchor="middle"
              fill="#000"
              font-family="Arial, sans-serif"
            >${trayName}</text>
          `;
        }

        // (B) Draw separation barriers
        lastBarriers.forEach(x => {
          const xp = (x * bigScale).toFixed(2);
          svg += `
            <line
              x1="${xp}" y1="${trayTopY}"
              x2="${xp}" y2="${(trayTopY + trayRowPx).toFixed(2)}"
              stroke="#aa3300"
              stroke-width="4"
              stroke-dasharray="12 6"
            />
          `;
        });

        // (B2) Dimension lines for each zone
        const bigZone = [0, ...lastBarriers, trayW];
        for (let i = 0; i < bigZone.length - 1; i++) {
          const xs = bigZone[i] * bigScale;
          const xe = bigZone[i+1] * bigScale;
          const mid = (xs + xe) / 2;
          const wText = (bigZone[i+1] - bigZone[i]).toFixed(1) + '"';
          const zoneLabel = lastZones[i] ? `Zone ${lastZones[i]}` : 'Zone Unknown';
          svg += `
            <line x1="${xs.toFixed(2)}" y1="${dimLineY}" x2="${xe.toFixed(2)}" y2="${dimLineY}" stroke="#000" stroke-width="2" />
            <line x1="${xs.toFixed(2)}" y1="${dimLineY-8}" x2="${xs.toFixed(2)}" y2="${dimLineY+8}" stroke="#000" stroke-width="2" />
            <line x1="${xe.toFixed(2)}" y1="${dimLineY-8}" x2="${xe.toFixed(2)}" y2="${dimLineY+8}" stroke="#000" stroke-width="2" />
            <text x="${mid.toFixed(2)}" y="${dimLineY-12}" font-size="18px" text-anchor="middle" font-family="Arial, sans-serif">${zoneLabel}</text>
            <text x="${mid.toFixed(2)}" y="${dimLineY+16}" font-size="18px" text-anchor="middle" font-family="Arial, sans-serif">${wText}</text>
          `;
        }

        // (C) Draw the tray rectangle
        svg += `
          <rect
            x="0" y="${trayTopY}"
            width="${(trayW * bigScale).toFixed(2)}"
            height="${(trayD * bigScale).toFixed(2)}"
            fill="none"
            stroke="#333"
            stroke-width="4"
          />
        `;

        // (D) Draw each circle
        lastPlaced.forEach(p => {
          if (p.isGroup && p.members && p.offsets) {
            const gcx = p.x * bigScale;
            const gcy = trayTopY + ((trayD - p.y) * bigScale);
            const gr  = p.r * bigScale;
            svg += `
              <circle
                cx="${gcx.toFixed(2)}"
                cy="${gcy.toFixed(2)}"
                r="${gr.toFixed(2)}"
                fill="none"
                stroke="#0066aa"
                stroke-width="2"
                stroke-dasharray="8 4"
              />
            `;
            p.members.forEach((m, idx) => {
              const mx = (p.x + p.offsets[idx].x) * bigScale;
              const my = trayTopY + ((trayD - (p.y + p.offsets[idx].y)) * bigScale);
              const mr = (m.OD / 2) * bigScale;
              svg += `
                <circle
                  cx="${mx.toFixed(2)}"
                  cy="${my.toFixed(2)}"
                  r="${mr.toFixed(2)}"
                  fill="#66ccff"
                  stroke="#0066aa"
                  stroke-width="2"
                >
                  <title>
Cable Tag: ${m.tag}
Cable Type: ${m.cableType}
Conductors: ${m.count}
Size: ${m.size}
OD: ${m.OD.toFixed(2)}″
Wt: ${m.weight.toFixed(2)} lbs/ft
                  </title>
                </circle>
              `;

              const fontSize = Math.min(mr * 0.15, 20);
              const lines = [
                `${m.tag}`,
                `${m.cableType}`,
                `${m.count}C ${m.size}`,
                `OD: ${m.OD.toFixed(2)}″`,
                `Wt: ${m.weight.toFixed(2)}`
              ];
              const lineHeight = fontSize * 1.1;
              const textBlockHeight = lines.length * lineHeight;
              let yStart = my - textBlockHeight / 2 + lineHeight / 2;

              lines.forEach((ln, idx2) => {
                svg += `
                  <text
                    x="${mx.toFixed(2)}"
                    y="${(yStart + idx2 * lineHeight).toFixed(2)}"
                    font-size="${fontSize}px"
                    text-anchor="middle"
                    fill="#000"
                    stroke="none"
                    font-family="Arial, sans-serif"
                    pointer-events="none"
                  >
                    ${ln}
                  </text>
                `;
              });
            });
          } else {
            const cx = p.x * bigScale;
            const cy = trayTopY + ((trayD - p.y) * bigScale);
            const r  = p.r * bigScale;
            svg += `
              <circle
                cx="${cx.toFixed(2)}"
                cy="${cy.toFixed(2)}"
                r="${r.toFixed(2)}"
                fill="#66ccff"
                stroke="#0066aa"
                stroke-width="2"
              />
            `;

            // Insert multiline <text> inside each circle
            const fontSize = Math.min(r * 0.15, 20);
            const lines = [
              `${p.tag}`,
              `${p.cableType}`,
              `${p.count}C ${p.size}`,
              `OD: ${p.OD.toFixed(2)}″`,
              `Wt: ${p.weight.toFixed(2)}`
            ];
            const lineHeight = fontSize * 1.1;
            const textBlockHeight = lines.length * lineHeight;
            let yStart = cy - textBlockHeight / 2 + lineHeight / 2;

            lines.forEach((ln, idx) => {
              svg += `
                <text
                  x="${cx.toFixed(2)}"
                  y="${(yStart + idx * lineHeight).toFixed(2)}"
                  font-size="${fontSize}px"
                  text-anchor="middle"
                  fill="#000"
                  stroke="none"
                  font-family="Arial, sans-serif"
                  pointer-events="none"
                >
                  ${ln}
                </text>
              `;
            });
          }
        });

        svg += `</svg>`;

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
          alert("No expanded SVG found to copy.");
          return;
        }
        const svgText = svgElem.outerHTML;
        navigator.clipboard.writeText(svgText).then(() => {
          alert("SVG markup copied to clipboard!");
        }).catch(err => {
          alert("Error copying SVG: " + err);
        });
      });

      // ─────────────────────────────────────────────────────────────
      // (H) Print SVG in new window
      // ─────────────────────────────────────────────────────────────
      document.getElementById("printBtn").addEventListener("click", () => {
        const container = document.getElementById("expandedSVG");
        const svgElem = container.querySelector("svg");
        if (!svgElem) {
          alert("No expanded SVG found to print.");
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
          alert("No expanded SVG found to copy as PNG.");
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
              alert("Failed to create PNG blob.");
              URL.revokeObjectURL(url);
              return;
            }
            const clipboardItem = new ClipboardItem({ "image/png": pngBlob });
            navigator.clipboard.write([clipboardItem]).then(() => {
              alert("PNG copied to clipboard!");
              URL.revokeObjectURL(url);
            }).catch(err => {
              alert("Error copying PNG: " + err);
              URL.revokeObjectURL(url);
            });
          }, "image/png");
        };
        img.onerror = () => {
          alert("Failed to load SVG into image for PNG conversion.");
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
      // (K) Excel Export: gather table → create workbook → download
      // ─────────────────────────────────────────────────────────────
      document.getElementById("exportExcelBtn").addEventListener("click", () => {
        const rows = Array.from(cableTbody.querySelectorAll("tr"));
        if (rows.length === 0) {
          alert("No cables to export.");
          return;
        }
        // Build 2D array: header + each row’s data
        const data = [[
          "Tag",
          "Cable Type",
          "Conductors",
          "Conductor Size",
          "Cable Rating (V)",
          "Operating Voltage (V)",
          "OD",
          "Weight",
          "Zone",
          "Circuit Group"
        ]];
        rows.forEach(row => {
          const tag       = row.children[0].querySelector("input").value.trim();
          const cableType = row.children[1].querySelector("select").value;
          const count     = row.children[2].querySelector("input").value.trim();
          const size      = row.children[3].querySelector("input").value.trim();
          const rating    = row.children[4].querySelector("input").value.trim();
          const voltage   = row.children[5].querySelector("input").value.trim();
          const od        = row.children[6].querySelector("input").value.trim();
          const weight    = row.children[7].querySelector("input").value.trim();
          const zone      = row.children[8].querySelector("input").value.trim();
          const group     = row.children[9].querySelector("input").value.trim();
          data.push([tag, cableType, count, size, rating, voltage, od, weight, zone, group]);
        });
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Cables");
        XLSX.writeFile(wb, "CableList.xlsx");
      });

      // ─────────────────────────────────────────────────────────────
      // (L) Excel Import: file‐picker → parse → populate table
      // ─────────────────────────────────────────────────────────────
      document.getElementById("importExcelBtn").addEventListener("click", () => {
        document.getElementById("importExcelInput").click();
      });
      document.getElementById("importExcelInput").addEventListener("change", (evt) => {
        const file = evt.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = e.target.result;
          const wb = XLSX.read(data, { type: "binary" });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const jsonArr = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
          if (jsonArr.length === 0) {
            alert("Excel sheet is empty.");
            return;
          }
          // Expect columns: Tag, Cable Type, Conductors, Conductor Size, Cable Rating (V), Operating Voltage (V), OD, Weight, Zone, Circuit Group
          cableTbody.innerHTML = "";
          jsonArr.forEach((obj, idx) => {
            const {
              Tag,
              "Cable Type": CableType,
              Conductors,
              "Conductor Size": Size,
              "Cable Rating (V)": Rating,
              "Operating Voltage (V)": Voltage,
              OD,
              Weight,
              Zone,
              "Circuit Group": CircuitGroup
            } = obj;
            if (
              typeof Tag === "undefined" ||
              typeof CableType === "undefined" ||
              typeof Conductors === "undefined" ||
              typeof Size === "undefined" ||
              typeof Rating === "undefined" ||
              typeof Voltage === "undefined" ||
              typeof OD === "undefined" ||
              typeof Weight === "undefined"
            ) {
              alert(`Row ${idx + 2} missing one of: Tag, Cable Type, Conductors, Conductor Size, Cable Rating (V), Operating Voltage (V), OD, Weight.`);
              return;
            }
            const newRow = createCableRow();
            newRow.children[0].querySelector("input").value = Tag;
            // Set the "Cable Type" dropdown
            newRow.children[1].querySelector("select").value = CableType;
            // Set count and size
            newRow.children[2].querySelector("input").value = Conductors;
            newRow.children[3].querySelector("input").value = Size;
            newRow.children[4].querySelector("input").value = Rating;
            newRow.children[5].querySelector("input").value = Voltage;
            // Trigger autofill
            const sizeInput = newRow.children[3].querySelector("input");
            sizeInput.dispatchEvent(new Event("input"));
            // If not matched a default, fill custom OD/Weight
            const odInput = newRow.children[6].querySelector("input");
            const wtInput = newRow.children[7].querySelector("input");
            const zoneInput = newRow.children[8].querySelector("input");
            const groupInput = newRow.children[9].querySelector("input");
            if (cableOptions.findIndex(o => o.conductors === parseInt(Conductors) && o.size === Size) < 0) {
              odInput.value = parseFloat(OD).toFixed(2);
              wtInput.value = parseFloat(Weight).toFixed(2);
              odInput.readOnly = false;
              wtInput.readOnly = false;
            }
            zoneInput.value = Zone || 1;
            groupInput.value = obj["Circuit Group"] || "";
            cableTbody.appendChild(newRow);
          });
          applyFilters();
          alert("Excel imported. Correct any unrecognized conductor details if needed.");
          document.getElementById("importExcelInput").value = "";
        };
        reader.readAsBinaryString(file);
      });

      // (L2) Import Help button
      document.getElementById("importHelpBtn").addEventListener("click", () => {
        alert(
          "Import Instructions:\n" +
          "1. Click 'Export Excel' to download a template.\n" +
            "2. Fill in Tag, Cable Type, Conductors, Conductor Size, Cable Rating (V), Operating Voltage (V), OD, Weight, Zone, and Circuit Group.\n" +
          "3. Save the file then choose it with 'Import Excel'."
        );
      });


      // ─────────────────────────────────────────────────────────────
      // (M) Profile Management (localStorage)
      // ─────────────────────────────────────────────────────────────
      const profileList = document.getElementById("profileList");
      function refreshProfileList() {
        profileList.innerHTML = "";
        const keys = storeKeys().filter(k => k.startsWith("trayProfile_"));
        if (keys.length === 0) {
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
        keys.sort();
        keys.forEach(key => {
          const profileName = key.replace("trayProfile_", "");
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
            alert("All rows must have Tag, Cable Type, conductor count/size, OD, and Weight before saving.");
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
        try {
          setItem("trayProfile_" + name, arr);
          alert(`Profile "${name}" saved.`);
          refreshProfileList();
        } catch (e) {
          alert("Error saving profile: " + e.message);
        }
      });

      // Load profile
      document.getElementById("loadProfileBtn").addEventListener("click", () => {
        const profileName = profileList.value;
        if (!profileName) {
          alert("Select a profile to load.");
          return;
        }
        const data = getItem("trayProfile_" + profileName);
        if (!data) {
          alert(`Profile "${profileName}" not found.`);
          refreshProfileList();
          return;
        }
        const arr = data;
        cableTbody.innerHTML = "";
        arr.forEach(cable => {
          const newRow = createCableRow();
          newRow.children[0].querySelector("input").value = cable.tag;
          newRow.children[1].querySelector("select").value = cable.cableType;
          newRow.children[2].querySelector("input").value = cable.count;
          newRow.children[3].querySelector("input").value = cable.size;
          newRow.children[4].querySelector("input").value = cable.rating || "";
          newRow.children[5].querySelector("input").value = cable.voltage || "";
          const sizeInput = newRow.children[3].querySelector("input");
          sizeInput.dispatchEvent(new Event("input"));
          const odInput = newRow.children[6].querySelector("input");
          const wtInput = newRow.children[7].querySelector("input");
          const zoneInput = newRow.children[8].querySelector("input");
          const groupInput = newRow.children[9].querySelector("input");
          if (cableOptions.findIndex(o => o.conductors === cable.count && o.size === cable.size) < 0) {
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
        alert(`Profile "${profileName}" loaded.`);
      });

      // Delete profile
      document.getElementById("deleteProfileBtn").addEventListener("click", () => {
        const profileName = profileList.value;
        if (!profileName) {
          alert("Select a profile to delete.");
          return;
        }
        if (!confirm(`Delete profile "${profileName}"?`)) return;
        removeItem("trayProfile_" + profileName);
        alert(`Profile "${profileName}" deleted.`);
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
          if (Array.isArray(storedCables)) {
            cables = storedCables.map(c => ({
              tag: c.name || c.tag || '',
              cableType: c.cable_type || '',
              count: c.conductors || c.count || '',
              size: c.conductor_size || c.size || '',
              rating: c.rating || '',
              voltage: c.voltage || '',
              od: (() => { const dia = parseFloat(c.cable_od ?? c.diameter ?? c.OD ?? c.od); return Number.isFinite(dia) ? dia.toFixed(2) : ''; })(),
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
          else alert(btn.getAttribute('data-help'));
        });
      });
    });
  