/**
 * Bounded thermal and grounding evidence cases.
 *
 * These cases are intentionally separate from the production benchmark
 * registry.  Expected values are independently derived constants, with the
 * derivation recorded in the handoff artifact.  Passing a case supports only
 * the stated equations and input range; it is not a standards certification.
 */

import {
  calcAmpacity,
  conductorAcResistance,
} from '../iec60287.mjs';
import {
  analyzeGroundGrid,
  gridResistance,
} from '../groundGrid.mjs';

const IEC_60287_SOURCE = {
  title: 'IEC 60287-1-1:2023, Electric cables — Calculation of the current rating — Part 1-1',
  url: 'https://webstore.iec.ch/en/publication/68118',
  locator: 'Publisher catalogue entry; exact licensed equation pages are not publicly accessible (provisional mapping to current-rating and loss equation families)',
  accessedOn: '2026-09-17',
  kind: 'equation_basis',
};

const IEEE_80_SOURCE = {
  title: 'IEEE Std 80-2000, IEEE Guide for Safety in AC Substation Grounding',
  url: 'https://www.armada.mil.co/sites/default/files/normograma_arc/mantenimiento1/IEEE%2080.pdf',
  locator: 'Accessible 2000-edition copy: PDF p.73 (printed p.65), Eq. 52 for Sverak resistance; PDF pages 101–102 (printed pages 93–94), Eqs. 85, 91, and 93 for horizontal conductor length, rod-aware Lm, and rod-aware Ls',
  accessedOn: '2026-09-17',
  kind: 'equation_basis',
};

const PRYSMIAN_SOURCE = {
  title: 'Prysmian Group Marine Cable Catalogue, North Europe',
  url: 'https://no.prysmian.com/sites/default/files/atoms/files/Marine%20Cable%20Catalogue_%20North%20Europe_web_2.pdf',
  locator: 'PDF page 44, Electrical Data, TEMAR PHFX -U/-A/-UFR/-AFR, row 1×95 mm²; R (Ω/km) at +20 °C and +85 °C.',
  accessedOn: '2026-09-17',
  kind: 'published_values',
};

const directBurial95Cu = {
  sizeMm2: 95,
  material: 'Cu',
  insulation: 'XLPE',
  insulThickMm: 1.6,
  nCores: 3,
  installMethod: 'direct-burial',
  burialDepthMm: 800,
  soilResistivity: 1,
  ambientTempC: 20,
  frequencyHz: 50,
};

const tray95Cu = {
  sizeMm2: 95,
  material: 'Cu',
  insulation: 'XLPE',
  insulThickMm: 1.6,
  nCores: 3,
  installMethod: 'tray',
  ambientTempC: 30,
  frequencyHz: 50,
};

const gridResistanceCase = {
  rho: 100,
  L: 100,
  A: 400,
  h: 0.5,
};

const gridSafetyCase = {
  rho: 300,
  gridLx: 90,
  gridLy: 50,
  nx: 6,
  ny: 7,
  h: 0.6,
  d: 0.01,
  Ig: 2000,
  tf: 0.15,
  hasRods: true,
  rodCount: 22,
  rodLength: 3,
  rhoS: 3000,
  hs: 0.1,
  bw: 70,
};

/**
 * Executable evidence definitions.  The input objects are part of the
 * evidence contract so a registry adapter can verify documentation parity.
 */
