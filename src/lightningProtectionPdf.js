const METERS_TO_FEET = 3.280839895;
const SQUARE_METERS_TO_SQUARE_FEET = 10.763910417;
const SQUARE_KILOMETERS_PER_SQUARE_MILE = 2.58998811;

const PDF_COLORS = Object.freeze({
  navy: [17, 35, 63],
  blue: [18, 104, 216],
  cyan: [0, 157, 214],
  ink: [28, 39, 54],
  muted: [88, 103, 122],
  line: [209, 219, 231],
  soft: [244, 248, 252],
  safe: [23, 123, 82],
  safeSoft: [234, 248, 241],
  warning: [170, 101, 0],
  warningSoft: [255, 246, 225],
  danger: [183, 49, 57],
  dangerSoft: [253, 237, 239],
  white: [255, 255, 255],
});

let jsPdfPromise = null;

function normalizePdfText(value) {
  return String(value ?? '')
    .replace(/[–—−]/g, '-')
    .replace(/×/g, 'x')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/π/g, 'pi')
    .replace(/·/g, ' / ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/√/g, 'sqrt')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '');
}

function finite(value) {
  return Number.isFinite(value);
}

function fixed(value, digits = 1, fallback = '-') {
  return finite(value) ? Number(value).toFixed(digits) : fallback;
}

function exponential(value, digits = 2, fallback = '-') {
  return finite(value) ? Number(value).toExponential(digits) : fallback;
}

function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function reportUnits(unitSystem) {
  const imperial = unitSystem === 'imperial';
  return {
    imperial,
    length: imperial ? 'ft' : 'm',
    area: imperial ? 'ft^2' : 'm^2',
    density: imperial ? 'strike points/mi^2/yr' : 'strike points/km^2/yr',
    lengthValue: value => imperial ? value * METERS_TO_FEET : value,
    areaValue: value => imperial ? value * SQUARE_METERS_TO_SQUARE_FEET : value,
    densityValue: value => imperial ? value * SQUARE_KILOMETERS_PER_SQUARE_MILE : value,
  };
}

function measurementTextForUnits(value, units) {
  const text = String(value ?? '');
  if (!units.imperial) return text;
  return text
    .replace(/203 mm\s*\(8 in\)/gi, '8 in')
    .replace(/(-?\d+(?:\.\d+)?)\s*m\b/g, (_, raw) => {
      const feet = Number(raw) * METERS_TO_FEET;
      const digits = Math.abs(feet) >= 100 ? 1 : 2;
      return `${feet.toFixed(digits)} ft`;
    });
}

function row(label, value, note = '') {
  return {
    label: normalizePdfText(label),
    value: normalizePdfText(value),
    note: normalizePdfText(note),
  };
}

function buildDimensionRows(result, units) {
  const inputs = result.inputs || {};
  const rows = [
    row('Footprint shape', result.footprint?.label || titleCase(inputs.structureShape || 'rectangle')),
  ];
  if (inputs.structureShape === 'circle') {
    rows.push(row('Structure diameter', `${fixed(units.lengthValue(inputs.diameter), 2)} ${units.length}`));
  } else if (inputs.structureShape === 'custom') {
    rows.push(
      row('Entered footprint area', `${fixed(units.areaValue(inputs.footprintArea), 1)} ${units.area}`),
      row('Entered footprint perimeter', `${fixed(units.lengthValue(inputs.footprintPerimeter), 2)} ${units.length}`),
      row('Farthest protected point', `${fixed(units.lengthValue(inputs.farthestPointRadius), 2)} ${units.length}`),
    );
  } else {
    rows.push(
      row('Structure length', `${fixed(units.lengthValue(inputs.length), 2)} ${units.length}`),
      row('Structure width', `${fixed(units.lengthValue(inputs.width), 2)} ${units.length}`),
    );
  }
  rows.push(
    row('Structure height', `${fixed(units.lengthValue(inputs.height), 2)} ${units.length}`),
    row('Air-terminal tip elevation', `${fixed(units.lengthValue(inputs.airTerminalHeight), 2)} ${units.length}`),
    row('Protected equipment elevation', `${fixed(units.lengthValue(inputs.protectedHeight), 2)} ${units.length}`),
    row('Plan footprint area', `${fixed(units.areaValue(result.footprintAreaM2), 1)} ${units.area}`),
    row('Plan perimeter', `${fixed(units.lengthValue(result.perimeterM), 2)} ${units.length}`),
  );
  return rows;
}

