function defaultClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDiagramHistoryController({
  captureSnapshot,
  applySnapshot,
  onPush = () => {},
  onRestore = () => {},
  clone = defaultClone
}) {
  if (typeof captureSnapshot !== 'function') throw new TypeError('captureSnapshot must be provided');
  if (typeof applySnapshot !== 'function') throw new TypeError('applySnapshot must be provided');

  let snapshots = [];
  let index = -1;
  const capture = () => clone(captureSnapshot());
  const restoreAt = (nextIndex, action, reason, metadata = {}) => {
    if (nextIndex < 0 || nextIndex >= snapshots.length) return false;
    index = nextIndex;
    applySnapshot(clone(snapshots[index]));
    onRestore({ action, reason, index, metadata });
    return true;
  };

  return {
    get index() {
      return index;
    },
    get length() {
      return snapshots.length;
    },
    get canUndo() {
      return index > 0;
    },
    get canRedo() {
      return index >= 0 && index < snapshots.length - 1;
    },
    reset(snapshot = captureSnapshot()) {
      snapshots = [clone(snapshot)];
      index = 0;
      return index;
    },
    push(reason = 'Diagram updated') {
      snapshots = snapshots.slice(0, index + 1);
      snapshots.push(capture());
      index = snapshots.length - 1;
      onPush({ reason, index, length: snapshots.length });
      return index;
    },
    undo(reason = 'Undo applied') {
      return restoreAt(index - 1, 'undo', reason);
    },
    redo(reason = 'Redo applied') {
      return restoreAt(index + 1, 'redo', reason);
    },
    restore(nextIndex, { action = 'restore', reason = 'History state restored', metadata = {} } = {}) {
      return restoreAt(nextIndex, action, reason, metadata);
    },
    replaceCurrent(snapshot = captureSnapshot()) {
      if (index < 0 || index >= snapshots.length) return false;
      snapshots[index] = clone(snapshot);
      return true;
    }
  };
}
