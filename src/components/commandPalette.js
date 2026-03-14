import { getSessionPreferences, updateSessionPreferences } from "../../projectStorage.js";

const RECENT_KEY = "commandPaletteRecent";
const RECENT_LIMIT = 6;
const MAX_RESULTS = 10;

function toggleCheckbox(id) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement) || el.type !== "checkbox") return false;
  el.checked = !el.checked;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

const ACTIONS = [
  { id: "project:new", label: "New Project", keywords: ["create", "fresh", "reset"], trigger: () => clickById("new-project-btn") },
  { id: "project:import", label: "Import Project", keywords: ["open", "upload"], trigger: () => clickById("import-project-btn") },
  { id: "project:export", label: "Export Project", keywords: ["download", "backup"], trigger: () => clickById("export-project-btn") },
  { id: "project:save", label: "Save Project", keywords: ["persist", "write"], trigger: () => clickById("save-project-btn") },
  { id: "help:open", label: "Open Help", keywords: ["docs", "support"], trigger: () => clickById("help-btn") },
  { id: "settings:dark-mode", label: "Toggle Dark Mode", keywords: ["theme", "light", "dark", "appearance"], trigger: () => toggleCheckbox("dark-toggle") },
  { id: "settings:compact-mode", label: "Toggle Compact Mode", keywords: ["density", "table", "compact"], trigger: () => toggleCheckbox("compact-toggle") },
  { id: "settings:units", label: "Switch Units (Imperial / Metric)", keywords: ["imperial", "metric", "measurement"], trigger: () => { const sel = document.getElementById("unit-select"); if (!sel) return false; sel.value = sel.value === "imperial" ? "metric" : "imperial"; sel.dispatchEvent(new Event("change", { bubbles: true })); return true; } },
  { id: "workflow:equipment", label: "Go to Equipment List", keywords: ["navigation", "equipment"], href: "equipmentlist.html" },
  { id: "workflow:load", label: "Go to Load List", keywords: ["navigation", "load"], href: "loadlist.html" },
  { id: "workflow:cable", label: "Go to Cable Schedule", keywords: ["navigation", "cables"], href: "cableschedule.html" },
  { id: "workflow:raceway", label: "Go to Raceway Schedule", keywords: ["navigation", "tray", "conduit"], href: "racewayschedule.html" },
  { id: "workflow:ductbank", label: "Go to Ductbank Analysis", keywords: ["navigation", "underground", "thermal"], href: "ductbankroute.html" },
  { id: "workflow:trayfill", label: "Go to Tray Fill", keywords: ["navigation", "fill", "capacity"], href: "cabletrayfill.html" },
  { id: "workflow:conduitfill", label: "Go to Conduit Fill", keywords: ["navigation", "fill", "nec"], href: "conduitfill.html" },
  { id: "workflow:route", label: "Go to Optimal Route", keywords: ["navigation", "routing", "dijkstra", "pathfinding"], href: "optimalRoute.html" },
  { id: "workflow:oneline", label: "Go to One-Line Diagram", keywords: ["navigation", "diagram", "schematic"], href: "oneline.html" },
  { id: "workflow:panel", label: "Go to Panel Schedule", keywords: ["navigation", "panel", "branch"], href: "panelschedule.html" },
  { id: "calc:loadflow", label: "Run Load Flow", keywords: ["calculation", "study", "analysis"], trigger: () => clickById("run-loadflow-btn") },
  { id: "calc:shortcircuit", label: "Run Short Circuit", keywords: ["calculation", "study", "analysis", "fault"], trigger: () => clickById("run-shortcircuit-btn") },
  { id: "calc:arcflash", label: "Run Arc Flash", keywords: ["calculation", "study", "analysis", "hazard"], trigger: () => clickById("run-arcflash-btn") }
];

function clickById(id) {
  const node = document.getElementById(id);
  if (!node || node instanceof HTMLButtonElement === false) return false;
  if (node.disabled) return false;
  node.click();
  return true;
}

function normalize(value = "") {
  return String(value).toLowerCase().trim();
}

function fuzzyScore(query, target) {
  if (!query) return 1;
  let score = 0;
  let q = 0;
  const normalizedTarget = normalize(target);
  for (let i = 0; i < normalizedTarget.length && q < query.length; i += 1) {
    if (normalizedTarget[i] === query[q]) {
      q += 1;
      score += 1;
    }
  }
  if (q !== query.length) return 0;
  const startIndex = normalizedTarget.indexOf(query[0]);
  return score + (startIndex >= 0 ? Math.max(0, 3 - startIndex * 0.1) : 0);
}

