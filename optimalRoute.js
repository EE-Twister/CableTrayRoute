checkPrereqs([
  {key:'cableSchedule',page:'cableschedule.html',label:'Cable Schedule'},
  {key:'traySchedule',page:'racewayschedule.html',label:'Raceway Schedule'}
]);

document.addEventListener('exclusions-found', () => {
  const details = document.getElementById('route-breakdown-details');
  if (details) details.open = true;
});

const trayData = [];
const cableData = [];

document.addEventListener('DOMContentLoaded', () => {
  const trayBtn = document.getElementById('load-sample-trays-btn');
  if (trayBtn) {
    trayBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('examples/trayNetwork.json');
        const trays = await res.json();
        const details = document.getElementById('manual-tray-table-details');
        if (details) details.open = true;
        populateTrayTable(trays);
      } catch (err) {
        console.error('Failed to load sample tray network', err);
      }
    });
  }

  const addTrayBtn = document.getElementById('add-tray-btn');
  if (addTrayBtn) {
    addTrayBtn.addEventListener('click', addTrayRow);
  }

  const addCableBtn = document.getElementById('add-cable-btn');
  if (addCableBtn) {
    addCableBtn.addEventListener('click', addCableRow);
  }

  const cableBtn = document.getElementById('load-sample-cables-btn');
  if (cableBtn) {
    cableBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('examples/cableList.json');
        const cables = await res.json();
        const details = document.getElementById('cable-list-details');
        if (details) details.open = true;
        populateCableTable(cables);
      } catch (err) {
        console.error('Failed to load sample cable list', err);
      }
    });
  }
});

function addTrayRow(){
  const tray = {
    tray_id: document.getElementById('t-id')?.value || '',
    start_x: parseFloat(document.getElementById('t-sx')?.value) || 0,
    start_y: parseFloat(document.getElementById('t-sy')?.value) || 0,
    start_z: parseFloat(document.getElementById('t-sz')?.value) || 0,
    end_x: parseFloat(document.getElementById('t-ex')?.value) || 0,
    end_y: parseFloat(document.getElementById('t-ey')?.value) || 0,
    end_z: parseFloat(document.getElementById('t-ez')?.value) || 0,
    width: parseFloat(document.getElementById('t-w')?.value) || 0,
    height: parseFloat(document.getElementById('t-h')?.value) || 0,
    allowed_cable_group: document.getElementById('t-group')?.value || ''
  };
  trayData.push(tray);
  const details = document.getElementById('manual-tray-table-details');
  if (details) details.open = true;
  populateTrayTable();
}

function addCableRow(){
  const startTag = prompt('Start equipment tag?') || '';
  const endTag = prompt('End equipment tag?') || '';
  const cable = {
    name: `Cable ${cableData.length + 1}`,
    start_tag: startTag,
    end_tag: endTag,
    cable_type: 'Power',
    allowed_cable_group: ''
  };
  cableData.push(cable);
  const details = document.getElementById('cable-list-details');
  if (details) details.open = true;
  populateCableTable();
}

function populateTrayTable(trays){
  if (Array.isArray(trays)) {
    trayData.length = 0;
    trayData.push(...trays);
  }
  const container = document.getElementById('manual-tray-table-container');
  if(!container) return;
  if (trayData.length === 0){
    container.innerHTML = '';
    return;
  }
  let html = '<table class="sticky-table"><thead><tr>'+
    '<th>Tray ID</th><th>Start (X,Y,Z)</th><th>End (X,Y,Z)</th>'+
    '<th>Width</th><th>Height</th><th>Group</th></tr></thead><tbody>';
  trayData.forEach(t => {
    html += `<tr><td>${t.tray_id||''}</td>`+
      `<td>${t.start_x},${t.start_y},${t.start_z}</td>`+
      `<td>${t.end_x},${t.end_y},${t.end_z}</td>`+
      `<td>${t.width}</td><td>${t.height}</td>`+
      `<td>${t.allowed_cable_group||''}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function populateCableTable(cables){
  if (Array.isArray(cables)) {
    cableData.length = 0;
    cableData.push(...cables);
  }
  const container = document.getElementById('cable-list-container');
  if(!container) return;
  if (cableData.length === 0){
    container.innerHTML = '';
    return;
  }
  let html = '<table class="sticky-table"><thead><tr>'+
    '<th>Name</th><th>Start Equipment</th><th>End Equipment</th>'+
    '<th>Type</th><th>Group</th></tr></thead><tbody>';
  cableData.forEach(c => {
    html += `<tr><td>${c.name||''}</td>`+
      `<td>${c.start_tag||''}</td>`+
      `<td>${c.end_tag||''}</td>`+
      `<td>${c.cable_type||''}</td>`+
      `<td>${c.allowed_cable_group||''}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}
