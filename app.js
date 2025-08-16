// Filename: app.js
// (This is an improved version that adds route segment consolidation)

// Ensure Canvas 2D contexts are optimized for repeated pixel reads.
// This avoids Chrome warnings about frequent getImageData usage.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, options) {
    if (type === '2d') {
        options = options || {};
        if (options.willReadFrequently === undefined) {
            options.willReadFrequently = true;
        }
    }
    return originalGetContext.call(this, type, options);
};
// Some libraries (e.g. Plotly) may use OffscreenCanvas; patch it as well.
if (typeof OffscreenCanvas !== 'undefined') {
    const originalOffscreenGetContext = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function(type, options) {
        if (type === '2d') {
            options = options || {};
            if (options.willReadFrequently === undefined) {
                options.willReadFrequently = true;
            }
        }
        return originalOffscreenGetContext.call(this, type, options);
    };
}

// Lazy-load conductor property data when needed.
async function ensureConductorProps() {
    if (!globalThis.CONDUCTOR_PROPS) {
        try {
            const resp = await fetch('data/conductor_properties.json');
            globalThis.CONDUCTOR_PROPS = await resp.json();
        } catch (err) {
            console.error('Failed to load conductor properties', err);
            globalThis.CONDUCTOR_PROPS = {};
        }
    }
    return globalThis.CONDUCTOR_PROPS;
}
// start loading early
ensureConductorProps();

