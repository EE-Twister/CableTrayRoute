function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function readAlias(component, aliases) {
  for (const alias of aliases) {
    if (hasValue(component?.[alias])) return component[alias];
    if (hasValue(component?.props?.[alias])) return component.props[alias];
  }
  return null;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function setCanonical(component, key, value) {
  component[key] = value;
  if (!component.props || typeof component.props !== 'object') component.props = {};
  component.props[key] = value;
}

export function normalizeComponentElectricalProperties(component) {
  if (!component || typeof component !== 'object') return component;
  if (!component.props || typeof component.props !== 'object') component.props = {};
  const type = String(component.type || '').trim().toLowerCase();
  const subtype = String(component.subtype || '').trim().toLowerCase();

  const ratedVoltageKv = finiteOrNull(readAlias(component, ['rated_voltage_kv', 'kV', 'baseKV', 'ac_voltage_kv']));
  if (ratedVoltageKv !== null && ratedVoltageKv > 0) setCanonical(component, 'rated_voltage_kv', ratedVoltageKv);

  const sccr = finiteOrNull(readAlias(component, ['sccr_ka', 'sccrKA', 'short_circuit_rating_ka']));
  if (sccr !== null && sccr >= 0) setCanonical(component, 'sccr_ka', sccr);

  const interrupting = finiteOrNull(readAlias(component, [
    'interrupting_rating_ka', 'interrupt_rating_ka', 'interruptRatingKA', 'interruptRating', 'main_interrupting_ka'
  ]));
  const interruptsFault = type === 'breaker' || type === 'fuse' || type === 'recloser';
  if (interruptsFault && interrupting !== null && interrupting >= 0) {
    setCanonical(component, 'interrupting_rating_ka', interrupting);
  } else if (type === 'relay' || subtype.includes('relay')) {
    setCanonical(component, 'interrupting_rating_ka', null);
    component.interruptRating = null;
    component.props.interruptRating = null;
  }

  const withstand = finiteOrNull(readAlias(component, ['short_time_withstand_ka', 'withstand_1s_ka', 'withstandRatingKA']));
  if (withstand !== null && withstand >= 0) setCanonical(component, 'short_time_withstand_ka', withstand);
  const withstandCycles = finiteOrNull(readAlias(component, ['short_time_withstand_cycles', 'withstandCycles']));
  if (withstandCycles !== null && withstandCycles >= 0) setCanonical(component, 'short_time_withstand_cycles', withstandCycles);
  return component;
}

