export function boxesOverlap(a, b, padding = 0) {
  return !(
    a.right + padding <= b.left
    || a.left - padding >= b.right
    || a.bottom + padding <= b.top
    || a.top - padding >= b.bottom
  );
}

export function symmetricOffsets(step = 18, maximum = 360) {
  const offsets = [0];
  for (let distance = step; distance <= maximum; distance += step) {
    offsets.push(-distance, distance);
  }
  return offsets;
}

const INDEX_CELL_SIZE = 128;
const INDEX_MAX_CELLS_PER_BOX = 400;

// Uniform grid so a candidate box is only compared with nearby boxes instead of
// every label already placed.
function createBoxIndex(cellSize = INDEX_CELL_SIZE) {
  const cells = new Map();
  const loose = [];
  const span = (box, padding) => ({
    x0: Math.floor((box.left - padding) / cellSize),
    x1: Math.floor((box.right + padding) / cellSize),
    y0: Math.floor((box.top - padding) / cellSize),
    y1: Math.floor((box.bottom + padding) / cellSize)
  });
  const isIndexable = s => [s.x0, s.x1, s.y0, s.y1].every(Number.isFinite)
    && (s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1) <= INDEX_MAX_CELLS_PER_BOX;

  return {
    add(box) {
      const s = span(box, 0);
      if (!isIndexable(s)) {
        loose.push(box);
        return;
      }
      for (let x = s.x0; x <= s.x1; x += 1) {
        for (let y = s.y0; y <= s.y1; y += 1) {
          const key = `${x},${y}`;
          const bucket = cells.get(key);
          if (bucket) bucket.push(box);
          else cells.set(key, [box]);
        }
      }
    },
    overlaps(box, padding) {
      if (loose.some(existing => boxesOverlap(box, existing, padding))) return true;
      const s = span(box, padding);
      if (!isIndexable(s)) {
        for (const bucket of cells.values()) {
          if (bucket.some(existing => boxesOverlap(box, existing, padding))) return true;
        }
        return false;
      }
      for (let x = s.x0; x <= s.x1; x += 1) {
        for (let y = s.y0; y <= s.y1; y += 1) {
          const bucket = cells.get(`${x},${y}`);
          if (bucket && bucket.some(existing => boxesOverlap(box, existing, padding))) return true;
        }
      }
      return false;
    }
  };
}

function shiftBox(box, dx, dy) {
  return {
    left: box.left + dx,
    right: box.right + dx,
    top: box.top + dy,
    bottom: box.bottom + dy,
    width: box.width,
    height: box.height
  };
}

// Screen-pixel movement caused by changing a label's y attribute by one user unit.
// Returns null when the element cannot report its screen matrix.
function verticalScreenShift(label) {
  const matrix = typeof label.getScreenCTM === 'function' ? label.getScreenCTM() : null;
  if (!matrix || !Number.isFinite(matrix.c) || !Number.isFinite(matrix.d)) return null;
  return { x: matrix.c, y: matrix.d };
}

export function resolveRenderedConnectionLabelCollisions({
  connectionLabels = [],
  obstacleLabels = [],
  padding = 2,
  offsets = symmetricOffsets()
} = {}) {
  const index = createBoxIndex();
  obstacleLabels
    .map(label => label.getBoundingClientRect())
    .filter(box => box.width > 0 && box.height > 0)
    .forEach(box => index.add(box));

  connectionLabels.forEach(label => {
    const initialY = Number(label.getAttribute('y'));
    if (!Number.isFinite(initialY)) return;

    const initialBox = label.getBoundingClientRect();
    const shift = verticalScreenShift(label);

    if (shift) {
      // Every candidate position is the measured box translated by the offset, so the
      // attribute is written once instead of forcing a layout per candidate.
      for (const offset of offsets) {
        const box = offset === 0 ? initialBox : shiftBox(initialBox, shift.x * offset, shift.y * offset);
        if (index.overlaps(box, padding)) continue;
        if (offset !== 0) label.setAttribute('y', initialY + offset);
        index.add(box);
        return;
      }
      index.add(initialBox);
      return;
    }

    for (const offset of offsets) {
      label.setAttribute('y', initialY + offset);
      const box = label.getBoundingClientRect();
      if (index.overlaps(box, padding)) continue;
      index.add(box);
      return;
    }

    label.setAttribute('y', initialY);
    index.add(label.getBoundingClientRect());
  });
}
