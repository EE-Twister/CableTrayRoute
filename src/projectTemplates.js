/**
 * Industry project templates for Gap #16.
 * Each template pre-populates cables and raceways when a new project is created.
 */

export const PROJECT_TEMPLATES = [
  {
    id: 'oil-gas',
    name: 'Oil & Gas',
    icon: '🔥',
    description: 'MV feeders, instrument triads, control multipair, hazardous-area raceways.',
    sections: {
      cables: [
        { id: 'OG-CBL-001', from: 'SUBSTATION-1', to: 'MCC-A', conductor_size: '350 kcmil', insulation_type: 'XLPE', voltage_rating: '15kV', length: 220, route_preference: 'TRAY-PWR-01' },
        { id: 'OG-CBL-002', from: 'MCC-A', to: 'PUMP-101', conductor_size: '#2 AWG', insulation_type: 'THWN-2', voltage_rating: '600V', length: 85, route_preference: 'TRAY-PWR-01' },
        { id: 'OG-CBL-003', from: 'MCC-A', to: 'COMP-101', conductor_size: '4/0 AWG', insulation_type: 'THWN-2', voltage_rating: '600V', length: 130, route_preference: 'TRAY-PWR-01' },
        { id: 'OG-CBL-004', from: 'JB-101', to: 'DCS-1', conductor_size: '#16 AWG', insulation_type: 'EPR', voltage_rating: '300V', length: 60, route_preference: 'TRAY-INST-01' },
        { id: 'OG-CBL-005', from: 'JB-102', to: 'DCS-1', conductor_size: '#16 AWG', insulation_type: 'EPR', voltage_rating: '300V', length: 75, route_preference: 'TRAY-INST-01' },
        { id: 'OG-CBL-006', from: 'MCC-A', to: 'PLC-1', conductor_size: '#14 AWG', insulation_type: 'THHN', voltage_rating: '600V', length: 50, route_preference: 'TRAY-CTRL-01' }
      ],
      raceways: {
        trays: [
          { tray_id: 'TRAY-PWR-01', start_x: 0, start_y: 0, start_z: 14, end_x: 200, end_y: 0, end_z: 14, inside_width: 24, tray_depth: 4, tray_type: 'Ladder (50 % fill)', allowed_cable_group: 'power' },
          { tray_id: 'TRAY-INST-01', start_x: 0, start_y: 6, start_z: 14, end_x: 200, end_y: 6, end_z: 14, inside_width: 12, tray_depth: 4, tray_type: 'Solid Bottom (40 % fill)', allowed_cable_group: 'instrument' },
          { tray_id: 'TRAY-CTRL-01', start_x: 0, start_y: 12, start_z: 14, end_x: 200, end_y: 12, end_z: 14, inside_width: 12, tray_depth: 4, tray_type: 'Solid Bottom (40 % fill)', allowed_cable_group: 'control' }
        ],
        conduits: [],
        ductbanks: []
      }
    }
  },
  {
    id: 'data-center',
    name: 'Data Center',
    icon: '🖥️',
    description: 'Redundant A/B 480 V feeds, 208 V PDU branches, overhead wire-basket tray.',
    sections: {
      cables: [
        { id: 'DC-CBL-FEED-A', from: 'UTILITY-A', to: 'UPS-A', conductor_size: '500 kcmil', insulation_type: 'THHN', voltage_rating: '480V', length: 95, route_preference: 'TRAY-PWR-A' },
        { id: 'DC-CBL-FEED-B', from: 'UTILITY-B', to: 'UPS-B', conductor_size: '500 kcmil', insulation_type: 'THHN', voltage_rating: '480V', length: 100, route_preference: 'TRAY-PWR-B' },
        { id: 'DC-CBL-PDU-A1', from: 'UPS-A', to: 'PDU-A1', conductor_size: '250 kcmil', insulation_type: 'THHN', voltage_rating: '480V', length: 55, route_preference: 'TRAY-PWR-A' },
        { id: 'DC-CBL-PDU-B1', from: 'UPS-B', to: 'PDU-B1', conductor_size: '250 kcmil', insulation_type: 'THHN', voltage_rating: '480V', length: 55, route_preference: 'TRAY-PWR-B' },
        { id: 'DC-CBL-BRANCH-01', from: 'PDU-A1', to: 'RACK-ROW-1', conductor_size: '#4 AWG', insulation_type: 'THHN', voltage_rating: '208V', length: 30, route_preference: 'TRAY-LOW-01' },
        { id: 'DC-CBL-BRANCH-02', from: 'PDU-B1', to: 'RACK-ROW-1', conductor_size: '#4 AWG', insulation_type: 'THHN', voltage_rating: '208V', length: 32, route_preference: 'TRAY-LOW-01' }
      ],
      raceways: {
        trays: [
          { tray_id: 'TRAY-PWR-A', start_x: 0, start_y: 0, start_z: 12, end_x: 150, end_y: 0, end_z: 12, inside_width: 24, tray_depth: 4, tray_type: 'Wire Basket (50 % fill)', allowed_cable_group: 'power' },
          { tray_id: 'TRAY-PWR-B', start_x: 0, start_y: 6, start_z: 12, end_x: 150, end_y: 6, end_z: 12, inside_width: 24, tray_depth: 4, tray_type: 'Wire Basket (50 % fill)', allowed_cable_group: 'power' },
          { tray_id: 'TRAY-LOW-01', start_x: 0, start_y: 0, start_z: 1.5, end_x: 150, end_y: 0, end_z: 1.5, inside_width: 18, tray_depth: 4, tray_type: 'Solid Bottom (40 % fill)', allowed_cable_group: 'power' }
        ],
        conduits: [],
        ductbanks: []
      }
    }
  },
  {
    id: 'industrial',
    name: 'Industrial',
    icon: '⚙️',
    description: '480 V MCC feeders, motor cables, VFD shielded output, aluminum distribution.',
    sections: {
      cables: [
        { id: 'IND-CBL-MCC-001', from: 'XFMR-1', to: 'MCC-1', conductor_size: '350 kcmil', insulation_type: 'XHHW-2', voltage_rating: '600V', length: 75, route_preference: 'TRAY-PWR-01' },
        { id: 'IND-CBL-MTR-101', from: 'MCC-1', to: 'MOTOR-101', conductor_size: '#6 AWG', insulation_type: 'THWN-2', voltage_rating: '480V', length: 60, route_preference: 'TRAY-PWR-01' },
        { id: 'IND-CBL-MTR-102', from: 'MCC-1', to: 'MOTOR-102', conductor_size: '#4 AWG', insulation_type: 'THWN-2', voltage_rating: '480V', length: 80, route_preference: 'TRAY-PWR-01' },
        { id: 'IND-CBL-VFD-101', from: 'VFD-1', to: 'MOTOR-103', conductor_size: '#2 AWG', insulation_type: 'XHHW-2', voltage_rating: '480V', length: 45, route_preference: 'TRAY-PWR-01' },
        { id: 'IND-CBL-AL-001', from: 'XFMR-1', to: 'PANEL-LP1', conductor_size: '350 kcmil', insulation_type: 'XHHW-2', voltage_rating: '600V', length: 120, route_preference: 'TRAY-PWR-01' },
        { id: 'IND-CBL-CTRL-001', from: 'PLC-1', to: 'MCC-1', conductor_size: '#14 AWG', insulation_type: 'THHN', voltage_rating: '600V', length: 35, route_preference: 'TRAY-CTRL-01' }
      ],
      raceways: {
        trays: [
          { tray_id: 'TRAY-PWR-01', start_x: 0, start_y: 0, start_z: 12, end_x: 180, end_y: 0, end_z: 12, inside_width: 30, tray_depth: 4, tray_type: 'Ladder (50 % fill)', allowed_cable_group: 'power' },
          { tray_id: 'TRAY-CTRL-01', start_x: 0, start_y: 6, start_z: 12, end_x: 180, end_y: 6, end_z: 12, inside_width: 12, tray_depth: 4, tray_type: 'Solid Bottom (40 % fill)', allowed_cable_group: 'control' }
        ],
        conduits: [],
        ductbanks: []
      }
    }
  }
];
