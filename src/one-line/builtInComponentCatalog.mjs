export function createBuiltInComponents({
  asset,
  typeIcons = {},
  placeholderIcon,
  symbolAssetVersion,
  defaultBusProps,
  defaultShapeProps
}) {
  return [
    {
      subtype: 'Bus', label: 'Bus', icon: typeIcons.bus || placeholderIcon,
      category: 'bus', type: 'bus', ports: [{ x: 0, y: 20 }, { x: 80, y: 20 }],
      props: { ...defaultBusProps }
    },
    {
      subtype: 'Panel', label: 'Panel',
      icon: asset(`icons/components/MLO.svg?v=${symbolAssetVersion}`),
      category: 'equipment', type: 'panel', width: 64, height: 76, ports: [{ x: 32, y: 0 }]
    },
    {
      subtype: 'Equipment', label: 'Equipment', icon: typeIcons.equipment || placeholderIcon,
      category: 'equipment', type: 'equipment', ports: [{ x: 0, y: 20 }, { x: 80, y: 20 }]
    },
    {
      subtype: 'motor_load', label: 'Motor Load',
      icon: asset(`icons/components/Motor.svg?v=${symbolAssetVersion}`),
      category: 'load', type: 'motor_load', defaultRotation: 0, ports: [{ x: 32, y: 0 }],
      props: {
        hp: 150, volts: 480, pf: 0.88, service_factor: 1.15, efficiency: 95,
        lr_current_pu: 6.0, starting: 'DOL', vfd: false,
        load: { kw: 117.789, kvar: 63.576 }
      }
    },
    {
      subtype: 'motor', label: 'Motor',
      icon: asset(`icons/components/Motor.svg?v=${symbolAssetVersion}`),
      iconIEC: asset('icons/components/iec/IEC_Motor.svg'),
      category: 'load', type: 'motor', defaultRotation: 0, ports: [{ x: 32, y: 0 }],
      props: {
        tag: '', description: '', manufacturer: '', model: '', rated_hp: 100, rated_kw: 74.6,
        rated_voltage_kv: 0.48, phases: 3, synchronous_speed_rpm: 1800, design_class: 'B',
        code_letter: 'G', locked_rotor_kva_per_hp: 5.6, full_load_efficiency_pct: 95.0,
        full_load_pf: 0.90, service_factor: 1.15, starter_type: 'dol', vfd_current_limit_pu: 1.1,
        initial_voltage_pu: 0.3, ramp_time_s: 10, wye_delta_switch_time_s: 5,
        autotransformer_tap: 0.65, lr_current_pu: 6.0, thevenin_r: 0.02, thevenin_x: 0.08,
        inertia: 0.5, load_torque_curve: '0:0 100:100', commissioning_state: 'in_service',
        service_status: 'normal', notes: ''
      }
    },
    {
      subtype: 'static_load', label: 'Non-Motor Load', icon: asset('icons/components/Load.svg'),
      category: 'load', type: 'static_load', defaultRotation: 0, ports: [{ x: 32, y: 0 }],
      props: {
        watts: 300000, kva: 300, pf: 1, volts: 480, baseKV: 0.48, kV: 0.48,
        voltage: 480, prefault_voltage: 0.48, load: { kw: 300.0, kvar: 0 }
      }
    },
    {
      subtype: 'CapacitorBank', label: 'Capacitor Bank',
      icon: asset(`icons/components/CapacitorBank.svg?v=${symbolAssetVersion}`),
      category: 'load', type: 'shunt_capacitor_bank', defaultRotation: 0,
      width: 64, height: 64, ports: [{ x: 32, y: 0 }],
      props: {
        rated_kv: 0.48, rated_kvar: 150, volts: 480, kvar: 150, baseKV: 0.48,
        kV: 0.48, prefault_voltage: 0.48, shunt: { kvar: 150 }
      }
    },
    {
      subtype: 'Cable', label: 'Cable', icon: typeIcons.cable || placeholderIcon,
      category: 'cable', type: 'cable', ports: [{ x: 0, y: 20 }, { x: 80, y: 20 }],
      props: {
        cable: {
          tag: '', cable_type: '', conductors: '', phases: '', conductor_size: '',
          conductor_material: '', insulation_type: '', ambient_temp: '', operating_temp: '',
          install_method: '', thermal_rating_ampacity: '', shield_armor: '', resistance_per_km: '',
          reactance_per_km: '', zero_sequence_impedance: '', mutual_coupling: '',
          impedance_per_length: '', capacitance_per_km: '', short_circuit_rating: '',
          grouping_factor: '', resistance_temp_correction_coeff: '', core_configuration: '',
          ground_return_path_resistance: '', color: '#000000', length: '', manual_length: false
        }
      }
    },
    {
      subtype: 'custom_shape', label: 'Shape', icon: typeIcons.annotations || placeholderIcon,
      category: 'annotations', type: 'annotation', width: 160, height: 100,
      props: { ...defaultShapeProps }, hidden: true
    }
  ];
}

