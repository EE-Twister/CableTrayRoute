const assert = require("assert");

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

let activeEl = null;
function makeInput(value = "") {
  return {
    value,
    selectionStart: 0,
    selectionEnd: value.length,
    focus() {
      activeEl = this;
    },
    select() {
      this.selectionStart = 0;
      this.selectionEnd = this.value.length;
    },
    dispatchEvent(ev) {
      ev.target = this;
      if (this.onkeydown) this.onkeydown(ev);
      return !ev.defaultPrevented;
    },
  };
}

function makeCell(input) {
  return {
    previousElementSibling: null,
    nextElementSibling: null,
    querySelector() {
      return input;
    },
  };
}

function keyEvent(key) {
  return {
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    type: "keydown",
  };
}

function attach(el, td) {
  el.onkeydown = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const start = e.target.selectionStart ?? 0;
      const end = e.target.selectionEnd ?? 0;
      const len = (e.target.value || "").length;
      if (start === 0 && end === len) {
        e.preventDefault();
        const sib =
          e.key === "ArrowLeft"
            ? td.previousElementSibling
            : td.nextElementSibling;
        if (sib) {
          const next = sib.querySelector("input,select");
          if (next) {
            next.focus();
            if (typeof next.select === "function") next.select();
          }
        }
      }
    }
  };
}

describe("tableUtils arrow navigation", () => {
  it("ArrowRight moves to next cell when text selected", () => {
    const input1 = makeInput("one");
    const input2 = makeInput("two");
    const td1 = makeCell(input1);
    const td2 = makeCell(input2);
    td1.nextElementSibling = td2;
    td2.previousElementSibling = td1;
    attach(input1, td1);
    attach(input2, td2);
    input1.focus();
    input1.select();
    const ev = keyEvent("ArrowRight");
    const result = input1.dispatchEvent(ev);
    assert(!result);
    assert.strictEqual(activeEl, input2);
    assert.strictEqual(input2.selectionStart, 0);
    assert.strictEqual(input2.selectionEnd, input2.value.length);
  });

  it("ArrowLeft moves to previous cell when text selected", () => {
    const input1 = makeInput("one");
    const input2 = makeInput("two");
    const td1 = makeCell(input1);
    const td2 = makeCell(input2);
    td1.nextElementSibling = td2;
    td2.previousElementSibling = td1;
    attach(input1, td1);
    attach(input2, td2);
    input2.focus();
    input2.select();
    const ev = keyEvent("ArrowLeft");
    const result = input2.dispatchEvent(ev);
    assert(!result);
    assert.strictEqual(activeEl, input1);
    assert.strictEqual(input1.selectionStart, 0);
    assert.strictEqual(input1.selectionEnd, input1.value.length);
  });

  it("ArrowRight moves from empty cell", () => {
    const input1 = makeInput("");
    const input2 = makeInput("two");
    const td1 = makeCell(input1);
    const td2 = makeCell(input2);
    td1.nextElementSibling = td2;
    td2.previousElementSibling = td1;
    attach(input1, td1);
    attach(input2, td2);
    input1.focus();
    const ev = keyEvent("ArrowRight");
    const result = input1.dispatchEvent(ev);
    assert(!result);
    assert.strictEqual(activeEl, input2);
    assert.strictEqual(input2.selectionStart, 0);
    assert.strictEqual(input2.selectionEnd, input2.value.length);
  });
});