function buildRiskRows(result, units) {
  const inputMode = finite(result.inputs?.groundFlashDensity)
    ? `Direct Ng input (${fixed(units.densityValue(result.inputs.groundFlashDensity), 3)})`
    : `Legacy thunderstorm-day estimate (${fixed(result.inputs?.thunderstormDays, 1)} days/yr)`;
  const returnPeriod = result.expectedStrikesPerYear > 0
    ? 1 / result.expectedStrikesPerYear
    : Infinity;
  return [
    row('Lightning density source', inputMode),
    row('Ground strike-point density', `${fixed(units.densityValue(result.groundFlashDensity), 3)} ${units.density}`),
    row('Location exposure', titleCase(result.inputs?.location || 'isolated'), `Cd = ${fixed(result.locationFactor, 2)}`),
    row('Equivalent collection area', `${fixed(units.areaValue(result.collectionAreaM2), 1)} ${units.area}`),
    row('Expected direct strikes, Nd', `${exponential(result.expectedStrikesPerYear, 3)} /yr`, finite(returnPeriod) ? `about 1 in ${fixed(returnPeriod, returnPeriod >= 10 ? 0 : 1)} years` : ''),
    row('Tolerable frequency, Nc', `${exponential(result.tolerableFrequency, 3)} /yr`),
    row('Risk ratio, Nd / Nc', `${fixed(result.expectedStrikesPerYear / result.tolerableFrequency, 2)}x`),
    row('Required interception efficiency', `${fixed((result.lpl?.efficiency || 0) * 100, 2)}%`),
  ];
}

function buildProtectionRows(result, units) {
  const isArray = result.protectionMethod === 'roof-array' && result.terminalArray;
  const radius = result.terminalProtectiveRadiusM ?? result.mastProtectiveRadiusM;
  const rows = [
    row('Recommended lightning protection level', result.lpl?.required ? `LPL ${result.lpl.level}` : 'Not indicated by screening'),
    row('Air-termination arrangement', isArray ? 'Roof air-terminal array' : 'Single centered mast'),
  ];
  if (isArray) {
    rows.push(
      row('Terminal grid', `${result.terminalArray.columns} columns x ${result.terminalArray.rows} rows`, `${result.terminalArray.terminals.length} point terminals`),
      row('Terminal edge setback', `${fixed(units.lengthValue(result.terminalArray.edgeSetbackM), 2)} ${units.length}`),
      row('Reference plane elevation', `${fixed(units.lengthValue(result.referencePlaneHeightM), 2)} ${units.length}`),
    );
  }
  if (result.lpl?.required) {
    rows.push(
      row('Rolling-sphere radius, R', `${fixed(units.lengthValue(result.rollingSphereRadius), 1)} ${units.length}`),
      row(isArray ? 'Per-terminal coverage radius' : 'Single-mast coverage radius', `${fixed(units.lengthValue(radius), 2)} ${units.length}`),
      row(isArray ? 'Worst point to nearest terminal' : 'Farthest point from centered mast', `${fixed(units.lengthValue(result.requiredCoverageRadiusM), 2)} ${units.length}`),
      row('Coverage margin', `${result.coverageMarginM >= 0 ? '+' : ''}${fixed(units.lengthValue(result.coverageMarginM), 2)} ${units.length}`, result.coverageComplete ? 'coverage check passes' : 'coverage shortfall'),
      row('Minimum captured stroke current', `${fixed(result.minStrikeCurrentKa, 1)} kA`),
      row('Minimum striking distance', `${fixed(units.lengthValue(result.minStrikeDistanceM), 2)} ${units.length}`),
      row('Down-conductor concept', `${result.downConductorCount} ${result.downConductorMaterial} conductors`, `independent of ${isArray ? `${result.terminalArray.terminals.length} air terminals` : 'the air-terminal count'}; minimum ${result.downConductorMinAreaMm2} mm^2`),
      row(
        'Down-conductor placement',
        result.downConductorLayout?.placementMethod || 'Distributed around the structure perimeter',
        finite(result.downConductorLayout?.achievedMaxSpacingM)
          ? `${fixed(units.lengthValue(result.downConductorLayout.achievedMaxSpacingM), 2)} ${units.length} achieved maximum spacing`
          : 'field-coordinate final routes',
      ),
      row(
        'Lightning-conductor bend reference',
        `${fixed(units.lengthValue(result.lightningConductorMinBendRadiusM || 0.2032), units.imperial ? 3 : 3)} ${units.length} minimum radius`,
        '8 in reference; no turn sharper than 90 degrees; verify the adopted standard and listed system',
      ),
    );
  } else {
    rows.push(
      row('Rolling-sphere geometry', 'Not generated'),
      row('Down-conductor layout', 'Not generated', 'bonding and surge protection still require review'),
    );
  }
  return rows;
}

