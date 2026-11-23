const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const rows = value => Array.isArray(value) ? value : [];
const generated = value => isRecord(value?._designSynthesis);
const motor = value => isRecord(value?.motor);

/** Inspect each persisted projection: deleting a schedule row must not hide a diagram's unresolved candidate. */
export function countGeneratedMotorProjections(project = {}) {
  let count = 0;
  for (const item of [...rows(project.equipment), ...rows(project.loads), ...rows(project.cables)]) {
    if (generated(item) && motor(item)) count += 1;
  }
  for (const sheet of rows(project.oneLine?.sheets)) {
    for (const component of rows(sheet?.components)) {
      if (generated(component) && (motor(component) || motor(component.physical))) count += 1;
      for (const connection of rows(component?.connections)) {
        if ((generated(connection) || generated(connection?.cable)) && motor(connection?.cable)) count += 1;
      }
    }
    for (const connection of rows(sheet?.connections)) {
      if ((generated(connection) || generated(connection?.cable)) && motor(connection?.cable)) count += 1;
    }
  }
  return count;
}
