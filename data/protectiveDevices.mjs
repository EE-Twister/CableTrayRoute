export default [
  {
    "id": "abb_tmax_160",
    "type": "breaker",
    "voltageClass": "LV",
    "vendor": "ABB",
    "name": "ABB Tmax T3 160A",
    "interruptRating": 65,
    "withstandRatingKA": null,
    "withstandCycles": null,
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
    "voltageClass": "LV",
    "vendor": "Siemens",
    "name": "Siemens 3VA 125A",
    "interruptRating": 35,
    "withstandRatingKA": null,
    "withstandCycles": null,
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
    "voltageClass": "LV",
    "vendor": "Schneider",
    "name": "Schneider Compact NSX100",
    "interruptRating": 50,
    "withstandRatingKA": null,
    "withstandCycles": null,
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
    "voltageClass": "LV",
    "vendor": "Eaton Bussmann",
    "name": "Bussmann LPS-RK-SP 400A",
    "interruptRating": 200,
    "withstandRatingKA": null,
    "withstandCycles": null,
    "settings": {
      "ampRating": 400
    },
    "settingOptions": {
      "ampRating": [100, 200, 400, 600]
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
    "voltageClass": "LV",
    "vendor": "Mersen",
    "name": "Mersen TRS-R 200A",
    "interruptRating": 200,
    "withstandRatingKA": null,
    "withstandCycles": null,
    "settings": {
      "ampRating": 200
    },
    "settingOptions": {
      "ampRating": [100, 200, 225, 250]
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
    "id": "sample_mv_breaker_1200",
    "type": "breaker",
    "voltageClass": "MV",
    "vendor": "Sample Study",
    "name": "Sample MV Breaker 1200A",
    "interruptRating": 25,
    "withstandRatingKA": null,
    "withstandCycles": null,
    "settings": {
      "pickup": 1200,
      "time": 0.3,
      "instantaneous": 9600
    },
    "settingOptions": {
      "pickup": [800, 1000, 1200, 1400],
      "time": [0.1, 0.2, 0.3, 0.5],
      "instantaneous": [6000, 8000, 9600, 12000]
    },
    "curve": [
      { "current": 1200, "time": 100 },
      { "current": 4800, "time": 3 },
      { "current": 9600, "time": 0.3 },
      { "current": 14400, "time": 0.08 }
    ],
    "tolerance": {
      "timeLower": 0.8,
      "timeUpper": 1.25
    }
  },
  {
    "id": "mv_fuse_65e",
    "type": "fuse",
    "voltageClass": "MV",
    "vendor": "Sample Study",
    "name": "65E MV Power Fuse",
    "interruptRating": 50,
    "withstandRatingKA": null,
    "withstandCycles": null,
    "settings": {
      "ampRating": 65
    },
    "settingOptions": {
      "ampRating": [50, 65, 80, 100]
    },
    "curve": [
      { "current": 65, "time": 600 },
      { "current": 130, "time": 60 },
      { "current": 325, "time": 3 },
      { "current": 650, "time": 0.3 },
      { "current": 1300, "time": 0.05 }
    ],
    "tolerance": {
      "timeLower": 0.85,
      "timeUpper": 1.2
    }
  },
  {
    "id": "sc_smu20_65e_standard_14kv",
    "type": "fuse",
    "voltageClass": "MV",
    "vendor": "S&C Electric Company",
    "series": "SMU-20",
    "name": "S&C SMU-20 65E Standard Speed (14.4 kV)",
    "catalogNumber": "612065",
    "ratedVoltageVac": 14400,
    "maximumVoltageVac": 17000,
    "continuousCurrentA": 65,
    "interruptRating": 14,
    "withstandRatingKA": null,
    "withstandCycles": null,
    "installationRequirement": "Use with a 14.4 kV S&C SMD-20 mounting; the interrupting rating is assembly-dependent.",
    "interruptingRatings": [
      {
        "voltageVac": 14400,
        "currentKA": 14,
        "currentType": "AC",
        "ratingType": "RMS symmetrical",
        "basis": "SMD-20 power fuse with SMU-20 fuse unit at 60 Hz"
      }
    ],
    "settings": {
      "ampRating": 65
    },
    "settingOptions": {
      "ampRating": [65]
    },
    "curve": [
      { "current": 140.18, "time": 602.359 },
      { "current": 140.602, "time": 514.838 },
      { "current": 141.024, "time": 360.269 },
      { "current": 141.589, "time": 171.545 },
      { "current": 143.155, "time": 121.492 },
      { "current": 148.106, "time": 50.2418 },
      { "current": 150.194, "time": 38.2386 },
      { "current": 153.229, "time": 29.4545 },
      { "current": 155.389, "time": 23.1003 },
      { "current": 164.503, "time": 13.9411 },
      { "current": 169.005, "time": 11.4483 },
      { "current": 179.995, "time": 7.6971 },
      { "current": 189.982, "time": 5.79991 },
      { "current": 210.173, "time": 3.89168 },
      { "current": 263.995, "time": 2.0935 },
      { "current": 367.209, "time": 0.976129 },
      { "current": 574.173, "time": 0.388228 },
      { "current": 920.513, "time": 0.1671 },
      { "current": 1601.87, "time": 0.073596 },
      { "current": 2635.76, "time": 0.04039 },
      { "current": 3804.46, "time": 0.029594 },
      { "current": 4909.5, "time": 0.025396 },
      { "current": 9575.16, "time": 0.019601 },
      { "current": 17817.3, "time": 0.016504 }
    ],
    "curveProfiles": [
      {
        "id": "minimum_melting",
        "name": "Minimum melting",
        "role": "melting",
        "curve": [
          { "current": 129.65572, "time": 601.757 },
          { "current": 129.785, "time": 569.554 },
          { "current": 130.30515, "time": 216.34 },
          { "current": 130.69703, "time": 170.69 },
          { "current": 131.22021, "time": 141.012 },
          { "current": 134.27344, "time": 76.3898 },
          { "current": 138.22456, "time": 40.7659 },
          { "current": 141.5818, "time": 29.1614 },
          { "current": 144.73199, "time": 22.3281 },
          { "current": 150.187, "time": 15.4382 },
          { "current": 162.04642, "time": 8.93382 },
          { "current": 179.62648, "time": 5.23749 },
          { "current": 192.45853, "time": 4.01823 },
          { "current": 233.89681, "time": 2.21852 },
          { "current": 272.29398, "time": 1.48563 },
          { "current": 404.59287, "time": 0.609473 },
          { "current": 3164.9057, "time": 0.01 }
        ],
        "curveEvidence": {
          "document": "S&C TCC No. 153-2",
          "date": "2015-07-14",
          "curveNumber": "153-2",
          "extractionMethod": "manufacturer spreadsheet"
        }
      },
      {
        "id": "total_clearing_14_4kv",
        "name": "Total clearing (14.4 kV)",
        "role": "clearing",
        "curve": [
          { "current": 140.18, "time": 602.359 },
          { "current": 140.602, "time": 514.838 },
          { "current": 141.024, "time": 360.269 },
          { "current": 141.589, "time": 171.545 },
          { "current": 143.155, "time": 121.492 },
          { "current": 148.106, "time": 50.2418 },
          { "current": 150.194, "time": 38.2386 },
          { "current": 153.229, "time": 29.4545 },
          { "current": 155.389, "time": 23.1003 },
          { "current": 164.503, "time": 13.9411 },
          { "current": 169.005, "time": 11.4483 },
          { "current": 179.995, "time": 7.6971 },
          { "current": 189.982, "time": 5.79991 },
          { "current": 210.173, "time": 3.89168 },
          { "current": 263.995, "time": 2.0935 },
          { "current": 367.209, "time": 0.976129 },
          { "current": 574.173, "time": 0.388228 },
          { "current": 920.513, "time": 0.1671 },
          { "current": 1601.87, "time": 0.073596 },
          { "current": 2635.76, "time": 0.04039 },
          { "current": 3804.46, "time": 0.029594 },
          { "current": 4909.5, "time": 0.025396 },
          { "current": 9575.16, "time": 0.019601 },
          { "current": 17817.3, "time": 0.016504 }
        ],
        "curveEvidence": {
          "document": "S&C TCC No. 153-2-2",
          "date": "1988-08-29",
          "curveNumber": "153-2-2",
          "extractionMethod": "manufacturer spreadsheet"
        }
      }
    ],
    "curveEvidence": {
      "document": "S&C TCC Nos. 153-2 and 153-2-2",
      "revision": "2015-07-14 minimum melting; 1988-08-29 total clearing",
      "curveNumber": "153-2 / 153-2-2",
      "extractionMethod": "manufacturer spreadsheets; exact source points reduced after application-normalization check"
    },
    "curveReduction": {
      "method": "Adaptive selection of official points after application curve normalization",
      "minimumMelting": { "sourcePoints": 86, "normalizedPoints": 78, "retainedPoints": 17, "maxLogInterpolationError": 0.0202 },
      "totalClearing": { "sourcePoints": 88, "normalizedPoints": 56, "retainedPoints": 24, "maxLogInterpolationError": 0.0229 }
    },
    "sourceUrls": [
      "https://www.sandc.com/en/contact-us/time-current-characteristic-curves/",
      "https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.xlsx",
      "https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2-2.xlsx",
      "https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/specification-bulletin-242-31.pdf"
    ],
    "libraryStatus": "source_verified"
  },
  {
    "id": "sc_smu20_25e_standard_14kv",
    "type": "fuse",
    "voltageClass": "MV",
    "vendor": "S&C Electric Company",
    "series": "SMU-20",
    "name": "S&C SMU-20 25E Standard Speed (14.4 kV)",
    "catalogNumber": "612025",
    "ratedVoltageVac": 14400,
    "maximumVoltageVac": 17000,
    "continuousCurrentA": 25,
    "interruptRating": 14,
    "withstandRatingKA": null,
    "withstandCycles": null,
    "installationRequirement": "Use with a 14.4 kV S&C SMD-20 mounting; the interrupting rating is assembly-dependent.",
    "interruptingRatings": [
      {
        "voltageVac": 14400,
        "currentKA": 14,
        "currentType": "AC",
        "ratingType": "RMS symmetrical",
        "basis": "SMD-20 power fuse with SMU-20 fuse unit at 60 Hz"
      }
    ],
    "settings": { "ampRating": 25 },
    "settingOptions": { "ampRating": [25] },
    "curve": [
      { "current": 53.6206, "time": 601.155 }, { "current": 53.7817, "time": 259.265 },
      { "current": 53.9433, "time": 68.7068 }, { "current": 53.9973, "time": 33.6108 },
      { "current": 54.0513, "time": 33.6108 }, { "current": 54.2137, "time": 25.4533 },
      { "current": 54.8134, "time": 20.6114 }, { "current": 55.9766, "time": 15.9721 },
      { "current": 57.7968, "time": 12.7285 }, { "current": 60.2158, "time": 10.1233 },
      { "current": 66.6153, "time": 6.70493 }, { "current": 70.3114, "time": 5.60043 },
      { "current": 83.5073, "time": 3.30303 }, { "current": 94.5316, "time": 2.39849 },
      { "current": 131.49, "time": 1.1698 }, { "current": 194.597, "time": 0.559808 },
      { "current": 588.708, "time": 0.085165 }, { "current": 910.443, "time": 0.047209 },
      { "current": 1290.68, "time": 0.03411 }, { "current": 1759.75, "time": 0.028207 },
      { "current": 3294.23, "time": 0.023002 }, { "current": 6386.41, "time": 0.019503 },
      { "current": 17835.1, "time": 0.016504 }
    ],
    "curveProfiles": [
      {
        "id": "minimum_melting",
        "name": "Minimum melting",
        "role": "melting",
        "curve": [
          { "current": 49.4486, "time": 39.7197 }, { "current": 49.6468, "time": 39.7197 },
          { "current": 49.9956, "time": 26.4921 }, { "current": 51.4152, "time": 18.0626 },
          { "current": 54.1595, "time": 11.6446 }, { "current": 55.4196, "time": 10.2046 },
          { "current": 60.3363, "time": 7.06281 }, { "current": 64.5819, "time": 5.53916 },
          { "current": 73.4007, "time": 3.76912 }, { "current": 84.8541, "time": 2.5724 },
          { "current": 106.264, "time": 1.51867 }, { "current": 137.13, "time": 0.887666 },
          { "current": 1326.01, "time": 0.01 }
        ],
        "curveEvidence": {
          "document": "S&C TCC No. 153-2", "date": "2015-07-14", "curveNumber": "153-2", "extractionMethod": "manufacturer spreadsheet"
        }
      },
      {
        "id": "total_clearing_14_4kv",
        "name": "Total clearing (14.4 kV)",
        "role": "clearing",
        "curve": [
          { "current": 53.6206, "time": 601.155 }, { "current": 53.7817, "time": 259.265 },
          { "current": 53.9433, "time": 68.7068 }, { "current": 53.9973, "time": 33.6108 },
          { "current": 54.0513, "time": 33.6108 }, { "current": 54.2137, "time": 25.4533 },
          { "current": 54.8134, "time": 20.6114 }, { "current": 55.9766, "time": 15.9721 },
          { "current": 57.7968, "time": 12.7285 }, { "current": 60.2158, "time": 10.1233 },
          { "current": 66.6153, "time": 6.70493 }, { "current": 70.3114, "time": 5.60043 },
          { "current": 83.5073, "time": 3.30303 }, { "current": 94.5316, "time": 2.39849 },
          { "current": 131.49, "time": 1.1698 }, { "current": 194.597, "time": 0.559808 },
          { "current": 588.708, "time": 0.085165 }, { "current": 910.443, "time": 0.047209 },
          { "current": 1290.68, "time": 0.03411 }, { "current": 1759.75, "time": 0.028207 },
          { "current": 3294.23, "time": 0.023002 }, { "current": 6386.41, "time": 0.019503 },
          { "current": 17835.1, "time": 0.016504 }
        ],
        "curveEvidence": {
          "document": "S&C TCC No. 153-2-2", "date": "1988-08-29", "curveNumber": "153-2-2", "extractionMethod": "manufacturer spreadsheet"
        }
      }
    ],
    "curveEvidence": {
      "document": "S&C TCC Nos. 153-2 and 153-2-2", "revision": "2015-07-14 minimum melting; 1988-08-29 total clearing", "curveNumber": "153-2 / 153-2-2", "extractionMethod": "manufacturer spreadsheets; exact source points reduced after duplicate-current consolidation and monotonic normalization"
    },
    "curveReduction": {
      "method": "Adaptive selection of official points after duplicate-current consolidation and monotonic normalization",
      "minimumMelting": { "sourcePoints": 86, "normalizedPoints": 59, "retainedPoints": 13, "maxLogInterpolationError": 0.0201 },
      "totalClearing": { "sourcePoints": 88, "normalizedPoints": 54, "retainedPoints": 23, "maxLogInterpolationError": 0.0249 }
    },
    "sourceUrls": [
      "https://www.sandc.com/en/contact-us/time-current-characteristic-curves/",
      "https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.xlsx",
      "https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2-2.xlsx",
      "https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/specification-bulletin-665-31.pdf"
    ],
    "libraryStatus": "source_verified"
  },
  {
    "id": "sc_smu20_100e_standard_14kv",
    "type": "fuse",
    "voltageClass": "MV",
    "vendor": "S&C Electric Company",
    "series": "SMU-20",
    "name": "S&C SMU-20 100E Standard Speed (14.4 kV)",
    "catalogNumber": "612100",
    "ratedVoltageVac": 14400,
    "maximumVoltageVac": 17000,
    "continuousCurrentA": 100,
    "interruptRating": 14,
    "withstandRatingKA": null,
    "withstandCycles": null,
    "installationRequirement": "Use with a 14.4 kV S&C SMD-20 mounting; the interrupting rating is assembly-dependent.",
    "interruptingRatings": [
      {
        "voltageVac": 14400,
        "currentKA": 14,
        "currentType": "AC",
        "ratingType": "RMS symmetrical",
        "basis": "SMD-20 power fuse with SMU-20 fuse unit at 60 Hz"
      }
    ],
    "settings": { "ampRating": 100 },
    "settingOptions": { "ampRating": [100] },
    "curve": [
      { "current": 212.285, "time": 601.155 }, { "current": 213.136, "time": 442.24 },
      { "current": 215.709, "time": 297.332 }, { "current": 218.313, "time": 210.998 },
      { "current": 223.84, "time": 145.162 }, { "current": 227.223, "time": 104.569 },
      { "current": 233.675, "time": 69.1895 }, { "current": 239.83, "time": 51.2568 },
      { "current": 272.307, "time": 14.5101 }, { "current": 289.725, "time": 9.5529 },
      { "current": 300.045, "time": 7.85259 }, { "current": 346.863, "time": 3.91902 },
      { "current": 381.05, "time": 2.88015 }, { "current": 491.731, "time": 1.44316 },
      { "current": 768.108, "time": 0.53464 }, { "current": 1196.23, "time": 0.228741 },
      { "current": 1857.39, "time": 0.109026 }, { "current": 3155.58, "time": 0.051707 },
      { "current": 4550.21, "time": 0.034904 }, { "current": 6111.5, "time": 0.027788 },
      { "current": 10518.8, "time": 0.020097 }, { "current": 18177.2, "time": 0.016405 }
    ],
    "curveProfiles": [
      {
        "id": "minimum_melting",
        "name": "Minimum melting",
        "role": "melting",
        "curve": [
          { "current": 195.182, "time": 601.155 }, { "current": 195.964, "time": 553.827 },
          { "current": 196.749, "time": 446.684 }, { "current": 198.926, "time": 299.122 },
          { "current": 201.327, "time": 209.108 }, { "current": 207.458, "time": 122.101 },
          { "current": 217.442, "time": 64.4473 }, { "current": 238.634, "time": 24.1635 },
          { "current": 260.846, "time": 11.5518 }, { "current": 277.253, "time": 7.86045 },
          { "current": 305.8, "time": 4.82998 }, { "current": 335.268, "time": 3.37313 },
          { "current": 441.833, "time": 1.52781 }, { "current": 569.598, "time": 0.828482 },
          { "current": 756.673, "time": 0.440801 }, { "current": 1183.14, "time": 0.172706 },
          { "current": 4929.18, "time": 0.01 }
        ],
        "curveEvidence": {
          "document": "S&C TCC No. 153-2", "date": "2015-07-14", "curveNumber": "153-2", "extractionMethod": "manufacturer spreadsheet"
        }
      },
      {
        "id": "total_clearing_14_4kv",
        "name": "Total clearing (14.4 kV)",
        "role": "clearing",
        "curve": [
          { "current": 212.285, "time": 601.155 }, { "current": 213.136, "time": 442.24 },
          { "current": 215.709, "time": 297.332 }, { "current": 218.313, "time": 210.998 },
          { "current": 223.84, "time": 145.162 }, { "current": 227.223, "time": 104.569 },
          { "current": 233.675, "time": 69.1895 }, { "current": 239.83, "time": 51.2568 },
          { "current": 272.307, "time": 14.5101 }, { "current": 289.725, "time": 9.5529 },
          { "current": 300.045, "time": 7.85259 }, { "current": 346.863, "time": 3.91902 },
          { "current": 381.05, "time": 2.88015 }, { "current": 491.731, "time": 1.44316 },
          { "current": 768.108, "time": 0.53464 }, { "current": 1196.23, "time": 0.228741 },
          { "current": 1857.39, "time": 0.109026 }, { "current": 3155.58, "time": 0.051707 },
          { "current": 4550.21, "time": 0.034904 }, { "current": 6111.5, "time": 0.027788 },
          { "current": 10518.8, "time": 0.020097 }, { "current": 18177.2, "time": 0.016405 }
        ],
        "curveEvidence": {
          "document": "S&C TCC No. 153-2-2", "date": "1988-08-29", "curveNumber": "153-2-2", "extractionMethod": "manufacturer spreadsheet"
        }
      }
    ],
    "curveEvidence": {
      "document": "S&C TCC Nos. 153-2 and 153-2-2", "revision": "2015-07-14 minimum melting; 1988-08-29 total clearing", "curveNumber": "153-2 / 153-2-2", "extractionMethod": "manufacturer spreadsheets; exact source points reduced after duplicate-current consolidation and monotonic normalization"
    },
    "curveReduction": {
      "method": "Adaptive selection of official points after duplicate-current consolidation and monotonic normalization",
      "minimumMelting": { "sourcePoints": 86, "normalizedPoints": 82, "retainedPoints": 17, "maxLogInterpolationError": 0.0245 },
      "totalClearing": { "sourcePoints": 88, "normalizedPoints": 58, "retainedPoints": 22, "maxLogInterpolationError": 0.0238 }
    },
    "sourceUrls": [
      "https://www.sandc.com/en/contact-us/time-current-characteristic-curves/",
      "https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.xlsx",
      "https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2-2.xlsx",
      "https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/specification-bulletin-665-31.pdf"
    ],
    "libraryStatus": "source_verified"
  },
  {
    "id": "ge_multilin_750",
    "type": "relay",
    "vendor": "GE",
    "name": "GE Multilin 750 Relay",
    "interruptRating": null,
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
    "voltageClass": "LV",
    "vendor": "Eaton",
    "name": "Eaton Series C 100A",
    "interruptRating": 25,
    "withstandRatingKA": null,
    "withstandCycles": null,
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
    "voltageClass": "LV",
    "vendor": "Mitsubishi",
    "name": "Mitsubishi WS 225A",
    "interruptRating": 42,
    "withstandRatingKA": null,
    "withstandCycles": null,
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
  },
  {
    "id": "iec_ni_relay",
    "type": "relay",
    "vendor": "IEC 60255-151",
    "name": "IEC Normal Inverse (NI) Relay",
    "iec60255": true,
    "curveFamily": "NI",
    "settings": { "tms": 0.5, "pickup": 100 },
    "settingOptions": {
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      "pickup": [50, 100, 200, 400, 800, 1600]
    },
    "interruptRating": null,
    "curve": []
  },
  {
    "id": "iec_vi_relay",
    "type": "relay",
    "vendor": "IEC 60255-151",
    "name": "IEC Very Inverse (VI) Relay",
    "iec60255": true,
    "curveFamily": "VI",
    "settings": { "tms": 0.5, "pickup": 100 },
    "settingOptions": {
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      "pickup": [50, 100, 200, 400, 800, 1600]
    },
    "interruptRating": null,
    "curve": []
  },
  {
    "id": "iec_ei_relay",
    "type": "relay",
    "vendor": "IEC 60255-151",
    "name": "IEC Extremely Inverse (EI) Relay",
    "iec60255": true,
    "curveFamily": "EI",
    "settings": { "tms": 0.5, "pickup": 100 },
    "settingOptions": {
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      "pickup": [50, 100, 200, 400, 800, 1600]
    },
    "interruptRating": null,
    "curve": []
  },
  {
    "id": "iec_lti_relay",
    "type": "relay",
    "vendor": "IEC 60255-151",
    "name": "IEC Long-Time Inverse (LTI) Relay",
    "iec60255": true,
    "curveFamily": "LTI",
    "settings": { "tms": 0.5, "pickup": 100 },
    "settingOptions": {
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      "pickup": [50, 100, 200, 400, 800, 1600]
    },
    "interruptRating": null,
    "curve": []
  },
  {
    "id": "iec_parametric_relay",
    "type": "relay",
    "vendor": "IEC 60255-151",
    "name": "IEC Parametric Relay",
    "iec60255": true,
    "curveFamily": "NI",
    "settings": { "curveFamily": "NI", "tms": 0.5, "pickup": 100 },
    "settingOptions": {
      "curveFamily": ["NI", "VI", "EI", "LTI"],
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0],
      "pickup": [50, 100, 200, 400, 800, 1600]
    },
    "interruptRating": null,
    "curve": []
  },
  {
    "id": "gfp_ni_relay",
    "type": "relay",
    "vendor": "IEC 60255-151 (GFP)",
    "name": "GFP Normal Inverse – Residual (3I0)",
    "iec60255": true,
    "groundFault": true,
    "curveFamily": "NI",
    "sensorType": "residual",
    "settings": { "tms": 0.3, "pickup": 20 },
    "settingOptions": {
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      "pickup": [5, 10, 20, 30, 50, 100, 200]
    },
    "interruptRating": null,
    "nec230_95": true,
    "curve": []
  },
  {
    "id": "gfp_vi_relay",
    "type": "relay",
    "vendor": "IEC 60255-151 (GFP)",
    "name": "GFP Very Inverse – Residual (3I0)",
    "iec60255": true,
    "groundFault": true,
    "curveFamily": "VI",
    "sensorType": "residual",
    "settings": { "tms": 0.3, "pickup": 20 },
    "settingOptions": {
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      "pickup": [5, 10, 20, 30, 50, 100, 200]
    },
    "interruptRating": null,
    "nec230_95": true,
    "curve": []
  },
  {
    "id": "gfp_ei_relay",
    "type": "relay",
    "vendor": "IEC 60255-151 (GFP)",
    "name": "GFP Extremely Inverse – Residual (3I0)",
    "iec60255": true,
    "groundFault": true,
    "curveFamily": "EI",
    "sensorType": "residual",
    "settings": { "tms": 0.3, "pickup": 20 },
    "settingOptions": {
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      "pickup": [5, 10, 20, 30, 50, 100, 200]
    },
    "interruptRating": null,
    "nec230_95": true,
    "curve": []
  },
  {
    "id": "gfp_zs_relay",
    "type": "relay",
    "vendor": "IEC 60255-151 (GFP)",
    "name": "GFP Very Inverse – Zero-Sequence (I0)",
    "iec60255": true,
    "groundFault": true,
    "curveFamily": "VI",
    "sensorType": "zero_sequence",
    "settings": { "tms": 0.3, "pickup": 10 },
    "settingOptions": {
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      "pickup": [5, 10, 20, 30, 50, 100, 200]
    },
    "interruptRating": null,
    "nec230_95": true,
    "curve": []
  },
  {
    "id": "gfp_parametric_relay",
    "type": "relay",
    "vendor": "IEC 60255-151 (GFP)",
    "name": "GFP Parametric Relay",
    "iec60255": true,
    "groundFault": true,
    "curveFamily": "NI",
    "sensorType": "residual",
    "settings": { "curveFamily": "NI", "tms": 0.3, "pickup": 20, "sensorType": "residual" },
    "settingOptions": {
      "curveFamily": ["NI", "VI", "EI", "LTI"],
      "sensorType": ["residual", "zero_sequence"],
      "tms": [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      "pickup": [5, 10, 20, 30, 50, 100, 200]
    },
    "interruptRating": null,
    "nec230_95": true,
    "curve": []
  },
  {
    "id": "sel_487b",
    "type": "relay",
    "subtype": "relay_87",
    "vendor": "SEL",
    "name": "SEL-487B Bus Differential Relay",
    "zoneType": "87B",
    "settings": {
      "slope1": 0.25,
      "slope2": 0.65,
      "minPickupPu": 0.20,
      "breakpointPu": 3.0,
      "tapSetting": 1.0
    },
    "settingOptions": {
      "slope1": [0.15, 0.20, 0.25, 0.30, 0.35],
      "slope2": [0.50, 0.60, 0.65, 0.70, 0.80],
      "minPickupPu": [0.10, 0.15, 0.20, 0.25, 0.30],
      "breakpointPu": [2.0, 3.0, 4.0, 5.0]
    },
    "harmonicRestraint": false,
    "interruptRating": null,
    "curve": []
  },
  {
    "id": "sel_387",
    "type": "relay",
    "subtype": "relay_87",
    "vendor": "SEL",
    "name": "SEL-387 Transformer Differential Relay",
    "zoneType": "87T",
    "settings": {
      "slope1": 0.25,
      "slope2": 0.65,
      "minPickupPu": 0.20,
      "breakpointPu": 3.0,
      "tapSetting": 6.0,
      "secondHarmonicThresholdPct": 15,
      "fifthHarmonicThresholdPct": 35
    },
    "settingOptions": {
      "slope1": [0.15, 0.20, 0.25, 0.30, 0.35, 0.40],
      "slope2": [0.50, 0.60, 0.65, 0.70, 0.80],
      "minPickupPu": [0.10, 0.15, 0.20, 0.25, 0.30],
      "breakpointPu": [2.0, 3.0, 4.0, 5.0],
      "tapSetting": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 12.0]
    },
    "harmonicRestraint": true,
    "interruptRating": null,
    "curve": []
  },
  {
    "id": "ge_t60",
    "type": "relay",
    "subtype": "relay_87",
    "vendor": "GE",
    "name": "GE Multilin T60 Transformer Protection Relay",
    "zoneType": "87T",
    "settings": {
      "slope1": 0.30,
      "slope2": 0.70,
      "minPickupPu": 0.15,
      "breakpointPu": 4.0,
      "tapSetting": 1.0,
      "secondHarmonicThresholdPct": 15,
      "fifthHarmonicThresholdPct": 35
    },
    "settingOptions": {
      "slope1": [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50],
      "slope2": [0.50, 0.60, 0.70, 0.80, 0.90],
      "minPickupPu": [0.05, 0.10, 0.15, 0.20, 0.25, 0.30],
      "breakpointPu": [2.0, 3.0, 4.0, 5.0, 6.0],
      "tapSetting": [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 12.0]
    },
    "harmonicRestraint": true,
    "interruptRating": null,
    "curve": []
  }
]
;
