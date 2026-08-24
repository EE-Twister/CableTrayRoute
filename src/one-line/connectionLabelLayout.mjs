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

export function resolveRenderedConnectionLabelCollisions({
  connectionLabels = [],
  obstacleLabels = [],
  padding = 2,
  offsets = symmetricOffsets()
} = {}) {
  const obstacleBoxes = obstacleLabels
    .map(label => label.getBoundingClientRect())
    .filter(box => box.width > 0 && box.height > 0);
  const settledBoxes = [];

  connectionLabels.forEach(label => {
    const initialY = Number(label.getAttribute('y'));
    if (!Number.isFinite(initialY)) return;

    for (const offset of offsets) {
      label.setAttribute('y', initialY + offset);
      const box = label.getBoundingClientRect();
      const blocked = [...obstacleBoxes, ...settledBoxes]
        .some(existing => boxesOverlap(box, existing, padding));
      if (blocked) continue;
      settledBoxes.push(box);
      return;
    }

    label.setAttribute('y', initialY);
    settledBoxes.push(label.getBoundingClientRect());
  });
}
