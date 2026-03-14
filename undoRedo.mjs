/**
 * Simple command-pattern undo/redo manager.
 *
 * Usage:
 *   const mgr = new UndoRedoManager();
 *   mgr.push(
 *     () => restore(before),   // undo fn
 *     () => restore(after)     // redo fn
 *   );
 *   mgr.undo();
 *   mgr.redo();
 */
export class UndoRedoManager {
  constructor({ maxSize = 50, onUndo, onRedo } = {}) {
    this._undo = [];
    this._redo = [];
    this._maxSize = maxSize;
    this._onUndo = onUndo || null;
    this._onRedo = onRedo || null;
  }

  /**
   * Record a reversible action.
   * @param {() => void} undoFn  - function to call when undoing
   * @param {() => void} redoFn  - function to call when redoing
   * @param {string} [label]     - optional description (e.g. "Edit row")
   */
  push(undoFn, redoFn, label = '') {
    this._undo.push({ fn: undoFn, redoFn, label });
    if (this._undo.length > this._maxSize) this._undo.shift();
    this._redo = [];
  }

  undo() {
    const entry = this._undo.pop();
    if (!entry) return false;
    this._redo.push(entry);
    try { entry.fn(); } catch (e) { console.error('[undo] error', e); }
    if (this._onUndo) this._onUndo(entry.label);
    return true;
  }

  redo() {
    const entry = this._redo.pop();
    if (!entry) return false;
    this._undo.push(entry);
    try { entry.redoFn(); } catch (e) { console.error('[redo] error', e); }
    if (this._onRedo) this._onRedo(entry.label);
    return true;
  }

  canUndo() { return this._undo.length > 0; }
  canRedo() { return this._redo.length > 0; }

  clear() {
    this._undo = [];
    this._redo = [];
  }
}