function getRecentIds() {
  const recent = getSessionPreferences()?.[RECENT_KEY];
  return Array.isArray(recent) ? recent.filter(item => typeof item === "string") : [];
}

function saveRecentId(actionId) {
  updateSessionPreferences(current => {
    const recent = Array.isArray(current?.[RECENT_KEY]) ? current[RECENT_KEY] : [];
    const next = [actionId, ...recent.filter(item => item !== actionId)].slice(0, RECENT_LIMIT);
    return { ...current, [RECENT_KEY]: next };
  });
}

function executeAction(action) {
  if (!action) return false;
  let completed = false;
  if (typeof action.trigger === "function") {
    completed = action.trigger() === true;
  } else if (action.href) {
    completed = true;
    window.location.href = action.href;
  }
  if (completed) {
    saveRecentId(action.id);
  }
  return completed;
}

function resolveResults(query) {
  const normalizedQuery = normalize(query);
  const recentIds = getRecentIds();
  const recentActions = recentIds
    .map(id => ACTIONS.find(action => action.id === id))
    .filter(Boolean);

  const matching = ACTIONS
    .map(action => {
      const haystack = [action.label, ...(action.keywords || [])].join(" ");
      return { action, score: fuzzyScore(normalizedQuery, haystack) };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.action);

  const merged = normalizedQuery
    ? matching
    : [...recentActions, ...matching.filter(action => !recentIds.includes(action.id))];
  return merged.slice(0, MAX_RESULTS);
}

function createPalette() {
  const overlay = document.createElement("div");
  overlay.className = "command-palette-overlay";
  overlay.hidden = true;

  const panel = document.createElement("div");
  panel.className = "command-palette-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "command-palette-title");

  const header = document.createElement("div");
  header.className = "command-palette-header";

  const title = document.createElement("h2");
  title.id = "command-palette-title";
  title.className = "command-palette-title";
  title.textContent = "Command Palette";

  const closeBtn = document.createElement("button");
  closeBtn.className = "command-palette-close";
  closeBtn.setAttribute("aria-label", "Close command palette");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => closePalette());

  header.append(title, closeBtn);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "command-palette-input";
  input.placeholder = "Search actions and navigation";
  input.setAttribute("aria-label", "Search commands");

  const hint = document.createElement("p");
  hint.className = "command-palette-hint";
  hint.textContent = "Type to search · ↑/↓ to move · Enter to run";

  const list = document.createElement("ul");
  list.className = "command-palette-list";

  panel.append(header, input, hint, list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let results = [];
  let activeIndex = 0;

  function closePalette() {
    overlay.hidden = true;
  }

  function runSelection(index) {
    if (!results[index]) return;
    const wasExecuted = executeAction(results[index]);
    if (wasExecuted) {
      closePalette();
    }
  }

  function render() {
    results = resolveResults(input.value);
    if (activeIndex >= results.length) activeIndex = 0;
    list.replaceChildren();

    if (!results.length) {
      const empty = document.createElement("li");
      empty.className = "command-palette-empty";
      empty.textContent = "No matching command";
      list.appendChild(empty);
      return;
    }

    results.forEach((action, index) => {
      const item = document.createElement("li");
      item.className = "command-palette-item";
      if (index === activeIndex) {
        item.classList.add("is-active");
      }
      const labelSpan = document.createElement('span');
      labelSpan.textContent = action.label;
      const kbd = document.createElement('kbd');
      kbd.textContent = 'Enter';
      item.appendChild(labelSpan);
      item.appendChild(kbd);
      item.addEventListener("mouseenter", () => {
        activeIndex = index;
        render();
      });
      item.addEventListener("click", () => runSelection(index));
      list.appendChild(item);
    });
  }

  function openPalette() {
    overlay.hidden = false;
    input.value = "";
    activeIndex = 0;
    render();
    input.focus();
  }

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      closePalette();
    }
  });

  input.addEventListener("input", () => {
    activeIndex = 0;
    render();
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closePalette();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!results.length) return;
      activeIndex = (activeIndex + 1) % results.length;
      render();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      activeIndex = (activeIndex - 1 + results.length) % results.length;
      render();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runSelection(activeIndex);
    }
  });

  document.addEventListener("keydown", event => {
    const triggerPressed = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (!triggerPressed) return;
    event.preventDefault();
    if (overlay.hidden) {
      openPalette();
    } else {
      closePalette();
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", createPalette);
}

export { createPalette };