function buildSurgeRows(result) {
  if (!result.arrester) {
    return [row('Surge-protection input', 'Not evaluated', 'enter a system voltage to screen the incoming-line path')];
  }
  if (!result.arrester.applicable) {
    return [
      row('System voltage', `${fixed(result.arrester.systemKvLL, 3)} kV line-to-line`),
      row('Grounding', titleCase(result.arrester.grounding)),
      row('Required workflow', 'Low-voltage SPD review', 'no medium-voltage arrester rating reported'),
    ];
  }
  return [
    row('System voltage', `${fixed(result.arrester.systemKvLL, 2)} kV line-to-line`),
    row('Grounding', titleCase(result.arrester.grounding)),
    row('Minimum MCOV', `${fixed(result.arrester.mcov, 2)} kV`),
    row('Required duty-cycle voltage', `${fixed(result.arrester.ratedRequired, 2)} kV`),
    row('Next standard duty-cycle rating', result.arrester.ratedStandard == null ? 'Manufacturer review' : `${fixed(result.arrester.ratedStandard, 0)} kV`),
  ];
}

function buildBomModel(result, units) {
  const bom = result.bom;
  if (!bom?.ready) return null;
  return {
    procurementReady: bom.procurementReady,
    assumptions: [
      `${fixed(bom.assumptions.conductorWastePercent, 0)}% conductor allowance`,
      `${fixed(units.lengthValue(bom.assumptions.roofSupportSpacingM), 2)} ${units.length} roof-support spacing`,
      `${fixed(units.lengthValue(bom.assumptions.downConductorSupportSpacingM), 2)} ${units.length} down-lead clip spacing`,
      `${fixed(units.lengthValue(bom.assumptions.downConductorRouteAllowanceM), 2)} ${units.length} extra route per down lead`,
      bom.assumptions.includePerimeterRing ? 'Roof perimeter ring included' : 'Roof perimeter ring excluded',
    ].map(normalizePdfText),
    rows: bom.rows.map(item => ({
      category: normalizePdfText(item.category),
      item: normalizePdfText(item.item),
      specification: normalizePdfText(item.specification),
      quantity: item.unit === 'm'
        ? `${fixed(units.lengthValue(item.quantity), 1)} ${units.length}`
        : `${Math.ceil(item.quantity)} ${item.unit}`,
      basis: normalizePdfText(item.basis),
    })),
    warnings: bom.warnings.map(item => normalizePdfText(measurementTextForUnits(item, units))),
    exclusions: bom.exclusions.map(item => normalizePdfText(measurementTextForUnits(item, units))),
  };
}

/**
 * Build the text model used by the PDF report. This is exported separately so
 * engineering values and unit conversions can be covered by Node tests.
 */
