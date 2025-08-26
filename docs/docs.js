const DOC_PAGES = [
  { href: "index.html", title: "Docs Home" },
  { href: "quickstart.html", title: "Quick Start" },
  { href: "templates.html", title: "CSV/XLSX Templates" },
  { href: "tutorial.html", title: "From empty to routed" },
  { href: "AMPACITY_METHOD.html", title: "Ampacity Method" },
  { href: "geometry-fields.html", title: "Geometry Fields" },
  { href: "soil_resistivity.html", title: "Soil Resistivity" },
  { href: "math.html", title: "Math References" },
  { href: "standards.html", title: "Engineering References" },
  { href: "troubleshooting.html", title: "Troubleshooting" },
  { href: "tray_id_convention.html", title: "Tray ID Convention" }
];

document.addEventListener("DOMContentLoaded", () => {
  const last = document.getElementById("last-updated");
  if (last) {
    const date = new Date(document.lastModified);
    last.textContent = date.toLocaleDateString();
  }

  const nav = document.getElementById("doc-nav");
  if (nav) {
    DOC_PAGES.forEach((page) => {
      const link = document.createElement("a");
      link.href = page.href;
      link.textContent = page.title;
      if (location.pathname.endsWith(page.href)) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
      nav.appendChild(link);
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
