export default [
  {
    "id": "abb_tmax_160",
    "type": "breaker",
    "vendor": "ABB",
    "name": "ABB Tmax T3 160A",
    "interruptRating": 65,
    "settings": { "pickup": 160, "time": 0.2, "instantaneous": 800 },
    "curve": [
      { "current": 160, "time": 100 },
      { "current": 800, "time": 0.2 },
      { "current": 1600, "time": 0.05 }
    ]
  },
  {
    "id": "siemens_3va_125",
    "type": "breaker",
    "vendor": "Siemens",
    "name": "Siemens 3VA 125A",
    "interruptRating": 35,
    "settings": { "pickup": 125, "time": 0.25, "instantaneous": 600 },
    "curve": [
      { "current": 125, "time": 100 },
      { "current": 500, "time": 1 },
      { "current": 1000, "time": 0.1 }
    ]
  },
  {
    "id": "schneider_nsx100",
    "type": "breaker",
    "vendor": "Schneider",
    "name": "Schneider Compact NSX100",
    "interruptRating": 50,
    "settings": { "pickup": 100, "time": 0.3, "instantaneous": 500 },
    "curve": [
      { "current": 100, "time": 100 },
      { "current": 400, "time": 1 },
      { "current": 1000, "time": 0.1 }
    ]
  },
  {
    "id": "ge_multilin_750",
    "type": "relay",
    "vendor": "GE",
    "name": "GE Multilin 750 Relay",
    "interruptRating": 30,
    "settings": { "pickup": 150, "time": 0.15, "instantaneous": 600 },
    "curve": [
      { "current": 150, "time": 50 },
      { "current": 600, "time": 0.5 },
      { "current": 1200, "time": 0.05 }
    ]
  },
  {
    "id": "eaton_seriesC_100",
    "type": "breaker",
    "vendor": "Eaton",
    "name": "Eaton Series C 100A",
    "interruptRating": 25,
    "settings": { "pickup": 100, "time": 0.2, "instantaneous": 500 },
    "curve": [
      { "current": 100, "time": 80 },
      { "current": 400, "time": 0.4 },
      { "current": 800, "time": 0.05 }
    ]
  },
  {
    "id": "mitsubishi_ws_225",
    "type": "breaker",
    "vendor": "Mitsubishi",
    "name": "Mitsubishi WS 225A",
    "interruptRating": 42,
    "settings": { "pickup": 225, "time": 0.3, "instantaneous": 1125 },
    "curve": [
      { "current": 225, "time": 100 },
      { "current": 900, "time": 0.4 },
      { "current": 1800, "time": 0.05 }
    ]
  }
]
;
