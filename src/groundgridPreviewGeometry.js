export function estimateRodLength({ hasRods, burialDepth, gridLx, gridLy }) {
  if (!hasRods) {
    return 0;
  }
  return Math.max(burialDepth * 2.5, burialDepth + (Math.max(gridLx, gridLy) * 0.03));
}

function normalizeRodSpacing(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function buildAxisIndices(count, targetSpacing, conductorSpacing) {
  const lastIndex = Math.max(0, count - 1);
  if (lastIndex <= 1) {
    return [0, lastIndex];
  }
  if (!Number.isFinite(targetSpacing) || targetSpacing <= 0 || conductorSpacing <= 0) {
    return [0, lastIndex];
  }
  const step = Math.max(1, Math.round(targetSpacing / conductorSpacing));
  const indices = new Set([0, lastIndex]);
  for (let index = step; index < lastIndex; index += step) {
    indices.add(index);
  }
  return [...indices].sort((a, b) => a - b);
}

function buildAllAxisIndices(count) {
  const lastIndex = Math.max(0, count - 1);
  const indices = [];
  for (let index = 0; index <= lastIndex; index += 1) {
    indices.push(index);
  }
  return indices;
}

export function deriveRodLayout({ hasRods, nx, ny, spacingX, spacingY, rodSpacingX, rodSpacingY }) {
  if (!hasRods) {
    return {
      points: [],
      count: 0,
      intermediateCount: 0,
      axisSpacingX: 0,
      axisSpacingY: 0,
    };
  }

  const hasInterstitialX = Number.isFinite(rodSpacingX) && rodSpacingX > 0;
  const hasInterstitialY = Number.isFinite(rodSpacingY) && rodSpacingY > 0;

  const xIndices = hasInterstitialX
    ? buildAxisIndices(ny, rodSpacingX, spacingX)
    : hasInterstitialY
      ? buildAllAxisIndices(ny)
      : buildAxisIndices(ny, rodSpacingX, spacingX);
  const yIndices = hasInterstitialY
    ? buildAxisIndices(nx, rodSpacingY, spacingY)
    : hasInterstitialX
      ? buildAllAxisIndices(nx)
      : buildAxisIndices(nx, rodSpacingY, spacingY);
  const points = [];
  const corners = new Set([
    '0:0',
    `0:${nx - 1}`,
    `${ny - 1}:0`,
    `${ny - 1}:${nx - 1}`,
  ]);

  for (const xIndex of xIndices) {
    for (const yIndex of yIndices) {
      points.push({ xIndex, yIndex, isCorner: corners.has(`${xIndex}:${yIndex}`) });
    }
  }

  return {
    points,
    count: points.length,
    intermediateCount: points.filter(point => !point.isCorner).length,
    axisSpacingX: xIndices.length > 1 ? (xIndices[1] - xIndices[0]) * spacingX : 0,
    axisSpacingY: yIndices.length > 1 ? (yIndices[1] - yIndices[0]) * spacingY : 0,
  };
}

export function normalizePreviewGeometry({
  gridLxInput,
  gridLyInput,
  burialDepthInput,
  hsInput,
  conductorInput,
  nxInput,
  nyInput,
  hasRods,
  rodSpacingXInput,
  rodSpacingYInput,
}) {
  const gridLx = Number.isFinite(gridLxInput) && gridLxInput > 0 ? gridLxInput : 1;
  const gridLy = Number.isFinite(gridLyInput) && gridLyInput > 0 ? gridLyInput : 1;
  const burialDepth = Number.isFinite(burialDepthInput) && burialDepthInput > 0 ? burialDepthInput : 1;
  const hs = Number.isFinite(hsInput) && hsInput > 0 ? hsInput : 0;
  const conductorDiameter = Number.isFinite(conductorInput) && conductorInput > 0 ? conductorInput : 0;
  const nx = Math.max(2, Number.isFinite(nxInput) ? nxInput : 2);
  const ny = Math.max(2, Number.isFinite(nyInput) ? nyInput : 2);
  const spacingX = ny > 1 ? gridLx / (ny - 1) : 0;
  const spacingY = nx > 1 ? gridLy / (nx - 1) : 0;
  const rodLength = estimateRodLength({ hasRods, burialDepth, gridLx, gridLy });
  const rodSpacingX = normalizeRodSpacing(rodSpacingXInput);
  const rodSpacingY = normalizeRodSpacing(rodSpacingYInput);
  const rodLayout = deriveRodLayout({ hasRods, nx, ny, spacingX, spacingY, rodSpacingX, rodSpacingY });

  return {
    gridLx,
    gridLy,
    burialDepth,
    hs,
    conductorDiameter,
    nx,
    ny,
    spacingX,
    spacingY,
    rodLength,
    rodSpacingX,
    rodSpacingY,
    rodLayout,
  };
}
