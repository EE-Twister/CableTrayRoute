export const ampacity = {
  cu: {
    '16': {70: 110},
    '25': {70: 145},
    '35': {70: 175},
    '50': {70: 210},
    '70': {70: 265}
  },
  al: {
    '25': {70: 125},
    '35': {70: 150},
    '50': {70: 185},
    '70': {70: 230}
  }
};

export const temperatureCorrection = {
  30: {70: 1},
  40: {70: 0.94},
  50: {70: 0.87},
  60: {70: 0.79}
};

export const adjustmentFactors = [
  { max: 2, factor: 1 },
  { max: 3, factor: 0.9 },
  { max: 6, factor: 0.8 },
  { max: 9, factor: 0.7 }
];

export default { ampacity, temperatureCorrection, adjustmentFactors };
