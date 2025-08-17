function createDirtyTracker(win = (typeof window !== 'undefined' ? window : undefined)) {
  if (!win) throw new Error('Window object required');
  let dirty = false;
  const handler = e => {
    e.preventDefault();
    e.returnValue = '';
  };
  const update = () => {
    if (dirty) {
      win.addEventListener('beforeunload', handler);
    } else {
      win.removeEventListener('beforeunload', handler);
    }
  };
  return {
    markDirty() { if (!dirty) { dirty = true; update(); } },
    markClean() { if (dirty) { dirty = false; update(); } },
    isDirty() { return dirty; }
  };
}
if (typeof module !== 'undefined') module.exports = { createDirtyTracker };
if (typeof window !== 'undefined') window.createDirtyTracker = createDirtyTracker;
