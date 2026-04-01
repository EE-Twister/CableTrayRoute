/**
 * Industry project templates for Gap #16 and Gap #8 (AI Data Center).
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
    name: 'AI Data Center',
    icon: '🖥️',
    // Gap #8: hot/cold aisle layout, structured cabling (Cat6A + fiber), power segregation.
    // Power trays run overhead in hot aisles (A+B redundant feeds).
    // Fiber backbone runs overhead in the cold aisle.
    // Cat6A horizontal distribution runs under raised-floor (z = 1.5 ft).
    description: 'Redundant A/B 480 V UPS feeds, 208 V PDU branches, overhead fiber backbone (OM4 + OS2), and Cat6A horizontal distribution in hot/cold aisle layout.',
    sections: {
      cables: [
        // --- Power (hot-aisle overhead trays) ---
        { id: 'DC-FEED-A', from: 'UTILITY-A', to: 'UPS-A', cable_type: 'Power', conductor_size: '500 kcmil', insulation_type: 'THHN', voltage_rating: '480V', length: 95, route_preference: 'TRAY-PWR-A', cable_od: 1.15 },
        { id: 'DC-FEED-B', from: 'UTILITY-B', to: 'UPS-B', cable_type: 'Power', conductor_size: '500 kcmil', insulation_type: 'THHN', voltage_rating: '480V', length: 100, route_preference: 'TRAY-PWR-B', cable_od: 1.15 },
        { id: 'DC-PDU-A1', from: 'UPS-A', to: 'PDU-A1', cable_type: 'Power', conductor_size: '250 kcmil', insulation_type: 'THHN', voltage_rating: '480V', length: 55, route_preference: 'TRAY-PWR-A', cable_od: 0.88 },
        { id: 'DC-PDU-B1', from: 'UPS-B', to: 'PDU-B1', cable_type: 'Power', conductor_size: '250 kcmil', insulation_type: 'THHN', voltage_rating: '480V', length: 55, route_preference: 'TRAY-PWR-B', cable_od: 0.88 },
        { id: 'DC-BRANCH-01', from: 'PDU-A1', to: 'RACK-ROW-1', cable_type: 'Power', conductor_size: '#4 AWG', insulation_type: 'THHN', voltage_rating: '208V', length: 30, route_preference: 'TRAY-PWR-A', cable_od: 0.54 },
        { id: 'DC-BRANCH-02', from: 'PDU-B1', to: 'RACK-ROW-1', cable_type: 'Power', conductor_size: '#4 AWG', insulation_type: 'THHN', voltage_rating: '208V', length: 32, route_preference: 'TRAY-PWR-B', cable_od: 0.54 },
        // --- Fiber backbone (cold-aisle overhead tray) ---
        { id: 'DC-FIBER-OM4-01', from: 'MDA-PATCH-1', to: 'HDA-ROW-1', cable_type: 'Fiber', conductor_size: '#22 AWG', insulation_type: 'LSZH', voltage_rating: 'N/A', length: 60, route_preference: 'TRAY-FIBER-SPINE', cable_od: 0.35, notes: '12-strand OM4 multimode fiber backbone' },
        { id: 'DC-FIBER-OS2-01', from: 'MDA-PATCH-1', to: 'HDA-ROW-2', cable_type: 'Fiber', conductor_size: '#22 AWG', insulation_type: 'LSZH', voltage_rating: 'N/A', length: 75, route_preference: 'TRAY-FIBER-SPINE', cable_od: 0.28, notes: '6-strand OS2 singlemode fiber backbone' },
        // --- Cat6A horizontal distribution (under raised floor) ---
        { id: 'DC-CAT6A-ROW1-01', from: 'HDA-ROW-1', to: 'RACK-A01', cable_type: 'Data', conductor_size: '#22 AWG', insulation_type: 'LSZH', voltage_rating: 'N/A', length: 25, route_preference: 'TRAY-DATA-ROW1', cable_od: 0.33, notes: 'Cat6A 10GBase-T horizontal run' },
        { id: 'DC-CAT6A-ROW2-01', from: 'HDA-ROW-2', to: 'RACK-B01', cable_type: 'Data', conductor_size: '#22 AWG', insulation_type: 'LSZH', voltage_rating: 'N/A', length: 28, route_preference: 'TRAY-DATA-ROW2', cable_od: 0.33, notes: 'Cat6A 10GBase-T horizontal run' }
      ],
      raceways: {
        trays: [
          // Hot-aisle overhead power trays — Feed A and B run parallel at 10 ft and 10.5 ft
          { tray_id: 'TRAY-PWR-A', start_x: 0, start_y: 0, start_z: 10, end_x: 150, end_y: 0, end_z: 10, inside_width: 24, tray_depth: 4, tray_type: 'Ladder (50 % fill)', allowed_cable_group: 'power' },
          { tray_id: 'TRAY-PWR-B', start_x: 0, start_y: 6, start_z: 10.5, end_x: 150, end_y: 6, end_z: 10.5, inside_width: 24, tray_depth: 4, tray_type: 'Ladder (50 % fill)', allowed_cable_group: 'power' },
          // Cold-aisle overhead fiber backbone — wire basket at 12 ft for maximum clearance
          { tray_id: 'TRAY-FIBER-SPINE', start_x: 0, start_y: 3, start_z: 12, end_x: 150, end_y: 3, end_z: 12, inside_width: 12, tray_depth: 3, tray_type: 'Wire Basket (40 % fill)', allowed_cable_group: 'fiber' },
          // Under-raised-floor Cat6A distribution trays — 1.5 ft AFF, one per server row
          { tray_id: 'TRAY-DATA-ROW1', start_x: 0, start_y: 0, start_z: 1.5, end_x: 150, end_y: 0, end_z: 1.5, inside_width: 18, tray_depth: 3, tray_type: 'Solid Bottom (40 % fill)', allowed_cable_group: 'data' },
          { tray_id: 'TRAY-DATA-ROW2', start_x: 0, start_y: 6, start_z: 1.5, end_x: 150, end_y: 6, end_z: 1.5, inside_width: 18, tray_depth: 3, tray_type: 'Solid Bottom (40 % fill)', allowed_cable_group: 'data' }
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
