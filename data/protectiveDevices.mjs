export default [
  {
    "id": "abb_tmax_160",
    "type": "breaker",
    "vendor": "ABB",
    "name": "ABB Tmax T3 160A",
    "interruptRating": 65,
    "settings": {
      "pickup": 160,
      "time": 0.2,
      "instantaneous": 800
    },
    "settingOptions": {
      "pickup": [80, 100, 125, 160],
      "time": [0.1, 0.2, 0.3, 0.4],
      "instantaneous": [800, 960, 1120, 1280, 1440, 1600]
    },
    "curve": [
      {
        "current": 160,
        "time": 100
      },
      {
        "current": 800,
        "time": 0.2
      },
      {
        "current": 1600,
        "time": 0.05
      }
    ],
    "tolerance": {
      "timeLower": 0.75,
      "timeUpper": 1.25
    }
  },
  {
    "id": "siemens_3va_125",
    "type": "breaker",
    "vendor": "Siemens",
    "name": "Siemens 3VA 125A",
    "interruptRating": 35,
    "settings": {
      "pickup": 125,
      "time": 0.25,
      "instantaneous": 600
    },
    "settingOptions": {
      "pickup": [63, 80, 100, 125],
      "time": [0.2, 0.25, 0.3, 0.4],
      "instantaneous": [500, 600, 700, 800, 900, 1000]
    },
    "curve": [
      {
        "current": 125,
        "time": 100
      },
      {
        "current": 500,
        "time": 1
      },
      {
        "current": 1000,
        "time": 0.1
      }
    ],
    "tolerance": {
      "timeLower": 0.75,
      "timeUpper": 1.25
    }
  },
  {
    "id": "schneider_nsx100",
    "type": "breaker",
    "vendor": "Schneider",
    "name": "Schneider Compact NSX100",
    "interruptRating": 50,
    "settings": {
      "pickup": 100,
      "time": 0.3,
      "instantaneous": 500
    },
    "settingOptions": {
      "pickup": [50, 63, 80, 100],
      "time": [0.2, 0.3, 0.4, 0.5],
      "instantaneous": [400, 500, 600, 700, 800, 900]
    },
    "curve": [
      {
        "current": 100,
        "time": 100
      },
      {
        "current": 400,
        "time": 1
      },
      {
        "current": 1000,
        "time": 0.1
      }
    ],
    "tolerance": {
      "timeLower": 0.75,
      "timeUpper": 1.25
    }
  },
  {
    "id": "bussmann_lpsrksp_400",
    "type": "fuse",
    "vendor": "Eaton Bussmann",
    "name": "Bussmann LPS-RK-SP 400A",
    "interruptRating": 200,
    "settings": {
      "ampRating": 400,
      "speed": "time_delay"
    },
    "settingOptions": {
      "ampRating": [100, 200, 400, 600],
      "speed": [
        { "value": "time_delay", "label": "Time-Delay" },
        { "value": "fast", "label": "Fast-Acting" }
      ]
    },
    "curve": [
      { "current": 400, "time": 100 },
      { "current": 800, "time": 10 },
      { "current": 2000, "time": 1 },
      { "current": 4000, "time": 0.1 }
    ],
    "tolerance": {
      "timeLower": 0.9,
      "timeUpper": 1.2
    }
  },
  {
    "id": "mersen_trs200r",
    "type": "fuse",
    "vendor": "Mersen",
    "name": "Mersen TRS-R 200A",
    "interruptRating": 200,
    "settings": {
      "ampRating": 200,
      "speed": "time_delay"
    },
    "settingOptions": {
      "ampRating": [100, 200, 225, 250],
      "speed": [
        { "value": "time_delay", "label": "Time-Delay" },
        { "value": "fast", "label": "Fast-Acting" }
      ]
    },
    "curve": [
      { "current": 200, "time": 120 },
      { "current": 600, "time": 8 },
      { "current": 1800, "time": 0.6 },
      { "current": 3600, "time": 0.08 }
    ],
    "letThrough": {
      "i2t": 120000
    },
    "tolerance": {
      "timeLower": 0.85,
      "timeUpper": 1.15
    }
  },
  {
    "id": "ge_multilin_750",
    "type": "relay",
    "vendor": "GE",
    "name": "GE Multilin 750 Relay",
    "interruptRating": 30,
    "settings": {
      "curveProfile": "IEC_VeryInverse",
      "longTimePickup": 150,
      "longTimeDelay": 0.15,
      "shortTimePickup": 450,
      "shortTimeDelay": 0.05,
      "instantaneousPickup": 600
    },
    "settingOptions": {
      "curveProfile": [
        { "value": "IEC_VeryInverse", "label": "IEC Very Inverse" },
        { "value": "IEC_ExtremelyInverse", "label": "IEC Extremely Inverse" }
      ],
      "longTimePickup": [75, 100, 125, 150, 175, 200],
      "longTimeDelay": [0.1, 0.15, 0.2, 0.3],
      "shortTimePickup": [300, 400, 500, 600, 700, 800, 900, 1000, 1200],
      "shortTimeDelay": [0.05, 0.1, 0.2, 0.3],
      "instantaneousPickup": [300, 400, 500, 600, 700, 800, 900, 1000, 1200]
    },
    "curveProfiles": [
      {
        "id": "IEC_VeryInverse",
        "name": "IEC Very Inverse",
        "curve": [
          { "current": 150, "time": 40 },
          { "current": 300, "time": 4 },
          { "current": 600, "time": 0.6 },
          { "current": 1200, "time": 0.12 }
        ],
        "settings": {
          "longTimePickup": 150,
          "longTimeDelay": 0.15,
          "shortTimePickup": 450,
          "shortTimeDelay": 0.05,
          "instantaneousPickup": 600
        }
      },
      {
        "id": "IEC_ExtremelyInverse",
        "name": "IEC Extremely Inverse",
        "curve": [
          { "current": 150, "time": 30 },
          { "current": 300, "time": 3 },
          { "current": 600, "time": 0.4 },
          { "current": 1200, "time": 0.08 }
        ],
        "settings": {
          "longTimePickup": 150,
          "longTimeDelay": 0.2,
          "shortTimePickup": 450,
          "shortTimeDelay": 0.08,
          "instantaneousPickup": 600
        }
      }
    ],
    "curve": [
      { "current": 150, "time": 40 },
      { "current": 300, "time": 4 },
      { "current": 600, "time": 0.6 },
      { "current": 1200, "time": 0.12 }
    ],
    "tolerance": {
      "timeLower": 0.75,
      "timeUpper": 1.25
    }
  },
  {
    "id": "eaton_seriesC_100",
    "type": "breaker",
    "vendor": "Eaton",
    "name": "Eaton Series C 100A",
    "interruptRating": 25,
    "settings": {
      "pickup": 100,
      "time": 0.2,
      "instantaneous": 500
    },
    "settingOptions": {
      "pickup": [50, 63, 80, 100],
      "time": [0.15, 0.2, 0.25, 0.3],
      "instantaneous": [400, 500, 600, 700, 800, 900]
    },
    "curve": [
      {
        "current": 100,
        "time": 80
      },
      {
        "current": 400,
        "time": 0.4
      },
      {
        "current": 800,
        "time": 0.05
      }
    ],
    "tolerance": {
      "timeLower": 0.75,
      "timeUpper": 1.25
    }
  },
  {
    "id": "mitsubishi_ws_225",
    "type": "breaker",
    "vendor": "Mitsubishi",
    "name": "Mitsubishi WS 225A",
    "interruptRating": 42,
    "settings": {
      "pickup": 225,
      "time": 0.3,
      "instantaneous": 1125
    },
    "settingOptions": {
      "pickup": [125, 160, 200, 225],
      "time": [0.2, 0.3, 0.4, 0.5],
      "instantaneous": [1125, 1350, 1575, 1800, 2025, 2250]
    },
    "curve": [
      {
        "current": 225,
        "time": 100
      },
      {
        "current": 900,
        "time": 0.4
      },
      {
        "current": 1800,
        "time": 0.05
      }
    ],
    "tolerance": {
      "timeLower": 0.75,
      "timeUpper": 1.25
    }
  }
]
;
