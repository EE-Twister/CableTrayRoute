checkPrereqs([
  {key:'cableSchedule',page:'cableschedule.html',label:'Cable Schedule'},
  {key:'traySchedule',page:'racewayschedule.html',label:'Raceway Schedule'}
]);

document.addEventListener('exclusions-found', () => {
  const details = document.getElementById('route-breakdown-details');
  if (details) details.open = true;
});
