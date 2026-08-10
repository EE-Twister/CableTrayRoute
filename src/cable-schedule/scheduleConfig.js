const INSULATION_TEMP_LIMIT = {
  THHN: 90,
  XLPE: 90,
  PVC: 75,
  XHHW: 90,
  "XHHW-2": 90,
  "THWN-2": 90,
  THW: 75,
  THWN: 75,
  TW: 60,
  UF: 60
};

export const CONDUCTOR_SIZES = ["#22 AWG", "#20 AWG", "#18 AWG", "#16 AWG", "#14 AWG", "#12 AWG", "#10 AWG", "#8 AWG", "#6 AWG", "#4 AWG", "#3 AWG", "#2 AWG", "#1 AWG", "1/0 AWG", "2/0 AWG", "3/0 AWG", "4/0 AWG", "250 kcmil", "300 kcmil", "350 kcmil", "400 kcmil", "500 kcmil", "600 kcmil", "750 kcmil", "1000 kcmil"];
export const CABLE_TYPES = ["Power", "Control", "Signal", "Data", "Fiber"];
const CONDUCTOR_MATERIALS = ["Copper", "Aluminum"];
const INSULATION_RATINGS = ["60", "75", "90"];
const TERMINAL_TEMP_RATINGS = ["", "60", "75", "90"];
const SHIELDING_OPTIONS = ["", "Lead", "Copper Tape"];
const INSTALL_METHODS = ["Conduit", "Tray", "Direct Buried"];

export const BASIC_ENTRY_KEYS = new Set([
  "tag", "service_description", "from_tag", "to_tag", "raceway_ids", "panel_id", "circuit_number",
  "cable_type", "conductors", "conductor_size", "conductor_material", "ground_size", "ground_material",
  "install_method", "insulation_type", "insulation_rating", "parallel_count", "operating_voltage", "est_load",
  "ocpd_rating", "terminal_temp_rating", "length", "notes"
]);

export const DEFAULT_PRESET = "entry";
export const MOBILE_ENTRY_KEYS = ["tag", "from_tag", "to_tag", "conductor_size", "length"];
export const FIELD_HELP_TEXT = Object.freeze({
  tag: "Use the project cable numbering standard. Auto tag settings can prefill this value.",
  raceway_ids: "Required before routing. Options come from the Raceway Schedule.",
  conductor_size: "Required for tray fill, ampacity, and voltage drop calculations.",
  ground_size: "Used with OCPD Rating by Design Rule Checker for selected NEC 250.122 EGC screening.",
  ocpd_rating: "Used with EGC Size and Conductor Size by Design Rule Checker for selected NEC 240.4 and 250.122 screening.",
  terminal_temp_rating: "Optional NEC 110.14(C) termination rating. Leave blank to infer 60C through 100A equipment and 75C above 100A.",
  length: "Required for voltage drop and route quantity checks.",
  operating_voltage: "Used with load current for electrical sizing and review reports.",
  est_load: "Estimated operating current for sizing checks.",
  start_x: "Used only when routing from explicit start coordinates.",
  end_x: "Used only when routing to explicit end coordinates."
});

