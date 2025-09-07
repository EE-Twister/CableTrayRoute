checkPrereqs([
  {key:'cableSchedule',page:'cableschedule.html',label:'Cable Schedule'},
  {key:'traySchedule',page:'racewayschedule.html',label:'Raceway Schedule'}
]);

document.addEventListener('exclusions-found', () => {
  const details = document.getElementById('route-breakdown-details');
  if (details) details.open = true;
});

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

function populateTrayTable(trays){
  const container = document.getElementById('manual-tray-table-container');
  if(!container) return;
  let html = '<table class="sticky-table"><thead><tr>'+
    '<th>Tray ID</th><th>Start (X,Y,Z)</th><th>End (X,Y,Z)</th>'+
    '<th>Width</th><th>Height</th><th>Group</th></tr></thead><tbody>';
  trays.forEach(t => {
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
  const container = document.getElementById('cable-list-container');
  if(!container) return;
  let html = '<table class="sticky-table"><thead><tr>'+
    '<th>Name</th><th>Start (X,Y,Z)</th><th>End (X,Y,Z)</th>'+
    '<th>Type</th><th>Group</th></tr></thead><tbody>';
  cables.forEach(c => {
    html += `<tr><td>${c.name||''}</td>`+
      `<td>${(c.start||[]).join(',')}</td>`+
      `<td>${(c.end||[]).join(',')}</td>`+
      `<td>${c.cable_type||''}</td>`+
      `<td>${c.allowed_cable_group||''}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}
