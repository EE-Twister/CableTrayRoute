import "./workflowStatus.js";
import "../site.js";
import {
  getCables,
  getConduits,
  getDuctbanks,
  getEquipment,
  getLoads,
  getProjectSaveState,
  getTrays
} from "../dataStore.mjs";
import { onProjectChange } from "../projectStorage.js";
import { countHomeWorkspaceRecords, resolveHomeState } from "./homeState.js";
import { PROJECT_SAVE_STATE_EVENT } from "./projectSaveState.js";

let projectManagerModulePromise = null;
let scenariosModulePromise = null;

function loadProjectManagerModule() {
  if (!projectManagerModulePromise) {
    projectManagerModulePromise = import("./projectManager.js").catch(err => {
      projectManagerModulePromise = null;
      throw err;
    });
  }
  return projectManagerModulePromise;
}

function loadScenariosModule() {
  if (!scenariosModulePromise) {
    scenariosModulePromise = import("./scenarios.js").catch(err => {
      scenariosModulePromise = null;
      throw err;
    });
  }
  return scenariosModulePromise;
}

function warmWorkflowModules() {
  Promise.all([
    loadProjectManagerModule(),
    loadScenariosModule()
  ]).catch(err => {
    console.error("Deferred workflow module load failed", err);
  });
}

function initDeferredWorkflowModuleLoading() {
  if (typeof document === "undefined") return;

  const settingsBtn = document.getElementById("settings-btn");
  const settingsMenu = document.getElementById("settings-menu");
  const workflowGrid = document.querySelector(".workflow-grid");

  const settingsIntentHandler = () => {
    warmWorkflowModules();
  };

  [settingsBtn, settingsMenu].forEach(node => {
    if (!node) return;
    node.addEventListener("pointerenter", settingsIntentHandler, { once: true });
    node.addEventListener("focusin", settingsIntentHandler, { once: true });
    node.addEventListener("click", settingsIntentHandler, { once: true });
  });

  if (workflowGrid) {
    const navIntentHandler = event => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor) return;
      warmWorkflowModules();
    };
    workflowGrid.addEventListener("pointerenter", navIntentHandler, { once: true, capture: true });
    workflowGrid.addEventListener("focusin", navIntentHandler, { once: true, capture: true });
  }

  if (document.querySelector("[data-project-workspace]")) {
    loadProjectManagerModule().catch(err => {
      console.error("Project workspace module load failed", err);
    });
  }
}

// Prefer the save-state tracker's latest result (site.js keeps it current and
// coalesced); evaluate directly only before its first report.
function readHomeSaveState() {
  const tracked = typeof window !== "undefined" ? window.__ctrProjectSaveState : null;
  if (tracked) return tracked;
  try {
    return getProjectSaveState();
  } catch (err) {
    console.warn("Home project save state unavailable", err);
    return null;
  }
}

// Show one identity block and one primary action per state: an empty
// workspace starts from My Projects, a project in progress from its card and
// next action. Save appears only when there is unsaved work.
function renderHomeState() {
  const body = document.body;
  if (!body?.classList.contains("home-page")) return;
  const recordCount = countHomeWorkspaceRecords({
    getEquipment,
    getLoads,
    getCables,
    getTrays,
    getConduits,
    getDuctbanks
  }, err => console.warn("Home record count read failed", err));
  const { state, canSave } = resolveHomeState({ saveState: readHomeSaveState(), recordCount });
  body.dataset.homeState = state;
  const saveButton = document.getElementById("home-save-project-btn");
  if (saveButton) saveButton.hidden = !canSave;
}

function initHomeState() {
  if (typeof document === "undefined" || !document.body?.classList.contains("home-page")) return;
  renderHomeState();
  onProjectChange(() => renderHomeState());
  if (typeof window !== "undefined") {
    window.addEventListener(PROJECT_SAVE_STATE_EVENT, () => renderHomeState());
  }
}

function initHomePage() {
  initHomeState();
  initDeferredWorkflowModuleLoading();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHomePage, { once: true });
  } else {
    initHomePage();
  }
}
