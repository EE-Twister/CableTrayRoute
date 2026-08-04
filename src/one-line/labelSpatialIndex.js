export function createBoxSpatialIndex(boxes = [], cellSize = 200) {
  const cells = new Map();
  const normalizedCellSize = Math.max(1, Number(cellSize) || 200);
  const visitCells = (box, padding, visitor) => {
    const minX = Math.floor((box.left - padding) / normalizedCellSize);
    const maxX = Math.floor((box.right + padding) / normalizedCellSize);
    const minY = Math.floor((box.top - padding) / normalizedCellSize);
    const maxY = Math.floor((box.bottom + padding) / normalizedCellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) visitor(`${x}:${y}`);
    }
  };
  const add = box => {
    if (!box) return;
    visitCells(box, 0, key => {
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(box);
    });
  };
  const hasOverlap = (box, overlaps, padding = 0) => {
    const candidates = new Set();
    visitCells(box, padding, key => {
      (cells.get(key) || []).forEach(candidate => candidates.add(candidate));
    });
    for (const candidate of candidates) {
      if (overlaps(box, candidate)) return true;
    }
    return false;
  };
  boxes.forEach(add);
  return { add, hasOverlap };
}