const CONDUIT_SPECS = {
    "EMT": {"1/2":0.304,"3/4":0.533,"1":0.864,"1-1/4":1.496,"1-1/2":2.036,"2":3.356,"2-1/2":5.858,"3":8.846,"3-1/2":11.545,"4":14.753},
    "ENT": {"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291},
    "FMC": {"3/8":0.116,"1/2":0.317,"3/4":0.533,"1":0.817,"1-1/4":1.277,"1-1/2":1.858,"2":3.269,"2-1/2":4.909,"3":7.069,"3-1/2":9.621,"4":12.566},
    "IMC": {"1/2":0.342,"3/4":0.586,"1":0.959,"1-1/4":1.647,"1-1/2":2.225,"2":3.63,"2-1/2":5.135,"3":7.922,"3-1/2":10.584,"4":13.631},
    "LFNC-A": {"3/8":0.192,"1/2":0.312,"3/4":0.535,"1":0.854,"1-1/4":1.502,"1-1/2":2.018,"2":3.343},
    "LFNC-B": {"3/8":0.192,"1/2":0.314,"3/4":0.541,"1":0.873,"1-1/4":1.528,"1-1/2":1.981,"2":3.246},
    "LFMC": {"3/8":0.192,"1/2":0.314,"3/4":0.541,"1":0.873,"1-1/4":1.277,"1-1/2":1.858,"2":3.269,"2-1/2":4.881,"3":7.475,"3-1/2":9.731,"4":12.692},
    "RMC": {"1/2":0.314,"3/4":0.549,"1":0.887,"1-1/4":1.526,"1-1/2":2.071,"2":3.408,"2-1/2":4.866,"3":7.499,"3-1/2":10.01,"4":12.882,"5":20.212,"6":29.158},
    "PVC Sch 80": {"1/2":0.217,"3/4":0.409,"1":0.688,"1-1/4":1.237,"1-1/2":1.711,"2":2.874,"2-1/2":4.119,"3":6.442,"3-1/2":8.688,"4":11.258,"5":17.855,"6":25.598},
    "PVC Sch 40": {"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291,"2-1/2":4.695,"3":7.268,"3-1/2":9.737,"4":12.554,"5":19.761,"6":28.567},
    "PVC Type A": {"1/2":0.385,"3/4":0.65,"1":1.084,"1-1/4":1.767,"1-1/2":2.324,"2":3.647,"2-1/2":5.453,"3":8.194,"3-1/2":10.694,"4":13.723},
    "PVC Type EB": {"2":3.874,"3":8.709,"3-1/2":11.365,"4":14.448,"5":22.195,"6":31.53}
};

const CONTAINMENT_RULES = {
    thresholds: { conduit: 3, channel: 6 } // 1-3 cables conduit, 4-6 channel, >6 tray
};

const SHAPE_CODES = [
    'STR','90B','45B','30B/60B','TEE','X','VI','VO','45VI','45VO','RED-C','RED-S','Z','OFFSET','SPIRAL'
];

const SHAPE_COLORS = {
    '90B': '#1f77b4',
    '45B': '#ff7f0e',
    '30B/60B': '#2ca02c',
    'TEE': '#d62728',
    'X': '#9467bd',
    'VI': '#17becf',
    'VO': '#17becf',
    '45VI': '#8c564b',
    '45VO': '#8c564b',
    'RED-C': '#e377c2',
    'RED-S': '#e377c2',
    'Z': '#bcbd22',
    'OFFSET': '#7f7f7f',
    'SPIRAL': '#17becf'
};

document.addEventListener('DOMContentLoaded', async () => {
    initSettings();
    initDarkMode();
    initHelpModal('help-btn','help-modal','close-help-btn');
    initNavToggle();
    // --- UNSAVED CHANGES TRACKING ---
    let saved = true;
    const markSaved = () => { saved = true; };
    const markUnsaved = () => { saved = false; };
    window.addEventListener('beforeunload', e => { if(!saved){ e.preventDefault(); e.returnValue=''; }});

    // --- STATE MANAGEMENT ---
    let state = {
        manualTrays: [],
        cableList: [],
        trayData: [],
        latestRouteData: [],
        sharedFieldRoutes: [],
        trayCableMap: {},
        fieldSegmentCableMap: new Map(),
        updatedUtilData: [],
        finalTrays: [],
        highlightTraceIndex: null,
        ductbankData: null,
        ductbankTraceIndices: [],
        ductbankVisible: true,
        conduitData: [],
    };

    // --- ELEMENT REFERENCES ---
    const elements = {
        fillLimitIn: document.getElementById('fill-limit'),
        fillLimitOut: document.getElementById('fill-limit-value'),
        calculateBtn: document.getElementById('calculate-route-btn'),
        loadSampleTraysBtn: document.getElementById('load-sample-trays-btn'),
        batchSection: document.getElementById('batch-section'),
        addTrayBtn: document.getElementById('add-tray-btn'),
        clearTraysBtn: document.getElementById('clear-trays-btn'),
        manualTrayTableContainer: document.getElementById('manual-tray-table-container'),
        exportTraysBtn: document.getElementById('export-trays-btn'),
        importTraysFile: document.getElementById('import-trays-file'),
        importTraysBtn: document.getElementById('import-trays-btn'),
        trayUtilizationContainer: document.getElementById('tray-utilization-container'),
        loadSampleCablesBtn: document.getElementById('load-sample-cables-btn'),
        clearCablesBtn: document.getElementById('clear-cables-btn'),
        addCableBtn: document.getElementById('add-cable-btn'),
        cableListContainer: document.getElementById('cable-list-container'),
        exportCablesBtn: document.getElementById('export-cables-btn'),
        importCablesFile: document.getElementById('import-cables-file'),
        importCablesBtn: document.getElementById('import-cables-btn'),
        resultsSection: document.getElementById('results-section'),
        messages: document.getElementById('messages'),
        metrics: document.getElementById('metrics'),
        routeBreakdownContainer: document.getElementById('route-breakdown-container'),
        plot3d: document.getElementById('plot-3d'),
        popoutPlotBtn: document.getElementById('popout-plot-btn'),
        resetViewBtn: document.getElementById('reset-view-btn'),
        ductbankToggle: document.getElementById('ductbank-toggle'),
        updatedUtilizationContainer: document.getElementById('updated-utilization-container'),
        exportCsvBtn: document.getElementById('export-csv-btn'),
        rebalanceBtn: document.getElementById('rebalance-btn'),
        openFillBtn: document.getElementById('open-fill-btn'),
        exportTrayFillsBtn: document.getElementById('export-tray-fills-btn'),
        progressContainer: document.getElementById('progress-container'),
        progressBar: document.getElementById('progress-bar'),
        progressLabel: document.getElementById('progress-label'),
        cancelRoutingBtn: document.getElementById('cancel-routing-btn'),
        manualTraySummary: document.getElementById('manual-tray-summary'),
        cableListSummary: document.getElementById('cable-list-summary'),
        darkToggle: document.getElementById('dark-toggle'),
        settingsBtn: document.getElementById('settings-btn'),
        settingsMenu: document.getElementById('settings-menu'),
        helpBtn: document.getElementById('help-btn'),
        helpModal: document.getElementById('help-modal'),
        closeHelpBtn: document.getElementById('close-help-btn'),
        deleteDataBtn: document.getElementById('delete-data-btn'),
        traySearch: document.getElementById('tray-search'),
        cableSearch: document.getElementById('cable-search'),
        conduitType: document.getElementById('conduit-type'),
        sidebar: document.querySelector('.sidebar'),
        sidebarToggle: document.getElementById('sidebar-toggle'),
        resumeModal: document.getElementById('resume-modal'),
        resumeYesBtn: document.getElementById('resume-yes-btn'),
        resumeNoBtn: document.getElementById('resume-no-btn'),
    };

    document.querySelectorAll('input, select, textarea').forEach(el=>{if(!el.classList.contains('table-search')){el.addEventListener('input',markUnsaved);el.addEventListener('change',markUnsaved);}});
    ['addTrayBtn','clearTraysBtn','importTraysBtn','loadSampleTraysBtn','addCableBtn','clearCablesBtn','importCablesBtn','loadSampleCablesBtn'].forEach(k=>{const btn=elements[k];if(btn)btn.addEventListener('click',markUnsaved);});
    if(elements.importTraysFile) elements.importTraysFile.addEventListener('change',markUnsaved);
    if(elements.importCablesFile) elements.importCablesFile.addEventListener('change',markUnsaved);
    if(elements.exportTraysBtn) elements.exportTraysBtn.addEventListener('click',markSaved);
    if(elements.exportCablesBtn) elements.exportCablesBtn.addEventListener('click',markSaved);
    ['export-csv-btn','export-tray-fills-btn'].forEach(id=>{const b=document.getElementById(id);if(b)b.addEventListener('click',markSaved);});

    const initHelpIcons = (root = document) => {
        root.querySelectorAll('.help-icon').forEach(icon => {
            icon.setAttribute('role', 'button');
            if (!icon.hasAttribute('aria-label')) icon.setAttribute('aria-label', 'Help');
            if (!icon.hasAttribute('aria-expanded')) icon.setAttribute('aria-expanded', 'false');
            icon.addEventListener('mouseenter', () => icon.setAttribute('aria-expanded', 'true'));
            icon.addEventListener('mouseleave', () => icon.setAttribute('aria-expanded', 'false'));
            icon.addEventListener('focus', () => icon.setAttribute('aria-expanded', 'true'));
            icon.addEventListener('blur', () => icon.setAttribute('aria-expanded', 'false'));
        });
    };
    const loadDuctbankData = async () => {
        if (state.ductbankData && state.ductbankData.ductbanks && state.ductbankData.ductbanks.length) {
            update3DPlot();
            return;
        }
        try {
            const res = await fetch('data/ductbank_geometry.json');
            if (res.ok) {
                state.ductbankData = await res.json();
            }
        } catch (e) {
            console.warn('Unable to load ductbank geometry', e);
        }
        if (state.ductbankData) {
            update3DPlot();
        }
    };
    initHelpIcons();
    if (elements.sidebarToggle && elements.sidebar) {
        elements.sidebarToggle.addEventListener('click', () => {
            elements.sidebar.classList.toggle('collapsed');
        });
    }
    let cancelRouting = false;
    let currentWorkers = [];
    let workerResolvers = new Map();
    const taskQueue = [];
    const maxWorkers = navigator.hardwareConcurrency || 4;

    const nextCableName = (sample) => {
        let prefix = 'Cable ';
        let digits = 1;
        if (sample) {
            const m = sample.match(/^(.*?)(\d+)$/);
            if (m) { prefix = m[1]; digits = m[2].length; }
        } else if (state.cableList.length > 0) {
            const m = state.cableList[0].name.match(/^(.*?)(\d+)$/);
            if (m) { prefix = m[1]; digits = m[2].length; }
        }
        let max = 0;
        state.cableList.forEach(c => {
            const m = c.name && c.name.match(new RegExp('^'+prefix+'(\\d+)$'));
            if (m) {
                max = Math.max(max, parseInt(m[1],10));
                digits = Math.max(digits, m[1].length);
            }
        });
        return prefix + String(max + 1).padStart(digits, '0');
    };

    const updateTableCounts = () => {
        if (elements.manualTraySummary) {
            elements.manualTraySummary.textContent =
                `Manual Cable Tray Entry Table (${state.manualTrays.length})`;
        }
        if (elements.cableListSummary) {
            elements.cableListSummary.textContent =
                `Cables to Route Table (${state.cableList.length})`;
        }
    };

    const syncManualPath = cable => {
        if (!cable) return;
        if (!('manual_path' in cable)) cable.manual_path = '';
        if (!('raceway_ids' in cable)) cable.raceway_ids = [];
        if (!cable.manual_path && Array.isArray(cable.raceway_ids) && cable.raceway_ids.length) {
            cable.manual_path = cable.raceway_ids.join('>');
        }
    };

    const setRacewayIds = (cable, ids) => {
        if (!cable) return;
        cable.raceway_ids = Array.isArray(ids) ? ids : [];
        syncManualPath(cable);
    };

    const saveSession = () => {
        try {
            state.cableList.forEach(syncManualPath);
            const data = {
                manualTrays: state.manualTrays,
                cableList: state.cableList,
                darkMode: document.body.classList.contains('dark-mode'),
                conduitType: elements.conduitType ? elements.conduitType.value : 'EMT',
                proximityThreshold: parseFloat(document.getElementById('proximity-threshold')?.value) || 72
            };
            localStorage.setItem('ctrSession', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save session', e);
        }
    };

    const loadSession = () => {
        try {
            const data = JSON.parse(localStorage.getItem('ctrSession'));
            if (data) {
                state.manualTrays = (data.manualTrays || []).map(t => ({ ...t, raceway_type: t.raceway_type || 'tray' }));
                state.cableList = data.cableList || [];
                state.cableList.forEach(syncManualPath);
                if (data.darkMode) document.body.classList.add('dark-mode');
                if (data.conduitType && elements.conduitType) {
                    elements.conduitType.value = data.conduitType;
                }
                const prox = document.getElementById('proximity-threshold');
                if (prox && data.proximityThreshold !== undefined) {
                    prox.value = data.proximityThreshold;
                }
            }
        } catch (e) {
            console.error('Failed to load session', e);
        }
    };

    const loadSchedulesIntoSession = async () => {
        let trays = [];
        let cables = [];
        let ductbanks = [];
        let conduits = [];

        const trayKey = globalThis.TableUtils?.STORAGE_KEYS?.traySchedule || 'traySchedule';
        const cableKey = globalThis.TableUtils?.STORAGE_KEYS?.cableSchedule || 'cableSchedule';
        const dbKey = globalThis.TableUtils?.STORAGE_KEYS?.ductbankSchedule || 'ductbankSchedule';
        const condKey = globalThis.TableUtils?.STORAGE_KEYS?.conduitSchedule || 'conduitSchedule';

        const trayJson = localStorage.getItem(trayKey);
        if (trayJson) {
            try { trays = JSON.parse(trayJson); } catch (e) {}
        }
        const cableJson = localStorage.getItem(cableKey);
        if (cableJson) {
            try { cables = JSON.parse(cableJson); } catch (e) {}
        }
        const dbJson = localStorage.getItem(dbKey);
        if (dbJson) {
            try { ductbanks = JSON.parse(dbJson); } catch (e) {}
        }
        const condJson = localStorage.getItem(condKey);
        if (condJson) {
            try { conduits = JSON.parse(condJson); } catch (e) {}
        }
        conduits = conduits.map(c => {
            if ((!c.ductbank_id && !c.ductbank) && c.tag) {
                const parts = String(c.tag).split('-');
                if (parts.length > 1) {
                    const condId = parts.pop();
                    c.ductbank_id = parts.join('-');
                    if (!c.conduit_id) c.conduit_id = condId;
                }
            }
            if (c.ductbank_id && c.conduit_id && !c.tray_id) {
                c.tray_id = `${c.ductbank_id}-${c.conduit_id}`;
            }
            return c;
        });
        if (trays.length > 0) {
            state.manualTrays = trays.map(t => ({
                tray_id: t.tray_id,
                start_x: parseFloat(t.start_x),
                start_y: parseFloat(t.start_y),
                start_z: parseFloat(t.start_z),
                end_x: parseFloat(t.end_x),
                end_y: parseFloat(t.end_y),
                end_z: parseFloat(t.end_z),
                width: parseFloat(t.inside_width),
                height: parseFloat(t.tray_depth),
                current_fill: 0,
                shape: 'STR',
                allowed_cable_group: t.allowed_cable_group || '',
                raceway_type: 'tray',
            }));
        }

        if (cables.length > 0) {
            const conductorProps = await ensureConductorProps();
            const parseThickness = v => {
                if (v === undefined || v === null || v === '') return undefined;
                if (typeof v === 'number') return v;
                const str = String(v).trim().toLowerCase();
                const num = parseFloat(str);
                if (Number.isNaN(num)) return undefined;
                if (str.endsWith('mm')) return num / 25.4;
                if (str.endsWith('cm')) return num / 2.54;
                return num;
            };

            state.cableList = cables.map(c => {
                const { tag, from_tag, to_tag, start_x, start_y, start_z, end_x, end_y, end_z, raceway_ids,
                        cable_od, diameter: diameterRaw, OD, od, ...rest } = c;
                let diameter = parseFloat(diameterRaw ?? cable_od ?? OD ?? od);
                let weight = parseFloat(rest.weight);
                const size = (rest.conductor_size || '').trim();
                const prop = conductorProps[size];

                if (!diameter) {
                    let bare = 0.25; // default bare conductor diameter in inches
                    if (prop && prop.area_cm) {
                        bare = Math.sqrt(prop.area_cm) / 1000;
                    } else {
                        console.warn(`Unknown conductor size '${size}' for cable ${tag}; using ${bare} in.`);
                    }

                    let ins = parseThickness(rest.insulation_thickness);
                    if (ins === undefined) {
                        if (prop && prop.insulation_thickness !== undefined) {
                            ins = prop.insulation_thickness;
                        } else {
                            ins = 0.03;
                            console.warn(`Missing insulation thickness for cable ${tag}; assuming ${ins} in.`);
                        }
                    }

                    let shield = parseThickness(rest.shielding_jacket);
                    if (rest.shielding_jacket && shield === undefined) {
                        console.warn(`Unrecognized shielding/jacket value '${rest.shielding_jacket}' for cable ${tag}; assuming 0 in.`);
                    }
                    shield = shield || 0;

                    diameter = bare + 2 * (ins + shield);
                }

                if (Number.isNaN(weight)) {
                    if (prop && prop.area_cm) {
                        const areaSqIn = prop.area_cm * 7.8539816e-7;
                        const conductors = parseFloat(rest.conductors) || 1;
                        const mat = String(rest.conductor_material || 'copper').toLowerCase();
                        const density = mat.startsWith('al') ? 0.0975 : 0.321; // lb/in^3
                        weight = areaSqIn * density * 12 * conductors;
                    } else {
                        weight = 0;
                    }
                }

                const mapped = {
                    name: tag,
                    start_tag: from_tag,
                    end_tag: to_tag,
                    start: [parseFloat(start_x), parseFloat(start_y), parseFloat(start_z)],
                    end: [parseFloat(end_x), parseFloat(end_y), parseFloat(end_z)],
                    manual_path: '',
                    ...rest,
                    diameter,
                    weight,
                };
                setRacewayIds(mapped, raceway_ids || []);
                return mapped;
            });
        }

        if (ductbanks.length > 0) {
            const conduitMap = conduits.reduce((acc, c) => {
                const id = c.ductbank_id || c.ductbank;
                if (!acc[id]) acc[id] = [];
                acc[id].push(c);
                return acc;
            }, {});

            state.ductbankData = {
                ductbanks: ductbanks.map(db => {
                    const dbId = db.ductbank_id || db.id || db.tag;
                    return {
                        id: dbId,
                        tag: db.tag,
                        outline: [
                            [parseFloat(db.start_x), parseFloat(db.start_y), parseFloat(db.start_z)],
                            [parseFloat(db.end_x), parseFloat(db.end_y), parseFloat(db.end_z)]
                        ],
                        conduits: (conduitMap[dbId] || []).map(c => {
                            const condId = c.conduit_id || c.id;
                            const trayId = c.tray_id || `${dbId}-${condId}`;
                            return {
                                id: condId,
                                tag: trayId,
                                tray_id: trayId,
                                conduit_id: condId,
                                ductbank_id: dbId,
                                type: c.type,
                                conduit_type: c.type,
                                trade_size: c.trade_size,
                                path: [
                                    [parseFloat(c.start_x), parseFloat(c.start_y), parseFloat(c.start_z)],
                                    [parseFloat(c.end_x), parseFloat(c.end_y), parseFloat(c.end_z)]
                                ],
                                allowed_cable_group: c.allowed_cable_group
                            };
                        })
                    };
                })
            };
        }

        state.conduitData = conduits.filter(c => !(c.ductbank_id || c.ductbank));
        rebuildTrayData();
    };

    const rebuildTrayData = () => {
        state.trayData = state.manualTrays.map(t => ({ ...t }));

        if (state.ductbankData && state.ductbankData.ductbanks) {
            state.ductbankData.ductbanks.forEach(db => {
                if (Array.isArray(db.outline) && db.outline.length >= 2) {
                    const start = db.outline[0];
                    const end = db.outline[db.outline.length - 1];
                    state.trayData.push({
                        tray_id: db.id || db.tag,
                        start_x: start[0],
                        start_y: start[1],
                        start_z: start[2],
                        end_x: end[0],
                        end_y: end[1],
                        end_z: end[2],
                        width: parseFloat(db.width) || 12,
                        height: parseFloat(db.height) || 12,
                        current_fill: 0,
                        shape: 'STR',
                        allowed_cable_group: '',
                        raceway_type: 'ductbank',
                    });
                }
                (db.conduits || []).forEach(cond => {
                    if (Array.isArray(cond.path) && cond.path.length >= 2) {
                        const start = cond.path[0];
                        const end = cond.path[cond.path.length - 1];
                        const area = (CONDUIT_SPECS[cond.type] || {})[cond.trade_size];
                        const dia = area ? Math.sqrt((4 * area) / Math.PI)
                                         : parseFloat(cond.diameter) || 0;
                        const dbId = cond.ductbank_id || db.id || db.tag;
                        const condId = cond.conduit_id || cond.id;
                        const trayId = cond.tray_id || `${dbId}-${condId}`;
                        cond.tray_id = trayId;
                        state.trayData.push({
                            tray_id: trayId,
                            ductbank_id: dbId,
                            conduit_id: condId,
                            start_x: start[0],
                            start_y: start[1],
                            start_z: start[2],
                            end_x: end[0],
                            end_y: end[1],
                            end_z: end[2],
                            width: dia,
                            height: dia,
                            current_fill: 0,
                            shape: 'STR',
                            allowed_cable_group: cond.allowed_cable_group || '',
                            raceway_type: 'ductbank',
                        });
                    }
                });
            });
        }

        if (state.conduitData && state.conduitData.length) {
            state.conduitData.forEach(cond => {
                const start = [parseFloat(cond.start_x), parseFloat(cond.start_y), parseFloat(cond.start_z)];
                const end = [parseFloat(cond.end_x), parseFloat(cond.end_y), parseFloat(cond.end_z)];
                const area = (CONDUIT_SPECS[cond.type] || {})[cond.trade_size];
                const dia = area ? Math.sqrt((4 * area) / Math.PI)
                                 : parseFloat(cond.diameter) || 0;
                const condId = cond.conduit_id || cond.id;
                const trayId = cond.tray_id || condId;
                state.trayData.push({
                    tray_id: trayId,
                    ductbank_id: cond.ductbank_id || cond.ductbank,
                    conduit_id: condId,
                    start_x: start[0],
                    start_y: start[1],
                    start_z: start[2],
                    end_x: end[0],
                    end_y: end[1],
                    end_z: end[2],
                    width: dia,
                    height: dia,
                    current_fill: 0,
                    shape: 'STR',
                    allowed_cable_group: cond.allowed_cable_group || '',
                    raceway_type: 'conduit',
                });
            });
        }
    };

    const filterTable = (container, query) => {
        if (!container) return;
        const q = query.toLowerCase();
        container.querySelectorAll('tbody tr').forEach(row => {
            let text = row.textContent.toLowerCase();
            row.querySelectorAll('input').forEach(inp => {
                text += ' ' + (inp.value || '').toLowerCase();
            });
            row.style.display = text.includes(q) ? '' : 'none';
        });
    };

    const addSortHandlers = (container, dataArr, renderFn, sortState) => {
        const headers = container.querySelectorAll('th[data-key]');
        headers.forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const key = th.dataset.key;
                sortState.asc = sortState.key === key ? !sortState.asc : true;
                sortState.key = key;
                dataArr.sort((a,b) => {
                    const va = getSortVal(a, key);
                    const vb = getSortVal(b, key);
                    if (va < vb) return sortState.asc ? -1 : 1;
                    if (va > vb) return sortState.asc ? 1 : -1;
                    return 0;
                });
                renderFn();
            });
        });
    };

    const getSortVal = (obj, key) => {
        if (key === 'start0') return obj.start[0];
        if (key === 'end0') return obj.end[0];
        return obj[key];
    };

    const traySort = { key: '', asc: true };
    const cableSort = { key: '', asc: true };
    const updatedUtilSort = { key: '', asc: true };

    const validateInputs = (ids = []) => {
        let valid = true;
        ids.map(id => document.getElementById(id)).forEach(el => {
            if (!el) return;
            const value = el.value.trim();
            let error = '';
            if (el.type === 'number') {
                const num = parseFloat(value);
                const min = el.min !== '' ? parseFloat(el.min) : -Infinity;
                const max = el.max !== '' ? parseFloat(el.max) : Infinity;
                if (value === '' || isNaN(num)) {
                    error = 'Value required';
                } else if (num < min) {
                    error = `Min ${min}`;
                } else if (num > max) {
                    error = `Max ${max}`;
                }
            } else if (!value) {
                error = 'Value required';
            }

            const existing = el.nextElementSibling;
            if (error) {
                valid = false;
                el.classList.add('input-error');
                let msg = existing && existing.classList.contains('error-message') ? existing : null;
                if (!msg) {
                    msg = document.createElement('span');
                    msg.className = 'error-message';
                    el.insertAdjacentElement('afterend', msg);
                }
                msg.textContent = error;
            } else {
                el.classList.remove('input-error');
                if (existing && existing.classList.contains('error-message')) existing.remove();
            }
        });
        return valid;
    };

    // --- Tray Sizing Helpers (from cabletrayfill) ---
    const ALLOWABLE_AREA_BY_WIDTH = { 6:7.0, 9:10.5, 12:14.0, 18:21.0, 24:28.0, 30:32.5, 36:39.0 };
    const STANDARD_WIDTHS = [6, 9, 12, 18, 24, 30, 36];

    const sizeRank = (sizeStr) => {
        if (!sizeStr) return -Infinity;
        const s = sizeStr.trim().toUpperCase();
        if (s.endsWith('KCMIL')) return 2000 + parseFloat(s);
        const m = s.match(/(\d+)\/0\s*AWG/);
        if (m) return 1000 + parseInt(m[1]);
        const m2 = s.match(/#(\d+)\s*AWG/);
        if (m2) return -parseInt(m2[1]);
        return NaN;
    };

    const splitLargeSmall = (cables) => {
        const large = [], small = [];
        const rank1_0 = sizeRank('1/0 AWG');
        const rank4_0 = sizeRank('4/0 AWG');
        cables.forEach(c => {
            const r = sizeRank(c.conductor_size);
            if (c.isGroup || c.diameter >= 1.55 || (c.conductors === 1 && r >= rank1_0 && r <= rank4_0)) {
                large.push(c);
            } else {
                small.push(c);
            }
        });
        return { large, small };
    };

    const sumDiameters = arr => arr.reduce((s, c) => s + c.diameter, 0);
    const sumAreas = arr => arr.reduce((s, c) => s + Math.PI * (c.diameter/2)**2, 0);
    const getAllowableArea = (width, trayType) => {
        const base = ALLOWABLE_AREA_BY_WIDTH[width] || 0;
        return trayType === 'solid' ? base * 0.78 : base;
    };

    const computeNeededTrayWidth = (cables, trayType='ladder') => {
        const { large, small } = splitLargeSmall(cables);
        let widthNeededLarge = 0;
        if (large.length > 0) {
            const sumD = sumDiameters(large);
            widthNeededLarge = trayType === 'solid' ? (sumD / 0.9) : sumD;
        }
        const areaNeededSmall = sumAreas(small);
        for (const W of STANDARD_WIDTHS) {
            if (W < widthNeededLarge) continue;
            const allowA = getAllowableArea(W, trayType);
            if (small.length === 0 || areaNeededSmall <= allowA) {
                return W;
            }
        }
        return null;
    };

    const getRacewayRecommendation = (cables) => {
        const count = cables.length;
        let rec = 'conduit';
        if (count <= CONTAINMENT_RULES.thresholds.conduit) {
            rec = 'conduit';
        } else if (count <= CONTAINMENT_RULES.thresholds.channel) {
            rec = 'channel';
        } else {
            rec = 'tray';
        }
        let text = 'Recommended: ';
        if (rec === 'conduit') {
            const conduitType = elements.conduitType.value;
            const spec = CONDUIT_SPECS[conduitType] || {};
            const totalArea = cables.reduce((s, c) => s + Math.PI * (c.diameter/2)**2, 0);
            /* NEC Chapter 9 Table 1 fill limits (see docs/standards.md) */
            const fillPct = count === 1 ? 0.53 : count === 2 ? 0.31 : 0.40;
            let tradeSize = null;
            for (const size of Object.keys(spec)) {
                if (totalArea <= spec[size] * fillPct) { tradeSize = size; break; }
            }
            text += tradeSize ? `${tradeSize}" Conduit` : 'Conduit';
        } else {
            const width = computeNeededTrayWidth(cables) || null;
            const label = rec === 'tray' ? 'Tray' : 'Channel';
            text += width ? `${width}" ${label}` : label;
        }
        return text;
    };

    const buildFieldSegmentCableMap = (results) => {
        const nameMap = new Map(state.cableList.map(c => [c.name, c]));
        const map = new Map();
        results.forEach(row => {
            const cableObj = nameMap.get(row.cable);
            if (!cableObj || !Array.isArray(row.breakdown)) return;
            row.breakdown.forEach(b => {
                if (b.type === 'field') {
                    const key = [b.from, b.to].sort().join('|');
                    b.segment_key = key;
                    if (!map.has(key)) map.set(key, []);
                    map.get(key).push(cableObj);
                }
            });
        });
        results.forEach(row => {
            row.breakdown.forEach(b => {
                if (b.type === 'field') {
                    b.raceway = getRacewayRecommendation(map.get(b.segment_key) || []);
                }
            });
        });
        state.fieldSegmentCableMap = map;
    };

    // --- CORE ROUTING LOGIC (JavaScript implementation of your Python backend) ---

    class MinHeap {
        constructor() {
            this.heap = [];
        }

        push(node, priority) {
            this.heap.push({ node, priority });
            let i = this.heap.length - 1;
            while (i > 0) {
                const p = Math.floor((i - 1) / 2);
                if (this.heap[p].priority <= this.heap[i].priority) break;
                [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
                i = p;
            }
        }

        pop() {
            if (this.heap.length === 0) return null;
            const min = this.heap[0];
            const last = this.heap.pop();
            if (this.heap.length > 0) {
                this.heap[0] = last;
                let i = 0;
                while (true) {
                    let l = 2 * i + 1;
                    let r = 2 * i + 2;
                    let smallest = i;
                    if (l < this.heap.length && this.heap[l].priority < this.heap[smallest].priority) smallest = l;
                    if (r < this.heap.length && this.heap[r].priority < this.heap[smallest].priority) smallest = r;
                    if (smallest === i) break;
                    [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
                    i = smallest;
                }
            }
            return min.node;
        }

        isEmpty() {
            return this.heap.length === 0;
        }
    }

    class CableRoutingSystem {
        constructor(options) {
            this.fillLimit = options.fillLimit || 0.4;
            this.proximityThreshold = options.proximityThreshold || 72.0;
            this.fieldPenalty = options.fieldPenalty || 3.0;
            this.sharedPenalty = options.sharedPenalty || 0.5;
            // Limit how far apart generic field edges can be created to avoid
            // generating a fully connected graph for large datasets
            this.maxFieldEdge = options.maxFieldEdge || 1000;
            // Limit how many field connections each node keeps to further
            // reduce graph density and memory usage
            this.maxFieldNeighbors = options.maxFieldNeighbors || 8;
            // Optionally include ductbank outline segments lacking conduit IDs
            this.includeDuctbankOutlines = options.includeDuctbankOutlines || false;
            this.sharedFieldSegments = [];
            this.trays = new Map();
        }

        addTraySegment(tray) {
            const maxFill = tray.width * tray.height * this.fillLimit;
            // Preserve ductbank association for later use
            this.trays.set(tray.tray_id, { ...tray, ductbank_id: tray.ductbank_id, maxFill });
        }

        updateTrayFill(trayIds, cableArea) {
             if (!Array.isArray(trayIds)) return;
             trayIds.forEach(trayId => {
                if (this.trays.has(trayId)) {
                    this.trays.get(trayId).current_fill += cableArea;
                }
             });
        }
        
        getTrayUtilization() {
            const utilization = {};
            for (const [id, tray] of this.trays.entries()) {
                utilization[id] = {
                    current_fill: tray.current_fill,
                    max_fill: tray.maxFill,
                    utilization_percentage: (tray.current_fill / tray.maxFill) * 100,
                    available_capacity: tray.maxFill - tray.current_fill,
                };
            }
            return utilization;
        }

        // Geometric helper: 3D distance
        distance(p1, p2) {
            return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2) + Math.pow(p1[2] - p2[2], 2));
        }

        // Manhattan distance used for field routing
        manhattanDistance(p1, p2) {
            return Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1]) + Math.abs(p1[2] - p2[2]);
        }
        
        // Geometric helper: Project point p onto line segment [a, b]
        projectPointOnSegment(p, a, b) {
            const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
            const magAbSq = ab[0]*ab[0] + ab[1]*ab[1] + ab[2]*ab[2];
            if (magAbSq === 0) return a;
            
            const dot = ap[0]*ab[0] + ap[1]*ab[1] + ap[2]*ab[2];
            const t = Math.max(0, Math.min(1, dot / magAbSq));
            
            return [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]];
        }

        _consolidateSegments(segments) {
            if (segments.length === 0) return [];

            const consolidated = [];
            let current = { ...segments[0] };

            for (let i = 1; i < segments.length; i++) {
                const next = segments[i];
                // Consolidate consecutive tray segments belonging to the same tray
                if (next.type === current.type && next.type === 'tray' && next.tray_id === current.tray_id) {
                    current.end = next.end; // Extend the end point
                    current.length += next.length; // Add to the length
                } else {
                    consolidated.push(current);
                    current = { ...next };
                }
            }
            consolidated.push(current); // Add the last segment
            return consolidated;
        }

        _segmentOrientation(seg) {
            if (seg.start[0] !== seg.end[0]) return { axis: 0, const1: 1, const2: 2 };
            if (seg.start[1] !== seg.end[1]) return { axis: 1, const1: 0, const2: 2 };
            return { axis: 2, const1: 0, const2: 1 };
        }

        _segmentsOverlap(segA, segB, tol) {
            const oA = this._segmentOrientation(segA);
            const oB = this._segmentOrientation(segB);
            if (oA.axis !== oB.axis) return null;
            if (Math.abs(segA.start[oA.const1] - segB.start[oB.const1]) > tol) return null;
            if (Math.abs(segA.start[oA.const2] - segB.start[oB.const2]) > tol) return null;

            const a1 = Math.min(segA.start[oA.axis], segA.end[oA.axis]);
            const a2 = Math.max(segA.start[oA.axis], segA.end[oA.axis]);
            const b1 = Math.min(segB.start[oB.axis], segB.end[oB.axis]);
            const b2 = Math.max(segB.start[oB.axis], segB.end[oB.axis]);

            const start = Math.max(a1, b1);
            const end = Math.min(a2, b2);
            if (end + tol < start) return null;

            const pointStart = segA.start.slice();
            const pointEnd = segA.start.slice();
            pointStart[oA.axis] = start;
            pointEnd[oA.axis] = end;
            return { start: pointStart, end: pointEnd };
        }

        findCommonFieldRoutes(routes, tolerance = 1, cableMap = null) {
            const map = {};
            const keyFor = (s, e, group) => {
                const rounded = arr => arr.map(v => v.toFixed(2)).join(',');
                return `${rounded(s)}|${rounded(e)}|${group || ''}`;
            };
            for (let i = 0; i < routes.length; i++) {
                const a = routes[i];
                for (let j = i + 1; j < routes.length; j++) {
                    const b = routes[j];
                    if (a.allowed_cable_group && b.allowed_cable_group && a.allowed_cable_group !== b.allowed_cable_group) continue;
                    for (const segA of a.segments) {
                        if (segA.type !== 'field') continue;
                        for (const segB of b.segments) {
                            if (segB.type !== 'field') continue;
                            const ov = this._segmentsOverlap(segA, segB, tolerance);
                            if (ov) {
                                const key = keyFor(ov.start, ov.end, a.allowed_cable_group);
                                if (!map[key]) {
                                    map[key] = { start: ov.start, end: ov.end, group: a.allowed_cable_group, cables: new Set() };
                                }
                                map[key].cables.add(a.label || a.name);
                                map[key].cables.add(b.label || b.name);
                            }
                        }
                    }
                }
            }
            let count = 1;
            return Object.values(map).map(r => {
                const cables = Array.from(r.cables);
                let totalArea = 0;
                if (cableMap) {
                    cables.forEach(n => {
                        const d = cableMap.get(n);
                        if (d) totalArea += Math.PI * (d / 2) ** 2;
                    });
                }
                return {
                    name: `Route ${count++}`,
                    start: r.start,
                    end: r.end,
                    allowed_cable_group: r.group,
                    cables,
                    total_area: totalArea,
                    cable_count: cables.length
                };
            });
        }

        _isSharedSegment(seg, tol = 0.1) {
            for (const existing of this.sharedFieldSegments) {
                if (this._segmentsOverlap(seg, existing, tol)) return true;
            }
            return false;
        }

        _removeTrayBacktracking(segments) {
            const result = [];
            let i = 0;
            while (i < segments.length) {
                const curr = { ...segments[i] };
                if (curr.type === 'tray' && i + 1 < segments.length) {
                    const next = { ...segments[i + 1] };
                    if (next.type === 'field') {
                        const oTray = this._segmentOrientation(curr);
                        const oField = this._segmentOrientation(next);
                        if (oTray.axis === oField.axis) {
                            const trayDir = Math.sign(curr.end[oTray.axis] - curr.start[oTray.axis]);
                            const fieldDir = Math.sign(next.end[oField.axis] - next.start[oField.axis]);
                            if (trayDir !== 0 && fieldDir !== 0 && trayDir !== fieldDir) {
                                const overshoot = Math.min(Math.abs(next.end[oField.axis] - next.start[oField.axis]), curr.length);
                                curr.end[oTray.axis] -= trayDir * overshoot;
                                curr.length -= overshoot;
                                next.start[oField.axis] -= trayDir * overshoot;
                                next.length -= overshoot;
                                if (curr.length > 0.0001) result.push(curr);
                                if (next.length > 0.0001) {
                                    result.push(next);
                                }
                                i += 2;
                                continue;
                            }
                        }
                    }
                }
                result.push(curr);
                i++;
            }
            return result;
        }

        prepareBaseGraph() {
            const graph = { nodes: {}, edges: {} };
            const addNode = (id, point, type = 'generic') => {
                graph.nodes[id] = { point, type };
                graph.edges[id] = {};
            };
            const addEdge = (id1, id2, weight, type, trayId = null) => {
                if (!graph.edges[id1]) graph.edges[id1] = {};
                if (!graph.edges[id2]) graph.edges[id2] = {};
                graph.edges[id1][id2] = { weight, type, trayId };
                graph.edges[id2][id1] = { weight, type, trayId };
            };

            const allTrays = Array.from(this.trays.values());
            const missingDuctbank = allTrays.filter(t => t.raceway_type === 'ductbank' &&
                (t.conduit_id == null || t.conduit_id === ''));
            if (missingDuctbank.length) {
                console.warn(`${missingDuctbank.length} ductbank segment(s) without conduit_id; ` +
                    (this.includeDuctbankOutlines ? 'treated as generic raceways.' : 'ignored.'));
            }
            let trays;
            if (this.includeDuctbankOutlines) {
                let placeholder = 0;
                trays = allTrays.map(t => {
                    if (t.raceway_type === 'ductbank' && (t.conduit_id == null || t.conduit_id === '')) {
                        const tray_id = t.tray_id || `ductbank_outline_${placeholder++}`;
                        return { ...t, tray_id };
                    }
                    return t;
                });
            } else {
                trays = allTrays.filter(t => t.raceway_type !== 'ductbank' ||
                    (t.conduit_id != null && t.conduit_id !== ''));
            }

            trays.forEach(tray => {
                const startId = `${tray.tray_id}_start`;
                const endId = `${tray.tray_id}_end`;
                addNode(startId, [tray.start_x, tray.start_y, tray.start_z], 'tray_endpoint');
                addNode(endId, [tray.end_x, tray.end_y, tray.end_z], 'tray_endpoint');
                const trayLength = this.distance(graph.nodes[startId].point, graph.nodes[endId].point);
                addEdge(startId, endId, trayLength, 'tray', tray.tray_id);
            });

            trays.forEach(trayA => {
                const startA = `${trayA.tray_id}_start`;
                const endA = `${trayA.tray_id}_end`;
                const endpoints = [
                    { id: startA, point: graph.nodes[startA].point },
                    { id: endA, point: graph.nodes[endA].point }
                ];
                trays.forEach(trayB => {
                    if (trayA.tray_id === trayB.tray_id) return;
                    const startB = `${trayB.tray_id}_start`;
                    const endB = `${trayB.tray_id}_end`;
                    const a = graph.nodes[startB].point;
                    const b = graph.nodes[endB].point;
                    endpoints.forEach(ep => {
                        const proj = this.projectPointOnSegment(ep.point, a, b);
                        if (this.distance(ep.point, proj) < 0.1) {
                            const projId = `${ep.id}_on_${trayB.tray_id}`;
                            addNode(projId, proj, 'projection');
                            addEdge(ep.id, projId, 0.1, 'tray_connection', trayB.tray_id);
                            addEdge(projId, startB, this.distance(proj, a), 'tray', trayB.tray_id);
                            addEdge(projId, endB, this.distance(proj, b), 'tray', trayB.tray_id);
                        }
                    });
                });
            });

            const nodeIds = Object.keys(graph.nodes);
            const candidates = {};
            nodeIds.forEach(id => candidates[id] = []);

            for (let i = 0; i < nodeIds.length; i++) {
                for (let j = i + 1; j < nodeIds.length; j++) {
                    const id1 = nodeIds[i];
                    const id2 = nodeIds[j];
                    const p1 = graph.nodes[id1].point;
                    const p2 = graph.nodes[id2].point;

                    const isSameTray = id1.startsWith(id2.split('_')[0]) && id2.startsWith(id1.split('_')[0]);
                    if (graph.edges[id1][id2] || (id1.includes('_') && isSameTray)) continue;

                    const dist = this.manhattanDistance(p1, p2);
                    if (dist > this.maxFieldEdge) continue;
                    candidates[id1].push({ id: id2, dist });
                    candidates[id2].push({ id: id1, dist });
                }
            }

            nodeIds.forEach(id1 => {
                candidates[id1].sort((a,b) => a.dist - b.dist);
                candidates[id1].slice(0, this.maxFieldNeighbors).forEach(({id: id2, dist}) => {
                    if (graph.edges[id1][id2]) return;
                    let weight, type;
                    if (dist < 0.1) {
                        weight = 0.1;
                        type = 'tray_connection';
                    } else {
                        weight = dist * this.fieldPenalty;
                        type = 'field';
                    }
                    addEdge(id1, id2, weight, type);
                });
            });

            this.baseGraph = graph;
        }

        recordSharedFieldSegments(segments) {
            segments.forEach(s => {
                if (s.type === 'field') {
                    this.sharedFieldSegments.push({ start: s.start.slice(), end: s.end.slice() });
                }
            });
        }

        calculateRoute(startPoint, endPoint, cableArea, allowedGroup) {
            if (!this.baseGraph) this.prepareBaseGraph();
            // 1. Start from the precomputed graph
            const cloneGraph = (base) => {
                const g = { nodes: {}, edges: {} };
                for (const [id, n] of Object.entries(base.nodes)) {
                    g.nodes[id] = { point: n.point.slice(), type: n.type };
                }
                for (const [id, edges] of Object.entries(base.edges)) {
                    g.edges[id] = {};
                    for (const [k, e] of Object.entries(edges)) {
                        g.edges[id][k] = { weight: e.weight, type: e.type, trayId: e.trayId };
                    }
                }
                return g;
            };
            const graph = cloneGraph(this.baseGraph);

            // Remove trays without remaining capacity
            this.trays.forEach(tray => {
                if (tray.current_fill + cableArea > tray.maxFill ||
                    (tray.allowed_cable_group &&
                     tray.allowed_cable_group !== allowedGroup)) {
                    const remove = Object.keys(graph.nodes).filter(n => n.includes(tray.tray_id));
                    remove.forEach(n => {
                        delete graph.nodes[n];
                        delete graph.edges[n];
                        Object.keys(graph.edges).forEach(k => { if (graph.edges[k]) delete graph.edges[k][n]; });
                    });
                }
            });

            const addNode = (id, point, type = 'generic') => {
                graph.nodes[id] = { point, type };
                graph.edges[id] = {};
            };
            const addEdge = (id1, id2, weight, type, trayId = null) => {
                if (!graph.edges[id1]) graph.edges[id1] = {};
                if (!graph.edges[id2]) graph.edges[id2] = {};
                graph.edges[id1][id2] = { weight, type, trayId };
                graph.edges[id2][id1] = { weight, type, trayId };
            };

            addNode('start', startPoint, 'start');
            addNode('end', endPoint, 'end');

            const nodeIds = Object.keys(graph.nodes);
            nodeIds.forEach(id => {
                if (id === 'start' || id === 'end') return;
                const p = graph.nodes[id].point;
                const segS = { start: startPoint, end: p };
                const segE = { start: endPoint, end: p };
                const penS = this._isSharedSegment(segS) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
                const penE = this._isSharedSegment(segE) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
                addEdge('start', id, this.manhattanDistance(startPoint, p) * penS, 'field');
                addEdge('end', id, this.manhattanDistance(endPoint, p) * penE, 'field');
            });

            const segSE = { start: startPoint, end: endPoint };
            const penSE = this._isSharedSegment(segSE) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
            addEdge('start', 'end', this.manhattanDistance(startPoint, endPoint) * penSE, 'field');
            
            // Add projection nodes for start/end points onto trays
            this.trays.forEach(tray => {
                const startId = `${tray.tray_id}_start`;
                if (!graph.nodes[startId]) return; // Skip if tray was full
                
                const a = graph.nodes[startId].point;
                const b = graph.nodes[`${tray.tray_id}_end`].point;
                
                // Project cable's start point
                const projStart = this.projectPointOnSegment(startPoint, a, b);
                const distToProjStart = this.manhattanDistance(startPoint, projStart);
                if (distToProjStart <= this.proximityThreshold) {
                    const projId = `proj_start_on_${tray.tray_id}`;
                    addNode(projId, projStart, 'projection');
                    const penStart = this._isSharedSegment({ start: startPoint, end: projStart }) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
                    addEdge('start', projId, distToProjStart * penStart, 'field');
                    addEdge(projId, startId, this.distance(projStart, a), 'tray', tray.tray_id);
                    addEdge(projId, `${tray.tray_id}_end`, this.distance(projStart, b), 'tray', tray.tray_id);
                }

                // Project cable's end point
                const projEnd = this.projectPointOnSegment(endPoint, a, b);
                const distToProjEnd = this.manhattanDistance(endPoint, projEnd);
                if (distToProjEnd <= this.proximityThreshold) {
                    const projId = `proj_end_on_${tray.tray_id}`;
                    addNode(projId, projEnd, 'projection');
                    const penEnd = this._isSharedSegment({ start: endPoint, end: projEnd }) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
                    addEdge('end', projId, distToProjEnd * penEnd, 'field');
                    addEdge(projId, startId, this.distance(projEnd, a), 'tray', tray.tray_id);
                    addEdge(projId, `${tray.tray_id}_end`, this.distance(projEnd, b), 'tray', tray.tray_id);
                }
            });
            
            // 2. Dijkstra's Algorithm
            const distances = {};
            const prev = {};
            Object.keys(graph.nodes).forEach(node => distances[node] = Infinity);
            distances['start'] = 0;

            const pq = new MinHeap();
            pq.push('start', 0);
            const visited = new Set();

            while (!pq.isEmpty()) {
                const u = pq.pop();
                if (visited.has(u)) continue;
                visited.add(u);
                if (u === 'end') break;

                for (const v in graph.edges[u]) {
                    const edge = graph.edges[u][v];
                    const alt = distances[u] + edge.weight;
                    if (alt < distances[v]) {
                        distances[v] = alt;
                        prev[v] = { node: u, edge };
                        pq.push(v, alt);
                    }
                }
            }

            // 3. Reconstruct path and results
            if (distances['end'] === Infinity) {
                return { success: false, error: "No valid path could be found." };
            }

            const path = [];
            let current = 'end';
            while (current) {
                path.unshift(current);
                current = prev[current] ? prev[current].node : null;
            }
            
            let totalLength = 0;
            let fieldRoutedLength = 0;
            const routeSegments = [];
            const traySegments = new Set();

            for (let i = 0; i < path.length - 1; i++) {
                const u = path[i];
                const v = path[i+1];
                const edge = graph.edges[u][v] || graph.edges[v][u];
                const p1 = graph.nodes[u].point;
                const p2 = graph.nodes[v].point;
                const length = edge.type === 'field' ? this.manhattanDistance(p1, p2) : this.distance(p1, p2);
                totalLength += length;
                if (edge.type === 'field') {
                    fieldRoutedLength += length;
                }
                let type = edge.type;
                if (type === 'tray_connection') type = 'tray'; // Treat connections as trays for segment breakdown
                
                let tray_id = edge.trayId;
                if (!tray_id) { // Infer tray_id if not on edge
                    const node_id = u.includes('_') ? u : v;
                    tray_id = node_id.split('_')[0]
                }
                if (type === 'tray') traySegments.add(tray_id);
                const conduit_id = this.trays.get(tray_id)?.conduit_id;
                const ductbank_id = this.trays.get(tray_id)?.ductbank_id;

                if (edge.type === 'field') {
                    let curr = p1.slice();
                    if (p2[0] !== curr[0]) {
                        const next = [p2[0], curr[1], curr[2]];
                        routeSegments.push({ type, start: curr, end: next, length: Math.abs(p2[0]-curr[0]), tray_id, conduit_id, ductbank_id });
                        curr = next;
                    }
                    if (p2[1] !== curr[1]) {
                        const next = [curr[0], p2[1], curr[2]];
                        routeSegments.push({ type, start: curr, end: next, length: Math.abs(p2[1]-curr[1]), tray_id, conduit_id, ductbank_id });
                        curr = next;
                    }
                    if (p2[2] !== curr[2]) {
                        const next = [curr[0], curr[1], p2[2]];
                        routeSegments.push({ type, start: curr, end: next, length: Math.abs(p2[2]-curr[2]), tray_id, conduit_id, ductbank_id });
                        curr = next;
                    }
                } else {
                    routeSegments.push({ type, start: p1, end: p2, length, tray_id, conduit_id, ductbank_id });
                }
            }

            const cleaned = this._removeTrayBacktracking(routeSegments);
            return {
                success: true,
                total_length: totalLength,
                field_routed_length: fieldRoutedLength,
                route_segments: this._consolidateSegments(cleaned),
                tray_segments: Array.from(traySegments),
                warnings: [],
            };
        }
    }

    // --- EVENT HANDLERS & UI LOGIC (This part remains the same) ---
    
    const getSampleTrays = () => [
        {"tray_id": "H1-A", "start_x": 0, "start_y": 0, "start_z": 10, "end_x": 40, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 9.30,"allowed_cable_group": "HV", "shape": "STR"},
        {"tray_id": "H1-B", "start_x": 40, "start_y": 0, "start_z": 10, "end_x": 80, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 6.98,"allowed_cable_group": "HV", "shape": "STR"},
        {"tray_id": "H1-C", "start_x": 80, "start_y": 0, "start_z": 10, "end_x": 120, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 12.71,"allowed_cable_group": "HV", "shape": "STR"},
        {"tray_id": "H2-A", "start_x": 0, "start_y": 0, "start_z": 30, "end_x": 40, "end_y": 0, "end_z": 30, "width": 12, "height": 3.15, "current_fill": 4.96,"allowed_cable_group": "LV", "shape": "STR"},
        {"tray_id": "H2-B", "start_x": 40, "start_y": 0, "start_z": 30, "end_x": 80, "end_y": 0, "end_z": 30, "width": 12, "height": 3.15, "current_fill": 8.99,"allowed_cable_group": "LV", "shape": "STR"},
        {"tray_id": "H2-C", "start_x": 80, "start_y": 0, "start_z": 30, "end_x": 120, "end_y": 0, "end_z": 30, "width": 12, "height": 3.15, "current_fill": 3.26,"allowed_cable_group": "LV", "shape": "STR"},
        {"tray_id": "V1", "start_x": 40, "start_y": 0, "start_z": 10, "end_x": 40, "end_y": 0, "end_z": 30, "width": 8, "height": 2.36, "current_fill": 2.79,"allowed_cable_group": "HV", "shape": "STR"},
        {"tray_id": "V2", "start_x": 80, "start_y": 0, "start_z": 10, "end_x": 80, "end_y": 0, "end_z": 30, "width": 8, "height": 2.36, "current_fill": 3.41,"allowed_cable_group": "LV", "shape": "STR"},
        {"tray_id": "C1", "start_x": 60, "start_y": 0, "start_z": 10, "end_x": 60, "end_y": 40, "end_z": 10, "width": 9, "height": 2.95, "current_fill": 5.43,"allowed_cable_group": "HV", "shape": "STR"},
        {"tray_id": "C2", "start_x": 100, "start_y": 0, "start_z": 30, "end_x": 100, "end_y": 60, "end_z": 30, "width": 9, "height": 2.95, "current_fill": 6.36,"allowed_cable_group": "LV", "shape": "STR"},
        {"tray_id": "B1", "start_x": 60, "start_y": 40, "start_z": 10, "end_x": 60, "end_y": 80, "end_z": 10, "width": 6, "height": 1.97, "current_fill": 1.86,"allowed_cable_group": "HV", "shape": "STR"},
        {"tray_id": "B2", "start_x": 100, "start_y": 60, "start_z": 30, "end_x": 100, "end_y": 100, "end_z": 30, "width": 6, "height": 1.97, "current_fill": 1.40,"allowed_cable_group": "LV", "shape": "STR"},
        {"tray_id": "TRUNK", "start_x": 0, "start_y": 20, "start_z": 50, "end_x": 120, "end_y": 20, "end_z": 50, "width": 24, "height": 5.91, "current_fill": 27.90,"allowed_cable_group": "HV", "shape": "STR"},
        {"tray_id": "EQ1", "start_x": 20, "start_y": 0, "start_z": 10, "end_x": 20, "end_y": 15, "end_z": 5, "width": 4, "height": 1.57, "current_fill": 1.24,"allowed_cable_group": "HV", "shape": "STR"},
        {"tray_id": "EQ2", "start_x": 100, "start_y": 60, "start_z": 30, "end_x": 110, "end_y": 90, "end_z": 20, "width": 4, "height": 1.57, "current_fill": 0.93,"allowed_cable_group": "LV", "shape": "STR"},
        {"tray_id": "CONN1", "start_x": 120, "start_y": 0, "start_z": 10, "end_x": 120, "end_y": 20, "end_z": 25, "width": 8, "height": 2.95, "current_fill": 3.10,"allowed_cable_group": "HV", "shape": "STR"},
        {"tray_id": "CONN2", "start_x": 120, "start_y": 20, "start_z": 25, "end_x": 120, "end_y": 20, "end_z": 50, "width": 8, "height": 2.95, "current_fill": 2.33,"allowed_cable_group": "HV", "shape": "STR"}
    ];
    
    const getSampleCables = () => {
        const templates = [
            {
                cable_type: "Power",
                conductors: 3,
                conductor_size: '#12 AWG',
                diameter: 1.26,
                weight: 1.5,
                start: [5, 5, 5],
                end: [110, 95, 45],
                allowed_cable_group: "HV"
            },
            {
                cable_type: "Control",
                conductors: 3,
                conductor_size: '#12 AWG',
                diameter: 0.47,
                weight: 0.8,
                start: [10, 0, 10],
                end: [100, 80, 25],
                allowed_cable_group: "LV"
            },
            {
                cable_type: "Signal",
                conductors: 3,
                conductor_size: '#12 AWG',
                diameter: 0.31,
                weight: 0.5,
                start: [15, 5, 15],
                end: [105, 85, 30],
                allowed_cable_group: "LV"
            },
            {
                cable_type: "Power",
                conductors: 3,
                conductor_size: '#12 AWG',
                diameter: 1.10,
                weight: 1.3,
                start: [20, 10, 8],
                end: [115, 90, 35],
                allowed_cable_group: "HV"
            },
            {
                cable_type: "Control",
                conductors: 3,
                conductor_size: '#12 AWG',
                diameter: 0.59,
                weight: 0.9,
                start: [25, 15, 12],
                end: [95, 75, 28],
                allowed_cable_group: "LV"
            }
        ];

        const cables = [];
        for (let i = 0; i < 30; i++) {
            const t = templates[i % templates.length];
            const offset = Math.floor(i / templates.length) * 5;
            cables.push({
                name: `Cable ${String(i + 1).padStart(2, '0')}`,
                cable_type: t.cable_type,
                conductors: t.conductors,
                conductor_size: t.conductor_size,
                diameter: t.diameter,
                weight: t.weight,
                start: t.start.map(v => v + offset),
                end: t.end.map(v => v + offset),
                start_tag: `ST${i + 1}`,
                end_tag: `ET${i + 1}`,
                allowed_cable_group: t.allowed_cable_group,
                manual_path: '',
                raceway_ids: []
            });
        }
        return cables;
    };

    const updateFillLimitDisplay = () => {
        elements.fillLimitOut.textContent = `${elements.fillLimitIn.value}%`;
    };

    const renderTable = (container, headers, data, styleFn = null, formatters = {}) => {
        const defs = headers.map(h => typeof h === 'string' ? {
            label: h,
            key: h.toLowerCase()
                    .replace(/²/g, '2')
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_|_$/g, '')
        } : h);

        let table = '<table><thead><tr>';
        defs.forEach(h => table += `<th data-key="${h.key}">${h.label}</th>`);
        table += '</tr></thead><tbody>';
        data.forEach(row => {
            const style = styleFn ? styleFn(row) : '';
            table += `<tr class="${style}">`;
            defs.forEach(h => {
                const val = row[h.key];
                if (formatters[h.key]) {
                    table += `<td>${formatters[h.key](val, row)}</td>`;
                } else {
                    table += `<td>${val !== undefined ? val : 'N/A'}</td>`;
                }
            });
            table += '</tr>';
        });
        table += '</tbody></table>';
        container.innerHTML = table;
    };
    
    const utilizationStyle = (row) => {
        const util = row.utilization_pct || row.utilization;
        if (util > 80) return 'util-high';
        if (util > 60) return 'util-medium';
        return 'util-low';
    };

    const updateTrayDisplay = () => {
        if (state.trayData.length === 0) {
            elements.trayUtilizationContainer.innerHTML = '<p class="info-text">No tray data loaded.</p>';
            return;
        }
        const displayData = state.trayData.map(tray => {
            const maxCapacity = tray.width * tray.height * (parseFloat(elements.fillLimitIn.value) / 100);
            return {
                ...tray,
                max_capacity: maxCapacity.toFixed(0),
                utilization_pct: ((tray.current_fill / maxCapacity) * 100).toFixed(1),
                available_space: (maxCapacity - tray.current_fill).toFixed(2),
                fill: `<button class="fill-btn" data-tray="${tray.tray_id}">Open</button>`
            };
        });
        renderTable(
            elements.trayUtilizationContainer,
            [
                { label: 'Tray ID', key: 'tray_id' },
                { label: 'Start (x,y,z)', key: 'start_xyz' },
                { label: 'End (x,y,z)', key: 'end_xyz' },
                { label: 'Max Capacity (in²)', key: 'max_capacity' },
                { label: 'Current Fill (in²)', key: 'current_fill' },
                { label: 'Utilization %', key: 'utilization_pct' },
                { label: 'Available Space (in²)', key: 'available_space' },
                { label: 'Tray Fill', key: 'fill' }
            ],
            displayData.map(d => ({
                tray_id: d.tray_id,
                start_xyz: `(${d.start_x}, ${d.start_y}, ${d.start_z})`,
                end_xyz: `(${d.end_x}, ${d.end_y}, ${d.end_z})`,
                max_capacity: d.max_capacity,
                current_fill: d.current_fill,
                utilization_pct: d.utilization_pct,
                available_space: d.available_space,
                fill: d.fill
            })),
            utilizationStyle
        );
        elements.trayUtilizationContainer.querySelectorAll('.fill-btn').forEach(btn => {
            btn.addEventListener('click', () => openTrayFill(btn.dataset.tray));
        });
    };