export const CABLE_PROPERTY_METADATA = Object.freeze({
  cable_rating: { label: 'Cable Rating (V)', type: 'number', help: 'Maximum operating voltage. Used for duty and validation checks.' },
  conductor_size: { label: 'Conductor Size (AWG or mm²)', help: 'Determines resistance and ampacity. Base electrical characteristic.' },
  conductor_material: { label: 'Conductor Material (Cu/Al)', help: 'Affects resistance and derating. Impacts loss and weight.' },
  resistance_per_km: { label: 'Resistance (Ω/km)', type: 'number', help: 'Used in voltage drop and loss calculations. Derived or vendor data.' },
  reactance_per_km: { label: 'Reactance (Ω/km)', type: 'number', help: 'Used in power flow and fault calculations. Important for impedance matching.' },
  zero_sequence_impedance: { label: 'Zero Sequence Impedance', help: 'Ground fault studies. Required for unbalanced analysis.' },
  mutual_coupling: { label: 'Mutual Coupling', help: 'Modeling magnetic coupling between circuits. Important for parallel runs.' },
  length: { label: 'Length', type: 'number', help: 'Scales impedance and drop. Must be accurate for realistic models.' },
  operating_temp: { label: 'Operating Temperature (°C)', type: 'number', help: 'Used for resistance correction. Impacts ampacity.' },
  ambient_temp: { label: 'Ambient Temperature (°C)', type: 'number', help: 'Used for derating. Impacts heat dissipation.' },
  thermal_rating_ampacity: { label: 'Thermal Rating/Ampacity (A)', type: 'number', help: 'Defines max current capacity. Used in protection sizing.' },
  shield_armor: { label: 'Shield/Armor Data', help: 'Defines ground path and shielding. Used for EMI and fault analysis.' },
  impedance_per_length: { label: 'Impedance per Length', help: 'Z = R + jX. Defines voltage drop and fault contribution.' },
  capacitance_per_km: { label: 'Capacitance (µF/km)', type: 'number', help: 'Used for reactive compensation. Relevant for long lines.' },
  insulation_type: { label: 'Insulation Type', help: 'Determines max voltage and dielectric loss. Used for derating.' },
  install_method: { label: 'Installation Type (in conduit, tray, buried)', help: 'Determines derating factors. Used for thermal calculations.' },
  short_circuit_rating: { label: 'Short Circuit Rating (kA)', type: 'number', help: 'Fault withstand capability. Compare against max fault.' },
  grouping_factor: { label: 'Grouping Factor', type: 'number', help: 'Used for ampacity derating. Multiple cables reduce rating.' },
  resistance_temp_correction_coeff: { label: 'Resistance Temp Correction Coeff', type: 'number', help: 'Adjust R vs temperature. Used in IEC modeling.' },
  core_configuration: { label: 'Core Configuration (1C,3C)', help: 'Determines magnetic coupling. Impacts reactance.' },
  ground_return_path_resistance: { label: 'Ground Return Path Resistance', type: 'number', help: 'Used for unbalanced faults. Important for system grounding.' },
  impedance_r: { label: 'Impedance R (Ω)', type: 'number', help: 'Positive-sequence resistance. Impacts voltage drop and fault currents.' },
  impedance_x: { label: 'Impedance X (Ω)', type: 'number', help: 'Positive-sequence reactance. Impacts voltage drop and fault currents.' }
});