export function buildLightningProtectionReportModel(result, unitSystem = 'metric', generatedAt = new Date()) {
  if (!result || !result.inputs || !result.lpl) {
    throw new Error('A valid lightning-protection result is required for PDF export.');
  }
  const units = reportUnits(unitSystem);
  const compliance = result.designCompliance;
  const ratio = result.expectedStrikesPerYear / result.tolerableFrequency;
  const isArray = result.protectionMethod === 'roof-array' && result.terminalArray;
  const terminalCount = isArray ? result.terminalArray.terminals.length : 1;
  let status;
  if (!result.lpl.required) {
    status = {
      label: 'Below entered risk threshold',
      detail: 'A structural LPS is not indicated by this screening. Bonding and surge protection still require review.',
      tone: 'safe',
    };
  } else if (result.coverageComplete) {
    status = {
      label: 'Coverage check passes',
      detail: `${isArray ? 'The entered terminal array' : 'The centered mast'} reaches the complete evaluated reference plane.`,
      tone: 'safe',
    };
  } else {
    status = {
      label: 'Coverage shortfall',
      detail: `${isArray ? 'Add terminals, reduce spacing/setback, or increase terminal height.' : 'Use a taller mast or a multi-terminal arrangement.'}`,
      tone: 'danger',
    };
  }

  return {
    title: 'Lightning & Surge Protection Study',
    subtitle: 'Screening report with rolling-sphere coverage concept',
    generated: formatDate(generatedAt),
    unitSystem: units.imperial ? 'Imperial display units' : 'Metric display units',
    status,
    riskRatio: ratio,
    summary: [
      row('Required protection', result.lpl.required ? `LPL ${result.lpl.level}` : 'Not indicated', result.lpl.note),
      row('Air terminals', isArray ? `${terminalCount} point terminals` : '1 centered mast', isArray ? `${result.terminalArray.columns} x ${result.terminalArray.rows} regular roof grid` : 'single-point screening assumption'),
      row('Coverage result', !result.lpl.required ? 'Not generated' : result.coverageComplete ? 'PASS' : 'SHORTFALL', finite(result.coverageMarginM) ? `${result.coverageMarginM >= 0 ? '+' : ''}${fixed(units.lengthValue(result.coverageMarginM), 2)} ${units.length} margin` : ''),
      row('Expected strikes', `${exponential(result.expectedStrikesPerYear, 2)} /yr`, `${fixed(ratio, 2)}x entered tolerable frequency`),
    ],
    dimensions: buildDimensionRows(result, units),
    risk: buildRiskRows(result, units),
    protection: buildProtectionRows(result, units),
    surge: buildSurgeRows(result),
    bom: buildBomModel(result, units),
    warnings: [
      ...(result.warnings || []).map(item => measurementTextForUnits(item, units)),
      ...(compliance?.criteria || [])
        .filter(item => !item.pass)
        .map(item => `${item.label}: ${measurementTextForUnits(item.detail, units)}`),
    ].map(normalizePdfText),
    basis: [
      compliance?.standard === 'NFPA 780 / UL 96A design workflow'
        ? `${compliance.standard}: ${compliance.label}; ${compliance.componentClass} component basis.`
        : 'IEC 62305-1/-2/-3:2024 screening-level LPL selection and rolling-sphere geometry.',
      'IEEE Std 998-2026 electrogeometric rolling-sphere concepts.',
      'IEEE C62.22 and IEC 60099-5:2018 surge-arrester application screening above 1 kV.',
      ...(compliance?.assumptions || [])
        .map(item => `Required assumption: ${measurementTextForUnits(item, units)}`),
    ],
    limitations: [
      compliance?.designReady
        ? 'The calculable NFPA 780 / UL 96A design checks pass subject to every listed assumption; this report is not a UL certification or Master Label.'
        : compliance?.status === 'screening-only'
          ? 'This is a screening study, not a complete IEC 62305-2 risk assessment or issued-for-construction design.'
          : 'This study is not an issued-for-construction or certified lightning-protection design.',
      'The visual is a scaled plan/elevation concept. Verify final terminal coordinates, roof obstructions, conductive features, separation distance, bonding, and attachment details.',
      'Regular roof arrays are evaluated at the entered roof/equipment reference plane. Shield wires and irregular terminal coordinates require project-specific engineering.',
      'Confirm selected equipment ratings, temporary overvoltage duty, insulation coordination, and local code requirements.',
      ...(compliance?.exclusions || [])
        .map(item => `Excluded: ${measurementTextForUnits(item, units)}`),
    ],
  };
}

function ensureJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPdfPromise) {
    jsPdfPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lightning-jspdf]');
      const finish = () => {
        const JsPDF = window.jspdf?.jsPDF;
        if (typeof JsPDF === 'function') resolve(JsPDF);
        else reject(new Error('jsPDF did not initialize.'));
      };
      if (existing) {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', () => reject(new Error('Unable to load jsPDF.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'dist/vendor/jspdf.umd.min.js';
      script.dataset.lightningJspdf = 'true';
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => reject(new Error('Unable to load jsPDF.')), { once: true });
      document.head.appendChild(script);
    }).catch(error => {
      jsPdfPromise = null;
      throw error;
    });
  }
  return jsPdfPromise;
}

function copySvgComputedStyles(sourceSvg, clonedSvg) {
  const sourceElements = [sourceSvg, ...sourceSvg.querySelectorAll('*')];
  const clonedElements = [clonedSvg, ...clonedSvg.querySelectorAll('*')];
  const properties = [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-opacity',
    'opacity',
    'color',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'letter-spacing',
    'text-anchor',
    'dominant-baseline',
    'paint-order',
  ];
  sourceElements.forEach((source, index) => {
    const clone = clonedElements[index];
    if (!clone) return;
    const computed = window.getComputedStyle(source);
    properties.forEach(property => {
      const value = computed.getPropertyValue(property);
      if (value) clone.style.setProperty(property, value);
    });
  });
}

function svgSize(svg) {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox?.width > 0 && viewBox?.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }
  const width = Number.parseFloat(svg.getAttribute('width')) || svg.clientWidth || 760;
  const height = Number.parseFloat(svg.getAttribute('height')) || svg.clientHeight || 460;
  return { width, height };
}

function svgToPngDataUrl(svg) {
  if (!(svg instanceof SVGSVGElement)) {
    return Promise.reject(new Error('The lightning-protection visual is unavailable.'));
  }
  const sourceSize = svgSize(svg);
  const size = {
    width: sourceSize.width,
    height: Math.min(sourceSize.height, 414),
  };
  const clone = svg.cloneNode(true);
  copySvgComputedStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(size.width));
  clone.setAttribute('height', String(size.height));
  clone.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
  clone.style.overflow = 'hidden';
  clone.querySelectorAll('text[y]').forEach(text => {
    if (Number.parseFloat(text.getAttribute('y')) >= 420) text.remove();
  });
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', String(size.width));
  background.setAttribute('height', String(size.height));
  background.setAttribute('fill', '#ffffff');
  clone.insertBefore(background, clone.firstChild);

  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      try {
        const scale = Math.min(2.5, Math.max(1.5, window.devicePixelRatio || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(size.width * scale);
        canvas.height = Math.ceil(size.height * scale);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: size.width,
          height: size.height,
        });
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    }, { once: true });
    image.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to render the protection visual for the PDF.'));
    }, { once: true });
    image.src = url;
  });
}

function setTextColor(doc, color) {
  doc.setTextColor(...color);
}

function setFillColor(doc, color) {
  doc.setFillColor(...color);
}

function setDrawColor(doc, color) {
  doc.setDrawColor(...color);
}

function addHeader(doc, model, sectionTitle, options = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const compact = options.compact === true;
  setFillColor(doc, PDF_COLORS.navy);
  doc.rect(0, 0, pageWidth, 9, 'F');
  if (!compact) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    setTextColor(doc, PDF_COLORS.navy);
    doc.text(model.title, 32, 36);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setTextColor(doc, PDF_COLORS.muted);
  doc.text(`${sectionTitle}  |  ${model.unitSystem}`, 32, compact ? 36 : 52);
  doc.text(model.generated, pageWidth - 32, compact ? 36 : 52, { align: 'right' });
  setDrawColor(doc, PDF_COLORS.line);
  doc.line(32, 63, pageWidth - 32, 63);
  return 82;
}

