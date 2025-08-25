const assert = require("assert");
const { createDirtyTracker } = require("../dirtyTracker");

function describe(name, fn) {
  console.log(name);
  fn();
}
function it(name, fn) {
  try {
    fn();
    console.log("  \u2713", name);
  } catch (err) {
    console.error("  \u2717", name, err.message || err);
    process.exitCode = 1;
  }
}

function makeWindow() {
  let handler = null;
  return {
    addEventListener(type, fn) {
      if (type === "beforeunload") handler = fn;
    },
    removeEventListener(type, fn) {
      if (type === "beforeunload" && handler === fn) handler = null;
    },
    fire() {
      const e = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        returnValue: undefined,
      };
      if (handler) handler(e);
      return e;
    },
  };
}

describe("dirty state tracker", () => {
  it("no edits -> no prompt", () => {
    const win = makeWindow();
    createDirtyTracker(win); // no edits
    const e = win.fire();
    assert.strictEqual(e.defaultPrevented, false);
  });

  it("edit a cell -> prompt", () => {
    const win = makeWindow();
    const tracker = createDirtyTracker(win);
    tracker.markDirty();
    const e = win.fire();
    assert.strictEqual(e.defaultPrevented, true);
  });

  it("Save -> no prompt", () => {
    const win = makeWindow();
    const tracker = createDirtyTracker(win);
    tracker.markDirty();
    tracker.markClean();
    const e = win.fire();
    assert.strictEqual(e.defaultPrevented, false);
  });
});
