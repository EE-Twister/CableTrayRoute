// Navigation hierarchy for documentation sections
// Supports nested subsections for a clearer hierarchy similar to
// traditional documentation sites.
const DOC_NAV = [
  { href: "index.html", title: "Docs Home" },
  {
    title: "Getting Started",
    children: [
      { href: "quickstart.html", title: "Quick Start" },
      { href: "tutorial.html", title: "From empty to routed" },
    ],
  },
  {
    title: "Data & Templates",
    children: [
      { href: "templates.html", title: "CSV/XLSX Templates" },
      { href: "geometry-fields.html", title: "Geometry Fields" },
      { href: "tray_id_convention.html", title: "Tray ID Convention" },
    ],
  },
  {
    title: "Advanced Topics",
    children: [
      { href: "AMPACITY_METHOD.html", title: "Ampacity Method" },
      { href: "soil_resistivity.html", title: "Soil Resistivity" },
      { href: "math.html", title: "Math References" },
    ],
  },
  {
    title: "Standards",
    children: [{ href: "standards.html", title: "Engineering References" }],
  },
  {
    title: "Support",
    children: [{ href: "troubleshooting.html", title: "Troubleshooting" }],
  },
];

// Recursively build nested navigation lists
function buildNav(items) {
  const ul = document.createElement("ul");
  items.forEach((item) => {
    const li = document.createElement("li");

    if (item.href) {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.title;
      if (location.pathname.endsWith(item.href)) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
      li.appendChild(link);
    } else if (item.title) {
      const span = document.createElement("span");
      span.textContent = item.title;
      span.classList.add("nav-section");
      li.appendChild(span);
    }

    if (item.children) {
      li.appendChild(buildNav(item.children));
    }

    ul.appendChild(li);
  });
  return ul;
}

document.addEventListener("DOMContentLoaded", () => {
  const last = document.getElementById("last-updated");
  if (last) {
    const date = new Date(document.lastModified);
    last.textContent = date.toLocaleDateString();
  }

  const nav = document.getElementById("doc-nav");
  if (nav) {
    nav.appendChild(buildNav(DOC_NAV));
  }

  const search = document.getElementById("doc-search");
  if (search) {
    const sections = Array.from(document.querySelectorAll("#doc-list section"));
    search.addEventListener("input", () => {
      const term = search.value.toLowerCase();
      sections.forEach((section) => {
        let visible = false;
        section.querySelectorAll("li").forEach((li) => {
          const text = li.textContent.toLowerCase();
          const show = text.includes(term);
          li.style.display = show ? "" : "none";
          if (show) visible = true;
        });
        section.style.display = visible ? "" : "none";
      });
    });
  }
});