export const STARTER_CABLE_TYPES = [
  {
    label: 'Southwire SIMpull THHN/THWN-2 Copper 12 AWG',
    manufacturer: 'Southwire',
    model: 'SPEC10000',
    catalog_evidence_status: 'source_verified',
    catalog_source: 'Southwire SIMpull THHN/THWN-2 Copper manufacturer product page',
    catalog_last_verified: '2026-07-31',
    datasheet_url: 'https://www.southwire.com/wire-cable/building-wire/simpull-sup-sup-thhn-thwn-2-copper/p/SPEC10000',
    cable_type: 'Power',
    conductors: 1,
    conductor_size: '#12 AWG',
    conductor_material: 'Copper',
    install_method: 'Conduit',
    insulation_type: 'THHN',
    insulation_rating: '90',
    terminal_temp_rating: '60',
    cable_rating: 600,
    shielding_jacket: ''
  },
  {
    label: '600V Power',
    cable_type: 'Power',
    conductors: 3,
    conductor_size: '#12 AWG',
    conductor_material: 'Copper',
    ground_size: '#12 AWG',
    ground_material: 'Copper',
    install_method: 'Tray',
    insulation_type: 'THHN',
    insulation_rating: '90',
    terminal_temp_rating: '60',
    ocpd_rating: 20,
    cable_rating: 600,
    shielding_jacket: ''
  },
  {
    label: 'Control Cable',
    cable_type: 'Control',
    conductors: 7,
    conductor_size: '#14 AWG',
    conductor_material: 'Copper',
    install_method: 'Tray',
    insulation_type: 'PVC',
    insulation_rating: '75',
    cable_rating: 600,
    shielding_jacket: ''
  },
  {
    label: 'Instrument Pair',
    cable_type: 'Signal',
    conductors: 2,
    conductor_size: '#18 AWG',
    conductor_material: 'Copper',
    install_method: 'Tray',
    insulation_type: 'XLPE',
    insulation_rating: '90',
    cable_rating: 300,
    shielding_jacket: 'Copper Tape'
  },
  {
    label: 'Ethernet',
    cable_type: 'Data',
    conductors: 8,
    conductor_size: '#24 AWG',
    conductor_material: 'Copper',
    install_method: 'Tray',
    insulation_type: 'PVC',
    insulation_rating: '60',
    cable_rating: 300,
    shielding_jacket: ''
  },
  {
    label: 'Fiber',
    cable_type: 'Fiber',
    conductors: 12,
    conductor_size: '#22 AWG',
    conductor_material: 'Copper',
    install_method: 'Tray',
    insulation_type: 'PVC',
    insulation_rating: '60',
    cable_rating: 300,
    shielding_jacket: ''
  }
];


