import ampacity from '../../ampacity.mjs';
import { sizeConductor } from '../../sizing.js';
import { calculateVoltageDrop } from '../voltageDrop.js';
import { normalizeCablePhases } from '../../utils/cablePhases.js';

const { sizeToArea } = ampacity;

/**
 * Recalculate the recommendation and the installed cable's displayed VD.
 * The selected cable result remains independent from the candidate returned
 * by sizing so the table cannot silently report a different conductor.
 */
export function applyCableSizingHighlight({ tbody, table, tableData = [], limit = 3 } = {}) {
  if (!tbody || !table) return;
  Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
    const sizeSel = tr.querySelector('[name="conductor_size"]');
    const matSel = tr.querySelector('[name="conductor_material"]');
    const insSel = tr.querySelector('[name="insulation_rating"]');
    const loadIn = tr.querySelector('[name="est_load"]');
    const voltIn = tr.querySelector('[name="operating_voltage"]');
    const lenIn = tr.querySelector('[name="length"]');
    const condIn = tr.querySelector('[name="conductors"]');
    const ambIn = tr.querySelector('[name="ambient_temp"]');
    const ampIn = tr.querySelector('[name="calc_ampacity"]');
    const vdIn = tr.querySelector('[name="voltage_drop_pct"]');
    const warnIn = tr.querySelector('[name="sizing_warning"]');
    const codeRefIn = tr.querySelector('[name="code_reference"]');
    if (!sizeSel || !loadIn) return;

    const renderedRow = typeof table.getRowData === 'function' ? table.getRowData(tr) : {};
    // Keep inputs intentionally hidden from table columns, such as phase
    // labels, alongside the visible cell values.
    const rowIndex = Array.from(tbody.rows).indexOf(tr);
    const storedRow = tableData?.find(entry => entry?.tag && entry.tag === renderedRow.tag)
      || (rowIndex >= 0 ? tableData?.[rowIndex] : null)
      || {};
    const row = { ...storedRow, ...renderedRow };
    const phaseLabels = normalizeCablePhases(row);
    const phaseCount = phaseLabels.length || 3;
    const impedanceOverride = row.impedance_per_1000ft ?? row.impedance;
    const conduitMaterial = row.conduit_material || row.raceway_material || row.conduit_type;
    const rawVoltage = parseFloat(voltIn?.value);
    const rawConductors = parseInt(condIn?.value, 10);
    const rawAmbient = parseFloat(ambIn?.value);
    const rawInsulation = parseFloat(insSel?.value);
    const conductors = Number.isFinite(rawConductors) && rawConductors >= 1 ? rawConductors : 1;
    const load = {
      current: Math.max(0, parseFloat(loadIn.value) || 0),
      voltage: Number.isFinite(rawVoltage) && rawVoltage > 0 ? rawVoltage : 0,
      phases: phaseCount,
      conductors,
      power_factor: row.power_factor,
      parallel_count: row.parallel_count,
      impedance_per_1000ft: impedanceOverride,
      conduit_material: conduitMaterial
    };
    const params = {
      material: matSel?.value || 'cu',
      insulation_rating: Number.isFinite(rawInsulation) && rawInsulation > 0 ? rawInsulation : 90,
      length: Math.max(0, parseFloat(lenIn?.value) || 0),
      conductors,
      ambient: Number.isFinite(rawAmbient) && rawAmbient > -273 ? rawAmbient : 30,
      power_factor: row.power_factor,
      parallel_count: row.parallel_count,
      impedance_per_1000ft: impedanceOverride,
      conduit_material: conduitMaterial,
      maxVoltageDrop: limit
    };
    const recommendation = sizeConductor(load, params);
    const selectedVoltageDrop = calculateVoltageDrop({
      ...row,
      conductor_size: sizeSel.value,
      conductor_material: matSel?.value || row.conductor_material,
      operating_voltage: voltIn?.value,
      est_load: loadIn.value,
      length: lenIn?.value,
      phases: phaseLabels.length ? phaseLabels : phaseCount,
      power_factor: row.power_factor,
      parallel_count: row.parallel_count,
      impedance: impedanceOverride,
      impedance_per_1000ft: impedanceOverride,
      conduit_material: conduitMaterial,
      conduit_type: row.conduit_type
    }, lenIn?.value, phaseCount);

    if (ampIn) ampIn.value = recommendation.ampacity ? recommendation.ampacity.toFixed(2) : '';
    if (vdIn) {
      vdIn.value = Number.isFinite(selectedVoltageDrop) ? selectedVoltageDrop.toFixed(2) : '';
      vdIn.classList.toggle(
        'voltage-exceed',
        Number.isFinite(limit) && Number.isFinite(selectedVoltageDrop) && selectedVoltageDrop > limit
      );
    }
    if (codeRefIn) codeRefIn.value = recommendation.codeRef || '';
    const sizeViolation = recommendation.violation
      || (recommendation.size && sizeSel.value && sizeToArea(sizeSel.value) < sizeToArea(recommendation.size));
    const selectedDropWarning = Number.isFinite(selectedVoltageDrop) && selectedVoltageDrop > limit
      ? `; selected cable voltage drop ${selectedVoltageDrop.toFixed(2)}% exceeds ${limit}%`
      : '';
    if (warnIn) {
      const sizingWarning = sizeViolation ? (recommendation.violation || `Requires ${recommendation.size}`) : '';
      warnIn.value = `${sizingWarning}${selectedDropWarning}`.replace(/^; /, '');
    }
    sizeSel.classList.toggle('sizing-violation', !!sizeViolation);
  });
}

export default applyCableSizingHighlight;
