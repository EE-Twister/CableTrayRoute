import "../workflowStatus.js";
import "../site.js";
import "../tableUtils.js";
import * as dataStore from "../dataStore.mjs";

// Panel Schedule page logic
window.addEventListener("DOMContentLoaded", () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal("help-btn", "help-modal", "close-help-btn");
  initNavToggle();

  let saved = true;
  const markSaved = () => {
    saved = true;
  };
  const markUnsaved = () => {
    saved = false;
  };
  window.addEventListener("beforeunload", (e) => {
    if (!saved) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  const NEC_DEMAND_FACTORS = {
    Lighting: 1.25,
    Receptacle: 1.0,
    HVAC: 1.0,
    Motor: 1.25,
    Other: 1.0,
  };
  const loadTypes = Object.keys(NEC_DEMAND_FACTORS);

  function computeDemand(row) {
    const factor = NEC_DEMAND_FACTORS[row.load_type] || 1;
    const connected = parseFloat(row.connected_va) || 0;
    row.demand_factor = factor;
    row.demand_va = connected * factor;
  }

  function updateTotals() {
    const data = table.getData();
    const panels = {};
    data.forEach((r) => {
      computeDemand(r);
      const id = r.panel_id || "Unassigned";
      if (!panels[id]) panels[id] = { connected: 0, demand: 0 };
      panels[id].connected += Number(r.connected_va) || 0;
      panels[id].demand += r.demand_va || 0;
    });
    const totalsDiv = document.getElementById("panel-totals");
    totalsDiv.innerHTML = "";
    Object.entries(panels).forEach(([id, vals]) => {
      const p = document.createElement("p");
      p.textContent = `${id}: Connected ${vals.connected.toFixed(2)} VA, Demand ${vals.demand.toFixed(2)} VA`;
      totalsDiv.appendChild(p);
    });
  }

  const columns = [
    {
      key: "panel_id",
      label: "Panel ID",
      type: "text",
      group: "Identification",
      tooltip: "Panel identifier",
    },
    {
      key: "circuit_number",
      label: "Circuit #",
      type: "number",
      group: "Identification",
      tooltip: "Breaker circuit number",
    },
    {
      key: "poles",
      label: "Poles",
      type: "number",
      group: "Breaker",
      tooltip: "Number of poles",
    },
    {
      key: "breaker_rating",
      label: "Breaker Rating (A)",
      type: "number",
      group: "Breaker",
      tooltip: "Breaker ampere rating",
    },
    {
      key: "load_description",
      label: "Load Description",
      type: "text",
      group: "Load",
      tooltip: "Connected load description",
    },
    {
      key: "load_type",
      label: "Load Type",
      type: "select",
      options: loadTypes,
      group: "Load",
      tooltip: "NEC load category",
    },
    {
      key: "connected_va",
      label: "Connected Load (VA)",
      type: "number",
      group: "Load",
      tooltip: "Connected load in volt-amperes",
    },
    {
      key: "demand_factor",
      label: "Demand Factor",
      type: "number",
      group: "Load",
      tooltip: "Applied demand factor",
    },
    {
      key: "demand_va",
      label: "Demand Load (VA)",
      type: "number",
      group: "Load",
      tooltip: "Demand load in volt-amperes",
    },
    {
      key: "notes",
      label: "Notes",
      type: "text",
      group: "Notes",
      tooltip: "Additional notes",
    },
  ];

  let tableData = dataStore.getPanels();

  const table = TableUtils.createTable({
    tableId: "panelScheduleTable",
    storageKey: TableUtils.STORAGE_KEYS.panelSchedule,
    addRowBtnId: "add-row-btn",
    saveBtnId: "save-schedule-btn",
    loadBtnId: "load-schedule-btn",
    clearFiltersBtnId: "clear-filters-btn",
    exportBtnId: "export-xlsx-btn",
    importInputId: "import-xlsx-input",
    importBtnId: "import-xlsx-btn",
    deleteAllBtnId: "delete-all-btn",
    columns,
    onChange: () => {
      markUnsaved();
      updateTotals();
    },
    onSave: () => {
      markSaved();
      tableData = table.getData();
      dataStore.setPanels(tableData);
      updateTotals();
    },
  });

  table.setData = function (rows) {
    this.tbody.innerHTML = "";
    (rows || []).forEach((r) => this.addRow(r));
    this.updateRowCount?.();
    this.applyFilters?.();
  };

  table.setData(tableData);
  updateTotals();

  table.tbody.addEventListener("input", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const row = {};
    columns.forEach((col, i) => {
      const el = tr.cells[i].querySelector("input,select");
      row[col.key] = el ? el.value : "";
    });
    computeDemand(row);
    tr.querySelector('input[name="demand_factor"]').value = row.demand_factor;
    tr.querySelector('input[name="demand_va"]').value =
      row.demand_va.toFixed(2);
    updateTotals();
  });
});