export function createCableScheduleColumns({ getEquipmentOptions, getRacewayOptions, getPanelOptions }) {
  const columns = [
    { key: "tag", label: "Tag", type: "text", group: "Identification", tooltip: "Unique identifier for the cable", sticky: "left", placeholder: "CBL-001" },
    { key: "service_description", label: "Service Description", type: "text", group: "Identification", tooltip: "Description of the cable's purpose" },
    { key: "from_tag", label: "From Tag", type: "text", datalist: () => getEquipmentOptions(), group: "Terminations", tooltip: "Starting equipment or location tag", sticky: "left" },
    { key: "to_tag", label: "To Tag", type: "text", datalist: () => getEquipmentOptions(), group: "Terminations", tooltip: "Ending equipment or location tag", sticky: "left" },
    { key: "raceway_ids", label: "Raceway(s)", type: "select", multiple: true, size: 5, options: () => getRacewayOptions(), group: "Terminations", tooltip: "Select raceway IDs from Raceway Schedule" },
    { key: "panel_id", label: "Panel ID", type: "text", datalist: () => getPanelOptions(), group: "Terminations", tooltip: "Panel identifier from Panel Schedule" },
    { key: "circuit_number", label: "Circuit #", type: "number", group: "Terminations", tooltip: "Circuit number from Panel Schedule" },
    ...["start_x", "start_y", "start_z", "end_x", "end_y", "end_z"].map(key => ({ key, label: `${key.startsWith("start") ? "Start" : "End"} ${key.at(-1).toUpperCase()}`, type: "number", group: "Routing Details", tooltip: `${key.at(-1).toUpperCase()}-coordinate of cable ${key.startsWith("start") ? "start" : "end"}` })),
    { key: "zone", label: "Cable Zone", type: "number", group: "Routing Details", tooltip: "Routing zone or area number" },
    { key: "manual_path", label: "Manual Path", type: "text", datalist: () => getRacewayOptions(), group: "Routing Details", tooltip: "Tray IDs separated by > to override route" },
    { key: "circuit_group", label: "Circuit Group", type: "number", group: "Routing Details", tooltip: "Circuit grouping number" },
    { key: "allowed_cable_group", label: "Allowed Group", type: "text", group: "Routing Details", tooltip: "Permitted cable grouping identifier" },
    { key: "manufacturer", label: "Manufacturer", type: "text", group: "Manufacturer Details", tooltip: "Manufacturer or vendor for this cable" },
    { key: "model", label: "Model #", type: "text", group: "Manufacturer Details", tooltip: "Manufacturer model number or catalog reference" },
    { key: "catalog_evidence_status", label: "Library Evidence", type: "select", options: ["screening", "source_verified"], group: "Manufacturer Details", tooltip: "Source verified requires a manufacturer, model/catalog reference, dated source, URL, and complete construction fields. It is not project approval." },
    { key: "catalog_source", label: "Catalog Source", type: "text", group: "Manufacturer Details", tooltip: "Manufacturer product page, datasheet, or catalog reference used to verify this cable construction" },
    { key: "catalog_last_verified", label: "Catalog Verified", type: "text", group: "Manufacturer Details", tooltip: "Date the manufacturer source was checked (YYYY-MM-DD)" },
    { key: "datasheet_url", label: "Datasheet URL", type: "text", group: "Manufacturer Details", tooltip: "Manufacturer product page or datasheet URL for the cable construction" },
    { key: "ambient_temp", label: "Ambient Temp (°C)", type: "number", group: "Manufacturer Details", tooltip: "Ambient temperature for sizing" },
    { key: "insulation_thickness", label: "Insul Thick (in)", type: "number", group: "Manufacturer Details", tooltip: "Insulation thickness in inches" },
    { key: "cable_od", label: "Cable O.D. (in)", type: "number", group: "Manufacturer Details", tooltip: "Outside diameter of the cable in inches" },
    { key: "shielding_jacket", label: "Shielding/Jacket", type: "select", options: SHIELDING_OPTIONS, group: "Manufacturer Details", tooltip: "Shielding or outer jacket type" },
    { key: "cable_rating", label: "Cable Rating (V)", type: "number", group: "Manufacturer Details", tooltip: "Maximum voltage rating" },
    { key: "cable_type", label: "Cable Type", type: "select", options: CABLE_TYPES, group: "Cable Construction", tooltip: "Category such as Power, Control, or Signal" },
    { key: "conductors", label: "Conductors", type: "number", group: "Cable Construction", tooltip: "Number of conductors within the cable" },
    { key: "conductor_size", label: "Conductor Size", type: "select", options: CONDUCTOR_SIZES, group: "Cable Construction", tooltip: "Size of each conductor" },
    { key: "conductor_material", label: "Conductor Material", type: "select", options: CONDUCTOR_MATERIALS, group: "Cable Construction", tooltip: "Material of the conductors" },
    { key: "ground_size", label: "EGC Size", type: "select", options: CONDUCTOR_SIZES, allowEmpty: true, emptyLabel: "Select EGC size", group: "Cable Construction", tooltip: "Equipment grounding conductor size used for NEC 250.122 screening" },
    { key: "ground_material", label: "EGC Material", type: "select", options: CONDUCTOR_MATERIALS, allowEmpty: true, emptyLabel: "Select EGC material", group: "Cable Construction", tooltip: "Equipment grounding conductor material. The DRC currently screens selected copper EGC sizes." },
    { key: "install_method", label: "Install Method", type: "select", options: INSTALL_METHODS, group: "Cable Construction", tooltip: "Installation method" },
    { key: "insulation_type", label: "Insulation Type", type: "select", options: Object.keys(INSULATION_TEMP_LIMIT), group: "Cable Construction", tooltip: "Insulation material type" },
    { key: "insulation_rating", label: "Insul Rating (°C)", type: "select", options: INSULATION_RATINGS, group: "Cable Construction", tooltip: "Maximum temperature rating of insulation" },
    { key: "parallel_count", label: "Parallel Runs", type: "number", group: "Cable Construction", min: 1, step: 1, tooltip: "Number of identical cables run in parallel for this circuit (e.g. 3 × 240 kcmil in parallel). Tray fill and ampacity are multiplied by this count." },
    { key: "operating_voltage", label: "Operating Voltage (V)", type: "number", group: "Electrical Entry", tooltip: "Nominal operating voltage" },
    { key: "est_load", label: "Est Load (A)", type: "number", group: "Electrical Entry", tooltip: "Estimated operating current" },
    { key: "ocpd_rating", label: "OCPD Rating (A)", type: "number", group: "Electrical Entry", tooltip: "Overcurrent protective device rating used for NEC 240.4/250.122 screening" },
    { key: "terminal_temp_rating", label: "Terminal Temp (C)", type: "select", options: TERMINAL_TEMP_RATINGS, group: "Electrical Entry", tooltip: "Equipment terminal temperature rating for NEC 110.14(C); blank lets DRC infer 60C through 100A and 75C above 100A" },
    { key: "duty_cycle", label: "Duty Cycle (%)", type: "number", group: "Electrical Entry", tooltip: "Duty cycle percentage" },
    { key: "length", label: "Length (ft)", type: "number", group: "Electrical Entry", tooltip: "Length of cable run" },
    { key: "load_flow_current", label: "Load Flow Current (A)", type: "text", group: "Calculations", tooltip: "Current captured from the latest load flow study" },
    { key: "calc_ampacity", label: "Calc Ampacity (A)", type: "number", group: "Calculations", tooltip: "Ampacity after code factors" },
    { key: "impedance", label: "Impedance (Ω)", type: "number", group: "Calculations", tooltip: "Circuit impedance used for voltage drop checks" },
    { key: "code_reference", label: "Code Ref", type: "text", group: "Calculations", tooltip: "Code table used" },
    { key: "voltage_drop_pct", label: "Estimated Voltage Drop (%)", type: "number", group: "Calculations", tooltip: "Estimated voltage drop percent" },
    { key: "sizing_warning", label: "Sizing Warning", type: "text", group: "Calculations", tooltip: "Non-compliance details" },
    { key: "notes", label: "Notes", type: "text", group: "Notes", tooltip: "Additional comments or notes" },
    { key: "engineer_note", label: "Engineer Note", type: "text", group: "Notes", tooltip: "Engineering annotation, design decision rationale, or field observation" },
    { key: "review_status", label: "Review Status", type: "select", options: ["", "pending", "approved", "flagged"], group: "Notes", tooltip: "Engineer review/approval status for this cable record" },
    { key: "last_modified", label: "Last Modified", type: "text", group: "Notes", tooltip: "Local timestamp for the most recent row edit", readOnly: true }
  ];
  columns.forEach(column => {
    if (column.type === "number") {
      column.step = "any";
      column.maxlength = 15;
      column.validate = column.validate || "numeric";
    }
  });
  return columns;
}

export function createCableSchedulePresets(columns) {
  const groupNames = Array.from(new Set(columns.map(column => column.group || "General")));
  return {
    groupNames,
    presets: {
      entry: { label: "Basic Entry", groups: groupNames, keys: ["tag", "from_tag", "to_tag", "raceway_ids", "cable_type", "conductors", "conductor_size", "ground_size", "ocpd_rating", "length"] },
      full: { label: "Full Detail", groups: groupNames },
      routing: { label: "Routing Focus", groups: ["Identification", "Terminations", "Routing Details", "Notes"] },
      electrical: { label: "Electrical Focus", groups: ["Identification", "Cable Construction", "Electrical Entry", "Calculations", "Notes"] },
      construction: { label: "Construction Specs", groups: ["Identification", "Cable Construction", "Manufacturer Details", "Notes"] }
    }
  };
}
