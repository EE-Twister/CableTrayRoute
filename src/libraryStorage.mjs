import {
  readScenarioValue,
  writeScenarioValue,
} from '../projectStorage.js';

/**
 * The library manager stores only generic, scenario-scoped library settings.
 * Keep this small bridge on the library entry so it does not pull the full
 * calculation data store into the library browser bundle.
 */
export const getItem = (key, fallback = null, scenario) => readScenarioValue(key, fallback, scenario);

export const setItem = (key, value, scenario) => writeScenarioValue(key, value, scenario);
