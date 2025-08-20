export const sampleDuctbanks = Array.from({length:20}, (_,i) => {
  const idx = i + 1;
  const tag = `DB-${String(idx).padStart(2,'0')}`;
  const baseY = i*10;
  return {
    tag,
    from: `SUBSTA-${Math.floor(i/5)+1}`,
    to: `BLDG-${String(idx).padStart(2,'0')}`,
    concrete_encasement: false,
    start_x: 0,
    start_y: baseY,
    start_z: 0,
    end_x: 100,
    end_y: baseY,
    end_z: 0,
  };
});

export const sampleTrays = Array.from({length:17}, (_,i) => {
  const idx = i + 1;
  const baseY = i*5;
  return {
    tray_id: `TRAY-${String(idx).padStart(2,'0')}`,
    start_x: 0,
    start_y: baseY,
    start_z: 0,
    end_x: 50,
    end_y: baseY,
    end_z: 0,
    inside_width: 24,
    tray_depth: 4,
    tray_type: 'Ladder (50 % fill)',
    allowed_cable_group: ''
  };
});

export const sampleConduits = (() => {
  const arr = [];
  sampleDuctbanks.forEach((db,i) => {
    for (let j=1;j<=3;j++) {
      arr.push({
        ductbankTag: db.tag,
        conduit_id: `${db.tag}-C${j}`,
        type: 'PVC Sch 40',
        trade_size: '4',
        start_x: 0,
        start_y: i*10,
        start_z: 0,
        end_x: 100,
        end_y: i*10,
        end_z: 0,
        allowed_cable_group: ''
      });
    }
  });
  for (let i=1;i<=21;i++) {
    arr.push({
      conduit_id: `C-${String(i).padStart(3,'0')}`,
      type: i%2===0? 'EMT' : 'RMC',
      trade_size: i%2===0? '2' : '3',
      start_x: 50,
      start_y: 50 + i*5,
      start_z: 0,
      end_x: 50,
      end_y: 55 + i*5,
      end_z: 0,
      allowed_cable_group: ''
    });
  }
  return arr;
})();

function normalize(row, mapping){
  const out = {};
  for (const [target, sources] of Object.entries(mapping)) {
    const list = Array.isArray(sources) ? [target, ...sources] : [target, sources];
    for (const key of list) {
      if (row[key] !== undefined) { out[target] = row[key]; break; }
    }
  }
  return out;
}

export function normalizeDuctbankRow(row){
  return normalize(row, {
    tag:['tag','Tag','ductbankTag','ductbank'],
    from:['from','From'],
    to:['to','To'],
    concrete_encasement:['concrete_encasement','Concrete Encasement'],
    start_x:['start_x','Start X','startX'],
    start_y:['start_y','Start Y','startY'],
    start_z:['start_z','Start Z','startZ'],
    end_x:['end_x','End X','endX'],
    end_y:['end_y','End Y','endY'],
    end_z:['end_z','End Z','endZ']
  });
}

export function normalizeConduitRow(row){
  return normalize(row, {
    ductbankTag:['ductbankTag','ductbank','Ductbank','ductbank_tag','Ductbank Tag'],
    conduit_id:['conduit_id','conduitId','Conduit ID'],
    type:['type','Type'],
    trade_size:['trade_size','tradeSize','Trade Size'],
    start_x:['start_x','Start X','startX'],
    start_y:['start_y','Start Y','startY'],
    start_z:['start_z','Start Z','startZ'],
    end_x:['end_x','End X','endX'],
    end_y:['end_y','End Y','endY'],
    end_z:['end_z','End Z','endZ'],
    allowed_cable_group:['allowed_cable_group','allowedGroup','Allowed Group'],
    capacity:['capacity','Capacity']
  });
}

export function normalizeTrayRow(row){
  return normalize(row, {
    tray_id:['tray_id','trayId','Tray ID'],
    start_x:['start_x','Start X','startX'],
    start_y:['start_y','Start Y','startY'],
    start_z:['start_z','Start Z','startZ'],
    end_x:['end_x','End X','endX'],
    end_y:['end_y','End Y','endY'],
    end_z:['end_z','End Z','endZ'],
    inside_width:['inside_width','width','Inside Width'],
    tray_depth:['tray_depth','height','Tray Depth'],
    tray_type:['tray_type','Tray Type'],
    allowed_cable_group:['allowed_cable_group','allowedGroup','Allowed Group']
  });
}

export const mapDuctbankRow = normalizeDuctbankRow;
export const mapConduitRow = normalizeConduitRow;
export const mapTrayRow = normalizeTrayRow;