export const THERMAL_GROUND_BENCHMARKS = [
  {
    id: 'TGE-THERM-001',
    fixtureId: 'thermal-prysmian-95-cu-dc-resistance',
    label: 'Prysmian manufacturer data — 95 mm² Cu DC resistance at 85 °C',
    studyType: 'Cable thermal',
    standardRef: 'Prysmian Marine Cable Catalogue, Electrical Data',
    sourceUrl: PRYSMIAN_SOURCE.url,
    source: PRYSMIAN_SOURCE,
    inputs: {
      sizeMm2: 95,
      material: 'Cu',
      operatingTempC: 85,
      frequencyHz: 50,
      shape: 'round',
    },
    inputUnits: {
      sizeMm2: 'mm²',
      material: 'material code',
      operatingTempC: '°C',
      frequencyHz: 'Hz',
      shape: 'geometry code',
    },
    description: 'Checks the production DC resistance conversion against Prysmian’s published 1×95 mm² copper conductor values at 20 °C and 85 °C.',
    assumptions: [
      'The catalogue row is used only for DC resistance; no cable ampacity, AC skin effect, proximity, sheath, or installation claim is made.',
      'Published 0.193 Ω/km at 20 °C and 0.242 Ω/km at 85 °C are converted to 0.000193 Ω/m and 0.000242 Ω/m.',
      'The production temperature coefficient is evaluated at 85 °C; the manufacturer value is rounded to 0.001 Ω/km, so the allowed absolute error is 0.0005 Ω/km = 5e-7 Ω/m.',
    ],
    independentDerivation: 'Prysmian’s row 1×95 mm² lists Rdc = 0.193 Ω/km at +20 °C and 0.242 Ω/km at +85 °C. Convert by dividing by 1000: 0.000193 Ω/m and 0.000242 Ω/m. The production temperature model gives 0.000193·[1+0.00393·(85−20)] = 0.00024230185 Ω/m, within 5e-7 Ω/m of the published rounded value. This case does not validate the catalogue’s cable construction beyond the resistance row.',
    limitations: [
      'The production proximity factor is a bounded three-core touching-trefoil approximation; this case does not validate arbitrary cable construction or sheath bonding.',
    ],
    run() {
      const result = conductorAcResistance(this.inputs);
      return {
        rDc20OhmPerM: result.R_dc20,
        rDc85OhmPerM: result.R_dcTheta,
      };
    },
    checks: [
      {
        key: 'rDc20OhmPerM',
        description: 'DC conductor resistance at 20 °C',
        expectedVal: 0.000193,
        tolerance: 5e-7,
        unit: 'Ω/m',
        toleranceBasis: 'Absolute 5e-7 Ω/m is half the manufacturer table resolution of 0.001 Ω/km after conversion to Ω/m.',
      },
      {
        key: 'rDc85OhmPerM',
        description: 'DC conductor resistance at 85 °C',
        expectedVal: 0.000242,
        tolerance: 5e-7,
        unit: 'Ω/m',
        toleranceBasis: 'Absolute 5e-7 Ω/m is half the manufacturer table resolution of 0.001 Ω/km after conversion to Ω/m.',
      },
    ],
  },

  {
    id: 'TGE-THERM-002',
    fixtureId: 'thermal-direct-burial-95-cu-xlpe',
    label: 'IEC 60287 steady-state rating — 95 mm² Cu XLPE direct burial',
    studyType: 'Cable thermal',
    standardRef: 'IEC 60287-1-1:2023 §3.1.1',
    sourceUrl: IEC_60287_SOURCE.url,
    source: IEC_60287_SOURCE,
    inputs: directBurial95Cu,
    inputUnits: {
      sizeMm2: 'mm²',
      material: 'material code',
      insulation: 'insulation code',
      insulThickMm: 'mm',
      nCores: 'load-carrying conductors',
      installMethod: 'installation code',
      burialDepthMm: 'mm',
      soilResistivity: 'K·m/W',
      ambientTempC: '°C',
      frequencyHz: 'Hz',
    },
    description: 'Checks the direct-burial steady-state heat balance and reverse conductor-temperature check for a three-core XLPE cable.',
    assumptions: [
      'Defaults used by calcAmpacity are outerSheathMm = 3 mm, armoured = false, U0_kV = 0, nCables = 1, and groupArrangement = flat.',
      'XLPE insulation resistivity is 3.5 K·m/W; filler/bedding T2 = 0.02 K·m/W; jacket resistivity is 6 K·m/W; three-core cable diameter factor is 2.16.',
      'The direct-burial external resistance uses 0.8 m centreline depth and soil resistivity 1.0 K·m/W; no soil dry-out or cyclic load is included.',
    ],
    independentDerivation: 'With dc=2√(95/π) mm, T1=(3.5/2π)ln(1+2·1.6/dc), Dgroup=dc+3.2 mm, Dcable=2.16Dgroup, T3=(6/2π)ln(1+6/Dcable), De_mm=Dcable+6 mm, and De_m=De_mm/1000 before using T4=(1/2π)ln(2·0.8/De_m+√[(2·0.8/De_m)²−1]), the unrounded Rtotal is 2.8478873027 K·m/W. With Rac=0.00024654997977 Ω/m, I=√[70/(Rac·Rtotal)] = 315.7440 A. The production path rounds T1–T4 to four decimals before solving and returns 315.8 A; the declared 0.1 A tolerance covers this disclosed intermediate-rounding difference. The independent arithmetic is reproduced in tests/thermalGroundEvidence.test.mjs.',
    limitations: [
      'Soil is uniform and no soil drying-out, cyclic loading, crossing cables, or measured cable construction is represented.',
      'The expected value is an independent heat-balance derivation using the fixture geometry and stated model assumptions, not a published worked-example value.',
    ],
    run() {
      const result = calcAmpacity(this.inputs);
      const { T1, T2, T3, T4 } = result.thermalResistances;
      return {
        ampacityA: result.I_rated,
        conductorTemperatureC: result.thetaConductorActual,
        totalThermalResistanceKmPerW: T1 + this.inputs.nCores * (T2 + T3 + T4),
      };
    },
    checks: [
      {
        key: 'ampacityA',
        description: 'Continuous current rating',
        expectedVal: 315.8,
        tolerance: 0.1,
        unit: 'A RMS',
        toleranceBasis: 'Absolute 0.1 A matches the production result display resolution; the independent heat-balance value is 315.8 A after one-decimal rounding.',
      },
      {
        key: 'conductorTemperatureC',
        description: 'Reverse-calculated conductor temperature',
        expectedVal: 90,
        tolerance: 0.1,
        unit: '°C',
        toleranceBasis: 'Absolute 0.1 °C matches the production reverse-check resolution and catches ambient/temperature-rise basis drift.',
      },
      {
        key: 'totalThermalResistanceKmPerW',
        description: 'Total radial thermal resistance used by conductor loss',
        expectedVal: 2.847887302708753,
        tolerance: 0.0002,
        unit: 'K·m/W',
        toleranceBasis: 'Absolute 2e-4 K·m/W covers the production four-decimal intermediate rounding (actual 2.8477) against the unrounded independent value 2.8478873 while catching installation geometry branch errors.',
      },
    ],
  },

  {
    id: 'TGE-THERM-003',
    fixtureId: 'thermal-installation-variant-95-cu-xlpe',
    label: 'IEC 60287 installation variant — direct burial versus tray',
    studyType: 'Cable thermal',
    standardRef: 'IEC 60287-1-1:2023 §3.1.1; steady-state installation equations',
    sourceUrl: IEC_60287_SOURCE.url,
    source: IEC_60287_SOURCE,
    inputs: { directBurial: directBurial95Cu, tray: tray95Cu },
    inputUnits: {
      'directBurial.sizeMm2': 'mm²',
      'directBurial.insulThickMm': 'mm',
      'directBurial.burialDepthMm': 'mm',
      'directBurial.soilResistivity': 'K·m/W',
      'directBurial.ambientTempC': '°C',
      'tray.sizeMm2': 'mm²',
      'tray.insulThickMm': 'mm',
      'tray.ambientTempC': '°C',
    },
    description: 'Uses the same 95 mm² Cu XLPE cable to exercise two implemented installation branches and the expected change in heat rejection.',
    assumptions: [
      'Both variants use outerSheathMm = 3 mm, armoured = false, U0_kV = 0, nCables = 1, and groupArrangement = flat defaults.',
      'Direct burial uses 0.8 m depth and 1.0 K·m/W soil; tray uses the implemented single-layer h = 8 W/(m²·K) free-air screen.',
    ],
    independentDerivation: 'The same unrounded IEC-style heat balance is evaluated for direct burial and tray, changing only external T4 and ambient temperature. Direct burial gives 315.7440 A unrounded; tray gives 247.5618 A unrounded. Production rounds thermal terms to four decimals and current to 0.1 A, yielding 315.8 A and 247.6 A; 0.1 A tolerances cover that documented rounding.',
    limitations: [
      'The tray branch is a single-layer free-air screen with a fixed convection coefficient; tray geometry, wind, spacing, and mutual heating require project-specific review.',
      'The direct-burial branch assumes homogeneous soil and does not validate manufacturer ampacity tables.',
    ],
    run() {
      return {
        directBurialAmpacityA: calcAmpacity(this.inputs.directBurial).I_rated,
        trayAmpacityA: calcAmpacity(this.inputs.tray).I_rated,
      };
    },
    checks: [
      {
        key: 'directBurialAmpacityA',
        description: 'Direct-burial rating',
        expectedVal: 315.8,
        tolerance: 0.1,
        unit: 'A RMS',
        toleranceBasis: 'Absolute 0.1 A matches one-decimal production display and detects direct-burial T4/soil-unit drift.',
      },
      {
        key: 'trayAmpacityA',
        description: 'Tray rating',
        expectedVal: 247.6,
        tolerance: 0.1,
        unit: 'A RMS',
        toleranceBasis: 'Absolute 0.1 A matches one-decimal production display and detects tray convection/ambient-branch drift.',
      },
    ],
  },

  {
    id: 'TGE-GROUND-001',
    fixtureId: 'ground-sverak-resistance-100rho',
    label: 'IEEE 80 grid resistance — Sverak equation',
    studyType: 'Grounding',
    standardRef: 'IEEE Std 80-2000 Eq. (52)',
    sourceUrl: IEEE_80_SOURCE.url,
    source: IEEE_80_SOURCE,
    inputs: gridResistanceCase,
    inputUnits: {
      rho: 'Ω·m',
      L: 'm',
      A: 'm²',
      h: 'm',
    },
    description: 'Checks the soil-resistivity, total-conductor-length, area, and burial-depth units in the implemented Sverak grid-resistance equation.',
    assumptions: [
      'The four inputs are already normalized SI quantities; no rod, surface-layer, fault-current, or body-weight default is involved in this isolated resistance check.',
    ],
    independentDerivation: 'Rg = ρ/L + [ρ/√(20A)]·[1 + 1/(1 + h√(20/A))] = 3.1236380279902947 Ω. The arithmetic is reproduced independently in tests/thermalGroundEvidence.test.mjs.',
    limitations: [
      'The uniform-soil Sverak approximation does not represent multilayer soil, transfer voltage, or field fall-of-potential measurements.',
      'IEEE 80 Annex B.1 values in the existing registry were not accepted as published evidence because the exact primary page and value mapping were inaccessible.',
    ],
    run() {
      return { gridResistanceOhm: gridResistance(this.inputs.rho, this.inputs.L, this.inputs.A, this.inputs.h) };
    },
    checks: [
      {
        key: 'gridResistanceOhm',
        description: 'Grid resistance to remote earth',
        expectedVal: 3.1236380279902947,
        tolerance: 1e-9,
        unit: 'Ω',
        toleranceBasis: 'Absolute 1e-9 Ω is numerical-rounding scale for the closed-form equation and catches length/area unit errors.',
      },
    ],
  },

  {
    id: 'TGE-GROUND-002',
    fixtureId: 'ground-mesh-step-touch-eit-appendix-e-inputs',
    label: 'IEEE 80 mesh, step, and tolerable-voltage equations — EIT Appendix E input geometry',
    studyType: 'Grounding',
    standardRef: 'IEEE Std 80-2000 Eqs. (85), (91), (93); EIT Appendix E published input geometry',
    sourceUrl: IEEE_80_SOURCE.url,
    source: IEEE_80_SOURCE,
    inputSource: {
      title: 'EIT, High Voltage Design and Installations Master Class, Appendix E worked-example input geometry',
      url: 'https://www.eit.edu.au/resources/high-voltage-design-and-installations-master-class/',
      locator: 'Appendix E input narrative; output pages are image-only and were not accessed',
      accessedOn: '2026-09-17',
      kind: 'published_values',
    },
    inputs: gridSafetyCase,
    inputUnits: {
      rho: 'Ω·m',
      gridLx: 'm',
      gridLy: 'm',
      nx: 'conductors',
      ny: 'conductors',
      h: 'm',
      d: 'm',
      Ig: 'A RMS',
      tf: 's',
      hasRods: 'boolean',
      rodCount: 'rods',
      rodLength: 'm',
      rhoS: 'Ω·m',
      hs: 'm',
      bw: 'kg',
    },
    description: 'Uses publicly stated Appendix E geometry and soil inputs, then independently evaluates the implemented rectangular-grid mesh, step, touch, step-limit, and resistance equations. The EIT output images are not claimed as expected values.',
    assumptions: [
      'The EIT input narrative supplies the geometry and soil context: gridLx = 90 m, gridLy = 50 m, nx = 6, ny = 7, conductor length = 890 m, 22 rods × 3 m, and total effective length = 956 m.',
      'Conductor diameter is 0.01 m because a conductor diameter is not provided; this is an explicit screening assumption, not a published EIT output.',
      'Ig = 2,000 A is an explicit synthetic comparison current. The EIT example’s 3.1 kA current and decrement calculation are outside this fixture. Fault duration tf = 0.15 s, surface resistivity 3,000 Ω·m, surface thickness 0.1 m, and 70 kg body factor are explicit fixture assumptions.',
    ],
    independentDerivation: 'A=90·50=4500 m², Lp=280 m, Lc=6·90+7·50=890 m, Lr=22·3=66 m, D=√[(90/6)(50/5)]=12.2474487 m. IEEE 80 Eq. (85) uses horizontal Lc for n, Eq. (91) uses Lm=Lc+[1.55+1.22·(rodLength/√(Lx²+Ly²))]Lr=994.6462381 m for mesh voltage, and Eq. (93) uses Ls=0.75Lc+0.85Lr=723.6 m for step voltage. The independent results are Rg=2.2753459929 Ω, Em=960.4084271 V, Es=419.0711686 V, Etouch=1720.0364211 V, Estep=5664.0289137 V. Tests reproduce the equations separately.',
    limitations: [
      'The rectangular IEEE 80 equations are a screening model; irregular grids, transferred voltage, multilayer soil, current split, and field measurements are outside this fixture.',
      'The public EIT output images were unavailable during review; no EIT published output is claimed and the expected values are independent analytical results.',
    ],
    run() {
      const result = analyzeGroundGrid(this.inputs);
      return {
        meshVoltageV: result.Em,
        stepVoltageV: result.Es,
        tolerableTouchV: result.Etouch,
        tolerableStepV: result.Estep,
        gridResistanceOhm: result.Rg,
        touchSafe: result.touchSafe,
        stepSafe: result.stepSafe,
      };
    },
    checks: [
      {
        key: 'meshVoltageV',
        description: 'Mesh voltage',
        expectedVal: 960.4084270521508,
        tolerance: 1e-6,
        unit: 'V',
        toleranceBasis: 'Absolute 1e-6 V is numerical-rounding scale for the independently reproduced closed-form factors.',
      },
      {
        key: 'stepVoltageV',
        description: 'Step voltage',
        expectedVal: 419.071168551245,
        tolerance: 1e-6,
        unit: 'V',
        toleranceBasis: 'Absolute 1e-6 V is numerical-rounding scale for the independent IEEE 80-2000 Eq. (93) effective step-length calculation.',
      },
      {
        key: 'tolerableTouchV',
        description: '70 kg tolerable touch voltage with surface layer',
        expectedVal: 1720.0364211006704,
        tolerance: 1e-6,
        unit: 'V',
        toleranceBasis: 'Absolute 1e-6 V is numerical-rounding scale; body-weight, fault-time, and surface-layer inputs are fixed.',
      },
      {
        key: 'tolerableStepV',
        description: '70 kg tolerable step voltage with surface layer',
        expectedVal: 5664.028913693552,
        tolerance: 1e-6,
        unit: 'V',
        toleranceBasis: 'Absolute 1e-6 V is numerical-rounding scale; body-weight, fault-time, and surface-layer inputs are fixed.',
      },
      {
        key: 'gridResistanceOhm',
        description: 'Grid resistance',
        expectedVal: 2.2753459929192146,
        tolerance: 1e-9,
        unit: 'Ω',
        toleranceBasis: 'Absolute 1e-9 Ω is numerical-rounding scale for the Sverak closed form.',
      },
      {
        key: 'touchSafe',
        description: 'Mesh voltage is below tolerable touch voltage',
        expectedVal: true,
        tolerance: 0,
        type: 'boolean',
        unit: 'boolean',
        toleranceBasis: 'Exact boolean comparison; the independent values are 960.4 V mesh versus 1720.0 V tolerable touch.',
      },
      {
        key: 'stepSafe',
        description: 'Step voltage is below tolerable step voltage',
        expectedVal: true,
        tolerance: 0,
        type: 'boolean',
        unit: 'boolean',
        toleranceBasis: 'Exact boolean comparison; the independent values are 419.1 V step versus 5664.0 V tolerable step.',
      },
    ],
  },
];

export default THERMAL_GROUND_BENCHMARKS;
