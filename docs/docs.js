// Navigation hierarchy for documentation sections
const DOC_SECTIONS = [
  {
    // top level link back to the documentation landing page
    pages: [{ href: "index.html", title: "Docs Home" }],
  },
  {
    title: "Getting Started",
    pages: [
      { href: "quickstart.html", title: "Quick Start" },
      { href: "tutorial.html", title: "From empty to routed" },
    ],
  },
  {
    title: "Data & Templates",
    pages: [
      { href: "templates.html", title: "CSV/XLSX Templates" },
      { href: "geometry-fields.html", title: "Geometry Fields" },
      { href: "tray_id_convention.html", title: "Tray ID Convention" },
    ],
  },
  {
    title: "Advanced Topics",
    pages: [
      { href: "AMPACITY_METHOD.html", title: "Ampacity Method" },
      { href: "soil_resistivity.html", title: "Soil Resistivity" },
      { href: "math.html", title: "Math References" },
    ],
  },
  {
    title: "Standards",
    pages: [{ href: "standards.html", title: "Engineering References" }],
  },
  {
    title: "Support",
    pages: [{ href: "troubleshooting.html", title: "Troubleshooting" }],
  },
];

document.addEventListener("DOMContentLoaded", () => {
  const last = document.getElementById("last-updated");
  if (last) {
    const date = new Date(document.lastModified);
    last.textContent = date.toLocaleDateString();
  }

  const nav = document.getElementById("doc-nav");
  if (nav) {
    DOC_SECTIONS.forEach((section) => {
      if (section.title) {
        const heading = document.createElement("span");
        heading.textContent = section.title;
        heading.classList.add("nav-section");
        nav.appendChild(heading);
      }
      const ul = document.createElement("ul");
      section.pages.forEach((page) => {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = page.href;
        link.textContent = page.title;
        if (location.pathname.endsWith(page.href)) {
          link.classList.add("active");
          link.setAttribute("aria-current", "page");
        }
        li.appendChild(link);
        ul.appendChild(li);
      });
      nav.appendChild(ul);
    });
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
