// Load the arc flash label template without using Node's fs module.

let template = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect width="200" height="100" fill="#ffffff" stroke="#000"/>
  <text x="10" y="20" font-size="12">Equipment: {{equipment}}</text>
  <text x="10" y="40" font-size="12">Incident Energy: {{incidentEnergy}}</text>
  <text x="10" y="60" font-size="12">Boundary: {{boundary}}</text>
</svg>`;

try {
  const p = new URL('./templates/arcflashLabel.svg', import.meta.url);
  const res = await fetch(p);
  if (res.ok) {
    template = await res.text();
  }
} catch {}

export function generateArcFlashLabel(data = {}) {
  let svg = template;
  Object.entries(data).forEach(([k, v]) => {
    const re = new RegExp(`{{${k}}}`, 'g');
    svg = svg.replace(re, v ?? '');
  });
  return svg;
}
