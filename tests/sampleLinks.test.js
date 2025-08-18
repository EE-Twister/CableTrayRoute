const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

describe('sample links', () => {
  it('use download and return HTTP 200', () => {
    const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
    htmlFiles.forEach(file => {
      const html = fs.readFileSync(file, 'utf8');
      const regex = /<a\s+[^>]*href=["'](examples\/[^"']+)["'][^>]*>/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const tag = match[0];
        const url = match[1];
        assert(/\bdownload\b/i.test(tag), `${file} link ${url} missing download attribute`);
        if (/^https?:\/\//i.test(url)) {
          try {
            const statusLine = execSync(`curl -sI ${url} | head -n 1`).toString();
            const m = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
            const status = m ? parseInt(m[1], 10) : 0;
            if (status !== 200) {
              console.error(`\x1b[31mFix-it Hint: ${url} returned ${status}\x1b[0m`);
              assert.fail(`Sample link ${url} returned HTTP ${status}`);
            }
          } catch (e) {
            console.error(`\x1b[31mFix-it Hint: ${url} unreachable\x1b[0m`);
            assert.fail(`Sample link ${url} unreachable`);
          }
        } else {
          const targetPath = path.join(path.dirname(file), url);
          if (!fs.existsSync(targetPath)) {
            console.error(`\x1b[31mFix-it Hint: Broken sample URL ${url}\x1b[0m`);
            assert.fail(`Sample link ${url} not found`);
          }
        }
      }
    });
  });
});
