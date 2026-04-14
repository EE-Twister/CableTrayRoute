export function estimateRodLength({ hasRods, burialDepth, gridLx, gridLy }) {
  if (!hasRods) {
    return 0;
  }
  return Math.max(burialDepth * 2.5, burialDepth + (Math.max(gridLx, gridLy) * 0.03));
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
  };
}