function addFooter(doc, pageNumber, pageCount) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  setDrawColor(doc, PDF_COLORS.line);
  doc.line(32, pageHeight - 30, pageWidth - 32, pageHeight - 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setTextColor(doc, PDF_COLORS.muted);
  doc.text('CableTrayRoute - Lightning protection screening report', 32, pageHeight - 17);
  doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - 32, pageHeight - 17, { align: 'right' });
}

function drawSectionTitle(doc, title, x, y, width) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextColor(doc, PDF_COLORS.navy);
  doc.text(normalizePdfText(title).toUpperCase(), x, y);
  setDrawColor(doc, PDF_COLORS.blue);
  doc.setLineWidth(1.8);
  doc.line(x, y + 6, x + width, y + 6);
  doc.setLineWidth(0.2);
  return y + 18;
}

function drawSummaryCard(doc, item, x, y, width, height) {
  setFillColor(doc, PDF_COLORS.soft);
  setDrawColor(doc, PDF_COLORS.line);
  doc.roundedRect(x, y, width, height, 5, 5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setTextColor(doc, PDF_COLORS.muted);
  doc.text(item.label.toUpperCase(), x + 10, y + 14);
  doc.setFontSize(12);
  setTextColor(doc, PDF_COLORS.navy);
  const valueLines = doc.splitTextToSize(item.value, width - 20);
  doc.text(valueLines.slice(0, 2), x + 10, y + 31);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setTextColor(doc, PDF_COLORS.muted);
  const detailY = y + 31 + Math.min(valueLines.length, 2) * 11 + 3;
  doc.text(doc.splitTextToSize(item.note, width - 20).slice(0, 2), x + 10, detailY);
}

function drawStatusPanel(doc, model, x, y, width) {
  const palette = model.status.tone === 'safe'
    ? { fill: PDF_COLORS.safeSoft, accent: PDF_COLORS.safe }
    : { fill: PDF_COLORS.dangerSoft, accent: PDF_COLORS.danger };
  setFillColor(doc, palette.fill);
  setDrawColor(doc, palette.accent);
  doc.roundedRect(x, y, width, 64, 6, 6, 'FD');
  setFillColor(doc, palette.accent);
  doc.rect(x, y, 6, 64, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setTextColor(doc, palette.accent);
  doc.text(model.status.label, x + 18, y + 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setTextColor(doc, PDF_COLORS.ink);
  doc.text(doc.splitTextToSize(model.status.detail, width - 36), x + 18, y + 40);
}

function drawMetricTable(doc, title, rows, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 32;
  const gap = 12;
  const cellWidth = (pageWidth - margin * 2 - gap) / 2;
  let y = drawSectionTitle(doc, title, margin, startY, pageWidth - margin * 2);
  for (let index = 0; index < rows.length; index += 2) {
    const pair = rows.slice(index, index + 2);
    const measurements = pair.map(item => {
      const valueLines = doc.splitTextToSize(item.value, cellWidth - 16);
      const noteLines = item.note ? doc.splitTextToSize(item.note, cellWidth - 20) : [];
      return {
        item,
        valueLines,
        noteLines,
        height: Math.max(39, 24 + valueLines.length * 9 + noteLines.length * 7),
      };
    });
    const rowHeight = Math.max(...measurements.map(item => item.height));
    measurements.forEach((measurement, column) => {
      const x = margin + column * (cellWidth + gap);
      setFillColor(doc, index % 4 === 0 ? PDF_COLORS.soft : PDF_COLORS.white);
      setDrawColor(doc, PDF_COLORS.line);
      doc.roundedRect(x, y, cellWidth, rowHeight, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      setTextColor(doc, PDF_COLORS.muted);
      doc.text(measurement.item.label.toUpperCase(), x + 8, y + 12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      setTextColor(doc, PDF_COLORS.ink);
      doc.text(measurement.valueLines, x + 8, y + 27);
      if (measurement.noteLines.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        setTextColor(doc, PDF_COLORS.muted);
        doc.text(measurement.noteLines, x + 8, y + rowHeight - 6 - (measurement.noteLines.length - 1) * 7);
      }
    });
    y += rowHeight + 4;
  }
  return y + 8;
}

function drawBomTable(doc, model, startY) {
  const margin = 32;
  const widths = [72, 125, 185, 58, 288];
  const headers = ['Category', 'Material / item', 'Specification', 'Quantity', 'Quantity basis'];
  let y = drawSectionTitle(doc, 'Preliminary material takeoff', margin, startY, 728);
  const assumptionText = model.bom.assumptions.join('  |  ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  setTextColor(doc, PDF_COLORS.muted);
  doc.text(doc.splitTextToSize(assumptionText, 728).slice(0, 2), margin, y);
  y += 24;

  let x = margin;
  setFillColor(doc, PDF_COLORS.navy);
  doc.rect(margin, y, 728, 22, 'F');
  headers.forEach((header, index) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    setTextColor(doc, PDF_COLORS.white);
    doc.text(header.toUpperCase(), x + 5, y + 14);
    x += widths[index];
  });
  y += 22;

  model.bom.rows.forEach((item, rowIndex) => {
    const values = [item.category, item.item, item.specification, item.quantity, item.basis];
    const lines = values.map((value, index) => doc.splitTextToSize(value, widths[index] - 10).slice(0, 3));
    const rowHeight = Math.max(28, Math.max(...lines.map(value => value.length)) * 7 + 9);
    setFillColor(doc, rowIndex % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.soft);
    setDrawColor(doc, PDF_COLORS.line);
    doc.rect(margin, y, 728, rowHeight, 'FD');
    x = margin;
    values.forEach((value, index) => {
      doc.setFont('helvetica', index === 1 || index === 3 ? 'bold' : 'normal');
      doc.setFontSize(index === 3 ? 7 : 6.2);
      setTextColor(doc, index === 3 ? PDF_COLORS.blue : PDF_COLORS.ink);
      doc.text(lines[index], x + 5, y + 11);
      x += widths[index];
    });
    y += rowHeight;
  });

  const note = model.bom.procurementReady
    ? 'Coverage check passes. Verify final routes, listed components, compatible materials, and attachment details before procurement.'
    : 'COVERAGE INCOMPLETE: quantities describe the current concept and are not suitable for procurement.';
  setFillColor(doc, model.bom.procurementReady ? PDF_COLORS.safeSoft : PDF_COLORS.dangerSoft);
  setDrawColor(doc, model.bom.procurementReady ? PDF_COLORS.safe : PDF_COLORS.danger);
  doc.roundedRect(margin, y + 10, 728, 30, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  setTextColor(doc, model.bom.procurementReady ? PDF_COLORS.safe : PDF_COLORS.danger);
  doc.text(note, margin + 10, y + 28);
  return y + 48;
}

function drawBulletColumn(doc, title, items, x, startY, width, options = {}) {
  let y = drawSectionTitle(doc, title, x, startY, width);
  const fill = options.fill || PDF_COLORS.soft;
  const accent = options.accent || PDF_COLORS.blue;
  items.forEach((item, index) => {
    const lines = doc.splitTextToSize(normalizePdfText(item), width - 38);
    const height = Math.max(29, lines.length * 8 + 13);
    setFillColor(doc, fill);
    setDrawColor(doc, PDF_COLORS.line);
    doc.roundedRect(x, y, width, height, 4, 4, 'FD');
    setFillColor(doc, accent);
    doc.circle(x + 13, y + 13, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setTextColor(doc, PDF_COLORS.white);
    doc.text(String(index + 1), x + 13, y + 15.4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextColor(doc, PDF_COLORS.ink);
    doc.text(lines, x + 27, y + 12);
    y += height + 5;
  });
  return y + 6;
}

function sanitizeFileName(value) {
  const safe = String(value || 'lightning-protection-report')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return safe || 'lightning-protection-report';
}

/**
 * Build the complete report and return its PDF bytes without triggering a
 * download. Keeping creation separate makes browser download and QA reusable.
 */
export async function createLightningProtectionPdf({
  result,
  svgElement,
  unitSystem = 'metric',
  generatedAt = new Date(),
} = {}) {
  const model = buildLightningProtectionReportModel(result, unitSystem, generatedAt);
  const [JsPDF, visual] = await Promise.all([
    ensureJsPdf(),
    svgToPngDataUrl(svgElement),
  ]);
  const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;

  const pageSections = [
    'Protection concept and decision summary',
    'Study inputs and calculated risk',
    'Protection and surge design values',
    ...(model.bom ? ['Grid protection bill of materials'] : []),
    'Design checks, basis, and limitations',
  ];
  let y = addHeader(doc, model, pageSections[0]);
  y = drawSectionTitle(doc, 'Scaled rolling-sphere protection concept', margin, y, 500);
  const visualWidth = 500;
  const visualHeight = Math.min(302, visualWidth * visual.height / visual.width);
  setFillColor(doc, PDF_COLORS.white);
  setDrawColor(doc, PDF_COLORS.line);
  doc.roundedRect(margin, y, visualWidth, visualHeight, 6, 6, 'FD');
  doc.addImage(visual.dataUrl, 'PNG', margin + 5, y + 5, visualWidth - 10, visualHeight - 10, undefined, 'FAST');

  const summaryX = margin + visualWidth + 18;
  const summaryWidth = pageWidth - summaryX - margin;
  let summaryY = y;
  model.summary.forEach(item => {
    drawSummaryCard(doc, item, summaryX, summaryY, summaryWidth, 68);
    summaryY += 74;
  });

  const statusY = Math.max(y + visualHeight + 18, summaryY + 2);
  drawStatusPanel(doc, model, margin, statusY, pageWidth - margin * 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setTextColor(doc, PDF_COLORS.muted);
  doc.text('The graphic is exported from the current live plan/elevation view and uses equal horizontal/vertical scale within each view.', margin, Math.min(pageHeight - 40, statusY + 78));

  doc.addPage('letter', 'landscape');
  y = addHeader(doc, model, pageSections[1], { compact: true });
  y = drawMetricTable(doc, 'Structure and study inputs', model.dimensions, y);
  drawMetricTable(doc, 'Lightning exposure and risk', model.risk, y);

  doc.addPage('letter', 'landscape');
  y = addHeader(doc, model, pageSections[2], { compact: true });
  y = drawMetricTable(doc, 'Air termination, rolling sphere, and down path', model.protection, y);
  drawMetricTable(doc, 'Surge-protection screening', model.surge, y);

  if (model.bom) {
    doc.addPage('letter', 'landscape');
    y = addHeader(doc, model, 'Grid protection bill of materials', { compact: true });
    drawBomTable(doc, model, y);
  }

  doc.addPage('letter', 'landscape');
  y = addHeader(doc, model, 'Design checks, basis, and limitations', { compact: true });
  const warningItems = model.warnings.length ? model.warnings : ['No calculation warnings were reported.'];
  const bulletGap = 16;
  const bulletWidth = (pageWidth - margin * 2 - bulletGap) / 2;
  drawBulletColumn(doc, 'Design checks and warnings', warningItems, margin, y, bulletWidth, {
    fill: model.warnings.length ? PDF_COLORS.warningSoft : PDF_COLORS.safeSoft,
    accent: model.warnings.length ? PDF_COLORS.warning : PDF_COLORS.safe,
  });
  const rightY = drawBulletColumn(doc, 'Study basis', model.basis, margin + bulletWidth + bulletGap, y, bulletWidth, {
    fill: PDF_COLORS.soft,
    accent: PDF_COLORS.blue,
  });
  drawBulletColumn(doc, 'Engineering use and limitations', model.limitations, margin + bulletWidth + bulletGap, rightY, bulletWidth, {
    fill: PDF_COLORS.soft,
    accent: PDF_COLORS.navy,
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    addFooter(doc, pageNumber, pageCount);
  }

  const dateStamp = generatedAt instanceof Date && !Number.isNaN(generatedAt.getTime())
    ? generatedAt.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return {
    bytes: doc.output('arraybuffer'),
    filename: `${sanitizeFileName(`lightning-protection-report-${dateStamp}`)}.pdf`,
    pageCount,
    model,
  };
}

export async function downloadLightningProtectionPdf(options = {}) {
  const report = await createLightningProtectionPdf(options);
  const blob = new Blob([report.bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = report.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return report;
}