const openTrayFill = (trayId) => {
    const tray = state.trayData.find(t => t.tray_id === trayId);
    if (!tray) return;
    const cables = (state.trayCableMap && state.trayCableMap[trayId]) ? state.trayCableMap[trayId] : [];
    try {
        localStorage.setItem('trayFillData', JSON.stringify({ tray, cables }));
    } catch (e) {
        console.error('Failed to store tray fill data', e);
    }
    window.open('cabletrayfill.html', '_blank');
};

const openConduitFill = (cables) => {
    const conduitType = elements.conduitType.value;
    const cableObjs = cables.map(c => {
        if (typeof c === 'string') {
            return state.cableList.find(cb => cb.name === c);
        }
        return c;
    }).filter(Boolean);
    const spec = CONDUIT_SPECS[conduitType] || {};
    const count = cableObjs.length;
    const totalArea = cableObjs.reduce((s, c) => s + Math.PI * Math.pow(c.diameter / 2, 2), 0);
    /* NEC Chapter 9 Table 1 fill limits (see docs/standards.md) */
    const fillPct = count === 1 ? 0.53 : count === 2 ? 0.31 : 0.40;
    let tradeSize = null;
    for (const size of Object.keys(spec)) {
        if (totalArea <= spec[size] * fillPct) { tradeSize = size; break; }
    }
    try {
        localStorage.setItem('conduitFillData', JSON.stringify({ type: conduitType, tradeSize, cables: cableObjs }));
    } catch (e) {
        console.error('Failed to store conduit fill data', e);
    }
    window.open('conduitfill.html', '_blank');
};

