import "./workflowStatus.js";
import "../site.js";

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
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDeferredWorkflowModuleLoading, { once: true });
  } else {
    initDeferredWorkflowModuleLoading();
  }
}
