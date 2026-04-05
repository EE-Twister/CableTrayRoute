const assert = require('assert');
const fs = require('fs');
const path = require('path');

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const root = path.resolve(__dirname, '..');

describe('page navigation', () => {
  ['library.html', 'account.html'].forEach(file => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    it(`${file} contains top-nav element`, () => {
      assert.ok(
        html.includes('class="top-nav"') || html.includes("class='top-nav'"),
        `${file} missing element with class="top-nav"`
      );
    });
    it(`${file} contains nav-links container`, () => {
      assert.ok(
        html.includes('id="nav-links"') || html.includes("id='nav-links'"),
        `${file} missing element with id="nav-links"`
      );
    });
  });

  it('library.html imports navigation.js', () => {
    const html = fs.readFileSync(path.join(root, 'library.html'), 'utf8');
    assert.ok(html.includes('navigation.js'), 'library.html missing navigation.js import');
  });

  it('account.js imports navigation.js', () => {
    const src = fs.readFileSync(path.join(root, 'account.js'), 'utf8');
    assert.ok(src.includes('navigation.js'), 'account.js missing navigation.js import');
  });
});