const openDuctbankRoute = (dbId, conduitId) => {
    const ductbank = state.ductbankData?.ductbanks?.find(db => db.id === dbId || db.tag === dbId);
    const key = conduitId ? `${dbId} - ${conduitId}` : dbId;
    const cables = (state.trayCableMap && state.trayCableMap[key]) ? state.trayCableMap[key] : [];
    if (!ductbank) return;
    try {
        localStorage.setItem('ductbankRouteData', JSON.stringify({ ductbank, cables, conduitId }));
    } catch (e) {
        console.error('Failed to store ductbank route data', e);
    }
    window.open('ductbankroute.html', '_blank');
};

 const renderUpdatedUtilizationTable = () => {
     if (!state.updatedUtilData || state.updatedUtilData.length === 0) {
         elements.updatedUtilizationContainer.innerHTML = '';
         return;
     }
     const fillLimit = parseFloat(elements.fillLimitIn.value) / 100;
     const fillLimitPct = fillLimit * 100;
     const formatters = {
         full_pct: (val) => {
             const pct = Math.min(val, 100).toFixed(1);
             const color = val > 80 ? 'var(--error-bg)' : val > 60 ? 'var(--warning-bg)' : 'var(--success-bg)';
             return `
                 <div class="util-bar">
                     <div class="util-bar-fill" style="width:${pct}%; background-color:${color};"></div>
                     <div class="util-bar-marker" style="left:${fillLimitPct}%;"></div>
                 </div>
                 <span class="util-label">${pct}%</span>
             `;
         }
     };
     renderTable(
         elements.updatedUtilizationContainer,
         [
             { label: 'Tray ID', key: 'tray_id' },
             { label: 'Utilization', key: 'full_pct' },
             { label: 'Available (in²)', key: 'available' },
             { label: 'Tray Fill', key: 'fill' }
         ],
         state.updatedUtilData,
         (row) => utilizationStyle(row),
         formatters
     );
     elements.updatedUtilizationContainer.querySelectorAll('.fill-btn').forEach(btn => {
         btn.addEventListener('click', () => openTrayFill(btn.dataset.tray));
     });
     addSortHandlers(elements.updatedUtilizationContainer, state.updatedUtilData, renderUpdatedUtilizationTable, updatedUtilSort);
 };
    
    

    const addManualTray = () => {
        const required = ['t-id','t-sx','t-sy','t-sz','t-ex','t-ey','t-ez','t-w','t-h'];
        if (!validateInputs(required)) return;

        const newTray = {
            tray_id: document.getElementById('t-id').value,
            start_x: parseFloat(document.getElementById('t-sx').value),
            start_y: parseFloat(document.getElementById('t-sy').value),
            start_z: parseFloat(document.getElementById('t-sz').value),
            end_x: parseFloat(document.getElementById('t-ex').value),
            end_y: parseFloat(document.getElementById('t-ey').value),
            end_z: parseFloat(document.getElementById('t-ez').value),
            width: parseFloat(document.getElementById('t-w').value),
            height: parseFloat(document.getElementById('t-h').value),
            current_fill: parseFloat(document.getElementById('t-fill').value),
            allowed_cable_group: document.getElementById('t-group').value,
            shape: document.getElementById('t-shape').value || 'STR',
            raceway_type: 'tray'
        };
        state.manualTrays.push(newTray);
        rebuildTrayData();
        renderManualTrayTable();
        updateTrayDisplay();
        updateTableCounts();
        saveSession();
    };

    const clearManualTrays = () => {
        state.manualTrays = [];
        rebuildTrayData();
        elements.manualTrayTableContainer.innerHTML = '';
        updateTrayDisplay();
        updateTableCounts();
        saveSession();
    };

    const loadSampleTrays = () => {
        state.manualTrays = getSampleTrays().map(t => ({ ...t, raceway_type: 'tray' }));
        rebuildTrayData();
        renderManualTrayTable();
        updateTrayDisplay();
        updateTableCounts();
        saveSession();
    };

    const renderManualTrayTable = () => {
        if (state.manualTrays.length === 0) {
            elements.manualTrayTableContainer.innerHTML = '';
            updateTableCounts();
            return;
        }
        let table = '<table class="sticky-table"><thead><tr>' +
            '<th data-key="tray_id">Tray ID</th>' +
            '<th data-key="start_x">Start (X,Y,Z)</th>' +
            '<th data-key="end_x">End (X,Y,Z)</th>' +
            '<th data-key="width">Width</th>' +
            '<th data-key="height">Height</th>' +
            '<th data-key="current_fill">Current Fill</th>' +
            '<th data-key="allowed_cable_group">Allowed Group</th>' +
            '<th data-key="shape">Shape <span class="help-icon" tabindex="0" role="button" aria-label="Help" aria-expanded="false" aria-describedby="shape-help">?<span id="shape-help" class="tooltip">STR: Straight<br>90B: 90\u00B0 Bend<br>45B: 45\u00B0 Bend<br>30B/60B: 30\u00B0/60\u00B0 Bend<br>TEE: Tee<br>X: Cross<br>VI: Vertical Inside<br>VO: Vertical Outside<br>45VI: 45\u00B0 Vertical Inside<br>45VO: 45\u00B0 Vertical Outside<br>RED-C: Center Reducer<br>RED-S: Side Reducer<br>Z: Z-Bend<br>OFFSET: Offset<br>SPIRAL: Spiral</span></span></th>' +
            '<th></th><th></th></tr></thead><tbody>';
        state.manualTrays.forEach((t, idx) => {
            table += `<tr data-idx="${idx}">
                        <td><input type="text" class="tray-id-input" data-idx="${idx}" value="${t.tray_id}" style="width:80px;"></td>
                        <td>
                            <input type="number" class="tray-start-input" data-idx="${idx}" data-coord="0" value="${t.start_x}" step="0.1" style="width:70px;">
                            <input type="number" class="tray-start-input" data-idx="${idx}" data-coord="1" value="${t.start_y}" step="0.1" style="width:70px;">
                            <input type="number" class="tray-start-input" data-idx="${idx}" data-coord="2" value="${t.start_z}" step="0.1" style="width:70px;">
                        </td>
                        <td>
                            <input type="number" class="tray-end-input" data-idx="${idx}" data-coord="0" value="${t.end_x}" step="0.1" style="width:70px;">
                            <input type="number" class="tray-end-input" data-idx="${idx}" data-coord="1" value="${t.end_y}" step="0.1" style="width:70px;">
                            <input type="number" class="tray-end-input" data-idx="${idx}" data-coord="2" value="${t.end_z}" step="0.1" style="width:70px;">
                        </td>
                        <td><input type="number" class="tray-width-input" data-idx="${idx}" value="${t.width}" min="0" step="0.1" style="width:60px;"></td>
                        <td><input type="number" class="tray-height-input" data-idx="${idx}" value="${t.height}" min="0" step="0.1" style="width:60px;"></td>
                        <td><input type="number" class="tray-fill-input" data-idx="${idx}" value="${t.current_fill}" min="0" step="0.1" style="width:80px;"></td>
                        <td><input type="text" class="tray-group-input" data-idx="${idx}" value="${t.allowed_cable_group || ''}" style="width:100px;"></td>
                        <td>
                            <select class="tray-shape-select" data-idx="${idx}" style="width:100px;">
                                ${SHAPE_CODES.map(s => `<option value="${s}" ${t.shape === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </td>
                        <td><button class="icon-button dup-tray" data-idx="${idx}" title="Duplicate">📋</button></td>
                        <td><button class="icon-button delete-tray icon-delete" data-idx="${idx}" title="Delete">\u274C</button></td>
                     </tr>`;
        });
        table += '</tbody></table>';
        elements.manualTrayTableContainer.innerHTML = table;
        initHelpIcons(elements.manualTrayTableContainer);
        elements.manualTrayTableContainer.classList.add('table-scroll');
        
        const updateTrayData = () => { rebuildTrayData(); updateTrayDisplay(); };

        elements.manualTrayTableContainer.querySelectorAll('.tray-id-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].tray_id = e.target.value;
                e.target.classList.remove('input-error');
                updateTrayData();
                saveSession();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-start-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const c = parseInt(e.target.dataset.coord, 10);
                const val = parseFloat(e.target.value);
                if (c === 0) state.manualTrays[i].start_x = val;
                if (c === 1) state.manualTrays[i].start_y = val;
                if (c === 2) state.manualTrays[i].start_z = val;
                updateTrayData();
                saveSession();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-end-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const c = parseInt(e.target.dataset.coord, 10);
                const val = parseFloat(e.target.value);
                if (c === 0) state.manualTrays[i].end_x = val;
                if (c === 1) state.manualTrays[i].end_y = val;
                if (c === 2) state.manualTrays[i].end_z = val;
                updateTrayData();
                saveSession();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-width-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].width = parseFloat(e.target.value);
                updateTrayData();
                saveSession();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-height-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].height = parseFloat(e.target.value);
                updateTrayData();
                saveSession();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-fill-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].current_fill = parseFloat(e.target.value);
                updateTrayData();
                saveSession();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-group-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].allowed_cable_group = e.target.value;
                updateTrayData();
                saveSession();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-shape-select').forEach(sel => {
            sel.addEventListener('change', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].shape = e.target.value;
                updateTrayData();
                saveSession();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.delete-tray').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays.splice(i, 1);
                rebuildTrayData();
                renderManualTrayTable();
                updateTrayDisplay();
                saveSession();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.dup-tray').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const copy = { ...state.manualTrays[i] };
                state.manualTrays.push(copy);
                rebuildTrayData();
                renderManualTrayTable();
                updateTrayDisplay();
                saveSession();
            });
        });
        updateTableCounts();
        addSortHandlers(elements.manualTrayTableContainer, state.manualTrays, renderManualTrayTable, traySort);
        filterTable(elements.manualTrayTableContainer, elements.traySearch.value);
    };

    const exportManualTraysCSV = () => {
        const headers = ['tray_id','start_x','start_y','start_z','end_x','end_y','end_z','width','height','current_fill','allowed_cable_group','shape'];
        const rows = state.manualTrays;
        let csv = headers.join(',') + '\n';
        if (rows.length > 0) {
            rows.forEach(r => {
                csv += headers.map(h => r[h] !== undefined ? r[h] : '').join(',') + '\n';
            });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tray_list.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const importManualTraysCSV = () => {
        const file = elements.importTraysFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result.trim();
            const lines = text.split(/\r?\n/);
            if (lines.length === 0) return;
            const delim = lines[0].includes(',') ? ',' : /\t/;
            const headers = lines[0].split(delim);
            const newTrays = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const vals = lines[i].split(delim);
                const t = {};
                headers.forEach((h, idx) => { t[h.trim()] = vals[idx] !== undefined ? vals[idx].trim() : ''; });
                newTrays.push({
                    tray_id: t.tray_id,
                    start_x: parseFloat(t.start_x) || 0,
                    start_y: parseFloat(t.start_y) || 0,
                    start_z: parseFloat(t.start_z) || 0,
                    end_x: parseFloat(t.end_x) || 0,
                    end_y: parseFloat(t.end_y) || 0,
                    end_z: parseFloat(t.end_z) || 0,
                    width: parseFloat(t.width) || 0,
                    height: parseFloat(t.height) || 0,
                    current_fill: parseFloat(t.current_fill) || 0,
                    allowed_cable_group: t.allowed_cable_group || '',
                    shape: t.shape || 'STR',
                    raceway_type: 'tray'
                });
            }
            state.manualTrays = newTrays;
            rebuildTrayData();
            renderManualTrayTable();
            updateTrayDisplay();
            updateTableCounts();
            saveSession();
        };
        reader.readAsText(file);
        // Reset the file input so importing the same file again triggers the change event
        elements.importTraysFile.value = '';
    };

    const exportCableOptionsCSV = () => {
        const headers = ['tag','start_tag','end_tag','cable_type','conductors','conductor_size','diameter','weight','allowed_cable_group','start_x','start_y','start_z','end_x','end_y','end_z'];
        const rows = state.cableList;
        let csv = headers.join(',') + '\n';
        if (rows.length > 0) {
            rows.forEach(c => {
                const row = [
                    c.name || '',
                    c.start_tag || '',
                    c.end_tag || '',
                    c.cable_type || '',
                    c.conductors !== undefined ? c.conductors : '',
                    c.conductor_size || '',
                    c.diameter !== undefined ? c.diameter : '',
                    c.weight !== undefined ? c.weight : '',
                    c.allowed_cable_group || '',
                    c.start[0], c.start[1], c.start[2],
                    c.end[0], c.end[1], c.end[2]
                ];
                csv += row.join(',') + '\n';
            });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cable_options.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const importCableOptionsCSV = () => {
        const file = elements.importCablesFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result.trim();
            const lines = text.split(/\r?\n/);
            if (lines.length === 0) return;
            const delim = lines[0].includes(',') ? ',' : /\t/;
            const headers = lines[0].split(delim);
            const newCables = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const vals = lines[i].split(delim);
                const t = {};
                headers.forEach((h, idx) => { t[h.trim()] = vals[idx] !== undefined ? vals[idx].trim() : ''; });
                newCables.push({
                    name: t.tag || '',
                    start_tag: t.start_tag || '',
                    end_tag: t.end_tag || '',
                    cable_type: t.cable_type || 'Power',
                    conductors: parseInt(t.conductors) || 0,
                    conductor_size: t.conductor_size || '#12 AWG',
                    diameter: parseFloat(t.diameter) || 0,
                    weight: parseFloat(t.weight) || 0,
                    allowed_cable_group: t.allowed_cable_group || '',
                    start: [parseFloat(t.start_x) || 0, parseFloat(t.start_y) || 0, parseFloat(t.start_z) || 0],
                    end: [parseFloat(t.end_x) || 0, parseFloat(t.end_y) || 0, parseFloat(t.end_z) || 0]
                ,
                    manual_path: ''
                });
                setRacewayIds(newCables[newCables.length - 1], []);
            }
            state.cableList = newCables;
            updateCableListDisplay();
            updateTableCounts();
            saveSession();
        };
        reader.readAsText(file);
        // Reset the file input so importing the same file again triggers the change event
        elements.importCablesFile.value = '';
    };

    const renderBatchResults = (results) => {
        let totalLength = 0;
        let totalField = 0;
        let html = '';
        results.forEach(res => {
            const tl = parseFloat(res.total_length);
            const fl = parseFloat(res.field_length);
            if (!isNaN(tl)) totalLength += tl;
            if (!isNaN(fl)) totalField += fl;
            html += `<details><summary>${res.cable} | ${res.status} | ${res.mode} | Total ${res.total_length} | Field ${res.field_length} | Segments ${res.segments_count}</summary>`;
            if (res.exclusions && res.exclusions.length > 0) {
                html += '<p class="exclusions-title"><strong>Excluded Conduits:</strong></p><ul class="exclusions-list">';
                res.exclusions.forEach(ex => {
                    const id = ex.tray_id || ex.id || 'unknown';
                    const reason = ex.reason.replace(/_/g, ' ');
                    html += `<li>${id}: ${reason}</li>`;
                });
                html += '</ul>';
            }
            if (res.breakdown && res.breakdown.length > 0) {
                html += '<div class="table-scroll"><table class="sticky-table"><thead><tr><th>Segment</th><th>Raceway ID</th><th>Conduit</th><th>Type</th><th>From</th><th>To</th><th>Length</th><th>Recommended Raceway</th><th>Fill</th></tr></thead><tbody>';
                res.breakdown.forEach(b => {
                    let link = '';
                    let racewayId = b.tray_id || '';
                    let conduit = '';
                    if (b.type === 'field') {
                        link = `<button class="conduit-fill-btn" data-seg="${b.segment_key}">Open</button>`;
                    } else if (b.ductbank_id) {
                        racewayId = b.ductbank_id;
                        conduit = b.conduit_id || '';
                        link = `<button class="ductbank-fill-btn" data-ductbank="${b.ductbank_id}" data-conduit="${b.conduit_id}">Fill</button>`;
                    } else if (b.tray_id && b.tray_id !== 'Field Route' && b.tray_id !== 'N/A') {
                        link = `<button class="tray-fill-btn" data-tray="${b.tray_id}">Fill</button>`;
                    }
                    html += `<tr><td>${b.segment}</td><td>${racewayId}</td><td>${conduit}</td><td>${b.type}</td><td>${b.from}</td><td>${b.to}</td><td>${b.length}</td><td>${b.raceway || ''}</td><td>${link}</td></tr>`;
                });
                html += '</tbody></table></div>';
            }
            html += '</details>';
        });
        const overall = `<p class="overall-stats"><strong>Overall Total Length:</strong> ${totalLength.toFixed(2)} ft | <strong>Overall Field Length:</strong> ${totalField.toFixed(2)} ft</p>`;
        elements.routeBreakdownContainer.innerHTML = overall + html;
        if (results.some(r => r.exclusions && r.exclusions.length > 0)) {
            document.dispatchEvent(new CustomEvent('exclusions-found'));
        }
        elements.routeBreakdownContainer.querySelectorAll('.conduit-fill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const segKey = btn.dataset.seg;
                const cables = state.fieldSegmentCableMap.get(segKey);
                if (cables && cables.length) {
                    openConduitFill(cables);
                }
            });
        });
        elements.routeBreakdownContainer.querySelectorAll('.tray-fill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const trayId = btn.dataset.tray;
                if (trayId) {
                    openTrayFill(trayId);
                }
            });
        });
        elements.routeBreakdownContainer.querySelectorAll('.ductbank-fill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dbId = btn.dataset.ductbank;
                const conduitId = btn.dataset.conduit;
                if (dbId) {
                    openDuctbankRoute(dbId, conduitId);
                }
            });
        });
    };
    
    const updateCableListDisplay = () => {
        if (state.cableList.length === 0) {
            elements.cableListContainer.innerHTML = '';
            updateTableCounts();
            return;
        }
        let html = '<h4>Cables to Route:</h4><table class="sticky-table"><thead><tr>' +
            '<th data-key="name">Tag</th>' +
            '<th data-key="start_tag">Start Tag</th>' +
            '<th data-key="end_tag">End Tag</th>' +
            '<th data-key="cable_type">Cable Type</th>' +
            '<th data-key="conductors">Conductors</th>' +
            '<th data-key="conductor_size">Conductor Size</th>' +
            '<th data-key="diameter">Diameter (in)</th>' +
            '<th data-key="weight">Weight (lbs/ft)</th>' +
            '<th data-key="allowed_cable_group">Allowed Group</th>' +
            '<th data-key="start0">Start (X,Y,Z)</th>' +
            '<th data-key="end0">End (X,Y,Z)</th>' +
            '<th data-key="manual_path">Manual Path</th>' +
            '<th></th><th></th></tr></thead><tbody>';
        state.cableList.forEach((c, idx) => {
            html += `<tr>
                        <td><input type="text" class="cable-tag-input" data-idx="${idx}" value="${c.name}"></td>
                        <td><input type="text" class="cable-start-tag-input" data-idx="${idx}" value="${c.start_tag || ''}" style="width:180px;"></td>
                        <td><input type="text" class="cable-end-tag-input" data-idx="${idx}" value="${c.end_tag || ''}" style="width:180px;"></td>
                        <td>
                            <select class="cable-type-select" data-idx="${idx}">
                                <option value="Power" ${c.cable_type === 'Power' ? 'selected' : ''}>Power</option>
                                <option value="Control" ${c.cable_type === 'Control' ? 'selected' : ''}>Control</option>
                                <option value="Signal" ${c.cable_type === 'Signal' ? 'selected' : ''}>Signal</option>
                            </select>
                        </td>
                        <td><input type="number" class="cable-conductors-input" data-idx="${idx}" value="${c.conductors || 0}" min="1" step="1" style="width:60px;"></td>
                        <td>
                            <select class="cable-size-select" data-idx="${idx}">
                                <option value="#22 AWG" ${c.conductor_size === '#22 AWG' ? 'selected' : ''}>#22 AWG</option>
                                <option value="#20 AWG" ${c.conductor_size === '#20 AWG' ? 'selected' : ''}>#20 AWG</option>
                                <option value="#18 AWG" ${c.conductor_size === '#18 AWG' ? 'selected' : ''}>#18 AWG</option>
                                <option value="#16 AWG" ${c.conductor_size === '#16 AWG' ? 'selected' : ''}>#16 AWG</option>
                                <option value="#14 AWG" ${c.conductor_size === '#14 AWG' ? 'selected' : ''}>#14 AWG</option>
                                <option value="#12 AWG" ${c.conductor_size === '#12 AWG' ? 'selected' : ''}>#12 AWG</option>
                                <option value="#10 AWG" ${c.conductor_size === '#10 AWG' ? 'selected' : ''}>#10 AWG</option>
                                <option value="#8 AWG" ${c.conductor_size === '#8 AWG' ? 'selected' : ''}>#8 AWG</option>
                                <option value="#6 AWG" ${c.conductor_size === '#6 AWG' ? 'selected' : ''}>#6 AWG</option>
                                <option value="#4 AWG" ${c.conductor_size === '#4 AWG' ? 'selected' : ''}>#4 AWG</option>
                                <option value="#2 AWG" ${c.conductor_size === '#2 AWG' ? 'selected' : ''}>#2 AWG</option>
                                <option value="#1 AWG" ${c.conductor_size === '#1 AWG' ? 'selected' : ''}>#1 AWG</option>
                                <option value="1/0 AWG" ${c.conductor_size === '1/0 AWG' ? 'selected' : ''}>1/0 AWG</option>
                                <option value="2/0 AWG" ${c.conductor_size === '2/0 AWG' ? 'selected' : ''}>2/0 AWG</option>
                                <option value="3/0 AWG" ${c.conductor_size === '3/0 AWG' ? 'selected' : ''}>3/0 AWG</option>
                                <option value="4/0 AWG" ${c.conductor_size === '4/0 AWG' ? 'selected' : ''}>4/0 AWG</option>
                                <option value="250 kcmil" ${c.conductor_size === '250 kcmil' ? 'selected' : ''}>250 kcmil</option>
                                <option value="350 kcmil" ${c.conductor_size === '350 kcmil' ? 'selected' : ''}>350 kcmil</option>
                                <option value="500 kcmil" ${c.conductor_size === '500 kcmil' ? 'selected' : ''}>500 kcmil</option>
                                <option value="750 kcmil" ${c.conductor_size === '750 kcmil' ? 'selected' : ''}>750 kcmil</option>
                                <option value="1000 kcmil" ${c.conductor_size === '1000 kcmil' ? 'selected' : ''}>1000 kcmil</option>
                            </select>
                        </td>
                        <td><input type="number" class="cable-diameter-input" data-idx="${idx}" value="${c.diameter}" min="0" step="0.01" style="width:60px;"></td>
                        <td><input type="number" class="cable-weight-input" data-idx="${idx}" value="${c.weight || 0}" min="0" step="0.01" style="width:80px;"></td>
                        <td><input type="text" class="cable-group-input" data-idx="${idx}" value="${c.allowed_cable_group || ''}" style="width:120px;"></td>
                        <td>
                            <input type="number" class="cable-start-input" data-idx="${idx}" data-coord="0" value="${c.start[0]}" step="0.1" style="width:60px;">
                            <input type="number" class="cable-start-input" data-idx="${idx}" data-coord="1" value="${c.start[1]}" step="0.1" style="width:60px;">
                            <input type="number" class="cable-start-input" data-idx="${idx}" data-coord="2" value="${c.start[2]}" step="0.1" style="width:60px;">
                        </td>
                        <td>
                            <input type="number" class="cable-end-input" data-idx="${idx}" data-coord="0" value="${c.end[0]}" step="0.1" style="width:60px;">
                            <input type="number" class="cable-end-input" data-idx="${idx}" data-coord="1" value="${c.end[1]}" step="0.1" style="width:60px;">
                            <input type="number" class="cable-end-input" data-idx="${idx}" data-coord="2" value="${c.end[2]}" step="0.1" style="width:60px;">
                        </td>
                        <td><input type="text" class="cable-manual-input" data-idx="${idx}" value="${c.manual_path || ''}" placeholder="Tray1>Tray2 or x,y,z;..." style="width:180px;"></td>
                        <td><button class="icon-button dup-cable" data-idx="${idx}" title="Duplicate">📋</button></td>
                        <td><button class="icon-button del-cable icon-delete" data-idx="${idx}" title="Delete">\u274C</button></td>
                    </tr>`;
        });
        html += '</tbody></table>';
        elements.cableListContainer.innerHTML = html;
        elements.cableListContainer.classList.add('table-scroll');
        elements.cableListContainer.querySelectorAll('.cable-tag-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].name = e.target.value;
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-start-tag-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].start_tag = e.target.value;
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-end-tag-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].end_tag = e.target.value;
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-diameter-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].diameter = parseFloat(e.target.value);
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-conductors-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].conductors = parseInt(e.target.value);
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-size-select').forEach(sel => {
            sel.addEventListener('change', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].conductor_size = e.target.value;
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-weight-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].weight = parseFloat(e.target.value);
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-type-select').forEach(sel => {
            sel.addEventListener('change', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].cable_type = e.target.value;
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-group-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].allowed_cable_group = e.target.value;
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-start-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const coord = parseInt(e.target.dataset.coord, 10);
                state.cableList[i].start[coord] = parseFloat(e.target.value);
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-end-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const coord = parseInt(e.target.dataset.coord, 10);
                state.cableList[i].end[coord] = parseFloat(e.target.value);
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-manual-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].manual_path = e.target.value;
                e.target.classList.remove('input-error');
                const err = e.target.nextElementSibling;
                if (err && err.classList.contains('error-message')) err.remove();
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.dup-cable').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const copy = JSON.parse(JSON.stringify(state.cableList[i]));
                copy.name = nextCableName(copy.name);
                state.cableList.splice(i + 1, 0, copy);
                updateCableListDisplay();
                saveSession();
            });
        });
        elements.cableListContainer.querySelectorAll('.del-cable').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList.splice(i, 1);
                updateCableListDisplay();
                saveSession();
            });
        });
        updateTableCounts();
        addSortHandlers(elements.cableListContainer, state.cableList, updateCableListDisplay, cableSort);
        filterTable(elements.cableListContainer, elements.cableSearch.value);
    };

    const loadSampleCables = () => {
        state.cableList = getSampleCables();
        updateCableListDisplay();
        updateTableCounts();
        saveSession();
    };

    const addCableToBatch = () => {
        const newCable = {
            name: nextCableName(),
            cable_type: 'Power',
            conductors: 1,
            conductor_size: '#12 AWG',
            diameter: 1.0,
            weight: 0,
            start: [0, 0, 0],
            end: [0, 0, 0],
            start_tag: '',
            end_tag: '',
            allowed_cable_group: '',
            manual_path: ''
        };
        setRacewayIds(newCable, []);
        state.cableList.push(newCable);
        updateCableListDisplay();
        updateTableCounts();
        saveSession();
    };

    const clearCableList = () => {
        state.cableList = [];
        updateCableListDisplay();
        updateTableCounts();
        saveSession();
    };

    const deleteSavedData = () => {
        ['ctrSession','cableSchedule','ductbankSchedule','traySchedule','conduitSchedule']
            .forEach(k => localStorage.removeItem(k));
        state.manualTrays = [];
        state.cableList = [];
        if (elements.manualTrayTableContainer) {
            elements.manualTrayTableContainer.innerHTML = '';
        }
        updateCableListDisplay();
        updateTrayDisplay();
        updateTableCounts();
        alert('All saved data cleared.');
    };

    const showMessage = (type, text) => {
        elements.messages.innerHTML += `<div class="message ${type}">${text}</div>`;
    };

    const exportRouteXLSX = () => {
        if (!state.latestRouteData || state.latestRouteData.length === 0) {
            alert('No route data to export.');
            return;
        }

        let data = state.latestRouteData;

        if (data[0].breakdown !== undefined) {
            const flat = [];
            data.forEach(row => {
                if (Array.isArray(row.breakdown) && row.breakdown.length > 0) {
                    row.breakdown.forEach(b => {
                        flat.push({
                            cable: row.cable,
                            total_length: row.total_length,
                            field_length: row.field_length,
                            tray_segments_count: row.tray_segments_count,
                            segments_count: row.segments_count,
                            segment: b.segment,
                            tray_id: b.tray_id,
                            conduit_id: b.conduit_id || '',
                            type: b.type,
                            from: b.from,
                            to: b.to,
                            length: b.length,
                            recommended_raceway: b.raceway || ''
                        });
                    });
                } else {
                    flat.push({
                        cable: row.cable,
                        total_length: row.total_length,
                        field_length: row.field_length,
                        tray_segments_count: row.tray_segments_count,
                        segments_count: row.segments_count,
                        segment: '', tray_id: '', type: '', from: '', to: '', length: '',
                        recommended_raceway: ''
                    });
                }
            });
            data = flat;
        }

        // remove status column if present
        data = data.map(row => {
            const { status, ...rest } = row;
            return rest;
        });

        const trayMap = new Map();
        state.latestRouteData.forEach(row => {
            if (Array.isArray(row.breakdown)) {
                row.breakdown.forEach(b => {
                    if (b.tray_id && b.tray_id !== 'Field Route' && b.tray_id !== 'N/A') {
                        if (!trayMap.has(b.tray_id)) trayMap.set(b.tray_id, new Set());
                        trayMap.get(b.tray_id).add(row.cable);
                    }
                });
            }
        });

        const groupMap = new Map(state.trayData.map(t => [t.tray_id, t.allowed_cable_group || '']));
        const trayList = Array.from(trayMap.entries()).map(([tray_id, cables]) => ({
            tray_id,
            allowed_cable_group: groupMap.get(tray_id) || '',
            cables: Array.from(cables).join(', ')
        }));

        const sharedRoutes = (state.sharedFieldRoutes || []).map(r => ({
            route_name: r.name,
            allowed_cable_group: r.allowed_cable_group || '',
            start: formatPoint(r.start),
            end: formatPoint(r.end),
            cables: r.cables.join(', '),
            recommendation: r.recommendation,
            trade_size: r.trade_size || '',
            tray_size: r.tray_size || ''
        }));

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws1, 'Route Data');
        const ws2 = XLSX.utils.json_to_sheet(trayList);
        XLSX.utils.book_append_sheet(wb, ws2, 'Tray Cable Map');
        if (sharedRoutes.length > 0) {
            const ws3 = XLSX.utils.json_to_sheet(sharedRoutes);
            XLSX.utils.book_append_sheet(wb, ws3, 'Shared Field Routes');
        }
        XLSX.writeFile(wb, 'route_data.xlsx');
    };

    const formatPoint = (p) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)})`;

    const getSegmentType = (seg) => {
        if (seg.type !== 'tray') return seg.type;
        const tray = state.trayData.find(t => t.tray_id === seg.tray_id);
        const rt = tray && tray.raceway_type ? tray.raceway_type : 'tray';
        return rt === 'ductbank' ? 'duct bank' : rt;
    };

    // Render a tray/cable combo to an image. We use JPEG instead of PNG so the
    // PDF export has a much smaller file size while retaining good quality.
    // The quality parameter can be tuned if needed.
    const renderTrayToPNG = (tray, cables, quality = 0.92) => {
        return new Promise(resolve => {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            const cleanup = () => document.body.removeChild(iframe);
            iframe.onload = () => {
                const doc = iframe.contentDocument;
                let attempts = 0;
                const grab = () => {
                    attempts++;
                    const expanded = doc && doc.querySelector('#expandedSVG svg');
                    if (expanded) {
                        const svgStr = new XMLSerializer().serializeToString(expanded);
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            const jpg = canvas.toDataURL('image/jpeg', quality);
                            cleanup();
                            resolve(jpg);
                        };
                        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
                        return;
                    }

                    const svgEl = doc && doc.querySelector('#svgContainer svg');
                    if (svgEl) {
                        const expandBtn = doc.getElementById('expandBtn');
                        if (expandBtn) expandBtn.click();
                    }
                    if (attempts > 50) {
                        console.warn('renderTrayToPNG timed out');
                        cleanup();
                        resolve(null);
                        return;
                    }
                    setTimeout(grab, 100);
                };
                grab();
            };
            try {
                localStorage.setItem('trayFillData', JSON.stringify({ tray, cables }));
            } catch {}
            iframe.src = 'cabletrayfill.html';
        });
    };

    const addUtilizationTableToPDF = (doc, utilData, pageMap = null) => {
        const margin = 20;
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        let y = margin;
        let currentPage = doc.internal.getCurrentPageInfo().pageNumber;

        const renderHeader = () => {
            doc.setFontSize(14);
            doc.text('Updated Tray Utilization', pageW / 2, y, { align: 'center' });
            y += 8;
            doc.setFontSize(10);
            doc.text('Tray ID', col1, y);
            doc.text('Util %', col2, y);
            doc.text('Available (in\u00b2)', col3, y);
            doc.text('Page', col4, y);
            y += rowHeight;
        };

        doc.setFontSize(10);
        const col1 = margin;
        const col2 = margin + 50;
        const col3 = margin + 100;
        const col4 = margin + 150;
        const rowHeight = 6;
        const rowWidth = pageW - margin * 2;

        renderHeader();

        const colorForUtil = (util) => {
            if (util > 80) return { fill: [248, 215, 218], text: [114, 28, 36] }; // error colors
            if (util > 60) return { fill: [255, 243, 205], text: [133, 100, 4] }; // warning colors
            return { fill: [212, 237, 218], text: [21, 87, 36] }; // success colors
        };

        utilData.forEach(row => {
            if (y > pageH - margin) {
                // draw bottom border before breaking
                doc.line(margin, y, pageW - margin, y);
                currentPage++;
                doc.setPage(currentPage);
                y = margin;
                renderHeader();
            }

            const trayText = String(row.tray_id);
            const pageNum = pageMap && pageMap[row.tray_id] ? pageMap[row.tray_id] : '';
            const utilPct = parseFloat(row.full_pct);
            const colors = colorForUtil(utilPct);

            doc.setFillColor(...colors.fill);
            doc.setDrawColor(0);
            doc.rect(margin, y - rowHeight + 2, rowWidth, rowHeight, 'FD');

            doc.setTextColor(...colors.text);
            doc.text(trayText, col1, y);
            if (pageMap && pageMap[row.tray_id]) {
                const textWidth = doc.getTextWidth(trayText);
                doc.link(col1, y - 3, textWidth, 4, { pageNumber: pageNum });
            }
            doc.text(utilPct.toFixed(1) + '%', col2, y);
            doc.text(String(row.available), col3, y);
            if (pageNum) {
                const txt = String(pageNum);
                doc.text(txt, col4, y);
                const width = doc.getTextWidth(txt);
                doc.link(col4, y - 3, width, 4, { pageNumber: pageNum });
            }
            doc.setTextColor(0);

            y += rowHeight;
        });
        // bottom border for last row
        doc.line(margin, y, pageW - margin, y);
    };

    const exportTrayFills = async () => {
        if (!state.updatedUtilData || state.updatedUtilData.length === 0) {
            alert('No tray fill data available.');
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('jsPDF library not loaded.');
            return;
        }
        const { jsPDF } = window.jspdf;

        const traysWithCables = state.updatedUtilData.filter(info => {
            const cables = state.trayCableMap && state.trayCableMap[info.tray_id];
            return cables && cables.length > 0;
        });
        const utilDataForExport = traysWithCables;

        if (traysWithCables.length === 0) {
            alert('No tray fills to export.');
            return;
        }

        elements.exportTrayFillsBtn.disabled = true;
        elements.progressContainer.style.display = 'block';
        elements.progressBar.style.width = '0%';
        elements.progressBar.setAttribute('aria-valuenow', '0');
        elements.progressLabel.textContent = 'Generating PDF...';

        const doc = new jsPDF({ compress: true });
        const margin = 20;
        const rowHeight = 6;
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();

        // calculate how many pages the utilization table will need
        const rowsPerPage = Math.max(1, Math.floor((pageH - margin - (margin + 8 + rowHeight)) / rowHeight));
        const tablePages = Math.max(1, Math.ceil(utilDataForExport.length / rowsPerPage));

        let y = 20;
        const pageMap = {};

        const getDims = (url) => new Promise(res => {
            const img = new Image();
            img.onload = () => res({ width: img.width, height: img.height });
            img.onerror = () => res({ width: 0, height: 0 });
            img.src = url;
        });

        for (let i = 0; i < traysWithCables.length; i++) {
            const info = traysWithCables[i];
            const trayId = info.tray_id;
            const tray = state.trayData.find(t => t.tray_id === trayId);
            if (!tray) continue;
            const cables = (state.trayCableMap && state.trayCableMap[trayId]) ? state.trayCableMap[trayId] : [];
            const jpg = await renderTrayToPNG(tray, cables);
            if (!jpg) continue;
            const dims = await getDims(jpg);
            let w = dims.width;
            let h = dims.height;
            const maxW = pageW - 40; // 20mm margins
            const maxH = pageH - 40;
            if (w > maxW) {
                h = h * (maxW / w);
                w = maxW;
            }
            if (h > maxH) {
                w = w * (maxH / h);
                h = maxH;
            }

            if (y > pageH - (h + 20)) {
                doc.addPage();
                y = 20;
            }
            const pageNum = doc.getNumberOfPages();
            pageMap[trayId] = pageNum;
            doc.outline.add(null, `Tray ${trayId}`, { pageNumber: pageNum });
            doc.text(`Tray ${trayId}`, 20, y);
            doc.addImage(jpg, 'JPEG', 20, y + 10, w, h);
            y += h + 20;

            const pct = Math.round(((i + 1) / traysWithCables.length) * 100);
            elements.progressBar.style.width = pct + '%';
            elements.progressBar.setAttribute('aria-valuenow', String(pct));
            elements.progressLabel.textContent = `Generating PDF (${i + 1}/${traysWithCables.length})`;
        }

        // insert table pages at the front and update page numbers
        for (let i = 0; i < tablePages; i++) {
            doc.insertPage(1);
        }
        Object.keys(pageMap).forEach(id => {
            pageMap[id] += tablePages;
        });

        doc.setPage(1);
        doc.outline.add(null, 'Tray Utilization', { pageNumber: 1 });
        addUtilizationTableToPDF(doc, utilDataForExport, pageMap);
        doc.save('tray_fills.pdf');
        elements.progressContainer.style.display = 'none';
        elements.exportTrayFillsBtn.disabled = false;
    };

    const cancelCurrentRouting = () => {
        cancelRouting = true;
        elements.cancelRoutingBtn.disabled = true;
        elements.progressLabel.textContent = 'Cancelling...';
        currentWorkers.forEach(w => {
            w.terminate();
            const res = workerResolvers.get(w);
            if (res) res({ cancelled: true });
        });
        currentWorkers = [];
        workerResolvers.clear();
        taskQueue.length = 0;
    };

    const mainCalculation = async () => {
        if (!validateInputs(['proximity-threshold','max-field-edge','field-route-penalty','shared-field-penalty'])) return;
        elements.resultsSection.style.display = 'block';
        elements.messages.innerHTML = '';
        elements.progressContainer.style.display = 'block';
        elements.progressBar.style.width = '0%';
        elements.progressBar.setAttribute('aria-valuenow', '0');
        elements.progressLabel.textContent = 'Starting...';
        elements.cancelRoutingBtn.style.display = 'block';
        elements.cancelRoutingBtn.disabled = false;
        cancelRouting = false;
        rebuildTrayData();

        // clear previous manual path validation errors
        if (elements.cableListContainer) {
            elements.cableListContainer.querySelectorAll('.cable-manual-input').forEach(input => {
                input.classList.remove('input-error');
                const err = input.nextElementSibling;
                if (err && err.classList.contains('error-message')) err.remove();
            });
        }
        if (elements.manualTrayTableContainer) {
            elements.manualTrayTableContainer.querySelectorAll('.tray-id-input').forEach(inp => inp.classList.remove('input-error'));
        }

        const routingSystem = new CableRoutingSystem({
            fillLimit: parseFloat(elements.fillLimitIn.value) / 100,
            proximityThreshold: parseFloat(document.getElementById('proximity-threshold').value),
            fieldPenalty: parseFloat(document.getElementById('field-route-penalty').value),
            sharedPenalty: parseFloat(document.getElementById('shared-field-penalty').value),
            maxFieldEdge: parseFloat(document.getElementById('max-field-edge').value),
            maxFieldNeighbors: 8
        });
        
        // Deep copy tray data so original state isn't mutated during batch routing
        const trayDataForRun = JSON.parse(JSON.stringify(state.trayData));
        trayDataForRun.forEach(tray => routingSystem.addTraySegment(tray));
        routingSystem.prepareBaseGraph();

        const showManualPathError = (idx, message, trayId) => {
            const input = elements.cableListContainer.querySelector(`.cable-manual-input[data-idx='${idx}']`);
            if (input) {
                input.classList.add('input-error');
                let msg = input.nextElementSibling;
                if (!msg || !msg.classList.contains('error-message')) {
                    msg = document.createElement('span');
                    msg.className = 'error-message';
                    input.insertAdjacentElement('afterend', msg);
                }
                msg.textContent = message;
            }
            if (trayId && elements.manualTrayTableContainer) {
                const trayInput = elements.manualTrayTableContainer.querySelector(`.tray-id-input[value='${trayId}']`);
                if (trayInput) trayInput.classList.add('input-error');
            }
        };

        const validateManualPath = (manualPath, cableArea, allowedGroup) => {
            const path = (manualPath || '').trim();
            if (!path) return null;
            const trayIds = path.split(/[>\s]+/).filter(Boolean);
            for (const id of trayIds) {
                const tray = routingSystem.trays.get(id);
                if (!tray) return { message: `Tray ${id} not found`, trayId: id, reason: 'not_found' };
                if (tray.allowed_cable_group && allowedGroup && tray.allowed_cable_group !== allowedGroup) {
                    return { message: `Tray ${id} not allowed`, trayId: id, reason: 'not_allowed' };
                }
                if (tray.current_fill + cableArea > tray.maxFill) {
                    return { message: `Tray ${id} over capacity`, trayId: id, reason: 'over_capacity' };
                }
            }
            return null;
        };

        if (state.cableList.length > 0) {
            const batchResults = [];
            const allRoutesForPlotting = [];

            let completed = 0;
            const runCable = (cable, index) => {
                const cableArea = Math.PI * (cable.diameter / 2) ** 2;
                const validationError = validateManualPath(cable.manual_path, cableArea, cable.allowed_cable_group);
                let promise;
                if (validationError) {
                    showManualPathError(index, validationError.message, validationError.trayId);
                    promise = Promise.resolve({
                        success: false,
                        manual: true,
                        manual_raceway: false,
                        message: validationError.message,
                        error: { tray_id: validationError.trayId, reason: validationError.reason }
                    });
                } else {
                    const startTask = (resolve, reject) => {
                        if (cancelRouting) { resolve({ cancelled: true }); return; }
                        const worker = new Worker('routeWorker.js');
                        currentWorkers.push(worker);
                        workerResolvers.set(worker, resolve);
                        const cleanup = () => {
                            worker.terminate();
                            currentWorkers = currentWorkers.filter(w => w !== worker);
                            workerResolvers.delete(worker);
                            if (taskQueue.length > 0 && !cancelRouting) {
                                const next = taskQueue.shift();
                                next();
                            }
                        };
                        worker.onmessage = e => { cleanup(); resolve(e.data); };
                        worker.onerror = err => { cleanup(); reject(err); };
                        worker.postMessage({
                            trays: Array.from(routingSystem.trays.values()),
                            options: {
                                fillLimit: routingSystem.fillLimit,
                                proximityThreshold: routingSystem.proximityThreshold,
                                fieldPenalty: routingSystem.fieldPenalty,
                                sharedPenalty: routingSystem.sharedPenalty,
                                maxFieldEdge: routingSystem.maxFieldEdge,
                                maxFieldNeighbors: routingSystem.maxFieldNeighbors
                            },
                            baseGraph: routingSystem.baseGraph,
                            cable,
                            cableArea
                        });
                    };
                    promise = new Promise((resolve, reject) => {
                        const task = () => startTask(resolve, reject);
                        if (currentWorkers.length < maxWorkers) {
                            task();
                        } else {
                            taskQueue.push(task);
                        }
                    });
                }
                return promise.then(result => {
                    completed++;
                    const pct = (completed / state.cableList.length) * 100;
                    elements.progressBar.style.width = `${pct}%`;
                    elements.progressBar.setAttribute('aria-valuenow', Math.round(pct).toString());
                    elements.progressLabel.textContent = `Routing (${completed}/${state.cableList.length})`;
                    if (!cancelRouting && !result.cancelled) {
                        if (result.success) {
                            routingSystem.updateTrayFill(result.tray_segments, cableArea);
                            routingSystem.recordSharedFieldSegments(result.route_segments);
                            allRoutesForPlotting.push({
                                label: cable.name,
                                segments: result.route_segments,
                                startPoint: cable.start,
                                endPoint: cable.end,
                                startTag: cable.start_tag,
                                endTag: cable.end_tag,
                                allowed_cable_group: cable.allowed_cable_group
                            });
                        } else {
                            showManualPathError(index, result.message, result.error && result.error.tray_id);
                        }
                        batchResults[index] = {
                                cable: cable.name,
                                status: result.success ? '✓ Routed' : '✗ Failed',
                                mode: result.manual
                                    ? (result.manual_raceway ? 'Manual Raceway' : 'Manual Path')
                                    : 'Automatic',
                                manual_raceway: !!result.manual_raceway,
                                total_length: result.success ? result.total_length.toFixed(2) : 'N/A',
                                field_length: result.success ? result.field_routed_length.toFixed(2) : 'N/A',
                                tray_segments_count: result.success ? result.tray_segments.length : 0,
                                segments_count: result.success ? result.route_segments.length : 0,
                                tray_segments: result.success ? result.tray_segments : [],
                                route_segments: result.success ? result.route_segments : [],
                        exclusions: result.exclusions || [],
                                breakdown: result.success ? result.route_segments.map((seg, i) => {
                                let tray_id = seg.type === 'field' ? 'Field Route' : (seg.tray_id || 'N/A');
                                let type = getSegmentType(seg);
                                let raceway = '';
                                let conduit_id = seg.conduit_id || '';
                                return {
                                    segment: i + 1,
                                    tray_id,
                                    type,
                                    from: formatPoint(seg.start),
                                    to: formatPoint(seg.end),
                                    length: seg.length.toFixed(2),
                                    raceway,
                                    conduit_id,
                                    ductbank_id: seg.ductbank_id
                                };
                            }) : []
                        };
                    }
                });
            };

            const workerPromises = state.cableList.map((c, idx) => runCable(c, idx));
            await Promise.all(workerPromises);

            if (cancelRouting) {
                elements.progressLabel.textContent = 'Cancelled';
                elements.progressContainer.style.display = 'none';
                elements.cancelRoutingBtn.style.display = 'none';
                return;
            }

            buildFieldSegmentCableMap(batchResults);
            state.latestRouteData = batchResults;
            renderBatchResults(batchResults);
            const nameMap = new Map(state.cableList.map(c => [c.name, c]));
            state.trayCableMap = {};
            batchResults.forEach(row => {
                const cableObj = nameMap.get(row.cable);
                if (!cableObj || !Array.isArray(row.breakdown)) return;
                row.breakdown.forEach(b => {
                    if (b.tray_id && b.tray_id !== 'Field Route' && b.tray_id !== 'N/A') {
                        if (!state.trayCableMap[b.tray_id]) state.trayCableMap[b.tray_id] = [];
                        const entry = b.conduit_id ? { ...cableObj, conduit_id: b.conduit_id } : cableObj;
                        const exists = state.trayCableMap[b.tray_id].some(c =>
                            c.name === entry.name && (!entry.conduit_id || c.conduit_id === entry.conduit_id)
                        );
                        if (!exists) {
                            state.trayCableMap[b.tray_id].push(entry);
                        }
                    }
                });
            });
            const cableMapForArea = new Map(state.cableList.map(c => [c.name, c.diameter]));
            const cableMapForObj = new Map(state.cableList.map(c => [c.name, c]));
            const commonRaw = routingSystem.findCommonFieldRoutes(allRoutesForPlotting, 6, cableMapForArea);
            const common = commonRaw.map(r => {
                const areas = r.cables.map(n => {
                    const d = cableMapForArea.get(n);
                    return d ? Math.PI * (d / 2) ** 2 : 0;
                });
                const totalArea = areas.reduce((a,b) => a + b, 0);
                const count = r.cables.length;
                let recommendation;
                if (count <= CONTAINMENT_RULES.thresholds.conduit) recommendation = 'conduit';
                else if (count <= CONTAINMENT_RULES.thresholds.channel) recommendation = 'channel';
                else recommendation = 'tray';
                let tradeSize = null;
                let traySize = null;
                if (recommendation === 'conduit') {
                    const conduitType = elements.conduitType.value;
                    const spec = CONDUIT_SPECS[conduitType] || {};
                    /* NEC Chapter 9 Table 1 fill limits (see docs/standards.md) */
                    const fillPct = count === 1 ? 0.53 : count === 2 ? 0.31 : 0.40;
                    for (const size of Object.keys(spec)) {
                        if (totalArea <= spec[size] * fillPct) { tradeSize = size; break; }
                    }
                    if (!tradeSize) tradeSize = 'N/A';
                } else {
                    const cableObjs = r.cables.map(n => cableMapForObj.get(n)).filter(Boolean);
                    traySize = computeNeededTrayWidth(cableObjs) || null;
                }
                return { ...r, total_area: totalArea, cable_count: count, recommendation, trade_size: tradeSize, tray_size: traySize };
            });
            state.sharedFieldRoutes = common;
            if (common.length > 0) {
                let html = '<details><summary>Potential Shared Field Routes</summary><ul>';
                common.forEach((c, idx) => {
                    const group = c.allowed_cable_group ? ` (Group ${c.allowed_cable_group})` : '';
                    let recText = c.recommendation;
                    if (c.recommendation === 'conduit' && c.trade_size && c.trade_size !== 'N/A') {
                        recText = `Recommended: ${c.trade_size}" Conduit`;
                    } else if ((c.recommendation === 'tray' || c.recommendation === 'channel') && c.tray_size) {
                        const label = c.recommendation === 'tray' ? 'Tray' : 'Channel';
                        recText = `Recommended: ${c.tray_size}" ${label}`;
                    } else {
                        const label = c.recommendation.charAt(0).toUpperCase() + c.recommendation.slice(1);
                        recText = `Recommended: ${label}`;
                    }
                    let fillLink = '';
                    if (c.recommendation === 'conduit') {
                        fillLink = ` <a href="#" class="conduit-fill-link" data-route-index="${idx}">Fill</a>`;
                    }
                    html += `<li class="shared-route-item" data-route-index="${idx}">${c.name}${group}: ${formatPoint(c.start)} to ${formatPoint(c.end)} - ${c.cables.join(', ')} | ${recText}${fillLink}</li>`;
                });
                html += '</ul></details>';
                elements.metrics.innerHTML = html;
                elements.metrics.querySelectorAll('.shared-route-item').forEach(li => {
                    li.style.cursor = 'pointer';
                    li.addEventListener('click', () => highlightSharedRoute(parseInt(li.dataset.routeIndex, 10)));
                });
                elements.metrics.querySelectorAll('.conduit-fill-link').forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const idx = parseInt(link.dataset.routeIndex, 10);
                        const route = state.sharedFieldRoutes[idx];
                        if (route) {
                            const cables = route.cables.map(n => state.cableList.find(c => c.name === n)).filter(Boolean);
                            openConduitFill(cables);
                        }
                    });
                });
            } else {
                elements.metrics.innerHTML = '<p>No common field routes detected.</p>';
            }
            visualize(trayDataForRun, allRoutesForPlotting, "Batch Route Visualization");
        } else {
            alert('Please add at least one cable to route.');
            elements.cancelRoutingBtn.style.display = 'none';
            elements.progressContainer.style.display = 'none';
            return;
        }
        
        const finalUtilization = routingSystem.getTrayUtilization();
        const fillLimit = parseFloat(elements.fillLimitIn.value) / 100;
        const utilData = Object.entries(finalUtilization).map(([id, data]) => {
            const fullPct = (data.current_fill * fillLimit / data.max_fill) * 100;
            return {
                tray_id: id,
                full_pct: fullPct,
                utilization: data.utilization_percentage.toFixed(1),
                available: data.available_capacity.toFixed(2),
                fill: `<button class="fill-btn" data-tray="${id}">Open</button>`
            };
        });
        state.finalTrays = Array.from(routingSystem.trays.values()).map(t => ({ ...t }));
        state.updatedUtilData = utilData;
        renderUpdatedUtilizationTable();

        elements.progressLabel.textContent = 'Complete';
        elements.progressContainer.style.display = 'none';
        elements.cancelRoutingBtn.style.display = 'none';
    };

    const sleep = (ms = 0) => new Promise(res => setTimeout(res, ms));

    const rebalanceTrayFill = async () => {
        if (!state.finalTrays || state.finalTrays.length === 0) {
            alert('Run routing first.');
            return;
        }

        const fillLimit = parseFloat(elements.fillLimitIn.value) / 100;
        const routingSystem = new CableRoutingSystem({
            fillLimit,
            proximityThreshold: parseFloat(document.getElementById('proximity-threshold').value),
            fieldPenalty: parseFloat(document.getElementById('field-route-penalty').value),
            sharedPenalty: parseFloat(document.getElementById('shared-field-penalty').value),
            maxFieldEdge: parseFloat(document.getElementById('max-field-edge').value),
            maxFieldNeighbors: 8
        });

        const trayData = state.finalTrays.map(t => ({ ...t }));
        trayData.forEach(t => routingSystem.addTraySegment(t));
        routingSystem.prepareBaseGraph();

        const overfilled = trayData.filter(t => t.current_fill > t.maxFill);
        if (overfilled.length === 0) {
            alert('No overfilled trays detected.');
            return;
        }

        elements.progressContainer.style.display = 'block';
        elements.progressBar.style.width = '0%';
        elements.progressBar.setAttribute('aria-valuenow', '0');
        elements.progressLabel.textContent = 'Rebalancing...';

        const cableMap = new Map(state.cableList.map(c => [c.name, c]));
        const resultMap = new Map(state.latestRouteData.map((r, i) => [r.cable, { row: r, index: i }]));
        const cablesToReroute = new Set();
        overfilled.forEach(t => {
            const cabs = state.trayCableMap[t.tray_id] || [];
            cabs.forEach(c => cablesToReroute.add(c.name));
        });

        let completed = 0;
        const total = cablesToReroute.size;
        for (const name of cablesToReroute) {
            const cable = cableMap.get(name);
            const info = resultMap.get(name);
            if (!cable || !info) return;
            const area = Math.PI * (cable.diameter / 2) ** 2;
            if (Array.isArray(info.row.tray_segments)) {
                routingSystem.updateTrayFill(info.row.tray_segments, -area);
            }
            const res = routingSystem.calculateRoute(cable.start, cable.end, area, cable.allowed_cable_group);
            if (res.success) {
                routingSystem.updateTrayFill(res.tray_segments, area);
                routingSystem.recordSharedFieldSegments(res.route_segments);
                info.row = {
                    cable: cable.name,
                    status: '✓ Routed',
                    total_length: res.total_length.toFixed(2),
                    field_length: res.field_routed_length.toFixed(2),
                    tray_segments_count: res.tray_segments.length,
                    segments_count: res.route_segments.length,
                    tray_segments: res.tray_segments,
                    route_segments: res.route_segments,
                    breakdown: res.route_segments.map((seg, i) => {
                        let tray_id = seg.type === 'field' ? 'Field Route' : (seg.tray_id || 'N/A');
                        let type = getSegmentType(seg);
                        let raceway = '';
                        let conduit_id = seg.conduit_id || '';
                        return {
                            segment: i + 1,
                            tray_id,
                            type,
                            from: formatPoint(seg.start),
                            to: formatPoint(seg.end),
                            length: seg.length.toFixed(2),
                            raceway,
                            conduit_id,
                            ductbank_id: seg.ductbank_id
                        };
                    })
                };
                resultMap.set(name, info);
            } else {
                routingSystem.updateTrayFill(info.row.tray_segments, area);
            }
            completed++;
            const pct = Math.round((completed / total) * 100);
            elements.progressBar.style.width = pct + '%';
            elements.progressBar.setAttribute('aria-valuenow', String(pct));
            elements.progressLabel.textContent = `Rebalancing (${completed}/${total})`;
            await sleep();
        }

        state.latestRouteData = Array.from(resultMap.values()).sort((a,b) => a.index - b.index).map(v => v.row);
        buildFieldSegmentCableMap(state.latestRouteData);

        const nameMap = new Map(state.cableList.map(c => [c.name, c]));
        state.trayCableMap = {};
        state.latestRouteData.forEach(row => {
            const cableObj = nameMap.get(row.cable);
            if (!cableObj || !Array.isArray(row.breakdown)) return;
            row.breakdown.forEach(b => {
                if (b.tray_id && b.tray_id !== 'Field Route' && b.tray_id !== 'N/A') {
                    if (!state.trayCableMap[b.tray_id]) state.trayCableMap[b.tray_id] = [];
                    const entry = b.conduit_id ? { ...cableObj, conduit_id: b.conduit_id } : cableObj;
                    const exists = state.trayCableMap[b.tray_id].some(c =>
                        c.name === entry.name && (!entry.conduit_id || c.conduit_id === entry.conduit_id)
                    );
                    if (!exists) {
                        state.trayCableMap[b.tray_id].push(entry);
                    }
                }
            });
        });

        const finalUtilization = routingSystem.getTrayUtilization();
        const utilData = Object.entries(finalUtilization).map(([id, data]) => {
            const fullPct = (data.current_fill * fillLimit / data.max_fill) * 100;
            return {
                tray_id: id,
                full_pct: fullPct,
                utilization: data.utilization_percentage.toFixed(1),
                available: data.available_capacity.toFixed(2),
                fill: `<button class="fill-btn" data-tray="${id}">Open</button>`
            };
        });

        state.finalTrays = Array.from(routingSystem.trays.values()).map(t => ({ ...t }));
        state.updatedUtilData = utilData;
        renderBatchResults(state.latestRouteData);
        renderUpdatedUtilizationTable();

        const plotRoutes = state.latestRouteData.map(row => ({
            label: row.cable,
            segments: row.route_segments,
            startPoint: cableMap.get(row.cable).start,
            endPoint: cableMap.get(row.cable).end,
            startTag: cableMap.get(row.cable).start_tag,
            endTag: cableMap.get(row.cable).end_tag,
            allowed_cable_group: cableMap.get(row.cable).allowed_cable_group
        }));
        visualize(state.finalTrays, plotRoutes, 'Rebalanced Routes');

        elements.progressLabel.textContent = 'Complete';
        elements.progressContainer.style.display = 'none';
    };
    
    // --- VISUALIZATION ---
    const visualize = (trays, routes, title) => {
        const traces = [];

        const meshForSegment = (s, e, tray) => {
            const w = tray.width / 12;
            const h = tray.height / 12;
            const sx = s[0], sy = s[1], sz = s[2];
            const ex = e[0], ey = e[1], ez = e[2];
            let verts;
            if (sx !== ex) {
                const y1 = sy - w / 2, y2 = sy + w / 2;
                const z1 = sz - h / 2, z2 = sz + h / 2;
                verts = [[sx,y1,z1],[sx,y2,z1],[sx,y2,z2],[sx,y1,z2],[ex,y1,z1],[ex,y2,z1],[ex,y2,z2],[ex,y1,z2]];
            } else if (sy !== ey) {
                const x1 = sx - w / 2, x2 = sx + w / 2;
                const z1 = sz - h / 2, z2 = sz + h / 2;
                verts = [[x1,sy,z1],[x2,sy,z1],[x2,sy,z2],[x1,sy,z2],[x1,ey,z1],[x2,ey,z1],[x2,ey,z2],[x1,ey,z2]];
            } else {
                const x1 = sx - w / 2, x2 = sx + w / 2;
                const y1 = sy - h / 2, y2 = sy + h / 2;
                verts = [[x1,y1,sz],[x2,y1,sz],[x2,y2,sz],[x1,y2,sz],[x1,y1,ez],[x2,y1,ez],[x2,y2,ez],[x1,y2,ez]];
            }
            const x = verts.map(v => v[0]);
            const y = verts.map(v => v[1]);
            const z = verts.map(v => v[2]);
            const i = [0,0,4,4,3,3,0,0,0,0,1,1];
            const j = [1,2,5,6,2,6,1,5,3,7,2,6];
            const k = [2,3,6,7,6,7,5,4,7,4,6,5];
            const color = tray.raceway_type === 'conduit'
                ? 'black'
                : tray.raceway_type === 'ductbank'
                    ? 'saddlebrown'
                    : SHAPE_COLORS[tray.shape] || 'lightgrey';
            const typeText = tray.raceway_type || tray.shape || 'STR';
            const text = `${tray.tray_id} (${typeText})`;
            return {type:'mesh3d', x, y, z, i, j, k, opacity:0.3, color, name: tray.tray_id, hoverinfo:'text', text:[text]};
        };

        const trayMesh = (tray) => {
            const start = [tray.start_x, tray.start_y, tray.start_z];
            const end = [tray.end_x, tray.end_y, tray.end_z];
            const segments = [];
            let cur = start.slice();
            if (cur[0] !== end[0]) { const n=[end[0],cur[1],cur[2]]; segments.push([cur,n]); cur=n; }
            if (cur[1] !== end[1]) { const n=[cur[0],end[1],cur[2]]; segments.push([cur,n]); cur=n; }
            if (cur[2] !== end[2]) { const n=[cur[0],cur[1],end[2]]; segments.push([cur,n]); cur=n; }
            if (segments.length === 0) segments.push([start,end]);
            return segments.map(seg => meshForSegment(seg[0], seg[1], tray));
        };

        trays.forEach(tray => {
            trayMesh(tray).forEach(t => traces.push(t));
            const midX = (tray.start_x + tray.end_x) / 2;
            const midY = (tray.start_y + tray.end_y) / 2;
            const midZ = (tray.start_z + tray.end_z) / 2 + (tray.height / 12) / 2 + 0.5;
            traces.push({type:'scatter3d', mode:'text', x:[midX], y:[midY], z:[midZ], text:[tray.tray_id], showlegend:false, hoverinfo:'none'});
        });

        if (routes && routes.length > 0) {
            // Sort routes alphanumerically by label so the legend order is predictable
            routes = routes.slice().sort((a, b) => {
                const la = a.label || '';
                const lb = b.label || '';
                return la.localeCompare(lb, undefined, { numeric: true, sensitivity: 'base' });
            });

            const palette = ['blue', 'green', 'orange', 'purple', 'brown', 'cyan', 'magenta', 'olive'];
            const seenTags = new Set();

            routes.forEach((route, idx) => {
                const color = palette[idx % palette.length];
                const label = route.label || `Route ${idx+1}`;

                // Placeholder trace to show legend entry without drawing a line
                traces.push({
                    x: [null], y: [null], z: [null],
                    mode: 'lines', type: 'scatter3d',
                    name: label, legendgroup: label, showlegend: true,
                    line: { color, width: 5 }, hoverinfo: 'skip'
                });

                route.segments.forEach(seg => {
                    traces.push({
                        x: [seg.start[0], seg.end[0]], y: [seg.start[1], seg.end[1]], z: [seg.start[2], seg.end[2]],
                        mode: 'lines', type: 'scatter3d',
                        name: label, legendgroup: label, showlegend: false,
                        line: { color: seg.type === 'tray' ? color : 'red', width: 5 }
                    });
                });

                if (route.startPoint && route.endPoint) {
                    traces.push({
                        x: [route.startPoint[0]], y: [route.startPoint[1]], z: [route.startPoint[2]],
                        mode: 'markers', type: 'scatter3d', showlegend: false,
                        marker: { color: 'green', size: 8 }
                    });
                    traces.push({
                        x: [route.endPoint[0]], y: [route.endPoint[1]], z: [route.endPoint[2]],
                        mode: 'markers', type: 'scatter3d', showlegend: false,
                        marker: { color: 'purple', size: 8 }
                    });
                    if (route.startTag && !seenTags.has(`s-${route.startTag}`)) {
                        traces.push({type:'scatter3d', mode:'text', x:[route.startPoint[0]], y:[route.startPoint[1]], z:[route.startPoint[2]], text:[route.startTag], showlegend:false, hoverinfo:'none'});
                        seenTags.add(`s-${route.startTag}`);
                    }
                    if (route.endTag && !seenTags.has(`e-${route.endTag}`)) {
                        traces.push({type:'scatter3d', mode:'text', x:[route.endPoint[0]], y:[route.endPoint[1]], z:[route.endPoint[2]], text:[route.endTag], showlegend:false, hoverinfo:'none'});
                        seenTags.add(`e-${route.endTag}`);
                    }
                }
            });
        }

        // ductbank and conduit geometries are rendered as tray segments now

    const layout = {
        title: title,
        scene: { aspectmode: 'data' },
        legend: { x: 1, y: 0, xanchor: 'right', yanchor: 'bottom' },
        autosize: true,
        margin: { l: 0, r: 0, t: 0, b: 0 }
    };
    Plotly.newPlot(elements.plot3d, traces, layout, {responsive: true});
    window.current3DPlot = { traces: traces, layout: layout };
    window.base3DPlot = {
        traces: JSON.parse(JSON.stringify(traces)),
        layout: JSON.parse(JSON.stringify(layout))
    };
    };

    const update3DPlot = () => {
        const trays = state.finalTrays.length ? state.finalTrays : state.trayData;
        let routes = [];
        if (state.latestRouteData && state.latestRouteData.length) {
            routes = state.latestRouteData.map(r => ({
                label: r.cable,
                segments: r.route_segments
            }));
        }
        visualize(trays, routes, '3D View');
    };

    const highlightSharedRoute = (idx) => {
        if (!window.current3DPlot || !state.sharedFieldRoutes[idx]) return;
        const route = state.sharedFieldRoutes[idx];
        let traces = window.current3DPlot.traces.filter(t => t.name !== '__shared_highlight__');
        traces.push({
            x: [route.start[0], route.end[0]],
            y: [route.start[1], route.end[1]],
            z: [route.start[2], route.end[2]],
            mode: 'lines', type: 'scatter3d',
            line: { color: 'hotpink', width: 15 },
            name: '__shared_highlight__', showlegend: false
        });
        const layout = window.current3DPlot.layout;
        const cx = (route.start[0] + route.end[0]) / 2;
        const cy = (route.start[1] + route.end[1]) / 2;
        const cz = (route.start[2] + route.end[2]) / 2;

        const xr = layout.scene.xaxis ? layout.scene.xaxis.range : undefined;
        const yr = layout.scene.yaxis ? layout.scene.yaxis.range : undefined;
        const zr = layout.scene.zaxis ? layout.scene.zaxis.range : undefined;

        const def = (a, b) => (Array.isArray(a) && a[0] != null && a[1] != null) ? a : b;

        const dx = Math.abs(route.start[0] - route.end[0]);
        const dy = Math.abs(route.start[1] - route.end[1]);
        const dz = Math.abs(route.start[2] - route.end[2]);

        const defaultX = [cx - Math.max(dx * 2, 10), cx + Math.max(dx * 2, 10)];
        const defaultY = [cy - Math.max(dy * 2, 10), cy + Math.max(dy * 2, 10)];
        const defaultZ = [cz - Math.max(dz * 2, 10), cz + Math.max(dz * 2, 10)];

        const xrFinal = def(xr, defaultX);
        const yrFinal = def(yr, defaultY);
        const zrFinal = def(zr, defaultZ);

        const xw = xrFinal[1] - xrFinal[0];
        const yw = yrFinal[1] - yrFinal[0];
        const zw = zrFinal[1] - zrFinal[0];

        layout.scene.xaxis = layout.scene.xaxis || {};
        layout.scene.yaxis = layout.scene.yaxis || {};
        layout.scene.zaxis = layout.scene.zaxis || {};
        layout.scene.xaxis.range = [cx - xw / 2, cx + xw / 2];
        layout.scene.yaxis.range = [cy - yw / 2, cy + yw / 2];
        layout.scene.zaxis.range = [cz - zw / 2, cz + zw / 2];

        Plotly.react(elements.plot3d, traces, layout);
        window.current3DPlot.traces = traces;
        window.current3DPlot.layout = layout;
    };

    const updateDuctbankVisibility = (visible) => {
        if (!window.current3DPlot || state.ductbankTraceIndices.length === 0) return;
        const vis = visible ? true : false;
        Plotly.restyle(elements.plot3d, { visible: vis }, state.ductbankTraceIndices);
        state.ductbankVisible = visible;
        state.ductbankTraceIndices.forEach(i => {
            if (window.current3DPlot.traces[i]) {
                window.current3DPlot.traces[i].visible = vis;
            }
        });
    };

    const reset3DView = () => {
        if (!window.base3DPlot) return;
        const traces = JSON.parse(JSON.stringify(window.base3DPlot.traces));
        const layout = JSON.parse(JSON.stringify(window.base3DPlot.layout));
        Plotly.react(elements.plot3d, traces, layout);
        window.current3DPlot = { traces, layout };
        updateDuctbankVisibility(state.ductbankVisible);
    };

    const popOutPlot = () => {
        if (!window.current3DPlot) return;
        const html = `<!DOCTYPE html>
<html><head><title>3D Route Visualization</title>
<meta charset="UTF-8">
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"><\/script>
<style>html,body{margin:0;height:100%;overflow:hidden;}#plot{width:100%;height:100%;}</style>
</head><body>
<div id="plot"></div>
<script>const data = ${JSON.stringify(window.current3DPlot.traces)};
const layout = ${JSON.stringify(window.current3DPlot.layout)};
Plotly.newPlot(document.getElementById('plot'), data, layout, {responsive: true});<\/script>
</body></html>`;
        const pop = window.open('', '_blank');
        if (pop) { pop.document.write(html); pop.document.close(); }
    };
    
    
    // --- INITIALIZATION & EVENT LISTENERS ---
    elements.fillLimitIn.addEventListener('input', updateFillLimitDisplay);
    const proximityInput = document.getElementById('proximity-threshold');
    if (proximityInput) proximityInput.addEventListener('change', saveSession);
    elements.calculateBtn.addEventListener('click', mainCalculation);
    if (elements.loadSampleTraysBtn) {
        elements.loadSampleTraysBtn.addEventListener('click', loadSampleTrays);
    }
    elements.addTrayBtn.addEventListener('click', addManualTray);
    elements.clearTraysBtn.addEventListener('click', clearManualTrays);
    elements.exportTraysBtn.addEventListener('click', exportManualTraysCSV);
    elements.importTraysBtn.addEventListener('click', () => elements.importTraysFile.click());
    elements.importTraysFile.addEventListener('change', importManualTraysCSV);
    elements.loadSampleCablesBtn.addEventListener('click', loadSampleCables);
    elements.addCableBtn.addEventListener('click', addCableToBatch);
    elements.clearCablesBtn.addEventListener('click', clearCableList);
    elements.exportCablesBtn.addEventListener('click', exportCableOptionsCSV);
    elements.importCablesBtn.addEventListener('click', () => elements.importCablesFile.click());
    elements.importCablesFile.addEventListener('change', importCableOptionsCSV);
    elements.exportCsvBtn.addEventListener('click', exportRouteXLSX);
    if (elements.rebalanceBtn) {
        elements.rebalanceBtn.addEventListener('click', rebalanceTrayFill);
    }
    if (elements.openFillBtn) {
        elements.openFillBtn.addEventListener('click', () => {
            window.open('cabletrayfill.html', '_blank');
        });
    }
    if (elements.exportTrayFillsBtn) {
        elements.exportTrayFillsBtn.addEventListener('click', exportTrayFills);
    }
    elements.popoutPlotBtn.addEventListener('click', popOutPlot);
    if (elements.resetViewBtn) {
        elements.resetViewBtn.addEventListener('click', reset3DView);
    }
    if (elements.ductbankToggle) {
        elements.ductbankToggle.addEventListener('change', e => updateDuctbankVisibility(e.target.checked));
    }
    elements.cancelRoutingBtn.addEventListener('click', cancelCurrentRouting);
    if (elements.deleteDataBtn) {
        elements.deleteDataBtn.addEventListener('click', deleteSavedData);
    }
    if (elements.traySearch) {
        elements.traySearch.addEventListener('input', () => filterTable(elements.manualTrayTableContainer, elements.traySearch.value));
    }
    if (elements.cableSearch) {
        elements.cableSearch.addEventListener('input', () => filterTable(elements.cableListContainer, elements.cableSearch.value));
    }

    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'r') elements.calculateBtn.click();
        if (e.key === 'c') document.getElementById('cable-list-details').open = !document.getElementById('cable-list-details').open;
        if (e.key === 't') document.getElementById('manual-tray-table-details').open = !document.getElementById('manual-tray-table-details').open;
    });

    window.addEventListener('beforeunload', saveSession);

    // remove validation error highlight when typing
    document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', () => {
            el.classList.remove('input-error');
            const err = el.nextElementSibling;
            if (err && err.classList.contains('error-message')) err.remove();
        });
    });
    // Initial setup
    loadSession();
    const hadSession = state.manualTrays.length > 0 || state.cableList.length > 0;
    const trayKey = globalThis.TableUtils?.STORAGE_KEYS?.traySchedule || 'traySchedule';
    const cableKey = globalThis.TableUtils?.STORAGE_KEYS?.cableSchedule || 'cableSchedule';
    const hasSaved = hadSession || localStorage.getItem(trayKey) || localStorage.getItem(cableKey);

    const finalizeLoad = () => {
        renderManualTrayTable();
        updateCableListDisplay();
        rebuildTrayData();
        updateTrayDisplay();
        loadDuctbankData();
    };

    if (hasSaved) {
        const modal = elements.resumeModal;
        const yesBtn = elements.resumeYesBtn;
        const noBtn = elements.resumeNoBtn;
        if (modal && yesBtn && noBtn) {
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            yesBtn.focus();
            const close = () => {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
                if (modal.contains(document.activeElement)) {
                    document.activeElement.blur();
                }
            };
            yesBtn.addEventListener('click', async () => {
                close();
                await loadSchedulesIntoSession();
                finalizeLoad();
            }, { once: true });
            noBtn.addEventListener('click', async () => {
                close();
                state.manualTrays = [];
                state.cableList = [];
                saveSession();
                localStorage.removeItem(trayKey);
                localStorage.removeItem(cableKey);
                renderManualTrayTable();
                updateCableListDisplay();
                rebuildTrayData();
                updateTrayDisplay();
                await loadDuctbankData();
            }, { once: true });
        } else {
            await loadSchedulesIntoSession();
            finalizeLoad();
        }
    } else {
        renderManualTrayTable();
        updateCableListDisplay();
        rebuildTrayData();
        updateTrayDisplay();
        loadDuctbankData();
    }
});
